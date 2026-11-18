# -*- coding: utf-8 -*-
"""从「现存的存活链接」把文件取下来，传进迅雷云盘，补一条迅雷分享

和另外两个脚本的分工：
  · xunlei_backfill.py  迅雷云端**已经有**同名文件 → 直接建分享（不下载）
  · 本脚本              迅雷云端**没有**文件 → 从站上登记的存活链接取回文件，传上去再分享

取文件的来源优先级（按"能否稳定拿到原文件"排）：
  百度分享   verify 提取码 → 转存到自己的 /汉化补丁补档 → filemetas 拿 dlink 直连下载
  夸克分享   转存 → 下载（需浏览器直链，较慢，仅作兜底）

上传走 xunlei.upload_file()：POST /drive/v1/files 拿阿里云 STS → PUT 到 OSS 临时位。
传完立刻建分享并核验 share_status，成功的写进 data/netdisk-reshare.json 的 links.xunlei。

用法：
  python scripts/netdisk/xunlei_fetchfill.py --dry            # 只出计划
  python scripts/netdisk/xunlei_fetchfill.py --limit 1        # 先跑 1 个验证
  python scripts/netdisk/xunlei_fetchfill.py --only 可怕的怪物  # 点名跑
  python scripts/netdisk/xunlei_fetchfill.py                  # 全量
  python scripts/netdisk/xunlei_fetchfill.py --keep-local     # 保留下载的临时文件
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import time
import urllib.parse

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, '..', '..'))
WORK = os.path.normpath(os.path.join(REPO, '..'))
sys.path.insert(0, HERE)

import reshare as R  # noqa: E402
import xunlei as XL   # noqa: E402

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

LINKS = R.LINKS
OUT = R.OUT
STATE = os.path.join(WORK, 'xunlei-fetchfill.json')
POOL = os.path.join(WORK, 'fetchfill-pool.json')
CACHE = os.path.join(WORK, 'fetchfill-cache')
# 人工登记的本地文件（作品名 -> 绝对路径）。网盘都下不动时，本机有副本就直接传。
LOCALFILES = os.path.join(REPO, 'data', 'netdisk-localfiles.json')
BILI_UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
           '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36')
BD_DIR = '/汉化补丁补档'
XL_DIR = '汉化补丁补档'
MAX_FILE = 3 << 30          # 单个文件上限 3 GB
MAX_TOTAL = 4 << 30         # 单部作品总量上限 4 GB
MAX_FILES = 8


def log(*a):
    print(*a, flush=True)


def load(p, default):
    if not os.path.exists(p):
        return default
    try:
        return json.load(open(p, encoding='utf-8'))
    except Exception:
        return default


def save_state(st):
    st['updated_at'] = time.strftime('%Y-%m-%d %H:%M')
    json.dump(st, open(STATE, 'w', encoding='utf-8', newline='\n'),
              ensure_ascii=False, indent=1)


def safe_name(s, n=60):
    return ''.join(ch for ch in (s or '') if ch not in '\\/:*?"<>|').strip()[:n]


# ---------------- 迅雷目录 ----------------
def ensure_dir(xs):
    """根目录下的「汉化补丁补档」文件夹 id，没有就建一个（重复上传不再散在根目录）"""
    items, _ = XL.list_files(xs, '')
    for it in items:
        if it.get('name') == XL_DIR and (it.get('kind') == 'drive#folder'):
            return it['id']
    j = xs.api('POST', '/drive/v1/files', body={
        'kind': 'drive#folder', 'name': XL_DIR, 'parent_id': '',
        'space': '',
    }, action='post:/drive/v1/files')
    fid = ((j.get('file') or {}).get('id')
           or (j.get('data') or {}).get('file', {}).get('id') or '')
    if not fid:
        raise RuntimeError('建迅雷目录失败：%s' % str(j)[:160])
    return fid


# ---------------- 百度分享 ----------------
def baidu_open(url, pwd):
    """打开一个百度分享：校验提取码，返回 (session, surl, sekey, shareid, uk, root_items)"""
    m = re.search(r'pan\.baidu\.com/s/([A-Za-z0-9_\-]+)', url or '')
    if not m:
        raise RuntimeError('不是百度分享链接')
    short = m.group(1)
    surl = short[1:] if short.startswith('1') else short
    q = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
    pwd = pwd or (q.get('pwd') or [''])[0]
    b = R.baidu_session()
    if b is None:
        raise RuntimeError('百度未登录（客户端 cookie 读不到）')
    s = requests.Session()
    s.headers.update({'User-Agent': BILI_UA, 'Cookie': b.headers.get('Cookie', '')})
    s.get('https://pan.baidu.com/s/' + short, timeout=30)
    v = s.post('https://pan.baidu.com/share/verify',
               params={'surl': surl, 't': str(int(time.time() * 1000)),
                       'channel': 'chunlei', 'web': '1', 'app_id': '250528',
                       'clienttype': '0'},
               data={'pwd': pwd, 'vcode': '', 'vcode_str': ''},
               headers={'Referer': 'https://pan.baidu.com/s/' + short,
                        'X-Requested-With': 'XMLHttpRequest'}, timeout=30).json()
    if v.get('errno') != 0:
        raise RuntimeError('提取码校验失败 errno=%s %s' % (v.get('errno'), v.get('show_msg') or ''))
    sk = urllib.parse.unquote(v.get('randsk') or '')
    s.cookies.set('BDCLND', sk, domain='.baidu.com')
    s.cookies.set('BDCLND', sk, domain='pan.baidu.com')
    lj = s.get('https://pan.baidu.com/share/list',
               params={'shorturl': surl, 'root': '1', 'web': '1', 'app_id': '250528',
                       'channel': 'chunlei', 'clienttype': '0', 'page': '1',
                       'num': '100', 'dir': '/', 'sekey': sk},
               headers={'Referer': 'https://pan.baidu.com/s/' + short}, timeout=30).json()
    if lj.get('errno') != 0:
        raise RuntimeError('分享列表失败 errno=%s %s' % (lj.get('errno'), lj.get('show_msg') or ''))
    return s, surl, sk, lj.get('share_id'), lj.get('uk'), (lj.get('list') or []), b, short


def bd_walk(s, surl, sekey, start='/', limit=500):
    """递归遍历分享里的文件（不转存、不占空间）

    UP 主的分享常常是「/游戏/个人汉化」这种大合集夹，
    所以必须先看清楚里面有什么，再决定转存哪一个，绝不能整夹搬。
    """
    out, queue, seen = [], [(start, True)], 0
    while queue and seen < limit:
        d, is_root = queue.pop(0)
        page = 1
        while True:
            params = {'shorturl': surl, 'dir': d, 'web': '1', 'app_id': '250528',
                      'channel': 'chunlei', 'clienttype': '0',
                      'page': str(page), 'num': '100', 'sekey': sekey}
            # 分享根目录必须带 root=1，子目录反而不能带，否则一律返回「链接出错」
            if is_root:
                params['root'] = '1'
            j = s.get('https://pan.baidu.com/share/list', params=params,
                      headers={'Referer': 'https://pan.baidu.com/'}, timeout=30).json()
            if j.get('errno') != 0:
                if is_root:
                    raise RuntimeError('分享列表失败 errno=%s' % j.get('errno'))
                break
            lst = j.get('list') or []
            for it in lst:
                seen += 1
                if str(it.get('isdir')) == '1':
                    queue.append((it.get('path') or '', False))
                else:
                    out.append({'name': it.get('server_filename') or '',
                                'fs_id': it.get('fs_id'),
                                'size': int(it.get('size') or 0),
                                'path': it.get('path') or ''})
            if len(lst) < 100 or seen >= limit:
                break
            page += 1
    return out


def pick_match(game, files):
    """在分享里挑出属于这部作品的文件：先按名字相似度，挑不到就返回空"""
    if not files:
        return None, []
    scored = sorted(((R.score(game, f['name']), f) for f in files),
                    key=lambda x: -x[0])
    best, top = scored[0]
    if best >= 0.55:
        return top, [(round(s, 2), f['name']) for s, f in scored[:3]]
    return None, [(round(s, 2), f['name']) for s, f in scored[:3]]


def bd_mkdir(b, path):
    """逐级建目录，返回真实路径

    注意百度 /api/create 的坑：目标目录已存在时**不报 errno -8**，
    而是默默建一个「名字_20261119_055857」的新目录，返回的 path 才是真实路径。
    所以必须先 ls 判断，再拿返回值当真实路径用，否则 transfer 会报「转存路径不存在」。
    """
    cur = ''
    for name in [x for x in path.split('/') if x]:
        parent = cur or '/'
        exists = any(x['isdir'] and x['server_filename'] == name
                     for x in R.baidu_ls(b, parent))
        if exists:
            cur = cur + '/' + name
            continue
        r = b.post('https://pan.baidu.com/api/create',
                   params={'a': 'commit', 'channel': 'chunlei', 'web': '1',
                           'app_id': '250528', 'clienttype': '0',
                           'bdstoken': getattr(b, 'bdstoken', '')},
                   data={'path': (cur + '/' + name), 'isdir': '1', 'block_list': '[]',
                         'size': '', 'autoinit': '1'},
                   headers={'Referer': 'https://pan.baidu.com/disk/main'}, timeout=30).json()
        if r.get('errno') != 0:
            raise RuntimeError('建百度目录失败 errno=%s %s'
                               % (r.get('errno'), r.get('show_msg') or ''))
        cur = r.get('path') or (cur + '/' + name)
        time.sleep(1.2)   # 新目录要过一会儿才对转存接口可见
    return cur or '/'


def bd_transfer(s, b, shareid, uk, sekey, fsid, dst):
    """转存到自己的网盘

    刚建出来的目录要过一两秒才在转存接口那边可见，否则报「转存路径不存在」，
    所以 errno=2 一律退避重试，不能当成真失败。
    """
    last = ''
    for i in range(4):
        r = s.post('https://pan.baidu.com/share/transfer',
                   params={'shareid': shareid, 'from': uk, 'sekey': sekey,
                           'channel': 'chunlei', 'web': '1', 'app_id': '250528',
                           'clienttype': '0', 'bdstoken': getattr(b, 'bdstoken', '')},
                   data={'fsidlist': '[%s]' % fsid, 'path': dst},
                   headers={'Referer': 'https://pan.baidu.com/'}, timeout=60).json()
        if r.get('errno') in (0, 4):   # 4 = 文件已转存（同名已在目录里，直接接着用）
            return r
        last = 'errno=%s %s' % (r.get('errno'), r.get('show_msg') or '')
        if r.get('errno') not in (2, -3):     # 只有「路径没就绪」「系统繁忙」值得重试
            break
        time.sleep(2 + i)
    raise RuntimeError('转存失败 %s' % last)


def bd_download(b, fsid, dst):
    j = b.get('https://pan.baidu.com/api/filemetas',
              params={'method': 'filemetas', 'dlink': '1', 'fsids': '[%s]' % fsid,
                      'clienttype': '0', 'app_id': '250528', 'web': '1',
                      'channel': 'chunlei'}, timeout=40).json()
    info = (j.get('info') or [{}])[0]
    dlink = info.get('dlink')
    if not dlink:
        raise RuntimeError('拿不到 dlink（errno=%s）' % j.get('errno'))
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with b.get(dlink, headers={'User-Agent': 'pan.baidu.com'}, stream=True,
               timeout=(30, 600)) as r:
        r.raise_for_status()
        with open(dst, 'wb') as f:
            for chunk in r.iter_content(1 << 20):
                f.write(chunk)
    return os.path.getsize(dst)


def bd_delete(b, paths):
    if not paths:
        return
    try:
        b.post('https://pan.baidu.com/api/filemanager',
               params={'opera': 'delete', 'async': '2', 'onnest': 'fail',
                       'channel': 'chunlei', 'web': '1', 'app_id': '250528',
                       'clienttype': '0', 'bdstoken': getattr(b, 'bdstoken', '')},
               data={'filelist': json.dumps([{'path': p} for p in paths])},
               headers={'Referer': 'https://pan.baidu.com/disk/main'}, timeout=40)
    except Exception:
        pass


class NeedPick(RuntimeError):
    """分享里找不到这部作品对应文件，需要人挑"""

    def __init__(self, cands):
        self.cands = cands
        super().__init__('分享里没找到对应文件（候选 %s）'
                         % '、'.join(n for _, n in cands[:3]))


def harvest(args):
    """把所有待补作品的百度分享遍历一遍，汇总成一个「文件池」

    为什么要有池：UP 主的链接常互相指错（Cold Front 的链接指着 Dead Plate 的分享），
    但文件本身都在某个合集里。先把所有分享的文件摸清，再按名字挑，
    比「一条链接只认它自己的分享」可靠得多。
    """
    led = load(LINKS, {'games': []})
    rs = load(OUT, {'meta': {}, 'games': {}})
    pool = load(POOL, {'at': '', 'shares': {}, 'files': []})
    have = {(f.get('share'), f.get('fs_id')) for f in (pool.get('files') or [])}
    n_new = 0
    for g in led.get('games') or []:
        name = g.get('name') or ''
        if not name or (args.only and args.only not in name):
            continue
        if alive_xunlei(g, rs):
            continue
        for ln in (g.get('links') or []):
            if ln.get('platform') != 'baidu' or ln.get('status') != 'ok' or not ln.get('url'):
                continue
            try:
                s, surl, sk, shareid, uk, items, b, short = baidu_open(ln['url'], ln.get('pwd'))
                files = bd_walk(s, surl, sk, limit=800)
            except Exception as e:
                log('  ! %s %s：%s' % (name, ln['url'], str(e)[:90]))
                continue
            key = short
            pool.setdefault('shares', {})[key] = {
                'surl': surl, 'sekey': sk, 'shareid': shareid, 'uk': uk,
                'url': ln['url'], 'pwd': ln.get('pwd') or '',
                'files': len(files), 'at': time.strftime('%Y-%m-%d %H:%M')}
            for f in files:
                if (key, f['fs_id']) in have:
                    continue
                have.add((key, f['fs_id']))
                pool.setdefault('files', []).append({
                    'name': f['name'], 'fs_id': f['fs_id'], 'size': f['size'],
                    'share': key})
                n_new += 1
            log('  · %s ← %s：%d 个文件' % (name, short, len(files)))
            break     # 每个作品先只用第一条百度链接，剩下的靠池子互补
    pool['at'] = time.strftime('%Y-%m-%d %H:%M')
    json.dump(pool, open(POOL, 'w', encoding='utf-8', newline='\n'),
              ensure_ascii=False, indent=1)
    log('文件池：%d 个分享 / %d 个文件（新增 %d）'
        % (len(pool.get('shares') or {}), len(pool.get('files') or []), n_new))
    return 0


def pool_pick(game, pool):
    """在文件池里给这部作品找文件：人工映射表优先，其次名字相似度"""
    files = pool.get('files') or []
    alias = fetch_alias().get(game) or ''
    if alias:
        na = R.norm(alias)
        hits = [f for f in files if na and na in R.norm(f['name'])]
        if hits:
            return max(hits, key=lambda f: f['size']), []
    scored = sorted(((R.score(game, f['name']), f) for f in files), key=lambda x: -x[0])
    top3 = [(round(s, 2), f['name']) for s, f in scored[:3]]
    if scored and scored[0][0] >= 0.55:
        return scored[0][1], top3
    return None, top3


def session_from_share(share):
    """用池里存的 sekey 重建一个能转存的分享会话"""
    b = R.baidu_session()
    if b is None:
        raise RuntimeError('百度未登录')
    s = requests.Session()
    s.headers.update({'User-Agent': BILI_UA, 'Cookie': b.headers.get('Cookie', '')})
    sk = share.get('sekey') or ''
    s.cookies.set('BDCLND', sk, domain='.baidu.com')
    s.cookies.set('BDCLND', sk, domain='pan.baidu.com')
    return s, b


def fetch_alias():
    d = load(os.path.join(REPO, 'data', 'netdisk-fetchalias.json'), {'map': {}})
    return d.get('map') or {}


def bd_pick_links(game, url, pwd, pool=None):
    """百度源：挑出这部作品的文件并取回，返回 [(本地路径, 原文件名)]

    为什么不能「整夹转存」：UP 主的分享多是 `/游戏/个人汉化` 这种总夹，
    里面几十个作品几十 GB，整夹搬既占空间又必然传错作品。
    所以先只读遍历（不占空间），挑中一个文件再单独转存到 `_tmp/<作品名>/`，
    下载完就删。文件池里有更合适的候选时优先用池（链接经常指错分享）。
    """
    target, top3, share = None, [], None
    if pool:
        target, top3 = pool_pick(game, pool)
        if target:
            share = (pool.get('shares') or {}).get(target.get('share'))
            if not share:
                target = None
    alias = fetch_alias().get(game) or ''
    if target is None:
        s, surl, sk, shareid, uk, items, b, short = baidu_open(url, pwd)
        files = bd_walk(s, surl, sk, limit=800)
        if not files:
            raise RuntimeError('分享里没有文件')
        if len(files) <= 3:
            # 小分享：这就是这部作品自己的分享（常见是「完整版 + 补丁」两件套）。
            # 绝不能按作品名硬碰文件名——作者常拿日文原名当文件名
            # （ツギハギの幸福 → tsugihagi1.03），中文名根本对不上。
            small = [f for f in files if '补丁' in f['name']] or files
            target = max(small, key=lambda f: f['size']) if len(small) > 1 else small[0]
        if target is None and alias:
            na = R.norm(alias)
            hits = [f for f in files if na and na in R.norm(f['name'])]
            if hits:
                target = max(hits, key=lambda f: f['size'])
        if target is None:
            target, top3 = pick_match(game, files)
        share = {'surl': surl, 'sekey': sk, 'shareid': shareid, 'uk': uk}
    if target is None:
        raise NeedPick(top3)

    if target['size'] > MAX_FILE:
        raise RuntimeError('文件过大 %s' % fmt(target['size']))

    s, b = session_from_share(share)
    bd_mkdir(b, BD_DIR)
    dst_dir = bd_mkdir(b, BD_DIR + '/_tmp/' + safe_name(game))
    hit = None
    for it in R.baidu_ls(b, dst_dir):
        if not it['isdir'] and it['server_filename'] == target['name']:
            hit = it
    if hit is None:
        bd_transfer(s, b, share['shareid'], share['uk'], share['sekey'],
                    target['fs_id'], dst_dir)
        for _ in range(5):
            time.sleep(1.5)
            for it in R.baidu_ls(b, dst_dir):
                if not it['isdir'] and it['server_filename'] == target['name']:
                    hit = it
            if hit:
                break
            # 同名文件被加 (1)(2) 时按前缀认
            cand = [it for it in R.baidu_ls(b, dst_dir)
                    if not it['isdir'] and it['server_filename'].startswith(
                        os.path.splitext(target['name'])[0][:20])]
            if cand:
                hit = max(cand, key=lambda x: int(x.get('size') or 0))
                break
    if hit is None:
        raise RuntimeError('转存后没找到 %s' % target['name'])

    local = os.path.join(CACHE, safe_name(hit['server_filename'], 80))
    log('    ↓ %s（%s）' % (hit['server_filename'], fmt(int(hit.get('size') or 0))))
    bd_download(b, hit['fs_id'], local)
    bd_delete(b, [dst_dir + '/' + hit['server_filename']])
    return [(local, hit['server_filename'])]


def probe(args):
    """只读遍历所有待补作品的分享，把候选文件名存下来供人挑"""
    led = load(LINKS, {'games': []})
    rs = load(OUT, {'meta': {}, 'games': {}})
    out = load(os.path.join(WORK, 'fetchfill-candidates.json'), {'games': {}})
    order = {'baidu': 0, 'quark': 1, '123pan': 2, 'lanzou': 3, 'ctfile': 4, 'weiyun': 5}
    n = 0
    for g in led.get('games') or []:
        name = g.get('name') or ''
        if not name or (args.only and args.only not in name):
            continue
        if alive_xunlei(g, rs):
            continue
        srcs = [x for x in (g.get('links') or []) if x.get('status') == 'ok' and x.get('url')]
        if not srcs:
            continue
        srcs.sort(key=lambda x: order.get(x.get('platform'), 9))
        src = srcs[0]
        row = {'platform': src.get('platform'), 'url': src.get('url')}
        if src.get('platform') == 'baidu':
            try:
                s, surl, sk = baidu_open(src['url'], src.get('pwd'))[:3]
                files = bd_walk(s, surl, sk, limit=600)
                row['files'] = [{'name': f['name'], 'size': f['size'],
                                 'score': round(R.score(name, f['name']), 3),
                                 'fs_id': f['fs_id']} for f in files]
                row['files'].sort(key=lambda x: -x['score'])
                row['files'] = row['files'][:8]
                row['total_files'] = len(files)
            except Exception as e:
                row['error'] = '%s: %s' % (type(e).__name__, str(e)[:120])
        out.setdefault('games', {})[name] = row
        n += 1
        log('  · %s → %d 个文件 %s' % (name, len(row.get('files') or []),
                                      row.get('error') or ''))
        json.dump(out, open(os.path.join(WORK, 'fetchfill-candidates.json'), 'w',
                            encoding='utf-8', newline='\n'),
                  ensure_ascii=False, indent=1)
    log('已写 %d 个作品的候选 -> work/fetchfill-candidates.json' % n)
    return 0


def fmt(n):
    n = int(n or 0)
    for u in ('B', 'KB', 'MB', 'GB'):
        if n < 1024 or u == 'GB':
            return '%.1f%s' % (n, u) if u != 'B' else '%d%s' % (n, u)
        n /= 1024.0
    return str(n)


# ---------------- 主流程 ----------------
def alive_xunlei(led_game, rs):
    for L in (led_game.get('links') or []):
        if L.get('platform') == 'xunlei' and L.get('status') != 'dead':
            return True
    v = ((rs.get('games') or {}).get(led_game.get('name') or '') or {}).get('links', {}).get('xunlei') or {}
    return bool(v.get('url')) and v.get('checked') != 'dead'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry', action='store_true')
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--only', default='')
    ap.add_argument('--keep-local', action='store_true')
    ap.add_argument('--force', action='store_true', help='已有迅雷链接也重做')
    ap.add_argument('--probe', action='store_true', help='只读遍历分享，列出候选文件名')
    ap.add_argument('--harvest', action='store_true', help='把所有分享的文件汇总成文件池')
    args = ap.parse_args()

    if args.probe:
        return probe(args)
    if args.harvest:
        return harvest(args)

    xs = XL.session()
    if xs is None:
        log('迅雷未登录，先跑 xunlei_weblogin.py')
        return 2

    led = load(LINKS, {'games': []})
    rs = load(OUT, {'meta': {}, 'games': {}})
    st = load(STATE, {'games': {}})
    pool = load(POOL, None)
    local_map = (load(LOCALFILES, {}) or {}).get('map') or {}

    todo = []
    for g in led.get('games') or []:
        name = g.get('name') or ''
        if not name or (args.only and args.only not in name):
            continue
        if alive_xunlei(g, rs) and not args.force:
            continue
        srcs = [x for x in (g.get('links') or []) if x.get('status') == 'ok' and x.get('url')]
        if not srcs:
            # 站上没登记任何存活链接，但文件池里或许有（从别人的合集分享里摸到的）
            if pool and pool_pick(name, pool)[0]:
                todo.append((name, {'platform': 'pool', 'url': '', 'pwd': ''}, []))
            else:
                st.setdefault('games', {}).setdefault(name, {})['state'] = 'no_alive_source'
            continue
        # 百度优先：提取码校验 + 转存 + 直连下载这条链已经实测稳定
        order = {'baidu': 0, 'quark': 1, '123pan': 2, 'lanzou': 3, 'ctfile': 4, 'weiyun': 5}
        srcs.sort(key=lambda x: order.get(x.get('platform'), 9))
        src = srcs[0]
        # 本机已有成品包 → 直接用，不必跟各网盘的反爬/限速较劲
        lf = (local_map or {}).get(name)
        if lf and os.path.isfile(lf):
            src = {'platform': 'local', 'url': lf, 'pwd': ''}
        # 没有百度源、而文件池里已经躺着这部作品的文件时，直接拿池里的。
        # 对蓝奏/城通这类限速严重的盘没必要为了「同源」去硬下载。
        elif src.get('platform') != 'baidu' and pool and pool_pick(name, pool)[0]:
            src = {'platform': 'pool', 'url': '', 'pwd': ''}
        todo.append((name, src, srcs))

    log('待补 %d 个（有存活来源）' % len(todo))
    for name, src, _ in todo:
        log('  · %s ← %s' % (name, src.get('platform')))
    if args.dry:
        return 0
    if args.limit:
        todo = todo[:args.limit]

    parent = ensure_dir(xs)
    log('迅雷目录 id=%s' % parent)
    if pool:
        log('文件池：%d 个分享 / %d 个文件'
            % (len(pool.get('shares') or {}), len(pool.get('files') or [])))

    ok = 0
    for name, src, allsrc in todo:
        log('\n=== %s（源 %s）' % (name, src.get('platform')))
        row = st.setdefault('games', {}).setdefault(name, {})
        row.update({'tried_at': time.strftime('%Y-%m-%d %H:%M'),
                    'source': {k: src.get(k) for k in ('platform', 'url', 'pwd')}})
        if src.get('platform') not in ('baidu', 'pool', 'local'):
            row['state'] = 'unsupported_source'
            row['note'] = ('当前只实现了百度源的取文件（该链接在 %s）'
                           '；也可在 data/netdisk-localfiles.json 登记本机成品包' % src.get('platform'))
            save_state(st)
            log('  ! 暂不支持从 %s 取文件，跳过' % src.get('platform'))
            continue
        try:
            if src.get('platform') == 'local':
                p = src['url']
                local = [(p, os.path.basename(p))]
                log('    · 用本机文件 %s（%s）' % (os.path.basename(p), fmt(os.path.getsize(p))))
            else:
                local = bd_pick_links(name, src.get('url'), src.get('pwd'), pool)
        except NeedPick as e:
            row['state'] = 'need_pick'
            row['note'] = str(e)[:200]
            row['cands'] = e.cands
            save_state(st)
            log('  ? 需要挑文件：%s' % row['note'])
            continue
        except Exception as e:
            row['state'] = 'fetch_failed'
            row['note'] = '%s: %s' % (type(e).__name__, str(e)[:180])
            save_state(st)
            log('  ✗ 取文件失败：%s' % row['note'])
            continue

        ids, uploaded = [], []
        try:
            for path, orig in local:
                ext = os.path.splitext(path)[1] or '.zip'
                upname = safe_name(name) + ' 汉化补丁' + ext if len(local) == 1 else orig
                upname = safe_name(upname, 80)
                log('    ↑ 上传 %s（%s）' % (upname, fmt(os.path.getsize(path))))
                r = XL.upload_file(xs, path, parent_id=parent, name=upname)
                ids.append(r['id'])
                uploaded.append({'id': r['id'], 'name': upname, 'size': r['size']})
            for fid in ids:
                XL.wait_ready(xs, fid, timeout=60)
        except Exception as e:
            row['state'] = 'upload_failed'
            row['note'] = '%s: %s' % (type(e).__name__, str(e)[:180])
            row['uploaded'] = uploaded
            save_state(st)
            log('  ✗ 上传失败：%s' % row['note'])
            continue

        try:
            got = XL.create_share(xs, ids, name)
            stt, txt = XL.get_share(xs, got['share_id'], got.get('pwd') or '')
        except Exception as e:
            row['state'] = 'share_failed'
            row['note'] = '%s: %s' % (type(e).__name__, str(e)[:180])
            save_state(st)
            log('  ✗ 建分享失败：%s' % row['note'])
            continue

        url = got['url']
        if got.get('pwd') and 'pwd=' not in url:
            url += ('&' if '?' in url else '?') + 'pwd=' + got['pwd']
        alive = stt == 'OK'
        entry = {'url': url, 'pwd': got.get('pwd') or '', 'platform': 'xunlei',
                 'share_id': got.get('share_id') or '', 'verified': alive,
                 'check': 'share_status=%s %s' % (stt, txt),
                 'path': '/%s/%s' % (XL_DIR, uploaded[0]['name'] if uploaded else name),
                 'created_at': time.strftime('%Y-%m-%d %H:%M'),
                 'checked': 'ok' if alive else 'dead',
                 'checked_at': time.strftime('%Y-%m-%d %H:%M'),
                 'via': 'fetchfill', 'size': uploaded[0]['size'] if uploaded else 0,
                 'note': '从现存链接取回后上传迅雷（%s）' % src.get('platform')}
        row.update({'state': 'done' if alive else 'share_dead', 'uploaded': uploaded,
                    'link': entry})
        save_state(st)
        if alive:
            g = rs.setdefault('games', {}).setdefault(name, {})
            g.setdefault('bvid', '')
            g.setdefault('bili_url', '')
            g.setdefault('links', {})['xunlei'] = entry
            json.dump(rs, open(OUT, 'w', encoding='utf-8', newline='\n'),
                      ensure_ascii=False, indent=1)
            ok += 1
        log('  %s %s pwd=%s %s' % ('✓' if alive else '✗', url, got.get('pwd'), stt))

        if not args.keep_local:
            for path, _ in local:
                try:
                    os.remove(path)
                except Exception:
                    pass
        time.sleep(1.0)

    save_state(st)
    log('\n完成：补上 %d 条迅雷链接' % ok)
    return 0


if __name__ == '__main__':
    sys.exit(main())

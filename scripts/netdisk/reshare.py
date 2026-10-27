# -*- coding: utf-8 -*-
"""网盘补档引擎：云端索引 -> 与失效链接做名称匹配 -> 重新建分享

前提（三件事都要成立，缺哪件就报哪件）：
  1. 能拿到该平台的登录态（cookie）
     · 夸克：夸克网盘客户端在跑，读 %APPDATA%\\quark-cloud-drive\\Network\\Cookies
       （要 __puus；客户端未登录时拿不到）
     · 百度：百度网盘客户端在跑，读 %APPDATA%\\baidunetdisk\\Network\\Cookies
       （客户端 cookie 才拿得到 bdstoken，浏览器 cookie 会 errno -6）
  2. 云端还留着那份文件（分享过期 ≠ 文件被删；被删的补不了）
  3. 名称能对上（云端目录名和站上汉化名经常不一致，靠归一化+相似度兜）

用法：
  python scripts/netdisk/reshare.py index          # 建云端索引 -> work/cloud-index.json
  python scripts/netdisk/reshare.py plan           # 只出匹配计划，不动云端
  python scripts/netdisk/reshare.py run --dry      # 演练建分享（不真发请求）
  python scripts/netdisk/reshare.py run            # 真的建分享
"""
from __future__ import annotations

import argparse
import difflib
import json
import os
import re
import sys
import time
import unicodedata

import requests

BASE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(BASE, '..', '..'))
WORK = os.path.normpath(os.path.join(REPO, '..'))
sys.path.insert(0, BASE)
import browser_cookies as bc  # noqa: E402

LINKS = os.path.join(REPO, 'data', 'netdisk-links.json')
INDEX = os.path.join(WORK, 'cloud-index.json')
PLAN = os.path.join(WORK, 'reshare-plan.json')
OUT = os.path.join(REPO, 'data', 'netdisk-reshare.json')
ALIASES = os.path.join(REPO, 'data', 'netdisk-aliases.json')

QUARK_PROFILES = [
    os.path.join(os.environ.get('APPDATA', ''), 'quark-cloud-drive'),
    os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Quark', 'User Data'),
]
BAIDU_PROFILES = [
    os.path.join(os.environ.get('APPDATA', ''), 'baidunetdisk'),
]
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36')


# ---------------- 会话 ----------------
def quark_session():
    for p in QUARK_PROFILES:
        if not os.path.isdir(p):
            continue
        ck = bc.read_cookies(p, '')
        d = {c['name']: c['value'] for c in ck if c['host'].lstrip('.').endswith('quark.cn')}
        if '__puus' in d:
            s = requests.Session()
            s.headers.update({'Cookie': '; '.join(f'{k}={v}' for k, v in d.items()),
                              'User-Agent': UA, 'Referer': 'https://pan.quark.cn/',
                              'Accept': 'application/json, text/plain, */*'})
            return s
    return None


def baidu_session():
    for p in BAIDU_PROFILES:
        if not os.path.isdir(p):
            continue
        ck = bc.read_cookies(p, '')
        hdr = bc.cookie_header(bc.match(ck, 'pan.baidu.com'))
        if 'BDUSS' not in hdr:
            continue
        s = requests.Session()
        s.headers.update({'Cookie': hdr, 'User-Agent': 'netdisk;7.0.0;PC;PC-Windows;10.0.19045',
                          'Referer': 'https://pan.baidu.com/disk/main'})
        j = s.get('https://pan.baidu.com/api/gettemplatevariable?clienttype=0&app_id=250528'
                  '&web=1&fields=%5B%22bdstoken%22%5D', timeout=25).json()
        res = j.get('result')
        tok = ''
        if isinstance(res, dict):
            tok = res.get('bdstoken') or ''
        elif isinstance(res, list) and res and isinstance(res[0], dict):
            tok = res[0].get('bdstoken') or ''
        if not tok and isinstance(j.get('result'), dict):
            tok = j['result'].get('bdstoken', '')
        if tok:
            s.bdstoken = tok
            return s
    return None


# ---------------- 索引 ----------------
def quark_ls(s, fid='0'):
    out, page = [], 1
    while True:
        r = s.get('https://drive-pc.quark.cn/1/clouddrive/file/sort', params={
            'pr': 'ucpro', 'fr': 'pc', 'pdir_fid': fid, '_page': str(page), '_size': '100',
            '_fetch_total': '1', '_sort': 'file_type:asc,file_name:asc'}, timeout=30)
        j = r.json()
        if j.get('code') != 0:
            break
        lst = (j.get('data') or {}).get('list') or []
        out += lst
        total = (j.get('metadata') or {}).get('_total') or 0
        if len(out) >= total or not lst:
            break
        page += 1
        time.sleep(0.2)
    return out


def quark_index(s, maxdir=600):
    s2 = s or None
    items, queue, seen = [], [('0', '')], 0
    while queue and seen < maxdir:
        fid, path = queue.pop(0)
        seen += 1
        for it in quark_ls(s, fid):
            p = path + '/' + it['file_name']
            items.append({'fid': it['fid'], 'name': it['file_name'], 'dir': bool(it.get('dir')),
                          'path': p, 'size': it.get('size') or 0,
                          'updated': it.get('updated_at') or 0})
            if it.get('dir'):
                queue.append((it['fid'], p))
        print(f'  夸克 {seen} 个目录，累计 {len(items)} 项', flush=True)
    return items


def baidu_ls(s, path):
    out, page = [], 1
    while True:
        j = s.get('https://pan.baidu.com/api/list', params={
            'dir': path, 'num': '100', 'page': str(page), 'web': '1', 'order': 'name'},
            timeout=30).json()
        if j.get('errno') != 0:
            break
        lst = j.get('list') or []
        out += lst
        if len(lst) < 100:
            break
        page += 1
        time.sleep(0.2)
    return out


def baidu_index(s, maxdir=600):
    items, queue, seen = [], [('/')], 0
    while queue and seen < maxdir:
        path = queue.pop(0)
        seen += 1
        for it in baidu_ls(s, path):
            p = path.rstrip('/') + '/' + it['server_filename']
            items.append({'fs_id': it['fs_id'], 'name': it['server_filename'],
                          'dir': bool(it['isdir']), 'path': p, 'size': it.get('size') or 0,
                          'updated': it.get('server_mtime') or 0})
            if it['isdir']:
                queue.append(p)
        print(f'  百度 {seen} 个目录，累计 {len(items)} 项', flush=True)
    return items


# ---------------- 匹配 ----------------
def norm(s):
    s = unicodedata.normalize('NFKC', s or '').lower()
    s = re.sub(r'[\s\u3000\-_·・,，。.。!！?？()（）\[\]【】《》「」〜~:：;；\'"“”‘’/\\|+&]', '', s)
    return s


def aliases(name):
    """站上的名字常常很长，真正的作品名可能只在括号里或波浪号后面。
    「对，现在骂人是犯规……惩罚之吻……要来咯（笑）」的云端叫「惩罚之吻 汉化补丁」，
    所以要把括号内容、按分隔符切出来的片段都当候选。"""
    out = {name}
    for m in re.finditer(r'[（(【「]([^）)】」]{2,40})[）)】」]', name):
        out.add(m.group(1))
    for part in re.split(r'[~〜·・，,。!！?？…\s]+', name):
        p = part.strip()
        if len(p) >= 3:
            out.add(p)
    # 去掉「汉化」「补丁」这类噪音后再留一份
    for x in list(out):
        y = re.sub(r'(汉化|补丁|机翻|完整版|重制版)$', '', x).strip()
        if len(y) >= 3:
            out.add(y)
    return [x for x in out if len(norm(x)) >= 3]


CLOUD_NOISE = re.compile(
    r'(\.zip|\.rar|\.7z|\.tar|\.exe|\.apk|\.txt|'
    r'by青灯不弈|by青灯|青灯不弈|汉化魔改补丁|机翻润色补丁|汉化完整版|汉化版|完整版|'
    r'汉化备份|汉化补丁|机翻补丁|翻译补丁|润色补丁|补丁|汉化|机翻|润色|'
    r'补档版|补档|分卷版|全部一起解压|v?\d+\.\d+)', re.I)


def clean_cloud(name):
    """云端文件名 = 作品名 + 汉化补丁 + by作者 + 版本号，先把这些尾巴剃掉再比"""
    s = CLOUD_NOISE.sub(' ', name or '')
    return s


_ALIAS_MAP = None


def alias_map():
    """人工确认过的「站上名 → 云端真名」映射，读一次缓存住"""
    global _ALIAS_MAP
    if _ALIAS_MAP is None:
        _ALIAS_MAP = {}
        try:
            with open(ALIASES, encoding='utf-8') as f:
                d = json.load(f)
            for k, v in (d.get('map') or {}).items():
                _ALIAS_MAP[k] = ({'target': v, 'aliases': []} if isinstance(v, str)
                                 else v)
        except Exception:
            _ALIAS_MAP = {}
    return _ALIAS_MAP


def _target_score(b, want):
    """云端名就是人工指定的那个 → 满分；带 (1)/(2) 编号的变体也算"""
    b, want = (b or '').strip(), (want or '').strip()
    if not want:
        return 0.0
    if b == want:
        return 1.0
    if norm(b) == norm(want):
        return 0.98
    # 云端存了同名副本时会带 (1)(2)，剥掉编号再比
    if norm(want) and re.sub(r'[(（]\d+[)）]', '', norm(b)) == norm(want):
        return 0.96
    return 0.0


def _raw_score(a, b, conf):
    """纯字符串相似度的部分：别名池里取最高分"""
    nb = norm(clean_cloud(b))
    if not nb:
        return 0.0
    best = 0.0
    pool = aliases(a)
    if conf:
        pool = pool + list(conf.get('aliases') or [])
    for al in pool:
        na = norm(al)
        if not na:
            continue
        if na == nb:
            return 1.0
        if na in nb or nb in na:
            short, long_ = min(len(na), len(nb)), max(len(na), len(nb))
            sc = 0.78 + 0.22 * short / long_
            if short / long_ < 0.6:
                sc -= 0.15
        else:
            sc = difflib.SequenceMatcher(None, na, nb).ratio() * 0.95
        best = max(best, sc)
    return best


# 人工指名过、但云端名对不上的同族变体，分再高也只能到这儿。
# 必须低于 AUTO_SCORE，否则「汉化备份」「.7z」「别的角色版」会跟正主并列满分。
SIBLING_CAP = 0.75


def score(a, b):
    """a=站上汉化名, b=云端名字；取所有别名里的最高分

    人工拍过板的先按指名道姓算。「梦之门」在云端有四个同族文件（本体/冬弥雪版/
    备份/v1.1），把「汉化补丁」「v1.1」这些尾巴清洗掉后长得一模一样，
    纯相似度必然并列满分、挑错人，所以显式 target 命中才给高分，
    其余同族一律压到自动阈值以下。
    """
    conf = alias_map().get(a)
    if conf:
        ts = _target_score(b, conf.get('target'))
        if ts:
            return ts
        return min(SIBLING_CAP, _raw_score(a, b, conf))
    return _raw_score(a, b, None)


def pick(game, items, plat):
    best, bs = None, 0.0
    for it in items:
        if not it['dir']:  # 补丁多是文件夹；文件也能分享，但优先目录
            sc = score(game, it['name']) * 0.85
        else:
            sc = score(game, it['name'])
        # 违规文件是「下载→改装→重传」来的，云端会同时留着原件和（补档版）；
        # 原件建分享仍然是 errno=109，必须让补档版优先。
        if '补档' in it['name']:
            sc = min(1.0, sc + 0.3)
        if sc > bs:
            best, bs = it, sc
    return best, bs


def load_links():
    L = json.load(open(LINKS, encoding='utf-8'))
    dead = {}
    for g in L['games']:
        for ln in g.get('links') or []:
            st = (ln.get('status') or ln.get('ok'))
            is_dead = (ln.get('dead') is True) or (st in ('dead', False, 'fail'))
            if not is_dead:
                continue
            dead.setdefault(g['name'], {'bvid': g.get('bvid'), 'bili_url': g.get('bili_url'),
                                        'video_title': g.get('video_title'),
                                        'pubdate': g.get('pubdate'), 'links': []})
            dead[g['name']]['links'].append({'platform': ln.get('platform'), 'url': ln.get('url'),
                                             'pwd': ln.get('pwd')})
    return dead


def cmd_index():
    idx = {}
    qs = quark_session()
    print('夸克会话', 'OK' if qs else '不可用')
    if qs:
        idx['quark'] = quark_index(qs)
    bs = baidu_session()
    print('百度会话', 'OK' if bs else '不可用')
    if bs:
        idx['baidu'] = baidu_index(bs)
    json.dump(idx, open(INDEX, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    for k, v in idx.items():
        print(f'{k}: {len(v)} 项 -> {INDEX}')


def cmd_plan():
    idx = json.load(open(INDEX, encoding='utf-8'))
    dead = load_links()
    plan, miss = {}, []
    claims = {}  # 云端项 -> (游戏名, 分数)，一个资源只能给一个游戏

    for name, info in dead.items():
        row = {'bvid': info['bvid'], 'bili_url': info['bili_url'], 'plats': {}}
        for ln in info['links']:
            plat = ln['platform']
            if plat not in idx:
                continue
            it, sc = pick(name, idx[plat], plat)
            if not it or sc < 0.72:
                continue
            key = (plat, it.get('fid') or it.get('fs_id'))
            if key in claims and claims[key][1] >= sc:
                continue
            claims[key] = (name, sc)
            row['plats'][plat] = {'path': it['path'], 'name': it['name'],
                                  'id': key[1], 'score': round(sc, 3), 'old_url': ln['url'],
                                  'same_platform': True}
        # 死掉的那个盘里没货时，退而求其次：别的盘有同名资源也认。
        # 对读者来说「夸克能下」远好过「百度已取消、没有替代」。
        if not row['plats']:
            for plat2 in idx:
                it, sc = pick(name, idx[plat2], plat2)
                if not it or sc < 0.72:
                    continue
                key = (plat2, it.get('fid') or it.get('fs_id'))
                if key in claims and claims[key][1] >= sc:
                    continue
                claims[key] = (name, sc)
                row['plats'][plat2] = {'path': it['path'], 'name': it['name'],
                                       'id': key[1], 'score': round(sc, 3), 'old_url': '',
                                       'same_platform': False}
        if row['plats']:
            plan[name] = row
        else:
            miss.append(name)
    json.dump(plan, open(PLAN, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'可补 {len(plan)} / {len(dead)} 个游戏；没对上 {len(miss)} 个')
    for n, r in plan.items():
        for p, v in r['plats'].items():
            print(f'  {n} [{p}] -> {v["path"]}  ({v["score"]})')
    if miss:
        print('没对上：', '、'.join(miss))


def quark_share(s, fid, title, pwd='qdby'):
    # 建分享的正确端点是 /1/clouddrive/share（不是 share/create，那个现在 404）
    r = s.post('https://drive-pc.quark.cn/1/clouddrive/share',
               params={'pr': 'ucpro', 'fr': 'pc', 'uc_param_str': ''},
               json={'fid_list': [fid], 'title': title[:50], 'url_type': 1, 'expired_type': 1},
               timeout=30)
    j = r.json()
    if j.get('code') != 0:
        return None, f"code={j.get('code')} {j.get('message')}"
    sid = (((j.get('data') or {}).get('task_resp') or {}).get('data') or {}).get('share_id')
    if not sid:
        # 分享文件夹走的是异步任务：只回 task_id，要再查一次 /task 才拿得到 share_id
        tid = (j.get('data') or {}).get('task_id')
        for _ in range(10):
            if not tid:
                break
            t = s.get('https://drive-pc.quark.cn/1/clouddrive/task',
                      params={'pr': 'ucpro', 'fr': 'pc', 'task_id': tid}, timeout=25).json()
            sid = (t.get('data') or {}).get('share_id')
            if sid:
                break
            time.sleep(2)
    if not sid:
        return None, '未返回 share_id'
    if pwd:
        s.post('https://drive-pc.quark.cn/1/clouddrive/share/password',
               params={'pr': 'ucpro', 'fr': 'pc'},
               json={'share_id': sid, 'passcode': pwd}, timeout=25)
    d = s.get('https://drive-pc.quark.cn/1/clouddrive/share/mypage/detail',
              params={'pr': 'ucpro', 'fr': 'pc', 'share_id': sid}, timeout=25).json()
    it = ((d.get('data') or {}).get('list') or [{}])[0]
    return {'url': it.get('share_url') or f'https://pan.quark.cn/s/{sid}',
            'pwd': pwd or '', 'share_id': sid}, ''


def baidu_share(s, fs_id, title, pwd='qdby'):
    data = {'fid_list': json.dumps([fs_id]), 'period': '0', 'pwd': pwd,
            'schannel': '4', 'channel': 'chunlei', 'web': '1',
            'app_id': '250528', 'clienttype': '0', 'bdstoken': s.bdstoken}
    r = s.post('https://pan.baidu.com/share/pset', params={'clienttype': '0', 'app_id': '250528',
                                                          'web': '1', 'channel': 'chunlei',
                                                          'bdstoken': s.bdstoken},
               data=data, timeout=30)
    j = r.json()
    if j.get('errno') != 0:
        return None, f"errno={j.get('errno')} {j.get('show_msg') or ''}"
    return {'url': j.get('link') or '', 'pwd': j.get('pwd') or pwd,
            'share_id': str(j.get('shareid') or '')}, ''


def verify(plat, url, pwd, sess=None):
    """建完立刻验一次，避免把刚生成的死链写到站上。

    夸克注意：sharepage/token 这个匿名接口现在对任何分享都返回 15000（接口变了），
    不能用来判活；用 owner 的 mypage/detail 看 status/violation 更靠谱。"""
    try:
        if plat == 'quark' and sess is not None:
            sid = url.rstrip('/').split('/')[-1].split('?')[0]
            d = sess.get('https://drive-pc.quark.cn/1/clouddrive/share/mypage/detail',
                         params={'pr': 'ucpro', 'fr': 'pc', 'share_id': sid}, timeout=25).json()
            it = ((d.get('data') or {}).get('list') or [{}])[0]
            alive = it.get('status') == 1 and not it.get('violation_cnt')
            return alive, f"status={it.get('status')} audit={it.get('audit_status')} " \
                          f"viol={it.get('violation_cnt')}"
        if plat == 'baidu':
            sid = url.split('/s/')[-1].split('?')[0]
            d = requests.get('https://pan.baidu.com/api/shorturlinfo',
                             params={'shorturl': sid, 'root': '1'},
                             headers={'Referer': 'https://pan.baidu.com/'}, timeout=25).json()
            return d.get('errno') in (0, -9), f"errno={d.get('errno')}"
    except Exception as e:
        return None, str(e)[:60]
    return None, '未支持'


def cmd_run(only='', dry=False, exact=False):
    plan = json.load(open(PLAN, encoding='utf-8'))
    qs, bs = quark_session(), baidu_session()
    result = {'meta': {'generated_at': time.strftime('%Y-%m-%d %H:%M'),
                       'note': '重新分享得到的补档链接；平台的登录态来自本机客户端 cookie'},
              'games': {}}
    if os.path.exists(OUT):
        try:
            result = json.load(open(OUT, encoding='utf-8'))
            result.setdefault('meta', {})['generated_at'] = time.strftime('%Y-%m-%d %H:%M')
        except Exception:
            pass

    # 「已经补过档」的跳过——但补档链接自己被复查判死的要重来（分享被取消、链接过期）
    have = set()
    for n, g in result['games'].items():
        for p, v in (g.get('links') or {}).items():
            if not v.get('url'):
                continue
            if v.get('checked') == 'dead':
                continue
            have.add((n, p))

    for name, row in plan.items():
        if only and ((only != name) if exact else (only not in name)):
            continue
        for plat, v in row['plats'].items():
            if (name, plat) in have:
                print(f'  = {name} [{plat}] 已有补档，跳过')
                continue
            if plat == 'quark' and not qs:
                print(f'  跳过 {name} [quark]：无登录态')
                continue
            if plat == 'baidu' and not bs:
                print(f'  跳过 {name} [baidu]：无登录态')
                continue
            if dry:
                print(f'  [dry] {name} [{plat}] -> {v["path"]}')
                continue
            if plat == 'quark':
                got, err = quark_share(qs, v['id'], name)
            else:
                got, err = baidu_share(bs, v['id'], name)
            if not got:
                print(f'  ✗ {name} [{plat}] {err}')
                result['games'].setdefault(name, {}).setdefault('links', {})[plat] = {'error': err}
                continue
            ok, vmsg = verify(plat, got['url'], got['pwd'], qs if plat == 'quark' else None)
            got.update({'platform': plat, 'verified': ok, 'check': vmsg,
                        'path': v['path'], 'created_at': time.strftime('%Y-%m-%d %H:%M'),
                        'bvid': row['bvid'], 'bili_url': row['bili_url']})
            result['games'].setdefault(name, {}).setdefault('links', {})[plat] = got
            print(f'  ✓ {name} [{plat}] {got["url"]} pwd={got["pwd"]} {vmsg}')
            json.dump(result, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
            time.sleep(1.2)
    json.dump(result, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    n = sum(len(g.get('links') or {}) for g in result['games'].values())
    print(f'完成，共 {len(result["games"])} 个游戏 / {n} 条补档 -> {OUT}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['index', 'plan', 'run'])
    ap.add_argument('--only', default='', help='只处理名字里含这个串的游戏')
    ap.add_argument('--exact', action='store_true', help='--only 按全名精确匹配（避免子串误伤）')
    ap.add_argument('--dry', action='store_true', help='只打印计划，不真的建分享')
    args = ap.parse_args()
    if args.cmd == 'index':
        cmd_index()
    elif args.cmd == 'plan':
        cmd_plan()
    else:
        cmd_run(args.only, args.dry, args.exact)


if __name__ == '__main__':
    main()

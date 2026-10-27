# -*- coding: utf-8 -*-
"""缺档 / 违规作品的抢救：跨网盘搬运 + 违规文件改装重传

它解决的是补档链路上最硬的两类失败：

  ① 云端没有同名资源  —— 其实多半不是真没有，而是站上的名字和云端名字对不上
     （站上叫「Lost Friends 2」，云端叫「LF2汉化补丁.zip」）。
     scan 会把两边云端里所有像的候选都列出来，按相似度打分，
     分数够高的直接采用，分数中间地带的标成 need_confirm 等人拍板，
     绝不让「恶魔之心：猎人」去顶「被诅咒的试炼」的坑。
     确认后：从有文件的那个盘下载 → 传到目标盘 → 建分享。

  ② errno=109 文件违规 —— 百度的违规判定按内容哈希走，改名/换目录/改标题都没用。
     做法：下载 → 改装（重建 zip 并加补档说明，哈希变了、用户解压方式不变）
     → 传到夸克 → 建分享。改装逻辑复用 reup_violation.repack。

下载走 web_download.mjs（夸克直链有回源登录校验，requests 直连 403，
必须借浏览器）；上传走 web_upload.mjs（客户端上传 API 是封的，
只有网页版上传器能传）。两者都需要一个开着 remote-debugging-port 的浏览器。

用法：
    python scripts/netdisk/salvage.py scan                     # 扫候选，写 data/netdisk-salvage.json
    python scripts/netdisk/salvage.py do --only 舌头上的动物园   # 对某部作品执行到底
    python scripts/netdisk/salvage.py do --auto --min-score .8  # 自动处理高分候选
    python scripts/netdisk/salvage.py do --only X --dry         # 只出计划不落地
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import time

BASE = os.path.dirname(os.path.abspath(__file__))
REPO = os.environ.get('QD_REPO') or os.path.normpath(os.path.join(BASE, '..', '..'))
WORK = os.environ.get('QD_WORK') or os.path.normpath(os.path.join(REPO, '..'))
sys.path.insert(0, BASE)
sys.path.insert(0, os.path.normpath(os.path.join(BASE, '..', 'bili')))

import reshare as R  # noqa: E402
import reup_violation as V  # noqa: E402

OUT_DIR = os.path.join(WORK, 'reup')
SALVAGE = os.path.join(REPO, 'data', 'netdisk-salvage.json')
RESHARE = os.path.join(REPO, 'data', 'netdisk-reshare.json')
REPORT = os.path.join(WORK, 'auto-reshare-report.json')
PY = os.environ.get('QD_PY') or sys.executable
PORT = os.environ.get('QD_PORT', '9228')

# 分数低于它就不算候选；高于 AUTO_SCORE 才允许 --auto 自动动手
MIN_SCORE = 0.30
AUTO_SCORE = 0.80


def load_report_failures() -> dict:
    """从最近一次自动补档报告里取「需要抢救」的作品与失败原因"""
    if not os.path.exists(REPORT):
        return {}
    try:
        d = json.load(open(REPORT, encoding='utf-8'))
    except Exception:
        return {}
    out = {}
    for name, why in (d.get('failed') or {}).items():
        if '没有同名资源' in str(why):
            out[name] = 'missing'
        elif '109' in str(why):
            out[name] = 'violation'
    return out


def cloud_items(sess, plat):
    if plat == 'quark':
        return R.quark_index(sess)
    return R.baidu_index(sess)


def scan_cloud(max_age=600):
    """把两个盘的文件清单拉下来，返回 {plat: [(name, fid, dir, size)]}

    百度 2600 多项扫一次要好几分钟，而这里只是找候选，
    10 分钟内的结果直接复用，别在批量抢救时反复扫。
    """
    cache = os.path.join(WORK, 'cloud-index-salvage.json')
    if os.path.exists(cache):
        try:
            age = time.time() - os.path.getmtime(cache)
            if age < max_age:
                d = json.load(open(cache, encoding='utf-8'))
                if d.get('quark') or d.get('baidu'):
                    print(f'  用 {int(age)}s 前的云端索引缓存')
                    return {'quark': d.get('quark') or [], 'baidu': d.get('baidu') or []}
        except Exception:
            pass
    out = {}
    for plat in ('quark', 'baidu'):
        try:
            s = R.quark_session() if plat == 'quark' else R.baidu_session()
            items = cloud_items(s, plat)
            out[plat] = [{'name': i.get('name') or '', 'fid': i.get('fid') or i.get('fs_id'),
                          'dir': bool(i.get('dir')), 'size': i.get('size') or 0} for i in items]
            print(f'  {plat}: {len(items)} 项')
        except Exception as e:
            print(f'  {plat} 索引失败：{type(e).__name__} {str(e)[:80]}')
            out[plat] = []
    if out.get('quark') or out.get('baidu'):
        with open(cache, 'w', encoding='utf-8', newline='\n') as f:
            json.dump({'at': time.strftime('%Y-%m-%d %H:%M'), **out}, f, ensure_ascii=False)
    return out


def cands_for(game, clouds):
    """在两个盘里找像这个作品的文件，按相似度排好"""
    cands = []
    for plat, items in clouds.items():
        for it in items:
            sc = R.score(game, it['name'])
            if it['dir']:
                sc = min(1.0, sc / 0.85)  # pick() 对文件夹有加权，这里反推回原始分
            if sc < MIN_SCORE:
                continue
            if '补档' in it['name']:
                sc = min(1.0, sc + 0.3)
            cands.append({'plat': plat, 'name': it['name'], 'fid': it['fid'],
                          'size': it['size'], 'score': round(sc, 3)})
    cands.sort(key=lambda c: -c['score'])
    return cands[:6]


def mark_conflicts(games):
    """同一份云端文件被好几部作品同时看上，说明名字本身就分不开
    （「恶魔之心」和「恶魔之心：猎人」都会撞上「被诅咒的试炼」），
    这种情况谁都别自动动手，全部交给人工拍板——补错档比不补更糟。"""
    owners = {}
    for g, info in games.items():
        top = (info.get('cands') or [None])[0]
        if not top:
            continue
        owners.setdefault((top['plat'], top['name']), []).append(g)
    n = 0
    for key, gs in owners.items():
        if len(gs) > 1:
            for g in gs:
                games[g]['conflict'] = [x for x in gs if x != g]
                n += 1
    if n:
        print(f'  {n} 部作品争用同一份云端文件，已标为待确认')
    return games


def cmd_scan(only: str = ''):
    fails = load_report_failures()
    if only:
        fails = {k: v for k, v in fails.items() if only in k}
    if not fails:
        print('没有需要抢救的作品（先跑一次 daily_check / auto_reshare 才有报告）')
        return {}
    print(f'待抢救 {len(fails)} 部：')
    clouds = scan_cloud()

    result = {}
    for game, kind in fails.items():
        cands = cands_for(game, clouds)
        result[game] = {'kind': kind, 'cands': cands}
    result = mark_conflicts(result)
    for game, kind in fails.items():
        cands = result[game]['cands']
        top = cands[0] if cands else None
        mark = ('（待确认）' if top and top['score'] < AUTO_SCORE
                else ('（自动可用）' if top else '（云端确实没有）'))
        print(f"  {game} [{kind}] {mark}")
        for c in cands[:3]:
            print(f"      {c['score']:.2f} {c['plat']} {c['name'][:46]}")

    data = {'generated_at': time.strftime('%Y-%m-%d %H:%M'), 'games': result}
    with open(SALVAGE, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'已写 {SALVAGE}')
    return result


def run(cmd, cwd=REPO, check=False):
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if check and p.returncode != 0:
        raise RuntimeError(f'{" ".join(cmd[:3])} 失败：{(p.stderr or p.stdout)[:200]}')
    return p


def download_to(cand, dst):
    """把云端某个文件取到本地"""
    os.makedirs(OUT_DIR, exist_ok=True)
    if cand['plat'] == 'quark':
        run([os.environ.get('QD_NODE') or 'node', os.path.join(BASE, 'web_download.mjs'),
             '--quark', str(cand['fid']), '--out', dst], check=True)
    else:
        # 百度：先拿 dlink（客户端会话），再直连下载
        s = R.baidu_session()
        h = dict(s.headers)
        h['User-Agent'] = 'pan.baidu.com'
        meta = s.get('https://pan.baidu.com/api/filemetas',
                     params={'method': 'filemetas', 'dlink': '1'},
                     headers=h, timeout=30).json()
        lst = (meta.get('info') or meta.get('list') or [])
        if not lst:
            raise RuntimeError('百度 filemetas 拿不到（fs_id 可能不对）')
        it = lst[0]
        with s.get(it['dlink'], headers={'User-Agent': 'pan.baidu.com'}, stream=True, timeout=120) as r:
            r.raise_for_status()
            with open(dst, 'wb') as f:
                for chunk in r.iter_content(1 << 20):
                    f.write(chunk)
    return dst


def upload_file(path):
    """用网页版上传器把文件传回夸克"""
    run([os.environ.get('QD_NODE') or 'node', os.path.join(BASE, 'web_upload.mjs'), path], check=True)


def do_refit(game, cand, base, log):
    """改装重传：下载 → 换哈希 → 传回夸克 → 建分享（违规件的唯一出路）"""
    src = os.path.join(OUT_DIR, base + '.orig')
    download_to(cand, src)
    log.update({'downloaded': os.path.getsize(src), 'md5_before': V.md5_of(src)})
    up = os.path.join(OUT_DIR, base + ' 汉化补丁（补档版）.zip')
    token, how = V.repack(src, up)
    log.update({'refit': how, 'token': token, 'md5_after': V.md5_of(up)})
    print(f'    改装 {how} → {os.path.basename(up)}')
    upload_file(up)
    log['uploaded'] = os.path.basename(up)

    s = R.quark_session()
    items = R.quark_index(s)
    hit = None
    for it in items:
        if (it.get('name') or '') and R.score(os.path.basename(up), it['name']) > 0.9:
            hit = it
            break
    if not hit:
        return {**log, 'state': 'upload_not_found', 'note': '上传后没在云端索引里找到它'}
    sh, err = R.quark_share(s, hit['fid'], (base + ' 汉化补丁').strip(), 'qdby')
    if err:
        return {**log, 'state': 'share_failed', 'note': err}
    url, pwd = sh['url'], sh['pwd']
    ok, vnote = R.verify('quark', url, pwd, sess=s)
    log.update({'shared': {'plat': 'quark', 'url': url, 'pwd': pwd, 'verified': ok}})
    print(f'    分享 {url} 提取码 {pwd} 核验 {"通过" if ok else "未通过"}')
    log['state'] = 'done' if ok else 'unverified'
    return log


def do_one(game, info, dry=False, min_score=AUTO_SCORE, force_refit=False):
    cands = info.get('cands') or []
    if not cands:
        return {'state': 'no_candidate', 'note': '两个盘里都找不到像的文件'}
    if info.get('conflict'):
        return {'state': 'need_confirm',
                'note': '与「%s」争用同一份云端文件，等人拍板' % '、'.join(info['conflict'])}
    top = cands[0]
    if top['score'] < min_score:
        return {'state': 'need_confirm', 'note': f"最高分 {top['score']}，低于 {min_score}，等人确认"}

    kind = info.get('kind')
    # 违规是百度按内容哈希判的，夸克不一定也判它违规：
    # 源在夸克就先直接建分享，真被挡了再改装重传，别白搬一趟
    if top['plat'] == 'quark' and not force_refit:
        plan = ['share']
    elif kind == 'violation':
        plan = ['download', 'refit', 'upload', 'share']
    else:
        plan = ['download', 'upload', 'share']
    print(f'  {game}：计划 {plan}（源 {top["plat"]} {top["name"][:36]}）')
    if dry:
        return {'state': 'dry', 'plan': plan}

    log = {'source': top, 'plan': plan}
    base = ''.join(ch for ch in game if ch not in '\\/:*?"<>|')[:40]
    src = os.path.join(OUT_DIR, base + '.orig')
    # 1) 下载
    if 'download' in plan:
        download_to(top, src)
        log['downloaded'] = os.path.getsize(src)
        log['md5_before'] = V.md5_of(src)
        print(f'    下载 {log["downloaded"]} 字节')
    # 2) 改装（违规件必须换哈希）
    up = src
    if 'refit' in plan:
        up = os.path.join(OUT_DIR, base + ' 汉化补丁（补档版）.zip')
        token, how = V.repack(src, up)
        log.update({'refit': how, 'token': token, 'md5_after': V.md5_of(up)})
        print(f'    改装 {how} → {os.path.basename(up)}')
    # 3) 上传
    if 'upload' in plan:
        upload_file(up)
        log['uploaded'] = os.path.basename(up)
        print(f'    上传 {log["uploaded"]}')
    # 4) 重建索引 + 建分享 + 核验
    if 'share' in plan:
        s = R.quark_session() if top['plat'] == 'quark' or 'upload' in plan else R.baidu_session()
        items = R.quark_index(s) if ('upload' in plan or top['plat'] == 'quark') else R.baidu_index(s)
        plat = 'quark' if ('upload' in plan or top['plat'] == 'quark') else 'baidu'
        if 'upload' in plan:
            target = os.path.basename(up)
            hit = None
            for it in items:
                if (it.get('name') or '') and R.score(target, it['name']) > 0.9:
                    hit = it
                    break
            if not hit:
                return {**log, 'state': 'upload_not_found', 'note': '上传后没在云端索引里找到它'}
        else:
            hit = {'fid': top['fid'], 'name': top['name']}
        if plat == 'quark':
            sh, err = R.quark_share(s, hit['fid'], (base + ' 汉化补丁').strip(), 'qdby')
        else:
            sh, err = R.baidu_share(s, hit.get('fid'), (base + ' 汉化补丁').strip(), 'qdby')
        if err:
            # 夸克也判违规：回头改装再传一次（这次是同盘覆盖式补档）
            if '违规' in err or '109' in err:
                print(f'    直接分享被挡：{err[:40]}，改走改装重传')
                return do_refit(game, top, base, log)
            return {**log, 'state': 'share_failed', 'note': err}
        url, pwd = sh['url'], sh['pwd']
        ok, vnote = R.verify(plat, url, pwd, sess=(s if plat == 'quark' else None))
        log.update({'shared': {'plat': plat, 'url': url, 'pwd': pwd, 'verified': ok, 'note': vnote}})
        print(f'    分享 {url} 提取码 {pwd} 核验 {"通过" if ok else "未通过"}')
        log['state'] = 'done' if ok else 'unverified'
    else:
        log['state'] = 'done'
    return log


def save_reshare(game, log):
    """把抢救结果并进补档台账，让 autofill 能把它顶成首选链接"""
    if not (log.get('shared') or {}).get('verified'):
        return
    d = {}
    if os.path.exists(RESHARE):
        try:
            d = json.load(open(RESHARE, encoding='utf-8'))
        except Exception:
            d = {}
    games = d.setdefault('games', {})
    g = games.setdefault(game, {'links': {}})
    sh = log['shared']
    # 台账里 links 是按平台索引的字典（autofill 依赖这个结构）
    links = g.get('links')
    if not isinstance(links, dict):
        links = {}
    links[sh['plat']] = {
        'platform': sh['plat'],
        'url': sh['url'],
        'pwd': sh['pwd'],
        'share_id': (sh['url'].rstrip('/').split('/')[-1].split('?')[0]
                     if sh['plat'] == 'quark' else ''),
        'verified': True,
        'check': sh.get('note') or '',
        'path': (log.get('uploaded') or (log.get('source') or {}).get('name') or ''),
        'created_at': time.strftime('%Y-%m-%d %H:%M'),
        'via': 'salvage',
        'refit': log.get('refit') or '',
    }
    g['links'] = links
    with open(RESHARE, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(d, f, ensure_ascii=False, indent=2)


def main():
    ap = argparse.ArgumentParser(description='跨网盘抢救 + 违规文件改装重传')
    ap.add_argument('cmd', choices=['scan', 'do'], help='scan=扫候选，do=执行')
    ap.add_argument('--only', help='只处理名字里含这段的作品')
    ap.add_argument('--game', help='直接点名一部作品（精确名，给 auto_reshare 用）')
    ap.add_argument('--kind', choices=['missing', 'violation'], help='配合 --game 指定失败类型')
    ap.add_argument('--auto', action='store_true', help='自动采用高分候选')
    ap.add_argument('--min-score', type=float, default=AUTO_SCORE, help='自动动手的最低分')
    ap.add_argument('--dry', action='store_true', help='只出计划不落地')
    ap.add_argument('--force-refit', action='store_true', help='强制走「下载→改装→上传→分享」')
    args = ap.parse_args()

    if args.cmd == 'scan':
        cmd_scan(args.only)
        return

    data = {}
    if os.path.exists(SALVAGE):
        try:
            data = json.load(open(SALVAGE, encoding='utf-8'))
        except Exception:
            data = {}
    games = data.get('games') or {}
    if args.only:
        games = {k: v for k, v in games.items() if args.only in k}
    # 外部（auto_reshare）直接点名时，现场扫一遍，不依赖上一轮报告
    if args.game and (args.game not in games or args.kind):
        clouds = scan_cloud()
        cands = cands_for(args.game, clouds)
        games[args.game] = {'kind': args.kind or 'missing', 'cands': cands}
        top = cands[0] if cands else None
        if not top:
            print(f'  {args.game}：两个盘里都找不到像的文件')
        else:
            print(f"  {args.game}：最高分 {top['score']} {top['plat']} {top['name'][:40]}")
    if args.game:
        games = {k: v for k, v in games.items() if k == args.game}
    if not games:
        sys.exit('没有可处理的作品')
    min_score = 0.0 if args.only else (args.min_score if args.auto else AUTO_SCORE)

    results = {}
    for game, info in games.items():
        try:
            log = do_one(game, info, dry=args.dry, min_score=min_score,
                         force_refit=args.force_refit)
        except Exception as e:
            log = {'state': 'error', 'note': f'{type(e).__name__}: {str(e)[:160]}'}
        results[game] = log
        print(f'  → {game}: {log.get("state")} {log.get("note", "")}')
        if not args.dry:
            save_reshare(game, log)

    with open(SALVAGE, 'w', encoding='utf-8', newline='\n') as f:
        json.dump({**data, 'results': results, 'ran_at': time.strftime('%Y-%m-%d %H:%M')},
                  f, ensure_ascii=False, indent=2)
    print(f'结果已写入 {SALVAGE}')


if __name__ == '__main__':
    main()

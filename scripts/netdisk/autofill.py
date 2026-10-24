# -*- coding: utf-8 -*-
"""自动补档：让每个作品永远有一个「当前可用」的下载入口

三层处理：
  1. 自动切换 failover —— 一个作品常同时有百度/夸克/迅雷多条链接。
     夸克挂了但百度还在，就不该让用户看到「已失效」，直接切到还活着的那条。
  2. 自动补抓 harvest   —— 对全部链接都失效的作品，回到所有语料
     （投稿简介 / 微博全文 / 专栏摘要 / UP 主评论）里重新找链接，
     新链接走与巡检相同的接口核验，有用的才算候补。
  3. 自动催档 request   —— 找不出候补的，生成可一键复制的求档文案与相关入口。

前端不再直接暴露网盘地址：每个入口只给「哪个盘 + 提取码 + 它写在哪」，
点击统一引导回视频发布处（简介 / 置顶评论 / 评论区）或微博原文，由用户自己在
原发布页拿链接。这样链接失效时页面不会留着死链，也不会把补档地址摊在明面上。

输出：
  data/netdisk-autofill.json   给前端用（active / dead / candidates / request / reupload）
  data/netdisk-autofill.md     给人看的待补档清单

用法：
  python scripts/netdisk/autofill.py            # 只做切换 + 补抓（默认核验候补）
  python scripts/netdisk/autofill.py --no-check # 跳过候补核验，快
"""
import argparse
import json
import os
import re
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.environ.get('QD_REPO') or os.path.normpath(os.path.join(HERE, '..', '..'))
RAW = os.environ.get('QD_CACHE') or os.path.normpath(os.path.join(REPO, '..', 'raw'))

sys.path.insert(0, HERE)
import refresh as R  # noqa: E402

# 首选顺序：能直接点开就下的排前面；夸克/UC 近年封禁率高，排在百度后面
PLAT_RANK = {
    'baidu': 1, 'quark': 2, 'aliyun': 3, 'xunlei': 4, '123pan': 5,
    '189': 6, 'ctfile': 7, 'weiyun': 8, 'lanzou': 9, 'caiyun': 10,
    'gdrive': 11, '115': 12, 'uc': 13,
}


def load(path, default=None):
    if not os.path.exists(path):
        return default
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def rank(link):
    return PLAT_RANK.get(link.get('platform'), 50)


def sort_links(links):
    """可用的排前面，同组按平台优先级、再按来源可信度"""
    return sorted(links, key=lambda L: (L.get('status') != 'ok', rank(L),
                                        R.SOURCE_ORDER.get(L.get('source'), 9)))


def game_texts(g, descs, weibo, articles, hunt):
    """收集与这个作品相关的全部原文，供补抓用

    返回 (来源标签, 正文, 附加信息)。评论区来源额外带作者与是否 UP 主本人，
    因为「补档：…」这种留言通常就是 UP 主自己补的，可信度高于路人转存。
    """
    name = g.get('name') or ''
    out = []
    bv = g.get('bvid')
    if bv and bv in descs:
        out.append(('desc', descs[bv].get('desc') or '', {}))
    for key, label in (('desc', 'desc'), ('pinned_comment', 'pinned'), ('release_url', 'site')):
        if g.get(key):
            out.append((label, str(g[key]), {}))
    for c in g.get('up_comments') or []:
        out.append(('up_comment', c.get('text') or '', {'author': '青灯不弈', 'is_up': True}))

    h = (hunt or {}).get(bv or '')
    if h:
        up_mid = h.get('up_mid')
        for c in h.get('comments') or []:
            out.append(('comment', c.get('text') or '',
                        {'author': c.get('user') or '', 'is_up': bool(up_mid) and c.get('mid') == up_mid}))

    if name:
        for p in weibo or []:
            t = p.get('fullText') or p.get('text') or ''
            if name in t:
                out.append(('weibo', t, {}))
        for a in articles or []:
            blob = (a.get('title') or '') + (a.get('summary') or '')
            if name in blob:
                out.append(('article', blob, {}))
    return out


def harvest(g, known_urls, descs, weibo, articles, hunt):
    """从原文里找还没收录过的链接"""
    found, seen = [], set()
    for src, text, meta in game_texts(g, descs, weibo, articles, hunt):
        for url, pwd, plat in R.extract_links(text):
            u = R.normalize(url)
            if u in known_urls or (plat, u) in seen:
                continue
            seen.add((plat, u))
            found.append({
                'url': u, 'platform': plat, 'pwd': pwd, 'source': src,
                'author': meta.get('author') or '',
                'is_up': bool(meta.get('is_up')),
                'platform_name': dict((k, n) for k, n, _ in R.PLATFORMS).get(plat, '其他'),
                'share_id': R.share_id(u, plat),
                'status': 'unknown', 'detail': '待核验',
            })
    return found


WHERE_LABEL = {
    'desc': '视频简介', 'pinned': '置顶评论', 'up_comment': 'UP 主评论',
    'comment': '评论区', 'weibo': '微博原文', 'site': '发布页', 'article': '专栏',
}


def where_of(src):
    return WHERE_LABEL.get(src or '', '原记录')


def pub(L):
    """对外输出的链接字段：只留「哪个盘 / 提取码 / 写在哪」，不带 url"""
    return {
        'platform': L.get('platform'),
        'platform_name': L.get('platform_name') or '网盘',
        'pwd': L.get('pwd') or '',
        'detail': L.get('detail') or '',
        'source': L.get('source') or '',
        'where': where_of(L.get('source')),
        'share_id': L.get('share_id') or '',
    }


def video_of(g):
    bv = g.get('bvid') or ''
    url = g.get('bili_url') or ('https://www.bilibili.com/video/' + bv if bv else '')
    # 「发布页」这一栏有些作品填的就是网盘地址，那不是发布处、更不能直出
    if url and PAN_RE.search(url):
        url = ''
    # 没有投稿的作品（例如视频被下架）入口退回微博原文，页面统一引导到这里
    if not url:
        rel = g.get('release_url') or ''
        if rel and not PAN_RE.search(rel):
            return {'bvid': '', 'url': rel,
                    'title': '微博发布页' if 'weibo' in rel else '发布页',
                    'pubdate': g.get('pubdate') or ''}
        return {'bvid': bv, 'url': '', 'title': '', 'pubdate': g.get('pubdate') or ''}
    return {'bvid': bv, 'url': url, 'title': g.get('video_title') or '',
            'pubdate': g.get('pubdate') or ''}


PAN_RE = re.compile(r'(?:pan\.baidu\.com|pan\.quark\.cn|drive\.uc\.cn|pan\.xunlei\.com|'
                    r'aliyundrive\.com|alipan\.com|cloud\.189\.cn|123pan\.com|'
                    r'lanzou[a-z]?\.com|caiyun\.139\.com|share\.weiyun\.com|'
                    r'ctfile\.com|mega\.nz|drive\.google\.com)', re.I)


PLAT_NAME = {'baidu': '百度网盘', 'quark': '夸克网盘', 'xunlei': '迅雷云盘',
             'uc': 'UC网盘', 'ctfile': '城通网盘', 'aliyun': '阿里云盘',
             '123': '123云盘', 'lanzou': '蓝奏云', 'weiyun': '腾讯微云'}


def request_block(g, name):
    """全灭时给用户/UP 主一个可操作的出口"""
    bili = g.get('bili_url')
    weibo = g.get('release_url') if 'weibo.com' in (g.get('release_url') or '') else ''
    dead_plats = sorted({L.get('platform_name') or L.get('platform') for L in g.get('links') or []
                         if L.get('status') == 'dead'})
    msg = '《%s》的%s链接失效了，求补档 🙏' % (name, '、'.join(dead_plats) or '网盘')
    return {
        'bili_url': bili,
        'weibo_url': weibo,
        'dead_platforms': dead_plats,
        'message': msg,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--no-check', action='store_true', help='跳过候补链接的在线核验')
    ap.add_argument('--node', default='node', help='浏览器核验用的 node 路径')
    args = ap.parse_args()

    led = load(os.path.join(REPO, 'data', 'netdisk-links.json'))
    if not led:
        raise SystemExit('读不到 data/netdisk-links.json，先跑 refresh.py')
    descs = load(os.path.join(RAW, 'descs.json'), {})
    weibo = load(os.path.join(RAW, 'weibo_posts.json'), [])
    articles = load(os.path.join(RAW, 'up_articles.json'), [])
    hunt = load(os.path.join(RAW, 'hunt_comments.json'), {})
    reup = load(os.path.join(REPO, 'data', 'netdisk-reupload.json'), {})
    reshare = load(os.path.join(REPO, 'data', 'netdisk-reshare.json'), {})
    print('评论区补档语料：%d 个视频，%d 条含链接的评论'
          % (len(hunt), sum(len(v.get('comments') or []) for v in hunt.values())))

    games = led['games']
    print('作品 %d 个，链接 %d 条' % (len(games), sum(len(g.get('links') or []) for g in games)))

    out = {'meta': {}, 'games': {}}
    states = {'ok': 0, 'failover': 0, 'recovered': 0, 'reshared': 0, 'pending': 0, 'none': 0}
    new_links = []

    for g in games:
        name = g.get('name') or ''
        links = sort_links(g.get('links') or [])
        ok = [L for L in links if L.get('status') == 'ok']
        dead = [L for L in links if L.get('status') == 'dead']

        if not links:
            state = 'none'
        elif not ok:
            state = 'pending'
        elif dead:
            state = 'failover'
        else:
            state = 'ok'

        rec = {
            'state': state,
            'video': video_of(g),
            'active': (pub(ok[0]) if ok else None),
            'alt': [pub(L) for L in ok[1:]],
            'dead': [pub(L) for L in dead],
            'candidates': [],
        }

        # 有失效、或压根没收录 → 都值得回评论区/原文里再找一遍
        if state != 'ok':
            known = {R.normalize(L['url']) for L in links}
            cands = harvest(g, known, descs, weibo, articles, hunt)
            if cands:
                print('  · %s 挖到 %d 条候补' % (name, len(cands)))
            if cands and not args.no_check:
                R.run_api_checks(cands)
                if any(c['platform'] in R.SPA_PLATFORMS for c in cands):
                    R.run_spa_checks(cands, node_bin=args.node)
            cands.sort(key=lambda c: (c.get('status') != 'ok', not c.get('is_up'), rank(c)))
            rec['candidates'] = [dict(pub(c), status=c.get('status'), author=c.get('author') or '',
                                      is_up=bool(c.get('is_up'))) for c in cands[:6]]

            good = [c for c in cands if c.get('status') == 'ok']
            best = good[0] if good else None
            # UP 主自己补的链接可以直接顶上去；路人转存只列出来，不替用户做主
            if best and (best.get('is_up') or state in ('pending', 'none')):
                rec['active'] = pub(best)
                rec['recovered_from'] = {'source': best.get('source'), 'author': best.get('author') or '',
                                         'is_up': bool(best.get('is_up'))}
                rec['alt'] = ([pub(L) for L in ok] + [pub(c) for c in good if c is not best])
                state = 'recovered'
                rec['state'] = state
                new_links.append((name, best))

        # 本机已经重新建过分享的（scripts/netdisk/reshare.py 的产物）：
        # 新链接写进对应视频的评论区，页面只标注「已补档」，仍然不直出地址
        rs = ((reshare.get('games') or {}).get(name) or {}).get('links') or {}
        done = []
        for k, v in rs.items():
            if not v.get('url'):
                continue
            row = pub({'platform': k, 'platform_name': PLAT_NAME.get(k, k),
                       'pwd': v.get('pwd') or '', 'source': 'comment',
                       'detail': v.get('path') or ''})
            row.update({'verified': v.get('verified'), 'at': v.get('created_at') or '',
                        'check': v.get('check') or ''})
            done.append(row)
        if done:
            rec['reshare'] = done
            if state in ('pending', 'none'):
                state = 'reshared'
                rec['state'] = state

        if state in ('pending', 'none'):
            rec['request'] = request_block(g, name)
            rb = (reup.get('games') or {}).get(name)
            if rb:
                rec['reupload'] = {k: rb.get(k) for k in
                                   ('state', 'client_name', 'file', 'file_size', 'why')}

        states[state] += 1
        out['games'][name] = rec

    out['meta'] = {
        'generated_at': time.strftime('%Y-%m-%d %H:%M'),
        'source_checked_at': (led.get('meta') or {}).get('checked_at'),
        'games': len(games),
        'summary': states,
        'recovered_links': len(new_links),
        'note': 'active 是当前可用的首选链接（按平台优先级与来源可信度排序），'
                '但只给平台/提取码/写在哪，不给地址——页面统一引导回视频发布处；'
                'failover 表示原链接有失效但已自动切到其他可用盘；'
                'recovered 表示从评论区/微博里补回了新链接并通过核验；'
                'pending 表示全部失效且暂无可信候补，reupload 写清本机补档卡在哪一步。',
    }

    dst = os.path.join(REPO, 'data', 'netdisk-autofill.json')
    with open(dst, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print('状态：', states, '| 补抓到的可用新链接：', len(new_links))
    print('->', dst, '%.1f KB' % (os.path.getsize(dst) / 1024))

    # 给人看的待补档清单
    lines = ['# 待补档清单', '',
             '生成于 %s；链接有效性巡检于 %s。' % (out['meta']['generated_at'],
                                          out['meta']['source_checked_at'] or '—'), '']
    lines.append('| 状态 | 数量 | 含义 |')
    lines.append('| --- | --- | --- |')
    lines.append('| ok | %d | 全部链接有效 |' % states['ok'])
    lines.append('| failover | %d | 有链接失效，已自动切到备用盘 |' % states['failover'])
    lines.append('| recovered | %d | **已从评论区/微博补回新链接并通过核验** |' % states['recovered'])
    lines.append('| pending | %d | **全部失效，暂无可信候补，需要人工补档** |' % states['pending'])
    lines.append('| none | %d | 从未收录过网盘链接 |' % states['none'])
    lines.append('')

    recs = [(n, r) for n, r in out['games'].items() if r['state'] == 'recovered']
    if recs:
        lines.append('## 本轮自动补回的链接')
        lines.append('')
        lines.append('| 作品 | 补回的盘 | 来源 | 作者 |')
        lines.append('| --- | --- | --- | --- |')
        for n, r in recs:
            a = r.get('active') or {}
            f = r.get('recovered_from') or {}
            lines.append('| %s | %s | %s | %s |' % (
                n, a.get('platform_name') or '—', f.get('source') or '—',
                ('青灯不弈（UP 主）' if f.get('is_up') else (f.get('author') or '—'))))
        lines.append('')

    rows = [(n, r) for n, r in out['games'].items() if r['state'] in ('pending', 'none')]
    if rows:
        lines.append('## 需要补档的作品')
        lines.append('')
        lines.append('| 作品 | 失效盘 | 候补 | 入口 |')
        lines.append('| --- | --- | --- | --- |')
        for n, r in rows:
            req = r.get('request') or {}
            cands = r.get('candidates') or []
            good = [c for c in cands if c.get('status') == 'ok']
            cand_txt = ('%d 个可用候补' % len(good)) if good else ('%d 个待核验' % len(cands) if cands else '无')
            entry = []
            if req.get('bili_url'):
                entry.append('[视频](%s)' % req['bili_url'])
            if req.get('weibo_url'):
                entry.append('[微博](%s)' % req['weibo_url'])
            lines.append('| %s | %s | %s | %s |' % (
                n, '、'.join(req.get('dead_platforms') or []) or '—', cand_txt, ' '.join(entry) or '—'))
        lines.append('')

    focs = [(n, r) for n, r in out['games'].items() if r['state'] == 'failover']
    if focs:
        lines.append('## 已自动切换（用户无感）')
        lines.append('')
        lines.append('| 作品 | 失效 | 现在给的是 |')
        lines.append('| --- | --- | --- |')
        for n, r in focs:
            a = r.get('active') or {}
            lines.append('| %s | %s | %s |' % (
                n, '、'.join(sorted({d.get('platform_name') or d.get('platform') for d in r['dead']})) or '—',
                a.get('platform_name') or '—'))
        lines.append('')

    md = os.path.join(REPO, 'data', 'netdisk-autofill.md')
    with open(md, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines))
    print('->', md)


if __name__ == '__main__':
    main()

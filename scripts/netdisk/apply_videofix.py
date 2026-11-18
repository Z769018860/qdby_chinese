#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""按 data/netdisk-videofix.json 修正「发布地址贴错行」的作品

背景
----
站点登记表 data.json 的「汉化发布地址」是人手填的，UP 主同期发的几个视频
（同一个制作组、同一天）很容易贴串行。表现是：条目名是 A，
bvid 却指向 B 的视频，于是 desc 里那串网盘链接也是 B 的补丁。
`refresh.py` 只会照单全收，所以必须先在源头上把地址改对。

这个脚本做两件事：
  1. 把 data.json 里对应条目的「汉化发布地址」改成正确的 B 站地址；
  2. 就地更新 data/netdisk-links.json 的该条目（bvid/标题/简介/置顶/链接），
     并把原来的链接状态置为待核验，等 daily_check 重新判活。

用法：
  python scripts/netdisk/apply_videofix.py            # 应用
  python scripts/netdisk/apply_videofix.py --dry      # 只看会改什么
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)

import refresh as RF  # noqa: E402  （复用链接提取规则，保证与台账一致）

FIX = os.path.join(REPO, 'data', 'netdisk-videofix.json')
LINKFIX = os.path.join(REPO, 'data', 'netdisk-linkfix.json')
SITE = os.path.join(REPO, 'data.json')
LEDGER = os.path.join(REPO, 'data', 'netdisk-links.json')


def load(p, default=None):
    try:
        return json.load(open(p, encoding='utf-8'))
    except Exception:
        return default


def build_links(desc, pinned, keep):
    """用新的 desc/置顶重建链接，保留旧台账里非 desc/pinned 来源的（评论补充、专栏等）"""
    out, seen = [], set()
    for src, text in (('desc', desc), ('pinned', pinned)):
        for url, pwd, plat in RF.extract_links(text or ''):
            if url in seen:
                continue
            seen.add(url)
            out.append({'url': url, 'platform': plat,
                        'platform_name': RF.platform_of(url)[1],
                        'share_id': RF.share_id(url, plat),
                        'pwd': pwd, 'source': src,
                        'status': 'unknown', 'status_text': '待确认',
                        'detail': '', 'checked_at': ''})
    for L in keep:
        if L.get('source') in ('desc', 'pinned') or L.get('url') in seen:
            continue
        seen.add(L['url'])
        L = dict(L)
        L.update(status='unknown', status_text='待确认', detail='', checked_at='')
        out.append(L)
    return out


def apply_linkfix(led, dry=False):
    """把 data/netdisk-linkfix.json 里登记的「指错行」链接标成失效

    这些链接本身还能打开，但打开的是**别的作品**——比死链更坑，
    所以按 dead 处理：站点不会再把它当可用来源展示。
    """
    bad = (load(LINKFIX, {}) or {}).get('bad') or []
    if not bad:
        return 0
    rows = {}
    for b in bad:
        rows.setdefault(b['game'], {})[b['url'].rstrip('#').strip()] = b
    n = 0
    for g in led.get('games') or []:
        m = rows.get(g.get('name'))
        if not m:
            continue
        for L in g.get('links') or []:
            b = m.get((L.get('url') or '').rstrip('#').strip())
            if not b:
                continue
            print('链接修正  %-18s %s' % (g['name'], L['url'][:60]))
            print('          → %s' % b.get('detail', ''))
            n += 1
            if dry:
                continue
            L['status'] = b.get('status') or 'dead'
            L['status_text'] = RF.STATUS_LABEL.get(L['status'], '失效')
            L['detail'] = b.get('detail', '')
            L['checked_at'] = b.get('verified_at', '')
            L['linkfix'] = True
    return n


def main():
    dry = '--dry' in sys.argv
    fix = load(FIX, {}).get('fix') or {}
    if not fix and not (load(LINKFIX, {}) or {}).get('bad'):
        raise SystemExit('没有可用的修正数据：%s' % FIX)

    site = load(SITE, [])
    for x in site:
        f = fix.get(x.get('汉化名'))
        if f:
            new = 'https://www.bilibili.com/video/%s/' % f['bvid']
            if not dry:
                x['汉化发布地址'] = new
            print('data.json  %-22s -> %s' % (x['汉化名'], f['bvid']))

    led = load(LEDGER, {'games': []})
    changed = 0
    for g in led.get('games') or []:
        f = fix.get(g.get('name'))
        if not f:
            continue
        if (g.get('bvid') == f['bvid'] and g.get('desc') == f['desc']
                and g.get('video_title') == f['title']):
            continue        # 已经修过，别重建 links（会冲掉核验状态）
        print('台账      %-22s %s -> %s（%d 条链接重建）'
              % (g['name'], g.get('bvid'), f['bvid'], len(g.get('links') or [])))
        if dry:
            changed += 1
            continue
        g['bvid'] = f['bvid']
        g['bili_url'] = 'https://www.bilibili.com/video/%s/' % f['bvid']
        g['video_title'] = f['title']
        g['desc'] = f['desc']
        g['pinned_comment'] = f['pinned']
        if f.get('up'):
            g['up'] = f['up']
        g['links'] = build_links(f['desc'], f['pinned'], g.get('links') or [])
        notes = [n for n in (g.get('notes') or []) if '贴错' not in n]
        notes.append('发布地址此前贴错行，已按视频标题人工核对后修正')
        g['notes'] = notes
        for L in g['links']:
            print('           %s %s' % (L['platform'], L['url']))
        changed += 1

    nfix = apply_linkfix(led, dry=dry)
    if nfix:
        print('链接指错修正 %d 条' % nfix)

    if dry:
        print('（预演）可修正 %d 条' % changed)
        return
    json.dump(site, open(SITE, 'w', encoding='utf-8', newline='\n'),
              ensure_ascii=False, indent=1)
    json.dump(led, open(LEDGER, 'w', encoding='utf-8', newline='\n'),
              ensure_ascii=False, indent=1)
    print('已修正 %d 条' % changed)


if __name__ == '__main__':
    main()

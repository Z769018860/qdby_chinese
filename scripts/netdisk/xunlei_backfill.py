# -*- coding: utf-8 -*-
"""给「还没有迅雷链接」的作品补一条迅雷云盘分享

和 auto_reshare 的分工：
  · auto_reshare  处理「已有链接但失效」——哪个盘死了补哪个盘
  · 本脚本        处理「压根没有迅雷链接」——从网盘里找同名文件，建分享补上

匹配沿用 reshare.py 的归一化 + 相似度打分（同一套别名表、同一套清洗规则），
建出来的链接写进 data/netdisk-reshare.json 的 links.xunlei，站点会自动展示。

网盘里确实没有文件的，脚本只报告，不做上传——上传要另走网页版，见 README。

用法：
  python scripts/netdisk/xunlei_backfill.py --dry          # 只看能补哪些
  python scripts/netdisk/xunlei_backfill.py --limit 5      # 先补 5 个试试
  python scripts/netdisk/xunlei_backfill.py                # 全量补
  python scripts/netdisk/xunlei_backfill.py --only 冬鸦
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, '..', '..'))
WORK = os.path.normpath(os.path.join(REPO, '..'))
sys.path.insert(0, HERE)

import reshare as RSH  # noqa: E402
import xunlei as XL    # noqa: E402

LEDGER = RSH.LINKS
OUT = RSH.OUT
XINDEX = XL.INDEX


def load(p, default):
    if not os.path.exists(p):
        return default
    try:
        return json.load(open(p, encoding='utf-8'))
    except Exception:
        return default


def has_xunlei(name, led_game, rs):
    for L in (led_game.get('links') or []):
        if L.get('platform') == 'xunlei' and L.get('status') != 'dead':
            return True
    v = ((rs.get('games') or {}).get(name) or {}).get('links', {}).get('xunlei') or {}
    return bool(v.get('url')) and v.get('checked') != 'dead'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry', action='store_true')
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--only', default='')
    ap.add_argument('--min-score', type=float, default=0.72)
    ap.add_argument('--reindex', action='store_true', help='强制重建迅雷索引')
    args = ap.parse_args()

    s = XL.session()
    if s is None:
        print('迅雷未登录：先跑 scripts/netdisk/xunlei_login.py')
        return 2

    if args.reindex or not os.path.exists(XINDEX):
        items = XL.build_index(s)
        json.dump({'at': time.strftime('%Y-%m-%d %H:%M'), 'items': items},
                  open(XINDEX, 'w', encoding='utf-8', newline='\n'),
                  ensure_ascii=False, indent=1)
    else:
        items = load(XINDEX, {'items': []})['items']
    print('迅雷云端索引 %d 项' % len(items))

    led = load(LEDGER, {'games': []})
    rs = load(OUT, {'meta': {}, 'games': {}})
    todo, nomatch, already = [], [], 0
    for g in led.get('games') or []:
        name = g.get('name') or ''
        if not name or (args.only and args.only not in name):
            continue
        if has_xunlei(name, g, rs):
            already += 1
            continue
        it, sc = RSH.pick(name, items, 'xunlei')
        if not it or sc < args.min_score:
            nomatch.append((name, round(sc, 2) if it else 0))
            continue
        todo.append((name, it, sc, g))

    print('已有迅雷链接 %d 个；可补 %d 个；云端没对上 %d 个'
          % (already, len(todo), len(nomatch)))
    for name, it, sc, _g in todo:
        print('  + %s -> %s (%s)' % (name, it['path'], round(sc, 3)))
    for name, sc in nomatch:
        print('  ? %s（最高分 %s）' % (name, sc))
    if args.dry:
        return 0
    if args.limit:
        todo = todo[:args.limit]

    ok = 0
    for name, it, sc, g in todo:
        try:
            got = XL.create_share(s, [it['id']], name)
        except Exception as e:
            print('  ✗ %s：%s' % (name, str(e)[:120]))
            continue
        st, txt = XL.get_share(s, got['share_id'], got.get('pwd') or '')
        alive = st == 'OK'
        url = got['url']
        if got.get('pwd') and 'pwd=' not in url:
            url = url + ('&' if '?' in url else '?') + 'pwd=' + got['pwd']
        row = rs.setdefault('games', {}).setdefault(name, {})
        row.setdefault('bvid', g.get('bvid') or '')
        row.setdefault('bili_url', g.get('bili_url') or g.get('release_url') or '')
        row.setdefault('links', {})['xunlei'] = {
            'url': url, 'pwd': got.get('pwd') or '', 'platform': 'xunlei',
            'share_id': got.get('share_id') or '', 'verified': alive,
            'check': 'share_status=%s %s' % (st, txt), 'path': it['path'],
            'created_at': time.strftime('%Y-%m-%d %H:%M'),
            'checked': 'ok' if alive else 'dead',
            'checked_at': time.strftime('%Y-%m-%d %H:%M'),
            'note': '迅雷云盘补档（首次补链接）',
        }
        json.dump(rs, open(OUT, 'w', encoding='utf-8', newline='\n'),
                  ensure_ascii=False, indent=1)
        ok += alive
        print('  ✓ %s [xunlei] %s pwd=%s %s' % (name, url, got.get('pwd'), st))
        time.sleep(1.0)

    print('完成：新建 %d 条（有效 %d），云端没货 %d 个' % (len(todo), ok, len(nomatch)))
    return 0


if __name__ == '__main__':
    sys.exit(main())

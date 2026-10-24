# -*- coding: utf-8 -*-
"""由 data/netdisk-links.json 生成 data/netdisk-status.json（供主页表格展示网盘状态）"""
import json, os, collections

BASE = os.path.dirname(os.path.abspath(__file__))
REPO = os.environ.get('QD_REPO') or os.path.normpath(os.path.join(BASE, '..', '..'))
SRC = os.path.join(REPO, 'data', 'netdisk-links.json')
DST = os.path.join(REPO, 'data', 'netdisk-status.json')

PLAT_ORDER = ['baidu', 'quark', 'xunlei', 'uc', 'pan123', 'ctfile', 'weiyun', 'lanzou', 'gdrive', 'other']


def main():
    d = json.load(open(SRC, encoding='utf-8'))
    checked = (d.get('meta') or {}).get('checked_at') or ''
    games = {}
    for g in d.get('games') or []:
        links = g.get('links') or []
        if not links:
            continue
        cnt = collections.Counter(L.get('status') for L in links)
        plats = {}
        for L in links:
            k = L.get('platform') or 'other'
            p = plats.setdefault(k, {'key': k, 'name': L.get('platform_name') or k,
                                     'ok': 0, 'dead': 0, 'unknown': 0, 'total': 0})
            p['total'] += 1
            st = L.get('status')
            if st in ('ok', 'dead'):
                p[st] += 1
            else:
                p['unknown'] += 1
        plist = sorted(plats.values(),
                       key=lambda x: (PLAT_ORDER.index(x['key']) if x['key'] in PLAT_ORDER else 99))
        games[g['name']] = {
            'total': len(links),
            'ok': cnt.get('ok', 0),
            'dead': cnt.get('dead', 0),
            'unknown': cnt.get('unknown', 0),
            'platforms': plist,
            'checked_at': checked,
        }
    out = {
        'checked_at': checked,
        'note': '网盘链接有效性检查结果，详情见 data/netdisk-links.md',
        'summary': (d.get('meta') or {}).get('summary') or {},
        'games': games,
    }
    json.dump(out, open(DST, 'w', encoding='utf-8', newline='\n'), ensure_ascii=False, indent=1)
    print('games', len(games), '->', DST)
    print('sample:', json.dumps(dict(list(games.items())[:1]), ensure_ascii=False)[:300])


if __name__ == '__main__':
    main()

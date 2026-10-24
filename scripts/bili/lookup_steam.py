# -*- coding: utf-8 -*-
"""给 Steam 平台的游戏补上商店页地址。

store.steampowered.com 在本机网络不可达，改走可访问的
steamcommunity.com/actions/SearchApps/<关键字>，它返回 appid + 官方名称，
拼出 https://store.steampowered.com/app/<appid>/ 即可。

匹配策略：依次用 原名 / 中文名 / 别名 查询，用名称相似度取最可信的一条，
低于阈值则记为未匹配，避免张冠李戴。
"""
import json
import os
import re
import time
import urllib.parse
import urllib.request
from difflib import SequenceMatcher

from taxonomy import cn_norm

BASE = os.path.dirname(os.path.abspath(__file__))
REPO = os.environ.get('QD_REPO') or os.path.normpath(os.path.join(BASE, '..', '..'))
RAW = os.environ.get('QD_CACHE') or os.path.normpath(os.path.join(BASE, '..', '..', '..', 'raw'))
CACHE = os.path.join(RAW, 'steam_lookup.json')

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
LIMIT = int(os.environ.get('QD_STEAM_LIMIT') or 0)


def search(term):
    url = 'https://steamcommunity.com/actions/SearchApps/' + urllib.parse.quote(term)
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode('utf-8') or '[]')


def score(a, b):
    ka, kb = cn_norm(a), cn_norm(b)
    if not ka or not kb:
        return 0.0
    if ka == kb:
        return 1.0
    if len(ka) >= 4 and (ka in kb or kb in ka):
        return 0.9
    return SequenceMatcher(None, ka, kb).ratio()


def best_match(cands, results):
    best = None
    for r in results or []:
        nm = r.get('name') or ''
        s = max((score(nm, c) for c in cands if c), default=0.0)
        if best is None or s > best[0]:
            best = (s, r)
    return best


def main():
    gpath = os.path.join(REPO, 'data', 'games.json')
    data = json.load(open(gpath, encoding='utf-8'))
    games = data['games']

    cache = {}
    if os.path.exists(CACHE):
        try:
            cache = json.load(open(CACHE, encoding='utf-8'))
        except Exception:
            cache = {}

    todo = [g for g in games if 'steam' in (g.get('plat') or []) and not (g.get('store') or {}).get('steam')]
    if LIMIT:
        todo = todo[:LIMIT]
    print(f'steam 平台游戏 {sum(1 for g in games if "steam" in (g.get("plat") or []))} / 待查询 {len(todo)}')

    ok = 0
    for i, g in enumerate(todo):
        gid = g['id']
        if gid in cache:
            continue
        cands = [c for c in [g.get('orig'), g.get('name')] + (g.get('alias') or []) if c]
        # 去掉「：副标题」再试一次，命中率更高
        cands += [c.split('：')[0] for c in cands if '：' in c]
        cands = list(dict.fromkeys([c.strip() for c in cands if c and c.strip()]))
        hit = None
        for c in cands[:4]:
            if len(cn_norm(c)) < 2:
                continue
            try:
                res = search(c)
            except Exception as e:
                print('  query fail', c, e)
                time.sleep(3)
                continue
            s, r = best_match(cands, res) or (0.0, None)
            if r and s >= 0.82:
                hit = {'appid': str(r.get('appid')), 'name': r.get('name'), 'score': round(s, 2), 'q': c}
                break
            time.sleep(0.7)
        cache[gid] = hit
        if hit:
            ok += 1
        time.sleep(0.7)
        if (i + 1) % 20 == 0:
            json.dump(cache, open(CACHE, 'w', encoding='utf-8'), ensure_ascii=False)
            print(f'  {i + 1}/{len(todo)} 命中 {ok}')

    json.dump(cache, open(CACHE, 'w', encoding='utf-8'), ensure_ascii=False)
    print('查询完成，命中', sum(1 for v in cache.values() if v), '/', len(cache))

    # 回写 games.json
    n = 0
    for g in games:
        h = cache.get(g['id'])
        if h:
            g['store'] = {'steam': {
                'appid': h['appid'],
                'name': h['name'],
                'url': 'https://store.steampowered.com/app/%s/' % h['appid'],
            }}
            if not g.get('url'):
                g['url'] = g['store']['steam']['url']
            n += 1
    data['steam_matched'] = n
    with open(gpath, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print('回写 games.json，steam 商店页', n)
    print('->', gpath, os.path.getsize(gpath) // 1024, 'KB')


if __name__ == '__main__':
    main()

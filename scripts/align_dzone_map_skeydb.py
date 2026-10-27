#!/usr/bin/env python3
"""Make a period's zone map (data/morimens/dzone-info/map-<p>.json, built from a client config dump by
convert_map_local.mjs + import_battle_nodes_local.mjs) agree with SKeyDB's released zone monster lists
(data/morimens/skeydb/dzone/seasons/<p>.json) that feed the threat-level dropdowns.

Why: a dump taken before a season starts can hold stale battle groups (period 72: the dump's zone 5 battles are exactly
SKeyDB's zone 2, zone 2 holds leftovers no released zone uses, zone 1 has two stale elites). Rules:
  --swap A,B   exchange the maps (nodes + battles) of zones A and B   (72: --swap 2,5)
  then every battle whose monsters are not all in SKeyDB's list for that zone is dropped from the map (the hex stays, without a
  monster group), so the map never shows a monster the dropdown does not list.
Usage: python3 scripts/align_dzone_map_skeydb.py <period> [--swap 2,5]
"""
import argparse, json
from pathlib import Path
ap = argparse.ArgumentParser(); ap.add_argument('period', type=int); ap.add_argument('--swap')
a = ap.parse_args(); p = a.period; R = Path(__file__).resolve().parent.parent
mp = R / f'data/morimens/dzone-info/map-{p}.json'; ip = R / f'data/morimens/dzone-info/{p}.json'
m = json.loads(mp.read_text(encoding='utf-8')); info = json.loads(ip.read_text(encoding='utf-8'))
sk = json.loads((R / f'data/morimens/skeydb/dzone/seasons/{p}.json').read_text(encoding='utf-8'))
idx = json.loads((R / 'data/morimens/skeydb/dzone/index.json').read_text(encoding='utf-8'))['monsters']
waves = {w['wave']: w for w in m['waves']}
if a.swap:
    x, y = map(int, a.swap.split(','))
    wx, wy = waves[x], waves[y]
    for k in ('nodes', 'enc'): wx[k], wy[k] = wy[k], wx[k]
art = lambda tid: info['monsters'].get(str(tid), {}).get('img')
for i, sw in enumerate(sk['waves'], 1):
    allowed = {idx[mid]['a'] for mid in sw['monsterIds'] if mid in idx}
    w = waves[i]; dropped = 0
    for b, e in list(w['enc'].items()):
        if not all(art(t['tid']) in allowed for t in e['m']):
            del w['enc'][b]; dropped += 1
            for n in w['nodes']:
                if n.get('b') == int(b): del n['b']
    print(f'zone {i}: kept {len(w["enc"])} battle groups, dropped {dropped}')
used = {str(t['tid']) for w in m['waves'] for e in w['enc'].values() for t in e['m']}
info['monsters'] = {k: v for k, v in info['monsters'].items() if k in used}
mp.write_text(json.dumps(m, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
ip.write_text(json.dumps(info, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')

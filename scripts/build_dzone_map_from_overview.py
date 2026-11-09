#!/usr/bin/env python3
"""Build data/morimens/dzone-info/map-<period>.json (+ the monster records the map needs in <period>.json) for one D-Zone period
from the maps already stored in the repo (data/morimens/maps/{index,maps,battles,monsters}.json, built from the client config dump).
Usage: python3 scripts/build_dzone_map_from_overview.py <period>
Each zone's map is the one of the top threat level (▼) stage '关卡@融蚀深渊<period>期G<zone>'; coordinates: r = 9 - y, c = x.
"""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
D = ROOT / 'data/morimens'
period = int(sys.argv[1])
# a dump taken before a season starts can hold stale battle groups for the zone maps (layout is reliable, monsters are not):
# when Morimens.Info.kr already has the season, its encounters (same battle ids) replace the dump's monster groups
import urllib.request
info_enc = {}
try:
    src = urllib.request.urlopen(f'https://raw.githubusercontent.com/Morimenz-kr/Morimens.Info.kr/main/data/dzone_season{period}.json', timeout=60).read()
    for w in json.loads(src)['waves']:
        for e in w.get('encounters', []):
            info_enc[e['battleId']] = {'t': e.get('battleType'), 'm': [{'tid': m['tid'], 'p': m['position']} for m in e.get('members', [])]}
except Exception as ex:
    print('Info.kr encounters not available:', ex)
rj = lambda p: json.loads((D / p).read_text(encoding='utf-8'))
idx, maps, battles, mon = rj('maps/index.json'), rj('maps/maps.json'), rj('maps/battles.json'), rj('maps/monsters.json')['monsters']
types = idx['nodeTypes']
KIND = {
    '战斗': {'k': 'combat', 'i': 'combat'}, '精英': {'k': 'combat', 'i': 'elite'}, '最终战': {'k': 'combat', 'i': 'boss'},
    '事件': {'k': 'event', 'i': 'event'}, '灰烬遗迹': {'k': 'reward', 'i': 'ash-ruins'}, '褪色遗骨': {'k': 'reward', 'i': 'bones'}, '黑印': {'k': 'reward', 'i': 'black-seal'},
    '锈蚀钥匙': {'k': 'mechanism', 'i': 'rusted-key'}, '锈蚀门扉': {'k': 'obstacle', 'i': 'locked-door'}, '幻象': {'k': 'obstacle', 'i': 'illusion'},
    '隧道': {'k': 'passage', 'i': 'tunnel'}, '单行密道': {'k': 'passage', 'i': 'passage-in'}, '密道出口': {'k': 'passage', 'i': 'passage-out'},
    '探照灯': {'k': 'utility', 'i': 'lamp'}, '不牢固的地板': {'k': 'terrain', 't': 'unstable-floor'}, '毒地板': {'k': 'terrain', 't': 'poison-floor'},
    '恶沼': {'k': 'terrain', 't': 'poison-floor'}, '开始': {'k': 'start'},
}
stages = {int(s['cn'][-1]): s for s in idx['stages'] if s.get('cn', '').startswith(f'关卡@融蚀深渊{period}期G')}
if len(stages) != 5: raise SystemExit(f'period {period}: found zones {sorted(stages)}')
waves, enc_monsters, unknown = [], set(), set()
for z in range(1, 6):
    cells = maps['maps'][str(stages[z]['m'][0])]
    names = {tuple(c[:2]): types[str(maps["nodes"][str(c[2])][0])][0] for c in cells}
    single = all(n in ('开始', '锈蚀门扉') for n in names.values()) and '开始' in names.values()  # boss-only arena: the start tile is the boss
    nodes, enc = [], {}
    for x, y, nid, *var in cells:
        t, bid = maps['nodes'][str(nid)]
        if single and not bid and var: bid = maps['nodes'].get(str(var[0]), [0, 0])[1]  # boss-only arena: the fight sits on the variant node of the start tile
        name = types[str(t)][0]
        d = KIND.get(name)
        if not d: unknown.add(name); continue
        d = dict(d)
        if single and name == '开始': d = {'k': 'combat', 'i': 'boss'}
        n = {'r': 9 - y, 'c': x, 'k': d['k'], **({'i': d['i']} if 'i' in d else {}), **({'t': d['t']} if 't' in d else {})}
        if d['k'] == 'combat' and bid and str(bid) in battles:
            n['b'] = bid
            bt, ms = battles[str(bid)]
            enc[bid] = info_enc.get(bid) or {'t': bt, 'm': [{'tid': m[0], 'p': m[1]} for m in ms]}
            enc_monsters.update(m['tid'] for m in enc[bid]['m'])
        nodes.append(n)
    # plain walkable tiles: grid positions that are neither a node cell nor a wall (void)
    mid = str(stages[z]['m'][0])
    taken = {(c[0], c[1]) for c in cells} | {tuple(w) for w in maps['walls'][mid]}
    nodes += [{'r': 9 - y, 'c': x, 'k': 'normal'} for y in range(1, 9) for x in range(1, 14) if (x, y) not in taken]
    nodes.sort(key=lambda n: (n['r'], n['c']))
    waves.append({'wave': z, 'nodes': nodes, 'enc': enc})
out = D / f'dzone-info/map-{period}.json'
out.write_text(json.dumps({'period': period, 'source': 'repo map overview (client config)', 'waves': waves}, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print('map', period, '/'.join(str(len(w['nodes'])) for w in waves), 'battles', sum(len(w['enc']) for w in waves), 'unknown node types:', sorted(unknown))
# monster records for the guide: reuse the latest earlier record per tid, new ones from the overview (name / art / class)
prior = {}
for p in range(period - 1, 66, -1):
    f = D / f'dzone-info/{p}.json'
    if f.exists():
        for tid, m in json.loads(f.read_text(encoding='utf-8')).get('monsters', {}).items(): prior.setdefault(str(tid), m)
info, new = {}, 0
for tid in sorted(enc_monsters):
    k = str(tid)
    if k in prior: info[k] = prior[k]; continue
    m = mon.get(k, {})
    info[k] = {'zh': m.get('n', ''), 'img': m.get('i'), 'cls': {'Boss': 'Boss', 'Elite': 'Elite'}.get(m.get('c'), 'Common'), 'fromLocalTable': True}; new += 1
info_path = D / f'dzone-info/{period}.json'
if not info_path.exists():  # the intents sync (Info.kr) writes the full file; this is only a fallback
  info_path.write_text(json.dumps({'period': period, 'generatedAt': None, 'source': 'repo map overview (client config); intents reused from earlier seasons', 'monsters': info, 'waves': []}, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print('monsters', len(info), 'new', new, '(kept the existing file)' if False else '')

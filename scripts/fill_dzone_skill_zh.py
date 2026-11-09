#!/usr/bin/env python3
"""Give every monster skill used in data/morimens/dzone-info/<period>.json an official Chinese description in
data/morimens/game/dzone-translations.json (skills.<id>.zd / ed), taken from the game's own skill table that the map overview
stores in data/morimens/maps/monsters.json (descriptions use {N} placeholders; the guide uses [Label:ArgN]).
Existing translations are never overwritten. Usage: python3 scripts/fill_dzone_skill_zh.py
"""
import glob, json, re
from pathlib import Path
D = Path(__file__).resolve().parent.parent / 'data/morimens'
tp = D / 'game/dzone-translations.json'
tr = json.loads(tp.read_text(encoding='utf-8'))
game = json.loads((D / 'maps/monsters.json').read_text(encoding='utf-8'))['skills']
ko = re.compile('[가-힯]')
used = {}
for f in glob.glob(str(D / 'dzone-info/[0-9]*.json')):
    for m in json.loads(Path(f).read_text(encoding='utf-8')).get('monsters', {}).values():
        for s in m.get('sk', []): used[str(s['id'])] = s
added = missing = 0
for sid, s in used.items():
    cur = tr['skills'].get(sid) or {}
    if cur.get('zd'): continue
    g = game.get(sid)
    if not g or not g[0]:
        if ko.search(s.get('d', '')): missing += 1
        continue
    labels = g[5] if len(g) > 5 and isinstance(g[5], dict) else {}
    zd = re.sub(r'\{(\d+)\}', lambda m: f'[{labels[m.group(1)]}:Arg{m.group(1)}]' if m.group(1) in labels else f'[Arg{m.group(1)}]', g[0])
    tr['skills'][sid] = {**cur, 'zd': zd, 'ed': cur.get('ed') or zd}
    added += 1
tp.write_text(json.dumps(tr, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
# monster descriptions: the game's own text from the overview table
gm = json.loads((D / 'maps/monsters.json').read_text(encoding='utf-8'))['monsters']
mon_added = 0
for f in glob.glob(str(D / 'dzone-info/[0-9]*.json')):
    for tid, m in json.loads(Path(f).read_text(encoding='utf-8')).get('monsters', {}).items():
        cur = tr['monsters'].get(str(tid)) or {}
        g = gm.get(str(tid))
        if not cur.get('zd') and g and g.get('d'):
            tr['monsters'][str(tid)] = {**cur, 'zd': g['d'], 'ed': cur.get('ed') or g['d']}; mon_added += 1
tp.write_text(json.dumps(tr, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print('monster descriptions added', mon_added)
print('skill descriptions added', added, 'still without Chinese', missing)

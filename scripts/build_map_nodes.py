"""Build data/morimens/game/map-nodes.json: official names and descriptions of D-Zone map node types
(game localization table, MapNodeType_* rows, zh + en). Entries without an official description are AI-assisted (src "ai").

Usage: python scripts/build_map_nodes.py PATH_TO_MORIMENS_LOCALIZATIONS
"""
import json
import re
import sys
from pathlib import Path

import openpyxl

root = Path(sys.argv[1])
base = Path(__file__).resolve().parents[1]
sheet = openpyxl.load_workbook(root / 'TRANSLATIONS/00_SOURCE/Source Sheets.xlsx', read_only=True, data_only=True)['Gameplay']
rows = {}
for row in sheet.values:
    if len(row) < 9:
        continue
    m = re.match(r'MapNodeType_(\d+)_(Name|Desc)$', str(row[0]))
    if m:
        rows.setdefault(m.group(1), {})[m.group(2)] = (str(row[7] or '').replace('\\n', ' ').strip(), str(row[8] or '').replace('\\n', ' ').strip())

# map icon / kind / texture (Morimens.Info.kr layout data) -> MapNodeType id
IDS = {'combat': '18431', 'elite': '18411', 'boss': '18396', 'event': '18394', 'bones': '76417', 'ash-ruins': '76256', 'black-seal': '18404',
       'locked-door': '18422', 'rusted-key': '18425', 'illusion': '18427', 'lamp': '18421', 'passage-in': '18408', 'passage-out': '18406', 'tunnel': '18417',
       'unstable-floor': '18424'}
out = {}
for key, id_ in IDS.items():
    r = rows[id_]
    name, desc = r['Name'], r.get('Desc', ('', ''))
    out[key] = {'zh': name[0], 'en': name[1], 'dz': desc[0] if desc[0] != name[0] else '', 'de': desc[1] if desc[1] != name[1] else '', 's': 'game'}
# no official description in the table
out['start'] = {'zh': '起点', 'en': 'Start', 'dz': '本区域的出发位置。', 'de': 'Where this zone starts.', 's': 'ai'}
out['normal'] = {'zh': '普通节点', 'en': 'Normal node', 'dz': '没有特殊效果的可通行节点。', 'de': 'A walkable node without special effects.', 's': 'ai'}
out['poison-floor'] = {'zh': '毒气地面', 'en': 'Poison floor', 'dz': '紫色格子。游戏内没有官方说明，推测为带有毒气效果的危险地面，经过前请留意。', 'de': 'Purple tile. No official description exists; presumably a hazardous floor with a poison-gas effect, so be careful when crossing it.', 's': 'ai'}
out['unstable-floor']['dz'] = '不牢固的地板（官方只给出名称）。推测踏过后可能塌陷，无法折返。'
out['unstable-floor']['de'] = 'Unstable Floor (the game only gives the name). Presumably it can collapse after being crossed, so you may not be able to go back.'
out['unstable-floor']['s'] = 'game+ai'
dest = base / 'data/morimens/game/map-nodes.json'
dest.write_text(json.dumps({'source': 'BIAVGit/Morimens-Localizations (MapNodeType rows); entries marked ai / game+ai are AI-assisted', 'nodes': out}, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
print(len(out), 'node types')

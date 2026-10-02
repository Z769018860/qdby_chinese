"""Build zh/en names and descriptions for D-Zone monsters, skills and states from the BIAVGit/Morimens-Localizations
game translation table (TRANSLATIONS/00_SOURCE/Source Sheets.xlsx, 'Gameplay' sheet; CN + EN columns),
joined by game ids to data/morimens/dzone-info/<season>.json (ids come from Morimens.Info.kr).

Usage: python scripts/build_dzone_translations.py PATH_TO_MORIMENS_LOCALIZATIONS
Requires openpyxl. Output: data/morimens/game/dzone-translations.json
"""
import json
import re
import sys
from pathlib import Path

import openpyxl

root = Path(sys.argv[1])
base = Path(__file__).resolve().parents[1]
sheet = openpyxl.load_workbook(root / 'TRANSLATIONS/00_SOURCE/Source Sheets.xlsx', read_only=True, data_only=True)['Gameplay']
table = {}
for row in sheet.values:
    if len(row) < 9:
        continue
    key = str(row[0] or '')
    if key.startswith(('MonsterConfig_', 'Skill_', 'State_', 'TagConfig_')) and (row[7] or row[8]):
        table[key] = (str(row[7] or '').strip(), str(row[8] or '').strip())

def clean(text):
    # <Damage:[Damage:Arg1]> -> [Damage:Arg1];  <MadnessIconKeywords:Madness> -> Madness
    text = re.sub(r'<[A-Za-z]+:(\[[^\]]*\])>', r'\1', text)
    text = re.sub(r'<[A-Za-z]+:([^>]*)>', r'\1', text)
    return text.replace('\\n', '\n').strip()

def pick(kind, id_, fields):
    for field in fields:
        got = table.get(f'{kind}_{id_}_{field}')
        if got and (got[0] or got[1]):
            return got
    return None

out = {'monsters': {}, 'skills': {}, 'states': {}, 'characteristics': {}}
for file in sorted((base / 'data/morimens/dzone-info').glob('[0-9]*.json')):
    season = json.loads(file.read_text(encoding='utf-8'))
    for tid, monster in season['monsters'].items():
        name, desc = pick('MonsterConfig', tid, ['MonsterName']), pick('MonsterConfig', tid, ['Desc'])
        if name:
            out['monsters'][tid] = {'zh': name[0], 'en': name[1], **({'zd': clean(desc[0]), 'ed': clean(desc[1])} if desc else {})}
        for skill in monster['sk']:
            sid = str(skill['id'])
            if sid in out['skills']:
                continue
            n, d = pick('Skill', sid, ['Name']), pick('Skill', sid, ['Desc', 'BattleDesc'])
            if n or d:
                out['skills'][sid] = {k: v for k, v in {'zn': n and n[0], 'en': n and n[1], 'zd': d and clean(d[0]), 'ed': d and clean(d[1])}.items() if v}
        for state in monster['st']:
            sid = str(state['id'])
            if sid in out['states']:
                continue
            n, d = pick('State', sid, ['Name']), pick('State', sid, ['Desc'])
            if n or d:
                out['states'][sid] = {k: v for k, v in {'zn': n and n[0], 'en': n and n[1], 'zd': d and clean(d[0]), 'ed': d and clean(d[1])}.items() if v}

# monster characteristics (TagConfig): joined by English name to the SKeyDB characteristic names
index = json.loads((base / 'data/morimens/skeydb/dzone/index.json').read_text(encoding='utf-8'))
tags = {}
for key, (cn, en) in table.items():
    m = re.match(r'TagConfig_(\d+)_TagName$', key)
    if m:
        desc = table.get(f'TagConfig_{m.group(1)}_TagDesc', ('', ''))
        tags[en.strip().lower()] = {'zh': cn, 'zd': clean(desc[0])}
ALIAS = {'mutant': 'aberration'}  # SKeyDB 'Mutant' is TagConfig 'Aberration' (异变体)
out['characteristics'] = {c['n']: tags[ALIAS.get(c['n'].lower(), c['n'].lower())] for c in index['characteristics'].values() if ALIAS.get(c['n'].lower(), c['n'].lower()) in tags}

dest = base / 'data/morimens/game/dzone-translations.json'
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(json.dumps({'source': 'BIAVGit/Morimens-Localizations (Source Sheets.xlsx, Gameplay sheet), joined by game ids', 'license': 'Community translation project; game text remains property of Qookka Games', **out}, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print({k: len(v) for k, v in out.items()})

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

sys.path.insert(0, str(Path(__file__).resolve().parent / 'data'))
from dzone_ko_names import NAMES  # noqa: E402
from dzone_ko_texts import TEXTS  # noqa: E402
from dzone_ko_texts2 import TEXTS2  # noqa: E402
from dzone_monsters_zh import MONSTERS as ZH_MONSTERS  # noqa: E402

root = Path(sys.argv[1])
base = Path(__file__).resolve().parents[1]
sheet = openpyxl.load_workbook(root / 'TRANSLATIONS/00_SOURCE/Source Sheets.xlsx', read_only=True, data_only=True)['Gameplay']
table = {}
for row in sheet.values:
    if len(row) < 9:
        continue
    key = str(row[0] or '')
    if key.startswith(('MonsterConfig_', 'Skill_', 'State_', 'TagConfig_', 'RelicConfig_', 'Item_')) and (row[7] or row[8]):
        table[key] = (str(row[7] or '').strip(), str(row[8] or '').strip())

def clean(text):
    # <Damage:[Damage:Arg1]> -> [Damage:Arg1];  <MadnessIconKeywords:Madness> -> Madness
    text = re.sub(r'<[A-Za-z_0-9]+:\s*(\[[^\]]*\])>', r'\1', text)
    text = re.sub(r'<[A-Za-z_0-9]+:\s*([^>]*)>', r'\1', text)
    return text.replace('\\n', '\n').strip()

CJK = re.compile(r'[\u4e00-\u9fff]')
HANGUL = re.compile(r'[\uac00-\ud7af]')

def valid(zh, en):
    # the table's EN column holds untranslated Chinese/Korean for newer rows; drop unusable sides
    zh = zh if zh and CJK.search(zh) and not HANGUL.search(zh) else ''
    en = en if en and not CJK.search(en) and not HANGUL.search(en) else ''
    return zh, en


def pick(kind, id_, fields):
    for field in fields:
        got = table.get(f'{kind}_{id_}_{field}')
        if got:
            got = valid(*got)
            if got[0] or got[1]:
                return got
    return None

out = {'monsters': {}, 'skills': {}, 'states': {}, 'characteristics': {}, 'extra': {}, 'skMonsters': {}, 'relics': {}}
for file in sorted((base / 'data/morimens/dzone-info').glob('[0-9]*.json')):
    season = json.loads(file.read_text(encoding='utf-8'))
    for tid, monster in season['monsters'].items():
        name, desc = pick('MonsterConfig', tid, ['MonsterName']), pick('MonsterConfig', tid, ['Desc'])
        if name:
            out['monsters'][tid] = {'zh': clean(name[0]), 'en': clean(name[1]), **({'zd': clean(desc[0]), 'ed': clean(desc[1])} if desc else {})}
        for skill in monster['sk']:
            sid = str(skill['id'])
            if sid in out['skills']:
                continue
            n, d = pick('Skill', sid, ['Name']), pick('Skill', sid, ['Desc', 'BattleDesc'])
            if n or d:
                out['skills'][sid] = {k: v for k, v in {'zn': n and clean(n[0]), 'en': n and clean(n[1]), 'zd': d and clean(d[0]), 'ed': d and clean(d[1])}.items() if v}
        for state in monster['st']:
            sid = str(state['id'])
            if sid in out['states']:
                continue
            n, d = pick('State', sid, ['Name']), pick('State', sid, ['Desc'])
            if n or d:
                out['states'][sid] = {k: v for k, v in {'zn': n and clean(n[0]), 'en': n and clean(n[1]), 'zd': d and clean(d[0]), 'ed': d and clean(d[1])}.items() if v}

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

# Korean source strings that the official table does not contain yet (new seasons): AI-assisted translations kept in scripts/data
out['extra'] = {ko: {'zh': zh, 'en': en} for ko, (zh, en) in {**NAMES, **TEXTS, **TEXTS2}.items()}

# SKeyDB monster id -> zh name / description, joined through the English name / description of MonsterConfig
by_en_name, by_en_desc, desc_by_id, name_ids = {}, {}, {}, {}
for key, (cn, en) in table.items():
    m = re.match(r'MonsterConfig_(\d+)_(MonsterName|Desc)$', key)
    if not m:
        continue
    cn, en = valid(cn, en)
    if m.group(2) == 'MonsterName':
        if cn and en:
            by_en_name.setdefault(re.sub(r'\W+', '', clean(en).lower()), set()).add(clean(cn))
            name_ids.setdefault(re.sub(r'\W+', '', clean(en).lower()), set()).add(m.group(1))
    else:
        if cn:
            desc_by_id[m.group(1)] = clean(cn)
        if cn and en:
            by_en_desc.setdefault(re.sub(r'\W+', '', clean(en).lower()), set()).add(clean(cn))
out['skMonsters'] = {}
for mid, mon in index['monsters'].items():
    k = re.sub(r'\W+', '', mon['n'].lower())
    nm = by_en_name.get(k, set())
    ds = by_en_desc.get(re.sub(r'\W+', '', mon['d'].lower()), set())
    if not ds:  # same MonsterConfig id carries the name and the description
        ds = {desc_by_id[i] for i in name_ids.get(k, ()) if i in desc_by_id}
    rec = {}
    if len(nm) == 1:
        rec['zh'] = next(iter(nm))
    if len(ds) == 1:
        rec['zd'] = next(iter(ds))
    if rec:
        out['skMonsters'][mid] = rec

for mid in index['monsters']:
    manual = ZH_MONSTERS.get(mid[-4:])
    if manual:
        rec = out['skMonsters'].setdefault(mid, {})
        if manual[0] and 'zh' not in rec:
            rec['zh'] = manual[0]
        if manual[1] and 'zd' not in rec:
            rec['zd'] = manual[1]

# creation (relic) names: English -> Chinese (unique matches only) + the four realm rings
names = {}
for key, (cn, en) in table.items():
    if re.match(r'(RelicConfig|Item|Skill)_\d+_(Name|RelicName)$', key) and cn and en:
        base_en = re.sub(r'[+☆\s]+$', '', re.sub(r'^[☆\s]+', '', clean(en))).strip().lower()
        base_cn = re.sub(r'[+☆]', '', clean(cn)).strip()
        names.setdefault(base_en, set()).add(base_cn)
out['relics'] = {}
for rel in index['relics'].values():
    got = names.get(re.sub(r'[+☆\s]+$', '', rel['n'].strip().lower()), set())
    if len(got) == 1:
        out['relics'][rel['n']] = next(iter(got))
out['relics'].update({'Aequor Ring': '深海戒指', 'Caro Ring': '血肉戒指', 'Chaos Ring': '混沌戒指', 'Ultra Ring': '超维戒指', 'Crystal Globe': '水晶球'})

dest = base / 'data/morimens/game/dzone-translations.json'
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(json.dumps({'source': 'BIAVGit/Morimens-Localizations (Source Sheets.xlsx, Gameplay sheet), joined by game ids', 'license': 'Community translation project; game text remains property of Qookka Games', **out}, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print({k: len(v) for k, v in out.items()})

"""Build D-Zone name translations from BIAVGit/Morimens-Localizations.

Usage: python scripts/build_dzone_localization.py PATH_TO_MORIMENS_LOCALIZATIONS
Requires openpyxl. Only unambiguous English-name matches are emitted.
"""
import csv
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import openpyxl

root = Path(sys.argv[1])
base = Path(__file__).resolve().parents[1]
gameplay = root / 'TRANSLATIONS/00_SOURCE/Source Sheets.xlsx'
ko_dir = root / 'TRANSLATIONS/01_UPLOAD_YOUR_CONTRIBUTIONS/ko'
index = json.loads((base / 'data/morimens/skeydb/dzone/index.json').read_text(encoding='utf-8'))

def norm(value):
    return re.sub(r'[^a-z0-9]', '', str(value).lower())

names = defaultdict(list)
sheet = openpyxl.load_workbook(gameplay, read_only=True, data_only=True)['Gameplay']
for row in sheet.values:
    key = str(row[0] or '')
    if key.startswith('MonsterConfig_') and key.endswith('_MonsterName') and row[7] and row[8]:
        names[norm(row[8])].append((key, str(row[7]).strip(), str(row[8]).strip()))

korean = {}
for file in sorted(ko_dir.glob('*.csv')):
    with file.open(encoding='utf-8-sig', newline='') as stream:
        for row in csv.reader(stream):
            if len(row) > 8 and row[0].startswith('MonsterConfig_') and row[0].endswith('_MonsterName') and row[8].strip():
                korean[row[0]] = row[8].strip()

records = {}
for monster_id, monster in index['monsters'].items():
    matches = names[norm(monster['n'])]
    if not matches or len({item[1] for item in matches}) != 1:
        continue
    keys = [item[0] for item in matches]
    ko_values = {korean[key] for key in keys if key in korean}
    record = {'zh': matches[0][1], 'en': monster['n'], 'sourceKeys': keys}
    if len(ko_values) == 1:
        record['ko'] = ko_values.pop()
    records[monster_id] = record

out = base / 'data/morimens/game/dzone-localization.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps({'source': 'BIAVGit/Morimens-Localizations; joined to dansa/SKeyDB by unique English monster name', 'monsters': records}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'{len(records)} / {len(index["monsters"])} monsters matched, {sum("ko" in x for x in records.values())} with Korean')

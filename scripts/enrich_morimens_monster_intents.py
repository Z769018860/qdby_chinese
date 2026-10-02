"""Add unambiguous Chinese skill names from Morimens-Localizations.

Usage: python scripts/enrich_morimens_monster_intents.py PATH_TO_MORIMENS_LOCALIZATIONS
"""
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import openpyxl

root = Path(__file__).resolve().parents[1]
source = Path(sys.argv[1]) / 'TRANSLATIONS/00_SOURCE/Source Sheets.xlsx'
target = root / 'data/morimens/kaiden/intent-rotations.json'

def norm(value):
    return re.sub(r'[^a-z0-9]', '', str(value).lower())

names = defaultdict(set)
sheet = openpyxl.load_workbook(source, read_only=True, data_only=True)['Gameplay']
for row in sheet.values:
    key = str(row[0] or '')
    if len(row) > 8 and key.startswith('Skill_') and key.endswith('_Name') and row[7] and row[8]:
        names[norm(row[8])].add(str(row[7]).strip())

data = json.loads(target.read_text(encoding='utf-8'))
count = 0
for record in data['monsters'].values():
    for intent in record['rotation']:
        match = names[norm(intent['name'])]
        if len(match) == 1:
            intent['nameZh'] = next(iter(match))
            count += 1
target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Chinese names matched for {count} intent rows')

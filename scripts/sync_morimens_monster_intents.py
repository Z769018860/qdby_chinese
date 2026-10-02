"""Import enemy rotations from Kaiden.gg's public Morimens monster pages.

Usage: python scripts/sync_morimens_monster_intents.py [season number]
The optional season number limits the initial sync for inspection.
"""
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

BASE = 'https://www.kaiden.gg'
root = Path(__file__).resolve().parents[1]
target = root / 'data/morimens/kaiden/intent-rotations.json'
existing = json.loads(target.read_text(encoding='utf-8')).get('monsters', {}) if target.exists() else {}
index = json.loads((root / 'data/morimens/skeydb/dzone/index.json').read_text(encoding='utf-8'))
season = int(sys.argv[1]) if len(sys.argv) > 1 else None
ids = set(index['monsters'])
if season is not None:
    doc = json.loads((root / f'data/morimens/skeydb/dzone/seasons/{season}.json').read_text(encoding='utf-8'))
    ids = {m['monsterId'] for wave in doc['waves'] for alert in wave['alerts'] for m in alert['monsters']}

def norm(value):
    return re.sub(r'[^a-z0-9]', '', value.lower())

listing = BeautifulSoup(requests.get(BASE + '/morimens/monsters/', timeout=20).text, 'html.parser')
slugs = {}
for link in listing.select('a[href^="/morimens/monsters/"]'):
    path = urlparse(link.get('href', '')).path
    slug = path.rstrip('/').split('/')[-1]
    slugs[norm(slug)] = path

targets = {}
for monster_id in ids:
    name = index['monsters'][monster_id]['n']
    path = slugs.get(norm(name))
    if path and monster_id not in existing:
        targets[monster_id] = path

def fetch(item):
    monster_id, path = item
    response = requests.get(urljoin(BASE, path), timeout=20)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, 'html.parser')
    heading = soup.find(lambda tag: tag.name == 'h3' and tag.get_text(' ', strip=True) == 'Rotation')
    if not heading:
        return monster_id, None
    rotation = []
    for block in heading.parent.select(':scope > div > div'):
        name = block.select_one('p.font-bold')
        effect = block.select_one('p.leading-relaxed')
        kind = block.select_one('span.uppercase')
        if name and effect:
            rotation.append({'name': name.get_text(' ', strip=True), 'type': kind.get_text(' ', strip=True) if kind else '', 'effect': effect.get_text(' ', strip=True)})
    return monster_id, {'url': urljoin(BASE, path), 'rotation': rotation} if rotation else None

out = dict(existing)
with ThreadPoolExecutor(max_workers=3) as pool:
    futures = [pool.submit(fetch, item) for item in targets.items()]
    for future in as_completed(futures):
        try:
            monster_id, record = future.result()
            if record:
                out[monster_id] = record
        except requests.RequestException as exc:
            print(f'Fetch failed: {exc}', file=sys.stderr)

target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps({'source': BASE + '/morimens/monsters/', 'monsters': dict(sorted(out.items()))}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Found {len(targets)} matching pages; extracted {len(out)} rotations for {len(ids)} requested monsters')

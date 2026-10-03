"""Build data/morimens/game/glossary.json: English <-> Chinese professional glossary (names + game terms) for the site's
"术语对照" dialog, and fill missing Chinese names (key tokens, creations, dimensional images) from the game translation table.

Sources (field s): wiki = 忘却前夜中文维基 (HuijiWiki data under data/morimens/huiji), game = BIAVGit/Morimens-Localizations
game table, site = names already used on this site, ai = AI-assisted (no official name found).
If a name differs between sources the other candidates are listed in alt, e.g. [["恩赐之血","site"]].

Usage: python scripts/build_glossary.py PATH_TO_MORIMENS_LOCALIZATIONS   (run scripts/build_morimens_tier_pool.mjs afterwards)
"""
import glob
import json
import re
import sys
from pathlib import Path

import openpyxl

root = Path(sys.argv[1])
base = Path(__file__).resolve().parents[1]
D = base / 'data/morimens'
CJK = re.compile(r'[一-鿿]')
HANGUL = re.compile(r'[가-힯]')


def load(p, default=None):
    try:
        return json.loads((base / p).read_text(encoding='utf-8'))
    except Exception:
        return default


def strip(s):
    return re.sub(r'<[^>]*:|>', '', str(s or '')).strip()


def norm(s):
    return re.sub(r'[^a-z0-9]+', '', strip(s).replace('"', '').lower().rstrip('+'))


# ---- game table: English name -> Chinese names, by id family ----
sheet = openpyxl.load_workbook(root / 'TRANSLATIONS/00_SOURCE/Source Sheets.xlsx', read_only=True, data_only=True)['Gameplay']
fam = {}  # family -> norm(en) -> set(zh)
for row in sheet.values:
    if len(row) < 9:
        continue
    key = str(row[0] or '')
    m = re.match(r'(RelicConfig|Skill|Item|State|TagConfig|TrinketSuitEffect|AwakerPotency)_\d+_Name$', key)
    if not m:
        continue
    zh, en = strip(row[7]), strip(row[8])
    if not (zh and en and CJK.search(zh) and not HANGUL.search(zh) and not CJK.search(en) and not HANGUL.search(en)):
        continue
    fam.setdefault(m.group(1), {}).setdefault(norm(en), set()).add(zh)


def table_names(en, families):
    out = []
    for f in families:
        for z in sorted(fam.get(f, {}).get(norm(en), [])):
            if z not in out:
                out.append(z)
    return out


pool = load('data/morimens/game/tier-pool.json')['kinds']
trans = load('data/morimens/game/dzone-translations.json', {})
site_src = (base / 'morimens-dtide-usage.js').read_text(encoding='utf-8')


def js_dict(name):
    m = re.search(r'const %s=(\{.*?\});' % name, site_src, re.S)
    try:
        return json.loads(re.sub(r"'", '"', m.group(1))) if m else {}
    except Exception:
        try:
            return eval(m.group(1).replace('true', 'True')) if m else {}
        except Exception:
            return {}


site_creation = {**js_dict('creationZhOfficial'), **{k.strip('"'): v for k, v in js_dict('creationZh').items()}}
site_creation = {k: re.sub(r'^「|」$', '', v) for k, v in site_creation.items()}

entries = []
aw_zh = {}


def add(kind, en, zh, src, alts=()):
    en = strip(en).strip('"') if kind != 'relic' else strip(en)
    if not en:
        return
    alt = []
    plain = lambda v: re.sub(r'^(受祝|负罪)·|[+＋☆「」]', '', str(v or ''))
    for z, s in alts:
        if z and plain(z) != plain(zh) and all(plain(z) != plain(a[0]) for a in alt):
            alt.append([z, s])
    e = {'k': kind, 'en': en, 'zh': zh or '', 's': src if zh else ''}
    if alt:
        e['alt'] = alt
    entries.append(e)


for it in pool['awakener']:
    aw_zh[norm(it['en'])] = it['zh']
    add('awakener', it['en'], it['zh'], 'wiki', [(z, 'game') for z in table_names(it['en'], ['AwakerPotency'])])
for it in pool['wheel']:
    z, src = it['zh'], 'wiki'
    t = table_names(it['en'], ['Item'])
    if not z and t:
        z, src = t[0], 'game'
    add('wheel', it['en'], z, src, [(x, 'game') for x in t])
for it in pool['relic']:
    en = it['en']
    z, src = it['zh'], 'game'
    t = table_names(en, ['RelicConfig'])
    if not z and t:
        z = t[0]
    m = re.match(r'Dimensional Image:\s*"?(.+?)"?$', en)
    if not z and m and aw_zh.get(norm(m.group(1))):
        z, src = '维度影像·' + aw_zh[norm(m.group(1))], 'wiki'
    alts = [(x, 'game') for x in t]
    if site_creation.get(en):
        alts.append((site_creation[en], 'site'))
    add('relic', en, z, src, alts)
for it in pool['posse']:
    t = table_names(it['en'], ['Skill'])
    add('posse', it['en'], it['zh'] or (t[0] if t else ''), 'game', [(x, 'game') for x in t])
for it in pool['covenant']:
    t = table_names(it['en'], ['TrinketSuitEffect'])
    add('covenant', it['en'], it['zh'] or (t[0] if t else ''), 'site', [(x, 'game') for x in t])
seen = set()
for it in pool['monster']:
    if norm(it['en']) in seen:
        continue
    seen.add(norm(it['en']))
    add('monster', it['en'], it['zh'], 'game')

# ---- game terms (keywords used in effect texts) ----
terms = {}
for kind in ['wheels', 'relics', 'posses', 'covenants']:
    for f in glob.glob(str(D / f'skeydb/public-v3/records/{kind}/*.json')):
        d = json.loads(Path(f).read_text(encoding='utf-8'))
        tpls = [d.get('descriptionTemplate') or ''] + [s.get('descriptionTemplate', '') for s in d.get('setEffects', [])]
        for t in tpls:
            for m in re.findall(r'\{(?!plural|ordinal)(?:derived:|overlay:)?([^{}|]+)\}', t):
                terms[m] = terms.get(m, 0) + 1
MANUAL = {'Team Unique': '队伍唯一', 'Caro': '血肉', 'Aequor': '深海', 'Ultra': '超维', 'Chaos': '混沌', 'Ultra Round': '超维回合', 'Ultra Rounds': '超维回合', 'Astral Reign': '星界统御',
          'Fleeting': '转瞬即逝', 'Pure DMG': '纯粹伤害', 'Palette': '调色板', 'Color': '颜色', 'Resonance': '共鸣', 'Steal': '偷取', 'Creativity': '创意', 'Undertow': '暗流',
          'Perception Warp': '感知扭曲', 'Ashen Ruins': '灰烬废墟', 'Orisons': '刻印', 'Prepare 1': '预备 1', 'Paintover': '涂改', 'Lost': '迷失', 'Sacred Heart': '圣心',
          'Exhausted': '已消耗', 'Blackened Flame': '焦黑之焰', 'Spellbound': '咒缚', 'Soul Synchronization': '灵魂同步', 'Mortal Sojourn': '凡世之旅', 'Alight': '燃起',
          'Dawn': '黎明', 'Depletion': '枯竭', 'Multiply': '倍增', 'Golden Harmony': '黄金和谐', 'Occult Research': '神秘学研究', 'Transit Fatigue': '旅途疲劳', 'Crumble': '崩解',
          'Divine Dedication': '神圣奉献', 'Endless Combustion': '无尽燃烧', 'Guilt': '罪责', 'Seal': '封印', 'Daze': '恍惚', 'Rebirth': '重生', 'Formless': '无形',
          'Forbidden Truth': '禁忌真相', 'Discovered': '被发现', 'Destroyed': '被销毁', 'Devoured': '被吞噬', 'Countdown': '倒计时', 'Falling Upward': '向上坠落', 'Ablaze': '燃烧',
          'Perception': '感知', 'Sakura Blossoms': '樱吹雪', 'Hanafubuki': '花吹雪', 'Ichigo Ichie': '一期一会', 'Mental Interference': '精神干扰', 'Fall into Night': '坠入夜色',
          'Dimension Shuttle': '维度穿梭', 'Poetry Pages': '诗页', 'Poems': '诗篇', 'Pack Hunt': '群猎', 'Eternal Weave': '永恒编织', 'Weaver': '织者', 'Infinite Threads': '无尽之线',
          'Vortex! Shell!': 'Vortex! Shell!', 'Sin Mark': '罪印', 'Gaunt': '憔悴', 'Mundus Severance': '界域断绝', 'Waltz of Lemuria': '利莫里亚华尔兹', 'Collaboration': '协作',
          'Stakes of Wisdom': '智慧之桩', 'Dreaming of Wonderland': '梦游仙境', 'Birth Ritual': '诞生仪式', 'Private Afternoon': '私人午后', 'Vernal Message': '春之讯息'}
for t, c in sorted(terms.items(), key=lambda x: -x[1]):
    tn = table_names(t, ['State', 'Skill', 'TagConfig', 'Item'])
    if tn:
        add('term', t, ' / '.join(tn[:2]), 'game', [(x, 'game') for x in tn[2:]])
    elif t in MANUAL:
        add('term', t, MANUAL[t], 'ai')
    else:
        add('term', t, '', 'ai')

dest = D / 'game/glossary.json'
dest.write_text(json.dumps({'version': 1, 'generatedAt': __import__('datetime').datetime.utcnow().isoformat() + 'Z', 'entries': entries}, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
import collections
c = collections.Counter((e['k'], bool(e['zh'])) for e in entries)
print(len(entries), 'entries;', {k: f"{c[(k, True)]}/{c[(k, True)] + c[(k, False)]}" for k in ['awakener', 'wheel', 'relic', 'posse', 'covenant', 'monster', 'term']}, '; with alternatives:', sum(1 for e in entries if e.get('alt')))

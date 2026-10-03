"""Build data/morimens/game/tier-details.json: hover / explanation details for the custom tier list
(awakeners, wheels, creations, key tokens, covenants) in zh + en.

English text comes from the SKeyDB records (description templates + args). Chinese text comes from the
BIAVGit/Morimens-Localizations game table (Gameplay sheet), joined by English name; a Chinese description is only used
when, after filling the same args, its English counterpart in the table matches the SKeyDB description (otherwise the
English text is kept so that numbers are never wrong).

Usage: python scripts/build_tier_details.py PATH_TO_MORIMENS_LOCALIZATIONS
Output entry: "<kind>:<id>": {"m": [meta_zh, meta_en], "x": [{"h": [head_zh, head_en], "t": [text_zh, text_en], "zf": 0|1}]}
(zf = 1 when the Chinese text is just the English fallback.)
"""
import difflib
import glob
import json
import re
import sys
from pathlib import Path

import openpyxl

root = Path(sys.argv[1])
base = Path(__file__).resolve().parents[1]
REC = base / 'data/morimens/skeydb/public-v3/records'

sheet = openpyxl.load_workbook(root / 'TRANSLATIONS/00_SOURCE/Source Sheets.xlsx', read_only=True, data_only=True)['Gameplay']
table = {}
for row in sheet.values:
    if len(row) < 9:
        continue
    key = str(row[0] or '')
    if key.startswith(('RelicConfig_', 'Skill_', 'TrinketSuitEffect_')) and (row[7] or row[8]):
        table[key] = (str(row[7] or '').strip(), str(row[8] or '').strip())

CJK = re.compile(r'[一-鿿]')
HANGUL = re.compile(r'[가-힯]')


def clean(text):
    text = re.sub(r'<[A-Za-z_0-9]+:\s*(\[[^\]]*\])>', r'\1', text)
    text = re.sub(r'<[A-Za-z_0-9]+:\s*([^>]*)>', r'\1', text)
    return text.replace('\\n', '\n').strip()


def norm(s):
    return re.sub(r'[^a-z0-9]+', ' ', re.sub(r'<[^>]*:|>', '', s).lower()).strip()


def fmt_arg(a, drop_pct=False):
    if not a:
        return '?'
    kind = a.get('kind')
    suf = '' if drop_pct else a.get('suffix', '')
    if kind == 'fixed':
        return f"{a.get('value', '?')}{suf}"
    if kind == 'scaling':
        return '/'.join(str(v) for v in a.get('values', [])) + suf
    return '※'  # computed from account data


def fill(text, args, en=True):
    """Fill [Style:ArgN] / [StateArgN] tokens and strip {Term} / {plural:} / {derived:} markup."""
    def plural(m):
        a = args.get(m.group(1))
        one = a and a.get('kind') == 'fixed' and str(a.get('value')) == '1'
        return m.group(2) if one else m.group(3)
    text = re.sub(r'\{plural:\[(\w+)\]\|([^|}]*)\|([^}]*)\}', plural, text)

    def tok(m):
        n = m.group(2)
        a = args.get('StateArg' + n) if m.group(1) == 'StateArg' else args.get('Arg' + n) or args.get('StateArg' + n)
        return fmt_arg(a, m.end() < len(m.string) and m.string[m.end()] in '%％')  # template already has the % sign
    text = re.sub(r'\[(?:[A-Za-z]+:)?(StateArg|Arg)(\d+)\]', tok, text)
    text = re.sub(r'\{(?:derived|ordinal|overlay):([^}]*)\}', r'\1', text)
    text = re.sub(r'<[A-Za-z]+:([^<>]*)>', r'\1', text)
    text = re.sub(r'\s*\n\s*', ' ', text)
    text = re.sub(r'\{([^{}]*)\}', r'\1', text)
    return text.strip()


NUM = re.compile(r'(?<![A-Za-z0-9{.])\d+(?:\.\d+)?')
manual = json.loads((base / 'scripts/data/tier_details_zh.json').read_text(encoding='utf-8'))


def manual_zh(en):
    """AI-assisted translation (scripts/data/tier_details_zh.json): key = English with numbers lifted to {n}."""
    nums = NUM.findall(en)
    z = manual.get(NUM.sub('{n}', en))
    if not z:
        return None
    return re.sub(r'\{(\d+)\}', lambda m: nums[int(m.group(1)) - 1] if int(m.group(1)) <= len(nums) else m.group(0), z)


def sim(a, b):
    return difflib.SequenceMatcher(None, norm(a), norm(b)).ratio()


# ---- game table indexes by English name ----
by_name = {}  # norm(en name) -> list of (kind, id)
for key, (zh, en) in table.items():
    m = re.match(r'(RelicConfig|Skill|TrinketSuitEffect)_(\d+)_Name$', key)
    if m and en and not CJK.search(clean(en)):
        by_name.setdefault(norm(clean(en)), []).append((m.group(1), m.group(2)))


def zh_text(en_name, template, args, fields):
    """Best (zh, en) table description whose filled English matches the SKeyDB description."""
    target = fill(template, args)
    best = None
    for kind, id_ in by_name.get(norm(en_name), []):
        for f in fields:
            row = table.get(f'{kind}_{id_}_{f}')
            if not row:
                continue
            zh, en = clean(row[0]), clean(row[1])
            if not (CJK.search(zh) and not HANGUL.search(zh) and en):
                continue
            score = sim(fill(en, args), target)
            if best is None or score > best[0]:
                best = (score, fill(zh, args))
    return best[1] if best and best[0] >= 0.88 else None


# ---- labels ----
REALM = {'CHAOS': ('混沌', 'Chaos'), 'CARO': ('血肉', 'Caro'), 'AEQUOR': ('深海', 'Aequor'), 'ULTRA': ('超维', 'Ultra'),
         'NEUTRAL': ('通用', 'Neutral'), 'OTHER': ('其他', 'Other'), 'FADED_LEGACY': ('褪色遗产', 'Faded Legacy')}
RARITY = {'SSR': 'SSR', 'SR': 'SR', 'R': 'R', 'N': 'N', 'Genesis': ('创世', 'Genesis')}
MAIN = {'CRIT_RATE': ('暴击率', 'Crit. Rate'), 'CRIT_DMG': ('暴击伤害', 'Crit. DMG'), 'REALM_MASTERY': ('界域精通', 'Realm Mastery'),
        'DMG_AMP': ('伤害强效', 'DMG Amp'), 'ALIEMUS_REGEN': ('狂气回充', 'Aliemus Regen'), 'KEYFLARE_REGEN': ('银钥充能', 'Keyflare Regen'),
        'SIGIL_YIELD': ('黑印掉落', 'Sigil Yield'), 'DEATH_RESISTANCE': ('死亡抵抗', 'Death Resistance')}
ATYPE = {'ASSAULT': ('强攻', 'Assault'), 'WARDEN': ('守护', 'Warden'), 'CHORUS': ('合唱', 'Chorus')}
RTYPE = {'Relic': ('造物', 'Relic'), 'Dimensional Image': ('维度影像', 'Dimensional Image'), 'Event': ('事件造物', 'Event'), 'Pendulum': ('摆锤', 'Pendulum')}


def pair(d, k):
    v = d.get(k)
    return v if isinstance(v, tuple) else (v, v)


def meta(*parts):
    parts = [p for p in parts if p and p[0]]
    return [' · '.join(p[0] for p in parts), ' · '.join(p[1] for p in parts)]


owner_zh = {}
huiji = json.loads((base / 'data/morimens/huiji/zh-CN.json').read_text(encoding='utf-8')).get('bySkeydbId', {})
for k, v in huiji.items():
    owner_zh[k] = re.sub(r'^「|」$', '', v.get('name', ''))
owner_en = {}
aw_rows = json.loads((base / 'data/morimens/skeydb/awakeners.json').read_text(encoding='utf-8'))['records']
for r in aw_rows:
    owner_en[r['id']] = r['name'].strip('"')


def owner(d):
    i = d.get('ownerAwakenerId')
    if not i:
        return None
    return (f"专属：{owner_zh.get(i) or owner_en.get(i, '')}", f"Owner: {owner_en.get(i, d.get('ownerAwakenerName', ''))}")


out = {}
stats = {}


def count(kind, ok):
    s = stats.setdefault(kind, [0, 0])
    s[0] += 1
    s[1] += 1 if ok else 0


# awakeners
for r in aw_rows:
    out[f"awakener:{r['id']}"] = {'m': meta(pair(REALM, r['realm']), (r['rarity'], r['rarity']), pair(ATYPE, r['type'])), 'x': []}

# wheels
for f in sorted(glob.glob(str(REC / 'wheels/*.json'))):
    d = json.loads(Path(f).read_text(encoding='utf-8'))
    args = d.get('descriptionArgs') or {}
    tpl = d.get('descriptionTemplate') or ''
    en = fill(tpl, args)
    zh = (zh_text(d['name'], tpl, args, ['Desc']) if tpl else None) or manual_zh(en)
    count('wheel', bool(zh))
    main = pair(MAIN, d.get('mainstatKey'))
    out[f"wheel:{d['id']}"] = {
        'm': meta(pair(REALM, d.get('realm')), (d.get('rarity'), d.get('rarity')), (f'主属性 {main[0]}', f'Main stat {main[1]}') if main[0] else None, owner(d)),
        'x': [{'h': ['命轮效果', 'Wheel effect'], 't': [zh or en, en], 'zf': 0 if zh else 1}] if en else []}

# relics (creations)
for f in sorted(glob.glob(str(REC / 'relics/*.json'))):
    d = json.loads(Path(f).read_text(encoding='utf-8'))
    xs = []
    variants = d.get('variants') or [d]
    for v in variants[:3]:
        args = v.get('descriptionArgs') or {}
        tpl = v.get('descriptionTemplate') or ''
        if not tpl:
            continue
        en = fill(tpl, args)
        zh = zh_text(v.get('name') or d['name'], tpl, args, ['Desc', 'BattleDesc']) or zh_text(d['name'], tpl, args, ['Desc', 'BattleDesc']) or manual_zh(en)
        count('relic', bool(zh))
        xs.append({'h': ['造物特性', 'Effect'], 't': [zh or en, en], 'zf': 0 if zh else 1})
        break
    out[f"relic:{d['id']}"] = {'m': meta(pair(RTYPE, d.get('relicType')), (d.get('rarity'), d.get('rarity')), owner(d)), 'x': xs}

# posses (key tokens)
for f in sorted(glob.glob(str(REC / 'posses/*.json'))):
    d = json.loads(Path(f).read_text(encoding='utf-8'))
    args = d.get('descriptionArgs') or {}
    tpl = d.get('descriptionTemplate') or ''
    en = fill(tpl, args)
    zh = (zh_text(d['name'], tpl, args, ['Desc']) if tpl else None) or manual_zh(en)
    count('posse', bool(zh))
    out[f"posse:{d['id']}"] = {'m': meta(pair(REALM, d.get('realm'))), 'x': [{'h': ['钥令效果', 'Effect'], 't': [zh or en, en], 'zf': 0 if zh else 1}] if en else []}

# covenants
for f in sorted(glob.glob(str(REC / 'covenants/*.json'))):
    d = json.loads(Path(f).read_text(encoding='utf-8'))
    xs = []
    for i, s in enumerate(d.get('setEffects') or []):
        args = s.get('descriptionArgs') or {}
        tpl = s.get('descriptionTemplate') or ''
        en = fill(tpl, args)
        zh = zh_text(d['name'], tpl, args, [f'SuitEffectDesc_{i + 1}']) or manual_zh(en)
        count('covenant', bool(zh))
        xs.append({'h': [f"{s['set']} 件套", f"{s['set']}-piece"], 't': [zh or en, en], 'zf': 0 if zh else 1})
    out[f"covenant:{d['id']}"] = {'m': meta(), 'x': xs}

dest = base / 'data/morimens/game/tier-details.json'
dest.write_text(json.dumps({'version': 1, 'source': 'SKeyDB records (en) + BIAVGit/Morimens-Localizations (zh, joined by English name; used only when numbers/text match)', 'items': out}, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
left = sorted({x['t'][1] for v in out.values() for x in v['x'] if x['zf']})
print(len(left), 'texts still English-only' + (f' (first: {left[0][:80]!r})' if left else ''))
print(len(out), 'entries;', {k: f'{v[1]}/{v[0]} zh' for k, v in stats.items()})

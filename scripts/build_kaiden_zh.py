"""Translate the Kaiden.gg monster intent text (data/morimens/kaiden/intents.json) into Chinese.
Order of precedence for every sentence: manual table (scripts/data/kaiden_manual.py) -> regex families below -> official
translation memory built from the game localization table.  Numbers are lifted out as {1},{2},... and put back at runtime.
Output: data/morimens/kaiden/zh.json  (sentence / name / type dictionaries keyed by the normalised English text).
Usage: python scripts/build_kaiden_zh.py [PATH_TO_MORIMENS_LOCALIZATIONS]   (the path is only needed for names/TM)
"""
import json
import pickle
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

base = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(base / 'scripts' / 'data'))
from kaiden_manual import SENT, NAMES, TYPES  # noqa: E402
from kaiden_names_manual import NAMES as NAMES_MANUAL  # noqa: E402
import glob  # noqa: E402

CJK = re.compile(r'[一-鿿]')
NUM = re.compile(r'(?<![\w{])\d+(?:\.\d+)?')

def norm(s):
    """number placeholders: 50% -> {n}%"""
    return NUM.sub('{n}', s)

# ---- regex families: (pattern on normalised sentence, zh template; \1.. captured groups) ----
FAM = [
 (r'Deal \{n\}% ATK DMG \{n\} times?\.', '造成 {1}% 攻击力伤害 {2} 次。'),
 (r'Deal \{n\}% ATK DMG X times\.', '造成 {1}% 攻击力伤害 X 次。'),
 (r'Deal X DMG \{n\} times?\.', '造成 X 点伤害 {1} 次。'),
 (r'Deal X DMG X times\.', '造成 X 点伤害 X 次。'),
 (r'Deal X DMG\.', '造成 X 点伤害。'),
 (r'Gain \{n\}% ATK STR\.', '获得 {1}% 攻击力的力量。'),
 (r'Gain \{n\}% ATK stacks of STR\.', '获得 {1}% 攻击力层数的力量。'),
 (r'All gain \{n\}% ATK STR\.', '全体获得 {1}% 攻击力的力量。'),
 (r'All allies gain \{n\}% ATK STR\.', '所有友方获得 {1}% 攻击力的力量。'),
 (r'Gain \{n\}% DEF Shield\.', '获得 {1}% 防御的护盾。'),
 (r'Inflict \{n\}% ATK stacks of Poison\.', '施加 {1}% 攻击力层数的中毒。'),
 (r'Inflict (\{n\}) stacks? of (Poison|Weakness|Fragile|Vulnerable|Stagnation|Bleed|Burn|Blind)\.', None),
 (r'(Inflict|Apply) (Weakness|Fragile|Vulnerable|Blind|Stagnation|Poison|Burn|Bleed|Weakness and Fragile|Weakness and Vulnerable|Fragile and Weakness) for \{n\} turns?\.', None),
 (r'(Weakness|Fragile|Vulnerable|Blind) for \{n\} turns?\.', None),
 (r'Apply \{n\} turns? of (Weakness|Fragile|Vulnerable|Blind|Stagnation)\.', None),
 (r'Lasts \{n\} turns?\.', '持续 {1} 回合。'),
 (r'Obtain \{n\} stacks? of Madness\.', '获得 {1} 层疯狂。'),
 (r'Gain \{n\} stacks? of Fervor after playing a Command Card\.', '每使用 1 张指令卡，获得 {1} 层狂热。'),
 (r'Add \{n\} "([^"]+)" cards? to your hand\.', 'ADDHAND'),
]
TERM = {'Poison':'中毒','Weakness':'虚弱','Fragile':'脆弱','Vulnerable':'易伤','Stagnation':'迟缓','Bleed':'出血','Burn':'燃烧','Blind':'失明',
        'Weakness and Fragile':'虚弱与脆弱','Weakness and Vulnerable':'虚弱与易伤','Fragile and Weakness':'脆弱与虚弱'}

def family(s):
    for pat, tpl in FAM:
        m = re.fullmatch(pat, s)
        if not m:
            continue
        if tpl and tpl != 'ADDHAND':
            return tpl
        g = m.groups()
        if pat.startswith(r'Inflict (\{n\}) stacks?'):
            return '施加 {1} 层' + TERM[g[1]] + '。'
        if pat.startswith(r'(Inflict|Apply) (Weakness'):
            return '施加' + TERM[g[1]] + ' {1} 回合。'
        if pat.startswith(r'(Weakness|Fragile'):
            return TERM[g[0]] + ' {1} 回合。'
        if pat.startswith(r'Apply \{n\} turns? of'):
            return '施加 {1} 回合' + TERM[g[0]] + '。'
        if tpl == 'ADDHAND':
            nm = NAMES.get(g[0])
            if nm:
                return '将 {1} 张「' + nm + '」加入手牌。'
    return None

def split_sentences(text):
    # "Crit. Resistance" is one phrase, not two sentences (same rule in morimens-dtide-zones.js)
    return [x for x in re.split(r'(?<=[.!?])(?<!Crit\.)\s+', text) if x]


def frozen_lines():
    src = json.loads((base / 'scripts/data/kaiden_src_sentences.json').read_text(encoding='utf-8'))
    out = {}
    for f in sorted(glob.glob(str(base / 'scripts/data/kaiden_zh_*.txt'))):
        for line in open(f, encoding='utf-8'):
            if line.strip():
                i, z = line.rstrip('\n').split('\t', 1)
                out[src[int(i)]] = z
    return out


def table_names(path):
    import openpyxl
    sheet = openpyxl.load_workbook(Path(path) / 'TRANSLATIONS/00_SOURCE/Source Sheets.xlsx', read_only=True, data_only=True)['Gameplay']
    best = defaultdict(Counter)
    for row in sheet.values:
        if len(row) < 9 or not row[0] or not re.match(r'(Skill|State|MonsterConfig|RelicConfig|Item|Summon)_\d+_(Name|MonsterName|RelicName|SummonName)$', str(row[0])):
            continue
        zh, en = str(row[7] or ''), str(row[8] or '')
        clean = lambda t: re.sub(r'<[A-Za-z_0-9]+:\s*([^>]*)>', r'\1', t).strip()
        zh, en = clean(zh), clean(en)
        if CJK.search(zh) and en and not CJK.search(en):
            best[re.sub(r'[+☆\s]+$', '', en.lower())][zh] += 1
    return {k: c.most_common(1)[0][0] for k, c in best.items()}

def main():
    table = table_names(sys.argv[1]) if len(sys.argv) > 1 else {}
    frozen = frozen_lines()
    kd = json.loads((base / 'data/morimens/kaiden/intents.json').read_text(encoding='utf-8'))['monsters']
    sentences, names, ptypes, pnames = set(), set(), set(), set()
    for v in kd.values():
        for x in v.get('r', []):
            names.add(x['n']); ptypes.add(x['t'])
            sentences.update(split_sentences(norm(x['d'])))
        for x in v.get('p', []):
            pnames.add(x['n']); sentences.update(split_sentences(norm(x['d'])))
    out_sent, missing = {}, []
    for s in sorted(sentences):
        z = SENT.get(s) or frozen.get(s) or family(s)
        if z:
            out_sent[s] = z
        else:
            missing.append(s)
    key = lambda n: re.sub(r'[+☆\s]+$', '', n.lower().strip())
    nm_out = {}
    for n in sorted(names | pnames):
        z = NAMES_MANUAL.get(n) or NAMES.get(n) or table.get(key(n)) or table.get(key(n.strip('"')))
        if z:
            nm_out[n] = z
    nm_missing = sorted((names | pnames) - set(nm_out))
    ty_out = {t: TYPES[t] for t in sorted(ptypes) if t in TYPES}
    (base / 'data/morimens/kaiden/zh.json').write_text(json.dumps({'sent': out_sent, 'names': nm_out, 'types': ty_out}, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    (base / 'scripts/data/kaiden_missing.json').write_text(json.dumps({'sent': missing, 'names': nm_missing, 'types': sorted(ptypes - set(TYPES))}, ensure_ascii=False, indent=0), encoding='utf-8')
    print(f'sentences {len(out_sent)}/{len(sentences)} translated, names missing {len(nm_missing)}, types missing {len(ptypes - set(TYPES))}')

if __name__ == '__main__':
    main()

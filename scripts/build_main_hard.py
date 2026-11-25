#!/usr/bin/env python3
"""Build data/morimens/mainhard/index.json (the "主线困难榜单" tab) from the per-stage dumps of the hard main-story stages
(one JSON per stage: {stage:{...}, facades:{uid:{...}}, reviews:[{totalBout, awakerOutlineList, teamData.keeperSkill, battleUuid, ...}]}).

Usage: py scripts/build_main_hard.py <dir with the stage json files> [--detail cache.jsonl]

Each review is a public clear (battle replay) of the stage: rounds (totalBout), the four Awakeners, the keeper skill
(钥令) and the replay id (battleUuid).  The review list itself only knows the Awakener levels; the keeper level, the
enlightenment (potency) and soulforge (break) levels are read from the replay cache produced by
scripts/fetch_main_hard_detail.py (optional — rows simply carry nulls when a replay could not be decoded).
Awakener / keeper-skill names come from the id-names tables of the D-Zone seasons.

Row layout (v2): [playerIdx, rounds, timestamp, battleUuid, tokenIdx, [[awIdx, level, potency, break], ...], keeperLevel]
`players` keeps [uid, name, keeperLevel] from the review page facades.
"""
import glob, gzip, json, re, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
D = ROOT / 'data/morimens'
norm = lambda s: re.sub(r'[^a-z0-9]', '', str(s).lower().replace('+', ''))
args = [a for a in sys.argv[1:] if not a.startswith('--')]
detail_path = None
if '--detail' in sys.argv:
    detail_path = Path(sys.argv[sys.argv.index('--detail') + 1])
    args = [a for a in args if a != str(detail_path)]
src = Path(args[0]) if args else None
if not src: raise SystemExit(__doc__)
detail = {}
if detail_path and detail_path.exists():
    opener = gzip.open if detail_path.suffix == '.gz' else open
    with opener(detail_path, 'rt', encoding='utf-8') as fh:
        for line in fh:
            if not line.strip():
                continue
            try:
                rec = json.loads(line)
            except Exception:
                continue
            detail[rec['u']] = rec
print(f'detail cache: {len(detail)} replays')
aw_names, tok_names = {}, {}
for s in sorted((D / 'dzone').glob('season*/id-names.json'), reverse=True):
    n = json.loads(s.read_text(encoding='utf-8'))
    for k, v in n['awakers'].items(): aw_names.setdefault(k, v)
    for k, v in n['token'].items(): tok_names.setdefault(k, v)
kinds = json.loads((D / 'game/tier-pool.json').read_text(encoding='utf-8'))['kinds']
pool = {norm(it['en']): it for it in kinds['awakener']}
posse = {norm(it['en']): it for it in kinds['posse']}
posse_wiki = {k: v for k, v in json.loads((ROOT / 'scripts/data/posse_zh_wiki.json').read_text(encoding='utf-8')).items() if not k.startswith('_')}
aw, aw_idx, tk, tk_idx = [], {}, [], {}
players, pl_idx = [], {}
stages = []
missing = 0
for f in sorted(glob.glob(str(src / '*.json'))):
    x = json.loads(Path(f).read_text(encoding='utf-8'))
    st = x['stage']
    rows = []
    for r in x['reviews']:
        uid = str(r['playerId'])
        if uid not in pl_idx:
            fa = x['facades'].get(uid) or {}
            pl_idx[uid] = len(players); players.append([uid, re.sub(r'<[^>]*>', '', str(fa.get('name') or uid)), fa.get('level')])
        det = detail.get(str(r['battleUuid']))
        dmap = {}
        if det:
            for m in det.get('m') or []:
                if m and m[0] is not None:
                    dmap[str(m[0])] = m
        else:
            missing += 1
        team = []
        for a in r['awakerOutlineList']:
            info = aw_names.get(str(a['tid']))
            key = info['canonicalName'] if info else f"#{a['tid']}"
            if key not in aw_idx:
                p = pool.get(norm(key)) or {}
                aw_idx[key] = len(aw); aw.append([info['ingameId'] if info else '', key, p.get('zh') or key, p.get('img', ''), str(a['tid'])])
            m = dmap.get(str(a['tid']))
            team.append([aw_idx[key], a.get('level') or 0, m[2] if m else None, m[3] if m else None])
        ks = r.get('teamData', {}).get('keeperSkill')
        tn = tok_names.get(str(ks)) if ks else None
        tkey = tn or (f'#{ks}' if ks else '')
        if tkey and tkey not in tk_idx:
            p = posse.get(norm(tkey)) or {}
            tk_idx[tkey] = len(tk); tk.append([tkey, posse_wiki.get(tkey) or p.get('zh') or tkey, p.get('img', '')])
        keeper = det.get('k') if det and det.get('k') else (x['facades'].get(uid) or {}).get('level')
        rows.append([pl_idx[uid], r.get('totalBout') or 0, r.get('timestamp') or 0, r['battleUuid'], tk_idx.get(tkey, -1), team, keeper])
    stages.append({'tid': st['stageTid'], 'cfg': st.get('configName'), 'name': st.get('displayName'), 'campaign': st.get('campaign'), 'chapter': st.get('chapter'),
                   'stage': st.get('stage'), 'level': st.get('recommendedLevel'), 'server': x.get('serverCount'), 'saved': x.get('savedCount'),
                   'checked': x.get('lastChecked'), 'reviews': rows})
order = {'忘却篇': 0, '星辰篇': 1}
stages.sort(key=lambda s: (order.get(s['campaign'], 9), s['chapter'] or 0, s['stage'] or 0))
out = {'version': 2, 'aw': aw, 'tk': tk, 'players': players, 'stages': stages}
dest = D / 'mainhard/index.json'
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print(f'{dest}: {len(stages)} stages, {sum(len(s["reviews"]) for s in stages)} clears, {len(players)} players, {dest.stat().st_size:,} bytes, replays matched {sum(len(s["reviews"]) for s in stages) - missing}')

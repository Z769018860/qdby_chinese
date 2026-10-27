#!/usr/bin/env python3
"""Build the data behind the leaderboard tab "低配榜单" (low-investment lineups):
data/morimens/eremora/lowspec/<season>.json from data/morimens/dzone/season<N>/raw-teams (+ ranking, battle-summary, id-names).

Per clear / extra team of every Top-2000 player the file keeps the investment figures the page ranks:
  enl    sum of the 4 members' enlightenment level (potencyLevel, 0-15 each; 3 = "3启", 15 = "+12")
  skill  sum of the members' unlocked skill slot levels
  forge  sum of the members' soulforge aptitude (灵塑适性, talent family soulforge_aptitude, max 10) levels
  wheel  sum of the levels (1-15 = stack) of the equipped SSR wheels
  (aw[i][4] = 1 marks permanent-banner awakeners: the page can leave their enlightenment out)
  keeper the player's keeper (守密人) level in that battle
Talent ids are not named in the raw data: the family of a talent id is inferred from its maximum observed level per awakener
(12 = madness omen, 10 = soulforge, 5 = gnostic, 1 = passive) over the given seasons.

Usage: python3 scripts/build_lowspec_rank.py <season> [<season> ...]   (the first season is built; all are used for the talent inference)
"""
import collections, gzip, json, re, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
D = ROOT / 'data/morimens'
DIFFS = ['C', 'B', 'A', 'S', 'SS', 'SSS', '▼']
norm = lambda s: re.sub(r'[^a-z0-9]', '', str(s).lower().replace('+', ''))

def raw_rows(season):
    for shard in sorted((D / f'dzone/season{season}/raw-teams').glob('teams-*.jsonl.gz')):
        for line in gzip.decompress(shard.read_bytes()).splitlines():
            if line.strip():
                try: yield json.loads(line)
                except Exception: pass

def sides(row):
    r = row['response']
    for key, slot in (('team', 0), ('teamExtra', 1)):
        s = r.get(key)
        if isinstance(s, dict) and s.get('awakers'):
            yield s, slot

def infer_families(seasons):
    mx = collections.defaultdict(lambda: collections.defaultdict(int))
    for sn in seasons:
        for row in raw_rows(sn):
            for side, _ in sides(row):
                for a in side['awakers']:
                    for tid, v in (a.get('talents') or {}).items():
                        mx[a['tid']][tid] = max(mx[a['tid']][tid], v.get('lv', 0))
    forge, ambiguous = {}, 0
    for awtid, d in mx.items():
        items = sorted(d.items(), key=lambda kv: int(kv[0]))
        tens = [k for k, v in items if v == 10]
        if len(tens) == 1: forge[awtid] = tens[0]
        elif len(tens) > 1:
            # a madness omen that never got maxed also shows 10: usual id order is madness, passive, soulforge, gnostic
            forge[awtid] = tens[-1]; ambiguous += 1
        else:
            near = [k for k, v in items if 8 <= v <= 10]
            if near: forge[awtid] = near[-1]
    return forge, ambiguous

def main():
    seasons = [int(x) for x in sys.argv[1:]]
    if not seasons: raise SystemExit(__doc__)
    season = seasons[0]
    forge_tid, amb = infer_families(seasons)
    print(f'soulforge talent known for {len(forge_tid)} awakener ids ({amb} ambiguous)')
    names = json.loads((D / f'dzone/season{season}/id-names.json').read_text(encoding='utf-8'))
    ranking = json.loads(gzip.decompress((D / f'dzone/season{season}/ranking.json.gz').read_bytes()))
    rank = {r['uid']: r for r in ranking['rows']}
    keeper = {}
    for l in gzip.open(D / f'dzone/season{season}/battle-summary.jsonl.gz', 'rt'):
        x = json.loads(l); keeper[x['battleUuid']] = x.get('playerLevel')
    ssr = {norm(w['name']) for w in json.loads((D / 'skeydb/public-v3/catalogs/wheels.json').read_text(encoding='utf-8'))['records'] if w.get('rarity') == 'SSR'}
    groups = json.loads((ROOT / 'scripts/data/lowspec_wheel_groups.json').read_text(encoding='utf-8'))
    wheel_group = {**{norm(n): 3 for n in groups['pass']}, **{norm(n): 4 for n in groups['gift']}}  # 3 = pass / archive (纪行), 4 = gift (赠送)
    # SSR wheels whose exclusive Awakener is a permanent-banner one count as permanent wheels (w[2] == 2); generic wheels are treated as limited
    awk = {x['id']: x for x in json.loads((D / 'skeydb/awakeners.json').read_text(encoding='utf-8'))['records']}
    perm_wheels = {norm(w['name']) for w in json.loads((D / 'skeydb/public-v3/catalogs/wheels.json').read_text(encoding='utf-8'))['records']
                   if w.get('rarity') == 'SSR' and awk.get(w.get('ownerAwakenerId'), {}).get('availabilityType') == 'PERMANENT'}
    kinds = json.loads((D / 'game/tier-pool.json').read_text(encoding='utf-8'))['kinds']
    pool = {norm(it['en']): it for it in kinds['awakener']}
    zh_of = {k: {norm(it['en']): it['zh'] for it in kinds[k] if it.get('zh')} for k in ('wheel', 'covenant')}
    strings, str_idx = [], {}
    def sidx(kind, en):  # [english, chinese] name pool shared by wheels / covenants
        key = (kind, en)
        if key not in str_idx:
            str_idx[key] = len(strings)
            strings.append([en, zh_of[kind].get(norm(en), en)])
        return str_idx[key]
    perm = {x['ingameId'] for x in json.loads((D / 'skeydb/awakeners.json').read_text(encoding='utf-8'))['records']
            if x['availabilityType'] == 'PERMANENT' or (x['availabilityType'] == 'WELFARE' and x['rarity'] == 'SR')}  # permanent banner + welfare SR
    stages = {}
    for sid, st in names['stages'].items():
        m = re.match(r'Zone (\d): (?:Threat Level (\w+)|▼)', st['name'])
        if m: stages[sid] = (int(m.group(1)), DIFFS.index(m.group(2) or '▼'))
    aw_idx, aw = {}, []
    pl_idx, players = {}, []
    teams, seen = [], set()
    for row in raw_rows(season):
        uid = row['uid']
        if uid not in rank: continue
        z = stages.get(str(row['response']['stageTid']))
        if not z: continue
        for side, slot in sides(row):
            key = (uid, z[0], slot)
            if key in seen: continue
            seen.add(key)
            items = side.get('items') or {}
            ms, borrowed = [], 0
            for a in side['awakers']:
                info = names['awakers'][str(a['tid'])]
                if info['canonicalName'] not in aw_idx:
                    p = pool.get(norm(info['canonicalName'])) or {}
                    aw_idx[info['canonicalName']] = len(aw)
                    aw.append([info['ingameId'], info['canonicalName'], p.get('zh') or info['canonicalName'], p.get('img', ''), 1 if info['ingameId'] in perm else 0])
                skill = sum(s.get('level', 0) for s in a.get('slots') or [] if not s.get('lock'))
                forge = (a.get('talents') or {}).get(forge_tid.get(a['tid']), {}).get('lv', 0)
                wheel, wl = 0, []
                slots = a.get('weaponSlots') or []
                if isinstance(slots, dict): slots = [slots[k] for k in sorted(slots, key=int)]
                for s in slots:
                    it = items.get(str(s.get('weaponUid')))
                    if not it: continue
                    wn = names['wheel'].get(str(it['tid']), f"#{it['tid']}")
                    is_ssr = norm(wn) in ssr
                    if is_ssr: wheel += s.get('level') or 0
                    wl.append([sidx('wheel', wn), s.get('level') or 0, (2 if norm(wn) in perm_wheels else wheel_group.get(norm(wn), 1)) if is_ssr else 0])
                suits = collections.Counter()
                for u in a.get('trinkets') or []:
                    it = items.get(str(u))
                    if it and it.get('suitId'): suits[it['suitId']] += 1
                cov = [[sidx('covenant', names['covenant'].get(str(sid), f'#{sid}')), n] for sid, n in suits.items()]
                sl = [s.get('level', 0) for s in a.get('slots') or [] if not s.get('lock')]
                bor = 1 if a.get('assistPlayerId') else 0
                borrowed += bor
                ms.append([aw_idx[info['canonicalName']], a.get('potencyLevel') or 0, skill, forge, wheel, bor, sl, wl, cov, a.get('level') or 0])
            if uid not in pl_idx:
                r = rank[uid]; pl_idx[uid] = len(players)
                players.append([str(uid), re.sub(r'<[^>]*>', '', r['name']), r['rank'], r['score']])
            uuid = (side.get('recordStageData') or {}).get('battleUuid')
            teams.append([pl_idx[uid], z[0], z[1], slot, row['response'].get('score') if slot == 0 else None, keeper.get(uuid), ms, uuid])
    out = {'season': season, 'diffs': DIFFS, 'aw': aw, 'names': strings, 'players': players, 'teams': teams}
    dest = D / f'eremora/lowspec/{season}.json'
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    # advertise the file in the manifest (the page shows the tab from there, no probing request)
    mp = D / 'eremora/manifest.json'
    raw = mp.read_bytes().decode('utf-8'); crlf = '\r\n' in raw
    man = json.loads(raw)
    for e in man['availableSeasons']:
        if e.get('seasonId') == season and not e.get('snapshotId') and not e.get('aggregatePath'):
            e['lowspecPath'] = f'data/morimens/eremora/lowspec/{season}.json'
    txt = json.dumps(man, ensure_ascii=False, indent=2) + '\n'
    mp.write_bytes((txt.replace('\n', '\r\n') if crlf else txt).encode('utf-8'))
    print(f'{dest}: {len(players)} players, {len(teams)} teams, {len(aw)} awakeners, {dest.stat().st_size:,} bytes')

main()

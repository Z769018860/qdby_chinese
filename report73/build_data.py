#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Aggregate Season 73 (and Season 72 for the comparison spread) numbers for the 特刊 report."""
from __future__ import annotations
import gzip, json, statistics
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # repo root
D = ROOT / 'data/morimens'
OUT = ROOT / 'report73'
OUT.mkdir(exist_ok=True)

GROUP_WAVE = {83424: 1, 83426: 2, 83425: 3, 83428: 4, 83427: 5}
WAVE_NAME = {1: '第一禁区', 2: '第二禁区', 3: '第三禁区', 4: '第四禁区', 5: '第五禁区'}
THREATS = ['C', 'B', 'A', 'S', 'SS', 'SSS', '▼']


def load_json(p):
    return json.loads(Path(p).read_text(encoding='utf-8'))


def names_for(season):
    n = load_json(D / f'dzone/season{season}/id-names.json')
    gear = load_json(D / 'replay-gear.json')['wheels']
    relics = load_json(D / 'replay-relics.json')['relics']
    posse = load_json(ROOT / 'scripts/data/posse_zh_wiki.json')
    gloss = load_json(D / 'game/glossary.json')
    for row in (gloss if isinstance(gloss, list) else gloss.get('terms') or gloss.get('entries') or []):
        if row.get('k') == 'posse' and row.get('en') and row.get('zh'):
            posse.setdefault(row['en'], row['zh'])
    tp = load_json(D / 'game/tier-pool.json')['kinds']
    aw_zh = {x['en']: x['zh'] for x in tp['awakener']}
    import re
    src = (ROOT / 'morimens-dtide-usage.js').read_text(encoding='utf-8')
    m = re.search(r'const covenantZh=(\{[\s\S]*?\});', src)
    cov_zh = {}
    if m:
        cov_zh = eval(m.group(1), {'__builtins__': {}})  # noqa: S307 - repo-local literal
    relics = dict(relics)
    relics.setdefault('83511', {'en': 'Ultra Ring', 'zh': '超维戒指'})
    relics.setdefault('83510', {'en': 'Caro Ring', 'zh': '血肉戒指'})
    relics.setdefault('83512', {'en': 'Chaos Ring', 'zh': '混沌戒指'})
    return {
        'stages': {k: v for k, v in n['stages'].items()},
        'aw': {k: (v['name'], aw_zh.get(v['name'], v['name'])) for k, v in n['awakers'].items()},
        'wheel': {k: (v.get('en', ''), v.get('zh') or v.get('en', '')) for k, v in gear.items()},
        'relic': {k: (v.get('en', ''), v.get('zh') or v.get('en', '')) for k, v in relics.items()},
        'token': {k: (v, posse.get(v) or v) for k, v in n['token'].items()},
        'cov': {k: (v, cov_zh.get(v) or v) for k, v in n['covenant'].items()},
    }


def threat_of(names, stage_tid):
    nm = names['stages'].get(str(stage_tid), {}).get('name', '')
    if '▼' in nm:
        return '▼'
    for t in ('SSS', 'SS', 'S', 'A', 'B', 'C'):
        if nm.endswith(f'Threat Level {t}'):
            return t
    return '?'


def zone_of(names, stage_tid):
    nm = names['stages'].get(str(stage_tid), {}).get('name', '')
    if nm.startswith('Zone '):
        try:
            return int(nm[5])
        except ValueError:
            return None
    return None


def read_teams(season):
    rows = []
    for shard in sorted((D / f'dzone/season{season}/raw-teams').glob('teams-*.jsonl.gz')):
        with gzip.open(shard, 'rt', encoding='utf-8') as fh:
            for line in fh:
                if line.strip():
                    rows.append(json.loads(line))
    return rows


def read_battles(season):
    out = []
    p = D / f'dzone/season{season}/battle-summary.jsonl.gz'
    if not p.exists():
        return out
    with gzip.open(p, 'rt', encoding='utf-8') as fh:
        for line in fh:
            if line.strip():
                out.append(json.loads(line))
    return out


def keeper_token(row):
    resp = row['response']
    return str(resp.get('keeperSkill') or (resp.get('team') or {}).get('keeperSkill') or '')


def weapon_uid_list(aw):
    slots = aw.get('weaponSlots') or []
    if isinstance(slots, dict):
        slots = [slots[k] for k in sorted(slots, key=int)]
    return slots


def parse_team(side, names):
    items = side.get('items') or {}
    mem = []
    for a in side.get('awakers') or []:
        tid = str(a['tid'])
        nm = names['aw'].get(tid, (f'#{tid}', f'#{tid}'))
        wheels = []
        for s in weapon_uid_list(a):
            it = items.get(str(s.get('weaponUid')))
            if it:
                wheels.append(str(it['tid']))
        suits = Counter()
        for u in a.get('trinkets') or []:
            it = items.get(str(u))
            if it and it.get('suitId'):
                suits[str(it['suitId'])] += 1
        mem.append({
            'tid': tid, 'en': nm[0], 'zh': nm[1], 'potency': a.get('potencyLevel') or 0,
            'level': a.get('level'), 'wheels': wheels, 'covs': list(suits),
            'borrowed': bool(a.get('assistPlayerId')),
        })
    return mem


def analyse(season):
    names = names_for(season)
    scores = load_json(D / f'dzone/season{season}/scores.json')
    dist = {int(k): v for k, v in scores['scoreDistribution'].items()}
    ranking = json.loads(gzip.decompress((D / f'dzone/season{season}/ranking.json.gz').read_bytes()))
    ranks = {r['uid']: r for r in ranking['rows']}
    battles = read_battles(season)
    teams = [r for r in read_teams(season) if r['uid'] in ranks]

    total = sum(dist.values())
    vals = []
    for sc, n in dist.items():
        vals += [sc] * n
    res = {
        'season': season,
        'count': total,
        'threshold': min(vals) if vals else None,
        'max': max(vals) if vals else None,
        'mean': round(statistics.mean(vals), 1) if vals else None,
        'median': statistics.median(vals) if vals else None,
        'dist': dict(sorted(dist.items(), reverse=True)),
        'ge': {str(t): sum(n for s, n in dist.items() if s >= t) for t in (525, 500, 450, 425, 400)},
        'lines': [{'rank': r, 'score': next(x['score'] for x in ranking['rows'] if x['rank'] == r) if any(x['rank'] == r for x in ranking['rows']) else None}
                  for r in (1, 10, 50, 100, 200, 500, 1000, 2000)],
        'perfect': [{'rank': r['rank'], 'name': r['name'], 'uid': r['uid'], 'score': r['score']} for r in ranking['rows'] if r['score'] == max(vals)],
    }

    # per-zone team rows
    zt = {w: [] for w in range(1, 6)}
    for r in teams:
        w = zone_of(names, r['response']['stageTid']) or GROUP_WAVE.get(r['stageGroupId'])
        if w:
            zt[w].append(r)
    zones = []
    for w in range(1, 6):
        rows = zt[w]
        cnt = Counter(threat_of(names, r['response']['stageTid']) for r in rows)
        sc = sorted(r['response']['score'] for r in rows if r['uid'] in ranks)
        down_sc = sorted(r['response']['score'] for r in rows if threat_of(names, r['response']['stageTid']) == '▼')
        zones.append({
            'wave': w, 'name': WAVE_NAME[w], 'teams': len(rows),
            'threats': {t: cnt.get(t, 0) for t in THREATS},
            'down': cnt.get('▼', 0),
            'downRate': round(cnt.get('▼', 0) / len(rows) * 100, 1) if rows else 0,
            'downMin': down_sc[0] if down_sc else None,
            'downFull': sum(1 for x in down_sc if x == down_sc[-1]) if down_sc else 0,
            'downMax': down_sc[-1] if down_sc else None,
            'downMedian': statistics.median(down_sc) if down_sc else None,
            'best': sc[-1] if sc else None, 'worst': sc[0] if sc else None,
            'median': statistics.median(sc) if sc else None,
        })

    # zone detail: champion lineup, hottest lineups, fastest clear, top chars / tokens / creations
    zone_top = []
    for w in range(1, 6):
        rows = zt[w]
        if not rows:
            continue
        scored = sorted(rows, key=lambda r: (-r['response']['score'], r['rank']))
        champ = scored[0]
        cmem = parse_team(champ['response']['team'], names)

        def lineup_key(mem):
            return '|'.join(sorted(m['tid'] for m in mem))

        groups = defaultdict(list)
        for r in rows:
            mem = parse_team(r['response']['team'], names)
            groups[lineup_key(mem)].append((r, mem))
        hot = sorted(groups.items(), key=lambda kv: (-len(kv[1]), -max(x[0]['response']['score'] for x in kv[1])))[:3]

        down_rows = [r for r in rows if threat_of(names, r['response']['stageTid']) == '▼']
        fastest = min(down_rows, key=lambda r: r['response']['team']['recordStageData'].get('stageRoundCount') or 10 ** 9) if down_rows else None

        chars = Counter()
        tokens = Counter()
        creations = Counter()
        for r in rows:
            seen = set()
            for m in parse_team(r['response']['team'], names):
                if m['tid'] not in seen:
                    seen.add(m['tid'])
                    chars[m['tid']] += 1
            tokens[keeper_token(r)] += 1
            seen_r = set()
            for rel in r['response']['team']['recordStageData'].get('relics') or []:
                rt = str(rel['tid'])
                if rt in seen_r:
                    continue
                seen_r.add(rt)
                creations[rt] += 1

        def lineup_proto(mem):
            return [{'tid': m['tid'], 'zh': m['zh'], 'en': m['en'], 'potency': m['potency']} for m in mem]

        zone_top.append({
            'wave': w,
            'champion': {'rank': champ['rank'], 'uid': champ['uid'], 'score': champ['response']['score'],
                         'members': lineup_proto(cmem), 'token': keeper_token(champ),
                         'covs': [c for m in cmem for c in m['covs']]},
            'hot': [{'count': len(v), 'members': lineup_proto(v[0][1]), 'score': max(x[0]['response']['score'] for x in v),
                     'token': keeper_token(v[0][0])} for k, v in hot],
            'fastest': ({'rounds': fastest['response']['team']['recordStageData'].get('stageRoundCount'),
                         'rank': fastest['rank'], 'name': ranks[fastest['uid']]['name'], 'uid': fastest['uid'],
                         'members': lineup_proto(parse_team(fastest['response']['team'], names)),
                         'token': keeper_token(fastest)} if fastest else None),
            'chars': [{'tid': t, 'en': names['aw'].get(t, (t, t))[0], 'zh': names['aw'].get(t, (t, t))[1], 'n': n} for t, n in chars.most_common(6)],
            'tokens': [{'en': names['token'].get(t, (t, t))[0], 'zh': names['token'].get(t, (t, t))[1], 'n': n} for t, n in tokens.most_common(6)],
            'creations': [{'en': names['relic'].get(t, (t, t))[0], 'zh': names['relic'].get(t, (t, t))[1], 'n': n} for t, n in creations.most_common(6)],
        })
    res['zones'] = zones
    res['zoneTop'] = zone_top

    # board-wide usage tops (share of teams that bring the item)
    char_use = Counter()
    wheel_use = Counter()
    cov_use = Counter()
    token_use = Counter()
    crea_use = Counter()
    assist_use = Counter()
    perfect_chars = Counter()
    perfect_set = {p['uid'] for p in res['perfect']}
    team_n = len(teams)
    for r in teams:
        mem = parse_team(r['response']['team'], names)
        seen_c, seen_w, seen_v, seen_t, seen_r = set(), set(), set(), set(), set()
        for m in mem:
            if m['tid'] not in seen_c:
                seen_c.add(m['tid'])
                char_use[m['tid']] += 1
                if r['uid'] in perfect_set:
                    perfect_chars[m['tid']] += 1
            if m['borrowed']:
                assist_use[m['tid']] += 1
            for w in m['wheels']:
                if w not in seen_w:
                    seen_w.add(w)
                    wheel_use[w] += 1
            for c in m['covs']:
                if c not in seen_v:
                    seen_v.add(c)
                    cov_use[c] += 1
        tk = keeper_token(r)
        if tk not in seen_t:
            token_use[tk] += 1
        for rel in r['response']['team']['recordStageData'].get('relics') or []:
            rt = str(rel['tid'])
            if rt not in seen_r:
                seen_r.add(rt)
                crea_use[rt] += 1

    def pack(counter, table, top, kind):
        out = []
        for k, n in counter.most_common(top):
            en, zh = table.get(k, (k, k))
            out.append({'id': k, 'en': en, 'zh': zh, 'n': n, 'rate': round(n / team_n * 100, 1) if team_n else 0})
        return out

    res['top'] = {
        'chars': pack(char_use, names['aw'], 10, 'char'),
        'wheels': pack(wheel_use, names['wheel'], 8, 'wheel'),
        'covs': pack(cov_use, names['cov'], 6, 'cov'),
        'tokens': pack(token_use, names['token'], 6, 'token'),
        'creations': pack(crea_use, names['relic'], 10, 'relic'),
        'assists': pack(assist_use, names['aw'], 6, 'assist'),
        'perfectChars': pack(perfect_chars, names['aw'], 6, 'perfect'),
        'teamN': team_n,
    }

    # battle records (all battles of ranked players)
    def best(seq, key):
        seq = [x for x in seq if x.get(key) is not None]
        return max(seq, key=lambda x: x[key]) if seq else None

    def battle_brief(b, key):
        if not b:
            return None
        top_char = max(b['awakers'], key=lambda a: a.get('damage') or 0) if b.get('awakers') else None
        return {'value': b.get(key), 'rank': b['rank'], 'uid': b['uid'], 'wave': b['wave'], 'name': ranks.get(b['uid'], {}).get('name', ''),
                'chars': [{'zh': names['aw'].get(str(a['tid']), (a['tid'], a['tid']))[1], 'en': a['name']} for a in (b['awakers'] or [])],
                'top': ({'zh': names['aw'].get(str(top_char['tid']), ('', ''))[1], 'en': top_char['name']} if top_char else None)}

    # per battle total damage
    for b in battles:
        b['_total'] = sum(a.get('damage') or 0 for a in b.get('awakers') or [])
        for a in b.get('awakers') or []:
            a['_zh'] = names['aw'].get(str(a['tid']), ('', ''))[1]
    top_char_dmg = None
    for b in battles:
        for a in b.get('awakers') or []:
            if top_char_dmg is None or (a.get('damage') or 0) > top_char_dmg[0]:
                top_char_dmg = (a.get('damage') or 0, b, a)
    res['records'] = {
        'maxHit': battle_brief(best(battles, 'maxBoutDamage'), 'maxBoutDamage'),
        'maxTotal': battle_brief(best(battles, '_total'), '_total'),
        'maxChar': ({'value': top_char_dmg[0], 'rank': top_char_dmg[1]['rank'], 'uid': top_char_dmg[1]['uid'],
                     'name': ranks.get(top_char_dmg[1]['uid'], {}).get('name', ''), 'wave': top_char_dmg[1]['wave'],
                     'char': {'zh': top_char_dmg[2]['_zh'], 'en': top_char_dmg[2]['name']},
                     'chars': [{'zh': names['aw'].get(str(a['tid']), ('', ''))[1], 'en': a['name']}
                               for a in (top_char_dmg[1].get('awakers') or [])]} if top_char_dmg else None),
        'deathResist': battle_brief(best(battles, 'deathResistCount'), 'deathResistCount'),
        'counter': battle_brief(best(battles, 'maxCounterAtt'), 'maxCounterAtt'),
        'tentacle': battle_brief(best(battles, 'maxTentacleDamage'), 'maxTentacleDamage'),
        'strength': battle_brief(best(battles, 'maxStrength'), 'maxStrength'),
        'poison': battle_brief(best(battles, 'maxPosion'), 'maxPosion'),
        'hp': battle_brief(best(battles, 'maxHp'), 'maxHp'),
        'totalBattles': len(battles),
    }

    # fastest clear per zone (only ▼)
    fastest_list = []
    for w in range(1, 6):
        rows = [b for b in battles if b['wave'] == w and threat_of(names, b['stageTid']) == '▼' and b.get('slot') == 'clear']
        if not rows:
            continue
        b = min(rows, key=lambda x: x.get('stageRoundCount') or 10 ** 9)
        fastest_list.append({'wave': w, 'rounds': b.get('stageRoundCount'), 'rank': b['rank'],
                             'name': ranks.get(b['uid'], {}).get('name', ''), 'uid': b['uid'],
                             'chars': [{'zh': a['_zh'], 'en': a['name']} for a in b['awakers']]})
    res['fastest'] = fastest_list

    # extra extremes for the niche spread
    def extreme(seq, key, largest=True, pred=None):
        seq = [x for x in seq if x.get(key) is not None and (pred is None or pred(x))]
        if not seq:
            return None
        x = (max if largest else min)(seq, key=lambda v: v[key])
        return {'value': x[key], 'rank': x['rank'], 'uid': x['uid'], 'name': ranks.get(x['uid'], {}).get('name', ''),
                'wave': x['wave'], 'chars': [{'zh': a['_zh'], 'en': a['name']} for a in x['awakers']]}

    clears = [b for b in battles if b.get('slot') == 'clear']
    res['mystery'] = {
        'maxRounds': extreme(clears, 'stageRoundCount'),
        'maxCard': extreme(clears, 'totalUseCard'),
        'maxEnergy': extreme(clears, 'totalEnergyCost'),
        'maxBoutCard': extreme(clears, 'maxBoutUseCard'),
        'minCardDown': extreme([b for b in clears if threat_of(names, b['stageTid']) == '▼'], 'totalUseCard', largest=False),
        'firstRound': extreme(clears, 'bossBattleRoundCount'),
    }
    # average death resist, per awakener and per player, on ▼ + SSS battles
    ds_char = defaultdict(list)
    ds_player = defaultdict(list)
    for b in battles:
        if threat_of(names, b['stageTid']) not in ('▼', 'SSS') or b.get('deathResistCount') is None:
            continue
        ds_player[b['uid']].append(b['deathResistCount'])
        for a in b['awakers']:
            ds_char[str(a['tid'])].append(b['deathResistCount'])
    ds_all = [b['deathResistCount'] for b in battles
              if threat_of(names, b['stageTid']) in ('▼', 'SSS') and b.get('deathResistCount') is not None]
    res['deathAvg'] = {
        'all': round(sum(ds_all) / len(ds_all), 2) if ds_all else 0,
        'allBattles': len(ds_all),
        'chars': sorted([{'zh': names['aw'].get(t, ('', ''))[1], 'en': names['aw'].get(t, ('', ''))[0],
                          'avg': round(sum(v) / len(v), 2), 'n': len(v)} for t, v in ds_char.items() if len(v) >= 15],
                        key=lambda x: -x['avg'])[:5],
        'players': sorted([{'name': ranks.get(u, {}).get('name', ''), 'rank': ranks.get(u, {}).get('rank', 0),
                            'avg': round(sum(v) / len(v), 2), 'n': len(v)} for u, v in ds_player.items() if len(v) >= 5],
                          key=lambda x: -x['avg'])[:5],
    }

    # average rounds per battle (▼+SSS clears), and per-zone averages for the enlight spread
    def avg_rounds(rows):
        v = [b['stageRoundCount'] for b in rows if b.get('stageRoundCount') is not None]
        return round(sum(v) / len(v), 2) if v else None

    hard = [b for b in battles if b.get('slot') == 'clear' and threat_of(names, b['stageTid']) in ('▼', 'SSS')]
    res['avgRounds'] = {
        'hard': avg_rounds(hard),
        'all': avg_rounds([b for b in battles if b.get('slot') == 'clear']),
        'hardN': len(hard),
        'byZone': [{'wave': w, 'avg': avg_rounds([b for b in hard if b['wave'] == w]),
                    'n': len([b for b in hard if b['wave'] == w])} for w in range(1, 6)],
    }
    # token id -> zh, for keeper-skill names in the zone champions
    res['tokenTable'] = {k: v[1] for k, v in names['token'].items()}
    res['tokenEn'] = {k: v[0] for k, v in names['token'].items()}
    # mystery lineups: ▼ + SSS lineups that only one team brought
    grp = defaultdict(list)
    for r in teams:
        if threat_of(names, r['response']['stageTid']) not in ('▼', 'SSS'):
            continue
        mem = parse_team(r['response']['team'], names)
        grp['|'.join(sorted(m['tid'] for m in mem))].append((r, mem))
    my = []
    for key, rows in grp.items():
        best = max(rows, key=lambda x: x[0]['response']['score'])
        my.append({'count': len(rows), 'score': best[0]['response']['score'], 'rank': best[0]['rank'],
                   'wave': zone_of(names, best[0]['response']['stageTid']),
                   'threat': threat_of(names, best[0]['response']['stageTid']),
                   'token': keeper_token(best[0]),
                   'members': [{'zh': m['zh'], 'en': m['en'], 'potency': m['potency']} for m in best[1]]})
    my.sort(key=lambda x: (x['count'], -x['score']))
    # one lineup per zone first, so the five cards are not all from the same zone
    picked, used = [], set()
    for x in my:
        if x['wave'] and x['wave'] not in used and len(picked) < 5:
            used.add(x['wave'])
            picked.append(x)
    for x in my:
        if len(picked) >= 5:
            break
        if x not in picked:
            picked.append(x)
    res['mysteryLineups'] = picked[:5]

    # enlightenment spread on ▼ + SSS (per awakener appearance in those battles)
    enl = defaultdict(lambda: Counter())
    enl_tot = Counter()
    for b in battles:
        if b.get('slot') != 'clear':
            continue
        t = threat_of(names, b['stageTid'])
        if t not in ('▼', 'SSS'):
            continue
        for a in b['awakers']:
            tid = str(a['tid'])
            # potency level is not in battle-summary; use the team row instead -> handled below
    # potency from team rows on ▼+SSS
    enl2 = defaultdict(lambda: Counter())
    enl_all = Counter()
    enl_threat = {'▼': Counter(), 'SSS': Counter()}
    pot_zone = defaultdict(list)
    pot_all = []
    pot_sum = Counter()     # per awakener summed potency, for the exact average
    pot_cnt = Counter()
    pot_round = []          # (该队平均启灵, 该队回合数) on ▼+SSS
    for r in teams:
        t = threat_of(names, r['response']['stageTid'])
        if t not in ('▼', 'SSS'):
            continue
        w = zone_of(names, r['response']['stageTid'])
        mem = parse_team(r['response']['team'], names)
        pots = []
        for m in mem:
            tid = m['tid']
            p = m['potency'] or 0
            cls = '0-2' if p <= 2 else '3-5' if p <= 5 else '6-8' if p <= 8 else '9-11' if p <= 11 else '12+'
            enl2[tid][cls] += 1
            enl_all[cls] += 1
            enl_threat[t][cls] += 1
            pot_sum[tid] += p
            pot_cnt[tid] += 1
            pot_all.append(p)
            pots.append(p)
            if w:
                pot_zone[w].append(p)
        rc = (r['response']['team'].get('recordStageData') or {}).get('stageRoundCount')
        if pots and rc:
            pot_round.append((sum(pots) / len(pots), rc))
    rows = []
    for tid, c in enl2.items():
        tot = sum(c.values())
        # keep every awakener that showed up in a ▼/SSS team, no sample-size cut-off:
        # the spread itself is the story, and tiny samples are flagged in the footnote
        rows.append({'tid': tid, 'zh': names['aw'].get(tid, ('', ''))[1], 'en': names['aw'].get(tid, ('', ''))[0],
                     'n': tot, 'p12': round(c.get('12+', 0) / tot * 100, 1),
                     'avg': round(pot_sum[tid] / pot_cnt[tid], 2) if pot_cnt[tid] else None,
                     'small': tot < 20,
                     'dist': {k: c.get(k, 0) for k in ('0-2', '3-5', '6-8', '9-11', '12+')}})
    rows.sort(key=lambda x: (-x['p12'], -x['n']))
    res['enlight'] = rows
    res['enlightTotal'] = sum(r['n'] for r in rows)
    res['enlight12'] = round(sum(r['dist']['12+'] for r in rows) / res['enlightTotal'] * 100, 1) if res['enlightTotal'] else 0
    res['enlightSummary'] = {
        'dist': {k: sum(r['dist'][k] for r in rows) for k in ('0-2', '3-5', '6-8', '9-11', '12+')},
        'n': res['enlightTotal'],
        'avgPotency': round(sum(pot_all) / len(pot_all), 2) if pot_all else 0,
        'byZone': [{'wave': w, 'avg': round(sum(pot_zone[w]) / len(pot_zone[w]), 2) if pot_zone[w] else None,
                    'n': len(pot_zone[w])} for w in range(1, 6)],
        'full': [r['zh'] for r in rows if r['dist']['12+'] == r['n']],
        'fullN': sum(1 for r in rows if r['dist']['12+'] == r['n']),
        'low': sorted([{'zh': r['zh'], 'p12': r['p12'], 'n': r['n']} for r in rows if r['n'] >= 40],
                      key=lambda x: x['p12'])[:6],
    }
    # rounds by team-average potency bucket (▼+SSS teams that recorded a round count)
    buckets = [(0, 2, '0-2'), (2.01, 5, '3-5'), (5.01, 8, '6-8'), (8.01, 11, '9-11'), (11.01, 99, '12+')]
    rb = []
    for lo, hi, label in buckets:
        v = [rc for ap, rc in pot_round if lo <= ap <= hi]
        rb.append({'label': label, 'avg': round(sum(v) / len(v), 2) if v else None, 'n': len(v)})
    res['enlightSummary']['roundsByBucket'] = rb
    res['enlightSummary']['roundN'] = len(pot_round)
    res['enlightSummary']['byThreat'] = {
        k: {'dist': {b: c.get(b, 0) for b in ('0-2', '3-5', '6-8', '9-11', '12+')}, 'n': sum(c.values()),
            'p12': round(c.get('12+', 0) / sum(c.values()) * 100, 1) if sum(c.values()) else 0}
        for k, c in enl_threat.items()}

    # niche: ▼ usage per awakener (appearances in ▼ rows), zero-appearance list
    down_chars = Counter()
    sss_down_chars = Counter()
    for r in teams:
        t = threat_of(names, r['response']['stageTid'])
        if t not in ('▼', 'SSS'):
            continue
        mem = parse_team(r['response']['team'], names)
        seen = set()
        for m in mem:
            if m['tid'] in seen:
                continue
            seen.add(m['tid'])
            if t == '▼':
                down_chars[m['tid']] += 1
            sss_down_chars[m['tid']] += 1
    all_chars = [t for t in char_use if char_use[t] > 0]
    zero_down = [t for t in all_chars if down_chars.get(t, 0) == 0]
    zero_both = [t for t in all_chars if sss_down_chars.get(t, 0) == 0]
    res['niche'] = {
        'allChars': len(all_chars),
        'hardChars': len(enl2),
        'zeroDown': [{'zh': names['aw'].get(t, ('', ''))[1], 'en': names['aw'].get(t, ('', ''))[0]} for t in zero_down],
        'zeroBoth': [{'zh': names['aw'].get(t, ('', ''))[1], 'en': names['aw'].get(t, ('', ''))[0]} for t in zero_both],
        'leastDown': sorted([{'zh': names['aw'].get(t, ('', ''))[1], 'en': names['aw'].get(t, ('', ''))[0], 'n': down_chars.get(t, 0), 'all': char_use[t]}
                            for t in all_chars], key=lambda x: (x['n'], -x['all']))[:8],
        'leastBoth': sorted([{'zh': names['aw'].get(t, ('', ''))[1], 'en': names['aw'].get(t, ('', ''))[0], 'n': sss_down_chars.get(t, 0), 'all': char_use[t]}
                             for t in all_chars], key=lambda x: (x['n'], -x['all']))[:8],
    }

    # ---- 低配榜（第 7 版）：各禁区 SSS/▼ 的最低配阵容 + 各分数段最省玩家的全部队伍
    def pot_of(r):
        return sum((m['potency'] or 0) for m in parse_team(r['response']['team'], names))

    def row_rounds(r):
        return ((r['response']['team'].get('recordStageData') or {}).get('stageRoundCount') or 0)

    def lineup_key(mem):
        return '|'.join(sorted(m['tid'] for m in mem))

    def pick_proto(r):
        mem = parse_team(r['response']['team'], names)
        return {
            'wave': zone_of(names, r['response']['stageTid']),
            'threat': threat_of(names, r['response']['stageTid']),
            'rounds': row_rounds(r), 'zoneScore': r['response']['score'],
            'total': ranks[r['uid']]['score'], 'rank': r['rank'], 'name': ranks[r['uid']]['name'],
            'potSum': pot_of(r), 'token': keeper_token(r),
            'members': [{'zh': m['zh'], 'en': m['en'], 'potency': m['potency'], 'borrowed': m['borrowed']}
                        for m in mem],
        }

    def cheapest(sel, n=3):
        picks, seen = [], set()
        for r in sorted(sel, key=lambda r: (pot_of(r), -row_rounds(r), -r['response']['score'])):
            key = lineup_key(parse_team(r['response']['team'], names))
            if key in seen:
                continue
            seen.add(key)
            picks.append(pick_proto(r))
            if len(picks) >= n:
                break
        return picks

    zone_low = []
    for w in range(1, 6):
        blk = {'wave': w}
        for t, key in (('▼', 'down'), ('SSS', 'sss')):
            sel = [r for r in teams
                   if zone_of(names, r['response']['stageTid']) == w
                   and threat_of(names, r['response']['stageTid']) == t]
            pots = sorted(pot_of(r) for r in sel)
            blk[key] = {'teams': len(sel), 'potMin': pots[0] if pots else None,
                        'potMedian': statistics.median(pots) if pots else None,
                        'picks': cheapest(sel, 3)}
        zone_low.append(blk)

    down_all = [r for r in teams if threat_of(names, r['response']['stageTid']) == '▼']
    down_pots = sorted(pot_of(r) for r in down_all)
    sss_all = [r for r in teams if threat_of(names, r['response']['stageTid']) == 'SSS']
    by_uid = defaultdict(list)
    for r in teams:
        by_uid[r['uid']].append(r)

    bands = []
    for lo, hi, label in ((500, 10000, '500–525'), (475, 500, '475–500'), (450, 475, '450–475')):
        # 只按「平均启灵」排，不设队伍数门槛：用总和会让交得少的玩家天然占便宜
        pool = []
        for uid, rows_ in by_uid.items():
            sc = ranks[uid]['score']
            if not (lo <= sc < hi):
                continue
            cost = sum(pot_of(r) for r in rows_)
            pool.append((cost / len(rows_), -sc, uid, cost, rows_))
        pool.sort(key=lambda x: (x[0], x[1]))
        best = None
        top3 = []
        for avg, negsc, uid, cost, rows_ in pool[:3]:
            top3.append({'name': ranks[uid]['name'], 'rank': ranks[uid]['rank'], 'score': -negsc,
                         'avgPot': round(avg, 1), 'teams': len(rows_)})
        if pool:
            avg, negsc, uid, cost, rows_ = pool[0]
            items = sorted((pick_proto(r) for r in rows_), key=lambda x: (x['wave'] or 9, x['threat']))
            best = {'name': ranks[uid]['name'], 'uid': uid, 'rank': ranks[uid]['rank'], 'score': -negsc,
                    'avgPot': round(avg, 1), 'sumPot': cost, 'teams': len(rows_), 'items': items,
                    'top3': top3}
        dsel = [r for r in down_all if lo <= ranks[r['uid']]['score'] < hi]
        dpots = sorted(pot_of(r) for r in dsel)
        bands.append({'label': label, 'lo': lo, 'hi': None if hi >= 10000 else hi,
                      'players': sum(1 for u in ranks if lo <= ranks[u]['score'] < hi),
                      'teams': sum(1 for r in teams if lo <= ranks[r['uid']]['score'] < hi),
                      'downTeams': len(dsel),
                      'potMedian': statistics.median(dpots) if dpots else None,
                      'potMin': dpots[0] if dpots else None,
                      'candPlayers': len(pool), 'best': best,
                      'teamSpread': dict(sorted(Counter(len(v) for u, v in by_uid.items()
                                                       if lo <= ranks[u]['score'] < hi).items()))})

    res['lowcost'] = {
        'downN': len(down_all),
        'potMedian': statistics.median(down_pots) if down_pots else None,
        'potMin': down_pots[0] if down_pots else None,
        'sssN': len(sss_all),
        'sssMin': min((pot_of(r) for r in sss_all), default=None),
        'le': {str(t): sum(1 for x in down_pots if x <= t) for t in (15, 20, 25, 30)},
        'zones': zone_low,
        'bands': bands,
    }
    return res


def main():
    cur = analyse(73)
    prev = analyse(72)
    payload = {'current': cur, 'previous': prev}
    (OUT / 'report.json').write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding='utf-8')
    print('teams', cur['top']['teamN'], 'count', cur['count'], 'threshold', cur['threshold'])
    print('zones', [(z['wave'], z['teams'], z['down']) for z in cur['zones']])
    print('fastest', [(f['wave'], f['rounds']) for f in cur['fastest']])
    print('prev', prev['count'], prev['threshold'], [(z['wave'], z['down']) for z in prev['zones']])
    print('enlight', cur['enlightTotal'], cur['enlight12'], len(cur['enlight']))


if __name__ == '__main__':
    main()

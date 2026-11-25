#!/usr/bin/env python3
"""Build data/morimens/mainhard/gear.json: the Wheel / Covenant build of every (player, Awakener) pair that also
appears in the hard main-story clears.

The public main-story review list only publishes Awakener levels and the keeper skill (no equipment), and the
battle replay object does not carry the loadout either.  The D-Zone team records do: `weaponSlots` (Wheel + stack)
and `trinkets` -> `items[uid].suitId` (Covenant set).  This script walks the D-Zone seasons from the newest one
backwards, keeps the first record seen for a (uid, awaker tid) pair, and resolves names / icons through the
season `id-names.json` + `tier-pool.json` tables.

Usage: py scripts/build_main_hard_gear.py [stages dir]     (stages dir defaults to %LOCALAPPDATA% collector)
"""
from __future__ import annotations

import gzip
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
D = ROOT / 'data/morimens'
norm = lambda s: re.sub(r'[^a-z0-9]', '', str(s).lower().replace('+', ''))


def season_no(name: str) -> int:
    m = re.search(r'(\d+)', name)
    return int(m.group(1)) if m else 0


def newest_id_names() -> dict:
    merged = {'wheel': {}, 'covenant': {}, 'token': {}, 'awakers': {}}
    for s in sorted((D / 'dzone').glob('season*/id-names.json'), key=lambda p: season_no(p.parent.name), reverse=True):
        n = json.loads(s.read_text(encoding='utf-8'))
        for key in ('wheel', 'covenant', 'token', 'awakers'):
            for k, v in (n.get(key) or {}).items():
                merged[key].setdefault(k, v)
    return merged


def main() -> int:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(os.environ['LOCALAPPDATA']) / 'MorimensMainlineCollector/stages'
    pairs = set()
    for f in sorted(src.glob('*.json')):
        doc = json.loads(f.read_text(encoding='utf-8'))
        for r in doc['reviews']:
            for a in r['awakerOutlineList']:
                pairs.add((str(r['playerId']), str(a['tid'])))

    names = newest_id_names()
    kinds = json.loads((D / 'game/tier-pool.json').read_text(encoding='utf-8'))['kinds']
    by_name = {k: {norm(it['en']): it for it in kinds[k]} for k in ('wheel', 'covenant')}
    gear_cfg = json.loads((D / 'replay-gear.json').read_text(encoding='utf-8')).get('wheels', {})

    wh_names, cv_names = {}, {}

    def wheel_meta(tid: str):
        if tid not in wh_names:
            en = names['wheel'].get(tid) or tid
            it = by_name['wheel'].get(norm(en)) or {}
            icon = gear_cfg.get(tid, {}).get('icon', '')
            img = it.get('img') or (f'assets/morimens/wheels/{icon}.webp' if icon else '')
            wh_names[tid] = [it.get('zh') or en, img]
        return wh_names[tid]

    def cov_meta(tid: str):
        if tid not in cv_names:
            en = names['covenant'].get(tid) or tid
            it = by_name['covenant'].get(norm(en)) or {}
            cv_names[tid] = [it.get('zh') or en, it.get('img') or '']
        return cv_names[tid]

    seasons = sorted([p for p in (D / 'dzone').glob('season*') if (p / 'raw-teams').is_dir()],
                     key=lambda p: season_no(p.name), reverse=True)
    gear_map = {}
    for season in seasons:
        no = season_no(season.name)
        for f in sorted((season / 'raw-teams').glob('*.jsonl.gz')):
            with gzip.open(f, 'rt', encoding='utf-8') as fh:
                for line in fh:
                    try:
                        row = json.loads(line)
                        team = row['response']['team']
                    except Exception:  # noqa: BLE001 - a few rows are error payloads
                        continue
                    uid = str(row.get('uid') or '')
                    items = team.get('items') or {}
                    for aw in team.get('awakers') or []:
                        key = (uid, str(aw.get('tid')))
                        if key not in pairs or key in gear_map:
                            continue
                        wheels = []
                        for slot in aw.get('weaponSlots') or []:
                            if not isinstance(slot, dict):
                                continue
                            it = items.get(str(slot.get('weaponUid'))) or {}
                            if it.get('tid'):
                                wheels.append([str(it['tid']), int(slot.get('level') or 0)])
                        suits = {}
                        for tu in aw.get('trinkets') or []:
                            it = items.get(str(tu)) or {}
                            sid = it.get('suitId')
                            if sid:
                                suits[str(sid)] = suits.get(str(sid), 0) + 1
                        if not wheels and not suits:
                            continue
                        gear_map[key] = [no, wheels, sorted(suits.items(), key=lambda x: (-x[1], x[0]))]
        print(f'{season.name}: pairs so far {len(gear_map)}', flush=True)

    wh_ids = sorted({w[0] for v in gear_map.values() for w in v[1]}, key=int)
    cv_ids = sorted({c[0] for v in gear_map.values() for c in v[2]}, key=int)
    wh_idx = {t: i for i, t in enumerate(wh_ids)}
    cv_idx = {t: i for i, t in enumerate(cv_ids)}
    out_map = {}
    for (uid, tid), (no, wheels, suits) in gear_map.items():
        out_map[f'{uid}|{tid}'] = [no, [[wh_idx[w], s] for w, s in wheels], [[cv_idx[c], n] for c, n in suits]]
    out = {
        'version': 1,
        'wh': [[t, *wheel_meta(t)] for t in wh_ids],
        'cv': [[t, *cov_meta(t)] for t in cv_ids],
        'map': out_map,
    }
    dest = D / 'mainhard/gear.json'
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'{dest}: {len(out_map)} builds / {len(pairs)} pairs ({100*len(out_map)/max(1,len(pairs)):.1f}%), '
          f'{len(wh_ids)} wheels, {len(cv_ids)} covenant sets, {dest.stat().st_size:,} bytes')
    return 0


if __name__ == '__main__':
    sys.exit(main())

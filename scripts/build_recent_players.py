#!/usr/bin/env python3
"""Build data/morimens/eremora/recent/index.json for the leaderboard tab "玩家近期排名":
every player who reached the Top-2000 of any of the latest (up to) 10 D-Zone seasons that have a lowspec file (= full Top-2000 with teams),
with rank + score per season.  The team details of a season are NOT copied here: the page reads them from that season's lowspec file
(data/morimens/eremora/lowspec/<id>.json) when a row is expanded.

Run after scripts/build_lowspec_rank.py (scripts/sync_morimens_leaderboard.py does it).   python3 scripts/build_recent_players.py [--max 10]
"""
import json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
E = ROOT / 'data/morimens/eremora'
MAX = int(sys.argv[sys.argv.index('--max') + 1]) if '--max' in sys.argv else 10

def main():
    man = json.loads((E / 'manifest.json').read_text(encoding='utf-8'))
    entries = [e for e in man['availableSeasons'] if e.get('lowspecPath')]
    # one entry per season: the settled post-bug snapshot replaces the pre-bug board of season 69
    best = {}
    for e in entries:
        sid = e['seasonId']
        if sid not in best or e.get('snapshotId'): best[sid] = e
    chosen = [best[k] for k in sorted(best, reverse=True)[:MAX]]
    seasons, players = [], {}
    for si, e in enumerate(chosen):
        d = json.loads((ROOT / e['lowspecPath']).read_text(encoding='utf-8'))
        seasons.append({'id': e['seasonId'], 'key': str(d['season']), 'zh': e.get('labelZh') or f"第{e['seasonId']}期", 'en': e.get('labelEn') or f"Season {e['seasonId']}",
                        'period': e.get('periodShort') or e.get('period'), 'complete': e['seasonId'] != man.get('currentSeason'),
                        'path': e['lowspecPath'], 'count': len(d['players'])})
        for uid, name, rank, score in d['players']:
            p = players.setdefault(uid, {'name': name, 'name_season': si, 'r': [0] * len(chosen)})
            p['r'][si] = [rank, score]
            if si < p['name_season']: p['name'], p['name_season'] = name, si  # the newest season wins
    rows = [[uid, p['name'], p['r']] for uid, p in players.items()]
    rows.sort(key=lambda r: (-sum(1 for x in r[2] if x), r[0]))
    out = {'seasons': seasons, 'players': rows}
    dest = E / 'recent/index.json'; dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'{dest}: {len(seasons)} seasons ({", ".join(str(s["id"]) for s in seasons)}), {len(rows)} players, {dest.stat().st_size:,} bytes')

main()

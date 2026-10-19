# Season 71 (activityTid 83331) Top 1000 / 2000

Data updated: 2026-10-19 14:10 (Top 1000 snapshot) (UTC+8) — the season is still running (10/12 – 10/26), so this is a live snapshot.
Source: official `Rank.QueryRank` / `Facade.QueryFacadeFields` responses (`season_83331` capture, rank snapshot retrieved 2026-10-19T14:10:01+08:00 (this capture only covers ranks 1-1000); earlier snapshots are kept as `ranking-20261013-0200.json.gz`, `ranking-20261014-1214.json.gz`, `ranking-20261015-1205.json.gz` and `ranking-20261016-0020.json.gz` and `ranking-20261017-1124.json.gz` (the Top 2000 snapshots)).
The capture contains only `ranking.json` + `teams_latest.jsonl` (no uids.csv / error logs).

| File | Content |
| --- | --- |
| `meta.json` | Season metadata and file index |
| `ranking.json.gz` | Raw Top 2000 rank rows |
| `raw-teams/teams-NNN.jsonl.gz` | Lossless copy of `teams_latest.jsonl` (4,940 rows: player × stage group, clear + extra team, full battle record) |
| `battle-summary.jsonl.gz` | One row per battle (8,459): rounds, death-resist count, cards / energy, max damages, per-awakener damage / block / heal, relics |
| `id-names.json` | id → name dictionaries; stage ids map to Zone 1-5 and threat level (A=C … F=SSS, G=▼). Token 45298 = Pages Ever New (Ogier: Oathbound); creation 13886 = ☆Lady's Purse☆ (identified by the maintainer) |
| `scores.json`, `statistics.json` | Score distribution and battle totals |

Not every player has details for every zone yet (zone 1-5 rows: 1475 / 1021 / 1579 / 1532 / 1276 ...), because the capture is a partial live snapshot of teams still being queried.
No duplicate rank rows (one uid on two adjacent ranks), (1,000 players).
The leaderboard reads `data/morimens/eremora/usage/71-local-gzip`, `stats/71.json` and `rank-index/71.json`.
Rebuild with `scripts/import_morimens_season71_top2000.py`, `scripts/postprocess_morimens_eremora.mjs` and `scripts/pack_morimens_local_usage.py`.

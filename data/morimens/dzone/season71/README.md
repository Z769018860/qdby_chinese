# Season 71 (activityTid 83331) Top 1000 / 2000

Data updated: 2026-10-21 14:24 (Top 2000 snapshot) (UTC+8) — the season is still running (10/12 – 10/26), so this is a live snapshot.
Source: official `Rank.QueryRank` / `Facade.QueryFacadeFields` responses (`season_83331` capture, rank snapshot retrieved 2026-10-21T14:24:41+08:00; the 2026-10-19 14:56 Top 2000 snapshot is kept as `ranking-20261019-1456.json.gz`; the Top 1000 capture of 14:10 is kept as `ranking-20261019-1410-top1000.json.gz`; earlier snapshots are kept as `ranking-20261013-0200.json.gz`, `ranking-20261014-1214.json.gz`, `ranking-20261015-1205.json.gz` and `ranking-20261016-0020.json.gz` and `ranking-20261017-1124.json.gz` (the Top 2000 snapshots)).
The capture contains only `ranking.json` + `teams_latest.jsonl` (no uids.csv / error logs).

| File | Content |
| --- | --- |
| `meta.json` | Season metadata and file index |
| `ranking.json.gz` | Raw Top 2000 rank rows |
| `raw-teams/teams-NNN.jsonl.gz` | Lossless copy of `teams_latest.jsonl` (9,790 rows: player × stage group, clear + extra team, full battle record) |
| `battle-summary.jsonl.gz` | One row per battle (17,701): rounds, death-resist count, cards / energy, max damages, per-awakener damage / block / heal, relics |
| `id-names.json` | id → name dictionaries; stage ids map to Zone 1-5 and threat level (A=C … F=SSS, G=▼). Token 45298 = Pages Ever New (Ogier: Oathbound); creation 13886 = ☆Lady's Purse☆ (identified by the maintainer) |
| `scores.json`, `statistics.json` | Score distribution and battle totals |

Not every player has details for every zone yet (zone 1-5 rows: 1475 / 1021 / 1579 / 1532 / 1276 ...), because the capture is a partial live snapshot of teams still being queried.
No duplicate rank rows (one uid on two adjacent ranks), (2,000 players).
The leaderboard reads `data/morimens/eremora/usage/71-local-gzip`, `stats/71.json` and `rank-index/71.json`.
Rebuild with `scripts/import_morimens_season71_top2000.py`, `scripts/postprocess_morimens_eremora.mjs` and `scripts/pack_morimens_local_usage.py`.


## Latest ranking refresh — 2026-10-25 04:19 (UTC+8)

The official Top 2000 ranking and score distribution for activity 83331 have been refreshed from the uploaded `season_83331.zip` snapshot. The website rank index and `scores.json` now reflect this snapshot. The accompanying `teams_latest.jsonl` contains 9,816 rows for 2,000 UIDs, captured between 2026-10-13 and 2026-10-25; it has **not** yet been repacked into the 71st-season team-detail chunks. The existing detailed usage snapshot remains synced at 2026-10-21. 1630/2,000 current ranked UIDs have matching detailed profiles; 370 newly ranked UIDs are represented as rank-only entries until their team details are merged. The season is marked partial to avoid presenting those missing team details as complete.

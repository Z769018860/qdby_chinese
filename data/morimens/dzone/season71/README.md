# Season 71 (activityTid 83331) Top 1000 / 2000

Data updated: 2026-10-25 04:19 (Top 2000 snapshot) (UTC+8) — the season ends 10/26, so this is the last full snapshot before it closes.
Source: official `Rank.QueryRank` / `Facade.QueryFacadeFields` responses (`season_83331` capture, rank snapshot retrieved 2026-10-25T04:19:24+08:00). Team rows come from `teams_latest.jsonl` of the same capture (9,816 rows) merged with the 2026-10-21 14:24 raw shards, which still hold 1,818 rows the newer capture no longer carries — 11,634 rows in total, one per player × stage group. Earlier rank snapshots are kept as `ranking-20261021-1424.json.gz`, `ranking-20261019-1456.json.gz`, `ranking-20261019-1410-top1000.json.gz`, `ranking-20261013-0200.json.gz`, `ranking-20261014-1214.json.gz`, `ranking-20261015-1205.json.gz`, `ranking-20261016-0020.json.gz` and `ranking-20261017-1124.json.gz`.

| File | Content |
| --- | --- |
| `meta.json` | Season metadata and file index |
| `ranking.json.gz` | Raw Top 2000 rank rows (2026-10-25 04:19) |
| `ranking-previous.json.gz` | The rank snapshot the collector held before this one |
| `raw-teams/teams-NNN.jsonl.gz` | Lossless copy of the merged team rows (11,634: player × stage group, clear + extra team, full battle record) |
| `battle-summary.jsonl.gz` | One row per battle (21,373): rounds, death-resist count, cards / energy, max damages, per-awakener damage / block / heal, relics |
| `id-names.json` | id → name dictionaries; stage ids map to Zone 1-5 and threat level (A=C … F=SSS, G=▼). Token 45298 = Pages Ever New (Ogier: Oathbound); token 151695 = Nightborn Evil (Vivian's posse, inferred from usage — see `_inferred`); creation 13886 = ☆Lady's Purse☆ (identified by the maintainer) |
| `scores.json`, `statistics.json` | Score distribution and battle totals |

All 2,000 ranked players now have team details (the 370 UIDs that were rank-only after the 2026-10-25 rank refresh are covered by the merged older capture). No duplicate rank rows (one uid on two adjacent ranks).
The leaderboard reads `data/morimens/eremora/usage/71-local-gzip`, `stats/71.json` and `rank-index/71.json`.
Rebuild with `scripts/import_morimens_season71_top2000.py`, `scripts/postprocess_morimens_eremora.mjs` and `scripts/pack_morimens_local_usage.py`; pass the previous `raw-teams` directory as `--fallback-raw` so rows the newest capture dropped are kept.


## Merge log

### 2026-10-25 04:19 (UTC+8) — team details completed

The 2026-10-25 04:19 capture has been repacked into the 71st-season team-detail chunks. The previous detailed snapshot was still the 2026-10-21 14:24 build, so 370 of the 2,000 currently ranked UIDs had no profile at all; merging the two captures (`teams_latest.jsonl` wins per player × stage group, older shards fill the gaps) lifts coverage to 2,000/2,000 and the season is no longer marked partial. Battle-level statistics grow from 17,701 to 21,373 rows.

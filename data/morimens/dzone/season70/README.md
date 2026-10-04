# Season 70 (activityTid 83315) Top 2000

Data updated: 2026-10-05 07:04 (UTC+8). Source: official `Rank.QueryRank` / `Facade.QueryFacadeFields`
responses from the `season_83315` capture; rank snapshot retrieved 2026-10-05T07:04:03+08:00 (`ranking.json.gz`);
earlier snapshots are kept as `ranking-20261001-0546.json.gz`, `ranking-20261002-0221.json.gz` and `ranking-20261002-0250.json.gz`, `ranking-20261002-2353.json.gz` and `ranking-20261004-0740.json.gz`.
Team rows = the complete `teams_latest.jsonl` of the 2026-10-05 07:04 capture merged over earlier captures (older rows only fill gaps and keep players that left the Top 2000).

| File | Content |
| --- | --- |
| `meta.json` | Season metadata and file index |
| `ranking.json.gz` | Raw Top 2000 rank rows (uid, name, score, per-stage-group battle ids) |
| `ranking-previous.json.gz` | Previous rank snapshot (Top 1000) |
| `raw-teams/teams-NNN.jsonl.gz` | Original team rows (one per player × stage group, both the clear and the extra team, full battle record incl. `battleStatPack`), byte for byte as captured; rows that exist in several captures keep the newest |
| `battle-summary.jsonl.gz` | One row per battle: rounds (`stageRoundCount`, `bossBattleRoundCount`), `deathResistCount`, `respawnedNum`, cards / energy used, max counter / tentacle / bout damage, HP, per-awakener damage / block / heal, relics |
| `id-names.json` | id → name dictionaries (awakeners, wheels, creations, tokens, covenants, stages) used for the site format |
| `scores.json`, `statistics.json` | Score distribution and battle totals |
| `uids.csv`, `team-errors.jsonl`, `pending-queries.jsonl.gz` | Capture bookkeeping (14 rows were rejected because the detail stage did not match the final rank list; 1 more row is missing) |

The leaderboard itself reads `data/morimens/eremora/usage/70-local-gzip`, `stats/70.json` and `rank-index/70.json`;
every team there carries a `battle` object with the same per-battle fields.
Rebuild with `scripts/import_morimens_season70_top2000.py`, `scripts/postprocess_morimens_eremora.mjs` and
`scripts/pack_morimens_local_usage.py`.

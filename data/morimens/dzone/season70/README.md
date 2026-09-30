# Season 70 (activityTid 83315) Top 2000

Data updated: 2026-10-01 05:00 (UTC+8). Source: official `Rank.QueryRank` / `Facade.QueryFacadeFields`
responses from the `season_83315` capture (raw rank snapshot retrieved 2026-10-01T05:46:26+08:00).

| File | Content |
| --- | --- |
| `meta.json` | Season metadata and file index |
| `ranking.json.gz` | Raw Top 2000 rank rows (uid, name, score, per-stage-group battle ids) |
| `ranking-previous.json.gz` | Previous rank snapshot (Top 1000) |
| `raw-teams/teams-NNN.jsonl.gz` | **Lossless** copy of `teams_latest.jsonl` (9,560 rows: one per player × stage group, both the clear and the extra team, full battle record incl. `battleStatPack`). Concatenating the decompressed shards reproduces the original file byte for byte |
| `battle-summary.jsonl.gz` | One row per battle (17,265): rounds (`stageRoundCount`, `bossBattleRoundCount`), `deathResistCount`, `respawnedNum`, cards / energy used, max counter / tentacle / bout damage, HP, per-awakener damage / block / heal, relics |
| `id-names.json` | id → name dictionaries (awakeners, wheels, creations, tokens, covenants, stages) used for the site format |
| `scores.json`, `statistics.json` | Score distribution and battle totals |
| `uids.csv`, `team-errors.jsonl`, `pending-queries.jsonl.gz` | Capture bookkeeping (14 rows were rejected because the detail stage did not match the final rank list; 1 more row is missing) |

The leaderboard itself reads `data/morimens/eremora/usage/70-local-gzip`, `stats/70.json` and `rank-index/70.json`;
every team there carries a `battle` object with the same per-battle fields.
Rebuild with `scripts/import_morimens_season70_top2000.py`, `scripts/postprocess_morimens_eremora.mjs` and
`scripts/pack_morimens_local_usage.py`.

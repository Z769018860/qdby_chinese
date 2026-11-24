# Season 73 (activityTid 83326) Top 2000 — FINAL (settled 2026-11-22)

Data updated: 2026-11-23 09:18 (UTC+8) — **final settled snapshot**: the season ended on 11/22, this is the settlement board.
Source: official `Rank.QueryRank` / `Facade.QueryFacadeFields` responses (`season_83326` capture, rank snapshot retrieved 2026-11-23T09:18:59+08:00, team rows collected until 09:41). Team rows come from `teams_latest.jsonl` of the same capture (9,873 rows) merged with the 2026-11-15 00:57 raw shards, which still hold 9,265 rows the newer capture no longer carries — 19,138 rows in total, one per player × stage group; every player who left the Top 2000 stays in the raw archive only. All 2,000 ranked players have team details. Earlier rank snapshots are kept as `ranking-20261115-0057.json.gz`, `ranking-20261112-1920.json.gz`, `ranking-20261110-1520.json.gz` and `ranking-previous.json.gz`.

| File | Content |
| --- | --- |
| `meta.json` | Season metadata and file index |
| `ranking.json.gz` | Raw Top 2000 rank rows (2026-11-23 09:18) |
| `ranking-previous.json.gz` | The rank snapshot the collector held before this one |
| `raw-teams/teams-NNN.jsonl.gz` | Lossless copy of the merged team rows (19,138: player × stage group, clear + extra team, full battle record) |
| `battle-summary.jsonl.gz` | One row per battle (37,101): rounds, death-resist count, cards / energy, max damages, per-awakener damage / block / heal, relics |
| `id-names.json` | id → name dictionaries; stage ids map to Zone 1-5 and threat level (A=C … F=SSS, G=▼). Wheel 155077 = Next Time It Rains / 下一个雨天 (SKeyDB wheel-0184 + the HuijiWiki wheel list — see `_inferred`); creation 98420 is still unnamed (shown as `#98420`) |
| `scores.json`, `statistics.json` | Score distribution and battle totals |

Board shape: 2,000 players, top score 525 (8 players on it), 36 players ≥500, 611 ≥450, 878 ≥425, mean 422.1 / median 415, the 2,000th player sits on 385.
Stage groups 83424..83428 map to Zone 1-5. Creation 83511 = Ultra Ring (the 超维 ring creation, see `_inferred`).
The leaderboard reads `data/morimens/eremora/usage/73-local-gzip`, `stats/73.json` and `rank-index/73.json`.
Rebuild/update with `scripts/sync_morimens_leaderboard.py --season 73 <capture>` (see docs/morimens-leaderboard-sync-workbuddy.md); pass the previous `raw-teams` directory as fallback so rows the newest capture dropped are kept.


## Merge log

### 2026-11-15 00:57 (UTC+8) — first-day snapshot

`season_83326` first capture imported: 1,999 ranked players (one uid appeared on two adjacent ranks), 13,940 team rows, 26,581 battles. Wheel 155077 was not named yet; the board was marked `official-rank-top2000`.

### 2026-11-23 09:18 (UTC+8) — final settlement

`season_83326` settlement capture (`ranking.json` 2,000 rows + `teams_latest.jsonl` 9,873 team rows) imported with `--fallback-raw` pointing at the previous merged `raw-teams`, so the 9,265 rows the final capture does not carry are kept from the older captures: 19,138 rows in total, all 2,000 ranked players have team details, 37,101 battles. Wheel 155077 named as Next Time It Rains (下一个雨天). No duplicate rank rows this time. The previous (11-15 00:57) rank snapshot is kept as `ranking-20261115-0057.json.gz`. The full procedure is written down in `docs/morimens-leaderboard-sync-workbuddy.md`.

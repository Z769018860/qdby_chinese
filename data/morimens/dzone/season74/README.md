# Season 74 (activityTid 83305) Top 2000 — first-day snapshot (season running until 2026-12-06)

Data updated: 2026-11-24 03:38 (UTC+8) — **in-progress snapshot**, the season opened on 11/23 and is still running; this is the board as it stood ~4 hours in.
Source: official `Rank.QueryRank` / `Facade.QueryFacadeFields` responses (`season_83305` capture, rank snapshot retrieved 2026-11-24T03:38:58+08:00). Team rows come from `teams_latest.jsonl` of the same capture (7,118 rows, one per player × stage group, clear + extra team).
No fallback rows: the previous capture belongs to Season 73 and its stage ids are a different set, so `--no-fallback` was used. All 1,997 unique ranked players have team details.

The collector reports 7,118 of 7,136 expected players with a verifiable team; the 18 remaining uids are not inside the Top 2000, so they do not affect the board.

| File | Content |
| --- | --- |
| `meta.json` | Season metadata and file index |
| `ranking.json.gz` | Raw Top 2000 rank rows (2026-11-24 03:38); 3 uids appear on two adjacent ranks, so 1,997 unique players |
| `raw-teams/teams-NNN.jsonl.gz` | Lossless copy of the imported team rows (7,118: player × stage group, clear + extra team, full battle record) |
| `battle-summary.jsonl.gz` | One row per battle (13,135): rounds, death-resist count, cards / energy, max damages, per-awakener damage / block / heal, relics |
| `id-names.json` | id → name dictionaries; stage ids map to Zone 1-5 and threat level (A=C … F=SSS, G=▼), `madness` = the client `StageLevel`. Wheel / creation / token / covenant tables carried over from Season 73 (no new ids this season); creation 98420 is still unnamed (shown as `#98420`) |
| `scores.json`, `statistics.json` | Score distribution and battle totals |

Board shape: 1,997 players, top score 500 (single player), 9 players ≥475, 121 ≥450, 237 ≥400, 615 ≥350, mean 285.5 / median 285, the last player sits on 150.
Stage groups 83416 / 83414 / 83415 / 83417 / 83418 map to Zone 1 / 2 / 3 / 4 / 5 (verified against the client `CnID` of every stage id). Creation 83509 = Aequor Ring (深海戒指) is this season's ring, carried by 56% of the teams.
The leaderboard reads `data/morimens/eremora/usage/74-local-gzip`, `stats/74.json` and `rank-index/74.json`.
Rebuild/update with `scripts/sync_morimens_leaderboard.py --season 74 <capture>` (see docs/morimens-leaderboard-sync-workbuddy.md); later captures of the same season may pass this `raw-teams` directory as fallback, because their stage ids are identical.

## Merge log

### 2026-11-24 03:38 (UTC+8) — first-day snapshot

`season_83305` first capture imported: 1,997 unique ranked players (3 uids appeared on two adjacent ranks), 7,118 team rows, 13,135 battles, usage v2 payload 648,554 gzip bytes in 2 chunks + 503,118 bytes of battle detail. Season 74 stage ids created from the client stage dump: A–E groups got new ids (81xxx–83xxx) while F/G stay in the 153xxx range. `--no-fallback` (the Season 73 archive cannot be reused), board marked `official-rank-top2000` and `complete: true` because every ranked player has team details.

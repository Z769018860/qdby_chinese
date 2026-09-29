# Morimens official D-Zone data

This directory keeps data decoded from the official Morimens client for the
D-Zone leaderboard. It is intentionally separate from the older Eremora raw
snapshots.

## Season 70 status

- activityTid: **83315**
- official rank index: **1000 / 1000**
- official stage-index players: **1000**
- stage rows: **4934**
- players with all five visible stage groups: **935**
- rows carrying an extra-team pointer: **474**
- current canonical full team-detail records: still the existing **459** until
  Facade detail hydration is complete.

The stage-group mapping is:

| stageGroupId | Wave |
| ---: | ---: |
| 83439 | 1 |
| 83440 | 2 |
| 83441 | 3 |
| 83442 | 4 |
| 83444 | 5 |

`stage-index.json` is the query plan for the detail phase. Each stage row
contains the player UID plus the known stageGroupId, stageId, score, wid /
battleUuid and optional widExtra / battleUuidExtra.

## Facade detail capture contract

The website importer does not send game traffic. Feed it **already-decoded**
`Facade.QueryFacadeFields` responses, wrapped like this:

```json
{
  "uid": "100167859",
  "stageGroupId": 83439,
  "response": {
    "score": 110,
    "stageTid": 153184,
    "extraPass": true,
    "team": {
      "keeperSkill": {},
      "items": {},
      "awakers": [],
      "recordStageData": {}
    },
    "teamExtra": {}
  }
}
```

JSON arrays and JSONL are both accepted. The wrapper UID and stageGroupId are
required so decoded responses cannot be assigned to the wrong player/wave.

Run:

```bash
python scripts/import_morimens_official_facade.py \
  --root . \
  --season 70 \
  --details path/to/decoded_facade
```

The importer validates every stage row, expected `teamExtra`, and four-member
team before replacing the browser dataset. A partial capture only writes
`detail-import-report.json`; use `--allow-partial` only for development.

The normalized output remains the same schema already consumed by
`morimens-dtide.js`: record -> waves -> teams -> members, with token,
creations, wheels, covenants, assist metadata, wid, and battleUuid.

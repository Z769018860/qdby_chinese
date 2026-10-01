#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Import the Season 69 post-bug final Top 2000 capture (activityTid 83329).

Input: the extracted `season_83329` archive (ranking.json, uids.csv, team_errors.jsonl,
pending_queries.jsonl) plus a JSONL file of team rows (--teams).  The uploaded archive was truncated,
so --teams is the recovered prefix of teams.jsonl.gz (ranks 1-1559); incomplete / unparsable lines are skipped.

Outputs:
  * <root>/data/morimens/dzone/season69-postbug/   lossless raw archive + battle-level summary
  * <root>/data/morimens/eremora/usage/69-postbug-gzip + 69-postbug-battle-gzip
  * <root>/data/morimens/eremora/rank-index/69-postbug.json
  * <work>/seasons/69.json  site-format season document (input of postprocess_morimens_eremora.mjs)

The site format carries the same fields as the earlier Eremora import; battle
statistics that the leaderboard does not use yet (death-resist count, rounds,
card/energy usage, counter/tentacle damage ...) are attached to every team as
`battle`, and the complete original rows are kept in the raw shards.
"""
from __future__ import annotations

import argparse
import base64
import csv
import gzip
import hashlib
import json
import shutil
from collections import Counter
from pathlib import Path

ACTIVITY = 83329
SEASON = 69
VARIANT = "69-postbug"
PERIOD = "2026-09-14 – 2026-09-28"
DATA = "data/morimens"
# stageGroupId -> wave number (verified against the previous Eremora import)
GROUP_WAVE = {83394: 1, 83395: 2, 83396: 3, 83397: 4, 83398: 5}
SOURCE_TRANSPORT = "Morimens official Rank.QueryRank + Facade.QueryFacadeFields (season_83329 Top2000, post-bug final)"
BATTLE_FIELDS = [
    "stageRoundCount", "bossBattleRoundCount", "deathResistCount", "respawnedNum",
    "totalUseCard", "totalEnergyCost", "maxBoutUseCard", "maxBoutEnergyCost",
    "maxBoutDamage", "maxCounterAtt", "maxTentacleDamage", "maxStrength",
    "maxPosion", "maxHp", "leftHp", "playerLevel", "recordTime",
]


def dump_json(path: Path, obj, indent=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    if indent:
        text = json.dumps(obj, ensure_ascii=False, indent=indent) + "\n"
    else:
        text = json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n"
    path.write_text(text, encoding="utf-8")


def write_gz(path: Path, data: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as fh:
        fh.write(gzip.compress(data, compresslevel=9, mtime=0))


def weapon_slots(awaker):
    slots = awaker.get("weaponSlots") or []
    if isinstance(slots, dict):  # some rows key the slots by index
        slots = [slots[k] for k in sorted(slots, key=int)]
    return slots


def convert_team(side, stage_name, names, kind):
    items = side.get("items") or {}
    rsd = side["recordStageData"]
    members = []
    for a in side["awakers"]:
        info = names["awakers"][str(a["tid"])]
        wheels = []
        for s in weapon_slots(a):
            it = items.get(str(s.get("weaponUid")))
            if not it:
                continue
            wid = it["tid"]
            wheels.append({"id": wid, "name": names["wheel"].get(str(wid), f"#{wid}"), "level": s.get("level")})
        suits = Counter()
        for u in a.get("trinkets") or []:
            it = items.get(str(u))
            if it and it.get("suitId"):
                suits[it["suitId"]] += 1
        assist = a.get("assistPlayerId") or 0
        members.append({
            "name": info["name"],
            "canonicalName": info["canonicalName"],
            "ingameId": info["ingameId"],
            "realm": info["realm"],
            "role": info["role"],
            "level": a.get("level"),
            "potencyLevel": a.get("potencyLevel"),
            "wheels": wheels,
            "covenants": [
                {"id": sid, "name": names["covenant"].get(str(sid), f"#{sid}"), "count": n}
                for sid, n in suits.items()
            ],
            "borrowed": bool(assist),
            "assistUid": assist if assist else None,
            "tid": a["tid"],
            "breakLevel": a.get("breakLevel"),
            "levelLimitIncreaseIdx": a.get("levelLimitIncreaseIdx"),
            "damage": stat(rsd.get("AwakerDoDamage"), str(a["tid"])) or 0,
            "block": stat(rsd.get("AwakerDoBlock"), str(a["tid"])) or 0,
            "heal": stat(rsd.get("AwakerDoHeal"), str(a["tid"])) or 0,
        })
    token = side.get("keeperSkill")
    return {
        "stageName": stage_name,
        "score": None,  # filled by caller for the clear battle
        "clearType": kind,
        "token": {"id": token, "name": names["token"].get(str(token), f"#{token}")} if token else None,
        "creations": [
            {"id": r["tid"], "name": names["creation"].get(str(r["tid"]), f"#{r['tid']}")}
            for r in rsd.get("relics") or []
        ],
        "battleUuid": rsd["battleUuid"],
        "members": members,
        "battle": {**{k: rsd.get(k) for k in BATTLE_FIELDS},
                   "otherDamage": stat(rsd.get("AwakerDoDamage"), "1") or 0},  # damage not attributed to an awakener (map key "1")
    }


def stat(d, key):
    return d.get(key) if isinstance(d, dict) else None  # empty maps arrive as []


def pack_battle(root: Path, battles: dict, generated_at: str, chunk_size: int = 600_000):
    """gzip + base64 chunks, same layout as the usage chunks (see morimens-dtide-loader.js)."""
    out_dir = root / DATA / "eremora/usage/69-postbug-battle-gzip"
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("chunk-*.b64"):
        old.unlink()
    payload = json.dumps({"seasonId": SEASON, "battles": battles}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    comp = gzip.compress(payload, compresslevel=9, mtime=0)
    chunks = []
    for n, off in enumerate(range(0, len(comp), chunk_size)):
        f = out_dir / f"chunk-{n:03d}.b64"
        f.write_text(base64.b64encode(comp[off:off + chunk_size]).decode("ascii") + "\n", encoding="ascii")
        chunks.append(f"{DATA}/eremora/usage/69-postbug-battle-gzip/{f.name}")
    dump_json(out_dir / "index.json", {
        "format": "gzip-base64-chunked-v1", "seasonId": SEASON, "recordCount": 0, "battleCount": len(battles),
        "source": "season_83315 per-battle statistics (death resist, rounds, damage split ...)",
        "revision": hashlib.sha256(comp).hexdigest(), "generatedAt": generated_at,
        "chunks": chunks, "chunkSize": chunk_size, "compressedBytes": len(comp),
    }, indent=2)


def pack_usage(root: Path, records: list, generated_at: str, chunk_size: int = 600_000):
    out_dir = root / DATA / "eremora/usage/69-postbug-gzip"
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("chunk-*.b64"):
        old.unlink()
    payload = json.dumps({"seasonId": SEASON, "records": records}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    comp = gzip.compress(payload, compresslevel=9, mtime=0)
    chunks = []
    for n, off in enumerate(range(0, len(comp), chunk_size)):
        f = out_dir / f"chunk-{n:03d}.b64"
        f.write_text(base64.b64encode(comp[off:off + chunk_size]).decode("ascii") + "\n", encoding="ascii")
        chunks.append(f"{DATA}/eremora/usage/69-postbug-gzip/{f.name}")
    index = {
        "format": "gzip-base64-chunked-v1", "seasonId": SEASON, "snapshotId": VARIANT, "recordCount": len(records),
        "source": "season_83329 Top2000 (post-bug final)", "revision": hashlib.sha256(comp).hexdigest(),
        "generatedAt": generated_at, "chunks": chunks, "chunkSize": chunk_size, "compressedBytes": len(comp),
    }
    dump_json(out_dir / "index.json", index, indent=2)
    return index


def summary_row(row, side, slot, names, wave, extra_pass):
    rsd = side["recordStageData"]
    out = {
        "uid": row["uid"], "rank": row["rank"], "stageGroupId": row["stageGroupId"], "wave": wave,
        "slot": slot, "stageTid": row["response"]["stageTid"], "stageId": rsd.get("stageId"),
        "score": row["response"]["score"], "extraPass": extra_pass,
        "battleUuid": rsd["battleUuid"], "wid": rsd.get("wid"),
    }
    for k in BATTLE_FIELDS:
        out[k] = rsd.get(k)
    out["keeperSkill"] = side.get("keeperSkill")
    out["awakers"] = [
        {
            "tid": a["tid"], "name": names["awakers"][str(a["tid"])]["name"],
            "level": a.get("level"), "assist": bool(a.get("assistPlayerId")),
            "damage": stat(rsd.get("AwakerDoDamage"), str(a["tid"])),
            "block": stat(rsd.get("AwakerDoBlock"), str(a["tid"])),
            "heal": stat(rsd.get("AwakerDoHeal"), str(a["tid"])),
        }
        for a in side["awakers"]
    ]
    out["playerDamage"] = stat(rsd.get("AwakerDoDamage"), "1")
    out["relics"] = [r["tid"] for r in rsd.get("relics") or []]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="extracted season_83329 directory")
    ap.add_argument("--teams", required=True, help="JSONL of team rows (recovered prefix)")
    ap.add_argument("--root", default=".", help="repository root")
    ap.add_argument("--work", required=True, help="scratch dir receiving seasons/69.json")
    ap.add_argument("--updated-at", default="2026-10-01 05:00")
    ap.add_argument("--updated-at-iso", default="2026-10-01T05:00:00+08:00")
    ap.add_argument("--shard-lines", type=int, default=1200)
    args = ap.parse_args()

    src, root, work = Path(args.src), Path(args.root), Path(args.work)
    out = root / DATA / "dzone/season69-postbug"
    names = json.loads((out / "id-names.json").read_text(encoding="utf-8"))
    stages = names["stages"]

    ranking = json.loads((src / "ranking.json").read_text(encoding="utf-8"))
    rows = ranking["rows"]
    rank_of = {r["uid"]: r for r in rows}

    raw_dir, raw_shards = out / "raw-teams", []
    raw_dir.mkdir(parents=True, exist_ok=True)
    stale_shards = list(raw_dir.glob("teams-*.jsonl.gz"))  # removed only after a successful run
    summary, site_teams, buf, shard_no, lines = [], {}, [], 0, 0
    death = Counter()

    def flush():
        nonlocal buf, shard_no
        if not buf:
            return
        name = f"teams-{shard_no:03d}.jsonl.gz"
        write_gz(raw_dir / name, b"".join(buf))
        raw_shards.append({"file": f"raw-teams/{name}", "lines": len(buf)})
        buf, shard_no = [], shard_no + 1

    skipped = 0
    with open(args.teams, "rb") as fh:  # binary: keep the original CRLF bytes
        for line in fh:
            if not line.strip():
                continue
            try:
                row = json.loads(line)
                row["response"]["team"]["recordStageData"]  # noqa: B018 - a cut-off tail line fails here
            except Exception:
                skipped += 1
                continue
            buf.append(line)
            lines += 1
            if len(buf) >= args.shard_lines:
                flush()
            resp = row["response"]
            wave = GROUP_WAVE[row["stageGroupId"]]
            st = stages[str(resp["stageTid"])]
            main_side, extra_side = resp["team"], resp.get("teamExtra")
            extra_pass = bool(resp.get("extraPass"))
            teams = []
            t = convert_team(main_side, st["name"], names, "clear")
            t["score"] = resp["score"]
            teams.append(t)
            summary.append(summary_row(row, main_side, "clear", names, wave, extra_pass))
            death[row["uid"]] += main_side["recordStageData"].get("deathResistCount") or 0
            if isinstance(extra_side, dict) and extra_side:
                summary.append(summary_row(row, extra_side, "extra", names, wave, extra_pass))
                if extra_pass:
                    e = convert_team(extra_side, st["name"], names, "extra")
                    teams.append(e)
            if wave in site_teams.get(row["uid"], {}):
                raise SystemExit(f"duplicate row for uid {row['uid']} wave {wave}")
            site_teams.setdefault(row["uid"], {})[wave] = {
                "wave": wave, "madness": st["madness"], "teams": teams, "stageGroupId": row["stageGroupId"],
                "stageTid": resp["stageTid"],
            }
    flush()
    new_names = {x["file"].split("/")[-1] for x in raw_shards}
    for old in stale_shards:
        if old.name not in new_names:
            old.unlink()

    # --- site-format season document --------------------------------------
    records = []
    for r in rows:
        uid = r["uid"]
        waves = [site_teams[uid][w] for w in sorted(site_teams.get(uid, {}))]
        if not waves:
            continue
        records.append({
            "rank": r["rank"], "player": r["name"], "uid": str(uid), "score": r["score"],
            "currentScore": r["score"], "url": f"https://eremora.com/u/{uid}/challenges/dzone/{SEASON}", "snapshotId": VARIANT,
            "seasonId": SEASON, "waves": waves, "sourceTransport": SOURCE_TRANSPORT,
        })
    season_doc = {
        "seasonId": SEASON, "snapshotId": VARIANT, "period": PERIOD, "leaderboardEntryCount": len(rows),
        "recordCount": len(records), "complete": len(records) == len(rows), "coverageMode": "official-rank-top2000",
        "source": {"site": "Morimens official", "activityTid": ACTIVITY, "syncedAt": args.updated_at_iso},
        "failures": [str(r["uid"]) for r in rows if r["uid"] not in site_teams], "records": records,
    }
    # Per-battle statistics go to a separate lazily loaded payload so the leaderboard itself stays small.
    battles = {}
    for rec in records:
        for w in rec["waves"]:
            for t in w["teams"]:
                b = t.pop("battle")
                members = []
                for m in t["members"]:
                    members.append([m["tid"], m.pop("damage", 0), m.pop("block", 0), m.pop("heal", 0)])
                battles[t["battleUuid"]] = {"b": b, "m": members}
    pack_battle(root, battles, args.updated_at_iso)
    dump_json(work / "seasons/69.json", season_doc)
    dump_json(root / DATA / "eremora/rank-index/69-postbug.json", {
        "source": {"site": "Morimens official", "activityTid": ACTIVITY, "syncedAt": args.updated_at_iso,
                   "retrievedAt": ranking["retrievedAt"]},
        "seasonId": SEASON, "snapshotId": VARIANT, "target": len(rows), "complete": len(rows) >= 2000,
        "coverage": {"target": len(rows), "count": len(rows), "maxRank": max(r["rank"] for r in rows),
                     "missingCount": len(rows) - len(records), "profileAvailable": len(records), "profileMissing": len(rows) - len(records)},
        "failures": [], "recordCount": len(rows),
        "rows": [{"rank": r["rank"], "uid": str(r["uid"]), "name": r["name"], "rawName": r["name"],
                  "score": r["score"], "level": 0,
                  "url": f"https://eremora.com/u/{r['uid']}/challenges/dzone/{SEASON}"} for r in rows],
    })

    # --- archive under data/morimens/dzone/season70 -------------------------
    write_gz(out / "battle-summary.jsonl.gz",
             "".join(json.dumps(s, ensure_ascii=False, separators=(",", ":")) + "\n" for s in summary).encode("utf-8"))
    write_gz(out / "ranking.json.gz", (src / "ranking.json").read_bytes())
    write_gz(out / "pending-queries.jsonl.gz", (src / "pending_queries.jsonl").read_bytes())
    shutil.copyfile(src / "uids.csv", out / "uids.csv")
    shutil.copyfile(src / "team_errors.jsonl", out / "team-errors.jsonl")

    scores = Counter(r["score"] for r in rows)
    dump_json(out / "scores.json", {
        "season": SEASON, "updatedAt": args.updated_at, "totalPlayers": len(rows),
        "scoreDistribution": {str(k): v for k, v in sorted(scores.items(), reverse=True)},
        "source": "season_83329 ranking.json",
    }, indent=2)
    totals = {k: sum(s[k] or 0 for s in summary if s["slot"] == "clear") for k in
              ("deathResistCount", "stageRoundCount", "bossBattleRoundCount", "totalUseCard", "totalEnergyCost")}
    dump_json(out / "statistics.json", {
        "season": SEASON, "updatedAt": args.updated_at, "rankCount": len(rows),
        "playersWithTeamDetail": len(records), "teamRows": lines, "battleRows": len(summary),
        "clearBattleTotals": totals,
        "note": "死扛触发次数(deathResistCount)、回合数(stageRoundCount/bossBattleRoundCount)等字段尚未计入榜单统计，已逐场保存在 battle-summary.jsonl.gz 与 raw-teams 中。",
    }, indent=2)
    dump_json(out / "meta.json", {
        "season": SEASON, "snapshot": VARIANT, "activityTid": ACTIVITY, "name": "第69期 · Bug后 终榜 Top 2000", "date": "9.14-9.28",
        "updatedAt": args.updated_at, "source": "official live Rank.QueryRank response",
        "sourceRetrievedAt": ranking["retrievedAt"], "rankRange": ranking["rankRange"],
        "recordCount": len(rows), "playersWithTeamDetail": len(records), "teamRows": lines, "skippedTailLines": skipped,
        "maxRankWithDetail": max((rec["rank"] for rec in records), default=0),
        "note": "The uploaded archive was truncated: team detail exists for ranks 1-%d only; ranks above are rank-only." % max((rec["rank"] for rec in records), default=0),
        "stageGroupIds": ranking["stageGroupIds"],
        "files": {
            "ranking": "ranking.json.gz",
            "battleSummary": "battle-summary.jsonl.gz", "rawTeams": raw_shards,
            "uids": "uids.csv", "teamErrors": "team-errors.jsonl", "pendingQueries": "pending-queries.jsonl.gz",
            "idNames": "id-names.json", "scores": "scores.json", "statistics": "statistics.json",
        },
        "battleFields": BATTLE_FIELDS,
    }, indent=2)
    index = pack_usage(root, records, args.updated_at_iso)
    print("usage index", index["compressedBytes"], len(index["chunks"]))
    print(json.dumps({"records": len(records), "ranked": len(rows), "teamRows": lines,
                      "summaryRows": len(summary), "rawShards": len(raw_shards)}, ensure_ascii=False))


if __name__ == "__main__":
    main()

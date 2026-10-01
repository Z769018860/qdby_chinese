#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Import the Season 70 (activityTid 83315) Top 2000 capture.

Input directory (extracted `season_83315` archive):
    ranking.json, ranking_previous.json, teams_latest.jsonl, uids.csv,
    team_errors.jsonl, pending_queries.jsonl

Outputs:
  * <out>/dzone/season70/   lossless raw archive + battle-level summary
  * <work>/seasons/70.json  site-format season document (packed afterwards by
                            scripts/pack_morimens_local_usage.py)
  * <work>/rank-index/70.json

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

ACTIVITY = 83315
SEASON = 70
# stageGroupId -> wave number (verified against the previous Eremora import)
GROUP_WAVE = {83444: 1, 83441: 2, 83442: 3, 83439: 4, 83440: 5}
SOURCE_TRANSPORT = "Morimens official Rank.QueryRank + Facade.QueryFacadeFields (season_83315 Top2000)"
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


ROMAN = ["I", "II", "III", "IV", "V", "VI"]
# attrId -> (English name, is percentage); main stat has index 1, rolled stats index >= 2
ATTR = {18159: ("Crit. Rate", True), 18151: ("Death Resistance", True), 18105: ("Crit. DMG", True),
        18142: ("DMG Amplification", True), 18139: ("Keyflare Regen Level", False), 18155: ("Sigil Yield", True),
        18126: ("Realm Mastery", False), 22207: ("Aliemus Regen Level", False)}


def build_trinkets(awaker, items, names):
    """Covenant pieces of a borrowed (assist) awakener, in the structure the Assist List reads.
    rollQuality = (valIndex + 1) / 2 for rolled stats, null for the fixed main stat (verified against the old Eremora import)."""
    out = []
    for slot, uid in enumerate(awaker.get("trinkets") or []):
        it = items.get(str(uid))
        if not it:
            continue
        suit = it.get("suitId") or None
        name = (f"{names['covenant'].get(str(suit), '#' + str(suit))} {ROMAN[slot] if slot < 6 else slot + 1}" if suit
                else names.get("trinket", {}).get(str(it.get("tid")), f"#{it.get('tid')}"))
        attrs = []
        for at in sorted(it.get("attrs") or [], key=lambda x: x.get("index", 0)):
            spec = ATTR.get(at["attrId"], (f"#{at['attrId']}", False))
            attrs.append({"id": at["attrId"], "name": spec[0], "value": at["val"], "percentage": spec[1],
                          "rollQuality": None if at.get("index") == 1 else (int(at.get("valIndex", 0)) + 1) // 2})
        out.append({"id": it.get("tid"), "name": name, "image": None, "rarity": "SSR", "slot": slot,
                    "level": it.get("level"), "enhanceLevel": it.get("enhanceLevel"), "breakLevel": it.get("breakLevel"),
                    "attrs": attrs, "suitId": suit, "bound": True})
    return out


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
            **({"trinkets": build_trinkets(a, items, names)} if assist else {}),
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
    out_dir = root / "data/morimens/eremora/usage/70-battle-gzip"
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("chunk-*.b64"):
        old.unlink()
    payload = json.dumps({"seasonId": SEASON, "battles": battles}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    comp = gzip.compress(payload, compresslevel=9, mtime=0)
    chunks = []
    for n, off in enumerate(range(0, len(comp), chunk_size)):
        f = out_dir / f"chunk-{n:03d}.b64"
        f.write_text(base64.b64encode(comp[off:off + chunk_size]).decode("ascii") + "\n", encoding="ascii")
        chunks.append(f"data/morimens/eremora/usage/70-battle-gzip/{f.name}")
    dump_json(out_dir / "index.json", {
        "format": "gzip-base64-chunked-v1", "seasonId": SEASON, "recordCount": 0, "battleCount": len(battles),
        "source": "season_83315 per-battle statistics (death resist, rounds, damage split ...)",
        "revision": hashlib.sha256(comp).hexdigest(), "generatedAt": generated_at,
        "chunks": chunks, "chunkSize": chunk_size, "compressedBytes": len(comp),
    }, indent=2)


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
    ap.add_argument("--src", required=True, help="extracted season_83315 directory")
    ap.add_argument("--ranking", default="ranking.json", help="rank snapshot file inside --src (e.g. ranking_partial.json)")
    ap.add_argument("--teams", action="append", default=[],
                    help="team-row JSONL files (default: <src>/teams_latest.jsonl); later files win; cut-off tail lines are skipped")
    ap.add_argument("--fallback-raw", default="", help="older raw-teams shard dir: rows used only where --teams has none")
    ap.add_argument("--root", default=".", help="repository root")
    ap.add_argument("--work", required=True, help="scratch dir receiving seasons/70.json and rank-index/70.json")
    ap.add_argument("--updated-at", default="2026-10-01 05:00")
    ap.add_argument("--updated-at-iso", default="2026-10-01T05:00:00+08:00")
    ap.add_argument("--shard-lines", type=int, default=1200)
    args = ap.parse_args()

    src, root, work = Path(args.src), Path(args.root), Path(args.work)
    out = root / "data/morimens/dzone/season70"
    names = json.loads((out / "id-names.json").read_text(encoding="utf-8"))
    stages = names["stages"]

    ranking = json.loads((src / args.ranking).read_text(encoding="utf-8"))
    rows, seen_uid, dup_rows = [], set(), []
    for r in ranking["rows"]:  # a snapshot can list one uid on two adjacent ranks; keep the first
        if r["uid"] in seen_uid:
            dup_rows.append({"uid": r["uid"], "rank": r["rank"], "score": r["score"]})
            continue
        seen_uid.add(r["uid"])
        rows.append(r)
    ranking.setdefault("rankRange", [1, 2000])
    ranking.setdefault("stageGroupIds", sorted(GROUP_WAVE))
    ranking.setdefault("source", "official live Rank.QueryRank response")
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

    # ---- gather team rows: older raw shards < --teams files (later wins); skip cut-off lines -------------
    chosen, origin, skipped = {}, Counter(), 0

    def consider(line, tag):
        nonlocal skipped
        try:
            row = json.loads(line)
            row["response"]["team"]["recordStageData"]  # noqa: B018 - a cut-off tail line fails here
        except Exception:
            skipped += 1
            return
        chosen[(row["uid"], row["stageGroupId"])] = (line, row, tag)

    if args.fallback_raw:
        for shard in sorted(Path(args.fallback_raw).glob("teams-*.jsonl.gz")):
            for line in gzip.decompress(shard.read_bytes()).splitlines(keepends=True):
                if line.strip():
                    consider(line, "previous-capture")
    for tf in (args.teams or [str(src / "teams_latest.jsonl")]):
        with open(tf, "rb") as fh:  # binary: keep the original CRLF bytes
            for line in fh:
                if line.strip():
                    consider(line, Path(tf).name)
    rank_pos = {r["uid"]: r["rank"] for r in rows}
    for key in sorted(chosen, key=lambda k: (rank_pos.get(k[0], 10**9), k[0], k[1])):
        line, row, tag = chosen[key]
        origin[tag] += 1
        buf.append(line)
        lines += 1
        if len(buf) >= args.shard_lines:
            flush()
        in_board = row["uid"] in rank_pos
        resp = row["response"]
        wave = GROUP_WAVE[row["stageGroupId"]]
        st = stages[str(resp["stageTid"])]
        main_side, extra_side = resp["team"], resp.get("teamExtra")
        extra_pass = bool(resp.get("extraPass"))
        row = {**row, "rank": rank_pos.get(row["uid"], row.get("rank"))}
        summary.append(summary_row(row, main_side, "clear", names, wave, extra_pass))
        if isinstance(extra_side, dict) and extra_side:
            summary.append(summary_row(row, extra_side, "extra", names, wave, extra_pass))
        if not in_board:  # players that left the Top 2000 stay in the raw archive / summary only
            continue
        teams = []
        t = convert_team(main_side, st["name"], names, "clear")
        t["score"] = resp["score"]
        teams.append(t)
        if isinstance(extra_side, dict) and extra_side and extra_pass:
            teams.append(convert_team(extra_side, st["name"], names, "extra"))
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
            "currentScore": r["score"], "url": f"https://eremora.com/u/{uid}/challenges/dzone/{SEASON}",
            "seasonId": SEASON, "waves": waves, "sourceTransport": SOURCE_TRANSPORT,
        })
    season_doc = {
        "seasonId": SEASON, "period": "2026-09-28 – 2026-10-12", "leaderboardEntryCount": len(rows),
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
    dump_json(work / "seasons/70.json", season_doc)
    dump_json(work / "rank-index/70.json", {
        "source": {"site": "Morimens official", "activityTid": ACTIVITY, "syncedAt": args.updated_at_iso,
                   "retrievedAt": ranking["retrievedAt"]},
        "seasonId": SEASON, "target": len(rows), "complete": len(rows) >= 2000,
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
    write_gz(out / "ranking.json.gz", (src / args.ranking).read_bytes())
    if (src / "ranking_previous.json").exists():
        write_gz(out / "ranking-previous.json.gz", (src / "ranking_previous.json").read_bytes())
    write_gz(out / "pending-queries.jsonl.gz", (src / "pending_queries.jsonl").read_bytes())
    shutil.copyfile(src / "uids.csv", out / "uids.csv")
    shutil.copyfile(src / "team_errors.jsonl", out / "team-errors.jsonl")

    scores = Counter(r["score"] for r in rows)
    dump_json(out / "scores.json", {
        "season": SEASON, "updatedAt": args.updated_at, "totalPlayers": len(rows),
        "scoreDistribution": {str(k): v for k, v in sorted(scores.items(), reverse=True)},
        "source": "season_83315 ranking.json",
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
        "season": SEASON, "activityTid": ACTIVITY, "name": "第70期 新新融灾 · 深海戒指", "date": "9.28-10.11",
        "updatedAt": args.updated_at, "source": "official live Rank.QueryRank response",
        "sourceRetrievedAt": ranking["retrievedAt"], "rankRange": ranking["rankRange"],
        "teamRowsBySource": dict(origin), "skippedTailLines": skipped, "duplicateRankRowsDropped": dup_rows,
        "recordCount": len(rows), "playersWithTeamDetail": len(records), "teamRows": lines,
        "stageGroupIds": ranking["stageGroupIds"],
        "files": {
            "ranking": "ranking.json.gz", "rankingPrevious": "ranking-previous.json.gz",
            "battleSummary": "battle-summary.jsonl.gz", "rawTeams": raw_shards,
            "uids": "uids.csv", "teamErrors": "team-errors.jsonl", "pendingQueries": "pending-queries.jsonl.gz",
            "idNames": "id-names.json", "scores": "scores.json", "statistics": "statistics.json",
        },
        "battleFields": BATTLE_FIELDS,
    }, indent=2)
    print(json.dumps({"records": len(records), "ranked": len(rows), "teamRows": lines,
                      "summaryRows": len(summary), "rawShards": len(raw_shards)}, ensure_ascii=False))


if __name__ == "__main__":
    main()

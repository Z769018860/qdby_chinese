#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Import decoded Facade.QueryFacadeFields responses into the D-Zone dataset.

Expected detail input (one JSON object, JSONL row, or item in a JSON array):
{
  "uid": "100167859",
  "stageGroupId": 83439,
  "response": {
    "score": 110,
    "extraPass": true,
    "team": {...},
    "teamExtra": {...}
  }
}

The response object may also be stored under "data" or "result".  The importer
never talks to the game server.  It only consumes already-decoded responses.

By default the canonical Season dataset is replaced only when every stage row
from the official stage index has a detail response and every expected
team/teamExtra pointer is present with exactly four members.
"""
from __future__ import annotations

import argparse
import base64
import copy
import gzip
import importlib.util
import json
import subprocess
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("raw_base", HERE / "process_morimens_raw1000.py")
base = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(base)

STAGE_TO_WAVE = {83439: 1, 83440: 2, 83441: 3, 83442: 4, 83444: 5}


def load_json(path: Path, default=None):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def save_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def n(value):
    return base.num(value)


def first(obj, *keys, default=None):
    if not isinstance(obj, dict):
        return default
    for key in keys:
        if obj.get(key) is not None:
            return obj[key]
    return default


def load_current_records(root: Path, manifest: dict):
    rel = str((manifest.get("usageIndex") or {}).get("path") or "")
    if not rel:
        return []
    index = load_json(root / rel, {})
    if index.get("format") != "gzip-base64-chunked-v1":
        return list(index.get("records") or [])
    parts = []
    for chunk in index.get("chunks") or []:
        parts.append(base64.b64decode((root / chunk).read_text(encoding="ascii").strip()))
    doc = json.loads(gzip.decompress(b"".join(parts)).decode("utf-8"))
    return list(doc.get("records") or [])


def templates(records):
    out = {k: {} for k in ("char", "wheel", "trinket", "cov", "token", "creation", "stage")}
    old_by_battle = {}
    for rec in records:
        for wave in rec.get("waves") or []:
            for team in wave.get("teams") or []:
                sid = team.get("stageId")
                if sid is not None:
                    out["stage"].setdefault(str(sid), {"name": team.get("stageName"), "madness": wave.get("madness")})
                battle = str(team.get("battleUuid") or team.get("battle_uuid") or "")
                if battle:
                    old_by_battle[battle] = team
                token = team.get("token")
                if isinstance(token, dict) and token.get("id") is not None:
                    out["token"].setdefault(str(token["id"]), token)
                for creation in team.get("creations") or []:
                    if isinstance(creation, dict) and creation.get("id") is not None:
                        out["creation"].setdefault(str(creation["id"]), creation)
                for member in team.get("members") or []:
                    if member.get("id") is not None:
                        out["char"].setdefault(str(member["id"]), member)
                    for item in member.get("wheels") or []:
                        if item.get("id") is not None:
                            out["wheel"].setdefault(str(item["id"]), item)
                    for item in member.get("trinkets") or []:
                        if item.get("id") is not None:
                            out["trinket"].setdefault(str(item["id"]), item)
                    for item in member.get("covenants") or []:
                        if item.get("id") is not None:
                            out["cov"].setdefault(str(item["id"]), item)
    return out, old_by_battle


def stage_rows(stage_doc):
    rows = []
    for player in stage_doc.get("players") or []:
        for stage in player.get("stages") or []:
            rows.append({
                "rank": player.get("rank"),
                "uid": str(player.get("uid") or ""),
                "name": player.get("name") or "",
                "totalScore": n(player.get("totalScore")),
                **stage,
            })
    return rows


def detail_object(row):
    obj = row.get("response") if isinstance(row, dict) else None
    if not isinstance(obj, dict):
        obj = row.get("data") if isinstance(row, dict) else None
    if not isinstance(obj, dict):
        obj = row.get("result") if isinstance(row, dict) else None
    if not isinstance(obj, dict):
        obj = row if isinstance(row, dict) else {}
    for child in (obj, obj.get("result"), obj.get("data"), obj.get("response")):
        if isinstance(child, dict) and ("team" in child or "teamExtra" in child or "team_extra" in child):
            return child
    return obj


def read_detail_rows(path: Path):
    files = [path] if path.is_file() else sorted(p for p in path.rglob("*") if p.suffix.lower() in (".json", ".jsonl"))
    for file in files:
        text = file.read_text(encoding="utf-8", errors="replace").strip()
        if not text:
            continue
        docs = []
        if file.suffix.lower() == ".jsonl":
            for line in text.splitlines():
                try:
                    docs.append(json.loads(line))
                except Exception:
                    pass
        else:
            try:
                doc = json.loads(text)
                docs = doc if isinstance(doc, list) else (doc.get("records") if isinstance(doc, dict) and isinstance(doc.get("records"), list) else [doc])
            except Exception:
                continue
        for row in docs:
            if not isinstance(row, dict):
                continue
            uid = str(first(row, "uid", "playerUid", "player_uid", "targetUid", default="") or "")
            sg = first(row, "stageGroupId", "stage_group_id", "stageGroupTid")
            try:
                sg = int(sg)
            except Exception:
                sg = None
            if uid and sg in STAGE_TO_WAVE:
                yield uid, sg, detail_object(row)


def item_map(detail, team):
    raw = team.get("items") if isinstance(team.get("items"), (dict, list)) else detail.get("items")
    out = {}
    if isinstance(raw, dict):
        for key, value in raw.items():
            if isinstance(value, dict):
                out[str(key)] = value
                if value.get("uid") is not None:
                    out[str(value["uid"])] = value
    elif isinstance(raw, list):
        for value in raw:
            if isinstance(value, dict):
                uid = first(value, "uid", "itemUid", "item_uid")
                if uid is not None:
                    out[str(uid)] = value
    return out


def resolve_item(ref, items):
    if isinstance(ref, dict):
        uid = first(ref, "uid", "itemUid", "item_uid", "weaponUid", "weapon_uid")
        if uid is not None and str(uid) in items:
            merged = dict(items[str(uid)])
            merged.update(ref)
            return merged
        return ref
    return items.get(str(ref), {"uid": ref}) if ref is not None else {}


def tpl(tm, kind, tid, fallback):
    item = copy.deepcopy(tm[kind].get(str(tid), {})) if tid is not None else {}
    if tid is not None:
        item.setdefault("id", tid)
    item.setdefault("name", f"TID {tid}" if tid is not None else fallback)
    item.setdefault("image", "")
    return item


def normalize_member(raw, items, tm):
    awaker = raw.get("awaker") if isinstance(raw.get("awaker"), dict) else {}
    tid = first(raw, "tid", "awakerTid", "awaker_tid", "id", default=first(awaker, "tid", "id"))
    old = copy.deepcopy(tm["char"].get(str(tid), {})) if tid is not None else {}
    name = old.get("name") or old.get("canonicalName") or (f"TID {tid}" if tid is not None else "未知")
    assist = first(raw, "assistPlayerId", "assist_player_id", "assistUid", "assist_uid")
    member = {
        "id": tid,
        "name": name,
        "canonicalName": old.get("canonicalName") or name,
        "skeydbId": old.get("skeydbId"),
        "ingameId": old.get("ingameId"),
        "image": old.get("image") or "",
        "realm": old.get("realm") or "",
        "role": old.get("role") or "",
        "rarity": old.get("rarity") or "",
        "level": n(first(raw, "level", default=awaker.get("level"))),
        "potencyLevel": n(first(raw, "potencyLevel", "potency_level", default=first(awaker, "potencyLevel", "potency_level"))),
        "breakLevel": n(first(raw, "breakLevel", "break_level")),
        "enlightenLevel": first(raw, "enlightenLevel", "enlighten_level"),
        "enlightenCount": first(raw, "enlightenCount", "enlighten_count"),
        "enlightenMilestone": first(raw, "enlightenMilestone", "progression", default="unknown"),
        "progression": first(raw, "progression", "enlightenMilestone", default="unknown"),
        "enlightenment": raw.get("enlightenment") or [],
        "wheels": [],
        "trinkets": [],
        "covenants": [],
        "covenant": None,
        "covenantScore": n(first(raw, "covenantScore", "covenant_score")),
        "borrowed": assist not in (None, "", 0, "0"),
        "assistUid": assist if assist not in (None, "", 0, "0") else None,
        "stats": [],
        "rawTalents": raw.get("talents") or [],
        "rawSlots": raw.get("slots") or [],
    }
    slots = first(raw, "weaponSlots", "weapon_slots", default=[])
    for slot in slots if isinstance(slots, list) else []:
        ref = first(slot, "weaponUid", "weapon_uid", "uid", default=slot) if isinstance(slot, dict) else slot
        item = resolve_item(ref, items)
        item_tid = first(item, "tid", "itemTid", "item_tid", "id")
        wheel = tpl(tm, "wheel", item_tid, "未知命轮")
        for target, keys in (("level", ("level",)), ("enhanceLevel", ("enhanceLevel", "enhance_level")), ("breakLevel", ("breakLevel", "break_level"))):
            value = first(item, *keys)
            if value is not None:
                wheel[target] = n(value)
        member["wheels"].append(wheel)
    suits = Counter()
    for ref in raw.get("trinkets") or []:
        item = resolve_item(ref, items)
        tid2 = first(item, "tid", "itemTid", "item_tid", "id")
        trinket = tpl(tm, "trinket", tid2, "未知密契")
        suit = first(item, "suitId", "suit_id")
        trinket["suitId"] = suit
        trinket["level"] = n(item.get("level"))
        member["trinkets"].append(trinket)
        if suit is not None:
            suits[str(suit)] += 1
    for suit, count in suits.items():
        cov = tpl(tm, "cov", suit, "未知密契套装")
        cov["count"] = count
        member["covenants"].append(cov)
    member["covenant"] = member["covenants"][0] if member["covenants"] else None
    return member


def record_stage_data(team, detail):
    return first(team, "recordStageData", "record_stage_data", default=first(detail, "recordStageData", "record_stage_data", default={})) or {}


def normalize_team(raw, detail, stage, clear_type, tm, old_by_battle):
    items = item_map(detail, raw)
    rsd = record_stage_data(raw, detail)
    battle = first(rsd, "battleUuid", "battle_uuid", default=first(raw, "battleUuid", "battle_uuid"))
    members = [normalize_member(x, items, tm) for x in (raw.get("awakers") or raw.get("members") or []) if isinstance(x, dict)]
    sid = stage.get("stageId")
    stage_meta = tm["stage"].get(str(sid), {})
    keeper = first(raw, "keeperSkill", "keeper_skill")
    keeper_tid = first(keeper, "tid", "id") if isinstance(keeper, dict) else keeper
    token = tpl(tm, "token", keeper_tid, "未知钥令") if keeper_tid is not None else None
    creations = []
    for relic in rsd.get("relics") or []:
        tid = first(relic, "tid", "id") if isinstance(relic, dict) else relic
        if tid is not None:
            creations.append(tpl(tm, "creation", tid, "未知造物"))
    team = {
        "clearType": clear_type,
        "score": n(first(raw, "score", default=detail.get("score") if clear_type == "clear" else None)),
        "extraPass": bool(first(detail, "extraPass", "extra_pass", default=False)),
        "groupTid": stage.get("stageGroupId"),
        "stageId": sid,
        "stageName": stage_meta.get("name") or f"Zone {stage.get('wave')}",
        "token": token,
        "creations": creations,
        "wid": first(raw, "wid", "teamWid", "team_wid"),
        "battleUuid": battle,
        "members": members,
    }
    old = old_by_battle.get(str(battle or ""))
    if old and sum(len(m.get("wheels") or []) + len(m.get("covenants") or []) for m in old.get("members") or []) > sum(len(m.get("wheels") or []) + len(m.get("covenants") or []) for m in members):
        kept = copy.deepcopy(old)
        kept.update({k: team[k] for k in ("clearType", "groupTid", "stageId", "wid", "battleUuid")})
        return kept
    return team


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--season", type=int, default=70)
    ap.add_argument("--details", required=True)
    ap.add_argument("--stage-index", default=None)
    ap.add_argument("--allow-partial", action="store_true")
    ap.add_argument("--keep-unpacked", action="store_true")
    ap.add_argument("--chunk-size", type=int, default=180000)
    args = ap.parse_args()

    root = Path(args.root).resolve()
    data = root / "data/morimens/eremora"
    official = root / "data/morimens/official" / str(args.season)
    stage_path = root / (args.stage_index or f"data/morimens/official/{args.season}/stage-index.json")
    stage_doc = load_json(stage_path, {})
    rows = stage_rows(stage_doc)
    if int(stage_doc.get("seasonId") or -1) != args.season or not rows:
        raise SystemExit(f"invalid stage index: {stage_path}")

    manifest = load_json(data / "manifest.json", {})
    old_records = load_current_records(root, manifest)
    tm, old_by_battle = templates(old_records)
    detail_map = {(uid, sg): detail for uid, sg, detail in read_detail_rows(Path(args.details).resolve())}

    by_uid = {}
    for row in rows:
        by_uid.setdefault(row["uid"], []).append(row)

    records, missing_groups, missing_teams, invalid_teams = [], [], [], []
    team_count = hydrated = 0
    for uid, stages in by_uid.items():
        stages.sort(key=lambda x: int(x.get("wave") or STAGE_TO_WAVE.get(int(x.get("stageGroupId") or 0), 99)))
        waves = []
        for stage in stages:
            sg = int(stage["stageGroupId"])
            detail = detail_map.get((uid, sg))
            teams = []
            if detail is None:
                missing_groups.append({"uid": uid, "stageGroupId": sg})
            else:
                hydrated += 1
                raw_base = detail.get("team")
                raw_extra = detail.get("teamExtra") if isinstance(detail.get("teamExtra"), dict) else detail.get("team_extra")
                expect_base = bool(stage.get("wid") or stage.get("battleUuid"))
                expect_extra = bool(stage.get("widExtra") or stage.get("battleUuidExtra"))
                if isinstance(raw_base, dict):
                    teams.append(normalize_team(raw_base, detail, stage, "clear", tm, old_by_battle))
                elif expect_base:
                    missing_teams.append({"uid": uid, "stageGroupId": sg, "clearType": "clear"})
                if isinstance(raw_extra, dict):
                    teams.append(normalize_team(raw_extra, detail, stage, "extra", tm, old_by_battle))
                elif expect_extra:
                    missing_teams.append({"uid": uid, "stageGroupId": sg, "clearType": "extra"})
                for team in teams:
                    if len(team.get("members") or []) != 4:
                        invalid_teams.append({"uid": uid, "stageGroupId": sg, "clearType": team.get("clearType"), "memberCount": len(team.get("members") or [])})
            team_count += len(teams)
            stage_meta = tm["stage"].get(str(stage.get("stageId")), {})
            waves.append({"wave": int(stage.get("wave") or STAGE_TO_WAVE.get(sg, 0)), "madness": stage_meta.get("madness"), "teams": teams})
        head = stages[0]
        records.append({
            "rank": head.get("rank"),
            "player": head.get("name") or "",
            "uid": uid,
            "score": head.get("totalScore"),
            "currentScore": head.get("totalScore"),
            "leaderboardScore": head.get("totalScore"),
            "url": None,
            "seasonId": args.season,
            "activity": {"tid": stage_doc.get("activityTid"), "name": "Dissoluted Abyss", "stageCount": len(waves)},
            "waves": waves,
            "sourceTransport": "Morimens official Facade.QueryFacadeFields decoded response",
        })
    records.sort(key=lambda x: int(x.get("rank") or 999999))

    complete = len(records) == 1000 and hydrated == len(rows) and not missing_groups and not missing_teams and not invalid_teams
    report = {
        "seasonId": args.season,
        "playerCount": len(records),
        "stageRows": len(rows),
        "detailObjects": len(detail_map),
        "hydratedStageGroups": hydrated,
        "teamCount": team_count,
        "expectedExtraPointers": sum(1 for x in rows if x.get("widExtra") or x.get("battleUuidExtra")),
        "missingStageGroups": missing_groups,
        "missingExpectedTeams": missing_teams,
        "invalidTeams": invalid_teams,
        "complete": complete,
    }
    save_json(official / "detail-import-report.json", report)
    print(json.dumps({k: v for k, v in report.items() if not isinstance(v, list)}, ensure_ascii=False, indent=2))
    if not complete and not args.allow_partial:
        raise SystemExit("detail capture incomplete; canonical dataset not replaced")

    season_doc = {
        "source": {"site": "Morimens official client", "transport": "decoded Rank.QueryRank + Facade.QueryFacadeFields", "activityTid": stage_doc.get("activityTid"), "stageIndexCapturedAt": stage_doc.get("capturedAt")},
        "seasonId": args.season,
        "leaderboardEntryCount": 1000,
        "recordCount": len(records),
        "complete": complete,
        "coverageMode": "official-top1000-full-detail" if complete else "official-top1000-partial-detail",
        "failures": missing_groups + missing_teams + invalid_teams,
        "records": records,
    }
    season_file = data / "seasons" / f"{args.season}.json"
    save_json(season_file, season_doc)
    save_json(data / "stats" / f"{args.season}.json", base.stats(season_doc))
    subprocess.run([sys.executable, str(HERE / "pack_morimens_local_usage.py"), "--root", str(root), "--season", str(args.season), "--chunk-size", str(args.chunk_size)], check=True)

    manifest = load_json(data / "manifest.json", {})
    osi = manifest.get("officialStageIndex") if isinstance(manifest.get("officialStageIndex"), dict) else {}
    osi.update({"detailStatus": "complete" if complete else "partial", "detailReportPath": f"data/morimens/official/{args.season}/detail-import-report.json", "detailRecordCount": len(records), "hydratedStageGroups": hydrated, "detailTeamCount": team_count})
    manifest["officialStageIndex"] = osi
    current = manifest.get("current") if isinstance(manifest.get("current"), dict) else {}
    current.update({"leaderboardEntries": 1000, "records": len(records), "detailRecords": len(records), "detailPending": max(0, 1000 - len(records)), "complete": complete})
    manifest["current"] = current
    for entry in manifest.get("availableSeasons") or []:
        if isinstance(entry, dict) and int(entry.get("seasonId") or -1) == args.season and not entry.get("snapshotId"):
            entry.update({"recordCount": len(records), "leaderboardEntryCount": 1000, "complete": complete, "coverageMode": season_doc["coverageMode"]})
    save_json(data / "manifest.json", manifest)

    if not args.keep_unpacked and season_file.exists():
        season_file.unlink()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Import an author-provided D-Zone Top1000 slim JSON(.gz).

The export already contains hydrated leaderboard/profile objects, so this
adapter converts them directly to the records consumed by morimens-dtide.js,
regenerates statistics/rank indexes, and packs the large season as the same
gzip/base64 dataset used by the browser loader.
"""
from __future__ import annotations

import argparse
import gzip
import importlib.util
import json
import subprocess
import sys
from pathlib import Path


HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("morimens_raw_base", HERE / "process_morimens_raw1000.py")
base = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(base)


def load_export(path: Path) -> dict:
    opener = gzip.open if path.suffix.lower() == ".gz" else open
    with opener(path, "rt", encoding="utf-8") as stream:
        doc = json.load(stream)
    if not isinstance(doc, dict) or not isinstance(doc.get("players"), list):
        raise SystemExit("input is not a D-Zone slim export")
    return doc


def media_path(value):
    if not value:
        return None
    value = str(value)
    return value if value.startswith(("http://", "https://")) else value


def member(row: dict, catalog: dict) -> dict:
    normalized = base.norm_member(row, None, catalog)
    awaker = row.get("awaker") if isinstance(row.get("awaker"), dict) else {}
    normalized["image"] = media_path(awaker.get("mini") or awaker.get("image")) or normalized.get("image")
    for target, source in (("wheels", "weapons"), ("trinkets", "trinkets")):
        source_rows = row.get(source) if isinstance(row.get(source), list) else []
        for item, original in zip(normalized.get(target) or [], source_rows):
            item["image"] = media_path(original.get("image")) or item.get("image")
    for item, original in zip(normalized.get("covenants") or [], row.get("suits") or []):
        item["image"] = media_path(original.get("image")) or item.get("image")
    normalized["covenant"] = (normalized.get("covenants") or [None])[0]
    # The leaderboard never renders equipment attributes, full enlightenment
    # descriptions, combat stats or trinket rows.  Keeping them made a single
    # season expand to hundreds of MB and froze the browser during JSON.parse.
    # Preserve only fields consumed by morimens-dtide.js.
    return {
        "id": normalized.get("id"),
        "name": normalized.get("name"),
        "canonicalName": normalized.get("canonicalName"),
        "skeydbId": normalized.get("skeydbId"),
        "ingameId": normalized.get("ingameId"),
        "image": normalized.get("image"),
        "realm": normalized.get("realm"),
        "role": normalized.get("role"),
        "rarity": normalized.get("rarity"),
        "level": normalized.get("level"),
        "potencyLevel": normalized.get("potencyLevel"),
        "breakLevel": normalized.get("breakLevel"),
        "enlightenLevel": normalized.get("enlightenLevel"),
        "enlightenCount": normalized.get("enlightenCount"),
        "enlightenMilestone": normalized.get("enlightenMilestone"),
        "progression": normalized.get("progression"),
        "wheels": [
            {key: item.get(key) for key in ("id", "name", "image", "rarity", "slot", "level", "enhanceLevel", "breakLevel")}
            for item in normalized.get("wheels") or []
        ],
        "covenants": [
            {key: item.get(key) for key in ("id", "name", "image", "count")}
            for item in normalized.get("covenants") or []
        ],
        "covenantScore": normalized.get("covenantScore"),
        "borrowed": normalized.get("borrowed"),
        "assistUid": normalized.get("assistUid"),
    }


def record(item: dict, season: int, period: str, catalog: dict) -> dict:
    player = item.get("player") if isinstance(item.get("player"), dict) else {}
    challenge = item.get("challenge") if isinstance(item.get("challenge"), dict) else {}
    activity = challenge.get("activity") if isinstance(challenge.get("activity"), dict) else {}
    waves = []
    for index, stage_row in enumerate(challenge.get("stages") or [], 1):
        if not isinstance(stage_row, dict):
            continue
        stage = stage_row.get("stage") if isinstance(stage_row.get("stage"), dict) else {}
        team = stage_row.get("team") if isinstance(stage_row.get("team"), dict) else {}
        result = team.get("result") if isinstance(team.get("result"), dict) else {}
        stage_name = base.fix_text(stage.get("name") or "")
        import re
        match = re.search(r"Wave\s*(\d+)", stage_name, re.I)
        wave_number = int(match.group(1)) if match else index
        token = base.norm_token(team.get("keeper_skill"), None)
        if token:
            token["image"] = media_path((team.get("keeper_skill") or {}).get("image"))
        creations = []
        for creation in result.get("relics") or []:
            normalized = base.norm_creation(creation, None)
            if normalized:
                normalized["image"] = media_path(creation.get("image"))
                creations.append(normalized)
        team_row = {
            "clearType": "extra" if stage_row.get("extra") else "clear",
            "score": base.num(stage_row.get("score")),
            "extraPass": bool(stage_row.get("extra_pass")),
            "groupTid": stage_row.get("group_tid"),
            "stageId": stage.get("id") if stage.get("id") is not None else team.get("stage_tid"),
            "stageName": stage_name,
            "token": token,
            "creations": creations,
            "wid": team.get("wid"),
            "battleUuid": team.get("battle_uuid"),
            "members": [member(x, catalog) for x in team.get("awakers") or [] if isinstance(x, dict)],
        }
        waves.append({
            "wave": wave_number,
            "madness": base.num(stage.get("rec_level")),
            "teams": [team_row],
        })
    uid = str(player.get("uid") or "")
    return {
        "rank": base.num(player.get("rank")),
        "player": base.fix_text(player.get("name") or player.get("raw_name") or ""),
        "uid": uid,
        "score": base.num(player.get("score")),
        "currentScore": base.num(challenge.get("max_score")),
        "leaderboardScore": base.num(player.get("score")),
        "url": f"https://eremora.com/u/{uid}/challenges/dzone/{season}",
        "seasonId": season,
        "period": period,
        "activity": {
            "id": activity.get("id"),
            "tid": challenge.get("activity_tid"),
            "name": base.fix_text(activity.get("name") or "Dissoluted Abyss"),
            "start": base.num(activity.get("start")),
            "end": base.num(activity.get("end")),
            "maxScore": base.num(challenge.get("max_score")),
            "stageCount": base.num(challenge.get("stage_count")) or len(waves),
        },
        "waves": waves,
        "sourceTransport": "author-provided D-Zone Top1000 slim export",
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("--root", default=".")
    parser.add_argument("--chunk-size", type=int, default=700_000)
    args = parser.parse_args()
    root = Path(args.root).resolve()
    source = Path(args.input).resolve()
    data_root = root / "data/morimens/eremora"
    doc = load_export(source)
    season = int(doc.get("period") or 0)
    if not season:
        raise SystemExit("export has no period/season")
    report = doc.get("report") if isinstance(doc.get("report"), dict) else {}
    expected = int(report.get("requested") or 1000)
    if report.get("missing_ranks") or report.get("duplicate_uids"):
        raise SystemExit("source report contains missing ranks or duplicate UIDs")

    catalog_doc = base.load_json(root / "data/morimens/skeydb/awakeners.json", {"records": []})
    catalog = {
        str(x.get("ingameId")).upper(): x
        for x in catalog_doc.get("records", [])
        if isinstance(x, dict) and x.get("ingameId")
    }
    window = doc.get("window") if isinstance(doc.get("window"), dict) else {}
    period = f"{window.get('start', '')} – {window.get('end', '')}"
    records = [record(x, season, period, catalog) for x in doc["players"] if isinstance(x, dict)]
    records.sort(key=lambda x: (x.get("rank") or 999999, -(x.get("score") or 0)))
    unique_uids = {x["uid"] for x in records if x.get("uid")}
    if len(records) != expected or len(unique_uids) != len(records):
        raise SystemExit(f"coverage mismatch: records={len(records)}, unique={len(unique_uids)}, expected={expected}")

    season_doc = {
        "source": {
            "site": "author-provided D-Zone database export",
            "transport": "dzone Top1000 slim JSON",
            "generatedAt": doc.get("generated_at"),
            "activityId": doc.get("season_id"),
        },
        "seasonId": season,
        "period": period,
        "leaderboardEntryCount": expected,
        "recordCount": len(records),
        "complete": True,
        "coverageMode": "author-top1000-complete",
        "failures": [],
        "records": records,
    }
    season_path = data_root / "seasons" / f"{season}.json"
    base.save_json(season_path, season_doc)
    base.save_json(data_root / "stats" / f"{season}.json", base.stats(season_doc))
    base.save_json(data_root / "rank-index" / f"{season}.json", {
        "seasonId": season,
        "count": len(records),
        "rows": [{"rank": x["rank"], "uid": x["uid"], "name": x["player"], "score": x["score"]} for x in records],
    })
    base.save_json(data_root / "top1000" / f"{season}.json", {
        "seasonId": season,
        "rankIndexCount": len(records),
        "parsedUserCount": len(records),
        "failedUserCount": 0,
        "source": source.name,
        "users": [{"uid": x["uid"], "rank": x["rank"], "player": x["player"], "score": x["score"], "seasons": [season]} for x in records],
    })
    manifest_before = base.load_json(data_root / "manifest.json", {})
    current_usage_before = manifest_before.get("usageIndex")
    subprocess.run([
        sys.executable, str(HERE / "pack_morimens_local_usage.py"),
        "--root", str(root), "--season", str(season), "--chunk-size", str(args.chunk_size),
    ], check=True)
    manifest = base.load_json(data_root / "manifest.json", {})
    generated_usage = manifest.get("usageIndex") or {}
    packed_index_path = root / str(generated_usage.get("path") or "")
    packed_index = base.load_json(packed_index_path, {})
    if isinstance(packed_index, dict):
        packed_index["source"] = "author-provided D-Zone Top1000 slim export"
        base.save_json(packed_index_path, packed_index)
    for entry in manifest.get("availableSeasons") or []:
        if isinstance(entry, dict) and int(entry.get("seasonId") or -1) == season:
            entry.update({
                "recordCount": len(records),
                "leaderboardEntryCount": expected,
                "complete": True,
                "coverageMode": "author-top1000-complete",
                "path": generated_usage.get("path"),
                "statsPath": generated_usage.get("statsPath"),
                "revision": generated_usage.get("revision"),
            })
    if int(manifest.get("currentSeason") or -1) != season and isinstance(current_usage_before, dict):
        manifest["usageIndex"] = current_usage_before
    manifest["pendingBackfillSeasonIds"] = [
        value for value in manifest.get("pendingBackfillSeasonIds") or []
        if int(value) != season
    ]
    for coverage in (manifest.get("analytics") or {}).get("coverage") or []:
        if isinstance(coverage, dict) and int(coverage.get("seasonId") or -1) == season:
            coverage["maxRankAvailable"] = expected
            coverage["difficulty"] = {
                "recognizedTeams": sum(len(w.get("teams") or []) for r in records for w in r.get("waves") or []),
                "totalTeams": sum(len(w.get("teams") or []) for r in records for w in r.get("waves") or []),
                "complete": True,
            }
            coverage["rankScopes"] = {str(limit): expected >= limit for limit in (50, 200, 500, 1000)}
    base.save_json(data_root / "manifest.json", manifest)
    # The packed browser dataset is canonical; avoid committing an oversized
    # uncompressed intermediate that exceeds GitHub's single-file limit.
    season_path.unlink()
    print(json.dumps({"season": season, "records": len(records), "complete": True}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

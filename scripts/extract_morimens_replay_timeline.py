#!/usr/bin/env python3
"""Extract Morimens replay source IDs and round timelines from saved Eremora SvelteKit __data.json.

The Eremora payload is SvelteKit/devalue-style NDJSON: integer values inside each
`type=chunk` data array are references into the same array. This script hydrates
those references and keeps only battle objects that contain `battle_uuid` and
`timeline`.

Examples:
  python scripts/extract_morimens_replay_timeline.py saved/__data.json --out-dir out/replay
  python scripts/extract_morimens_replay_timeline.py dumps/*.json --out-dir data/morimens/replay --write-battles

Outputs:
  source-map.json               observed source.id -> name/kind/actors
  <battleUuid>.json             optional normalized per-round timeline fixtures

Important: timeline is aggregated by round -> actor -> source. It does not expose
an intra-round event sequence, so this script intentionally does not invent card
play order.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

sys.setrecursionlimit(200_000)


def hydrate_chunk(data: list[Any], index: int, memo: dict[int, Any], active: set[int]) -> Any:
    if index < 0:
        return None
    if index >= len(data):
        return index
    if index in memo:
        return memo[index]
    if index in active:
        return None
    active.add(index)
    value = data[index]
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        memo[index] = out
        for key, item in value.items():
            out[key] = hydrate_value(data, item, memo, active)
    elif isinstance(value, list):
        out = []
        memo[index] = out
        out.extend(hydrate_value(data, item, memo, active) for item in value)
    else:
        out = value
        memo[index] = out
    active.discard(index)
    return out


def hydrate_value(data: list[Any], value: Any, memo: dict[int, Any], active: set[int]) -> Any:
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return hydrate_chunk(data, value, memo, active)
    if isinstance(value, list):
        return [hydrate_value(data, item, memo, active) for item in value]
    if isinstance(value, dict):
        return {key: hydrate_value(data, item, memo, active) for key, item in value.items()}
    return value


def battle_objects(path: Path):
    text = path.read_text("utf-8", errors="replace")
    seen: set[str] = set()
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            packet = json.loads(line)
        except json.JSONDecodeError:
            continue
        data = packet.get("data") if isinstance(packet, dict) and packet.get("type") == "chunk" else None
        if not isinstance(data, list):
            continue
        memo: dict[int, Any] = {}
        active: set[int] = set()
        for index, raw in enumerate(data):
            if not (isinstance(raw, dict) and "battle_uuid" in raw and "timeline" in raw):
                continue
            try:
                battle = hydrate_chunk(data, index, memo, active)
            except Exception:
                continue
            if not isinstance(battle, dict) or not isinstance(battle.get("timeline"), dict):
                continue
            uuid = str(battle.get("battle_uuid") or "")
            if not uuid or uuid in seen:
                continue
            seen.add(uuid)
            yield battle


def normalized_battle(battle: dict[str, Any]) -> dict[str, Any]:
    timeline = battle.get("timeline") or {}
    members = []
    for member in battle.get("members") or battle.get("awakers") or []:
        if not isinstance(member, dict):
            continue
        members.append({key: member.get(key) for key in ("id", "name", "image") if member.get(key) is not None})

    sources: dict[str, Any] = {}
    for sid, meta in (timeline.get("sources") or {}).items():
        if not isinstance(meta, dict):
            continue
        sources[str(sid)] = {
            key: meta.get(key)
            for key in ("id", "name", "kind", "image", "hidden", "credit")
            if meta.get(key) not in (None, False, "")
        }

    battles = []
    for segment in timeline.get("battles") or []:
        if not isinstance(segment, dict):
            continue
        rounds = []
        for rnd in segment.get("rounds") or []:
            if not isinstance(rnd, dict):
                continue
            actors = []
            for actor in rnd.get("actors") or []:
                if not isinstance(actor, dict):
                    continue
                event_sources = []
                for src in actor.get("sources") or []:
                    if not isinstance(src, dict):
                        continue
                    event_sources.append({
                        key: src.get(key)
                        for key in ("id", "kind", "damage", "heal", "block")
                        if src.get(key) not in (None, 0, "")
                    })
                actors.append({
                    "id": actor.get("id"),
                    "damage": actor.get("damage") or 0,
                    "heal": actor.get("heal") or 0,
                    "block": actor.get("block") or 0,
                    "sources": event_sources,
                })
            rounds.append({
                "round": rnd.get("round"),
                "damage": rnd.get("damage") or 0,
                "heal": rnd.get("heal") or 0,
                "block": rnd.get("block") or 0,
                "actors": actors,
            })
        battles.append({
            **{key: segment.get(key) for key in ("index", "kind", "cleared", "damage", "heal", "block") if segment.get(key) is not None},
            "rounds": rounds,
        })

    stage = battle.get("stage") if isinstance(battle.get("stage"), dict) else {}
    return {
        "schemaVersion": 1,
        "battleUuid": battle.get("battle_uuid"),
        "stage": {key: stage.get(key) for key in ("id", "name", "image") if stage.get(key) is not None},
        "members": members,
        "timeline": {"sources": sources, "battles": battles, "totals": timeline.get("totals") or {}},
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("inputs", nargs="+", type=Path)
    parser.add_argument("--out-dir", type=Path, default=Path("data/morimens/replay"))
    parser.add_argument("--write-battles", action="store_true", help="also write <battleUuid>.json fixtures")
    args = parser.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    source_agg: dict[str, dict[str, Any]] = {}
    battle_count = 0

    for path in args.inputs:
        for raw in battle_objects(path):
            battle_count += 1
            battle = normalized_battle(raw)
            members = {str(item.get("id")): item.get("name") for item in battle.get("members") or []}
            timeline = battle.get("timeline") or {}
            usage: dict[str, set[str]] = defaultdict(set)
            for segment in timeline.get("battles") or []:
                for rnd in segment.get("rounds") or []:
                    for actor in rnd.get("actors") or []:
                        actor_id = str(actor.get("id"))
                        actor_name = members.get(actor_id, actor_id)
                        for src in actor.get("sources") or []:
                            usage[str(src.get("id"))].add(actor_name)
            for sid, meta in (timeline.get("sources") or {}).items():
                row = source_agg.setdefault(str(sid), {"id": meta.get("id"), "name": meta.get("name"), "kind": meta.get("kind"), "actors": set()})
                row["actors"].update(usage.get(str(sid), set()))
            if args.write_battles:
                uuid = str(battle.get("battleUuid") or "unknown")
                (args.out_dir / f"{uuid}.json").write_text(json.dumps(battle, ensure_ascii=False, separators=(",", ":")), "utf-8")

    rows = []
    for row in source_agg.values():
        rows.append({"id": row["id"], "name": row["name"], "kind": row["kind"], "actors": sorted(row["actors"])})
    rows.sort(key=lambda r: (str(r.get("kind") or ""), str(r.get("name") or ""), int(r.get("id") or 0)))
    source_map = {"schemaVersion": 1, "sampleBattles": battle_count, "count": len(rows), "sources": rows}
    (args.out_dir / "source-map.json").write_text(json.dumps(source_map, ensure_ascii=False, separators=(",", ":")), "utf-8")
    print(f"battles={battle_count} source_ids={len(rows)} out={args.out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

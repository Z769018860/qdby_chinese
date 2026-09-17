#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pack a structured MoriMens season into cache-safe gzip/base64 chunks.

The packer writes the chunk index and manifest from the same payload in one
operation, so chunk count/size/revision cannot drift from the files served by
GitHub Pages.
"""
from __future__ import annotations

import argparse
import base64
import gzip
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def save_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--season", type=int, required=True)
    ap.add_argument("--chunk-size", type=int, default=700_000)
    ap.add_argument("--data-root", default="data/morimens/eremora")
    args = ap.parse_args()

    if args.chunk_size < 64_000:
        raise SystemExit("chunk size is too small")

    root = Path(args.root).resolve()
    data = root / args.data_root
    season_file = data / "seasons" / f"{args.season}.json"
    manifest_file = data / "manifest.json"

    season_doc = load_json(season_file, None)
    if not isinstance(season_doc, dict):
        raise SystemExit(f"missing structured season: {season_file}")
    records = season_doc.get("records")
    if not isinstance(records, list):
        raise SystemExit(f"season has no records array: {season_file}")

    payload = json.dumps(
        {"seasonId": args.season, "records": records},
        ensure_ascii=False,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")
    compressed = gzip.compress(payload, compresslevel=9, mtime=0)
    revision = hashlib.sha256(compressed).hexdigest()

    out_dir = data / "usage" / f"{args.season}-local-gzip"
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("chunk-*.b64"):
        old.unlink()

    chunks = []
    for number, offset in enumerate(range(0, len(compressed), args.chunk_size)):
        part = compressed[offset : offset + args.chunk_size]
        name = f"chunk-{number:03d}.b64"
        target = out_dir / name
        target.write_text(base64.b64encode(part).decode("ascii") + "\n", encoding="ascii")
        chunks.append(
            str(target.relative_to(root)).replace("\\", "/")
        )

    generated_at = now_iso()
    index = {
        "format": "gzip-base64-chunked-v1",
        "seasonId": args.season,
        "recordCount": len(records),
        "source": "local detailed __data.json import",
        "revision": revision,
        "generatedAt": generated_at,
        "chunks": chunks,
        "chunkSize": args.chunk_size,
        "compressedBytes": len(compressed),
    }
    index_file = out_dir / "index.json"
    save_json(index_file, index)

    manifest = load_json(manifest_file, {})
    rank_index = manifest.get("rankIndex") if isinstance(manifest.get("rankIndex"), dict) else {}
    existing_usage = manifest.get("usageIndex") if isinstance(manifest.get("usageIndex"), dict) else {}
    rank_count = int(
        rank_index.get("count")
        or existing_usage.get("rankIndexCount")
        or len(records)
    )
    target = int(existing_usage.get("target") or max(rank_count, len(records)))
    covered = len(records)
    coverage_pct = round((covered / target * 100), 2) if target else 0

    usage_index = {
        "seasonId": args.season,
        "path": str(index_file.relative_to(root)).replace("\\", "/"),
        "statsPath": f"{args.data_root}/stats/{args.season}.json",
        "target": target,
        "rankIndexCount": rank_count,
        "recordCount": covered,
        "coverage": {
            "expected": target,
            "covered": covered,
            "coveragePct": coverage_pct,
            "complete": covered >= target,
        },
        "syncedAt": generated_at,
        "revision": revision,
        "format": index["format"],
        "chunks": len(chunks),
        "chunkSize": args.chunk_size,
        "chunkBytes": len(compressed),
    }
    manifest["usageIndex"] = usage_index

    if int(manifest.get("currentSeason") or -1) == args.season:
        current = manifest.get("current") if isinstance(manifest.get("current"), dict) else {}
        current["leaderboardEntries"] = rank_count
        current["records"] = covered
        current["complete"] = covered >= target
        manifest["current"] = current

    for entry in manifest.get("availableSeasons") or []:
        if isinstance(entry, dict) and int(entry.get("seasonId") or -1) == args.season:
            entry["recordCount"] = covered

    save_json(manifest_file, manifest)

    print(
        json.dumps(
            {
                "seasonId": args.season,
                "recordCount": covered,
                "chunks": len(chunks),
                "chunkSize": args.chunk_size,
                "compressedBytes": len(compressed),
                "revision": revision,
                "index": str(index_file.relative_to(root)).replace("\\", "/"),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

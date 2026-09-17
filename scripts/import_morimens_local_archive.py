#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Import a locally downloaded Eremora Top1000 ZIP into qdby_chinese.

The ZIP is expected to contain Eremora SvelteKit ``__data.json`` files under
paths similar to ``.../u/<uid>/challenges/dzone/<season>/__data.json``.

This script deliberately replaces the repository raw directory for the target
season, then invokes ``process_morimens_raw1000_v2.py`` to rebuild the
structured season/user/stat files while retaining historical seasons contained
inside each profile payload.

Example:
    python scripts/import_morimens_local_archive.py D:/morimens-top1000.zip \
        --root . --season 69
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

UID_RE = re.compile(r"(?:^|/)u/(\d+)/challenges/dzone/(\d+)/__data\.json$", re.I)
FALLBACK_UID_RE = re.compile(r"(?:^|/)(\d{6,})/(?:__data\.json|_data\.json)$", re.I)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def detect_uid(name: str, season: int) -> str | None:
    normalized = name.replace("\\", "/")
    m = UID_RE.search(normalized)
    if m and int(m.group(2)) == season:
        return m.group(1)
    m = FALLBACK_UID_RE.search(normalized)
    return m.group(1) if m else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("archive", help="ZIP containing the downloaded __data.json files")
    ap.add_argument("--root", default=".", help="qdby_chinese checkout root")
    ap.add_argument("--season", type=int, default=69)
    ap.add_argument("--keep-existing-raw", action="store_true",
                    help="do not clear the old raw directory before import")
    args = ap.parse_args()

    archive = Path(args.archive).expanduser().resolve()
    root = Path(args.root).expanduser().resolve()
    if not archive.is_file():
        raise SystemExit(f"archive not found: {archive}")
    if not (root / "scripts/process_morimens_raw1000_v2.py").is_file():
        raise SystemExit(f"not a qdby_chinese checkout: {root}")

    raw_dir = root / f"data/morimens/eremora/raw/{args.season}"
    if raw_dir.exists() and not args.keep_existing_raw:
        shutil.rmtree(raw_dir)
    raw_dir.mkdir(parents=True, exist_ok=True)

    imported = 0
    skipped = []
    duplicates = []
    seen: set[str] = set()

    with zipfile.ZipFile(archive, "r") as zf:
        members = [x for x in zf.infolist() if not x.is_dir()]
        for info in members:
            if not info.filename.lower().endswith(("__data.json", "_data.json")):
                continue
            uid = detect_uid(info.filename, args.season)
            if not uid:
                skipped.append(info.filename)
                continue
            if uid in seen:
                duplicates.append(uid)
            seen.add(uid)
            # Use .txt because the existing normalizer treats the payload as a
            # SvelteKit JSON-lines stream, not as one ordinary JSON document.
            target = raw_dir / f"{uid}.txt"
            target.write_bytes(zf.read(info))
            imported += 1

    report_path = root / f"data/morimens/eremora/raw-import-local-{args.season}.json"
    report = {
        "archive": archive.name,
        "archiveSha256": sha256(archive),
        "season": args.season,
        "zipEntries": len(members),
        "importedRawFiles": imported,
        "uniqueUids": len(seen),
        "duplicateUids": sorted(set(duplicates)),
        "unrecognizedEntries": skipped[:200],
        "rawPath": str(raw_dir.relative_to(root)).replace("\\", "/"),
    }
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))

    if imported == 0:
        raise SystemExit("no Eremora __data.json files were recognized")

    cmd = [
        sys.executable,
        str(root / "scripts/process_morimens_raw1000_v2.py"),
        "--root", str(root),
        "--season", str(args.season),
        "--raw-dir", str(raw_dir.relative_to(root)),
    ]
    print("[RUN]", " ".join(cmd))
    return subprocess.call(cmd, cwd=root)


if __name__ == "__main__":
    raise SystemExit(main())

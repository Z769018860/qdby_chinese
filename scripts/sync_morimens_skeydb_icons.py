#!/usr/bin/env python3
"""Vendor SKeyDB status icons used by the Morimens calculator."""

from __future__ import annotations

import argparse
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSET_INDEX = ROOT / "data/morimens/skeydb/public-v3/indexes/assets.json"
CALCULATOR = ROOT / "morimens-calculator-skeydb.js"
TARGET = ROOT / "assets/morimens/skeydb-icons"
SOURCE_COMMIT = "d4c5a90f24a7e95745a92b8d1098aff77d6f1510"
REMOTE_BASE = f"https://raw.githubusercontent.com/dansa/SKeyDB/{SOURCE_COMMIT}/src/assets/icons"
ICON_RE = re.compile(r"IconS_Buff_\d{3}")


def referenced_icons() -> list[str]:
    texts = [
        ASSET_INDEX.read_text(encoding="utf-8"),
        CALCULATOR.read_text(encoding="utf-8"),
    ]
    return sorted({match + ".webp" for text in texts for match in ICON_RE.findall(text)})


def valid_webp(data: bytes) -> bool:
    return len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"


def download(name: str) -> bytes:
    request = urllib.request.Request(
        f"{REMOTE_BASE}/{name}",
        headers={"User-Agent": "qdby-chinese-morimens-icon-sync/1.0"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    icons = referenced_icons()
    if not icons:
        raise SystemExit("No IconS_Buff references found")

    TARGET.mkdir(parents=True, exist_ok=True)
    failures: list[str] = []

    for name in icons:
        path = TARGET / name
        if args.check:
            if not path.exists() or not valid_webp(path.read_bytes()):
                failures.append(name)
            continue
        data = download(name)
        if not valid_webp(data):
            failures.append(name)
            continue
        if not path.exists() or path.read_bytes() != data:
            path.write_bytes(data)

    if failures:
        raise SystemExit("Invalid or missing icons: " + ", ".join(failures))

    if not args.check:
        expected = set(icons)
        for stale in TARGET.glob("IconS_Buff_*.webp"):
            if stale.name not in expected:
                stale.unlink()
        manifest = {
            "source": "dansa/SKeyDB",
            "sourceCommit": SOURCE_COMMIT,
            "sourcePath": "src/assets/icons",
            "count": len(icons),
            "files": icons,
        }
        (TARGET / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    print(f"SKeyDB local icon set: {len(icons)} files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

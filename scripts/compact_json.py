#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Shrink the season-71 site-facing JSON files without dropping any fact.

* rank-index: rows are rewritten without the pretty printer and without the
  fields that are pure duplicates (`url` is `prefix + uid + suffix`, `rawName`
  is `name`, `level` is 0).  The reader only uses rank/uid/name/score, and the
  `url` fallback inside morimens-dtide.js rebuilds the very same string.
* stats / manifest: rewritten without the pretty printer.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path


def write(path: Path, obj):
    old = path.stat().st_size
    text = json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n"
    path.write_text(text, encoding="utf-8")
    new = path.stat().st_size
    print(f"  {path.name:<18} {old:>10,} -> {new:>10,}  (-{100 - new * 100 // old}%)")
    return old, new


def compact_rank_index(path: Path):
    doc = json.loads(path.read_text(encoding="utf-8"))
    rows = doc.get("rows") or []
    urls, pads = [], set()
    for r in rows:
        url, uid = r.get("url"), str(r.get("uid") or "")
        urls.append(url)
        if isinstance(url, str) and uid:
            pos = url.find(uid)
            if pos >= 0:
                pads.add((url[:pos], url[pos + len(uid):]))
    uniform_pad = pads.pop() if len(pads) == 1 else None
    out_rows = []
    for r, url in zip(rows, urls):
        row = {"rank": r.get("rank"), "uid": r.get("uid"), "name": r.get("name")}
        if r.get("rawName") != r.get("name"):
            row["rawName"] = r.get("rawName")
        if r.get("level"):
            row["level"] = r.get("level")
        row["score"] = r.get("score")
        if not uniform_pad:
            row["url"] = url
        out_rows.append(row)
    doc["rows"] = out_rows
    if uniform_pad:
        doc["urlPad"] = list(uniform_pad)
        print(f"  url template: {uniform_pad[0]}<uid>{uniform_pad[1]}")
    return write(path, doc)


def compact_generic(path: Path):
    return write(path, json.loads(path.read_text(encoding="utf-8")))


if __name__ == "__main__":
    # usage: compact_json.py <data-root> <season> [season ...]
    root = Path(sys.argv[1] if len(sys.argv) > 1 else "data/morimens/eremora")
    seasons = sys.argv[2:] or ["71"]
    total_old = total_new = 0
    for season in seasons:
        print("rank-index", season)
        o, n = compact_rank_index(root / "rank-index" / f"{season}.json")
        total_old += o
        total_new += n
        stats = root / "stats" / f"{season}.json"
        if stats.exists():
            print("stats", season)
            # manifest.json stays pretty-printed on purpose: it is hand-reviewed and tiny
            o, n = compact_generic(stats)
            total_old += o
            total_new += n
    print(f"total {total_old:,} -> {total_new:,} bytes")

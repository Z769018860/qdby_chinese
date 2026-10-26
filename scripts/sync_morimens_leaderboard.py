#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""One-shot updater for the D-Zone leaderboard of a season from an uploaded capture archive.

    python3 scripts/sync_morimens_leaderboard.py --season 71 \
        --parts /path/xxx.z01 /path/xxx.z02 /path/xxx.zip --updated-at "2026-10-26 16:47" [--final]

What it does (see docs/morimens-leaderboard-sync-workbuddy.md for the long version):
  1. joins the split zip (.z01 .z02 ... .zip), inflates `ranking.json` + `teams_latest.jsonl` and checks the CRC32
  2. checks that every awakener / wheel / creation / token / covenant / stage id of the capture is named in
     data/morimens/dzone/season<N>/id-names.json (stops and lists the gaps unless --allow-missing)
  3. keeps the current rank snapshot as ranking-<yyyymmdd-hhmm>.json.gz and the current raw-teams as fallback rows
  4. runs scripts/import_morimens_season<N>_top2000.py, scripts/postprocess_morimens_eremora.mjs,
     scripts/pack_morimens_usage_v2.py and scripts/compact_json.py
  5. finalises data/morimens/eremora/manifest.json (CRLF line endings are kept) and bumps assetVersion
It never commits or pushes - do that afterwards (preview first, main only when asked).
"""
from __future__ import annotations

import argparse
import datetime as dt
import gzip
import json
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TZ = dt.timezone(dt.timedelta(hours=8))


def log(msg):
    print(f"[sync] {msg}", flush=True)


# ---------------------------------------------------------------- 1. split zip --------------------------------------
def extract_split_zip(parts, out: Path):
    """The archive is a split zip: .z01 .z02 ... then the final .zip that holds the central directory.
    Entries can start in one part and end in another, so the parts are simply concatenated and each entry is
    located with (disk number -> base offset) + local header offset. Python's zipfile cannot do this."""
    parts = sorted((Path(p) for p in parts), key=lambda p: (p.suffix.lower() == ".zip", p.suffix.lower()))
    data = [p.read_bytes() for p in parts]
    if parts[-1].suffix.lower() != ".zip":
        raise SystemExit("the last part must be the .zip file")
    base = [0]
    for d in data:
        base.append(base[-1] + len(d))
    allb, zp = b"".join(data), data[-1]
    eocd = zp.rfind(b"PK\x05\x06")
    cdoff = struct.unpack("<I", zp[eocd + 16:eocd + 20])[0]
    out.mkdir(parents=True, exist_ok=True)
    p, names = cdoff, []
    while zp[p:p + 4] == b"PK\x01\x02":
        (_v, _vn, _fl, meth, _t, _dt, crc, cs, _us, nl, el, cl, dsk, _ia, _ea, lo) = struct.unpack("<HHHHHHIIIHHHHHII", zp[p + 4:p + 46])
        name = zp[p + 46:p + 46 + nl].decode()
        p += 46 + nl + el + cl
        blob = allb[base[dsk] + lo:]
        nl2, el2 = struct.unpack("<HH", blob[26:30])
        raw = blob[30 + nl2 + el2:30 + nl2 + el2 + cs]
        content = zlib.decompress(raw, -15) if meth == 8 else raw
        if zlib.crc32(content) != crc:
            raise SystemExit(f"CRC mismatch in {name}: the upload is damaged or incomplete")
        (out / name).write_bytes(content)
        names.append(name)
        log(f"extracted {name} ({len(content):,} bytes, CRC ok)")
    return names


# ---------------------------------------------------------------- 2. id names ----------------------------------------
def missing_names(teams: Path, names: dict):
    miss = {k: set() for k in ("stage", "awakers", "wheel", "covenant", "creation", "token")}
    with open(teams, "rb") as fh:
        for line in fh:
            try:
                r = json.loads(line)
                rs = r["response"]
            except Exception:
                continue  # cut-off tail line
            if str(rs["stageTid"]) not in names["stages"]:
                miss["stage"].add(rs["stageTid"])
            sides = [rs["team"]] + ([rs["teamExtra"]] if isinstance(rs.get("teamExtra"), dict) and rs["teamExtra"] else [])
            for side in sides:
                items = side.get("items") or {}
                for a in side["awakers"]:
                    if str(a["tid"]) not in names["awakers"]:
                        miss["awakers"].add(a["tid"])
                    slots = a.get("weaponSlots") or []
                    slots = list(slots.values()) if isinstance(slots, dict) else slots
                    for s in slots:
                        it = items.get(str(s.get("weaponUid")))
                        if it and str(it["tid"]) not in names["wheel"]:
                            miss["wheel"].add(it["tid"])
                    for u in a.get("trinkets") or []:
                        it = items.get(str(u))
                        if it and it.get("suitId") and str(it["suitId"]) not in names["covenant"]:
                            miss["covenant"].add(it["suitId"])
                for rr in side["recordStageData"].get("relics") or []:
                    if str(rr["tid"]) not in names["creation"]:
                        miss["creation"].add(rr["tid"])
                t = side.get("keeperSkill")
                if t and str(t) not in names["token"]:
                    miss["token"].add(t)
    return {k: sorted(v) for k, v in miss.items() if v}


# ---------------------------------------------------------------- helpers --------------------------------------------
def run(cmd, cwd=ROOT):
    log("$ " + " ".join(str(c) for c in cmd))
    r = subprocess.run([str(c) for c in cmd], cwd=cwd, text=True, capture_output=True)
    if r.stdout.strip():
        print(r.stdout.rstrip()[-1500:])
    if r.returncode:
        print(r.stderr[-2500:])
        raise SystemExit(f"command failed ({r.returncode})")
    return r.stdout


def write_crlf_json(path: Path, obj):
    text = json.dumps(obj, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    path.write_bytes(text.replace("\n", "\r\n").encode("utf-8"))  # manifest.json is stored with CRLF


def write_json(path: Path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def bump_asset_version():
    today = dt.datetime.now(TZ).strftime("%Y%m%d")
    js = ROOT / "morimens-tools.js"
    m = re.search(r'assetVersion="(\d{8})\.(\d+)"', js.read_text(encoding="utf-8"))
    old = m.group(0)
    new_ver = f"{today}.{int(m.group(2)) + 1 if m.group(1) == today else 1}"
    for f in (js, ROOT / "morimens-tools.html"):
        t = f.read_text(encoding="utf-8")
        t = re.sub(r"\d{8}\.\d+", new_ver, t) if f.suffix == ".html" else t.replace(old, f'assetVersion="{new_ver}"')
        f.write_text(t, encoding="utf-8")
    log(f"assetVersion -> {new_ver}")


def add_changelog(zh, en):
    f = ROOT / "morimens-dtide.js"
    t = f.read_text(encoding="utf-8")
    i = t.index('<div class="sourceItem"><strong>20')
    day = dt.datetime.now(TZ).strftime("%Y-%m-%d")
    if "'" in zh or "'" in en:
        raise SystemExit("the changelog texts are inside single-quoted JS strings: do not use apostrophes (use other wording)")
    entry = f"<div class=\"sourceItem\"><strong>{day}</strong><br>${{ui('{zh}','{en}')}}</div>\n        "
    f.write_text(t[:i] + entry + t[i:], encoding="utf-8")
    log("changelog entry added")


# ---------------------------------------------------------------- main -----------------------------------------------
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--season", type=int, required=True)
    ap.add_argument("--parts", nargs="+", required=True, help="the .z01 .z02 ... and the final .zip of the upload")
    ap.add_argument("--updated-at", help='"YYYY-MM-DD HH:MM" (UTC+8); default: the retrievedAt of ranking.json')
    ap.add_argument("--final", action="store_true", help="the season is over: mark the board as the settled final one")
    ap.add_argument("--no-fallback", action="store_true", help="do not keep rows of the previous capture the new one lacks")
    ap.add_argument("--allow-missing", action="store_true", help="go on although some ids have no name (shown as #id)")
    ap.add_argument("--no-version-bump", action="store_true")
    ap.add_argument("--changelog", nargs=2, metavar=("ZH", "EN"), help="add an update-log entry (no apostrophes!)")
    ap.add_argument("--importer", help="default scripts/import_morimens_season<N>_top2000.py")
    a = ap.parse_args()
    n = a.season
    data = ROOT / "data/morimens"
    sdir = data / f"dzone/season{n}"
    importer = Path(a.importer) if a.importer else ROOT / f"scripts/import_morimens_season{n}_top2000.py"
    if not importer.exists() or not (sdir / "id-names.json").exists():
        raise SystemExit(f"season {n} has no importer / id-names.json yet - see 'A new season' in docs/morimens-leaderboard-sync-workbuddy.md")

    tmp = Path(tempfile.mkdtemp(prefix=f"mmsync{n}_"))
    src = tmp / "src"
    extract_split_zip(a.parts, src)
    if not (src / "ranking.json").exists() or not (src / "teams_latest.jsonl").exists():
        raise SystemExit("the archive must contain ranking.json and teams_latest.jsonl")
    ranking = json.loads((src / "ranking.json").read_text(encoding="utf-8"))
    got = dt.datetime.fromisoformat(ranking["retrievedAt"]).astimezone(TZ)
    updated = a.updated_at or got.strftime("%Y-%m-%d %H:%M")
    iso = dt.datetime.strptime(updated, "%Y-%m-%d %H:%M").replace(tzinfo=TZ).isoformat(timespec="seconds")
    top = ranking.get("rankRange", [1, 2000])[1]
    log(f"capture: activity {ranking.get('activityTid')}, ranks 1-{top}, retrieved {ranking['retrievedAt']}")

    names = json.loads((sdir / "id-names.json").read_text(encoding="utf-8"))
    miss = missing_names(src / "teams_latest.jsonl", names)
    if miss:
        log(f"ids without a name: {miss}")
        if not a.allow_missing:
            raise SystemExit("name them in id-names.json first (or pass --allow-missing)")

    # keep the current snapshot / fallback rows before the importer overwrites them
    cur = sdir / "ranking.json.gz"
    if cur.exists():
        old = json.loads(gzip.decompress(cur.read_bytes()))
        og = dt.datetime.fromisoformat(old["retrievedAt"]).astimezone(TZ)
        suffix = "-top1000" if old.get("rankRange", [1, 2000])[1] < 2000 else ""
        keep = sdir / f"ranking-{og:%Y%m%d-%H%M}{suffix}.json.gz"
        if not keep.exists() and old["retrievedAt"] != ranking["retrievedAt"]:
            shutil.copyfile(cur, keep)
            log(f"previous rank snapshot kept as {keep.name}")
    fb = []
    if not a.no_fallback and (sdir / "raw-teams").exists():
        shutil.copytree(sdir / "raw-teams", tmp / "oldraw")
        fb = ["--fallback-raw", tmp / "oldraw"]

    work = tmp / "work"
    work.mkdir()
    run([sys.executable, importer, "--src", src, "--ranking", "ranking.json", "--teams", src / "teams_latest.jsonl", *fb,
         "--root", ROOT, "--work", work, "--updated-at", updated, "--updated-at-iso", iso])

    # postprocess (adds difficulty / enlightenment fields) in a scratch tree, then the v2 packer
    scratch = tmp / "scratch"
    (scratch / "data/morimens/eremora/seasons").mkdir(parents=True)
    shutil.copyfile(work / f"seasons/{n}.json", scratch / f"data/morimens/eremora/seasons/{n}.json")
    shutil.copyfile(data / "eremora/manifest.json", scratch / "data/morimens/eremora/manifest.json")
    run(["node", ROOT / "scripts/postprocess_morimens_eremora.mjs"], cwd=scratch)
    shutil.copyfile(scratch / f"data/morimens/eremora/stats/{n}.json", data / f"eremora/stats/{n}.json")
    shutil.copyfile(work / f"rank-index/{n}.json", data / f"eremora/rank-index/{n}.json")
    season_file = data / f"eremora/seasons/{n}.json"
    shutil.copyfile(scratch / f"data/morimens/eremora/seasons/{n}.json", season_file)
    try:
        run([sys.executable, ROOT / "scripts/pack_morimens_usage_v2.py", "--root", ROOT, "--season", n])
    finally:
        season_file.unlink(missing_ok=True)  # intermediate only, never committed
    run([sys.executable, ROOT / "scripts/compact_json.py", data / "eremora", n])

    # manifest
    mpath = data / "eremora/manifest.json"
    m = json.loads(mpath.read_text(encoding="utf-8"))
    meta = json.loads((sdir / "meta.json").read_text(encoding="utf-8"))
    rc = len(ranking["rows"]) - len(meta.get("duplicateRankRowsDropped") or [])
    lidx = json.loads((data / f"eremora/usage/{n}-local-gzip/index.json").read_text(encoding="utf-8"))
    for sub in ("local", "battle"):
        p = data / f"eremora/usage/{n}-{sub}-gzip/index.json"
        ix = json.loads(p.read_text(encoding="utf-8"))
        ix["generatedAt"] = iso
        write_json(p, ix)
    m["usageIndex"].update({"syncedAt": iso, "recordCount": rc, "target": rc, "rankIndexCount": rc,
                            "coverage": {"expected": rc, "covered": rc, "coveragePct": 100.0, "complete": True}})
    m["current"].update({"leaderboardEntries": rc, "records": rc, "complete": True})
    m["rankIndex"].update({"target": rc, "count": rc, "syncedAt": iso,
                           "revision": f"s{n}-top{top}{'-final' if a.final else ''}-{got:%Y%m%d-%H%M}"})
    m["source"]["syncedAt"] = iso
    li = m["latestLocalImport"]
    li.update({"rankedPlayers": rc, "parsedRecords": rc, "rankRange": [1, top], "teamRows": meta["teamRows"], "updatedAt": iso,
               "revision": lidx["revision"],
               "note": f"Season {n} {'FINAL (settled)' if a.final else 'snapshot'}: Top {top} rank snapshot {updated} + teams_latest.jsonl of the same capture; "
                       "rows the capture lacks come from the older captures (--fallback-raw)."})
    for e in m["availableSeasons"]:
        if e.get("seasonId") == n and not e.get("snapshotId") and not e.get("aggregatePath"):
            e.update({"dataUpdatedAt": iso, "revision": lidx["revision"], "recordCount": rc, "leaderboardEntryCount": rc,
                      "coverageMode": f"official-rank-top{top}{'-final' if a.final else ''}"})
    write_crlf_json(mpath, m)

    if a.changelog:
        add_changelog(*a.changelog)
    if not a.no_version_bump:
        bump_asset_version()
    shutil.rmtree(tmp, ignore_errors=True)
    log(f"done: {rc} players, {meta['teamRows']} team rows. Review `git status`, check the page, then commit + push (preview first).")


if __name__ == "__main__":
    main()

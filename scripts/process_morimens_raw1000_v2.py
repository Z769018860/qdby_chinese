#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Robust wrapper for scripts/process_morimens_raw1000.py.

Fixes:
- SvelteKit raw JSON may contain Unicode line separators inside JSON strings.
  str.splitlines() incorrectly splits those; this wrapper only splits on ASCII LF.
- Detects saved Cloudflare 403 pages explicitly.
- Writes compact JSON to reduce repository size.
- Generates retry-uids/<season>.txt from parse failures.

The detailed normalization (enlightenment, wheels/weapons, trinkets, suits,
creations/relics, keeper skill/token, historical seasons) is reused from the
repository's process_morimens_raw1000.py.
"""
from __future__ import annotations
import importlib.util
import json
import sys
from pathlib import Path

HERE=Path(__file__).resolve().parent
BASE_FILE=HERE/"process_morimens_raw1000.py"

spec=importlib.util.spec_from_file_location("morimens_raw_base", BASE_FILE)
base=importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(base)

def save_json_compact(path:Path,obj):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(
        json.dumps(obj,ensure_ascii=False,separators=(",",":"),allow_nan=False)+"\n",
        encoding="utf-8"
    )

def decode_fixed(text:str):
    if "Target URL returned error 403" in text or "Attention Required! | Cloudflare" in text:
        raise ValueError("RAW_FETCH_BLOCKED_403")
    docs=[]
    raw=base.payload(text)
    # IMPORTANT: do not use splitlines(); U+2028/U+2029 may legally occur in JSON strings.
    for line in raw.split("\n"):
        s=line.strip()
        if not s or s=="```" or s.startswith(("Title:","URL Source:","Published Time:")):
            continue
        if s.startswith("```"):
            s=s[3:].lstrip("json").strip()
        if not s:
            continue
        try:
            obj=json.loads(s)
            if isinstance(obj,dict):
                docs.append(obj)
        except Exception:
            pass
    chunks=[
        {"id":d.get("id"),"data":base.unflatten(d["data"])}
        for d in docs
        if d.get("type")=="chunk" and isinstance(d.get("data"),list)
    ]
    if not chunks:
        raise ValueError("No SvelteKit chunks found")
    roots=[x["data"] for x in chunks]
    return {
        "docs":docs,
        "roots":roots,
        "root":next((x["data"] for x in chunks if x.get("id")==1),roots[0]),
    }

base.save_json=save_json_compact
base.decode=decode_fixed

rc=base.main()

# Produce a plain UID retry list for the downloader.
try:
    season=69
    for i,arg in enumerate(sys.argv):
        if arg=="--season" and i+1<len(sys.argv):
            season=int(sys.argv[i+1])
    root=Path(".").resolve()
    for i,arg in enumerate(sys.argv):
        if arg=="--root" and i+1<len(sys.argv):
            root=Path(sys.argv[i+1]).resolve()
    fail_file=root/"data/morimens/eremora/parse-failures"/f"{season}.json"
    failures=json.loads(fail_file.read_text(encoding="utf-8")) if fail_file.exists() else []
    retry=root/"data/morimens/eremora/retry-uids"/f"{season}.txt"
    retry.parent.mkdir(parents=True,exist_ok=True)
    retry.write_text(
        "\n".join(str(x.get("uid")) for x in failures if x.get("uid"))+("\n" if failures else ""),
        encoding="utf-8"
    )
    blocked=sum(1 for x in failures if "RAW_FETCH_BLOCKED_403" in str(x.get("error","")))
    print(f"[REPORT] failures={len(failures)}, blocked403={blocked}, retryList={retry}")
except Exception as exc:
    print(f"[WARN] Unable to create retry UID list: {exc}")

raise SystemExit(rc)

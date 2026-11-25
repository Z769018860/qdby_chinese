#!/usr/bin/env python3
"""Fetch the public battle replays of the hard main-story reviews and keep only the team snapshot.

The review list (CopyReview.QueryStageReview) only exposes the four Awakeners' levels and the keeper
skill; the keeper level, the enlightenment (potency) levels and the soulforge (break) levels live in the
replay object of every clear.  This script downloads each BattleReplay_<uuid>.json anonymously, decodes
the LZ4/MessagePack body, keeps `playerLevel`, `keeperSkill` and per-member `(tid, level, potencyLevel,
breakLevel)`, and appends one JSON line per clear to a cache file so the run can be resumed.

Usage: py scripts/fetch_main_hard_detail.py <stages dir> [--out cache.jsonl] [--workers 16]
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import json
import sys
import threading
import time
import urllib.request
import urllib.error
from pathlib import Path

import lz4.frame
import msgpack

BASE = "https://z1g-warreport.qookkagames.com/publish/BattleReplay_{}.json"
LZ4_MAGIC = b"\x04\x22\x4d\x18"
lock = threading.Lock()
# The report CDN is reachable directly; going through the environment's HTTP proxy makes the connection
# reset under a handful of parallel requests, so build an opener that ignores the proxy variables.
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def decode(body: bytes):
    packed = body if body.startswith(LZ4_MAGIC) else json.loads(body.decode("latin1"))["compStr"].encode("latin1")
    root = msgpack.unpackb(lz4.frame.decompress(packed), raw=True, strict_map_key=False)
    bd = root[b"battleDat"]
    members = []
    for r in bd.get(b"roleData") or []:
        members.append([r.get(b"tid"), r.get(b"level"), r.get(b"potencyLevel"), r.get(b"breakLevel")])
    return {
        "k": bd.get(b"playerLevel"),
        "ks": bd.get(b"keeperSkill"),
        "m": members,
    }


def fetch(uuid: str, tries: int = 2):
    last = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(BASE.format(uuid), headers={"User-Agent": "qdby-chinese-mainhard/1.0"})
            with OPENER.open(req, timeout=25) as resp:
                body = resp.read(20_000_001)
            if len(body) > 20_000_000:
                raise ValueError("body too large")
            return decode(body)
        except urllib.error.HTTPError as exc:
            if exc.code in (403, 404, 410):
                raise RuntimeError(f"{uuid}: HTTP {exc.code} (replay not public)") from None
            last = exc
            time.sleep(1.5 * (attempt + 1))
        except Exception as exc:  # noqa: BLE001 - network failures are expected
            last = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"{uuid}: {type(last).__name__}: {last}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("stages")
    ap.add_argument("--out", default="H:/work/tmp/mh_detail.jsonl")
    ap.add_argument("--workers", type=int, default=16)
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    stage_dir = Path(args.stages)
    todo = []
    seen = set()
    for f in sorted(stage_dir.glob("*.json")):
        doc = json.loads(f.read_text(encoding="utf-8"))
        tid = doc["stage"]["stageTid"]
        for r in doc["reviews"]:
            u = r["battleUuid"]
            if u in seen:
                continue
            seen.add(u)
            todo.append((tid, u))
    if args.limit:
        todo = todo[: args.limit]

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    done = set()
    if out.exists():
        for line in out.read_text(encoding="utf-8").splitlines():
            if line.strip():
                try:
                    done.add(json.loads(line)["u"])
                except Exception:  # noqa: BLE001
                    pass
    pending = [x for x in todo if x[1] not in done]
    # Expired replays and slow sockets cluster by stage; interleave the stages so one bad batch cannot
    # occupy every worker at once.
    pending.sort(key=lambda x: (hash(x[1]) & 0xFFFF, x[0]))
    print(f"{len(todo)} clears, {len(done)} cached, {len(pending)} to fetch", flush=True)

    ok = fail = 0
    started = time.time()
    with out.open("a", encoding="utf-8") as fh, cf.ThreadPoolExecutor(args.workers) as ex:
        futures = {ex.submit(fetch, u): (tid, u) for tid, u in pending}
        for i, fut in enumerate(cf.as_completed(futures), 1):
            tid, u = futures[fut]
            try:
                data = fut.result()
            except Exception as exc:  # noqa: BLE001
                fail += 1
                if 'replay not public' not in str(exc):
                    print(f"FAIL {exc}", flush=True)
                continue
            ok += 1
            rec = {"s": tid, "u": u, **data}
            with lock:
                fh.write(json.dumps(rec, ensure_ascii=False, separators=(",", ":")) + "\n")
                if i % 20 == 0:
                    fh.flush()
            if i % 10 == 0:
                rate = i / (time.time() - started)
                left = (len(pending) - i) / rate if rate else 0
                print(f"{i}/{len(pending)} ok={ok} fail={fail} {rate:.2f}/s eta {left/60:.1f}min", flush=True)
    print(f"done ok={ok} fail={fail} in {(time.time()-started)/60:.1f}min -> {out}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())

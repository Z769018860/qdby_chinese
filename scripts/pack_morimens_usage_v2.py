#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Pack the season-71 datasets into smaller gzip/base64 chunks without dropping any detail.

The payload keeps every field the page needs; it is only rewritten in a compact,
table-driven layout (entity tables + string pool + positional arrays) before gzip.
Compared with the previous `gzip-base64-chunked-v1` JSON dump this removes the
repeated key names, the repeated English/Chinese literals and the derivable
`url` / `canonicalName` / `currentScore` noise, which is what gzip could not
collapse across its 32 KiB window.

Format: gzip-base64-chunked-v2 (same .b64 shard delivery, new payload layout).
"""
from __future__ import annotations

import argparse
import base64
import gzip
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

NULL = -1


# --------------------------------------------------------------------------- #
# string pool                                                                  #
# --------------------------------------------------------------------------- #
class Pool:
    def __init__(self):
        self.map: dict[str, int] = {}
        self.list: list[str] = []

    def i(self, value):
        if value is None:
            return NULL
        idx = self.map.get(value)
        if idx is None:
            idx = len(self.list)
            self.map[value] = idx
            self.list.append(value)
        return idx

    def get(self, idx):
        return None if idx is None or idx < 0 else self.list[idx]


class Table:
    """id -> row; built from the payload itself so every lookup resolves."""

    def __init__(self):
        self.k: dict = {}
        self.l: list = []

    def key(self, ident):
        idx = self.k.get(ident)
        if idx is None:
            idx = len(self.l)
            self.k[ident] = idx
            self.l.append(None)
        return idx

    def set(self, ident, row):
        self.l[self.key(ident)] = row

    def idx(self, ident):
        return self.k[ident]


# --------------------------------------------------------------------------- #
# records encoder                                                              #
# --------------------------------------------------------------------------- #
def encode_records(records, season_id):
    pool = Pool()
    chars = Table()
    wheels = Table()
    covs = Table()
    creas = Table()
    tokens = Table()
    stages = Table()
    wave_keys = Table()
    attrs = Table()

    # pass 1 - reserve every table row so the row order is deterministic
    for rec in records:
        for wave in rec.get("waves") or []:
            wave_keys.key((wave.get("wave"), wave.get("madness"),
                           wave.get("stageGroupId"), wave.get("stageTid")))
            for team in wave.get("teams") or []:
                stages.key((team.get("stageName"), team.get("difficulty"), team.get("difficultyLabel")))
                token = team.get("token")
                if token:
                    tokens.key(token.get("id"))
                for c in team.get("creations") or []:
                    creas.key(c.get("id"))
                for m in team.get("members") or []:
                    chars.key(m.get("tid"))
                    for w in m.get("wheels") or []:
                        wheels.key(w.get("id"))
                    for c in m.get("covenants") or []:
                        covs.key(c.get("id"))

    # pass 2 - fill the rows (names are pooled in first-appearance order)
    for rec in records:
        for wave in rec.get("waves") or []:
            for team in wave.get("teams") or []:
                for m in team.get("members") or []:
                    chars.set(m.get("tid"), [m.get("tid"), pool.i(m.get("name")),
                                             pool.i(m.get("ingameId")), pool.i(m.get("realm")),
                                             pool.i(m.get("role"))])
                    for w in m.get("wheels") or []:
                        wheels.set(w.get("id"), [w.get("id"), pool.i(w.get("name"))])
                    for c in m.get("covenants") or []:
                        covs.set(c.get("id"), [c.get("id"), pool.i(c.get("name"))])
                for c in team.get("creations") or []:
                    creas.set(c.get("id"), [c.get("id"), pool.i(c.get("name"))])
                token = team.get("token")
                if token:
                    tokens.set(token.get("id"), [token.get("id"), pool.i(token.get("name"))])
    for i, k in enumerate(wave_keys.k):
        wave_keys.l[i] = list(k)
    for i, k in enumerate(stages.k):
        stages.l[i] = [pool.i(k[0]), pool.i(k[1]), pool.i(k[2])]

    # borrowed awakeners carry their covenant pieces verbatim; they are compacted
    # separately because they are the only nested object with its own attr table
    trinkets_all = [x for rec in records for wave in rec.get("waves") or []
                    for team in wave.get("teams") or [] for m in team.get("members") or []
                    for x in (m["trinkets"] if "trinkets" in m else [])]
    t_uniform = {
        "image": {x.get("image") for x in trinkets_all},
        "rarity": {x.get("rarity") for x in trinkets_all},
        "enhanceLevel": {x.get("enhanceLevel") for x in trinkets_all},
        "breakLevel": {x.get("breakLevel") for x in trinkets_all},
        "bound": {x.get("bound") for x in trinkets_all},
    }
    t_const = None
    if all(len(v) == 1 for v in t_uniform.values()):
        t_const = {
            "image": t_uniform["image"].pop(),
            "rarity": pool.i(t_uniform["rarity"].pop()),
            "enhance": t_uniform["enhanceLevel"].pop(),
            "break": t_uniform["breakLevel"].pop(),
            "bound": 1 if t_uniform["bound"].pop() else 0,
        }
    attr_map = {}
    if t_const is not None:
        for x in trinkets_all:
            for a in x.get("attrs") or []:
                attr_map[a.get("id")] = [a.get("id"), pool.i(a.get("name")),
                                         1 if a.get("percentage") else 0]
    def pack_trinkets(pieces):
        if t_const is None:
            return pieces
        return [[x.get("id"), pool.i(x.get("name")), x.get("slot"), x.get("level"), x.get("suitId"),
                 [[a.get("id"), a.get("value"), a.get("rollQuality")] for a in x.get("attrs") or []]]
                for x in pieces]

    # uniform-field detection (all of these hold for the current payload, but the
    # encoder stays correct if a future import diverges)
    srcs = {r.get("sourceTransport") for r in records}
    sids = {r.get("seasonId") for r in records}
    cur_score = all(r.get("currentScore") == r.get("score") for r in records)
    canonical = True
    enlight = set()
    url_pad = None
    for rec in records:
        uid = str(rec.get("uid") or "")
        url = rec.get("url")
        if isinstance(url, str) and uid:
            pos = url.find(uid)
            pad = (url[:pos], url[pos + len(uid):]) if pos >= 0 else None
        else:
            pad = None
        if pad is None:
            url_pad = False
        elif url_pad is None:
            url_pad = pad
        elif url_pad != pad:
            url_pad = False
    for rec in records:
        for wave in rec.get("waves") or []:
            for team in wave.get("teams") or []:
                for m in team.get("members") or []:
                    if m.get("canonicalName") != m.get("name"):
                        canonical = False
                    enlight.add((m.get("enlightTier"), m.get("enlightTierLabel")))
    flags = {
        "cs": cur_score,
        "url": url_pad is not False,
        "src": len(srcs) == 1,
        "canon": canonical,
        "enl": len(enlight) == 1,
    }
    doc = {
        "enc": 2,
        "seasonId": sids.pop() if len(sids) == 1 else None,
        "src": srcs.pop() if len(srcs) == 1 else None,
        "urlPad": list(url_pad) if flags["url"] else None,
        "pool": pool.list,
        "chars": chars.l,
        "wheels": wheels.l,
        "covs": covs.l,
        "creas": creas.l,
        "tokens": tokens.l,
        "stages": stages.l,
        "waveKeys": wave_keys.l,
        "attrs": sorted(attr_map.values(), key=lambda r: r[0]) if attr_map else [],
        "trinketConst": t_const,
        "f": flags,
    }
    if flags["enl"]:
        tier, label = enlight.pop()
        doc["enl"] = [pool.i(tier), pool.i(label)]

    recs = []
    for rec in records:
        waves = []
        for wave in rec.get("waves") or []:
            teams = []
            for team in wave.get("teams") or []:
                token = team.get("token")
                members = []
                for m in team.get("members") or []:
                    row = [
                        chars.idx(m.get("tid")), m.get("level"), m.get("potencyLevel"),
                        m.get("breakLevel"), m.get("levelLimitIncreaseIdx"),
                        1 if m.get("borrowed") else 0, pool.i(m.get("assistUid")),
                        [[wheels.idx(w.get("id")), w.get("level")] for w in m.get("wheels") or []],
                        [[covs.idx(c.get("id")), c.get("count")] for c in m.get("covenants") or []],
                        (pack_trinkets(m["trinkets"]) if "trinkets" in m else None),
                    ]
                    if not canonical:
                        row.append(pool.i(m.get("canonicalName")))
                    if not flags["enl"]:
                        row.append([pool.i(m.get("enlightTier")), pool.i(m.get("enlightTierLabel"))])
                    members.append(row)
                teams.append([
                    stages.idx((team.get("stageName"), team.get("difficulty"), team.get("difficultyLabel"))),
                    team.get("score"), pool.i(team.get("clearType")), pool.i(team.get("battleUuid")),
                    tokens.idx(token.get("id")) if token else NULL,
                    [creas.idx(c.get("id")) for c in team.get("creations") or []],
                    members,
                ])
            waves.append([wave_keys.idx((wave.get("wave"), wave.get("madness"),
                                         wave.get("stageGroupId"), wave.get("stageTid"))), teams])
        row = [rec.get("rank"), pool.i(rec.get("player")), pool.i(rec.get("uid")),
               rec.get("score"), waves]
        if not cur_score:
            row.append(rec.get("currentScore"))
        if not flags["url"]:
            row.append(pool.i(rec.get("url")))
        if not flags["src"]:
            row.append(pool.i(rec.get("sourceTransport")))
        recs.append(row)
    doc["recs"] = recs
    return doc


def decode_records(doc):
    pool = Pool()
    pool.list = doc["pool"]
    f = doc["f"]
    sid = doc["seasonId"]
    src = doc["src"]
    pad = doc["urlPad"]
    enl = doc.get("enl")
    chars = doc["chars"]
    wheels = doc["wheels"]
    covs = doc["covs"]
    creas = doc["creas"]
    tokens = doc["tokens"]
    stages = doc["stages"]
    wave_keys = doc["waveKeys"]
    attr_by_id = {a[0]: a for a in doc.get("attrs") or []}
    t_const = doc.get("trinketConst")

    def unpack_trinkets(pieces):
        if t_const is None or not isinstance(pieces, list):
            return pieces
        out_pieces = []
        for p in pieces:
            out_pieces.append({
                "id": p[0], "name": pool.get(p[1]), "image": t_const["image"],
                "rarity": pool.get(t_const["rarity"]), "slot": p[2], "level": p[3],
                "enhanceLevel": t_const["enhance"], "breakLevel": t_const["break"],
                "attrs": [{"id": a[0], "name": pool.get(attr_by_id[a[0]][1]) if a[0] in attr_by_id else None,
                           "value": a[1],
                           "percentage": bool(attr_by_id[a[0]][2]) if a[0] in attr_by_id else False,
                           "rollQuality": a[2]} for a in p[5]],
                "suitId": p[4], "bound": t_const["bound"] == 1,
            })
        return out_pieces

    out = []
    for row in doc["recs"]:
        rank, player_i, uid_i, score, waves = row[0], row[1], row[2], row[3], row[4]
        slot = 5
        if f["cs"]:
            current = score
        else:
            current = row[slot]
            slot += 1
        uid = pool.get(uid_i)
        if f["url"]:
            url = pad[0] + uid + pad[1]
        else:
            url = pool.get(row[slot])
            slot += 1
        if f["src"]:
            transport = src
        else:
            transport = pool.get(row[slot])
            slot += 1
        wave_out = []
        for wrow in waves:
            wk = wave_keys[wrow[0]]
            teams = []
            for trow in wrow[1]:
                st = stages[trow[0]]
                token_i = trow[4]
                token = None
                if token_i is not None and token_i >= 0:
                    tk = tokens[token_i]
                    token = {"id": tk[0], "name": pool.get(tk[1])}
                members = []
                for mrow in trow[6]:
                    ch = chars[mrow[0]]
                    mslot = 10
                    canonical = ch[1] if f["canon"] else mrow[mslot]
                    if not f["canon"]:
                        mslot += 1
                    if f["enl"]:
                        tier, label = pool.get(enl[0]), pool.get(enl[1])
                    else:
                        tier, label = pool.get(mrow[mslot][0]), pool.get(mrow[mslot][1])
                    member = {
                        "name": pool.get(ch[1]),
                        "canonicalName": pool.get(canonical),
                        "ingameId": pool.get(ch[2]),
                        "realm": pool.get(ch[3]),
                        "role": pool.get(ch[4]),
                        "level": mrow[1],
                        "potencyLevel": mrow[2],
                        "wheels": [{"id": wheels[w[0]][0], "name": pool.get(wheels[w[0]][1]),
                                    "level": w[1]} for w in mrow[7]],
                        "covenants": [{"id": covs[c[0]][0], "name": pool.get(covs[c[0]][1]),
                                       "count": c[1]} for c in mrow[8]],
                        "borrowed": mrow[5] == 1,
                        "assistUid": pool.get(mrow[6]),
                        "tid": ch[0],
                        "breakLevel": mrow[3],
                        "levelLimitIncreaseIdx": mrow[4],
                    }
                    if mrow[9] is not None:
                        member["trinkets"] = unpack_trinkets(mrow[9])
                    member["enlightTier"] = tier
                    member["enlightTierLabel"] = label
                    members.append(member)
                teams.append({
                    "stageName": pool.get(st[0]),
                    "score": trow[1],
                    "clearType": pool.get(trow[2]),
                    "token": token,
                    "creations": [{"id": creas[c][0], "name": pool.get(creas[c][1])} for c in trow[5]],
                    "battleUuid": pool.get(trow[3]),
                    "members": members,
                    "difficulty": pool.get(st[1]),
                    "difficultyLabel": pool.get(st[2]),
                })
            wave_out.append({"wave": wk[0], "madness": wk[1], "teams": teams,
                             "stageGroupId": wk[2], "stageTid": wk[3]})
        out.append({"rank": rank, "player": pool.get(player_i), "uid": uid, "score": score,
                    "currentScore": current, "url": url, "seasonId": sid, "waves": wave_out,
                    "sourceTransport": transport})
    return out


# --------------------------------------------------------------------------- #
# battle encoder                                                               #
# --------------------------------------------------------------------------- #
def encode_battles(battles):
    uuids = list(battles.keys())
    fields = []
    for u in uuids:
        for k in battles[u]["b"]:
            if k not in fields:
                fields.append(k)
        if len(fields) and all(set(battles[x]["b"].keys()) == set(fields) for x in uuids):
            break
    cols = [[battles[u]["b"].get(k) for u in uuids] for k in fields]
    tids = sorted({row[0] for u in uuids for row in battles[u]["m"]})
    tmap = {t: i for i, t in enumerate(tids)}
    widths = {len(battles[u]["m"]) for u in uuids}
    rows = [row for u in uuids for row in battles[u]["m"]]
    mc = [[tmap[r[0]] for r in rows],
          [r[1] if len(r) > 1 else None for r in rows],
          [r[2] if len(r) > 2 else None for r in rows],
          [r[3] if len(r) > 3 else None for r in rows]]
    doc = {
        "enc": 2,
        "kind": "battles",
        "seasonId": None,
        "fields": fields,
        "uuids": [u.replace("-", "") for u in uuids],
        "tids": tids,
        "bc": cols,
        "mf": {"n": 4, "per": widths.pop() if len(widths) == 1 else None, "c": mc},
    }
    if doc["mf"]["per"] is None:
        doc["mf"]["counts"] = [len(battles[u]["m"]) for u in uuids]
    return doc


def decode_battles(doc):
    fields = doc["fields"]
    uuids = doc["uuids"]
    cols = doc["bc"]
    tids = doc["tids"]
    mf = doc["mf"]
    n = mf["n"]
    flat = mf["c"]
    total = len(flat[0])
    rows = []
    for i in range(total):
        row = [tids[flat[0][i]]]
        for c in range(1, n):
            row.append(flat[c][i] if c < len(flat) else None)
        rows.append(row)
    if mf.get("per"):
        groups = [rows[i:i + mf["per"]] for i in range(0, total, mf["per"])]
    else:
        groups, pos = [], 0
        for cnt in mf["counts"]:
            groups.append(rows[pos:pos + cnt])
            pos += cnt
    out = {}
    for i, u in enumerate(uuids):
        b = {}
        for j, k in enumerate(fields):
            b[k] = cols[j][i]
        uuid = u
        if len(uuid) == 32:
            uuid = f"{uuid[0:8]}-{uuid[8:12]}-{uuid[12:16]}-{uuid[16:20]}-{uuid[20:]}"
        out[uuid] = {"b": b, "m": groups[i]}
    return out


# --------------------------------------------------------------------------- #
# packing                                                                      #
# --------------------------------------------------------------------------- #
def write_chunks(root: Path, out_dir: Path, payload: dict, prefix: str, chunk_size: int,
                 index_extra: dict):
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
    compressed = gzip.compress(raw, compresslevel=9, mtime=0)
    revision = hashlib.sha256(compressed).hexdigest()
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob("chunk-*.b64"):
        old.unlink()
    chunks = []
    for number, offset in enumerate(range(0, len(compressed), chunk_size)):
        name = f"chunk-{number:03d}.b64"
        (out_dir / name).write_text(
            base64.b64encode(compressed[offset:offset + chunk_size]).decode("ascii") + "\n",
            encoding="ascii")
        chunks.append(str((out_dir / name).relative_to(root)).replace("\\", "/"))
    index = {
        "format": "gzip-base64-chunked-v2",
        "seasonId": index_extra.get("seasonId"),
        "recordCount": index_extra.get("recordCount", 0),
        "battleCount": index_extra.get("battleCount", 0),
        "source": index_extra.get("source", ""),
        "revision": revision,
        "generatedAt": index_extra.get("generatedAt"),
        "chunks": chunks,
        "chunkSize": chunk_size,
        "compressedBytes": len(compressed),
        "rawBytes": len(raw),
    }
    (out_dir / "index.json").write_text(
        json.dumps(index, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    return index, len(compressed), len(raw)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--season", type=int, default=71)
    ap.add_argument("--chunk-size", type=int, default=600_000)
    ap.add_argument("--data-root", default="data/morimens/eremora")
    ap.add_argument("--verify", action="store_true", help="round-trip check only, write nothing")
    args = ap.parse_args()

    root = Path(args.root).resolve()
    data = root / args.data_root
    season_doc = json.loads((data / "seasons" / f"{args.season}.json").read_text(encoding="utf-8"))
    records = season_doc["records"]
    # idempotent: if seasons/<n>.json was already rewritten in compact form, expand it first
    if "recs" in season_doc:
        records = decode_records(season_doc)
        print(f"(seasons/{args.season}.json was already compacted - expanded {len(records)} records)")

    doc = encode_records(records, args.season)
    back = decode_records(json.loads(json.dumps(doc)))
    if json.dumps(back, ensure_ascii=False, sort_keys=True) != json.dumps(records, ensure_ascii=False, sort_keys=True):
        for i, (a, b) in enumerate(zip(records, back)):
            if json.dumps(a, ensure_ascii=False, sort_keys=True) != json.dumps(b, ensure_ascii=False, sort_keys=True):
                raise SystemExit(f"record {i} mismatch\n{a}\n{b}")
        raise SystemExit("record count mismatch")
    if json.dumps(back, ensure_ascii=False) != json.dumps(records, ensure_ascii=False):
        raise SystemExit("record key order mismatch")
    print(f"records round-trip OK ({len(records)} records)")

    # battles come from the already published shard, so the merge keeps the exact
    # same battle facts
    bdir = data / "usage" / f"{args.season}-battle-gzip"
    bidx = json.loads((bdir / "index.json").read_text(encoding="utf-8"))
    blob = b"".join((root / c).read_text(encoding="ascii").strip().encode() for c in bidx["chunks"])
    bpayload = json.loads(gzip.decompress(base64.b64decode(blob)))
    # idempotent: accept the already-compacted payload when the script runs twice
    battles = bpayload["battles"] if "battles" in bpayload else decode_battles(bpayload)
    bdoc = encode_battles(battles)
    bback = decode_battles(json.loads(json.dumps(bdoc)))
    if json.dumps(bback, ensure_ascii=False, sort_keys=True) != json.dumps(battles, ensure_ascii=False, sort_keys=True):
        raise SystemExit("battle round-trip mismatch")
    print(f"battles round-trip OK ({len(battles)} battles)")

    raw_old = len(json.dumps({"seasonId": args.season, "records": records},
                             ensure_ascii=False, separators=(",", ":")).encode())
    raw_battle_old = len(json.dumps({"seasonId": args.season, "battles": battles},
                                    ensure_ascii=False, separators=(",", ":")).encode())
    print("records: raw %d -> %d   gzip %d -> %d" %
          (raw_old, len(json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()),
           len(gzip.compress(json.dumps({"seasonId": args.season, "records": records},
                                        ensure_ascii=False, separators=(",", ":")).encode(), 9, mtime=0)),
           len(gzip.compress(json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode(), 9, mtime=0))))
    print("battles: raw %d -> %d   gzip %d -> %d" %
          (raw_battle_old, len(json.dumps(bdoc, ensure_ascii=False, separators=(",", ":")).encode()),
           len(gzip.compress(json.dumps({"seasonId": args.season, "battles": battles},
                                        ensure_ascii=False, separators=(",", ":")).encode(), 9, mtime=0)),
           len(gzip.compress(json.dumps(bdoc, ensure_ascii=False, separators=(",", ":")).encode(), 9, mtime=0))))
    if args.verify:
        return

    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    local_dir = data / "usage" / f"{args.season}-local-gzip"
    index, cbytes, rbytes = write_chunks(
        root, local_dir, doc, f"{args.season}-local", args.chunk_size,
        {"seasonId": args.season, "recordCount": len(records),
         "source": "local detailed __data.json import", "generatedAt": generated_at})
    print(f"local  -> {len(index['chunks'])} chunks, {cbytes:,} gzip bytes")

    bindex, bbytes, brbytes = write_chunks(
        root, bdir, bdoc, f"{args.season}-battle", args.chunk_size,
        {"seasonId": args.season, "battleCount": len(battles),
         "source": "season_83331 per-battle statistics (death resist, rounds, damage split ...)",
         "generatedAt": generated_at})

    manifest_path = data / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    ui = manifest.get("usageIndex") if isinstance(manifest.get("usageIndex"), dict) else {}
    ui.update({
        "path": str((local_dir / "index.json").relative_to(root)).replace("\\", "/"),
        "recordCount": len(records),
        "syncedAt": generated_at,
        "revision": index["revision"],
        "format": index["format"],
        "chunks": len(index["chunks"]),
        "chunkSize": args.chunk_size,
        "chunkBytes": cbytes,
        "rawBytes": rbytes,
        "encoding": "table-pool-v2",
    })
    ui["coverage"] = {"expected": ui.get("target", len(records)), "covered": len(records),
                      "coveragePct": 100.0, "complete": True}
    manifest["usageIndex"] = ui
    for entry in manifest.get("availableSeasons") or []:
        if isinstance(entry, dict) and int(entry.get("seasonId") or -1) == args.season \
                and not entry.get("snapshotId") and not entry.get("aggregatePath"):
            entry["teamDetailRevision"] = index["revision"]
            entry["battleDetailRevision"] = bindex["revision"]
            entry["payloadEncoding"] = "table-pool-v2"
    li = manifest.get("latestLocalImport")
    if isinstance(li, dict) and int(li.get("seasonId") or -1) == args.season:
        li["payloadEncoding"] = "table-pool-v2"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, allow_nan=False) + "\n",
                             encoding="utf-8")

    print(json.dumps({
        "local": {"chunks": len(index["chunks"]), "gzipBytes": cbytes, "rawBytes": rbytes,
                  "revision": index["revision"]},
        "battle": {"chunks": len(bindex["chunks"]), "gzipBytes": bbytes, "rawBytes": brbytes,
                   "revision": bindex["revision"]},
    }, indent=2))


if __name__ == "__main__":
    main()

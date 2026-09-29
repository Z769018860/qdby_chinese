#!/usr/bin/env python3
"""Archive Morimens machine submissions from Waline PostgreSQL into GitHub JSON.

Waline is treated as a short-lived queue. Successfully decoded D-Zone/Assist
records are merged into compact repository snapshots. A cleanup manifest is
written for a second step; cleanup must run only after the Git commit is pushed.
"""

from __future__ import annotations

import argparse
import base64
import gzip
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "morimens" / "community"
DZONE_FILE = DATA_DIR / "dzone.json"
ASSIST_FILE = DATA_DIR / "assist.json"
HISTORY_FILE = DATA_DIR / "history.json"
STATE_FILE = DATA_DIR / "archive-state.json"
CLEANUP_FILE = ROOT / ".tmp" / "morimens-waline-cleanup.json"

DZONE_PATH = "/__morimens_dzone_submissions__/"
ASSIST_PATH = "/__morimens_assist_submissions__/"
DZONE_MARKER = "MORIMENS_DZONE_V1:"
ASSIST_MARKER = "MORIMENS_ASSIST_V1:"
MIN_INTERVAL_SECONDS = 72 * 60 * 60


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text("utf-8"))
    except Exception:
        return default


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", "utf-8")


def b64url_decode(text: str) -> bytes:
    text = text.strip().replace("-", "+").replace("_", "/")
    text += "=" * ((4 - len(text) % 4) % 4)
    return base64.b64decode(text)


def extract_token(source: str | None, marker: str) -> str:
    if not source:
        return ""
    raw = str(source)
    idx = raw.find(marker)
    if idx < 0:
        return ""
    tail = raw[idx + len(marker):]
    if "-->" in tail:
        tail = tail.split("-->", 1)[0]
    if "<" in tail:
        tail = tail.split("<", 1)[0]
    tail = re.sub(r"\s+", "", tail)
    if marker == DZONE_MARKER:
        m = re.match(r"((?:gz|json):[A-Za-z0-9_-]+={0,2})", tail)
        if m:
            return m.group(1)
        m = re.match(r"([A-Za-z0-9+/_=-]{16,})", tail)
        return m.group(1) if m else ""
    m = re.match(r"([A-Za-z0-9+/=_-]{16,})", tail)
    return m.group(1) if m else ""


def decode_dzone(token: str):
    if token.startswith("gz:"):
        raw = gzip.decompress(b64url_decode(token[3:]))
        return json.loads(raw.decode("utf-8"))
    if token.startswith("json:"):
        return json.loads(b64url_decode(token[5:]).decode("utf-8"))
    # Legacy plain base64/base64url JSON.
    try:
        return json.loads(b64url_decode(token).decode("utf-8"))
    except Exception:
        raw = base64.b64decode(token)
        return json.loads(raw.decode("utf-8"))


def dzone_meta(stored: dict, inserted_at: str, nick: str):
    if int(stored.get("v") or 0) == 5 and isinstance(stored.get("r"), list):
        record = stored["r"]
        season_id = int(stored.get("s") or (record[5] if len(record) > 5 else 0) or 0)
        uid = str(stored.get("u") or (record[1] if len(record) > 1 else "") or "")
        variant = str(stored.get("q") or ("prebug" if season_id == 69 else "default"))
        target_key = str(stored.get("k") or ("69-postbug" if season_id == 69 and variant == "postbug" else "69-prebug" if season_id == 69 else season_id))
        submitted_by = str(stored.get("n") or nick or "匿名")
        submitted_at = str(stored.get("t") or inserted_at or "")
        score = record[2] if len(record) > 2 else None
        waves = record[6] if len(record) > 6 and isinstance(record[6], list) else []
        teams = sum(len(w[2]) for w in waves if isinstance(w, list) and len(w) > 2 and isinstance(w[2], list))
        submission_id = str(stored.get("i") or "")
    else:
        record = stored.get("record") or {}
        season_id = int(stored.get("seasonId") or record.get("seasonId") or 0)
        uid = str(stored.get("uid") or record.get("uid") or "")
        variant = str(stored.get("communityVariant") or stored.get("variant") or ("prebug" if season_id == 69 else "default"))
        target_key = str(stored.get("targetKey") or ("69-postbug" if season_id == 69 and variant == "postbug" else "69-prebug" if season_id == 69 else season_id))
        submitted_by = str(stored.get("submittedBy") or nick or "匿名")
        submitted_at = str(stored.get("submittedAt") or inserted_at or "")
        score = record.get("score", record.get("currentScore"))
        waves = record.get("waves") or []
        teams = sum(len(w.get("teams") or []) for w in waves if isinstance(w, dict))
        submission_id = str(stored.get("submissionId") or "")
    if not uid or not season_id:
        raise ValueError("D-Zone payload missing uid/season")
    key = f"{target_key}:{uid}"
    phase = " · Bug后" if season_id == 69 and variant == "postbug" else " · Bug前" if season_id == 69 else ""
    return {
        "key": key,
        "uid": uid,
        "seasonId": season_id,
        "communityVariant": variant,
        "targetKey": target_key,
        "submissionId": submission_id,
        "submittedBy": submitted_by,
        "submittedAt": submitted_at,
        "score": score,
        "teams": teams,
        "summary": f"第 {season_id} 期{phase} · {score if score is not None else '—'} 分 · {teams} 支队伍",
        "summaryZh": f"第 {season_id} 期{phase} · {score if score is not None else '—'} 分 · {teams} 支队伍",
        "summaryEn": f"Season {season_id}{' · Post-bug' if season_id == 69 and variant == 'postbug' else ' · Pre-bug' if season_id == 69 else ''} · {score if score is not None else '—'} pts · {teams} teams",
    }


def decode_assist(token: str):
    raw = token.replace("-", "+").replace("_", "/")
    raw += "=" * ((4 - len(raw) % 4) % 4)
    return json.loads(base64.b64decode(raw).decode("utf-8"))


def assist_meta(payload: dict, inserted_at: str, nick: str):
    uid = str(payload.get("uid") or "")
    character_id = str(payload.get("characterId") or payload.get("canonicalId") or (payload.get("awaker") or {}).get("id") or "")
    if not uid or not character_id:
        raise ValueError("Assist payload missing uid/character")
    player = str(payload.get("player") or nick or "匿名")
    submitted_at = str(payload.get("fetchedAt") or payload.get("submittedAt") or inserted_at or "")
    awaker_name = str((payload.get("awaker") or {}).get("name") or payload.get("characterName") or character_id)
    return {
        "key": f"{uid}:{character_id}",
        "uid": uid,
        "characterId": character_id,
        "submittedBy": player,
        "submittedAt": submitted_at,
        "summary": f"助战 Showcase · {awaker_name}",
        "summaryZh": f"助战 Showcase · {awaker_name}",
        "summaryEn": f"Assist Showcase · {awaker_name}",
        "awakerName": awaker_name,
    }


def newer(a: dict, b: dict) -> dict:
    return a if str(a.get("submittedAt") or "") >= str(b.get("submittedAt") or "") else b


def should_run(force: bool) -> bool:
    if force:
        return True
    state = load_json(STATE_FILE, {})
    last = state.get("lastArchiveAt")
    if not last:
        return True
    try:
        stamp = datetime.fromisoformat(str(last).replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - stamp).total_seconds() >= MIN_INTERVAL_SECONDS
    except Exception:
        return True


def archive(force: bool) -> int:
    if not should_run(force):
        CLEANUP_FILE.parent.mkdir(parents=True, exist_ok=True)
        write_json(CLEANUP_FILE, {"ids": [], "skipped": "less-than-72-hours"})
        print("Archive skipped: last successful archive is less than 72 hours old.")
        return 0

    dsn = os.environ.get("WALINE_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not dsn:
        raise SystemExit("Missing WALINE_DATABASE_URL GitHub Actions secret.")

    try:
        import psycopg
    except ImportError as exc:
        raise SystemExit("psycopg is required: pip install 'psycopg[binary]'") from exc

    dzone_doc = load_json(DZONE_FILE, {"version": 1, "updatedAt": None, "records": []})
    assist_doc = load_json(ASSIST_FILE, {"version": 1, "updatedAt": None, "records": []})
    history_doc = load_json(HISTORY_FILE, {"version": 1, "updatedAt": None, "records": []})

    dzone_by_key = {str(x.get("key")): x for x in dzone_doc.get("records", []) if x.get("key")}
    assist_by_key = {str(x.get("key")): x for x in assist_doc.get("records", []) if x.get("key")}
    history_by_id = {str(x.get("commentId")): x for x in history_doc.get("records", []) if x.get("commentId")}

    cleanup_ids: list[int] = []
    decoded_dzone = decoded_assist = skipped = 0

    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            cur.execute(
                'SELECT id, nick, comment, ua, url, status, insertedat '
                'FROM wl_comment WHERE url = ANY(%s) AND status = %s ORDER BY insertedat ASC',
                ([DZONE_PATH, ASSIST_PATH], "approved"),
            )
            rows = cur.fetchall()

    for comment_id, nick, comment, ua, url, status, inserted_at in rows:
        inserted = inserted_at.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z") if getattr(inserted_at, "tzinfo", None) is None else inserted_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
        try:
            if url == DZONE_PATH:
                token = extract_token(comment, DZONE_MARKER) or extract_token(ua, DZONE_MARKER)
                if not token:
                    skipped += 1
                    continue
                stored = decode_dzone(token)
                meta = dzone_meta(stored, inserted, str(nick or ""))
                entry = {**meta, "commentId": str(comment_id), "encoded": token}
                old = dzone_by_key.get(meta["key"])
                dzone_by_key[meta["key"]] = entry if old is None else newer(entry, old)
                history_by_id[str(comment_id)] = {
                    "commentId": str(comment_id), "type": "dzone", "uid": meta["uid"],
                    "submittedBy": meta["submittedBy"], "submittedAt": meta["submittedAt"],
                    "summary": meta["summary"], "summaryZh": meta["summaryZh"], "summaryEn": meta["summaryEn"],
                    "score": meta["score"], "teams": meta["teams"], "seasonId": meta["seasonId"],
                    "communityVariant": meta["communityVariant"],
                }
                decoded_dzone += 1
                cleanup_ids.append(int(comment_id))
            elif url == ASSIST_PATH:
                token = extract_token(comment, ASSIST_MARKER) or extract_token(ua, ASSIST_MARKER)
                if not token:
                    skipped += 1
                    continue
                payload = decode_assist(token)
                meta = assist_meta(payload, inserted, str(nick or ""))
                entry = {**meta, "commentId": str(comment_id), "payload": payload}
                old = assist_by_key.get(meta["key"])
                assist_by_key[meta["key"]] = entry if old is None else newer(entry, old)
                history_by_id[str(comment_id)] = {
                    "commentId": str(comment_id), "type": "assist", "uid": meta["uid"],
                    "submittedBy": meta["submittedBy"], "submittedAt": meta["submittedAt"],
                    "summary": meta["summary"], "summaryZh": meta["summaryZh"], "summaryEn": meta["summaryEn"],
                    "awakerName": meta["awakerName"], "characterId": meta["characterId"],
                }
                decoded_assist += 1
                cleanup_ids.append(int(comment_id))
        except Exception as exc:
            skipped += 1
            print(f"Skip Waline comment {comment_id}: {exc}", file=sys.stderr)

    stamp = now_iso()
    dzone_records = sorted(dzone_by_key.values(), key=lambda x: (str(x.get("targetKey")), str(x.get("uid"))))
    assist_records = sorted(assist_by_key.values(), key=lambda x: (str(x.get("uid")), str(x.get("characterId"))))
    history_records = sorted(history_by_id.values(), key=lambda x: str(x.get("submittedAt") or ""), reverse=True)

    write_json(DZONE_FILE, {"version": 1, "updatedAt": stamp, "recordCount": len(dzone_records), "records": dzone_records})
    write_json(ASSIST_FILE, {"version": 1, "updatedAt": stamp, "recordCount": len(assist_records), "records": assist_records})
    write_json(HISTORY_FILE, {"version": 1, "updatedAt": stamp, "recordCount": len(history_records), "records": history_records})
    write_json(STATE_FILE, {
        "version": 1, "lastArchiveAt": stamp,
        "dzoneLatestCount": len(dzone_records), "assistLatestCount": len(assist_records),
        "historyCount": len(history_records),
        "lastBatch": {"dzone": decoded_dzone, "assist": decoded_assist, "skipped": skipped, "cleanupCount": len(set(cleanup_ids))},
    })
    CLEANUP_FILE.parent.mkdir(parents=True, exist_ok=True)
    write_json(CLEANUP_FILE, {"ids": sorted(set(cleanup_ids)), "archivedAt": stamp})

    print(json.dumps({
        "dzone": decoded_dzone, "assist": decoded_assist, "skipped": skipped,
        "cleanup": len(set(cleanup_ids)), "history": len(history_records)
    }, ensure_ascii=False))
    return 0


def cleanup() -> int:
    doc = load_json(CLEANUP_FILE, {"ids": []})
    ids = [int(x) for x in doc.get("ids", []) if str(x).isdigit()]
    if not ids:
        print("Nothing to clean from Waline.")
        return 0

    dsn = os.environ.get("WALINE_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not dsn:
        raise SystemExit("Missing WALINE_DATABASE_URL GitHub Actions secret.")
    import psycopg

    deleted = 0
    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM wl_comment WHERE id = ANY(%s) AND url = ANY(%s)",
                (ids, [DZONE_PATH, ASSIST_PATH]),
            )
            deleted = cur.rowcount
        conn.commit()
    print(f"Deleted {deleted} archived machine comments from Waline.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["archive", "cleanup"])
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    return archive(args.force) if args.mode == "archive" else cleanup()


if __name__ == "__main__":
    raise SystemExit(main())

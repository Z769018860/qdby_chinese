#!/usr/bin/env python3
"""Move the legacy Waline PostgreSQL data into the EdgeOne Blob store.

Background: the Waline deployment on Vercel was paused by the platform
(HTTP 402 DEPLOYMENT_DISABLED), so the public API is gone. The database is
still alive -- the daily archive workflow keeps connecting to it. The EdgeOne
edge function now serves a Waline-compatible API at /api/waline/* and absorbs
this data through a token-protected import endpoint.

Two modes:
  * default          -> write a gzipped JSON file locally (debug / inspection)
  * --push URL       -> POST the data straight to /api/waline/import in batches
                        (nothing sensitive ever touches the repo; password
                        hashes stay in memory)

Privacy: mail / ip / ua of comments are NOT exported. Users keep their
password hash (phpass `$P$...`) because that is the only way old accounts can
still log in with their original password.

Usage:
    WALINE_DATABASE_URL=postgres://... python scripts/dump_waline_pg.py
    WALINE_DATABASE_URL=... WALINE_IMPORT_TOKEN=... \\
        python scripts/dump_waline_pg.py --push https://morimens.qingdengbuyi.top/api/waline/import
"""

from __future__ import annotations

import argparse
import gzip
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_OUT = Path("data/morimens/community/waline-dump.json.gz")
BATCH_COMMENTS = 150
BATCH_COUNTERS = 200
BATCH_USERS = 80
COMMENT_TEXT_MAX = 20000

# 验收阶段写进线上的临时数据，正式导入前顺手清掉（见 push()）
PURGE_PATHS = ["/__probe__"]
PURGE_USERS = ["probebot@zjtt.local"]


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def iso(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    return str(value)


def columns_of(cur, table: str) -> set[str]:
    cur.execute(
        "select column_name from information_schema.columns where table_name = %s",
        (table,),
    )
    return {row[0] for row in cur.fetchall()}


def pick(cols: set[str], *candidates: str):
    for name in candidates:
        if name in cols:
            return name
    return None


def clean_dsn(raw: str) -> str:
    """把 secret 里混进来的空白、引号、KEY= 前缀、前后杂物摘掉。

    GitHub Actions 的 secret 贴进带换行的值时很常见：psycopg 看到前导空白就不会
    按 URI 解析，转而当成 key=value 走，报 `missing "=" after "..."`。这个错
    看起来像连接串坏了，实际只是多了个 \n。
    """
    s = (raw or "").strip()
    # 整行复制进来的 KEY= 前缀
    upper = s.upper()
    for key in ("WALINE_DATABASE_URL=", "DATABASE_URL=", "PG_DSN=", "DSN=", "URL="):
        if upper.startswith(key):
            s = s[len(key):].strip()
            break
    # 首尾引号（从 .env 复制）
    if len(s) >= 2 and s[0] == s[-1] and s[0] in "'\"":
        s = s[1:-1].strip()
    # 前后还混着别的东西时，从第一个 URI scheme 起截断
    for scheme in ("postgresql://", "postgres://"):
        i = s.find(scheme)
        if i >= 0:
            # URI 里不会出现裸空白，截到第一段，避免多行片段的后半截被带进来
            s = s[i:].split()[0] if s[i:].split() else ""
            break
    return s


def dsn_shape(raw: str, cleaned: str) -> str:
    """只报形态，不报内容 —— 打印部分值会让 GitHub 的 secret 脱敏失效。"""
    raw = raw or ""
    return " ".join([
        f"raw_len={len(raw)}",
        f"clean_len={len(cleaned)}",
        f"lines={len(raw.splitlines())}",
        f"changed={str(cleaned != raw.strip()).lower()}",
        "scheme=" + str(cleaned.startswith(("postgres://", "postgresql://"))).lower(),
        "has_at=" + str("@" in cleaned).lower(),
    ])


def read_db(dsn: str) -> dict:
    import psycopg

    comments: list[dict] = []
    counters: list[dict] = []
    users: list[dict] = []

    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            ccols = columns_of(cur, "wl_comment")
            if not ccols:
                raise SystemExit("wl_comment not found")

            c_id = pick(ccols, "id")
            c_nick = pick(ccols, "nick")
            c_link = pick(ccols, "link")
            c_body = pick(ccols, "comment")
            c_orig = pick(ccols, "orig")
            c_url = pick(ccols, "url")
            c_status = pick(ccols, "status")
            c_pid = pick(ccols, "pid")
            c_rid = pick(ccols, "rid")
            c_sticky = pick(ccols, "sticky")
            c_like = pick(ccols, "like")
            c_ins = pick(ccols, "insertedat")
            c_crt = pick(ccols, "createdat")

            sel = [
                f"{c_id} as id",
                f"coalesce({c_nick}, '') as nick" if c_nick else "'' as nick",
                f"{c_link} as link" if c_link else "null as link",
                f"{c_body} as comment" if c_body else "'' as comment",
                f"{c_orig} as orig" if c_orig else "null as orig",
                f"{c_url} as url" if c_url else "'/' as url",
                f"{c_status} as status" if c_status else "'approved' as status",
                f"{c_pid} as pid" if c_pid else "null as pid",
                f"{c_rid} as rid" if c_rid else "null as rid",
                f"{c_sticky} as sticky" if c_sticky else "false as sticky",
                f'"{c_like}" as like_count' if c_like else "0 as like_count",
                f"{c_ins} as inserted_at" if c_ins else "null as inserted_at",
                f"{c_crt} as created_at" if c_crt else "null as created_at",
            ]
            sql = f"select {', '.join(sel)} from wl_comment"
            params: tuple = ()
            if c_status:
                sql += f" where {c_status} = %s"
                params = ("approved",)
            sql += f" order by {c_id} asc"

            cur.execute(sql, params)
            for row in cur.fetchall():
                (cid, nick, link, body, orig, url, status,
                 pid, rid, sticky, like_count, inserted_at, created_at) = row
                comments.append({
                    "id": int(cid),
                    "nick": nick or "",
                    "link": link or "",
                    "comment": (body or "")[:COMMENT_TEXT_MAX],
                    "orig": (orig or None) if orig is None else str(orig)[:COMMENT_TEXT_MAX],
                    "url": url or "/",
                    "status": status or "approved",
                    "pid": int(pid) if pid is not None else None,
                    "rid": int(rid) if rid is not None else None,
                    "sticky": bool(sticky),
                    "like": int(like_count or 0),
                    "createdAt": iso(created_at) or iso(inserted_at),
                    "insertedAt": iso(inserted_at) or iso(created_at),
                })

            kcols = columns_of(cur, "wl_counter")
            if kcols:
                k_url = pick(kcols, "url")
                react = [f"reaction{i}" for i in range(10) if f"reaction{i}" in kcols]
                s2 = [f"{k_url} as url"] if k_url else ["'' as url"]
                s2.append("time as time" if "time" in kcols else "0 as time")
                s2 += [f'"{r}" as {r}' for r in react]
                cur.execute(f"select {', '.join(s2)} from wl_counter")
                for row in cur.fetchall():
                    item = {"url": row[0] or "/", "time": int(row[1] or 0)}
                    for idx, name in enumerate(react):
                        item[name] = int(row[2 + idx] or 0)
                    counters.append(item)

            ucols = columns_of(cur, "wl_users")
            if ucols:
                u_id = pick(ucols, "id")
                u_name = pick(ucols, "display_name", "displayname")
                u_mail = pick(ucols, "email")
                u_pass = pick(ucols, "password")
                u_type = pick(ucols, "type")
                u_url = pick(ucols, "url")
                u_av = pick(ucols, "avatar")
                u_crt = pick(ucols, "createdat")

                s3 = [
                    f"{u_id} as id",
                    f"{u_name} as name" if u_name else "'' as name",
                    f"{u_mail} as email" if u_mail else "'' as email",
                    f"{u_pass} as password" if u_pass else "'' as password",
                    f"{u_type} as type" if u_type else "'guest' as type",
                    f"{u_url} as url" if u_url else "null as url",
                    f"{u_av} as avatar" if u_av else "null as avatar",
                    f"{u_crt} as created_at" if u_crt else "null as created_at",
                ]
                cur.execute(f"select {', '.join(s3)} from wl_users order by {u_id} asc")
                for row in cur.fetchall():
                    uid, name, email, password, utype, uurl, av, created = row
                    if not email:
                        continue
                    users.append({
                        "id": int(uid),
                        "name": name or "",
                        "email": email,
                        "password": password or "",
                        "type": utype or "guest",
                        "url": uurl or "",
                        "avatar": av or "",
                        "createdAt": iso(created) or "",
                    })

    return {"comments": comments, "counters": counters, "users": users}


def push(doc: dict, endpoint: str, token: str) -> None:
    # EdgeOne 走的是直连，环境里的 HTTP(S)_PROXY 会让请求绕道甚至被 reset
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def post(payload: dict) -> dict:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        last = None
        for attempt in range(4):
            req = urllib.request.Request(
                endpoint,
                data=body,
                method="POST",
                headers={
                    "Content-Type": "application/json",
                    "X-Import-Token": token,
                },
            )
            try:
                with opener.open(req, timeout=60) as resp:
                    return json.loads(resp.read().decode("utf-8"))
            except urllib.error.HTTPError as exc:  # 4xx/5xx 也把 body 读出来
                detail = exc.read().decode("utf-8", "replace")[:300]
                raise SystemExit(f"import failed: HTTP {exc.code} {detail}")
            except Exception as exc:  # 网络抖动，退避重试
                last = exc
                time.sleep(2 + attempt * 3)
        raise SystemExit(f"import failed after retries: {last}")

    comments = doc["comments"]
    counters = doc["counters"]
    users = doc["users"]

    # 正式导入前先清掉验收阶段写进去的临时数据：
    #   /__probe__ 的评论会顶在首页「最新留言」第一条（留言板是按全站最新列的）；
    #   probebot 占掉了 id=1，而旧库里的真实用户（通常就是管理员）也是 1 号，不清会撞号。
    if PURGE_PATHS or PURGE_USERS:
        r = post({"purge": PURGE_PATHS, "purgeUsers": PURGE_USERS})
        print("purge:", json.dumps(r.get("data") or {}, ensure_ascii=False))

    total_in = total_skip = 0
    for start in range(0, len(users), BATCH_USERS):
        chunk = users[start:start + BATCH_USERS]
        r = post({"users": chunk})
        d = r.get("data") or {}
        total_in += int(d.get("users") or 0)
        total_skip += int(d.get("usersSkipped") or 0)
        print(f"users {start + len(chunk)}/{len(users)} -> +{d.get('users')} skip {d.get('usersSkipped')}")

    for start in range(0, len(comments), BATCH_COMMENTS):
        chunk = comments[start:start + BATCH_COMMENTS]
        r = post({"comments": chunk})
        d = r.get("data") or {}
        print(f"comments {start + len(chunk)}/{len(comments)} -> +{d.get('inserted')} skip {d.get('skipped')}")

    for start in range(0, len(counters), BATCH_COUNTERS):
        chunk = counters[start:start + BATCH_COUNTERS]
        post({"counters": chunk})
        if (start // BATCH_COUNTERS) % 5 == 0:
            print(f"counters {start + len(chunk)}/{len(counters)}")

    r = post({"finalize": True})
    print("finalize:", json.dumps(r.get("data") or {}, ensure_ascii=False))
    print(f"users imported={total_in} skipped={total_skip}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--pretty", action="store_true")
    ap.add_argument("--push", default="", help="POST to this /api/waline/import endpoint")
    ap.add_argument("--token", default=os.environ.get("WALINE_IMPORT_TOKEN", ""))
    ap.add_argument("--allow-hash", action="store_true", help="即使密码哈希不是 phpass 也照导")
    args = ap.parse_args()

    dsn_raw = os.environ.get("WALINE_DATABASE_URL") or os.environ.get("DATABASE_URL") or ""
    if not dsn_raw.strip():
        print("WALINE_DATABASE_URL is not set", file=sys.stderr)
        return 2
    dsn = clean_dsn(dsn_raw)
    print("dsn shape:", dsn_shape(dsn_raw, dsn))
    if not dsn.startswith(("postgres://", "postgresql://")) and "=" not in dsn:
        print(
            "DSN 既不是 postgres:// URI 也不是 key=value 形式 —— secret 的值本身不对。"
            "去 GitHub 仓库 Settings → Secrets and variables → Actions，"
            "把 WALINE_DATABASE_URL 重新粘成完整的一条 postgresql://... 连接串"
            "（首尾不要带换行，也不要带 DATABASE_URL= 前缀）。",
            file=sys.stderr,
        )
        return 2

    try:
        import psycopg  # noqa: F401
    except ImportError:
        print("psycopg is required: pip install 'psycopg[binary]'", file=sys.stderr)
        return 2

    data = read_db(dsn)
    print(f"read comments={len(data['comments'])} counters={len(data['counters'])} users={len(data['users'])}")
    if data["comments"]:
        print(f"comment id range: {data['comments'][0]['id']} .. {data['comments'][-1]['id']}")
    if data["users"]:
        prefixes: dict[str, int] = {}
        for u in data["users"]:
            key = (u["password"] or "")[:4] or "(empty)"
            prefixes[key] = prefixes.get(key, 0) + 1
        print("password hash prefixes:", json.dumps(prefixes, ensure_ascii=False))

    if args.push:
        if not args.token:
            print("WALINE_IMPORT_TOKEN is required for --push", file=sys.stderr)
            return 2
        # 哈希格式门禁：兼容层只实现了 phpass（$P$），别的算法导过去用户就登不上。
        odd = sorted({(u["password"] or "")[:4] or "(empty)" for u in data["users"]} - {"$P$"})
        if odd:
            print(
                "拒绝导入：用户密码哈希里出现非 phpass 前缀 " + json.dumps(odd, ensure_ascii=False)
                + "，兼容层验不了这些账号。确认要导就加 --allow-hash 重跑。",
                file=sys.stderr,
            )
            if not args.allow_hash:
                return 3
        push(data, args.push, args.token)
        return 0

    doc = {"v": 1, "exportedAt": now_iso(), "source": "waline-postgres", **data}
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(doc, ensure_ascii=False, indent=1 if args.pretty else None).encode("utf-8")
    if args.pretty:
        out.write_bytes(payload)
    else:
        with gzip.open(out, "wb", compresslevel=9) as fh:
            fh.write(payload)
    print(f"wrote {out} ({out.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

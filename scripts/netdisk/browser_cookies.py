# -*- coding: utf-8 -*-
"""从 Chromium 系浏览器（含 360 极速浏览器）的本地 profile 里读出指定域名的 cookie。

Windows 下 Chromium 用 AES-GCM(v10) 加密 cookie，密钥存在 Local State 的
os_crypt.encrypted_key 里，并再用 DPAPI 包了一层。这里用 ctypes 调
CryptUnprotectData 解 DPAPI，用 cryptography 的 AESGCM 解 cookie 本身。

浏览器开着时 Cookies 数据库是锁的，所以先复制到临时目录再读。

用法：
    python scripts/netdisk/browser_cookies.py --profile "<User Data 目录>" \
        --domain pan.quark.cn --domain pan.baidu.com --json out.json
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import ctypes
import json
import os
import shutil
import sqlite3
import sys
import tempfile
from ctypes import wintypes


class DATA_BLOB(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]


def dpapi_decrypt(data: bytes) -> bytes:
    if not data:
        return b""
    blob_in = DATA_BLOB(len(data), ctypes.cast(ctypes.create_string_buffer(data, len(data)),
                                               ctypes.POINTER(ctypes.c_char)))
    blob_out = DATA_BLOB()
    if not ctypes.windll.crypt32.CryptUnprotectData(
            ctypes.byref(blob_in), None, None, None, None, 0, ctypes.byref(blob_out)):
        raise OSError("CryptUnprotectData failed")
    try:
        return ctypes.string_at(blob_out.pbData, blob_out.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(blob_out.pbData)


def load_key(user_data_dir: str) -> bytes:
    ls = os.path.join(user_data_dir, "Local State")
    with open(ls, "r", encoding="utf-8") as f:
        state = json.load(f)
    enc = base64.b64decode(state["os_crypt"]["encrypted_key"])
    if enc[:5] == b"DPAPI":
        enc = enc[5:]
    return dpapi_decrypt(enc)


def decrypt_value(enc: bytes, key: bytes, host: str = "") -> str:
    if not enc:
        return ""
    if enc[:3] in (b"v10", b"v11"):
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        nonce, payload = enc[3:15], enc[15:]
        ct, tag = payload[:-16], payload[-16:]
        try:
            raw = AESGCM(key).decrypt(nonce, ct + tag, None)
        except Exception:
            return ""
        # 新版 Chromium（360 极速 X 用的就是）在明文前塞了 32 字节 sha256(host)，
        # 不剥掉会让 SUB/SESSDATA 这类值变成二进制脏数据。
        if host and len(raw) > 32 and raw[:32] == hashlib.sha256(host.encode()).digest():
            raw = raw[32:]
        return raw.decode("latin-1")
    if enc[:3] == b"v20":
        # App-Bound Encryption：需要浏览器进程内的服务解密，静态解不开
        return ""
    try:  # 极老的库直接明文
        return enc.decode("latin-1")
    except Exception:
        return ""


def find_db(user_data_dir: str, profile: str = "Default") -> str:
    """定位 cookie 库。有的客户端（百度网盘、迅雷）直接把 Network/Cookies 放在根目录。"""
    base = os.path.join(user_data_dir, profile) if profile else user_data_dir
    for cand in (os.path.join(base, "Network", "Cookies"), os.path.join(base, "Cookies")):
        if os.path.exists(cand):
            return cand
    return ""


def read_cookies(user_data_dir: str, profile: str = "Default") -> list[dict]:
    db = find_db(user_data_dir, profile)
    if not db:
        return []
    tmp = tempfile.mkdtemp(prefix="ck_")
    copy = os.path.join(tmp, "Cookies")
    shutil.copy2(db, copy)
    key = load_key(user_data_dir)
    out = []
    con = sqlite3.connect(copy)
    con.text_factory = bytes
    try:
        rows = con.execute(
            "SELECT host_key, name, path, expires_utc, is_secure, is_httponly, "
            "value, CAST(encrypted_value AS BLOB) FROM cookies").fetchall()
        rows = [(h.decode("utf-8", "replace"), n.decode("utf-8", "replace"),
                 p.decode("utf-8", "replace"), e, s, o,
                 (v or b"").decode("latin-1") if isinstance(v, bytes) else v, ev)
                for h, n, p, e, s, o, v, ev in rows]
    except sqlite3.DatabaseError as e:
        print(f"读 cookie 库失败: {e}", file=sys.stderr)
        rows = []
    finally:
        con.close()
        shutil.rmtree(tmp, ignore_errors=True)
    for host, name, path, expires, secure, httponly, value, enc in rows:
        val = value or decrypt_value(enc or b"", key, host)
        if not val:
            continue
        out.append({"host": host, "name": name, "value": val, "path": path or "/",
                    "secure": bool(secure), "httpOnly": bool(httponly),
                    "expires": expires})
    return out


def match(cookies: list[dict], domain: str) -> list[dict]:
    domain = domain.lstrip(".")
    return [c for c in cookies
            if c["host"].lstrip(".") == domain or c["host"].lstrip(".").endswith("." + domain)]


def cookie_header(cookies: list[dict]) -> str:
    seen = {}
    for c in cookies:
        seen[c["name"]] = c["value"]
    return "; ".join(f"{k}={v}" for k, v in seen.items())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", required=True, help="Chromium 的 User Data 目录")
    ap.add_argument("--sub", default="Default", help="profile 子目录，默认 Default")
    ap.add_argument("--domain", action="append", default=[])
    ap.add_argument("--json", default="")
    args = ap.parse_args()

    if not os.path.isdir(args.profile):
        sys.exit(f"目录不存在: {args.profile}")
    all_ck = read_cookies(args.profile, args.sub)
    print(f"# 共解出 {len(all_ck)} 条 cookie（{args.profile}/{args.sub}）", file=sys.stderr)

    result = {}
    for d in args.domain:
        got = match(all_ck, d)
        result[d] = {"count": len(got), "names": sorted({c["name"] for c in got}),
                     "header": cookie_header(got)}
        print(f"  {d}: {len(got)} 条 -> {', '.join(sorted({c['name'] for c in got})[:12])}",
              file=sys.stderr)
    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=1)
        os.chmod(args.json, 0o600)
        print(f"# 写入 {args.json}", file=sys.stderr)
    else:
        print(json.dumps(result, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()

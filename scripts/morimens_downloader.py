#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MoriMens 第 69 期 Top1000 自动下载器。

流程：
  1. 读取 cookies.txt，创建带 Cookie 的 Session。
  2. 自动调用 Eremora 榜单接口：
       /api/rank?board=abyss&start={start}&end={end}
     按 50 名一页抓取第 69 期 Top1000 UID。
  3. 将 Top1000 详情 URL 按排名写入 urls.txt。
  4. 逐条下载 __data.json：
       - HTTP 429：暂停 10 分钟，然后重试同一请求；429 不消耗普通重试次数。
       - HTTP 403：立即停止整个程序，不再继续下载。
       - 本地文件与远端 JSON 数据完全一致：跳过写入。
       - 数据不一致：原子覆盖更新。
       - 本地不存在：新建。

使用：
  把本脚本和 cookies.txt 放在同一目录，运行：
      python morimens_downloader.py

输出：
  urls.txt
  morimens_data/eremora.com/u/<uid>/challenges/dzone/69/__data.json
"""

import json
import os
import random
import sys
import time
from http.cookiejar import MozillaCookieJar
from typing import Any
from urllib.parse import urlencode, urlsplit

import requests


# ========== 配置区 ==========
SEASON = 69
TOP_N = 1000
PAGE_SIZE = 50

ORIGIN = "https://eremora.com"
RANK_API = f"{ORIGIN}/api/rank"
DETAIL_URL_TEMPLATE = f"{ORIGIN}/u/{{uid}}/challenges/dzone/{{season}}/__data.json"

URLS_FILE = "urls.txt"
COOKIES_FILE = "cookies.txt"
SAVE_DIR = "morimens_data"

DELAY = 1.2
RETRY = 4
TIMEOUT = 35
RATE_LIMIT_WAIT = 10 * 60
# ===========================

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/132.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": f"{ORIGIN}/leaderboard/abyss",
}


class ForbiddenStop(RuntimeError):
    """遇到 403 时立即终止整个同步流程。"""


def load_cookies(session: requests.Session, path: str) -> int:
    with open(path, encoding="utf-8-sig", errors="replace") as f:
        content = f.read()

    try:
        cj = MozillaCookieJar(path)
        cj.load(ignore_discard=True, ignore_expires=True)
        if len(cj) > 0:
            session.cookies.update(cj)
            return len(cj)
    except Exception:
        pass

    try:
        data = json.loads(content)
        if isinstance(data, list):
            n = 0
            for c in data:
                if not isinstance(c, dict) or "name" not in c or "value" not in c:
                    continue
                domain = str(c.get("domain", "eremora.com")).lstrip(".")
                try:
                    exp = int(c.get("expirationDate", c.get("expires", 0)))
                except (TypeError, ValueError):
                    exp = 0
                ck = requests.cookies.create_cookie(
                    domain=domain,
                    name=str(c["name"]),
                    value=str(c["value"]),
                    path=str(c.get("path", "/")),
                    expires=(exp if exp and exp > 0 else None),
                    secure=bool(c.get("secure", False)),
                    rest={"HttpOnly": bool(c.get("httpOnly", False))},
                )
                session.cookies.set_cookie(ck)
                n += 1
            if n:
                return n
    except Exception:
        pass

    if "=" in content and ";" in content:
        n = 0
        for p in content.split(";"):
            if "=" not in p:
                continue
            k, v = p.split("=", 1)
            k, v = k.strip(), v.strip()
            if k and k.lower() not in {
                "path", "domain", "expires", "max-age",
                "samesite", "secure", "httponly",
            }:
                session.cookies.set(k, v, domain="eremora.com", path="/")
                n += 1
        if n:
            return n

    n = 0
    for ln in content.splitlines():
        ln = ln.strip()
        if not ln or ln.startswith("#"):
            continue
        parts = ln.split("\t")
        if len(parts) < 6:
            continue
        domain, _sub, cookie_path, secure_flag, expires, name = parts[:6]
        value = parts[6] if len(parts) > 6 else ""
        try:
            exp = int(float(expires)) if expires and expires != "0" else 0
        except (TypeError, ValueError):
            exp = 0
        ck = requests.cookies.create_cookie(
            domain=domain,
            name=name,
            value=value,
            path=cookie_path,
            expires=(exp if exp and exp > 0 else None),
            secure=(secure_flag.lower() == "true"),
        )
        session.cookies.set_cookie(ck)
        n += 1
    if n:
        return n

    print(f"[错误] 无法识别 {path} 的 Cookie 格式。")
    sys.exit(1)


def load_session() -> requests.Session:
    if not os.path.exists(COOKIES_FILE):
        print(f"[错误] 找不到 {COOKIES_FILE}，请先导出 Eremora Cookie。")
        sys.exit(1)

    session = requests.Session()
    n = load_cookies(session, COOKIES_FILE)
    session.headers.update(HEADERS)
    print(f"已加载 {n} 条 Cookie")
    return session


def sleep_after_429(context: str) -> None:
    print(f"{context} HTTP 429 限流")
    print(f"  → 暂停 {RATE_LIMIT_WAIT // 60} 分钟，然后重试同一请求")
    time.sleep(RATE_LIMIT_WAIT)


def request_json_with_policy(
    session: requests.Session,
    url: str,
    *,
    context: str,
) -> tuple[requests.Response, Any]:
    attempt = 1
    while attempt <= RETRY:
        try:
            response = session.get(url, timeout=TIMEOUT)
        except requests.RequestException as exc:
            print(f"{context} 网络错误: {exc}（第 {attempt}/{RETRY} 次）")
            if attempt >= RETRY:
                raise
            time.sleep(DELAY * attempt)
            attempt += 1
            continue

        if response.status_code == 403:
            raise ForbiddenStop(f"{context} HTTP 403: {url}")

        if response.status_code == 429:
            sleep_after_429(context)
            continue

        if response.status_code != 200:
            print(
                f"{context} HTTP {response.status_code} "
                f"（第 {attempt}/{RETRY} 次）"
            )
            if attempt >= RETRY:
                raise RuntimeError(
                    f"{context} 请求失败: HTTP {response.status_code}: {url}"
                )
            time.sleep(DELAY * attempt)
            attempt += 1
            continue

        try:
            payload = response.json()
        except ValueError as exc:
            preview = response.text[:160].replace("\n", " ")
            print(
                f"{context} 返回的不是 JSON（第 {attempt}/{RETRY} 次）: "
                f"{preview!r}"
            )
            if attempt >= RETRY:
                raise RuntimeError(f"{context} 返回无效 JSON: {url}") from exc
            time.sleep(DELAY * attempt)
            attempt += 1
            continue

        return response, payload

    raise RuntimeError(f"{context} 请求失败: {url}")


def fetch_top1000_urls(session: requests.Session) -> list[str]:
    print(f"\n===== 获取第 {SEASON} 期 Top {TOP_N} UID =====")

    by_rank: dict[int, str] = {}
    uid_to_rank: dict[str, int] = {}

    for start in range(1, TOP_N + 1, PAGE_SIZE):
        end = min(TOP_N, start + PAGE_SIZE - 1)
        query = urlencode({"board": "abyss", "start": start, "end": end})
        url = f"{RANK_API}?{query}"
        _response, payload = request_json_with_policy(
            session,
            url,
            context=f"[榜单 {start}-{end}]",
        )

        rows = payload.get("rows") if isinstance(payload, dict) else payload
        if not isinstance(rows, list):
            raise RuntimeError(
                f"榜单 {start}-{end} 返回格式异常：缺少 rows 数组"
            )

        accepted = 0
        for row in rows:
            if not isinstance(row, dict):
                continue

            try:
                rank = int(row.get("rank"))
            except (TypeError, ValueError):
                continue

            uid_raw = row.get("uid")
            if uid_raw is None:
                continue
            uid = str(uid_raw).strip()
            if not uid or not uid.isdigit():
                continue

            season_raw = row.get("dzone_season", row.get("dzoneSeason"))
            if season_raw is not None:
                try:
                    row_season = int(season_raw)
                except (TypeError, ValueError):
                    row_season = None
                if row_season is not None and row_season != SEASON:
                    continue

            if not (1 <= rank <= TOP_N):
                continue

            old_rank = uid_to_rank.get(uid)
            if old_rank is not None and old_rank != rank:
                keep = min(old_rank, rank)
                drop = max(old_rank, rank)
                by_rank.pop(drop, None)
                by_rank[keep] = uid
                uid_to_rank[uid] = keep
            else:
                by_rank[rank] = uid
                uid_to_rank[uid] = rank
            accepted += 1

        print(f"[榜单 {start}-{end}] 接收 {accepted} 条，第 {SEASON} 期累计 {len(by_rank)} 条")
        if end < TOP_N:
            time.sleep(DELAY + random.uniform(0, 0.25))

    missing = [rank for rank in range(1, TOP_N + 1) if rank not in by_rank]
    unique_uids = {uid for uid in by_rank.values()}

    if missing or len(by_rank) != TOP_N or len(unique_uids) != TOP_N:
        sample = ", ".join(map(str, missing[:30]))
        if len(missing) > 30:
            sample += ", ..."
        raise RuntimeError(
            f"Top{TOP_N} UID 不完整：名次={len(by_rank)}/{TOP_N}，"
            f"唯一 UID={len(unique_uids)}/{TOP_N}，缺失名次: {sample or '无'}。"
            "为避免生成不完整 urls.txt，本次停止。"
        )

    urls = [
        DETAIL_URL_TEMPLATE.format(uid=by_rank[rank], season=SEASON)
        for rank in range(1, TOP_N + 1)
    ]

    tmp = URLS_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        for url in urls:
            f.write(url + "\n")
    os.replace(tmp, URLS_FILE)

    print(f"已生成 {URLS_FILE}：{len(urls)} 条 URL")
    return urls


def output_path_for_url(url: str) -> str:
    parts = urlsplit(url)
    rel = os.path.join(parts.netloc, parts.path.lstrip("/"))
    return os.path.join(SAVE_DIR, rel)


def json_data_equal(local_bytes: bytes, remote_bytes: bytes) -> bool:
    try:
        local_obj = json.loads(local_bytes.decode("utf-8-sig"))
        remote_obj = json.loads(remote_bytes.decode("utf-8-sig"))
        return local_obj == remote_obj
    except (UnicodeDecodeError, json.JSONDecodeError):
        return local_bytes == remote_bytes


def save_atomic(path: str, content: bytes) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "wb") as f:
        f.write(content)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def download_one(
    session: requests.Session,
    url: str,
    *,
    index: int,
    total: int,
) -> str:
    out = output_path_for_url(url)
    rel = os.path.relpath(out, SAVE_DIR)

    attempt = 1
    while attempt <= RETRY:
        try:
            response = session.get(url, timeout=TIMEOUT)
        except requests.RequestException as exc:
            print(
                f"[{index}/{total}] 网络错误 {exc} "
                f"（第 {attempt}/{RETRY} 次）: {rel}"
            )
            if attempt >= RETRY:
                raise
            time.sleep(DELAY * attempt)
            attempt += 1
            continue

        if response.status_code == 403:
            raise ForbiddenStop(
                f"[{index}/{total}] HTTP 403，被 Eremora 拦截: {rel}"
            )

        if response.status_code == 429:
            sleep_after_429(f"[{index}/{total}] {rel}")
            continue

        if response.status_code != 200:
            print(
                f"[{index}/{total}] HTTP {response.status_code} "
                f"（第 {attempt}/{RETRY} 次）: {rel}"
            )
            if attempt >= RETRY:
                raise RuntimeError(
                    f"HTTP {response.status_code}: {url}"
                )
            time.sleep(DELAY * attempt)
            attempt += 1
            continue

        remote = response.content
        try:
            json.loads(remote.decode("utf-8-sig"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            preview = response.text[:160].replace("\n", " ")
            print(
                f"[{index}/{total}] 200 但内容不是有效 JSON "
                f"（第 {attempt}/{RETRY} 次）: {preview!r}"
            )
            if attempt >= RETRY:
                raise RuntimeError(f"无效 JSON: {url}")
            time.sleep(DELAY * attempt)
            attempt += 1
            continue

        if os.path.exists(out):
            try:
                with open(out, "rb") as f:
                    local = f.read()
            except OSError:
                local = b""

            if local and json_data_equal(local, remote):
                print(
                    f"[{index}/{total}] 跳过(数据一致): {rel} "
                    f"({len(remote)} 字节)"
                )
                return "unchanged"

            save_atomic(out, remote)
            print(
                f"[{index}/{total}] 更新: {rel} "
                f"({len(local)} → {len(remote)} 字节)"
            )
            return "updated"

        save_atomic(out, remote)
        print(f"[{index}/{total}] 新建: {rel} ({len(remote)} 字节)")
        return "created"

    raise RuntimeError(f"下载失败: {url}")


def main() -> int:
    session = load_session()
    os.makedirs(SAVE_DIR, exist_ok=True)

    try:
        urls = fetch_top1000_urls(session)
    except ForbiddenStop as exc:
        print(f"\n[停止] {exc}")
        print("检测到 403，按配置立即停止，不继续生成/下载数据。")
        return 2
    except Exception as exc:
        print(f"\n[错误] Top1000 UID 获取失败: {exc}")
        return 1

    created = updated = unchanged = failed = 0

    print(f"\n===== 下载第 {SEASON} 期 Top {len(urls)} =====")
    for i, url in enumerate(urls, 1):
        try:
            result = download_one(session, url, index=i, total=len(urls))
            if result == "created":
                created += 1
            elif result == "updated":
                updated += 1
            elif result == "unchanged":
                unchanged += 1
        except ForbiddenStop as exc:
            print(f"\n[停止] {exc}")
            print("检测到 403，立即停止整个下载流程。")
            print(
                f"当前统计：新建 {created}，更新 {updated}，"
                f"一致跳过 {unchanged}，失败 {failed}"
            )
            return 2
        except Exception as exc:
            failed += 1
            print(f"[{i}/{len(urls)}] 失败: {exc}")

        time.sleep(DELAY + random.uniform(0, 0.3))

    print("\n===== 完成 =====")
    print(
        f"新建: {created}  更新: {updated}  "
        f"跳过(数据一致): {unchanged}  失败: {failed}"
    )
    print(f"URL 清单: {os.path.abspath(URLS_FILE)}")
    print(f"数据目录: {os.path.abspath(SAVE_DIR)}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

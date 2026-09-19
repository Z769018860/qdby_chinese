#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MoriMens 第 69 期 Top1000 自动下载器。

流程：
  1. 读取 cookies.txt，创建带 Cookie 的 Session。
  2. 自动调用 Eremora 榜单接口：
       /api/rank?board=abyss&start={start}&end={end}
     按 50 名一页抓取当前 Abyss Top1000 UID；不使用 dzone_season 过滤榜单行。
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
PAGE_VALIDATE_RETRY = 4

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
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
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


def _parse_rank_page_rows(payload: Any, start: int, end: int) -> tuple[dict[int, str], dict[str, int]]:
    rows = payload.get("rows") if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        raise RuntimeError(f"榜单 {start}-{end} 返回格式异常：缺少 rows 数组")

    page: dict[int, str] = {}
    season_meta: dict[str, int] = {}

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

        # 只接受本次请求区间内的名次。
        # 注意：dzone_season 不是“当前榜单所属赛季”的可靠过滤条件。
        # Eremora 当前 Abyss 榜单中可能出现 dzone_season=68 的玩家，
        # 但其 rank 仍然属于当前榜单。因此这里只记录该字段用于诊断，
        # 不再因为它不是 69 而丢弃 UID。
        if not (start <= rank <= end):
            continue

        raw_season = row.get("dzone_season", row.get("dzoneSeason"))
        if raw_season is not None:
            try:
                key = str(int(raw_season))
            except (TypeError, ValueError):
                key = "unknown"
            season_meta[key] = season_meta.get(key, 0) + 1

        if rank in page and page[rank] != uid:
            raise RuntimeError(
                f"榜单 {start}-{end} 同一 rank={rank} 返回多个 UID："
                f"{page[rank]} / {uid}"
            )
        page[rank] = uid

    return page, season_meta


def fetch_rank_page(
    session: requests.Session,
    start: int,
    end: int,
) -> dict[int, str]:
    expected_ranks = set(range(start, end + 1))
    last_error = None

    for validate_attempt in range(1, PAGE_VALIDATE_RETRY + 1):
        # Eremora/Cloudflare 偶尔会对不同 start/end 返回重复旧页。
        # 加一个无语义 cache-buster，并同时发送 no-cache 请求头。
        params = {
            "board": "abyss",
            "start": start,
            "end": end,
            "_": f"{int(time.time() * 1000)}-{validate_attempt}-{random.randint(1000, 9999)}",
        }
        url = f"{RANK_API}?{urlencode(params)}"
        _response, payload = request_json_with_policy(
            session,
            url,
            context=f"[榜单 {start}-{end}]",
        )

        try:
            page, season_meta = _parse_rank_page_rows(payload, start, end)
        except RuntimeError as exc:
            last_error = exc
            page = {}
            season_meta = {}

        actual_ranks = set(page)
        missing = sorted(expected_ranks - actual_ranks)
        extra = sorted(actual_ranks - expected_ranks)
        unique_uids = set(page.values())

        if (
            actual_ranks == expected_ranks
            and len(page) == (end - start + 1)
            and len(unique_uids) == len(page)
        ):
            meta_text = (
                ", ".join(f"dzone_season={k}:{v}" for k, v in sorted(season_meta.items()))
                if season_meta else "无 dzone_season 元数据"
            )
            print(
                f"[榜单 {start}-{end}] 有效 {len(page)} 条 "
                f"({meta_text})"
            )
            return page

        returned = sorted(actual_ranks)
        if returned:
            returned_desc = f"{returned[0]}-{returned[-1]} / {len(returned)} 条"
        else:
            # 如果 API 返回了 rows，但全都落在错误区间，这里明确显示“0 条有效”。
            raw_rows = payload.get("rows") if isinstance(payload, dict) else payload
            raw_count = len(raw_rows) if isinstance(raw_rows, list) else 0
            returned_desc = f"0 条有效（原始 rows={raw_count}）"

        last_error = RuntimeError(
            f"榜单 {start}-{end} 页面校验失败：返回 {returned_desc}，"
            f"缺失 {len(missing)} 个名次"
            + (f"，异常名次 {extra[:10]}" if extra else "")
        )
        print(
            f"[榜单 {start}-{end}] 疑似重复页/缓存旧页，"
            f"第 {validate_attempt}/{PAGE_VALIDATE_RETRY} 次校验失败："
            f"{last_error}"
        )

        if validate_attempt < PAGE_VALIDATE_RETRY:
            time.sleep(max(DELAY * 2, 2.0) + random.uniform(0, 0.5))

    raise last_error or RuntimeError(f"榜单 {start}-{end} 获取失败")


def fetch_top1000_urls(session: requests.Session) -> list[str]:
    print(f"\n===== 获取当前 Abyss Top {TOP_N} UID（详情目标赛季 {SEASON}） =====")

    by_rank: dict[int, str] = {}

    for start in range(1, TOP_N + 1, PAGE_SIZE):
        end = min(TOP_N, start + PAGE_SIZE - 1)
        page = fetch_rank_page(session, start, end)

        overlap = set(by_rank) & set(page)
        if overlap:
            raise RuntimeError(
                f"榜单分页发生 rank 重叠：{sorted(overlap)[:20]}"
            )

        by_rank.update(page)
        print(
            f"[榜单 {start}-{end}] 写入 {len(page)} 条，"
            f"Top{TOP_N} 累计 {len(by_rank)} 条"
        )

        if end < TOP_N:
            time.sleep(DELAY + random.uniform(0, 0.25))

    missing = [rank for rank in range(1, TOP_N + 1) if rank not in by_rank]

    uid_ranks: dict[str, list[int]] = {}
    for rank, uid in by_rank.items():
        uid_ranks.setdefault(uid, []).append(rank)
    duplicate_uids = {
        uid: ranks for uid, ranks in uid_ranks.items() if len(ranks) > 1
    }

    if missing or len(by_rank) != TOP_N or duplicate_uids:
        sample = ", ".join(map(str, missing[:30]))
        if len(missing) > 30:
            sample += ", ..."
        dup_sample = list(duplicate_uids.items())[:10]
        raise RuntimeError(
            f"Top{TOP_N} UID 不完整：名次={len(by_rank)}/{TOP_N}，"
            f"唯一 UID={len(uid_ranks)}/{TOP_N}，"
            f"缺失名次: {sample or '无'}，"
            f"重复 UID: {dup_sample or '无'}。"
            "为避免生成错误 urls.txt，本次停止。"
        )

    # 榜单 UID 来自“当前 Abyss Top1000”，详情 URL 明确固定到第 69 期。
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

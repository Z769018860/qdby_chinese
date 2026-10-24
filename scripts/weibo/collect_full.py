# -*- coding: utf-8 -*-
"""登录态微博全量采集（Python 版，替代 collect_weibo.mjs 的 CDP 翻页）

为什么另写一份：
  · m.weibo.cn 的时间线翻页要求登录，未登录 page>=2 一律 ok:-100。
    登录态从 360 极速浏览器的 cookie 库解密得到（scripts/netdisk/browser_cookies.py），
    cookie 值里可能有非 UTF-8 字节，走 CDP 注入会被转码破坏，
    直接用 requests 发 Cookie 头（latin-1 一字节对一字节）才可靠。
  · 4018 条全量翻页 + 逐条补全要跑很久，必须能断点续跑、能只补关键条目。

流程：
  1) 翻页抓主页全量（page=1..N），只留作者本人的博文，增量合并进 weibo_posts.json
  2) 只对「repo / 汉化发布 / 安利 / 长文 / 多图」的条目调
     /statuses/show 补全图片、/statuses/extend 补全文（4000 条全补是浪费）

用法：
  python scripts/weibo/collect_full.py --uid 5082872852 --pages 400
  python scripts/weibo/collect_full.py --enrich-only        # 只补全，不翻页
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import random
import requests

BASE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(BASE, '..', '..'))
WORK = os.path.normpath(os.path.join(REPO, '..'))
RAW = os.path.join(WORK, 'raw')
OUT = os.path.join(RAW, 'weibo_posts.json')
CK_FILE = os.environ.get('QD_CK_FILE') or os.path.join(WORK, 'ck360_all.json')

AUTHOR = os.environ.get('QD_WB_AUTHOR', '青灯不弈')
UA = ('Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 '
      '(KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1')

# 值得花一次请求去补全的：repo / 汉化发布 / 安利，或者页面正文里明确有长文分页
NEED_RE = re.compile(
    r'repo|通关|打完|通了|推完|玩完|通完|全结局|全线|结局|感想|评测|测评|玩后感|吐槽|简评'
    r'|记录一下|剧透|评分|打分|体验|进度'
    r'|自汉化|汉化补丁|汉化发布|机翻|翻译补丁|汉化版|补丁地址|汉化名'
    r'|安利|推荐|入坑|推游|强烈建议|不容错过|值得一玩', re.I)


def cookie_header() -> str:
    with open(CK_FILE, encoding='utf-8') as f:
        ck = json.load(f)
    d = {}
    for c in ck:
        if c['host'].lstrip('.').endswith('weibo.cn'):
            d[c['name']] = c['value']
    return '; '.join(f'{k}={v}' for k, v in d.items())


def session() -> requests.Session:
    s = requests.Session()
    s.headers.update({
        'Cookie': cookie_header(),
        'User-Agent': UA,
        'MWeibo-Pwa': '1',
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://m.weibo.cn/',
    })
    return s


def strip(s: str) -> str:
    s = re.sub(r'<br\s*/?>', '\n', s or '')
    s = re.sub(r'<[^>]+>', '', s)
    return s.replace('\u200b', '').strip()


def pics_of(m: dict) -> list[str]:
    out = []
    for p in m.get('pics') or []:
        big = (p.get('large') or {}).get('url') or p.get('url') or ''
        if big:
            out.append(big)
    return out


def record(m: dict) -> dict:
    mid = str(m.get('id'))
    return {
        'id': mid,
        'mid': str(m.get('mid') or mid),
        'bid': m.get('bid') or '',
        'created': m.get('created_at') or '',
        'source': strip(m.get('source') or ''),
        'text': strip(m.get('text') or ''),
        'pics': pics_of(m),
        'reposts': m.get('reposts_count') or 0,
        'comments': m.get('comments_count') or 0,
        'likes': m.get('attitudes_count') or 0,
        'isLong': bool(m.get('isLongText')),
        'retweeted': strip((m.get('retweeted_status') or {}).get('text') or '')[:400],
        'retweetedUser': ((m.get('retweeted_status') or {}).get('user') or {}).get('screen_name') or '',
        'hasVideo': bool((m.get('page_info') or {}).get('type') == 'video'),
        'videoUrl': (m.get('page_info') or {}).get('page_url') or '',
        'enriched': False,
    }


def merge(store: dict, rec: dict) -> bool:
    old = store.get(rec['id'])
    if not old:
        store[rec['id']] = rec
        return True
    # 已有的补全结果不能被列表页的残缺版本覆盖
    if len(rec['pics']) > len(old.get('pics') or []):
        old['pics'] = rec['pics']
    for k in ('reposts', 'comments', 'likes'):
        old[k] = max(old.get(k) or 0, rec[k])
    if rec['hasVideo'] and not old.get('hasVideo'):
        old['hasVideo'], old['videoUrl'] = True, rec['videoUrl']
    if rec['isLong']:
        old['isLong'] = True
    return False


def save(store: dict) -> None:
    os.makedirs(RAW, exist_ok=True)
    data = sorted(store.values(), key=lambda x: -int(x['id']))
    tmp = OUT + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, OUT)


def walk_cards(arr, out):
    for k in arr or []:
        if k.get('mblog'):
            out.append(k['mblog'])
        if k.get('card_group'):
            walk_cards(k['card_group'], out)
        if k.get('cards'):
            walk_cards(k['cards'], out)


def get_json(s, url, tries=3):
    for i in range(tries):
        try:
            r = s.get(url, timeout=30)
            if r.status_code == 200:
                try:
                    return r.json()
                except Exception:
                    return {'ok': -9, 'raw': r.text[:120]}
            time.sleep(2 + i * 2)
        except Exception as e:
            time.sleep(2 + i * 2)
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--uid', default='5082872852')
    ap.add_argument('--pages', type=int, default=400)
    ap.add_argument('--enrich-only', action='store_true')
    ap.add_argument('--enrich', default='hit', choices=['hit', 'all', 'none'])
    ap.add_argument('--max-enrich', type=int, default=100000)
    args = ap.parse_args()

    store = {}
    if os.path.exists(OUT):
        for p in json.load(open(OUT, encoding='utf-8')):
            store[str(p['id'])] = p
    print(f'已有 {len(store)} 条 -> {OUT}', flush=True)

    s = session()

    if not args.enrich_only:
        empty = 0
        added = 0
        for page in range(1, args.pages + 1):
            url = f'https://m.weibo.cn/api/container/getIndex?containerid=107603{args.uid}&page={page}'
            j = get_json(s, url)
            if not j or j.get('ok') != 1:
                empty += 1
                print(f'  第 {page} 页 ok={j and j.get("ok")}，跳过（{empty}/2）', flush=True)
                if empty >= 2:
                    break
                time.sleep(3)
                continue
            empty = 0
            cards = []
            walk_cards((j.get('data') or {}).get('cards'), cards)
            if not cards:
                break
            for m in cards:
                if ((m.get('user') or {}).get('screen_name')) != AUTHOR:
                    continue
                if merge(store, record(m)):
                    added += 1
            if page % 10 == 0 or page == 1:
                save(store)
                print(f'[第 {page} 页] 累计 {len(store)} 条（新增 {added}）', flush=True)
            time.sleep(0.6 + random.random() * 0.5)
        save(store)
        print(f'翻页结束：{len(store)} 条（新增 {added}）', flush=True)

    # ---------- 补全 ----------
    todo = [p for p in store.values() if not p.get('enriched')]
    if args.enrich != 'all':
        todo = [p for p in todo
                if NEED_RE.search(p.get('text') or '') or p.get('isLong')
                or len(p.get('pics') or []) >= 2]
    todo = todo[:args.max_enrich]
    print(f'待补全 {len(todo)} 条（enrich={args.enrich}）', flush=True)

    n = 0
    for p in todo:
        pid = p['id']
        try:
            r = s.get(f'https://m.weibo.cn/statuses/show?id={pid}', timeout=30)
            j = r.json()
            m = j.get('data') if j.get('ok') == 1 else None
            if m:
                pics = pics_of(m)
                if len(pics) >= len(p.get('pics') or []):
                    p['pics'] = pics
                t = strip(m.get('text') or '')
                if t:
                    p['text'] = t
                p['isLong'] = bool(m.get('isLongText'))
                if (m.get('page_info') or {}).get('type') == 'video':
                    p['hasVideo'] = True
                    p['videoUrl'] = (m.get('page_info') or {}).get('page_url') or p.get('videoUrl') or ''
                for k, src in (('reposts', 'reposts_count'), ('comments', 'comments_count'),
                               ('likes', 'attitudes_count')):
                    p[k] = m.get(src) or p.get(k) or 0
                rt = m.get('retweeted_status')
                if rt:
                    p['retweeted'] = strip(rt.get('text') or '')[:400]
                    p['retweetedUser'] = ((rt.get('user') or {}).get('screen_name')) or ''
                p['enriched'] = True
                if p['isLong']:
                    time.sleep(0.3)
                    r2 = s.get(f'https://m.weibo.cn/statuses/extend?id={pid}', timeout=30)
                    j2 = r2.json()
                    if j2.get('ok') == 1:
                        full = strip(((j2.get('data') or {}).get('longTextContent')) or '')
                        full = re.sub(r'\s*全文\s*$', '', full).strip()
                        if len(full) > len(p.get('text') or ''):
                            p['fullText'] = full
                if not p.get('fullText'):
                    p['fullText'] = p['text']
        except Exception as e:
            print(f'  补全失败 {pid}: {str(e)[:60]}', flush=True)
        n += 1
        if n % 20 == 0:
            save(store)
            picn = sum(len(x.get('pics') or []) for x in store.values())
            print(f'[补全 {n}/{len(todo)}] 图共 {picn} 张', flush=True)
        time.sleep(0.5 + random.random() * 0.4)

    save(store)
    picn = sum(len(x.get('pics') or []) for x in store.values())
    withpic = sum(1 for x in store.values() if x.get('pics'))
    print(f'完成：{len(store)} 条，有图 {withpic} 条 / {picn} 张', flush=True)


if __name__ == '__main__':
    main()

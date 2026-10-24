# -*- coding: utf-8 -*-
"""每日内容增量：微博（repo）与 B 站投稿（视频）各自抓新 → 重建站点数据

为什么单独一个脚本：网盘巡检（daily_check.py）只管链接死活，
repo 与视频是「内容」侧，数据源完全不同，但同样需要每天更新一次——
否则新发的微博、新投的视频要等人工跑全量才出现。

流程（每步失败都不中断，最后统一汇报）：
  1. 微博：collect_full.py 翻最新 N 页（增量合并，已存在的按 id 跳过）
  2. build_weibo.py：重新分类 → data/weibo.json（转发已剔除，安利并入 repo）
  3. 投稿：up_app.py 走 App 签名接口，翻到整页无新增就停
  4. 新投稿缺简介的，用 web-interface/view 补一条 desc（build_games 靠它认游戏）
  5. build_games.py → data/games.json（把微博里只有微博的游戏一起并进来）
  6. build_videos.py → data/videos.json

用法：
  python scripts/daily_content.py                 # 默认：微博 3 页 + 投稿 5 页
  python scripts/daily_content.py --weibo-pages 8 --bili-pages 10
  python scripts/daily_content.py --no-weibo      # 只同步投稿
  python scripts/daily_content.py --no-bili
  python scripts/daily_content.py --full          # 全量（微博 400 页、投稿 80 页）
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.environ.get('QD_REPO') or os.path.normpath(os.path.join(HERE, '..'))
WORK = os.path.normpath(os.path.join(REPO, '..'))
RAW = os.environ.get('QD_CACHE') or os.path.join(WORK, 'raw')
DESCS = os.path.join(RAW, 'descs.json')
VIDEOS = os.path.join(RAW, 'up_videos_all.json')
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36')


def run(script, *args, env=None, timeout=900):
    e = dict(os.environ)
    e['QD_REPO'] = REPO
    e['QD_CACHE'] = RAW
    if env:
        e.update(env)
    path = os.path.join(HERE, script)
    print('\n$ %s %s' % (script, ' '.join(args)), flush=True)
    t0 = time.time()
    try:
        r = subprocess.run([sys.executable, path, *args], cwd=REPO, env=e,
                           capture_output=True, text=True, encoding='utf-8', errors='replace',
                           timeout=timeout)
    except subprocess.TimeoutExpired:
        print('  ✗ 超时（%ds），跳过' % timeout)
        return False
    tail = (r.stdout or '').strip().splitlines()[-6:]
    for line in tail:
        print('  ' + line)
    if r.returncode != 0:
        print('  ✗ 退出码 %s' % r.returncode)
        print('  ' + (r.stderr or '').strip().splitlines()[-1][:300])
        return False
    print('  ✓ %.0fs' % (time.time() - t0))
    return True


def fill_descs(limit=60):
    """新投稿没有简介就没法认游戏，用公开接口补一条"""
    if not os.path.exists(VIDEOS):
        return 0
    descs = json.load(open(DESCS, encoding='utf-8')) if os.path.exists(DESCS) else {}
    vids = json.load(open(VIDEOS, encoding='utf-8'))
    todo = [v['bvid'] for v in vids if v['bvid'] not in descs][:limit]
    if not todo:
        print('\n简介：没有缺的')
        return 0
    try:
        import requests
    except ImportError:
        print('\n简介：没有 requests，跳过（用装了 requests 的 python 跑本脚本）')
        return 0
    s = requests.Session()
    s.headers.update({'User-Agent': UA, 'Referer': 'https://www.bilibili.com/'})
    n = 0
    for bv in todo:
        try:
            j = s.get('https://api.bilibili.com/x/web-interface/view',
                      params={'bvid': bv}, timeout=25).json()
            d = j.get('data') or {}
            if j.get('code') == 0 and d.get('desc') is not None:
                descs[bv] = {'desc': d.get('desc') or '', 'title': d.get('title') or '',
                             'pubdate': d.get('pubdate') or 0}
                n += 1
        except Exception:
            pass
        time.sleep(0.5)
    json.dump(descs, open(DESCS, 'w', encoding='utf-8'), ensure_ascii=False)
    print('\n简介：补了 %d 条（本次待补 %d）' % (n, len(todo)))
    return n


def main():
    ap = argparse.ArgumentParser(description='微博 + 投稿的每日增量同步')
    ap.add_argument('--weibo-pages', type=int, default=3)
    ap.add_argument('--bili-pages', type=int, default=5)
    ap.add_argument('--no-weibo', action='store_true')
    ap.add_argument('--no-bili', action='store_true')
    ap.add_argument('--full', action='store_true')
    args = ap.parse_args()

    os.makedirs(RAW, exist_ok=True)
    wb_pages = 400 if args.full else args.weibo_pages
    bl_pages = 80 if args.full else args.bili_pages
    ok = {}

    if not args.no_weibo:
        ok['微博抓取'] = run('weibo/collect_full.py', '--pages', str(wb_pages),
                          '--enrich', 'hit', '--max-enrich', '120' if args.full else '30')
        # 分类 + 关联 + 落 data/weibo.json；build_games 之后还会再跑一次合并
        ok['微博构建'] = run('weibo/build_weibo.py')
    if not args.no_bili:
        ok['投稿抓取'] = run('bili/up_app.py', env={'QD_MAX_PAGES': str(bl_pages)})
        if ok['投稿抓取']:
            fill_descs()
        ok['游戏库'] = run('bili/build_games.py')
        ok['视频构建'] = run('bili/build_videos.py')

    print('\n== 内容同步结果 ==')
    for k, v in ok.items():
        print(('  ✓ ' if v else '  ✗ ') + k)
    return 0 if all(ok.values()) else 1


if __name__ == '__main__':
    sys.exit(main())

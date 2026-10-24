# -*- coding: utf-8 -*-
"""把微博配图下载到本地，站内自托管

为什么必须这么做：
  · 无头浏览器里直接 <img src="https://wx1.sinaimg.cn/..."> 全部加载失败
    （拿 curl 请求同一个地址是 200，说明是浏览器这条链路被代理/防盗链挡住），
    页面上就是一排灰格子。
  · 微博图床对第三方站点有防盗链，靠 referrerpolicy 绕并不稳。

所以抓完微博就顺手把图拉下来，存成 assets/weibo/<hash>.jpg，页面引本地路径。
原图 URL 仍然保留在数据里，供「查看原图」跳到微博图床。

用法：
  python scripts/weibo/download_pics.py            # 只下缺的
  python scripts/weibo/download_pics.py --force    # 全部重下
  python scripts/weibo/download_pics.py --size mw690
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.environ.get('QD_REPO') or os.path.normpath(os.path.join(HERE, '..', '..'))
RAW = os.environ.get('QD_CACHE') or os.path.normpath(os.path.join(REPO, '..', 'raw'))
OUTDIR = os.path.join(REPO, 'assets', 'weibo')


def local_name(url, size):
    """同一个原图的 mw690 / mw2000 落到同一个文件名，方便去重"""
    base = url.split('/')[-1]
    stem = base.rsplit('.', 1)[0]
    return hashlib.md5(stem.encode('utf-8')).hexdigest()[:16] + '.jpg'


def sized(url, size):
    if size and '/mw' in url:
        head, rest = url.split('/mw', 1)
        tail = rest.split('/', 1)[1] if '/' in rest else ''
        return '%s/%s/%s' % (head, size, tail)
    return url


def fetch(url, dst, referer='https://m.weibo.cn/'):
    """用 curl：本机 curl 能通，浏览器链路不通"""
    tmp = dst + '.part'
    cmd = ['curl', '-sS', '-L', '--max-time', '30', '-o', tmp,
           '-H', 'User-Agent: Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) '
                 'AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
           '-e', referer, url]
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=40)
        if not os.path.exists(tmp) or os.path.getsize(tmp) < 512:
            if os.path.exists(tmp):
                os.remove(tmp)
            return 0
        os.replace(tmp, dst)
        return os.path.getsize(dst)
    except Exception:
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass
        return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--size', default='mw690', help='缩略图尺寸段，默认 mw690')
    ap.add_argument('--force', action='store_true')
    args = ap.parse_args()

    posts = json.load(open(os.path.join(RAW, 'weibo_posts.json'), encoding='utf-8'))
    urls = []
    for p in posts:
        for u in p.get('pics') or []:
            if u and u not in urls:
                urls.append(u)
    print('待处理图片 %d 张（%d 条微博）' % (len(urls), len(posts)))

    os.makedirs(OUTDIR, exist_ok=True)
    done = skip = fail = 0
    total = 0
    for i, u in enumerate(urls, 1):
        dst = os.path.join(OUTDIR, local_name(u, args.size))
        if os.path.exists(dst) and not args.force and os.path.getsize(dst) > 512:
            skip += 1
            total += os.path.getsize(dst)
            continue
        n = fetch(sized(u, args.size), dst)
        if n:
            done += 1
            total += n
        else:
            fail += 1
        if i % 20 == 0:
            print('  [%d/%d] 下载 %d 跳过 %d 失败 %d' % (i, len(urls), done, skip, fail))
        time.sleep(0.15)

    print('完成：下载 %d，跳过 %d，失败 %d，共 %.1f MB'
          % (done, skip, fail, total / 1024 / 1024))
    print('->', OUTDIR)


if __name__ == '__main__':
    sys.exit(main())

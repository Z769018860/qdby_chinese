# -*- coding: utf-8 -*-
"""把微博配图下载到本地、压小、站内自托管

为什么必须这么做：
  · 无头浏览器里直接 <img src="https://wx1.sinaimg.cn/..."> 全部加载失败
    （拿 curl 请求同一个地址是 200，说明是浏览器这条链路被代理/防盗链挡住），
    页面上就是一排灰格子。
  · 微博图床对第三方站点有防盗链，靠 referrerpolicy 绕并不稳。
  · 原图（mw2000）单张 500KB~1MB，三千多张就是 2GB+，静态站扛不住。

做法：
  1. 取 mw690（微博自己的 690px 压缩图，比 mw2000 小一个数量级）；
  2. 本地再用 Pillow 压一遍：长边不超过 --max-edge，JPEG 质量 --quality，
     progressive + optimize，去掉 EXIF（原图带的拍摄信息对展示没用，纯占体积）；
  3. 存成 assets/weibo/<hash>.jpg，页面引本地路径，原图 URL 仍留在数据里，
     「查看原图」还能跳回微博。

用法：
  python scripts/weibo/download_pics.py                 # 只下缺的（并发 8）
  python scripts/weibo/download_pics.py --force         # 全部重下重压
  python scripts/weibo/download_pics.py --max-edge 900 --quality 80
  python scripts/weibo/download_pics.py --kinds repo,release,promo   # 默认：只处理这三类
"""
import argparse
import hashlib
import io
import json
import os
import subprocess
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.environ.get('QD_REPO') or os.path.normpath(os.path.join(HERE, '..', '..'))
RAW = os.environ.get('QD_CACHE') or os.path.normpath(os.path.join(REPO, '..', 'raw'))
OUTDIR = os.path.join(REPO, 'assets', 'weibo')

UA = ('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) '
      'AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148')


def local_name(url):
    """同一个原图的 mw690 / mw2000 落到同一个文件名，方便去重"""
    stem = url.split('/')[-1].rsplit('.', 1)[0]
    return hashlib.md5(stem.encode('utf-8')).hexdigest()[:16] + '.jpg'


def sized(url, size):
    if size and '/mw' in url:
        head, rest = url.split('/mw', 1)
        tail = rest.split('/', 1)[1] if '/' in rest else ''
        return '%s/%s/%s' % (head, size, tail)
    return url


def fetch(url):
    """用 curl：本机 curl 能通，浏览器链路不通。直接进内存，不落临时文件"""
    cmd = ['curl', '-sS', '-L', '--max-time', '30',
           '-H', 'User-Agent: ' + UA, '-e', 'https://m.weibo.cn/', url]
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=40)
        if r.returncode != 0 or len(r.stdout) < 512:
            return None
        return r.stdout
    except Exception:
        return None


def shrink(raw, max_edge, quality):
    """返回 (jpeg字节, 原始尺寸, 压缩后尺寸)"""
    from PIL import Image
    im = Image.open(io.BytesIO(raw))
    src_size = im.size
    if im.mode in ('RGBA', 'LA', 'P'):
        im = im.convert('RGB')
    elif im.mode != 'RGB':
        im = im.convert('RGB')
    w, h = im.size
    long_edge = max(w, h)
    if long_edge > max_edge:
        scale = max_edge / long_edge
        im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))),
                       Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, 'JPEG', quality=quality, optimize=True, progressive=True)
    return buf.getvalue(), src_size, im.size


def one(u, args):
    dst = os.path.join(OUTDIR, local_name(u))
    if not args.force and os.path.exists(dst) and os.path.getsize(dst) > 512:
        return ('skip', os.path.getsize(dst), 0, 0)
    raw = fetch(sized(u, args.size))
    if not raw:
        return ('fail', 0, 0, 0)
    try:
        out, src_size, _ = shrink(raw, args.max_edge, args.quality)
    except Exception:
        # Pillow 打不开（极少见的老格式）就原样存，别丢图
        out, src_size = raw, (0, 0)
    tmp = dst + '.part'
    with open(tmp, 'wb') as f:
        f.write(out)
    os.replace(tmp, dst)
    return ('ok', len(out), len(raw), src_size[0])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--size', default='mw690', help='图床尺寸段，默认 mw690')
    ap.add_argument('--max-edge', type=int, default=700, help='长边上限，默认 700')
    ap.add_argument('--quality', type=int, default=74, help='JPEG 质量，默认 74')
    ap.add_argument('--workers', type=int, default=8)
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--kinds', default='repo,release,promo',
                    help='只处理这些分类的微博图片（逗号分隔，all=不筛）')
    args = ap.parse_args()

    posts = json.load(open(os.path.join(RAW, 'weibo_posts.json'), encoding='utf-8'))
    urls, seen = [], set()
    keep = None if args.kinds.strip().lower() == 'all' else {
        x.strip() for x in args.kinds.split(',') if x.strip()}
    sys.path.insert(0, HERE)
    import re
    from build_weibo import classify
    for p in posts:
        if keep is not None:
            t = re.sub(r'\s*(?:\.{2,}|…+)\s*全文\s*$', '', p.get('fullText') or p.get('text') or '').strip()
            if classify(t) not in keep:
                continue
        for u in p.get('pics') or []:
            if u and u not in seen:
                seen.add(u)
                urls.append(u)
    print('待处理图片 %d 张（%d 条微博）' % (len(urls), len(posts)), flush=True)

    os.makedirs(OUTDIR, exist_ok=True)
    done = skip = fail = 0
    out_bytes = raw_bytes = 0
    t0 = time.time()
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(one, u, args): u for u in urls}
        for i, f in enumerate(as_completed(futs), 1):
            st, ob, rb, _ = f.result()
            if st == 'ok':
                done += 1
                out_bytes += ob
                raw_bytes += rb
            elif st == 'skip':
                skip += 1
                out_bytes += ob
            else:
                fail += 1
            if i % 100 == 0:
                el = time.time() - t0
                print('  [%d/%d] 下载 %d 跳过 %d 失败 %d · %.1f MB · %.0fs'
                      % (i, len(urls), done, skip, fail, out_bytes / 1048576, el), flush=True)

    ratio = (raw_bytes / out_bytes) if out_bytes else 0
    print('完成：下载 %d，跳过 %d，失败 %d' % (done, skip, fail))
    print('产物 %.1f MB（源图 %.1f MB，压缩比 %.1fx）'
          % (out_bytes / 1048576, raw_bytes / 1048576, ratio))
    print('->', OUTDIR)


if __name__ == '__main__':
    sys.exit(main())

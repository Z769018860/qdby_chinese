#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""静态资源瘦身：背景图 / 标题贴纸 / 表格截图缩略图。

- assets/bg-left.webp、assets/bg-right.webp：2048px 装饰图，页面最多显示 620px 宽，
  缩到 1000px 再压一遍，视觉无差、体积降一个量级。
- assets/sticker-*.gif：300px 动图，页面显示 44px，缩到 128px（2x 视网膜够了）。
- images/thumbs/：给 data.json 里登记的截图生成小图（表格用），原图留给点击放大。

可重复执行：已是目标尺寸/已生成缩略图的文件会跳过。
用法：python scripts/optimize_static_assets.py
"""
import json
import os
import sys

from PIL import Image, ImageSequence

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'assets')
IMAGES = os.path.join(ROOT, 'images')
THUMBS = os.path.join(IMAGES, 'thumbs')

BG_MAX = 1000        # 背景图最长边
BG_QUALITY = 72
STICKER_MAX = 128    # 贴纸显示 44px，2x 再留余量
THUMB_MAX_W = 560    # 表格截图显示 ~200px 宽，560 足够放大弹层前的清晰度
THUMB_QUALITY = 66


def human(n):
    return '%.0fKB' % (n / 1024)


def resize_webp(path, max_edge, quality):
    im = Image.open(path)
    w, h = im.size
    if max(w, h) <= max_edge:
        print('  跳过（尺寸已达标）', os.path.relpath(path, ROOT), im.size)
        return
    scale = max_edge / max(w, h)
    im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    before = os.path.getsize(path)
    im.save(path, 'WEBP', quality=quality, method=6)
    after = os.path.getsize(path)
    print('  %s: %s -> %s' % (os.path.relpath(path, ROOT), human(before), human(after)))


def resize_gif(path, max_edge):
    im = Image.open(path)
    if max(im.size) <= max_edge:
        print('  跳过（尺寸已达标）', os.path.relpath(path, ROOT), im.size)
        return
    scale = max_edge / max(im.size)
    size = (max(1, round(im.size[0] * scale)), max(1, round(im.size[1] * scale)))
    frames = [f.convert('P', palette=Image.ADAPTIVE).resize(size, Image.LANCZOS)
              for f in ImageSequence.Iterator(im)]
    before = os.path.getsize(path)
    frames[0].save(path, save_all=True, append_images=frames[1:], loop=0,
                   duration=im.info.get('duration', 100), optimize=True, disposal=2)
    after = os.path.getsize(path)
    print('  %s: %s -> %s' % (os.path.relpath(path, ROOT), human(before), human(after)))


def collect_table_images():
    """data.json 的 __image（首页表格截图）"""
    out = []
    with open(os.path.join(ROOT, 'data.json'), encoding='utf-8') as f:
        data = json.load(f)
    for row in data:
        img = str(row.get('__image') or '').strip()
        if img.startswith('images/') and not img.startswith('images/thumbs/'):
            out.append(img)
    return sorted(set(out))


def make_thumb(rel):
    src = os.path.join(ROOT, rel.replace('/', os.sep))
    if not os.path.exists(src):
        print('  ! 缺原图', rel)
        return
    base = os.path.splitext(os.path.basename(src))[0] + '.webp'
    dst = os.path.join(THUMBS, base)
    if os.path.exists(dst):
        return
    im = Image.open(src)
    if im.mode not in ('RGB', 'RGBA'):
        im = im.convert('RGB')
    w, h = im.size
    if w > THUMB_MAX_W:
        im = im.resize((THUMB_MAX_W, max(1, round(h * THUMB_MAX_W / w))), Image.LANCZOS)
    im.save(dst, 'WEBP', quality=THUMB_QUALITY, method=6)
    print('  缩略图 %s: %s -> %s' % (base, human(os.path.getsize(src)), human(os.path.getsize(dst))))


def main():
    print('-- 背景图 --')
    for name in ('bg-left.webp', 'bg-right.webp'):
        p = os.path.join(ASSETS, name)
        if os.path.exists(p):
            resize_webp(p, BG_MAX, BG_QUALITY)
    print('-- 标题贴纸 --')
    for name in ('sticker-1.gif', 'sticker-2.gif'):
        p = os.path.join(ASSETS, name)
        if os.path.exists(p):
            resize_gif(p, STICKER_MAX)
    print('-- 表格截图缩略图 --')
    os.makedirs(THUMBS, exist_ok=True)
    for rel in collect_table_images():
        make_thumb(rel)
    print('完成。')
    return 0


if __name__ == '__main__':
    sys.exit(main())

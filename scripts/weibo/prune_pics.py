# -*- coding: utf-8 -*-
"""清理 assets/weibo 里没被 data/weibo.json 引用的图（重建数据后跑一次即可）"""
import glob
import json
import os

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
PIC = os.path.join(REPO, 'assets', 'weibo')

d = json.load(open(os.path.join(REPO, 'data', 'weibo.json'), encoding='utf-8'))
need = set()
for p in d['posts']:
    for u in p['pics']:
        if u.startswith('assets/weibo/'):
            need.add(os.path.basename(u))

files = {os.path.basename(f) for f in glob.glob(os.path.join(PIC, '*.jpg'))}
orphan = files - need
print('引用 %d，存在 %d，孤儿 %d' % (len(need), len(files), len(orphan)))
tot = sum(os.path.getsize(os.path.join(PIC, f)) for f in need if f in files)
print('引用文件体积 %.1f MB' % (tot / 1048576))
for f in orphan:
    os.remove(os.path.join(PIC, f))
print('已清理 %d 个孤儿文件' % len(orphan))
big = [f for f in need if f in files and os.path.getsize(os.path.join(PIC, f)) > 140 * 1024]
print('偏大（>140KB）%d 个' % len(big))
print('缺失（引用了但没下到）%d 个' % len(need - files))

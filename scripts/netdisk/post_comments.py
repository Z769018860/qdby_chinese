# -*- coding: utf-8 -*-
"""把重新分享出来的补档链接，发到对应投稿的「置顶评论」下方回复里

站点本身不直出网盘地址（防止被批量爬取/举报），所以新链接落在视频评论区，
页面上只提示「已补档 · 见视频置顶评论」，点「去发布处」跳过去自己看。

为什么是楼中楼：顶层评论会刷屏、也容易被评论区折叠；挂在 UP 主置顶评论
下面，位置固定（置顶永远在最上面），读者点开置顶就能看到全部补档。

判定置顶：x/v2/reply?sort=2 返回 data.upper.top（UP 主置顶）与 data.top（社区置顶），
优先用 UP 主置顶；两者都没有才退回发顶层评论。

登录态：360 极速浏览器快照里的 SESSDATA + bili_jct（scripts/netdisk/browser_cookies.py 导出）。
发评论必须带 csrf=bili_jct，且要 oid=aid（不是 bvid），所以先用 view 接口换一次。

用法：
  python scripts/netdisk/post_comments.py --dry             # 只打印要发的内容
  python scripts/netdisk/post_comments.py --only 冬鸦       # 只发一个，验证格式
  python scripts/netdisk/post_comments.py --cleanup --dry   # 看要删哪些旧顶层评论
  python scripts/netdisk/post_comments.py --reformat        # 把已发的评论改成短版（补档+链接）  python scripts/netdisk/post_comments.py                   # 全部发
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time

import requests

BASE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(BASE, '..', '..'))
WORK = os.path.normpath(os.path.join(REPO, '..'))
CK = os.path.join(WORK, 'ck360_all.json')
SHARE = os.path.join(REPO, 'data', 'netdisk-reshare.json')

PLAT = {'quark': ('夸克网盘', 'pan.quark.cn'), 'baidu': ('百度网盘', 'pan.baidu.com'),
        'uc': ('UC网盘', 'drive.uc.cn'), 'xunlei': ('迅雷云盘', 'pan.xunlei.com')}


def session():
    ck = json.load(open(CK, encoding='utf-8'))
    d = {}
    for c in ck:
        h = c['host'].lstrip('.')
        if h == 'bilibili.com' or h.endswith('.bilibili.com'):
            d[c['name']] = c['value']
    s = requests.Session()
    s.headers.update({
        'Cookie': '; '.join(f'{k}={v}' for k, v in d.items()),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                      '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com/',
        'Origin': 'https://www.bilibili.com',
    })
    s.csrf = d.get('bili_jct', '')
    s.mid = d.get('DedeUserID', '')
    return s


def aid_of(s, bvid):
    j = s.get('https://api.bilibili.com/x/web-interface/view',
              params={'bvid': bvid}, timeout=25).json()
    if j.get('code') != 0:
        return None, j
    return (j.get('data') or {}).get('aid'), j


def pinned_of(s, aid):
    """返回 (rpid, 来源说明)。优先 UP 主置顶 → 社区置顶 → 自己在热评里的一条，都没有就 (None, '')"""
    try:
        j = s.get('https://api.bilibili.com/x/v2/reply',
                  params={'type': 1, 'oid': aid, 'pn': 1, 'ps': 20, 'sort': 2, 'nohot': 0},
                  timeout=25).json()
    except Exception as e:
        return None, f'err:{str(e)[:40]}'
    if j.get('code') != 0:
        return None, f"code={j.get('code')}"
    data = j.get('data') or {}
    for key, label in (('upper', 'UP主置顶'), ('top', '社区置顶')):
        node = data.get(key) or {}
        top = node.get('top') if isinstance(node, dict) else None
        if isinstance(top, dict) and top.get('rpid'):
            return int(top['rpid']), label
    # 没有置顶：退而在热评里找自己发过的一条，挂在它下面（仍是楼中楼，不新增顶层）
    me = str(getattr(s, 'mid', '') or '')
    if me:
        for rep in (data.get('replies') or []):
            if str(((rep.get('member') or {}).get('mid')) or '') == me and rep.get('rpid'):
                return int(rep['rpid']), '自己热评'
    return None, ''


def build(name, links):
    """只发两样东西：补档说明 + 网盘链接。不加免责声明、不加站内引导。

    已被巡检判死的补档链接不再写进评论（`daily_check.py` 会把 checked 写回条目），
    免得读者点过去看到的是「来晚啦，该分享已被取消」。"""
    lines = ['【补档】《%s》' % name]
    for k, v in links.items():
        if not v.get('url') or v.get('checked') == 'dead':
            continue
        label = PLAT.get(k, (k, ''))[0]
        pwd = v.get('pwd') or ''
        lines.append('%s：%s%s' % (label, v['url'], (' 提取码：' + pwd) if pwd else ''))
    return '\n'.join(lines) if len(lines) > 1 else ''


def post_one(s, aid, msg, root=None):
    data = {'oid': aid, 'type': 1, 'message': msg, 'plat': 1, 'csrf': s.csrf}
    if root:
        data['root'] = root      # 根评论（置顶那条）
        data['parent'] = root    # 直接回复它 → 楼中楼
    return s.post('https://api.bilibili.com/x/v2/reply/add', data=data, timeout=30).json()


def delete_one(s, aid, rpid):
    return s.post('https://api.bilibili.com/x/v2/reply/del',
                  data={'oid': aid, 'type': 1, 'rpid': rpid, 'csrf': s.csrf},
                  timeout=30).json()


def reformat(s, data, name, g, args):
    """把已经发出去的补档评论改写成短版：先发新的，成功了再删旧的（顺序不能反）"""
    links = g.get('links') or {}
    olds = [(k, v) for k, v in links.items() if (v.get('comment') or {}).get('rpid')]
    if not olds:
        return 0
    bvid = olds[0][1].get('bvid') or ''
    aid = olds[0][1]['comment'].get('aid') or (aid_of(s, bvid)[0] if bvid else None)
    if not aid:
        print(f'  ✗ {name}: 取不到 aid，跳过改写')
        return 0
    root = olds[0][1]['comment'].get('root') or None
    msg = build(name, links)
    if not msg:
        print(f'  - {name}: 补档链接已全部被复查判死，先不重发（留旧评论）')
        return 0
    if args.dry:
        print(f'=== {name} aid={aid} root={root or "顶层"}\n{msg}\n')
        return 0
    r = post_one(s, aid, msg, root)
    if r.get('code') != 0:
        print(f'  ✗ {name}: 发新评论失败 code={r.get("code")} {r.get("message")}（旧评论保留）')
        return 0
    d = r.get('data') or {}
    rpid = str(d.get('rpid_str') or d.get('rpid') or '')
    for k, v in links.items():
        c = v.get('comment') or {}
        if not c.get('rpid'):
            continue
        old = c['rpid']
        dr = delete_one(s, aid, old)
        if dr.get('code') == 0:
            v['comment'] = {'aid': aid, 'rpid': rpid, 'root': root or '',
                            'where': 'reply' if root else 'top',
                            'pinned': c.get('pinned') or '', 'short': True,
                            'at': time.strftime('%Y-%m-%d %H:%M')}
            print(f'  ✓ {name} 改写 rpid {old} → {rpid}')
        else:
            print(f'  ! {name} 新评论已发({rpid})，旧评论删除失败 code={dr.get("code")}')
        time.sleep(3)
    json.dump(data, open(SHARE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry', action='store_true')
    ap.add_argument('--only', default='')
    ap.add_argument('--cleanup', action='store_true', help='删掉之前发成顶层评论的补档评论')
    ap.add_argument('--force', action='store_true', help='已有 comment 记录也重发（先删旧的）')
    ap.add_argument('--reformat', action='store_true',
                    help='把已发的补档评论改成短版（只有补档+链接），先发新再删旧')
    args = ap.parse_args()

    data = json.load(open(SHARE, encoding='utf-8'))
    s = session()
    if not s.csrf:
        sys.exit('没有 bili_jct，无法发评论（先重新导出 360 的 cookie）')

    if args.reformat:
        n = 0
        for name, g in data['games'].items():
            if args.only and args.only not in name:
                continue
            n += reformat(s, data, name, g, args)
            if not args.dry:
                time.sleep(8 + random.random() * 6)
        print(f'改写完成：{n} 个作品')
        return

    n_ok = n_skip = n_fail = n_del = 0
    for name, g in data['games'].items():
        if args.only and args.only not in name:
            continue
        links = g.get('links') or {}
        bvid = next((v.get('bvid') for v in links.values() if v.get('bvid')), '')

        # 清理旧的顶层评论（之前那版是直接发顶层，会刷屏）
        if args.cleanup or args.force:
            for v in links.values():
                c = v.get('comment') or {}
                if not c.get('rpid') or c.get('root'):
                    continue
                aid = c.get('aid') or (None if not bvid else aid_of(s, bvid)[0])
                if not aid:
                    continue
                if args.dry:
                    print(f'  [dry] 删除顶层评论 {name} aid={aid} rpid={c["rpid"]}')
                    continue
                r = delete_one(s, aid, c['rpid'])
                if r.get('code') == 0:
                    n_del += 1
                    print(f'  ⌫ {name} 删除顶层评论 rpid={c["rpid"]}')
                else:
                    print(f'  ✗ {name} 删除失败 code={r.get("code")} {r.get("message")}')
                v.pop('comment', None)
                time.sleep(3)
            json.dump(data, open(SHARE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
            if args.cleanup and not args.force:
                continue

        todo = {k: v for k, v in links.items() if v.get('url') and not v.get('comment')}
        if not todo:
            continue
        if not bvid:
            print(f'  - {name}: 没有投稿，跳过（补档内容只写进站点）')
            n_skip += 1
            continue
        msg = build(name, todo)
        if args.dry:
            aid, _ = aid_of(s, bvid)
            root, src = pinned_of(s, aid) if aid else (None, '')
            print(f'=== {name} [{bvid}] aid={aid} 置顶={src or "无"} root={root}\n{msg}\n')
            continue
        aid, raw = aid_of(s, bvid)
        if not aid:
            print(f'  ✗ {name}: 取 aid 失败 {str(raw)[:80]}')
            n_fail += 1
            continue
        root, src = pinned_of(s, aid)
        if not root:
            print(f'  ! {name}: 没找到置顶评论（{src}），退回发顶层')
        r = post_one(s, aid, msg, root)
        if r.get('code') == 0:
            d = r.get('data') or {}
            rpid = str(d.get('rpid_str') or d.get('rpid') or '')
            for v in todo.values():
                v['comment'] = {'aid': aid, 'rpid': rpid, 'root': root or '',
                                'where': 'reply' if root else 'top',
                                'pinned': src, 'at': time.strftime('%Y-%m-%d %H:%M')}
            n_ok += 1
            print(f'  ✓ {name} [{bvid}] {("回复 " + str(root)) if root else "顶层"} → rpid={rpid}')
            json.dump(data, open(SHARE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        else:
            print(f'  ✗ {name}: code={r.get("code")} {r.get("message")}')
            n_fail += 1
            if r.get('code') in (-352, -412, 12002):  # 风控/频率
                time.sleep(60)
        time.sleep(8 + random.random() * 6)

    json.dump(data, open(SHARE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'完成：成功 {n_ok}，跳过 {n_skip}，失败 {n_fail}，删除 {n_del}')


if __name__ == '__main__':
    main()

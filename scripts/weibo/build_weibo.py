# -*- coding: utf-8 -*-
"""把抓到的微博整理成 data/weibo.json，并把微博里的游戏对齐到游戏库

分类（只有两类进站点）：
  release 汉化发布 —— 自汉化 / 汉化补丁 / 机翻补丁
  repo    游玩与感想 —— 打完/通关/repo/感想/评测/安利/推荐/入坑

「安利」原本单独一类，实测和 repo 的边界很虚（一条微博常常前脚写感想后脚安利），
现在并进 repo；转发（retweeted 非空）一律丢弃——那是别人的内容，
按正文关键词分类会把别人写的「repo/推荐」也算进来，这是之前提取错误的根源。

对每条微博：
  1. 从《书名号》、「汉化名：」「原名：」里抽游戏名
  2. 命中 data/games.json 已有游戏 → 直接关联
  3. 没命中 → 新建「只有微博、没有投稿」的游戏实体，并从正文里抽
     平台 / 价格 / 游玩时长 / 题材 / 要素，写入 raw/weibo_games.json，
     由 build_games.py 合并进 games.json
"""
import json
import os
import re
import sys
import time
import hashlib

sys.path.insert(0, os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'bili')))
from taxonomy import (  # noqa: E402
    cn_norm, strip_quotes, match_platforms, parse_price, price_bucket,
    scan, GENRES, ELEMENTS, game_len_bucket,
)

BASE = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.environ.get('QD_REPO') or os.path.normpath(os.path.join(BASE, '..', '..'))
RAW = os.environ.get('QD_CACHE') or os.path.normpath(os.path.join(BASE, '..', '..', '..', 'raw'))

KIND_RULES = [
    ('release', r'自汉化|汉化补丁|汉化发布|机翻补丁|翻译补丁|汉化版|补丁地址|自译|汉化名'),
    # repo 的说法很杂：除了 repo/通关，还有「推完/全线/剧透/评分/体验」，
    # 以及原来单独成类的安利 / 推荐 / 入坑——统一归到 repo
    ('repo', r'repo|通关|打完|通了|推完|玩完|通完|全结局|全线|结局|感想|评测|测评'
             r'|玩后感|吐槽|简评|记录一下|剧透|评分|打分|体验|进度'
             r'|安利|推荐|入坑|推游|强烈建议|不容错过|值得一玩'),
]

NAME_PATTERNS = [
    r'《([^》]{2,60})》',
    r'汉化名\s*[：:]?\s*《?([^》\n]{2,60})》?',
    r'原名\s*[：:]\s*([^\n]{2,80})',
    r'游戏名(?:称)?\s*[：:]\s*([^\n]{2,60})',
]


# 站点只收「汉化相关」的两类：repo（含感想/通关/评测/安利）、release（发布/补档）。
# 其余 3600+ 条是转发与闲聊，留在 raw 里备查，不进站点数据（否则 JSON 6MB、页面全是噪音）。
KEEP_KINDS = {k.strip() for k in
              (os.environ.get('QD_WEIBO_KINDS') or 'repo,release').split(',') if k.strip()}

RETWEET_ONLY = {'转发微博', '轉發微博', 'Repost', 'repost'}

PIC_DIR = os.path.join(REPO_DIR, 'assets', 'weibo')


def pic_local(url):
    """已下载到 assets/weibo 的图换成站内路径；没下到就退回原地址"""
    if not url:
        return url
    stem = url.split('/')[-1].rsplit('.', 1)[0]
    name = hashlib.md5(stem.encode('utf-8')).hexdigest()[:16] + '.jpg'
    if os.path.exists(os.path.join(PIC_DIR, name)):
        return 'assets/weibo/' + name
    return url


def is_retweet(p):
    """转发：接口把被转的原文放在 retweeted 里，自己写的话（常常只有「//@某某:」）在 text。
    这类条目的正文关键词出自别人，不能算作者的内容，一律不进站点。"""
    if (p.get('retweeted') or '').strip():
        return True
    t = (p.get('fullText') or p.get('text') or '').strip()
    return t in RETWEET_ONLY


def classify(text):
    hits = [k for k, p in KIND_RULES if re.search(p, text or '', re.I)]
    if 'release' in hits:
        return 'release'
    if 'repo' in hits:
        return 'repo'
    return 'other'


def candidates(text):
    """抽出游戏名候选。书名号最可靠；「汉化名/原名」用于补全。
    同名多写法时保留最长的一条，避免把长名切碎后重复建库。"""
    raw = []
    for pat in NAME_PATTERNS:
        for m in re.findall(pat, text or ''):
            for piece in re.split(r'[/／|｜]', m):
                piece = re.sub(r'^[\s:：]+|[\s:：]+$', '', piece)
                piece = re.sub(r'\s+', ' ', piece).strip(' 。，,、…—')
                if 3 <= len(piece) <= 60:
                    raw.append(piece)
    # 去掉被另一条完整包含的短名
    keep = []
    for x in raw:
        kx = cn_norm(x)
        if any(kx != cn_norm(y) and kx in cn_norm(y) for y in raw):
            continue
        keep.append(x)
    seen, res = set(), []
    for x in keep:
        k = cn_norm(x)
        if k and k not in seen:
            seen.add(k)
            res.append(x)
    return res


def hours_from(text):
    """从『3~4h』『40~45h』『2h流程』『10分钟』里取上限小时数"""
    t = (text or '').replace('–', '-').replace('~', '-')
    best = None
    for m in re.finditer(r'(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(?:h|小时)', t, re.I):
        best = max(best or 0, float(m.group(2)))
    if best is None:
        for m in re.finditer(r'(\d+(?:\.\d+)?)\s*(?:h|小时)(?!\w)', t, re.I):
            best = max(best or 0, float(m.group(1)))
    if best is None:
        for m in re.finditer(r'(\d+)\s*分钟', t):
            best = max(best or 0, float(m.group(1)) / 60)
    return best


def main():
    wpath = os.path.join(RAW, 'weibo_posts.json')
    posts = json.load(open(wpath, encoding='utf-8')) if os.path.exists(wpath) else []
    gdata = json.load(open(os.path.join(REPO_DIR, 'data', 'games.json'), encoding='utf-8'))
    games = gdata['games']

    idx = []
    for g in games:
        if g.get('src') == 'weibo':
            continue  # 由微博补建的实体每次都重新生成，避免自我匹配后丢实体
        for n in [g['name'], g.get('orig') or ''] + (g.get('alias') or []):
            k = cn_norm(n)
            if len(k) >= 3:
                idx.append((k, g['id'], g['name']))
    idx.sort(key=lambda x: -len(x[0]))

    def match(name):
        k = cn_norm(name)
        if not k:
            return None
        for kk, gid, _ in idx:
            if kk == k:
                return gid
        for kk, gid, _ in idx:
            if len(kk) >= 4 and len(k) >= 4 and (kk in k or k in kk):
                return gid
        return None

    new_games = {}
    alias_map = {}
    out = []
    n_rt = 0
    for p in posts:
        if is_retweet(p):
            n_rt += 1
            continue
        # 搜索卡片给的 text 是截断版，末尾带「…全文」；长微博用 extend 接口补的全文
        text = p.get('fullText') or p.get('text') or ''
        text = re.sub(r'\s*(?:\.{2,}|…+)\s*全文\s*$', '', text).strip()
        kind = classify(text)
        if KEEP_KINDS and kind not in KEEP_KINDS:
            continue
        gids = set()
        miss = []
        for nm in candidates(text):
            gid = match(nm)
            if gid:
                gids.add(gid)
            else:
                miss.append(nm)
        # 一条微博通常只讲一个游戏：书名号/汉化名作主名，其余写法（多是原名）当别名
        if miss and not gids and kind in ('repo', 'release'):
            key = cn_norm(miss[0])
            gid = new_games.get(key)
            if not gid:
                gid = 'w' + hashlib.md5(key.encode('utf-8')).hexdigest()[:8]
                new_games[key] = gid
            alias_map.setdefault(gid, [])
            for nm in miss[1:]:
                if nm not in alias_map[gid]:
                    alias_map[gid].append(nm)
            gids.add(gid)

        item = {
            'id': p['id'],
            'date': (p.get('created') or '')[:16],
            'ts': 0,
            'kind': kind,
            'text': re.sub(r'\n{3,}', '\n\n', text).strip()[:1400],
            'len': len(text),
            'pics': [pic_local(u) for u in (p.get('pics') or [])[:9]],
            'picsOrig': (p.get('pics') or [])[:9],
            'video': p.get('videoUrl') or '',
            'likes': p.get('likes') or 0,
            'comments': p.get('comments') or 0,
            'reposts': p.get('reposts') or 0,
            'url': 'https://m.weibo.cn/detail/%s' % p['id'],
            're': '',   # 转发已在上面剔除，这个字段留给前端兼容
            'games': sorted(gids),
            'names': candidates(text)[:4],
        }
        d = p.get('created') or ''
        m = re.search(r'(\w{3}) (\w{3}) (\d{2}) (\d{2}):(\d{2}):(\d{2}) ([+-]\d{4}) (\d{4})', d)
        if m:
            mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].index(m.group(2)) + 1
            item['ts'] = int(time.mktime((int(m.group(8)), mon, int(m.group(3)), int(m.group(4)),
                                          int(m.group(5)), int(m.group(6)), 0, 0, -1)))
            item['date'] = '%s-%02d-%s %s:%s' % (m.group(8), mon, m.group(3), m.group(4), m.group(5))
        out.append(item)

    out.sort(key=lambda x: x['ts'], reverse=True)

    # 为「只有微博」的游戏生成实体
    name_by_gid = {}
    for it in out:
        for gid in it['games']:
            if gid.startswith('w'):
                for nm in it['names']:
                    if new_games.get(cn_norm(nm)) == gid:
                        name_by_gid.setdefault(gid, nm)
                        break

    wg = []
    for key, gid in new_games.items():
        name = name_by_gid.get(gid) or key
        text = '\n'.join(it['text'] for it in out if gid in it['games'])
        val, cur, free, note = parse_price(
            (re.search(r'(?:原价|售价|价格|定价|售价约)\s*[：:]?\s*([\d.]+)', text) or [None, ''])[1]
            if re.search(r'(?:原价|售价|价格|定价)', text) else ''
        )
        hrs = hours_from(text)
        wg.append({
            'id': gid,
            'name': strip_quotes(name),
            'orig': (alias_map.get(gid) or [''])[0],
            'alias': (alias_map.get(gid) or [])[1:4],
            'plat': match_platforms(text),
            'platText': '',
            'price': None if val is None else round(val, 1),
            'cur': cur,
            'free': bool(free),
            'pz': price_bucket(val, free),
            'priceText': '' if note else '',
            'topics': scan(text, GENRES),
            'g0': '',
            'els': scan(text, ELEMENTS),
            'vcount': 0,
            'hours': round(hrs, 1) if hrs else 0,
            'size': game_len_bucket(hrs) if hrs else '',
            'play': 0,
            'videos': [],
            'url': '',
            'from': '',
            'to': '',
            'src': 'weibo',
        })
    json.dump(wg, open(os.path.join(RAW, 'weibo_games.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)

    wb_by_game = {}
    for it in out:
        for gid in it['games']:
            wb_by_game.setdefault(gid, []).append(it['id'])
    for gid, ids in wb_by_game.items():
        wb_by_game[gid] = ids[:8]

    kinds = {}
    for it in out:
        kinds[it['kind']] = kinds.get(it['kind'], 0) + 1

    data = {
        'generated_at': time.strftime('%Y-%m-%d %H:%M'),
        'uid': '5082872852',
        'name': '青灯不弈',
        'profile': 'https://weibo.com/u/5082872852',
        'count': len(out),
        'kinds': kinds,
        'matched': sum(1 for x in out if x['games']),
        'new_games': len(wg),
        'posts': out,
        'by_game': wb_by_game,
    }
    dst = os.path.join(REPO_DIR, 'data', 'weibo.json')
    with open(dst, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print('微博', len(out), kinds, '关联到游戏', data['matched'], '新建游戏', len(wg))
    print('剔除转发', n_rt, '条（retweeted 非空 / 只有「转发微博」）')
    print('覆盖游戏', len(wb_by_game))
    print('->', dst, os.path.getsize(dst) // 1024, 'KB')


if __name__ == '__main__':
    main()

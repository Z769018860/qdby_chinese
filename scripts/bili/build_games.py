# -*- coding: utf-8 -*-
"""构建游戏维度库 data/games.json

数据来源（全部来自抓取缓存，可重复执行）：
  1. raw/descs.json        —— 1085 条投稿的页面简介，含 UP 主手写的
                              游戏名称 / 游戏平台 / 游戏价格 三段结构化信息
  2. raw/up_videos_all.json —— 投稿列表，提供标题、时长、播放、发布日期
  3. data.json             —— 汉化作品库（64 部），补充类型/要素/原版地址/发布微博

输出：
  - data/games.json   游戏实体（平台、价格、题材、要素、原版地址、Steam 页、关联投稿）
  - 每条视频 → 游戏 id 的映射（vidmap），供 build_videos.py 组装前端数据
"""
import json
import os
import re
import time
import hashlib
from urllib.parse import urlparse, parse_qs

from taxonomy import (
    GENRES, ELEMENTS, PLAT_NAMES, PLAT_ORDER,
    cn_norm, norm_key, split_names, match_platforms,
    parse_price, price_bucket, scan, primary_genre,
    game_len_bucket, strip_quotes, is_mobile_title,
)

BASE = os.path.dirname(os.path.abspath(__file__))
REPO = os.environ.get('QD_REPO') or os.path.normpath(os.path.join(BASE, '..', '..'))
RAW = os.environ.get('QD_CACHE') or os.path.normpath(os.path.join(BASE, '..', '..', '..', 'raw'))

# 简介里没写游戏名时的标题兜底：长线手游的实况/抽卡视频标题里一定有游戏名
TITLE_GAMES = [
    (r'忘却前夜', '忘却前夜', ['mobile']),
    (r'明日方舟(?!：终末地|:终末地)', '明日方舟', ['mobile']),
    (r'剑网\s*3|剑网三|剑三|jjc', '剑网3', ['pc']),
    (r'妖恋|光芒：|光芒:', '光芒：妖恋奇谭', ['mobile']),
    (r'食物语|梦间集', '食物语', ['mobile']),
]

NAME_F = ['游戏名称', '游戏名', '名称', '游戏中文名', '中文名', '游戏']
PLAT_F = ['游戏平台', '平台', '支持平台', '运行平台', '游玩平台', '游戏平台/设备']
PRICE_F = ['游戏价格', '价格', '售价', '游戏售价', '定价']
ORIG_F = ['原版地址', '原作地址', '原版游戏地址', '原版下载地址', '官方地址', '购买地址', '游戏地址']


def field(desc, names):
    """取「键：值」形式的结构化字段，容忍全角冒号与前后空白"""
    for n in names:
        m = re.search(rf'^\s*{re.escape(n)}\s*[：:]\s*(.+?)\s*$', desc, re.M)
        if m:
            v = m.group(1).strip()
            if v:
                return v
    return ''


def store_of_url(u):
    """把 URL 归类到商店/平台，返回 (platform_key, appid)"""
    u = (u or '').strip()
    if not u.startswith('http'):
        return None, None
    h = urlparse(u).netloc.lower()
    if 'steam' in h:
        m = re.search(r'/app/(\d+)', u)
        return 'steam', (m.group(1) if m else None)
    if 'itch.io' in h:
        return 'itch', None
    if 'booth.pm' in h:
        return 'booth', None
    if 'dlsite' in h:
        return 'dlsite', None
    if 'freem.ne.jp' in h:
        return 'freem', None
    if 'novelgame.jp' in h:
        return 'novelgame', None
    if 'apps.apple.com' in h or 'play.google.com' in h:
        return 'mobile', None
    return 'web', None


def extract_urls(desc):
    """简介里的全部链接，剥离中文标点尾巴"""
    out = []
    for m in re.finditer(r'https?://[^\s）)】\]，,。；;]+', desc or ''):
        u = m.group(0).rstrip('.')
        out.append(u)
    return out


JUNK_NAME = re.compile(r'【|】|「|」|实况|抽卡|通关|攻略|解说|记录|合集|盘点|测评|试玩|repo|第[一二三四五六七八九十\d]+[期话章弹集]|大结局|更新', re.I)


def plausible(name):
    """简介里的「游戏名称」偶尔被填成整条视频标题，这里做一次过滤"""
    n = (name or '').strip()
    if not n or len(n) > 26:
        return False
    if JUNK_NAME.search(n):
        return False
    if re.fullmatch(r'[\d\W_]+', n):
        return False
    return True


def game_names_from_title(title):
    t = title or ''
    names = re.findall(r'《([^》]{1,40})》', t)
    if names:
        return names
    m = re.search(r'——\s*([^—]{2,30})$', t)
    return [m.group(1).strip()] if m else []


def main():
    descs = json.load(open(os.path.join(RAW, 'descs.json'), encoding='utf-8'))
    vids = json.load(open(os.path.join(RAW, 'up_videos_all.json'), encoding='utf-8'))
    wpath = os.path.join(REPO, 'data.json')
    works = json.load(open(wpath, encoding='utf-8')) if os.path.exists(wpath) else []

    # ---------- 1. 逐条视频解析 ----------
    parsed = []          # 每条视频的解析结果
    for v in vids:
        bvid = v['bvid']
        d = descs.get(bvid) or {}
        desc = d.get('desc') or ''
        title = v.get('title') or ''
        dur = 0
        parts = [int(x) for x in re.findall(r'\d+', str(v.get('duration') or '0'))] or [0]
        for p in parts:
            dur = dur * 60 + p

        raw_name = field(desc, NAME_F)
        if not raw_name:
            tl = game_names_from_title(title)
            raw_name = tl[0] if tl else ''
        names = split_names(raw_name)
        if names and not plausible(names[0]):
            names = []
        plat_hint = []
        if not names:
            for pat, gname, hint in TITLE_GAMES:
                if re.search(pat, title, re.I):
                    names, plat_hint = [gname], hint
                    break
        if not names:
            continue
        primary = names[0]
        plats_text = field(desc, PLAT_F)
        price_text = field(desc, PRICE_F)
        orig_addr = field(desc, ORIG_F)
        urls = extract_urls(desc)

        # 正文 = 去掉结构化行的剩余部分，用于题材/要素识别
        prose_lines = []
        for ln in desc.split('\n'):
            if re.match(r'^\s*(游戏名称|游戏名|名称|游戏平台|平台|支持平台|运行平台|游玩平台|游戏价格|价格|售价|'
                        r'游戏售价|定价|原版地址|原作地址|原版下载地址|官方地址|购买地址|游戏地址|提取码|解压密码|'
                        r'汉化补丁地址|补丁地址|下载地址|链接|备份)\s*[：:]', ln):
                continue
            prose_lines.append(ln)
        prose = '\n'.join(prose_lines).strip()

        # 商店链接优先级：结构化「原版地址」> 正文里第一个商店链接
        store_key, appid = store_of_url(orig_addr)
        orig_url = orig_addr if orig_addr.startswith('http') else ''
        if not orig_url:
            for u in urls:
                k, a = store_of_url(u)
                if k in ('steam', 'itch', 'booth', 'dlsite', 'freem', 'novelgame'):
                    orig_url, store_key, appid = u, k, a
                    break

        plats = match_platforms(plats_text) if plats_text else []
        if store_key in PLAT_NAMES and store_key not in plats:
            plats.append(store_key)
        if not plats and store_key:
            plats = [store_key]
        if not plats:
            plats = match_platforms(desc[:400])
        if not plats and plat_hint:
            plats = list(plat_hint)
        plats = [k for k in PLAT_ORDER if k in set(plats)]

        val, cur, free, note = parse_price(price_text)

        parsed.append({
            'bvid': bvid, 'title': title, 'desc': desc, 'prose': prose, 'mobile': is_mobile_title(title),
            'names': names, 'primary': primary, 'key': cn_norm(primary),
            'platText': plats_text, 'plats': plats,
            'priceText': price_text, 'price': val, 'cur': cur, 'free': free, 'priceNote': note,
            'origUrl': orig_url, 'storeKey': store_key, 'appid': appid,
            'dur': dur, 'date': v.get('date') or '', 'ts': v.get('created') or 0,
            'play': v.get('play') or 0,
        })
    print(f'解析出游戏名的投稿 {len(parsed)} / {len(vids)}')

    # ---------- 2. 归并同名游戏 ----------
    groups = {}
    def newgid(key):
        return 'g' + hashlib.md5(key.encode('utf-8')).hexdigest()[:8]

    for p in parsed:
        if not p['key']:
            continue
        gid = newgid(p['key'])
        g = groups.get(gid)
        if not g:
            g = groups[gid] = {
                'id': gid, 'key': p['key'], 'names': [], 'videos': [],
                'plats': set(), 'priceVals': [], 'priceTexts': [], 'prose': [],
                'titles': [], 'urls': [], 'dur': 0, 'durMax': 0, 'play': 0, 'dates': [],
            }
        for n in p['names']:
            if n and n not in g['names']:
                g['names'].append(n)
        g['videos'].append(p['bvid'])
        g['plats'].update(p['plats'])
        if p['price'] is not None:
            g['priceVals'].append((p['price'], p['cur'], p['free'], p['ts']))
        if p['priceText']:
            g['priceTexts'].append(p['priceText'])
        g['prose'].append(p['prose'])
        g['titles'].append(p['title'])
        if p['origUrl']:
            g['urls'].append(p['origUrl'])
        g['dur'] += p['dur']
        # 体量只认「单条投稿全部分 P 的时长」，手游/抽卡/网游类不参与
        if not p['mobile'] and p['dur'] > g['durMax']:
            g['durMax'] = p['dur']
        g['play'] += p['play']
        if p['date']:
            g['dates'].append(p['date'])

    # 名称 → gid 的别名索引（含《》前的简写）
    alias = {}
    for gid, g in groups.items():
        for n in g['names']:
            for k in {cn_norm(n), norm_key(n)}:
                if k:
                    alias.setdefault(k, gid)

    # ---------- 3. 关联汉化作品库 ----------
    def find_group_for_work(w):
        keys = [cn_norm(w.get('汉化名')), cn_norm(w.get('游戏原名'))]
        keys = [k for k in keys if k]
        for k in keys:
            if k in alias:
                return alias[k]
        # 容错：包含匹配（长度≥4 才有意义）
        for k in keys:
            if len(k) < 4:
                continue
            for gid, g in groups.items():
                for n in g['names']:
                    nk = cn_norm(n)
                    if len(nk) >= 4 and (k in nk or nk in k):
                        return gid
        return None

    linked = 0
    for w in works:
        gid = find_group_for_work(w)
        if not gid:
            # 作品库里有、但没有任何投稿提到它 —— 也建一条，供汉化站联合展示
            key = cn_norm(w.get('汉化名') or w.get('游戏原名') or '')
            if not key:
                continue
            gid = newgid(key)
            groups.setdefault(gid, {
                'id': gid, 'key': key, 'names': [strip_quotes(w.get('汉化名') or '')],
                'videos': [], 'plats': set(), 'priceVals': [], 'priceTexts': [],
                'prose': [], 'titles': [], 'urls': [], 'dur': 0, 'durMax': 0, 'play': 0, 'dates': [],
            })
        g = groups[gid]
        g['work'] = w
        linked += 1
    print(f'关联汉化作品 {linked} / {len(works)}')

    # ---------- 4. 汇总输出 ----------
    out = []
    for gid, g in groups.items():
        names = g['names']
        primary = names[0] if names else ''
        # 原名：名字里非中文的那一条，或括号里的那一半
        orig = ''
        for n in names[1:]:
            if re.search(r'[A-Za-z\u3040-\u30ff]', n):
                orig = n
                break

        plat = [k for k in PLAT_ORDER if k in g['plats']]
        # 价格：取最近一条有数值的，缺失时用作品库
        price = None
        cur = 'CNY'
        free = False
        if g['priceVals']:
            g['priceVals'].sort(key=lambda x: x[3], reverse=True)
            price, cur, free, _ = g['priceVals'][0]
        priceText = g['priceTexts'][0] if g['priceTexts'] else ''
        if price is None and g.get('work'):
            v2, c2, f2, _n = parse_price(g['work'].get('游戏价格') or '')
            if v2 is not None:
                price, cur, free = v2, c2, f2
                priceText = g['work'].get('游戏价格') or ''

        blob = ' '.join([primary, orig] + g['titles'] + g['prose'])
        if g.get('work'):
            blob += ' ' + (g['work'].get('游戏类型') or '') + ' ' + (g['work'].get('要素') or '') + \
                    ' ' + (g['work'].get('备注') or '')
        topics = scan(blob, GENRES)
        els = scan(blob, ELEMENTS)

        # 体量取最长的一条单机实况投稿（含全部分 P），不再把整个系列加起来
        hours = round(g['durMax'] / 3600.0, 1)
        url = g['urls'][0] if g['urls'] else ''
        if not url and g.get('work'):
            wu = (g['work'].get('原版游戏地址') or '').strip()
            url = wu if wu.startswith('http') else ''

        item = {
            'id': gid,
            'name': primary,
            'orig': orig,
            'alias': names[1:4],
            'plat': plat,
            'platText': '',
            'price': None if price is None else round(price, 1),
            'cur': cur,
            'free': bool(free),
            'pz': price_bucket(price, free),
            'priceText': priceText,
            'topics': topics,
            'g0': primary_genre(blob),
            'els': els,
            'vcount': len(g['videos']),
            'hours': hours,
            'size': game_len_bucket(hours) if g['durMax'] else '',
            'play': g['play'],
            'videos': g['videos'][:200],
            'url': url,
            'from': min(g['dates']) if g['dates'] else '',
            'to': max(g['dates']) if g['dates'] else '',
        }
        if g.get('work'):
            w = g['work']
            item['wk'] = {
                'name': strip_quotes(w.get('汉化名') or ''),
                'level': (w.get('汉化程度') or '').strip(),
                'member': (w.get('汉化成员') or '').strip(),
                'release': (w.get('汉化发布时间') or '').strip(),
                'weibo': (w.get('汉化发布微博') or '').strip(),
                'addr': (w.get('汉化发布地址') or '').strip(),
                'note': (w.get('备注') or '').strip(),
                'age': (w.get('年龄分级') or '').strip(),
                'lang': (w.get('原版语言') or '').strip(),
                'type': (w.get('游戏类型') or '').strip(),
                'els': (w.get('要素') or '').strip(),
                'dur': (w.get('游戏时长') or '').strip(),
                'price': (w.get('游戏价格') or '').strip(),
            }
        out.append(item)

    out.sort(key=lambda x: (-x['vcount'], -x['play'], x['name']))

    # ---------- 5. 合并「只在微博里出现」的游戏 ----------
    wgp = os.path.join(RAW, 'weibo_games.json')
    if os.path.exists(wgp):
        try:
            have = {g['id'] for g in out}
            extra = json.load(open(wgp, encoding='utf-8'))
            n_add = 0
            for g in extra:
                if g['id'] in have:
                    continue
                out.append(g)
                have.add(g['id'])
                n_add += 1
            print('合并微博来源游戏', n_add)
        except Exception as e:
            print('微博游戏合并跳过', e)
        out.sort(key=lambda x: (-x['vcount'], -x['play'], x['name']))

    vidmap = {}
    for p in parsed:
        gid = alias.get(p['key'])
        if gid:
            vidmap[p['bvid']] = gid

    data = {
        'generated_at': time.strftime('%Y-%m-%d %H:%M'),
        'count': len(out),
        'with_video': sum(1 for x in out if x['vcount']),
        'with_work': sum(1 for x in out if x.get('wk')),
        'games': out,
        'vidmap': vidmap,
    }
    dst = os.path.join(REPO, 'data', 'games.json')
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(dst, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print('游戏实体', len(out), '有投稿', data['with_video'], '关联汉化', data['with_work'])
    print('投稿映射', len(vidmap))
    print('平台分布', {k: sum(1 for x in out if k in x['plat']) for k in PLAT_ORDER})
    print('价格档', {b: sum(1 for x in out if x['pz'] == b) for b in ('free', 'low', 'mid', 'high', 'unknown')})
    print('题材命中', {k: sum(1 for x in out if k in x['topics']) for k, n, _ in GENRES})
    print('要素命中', {k: sum(1 for x in out if k in x['els']) for k, n, _ in ELEMENTS})
    print('->', dst, os.path.getsize(dst) // 1024, 'KB')


if __name__ == '__main__':
    main()

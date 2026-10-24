# -*- coding: utf-8 -*-
"""把抓取到的投稿视频与专栏整理成视频站数据 data/videos.json

维度来源（2026-10 改造后）：
  1. data/games.json —— 由投稿页面简介解析出的游戏实体（平台/价格/题材/要素/体量）
     每条投稿通过 gid 关联到具体游戏，继承这些维度
  2. 标题【】前缀与正文关键词 —— 视频形式、地区、体量等无法从游戏库获得的维度
  3. 视频自身时长 —— 单条视频的长度分档

前端只负责渲染 facets，规则不重复实现。
"""
import json, os, re, tempfile, time
from urllib.parse import urlparse

from taxonomy import GENRES, ELEMENTS, PLAT_ORDER, PLAT_NAMES, is_mobile_title

BASE = os.path.dirname(os.path.abspath(__file__))
REPO = os.environ.get('QD_REPO') or os.path.normpath(os.path.join(BASE, '..', '..'))
RAW = os.environ.get('QD_CACHE') or os.path.normpath(os.path.join(BASE, '..', '..', '..', 'raw'))
MID = 95687310
SPACE_TOTAL = 1102  # 空间页显示的投稿总数（含受限/不公开条目，接口可见 1085 条）

CATS = [
    ('hanhua', '汉化发布', '自汉化 / 机翻补丁发布'),
    ('play', '实况解说', '通关、试玩与流程实况'),
    ('guide', '攻略repo', '攻略、成就与通关感想'),
    ('morimens', '忘却前夜', '融灾记录与抽卡'),
    ('arknights', '明日方舟', '方舟相关'),
    ('jx3', '剑网3', '剑三 JJC 与门派'),
    ('guangmang', '光芒妖恋奇谭', '光芒：妖恋奇谭 记录'),
    ('shiwuyu', '食物语', '食物语 / 梦间集'),
    ('other', '杂谈其他', '二游总结、录屏与安利'),
]

MOBILE_CATS = {'arknights', 'morimens', 'jx3', 'guangmang', 'shiwuyu'}

# 形式：多选
FORMS = [
    ('promo', '安利/推荐', r'安利|推荐|入坑'),
    ('guide', '攻略/成就', r'攻略|成就|repo|指南'),
    ('demo', '试玩/demo', r'试玩|demo|体验版|前瞻|尝鲜'),
    ('recap', '总结/盘点', r'总结|盘点|年度|回顾|合集|推荐单'),
    ('log', '记录/碎碎念', r'记录|碎碎念|日志'),
]

# 区域：单选，按顺序首个命中
REGIONS = [
    ('cn', '国产/国乙', r'国产|国乙|国风|中式|橙光'),
    ('en', '欧美/英乙', r'英乙|欧美|欧美风|西式'),
    ('jp', '日本/日乙', r'日乙|日式|和风|日系|日文'),
]

FACET_DEFS = [
    ('genre', '题材', 'multi', '来自简介里的作品介绍与标签，可多选'),
    ('plat', '游戏平台', 'multi', 'PC / Steam / 主机掌机 / 手机端 / 网页 等'),
    ('el', '要素', 'multi', '语音、结局数、画风、感情向等内容要素'),
    ('pz', '游戏价格', 'single', '按人民币折算后的价格分档'),
    ('len', '时长 / 体量', 'multi',
     '单条投稿全部分 P 的时长；游戏体量取该游戏最长一条单机实况（不含手游 / 抽卡）'),
    ('form', '视频形式', 'multi', ''),
    ('region', '地区/语种', 'single', '游戏原产地或本地化来源'),
]

PRICE_NAMES = [('free', '完全免费'), ('low', '≤¥30'), ('mid', '¥30–70'),
               ('high', '>¥70'), ('unknown', '未知/未标注')]
# 体量档与时长档合并进同一个 facet：前者是「这个游戏打完一遍多长」，
# 后者是「这条视频多长」。两者都只认单机实况，手游 / 抽卡 / 网游不参与。
SIZE_NAMES = [('g_xs', '实况 ≤2h'), ('g_s', '实况 2–8h'), ('g_m', '实况 8–20h'),
              ('g_l', '实况 20h+')]
VL_NAMES = [('vx', '单条 ≤5 分钟'), ('vs', '单条 5–20 分钟'), ('vm', '单条 20–60 分钟'),
            ('vl', '单条 1 小时以上')]


def classify(title, kind='video'):
    t = title or ''
    if kind == 'article':
        if '【攻略】' in t:
            return 'guide'
        if '【通关repo】' in t:
            return 'guide'
        if re.search(r'汉化', t):
            return 'hanhua'
        return 'other'
    if re.search(r'自汉化|汉化补丁|汉化发布|机翻', t):
        return 'hanhua'
    if '忘却前夜' in t:
        return 'morimens'
    if '明日方舟' in t:
        return 'arknights'
    # 剑三的 JJC 与公主连结的 JJC 是两回事，别混进同一个分区
    if re.search(r'剑网\s*3|剑网三|剑三', t):
        return 'jx3'
    if re.search(r'\bjjc\b', t, re.I) and not re.search(r'公主连结|公主链接|\bpcr\b', t, re.I):
        return 'jx3'
    if re.search(r'妖恋|光芒：', t):
        return 'guangmang'
    if re.search(r'食物语|梦间集', t):
        return 'shiwuyu'
    if re.search(r'攻略|成就|repo', t, re.I):
        return 'guide'
    if re.search(r'实况|通关|试玩|解说|初见|流程', t):
        return 'play'
    return 'other'


def parse_dur(s):
    if not s:
        return 0
    parts = [int(x) for x in re.findall(r'\d+', str(s))] or [0]
    sec = 0
    for p in parts:
        sec = sec * 60 + p
    return sec


def game_tag(title):
    m = re.findall(r'《([^》]{1,40})》', title or '')
    if m:
        return m[-1].strip()
    m = re.search(r'——\s*(.{2,30})$', title or '')
    return m.group(1).strip() if m else ''


def tags_of(text, rules):
    return [k for k, _, p in rules if p and re.search(p, text, re.I)]


def vl_bucket(dur):
    if not dur:
        return None
    if dur <= 300:
        return 'vx'
    if dur <= 1200:
        return 'vs'
    if dur <= 3600:
        return 'vm'
    return 'vl'


def annotate(title, cat, dur):
    """标题层面的维度：形式 / 地区 / 视频时长；其余维度来自游戏库

    时长只给单机实况：手游抽卡（明日方舟 / 忘却前夜 / 剑三 JJC …）不是「打完一遍」，
    混进时长与体量里只会把分档撑坏，所以连时长档都不写。"""
    t = title or ''
    pre = re.search(r'^【([^】]{1,24})】', t)
    scope = (pre.group(1) if pre else '') + ' ' + t
    # 分类进手游分区的也一并算手游：有的标题里没有关键词（例如公主连结的 jjc）
    mobile = is_mobile_title(t) or cat in MOBILE_CATS

    out = {}
    fm = tags_of(scope, FORMS)
    if cat == 'hanhua':
        fm.append('release')
    if fm:
        out['form'] = fm

    for k, _, p in REGIONS:
        if re.search(p, scope, re.I):
            out['region'] = k
            break
    else:
        out['region'] = 'other'

    v = vl_bucket(dur)
    if v and not mobile:
        out['vl'] = v
    return out


def main():
    vpath = os.path.join(RAW, 'up_videos_all.json')
    apath = os.path.join(RAW, 'up_articles.json')
    vids = json.load(open(vpath, encoding='utf-8')) if os.path.exists(vpath) else []
    arts = json.load(open(apath, encoding='utf-8')) if os.path.exists(apath) else []
    if not vids:
        raise SystemExit('up_videos_all.json 读不到投稿（%s），已中止，避免把 videos.json 写成空' % vpath)

    # ---- 游戏库 ----
    gpath = os.path.join(REPO, 'data', 'games.json')
    games, vidmap, gidx = [], {}, {}
    if os.path.exists(gpath):
        gd = json.load(open(gpath, encoding='utf-8'))
        games = gd.get('games') or []
        vidmap = gd.get('vidmap') or {}
        for g in games:
            gidx[g['id']] = g

    def game_of(gid):
        g = gidx.get(gid)
        if not g:
            return {}
        return {
            'plat': g.get('plat') or [],
            'genre': g.get('topics') or [],
            'el': g.get('els') or [],
            'pz': g.get('pz') or 'unknown',
            'gs': g.get('size') or '',
            'gn': g.get('name') or '',
            'gid': g.get('id') or '',
        }

    videos = []
    for v in vids:
        title = (v.get('title') or '').strip()
        cat = classify(title)
        pic = (v.get('pic') or '').replace('http://', 'https://')
        dur = parse_dur(v.get('duration'))
        item = {
            'id': v['bvid'],
            'title': title,
            'date': v.get('date') or '',
            'ts': v.get('created') or 0,
            'dur': dur,
            'durText': v.get('duration') or '',
            'play': v.get('play') or 0,
            'danmaku': v.get('danmaku') or 0,
            'pic': pic,
            'cat': cat,
            'game': game_tag(title),
        }
        item.update(annotate(title, cat, dur))
        g = game_of(vidmap.get(v['bvid']))
        if g:
            item.update(g)
        if is_mobile_title(title):
            # 手游 / 抽卡 / 网游：既不给时长档也不给体量档
            item.pop('vl', None)
            item.pop('gs', None)
        # 前端的「时长 / 体量」是一组多选筛：把两条口径合成一个 len 字段
        lens = [x for x in (item.get('vl'), item.get('gs')) if x]
        if lens:
            item['len'] = lens
        videos.append(item)

    articles = []
    for a in arts:
        title = (a.get('title') or '').strip()
        cat = classify(title, 'article')
        item = {
            'id': str(a['id']),
            'title': title,
            'date': a.get('date') or '',
            'ts': a.get('pubdate') or 0,
            'summary': re.sub(r'\s+', ' ', a.get('summary') or '')[:180],
            'pic': (a.get('banner') or '').replace('http://', 'https://'),
            'view': a.get('view') or 0,
            'like': a.get('like') or 0,
            'words': a.get('words') or 0,
            'cat': cat,
            'url': 'https://www.bilibili.com/read/cv%s' % a['id'],
        }
        item.update(annotate(title, cat, 0))
        articles.append(item)

    videos.sort(key=lambda x: x['ts'], reverse=True)
    articles.sort(key=lambda x: x['ts'], reverse=True)

    def counts(items):
        c = {}
        for x in items:
            c[x['cat']] = c.get(x['cat'], 0) + 1
        return c

    vc, ac = counts(videos), counts(articles)
    cats = [{'key': k, 'name': n, 'desc': d,
             'videos': vc.get(k, 0), 'articles': ac.get(k, 0)} for k, n, d in CATS]

    # ---- facet 汇总 ----
    def facet_items(key, table):
        items = []
        for ik, iname in table:
            n = 0
            for x in videos:
                val = x.get(key)
                if isinstance(val, list):
                    if ik in val:
                        n += 1
                elif val == ik:
                    n += 1
            if n:
                items.append({'key': ik, 'name': iname, 'videos': n})
        return items

    tables = {
        'genre': [(k, n) for k, n, _ in GENRES],
        'plat': [(k, PLAT_NAMES[k]) for k in PLAT_ORDER],
        'el': [(k, n) for k, n, _ in ELEMENTS],
        'pz': PRICE_NAMES,
        'len': VL_NAMES + SIZE_NAMES,
        'form': [('release', '汉化发布'), ('promo', '安利推荐'), ('guide', '攻略成就'),
                 ('demo', '试玩demo'), ('recap', '总结盘点'), ('log', '记录碎碎念')],
        'region': [('jp', '日本 / 日乙'), ('en', '欧美 / 英乙'), ('cn', '国产 / 国乙'),
                   ('other', '未标注')],
    }

    def len_items(table):
        """时长 / 体量是一个 facet 里两组口径：vl 看这条投稿，gs 看这个游戏"""
        out = []
        for ik, iname in table:
            n = sum(1 for x in videos if x.get('vl') == ik or x.get('gs') == ik)
            if n:
                out.append({'key': ik, 'name': iname, 'videos': n})
        return out

    facets = []
    for key, name, kind, hint in FACET_DEFS:
        items = len_items(tables[key]) if key == 'len' else facet_items(key, tables[key])
        if items:
            facets.append({'key': key, 'name': name, 'type': kind, 'hint': hint, 'items': items})

    # 微博统计（若已同步）
    wb_stats = {}
    wpath = os.path.join(REPO, 'data', 'weibo.json')
    if os.path.exists(wpath):
        try:
            wb = json.load(open(wpath, encoding='utf-8'))
            wb_stats = {'count': wb.get('count', 0), 'matched': wb.get('matched', 0),
                        'generated_at': wb.get('generated_at', '')}
        except Exception:
            pass

    out = {
        'meta': {
            'mid': MID,
            'name': '青灯不弈',
            'space': 'https://space.bilibili.com/%d' % MID,
            'generated_at': time.strftime('%Y-%m-%d %H:%M'),
            'video_count': len(videos),
            'article_count': len(articles),
            'space_total': SPACE_TOTAL,
            'game_count': len(games),
            'game_linked': sum(1 for x in videos if x.get('gid')),
            'weibo': wb_stats,
            'note': '数据来源：B 站投稿页简介（游戏名称/平台/价格）+ 空间投稿列表与专栏列表 + 微博同步',
        },
        'categories': cats,
        'facets': facets,
        'videos': videos,
        'articles': articles,
    }
    dst = os.path.join(REPO, 'data', 'videos.json')
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(dst, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print('videos', len(videos), 'articles', len(articles), '游戏关联', out['meta']['game_linked'])
    print('video cats', vc)
    for f_ in facets:
        print('  facet', f_['key'], f_['name'], [(i['name'], i['videos']) for i in f_['items']][:10])
    print('->', dst, os.path.getsize(dst) // 1024, 'KB')


if __name__ == '__main__':
    main()

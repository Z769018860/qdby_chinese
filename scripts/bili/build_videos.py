# -*- coding: utf-8 -*-
"""把抓取到的投稿视频与专栏整理成视频站数据 data/videos.json"""
import json, os, re, tempfile, time

BASE = os.path.dirname(os.path.abspath(__file__))
REPO = os.environ.get('QD_REPO') or os.path.normpath(os.path.join(BASE, '..', '..'))
RAW = os.environ.get('QD_CACHE') or os.path.join(tempfile.gettempdir(), 'qdby-bili')
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
    if re.search(r'剑网\s*3|剑网三|剑三|jjc', t, re.I):
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


def main():
    vpath = os.path.join(RAW, 'up_videos_all.json')
    apath = os.path.join(RAW, 'up_articles.json')
    vids = json.load(open(vpath, encoding='utf-8')) if os.path.exists(vpath) else []
    arts = json.load(open(apath, encoding='utf-8')) if os.path.exists(apath) else []

    videos = []
    for v in vids:
        title = (v.get('title') or '').strip()
        cat = classify(title)
        pic = v.get('pic') or ''
        pic = pic.replace('http://', 'https://')
        videos.append({
            'id': v['bvid'],
            'title': title,
            'date': v.get('date') or '',
            'ts': v.get('created') or 0,
            'dur': parse_dur(v.get('duration')),
            'durText': v.get('duration') or '',
            'play': v.get('play') or 0,
            'danmaku': v.get('danmaku') or 0,
            'pic': pic,
            'cat': cat,
            'game': game_tag(title),
        })

    articles = []
    for a in arts:
        title = (a.get('title') or '').strip()
        articles.append({
            'id': str(a['id']),
            'title': title,
            'date': a.get('date') or '',
            'ts': a.get('pubdate') or 0,
            'summary': re.sub(r'\s+', ' ', a.get('summary') or '')[:180],
            'pic': (a.get('banner') or '').replace('http://', 'https://'),
            'view': a.get('view') or 0,
            'like': a.get('like') or 0,
            'words': a.get('words') or 0,
            'cat': classify(title, 'article'),
            'url': 'https://www.bilibili.com/read/cv%s' % a['id'],
        })

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

    out = {
        'meta': {
            'mid': MID,
            'name': '青灯不弈',
            'space': 'https://space.bilibili.com/%d' % MID,
            'generated_at': time.strftime('%Y-%m-%d %H:%M'),
            'video_count': len(videos),
            'article_count': len(articles),
            'space_total': SPACE_TOTAL,
            'note': '数据来源：B 站个人空间投稿列表与专栏列表',
        },
        'categories': cats,
        'videos': videos,
        'articles': articles,
    }
    dst = os.path.join(REPO, 'data', 'videos.json')
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    json.dump(out, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('videos', len(videos), 'articles', len(articles))
    print('video cats', vc)
    print('article cats', ac)
    print('->', dst, os.path.getsize(dst) // 1024, 'KB')


if __name__ == '__main__':
    main()

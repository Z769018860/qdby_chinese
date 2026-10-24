# -*- coding: utf-8 -*-
"""把抓取到的投稿视频与专栏整理成视频站数据 data/videos.json

除原有分类外，额外给每条内容打上多维度标签（facet），供视频站细分筛选：
  题材 topic / 平台 plat / 体量 scale / 区域 region / 形式 form /
  视频时长 vl / 游戏价格 price / 游戏时长 gl

标签来源：
  1. 标题【】前缀与标题正文的关键词规则（覆盖绝大部分投稿）
  2. data.json 汉化作品库的字段（价格、游戏时长、平台域名、分级等），
     仅在标题中出现该作品名时继承，覆盖率有限，前端会标注可筛条数
"""
import json, os, re, tempfile, time
from urllib.parse import urlparse

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

MOBILE_CATS = {'arknights', 'morimens', 'jx3', 'guangmang', 'shiwuyu'}

# ---------------- 维度定义 ----------------
# 题材：多选。顺序即前端展示顺序
TOPICS = [
    ('mystery', '悬疑推理', r'悬疑|推理|探案|侦探|诡计|凶案|谋杀|破案|本格|神探|刑侦'),
    ('horror', '恐怖惊悚', r'恐怖|微恐|惊悚|灵异|诅咒|见鬼|怪谈'),
    ('gore', '猎奇血腥', r'猎奇|血腥|分尸|藏尸|肢解|重口'),
    ('yandere', '病娇偏执', r'病娇|偏执|强制爱|监禁|占有欲|黑化'),
    ('otome', '乙女恋爱', r'乙女|乙游|恋爱|男主|男友|老公|攻略对象|甜向'),
    ('puzzle', '解谜逃脱', r'解谜|解密|谜题|逃脱|密室'),
    ('comedy', '搞笑沙雕', r'沙雕|搞笑|轻喜剧|吐槽|整活|谐音梗'),
    ('healing', '治愈温情', r'治愈|温馨|暖心'),
    ('meta', 'meta元叙事', r'meta|电波|第四面墙|轮回|loop|Meta'),
    ('fantasy', '奇幻异世界', r'异世界|魔法|人外|恶魔|神明|妖怪|奇幻|吸血鬼|人偶'),
    ('campus', '校园青春', r'校园|学园|学生|社团|同级生|青春|学級'),
    ('action', '动作战斗', r'动作|战斗|格斗|无双'),
    ('roguelike', '卡牌肉鸽', r'肉鸽|roguelike|卡牌|构筑|抽卡'),
    ('scifi', '科幻末世', r'科幻|末世|赛博|废土|反乌托邦|太空'),
]

# 画风：多选
STYLES = [
    ('pixel', '像素风', r'像素'),
    ('handdrawn', '手绘绘本', r'手绘|绘本|水彩|手书|童话'),
    ('three_d', '3D/写实', r'3D|写实|真人'),
]

# 区域：单选，按顺序首个命中
REGIONS = [
    ('cn', '国产/国乙', r'国产|国乙|国风|中式|橙光'),
    ('en', '欧美/英乙', r'英乙|欧美|欧美风|西式'),
    ('jp', '日本/日乙', r'日乙|日式|和风|日系|日文'),
]

# 形式：多选
FORMS = [
    ('promo', '安利/推荐', r'安利|推荐|入坑'),
    ('guide', '攻略/成就', r'攻略|成就|repo|指南'),
    ('demo', '试玩/demo', r'试玩|demo|体验版|前瞻|尝鲜'),
    ('recap', '总结/盘点', r'总结|盘点|年度|回顾|合集|推荐单'),
    ('log', '记录/碎碎念', r'记录|碎碎念|日志'),
]

# 体量：单选，按顺序首个命中（手游/长线优先）
SCALES = [
    ('live', '长线运营', None),  # 由分类判定
    ('demo', '试玩/demo', r'试玩|demo|体验版|前瞻|第一章|更新到'),
    ('long', '长篇（8h+）', r'长篇|全结局|全路线|全流程|完结|多周目|全收集'),
    ('short', '短篇（≤2h）', r'短篇|小品|短流程|一分钟|速通'),
    ('mid', '中篇（2–8h）', r'中篇'),
]

FACET_DEFS = [
    ('topic', '题材', 'multi', '可多选，跨组合并列生效'),
    ('plat', '游戏平台', 'single', '手游/长线运营，与买断制单机区分'),
    ('scale', '游戏体量', 'single', '试玩、短篇、长篇等，长篇多为多结局全收集'),
    ('region', '地区/语种', 'single', '游戏原产地或本地化来源'),
    ('form', '视频形式', 'single', ''),
    ('vl', '视频时长', 'single', '单条视频本身的长度'),
    ('price', '游戏价格', 'single', '仅已关联汉化作品的投稿可筛'),
    ('gl', '游戏时长', 'single', '仅已关联汉化作品的投稿可筛'),
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


# ---------------- 作品库索引 ----------------
TRAD = {
    '純': '纯', '優': '优', '強': '强', '羅': '罗', '學': '学', '園': '园', '愛': '爱',
    '戀': '恋', '夢': '梦', '殺': '杀', '惡': '恶', '兒': '儿', '與': '与', '這': '这',
    '個': '个', '們': '们', '來': '来', '對': '对', '時': '时', '間': '间', '會': '会',
    '為': '为', '說': '说', '麼': '么', '裡': '里', '號': '号', '終': '终', '當': '当',
    '發': '发', '現': '现', '實': '实', '際': '际', '無': '无', '敵': '敌', '擊': '击',
    '戰': '战', '鬥': '斗', '動': '动', '場': '场', '樣': '样', '種': '种', '類': '类',
    '體': '体', '驗': '验', '應': '应', '該': '该', '讓': '让', '覺': '觉', '開': '开',
    '關': '关', '係': '系', '於': '于', '處': '处', '嗎': '吗', '從': '从', '後': '后',
    '選': '选', '擇': '择', '結': '结', '線': '线', '記': '记', '錄': '录', '憶': '忆',
    '遺': '遗', '親': '亲', '屬': '属', '帶': '带', '級': '级', '館': '馆', '廳': '厅',
    '樓': '楼', '門': '门', '燈': '灯', '煙': '烟', '藥': '药', '醫': '医', '護': '护',
    '屍': '尸', '靈': '灵', '龍': '龙', '鳳': '凤', '鳥': '鸟', '魚': '鱼', '貓': '猫',
    '補': '补', '縫': '缝', '學': '学', '壞': '坏', '殘': '残', '獨': '独', '絕': '绝',
    '斷': '断', '條': '条', '東': '东', '車': '车', '馬': '马', '點': '点', '戰': '战',
    '亂': '乱', '盡': '尽', '離': '离', '傷': '傷', '戀': '恋', '獄': '狱', '獵': '猎',
    '驗': '验', '驅': '驱', '誘': '诱', '騙': '骗', '謎': '谜', '偵': '侦', '兇': '凶',
}


def norm(s):
    s = (s or '').strip()
    s = ''.join(TRAD.get(c, c) for c in s)
    s = re.sub(r'[\s·・:：!！?？,，.。、~～\-—_（）()\[\]【】"“”\'’]+', '', s)
    return s.lower()


def url_platform(u):
    u = (u or '').strip()
    if not u.startswith('http'):
        return None
    h = urlparse(u).netloc.lower()
    if 'steampowered' in h or 'steam' in h:
        return ('steam', 'Steam')
    if 'itch.io' in h:
        return ('itch', 'itch.io')
    if 'booth' in h:
        return ('booth', 'BOOTH')
    if 'dlsite' in h:
        return ('dlsite', 'DLsite')
    if 'novelgame' in h:
        return ('novelgame', 'novelgame')
    if 'freem' in h:
        return ('freem', 'freem!')
    return ('other', '其他')


def price_bucket(s):
    s = (s or '').strip()
    if not s:
        return None
    if '免费' in s:
        return 'freedlc' if re.search(r'DLC.{0,6}付费|DLC付费', s) else 'free'
    m = re.search(r'(\d+(?:\.\d+)?)', s)
    if not m:
        return 'paid'
    v = float(m.group(1))
    if '$' in s:
        v *= 7.2
    elif '日元' in s or '円' in s:
        v *= 0.048
    return 'paid_low' if v <= 50 else 'paid_high'


def hours_bucket(s):
    """从『约4-6h』『30min』『约0.5–1h』等文本解析游戏时长档"""
    s = (s or '').lower().replace('–', '-').replace('~', '-')
    if not s:
        return None
    nums = [float(x) for x in re.findall(r'\d+(?:\.\d+)?', s) if float(x) < 500]
    if not nums:
        return None
    if 'min' in s and 'h' not in s:
        h = max(nums) / 60.0
    elif 'h' in s:
        h = max(nums)
    elif '小时' in s:
        h = max(nums)
    else:
        return None
    if h <= 0.5:
        return 'gl_xs'
    if h <= 2:
        return 'gl_s'
    if h <= 8:
        return 'gl_m'
    return 'gl_l'


def build_works(data):
    idx = {}
    for r in data:
        w = {
            'name': (r.get('汉化名') or '').strip(),
            'price': price_bucket(r.get('游戏价格')),
            'gl': hours_bucket(r.get('游戏时长')),
            'plat': url_platform(r.get('原版游戏地址')),
            'age': (r.get('年龄分级') or '').strip(),
            'lang': (r.get('原版语言') or '').strip(),
        }
        for k in ('汉化名', '游戏原名'):
            n = norm(r.get(k))
            if len(n) >= 3:
                idx.setdefault(n, w)
    return idx


def match_work(title, idx):
    t = norm(title)
    if not t:
        return None
    best = None
    for n, w in idx.items():
        if n in t:
            if best is None or len(n) > len(norm(best['name'])):
                best = w
    return best


def tags_of(text, rules):
    return [k for k, _, p in rules if p and re.search(p, text, re.I)]


def annotate(title, cat, dur, works):
    """返回该条内容的全部 facet 标签"""
    t = title or ''
    pre = re.search(r'^【([^】]{1,24})】', t)
    pre = pre.group(1) if pre else ''
    scope = pre + ' ' + t  # 前缀权重高，但正文也参与

    out = {}
    tp = tags_of(scope, TOPICS)
    st = tags_of(scope, STYLES)
    if tp or st:
        out['topic'] = tp + st

    out['plat'] = 'mobile' if cat in MOBILE_CATS or re.search(r'手游|二游|移动端', scope) else 'pc'

    region = 'other'
    for k, _, p in REGIONS:
        if re.search(p, scope, re.I):
            region = k
            break
    out['region'] = region

    scale = None
    if cat in MOBILE_CATS:
        scale = 'live'
    else:
        for k, _, p in SCALES:
            if p and re.search(p, scope, re.I):
                scale = k
                break
    if scale:
        out['scale'] = scale

    fm = tags_of(scope, FORMS)
    if cat == 'hanhua':
        fm.append('release')
    if fm:
        out['form'] = fm

    # 视频自身时长
    if dur:
        if dur <= 300:
            out['vl'] = 'vx'
        elif dur <= 1200:
            out['vl'] = 'vs'
        elif dur <= 3600:
            out['vl'] = 'vm'
        else:
            out['vl'] = 'vl'

    w = match_work(t, works)
    if w:
        out['wk'] = w['name']
        if w.get('price'):
            out['price'] = w['price']
        if w.get('gl'):
            out['gl'] = w['gl']
        if w.get('plat'):
            out['gplat'] = w['plat'][0]
    return out


# ---------------- facet 汇总 ----------------
FACET_ITEMS = {
    'topic': [('mystery', '悬疑推理'), ('horror', '恐怖惊悚'), ('gore', '猎奇血腥'),
              ('yandere', '病娇偏执'), ('otome', '乙女恋爱'), ('puzzle', '解谜逃脱'),
              ('comedy', '搞笑沙雕'), ('healing', '治愈温情'), ('meta', 'meta元叙事'),
              ('fantasy', '奇幻异世界'), ('campus', '校园青春'), ('action', '动作战斗'),
              ('roguelike', '卡牌肉鸽'), ('scifi', '科幻末世'),
              ('pixel', '像素风'), ('handdrawn', '手绘绘本'), ('three_d', '3D/写实')],
    'plat': [('mobile', '手游 / 长线运营'), ('pc', '买断制单机')],
    'scale': [('demo', '试玩 / demo'), ('short', '短篇 ≤2h'), ('mid', '中篇 2–8h'),
              ('long', '长篇 8h+'), ('live', '长线运营')],
    'region': [('jp', '日本 / 日乙'), ('en', '欧美 / 英乙'), ('cn', '国产 / 国乙')],
    'form': [('release', '汉化发布'), ('promo', '安利推荐'), ('guide', '攻略成就'),
             ('demo', '试玩demo'), ('recap', '总结盘点'), ('log', '记录碎碎念')],
    'vl': [('vx', '≤5 分钟'), ('vs', '5–20 分钟'), ('vm', '20–60 分钟'), ('vl', '1 小时以上')],
    'price': [('free', '完全免费'), ('freedlc', '免费 + 付费 DLC'),
              ('paid_low', '付费 ≤¥50'), ('paid_high', '付费 >¥50')],
    'gl': [('gl_xs', '≤30 分钟'), ('gl_s', '0.5–2 小时'), ('gl_m', '2–8 小时'), ('gl_l', '8 小时以上')],
}


def main():
    vpath = os.path.join(RAW, 'up_videos_all.json')
    apath = os.path.join(RAW, 'up_articles.json')
    vids = json.load(open(vpath, encoding='utf-8')) if os.path.exists(vpath) else []
    arts = json.load(open(apath, encoding='utf-8')) if os.path.exists(apath) else []

    dpath = os.path.join(REPO, 'data.json')
    works_data = json.load(open(dpath, encoding='utf-8')) if os.path.exists(dpath) else []
    works = build_works(works_data)

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
        item.update(annotate(title, cat, dur, works))
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
        item.update(annotate(title, cat, 0, works))
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

    # facet 计数
    facets = []
    for key, name, kind, hint in FACET_DEFS:
        items = []
        for ik, iname in FACET_ITEMS[key]:
            nv = 0
            for x in videos:
                val = x.get(key)
                if (isinstance(val, list) and ik in val) or val == ik:
                    nv += 1
            if nv:
                items.append({'key': ik, 'name': iname, 'videos': nv})
        if items:
            facets.append({'key': key, 'name': name, 'type': kind, 'hint': hint, 'items': items})

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
        'facets': facets,
        'videos': videos,
        'articles': articles,
    }
    dst = os.path.join(REPO, 'data', 'videos.json')
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    with open(dst, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print('videos', len(videos), 'articles', len(articles))
    print('video cats', vc)
    print('article cats', ac)
    print('works matched', sum(1 for x in videos if x.get('wk')))
    for f_ in facets:
        print('  facet', f_['key'], f_['name'], [(i['name'], i['videos']) for i in f_['items']][:8])
    print('->', dst, os.path.getsize(dst) // 1024, 'KB')


if __name__ == '__main__':
    main()

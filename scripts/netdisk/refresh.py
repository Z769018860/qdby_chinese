#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
refresh.py —— 汉化资源网盘链接抓取与核验（一键刷新）

流程：
  1. 读取仓库根目录 data.json，取每条游戏登记的「汉化发布地址」
  2. 解析 B 站视频（b23.tv 短链自动还原），抓取 视频简介 / UP主置顶评论 /
     UP主评论区补充 / B站专栏正文，提取其中的网盘链接与提取码
  3. 核验链接有效性：
       · API 通道：百度网盘、夸克网盘、UC网盘、123云盘、蓝奏云（多线程）
       · 浏览器通道：迅雷云盘、城通网盘、腾讯微云（SPA 页面，调用 check_spa.mjs）
  4. 生成 data/netdisk-links.json（结构化）、.md（可读台账）、.html（自包含页面）

用法：
    python scripts/netdisk/refresh.py              # 抓取 + 核验 + 生成
    python scripts/netdisk/refresh.py --no-check   # 只抓取与解析，不核验
    python scripts/netdisk/refresh.py --only baidu,quark

依赖：Python 3.9+ 标准库；核验 SPA 平台需 Node 18+ 与本机 Chrome/Edge。
"""
import argparse, gzip, json, os, re, ssl, subprocess, sys, tempfile, time
import urllib.request, urllib.parse, urllib.error
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
DATA_DIR = os.path.join(REPO, 'data')
CACHE = os.path.join(tempfile.gettempdir(), 'qdby-netdisk-cache')
RAW = os.path.join(CACHE, 'bili.json')

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

# ---------------------------------------------------------------- 通用网络请求


def http(url, data=None, referer='', headers=None, timeout=25):
    h = {'User-Agent': UA, 'Accept': '*/*', 'Accept-Encoding': 'gzip', 'Referer': referer}
    if data is not None:
        h['Content-Type'] = 'application/json'
        data = json.dumps(data).encode()
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=data, headers=h)
    try:
        r = urllib.request.urlopen(req, timeout=timeout, context=CTX)
        final, body, enc = r.geturl(), r.read(), r.headers.get('Content-Encoding')
    except urllib.error.HTTPError as e:          # 部分接口用 4xx 携带业务 JSON
        final, body, enc = e.geturl(), e.read(), e.headers.get('Content-Encoding')
    if enc == 'gzip':
        body = gzip.decompress(body)
    return final, body.decode('utf-8', 'replace')


def jget(url, **kw):
    return json.loads(http(url, **kw)[1])


def retry(fn, times=3, base=1.2):
    for i in range(times):
        try:
            return fn()
        except Exception:
            if i == times - 1:
                raise
            time.sleep(base * (i + 1))


# ---------------------------------------------------------------- 链接识别

PLATFORMS = [
    ('baidu',  '百度网盘',      r'pan\.baidu\.com|yun\.baidu\.com'),
    ('quark',  '夸克网盘',      r'pan\.quark\.cn'),
    ('uc',     'UC网盘',        r'drive\.uc\.cn'),
    ('xunlei', '迅雷云盘',      r'pan\.xunlei\.com'),
    ('123pan', '123云盘',       r'(?:www\.)?123(?:865|684|pan)\.com'),
    ('ctfile', '城通网盘',      r'ctfile\.com|ctcontents\.com'),
    ('weiyun', '腾讯微云',      r'share\.weiyun\.com'),
    ('lanzou', '蓝奏云',        r'lanzou[a-z]*\.com'),
    ('gdrive', 'Google云端硬盘', r'drive\.google\.com|drive\.usercontent\.google\.com'),
    ('aliyun', '阿里云盘',      r'(?:www\.)?(?:aliyundrive|alipan)\.com'),
    ('caiyun', '移动云盘',      r'caiyun\.139\.com'),
    ('115',    '115网盘',       r'115\.com'),
    ('189',    '天翼云盘',      r'cloud\.189\.cn'),
]

# 原版地址 / 素材站 / 社交平台，不视为网盘
NOT_NETDISK = re.compile(
    r'novelgame\.jp|freem\.ne\.jp|booth\.pm|itch\.io|steampowered\.com|bilibili\.com|b23\.tv'
    r'|weibo\.(?:com|cn)|youtube\.com|twitter\.com|x\.com|discord\.(?:gg|com)|note\.com'
    r'|fanbox|patreon|dlsite|getchu|amazon|google\.com|bing\.com|tieba|lofter\.com'
    r'|wixsite\.com|github\.com|vercel\.app|docs\.qq\.com|weixin\.qq\.com|miyoushe', re.I)

URL_RE = re.compile(r'(?:https?://)?(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}(?::\d+)?/[^\s<>"\'）)】，。、；;]*')

SOURCE_LABEL = {'desc': '视频简介', 'pinned': '置顶评论', 'up_comment': 'UP主评论区补充',
                'article': '专栏正文', 'site': '站点登记地址'}
SOURCE_ORDER = {'desc': 0, 'pinned': 1, 'up_comment': 2, 'article': 3, 'site': 4}


def platform_of(url):
    for key, name, pat in PLATFORMS:
        if re.search(pat, url, re.I):
            return key, name
    return 'other', '其他'


def normalize(u):
    u = u.strip().rstrip('.,;:!?)]}\u3002\uff0c\u3001\uff1b\uff09\uff1e')
    return u if u.startswith('http') else 'https://' + u


def find_pwd(url, ctx):
    m = re.search(r'[?&](?:pwd|password|passcode|code|p)=([A-Za-z0-9]{2,12})', url)
    if m:
        return m.group(1)
    m = re.search(r'(?:提取码|密码|访问码|口令)\s*[:：=]?\s*([A-Za-z0-9]{2,12})', ctx)
    return m.group(1) if m else None


def share_id(url, plat):
    rules = {'baidu': r'/s/([A-Za-z0-9_\-]+)', 'quark': r'/s/([A-Za-z0-9]+)',
             'uc': r'/s/([A-Za-z0-9]+)', 'xunlei': r'/s/([A-Za-z0-9]+)',
             '123pan': r'/s/([A-Za-z0-9\-]+)', 'weiyun': r'/([A-Za-z0-9]{6,})',
             'lanzou': r'/([A-Za-z0-9]{5,})'}
    pat = rules.get(plat)
    m = re.search(pat, url) if pat else None
    return m.group(1) if m else None


def extract_links(text):
    out, seen = [], set()
    for m in URL_RE.finditer(text or ''):
        raw = m.group(0)
        if not re.search(r'\.(?:com|cn|net|jp|io|me|top|xyz|cc|tv|org|app|co)\b', raw, re.I):
            continue
        if NOT_NETDISK.search(raw):
            continue
        url = normalize(raw)
        plat, _ = platform_of(url)
        if plat == 'other' or url in seen:
            continue
        seen.add(url)
        out.append((url, find_pwd(url, (text or '')[m.end():m.end() + 80]), plat))
    return out


# ---------------------------------------------------------------- 第 1 步：抓 B 站

SUPPLEMENT = {
    'BUSTAFELLOWS': {
        'source_type': 'bilibili_article',
        'note': '发布形式为 B 站专栏文章（非视频），链接取自专栏正文',
    },
    '戏剧之爱·安乐死': {'note': '站点登记的 b23.tv 短链已失效（404），原视频疑已被删除'},
    '自恋囚笼': {'note': '站点登记的 b23.tv 短链已失效（404），原视频疑已被删除'},
    'Dear Virgin': {'note': '站点登记仅微博发布地址，无 B 站视频'},
    '人类保管库': {'note': '站点登记为微博汉化合集发布页，无 B 站视频'},
    '关于埋葬某人的梦': {'note': '站点登记为微博汉化合集发布页，无 B 站视频'},
    '与死神的约会': {'note': '站点登记「被举报下架」，原视频已不存在'},
}


def bvid_of(url):
    m = re.search(r'/(BV[0-9A-Za-z]{10})', url)
    return m.group(1) if m else None


def resolve_short(url):
    try:
        r = urllib.request.Request(url, headers={'User-Agent': UA})
        with urllib.request.urlopen(r, timeout=20, context=CTX) as resp:
            return resp.geturl(), resp.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return getattr(e, 'url', url), ''
    except Exception:
        return url, ''


def fetch_video(entry):
    """抓单个发布地址：视频信息 + 置顶评论 + UP 主评论补充"""
    rec = {'game': entry['game'], 'source_url': entry['url'], 'bvid': None, 'aid': None,
           'title': None, 'owner': None, 'owner_mid': None, 'pubdate': None,
           'desc': None, 'pinned': None, 'pinned_author': None, 'up_comments': [], 'error': None}
    url = entry['url']
    try:
        if 'b23.tv' in url:
            url, body = resolve_short(url if url.startswith('http') else 'https://' + url)
            if '"code":-404' in body:
                rec['error'] = 'short_link_dead'
                return rec
        bv = bvid_of(url)
        if not bv:
            rec['error'] = 'no_bvid'
            return rec
        rec['bvid'] = bv
        v = retry(lambda: jget('https://api.bilibili.com/x/web-interface/view?bvid=' + bv))
        if v.get('code') != 0:
            rec['error'] = 'view_%s' % v.get('code')
            return rec
        d = v['data']
        o = d.get('owner') or {}
        rec.update(aid=d['aid'], title=d['title'], owner=o.get('name'), owner_mid=o.get('mid'),
                   pubdate=time.strftime('%Y-%m-%d', time.localtime(d['pubdate'])),
                   desc=d.get('desc') or '')

        # 评论接口偶发限流：返回 code=0 但列表为空、而视频确实有评论时，退避重试
        rp = {}
        for attempt in range(4):
            rp = retry(lambda: jget('https://api.bilibili.com/x/v2/reply?type=1&oid=%s&pn=1&sort=2&ps=20'
                                    % d['aid']))
            dd0 = rp.get('data') or {}
            has = bool(dd0.get('replies') or dd0.get('top_replies')
                       or (dd0.get('upper') or {}).get('top'))
            total = (dd0.get('page') or {}).get('acount') or 0
            if rp.get('code') == 0 and (has or total == 0):
                break
            time.sleep(2.5 * (attempt + 1))
        if rp.get('code') == 0 and rp.get('data'):
            dd = rp['data']
            up = dd.get('upper') or {}
            cand = up.get('top') or {}
            if not cand.get('content'):
                lst = dd.get('top_replies') or []
                if lst:
                    cand = lst[0]
            if cand.get('content'):
                rec['pinned'] = cand['content'].get('message') or ''
                rec['pinned_author'] = (cand.get('member') or {}).get('uname')

        for pn in (1, 2, 3):        # 评论区里 UP 主本人的补充说明
            try:
                rr = jget('https://api.bilibili.com/x/v2/reply?type=1&oid=%s&pn=%d&sort=2&ps=20'
                          % (d['aid'], pn))
            except Exception:
                break
            if rr.get('code') != 0 or not rr.get('data'):
                break
            for c in rr['data'].get('replies') or []:
                if str((c.get('member') or {}).get('mid')) == str(rec['owner_mid']):
                    rec['up_comments'].append(
                        {'date': time.strftime('%Y-%m-%d', time.localtime(c['ctime'])),
                         'text': (c.get('content') or {}).get('message') or ''})
                for sub in c.get('replies') or []:
                    if str((sub.get('member') or {}).get('mid')) == str(rec['owner_mid']):
                        rec['up_comments'].append(
                            {'date': time.strftime('%Y-%m-%d', time.localtime(sub['ctime'])),
                             'text': (sub.get('content') or {}).get('message') or ''})
            time.sleep(0.35)
        rec['up_comments'] = rec['up_comments'][:20]
    except Exception as e:
        rec['error'] = '%s: %s' % (type(e).__name__, str(e)[:100])
    return rec


def fetch_article(cv_id):
    """B 站专栏正文（需要先访问一次首页取 buvid cookie，否则会被风控 -352）"""
    try:
        jar = os.path.join(CACHE, 'cookie.txt')
        subprocess.run(['curl', '-s', '-m', '20', '-A', UA, '-c', jar, '-o', os.devnull,
                        'https://www.bilibili.com/'], check=False)
        subprocess.run(['curl', '-s', '-m', '20', '-A', UA, '-b', jar, '-c', jar,
                        '-H', 'Referer: https://www.bilibili.com/read/cv%s/' % cv_id,
                        'https://api.bilibili.com/x/article/view?id=%s' % cv_id,
                        '-o', os.path.join(CACHE, 'article.json')], check=False)
        d = json.load(open(os.path.join(CACHE, 'article.json'), encoding='utf-8'))
        if d.get('code') != 0:
            return None, d.get('code')
        text = re.sub(r'<[^>]+>', '\n', d['data']['content'])
        return d['data']['title'] + '\n\n' + re.sub(r'\n{2,}', '\n', text), 0
    except Exception as e:
        return None, str(e)


def fetch_article_browser(cv_id):
    """接口被风控时，用无头浏览器渲染专栏页并取正文"""
    try:
        fin = os.path.join(CACHE, 'art_in.json')
        fout = os.path.join(CACHE, 'art_out.json')
        json.dump([{'key': 'cv%d' % cv_id, 'platform': 'biliart',
                    'url': 'https://www.bilibili.com/read/cv%d/' % cv_id}],
                  open(fin, 'w', encoding='utf-8'), ensure_ascii=False)
        subprocess.run([os.environ.get('NODE_BIN', 'node'),
                        os.path.join(HERE, 'check_spa.mjs'), fin, fout], check=False)
        d = json.load(open(fout, encoding='utf-8'))[0]
        return (d.get('text') or '') if (d.get('text') and len(d['text']) > 200) else None
    except Exception:
        return None


def stage_fetch(reuse_cache=False):
    site = json.load(open(os.path.join(REPO, 'data.json'), encoding='utf-8'))
    if reuse_cache and os.path.exists(RAW):
        raw = json.load(open(RAW, encoding='utf-8'))
        print('[1/4] 复用缓存抓取结果 %d 条（--reuse-cache）' % len(raw))
        _ensure_article()
        return site, raw
    tasks = [{'game': x['汉化名'], 'url': (x.get('汉化发布地址') or '').strip()} for x in site]
    print('[1/4] 抓取 B 站发布页共 %d 条…' % len(tasks))
    with ThreadPoolExecutor(max_workers=6) as ex:
        raw = list(ex.map(fetch_video, tasks))
    json.dump(raw, open(RAW, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    _ensure_article()
    ok = sum(1 for r in raw if r['desc'] is not None)
    pin = sum(1 for r in raw if r['pinned'])
    print('      成功 %d 条｜含置顶评论 %d 条' % (ok, pin))
    return site, raw


def _ensure_article():
    art = os.path.join(CACHE, 'article.txt')
    if not os.path.exists(art):
        text, code = fetch_article(22831035)
        if not text:                      # 接口被风控时，用无头浏览器渲染兜底
            text = fetch_article_browser(22831035)
            code = code if text else code
        if text:
            open(art, 'w', encoding='utf-8').write(text)
            print('      专栏 cv22831035 已抓取')
        else:
            print('      专栏抓取失败（%s），可稍后重跑或手动补充' % code)


# ---------------------------------------------------------------- 第 2 步：解析链接

def stage_parse(site, raw):
    print('[2/4] 解析网盘链接与提取码…')
    by_bv = defaultdict(list)
    for r in raw:
        if r.get('bvid'):
            by_bv[r['bvid']].append(r['game'])
    art = os.path.join(CACHE, 'article.txt')
    art_text = open(art, encoding='utf-8').read() if os.path.exists(art) else ''

    games = []
    for idx, r in enumerate(raw):
        meta = next((x for x in site if x.get('汉化名') == r['game']), None)
        sup = SUPPLEMENT.get(r['game'], {})
        links, notes = [], []
        for key in ('desc', 'pinned'):
            for url, pwd, plat in extract_links(r.get(key) or ''):
                links.append({'url': url, 'platform': plat, 'pwd': pwd, 'source': key})
        for c in r.get('up_comments') or []:
            for url, pwd, plat in extract_links(c['text']):
                links.append({'url': url, 'platform': plat, 'pwd': pwd,
                              'source': 'up_comment', 'comment_date': c['date']})
        if sup.get('source_type') == 'bilibili_article' and art_text:
            for url, pwd, plat in extract_links(art_text):
                links.append({'url': url, 'platform': plat, 'pwd': pwd, 'source': 'article'})
        if not r.get('bvid'):       # 站点直接把网盘地址登记在「汉化发布地址」里
            for url, pwd, plat in extract_links(r['source_url']):
                links.append({'url': url, 'platform': plat, 'pwd': pwd, 'source': 'site'})

        uniq = {}
        for L in links:
            k = L['url']
            if k not in uniq:
                uniq[k] = L
            else:
                if SOURCE_ORDER[L['source']] < SOURCE_ORDER[uniq[k]['source']]:
                    keep = uniq[k]
                    uniq[k] = L
                    if not L.get('pwd'):
                        L['pwd'] = keep.get('pwd')
                elif not uniq[k].get('pwd') and L.get('pwd'):
                    uniq[k]['pwd'] = L['pwd']
        # 去掉被截断的重复链接（短的是另一条的前缀）
        urls = list(uniq)
        links = [uniq[u] for u in urls
                 if not any(o != u and u.rstrip('#') != o.rstrip('#')
                            and o.startswith(u.split('?')[0].split('#')[0]) and len(o) > len(u)
                            for o in urls)]

        for L in links:
            L['platform_name'] = platform_of(L['url'])[1]
            L['share_id'] = share_id(L['url'], L['platform'])

        err = r.get('error')
        if sup.get('note'):
            err = None            # 已有更具体的人工补充说明
        if err == 'short_link_dead':
            notes.append('B 站短链已失效（404），原视频疑已被删除')
        elif err and err.startswith('no_bvid'):
            u = r['source_url']
            if 'weibo' in u:
                notes.append('站点登记的是微博发布地址，无 B 站视频')
            elif 'read/cv' in u:
                notes.append('发布形式为 B 站专栏文章（非视频）')
            elif re.search(r'pan\.|drive\.|lanzou|weiyun', u, re.I):
                notes.append('站点直接把网盘地址登记在「汉化发布地址」中')
            else:
                notes.append('站点登记的发布地址不是可识别的 B 站视频')
        elif err:
            notes.append(err)
        seen_n, uniq_notes = set(), []
        for n in notes:
            if n not in seen_n:
                seen_n.add(n)
                uniq_notes.append(n)
        notes = uniq_notes
        if sup.get('note'):
            notes.append(sup['note'])
        others = [g for g in by_bv.get(r.get('bvid') or '', []) if g != r['game']]
        if others:
            notes.append('该视频为多游戏合集，同时收录：' + '、'.join(others))

        games.append({
            'name': r['game'],
            'bvid': r.get('bvid'),
            'bili_url': ('https://www.bilibili.com/video/' + r['bvid']) if r.get('bvid') else None,
            'video_title': r.get('title'),
            'up': r.get('owner'),
            'pubdate': r.get('pubdate'),
            'desc': r.get('desc'),
            'pinned_comment': r.get('pinned'),
            'pinned_author': r.get('pinned_author'),
            'release_url': r['source_url'],
            'release_type': sup.get('source_type') or ('bilibili_video' if r.get('bvid') else 'other'),
            'links': links,
            'notes': notes,
        })

    # 视频标题与游戏名不符（多为站点登记错位）
    bvmap = {g['name']: g['bvid'] for g in games}
    bvfreq = Counter(g['bvid'] for g in games if g['bvid'])
    names = [g['name'] for g in games]
    for g in games:
        t = g.get('video_title') or ''
        if not t or g['name'] in t or bvfreq.get(g['bvid'], 0) > 1:
            continue
        hit = [n for n in names if n != g['name'] and len(n) >= 3 and n in t
               and bvmap.get(n) != g['bvid']]
        if hit:
            g.setdefault('warnings', []).append(
                '视频标题疑似对应其他游戏（%s），站点登记的发布地址可能有误' % '、'.join(hit[:2]))
    total = sum(len(g['links']) for g in games)
    print('      游戏 %d 个｜网盘链接 %d 条' % (len(games), total))
    return games


# ---------------------------------------------------------------- 第 3 步：核验

def chk_baidu(L):
    if not L.get('share_id'):
        return 'unknown', '链接格式无法识别'
    d = retry(lambda: jget('https://pan.baidu.com/api/shorturlinfo?shorturl=%s&root=1' % L['share_id'],
                           referer='https://pan.baidu.com/'))
    e = d.get('errno')
    if e == 0:
        return 'ok', '分享有效'
    if e == -9:
        return 'ok', '分享有效（需提取码）'
    if e in (-62, -21):
        return 'dead', (d.get('show_msg') or '分享已取消/被删除')
    if e == 2:
        return 'dead', '链接参数错误或不存在'
    return 'unknown', 'errno=%s' % e


def _chk_ucquark(L, uc=False):
    if not L.get('share_id'):
        return 'unknown', '链接格式无法识别'
    if uc:
        api = 'https://pc-api.uc.cn/1/clouddrive/share/sharepage/token?pr=UCBrowser&fr=pc&uc_param_str='
        ref = 'https://drive.uc.cn/'
    else:
        api = 'https://drive-h.quark.cn/1/clouddrive/share/sharepage/token?pr=ucpro&fr=pc&uc_param_str='
        ref = 'https://pan.quark.cn/'
    d = retry(lambda: jget(api, data={'pwd_id': L['share_id'], 'passcode': L.get('pwd') or ''},
                           referer=ref))
    code, msg = d.get('code'), (d.get('message') or '')
    data = d.get('data') or {}
    title = data.get('title') or ''
    suffix = ('｜' + title) if title else ''
    if code == 0:
        return 'ok', '分享有效' + suffix
    if code == 41008:
        return 'ok', '分享有效（需提取码）' + suffix
    if code == 41010 or '违规' in msg:
        return 'dead', '分享已被封禁（文件涉及违规内容）'
    if code == 41006:
        return 'dead', '分享不存在（已被取消或删除）'
    if code in (41004, 41000, 41009):
        return 'dead', '分享已过期/被取消（%s）' % (msg or code)
    return 'unknown', 'code=%s %s' % (code, msg)


def chk_123(L):
    host = re.sub(r'^https?://', '', L['url']).split('/')[0]
    if not L.get('share_id'):
        return 'unknown', '链接格式无法识别'
    d = retry(lambda: jget('https://%s/api/share/info?shareKey=%s' % (host, L['share_id']),
                           referer='https://%s/' % host))
    if d.get('code') == 0:
        data = d.get('data') or {}
        name = data.get('ShareName') or ''
        if data.get('Expired'):
            return 'dead', '分享已过期'
        tail = ('｜' + name) if name else ''
        if data.get('Expired') is False and (data.get('Expiration') or ''):
            tail += '｜到期 ' + str(data['Expiration'])[:10]
        if data.get('HasPwd') and not L.get('pwd'):
            return 'ok', '分享有效（需提取码）' + tail
        return 'ok', '分享有效' + tail
    msg = d.get('message') or ''
    if any(k in msg for k in ('失效', '不存在', '删除')):
        return 'dead', msg
    return 'unknown', 'code=%s %s' % (d.get('code'), msg)


def chk_lanzou(L):
    try:
        _, html = http(L['url'], referer='https://www.lanzou.com/')
    except Exception as e:
        return 'unknown', '请求失败 %s' % str(e)[:60]
    if re.search(r'取消分享|文件不存在|已删除|来晚啦|链接失效|禁止分享|页面不存在', html):
        return 'dead', '文件已取消分享或不存在'
    m = re.search(r'<title>([^<]*)</title>', html)
    title = (m.group(1) if m else '').strip()
    size = re.search(r'文件大小：([^"<]*)', html)
    if title and '蓝奏云' in title:
        return 'ok', '分享有效｜' + title.replace('- 蓝奏云', '').strip()
    if size:
        return 'ok', '分享有效｜' + size.group(1).strip()
    return 'unknown', '页面结构异常'


def chk_gdrive(L):
    return 'unknown', '当前网络无法访问 Google（需代理）'


API_CHECKERS = {'baidu': chk_baidu, 'quark': _chk_ucquark,
                'uc': lambda L: _chk_ucquark(L, uc=True),
                '123pan': chk_123, 'lanzou': chk_lanzou, 'gdrive': chk_gdrive}
SPA_PLATFORMS = ('xunlei', 'ctfile', 'weiyun')

STATUS_LABEL = {'ok': '有效', 'dead': '失效', 'unknown': '待确认'}


def run_api_checks(links):
    items = [L for L in links if L['platform'] in API_CHECKERS]
    print('[3/4] API 通道核验 %d 条（百度/夸克/UC/123/蓝奏）…' % len(items))

    def one(L):
        try:
            return API_CHECKERS[L['platform']](L)
        except Exception as e:
            return 'unknown', '%s: %s' % (type(e).__name__, str(e)[:80])

    with ThreadPoolExecutor(max_workers=8) as ex:
        res = list(ex.map(one, items))
    for L, (st, detail) in zip(items, res):
        L['status'], L['detail'] = st, detail
    return Counter(r[0] for r in res)


def run_spa_checks(links, node_bin='node'):
    items = [L for L in links if L['platform'] in SPA_PLATFORMS]
    if not items:
        return Counter()
    print('[4/4] 浏览器通道核验 %d 条（迅雷/城通/微云），需要本机 Chrome 或 Edge…' % len(items))
    ts = str(int(time.time()))
    fin = os.path.join(CACHE, 'spa_in.json')
    fout = os.path.join(CACHE, 'spa_out.json')
    payload = [{'key': L['url'], 'platform': L['platform'], 'url': L['url'], 'pwd': L.get('pwd')}
               for L in items]
    json.dump(payload, open(fin, 'w', encoding='utf-8'), ensure_ascii=False)
    script = os.path.join(HERE, 'check_spa.mjs')
    try:
        subprocess.run([node_bin, script, fin, fout], check=False)
    except FileNotFoundError:
        print('      未找到 node，跳过浏览器核验（结果标记为待确认）')
        for L in items:
            L['status'], L['detail'] = 'unknown', '未执行浏览器核验'
        return Counter({'unknown': len(items)})

    got = {}
    if os.path.exists(fout):
        for x in json.load(open(fout, encoding='utf-8')):
            got[(x.get('platform'), x['url'])] = x
    for L in items:
        st, detail = classify_spa(got.get((L['platform'], L['url'])))
        L['status'], L['detail'] = st, detail
    return Counter(L['status'] for L in items)


def classify_spa(item):
    """根据渲染后的页面文本判定 SPA 类网盘状态"""
    if not item:
        return 'unknown', '未取得核验结果'
    text = re.sub(r'\s+', ' ', item.get('text') or '')
    plat = item.get('platform')
    if item.get('error'):
        return 'unknown', '页面加载失败：%s' % str(item['error'])[:60]
    if not text:
        return 'unknown', '页面无内容'

    if plat == 'xunlei':
        if re.search(r'分享不存在|已被删除|已失效|已被取消|该分享已过期|违规', text):
            return 'dead', '分享已失效/被取消'
        if item.get('pwdInvalid') and ('请输入提取码' in text or '加密文件' in text):
            return 'ok', '分享有效（需提取码，台账登记的提取码可能不正确）'
        exp = re.search(r'失效时间[:：]\s*([^\s]{2,12})', text)
        exp = ('｜' + exp.group(1)) if exp else ''
        hint = ''
        m = re.search(r'更新时间\s*(.+?)(保存到|分享者|$)', text)
        if m:
            hint = '｜' + m.group(1)[:60]
        if '全部文件' in text and '更新时间' in text:
            return ('ok', '分享有效（需提取码）' + exp + hint)
        if '请输入提取码' in text or '加密文件' in text:
            return 'ok', '分享有效（需提取码）'
        # 分享页头部存在即说明分享仍在（提取码错误时会跳到搜索结果页）
        if '的分享' in text and '失效时间' in text:
            if item.get('pwdInvalid'):
                return 'ok', '分享有效（需提取码，台账登记的提取码可能不正确）'
            return 'ok', '分享有效（需提取码）'
        return 'unknown', '页面状态无法判定'

    if plat == 'ctfile':
        if re.search(r'分享不存在或已被删除|文件不存在|已被删除|File does not exist', text):
            return 'dead', '文件不存在或已被删除'
        if '普通下载' in text or re.search(r'\d+(\.\d+)?\s?MB', text):
            m = re.search(r'登录\s*(.+?)(浏览|普通下载)', text)
            return 'ok', '分享有效' + (('｜' + m.group(1)[:60]) if m else '')
        if '请输入访问密码' in text:
            return 'ok', '分享有效（需访问密码）'
        return 'unknown', '页面状态无法判定'

    if plat == 'weiyun':
        if re.search(r'分享已失效|已被取消|不存在|已过期|已删除', text):
            return 'dead', '分享已失效/被取消'
        if '普通下载' in text or '保存微云' in text:
            m = re.search(r'大小\s*(.+?)(共|$)', text)
            return 'ok', '分享有效' + (('｜' + m.group(1)[:60]) if m else '')
        if '请输入提取码' in text:
            return 'ok', '分享有效（需提取码）'
        return 'unknown', '页面状态无法判定'

    return 'unknown', '未支持的平台'


# ---------------------------------------------------------------- 第 5 步：输出


def write_outputs(games, checked=True):
    os.makedirs(DATA_DIR, exist_ok=True)
    now = time.strftime('%Y-%m-%d %H:%M')
    total = sum(len(g['links']) for g in games)
    uniq = len({(L['platform'], L['url']) for g in games for L in g['links']})
    summary = Counter(L.get('status', 'unknown') for g in games for L in g['links'])
    plat_stat = defaultdict(Counter)
    for g in games:
        for L in g['links']:
            plat_stat[L['platform_name']][L.get('status', 'unknown')] += 1
        g['links_ok'] = sum(1 for L in g['links'] if L.get('status') == 'ok')
        g['links_dead'] = sum(1 for L in g['links'] if L.get('status') == 'dead')

    data = {'meta': {'generated_at': time.strftime('%Y-%m-%d %H:%M:%S'), 'checked_at': now,
                     'source_repo': 'Z769018860/qdby_chinese',
                     'source_site': 'https://qdby-chinese.vercel.app',
                     'note': '来源：B 站发布视频的简介 / UP主置顶评论 / 评论区补充 / 专栏正文',
                     'games': len(games), 'total_links': total, 'unique_links': uniq,
                     'checked': checked,
                     'summary': {'ok': summary.get('ok', 0), 'dead': summary.get('dead', 0),
                                 'unknown': summary.get('unknown', 0)},
                     'platform_summary': {k: dict(v) for k, v in plat_stat.items()}},
            'games': games}

    jf = os.path.join(DATA_DIR, 'netdisk-links.json')
    json.dump(data, open(jf, 'w', encoding='utf-8', newline='\n'), ensure_ascii=False, indent=1)

    # ---- Markdown ----
    md = ['# 汉化资源 · 网盘链接汇总\n',
          '> 由脚本自动生成，数据来源为个人汉化站在 B 站登记的发布视频：'
          '**视频简介**、**UP 主置顶评论**、UP 主评论区补充、专栏正文。\n',
          '> 仅供维护使用，**不在汉化主页上展示**。\n',
          '- 生成时间：%s' % now,
          '- 收录游戏 %d 个，网盘链接 %d 条（去重 %d 条）' % (len(games), total, uniq),
          '- 状态：有效 %d ／ 失效 %d ／ 待确认 %d\n' % (summary.get('ok', 0), summary.get('dead', 0),
                                              summary.get('unknown', 0)),
          '## 平台分布\n', '| 平台 | 有效 | 失效 | 待确认 | 合计 |', '| --- | ---: | ---: | ---: | ---: |']
    for p, c in sorted(plat_stat.items(), key=lambda x: -sum(x[1].values())):
        md.append('| %s | %d | %d | %d | %d |' % (p, c['ok'], c['dead'], c['unknown'], sum(c.values())))
    md.append('\n## 失效链接清单\n')
    deads = [(g['name'], L) for g in games for L in g['links'] if L.get('status') == 'dead']
    if deads:
        md += ['| 游戏 | 平台 | 链接 | 判定依据 |', '| --- | --- | --- | --- |']
        for n, L in deads:
            md.append('| %s | %s | %s | %s |' % (n, L['platform_name'], L['url'], L['detail']))
    else:
        md.append('无。')
    md.append('\n## 按游戏明细\n')
    for g in games:
        md.append('### ' + g['name'])
        info = []
        if g.get('bvid'):
            info.append('视频：[%s](%s)' % (g.get('video_title') or g['bvid'], g['bili_url']))
        if g.get('release_type') == 'bilibili_article':
            info.append('专栏：https://www.bilibili.com/read/cv22831035/')
        if g.get('up'):
            info.append('UP：' + g['up'])
        if g.get('pubdate'):
            info.append('发布：' + g['pubdate'])
        if info:
            md.append('\n' + ' ｜ '.join(info))
        for n in g.get('notes') or []:
            md.append('\n> ' + n)
        for w in g.get('warnings') or []:
            md.append('\n> ⚠️ ' + w)
        if g['links']:
            md += ['\n| # | 平台 | 链接 | 提取码 | 来源 | 状态 | 说明 |',
                   '| ---: | --- | --- | --- | --- | --- | --- |']
            for i, L in enumerate(g['links'], 1):
                md.append('| %d | %s | %s | %s | %s | %s | %s |' % (
                    i, L['platform_name'], L['url'], L.get('pwd') or '-',
                    SOURCE_LABEL.get(L['source'], L['source']),
                    {'ok': '✅ 有效', 'dead': '❌ 失效', 'unknown': '⚠️ 待确认'}[L.get('status', 'unknown')],
                    (L.get('detail') or '') + (('｜' + L['detail']) if False else '')))
        else:
            md.append('\n_未提取到网盘链接。_')
        md.append('')
    open(os.path.join(DATA_DIR, 'netdisk-links.md'), 'w', encoding='utf-8', newline='\n').write('\n'.join(md))

    # ---- HTML ----
    tpl = os.path.join(HERE, 'template.html')
    html = open(tpl, encoding='utf-8').read()
    html = (html.replace('__DATA__', json.dumps(data, ensure_ascii=False, separators=(',', ':')))
                .replace('__GEN__', now)
                .replace('__GAMES__', str(len(games)))
                .replace('__TOTAL__', str(total))
                .replace('__OK__', str(summary.get('ok', 0)))
                .replace('__DEAD__', str(summary.get('dead', 0)))
                .replace('__UNK__', str(summary.get('unknown', 0))))
    open(os.path.join(DATA_DIR, 'netdisk-links.html'), 'w', encoding='utf-8', newline='\n').write(html)

    print('\n完成：%s' % DATA_DIR)
    print('  游戏 %d｜链接 %d（去重 %d）｜有效 %d｜失效 %d｜待确认 %d'
          % (len(games), total, uniq, summary.get('ok', 0), summary.get('dead', 0),
             summary.get('unknown', 0)))
    for p, c in sorted(plat_stat.items(), key=lambda x: -sum(x[1].values())):
        print('  %-12s 有效 %-3d 失效 %-3d 待确认 %-3d' % (p, c['ok'], c['dead'], c['unknown']))


def main():
    ap = argparse.ArgumentParser(description='刷新汉化资源网盘链接台账')
    ap.add_argument('--no-check', action='store_true', help='只抓取解析，不核验有效性')
    ap.add_argument('--node', default='node', help='node 可执行文件路径')
    ap.add_argument('--reuse-cache', action='store_true',
                    help='复用上次抓取的 B 站原始数据（避免频繁请求触发限流）')
    args = ap.parse_args()
    os.environ['NODE_BIN'] = args.node
    os.makedirs(CACHE, exist_ok=True)

    site, raw = stage_fetch(reuse_cache=args.reuse_cache)
    games = stage_parse(site, raw)

    all_links, seen = [], set()
    for g in games:
        for L in g['links']:
            k = (L['platform'], L['url'])
            if k not in seen:
                seen.add(k)
                all_links.append(L)

    if args.no_check:
        for L in all_links:
            L['status'], L['detail'] = 'unknown', '本轮未核验'
    else:
        run_api_checks(all_links)
        run_spa_checks(all_links, node_bin=args.node)

    checked_at = time.strftime('%Y-%m-%d %H:%M')
    all_map = {(L['platform'], L['url']): L for L in all_links}
    for g in games:
        for L in g['links']:
            src = all_map[(L['platform'], L['url'])]
            L['status'] = src.get('status', 'unknown')
            L['detail'] = src.get('detail', '')
            L['status_text'] = STATUS_LABEL[L['status']]
            L['checked_at'] = checked_at

    write_outputs(games, checked=not args.no_check)


if __name__ == '__main__':
    main()

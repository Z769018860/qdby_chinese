# -*- coding: utf-8 -*-
"""通过 B 站 App 接口（已签名）拉取 UP 主全部投稿视频，cursor 翻页"""
import gzip, hashlib, json, os, ssl, tempfile, time, urllib.parse, urllib.request

UA = 'Mozilla/5.0 BiliDroid/6.0.0 (bbcallen@gmail.com) os/android'
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE
APPKEY, SECRET = '1d8b6e7d45233436', '560c52ccd288fed045859ed18bffd973'
VMID = 95687310
CACHE = os.environ.get('QD_CACHE') or os.path.join(tempfile.gettempdir(), 'qdby-bili')
os.makedirs(CACHE, exist_ok=True)
OUT = os.path.join(CACHE, 'up_videos_all.json')


def signed(params):
    q = urllib.parse.urlencode(sorted(params.items()))
    return q + '&sign=' + hashlib.md5((q + SECRET).encode()).hexdigest()


def fetch(params, tries=5):
    url = 'https://app.bilibili.com/x/v2/space/archive/cursor?' + signed(params)
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Encoding': 'gzip'})
            with urllib.request.urlopen(req, timeout=25, context=CTX) as r:
                b = r.read()
                if r.headers.get('Content-Encoding') == 'gzip':
                    b = gzip.decompress(b)
                return json.loads(b.decode('utf-8', 'replace'))
        except Exception as e:
            print('  retry %d: %s' % (i + 1, e))
            time.sleep(4 * (i + 1))
    return {}


def main():
    videos = {}
    if os.path.exists(OUT):
        for v in json.load(open(OUT, encoding='utf-8')):
            videos[v['bvid']] = v
        print('已有缓存', len(videos))

    cursor = ''
    total = 0
    for page in range(1, 80):
        p = {'appkey': APPKEY, 'vmid': VMID, 'ps': 20, 'mobi_app': 'android',
             'platform': 'android', 'ts': int(time.time()), 'order': 'pubdate'}
        if cursor:
            p['cursor'] = cursor
        d = fetch(p)
        if d.get('code') != 0:
            print('page %d code=%s %s' % (page, d.get('code'), d.get('message')))
            time.sleep(10)
            continue
        data = d.get('data') or {}
        items = data.get('item') or []
        total = data.get('count') or total
        for v in items:
            videos[v['bvid']] = {
                'bvid': v['bvid'],
                'aid': v.get('param') or v.get('aid'),
                'title': v.get('title'),
                'created': v.get('ctime'),
                'date': time.strftime('%Y-%m-%d', time.localtime(v.get('ctime') or 0)),
                'duration': v.get('duration'),
                'play': (v.get('stat') or {}).get('view') or v.get('play'),
                'danmaku': (v.get('stat') or {}).get('danmaku') or v.get('video_review'),
                'pic': v.get('cover') or v.get('pic'),
                'typeid': v.get('tid') or v.get('typeid'),
            }
        print('page %d: %d items, 累计 %d / %s' % (page, len(items), len(videos), total))
        arr = sorted(videos.values(), key=lambda x: x['created'] or 0, reverse=True)
        json.dump(arr, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        if not data.get('has_next') or not items:
            break
        cursor = data.get('next_cursor')
        if not cursor:
            break
        time.sleep(1.8)

    print('完成', len(videos), '总数', total)


if __name__ == '__main__':
    main()

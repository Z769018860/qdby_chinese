# -*- coding: utf-8 -*-
"""抓取 UP 主 95687310 的全部专栏文章（x/space/article 分页）"""
import json, gzip, os, ssl, tempfile, time, urllib.error, urllib.request

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE
MID = 95687310


def jget(url, tries=6):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': UA, 'Accept-Encoding': 'gzip',
                'Referer': 'https://space.bilibili.com/%d/article' % MID,
                'Accept': 'application/json, text/plain, */*'})
            with urllib.request.urlopen(req, timeout=25, context=CTX) as r:
                b = r.read()
                if r.headers.get('Content-Encoding') == 'gzip':
                    b = gzip.decompress(b)
                return json.loads(b.decode('utf-8', 'replace'))
        except urllib.error.HTTPError as e:
            if e.code in (412, 429):
                time.sleep(6 * (i + 1))
                continue
            return {'code': -e.code}
    return {}


def main():
    out, seen = [], set()
    total = None
    for pn in range(1, 40):
        u = ('https://api.bilibili.com/x/space/article?mid=%d&ps=30&pn=%d&sort=publish_time'
             % (MID, pn))
        d = jget(u)
        if d.get('code') != 0:
            print('pn', pn, 'code', d.get('code'), d.get('message'))
            time.sleep(8)
            continue
        arts = (d.get('data') or {}).get('articles') or []
        total = (d.get('data') or {}).get('counts') or total
        if not arts:
            break
        for a in arts:
            if a['id'] in seen:
                continue
            seen.add(a['id'])
            p = a.get('publish_time') or a.get('ctime') or 0
            out.append({
                'id': a['id'],
                'title': a.get('title'),
                'summary': (a.get('summary') or '').strip(),
                'banner': a.get('banner_url') or (a.get('image_urls') or [None])[0],
                'images': a.get('image_urls') or [],
                'category': ((a.get('category') or {}).get('name')
                             or ((a.get('categories') or [{}])[-1] or {}).get('name')),
                'pubdate': p,
                'date': time.strftime('%Y-%m-%d', time.localtime(p)) if p else '',
                'view': a.get('stats', {}).get('view') if isinstance(a.get('stats'), dict) else a.get('view'),
                'like': a.get('stats', {}).get('like') if isinstance(a.get('stats'), dict) else a.get('like'),
                'words': a.get('words') or a.get('word_count'),
            })
        print('pn %d: +%d, total %d / %s' % (pn, len(arts), len(out), total))
        if total and len(out) >= int(total):
            break
        time.sleep(2.0)
    out.sort(key=lambda x: x['pubdate'], reverse=True)
    cache = os.environ.get('QD_CACHE') or os.path.join(tempfile.gettempdir(), 'qdby-bili')
    os.makedirs(cache, exist_ok=True)
    json.dump(out, open(os.path.join(cache, 'up_articles.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    print('saved', len(out))


if __name__ == '__main__':
    main()

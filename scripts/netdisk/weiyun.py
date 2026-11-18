# -*- coding: utf-8 -*-
"""腾讯微云分享下载（share.weiyun.com）

为什么这么写
------------
微云分享页的下载按钮走一套 webapp/json 的 RPC，路径形如
    POST https://share.weiyun.com/webapp/json/<protocol>/<name>?refer=..&g_tk=..&r=..
body 里 req_header / req_body 都是 **JSON 字符串**（不是对象），
req_body 的业务字段键名是 `.weiyun.<name>MsgReq_body`。

实测结论：
  * 分享内容本身不登录也能看：GET 分享页会把 `window.syncData` 直接 SSR 进 HTML，
    带密码的分享用 `weiyunShareNoLogin/WeiyunShareView` 传 share_pwd 也能拿到 file_list。
  * 取下载直链必须登录：`weiyunShare/WeiyunShareBatchDownload` 匿名返回
    `{"ret":-3000,"msg":"(-3000)无登录态，请重新登录"}`。
  * g_tk 就是 cookie 里的 `wyctoken`（未登录访问一次也会下发），
    填错（比如用 QQ 的 5381 算法）会直接 403。
  * 直链下载还要带响应里给的 `FTN5K` cookie，UA 用普通 Chrome 即可。

登录态来源
----------
浏览器（360 极速 X / Edge / Chrome）开着时 Cookies 库是被独占锁住的，
连只读都打不开（Windows 共享冲突），所以只能等浏览器关掉再读，
这一段直接复用 scripts/netdisk/browser_cookies.py。

用法
----
    python scripts/netdisk/weiyun.py view  <share_key> [pwd]
    python scripts/netdisk/weiyun.py get   <share_key> [pwd] --out 本地文件.zip
    python scripts/netdisk/weiyun.py cookie            # 只打印能拿到的 cookie 名
"""
from __future__ import annotations

import argparse
import json
import os
import random
import re
import sys
import time

import requests

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
COOKIE_CACHE = os.path.join(WORK, 'weiyun-cookie.json')

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36')
ORIGIN = 'https://share.weiyun.com'
APPID_WEB_SHARE = 30113          # share.weiyun.com 桌面端的 appid
CMD_SHARE_VIEW = 12002
CMD_SHARE_BATCH_DOWNLOAD = 12024

# 本机浏览器的 User Data 目录（有顺序，先试常用的）
PROFILES = [
    (r'C:/Users/Administrator/AppData/Local/360ChromeX/Chrome/User Data', 'Default'),
    (r'C:/Users/Administrator/AppData/Local/Microsoft/Edge/User Data', 'Default'),
    (r'C:/Users/Administrator/AppData/Local/Google/Chrome/User Data', 'Default'),
]
COOKIE_DOMAINS = ['share.weiyun.com', 'weiyun.com']


class NeedLogin(RuntimeError):
    pass


def new_session(cookies: dict | None = None) -> requests.Session:
    s = requests.Session()
    s.headers.update({'User-Agent': UA, 'Content-Type': 'application/json'})
    # 先摸一下分享首页，拿到匿名 wyctoken / TOK / fingerprint
    s.get(ORIGIN, timeout=20)
    for k, v in (cookies or {}).items():
        if v:
            s.cookies.set(k, v, domain='share.weiyun.com')
            s.cookies.set(k, v, domain='.weiyun.com')
    return s


# ----------------------------------------------------------------- 登录态

def load_saved_cookies() -> dict:
    if not os.path.exists(COOKIE_CACHE):
        return {}
    try:
        with open(COOKIE_CACHE, 'r', encoding='utf-8') as f:
            d = json.load(f)
        return d.get('map') or d
    except Exception:
        return {}


def read_browser_cookies() -> dict:
    """从本机浏览器读微云 cookie；浏览器没关会读不到，返回空。"""
    sys.path.insert(0, HERE)
    try:
        import browser_cookies as bc
    except Exception:
        return {}
    for prof, sub in PROFILES:
        if not os.path.isdir(prof):
            continue
        cks = bc.read_cookies_direct(prof, sub)
        if not cks:
            continue
        got = {}
        for c in cks:
            host = (c.get('host_key') or '').lstrip('.')
            if not (host == 'weiyun.com' or host.endswith('.weiyun.com')):
                continue
            got[c['name']] = c['value']
        if got.get('uin') or got.get('wx_uid') or got.get('p_skey') or got.get('access_token'):
            with open(COOKIE_CACHE, 'w', encoding='utf-8') as f:
                json.dump({'map': got, 'from': prof, 'at': time.strftime('%Y-%m-%d %H:%M')},
                          f, ensure_ascii=False, indent=1)
            return got
    return {}


def cookies(force_read: bool = False) -> dict:
    ck = {} if force_read else load_saved_cookies()
    if not ck:
        ck = read_browser_cookies()
    return ck


# ----------------------------------------------------------------- RPC

def _rpc(s: requests.Session, protocol: str, name: str, cmd: int, data: dict,
         login: bool = False, refer: str = '') -> dict:
    gtk = s.cookies.get('wyctoken') or 5381
    hdr = {
        'seq': int(time.time()) + random.randint(0, 9999),
        'type': 1, 'cmd': cmd, 'appid': APPID_WEB_SHARE,
        'version': 3, 'major_version': 3, 'minor_version': 3, 'fix_version': 3,
        'device_info': json.dumps({'browser': 'chrome'}),
        'user_flag': 0, 'env_id': '',
    }
    if login:
        # 登录态下把 uin 也带上，服务端会按 uin 找会话
        uin = s.cookies.get('uin') or s.cookies.get('wx_uid') or ''
        if uin:
            hdr['uin'] = re.sub(r'^o0*', '', uin)
    body = {'ReqMsg_body': {
        'ext_req_head': {'token_info': _token_info(s), 'language_info': {'language_type': 2052}},
        '.weiyun.' + name + 'MsgReq_body': data,
    }}
    url = f'{ORIGIN}/webapp/json/{protocol}/{name}'
    r = s.post(url,
               params={'refer': 'chrome_windows', 'g_tk': gtk, 'r': round(random.random(), 16)},
               json={'req_header': json.dumps(hdr), 'req_body': json.dumps(body)},
               headers={'Referer': refer or ORIGIN}, timeout=30)
    if r.status_code == 403:
        raise RuntimeError('403（多半是 g_tk/wyctoken 不匹配或没登录态）')
    if r.status_code != 200:
        raise RuntimeError(f'HTTP {r.status_code}: {r.text[:200]}')
    try:
        d = r.json()
    except Exception:
        raise RuntimeError(f'返回不是 JSON: {r.text[:200]}')
    if d.get('ret'):
        raise RuntimeError(f"ret={d.get('ret')} {d.get('msg')}")
    head = (d.get('data') or {}).get('rsp_header') or {}
    if head.get('retcode'):
        raise RuntimeError(f"retcode={head.get('retcode')} {head.get('retmsg')}")
    return ((d.get('data') or {}).get('rsp_body') or {}).get('RspMsg_body') or {}


def _token_info(s: requests.Session) -> dict:
    if s.cookies.get('p_skey'):
        return {'token_type': 0, 'login_key_type': 27, 'login_key_value': s.cookies.get('p_skey')}
    if s.cookies.get('access_token'):
        return {'token_type': 1, 'openid': s.cookies.get('openid') or '',
                'open_appid': s.cookies.get('wy_appid') or '',
                'access_token': s.cookies.get('access_token'), 'login_key_type': 192,
                'login_key_value': s.cookies.get('access_token')}
    return {'token_type': 0, 'login_key_type': 27, 'login_key_value': ''}


# ----------------------------------------------------------------- 业务

def share_view(s: requests.Session, key: str, pwd: str = '') -> dict:
    """不登录取分享内容。第一次用 SSR 的 syncData，带密码或拿不到时走 RPC。"""
    r = s.get(f'{ORIGIN}/{key}', timeout=30)
    info = {}
    m = re.search(r'window\.syncData *= *(\{.*?\});\s*</script>', r.text, re.S)
    if m:
        try:
            info = json.loads(m.group(1)).get('shareInfo') or {}
        except Exception:
            info = {}
    if not info.get('file_list'):
        info = _rpc(s, 'weiyunShareNoLogin', 'WeiyunShareView', CMD_SHARE_VIEW,
                    {'share_key': key, 'share_pwd': pwd, 'local_page_context': ''},
                    refer=f'{ORIGIN}/{key}')
    if not info.get('file_list'):
        raise RuntimeError('分享里没有文件（提取码错误 / 分享已失效）')
    return info


def batch_download(s: requests.Session, key: str, pwd: str, info: dict) -> dict:
    files = [{'pdir_key': f['pdir_key'], 'file_id': f['file_id'],
              'filename': f['file_name'], 'file_size': f['file_size']}
             for f in info['file_list']]
    body = {'share_key': key, 'pwd': pwd, 'file_owner': info.get('share_uin') or 0,
            'download_type': 0, 'file_list': files}
    try:
        return _rpc(s, 'weiyunShare', 'WeiyunShareBatchDownload', CMD_SHARE_BATCH_DOWNLOAD,
                    body, login=True, refer=f'{ORIGIN}/{key}')
    except RuntimeError as e:
        if '-3000' in str(e) or '无登录态' in str(e):
            raise NeedLogin('微云未登录') from None
        raise


def download_file(s: requests.Session, dl: dict, out: str, chunk: int = 1 << 20) -> str:
    url = dl.get('https_download_url') or dl.get('download_url')
    if not url:
        raise RuntimeError(f'没有下载直链: {list(dl)[:12]}')
    if url.startswith('//'):
        url = 'https:' + url
    ck = {}
    if dl.get('cookie_name'):
        ck[dl['cookie_name']] = dl.get('cookie_value') or ''
    else:
        ck['FTN5K'] = dl.get('cookie_value') or ''
    os.makedirs(os.path.dirname(os.path.abspath(out)) or '.', exist_ok=True)
    tmp = out + '.part'
    total = int(dl.get('file_size') or 0)
    done = 0
    t0 = time.time()
    with s.get(url, cookies=ck, stream=True, timeout=60,
               headers={'User-Agent': UA, 'Referer': ORIGIN}) as r:
        r.raise_for_status()
        with open(tmp, 'wb') as f:
            for buf in r.iter_content(chunk):
                if not buf:
                    continue
                f.write(buf)
                done += len(buf)
                if total:
                    pct = done * 100.0 / total
                    speed = done / max(time.time() - t0, 1e-6) / 1048576
                    sys.stderr.write('\r  %5.1f%%  %6.1f MB / %6.1f MB  %5.2f MB/s' %
                                     (pct, done / 1048576, total / 1048576, speed))
                    sys.stderr.flush()
    sys.stderr.write('\n')
    os.replace(tmp, out)
    return out


def open_share(key: str, pwd: str = '', force_read_cookie: bool = False):
    """返回 (session, share_info, 登录 cookie 字典)；session 已带登录态。"""
    ck = cookies(force_read_cookie)
    s = new_session(ck)
    info = share_view(s, key, pwd)
    return s, info, ck


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('action', choices=['view', 'get', 'cookie'])
    ap.add_argument('share', nargs='?')
    ap.add_argument('pwd', nargs='?', default='')
    ap.add_argument('--out', default='')
    ap.add_argument('--outdir', default='H:/Temp/weiyun')
    args = ap.parse_args()

    if args.action == 'cookie':
        ck = cookies(force_read=True)
        if not ck:
            print('读不到微云 cookie：浏览器多半还开着（Cookies 被独占）')
            sys.exit(2)
        print('域名 share.weiyun.com：' + ', '.join(sorted(ck)))
        return

    key = args.share
    pwd = args.pwd or ''
    ck = cookies()
    s = new_session(ck)
    info = share_view(s, key, pwd)
    print(f"分享：{info.get('share_name')}  文件 {len(info['file_list'])} 个")
    for f in info['file_list']:
        print('  %-60s %8.1f MB' % (f['file_name'], f['file_size'] / 1048576))

    if args.action == 'view':
        return
    dl = batch_download(s, key, pwd, info)
    first = (dl.get('file_list') or [dl])[0]
    out = args.out or os.path.join(args.outdir, first.get('filename') or info['share_name'])
    download_file(s, first, out)
    print('已保存：%s' % out)


if __name__ == '__main__':
    main()

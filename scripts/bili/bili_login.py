# -*- coding: utf-8 -*-
"""B 站登录态：扫码登录 + 登录态自检

为什么需要它
------------
自动补档链路上有两处要用 B 站登录态：
  · refresh.py 抓视频评论区里的网盘链接（别人补的档从这里捡回来）
  · post_comments.py 把补好的新链接发到视频置顶评论下
登录态过期后这两步会静默失败（表现为「抓不到链接 / 发不出评论」），
所以需要一个能自己续期的入口。

为什么不做「从浏览器导出 cookie」
--------------------------------
Chromium 系浏览器运行时 Cookies 数据库是被独占锁住的，复制出来必然
PermissionError；而关掉用户的浏览器再导出又太粗暴。这里直接用 B 站官方
的扫码登录接口，不碰任何浏览器。

用法：
    python scripts/bili/bili_login.py --check          # 只体检，不改任何文件
    python scripts/bili/bili_login.py                  # 出二维码 → 扫码 → 落地 cookie
    python scripts/bili/bili_login.py --qr-only        # 只出二维码，不轮询（给别的进程用）

扫码成功后写到仓库外两处：
    work/bili_cookies.json   —— 专属 B 站，本脚本与后续新脚本优先读它
    work/ck360_all.json      —— 旧脚本（post_comments.py 等）读的快照，同步更新 bilibili 段

cookie 只落地在仓库外，不进 git。
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time

import requests

BASE = os.path.dirname(os.path.abspath(__file__))
REPO = os.environ.get('QD_REPO') or os.path.normpath(os.path.join(BASE, '..', '..'))
WORK = os.environ.get('QD_WORK') or os.path.normpath(os.path.join(REPO, '..'))

# 仓库外的 cookie 位置
CK_BILI = os.path.join(WORK, 'bili_cookies.json')
CK_360 = os.path.join(WORK, 'ck360_all.json')
QR_PNG = os.path.join(WORK, 'bili_qr.png')

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36')

# B 站要求的完整登录态字段（少了哪个 nav 都会返回 -101）
KEEP = ['DedeUserID', 'DedeUserID__ckMd5', 'SESSDATA', 'bili_jct', 'buvid3', 'buvid4']


def _session(cookies: dict | None = None) -> requests.Session:
    s = requests.Session()
    s.headers.update({'User-Agent': UA, 'Referer': 'https://www.bilibili.com/'})
    if cookies:
        for k, v in cookies.items():
            s.cookies.set(k, v, domain='.bilibili.com', path='/')
    return s


def load_cookies() -> dict:
    """按顺序读：bili_cookies.json → ck360_all.json 里的 bilibili 段"""
    if os.path.exists(CK_BILI):
        try:
            d = json.load(open(CK_BILI, encoding='utf-8'))
            if isinstance(d, dict) and d.get('SESSDATA'):
                return {k: v for k, v in d.items() if v}
        except Exception:
            pass
    if os.path.exists(CK_360):
        try:
            ck = json.load(open(CK_360, encoding='utf-8'))
            d = {}
            for c in ck:
                h = (c.get('host') or '').lstrip('.')
                if h == 'bilibili.com' or h.endswith('.bilibili.com'):
                    d[c['name']] = c['value']
            return {k: v for k, v in d.items() if v}
        except Exception:
            pass
    return {}


def bili_sess(cookies: dict | None = None) -> requests.Session:
    """给其它脚本用：拿一个带有效 B 站登录态的 requests.Session"""
    return _session(cookies or load_cookies())


def nav(cookies: dict) -> dict:
    try:
        j = _session(cookies).get('https://api.bilibili.com/x/web-interface/nav',
                                  timeout=25).json()
    except Exception as e:
        return {'code': -1, 'message': f'请求失败：{e}'}
    return j


def check(verbose: bool = True) -> bool:
    ck = load_cookies()
    if not ck.get('SESSDATA'):
        print('B 站登录态：没有 cookie（需要扫码登录）')
        return False
    j = nav(ck)
    ok = j.get('code') == 0 and (j.get('data') or {}).get('isLogin')
    if verbose:
        if ok:
            print(f"B 站登录态：有效（{(j.get('data') or {}).get('uname')} / mid={ck.get('DedeUserID')}）")
        else:
            print(f"B 站登录态：失效（code={j.get('code')} {j.get('message')}）→ 跑一次 bili_login.py 扫码续期")
    return bool(ok)


def make_qr(url: str, png_path: str) -> bool:
    """把扫码页的 URL 变成二维码图片。优先本地 qrcode 库，没有就用在线服务。"""
    try:
        import qrcode  # type: ignore
        img = qrcode.make(url)
        img.save(png_path)
        return True
    except Exception:
        pass
    try:
        r = requests.get('https://api.qrserver.com/v1/create-qr-code/',
                         params={'size': '360x360', 'data': url}, timeout=25)
        if r.status_code == 200 and len(r.content) > 500:
            with open(png_path, 'wb') as f:
                f.write(r.content)
            return True
    except Exception as e:
        print(f'  二维码生成失败：{e}')
    return False


def new_qrcode() -> tuple[str, str, requests.Session]:
    """取二维码。generate → poll → 落地 cookie 必须共用同一个 session，
    否则 B 站会把每次请求当成没扫码的新会话（poll 会立刻返回空结果）。"""
    s = _session()
    # 先访问一次主站拿到 buvid3/4、b_nut，风控会校验这些
    try:
        s.get('https://www.bilibili.com/', timeout=25)
    except Exception:
        pass
    j = s.get('https://passport.bilibili.com/x/passport-login/web/qrcode/generate', timeout=25).json()
    if j.get('code') != 0:
        raise RuntimeError(f"取二维码失败：{j.get('message') or j}")
    d = j.get('data') or {}
    return d['qrcode_key'], d['url'], s


def poll(s: requests.Session, key: str, timeout: int = 180, interval: float = 2.0):
    """轮询扫码结果，返回 (state, payload)。state: ok / expired / timeout / err"""
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            j = s.get('https://passport.bilibili.com/x/passport-login/web/qrcode/poll',
                      params={'qrcode_key': key}, timeout=25).json()
        except Exception as e:
            return 'err', {'message': str(e)}
        code = j.get('code')
        data = j.get('data') or {}
        if code == 0 and data.get('url'):
            return 'ok', data
        if code == 86038:      # 二维码已失效
            return 'expired', data
        # 86039=已扫码待确认 / 86090=二维码已扫码未确认，继续等
        time.sleep(interval)
    return 'timeout', {}


def harvest_cookies(s: requests.Session, data: dict) -> dict:
    """扫码成功后，B 站会返回一个 crossDomain 链接，必须真的访问一次才落 cookie"""
    url = data.get('url') or ''
    if not url:
        return {}
    try:
        s.get(url, timeout=25, allow_redirects=True)
    except Exception as e:
        print(f'  落地 cookie 时请求异常：{e}')
    # 接口也会直接把关键字段放在返回里，兜底用上
    got = {k: v for k, v in (s.cookies.get_dict() or {}).items()}
    for k in KEEP:
        if not got.get(k) and data.get(k):
            got[k] = data[k]
    # 有些版本把 cookie 直接拼在 url 上
    if 'SESSDATA=' in url and not got.get('SESSDATA'):
        from urllib.parse import urlparse, parse_qs
        for k, v in parse_qs(urlparse(url).query).items():
            if k in KEEP:
                got.setdefault(k, v[0])
    # 补 buvid（B 站风控会校验，没有就现取一个）
    if not got.get('buvid3'):
        try:
            bj = _session().get('https://api.bilibili.com/x/frontend/finger/spi', timeout=20).json()
            bd = bj.get('data') or {}
            got['buvid3'] = bd.get('b_3', '')
            got['buvid4'] = bd.get('b_4', '')
        except Exception:
            pass
    return {k: v for k, v in got.items() if v}


def save(cookies: dict):
    os.makedirs(WORK, exist_ok=True)
    with open(CK_BILI, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(cookies, f, ensure_ascii=False, indent=2)

    # 同步进 ck360_all.json 的 bilibili 段，让旧脚本也能直接用
    merged = []
    if os.path.exists(CK_360):
        try:
            merged = json.load(open(CK_360, encoding='utf-8'))
        except Exception:
            merged = []
    merged = [c for c in merged
              if not (c.get('host', '').lstrip('.') == 'bilibili.com'
                      or c.get('host', '').endswith('.bilibili.com'))]
    for k, v in cookies.items():
        merged.append({'host': '.bilibili.com', 'name': k, 'value': v, 'path': '/'})
    with open(CK_360, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)


def main():
    ap = argparse.ArgumentParser(description='B 站扫码登录 / 登录态自检')
    ap.add_argument('--check', action='store_true', help='只检查登录态')
    ap.add_argument('--key', help='只对已有的 qrcode_key 收尾（二维码已被扫、轮询进程又不在时用）')
    ap.add_argument('--timeout', type=int, default=170, help='等待扫码秒数')
    args = ap.parse_args()

    if args.check:
        sys.exit(0 if check() else 2)

    if args.key:
        # 二维码已经扫过、只差收尾：不需要再出图，直接轮询这个 key
        key, url = args.key, ''
        sess = _session()
        try:
            sess.get('https://www.bilibili.com/', timeout=20)
        except Exception:
            pass
        print(f'沿用已有二维码 {key[:8]}… 直接收尾')
    else:
        key, url, sess = new_qrcode()

    if url:
        png_ok = make_qr(url, QR_PNG)
        print('扫码登录 B 站：')
        print(f'  二维码图片：{QR_PNG}' if png_ok else '  二维码图片生成失败，请手动打开下面的链接')
        print(f'  扫码链接：{url}')
        print(f'  请用 B 站 App「扫一扫」扫码并确认（{args.timeout} 秒内有效）')

    sys.stdout.flush()
    state, data = poll(sess, key, timeout=args.timeout)
    if state == 'expired':
        sys.exit('二维码已失效，重跑一次')
    if state == 'timeout':
        sys.exit('等待扫码超时，重跑一次')
    if state != 'ok':
        sys.exit(f'扫码失败：{data.get("message") or data}')

    cookies = harvest_cookies(sess, data)
    if not cookies.get('SESSDATA') or not cookies.get('bili_jct'):
        sys.exit(f'拿到了扫码结果但没拿到 SESSDATA/bili_jct：{list(cookies)[:8]}')
    save(cookies)
    if check(verbose=False):
        j = nav(cookies)
        print(f"登录成功：{(j.get('data') or {}).get('uname')}（mid={cookies.get('DedeUserID')}）")
    else:
        print('cookie 已写入，但 nav 校验没通过，可能需要再扫一次')


if __name__ == '__main__':
    main()

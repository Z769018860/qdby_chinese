# -*- coding: utf-8 -*-
"""B 站登录态：扫码登录 + 登录态自检

为什么需要它
------------
自动补档链路上有两处要用 B 站登录态：
  · refresh.py 抓视频评论区里的网盘链接（别人补的档从这里捡回来）
  · post_comments.py 把补好的新链接发到视频置顶评论下
登录态过期后这两步会静默失败（表现为「抓不到链接 / 发不出评论」），
所以需要一个能自己续期的入口。

登录态从哪来
------------
优先级从高到低：
  1. B 站 PC 客户端（bililive_browser）：它内嵌了一套 Chromium，用户在客户端里
     登录后，Web 登录态（SESSDATA/bili_jct）会落在
     %LOCALAPPDATA%\\bililive\\User Data\\Browser Cache <随机>\\Network\\Cookies。
     这个目录只有客户端自己用，不像常驻浏览器那样被独占锁住，随时能读。
  2. 本机浏览器的闲置 profile（比如 Edge 的 User Data2）。开着在用的 profile
     （360/Edge 主 profile）会被锁，读不到也不强求。
  3. 上面都没有时，才需要人工扫码 —— 那是最后一次，扫码后就能长期自动。

注意 SESSDATA 存的是 URL 编码串（逗号写成 %2C），取出来必须 unquote，
否则 B 站会当成非法 cookie 返回 -101 账号未登录。

用法：
    python scripts/bili/bili_login.py --check          # 只体检，不改任何文件
    python scripts/bili/bili_login.py                  # 自动取登录态并落地（默认，不等待）
    python scripts/bili/bili_login.py qrcode           # 出二维码 → 扫码 → 落地 cookie

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
from urllib.parse import unquote

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


def _plain(cookies: dict) -> dict:
    """cookie 值在库里是 URL 编码的（逗号写成 %2C），发请求前必须还原"""
    out = {}
    for k, v in cookies.items():
        if not v:
            continue
        v = unquote(v)
        if '%' in v:            # 编码过头的老快照，再解一层
            try:
                v2 = unquote(v)
                if v2 != v:
                    v = v2
            except Exception:
                pass
        out[k] = v
    return out


def load_cookies() -> dict:
    """按顺序读：bili_cookies.json → ck360_all.json 里的 bilibili 段"""
    if os.path.exists(CK_BILI):
        try:
            d = json.load(open(CK_BILI, encoding='utf-8'))
            if isinstance(d, dict) and d.get('SESSDATA'):
                return _plain({k: v for k, v in d.items() if v})
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
            return _plain({k: v for k, v in d.items() if v})
        except Exception:
            pass
    return {}


def bili_sess(cookies: dict | None = None) -> requests.Session:
    """给其它脚本用：拿一个带有效 B 站登录态的 requests.Session"""
    return _session(cookies or load_cookies())


# B 站 PC 客户端的内嵌浏览器根目录（名字带随机后缀，要动态发现）
BILI_CLIENT_ROOT = r"%LOCALAPPDATA%\bililive\User Data"

# 常见 Chromium 系浏览器的 User Data 目录（存在才试）
BROWSER_ROOTS = [
    ("Edge2", r"%LOCALAPPDATA%\Microsoft\Edge\User Data2"),
    ("Edge", r"%LOCALAPPDATA%\Microsoft\Edge\User Data"),
    ("360极速X", r"%LOCALAPPDATA%\360ChromeX\Chrome\User Data"),
    ("360极速", r"%LOCALAPPDATA%\360Chrome\Chrome\User Data"),
    ("Chrome", r"%LOCALAPPDATA%\Google\Chrome\User Data"),
]


def _client_sources():
    """B 站 PC 客户端：User Data\\Browser Cache <随机>\\ 直接就是个 user-data-dir"""
    root = os.path.expandvars(BILI_CLIENT_ROOT)
    if not os.path.isdir(root):
        return []
    out = []
    for sub in sorted(os.listdir(root), reverse=True):
        if not sub.startswith('Browser Cache'):
            continue
        p = os.path.join(root, sub)
        if os.path.exists(os.path.join(p, 'Network', 'Cookies')):
            out.append((f'B站客户端/{sub}', p, ''))
    return out


def _browser_sources():
    out = []
    for name, tpl in BROWSER_ROOTS:
        d = os.path.expandvars(tpl)
        if not os.path.isdir(d):
            continue
        for sub in ('Default', 'Profile 1', 'Profile 2'):
            if os.path.exists(os.path.join(d, sub, 'Network', 'Cookies')):
                out.append((f'{name}/{sub}', d, sub))
    return out


def _sources():
    return _client_sources() + _browser_sources()


def cookies_from_browser():
    """自动从 B 站客户端 / 本机浏览器里取 B 站登录态

    返回 (cookies, 说明)。读不到就返回空 dict —— 调用方据此降级，不要卡住。
    """
    sys.path.insert(0, os.path.normpath(os.path.join(BASE, '..', 'netdisk')))
    try:
        import browser_cookies as BC
    except Exception as e:
        return {}, f'读不了浏览器 cookie：{type(e).__name__}'

    tried, cands = [], []
    for label, d, sub in _sources():
        try:
            ck = BC.read_cookies_direct(d, sub)
        except Exception:
            ck = []
        if not ck:
            try:
                ck = BC.read_cookies(d, sub)   # 复制式读取：被锁时会 PermissionError
            except Exception:
                ck = []
        if ck:
            tried.append(f'{label}({len(ck)})')
        got = {}
        for c in ck:
            h = (c.get('host') or '').lstrip('.')
            if h == 'bilibili.com' or h.endswith('.bilibili.com'):
                if c['name'] in KEEP or c['name'] in ('buvid3', 'buvid4', 'b_nut'):
                    got[c['name']] = c['value']
        if got.get('SESSDATA') and got.get('bili_jct'):
            cands.append((label, got))

    if not cands:
        why = '浏览器/客户端里没有可用的 B 站登录态'
        if tried:
            why += f'（读到内容但缺 SESSDATA/bili_jct：{", ".join(tried)}）'
        else:
            why += '（Cookies 被锁或目录不存在）'
        return {}, why

    # 同一台机器上常躺着好几份过期快照，字段多少说明不了新旧，
    # 只能逐个拿去问 B 站：谁真的还登录着就用谁。
    rejected = []
    for label, got in cands:
        if not got.get('buvid3'):
            # 客户端只存了 buvid4，缺 buvid3 会被风控挡，现取一个补上
            try:
                bj = _session().get('https://api.bilibili.com/x/frontend/finger/spi',
                                    timeout=20).json()
                bd = bj.get('data') or {}
                if bd.get('b_3'):
                    got['buvid3'] = bd['b_3']
                    if bd.get('b_4') and not got.get('buvid4'):
                        got['buvid4'] = bd['b_4']
            except Exception:
                pass
        cookies = _plain(got)
        j = nav(cookies)
        if j.get('code') == 0 and (j.get('data') or {}).get('isLogin'):
            return cookies, label
        rejected.append(f'{label}(code={j.get("code")})')

    return {}, f'{len(cands)} 处都有登录态但都已被 B 站作废：{", ".join(rejected)}'


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
        print('B 站登录态：本地没有 cookie → 跑一次 python scripts/bili/bili_login.py'
              '（会自动从 B 站 PC 客户端取）')
        return False
    j = nav(ck)
    ok = j.get('code') == 0 and (j.get('data') or {}).get('isLogin')
    if verbose:
        if ok:
            print(f"B 站登录态：有效（{(j.get('data') or {}).get('uname')} / mid={ck.get('DedeUserID')}）")
        else:
            print(f"B 站登录态：失效（code={j.get('code')} {j.get('message')}）"
                  f"→ 跑一次 python scripts/bili/bili_login.py（会自动从 B 站客户端取）")
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
    # 清干净所有旧条目（.bilibili.com 和 .bilibili.cn 都要清），
    # 否则过期快照会一直赖在里面，被旧脚本当成有效 cookie 用。
    merged = [c for c in merged if 'bilibili' not in (c.get('host') or '')]
    for k, v in cookies.items():
        merged.append({'host': '.bilibili.com', 'name': k, 'value': v, 'path': '/'})
    with open(CK_360, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)


def cmd_auto():
    """全自动路径：已有就用，没有就从浏览器取，都拿不到就体面退出"""
    if check(verbose=False):
        j = nav(load_cookies())
        print(f"B 站登录态：有效（{(j.get('data') or {}).get('uname')}），可直接发评论")
        return 0
    ck, src = cookies_from_browser()      # 返回时已经拿 nav 验证过，能登录才给
    if ck:
        save(ck)
        j = nav(ck)
        print(f"B 站登录态：已从 {src} 取回（{(j.get('data') or {}).get('uname')}）")
        return 0
    print(f'B 站登录态：{src or "无"}')
    print('  → 自动流程会跳过「发补档评论」这一步，补档照常进行并上站；')
    print('    恢复办法：在 B 站 PC 客户端里保持登录，或手动跑一次')
    print('    python scripts/bili/bili_login.py qrcode 扫码（扫一次就够，之后自动续）')
    return 2


def cmd_qrcode(timeout=170):
    key, url, sess = new_qrcode()
    png_ok = make_qr(url, QR_PNG)
    print('扫码登录 B 站（这一步需要人操作，所以只在手动跑时才做）：')
    print(f'  二维码图片：{QR_PNG}' if png_ok else '  二维码图片生成失败，请手动打开下面的链接')
    print(f'  扫码链接：{url}')
    print(f'  请用 B 站 App「扫一扫」扫码并确认（{timeout} 秒内有效）')
    sys.stdout.flush()
    state, data = poll(sess, key, timeout=timeout)
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
        print(f"登录成功：{(nav(cookies).get('data') or {}).get('uname')}")
    else:
        print('cookie 已写入，但 nav 校验没通过，可能需要再扫一次')


def main():
    ap = argparse.ArgumentParser(description='B 站登录态：自动获取（默认）/ 扫码（手动）')
    ap.add_argument('cmd', nargs='?', default='auto', choices=['auto', 'qrcode'],
                    help='auto=自动从浏览器取（默认，不等待）；qrcode=出二维码（需人工扫）')
    ap.add_argument('--check', action='store_true', help='只检查登录态，不改任何文件')
    ap.add_argument('--timeout', type=int, default=170, help='qrcode 模式等待扫码秒数')
    args = ap.parse_args()

    if args.check:
        sys.exit(0 if check() else 2)
    if args.cmd == 'qrcode':
        cmd_qrcode(args.timeout)
        return
    sys.exit(cmd_auto())


if __name__ == '__main__':
    main()

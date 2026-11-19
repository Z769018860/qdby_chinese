# -*- coding: utf-8 -*-
"""从本机 Chromium 系浏览器读取迅雷网盘的登录态（替代扫码）

背景：迅雷的扫码/设备码流程要「迅雷 App 扫码」，网页端那条确认地址
（i.xunlei.com/.../qrcode-login）在浏览器里打开只是个下载推广页，没有确认按钮，
所以扫码这条路走不通。

可行的办法：在任意 Chromium 系浏览器里登录 https://pan.xunlei.com/ ，
网页版会把凭据写进 Local Storage 的 key `credentials_<CLIENT_ID>`（一个 JSON，
含 access_token / refresh_token / expires_at）。本脚本把这些文件扫一遍，
取有效期最长的一份，用 refresh_token 换成新令牌，落到 work/xunlei-auth.json。

之后每天巡检靠 refresh_token 自动续期；哪天续期失败（一般 30 天不用），
重新在浏览器登录一次再跑本脚本即可。

用法：
  python scripts/netdisk/xunlei_weblogin.py            # 找凭据 -> 换发 -> 落盘
  python scripts/netdisk/xunlei_weblogin.py --show     # 只报告找到哪些，不写入
"""
from __future__ import annotations

import argparse
import base64
import glob
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import xunlei as XL  # noqa: E402

LOCAL = os.environ.get('LOCALAPPDATA', '')
ROAM = os.environ.get('APPDATA', '')

# (显示名, User Data 根目录)
BROWSERS = [
    ('360极速浏览器X', os.path.join(LOCAL, '360ChromeX', 'Chrome', 'User Data')),
    ('360极速浏览器', os.path.join(LOCAL, '360Chrome', 'Chrome', 'User Data')),
    ('Chrome', os.path.join(LOCAL, 'Google', 'Chrome', 'User Data')),
    ('Edge', os.path.join(LOCAL, 'Microsoft', 'Edge', 'User Data')),
    ('QQ浏览器', os.path.join(LOCAL, 'Tencent', 'QQBrowser', 'User Data')),
]


def _claims(tok):
    try:
        p = tok.split('.')[1]
        p += '=' * (-len(p) % 4)
        return json.loads(base64.urlsafe_b64decode(p))
    except Exception:
        return {}


def _parse_key(blob, start):
    """从 start 处的 '{' 起，按括号配平抠出一个 JSON 对象"""
    depth = 0
    for k in range(start, min(len(blob), start + 8000)):
        c = blob[k:k + 1]
        if c == b'{':
            depth += 1
        elif c == b'}':
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(blob[start:k + 1].decode('utf-8'))
                except Exception:
                    return None
    return None


def scan_profile(user_data):
    """返回该浏览器里所有 credentials_<cid> 记录 [(exp, cid, dict, 文件)]"""
    key = ('credentials_' + XL.CLIENT_ID).encode()
    out = []
    lsd = os.path.join(user_data, 'Default', 'Local Storage', 'leveldb')
    if not os.path.isdir(lsd):
        return out
    for f in glob.glob(os.path.join(lsd, '*.*')):
        if not f.endswith(('.log', '.ldb')):
            continue
        try:
            b = open(f, 'rb').read()
        except Exception:
            continue                      # 正被浏览器占用时跳过
        for m in re.finditer(re.escape(key), b):
            j = b.find(b'{', m.end())
            if j < 0 or j - m.end() > 8:
                continue
            d = _parse_key(b, j)
            if not d or not d.get('access_token'):
                continue
            c = _claims(d['access_token'])
            out.append((int(c.get('exp') or 0), XL.CLIENT_ID, d, f))
    return out


def find_creds():
    best = None
    for name, ud in BROWSERS:
        if not os.path.isdir(ud):
            continue
        for exp, cid, d, f in scan_profile(ud):
            print('  找到 %s：client=%s 有效期 %s' % (
                name, cid, time.strftime('%Y-%m-%d %H:%M', time.localtime(exp))))
            if best is None or exp > best[0]:
                best = (exp, d, name)
    return best


def refresh_and_save(d, src):
    rt = d.get('refresh_token') or ''
    if not rt:
        print('  ! 该记录没有 refresh_token，无法长期使用')
        return False
    r = XL.requests.post(XL.TOKEN_URL,
                         data={'client_id': XL.CLIENT_ID,
                               'grant_type': 'refresh_token',
                               'refresh_token': rt},
                         headers={'User-Agent': XL.UA}, timeout=25)
    if r.status_code != 200:
        print('  ! 换发失败 HTTP %d：%s' % (r.status_code, r.text[:160]))
        return False
    j = r.json()
    c = _claims(j.get('access_token') or '')
    auth = {'refresh_token': j.get('refresh_token') or '',
            'user_id': str(c.get('sub') or ''),
            'device_id': XL.new_device_id(),
            'source': '%s 网页端（%s 读取）' % (time.strftime('%Y-%m-%d'), src),
            'scope': c.get('scope') or ''}
    XL.save_auth(auth)
    print('  已写入 %s' % XL.AUTH)
    print('  user_id=%s 有效期至 %s（之后自动续期）' % (
        auth['user_id'], time.strftime('%Y-%m-%d %H:%M', time.localtime(c.get('exp') or 0))))
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--show', action='store_true')
    args = ap.parse_args()
    print('扫描本机浏览器里的迅雷网盘凭据…')
    best = find_creds()
    if not best:
        print('没找到。请先在浏览器打开 https://pan.xunlei.com/ 登录一次，再重跑本脚本。')
        return 2
    exp, d, src = best
    if args.show:
        print('最新一份来自 %s，有效期 %s' % (
            src, time.strftime('%Y-%m-%d %H:%M', time.localtime(exp))))
        return 0
    return 0 if refresh_and_save(d, src) else 1


if __name__ == '__main__':
    sys.exit(main())

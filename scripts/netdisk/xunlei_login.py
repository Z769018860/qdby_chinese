# -*- coding: utf-8 -*-
"""迅雷云盘扫码登录（一次即可，之后长期免登录）

流程（与官网网页版一致，2026-08 实测）：
  1. 设备码：POST /v1/auth/device/code（账号中心 client XW5Sk...）
  2. 用户用迅雷 App 扫码/打开确认页
  3. 轮询 /v1/auth/token 拿账号中心 access_token
  4. 用该 token + PKCE 向网盘 client（Xqp0k...）换业务 refresh_token
  5. 取 user_id，连同 device_id 一起写 work/xunlei-auth.json

用法：
  python scripts/netdisk/xunlei_login.py            # 打出二维码链接并等扫码（默认 300 秒）
  python scripts/netdisk/xunlei_login.py --timeout 600
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import secrets
import sys
import time

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import xunlei as X  # noqa: E402

QR_PNG = os.path.join(X.WORK, 'xunlei-qr.png')


def pkce():
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b'=').decode()
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
    return verifier, challenge


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--timeout', type=int, default=300)
    args = ap.parse_args()

    H = {'Content-Type': 'application/json', 'User-Agent': X.UA}

    r = requests.post(X.USER_HOST + '/v1/auth/device/code',
                      json={'scope': '', 'client_id': X.LOGIN_CLIENT_ID},
                      headers=H, timeout=30)
    if r.status_code not in (200, 201):
        print('生成设备码失败 HTTP %d：%s' % (r.status_code, r.text[:200]))
        return 1
    j = r.json()
    d = j.get('data') or j
    device_code = d.get('device_code') or ''
    verify = d.get('verification_uri_complete') or d.get('verification_uri') or ''
    qr = d.get('qr_code') or ''
    interval = int(d.get('interval') or 2)
    if not device_code:
        print('设备码响应异常：%s' % r.text[:300])
        return 1

    if qr:
        raw = qr.split(',', 1)[-1] if qr.startswith('data:') else qr
        try:
            open(QR_PNG, 'wb').write(base64.b64decode(raw))
            print('二维码图片：%s' % QR_PNG)
        except Exception:
            pass
    print('确认地址：%s' % verify)
    print('请用迅雷 App 扫码（或打开上面的地址确认），等待中…')

    deadline = time.time() + args.timeout
    center_token = ''
    while time.time() < deadline:
        try:
            t = requests.post(X.TOKEN_URL, json={
                'grant_type': 'urn:ietf:params:oauth:grant-type:device_code',
                'device_code': device_code, 'client_id': X.LOGIN_CLIENT_ID,
            }, headers=H, timeout=30)
        except Exception as e:
            print('  轮询异常：%s' % e)
            time.sleep(interval)
            continue
        if 200 <= t.status_code < 300:
            center_token = (t.json().get('access_token') or '')
            if center_token:
                break
        time.sleep(interval)
    if not center_token:
        print('超时未完成扫码')
        return 2
    print('扫码成功，正在换取网盘凭据…')

    device_id = X.new_device_id()
    verifier, challenge = pkce()
    state = secrets.token_hex(8)
    a = requests.post(X.USER_HOST + '/v1/user/authorize', json={
        'client_id': X.CLIENT_ID, 'response_type': 'code',
        'redirect_uri': 'https://pan.xunlei.com/login/?sso_sign_in_in_iframe=',
        'state': state, 'scope': 'profile offline pan sso user',
        'code_challenge': challenge, 'code_challenge_method': 'S256',
    }, headers=dict(H, Authorization='Bearer ' + center_token), timeout=30)
    if a.status_code not in (200, 201):
        print('申请授权码失败 HTTP %d：%s' % (a.status_code, a.text[:200]))
        return 3
    aj = a.json()
    code = aj.get('code') or (aj.get('data') or {}).get('code') or ''
    if not code:
        print('授权码响应异常：%s' % a.text[:300])
        return 3

    t2 = requests.post(X.TOKEN_URL, json={
        'client_id': X.CLIENT_ID, 'grant_type': 'authorization_code', 'code': code,
        'redirect_uri': 'https://pan.xunlei.com/login/?sso_sign_in_in_iframe=',
        'code_verifier': verifier,
    }, headers=H, timeout=30)
    if t2.status_code not in (200, 201):
        print('换取网盘凭据失败 HTTP %d：%s' % (t2.status_code, t2.text[:200]))
        return 4
    tj = t2.json()
    rt = (tj.get('refresh_token') or '').strip()
    at = (tj.get('access_token') or '').strip()
    if not rt:
        print('换取网盘凭据失败：响应无 refresh_token')
        return 4

    uid = ''
    try:
        m = requests.get(X.USER_HOST + '/v1/user/me', headers={
            'Authorization': 'Bearer ' + at, 'User-Agent': X.UA,
            'x-client-id': X.CLIENT_ID, 'x-device-id': device_id}, timeout=25)
        if m.status_code == 200:
            mj = m.json()
            uid = str(mj.get('sub') or mj.get('user_id') or '')
    except Exception:
        pass

    X.save_auth({'refresh_token': rt, 'user_id': uid, 'device_id': device_id})
    print('登录完成：user_id=%s' % (uid or '(未知)'))
    print('凭据已写入 %s' % X.AUTH)
    return 0


if __name__ == '__main__':
    sys.exit(main())

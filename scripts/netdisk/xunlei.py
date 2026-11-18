# -*- coding: utf-8 -*-
"""迅雷云盘（pan.xunlei.com）补档支持

凭据与其它盘不同：迅雷业务接口不吃 cookie，走 OAuth 的 refresh_token 换
短效 access_token，并且每个业务请求还要带一个按客户端版本签名出来的
x-captcha-token。所以这里把三件事都自己做了：

  登录   scripts/netdisk/xunlei_login.py（扫码一次，落 work/xunlei-auth.json）
  换发   refresh_token -> access_token（服务端会轮换 refresh_token，换完立刻写盘）
  签名   captcha_sign = 14 层盐链 md5，base 见 build_captcha_sign()

业务接口（实测有效）：
  GET  /drive/v1/files          列目录（parent_id / page_token）
  POST /drive/v1/files          建文件夹
  POST /drive/v1/share          建分享 -> share_url + pass_code
  GET  /drive/v1/share          查分享状态（share_status == OK 即有效）

用法：
  python scripts/netdisk/xunlei.py me            # 打印账号与容量
  python scripts/netdisk/xunlei.py index         # 建云端索引 -> work/xunlei-index.json
  python scripts/netdisk/xunlei.py share --name "作品名"   # 按名字建一条分享
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
import uuid

import requests

BASE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(BASE, '..', '..'))
WORK = os.path.normpath(os.path.join(REPO, '..'))
AUTH = os.path.join(WORK, 'xunlei-auth.json')
INDEX = os.path.join(WORK, 'xunlei-index.json')

# 官网网页版固定标识（2026-08 实测）。captcha 盐链只对 Xqp0k 这套成立。
CLIENT_ID = 'Xqp0kJBXWhwaTpB6'
LOGIN_CLIENT_ID = 'XW5SkOhLDjnOZP7J'
CLIENT_VERSION = '1.92.80'
PACKAGE_NAME = 'pan.xunlei.com'
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36')
API = 'https://api-pan.xunlei.com'
USER_HOST = 'https://xluser-ssl.xunlei.com'
CAPTCHA_INIT = USER_HOST + '/v1/shield/captcha/init'
TOKEN_URL = USER_HOST + '/v1/auth/token'

_SALTS = [
    '6rD7', 'Mz2t5AGjgtLIx', 'TZzn05nwcFz', 'oxBSe3XKUAsLII0UXV5Q193a7', '',
    'GuJXCiMjeJD5c', 'cjGTA6KSD2p3WmOF1z59HiYnmBl3+y7uSJGOr', 'zN61',
    'Q+YIIF4xhxfW8kac1BxW32+Bulr/9FBuXUos0', 'YTErxZcQu5hxG6/xT0CzCQ0IsnfZmizWX',
    'TK/BPB4YhRXyaPkyb1YM', '+', '4WgGImLAtlEd1Puth1eTkeqc/jwDllMiVg',
    'D15c3uVVOaRgOLAGH',
]


def log(*a):
    print(*a, flush=True)


# ---------------- 凭据 ----------------
def load_auth():
    for p in (AUTH, os.path.join(WORK, 'xunlei-token-new.json')):
        if not os.path.exists(p):
            continue
        try:
            d = json.load(open(p, encoding='utf-8'))
        except Exception:
            continue
        rt = (d.get('refresh_token') or '').strip()
        uid = str(d.get('user_id') or d.get('sub') or '').strip()
        dev = (d.get('device_id') or '').strip().lower()
        if rt:
            return {'refresh_token': rt, 'user_id': uid,
                    'device_id': dev if len(dev) == 32 else ''}
    return None


def save_auth(d):
    d = dict(d)
    d['updated_at'] = time.strftime('%Y-%m-%d %H:%M:%S')
    json.dump(d, open(AUTH, 'w', encoding='utf-8', newline='\n'),
              ensure_ascii=False, indent=1)
    try:
        os.chmod(AUTH, 0o600)
    except Exception:
        pass


def new_device_id():
    return uuid.uuid4().hex


# ---------------- 签名 ----------------
def build_captcha_sign(device_id, ts_ms):
    """14 层盐链 md5；与官网 webpack 里 getPubKeySignUtil 的算法一致"""
    base = CLIENT_ID + CLIENT_VERSION + 'pan.xunlei.com' + device_id + ts_ms
    h = base
    for salt in _SALTS:
        h = hashlib.md5((h + salt).encode('utf-8')).hexdigest()
    return '1.' + h


# ---------------- 会话 ----------------
class Session:
    def __init__(self, auth):
        self.rt = auth['refresh_token']
        self.uid = auth.get('user_id') or ''
        self.dev = auth.get('device_id') or new_device_id()
        if not auth.get('device_id'):
            save_auth({'refresh_token': self.rt, 'user_id': self.uid,
                       'device_id': self.dev})
        self.at = ''
        self.at_exp = 0.0
        self.ct = ''
        self.ct_exp = 0.0

    # --- access_token ---
    def access_token(self):
        if self.at and time.time() < self.at_exp - 60:
            return self.at
        r = requests.post(TOKEN_URL,
                          json={'client_id': CLIENT_ID, 'grant_type': 'refresh_token',
                                'refresh_token': self.rt},
                          headers={'Content-Type': 'application/json',
                                   'User-Agent': UA}, timeout=30)
        if r.status_code != 200:
            raise RuntimeError('刷新 access_token 失败 HTTP %d：%s'
                               % (r.status_code, r.text[:160]))
        j = r.json()
        self.at = j.get('access_token') or ''
        if not self.at:
            raise RuntimeError('刷新 access_token 失败：响应无 access_token')
        self.at_exp = time.time() + int(j.get('expires_in') or 3600)
        nrt = (j.get('refresh_token') or '').strip()
        if nrt and nrt != self.rt:
            self.rt = nrt
            save_auth({'refresh_token': nrt, 'user_id': self.uid, 'device_id': self.dev})
            log('  · refresh_token 已轮换并写盘')
        return self.at

    # --- captcha_token（业务接口必带） ---
    def captcha_token(self, action='get:/drive/v1/share'):
        if self.ct and time.time() < self.ct_exp - 60:
            return self.ct
        if not self.uid:
            self.uid = self.whoami()
        ts = str(int(time.time() * 1000))
        body = {
            'client_id': CLIENT_ID,
            'action': action,
            'device_id': self.dev,
            'meta': {
                'username': '', 'phone_number': '', 'email': '',
                'package_name': PACKAGE_NAME,
                'client_version': CLIENT_VERSION,
                'captcha_sign': build_captcha_sign(self.dev, ts),
                'timestamp': ts,
                'user_id': self.uid,
            },
        }
        if self.ct:
            body['captcha_token'] = self.ct
        r = requests.post(CAPTCHA_INIT, json=body,
                          headers={'Content-Type': 'application/json',
                                   'User-Agent': UA}, timeout=30)
        if r.status_code not in (200, 201):
            raise RuntimeError('取 captcha_token 失败 HTTP %d：%s'
                               % (r.status_code, r.text[:160]))
        j = r.json()
        tok = (j.get('captcha_token')
               or (j.get('data') or {}).get('captcha_token') or '')
        if not tok:
            raise RuntimeError('取 captcha_token 失败：%s' % r.text[:160])
        self.ct = tok
        exp = j.get('expires_in') or (j.get('data') or {}).get('expires_in') or 1800
        self.ct_exp = time.time() + int(exp)
        return tok

    def whoami(self):
        h = {'Authorization': 'Bearer ' + self.access_token(),
             'User-Agent': UA, 'x-client-id': CLIENT_ID, 'x-device-id': self.dev}
        r = requests.get(USER_HOST + '/v1/user/me', headers=h, timeout=25)
        if r.status_code != 200:
            raise RuntimeError('取用户信息失败 HTTP %d：%s' % (r.status_code, r.text[:160]))
        j = r.json()
        uid = str(j.get('sub') or j.get('user_id') or '')
        if uid:
            self.uid = uid
            save_auth({'refresh_token': self.rt, 'user_id': uid, 'device_id': self.dev})
        return uid

    def api(self, method, path, body=None, query=None, action=None):
        h = {
            'Authorization': 'Bearer ' + self.access_token(),
            'x-captcha-token': self.captcha_token(action or 'get:/drive/v1/share'),
            'x-client-id': CLIENT_ID,
            'x-device-id': self.dev,
            'Origin': 'https://pan.xunlei.com',
            'Referer': 'https://pan.xunlei.com/',
            'User-Agent': UA,
        }
        url = API + path
        if method.upper() == 'GET':
            r = requests.get(url, params=query or {}, headers=h, timeout=40)
        else:
            h['Content-Type'] = 'application/json'
            r = requests.post(url, params=query or {}, json=body or {}, headers=h, timeout=40)
        if r.status_code not in (200, 201):
            raise RuntimeError('%s %s HTTP %d：%s'
                               % (method, path, r.status_code, r.text[:200]))
        j = r.json()
        err = j.get('error_code') or (j.get('data') or {}).get('error_code')
        if err:
            desc = (j.get('error_description') or (j.get('data') or {}).get('error_description')
                    or j.get('message') or '')
            raise RuntimeError('%s: %s' % (err, desc[:160]))
        return j


# ---------------- 索引 ----------------
def list_files(s, parent_id='', limit=100):
    j = s.api('GET', '/drive/v1/files', query={
        'parent_id': parent_id,
        'filters': '{"phase":{"eq":"PHASE_TYPE_COMPLETE"},"trashed":{"eq":false}}',
        'with_audit': 'true', 'thumbnail_size': 'SIZE_SMALL', 'limit': str(limit),
    }, action='get:/drive/v1/files')
    items = j.get('files') or (j.get('data') or {}).get('files') or []
    return items, (j.get('next_page_token') or (j.get('data') or {}).get('next_page_token') or '')


def build_index(s, maxdir=400):
    out, queue, seen = [], [('', '')], 0
    while queue and seen < maxdir:
        pid, path = queue.pop(0)
        seen += 1
        token = ''
        while True:
            items, token = list_files(s, pid)
            for it in items:
                name = it.get('name') or ''
                p = path + '/' + name
                kind = it.get('kind') or ''
                out.append({'id': it.get('id'), 'name': name,
                            'dir': kind == 'drive#folder', 'path': p,
                            'size': int(it.get('size') or 0)})
                if kind == 'drive#folder':
                    queue.append((it.get('id'), p))
            if not token:
                break
        if seen % 10 == 0:
            log('  迅雷 %d 个目录，累计 %d 项' % (seen, len(out)))
    log('  迅雷 %d 个目录，累计 %d 项' % (seen, len(out)))
    return out


# ---------------- 分享 ----------------
def create_share(s, file_ids, title, expiration_days='-1'):
    j = s.api('POST', '/drive/v1/share', body={
        'file_ids': list(file_ids),
        'share_to': 'copy',
        'params': {'subscribe_push': 'false', 'WithPassCodeInLink': 'true'},
        'title': (title or '')[:50],
        'restore_limit': '-1',
        'expiration_days': str(expiration_days),
    }, action='post:/drive/v1/share')
    url = j.get('share_url') or (j.get('data') or {}).get('share_url') or ''
    pwd = j.get('pass_code') or (j.get('data') or {}).get('pass_code') or ''
    sid = j.get('share_id') or (j.get('data') or {}).get('share_id') or ''
    if not url:
        raise RuntimeError('建分享失败：响应无 share_url')
    return {'url': url, 'pwd': pwd, 'share_id': sid}


def _oss_put(params, path):
    """把本地文件 PUT 到迅雷给的阿里云 OSS 临时位（STS 签名，OSS V1）"""
    import base64
    import datetime
    import hmac

    bucket, endpoint = params['bucket'], params['endpoint']
    key = params['key']
    ct = 'application/octet-stream'
    date = datetime.datetime.utcnow().strftime('%a, %d %b %Y %H:%M:%S GMT')
    sts = params['security_token']
    s2s = ('PUT\n\n%s\n%s\nx-oss-security-token:%s\n/%s/%s'
           % (ct, date, sts, bucket, key))
    sig = base64.b64encode(
        hmac.new(params['access_key_secret'].encode('utf-8'), s2s.encode('utf-8'),
                 hashlib.sha1).digest()).decode()
    h = {'Date': date, 'x-oss-security-token': sts, 'Content-Type': ct,
         'Authorization': 'OSS %s:%s' % (params['access_key_id'], sig)}
    size = os.path.getsize(path)
    with open(path, 'rb') as f:
        r = requests.put('https://%s.%s/%s' % (bucket, endpoint, key),
                         data=f, headers=h, timeout=(30, 900))
    if r.status_code not in (200, 201):
        raise RuntimeError('OSS 上传失败 HTTP %d：%s' % (r.status_code, r.text[:200]))
    return size


def upload_file(s, path, parent_id='', name=''):
    """上传本地文件到迅雷云盘，返回 {id,name,size}

    走网页版同一条路：POST /drive/v1/files 拿 STS + OSS key，
    直接 PUT 到 vip-lixian-*.up.xdrive.xunlei.com，传完条目自动变 PHASE_TYPE_COMPLETE。
    """
    size = os.path.getsize(path)
    h = hashlib.sha1()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    body = {
        'kind': 'drive#file', 'name': name or os.path.basename(path),
        'size': size, 'hash': h.hexdigest(), 'parent_id': parent_id,
        'upload_type': 'UPLOAD_TYPE_RESUMABLE',
        'obj_type': 'OBJECT_TYPE_OTHER', 'space': '',
    }
    j = s.api('POST', '/drive/v1/files', body=body, action='post:/drive/v1/files')
    res = j.get('resumable') or {}
    params = res.get('params') or {}
    fid = ((j.get('file') or {}).get('id')
           or (j.get('data') or {}).get('file', {}).get('id') or '')
    if not params.get('key') or not fid:
        raise RuntimeError('迅雷未返回上传凭据：%s' % str(j)[:200])
    _oss_put(params, path)
    return {'id': fid, 'name': name or os.path.basename(path), 'size': size}


def wait_ready(s, fid, timeout=120):
    """等条目从上传中变成 PHASE_TYPE_COMPLETE"""
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            f = s.api('GET', '/drive/v1/files/' + fid, action='get:/drive/v1/files')
            phase = f.get('phase') or ''
            if phase == 'PHASE_TYPE_COMPLETE':
                return True
        except Exception:
            pass
        time.sleep(2)
    return False


def delete_file(s, fid):
    """删云端条目（进回收站）"""
    import requests as _rq
    h = {'Authorization': 'Bearer ' + s.access_token(),
         'x-captcha-token': s.captcha_token('delete:/drive/v1/files'),
         'x-client-id': CLIENT_ID, 'x-device-id': s.dev,
         'Origin': 'https://pan.xunlei.com', 'Referer': 'https://pan.xunlei.com/',
         'User-Agent': UA, 'Content-Type': 'application/json'}
    r = _rq.delete(API + '/drive/v1/files/' + fid, headers=h, timeout=30)
    return r.status_code in (200, 204)


def rename_file(s, fid, name):
    """给云端文件改名（PATCH /drive/v1/files/<id>）

    分享是按 file_id 建的，改名后分享内容跟着变，不用重建分享。
    补档时发现「文件内容与作品名反了」可以直接对调名字。
    """
    import requests as _rq
    h = {'Authorization': 'Bearer ' + s.access_token(),
         'x-captcha-token': s.captcha_token('patch:/drive/v1/files'),
         'x-client-id': CLIENT_ID, 'x-device-id': s.dev,
         'Origin': 'https://pan.xunlei.com', 'Referer': 'https://pan.xunlei.com/',
         'User-Agent': UA, 'Content-Type': 'application/json'}
    r = _rq.patch(API + '/drive/v1/files/' + fid, json={'name': name}, headers=h, timeout=40)
    if r.status_code not in (200, 201):
        raise RuntimeError('改名失败 HTTP %d：%s' % (r.status_code, r.text[:160]))
    return (r.json() or {}).get('name')


def get_share(s, share_id, pass_code=''):
    j = s.api('GET', '/drive/v1/share', query={
        'share_id': share_id, 'pass_code': pass_code, 'limit': '100',
        'pass_code_token': '', 'page_token': '', 'thumbnail_size': 'SIZE_SMALL',
    }, action='get:/drive/v1/share')
    st = j.get('share_status') or (j.get('data') or {}).get('share_status') or ''
    txt = j.get('share_status_text') or (j.get('data') or {}).get('share_status_text') or ''
    return st, txt


def session():
    """拿一个可用会话；凭据缺失时返回 None（调用方自己决定降级）"""
    auth = load_auth()
    if auth:
        try:
            s = Session(auth)
            s.access_token()
            return s
        except Exception as e:
            log('  ! 迅雷凭据续期失败：%s' % str(e)[:140])
    # 兜底：浏览器里登录着 pan.xunlei.com 的话，把那份凭据捞回来接着用
    try:
        import xunlei_weblogin as W
        best = W.find_creds()
        if best and W.refresh_and_save(best[1], best[2]):
            auth = load_auth()
            if auth:
                s = Session(auth)
                s.access_token()
                log('  · 迅雷凭据已从浏览器登录态恢复')
                return s
    except Exception as e:
        log('  ! 浏览器凭据恢复失败：%s' % str(e)[:140])
    log('  ! 迅雷未登录：在浏览器登录 https://pan.xunlei.com/ 后重跑 xunlei_weblogin.py')
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['me', 'index', 'share', 'check'])
    ap.add_argument('--name', default='')
    ap.add_argument('--share-id', default='')
    args = ap.parse_args()
    s = session()
    if s is None:
        log('没有可用的迅雷凭据，先跑 scripts/netdisk/xunlei_login.py')
        return 2
    if args.cmd == 'me':
        log('user_id=%s device=%s' % (s.whoami(), s.dev))
    elif args.cmd == 'index':
        items = build_index(s)
        json.dump({'at': time.strftime('%Y-%m-%d %H:%M'), 'items': items},
                  open(INDEX, 'w', encoding='utf-8', newline='\n'),
                  ensure_ascii=False, indent=1)
        log('-> %s' % INDEX)
    elif args.cmd == 'share':
        items = json.load(open(INDEX, encoding='utf-8'))['items'] if os.path.exists(INDEX) else build_index(s)
        hits = [it for it in items if args.name and args.name in it['name']]
        for it in hits[:10]:
            log('  %s %s' % ('[D]' if it['dir'] else '   ', it['path']))
        if not hits:
            log('没找到：%s' % args.name)
            return 1
    elif args.cmd == 'check':
        log(get_share(s, args.share_id))
    return 0


if __name__ == '__main__':
    sys.exit(main())

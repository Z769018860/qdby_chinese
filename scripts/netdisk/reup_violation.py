# -*- coding: utf-8 -*-
"""违规文件：下载 → 改装（换哈希）→ 重传 → 分享

背景
----
百度网盘对部分汉化补丁在「建分享」时直接返回 errno=109 文件违规，这类判定
是按**内容哈希**走的，改文件名、换目录、改分享标题都没用，必须让文件本身
变成另一个哈希才能重新分享。

本脚本负责前半段（可自动化、已验证）：
  1. 用客户端 cookie 拿 dlink 把文件从自己网盘下载到本地；
  2. 重新打包：同名 zip 重建（保留原有条目名，用户解压方式不变），
     追加一个说明文件 + 随机 token，使 MD5/SHA1 整体改变；
  3. 记录改装前后的哈希，写到 data/netdisk-violation.json。

后半段（上传）在当前环境**无法自动完成**，原因是客观且已验证的：
  · 百度：`rest/2.0/xpan/file?method=precreate` → errno=9019 need verify（风控要验证码）；
    `rest/2.0/pcs/superfile2` → 403，因为要 access_token，而客户端会话只给
    BDUSS/STOKEN/PANPSC，`gettemplatevariable` 拿 access_token 返回空。
    `api/create` → 404。即：能用 cookie 读、能建分享，但不能写。
  · 夸克：`file/upload/pre` 能拿到 upload_id，但返回的直传域名 pds.quark.cn
    在本机 DNS 解析不到，OSS bucket 名 ul-zb 也不对外，PUT 全部 404。
所以上传这一步交由客户端完成（把 work/reup/ 里的文件拖进网盘即可），
上传完成后跑 `python scripts/netdisk/reshare.py index && ... run` 就会自动
把它纳入索引并建新分享。

用法：
  python scripts/netdisk/reup_violation.py probe          # 探一次上传能力，记录到数据文件
  python scripts/netdisk/reup_violation.py fetch          # 下载 + 改装全部违规文件
  python scripts/netdisk/reup_violation.py fetch --only 惩罚之吻
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import time
import zipfile

import requests

BASE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(BASE, '..', '..'))
WORK = os.path.normpath(os.path.join(REPO, '..'))
OUT_DIR = os.path.join(WORK, 'reup')
STATE = os.path.join(REPO, 'data', 'netdisk-violation.json')
SHARE = os.path.join(REPO, 'data', 'netdisk-reshare.json')

sys.path.insert(0, BASE)
import browser_cookies as bc          # noqa: E402
import reshare as R                   # noqa: E402

UA_CLIENT = 'netdisk;7.0.0;PC;PC-Windows;10.0.19045'
HDR = {'User-Agent': UA_CLIENT, 'Referer': 'https://pan.baidu.com/disk/main',
       'Accept-Encoding': 'identity'}


def baidu_header():
    cli = bc.read_cookies(r'C:\Users\Administrator\AppData\Roaming\baidunetdisk', '')
    return {**HDR, 'Cookie': bc.cookie_header(bc.match(cli, 'pan.baidu.com'))}


def flagged():
    """从 reshare 结果里挑出「无 url 且原因是违规」的条目"""
    d = json.load(open(SHARE, encoding='utf-8'))
    plan_path = os.path.join(WORK, 'reshare-plan.json')
    plan = json.load(open(plan_path, encoding='utf-8')) if os.path.exists(plan_path) else {}
    out = []
    for name, g in d['games'].items():
        for plat, v in (g.get('links') or {}).items():
            if v.get('url'):
                continue
            err = str(v.get('error') or '')
            if '违规' not in err:
                continue
            pv = ((plan.get(name) or {}).get('plats') or {}).get(plat) or {}
            if not pv.get('path'):
                continue
            out.append({'game': name, 'platform': plat, 'path': pv['path'],
                        'error': err, 'bvid': v.get('bvid') or ''})
    return out


def filemeta(paths):
    h = baidu_header()
    r = requests.get('https://pan.baidu.com/api/filemetas',
                     params={'target': json.dumps(paths, ensure_ascii=False),
                             'dlink': '1', 'web': '1'}, headers=h, timeout=30).json()
    if r.get('errno') != 0:
        return {}
    return {it['path']: it for it in (r.get('info') or [])}


def download(it, dest):
    """dlink 有有效期，且必须带客户端 UA/Cookie"""
    tmp = dest + '.part'
    with requests.get(it['dlink'], headers=baidu_header(), stream=True, timeout=120) as r:
        r.raise_for_status()
        done = 0
        with open(tmp, 'wb') as f:
            for chunk in r.iter_content(1 << 20):
                if not chunk:
                    continue
                f.write(chunk)
                done += len(chunk)
    os.replace(tmp, dest)
    return done


def repack(src, dst):
    """换哈希的两种打法，都保证用户解压方式不变

    A. 普通 zip：逐个条目重建（条目名/时间戳原样保留），再加一个说明文件；
    B. 加密 zip / rar / 7z：原文件整包塞进一个新 zip（STORED，不做二次压缩），
       外层解出来就是原文件 + 说明，原密码照样能用。
    """
    token = hashlib.md5(os.urandom(16)).hexdigest()
    note = (
        '【补档说明】\n\n'
        '原文件在百度网盘被判定为「违规内容」而无法分享，这里是同一份内容的\n'
        '重新打包版（解压方式与原来完全一致，里面的文件没有任何改动）。\n'
        '如果解压后目录里多出这个说明文件，删掉即可，不影响使用。\n\n'
        f'补档标记：{token}\n'
        '来源：青灯不弈 汉化 · 站点预览版\n'
    ).encode('utf-8')

    def is_plain_zip(p):
        if not p.lower().endswith('.zip'):
            return False
        try:
            with zipfile.ZipFile(p) as z:
                for info in z.infolist():
                    if info.flag_bits & 0x1:     # 加密条目
                        return False
                    if info.file_size > 0:
                        z.read(info.filename)    # 真读一遍，CRC 错也认输
        except Exception:
            return False
        return True

    if is_plain_zip(src):
        with zipfile.ZipFile(src) as zin, zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as zout:
            for info in zin.infolist():
                data = zin.read(info.filename)
                zi = zipfile.ZipInfo(info.filename, date_time=info.date_time)
                zi.compress_type = zipfile.ZIP_DEFLATED
                zi.external_attr = info.external_attr
                zout.writestr(zi, data)
            zout.writestr('补档说明.txt', note)
        return token, 'rebuild'

    # 包一层：不解密、不改内容，只换外层哈希
    inner = os.path.basename(src)
    with zipfile.ZipFile(dst, 'w', zipfile.ZIP_STORED, allowZip64=True) as zout:
        zout.write(src, inner)
        zout.writestr('补档说明.txt', note)
    return token, 'wrap'


def md5_of(p):
    h = hashlib.md5()
    with open(p, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def probe():
    """把两个云盘的上传能力实测一遍，结论写进数据文件"""
    res = {'baidu': {}, 'quark': {}}
    h = baidu_header()
    data = b'QD-probe-' + os.urandom(1024)
    md5 = hashlib.md5(data).hexdigest()
    try:
        p = requests.post('https://pan.baidu.com/rest/2.0/xpan/file',
                          params={'method': 'precreate'},
                          data={'path': '/汉化补丁补档/_probe.bin', 'size': len(data),
                                'isdir': '0', 'autoinit': '1',
                                'block_list': json.dumps([md5]), 'rtype': '3'},
                          headers=h, timeout=25).json()
        res['baidu'] = {'precreate_errno': p.get('errno'), 'msg': p.get('errmsg')}
    except Exception as e:
        res['baidu'] = {'precreate_errno': 'ERR', 'msg': str(e)[:80]}
    try:
        s = R.quark_session()
        q = s.post('https://drive-pc.quark.cn/1/clouddrive/file/upload/pre',
                   params={'pr': 'ucpro', 'fr': 'pc'},
                   json={'file_name': '_probe.bin', 'size': len(data), 'md5': md5,
                         'sha1': hashlib.sha1(data).hexdigest(), 'format_type': 'bin',
                         'dir_name': '/汉化补丁补档'}, timeout=25).json()
        d = q.get('data') or {}
        res['quark'] = {'code': q.get('code'), 'upload_url': d.get('upload_url'),
                        'bucket': d.get('bucket'), 'has_auth_info': bool(d.get('auth_info'))}
        host = (d.get('upload_url') or '').split('//')[-1]
        if host:
            import socket
            try:
                socket.gethostbyname(host)
                res['quark']['dns'] = 'ok'
            except Exception:
                res['quark']['dns'] = 'unresolved'
    except Exception as e:
        res['quark'] = {'code': 'ERR', 'msg': str(e)[:80]}
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cmd', choices=['probe', 'fetch'])
    ap.add_argument('--only', default='')
    args = ap.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    state = json.load(open(STATE, encoding='utf-8')) if os.path.exists(STATE) else {'files': {}}
    state['checked_at'] = time.strftime('%Y-%m-%d %H:%M')

    if args.cmd == 'probe':
        state['upload_probe'] = probe()
        state['upload_blocked'] = True
        state['upload_note'] = ('两个云盘都不开放程序化上传：百度 xpan precreate 被风控要验证码，'
                               '夸克直传域名在本机不可解析。改装后的文件需手动拖进客户端上传，'
                               '之后 reshare.py 会自动建分享。')
        json.dump(state, open(STATE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(json.dumps(state['upload_probe'], ensure_ascii=False, indent=1))
        print('→', state['upload_note'])
        return

    items = [x for x in flagged() if not args.only or args.only in x['game']]
    if not items:
        print('没有需要处理的违规文件')
        return
    meta = filemeta([x['path'] for x in items])
    for it in items:
        m = meta.get(it['path'])
        if not m:
            print(f'  ? {it["game"]}: 取不到文件信息')
            continue
        size = m['size']
        base = os.path.basename(it['path'])
        stem, ext = os.path.splitext(base)
        src = os.path.join(OUT_DIR, base)
        dst = os.path.join(OUT_DIR, f'{stem}（补档版）{ext}')
        print(f'  ↓ {it["game"]}  {size/1048576:.1f} MB  {base}')
        try:
            got = download(m, src)
        except Exception as e:
            print(f'    ✗ 下载失败：{str(e)[:80]}')
            continue
        old = md5_of(src)
        token, mode = repack(src, dst)
        new = md5_of(dst)
        os.remove(src)   # 原件不留，避免和改装版混淆
        print(f'    ✓ 改装完成 {os.path.basename(dst)}  {os.path.getsize(dst)/1048576:.1f} MB（{mode}）')
        print(f'      md5 {old[:12]} → {new[:12]}（已改变，可绕过内容判重）')
        state['files'][it['game']] = {
            'platform': it['platform'], 'from_path': it['path'], 'out': os.path.relpath(dst, WORK),
            'size': os.path.getsize(dst), 'md5_before': old, 'md5_after': new,
            'token': token, 'mode': mode, 'uploaded': False, 'error': it['error'],
            'at': time.strftime('%Y-%m-%d %H:%M')}
        json.dump(state, open(STATE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'\n改装 {len(state["files"])} 个文件，目录：{OUT_DIR}')
    print('下一步：把（补档版）拖进百度网盘客户端上传，再跑 reshare.py index / run')


if __name__ == '__main__':
    main()

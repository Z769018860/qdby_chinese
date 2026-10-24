# -*- coding: utf-8 -*-
"""把「链接全失效」的作品补回自己的网盘 —— 探测 + 匹配 + 出计划

自动补档要同时满足三件事，缺一件就补不成，缺哪件必须说清楚，不能假装补上了：

  ① 客户端在                       —— 百度网盘 / 夸克网盘 / 迅雷 至少装一个
  ② 客户端已登录                   —— 只有登录态才能往自己网盘里写文件、建分享
  ③ 本地有补丁文件                 —— 没文件就无从上传

本脚本做前两步的探测与第三步的匹配，产出 data/netdisk-reupload.json：
每部「需要补档」的作品一条，state 为 done / ready / need_file / need_login / no_client，
页面据此显示「已补档」「排队中」「缺文件」「未登录」「没装客户端」，
而不是笼统地说「需要补档」。

用法：
  python scripts/netdisk/reupload.py                    # 探测 + 匹配
  python scripts/netdisk/reupload.py --dir D:\\补档      # 指定补丁目录
  python scripts/netdisk/reupload.py --dir D:\\补档 --run # 三件套齐了才真的传（当前实现为待接入）

登录态判断只看 cookie 名不看值（值是 Chromium 加密的，读不了也不需要读）：
  百度  BDUSS / BDUSS_BFESS
  夸克  __puus / __pus
  迅雷  login_key / uid
"""
import argparse
import glob
import json
import os
import shutil
import sqlite3
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.environ.get('QD_REPO') or os.path.normpath(os.path.join(HERE, '..', '..'))
RAW = os.environ.get('QD_CACHE') or os.path.normpath(os.path.join(REPO, '..', 'raw'))

sys.path.insert(0, os.path.normpath(os.path.join(HERE, '..', 'bili')))
from taxonomy import cn_norm  # noqa: E402

HOME = os.path.expanduser('~')
LOCAL = os.environ.get('LOCALAPPDATA') or os.path.join(HOME, 'AppData', 'Local')
ROAM = os.environ.get('APPDATA') or os.path.join(HOME, 'AppData', 'Roaming')
PF = os.environ.get('ProgramFiles', r'C:\Program Files')
PF86 = os.environ.get('ProgramFiles(x86)', r'C:\Program Files (x86)')

# 客户端：可执行文件候选 + 登录 cookie 库候选 + 登录 cookie 名
CLIENTS = {
    'baidu': {
        'name': '百度网盘',
        'exe': [os.path.join(LOCAL, 'Baidu', 'BaiduNetdisk', 'BaiduNetdisk.exe'),
                os.path.join(PF86, 'Baidu', 'BaiduNetdisk', 'BaiduNetdisk.exe'),
                os.path.join(PF, 'Baidu', 'BaiduNetdisk', 'BaiduNetdisk.exe')],
        'cookie': [os.path.join(ROAM, 'baidunetdisk', 'Network', 'Cookies'),
                   os.path.join(ROAM, 'baidunetdisk', 'Cookies')],
        'auth': ['BDUSS', 'BDUSS_BFESS', 'STOKEN'],
    },
    'quark': {
        'name': '夸克网盘',
        'exe': [os.path.join(LOCAL, 'Programs', 'quark-cloud-drive', 'QuarkCloudDrive.exe'),
                os.path.join(LOCAL, 'Programs', 'Quark', 'quark.exe')],
        'cookie': [os.path.join(ROAM, 'quark-cloud-drive', 'Network', 'Cookies'),
                   os.path.join(LOCAL, 'Quark', 'User Data', 'Default', 'Network', 'Cookies')],
        'auth': ['__puus', '__pus'],
    },
    'xunlei': {
        'name': '迅雷',
        'exe': [os.path.join(PF, 'Thunder Network', 'Thunder', 'Program', 'Thunder.exe'),
                os.path.join(PF86, 'Thunder Network', 'Thunder', 'Program', 'Thunder.exe'),
                os.path.join(LOCAL, 'Thunder Network', 'Thunder', 'Program', 'Thunder.exe')],
        'cookie': [],
        'auth': ['login_key', 'uid'],
    },
}

PATCH_EXT = ('.zip', '.rar', '.7z', '.tar', '.gz', '.exe', '.txt', '.pdf')


def cookie_names(path):
    """读 Chromium cookie 库里的 cookie 名（只读名字，不碰加密值）"""
    if not os.path.exists(path):
        return set()
    tmp = os.path.join(tempfile.gettempdir(), 'qdby_ck.db')
    try:
        shutil.copy2(path, tmp)
        con = sqlite3.connect(tmp)
        return {r[0] for r in con.execute('select name from cookies').fetchall()}
    except Exception:
        return set()
    finally:
        try:
            con.close()
        except Exception:
            pass


def probe_clients():
    out = {}
    for key, cfg in CLIENTS.items():
        exe = next((p for p in cfg['exe'] if os.path.exists(p)), '')
        names = set()
        ck_used = ''
        for c in cfg['cookie']:
            got = cookie_names(c)
            if got:
                names |= got
                ck_used = c
        logged = bool(names & set(cfg['auth']))
        out[key] = {
            'name': cfg['name'],
            'installed': bool(exe),
            'exe': exe,
            'logged_in': logged,
            'cookie_db': ck_used,
            'auth_seen': sorted(names & set(cfg['auth'])),
            'usable': bool(exe) and logged,
        }
    return out


def scan_patch_dirs(dirs):
    """把补丁目录里的文件连名字一起收进来（只收名字，不读内容）"""
    files = []
    for d in dirs:
        if not os.path.isdir(d):
            continue
        for root, _sub, names in os.walk(d):
            # 目录别钻太深，补档目录一般是「作品名/文件」
            if root[len(d):].count(os.sep) > 3:
                continue
            for n in names:
                if n.lower().endswith(PATCH_EXT):
                    files.append({'path': os.path.join(root, n), 'name': n,
                                  'size': os.path.getsize(os.path.join(root, n))})
    return files


def match_file(name, files):
    """作品名出现在文件名或所在目录名里就算命中；取最短的那条（通常就是本体）"""
    key = cn_norm(name)
    if not key:
        return None
    hits = []
    for f in files:
        blob = cn_norm(f['name'] + ' ' + os.path.basename(os.path.dirname(f['path'])))
        if key in blob or (len(blob) >= 4 and blob in key):
            hits.append(f)
    hits.sort(key=lambda x: (len(x['name']), -x['size']))
    return hits[0] if hits else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', action='append', default=[], help='补丁文件所在目录，可多次给')
    ap.add_argument('--run', action='store_true', help='三件套齐备时真正执行上传（当前仅做前置校验）')
    args = ap.parse_args()

    dirs = list(args.dir) or [x for x in os.environ.get('QD_PATCH_DIR', '').split(os.pathsep) if x]
    if not dirs:
        dirs = [os.path.join(os.path.dirname(REPO), '补档'), os.path.join(HOME, 'Downloads'),
                os.path.join(HOME, 'Desktop')]
    dirs = [os.path.abspath(d) for d in dirs]

    clients = probe_clients()
    files = scan_patch_dirs(dirs)
    print('客户端：')
    for k, c in clients.items():
        print('  %-6s %-6s 登录=%s%s' % (c['name'], '已安装' if c['installed'] else '未安装',
                                       '是' if c['logged_in'] else '否',
                                       ('  ' + c['exe']) if c['exe'] else ''))
    print('补丁目录：%s' % '、'.join('%s(%d 个文件)' % (d, len([f for f in files if f['path'].startswith(d)]))
                                 for d in dirs))

    led = json.load(open(os.path.join(REPO, 'data', 'netdisk-links.json'), encoding='utf-8'))
    af = json.load(open(os.path.join(REPO, 'data', 'netdisk-autofill.json'), encoding='utf-8'))

    usable = [k for k, c in clients.items() if c['usable']]
    best_client = ('baidu' if 'baidu' in usable else usable[0]) if usable else ''

    out = {'meta': {}, 'games': {}}
    states = {'done': 0, 'ready': 0, 'need_file': 0, 'need_login': 0, 'no_client': 0}

    for g in led['games']:
        name = g.get('name') or ''
        rec = (af.get('games') or {}).get(name)
        if not rec or rec.get('state') not in ('pending', 'none'):
            continue  # 还有能用的链接，不需要补档

        f = match_file(name, files)
        if not best_client:
            has_client = any(c['installed'] for c in clients.values())
            state = 'need_login' if has_client else 'no_client'
            why = ('客户端已安装但未登录，登录后即可自动上传并生成新分享'
                   if has_client else '本机没有可用的网盘客户端')
        elif not f:
            state = 'need_file'
            why = '没有在补档目录里找到这部作品的补丁文件'
        else:
            state = 'ready'
            why = '条件已齐备，可执行上传并生成新分享链接'

        out['games'][name] = {
            'state': state,
            'client': best_client,
            'client_name': clients[best_client]['name'] if best_client else '',
            'file': (f['path'] if f else ''),
            'file_size': (f['size'] if f else 0),
            'why': why,
            'dead_platforms': [d.get('platform_name') or d.get('platform') for d in rec.get('dead') or []],
            'done_at': '',
            'new_share': '',
        }
        states[state] += 1

    out['meta'] = {
        'generated_at': time.strftime('%Y-%m-%d %H:%M'),
        'clients': clients,
        'patch_dirs': dirs,
        'patch_files': len(files),
        'best_client': best_client,
        'summary': states,
        'note': '自动补档需要「客户端已安装 + 已登录 + 本地有补丁文件」三件事同时成立；'
                'state 会明确停在哪一步，缺什么写什么。',
    }

    dst = os.path.join(REPO, 'data', 'netdisk-reupload.json')
    with open(dst, 'w', encoding='utf-8', newline='\n') as fp:
        json.dump(out, fp, ensure_ascii=False, indent=1)
    print('待补档作品 %d 个：%s' % (sum(states.values()), states))
    print('->', dst)

    if args.run and not states['ready']:
        print('没有可执行的任务，--run 未做任何事')
    return 0


if __name__ == '__main__':
    sys.exit(main())

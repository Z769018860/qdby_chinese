# -*- coding: utf-8 -*-
"""每日 0 点巡检：网盘链接有效性 → 更新站点数据 → 全灭告警邮件

一次跑完三件事：
  1. 核验 data/netdisk-links.json 里每一条网盘链接（百度/夸克/UC/123/蓝奏走接口，
     迅雷/城通/微云走无头浏览器——脚本会自己把浏览器拉起来，跑完再关掉）；
     顺带把「重新分享」出来的补档链接（data/netdisk-reshare.json）也验一遍，
     否则一个作品的原链全死了、补档却活着，会误报成「全灭」。
  2. 把结果写回台账，并重新生成站点用的 netdisk-status.json /
     netdisk-links.html / netdisk-autofill.json —— 也就是「更新到网站上」。
  3. 挑出「所有链接都失效」的作品，发一封邮件到收件人（默认 769018860@qq.com）。

邮件怎么发（两种，优先 SMTP）：
  · SMTP：在 work/mail.json 里填 smtp_host / smtp_port / user / password / to
    （QQ 邮箱要用「授权码」当 password，不是登录密码），或用环境变量
    QD_SMTP_HOST / QD_SMTP_PORT / QD_SMTP_USER / QD_SMTP_PASS / QD_MAIL_TO。
  · 没配 SMTP 时：把告警写成 work/netdisk-alert.json 并以退出码 3 结束，
    交给定时任务里的 agent 用 Agent Mail 发（谁也发不了就留档，不影响站点更新）。

用法：
  python scripts/netdisk/daily_check.py                # 全量巡检 + 更新站点 + 发信
  python scripts/netdisk/daily_check.py --fast         # 跳过浏览器通道（快，迅雷等标待确认）
  python scripts/netdisk/daily_check.py --no-mail      # 只巡检，不发信
  python scripts/netdisk/daily_check.py --push         # 巡检完顺手 commit & push
  python scripts/netdisk/daily_check.py --test-mail    # 只测发信配置
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import smtplib
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from email.header import Header
from email.mime.text import MIMEText
from email.utils import formataddr, formatdate

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.environ.get('QD_REPO') or os.path.normpath(os.path.join(HERE, '..', '..'))
WORK = os.path.normpath(os.path.join(REPO, '..'))
sys.path.insert(0, HERE)
import refresh as R          # noqa: E402
import build_status as BS    # noqa: E402

LEDGER = os.path.join(REPO, 'data', 'netdisk-links.json')
RESHARE = os.path.join(REPO, 'data', 'netdisk-reshare.json')
ALERT = os.path.join(WORK, 'netdisk-alert.json')
MAILCFG = os.path.join(WORK, 'mail.json')
DEF_TO = '769018860@qq.com'
CDP_PORT = '9223'
PLAT_NAME = dict((k, n) for k, n, _ in R.PLATFORMS)

BROWSERS = [
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
]


# ---------------------------------------------------------------- 浏览器
class Headless:
    """迅雷/城通/微云是 SPA，纯接口判不了，只能渲染。这里自己起一个无头浏览器，
    这样定时任务不需要事先开着浏览器。"""

    def __init__(self, port=CDP_PORT):
        self.port = port
        self.proc = None
        self.tmp = None

    def __enter__(self):
        exe = next((p for p in BROWSERS if os.path.exists(p)), None) or \
              shutil.which('msedge') or shutil.which('google-chrome') or shutil.which('chrome')
        if not exe:
            return None
        self.tmp = tempfile.mkdtemp(prefix='qdchrome-')
        self.proc = subprocess.Popen(
            [exe, '--headless=new', f'--remote-debugging-port={self.port}',
             f'--user-data-dir={self.tmp}', '--no-first-run', '--no-default-browser-check',
             '--disable-gpu', '--disable-extensions', 'about:blank'],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(50):
            try:
                with urllib.request.urlopen(f'http://127.0.0.1:{self.port}/json/version',
                                            timeout=1) as r:
                    if r.status == 200:
                        return self
            except Exception:
                time.sleep(0.5)
        self.close()
        return None

    def close(self):
        if self.proc:
            try:
                self.proc.terminate()
                self.proc.wait(timeout=10)
            except Exception:
                try:
                    self.proc.kill()
                except Exception:
                    pass
            self.proc = None
        if self.tmp:
            shutil.rmtree(self.tmp, ignore_errors=True)
            self.tmp = None

    def __exit__(self, *a):
        self.close()


# ---------------------------------------------------------------- 巡检
def stamp(links, now):
    for L in links:
        st = L.get('status') or 'unknown'
        L['status_text'] = R.STATUS_LABEL.get(st, '待确认')
        L['checked_at'] = now


def reshare_links(rs):
    """把补档链接摊平成和台账一样的结构，一起验"""
    out = []
    for name, g in (rs.get('games') or {}).items():
        for plat, v in (g.get('links') or {}).items():
            url = (v or {}).get('url')
            if not url:
                continue
            out.append({'name': name, 'url': url, 'platform': plat, 'pwd': v.get('pwd') or '',
                        'share_id': R.share_id(url, plat),
                        'platform_name': PLAT_NAME.get(plat, plat),
                        'source': 'reshare', 'status': 'unknown', 'detail': '待核验',
                        'ref': v})
    return out


def check_all(links, fast=False, node='node'):
    """接口通道 + 浏览器通道；返回 Counter"""
    api = [L for L in links if L.get('platform') in R.API_CHECKERS]
    spa = [L for L in links if L.get('platform') in R.SPA_PLATFORMS]
    n_api = R.run_api_checks(api) if api else {}
    n_spa = {}
    if spa:
        if fast:
            for L in spa:
                L['status'], L['detail'] = 'unknown', '本次跳过浏览器核验'
        else:
            with Headless() as br:
                if br is None:
                    for L in spa:
                        L['status'], L['detail'] = 'unknown', '未找到可用浏览器'
                    print('      没有找到 Edge/Chrome，浏览器通道跳过')
                else:
                    n_spa = R.run_spa_checks(spa, node_bin=node)
    return n_api, n_spa


def all_dead_list(games, rs_links, by_name_rs):
    """挑出「一条可用链接都没有」的作品

    一个作品常常同时在两三个盘，全死才算全灭；补档链接活着也不算全灭。
    只有「至少有一条明确失效、且没有任何一条有效」时才告警，
    免得 gdrive 这种本机访问不了的盘天天报。
    """
    out = []
    for g in games:
        links = [L for L in (g.get('links') or [])]
        extra = by_name_rs.get(g['name']) or []
        links = links + extra
        if not links:
            continue
        ok = [L for L in links if L.get('status') == 'ok']
        dead = [L for L in links if L.get('status') == 'dead']
        if ok or not dead:
            continue
        out.append({
            'name': g['name'],
            'bvid': g.get('bvid') or '',
            'bili_url': g.get('bili_url') or g.get('release_url') or '',
            'video_title': g.get('video_title') or '',
            'dead_platforms': sorted({L.get('platform_name') or L.get('platform') for L in dead}),
            'total': len(links),
            'detail': [{'platform': L.get('platform_name') or L.get('platform'),
                        'url': L.get('url'), 'why': L.get('detail') or ''} for L in dead],
        })
    return out


# ---------------------------------------------------------------- 邮件
def mail_cfg():
    cfg = {}
    if os.path.exists(MAILCFG):
        try:
            cfg.update(json.load(open(MAILCFG, encoding='utf-8')))
        except Exception as e:
            print('  ! mail.json 读不动：', e)
    env = {'smtp_host': 'QD_SMTP_HOST', 'smtp_port': 'QD_SMTP_PORT', 'user': 'QD_SMTP_USER',
           'password': 'QD_SMTP_PASS', 'to': 'QD_MAIL_TO'}
    for k, e in env.items():
        if os.environ.get(e):
            cfg[k] = os.environ[e]
    cfg.setdefault('smtp_host', '')
    cfg.setdefault('smtp_port', 465)
    cfg.setdefault('to', DEF_TO)
    return cfg


def compose(dead, now):
    day = now[:10]
    subj = '【青灯不弈汉化】%d 个作品的网盘已全部失效（%s）' % (len(dead), day)
    lines = ['巡检时间：%s' % now, '',
             '以下作品的网盘链接全部失效，需要重新补档：', '']
    for i, d in enumerate(dead, 1):
        lines.append('%d. 《%s》' % (i, d['name']))
        if d['video_title']:
            lines.append('   投稿：%s' % d['video_title'])
        if d['bili_url']:
            lines.append('   入口：%s' % d['bili_url'])
        lines.append('   失效盘：%s' % '、'.join(d['dead_platforms']))
        for x in d['detail'][:6]:
            lines.append('     - %s %s  %s' % (x['platform'], x['url'], x['why']))
        lines.append('')
    lines += ['——',
              '本信件由 scripts/netdisk/daily_check.py 每日 0 点自动发送。',
              '补档流程：把文件放进网盘 → python scripts/netdisk/reshare.py index && plan && run',
              '→ python scripts/netdisk/post_comments.py']
    return subj, '\n'.join(lines)


def send_mail(subj, body, cfg):
    if not cfg.get('smtp_host') or not cfg.get('user') or not cfg.get('password'):
        return False, '未配置 SMTP（work/mail.json 或 QD_SMTP_* 环境变量）'
    msg = MIMEText(body, 'plain', 'utf-8')
    msg['Subject'] = Header(subj, 'utf-8')
    msg['From'] = formataddr((str(Header('青灯不弈汉化 · 巡检', 'utf-8')), cfg['user']))
    msg['To'] = cfg['to']
    msg['Date'] = formatdate(localtime=True)
    port = int(cfg.get('smtp_port') or 465)
    try:
        if port == 465:
            s = smtplib.SMTP_SSL(cfg['smtp_host'], port, timeout=30)
        else:
            s = smtplib.SMTP(cfg['smtp_host'], port, timeout=30)
            s.starttls()
        with s:
            s.login(cfg['user'], cfg['password'])
            s.sendmail(cfg['user'], [x.strip() for x in str(cfg['to']).split(',') if x.strip()],
                       msg.as_string())
        return True, '已发送到 %s' % cfg['to']
    except Exception as e:
        return False, '%s: %s' % (type(e).__name__, str(e)[:120])


# ---------------------------------------------------------------- 站点
def refresh_site(games, now):
    """台账 → 站点数据：links.json / links.md / links.html / status.json / autofill.json"""
    R.write_outputs(games, checked=True)
    BS.main()
    if not os.environ.get('QD_SKIP_AUTOFILL'):
        try:
            subprocess.run([sys.executable, os.path.join(HERE, 'autofill.py')],
                           cwd=REPO, check=False)
        except Exception as e:
            print('  ! autofill 失败：', e)


def git_push(now):
    def run(*a):
        return subprocess.run(['git', *a], cwd=REPO, capture_output=True, text=True)
    run('add', 'data')
    d = run('diff', '--cached', '--quiet')
    if d.returncode == 0:
        print('  = 数据无变化，不提交')
        return
    c = run('commit', '-m', 'chore: 网盘有效性巡检 %s（自动）' % now[:16])
    print('  ', (c.stdout or c.stderr).strip().splitlines()[0] if (c.stdout or c.stderr) else '')
    p = run('push')
    print('  push:', (p.stdout or p.stderr).strip()[-160:] or 'ok')


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description='每日网盘巡检 + 站点更新 + 全灭告警')
    ap.add_argument('--fast', action='store_true', help='跳过迅雷/城通/微云的浏览器核验')
    ap.add_argument('--no-mail', action='store_true', help='不发信，只写告警文件')
    ap.add_argument('--no-site', action='store_true', help='只巡检，不重新生成站点数据')
    ap.add_argument('--push', action='store_true', help='巡检完 git commit & push')
    ap.add_argument('--test-mail', action='store_true', help='只验证发信配置')
    ap.add_argument('--node', default=os.environ.get('NODE_BIN') or 'node')
    args = ap.parse_args()

    now = time.strftime('%Y-%m-%d %H:%M')
    if args.test_mail:
        cfg = mail_cfg()
        ok, msg = send_mail('【测试】青灯不弈汉化 · 网盘巡检发信配置', '这是一封测试邮件，收到即配置正确。\n' + now, cfg)
        print(('✓ ' if ok else '✗ ') + msg)
        return 0 if ok else 1

    print('== %s 网盘巡检 ==' % now)
    led = json.load(open(LEDGER, encoding='utf-8'))
    games = led['games']
    links = [L for g in games for L in (g.get('links') or [])]
    print('台账：%d 个作品 / %d 条链接' % (len(games), len(links)))

    rs = {}
    if os.path.exists(RESHARE):
        rs = json.load(open(RESHARE, encoding='utf-8'))
    extras = reshare_links(rs)
    by_name_rs = {}
    for x in extras:
        by_name_rs.setdefault(x['name'], []).append(x)
    if extras:
        print('补档链接：%d 条（一起验，避免误报全灭）' % len(extras))

    t0 = time.time()
    check_all(links + extras, fast=args.fast, node=args.node)
    stamp(links, now)
    stamp(extras, now)
    # 补档链接的状态回写进 reshare.json，站点弹层里那几条也就能显示是否还活着
    for x in extras:
        ref = x.get('ref') or {}
        ref['checked'] = x.get('status')
        ref['checked_at'] = now
        ref['checked_detail'] = x.get('detail') or ''
    if extras:
        json.dump(rs, open(RESHARE, 'w', encoding='utf-8', newline='\n'),
                  ensure_ascii=False, indent=1)

    dead = all_dead_list(games, extras, by_name_rs)
    cnt = {'ok': 0, 'dead': 0, 'unknown': 0}
    for L in links:
        cnt[L.get('status') if L.get('status') in cnt else 'unknown'] += 1
    print('结果：有效 %d ／ 失效 %d ／ 待确认 %d（%.0fs）'
          % (cnt['ok'], cnt['dead'], cnt['unknown'], time.time() - t0))
    print('全灭作品：%d 个%s' % (len(dead), ('：' + '、'.join(d['name'] for d in dead)) if dead else ''))

    if not args.no_site:
        print('-- 更新站点数据 --')
        refresh_site(games, now)

    subj, body = compose(dead, now) if dead else ('', '')
    alert = {'at': now, 'count': len(dead), 'games': dead, 'subject': subj, 'body': body,
             'summary': cnt, 'mailed': False, 'mail_error': ''}
    if dead and not args.no_mail:
        cfg = mail_cfg()
        ok, msg = send_mail(subj, body, cfg)
        alert['mailed'] = ok
        alert['mail_error'] = '' if ok else msg
        print(('✓ 邮件 ' if ok else '! 邮件未发 ') + msg)
    if os.path.exists(ALERT) or dead:
        json.dump(alert, open(ALERT, 'w', encoding='utf-8', newline='\n'),
                  ensure_ascii=False, indent=1)
    if dead:
        print('告警文件：%s' % ALERT)

    if args.push:
        git_push(now)

    if dead and not alert['mailed'] and not args.no_mail:
        print('ALERT_UNMAILED %d %s' % (len(dead), ALERT))
        return 3
    return 0


if __name__ == '__main__':
    sys.exit(main())

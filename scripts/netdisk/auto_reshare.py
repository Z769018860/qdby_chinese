# -*- coding: utf-8 -*-
"""巡检之后给「有问题的资源」自动补档

daily_check.py 只负责判死活，补档这一步交给这里，串起来是：

  判死 → 在云端找同名资源 → 重新建分享 → 核验 → 把新链接发到视频置顶评论下 → 回写

「有问题」= 台账里有一条明确失效的链接，或者之前补档出来的链接自己也失效了。
前者补回那个盘，后者说明分享被取消了，重新建一次。

云端实在找不到（文件没上传过、或者名字对不上）的，先看 work/local-files.json
里有没有登记本地文件：有就借无头浏览器走夸克网页版上传（web_upload.mjs），
传完再建分享；没有就只能算「无法自动补档」，交回 daily_check 发邮件。

用法：
  python scripts/netdisk/auto_reshare.py            # 全自动
  python scripts/netdisk/auto_reshare.py --dry     # 只看会做什么，不动云端
  python scripts/netdisk/auto_reshare.py --only 冬鸦 # 只处理名字里含这串的
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.environ.get('QD_REPO') or os.path.normpath(os.path.join(HERE, '..', '..'))
WORK = os.path.normpath(os.path.join(REPO, '..'))
sys.path.insert(0, HERE)
import daily_check as D          # noqa: E402  复用它的无头浏览器与路径常量
import reshare as RSH            # noqa: E402  复用 verify()

LEDGER = D.LEDGER
RESHARE = D.RESHARE
REPORT = os.path.join(WORK, 'auto-reshare-report.json')
LOCALFILES = os.path.join(WORK, 'local-files.json')
UPLOAD_PORT = '9231'

# reshare.py / post_comments.py 每次跑完都会打的收尾行，判断成功失败时要滤掉
NOISE = ('完成，共', '-> ', '完成：成功', '夸克会话', '百度会话', '改写完成')

PY = sys.executable


def load(p, default):
    if not os.path.exists(p):
        return default
    try:
        return json.load(open(p, encoding='utf-8'))
    except Exception as e:
        print('  ! %s 读不动：%s' % (os.path.basename(p), e))
        return default


def needy(led, rs):
    """挑出需要补档的作品：有失效链接，或补档链接自己也失效了"""
    out = {}
    for g in (led.get('games') or []):
        name = g.get('name')
        if not name:
            continue
        links = g.get('links') or []
        dead = [L for L in links if L.get('status') == 'dead']
        alive = [L for L in links if L.get('status') == 'ok']
        rlinks = ((rs.get('games') or {}).get(name) or {}).get('links') or {}
        rdead = {k: v for k, v in rlinks.items()
                 if v.get('url') and v.get('checked') == 'dead'}
        ralive = [k for k, v in rlinks.items() if v.get('url') and k not in rdead]
        if not dead and not rdead:
            continue
        out[name] = {
            'all_dead': (not alive) and (not ralive) and bool(dead or rdead),
            'dead_plats': sorted({L.get('platform') for L in dead if L.get('platform')}),
            'reshare_dead': sorted(rdead),
            'bvid': g.get('bvid') or '',
            'bili_url': g.get('bili_url') or g.get('release_url') or '',
        }
    return out


def run(cmd, timeout=1800, **kw):
    try:
        r = subprocess.run(cmd, cwd=REPO, timeout=timeout, capture_output=True,
                           text=True, encoding='utf-8', errors='replace', **kw)
        return r.returncode, (r.stdout or '') + (r.stderr or '')
    except subprocess.TimeoutExpired:
        return -1, 'TIMEOUT %ss' % timeout


def snapshot(rs, name):
    g = (rs.get('games') or {}).get(name) or {}
    return {k: (v or {}).get('url') for k, v in (g.get('links') or {}).items()}


def try_local_upload(name, info, report):
    """云端没货时，看 work/local-files.json 有没有登记本地文件"""
    mapping = load(LOCALFILES, {})
    ent = mapping.get(name)
    if not ent:
        return False, '云端没有同名资源，work/local-files.json 里也没登记本地文件'
    path = ent if isinstance(ent, str) else (ent.get('path') or '')
    if not path or not os.path.exists(path):
        return False, '登记的文件不存在：%s' % (path or '(空)')
    node = os.environ.get('NODE_BIN') or 'node'
    script = os.path.join(REPO, 'scripts', 'netdisk', 'web_upload.mjs')
    if not os.path.exists(script):
        return False, '缺少 scripts/netdisk/web_upload.mjs'
    print('  ↑ %s：上传本地文件 %s' % (name, os.path.basename(path)))
    before = {it['path'] for it in load(os.path.join(WORK, 'cloud-index.json'),
                                        {'quark': []}).get('quark') or []}
    with D.Headless(port=UPLOAD_PORT) as br:
        if br is None:
            return False, '没有可用浏览器，无法走网页版上传'
        env = dict(os.environ, QD_PORT=UPLOAD_PORT, QD_PY=PY)
        code, out = run([node, script, path], timeout=900, env=env)
    if code != 0:
        return False, '网页版上传失败：%s' % (out.strip().splitlines()[-1:] or [''])[0][:120]
    # 重建索引，把刚传上去的改名成中文，否则下次 plan 匹配不上
    code, out = run([PY, os.path.join('scripts', 'netdisk', 'reshare.py'), 'index'],
                    timeout=1500)
    if code != 0:
        return False, '上传后重建索引失败'
    idx = load(os.path.join(WORK, 'cloud-index.json'), {'quark': []})
    added = [it for it in (idx.get('quark') or []) if it['path'] not in before]
    if not isinstance(ent, dict) or ent.get('rename'):
        newname = (ent.get('rename') if isinstance(ent, dict) else None) or \
                  ('%s 汉化补丁%s' % (name, os.path.splitext(path)[1] or '.zip'))
        s = RSH.quark_session()
        for it in added:
            try:
                s.post('https://drive-pc.quark.cn/1/clouddrive/file/rename',
                       params={'pr': 'ucpro', 'fr': 'pc'},
                       json={'fid': it.get('id'), 'file_name': newname}, timeout=25)
                print('    改名 → %s' % newname)
            except Exception:
                pass
    code, out = run([PY, os.path.join('scripts', 'netdisk', 'reshare.py'), 'plan'],
                    timeout=300)
    return True, '已上传并改名'


def try_salvage(name, report, force_refit=False):
    """本地也没文件 / 百度判违规时，交给 salvage 跨网盘抢救

    salvage 会自己判断：
      · 别的盘里有同名（或像）的文件 → 下载 → 上传 → 建分享
      · 百度判违规的那几个 → 下载 → 改装换哈希 → 上传 → 建分享
    scan 只跑 API，do 才需要浏览器（下载/上传都走网页版）。
    """
    salvage = os.path.join('scripts', 'netdisk', 'salvage.py')
    if not os.path.exists(os.path.join(REPO, 'scripts', 'netdisk', 'salvage.py')):
        return False, '缺少 scripts/netdisk/salvage.py'
    env = dict(os.environ, QD_PY=PY, QD_NODE=(os.environ.get('NODE_BIN') or 'node'))
    args = [PY, salvage, 'do', '--game', name, '--kind',
            'violation' if force_refit else 'missing', '--min-score', '0.79']
    if force_refit:
        args.append('--force-refit')
    saved = os.environ.get('QD_PORT')
    try:
        with D.Headless(port=UPLOAD_PORT) as br:
            if br is None:
                return False, '没有可用浏览器，无法走网页版下载/上传'
            env = dict(env, QD_PORT=UPLOAD_PORT)
            code, out = run(args, timeout=2700, env=env)
    finally:
        if saved is None:
            os.environ.pop('QD_PORT', None)
        else:
            os.environ['QD_PORT'] = saved
    for line in (out or '').splitlines():
        if line.strip() and not any(n in line for n in NOISE):
            print('    ' + line.strip()[:140])

    data = load(os.path.join(REPO, 'data', 'netdisk-salvage.json'), {})
    res = (data.get('results') or {}).get(name) or {}
    state = res.get('state')
    if state == 'done':
        return True, '跨网盘抢救成功'
    if state in ('need_confirm', 'no_candidate'):
        return False, ('云端匹配度不够，等人确认（%s）' % state)
    return False, (res.get('note') or state or 'salvage 未成功')[:120]


def main():
    ap = argparse.ArgumentParser(description='失效资源自动补档')
    ap.add_argument('--dry', action='store_true', help='只打印要做什么')
    ap.add_argument('--only', default='', help='只处理名字里含这串的作品')
    ap.add_argument('--no-comment', action='store_true', help='建完分享不发评论')
    ap.add_argument('--node', default=os.environ.get('NODE_BIN') or 'node')
    args = ap.parse_args()

    now = time.strftime('%Y-%m-%d %H:%M')
    led = load(LEDGER, {'games': []})
    rs = load(RESHARE, {'games': {}})
    need = needy(led, rs)
    if args.only:
        need = {k: v for k, v in need.items() if args.only in k}
    report = {'at': now, 'tried': sorted(need), 'reshared': {}, 'failed': {},
              'skipped': {}, 'commented': [], 'uploaded': [], 'dry': args.dry}
    if not need:
        print('  没有需要补档的资源')
        json.dump(report, open(REPORT, 'w', encoding='utf-8', newline='\n'),
                  ensure_ascii=False, indent=1)
        return 0
    print('  需要补档 %d 个：%s' % (len(need), '、'.join(sorted(need))[:200]))

    if args.dry:
        for n, v in need.items():
            print('  [dry] %s 失效盘=%s 补档失效=%s 全灭=%s'
                  % (n, v['dead_plats'], v['reshare_dead'], v['all_dead']))
        json.dump(report, open(REPORT, 'w', encoding='utf-8', newline='\n'),
                  ensure_ascii=False, indent=1)
        return 0

    # 1. 重建云端索引（新传的文件、挪过位置的文件都要能找到）
    code, out = run([PY, os.path.join('scripts', 'netdisk', 'reshare.py'), 'index'],
                    timeout=1500)
    for line in (out or '').strip().splitlines()[-3:]:
        print('  ' + line)
    if code != 0:
        print('  ! 云端索引失败，跳过自动补档')
        report['failed']['*'] = '云端索引失败'
        json.dump(report, open(REPORT, 'w', encoding='utf-8', newline='\n'),
                  ensure_ascii=False, indent=1)
        return 1
    code, out = run([PY, os.path.join('scripts', 'netdisk', 'reshare.py'), 'plan'],
                    timeout=300)
    if code != 0:
        print('  ! 生成补档计划失败')
        report['failed']['*'] = '生成补档计划失败'
        json.dump(report, open(REPORT, 'w', encoding='utf-8', newline='\n'),
                  ensure_ascii=False, indent=1)
        return 1

    # 2. 逐个建分享
    for name, info in sorted(need.items()):
        before = snapshot(rs, name)
        code, out = run([PY, os.path.join('scripts', 'netdisk', 'reshare.py'),
                         'run', '--only', name, '--exact'], timeout=300)
        rs = load(RESHARE, {'games': {}})
        after = snapshot(rs, name)
        got = {k: u for k, u in after.items() if u and u != before.get(k)}
        lines = [l.strip() for l in (out or '').splitlines()
                 if l.strip() and not any(n in l for n in NOISE)]
        for line in lines:
            print('  ' + line[:150])
        if not got:
            errs = [l for l in lines if ('✗' in l or 'errno' in l or '无登录态' in l)]
            if not errs and any('已有补档' in l for l in lines):
                report['skipped'][name] = '已有补档链接且仍有效'
                print('  = %s：已有补档链接且仍有效' % name)
                continue
            # 云端没货：全灭的作品先试本地文件，本地也没有就跨网盘抢救
            if info['all_dead'] and not errs:
                ok, why = try_local_upload(name, info, report)
                if not ok:
                    report['salvage_try'] = report.get('salvage_try', []) + [name]
                    ok, why = try_salvage(name, report)
                if ok:
                    report['uploaded'].append(name)
                    report['uploaded'].append(name)
                    code, out = run([PY, os.path.join('scripts', 'netdisk', 'reshare.py'),
                                     'run', '--only', name, '--exact'], timeout=300)
                    rs = load(RESHARE, {'games': {}})
                    after = snapshot(rs, name)
                    got = {k: u for k, u in after.items() if u and u != before.get(k)}
                    more = [l.strip() for l in (out or '').splitlines()
                            if l.strip() and not any(n in l for n in NOISE)]
                    for line in more:
                        print('  ' + line[:150])
                    if not got:
                        errs = [l for l in more if ('✗' in l or 'errno' in l)]
            # 百度判违规（errno=109）：改装换哈希再传，内容没变、用户解压方式不变
            if not got and any('109' in e for e in errs):
                report['salvage_try'] = report.get('salvage_try', []) + [name]
                if try_salvage(name, report, force_refit=True)[0]:
                    report['uploaded'].append(name)
                    rs = load(RESHARE, {'games': {}})
                    got = {k: u for k, u in snapshot(rs, name).items()
                           if u and u != before.get(k)}
            if not got:
                reason = (errs or ['云端没有同名资源'])[-1][:120]
                report['failed'][name] = reason
                print('  ✗ %s：%s' % (name, reason))
                continue
        report['reshared'][name] = sorted(got)
        print('  ✓ %s：%s' % (name, '、'.join(sorted(got))))

    # 3. 新链接当场验一遍，站点弹层里不会显示一个已经死的链接
    qs = bs = None
    for name, plats in report['reshared'].items():
        g = (rs.get('games') or {}).get(name) or {}
        for plat in plats:
            v = (g.get('links') or {}).get(plat) or {}
            if not v.get('url'):
                continue
            sess = None
            if plat == 'quark':
                qs = qs or RSH.quark_session()
                sess = qs
            ok, msg = RSH.verify(plat, v['url'], v.get('pwd') or '', sess)
            v['checked'] = 'ok' if ok else 'dead'
            v['checked_at'] = now
            v['checked_detail'] = msg or ''
    json.dump(rs, open(RESHARE, 'w', encoding='utf-8', newline='\n'),
              ensure_ascii=False, indent=1)

    # 4. 把新链接发到视频置顶评论下（先改写旧的，再补发没发过的）
    if not args.no_comment and report['reshared']:
        for name in sorted(report['reshared']):
            code, out = run([PY, os.path.join('scripts', 'netdisk', 'post_comments.py'),
                             '--only', name, '--exact', '--reformat'], timeout=300)
            code2, out2 = run([PY, os.path.join('scripts', 'netdisk', 'post_comments.py'),
                               '--only', name, '--exact'], timeout=300)
            tail = [l.strip() for l in ((out2 or '') + (out or '')).splitlines()
                    if l.strip() and not any(n in l for n in NOISE)]
            for line in tail[-3:]:
                print('  ' + line[:150])
            if code2 == 0:
                report['commented'].append(name)

    json.dump(report, open(REPORT, 'w', encoding='utf-8', newline='\n'),
              ensure_ascii=False, indent=1)
    print('  补档完成：新建 %d 个 / 已有跳过 %d 个 / 失败 %d 个 / 发评论 %d 个'
          % (len(report['reshared']), len(report['skipped']),
             len(report['failed']), len(report['commented'])))
    return 0


if __name__ == '__main__':
    sys.exit(main())

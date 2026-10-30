// 百度网页版上传：客户端 API 的上传口是封的（xpan precreate 要验证码 errno=9019），
// 于是把客户端 cookie 注入无头浏览器，让 pan.baidu.com 的上传器自己传。
//
// 用法：
//   QD_PORT=9228 node scripts/netdisk/web_upload_baidu.mjs <文件绝对路径> [更多文件...]
// 前提：一个开了 --remote-debugging-port 的 Edge/Chrome（端口用 QD_PORT 指定），
//       且百度网盘客户端已登录（cookie 从客户端 profile 读）。
// 传完接着跑 reshare.py index && reshare.py run --only <作品名片段> 建分享。
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { connect, sleep } from '../../../cdp.mjs';

const HERE = import.meta.dirname;
const REPO = process.env.QD_REPO || path.resolve(HERE, '../..');
const PORT = Number(process.env.QD_PORT || 9228);
const PY = process.env.QD_PY || 'C:/Users/Administrator/AppData/Local/Programs/Python/Python310/python.exe';
const WAIT_MIN = Number(process.env.QD_WAIT_MIN || 8);

const FILES = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!FILES.length) {
  console.error('用法：node scripts/netdisk/web_upload_baidu.mjs <文件> [文件...]');
  process.exit(1);
}

const code = `
import sys, json
sys.path.insert(0, 'scripts/netdisk')
import browser_cookies as bc
ck = bc.read_cookies(r'C:\\Users\\Administrator\\AppData\\Roaming\\baidunetdisk', '')
d = [c for c in ck if 'baidu.com' in c['host']]
print(json.dumps([{'name': c['name'], 'value': c['value']} for c in d], ensure_ascii=False))
`;
const cookies = JSON.parse(
  execFileSync(PY, ['-c', code], { cwd: REPO, encoding: 'utf8', maxBuffer: 40e6 }).trim().split('\n').pop());
if (!cookies.some(c => c.name === 'BDUSS')) {
  console.error('客户端 cookie 里没有 BDUSS，先去百度网盘客户端登录');
  process.exit(1);
}

const b = await connect(PORT);
await b.send('Network.enable');
for (const c of cookies) {
  for (const host of ['.baidu.com', 'pan.baidu.com']) {
    try {
      await b.send('Network.setCookie', {
        name: c.name, value: c.value, domain: host, path: '/', secure: true, sameSite: 'None',
      });
    } catch {}
  }
}
await b.goto('https://pan.baidu.com/disk/main', 8000);
await sleep(3500);

const who = await b.ev(`(() => {
  const t = (document.body.innerText || '');
  const m = t.match(/([\\d.]+[TGM]?B?\\s*\\/\\s*[\\d.]+[TGM]?B)/);
  return JSON.stringify({ url: location.href, quota: m ? m[1] : '', loggedIn: !/登录|扫码/.test(t.slice(0, 200)) });
})()`);
console.log('页面：', who);

await b.send('DOM.enable');
const doc = await b.send('DOM.getDocument', { depth: -1, pierce: true });
const root = (doc.result || {}).root;
const q = await b.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: 'input[type=file]' });
let nodeIds = (q.result || {}).nodeIds || [];
// 优先挑「不选文件夹、accept 全量」的那个（百度上传器的主输入框）
let picked = null;
for (const id of nodeIds) {
  const d = await b.send('DOM.describeNode', { nodeId: id });
  const attrs = ((d.result || {}).node || {}).attributes || [];
  const s = attrs.join(' ');
  if (s.includes('webkitdirectory')) continue;
  picked = id;
  break;
}
if (!picked && nodeIds.length) picked = nodeIds[0];
if (!picked) {
  console.error('没找到上传用的 file input（页面结构变了？）');
  await b.close();
  process.exit(1);
}

await b.send('DOM.setFileInputFiles', { files: FILES, nodeId: picked });
console.log('已提交', FILES.length, '个文件，上传中…（完成与否以接口落盘为准）');

// 关键：不能提前关标签页——一关浏览器就中断传输，文件永远落不了盘。
// 所以这里只轮询接口，确认 filemetas 能查到且大小对得上才退出。
const CHECK = `
import sys, json, os
sys.path.insert(0, 'scripts/netdisk')
import requests, browser_cookies as bc
HDR={'User-Agent':'netdisk;7.0.0;PC;PC-Windows;10.0.19045','Referer':'https://pan.baidu.com/disk/main'}
cli=bc.read_cookies(r'C:\\Users\\Administrator\\AppData\\Roaming\\baidunetdisk','')
h={**HDR,'Cookie':bc.cookie_header(bc.match(cli,'pan.baidu.com'))}
r=requests.get('https://pan.baidu.com/api/filemetas',
               params={'target':json.dumps([sys.argv[1]],ensure_ascii=False),'dlink':'1','web':'1'},
               headers=h,timeout=25).json()
info=[x for x in (r.get('info') or []) if x.get('path')]
print(json.dumps({'errno': r.get('errno'), 'hit': info[0] if info else None,
                  'want': int(sys.argv[2])}, ensure_ascii=False))
`;
const meta = (remote, size) => {
  try {
    const out = execFileSync(PY, ['-c', CHECK, remote, String(size)],
      { cwd: REPO, encoding: 'utf8', maxBuffer: 4e6, timeout: 40000 }).trim();
    return JSON.parse(out.split('\n').pop());
  } catch (e) {
    return { errno: 'ERR', hit: null, msg: String(e).slice(0, 80) };
  }
};

let allOk = true;
for (const f of FILES) {
  const remote = '/' + path.basename(f);
  const size = execFileSync(PY, ['-c', 'import os,sys;print(os.path.getsize(sys.argv[1]))', f],
    { encoding: 'utf8' }).trim();
  let ok = false;
  for (let i = 0; i < WAIT_MIN * 12; i++) {
    await sleep(5000);
    const m = meta(remote, size);
    if (m.hit && String(m.hit.size) === String(size)) {
      console.log(`  ✓ 已落盘 ${remote}  ${(m.hit.size / 1048576).toFixed(1)} MB  md5=${m.hit.md5}`);
      ok = true;
      break;
    }
    if (i % 3 === 0) {
      const t = await b.ev(`(() => ((document.body.innerText||'').match(/上传[^|]{0,30}/)||[''])[0])()`);
      console.log(`  … ${i * 5}s 待落盘（页面：${t || '无进度文案'}）`);
    }
  }
  if (!ok) {
    console.error(`  ✗ ${remote} 超时未落盘`);
    allOk = false;
  }
}

if (allOk) await b.close();
else { console.error('上传未完成，标签页保持打开以便重试'); process.exitCode = 1; }

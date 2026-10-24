// 网页版上传：客户端 API 的上传口是封的，但浏览器里的上传器能走通。
//
// 背景：百度 xpan precreate 要验证码（errno 9019），夸克直传域名 pds.quark.cn
// 在本机 DNS 根本不存在（NXDOMAIN）。两条 API 路都死了，于是换一条：
// 把客户端的 cookie 注入无头浏览器，让夸克网页版（pan.quark.cn）自己传。
// 实测 6 MB 的补丁包十几秒传完，之后就能正常建分享。
//
// 用法：
//   node scripts/netdisk/web_upload.mjs <文件绝对路径> [更多文件...]
//   QD_PORT=9228 node scripts/netdisk/web_upload.mjs D:/xx.zip
// 前提：需要一个 --remote-debugging-port 打开的 Edge/Chrome（端口用 QD_PORT 指定）。
// 传完只是把文件丢进 /夸克上传文件，要建分享接着跑 reshare.py index && reshare.py run。
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { connect } from '../../../cdp.mjs';

const HERE = import.meta.dirname;
const REPO = process.env.QD_REPO || path.resolve(HERE, '../..');
const PORT = Number(process.env.QD_PORT || 9228);
const PY = process.env.QD_PY || 'C:/Users/Administrator/AppData/Local/Programs/Python/Python310/python.exe';

const FILES = process.argv.slice(2).filter(a => !a.startsWith('--'));
if (!FILES.length) {
  console.error('用法：node scripts/netdisk/web_upload.mjs <文件> [文件...]');
  process.exit(1);
}

const code = `
import sys, json; sys.path.insert(0,'scripts/netdisk')
import reshare as R, browser_cookies as bc, os
for p in R.QUARK_PROFILES:
    if not os.path.isdir(p): continue
    ck = bc.read_cookies(p, '')
    d = [c for c in ck if c['host'].lstrip('.').endswith('quark.cn')]
    if any(c['name'] == '__puus' for c in d):
        print(json.dumps([{'name': c['name'], 'value': c['value']} for c in d], ensure_ascii=False)); break
`;
const cookies = JSON.parse(
  execFileSync(PY, ['-c', code], { cwd: REPO, encoding: 'utf8', maxBuffer: 40e6 }).trim().split('\n').pop());

const b = await connect(PORT);
await b.send('Network.enable');
for (const c of cookies) {
  for (const host of ['.quark.cn', 'pan.quark.cn']) {
    try {
      await b.send('Network.setCookie', { name: c.name, value: c.value, domain: host, path: '/', secure: true, sameSite: 'None' });
    } catch {}
  }
}
await b.goto('https://pan.quark.cn/list#/list/all', 6000);

const who = await b.ev(`(() => (document.body.innerText || '').slice(0, 24).replace(/\\n+/g, ' '))()`);
console.log('网盘：', who);

await b.send('DOM.enable');
const doc = await b.send('DOM.getDocument', { depth: -1, pierce: true });
const root = (doc.result || {}).root;
const q = await b.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: 'input[type=file]' });
const nodeIds = (q.result || {}).nodeIds || [];
if (!nodeIds.length) {
  console.error('没找到上传用的 file input（页面结构变了？）');
  await b.close();
  process.exit(1);
}

await b.send('DOM.setFileInputFiles', { files: FILES, nodeId: nodeIds[0] });
console.log('已提交', FILES.length, '个文件，上传中…');

// 上传进度在页面里，用文件名出现与否判断完成
const names = FILES.map(f => path.basename(f));
for (let i = 0; i < 60; i++) {
  await new Promise(r => setTimeout(r, 2500));
  const st = await b.ev(`(() => {
    const t = (document.body.innerText || '');
    return JSON.stringify(${JSON.stringify(names)}.filter(n => t.includes(n)));
  })()`);
  if (st === '[]') continue;
  console.log('  已出现在列表：', st);
  if (JSON.parse(st).length === names.length) break;
}
console.log('传完了。接着跑：python scripts/netdisk/reshare.py index && python scripts/netdisk/reshare.py plan');
await b.close();

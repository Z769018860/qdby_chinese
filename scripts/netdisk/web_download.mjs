// 网页版下载：把网盘里的文件取回本地（跨网盘搬运的前半段）
//
// 为什么非得借浏览器
// ------------------
// 夸克的直链 pds.quark.cn 是阿里云 OSS，挂了「回源回调校验登录态」：
// 同一个 download_url，requests 直连拿 403（require login [auth not found]），
// 但在 pan.quark.cn 页面里 fetch（带 credentials:'include'）就是 200。
// 所以这里沿用 web_upload.mjs 的思路：把客户端 cookie 注入无头浏览器，
// 让浏览器去取，再分块把字节搬回 Node 写成文件。
//
// 实测：26 MB 的补丁包 2.2 秒取完。
//
// 用法：
//   node scripts/netdisk/web_download.mjs --quark <fid> --out 本地文件.zip
//   node scripts/netdisk/web_download.mjs --url <下载直链> --out 本地文件.zip
// 前提：需要一个 --remote-debugging-port 打开的 Edge/Chrome（端口用 QD_PORT 指定）。
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { connect } from '../../../cdp.mjs';

const HERE = import.meta.dirname;
const REPO = process.env.QD_REPO || path.resolve(HERE, '../..');
const PORT = Number(process.env.QD_PORT || 9228);
const PY = process.env.QD_PY || 'C:/Users/Administrator/AppData/Local/Programs/Python/Python310/python.exe';

const argv = process.argv.slice(2);
const arg = (k, d = '') => {
  const i = argv.indexOf(k);
  return i >= 0 ? (argv[i + 1] || d) : d;
};
const OUT = arg('--out');
const FID = arg('--quark');
const URL_ = arg('--url');
const PLAT = arg('--plat', FID ? 'quark' : (URL_ ? 'raw' : ''));

if (!OUT || (!FID && !URL_)) {
  console.error('用法：node web_download.mjs --quark <fid> --out 文件 [--plat quark]');
  console.error('      node web_download.mjs --url <直链> --out 文件');
  process.exit(1);
}
fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });

// 1) 客户端 cookie（只有登录态能拿到下载直链）
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
let cookies = [];
try {
  cookies = JSON.parse(execFileSync(PY, ['-c', code], { cwd: REPO, encoding: 'utf8', maxBuffer: 40e6 })
    .trim().split('\n').pop());
} catch (e) {
  console.error('取夸克 cookie 失败：', String(e).slice(0, 120));
}

const b = await connect(PORT);
await b.send('Network.enable');
for (const c of cookies) {
  // 直链在 pds 子域，cookie 两个域都要种，否则回源校验不认
  for (const host of ['.quark.cn', '.pds.quark.cn']) {
    try {
      await b.send('Network.setCookie', {
        name: c.name, value: c.value, domain: host, path: '/', secure: true, sameSite: 'None',
      });
    } catch {}
  }
}
await b.goto('https://pan.quark.cn/list#/list/all', 4000);

// 2) 在页面里把文件整个读进内存（避开 CORS / 回源校验）
const total = await b.ev(`(async () => {
  let url = ${JSON.stringify(URL_ || '')};
  if (!url) {
    const jr = await fetch('https://drive-pc.quark.cn/1/clouddrive/file/download?pr=ucpro&fr=pc', {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fids: [${JSON.stringify(FID)}] }),
    });
    const j = await jr.json();
    url = j && j.data && j.data[0] && (j.data[0].download_url || j.data[0].downloadUrl) || '';
  }
  if (!url) return -1;
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) return -2;
  window.__u8 = new Uint8Array(await r.arrayBuffer());
  return window.__u8.length;
})()`, true);

if (!Number.isFinite(total) || total <= 0) {
  console.error(`下载失败（code=${total}）：-1 没拿到直链 / -2 直链被拒`);
  await b.close();
  process.exit(2);
}

// 3) 分块搬回来，避免一次性把几十 MB 塞进 CDP 单条消息
const t0 = Date.now();
const fd = fs.openSync(OUT, 'w');
let off = 0;
const CHUNK = 4 * 1024 * 1024;
while (off < total) {
  const n = Math.min(CHUNK, total - off);
  const b64 = await b.ev(`(() => {
    const u8 = window.__u8.subarray(${off}, ${off + n});
    let s = ''; const C = 0x8000;
    for (let i = 0; i < u8.length; i += C) s += String.fromCharCode.apply(null, u8.subarray(i, i + C));
    return btoa(s);
  })()`, false);
  fs.writeSync(fd, Buffer.from(b64, 'base64'));
  off += n;
}
fs.closeSync(fd);
const ms = Date.now() - t0;
console.log(`${path.basename(OUT)} ${fs.statSync(OUT).size} 字节，用时 ${(ms / 1000).toFixed(1)}s`);
await b.close();

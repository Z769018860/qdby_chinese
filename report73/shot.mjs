// Screenshot the 6 report spreads at 2000x3600 (1000x1800 CSS, dpr 2).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9351;
const REPORT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const DIR = path.join(REPORT, 'pages').replace(/\\/g, '/');
const OUT = path.join(REPORT, '..', 'exports/season73-report');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const profile = 'H:/Temp/edgeprof-r73-' + Date.now();
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--allow-file-access-from-files', '--hide-scrollbars', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, '--window-size=1000,1800', 'about:blank'], { stdio: 'ignore' });

async function getJson(p) {
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}${p}`); if (r.ok) return await r.json(); } catch {}
    await sleep(300);
  }
  throw new Error('devtools not reachable');
}
const ver = await getJson('/json/version');
const ws = new WebSocket(ver.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
await new Promise(r => ws.addEventListener('open', r));
const send = (method, params = {}, sessionId) => new Promise(res => {
  const mid = ++id; pending.set(mid, res);
  ws.send(JSON.stringify({ id: mid, method, params, ...(sessionId ? { sessionId } : {}) }));
});
const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);
await S('Page.enable'); await S('Runtime.enable');
await S('Emulation.setDeviceMetricsOverride', { width: 1000, height: 1800, deviceScaleFactor: 2, mobile: false });

for (let i = 1; i <= 7; i++) {
  await S('Page.navigate', { url: `file:///${DIR}/s${i}.html` });
  const ready = await S('Runtime.evaluate', { expression: `new Promise(r=>{const t0=Date.now();const check=()=>{const im=[...document.images];const ok=document.readyState==='complete'&&im.length>0&&im.every(i=>i.complete&&i.naturalWidth>0);if(ok)return r('ok:'+im.length);if(Date.now()-t0>15000)return r('timeout:'+im.filter(i=>!i.complete||!i.naturalWidth).length+'/'+im.length);setTimeout(check,100)};check()})`, awaitPromise: true, returnByValue: true });
  console.log('  ready', ready.result?.result?.value);
  await sleep(600);
  const r = await S('Runtime.evaluate', {
    expression: `(()=>{const b=document.body;return JSON.stringify({h:b.scrollHeight,w:b.scrollWidth,overflowY:b.scrollHeight>1800})})()`,
    returnByValue: true,
  });
  const info = JSON.parse(r.result.result.value || '{}');
  const shot = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(`${OUT}/融灾第73期特刊-第${i}版.png`, Buffer.from(shot.result.data, 'base64'));
  console.log(`page ${i}`, info.overflowY ? 'OVERFLOW ' + info.h : 'ok', info);
}
ws.close(); proc.kill();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}

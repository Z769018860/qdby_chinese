// Report the flow-content bottom of each generated spread (1000x1800 CSS), so leftover
// whitespace is a number instead of a guess.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9361;
const REPORT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const DIR = path.join(REPORT, 'pages').replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const profile = 'H:/Temp/edgeprof-m73-' + Date.now();
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
await S('Emulation.setDeviceMetricsOverride', { width: 1000, height: 1800, deviceScaleFactor: 1, mobile: false });

const only = process.argv[2];
for (let i = 1; i <= 7; i++) {
  const f = `${DIR}/s${i}.html`;
  if (!fs.existsSync(f)) continue;
  if (only && String(i) !== only) continue;
  await S('Page.navigate', { url: `file:///${f}` });
  await S('Runtime.evaluate', { expression: `new Promise(r=>{const t0=Date.now();const c=()=>{const im=[...document.images];if(document.readyState==='complete'&&im.every(i=>i.complete)||Date.now()-t0>8000)return r(1);setTimeout(c,60)};c()})`, awaitPromise: true, returnByValue: true });
  await sleep(250);
  const r = await S('Runtime.evaluate', {
    expression: `(()=>{
      const kids=[...document.querySelector('.page').children].filter(e=>!e.classList.contains('foot'));
      const bottoms=kids.map(e=>({tag:e.className||e.tagName, b:Math.round(e.getBoundingClientRect().bottom)}));
      const flow=Math.max(...bottoms.map(x=>x.b));
      return JSON.stringify({flow, gap: 1800-20-flow, over: flow>1800, blocks:bottoms.slice(-4)});
    })()`, returnByValue: true,
  });
  console.log(`s${i}`, r.result.result.value);
}
ws.close(); proc.kill();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}

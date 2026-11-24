// Screenshot one element (zoomed) from a generated page: node crop.mjs <page> <selector> <scale> <out>
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9381; const sleep = ms => new Promise(r => setTimeout(r, ms));
const [pg = '1', sel = '.page', scaleArg = '2', out = 'H:/work/tmp/crop.png'] = process.argv.slice(2);
const profile = 'H:/Temp/edgeprof-crop-' + Date.now();
const p = spawn(EDGE, ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--hide-scrollbars',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
async function gj(x) { for (let i = 0; i < 80; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}${x}`); if (r.ok) return r.json(); } catch { } await sleep(300); } throw new Error('no devtools'); }
const v = await gj('/json/version');
const ws = new WebSocket(v.webSocketDebuggerUrl); let id = 0; const pend = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
await new Promise(r => ws.addEventListener('open', r));
const send = (me, pa, sid) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: me, params: pa, ...(sid ? { sessionId: sid } : {}) })); });
const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
const S = (m, pp) => send(m, pp, sessionId);
await S('Page.enable'); await S('Runtime.enable');
await S('Emulation.setDeviceMetricsOverride', { width: 1000, height: 1800, deviceScaleFactor: 2, mobile: false });
await S('Page.navigate', { url: 'file:///' + path.join(HERE, 'pages', `s${pg}.html`).replace(/\\/g, '/') });
await sleep(2200);
const [selQ, idxQ] = sel.split('@@');
const box = await S('Runtime.evaluate', {
  expression: `(()=>{const el=document.querySelectorAll(${JSON.stringify(selQ)})[${Number(idxQ) || 0}];if(!el)return 'none';const r=el.getBoundingClientRect();return JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height})})()`,
  returnByValue: true
});
const raw = box.result.result.value;
if (raw === 'none') { console.log('selector not found'); ws.close(); p.kill(); process.exit(1); }
const b = JSON.parse(raw);
const pad = 6;
const shot = await S('Page.captureScreenshot', {
  format: 'png',
  clip: { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.w + pad * 2, height: b.h + pad * 2, scale: Number(scaleArg) }
});
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log('saved', out, b.w.toFixed(0) + 'x' + b.h.toFixed(0));
ws.close(); p.kill();

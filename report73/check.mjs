// Check every generated page for content overlapping the footer, and report the real gap.
// node check.mjs
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9401; const sleep = ms => new Promise(r => setTimeout(r, ms));
const profile = 'H:/Temp/edgeprof-check-' + Date.now();
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
await S('Emulation.setDeviceMetricsOverride', { width: 1000, height: 1800, deviceScaleFactor: 1, mobile: false });
for (const n of [1, 2, 3, 4, 5, 6]) {
  await S('Page.navigate', { url: 'file:///' + path.join(HERE, 'pages', `s${n}.html`).replace(/\\/g, '/') });
  await sleep(1400);
  const r = await S('Runtime.evaluate', {
    expression: `(()=>{
      const foot=document.querySelector('.foot');const ft=foot?foot.getBoundingClientRect().top:1800;
      const page=document.querySelector('.page');
      let worst=0,worstTag='';
      page.querySelectorAll('*').forEach(el=>{
        if(el===foot||el.classList.contains('foot')||foot&&foot.contains(el))return;
        const b=el.getBoundingClientRect();
        if(b.height===0)return;
        if(b.bottom>worst){worst=b.bottom;worstTag=(el.className||el.tagName)+''}
      });
      const cs=[...page.children].filter(e=>e!==foot).map(e=>e.getBoundingClientRect().bottom);
      const flow=Math.max(...cs,0);
      return JSON.stringify({footTop:Math.round(ft),flowBottom:Math.round(flow),deepBottom:Math.round(worst),deepTag:worstTag.slice(0,28),overlap:Math.round(worst-ft),docH:document.documentElement.scrollHeight});
    })()`,
    returnByValue: true
  });
  console.log('s' + n, r.result.result.value);
}
ws.close(); p.kill();

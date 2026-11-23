import { spawn } from 'node:child_process';
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT=9361; const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const profile='H:/Temp/edgeprof-probe-'+Date.now();
const p=spawn(EDGE,['--headless=new','--disable-gpu','--allow-file-access-from-files',`--remote-debugging-port=${PORT}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
async function gj(x){for(let i=0;i<60;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}${x}`);if(r.ok)return r.json()}catch{}await sleep(300)}throw new Error('no devtools')}
const v=await gj('/json/version');
const ws=new WebSocket(v.webSocketDebuggerUrl); let id=0; const pend=new Map();
ws.addEventListener('message',e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id)}});
await new Promise(r=>ws.addEventListener('open',r));
const send=(me,pa,sid)=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method:me,params:pa,...(sid?{sessionId:sid}:{})}))});
const {result:{targetId}}=await send('Target.createTarget',{url:'about:blank'});
const {result:{sessionId}}=await send('Target.attachToTarget',{targetId,flatten:true});
const S=(m,pp)=>send(m,pp,sessionId);
await S('Page.enable');await S('Runtime.enable');
await S('Page.navigate',{url:'file:///H:/work/tmp/s73/report73/pages/s2.html'});
await sleep(2500);
const r=await S('Runtime.evaluate',{expression:`(()=>{const im=[...document.images];return JSON.stringify({n:im.length,ok:im.filter(i=>i.naturalWidth>0).length,first:im.slice(0,3).map(i=>[i.src.slice(-40),i.naturalWidth,i.complete])})})()`,returnByValue:true});
console.log(r.result.result.value);
ws.close();p.kill();try{require('fs').rmSync(profile,{recursive:true,force:true})}catch{}

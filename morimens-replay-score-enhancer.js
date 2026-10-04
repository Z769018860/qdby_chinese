// Replay Review: MVP image download button (the scoring models live in morimens-replay-scoring.js and are applied natively).
(()=>{
'use strict';
if(window.__morimensReplayScoreEnhancerV32)return;
window.__morimensReplayScoreEnhancerV32=true;

const en=()=>localStorage.getItem('morimens.language')==='en';
const ui=(zh,enText)=>en()?enText:zh;
const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number(v)||0));
const sat=(v,s)=>100*(1-Math.exp(-Math.max(0,Number(v)||0)/Math.max(.0001,s)));
const clean=v=>String(v??'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const grade=s=>s>=80?'S':s>=65?'A':s>=50?'B':s>=35?'C':'D';
const num=v=>Number(v)||0;
let busy=false,last='';

function css(){
  if(document.getElementById('mrReplayScoreEnhancerStyle'))return;
  const s=document.createElement('style');
  s.id='mrReplayScoreEnhancerStyle';
  s.textContent=`
    .mr2mvpactions{margin-left:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .mr2mvpactions button{border:1px solid rgba(213,177,118,.38);border-radius:8px;background:rgba(213,177,118,.12);color:#f0d5a5;padding:6px 10px;cursor:pointer;font:700 11px/1.2 inherit}
    .mr2mvpactions small{color:#7f8da1;font-size:9px}.mr2mvptitle{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .mr2enhscore{margin-top:8px;padding:8px 10px;border:1px solid rgba(213,177,118,.22);border-radius:8px;background:rgba(213,177,118,.055);font-size:10px;line-height:1.65;color:#aeb9c8}
    .mr2enhscore b{color:#ead5ab}.mr2enhchips{display:flex;flex-wrap:wrap;gap:5px;margin-top:5px}.mr2enhchips i{font-style:normal;padding:1px 6px;border-radius:999px;background:rgba(79,208,200,.08);border:1px solid rgba(79,208,200,.18);color:#9edbd6}
    .mr2enhchips i.strong{background:rgba(213,177,118,.1);border-color:rgba(213,177,118,.28);color:#f0d29f}.mr2enhbadge{display:inline-flex;margin-left:5px;padding:0 5px;border-radius:999px;border:1px solid rgba(79,208,200,.25);color:#86d5cf;font-size:8px}
    .mr2enhmeta{margin-top:4px;color:#7f8da1}.mr2enhmeta strong{color:#b9c6d8}
    @media(max-width:720px){.mr2mvpactions{width:100%;margin-left:0}.mr2mvpactions small{flex:1 1 100%}}
  `;
  document.head.appendChild(s);
}

function setGrade(el,g){
  if(!el)return;
  el.className=el.className.replace(/\bg[ABCDE]\b/g,'').trim()+` g${g}`;
  el.textContent=g;
}
function setDim(span,value){
  if(!span)return;
  const b=span.querySelector('b');
  if(value==null){span.classList.add('na');if(b)b.textContent='—';return}
  span.classList.remove('na');if(b)b.textContent=Math.round(value);
}
function addBadge(row,text){
  const name=row?.querySelector('.mr2rn b');if(!name)return;
  let badge=row.querySelector('.mr2enhbadge');
  if(!badge){badge=document.createElement('span');badge.className='mr2enhbadge';name.after(badge)}
  badge.textContent=text;
}
// ---------- MVP image ---------------------------------------------------------------------
const img=src=>new Promise(ok=>{if(!src)return ok(null);const i=new Image;i.crossOrigin='anonymous';i.onload=()=>ok(i);i.onerror=()=>ok(null);i.src=src});
function rr(c,x,y,w,h,r){c.beginPath();c.roundRect?c.roundRect(x,y,w,h,r):c.rect(x,y,w,h)}
async function download(root){
  const cards=[...root.querySelectorAll('.mr2mvpgrid>.mr2mvp')].slice(0,6).map(t=>{const n=t.querySelector('.mr2mvpmain b')?.cloneNode(true);n?.querySelector('.mr2grade')?.remove();return {tag:clean(t.querySelector('.mr2mvptag')?.textContent),name:clean(n?.textContent),score:(clean(t.querySelector('.mr2mvpmain span')?.textContent).match(/\d+(?:\.\d+)?/)||[])[0]||'—',g:clean(t.querySelector('.mr2grade')?.textContent),src:t.querySelector('.mr2mvpmain img')?.src||''}});if(!cards.length)return;
  const C=document.createElement('canvas');C.width=1200;C.height=760;const c=C.getContext('2d'),bg=c.createLinearGradient(0,0,1200,760);bg.addColorStop(0,'#0b111b');bg.addColorStop(.55,'#111827');bg.addColorStop(1,'#241b20');c.fillStyle=bg;c.fillRect(0,0,1200,760);c.fillStyle='#f3e5c8';c.font='800 34px system-ui,"Microsoft YaHei"';c.fillText(ui('忘忘看报 · 战斗回放 MVP','Morimens Weekly · Replay MVP'),54,64);c.fillStyle='#91a0b5';c.font='15px system-ui,"Microsoft YaHei"';c.fillText([clean(root.querySelector('.mr2btitle b')?.textContent),clean(root.querySelector('.mr2btitle small')?.textContent)].filter(Boolean).join(' · ').slice(0,105),54,94);const ims=await Promise.all(cards.map(q=>img(q.src)));
  cards.forEach((q,i)=>{const x=54+(i%3)*372,y=132+Math.floor(i/3)*254;rr(c,x,y,348,230,18);c.fillStyle='rgba(255,255,255,.045)';c.fill();c.strokeStyle=i===0?'rgba(213,177,118,.48)':'rgba(148,163,184,.18)';c.stroke();c.fillStyle='#d9bd89';c.font='700 13px system-ui,"Microsoft YaHei"';c.fillText(q.tag,x+18,y+28);if(ims[i])c.drawImage(ims[i],x+18,y+48,76,76);c.fillStyle='#eef2f7';c.font='800 21px system-ui,"Microsoft YaHei"';c.fillText(q.name.length>16?q.name.slice(0,15)+'…':q.name,x+110,y+76);c.fillStyle='#8fd8d1';c.font='800 30px system-ui';c.fillText(q.score,x+110,y+113);c.fillStyle='#8290a3';c.font='12px system-ui,"Microsoft YaHei"';c.fillText(ui('综合评分 / 100','Composite / 100'),x+110,y+132);c.fillStyle='#ead5ab';c.font='900 32px system-ui';c.fillText(q.g,x+18,y+181)});
  c.fillStyle='#8d99aa';c.font='13px system-ui,"Microsoft YaHei"';c.fillText(ui('仅供娱乐，有很多数据难以计入','For entertainment only; many effects cannot be fully quantified.'),54,718);c.textAlign='right';c.fillStyle='#657286';c.font='12px system-ui';c.fillText('© 青灯不弈 · 忘忘看报',1146,718);C.toBlob(b=>{if(!b)return;const u=URL.createObjectURL(b),a=document.createElement('a'),id=clean(root.querySelector('.mr2bmeta .id b')?.textContent).slice(0,8)||'replay';a.href=u;a.download=`忘忘看报-MVP-${id}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)},'image/png');
}
function button(root){
  const t=root.querySelector('.mr2mvptitle');if(!t||t.querySelector('#mr2DownloadMvp'))return;const w=document.createElement('div');w.className='mr2mvpactions';const b=document.createElement('button');b.id='mr2DownloadMvp';b.type='button';b.textContent=ui('下载 MVP 图片','Download MVP image');const s=document.createElement('small');s.textContent=ui('仅供娱乐，有很多数据难以计入','For entertainment only; many effects cannot be fully quantified.');w.append(b,s);t.append(w);b.onclick=()=>download(root);
}

function run(){const root=document.getElementById('mrReplayResult');if(root&&root.querySelector('.mr2mvps'))button(root)}
function watch(){
  css();let inner;const attach=()=>{const r=document.getElementById('mrReplayResult');if(!r||inner)return false;inner=new MutationObserver(()=>queueMicrotask(run));inner.observe(r,{subtree:true,childList:true});run();return true};if(!attach()){const outer=new MutationObserver(()=>{if(attach())outer.disconnect()});outer.observe(document.documentElement,{subtree:true,childList:true})}window.addEventListener('morimens-language-change',()=>{last='';setTimeout(run,0)});
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',watch,{once:true}):watch();
})();
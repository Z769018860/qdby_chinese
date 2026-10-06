(()=>{
'use strict';if(window.__morimensReplayExportV2)return;window.__morimensReplayExportV2=true;
const en=()=>localStorage.getItem('morimens.language')==='en',ui=(z,e)=>en()?e:z,clean=v=>String(v??'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(),clamp=v=>Math.max(0,Math.min(100,Number(v)||0));
let cache={uuid:'',full:null,tl:null,player:''};
function playerName(full,tl){
 const actors=new Set([...(tl?.actors?.values?.()||[])].map(a=>clean(a.name)).filter(Boolean)),out=[],exact=/^(?:playerName|nickname|nickName|userName|keeperName|displayName|accountName|roleName)$/i,rel=/(?:player|keeper|account|user|role).*(?:name|nick)|(?:name|nick).*(?:player|keeper|account|user|role)/i;
 const good=v=>{v=clean(v);return v.length>=2&&v.length<=36&&!/^\d+$/.test(v)&&!/^[0-9a-f-]{24,}$/i.test(v)&&!actors.has(v)&&!/^(?:keeper|守密人|unknown|未知)$/i.test(v)};
 const scan=(o,path='',d=0,seen=new WeakSet())=>{if(!o||typeof o!=='object'||d>5||seen.has(o))return;seen.add(o);for(const [k,v] of Object.entries(o)){const p=path?path+'.'+k:k;if(typeof v==='string'&&(exact.test(k)||rel.test(k))&&good(v)){let s=exact.test(k)?8:5;if(/player|user|account/i.test(k))s+=3;if(/battleDat|player|user|account|keeper/i.test(p))s+=2;out.push({v:clean(v),s,p})}else if(v&&typeof v==='object')scan(v,p,d+1,seen)}};
 scan(full?.battleDat,'battleDat');let n=0;for(const seg of full?.recordSegments||[]){if(!Array.isArray(seg))continue;for(const r of seg){scan(r,'record');if(++n>300)break}if(n>300)break}out.sort((a,b)=>b.s-a.s||a.p.length-b.p.length);return out[0]?.v||'';
}
function keepGrade(el,name){if(!el||!name||el.dataset.keeperName===name)return;const g=el.querySelector('.mr2grade');el.textContent=name+' ';if(g)el.append(g);el.dataset.keeperName=name} // guarded: rewriting the text re-triggers this module's own MutationObserver
function keeperRow(root){const rows=[...root.querySelectorAll('.mr2rating details.mr2rrowd')];return rows.find(r=>r.querySelector('.mr2ico.av.keeper'))||rows.find(r=>/决策模型|decision model/i.test(clean(r.querySelector('.mr2enhbadge')?.textContent)))||rows.find(r=>/守密人|Keeper/i.test(clean(r.querySelector('.mr2rn b')?.textContent)))}
function patchPlayer(root,name){if(!name)return;keepGrade(root.querySelector('.mr2mvp.kp .mr2mvpmain b'),name);keepGrade(keeperRow(root)?.querySelector('.mr2rn b'),name);root.dataset.keeperPlayerName=name;window.MorimensReplayPlayerName=name}
const img=src=>new Promise(ok=>{if(!src)return ok(null);const i=new Image;i.crossOrigin='anonymous';i.onload=()=>ok(i);i.onerror=()=>ok(null);i.src=src}),rr=(c,x,y,w,h,r)=>{c.beginPath();c.roundRect?c.roundRect(x,y,w,h,r):c.rect(x,y,w,h)},ell=(c,s,w)=>{s=String(s||'');if(c.measureText(s).width<=w)return s;while(s.length>1&&c.measureText(s+'…').width>w)s=s.slice(0,-1);return s+'…'},txt=(c,s,x,y,w,font,color)=>{c.font=font;c.fillStyle=color;c.fillText(ell(c,s,w),x,y)};
function cards(root){const tiles=[...root.querySelectorAll('.mr2mvpgrid>.mr2mvp')],order=['aw','wh','rel','kp','cov'];return order.map(k=>tiles.find(t=>t.classList.contains(k))).filter(Boolean).map(t=>{const n=t.querySelector('.mr2mvpmain b')?.cloneNode(true);n?.querySelector('.mr2grade')?.remove();return {tag:clean(t.querySelector('.mr2mvptag')?.textContent),name:clean(n?.textContent),grade:clean(t.querySelector('.mr2grade')?.textContent),score:(clean(t.querySelector('.mr2mvpmain span')?.textContent).match(/\d+(?:\.\d+)?/)||[])[0]||'—',icon:t.querySelector('.mr2mvpmain img')?.src||'',detail:clean(t.querySelector('.mr2mvpmain small')?.textContent).split(/\s*[·|]\s*/).filter(Boolean).slice(0,4),kv:[...t.querySelectorAll('.mr2mvpkv>span')].map(x=>clean(x.textContent)).slice(0,3),subs:[...t.querySelectorAll('.mr2mvpsub>span')].map(x=>clean(x.textContent)).slice(0,2)}})}
function ratings(root){const s=[...root.querySelectorAll('.mr2rating')].find(x=>/唤醒体综合评分|Awakener ratings/i.test(clean(x.querySelector(':scope>h5')?.textContent)));return s?[...s.querySelectorAll(':scope>details.mr2rrowd')].map(r=>{const n=r.querySelector('.mr2rn b')?.cloneNode(true);n?.querySelector('.mr2grade')?.remove();return {name:clean(n?.textContent),grade:clean(r.querySelector('.mr2grade')?.textContent),score:clean(r.querySelector('.mr2rscore b')?.textContent),dims:[...r.querySelectorAll('.mr2rdims>span')].map(d=>[clean(d.querySelector('small')?.textContent),clean(d.querySelector('b')?.textContent)])}}):[]}
const imgLoad=src=>new Promise(ok=>{if(!src)return ok(null);const i=new Image;i.crossOrigin='anonymous';i.onload=()=>ok(i);i.onerror=()=>ok(null);i.src=src});
function rrect(c,x,y,w,h,r){c.beginPath();c.roundRect?c.roundRect(x,y,w,h,r):c.rect(x,y,w,h)}
async function download(root){
  const X=window.__mr2MvpExport;if(!X)return;
  const F='system-ui,"Microsoft YaHei",sans-serif',W=1200,M=40;
  const fmtN=v=>{v=Number(v)||0;return Math.abs(v)>=1e8?(v/1e8).toFixed(2)+'亿':Math.abs(v)>=1e4?(v/1e4).toFixed(1)+'万':String(Math.round(v))};
  const sc=v=>v==null||!Number.isFinite(Number(v))?'—':String(Math.round(Number(v)));
  const gcol=g=>({S:'#f3d28a',A:'#7ee0a8',B:'#6cc4e8',C:'#c8a86a',D:'#d98b8b'})[g]||'#aab4c4';
  const verdict=clean(root.querySelector('.mr2verdict')?.textContent),win=!!root.querySelector('.mr2binfo.win'),lose=!!root.querySelector('.mr2binfo.lose');
  const stage=clean(root.querySelector('.mr2btitle b')?.textContent),sub=clean(root.querySelector('.mr2btitle small')?.textContent);
  const meta=[...root.querySelectorAll('.mr2bmeta span:not(.id)')].map(e=>[clean(e.querySelector('small')?.textContent),clean(e.querySelector('b')?.textContent)]);
  const uuid=clean(root.querySelector('.mr2bmeta .id b')?.textContent);
  const team=[...root.querySelectorAll('.mr2bteam .mr2bm')].map(e=>({src:e.querySelector('img')?.src||'',name:clean(e.querySelector('b')?.textContent),lines:[...e.querySelectorAll(':scope > div > small')].map(x=>clean(x.textContent))}));
  const norm=u=>u&&!/^(https?:|data:|blob:)/.test(u)?new URL(u,location.href).href:u;
  const urls=[...team.map(t=>t.src),...X.aw.map(a=>a.icon),...X.wheels.map(a=>a.icon),...X.relics.map(a=>a.icon),...X.covs.map(a=>a.icon)];
  const imgs=new Map();await Promise.all([...new Set(urls.filter(Boolean))].map(async u=>imgs.set(u,await imgLoad(norm(u)))));
  const gi=u=>imgs.get(u)||imgs.get(norm(u))||null;
  const hHead=124,hTeam=team.length?118:0,awN=Math.min(X.aw.length,5),hMid=Math.max(350,50+awN*66+10),hGear=170,hFoot=50;
  const H=hHead+hTeam+hMid+hGear+hFoot;
  const C=document.createElement('canvas');C.width=W*2;C.height=H*2;const c=C.getContext('2d');c.scale(2,2);
  const bg=c.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#0a1019');bg.addColorStop(.6,'#101826');bg.addColorStop(1,'#20181e');c.fillStyle=bg;c.fillRect(0,0,W,H);
  const fit=(t,font,max)=>{c.font=font;t=String(t);if(c.measureText(t).width<=max)return t;while(t.length>1&&c.measureText(t+'…').width>max)t=t.slice(0,-1);return t+'…'};
  const T=(t,x,y,font,col,al='left')=>{c.font=font;c.fillStyle=col;c.textAlign=al;c.fillText(String(t),x,y)};
  const box=(x,y,w,h,st)=>{rrect(c,x,y,w,h,12);c.fillStyle=st?'rgba(213,177,118,.07)':'rgba(255,255,255,.04)';c.fill();c.strokeStyle=st?'rgba(213,177,118,.42)':'rgba(148,163,184,.16)';c.lineWidth=1;c.stroke()};
  const icon=(im,x,y,s,r)=>{c.save();rrect(c,x,y,s,s,r);c.clip();if(im)c.drawImage(im,x,y,s,s);else{c.fillStyle='rgba(255,255,255,.08)';c.fillRect(x,y,s,s)}c.restore()};
  const chip=(t,x,y,col)=>{c.font='700 12px '+F;const w=c.measureText(t).width+14;rrect(c,x,y,w,22,11);c.fillStyle='rgba(255,255,255,.06)';c.fill();c.strokeStyle=col||'rgba(148,163,184,.25)';c.stroke();c.textAlign='left';c.fillStyle=col||'#b9c6d8';c.fillText(t,x+7,y+15);return w+6};
  const bar=(x,y,w,v,col)=>{rrect(c,x,y,w,6,3);c.fillStyle='rgba(255,255,255,.08)';c.fill();if(v>0){rrect(c,x,y,Math.max(6,w*Math.min(100,v)/100),6,3);c.fillStyle=col;c.fill()}};
  // header
  T(ui('忘忘看报 · 战斗回放复盘','Morimens Weekly · Replay Review'),M,40,'800 26px '+F,'#f3e5c8');
  const vc=win?'#7ee0a8':lose?'#e08a8a':'#c8a86a';rrect(c,W-M-110,18,110,34,17);c.fillStyle=vc+'22';c.fill();c.strokeStyle=vc;c.stroke();T(verdict,W-M-55,41,'800 17px '+F,vc,'center');
  T(fit(stage,'700 18px '+F,W-2*M),M,74,'700 18px '+F,'#e8edf5');
  T(fit(sub,'13px '+F,W-2*M),M,98,'13px '+F,'#91a0b5');
  let mx=M;meta.forEach(([l,v])=>{if(v)mx+=chip(`${l} ${v}`,mx,106,'#9edbd6')});
  let y=hHead+4;
  // team
  if(team.length){const cw=(W-2*M-(team.length-1)*8)/team.length;team.forEach((t,i)=>{const x=M+i*(cw+8);box(x,y,cw,106);icon(gi(t.src),x+8,y+8,44,8);T(fit(t.name,'800 14px '+F,cw-68),x+60,y+26,'800 14px '+F,'#eef2f7');T(fit(t.lines[0]||'','11px '+F,cw-68),x+60,y+44,'11px '+F,'#9aa8bb');t.lines.slice(1,3).forEach((l,k)=>T(fit(l,'11px '+F,cw-16),x+8,y+72+k*15,'11px '+F,k?'#c9a96e':'#8fd8d1'))});y+=hTeam}
  // keeper
  const kw=420;
  if(X.keeper){const k=X.keeper;box(M,y,kw,hMid-10,true);T(ui('守密人评分','Keeper rating'),M+16,y+26,'700 13px '+F,'#d9bd89');T(fit(k.name,'800 20px '+F,kw-150),M+16,y+54,'800 20px '+F,'#eef2f7');
    T(Number(k.score).toFixed(1),M+kw-16,y+56,'900 36px '+F,'#8fd8d1','right');T(k.grade,M+kw-16,y+26,'900 20px '+F,gcol(k.grade),'right');
    const cx=M+kw/2,cy=y+142,R=62,n=k.dims.length||6,pt=(i,r)=>{const a=-Math.PI/2+i*2*Math.PI/n;return[cx+Math.cos(a)*r,cy+Math.sin(a)*r]};
    [.25,.5,.75,1].forEach(f=>{c.beginPath();for(let i=0;i<n;i++){const[px,py]=pt(i,R*f);i?c.lineTo(px,py):c.moveTo(px,py)}c.closePath();c.strokeStyle=f===1?'#3a4658':'rgba(58,70,88,.6)';c.setLineDash(f===1?[]:[2,3]);c.stroke();c.setLineDash([])});
    k.dims.forEach((d,i)=>{const[px,py]=pt(i,R);c.beginPath();c.moveTo(cx,cy);c.lineTo(px,py);c.strokeStyle='rgba(58,70,88,.8)';c.stroke()});
    const rv=d=>R*Math.max(.04,Math.min(100,Number(d[1])||0)/100);
    c.beginPath();k.dims.forEach((d,i)=>{const[px,py]=pt(i,rv(d));i?c.lineTo(px,py):c.moveTo(px,py)});c.closePath();c.fillStyle='rgba(213,177,118,.25)';c.fill();c.strokeStyle='#d5b176';c.lineWidth=2;c.stroke();c.lineWidth=1;
    k.dims.forEach((d,i)=>{const[px,py]=pt(i,rv(d));c.beginPath();c.arc(px,py,3,0,7);c.fillStyle='#f1d69f';c.fill();const[lx,ly]=pt(i,R+24);T(d[0],lx,ly-2,'12px '+F,'#aab6c6','center');T(sc(d[1]),lx,ly+13,'800 13px '+F,'#f1d69f','center')});
    const f=k.facts||{};let fy=y+hMid-10-76;
    const bits=[[ui('潜力实现','Potential'),k.potential==null?'—':Math.round(k.potential)+'%'],[ui('关键窗口','Windows'),k.windows==null?'—':Math.round(k.windows)+'%'],[ui('可信度','Confidence'),k.conf==null?'—':Math.round(k.conf*100)+'%']];
    let bx=M+16;bits.forEach(([l,v])=>{bx+=chip(`${l} ${v}`,bx,fy-4,'#9edbd6')});if(k.conf!=null&&k.conf<.6)T(ui('仅供参考','Indicative only'),M+kw-16,fy+30,'12px '+F,'#d98b8b','right');
    const fl=[];if(f.energySpent!=null)fl.push(`${ui('费用使用','Energy used')} ${fmtN(f.energySpent)}${f.energyOverflow?` · ${ui('溢出','overflow')} ${fmtN(f.energyOverflow)}`:''}`);if(f.rounds!=null)fl.push(`${ui('回合','Rounds')} ${f.rounds}${f.topPct!=null?` · ${ui('同关前','top')} ${Math.round(f.topPct)}%`:''}`);if(f.regretPct!=null)fl.push(`${ui('出牌遗憾','Regret')} ${Math.round(f.regretPct)}%`);if(f.deathResist!=null)fl.push(`${ui('死亡抵抗','Death resist')} ${f.deathResist}`);if(f.vulnCoveragePct!=null)fl.push(`${ui('易伤覆盖','Vuln. cover')} ${Math.round(f.vulnCoveragePct)}%`);
    T(fit(fl.slice(0,3).join('  ·  '),'11px '+F,kw-32),M+16,fy+34,'11px '+F,'#8b9aae');T(fit(fl.slice(3).join('  ·  '),'11px '+F,kw-32),M+16,fy+50,'11px '+F,'#8b9aae');if(k.luck)T(`🍀 ${ui('幸运','Luck')} ${Math.round(k.luck.score)}${k.luck.unlucky>0?` · 💧 ${ui('不幸','Unlucky')} ${Math.round(k.luck.unlucky)}`:''} · ${k.luck.label}（${ui('彩蛋，不计入评分','easter egg, not scored')}）`,M+16,y+hMid-22,'700 12px '+F,'#7ee0a8')}
  // awakeners
  const ax=M+kw+12,aw=W-M-ax;box(ax,y,aw,hMid-10);T(ui('唤醒体评分','Awakener ratings'),ax+16,y+26,'700 13px '+F,'#d9bd89');T(ui(`队伍总伤害 ${fmtN(X.total)}`,`Team damage ${fmtN(X.total)}`),ax+aw-16,y+26,'12px '+F,'#8b9aae','right');
  X.aw.slice(0,5).forEach((a,i)=>{const ry=y+40+i*66;if(i){c.fillStyle='rgba(148,163,184,.1)';c.fillRect(ax+14,ry-3,aw-28,1)}icon(gi(a.icon),ax+14,ry+4,50,9);const nf='800 16px '+F,nm=fit(a.name,nf,130);T(nm,ax+74,ry+24,nf,i?'#e8edf5':'#f3e5c8');c.font=nf;T(a.grade,ax+74+c.measureText(nm).width+10,ry+24,'900 15px '+F,gcol(a.grade));
    T(a.score.toFixed(1),ax+236,ry+27,'900 22px '+F,'#8fd8d1','right');bar(ax+74,ry+36,162,a.score,gcol(a.grade));
    T(fit(a.dims.map(d=>`${d[0]} ${Math.round(d[1])}`).join(' · '),'11px '+F,170),ax+74,ry+54,'11px '+F,'#8b9aae');
    const rx=ax+262;T(ui('伤害','DMG'),rx,ry+18,'11px '+F,'#7f8da1');T(`${fmtN(a.dmg)}  ${a.pct}%`,rx,ry+38,'800 15px '+F,'#f0d29f');bar(rx,ry+46,150,a.pct,'#d5b176');
    const sx=rx+180;T(ui('护盾 / 治疗','Shield / Heal'),sx,ry+18,'11px '+F,'#7f8da1');T(`${fmtN(a.block)} / ${fmtN(a.heal)}`,sx,ry+38,'800 15px '+F,'#9edbd6');T(`${ui('出牌','Cards')} ${a.plays}`,sx,ry+58,'11px '+F,'#8b9aae')});
  y+=hMid;
  // gear
  const tr=ui('触发','triggers'),es=ui('估算','est.');
  const cols=[[ui('命轮 MVP','Wheels'),X.wheels,w=>`${tr} ${w.n}${w.val>0?` · ${es} ${fmtN(w.val)}`:''}`],[ui('造物 MVP','Relics'),X.relics,w=>`${w.start?ui('开局','Start'):ui('获得','Gained')} · ${tr} ${w.n}${w.val>0?` · ${es} ${fmtN(w.val)}`:''}`],[ui('密契 MVP','Covenants'),X.covs,w=>`${tr} ${w.n}${w.val>0?` · ${es} ${fmtN(w.val)}`:''}`]];
  const cw3=(W-2*M-24)/3;
  cols.forEach(([title,list,line],ci)=>{const x=M+ci*(cw3+12);box(x,y,cw3,hGear-10);T(title,x+14,y+24,'700 13px '+F,'#d9bd89');if(!list.length)T('—',x+14,y+60,'14px '+F,'#657286');
    list.slice(0,3).forEach((g,i)=>{const ry=y+34+i*42;icon(gi(g.icon),x+14,ry,34,7);T(fit(g.name,'700 13px '+F,cw3-130),x+56,ry+14,'700 13px '+F,'#e8edf5');T(fit(line(g)+(g.dims.length?' · '+g.dims.map(d=>`${d[0]}${Math.round(d[1])}`).join(' '):''),'10px '+F,cw3-150),x+56,ry+29,'10px '+F,'#8b9aae');T(g.score.toFixed(1),x+cw3-48,ry+22,'900 17px '+F,'#8fd8d1','right');T(g.grade,x+cw3-16,ry+22,'900 15px '+F,gcol(g.grade),'right')})});
  y+=hGear;
  T(ui('仅供娱乐，有很多数据难以计入；评分基于可控决策与回放数据估算','For entertainment only; scores estimate controllable decisions from replay data.'),M,y+16,'12px '+F,'#8d99aa');
  T(uuid.slice(0,36),M,y+34,'10px '+F,'#566377');T('© 青灯不弈 · 忘忘看报',W-M,y+16,'12px '+F,'#657286','right');
  C.toBlob(b=>{if(!b)return;const u=URL.createObjectURL(b),a=document.createElement('a'),id=uuid.slice(0,8)||'replay';a.href=u;a.download=`忘忘看报-战斗复盘-${id}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(u),1200)},'image/png');
}
function bind(root){const b=root.querySelector('#mr2DownloadMvp');if(!b)return;b.onclick=e=>{e.preventDefault();download(root)};const t=ui('下载完整 MVP 图片','Download full MVP image');if(b.textContent!==t)b.textContent=t;b.dataset.richExportBound='1'}
async function run(){const root=document.getElementById('mrReplayResult'),api=window.MorimensReplayReview;if(!root||!api||!root.querySelector('.mr2mvps'))return;const uuid=clean(root.querySelector('.mr2bmeta .id b')?.textContent);if(!uuid)return;try{const full=cache.uuid===uuid&&cache.full?cache.full:await api.fetchReplay(uuid),tl=cache.uuid===uuid&&cache.tl?cache.tl:api.buildTimeline(full);cache={uuid,full,tl,player:playerName(full,tl)||cache.player};patchPlayer(root,cache.player);bind(root)}catch(e){console.warn('Replay rich export failed',e)}}
function watch(){let r=null,mo=null;const attach=()=>{const n=document.getElementById('mrReplayResult');if(!n||n===r)return;r=n;mo?.disconnect();mo=new MutationObserver(()=>queueMicrotask(run));mo.observe(r,{subtree:true,childList:true});run()};attach();new MutationObserver(attach).observe(document.documentElement,{subtree:true,childList:true});window.addEventListener('morimens-language-change',()=>setTimeout(run,0))}document.readyState==='loading'?document.addEventListener('DOMContentLoaded',watch,{once:true}):watch();
})();

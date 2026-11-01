(()=>{
'use strict';
// "主线困难榜单": statistics of the public clears (battle replays) of the hard main-story stages, one column per stage like the D-Zone zones.
// Data: data/morimens/mainhard/index.json built by scripts/build_main_hard.py.
if(window.__morimensMainHard)return;
window.__morimensMainHard=true;
const TAB_ID='morimensMainHardTab',PANEL_ID='morimensMainHardPanel',HASH='#mainhard',DATA='data/morimens/mainhard/index.json';
const zh=()=>localStorage.getItem('morimens.language')!=='en';
const ui=(cn,en)=>zh()?cn:en;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=id=>document.getElementById(id);
const state={mounted:false,data:null,view:'chars',stage:'all',sort:{chars:['total',-1],toks:['total',-1]},limit:100,error:null};
const campaignEn={'忘却篇':'Oblivion','星辰篇':'Astral'};
const stageLabel=(s,full)=>`${zh()?s.campaign:(campaignEn[s.campaign]||s.campaign)} H${s.chapter}-${s.stage}${full?' · '+s.name:''}`;

function style(){
  if($('morimensMainHardStyle'))return;
  const s=document.createElement('style');s.id='morimensMainHardStyle';s.textContent=`
  .mh{padding:18px 20px}.mh h2{margin:0 0 6px;font-size:20px;color:#ead9b9}.mh .mhNote{font-size:11px;line-height:1.7;color:#8c9aae;margin:6px 0 12px}
  .mh .mhChips,.mh .mhViews{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.mh button.mhChip,.mh button.mhView{padding:6px 11px;border:1px solid rgba(148,163,184,.22);border-radius:999px;background:rgba(255,255,255,.03);color:#c9d3df;cursor:pointer;font-size:12px}
  .mh button[aria-pressed=true]{border-color:#d7a85b;background:rgba(215,168,91,.14);color:#f3dcab}.mh .mhGrp{width:100%;font-size:11px;color:#7f8da1;margin-top:4px}
  .mh .mhKpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin:10px 0}.mh .mhKpi{padding:10px 12px;border:1px solid rgba(148,163,184,.14);border-radius:11px;background:rgba(9,16,27,.55)}.mh .mhKpi small{display:block;color:#8fa0b5;font-size:10px}.mh .mhKpi b{font-size:20px;color:#f1d69f;font-variant-numeric:tabular-nums}
  .mh table{width:100%;border-collapse:collapse;font-size:12px}.mh th,.mh td{padding:7px 8px;text-align:center;border-bottom:1px solid rgba(148,163,184,.1);vertical-align:middle}.mh th{color:#9fb0c4;font-weight:600;white-space:nowrap}.mh th button{all:unset;cursor:pointer;color:inherit;font:inherit}.mh th button:hover{color:#f3dcab}
  .mh td.mhName{text-align:left;white-space:nowrap}.mh td.mhName img,.mh .mhTeam img{width:34px;height:34px;border-radius:7px;object-fit:cover;background:#0b1220;vertical-align:middle;margin-right:7px}
  .mh td[style*=hsla]{color:#f3f6fa;font-variant-numeric:tabular-nums}.mh .mhScroll{overflow-x:auto}
  .mh .mhTeam{display:flex;gap:5px;justify-content:center}.mh .mhTeam span{position:relative;display:block;width:38px}.mh .mhTeam img{display:block;margin:0;width:38px;height:38px}.mh .mhTeam em{position:absolute;left:0;right:0;bottom:-1px;text-align:center;font-style:normal;font-size:9px;color:#fff;background:rgba(0,0,0,.6);border-radius:0 0 7px 7px}
  .mh .mhBtns{display:flex;gap:5px;justify-content:center;flex-wrap:wrap}.mh .mhBtns button,.mh .mhBtns a,.mh .dtideReplayReviewOpen{padding:4px 9px;border:1px solid rgba(215,168,91,.4);border-radius:7px;background:rgba(215,168,91,.08);color:#e8ca91;font-size:11px;text-decoration:none;cursor:pointer}
  .mh .mhMore{display:block;margin:10px auto;padding:7px 18px;border:1px solid rgba(215,168,91,.4);border-radius:9px;background:rgba(215,168,91,.08);color:#e8ca91;cursor:pointer}
  @media(max-width:700px){.mh{padding:14px 10px}}`;
  document.head.appendChild(s);
}
const heat=(v,max)=>{const t=max>0?Math.max(0,Math.min(1,v/max)):0;return `background:hsla(${Math.round(215-215*t)},72%,45%,${(.1+.45*t).toFixed(2)})`};
const pct=x=>(x*100).toFixed(1)+'%';
const nameOf=a=>zh()?a[2]:a[1];
const tokName=t=>t?(zh()?t[1]:t[0]):'—';
const portrait=(a,lv)=>`<span title="${esc(nameOf(a))}${lv?' Lv.'+lv:''}"><img src="${esc(a[3])}" alt="" loading="lazy">${lv?`<em>${lv}</em>`:''}</span>`;

function stagesInScope(){const d=state.data;return state.stage==='all'?d.stages:d.stages.filter(s=>String(s.tid)===String(state.stage))}
function stats(rows){
  const b=rows.map(r=>r[1]).filter(x=>x>0).sort((a,b)=>a-b),n=b.length;
  return {n:rows.length,avg:n?b.reduce((s,x)=>s+x,0)/n:0,med:n?b[n>>1]:0,min:n?b[0]:0,max:n?b[n-1]:0};
}
function usageTable(kind){
  const d=state.data,isChars=kind==='chars',stages=d.stages;
  const total=stages.reduce((s,x)=>s+x.reviews.length,0);
  const per=[],agg=new Map();
  stages.forEach((st,si)=>{
    const m=new Map();
    for(const r of st.reviews){
      const keys=isChars?[...new Set(r[5].map(a=>a[0]))]:(r[4]>=0?[r[4]]:[]);
      for(const k of keys){m.set(k,(m.get(k)||0)+1);const g=agg.get(k)||{n:0,lvSum:0,lvN:0};g.n++;agg.set(k,g)}
      if(isChars)for(const a of r[5]){const g=agg.get(a[0]);g.lvSum+=a[1];g.lvN++}
    }
    per[si]={m,n:st.reviews.length};
  });
  let rows=[...agg.keys()].map(k=>({k,total:agg.get(k).n/total,avgLv:agg.get(k).lvN?agg.get(k).lvSum/agg.get(k).lvN:0,cells:stages.map((s,i)=>per[i].n?(per[i].m.get(k)||0)/per[i].n:0),cnt:agg.get(k).n}));
  const [sk,dir]=state.sort[kind];
  const val=r=>sk==='total'?r.total:sk==='lv'?r.avgLv:sk==='name'?0:r.cells[Number(sk)];
  rows.sort((a,b)=>dir*(val(a)-val(b))||b.total-a.total);
  const max=stages.map((_,i)=>Math.max(0,...rows.map(r=>r.cells[i]))),maxT=Math.max(0,...rows.map(r=>r.total));
  const arrow=k=>String(state.sort[kind][0])===String(k)?(state.sort[kind][1]>0?' ↑':' ↓'):' ↕';
  const head=`<th>${isChars?ui('角色','Awakener'):ui('钥令','Keeper skill')}</th>${stages.map((s,i)=>`<th title="${esc(stageLabel(s,true))}"><button type="button" data-mh-sort="${kind}|${i}">H${s.chapter}-${s.stage}${arrow(i)}</button></th>`).join('')}<th><button type="button" data-mh-sort="${kind}|total">${ui('汇总','All')}${arrow('total')}</button></th>${isChars?`<th><button type="button" data-mh-sort="${kind}|lv">${ui('平均等级','Avg Lv')}${arrow('lv')}</button></th>`:''}<th>${ui('次数','Clears')}</th>`;
  const body=rows.map(r=>{
    const e=isChars?d.aw[r.k]:d.tk[r.k];
    const nm=isChars?nameOf(e):tokName(e),img=e&&e[isChars?3:2];
    return `<tr><td class="mhName">${img?`<img src="${esc(img)}" alt="" loading="lazy">`:''}${esc(nm)}</td>${r.cells.map((v,i)=>`<td style="${heat(v,max[i])}">${v?pct(v):'—'}</td>`).join('')}<td style="${heat(r.total,maxT)}"><b>${pct(r.total)}</b></td>${isChars?`<td>${r.avgLv.toFixed(1)}</td>`:''}<td>${r.cnt}</td></tr>`}).join('');
  return `<div class="mhScroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
function fastTable(){
  const d=state.data,scope=stagesInScope();
  const rows=[];
  for(const st of scope)for(const r of st.reviews)if(r[1]>0)rows.push({st,r});
  rows.sort((a,b)=>a.r[1]-b.r[1]||a.r[2]-b.r[2]);
  const shown=rows.slice(0,state.limit);
  const body=shown.map((x,i)=>{const r=x.r,p=d.players[r[0]],tk=r[4]>=0?d.tk[r[4]]:null;
    return `<tr><td>${i+1}</td><td class="mhName">${esc(p[1])}<br><small style="color:#7f8da1">UID ${esc(p[0])}</small></td><td>H${x.st.chapter}-${x.st.stage}<br><small style="color:#7f8da1">${esc(x.st.name)}</small></td><td><b>${r[1]}</b></td><td><div class="mhTeam">${r[5].map(a=>portrait(d.aw[a[0]],a[1])).join('')}</div></td><td>${esc(tokName(tk))}</td><td><div class="mhBtns"><button type="button" class="mhCopy" data-replay-code="${esc(r[3])}" title="${esc(ui('复制 battleUuid，用于游戏内录像回放','Copy battleUuid for in-game replay'))}">${ui('复制录像回放','Copy Replay')}</button><a href="https://eremora.com/u/${esc(p[0])}" target="_blank" rel="noopener noreferrer">Eremora ↗</a></div></td></tr>`}).join('');
  return `<div class="mhScroll"><table><thead><tr><th>#</th><th>${ui('玩家','Player')}</th><th>${ui('关卡','Stage')}</th><th>${ui('回合数','Rounds')}</th><th>${ui('配队（等级）','Team (level)')}</th><th>${ui('钥令','Keeper skill')}</th><th></th></tr></thead><tbody>${body}</tbody></table></div>${rows.length>shown.length?`<button type="button" class="mhMore" data-mh-more>${ui('显示更多','Show more')}（${shown.length}/${rows.length}）</button>`:''}`;
}
function teamTable(){
  const d=state.data,scope=stagesInScope(),m=new Map();
  for(const st of scope)for(const r of st.reviews){
    const key=r[5].map(a=>a[0]).sort((a,b)=>a-b).join(','),g=m.get(key)||{key,n:0,bs:[],best:null};
    g.n++;if(r[1]>0){g.bs.push(r[1]);if(!g.best||r[1]<g.best[1])g.best=r}m.set(key,g);
  }
  const rows=[...m.values()].sort((a,b)=>b.n-a.n||a.key.localeCompare(b.key)),total=scope.reduce((s,x)=>s+x.reviews.length,0),shown=rows.slice(0,state.limit);
  const body=shown.map((g,i)=>`<tr><td>${i+1}</td><td><div class="mhTeam">${g.key.split(',').map(k=>portrait(d.aw[k])).join('')}</div></td><td>${g.n}</td><td>${pct(g.n/total)}</td><td>${g.bs.length?(g.bs.reduce((a,b)=>a+b,0)/g.bs.length).toFixed(1):'—'}</td><td>${g.best?g.best[1]:'—'}</td><td>${g.best?`<button type="button" class="mhCopy" data-replay-code="${esc(g.best[3])}">${ui('复制最快回放','Copy fastest replay')}</button>`:''}</td></tr>`).join('');
  return `<div class="mhScroll"><table><thead><tr><th>#</th><th>${ui('配队（不分站位）','Team (any order)')}</th><th>${ui('次数','Clears')}</th><th>${ui('占比','Share')}</th><th>${ui('平均回合','Avg rounds')}</th><th>${ui('最快回合','Best')}</th><th></th></tr></thead><tbody>${body}</tbody></table></div>${rows.length>shown.length?`<button type="button" class="mhMore" data-mh-more>${ui('显示更多','Show more')}（${shown.length}/${rows.length}）</button>`:''}`;
}
function render(){
  const panel=$(PANEL_ID);if(!panel||panel.hidden&&!state.mounted)return;
  const host=$('morimensMainHardBody');if(!host)return;
  if(state.error){host.innerHTML=`<div class="dtideEmpty">${ui('数据载入失败：','Failed to load data: ')}${esc(state.error.message||state.error)}</div>`;return}
  const d=state.data;if(!d){host.innerHTML=`<div class="dtideEmpty">${ui('正在读取…','Loading…')}</div>`;return}
  const groups={};for(const s of d.stages)(groups[s.campaign]=groups[s.campaign]||[]).push(s);
  const chips=`<button type="button" class="mhChip" data-mh-stage="all" aria-pressed="${state.stage==='all'}">${ui('全部关卡汇总','All stages')}</button>`+Object.entries(groups).map(([c,l])=>`<span class="mhGrp">${esc(zh()?c:campaignEn[c]||c)}</span>`+l.map(s=>`<button type="button" class="mhChip" data-mh-stage="${s.tid}" aria-pressed="${String(state.stage)===String(s.tid)}" title="${esc(s.name)}">H${s.chapter}-${s.stage} ${esc(s.name)}</button>`).join('')).join('');
  const scope=stagesInScope(),all=scope.flatMap(s=>s.reviews),st=stats(all);
  const kpis=`<div class="mhKpis"><div class="mhKpi"><small>${ui('通关样本','Clears')}</small><b>${st.n.toLocaleString()}</b></div><div class="mhKpi"><small>${ui('平均回合','Avg rounds')}</small><b>${st.avg.toFixed(1)}</b></div><div class="mhKpi"><small>${ui('中位回合','Median')}</small><b>${st.med}</b></div><div class="mhKpi"><small>${ui('最快回合','Fastest')}</small><b>${st.min}</b></div><div class="mhKpi"><small>${ui('玩家数','Players')}</small><b>${new Set(all.map(r=>r[0])).size.toLocaleString()}</b></div></div>`;
  const views=[['chars',ui('角色榜单','Awakeners')],['toks',ui('钥令榜单','Keeper skills')],['fast',ui('速通榜','Fastest clears')],['teams',ui('常用配队','Common teams')]].map(([k,n])=>`<button type="button" class="mhView" data-mh-view="${k}" aria-pressed="${state.view===k}">${n}</button>`).join('');
  const table=state.view==='chars'||state.view==='toks'?usageTable(state.view):state.view==='fast'?fastTable():teamTable();
  const checked=d.stages.map(s=>s.checked).filter(Boolean).sort().pop();
  host.innerHTML=`<div class="mhChips">${chips}</div>${kpis}<div class="mhViews">${views}</div>${table}<div class="mhNote">${ui('数据来源：各主线困难关卡公开展示的通关回放样本（不是全体玩家），每条含回合数、4 名唤醒体等级和钥令；统计方式和融灾禁区一致：每个关卡一列，出场率 = 出现该角色的通关数 ÷ 该关卡通关样本数。','Source: the public clear replays shown for each hard main-story stage (a sample, not every player); each has rounds, the four Awakeners with levels and the keeper skill. Same method as the D-Zone zones: one column per stage, usage = clears with the character / clears of the stage.')}${checked?` ${ui('最近抓取：','Last fetched: ')}${esc(String(checked).slice(0,16).replace('T',' '))}`:''}</div>`;
}
function shell(){return `<section class="panel mh"><h2>${ui('主线困难榜单','Hard Main-story Leaderboard')}</h2><div id="morimensMainHardBody"></div></section>`}
function open(){
  mount();const panel=$(PANEL_ID);if(!panel)return;
  document.querySelectorAll('#morimensTabs .morimensTab').forEach(b=>b.setAttribute('aria-selected',String(b.id===TAB_ID)));
  document.querySelectorAll('main.wrap > [role="tabpanel"]').forEach(p=>{if(p.id!==PANEL_ID)p.hidden=true});
  panel.hidden=false;if(location.hash!==HASH)history.replaceState(null,'',HASH);
  if(!state.data&&!state.loading){state.loading=fetch(DATA,{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}).then(d=>{state.data=d;render()}).catch(e=>{state.error=e;render()})}
  render();panel.scrollIntoView?.({block:'start',behavior:'smooth'});
}
function mount(){
  if(state.mounted)return true;
  const tabs=$('morimensTabs'),main=document.querySelector('main.wrap');if(!tabs||!main)return false;
  style();
  if(!$(TAB_ID)){const b=document.createElement('button');b.type='button';b.className='morimensTab';b.id=TAB_ID;b.setAttribute('role','tab');b.setAttribute('aria-selected','false');b.setAttribute('aria-controls',PANEL_ID);b.textContent=ui('主线困难榜单','Hard Main-story');const z=$('morimensZonesTab');if(z&&z.nextSibling)tabs.insertBefore(b,z.nextSibling);else tabs.appendChild(b);b.addEventListener('click',open)}
  if(!$(PANEL_ID)){const p=document.createElement('div');p.id=PANEL_ID;p.setAttribute('role','tabpanel');p.hidden=true;p.innerHTML=shell();const a=$('morimensZonesPanel');if(a&&a.parentNode)a.parentNode.insertBefore(p,a.nextSibling);else main.appendChild(p)}
  tabs.addEventListener('click',e=>{const hit=e.target.closest?.('.morimensTab');if(hit&&hit.id!==TAB_ID){const p=$(PANEL_ID);if(p)p.hidden=true;$(TAB_ID)?.setAttribute('aria-selected','false')}},true);
  const panel=$(PANEL_ID);
  panel.addEventListener('click',e=>{
    const s=e.target.closest('[data-mh-stage]');if(s){state.stage=s.dataset.mhStage;state.limit=100;render();return}
    const v=e.target.closest('[data-mh-view]');if(v){state.view=v.dataset.mhView;state.limit=100;render();return}
    const so=e.target.closest('[data-mh-sort]');if(so){const [k,key]=so.dataset.mhSort.split('|'),cur=state.sort[k];state.sort[k]=cur[0]===key?[key,-cur[1]]:[key,-1];render();return}
    if(e.target.closest('[data-mh-more]')){state.limit+=100;render();return}
    const c=e.target.closest('.mhCopy');if(c){const code=c.dataset.replayCode,done=()=>{const t=c.textContent;c.textContent=ui('已复制','Copied');setTimeout(()=>{c.textContent=t},1200)};(navigator.clipboard?.writeText(code)||Promise.reject()).then(done).catch(()=>{const ta=document.createElement('textarea');ta.value=code;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');done()}catch{}ta.remove()})}
  });
  state.mounted=true;
  if(location.hash===HASH)open();
  return true;
}
let tries=0;const iv=setInterval(()=>{if(mount()||++tries>120)clearInterval(iv)},500);
})();

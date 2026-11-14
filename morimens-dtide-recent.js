(()=>{
'use strict';
// "玩家近期排名": every player of the latest (up to) 10 D-Zone seasons with rank + score per season, averages, and the lineups of each season on expand.
// Data: data/morimens/eremora/recent/index.json (scripts/build_recent_players.py); lineups come from each season's lowspec file when a row is opened.
if(window.__morimensDtideRecent)return;
window.__morimensDtideRecent=true;
const zh=()=>localStorage.getItem('morimens.language')!=='en';
const ui=(cn,en)=>zh()?cn:en;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=id=>document.getElementById(id);
const INDEX_URL='data/morimens/eremora/recent/index.json';
const state={active:false,data:null,loading:null,error:false,sort:'avgRank',dir:1,min:2,q:'',limit:100,open:new Set()};
const seasonFiles=new Map(); // season key -> Promise<{d, byPlayer:Map<uid,{p,teams}>}>
let rowsCache=null;

function style(){
  window.MorimensLowspecStyle?.();
  if($('dtideRecentStyle'))return;
  const s=document.createElement('style');s.id='dtideRecentStyle';s.textContent=`
  .dtideRecent td.rc,.dtideRecent th.rc{white-space:nowrap}.dtideRecent td.rc small{display:block;margin-top:1px;font-size:10px;color:#9fb0c4;font-weight:400}
  .dtideRecent td.rc.none{color:#5f6e82}.dtideRecent td.rc b{color:#ecdcb9;font-weight:700}.dtideRecent .rcInp{min-height:34px;border:1px solid rgba(148,163,184,.22);border-radius:8px;background:#0d1621;color:#e9eef5;padding:0 10px;min-width:180px}
  .dtideRecent .rcSeason{margin:0 0 12px}.dtideRecent .rcSeasonHd{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:baseline;margin:0 0 6px;color:#ead9b9;font-size:13px}.dtideRecent .rcSeasonHd span{color:#9fb0c4;font-size:11px}
  .dtideRecent th.rcSeasonTh small{display:block;font-size:9px;font-weight:400;color:#8fa0b5}`;
  document.head.appendChild(s);
}
function load(){
  if(state.data)return Promise.resolve(state.data);
  if(state.loading)return state.loading;
  state.loading=fetch(INDEX_URL,{cache:'no-cache'}).then(r=>r.ok?r.json():null).catch(()=>null).then(d=>{state.loading=null;state.data=d;state.error=!d;rowsCache=null;return d});
  return state.loading;
}
function loadSeason(s){
  if(seasonFiles.has(s.key))return seasonFiles.get(s.key);
  const p=fetch(s.path,{cache:'no-cache'}).then(r=>r.ok?r.json():null).then(d=>{
    if(!d)throw new Error('missing');
    const idx=new Map();d.players.forEach((p,i)=>idx.set(p[0],i));
    const teams=new Map();for(const t of d.teams){let a=teams.get(t[0]);if(!a)teams.set(t[0],a=[]);a.push(t)}
    return {d,idx,teams};
  }).catch(e=>{seasonFiles.delete(s.key);throw e});
  seasonFiles.set(s.key,p);return p;
}
function rowsOf(){
  if(rowsCache)return rowsCache;
  const d=state.data;if(!d)return [];
  rowsCache=d.players.map(([uid,name,rs])=>{
    const got=rs.filter(Boolean),n=got.length;
    return {uid,name,rs,n,avgRank:got.reduce((a,x)=>a+x[0],0)/n,avgScore:got.reduce((a,x)=>a+x[1],0)/n,best:Math.min(...got.map(x=>x[0]))};
  });
  return rowsCache;
}
const num=(x,d=1)=>Number.isInteger(x)?String(x):x.toFixed(d);
function render(){
  const host=$('dtideRecent');if(!host||!state.active)return;
  apply();
  const d=state.data;
  if(!d){host.innerHTML=`<div class="dtideEmpty">${state.error?ui('近期排名数据读取失败，请稍后刷新重试。','Failed to load the recent-ranking data, please refresh and retry.'):ui('正在读取…','Loading…')}</div>`;return}
  const S=d.seasons,all=rowsOf();
  if(state.min>S.length)state.min=S.length;
  const q=state.q.trim().toLowerCase();
  let rows=all.filter(r=>r.n>=state.min&&(!q||r.name.toLowerCase().includes(q)||r.uid.includes(q)));
  const k=state.sort,D=state.dir;
  const val=r=>k==='avgRank'?r.avgRank:k==='avgScore'?r.avgScore:k==='n'?r.n:k==='best'?r.best:k.startsWith('s')?(r.rs[Number(k.slice(1))]?r.rs[Number(k.slice(1))][k.endsWith('r')?0:1]:null):r.avgRank;
  // season columns: s<i>r = rank, s<i>s = score (clicking the season header sorts by rank)
  rows.sort((a,b)=>{const x=val(a),y=val(b);if(x==null&&y==null)return a.avgRank-b.avgRank;if(x==null)return 1;if(y==null)return -1;return (D*(x-y))||(a.avgRank-b.avgRank)||(b.avgScore-a.avgScore)});
  const total=rows.length,shown=rows.slice(0,state.limit);
  const arrow=key=>key===k?(D>0?' ↑':' ↓'):' ↕';
  const minOpts=Array.from({length:S.length},(_,i)=>i+1).map(n=>`<option value="${n}"${n===state.min?' selected':''}>${n}${ui(' 期及以上',' or more')}</option>`).join('');
  const seasonHead=S.map((s,i)=>`<th class="rc rcSeasonTh"><button type="button" class="dtideSortHead" data-rc-sort="s${i}r" title="${esc(ui('按该期排名排序','Sort by this season rank'))}">${esc(ui('第'+s.id+'期','S'+s.id))}${arrow('s'+i+'r')}</button><small>${s.complete?esc(s.period||''):ui('进行中','ongoing')}</small></th>`).join('');
  const head=`<tr><th>#</th><th>${ui('玩家（当前ID / UID）','Player (current ID / UID)')}</th>${seasonHead}<th class="rc"><button type="button" class="dtideSortHead" data-rc-sort="n">${ui('参与期数','Seasons')}${arrow('n')}</button></th><th class="rc"><button type="button" class="dtideSortHead" data-rc-sort="avgScore">${ui('平均分数','Avg score')}${arrow('avgScore')}</button></th><th class="rc"><button type="button" class="dtideSortHead" data-rc-sort="avgRank">${ui('平均排名','Avg rank')}${arrow('avgRank')}</button></th></tr>`;
  const cell=(x,i)=>x?`<td class="rc${k==='s'+i+'r'?' hl':''}"><b>#${x[0]}</b><small>${x[1]}${ui('分','pts')}</small></td>`:`<td class="rc none">—</td>`;
  const body=shown.map((r,i)=>{
    const open=state.open.has(r.uid);
    const tr=`<tr class="lsRow${open?' open':''}" data-rc-key="${esc(r.uid)}" title="${esc(ui('点击展开各期队伍详情','Click for the lineups of every season'))}"><td>${i+1}</td><td class="lsName">${esc(r.name)}<small>UID ${esc(r.uid)}</small></td>${r.rs.map(cell).join('')}<td class="rc${k==='n'?' hl':''}">${r.n}/${S.length}</td><td class="rc${k==='avgScore'?' hl':''}">${num(r.avgScore)}</td><td class="rc${k==='avgRank'?' hl':''}"><b>${num(r.avgRank)}</b></td></tr>`;
    const detail=open?`<tr class="lsDetail"><td colspan="${S.length+5}"><div data-rc-detail="${esc(r.uid)}">${ui('正在读取队伍详情…','Loading lineups…')}</div></td></tr>`:'';
    return tr+detail;
  }).join('');
  const note=zh()
    ?`汇总最近 ${S.length} 期的融灾 Top2000（仅统计第70期起，目前共 ${S.length} 期，满十期后只取最近十期）：显示每期排名与分数，平均分数 / 平均排名只统计该玩家上榜的期次（未上榜的期次不计入，所以建议配合“参与期数”筛选）。点击玩家行展开每一期出的队伍；点击表头可升序 / 降序。`
    :`The latest ${S.length} seasons (up to ten, counted from Season 70 on) of the D-Zone Top 2000: rank and score per season. Average score / rank only count the seasons the player made the Top 2000 (use the seasons filter). Click a row for the lineups of every season; click a header to sort.`;
  host.innerHTML=`<div class="dtideLowspec dtideRecent">
    <div class="lsNote">${note}</div>
    <div class="lsBar"><label>${ui('参与期数','Seasons played')}<select data-rc-min>${minOpts}</select></label><label>${ui('搜索玩家 ID / UID','Search ID / UID')}<input type="search" class="rcInp" data-rc-q value="${esc(state.q)}" placeholder="${esc(ui('输入ID或UID','ID or UID'))}"></label></div>
    <div class="dtideScroll"><table><thead>${head}</thead><tbody>${body||`<tr><td colspan="${S.length+5}">${ui('没有符合条件的玩家','No players match')}</td></tr>`}</tbody></table></div>
    ${total>shown.length?`<button type="button" class="lsMore" data-rc-more>${ui('显示更多','Show more')}（${shown.length}/${total}）</button>`:`<div class="lsNote">${ui('共','Total')} ${total} ${ui('名玩家','players')}</div>`}</div>`;
  const focus=host.querySelector('[data-rc-q]');
  if(state.keepFocus){state.keepFocus=false;if(focus){focus.focus();const l=focus.value.length;focus.setSelectionRange(l,l)}}
  for(const uid of state.open)fillDetail(uid);
}
async function fillDetail(uid){
  const box=document.querySelector(`#dtideRecent [data-rc-detail="${CSS.escape(uid)}"]`);if(!box)return;
  const r=rowsOf().find(x=>x.uid===uid);if(!r)return;
  const S=state.data.seasons,parts=[];
  for(let i=0;i<S.length;i++){
    const x=r.rs[i];if(!x)continue;
    const s=S[i];
    let html='';
    try{
      const f=await loadSeason(s),pi=f.idx.get(uid),teams=(pi==null?[]:(f.teams.get(pi)||[])).slice().sort((a,b)=>a[1]-b[1]||a[3]-b[3]);
      const pl=f.d.players[pi];
      html=teams.length?teams.map(t=>window.MorimensLowspecCard(f.d,s.id,t,pl)).join(''):`<div class="lsNote">${ui('该期没有可展示的队伍详情。','No lineup details for this season.')}</div>`;
    }catch{html=`<div class="lsNote">${ui('队伍详情读取失败。','Failed to load lineup details.')}</div>`}
    parts.push(`<div class="rcSeason"><div class="rcSeasonHd"><b>${esc(zh()?s.zh:s.en)}</b><span>${ui('排名','Rank')} #${x[0]} · ${x[1]}${ui('分','pts')}</span></div>${html}</div>`);
  }
  const cur=document.querySelector(`#dtideRecent [data-rc-detail="${CSS.escape(uid)}"]`);
  if(cur)cur.innerHTML=parts.join('')||`<div class="lsNote">${ui('暂无数据','No data')}</div>`;
}
const HIDE=['#dtideMatrix','#dtideTableDownload','.dtideCreationFilter','#dtideRatioLegend'];
let savedTitle=null;
const titleOf=()=>ui('玩家近期排名','Recent Player Ranking');
function apply(){
  const on=state.active;
  document.querySelectorAll('.dtideLeaderboardTab').forEach(x=>{if(on)x.setAttribute('aria-selected',String(x.hasAttribute('data-dtide-recent-tab')))});
  for(const sel of HIDE){const el=document.querySelector(sel);if(el)el.style.display=on?'none':''}
  const title=$('dtideMatrixTitle');
  if(title){if(on){if(savedTitle==null&&title.textContent!==titleOf())savedTitle=title.textContent;title.textContent=titleOf()}else if(savedTitle!=null){title.textContent=savedTitle;savedTitle=null}}
  const host=$('dtideRecent');if(host)host.hidden=!on;
}
async function activate(){
  if(!$('dtideBattle')?.hidden)document.querySelector('[data-dtide-entity="character"]')?.click();
  state.active=true;state.limit=100;apply();
  const host=$('dtideRecent');if(host)host.innerHTML=`<div class="dtideEmpty">${ui('正在读取…','Loading…')}</div>`;
  await load();render();
}
function deactivate(restore){if(!state.active)return;state.active=false;apply();if(restore)$('dtideEntityType')?.dispatchEvent(new Event('change',{bubbles:true}))}
let titleWatch=null;
function watchTitle(){
  const title=$('dtideMatrixTitle');if(!title||titleWatch)return;
  titleWatch=new MutationObserver(()=>{if(state.active&&title.textContent!==titleOf()){savedTitle=null;title.textContent=titleOf()}});
  titleWatch.observe(title,{childList:true,characterData:true,subtree:true});
}
const mainTabs=()=>[...document.querySelectorAll('.dtideLeaderboardTabs')].find(t=>t.querySelector('[data-dtide-entity]'))||null;
function mountPanel(){
  if($('dtideRecent'))return;
  const after=$('dtideLowspec')||$('dtideBattle')||$('dtideMatrix');if(!after)return;
  style();
  const panel=document.createElement('div');panel.id='dtideRecent';panel.className='dtideBattle';panel.hidden=!state.active;after.after(panel);
  if(state.active)render();
}
function mount(){
  watchTitle();
  const tabs=mainTabs();if(!tabs)return false;
  if(!tabs.querySelector('[data-dtide-recent-tab]')){
    style();
    const b=document.createElement('button');b.type='button';b.className='dtideLeaderboardTab';b.setAttribute('data-dtide-recent-tab','1');b.setAttribute('role','tab');b.setAttribute('aria-selected',String(state.active));b.textContent=ui('玩家近期排名','Recent ranking');
    const anchor=tabs.querySelector('[data-dtide-lowspec-tab]')||tabs.querySelector('[data-dtide-battle-tab]')||tabs.querySelector('[data-dtide-entity="creation"]')||tabs.lastElementChild;
    if(anchor)anchor.after(b);else tabs.appendChild(b);
  }
  mountPanel();
  return true;
}
document.addEventListener('click',e=>{
  const t=e.target;if(!t.closest)return;
  if(t.closest('[data-dtide-recent-tab]')){if(!state.active)activate();return}
  if(state.active&&t.closest('[data-dtide-entity],[data-dtide-battle-tab],[data-dtide-lowspec-tab]')){deactivate(!t.closest('[data-dtide-lowspec-tab]'));return}
  const host=$('dtideRecent');if(!host||!host.contains(t))return;
  const so=t.closest('[data-rc-sort]');if(so){const k=so.dataset.rcSort;if(state.sort===k)state.dir=-state.dir;else{state.sort=k;state.dir=(k==='avgScore'||k==='n')?-1:1}state.limit=100;render();return}
  const row=t.closest('tr[data-rc-key]');if(row&&!t.closest('a,button')){const k=row.dataset.rcKey;if(state.open.has(k))state.open.delete(k);else state.open.add(k);render();return}
  if(t.closest('[data-rc-more]')){state.limit+=100;render()}
});
document.addEventListener('change',e=>{
  const host=$('dtideRecent');if(!host||!host.contains(e.target))return;
  if(e.target.matches('[data-rc-min]')){state.min=Number(e.target.value);state.limit=100;render()}
});
document.addEventListener('input',e=>{
  const host=$('dtideRecent');if(!host||!host.contains(e.target))return;
  if(e.target.matches('[data-rc-q]')){state.q=e.target.value;state.limit=100;state.keepFocus=true;render()}
});
// keep the tab attached when the leaderboard module redraws its strip
let healQueued=false;
new MutationObserver(()=>{if(healQueued)return;const t=mainTabs();if(t&&t.querySelector('[data-dtide-recent-tab]')&&$('dtideRecent'))return;healQueued=true;requestAnimationFrame(()=>{healQueued=false;if(mainTabs())mount()})}).observe(document.documentElement,{childList:true,subtree:true});
setInterval(()=>{if(mainTabs()&&(!document.querySelector('[data-dtide-recent-tab]')||!$('dtideRecent')))mount()},700);
mount();
})();

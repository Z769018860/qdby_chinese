(()=>{
'use strict';
// "低配榜单": ranks lineups by how little they invest (enlightenment, skill levels, soulforge, SSR wheel stacks, keeper level).
// Data: data/morimens/eremora/lowspec/<season>.json built by scripts/build_lowspec_rank.py.
if(window.__morimensDtideLowspec)return;
window.__morimensDtideLowspec=true;
const zh=()=>localStorage.getItem('morimens.language')!=='en';
const ui=(cn,en)=>zh()?cn:en;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const METRICS=[
  {key:'enl',cn:'总启灵数',en:'Total enlightenment',max:60,tip:['4 名唤醒体启灵等级之和（3 = 3启，15 = +12）','Sum of the 4 members’ enlightenment levels (3 = E3, 15 = +12)']},
  {key:'skill',cn:'技能总级别',en:'Skill levels',tip:['4 名唤醒体已解锁技能槽的等级之和','Sum of the unlocked skill-slot levels of the 4 members']},
  {key:'forge',cn:'灵塑适性',en:'Soulforge aptitude',max:40,tip:['4 名唤醒体灵塑适性等级之和（单人最高 10）','Sum of the members’ Soulforge aptitude levels (max 10 each)']},
  {key:'wheel',cn:'SSR命轮叠位',en:'SSR wheel stacks',tip:['队伍装备的 SSR 命轮等级（叠位）之和','Sum of the levels (stacks) of the equipped SSR wheels']},
  {key:'keeper',cn:'守密人等级',en:'Keeper level',tip:['该场战斗时玩家的守密人等级','The player’s keeper level in that battle']}
];
const state={season:null,data:null,loading:null,active:false,list:'score',diff:6,zone:1,noAssist:true,limit:100,score:'all'};
const $=id=>document.getElementById(id);
const stateOf=()=>document.getElementById('dtideSeason')?.value||'';
const seasonKey=v=>/^\d+$/.test(String(v))?String(v):null;

function style(){
  if($('dtideLowspecStyle'))return;
  const s=document.createElement('style');s.id='dtideLowspecStyle';s.textContent=`
  .dtideLowspec{margin-top:6px}.dtideLowspec .lsBar{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:flex-end;margin:6px 0 10px}
  .dtideLowspec label{display:flex;flex-direction:column;gap:4px;font-size:11px;color:#8fa0b5}.dtideLowspec select{min-height:34px;border:1px solid rgba(148,163,184,.22);border-radius:8px;background:#0d1621;color:#e9eef5;padding:0 8px}
  .dtideLowspec .lsChk{flex-direction:row;align-items:center;gap:6px;min-height:34px}
  .dtideLowspec .lsTabs{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px}.dtideLowspec .lsTabs button{padding:6px 11px;border:1px solid rgba(148,163,184,.22);border-radius:999px;background:rgba(255,255,255,.03);color:#c9d3df;cursor:pointer;font-size:12px}
  .dtideLowspec .lsTabs button[aria-pressed=true]{border-color:#d7a85b;background:rgba(215,168,91,.14);color:#f3dcab}
  .dtideLowspec .lsNote{font-size:11px;line-height:1.7;color:#8c9aae;margin:6px 0 10px}
  .dtideLowspec table{width:100%;border-collapse:collapse;font-size:12px}.dtideLowspec th,.dtideLowspec td{padding:7px 8px;text-align:center;border-bottom:1px solid rgba(148,163,184,.1);vertical-align:middle}
  .dtideLowspec th{color:#9fb0c4;font-weight:600;white-space:nowrap}.dtideLowspec td.lsName{text-align:left;min-width:120px}.dtideLowspec td.lsName small{display:block;color:#7f8da1;font-size:10px}
  .dtideLowspec .lsTeam{display:flex;gap:4px;justify-content:center}.dtideLowspec .lsTeam span{position:relative;display:block;width:34px;height:34px}.dtideLowspec .lsTeam img{width:34px;height:34px;border-radius:7px;object-fit:cover;background:#0b1220}
  .dtideLowspec .lsTeam span.b:after{content:'助';position:absolute;right:-2px;bottom:-2px;font-size:8px;background:#d7a85b;color:#1b1406;border-radius:4px;padding:0 2px}
  .dtideLowspec td.hl{color:#f3dcab;font-weight:800;background:rgba(215,168,91,.08)}.dtideLowspec .lsScore{font-weight:800;color:#f1d69f;font-variant-numeric:tabular-nums}
  .dtideLowspec .lsMore{margin:10px auto;display:block;padding:7px 18px;border:1px solid rgba(215,168,91,.4);border-radius:9px;background:rgba(215,168,91,.08);color:#e8ca91;cursor:pointer}
  @media(max-width:700px){.dtideLowspec table{display:block;overflow-x:auto}}`;
  document.head.appendChild(s);
}
function load(){
  const key=seasonKey(stateOf());
  if(!key)return Promise.resolve(null);
  if(state.season===key&&state.data)return Promise.resolve(state.data);
  if(state.loading&&state.loading.key===key)return state.loading.p;
  const p=fetch(`data/morimens/eremora/lowspec/${key}.json`,{cache:'no-cache'}).then(r=>r.ok?r.json():null).catch(()=>null).then(d=>{state.season=key;state.data=d;state.loading=null;return d});
  state.loading={key,p};return p;
}
const val=(t,k)=>k==='keeper'?(t[5]??0):t[6].reduce((n,m)=>n+m[{enl:1,skill:2,forge:3,wheel:4}[k]],0);
const scoreOk=p=>{const s=state.score;if(s==='all')return true;if(s.includes(':')){const [a,b]=s.split(':').map(Number);return p[3]>=a&&p[3]<=b}return p[3]===Number(s)};
// percentile = share of the other lineups in the group that invest MORE than this one (ties count half): 100 = the lowest investment
function percentiles(list){
  const n=list.length;
  for(const m of METRICS){
    const vs=list.map(r=>r.v[m.key]).sort((a,b)=>a-b),pos=new Map();
    for(const r of list){const v=r.v[m.key];if(!pos.has(v)){let lo=0,hi=n;while(lo<hi){const mid=(lo+hi)>>1;if(vs[mid]<v)lo=mid+1;else hi=mid}const a=lo;lo=a;hi=n;while(lo<hi){const mid=(lo+hi)>>1;if(vs[mid]<=v)lo=mid+1;else hi=mid}pos.set(v,[a,lo])}}
    for(const r of list){const [a,b]=pos.get(r.v[m.key]);r['p_'+m.key]=n>1?100*((n-b)+(b-a-1)/2)/(n-1):100}
  }
  for(const r of list)r.index=METRICS.reduce((s,m)=>s+r['p_'+m.key],0)/METRICS.length;
}
function lineups(d,filter){
  const rows=[];
  for(const t of d.teams){
    const p=d.players[t[0]];
    if(!scoreOk(p))continue;
    if(state.noAssist&&t[6].some(m=>m[5]))continue;
    if(!filter(t))continue;
    rows.push({t,p,v:Object.fromEntries(METRICS.map(m=>[m.key,val(t,m.key)]))});
  }
  return rows;
}
// one zone + threat level: every lineup (clear and extra team) of players with the selected score
function zoneRows(d){
  const rows=lineups(d,t=>t[1]===state.zone&&t[2]===state.diff);
  percentiles(rows);return rows;
}
// all zones: per zone and threat level the lineups are scored against each other, a player's lineup scores add up
function playerRows(d){
  const rows=lineups(d,()=>true),groups=new Map();
  for(const r of rows){const k=r.t[1]+'|'+r.t[2];(groups.get(k)||groups.set(k,[]).get(k)).push(r)}
  for(const g of groups.values())percentiles(g);
  const by=new Map();
  for(const r of rows){
    const o=by.get(r.t[0])||by.set(r.t[0],{p:r.p,n:0,index:0,v:{enl:0,skill:0,forge:0,wheel:0,keeper:0}}).get(r.t[0]);
    o.n++;o.index+=r.index;
    for(const k of ['enl','skill','forge','wheel'])o.v[k]+=r.v[k];
    o.v.keeper=Math.max(o.v.keeper,r.v.keeper);
  }
  return [...by.values()];
}
function render(){
  const host=$('dtideLowspec');if(!host||!state.active)return;
  apply();
  const d=state.data;
  if(!d){host.innerHTML=`<div class="dtideEmpty">${ui('当前期次暂无低配榜单数据。','No low-investment data for this season yet.')}</div>`;return}
  const all=state.zone===0,L=state.list;
  const rows=all?playerRows(d):zoneRows(d);
  const pidx=r=>all?r.p:r.p;
  if(L==='score')rows.sort((a,b)=>b.index-a.index||pidx(a)[2]-pidx(b)[2]);
  else rows.sort((a,b)=>a.v[L]-b.v[L]||b.index-a.index||pidx(a)[2]-pidx(b)[2]);
  const total=rows.length,shown=rows.slice(0,state.limit);
  const lbl=m=>zh()?m.cn:m.en;
  const diffOpts=d.diffs.map((n,i)=>`<option value="${i}"${i===state.diff?' selected':''}>${ui('危险等级','Threat ')}${n}</option>`).reverse().join('');
  const zoneTabs=[0,1,2,3,4,5].map(z=>`<button type="button" data-ls-zone="${z}" aria-pressed="${z===state.zone}">${z?ui(`第${z}禁区`,`Zone ${z}`):ui('全部禁区（玩家合计）','All zones (player total)')}</button>`).join('');
  // score filter: ranges of the main leaderboard plus every exact score shared by at least 3 players
  const cnt=new Map();for(const p of d.players)cnt.set(p[3],(cnt.get(p[3])||0)+1);
  const exact=[...cnt].filter(([s,c])=>c>=3).sort((a,b)=>b[0]-a[0]).map(([s,c])=>`<option value="${s}"${String(state.score)===String(s)?' selected':''}>${s}${ui(' 分（',' pts (')}${c}${ui(' 人）',' players)')}</option>`).join('');
  const ranges=[['500:525','500–525'],['450:499','450–499'],['400:449','400–449'],['0:399',ui('400 分以下','Below 400')]].map(([v,n])=>`<option value="${v}"${state.score===v?' selected':''}>${n}</option>`).join('');
  const scoreSel=`<option value="all">${ui('全部分数','All scores')}</option>${ranges}${exact}`;
  const tabs=[{key:'score',cn:all?'综合评分榜（合计）':'综合评分榜',en:all?'Overall score (sum)':'Overall score'},...METRICS].map(m=>`<button type="button" data-ls-list="${m.key}" aria-pressed="${L===m.key}" title="${esc(m.tip?ui(m.tip[0],m.tip[1]):ui('五项投入的百分位平均：越高越“低配”','Average of the five investment percentiles: higher = lower investment'))}">${esc(lbl(m))}${m.key==='score'?'':ui(' · 最低',' · lowest')}</button>`).join('');
  const head=METRICS.map(m=>`<th title="${esc(ui(m.tip[0],m.tip[1]))}">${esc(lbl(m))}${all&&m.key!=='keeper'?ui('（合计）',' (sum)'):''}</th>`).join('');
  const body=shown.map((r,i)=>{
    const p=r.p,cells=METRICS.map(m=>`<td class="${L===m.key?'hl':''}">${r.v[m.key]}</td>`).join('');
    let mid,sub;
    if(all){mid=`<td>${r.n}</td>`;sub=`${ui('榜单第','Rank #')}${p[2]}${ui('名 · ',' · ')}${p[3]}${ui('分','pts')}`}
    else{const t=r.t,team=t[6].map(m=>{const a=d.aw[m[0]];return `<span class="${m[5]?'b':''}" title="${esc(zh()?a[2]:a[1])}"><img src="${esc(a[3])}" alt="" loading="lazy"></span>`}).join('');
      mid=`<td><div class="lsTeam">${team}</div></td>`;sub=`${ui('榜单第','Rank #')}${p[2]}${ui('名 · ',' · ')}${p[3]}${ui('分','pts')}${t[3]?ui(' · 额外队',' · extra'):''}`}
    return `<tr><td>${i+1}</td><td class="lsName">${esc(p[1])}<small>${sub}</small></td>${mid}${cells}<td class="lsScore${L==='score'?' hl':''}">${r.index.toFixed(1)}</td></tr>`;
  }).join('');
  const note=all
    ?ui('每个禁区、每个难度里，阵容（含额外队伍）互相比较投入；玩家的各阵容评分相加得到合计，越高越“低配”。单项榜按各阵容该项合计（守密人等级取最高）从低到高排序。','In every zone and threat level the lineups (extra teams included) are compared on investment; a player’s lineup scores add up to the total, higher = lower investment. Single lists sort the per-lineup sums (keeper level: the highest) from low to high.')
    :ui('统计同一禁区、同一难度通关的阵容（含额外队伍）：投入越少排名越靠前。综合评分 = 五项投入在该组阵容中的百分位平均（0–100，越高越“低配”）；单项榜按该项数值从低到高排序。选择分数后，只在该分数的玩家之间比较。','Lineups (extra teams included) that cleared the same zone and threat level are compared: the less they invest, the higher they rank. Overall score = average percentile of the five investments within the group (0–100, higher = lower investment); single lists sort that figure from low to high. With a score selected, only players with that score are compared.');
  host.innerHTML=`<div class="dtideLowspec">
    <div class="lsTabs">${zoneTabs}</div>
    <div class="lsNote">${note}</div>
    <div class="lsBar">${all?'':`<label>${ui('难度','Threat level')}<select data-ls-diff>${diffOpts}</select></label>`}<label>${ui('玩家总分','Player score')}<select data-ls-score>${scoreSel}</select></label>
    <label class="lsChk"><input type="checkbox" data-ls-assist${state.noAssist?' checked':''}> ${ui('排除含助战角色的阵容','Exclude lineups with a borrowed Awakener')}</label></div>
    <div class="lsTabs">${tabs}</div>
    <div class="dtideScroll"><table><thead><tr><th>#</th><th>${ui('玩家','Player')}</th><th>${all?ui('阵容数','Lineups'):ui('阵容','Lineup')}</th>${head}<th>${all?ui('合计评分','Total score'):ui('综合评分','Score')}</th></tr></thead><tbody>${body||`<tr><td colspan="9">${ui('该筛选下暂无阵容','No lineups for this filter')}</td></tr>`}</tbody></table></div>
    ${total>shown.length?`<button type="button" class="lsMore" data-ls-more>${ui('显示更多','Show more')}（${shown.length}/${total}）</button>`:`<div class="lsNote">${ui('共','Total')} ${total} ${all?ui('名玩家','players'):ui('支阵容','lineups')}</div>`}</div>`;
}
const HIDE=['#dtideMatrix','#dtideTableDownload','.dtideCreationFilter','#dtideRatioLegend'];
let savedTitle=null;
function apply(){
  const on=state.active;
  document.querySelectorAll('.dtideLeaderboardTab').forEach(x=>{if(on)x.setAttribute('aria-selected',String(x.hasAttribute('data-dtide-lowspec-tab')))});
  for(const sel of HIDE){const el=document.querySelector(sel);if(el)el.style.display=on?'none':''}
  const title=$('dtideMatrixTitle');
  if(title){if(on){if(savedTitle==null&&title.textContent!==ui('低配榜单','Low-investment Leaderboard'))savedTitle=title.textContent;title.textContent=ui('低配榜单','Low-investment Leaderboard')}else if(savedTitle!=null){title.textContent=savedTitle;savedTitle=null}}
  const host=$('dtideLowspec');if(host)host.hidden=!on;
}
async function activate(){
  // leave the battle-stats tab first (it listens to clicks on the other tabs)
  if(!$('dtideBattle')?.hidden)document.querySelector('[data-dtide-entity="character"]')?.click();
  state.active=true;state.limit=100;apply();
  const host=$('dtideLowspec');if(host)host.innerHTML=`<div class="dtideEmpty">${ui('正在读取…','Loading…')}</div>`;
  await load();render();
}
function deactivate(){if(!state.active)return;state.active=false;apply();const f=$('dtideEntityType');f?.dispatchEvent(new Event('change',{bubbles:true}))}
async function refreshTab(){
  const btn=document.querySelector('[data-dtide-lowspec-tab]');if(!btn)return;
  const key=seasonKey(stateOf());
  let ok=false;
  if(key){try{const r=await fetch(`data/morimens/eremora/lowspec/${key}.json`,{method:'HEAD',cache:'no-cache'});ok=r.ok}catch{}}
  btn.hidden=!ok;
  if(!ok&&state.active){state.active=false;apply()}
  else if(state.active){state.data=null;await load();render()}
}
function mount(){
  const tabs=document.querySelector('.dtideLeaderboardTabs');if(!tabs||tabs.querySelector('[data-dtide-lowspec-tab]'))return !!tabs;
  style();
  const b=document.createElement('button');b.type='button';b.className='dtideLeaderboardTab';b.setAttribute('data-dtide-lowspec-tab','');b.setAttribute('role','tab');b.setAttribute('aria-selected','false');b.hidden=true;b.textContent=ui('低配榜单','Low-investment');
  const anchor=tabs.querySelector('[data-dtide-battle-tab]')||tabs.querySelector('[data-dtide-entity="creation"]');anchor.after(b);
  const panel=document.createElement('div');panel.id='dtideLowspec';panel.className='dtideBattle';panel.hidden=true;($('dtideBattle')||$('dtideMatrix')).after(panel);
  $('dtideSeason')?.addEventListener('change',()=>{state.data=null;state.season=null;setTimeout(refreshTab,300)});
  refreshTab();
  return true;
}
document.addEventListener('click',e=>{
  if(e.target.closest?.('[data-dtide-lowspec-tab]')){if(!state.active)activate();return}
  if(state.active&&e.target.closest?.('[data-dtide-entity],[data-dtide-battle-tab]')){deactivate();return}
  const host=$('dtideLowspec');if(!host||!host.contains(e.target))return;
  const l=e.target.closest('[data-ls-list]');if(l){state.list=l.dataset.lsList;state.limit=100;render();return}
  const z=e.target.closest('button[data-ls-zone]');if(z){state.zone=Number(z.dataset.lsZone);state.limit=100;render();return}
  if(e.target.closest('[data-ls-more]')){state.limit+=100;render()}
});
document.addEventListener('change',e=>{
  const host=$('dtideLowspec');if(!host||!host.contains(e.target))return;
  const t=e.target;
  if(t.matches('[data-ls-diff]'))state.diff=Number(t.value);
  else if(t.matches('[data-ls-score]'))state.score=t.value;
  else if(t.matches('[data-ls-assist]'))state.noAssist=t.checked;
  else return;
  state.limit=100;render();
});
let tries=0;const iv=setInterval(()=>{if(mount()||++tries>120)clearInterval(iv)},500);
})();

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
  {key:'enl',cn:'总启灵数',en:'Total enlightenment',max:60,weight:1.5,tip:['4 名唤醒体启灵等级之和（3 = 3启，15 = +12）','Sum of the 4 members’ enlightenment levels (3 = E3, 15 = +12)']},
  {key:'lv',cn:'唤醒体等级',en:'Awakener level',weight:1.5,tip:['4 名唤醒体角色等级之和（单人最高 90）','Sum of the 4 members’ character levels (max 90 each)']},
  {key:'skill',cn:'技能总级别',en:'Skill levels',tip:['4 名唤醒体已解锁技能槽的等级之和','Sum of the unlocked skill-slot levels of the 4 members']},
  {key:'forge',cn:'灵塑适性',en:'Soulforge aptitude',max:40,tip:['4 名唤醒体灵塑适性等级之和（单人最高 10）','Sum of the members’ Soulforge aptitude levels (max 10 each)']},
  {key:'wheel',cn:'SSR命轮叠位',en:'SSR wheel stacks',tip:['队伍装备的 SSR 命轮等级（叠位）之和','Sum of the levels (stacks) of the equipped SSR wheels']},
  {key:'keeper',cn:'守密人等级',en:'Keeper level',tip:['该场战斗时玩家的守密人等级','The player’s keeper level in that battle']}
];
const state={season:null,data:null,loading:null,active:false,mode:'low',list:'score',dir:-1,diff:6,zone:1,skip:new Set(),noAssist:false,noPerm:false,noPermWheel:false,noGenWheel:false,limit:100,score:'all',count:'all',open:new Set()};
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
  .dtideLowspec .lsIncLbl{align-self:center;font-size:11px;color:#8fa0b5}.dtideLowspec th.lsOff,.dtideLowspec td.lsOff{opacity:.38}.dtideLowspec .lsNote{font-size:11px;line-height:1.7;color:#8c9aae;margin:6px 0 10px}
  .dtideLowspec table{width:100%;border-collapse:collapse;font-size:12px}.dtideLowspec th,.dtideLowspec td{padding:7px 8px;text-align:center;border-bottom:1px solid rgba(148,163,184,.1);vertical-align:middle}
  .dtideLowspec th{color:#9fb0c4;font-weight:600;white-space:nowrap}.dtideLowspec th button{all:unset;cursor:pointer;color:inherit;font:inherit}.dtideLowspec th button:hover{color:#f3dcab}.dtideLowspec td.lsName{text-align:left;min-width:120px}.dtideLowspec td.lsName small{display:block;color:#7f8da1;font-size:10px}
  .dtideLowspec .lsTeam{display:flex;gap:4px;justify-content:center}.dtideLowspec .lsTeam span{position:relative;display:block;width:34px;height:34px}.dtideLowspec .lsTeam img{width:34px;height:34px;border-radius:7px;object-fit:cover;background:#0b1220}
  .dtideLowspec .lsTeam span.b:after{content:'助';position:absolute;right:-2px;bottom:-2px;font-size:8px;background:#d7a85b;color:#1b1406;border-radius:4px;padding:0 2px}
  .dtideLowspec td small.x,.dtideLowspec td[style*=hsla] small{display:block;margin-top:1px;font-size:9px;font-weight:400;opacity:.78;white-space:nowrap}.dtideLowspec td.hl{color:#fff;font-weight:800}.dtideLowspec td[style*=hsla]{color:#f3f6fa;font-variant-numeric:tabular-nums}.dtideLowspec .lsScore{font-weight:800;color:#f1d69f;font-variant-numeric:tabular-nums}
  .dtideLowspec .lsMore{margin:10px auto;display:block;padding:7px 18px;border:1px solid rgba(215,168,91,.4);border-radius:9px;background:rgba(215,168,91,.08);color:#e8ca91;cursor:pointer}
    .dtideLowspec tr.lsRow{cursor:pointer}.dtideLowspec tr.lsRow:hover{background:rgba(255,255,255,.025)}.dtideLowspec tr.lsRow.open{background:rgba(215,168,91,.06)}
  .dtideLowspec td.lsName small{user-select:text}.dtideLowspec tr.lsDetail>td{padding:10px 8px;background:rgba(255,255,255,.02);text-align:left}
  .dtideLowspec .lsCard{margin:0 0 10px;padding:10px;border:1px solid rgba(148,163,184,.14);border-radius:11px;background:rgba(9,16,27,.55)}.dtideLowspec .lsCard:last-child{margin-bottom:0}
  .dtideLowspec .lsCardHd{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;margin-bottom:8px}.dtideLowspec .lsCardHd b{color:#ead9b9}.dtideLowspec .lsCardHd span{color:#9fb0c4;font-size:11px}.dtideLowspec .lsCardHd .btns{margin-left:auto;display:flex;gap:6px;align-items:center}
  .dtideLowspec .lsCardHd button,.dtideLowspec .lsLink{padding:4px 9px;border:1px solid rgba(215,168,91,.4);border-radius:7px;background:rgba(215,168,91,.08);color:#e8ca91;font-size:11px;text-decoration:none;cursor:pointer}
  .dtideLowspec .lsMems{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px}.dtideLowspec .lsMem{display:grid;grid-template-columns:44px minmax(0,1fr);gap:8px;padding:8px;border:1px solid rgba(148,163,184,.12);border-radius:9px;background:rgba(255,255,255,.02)}
  .dtideLowspec .lsMem.bor{border-color:rgba(215,168,91,.35)}.dtideLowspec .lsMem img{width:44px;height:44px;border-radius:8px;object-fit:cover;background:#0b1220}
  .dtideLowspec .lsMem b{display:block;font-size:12px;color:#edf2f7}.dtideLowspec .lsMem em{font-style:normal;font-size:9px;color:#1b1406;background:#d7a85b;border-radius:4px;padding:0 3px}
  .dtideLowspec .lsMem small{display:block;color:#8ea0b6;font-size:10px;line-height:1.5}.dtideLowspec .lsMem ul{margin:3px 0 0;padding:0;list-style:none;font-size:10px;color:#b9c5d4}.dtideLowspec .lsMem li.ssr{color:#f1d69f}.dtideLowspec .lsMem li b{display:inline;font-size:10px;color:inherit}
  @media(max-width:700px){.dtideLowspec table{display:block;overflow-x:auto}}`;
  document.head.appendChild(s);
}
function load(){
  const key=seasonKey(stateOf());
  if(!key)return Promise.resolve(null);
  if(state.season===key&&state.data)return Promise.resolve(state.data);
  if(state.loading&&state.loading.key===key)return state.loading.p;
  const p=lowspecPath(key).then(path=>path?fetch(path,{cache:'no-cache'}).then(r=>r.ok?r.json():null):null).catch(()=>null).then(d=>{state.season=key;state.data=d;state.loading=null;return d});
  state.loading={key,p};return p;
}
// per-member figures behind each lineup value (the filters about permanent Awakeners / wheels already applied)
const memberVals=(t,k)=>t[6].map(m=>{
  if(k==='enl')return state.noPerm&&state.data.aw[m[0]][4]?0:m[1];
  if(k==='lv')return m[9]||0;
  if(k==='skill')return m[2];
  if(k==='forge')return m[3];
  return (m[7]||[]).reduce((s,w)=>s+(w[2]>=1&&!(w[2]===2&&state.noPermWheel)&&!(w[2]===5&&state.noGenWheel)?w[1]:0),0);
});
const val=(t,k)=>k==='keeper'?(t[5]??0):memberVals(t,k).reduce((a,b)=>a+b,0);
const scoreOk=p=>{const s=state.score;if(s==='all')return true;if(s.includes(':')){const [a,b]=s.split(':').map(Number);return p[3]>=a&&p[3]<=b}return p[3]===Number(s)};
// percentile = share of the other lineups in the group that invest MORE (low mode) / LESS (high mode) than this one, ties count half
function percentiles(list){
  const n=list.length;
  for(const m of METRICS){
    const vs=list.map(r=>r.v[m.key]).sort((a,b)=>a-b),pos=new Map();
    for(const r of list){const v=r.v[m.key];if(!pos.has(v)){let lo=0,hi=n;while(lo<hi){const mid=(lo+hi)>>1;if(vs[mid]<v)lo=mid+1;else hi=mid}const a=lo;lo=a;hi=n;while(lo<hi){const mid=(lo+hi)>>1;if(vs[mid]<=v)lo=mid+1;else hi=mid}pos.set(v,[a,lo])}}
    for(const r of list){const [a,b]=pos.get(r.v[m.key]);const low=n>1?100*((n-b)+(b-a-1)/2)/(n-1):50;r['p_'+m.key]=state.mode==='high'?100-low:low}
  }
  const used=METRICS.filter(m=>!state.skip.has(m.key)),wsum=used.reduce((s,m)=>s+(m.weight??1),0);
  for(const r of list)r.index=used.reduce((s,m)=>s+(m.weight??1)*r['p_'+m.key],0)/wsum;
}
function lineups(d,filter,ignoreScore){
  const rows=[];
  for(const t of d.teams){
    const p=d.players[t[0]];
    if(state.zone===0&&!ignoreScore&&!scoreOk(p))continue;
    if(state.noAssist&&t[6].some(m=>m[5]))continue;
    if(!filter(t))continue;
    rows.push({t,p,v:Object.fromEntries(METRICS.map(m=>[m.key,val(t,m.key)])),mv:{enl:memberVals(t,'enl'),lv:memberVals(t,'lv'),forge:memberVals(t,'forge'),wheel:memberVals(t,'wheel')},cards:t[6].reduce((n,m)=>n+(m[6]||[]).length,0),lv:t[6].reduce((n,m)=>n+m[2],0)});
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
  // percentiles are taken against every player's lineups of the same zone and threat level (a score-filtered group is far too small: a lone lineup would score 100 everywhere); the score filter only picks the players shown
  const rows=lineups(d,()=>true,true),groups=new Map();
  for(const r of rows){const k=r.t[1]+'|'+r.t[2];(groups.get(k)||groups.set(k,[]).get(k)).push(r)}
  for(const g of groups.values())percentiles(g);
  const by=new Map();
  for(const r of rows){
    const o=by.get(r.t[0])||by.set(r.t[0],{p:r.p,n:0,m:0,index:0,items:[],cards:0,lv:0,v:{enl:0,lv:0,skill:0,forge:0,wheel:0,keeper:0}}).get(r.t[0]);
    o.n++;o.m+=r.t[6].length;o.index+=r.index;o.items.push(r);o.cards+=r.cards;o.lv+=r.lv;
    for(const k of ['enl','lv','skill','forge','wheel'])o.v[k]+=r.v[k];
    o.v.keeper+=r.v.keeper;
  }
  // averages are per Awakener (all members of all the player's lineups), so a different number of lineups does not matter; keeper level: mean over the lineups
  return [...by.values()].filter(o=>scoreOk(o.p)).map(o=>({...o,total:o.index,index:o.index/o.n,v:{enl:o.v.enl/o.m,lv:o.v.lv/o.m,skill:o.v.skill/o.m,forge:o.v.forge/o.m,wheel:o.v.wheel/o.m,keeper:o.v.keeper/o.n}}));
}
const nm=i=>{const s=(state.data.names||[])[i];return s?(zh()?s[1]:s[0]):''};
const diffName=i=>state.data.diffs[i];
function lineupCard(r){
  const d=state.data,t=r.t,p=r.p;
  const mem=t[6].map(m=>{
    const a=d.aw[m[0]],sl=(m[6]||[]).join('/'),wh=(m[7]||[]).map(w=>`<li class="${w[2]?'ssr':''}">${esc(nm(w[0]))} <b>${w[1]}</b></li>`).join(''),cv=(m[8]||[]).map(c=>`${esc(nm(c[0]))}×${c[1]}`).join(' · ');
    return `<div class="lsMem${m[5]?' bor':''}"><img src="${esc(a[3])}" alt="" loading="lazy"><div><b>${esc(zh()?a[2]:a[1])}${m[5]?` <em>${ui('助战','Assist')}</em>`:''}</b><small>Lv ${m[9]||'—'} · ${ui('启灵','Enl.')} ${m[1]} · ${ui('灵塑适性','Soulforge')} ${m[3]}/10</small><small>${ui('技能','Skills')} ${esc(sl)} (${m[2]})</small><ul>${wh}</ul>${cv?`<small>${esc(cv)}</small>`:''}</div></div>`}).join('');
  const code=t[7]||'';
  return `<div class="lsCard"><div class="lsCardHd"><b>${ui('第'+t[1]+'禁区','Zone '+t[1])} · ${ui('危险等级','Threat ')}${esc(diffName(t[2]))}${t[3]?ui(' · 额外队',' · extra team'):''}</b><span>${ui('守密人 Lv ','Keeper Lv ')}${t[5]??'—'}${t[4]!=null?` · ${t[4]}${ui('分','pts')}`:''}</span><span class="btns">${code?`<button type="button" class="dtideReplayCopy" data-replay-code="${esc(code)}" title="${esc(ui('复制 battleUuid，用于游戏内录像回放','Copy battleUuid for in-game replay'))}">${ui('复制录像回放','Copy Replay')}</button>`:''}<a class="lsLink" href="https://eremora.com/u/${esc(p[0])}/challenges/dzone/${state.season}" target="_blank" rel="noopener noreferrer">${ui('Eremora 队伍','Eremora Teams')} ↗</a></span></div><div class="lsMems">${mem}</div></div>`;
}
function render(){
  const host=$('dtideLowspec');if(!host||!state.active)return;
  apply();
  const d=state.data;
  if(!d){host.innerHTML=`<div class="dtideEmpty">${ui('当前期次暂无低配榜单数据。','No low-investment data for this season yet.')}</div>`;return}
  const all=state.zone===0,L=state.list,high=state.mode==='high';
  let rows=all?playerRows(d):zoneRows(d);
  const counts=all?[...new Set(rows.map(r=>r.n))].sort((a,b)=>a-b):[];
  if(all&&state.count!=='all'&&!counts.includes(Number(state.count)))state.count='all';
  if(all&&state.count!=='all')rows=rows.filter(r=>r.n===Number(state.count));
  const pidx=r=>all?r.p:r.p;
  const D=state.dir;
  rows.sort((a,b)=>(L==='score'?D*(a.index-b.index):D*(a.v[L]-b.v[L]))||b.index-a.index||pidx(a)[2]-pidx(b)[2]);
  const total=rows.length,shown=rows.slice(0,state.limit);
  // heat map: blue = little investment, red = a lot (per column, over every row of the current filter); the score column uses the same orientation
  const range={};for(const m of METRICS){let lo=Infinity,hi=-Infinity;for(const r of rows){const v=r.v[m.key];if(v<lo)lo=v;if(v>hi)hi=v}range[m.key]=[lo,hi]}
  const heat=x=>`background:hsla(${Math.round(215-215*x)},72%,45%,${(.14+.42*x).toFixed(2)})`;
  const heatOf=(k,v)=>{const [lo,hi]=range[k];return heat(hi>lo?(v-lo)/(hi-lo):0)};
  const lbl=m=>zh()?m.cn:m.en;
  const diffOpts=d.diffs.map((n,i)=>`<option value="${i}"${i===state.diff?' selected':''}>${ui('危险等级','Threat ')}${n}</option>`).reverse().join('');
  const zoneTabs=[0,1,2,3,4,5].map(z=>`<button type="button" data-ls-zone="${z}" aria-pressed="${z===state.zone}">${z?ui(`第${z}禁区`,`Zone ${z}`):ui('全部禁区（玩家合计）','All zones (player total)')}</button>`).join('');
  // score filter: every exact score of the season's players
  const cnt=new Map();for(const p of d.players)cnt.set(p[3],(cnt.get(p[3])||0)+1);
  const exact=[...cnt].sort((a,b)=>b[0]-a[0]).map(([s,c])=>`<option value="${s}"${String(state.score)===String(s)?' selected':''}>${s}${ui(' 分（',' pts (')}${c}${ui(' 人）',' players)')}</option>`).join('');
  const scoreSel=`<option value="all">${ui('全部分数','All scores')}</option>${exact}`;
  const arrow=k=>k===L?(D>0?' ↑':' ↓'):' ↕';
  const head=METRICS.map(m=>`<th class="${state.skip.has(m.key)?'lsOff':''}" title="${esc(ui(m.tip[0],m.tip[1]))}"><button type="button" class="dtideSortHead" data-ls-sort="${m.key}">${esc(lbl(m))}${all?ui('（人均）',' (per Awakener)'):''}${arrow(m.key)}</button></th>`).join('');
  const body=shown.map((r,i)=>{
    const p=r.p,fmt=x=>Number.isInteger(x)?x:x.toFixed(all?2:1),sub1=k=>{
      if(k==='keeper')return '';
      if(k==='skill')return `<small>${ui('均 ','avg ')}${r.cards?(r.lv/r.cards).toFixed(2):'—'}${ui(' /张',' per card')}</small>`;
      return all?`<small>${ui('合计 ','sum ')}${r.items.reduce((s,x)=>s+x.v[k],0)}</small>`:`<small>${r.mv[k].join('+')}</small>`;
    },
    cells=METRICS.map(m=>`<td class="${L===m.key?'hl':''}${state.skip.has(m.key)?' lsOff':''}" style="${heatOf(m.key,r.v[m.key])}">${fmt(r.v[m.key])}${sub1(m.key)}</td>`).join('');
    const key=all?'p'+p[0]:p[0]+'|'+r.t[1]+'|'+r.t[3],open=state.open.has(key);
    let mid,sub;
    if(all){mid=`<td>${r.n}</td>`;sub=`${ui('榜单第','Rank #')}${p[2]}${ui('名 · ',' · ')}${p[3]}${ui('分','pts')}`}
    else{const t=r.t,team=t[6].map(m=>{const a=d.aw[m[0]];return `<span class="${m[5]?'b':''}" title="${esc(zh()?a[2]:a[1])}"><img src="${esc(a[3])}" alt="" loading="lazy"></span>`}).join('');
      mid=`<td><div class="lsTeam">${team}</div></td>`;sub=`${ui('榜单第','Rank #')}${p[2]}${ui('名 · ',' · ')}${p[3]}${ui('分','pts')}${t[3]?ui(' · 额外队',' · extra'):''}`}
    const tr=`<tr class="lsRow${open?' open':''}" data-ls-key="${esc(key)}" title="${esc(ui('点击展开详细阵容','Click for the full lineup'))}"><td>${i+1}</td><td class="lsName">${esc(p[1])}<small>UID ${esc(p[0])}</small><small>${sub}</small></td>${mid}${cells}<td class="lsScore${L==='score'?' hl':''}" style="${heat(1-r.index/100)}"${all?` title="${esc(ui('各阵容评分合计 ','Sum of lineup scores '))}${r.total.toFixed(1)}"`:''}>${r.index.toFixed(1)}</td></tr>`;
    const detail=open?`<tr class="lsDetail"><td colspan="10">${all?r.items.slice().sort((x,y)=>x.t[1]-y.t[1]||x.t[3]-y.t[3]).map(lineupCard).join(''):lineupCard(r)}</td></tr>`:'';
    return tr+detail;
  }).join('');
  const noteAll=zh()
    ?`每个禁区、每个难度里，阵容（含额外队伍）互相比较投入；玩家的各阵容评分取平均；各项数值按每名唤醒体平均（合计 ÷ 阵容数×4，技能小字为每张技能卡平均），守密人等级取各阵容的平均，${high?'越高越“高配”':'越高越“低配”'}；可再按阵容数筛选。单项榜按该项人均值${high?'从高到低':'从低到高'}排序。`
    :`In every zone and threat level the lineups (extra teams included) are compared on investment; a player’s lineup scores are averaged; the figures are per Awakener (total ÷ lineups × 4, skill small print: per skill card) and keeper level is the mean over the lineups; ${high?'higher = higher investment':'higher = lower investment'}; you can also filter by lineup count. Sorting a column uses its per-Awakener value, from ${high?'high to low':'low to high'}.`;
  const noteZone=zh()
    ?`统计同一禁区、同一难度通关的阵容（含额外队伍）：投入越${high?'多':'少'}排名越靠前。综合评分 = 五项投入在该组阵容中的百分位平均（0–100，越高越“${high?'高配':'低配'}”）；单项榜按该项数值从${high?'高到低':'低到高'}排序。`
    :`Lineups (extra teams included) that cleared the same zone and threat level are compared: the ${high?'more':'less'} they invest, the higher they rank. Overall score = average percentile of the five investments within the group (0–100, higher = ${high?'higher':'lower'} investment); single lists sort that figure from ${high?'high to low':'low to high'}. `;
  const usedM=METRICS.filter(m=>!state.skip.has(m.key)),wTot=usedM.reduce((s,m)=>s+(m.weight??1),0),wTxt=usedM.map(m=>`${lbl(m)} ${Math.round(100*(m.weight??1)/wTot)}%`).join(zh()?'，':', ');
  const hint=zh()?'综合评分只计入勾选的项目，权重：'+wTxt+'（总启灵数略高，其余相同）。热力图：蓝色 = 投入少，红色 = 投入多（按当前筛选内的各列最小 / 最大值着色）。点击表头可按该列升序 / 降序排列；综合评分升序即“高配”（投入最多）。':'The overall score only counts the ticked items, weights: '+wTxt+' (total enlightenment slightly higher, the rest equal). Heat map: blue = little investment, red = a lot (per column, over the current filter). Click a column header to sort ascending / descending; ascending overall score = high investment.';
  const note=(all?noteAll:noteZone)+' '+hint;
  host.innerHTML=`<div class="dtideLowspec">
    <div class="lsTabs">${zoneTabs}</div>
    <div class="lsNote">${note}</div>
    <div class="lsTabs lsInc"><span class="lsIncLbl">${ui('评分计入：','Score counts:')}</span>${METRICS.map(m=>`<button type="button" data-ls-inc="${m.key}" aria-pressed="${!state.skip.has(m.key)}" title="${esc(ui(m.tip[0],m.tip[1]))}">${esc(lbl(m))}</button>`).join('')}</div>
    <div class="lsBar">${all?'':`<label>${ui('难度','Threat level')}<select data-ls-diff>${diffOpts}</select></label>`}${all?`<label>${ui('玩家总分','Player score')}<select data-ls-score>${scoreSel}</select></label>`:''}
    ${all?`<label>${ui('阵容数','Lineups')}<select data-ls-count><option value="all">${ui('不限','Any')}</option>${counts.map(c=>`<option value="${c}"${String(state.count)===String(c)?' selected':''}>${c}${ui(' 个阵容',' lineups')}</option>`).join('')}</select></label>`:''}<label class="lsChk" title="${esc(ui('常驻角色（常驻池 20 名 + 福利 SR 4 名）的启灵不计入总启灵数','Enlightenment of permanent Awakeners (20 standard-banner + 4 welfare SR) is left out of the total'))}"><input type="checkbox" data-ls-perm${state.noPerm?' checked':''}> ${ui('总启灵数不计常驻角色','Total enlightenment: skip permanent Awakeners')}</label><label class="lsChk" title="${esc(ui('常驻命轮（常驻角色的专属 SSR 命轮）的叠位不计入 SSR 命轮叠位','Stacks of permanent wheels (exclusive SSR wheels of permanent Awakeners) are left out'))}"><input type="checkbox" data-ls-permwheel${state.noPermWheel?' checked':''}> ${ui('命轮叠位不计常驻命轮','Wheel stacks: skip permanent wheels')}</label><label class="lsChk" title="${esc(ui('通用命轮 = 没有专属角色的 SSR 命轮，包含纪行命轮、赠送命轮，以及数据里无法判定来源的命轮','Generic wheels = SSR wheels without an exclusive Awakener: pass / archive and gifted wheels plus any whose source cannot be told'))}"><input type="checkbox" data-ls-genwheel${state.noGenWheel?' checked':''}> ${ui('命轮叠位不计通用命轮','Wheel stacks: skip generic wheels')}</label><label class="lsChk"><input type="checkbox" data-ls-assist${state.noAssist?' checked':''}> ${ui('排除含助战角色的阵容','Exclude lineups with a borrowed Awakener')}</label></div>
    <div class="dtideScroll"><table><thead><tr><th>#</th><th>${ui('玩家','Player')}</th><th>${all?ui('阵容数','Lineups'):ui('阵容','Lineup')}</th>${head}<th title="${esc(ui('五项投入的百分位加权平均（启灵 27%，其余四项各 18%）：越高越“低配”；升序即高配','Weighted average of the five investment percentiles (enlightenment 27%, the other four 18% each): higher = lower investment; ascending = high investment'))}"><button type="button" class="dtideSortHead" data-ls-sort="score">${all?ui('平均评分','Avg score'):ui('综合评分','Score')}${arrow('score')}</button></th></tr></thead><tbody>${body||`<tr><td colspan="10">${ui('该筛选下暂无阵容','No lineups for this filter')}</td></tr>`}</tbody></table></div>
    ${total>shown.length?`<button type="button" class="lsMore" data-ls-more>${ui('显示更多','Show more')}（${shown.length}/${total}）</button>`:`<div class="lsNote">${ui('共','Total')} ${total} ${all?ui('名玩家','players'):ui('支阵容','lineups')}</div>`}</div>`;
}
const titleOf=()=>state.mode==='high'?ui('高配榜单','High-investment Leaderboard'):ui('低配榜单','Low-investment Leaderboard');
const HIDE=['#dtideMatrix','#dtideTableDownload','.dtideCreationFilter','#dtideRatioLegend'];
let savedTitle=null;
function apply(){
  const on=state.active;
  document.querySelectorAll('.dtideLeaderboardTab').forEach(x=>{if(on)x.setAttribute('aria-selected',String(x.hasAttribute('data-dtide-lowspec-tab')&&(x.dataset.dtideLowspecTab||'low')===state.mode))});
  for(const sel of HIDE){const el=document.querySelector(sel);if(el)el.style.display=on?'none':''}
  const title=$('dtideMatrixTitle');
  if(title){if(on){if(savedTitle==null&&title.textContent!==ui('低配榜单','Low-investment Leaderboard')&&title.textContent!==ui('高配榜单','High-investment Leaderboard'))savedTitle=title.textContent;title.textContent=titleOf()}else if(savedTitle!=null){title.textContent=savedTitle;savedTitle=null}}
  const host=$('dtideLowspec');if(host)host.hidden=!on;
}
async function activate(mode){
  state.mode=mode||'low';
  // leave the battle-stats tab first (it listens to clicks on the other tabs)
  if(!$('dtideBattle')?.hidden)document.querySelector('[data-dtide-entity="character"]')?.click();
  state.active=true;state.limit=100;apply();
  const host=$('dtideLowspec');if(host)host.innerHTML=`<div class="dtideEmpty">${ui('正在读取…','Loading…')}</div>`;
  await load();render();
}
function deactivate(){if(!state.active)return;state.active=false;apply();const f=$('dtideEntityType');f?.dispatchEvent(new Event('change',{bubbles:true}))}
let manifestPromise=null;
const lowspecPath=async key=>{
  try{manifestPromise=manifestPromise||fetch('data/morimens/eremora/manifest.json',{cache:'no-cache'}).then(r=>r.json());
    const m=await manifestPromise;const e=(m.availableSeasons||[]).find(x=>String(x.seasonId)===String(key)&&!x.snapshotId&&!x.aggregatePath);return e?.lowspecPath||null}catch{manifestPromise=null;return null}
};
let lastKey=null;
async function refreshTab(){
  const btns=[...document.querySelectorAll('[data-dtide-lowspec-tab]')];if(!btns.length)return;
  const key=seasonKey(stateOf());lastKey=key;
  const ok=!!(key&&await lowspecPath(key));
  btns.forEach(b=>{b.hidden=!ok});
  if(!ok&&state.active){state.active=false;apply()}
  else if(state.active){state.data=null;await load();render()}
}
// other renderers rewrite the matrix title on every redraw: keep ours while the tab is open
let titleWatch=null;
function watchTitle(){
  const title=$('dtideMatrixTitle');if(!title||titleWatch)return;
  titleWatch=new MutationObserver(()=>{if(state.active&&title.textContent!==titleOf()){savedTitle=null;title.textContent=titleOf()}});
  titleWatch.observe(title,{childList:true,characterData:true,subtree:true});
}
function mount(){
  watchTitle();
  const tabs=document.querySelector('.dtideLeaderboardTabs');if(!tabs||tabs.querySelector('[data-dtide-lowspec-tab]'))return !!tabs;
  style();
  const mk=(mode,cn,en)=>{const b=document.createElement('button');b.type='button';b.className='dtideLeaderboardTab';b.setAttribute('data-dtide-lowspec-tab',mode);b.setAttribute('role','tab');b.setAttribute('aria-selected','false');b.hidden=true;b.textContent=ui(cn,en);return b};
  const low=mk('low','低配榜单','Low-investment');
  const anchor=tabs.querySelector('[data-dtide-battle-tab]')||tabs.querySelector('[data-dtide-entity="creation"]');anchor.after(low);
  const panel=document.createElement('div');panel.id='dtideLowspec';panel.className='dtideBattle';panel.hidden=true;($('dtideBattle')||$('dtideMatrix')).after(panel);
  $('dtideSeason')?.addEventListener('change',()=>{state.data=null;state.season=null;setTimeout(refreshTab,300)});
  refreshTab();
  return true;
}
document.addEventListener('click',e=>{
  const lt=e.target.closest?.('[data-dtide-lowspec-tab]');if(lt){const mode=lt.dataset.dtideLowspecTab||'low';if(!state.active)activate(mode);else if(state.mode!==mode){state.mode=mode;state.limit=100;apply();render()}return}
  if(state.active&&e.target.closest?.('[data-dtide-entity],[data-dtide-battle-tab]')){deactivate();return}
  const host=$('dtideLowspec');if(!host||!host.contains(e.target))return;
  const l=e.target.closest('[data-ls-sort]');if(l){const k=l.dataset.lsSort;if(state.list===k)state.dir=-state.dir;else{state.list=k;state.dir=k==='score'?-1:1}state.limit=100;render();return}
  const row=e.target.closest('tr[data-ls-key]');if(row&&!e.target.closest('a,button')){const k=row.dataset.lsKey;if(state.open.has(k))state.open.delete(k);else state.open.add(k);render();return}
  const inc=e.target.closest('button[data-ls-inc]');if(inc){const k=inc.dataset.lsInc;if(state.skip.has(k))state.skip.delete(k);else if(state.skip.size<METRICS.length-1)state.skip.add(k);if(state.skip.has(state.list))state.list='score',state.dir=-1;render();return}
  const z=e.target.closest('button[data-ls-zone]');if(z){state.zone=Number(z.dataset.lsZone);state.limit=100;render();return}
  if(e.target.closest('[data-ls-more]')){state.limit+=100;render()}
});
document.addEventListener('change',e=>{
  const host=$('dtideLowspec');if(!host||!host.contains(e.target))return;
  const t=e.target;
  if(t.matches('[data-ls-diff]'))state.diff=Number(t.value);
  else if(t.matches('[data-ls-score]'))state.score=t.value;
  else if(t.matches('[data-ls-count]'))state.count=t.value;
  else if(t.matches('[data-ls-assist]'))state.noAssist=t.checked;
  else if(t.matches('[data-ls-perm]'))state.noPerm=t.checked;
  else if(t.matches('[data-ls-permwheel]'))state.noPermWheel=t.checked;
  else if(t.matches('[data-ls-genwheel]'))state.noGenWheel=t.checked;
  else return;
  state.limit=100;render();
});
// the season select is filled after this module starts and may change without a change event: follow it
setInterval(()=>{const k=seasonKey(stateOf());if(document.querySelector('[data-dtide-lowspec-tab]')&&k!==lastKey)refreshTab()},700);
let tries=0;const iv=setInterval(()=>{if(mount()||++tries>120)clearInterval(iv)},500);
})();

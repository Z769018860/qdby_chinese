(()=>{
'use strict';
// "主线困难榜单": statistics of the public clears (battle replays) of the hard main-story stages, one column per stage like the D-Zone zones.
// Data: data/morimens/mainhard/index.json built by scripts/build_main_hard.py (levels / keeper skill from the review list,
// keeper level + enlightenment + soulforge from the replay cache of scripts/fetch_main_hard_detail.py),
// data/morimens/mainhard/gear.json built by scripts/build_main_hard_gear.py (Wheels / Covenants of the same Awakener in the D-Zone records).
if(window.__morimensMainHard)return;
window.__morimensMainHard=true;
const TAB_ID='morimensMainHardTab',PANEL_ID='morimensMainHardPanel',HASH='#mainhard',DATA='data/morimens/mainhard/index.json',GEAR='data/morimens/mainhard/gear.json';
const zh=()=>localStorage.getItem('morimens.language')!=='en';
const ui=(cn,en)=>zh()?cn:en;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=id=>document.getElementById(id);
const state={mounted:false,data:null,gear:null,gearLoading:null,view:'chars',stage:'all',sort:{chars:['total',-1],toks:['total',-1],low:['pot',1]},limit:100,lowLimit:20,open:new Set(),error:null};
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
  .mh tr.mhRow{cursor:pointer}.mh tr.mhRow:hover{background:rgba(255,255,255,.025)}.mh tr.mhRow.open{background:rgba(215,168,91,.06)}
  .mh tr.mhDetail>td{padding:10px 8px;background:rgba(255,255,255,.02);text-align:left}
  .mh .mhCard{margin:0 0 10px;padding:10px;border:1px solid rgba(148,163,184,.14);border-radius:11px;background:rgba(9,16,27,.55)}.mh .mhCard:last-child{margin-bottom:0}
  .mh .mhCardHd{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center;margin-bottom:8px}.mh .mhCardHd b{color:#ead9b9}.mh .mhCardHd span{color:#9fb0c4;font-size:11px}.mh .mhCardHd .btns{margin-left:auto;display:flex;gap:6px;align-items:center}.mh .mhCardHd .mhTok{display:inline-flex;align-items:center;gap:5px;color:#c9d3df}.mh .mhCardHd .mhTok img{width:20px;height:20px;border-radius:5px;background:#0b1220}
  .mh .mhCardHd button,.mh .mhLink{padding:4px 9px;border:1px solid rgba(215,168,91,.4);border-radius:7px;background:rgba(215,168,91,.08);color:#e8ca91;font-size:11px;text-decoration:none;cursor:pointer}
  .mh .mhMems{display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:8px}.mh .mhMem{display:grid;grid-template-columns:44px minmax(0,1fr);gap:8px;padding:8px;border:1px solid rgba(148,163,184,.12);border-radius:9px;background:rgba(255,255,255,.02)}
  .mh .mhMem>img{width:44px;height:44px;border-radius:8px;object-fit:cover;background:#0b1220}.mh .mhMem b{display:block;font-size:12px;color:#edf2f7}.mh .mhMem small{display:block;color:#8ea0b6;font-size:11px;line-height:1.55}
  .mh .mhMem ul{margin:4px 0 0;padding:0;list-style:none;font-size:11px;color:#b9c5d4}.mh .mhMem li{display:flex;align-items:center;gap:4px;line-height:1.5}.mh .mhMem li img{width:16px;height:16px;border-radius:4px;background:#0b1220;object-fit:cover;object-position:50% 18%;flex:0 0 auto}.mh .mhMem li b{display:inline;font-size:11px;color:#f1d69f}
  .mh .mhSrc{font-size:10px;color:#71809a;line-height:1.6;margin-top:8px}
  .mh .mhSubHd{display:flex;align-items:baseline;gap:8px;margin:16px 0 4px}.mh .mhSubHd b{font-size:13px;color:#e6d3ae}.mh .mhSubHd small{font-size:10px;color:#7f8da1}
  .mh .mhPot{color:#8fd6a8;font-weight:700}.mh .mhNa{color:#6d7c90}
  @media(max-width:700px){.mh{padding:14px 10px}}`;
  document.head.appendChild(s);
}
const heat=(v,max)=>{const t=max>0?Math.max(0,Math.min(1,v/max)):0;return `background:hsla(${Math.round(215-215*t)},72%,45%,${(.1+.45*t).toFixed(2)})`};
const pct=x=>(x*100).toFixed(1)+'%';
const nameOf=a=>zh()?a[2]:a[1];
const tokName=t=>t?(zh()?t[1]:t[0]):'—';
const portrait=(a,lv)=>`<span title="${esc(nameOf(a))}${lv?' Lv.'+lv:''}"><img src="${esc(a[3])}" alt="" loading="lazy">${lv?`<em>${lv}</em>`:''}</span>`;
const memPot=r=>r[5].map(m=>m[2]);
const potKnown=r=>r[5].every(m=>m[2]!=null);
const potSum=r=>r[5].reduce((s,m)=>s+(m[2]||0),0);
const lvSum=r=>r[5].reduce((s,m)=>s+(m[1]||0),0);
const avg=(a)=>{const v=a.filter(x=>x!=null);return v.length?v.reduce((s,x)=>s+x,0)/v.length:null};

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
      for(const k of keys){m.set(k,(m.get(k)||0)+1);const g=agg.get(k)||{n:0,lvSum:0,lvN:0,potSum:0,potN:0};g.n++;agg.set(k,g)}
      if(isChars)for(const a of r[5]){const g=agg.get(a[0]);g.lvSum+=a[1];g.lvN++;if(a[2]!=null){g.potSum+=a[2];g.potN++}}
    }
    per[si]={m,n:st.reviews.length};
  });
  let rows=[...agg.keys()].map(k=>({k,total:agg.get(k).n/total,avgLv:agg.get(k).lvN?agg.get(k).lvSum/agg.get(k).lvN:0,avgPot:agg.get(k).potN?agg.get(k).potSum/agg.get(k).potN:null,cells:stages.map((s,i)=>per[i].n?(per[i].m.get(k)||0)/per[i].n:0),cnt:agg.get(k).n}));
  const [sk,dir]=state.sort[kind];
  const val=r=>sk==='total'?r.total:sk==='lv'?r.avgLv:sk==='pot'?(r.avgPot??-1):sk==='name'?0:r.cells[Number(sk)];
  rows.sort((a,b)=>dir*(val(a)-val(b))||b.total-a.total);
  const max=stages.map((_,i)=>Math.max(0,...rows.map(r=>r.cells[i]))),maxT=Math.max(0,...rows.map(r=>r.total));
  const arrow=k=>String(state.sort[kind][0])===String(k)?(state.sort[kind][1]>0?' ↑':' ↓'):' ↕';
  const head=`<th>${isChars?ui('角色','Awakener'):ui('钥令','Keeper skill')}</th>${stages.map((s,i)=>`<th title="${esc(stageLabel(s,true))}"><button type="button" data-mh-sort="${kind}|${i}">H${s.chapter}-${s.stage}${arrow(i)}</button></th>`).join('')}<th><button type="button" data-mh-sort="${kind}|total">${ui('汇总','All')}${arrow('total')}</button></th>${isChars?`<th><button type="button" data-mh-sort="${kind}|lv">${ui('平均等级','Avg Lv')}${arrow('lv')}</button></th><th><button type="button" data-mh-sort="${kind}|pot">${ui('平均启灵','Avg Enl.')}${arrow('pot')}</button></th>`:''}<th>${ui('次数','Clears')}</th>`;
  const body=rows.map(r=>{
    const e=isChars?d.aw[r.k]:d.tk[r.k];
    const nm=isChars?nameOf(e):tokName(e),img=e&&e[isChars?3:2];
    return `<tr><td class="mhName">${img?`<img src="${esc(img)}" alt="" loading="lazy">`:''}${esc(nm)}</td>${r.cells.map((v,i)=>`<td style="${heat(v,max[i])}">${v?pct(v):'—'}</td>`).join('')}<td style="${heat(r.total,maxT)}"><b>${pct(r.total)}</b></td>${isChars?`<td>${r.avgLv.toFixed(1)}</td><td>${r.avgPot==null?'—':r.avgPot.toFixed(1)}</td>`:''}<td>${r.cnt}</td></tr>`}).join('');
  return `<div class="mhScroll"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}
function detailHtml(st,r){
  const d=state.data,p=d.players[r[0]],tk=r[4]>=0?d.tk[r[4]]:null,g=state.gear&&state.gear.map;
  const mems=r[5].map(m=>{
    const a=d.aw[m[0]],gid=a[4],rec=g&&g[p[0]+'|'+gid];
    const wh=rec?rec[1].map(w=>{const ww=state.gear.wh[w[0]]||['',''];return `<li><img src="${esc(ww[2])}" alt="" loading="lazy" onerror="this.hidden=true">${esc(ww[1])} <b>${ui('叠','x')}${w[1]}</b></li>`}).join(''):'';
    const cv=rec?rec[2].map(c=>{const cc=state.gear.cv[c[0]]||['',''];return `${esc(cc[1])}×${c[1]}`}).join(' · '):'';
    const pot=m[2]==null?ui('启灵未公开','Enl. n/a'):ui('启灵 ','Enl. ')+(m[2]>0?'+'+m[2]:'0');
    return `<div class="mhMem"><img src="${esc(a[3])}" alt="" loading="lazy"><div><b>${esc(nameOf(a))}</b><small>Lv ${m[1]||'—'} · ${pot}${m[3]!=null?ui(' · 灵塑 '+m[3],' · Soulforge '+m[3]):''}</small>${wh?`<ul>${wh}</ul>`:''}${cv?`<small>${ui('密契','Covenant')}：${cv}</small>`:''}${!rec?`<small class="mhNa">${ui('命轮 / 密契未公开','Wheels / Covenants not published')}</small>`:''}</div></div>`}).join('');
  const gearSrc=r[5].map(m=>{const rec=g&&g[p[0]+'|'+d.aw[m[0]][4]];return rec?rec[0]:null}).filter(Boolean);
  const season=gearSrc.length?Math.max(...gearSrc):null;
  const srcTxt=season
    ?ui('启灵 / 灵塑 / 守密人等级取自这次通关的回放。游戏公开的主线困难回顾不含装备，这里的命轮与密契来自该玩家融灾记录（最新第 '+season+' 期）里的同一角色，融灾只带 2 个命轮，且未必等于这次通关的配装，只作养成参考。','Enlightenment / Soulforge / keeper level come from the replay of this clear. The public review of a hard main-story stage carries no equipment, so the Wheels / Covenants are taken from the same Awakener in the D-Zone record of the same player (newest recorded season '+season+', D-Zone allows 2 Wheels). They may differ from this clear and are a reference only.')
    :ui('启灵 / 灵塑 / 守密人等级取自这次通关的回放。游戏公开的主线困难回顾不含装备，而该玩家在融灾记录里也没有这几名角色的出战数据，命轮与密契无从推断，所以显示「未公开」。','Enlightenment / Soulforge / keeper level come from the replay of this clear. The public review of a hard main-story stage carries no equipment, and this player has no D-Zone record for these Awakeners, so Wheels and Covenants are unknown here.');
  return `<div class="mhCard"><div class="mhCardHd"><b>${esc(stageLabel(st,true))}</b><span>${ui('回合','Rounds')} ${r[1]}</span><span>${ui('守密人 Lv','Keeper Lv')} ${r[6]??'—'}</span><span class="mhTok">${tk&&tk[2]?`<img src="${esc(tk[2])}" alt="" loading="lazy">`:''}${esc(tokName(tk))}</span><span class="btns"><button type="button" class="mhCopy" data-replay-code="${esc(r[3])}" title="${esc(ui('复制 battleUuid，用于游戏内录像回放','Copy battleUuid for in-game replay'))}">${ui('复制回放码','Copy replay')}</button><a class="mhLink" href="https://eremora.com/u/${esc(p[0])}" target="_blank" rel="noopener noreferrer">Eremora ↗</a></span></div><div class="mhMems">${mems}</div><div class="mhSrc">${srcTxt}</div></div>`;
}
function rowDetail(st,r,cols){return `<tr class="mhDetail" data-detail-for="${esc(r[3])}"><td colspan="${cols}">${detailHtml(st,r)}</td></tr>`}
function fastTable(){
  const d=state.data,scope=stagesInScope();
  const rows=[];
  for(const st of scope)for(const r of st.reviews)if(r[1]>0)rows.push({st,r});
  rows.sort((a,b)=>a.r[1]-b.r[1]||a.r[2]-b.r[2]);
  const shown=rows.slice(0,state.limit),cols=9;
  const body=shown.map((x,i)=>{const r=x.r,p=d.players[r[0]],tk=r[4]>=0?d.tk[r[4]]:null,open=state.open.has(r[3]);
    return `<tr class="mhRow${open?' open':''}" data-mh-row="${esc(r[3])}"><td>${i+1}</td><td class="mhName">${esc(p[1])}<br><small style="color:#7f8da1">UID ${esc(p[0])}</small></td><td>H${x.st.chapter}-${x.st.stage}<br><small style="color:#7f8da1">${esc(x.st.name)}</small></td><td><b>${r[1]}</b></td><td><div class="mhTeam">${r[5].map(a=>portrait(d.aw[a[0]],a[1])).join('')}</div></td><td>${esc(tokName(tk))}</td><td>${r[6]??'—'}</td><td class="mhPot">${potKnown(r)?potSum(r):'—'}</td><td><div class="mhBtns"><button type="button" class="mhCopy" data-replay-code="${esc(r[3])}" title="${esc(ui('复制 battleUuid，用于游戏内录像回放','Copy battleUuid for in-game replay'))}">${ui('复制回放','Copy replay')}</button><span class="mhLink">${open?ui('收起','Hide'):ui('详情','Details')}</span></div></td></tr>${open?rowDetail(x.st,r,cols):''}`}).join('');
  return `<div class="mhScroll"><table><thead><tr><th>#</th><th>${ui('玩家','Player')}</th><th>${ui('关卡','Stage')}</th><th>${ui('回合','Rounds')}</th><th>${ui('配队（等级）','Team (level)')}</th><th>${ui('钥令','Keeper skill')}</th><th>${ui('守密人','Keeper')}</th><th>${ui('启灵合计','Σ Enl.')}</th><th></th></tr></thead><tbody>${body}</tbody></table></div>${rows.length>shown.length?`<button type="button" class="mhMore" data-mh-more>${ui('显示更多','Show more')}（${shown.length}/${rows.length}）</button>`:''}`;
}
function lowRows(st){
  const key=state.sort.low[0],dir=state.sort.low[1],val=r=>key==='lv'?lvSum(r):key==='round'?r[1]:potSum(r);
  return st.reviews.filter(r=>r[1]>0&&(key!=='pot'||potKnown(r))).sort((a,b)=>dir*(val(a)-val(b))||lvSum(a)-lvSum(b)||a[1]-b[1]);
}
function lowRow(st,r,i){
  const d=state.data,p=d.players[r[0]],tk=r[4]>=0?d.tk[r[4]]:null,open=state.open.has(r[3]);
  const ps=potSum(r),ls=lvSum(r),known=potKnown(r);
  const potCell=known?`<span class="mhPot">${ps}</span><br><small style="color:#7f8da1;font-weight:400">${ui('均','avg')} ${(ps/4).toFixed(1)}</small>`:`<span class="mhNa">—</span>`;
  return `<tr class="mhRow${open?' open':''}" data-mh-row="${esc(r[3])}"><td>${i+1}</td><td class="mhName">${esc(p[1])}<br><small style="color:#7f8da1">UID ${esc(p[0])} · ${ui('守密人','Keeper')} Lv ${r[6]??'—'}</small></td><td>H${st.chapter}-${st.stage}</td><td><div class="mhTeam">${r[5].map(a=>portrait(d.aw[a[0]],a[1])).join('')}</div></td><td>${potCell}</td><td>${ls}</td><td>${r[1]}</td><td>${esc(tokName(tk))}</td><td><div class="mhBtns"><button type="button" class="mhCopy" data-replay-code="${esc(r[3])}">${ui('复制回放','Copy replay')}</button><span class="mhLink">${open?ui('收起','Hide'):ui('详情','Details')}</span></div></td></tr>${open?rowDetail(st,r,9):''}`;
}
function lowTable(){
  const scope=stagesInScope(),head=`<tr><th>#</th><th>${ui('玩家','Player')}</th><th>${ui('关卡','Stage')}</th><th>${ui('配队（等级）','Team (level)')}</th><th>${ui('启灵合计','Σ Enl.')}</th><th>${ui('等级合计','Σ Lv')}</th><th>${ui('回合','Rounds')}</th><th>${ui('钥令','Keeper skill')}</th><th></th></tr>`;
  if(state.stage==='all'){
    const blocks=scope.map(st=>{const rows=lowRows(st);if(!rows.length)return '';const shown=rows.slice(0,5);
      const tail=state.sort.low[0]==='pot'?ui(' 支有启灵记录',' with enlightenment data'):ui(' 支',' lineups');
      return `<div class="mhSubHd"><b>${esc(stageLabel(st,true))}</b><small>${ui('最省 5 支 / 共 '+rows.length,'5 cheapest of '+rows.length)}${tail}</small></div><div class="mhScroll"><table><thead>${head}</thead><tbody>${shown.map((r,i)=>lowRow(st,r,i)).join('')}</tbody></table></div>`}).join('');
    return blocks;
  }
  const st=scope[0],rows=lowRows(st),shown=rows.slice(0,state.lowLimit);
  return `<div class="mhScroll"><table><thead>${head}</thead><tbody>${shown.map((r,i)=>lowRow(st,r,i)).join('')}</tbody></table></div>${rows.length>shown.length?`<button type="button" class="mhMore" data-mh-morelow>${ui('显示更多','Show more')}（${shown.length}/${rows.length}）</button>`:''}`;
}
function teamTable(){
  const d=state.data,scope=stagesInScope(),m=new Map();
  for(const st of scope)for(const r of st.reviews){
    const key=r[5].map(a=>a[0]).sort((a,b)=>a-b).join(','),g=m.get(key)||{key,n:0,bs:[],best:null,pots:[]};
    g.n++;if(r[1]>0){g.bs.push(r[1]);if(!g.best||r[1]<g.best[1])g.best=r}if(potKnown(r))g.pots.push(potSum(r));m.set(key,g);
  }
  const rows=[...m.values()].sort((a,b)=>b.n-a.n||a.key.localeCompare(b.key)),total=scope.reduce((s,x)=>s+x.reviews.length,0),shown=rows.slice(0,state.limit);
  const body=shown.map((g,i)=>`<tr><td>${i+1}</td><td><div class="mhTeam">${g.key.split(',').map(k=>portrait(d.aw[k])).join('')}</div></td><td>${g.n}</td><td>${pct(g.n/total)}</td><td>${g.bs.length?(g.bs.reduce((a,b)=>a+b,0)/g.bs.length).toFixed(1):'—'}</td><td>${g.best?g.best[1]:'—'}</td><td>${g.pots.length?(g.pots.reduce((a,b)=>a+b,0)/g.pots.length).toFixed(1):'—'}</td><td>${g.best?`<button type="button" class="mhCopy" data-replay-code="${esc(g.best[3])}">${ui('复制最快回放','Copy fastest replay')}</button>`:''}</td></tr>`).join('');
  return `<div class="mhScroll"><table><thead><tr><th>#</th><th>${ui('配队（不分站位）','Team (any order)')}</th><th>${ui('次数','Clears')}</th><th>${ui('占比','Share')}</th><th>${ui('平均回合','Avg rounds')}</th><th>${ui('最快回合','Best')}</th><th>${ui('平均启灵','Avg Enl.')}</th><th></th></tr></thead><tbody>${body}</tbody></table></div>${rows.length>shown.length?`<button type="button" class="mhMore" data-mh-more>${ui('显示更多','Show more')}（${shown.length}/${rows.length}）</button>`:''}`;
}
function render(){
  const panel=$(PANEL_ID);if(!panel||panel.hidden&&!state.mounted)return;
  const host=$('morimensMainHardBody');if(!host)return;
  if(state.error){host.innerHTML=`<div class="dtideEmpty">${ui('数据载入失败：','Failed to load data: ')}${esc(state.error.message||state.error)}</div>`;return}
  const d=state.data;if(!d){host.innerHTML=`<div class="dtideEmpty">${ui('正在读取…','Loading…')}</div>`;return}
  const groups={};for(const s of d.stages)(groups[s.campaign]=groups[s.campaign]||[]).push(s);
  const chips=`<button type="button" class="mhChip" data-mh-stage="all" aria-pressed="${state.stage==='all'}">${ui('全部关卡汇总','All stages')}</button>`+Object.entries(groups).map(([c,l])=>`<span class="mhGrp">${esc(zh()?c:campaignEn[c]||c)}</span>`+l.map(s=>`<button type="button" class="mhChip" data-mh-stage="${s.tid}" aria-pressed="${String(state.stage)===String(s.tid)}" title="${esc(s.name)}">H${s.chapter}-${s.stage} ${esc(s.name)}</button>`).join('')).join('');
  const scope=stagesInScope(),all=scope.flatMap(s=>s.reviews),st=stats(all);
  const known=all.filter(potKnown);
  const kpis=`<div class="mhKpis"><div class="mhKpi"><small>${ui('通关样本','Clears')}</small><b>${st.n.toLocaleString()}</b></div><div class="mhKpi"><small>${ui('平均回合','Avg rounds')}</small><b>${st.avg.toFixed(1)}</b></div><div class="mhKpi"><small>${ui('中位回合','Median')}</small><b>${st.med}</b></div><div class="mhKpi"><small>${ui('最快回合','Fastest')}</small><b>${st.min}</b></div><div class="mhKpi"><small>${ui('玩家数','Players')}</small><b>${new Set(all.map(r=>r[0])).size.toLocaleString()}</b></div><div class="mhKpi"><small>${ui('有启灵记录','With enlightenment')}</small><b>${known.length.toLocaleString()}<small style="font-size:10px;color:#8fa0b5"> ${pct(known.length/Math.max(1,all.length))}</small></b></div></div>`;
  const views=[['chars',ui('角色榜单','Awakeners')],['toks',ui('钥令榜单','Keeper skills')],['fast',ui('速通榜','Fastest clears')],['teams',ui('常用配队','Common teams')],['low',ui('低配阵容','Low-investment')]].map(([k,n])=>`<button type="button" class="mhView" data-mh-view="${k}" aria-pressed="${state.view===k}">${n}</button>`).join('');
  const lowSorts=state.view==='low'?`<div class="mhChips">${[['pot',ui('按启灵合计','Σ enlightenment')],['lv',ui('按等级合计','Σ levels')],['round',ui('按回合','Rounds')]].map(([k,n])=>`<button type="button" class="mhChip" data-mh-lowsort="${k}" aria-pressed="${state.sort.low[0]===k}">${n}${state.sort.low[0]===k?(state.sort.low[1]>0?' ↑':' ↓'):''}</button>`).join('')}</div>`:'';
  const table=state.view==='chars'||state.view==='toks'?usageTable(state.view):state.view==='fast'?fastTable():state.view==='teams'?teamTable():lowTable();
  const checked=d.stages.map(s=>s.checked).filter(Boolean).sort().pop();
  const lowNote=state.view==='low'?`<div class="mhNote">${ui('低配榜只统计回放能读到启灵等级的队伍（启灵 = 4 名唤醒体启灵等级之和，0–60），按合计升序排列；点任意一行展开可看 4 人的等级 / 启灵 / 灵塑、钥令、守密人等级和回放码。','The low-investment list only ranks lineups whose replay carries the enlightenment levels (Σ over the four members, 0-60), ascending; click a row to see each member\'s level / enlightenment / soulforge, the keeper skill, the keeper level and the replay code.')}</div>`:'';
  host.innerHTML=`<div class="mhChips">${chips}</div>${kpis}<div class="mhViews">${views}</div>${lowSorts}${table}${lowNote}<div class="mhNote">${ui('数据来源：各主线困难关卡公开展示的通关回放样本（不是全体玩家），每条含回合数、4 名唤醒体、钥令与回放码；启灵 / 灵塑 / 守密人等级从回放对象补齐，回放已过期或未公开的记录留空。统计方式和融灾禁区一致：每个关卡一列，出场率 = 出现该角色的通关数 ÷ 该关卡通关样本数。','Source: the public clear replays shown for each hard main-story stage (a sample, not every player); each has rounds, the four Awakeners, the keeper skill and the replay code. Enlightenment / Soulforge / keeper level are read from the replay object; records whose replay expired or was never published stay blank. Same method as the D-Zone zones: one column per stage, usage = clears with the character / clears of the stage.')}${checked?` ${ui('最近抓取：','Last fetched: ')}${esc(String(checked).slice(0,16).replace('T',' '))}`:''}</div>`;
}
function shell(){return `<section class="panel mh"><h2>${ui('主线困难榜单','Hard Main-story Leaderboard')}</h2><div id="morimensMainHardBody"></div></section>`}
function loadGear(){
  if(state.gear)return Promise.resolve(state.gear);
  if(state.gearLoading)return state.gearLoading;
  state.gearLoading=fetch(GEAR,{cache:'no-cache'}).then(r=>r.ok?r.json():{map:{},wh:[],cv:[]}).then(g=>{state.gear=g;return g}).catch(()=>({map:{},wh:[],cv:[]}));
  return state.gearLoading;
}
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
    const s=e.target.closest('[data-mh-stage]');if(s){state.stage=s.dataset.mhStage;state.limit=100;state.lowLimit=20;state.open.clear();render();return}
    const v=e.target.closest('[data-mh-view]');if(v){state.view=v.dataset.mhView;state.limit=100;state.lowLimit=20;state.open.clear();render();return}
    const so=e.target.closest('[data-mh-sort]');if(so){const [k,key]=so.dataset.mhSort.split('|'),cur=state.sort[k];state.sort[k]=cur[0]===key?[key,-cur[1]]:[key,-1];render();return}
    const ls=e.target.closest('[data-mh-lowsort]');if(ls){const k=ls.dataset.mhLowsort,cur=state.sort.low;state.sort.low=cur[0]===k?[k,-cur[1]]:[k,1];state.open.clear();render();return}
    if(e.target.closest('[data-mh-more]')){state.limit+=100;render();return}
    if(e.target.closest('[data-mh-morelow]')){state.lowLimit+=20;render();return}
    const c=e.target.closest('.mhCopy');if(c){const code=c.dataset.replayCode,done=()=>{const t=c.textContent;c.textContent=ui('已复制','Copied');setTimeout(()=>{c.textContent=t},1200)};(navigator.clipboard?.writeText(code)||Promise.reject()).then(done).catch(()=>{const ta=document.createElement('textarea');ta.value=code;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');done()}catch{}ta.remove()});return}
    const tr=e.target.closest('tr[data-mh-row]');if(tr){const k=tr.dataset.mhRow,had=state.open.has(k);state.open.clear();if(!had)state.open.add(k);loadGear().then(()=>render());}
  });
  state.mounted=true;
  if(location.hash===HASH)open();
  return true;
}
let tries=0;const iv=setInterval(()=>{if(mount()||++tries>120)clearInterval(iv)},500);
})();

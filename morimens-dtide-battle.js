// 融灾榜单：战斗数据榜（平均死扛 / 平均回合数 / 单回合最高伤害）+ 热力图分布与筛选
// 数据来源：每支队伍的 team.battle（第70期 Top2000 导入时写入），没有该字段的期次自动隐藏。
(()=>{
  const zh=()=>localStorage.getItem('morimens.language')!=='en';
  const ui=(cn,en)=>zh()?cn:en;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const METRICS={
    death:{zh:'平均死扛',en:'Avg Death Resist',get:r=>r.avgDeath,fmt:v=>v.toFixed(2),teamVal:b=>b.deathResistCount},
    rounds:{zh:'平均回合数',en:'Avg Rounds',get:r=>r.avgRounds,fmt:v=>v.toFixed(2),teamVal:b=>b.stageRoundCount},
    bout:{zh:'单回合最高伤害',en:'Max Single-Round Damage',get:r=>r.maxBout,fmt:dmg,teamVal:b=>b.maxBoutDamage}
  };
  const TIERS=[[1,50],[51,200],[201,500],[501,1000],[1001,2000]];
  const BINS=10,PAGE=50;
  const state={sort:'rank',dir:1,page:0,metric:'death',f:{rankFrom:'',rankTo:'',death:['',''],rounds:['',''],bout:['','']}};
  let ctx=null,rows=[],host=null;

  function dmg(n){
    if(!Number.isFinite(n))return '—';
    if(zh())return n>=1e8?`${(n/1e8).toFixed(2)}亿`:n>=1e4?`${(n/1e4).toFixed(1)}万`:String(Math.round(n));
    return n>=1e6?`${(n/1e6).toFixed(2)}M`:n>=1e3?`${(n/1e3).toFixed(1)}K`:String(Math.round(n));
  }
  const num=v=>v===''||v==null?null:Number(v);
  const heat=p=>`background:rgba(215,168,91,${(.05+.55*Math.max(0,Math.min(1,p))).toFixed(3)})`;

  function ensureStyle(){
    if(document.getElementById('dtideBattleStyle'))return;
    const st=document.createElement('style');st.id='dtideBattleStyle';
    st.textContent=`
      .dtideBattle{margin-top:18px}.dtideBattle h3{font-size:15px;margin:0 0 6px;color:#ead9b9}.dtideBattle h4{font-size:13px;margin:16px 0 8px;color:#ead9b9}
      .dtideBattleNote{color:#8290a2;font-size:12px;margin:0 0 10px}
      .dtideBattleFilters{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:10px 0}
      .dtideBattleFilters label{display:block;font-size:11px;color:#8290a2;margin-bottom:3px}
      .dtideBattleFilters .pair{display:flex;gap:4px;align-items:center}.dtideBattleFilters input,.dtideBattleFilters select{width:100%;min-width:0}
      .dtideBattleScroll{overflow:auto}.dtideBattleTable{width:100%;border-collapse:collapse;font-size:12px}
      .dtideBattleTable th,.dtideBattleTable td{padding:6px 9px;border-bottom:1px solid rgba(148,163,184,.12);text-align:right;white-space:nowrap}
      .dtideBattleTable th:nth-child(2),.dtideBattleTable td:nth-child(2){text-align:left}
      .dtideBattleTable th button{all:unset;cursor:pointer;font-weight:700;color:#ead9b9}.dtideBattleTable th button:hover{text-decoration:underline}
      .dtideBattleTable td.heat{font-variant-numeric:tabular-nums}
      .dtideHeatGrid{display:grid;gap:2px;font-size:11px;min-width:520px}.dtideHeatGrid>div{padding:6px 4px;text-align:center;border-radius:4px;background:rgba(255,255,255,.03)}
      .dtideHeatGrid .hd{background:none;color:#8290a2}.dtideHeatGrid .rowhd{text-align:left;background:none;color:#ead9b9;font-weight:700}
      .dtideHeatGrid .cell{cursor:pointer;color:#f4f7fb}.dtideHeatGrid .cell:hover{outline:1px solid #f1d69f}.dtideHeatGrid .cell.empty{cursor:default;color:#5b6676}
      .dtideHeatLegend{display:flex;align-items:center;gap:6px;font-size:11px;color:#8290a2;margin-top:6px}.dtideHeatLegend i{display:block;width:120px;height:8px;border-radius:4px;background:linear-gradient(90deg,rgba(215,168,91,.05),rgba(215,168,91,.6))}
      .dtideBattlePager{display:flex;gap:8px;align-items:center;justify-content:center;margin:10px 0;font-size:12px}`;
    document.head.appendChild(st);
  }

  function buildRows(){
    const {records,rankOf,scoreOf,rankMatches,scoreMatches,rankCap,difficulty,clearType,difficultyOf}=ctx;
    const out=[];
    for(const rec of records){
      if(!rankMatches(rec,rankCap)||!scoreMatches(rec))continue;
      let n=0,death=0,rounds=0,bout=0;const waves={};
      for(const w of rec.waves||[])for(const t of w.teams||[]){
        if(!t.battle)continue;
        if(difficulty!=='all'&&difficultyOf(t,w)!==difficulty)continue;
        if(clearType!=='all'&&clearType!==t.clearType)continue;
        n++;death+=Number(t.battle.deathResistCount)||0;rounds+=Number(t.battle.stageRoundCount)||0;
        bout=Math.max(bout,Number(t.battle.maxBoutDamage)||0);
        (waves[w.wave]??=[]).push(t.battle);
      }
      if(!n)continue;
      out.push({rec,rank:rankOf(rec),uid:rec.uid,name:rec.player,score:scoreOf(rec),n,avgDeath:death/n,avgRounds:rounds/n,maxBout:bout,waves});
    }
    return out;
  }

  function passes(r){
    const f=state.f,rf=num(f.rankFrom),rt=num(f.rankTo);
    if(rf!=null&&!(r.rank>=rf))return false;
    if(rt!=null&&!(r.rank<=rt))return false;
    for(const k of ['death','rounds','bout']){
      const [lo,hi]=f[k].map(num),m=METRICS[k].get(r),scale=k==='bout'?1e4:1;
      if(lo!=null&&m<lo*scale)return false;
      if(hi!=null&&m>hi*scale)return false;
    }
    return true;
  }

  function sortRows(list){
    const key=state.sort,d=state.dir;
    const get=key==='rank'?r=>r.rank??1e9:key==='score'?r=>r.score??-1:key==='death'?r=>r.avgDeath:key==='rounds'?r=>r.avgRounds:key==='bout'?r=>r.maxBout:r=>r.n;
    return [...list].sort((a,b)=>(get(a)-get(b))*d||(a.rank??1e9)-(b.rank??1e9));
  }

  const colStats=list=>{const o={};for(const k of ['death','rounds','bout']){const v=list.map(METRICS[k].get).sort((a,b)=>a-b);o[k]=v}return o};
  const pctile=(sorted,v)=>{if(sorted.length<2)return .5;let lo=0,hi=sorted.length;while(lo<hi){const m=(lo+hi)>>1;if(sorted[m]<v)lo=m+1;else hi=m}return lo/(sorted.length-1)};

  function distHeat(base){
    const m=METRICS[state.metric],vals=base.map(m.get).sort((a,b)=>a-b);
    if(!vals.length)return '';
    const lo=vals[Math.floor(vals.length*.01)],hi=vals[Math.min(vals.length-1,Math.floor(vals.length*.99))],span=(hi-lo)||1,step=span/BINS;
    const binOf=v=>Math.max(0,Math.min(BINS-1,Math.floor((v-lo)/step)));
    const tiers=TIERS.map(([a,b])=>({a,b,list:base.filter(r=>r.rank>=a&&r.rank<=b)})).filter(t=>t.list.length);
    const grid=tiers.map(t=>{const c=Array(BINS).fill(0);for(const r of t.list)c[binOf(m.get(r))]++;return {...t,c}});
    const max=Math.max(1,...grid.flatMap(t=>t.c.map(x=>x/t.list.length)));
    const edge=i=>lo+step*i,lab=i=>m.fmt(edge(i));
    let h=`<div class="dtideBattleScroll"><div class="dtideHeatGrid" style="grid-template-columns:96px repeat(${BINS},minmax(44px,1fr))"><div class="hd"></div>`+
      Array.from({length:BINS},(_,i)=>`<div class="hd">${lab(i)}${i===BINS-1?'+':''}</div>`).join('');
    for(const t of grid){
      h+=`<div class="rowhd">Top ${t.a}–${t.b}<br><small>${t.list.length}</small></div>`;
      t.c.forEach((c,i)=>{
        const share=c/t.list.length;
        h+=c?`<div class="cell" style="${heat(share/max)}" data-heat-tier="${t.a}:${t.b}" data-heat-bin="${i}" data-heat-lo="${edge(i)}" data-heat-hi="${i===BINS-1?'':edge(i+1)}" title="${c} / ${t.list.length}">${(share*100).toFixed(0)}%</div>`:'<div class="cell empty">·</div>';
      });
    }
    return h+`</div></div><div class="dtideHeatLegend"><span>0%</span><i></i><span>${(max*100).toFixed(0)}%</span><span>· ${ui('每行为该排名段内玩家的占比，点击格子即可按该排名段与数值区间筛选','Each row is the share of players in that rank band; click a cell to filter by band and value range')}</span></div>`;
  }

  function waveHeat(base){
    const m=METRICS[state.metric],tiers=TIERS.map(([a,b])=>({a,b,list:base.filter(r=>r.rank>=a&&r.rank<=b)})).filter(t=>t.list.length);
    const cells=tiers.map(t=>[1,2,3,4,5].map(w=>{
      const vals=t.list.flatMap(r=>(r.waves[w]||[]).map(m.teamVal)).filter(Number.isFinite);
      return vals.length?vals.reduce((s,x)=>s+x,0)/vals.length:null;
    }));
    const flat=cells.flat().filter(v=>v!=null),min=Math.min(...flat),max=Math.max(...flat),span=(max-min)||1;
    let h=`<div class="dtideBattleScroll"><div class="dtideHeatGrid" style="grid-template-columns:96px repeat(5,minmax(70px,1fr))"><div class="hd"></div>`+[1,2,3,4,5].map(w=>`<div class="hd">Wave ${w}</div>`).join('');
    tiers.forEach((t,i)=>{h+=`<div class="rowhd">Top ${t.a}–${t.b}</div>`+cells[i].map(v=>v==null?'<div class="cell empty">·</div>':`<div class="cell" style="${heat((v-min)/span)}">${m.fmt(v)}</div>`).join('')});
    return h+`</div></div><div class="dtideHeatLegend"><span>${m.fmt(min)}</span><i></i><span>${m.fmt(max)}</span><span>· ${ui('各排名段在每个 Wave 的队伍平均值','Mean per team for each rank band and wave')}</span></div>`;
  }

  function render(el,context){
    host=el;ctx=context;if(!host)return;
    ensureStyle();
    const hasData=(ctx.records||[]).some(r=>(r.waves||[]).some(w=>(w.teams||[]).some(t=>t.battle)));
    host.hidden=!hasData;
    if(!hasData){host.innerHTML='';return}
    rows=buildRows();
    draw();
  }

  function draw(){
    const f=state.f,base=rows,list=sortRows(base.filter(passes)),stats=colStats(base);
    const pages=Math.max(1,Math.ceil(list.length/PAGE));state.page=Math.min(state.page,pages-1);
    const slice=list.slice(state.page*PAGE,(state.page+1)*PAGE);
    const pair=(k,label,unit)=>`<div><label>${label}${unit?` (${unit})`:''}</label><div class="pair"><input type="number" min="0" step="any" data-bf="${k}:0" value="${esc(f[k][0])}" placeholder="${ui('最低','min')}"><input type="number" min="0" step="any" data-bf="${k}:1" value="${esc(f[k][1])}" placeholder="${ui('最高','max')}"></div></div>`;
    const th=(k,label)=>`<th><button type="button" data-bsort="${k}">${label}${state.sort===k?(state.dir>0?' ▲':' ▼'):''}</button></th>`;
    host.innerHTML=`<h3>${ui('战斗数据榜','Battle Stats Leaderboard')}</h3>
      <p class="dtideBattleNote">${ui('统计口径：平均死扛 = 每场战斗死扛触发次数的平均值；平均回合数 = 每场战斗回合数（stageRoundCount）的平均值；单回合最高伤害 = 该玩家所有战斗中的最大单回合伤害。受上方期次、榜单范围、难度、总得分与队伍类型筛选影响。','Avg Death Resist = mean Death Resist triggers per battle; Avg Rounds = mean stageRoundCount per battle; Max Single-Round Damage = highest single-round damage across the player’s battles. Follows the season, rank scope, difficulty, total score and team-type filters above.')}</p>
      <div class="dtideBattleFilters">
        <div><label>${ui('排名区间','Rank range')}</label><div class="pair"><input type="number" min="1" max="2000" data-bf="rankFrom" value="${esc(f.rankFrom)}" placeholder="1"><input type="number" min="1" max="2000" data-bf="rankTo" value="${esc(f.rankTo)}" placeholder="2000"></div></div>
        ${pair('death',ui('平均死扛','Avg Death Resist'))}${pair('rounds',ui('平均回合数','Avg Rounds'))}${pair('bout',ui('单回合最高伤害','Max Round Damage'),ui('万','×10k'))}
        <div><label>${ui('热力图指标','Heatmap metric')}</label><select data-bmetric>${Object.entries(METRICS).map(([k,v])=>`<option value="${k}"${state.metric===k?' selected':''}>${ui(v.zh,v.en)}</option>`).join('')}</select></div>
        <div><label>&nbsp;</label><button type="button" class="ghostBtn" data-breset>${ui('清空筛选','Reset')}</button></div>
      </div>
      <h4>${ui('热力图 · 数值分布','Heatmap · Distribution')} — ${ui(METRICS[state.metric].zh,METRICS[state.metric].en)}</h4>${distHeat(base)}
      <h4>${ui('热力图 · 各 Wave 平均值','Heatmap · Mean by Wave')}</h4>${waveHeat(base)}
      <h4>${ui('榜单','Leaderboard')} <small style="color:#8290a2">${ui(`匹配 ${list.length} / ${base.length} 名玩家`,`${list.length} / ${base.length} players`)}</small></h4>
      <div class="dtideBattleScroll"><table class="dtideBattleTable"><thead><tr>${th('rank',ui('排名','Rank'))}<th>${ui('玩家','Player')}</th>${th('score',ui('总分','Score'))}${th('death',ui('平均死扛','Avg Death Resist'))}${th('rounds',ui('平均回合数','Avg Rounds'))}${th('bout',ui('单回合最高伤害','Max Round Damage'))}${th('n',ui('战斗数','Battles'))}</tr></thead><tbody>${
        slice.map(r=>`<tr><td>#${esc(r.rank??'—')}</td><td>${r.rec.url?`<a href="${esc(r.rec.url)}" target="_blank" rel="noopener noreferrer">${esc(r.name)}</a>`:esc(r.name)}</td><td>${esc(r.score??'—')}</td><td class="heat" style="${heat(pctile(stats.death,r.avgDeath))}">${r.avgDeath.toFixed(2)}</td><td class="heat" style="${heat(pctile(stats.rounds,r.avgRounds))}">${r.avgRounds.toFixed(2)}</td><td class="heat" style="${heat(pctile(stats.bout,r.maxBout))}">${dmg(r.maxBout)}</td><td>${r.n}</td></tr>`).join('')||`<tr><td colspan="7" style="text-align:center">${ui('没有符合条件的玩家','No players match')}</td></tr>`
      }</tbody></table></div>
      <div class="dtideBattlePager"><button type="button" class="ghostBtn" data-bpage="-1"${state.page<=0?' disabled':''}>${ui('上一页','Prev')}</button><span>${state.page+1} / ${pages}</span><button type="button" class="ghostBtn" data-bpage="1"${state.page>=pages-1?' disabled':''}>${ui('下一页','Next')}</button></div>`;
  }

  document.addEventListener('input',e=>{
    const el=e.target.closest?.('[data-bf]');if(!el||!host?.contains(el))return;
    const [k,i]=el.dataset.bf.split(':');
    if(i==null)state.f[k]=el.value;else state.f[k][Number(i)]=el.value;
    state.page=0;clearTimeout(draw.t);draw.t=setTimeout(()=>{const pos=el.selectionStart;draw();const again=host.querySelector(`[data-bf="${el.dataset.bf}"]`);again?.focus();try{again?.setSelectionRange(pos,pos)}catch{}},350);
  });
  document.addEventListener('change',e=>{
    const el=e.target.closest?.('[data-bmetric]');if(!el||!host?.contains(el))return;
    state.metric=el.value;draw();
  });
  document.addEventListener('click',e=>{
    if(!host||!host.contains(e.target))return;
    const sort=e.target.closest('[data-bsort]');
    if(sort){const k=sort.dataset.bsort;if(state.sort===k)state.dir*=-1;else{state.sort=k;state.dir=k==='rank'?1:-1}state.page=0;draw();return}
    const page=e.target.closest('[data-bpage]');
    if(page){state.page=Math.max(0,state.page+Number(page.dataset.bpage));draw();return}
    if(e.target.closest('[data-breset]')){state.f={rankFrom:'',rankTo:'',death:['',''],rounds:['',''],bout:['','']};state.page=0;draw();return}
    const cell=e.target.closest('[data-heat-tier]');
    if(cell){
      const [a,b]=cell.dataset.heatTier.split(':'),k=state.metric,scale=k==='bout'?1e4:1,lo=Number(cell.dataset.heatLo),hi=cell.dataset.heatHi===''?'':Number(cell.dataset.heatHi);
      const r=v=>v===''?'':String(Math.round(v/scale*100)/100);
      state.f.rankFrom=a;state.f.rankTo=b;state.f[k]=[Number(cell.dataset.heatBin)===0?'':r(lo),r(hi)];
      state.page=0;draw();host.querySelector('.dtideBattleTable')?.scrollIntoView({block:'nearest'});
    }
  });

  window.MorimensDtideBattle={render};
})();

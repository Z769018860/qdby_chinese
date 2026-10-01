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
  const BINS=10;
  const state={active:false,view:'chars',sort:'rank',dir:1,page:0,metric:'death',f:{rankFrom:'',rankTo:'',death:['',''],rounds:['',''],bout:['','']},cs:{sort:'avgShare',dir:-1,q:'',min:10,page:0}};
  let ctx=null,rows=[],host=null;

  function dmg(n){
    if(!Number.isFinite(n))return '—';
    if(zh())return n>=1e8?`${(n/1e8).toFixed(2)}亿`:n>=1e4?`${(n/1e4).toFixed(1)}万`:String(Math.round(n));
    return n>=1e6?`${(n/1e6).toFixed(2)}M`:n>=1e3?`${(n/1e3).toFixed(1)}K`:String(Math.round(n));
  }
  const num=v=>v===''||v==null?null:Number(v);
  // same colour scale as the awakener leaderboard (usage heatStyle): hue 215 -> 0, alpha .08 -> .42
  const heat=p=>{const t=Math.max(0,Math.min(1,p));return `background:hsla(${Math.round(215-215*t)},78%,46%,${(.08+.34*t).toFixed(2)})`};

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
      .dtideBattleTable:not(.dtideBattleChars) th:nth-child(2),.dtideBattleTable:not(.dtideBattleChars) td:nth-child(2){text-align:left}.dtideBattleChars th:nth-child(2),.dtideBattleChars td:nth-child(2){text-align:left}
      .dtideBattleTable th button{all:unset;cursor:pointer;font-weight:700;color:#ead9b9}.dtideBattleTable th button:hover{text-decoration:underline}
      .dtideBattleTable td.heat{font-variant-numeric:tabular-nums}
      .dtideHeatGrid{display:grid;gap:2px;font-size:11px;min-width:520px}.dtideHeatGrid>div{padding:6px 4px;text-align:center;border-radius:4px;background:rgba(255,255,255,.03)}
      .dtideHeatGrid .hd{background:none;color:#8290a2}.dtideHeatGrid .rowhd{text-align:left;background:none;color:#ead9b9;font-weight:700}
      .dtideHeatGrid .cell{cursor:pointer;color:#f4f7fb}.dtideHeatGrid .cell:hover{outline:1px solid #f1d69f}.dtideHeatGrid .cell.empty{cursor:default;color:#5b6676}
      .dtideHeatLegend{display:flex;align-items:center;gap:6px;font-size:11px;color:#8290a2;margin-top:6px}.dtideHeatLegend i{display:block;width:120px;height:8px;border-radius:4px;background:linear-gradient(90deg,hsla(215,78%,46%,.08),hsla(108,78%,46%,.25),hsla(0,78%,46%,.42))}`;
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


  const SHARE=v=>Number.isFinite(v)?`${(v*100).toFixed(1)}%`:'—';
  const CCOLS=[
    ['n',{zh:'出场队伍',en:'Teams'},v=>String(v)],
    ['avgShare',{zh:'平均伤害占比',en:'Avg Dmg Share'},SHARE],
    ['maxShare',{zh:'最高伤害占比',en:'Max Dmg Share'},SHARE],
    ['avgDmg',{zh:'平均伤害',en:'Avg Damage'},dmg],
    ['maxDmg',{zh:'单场最高伤害',en:'Max Damage'},dmg],
    ['avgBlock',{zh:'平均格挡',en:'Avg Block'},dmg],
    ['avgHeal',{zh:'平均治疗',en:'Avg Heal'},dmg],
    ['avgDeath',{zh:'平均死扛',en:'Avg Death Resist'},v=>v.toFixed(2)],
    ['avgRounds',{zh:'平均回合数',en:'Avg Rounds'},v=>v.toFixed(2)],
    ['avgCards',{zh:'平均出牌数',en:'Avg Cards'},v=>v.toFixed(1)],
    ['avgEnergy',{zh:'平均能量消耗',en:'Avg Energy'},v=>v.toFixed(1)],
    ['avgBout',{zh:'队伍平均单回合最高伤害',en:'Team Avg Max Round Dmg'},dmg],
    ['maxBout',{zh:'队伍单回合最高伤害',en:'Team Max Round Dmg'},dmg]
  ];
  function buildChars(){
    const {records,rankMatches,scoreMatches,rankCap,difficulty,clearType,difficultyOf,memberKey,characterInfo}=ctx;
    const map=new Map();
    for(const rec of records){
      if(!rankMatches(rec,rankCap)||!scoreMatches(rec))continue;
      for(const w of rec.waves||[])for(const t of w.teams||[]){
        const b=t.battle;if(!b)continue;
        if(difficulty!=='all'&&difficultyOf(t,w)!==difficulty)continue;
        if(clearType!=='all'&&clearType!==t.clearType)continue;
        const total=(t.members||[]).reduce((s,m)=>s+(Number(m.damage)||0),0);
        if(!(total>0))continue;
        for(const m of t.members||[]){
          const key=String((memberKey&&memberKey(m))||m.ingameId||m.name),a=map.get(key)||{key,m,n:0,sShare:0,maxShare:0,sDmg:0,maxDmg:0,sBlock:0,sHeal:0,sDeath:0,sRounds:0,sCards:0,sEnergy:0,sBout:0,maxBout:0};
          const d=Number(m.damage)||0,share=d/total;
          a.n++;a.sShare+=share;a.maxShare=Math.max(a.maxShare,share);a.sDmg+=d;a.maxDmg=Math.max(a.maxDmg,d);
          a.sBlock+=Number(m.block)||0;a.sHeal+=Number(m.heal)||0;a.sDeath+=Number(b.deathResistCount)||0;a.sRounds+=Number(b.stageRoundCount)||0;
          a.sCards+=Number(b.totalUseCard)||0;a.sEnergy+=Number(b.totalEnergyCost)||0;a.sBout+=Number(b.maxBoutDamage)||0;a.maxBout=Math.max(a.maxBout,Number(b.maxBoutDamage)||0);
          map.set(key,a);
        }
      }
    }
    return [...map.values()].map(a=>{
      const info=characterInfo?characterInfo(a.m):{name:a.m.canonicalName||a.m.name,image:''};
      return {key:a.key,name:info.name||a.m.name,image:info.image||'',n:a.n,avgShare:a.sShare/a.n,maxShare:a.maxShare,avgDmg:a.sDmg/a.n,maxDmg:a.maxDmg,avgBlock:a.sBlock/a.n,avgHeal:a.sHeal/a.n,avgDeath:a.sDeath/a.n,avgRounds:a.sRounds/a.n,avgCards:a.sCards/a.n,avgEnergy:a.sEnergy/a.n,avgBout:a.sBout/a.n,maxBout:a.maxBout};
    });
  }
  function drawChars(){
    const cs=state.cs,all=buildChars(),minN=Math.max(1,Number(cs.min)||1),q=cs.q.trim().toLowerCase();
    let list=all.filter(r=>r.n>=minN&&(!q||String(r.name).toLowerCase().includes(q)));
    const sorted=[...list].sort((a,b)=>cs.sort==='name'?String(a.name).localeCompare(String(b.name),'zh-CN')*cs.dir*-1:(a[cs.sort]-b[cs.sort])*cs.dir||b.n-a.n);
    const cols={};for(const [k] of CCOLS)cols[k]=all.map(r=>r[k]).sort((a,b)=>a-b);
    const slice=sorted;
    const th=([k,l])=>`<th><button type="button" data-csort="${k}">${ui(l.zh,l.en)}${cs.sort===k?(cs.dir>0?' ▲':' ▼'):''}</button></th>`;
    return `<div class="dtideBattleFilters">
        <div class="dtideField"><label>${ui('搜索角色','Search awakener')}</label><input type="search" data-cq value="${esc(cs.q)}" placeholder="${ui('角色名','Name')}"></div>
        <div class="dtideField"><label>${ui('最少出场队伍数','Min teams')}</label><input type="number" min="1" data-cmin value="${esc(cs.min)}"></div>
      </div>
      <p class="dtideBattleNote">${ui('伤害占比 = 角色造成的伤害 ÷ 同队 4 名角色伤害之和（不含未归属角色的伤害，如灵魂/战场效果）。最高伤害占比对出场很少的角色参考价值低，可调高“最少出场队伍数”。','Damage share = awakener damage ÷ total damage of the 4 awakeners in the team (unattributed damage excluded). Max share is noisy for rarely used awakeners — raise “Min teams”.')}</p>
      <div class="dtideBattleScroll"><table class="dtideBattleTable dtideBattleChars"><thead><tr><th>${ui('排名','Rank')}</th><th><button type="button" data-csort="name">${ui('角色','Awakener')}${cs.sort==='name'?(cs.dir>0?' ▲':' ▼'):''}</button></th>${CCOLS.map(th).join('')}</tr></thead><tbody>${
        slice.map((r,i)=>`<tr><td>${i+1}</td><td>${r.image?`<img src="${esc(r.image)}" alt="" loading="lazy" style="width:22px;height:22px;border-radius:50%;vertical-align:middle;margin-right:6px">`:''}${esc(r.name)}</td>${CCOLS.map(([k,,f])=>`<td class="heat" style="${k==='n'?'':heat(pctile(cols[k],r[k]))}">${f(r[k])}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${CCOLS.length+2}" style="text-align:center">${ui('没有符合条件的角色','No awakeners match')}</td></tr>`
      }</tbody></table></div>`;
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


  async function downloadImage(button){
    const table=host?.querySelector('.dtideBattleTable');if(!table)return;
    const MAX=800,pad=36,rowH=38,headH=64,headY=142,footH=100;
    const heads=[...table.querySelectorAll('thead th')].map(th=>th.innerText.replace(/[▲▼]/g,'').trim());
    const allRows=[...table.tBodies[0].rows].filter(tr=>tr.cells.length===heads.length);
    if(!allRows.length)return;
    const rows=allRows.slice(0,MAX).map(tr=>[...tr.cells].map(td=>({text:td.innerText.trim(),bg:getComputedStyle(td).backgroundColor,img:td.querySelector('img')?.getAttribute('src')||''})));
    const label=id=>document.getElementById(id)?.selectedOptions?.[0]?.textContent?.trim()||'';
    const season=ctx?.seasonId||document.getElementById('dtideSeason')?.value||'';
    const view=state.view==='chars'?ui('角色战斗数据','By Awakener'):ui('玩家战斗榜','By Player');
    const title=zh()?`第 ${season} 期 · 战斗数据榜 · ${view}`:`Season ${season} · Battle Stats · ${view}`;
    const status=[label('dtideRankScope'),label('dtideDifficulty'),label('dtideTotalScore')].filter(Boolean).join(' · ');
    const widths=heads.map((h,i)=>{const longest=Math.max(h.length*1.1,...rows.slice(0,60).map(r=>r[i].text.length));return Math.max(i===0?70:96,Math.min(i===1&&state.view==='players'?260:200,Math.round(longest*10+36)))});
    const width=pad*2+widths.reduce((a,b)=>a+b,0),height=headY+headH+rows.length*rowH+footH;
    const before=button.textContent;button.disabled=true;button.textContent=ui('正在生成图片…','Generating image…');
    try{
      const canvas=document.createElement('canvas');canvas.width=Math.max(width,900);canvas.height=height;
      const c=canvas.getContext('2d');if(!c)throw new Error('canvas');
      c.fillStyle='#0e1624';c.fillRect(0,0,canvas.width,canvas.height);
      c.textBaseline='middle';c.textAlign='left';c.fillStyle='#f1d69f';c.font='bold 27px system-ui,sans-serif';c.fillText(title,pad,45,canvas.width-pad*2);
      c.fillStyle='#b8c5d6';c.font='16px system-ui,sans-serif';c.fillText(status,pad,86,canvas.width-pad*2);
      c.fillText(zh()?`当前表格 · ${allRows.length} 条${allRows.length>MAX?`（仅导出前 ${MAX} 条）`:''} · 更新时间 10月1日 05:00`:`Current table · ${allRows.length} rows${allRows.length>MAX?` (first ${MAX} exported)`:''}`,pad,116);
      const xs=widths.map((_,i)=>pad+widths.slice(0,i).reduce((a,b)=>a+b,0)),left=i=>(state.view==='chars'?i===1:i===1);
      c.fillStyle='#192638';c.fillRect(pad,headY,widths.reduce((a,b)=>a+b,0),headH);
      heads.forEach((h,i)=>{c.textAlign=left(i)?'left':'center';c.font='bold 14px system-ui,sans-serif';c.fillStyle='#f0f4fa';c.fillText(h,xs[i]+(left(i)?12:widths[i]/2),headY+headH/2,widths[i]-10)});
      const imgs=new Map(await Promise.all([...new Set(rows.flat().map(x=>x.img).filter(Boolean))].map(async src=>{try{const u=new URL(src,document.baseURI);if(u.origin!==location.origin)return [src,null];const im=new Image();im.src=u.href;await im.decode();return [src,im]}catch{return [src,null]}})));
      rows.forEach((r,ri)=>{
        const y=headY+headH+ri*rowH;c.fillStyle=ri%2?'#152031':'#111b2a';c.fillRect(pad,y,widths.reduce((a,b)=>a+b,0),rowH);
        r.forEach((cell,i)=>{
          if(cell.bg&&cell.bg!=='rgba(0, 0, 0, 0)'&&cell.bg!=='transparent'){c.fillStyle=cell.bg;c.fillRect(xs[i],y,widths[i],rowH)}
          const im=imgs.get(cell.img);if(im){c.save();c.beginPath();c.roundRect(xs[i]+8,y+5,28,28,6);c.clip();c.drawImage(im,xs[i]+8,y+5,28,28);c.restore()}
          c.textAlign=left(i)?'left':'center';c.font='bold 14px system-ui,sans-serif';c.fillStyle='#edf2f7';
          c.fillText(cell.text,xs[i]+(left(i)?(im?44:12):widths[i]/2),y+rowH/2,widths[i]-(im?52:16));
        });
        c.fillStyle='rgba(148,163,184,.13)';c.fillRect(pad,y+rowH-1,widths.reduce((a,b)=>a+b,0),1);
      });
      c.textAlign='right';c.fillStyle='#b8c5d6';c.font='15px system-ui,sans-serif';c.fillText('https://qingdengbuyi.top/morimens-tools.html#dtide',canvas.width-pad,canvas.height-58);
      c.fillStyle='#f1d69f';c.font='bold 16px system-ui,sans-serif';c.fillText('copyright@青灯不弈',canvas.width-pad,canvas.height-27);
      const blob=await new Promise(res=>canvas.toBlob(res,'image/png'));if(!blob)throw new Error('blob');
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=zh()?`融灾战斗数据榜-${season}-${state.view==='chars'?'角色':'玩家'}.png`:`dzone-battle-stats-${season}-${state.view}.png`;
      document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
    }catch(e){console.warn('battle stats image export failed',e);alert(ui('图片生成失败，请缩小筛选范围后重试','Image generation failed; narrow the filters and retry'))}
    finally{button.disabled=false;button.textContent=before}
  }

  const tabBtn=()=>document.querySelector('[data-dtide-battle-tab]');
  const SWAP=['#dtideMatrix','#dtideTableDownload','.dtideCreationFilter','#dtideRatioLegend'];
  let savedTitle=null;
  function applyActive(){
    const on=state.active&&!!ctx&&hasBattle(ctx);
    document.querySelectorAll('.dtideLeaderboardTab').forEach(x=>x.setAttribute('aria-selected',String(on?x.hasAttribute('data-dtide-battle-tab'):(!x.hasAttribute('data-dtide-battle-tab')&&x.getAttribute('aria-selected')==='true'))));
    for(const sel of SWAP){const el=document.querySelector(sel);if(el)el.style.display=on?'none':''}
    const title=document.getElementById('dtideMatrixTitle');
    if(title){if(on){if(savedTitle==null)savedTitle=title.textContent;title.textContent=ui('战斗数据榜','Battle Stats Leaderboard')}else if(savedTitle!=null){title.textContent=savedTitle;savedTitle=null}}
  }
  const hasBattle=c=>!!(c&&(c.battlePath||(c.records||[]).some(r=>(r.waves||[]).some(w=>(w.teams||[]).some(t=>t.battle)))));
  // Per-battle statistics are a separate, lazily fetched payload (only needed once the tab is opened).
  const detail={path:null,promise:null,battles:null,error:null};
  function attachDetail(){
    if(!detail.battles||!ctx)return;
    for(const rec of ctx.records||[])for(const w of rec.waves||[])for(const t of w.teams||[]){
      if(t.battle)continue;
      const d=detail.battles[t.battleUuid];if(!d)continue;
      t.battle=d.b;(t.members||[]).forEach((m,i)=>{const x=d.m?.[i];if(x){m.damage=x[1];m.block=x[2];m.heal=x[3]}});
    }
  }
  function ensureDetail(){
    if(!ctx?.battlePath||detail.battles&&detail.path===ctx.battlePath){attachDetail();return Promise.resolve()}
    if(detail.promise&&detail.path===ctx.battlePath)return detail.promise;
    detail.path=ctx.battlePath;detail.error=null;
    const loader=window.MorimensDtideDataLoader;
    detail.promise=(loader?.loadDataset?loader.loadDataset(ctx.battlePath):Promise.reject(new Error('loader unavailable')))
      .then(d=>{detail.battles=d.battles||{};attachDetail()})
      .catch(e=>{console.warn('battle detail unavailable',e);detail.error=e;detail.promise=null});
    return detail.promise;
  }
  const ready=()=>!ctx?.battlePath||!!detail.battles;
  function setActive(on){
    state.active=!!on;applyActive();
    if(!on){document.getElementById('dtideEntityType')?.dispatchEvent(new Event('change',{bubbles:true}));if(host)host.hidden=true;return}
    if(host&&ctx){host.hidden=false;showActive()}
  }
  function render(el,context){
    host=el;ctx=context;if(!host)return;
    ensureStyle();
    const hasData=hasBattle(ctx),btn=tabBtn();
    if(btn)btn.hidden=!hasData;
    if(!hasData&&state.active){state.active=false;document.getElementById('dtideEntityType')?.dispatchEvent(new Event('change',{bubbles:true}))}
    applyActive();
    host.hidden=!(hasData&&state.active);
    if(host.hidden){host.innerHTML='';return}
    showActive();
  }
  function showActive(){
    if(ready()){attachDetail();rows=buildRows();draw();return}
    host.innerHTML=`<p class="dtideBattleNote">${detail.error?ui('战斗数据加载失败，请刷新重试。','Failed to load battle data; please refresh.'):ui('正在加载战斗数据…','Loading battle data…')}</p>`;
    if(!detail.error)ensureDetail().then(()=>{if(state.active&&host&&!host.hidden)showActive()});
  }

  function draw(){
    const sub=(k,l)=>`<button type="button" class="dtideLeaderboardTab" data-bview="${k}" aria-selected="${state.view===k}">${l}</button>`;
    host.innerHTML=`<div class="dtideLeaderboardTabs">${sub('chars',ui('角色战斗数据','By Awakener'))}${sub('players',ui('玩家战斗榜 · 热力图','By Player · Heatmaps'))}<button type="button" class="dtideTableDownload" data-bdownload style="margin-left:auto">${ui('下载图片','Download Image')}</button></div>`+(state.view==='chars'?drawChars():drawPlayers());
  }
  function drawPlayers(){
    const f=state.f,base=rows,list=sortRows(base.filter(passes)),stats=colStats(base);
    const slice=list;
    const pair=(k,label,unit)=>`<div class="dtideField"><label>${label}${unit?` (${unit})`:''}</label><div class="pair"><input type="number" min="0" step="any" data-bf="${k}:0" value="${esc(f[k][0])}" placeholder="${ui('最低','min')}"><input type="number" min="0" step="any" data-bf="${k}:1" value="${esc(f[k][1])}" placeholder="${ui('最高','max')}"></div></div>`;
    const th=(k,label)=>`<th><button type="button" data-bsort="${k}">${label}${state.sort===k?(state.dir>0?' ▲':' ▼'):''}</button></th>`;
    return `      <p class="dtideBattleNote">${ui('统计口径：平均死扛 = 每场战斗死扛触发次数的平均值；平均回合数 = 每场战斗回合数（stageRoundCount）的平均值；单回合最高伤害 = 该玩家所有战斗中的最大单回合伤害。受上方期次、榜单范围、难度、总得分与队伍类型筛选影响。','Avg Death Resist = mean Death Resist triggers per battle; Avg Rounds = mean stageRoundCount per battle; Max Single-Round Damage = highest single-round damage across the player’s battles. Follows the season, rank scope, difficulty, total score and team-type filters above.')}</p>
      <div class="dtideBattleFilters">
        <div class="dtideField"><label>${ui('排名区间','Rank range')}</label><div class="pair"><input type="number" min="1" max="2000" data-bf="rankFrom" value="${esc(f.rankFrom)}" placeholder="1"><input type="number" min="1" max="2000" data-bf="rankTo" value="${esc(f.rankTo)}" placeholder="2000"></div></div>
        ${pair('death',ui('平均死扛','Avg Death Resist'))}${pair('rounds',ui('平均回合数','Avg Rounds'))}${pair('bout',ui('单回合最高伤害','Max Round Damage'),ui('万','×10k'))}
        <div class="dtideField"><label>${ui('热力图指标','Heatmap metric')}</label><select data-bmetric>${Object.entries(METRICS).map(([k,v])=>`<option value="${k}"${state.metric===k?' selected':''}>${ui(v.zh,v.en)}</option>`).join('')}</select></div>
        <div class="dtideField"><label>&nbsp;</label><button type="button" class="ghostBtn" data-breset>${ui('清空筛选','Reset')}</button></div>
      </div>
      <h4>${ui('热力图 · 数值分布','Heatmap · Distribution')} — ${ui(METRICS[state.metric].zh,METRICS[state.metric].en)}</h4>${distHeat(base)}
      <h4>${ui('热力图 · 各 Wave 平均值','Heatmap · Mean by Wave')}</h4>${waveHeat(base)}
      <h4>${ui('榜单','Leaderboard')} <small style="color:#8290a2">${ui(`匹配 ${list.length} / ${base.length} 名玩家`,`${list.length} / ${base.length} players`)}</small></h4>
      <div class="dtideBattleScroll"><table class="dtideBattleTable"><thead><tr>${th('rank',ui('排名','Rank'))}<th>${ui('玩家','Player')}</th>${th('score',ui('总分','Score'))}${th('death',ui('平均死扛','Avg Death Resist'))}${th('rounds',ui('平均回合数','Avg Rounds'))}${th('bout',ui('单回合最高伤害','Max Round Damage'))}${th('n',ui('战斗数','Battles'))}</tr></thead><tbody>${
        slice.map(r=>`<tr><td>#${esc(r.rank??'—')}</td><td>${r.rec.url?`<a href="${esc(r.rec.url)}" target="_blank" rel="noopener noreferrer">${esc(r.name)}</a>`:esc(r.name)}</td><td>${esc(r.score??'—')}</td><td class="heat" style="${heat(pctile(stats.death,r.avgDeath))}">${r.avgDeath.toFixed(2)}</td><td class="heat" style="${heat(pctile(stats.rounds,r.avgRounds))}">${r.avgRounds.toFixed(2)}</td><td class="heat" style="${heat(pctile(stats.bout,r.maxBout))}">${dmg(r.maxBout)}</td><td>${r.n}</td></tr>`).join('')||`<tr><td colspan="7" style="text-align:center">${ui('没有符合条件的玩家','No players match')}</td></tr>`
      }</tbody></table></div>`;
  }

  document.addEventListener('input',e=>{
    const cq=e.target.closest?.('[data-cq],[data-cmin]');
    if(cq&&host?.contains(cq)){
      if(cq.hasAttribute('data-cq'))state.cs.q=cq.value;else state.cs.min=cq.value;
      state.cs.page=0;clearTimeout(draw.t);draw.t=setTimeout(()=>{const pos=cq.selectionStart,attr=cq.hasAttribute('data-cq')?'[data-cq]':'[data-cmin]';draw();const again=host.querySelector(attr);again?.focus();try{again?.setSelectionRange(pos,pos)}catch{}},300);
      return;
    }
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
    if(e.target.closest?.('[data-dtide-battle-tab]')){if(!state.active)setActive(true);return}
    if(state.active&&e.target.closest?.('[data-dtide-entity]')){setActive(false);return}
    if(!host||!host.contains(e.target))return;
    const dl=e.target.closest('[data-bdownload]');
    if(dl){downloadImage(dl);return}
    const view=e.target.closest('[data-bview]');
    if(view){state.view=view.dataset.bview;draw();return}
    const cs=e.target.closest('[data-csort]');
    if(cs){const k=cs.dataset.csort;if(state.cs.sort===k)state.cs.dir*=-1;else{state.cs.sort=k;state.cs.dir=k==='name'?1:-1}state.cs.page=0;draw();return}
    const sort=e.target.closest('[data-bsort]');
    if(sort){const k=sort.dataset.bsort;if(state.sort===k)state.dir*=-1;else{state.sort=k;state.dir=k==='rank'?1:-1}state.page=0;draw();return}
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

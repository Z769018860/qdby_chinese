// D-Zone map & monster browser: zones -> threat levels -> monsters (data synced from SKeyDB, see scripts/sync_morimens_dzone.mjs).
(()=>{
  'use strict';
  const zh=()=>localStorage.getItem('morimens.language')!=='en';
  const ui=(cn,en)=>zh()?cn:en;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const BASE='data/morimens/skeydb/dzone/';
  const SWAP=['#dtideMatrix','#dtideTableDownload','.dtideCreationFilter','#dtideRatioLegend'];
  const state={active:false,season:null,index:null,wiki:{},game:{},rotations:{},seasons:new Map(),error:null,loading:null};
  let host=null,ctx=null,tab=null,savedTitle=null,switching=false;

  function ensureStyle(){
    if(document.getElementById('dtideZonesStyle'))return;
    const s=document.createElement('style');s.id='dtideZonesStyle';
    s.textContent=`
      .dtideZones{margin-top:18px}.dtideZones h3{font-size:15px;margin:0 0 6px;color:#ead9b9}
      .dzNote{color:#8290a2;font-size:12px;margin:0 0 10px}.dzBar{display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin:10px 0}
      .dzBar label{display:block;font-size:11px;color:#8290a2;margin-bottom:3px}.dzBar select{min-width:260px;max-width:100%;background:#111827;color:#dbe4f0;border:1px solid rgba(148,163,184,.3);border-radius:8px;padding:8px 10px}
      .dzMeta{font-size:12px;color:#aab6c8;display:flex;gap:14px;flex-wrap:wrap;margin:6px 0 12px}
      .dzZone{border:1px solid rgba(148,163,184,.2);border-radius:10px;margin:10px 0;background:rgba(15,25,39,.6)}
      .dzZone>summary{cursor:pointer;padding:10px 14px;font-weight:700;color:#ead9b9;list-style:none;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
      .dzZone>summary::-webkit-details-marker{display:none}.dzZone>summary:before{content:'▸';color:#8290a2}.dzZone[open]>summary:before{content:'▾'}
      .dzZoneBody{padding:0 14px 12px}
      .dzRelics{display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 10px;align-items:center;font-size:12px;color:#8290a2}
      .dzRelic{display:inline-flex;gap:5px;align-items:center;border:1px solid rgba(148,163,184,.2);border-radius:999px;padding:2px 9px 2px 3px;background:#111827;color:#dbe4f0}
      .dzRelic img{width:22px;height:22px;border-radius:50%;object-fit:cover}
      .dzAlert{border:1px solid rgba(148,163,184,.14);border-radius:8px;margin:7px 0;background:#0f1927}
      .dzAlert>summary{cursor:pointer;padding:7px 12px;list-style:none;display:flex;gap:12px;align-items:center;flex-wrap:wrap;font-size:13px;color:#dbe4f0}
      .dzAlert>summary::-webkit-details-marker{display:none}.dzAlert>summary:before{content:'▸';color:#8290a2}.dzAlert[open]>summary:before{content:'▾'}
      .dzAlert .dzTag{margin-left:auto;font-size:11px;color:#8290a2;display:flex;gap:10px}
      .dzMonsters{padding:2px 10px 10px;overflow:auto}.dzTable{width:100%;border-collapse:collapse;font-size:12px}
      .dzTable th,.dzTable td{padding:6px 8px;border-bottom:1px solid rgba(148,163,184,.1);text-align:left;vertical-align:top}
      .dzTable th{color:#8290a2;font-weight:600;white-space:nowrap}.dzTable td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
      .dzMon{display:flex;gap:8px;align-items:center;min-width:150px}.dzMon img{width:40px;height:40px;border-radius:8px;object-fit:cover;background:#111827;flex:none}
      .dzBadge{font-size:10px;border-radius:4px;padding:1px 5px;margin-left:5px;font-weight:700}.dzBadge.Boss{background:#7f1d1d;color:#fecaca}.dzBadge.Elite{background:#78350f;color:#fde68a}
      .dzChar{display:inline-block;font-size:11px;border:1px solid rgba(148,163,184,.25);border-radius:999px;padding:0 7px;margin:1px 3px 1px 0;color:#c7d2e2;cursor:help}
      .dzDesc{color:#8290a2;max-width:360px;white-space:normal;line-height:1.35}
      .dzMonDetails{min-width:190px}.dzMonDetails>summary{cursor:pointer;list-style:none}.dzMonDetails>summary::-webkit-details-marker{display:none}
      .dzMonDetails>summary:after{content:' ▸';color:#8290a2}.dzMonDetails[open]>summary:after{content:' ▾'}
      .dzIntent{padding:9px 0 4px 48px;color:#c7d2e2;line-height:1.5;max-width:560px}.dzIntent p{margin:5px 0}.dzIntent ol{margin:5px 0;padding-left:20px}.dzIntent a{color:#9cc9ef}
      .dzEmpty{color:#8290a2;padding:12px;font-size:13px}
      @media(max-width:700px){.dzDesc{display:none}.dzAlert .dzTag{margin-left:0}}`;
    document.head.appendChild(s);
  }

  async function getJson(url){const r=await fetch(url,{cache:'no-cache'});if(!r.ok)throw new Error(`${url}: HTTP ${r.status}`);return r.json()}
  function load(){
    if(state.index)return Promise.resolve();
    if(!state.loading)state.loading=Promise.all([getJson(BASE+'index.json'),getJson('data/morimens/huiji/dzone-monsters.zh-CN.json').catch(()=>({monsters:{}})),getJson('data/morimens/game/dzone-localization.json').catch(()=>({monsters:{}})),getJson('data/morimens/kaiden/intent-rotations.json').catch(()=>({monsters:{}}))]).then(([d,w,g,k])=>{state.index=d;state.wiki=w.monsters||{};state.game=g.monsters||{};state.rotations=k.monsters||{}}).catch(e=>{state.error=e;state.loading=null;throw e});
    return state.loading;
  }
  async function loadSeason(period){
    if(state.seasons.has(period))return state.seasons.get(period);
    const meta=state.index.seasons.find(s=>s.period===period);
    const doc=await getJson(BASE+meta.path);state.seasons.set(period,doc);return doc;
  }

  // Players' stage stats (only for seasons whose usage records are loaded): key "zoneNumber|threat name".
  function stageStats(period){
    const out=new Map();
    if(!ctx||Number(ctx.season)!==Number(period))return out;
    for(const rec of ctx.records||[])for(const w of rec.waves||[])for(const t of w.teams||[]){
      const m=String(t.stageName||w.stageName||'').match(/Zone\s*(\d+)\s*:\s*(.+)$/i);if(!m)continue;
      const key=m[1]+'|'+m[2].replace(/^Threat Level\s*/i,'').trim();
      const o=out.get(key)||{n:0,best:0,sum:0};o.n++;const sc=Number(t.score)||0;o.sum+=sc;if(sc>o.best)o.best=sc;out.set(key,o);
    }
    return out;
  }

  const fmt=n=>Number(n).toLocaleString('en-US');
  const relicChip=id=>{
    const r=state.index.relics[id];if(!r)return '';
    const img=r.i?`<img src="assets/morimens/relics/${esc(r.i)}.webp" alt="" loading="lazy" onerror="this.style.display='none'">`:'';
    return `<span class="dzRelic" title="${esc(r.n)}">${img}${esc(r.n)}</span>`;
  };
  function wikiMonster(id){
    const entry=state.wiki[id];return entry?.alias?state.wiki[entry.alias]||{}:entry||{};
  }
  function wikiLink(name){return `https://morimens.huijiwiki.com/wiki/${encodeURIComponent(name)}`}
  function monsterRows(alert){
    const mons=state.index.monsters,chars=state.index.characteristics;
    return alert.monsters.map(x=>{
      const m=mons[x.monsterId]||{n:x.monsterId,d:'',a:'',b:[],c:[]};
      const w=wikiMonster(x.monsterId),g=state.game[x.monsterId]||{},rotation=state.rotations[x.monsterId],name=zh()?(g.zh||w.name||m.n):m.n;
      const img=m.a?`<img src="assets/morimens/monster-preview/${esc(m.a)}.webp" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`:'';
      const badges=(m.b||[]).map(b=>`<span class="dzBadge ${esc(b)}">${b==='Boss'?ui('首领','Boss'):ui('精英','Elite')}</span>`).join('');
      const cs=(m.c||[]).map(id=>chars[id]?`<span class="dzChar" title="${esc(chars[id].d)}">${esc(chars[id].n)}</span>`:'').join('');
      const intents=w.intents?.length?`<p><b>${ui('意图效果','Intent effects')}</b></p><ol>${w.intents.map(t=>`<li>${esc(t)}</li>`).join('')}</ol>`:rotation?.rotation?.length?`<p><b>${ui('意图轮换（效果文本为英文）','Intent rotation')}</b></p><ol>${rotation.rotation.map(t=>`<li><b>${esc(zh()&&t.nameZh?t.nameZh:t.name)}</b>${t.type?` · ${esc(t.type)}`:''}：${esc(t.effect)}</li>`).join('')}</ol><a href="${esc(rotation.url)}" target="_blank" rel="noopener noreferrer">${ui('查看意图资料原文','Open rotation source')} ↗</a>`:`<p>${ui('尚无可核实的意图说明。','No verified intent details available yet.')}</p>`;
      const names=g.zh?`<p><b>${ui('名称对照','Names')}：</b>${esc(g.zh)} / ${esc(g.en)}${g.ko?` / ${esc(g.ko)}`:''}</p>`:'';
      const detail=`${names}${w.trait?`<p><b>${ui('特性','Trait')}：</b>${esc(w.trait)}</p>`:''}${intents}${w.cycle?`<p><b>${ui('行动顺序','Action order')}：</b>${esc(w.cycle)}</p>`:''}${w.name?`<a href="${esc(wikiLink(w.name))}" target="_blank" rel="noopener noreferrer">${ui('查看中文 Wiki 原文','Open Chinese Wiki')} ↗</a>`:`<a href="${esc(wikiLink('怪物'))}" target="_blank" rel="noopener noreferrer">${ui('查看中文 Wiki 怪物列表','Open Chinese Wiki monster list')} ↗</a>`}`;
      return `<tr><td><details class="dzMonDetails"><summary><span class="dzMon">${img}<span>${esc(name)}${badges}</span></span></summary><div class="dzIntent">${detail}</div></details></td><td class="n">${x.level??''}</td><td class="n">${x.hp!=null?fmt(x.hp):''}${x.hpBars>1?` ×${x.hpBars}`:''}</td><td>${cs}</td><td class="dzDesc">${esc(zh()&&w.description?w.description:m.d)}</td></tr>`;
    }).join('');
  }
  function alertBody(alert){
    return `<div class="dzMonsters"><table class="dzTable"><thead><tr><th>${ui('怪物','Monster')}</th><th>${ui('等级','Lv')}</th><th>${ui('生命','HP')}</th><th>${ui('特性','Traits')}</th><th>${ui('介绍','Description')}</th></tr></thead><tbody>${monsterRows(alert)}</tbody></table></div>`;
  }

  function seasonLabel(s){
    const d=v=>String(v||'').slice(0,10);
    return `${ui('第','S')}${s.period}${ui('期','')} · ${s.stageEffect||s.name} · ${d(s.start)} ~ ${d(s.end)}`;
  }
  function draw(){
    if(!host)return;
    if(state.error){host.innerHTML=`<div class="dzEmpty">${ui('禁区地图数据加载失败：','Failed to load D-Zone map data: ')}${esc(state.error.message)}</div>`;return}
    if(!state.index){host.innerHTML=`<div class="dzEmpty">${ui('正在加载禁区地图数据…','Loading D-Zone map data…')}</div>`;return}
    const seasons=[...state.index.seasons].sort((a,b)=>b.period-a.period);
    if(state.season==null)state.season=Number(ctx?.season)&&seasons.some(s=>s.period===Number(ctx.season))?Number(ctx.season):seasons[0].period;
    const meta=seasons.find(s=>s.period===state.season)||seasons[0];
    const doc=state.seasons.get(meta.period);
    const head=`<p class="dzNote">${ui('地图数据来自 SKeyDB；中英韩名称来自 Morimens-Localizations；意图详情来自忘却前夜中文维基或 Kaiden.gg，并附原文链接。依次展开区域、威胁等级和怪物查看详情。','Map data from SKeyDB; multilingual names from Morimens-Localizations; intent details from the Chinese Wiki or Kaiden.gg, with source links. Expand a zone, threat level, then monster for details.')}</p>
      <div class="dzBar"><div><label>${ui('期次','Season')}</label><select data-dzseason>${seasons.map(s=>`<option value="${s.period}"${s.period===meta.period?' selected':''}>${esc(seasonLabel(s))}</option>`).join('')}</select></div></div>`;
    if(!doc){host.innerHTML=head+`<div class="dzEmpty">${ui('正在加载…','Loading…')}</div>`;loadSeason(meta.period).then(draw).catch(e=>{state.error=e;draw()});return}
    const stats=stageStats(meta.period);
    const zones=doc.waves.map((w,wi)=>{
      const zoneNo=wi+1;
      const relics=(w.initialRelicIds||[]).map(relicChip).join('');
      const alerts=w.alerts.map((a,ai)=>{
        const letter=a.name.replace(/^Threat Level\s*/i,'').trim();
        const st=stats.get(zoneNo+'|'+letter);
        const total=a.monsters.reduce((s,x)=>s+(x.hp||0)*(x.hpBars||1),0);
        const bosses=a.monsters.filter(x=>(state.index.monsters[x.monsterId]?.b||[]).includes('Boss')).length;
        const tag=`<span class="dzTag"><span>${a.monsters.length} ${ui('只怪','monsters')}${bosses?` · ${bosses} ${ui('首领','Boss')}`:''}</span><span>${ui('总生命','Total HP')} ${fmt(total)}</span>${st?`<span>${st.n} ${ui('队','teams')} · ${ui('最高','Best')} ${st.best}</span>`:''}</span>`;
        return `<details class="dzAlert" data-dzalert="${wi}:${ai}"><summary><b>${esc(a.name)}</b>${tag}</summary></details>`;
      }).join('');
      return `<details class="dzZone"${wi===0?' open':''}><summary>${esc(w.name)}<span class="dzNote" style="margin:0">${w.alerts.length} ${ui('个威胁等级','threat levels')}</span></summary><div class="dzZoneBody">${relics?`<div class="dzRelics"><span>${ui('初始造物','Starting Creations')}</span>${relics}</div>`:''}${alerts}</div></details>`;
    }).join('');
    host.innerHTML=head+`<div class="dzMeta"><span>${esc(meta.name)}</span><span>${ui('区域数','Zones')} ${doc.waves.length}</span>${doc.stageEffect?`<span>${ui('场景效果','Stage Effect')}：${esc(doc.stageEffect)}</span>`:''}</div>`+zones;
  }
  function fillAlert(el){
    if(el.dataset.filled)return;
    const meta=state.index.seasons.find(s=>s.period===state.season);const doc=state.seasons.get(meta.period);
    const [wi,ai]=el.dataset.dzalert.split(':').map(Number);const a=doc?.waves[wi]?.alerts[ai];if(!a)return;
    el.insertAdjacentHTML('beforeend',alertBody(a));el.dataset.filled='1';
  }

  function applySwap(on){
    for(const sel of SWAP){const el=document.querySelector(sel);if(el)el.style.display=on?'none':''}
    const title=document.getElementById('dtideMatrixTitle');
    if(title){if(on){if(savedTitle==null)savedTitle=title.textContent;title.textContent=ui('禁区地图与怪物','D-Zone Maps & Monsters')}else if(savedTitle!=null){title.textContent=savedTitle;savedTitle=null}}
    document.querySelectorAll('.dtideLeaderboardTab').forEach(x=>{if(x===tab)x.setAttribute('aria-selected',String(on));else if(on)x.setAttribute('aria-selected','false')});
  }
  function setActive(on,restore=true){
    state.active=on;
    if(on){
      // reset the leaderboard to the awakener view first (also switches the battle tab off), then take over the panel
      switching=true;try{document.querySelector('[data-dtide-entity=character]')?.click()}finally{switching=false}
      host.hidden=false;document.getElementById('dtideBattle')?.setAttribute('hidden','');
      applySwap(true);
      load().then(draw,draw);draw();
    }else{
      host.hidden=true;
      if(restore)applySwap(false);else{const t=document.getElementById('dtideMatrixTitle');if(t&&savedTitle!=null){t.textContent=savedTitle;savedTitle=null}if(tab)tab.setAttribute('aria-selected','false')}
    }
  }

  function mount(){
    const bar=document.querySelector('.dtideLeaderboardTabs');if(!bar)return false;
    if(!tab||!bar.contains(tab)){
      tab=document.createElement('button');tab.type='button';tab.className='dtideLeaderboardTab';tab.setAttribute('data-dtide-zones-tab','');tab.setAttribute('role','tab');tab.setAttribute('aria-selected','false');
      const filter=bar.querySelector('.dtideCreationFilter');bar.insertBefore(tab,filter||null);
    }
    tab.textContent=ui('禁区地图','Zone Maps');
    const after=document.getElementById('dtideBattle')||document.getElementById('dtideMatrix');
    if(after&&(!host||!host.isConnected)){host=document.createElement('div');host.id='dtideZones';host.className='dtideZones';host.hidden=!state.active;after.after(host)}
    ensureStyle();return true;
  }
  function render(context){ctx=context||ctx;if(!mount())return;if(state.active&&state.season!==null&&ctx&&!state.seasons.size)draw();else if(state.active)draw()}

  document.addEventListener('click',e=>{
    if(e.target.closest?.('[data-dtide-zones-tab]')){if(!state.active)setActive(true);return}
    if(!switching&&state.active&&e.target.closest?.('.dtideLeaderboardTab')){
      // another tab: the battle tab re-hides the matrix itself, entity tabs rely on us restoring it
      setActive(false,!e.target.closest('[data-dtide-battle-tab]'));
    }
  },true);
  document.addEventListener('change',e=>{
    const sel=e.target.closest?.('[data-dzseason]');if(!sel||!host?.contains(sel))return;
    state.season=Number(sel.value);draw();
  });
  document.addEventListener('toggle',e=>{
    const el=e.target;if(el?.matches?.('.dzAlert')&&el.open&&host?.contains(el))fillAlert(el);
  },true);
  window.MorimensDtideZones={render};
})();

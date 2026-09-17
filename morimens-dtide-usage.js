(()=>{
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pct=v=>Number.isFinite(Number(v))?`${Number(v).toFixed(1)}%`:'—';
  const rankCaps=[50,200,500,1000];
  const diffs=['normal','hard','nightmare','madness'];
  const diffZh={all:'全部难度',normal:'普通',hard:'困难',nightmare:'噩梦',madness:'癫狂',unknown:'未识别'};
  const enlightZh={e3:'最高三启',overlimit:'最高超限',law12:'最高+12法则'};
  const zhGear={'April Tribute':'四月礼赞','Re-evolution':'再衍化','Crimson Pulse':'猩红之悸','Dream of Medicine':'入药之梦','Steppenwolf':'荒原狼','Power of the Pious':'虔诚的伟力','Impending Sun':'陨日'};
  let manifest=null,usage=null,usageStats=null,detailUsage=null,detailStats=null,activeSeason=null,bound=false;

  const memberKey=m=>String(m?.skeydbId||m?.ingameId||m?.id||m?.name||'');
  const difficultyOf=(team,wave)=>String(team?.difficulty||wave?.difficulty||'unknown').toLowerCase();
  const enlightOf=m=>m?.enlightTier||(/AA/i.test(String(m?.progression||''))?'law12':/OE/i.test(String(m?.progression||''))?'overlimit':'e3');
  function characterInfo(m){
    const key=m?.skeydbId||m?.ingameId||memberKey(m),db=window.MorimensData?.db?.records||[];
    const rec=db.find(x=>x.id===key||x.ingameId===key||x.ingameId===m?.ingameId);
    const loc=rec&&window.MorimensData?.localizedProfile?.(rec);
    return {name:loc?.name||rec?.name||m?.canonicalName||m?.name||key,image:rec?.assets?.portrait||m?.image||''};
  }
  async function json(url){const r=await fetch(`${url}${url.includes('?')?'&':'?'}v=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error(`${url}: HTTP ${r.status}`);return r.json()}
  function flatten(records=usage?.records||[]){const out=[];for(const record of records)for(const wave of record.waves||[])for(const team of wave.teams||[])out.push({record,wave,team,difficulty:difficultyOf(team,wave)});return out}
  function scopedRows({cap=Number($('dtideRankScope')?.value||50),difficulty=$('dtideDifficulty')?.value||'all',wave=$('dtideWave')?.value||'all',clearType=$('dtideClearType')?.value||'all'}={}){
    return flatten().filter(x=>{
      const rank=Number(x.record.rank);if(Number.isFinite(rank)&&rank>cap)return false;
      if(difficulty!=='all'&&x.difficulty!==difficulty)return false;
      if(wave!=='all'&&Number(x.wave.wave)!==Number(wave))return false;
      if(clearType!=='all'&&x.team.clearType!==clearType)return false;
      return true;
    });
  }
  function add(map,key,meta={}){if(!key)return;const k=String(key),x=map.get(k)||{key:k,count:0,...meta};x.count++;map.set(k,x)}
  function group(rows){
    const chars=new Map(),enlight=new Map();let slots=0;
    for(const {team} of rows){const seen=new Set();for(const m of team.members||[]){slots++;const key=memberKey(m);if(key&&!seen.has(key)){seen.add(key);const info=characterInfo(m);add(chars,key,{name:info.name,image:info.image,ingameId:m.ingameId||null,skeydbId:m.skeydbId||null})}const e=enlightOf(m);add(enlight,e,{name:enlightZh[e]||e})}}
    const teamCount=rows.length,finish=map=>[...map.values()].map(x=>({...x,teamRatePct:teamCount?x.count/teamCount*100:0,slotRatePct:slots?x.count/slots*100:0})).sort((a,b)=>b.count-a.count||String(a.name||a.key).localeCompare(String(b.name||b.key),'zh-CN'));
    return {teamCount,slots,characters:finish(chars),enlight:finish(enlight)};
  }
  function coverage(cap){
    const records=usage?.records||[],rankValues=records.map(x=>Number(x.rank)).filter(Number.isFinite);
    if(!rankValues.length&&records.length)return {covered:records.length,expected:records.length,complete:false,historical:true};
    const stat=usageStats?.rankTiers?.[String(cap)];if(stat)return {covered:Number(stat.covered||0),expected:Number(stat.expected||cap),complete:!!stat.complete,historical:false};
    const ranks=new Set(rankValues.filter(x=>x<=cap));return {covered:ranks.size,expected:cap,complete:ranks.size>=cap,historical:false};
  }
  function coverageLabel(cap){const c=coverage(cap);return c.historical?`历史本地样本 · ${c.covered} 条`:`Top ${cap} · ${c.covered}/${c.expected}${c.complete?'':' 样本'}`}

  function ensureEnlightPanel(){
    if($('dtideUsageEnlight'))return $('dtideUsageEnlight');const host=$('dtideEquipment');if(!host)return null;
    const box=document.createElement('div');box.id='dtideUsageEnlight';box.style.marginBottom='12px';host.before(box);return box;
  }
  function renderCoverage(){
    const cap=Number($('dtideRankScope')?.value||50),c=coverage(cap),box=$('dtideCoverageWarn');if(!box)return;
    box.innerHTML=c.historical?`<div class="dtideNotice">该期没有完整榜单排名索引，当前统计使用已有的 <b>${c.covered}</b> 条本地历史用户记录，不再错误显示为 0/1000。</div>`:c.complete?`<div class="dtideNotice">当前 <b>Top ${cap}</b> 已覆盖 ${c.covered}/${c.expected} 名玩家；出场率按该榜单范围的公开 D-Zone 配队计算。</div>`:`<div class="dtideNotice">当前 <b>Top ${cap}</b> 已回填 <b>${c.covered}/${c.expected}</b> 名玩家。以下百分比为当前有效样本。</div>`;
    const sel=$('dtideRankScope');if(sel)for(const opt of sel.options){const n=Number(opt.value),cc=coverage(n);opt.textContent=cc.historical?`历史样本 · ${cc.covered} 条`:`Top ${n} · ${cc.covered}/${cc.expected}${cc.complete?'':'（回填中）'}`}
  }
  function renderSummary(){
    const g=group(scopedRows()),cap=Number($('dtideRankScope')?.value||50),c=coverage(cap),difficulty=$('dtideDifficulty')?.value||'all';
    if($('dtideSummary'))$('dtideSummary').innerHTML=[['榜单覆盖',`${c.covered}/${c.expected}`],['当前范围',`Top ${cap}`],['难度',diffZh[difficulty]||difficulty],['统计队伍',g.teamCount]].map(([a,b])=>`<div class="dtideStat"><small>${esc(a)}</small><strong>${esc(b)}</strong></div>`).join('');
    if($('dtideStatus'))$('dtideStatus').textContent=`第 ${activeSeason} 期 · ${diffZh[difficulty]||difficulty} · ${coverageLabel(cap)}`;
  }
  function itemName(x){const raw=String(x?.name||x?.canonicalName||x?.label||x?.id||x?.ingameId||x||'未识别');return x?.zhName||x?.nameZh||zhGear[raw]||raw}
  const heatStyle=rate=>{const t=Math.max(0,Math.min(1,Number(rate||0)/35)),h=Math.round(215-215*t),a=(.08+.34*t).toFixed(2);return `--dtide-heat:hsla(${h},78%,46%,${a})`};
  function localGearImage(kind,url){const file=String(url||'').split('/').pop()?.split('?')[0];if(!file)return '';return kind==='wheel'?`assets/morimens/wheels/${file}`:`assets/morimens/covenants/Icon/${file.replace('_Box.webp','.webp')}`}
  function filteredDetailRows(){
    const cap=Number($('dtideRankScope')?.value||50),difficulty=$('dtideDifficulty')?.value||'all',wave=$('dtideWave')?.value||'all';
    return flatten(detailUsage?.records||[]).filter(x=>{const rank=Number(x.record.rank);if(Number.isFinite(rank)&&rank>cap)return false;if(difficulty!=='all'&&x.difficulty!==difficulty)return false;if(wave!=='all'&&Number(x.wave.wave)!==Number(wave))return false;return true});
  }
  function characterDetails(key){
    const mateRows=scopedRows(),gearRows=filteredDetailRows(),mates=new Map(),wheels=new Map(),covenants=new Map();let appearances=0,gearAppearances=0;
    const bump=(map,item)=>{const name=typeof item==='string'?item:itemName(item);if(!name)return;const k=String(item?.id||item?.name||name),v=map.get(k)||{name,image:item?.image||'',count:0};v.count++;map.set(k,v)};
    for(const {team} of mateRows){const members=team.members||[],target=members.find(m=>memberKey(m)===String(key));if(!target)continue;appearances++;const seen=new Set();for(const m of members){const mk=memberKey(m);if(!mk||mk===String(key)||seen.has(mk))continue;seen.add(mk);bump(mates,{name:characterInfo(m).name,image:characterInfo(m).image})}}
    for(const {team} of gearRows){const target=(team.members||[]).find(m=>memberKey(m)===String(key));if(!target)continue;gearAppearances++;for(const x of target.wheels||target.weapons||[])bump(wheels,x);for(const x of target.covenants||target.suits||[])bump(covenants,x)}
    const finish=(map,denom)=>[...map.values()].map(x=>({...x,ratePct:denom?x.count/denom*100:0})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'zh-CN')).slice(0,5);
    return {appearances,gearAppearances,teammates:finish(mates,appearances),wheels:finish(wheels,gearAppearances),covenants:finish(covenants,gearAppearances)};
  }
  function renderUsage(){
    const g=group(scopedRows()),mode=$('dtideRateMode')?.value||'team',host=$('dtideUsage');if(!host)return;
    host.innerHTML=g.characters.slice(0,24).map(c=>`<button type="button" class="dtideUsage" data-usage-character="${esc(c.key)}" aria-expanded="false"><div class="dtideChar">${c.image?`<img src="${esc(c.image)}" alt="">`:''}<span><b>${esc(c.name)}</b><small>${c.count} 支队伍出现 · 点击展开详情</small></span></div><strong>${pct(mode==='slot'?c.slotRatePct:c.teamRatePct)}</strong></button>`).join('')||'<div class="dtideEmpty">当前口径暂无公开配队。</div>';
    host.onclick=e=>{const card=e.target.closest('[data-usage-character]');if(!card)return;const old=host.querySelector('.dtideInlineDetail'),same=old?.dataset.for===card.dataset.usageCharacter;host.querySelectorAll('[data-usage-character]').forEach(x=>x.setAttribute('aria-expanded','false'));old?.remove();if(same)return;const d=characterDetails(card.dataset.usageCharacter),section=(title,arr)=>`<div><h4>${title}</h4><div class="dtideUsageCards">${arr.map(x=>`<div class="dtideUsage"><div><b>${esc(x.name)}</b><small>${x.count} 次同队/采用</small></div><strong>${pct(x.ratePct)}</strong></div>`).join('')||'<div class="dtideEmpty">暂无数据</div>'}</div></div>`;const detail=document.createElement('div');detail.className='dtideInlineDetail';detail.dataset.for=card.dataset.usageCharacter;detail.innerHTML=`<div class="dtideGearSummary"><div><small>该角色样本</small><b>${d.appearances} 支队伍</b></div></div>`+section('Top 5 队友出场率',d.teammates)+section('命轮出场率',d.wheels)+section('密契出场率',d.covenants);card.insertAdjacentElement('afterend',detail);card.setAttribute('aria-expanded','true')};
  }
  function renderMatrix(){
    const cap=Number($('dtideRankScope')?.value||50),difficulty=$('dtideDifficulty')?.value||'all',ct=$('dtideClearType')?.value||'all',mode=$('dtideRateMode')?.value||'team',entity=$('dtideEntityType')?.value||'character';
    let waves=[],groups=new Map(),rows=[];
    if(entity==='character'){
      const all=scopedRows({cap,difficulty,wave:'all',clearType:ct});waves=[...new Set(all.map(x=>Number(x.wave.wave)).filter(Number.isFinite))].sort((a,b)=>a-b);groups=new Map(waves.map(w=>[w,group(all.filter(x=>Number(x.wave.wave)===w))]));const union=new Map();for(const [,g] of groups)for(const c of g.characters)union.set(c.key,c);rows=[...union.values()].map(c=>({...c,total:waves.reduce((sum,w)=>sum+(groups.get(w)?.characters.find(x=>x.key===c.key)?.count||0),0)}));
    }else{
      const source=detailStats?.waves||{};waves=Object.keys(source).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
      groups=new Map(waves.map(w=>{const root=source[String(w)]||{},bucket=difficulty==='all'?(root.all||{}):(root.difficulties?.[difficulty]||root.all||{}),raw=entity==='wheel'?(bucket.wheels||[]):(bucket.covenants||[]);return {teamCount:Number(bucket.teamCount||0),items:raw.map(x=>({...x,key:String(x.key||x.id||x.name),name:itemName(x),image:localGearImage(entity,x.image)}))}}));
      const union=new Map();for(const [,g] of groups)for(const x of g.items)union.set(x.key,x);rows=[...union.values()].map(x=>({...x,total:waves.reduce((sum,w)=>sum+(groups.get(w)?.items.find(y=>y.key===x.key)?.count||0),0)}));
    }
    const sortKey=window.__dtideMatrixSort||'total',asc=window.__dtideMatrixAsc||false,getHit=(w,key)=>entity==='character'?groups.get(w)?.characters.find(x=>x.key===key):groups.get(w)?.items.find(x=>x.key===key);
    rows.sort((a,b)=>{const av=sortKey==='total'?a.total:(getHit(Number(sortKey),a.key)?.count||0),bv=sortKey==='total'?b.total:(getHit(Number(sortKey),b.key)?.count||0),d=bv-av;return (asc?-d:d)||String(a.name||a.key).localeCompare(String(b.name||b.key),'zh-CN')});
    const arrow=k=>k===sortKey?(asc?' ↑':' ↓'):' ↕',host=$('dtideMatrix'),label=entity==='character'?'角色':entity==='wheel'?'命轮':'密契';if(!host)return;if(!rows.length){host.innerHTML='<div class="dtideEmpty">当前口径暂无'+label+'详细数据。</div>';return}
    host.innerHTML=`<table class="dtideTable"><thead><tr><th>${label}</th>${waves.map(w=>`<th><button type="button" class="dtideSortHead" data-sort-key="${w}">Wave ${w}${arrow(String(w))}</button></th>`).join('')}<th><button type="button" class="dtideSortHead" data-sort-key="total">总出现${arrow('total')}</button></th></tr></thead><tbody>${rows.map(c=>`<tr><td>${entity==='character'?`<button type="button" class="dtideMatrixCharacter" data-matrix-character="${esc(c.key)}" aria-expanded="false"><span class="dtideChar">${c.image?`<img src="${esc(c.image)}" alt="">`:''}<span>${esc(c.name)}</span></span></button>`:`<div class="dtideChar">${c.image?`<img class="dtideGearIcon" src="${esc(c.image)}" alt="">`:''}<span>${esc(c.name)}</span></div>`}</td>${waves.map(w=>{const hit=getHit(w,c.key),rate=hit?.teamRatePct||0;return `<td class="dtideRate dtideHeat" style="${heatStyle(rate)}">${pct(rate)}</td>`}).join('')}<td>${c.total}</td></tr>`).join('')}</tbody></table>`;
    host.onclick=e=>{const sort=e.target.closest('[data-sort-key]');if(sort){const key=String(sort.dataset.sortKey);if(window.__dtideMatrixSort===key)window.__dtideMatrixAsc=!window.__dtideMatrixAsc;else{window.__dtideMatrixSort=key;window.__dtideMatrixAsc=false}renderMatrix();return}const btn=e.target.closest('[data-matrix-character]');if(!btn)return;const tbody=btn.closest('tbody'),old=tbody.querySelector('.dtideMatrixDetailRow'),same=old?.dataset.for===btn.dataset.matrixCharacter;tbody.querySelectorAll('[data-matrix-character]').forEach(x=>x.setAttribute('aria-expanded','false'));old?.remove();if(same)return;const d=characterDetails(btn.dataset.matrixCharacter),section=(title,arr)=>`<div><h4>${title}</h4><div class="dtideUsageCards">${arr.map(x=>`<div class="dtideUsage"><div class="dtideChar">${x.image?`<img class="dtideGearIcon" src="${esc(x.image)}" alt="">`:''}<span><b>${esc(x.name)}</b><small>${x.count} 次</small></span></div><strong>${pct(x.ratePct)}</strong></div>`).join('')||'<div class="dtideEmpty">当前详细样本暂无记录</div>'}</div></div>`,tr=document.createElement('tr');tr.className='dtideMatrixDetailRow';tr.dataset.for=btn.dataset.matrixCharacter;tr.innerHTML=`<td colspan="${waves.length+2}"><div class="dtideInlineDetail">${section('Top 5 队友配置出场率',d.teammates)}${section('命轮出场率',d.wheels)}${section('密契出场率',d.covenants)}</div></td>`;btn.closest('tr').insertAdjacentElement('afterend',tr);btn.setAttribute('aria-expanded','true')};
  }
  function compareTable(labels,groups){
    const union=new Map();for(const g of groups)for(const c of g.characters)union.set(c.key,c);const rows=[...union.values()].map(c=>({...c,total:groups.reduce((s,g)=>s+(g.characters.find(x=>x.key===c.key)?.count||0),0)})).sort((a,b)=>b.total-a.total).slice(0,50);if(!rows.length)return '<div class="dtideEmpty">暂无记录。</div>';
    return `<table class="dtideTable"><thead><tr><th>角色</th>${labels.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(c=>`<tr><td>${esc(c.name)}</td>${groups.map(g=>{const h=g.characters.find(x=>x.key===c.key);return `<td class="dtideRate">${pct(h?.teamRatePct||0)}</td>`}).join('')}</tr>`).join('')}</tbody></table>`;
  }
  function renderComparisons(){
    const wave=$('dtideWave')?.value||'all',ct=$('dtideClearType')?.value||'all',difficulty=$('dtideDifficulty')?.value||'all',cap=Number($('dtideRankScope')?.value||50);
    if($('dtideRankCompare'))$('dtideRankCompare').innerHTML=compareTable(rankCaps.map(coverageLabel),rankCaps.map(x=>group(scopedRows({cap:x,difficulty,wave,clearType:ct}))));
    if($('dtideDifficultyCompare'))$('dtideDifficultyCompare').innerHTML=compareTable(diffs.map(x=>diffZh[x]),diffs.map(x=>group(scopedRows({cap,difficulty:x,wave,clearType:ct}))));
  }
  function renderEnlight(){
    const g=group(scopedRows()),box=ensureEnlightPanel();if(!box)return;
    box.innerHTML=`<div class="dtideNotice" style="margin-bottom:9px"><b>启灵分组口径：</b>E0～E3 → 最高三启；OE → 最高超限；AA → 最高+12法则。这里按当前 Top / 难度 / 波次筛选统计角色槽位。</div><div class="dtideUsageCards">${['e3','overlimit','law12'].map(k=>{const x=g.enlight.find(v=>v.key===k);return `<div class="dtideUsage"><div><b>${enlightZh[k]}</b><small>${x?.count||0} 个角色槽位</small></div><strong>${pct(g.slots?(x?.count||0)/g.slots*100:0)}</strong></div>`}).join('')}</div>`;
  }
  function renderAll(){if(!usage)return;queueMicrotask(()=>{renderCoverage();renderSummary();renderMatrix();renderUsage();renderComparisons();renderEnlight()})}

  function fallbackStats(records){
    const ranks=(records||[]).map(x=>Number(x.rank)).filter(Number.isFinite),maxRank=ranks.length?Math.max(...ranks):0;
    const rankTiers={};const historical=!ranks.length&&records?.length;for(const cap of rankCaps){const covered=historical?records.length:ranks.filter(x=>x<=cap).length;rankTiers[String(cap)]={covered,expected:historical?records.length:cap,complete:false}}
    return {seasonId:activeSeason,generatedAt:new Date().toISOString(),rankTiers,maxRankAvailable:maxRank}
  }
  async function loadForSeason(id){
    const entry=manifest?.availableSeasons?.find(x=>String(x.seasonId)===String(id));
    if(!entry){usage=null;usageStats=null;return false}
    try{
      const current=Number(id)===Number(manifest.currentSeason)&&manifest.usageIndex?.path?manifest.usageIndex:null;
      usage=await json((current||entry).path);
      detailUsage=current?await json(entry.path).catch(()=>({records:[]})):usage;
      detailStats=await json(entry.statsPath).catch(()=>null);
      try{usageStats=await json((current||entry).statsPath)}catch(_){usageStats=fallbackStats(usage?.records||[])}
      activeSeason=Number(id);renderAll();return true
    }catch(e){usage=null;usageStats=null;console.warn('season data unavailable',id,e);return false}
  }
  function bind(){if(bound)return;const ids=['dtideRankScope','dtideDifficulty','dtideWave','dtideClearType','dtideRateMode','dtideSort','dtideEntityType'];for(const id of ids)$(id)?.addEventListener('change',()=>setTimeout(renderAll,0));$('dtideSeason')?.addEventListener('change',async()=>{try{await loadForSeason($('dtideSeason').value)}catch(e){console.warn('usage layer season load failed',e)}});bound=true}
  async function init(){
    for(let i=0;i<50&&!$('dtideRankScope');i++)await new Promise(r=>setTimeout(r,100));if(!$('dtideRankScope'))return;
    try{manifest=await json('data/morimens/eremora/manifest.json');bind();const seasonId=$('dtideSeason')?.value||manifest.currentSeason;if(await loadForSeason(seasonId)){
      const note=$('dtideCoverageNote');if(note)note.insertAdjacentHTML('beforeend',` <strong>Top1000 出场率层：</strong>当前使用增量缓存 ${esc(String(manifest.usageIndex.recordCount||usage.recordCount||0))}/${esc(String(manifest.usageIndex.target||1000))} 名公开榜单玩家。`);
    }
  }catch(e){console.warn('Top1000 usage layer unavailable; falling back to detailed snapshot.',e)}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();

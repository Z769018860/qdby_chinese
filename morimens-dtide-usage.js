(()=>{
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pct=v=>Number.isFinite(Number(v))?`${Number(v).toFixed(1)}%`:'—';
  const rankCaps=[50,200,500,1000];
  const diffs=['normal','hard','nightmare','madness'];
  const diffZh={all:'全部难度',normal:'普通',hard:'困难',nightmare:'噩梦',madness:'癫狂',unknown:'未识别'};
  const enlightZh={e3:'最高三启',overlimit:'最高超限',law12:'最高+12法则'};
  let manifest=null,usage=null,usageStats=null,activeSeason=null,bound=false;

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
      const rank=Number(x.record.rank);if(!Number.isFinite(rank)||rank>cap)return false;
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
    const s=usageStats?.rankTiers?.[String(cap)];if(s)return {covered:Number(s.covered||0),expected:Number(s.expected||cap),complete:!!s.complete};
    const ranks=new Set((usage?.records||[]).map(x=>Number(x.rank)).filter(x=>Number.isFinite(x)&&x<=cap));return {covered:ranks.size,expected:cap,complete:ranks.size>=cap};
  }
  function coverageLabel(cap){const c=coverage(cap);return `Top ${cap} · ${c.covered}/${c.expected}${c.complete?'':' 样本'}`}

  function ensureEnlightPanel(){
    if($('dtideUsageEnlight'))return $('dtideUsageEnlight');const host=$('dtideEquipment');if(!host)return null;
    const box=document.createElement('div');box.id='dtideUsageEnlight';box.style.marginBottom='12px';host.before(box);return box;
  }
  function renderCoverage(){
    const cap=Number($('dtideRankScope')?.value||50),c=coverage(cap),box=$('dtideCoverageWarn');if(!box)return;
    box.innerHTML=c.complete?`<div class="dtideNotice">当前 <b>Top ${cap}</b> 已覆盖 ${c.covered}/${c.expected} 名玩家；出场率按该榜单范围的公开 D-Zone 配队计算。</div>`:`<div class="dtideNotice">当前 <b>Top ${cap}</b> 已回填 <b>${c.covered}/${c.expected}</b> 名玩家。以下百分比为当前有效样本，不会标记为完整 Top ${cap}；每日任务会继续补齐缺失记录。</div>`;
    const sel=$('dtideRankScope');if(sel)for(const opt of sel.options){const n=Number(opt.value),cc=coverage(n);opt.textContent=`Top ${n} · ${cc.covered}/${cc.expected}${cc.complete?'':'（回填中）'}`}
  }
  function renderSummary(){
    const g=group(scopedRows()),cap=Number($('dtideRankScope')?.value||50),c=coverage(cap),difficulty=$('dtideDifficulty')?.value||'all';
    if($('dtideSummary'))$('dtideSummary').innerHTML=[['榜单覆盖',`${c.covered}/${c.expected}`],['当前范围',`Top ${cap}`],['难度',diffZh[difficulty]||difficulty],['统计队伍',g.teamCount]].map(([a,b])=>`<div class="dtideStat"><small>${esc(a)}</small><strong>${esc(b)}</strong></div>`).join('');
    if($('dtideStatus'))$('dtideStatus').textContent=`第 ${activeSeason} 期 · ${diffZh[difficulty]||difficulty} · ${coverageLabel(cap)}`;
  }
  function renderUsage(){const g=group(scopedRows()),mode=$('dtideRateMode')?.value||'team',host=$('dtideUsage');if(!host)return;host.innerHTML=g.characters.slice(0,24).map(c=>`<div class="dtideUsage"><div class="dtideChar">${c.image?`<img src="${esc(c.image)}" alt="">`:''}<span><b>${esc(c.name)}</b><small>${c.count} 支队伍出现</small></span></div><strong>${pct(mode==='slot'?c.slotRatePct:c.teamRatePct)}</strong></div>`).join('')||'<div class="dtideEmpty">当前口径暂无公开配队。</div>'}
  function renderMatrix(){
    const cap=Number($('dtideRankScope')?.value||50),difficulty=$('dtideDifficulty')?.value||'all',ct=$('dtideClearType')?.value||'all',mode=$('dtideRateMode')?.value||'team';
    const all=scopedRows({cap,difficulty,wave:'all',clearType:ct}),waves=[...new Set(all.map(x=>Number(x.wave.wave)).filter(Number.isFinite))].sort((a,b)=>a-b),groups=new Map(waves.map(w=>[w,group(all.filter(x=>Number(x.wave.wave)===w))])),union=new Map();
    for(const [,g] of groups)for(const c of g.characters)union.set(c.key,c);
    const sortKey=window.__dtideMatrixSort||'total',asc=window.__dtideMatrixAsc||false;
    const rows=[...union.values()].map(c=>({...c,total:waves.reduce((s,w)=>s+(groups.get(w)?.characters.find(x=>x.key===c.key)?.count||0),0)}));
    rows.sort((a,b)=>{const av=sortKey==='total'?a.total:(groups.get(Number(sortKey))?.characters.find(x=>x.key===a.key)?.count||0),bv=sortKey==='total'?b.total:(groups.get(Number(sortKey))?.characters.find(x=>x.key===b.key)?.count||0),d=bv-av;return (asc?-d:d)||String(a.name||a.key).localeCompare(String(b.name||b.key),'zh-CN')});
    const arrow=k=>k===sortKey?(asc?' ↑':' ↓'):' ↕',host=$('dtideMatrix');if(!host)return;if(!rows.length){host.innerHTML='<div class="dtideEmpty">当前口径暂无记录。</div>';return}
    host.innerHTML=`<table class="dtideTable"><thead><tr><th>角色</th>${waves.map(w=>`<th><button type="button" class="dtideSortHead" data-sort-key="${w}" title="点击切换升降序">Wave ${w}${arrow(String(w))}</button></th>`).join('')}<th><button type="button" class="dtideSortHead" data-sort-key="total" title="点击切换升降序">总出现${arrow('total')}</button></th></tr></thead><tbody>${rows.map(c=>`<tr><td><div class="dtideChar">${c.image?`<img src="${esc(c.image)}" alt="">`:''}<span>${esc(c.name)}</span></div></td>${waves.map(w=>{const g=groups.get(w),hit=g?.characters.find(x=>x.key===c.key),rate=mode==='slot'?(hit?.slotRatePct||0):(hit?.teamRatePct||0);return `<td class="dtideRate">${pct(rate)}</td>`}).join('')}<td>${c.total}</td></tr>`).join('')}</tbody></table>`;
    host.onclick=e=>{const btn=e.target.closest('[data-sort-key]');if(!btn)return;const key=String(btn.dataset.sortKey);if(window.__dtideMatrixSort===key)window.__dtideMatrixAsc=!window.__dtideMatrixAsc;else{window.__dtideMatrixSort=key;window.__dtideMatrixAsc=false}renderMatrix()};
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
    const rankTiers={};for(const cap of rankCaps){const covered=ranks.filter(x=>x<=cap).length;rankTiers[String(cap)]={covered,expected:cap,complete:covered>=cap}}
    return {seasonId:activeSeason,generatedAt:new Date().toISOString(),rankTiers,maxRankAvailable:maxRank}
  }
  async function loadForSeason(id){
    const entry=manifest?.availableSeasons?.find(x=>String(x.seasonId)===String(id));
    if(!entry){usage=null;usageStats=null;return false}
    try{
      const current=Number(id)===Number(manifest.currentSeason)&&manifest.usageIndex?.path?manifest.usageIndex:null;
      usage=await json((current||entry).path);
      try{usageStats=await json((current||entry).statsPath)}catch(_){usageStats=fallbackStats(usage?.records||[])}
      activeSeason=Number(id);renderAll();return true
    }catch(e){usage=null;usageStats=null;console.warn('season data unavailable',id,e);return false}
  }
  function bind(){if(bound)return;const ids=['dtideRankScope','dtideDifficulty','dtideWave','dtideClearType','dtideRateMode','dtideSort'];for(const id of ids)$(id)?.addEventListener('change',()=>setTimeout(renderAll,0));$('dtideSeason')?.addEventListener('change',async()=>{try{await loadForSeason($('dtideSeason').value)}catch(e){console.warn('usage layer season load failed',e)}});bound=true}
  async function init(){
    for(let i=0;i<50&&!$('dtideRankScope');i++)await new Promise(r=>setTimeout(r,100));if(!$('dtideRankScope'))return;
    try{manifest=await json('data/morimens/eremora/manifest.json');bind();const seasonId=$('dtideSeason')?.value||manifest.currentSeason;if(await loadForSeason(seasonId)){
      const note=$('dtideCoverageNote');if(note)note.insertAdjacentHTML('beforeend',` <strong>Top1000 出场率层：</strong>当前使用增量缓存 ${esc(String(manifest.usageIndex.recordCount||usage.recordCount||0))}/${esc(String(manifest.usageIndex.target||1000))} 名公开榜单玩家。`);
    }
  }catch(e){console.warn('Top1000 usage layer unavailable; falling back to detailed snapshot.',e)}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();

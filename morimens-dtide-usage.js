(()=>{
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pct=v=>Number.isFinite(Number(v))?`${Number(v).toFixed(1)}%`:'—';
  const rankCaps=[50,200,500,1000];
  const diffs=['normal','hard','nightmare','madness'];
  const diffZh={all:'全部难度',normal:'普通',hard:'困难',nightmare:'噩梦',madness:'癫狂',unknown:'未识别'};
  const enlightZh={low:'0～2启',e3plus3:'3启～+3',plus4plus11:'+4～+11',plus12:'+12'};
  const enlightKeys=['low','e3plus3','plus4plus11','plus12'];
  const enlightColors={low:'#7b8798',e3plus3:'#d9a441',plus4plus11:'#62b7ff',plus12:'#d978d0',unknown:'#5f6b7a'};
  const wheelStackKeys=['stack0_2','stack3_11','stack12'];
  const wheelStackZh={stack0_2:'0～2叠',stack3_11:'3叠～+11',stack12:'+12'};
  const wheelStackColors={stack0_2:'#8c97a8',stack3_11:'#62b7ff',stack12:'#d978d0'};
  const zhGear={'April Tribute':'四月礼赞','Re-evolution':'再衍化','Crimson Pulse':'猩红之悸','Dream of Medicine':'入药之梦','Steppenwolf':'荒原狼','Power of the Pious':'虔诚的伟力','Impending Sun':'陨日'};
  let manifest=null,usage=null,usageStats=null,detailUsage=null,detailStats=null,previousUsage=null,previousDetailUsage=null,previousSeasonId=null,activeSeason=null,bound=false,dataVersion='1',gearByName=new Map(),rankByUid=new Map();

  function scoreRange(){
    const raw=String($('dtideTotalScore')?.value||'all');
    if(raw==='all'||raw==='0')return null;
    const [lo,hi]=raw.split(':').map(Number);
    if(Number.isFinite(lo)&&Number.isFinite(hi))return [lo,hi];
    const min=Number(raw);return Number.isFinite(min)&&min>0?[min,Infinity]:null;
  }
  function scoreMatches(record){
    const range=scoreRange();if(!range)return true;
    const score=Number(record?.score);return Number.isFinite(score)&&score>=range[0]&&score<=range[1];
  }
  function rankOf(record){
    const mapped=rankByUid.get(String(record?.uid??''));
    if(Number.isFinite(mapped)&&mapped>0)return mapped;
    const raw=Number(record?.rank);return Number.isFinite(raw)&&raw>0?raw:null;
  }
  function rankMatches(record,cap){
    if(!cap)return true;
    const rank=rankOf(record);if(rank!=null)return rank<=cap;
    const current=Number(activeSeason)===Number(manifest?.currentSeason);
    return !current&&rankByUid.size===0;
  }
  function selectedRankCap(){const raw=String($('dtideRankScope')?.value||'all');return raw==='all'||raw==='0'?0:(Number(raw)||0)}
  function rankScopeLabel(cap){return cap?`Top ${cap}`:'全部范围'}

  const memberKey=m=>String(m?.skeydbId||m?.ingameId||m?.id||m?.name||'');
  const difficultyOf=(team,wave)=>{const raw=String(team?.difficulty||team?.stageName||wave?.difficulty||wave?.stageName||'unknown').toLowerCase();return diffs.find(d=>new RegExp(`(?:^|[^a-z])${d}(?:$|[^a-z])`,'i').test(raw))||'unknown'};
  const enlightOf=m=>{const p=Number(m?.potencyLevel);if(Number.isFinite(p))return p<=2?'low':p<=6?'e3plus3':p<=14?'plus4plus11':'plus12';const n=Number(m?.enlightenCount);if(Number.isFinite(n))return n<=2?'low':n===3?'e3plus3':n===4?'plus4plus11':'plus12';return /AA/i.test(String(m?.progression||''))?'plus12':/OE/i.test(String(m?.progression||''))?'plus4plus11':/E[0-2]/i.test(String(m?.progression||''))?'low':'e3plus3'};
  function displayCharacterName(...values){return values.find(value=>{const name=String(value||'').trim();return name&&!/^(awakener|unknown|角色|唤醒体)$/i.test(name)})||'未知'}
  function characterInfo(m){
    const key=m?.skeydbId||m?.ingameId||memberKey(m),db=window.MorimensData?.db?.records||[];
    const rec=db.find(x=>x.id===key||x.ingameId===key||x.ingameId===m?.ingameId);
    const loc=rec&&window.MorimensData?.localizedProfile?.(rec);
    return {name:displayCharacterName(loc?.name,m?.canonicalName,m?.name,rec?.name,key),image:rec?.assets?.portrait||m?.image||'',art:rec?.assets?.card||rec?.assets?.portrait||m?.image||''};
  }
  const versioned=url=>`${url}${url.includes('?')?'&':'?'}v=${encodeURIComponent(dataVersion)}`;
  async function json(url,{fresh=false}={}){
    const loader=window.MorimensDtideDataLoader;
    if(loader?.loadJson)return loader.loadJson(url,{revision:dataVersion,fresh});
    const r=await fetch(versioned(url),{cache:fresh?'no-store':'force-cache'});
    if(!r.ok)throw new Error(`${url}: HTTP ${r.status}`);
    return r.json();
  }
  async function loadGearCatalog(){
    try{const [wheels,relics,assets]=await Promise.all([json('data/morimens/skeydb/public-v3/indexes/search-wheels.json'),json('data/morimens/skeydb/public-v3/indexes/search-relics.json'),json('data/morimens/skeydb/public-v3/indexes/assets.json')]);for(const row of [...(wheels.records||[]),...(relics.records||[])]){const assetId=assets.entities?.[row.id]?.icon,asset=assets.assets?.[assetId],file=asset?.assetId?`${asset.assetId}.webp`:'';for(const name of [row.name,...(row.aliases||[])])if(name)gearByName.set(String(name).replace(/^"|"$/g,''),{file,kind:row.kind})}}catch(e){console.warn('gear catalog unavailable',e)}
  }
  async function dataset(url){
    const loader=window.MorimensDtideDataLoader;
    if(!loader?.loadDataset)throw new Error('D-Zone shared data loader unavailable');
    return loader.loadDataset(url);
  }
  function flatten(records=usage?.records||[]){const unique=new Map(),richness=t=>(t.token?8:0)+(t.creations?.length||0)*3+(t.members||[]).reduce((n,m)=>n+(m.wheels?.length||m.weapons?.length||0)*4+(m.covenants?.length||m.suits?.length||(m.covenant?1:0))*4+(m.covenantScore!=null?2:0)+(m.level!=null?1:0)+(m.enlightenment?.length||0),0);for(const record of records){const rank=rankOf(record),normalized=rank!=null&&record.rank!==rank?{...record,rank}:record;for(const wave of normalized.waves||[])for(const team of wave.teams||[]){const difficulty=difficultyOf(team,wave),members=(team.members||[]).map(m=>String(m.ingameId||m.skeydbId||m.id||m.canonicalName||m.name||'')).filter(Boolean).sort().join(','),key=[normalized.uid||normalized.rank||'',wave.wave||'',team.clearType||'',difficulty,members].join('|'),row={record:normalized,wave,team,difficulty},old=unique.get(key);if(!old||richness(team)>richness(old.team))unique.set(key,row)}}return [...unique.values()]}
  async function loadRankMap(id){
    rankByUid=new Map();
    if(Number(id)!==Number(manifest?.currentSeason))return rankByUid;
    const loader=window.MorimensDtideDataLoader;
    const path=manifest?.rankIndex?.path||`data/morimens/eremora/rank-index/${id}.json`;
    if(!loader?.loadRankMap)return rankByUid;
    try{rankByUid=await loader.loadRankMap(path,{revision:dataVersion,fresh:true})}
    catch(e){console.warn('rank index unavailable',id,e);rankByUid=new Map()}
    return rankByUid;
  }
  function scopedRows({cap=selectedRankCap(),difficulty=$('dtideDifficulty')?.value||'all',wave='all',clearType=$('dtideClearType')?.value||'all'}={}){
    return flatten().filter(x=>{
      if(!rankMatches(x.record,cap))return false;
      if(difficulty!=='all'&&x.difficulty!==difficulty)return false;
      if(!scoreMatches(x.record))return false;
      if(wave!=='all'&&Number(x.wave.wave)!==Number(wave))return false;
      if(clearType!=='all'&&x.team.clearType!==clearType)return false;
      return true;
    });
  }
  function add(map,key,meta={}){if(!key)return;const k=String(key),x=map.get(k)||{key:k,count:0,...meta};x.count++;map.set(k,x)}
  function group(rows){
    const chars=new Map(),enlight=new Map();let slots=0;
    for(const {team} of rows){const seen=new Set();for(const m of team.members||[]){slots++;const key=memberKey(m),e=enlightOf(m);if(key&&!seen.has(key)){seen.add(key);const info=characterInfo(m);add(chars,key,{name:info.name,image:info.image,ingameId:m.ingameId||null,skeydbId:m.skeydbId||null,enlightCounts:{},borrowedCount:0});const character=chars.get(String(key));character.enlightCounts[e]=(character.enlightCounts[e]||0)+1;if(m.borrowed)character.borrowedCount=(character.borrowedCount||0)+1}add(enlight,e,{name:enlightZh[e]||e})}}
    const teamCount=rows.length,finish=map=>[...map.values()].map(x=>({...x,teamRatePct:teamCount?x.count/teamCount*100:0,slotRatePct:slots?x.count/slots*100:0,assistRatePct:x.count?(Number(x.borrowedCount||0)/x.count*100):0})).sort((a,b)=>b.count-a.count||String(a.name||a.key).localeCompare(String(b.name||b.key),'zh-CN'));
    return {teamCount,slots,characters:finish(chars),enlight:finish(enlight)};
  }
  function enlightBar(character){
    const counts=character?.enlightCounts||{},items=enlightKeys.map(key=>({key,count:Number(counts[key]||0)})).filter(x=>x.count>0),total=items.reduce((sum,x)=>sum+x.count,0);
    if(!total)return '<div class="dtideEnlightBar" title="启灵数据缺失"><span style="width:100%;background:#5f6b7a"></span></div>';
    const title=items.map(x=>`${enlightZh[x.key]} ${pct(x.count/total*100)}`).join(' · ');
    return `<div class="dtideEnlightBar" title="${esc(title)}" aria-label="${esc(title)}">${items.map(x=>`<span style="width:${x.count/total*100}%;background:${enlightColors[x.key]}"></span>`).join('')}</div>`;
  }
  function coverage(cap){
    const records=usage?.records||[],rankValues=records.map(rankOf).filter(Number.isFinite);
    if(!cap)return {covered:records.length,expected:records.length,complete:true,historical:!rankValues.length&&records.length>0,all:true};
    const distinctRanks=new Set(rankValues);
    if(records.length&&distinctRanks.size<Math.min(10,records.length)){const covered=Math.min(records.length,cap);return {covered,expected:cap,complete:covered>=cap,historical:false}}
    if(!rankValues.length&&records.length)return {covered:records.length,expected:records.length,complete:false,historical:true};
    const stat=usageStats?.rankTiers?.[String(cap)];if(stat)return {covered:Number(stat.covered||0),expected:Number(stat.expected||cap),complete:!!stat.complete,historical:false};
    const ranks=new Set(rankValues.filter(x=>x<=cap));return {covered:ranks.size,expected:cap,complete:ranks.size>=cap,historical:false};
  }
  function coverageLabel(cap){const c=coverage(cap);if(!cap)return `全部范围 · ${c.covered} 条`;return c.historical?`历史本地样本 · ${c.covered} 条`:`Top ${cap} · ${c.covered}/${c.expected}${c.complete?'':' 样本'}`}

  function ensureEnlightPanel(){
    if($('dtideUsageEnlight'))return $('dtideUsageEnlight');const host=$('dtideEquipment');if(!host)return null;
    const box=document.createElement('div');box.id='dtideUsageEnlight';box.style.marginBottom='12px';host.before(box);return box;
  }
  function renderCoverage(){
    const cap=selectedRankCap(),c=coverage(cap),box=$('dtideCoverageWarn');if(!box)return;
    box.innerHTML=!cap?`<div class="dtideNotice">当前为 <b>全部范围</b>，统计所有已下载用户，并包含暂时无法匹配榜单名次的用户。</div>`:c.historical?`<div class="dtideNotice">该期没有完整榜单排名索引，当前统计使用已有的 <b>${c.covered}</b> 条本地历史用户记录。</div>`:c.complete?`<div class="dtideNotice">当前 <b>Top ${cap}</b> 已覆盖 ${c.covered}/${c.expected} 名玩家；出场率按该榜单范围计算。</div>`:`<div class="dtideNotice">当前 <b>Top ${cap}</b> 已回填 <b>${c.covered}/${c.expected}</b> 名玩家。以下百分比为当前有效样本。</div>`;
    const sel=$('dtideRankScope');if(sel)for(const opt of sel.options){if(opt.value==='all'||opt.value==='0'){opt.textContent='全部范围（含未知排名）';continue}const n=Number(opt.value),cc=coverage(n);opt.textContent=cc.historical?`历史样本 · ${cc.covered} 条`:`Top ${n} · ${cc.covered}/${cc.expected}${cc.complete?'':'（回填中）'}`}
  }
  function renderSummary(){
    const g=group(scopedRows()),cap=selectedRankCap(),c=coverage(cap),difficulty=$('dtideDifficulty')?.value||'all';
    if($('dtideSummary'))$('dtideSummary').innerHTML=[['榜单覆盖',!cap?`${c.covered} 条`:`${c.covered}/${c.expected}`],['当前范围',rankScopeLabel(cap)],['难度',diffZh[difficulty]||difficulty],['统计队伍',g.teamCount]].map(([a,b])=>`<div class="dtideStat"><small>${esc(a)}</small><strong>${esc(b)}</strong></div>`).join('');
    if($('dtideStatus'))$('dtideStatus').textContent=`第 ${activeSeason} 期 · ${diffZh[difficulty]||difficulty} · ${coverageLabel(cap)}`;
  }
  const creationZh={'"Chaos Ring"':'「混沌指轮」','Chaos Ring':'「混沌指轮」','Rusted Key':'锈蚀钥匙','Forgotten Loom+':'遗忘织机+','Chronometric Device+':'计时装置+','Black Candle':'黑色蜡烛','Omen Ritual Bird':'预兆仪式鸟','Foreign Stamp Album+':'异国邮票册+','Vitality Injection+':'活性注射器+','Vitality Injection':'活性注射器','Blessed Blood+':'祝福之血+','Blessed Blood':'祝福之血','Weeping Pipe+':'哭泣烟斗+','Weeping Pipe':'哭泣烟斗','Octahedron Dice':'八面骰','Lucky Windcoat':'幸运风衣','Malignant Child+':'恶性之子+','Malignant Child':'恶性之子','Solar Disc+':'太阳圆盘+','Solar Disc':'太阳圆盘','Rite of Spring+':'春之祭+','Rite of Spring':'春之祭','Big Mouth Button':'大嘴纽扣','Crimson Brooch+':'猩红胸针+','Crimson Brooch':'猩红胸针','Proto Battery+':'原型电池+','Proto Battery':'原型电池','Kaleidoscope+':'万花筒+','Kaleidoscope':'万花筒','Preserved Butterfly+':'封存蝴蝶+','Preserved Butterfly':'封存蝴蝶','Forsaken Blood':'遗弃之血','Relic of the Past+':'往昔遗物+','Relic of the Past':'往昔遗物','Celestial Astrolabe+':'天体星盘+','Celestial Astrolabe':'天体星盘'};
  function itemName(x){const raw=String(x?.name||x?.canonicalName||x?.label||x?.id||x?.ingameId||x||'未识别'),clean=raw.replace(/^"|"$/g,'');if(/^Dimensional Image:/i.test(clean))return `维度影像：${clean.replace(/^Dimensional Image:\s*/i,'')}`;return x?.zhName||x?.nameZh||creationZh[raw]||creationZh[clean]||zhGear[raw]||gearByName.get(clean)?.zhName||raw}
  function wheelName(x){return window.MorimensData?.localizedEntity?.('wheel',x)?.name||itemName(x)}
  const heatStyle=(rate,max=35)=>{const t=Math.max(0,Math.min(1,Number(rate||0)/max)),h=Math.round(215-215*t),a=(.08+.34*t).toFixed(2);return `--dtide-heat:hsla(${h},78%,46%,${a})`};
  function localGearImage(kind,url,name=''){const raw=String(url||''),file=raw.split('/').pop()?.split('?')[0]||gearByName.get(String(name).replace(/^"|"$/g,''))?.file||'';if(!file)return '';if(kind==='wheel')return `assets/morimens/wheels/${file}`;if(kind==='covenant')return `assets/morimens/covenants/Icon/${file.replace('_Box.webp','.webp')}`;if(kind==='creation')return `assets/morimens/relics/${file}`;if(kind==='token')return raw.replace('/icon/','/thumb/icon/');return ''}
  function wheelStackClass(wheel){const level=Number(wheel?.level);if(!Number.isFinite(level)||level<=2)return 'stack0_2';if(level>=15)return 'stack12';return 'stack3_11'}
  function wheelRatioBar(wheel){const counts=wheel?.stackCounts||{},total=wheelStackKeys.reduce((sum,key)=>sum+Number(counts[key]||0),0);if(!total)return '<div class="dtideRatioBar" title="暂无叠位数据"></div>';const title=wheelStackKeys.map(key=>`${wheelStackZh[key]} ${pct(Number(counts[key]||0)/total*100)}`).join(' · ');return `<div class="dtideRatioBar" title="${esc(title)}" aria-label="${esc(title)}">${wheelStackKeys.filter(key=>Number(counts[key]||0)>0).map(key=>`<span style="width:${Number(counts[key]||0)/total*100}%;background:${wheelStackColors[key]}"></span>`).join('')}</div>`}
  function tokenImage(name){for(const {team} of flatten(detailUsage?.records||[])){const token=team.token;if(token&&itemName(token)===name&&token.image)return String(token.image).replace('/icon/','/thumb/icon/')}return ''}
  function filteredDetailRows(){
    const cap=selectedRankCap(),difficulty=$('dtideDifficulty')?.value||'all';
    return flatten(detailUsage?.records||[]).filter(x=>{if(!rankMatches(x.record,cap))return false;if(difficulty!=='all'&&x.difficulty!==difficulty)return false;if(!scoreMatches(x.record))return false;return true});
  }
  function wheelGroup(rows){
    const map=new Map();
    for(const {team} of rows){const seen=new Set();for(const member of team.members||[])for(const wheel of member.wheels||member.weapons||[]){const key=String(wheel.id??wheel.name??'');if(!key||seen.has(key))continue;seen.add(key);const remote=wheel.image||'',item=map.get(key)||{key,id:wheel.id??null,name:wheelName(wheel),image:localGearImage('wheel',remote,wheel.name),fallbackImage:remote,count:0,stackCounts:{}};item.count++;if(!item.image)item.image=localGearImage('wheel',remote,wheel.name);if(!item.fallbackImage&&remote)item.fallbackImage=remote;const stack=wheelStackClass(wheel);item.stackCounts[stack]=(item.stackCounts[stack]||0)+1;map.set(key,item)}}
    const teamCount=rows.length||0,items=[...map.values()].map(x=>({...x,teamRatePct:teamCount?x.count/teamCount*100:0})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'zh-CN'));
    return {teamCount,items};
  }
  function creationGroup(rows){
    const map=new Map();
    for(const {team} of rows){const seen=new Set();for(const creation of team.creations||[]){const key=String(creation.id??creation.name??'');if(!key||seen.has(key))continue;seen.add(key);const remote=creation.image||'',item=map.get(key)||{key,id:creation.id??null,name:itemName(creation),image:localGearImage('creation',remote,creation.name),fallbackImage:remote,count:0};item.count++;map.set(key,item)}}
    const teamCount=rows.length||0,items=[...map.values()].map(x=>({...x,teamRatePct:teamCount?x.count/teamCount*100:0})).filter(x=>{if(!$('dtideCreationFilter')?.checked)return true;const name=String(x.name||'').replace(/^"|"$/g,'').trim();return x.teamRatePct<100&&!/^维度影像(?:：|$)/.test(name)&&!/^(?:锈蚀钥匙|Rusted Key)$/i.test(name)}).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'zh-CN'));
    return {teamCount,items};
  }
  const entityGroup=(rows,entity)=>entity==='character'?group(rows):entity==='creation'?creationGroup(rows):wheelGroup(rows);
  function rowsFor(records,{cap,difficulty,clearType}){
    return flatten(records).filter(x=>{if(!rankMatches(x.record,cap))return false;if(difficulty!=='all'&&x.difficulty!==difficulty)return false;if(!scoreMatches(x.record))return false;if(clearType!=='all'&&x.team.clearType!==clearType)return false;return true});
  }
  function rankedRows(records,entity,{cap,difficulty,clearType,sortKey,asc}){
    const all=rowsFor(records,{cap,difficulty,clearType}),waves=[...new Set(all.map(x=>Number(x.wave.wave)).filter(Number.isFinite))].sort((a,b)=>a-b);
    const groups=new Map(waves.map(w=>[w,entityGroup(all.filter(x=>Number(x.wave.wave)===w),entity)]));
    const union=new Map();for(const [,g] of groups)for(const x of entity==='character'?g.characters:g.items)union.set(x.key,x);
    if(entity==='character'){const totals=new Map(group(all).characters.map(x=>[x.key,x]));for(const [key,item] of union){const total=totals.get(key);if(total){item.enlightCounts=total.enlightCounts;item.borrowedCount=total.borrowedCount||0;item.assistRatePct=total.assistRatePct||0}}}
    const indexes=new Map([...groups].map(([w,g])=>[w,new Map((entity==='character'?g.characters:g.items).map(x=>[x.key,x]))])),hit=(w,key)=>indexes.get(w)?.get(key);
    const rows=[...union.values()].map(x=>{const row={...x,total:waves.reduce((sum,w)=>sum+(hit(w,x.key)?.count||0),0)};if(entity==='wheel'){row.stackCounts={};for(const w of waves){const counts=hit(w,x.key)?.stackCounts||{};for(const key of wheelStackKeys)row.stackCounts[key]=(row.stackCounts[key]||0)+Number(counts[key]||0)}const firstImage=waves.map(w=>hit(w,x.key)).find(item=>item?.image);if(firstImage){row.image=firstImage.image;row.fallbackImage=firstImage.fallbackImage||row.fallbackImage}}return row});
    rows.sort((a,b)=>{const av=sortKey==='total'?a.total:sortKey==='assist'?(a.assistRatePct||0):(hit(Number(sortKey),a.key)?.count||0),bv=sortKey==='total'?b.total:sortKey==='assist'?(b.assistRatePct||0):(hit(Number(sortKey),b.key)?.count||0),d=bv-av;return (asc?-d:d)||String(a.name||a.key).localeCompare(String(b.name||b.key),'zh-CN')});
    return {rows,waves,groups,hit};
  }
  function rankChange(currentRank,previousRank){
    if(!previousSeasonId)return '<small class="dtideRankSame">—</small>';
    if(!previousRank)return `<small class="dtideRankNew" title="第 ${previousSeasonId} 期未上榜">NEW</small>`;
    const delta=previousRank-currentRank;
    if(delta>0)return `<small class="dtideRankUp" title="较第 ${previousSeasonId} 期上升 ${delta} 名">▲ ${delta}</small>`;
    if(delta<0)return `<small class="dtideRankDown" title="较第 ${previousSeasonId} 期下降 ${Math.abs(delta)} 名">▼ ${Math.abs(delta)}</small>`;
    return `<small class="dtideRankSame" title="较第 ${previousSeasonId} 期排名不变">＝</small>`;
  }
  function characterDetails(key){
    const mateRows=scopedRows(),gearRows=filteredDetailRows(),mates=new Map(),wheels=new Map(),covenants=new Map(),tokens=new Map(),creations=new Map(),enlightment=new Map(),squads=new Map();
    let appearances=0,gearAppearances=0,completeSquadAppearances=0,profile=null;
    const bump=(map,item,kind='')=>{const name=typeof item==='string'?item:(kind==='wheel'?wheelName(item):itemName(item));if(!name)return;const k=String(item?.id||item?.name||name),remote=item?.image||'',v=map.get(k)||{name,image:kind?localGearImage(kind,remote):remote,fallbackImage:kind?remote:'',count:0};v.count++;map.set(k,v)};
    for(const {team} of mateRows){
      const members=team.members||[],target=members.find(m=>memberKey(m)===String(key));if(!target)continue;
      appearances++;
      if(!profile){const info=characterInfo(target);profile={key:String(key),name:info.name,image:info.image||target.image||'',art:info.art||info.image||target.image||''}}
      const ek=enlightOf(target),ev=enlightment.get(ek)||{key:ek,name:enlightZh[ek]||ek,count:0};ev.count++;enlightment.set(ek,ev);
      if(team.token)bump(tokens,team.token,'token');for(const x of team.creations||[])bump(creations,x,'creation');
      const seen=new Set();for(const m of members){const mk=memberKey(m);if(!mk||mk===String(key)||seen.has(mk))continue;seen.add(mk);bump(mates,{name:characterInfo(m).name,image:characterInfo(m).image})}
      const squad=[],squadSeen=new Set();
      for(const m of members){const mk=memberKey(m);if(!mk||squadSeen.has(mk))continue;squadSeen.add(mk);const info=characterInfo(m);squad.push({key:mk,name:info.name,image:info.image||m.image||''})}
      if(squad.length===4){
        completeSquadAppearances++;
        const squadKey=squad.map(m=>m.key).sort().join('|');
        const ordered=[...squad].sort((a,b)=>a.key===String(key)?-1:b.key===String(key)?1:0);
        const sv=squads.get(squadKey)||{key:squadKey,members:ordered,count:0};sv.count++;squads.set(squadKey,sv);
      }
    }
    for(const {team} of gearRows){const target=(team.members||[]).find(m=>memberKey(m)===String(key));if(!target)continue;gearAppearances++;for(const x of target.wheels||target.weapons||[])bump(wheels,x,'wheel');for(const x of target.covenants||target.suits||[])bump(covenants,x,'covenant')}
    const finish=(map,denom)=>[...map.values()].map(x=>({...x,ratePct:denom?x.count/denom*100:0})).sort((a,b)=>b.count-a.count||String(a.name||a.key).localeCompare(String(b.name||b.key),'zh-CN')).slice(0,5);
    const enlight=[...enlightment.values()].map(x=>({...x,ratePct:appearances?x.count/appearances*100:0})).sort((a,b)=>b.count-a.count||enlightKeys.indexOf(a.key)-enlightKeys.indexOf(b.key));
    const teamCompositions=[...squads.values()].map(x=>({...x,ratePct:completeSquadAppearances?x.count/completeSquadAppearances*100:0})).sort((a,b)=>b.count-a.count||a.members.map(m=>m.name).join('/').localeCompare(b.members.map(m=>m.name).join('/'),'zh-CN')).slice(0,5);
    return {appearances,gearAppearances,completeSquadAppearances,profile,enlight,teamCompositions,teammates:finish(mates,appearances),wheels:finish(wheels,gearAppearances),covenants:finish(covenants,gearAppearances),tokens:finish(tokens,appearances),creations:finish(creations,appearances)};
  }
  function characterInsightHtml(d){
    const p=d.profile||{},enlight=(d.enlight||[]).map(x=>`<div class="dtideInsightEnlightRow"><span>${esc(x.name)}</span><small>${x.count} 次</small><b>${pct(x.ratePct)}</b></div>`).join('')||'<div class="dtideEmpty">暂无启灵数据</div>';
    const squads=(d.teamCompositions||[]).map((team,index)=>`<div class="dtideSquadRow"><span class="dtideSquadRank">${index+1}</span><div class="dtideSquadMembers">${team.members.map(m=>`<div class="dtideSquadMember">${m.image?`<img src="${esc(m.image)}" alt="" loading="lazy">`:''}<span>${esc(m.name)}</span></div>`).join('')}</div><div class="dtideSquadRate"><b>${pct(team.ratePct)}</b><small>${team.count} 次</small></div></div>`).join('')||'<div class="dtideEmpty">当前筛选下暂无完整四人队记录</div>';
    return `<div class="dtideCharacterInsight"><div class="dtideCharacterPortrait"><div class="dtideCharacterPortraitImage">${p.art?`<img src="${esc(p.art)}" alt="${esc(p.name||'角色立绘')}" loading="lazy">`:'<span>暂无立绘</span>'}</div><b>${esc(p.name||'角色')}</b><small>角色立绘</small></div><div class="dtideCharacterInsightRight"><section class="dtideInsightPanel"><h4>启灵分布</h4><div class="dtideInsightEnlight">${enlight}</div></section><section class="dtideInsightPanel"><h4>常用配队 Top 5 <small>完整四人队</small></h4><div class="dtideSquadList">${squads}</div></section></div></div>`;
  }
  function renderUsage(){
    const g=group(scopedRows()),mode=$('dtideRateMode')?.value||'team',host=$('dtideUsage');if(!host)return;
    host.innerHTML=g.characters.slice(0,24).map(c=>`<button type="button" class="dtideUsage" data-usage-character="${esc(c.key)}" aria-expanded="false"><div class="dtideChar">${c.image?`<img src="${esc(c.image)}" alt="">`:''}<span><b>${esc(c.name)}</b><small>${c.count} 支队伍出现 · 点击展开详情</small></span></div><strong>${pct(mode==='slot'?c.slotRatePct:c.teamRatePct)}</strong></button>`).join('')||'<div class="dtideEmpty">当前口径暂无公开配队。</div>';
    host.onclick=e=>{const card=e.target.closest('[data-usage-character]');if(!card)return;const old=host.querySelector('.dtideInlineDetail'),same=old?.dataset.for===card.dataset.usageCharacter;host.querySelectorAll('[data-usage-character]').forEach(x=>x.setAttribute('aria-expanded','false'));old?.remove();if(same)return;const d=characterDetails(card.dataset.usageCharacter),section=(title,arr)=>`<div><h4>${title}</h4><div class="dtideUsageCards">${arr.map(x=>`<div class="dtideUsage"><div><b>${esc(x.name)}</b><small>${x.count} 次同队/采用</small></div><strong>${pct(x.ratePct)}</strong></div>`).join('')||'<div class="dtideEmpty">暂无数据</div>'}</div></div>`;const detail=document.createElement('div');detail.className='dtideInlineDetail';detail.dataset.for=card.dataset.usageCharacter;detail.innerHTML=`<div class="dtideGearSummary"><div><small>该角色样本</small><b>${d.appearances} 支队伍</b></div></div>`+section('Top 5 队友出场率',d.teammates)+section('命轮出场率',d.wheels)+section('密契出场率',d.covenants);card.insertAdjacentElement('afterend',detail);card.setAttribute('aria-expanded','true')};
  }
  function renderMatrix(){
    const cap=selectedRankCap(),difficulty=$('dtideDifficulty')?.value||'all',ct=$('dtideClearType')?.value||'all',mode=$('dtideRateMode')?.value||'team',entity=$('dtideEntityType')?.value||'character';
    const sortKey=window.__dtideMatrixSort||'total',asc=window.__dtideMatrixAsc||false,currentRecords=entity==='character'?(usage?.records||[]):(detailUsage?.records||[]),previousRecords=entity==='character'?(previousUsage?.records||[]):(previousDetailUsage?.records||[]);
    const current=rankedRows(currentRecords,entity,{cap,difficulty,clearType:ct,sortKey,asc}),{rows,waves,hit:getHit}=current;
    const prior=rankedRows(previousRecords,entity,{cap,difficulty,clearType:ct,sortKey,asc}),previousRanks=new Map(prior.rows.map((x,i)=>[x.key,i+1]));
    const arrow=k=>k===sortKey?(asc?' ↑':' ↓'):' ↕',host=$('dtideMatrix'),label=entity==='character'?'角色':entity==='creation'?'造物':'命轮';if($('dtideMatrixTitle'))$('dtideMatrixTitle').textContent=label+'逐波出场率';if(!host)return;host.removeAttribute('aria-busy');if(!rows.length){host.innerHTML='<div class="dtideEmpty">当前口径暂无'+label+'详细数据。</div>';return}
    const legend=entity==='character'?`<div class="dtideEnlightLegend">${enlightKeys.map(k=>`<span><i style="background:${enlightColors[k]}"></i>${enlightZh[k]}</span>`).join('')}</div>`:entity==='wheel'?`<div class="dtideEnlightLegend">${wheelStackKeys.map(k=>`<span><i style="background:${wheelStackColors[k]}"></i>${wheelStackZh[k]}</span>`).join('')}</div>`:'';
    host.innerHTML=`<table class="dtideTable"><thead><tr><th><div class="dtideEntityHead"><span>${label}</span>${legend}</div></th>${waves.map(w=>`<th><button type="button" class="dtideSortHead" data-sort-key="${w}">Wave ${w}${arrow(String(w))}</button></th>`).join('')}${entity==='character'?`<th><button type="button" class="dtideSortHead" data-sort-key="assist">助战使用率${arrow('assist')}</button></th>`:''}<th><button type="button" class="dtideSortHead" data-sort-key="total">总出现${arrow('total')}</button></th></tr></thead><tbody>${rows.map((c,i)=>`<tr><td><div class="dtideRankedItem"><span class="dtideRankMark"><b>${i+1}</b>${rankChange(i+1,previousRanks.get(c.key))}</span>${entity==='character'?`<button type="button" class="dtideMatrixCharacter" data-matrix-character="${esc(c.key)}" aria-expanded="false"><span class="dtideChar">${c.image?`<img src="${esc(c.image)}" alt="">`:''}<span>${esc(c.name)}</span></span></button>${enlightBar(c)}`:`<div class="dtideChar">${c.image?`<img class="dtideGearIcon" src="${esc(c.image)}" data-fallback="${esc(c.fallbackImage||'')}" referrerpolicy="no-referrer" onerror="if(this.dataset.fallback&&this.src!==this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback=''}else{this.hidden=true}" alt="">`:''}<span>${esc(c.name)}</span>${entity==='wheel'?wheelRatioBar(c):''}</div>`}</div></td>${waves.map(w=>{const hit=getHit(w,c.key),rate=hit?.teamRatePct||0;return `<td class="dtideRate dtideHeat" style="${heatStyle(rate)}">${pct(rate)}</td>`}).join('')}${entity==='character'?`<td class="dtideRate dtideHeat" style="${heatStyle(c.assistRatePct||0,100)}">${pct(c.assistRatePct||0)}</td>`:''}<td>${c.total}</td></tr>`).join('')}</tbody></table>`;
    host.onclick=e=>{const sort=e.target.closest('[data-sort-key]');if(sort){const key=String(sort.dataset.sortKey);if(window.__dtideMatrixSort===key)window.__dtideMatrixAsc=!window.__dtideMatrixAsc;else{window.__dtideMatrixSort=key;window.__dtideMatrixAsc=false}renderMatrix();return}const btn=e.target.closest('[data-matrix-character]');if(!btn)return;const tbody=btn.closest('tbody'),old=tbody.querySelector('.dtideMatrixDetailRow'),same=old?.dataset.for===btn.dataset.matrixCharacter;tbody.querySelectorAll('[data-matrix-character]').forEach(x=>x.setAttribute('aria-expanded','false'));old?.remove();if(same)return;const d=characterDetails(btn.dataset.matrixCharacter),section=(title,arr)=>`<div><h4>${title}</h4><div class="dtideUsageCards">${arr.map(x=>`<div class="dtideUsage"><div class="dtideChar">${x.image?`<img class="dtideGearIcon" src="${esc(x.image)}" data-fallback="${esc(x.fallbackImage||'')}" referrerpolicy="no-referrer" onerror="if(this.dataset.fallback&&this.src!==this.dataset.fallback){this.src=this.dataset.fallback;this.dataset.fallback=''}else{this.hidden=true}" alt="">`:''}<span><b>${esc(x.name)}</b><small>${x.count} 次</small></span></div><strong>${pct(x.ratePct)}</strong></div>`).join('')||'<div class="dtideEmpty">当前详细样本暂无记录</div>'}</div></div>`,tr=document.createElement('tr');tr.className='dtideMatrixDetailRow';tr.dataset.for=btn.dataset.matrixCharacter;tr.innerHTML=`<td colspan="${waves.length+(entity==='character'?3:2)}"><div class="dtideInlineDetail">${section('Top 5 队友配置出场率',d.teammates)}${section('命轮出场率',d.wheels)}${section('密契出场率',d.covenants)}${characterInsightHtml(d)}</div></td>`;btn.closest('tr').insertAdjacentElement('afterend',tr);btn.setAttribute('aria-expanded','true')};
  }
  function compareTable(labels,groups){
    const union=new Map();for(const g of groups)for(const c of g.characters)union.set(c.key,c);const rows=[...union.values()].map(c=>({...c,total:groups.reduce((s,g)=>s+(g.characters.find(x=>x.key===c.key)?.count||0),0)})).sort((a,b)=>b.total-a.total).slice(0,50);if(!rows.length)return '<div class="dtideEmpty">暂无记录。</div>';
    return `<table class="dtideTable"><thead><tr><th>角色</th>${labels.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(c=>`<tr><td>${esc(c.name)}</td>${groups.map(g=>{const h=g.characters.find(x=>x.key===c.key);return `<td class="dtideRate">${pct(h?.teamRatePct||0)}</td>`}).join('')}</tr>`).join('')}</tbody></table>`;
  }
  function renderComparisons(){
    const wave='all',ct=$('dtideClearType')?.value||'all',difficulty=$('dtideDifficulty')?.value||'all',cap=selectedRankCap();
    if($('dtideRankCompare'))$('dtideRankCompare').innerHTML=compareTable(rankCaps.map(coverageLabel),rankCaps.map(x=>group(scopedRows({cap:x,difficulty,wave,clearType:ct}))));
    if($('dtideDifficultyCompare'))$('dtideDifficultyCompare').innerHTML=compareTable(diffs.map(x=>diffZh[x]),diffs.map(x=>group(scopedRows({cap,difficulty:x,wave,clearType:ct}))));
  }
  function renderEnlight(){
    $('dtideUsageEnlight')?.remove();
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
      activeSeason=Number(id);await loadRankMap(id);usage=await dataset((current||entry).path);
      detailUsage=usage;
      detailStats=await json(entry.statsPath).catch(()=>null);
      try{usageStats=await json((current||entry).statsPath)}catch(_){usageStats=fallbackStats(usage?.records||[])}
      const previousEntry=(manifest.availableSeasons||[]).filter(x=>Number(x.seasonId)<activeSeason).sort((a,b)=>Number(b.seasonId)-Number(a.seasonId))[0]||null;
      previousSeasonId=previousEntry?Number(previousEntry.seasonId):null;previousUsage=null;previousDetailUsage=null;
      if(previousEntry){previousUsage=await dataset(previousEntry.path).catch(()=>null);previousDetailUsage=previousUsage}
      renderAll();return true
    }catch(e){usage=null;usageStats=null;console.warn('season data unavailable',id,e);return false}
  }
  function bind(){if(bound)return;const ids=['dtideRankScope','dtideDifficulty','dtideTotalScore','dtideClearType','dtideRateMode','dtideSort','dtideCreationFilter'];for(const id of ids)$(id)?.addEventListener('change',()=>setTimeout(renderAll,0));$('dtideEntityType')?.addEventListener('change',()=>{window.__dtideMatrixSort='total';window.__dtideMatrixAsc=false;requestAnimationFrame(renderMatrix)});$('dtideSeason')?.addEventListener('change',async()=>{try{await loadForSeason($('dtideSeason').value)}catch(e){console.warn('usage layer season load failed',e)}});bound=true}
  async function init(){
    for(let i=0;i<50&&!$('dtideRankScope');i++)await new Promise(r=>setTimeout(r,100));if(!$('dtideRankScope'))return;
    try{await loadGearCatalog();const response=await fetch('data/morimens/eremora/manifest.json',{cache:'no-store'});if(!response.ok)throw new Error(`manifest HTTP ${response.status}`);manifest=await response.json();dataVersion=manifest.usageIndex?.revision||manifest.usageIndex?.syncedAt||manifest.analytics?.generatedAt||manifest.source?.syncedAt||'1';bind();window.addEventListener('morimens-language-change',renderAll);const seasonId=$('dtideSeason')?.value||manifest.currentSeason;if(await loadForSeason(seasonId)){
      const note=$('dtideCoverageNote');if(note)note.insertAdjacentHTML('beforeend',` <strong>Top1000 出场率层：</strong>当前使用增量缓存 ${esc(String(manifest.usageIndex.recordCount||usage.recordCount||0))}/${esc(String(manifest.usageIndex.target||1000))} 名公开榜单玩家。`);
    }
  }catch(e){console.warn('Top1000 usage layer unavailable; falling back to detailed snapshot.',e)}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();


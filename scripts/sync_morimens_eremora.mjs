import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {
  decodeSvelteData,fetchViaJina,findDzoneActivities,findMediaBase,findProfileHeader,parseSvelteTransport,unflatten,walk,
  fixMojibake,mediaUrl,num,sleep,uniq
} from './eremora_sveltekit.mjs';

const ORIGIN='https://eremora.com';
const BASE_DIR='data/morimens/eremora';
const OUT_DIR=process.env.EREMORA_OUTPUT_DIR||BASE_DIR;
const SEASON_DIR=path.join(OUT_DIR,'seasons');
const STATS_DIR=path.join(OUT_DIR,'stats');
const AWAKENERS_FILE='data/morimens/skeydb/awakeners.json';
const LOCAL_SYNC=process.env.EREMORA_LOCAL_SYNC==='1';
const LOCAL_SEASON=Math.max(1,Number(process.env.EREMORA_LOCAL_SEASON||69));
const MAX_RECORDS=Math.max(1,Number(process.env.EREMORA_MAX_RECORDS||1000));
const BATCH_SIZE=Math.max(1,Math.min(4,Number(process.env.EREMORA_BATCH_SIZE||2)));
const BATCH_DELAY=Math.max(1200,Number(process.env.EREMORA_BATCH_DELAY_MS||2600));
const UA='qdby-chinese-eremora-sync/2.0 (+https://github.com/Z769018860/qdby_chinese)';

async function readJson(file,fallback=null){try{return JSON.parse(await readFile(file,'utf8'))}catch{return fallback}}
async function saveJson(file,data){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(data,null,2)+'\n')}
async function fetchText(target,retries=5){
  if(!LOCAL_SYNC)return (await fetchViaJina(target,{ua:UA,retries})).text;
  let last;for(let i=0;i<retries;i++){try{const r=await fetch(target,{headers:{'user-agent':UA,'accept':'application/json,text/plain,*/*','accept-language':'zh-CN,zh;q=0.9,en;q=0.7'},redirect:'follow',signal:AbortSignal.timeout(55000)}),text=await r.text();if(r.ok&&text&&!/Just a moment|Verify you are human|Attention Required/i.test(text))return text;last=new Error(`${target}: HTTP ${r.status} (${text.slice(0,120).replace(/\s+/g,' ')})`)}catch(error){last=error}if(i+1<retries)await sleep(Math.min(30000,3000*Math.pow(2,i)))}throw last||new Error(`Unable to fetch ${target}`)
}

function parseLeaderboard(md=''){
  const linkRe=/\[((?:\d+\s+)?(?:!\[[^\]]*\]\([^)]+\)\s*)*)([^\]]*?)\]\((https:\/\/eremora\.com\/u\/(\d+)\/challenges\/dzone\/(\d+))\)/g;
  const out=[];
  for(const m of md.matchAll(linkRe)){
    const prefix=(m[1]||'').trim(),label=fixMojibake((m[2]||'').replace(/\s+/g,' ').trim()),url=m[3],uid=m[4],seasonId=num(m[5]);
    let rank=null,score=null,player='';
    const medal=label.match(/^(\d+)(?:st|nd|rd|th)\s+(.+?)\s+([\d,]+)\s+Score$/i);
    if(medal){rank=num(medal[1]);player=medal[2].trim();score=num(medal[3])}
    else{
      rank=num(prefix.match(/^(\d+)\b/)?.[1]);
      score=num(label.match(new RegExp(`UID\\s+${uid}\\s+([\\d,]+)`, 'i'))?.[1]??label.match(/([\d,]+)\s+Score/i)?.[1]);
      player=(label.match(new RegExp(`^(.+?)\\s+UID\\s+${uid}\\b`,'i'))?.[1]||label).trim();
    }
    if(!uid||!seasonId)continue;
    out.push({rank,player,uid,score,url,seasonId});
  }
  if(!out.length){
    for(const m of md.matchAll(/https:\/\/eremora\.com\/u\/(\d+)\/challenges\/dzone\/(\d+)/g))out.push({rank:null,player:'',uid:m[1],score:null,url:m[0],seasonId:num(m[2])});
  }
  const seen=new Set();
  return out.filter(x=>{const key=`${x.uid}:${x.seasonId}`;if(seen.has(key))return false;seen.add(key);return true})
    .sort((a,b)=>(a.rank??9999)-(b.rank??9999)||(b.score??0)-(a.score??0)).slice(0,MAX_RECORDS);
}

function parseStructuredLeaderboard(md=''){
  const out=[];
  try{
    const {docs}=parseSvelteTransport(md);
    for(const doc of docs||[])for(const node of doc.nodes||[]){
      const root=unflatten(node.data);walk(root,value=>{
        if(!value||typeof value!=='object'||value.rank==null||value.uid==null||value.dzone_season==null)return;
        const seasonId=num(value.dzone_season),uid=String(value.uid),rank=num(value.rank);if(!seasonId||!uid||!rank)return;
        out.push({rank,player:fixMojibake(value.name||value.raw_name||''),uid,score:num(value.score),url:`${ORIGIN}/u/${uid}/challenges/dzone/${seasonId}`,seasonId});
      });
    }
  }catch(error){console.warn('Structured leaderboard parse failed:',String(error))}
  const seen=new Set();return out.filter(x=>{const key=`${x.uid}:${x.seasonId}`;if(seen.has(key))return false;seen.add(key);return true}).sort((a,b)=>(a.rank??9999)-(b.rank??9999)).slice(0,MAX_RECORDS);
}

function normalizeIngameId(awaker={}){
  const raw=awaker.res||String(awaker.mini||awaker.image||'').match(/Awaker_([A-Za-z0-9]+)_AF/i)?.[1]||'';
  return String(raw).replace(/_AF$/i,'').toUpperCase()||null;
}
function normalizeAttrs(attrs=[]){return (Array.isArray(attrs)?attrs:[]).map(x=>({id:x?.id??null,name:fixMojibake(x?.name||''),value:x?.value??null,percentage:!!x?.percentage,rollQuality:x?.roll_quality??null})).filter(x=>x.id!=null||x.name)}
function normalizeWheel(w,mediaBase){if(!w||typeof w!=='object')return null;return {id:w.id??null,name:fixMojibake(w.name||''),image:mediaUrl(mediaBase,w.image),rarity:w.rarity??null,slot:w.slot??null,level:num(w.level),enhanceLevel:num(w.enhance_level),breakLevel:num(w.break_level),attrs:normalizeAttrs(w.attrs)}}
function normalizeTrinket(t,mediaBase){if(!t||typeof t!=='object')return null;return {id:t.id??null,name:fixMojibake(t.name||''),image:mediaUrl(mediaBase,t.image),rarity:t.rarity??null,slot:t.slot??null,level:num(t.level),enhanceLevel:num(t.enhance_level),breakLevel:num(t.break_level),suitId:t.suit_id??null,bound:!!t.bound,attrs:normalizeAttrs(t.attrs)}}
function normalizeCovenant(s,mediaBase){
  if(!s||typeof s!=='object')return null;
  return {id:s.id??null,name:fixMojibake(s.name||''),image:mediaUrl(mediaBase,s.image),count:num(s.count),effects:(Array.isArray(s.effects)?s.effects:[]).map(e=>({pieces:num(e?.pieces),desc:fixMojibake(e?.desc||''),active:!!e?.active}))};
}
function enlightenmentInfo(list=[]){
  const nodes=(Array.isArray(list)?list:[]).map(x=>({id:x?.id??null,name:fixMojibake(x?.name||''),lv:num(x?.lv),unlocked:!!x?.unlocked}));
  const count=nodes.filter(x=>x.unlocked).length;
  const milestone=['E0','E1','E2','E3','OE','AA'][Math.max(0,Math.min(5,count))];
  return {nodes,count,milestone};
}
function normalizeMember(build,mediaBase,byIngame){
  const a=build?.awaker||{},ingameId=normalizeIngameId(a),catalog=ingameId?byIngame.get(ingameId):null,en=enlightenmentInfo(build?.enlightenment);
  const wheels=(Array.isArray(build?.weapons)?build.weapons:[]).map(x=>normalizeWheel(x,mediaBase)).filter(Boolean);
  const trinkets=(Array.isArray(build?.trinkets)?build.trinkets:[]).map(x=>normalizeTrinket(x,mediaBase)).filter(Boolean);
  const covenants=(Array.isArray(build?.suits)?build.suits:[]).map(x=>normalizeCovenant(x,mediaBase)).filter(Boolean);
  return {
    id:a.id??null,name:fixMojibake(a.name||catalog?.name||ingameId||'未知'),canonicalName:catalog?.name||fixMojibake(a.name||'')||ingameId||'未知',skeydbId:catalog?.id||null,ingameId,
    image:mediaUrl(mediaBase,a.mini||a.image,{thumb:true})||catalog?.assets?.portrait||null,realm:fixMojibake(a.realm?.name||''),role:fixMojibake(a.role||''),rarity:fixMojibake(a.rarity||''),
    level:num(build?.level),potencyLevel:num(build?.potency_level),breakLevel:num(build?.break_level),fighting:num(build?.fighting),potential:build?.potential??null,likeLevel:num(build?.like_level),
    enlightenLevel:en.count,enlightenCount:en.count,enlightenMilestone:en.milestone,enlightenment:en.nodes,progression:en.milestone,
    wheels,trinkets,covenants,covenant:covenants[0]||null,covenantScore:num(build?.covenant_score),borrowed:!!build?.borrowed,assistUid:build?.assist_uid??null,
    stats:normalizeAttrs(build?.stats)
  };
}
function normalizeToken(token,mediaBase){if(!token||typeof token!=='object')return null;return {id:token.id??null,name:fixMojibake(token.name||''),image:mediaUrl(mediaBase,token.image),rarity:fixMojibake(token.rarity||'')}}
function normalizeCreation(relic,mediaBase){if(!relic||typeof relic!=='object')return null;return {id:relic.id??null,name:fixMojibake(relic.name||String(relic.id??'')),image:mediaUrl(mediaBase,relic.image),quality:fixMojibake(relic.quality||''),desc:fixMojibake(relic.desc||'')}}
function normalizeActivity(activityItem,entry,decoded,byIngame){
  const node=activityItem.node,activity=node.activity||{},mediaBase=findMediaBase(decoded),header=findProfileHeader(decoded)||{};
  const stageRows=[];
  for(const stageRec of node.stages||[]){
    if(!stageRec?.team||!Array.isArray(stageRec.team.awakers))continue;
    const stage=stageRec.stage||{},stageName=fixMojibake(stage.name||''),wave=num(stageName.match(/Wave\s*(\d+)/i)?.[1]);if(!wave)continue;
    const members=stageRec.team.awakers.map(x=>normalizeMember(x,mediaBase,byIngame));
    const creations=(Array.isArray(stageRec.team.result?.relics)?stageRec.team.result.relics:[]).map(x=>normalizeCreation(x,mediaBase)).filter(Boolean);
    stageRows.push({wave,madness:num(stage.rec_level),stageId:stage.id??stageRec.team.stage_tid??null,stageName,score:num(stageRec.score),clearType:stageRec.extra?'extra':'clear',extraPass:!!stageRec.extra_pass,groupTid:stageRec.group_tid??null,token:normalizeToken(stageRec.team.keeper_skill,mediaBase),creations,wid:stageRec.team.wid??null,battleUuid:stageRec.team.battle_uuid??null,members});
  }
  const wavesMap=new Map();
  for(const s of stageRows){const w=wavesMap.get(s.wave)||{wave:s.wave,madness:s.madness,teams:[]};w.madness??=s.madness;w.teams.push({clearType:s.clearType,score:s.score,extraPass:s.extraPass,groupTid:s.groupTid,stageId:s.stageId,stageName:s.stageName,token:s.token,creations:s.creations,wid:s.wid,battleUuid:s.battleUuid,members:s.members});wavesMap.set(s.wave,w)}
  const waves=[...wavesMap.values()].sort((a,b)=>a.wave-b.wave),computedScore=stageRows.reduce((sum,x)=>sum+(x.score||0),0);
  const start=num(activity.start),end=num(activity.end),iso=d=>d?new Date(d*1000).toISOString().slice(0,10):null;
  return {rank:entry?.rank??null,player:fixMojibake(header.name||entry?.player||''),uid:String(header.uid??entry?.uid??''),score:entry?.score??computedScore,currentScore:computedScore,leaderboardScore:entry?.score??null,url:entry?.url||`${ORIGIN}/u/${header.uid}/challenges/dzone/${activityItem.period}`,seasonId:activityItem.period,period:start&&end?`${iso(start)} – ${iso(end)}`:null,activity:{id:activity.id??null,tid:node.activity_tid??null,name:fixMojibake(activity.name||'Dissoluted Abyss'),start,end,maxScore:num(node.max_score),stageCount:num(node.stage_count)||stageRows.length},waves,fetchedAt:new Date().toISOString(),sourceTransport:'Eremora SvelteKit __data.json'};
}
function mergeRecord(oldRec,newRec){
  if(!oldRec)return newRec;if(!newRec)return oldRec;
  const oldTeams=(oldRec.waves||[]).reduce((n,w)=>n+(w.teams?.length||0),0),newTeams=(newRec.waves||[]).reduce((n,w)=>n+(w.teams?.length||0),0);
  return newTeams>=oldTeams?{...oldRec,...newRec,rank:newRec.rank??oldRec.rank,score:newRec.score??oldRec.score}:{...newRec,...oldRec,rank:newRec.rank??oldRec.rank,score:newRec.score??oldRec.score};
}

function addCount(map,key,meta={}){if(key===null||key===undefined||key==='')return;const cur=map.get(String(key))||{key:String(key),count:0,...meta};cur.count++;map.set(String(key),cur)}
function ratesFromTeams(teams){
  const char=new Map(),token=new Map(),creation=new Map(),wheel=new Map(),covenant=new Map(),byCharacter=new Map();let memberSlots=0,wheelSlots=0,covenantSlots=0,creationSlots=0;
  for(const team of teams){
    const seenChars=new Set(),seenWheels=new Set(),seenCov=new Set();addCount(token,team.token?.id??team.token?.name,{id:team.token?.id??null,name:team.token?.name||null,image:team.token?.image||null});
    const seenCreations=new Set();for(const r of team.creations||[]){creationSlots++;const rk=r.id??r.name;if(rk==null||seenCreations.has(String(rk)))continue;seenCreations.add(String(rk));addCount(creation,rk,{id:r.id??null,name:r.name||String(rk),image:r.image||null,quality:r.quality||null})}
    for(const m of team.members||[]){
      memberSlots++;const ck=m.skeydbId||m.ingameId||m.id||m.name;
      if(ck&&!seenChars.has(String(ck))){seenChars.add(String(ck));addCount(char,ck,{id:m.skeydbId||null,ingameId:m.ingameId||null,name:m.canonicalName||m.name,image:m.image||null})}
      let bc=byCharacter.get(String(ck));if(!bc){bc={key:String(ck),id:m.skeydbId||null,ingameId:m.ingameId||null,name:m.canonicalName||m.name,image:m.image||null,appearances:0,levels:[],enlightenment:[],milestones:new Map(),wheels:new Map(),covenants:new Map()};byCharacter.set(String(ck),bc)}
      bc.appearances++;if(m.level!=null)bc.levels.push(m.level);if(m.enlightenLevel!=null)bc.enlightenment.push(m.enlightenLevel);if(m.enlightenMilestone)addCount(bc.milestones,m.enlightenMilestone,{name:m.enlightenMilestone});
      for(const w of m.wheels||[]){wheelSlots++;const wk=w.id??w.name;if(wk==null)continue;if(!seenWheels.has(String(wk))){seenWheels.add(String(wk));addCount(wheel,wk,{id:w.id??null,name:w.name||String(wk),image:w.image||null})}addCount(bc.wheels,wk,{id:w.id??null,name:w.name||String(wk),image:w.image||null})}
      for(const c of m.covenants||[]){covenantSlots++;const sk=c.id??c.name;if(sk==null)continue;if(!seenCov.has(String(sk))){seenCov.add(String(sk));addCount(covenant,sk,{id:c.id??null,name:c.name||String(sk),image:c.image||null})}addCount(bc.covenants,sk,{id:c.id??null,name:c.name||String(sk),image:c.image||null})}
    }
  }
  const n=teams.length||1,finish=map=>[...map.values()].map(x=>({...x,teamRate:x.count/n,teamRatePct:Number((x.count/n*100).toFixed(2))})).sort((a,b)=>b.count-a.count||String(a.name||a.key).localeCompare(String(b.name||b.key),'zh-CN'));
  const byCharOut=[...byCharacter.values()].map(x=>({key:x.key,id:x.id,ingameId:x.ingameId,name:x.name,image:x.image,appearances:x.appearances,level:{min:x.levels.length?Math.min(...x.levels):null,max:x.levels.length?Math.max(...x.levels):null,avg:x.levels.length?Number((x.levels.reduce((a,b)=>a+b,0)/x.levels.length).toFixed(2)):null},enlighten:{min:x.enlightenment.length?Math.min(...x.enlightenment):null,max:x.enlightenment.length?Math.max(...x.enlightenment):null,avg:x.enlightenment.length?Number((x.enlightenment.reduce((a,b)=>a+b,0)/x.enlightenment.length).toFixed(2)):null,milestones:[...x.milestones.values()].sort((a,b)=>b.count-a.count)},wheels:[...x.wheels.values()].map(v=>({...v,ratePct:Number((v.count/x.appearances*100).toFixed(2))})).sort((a,b)=>b.count-a.count),covenants:[...x.covenants.values()].map(v=>({...v,ratePct:Number((v.count/x.appearances*100).toFixed(2))})).sort((a,b)=>b.count-a.count)})).sort((a,b)=>b.appearances-a.appearances);
  return {teamCount:teams.length,memberSlots,wheelSlots,covenantSlots,creationSlots,characters:finish(char),tokens:finish(token),creations:finish(creation),wheels:finish(wheel),covenants:finish(covenant),byCharacter:byCharOut};
}
function buildStats(season){
  const allTeams=[],byWave={};
  for(const rec of season.records||[])for(const wave of rec.waves||[]){byWave[wave.wave]??={all:[],clear:[],extra:[]};for(const team of wave.teams||[]){byWave[wave.wave].all.push(team);if(team.clearType==='extra')byWave[wave.wave].extra.push(team);else byWave[wave.wave].clear.push(team);allTeams.push(team)}}
  const waves=Object.fromEntries(Object.entries(byWave).map(([w,g])=>[w,{all:ratesFromTeams(g.all),clear:ratesFromTeams(g.clear),extra:ratesFromTeams(g.extra)}]));
  const all=ratesFromTeams(allTeams),hasEnlighten=all.byCharacter.some(x=>x.enlighten.max!=null),equipAvailable=all.wheelSlots>0||all.covenantSlots>0;
  return {seasonId:season.seasonId,generatedAt:new Date().toISOString(),recordCount:season.records.length,waves,all,equipment:{available:equipAvailable,wheelSlots:all.wheelSlots,covenantSlots:all.covenantSlots,creationSlots:all.creationSlots,note:equipAvailable?'命轮来自 Eremora 原始 weapons 字段；密契来自 trinkets / suits 字段；造物来自 team.result.relics。':'本期原始记录没有可统计的命轮或密契字段。'},coverage:{enlightenment:hasEnlighten,wheels:all.wheelSlots>0,covenants:all.covenantSlots>0,creations:all.creationSlots>0}};
}

await mkdir(SEASON_DIR,{recursive:true});await mkdir(STATS_DIR,{recursive:true});
const awakeners=await readJson(AWAKENERS_FILE,{records:[]}),byIngame=new Map((awakeners.records||[]).filter(x=>x.ingameId).map(x=>[String(x.ingameId).toUpperCase(),x]));
let finalEntries=[];
if(LOCAL_SYNC){
  const cached=await readJson(path.join(BASE_DIR,'usage',`${LOCAL_SEASON}.json`),{records:[]});
  finalEntries=(cached.records||[]).map(x=>({rank:num(x.rank),player:x.player||'',uid:String(x.uid||''),score:num(x.score),url:x.url||`${ORIGIN}/u/${x.uid}/challenges/dzone/${LOCAL_SEASON}`,seasonId:LOCAL_SEASON})).filter(x=>x.uid).sort((a,b)=>(a.rank??9999)-(b.rank??9999)).slice(0,MAX_RECORDS);
  console.log(`Local incremental mode: season=${LOCAL_SEASON}, cached leaderboard targets=${finalEntries.length}`);
}else{
  let leaderboardMd,structuredMd='';try{structuredMd=await fetchText(`${ORIGIN}/leaderboard/abyss/__data.json`)}catch(error){console.warn('Structured leaderboard unavailable:',String(error))}
  try{leaderboardMd=await fetchText(`${ORIGIN}/leaderboard/abyss`)}catch{leaderboardMd=await fetchText(`${ORIGIN}/leaderboard`)}
  const entries=parseStructuredLeaderboard(structuredMd);finalEntries=entries.length?entries:parseLeaderboard(leaderboardMd);
}
if(!finalEntries.length)throw new Error('No D-Zone leaderboard records found.');
const currentSeason=Math.max(...finalEntries.map(x=>x.seasonId)),currentEntries=finalEntries.filter(x=>x.seasonId===currentSeason);
const outputSeasonFile=path.join(SEASON_DIR,`${currentSeason}.json`),baseSeasonFile=path.join(BASE_DIR,'seasons',`${currentSeason}.json`);
const oldCurrent=await readJson(outputSeasonFile,await readJson(baseSeasonFile,{records:[]})),oldByUid=new Map((oldCurrent.records||[]).map(x=>[String(x.uid),x]));
const currentRecords=LOCAL_SYNC?currentEntries.map(x=>oldByUid.get(String(x.uid))).filter(Boolean):[],failures=[],historyBySeason=new Map(),entriesToFetch=LOCAL_SYNC?currentEntries.filter(x=>!oldByUid.has(String(x.uid))):currentEntries;
const checkpoint=async processed=>{if(!LOCAL_SYNC)return;const records=[...new Map(currentRecords.map(x=>[String(x.uid),x])).values()].sort((a,b)=>(a.rank??9999)-(b.rank??9999));const doc={...oldCurrent,source:{...(oldCurrent.source||{}),syncedAt:new Date().toISOString(),transport:'local direct incremental Eremora SvelteKit __data.json'},seasonId:currentSeason,leaderboardEntryCount:currentEntries.length,recordCount:records.length,complete:false,coverageMode:'local-incremental',failures:[...failures],records};await saveJson(outputSeasonFile,doc);await saveJson(path.join(STATS_DIR,`${currentSeason}.json`),buildStats(doc));await saveJson(path.join(OUT_DIR,'progress.json'),{seasonId:currentSeason,target:currentEntries.length,startedWith:currentEntries.length-entriesToFetch.length,processed,completed:records.length,remaining:Math.max(0,currentEntries.length-records.length),failed:failures.length,finished:false,updatedAt:new Date().toISOString()});console.log(`Local checkpoint: processed=${processed}/${entriesToFetch.length}, detailed=${records.length}/${currentEntries.length}, failed=${failures.length}`)};
for(let i=0;i<entriesToFetch.length;i+=BATCH_SIZE){
  const batch=entriesToFetch.slice(i,i+BATCH_SIZE),results=await Promise.all(batch.map(async entry=>{
    try{
      const detailUrl=`${entry.url}/__data.json`,decoded=decodeSvelteData(await fetchText(detailUrl));
      const activities=findDzoneActivities(decoded),currentActivity=activities.find(x=>x.period===entry.seasonId);
      if(!currentActivity)throw new Error(`Season ${entry.seasonId} activity not found in ${detailUrl}`);
      const current=normalizeActivity(currentActivity,entry,decoded,byIngame),history=[];
      for(const a of activities)if(a.period!==entry.seasonId){const r=normalizeActivity(a,{...entry,rank:null,score:null,url:`${ORIGIN}/u/${entry.uid}/challenges/dzone/${a.period}`,seasonId:a.period},decoded,byIngame);if(r.waves.length)history.push(r)}
      return {ok:true,current,history,activityPeriods:activities.map(x=>x.period)};
    }catch(error){return {ok:false,entry,error:String(error)}}
  }));
  for(const r of results){
    if(r.ok){currentRecords.push(r.current);for(const h of r.history){if(!historyBySeason.has(h.seasonId))historyBySeason.set(h.seasonId,new Map());historyBySeason.get(h.seasonId).set(String(h.uid),h)}}
    else{failures.push({uid:r.entry.uid,url:r.entry.url,error:r.error});const cached=oldByUid.get(String(r.entry.uid));if(cached)currentRecords.push(cached)}
  }
  await checkpoint(Math.min(i+BATCH_SIZE,entriesToFetch.length));
  if(i+BATCH_SIZE<entriesToFetch.length)await sleep(BATCH_DELAY);
}
if(LOCAL_SYNC)for(const x of oldCurrent.records||[])if(!currentRecords.some(r=>String(r.uid)===String(x.uid))&&currentEntries.some(e=>String(e.uid)===String(x.uid)))currentRecords.push(x);
currentRecords.sort((a,b)=>(a.rank??9999)-(b.rank??9999)||(b.score??0)-(a.score??0));
const currentPeriod=currentRecords.find(x=>x.period)?.period||null,currentComplete=failures.length===0&&currentRecords.length===currentEntries.length&&currentEntries.length>=Math.min(50,MAX_RECORDS);
const currentSeasonDoc={source:{site:'Eremora',url:`${ORIGIN}/leaderboard/abyss`,detailTemplate:`${ORIGIN}/u/{uid}/challenges/dzone/{season}/__data.json`,transport:'Eremora SvelteKit __data.json server-load stream via Jina Reader',syncedAt:new Date().toISOString()},seasonId:currentSeason,period:currentPeriod,leaderboardEntryCount:currentEntries.length,recordCount:currentRecords.length,complete:currentComplete,coverageMode:'current-leaderboard',failures,records:currentRecords};
await saveJson(path.join(SEASON_DIR,`${currentSeason}.json`),currentSeasonDoc);await saveJson(path.join(STATS_DIR,`${currentSeason}.json`),buildStats(currentSeasonDoc));

for(const [seasonId,map] of historyBySeason){
  if(seasonId===currentSeason)continue;const file=path.join(SEASON_DIR,`${seasonId}.json`),old=await readJson(file,{records:[]}),merged=new Map((old.records||[]).map(x=>[String(x.uid),x]));
  for(const [uid,rec] of map)merged.set(uid,mergeRecord(merged.get(uid),rec));
  const records=[...merged.values()].sort((a,b)=>(b.score??0)-(a.score??0)||String(a.player).localeCompare(String(b.player),'zh-CN'));
  const doc={source:{site:'Eremora',url:`${ORIGIN}/leaderboard/abyss`,detailTemplate:`${ORIGIN}/u/{uid}/challenges/dzone/{season}/__data.json`,transport:'historical activities exposed by Eremora profile challenge __data.json',syncedAt:new Date().toISOString()},seasonId,period:records.find(x=>x.period)?.period||old.period||null,leaderboardEntryCount:old.leaderboardEntryCount||null,recordCount:records.length,complete:!!old.complete,coverageMode:old.complete?'archived-leaderboard':'profile-history-partial',failures:old.failures||[],records};
  await saveJson(file,doc);await saveJson(path.join(STATS_DIR,`${seasonId}.json`),buildStats(doc));
}

const seasonFiles=(await readdir(SEASON_DIR)).filter(x=>/^\d+\.json$/.test(x)),snapshots=[];
for(const f of seasonFiles){const s=await readJson(path.join(SEASON_DIR,f));if(s)snapshots.push({seasonId:s.seasonId,period:s.period||null,recordCount:s.recordCount||0,leaderboardEntryCount:s.leaderboardEntryCount??null,complete:!!s.complete,coverageMode:s.coverageMode||'snapshot',path:`data/morimens/eremora/seasons/${s.seasonId}.json`,statsPath:`data/morimens/eremora/stats/${s.seasonId}.json`})}
snapshots.sort((a,b)=>b.seasonId-a.seasonId);
const currentStats=await readJson(path.join(STATS_DIR,`${currentSeason}.json`),{}),discovered=uniq([currentSeason,...historyBySeason.keys(),...snapshots.map(x=>x.seasonId)]).map(Number).sort((a,b)=>b-a);
const fieldCoverage={character:true,wave:true,level:true,progressionLabel:true,enlightenLevel:!!currentStats.coverage?.enlightenment,wheels:!!currentStats.coverage?.wheels,covenants:!!currentStats.coverage?.covenants,creations:!!currentStats.coverage?.creations};
const manifest={source:{site:'Eremora',url:`${ORIGIN}/leaderboard/abyss`,detailEndpointTemplate:`${ORIGIN}/u/{uid}/challenges/dzone/{season}/__data.json`,syncedAt:new Date().toISOString(),transport:'Eremora SvelteKit __data.json (server-load stream) via Jina Reader; leaderboard index via public rendered page'},currentSeason,availableSeasons:snapshots,discoveredSeasonIds:discovered,pendingBackfillSeasonIds:snapshots.filter(x=>!x.complete).map(x=>x.seasonId),current:{leaderboardEntries:currentEntries.length,records:currentRecords.length,complete:currentSeasonDoc.complete,failures:failures.length},fieldCoverage,notes:['当前期榜单索引用于发现玩家与排名；每条挑战的角色等级、启灵节点、命轮、密契、助战状态和逐波队伍来自 Eremora 自身的 SvelteKit __data.json 结构化数据。','命轮映射 Eremora weapons 字段；密契明细映射 trinkets，套装统计映射 suits；启灵数表示 enlightenment 数组中 unlocked=true 的已解锁命名节点，0–5 对应 E0/E1/E2/E3/OE/AA 里已跨越的节点数。','历史期次会从玩家挑战数据中增量发现并保存；只有曾按完整榜单抓取的期次标记 complete=true，profile-history-partial 不冒充完整历史榜单。']};
await saveJson(path.join(OUT_DIR,'manifest.json'),manifest);
if(LOCAL_SYNC)await saveJson(path.join(OUT_DIR,'progress.json'),{seasonId:currentSeason,target:currentEntries.length,completed:currentRecords.length,remaining:Math.max(0,currentEntries.length-currentRecords.length),failed:failures.length,finished:currentRecords.length===currentEntries.length&&failures.length===0,updatedAt:new Date().toISOString()});
console.log(`Eremora D-Zone season ${currentSeason}: leaderboard=${currentEntries.length}, records=${currentRecords.length}, failures=${failures.length}, complete=${currentSeasonDoc.complete}; raw fields: enlight=${fieldCoverage.enlightenLevel}, wheels=${fieldCoverage.wheels}, covenants=${fieldCoverage.covenants}, creations=${fieldCoverage.creations}; seasons=${snapshots.map(x=>`${x.seasonId}:${x.recordCount}${x.complete?'✓':'~'}`).join(', ')}`);

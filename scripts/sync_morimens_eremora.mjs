import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

const ORIGIN='https://eremora.com';
const READER='https://r.jina.ai/';
const OUT_DIR='data/morimens/eremora';
const SEASON_DIR=path.join(OUT_DIR,'seasons');
const STATS_DIR=path.join(OUT_DIR,'stats');
const AWAKENERS_FILE='data/morimens/skeydb/awakeners.json';
const MAX_RECORDS=Math.max(1,Number(process.env.EREMORA_MAX_RECORDS||50));
const BATCH_SIZE=Math.max(1,Math.min(4,Number(process.env.EREMORA_BATCH_SIZE||3)));
const BATCH_DELAY=Math.max(1500,Number(process.env.EREMORA_BATCH_DELAY_MS||3800));
const UA='qdby-chinese-eremora-sync/1.0 (+https://github.com/Z769018860/qdby_chinese)';

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const uniq=xs=>[...new Set(xs.filter(x=>x!==null&&x!==undefined&&x!==''))];
const num=v=>{const n=Number(String(v??'').replace(/,/g,''));return Number.isFinite(n)?n:null};
async function readJson(file,fallback=null){try{return JSON.parse(await readFile(file,'utf8'))}catch{return fallback}}
async function saveJson(file,data){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(data,null,2)+'\n')}

async function fetchReader(target,retries=5){
  let last;
  for(let i=0;i<retries;i++){
    try{
      const r=await fetch(`${READER}${target}`,{headers:{'user-agent':UA,'accept':'text/plain','x-engine':'browser','x-timeout':'40','x-wait-for-selector':'body'},redirect:'follow',signal:AbortSignal.timeout(50000)});
      const text=await r.text();
      if(r.ok&&text&&!/Target URL returned error 429/i.test(text))return text;
      last=new Error(`${target}: HTTP ${r.status}${text?` (${text.slice(0,120).replace(/\s+/g,' ')})`:''}`);
      if(r.status!==429&&r.status<500)break;
    }catch(e){last=e}
    if(i+1<retries)await sleep(Math.min(30000,3500*Math.pow(2,i)));
  }
  throw last;
}

function stripImages(s=''){return s.replace(/!\[[^\]]*\]\([^)]*\)/g,' ').replace(/\s+/g,' ').trim()}
function parseLeaderboard(md=''){
  const out=[];
  for(const raw of md.split(/\r?\n/)){
    if(!/\/challenges\/dzone\/\d+\)/.test(raw)||!/~?UID\s+\d+/i.test(raw))continue;
    const line=stripImages(raw);
    const url=raw.match(/\]\((https:\/\/eremora\.com\/u\/(\d+)\/challenges\/dzone\/(\d+))\)/)?.[1];
    if(!url)continue;
    const uid=url.match(/\/u\/(\d+)\//)?.[1]||null,seasonId=num(url.match(/\/dzone\/(\d+)/)?.[1]);
    const visibleRank=num(line.match(/^\d+\.\s+\[(\d+)\s+/)?.[1]);
    const score=num(line.match(/UID\s+\d+\s+([\d,]+)\]/i)?.[1]);
    let player=line.match(/^\d+\.\s+\[\d+\s+(.+?)\s+UID\s+\d+/i)?.[1]?.trim()||'';
    player=player.replace(/\s+/g,' ').trim();
    if(!uid||!seasonId)continue;
    out.push({rank:visibleRank,player,uid,score,url,seasonId});
  }
  const seen=new Set();return out.filter(x=>{const k=`${x.uid}:${x.seasonId}`;if(seen.has(k))return false;seen.add(k);return true}).slice(0,MAX_RECORDS);
}

function parseCharacterImage(line=''){
  const m=line.match(/!\[Image\s+\d+:\s*([^\]]+)\]\((https:\/\/media\.eremora\.com\/[^)]+\/portraits\/Portrait_Minihead_Awaker_([A-Za-z0-9]+)_AF\.webp)\)(.*)$/i);
  if(!m)return null;
  return {name:m[1].replace(/^"|"$/g,''),image:m[2],ingameId:m[3],borrowed:/Borrowed support/i.test(m[4]||'')};
}
function parseTokenImage(line=''){
  const m=line.match(/!\[Image\s+\d+:\s*([^\]]+)\]\((https:\/\/media\.eremora\.com\/[^)]+\/icon\/KeyToken_Skill_[^)]+)\)/i);
  return m?{name:m[1],image:m[2]}:null;
}
function parseChallenge(md='',entry,byIngame){
  const title=md.match(/^Title:\s*(.+)$/m)?.[1]?.trim()||entry.player||'';
  const player=title.replace(/\s*\|\s*D-Zone Season\s+\d+.*$/i,'').trim()||entry.player||'';
  const seasonId=num(md.match(/\bSeason\s+(\d+)\b/i)?.[1])??entry.seasonId;
  const period=md.match(/\n([A-Z][a-z]{2}\s+\d{1,2},\s+\d{4}\s+[–-]\s+[A-Z][a-z]{2}\s+\d{1,2},\s+\d{4})\n/)?.[1]||null;
  const currentScore=num(md.match(/Current Score\s+([\d,]+)/i)?.[1]);
  const leaderboardScore=num(md.match(/Leaderboard Score\s+\*\*([\d,]+)\*\*/i)?.[1]);
  const waveMatches=[...md.matchAll(/^Wave\s+(\d+)\s*$/gm)];
  const waves=[];
  for(let wi=0;wi<waveMatches.length;wi++){
    const wave=Number(waveMatches[wi][1]),start=waveMatches[wi].index,end=wi+1<waveMatches.length?waveMatches[wi+1].index:md.length;
    const segment=md.slice(start,end),lines=segment.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    const madness=num(segment.match(/Madness\s+([\d,]+)/i)?.[1]);
    const teams=[];let team=null;
    const flush=()=>{if(team){team.members=team.members.slice(0,8);teams.push(team);team=null}};
    for(let i=0;i<lines.length;i++){
      const line=lines[i];
      if(line==='Clear'||line==='Extra Clear'){
        flush();team={clearType:line==='Clear'?'clear':'extra',token:null,members:[]};continue;
      }
      if(!team)continue;
      const token=parseTokenImage(line);if(token&&!team.token){team.token=token;continue}
      const c=parseCharacterImage(line);if(!c)continue;
      let level=null,progression=null;
      for(let j=i+1;j<Math.min(lines.length,i+4);j++){
        if(parseCharacterImage(lines[j])||lines[j]==='Clear'||lines[j]==='Extra Clear'||/^Wave\s+\d+/.test(lines[j]))break;
        const lv=lines[j].match(/^Lv\.?\s*(\d+)(?:\s+([A-Z]{2,}))?/i);
        if(lv){level=num(lv[1]);progression=lv[2]||null;break}
      }
      const rec=byIngame.get(String(c.ingameId).toUpperCase())||null;
      team.members.push({...c,level,progression,enlightenLevel:null,skeydbId:rec?.id||null,canonicalName:rec?.name||c.name,wheels:[],covenant:null});
    }
    flush();
    waves.push({wave,madness,teams});
  }
  return {rank:entry.rank,player,uid:entry.uid,score:entry.score,currentScore,leaderboardScore,url:entry.url,seasonId,period,waves,fetchedAt:new Date().toISOString()};
}

function parseHistory(md='',uid){
  const ids=[];
  for(const m of md.matchAll(new RegExp(`https:\\/\\/eremora\\.com\\/u\\/${uid}\\/challenges\\/dzone\\/(\\d+)`,'g')))ids.push(Number(m[1]));
  for(const m of md.matchAll(/D-Zone\s+Season\s+(\d+)/gi))ids.push(Number(m[1]));
  return uniq(ids).sort((a,b)=>b-a);
}

function addCount(map,key,meta={}){if(!key)return;const cur=map.get(key)||{key,count:0,...meta};cur.count++;map.set(key,cur)}
function ratesFromTeams(teams){
  const char=new Map(),token=new Map(),wheel=new Map(),covenant=new Map();let memberSlots=0,wheelSlots=0,covenantSlots=0;
  for(const team of teams){
    const seenChars=new Set(),seenWheels=new Set(),seenCov=new Set();
    addCount(token,team.token?.name,{name:team.token?.name});
    for(const m of team.members||[]){
      memberSlots++;
      const key=m.skeydbId||m.ingameId||m.name;if(key&&!seenChars.has(key)){seenChars.add(key);addCount(char,key,{id:m.skeydbId||null,ingameId:m.ingameId,name:m.canonicalName||m.name,image:m.image})}
      for(const w of m.wheels||[]){wheelSlots++;const wk=w.id||w.name;if(wk&&!seenWheels.has(wk)){seenWheels.add(wk);addCount(wheel,wk,{id:w.id||null,name:w.name||wk})}}
      if(m.covenant){covenantSlots++;const ck=m.covenant.id||m.covenant.name;if(ck&&!seenCov.has(ck)){seenCov.add(ck);addCount(covenant,ck,{id:m.covenant.id||null,name:m.covenant.name||ck})}}
    }
  }
  const n=teams.length||1;
  const finish=map=>[...map.values()].map(x=>({...x,teamRate:x.count/n,teamRatePct:Number((x.count/n*100).toFixed(2))})).sort((a,b)=>b.count-a.count||String(a.name||a.key).localeCompare(String(b.name||b.key)));
  return {teamCount:teams.length,memberSlots,wheelSlots,covenantSlots,characters:finish(char),tokens:finish(token),wheels:finish(wheel),covenants:finish(covenant)};
}
function buildStats(season){
  const allTeams=[],byWave={};
  for(const rec of season.records){for(const wave of rec.waves||[]){byWave[wave.wave]??={all:[],clear:[],extra:[]};for(const team of wave.teams||[]){byWave[wave.wave].all.push(team);byWave[wave.wave][team.clearType]?.push(team);allTeams.push(team)}}}
  const waves=Object.fromEntries(Object.entries(byWave).map(([w,g])=>[w,{all:ratesFromTeams(g.all),clear:ratesFromTeams(g.clear),extra:ratesFromTeams(g.extra)}]));
  const all=ratesFromTeams(allTeams);
  const equipAvailable=all.wheelSlots>0||all.covenantSlots>0;
  return {seasonId:season.seasonId,generatedAt:new Date().toISOString(),recordCount:season.records.length,waves,all,equipment:{available:equipAvailable,wheelSlots:all.wheelSlots,covenantSlots:all.covenantSlots,note:equipAvailable?null:'Eremora 的公开渲染挑战页当前未直接展开角色配装弹层；命轮与密契字段保留在数据结构中，未取得原始字段时不会猜测或伪造出场率。'}};
}

await mkdir(SEASON_DIR,{recursive:true});await mkdir(STATS_DIR,{recursive:true});
const awakeners=await readJson(AWAKENERS_FILE,{records:[]});
const byIngame=new Map((awakeners.records||[]).filter(x=>x.ingameId).map(x=>[String(x.ingameId).toUpperCase(),x]));
let leaderboardMd;
try{leaderboardMd=await fetchReader(`${ORIGIN}/leaderboard/abyss`)}catch{leaderboardMd=await fetchReader(`${ORIGIN}/leaderboard`)}
const entries=parseLeaderboard(leaderboardMd);
if(!entries.length)throw new Error('No D-Zone leaderboard records found in the rendered Eremora page.');
const currentSeason=Math.max(...entries.map(x=>x.seasonId));
const currentEntries=entries.filter(x=>x.seasonId===currentSeason);
const oldSeason=await readJson(path.join(SEASON_DIR,`${currentSeason}.json`),{records:[]});
const oldByUid=new Map((oldSeason.records||[]).map(x=>[String(x.uid),x]));
const records=[];const failures=[];
for(let i=0;i<currentEntries.length;i+=BATCH_SIZE){
  const batch=currentEntries.slice(i,i+BATCH_SIZE);
  const results=await Promise.all(batch.map(async entry=>{
    try{return {ok:true,record:parseChallenge(await fetchReader(entry.url),entry,byIngame)}}catch(error){return {ok:false,entry,error:String(error)}}
  }));
  for(const r of results){
    if(r.ok)records.push(r.record);else{failures.push({uid:r.entry.uid,url:r.entry.url,error:r.error});const cached=oldByUid.get(String(r.entry.uid));if(cached)records.push(cached)}
  }
  if(i+BATCH_SIZE<currentEntries.length)await sleep(BATCH_DELAY);
}
records.sort((a,b)=>(a.rank??999)-(b.rank??999)||(b.score??0)-(a.score??0));
const period=records.find(x=>x.period)?.period||null;
const season={source:{site:'Eremora',url:`${ORIGIN}/leaderboard`,transport:'public rendered pages via Jina Reader',syncedAt:new Date().toISOString()},seasonId:currentSeason,period,leaderboardEntryCount:currentEntries.length,recordCount:records.length,complete:failures.length===0&&records.length===currentEntries.length,failures,records};
const stats=buildStats(season);
await saveJson(path.join(SEASON_DIR,`${currentSeason}.json`),season);await saveJson(path.join(STATS_DIR,`${currentSeason}.json`),stats);

let historyIds=[];
try{historyIds=parseHistory(await fetchReader(`${ORIGIN}/u/${currentEntries[0].uid}/challenges/dzone`),currentEntries[0].uid)}catch(error){console.warn('History discovery failed:',String(error))}
const seasonFiles=(await readdir(SEASON_DIR)).filter(x=>/^\d+\.json$/.test(x));
const snapshots=[];
for(const f of seasonFiles){const s=await readJson(path.join(SEASON_DIR,f));if(s)snapshots.push({seasonId:s.seasonId,period:s.period||null,recordCount:s.recordCount||0,leaderboardEntryCount:s.leaderboardEntryCount||0,complete:!!s.complete,path:`data/morimens/eremora/seasons/${s.seasonId}.json`,statsPath:`data/morimens/eremora/stats/${s.seasonId}.json`})}
snapshots.sort((a,b)=>b.seasonId-a.seasonId);
const discovered=uniq([currentSeason,...historyIds,...snapshots.map(x=>x.seasonId)]).sort((a,b)=>b-a);
const manifest={source:{site:'Eremora',url:`${ORIGIN}/leaderboard`,syncedAt:new Date().toISOString(),transport:'public rendered pages via Jina Reader'},currentSeason,availableSeasons:snapshots,discoveredSeasonIds:discovered,pendingBackfillSeasonIds:discovered.filter(id=>!snapshots.some(s=>s.seasonId===id)),current:{leaderboardEntries:currentEntries.length,records:records.length,complete:season.complete,failures:failures.length},fieldCoverage:{character:true,wave:true,level:true,progressionLabel:true,enlightenLevel:false,wheels:stats.equipment.available,covenants:stats.equipment.available},notes:['角色、波次、等级与页面显示的 AA/OE 状态直接来自 Eremora 公开挑战记录。','数值启灵等级、命轮与密契仅在数据源公开渲染到具体记录时写入；当前不会用角色展示页的现时配装冒充历史挑战配装。','历史期次由已保存快照永久保留；发现到但尚未完整回填的期次列在 pendingBackfillSeasonIds。']};
await saveJson(path.join(OUT_DIR,'manifest.json'),manifest);
console.log(`Eremora D-Zone season ${currentSeason}: ${records.length}/${currentEntries.length} records, ${Object.keys(stats.waves).length} waves, failures=${failures.length}; discovered seasons=${discovered.join(',')}.`);

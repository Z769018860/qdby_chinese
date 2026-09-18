import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
import path from 'node:path';
import {sleep,fixMojibake,decodeSvelteData,walk,mediaUrl} from './eremora_sveltekit.mjs';

const ORIGIN='https://eremora.com';
const READER='https://r.jina.ai/';
const ROOT='data/morimens/eremora';
const RANK_DIR=path.join(ROOT,'rank-index');
const USAGE_DIR=path.join(ROOT,'usage');
const USAGE_STATS_DIR=path.join(ROOT,'usage-stats');
const MANIFEST=path.join(ROOT,'manifest.json');
const AWAKENERS='data/morimens/skeydb/awakeners.json';
const TARGET=Math.max(50,Math.min(1000,Number(process.env.EREMORA_USAGE_TARGET||1000)));
const MAX_FETCH=Math.max(1,Math.min(1000,Number(process.env.EREMORA_USAGE_MAX_FETCH||1000)));
const BATCH=Math.max(1,Math.min(4,Number(process.env.EREMORA_USAGE_BATCH_SIZE||3)));
const DELAY=Math.max(1800,Number(process.env.EREMORA_USAGE_BATCH_DELAY_MS||2200));
const CHECKPOINT_EVERY=Math.max(1,Number(process.env.EREMORA_USAGE_CHECKPOINT_EVERY||10));
const STALE_DAYS=Math.max(1,Number(process.env.EREMORA_USAGE_STALE_DAYS||7));
const MAX_403=Math.max(1,Number(process.env.EREMORA_USAGE_MAX_403||3));
const CROSS_SEASON=process.env.EREMORA_USAGE_CROSS_SEASON==='1';
let forbidden403=0, stopDueTo403=false;
const UA='qdby-chinese-eremora-usage-sync/1.0 (+https://github.com/Z769018860/qdby_chinese)';
const DIFFICULTY_ZH={normal:'普通',hard:'困难',nightmare:'噩梦',madness:'癫狂',unknown:'未识别'};
const ENLIGHT_ZH={e3:'最高三启',overlimit:'最高超限',law12:'最高+12法则'};
const RANK_CAPS=[50,200,500,1000];

async function readJson(file,fallback=null){try{return JSON.parse(await readFile(file,'utf8'))}catch{return fallback}}
async function saveJson(file,data){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(data,null,2)+'\n')}
const num=v=>{const n=Number(String(v??'').replace(/,/g,''));return Number.isFinite(n)?n:null};
const fingerprint=r=>`${r.uid}:${r.score??''}:${r.dzoneSeason??''}`;
function difficultyId(s=''){const x=String(s).toLowerCase();if(x==='normal')return'normal';if(x==='hard')return'hard';if(x==='nightmare')return'nightmare';if(x==='madness')return'madness';return'unknown'}
function enlightTier(p=''){const x=String(p).toUpperCase();if(x==='AA')return'law12';if(x==='OE')return'overlimit';return'e3'}

async function fetchReader(url,retries=8){let last;for(let i=0;i<retries;i++){
  try{const r=await fetch(`${READER}${url}`,{headers:{'user-agent':UA,'accept':'text/plain','x-engine':'browser','x-timeout':'40','x-wait-for-selector':'body'},redirect:'follow',signal:AbortSignal.timeout(50000)}),text=await r.text();if(r.ok&&text&&!/Target URL returned error 429/i.test(text))return text;last=new Error(`${url}: HTTP ${r.status}`);if(r.status!==429&&r.status<500)break}catch(e){last=e}
  if(i+1<retries)await sleep(Math.min(20000,2500*Math.pow(2,i)));
}throw last||new Error(`${url}: failed`)}
function parseChar(line=''){
  const m=line.match(/!\[Image\s+\d+:\s*([^\]]+)\]\((https:\/\/media\.eremora\.com\/[^)]+\/portraits\/Portrait_Minihead_Awaker_([A-Za-z0-9]+)_(?:AF|NF)\.webp)\)(.*)$/i);if(!m)return null;
  return {name:fixMojibake(m[1].replace(/^"|"$/g,'')),image:m[2],ingameId:m[3],borrowed:/Borrowed support/i.test(m[4]||'')};
}
function parseToken(line=''){const m=line.match(/!\[Image\s+\d+:\s*([^\]]+)\]\((https:\/\/media\.eremora\.com\/[^)]+\/icon\/KeyToken_Skill_[^)]+)\)/i);return m?{name:fixMojibake(m[1]),image:m[2]}:null}
function parseUsagePage(md,row,seasonId,byIngame){
  const pageSeason=num(md.match(/\bSeason\s+(\d+)\b/i)?.[1]);if(pageSeason!=null&&Number(pageSeason)!==Number(seasonId))throw new Error(`season mismatch: wanted ${seasonId}, page=${pageSeason}`);
  const title=fixMojibake(md.match(/^Title:\s*(.+)$/m)?.[1]?.trim()||row.name||'').replace(/\s*\|\s*D-Zone Season\s+\d+.*$/i,'').trim();
  const currentScore=num(md.match(/Current Score\s+([\d,]+)/i)?.[1]),leaderboardScore=num(md.match(/Leaderboard Score\s+\*\*([\d,]+)\*\*/i)?.[1]);
  const wm=[...md.matchAll(/^Wave\s+(\d+)\s*$/gm)],waves=[];
  for(let wi=0;wi<wm.length;wi++){
    const wave=Number(wm[wi][1]),start=wm[wi].index,end=wi+1<wm.length?wm[wi+1].index:md.length,seg=md.slice(start,end),lines=seg.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    const dm=seg.match(/^(Normal|Hard|Nightmare|Madness)\s+([\d,]+)\s*$/mi),difficulty=difficultyId(dm?.[1]),recommendedLevel=num(dm?.[2]);
    const teams=[];let team=null;const flush=()=>{if(team){team.members=team.members.slice(0,8);if(team.members.length)teams.push(team);team=null}};
    for(let i=0;i<lines.length;i++){
      const line=lines[i];if(line==='Clear'||line==='Extra Clear'){flush();team={clearType:line==='Clear'?'clear':'extra',difficulty,difficultyLabel:DIFFICULTY_ZH[difficulty],recommendedLevel,token:null,members:[]};continue}if(!team)continue;
      const tok=parseToken(line);if(tok&&!team.token){team.token=tok;continue}const c=parseChar(line);if(!c)continue;
      let level=null,progression=null;for(let j=i+1;j<Math.min(lines.length,i+5);j++){if(parseChar(lines[j])||lines[j]==='Clear'||lines[j]==='Extra Clear'||/^Wave\s+\d+/.test(lines[j]))break;const lv=lines[j].match(/^Lv\.?\s*(\d+)(?:\s+([A-Z0-9+]+))?/i);if(lv){level=num(lv[1]);progression=lv[2]||null;break}}
      const rec=byIngame.get(String(c.ingameId).toUpperCase())||null,tier=enlightTier(progression);team.members.push({...c,level,progression,enlightTier:tier,enlightTierLabel:ENLIGHT_ZH[tier],skeydbId:rec?.id||null,canonicalName:rec?.name||c.name});
    }flush();waves.push({wave,difficulty,difficultyLabel:DIFFICULTY_ZH[difficulty],recommendedLevel,teams});
  }
  if(!waves.some(w=>w.teams.length))throw new Error('no D-Zone teams parsed');
  return {rank:row.rank,uid:String(row.uid),player:title||row.name||'',score:row.score,currentScore,leaderboardScore,dzoneSeason:seasonId,url:`${ORIGIN}/u/${row.uid}/challenges/dzone/${seasonId}`,rankFingerprint:fingerprint(row),fetchedAt:new Date().toISOString(),waves};
}
function add(map,key,meta={}){if(key==null||key==='')return;const k=String(key),x=map.get(k)||{key:k,count:0,...meta};x.count++;map.set(k,x)}
function flatten(records=[]){const unique=new Map(),richness=t=>(t.token?8:0)+(t.creations?.length||0)*3+(t.members||[]).reduce((n,m)=>n+(m.wheels?.length||m.weapons?.length||0)*4+(m.covenants?.length||m.suits?.length||(m.covenant?1:0))*4+(m.covenantScore!=null?2:0)+(m.level!=null?1:0)+(m.enlightenment?.length||0),0);for(const record of records)for(const wave of record.waves||[])for(const team of wave.teams||[]){const difficulty=team.difficulty||wave.difficulty||'unknown',members=(team.members||[]).map(m=>String(m.ingameId||m.skeydbId||m.id||m.canonicalName||m.name||'')).filter(Boolean).sort().join(','),key=[record.uid||record.rank||'',wave.wave||'',team.clearType||'',difficulty,members].join('|'),row={record,wave,team,difficulty},old=unique.get(key);if(!old||richness(team)>richness(old.team))unique.set(key,row)}return [...unique.values()]}
function usage(rows=[]){
  const chars=new Map(),tokens=new Map(),enlight=new Map();let memberSlots=0;
  for(const {team} of rows){const seen=new Set();add(tokens,team.token?.name,{name:team.token?.name});for(const m of team.members||[]){memberSlots++;const k=m.skeydbId||m.ingameId||m.name;if(k&&!seen.has(String(k))){seen.add(String(k));add(chars,k,{id:m.skeydbId||null,ingameId:m.ingameId||null,name:m.canonicalName||m.name,image:m.image||null})}add(enlight,m.enlightTier||enlightTier(m.progression),{name:ENLIGHT_ZH[m.enlightTier||enlightTier(m.progression)]})}}
  const teamCount=rows.length,finish=map=>[...map.values()].map(x=>({...x,teamRatePct:teamCount?Number((x.count/teamCount*100).toFixed(2)):0})).sort((a,b)=>b.count-a.count||String(a.name||a.key).localeCompare(String(b.name||b.key),'zh-CN'));
  return {teamCount,memberSlots,characters:finish(chars),tokens:finish(tokens),enlightenment:finish(enlight)};
}
function buildStats(records,rankTarget){
  const rows=flatten(records),recordRanks=new Set(records.map(r=>Number(r.rank)).filter(Number.isFinite)),maxRank=recordRanks.size?Math.max(...recordRanks):0;
  const rankTiers=Object.fromEntries(RANK_CAPS.map(cap=>{const expected=Math.min(cap,rankTarget),covered=[...recordRanks].filter(r=>r<=expected).length,rr=rows.filter(x=>Number(x.record.rank)<=expected);return [String(cap),{cap,expected,covered,coveragePct:expected?Number((covered/expected*100).toFixed(2)):0,complete:covered===expected,all:usage(rr),difficulties:Object.fromEntries(Object.keys(DIFFICULTY_ZH).filter(x=>x!=='unknown').map(d=>[d,usage(rr.filter(x=>x.difficulty===d))]))}]}));
  const waves={};for(const w of [...new Set(rows.map(x=>Number(x.wave.wave)).filter(Number.isFinite))].sort((a,b)=>a-b)){const wr=rows.filter(x=>Number(x.wave.wave)===w);waves[w]={all:usage(wr),difficulties:Object.fromEntries(Object.keys(DIFFICULTY_ZH).filter(x=>x!=='unknown').map(d=>[d,usage(wr.filter(x=>x.difficulty===d))]))}}
  const recognized=rows.filter(x=>x.difficulty!=='unknown').length;
  return {generatedAt:new Date().toISOString(),recordCount:records.length,maxRankAvailable:maxRank,all:usage(rows),difficulties:Object.fromEntries(Object.keys(DIFFICULTY_ZH).filter(x=>x!=='unknown').map(d=>[d,usage(rows.filter(x=>x.difficulty===d))])),waves,rankTiers,difficultyCoverage:{recognizedTeams:recognized,totalTeams:rows.length,coveragePct:rows.length?Number((recognized/rows.length*100).toFixed(2)):0}};
}

const manifest=await readJson(MANIFEST,{});
const currentSeason=Number(manifest.rankIndex?.seasonId||manifest.currentSeason);
if(!currentSeason)throw new Error('No current Eremora season in manifest.');
const seasonIds=[...new Set(String(process.env.EREMORA_USAGE_SEASONS||currentSeason+',68,67,66').split(',').map(Number).filter(x=>x>=1&&x<=currentSeason))];
const awakeners=await readJson(AWAKENERS,{records:[]});
const byIngame=new Map((awakeners.records||[]).filter(x=>x.ingameId).map(x=>[String(x.ingameId).toUpperCase(),x]));
try{await run('git',['config','user.name','github-actions[bot]']);await run('git',['config','user.email','41898282+github-actions[bot]@users.noreply.github.com'])}catch{}

async function loadChunkedRecords(seasonId){
  const candidates=[path.join(USAGE_DIR,seasonId+'-local-gzip/index.json'),path.join(USAGE_DIR,seasonId+'-local-gzip-v2/index.json')];
  for(const indexPath of candidates){
    const index=await readJson(indexPath,null); if(!index?.chunks?.length) continue;
    try{const encoded=(await Promise.all(index.chunks.map(x=>readFile(x,'utf8')))).join('');
      const raw=JSON.parse(gunzipSync(Buffer.from(encoded,'base64')).toString('utf8'));
      return Array.isArray(raw)?raw:(raw.records||raw.rows||[]);
    }catch(error){console.warn('Unable to decode historical chunk export',indexPath,String(error))}
  }
  return [];
}

async function fetchDirectUsage(uid,seasonId,row,byIngame){
  const url=ORIGIN+'/u/'+uid+'/challenges/dzone/'+seasonId+'/__data.json';
  const response=await fetch(url,{headers:{'user-agent':UA,accept:'application/json'},redirect:'follow',signal:AbortSignal.timeout(30000)});
  const text=await response.text();
  if(response.status===403){forbidden403++;if(forbidden403>=MAX_403)stopDueTo403=true;throw new Error('direct __data HTTP 403 (Cloudflare protection)')}
  if(!response.ok||!text.startsWith('{"type"'))throw new Error('direct __data HTTP '+response.status);
  const decoded=decodeSvelteData(text);let profile=null,mediaBase='';
  walk(decoded.root,value=>{if(!profile&&Array.isArray(value?.teams)&&value.teams.length)profile=value;if(!mediaBase&&typeof value?.mediaBase==='string')mediaBase=value.mediaBase});
  if(!profile?.teams?.length)throw new Error('direct __data has no team records');
  const members=profile.teams.map(team=>{const a=team.awaker||{},rec=byIngame.get(String(a.res||'').replace(/_(?:AF|NF)$/i,'').toUpperCase())||null;const count=Array.isArray(team.enlightenment)?team.enlightenment.filter(x=>x?.unlocked!==false).length:0;const tier=count>=5?'law12':count>=4?'overlimit':'e3';return {name:fixMojibake(a.name||''),image:mediaUrl(mediaBase,a.mini||a.image),ingameId:String(a.res||'').replace(/_(?:AF|NF)$/i,''),level:team.level??null,progression:count?'E'+count:null,enlightTier:tier,enlightTierLabel:ENLIGHT_ZH[tier],skeydbId:rec?.id||null,canonicalName:rec?.name||a.name||''}});
  return {rank:row.rank,uid:String(uid),player:profile.header?.name||row.name||'',score:row.score,currentScore:null,leaderboardScore:null,dzoneSeason:seasonId,url:ORIGIN+'/u/'+uid+'/challenges/dzone/'+seasonId,rankFingerprint:fingerprint(row),fetchedAt:new Date().toISOString(),waves:[{wave:0,difficulty:'unknown',difficultyLabel:DIFFICULTY_ZH.unknown,recommendedLevel:null,teams:[{clearType:'clear',difficulty:'unknown',difficultyLabel:DIFFICULTY_ZH.unknown,recommendedLevel:null,token:null,members}]}],transport:'sveltekit-__data'};
}
async function fetchUsageRecord(uid,seasonId,row,byIngame){
  try{return await fetchDirectUsage(uid,seasonId,row,byIngame)}
  catch(directError){if(stopDueTo403)throw new Error('stopped after repeated HTTP 403; checkpoint retained');try{return parseUsagePage(await fetchReader(ORIGIN+'/u/'+uid+'/challenges/dzone/'+seasonId),row,seasonId,byIngame)}catch(readerError){throw new Error('direct: '+directError.message+'; reader: '+readerError.message)}}
}
async function syncSeason(seasonId){
  const historical=seasonId!==currentSeason;
  const rankPath=historical?path.join(ROOT,'seasons',`${seasonId}.json`):(manifest.rankIndex?.path||`data/morimens/eremora/rank-index/${seasonId}.json`);
  const rankDoc=await readJson(rankPath,{});
  const sourceRows=(rankDoc.rows||rankDoc.records||[]).filter(r=>Number(r.rank)<=TARGET).sort((a,b)=>a.rank-b.rank);
  if(!sourceRows.length){
    const recovered=await loadChunkedRecords(seasonId);
    sourceRows.push(...recovered.map((r,i)=>({...r,rank:Number(r.rank)||i+1,uid:String(r.uid||r.user_id||'')})).filter(r=>r.uid).slice(0,TARGET));
  }
  const baseCount=sourceRows.length;
  if(CROSS_SEASON && seasonId===currentSeason){
    const known=new Set(sourceRows.map(r=>String(r.uid)));
    for(const prior of seasonIds.filter(x=>x!==currentSeason)) for(const r of await loadChunkedRecords(prior)){
      const uid=String(r.uid||r.user_id||''); if(!uid||known.has(uid)) continue;
      known.add(uid); sourceRows.push({...r,uid,rank:100000+sourceRows.length,sourceSeason:prior,crossSeason:true});
    }
    console.log(`season ${seasonId}: added ${sourceRows.length-baseCount} cross-season players for backfill`);
  }
  if(!sourceRows.length){console.warn(`season ${seasonId}: no cached rank rows at ${rankPath}`);return {seasonId,recordCount:0,failed:0}}
  const outPath=path.join(USAGE_DIR,`${seasonId}.json`),old=await readJson(outPath,{records:[]});
  const cache=new Map((old.records||[]).map(x=>[String(x.uid),x])),failedBefore=new Set((old.failures||[]).map(x=>String(x.uid)));
  const now=Date.now(),staleMs=STALE_DAYS*86400000,queue=[];
  for(const row of sourceRows){const oldRec=cache.get(String(row.uid)),changed=!oldRec||oldRec.rankFingerprint!==fingerprint(row),stale=!historical&&oldRec?.fetchedAt?now-Date.parse(oldRec.fetchedAt)>staleMs:false,retry=failedBefore.has(String(row.uid));if(!oldRec||retry||changed||stale)queue.push({row,priority:!oldRec?0:retry?1:changed?2:3,age:oldRec?.fetchedAt?Date.parse(oldRec.fetchedAt):0})}
  queue.sort((a,b)=>a.priority-b.priority||a.age-b.age||a.row.rank-b.row.rank);const selected=queue.slice(0,MAX_FETCH),failures=[];
  console.log(`Eremora season ${seasonId}: fixed=${historical}, rows=${sourceRows.length}, cached=${cache.size}, retryQueue=${queue.length}, selected=${selected.length}`);
  for(let i=0;i<selected.length&&!stopDueTo403;i+=BATCH){const batch=selected.slice(i,i+BATCH);const results=await Promise.all(batch.map(async({row})=>{let last;try{return {ok:true,row,record:await fetchUsageRecord(row.uid,seasonId,row,byIngame)}}catch(e){last=e}return {ok:false,row,error:String(last||'unknown error')}}));for(const result of results){if(result.ok)cache.set(String(result.row.uid),result.record);else failures.push({rank:result.row.rank,uid:String(result.row.uid),error:result.error})}
    const valid=[...cache.values()].filter(x=>sourceRows.some(row=>String(row.uid)===String(x.uid))).sort((a,b)=>a.rank-b.rank),expected=sourceRows.length,covered=new Set(valid.map(x=>x.rank)).size;
    await saveJson(outPath,{source:{site:'Eremora',rankIndex:rankPath,detailTransport:'public challenge pages via Jina Reader',syncedAt:new Date().toISOString()},seasonId,target:TARGET,rankIndexCount:sourceRows.length,recordCount:valid.length,coverage:{expected,covered,coveragePct:Number((covered/expected*100).toFixed(2)),complete:covered===expected},refresh:{historical,requested:selected.length,completed:Math.min(i+BATCH,selected.length),failed:failures.length,staleDays:historical?null:STALE_DAYS},failures,records:valid,progress:{completed:Math.min(i+BATCH,selected.length),target:selected.length,updatedAt:new Date().toISOString()}});
    console.log(`Eremora season ${seasonId} progress: ${Math.min(i+BATCH,selected.length)}/${selected.length}, cached=${valid.length}, failed=${failures.length}`);
    if((Math.floor(i/BATCH)+1)%CHECKPOINT_EVERY===0){try{await run('git',['add',outPath]);await run('git',['commit','-m',`chore: checkpoint Eremora season ${seasonId}`]);await run('git',['push','origin','HEAD:main'])}catch(error){console.warn(`checkpoint push skipped: ${error.message}`)}}
    if(i+BATCH<selected.length)await sleep(DELAY);}
  return {seasonId,recordCount:cache.size,failed:failures.length};
}
const results=[];for(const seasonId of seasonIds)results.push(await syncSeason(seasonId));
console.log('Eremora multi-season incremental sync complete:',JSON.stringify(results));

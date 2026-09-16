import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {sleep,fixMojibake} from './eremora_sveltekit.mjs';

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
const DELAY=Math.max(1200,Number(process.env.EREMORA_USAGE_BATCH_DELAY_MS||2800));
const STALE_DAYS=Math.max(1,Number(process.env.EREMORA_USAGE_STALE_DAYS||7));
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

async function fetchReader(url,retries=5){let last;for(let i=0;i<retries;i++){
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
function flatten(records=[]){const rows=[];for(const r of records)for(const w of r.waves||[])for(const t of w.teams||[])rows.push({record:r,wave:w,team:t,difficulty:t.difficulty||w.difficulty||'unknown'});return rows}
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

const manifest=await readJson(MANIFEST,{}),seasonId=Number(manifest.rankIndex?.seasonId||manifest.currentSeason);if(!seasonId)throw new Error('No current Eremora season in manifest.');
const rankPath=manifest.rankIndex?.path||`data/morimens/eremora/rank-index/${seasonId}.json`,rankDoc=await readJson(rankPath);if(!rankDoc?.rows?.length)throw new Error(`Rank index unavailable: ${rankPath}`);
const awakeners=await readJson(AWAKENERS,{records:[]}),byIngame=new Map((awakeners.records||[]).filter(x=>x.ingameId).map(x=>[String(x.ingameId).toUpperCase(),x]));
const outPath=path.join(USAGE_DIR,`${seasonId}.json`),old=await readJson(outPath,{records:[]}),cache=new Map((old.records||[]).map(x=>[String(x.uid),x]));
const rankRows=rankDoc.rows.filter(r=>Number(r.rank)<=TARGET).sort((a,b)=>a.rank-b.rank),now=Date.now(),staleMs=STALE_DAYS*86400000;
const queue=[];
for(const row of rankRows){const oldRec=cache.get(String(row.uid)),changed=!oldRec||oldRec.rankFingerprint!==fingerprint(row),stale=oldRec?.fetchedAt?now-Date.parse(oldRec.fetchedAt)>staleMs:true;if(!oldRec||changed||stale)queue.push({row,priority:!oldRec?0:changed?1:2,age:oldRec?.fetchedAt?Date.parse(oldRec.fetchedAt):0})}
queue.sort((a,b)=>a.priority-b.priority||a.age-b.age||a.row.rank-b.row.rank);const selected=queue.slice(0,MAX_FETCH),failures=[];
console.log(`Eremora usage season ${seasonId}: rankRows=${rankRows.length}, cached=${cache.size}, refreshQueue=${queue.length}, selected=${selected.length}`);
for(let i=0;i<selected.length;i+=BATCH){
  const batch=selected.slice(i,i+BATCH),results=await Promise.all(batch.map(async({row})=>{
    const seasons=[seasonId,...(Number(row.dzoneSeason)&&Number(row.dzoneSeason)!==seasonId?[Number(row.dzoneSeason)]:[])];let last;
    for(const s of seasons){try{return {ok:true,row,record:parseUsagePage(await fetchReader(`${ORIGIN}/u/${row.uid}/challenges/dzone/${s}`),row,s,byIngame)}}catch(e){last=e}}
    return {ok:false,row,error:String(last||'unknown error')};
  }));
  for(const r of results){if(r.ok)cache.set(String(r.row.uid),r.record);else failures.push({rank:r.row.rank,uid:r.row.uid,error:r.error})}
  if(i+BATCH<selected.length)await sleep(DELAY);
}
const valid=[];for(const row of rankRows){const rec=cache.get(String(row.uid));if(!rec)continue;rec.rank=row.rank;rec.score=row.score;rec.rankFingerprint=fingerprint(row);valid.push(rec)}valid.sort((a,b)=>a.rank-b.rank);
const stats=buildStats(valid,Math.min(TARGET,rankRows.length));const expected=Math.min(TARGET,rankRows.length),covered=new Set(valid.map(x=>x.rank)).size;
const doc={source:{site:'Eremora',rankIndex:rankPath,detailTransport:'public challenge pages via Jina Reader',syncedAt:new Date().toISOString()},seasonId,target:TARGET,rankIndexCount:rankRows.length,recordCount:valid.length,coverage:{expected,covered,coveragePct:expected?Number((covered/expected*100).toFixed(2)):0,complete:covered===expected},refresh:{requested:selected.length,failed:failures.length,staleDays:STALE_DAYS},failures,records:valid};
await saveJson(outPath,doc);await saveJson(path.join(USAGE_STATS_DIR,`${seasonId}.json`),{seasonId,...stats,coverage:doc.coverage});
manifest.usageIndex={seasonId,path:`data/morimens/eremora/usage/${seasonId}.json`,statsPath:`data/morimens/eremora/usage-stats/${seasonId}.json`,target:TARGET,rankIndexCount:rankRows.length,recordCount:valid.length,coverage:doc.coverage,syncedAt:doc.source.syncedAt};
manifest.notes=[...(manifest.notes||[]).filter(x=>!String(x).startsWith('出场率明细：')),
  `出场率明细：按 Top 1000 排名索引增量缓存每位玩家公开 D-Zone 配队；Top50/200/500/1000 各自记录 covered/expected，只有 covered=expected 才标记完整。失败或限流时保留上一份成功缓存，不用小样本冒充完整榜单。`
];
await saveJson(MANIFEST,manifest);
console.log(`Eremora usage season ${seasonId}: ${covered}/${expected} records, failures=${failures.length}, Top50=${stats.rankTiers['50'].covered}/50, Top200=${stats.rankTiers['200'].covered}/200, Top500=${stats.rankTiers['500'].covered}/500, Top1000=${stats.rankTiers['1000'].covered}/1000.`);

import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {decodeSvelteData,walk} from './eremora_sveltekit.mjs';

const ORIGIN='https://eremora.com';
const ROOT='data/morimens/eremora';
const SEASON=69;
const SNAPSHOT='69bug';
const TARGET=Math.max(50,Math.min(1000,Number(process.env.EREMORA_POSTBUG_TARGET||1000)));
const MIN_ROWS=Math.max(1,Math.min(TARGET,Number(process.env.EREMORA_POSTBUG_MIN_ROWS||950)));
const DELAY=Math.max(500,Number(process.env.EREMORA_POSTBUG_PAGE_DELAY_MS||1600));
const UA='qdby-chinese-s69-postbug/1.0 (+https://github.com/Z769018860/qdby_chinese)';

if(process.env.EREMORA_ALLOW_LEGACY_POSTBUG_SYNC!=='1'){
  console.log('Season 69 post-bug live /api/rank sync is retired by default: the endpoint now represents the current season. Using the checked-in Top 2000 meta summary instead.');
  process.exit(0);
}

async function readJson(file,fallback=null){try{return JSON.parse(await readFile(file,'utf8'))}catch{return fallback}}
async function saveJson(file,data){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(data,null,2)+'\n')}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};

async function fetchRankPage(start,end){
  const url=`${ORIGIN}/api/rank?board=abyss&start=${start}&end=${end}`;
  let last=null;
  for(let attempt=0;attempt<7;attempt++){
    try{
      const response=await fetch(url,{headers:{'user-agent':UA,accept:'application/json,text/plain,*/*','accept-language':'en-US,en;q=0.9',referer:ORIGIN+'/meta/dzone'},redirect:'follow',signal:AbortSignal.timeout(30000)});
      const text=await response.text();
      if(response.ok){
        const json=JSON.parse(text),rows=Array.isArray(json)?json:(json.rows||json.data||[]);
        if(Array.isArray(rows)&&rows.length)return rows;
      }
      last=new Error(`rank ${start}-${end}: HTTP ${response.status}`);
      if(response.status!==403&&response.status!==429&&response.status<500)break;
    }catch(error){last=error}
    if(attempt<6)await sleep(Math.min(15000,1200*Math.pow(1.7,attempt)));
  }
  throw last||new Error(`rank ${start}-${end}: no rows`);
}

function normalizeRow(row){
  return {
    rank:num(row.rank),uid:String(row.uid??''),name:String(row.name??row.raw_name??''),
    raw_name:String(row.raw_name??row.name??''),score:num(row.score),level:row.level??null,
    type:row.type??'AbyssChallenge',note:row.note??null,state:row.state??'',
    avatar:row.avatar??null,frame:row.frame??null,dzone_season:num(row.dzone_season)
  };
}
function richness(record){
  let score=0;
  for(const wave of record?.waves||[])for(const team of wave?.teams||[]){
    score+=10+(team.members?.length||0)*3+(team.creations?.length||0)*4;
    for(const member of team.members||[])score+=(member.wheels?.length||0)*4+(member.covenants?.length||0)*4+(member.level!=null?1:0);
  }
  return score;
}

const failures=[],byRank=new Map(),seenUid=new Set();
for(let start=1;start<=TARGET;start+=50){
  const end=Math.min(TARGET,start+49);
  try{
    const rows=await fetchRankPage(start,end);
    for(const raw of rows){
      const row=normalizeRow(raw);
      if(!row.rank||row.rank<1||row.rank>TARGET||!row.uid)continue;
      if(row.dzone_season!=null&&row.dzone_season!==SEASON)throw new Error(`season mismatch at rank ${row.rank}: ${row.dzone_season}`);
      if(!byRank.has(row.rank))byRank.set(row.rank,row);
    }
  }catch(error){failures.push({start,end,error:String(error)});}
  if(end<TARGET)await sleep(DELAY);
}
const rows=[...byRank.values()].sort((a,b)=>a.rank-b.rank);
for(const row of rows){
  if(seenUid.has(row.uid))throw new Error(`duplicate uid in live rank index: ${row.uid}`);
  seenUid.add(row.uid);
}
if(rows.length<MIN_ROWS){
  console.log('Legacy rank endpoint insufficient; probing current /meta/dzone SvelteKit data source...');
  for(const target of [ORIGIN+'/meta/dzone/__data.json',ORIGIN+'/meta/dzone']){
    try{
      const response=await fetch(target,{headers:{'user-agent':UA,accept:'application/json,text/html,*/*'},redirect:'follow',signal:AbortSignal.timeout(30000)});
      const text=await response.text();
      console.log('META_PROBE',target,'status='+response.status,'type='+(response.headers.get('content-type')||''),'length='+text.length,'head='+JSON.stringify(text.slice(0,500)));
      if(target.endsWith('/__data.json')&&response.ok){
        try{
          const decoded=decodeSvelteData(text),candidates=[];
          for(const root of decoded.roots||[])walk(root,(value,p)=>{
            if(candidates.length>=80)return;
            if(Array.isArray(value)&&value.length>=5){
              const obj=value.find(x=>x&&typeof x==='object'&&!Array.isArray(x));
              if(obj){
                const keys=Object.keys(obj);
                if(keys.some(k=>/rank|uid|score|player|usage|awak/i.test(k)))candidates.push({path:p,length:value.length,keys:keys.slice(0,30),sample:obj});
              }
            }else if(value&&typeof value==='object'){
              const keys=Object.keys(value);
              if(keys.some(k=>/rank|players|leader|meta|usage|awak/i.test(k))&&keys.length<40)candidates.push({path:p,keys:keys.slice(0,30),sample:value});
            }
          });
          console.log('META_CANDIDATES',JSON.stringify(candidates.slice(0,40)));
        }catch(error){console.log('META_DECODE_ERROR',String(error))}
      }
    }catch(error){console.log('META_PROBE_ERROR',target,String(error))}
  }
  console.log('RANK_PAGE_FAILURES',JSON.stringify(failures));
  throw new Error(`Refusing to publish post-bug snapshot: only ${rows.length}/${TARGET} live rank rows were fetched (minimum ${MIN_ROWS}).`);
}
const missing=[];for(let i=1;i<=TARGET;i++)if(!byRank.has(i))missing.push(i);

const base=await readJson(path.join(ROOT,'seasons','69.json'),{records:[]});
const detailByUid=new Map();
for(const record of base.records||[]){
  const uid=String(record?.uid??'');if(!uid)continue;
  const old=detailByUid.get(uid);if(!old||richness(record)>richness(old))detailByUid.set(uid,record);
}
const records=[],missingDetailUids=[];
for(const row of rows){
  const cached=detailByUid.get(row.uid);
  if(cached){
    records.push({...cached,rank:row.rank,uid:row.uid,player:row.name||cached.player||'',score:row.score??cached.score??null,dzoneSeason:SEASON,rankSnapshot:SNAPSHOT,rankSource:'Eremora live /api/rank'});
  }else{
    missingDetailUids.push(row.uid);
    records.push({rank:row.rank,uid:row.uid,player:row.name||'',score:row.score,dzoneSeason:SEASON,rankSnapshot:SNAPSHOT,rankSource:'Eremora live /api/rank',detailMissing:true,waves:[]});
  }
}
const now=new Date().toISOString();
const complete=rows.length===TARGET&&missing.length===0;
const rankDoc={
  source:{site:'Eremora',page:ORIGIN+'/meta/dzone',endpoint:ORIGIN+'/api/rank?board=abyss&start={start}&end={end}',syncedAt:now},
  snapshotId:SNAPSHOT,seasonId:SEASON,target:TARGET,complete,
  coverage:{count:rows.length,maxRank:rows.at(-1)?.rank||0,missingCount:missing.length,missingRanks:missing},
  failures,rows
};
const seasonDoc={
  source:{site:'Eremora',page:ORIGIN+'/meta/dzone',rankEndpoint:rankDoc.source.endpoint,detailReuse:'data/morimens/eremora/seasons/69.json',syncedAt:now},
  snapshotId:SNAPSHOT,seasonId:SEASON,label:'69期bug后',target:TARGET,
  leaderboardEntryCount:rows.length,recordCount:records.length,detailRecordCount:records.length-missingDetailUids.length,
  complete:complete&&missingDetailUids.length===0,
  coverage:{rankRows:rows.length,target:TARGET,rankPct:Number((rows.length/TARGET*100).toFixed(2)),detailRows:records.length-missingDetailUids.length,detailPct:records.length?Number(((records.length-missingDetailUids.length)/records.length*100).toFixed(2)):0},
  missingDetailUids,records
};
await saveJson(path.join(ROOT,'rank-index',SNAPSHOT+'.json'),rankDoc);
await saveJson(path.join(ROOT,'seasons',SNAPSHOT+'.json'),seasonDoc);

const manifest=await readJson(path.join(ROOT,'manifest.json'),{availableSeasons:[]});
const entry={
  snapshotId:SNAPSHOT,seasonId:SEASON,sourceSeasonId:SEASON,
  labelZh:'69期bug后',labelEn:'Season 69 (post-bug)',
  period:'2026-09-14 – 2026-09-28',periodShort:'9.14–9.28',
  recordCount:records.length,detailRecordCount:seasonDoc.detailRecordCount,
  leaderboardEntryCount:rows.length,target:TARGET,complete:seasonDoc.complete,
  coverageMode:'post-bug-live-rank',
  path:`${ROOT}/seasons/${SNAPSHOT}.json`,
  statsPath:`${ROOT}/stats/${SNAPSHOT}.json`,
  rankPath:`${ROOT}/rank-index/${SNAPSHOT}.json`,
  dataUpdatedAt:now
};
const available=(manifest.availableSeasons||[]).filter(x=>String(x.snapshotId||'')!==SNAPSHOT);
const currentIndex=available.findIndex(x=>!x.snapshotId&&Number(x.seasonId)===SEASON);
available.splice(currentIndex>=0?currentIndex+1:0,0,entry);
manifest.availableSeasons=available;
manifest.postBug69={snapshotId:SNAPSHOT,sourcePage:ORIGIN+'/meta/dzone',rankEndpoint:rankDoc.source.endpoint,target:TARGET,rankRows:rows.length,detailRows:seasonDoc.detailRecordCount,missingRankCount:missing.length,missingDetailCount:missingDetailUids.length,syncedAt:now};
manifest.notes=[...(manifest.notes||[]).filter(x=>!String(x).startsWith('69期bug后：')),`69期bug后：从 Eremora /meta/dzone 对应的公开 /api/rank 分页重新取得赛季69最终排名范围；本次获取 ${rows.length}/${TARGET} 个唯一排名、${seasonDoc.detailRecordCount} 个可复用完整配队详情，缺失项如实标记，不用旧玩家伪造补位。`];
await saveJson(path.join(ROOT,'manifest.json'),manifest);
await saveJson(path.join(ROOT,'postbug-69-report.json'),{generatedAt:now,seasonId:SEASON,snapshotId:SNAPSHOT,target:TARGET,rankRows:rows.length,completeRankIndex:complete,missingRanks:missing,detailRows:seasonDoc.detailRecordCount,missingDetailUids,fetchFailures:failures});
console.log(`Season 69 post-bug snapshot: ranks=${rows.length}/${TARGET}, details=${seasonDoc.detailRecordCount}/${records.length}, missingRanks=${missing.length}, pageFailures=${failures.length}`);

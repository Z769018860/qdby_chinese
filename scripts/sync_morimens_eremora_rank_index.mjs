import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {sleep,fixMojibake} from './eremora_sveltekit.mjs';

const ORIGIN='https://eremora.com';
const OUT_DIR='data/morimens/eremora';
const INDEX_DIR=path.join(OUT_DIR,'rank-index');
const MANIFEST=path.join(OUT_DIR,'manifest.json');
const TARGET=Math.max(50,Math.min(1000,Number(process.env.EREMORA_RANK_TARGET||1000)));
const PAGE_SIZE=50;
const DELAY=Math.max(500,Number(process.env.EREMORA_RANK_DELAY_MS||1100));
const UA='qdby-chinese-eremora-rank-sync/1.0 (+https://github.com/Z769018860/qdby_chinese)';

async function readJson(file,fallback=null){try{return JSON.parse(await readFile(file,'utf8'))}catch{return fallback}}
async function saveJson(file,data){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(data,null,2)+'\n')}
function mode(values=[]){const m=new Map();for(const v of values)if(v!=null)m.set(v,(m.get(v)||0)+1);return [...m].sort((a,b)=>b[1]-a[1])[0]?.[0]??null}
function normalizeRow(r={}){return {
  rank:Number(r.rank),uid:String(r.uid??''),name:fixMojibake(r.name||r.raw_name||''),rawName:fixMojibake(r.raw_name||''),score:Number.isFinite(Number(r.score))?Number(r.score):null,
  level:Number.isFinite(Number(r.level))?Number(r.level):null,type:r.type||null,note:fixMojibake(r.note||''),state:r.state||'',dzoneSeason:Number.isFinite(Number(r.dzone_season))?Number(r.dzone_season):null,
  avatar:r.avatar||null,frame:r.frame||null
}}
async function warm(){try{await fetch(`${ORIGIN}/leaderboard/abyss`,{headers:{'user-agent':UA,'accept':'text/html,*/*'},redirect:'follow',signal:AbortSignal.timeout(20000)})}catch{}}
async function fetchRange(start,end,retries=7){
  const url=`${ORIGIN}/api/rank?board=abyss&start=${start}&end=${end}`;let last;
  for(let i=0;i<retries;i++){
    try{
      const r=await fetch(url,{headers:{'user-agent':UA,'accept':'application/json','referer':`${ORIGIN}/leaderboard/abyss`},redirect:'follow',signal:AbortSignal.timeout(35000)}),text=await r.text();
      if(r.ok){const data=JSON.parse(text),rows=Array.isArray(data?.rows)?data.rows:[];return {url,status:r.status,rows:rows.map(normalizeRow),headers:Object.fromEntries([...r.headers].filter(([k])=>/cache|rate|retry|etag|age/i.test(k)))}}
      last=new Error(`${url}: HTTP ${r.status}`);if(r.status!==403&&r.status!==429&&r.status<500)break;
    }catch(e){last=e}
    await sleep(Math.min(20000,1000*Math.pow(2,i)));
  }
  throw last||new Error(`${url}: failed`);
}

await mkdir(INDEX_DIR,{recursive:true});
const manifest=await readJson(MANIFEST,{});const hintedSeason=Number(manifest.currentSeason)||null;
const oldPath=hintedSeason?path.join(INDEX_DIR,`${hintedSeason}.json`):null,old=oldPath?await readJson(oldPath,{rows:[]}):{rows:[]};
const byRank=new Map((old.rows||[]).filter(x=>Number.isFinite(Number(x.rank))).map(x=>[Number(x.rank),x])),failures=[];
await warm();
for(let start=1;start<=TARGET;start+=PAGE_SIZE){
  const end=Math.min(TARGET,start+PAGE_SIZE-1);
  try{const page=await fetchRange(start,end);for(const row of page.rows)if(Number.isFinite(row.rank))byRank.set(row.rank,row);console.log(`rank ${start}-${end}: ${page.rows.length}`)}
  catch(error){failures.push({start,end,error:String(error)});console.warn(`rank ${start}-${end} failed:`,String(error))}
  if(end<TARGET)await sleep(DELAY);
}
const rows=[...byRank.values()].filter(x=>x.rank>=1&&x.rank<=TARGET).sort((a,b)=>a.rank-b.rank),seasonId=hintedSeason||mode(rows.map(x=>x.dzoneSeason))||0;
const ranks=new Set(rows.map(x=>x.rank)),missing=[];for(let r=1;r<=TARGET;r++)if(!ranks.has(r))missing.push(r);
const coverage={target:TARGET,count:rows.length,maxRank:rows.at(-1)?.rank||0,missingCount:missing.length,missingRanges:[]};
for(const r of missing){const last=coverage.missingRanges.at(-1);if(last&&last[1]===r-1)last[1]=r;else coverage.missingRanges.push([r,r])}
const doc={source:{site:'Eremora',endpoint:`${ORIGIN}/api/rank?board=abyss&start={start}&end={end}`,syncedAt:new Date().toISOString(),pageSize:PAGE_SIZE},seasonId,target:TARGET,complete:missing.length===0&&rows.length===TARGET,coverage,failures,rows};
await saveJson(path.join(INDEX_DIR,`${seasonId}.json`),doc);
manifest.rankIndex={seasonId,path:`data/morimens/eremora/rank-index/${seasonId}.json`,target:TARGET,count:rows.length,complete:doc.complete,maxRank:coverage.maxRank,missingCount:missing.length,syncedAt:doc.source.syncedAt,endpoint:doc.source.endpoint};
manifest.notes=[...(manifest.notes||[]).filter(x=>!String(x).startsWith('榜单索引：')),
  `榜单索引：Eremora 客户端“Show more”实际调用 /api/rank?board=abyss&start={start}&end={end}，本站按 50 条一页同步至 Top ${TARGET}；仅缺失名次为 0 时标记完整。`
];
await saveJson(MANIFEST,manifest);
console.log(`Eremora rank index season ${seasonId}: ${rows.length}/${TARGET}, complete=${doc.complete}, missing=${missing.length}, failures=${failures.length}`);

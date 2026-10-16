// Build the slim data behind the "互助助战列表" tab: for every D-Zone season in data/morimens/eremora/manifest.json keep only the
// borrowed Assist members (+ player names and awakener-id mapping) instead of the whole usage dataset (several MB per season).
// Output: data/morimens/eremora/assist/<seasonKey>.json + index.json (each item remembers which manifest entry it was built from,
// so the page falls back to the full dataset whenever the season data changed after the last build).
// Run: node scripts/build_assist_index.mjs   (re-run after any D-Zone season import)
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';

const man=JSON.parse(await readFile('data/morimens/eremora/manifest.json','utf8'));
const readJson=async p=>JSON.parse(await readFile(p,'utf8'));
async function loadDataset(path){
  const index=await readJson(path);
  if(index.format!=='gzip-base64-chunked-v1')throw new Error(path+': unsupported format '+index.format);
  const parts=[];for(const c of index.chunks)parts.push(Buffer.from((await readFile(c,'utf8')).replace(/\s+/g,''),'base64'));
  const decoded=JSON.parse(gunzipSync(Buffer.concat(parts)).toString('utf8'));
  return {index,records:Array.isArray(decoded.records)?decoded.records:[]};
}
const cur=Number(man.currentSeason);
const match=(x,cur0)=>({recordCount:x.recordCount??null,dataUpdatedAt:x.dataUpdatedAt??null,revision:(cur0&&man.usageIndex?.revision)||x.revision||null});
await mkdir('data/morimens/eremora/assist',{recursive:true});
const items={};
for(const x of man.availableSeasons||[]){
  const id=Number(x.seasonId);if(!(id>=68&&(x.complete||x.snapshotId||id===cur||Number(x.recordCount)>=500)))continue;
  const key=String(x.snapshotId||x.seasonId),isCur=id===cur&&!x.snapshotId;
  const path=isCur&&man.usageIndex?.path?man.usageIndex.path:x.path;
  let ds;try{ds=await loadDataset(path)}catch(e){console.warn('skip',key,e.message);continue}
  const names={},tids={},records=[],pool=[],poolIdx=new Map();
  const KEEP=['id','ingameId','skeydbId','canonicalName','name','image','level','potencyLevel','enlightenCount','progression','enlightenMilestone','borrowed','assistUid','assist_uid','wheels','weapons','covenants','covenant','trinkets'];
  const slim=m=>{const o={};for(const k of KEEP)if(m[k]!==undefined)o[k]=m[k];const j=JSON.stringify(o);let i=poolIdx.get(j);if(i==null){i=pool.length;pool.push(o);poolIdx.set(j,i)}return i};
  for(const r of ds.records){
    const uid=String(r.uid??'').trim(),name=r.player||r.name||'';if(uid&&name)names[uid]=name;
    let any=false;
    const waves=(r.waves||[]).map(w=>({wave:w.wave,teams:(w.teams||[]).map(t=>{
      for(const m of t.members||[]){const tid=String(m?.id??'').trim(),can=String(m?.skeydbId??'').trim();if(/^\d+$/.test(tid)&&can&&!tids[tid])tids[tid]=can}
      const mi=(t.members||[]).filter(m=>m?.borrowed).map(slim);if(mi.length)any=true;
      return {battleUuid:t.battleUuid||t.battle_uuid||undefined,wid:t.wid,stageId:t.stageId,stageName:t.stageName,clearType:t.clearType,score:t.score,mi};
    })}));
    if(any)records.push({uid:r.uid,player:r.player||r.name||'',waves});
  }
  const out={key,seasonId:id,builtFrom:path,match:match(x,isCur),recordCount:records.length,names,tids,pool,records};
  const file=`data/morimens/eremora/assist/${key}.json`;await writeFile(file,JSON.stringify(out));
  items[key]={path:file,seasonId:id,match:out.match,providers:records.length};
  console.log(key,'records',ds.records.length,'->',records.length);
}
await writeFile('data/morimens/eremora/assist/index.json',JSON.stringify({generatedAt:new Date().toISOString(),items}));

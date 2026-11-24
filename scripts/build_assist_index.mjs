// Build the slim data behind the "互助助战列表" tab: for every D-Zone season in data/morimens/eremora/manifest.json keep only the
// borrowed Assist members (+ player names and awakener-id mapping) instead of the whole usage dataset (several MB per season).
// Output: data/morimens/eremora/assist/<seasonKey>.json + index.json (each item remembers which manifest entry it was built from,
// so the page falls back to the full dataset whenever the season data changed after the last build).
// Run: node scripts/build_assist_index.mjs   (re-run after any D-Zone season import)
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';

const man=JSON.parse(await readFile('data/morimens/eremora/manifest.json','utf8'));
const readJson=async p=>JSON.parse(await readFile(p,'utf8'));

// gzip-base64-chunked-v2 stores the same facts as a table-driven layout (entity tables + string pool +
// positional rows). Ported from decode_records() in scripts/pack_morimens_usage_v2.py (and expandV2 in
// morimens-dtide-loader.js) so the slim index can be built offline; keep the three in sync.
function expandV2(doc){
  const pool=doc.pool||[],f=doc.f||{};
  const S=i=>(i===undefined||i===null||i<0)?null:pool[i];
  const chars=doc.chars||[],wheels=doc.wheels||[],covs=doc.covs||[],creas=doc.creas||[],
        tokens=doc.tokens||[],stages=doc.stages||[],waveKeys=doc.waveKeys||[];
  const attrById=new Map((doc.attrs||[]).map(a=>[a[0],a]));
  const tc=doc.trinketConst||null,enl=doc.enl||null,pad=doc.urlPad||null;
  const unpackTrinkets=pieces=>{
    if(!tc||!Array.isArray(pieces))return pieces;
    return pieces.map(x=>({
      id:x[0],name:S(x[1]),image:tc.image,rarity:S(tc.rarity),slot:x[2],level:x[3],
      enhanceLevel:tc.enhance,breakLevel:tc.break,
      attrs:(x[5]||[]).map(a=>{const at=attrById.get(a[0]);
        return {id:a[0],name:at?S(at[1]):null,value:a[1],percentage:at?!!at[2]:false,rollQuality:a[2]}}),
      suitId:x[4],bound:tc.bound===1
    }));
  };
  const records=(doc.recs||[]).map(row=>{
    let slot=5;
    const uid=S(row[2]);
    const currentScore=f.cs?row[3]:row[slot++];
    const url=(f.url&&pad)?pad[0]+uid+pad[1]:S(row[slot++]);
    const transport=f.src?doc.src:S(row[slot++]);
    const waves=(row[4]||[]).map(w=>{
      const wk=waveKeys[w[0]]||[];
      return {
        wave:wk[0],madness:wk[1],stageGroupId:wk[2],stageTid:wk[3],
        teams:(w[1]||[]).map(t=>{
          const st=stages[t[0]]||[];
          const ti=t[4];
          const tk=(ti!==undefined&&ti!==null&&ti>=0)?(tokens[ti]||[]):null;
          return {
            stageName:S(st[0]),score:t[1],clearType:S(t[2]),
            token:tk?{id:tk[0],name:S(tk[1])}:null,
            creations:(t[5]||[]).map(c=>{const cr=creas[c]||[];return {id:cr[0],name:S(cr[1])}}),
            battleUuid:S(t[3]),
            members:(t[6]||[]).map(m=>{
              const ch=chars[m[0]]||[];
              let ms=10;
              const canonical=f.canon?S(ch[1]):S(m[ms++]);
              let tier,label;
              if(f.enl&&enl){tier=S(enl[0]);label=S(enl[1])}
              else{const e=m[ms++]||[];tier=S(e[0]);label=S(e[1])}
              const member={
                id:ch[0],name:S(ch[1]),canonicalName:canonical,ingameId:S(ch[2]),realm:S(ch[3]),role:S(ch[4]),
                level:m[1],potencyLevel:m[2],
                wheels:(m[7]||[]).map(x=>{const wh=wheels[x[0]]||[];return {id:wh[0],name:S(wh[1]),level:x[1]}}),
                covenants:(m[8]||[]).map(x=>{const cv=covs[x[0]]||[];return {id:cv[0],name:S(cv[1]),count:x[1]}}),
                borrowed:m[5]===1,assistUid:S(m[6]),breakLevel:m[3],levelLimitIncreaseIdx:m[4],
                enlightTier:tier,enlightTierLabel:label
              };
              if(m[9]!==undefined&&m[9]!==null)member.trinkets=unpackTrinkets(m[9]);
              return member;
            }),
            difficulty:S(st[1]),difficultyLabel:S(st[2])
          };
        })
      };
    });
    return {rank:row[0],player:S(row[1]),uid:uid,score:row[3],currentScore:currentScore,
            url:url,seasonId:doc.seasonId,waves:waves,sourceTransport:transport};
  });
  return {seasonId:doc.seasonId,records:records};
}

// skeydbId is not part of the v2 payload; resolve it from ingameId so the slim rows stay interchangeable with v1 ones.
let skeydbByIngame=null;
async function skeydbMap(){
  if(skeydbByIngame)return skeydbByIngame;
  skeydbByIngame=new Map();
  try{
    const aw=await readJson('data/morimens/skeydb/awakeners.json');
    for(const r of aw.records||[]){const k=String(r.ingameId||'').toUpperCase();if(k&&r.id)skeydbByIngame.set(k,r.id)}
  }catch(e){console.warn('skeydb catalog unavailable:',e.message)}
  return skeydbByIngame;
}

async function loadDataset(path){
  const index=await readJson(path);
  const ok=v=>v==='gzip-base64-chunked-v1'||v==='gzip-base64-chunked-v2';
  if(!ok(index.format))throw new Error(path+': unsupported format '+index.format);
  if(!Array.isArray(index.chunks)||!index.chunks.length)throw new Error(path+': index has no chunks');
  const parts=[];for(const c of index.chunks)parts.push(Buffer.from((await readFile(c,'utf8')).replace(/\s+/g,''),'base64'));
  let decoded=JSON.parse(gunzipSync(Buffer.concat(parts)).toString('utf8'));
  if(index.format==='gzip-base64-chunked-v2')decoded=expandV2(decoded);
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
  const byIngame=await skeydbMap();
  for(const r of ds.records){
    const uid=String(r.uid??'').trim(),name=r.player||r.name||'';if(uid&&name)names[uid]=name;
    let any=false;
    const waves=(r.waves||[]).map(w=>({wave:w.wave,teams:(w.teams||[]).map(t=>{
      for(const m of t.members||[]){
        if(!m?.skeydbId&&m?.ingameId)m.skeydbId=byIngame.get(String(m.ingameId).toUpperCase())||m.skeydbId;
        const tid=String(m?.id??'').trim(),can=String(m?.skeydbId??'').trim();if(/^\d+$/.test(tid)&&can&&!tids[tid])tids[tid]=can
      }
      const mi=(t.members||[]).filter(m=>m?.borrowed).map(slim);if(mi.length)any=true;
      return {battleUuid:t.battleUuid||t.battle_uuid||undefined,wid:t.wid,stageId:t.stageId,stageName:t.stageName,clearType:t.clearType,score:t.score,mi};
    })}));
    if(any)records.push({uid:r.uid,player:r.player||r.name||'',waves});
  }
  const out={key,seasonId:id,builtFrom:path,match:match(x,isCur),recordCount:records.length,names,tids,pool,records};
  const file=`data/morimens/eremora/assist/${key}.json`;await writeFile(file,JSON.stringify(out));
  items[key]={path:file,seasonId:id,match:out.match,providers:records.length};
  console.log(key,ds.index.format,'records',ds.records.length,'->',records.length,'pool',pool.length);
}
await writeFile('data/morimens/eremora/assist/index.json',JSON.stringify({items}));

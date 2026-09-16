import {mkdir, writeFile, stat} from 'node:fs/promises';
import path from 'node:path';

const OWNER='dansa', REPO='SKeyDB', REF='main';
const API='https://api.github.com';
const RAW='https://raw.githubusercontent.com';
const OUT_DATA='data/morimens/skeydb';
const OUT_ASSETS='assets/morimens';
const headers={'User-Agent':'qdby-chinese-skeydb-sync','Accept':'application/vnd.github+json'};
const EXPLICIT_ASSET_SLUGS={'24':'mason','jenkins':'jenkin'};

async function getJson(url){
  const r=await fetch(url,{headers});
  if(!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}
async function getBuffer(url){
  const r=await fetch(url,{headers:{'User-Agent':'qdby-chinese-skeydb-sync'}});
  if(!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
async function saveJson(file,data){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(data,null,2)+'\n');}
async function downloadDir(remoteDir,localDir){
  const items=await getJson(`${API}/repos/${OWNER}/${REPO}/contents/${remoteDir}?ref=${REF}`);
  await mkdir(localDir,{recursive:true});
  const keep=[];
  for(const item of items){
    if(item.type!=='file'||!item.download_url) continue;
    const target=path.join(localDir,item.name); keep.push(item.name);
    let same=false;
    try{const s=await stat(target);same=s.size===item.size}catch{}
    if(!same) await writeFile(target,await getBuffer(item.download_url));
  }
  return keep;
}

const commit=await getJson(`${API}/repos/${OWNER}/${REPO}/commits/${REF}`);
const catalog=await getJson(`${RAW}/${OWNER}/${REPO}/${REF}/src/data/public-v3/catalogs/awakeners.json`);
const skillCatalog=await getJson(`${RAW}/${OWNER}/${REPO}/${REF}/src/data/public-v3/catalogs/skills.json`);
const records=[];
for(const item of catalog.records){
  const rec=await getJson(`${RAW}/${OWNER}/${REPO}/${REF}/src/data/public-v3/records/awakeners/${item.id}.json`);
  records.push(rec);
}
const skillsByOwner=new Map();
for(const s of skillCatalog.records){
  if(!skillsByOwner.has(s.ownerAwakenerId)) skillsByOwner.set(s.ownerAwakenerId,[]);
  skillsByOwner.get(s.ownerAwakenerId).push(s);
}
for(const rec of records) rec.skillCatalog=skillsByOwner.get(rec.id)||[];

await mkdir(OUT_DATA,{recursive:true});
await mkdir(OUT_ASSETS,{recursive:true});
const portraitFiles=await downloadDir('src/assets/awk-portraits',`${OUT_ASSETS}/portraits`);
const cardFiles=await downloadDir('src/assets/awk-cards',`${OUT_ASSETS}/cards`);

const portraitSet=new Set(portraitFiles), cardSet=new Set(cardFiles);
function normalizeAssetSlug(value){
  const normalized=String(value||'').trim().toLowerCase();
  if(EXPLICIT_ASSET_SLUGS[normalized]) return EXPLICIT_ASSET_SLUGS[normalized];
  return normalized.replace(/['"]/g,'').replace(/[:\s]+/g,'-').replace(/[^a-z0-9-]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');
}
function assetSlugFromRecord(rec){
  return normalizeAssetSlug(rec?.route?.slug||rec?.name||'');
}
const compact=records.map(rec=>{
  const slug=rec?.route?.slug||normalizeAssetSlug(rec.name); const assetSlug=assetSlugFromRecord(rec); const file=`${assetSlug}.webp`;
  const voiceLines=[...(rec.profile?.voiceLines?.daily||[]),...(rec.profile?.voiceLines?.battle||[])];
  return {
    id:rec.id,numericId:rec.numericId,ingameId:rec.ingameId,name:rec.name,slug,assetSlug,
    realm:rec.realm,rarity:rec.rarity,type:rec.type,faction:rec.faction,releaseDate:rec.releaseDate,
    baseStatsLv1:rec.baseStatsLv1,substatsLv1:rec.substatsLv1,statScaling:rec.statScaling,substatScaling:rec.substatScaling,
    profile:{title:rec.profile?.title||rec.name,birthday:rec.profile?.birthday||'',voiceActor:rec.profile?.voiceActor||'',gender:rec.profile?.gender||rec.gender||'',voiceLines},
    skills:rec.skillCatalog||[],
    assets:{portrait:portraitSet.has(file)?`${OUT_ASSETS}/portraits/${file}`:null,card:cardSet.has(file)?`${OUT_ASSETS}/cards/${file}`:null}
  };
});
const payload={
  source:{repository:'dansa/SKeyDB',ref:REF,commit:commit.sha,syncedAt:new Date().toISOString(),license:'CC-BY-NC-SA-4.0 for SKeyDB-original data; game-owned art/text excluded'},
  count:compact.length,records:compact
};
await saveJson(`${OUT_DATA}/awakeners.json`,payload);
await saveJson(`${OUT_DATA}/manifest.json`,{source:payload.source,counts:{awakeners:compact.length,portraits:portraitFiles.length,cards:cardFiles.length},paths:{awakeners:`${OUT_DATA}/awakeners.json`,portraits:`${OUT_ASSETS}/portraits`,cards:`${OUT_ASSETS}/cards`}});
const missing=compact.filter(x=>!x.assets.portrait||!x.assets.card).map(x=>({name:x.name,assetSlug:x.assetSlug,portrait:!!x.assets.portrait,card:!!x.assets.card}));
if(missing.length) console.warn('Missing SKeyDB character art mappings:',JSON.stringify(missing));
console.log(`Synced ${compact.length} awakeners, ${portraitFiles.length} portraits, ${cardFiles.length} cards from SKeyDB ${commit.sha.slice(0,8)}.`);

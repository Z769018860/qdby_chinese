import {cp, mkdir, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';

const OWNER='dansa', REPO='SKeyDB', REF='main';
const API='https://api.github.com';
const RAW='https://raw.githubusercontent.com';
const SOURCE_ROOT=process.env.SKEYDB_SOURCE||'.skeydb';
const OUT_DATA='data/morimens/skeydb';
const OUT_ASSETS='assets/morimens';
const headers={'User-Agent':'qdby-chinese-skeydb-sync','Accept':'application/vnd.github+json'};
const EXPLICIT_ASSET_SLUGS={'24':'mason','jenkins':'jenkin'};

async function exists(file){try{await stat(file);return true}catch{return false}}
async function getJson(url){const r=await fetch(url,{headers});if(!r.ok)throw new Error(`${url}: HTTP ${r.status}`);return r.json()}
async function saveJson(file,data){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(data,null,2)+'\n')}
async function readJson(file){return JSON.parse(await readFile(file,'utf8'))}
async function replaceDir(src,dst){await rm(dst,{recursive:true,force:true});await mkdir(path.dirname(dst),{recursive:true});await cp(src,dst,{recursive:true})}

function normalizeAssetSlug(value){
  const normalized=String(value||'').trim().toLowerCase();
  if(EXPLICIT_ASSET_SLUGS[normalized]) return EXPLICIT_ASSET_SLUGS[normalized];
  return normalized.replace(/['"]/g,'').replace(/[:\s]+/g,'-').replace(/[^a-z0-9-]/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');
}

const localPublic=path.join(SOURCE_ROOT,'src/data/public-v3');
const hasLocal=await exists(localPublic);
let commitSha='';
let catalog, skillCatalog, records=[];

if(hasLocal){
  try{commitSha=execFileSync('git',['-C',SOURCE_ROOT,'rev-parse','HEAD'],{encoding:'utf8'}).trim()}catch{}
  await replaceDir(localPublic,path.join(OUT_DATA,'public-v3'));
  catalog=await readJson(path.join(localPublic,'catalogs/awakeners.json'));
  skillCatalog=await readJson(path.join(localPublic,'catalogs/skills.json'));
  for(const item of catalog.records){records.push(await readJson(path.join(localPublic,`records/awakeners/${item.id}.json`)))}
  const assetDirs=['awk-portraits','awk-cards','wheels','relics','covenants'];
  for(const dir of assetDirs){
    const src=path.join(SOURCE_ROOT,'src/assets',dir);
    if(await exists(src)) await replaceDir(src,path.join(OUT_ASSETS,dir==='awk-portraits'?'portraits':dir==='awk-cards'?'cards':dir));
  }
}else{
  const commit=await getJson(`${API}/repos/${OWNER}/${REPO}/commits/${REF}`);commitSha=commit.sha;
  catalog=await getJson(`${RAW}/${OWNER}/${REPO}/${REF}/src/data/public-v3/catalogs/awakeners.json`);
  skillCatalog=await getJson(`${RAW}/${OWNER}/${REPO}/${REF}/src/data/public-v3/catalogs/skills.json`);
  for(const item of catalog.records){records.push(await getJson(`${RAW}/${OWNER}/${REPO}/${REF}/src/data/public-v3/records/awakeners/${item.id}.json`))}
  console.warn('Local sparse SKeyDB checkout was not found; generated compact data only.');
}

const skillsByOwner=new Map();
for(const s of skillCatalog.records){if(!skillsByOwner.has(s.ownerAwakenerId))skillsByOwner.set(s.ownerAwakenerId,[]);skillsByOwner.get(s.ownerAwakenerId).push(s)}

function assetSlugFromRecord(rec){return normalizeAssetSlug(rec?.route?.slug||rec?.name||'')}
async function assetExists(kind,file){return exists(path.join(OUT_ASSETS,kind,file))}
const compact=[];
for(const rec of records){
  const slug=rec?.route?.slug||normalizeAssetSlug(rec.name);const assetSlug=assetSlugFromRecord(rec);const file=`${assetSlug}.webp`;
  const voiceLines=[...(rec.profile?.voiceLines?.daily||[]),...(rec.profile?.voiceLines?.battle||[])];
  compact.push({
    id:rec.id,numericId:rec.numericId,ingameId:rec.ingameId,name:rec.name,slug,assetSlug,aliases:rec.aliases||[],
    realm:rec.realm,rarity:rec.rarity,type:rec.type,faction:rec.faction,releaseDate:rec.releaseDate,
    baseStatsLv1:rec.baseStatsLv1,substatsLv1:rec.substatsLv1,statScaling:rec.statScaling,substatScaling:rec.substatScaling,
    profile:{title:rec.profile?.title||rec.name,birthday:rec.profile?.birthday||'',voiceActor:rec.profile?.voiceActor||'',gender:rec.profile?.gender||rec.gender||'',height:rec.profile?.height||'',weight:rec.profile?.weight||'',gnosticIndex:rec.profile?.gnosticIndex||'',voiceLines},
    skills:skillsByOwner.get(rec.id)||[],
    assets:{portrait:await assetExists('portraits',file)?`${OUT_ASSETS}/portraits/${file}`:null,card:await assetExists('cards',file)?`${OUT_ASSETS}/cards/${file}`:null}
  });
}

const source={repository:'dansa/SKeyDB',ref:REF,commit:commitSha,syncedAt:new Date().toISOString(),license:'CC-BY-NC-SA-4.0 for SKeyDB-original data; game-owned art/text excluded'};
await saveJson(`${OUT_DATA}/awakeners.json`,{source,count:compact.length,records:compact});
let publicManifest=null;
if(hasLocal) publicManifest=await readJson(path.join(localPublic,'manifest.json'));
const counts={awakeners:compact.length,portraits:0,cards:0,publicV3Records:publicManifest?.build?.recordCount||null};
for(const [key,dir] of [['portraits','portraits'],['cards','cards']]){
  try{const {readdir}=await import('node:fs/promises');counts[key]=(await readdir(path.join(OUT_ASSETS,dir))).filter(x=>x.endsWith('.webp')).length}catch{}
}
await saveJson(`${OUT_DATA}/manifest.json`,{
  source,counts,
  scopes:publicManifest?.scopes||null,
  paths:{compactAwakeners:`${OUT_DATA}/awakeners.json`,publicV3:hasLocal?`${OUT_DATA}/public-v3`:null,portraits:`${OUT_ASSETS}/portraits`,cards:`${OUT_ASSETS}/cards`,wheels:`${OUT_ASSETS}/wheels`,relics:`${OUT_ASSETS}/relics`,covenants:`${OUT_ASSETS}/covenants`}
});
const missing=compact.filter(x=>!x.assets.portrait||!x.assets.card).map(x=>({name:x.name,assetSlug:x.assetSlug,portrait:!!x.assets.portrait,card:!!x.assets.card}));
if(missing.length)console.warn('Missing SKeyDB character art mappings:',JSON.stringify(missing));
console.log(`Synced ${compact.length} awakeners; full public-v3=${hasLocal?'yes':'no'}; SKeyDB ${commitSha.slice(0,8)}.`);

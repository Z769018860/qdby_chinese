// Sync D-Zone (融灾) map / monster data from the SKeyDB upstream (dansa/SKeyDB, src/data/dzone).
// SKEYDB_SOURCE points at a local checkout; otherwise the files are fetched from raw.githubusercontent.com.
import {cp, mkdir, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';

const OWNER='dansa', REPO='SKeyDB', REF='main';
const RAW=`https://raw.githubusercontent.com/${OWNER}/${REPO}/${REF}`;
const SOURCE_ROOT=process.env.SKEYDB_SOURCE||'.skeydb';
const OUT='data/morimens/skeydb/dzone';
const OUT_IMG='assets/morimens/monster-preview';
const PUBLIC_V3='data/morimens/skeydb/public-v3';
const exists=async f=>{try{await stat(f);return true}catch{return false}};
const local=await exists(path.join(SOURCE_ROOT,'src/data/dzone'));
async function readJson(rel){
  if(local) return JSON.parse(await readFile(path.join(SOURCE_ROOT,rel),'utf8'));
  const r=await fetch(`${RAW}/${rel}`,{headers:{'User-Agent':'qdby-chinese-dzone-sync'}});
  if(!r.ok) throw new Error(`${rel}: HTTP ${r.status}`);
  return r.json();
}
const save=async(file,data)=>{await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(data)+'\n')};

const dzones=await readJson('src/data/dzone/dzones.json');
const monstersDoc=await readJson('src/data/dzone/monsters.json');
const chars=await readJson('src/data/dzone/enemy-characteristics.json');
const monsters={};
for(const m of monstersDoc.records) monsters[m.id]={n:m.name,d:m.descriptionTemplate,a:m.assetName,b:m.badges||[],c:m.characteristicIds||[]};
const characteristics={};
for(const c of chars.records) characteristics[c.id]={n:c.name,d:c.descriptionTemplate};

const relicsCatalog=JSON.parse(await readFile(path.join(PUBLIC_V3,'catalogs/relics.json'),'utf8'));
const assetIndex=JSON.parse(await readFile(path.join(PUBLIC_V3,'indexes/assets.json'),'utf8'));
const assets=assetIndex.assets||assetIndex;
const relics={};
for(const r of relicsCatalog.records){
  const asset=assets[r.assets?.icon];
  const base=asset?.assetId||null;
  relics[r.id]={n:r.name,i:base,r:r.rarity||''};
}

await rm(path.join(OUT,'seasons'),{recursive:true,force:true});
const seasons=[];const appears={};
for(const s of dzones.records){
  const doc=await readJson(`src/data/dzone/${s.seasonPath}`);
  const rec=doc.records[0];
  const file=`seasons/${String(s.period)}.json`;
  await save(path.join(OUT,file),rec);
  for(const w of rec.waves||[])for(const id of w.monsterIds||[]){const l=appears[id]||(appears[id]=[]);if(!l.includes(s.period))l.push(s.period)}
  seasons.push({period:s.period,name:s.name,start:s.start,end:s.end,stageEffect:s.stageEffect,realm:s.realm,path:file,waves:rec.waves?.length||0});
}
let commit='';
if(local){try{commit=execFileSync('git',['-C',SOURCE_ROOT,'rev-parse','HEAD'],{encoding:'utf8'}).trim()}catch{}}
await save(path.join(OUT,'index.json'),{
  schemaVersion:1,
  source:{repository:`${OWNER}/${REPO}`,ref:REF,commit,syncedAt:new Date().toISOString(),license:'CC-BY-NC-SA-4.0 for SKeyDB-original data; game-owned art/text excluded'},
  seasons,monsters,characteristics,relics,appears
});

if(local){
  const src=path.join(SOURCE_ROOT,'src/assets/monster-preview');
  if(await exists(src)){
    await rm(OUT_IMG,{recursive:true,force:true});await mkdir(OUT_IMG,{recursive:true});
    for(const f of await readdir(src)) if(f.endsWith('.webp')) await cp(path.join(src,f),path.join(OUT_IMG,f));
  }
}
console.log(`D-Zone sync: ${seasons.length} seasons, ${Object.keys(monsters).length} monsters, ${Object.keys(relics).length} relics${commit?' @'+commit.slice(0,7):''}`);

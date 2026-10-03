// Build data/morimens/game/tier-pool.json: the image pool of the custom tier list
// (awakeners, wheels, creations, key tokens, covenants, avatars, monsters) with zh / en names and local image paths.
import {readFile, readdir, stat, writeFile, mkdir} from 'node:fs/promises';
import path from 'node:path';

const D='data/morimens';
const exists=async f=>{try{await stat(f);return true}catch{return false}};
const readJson=async f=>JSON.parse(await readFile(f,'utf8'));
const readJsonOr=async(f,d)=>{try{return await readJson(f)}catch{return d}};
const strip=s=>{s=String(s||'').trim();return /^".*"$/.test(s)?s.slice(1,-1):s};

const assetsIdx=await readJson(`${D}/skeydb/public-v3/indexes/assets.json`);
const assets=assetsIdx.assets||assetsIdx;
// "src/assets/relics/X.webp" -> "assets/morimens/relics/X.webp"
async function imageOf(assetId){
  const a=assets[assetId];if(!a)return '';
  for(const c of [a.availability?.path,...(a.availability?.candidates||[])]){
    if(!c)continue;
    const local=c.replace(/^src\/assets\//,'assets/morimens/').replace(/\.png$/,'.webp');
    if(await exists(local))return local;
  }
  return '';
}
async function fromCatalog(file,{zh={},tags}={}){
  const out=[];
  for(const r of (await readJson(`${D}/skeydb/public-v3/catalogs/${file}`)).records){
    const img=await imageOf(r.assets?.icon);
    if(!img)continue;
    out.push({id:r.id,en:strip(r.name),zh:zh[r.id]||zh[strip(r.name)]||'',img,...(tags?{t:tags(r)}:{})});
  }
  return out;
}

const huijiAw=(await readJsonOr(`${D}/huiji/zh-CN.json`,{})).bySkeydbId||{};
const huijiWh=(await readJsonOr(`${D}/huiji/wheels.zh-CN.json`,{})).bySkeydbId||{};
const trans=await readJsonOr(`${D}/game/dzone-translations.json`,{});
const gloc=(await readJsonOr(`${D}/game/dzone-localization.json`,{})).monsters||{};

// covenant names live in the leaderboard script
let covenantZh={};
try{
  const src=await readFile('morimens-dtide-usage.js','utf8');
  const m=/const covenantZh=(\{[\s\S]*?\});/.exec(src);
  if(m)covenantZh=new Function(`return ${m[1]}`)();
}catch{}

const kinds={};
// awakeners
const aw=[];
for(const r of (await readJson(`${D}/skeydb/awakeners.json`)).records){
  const img=`assets/morimens/portraits/${r.assetSlug}.webp`;
  if(!await exists(img))continue;
  aw.push({id:r.id,en:strip(r.name),zh:strip(huijiAw[r.id]?.name).replace(/^「|」$/g,''),img,t:[`type:${r.type}`,`realm:${r.realm}`]});
}
kinds.awakener=aw;
kinds.wheel=await fromCatalog('wheels.json',{zh:Object.fromEntries(Object.entries(huijiWh).map(([k,v])=>[k,v.name])),tags:r=>[`stat:${r.mainstatKey}`,`realm:${r.realm}`]});
// relics that are offered as initial creations in some D-Zone season
const dzRelics=new Set();
for(const f of await readdir(`${D}/skeydb/dzone/seasons`))for(const w of (await readJson(`${D}/skeydb/dzone/seasons/${f}`)).waves||[])for(const id of w.initialRelicIds||[])dzRelics.add(id);
kinds.relic=await fromCatalog('relics.json',{zh:trans.relics||{},tags:r=>{
  const t=(r.categories||[]).map(c=>`src:${c}`);
  if(r.relicType==='Pendulum')t.push('src:PENDULUM');
  if(dzRelics.has(r.id))t.push('src:DZONE');
  return [...new Set(t)];
}});
kinds.posse=await fromCatalog('posses.json',{tags:r=>[`realm:${r.realm}`]});
kinds.covenant=await fromCatalog('covenants.json',{zh:covenantZh});

// avatars
const avatars=[];
for(const f of (await readdir('assets/waline-avatars')).sort()){
  let m;
  if(m=/^160px-PlayerAvatar_(.+)\.png$/.exec(f))avatars.push({id:m[1],en:m[1].replace(/_/g,' '),zh:'',img:`assets/waline-avatars/${f}`});
  else if(m=/^160px-剧情角色-(.+?)头像\.png$/.exec(f))avatars.push({id:`story-${m[1]}`,en:m[1],zh:m[1],img:`assets/waline-avatars/${f}`});
  else if(m=/^PlayerAvatar_(.+)\.png$/.exec(f))avatars.push({id:'raw-'+m[1],en:m[1].replace(/_/g,' '),zh:'',img:`assets/waline-avatars/${f}`});
}
kinds.avatar=avatars;

// monsters (deduplicated by art + name)
const idx=await readJson(`${D}/skeydb/dzone/index.json`);
const seen=new Set(),mons=[];
for(const [id,m] of Object.entries(idx.monsters)){
  const img=`assets/morimens/monster-preview/${m.a}.webp`;
  if(!m.a||!await exists(img))continue;
  const key=`${m.a}|${strip(m.n).toLowerCase()}`;
  if(seen.has(key))continue;seen.add(key);
  mons.push({id,en:strip(m.n),zh:strip(trans.skMonsters?.[id]?.zh||gloc[id]?.zh).replace(/^「|」$/g,''),img,t:[...((m.b||[]).length?m.b:['Normal']).map(b=>`rank:${b}`),...(m.c||[]).map(c=>`trait:${idx.characteristics?.[c]?.n}`)]});
}
kinds.monster=mons;

// names still missing a Chinese name: take them from the glossary (scripts/build_glossary.py: game table / composed names)
const gl=await readJsonOr(`${D}/game/glossary.json`,{entries:[]});
const glMap=new Map(gl.entries.filter(e=>e.zh).map(e=>[`${e.k}|${e.en.toLowerCase().replace(/[^a-z0-9]/g,'')}`,e.zh]));
for(const [kind,list] of Object.entries(kinds))for(const it of list)if(!it.zh){const z=glMap.get(`${kind}|${it.en.toLowerCase().replace(/[^a-z0-9]/g,'')}`);if(z)it.zh=z}
await mkdir(`${D}/game`,{recursive:true});
await writeFile(`${D}/game/tier-pool.json`,JSON.stringify({version:1,generatedAt:new Date().toISOString(),kinds})+'\n');
console.log(Object.entries(kinds).map(([k,v])=>`${k}:${v.length}`).join(' '));

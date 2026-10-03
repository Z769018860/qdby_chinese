// Build per-season D-Zone map layouts (hex node grid + battle -> monster members) from Morimenz-kr/Morimens.Info.kr
// community data (CC BY-NC-SA 4.0): data/morimens/dzone-info/map-<period>.json, plus the node icons in assets/morimens/dzone-map/.
// MORIMENZ_SOURCE points at a local checkout; otherwise files are fetched from raw.githubusercontent.com.
import {cp, mkdir, readFile, readdir, stat, writeFile} from 'node:fs/promises';
import path from 'node:path';

const RAW='https://raw.githubusercontent.com/Morimenz-kr/Morimens.Info.kr/main';
const SOURCE_ROOT=process.env.MORIMENZ_SOURCE||'.morimenz';
const OUT='data/morimens/dzone-info';
const FILES={68:['dzone_season68.json','dzone_maps_season68.json'],69:['dzone_season69.json','dzone_maps_season69.json'],70:['dzone_current.json','dzone_maps.json']};
const exists=async f=>{try{await stat(f);return true}catch{return false}};
const local=await exists(path.join(SOURCE_ROOT,'data'));
async function readSource(rel){
  if(local) return JSON.parse(await readFile(path.join(SOURCE_ROOT,rel),'utf8'));
  const r=await fetch(`${RAW}/${rel}`,{headers:{'User-Agent':'qdby-chinese-dzone-map'}});
  if(!r.ok) throw new Error(`${rel}: HTTP ${r.status}`);
  return r.json();
}
await mkdir(OUT,{recursive:true});
for(const [period,[seasonFile,mapFile]] of Object.entries(FILES)){
  let season,maps;
  try{[season,maps]=await Promise.all([readSource(`data/${seasonFile}`),readSource(`data/${mapFile}`)])}catch(e){console.warn('skip',period,e.message);continue}
  const waves=maps.waves.map(w=>{
    const sw=season.waves.find(x=>x.wave===w.wave)||{};
    const enc={};
    for(const e of sw.encounters||[]) enc[e.battleId]={t:e.battleType,m:(e.members||[]).map(m=>({tid:m.tid,p:m.position}))};
    return {wave:w.wave,nodes:w.nodes.map(n=>({r:n.row,c:n.column,k:n.kind,...(n.icon?{i:n.icon}:{}),...(n.texture?{t:n.texture}:{}),...(n.battleId?{b:n.battleId}:{})})),enc};
  });
  await writeFile(path.join(OUT,`map-${period}.json`),JSON.stringify({period:Number(period),waves})+'\n');
  console.log('map',period,waves.map(w=>w.nodes.length).join('/'));
}
// node / tile icons
const dest='assets/morimens/dzone-map';
await mkdir(dest,{recursive:true});
if(local){for(const f of await readdir(path.join(SOURCE_ROOT,'images/dzone/map'))) await cp(path.join(SOURCE_ROOT,'images/dzone/map',f),path.join(dest,f))}
else{
  for(const f of ['ash-ruins','black-seal','bones','boss','combat','elite','event','illusion','lamp','locked-door','passage-in','passage-out','passage','rusted-key','tunnel'].map(n=>`node-${n}.webp`).concat(['tile-poison-floor.webp','tile-stone.webp','tile-unstable-floor.webp'])){
    const r=await fetch(`${RAW}/images/dzone/map/${f}`);if(r.ok) await writeFile(path.join(dest,f),Buffer.from(await r.arrayBuffer()));
  }
}

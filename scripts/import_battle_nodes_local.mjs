// Merge battle nodes read from the local game client (Config.MapNode.Effect[1] -> Config.BattleConfig, e.g.
// data/morimens/game/battle-nodes-local-71.json) into the season map (data/morimens/dzone-info/map-<season>.json):
//   * every battle node gets its battleConfigId as `b` (checked against the map) and enc[battleId] = {t:battleType, m:[{tid,p}]}
//   * data/morimens/dzone-info/<season>.json gets the monster records the map needs (name / art / intents): records of earlier seasons are
//     reused; new monsters take their Chinese name from the dump and their art from SKeyDB (matched by Chinese name).
// Run scripts/convert_map_local.mjs first. Usage: node scripts/import_battle_nodes_local.mjs [input=data/morimens/game/battle-nodes-local-71.json]
import {readFile, writeFile} from 'node:fs/promises';
const inFile=process.argv[2]||'data/morimens/game/battle-nodes-local-71.json';
const src=JSON.parse(await readFile(inFile,'utf8'));
const season=src.season, mapFile=`data/morimens/dzone-info/map-${season}.json`, infoFile=`data/morimens/dzone-info/${season}.json`;
const rj=async f=>JSON.parse(await readFile(f,'utf8'));
const map=await rj(mapFile);
// ---- monster records of earlier seasons (name / art / skills / patterns) ----
const prior=new Map();
for(const p of [season-1,season-2,season-3,season-4,70,69,68,67]){
  let d;try{d=await rj(`data/morimens/dzone-info/${p}.json`)}catch{continue}
  for(const [tid,m] of Object.entries(d.monsters||{}))if(!prior.has(String(tid)))prior.set(String(tid),m);
}
// ---- SKeyDB art by Chinese name ----
const tr=(await rj('data/morimens/game/dzone-translations.json')).skMonsters||{};
const sk=(await rj('data/morimens/skeydb/dzone/index.json')).monsters||{};
const strip=s=>String(s||'').replace(/[「」]/g,'').trim();
const artByZh=new Map();
for(const [sid,v] of Object.entries(tr)){const z=strip(v.zh);if(z&&sk[sid]?.a&&!artByZh.has(z))artByZh.set(z,{art:sk[sid].a,sid})}
// nameless monsters are identified by elimination against the season's SKeyDB wave list (documented below)
const NAMELESS={14054:'dzone-monster-0266',14063:'dzone-monster-0110'};  // zone 4: wave monsters 0110 / 0119 / 0266; 0119 = 维度猎手 (14084) -> the other elite + the boss
const skSeason=await rj(`data/morimens/skeydb/dzone/seasons/${season}.json`).catch(()=>null);
const infoMons={};
let merged=0,noWave=0;
for(const b of src.battleNodes){
  const wave=map.waves.find(w=>w.wave===b.zone);
  const node=wave?.nodes.find(n=>n.r===9-b.y&&n.c===b.x);
  if(!node){console.warn('no node for',b.zone,b.x,b.y);noWave++;continue}
  if(node.b&&node.b!==b.battleConfigId)console.warn('battle id mismatch',b.zone,b.x,b.y,node.b,b.battleConfigId);
  node.b=b.battleConfigId;
  wave.enc[b.battleConfigId]={t:b.battleType,m:b.monsters.map(m=>({tid:m.id,p:m.position}))};
  for(const m of b.monsters){
    const key=String(m.id);if(infoMons[key])continue;
    const old=prior.get(key);
    if(old){infoMons[key]=old;continue}
    let zh=m.name||'',art=null;
    if(NAMELESS[m.id]){const sid=NAMELESS[m.id];zh=strip(tr[sid]?.zh)||zh;art=sk[sid]?.a||null}
    else{const hit=artByZh.get(strip(zh));if(hit)art=hit.art}
    infoMons[key]={zh,img:art||undefined,cls:b.battleType==='Boss'?'Boss':b.battleType==='Elite'?'Elite':'Common',fromLocalTable:true};
  }
  merged++;
}
await writeFile(mapFile,JSON.stringify(map)+'\n');
await writeFile(infoFile,JSON.stringify({period:season,generatedAt:new Date().toISOString(),source:'local game client (Config.BattleConfig); intents reused from the latest earlier season',monsters:infoMons,waves:[]})+'\n');
console.log('battles merged',merged,'unmatched',noWave,'monsters',Object.keys(infoMons).length,'without art',Object.values(infoMons).filter(m=>!m.img).length);

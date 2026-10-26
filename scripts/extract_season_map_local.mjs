// Extract the five zone maps + battle nodes of one D-Zone period from the local client config dump (see data/morimens/maps, scripts/build_map_overview.py)
// into data/morimens/game/map-local-<p>.json and battle-nodes-local-<p>.json (the inputs of convert_map_local.mjs / import_battle_nodes_local.mjs).
// Usage: node scripts/extract_season_map_local.mjs <dump dir> <period> [outDir=data/morimens/game]
import {readFile, writeFile} from 'node:fs/promises';
const [dir,period,out='data/morimens/game']=process.argv.slice(2);
if(!dir||!period){console.error('usage: node scripts/extract_season_map_local.mjs <dump dir> <period> [outDir]');process.exit(1)}
const P=Number(period),rj=async f=>JSON.parse(await readFile(`${dir}/${f}.json`,'utf8'));
const [stages,maps,nodes,battles]=await Promise.all(['stages','maps','nodes','battles'].map(rj));
const nodeById=new Map(nodes.map(n=>[n.id,n])),mapById=new Map(maps.map(m=>[m.id,m])),battleById=new Map(battles.map(b=>[b.id,b]));
const VOID=11666,zones=[],battleNodes=[];
for(let z=1;z<=5;z++){
  // the top threat level (G) carries the zone map; every level of a zone shares it
  const cands=stages.filter(s=>new RegExp(`^关卡@融蚀深渊${P}期[A-G]${z}$`).test(s.config?.CnID||''));
  if(!cands.length)throw new Error(`period ${P} zone ${z}: no stage`);
  const st=cands.sort((a,b)=>b.config.CnID.localeCompare(a.config.CnID))[0];
  const map=mapById.get(st.mapIds[0]);
  const zn=[];
  for(const c of map.cells){
    const id=c.variants[0].nodeId;if(id===VOID)continue;
    const n=nodeById.get(id);
    zn.push({x:c.x,y:c.y,nodeId:id,name:n.name,effect:n.config?.Effect||{}});
    const bc=n.battleConfigId;
    if(bc&&['战斗','精英','最终战'].includes(n.name)){
      const b=battleById.get(bc);
      battleNodes.push({zone:z,x:c.x,y:c.y,nodeId:id,battleConfigId:bc,battleType:b?.type,monsters:(b?.monsters||[]).map(m=>({id:m.monsterId,position:m.position,name:m.name}))});
    }
  }
  zones.push({zone:z,stageId:st.id,mapId:map.id,nodes:zn});
}
const source='Morimens Steam local client config dump (Config.Stage/Map/MapNode/BattleConfig)';
await writeFile(`${out}/map-local-${P}.json`,JSON.stringify({season:P,source,zones})+'\n');
await writeFile(`${out}/battle-nodes-local-${P}.json`,JSON.stringify({season:P,source,battleNodes})+'\n');
console.log('period',P,zones.map(z=>z.nodes.length).join('/'),'battle nodes',battleNodes.length);

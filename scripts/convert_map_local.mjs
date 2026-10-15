// Convert a map dump read from the local game client (Config.Map / MapNode / MapNodeType; e.g. data/morimens/game/map-local-71.json)
// into the site's map format (data/morimens/dzone-info/map-<season>.json: {period,waves:[{wave,nodes:[{r,c,k,i,t,b}],enc}]}).
// Coordinates: the client uses x=1..13, y=1..8 with y=8 at the top; the site uses r (row, 1 at the top) and c (column): r=9-y, c=x
// (verified against the identical season 68-70 zone 4 map). Battle -> monster lines (enc) are not part of the dump; they are
// added by sync_morimens_dzone_map.mjs once Morimens.Info.kr publishes the season.
// Usage: node scripts/convert_map_local.mjs [input=data/morimens/game/map-local-71.json] [output=data/morimens/dzone-info/map-<season>.json]
import {readFile, writeFile} from 'node:fs/promises';
const inFile=process.argv[2]||'data/morimens/game/map-local-71.json';
const src=JSON.parse(await readFile(inFile,'utf8'));
const KIND={ // node name -> site kind / icon / texture
  '战斗':{k:'combat',i:'combat'},'精英':{k:'combat',i:'elite'},'最终战':{k:'combat',i:'boss'},
  '事件':{k:'event',i:'event'},'灰烬遗迹':{k:'reward',i:'ash-ruins'},'褪色遗骨':{k:'reward',i:'bones'},'黑印':{k:'reward',i:'black-seal'},
  '锈蚀钥匙':{k:'mechanism',i:'rusted-key'},'锈蚀门扉':{k:'obstacle',i:'locked-door'},'幻象':{k:'obstacle',i:'illusion'},
  '隧道':{k:'passage',i:'tunnel'},'单行密道':{k:'passage',i:'passage-in'},'密道出口':{k:'passage',i:'passage-out'},
  '探照灯':{k:'utility',i:'lamp'},'不牢固的地板':{k:'terrain',t:'unstable-floor'},'毒地板':{k:'terrain',t:'poison-floor'},
  '开始':{k:'start'}
};
const waves=[];
for(const z of src.zones){
  const single=z.nodes.every(n=>n.name==='开始'||n.name==='锈蚀门扉')&&z.nodes.some(n=>n.name==='开始')&&!z.bossNodes?.length;  // boss-only arena: the "start" tile is the boss
  const nodes=[];
  for(const n of z.nodes){
    let d=KIND[n.name];if(!d){console.warn('unknown node type',n.name,z.zone);continue}
    d={...d};
    if(single&&n.name==='开始')d={k:'combat',i:'boss'};
    const out={r:9-n.y,c:n.x,k:d.k,...(d.i?{i:d.i}:{}),...(d.t?{t:d.t}:{})};
    if(d.k==='combat'&&n.effect?.['1'])out.b=n.effect['1'];
    nodes.push(out);
  }
  nodes.sort((a,b)=>a.r-b.r||a.c-b.c);
  waves.push({wave:z.zone,nodes,enc:{}});
}
const outFile=process.argv[3]||`data/morimens/dzone-info/map-${src.season}.json`;
await writeFile(outFile,JSON.stringify({period:src.season,source:'local game client tables (Config.Map/MapNode)',waves})+'\n');
console.log('map',src.season,waves.map(w=>w.nodes.length).join('/'),'->',outFile);

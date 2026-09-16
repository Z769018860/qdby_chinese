import {mkdir,writeFile} from 'node:fs/promises';
import {decodeSvelteData,fetchViaJina,parseSvelteTransport,unflatten,walk,num,fixMojibake} from './eremora_sveltekit.mjs';

const OUT='data/morimens/eremora/leaderboard-probe.json';
const UA='qdby-chinese-eremora-leaderboard-probe/1.1 (+https://github.com/Z769018860/qdby_chinese)';
const targets=[
  'https://eremora.com/leaderboard/abyss/__data.json',
  'https://eremora.com/leaderboard/abyss/__data.json?page=2',
  'https://eremora.com/leaderboard/abyss/__data.json?limit=1000',
  'https://eremora.com/leaderboard/abyss/__data.json?offset=50&limit=50'
];

function playerish(v){
  if(!v||typeof v!=='object'||Array.isArray(v))return false;
  const keys=Object.keys(v);
  return keys.some(k=>/uid|player/i.test(k))&&keys.some(k=>/rank|score/i.test(k));
}
function compact(v){
  if(!v||typeof v!=='object')return v;
  const out={};
  for(const k of ['rank','position','uid','user_id','player','name','score','season','period','page','limit','offset','total','count','has_more','next'])if(k in v)out[k]=typeof v[k]==='string'?fixMojibake(v[k]):v[k];
  return out;
}
function scanRoots(roots=[]){
  const arrays=[],objects=[],scalars=[];
  for(const root of roots)walk(root,(v,path)=>{
    if(Array.isArray(v)){
      const sample=v.filter(playerish).slice(0,5).map(compact);
      if(sample.length||v.length>=20)arrays.push({path,length:v.length,sample});
    }else if(playerish(v))objects.push({path,value:compact(v)});
    else for(const [k,val] of Object.entries(v))if(/^(page|limit|offset|total|count|season|period|has_more|next)$/i.test(k)&&(typeof val==='string'||typeof val==='number'||typeof val==='boolean'||val==null))scalars.push({path:`${path}.${k}`,value:val});
  });
  const ranks=[];for(const x of objects){const r=num(x.value.rank??x.value.position);if(r!=null)ranks.push(r)}
  return {rootCount:roots.length,arrays:arrays.sort((a,b)=>b.length-a.length).slice(0,100),objectCount:objects.length,objectSamples:objects.slice(0,120),rankRange:ranks.length?{min:Math.min(...ranks),max:Math.max(...ranks),distinct:new Set(ranks).size}:null,scalars:scalars.slice(0,180)};
}
function decodeAll(text){
  const decoded=decodeSvelteData(text),transport=parseSvelteTransport(text),nodeRoots=[];
  for(const doc of transport.docs||[])for(const node of doc?.nodes||[])if(Array.isArray(node?.data)){try{nodeRoots.push(unflatten(node.data))}catch{}}
  return {decoded,transport,nodeRoots};
}
async function direct(target){
  try{const r=await fetch(target,{headers:{'user-agent':UA,'accept':'application/json,text/plain,*/*'},redirect:'follow',signal:AbortSignal.timeout(30000)});const text=await r.text();return {status:r.status,url:r.url,length:text.length,prefix:text.slice(0,500)}}catch(error){return {error:String(error)}}
}

const results=[];
for(const target of targets){
  try{
    const fetched=await fetchViaJina(target,{ua:UA,retries:3,timeout:55000}),all=decodeAll(fetched.text),roots=[...(all.decoded.roots||[]),...all.nodeRoots];
    results.push({target,status:fetched.status,length:fetched.text.length,direct:await direct(target),documentTypes:(all.transport.docs||[]).map(x=>({type:x?.type??null,id:x?.id??null,nodes:Array.isArray(x?.nodes)?x.nodes.length:null,dataLength:Array.isArray(x?.data)?x.data.length:null})),prefix:all.transport.raw.slice(0,1200),summary:scanRoots(roots)});
  }catch(error){results.push({target,error:String(error),direct:await direct(target)})}
}
await mkdir('data/morimens/eremora',{recursive:true});
await writeFile(OUT,JSON.stringify({fetchedAt:new Date().toISOString(),results},null,2)+'\n');
console.log(results.map(x=>`${x.target} => ${x.error||`objects=${x.summary.objectCount}, ranks=${JSON.stringify(x.summary.rankRange)}, arrays=${x.summary.arrays.slice(0,5).map(a=>a.length).join('/')}`}`).join('\n'));

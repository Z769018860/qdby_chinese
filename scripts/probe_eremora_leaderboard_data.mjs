import {mkdir,writeFile} from 'node:fs/promises';
import {decodeSvelteData,fetchViaJina,walk,num,fixMojibake} from './eremora_sveltekit.mjs';

const OUT='data/morimens/eremora/leaderboard-probe.json';
const UA='qdby-chinese-eremora-leaderboard-probe/1.0 (+https://github.com/Z769018860/qdby_chinese)';
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
function summarize(decoded){
  const arrays=[],objects=[],scalars=[];
  for(const root of decoded.roots||[])walk(root,(v,path)=>{
    if(Array.isArray(v)){
      const sample=v.filter(playerish).slice(0,5).map(compact);
      if(sample.length||v.length>=50)arrays.push({path,length:v.length,sample});
    }else if(playerish(v))objects.push({path,value:compact(v)});
    else{
      for(const [k,val] of Object.entries(v))if(/^(page|limit|offset|total|count|season|period|has_more|next)$/i.test(k)&&(typeof val==='string'||typeof val==='number'||typeof val==='boolean'||val==null))scalars.push({path:`${path}.${k}`,value:val});
    }
  });
  const ranks=[];for(const x of objects){const r=num(x.value.rank??x.value.position);if(r!=null)ranks.push(r)}
  return {rootCount:decoded.roots?.length||0,arrays:arrays.sort((a,b)=>b.length-a.length).slice(0,80),objectCount:objects.length,objectSamples:objects.slice(0,80),rankRange:ranks.length?{min:Math.min(...ranks),max:Math.max(...ranks),distinct:new Set(ranks).size}:null,scalars:scalars.slice(0,150)};
}

const results=[];
for(const target of targets){
  try{
    const fetched=await fetchViaJina(target,{ua:UA,retries:3,timeout:55000});
    const decoded=decodeSvelteData(fetched.text);
    results.push({target,status:fetched.status,length:fetched.text.length,summary:summarize(decoded)});
  }catch(error){results.push({target,error:String(error)})}
}
await mkdir('data/morimens/eremora',{recursive:true});
await writeFile(OUT,JSON.stringify({fetchedAt:new Date().toISOString(),results},null,2)+'\n');
console.log(results.map(x=>`${x.target} => ${x.error||`objects=${x.summary.objectCount}, ranks=${JSON.stringify(x.summary.rankRange)}, arrays=${x.summary.arrays.slice(0,4).map(a=>a.length).join('/')}`}`).join('\n'));

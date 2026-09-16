import {mkdir,writeFile} from 'node:fs/promises';
const OUT='data/morimens/eremora/route-probe.json';
const UID=process.env.EREMORA_PROBE_UID||'100167859';
const current=Number(process.env.EREMORA_PROBE_SEASON||69);
const target=`https://eremora.com/u/${UID}/challenges/dzone/${current}/__data.json`;
const SPECIAL={UNDEFINED:-1,HOLE:-2,NAN:-3,POSITIVE_INFINITY:-4,NEGATIVE_INFINITY:-5,NEGATIVE_ZERO:-6};

async function fetchReader(url){
  const r=await fetch(`https://r.jina.ai/${url}`,{headers:{'user-agent':'qdby-chinese-eremora-schema-probe/2.0','accept':'text/plain','x-engine':'browser','x-timeout':'40'},signal:AbortSignal.timeout(50000)});
  const text=await r.text();if(!r.ok)throw new Error(`${url}: HTTP ${r.status}`);return text;
}
function extractRaw(text){const marker='Markdown Content:';return (text.includes(marker)?text.slice(text.indexOf(marker)+marker.length):text).trim()}
function parseTransport(raw){
  const docs=[];for(const line of raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)){try{docs.push(JSON.parse(line))}catch(error){throw new Error(`transport line parse failed: ${String(error)} :: ${line.slice(0,180)}`)}}return docs;
}
function unflatten(values){
  const hydrated=new Array(values.length);const hydrating=new Set();
  const hydrate=i=>{
    if(i===SPECIAL.UNDEFINED)return undefined;if(i===SPECIAL.HOLE)return undefined;if(i===SPECIAL.NAN)return NaN;if(i===SPECIAL.POSITIVE_INFINITY)return Infinity;if(i===SPECIAL.NEGATIVE_INFINITY)return -Infinity;if(i===SPECIAL.NEGATIVE_ZERO)return -0;
    if(!Number.isInteger(i)||i<0||i>=values.length)return i;
    if(Object.prototype.hasOwnProperty.call(hydrated,i))return hydrated[i];
    if(hydrating.has(i))return hydrated[i];
    const v=values[i];if(v===null||typeof v!=='object'){hydrated[i]=v;return v}
    hydrating.add(i);
    if(Array.isArray(v)){
      if(typeof v[0]==='string'){
        const tag=v[0];let out;
        if(tag==='Date')out=new Date(v[1]);
        else if(tag==='Set'){out=new Set();hydrated[i]=out;for(let j=1;j<v.length;j++)out.add(hydrate(v[j]))}
        else if(tag==='Map'){out=new Map();hydrated[i]=out;for(let j=1;j<v.length;j+=2)out.set(hydrate(v[j]),hydrate(v[j+1]))}
        else if(tag==='RegExp')out=new RegExp(v[1],v[2]);
        else if(tag==='BigInt')out=BigInt(v[1]);
        else if(tag==='Object')out=Object(hydrate(v[1]));
        else if(tag==='null'){out=Object.create(null);hydrated[i]=out;for(let j=1;j<v.length;j+=2)out[v[j]]=hydrate(v[j+1])}
        else if(tag==='Promise')out={__promise:hydrate(v[1])};
        else out=v.map((x,j)=>j===0?x:(Number.isInteger(x)?hydrate(x):x));
        hydrated[i]??=out;hydrating.delete(i);return hydrated[i];
      }
      const out=[];hydrated[i]=out;for(let j=0;j<v.length;j++){if(v[j]!==SPECIAL.HOLE)out[j]=hydrate(v[j])}hydrating.delete(i);return out;
    }
    const out={};hydrated[i]=out;for(const [k,ref] of Object.entries(v))out[k]=hydrate(ref);hydrating.delete(i);return out;
  };
  return hydrate(0);
}
function shape(v,depth=0){
  if(depth>3)return Array.isArray(v)?`Array(${v.length})`:v&&typeof v==='object'?'Object':typeof v;
  if(v===null||typeof v!=='object')return v;
  if(Array.isArray(v))return {type:'array',length:v.length,sample:v.slice(0,2).map(x=>shape(x,depth+1))};
  const keys=Object.keys(v);return {type:'object',keys:keys.slice(0,80),sample:Object.fromEntries(keys.slice(0,16).map(k=>[k,shape(v[k],depth+1)]))};
}
function walk(root,cb){const seen=new Set();const rec=(v,path)=>{if(!v||typeof v!=='object'||seen.has(v))return;seen.add(v);cb(v,path);if(Array.isArray(v)){for(let i=0;i<v.length;i++)rec(v[i],`${path}[${i}]`)}else for(const [k,x] of Object.entries(v))rec(x,`${path}.${k}`)};rec(root,'$')}
function compactActivity(v,path){
  const a=v?.activity&&typeof v.activity==='object'?v.activity:null;
  if(!a||!Array.isArray(v.stages))return null;
  return {path,activityTid:v.activity_tid??null,id:a.id??null,name:a.name??null,period:a.period??null,start:a.start??null,end:a.end??null,maxScore:v.max_score??null,stageCount:v.stage_count??v.stages.length,stages:v.stages.slice(0,12).map(s=>({name:s?.stage?.name||s?.name||null,score:s?.score??null,extraPass:s?.extra_pass??null,extra:s?.extra??null,teamAwakers:s?.team?.awakers?.length??null}))};
}
function buildSummary(decoded){
  const root=decoded?.data??decoded;const activities=[],teamNodes=[],builds=[];
  walk(root,(v,path)=>{
    const activity=compactActivity(v,path);if(activity)activities.push(activity);
    if(v.team&&v.stage&&typeof v.team==='object')teamNodes.push({path,stage:v.stage?.name||v.stage?.id||null,score:v.score??null,extra:v.extra??null,awakers:v.team?.awakers?.length??null});
    if(v.awaker&&Array.isArray(v.weapons)&&Array.isArray(v.trinkets))builds.push({path,name:v.awaker?.name||null,id:v.awaker?.id||null,res:v.awaker?.res||null,level:v.level??null,potencyLevel:v.potency_level??null,breakLevel:v.break_level??null,fighting:v.fighting??null,weapons:v.weapons.map(x=>x?.name).filter(Boolean),trinkets:v.trinkets.map(x=>x?.name).filter(Boolean),suits:(v.suits||[]).map(x=>x?.name).filter(Boolean),covenantScore:v.covenant_score??null,enlightenment:(v.enlightenment||[]).map(x=>({name:x?.name||null,lv:x?.lv??null,unlocked:x?.unlocked??null})),borrowed:v.borrowed??null});
  });
  return {rootKeys:root&&typeof root==='object'?Object.keys(root):[],rootShape:shape(root),activities:activities.slice(0,30),teamNodes:teamNodes.slice(0,80),buildCount:builds.length,buildSamples:builds.slice(0,12)};
}

const text=await fetchReader(target);const raw=extractRaw(text);let docs=[],decoded=null,parseError=null;
try{docs=parseTransport(raw);const chunk=docs.find(x=>x?.type==='chunk'&&x.id===1)||docs.find(x=>x?.type==='chunk');if(!chunk?.data)throw new Error('No SvelteKit chunk data found');decoded=unflatten(chunk.data)}catch(error){parseError=String(error)}
const payload={
  fetchedAt:new Date().toISOString(),target,transport:'SvelteKit __data.json via Jina Reader',length:text.length,rawLength:raw.length,parseOk:!!decoded,parseError,
  documentTypes:docs.map(x=>({type:x?.type??null,id:x?.id??null,nodes:Array.isArray(x?.nodes)?x.nodes.length:null,dataLength:Array.isArray(x?.data)?x.data.length:null})),
  summary:decoded?buildSummary(decoded):null,
  prefix:raw.slice(0,1800),suffix:raw.slice(-1800)
};
await mkdir('data/morimens/eremora',{recursive:true});await writeFile(OUT,JSON.stringify(payload,null,2)+'\n');
console.log(`Eremora __data transport: ${raw.length} bytes, docs=${docs.length}, parse=${!!decoded}, builds=${payload.summary?.buildCount??0}, activities=${payload.summary?.activities?.length??0}.`);

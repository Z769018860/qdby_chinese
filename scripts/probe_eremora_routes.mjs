import {mkdir,writeFile} from 'node:fs/promises';
const OUT='data/morimens/eremora/route-probe.json';
const UID='100167859';
const current=69;
const target=`https://eremora.com/u/${UID}/challenges/dzone/${current}/__data.json`;

async function fetchReader(url){
  const r=await fetch(`https://r.jina.ai/${url}`,{headers:{'user-agent':'qdby-chinese-eremora-schema-probe/1.0','accept':'text/plain','x-engine':'browser','x-timeout':'40'},signal:AbortSignal.timeout(50000)});
  const text=await r.text();if(!r.ok)throw new Error(`${url}: HTTP ${r.status}`);return text;
}
function contexts(text,re,radius=900,limit=80){const out=[];let m;while((m=re.exec(text))&&out.length<limit){out.push(text.slice(Math.max(0,m.index-radius),Math.min(text.length,m.index+radius)).replace(/\s+/g,' '))}return [...new Set(out)]}
function keyFrequency(text){const count=new Map();for(const m of text.matchAll(/"([A-Za-z_][A-Za-z0-9_]{1,80})"\s*:/g))count.set(m[1],(count.get(m[1])||0)+1);return [...count.entries()].sort((a,b)=>b[1]-a[1]).slice(0,220).map(([key,count])=>({key,count}))}
const text=await fetchReader(target);
const marker='Markdown Content:';const raw=text.includes(marker)?text.slice(text.indexOf(marker)+marker.length).trim():text.trim();
let parsed=null,parseError=null;
try{parsed=JSON.parse(raw)}catch(e){parseError=String(e)}
const terms={
  wheel:/wheel/ig,
  covenant:/covenant/ig,
  enlight:/enlight/ig,
  build:/build/ig,
  equip:/equip/ig,
  awakening:/awak/ig,
  character:/C04EX|Lotan: Cetarchon|B03|Aigis/ig,
  plus:/\+1[0-9]|\+\d/ig,
};
const termContexts=Object.fromEntries(Object.entries(terms).map(([k,re])=>[k,contexts(raw,re)]));
const payload={
  fetchedAt:new Date().toISOString(),target,length:text.length,rawLength:raw.length,parseOk:!!parsed,parseError,
  parsedSummary:parsed?{type:Array.isArray(parsed)?'array':typeof parsed,arrayLength:Array.isArray(parsed)?parsed.length:null,topKeys:parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?Object.keys(parsed).slice(0,120):[]}:null,
  keyFrequency:keyFrequency(raw),
  contexts:termContexts,
  prefix:raw.slice(0,12000),
  suffix:raw.slice(-12000)
};
await mkdir('data/morimens/eremora',{recursive:true});await writeFile(OUT,JSON.stringify(payload,null,2)+'\n');
console.log(`Eremora __data schema: ${raw.length} bytes, parse=${!!parsed}, wheelContexts=${termContexts.wheel.length}, covenantContexts=${termContexts.covenant.length}, enlightContexts=${termContexts.enlight.length}, equipContexts=${termContexts.equip.length}.`);
console.log('Top keys:',payload.keyFrequency.slice(0,50).map(x=>`${x.key}:${x.count}`).join(', '));

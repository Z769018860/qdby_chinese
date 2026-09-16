const SPECIAL={UNDEFINED:-1,HOLE:-2,NAN:-3,POSITIVE_INFINITY:-4,NEGATIVE_INFINITY:-5,NEGATIVE_ZERO:-6};

export const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export const uniq=xs=>[...new Set((xs||[]).filter(x=>x!==null&&x!==undefined&&x!==''))];
export const num=v=>{const n=Number(String(v??'').replace(/,/g,''));return Number.isFinite(n)?n:null};

export function extractReaderPayload(text=''){
  const marker='Markdown Content:';
  return (text.includes(marker)?text.slice(text.indexOf(marker)+marker.length):text).trim();
}

export async function fetchViaJina(target,{ua='qdby-chinese-eremora/2.0 (+https://github.com/Z769018860/qdby_chinese)',retries=5,timeout=55000,accept='text/plain'}={}){
  let last;
  for(let i=0;i<retries;i++){
    try{
      const r=await fetch(`https://r.jina.ai/${target}`,{headers:{'user-agent':ua,'accept':accept,'x-engine':'browser','x-timeout':'45'},redirect:'follow',signal:AbortSignal.timeout(timeout)});
      const text=await r.text();
      if(r.ok&&text&&!/Target URL returned error 429/i.test(text))return {status:r.status,text,url:r.url};
      last=new Error(`${target}: HTTP ${r.status}${text?` (${text.slice(0,160).replace(/\s+/g,' ')})`:''}`);
      if(r.status!==429&&r.status<500)break;
    }catch(error){last=error}
    if(i+1<retries)await sleep(Math.min(30000,3000*Math.pow(2,i)));
  }
  throw last||new Error(`Unable to fetch ${target}`);
}

export function parseSvelteTransport(text=''){
  const raw=extractReaderPayload(text),docs=[];
  for(const line of raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)){
    try{docs.push(JSON.parse(line))}
    catch(error){throw new Error(`Eremora __data transport line parse failed: ${String(error)} :: ${line.slice(0,180)}`)}
  }
  return {raw,docs};
}

export function unflatten(values){
  if(!Array.isArray(values))return values;
  const hydrated=new Array(values.length),done=new Set(),hydrating=new Set();
  const hydrate=i=>{
    if(i===SPECIAL.UNDEFINED)return undefined;
    if(i===SPECIAL.HOLE)return undefined;
    if(i===SPECIAL.NAN)return NaN;
    if(i===SPECIAL.POSITIVE_INFINITY)return Infinity;
    if(i===SPECIAL.NEGATIVE_INFINITY)return -Infinity;
    if(i===SPECIAL.NEGATIVE_ZERO)return -0;
    if(!Number.isInteger(i)||i<0||i>=values.length)return i;
    if(done.has(i))return hydrated[i];
    if(hydrating.has(i))return hydrated[i];
    const value=values[i];
    if(value===null||typeof value!=='object'){hydrated[i]=value;done.add(i);return value}
    hydrating.add(i);
    if(Array.isArray(value)){
      if(typeof value[0]==='string'){
        const tag=value[0];let out;
        if(tag==='Date')out=new Date(value[1]);
        else if(tag==='Set'){out=new Set();hydrated[i]=out;for(let j=1;j<value.length;j++)out.add(hydrate(value[j]))}
        else if(tag==='Map'){out=new Map();hydrated[i]=out;for(let j=1;j<value.length;j+=2)out.set(hydrate(value[j]),hydrate(value[j+1]))}
        else if(tag==='RegExp')out=new RegExp(value[1],value[2]);
        else if(tag==='BigInt')out=BigInt(value[1]);
        else if(tag==='Object')out=Object(hydrate(value[1]));
        else if(tag==='null'){out=Object.create(null);hydrated[i]=out;for(let j=1;j<value.length;j+=2)out[value[j]]=hydrate(value[j+1])}
        else if(tag==='Promise')out={__promise:hydrate(value[1])};
        else out=value.map((x,j)=>j===0?x:(Number.isInteger(x)?hydrate(x):x));
        hydrated[i]??=out;hydrating.delete(i);done.add(i);return hydrated[i];
      }
      const out=[];hydrated[i]=out;
      for(let j=0;j<value.length;j++)if(value[j]!==SPECIAL.HOLE)out[j]=hydrate(value[j]);
      hydrating.delete(i);done.add(i);return out;
    }
    const out={};hydrated[i]=out;
    for(const [key,ref] of Object.entries(value))out[key]=hydrate(ref);
    hydrating.delete(i);done.add(i);return out;
  };
  return hydrate(0);
}

export function decodeSvelteData(text=''){
  const {raw,docs}=parseSvelteTransport(text);
  const chunks=docs.filter(x=>x?.type==='chunk'&&Array.isArray(x.data)).map(x=>({id:x.id,data:unflatten(x.data)}));
  const roots=chunks.map(x=>x.data);
  return {raw,docs,chunks,roots,root:chunks.find(x=>x.id===1)?.data??roots[0]??null};
}

export function walk(root,callback){
  const seen=new Set();
  const visit=(value,path='$')=>{
    if(!value||typeof value!=='object'||seen.has(value))return;
    seen.add(value);callback(value,path);
    if(Array.isArray(value)){for(let i=0;i<value.length;i++)visit(value[i],`${path}[${i}]`)}
    else for(const [key,child] of Object.entries(value))visit(child,`${path}.${key}`);
  };
  visit(root);
}

export function fixMojibake(value){
  if(typeof value!=='string'||!/[ÃÂæçåäéèä¸]/.test(value))return value;
  try{
    const repaired=Buffer.from(value,'latin1').toString('utf8');
    const bad=s=>(s.match(/�/g)||[]).length+(s.match(/[ÃÂ]/g)||[]).length;
    return bad(repaired)<bad(value)?repaired:value;
  }catch{return value}
}

export function mediaUrl(mediaBase,path,{thumb=false}={}){
  if(!path)return null;if(/^https?:\/\//i.test(path))return path;
  const base=String(mediaBase||'').replace(/\/$/,'');if(!base)return null;
  return `${base}/${thumb?'thumb/':''}${String(path).replace(/^\//,'')}`;
}

export function findDzoneActivities(decoded){
  const found=[];
  for(const root of decoded?.roots||[decoded?.root].filter(Boolean))walk(root,(value,path)=>{
    const activity=value?.activity;
    if(!activity||typeof activity!=='object'||!Array.isArray(value.stages))return;
    const name=String(activity.name||'');
    if(!/Dissoluted Abyss|D[- ]?Zone/i.test(name)&&activity.period==null)return;
    const period=num(activity.period);
    if(period==null)return;
    found.push({path,node:value,period,stageCount:value.stages.length});
  });
  const byKey=new Map();
  for(const item of found){const key=`${item.period}:${item.node?.activity_tid??''}`;const old=byKey.get(key);if(!old||item.stageCount>old.stageCount)byKey.set(key,item)}
  return [...byKey.values()].sort((a,b)=>b.period-a.period||b.stageCount-a.stageCount);
}

export function findMediaBase(decoded){
  for(const doc of decoded?.docs||[]){for(const node of doc?.nodes||[]){if(!Array.isArray(node?.data))continue;try{const d=unflatten(node.data);if(d?.mediaBase)return d.mediaBase}catch{}}}
  let result=null;for(const root of decoded?.roots||[])walk(root,value=>{if(!result&&typeof value?.mediaBase==='string')result=value.mediaBase});return result;
}

export function findProfileHeader(decoded){
  let best=null;
  for(const root of decoded?.roots||[])walk(root,value=>{
    if(!value?.header||typeof value.header!=='object')return;
    const h=value.header;if(h.uid!=null&&h.name){if(!best)best=h}
  });
  return best;
}

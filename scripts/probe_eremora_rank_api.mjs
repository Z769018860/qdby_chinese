import {mkdir,writeFile} from 'node:fs/promises';
const ORIGIN='https://eremora.com';
const OUT='data/morimens/eremora/rank-api-probe.json';
const UA='qdby-chinese-eremora-rank-probe/1.0 (+https://github.com/Z769018860/qdby_chinese)';
const ranges=[[1,50],[51,100],[101,150],[151,200],[451,500],[951,1000]];
async function get(start,end){
  const url=`${ORIGIN}/api/rank?board=abyss&start=${start}&end=${end}`;
  try{
    const r=await fetch(url,{headers:{'user-agent':UA,'accept':'application/json'},redirect:'follow',signal:AbortSignal.timeout(35000)}),text=await r.text();let data=null,error=null;try{data=JSON.parse(text)}catch(e){error=String(e)}
    const rows=Array.isArray(data?.rows)?data.rows:Array.isArray(data)?data:[];
    return {url,status:r.status,length:text.length,parseOk:!!data,parseError:error,rowCount:rows.length,rowKeys:rows[0]?Object.keys(rows[0]):[],first:rows[0]||null,last:rows.at(-1)||null,topKeys:data&&typeof data==='object'&&!Array.isArray(data)?Object.keys(data):[],headers:Object.fromEntries([...r.headers].filter(([k])=>/cache|rate|retry|etag|age/i.test(k)))};
  }catch(error){return {url,error:String(error)}}
}
const results=[];for(const [s,e] of ranges)results.push(await get(s,e));
await mkdir('data/morimens/eremora',{recursive:true});await writeFile(OUT,JSON.stringify({fetchedAt:new Date().toISOString(),results},null,2)+'\n');
console.log(results.map(x=>`${x.url}: ${x.error||`HTTP ${x.status}, rows=${x.rowCount}, keys=${x.rowKeys.join(',')}`}`).join('\n'));

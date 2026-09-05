import { createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const BASE='https://jx3.unua.top';
const USER_AGENT='Mozilla/5.0 (compatible; qdby-chinese-segment-sync/2.0)';
const ranges=[[2100,2300],[2200,2400],[2400,2600],[2600,2800],[2800,3000],[3000,3200]];
const sha256=v=>createHash('sha256').update(v).digest('hex');

async function session(){
  const headers={Accept:'application/json','User-Agent':USER_AGENT,Referer:`${BASE}/jjc-stats/`};
  const started=Date.now(), response=await fetch(`${BASE}/api/client-proof`,{headers});
  if(!response.ok)throw new Error(`client-proof ${response.status}`);
  const proof=await response.json(), finished=Date.now();
  return {headers,proof,cookie:response.headers.get('set-cookie')||'',offset:Number(proof.serverTimeMs||Date.now())-(started+finished)/2};
}
async function signedGet(path){
  const s=await session(), p=s.proof, a=p.headerAliases||{};
  const ts=String(Math.floor((Date.now()+s.offset)/1000)), nonce=randomBytes(12).toString('hex'), bodyHash=sha256('');
  const suffix=p.kid&&p.dailySalt?`:${p.kid}:${p.dailySalt}`:'';
  const sig=sha256(`GET:${path}:${ts}:${nonce}:${p.token}:${bodyHash}${suffix}`);
  const headers={...s.headers,[a.token]:p.token,[a.timestamp]:ts,[a.nonce]:nonce,[a.proof]:sig,[a.bodyHash]:bodyHash};
  if(s.cookie)headers.Cookie=s.cookie;
  if(p.kid&&p.dailySalt&&a.kid&&a.daily) {headers[a.kid]=p.kid;headers[a.daily]=p.dailySalt;}
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),15000);
  let response;
  try{response=await fetch(`${BASE}${path}`,{headers,signal:controller.signal});}
  finally{clearTimeout(timeout);}
  if(!response.ok){
    const errorText=await response.text();
    throw new Error(`${path} HTTP ${response.status}: ${errorText.slice(0,500)}`);
  }
  const contentLength=Number(response.headers.get('content-length')||0);
  const maxBytes=4*1024*1024;
  if(contentLength>maxBytes)throw new Error(`${path} response content-length exceeds 4MB`);
  const reader=response.body?.getReader();
  if(!reader)throw new Error(`${path} has no readable response body`);
  const chunks=[];
  let total=0;
  while(true){
    const part=await reader.read();
    if(part.done)break;
    total+=part.value.byteLength;
    if(total>maxBytes){
      await reader.cancel();
      throw new Error(`${path} response exceeds 4MB; skipped`);
    }
    chunks.push(Buffer.from(part.value));
  }
  const responseText=Buffer.concat(chunks).toString('utf8');
  try{
  const out={schema_version:1,source:BASE+'/api/rank/jjc-stats',updated_at:new Date().toISOString(),mode:'3v3',sample:'solo',period:'1d',ranges:{}};
  for(const [min,max] of ranges){
    const result={min_score:min,max_score:max,dps:[],healer:[]};
    for(const role of ['dps','healer']){
      try{result[role]=await fetchSegment(min,max,role,'last1d');}catch(e){console.warn(`segment ${min}-${max} ${role} last1d`,e.message);}
    }
    out.ranges[`${min}-${max}`]=result;
  }
  await writeFile('jx3-segment-stats.json',JSON.stringify(out,null,2)+'\n');
}catch(e){
    throw new Error(`${path} returned non-JSON: ${responseText.slice(0,500)}`);
  }
}
function normalize(data){
  const list=data?.rank?.data;
  if(!Array.isArray(list))return [];
  return list.map((x,i)=>({
    rank:Number(x.strengthRank??x.rank??i+1),
    kungfu:x.kungfuName||x.kungfu||x.name,
    win_rate:Number(x.winRate??x.win_rate),
    pick_rate:Number(x.appearRate??x.pickRate??x.pick_rate??0),
    sample_count:Number(x.sampleCount??x.sample_count??0),
    player_count:Number(x.playerCount??x.player_count??0)
  })).filter(x=>x.kungfu&&Number.isFinite(x.win_rate));
}
async function fetchSegment(min,max,role,periodType='last1d'){
  const kungfuType=role==='healer'?'tps':'dps';
  const matchMode='solo';
  let last;
  {
    const path='/api/rank/jjc-stats?kungfuType='+kungfuType+'&matchMode='+matchMode+'&periodType='+periodType+'&scoreStart='+min+'&scoreEnd='+max;
    try{
  const out={schema_version:1,source:BASE+'/api/rank/jjc-stats',updated_at:new Date().toISOString(),mode:'3v3',sample:'solo',periods:{}};
  for(const periodType of ['last1d','last7d']){
    const periodRanges={};
    for(const [min,max] of ranges){
      const result={min_score:min,max_score:max,dps:[],healer:[]};
      for(const role of ['dps','healer']){
        try{result[role]=await fetchSegment(min,max,role,periodType);}catch(e){console.warn(`segment ${min}-${max} ${role} ${periodType}`,e.message);}
      }
      periodRanges[`${min}-${max}`]=result;
    }
    out.periods[periodType]={ranges:periodRanges};
  }
  out.ranges=out.periods.last1d.ranges;
  await writeFile('jx3-segment-stats.json',JSON.stringify(out,null,2)+'\n');
}catch(e){last=e;}
  }
  throw last||new Error('jjc-stats returned no '+role+' data for '+min+'-'+max);
}
async function emptySnapshot(reason){
  const out={schema_version:1,source:BASE+'/api/rank/jjc-stats',updated_at:new Date().toISOString(),mode:'3v3',sample:'solo',period:'1d',fallback:false,sync_status:'segment_api_unavailable',sync_error:String(reason),ranges:{}};
  for(const [min,max] of ranges)out.ranges[`${min}-${max}`]={min_score:min,max_score:max,dps:[],healer:[],source:'segment-personal-solo-api'};
  await writeFile('jx3-segment-stats.json',JSON.stringify(out,null,2)+'\n');
}
try{
  const out={schema_version:1,source:BASE+'/api/rank/builds',updated_at:new Date().toISOString(),mode:'3v3',sample:'solo',period:'1d',ranges:{}};
  for(const [min,max] of ranges){
    const result={min_score:min,max_score:max,dps:[],healer:[]};
    for(const role of ['dps','healer']){
      try{result[role]=await fetchSegment(min,max,role);}catch(e){console.warn(`segment ${min}-${max} ${role}`,e.message);}
    }
    if(!result.dps.length&&!result.healer.length)console.warn(`segment ${min}-${max} has no records; continuing`);
    out.ranges[`${min}-${max}`]=result;
  }
  await writeFile('jx3-segment-stats.json',JSON.stringify(out,null,2)+'\n');
}catch(e){console.error('segment personal API failed:',e.stack||e.message||e);process.exitCode=1;throw e;}

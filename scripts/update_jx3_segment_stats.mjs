import { createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const BASE='https://jx3.unua.top';
const USER_AGENT='Mozilla/5.0 (compatible; qdby-chinese-segment-sync/2.0)';
const ranges=Array.from({length:11},(_,i)=>[1000+i*200,1200+i*200]);
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
  const response=await fetch(`${BASE}${path}`,{headers});
  if(!response.ok)throw new Error(`${path} ${response.status}`);
  return response.json();
}
function normalize(data){
  return (data?.stats||[]).map((x,i)=>({rank:Number(x.rank||i+1),kungfu:x.kungfu||x.name,win_rate:Number(x.win_rate??x.winRate),pick_rate:Number(x.pick_rate??x.rate??0),sample_count:x.sample_count,player_count:x.player_count})).filter(x=>x.kungfu&&Number.isFinite(x.win_rate));
}
async function fetchSegment(min,max,role){\n  const candidates=[\n    'mode=summary&sample=solo&period=1d&role='+role+'&minScore='+min+'&maxScore='+max,\n    'mode=summary&sample=solo&period=1d&role='+role+'&scoreMin='+min+'&scoreMax='+max,\n    'mode=summary&sample=solo&period=1d&role='+role+'&score_min='+min+'&score_max='+max,\n    'mode=summary&sample=solo&period=1d&role='+role+'&rating_min='+min+'&rating_max='+max\n  ];\n  let last;\n  for(const query of candidates){\n    try{\n      const data=await signedGet('/api/rank/builds?'+query);\n      const stats=normalize(data);\n      if(!stats.length)continue;\n      const returnedMin=Number(data?.min_score??data?.score_min??data?.filters?.min_score??data?.query?.min_score);\n      const returnedMax=Number(data?.max_score??data?.score_max??data?.filters?.max_score??data?.query?.max_score);\n      if(Number.isFinite(returnedMin)&&Number.isFinite(returnedMax)&&(returnedMin!==min||returnedMax!==max))continue;\n      return stats;\n    }catch(e){last=e;}\n  }\n  throw last||new Error('segment '+min+'-'+max+' '+role+' returned no filtered stats');\n}\nasync function emptySnapshot(reason){
  const out={schema_version:1,source:BASE+'/api/rank/builds',updated_at:new Date().toISOString(),mode:'3v3',sample:'solo',period:'1d',fallback:false,sync_status:'segment_api_unavailable',sync_error:String(reason),ranges:{}};
  for(const [min,max] of ranges)out.ranges[`${min}-${max}`]={min_score:min,max_score:max,dps:[],healer:[],source:'segment-personal-solo-api'};
  await writeFile('jx3-segment-stats.json',JSON.stringify(out,null,2)+'\\n');
}
try{
  const out={schema_version:1,source:BASE+'/api/rank/builds',updated_at:new Date().toISOString(),mode:'3v3',sample:'solo',period:'1d',ranges:{}};
  for(const [min,max] of ranges){
    const result={min_score:min,max_score:max,dps:[],healer:[]};
    for(const role of ['dps','healer']){
      try{result[role]=await fetchSegment(min,max,role);}catch(e){console.warn(`segment ${min}-${max} ${role}`,e.message);}
    }
    if(!result.dps.length&&!result.healer.length)throw new Error(`segment ${min}-${max} returned no stats`);
    out.ranges[`${min}-${max}`]=result;
  }
  const fingerprints=Object.values(out.ranges).map(x=>JSON.stringify({dps:x.dps,healer:x.healer}));
  if(fingerprints.length>1&&fingerprints.every(x=>x===fingerprints[0]))throw new Error('all score ranges returned identical data; refusing to publish a false segment snapshot');
  await writeFile('jx3-segment-stats.json',JSON.stringify(out,null,2)+'\n');
}catch(e){console.warn('segment personal API unavailable; writing empty status snapshot',e.message);await emptySnapshot(e.message);}

import {mkdir,writeFile} from 'node:fs/promises';
const OUT='data/morimens/eremora/route-probe.json';
const UID='100167859';
const current=69,prev=68;
const urls=[
  `https://eremora.com/u/${UID}/challenges/dzone`,
  `https://eremora.com/u/${UID}/challenges/dzone/${prev}`,
  `https://eremora.com/u/${UID}/challenges/dzone/${current}/__data.json`,
  `https://eremora.com/u/${UID}/challenges/dzone/${current}.json`,
  `https://eremora.com/leaderboard/abyss`,
  `https://eremora.com/leaderboard/abyss/${prev}`,
  `https://eremora.com/leaderboard/dzone/${prev}`,
  `https://eremora.com/leaderboard?season=${prev}`,
  `https://eremora.com/leaderboard/abyss?season=${prev}`,
  `https://eremora.com/leaderboard?mode=dzone&season=${prev}`,
];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function fetchReader(target){
  const r=await fetch(`https://r.jina.ai/${target}`,{headers:{'user-agent':'qdby-chinese-eremora-route-probe/1.0','accept':'text/plain','x-engine':'browser','x-timeout':'30','x-wait-for-selector':'body'},signal:AbortSignal.timeout(40000)});
  const text=await r.text();return {status:r.status,text};
}
function summary(target,status,text){
  const seasons=[...text.matchAll(/D-Zone\s+Season\s+(\d+)|\bSeason\s+(\d+)\b/gi)].map(m=>Number(m[1]||m[2])).filter(Number.isFinite);
  const links=[...text.matchAll(/https:\/\/eremora\.com\/u\/(\d+)\/challenges\/dzone\/(\d+)/g)].map(m=>({uid:m[1],season:Number(m[2])}));
  return {url:target,status,length:text.length,title:text.match(/^Title:\s*(.+)$/m)?.[1]||null,urlSource:text.match(/^URL Source:\s*(.+)$/m)?.[1]||null,seasons:[...new Set(seasons)].sort((a,b)=>b-a),dzoneLinks:[...new Map(links.map(x=>[`${x.uid}:${x.season}`,x])).values()].slice(0,100),hasWheel:/\bWheel\b/i.test(text),hasCovenant:/\bCovenant\b/i.test(text),hasEnlight:/Enlight/i.test(text),sample:text.slice(0,5000)};
}
const results=[];
for(const u of urls){try{const r=await fetchReader(u);results.push(summary(u,r.status,r.text))}catch(e){results.push({url:u,error:String(e)})}await sleep(900)}
await mkdir('data/morimens/eremora',{recursive:true});
await writeFile(OUT,JSON.stringify({fetchedAt:new Date().toISOString(),uid:UID,current,previous:prev,results},null,2)+'\n');
for(const r of results)console.log(`${r.status||'ERR'} ${r.url} len=${r.length||0} seasons=${(r.seasons||[]).join(',')} links=${r.dzoneLinks?.length||0} wheel=${r.hasWheel||false} cov=${r.hasCovenant||false} enlight=${r.hasEnlight||false}`);

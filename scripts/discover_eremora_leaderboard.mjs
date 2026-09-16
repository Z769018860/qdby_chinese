import {mkdir, writeFile} from 'node:fs/promises';

const ORIGIN='https://eremora.com';
const PAGE='/leaderboard';
const UA='qdby-chinese-eremora-discovery/1.0 (+https://github.com/Z769018860/qdby_chinese)';
const OUT='data/morimens/eremora/discovery.json';

function uniq(xs){return [...new Set(xs.filter(Boolean))]}
function abs(u){try{return new URL(u,ORIGIN).href}catch{return null}}
async function get(url){
  const r=await fetch(url,{headers:{'user-agent':UA,'accept':'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8'},redirect:'follow',signal:AbortSignal.timeout(20000)});
  return {status:r.status,url:r.url,headers:Object.fromEntries(r.headers.entries()),text:await r.text()};
}
function apiCandidates(text=''){
  const out=[];
  const patterns=[
    /["'`](\/api\/[A-Za-z0-9_?=&./:${}\-]+)["'`]/g,
    /["'`](https?:\/\/[^"'`\s]+(?:leaderboard|dzone|d-zone|dtide|d-tide|challenge|clear)[^"'`\s]*)["'`]/gi,
    /["'`](\/[A-Za-z0-9_?=&./:${}\-]*(?:leaderboard|dzone|d-zone|dtide|d-tide|challenge|clear)[A-Za-z0-9_?=&./:${}\-]*)["'`]/gi,
  ];
  for(const p of patterns)for(const m of text.matchAll(p))out.push(m[1]);
  return uniq(out).slice(0,500);
}
function contexts(text='',needleRe=/(leaderboard|dzone|d-zone|dtide|d-tide|challenge|clear|season|wave)/ig){
  const out=[];let m;
  while((m=needleRe.exec(text))&&out.length<120){const s=Math.max(0,m.index-240),e=Math.min(text.length,m.index+520);out.push(text.slice(s,e).replace(/\s+/g,' '))}
  return uniq(out);
}

const page=await get(`${ORIGIN}${PAGE}`);
const scriptSrcs=uniq([...page.text.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(m=>abs(m[1])));
const nextData=[...page.text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(x=>/leaderboard|dzone|d-tide|dtide|challenge|__next_f|__NEXT_DATA__/i.test(x));
const assets=[];
for(const url of scriptSrcs.filter(u=>u?.includes('/_next/')).slice(0,80)){
  try{
    const r=await get(url);
    assets.push({url,status:r.status,length:r.text.length,candidates:apiCandidates(r.text),contexts:contexts(r.text)});
  }catch(error){assets.push({url,error:String(error)})}
}
const candidates=uniq([...apiCandidates(page.text),...nextData.flatMap(apiCandidates),...assets.flatMap(x=>x.candidates||[])]);
const payload={
  source:{url:`${ORIGIN}${PAGE}`,fetchedAt:new Date().toISOString(),status:page.status,finalUrl:page.url},
  html:{length:page.text.length,scriptSrcs,nextInlineCount:nextData.length,candidates:apiCandidates(page.text),contexts:contexts(page.text)},
  assets,
  candidates
};
await mkdir('data/morimens/eremora',{recursive:true});
await writeFile(OUT,JSON.stringify(payload,null,2)+'\n');
console.log(`Eremora discovery: page ${page.status}, ${page.text.length} bytes, ${scriptSrcs.length} scripts, ${candidates.length} candidate endpoints.`);
for(const c of candidates.slice(0,80))console.log(`candidate: ${c}`);

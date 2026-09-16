import {mkdir, writeFile} from 'node:fs/promises';

const ORIGIN='https://eremora.com';
const PAGE='/leaderboard';
const TARGET=`${ORIGIN}${PAGE}`;
const JINA=`https://r.jina.ai/${TARGET}`;
const UA='qdby-chinese-eremora-discovery/1.3 (+https://github.com/Z769018860/qdby_chinese)';
const OUT_DIR='data/morimens/eremora';
const OUT=`${OUT_DIR}/discovery.json`;

function uniq(xs){return [...new Set(xs.filter(Boolean))]}
function abs(u){try{return new URL(u,ORIGIN).href}catch{return null}}
async function get(url,headers={}){
  const r=await fetch(url,{headers:{'user-agent':UA,'accept':'text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.8',...headers},redirect:'follow',signal:AbortSignal.timeout(45000)});
  return {status:r.status,url:r.url,headers:Object.fromEntries(r.headers.entries()),text:await r.text()};
}
async function getReader(target){return get(`https://r.jina.ai/${target}`,{'accept':'text/plain','x-engine':'browser','x-timeout':'40','x-wait-for-selector':'body'})}
function apiCandidates(text=''){
  const out=[];
  const patterns=[
    /["'`](\/api\/[A-Za-z0-9_?=&./:${}\-]+)["'`]/g,
    /["'`](https?:\/\/[^"'`\s]+(?:leaderboard|dzone|d-zone|dtide|d-tide|challenge|clear|season|wave)[^"'`\s]*)["'`]/gi,
    /(?:href|src)=["']([^"']*(?:leaderboard|dzone|d-zone|dtide|d-tide|challenge|clear|season|wave)[^"']*)["']/gi,
    /\]\((https?:\/\/[^)]+|\/[^)]+)\)/g,
  ];
  for(const p of patterns)for(const m of text.matchAll(p))out.push(m[1]);
  return uniq(out).slice(0,1000);
}
function contexts(text='',needleRe=/(leaderboard|dzone|d-zone|dtide|d-tide|challenge|clear|season|wave|融灾)/ig,limit=180){
  const out=[];let m;
  while((m=needleRe.exec(text))&&out.length<limit){const s=Math.max(0,m.index-300),e=Math.min(text.length,m.index+900);out.push(text.slice(s,e).replace(/\s+/g,' '))}
  return uniq(out);
}

const page=await get(TARGET);
let reader={status:0,url:JINA,headers:{},text:'',error:null};
try{reader=await getReader(TARGET)}catch(error){reader.error=String(error)}

const sourceText=page.status===200?page.text:reader.text;
const scriptSrcs=uniq([...sourceText.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(m=>abs(m[1])));
const nextData=[...sourceText.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(x=>/leaderboard|dzone|d-tide|dtide|challenge|__next_f|__NEXT_DATA__/i.test(x));
const assets=[];
for(const url of scriptSrcs.filter(u=>u?.includes('/_next/')).slice(0,80)){
  try{const r=await get(url);assets.push({url,status:r.status,length:r.text.length,candidates:apiCandidates(r.text),contexts:contexts(r.text,/(leaderboard|dzone|d-zone|dtide|d-tide|challenge|clear|season|wave)/ig,80)})}
  catch(error){assets.push({url,error:String(error)})}
}
const candidates=uniq([...apiCandidates(page.text),...apiCandidates(reader.text),...nextData.flatMap(apiCandidates),...assets.flatMap(x=>x.candidates||[])]);
const challengeUrls=uniq([...reader.text.matchAll(/\]\((https:\/\/eremora\.com\/u\/\d+\/challenges\/dzone\/\d+)\)/g)].map(m=>m[1]));
let challengeSample={url:null,status:0,text:'',error:null};
if(challengeUrls[0]){
  try{const r=await getReader(challengeUrls[0]);challengeSample={url:challengeUrls[0],status:r.status,text:r.text,error:null}}
  catch(error){challengeSample={url:challengeUrls[0],status:0,text:'',error:String(error)}}
}
const markdownLines=reader.text.split(/\r?\n/).filter(Boolean);
const payload={
  source:{url:TARGET,fetchedAt:new Date().toISOString(),directStatus:page.status,directFinalUrl:page.url,readerStatus:reader.status,readerFinalUrl:reader.url,readerError:reader.error},
  html:{length:page.text.length,scriptSrcs,nextInlineCount:nextData.length,candidates:apiCandidates(page.text),contexts:contexts(page.text)},
  reader:{length:reader.text.length,titleLine:markdownLines.find(x=>/^Title:/i.test(x))||null,urlLine:markdownLines.find(x=>/^URL Source:/i.test(x))||null,candidates:apiCandidates(reader.text),contexts:contexts(reader.text)},
  challenge:{count:challengeUrls.length,firstUrl:challengeSample.url,firstStatus:challengeSample.status,firstLength:challengeSample.text.length,error:challengeSample.error,contexts:contexts(challengeSample.text,/(team|awakener|wheel|covenant|enlighten|level|wave|turn|score|damage|d zone|dzone)/ig,180)},
  assets,
  candidates
};
await mkdir(OUT_DIR,{recursive:true});
await Promise.all([
  writeFile(OUT,JSON.stringify(payload,null,2)+'\n'),
  writeFile(`${OUT_DIR}/reader.md`,reader.text||''),
  writeFile(`${OUT_DIR}/challenge-sample.md`,challengeSample.text||'')
]);
console.log(`Eremora discovery: direct=${page.status}/${page.text.length} bytes, reader=${reader.status}/${reader.text.length} bytes, challenge=${challengeSample.status}/${challengeSample.text.length}, ${challengeUrls.length} clear links.`);
for(const c of candidates.slice(0,120))console.log(`candidate: ${c}`);

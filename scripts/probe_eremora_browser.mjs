import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile} from 'node:fs/promises';
const execFileP=promisify(execFile);
const ORIGIN='https://eremora.com';
const TARGET=`${ORIGIN}/leaderboard/abyss`;
const OUT='data/morimens/eremora/browser-probe.json';
const UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132 Safari/537.36';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function uniq(xs){return [...new Set(xs.filter(Boolean))]}
function abs(u){try{return new URL(u,ORIGIN).href}catch{return null}}
function contexts(text,re,radius=900,limit=80){const out=[];let m;while((m=re.exec(text))&&out.length<limit)out.push(text.slice(Math.max(0,m.index-radius),Math.min(text.length,m.index+radius)).replace(/\s+/g,' '));return uniq(out)}
async function fetchText(url){const r=await fetch(url,{headers:{'user-agent':UA,'accept':'*/*'},redirect:'follow',signal:AbortSignal.timeout(30000)});return {status:r.status,url:r.url,text:await r.text(),headers:Object.fromEntries(r.headers.entries())}}
async function chromePath(){for(const c of ['google-chrome','google-chrome-stable','chromium','chromium-browser']){try{const {stdout}=await execFileP('which',[c]);if(stdout.trim())return stdout.trim()}catch{}}return null}
const chrome=await chromePath();let dom='',chromeError=null;
if(chrome){try{const r=await execFileP(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-blink-features=AutomationControlled',`--user-agent=${UA}`,'--virtual-time-budget=12000','--dump-dom',TARGET],{maxBuffer:20*1024*1024,timeout:45000});dom=r.stdout||''}catch(e){chromeError=String(e);dom=e?.stdout||''}}
else chromeError='Chrome executable not found';
const scripts=uniq([...dom.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(m=>abs(m[1])));
const modulepreloads=uniq([...dom.matchAll(/<link\b[^>]*\b(?:rel=["'][^"']*(?:modulepreload|preload)[^"']*["'])[^>]*\bhref=["']([^"']+)["']/gi)].map(m=>abs(m[1])));
const assets=[];
for(const url of uniq([...scripts,...modulepreloads]).filter(x=>/\.(?:js|mjs)(?:\?|$)/i.test(x)).slice(0,80)){
  try{const r=await fetchText(url);assets.push({url,status:r.status,length:r.text.length,contexts:contexts(r.text,/(load\s*more|loadMore|leaderboard|abyss|AbyssChallenge|cursor|offset|limit|page|rows|\/api\/|fetch\()/ig,1000,90),urls:uniq([...r.text.matchAll(/["'`](\/?(?:api|leaderboard|u|rpc|remote)[^"'`\s]{1,240})["'`]/gi)].map(m=>m[1])).slice(0,120)})}catch(error){assets.push({url,error:String(error)})}
}
let dataDirect=null;try{const r=await fetchText(`${TARGET}/__data.json?browserprobe=1`);dataDirect={status:r.status,length:r.text.length,headers:r.headers,prefix:r.text.slice(0,700)}}catch(error){dataDirect={error:String(error)}}
const payload={fetchedAt:new Date().toISOString(),target:TARGET,chrome,chromeError,domLength:dom.length,title:dom.match(/<title>([^<]+)/i)?.[1]||null,cloudflare:/Just a moment|challenge-platform|cf-chl/i.test(dom),scripts,modulepreloads,buttonTexts:uniq([...dom.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)].map(m=>m[1].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim())).slice(0,80),domContexts:contexts(dom,/(load\s*more|leaderboard|abyss|rank|score)/ig,700,80),assets,dataDirect};
await mkdir('data/morimens/eremora',{recursive:true});await writeFile(OUT,JSON.stringify(payload,null,2)+'\n');
console.log(`Browser probe: chrome=${!!chrome}, dom=${dom.length}, cf=${payload.cloudflare}, scripts=${scripts.length}, assets=${assets.length}, buttons=${payload.buttonTexts.join(' | ')}`);

import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile} from 'node:fs/promises';
const execFileP=promisify(execFile);
const ORIGIN='https://eremora.com';
const UID=process.env.EREMORA_PROBE_UID||'100167859';
const SEASON=process.env.EREMORA_PROBE_SEASON||'69';
const TARGET=`${ORIGIN}/u/${UID}/challenges/dzone/${SEASON}`;
const OUT='data/morimens/eremora/challenge-browser-probe.json';
const UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132 Safari/537.36';
function uniq(xs){return [...new Set(xs.filter(Boolean))]}
function abs(u){try{return new URL(u,ORIGIN).href}catch{return null}}
function contexts(text,re,radius=1100,limit=120){const out=[];let m;while((m=re.exec(text))&&out.length<limit)out.push(text.slice(Math.max(0,m.index-radius),Math.min(text.length,m.index+radius)).replace(/\s+/g,' '));return uniq(out)}
async function fetchText(url){const r=await fetch(url,{headers:{'user-agent':UA,'accept':'*/*'},redirect:'follow',signal:AbortSignal.timeout(30000)});return {status:r.status,url:r.url,text:await r.text()}}
async function chromePath(){for(const c of ['google-chrome','google-chrome-stable','chromium','chromium-browser']){try{const {stdout}=await execFileP('which',[c]);if(stdout.trim())return stdout.trim()}catch{}}return null}
const chrome=await chromePath();let dom='',chromeError=null;
if(chrome){try{const r=await execFileP(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-blink-features=AutomationControlled',`--user-agent=${UA}`,'--virtual-time-budget=14000','--dump-dom',TARGET],{maxBuffer:30*1024*1024,timeout:50000});dom=r.stdout||''}catch(e){chromeError=String(e);dom=e?.stdout||''}}
else chromeError='Chrome executable not found';
const scripts=uniq([...dom.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(m=>abs(m[1])));
const preloads=uniq([...dom.matchAll(/<link\b[^>]*\b(?:rel=["'][^"']*(?:modulepreload|preload)[^"']*["'])[^>]*\bhref=["']([^"']+)["']/gi)].map(m=>abs(m[1])));
const assets=[];
for(const url of uniq([...scripts,...preloads]).filter(x=>/\.(?:js|mjs)(?:\?|$)/i.test(x)).slice(0,100)){
  try{const r=await fetchText(url);assets.push({url,status:r.status,length:r.text.length,contexts:contexts(r.text,/(\/api\/|fetch\(|challenge|dzone|battle|replay|profile|clear|team|awakers|build|members|stage_tid|battle_uuid)/ig),urls:uniq([...r.text.matchAll(/["'`](\/?(?:api|u|challenge|battle|profile|rank|rpc|remote)[^"'`\s]{1,260})["'`]/gi)].map(m=>m[1])).slice(0,200)})}catch(error){assets.push({url,error:String(error)})}
}
const payload={fetchedAt:new Date().toISOString(),target:TARGET,chrome,chromeError,domLength:dom.length,title:dom.match(/<title>([^<]+)/i)?.[1]||null,cloudflare:/Just a moment|challenge-platform|cf-chl/i.test(dom),scripts,modulepreloads:preloads,domContexts:contexts(dom,/(battle|damage|team|clear|replay|challenge|d-zone|dzone)/ig,900,100),assets};
await mkdir('data/morimens/eremora',{recursive:true});await writeFile(OUT,JSON.stringify(payload,null,2)+'\n');
console.log(`Challenge browser probe: dom=${dom.length}, scripts=${scripts.length}, assets=${assets.length}, cf=${payload.cloudflare}`);

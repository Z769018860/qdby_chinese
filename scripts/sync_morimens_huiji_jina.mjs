import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

const WIKI='https://morimens.huijiwiki.com';
const JINA='https://r.jina.ai/https://morimens.huijiwiki.com';
const OUT_DIR='data/morimens/huiji';
const SKEYDB_FILE='data/morimens/skeydb/awakeners.json';
const IDENTITY_FILE='data/morimens/huiji/identity.zh-CN.json';
const UA='qdby-chinese-morimens-sync/2.1';
const API_ENDPOINTS=['https://cdn.huijiwiki.com/morimens/api.php','https://morimens.huijiwiki.com/api.php'];
const PROFILE_LABELS={'姓名':'name','英文名':'englishName','界域':'realm','稀有度':'rarity','类型':'type','生日':'birthday','性别':'gender','身高':'height','体重':'weight','诺斯指数':'gnosticIndex','声优':'voiceActor','获取途径':'obtain','所属势力':'faction','阵营':'faction','别称':'aliases'};
const VOICE_HINT=/(唤醒|获得提升|升级|启灵|同调|好感|调查|打击|防御|受击|技能|灵知觉醒|狂气爆发|闲话|闲聊|触摸|触碰|关于|登录|主页|攻击|死亡|胜利|失败|语音|初见)/;

function decodeHtml(s=''){
  const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
  return String(s).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&([a-z]+);/gi,(m,n)=>named[n.toLowerCase()]??m);
}
function clean(s=''){
  return decodeHtml(String(s)).replace(/!\[[^\]]*\]\([^)]*\)/g,' ').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/[\*_`#>~]/g,'').replace(/\s+/g,' ').trim();
}
function normalize(s=''){return String(s).toLowerCase().replace(/[“”"'「」『』·・:：\s_\-]/g,'').replace(/[^a-z0-9\u3400-\u9fff]/g,'')}
async function saveJson(file,data){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(data,null,2)+'\n')}
async function readJson(file){return JSON.parse(await readFile(file,'utf8'))}

async function fetchJson(url,retries=2){
  let last;
  for(let i=0;i<retries;i++){
    try{const r=await fetch(url,{headers:{'User-Agent':UA,'Accept':'application/json'},signal:AbortSignal.timeout(12000)});if(r.ok)return await r.json();last=new Error(`${url}: HTTP ${r.status}`);if(r.status!==429&&r.status<500)break}catch(e){last=e}
    if(i+1<retries)await new Promise(r=>setTimeout(r,600*(i+1)));
  }
  throw last;
}
async function fetchText(url,retries=2){
  let last;
  for(let i=0;i<retries;i++){
    try{const r=await fetch(url,{headers:{'User-Agent':UA,'Accept':'text/plain'},signal:AbortSignal.timeout(15000)});if(r.ok)return await r.text();last=new Error(`${url}: HTTP ${r.status}`);if(r.status!==429&&r.status<500)break}catch(e){last=e}
    if(i+1<retries)await new Promise(r=>setTimeout(r,800*(i+1)));
  }
  throw last;
}
async function fetchParsedPage(title){
  const q=new URLSearchParams({action:'parse',format:'json',formatversion:'2',page:title,prop:'text|wikitext',disablelimitreport:'1'});let last;
  for(const endpoint of API_ENDPOINTS){
    try{const data=await fetchJson(`${endpoint}?${q}`);if(data?.error)throw new Error(`${endpoint}: ${data.error.code||'api-error'} ${data.error.info||''}`);const parsed=data?.parse;if(!parsed)throw new Error(`${endpoint}: missing parse payload`);return {html:typeof parsed.text==='string'?parsed.text:(parsed.text?.['*']||''),wikitext:typeof parsed.wikitext==='string'?parsed.wikitext:(parsed.wikitext?.['*']||''),transport:'mediawiki-api',endpoint}}catch(e){last=e}
  }
  throw last;
}
async function fetchJinaPage(title){
  const url=`${JINA}/wiki/${encodeURIComponent(title)}`;const md=await fetchText(url);
  if(!md||/Warning:\s*Target URL returned error|Page not found|404 Not Found/i.test(md))throw new Error(`${url}: unusable reader response`);
  return {html:'',wikitext:md,transport:'jina-reader',endpoint:url};
}
async function fetchPage(title){try{return await fetchParsedPage(title)}catch(apiError){try{return await fetchJinaPage(title)}catch(jinaError){throw new Error(`API: ${apiError}; Jina: ${jinaError}`)}}}

function htmlRows(html=''){
  const rows=[];for(const tr of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){const cells=[];for(const td of tr[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)){const v=clean(td[1]);if(v)cells.push(v)}if(cells.length>=2)rows.push(cells)}return rows;
}
function markdownRows(md=''){
  const rows=[];for(const line of md.split(/\r?\n/)){const t=line.trim();if(!t.includes('|'))continue;const raw=t.replace(/^\|/,'').replace(/\|$/,'');const cells=raw.split('|').map(clean);if(cells.length<2||cells.every(x=>!x)||cells.every(x=>/^[-: ]+$/.test(x)))continue;rows.push(cells)}return rows;
}
function profileFrom(rows,title,text=''){
  const p={name:title};for(const row of rows){if(row.length<2)continue;const key=clean(row[0]).replace(/\s/g,''),field=PROFILE_LABELS[key];if(field&&!p[field])p[field]=clean(row.slice(1).join(' / '))}
  if(!p.englishName){const m=String(text).match(/(?:英文名|English\s*Name)\s*(?:\||[=：:])\s*([^\n|<]{1,80})/i);if(m)p.englishName=clean(m[1])}return p;
}
function voiceLinesFrom(rows){
  const out=[],seen=new Set();for(const row of rows){if(row.length<2)continue;const title=clean(row[0]),content=clean(row[1]);if(!VOICE_HINT.test(title)||content.length<2||content.length>700||!/[\u3400-\u9fff]/.test(content))continue;const k=`${title}\0${content}`;if(seen.has(k))continue;seen.add(k);out.push({title,content})}return out.slice(0,160);
}
function skillTablesFrom(rows){
  const out=[];let current=null;for(const row of rows){const joined=row.join('|');if(/等级/.test(joined)&&/(描述|效果)/.test(joined)){if(current)out.push(current);current={section:'技能',rows:[row]};continue}if(current){current.rows.push(row);if(current.rows.length>=40){out.push(current);current=null}}}if(current)out.push(current);return out.slice(0,16);
}
function mergeUniqueRows(a,b){const out=[],seen=new Set();for(const row of [...a,...b]){const k=row.join('\0');if(!seen.has(k)){seen.add(k);out.push(row)}}return out}

const skeydb=await readJson(SKEYDB_FILE),identity=await readJson(IDENTITY_FILE);const sourceById=new Map((skeydb.records||[]).map(r=>[r.id,r])),seeds=identity.records||[],identityErrors=[];
for(const seed of seeds){const rec=sourceById.get(seed.skeydbId);if(!rec)identityErrors.push(`unknown SKeyDB id ${seed.skeydbId} (${seed.name})`);else if(normalize(rec.name)!==normalize(seed.englishName)&&!(rec.aliases||[]).some(x=>normalize(x)===normalize(seed.englishName)))identityErrors.push(`${seed.skeydbId}: SKeyDB=${rec.name}, identity=${seed.englishName}`)}
if(seeds.length!==(skeydb.records||[]).length)identityErrors.push(`identity coverage ${seeds.length}/${(skeydb.records||[]).length}`);if(identityErrors.length)throw new Error(`Static Morimens identity map invalid: ${identityErrors.join('; ')}`);

async function enrich(seed){
  const rec=sourceById.get(seed.skeydbId),url=`${WIKI}/wiki/${encodeURIComponent(seed.name)}`;
  try{
    const page=await fetchPage(seed.name),rows=mergeUniqueRows(htmlRows(page.html),markdownRows(page.wikitext)),profile=profileFrom(rows,seed.name,`${page.wikitext}\n${page.html}`);
    const parsedEnglish=normalize(profile.englishName||''),expected=normalize(seed.englishName);if(parsedEnglish&&parsedEnglish!==expected&&!(rec.aliases||[]).some(x=>normalize(x)===parsedEnglish))throw new Error(`English identity mismatch: page=${profile.englishName}, expected=${seed.englishName}`);
    const voices=voiceLinesFrom(rows);return {skeydbId:seed.skeydbId,ingameId:rec.ingameId,slug:rec.slug,name:seed.name,englishName:seed.englishName,profile:{...profile,name:seed.name,englishName:seed.englishName},voiceLines:voices.length?voices:(seed.fallbackVoiceLines||[]),skillTables:skillTablesFrom(rows),source:{url,mode:page.transport,endpoint:page.endpoint},syncStatus:'ok'};
  }catch(error){return {skeydbId:seed.skeydbId,ingameId:rec.ingameId,slug:rec.slug,name:seed.name,englishName:seed.englishName,profile:{name:seed.name,englishName:seed.englishName},voiceLines:seed.fallbackVoiceLines||[],skillTables:[],source:{url,mode:'static-identity'},syncStatus:'fallback',syncError:String(error)}}
}

const records=[];const BATCH=6;for(let i=0;i<seeds.length;i+=BATCH){records.push(...await Promise.all(seeds.slice(i,i+BATCH).map(enrich)));if(i+BATCH<seeds.length)await new Promise(r=>setTimeout(r,200))}
const bySkeydbId=Object.fromEntries(records.map(r=>[r.skeydbId,r])),failed=records.filter(r=>r.syncStatus!=='ok').map(r=>({title:r.name,skeydbId:r.skeydbId,error:r.syncError}));
const voiceRecords=records.filter(r=>r.voiceLines?.length).length,enriched=records.length-failed.length,jinaRecords=records.filter(r=>r.source?.mode==='jina-reader').length;
const source={site:'忘却前夜中文维基',url:`${WIKI}/`,transport:'MediaWiki API / Jina Reader + stable local identity map',syncedAt:new Date().toISOString(),license:'CC-BY-NC-SA-4.0 unless otherwise noted; game-owned assets/text remain with their rights holders'};
const payload={source,count:records.length,mapped:records.length,enriched,jinaRecords,voiceRecords,failed,unmapped:[],records,bySkeydbId};await saveJson(`${OUT_DIR}/zh-CN.json`,payload);await saveJson(`${OUT_DIR}/manifest.json`,{source,status:failed.length?'partial':'ok',counts:{targets:seeds.length,pages:records.length,mapped:records.length,enriched,jinaRecords,voiceRecords,failed:failed.length},paths:{identity:IDENTITY_FILE,zhCN:`${OUT_DIR}/zh-CN.json`}});
console.log(`Morimens zh-CN: identities ${records.length}/${(skeydb.records||[]).length}; enriched ${enriched}; Jina ${jinaRecords}; Chinese voice records ${voiceRecords}; fallbacks ${failed.length}.`);

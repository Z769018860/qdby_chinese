import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

const WIKI='https://morimens.huijiwiki.com';
const JINA='https://r.jina.ai/https://morimens.huijiwiki.com';
const OUT_DIR='data/morimens/huiji';
const SKEYDB_FILE='data/morimens/skeydb/awakeners.json';
const IDENTITY_FILE='data/morimens/huiji/identity.zh-CN.json';
const ZH_FILE=`${OUT_DIR}/zh-CN.json`;
const UA='qdby-chinese-morimens-sync/2.3';
const API_ENDPOINTS=['https://cdn.huijiwiki.com/morimens/api.php','https://morimens.huijiwiki.com/api.php'];
const PROFILE_LABELS={'姓名':'name','英文名':'englishName','界域':'realm','稀有度':'rarity','类型':'type','生日':'birthday','性别':'gender','身高':'height','体重':'weight','诺斯指数':'gnosticIndex','声优':'voiceActor','获取途径':'obtain','所属势力':'faction','阵营':'faction','别称':'aliases'};
const VOICE_TITLE=/^(?:唤醒|获得提升(?:[·・:：\s-]*(?:一|二|三|四|I{1,4}|IV|V))?|升级(?:[·・:：\s-]*(?:一|二|三|四|I{1,4}|IV|V))?|启灵[·・:：\s-].+|同调率[·・:：\s-].+|好感度?[·・:：\s-].+|闲话[·・:：\s-]?.*|闲聊[·・:：\s-]?.*|触摸|触碰|关于.+|登录.*|主页.*|调查(?:开始|成功|中止|失败)|打击.*|防御.*|技能.*|灵知觉醒.*|狂气爆发.*|受击.*|死亡.*|胜利.*|失败.*|初见.*)$/i;
const INVALID_VOICE_TITLE=/(?:调查|守密人)?等级达到\s*\d+\s*解锁|升格条件|等级|升级材料|材料|属性|人格深化|天赋|解锁条件/i;

function decodeHtml(s=''){
  const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
  return String(s).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&([a-z]+);/gi,(m,n)=>named[n.toLowerCase()]??m);
}
function clean(s=''){
  return decodeHtml(String(s)).replace(/!\[[^\]]*\]\([^)]*\)/g,' ').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/[\*_`#>~]/g,'').replace(/\s+/g,' ').trim();
}
function normalize(s=''){return String(s).toLowerCase().replace(/[“”"'「」『』·・:：\s_\-]/g,'').replace(/[^a-z0-9\u3400-\u9fff]/g,'')}
function isRealVoiceLine(line){
  const title=clean(line?.title),content=clean(line?.content);
  return !!(title&&content&&VOICE_TITLE.test(title)&&!INVALID_VOICE_TITLE.test(title)&&content.length>=2&&content.length<=700&&/[\u3400-\u9fff]/.test(content)&&!INVALID_VOICE_TITLE.test(content));
}
function hasChineseVoice(record){return Array.isArray(record?.voiceLines)&&record.voiceLines.some(isRealVoiceLine)}
async function saveJson(file,data){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(data,null,2)+'\n')}
async function readJson(file){return JSON.parse(await readFile(file,'utf8'))}
async function readJsonOr(file,fallback){try{return await readJson(file)}catch{return fallback}}

async function fetchJson(url,retries=2){
  let last;
  for(let i=0;i<retries;i++){
    try{const r=await fetch(url,{headers:{'User-Agent':UA,'Accept':'application/json'},signal:AbortSignal.timeout(12000)});if(r.ok)return await r.json();last=new Error(`${url}: HTTP ${r.status}`);if(r.status!==429&&r.status<500)break}catch(e){last=e}
    if(i+1<retries)await new Promise(r=>setTimeout(r,600*(i+1)));
  }
  throw last;
}
async function fetchText(url,retries=4){
  let last;
  for(let i=0;i<retries;i++){
    try{const r=await fetch(url,{headers:{'User-Agent':UA,'Accept':'text/plain'},signal:AbortSignal.timeout(18000)});if(r.ok)return await r.text();last=new Error(`${url}: HTTP ${r.status}`);if(r.status!==429&&r.status<500)break}catch(e){last=e}
    if(i+1<retries)await new Promise(r=>setTimeout(r,1400*Math.pow(2,i)));
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
function markdownVoiceSection(md=''){
  const lines=String(md).split(/\r?\n/);let start=-1,startLevel=3;
  for(let i=0;i<lines.length;i++){
    const m=lines[i].match(/^\s*(#{2,5})\s*语音(?:\s|$)/);if(m){start=i+1;startLevel=m[1].length;break}
  }
  if(start<0){for(let i=0;i<lines.length;i++){if(/^\s*语音\s*$/.test(clean(lines[i]))){start=i+1;break}}}
  if(start<0)return '';
  let end=lines.length;
  for(let i=start;i<lines.length;i++){
    const h=lines[i].match(/^\s*(#{1,5})\s+(.+)$/);if(h&&h[1].length<=startLevel&&!/^语音(?:\s|$)/.test(clean(h[2]))){end=i;break}
  }
  return lines.slice(start,end).join('\n');
}
function htmlVoiceSection(html=''){
  const source=String(html);const heading=/<h([2-5])\b[^>]*>[\s\S]*?语音[\s\S]*?<\/h\1>/ig;let m;
  while((m=heading.exec(source))){
    const level=Number(m[1]),start=heading.lastIndex;const next=new RegExp(`<h[1-${level}]\\b`,'ig');next.lastIndex=start;const n=next.exec(source);return source.slice(start,n?n.index:source.length)
  }
  return '';
}
function profileFrom(rows,title,text=''){
  const p={name:title};for(const row of rows){if(row.length<2)continue;const key=clean(row[0]).replace(/\s/g,''),field=PROFILE_LABELS[key];if(field&&!p[field])p[field]=clean(row.slice(1).join(' / '))}
  if(!p.englishName){const m=String(text).match(/(?:英文名|English\s*Name)\s*(?:\||[=：:])\s*([^\n|<]{1,80})/i);if(m)p.englishName=clean(m[1])}return p;
}
function voiceLinesFrom(rows){
  const out=[],seen=new Set();for(const row of rows){if(row.length<2)continue;const item={title:clean(row[0]),content:clean(row[1])};if(!isRealVoiceLine(item))continue;const k=`${item.title}\0${item.content}`;if(seen.has(k))continue;seen.add(k);out.push(item)}return out.slice(0,160);
}
function skillTablesFrom(rows){
  const out=[];let current=null;for(const row of rows){const joined=row.join('|');if(/等级/.test(joined)&&/(描述|效果)/.test(joined)){if(current)out.push(current);current={section:'技能',rows:[row]};continue}if(current){current.rows.push(row);if(current.rows.length>=40){out.push(current);current=null}}}if(current)out.push(current);return out.slice(0,16);
}
function mergeUniqueRows(a,b){const out=[],seen=new Set();for(const row of [...a,...b]){const k=row.join('\0');if(!seen.has(k)){seen.add(k);out.push(row)}}return out}

const skeydb=await readJson(SKEYDB_FILE),identity=await readJson(IDENTITY_FILE),previous=await readJsonOr(ZH_FILE,{records:[]});
const sourceById=new Map((skeydb.records||[]).map(r=>[r.id,r])),previousById=new Map((previous.records||[]).map(r=>[r.skeydbId,r])),seeds=identity.records||[],identityErrors=[];
for(const seed of seeds){const rec=sourceById.get(seed.skeydbId);if(!rec)identityErrors.push(`unknown SKeyDB id ${seed.skeydbId} (${seed.name})`);else if(normalize(rec.name)!==normalize(seed.englishName)&&!(rec.aliases||[]).some(x=>normalize(x)===normalize(seed.englishName)))identityErrors.push(`${seed.skeydbId}: SKeyDB=${rec.name}, identity=${seed.englishName}`)}
if(seeds.length!==(skeydb.records||[]).length)identityErrors.push(`identity coverage ${seeds.length}/${(skeydb.records||[]).length}`);if(identityErrors.length)throw new Error(`Static Morimens identity map invalid: ${identityErrors.join('; ')}`);

async function enrich(seed){
  const rec=sourceById.get(seed.skeydbId),url=`${WIKI}/wiki/${encodeURIComponent(seed.name)}`,cached=previousById.get(seed.skeydbId);
  if(process.env.MORIMENS_REFRESH_ALL!=='1'&&cached&&normalize(cached.englishName)===normalize(seed.englishName)&&hasChineseVoice(cached)){
    return {...cached,voiceLines:(cached.voiceLines||[]).filter(isRealVoiceLine),skeydbId:seed.skeydbId,ingameId:rec.ingameId,slug:rec.slug,name:seed.name,englishName:seed.englishName,source:{...(cached.source||{}),url},syncStatus:'cached'};
  }
  try{
    const page=await fetchPage(seed.name),fullRows=mergeUniqueRows(htmlRows(page.html),markdownRows(page.wikitext)),voiceRows=mergeUniqueRows(htmlRows(htmlVoiceSection(page.html)),markdownRows(markdownVoiceSection(page.wikitext))),profile=profileFrom(fullRows,seed.name,`${page.wikitext}\n${page.html}`);
    const parsedEnglish=normalize(profile.englishName||''),expected=normalize(seed.englishName);if(parsedEnglish&&parsedEnglish!==expected&&!(rec.aliases||[]).some(x=>normalize(x)===parsedEnglish))throw new Error(`English identity mismatch: page=${profile.englishName}, expected=${seed.englishName}`);
    const voices=voiceLinesFrom(voiceRows),cachedVoices=(cached?.voiceLines||[]).filter(isRealVoiceLine),fallback=(seed.fallbackVoiceLines||[]).filter(isRealVoiceLine);
    return {skeydbId:seed.skeydbId,ingameId:rec.ingameId,slug:rec.slug,name:seed.name,englishName:seed.englishName,profile:{...profile,name:seed.name,englishName:seed.englishName},voiceLines:voices.length?voices:(cachedVoices.length?cachedVoices:fallback),skillTables:skillTablesFrom(fullRows),source:{url,mode:page.transport,endpoint:page.endpoint},syncStatus:voices.length?'ok':'no-voice'};
  }catch(error){
    const cachedVoices=(cached?.voiceLines||[]).filter(isRealVoiceLine),fallback=(seed.fallbackVoiceLines||[]).filter(isRealVoiceLine);
    if(cachedVoices.length)return {...cached,voiceLines:cachedVoices,skeydbId:seed.skeydbId,ingameId:rec.ingameId,slug:rec.slug,name:seed.name,englishName:seed.englishName,source:{...(cached.source||{}),url},syncStatus:'cached'};
    return {skeydbId:seed.skeydbId,ingameId:rec.ingameId,slug:rec.slug,name:seed.name,englishName:seed.englishName,profile:{name:seed.name,englishName:seed.englishName},voiceLines:fallback,skillTables:[],source:{url,mode:'static-identity'},syncStatus:fallback.length?'fallback-voice':'fallback',syncError:String(error)};
  }
}

const records=[];const BATCH=3;for(let i=0;i<seeds.length;i+=BATCH){records.push(...await Promise.all(seeds.slice(i,i+BATCH).map(enrich)));if(i+BATCH<seeds.length)await new Promise(r=>setTimeout(r,550))}
const bySkeydbId=Object.fromEntries(records.map(r=>[r.skeydbId,r])),failed=records.filter(r=>r.syncStatus==='fallback'||r.syncStatus==='no-voice').map(r=>({title:r.name,skeydbId:r.skeydbId,status:r.syncStatus,error:r.syncError||'No valid rows found in the Voice section'}));
const voiceRecords=records.filter(hasChineseVoice).length,enriched=records.filter(r=>r.syncStatus==='ok'||r.syncStatus==='cached').length,jinaRecords=records.filter(r=>r.source?.mode==='jina-reader').length,cachedRecords=records.filter(r=>r.syncStatus==='cached').length;
const source={site:'忘却前夜中文维基',url:`${WIKI}/`,transport:'MediaWiki API / Jina Reader + Voice-section parser + persistent verified cache + stable local identity map',syncedAt:new Date().toISOString(),license:'CC-BY-NC-SA-4.0 unless otherwise noted; game-owned assets/text remain with their rights holders'};
const payload={source,count:records.length,mapped:records.length,enriched,jinaRecords,cachedRecords,voiceRecords,failed,unmapped:[],records,bySkeydbId};await saveJson(ZH_FILE,payload);await saveJson(`${OUT_DIR}/manifest.json`,{source,status:failed.length?'partial':'ok',counts:{targets:seeds.length,pages:records.length,mapped:records.length,enriched,jinaRecords,cachedRecords,voiceRecords,failed:failed.length},paths:{identity:IDENTITY_FILE,zhCN:ZH_FILE}});
console.log(`Morimens zh-CN: identities ${records.length}/${(skeydb.records||[]).length}; enriched ${enriched}; cached ${cachedRecords}; Jina ${jinaRecords}; VALID Chinese voice records ${voiceRecords}; unresolved ${failed.length}.`);

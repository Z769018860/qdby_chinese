import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

const API='https://morimens.huijiwiki.com/api.php';
const OUT_DIR='data/morimens/huiji';
const SKEYDB_FILE='data/morimens/skeydb/awakeners.json';
const UA='qdby-chinese-morimens-sync/1.0 (+https://github.com/Z769018860/qdby_chinese)';

const PROFILE_LABELS={
  '姓名':'name','英文名':'englishName','界域':'realm','稀有度':'rarity','类型':'type','生日':'birthday','性别':'gender','身高':'height','体重':'weight','诺斯指数':'gnosticIndex','声优':'voiceActor','获取途径':'obtain','所属势力':'faction','别称':'aliases'
};
const VOICE_HINT=/(唤醒|升级|启灵|好感|调查|战斗|闲聊|触碰|关于|登录|主页|攻击|受击|死亡|胜利|失败|狂气|语音|初见)/;
const ENTITY_MAP={'&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'",'&apos;':"'"};

function decodeHtml(s=''){
  return s.replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/g,m=>ENTITY_MAP[m]??m)
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)));
}
function stripHtml(s=''){
  return decodeHtml(s.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());
}
function normalizeName(s=''){
  return String(s).toLowerCase().replace(/[“”"'「」·:：\s_\-]/g,'').replace(/[^a-z0-9\u4e00-\u9fff]/g,'');
}
function apiUrl(params){const u=new URL(API);for(const [k,v] of Object.entries(params))u.searchParams.set(k,String(v));return u}
async function fetchJson(url,retries=3){
  let last;
  for(let i=0;i<retries;i++){
    try{
      const r=await fetch(url,{headers:{'User-Agent':UA,'Accept':'application/json'}});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      return await r.json();
    }catch(e){last=e;await new Promise(r=>setTimeout(r,500*(i+1)))}
  }
  throw last;
}
async function getCategoryMembers(){
  const out=[];let cmcontinue='';
  do{
    const data=await fetchJson(apiUrl({action:'query',format:'json',formatversion:2,list:'categorymembers',cmtitle:'Category:角色',cmnamespace:0,cmlimit:'max',...(cmcontinue?{cmcontinue}:{})}));
    out.push(...(data?.query?.categorymembers||[]).map(x=>x.title));
    cmcontinue=data?.continue?.cmcontinue||'';
  }while(cmcontinue);
  return [...new Set(out)].filter(x=>x&&!/预设|角色搜索/.test(x));
}
async function parsePage(title){
  const data=await fetchJson(apiUrl({action:'parse',format:'json',formatversion:2,page:title,prop:'text|wikitext|revid',redirects:1}));
  return {title:data?.parse?.title||title,revid:data?.parse?.revid||null,html:data?.parse?.text||'',wikitext:data?.parse?.wikitext||''};
}
function extractRows(html){
  const rows=[];for(const m of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
    const cells=[];for(const c of m[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)){const t=stripHtml(c[1]);if(t)cells.push(t)}
    if(cells.length)rows.push(cells);
  }return rows;
}
function extractProfile(rows,title){
  const p={name:title};
  for(const row of rows){
    if(row.length<2)continue;const key=row[0].replace(/\s/g,'');const field=PROFILE_LABELS[key];if(field&&!p[field])p[field]=row.slice(1).join(' / ').trim();
  }
  return p;
}
function extractVoiceLines(rows){
  const seen=new Set(),out=[];
  for(const row of rows){
    if(row.length<2)continue;const title=row[0].trim(),content=row.slice(1).join(' ').trim();
    if(!VOICE_HINT.test(title)||content.length<2||content.length>600)continue;
    const k=`${title}\0${content}`;if(seen.has(k))continue;seen.add(k);out.push({title,content});
  }
  return out.slice(0,120);
}
function extractSkillTables(html){
  const out=[];let lastHeading='';let cursor=0;
  const token=/<h([2-5])\b[^>]*>([\s\S]*?)<\/h\1>|<table\b[^>]*>([\s\S]*?)<\/table>/gi;let m;
  while((m=token.exec(html))){
    cursor=m.index;
    if(m[2]){lastHeading=stripHtml(m[2]).replace(/\[编辑\]/g,'').trim();continue}
    const tableHtml=m[0],rows=extractRows(tableHtml);if(!rows.length)continue;
    const header=rows[0].join('|');if(!/等级/.test(header)||!/(描述|效果)/.test(header))continue;
    out.push({section:lastHeading||'技能',rows:rows.slice(0,30)});
  }
  return out.slice(0,12);
}
function extractSummary(html){
  const text=stripHtml(html).replace(/来自忘却前夜中文维基[\s\S]*$/,'').trim();
  return text.slice(0,10000);
}
async function loadSkeydb(){try{return JSON.parse(await readFile(SKEYDB_FILE,'utf8'))}catch{return {records:[]}}}
function buildIndex(records){
  const map=new Map();for(const r of records){
    const keys=[r.name,r.slug,r.assetSlug,...(r.aliases||[])];for(const k of keys){const n=normalizeName(k);if(n)map.set(n,r)}
  }
  return map;
}
function matchSkeydb(profile,index){
  const candidates=[profile.englishName,profile.name];
  for(const c of candidates){const n=normalizeName(c);if(index.has(n))return index.get(n)}
  const aliases={'jenkin':'jenkins'};const n=normalizeName(profile.englishName);if(aliases[n]&&index.has(aliases[n]))return index.get(aliases[n]);
  return null;
}
async function saveJson(file,data){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(data,null,2)+'\n')}

const skeydb=await loadSkeydb();const index=buildIndex(skeydb.records||[]);
let titles;
try{titles=await getCategoryMembers()}catch(err){
  console.error('Huiji category query failed:',err);
  try{await readFile(`${OUT_DIR}/zh-CN.json`,'utf8');console.warn('Keeping previous Chinese snapshot.');process.exit(0)}catch{throw err}
}
const records=[];const failed=[];
for(let i=0;i<titles.length;i+=6){
  const batch=titles.slice(i,i+6);const results=await Promise.all(batch.map(async title=>{
    try{
      const page=await parsePage(title),rows=extractRows(page.html),profile=extractProfile(rows,page.title),linked=matchSkeydb(profile,index);
      return {ok:true,value:{skeydbId:linked?.id||null,ingameId:linked?.ingameId||null,slug:linked?.slug||null,name:page.title,englishName:profile.englishName||linked?.name||'',profile,voiceLines:extractVoiceLines(rows),skillTables:extractSkillTables(page.html),summary:extractSummary(page.html),source:{url:`https://morimens.huijiwiki.com/wiki/${encodeURIComponent(page.title)}`,revision:page.revid}}};
    }catch(error){return {ok:false,title,error:String(error)}}
  }));
  for(const r of results){if(r.ok)records.push(r.value);else failed.push({title:r.title,error:r.error})}
}
const bySkeydbId=Object.fromEntries(records.filter(r=>r.skeydbId).map(r=>[r.skeydbId,r]));
const payload={source:{site:'忘却前夜中文维基',url:'https://morimens.huijiwiki.com/',syncedAt:new Date().toISOString(),license:'CC-BY-NC-SA-4.0 unless otherwise noted; game-owned assets/text remain with their rights holders'},count:records.length,mapped:Object.keys(bySkeydbId).length,failed,records,bySkeydbId};
await saveJson(`${OUT_DIR}/zh-CN.json`,payload);
await saveJson(`${OUT_DIR}/manifest.json`,{source:payload.source,counts:{pages:records.length,mapped:payload.mapped,failed:failed.length},paths:{zhCN:`${OUT_DIR}/zh-CN.json`}});
console.log(`Synced ${records.length} HuijiWiki character pages; mapped ${payload.mapped}/${(skeydb.records||[]).length} SKeyDB awakeners; failed ${failed.length}.`);

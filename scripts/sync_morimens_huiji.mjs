import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

const API='https://morimens.huijiwiki.com/api.php';
const WIKI='https://morimens.huijiwiki.com';
const JINA='https://r.jina.ai/https://morimens.huijiwiki.com';
const OUT_DIR='data/morimens/huiji';
const SKEYDB_FILE='data/morimens/skeydb/awakeners.json';
const UA='Mozilla/5.0 (compatible; qdby-chinese-morimens-sync/1.2; +https://github.com/Z769018860/qdby_chinese)';

const PROFILE_LABELS={'姓名':'name','英文名':'englishName','界域':'realm','稀有度':'rarity','类型':'type','生日':'birthday','性别':'gender','身高':'height','体重':'weight','诺斯指数':'gnosticIndex','声优':'voiceActor','获取途径':'obtain','所属势力':'faction','别称':'aliases'};
const VOICE_HINT=/(唤醒|升级|启灵|好感|调查|战斗|闲聊|触碰|关于|登录|主页|攻击|受击|死亡|胜利|失败|狂气|语音|初见)/;
const ENTITY_MAP={'&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'",'&apos;':"'"};

function decodeHtml(s=''){return s.replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/g,m=>ENTITY_MAP[m]??m).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)))}
function stripHtml(s=''){return decodeHtml(s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim())}
function stripMarkdown(s=''){return decodeHtml(String(s).replace(/!\[[^\]]*\]\([^)]*\)/g,' ').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[*_`#>~]/g,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim())}
function normalizeName(s=''){return String(s).toLowerCase().replace(/[“”"'「」·:：\s_\-]/g,'').replace(/[^a-z0-9\u4e00-\u9fff]/g,'')}
function apiUrl(params){const u=new URL(API);for(const [k,v] of Object.entries(params))u.searchParams.set(k,String(v));return u}
function jinaUrl(pathname){return `${JINA}${pathname}`}
async function fetchText(url,retries=3){let last;for(let i=0;i<retries;i++){try{const r=await fetch(url,{headers:{'User-Agent':UA,'Accept':'text/html,text/plain,application/json;q=0.9,*/*;q=0.8'}});if(!r.ok)throw new Error(`${url}: HTTP ${r.status}`);return await r.text()}catch(e){last=e;await new Promise(r=>setTimeout(r,800*(i+1)))}}throw last}
async function fetchJson(url,retries=2){const text=await fetchText(url,retries);try{return JSON.parse(text)}catch{throw new Error(`${url}: expected JSON but received ${text.slice(0,80).replace(/\s+/g,' ')}`)}}

async function getCategoryMembersApi(){
  const out=[];let cmcontinue='';
  do{
    const data=await fetchJson(apiUrl({action:'query',format:'json',formatversion:2,list:'categorymembers',cmtitle:'Category:角色',cmnamespace:0,cmlimit:'max',...(cmcontinue?{cmcontinue}:{})}));
    out.push(...(data?.query?.categorymembers||[]).map(x=>x.title));
    cmcontinue=data?.continue?.cmcontinue||'';
  }while(cmcontinue);
  return [...new Set(out)].filter(x=>x&&!/预设|角色搜索/.test(x));
}
function titlesFromHtml(html){
  const start=html.search(/id=["']mw-pages["']/i);const sub=html.indexOf('id="mw-subcategories"',start);const scope=start>=0?html.slice(start,sub>start?sub:undefined):html;const titles=[];
  for(const m of scope.matchAll(/<a\b[^>]*href=["']\/wiki\/([^"'#?]+)["'][^>]*(?:title=["']([^"']+)["'])?[^>]*>/gi)){
    let title=m[2]||m[1];try{title=decodeURIComponent(title.replace(/_/g,' '))}catch{}title=decodeHtml(title).trim();if(!title||/^(分类|模板|文件|特殊|帮助|MediaWiki):/.test(title)||/预设|角色搜索|唤醒体$/.test(title))continue;titles.push(title);
  }
  return [...new Set(titles)];
}
function titlesFromMarkdown(md){
  const titles=[];
  for(const m of md.matchAll(/\[([^\]]+)\]\(https?:\/\/morimens\.huijiwiki\.com\/wiki\/[^)#?]+(?:#[^)]*)?\)/g)){
    const title=stripMarkdown(m[1]);if(!title||/^(分类|模板|文件|特殊|帮助|MediaWiki):/.test(title)||/预设|角色搜索|唤醒体$/.test(title))continue;titles.push(title);
  }
  return [...new Set(titles)];
}
async function getCategoryMembers(){
  try{const x=await getCategoryMembersApi();if(x.length>20)return x;throw new Error(`API returned only ${x.length} members`)}catch(e){console.warn('Huiji API category query unavailable:',String(e))}
  try{const html=await fetchText(`${WIKI}/wiki/${encodeURIComponent('分类:角色')}`);const x=titlesFromHtml(html);if(x.length>20)return x;throw new Error(`HTML returned only ${x.length} members`)}catch(e){console.warn('Huiji rendered category page unavailable:',String(e))}
  const md=await fetchText(jinaUrl(`/wiki/${encodeURIComponent('分类:角色')}`));const x=titlesFromMarkdown(md);if(x.length<20)throw new Error(`Jina category mirror returned only ${x.length} members`);return x;
}

async function parsePage(title){
  try{const data=await fetchJson(apiUrl({action:'parse',format:'json',formatversion:2,page:title,prop:'text|wikitext|revid',redirects:1}));if(data?.parse?.text)return {title:data.parse.title||title,revid:data.parse.revid||null,body:data.parse.text,mode:'api',format:'html'}}catch(e){console.warn(`Huiji API parse unavailable for ${title}:`,String(e))}
  try{const html=await fetchText(`${WIKI}/wiki/${encodeURIComponent(title)}`);return {title,revid:null,body:html,mode:'html',format:'html'}}catch(e){console.warn(`Huiji rendered page unavailable for ${title}:`,String(e))}
  const md=await fetchText(jinaUrl(`/wiki/${encodeURIComponent(title)}`));return {title,revid:null,body:md,mode:'jina',format:'markdown'};
}

function extractHtmlRows(html){const rows=[];for(const m of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){const cells=[];for(const c of m[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)){const t=stripHtml(c[1]);if(t)cells.push(t)}if(cells.length)rows.push(cells)}return rows}
function extractMarkdownRows(md){
  const rows=[];for(const line of md.split(/\r?\n/)){const t=line.trim();if(!t.startsWith('|')||!t.endsWith('|'))continue;const cells=t.slice(1,-1).split('|').map(stripMarkdown).filter(Boolean);if(!cells.length||cells.every(x=>/^[-:]+$/.test(x)))continue;rows.push(cells)}return rows;
}
function extractRows(page){return page.format==='markdown'?extractMarkdownRows(page.body):extractHtmlRows(page.body)}
function extractProfile(rows,title){const p={name:title};for(const row of rows){if(row.length<2)continue;const key=row[0].replace(/\s/g,'');const field=PROFILE_LABELS[key];if(field&&!p[field])p[field]=row.slice(1).join(' / ').trim()}return p}
function extractVoiceLines(rows){const seen=new Set(),out=[];for(const row of rows){if(row.length<2)continue;const title=row[0].trim(),content=row.slice(1).join(' ').trim();if(!VOICE_HINT.test(title)||content.length<2||content.length>600)continue;const k=`${title}\0${content}`;if(seen.has(k))continue;seen.add(k);out.push({title,content})}return out.slice(0,120)}
function extractSkillTables(page){
  if(page.format==='markdown'){
    const rows=extractMarkdownRows(page.body),out=[];let current=[];for(const row of rows){if(/等级/.test(row.join('|'))&&/(描述|效果)/.test(row.join('|'))){if(current.length)out.push({section:'技能',rows:current});current=[row]}else if(current.length){current.push(row);if(current.length>=30){out.push({section:'技能',rows:current});current=[]}}}if(current.length)out.push({section:'技能',rows:current});return out.slice(0,12);
  }
  const out=[];let lastHeading='';const token=/<h([2-5])\b[^>]*>([\s\S]*?)<\/h\1>|<table\b[^>]*>([\s\S]*?)<\/table>/gi;let m;while((m=token.exec(page.body))){if(m[2]){lastHeading=stripHtml(m[2]).replace(/\[编辑\]/g,'').trim();continue}const rows=extractHtmlRows(m[0]);if(!rows.length)continue;const header=rows[0].join('|');if(!/等级/.test(header)||!/(描述|效果)/.test(header))continue;out.push({section:lastHeading||'技能',rows:rows.slice(0,30)})}return out.slice(0,12);
}
function extractSummary(page){const text=page.format==='markdown'?stripMarkdown(page.body):stripHtml(page.body);return text.replace(/来自忘却前夜中文维基[\s\S]*$/,'').slice(0,10000)}
async function loadSkeydb(){try{return JSON.parse(await readFile(SKEYDB_FILE,'utf8'))}catch{return {records:[]}}}
function buildIndex(records){const map=new Map();for(const r of records){for(const k of [r.name,r.slug,r.assetSlug,...(r.aliases||[])]){const n=normalizeName(k);if(n)map.set(n,r)}}return map}
function matchSkeydb(profile,index){for(const c of [profile.englishName,profile.name]){const n=normalizeName(c);if(index.has(n))return index.get(n)}const aliases={'jenkin':'jenkins'};const n=normalizeName(profile.englishName);if(aliases[n]&&index.has(aliases[n]))return index.get(aliases[n]);return null}
async function saveJson(file,data){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(data,null,2)+'\n')}

const skeydb=await loadSkeydb();const index=buildIndex(skeydb.records||[]);let titles;
try{titles=await getCategoryMembers();if(titles.length<20)throw new Error(`Only ${titles.length} character pages discovered`)}catch(err){
  console.error('Huiji character discovery failed:',err);
  try{await readFile(`${OUT_DIR}/zh-CN.json`,'utf8');console.warn('Keeping previous Chinese snapshot.');process.exit(0)}catch{}
  await saveJson(`${OUT_DIR}/manifest.json`,{source:{site:'忘却前夜中文维基',url:`${WIKI}/`,syncedAt:new Date().toISOString()},status:'unavailable',error:String(err),counts:{pages:0,mapped:0,failed:0}});process.exit(0);
}

const records=[],failed=[];
for(let i=0;i<titles.length;i+=4){
  const batch=titles.slice(i,i+4);
  const results=await Promise.all(batch.map(async title=>{
    try{const page=await parsePage(title);const rows=extractRows(page);const profile=extractProfile(rows,page.title);const linked=matchSkeydb(profile,index);return {ok:true,value:{skeydbId:linked?.id||null,ingameId:linked?.ingameId||null,slug:linked?.slug||null,name:page.title,englishName:profile.englishName||linked?.name||'',profile,voiceLines:extractVoiceLines(rows),skillTables:extractSkillTables(page),summary:extractSummary(page),source:{url:`${WIKI}/wiki/${encodeURIComponent(page.title)}`,revision:page.revid,mode:page.mode}}}}catch(error){return {ok:false,title,error:String(error)}}
  }));
  for(const result of results){if(result.ok)records.push(result.value);else failed.push({title:result.title,error:result.error})}
  await new Promise(r=>setTimeout(r,250));
}
const bySkeydbId=Object.fromEntries(records.filter(r=>r.skeydbId).map(r=>[r.skeydbId,r]));
const payload={source:{site:'忘却前夜中文维基',url:`${WIKI}/`,syncedAt:new Date().toISOString(),license:'CC-BY-NC-SA-4.0 unless otherwise noted; game-owned assets/text remain with their rights holders'},count:records.length,mapped:Object.keys(bySkeydbId).length,failed,records,bySkeydbId};
await saveJson(`${OUT_DIR}/zh-CN.json`,payload);await saveJson(`${OUT_DIR}/manifest.json`,{source:payload.source,status:'ok',counts:{pages:records.length,mapped:payload.mapped,failed:failed.length},paths:{zhCN:`${OUT_DIR}/zh-CN.json`}});
console.log(`Synced ${records.length} HuijiWiki character pages; mapped ${payload.mapped}/${(skeydb.records||[]).length} SKeyDB awakeners; failed ${failed.length}.`);

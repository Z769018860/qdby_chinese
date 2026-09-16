import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

const WIKI='https://morimens.huijiwiki.com';
const JINA='https://r.jina.ai/https://morimens.huijiwiki.com';
const OUT_DIR='data/morimens/huiji';
const SKEYDB_FILE='data/morimens/skeydb/awakeners.json';
const UA='qdby-chinese-morimens-sync/1.0';
const PROFILE_LABELS={'姓名':'name','英文名':'englishName','界域':'realm','稀有度':'rarity','类型':'type','生日':'birthday','性别':'gender','身高':'height','体重':'weight','诺斯指数':'gnosticIndex','声优':'voiceActor','获取途径':'obtain','所属势力':'faction','别称':'aliases'};
const VOICE_HINT=/(唤醒|升级|启灵|好感|调查|战斗|闲聊|触碰|关于|登录|主页|攻击|受击|死亡|胜利|失败|狂气|语音|初见)/;

function clean(s=''){
  return String(s).replace(/!\[[^\]]*\]\([^)]*\)/g,' ').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/<[^>]+>/g,' ').replace(/[*_`#>~]/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
}
function normalize(s=''){return String(s).toLowerCase().replace(/[“”"'「」·:：\s_\-]/g,'').replace(/[^a-z0-9\u4e00-\u9fff]/g,'')}
async function fetchText(url,retries=2){
  let last;
  for(let i=0;i<retries;i++){
    try{
      const r=await fetch(url,{headers:{'User-Agent':UA,'Accept':'text/plain'},signal:AbortSignal.timeout(20000)});
      if(!r.ok)throw new Error(`${url}: HTTP ${r.status}`);
      return await r.text();
    }catch(e){last=e;if(i+1<retries)await new Promise(r=>setTimeout(r,1200*(i+1)))}
  }
  throw last;
}
async function saveJson(file,data){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(data,null,2)+'\n')}
async function loadSkeydb(){try{return JSON.parse(await readFile(SKEYDB_FILE,'utf8'))}catch{return {records:[]}}}
function markdownRows(md){
  const rows=[];
  for(const line of md.split(/\r?\n/)){
    const t=line.trim();if(!t.startsWith('|')||!t.endsWith('|'))continue;
    const cells=t.slice(1,-1).split('|').map(clean).filter(Boolean);
    if(!cells.length||cells.every(x=>/^[-:]+$/.test(x)))continue;
    rows.push(cells);
  }
  return rows;
}
function categoryTitles(md){
  const out=[];
  for(const m of md.matchAll(/\[([^\]]+)\]\((https?:\/\/morimens\.huijiwiki\.com\/wiki\/[^)#?]+)(?:#[^)]*)?\)/g)){
    const name=clean(m[1]);
    if(!name||/^(分类|模板|文件|特殊|帮助|MediaWiki):/.test(name)||/预设|角色搜索|唤醒体$/.test(name))continue;
    out.push(name);
  }
  return [...new Set(out)];
}
function profileFrom(rows,title){
  const p={name:title};
  for(const row of rows){if(row.length<2)continue;const key=row[0].replace(/\s/g,'');const field=PROFILE_LABELS[key];if(field&&!p[field])p[field]=row.slice(1).join(' / ').trim()}
  return p;
}
function voiceLinesFrom(rows){
  const out=[],seen=new Set();
  for(const row of rows){if(row.length<2)continue;const title=row[0].trim(),content=row.slice(1).join(' ').trim();if(!VOICE_HINT.test(title)||content.length<2||content.length>600)continue;const k=`${title}\0${content}`;if(seen.has(k))continue;seen.add(k);out.push({title,content})}
  return out.slice(0,120);
}
function skillTablesFrom(rows){
  const out=[];let current=null;
  for(const row of rows){const joined=row.join('|');if(/等级/.test(joined)&&/(描述|效果)/.test(joined)){if(current)out.push(current);current={section:'技能',rows:[row]};continue}if(current){current.rows.push(row);if(current.rows.length>=30){out.push(current);current=null}}}
  if(current)out.push(current);return out.slice(0,12);
}
function buildIndex(records){
  const map=new Map();for(const r of records){for(const key of [r.name,r.slug,r.assetSlug,...(r.aliases||[])]){const n=normalize(key);if(n)map.set(n,r)}}return map;
}
function match(profile,index){
  for(const value of [profile.englishName,profile.name]){const n=normalize(value);if(index.has(n))return index.get(n)}
  const aliases={jenkin:'jenkins'};const n=normalize(profile.englishName);return aliases[n]?index.get(aliases[n])||null:null;
}

const skeydb=await loadSkeydb();
const index=buildIndex(skeydb.records||[]);
let titles=[];
try{
  const category=await fetchText(`${JINA}/wiki/${encodeURIComponent('分类:角色')}`);
  titles=categoryTitles(category);
  if(titles.length<20)throw new Error(`Jina category page exposed only ${titles.length} character links`);
}catch(error){
  console.warn('HuijiWiki/Jina snapshot unavailable:',String(error));
  try{await readFile(`${OUT_DIR}/zh-CN.json`,'utf8');console.warn('Keeping previous zh-CN snapshot.');process.exit(0)}catch{}
  await saveJson(`${OUT_DIR}/manifest.json`,{source:{site:'忘却前夜中文维基',url:`${WIKI}/`,transport:'Jina Reader',syncedAt:new Date().toISOString()},status:'unavailable',error:String(error),counts:{pages:0,mapped:0,failed:0}});
  process.exit(0);
}

const records=[],failed=[];
for(let i=0;i<titles.length;i+=5){
  const batch=titles.slice(i,i+5);
  const results=await Promise.all(batch.map(async title=>{
    try{
      const md=await fetchText(`${JINA}/wiki/${encodeURIComponent(title)}`);
      const rows=markdownRows(md),profile=profileFrom(rows,title),linked=match(profile,index);
      return {ok:true,value:{
        skeydbId:linked?.id||null,ingameId:linked?.ingameId||null,slug:linked?.slug||null,
        name:title,englishName:profile.englishName||linked?.name||'',profile,
        voiceLines:voiceLinesFrom(rows),skillTables:skillTablesFrom(rows),summary:clean(md).slice(0,10000),
        source:{url:`${WIKI}/wiki/${encodeURIComponent(title)}`,mode:'jina'}
      }};
    }catch(error){return {ok:false,title,error:String(error)}}
  }));
  for(const result of results){if(result.ok)records.push(result.value);else failed.push({title:result.title,error:result.error})}
  await new Promise(r=>setTimeout(r,250));
}
const bySkeydbId=Object.fromEntries(records.filter(r=>r.skeydbId).map(r=>[r.skeydbId,r]));
const source={site:'忘却前夜中文维基',url:`${WIKI}/`,transport:'Jina Reader',syncedAt:new Date().toISOString(),license:'CC-BY-NC-SA-4.0 unless otherwise noted; game-owned assets/text remain with their rights holders'};
const payload={source,count:records.length,mapped:Object.keys(bySkeydbId).length,failed,records,bySkeydbId};
await saveJson(`${OUT_DIR}/zh-CN.json`,payload);
await saveJson(`${OUT_DIR}/manifest.json`,{source,status:'ok',counts:{pages:records.length,mapped:payload.mapped,failed:failed.length},paths:{zhCN:`${OUT_DIR}/zh-CN.json`}});
console.log(`Synced ${records.length} HuijiWiki pages through Jina; mapped ${payload.mapped}/${(skeydb.records||[]).length}; failed ${failed.length}.`);

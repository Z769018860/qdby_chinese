import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

const WIKI='https://morimens.huijiwiki.com';
const JINA='https://r.jina.ai/https://morimens.huijiwiki.com';
const OUT_DIR='data/morimens/huiji';
const SKEYDB_FILE='data/morimens/skeydb/awakeners.json';
const UA='qdby-chinese-morimens-sync/1.3';
const PROFILE_LABELS={'姓名':'name','英文名':'englishName','界域':'realm','稀有度':'rarity','类型':'type','生日':'birthday','性别':'gender','身高':'height','体重':'weight','诺斯指数':'gnosticIndex','声优':'voiceActor','获取途径':'obtain','所属势力':'faction','阵营':'faction','别称':'aliases'};
const VOICE_HINT=/(唤醒|升级|启灵|好感|调查|战斗|闲聊|触碰|关于|登录|主页|攻击|受击|死亡|胜利|失败|狂气|语音|初见)/;

function clean(s=''){
  return String(s).replace(/!\[[^\]]*\]\([^)]*\)/g,' ').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/<[^>]+>/g,' ').replace(/[\*_`#>~]/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
}
function normalize(s=''){return String(s).toLowerCase().replace(/[“”"'「」『』·・:：\s_\-]/g,'').replace(/[^a-z0-9\u3400-\u9fff]/g,'')}
async function fetchText(url,retries=5){
  let last;
  for(let i=0;i<retries;i++){
    try{
      const r=await fetch(url,{headers:{'User-Agent':UA,'Accept':'text/plain'},signal:AbortSignal.timeout(25000)});
      if(r.ok)return await r.text();
      last=new Error(`${url}: HTTP ${r.status}`);
      if(r.status!==429&&r.status<500)throw last;
    }catch(e){last=e}
    if(i+1<retries)await new Promise(r=>setTimeout(r,1500*Math.pow(2,i)));
  }
  throw last;
}
async function saveJson(file,data){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(data,null,2)+'\n')}
async function loadSkeydb(){try{return JSON.parse(await readFile(SKEYDB_FILE,'utf8'))}catch{return {records:[]}}}

function markdownRows(md){
  const rows=[];
  for(const line of md.split(/\r?\n/)){
    const t=line.trim();if(!t.includes('|'))continue;
    const raw=t.replace(/^\|/,'').replace(/\|$/,'');const cells=raw.split('|').map(clean);
    if(cells.length<2||cells.every(x=>!x)||cells.every(x=>/^[-: ]+$/.test(x)))continue;
    rows.push(cells);
  }
  return rows;
}
function profileFrom(rows,title,md){
  const p={name:title};
  for(const row of rows){if(row.length<2)continue;const key=clean(row[0]).replace(/\s/g,'');const field=PROFILE_LABELS[key];if(field&&!p[field])p[field]=clean(row.slice(1).join(' / '))}
  if(!p.englishName){const m=md.match(/(?:^|\n)\s*英文名\s*[|：:]\s*([^\n|]{1,80})/);if(m)p.englishName=clean(m[1])}
  return p;
}
function voiceLinesFrom(rows){
  const out=[],seen=new Set();for(const row of rows){if(row.length<2)continue;const title=clean(row[0]),content=clean(row.slice(1).join(' '));if(!VOICE_HINT.test(title)||content.length<2||content.length>600)continue;const k=`${title}\0${content}`;if(seen.has(k))continue;seen.add(k);out.push({title,content})}return out.slice(0,120);
}
function skillTablesFrom(rows){
  const out=[];let current=null;for(const row of rows){const joined=row.join('|');if(/等级/.test(joined)&&/(描述|效果)/.test(joined)){if(current)out.push(current);current={section:'技能',rows:[row]};continue}if(current){current.rows.push(row);if(current.rows.length>=30){out.push(current);current=null}}}if(current)out.push(current);return out.slice(0,12);
}
function buildIndex(records){
  const map=new Map();
  for(const r of records){for(const key of [r.name,r.slug,r.assetSlug,...(r.aliases||[])]){const n=normalize(key);if(n)map.set(n,r)}}
  return map;
}
function match(profile,index){
  for(const value of [profile.englishName,profile.name]){const n=normalize(value);if(n&&index.has(n))return index.get(n)}
  const aliases={jenkin:'jenkins',jenkins:'jenkin'};const n=normalize(profile.englishName);return aliases[n]?index.get(aliases[n])||null:null;
}

// The rendered index is used only to discover Chinese page titles. Its visual order must
// never define the SKeyDB identity: variants/reorders in Huiji cards can change at any time.
function targetsFromAwakenerIndex(md,skeydbRecords){
  const text=clean(md),lower=text.toLowerCase(),targets=[],used=new Set();
  const cn=/([「『“]?[\u3400-\u9fff]{1,12}(?:[·・][\u3400-\u9fff]{1,12})?[」』”]?)/;
  for(const rec of skeydbRecords){
    if(normalize(rec.name)==='24'){targets.push({title:'「24」',hintId:rec.id,method:'special'});used.add('「24」');continue}
    const candidates=[rec.name,...(rec.aliases||[])].filter(x=>/[a-z]/i.test(String(x))).sort((a,b)=>String(b).length-String(a).length);
    let title='';
    for(const candidateRaw of candidates){
      const candidate=String(candidateRaw).replace(/^['"]|['"]$/g,'').trim();if(candidate.length<3)continue;
      let pos=lower.indexOf(candidate.toLowerCase());
      while(pos>=0){
        const tail=text.slice(pos+candidate.length,pos+candidate.length+70);const m=tail.match(cn);
        if(m){const found=clean(m[1]);if(found&&!used.has(found)&&found.length<=20){title=found;break}}
        pos=lower.indexOf(candidate.toLowerCase(),pos+candidate.length);
      }
      if(title)break;
    }
    if(title){targets.push({title,hintId:rec.id,method:'awakener-index'});used.add(title)}
  }
  return targets;
}
function categoryTitles(md){
  const out=[];const start=md.search(/分类[“\"]角色[”\"]中的页面|分类“角色”中的页面/);let scope=start>=0?md.slice(start):md;const end=scope.search(/来自忘却前夜中文维基/);if(end>0)scope=scope.slice(0,end);
  for(const m of scope.matchAll(/(?:^|\n)\s*[*+-]\s+(?:\[)?([^\]\n(]{1,24})(?:\]\([^)]*\))?/g)){const name=clean(m[1]);if(!name||/预设|角色搜索|唤醒体$/.test(name)||/^[A-Z0-9~]+$/i.test(name))continue;out.push(name)}
  return [...new Set(out)];
}

const skeydb=await loadSkeydb();const index=buildIndex(skeydb.records||[]);let targets=[];
try{
  const awakenerIndex=await fetchText(`${JINA}/wiki/${encodeURIComponent('唤醒体')}`);
  targets=targetsFromAwakenerIndex(awakenerIndex,skeydb.records||[]);
  console.log(`Discovered ${targets.length}/${(skeydb.records||[]).length} Huiji character page titles from the awakener index.`);
  if(targets.length<40){
    const category=await fetchText(`${JINA}/wiki/${encodeURIComponent('分类:角色')}`);const existing=new Set(targets.map(x=>x.title));
    for(const title of categoryTitles(category)){if(existing.has(title))continue;targets.push({title,hintId:null,method:'category'});existing.add(title)}
  }
  if(targets.length<20)throw new Error(`Huiji index discovery exposed only ${targets.length} character pages`);
}catch(error){
  console.warn('HuijiWiki/Jina snapshot unavailable:',String(error));try{await readFile(`${OUT_DIR}/zh-CN.json`,'utf8');console.warn('Keeping previous zh-CN snapshot.');process.exit(0)}catch{}
  await saveJson(`${OUT_DIR}/manifest.json`,{source:{site:'忘却前夜中文维基',url:`${WIKI}/`,transport:'Jina Reader',syncedAt:new Date().toISOString()},status:'unavailable',error:String(error),counts:{pages:0,mapped:0,failed:0}});process.exit(0);
}

const records=[],failed=[],corrections=[],usedIds=new Set();
for(const target of targets){
  const {title}=target;
  try{
    const md=await fetchText(`${JINA}/wiki/${encodeURIComponent(title)}`);if(/Warning:\s*Target URL returned error 404/i.test(md))throw new Error('Wiki page returned 404');
    const rows=markdownRows(md),profile=profileFrom(rows,title,md);
    // Authoritative join: every Huiji page is matched back to SKeyDB by that page's own
    // English-name field (plus SKeyDB aliases/assetSlug). The index-derived id is only a hint.
    let linked=match(profile,index);
    if(!linked&&!profile.englishName&&target.hintId)linked=(skeydb.records||[]).find(x=>x.id===target.hintId)||null;
    if(!linked)throw new Error(`Cannot map Wiki page to SKeyDB from English name: ${profile.englishName||'(missing)'}`);
    if(usedIds.has(linked.id))throw new Error(`Duplicate SKeyDB mapping for ${linked.id} (${linked.name})`);
    usedIds.add(linked.id);
    if(target.hintId&&target.hintId!==linked.id)corrections.push({title,from:target.hintId,to:linked.id,englishName:profile.englishName||''});
    records.push({skeydbId:linked.id,ingameId:linked.ingameId||null,slug:linked.slug||null,name:title,englishName:profile.englishName||linked.name||'',profile,voiceLines:voiceLinesFrom(rows),skillTables:skillTablesFrom(rows),summary:clean(md).slice(0,10000),source:{url:`${WIKI}/wiki/${encodeURIComponent(title)}`,mode:'jina',mapping:'page-english-name'}});
  }catch(error){failed.push({title,hintId:target.hintId||null,error:String(error)})}
  await new Promise(r=>setTimeout(r,900));
}
const bySkeydbId=Object.fromEntries(records.map(r=>[r.skeydbId,r]));const unmapped=records.filter(r=>!r.skeydbId).map(r=>({name:r.name,englishName:r.englishName||''}));
const missingSkeydb=(skeydb.records||[]).filter(r=>!bySkeydbId[r.id]).map(r=>({id:r.id,name:r.name,assetSlug:r.assetSlug}));
const source={site:'忘却前夜中文维基',url:`${WIKI}/`,transport:'Jina Reader',syncedAt:new Date().toISOString(),license:'CC-BY-NC-SA-4.0 unless otherwise noted; game-owned assets/text remain with their rights holders'};
const payload={source,count:records.length,mapped:Object.keys(bySkeydbId).length,failed,unmapped,missingSkeydb,corrections,records,bySkeydbId};

// Never replace a known snapshot with a deceptively "60/60" but identity-shifted one.
if(records.length!==(skeydb.records||[]).length||Object.keys(bySkeydbId).length!==(skeydb.records||[]).length||failed.length||missingSkeydb.length){
  const report={source,status:'rejected',counts:{targets:targets.length,pages:records.length,mapped:Object.keys(bySkeydbId).length,missing:missingSkeydb.length,failed:failed.length},failed,missingSkeydb,corrections};
  await saveJson(`${OUT_DIR}/last-sync-error.json`,report);
  throw new Error(`Huiji identity validation failed: pages=${records.length}, mapped=${Object.keys(bySkeydbId).length}, expected=${(skeydb.records||[]).length}, failed=${failed.length}, missing=${missingSkeydb.length}`);
}
await saveJson(`${OUT_DIR}/zh-CN.json`,payload);
await saveJson(`${OUT_DIR}/manifest.json`,{source,status:'ok',counts:{targets:targets.length,pages:records.length,mapped:payload.mapped,unmapped:unmapped.length,failed:failed.length,correctedHints:corrections.length},paths:{zhCN:`${OUT_DIR}/zh-CN.json`}});
console.log(`Synced ${records.length} HuijiWiki pages; authoritative identity map ${payload.mapped}/${(skeydb.records||[]).length}; corrected ${corrections.length} index hints; failed ${failed.length}.`);

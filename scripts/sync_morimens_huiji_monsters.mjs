// Sync monster pages (怪物) from the Morimens HuijiWiki through its MediaWiki API (api.php).
// Huiji content is CC BY-NC-SA; keep attribution when reusing. Output: data/morimens/huiji/monsters.json
// Usage: node scripts/sync_morimens_huiji_monsters.mjs   (set HUIJI_API to override the endpoint list)
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';

const ENDPOINTS=(process.env.HUIJI_API?process.env.HUIJI_API.split(','):['https://morimens.huijiwiki.com/api.php','https://cdn.huijiwiki.com/morimens/api.php']);
const OUT='data/morimens/huiji/monsters.json';
const UA='Mozilla/5.0 (compatible; qdby-chinese-morimens-sync/1.3; +https://github.com/Z769018860/qdby_chinese)';
const ROOT_PAGE='怪物';

async function api(params,retries=3){
  const q=new URLSearchParams({format:'json',formatversion:'2',...params});let last;
  for(const base of ENDPOINTS){
    for(let i=0;i<retries;i++){
      try{
        const r=await fetch(`${base}?${q}`,{headers:{'User-Agent':UA,'Accept':'application/json'},signal:AbortSignal.timeout(25000)});
        if(r.ok){const j=await r.json();if(j.error)throw new Error(`${j.error.code}: ${j.error.info}`);return j}
        last=new Error(`${base}: HTTP ${r.status}`);if(r.status!==429&&r.status<500)break;
      }catch(e){last=e}
      await new Promise(r=>setTimeout(r,1200*(i+1)));
    }
  }
  throw last;
}
const decode=s=>String(s).replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
const text=h=>decode(String(h).replace(/<(script|style)\b[\s\S]*?<\/\1>/gi,' ').replace(/<br\s*\/?>/gi,'\n').replace(/<\/(p|div|tr|li|h\d)>/gi,'\n').replace(/<[^>]+>/g,' ')).replace(/[ \t]+/g,' ').replace(/\n\s*\n+/g,'\n').trim();

// Collect candidate monster titles: links on the 怪物 page + members of Category:怪物.
const titles=new Set();
try{
  const p=await api({action:'parse',page:ROOT_PAGE,prop:'links'});
  for(const l of p.parse?.links||[]) if(l.ns===0&&l.exists!==false) titles.add(l.title);
}catch(e){console.warn('root page links failed:',e.message)}
for(const cat of ['Category:怪物','Category:敌人']){
  let cont='';
  try{
    do{
      const r=await api({action:'query',list:'categorymembers',cmtitle:cat,cmnamespace:0,cmlimit:'max',...(cont?{cmcontinue:cont}:{})});
      for(const m of r.query?.categorymembers||[]) titles.add(m.title);
      cont=r.continue?.cmcontinue||'';
    }while(cont);
  }catch(e){console.warn(`${cat} failed:`,e.message)}
}
titles.delete(ROOT_PAGE);
const list=[...titles];
if(!list.length) throw new Error('no monster titles found; check the API endpoint / page name');

const records=[];
for(let i=0;i<list.length;i+=40){
  const batch=list.slice(i,i+40);
  const r=await api({action:'query',prop:'revisions',rvprop:'content|timestamp',rvslots:'main',titles:batch.join('|'),redirects:'1'});
  for(const pg of r.query?.pages||[]){
    if(pg.missing) continue;
    const rev=pg.revisions?.[0];const wikitext=rev?.slots?.main?.content??rev?.content??'';
    // template parameters: {{Template|key=value|...}} -> flat fields (first template only; raw wikitext is kept for re-parsing)
    const fields={};
    const tpl=/\{\{([^{}|]+)((?:\|[^{}]*?)+)\}\}/.exec(wikitext);
    if(tpl) for(const part of tpl[2].split(/\|(?=\s*[^=|]+=)/)){const m=/^\s*([^=]+?)\s*=\s*([\s\S]*?)\s*$/.exec(part.replace(/^\|/,''));if(m)fields[m[1]]=m[2]}
    records.push({title:pg.title,template:tpl?.[1]?.trim()||null,fields,wikitext,revisionTimestamp:rev?.timestamp||null});
  }
}
await mkdir(path.dirname(OUT),{recursive:true});
await writeFile(OUT,JSON.stringify({
  source:{site:'https://morimens.huijiwiki.com/',api:ENDPOINTS[0],page:ROOT_PAGE,license:'CC BY-NC-SA (HuijiWiki community content)',retrievedAt:new Date().toISOString()},
  count:records.length,records
},null,2)+'\n');
console.log(`Huiji monsters: ${records.length} pages from ${list.length} candidates`);

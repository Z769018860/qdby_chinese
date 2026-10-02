// (Only the slim intents.json is stored; the full parse stays in memory.)
// Scrape the monster pages of kaiden.gg (https://www.kaiden.gg/morimens/monsters/): traits, passives, rotation (intents)
// and where each monster stands. Output: data/morimens/kaiden/monsters.json (English text; credit Kaiden.gg when shown).
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

const BASE='https://www.kaiden.gg';
const OUT='data/morimens/kaiden/monsters.json';
const UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const dec=s=>String(s).replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;|&#x27;/g,"'").replace(/&nbsp;/g,' ');
const txt=s=>dec(String(s).replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();

async function get(url,retries=3){
  let last;
  for(let i=0;i<retries;i++){
    try{
      const r=await fetch(url,{headers:{'User-Agent':UA,'Accept':'text/html'},signal:AbortSignal.timeout(30000)});
      if(r.ok)return await r.text();
      last=new Error(`${url}: HTTP ${r.status}`);if(r.status!==429&&r.status<500)break;
    }catch(e){last=e}
    await new Promise(r=>setTimeout(r,1500*(i+1)));
  }
  throw last;
}
function clean(html){
  return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<svg[\s\S]*?<\/svg>/g,'')
    // keyword tooltips -> their keyword text
    .replace(/<button[^>]*data-floating-tooltip-title="([^"]*)"[^>]*>[\s\S]*?<\/button>/g,(m,t)=>dec(t))
    .replace(/\s+/g,' ');
}
function parse(html,slug){
  const h=clean(html);
  const name=txt((/<h2 class="mb-2[^>]*>([\s\S]*?)<\/h2>/.exec(h)||[])[1]||'');
  if(!name)return null;
  const badges=[...h.matchAll(/<span class="ks-badge ks-badge--lg">([\s\S]*?)<\/span>/g)].map(m=>txt(m[1]));
  const desc=txt((/<p class="mt-4[^>]*italic[^>]*>([\s\S]*?)<\/p>/.exec(h)||[])[1]||'');
  const rec={slug,name,badges,desc,img:(/<img src="(\/img\/morimens\/monsters\/[^"]+)"/.exec(h)||[])[1]||''};
  const sections={};
  for(const m of h.matchAll(/<section[^>]*>\s*<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)<\/section>/g))sections[txt(m[1]).replace(/\s*\d+$/,'').toLowerCase()]=m[2];
  rec.traits=[...(sections.traits||'').matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g)].map(m=>({n:txt(m[1]),d:txt(m[2])}));
  rec.passives=[...(sections.passives||'').matchAll(/<p class="text-sm font-bold text-white">([\s\S]*?)<\/p>\s*<p[^>]*>([\s\S]*?)<\/p>/g)].map(m=>({n:txt(m[1]),d:txt(m[2])}));
  rec.rotation=[...(sections.rotation||'').matchAll(/<img src="\/img\/morimens\/intents\/intent-(\d+)\.webp"[^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>\s*<span[^>]*>([\s\S]*?)<\/span>\s*<\/div>\s*<p[^>]*>([\s\S]*?)<\/p>/g)].map(m=>({i:m[1],n:txt(m[2]),t:txt(m[3]),d:txt(m[4])}));
  const stands=[...h.matchAll(/<h3[^>]*>\s*Where it stands[\s\S]*?<\/section>/g)][0]?.[0]||'';
  rec.stands=[...stands.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m=>[...m[1].matchAll(/<span[^>]*>([^<]+)<\/span>/g)].map(x=>txt(x[1])).filter(Boolean));
  return rec;
}

const list=await get(`${BASE}/morimens/monsters/`);
const slugs=[...new Set([...list.matchAll(/href="\/morimens\/monsters\/([a-z0-9-]+)\/"/g)].map(m=>m[1]))];
console.log(`${slugs.length} monster pages`);
const out={};let done=0,failed=[];
const queue=[...slugs];
await Promise.all(Array.from({length:6},async()=>{
  while(queue.length){
    const slug=queue.shift();
    try{const rec=parse(await get(`${BASE}/morimens/monsters/${slug}/`),slug);if(rec)out[slug]=rec;else failed.push(slug)}
    catch(e){failed.push(slug);console.warn(slug,e.message)}
    if(++done%50===0)console.log(`${done}/${slugs.length}`);
  }
}));
if(!Object.keys(out).length)throw new Error('nothing parsed');
await mkdir(path.dirname(OUT),{recursive:true});
// slim, name-keyed file used by the site (passives + rotation only)
const norm=n=>String(n).toLowerCase().replace(/[^a-z0-9]/g,'');
const slim={};
for(const r of Object.values(out)){
  if(!r.rotation.length&&!r.passives.length)continue;
  const k=norm(r.name);if(!k||(slim[k]&&slim[k].r.length>=r.rotation.length))continue;
  slim[k]={n:r.name,...(r.passives.length?{p:r.passives}:{}),r:r.rotation};
}
await writeFile('data/morimens/kaiden/intents.json',JSON.stringify({source:'https://www.kaiden.gg/morimens/monsters/',retrievedAt:new Date().toISOString(),monsters:slim})+'\n');
console.log(`kaiden monsters: ${Object.keys(out).length} parsed, ${failed.length} failed, ${Object.keys(slim).length} with intents`);

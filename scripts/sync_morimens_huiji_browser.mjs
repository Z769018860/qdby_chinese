// Fetch monster pages through a real Chromium session (to pass Huiji's Cloudflare challenge), then call api.php from page context.
import {chromium} from 'playwright';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
const OUT='data/morimens/huiji/monsters.json';
const titles=JSON.parse(await readFile('data/morimens/huiji/monster-titles.json','utf8')).titles;
const browser=await chromium.launch({headless:false,args:['--disable-blink-features=AutomationControlled']});
const ctx=await browser.newContext({locale:'zh-CN',viewport:{width:1280,height:900},userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'});
const page=await ctx.newPage();
await page.goto('https://morimens.huijiwiki.com/wiki/%E6%80%AA%E7%89%A9',{waitUntil:'domcontentloaded',timeout:60000}).catch(e=>console.warn('goto:',e.message));
let ok=false;
for(let i=0;i<30;i++){
  const t=await page.title().catch(()=>'');
  console.log(`[${i*2}s] title="${t}"`);
  if(t&&!/just a moment|请稍候|attention required/i.test(t)){ok=true;break}
  await page.waitForTimeout(2000);
}
if(!ok){console.error('Cloudflare challenge was not cleared');await browser.close();process.exit(1)}
const records=await page.evaluate(async titles=>{
  const out=[];
  for(let i=0;i<titles.length;i+=25){
    const q=new URLSearchParams({action:'query',format:'json',formatversion:'2',prop:'revisions',rvprop:'content|timestamp',rvslots:'main',redirects:'1',titles:titles.slice(i,i+25).join('|')});
    const r=await (await fetch('/api.php?'+q)).json();
    for(const pg of r.query?.pages||[]){if(pg.missing)continue;const rev=pg.revisions?.[0];out.push({title:pg.title,wikitext:rev?.slots?.main?.content??rev?.content??'',revisionTimestamp:rev?.timestamp||null})}
  }
  return out;
},titles);
await browser.close();
if(!records.length){console.error('API returned no pages');process.exit(1)}
await mkdir(path.dirname(OUT),{recursive:true});
await writeFile(OUT,JSON.stringify({source:{site:'https://morimens.huijiwiki.com/',license:'CC BY-NC-SA (HuijiWiki community content)',retrievedAt:new Date().toISOString(),transport:'chromium'},count:records.length,records},null,1)+'\n');
console.log(`Huiji monsters (browser): ${records.length}/${titles.length}`);

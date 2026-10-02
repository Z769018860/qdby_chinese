// Paste into the browser DevTools console while on https://morimens.huijiwiki.com/ (same-origin, passes Cloudflare).
// Downloads monsters.json -> commit it to data/morimens/huiji/monsters.json (or send it to the maintainer).
(async()=>{
  const titles=(await (await fetch('https://raw.githubusercontent.com/Z769018860/qdby_chinese/preview/data/morimens/huiji/monster-titles.json')).json()).titles;
  const records=[];
  for(let i=0;i<titles.length;i+=25){
    const q=new URLSearchParams({action:'query',format:'json',formatversion:'2',prop:'revisions',rvprop:'content|timestamp',rvslots:'main',redirects:'1',titles:titles.slice(i,i+25).join('|')});
    const r=await (await fetch('/api.php?'+q)).json();
    for(const pg of r.query?.pages||[]){
      if(pg.missing)continue;
      const rev=pg.revisions?.[0];
      records.push({title:pg.title,wikitext:rev?.slots?.main?.content??rev?.content??'',revisionTimestamp:rev?.timestamp||null});
    }
    console.log(`${Math.min(i+25,titles.length)}/${titles.length}`);
  }
  const blob=new Blob([JSON.stringify({source:{site:'https://morimens.huijiwiki.com/',license:'CC BY-NC-SA (HuijiWiki community content)',retrievedAt:new Date().toISOString()},count:records.length,records})],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='monsters.json';a.click();
  console.log('done',records.length);
})();

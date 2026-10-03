// Paste into the DevTools console on https://morimens.huijiwiki.com/ (any page, same-origin so it passes Cloudflare).
// Collects the wiki pages that describe character story events / reruns (dates, rewards, featured Awakener) and
// downloads huiji-events.json -> commit to data/morimens/huiji/events.json or upload it to the maintainer.
(async()=>{
  const api=async p=>(await fetch('/api.php?'+new URLSearchParams({format:'json',formatversion:'2',origin:'*',...p}))).json();
  const titles=new Set();
  // 1) full-text search for event style pages
  for(const kw of ['活动 复刻','剧情活动','限时活动','活动时间','复刻活动','活动开启','活动期间']){
    for(let off=0;off<200;off+=50){
      const r=await api({action:'query',list:'search',srsearch:kw,srlimit:'50',sroffset:String(off),srnamespace:'0'});
      (r.query?.search||[]).forEach(x=>titles.add(x.title));
      if(!r.continue)break;
    }
  }
  // 2) every category whose name looks like an event category, and its members
  const cats=[];
  for(let cont={};;){const r=await api({action:'query',list:'allcategories',aclimit:'500',...cont});(r.query?.allcategories||[]).forEach(c=>cats.push(c.category));if(!r.continue)break;cont=r.continue}
  const evCats=cats.filter(c=>/活动|剧情|复刻|事件|活動/.test(c));
  console.log('event categories',evCats);
  for(const c of evCats){
    for(let cont={};;){const r=await api({action:'query',list:'categorymembers',cmtitle:'Category:'+c,cmlimit:'500',...cont});(r.query?.categorymembers||[]).forEach(m=>titles.add(m.title));if(!r.continue)break;cont=r.continue}
  }
  // 3) well-known index pages
  ['活动','剧情活动','往期活动','活动一览','活动日历','大事记','版本更新','更新公告'].forEach(t=>titles.add(t));
  const list=[...titles];
  console.log('pages to fetch',list.length);
  const pages=[];
  for(let i=0;i<list.length;i+=25){
    const r=await api({action:'query',prop:'revisions',rvprop:'content|timestamp',rvslots:'main',redirects:'1',titles:list.slice(i,i+25).join('|')});
    for(const pg of r.query?.pages||[]){if(pg.missing)continue;const rev=pg.revisions?.[0];pages.push({title:pg.title,wikitext:rev?.slots?.main?.content??rev?.content??'',revisionTimestamp:rev?.timestamp||null})}
    console.log(Math.min(i+25,list.length)+'/'+list.length);
  }
  const blob=new Blob([JSON.stringify({source:{site:'https://morimens.huijiwiki.com/',license:'CC BY-NC-SA (HuijiWiki community content)',retrievedAt:new Date().toISOString()},categories:evCats,pages},null,1)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='huiji-events.json';a.click();
  console.log('done',pages.length);
})();

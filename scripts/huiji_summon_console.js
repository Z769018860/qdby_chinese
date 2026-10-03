// Paste into the browser DevTools console while on https://morimens.huijiwiki.com/wiki/唤醒 (same-origin, passes Cloudflare).
// Downloads huiji-summon.json with, for the 唤醒 page and every sub-page / template it links to:
//   - wikitext (raw source, includes the banner templates and dates)
//   - rendered HTML tables parsed to rows of cell text (+ link titles / image names per cell)
//   - the section outline
// Commit the file to data/morimens/huiji/summon.json (or send it to the maintainer).
(async()=>{
  const ROOT='唤醒';
  const api=async p=>(await fetch('/api.php?'+new URLSearchParams({format:'json',formatversion:'2',origin:'*',...p}))).json();
  const wt=async titles=>{
    const out=[];
    for(let i=0;i<titles.length;i+=25){
      const r=await api({action:'query',prop:'revisions',rvprop:'content|timestamp',rvslots:'main',redirects:'1',titles:titles.slice(i,i+25).join('|')});
      for(const pg of r.query?.pages||[]){if(pg.missing)continue;const rev=pg.revisions?.[0];out.push({title:pg.title,wikitext:rev?.slots?.main?.content??rev?.content??'',revisionTimestamp:rev?.timestamp||null})}
    }
    return out;
  };
  const html=async title=>(await api({action:'parse',page:title,prop:'text|sections|links|templates',redirects:'1',disablelimitreport:'1'})).parse;
  const txt=el=>el.textContent.replace(/\s+/g,' ').trim();
  const tables=doc=>[...doc.querySelectorAll('table')].map((t,ti)=>{
    let heading='';for(let n=t.previousElementSibling;n;n=n.previousElementSibling){if(/^H[1-6]$/.test(n.tagName)){heading=txt(n);break}}
    return {index:ti,heading,caption:txt(t.querySelector('caption')||{textContent:''}),
      rows:[...t.querySelectorAll('tr')].map(tr=>[...tr.children].map(c=>({text:txt(c),links:[...c.querySelectorAll('a[title]')].map(a=>a.title),images:[...c.querySelectorAll('img')].map(i=>i.alt||i.getAttribute('src')||''),colspan:c.colSpan,rowspan:c.rowSpan})))};
  });

  const main=await html(ROOT);
  const doc=new DOMParser().parseFromString(main.text,'text/html');
  console.log('sections',main.sections.length,'tables',doc.querySelectorAll('table').length);

  // every internal link / template of the page, so the detail pages are included too
  const titles=[...new Set([ROOT,...main.links.filter(l=>l.exists!==false&&l.ns===0).map(l=>l.title),...main.templates.filter(t=>t.exists!==false).map(t=>t.title)])];
  console.log('fetching wikitext of',titles.length,'pages');
  const pages=await wt(titles);

  // rendered tables of the page itself and of sub-pages that look like banners / histories
  const sub=pages.filter(p=>p.title!==ROOT&&/唤醒|卡池|复刻|池|UP|活动/.test(p.title)).slice(0,60);
  const rendered=[{title:ROOT,sections:main.sections,tables:tables(doc)}];
  for(const p of sub){try{const r=await html(p.title);rendered.push({title:p.title,sections:r.sections,tables:tables(new DOMParser().parseFromString(r.text,'text/html'))})}catch(e){console.warn('skip',p.title,e.message)}}

  const blob=new Blob([JSON.stringify({source:{site:'https://morimens.huijiwiki.com/',page:ROOT,license:'CC BY-NC-SA (HuijiWiki community content)',retrievedAt:new Date().toISOString()},pages,rendered},null,1)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='huiji-summon.json';a.click();
  console.log('done: pages',pages.length,'rendered',rendered.length);
})();

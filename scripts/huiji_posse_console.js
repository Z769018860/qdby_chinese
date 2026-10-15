// Paste into the DevTools console on https://morimens.huijiwiki.com/ (same-origin, passes Cloudflare).
// Downloads huiji-posse.json: wikitext + rendered tables of the 钥令 (key token) pages with Chinese + English names,
// used to replace the provisional (＊) key token names in the Season 70 report / leaderboard.
(async()=>{
  const api=async p=>(await fetch('/api.php?'+new URLSearchParams({format:'json',formatversion:'2',origin:'*',...p}))).json();
  const titles=new Set(['钥令','钥令一览','钥令图鉴','钥令列表']);
  for(const q of ['钥令','钥令 英文','Key Token','守密人技能']){
    let cont={};
    do{
      const r=await api({action:'query',list:'search',srsearch:q,srlimit:'50',srnamespace:'0|10|14',...cont});
      (r.query?.search||[]).forEach(x=>titles.add(x.title));cont=r.continue||null;
    }while(cont);
  }
  const txt=el=>el.textContent.replace(/\s+/g,' ').trim();
  const pages=[];
  for(const title of titles){
    try{
      const r=await api({action:'parse',page:title,prop:'text|wikitext|links',redirects:'1',disablelimitreport:'1'});
      if(!r.parse)continue;
      const doc=new DOMParser().parseFromString(r.parse.text,'text/html');
      pages.push({title:r.parse.title,wikitext:r.parse.wikitext,links:(r.parse.links||[]).map(l=>l.title),
        tables:[...doc.querySelectorAll('table')].map(t=>[...t.querySelectorAll('tr')].map(tr=>[...tr.children].map(c=>({text:txt(c),images:[...c.querySelectorAll('img')].map(i=>i.alt||i.getAttribute('data-file-name')||i.getAttribute('src')||'')}))))});
    }catch(e){console.warn('skip',title,e.message)}
  }
  const blob=new Blob([JSON.stringify({source:{site:location.origin,retrievedAt:new Date().toISOString()},pages},null,1)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='huiji-posse.json';a.click();
  console.log('done',pages.length,'pages');
})();

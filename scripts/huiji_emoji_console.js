// Paste into the DevTools console on https://morimens.huijiwiki.com/ (same-origin, passes Cloudflare).
// Downloads huiji-emoji.json: wikitext + rendered tables of every page whose title contains 表情 / 头像 / 核心课题 / 赛季奖励,
// including the "获取方式" (how to obtain) columns. Send / commit it to data/morimens/huiji/emoji.json; the maintainer then derives
// data/morimens/game/emoji-sources.json ({"sources":{"Emoji_<CODE>_<L>_<NN>":"core|season|invite|shop|event|other"}}).
(async()=>{
  const api=async p=>(await fetch('/api.php?'+new URLSearchParams({format:'json',formatversion:'2',origin:'*',...p}))).json();
  const titles=new Set();
  for(const q of ['表情','头像','核心课题','赛季奖励','无形者的请柬','对战表情']){
    let cont={};
    do{
      const r=await api({action:'query',list:'search',srsearch:q,srlimit:'50',srnamespace:'0|10|14',...cont});
      (r.query?.search||[]).forEach(x=>titles.add(x.title));cont=r.continue||null;
    }while(cont);
  }
  for(const t of ['表情','头像','表情包','对战表情','头像·表情']){titles.add(t)}
  const txt=el=>el.textContent.replace(/\s+/g,' ').trim();
  const pages=[];
  for(const title of titles){
    try{
      const r=await api({action:'parse',page:title,prop:'text|wikitext',redirects:'1',disablelimitreport:'1'});
      if(!r.parse)continue;
      const doc=new DOMParser().parseFromString(r.parse.text,'text/html');
      pages.push({title:r.parse.title,wikitext:r.parse.wikitext,
        tables:[...doc.querySelectorAll('table')].map(t=>[...t.querySelectorAll('tr')].map(tr=>[...tr.children].map(c=>({text:txt(c),images:[...c.querySelectorAll('img')].map(i=>i.alt||i.getAttribute('data-file-name')||i.getAttribute('src')||'')}))))});
    }catch(e){console.warn('skip',title,e.message)}
  }
  const blob=new Blob([JSON.stringify({source:{site:location.origin,retrievedAt:new Date().toISOString()},pages},null,1)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='huiji-emoji.json';a.click();
  console.log('done',pages.length,'pages');
})();

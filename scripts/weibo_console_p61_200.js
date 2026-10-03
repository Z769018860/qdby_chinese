// Weibo export of pages 61-200 of 忘却前夜记录局 (older posts: 2024-12 .. 2025-11).
// Paste into the DevTools console while logged in at https://m.weibo.cn/ . Pages 1-60 were exported before (weibo-wangque.json);
// this script walks the timeline page by page, keeps only pages START..END and downloads weibo-wangque-p61-200.json.
// If your session gets rate limited ("432" / empty pages) it waits and retries; re-run with a smaller range, e.g. START=61, END=130, then 131-200.
(async()=>{
  const NAME='忘却前夜记录局',UID_HINT='7899814735',START=61,END=200,DELAY=900;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const get=async u=>{
    for(let t=0;t<4;t++){
      const res=await fetch(u,{credentials:'include',headers:{'Accept':'application/json, text/plain, */*','X-Requested-With':'XMLHttpRequest'}});
      if(res.status===432||res.status===403||res.status===418){console.warn('rate limited, waiting 15s');await sleep(15000);continue}
      try{return await res.json()}catch{await sleep(3000)}
    }
    return {};
  };
  let uid=UID_HINT;
  const probe=await get(`/api/container/getIndex?type=uid&value=${uid}&containerid=107603${uid}&page=1`);
  if(!probe.data?.cards?.length){
    const s=await get('/api/container/getIndex?containerid='+encodeURIComponent('100103type=3&q='+NAME)+'&page_type=searchall');
    const u=(s.data?.cards||[]).flatMap(c=>c.card_group||[c]).map(c=>c.user).filter(Boolean).find(x=>x.screen_name===NAME);
    if(!u){console.error('account not found - open the profile page once in this tab and re-run');return}
    uid=u.id;
  }
  console.log('uid',uid);
  const strip=h=>String(h||'').replace(/<br\s*\/?>/g,'\n').replace(/<[^>]+>/g,'').trim();
  const posts=[],seen=new Set();let empty=0,since='';
  for(let p=1;p<=END;p++){
    // pages before START are only walked to obtain the since_id cursor (cheap, nothing is stored)
    const r=await get(`/api/container/getIndex?type=uid&value=${uid}&containerid=107603${uid}&page=${p}${since?'&since_id='+since:''}`);
    const cards=(r.data?.cards||[]).filter(c=>c.card_type===9&&c.mblog);
    since=r.data?.cardlistInfo?.since_id||since;
    if(!cards.length){if(++empty>=3){console.log('timeline ended at page',p);break}await sleep(DELAY*3);continue}
    empty=0;
    if(p>=START){
      for(const c of cards){
        const m=c.mblog;if(seen.has(m.id))continue;seen.add(m.id);
        let text=strip(m.text);
        if(/全文/.test(m.text||'')&&m.id){const f=await get('/statuses/extend?id='+m.id);text=strip(f.data?.longTextContent||text)}
        posts.push({id:m.id,created:m.created_at,text,pics:(m.pics||[]).map(x=>x.large?.url||x.url),retweeted:m.retweeted_status?strip(m.retweeted_status.text):null});
      }
      console.log('page',p,'kept',posts.length,'latest',cards[cards.length-1]?.mblog?.created_at);
    }else if(p%10===0)console.log('skipping to page',START,'… now',p);
    await sleep(p>=START?DELAY:300);
  }
  const blob=new Blob([JSON.stringify({source:{site:'https://weibo.com/u/'+uid,account:NAME,pages:`${START}-${END}`,retrievedAt:new Date().toISOString()},posts},null,1)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='weibo-wangque-p61-200.json';a.click();
  console.log('done',posts.length);
})();

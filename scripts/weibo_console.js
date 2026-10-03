// Paste into the DevTools console while logged in at https://m.weibo.cn/ (any page) - Weibo only serves its API to a signed-in browser.
// Downloads weibo-wangque.json with the posts of 忘却前夜记录局 (event / banner announcements: dates, rerun schedule).
// Set PAGES higher for older posts (each page ≈ 10 posts). Send the file to the maintainer or commit it as data/morimens/weibo/posts.json.
(async()=>{
  const NAME='忘却前夜记录局',PAGES=60;
  const get=async u=>(await (await fetch(u,{credentials:'include',headers:{'Accept':'application/json, text/plain, */*','X-Requested-With':'XMLHttpRequest'}})).json());
  // 1) find the account id by name
  const s=await get('/api/container/getIndex?containerid='+encodeURIComponent('100103type=3&q='+NAME)+'&page_type=searchall');
  const user=(s.data?.cards||[]).flatMap(c=>c.card_group||[c]).map(c=>c.user).filter(Boolean).find(u=>u.screen_name===NAME)||(s.data?.cards||[]).flatMap(c=>c.card_group||[]).map(c=>c.user).filter(Boolean)[0];
  if(!user){console.error('account not found - open the profile page once in this tab and re-run');return}
  console.log('uid',user.id,user.screen_name);
  const strip=h=>String(h||'').replace(/<br\s*\/?>/g,'\n').replace(/<[^>]+>/g,'').trim();
  const posts=[];let since='';
  for(let p=1;p<=PAGES;p++){
    const r=await get(`/api/container/getIndex?type=uid&value=${user.id}&containerid=107603${user.id}&page=${p}${since?'&since_id='+since:''}`);
    const cards=(r.data?.cards||[]).filter(c=>c.card_type===9&&c.mblog);
    since=r.data?.cardlistInfo?.since_id||'';
    for(const c of cards){
      const m=c.mblog;
      let text=strip(m.text);
      // long posts are truncated in the list - fetch the full text
      if(/全文/.test(m.text||'')&&m.id){try{const f=await get('/statuses/extend?id='+m.id);text=strip(f.data?.longTextContent||text)}catch{}}
      posts.push({id:m.id,created:m.created_at,text,pics:(m.pics||[]).map(x=>x.large?.url||x.url),retweeted:m.retweeted_status?strip(m.retweeted_status.text):null});
    }
    console.log('page',p,'posts',posts.length);
    if(!cards.length&&!since)break;
    await new Promise(r=>setTimeout(r,800));
  }
  const blob=new Blob([JSON.stringify({source:{site:'https://weibo.com/u/'+user.id,account:user.screen_name,retrievedAt:new Date().toISOString()},posts},null,1)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='weibo-wangque.json';a.click();
  console.log('done',posts.length);
})();

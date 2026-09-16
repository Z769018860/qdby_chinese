(()=>{
  const DATA_URL='data/morimens/skeydb/awakeners.json';
  let db=null,current=null,quoteIndex=0;
  const $=id=>document.getElementById(id);
  const hash=s=>{let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0};
  const todayKey=()=>new Date().toLocaleDateString('sv-SE');
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function ensureUi(){
    const visual=$('fortuneVisual');
    if(visual&&!$('skeydbAvatar')){
      const img=document.createElement('img');img.id='skeydbAvatar';img.alt='角色头像';img.style.cssText='position:absolute;left:16px;bottom:16px;z-index:5;width:72px;height:72px;border-radius:12px;object-fit:cover;border:2px solid rgba(213,177,118,.65);background:#111827;box-shadow:0 8px 24px rgba(0,0,0,.35)';visual.appendChild(img);
    }
    const body=document.querySelector('.fortuneBody');
    if(body&&!$('skeydbProfile')){
      const box=document.createElement('div');box.id='skeydbProfile';box.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px';body.insertBefore(box,body.querySelector('.fortuneMeta'));
    }
    const actions=document.querySelector('.fortuneActions');
    if(actions&&!$('skeydbQuoteBtn')){
      const b=document.createElement('button');b.id='skeydbQuoteBtn';b.type='button';b.className='ghostBtn';b.textContent='换一句角色台词';b.addEventListener('click',()=>{if(!current)return;quoteIndex++;renderQuote(current)});actions.insertBefore(b,actions.lastElementChild);
    }
    const tags=document.querySelector('.heroTags');
    if(tags&&!$('skeydbStatus')){const s=document.createElement('span');s.className='tag';s.id='skeydbStatus';s.textContent='SKeyDB：等待同步快照';tags.appendChild(s)}
  }

  function allQuotes(rec){return rec?.profile?.voiceLines?.filter(x=>x?.content)||[]}
  function renderQuote(rec){
    const q=allQuotes(rec);if(!q.length){if($('fortuneQuote'))$('fortuneQuote').textContent='该角色当前同步数据没有可用台词。';return}
    const item=q[((quoteIndex%q.length)+q.length)%q.length];
    if($('fortuneQuote'))$('fortuneQuote').innerHTML=`<strong>${escape(item.title||'角色语音')}</strong><br>“${escape(item.content)}”`;
  }
  function render(rec,random=false){
    current=rec;quoteIndex=hash(`${todayKey()}-${rec.id}`)%Math.max(1,allQuotes(rec).length);
    const portrait=$('fortunePortrait');
    if(portrait){portrait.src=rec.assets?.card||rec.assets?.portrait||'';portrait.hidden=!portrait.src;portrait.alt=`${rec.name} 立绘`;portrait.style.objectPosition='center 18%'}
    const avatar=$('skeydbAvatar');if(avatar){avatar.src=rec.assets?.portrait||rec.assets?.card||'';avatar.hidden=!avatar.src}
    if($('fortuneName'))$('fortuneName').textContent=rec.name;
    if($('fortuneDate'))$('fortuneDate').textContent=`${todayKey()} · SKeyDB ${db.source?.commit?.slice(0,8)||''}${random?' · 随机再抽':''}`;
    renderQuote(rec);
    const p=$('skeydbProfile');if(p)p.innerHTML=[
      ['稀有度',rec.rarity],['界域',rec.realm],['类型',rec.type],['阵营',rec.faction],['生日',rec.profile?.birthday],['声优',rec.profile?.voiceActor]
    ].filter(x=>x[1]).map(([k,v])=>`<div style="padding:9px 10px;border-radius:10px;background:rgba(255,255,255,.035);font-size:11px;color:#8f9caf">${escape(k)}<strong style="display:block;color:#e5e7eb;margin-top:3px">${escape(v)}</strong></div>`).join('');
    const wiki=$('wikiBtn');if(wiki){wiki.href=`https://morimens.huijiwiki.com/wiki/${encodeURIComponent(rec.name)}`;wiki.textContent='查看中文维基'}
  }
  function renderToday(){if(!db?.records?.length)return;render(db.records[hash(todayKey())%db.records.length])}
  function renderRandom(){if(!db?.records?.length)return;render(db.records[Math.floor(Math.random()*db.records.length)],true)}

  async function boot(){
    ensureUi();
    try{
      const r=await fetch(`${DATA_URL}?v=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);db=await r.json();
      if($('skeydbStatus'))$('skeydbStatus').textContent=`SKeyDB：${db.count} 名角色 · ${db.source?.commit?.slice(0,8)||'snapshot'}`;
      const fortune=$('fortuneBtn'),reroll=$('rerollBtn');
      if(fortune){fortune.addEventListener('click',e=>{e.stopImmediatePropagation();renderToday()},{capture:true})}
      if(reroll){reroll.addEventListener('click',e=>{e.stopImmediatePropagation();renderRandom()},{capture:true})}
      renderToday();
    }catch(err){console.warn('SKeyDB snapshot unavailable',err);if($('skeydbStatus'))$('skeydbStatus').textContent='SKeyDB：快照尚未生成，暂用旧数据'}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0));else setTimeout(boot,0);
})();

(()=>{
  const DATA_URL='data/morimens/skeydb/awakeners.json';
  const ZH_URL='data/morimens/huiji/zh-CN.json';
  let db=null,zhDb=null,current=null,quoteIndex=0;
  const $=id=>document.getElementById(id);
  const hash=s=>{let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0};
  const todayKey=()=>new Date().toLocaleDateString('sv-SE');
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const language=()=>localStorage.getItem('morimens.language')||'zh-CN';
  const isZh=()=>language()==='zh-CN';
  const zhFor=rec=>zhDb?.bySkeydbId?.[rec?.id]||null;

  function ensureUi(){
    const visual=$('fortuneVisual');
    if(visual&&!$('skeydbAvatar')){const img=document.createElement('img');img.id='skeydbAvatar';img.alt='Character portrait';img.style.cssText='position:absolute;left:16px;bottom:16px;z-index:5;width:72px;height:72px;border-radius:12px;object-fit:cover;border:2px solid rgba(213,177,118,.65);background:#111827;box-shadow:0 8px 24px rgba(0,0,0,.35)';visual.appendChild(img)}
    const body=document.querySelector('.fortuneBody');if(body&&!$('skeydbProfile')){const box=document.createElement('div');box.id='skeydbProfile';box.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px';body.insertBefore(box,body.querySelector('.fortuneMeta'))}
    const actions=document.querySelector('.fortuneActions');if(actions&&!$('skeydbQuoteBtn')){const b=document.createElement('button');b.id='skeydbQuoteBtn';b.type='button';b.className='ghostBtn';b.textContent='换一句角色台词';b.addEventListener('click',()=>{if(!current)return;quoteIndex++;renderQuote(current)});actions.insertBefore(b,actions.lastElementChild)}
    const tags=document.querySelector('.heroTags');if(tags&&!$('skeydbStatus')){const s=document.createElement('span');s.className='tag';s.id='skeydbStatus';s.textContent='SKeyDB / Wiki：等待同步快照';tags.appendChild(s)}
    const sources=document.querySelector('.sourceList');if(sources&&!$('skeydbAttribution')){
      const note=document.createElement('div');note.id='skeydbAttribution';note.className='sourceItem';sources.appendChild(note);
    }
  }

  function allQuotes(rec){
    const zh=zhFor(rec);if(isZh()&&zh?.voiceLines?.length)return zh.voiceLines.filter(x=>x?.content);
    return rec?.profile?.voiceLines?.filter(x=>x?.content)||[];
  }
  function localizedProfile(rec){
    const zh=zhFor(rec);if(isZh()&&zh)return {name:zh.name||rec.name,rarity:zh.profile?.rarity||rec.rarity,realm:zh.profile?.realm||rec.realm,type:zh.profile?.type||rec.type,faction:zh.profile?.faction||rec.faction,birthday:zh.profile?.birthday||rec.profile?.birthday,voiceActor:zh.profile?.voiceActor||rec.profile?.voiceActor};
    return {name:rec.name,rarity:rec.rarity,realm:rec.realm,type:rec.type,faction:rec.faction,birthday:rec.profile?.birthday,voiceActor:rec.profile?.voiceActor};
  }
  function renderQuote(rec){
    const q=allQuotes(rec);const box=$('fortuneQuote');if(!box)return;
    if(!q.length){box.textContent=isZh()?'该角色当前同步数据没有可用台词。':'No synchronized voice line is available for this character.';return}
    const item=q[((quoteIndex%q.length)+q.length)%q.length];box.innerHTML=`<strong>${escape(item.title||(isZh()?'角色语音':'Voice line'))}</strong><br>“${escape(item.content)}”`;
  }
  function renderSourceStatus(){
    if($('skeydbStatus'))$('skeydbStatus').textContent=isZh()?`数据：SKeyDB ${db?.source?.commit?.slice(0,8)||'—'} · 中文 Wiki ${zhDb?.mapped??0}/${db?.count??0}`:`Data: SKeyDB ${db?.source?.commit?.slice(0,8)||'—'} · Huiji zh-CN ${zhDb?.mapped??0}/${db?.count??0}`;
    const a=$('skeydbAttribution');if(a)a.innerHTML=isZh()?'<strong>数据来源：</strong>英文结构化数据与数值来自 <a href="https://github.com/dansa/SKeyDB" target="_blank" rel="noopener noreferrer">dansa/SKeyDB</a>；中文版名称、资料、文本优先遵循 <a href="https://morimens.huijiwiki.com/" target="_blank" rel="noopener noreferrer">忘却前夜中文维基</a> 的每日同步快照。两者原创内容分别遵循其 CC BY-NC-SA 4.0 条款；游戏图片和游戏原文仍属于相应权利方。':'<strong>Sources:</strong> English structured data and numeric records are synchronized from <a href="https://github.com/dansa/SKeyDB" target="_blank" rel="noopener noreferrer">dansa/SKeyDB</a>. Chinese localization is synchronized from the <a href="https://morimens.huijiwiki.com/" target="_blank" rel="noopener noreferrer">Morimens Chinese HuijiWiki</a>. Project-authored data follows the applicable CC BY-NC-SA 4.0 terms; game-owned art and text remain property of their respective rights holders.';
  }
  function render(rec,random=false){
    current=rec;const loc=localizedProfile(rec);quoteIndex=hash(`${todayKey()}-${rec.id}`)%Math.max(1,allQuotes(rec).length);
    const portrait=$('fortunePortrait');if(portrait){portrait.src=rec.assets?.card||rec.assets?.portrait||'';portrait.hidden=!portrait.src;portrait.alt=`${loc.name} ${isZh()?'角色卡面':'character card'}`;portrait.style.objectPosition='center 18%'}
    const avatar=$('skeydbAvatar');if(avatar){avatar.src=rec.assets?.portrait||rec.assets?.card||'';avatar.hidden=!avatar.src;avatar.alt=`${loc.name} ${isZh()?'头像':'portrait'}`}
    if($('fortuneName'))$('fortuneName').textContent=loc.name;
    if($('fortuneDate'))$('fortuneDate').textContent=`${todayKey()} · SKeyDB ${db.source?.commit?.slice(0,8)||''}${random?(isZh()?' · 随机再抽':' · Reroll'):''}`;
    renderQuote(rec);
    const labels=isZh()?['稀有度','界域','类型','阵营','生日','声优']:['Rarity','Realm','Type','Faction','Birthday','Voice actor'];
    const values=[loc.rarity,loc.realm,loc.type,loc.faction,loc.birthday,loc.voiceActor];
    const p=$('skeydbProfile');if(p)p.innerHTML=labels.map((k,i)=>[k,values[i]]).filter(x=>x[1]).map(([k,v])=>`<div style="padding:9px 10px;border-radius:10px;background:rgba(255,255,255,.035);font-size:11px;color:#8f9caf">${escape(k)}<strong style="display:block;color:#e5e7eb;margin-top:3px">${escape(v)}</strong></div>`).join('');
    const wiki=$('wikiBtn');const zh=zhFor(rec);if(wiki&&zh?.source?.url)wiki.href=zh.source.url;
    renderSourceStatus();
  }
  function renderToday(){if(!db?.records?.length)return;render(db.records[hash(todayKey())%db.records.length])}
  function renderRandom(){if(!db?.records?.length)return;render(db.records[Math.floor(Math.random()*db.records.length)],true)}

  async function boot(){
    ensureUi();
    try{
      const [enResult,zhResult]=await Promise.allSettled([
        fetch(`${DATA_URL}?v=${Date.now()}`,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(`SKeyDB HTTP ${r.status}`);return r.json()}),
        fetch(`${ZH_URL}?v=${Date.now()}`,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(`Huiji HTTP ${r.status}`);return r.json()})
      ]);
      if(enResult.status!=='fulfilled')throw enResult.reason;db=enResult.value;if(zhResult.status==='fulfilled')zhDb=zhResult.value;else console.warn('Chinese Huiji snapshot unavailable',zhResult.reason);
      window.MorimensData={db,zhDb,language,zhFor,localizedProfile};
      const fortune=$('fortuneBtn'),reroll=$('rerollBtn');
      if(fortune)fortune.addEventListener('click',e=>{e.stopImmediatePropagation();renderToday()},{capture:true});
      if(reroll)reroll.addEventListener('click',e=>{e.stopImmediatePropagation();renderRandom()},{capture:true});
      window.addEventListener('morimens-language-change',()=>{if(current)render(current);else renderToday()});
      renderToday();window.dispatchEvent(new CustomEvent('morimens-data-ready'));
    }catch(err){console.warn('SKeyDB snapshot unavailable',err);if($('skeydbStatus'))$('skeydbStatus').textContent=isZh()?'SKeyDB：快照尚未生成，暂用旧数据':'SKeyDB snapshot unavailable; using legacy data'}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0));else setTimeout(boot,0);
})();

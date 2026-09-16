(()=>{
  const DATA_URL='data/morimens/skeydb/awakeners.json';
  const ZH_URL='data/morimens/huiji/zh-CN.json';
  const IDENTITY_URL='data/morimens/huiji/identity.zh-CN.json';
  let db=null,zhDb=null,identityDb=null,current=null,quoteIndex=0;
  const $=id=>document.getElementById(id);
  const hash=s=>{let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0};
  const todayKey=()=>new Date().toLocaleDateString('sv-SE');
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const language=()=>localStorage.getItem('morimens.language')||'zh-CN';
  const isZh=()=>language()==='zh-CN';
  const normalize=s=>String(s||'').toLowerCase().replace(/[“”"'「」『』·・:：\s_\-]/g,'').replace(/[^a-z0-9\u3400-\u9fff]/g,'');
  const realms={CHAOS:'混沌',AEQUOR:'深海',CARO:'血肉',ULTRA:'超维'};
  const types={ASSAULT:'伤害型',WARDEN:'防御型',CHORUS:'辅助型'};
  const ART_SLUG_GUARD={'awakener-0014':'doresain','awakener-0053':'winkle'};

  function identityFor(rec){return identityDb?.bySkeydbId?.[rec?.id]||null}
  function zhFor(rec){
    if(!rec)return null;
    const seed=identityFor(rec),live=zhDb?.bySkeydbId?.[rec.id];
    if(live&&normalize(live.englishName)===normalize(rec.name))return seed?{...seed,...live,profile:{...(seed.profile||{}),...(live.profile||{})},voiceLines:live.voiceLines?.length?live.voiceLines:(seed.voiceLines||seed.fallbackVoiceLines||[])}:live;
    if(live)console.warn('Ignored mismatched Morimens zh mapping',rec.id,rec.name,live.name,live.englishName);
    return seed;
  }
  function assetVersion(){return encodeURIComponent(db?.source?.syncedAt||db?.source?.commit||'current')}
  function assetFor(rec,kind){
    if(!rec)return '';
    const guarded=ART_SLUG_GUARD[rec.id];
    let raw='';
    if(guarded)raw=`assets/morimens/${kind==='card'?'cards':'portraits'}/${guarded}.webp`;
    else raw=rec.assets?.[kind]||rec.assets?.[kind==='card'?'portrait':'card']||'';
    if(!raw)return '';
    return `${raw}${raw.includes('?')?'&':'?'}v=${assetVersion()}`;
  }

  function ensureUi(){
    const visual=$('fortuneVisual');
    if(visual&&!$('skeydbAvatar')){const img=document.createElement('img');img.id='skeydbAvatar';img.alt='Character portrait';img.style.cssText='position:absolute;left:16px;bottom:16px;z-index:5;width:72px;height:72px;border-radius:12px;object-fit:cover;border:2px solid rgba(213,177,118,.65);background:#111827;box-shadow:0 8px 24px rgba(0,0,0,.35)';visual.appendChild(img)}
    const body=document.querySelector('.fortuneBody');if(body&&!$('skeydbAdvice')){const box=document.createElement('div');box.id='skeydbAdvice';box.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px';body.insertBefore(box,body.querySelector('.fortuneMeta'))}if(body&&!$('skeydbProfile')){const box=document.createElement('div');box.id='skeydbProfile';box.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px';body.insertBefore(box,body.querySelector('.fortuneMeta'))}
    const actions=document.querySelector('.fortuneActions');if(actions&&!$('skeydbQuoteBtn')){const b=document.createElement('button');b.id='skeydbQuoteBtn';b.type='button';b.className='ghostBtn';b.textContent='换一句角色台词';b.addEventListener('click',()=>{if(!current)return;quoteIndex++;renderQuote(current)});actions.insertBefore(b,actions.lastElementChild)}
    const tags=document.querySelector('.heroTags');if(tags&&!$('skeydbStatus')){const s=document.createElement('span');s.className='tag';s.id='skeydbStatus';s.textContent='SKeyDB / Wiki：等待同步快照';tags.appendChild(s)}
    const sources=document.querySelector('.sourceList');if(sources&&!$('skeydbAttribution')){const note=document.createElement('div');note.id='skeydbAttribution';note.className='sourceItem';sources.appendChild(note)}
  }

  function allQuotes(rec){
    const zh=zhFor(rec);
    if(isZh()){
      const q=(zh?.voiceLines?.length?zh.voiceLines:zh?.fallbackVoiceLines)||[];
      if(!q.length)return [{title:'今日寄语',content:`今天也和${zh?.name||rec.name}一起，稳住节奏，再做决定。`}];
      return q.filter(x=>x?.content);
    }
    return rec?.profile?.voiceLines?.filter(x=>x?.content)||[];
  }
  function localizedProfile(rec){
    const zh=zhFor(rec);
    if(isZh())return {name:zh?.name||rec.name,rarity:zh?.profile?.rarity||rec.rarity,realm:zh?.profile?.realm||realms[rec.realm]||rec.realm,type:zh?.profile?.type||types[rec.type]||rec.type,faction:zh?.profile?.faction||rec.faction,birthday:zh?.profile?.birthday||rec.profile?.birthday,voiceActor:zh?.profile?.voiceActor||rec.profile?.voiceActor};
    return {name:rec.name,rarity:rec.rarity,realm:rec.realm,type:rec.type,faction:rec.faction,birthday:rec.profile?.birthday,voiceActor:rec.profile?.voiceActor};
  }
  function renderQuote(rec){
    const q=allQuotes(rec),box=$('fortuneQuote');if(!box)return;
    if(!q.length){box.textContent=isZh()?'该角色的中文语音快照尚未同步；不会再用其他角色或英文台词替代。':'No synchronized voice line is available for this character.';return}
    const item=q[((quoteIndex%q.length)+q.length)%q.length];box.innerHTML=`<strong>${escape(item.title||(isZh()?'角色语音':'Voice line'))}</strong><br>“${escape(item.content)}”`;
  }
  function renderSourceStatus(){
    const mapped=zhDb?.mapped??identityDb?.records?.length??0,voices=zhDb?.voiceRecords??0;
    if($('skeydbStatus'))$('skeydbStatus').textContent=isZh()?`数据：SKeyDB ${db?.source?.commit?.slice(0,8)||'—'} · 中文身份 ${mapped}/${db?.count??0} · 中文语音 ${voices}`:`Data: SKeyDB ${db?.source?.commit?.slice(0,8)||'—'} · zh-CN identities ${mapped}/${db?.count??0}`;
    const a=$('skeydbAttribution');if(a)a.innerHTML=isZh()?'<strong>数据来源：</strong>角色 ID、数值与本地卡面来自 <a href="https://github.com/dansa/SKeyDB" target="_blank" rel="noopener noreferrer">dansa/SKeyDB</a>；中文角色名与中文语音按 <a href="https://morimens.huijiwiki.com/" target="_blank" rel="noopener noreferrer">忘却前夜中文维基</a> 页面校对。角色名、卡面、头像始终通过同一个 SKeyDB awakener ID 绑定，禁止按列表顺序关联。':'<strong>Sources:</strong> IDs, numeric data and local character art come from <a href="https://github.com/dansa/SKeyDB" target="_blank" rel="noopener noreferrer">dansa/SKeyDB</a>; Chinese identity and voice text are checked against the <a href="https://morimens.huijiwiki.com/" target="_blank" rel="noopener noreferrer">Morimens Chinese HuijiWiki</a>.';
  }
  function render(rec,random=false){
    if(!rec)return;current=rec;const loc=localizedProfile(rec),quotes=allQuotes(rec);quoteIndex=hash(`${todayKey()}-${rec.id}`)%Math.max(1,quotes.length);
    const portrait=$('fortunePortrait');if(portrait){const src=assetFor(rec,'card');portrait.src=src;portrait.hidden=!src;portrait.dataset.awakenerId=rec.id;portrait.dataset.assetSlug=ART_SLUG_GUARD[rec.id]||rec.assetSlug||'';portrait.alt=`${loc.name} ${isZh()?'角色卡面':'character card'}`;portrait.style.objectPosition='center 18%';portrait.onerror=()=>{portrait.onerror=null;const fallback=rec.assets?.card||'';if(fallback)portrait.src=`${fallback}?v=${assetVersion()}`}}
    const avatar=$('skeydbAvatar');if(avatar){const src=assetFor(rec,'portrait');avatar.src=src;avatar.hidden=!src;avatar.dataset.awakenerId=rec.id;avatar.dataset.assetSlug=ART_SLUG_GUARD[rec.id]||rec.assetSlug||'';avatar.alt=`${loc.name} ${isZh()?'头像':'portrait'}`;avatar.onerror=()=>{avatar.onerror=null;const fallback=rec.assets?.portrait||'';if(fallback)avatar.src=`${fallback}?v=${assetVersion()}`}}
    if($('fortuneName')){$('fortuneName').textContent=loc.name;$('fortuneName').dataset.awakenerId=rec.id}
    if($('fortuneDate'))$('fortuneDate').textContent=`${todayKey()} · ${rec.id} · ${ART_SLUG_GUARD[rec.id]||rec.assetSlug||''} · SKeyDB ${db.source?.commit?.slice(0,8)||''}${random?(isZh()?' · 随机再抽':' · Reroll'):''}`;
    renderQuote(rec);
    const advice=$('skeydbAdvice');if(advice){const seed=hash(`${todayKey()}-${rec.id}`),yi=['刷取资源与升级技能','尝试新配队','整理卡组与命轮','挑战高难关卡','查看角色剧情','为明日预留体力'][seed%6],ji=['冲动消耗稀有资源','忽略队伍生存','在不了解机制时盲目挑战','忘记保存计算结果','只看单项倍率而忽略乘区','连续重复无效操作'][(seed>>>3)%6];advice.innerHTML=`<div style="padding:10px;border-radius:10px;background:rgba(72,187,120,.12);color:#b7f7cf"><strong>今日宜</strong><br>${yi}</div><div style="padding:10px;border-radius:10px;background:rgba(248,113,113,.12);color:#fecaca"><strong>今日忌</strong><br>${ji}</div>`}
    const labels=isZh()?['稀有度','界域','类型','阵营','生日','声优']:['Rarity','Realm','Type','Faction','Birthday','Voice actor'];
    const values=[loc.rarity,loc.realm,loc.type,loc.faction,loc.birthday,loc.voiceActor];
    const p=$('skeydbProfile');if(p)p.innerHTML=labels.map((k,i)=>[k,values[i]]).filter(x=>x[1]).map(([k,v])=>`<div style="padding:9px 10px;border-radius:10px;background:rgba(255,255,255,.035);font-size:11px;color:#8f9caf">${escape(k)}<strong style="display:block;color:#e5e7eb;margin-top:3px">${escape(v)}</strong></div>`).join('');
    const wiki=$('wikiBtn'),zh=zhFor(rec);if(wiki){const title=zh?.name||loc.name;wiki.href=zh?.source?.url||`https://morimens.huijiwiki.com/wiki/${encodeURIComponent(title)}`}
    renderSourceStatus();
  }
  function renderToday(){if(!db?.records?.length)return;render(db.records[hash(todayKey())%db.records.length])}
  function renderRandom(){if(!db?.records?.length)return;render(db.records[Math.floor(Math.random()*db.records.length)],true)}

  async function getJson(url,label){const r=await fetch(`${url}?v=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error(`${label} HTTP ${r.status}`);return r.json()}
  async function boot(){
    ensureUi();
    try{
      const [enResult,zhResult,idResult]=await Promise.allSettled([getJson(DATA_URL,'SKeyDB'),getJson(ZH_URL,'Huiji'),getJson(IDENTITY_URL,'identity')]);
      if(enResult.status!=='fulfilled')throw enResult.reason;db=enResult.value;
      if(idResult.status==='fulfilled'){identityDb=idResult.value;identityDb.bySkeydbId=Object.fromEntries((identityDb.records||[]).map(x=>[x.skeydbId,x]))}else console.warn('Chinese identity map unavailable',idResult.reason);
      if(zhResult.status==='fulfilled'&&zhResult.value&&typeof zhResult.value==='object')zhDb=zhResult.value;else console.warn('Chinese Huiji snapshot unavailable',zhResult.reason);
      window.MorimensData={db,zhDb,identityDb,language,zhFor,localizedProfile,assetFor};
      const fortune=$('fortuneBtn'),reroll=$('rerollBtn');
      if(fortune)fortune.addEventListener('click',e=>{e.stopImmediatePropagation();renderToday()},{capture:true});
      if(reroll)reroll.addEventListener('click',e=>{e.stopImmediatePropagation();renderRandom()},{capture:true});
      window.addEventListener('morimens-language-change',()=>{if(current)render(current);else renderToday()});
      renderToday();window.dispatchEvent(new CustomEvent('morimens-data-ready'));
    }catch(err){console.warn('SKeyDB snapshot unavailable',err);if($('skeydbStatus'))$('skeydbStatus').textContent=isZh()?'SKeyDB：快照加载失败':'SKeyDB snapshot unavailable'}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0));else setTimeout(boot,0);
})();

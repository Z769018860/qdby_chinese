(()=>{
  const DATA_URL='data/morimens/skeydb/awakeners.json';
  const ZH_URL='data/morimens/huiji/zh-CN.json';
  const IDENTITY_URL='data/morimens/huiji/identity.zh-CN.json';
  const WHEEL_ZH_URL='data/morimens/huiji/wheels.zh-CN.json?v=20260918.35';
  const USAGE_MANIFEST_URL='data/morimens/eremora/manifest.json';
  let db=null,zhDb=null,identityDb=null,wheelZhDb=null,wheelCatalog=[],wheelAssets=null,usageStats=null,current=null,quoteIndex=0;
  const $=id=>document.getElementById(id);
  const hash=s=>{let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0};
  const todayKey=()=>new Date().toLocaleDateString('sv-SE');
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const language=()=>localStorage.getItem('morimens.language')||'zh-CN';
  const isZh=()=>language()==='zh-CN';
  const normalize=s=>String(s||'').toLowerCase().replace(/[“”"'「」『』·・:：\s_\-]/g,'').replace(/[^a-z0-9\u3400-\u9fff]/g,'');
  const realms={CHAOS:'混沌',AEQUOR:'深海',CARO:'血肉',ULTRA:'超维'};
  const realmIcons={CHAOS:'Hundun',AEQUOR:'Shenhai',CARO:'Xuerou',ULTRA:'Chaowei'};
  const realmMarks={CHAOS:'混',AEQUOR:'海',CARO:'血',ULTRA:'维'};
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
  function localSlugFor(rec){return String(ART_SLUG_GUARD[rec?.id]||rec?.assetSlug||'').split(/[\\/]/).pop().replace(/\.[^.]+$/,'').trim()}
  function assetFor(rec,kind){
    if(!rec)return '';
    const guarded=localSlugFor(rec);
    let raw='';
    if(guarded)raw=`assets/morimens/${kind==='card'?'cards':'portraits'}/${guarded}.webp`;
    else raw=rec.assets?.[kind]||rec.assets?.[kind==='card'?'portrait':'card']||'';
    if(!raw)return '';
    return `${raw}${raw.includes('?')?'&':'?'}v=${assetVersion()}`;
  }

  function ensureUi(){
    const actions=document.querySelector('.fortuneActions');if(actions&&!$('skeydbQuoteBtn')){const b=document.createElement('button');b.id='skeydbQuoteBtn';b.type='button';b.className='ghostBtn';b.textContent='换一句角色台词';b.addEventListener('click',()=>{if(!current)return;quoteIndex++;renderQuote(current)});actions.insertBefore(b,actions.lastElementChild)}
    const tags=document.querySelector('.heroTags');if(tags&&!$('skeydbStatus')){const s=document.createElement('span');s.className='tag';s.id='skeydbStatus';s.textContent='SKeyDB / Wiki：等待同步快照';tags.appendChild(s)}
    const sources=document.querySelector('.sourceList');if(sources&&!$('skeydbAttribution')){const note=document.createElement('div');note.id='skeydbAttribution';note.className='sourceItem';sources.appendChild(note)}
  }

  function allQuotes(rec){
    const zh=zhFor(rec);
    if(isZh()){
      const q=(zh?.voiceLines?.length?zh.voiceLines:zh?.fallbackVoiceLines)||[];
      
      return q.filter(x=>x?.content);
    }
    return rec?.profile?.voiceLines?.filter(x=>x?.content)||[];
  }
  function localizedProfile(rec){
    const zh=zhFor(rec);
    if(isZh())return {name:zh?.name||rec.name,rarity:zh?.profile?.rarity||rec.rarity,realm:zh?.profile?.realm||realms[rec.realm]||rec.realm,type:zh?.profile?.type||types[rec.type]||rec.type,faction:zh?.profile?.faction||rec.faction,birthday:zh?.profile?.birthday||rec.profile?.birthday,voiceActor:zh?.profile?.voiceActor||rec.profile?.voiceActor};
    return {name:rec.name,rarity:rec.rarity,realm:rec.realm,type:rec.type,faction:rec.faction,birthday:rec.profile?.birthday,voiceActor:rec.profile?.voiceActor};
  }
  function localizedEntity(kind,item){
    if(!item)return {name:''};
    if(kind==='awakener')return {...item,...localizedProfile(item),englishName:item.name};
    if(kind==='wheel'){
      const raw=String(item.name||item.englishName||item.label||''),row=wheelZhDb?.bySkeydbId?.[item.id]||wheelZhDb?.byEnglishName?.[raw]||wheelZhDb?.records?.find(x=>normalize(x.englishName)===normalize(raw));
      return {...item,name:isZh()?(row?.name||raw):(row?.englishName||raw),englishName:row?.englishName||raw,zhName:row?.name||null,localizationId:row?.skeydbId||null};
    }
    return {...item,name:String(item.name||item.label||item.id||'')};
  }
  function wheelFor(rec){
    if(!wheelCatalog.length)return null;
    const owned=wheelCatalog.filter(w=>w.ownerAwakenerId===rec.id);
    const realm=wheelCatalog.filter(w=>w.realm===rec.realm&&w.rarity==='SSR');
    const pool=owned.length?owned:(realm.length?realm:wheelCatalog);
    return pool[hash(`${todayKey()}-${rec.id}-wheel`)%pool.length];
  }
  function canonicalWheel(wheel){
    if(!wheel)return null;
    const zh=wheelZhDb?.bySkeydbId?.[wheel.id],assetKey=wheel.assets?.icon,asset=assetKey&&wheelAssets?.assets?.[assetKey];
    if(zh?.skeydbId!==wheel.id||asset?.ownerId!==wheel.id){console.warn('Rejected unbound wheel metadata',wheel.id,zh?.skeydbId,asset?.ownerId);return null}
    return {...wheel,displayName:isZh()?zh.name:(zh.englishName||wheel.name),englishName:zh.englishName||wheel.name,assetId:asset.assetId};
  }
  function wheelArtFor(wheel){
    return wheel?.assetId?`assets/morimens/wheels/${wheel.assetId}.webp?v=${assetVersion()}`:'';
  }
  function usageFor(rec){
    const rows=usageStats?.characters||[],target=normalize(rec?.name),index=rows.findIndex(row=>normalize(row.name)===target||(rec?.aliases||[]).some(alias=>normalize(alias)===normalize(row.name)));
    if(index<0)return {season:usageStats?.seasonId||69,count:0,rate:0,rank:null,total:rows.length,sample:usageStats?.teamCount||0};
    const row=rows[index],sample=Number(usageStats?.teamCount||0),rate=sample?Number(row.count||0)/sample*100:0;
    return {season:usageStats?.seasonId||69,count:Number(row.count||0),rate,rank:index+1,total:rows.length,sample};
  }
  function renderQuote(rec){
    const q=allQuotes(rec),box=$('fortuneQuote');if(!box)return;
    if(!q.length){box.textContent=isZh()?'该角色的中文语音快照尚未同步；不会再用其他角色或英文台词替代。':'No synchronized voice line is available for this character.';return}
    const item=q[((quoteIndex%q.length)+q.length)%q.length];box.innerHTML=`<strong>${escape(item.title||(isZh()?'角色语音':'Voice line'))}</strong><br>“${escape(item.content)}”`;
  }
  function renderSourceStatus(){
    const mapped=zhDb?.mapped??identityDb?.records?.length??0,voices=zhDb?.voiceRecords??0;
    if($('skeydbStatus'))$('skeydbStatus').textContent=isZh()?`数据：SKeyDB ${db?.source?.commit?.slice(0,8)||'—'} · 中文身份 ${mapped}/${db?.count??0} · 中文语音 ${voices}`:`Data: SKeyDB ${db?.source?.commit?.slice(0,8)||'—'} · zh-CN identities ${mapped}/${db?.count??0}`;
    const a=$('skeydbAttribution');if(a)a.innerHTML=isZh()?'<strong>数据来源：</strong>角色数值与卡面来自 <a href="https://github.com/dansa/SKeyDB" target="_blank" rel="noopener noreferrer">dansa/SKeyDB</a>；中文名称与语音参考 <a href="https://morimens.huijiwiki.com/" target="_blank" rel="noopener noreferrer">忘却前夜中文维基</a>。':'<strong>Sources:</strong> Character data and artwork come from <a href="https://github.com/dansa/SKeyDB" target="_blank" rel="noopener noreferrer">dansa/SKeyDB</a>; Chinese names and voice text reference the <a href="https://morimens.huijiwiki.com/" target="_blank" rel="noopener noreferrer">Morimens Chinese HuijiWiki</a>.';
  }
  function render(rec,random=false){
    if(!rec)return;current=rec;const loc=localizedProfile(rec),quotes=allQuotes(rec);quoteIndex=hash(`${todayKey()}-${rec.id}`)%Math.max(1,quotes.length);
    const portrait=$('fortunePortrait');if(portrait){const src=assetFor(rec,'card');portrait.src=src;portrait.hidden=!src;portrait.dataset.awakenerId=rec.id;portrait.dataset.assetSlug=localSlugFor(rec);portrait.alt=`${loc.name} ${isZh()?'完整角色立绘':'full character illustration'}`;portrait.onerror=()=>{portrait.hidden=true}}
    const realmBadge=$('fortuneRealmBadge'),realmIcon=$('fortuneRealmIcon'),realmName=$('fortuneRealmName'),realmKey=Object.keys(realms).find(key=>String(rec.realm||'').toUpperCase()===key)||Object.keys(realms).find(key=>realms[key]===loc.realm);if(realmBadge&&realmIcon&&realmName&&realmKey){realmIcon.hidden=false;realmIcon.src=`assets/morimens/realms-svg/Icon_Career2_${realmIcons[realmKey]}.svg`;realmIcon.alt=`${loc.realm}界域`;realmName.textContent=loc.realm;realmBadge.hidden=false;realmIcon.onerror=()=>{realmIcon.hidden=true;let fallback=realmBadge.querySelector('.fortuneRealmFallback');if(!fallback){fallback=document.createElement('span');fallback.className='fortuneRealmFallback';realmBadge.insertBefore(fallback,realmName)}fallback.textContent=realmMarks[realmKey]||'域';fallback.title=`${loc.realm}界域`}}else if(realmBadge)realmBadge.hidden=true;
    const wheel=canonicalWheel(wheelFor(rec)),wheelName=wheel?.displayName||(isZh()?'命轮数据校验失败':'Wheel data unavailable'),wheelArt=wheelArtFor(wheel);const wheelImage=$('fortuneWheelPortrait');if(wheelImage){wheelImage.src=wheelArt;wheelImage.hidden=!wheelArt;wheelImage.dataset.wheelId=wheel?.id||'';wheelImage.alt=`${wheelName} ${isZh()?'完整命轮立绘':'full wheel illustration'}`;wheelImage.onerror=()=>{wheelImage.hidden=true}}
    if($('fortuneName')){$('fortuneName').textContent=loc.name;$('fortuneName').dataset.awakenerId=rec.id}const mascot=$('morimensMascot');if(mascot){mascot.alt=loc.name;mascot.title=loc.name}
    if($('fortuneDate'))$('fortuneDate').textContent=`${todayKey()}${random?(isZh()?' · 随机再抽':' · Reroll'):''}`;
    renderQuote(rec);
    const seed=hash(`${todayKey()}-${rec.id}`),keywords=[loc.realm,loc.type,wheelName,quotes[quoteIndex]?.title||'角色语音'].filter(Boolean).slice(0,4);if($('fortuneStat'))$('fortuneStat').textContent=`× ${(1+(seed%36)/100).toFixed(2)}`;if($('fortuneKeyword'))$('fortuneKeyword').textContent=keywords.join(' · ');
    const labels=isZh()?['稀有度','界域','类型','阵营','生日','声优']:['Rarity','Realm','Type','Faction','Birthday','Voice actor'];
    const values=[loc.rarity,loc.realm,loc.type,loc.faction,loc.birthday,loc.voiceActor];
    const p=$('skeydbProfile');if(p)p.innerHTML=labels.map((k,i)=>[k,values[i]]).filter(x=>x[1]).map(([k,v])=>`<div style="padding:9px 10px;border-radius:10px;background:rgba(255,255,255,.035);font-size:11px;color:#8f9caf">${escape(k)}<strong style="display:block;color:#e5e7eb;margin-top:3px">${escape(v)}</strong></div>`).join('');
    const wiki=$('wikiBtn'),zh=zhFor(rec);if(wiki){const title=zh?.name||loc.name;wiki.href=zh?.source?.url||`https://morimens.huijiwiki.com/wiki/${encodeURIComponent(title)}`}
    window.dispatchEvent(new CustomEvent('morimens-fortune-render',{detail:{id:rec.id,name:loc.name,realm:loc.realm,type:loc.type,wheelId:wheel?.id||'',wheelName,usage:usageFor(rec),quoteTitle:quotes[quoteIndex]?.title||''}}));
    renderSourceStatus();
  }
  function renderToday(){if(!db?.records?.length)return;render(db.records[hash(todayKey())%db.records.length])}
  function renderRandom(){if(!db?.records?.length)return;render(db.records[Math.floor(Math.random()*db.records.length)],true)}

  async function getJson(url,label){const key=`morimens-snapshot:${url}`,cached=sessionStorage.getItem(key);try{const r=await fetch(url,{cache:'force-cache'});if(!r.ok)throw new Error(`${label} HTTP ${r.status}`);const value=await r.json();try{sessionStorage.setItem(key,JSON.stringify(value))}catch{}return value}catch(error){if(cached){try{return JSON.parse(cached)}catch{}}throw error}}
  async function getCurrentUsageStats(){const manifest=await getJson(USAGE_MANIFEST_URL,'usage manifest'),season=manifest?.currentSeason,entry=(manifest?.availableSeasons||[]).find(x=>Number(x.seasonId)===Number(season)),path=entry?.statsPath||`data/morimens/eremora/stats/${season}.json`;return getJson(path,'usage stats')}
  async function boot(){
    ensureUi();
    try{
      const [enResult,zhResult,idResult,wheelZhResult,wheelResult,wheelAssetsResult,usageResult]=await Promise.allSettled([getJson(DATA_URL,'SKeyDB'),getJson(ZH_URL,'Huiji'),getJson(IDENTITY_URL,'identity'),getJson(WHEEL_ZH_URL,'wheel identity'),window.MorimensRepository?.catalog('wheels'),window.MorimensRepository?.index('assets'),getCurrentUsageStats()]);
      if(enResult.status!=='fulfilled')throw enResult.reason;db=enResult.value;
      if(idResult.status==='fulfilled'){identityDb=idResult.value;identityDb.bySkeydbId=Object.fromEntries((identityDb.records||[]).map(x=>[x.skeydbId,x]))}else console.warn('Chinese identity map unavailable',idResult.reason);
      if(zhResult.status==='fulfilled'&&zhResult.value&&typeof zhResult.value==='object')zhDb=zhResult.value;else console.warn('Chinese Huiji snapshot unavailable',zhResult.reason);
      if(wheelZhResult.status==='fulfilled')wheelZhDb=wheelZhResult.value;else console.warn('Chinese wheel identity map unavailable',wheelZhResult.reason);
      if(wheelResult.status==='fulfilled')wheelCatalog=wheelResult.value?.records||[];
      if(wheelAssetsResult.status==='fulfilled')wheelAssets=wheelAssetsResult.value;
      if(usageResult.status==='fulfilled')usageStats=usageResult.value;else console.warn('Morimens usage stats unavailable',usageResult.reason);
      window.MorimensData={db,zhDb,identityDb,wheelZhDb,language,zhFor,localizedProfile,localizedEntity,assetFor};
      const fortune=$('fortuneBtn'),reroll=$('rerollBtn');
      if(fortune)fortune.addEventListener('click',e=>{e.stopImmediatePropagation();renderToday()},{capture:true});
      if(reroll)reroll.addEventListener('click',e=>{e.stopImmediatePropagation();renderRandom()},{capture:true});
      window.addEventListener('morimens-language-change',()=>{if(current)render(current);else renderToday()});
      renderToday();window.dispatchEvent(new CustomEvent('morimens-data-ready'));
    }catch(err){console.warn('SKeyDB snapshot unavailable',err);if($('skeydbStatus'))$('skeydbStatus').textContent=isZh()?'SKeyDB：快照加载失败':'SKeyDB snapshot unavailable'}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0));else setTimeout(boot,0);
})();

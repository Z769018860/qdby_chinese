(()=>{
  if(window.MorimensAssistList)return;
  const $=id=>document.getElementById(id);
  const zh=()=>localStorage.getItem('morimens.language')!=='en';
  const ui=(cn,en)=>zh()?cn:en;
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const PAGE_SIZE=100;
  let manifest=null,initialized=false,loading=false,activeSeason='69',rows=[],page=1;
  const cache=new Map();

  function style(){
    if($('morimensAssistStyle'))return;
    const s=document.createElement('style');s.id='morimensAssistStyle';s.textContent=`
      .assistFilters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:16px}
      .assistFilterAction{justify-content:end}.assistFilterAction button{min-height:40px}
      .assistNotice{margin-top:12px}.assistTable{min-width:1040px}
      .assistCharacter{display:flex;align-items:center;gap:9px;min-width:160px}.assistCharacter img{width:38px;height:38px;border-radius:9px;object-fit:cover;background:#0b1220;flex:none}.assistCharacter b,.assistCharacter small{display:block}.assistCharacter small{margin-top:3px;color:#7f8da1;font-size:9px}
      .assistUid a{color:#e0bd82;text-decoration:none;font-weight:800}.assistUid a:hover{text-decoration:underline}.assistUid small{display:block;margin-top:3px;color:#718096;font-size:9px}
      .assistGear{display:flex;flex-wrap:wrap;gap:5px}.assistGearTag{display:inline-flex;align-items:center;gap:5px;padding:4px 7px;border:1px solid rgba(148,163,184,.16);border-radius:8px;background:#111827;white-space:nowrap}.assistGearTag img{width:24px;height:24px;border-radius:6px;object-fit:contain;background:#0b1220}
      .assistCount{font-size:16px;color:#f1d69f;font-weight:900;font-variant-numeric:tabular-nums}
      @media(max-width:850px){.assistFilters{grid-template-columns:1fr 1fr}.assistFilterAction{grid-column:span 2}}
      @media(max-width:560px){.assistFilters{grid-template-columns:1fr}.assistFilterAction{grid-column:auto}}
    `;document.head.appendChild(s);
  }

  function memberKey(m){return String(m?.skeydbId||m?.ingameId||m?.id||m?.canonicalName||m?.name||'unknown')}
  function characterInfo(m){
    const db=window.MorimensData?.db?.records||[];
    const rec=db.find(x=>x.id===m?.skeydbId||x.ingameId===m?.ingameId||x.id===m?.id||x.ingameId===m?.id);
    const loc=rec&&window.MorimensData?.localizedProfile?.(rec);
    const name=zh()?(loc?.name||m?.canonicalName||m?.name||rec?.name||memberKey(m)):(rec?.name||m?.canonicalName||m?.name||memberKey(m));
    return {key:rec?.id||memberKey(m),name,image:rec?.assets?.portrait||m?.image||''};
  }
  function wheelName(x){return window.MorimensData?.localizedEntity?.('wheel',x)?.name||x?.name||String(x?.id||ui('未知命轮','Unknown Wheel'))}
  function covenantName(x){return window.MorimensData?.localizedEntity?.('covenant',x)?.name||x?.name||String(x?.id||ui('未知密契','Unknown Covenant'))}
  function enlightLabel(m){
    const p=Number(m?.potencyLevel);
    if(Number.isFinite(p))return p<=3?`${p}启`:`+${p-3}`;
    const n=Number(m?.enlightenCount);
    if(Number.isFinite(n))return n<=3?`${n}启`:String(m?.progression||m?.enlightenMilestone||n);
    return String(m?.progression||m?.enlightenMilestone||ui('未知','Unknown'));
  }
  function gearKey(items){return (items||[]).map(x=>String(x?.id??x?.name??'')).filter(Boolean).sort().join(',')}
  function configKey(uid,m){
    const cov=m?.covenants||(m?.covenant?[m.covenant]:[]);
    return [uid,memberKey(m),m?.level??'',m?.potencyLevel??m?.enlightenCount??m?.progression??'',gearKey(m?.wheels||m?.weapons),gearKey(cov)].join('|');
  }
  function mergeByUid(base,overlay){
    if(!overlay?.records?.length)return base;
    const map=new Map();let anon=0;
    for(const r of base?.records||[]){const uid=String(r?.uid??'');map.set(uid||`__base_${anon++}`,r)}
    for(const r of overlay.records||[]){const uid=String(r?.uid??'');if(uid)map.set(uid,r)}
    const records=[...map.values()];return {...base,records,recordCount:records.length};
  }
  async function datasetFor(id){
    const key=String(id);if(cache.has(key))return cache.get(key);
    const loader=window.MorimensDtideDataLoader;if(!loader?.loadDataset)throw new Error('D-Zone loader unavailable');
    const entry=manifest.availableSeasons?.find(x=>String(x.seasonId)===key);
    if(!entry)throw new Error('Season '+key+' unavailable');
    const source=Number(id)===Number(manifest.currentSeason)&&manifest.usageIndex?.path?manifest.usageIndex.path:entry.path;
    const base=await loader.loadDataset(source);
    let merged=base;
    if(Number(id)===Number(manifest.currentSeason)&&manifest.currentOverlay?.path){
      const overlay=await loader.loadDataset(manifest.currentOverlay.path).catch(()=>null);
      merged=mergeByUid(base,overlay);
    }
    cache.set(key,merged);return merged;
  }
  function extract(dataset){
    const out=new Map(),seen=new Set(),names=new Map((dataset?.records||[]).map(r=>[String(r?.uid??''),String(r?.player||r?.name||'')]));
    for(const record of dataset?.records||[]){
      const borrower=String(record?.uid??'').trim();
      for(const [wi,wave] of (record?.waves||[]).entries())for(const [ti,team] of (wave?.teams||[]).entries())for(const member of team?.members||[]){
        if(!member?.borrowed)continue;
        const uid=String(member?.assistUid??member?.assist_uid??'').trim();
        if(!uid||uid==='0'||uid===borrower)continue;
        const char=characterInfo(member),battle=String(team?.battleUuid||team?.battle_uuid||team?.wid||'').trim();
        const fallback=[borrower,wi,ti,team?.stageId||team?.stageName||'',team?.clearType||'',team?.score??''].join(':');
        const event=[borrower,uid,battle||fallback,String(wave?.wave??wi+1),char.key].join('|');
        if(seen.has(event))continue;seen.add(event);
        const key=configKey(uid,member);
        let row=out.get(key);
        if(!row){
          const wheels=(member?.wheels||member?.weapons||[]).map(x=>({id:String(x?.id??x?.name??''),name:wheelName(x),image:x?.image||''})).filter(x=>x.id||x.name);
          const covs=(member?.covenants||(member?.covenant?[member.covenant]:[])).map(x=>({id:String(x?.id??x?.name??''),name:covenantName(x),image:x?.image||''})).filter(x=>x.id||x.name);
          row={uid,player:names.get(uid)||'',characterKey:char.key,characterName:char.name,characterImage:char.image,level:member?.level??null,enlightenment:enlightLabel(member),wheels,covenants:covs,count:0,borrowers:new Set()};
          out.set(key,row);
        }
        row.count++;if(borrower)row.borrowers.add(borrower);
      }
    }
    return [...out.values()].sort((a,b)=>b.count-a.count||b.borrowers.size-a.borrowers.size||a.uid.localeCompare(b.uid,'en',{numeric:true})||a.characterName.localeCompare(b.characterName,'zh-CN'));
  }
  function optionRows(list,selector){
    const map=new Map();
    for(const row of list)for(const item of selector(row)||[]){const id=String(item?.id||item?.name||'');if(id)map.set(id,item?.name||id)}
    return [...map].sort((a,b)=>String(a[1]).localeCompare(String(b[1]),'zh-CN'));
  }
  function populate(){
    const char=$('assistCharacterFilter'),wheel=$('assistWheelFilter'),cov=$('assistCovenantFilter');if(!char||!wheel||!cov)return;
    const keep=[char.value,wheel.value,cov.value];
    const chars=[...new Map(rows.map(r=>[r.characterKey,r.characterName]))].sort((a,b)=>String(a[1]).localeCompare(String(b[1]),'zh-CN'));
    char.innerHTML='<option value="">'+ui('全部角色','All Awakeners')+'</option>'+chars.map(([id,name])=>'<option value="'+esc(id)+'">'+esc(name)+'</option>').join('');
    wheel.innerHTML='<option value="">'+ui('全部命轮','All Wheels')+'</option>'+optionRows(rows,r=>r.wheels).map(([id,name])=>'<option value="'+esc(id)+'">'+esc(name)+'</option>').join('');
    cov.innerHTML='<option value="">'+ui('全部密契','All Covenants')+'</option>'+optionRows(rows,r=>r.covenants).map(([id,name])=>'<option value="'+esc(id)+'">'+esc(name)+'</option>').join('');
    [char,wheel,cov].forEach((el,i)=>{if([...el.options].some(o=>o.value===keep[i]))el.value=keep[i]});
  }
  function filtered(){
    const uid=String($('assistUidFilter')?.value||'').trim(),char=$('assistCharacterFilter')?.value||'',wheel=$('assistWheelFilter')?.value||'',cov=$('assistCovenantFilter')?.value||'';
    return rows.filter(r=>(!uid||r.uid.includes(uid))&&(!char||r.characterKey===char)&&(!wheel||r.wheels.some(x=>String(x.id||x.name)===wheel))&&(!cov||r.covenants.some(x=>String(x.id||x.name)===cov)));
  }
  function gear(items){
    if(!items?.length)return '<span class="assistGearTag">'+ui('无记录','No record')+'</span>';
    return '<div class="assistGear">'+items.map(x=>'<span class="assistGearTag">'+(x.image?'<img src="'+esc(x.image)+'" alt="" loading="lazy" onerror="this.hidden=true">':'')+'<span>'+esc(x.name)+'</span></span>').join('')+'</div>';
  }
  function render(){
    const list=filtered(),pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE));page=Math.min(page,pages);
    const shown=list.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE),uses=list.reduce((n,r)=>n+r.count,0),uids=new Set(list.map(r=>r.uid)),chars=new Set(list.map(r=>r.characterKey));
    if($('assistSummary'))$('assistSummary').innerHTML=[[ui('助战提供者','Assist Providers'),uids.size],[ui('助战配置','Assist Configurations'),list.length],[ui('被使用次数','Times Borrowed'),uses],[ui('助战角色','Assist Awakeners'),chars.size]].map(([a,b])=>'<div class="dtideStat"><small>'+esc(a)+'</small><strong>'+esc(b)+'</strong></div>').join('');
    const host=$('assistTable');
    if(host)host.innerHTML=shown.length?'<table class="dtideTable assistTable"><thead><tr><th>'+ui('玩家 UID','Player UID')+'</th><th>'+ui('挂的助战角色','Assist Awakener')+'</th><th>'+ui('等级','Level')+'</th><th>'+ui('启灵','Enlighten')+'</th><th>'+ui('命轮','Wheel')+'</th><th>'+ui('密契','Covenant')+'</th><th>'+ui('融灾中被使用次数','D-Zone Uses')+'</th></tr></thead><tbody>'+shown.map(r=>'<tr><td class="assistUid"><a href="https://eremora.com/u/'+encodeURIComponent(r.uid)+'" target="_blank" rel="noopener noreferrer">'+esc(r.uid)+'</a>'+(r.player?'<small>'+esc(r.player)+'</small>':'')+'</td><td><div class="assistCharacter">'+(r.characterImage?'<img src="'+esc(r.characterImage)+'" alt="" loading="lazy" onerror="this.hidden=true">':'')+'<span><b>'+esc(r.characterName)+'</b><small>'+ui('被 ','Borrowed by ')+r.borrowers.size+ui(' 名玩家',' players')+'</small></span></div></td><td>'+esc(r.level??'—')+'</td><td>'+esc(r.enlightenment||'—')+'</td><td>'+gear(r.wheels)+'</td><td>'+gear(r.covenants)+'</td><td><span class="assistCount">'+r.count+'</span></td></tr>').join('')+'</tbody></table>':'<div class="dtideEmpty">'+ui('当前筛选条件下没有助战配置记录。','No assist configurations match the current filters.')+'</div>';
    const pager=$('assistPager');
    if(pager)pager.innerHTML=pages>1?'<button type="button" class="ghostBtn" id="assistPrev" '+(page<=1?'disabled':'')+'>'+ui('上一页','Previous')+'</button><span>'+ui('第 ','Page ')+page+' / '+pages+ui(' 页','')+' · '+list.length+ui(' 条',' rows')+'</span><button type="button" class="ghostBtn" id="assistNext" '+(page>=pages?'disabled':'')+'>'+ui('下一页','Next')+'</button>':'<span>'+list.length+ui(' 条配置',' configurations')+'</span>';
    $('assistPrev')?.addEventListener('click',()=>{if(page>1){page--;render()}});
    $('assistNext')?.addEventListener('click',()=>{if(page<pages){page++;render()}});
    if($('morimensAssistStatus'))$('morimensAssistStatus').textContent=ui('第 ','Season ')+activeSeason+ui(' 期 · 已载入',' · Loaded');
  }
  async function load(id){
    activeSeason=String(id);page=1;
    if($('morimensAssistStatus'))$('morimensAssistStatus').textContent=ui('正在载入…','Loading…');
    if($('assistTable'))$('assistTable').innerHTML='<div class="dtideEmpty">'+ui('正在读取助战配置…','Loading assist configurations…')+'</div>';
    const data=await datasetFor(activeSeason);rows=extract(data);populate();render();
    const note=$('assistCoverageNote'),count=Number(data?.recordCount||data?.records?.length||0);
    if(note)note.innerHTML=zh()
      ?'第 <b>'+activeSeason+'</b> 期从仓库现有 <b>'+count+'</b> 条玩家记录中提取。仅统计 <code>borrowed=true</code> 且带 <code>assistUid</code> 的实际借用；相同借用玩家、助战提供者、战斗、波次与角色会去重。同一 UID 同一角色若观测到不同等级、启灵、命轮或密契，会拆成不同配置行。'
      :'Season <b>'+activeSeason+'</b> is extracted from <b>'+count+'</b> stored player records. Only actual borrows with <code>borrowed=true</code> and an <code>assistUid</code> are counted. Duplicate borrower/provider/battle/wave/Awakener events are removed, while distinct observed builds remain separate rows.';
  }
  function bind(){
    $('assistSeason')?.addEventListener('change',()=>load($('assistSeason').value).catch(error));
    for(const id of ['assistCharacterFilter','assistWheelFilter','assistCovenantFilter'])$(id)?.addEventListener('change',()=>{page=1;render()});
    $('assistUidFilter')?.addEventListener('input',()=>{page=1;render()});
    $('assistReset')?.addEventListener('click',()=>{for(const id of ['assistUidFilter','assistCharacterFilter','assistWheelFilter','assistCovenantFilter'])if($(id))$(id).value='';page=1;render()});
  }
  function error(e){
    console.error('Assist list load failed',e);
    if($('morimensAssistStatus'))$('morimensAssistStatus').textContent=ui('载入失败','Load failed');
    if($('assistTable'))$('assistTable').innerHTML='<div class="dtideEmpty">'+ui('助战列表载入失败：','Assist list failed to load: ')+esc(e?.message||e)+'</div>';
  }
  async function init(){
    if(initialized||loading)return;loading=true;style();
    try{
      for(let i=0;i<50&&!$('morimensAssistPanel');i++)await new Promise(r=>setTimeout(r,100));
      if(!$('morimensAssistPanel'))return;
      const response=await fetch('data/morimens/eremora/manifest.json',{cache:'no-store'});if(!response.ok)throw new Error('manifest HTTP '+response.status);
      manifest=await response.json();bind();initialized=true;await load($('assistSeason')?.value||'69');
    }catch(e){error(e)}finally{loading=false}
  }
  function relocalize(){
    if($('morimensAssistTab'))$('morimensAssistTab').textContent=ui('互助助战列表','Assist List');
    if($('morimensAssistTitle'))$('morimensAssistTitle').textContent=ui('互助助战列表','Assist List');
    if(initialized){rows=rows.map(r=>({...r}));populate();render()}
  }
  window.MorimensAssistList={open:init,reload:()=>load($('assistSeason')?.value||activeSeason)};
  window.addEventListener('morimens-assist-list-open',init);
  window.addEventListener('morimens-language-change',relocalize);
  window.addEventListener('morimens-data-ready',()=>{if(initialized)load(activeSeason).catch(error)});
  if(location.hash==='#assist')init();
})();
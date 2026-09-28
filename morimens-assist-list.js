(()=>{
  if(window.MorimensAssistList)return;
  const $=id=>document.getElementById(id);
  const zh=()=>localStorage.getItem('morimens.language')!=='en';
  const ui=(cn,en)=>zh()?cn:en;
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function decodeMojibake(value){const text=String(value??'');if(!/[ÃÂæåçèéêëìíîïðñòóôõö÷øùúûüýþã]/.test(text)||typeof TextDecoder==='undefined')return text;try{const bytes=Uint8Array.from([...text].map(ch=>ch.charCodeAt(0)&255));const fixed=new TextDecoder('utf-8',{fatal:true}).decode(bytes);return /�/.test(fixed)?text:fixed}catch{return text}}
  function cleanPlayerName(value){return decodeMojibake(value).replace(/^<#[^>]+>\s*/,'').trim()}
  const PAGE_SIZE=100;
  let manifest=null,initialized=false,loading=false,activeSeason='all',rows=[],page=1;
  const cache=new Map(),playerNames=new Map();
  const gear={assets:{},wheels:[],covenants:[]};
  const zhCovenants={
    'Deus Ex Machina':'机械降神','Re-evolution':'再衍化','Scarlet Embrace':'猩红之拥','Crimson Pulse':'猩红之悸',
    'Twisted Twins: Black':'扭曲双子·黑',"Burial Ground's Sighs":'埋骨地絮语','Twisted Twins: White':'扭曲双子·白',
    'Cursed Rabbit':'诅咒兔','Paradox':'二律背反','Photosynthesis Ritual':'光合祭礼','Returnal Line':'海归线',
    'Ring of Chamber 36':'36室之环','Life Drain':'生机榨取','April Tribute':'四月礼赞','Organic Form':'有机形态',
    'Sweet Slug':'甜蜜蛞蝓','Dream of Medicine':'入药之梦','Feast from Afar':'远方的欢宴',
    'Unstained Chronicle':'无垢启示录','Steppenwolf':'荒原狼','Cocoon of the Maiden':'少女之蛹'
  };
  const statZh={
    'ATK':'攻击','Attack':'攻击','HP':'生命','Health':'生命','DEF':'防御','Defense':'防御',
    'Crit Rate':'暴击率','CRIT Rate':'暴击率','CritRate':'暴击率','CRIT_RATE':'暴击率',
    'Crit DMG':'暴击伤害','Crit Damage':'暴击伤害','CritDamage':'暴击伤害','CRIT_DMG':'暴击伤害',
    'Damage Amplification':'伤害强效','DMG Amplification':'伤害强效','DMG_AMP':'伤害强效',
    'Realm Mastery':'界域精通','REALM_MASTERY':'界域精通','Aliemus Regen':'异质回复',
    'Keyflare Regen':'钥令回复','Sigil Yield':'灵纹获取','Death Resistance':'死亡抗性',
    'Vulnerability':'易伤','Vulnerable':'易伤','Strength':'力量','STR':'力量',
    'Poison Infliction':'中毒施加','Counter Generation':'反击生成'
  };

  function style(){
    if($('morimensAssistStyle'))return;
    const s=document.createElement('style');s.id='morimensAssistStyle';s.textContent=`
      .assistFilters{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:16px}
      .assistFilterAction{justify-content:end}.assistFilterAction button{min-height:40px}
      .assistNotice{margin-top:12px}.assistTable{min-width:1180px}
      .assistCharacter{display:flex;align-items:center;gap:9px;min-width:160px}.assistCharacter img{width:42px;height:42px;border-radius:9px;object-fit:cover;background:#0b1220;flex:none}.assistCharacter b,.assistCharacter small{display:block}.assistCharacter small{margin-top:3px;color:#7f8da1;font-size:9px}
      .assistUid a{color:#e0bd82;text-decoration:none;font-weight:800}.assistUid a:hover{text-decoration:underline}.assistUid strong{display:block;margin-top:3px;color:#d9e1eb;font-size:11px}.assistUid small{display:block;margin-top:2px;color:#718096;font-size:9px}.assistUidLine{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.assistCopyUid{border:1px solid rgba(224,189,130,.35);background:rgba(224,189,130,.08);color:#e8ca91;border-radius:7px;padding:3px 7px;font-size:9px;cursor:pointer}.assistCopyUid:hover{background:rgba(224,189,130,.16)}.assistCopyUid.copied{color:#8ed9b1;border-color:rgba(142,217,177,.4)}.assistGrowth{display:flex;flex-wrap:wrap;gap:4px;min-width:120px}.assistGrowth span{padding:3px 6px;border-radius:7px;background:rgba(255,255,255,.035);border:1px solid rgba(148,163,184,.15);font-size:9px;color:#c3cedd}.assistGuideBanner{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:14px 0 2px;padding:14px 17px;border:1px solid rgba(245,194,104,.55);border-radius:12px;background:linear-gradient(100deg,rgba(104,61,12,.42),rgba(217,167,75,.12));box-shadow:0 0 22px rgba(217,167,75,.08);color:#ffe2a7;text-decoration:none;font-weight:900}.assistGuideBanner:hover{border-color:#f0c36f;background:linear-gradient(100deg,rgba(123,72,13,.5),rgba(217,167,75,.18))}.assistGuideBanner span{color:#fff3d7;font-size:11px}
      .assistGear{display:flex;flex-wrap:wrap;gap:7px;align-items:flex-start}.assistGearCard{display:grid;grid-template-columns:34px minmax(0,1fr);gap:7px;align-items:start;min-width:145px;max-width:230px;padding:6px 8px;border:1px solid rgba(148,163,184,.16);border-radius:9px;background:#111827}.assistGearCard>img{width:34px;height:34px;border-radius:7px;object-fit:contain;background:#0b1220}.assistGearCard b{display:block;font-size:10px;color:#e9eef5;line-height:1.25}.assistGearCard small{display:block;margin-top:2px;color:#8794a6;font-size:9px;line-height:1.3}.assistGearTextOnly{grid-template-columns:minmax(0,1fr)}.assistAttrList{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:4px;margin-top:2px}.assistAttr{padding:2px 5px;border-radius:6px;background:rgba(217,179,108,.09);border:1px solid rgba(217,179,108,.16);color:#d9c59e;font-size:8px;line-height:1.25;white-space:nowrap}.assistSuitLine{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px}.assistSuitTag,.assistSeasonTag{display:inline-flex;align-items:center;padding:3px 6px;border-radius:7px;border:1px solid rgba(148,163,184,.17);background:rgba(255,255,255,.035);font-size:9px;color:#b6c0ce}.assistCount{font-size:16px;color:#f1d69f;font-weight:900;font-variant-numeric:tabular-nums}
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
  function normName(value){return String(value||'').normalize('NFKC').toLowerCase().replace(/[·・:\-_'’“”"\s]/g,'')}
  function localAssetPath(record){
    const key=record?.assets?.icon,asset=key&&gear.assets?.[key],raw=asset?.availability?.path||'';
    return raw?raw.replace(/^src\/assets\//,'assets/morimens/'):'';
  }
  function fallbackLocalImage(raw,kind){
    const clean=String(raw||'').split('?')[0],name=decodeURIComponent(clean.split('/').pop()||'');
    if(kind==='wheel'&&/^Weapon_(?:Full|Mini)_[^/]+\.webp$/i.test(name))return name.includes('Weapon_Mini_')?'assets/morimens/wheels/Mini/'+name:'assets/morimens/wheels/'+name;
    if(kind==='covenant'&&/^Icon_Trinket_[^/]+\.webp$/i.test(name))return 'assets/morimens/covenants/Icon/'+name;
    return '';
  }
  function wheelRecord(x){
    const id=String(x?.id||''),name=normName(x?.name);
    return gear.wheels.find(r=>String(r.id)===id||normName(r.name)===name||normName(window.MorimensData?.localizedEntity?.('wheel',r)?.name)===name)||null;
  }
  function covenantRecord(x){
    const id=String(x?.id||''),name=normName(x?.name);
    return gear.covenants.find(r=>String(r.id)===id||normName(r.name)===name||normName(zhCovenants[r.name])===name)||null;
  }
  function wheelName(x){const r=wheelRecord(x);return r?(window.MorimensData?.localizedEntity?.('wheel',r)?.name||r.name):(window.MorimensData?.localizedEntity?.('wheel',x)?.name||x?.name||String(x?.id||ui('未知命轮','Unknown Wheel')))}
  function covenantName(x){const r=covenantRecord(x),raw=r?.name||x?.name||String(x?.id||ui('未知密契','Unknown Covenant'));return zh()?(zhCovenants[raw]||raw):raw}
  function wheelImage(x){const r=wheelRecord(x);return localAssetPath(r)||fallbackLocalImage(x?.image,'wheel')||x?.image||''}
  function covenantImage(x){const r=covenantRecord(x);return localAssetPath(r)||fallbackLocalImage(x?.image,'covenant')||x?.image||''}
  async function loadGearMetadata(){
    const repo=window.MorimensRepository;if(!repo)return;
    const [w,c,a]=await Promise.allSettled([repo.catalog('wheels'),repo.catalog('covenants'),repo.index('assets')]);
    gear.wheels=w.status==='fulfilled'?(w.value?.records||[]):[];
    gear.covenants=c.status==='fulfilled'?(c.value?.records||[]):[];
    gear.assets=a.status==='fulfilled'?(a.value?.assets||{}):{};
  }
  function enlightLabel(m){
    const p=Number(m?.potencyLevel);
    if(Number.isFinite(p))return p<=3?`${p}启`:`+${p-3}`;
    const n=Number(m?.enlightenCount);
    if(Number.isFinite(n))return n<=3?`${n}启`:String(m?.progression||m?.enlightenMilestone||n);
    return String(m?.progression||m?.enlightenMilestone||ui('未知','Unknown'));
  }
  function statName(attr){const raw=String(attr?.name||attr?.id||ui('词条','Stat'));return zh()?(statZh[raw]||raw):raw}
  function attrText(attr){
    const name=statName(attr);
    const raw=Number(attr?.value);
    if(!Number.isFinite(raw))return name;
    if(attr?.percentage){
      const v=attr?.percentPoints===true?raw:(Math.abs(raw)<=1?raw*100:raw);
      const digits=Math.abs(v)<10?2:1;
      return name+' '+v.toFixed(digits).replace(/\.0+$/,'').replace(/(\.\d*[1-9])0+$/,'$1')+'%';
    }
    return name+' '+String(Number.isInteger(raw)?raw:Number(raw.toFixed(2)));
  }
  function aggregateAttrs(items){
    const map=new Map();
    for(const item of items||[])for(const a of item?.attrs||[]){
      const id=String(a?.id||a?.name||'').trim();if(!id)continue;
      const percentage=!!a?.percentage,key=id+'|'+(percentage?1:0),raw=Number(a?.value);
      const row=map.get(key)||{id,name:a?.name||id,value:0,percentage,percentPoints:percentage,count:0};
      if(Number.isFinite(raw))row.value+=percentage&&Math.abs(raw)<=1?raw*100:raw;row.count++;map.set(key,row);
    }
    return [...map.values()].sort((a,b)=>statName(a).localeCompare(statName(b),'zh-CN'));
  }
  function attrsKey(items){return aggregateAttrs(items).map(a=>[a.id,a.value,a.percentage?1:0].join(':')).join(',')}
  function gearKey(items){return (items||[]).map(x=>String(x?.id??x?.name??'')).filter(Boolean).sort().join(',')}
  function compactLevels(value){
    if(value==null)return '';
    if(Array.isArray(value))return value.map(v=>typeof v==='object'?(v.level??v.lv??v.value??v.rank??''):v).filter(v=>v!==''&&v!=null).join('/');
    if(typeof value==='object')return Object.values(value).map(v=>typeof v==='object'?(v.level??v.lv??v.value??v.rank??''):v).filter(v=>['number','string'].includes(typeof v)&&String(v)!=='').join('/');
    return String(value);
  }
  function progressionKey(m){return [m?.breakLevel??m?.break_level??'',compactLevels(m?.potential??m?.skillLevels??m?.skills),m?.likeLevel??m?.like_level??'',m?.fighting??''].join('|')}
  function configKey(uid,m){
    const cov=m?.covenants||(m?.covenant?[m.covenant]:[]);
    const trinkets=m?.trinkets||[];
    return [uid,memberKey(m),m?.level??'',m?.potencyLevel??m?.enlightenCount??m?.progression??'',progressionKey(m),gearKey(m?.wheels||m?.weapons),gearKey(cov),attrsKey(trinkets)].join('|');
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
  async function bundleFor(id){
    if(String(id)==='all'){
      const [s68,s69]=await Promise.all([datasetFor('68'),datasetFor('69')]);
      return [{seasonId:'68',data:s68},{seasonId:'69',data:s69}];
    }
    return [{seasonId:String(id),data:await datasetFor(id)}];
  }
  async function loadTop1000Names(){
    const loader=window.MorimensDtideDataLoader;if(!loader?.loadJson)return;
    const docs=await Promise.all(['68','69'].map(id=>loader.loadJson('data/morimens/eremora/top1000/'+id+'.json',{fresh:false}).catch(()=>null)));
    for(const doc of docs)for(const user of doc?.users||[]){
      const uid=String(user?.uid??'').trim(),name=cleanPlayerName(user?.player||user?.name||'');
      if(uid&&name)playerNames.set(uid,name);
    }
  }
  function indexPlayerNames(bundle){
    for(const {data} of bundle)for(const record of data?.records||[]){
      const uid=String(record?.uid??'').trim(),name=cleanPlayerName(record?.player||record?.name||'');
      if(uid&&name)playerNames.set(uid,name);
    }
  }
  function extract(bundle){
    indexPlayerNames(bundle);
    const out=new Map(),seen=new Set();
    for(const {seasonId,data} of bundle){
      for(const record of data?.records||[]){
        const borrower=String(record?.uid??'').trim();
        for(const [wi,wave] of (record?.waves||[]).entries())for(const [ti,team] of (wave?.teams||[]).entries())for(const member of team?.members||[]){
          if(!member?.borrowed)continue;
          const uid=String(member?.assistUid??member?.assist_uid??'').trim();
          if(!uid||uid==='0'||uid===borrower)continue;
          const char=characterInfo(member),battle=String(team?.battleUuid||team?.battle_uuid||team?.wid||'').trim();
          const fallback=[borrower,wi,ti,team?.stageId||team?.stageName||'',team?.clearType||'',team?.score??''].join(':');
          const event=[seasonId,borrower,uid,battle||fallback,String(wave?.wave??wi+1),char.key].join('|');
          if(seen.has(event))continue;seen.add(event);
          const key=configKey(uid,member);
          let row=out.get(key);
          if(!row){
            const wheels=(member?.wheels||member?.weapons||[]).map(x=>{const r=wheelRecord(x);return {id:String(r?.id??x?.id??x?.name??''),name:wheelName(x),image:wheelImage(x),level:x?.level??null,enhanceLevel:x?.enhanceLevel??x?.enhance_level??null}}).filter(x=>x.id||x.name);
            const covs=(member?.covenants||(member?.covenant?[member.covenant]:[])).map(x=>{const r=covenantRecord(x);return {id:String(r?.id??x?.id??x?.name??''),name:covenantName(x),image:covenantImage(x),count:x?.count??null}}).filter(x=>x.id||x.name);
            const trinkets=(member?.trinkets||[]).map(x=>({id:String(x?.id??x?.name??''),name:String(x?.name||x?.id||ui('密契','Covenant')),image:fallbackLocalImage(x?.image,'covenant')||x?.image||'',slot:x?.slot??null,level:x?.level??null,enhanceLevel:x?.enhanceLevel??x?.enhance_level??null,attrs:(x?.attrs||[]).map(a=>({id:a?.id,name:a?.name,value:a?.value,percentage:!!a?.percentage}))}));
            row={uid,player:playerNames.get(uid)||'',characterKey:char.key,characterName:char.name,characterImage:char.image,level:member?.level??null,enlightenment:enlightLabel(member),breakLevel:member?.breakLevel??member?.break_level??null,skills:compactLevels(member?.potential??member?.skillLevels??member?.skills),likeLevel:member?.likeLevel??member?.like_level??null,fighting:member?.fighting??null,wheels,covenants:covs,trinkets,finalAttrs:aggregateAttrs(trinkets),count:0,borrowers:new Set(),seasons:new Set()};
            out.set(key,row);
          }
          if(!row.player&&playerNames.has(uid))row.player=playerNames.get(uid);
          row.count++;row.seasons.add(String(seasonId));if(borrower)row.borrowers.add(borrower);
        }
      }
    }
    return [...out.values()].sort((a,b)=>b.count-a.count||b.borrowers.size-a.borrowers.size||a.uid.localeCompare(b.uid,'en',{numeric:true})||a.characterName.localeCompare(b.characterName,'zh-CN'));
  }
  function optionRows(list,selector){
    const map=new Map();
    for(const row of list)for(const item of selector(row)||[]){const id=String(item?.id||item?.name||'');if(id)map.set(id,item?.name||id)}
    return [...map].sort((a,b)=>String(a[1]).localeCompare(String(b[1]),'zh-CN'));
  }
  function covenantOptions(){
    const map=new Map();
    for(const row of rows)for(const x of row.covenants||[]){const id=String(x?.id||x?.name||'');if(id)map.set(id,x?.name||id)}
    return [...map].sort((a,b)=>String(a[1]).localeCompare(String(b[1]),'zh-CN'));
  }
  function populate(){
    const char=$('assistCharacterFilter'),wheel=$('assistWheelFilter'),cov=$('assistCovenantFilter');if(!char||!wheel||!cov)return;
    const keep=[char.value,wheel.value,cov.value];
    const chars=[...new Map(rows.map(r=>[r.characterKey,r.characterName]))].sort((a,b)=>String(a[1]).localeCompare(String(b[1]),'zh-CN'));
    char.innerHTML='<option value="">'+ui('全部角色','All Awakeners')+'</option>'+chars.map(([id,name])=>'<option value="'+esc(id)+'">'+esc(name)+'</option>').join('');
    wheel.innerHTML='<option value="">'+ui('全部命轮','All Wheels')+'</option>'+optionRows(rows,r=>r.wheels).map(([id,name])=>'<option value="'+esc(id)+'">'+esc(name)+'</option>').join('');
    cov.innerHTML='<option value="">'+ui('全部密契','All Covenants')+'</option>'+covenantOptions().map(([id,name])=>'<option value="'+esc(id)+'">'+esc(name)+'</option>').join('');
    [char,wheel,cov].forEach((el,i)=>{if([...el.options].some(o=>o.value===keep[i]))el.value=keep[i]});
  }
  function filtered(){
    const uid=String($('assistUidFilter')?.value||'').trim(),char=$('assistCharacterFilter')?.value||'',wheel=$('assistWheelFilter')?.value||'',cov=$('assistCovenantFilter')?.value||'';
    return rows.filter(r=>{
      if(uid&&!r.uid.includes(uid)&&!String(r.player||'').toLowerCase().includes(uid.toLowerCase()))return false;
      if(char&&r.characterKey!==char)return false;
      if(wheel&&!r.wheels.some(x=>String(x.id||x.name)===wheel))return false;
      if(cov&&!r.covenants.some(x=>String(x.id||x.name)===cov))return false;
      return true;
    });
  }
  function wheelCards(items){
    if(!items?.length)return '<span class="assistSuitTag">'+ui('无记录','No record')+'</span>';
    return '<div class="assistGear">'+items.map(x=>'<div class="assistGearCard'+(x.image?'':' assistGearTextOnly')+'">'+(x.image?'<img src="'+esc(x.image)+'" alt="" loading="lazy" onerror="this.hidden=true">':'')+'<div><b>'+esc(x.name)+'</b>'+(x.level!=null?'<small>Lv.'+esc(x.level)+(x.enhanceLevel!=null?' · +'+esc(x.enhanceLevel):'')+'</small>':'')+'</div></div>').join('')+'</div>';
  }
  function covenantSummary(row){
    const suits=row.covenants||[],attrs=row.finalAttrs||aggregateAttrs(row.trinkets||[]);
    const suitHtml=suits.length?'<div class="assistGear">'+suits.map(x=>'<div class="assistGearCard'+(x.image?'':' assistGearTextOnly')+'">'+(x.image?'<img src="'+esc(x.image)+'" alt="" loading="lazy" onerror="this.hidden=true">':'')+'<div><b>'+esc(x.name)+'</b><small>'+esc(x.count!=null?(x.count+ui(' 件',' pieces')):ui('密契套装','Covenant set'))+'</small></div></div>').join('')+'</div>':'<span class="assistSuitTag">'+ui('无套装记录','No set record')+'</span>';
    const attrHtml=attrs.length?'<div class="assistAttrList">'+attrs.map(a=>'<span class="assistAttr">'+esc(attrText(a))+'</span>').join('')+'</div>':'<div class="assistAttrList"><span class="assistAttr">'+ui('无可汇总词条','No aggregate stats')+'</span></div>';
    return suitHtml+attrHtml;
  }
  function growthHtml(row){
    const items=[];if(row.skills)items.push(ui('技能 ','Skills ')+row.skills);if(row.breakLevel!=null)items.push(ui('灵塑 ','Soulforge ')+row.breakLevel);if(row.likeLevel!=null)items.push(ui('好感 ','Bond ')+row.likeLevel);if(row.fighting!=null)items.push(ui('战力 ','Power ')+row.fighting);
    return '<div class="assistGrowth">'+(items.length?items.map(x=>'<span>'+esc(x)+'</span>').join(''):'<span>'+ui('暂无记录','No record')+'</span>')+'</div>';
  }
  async function copyUid(uid,button){
    try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(uid);else{const t=document.createElement('textarea');t.value=uid;t.style.position='fixed';t.style.opacity='0';document.body.appendChild(t);t.select();document.execCommand('copy');t.remove()}button.textContent=ui('已复制','Copied');button.classList.add('copied');setTimeout(()=>{button.textContent=ui('复制 UID','Copy UID');button.classList.remove('copied')},1200)}catch(e){console.warn('UID copy failed',e)}
  }
  function seasonTags(row){
    return [...(row.seasons||[])].sort((a,b)=>Number(a)-Number(b)).map(s=>'<span class="assistSeasonTag">'+ui('第 '+s+' 期','Season '+s)+'</span>').join('');
  }
  function render(){
    const list=filtered(),pages=Math.max(1,Math.ceil(list.length/PAGE_SIZE));page=Math.min(page,pages);
    const shown=list.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE),uses=list.reduce((n,r)=>n+r.count,0),uids=new Set(list.map(r=>r.uid)),chars=new Set(list.map(r=>r.characterKey));
    if($('assistSummary'))$('assistSummary').innerHTML=[[ui('助战提供者','Assist Providers'),uids.size],[ui('助战配置','Assist Configurations'),list.length],[ui('被使用次数','Times Borrowed'),uses],[ui('助战角色','Assist Awakeners'),chars.size]].map(([a,b])=>'<div class="dtideStat"><small>'+esc(a)+'</small><strong>'+esc(b)+'</strong></div>').join('');
    const host=$('assistTable');
    if(host)host.innerHTML=shown.length?'<table class="dtideTable assistTable"><thead><tr><th>'+ui('玩家 UID / 玩家名','Player UID / Name')+'</th><th>'+ui('挂的助战角色','Assist Awakener')+'</th><th>'+ui('等级','Level')+'</th><th>'+ui('启灵','Enlighten')+'</th><th>'+ui('技能 / 灵塑等养成','Skills / Progression')+'</th><th>'+ui('命轮','Wheel')+'</th><th>'+ui('密契 / 最终词条','Covenant / Final Stats')+'</th><th>'+ui('期次','Season')+'</th><th>'+ui('融灾中被使用次数','D-Zone Uses')+'</th></tr></thead><tbody>'+shown.map(r=>'<tr><td class="assistUid"><div class="assistUidLine"><a href="https://eremora.com/u/'+encodeURIComponent(r.uid)+'" target="_blank" rel="noopener noreferrer">'+esc(r.uid)+'</a><button type="button" class="assistCopyUid" data-copy-uid="'+esc(r.uid)+'">'+ui('复制 UID','Copy UID')+'</button></div>'+(r.player?'<strong>'+esc(r.player)+'</strong>':'<small>'+ui('未在现有68/69玩家记录中匹配到名字','Name not found in stored S68/S69 player records')+'</small>')+'</td><td><div class="assistCharacter">'+(r.characterImage?'<img src="'+esc(r.characterImage)+'" alt="" loading="lazy" onerror="this.hidden=true">':'')+'<span><b>'+esc(r.characterName)+'</b><small>'+ui('被 ','Borrowed by ')+r.borrowers.size+ui(' 名玩家',' players')+'</small></span></div></td><td>'+esc(r.level??'—')+'</td><td>'+esc(r.enlightenment||'—')+'</td><td>'+growthHtml(r)+'</td><td>'+wheelCards(r.wheels)+'</td><td>'+covenantSummary(r)+'</td><td><div class="assistSuitLine">'+seasonTags(r)+'</div></td><td><span class="assistCount">'+r.count+'</span></td></tr>').join('')+'</tbody></table>':'<div class="dtideEmpty">'+ui('当前筛选条件下没有助战配置记录。','No assist configurations match the current filters.')+'</div>';
    host?.querySelectorAll('[data-copy-uid]').forEach(btn=>btn.addEventListener('click',()=>copyUid(btn.dataset.copyUid,btn)));
    const pager=$('assistPager');
    if(pager)pager.innerHTML=pages>1?'<button type="button" class="ghostBtn" id="assistPrev" '+(page<=1?'disabled':'')+'>'+ui('上一页','Previous')+'</button><span>'+ui('第 ','Page ')+page+' / '+pages+ui(' 页','')+' · '+list.length+ui(' 条',' rows')+'</span><button type="button" class="ghostBtn" id="assistNext" '+(page>=pages?'disabled':'')+'>'+ui('下一页','Next')+'</button>':'<span>'+list.length+ui(' 条配置',' configurations')+'</span>';
    $('assistPrev')?.addEventListener('click',()=>{if(page>1){page--;render()}});
    $('assistNext')?.addEventListener('click',()=>{if(page<pages){page++;render()}});
    if($('morimensAssistStatus'))$('morimensAssistStatus').textContent=activeSeason==='all'?ui('全部期次 · 已载入','All Seasons · Loaded'):(ui('第 ','Season ')+activeSeason+ui(' 期 · 已载入',' · Loaded'));
  }
  async function load(id){
    activeSeason=String(id||'all');page=1;
    if($('morimensAssistStatus'))$('morimensAssistStatus').textContent=ui('正在载入…','Loading…');
    if($('assistTable'))$('assistTable').innerHTML='<div class="dtideEmpty">'+ui('正在读取助战配置…','Loading assist configurations…')+'</div>';
    const bundle=await bundleFor(activeSeason);rows=extract(bundle);populate();render();
    const note=$('assistCoverageNote');
    if(note){
      const counts=bundle.map(({seasonId,data})=>'第 '+seasonId+' 期 '+Number(data?.recordCount||data?.records?.length||0)+' 条').join(' + ');
      note.innerHTML=zh()
        ?(activeSeason==='all'?'当前为 <b>全部期次</b>，合并统计 '+counts+'。':'当前统计 <b>第 '+activeSeason+' 期</b>。')+' 仅统计 <code>borrowed=true</code> 且带 <code>assistUid</code> 的实际借用；相同借用玩家、助战提供者、期次、战斗、波次与角色会去重。同一 UID 同一角色若观测到不同等级、启灵、命轮、密契或密契词条，会拆成不同配置行。UID 玩家名会从已载入的 68/69 玩家记录中尽量反查。'
        :(activeSeason==='all'?'All stored Season 68 and 69 records are combined.':'Only Season '+activeSeason+' is included.')+' Only actual borrows with <code>borrowed=true</code> and an <code>assistUid</code> are counted. Duplicate season/borrower/provider/battle/wave/Awakener events are removed. Distinct observed levels, Enlighten states, Wheels, Covenants, or Covenant stat rolls remain separate configurations. Player names are resolved from stored S68/S69 player records when available.';
    }
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
      manifest=await response.json();await Promise.all([loadTop1000Names(),loadGearMetadata()]);bind();initialized=true;await load($('assistSeason')?.value||'all');
    }catch(e){error(e)}finally{loading=false}
  }
  function relocalize(){
    if($('morimensAssistTab'))$('morimensAssistTab').textContent=ui('互助助战列表','Assist List');
    if($('morimensAssistTitle'))$('morimensAssistTitle').textContent=ui('互助助战列表','Assist List');
    if(initialized)load(activeSeason).catch(error)
  }
  window.MorimensAssistList={open:init,reload:()=>load($('assistSeason')?.value||activeSeason||'all')};
  window.addEventListener('morimens-assist-list-open',init);
  window.addEventListener('morimens-language-change',relocalize);
  window.addEventListener('morimens-data-ready',()=>{if(initialized)load(activeSeason).catch(error)});
  if(location.hash==='#assist')init();
})();
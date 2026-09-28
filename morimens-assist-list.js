(()=>{
  if(window.MorimensAssistList)return;
  const $=id=>document.getElementById(id);
  const zh=()=>localStorage.getItem('morimens.language')!=='en';
  const ui=(cn,en)=>zh()?cn:en;
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function decodeMojibake(value){const text=String(value??'');if(!/[ÃÂæåçèéêëìíîïðñòóôõö÷øùúûüýþã]/.test(text)||typeof TextDecoder==='undefined')return text;try{const bytes=Uint8Array.from([...text].map(ch=>ch.charCodeAt(0)&255));const fixed=new TextDecoder('utf-8',{fatal:true}).decode(bytes);return /�/.test(fixed)?text:fixed}catch{return text}}
  function cleanPlayerName(value){return decodeMojibake(value).replace(/^<#[^>]+>\s*/,'').trim()}
  const PAGE_SIZE=100;
  const WALINE_SERVER='https://textbox.qingdengbuyi.top';
  const SUBMISSION_PATH='/__morimens_assist_submissions__/';
  const SUBMISSION_MARKER='[MORIMENS_ASSIST_V1]';
  let manifest=null,initialized=false,loading=false,activeSeason='all',rows=[],page=1,manualRows=[];
  const cache=new Map(),playerNames=new Map();
  const gear={assets:{},awakeners:[],wheels:[],covenants:[],assetById:new Map(),assetByBase:new Map(),awakenerById:new Map(),wheelById:new Map(),covenantById:new Map()};
  const zhCovenants={
    'Deus Ex Machina':'机械降神','Re-evolution':'再衍化','Scarlet Embrace':'猩红之拥','Crimson Pulse':'猩红之悸',
    'Twisted Twins: Black':'扭曲双子·黑',"Burial Ground's Sighs":'埋骨地絮语','Twisted Twins: White':'扭曲双子·白',
    'Cursed Rabbit':'诅咒兔','Paradox':'二律背反','Photosynthesis Ritual':'光合祭礼','Returnal Line':'海归线',
    'Ring of Chamber 36':'36室之环','Life Drain':'生机榨取','April Tribute':'四月礼赞','Organic Form':'有机形态',
    'Sweet Slug':'甜蜜蛞蝓','Dream of Medicine':'入药之梦','Feast from Afar':'远方的欢宴',
    'Unstained Chronicle':'无垢启示录','Steppenwolf':'荒原狼','Cocoon of the Maiden':'少女之蛹'
  };
  const statZh={
    'ATK':'攻击','Attack':'攻击','ATTACK':'攻击','HP':'生命','Health':'生命','HEALTH':'生命','DEF':'防御','Defense':'防御','DEFENSE':'防御',
    'Max HP':'最大生命','MAX_HP':'最大生命','Max Health':'最大生命',
    'Crit Rate':'暴击率','CRIT Rate':'暴击率','CritRate':'暴击率','CRIT_RATE':'暴击率','CRITICAL_RATE':'暴击率',
    'Crit DMG':'暴击伤害','Crit Damage':'暴击伤害','CritDamage':'暴击伤害','CRIT_DMG':'暴击伤害','CRITICAL_DAMAGE':'暴击伤害',
    'Damage Amplification':'伤害强效','DMG Amplification':'伤害强效','DMG_AMP':'伤害强效','DAMAGE_AMPLIFICATION':'伤害强效',
    'Realm Mastery':'界域精通','REALM_MASTERY':'界域精通',
    'Aliemus Regen':'异质回复','ALIEMUS_REGEN':'异质回复',
    'Keyflare Regen':'钥令回复','KEYFLARE_REGEN':'钥令回复',
    'Sigil Yield':'灵纹获取','SIGIL_YIELD':'灵纹获取',
    'Death Resistance':'死亡抗性','DEATH_RESISTANCE':'死亡抗性',
    'Vulnerability':'易伤','Vulnerable':'易伤','VULNERABILITY':'易伤',
    'Strength':'力量','STR':'力量','STR Up':'力量提升','STR_UP':'力量提升',
    'Poison Infliction':'中毒施加','POISON_INFLICTION':'中毒施加',
    'Fixed Poison Infliction':'固定中毒施加','FIXED_POISON_INFLICTION':'固定中毒施加',
    'Poison Trigger':'中毒触发','POISON_TRIGGER':'中毒触发',
    'Counter Generation':'反击生成','COUNTER_GENERATION':'反击生成',
    'Poison DMG':'中毒伤害','POISON_DMG':'中毒伤害','Poison Damage':'中毒伤害',
    'Counter DMG':'反击伤害','COUNTER_DMG':'反击伤害','Counter Damage':'反击伤害',
    'Pierce DMG':'穿透伤害','PIERCE_DMG':'穿透伤害','Pierce Damage':'穿透伤害',
    'Pure DMG':'纯粹伤害','PURE_DMG':'纯粹伤害','Pure Damage':'纯粹伤害',
    'Tentacle DMG':'触腕伤害','TENTACLE_DMG':'触腕伤害','Tentacle Damage':'触腕伤害',
    'Active DMG':'主动伤害','ACTIVE_DMG':'主动伤害','Final DMG':'最终伤害','FINAL_DMG':'最终伤害',
    'Base DMG':'基础伤害','BASE_DMG':'基础伤害','Fixed DMG':'固定伤害','FIXED_DMG':'固定伤害',
    'Shield':'护盾','SHIELD':'护盾','Shield Strength':'护盾强效','SHIELD_STRENGTH':'护盾强效',
    'Heal':'治疗','Healing':'治疗','Heal Bonus':'治疗加成','Healing Bonus':'治疗加成','HEAL_BONUS':'治疗加成','HEALING_BONUS':'治疗加成',
    'Effect Hit':'效果命中','EFFECT_HIT':'效果命中','Effect RES':'效果抵抗','Effect Resistance':'效果抵抗','EFFECT_RES':'效果抵抗',
    'ATK_PCT':'攻击百分比','HP_PCT':'生命百分比','DEF_PCT':'防御百分比',
    'Attack %':'攻击百分比','Health %':'生命百分比','Defense %':'防御百分比',
    'DMG_BONUS':'伤害加成','Damage Bonus':'伤害加成','DMG Reduction':'伤害减免','DMG_REDUCTION':'伤害减免',
    'Crit RES':'暴击抗性','CRIT_RES':'暴击抗性','Crit Resistance':'暴击抗性',
    'Speed':'速度','SPEED':'速度','Accuracy':'命中','ACCURACY':'命中','Dodge':'闪避','DODGE':'闪避'
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
  function safeBaseName(raw){
    const clean=String(raw||'').split('?')[0].split('#')[0],last=clean.split('/').pop()||'';
    try{return decodeURIComponent(last)}catch{return last}
  }
  function imageStem(raw){return safeBaseName(raw).replace(/\.(?:webp|png|jpe?g)$/i,'')}
  function assetPath(asset){
    const raw=asset?.availability?.path||'';
    return raw?raw.replace(/^src\/assets\//,'assets/morimens/'):'';
  }
  function localAssetPath(record){
    const key=record?.assets?.icon,asset=key&&gear.assets?.[key];
    return assetPath(asset);
  }
  function fallbackLocalImage(raw,kind){
    const stem=imageStem(raw);if(!stem)return '';
    if(kind==='wheel'&&/^Weapon_(?:Full|Mini)_[^/]+$/i.test(stem))return /^Weapon_Mini_/i.test(stem)?'assets/morimens/wheels/Mini/'+stem+'.webp':'assets/morimens/wheels/'+stem+'.webp';
    if(kind==='covenant'&&/^Icon_Trinket_[^/]+$/i.test(stem))return 'assets/morimens/covenants/Icon/'+stem+'.webp';
    return '';
  }
  function assetFromEquipment(x,kind){
    const id=String(x?.id||''),stem=imageStem(x?.image),candidates=[id,stem].filter(Boolean);
    for(const key of candidates){
      const asset=gear.assetById.get(key)||gear.assetByBase.get(key);
      if(asset&&(!kind||asset.kind===kind))return asset;
    }
    return null;
  }
  function recordFromAsset(asset,kind){
    const owner=String(asset?.ownerId||'');if(!owner)return null;
    return kind==='wheel'?gear.wheelById.get(owner)||null:kind==='covenant'?gear.covenantById.get(owner)||null:null;
  }
  function wheelRecord(x){
    const id=String(x?.id||''),name=normName(x?.name);
    const direct=gear.wheelById.get(id)||gear.wheels.find(r=>normName(r.name)===name||normName(window.MorimensData?.localizedEntity?.('wheel',r)?.name)===name);
    return direct||recordFromAsset(assetFromEquipment(x,'wheel'),'wheel');
  }
  function covenantRecord(x){
    const id=String(x?.id||''),name=normName(x?.name);
    const direct=gear.covenantById.get(id)||gear.covenants.find(r=>normName(r.name)===name||normName(zhCovenants[r.name])===name);
    return direct||recordFromAsset(assetFromEquipment(x,'covenant'),'covenant');
  }
  function wheelName(x){const r=wheelRecord(x);return r?(window.MorimensData?.localizedEntity?.('wheel',r)?.name||r.name):(window.MorimensData?.localizedEntity?.('wheel',x)?.name||x?.name||String(x?.id||ui('未知命轮','Unknown Wheel')))}
  function covenantName(x){const r=covenantRecord(x),raw=r?.name||x?.name||String(x?.id||ui('未知密契','Unknown Covenant'));return zh()?(zhCovenants[raw]||raw):raw}
  function wheelImage(x){
    const r=wheelRecord(x),a=assetFromEquipment(x,'wheel');
    return localAssetPath(r)||assetPath(a)||fallbackLocalImage(x?.image,'wheel')||x?.image||'';
  }
  function covenantImage(x){
    const r=covenantRecord(x),a=assetFromEquipment(x,'covenant');
    return localAssetPath(r)||assetPath(a)||fallbackLocalImage(x?.image,'covenant')||x?.image||'';
  }
  async function loadGearMetadata(){
    const repo=window.MorimensRepository;if(!repo)return;
    const [aw,w,c,a]=await Promise.allSettled([repo.catalog('awakeners'),repo.catalog('wheels'),repo.catalog('covenants'),repo.index('assets')]);
    gear.awakeners=aw.status==='fulfilled'?(aw.value?.records||[]):[];
    gear.wheels=w.status==='fulfilled'?(w.value?.records||[]):[];
    gear.covenants=c.status==='fulfilled'?(c.value?.records||[]):[];
    gear.assets=a.status==='fulfilled'?(a.value?.assets||{}):{};
    gear.awakenerById=new Map(gear.awakeners.map(r=>[String(r.id),r]));
    gear.wheelById=new Map(gear.wheels.map(r=>[String(r.id),r]));
    gear.covenantById=new Map(gear.covenants.map(r=>[String(r.id),r]));
    gear.assetById=new Map();gear.assetByBase=new Map();
    for(const asset of Object.values(gear.assets||{})){
      const assetId=String(asset?.assetId||'');if(assetId)gear.assetById.set(assetId,asset);
      const base=imageStem(asset?.availability?.path);if(base)gear.assetByBase.set(base,asset);
    }
  }
  function enlightLabel(m){
    const p=Number(m?.potencyLevel);
    if(Number.isFinite(p))return p<=3?`${p}启`:`+${p-3}`;
    const n=Number(m?.enlightenCount);
    if(Number.isFinite(n))return n<=3?`${n}启`:String(m?.progression||m?.enlightenMilestone||n);
    return String(m?.progression||m?.enlightenMilestone||ui('未知','Unknown'));
  }
  function statName(attr){
    const raw=String(attr?.name||attr?.id||ui('词条','Stat')).trim();
    if(!zh())return raw;
    if(statZh[raw])return statZh[raw];
    const key=raw.toUpperCase().replace(/[%/()+.-]+/g,'_').replace(/\s+/g,'_').replace(/_+/g,'_').replace(/^_|_$/g,'');
    if(statZh[key])return statZh[key];
    const phrase=[
      [/CRIT(?:ICAL)?[_ ]*RATE/i,'暴击率'],[/CRIT(?:ICAL)?[_ ]*(?:DMG|DAMAGE)/i,'暴击伤害'],
      [/(?:DAMAGE|DMG)[_ ]*AMPLIFICATION/i,'伤害强效'],[/REALM[_ ]*MASTERY/i,'界域精通'],
      [/ALIEMUS[_ ]*REGEN/i,'异质回复'],[/KEYFLARE[_ ]*REGEN/i,'钥令回复'],[/SIGIL[_ ]*YIELD/i,'灵纹获取'],
      [/DEATH[_ ]*RESISTANCE/i,'死亡抗性'],[/POISON[_ ]*INFLICTION/i,'中毒施加'],[/POISON[_ ]*TRIGGER/i,'中毒触发'],
      [/COUNTER[_ ]*GENERATION/i,'反击生成'],[/POISON[_ ]*(?:DMG|DAMAGE)/i,'中毒伤害'],
      [/COUNTER[_ ]*(?:DMG|DAMAGE)/i,'反击伤害'],[/PIERCE[_ ]*(?:DMG|DAMAGE)/i,'穿透伤害'],
      [/PURE[_ ]*(?:DMG|DAMAGE)/i,'纯粹伤害'],[/TENTACLE[_ ]*(?:DMG|DAMAGE)/i,'触腕伤害'],
      [/HEAL(?:ING)?[_ ]*BONUS/i,'治疗加成'],[/EFFECT[_ ]*HIT/i,'效果命中'],[/EFFECT[_ ]*(?:RES|RESISTANCE)/i,'效果抵抗'],
      [/VULNERAB(?:LE|ILITY)/i,'易伤'],[/MAX[_ ]*(?:HP|HEALTH)/i,'最大生命']
    ];
    for(const [re,label] of phrase)if(re.test(raw))return label;
    const tokenMap={ATK:'攻击',ATTACK:'攻击',HP:'生命',HEALTH:'生命',DEF:'防御',DEFENSE:'防御',STR:'力量',STRENGTH:'力量',POISON:'中毒',COUNTER:'反击',PIERCE:'穿透',PURE:'纯粹',TENTACLE:'触腕',ACTIVE:'主动',FINAL:'最终',BASE:'基础',FIXED:'固定',DAMAGE:'伤害',DMG:'伤害',RATE:'率',BONUS:'加成',REGEN:'回复',RESISTANCE:'抗性',RES:'抗性',SHIELD:'护盾',HEAL:'治疗',HEALING:'治疗',SPEED:'速度',ACCURACY:'命中',DODGE:'闪避',PERCENT:'百分比',PCT:'百分比',UP:'提升'};
    const tokens=key.split('_').filter(Boolean),translated=tokens.map(t=>tokenMap[t]||'');
    if(tokens.length&&translated.every(Boolean))return translated.join('');
    return '其他属性';
  }
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
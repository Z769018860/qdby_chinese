(()=>{
  const $=id=>document.getElementById(id);
  const isEnglish=()=>localStorage.getItem('morimens.language')==='en';
  const ui=(zh,en)=>isEnglish()?en:zh;
  const num=(v,f=0)=>{const n=Number.parseFloat(v);return Number.isFinite(n)?n:f};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const EPS=1e-9;
  let lastRealmSignature='';
  const MODE_META={
    chaos:{base:'CHAOS',label:'普通混沌'},
    primordia:{base:'CHAOS',label:'原初·混沌',advanced:true},
    caro:{base:'CARO',label:'普通血肉'},
    propagation:{base:'CARO',label:'繁育·血肉',advanced:true},
    aequor:{base:'AEQUOR',label:'普通深海'},
    benthos:{base:'AEQUOR',label:'晦暝·深海',advanced:true},
    ultra:{base:'ULTRA',label:'普通超维'},
    singularity:{base:'ULTRA',label:'奇点·超维',advanced:true}
  };
  const BASE_ZH={CHAOS:'混沌',CARO:'血肉',AEQUOR:'深海',ULTRA:'超维'};
  const BASE_EN={CHAOS:'Chaos',CARO:'Caro',AEQUOR:'Aequor',ULTRA:'Ultra'};

  function currentRecord(){
    const id=$('charSelect')?.value||'';
    return window.MorimensData?.db?.records?.find(x=>x.id===id)
      ||(window.MorimensCharacterSync?.record?.id===id?window.MorimensCharacterSync.record:null)||null;
  }
  function inferNormalMode(){
    const record=currentRecord();
    if(record?.id==='awakener-0061')return 'primordia';
    const realm=String(record?.realm||'').toUpperCase();
    return realm==='AEQUOR'?'aequor':realm==='CARO'?'caro':realm==='CHAOS'?'chaos':realm==='ULTRA'?'ultra':'chaos';
  }
  function resolveMode(raw){
    return raw==='auto'?inferNormalMode():(MODE_META[raw]?raw:null);
  }
  function selectedModes(){
    const first=resolveMode($('realmPrimary')?.value||'auto')||inferNormalMode();
    let second=resolveMode($('realmSecondary')?.value||'');
    if(second&&MODE_META[second]?.base===MODE_META[first]?.base)second=null;
    return second?[first,second]:[first];
  }
  function mastery(){
    const base=Math.max(0,num($('realmMastery')?.value,window.MorimensCharacterSync?.finalStats?.RealmMastery||0));
    const resources=window.MorimensCharacterResources||{};
    const currentId=$('charSelect')?.value||window.MorimensCharacterSync?.record?.id||'';
    const overExaltBonus=currentId==='awakener-0001'
      ?24*Math.max(0,Math.floor(num(resources.twentyFourOverExaltPriorUses,0)))
      :0;
    return base+overExaltBonus;
  }
  function isExalt(){
    const slot=String(window.MorimensSkillSync?.skill?.slot||'');
    return slot==='Exalt'||slot==='OverExalt';
  }
  function isCommandCard(){
    const skill=window.MorimensSkillSync?.skill;
    return String(skill?.cardFamily||'').toLowerCase()==='command';
  }
  function scaledStacks(base,rm,effectMultiplier=1){
    return Math.ceil(base*(1+rm*0.0005*effectMultiplier)-EPS);
  }
  function hasMode(modes,name){return modes.includes(name)}
  function basesOf(modes){return [...new Set(modes.map(x=>MODE_META[x]?.base).filter(Boolean))]}
  function onlyFrom(bases,allowed){return bases.length>0&&bases.every(x=>allowed.includes(x))}
  function describeBases(bases){const labels=isEnglish()?BASE_EN:BASE_ZH;return bases.map(x=>labels[x]||x).join(' + ')}

  function state(){
    const modes=selectedModes(),baseRealms=basesOf(modes),rm=mastery();
    const baseRm=Math.max(0,num($('realmMastery')?.value,window.MorimensCharacterSync?.finalStats?.RealmMastery||0));
    const temporaryRealmMastery=Math.max(0,rm-baseRm);
    const isDual=baseRealms.length===2,isPure=baseRealms.length===1;
    const indivisible=hasMode(modes,'primordia');
    const normalChaos=hasMode(modes,'chaos')&&!indivisible;
    const chaosCoexistence=normalChaos&&isDual&&baseRealms.includes('CHAOS');
    const chaosCount=chaosCoexistence?Math.max(1,Math.floor(num($('realmChaosCount')?.value,1))):0;
    const otherRealm=chaosCoexistence?baseRealms.find(x=>x!=='CHAOS')||null:null;

    const pureEffects={
      CHAOS:isPure&&baseRealms[0]==='CHAOS',
      AEQUOR:!indivisible&&((isPure&&baseRealms[0]==='AEQUOR')||(chaosCoexistence&&otherRealm==='AEQUOR')),
      CARO:!indivisible&&((isPure&&baseRealms[0]==='CARO')||(chaosCoexistence&&otherRealm==='CARO')),
      // Public SKeyDB "Pure Ultra" explicitly requires an all-Ultra team.
      // Singularity: Ultra has its own Ultra-or-Chaos condition handled below.
      ULTRA:!indivisible&&isPure&&baseRealms[0]==='ULTRA'
    };
    const masteryEffectMultiplier={
      CHAOS:1,
      // Current public SKeyDB does not define normal Pure Aequor/Caro mastery doubling.
      // Benthos/Propagation apply their own explicit Aequor-or-Chaos / Caro-or-Chaos doubling below.
      AEQUOR:1,
      CARO:1,
      ULTRA:pureEffects.ULTRA?2:1
    };

    const out={
      modes,baseRealms,isDual,isPure,indivisible,normalChaos,chaosCoexistence,chaosCount,otherRealm,
      label:isPure?(isEnglish()?`Pure ${describeBases(baseRealms)}`:`至纯${describeBases(baseRealms)}`):(isEnglish()?`${describeBases(baseRealms)} Dual Realm`:`${describeBases(baseRealms)}双界域`),
      realmMastery:rm,baseRealmMastery:baseRm,temporaryRealmMastery,pureEffects,masteryEffectMultiplier,
      atkMultiplier:1,defMultiplier:1,maxHpMultiplier:1,teamDamageAmp:0,finalDamageBonus:0,
      primordiaAllChaosTeam:false,primordiaUtilityMultiplier:1,primordiaOffensiveMultiplier:1,
      propagationFiestaStacks:0,propagationApplies:false,
      singularityApplies:false,singularityPrismStacks:0,singularityShuttleStacks:0,singularityBeaconStacks:0,
      fixedPoisonCounterBonusPct:0,
      ultraRoundActive:false,damageOutputMultiplier:1,statusOutputMultiplier:1,
      tentacleMode:baseRealms.includes('AEQUOR')?(hasMode(modes,'benthos')?'benthos':'standard'):null,
      tentacleMasteryMultiplier:masteryEffectMultiplier.AEQUOR,
      startingTentacleMultiplier:1,
      aequorChaosBaseTentacleBonusPct:0,
      notes:[]
    };

    if(temporaryRealmMastery>0)out.notes.push(isEnglish()?`Prior Over-Exalt uses by “24” provide +${temporaryRealmMastery.toFixed(0)} temporary/in-battle Realm Mastery; current effective Realm Mastery ${rm.toFixed(1)}.`:`“24”此前超限提供临时/战斗内界域精通 +${temporaryRealmMastery.toFixed(0)}；当前有效界域精通 ${rm.toFixed(1)}。`);
    if(indivisible){
      out.notes.push(ui('原初·混沌「不可分割界域」生效：其他界域不触发至纯、双倍界域精通或双倍伤害强效。','Primordia · Chaos “Indivisible Realm” is active: other Realms do not trigger Pure effects, doubled Realm Mastery, or doubled Damage Amplification.'));
    }else if(chaosCoexistence){
      out.notes.push(isEnglish()?`Chaos coexistence: ${BASE_EN[otherRealm]||otherRealm} is treated under its Pure-Realm coexistence rule; current Chaos Awakener count ${chaosCount}.`:`混沌共生：${BASE_ZH[otherRealm]||otherRealm}按至纯界域处理；当前混沌唤醒体数量 ${chaosCount}。`);
    }else if(isPure){
      out.notes.push(ui('队伍只有一种界域，自动按至纯界域处理。','The team has one Realm and is treated as a Pure Realm.'));
    }else{
      out.notes.push(ui('队伍包含两个不同界域，按双界域处理，不触发普通至纯效果。','The team contains two different Realms and is treated as Dual Realm; ordinary Pure effects do not trigger.'));
    }

    if(hasMode(modes,'primordia')){
      const allChaos=isPure&&baseRealms[0]==='CHAOS';
      out.primordiaAllChaosTeam=allChaos;
      out.atkMultiplier*=1.10;
      out.defMultiplier*=1.10;
      out.teamDamageAmp+=allChaos?100:50;
      out.primordiaUtilityMultiplier=1+rm*0.0005*(allChaos?2:1);
      out.primordiaOffensiveMultiplier=1+rm*0.001*(allChaos?2:1);
      out.notes.push(isEnglish()?`Primordia · Chaos: ATK/DEF +10%, team Damage Amplification +${allChaos?100:50}%.`:`原初·混沌：攻击/防御 +10%，团队伤害强效 +${allChaos?100:50}%。`);
    }

    if(hasMode(modes,'propagation')){
      const doubled=!indivisible&&onlyFrom(baseRealms,['CARO','CHAOS']);
      const effectMult=doubled?2:1;
      out.maxHpMultiplier*=1.10;
      out.teamDamageAmp+=doubled?100:50;
      const turnStacks=scaledStacks(20,rm,effectMult);
      const embryoStacks=$('propagationConsumeEmbryo')?.checked===true?scaledStacks(40,rm,effectMult):0;
      out.propagationFiestaStacks=turnStacks+embryoStacks;
      out.propagationApplies=isExalt()&&$('propagationApplyFiesta')?.checked!==false;
      if(out.propagationApplies){
        out.finalDamageBonus+=out.propagationFiestaStacks;
        out.fixedPoisonCounterBonusPct+=out.propagationFiestaStacks;
      }
      out.masteryEffectMultiplier.CARO=effectMult;
      out.notes.push(isEnglish()?`Propagation · Caro: Max HP +10%, team Damage Amplification +${doubled?100:50}%, current Propagation Fiesta ${out.propagationFiestaStacks} stacks.`:`繁育·血肉：最大生命 +10%，团队伤害强效 +${doubled?100:50}%，当前繁育狂热 ${out.propagationFiestaStacks} 层。`);
    }

    if(hasMode(modes,'benthos')){
      const doubled=!indivisible&&onlyFrom(baseRealms,['AEQUOR','CHAOS']);
      out.teamDamageAmp+=doubled?100:50;
      out.tentacleMasteryMultiplier=doubled?2:1;
      out.startingTentacleMultiplier=1;
      out.notes.push(isEnglish()?`Benthos · Aequor: Base Tentacle is 5% of team Max HP, team Damage Amplification +${doubled?100:50}%, Raging Realm-Mastery effect ×${out.tentacleMasteryMultiplier}; the SKeyDB record does not add extra starting Tentacles for Pure Aequor.`:`晦暝·深海：基础触腕为队伍最大生命 5%，团队伤害强效 +${doubled?100:50}%，怒涛界域精通效果 ×${out.tentacleMasteryMultiplier}；按「无光之底」记录，至纯不会额外获得初始触腕。`);
    }else if(baseRealms.includes('AEQUOR')){
      out.notes.push(ui('普通深海：怒涛使用最终界域精通计算触腕触发比例；当前公开 SKeyDB 未定义普通至纯深海的精通或起始触腕翻倍，因此不自动附加。','Standard Aequor: Raging uses final Realm Mastery for its Tentacle trigger ratio. Public SKeyDB does not define extra mastery or starting-Tentacle doubling for ordinary Pure Aequor, so none is added automatically.'));
    }

    if(hasMode(modes,'singularity')){
      const doubled=!indivisible&&onlyFrom(baseRealms,['ULTRA','CHAOS']);
      const effectMult=doubled?2:1;
      const prismStacks=scaledStacks(15,rm,effectMult);
      const shuttleStacks=$('singularityDimensionShuttle')?.checked===true?scaledStacks(25,rm,effectMult):0;
      const command=isCommandCard();
      out.teamDamageAmp+=doubled?100:50;
      out.masteryEffectMultiplier.ULTRA=effectMult;
      out.singularityPrismStacks=prismStacks;
      out.singularityShuttleStacks=shuttleStacks;
      out.singularityBeaconStacks=command?prismStacks+shuttleStacks:0;
      out.singularityApplies=command;
      if(command){
        const beaconBonus=out.singularityBeaconStacks*2;
        out.finalDamageBonus+=beaconBonus;
        out.fixedPoisonCounterBonusPct+=beaconBonus;
      }
      out.notes.push(isEnglish()?`Singularity · Ultra: team Damage Amplification +${doubled?100:50}%; Prism ${prismStacks} stacks${shuttleStacks?`, plus ${shuttleStacks} Dimension Shuttle Beacon stacks on this card`:''}.`:`奇点·超维：团队伤害强效 +${doubled?100:50}%；棱镜 ${prismStacks} 层${shuttleStacks?`，本卡额外维度穿梭信标 ${shuttleStacks} 层`:''}。`);
      out.notes.push(command
        ? (isEnglish()?`Current card is a Command: ${out.singularityBeaconStacks} Beacon stacks; Final DMG and Fixed Poison/Counter effects +${out.singularityBeaconStacks*2}%.`:`当前为指令卡：共 ${out.singularityBeaconStacks} 层信标，最终伤害与固定中毒/反击效果 +${out.singularityBeaconStacks*2}%。`)
        : ui('当前不是指令卡：奇点棱镜/信标的卡牌效果不自动计入本次伤害。','Current card is not a Command: Singularity Prism/Beacon card effects are not applied to this damage.'));
      out.notes.push(ui('奇点·超维重写后的超维空间文本未保留普通超维回合的 -25% 输出条款，因此此模式不套用普通超维惩罚。','The rewritten Singularity · Ultra Space text does not retain the ordinary Ultra-turn -25% output clause, so that penalty is not applied in Singularity mode.'));
    }else if(hasMode(modes,'ultra')){
      out.ultraRoundActive=$('ultraRoundActive')?.checked===true;
      if(out.ultraRoundActive){
        out.damageOutputMultiplier*=0.75;
        out.statusOutputMultiplier*=0.75;
        out.notes.push(ui('普通超维回合：本回合造成的伤害、中毒、反击、出血等效果按 SKeyDB ×75%。','Standard Ultra turn: damage, Poison, Counter, Bleed, and similar output is ×75% per SKeyDB.'));
      }else{
        out.notes.push(isEnglish()?`Standard Ultra: Realm Mastery effect ×${out.masteryEffectMultiplier.ULTRA}; the Ultra-turn toggle is off, so the -25% output modifier is not applied.`:`普通超维：界域精通效果 ×${out.masteryEffectMultiplier.ULTRA}；未勾选超维回合，不应用 -25% 输出修正。`);
      }
    }

    if(chaosCoexistence&&otherRealm==='AEQUOR'){
      out.notes.push(hasMode(modes,'benthos')
        ?(ui('混沌×晦暝·深海：按晦暝·深海公开记录，基础触腕伤害固定为队伍最大生命 5%；不额外叠加未公开的混沌触腕基础。','Chaos × Benthos · Aequor: Base Tentacle DMG remains 5% of team Max HP according to the public record; no unverified extra Chaos base is stacked.'))
        :ui('混沌×普通深海：当前 SKeyDB 未公开“每名混沌额外增加队伍最大生命百分比到基础触腕”的可验证公式，因此不自动附加该项。','Chaos × Standard Aequor: public SKeyDB does not expose a verifiable formula for adding team-Max-HP percentage per Chaos Awakener to Base Tentacle DMG, so it is not added automatically.'));
    }
    if(chaosCoexistence&&otherRealm==='CARO'){
      out.notes.push(ui('混沌×血肉：每名混沌唤醒体回合结束积累 2% 最大生命的猩红熔炉；混沌角色释放狂气爆发时胚胎融合 +25%。','Chaos × Caro: each Chaos Awakener accumulates Crimson Furnace equal to 2% Max HP at turn end; a Chaos Awakener using Exalt increases Embryo Fusion by 25%.'));
    }
    if(chaosCoexistence&&otherRealm==='ULTRA'){
      out.notes.push(hasMode(modes,'singularity')
        ?ui('混沌×奇点·超维：奇点规则明确允许 超维/混沌队伍获得双倍超维精通 与双倍界域伤害强效。','Chaos × Singularity · Ultra: Singularity explicitly allows Ultra/Chaos teams to receive doubled Ultra mastery effects and doubled Realm Damage Amplification.')
        :ui('混沌×普通超维：保留混沌共存阵容，但公开 SKeyDB 的 至纯超维只写“全队超维”，因此不把普通超维精通 擅自翻倍。','Chaos × Standard Ultra: coexistence remains valid, but public SKeyDB describes Pure Ultra as an all-Ultra team, so ordinary Ultra mastery is not doubled automatically.'));
    }
    return out;
  }

  function syncSecondaryOptions(){
    const first=resolveMode($('realmPrimary')?.value||'auto')||inferNormalMode();
    const firstBase=MODE_META[first]?.base;
    const sel=$('realmSecondary');if(!sel)return;
    for(const option of sel.options){
      if(!option.value){option.disabled=false;continue}
      const mode=resolveMode(option.value);
      option.disabled=MODE_META[mode]?.base===firstBase;
    }
    const current=resolveMode(sel.value);
    if(current&&MODE_META[current]?.base===firstBase)sel.value='';
  }
  function setRealmConditionalControl(wrapId,inputIds,active,{clear=false}={}){
    const wrap=$(wrapId);
    if(wrap){
      wrap.hidden=!active;
      wrap.setAttribute('aria-disabled',active?'false':'true');
    }
    for(const id of inputIds){
      const el=$(id);if(!el)continue;
      el.disabled=!active;
      if(!active&&clear){
        if(el.type==='checkbox'||el.type==='radio')el.checked=false;
        else if(el.tagName==='SELECT')el.selectedIndex=0;
        else el.value='';
      }
    }
  }
  function updateVisibility(){
    syncSecondaryOptions();
    const s=state();
    const propagation=s.modes.includes('propagation');
    const singularity=s.modes.includes('singularity');
    const normalUltra=s.modes.includes('ultra');
    setRealmConditionalControl('propagationConsumeWrap',['propagationConsumeEmbryo'],propagation,{clear:true});
    setRealmConditionalControl('propagationApplyWrap',['propagationApplyFiesta'],propagation);
    setRealmConditionalControl('singularityDimensionWrap',['singularityDimensionShuttle'],singularity,{clear:true});
    setRealmConditionalControl('ultraRoundWrap',['ultraRoundActive'],normalUltra,{clear:true});
    if($('realmChaosCountWrap'))$('realmChaosCountWrap').hidden=!s.chaosCoexistence;
    if($('realmChaosCount'))$('realmChaosCount').disabled=!s.chaosCoexistence;
  }
  function render(){
    updateVisibility();
    const s=state(),box=$('realmEnvironmentReadout');
    if(box){
      const chips=[
        '<span class="chip">'+esc(s.label)+'</span>',
        '<span class="chip">'+ui('有效界域精通 ','Effective Realm Mastery ')+s.realmMastery.toFixed(1)+(s.temporaryRealmMastery>0?(isEnglish()?' (includes +'+s.temporaryRealmMastery.toFixed(0)+')':'（含 +'+s.temporaryRealmMastery.toFixed(0)+'）'):'')+'</span>',
        s.isDual?'<span class="chip">'+ui('双界域','Dual Realm')+'</span>':'<span class="chip">'+ui('至纯界域','Pure Realm')+'</span>',
        s.indivisible?'<span class="chip">'+ui('不可分割界域','Indivisible Realm')+'</span>':'',
        s.atkMultiplier!==1?'<span class="chip">'+ui('攻击','ATK')+' ×'+s.atkMultiplier.toFixed(2)+'</span>':'',
        s.defMultiplier!==1?'<span class="chip">'+ui('防御','DEF')+' ×'+s.defMultiplier.toFixed(2)+'</span>':'',
        s.teamDamageAmp?'<span class="chip">'+ui('团队伤害强效','Team Damage Amplification')+' +'+s.teamDamageAmp.toFixed(0)+'%</span>':'',
        s.maxHpMultiplier!==1?'<span class="chip">'+ui('最大生命','Max HP')+' ×'+s.maxHpMultiplier.toFixed(2)+'</span>':'',
        s.finalDamageBonus?'<span class="chip">'+ui('本次适用终伤','Applicable Final DMG')+' +'+s.finalDamageBonus.toFixed(0)+'%</span>':'',
        s.singularityBeaconStacks?'<span class="chip">'+ui('奇点信标','Singularity Beacon')+' '+s.singularityBeaconStacks+' '+ui('层','stacks')+'</span>':'',
        s.damageOutputMultiplier!==1?'<span class="chip">'+ui('超维回合输出','Ultra-turn Output')+' ×'+s.damageOutputMultiplier.toFixed(2)+'</span>':''
      ].filter(Boolean);
      box.innerHTML='<div class="autoSummary">'+chips.join('')+'</div><div style="margin-top:7px">'+s.notes.map(esc).join('<br>')+'</div>';
    }
    const pill=document.querySelector('[aria-labelledby="calcTitle"] .statusPill');
    if(pill)pill.textContent=isEnglish()?'SKeyDB public-v3 · Formula-audited':'SKeyDB public-v3 · 公式审计版';
    window.MorimensRealmState=s;
    const signature=JSON.stringify({modes:s.modes,baseRealms:s.baseRealms,isPure:s.isPure,isDual:s.isDual,indivisible:s.indivisible,chaosCount:s.chaosCount,realmMastery:s.realmMastery,temporaryRealmMastery:s.temporaryRealmMastery,teamDamageAmp:s.teamDamageAmp,atkMultiplier:s.atkMultiplier,defMultiplier:s.defMultiplier,maxHpMultiplier:s.maxHpMultiplier,finalDamageBonus:s.finalDamageBonus,fiesta:s.propagationFiestaStacks,singularityBeaconStacks:s.singularityBeaconStacks,damageOutputMultiplier:s.damageOutputMultiplier,statusOutputMultiplier:s.statusOutputMultiplier,tentacleMode:s.tentacleMode,tentacleMasteryMultiplier:s.tentacleMasteryMultiplier,primordiaAllChaosTeam:s.primordiaAllChaosTeam});
    if(signature!==lastRealmSignature){lastRealmSignature=signature;window.dispatchEvent(new CustomEvent('morimens-realm-change',{detail:s}))}
    return s;
  }
  function options(includeAuto=false){
    const rows=isEnglish()?[
      includeAuto?'<option value="auto">Use current Awakener Realm (standard form)</option>':'',
      '<option value="chaos">Standard Chaos</option>',
      '<option value="primordia">Primordia · Chaos</option>',
      '<option value="caro">Standard Caro</option>',
      '<option value="propagation">Propagation · Caro</option>',
      '<option value="aequor">Standard Aequor</option>',
      '<option value="benthos">Benthos · Aequor</option>',
      '<option value="ultra">Standard Ultra</option>',
      '<option value="singularity">Singularity · Ultra</option>'
    ]:[
      includeAuto?'<option value="auto">按当前角色界域（普通形态）</option>':'',
      '<option value="chaos">普通混沌</option>',
      '<option value="primordia">原初·混沌</option>',
      '<option value="caro">普通血肉</option>',
      '<option value="propagation">繁育·血肉</option>',
      '<option value="aequor">普通深海</option>',
      '<option value="benthos">晦暝·深海</option>',
      '<option value="ultra">普通超维</option>',
      '<option value="singularity">奇点·超维</option>'
    ];
    return rows.join('');
  }
  function populateRealmOptions(){
    const primary=$('realmPrimary'),secondary=$('realmSecondary');if(!primary||!secondary)return;
    const p=primary.value||'auto',s=secondary.value||'';
    primary.innerHTML=options(true);
    secondary.innerHTML=(isEnglish()?'<option value="">None · Pure Realm</option>':'<option value="">无 · 至纯界域</option>')+options(false);
    if([...primary.options].some(o=>o.value===p))primary.value=p;
    if([...secondary.options].some(o=>o.value===s))secondary.value=s;
  }
  function localizeRealmUi(){
    const block=$('realmEnvironmentModel');if(!block)return;
    const title=block.querySelector('.builderTitle span'),sub=block.querySelector('.builderTitle small');
    if(title)title.textContent=ui('⑥ 队伍界域','⑥ Team Realms');
    if(sub)sub.textContent=ui('最多两个不同界域','Up to two different Realms');
    const setField=(id,zhLabel,enLabel,zhNote='',enNote='')=>{
      const field=$(id)?.closest('.field');if(!field)return;
      const label=field.querySelector('label');if(label)label.textContent=ui(zhLabel,enLabel);
      const small=field.querySelector('small');if(small&&zhNote)small.textContent=ui(zhNote,enNote);
    };
    setField('realmPrimary','主界域','Primary Realm','可按当前角色自动识别普通界域，也可手动选择进阶界域。','Can use the current Awakener’s standard Realm automatically, or select an advanced Realm manually.');
    setField('realmSecondary','第二界域','Secondary Realm','留空即至纯；选择另一个不同界域即双界域。最多两种界域。','Leave empty for Pure Realm; choose another different Realm for Dual Realm. Maximum two Realms.');
    setField('realmChaosCount','混沌唤醒体数量','Chaos Awakener Count','用于混沌×深海/血肉/超维的共生效果。','Used by Chaos coexistence with Aequor / Caro / Ultra.');
    const inline=(id,zhText,enText,zhNote,enNote)=>{
      const field=$(id)?.closest('.field');if(!field)return;
      const label=field.querySelector('label'),input=$(id);
      if(label){label.textContent='';if(input)label.appendChild(input);label.appendChild(document.createTextNode(' '+ui(zhText,enText)))}
      const small=field.querySelector('small');if(small)small.textContent=ui(zhNote,enNote);
    };
    inline('propagationConsumeEmbryo','本回合已首次消耗「繁育·胚胎」','First Propagation Embryo consumed this turn','额外获得基础 40 层繁育狂热，并受繁育·血肉精通加成。','Gain 40 base Propagation Fiesta stacks, scaled by Propagation · Caro mastery.');
    inline('propagationApplyFiesta','将繁育狂热用于本次狂气爆发','Apply Propagation Fiesta to this Exalt','只对狂气爆发/超限爆发自动计入最终伤害。','Automatically contributes to Final DMG only for Exalt / Over-Exalt.');
    inline('singularityDimensionShuttle','本卡获得“维度穿梭”的 25 层奇点信标','This card has 25 Dimension Shuttle Beacon stacks','用于本回合第一张触发“维度穿梭”的指令卡，或带有该 25 层信标的复制卡。界域精通会同步放大层数。','Use for the first Command this turn that triggers Dimension Shuttle, or a copied card carrying those 25 Beacon stacks. Realm Mastery scales the stack count.');
    inline('ultraRoundActive','当前处于普通超维回合','Currently in a standard Ultra turn','普通超维：本回合伤害、中毒、反击、出血等输出 -25%。奇点·超维使用重写后的规则，不套此开关。','Standard Ultra: damage, Poison, Counter, Bleed, and similar output is -25% this turn. Singularity · Ultra uses its rewritten rules instead.');
    populateRealmOptions();
    const details=block.querySelector('details.formulaSource');
    if(details){
      details.innerHTML=isEnglish()
        ?'<summary>Dual Realm / Pure Realm Rules</summary><div><div class="formulaRow"><b>Team Limit</b><br>A team can contain at most two different Realms. With only one Realm, it is treated as Pure.</div><div class="formulaRow"><b>Chaos Coexistence</b><br>When Standard Chaos coexists with Aequor / Caro / Ultra, the other Realm can still use its supported Pure/coexistence effects.</div><div class="formulaRow"><b>Primordia · Chaos Exception</b><br>Indivisible Realm suppresses other Pure-Realm, doubled Realm Mastery, and doubled Damage Amplification effects.</div><div class="formulaRow"><b>Advanced Realms</b><br>Propagation · Caro, Benthos · Aequor, and Singularity · Ultra each use their own SKeyDB conditions for doubled effects in teams containing only that Realm / Chaos.</div><div class="formulaRow"><b>Singularity · Ultra</b><br>Base team Damage Amplification +50% (+100% when the team contains only Ultra / Chaos); 15 Prism stacks and 25 additional Dimension Shuttle Beacon stacks. Each Beacon stack gives Commands +2% Final DMG and Fixed Poison/Counter effects.</div><div class="formulaRow"><b>Standard Ultra Turn</b><br>Per SKeyDB, damage, Poison, Counter, Bleed, and similar output is reduced by 25%. Singularity · Ultra does not inherit this ordinary-turn penalty.</div></div>'
        :'<summary>双界域 / 至纯规则</summary><div><div class="formulaRow"><b>队伍限制</b><br>同一队最多出现两个不同界域；只有一种界域时自动视为至纯界域。</div><div class="formulaRow"><b>混沌共生</b><br>普通混沌与深海/血肉/超维共存时，另一界域仍按至纯处理，并触发对应混沌共生效果。</div><div class="formulaRow"><b>原初·混沌例外</b><br>「不可分割界域」会禁止其他界域的至纯、双倍界域精通和双倍伤害强效，因此不会把“普通混沌共生”的规则套到原初·混沌。</div><div class="formulaRow"><b>进阶界域</b><br>繁育·血肉、晦暝·深海、奇点·超维均按各自 SKeyDB 条件判断“全队仅本界域/混沌”时的双倍效果。</div><div class="formulaRow"><b>奇点·超维</b><br>基础团队伤害强效 +50%（全队仅超维/混沌时 +100%）；15 层奇点棱镜，“维度穿梭”额外 25 层信标。每层信标使指令卡的最终伤害与固定中毒/反击 +2%。</div><div class="formulaRow"><b>普通超维回合</b><br>SKeyDB：普通超维回合中造成的伤害、中毒、反击、出血等效果 -25%。奇点·超维不套此普通惩罚。</div></div>';
    }
  }

  function inject(){
    if($('realmEnvironmentModel')||!$('calcBtn'))return;
    const builder=$('calcBtn').closest('.panel')?.querySelector('.builder');if(!builder)return;
    const block=document.createElement('div');block.className='builderBlock calcSection calcSectionRealm';block.id='realmEnvironmentModel';
    block.innerHTML=[
      '<div class="builderTitle"><span>⑥ 队伍界域</span><small>最多两个不同界域</small></div>',
      '<div class="formGrid">',
      '<div class="field"><label for="realmPrimary">主界域</label><select id="realmPrimary">',options(true),'</select><small>可按当前角色自动识别普通界域，也可手动选择进阶界域。</small></div>',
      '<div class="field"><label for="realmSecondary">第二界域</label><select id="realmSecondary"><option value="">无 · 至纯界域</option>',options(false),'</select><small>留空即至纯；选择另一个不同界域即双界域。最多两种界域。</small></div>',
      '<div class="field" id="realmChaosCountWrap" hidden><label for="realmChaosCount">混沌唤醒体数量</label><input id="realmChaosCount" type="number" min="1" max="4" step="1" value="1"><small>用于混沌×深海/血肉/超维的共生效果。</small></div>',
      '<div class="field" id="propagationConsumeWrap" hidden><label class="inlineCheck"><input id="propagationConsumeEmbryo" type="checkbox"> 本回合已首次消耗「繁育·胚胎」</label><small>额外获得基础 40 层繁育狂热，并受繁育·血肉精通加成。</small></div>',
      '<div class="field full" id="propagationApplyWrap" hidden><label class="inlineCheck"><input id="propagationApplyFiesta" type="checkbox" checked> 将繁育狂热用于本次狂气爆发</label><small>只对狂气爆发/超限爆发自动计入最终伤害。</small></div>',
      '<div class="field full" id="singularityDimensionWrap" hidden><label class="inlineCheck"><input id="singularityDimensionShuttle" type="checkbox"> 本卡获得“维度穿梭”的 25 层奇点信标</label><small>用于本回合第一张触发“维度穿梭”的指令卡，或带有该 25 层信标的复制卡。界域精通会同步放大层数。</small></div>',
      '<div class="field full" id="ultraRoundWrap" hidden><label class="inlineCheck"><input id="ultraRoundActive" type="checkbox"> 当前处于普通超维回合</label><small>普通超维：本回合伤害、中毒、反击、出血等输出 -25%。奇点·超维使用重写后的规则，不套此开关。</small></div>',
      '</div>',
      '<div class="combatReadout" id="realmEnvironmentReadout"></div>',
      '<details class="formulaSource"><summary>双界域 / 至纯规则</summary><div>',
      '<div class="formulaRow"><b>队伍限制</b><br>同一队最多出现两个不同界域；只有一种界域时自动视为至纯界域。</div>',
      '<div class="formulaRow"><b>混沌共生</b><br>普通混沌与深海/血肉/超维共存时，另一界域仍按至纯处理，并触发对应混沌共生效果。</div>',
      '<div class="formulaRow"><b>原初·混沌例外</b><br>「不可分割界域」会禁止其他界域的至纯、双倍界域精通和双倍伤害强效，因此不会把“普通混沌共生”的规则套到原初·混沌。</div>',
      '<div class="formulaRow"><b>进阶界域</b><br>繁育·血肉、晦暝·深海、奇点·超维均按各自 SKeyDB 条件判断“全队仅本界域/混沌”时的双倍效果。</div><div class="formulaRow"><b>奇点·超维</b><br>基础团队伤害强效 +50%（全队仅超维/混沌时 +100%）；15 层奇点棱镜，“维度穿梭”额外 25 层信标。界域精通每点使这两类层数 +0.05%，至纯条件下效果翻倍。每层信标使指令卡的最终伤害与固定中毒/反击 +2%。</div><div class="formulaRow"><b>普通超维回合</b><br>SKeyDB：普通超维回合中造成的伤害、中毒、反击、出血等效果 -25%。奇点·超维的重写“超维空间”文本没有这条惩罚，因此不交叉套用。</div>',
      '</div></details>'
    ].join('');
    builder.appendChild(block);
    localizeRealmUi();
    for(const id of ['realmPrimary','realmSecondary','realmChaosCount','propagationConsumeEmbryo','propagationApplyFiesta','singularityDimensionShuttle','ultraRoundActive']){
      $(id)?.addEventListener('input',()=>queueMicrotask(render));
      $(id)?.addEventListener('change',()=>queueMicrotask(render));
    }
    $('charSelect')?.addEventListener('change',()=>setTimeout(render,30));
    window.addEventListener('morimens-character-stats',()=>queueMicrotask(render));
    window.addEventListener('morimens-skill-formula',()=>queueMicrotask(render));
    window.addEventListener('morimens-language-change',()=>queueMicrotask(()=>{localizeRealmUi();render()}));
    setTimeout(render,0);
  }

  window.MorimensRealmEngine={state,render,selectedModes,inferNormalMode,scaledStacks,modeMeta:MODE_META};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(inject,0));
  else setTimeout(inject,0);
})();
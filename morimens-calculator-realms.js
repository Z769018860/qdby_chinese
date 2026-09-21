(()=>{
  const $=id=>document.getElementById(id);
  const num=(v,f=0)=>{const n=Number.parseFloat(v);return Number.isFinite(n)?n:f};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const EPS=1e-9;
  const MODE_META={
    chaos:{base:'CHAOS',label:'普通混沌'},
    primordia:{base:'CHAOS',label:'原初混沌 · Primordia: Chaos',advanced:true},
    caro:{base:'CARO',label:'普通血肉'},
    propagation:{base:'CARO',label:'繁衍血肉 · Propagation: Caro',advanced:true},
    aequor:{base:'AEQUOR',label:'普通深海'},
    benthos:{base:'AEQUOR',label:'深渊深海 · Benthos: Aequor',advanced:true},
    ultra:{base:'ULTRA',label:'普通超维'}
  };
  const BASE_ZH={CHAOS:'混沌',CARO:'血肉',AEQUOR:'深海',ULTRA:'超维'};

  function currentRecord(){
    return window.MorimensCharacterSync?.record
      ||window.MorimensData?.db?.records?.find(x=>x.id===($('charSelect')?.value||''))||null;
  }
  function inferNormalMode(){
    const realm=String(currentRecord()?.realm||'').toUpperCase();
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
    return Math.max(0,num($('realmMastery')?.value,window.MorimensCharacterSync?.finalStats?.RealmMastery||0));
  }
  function isExalt(){
    const slot=String(window.MorimensSkillSync?.skill?.slot||'');
    return slot==='Exalt'||slot==='OverExalt';
  }
  function scaledStacks(base,rm,effectMultiplier=1){
    return Math.ceil(base*(1+rm*0.0005*effectMultiplier)-EPS);
  }
  function hasMode(modes,name){return modes.includes(name)}
  function basesOf(modes){return [...new Set(modes.map(x=>MODE_META[x]?.base).filter(Boolean))]}
  function onlyFrom(bases,allowed){return bases.length>0&&bases.every(x=>allowed.includes(x))}
  function describeBases(bases){return bases.map(x=>BASE_ZH[x]||x).join(' + ')}

  function state(){
    const modes=selectedModes(),baseRealms=basesOf(modes),rm=mastery();
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
      ULTRA:!indivisible&&((isPure&&baseRealms[0]==='ULTRA')||(chaosCoexistence&&otherRealm==='ULTRA'))
    };
    const masteryEffectMultiplier={
      CHAOS:1,
      AEQUOR:pureEffects.AEQUOR?2:1,
      CARO:pureEffects.CARO?2:1,
      ULTRA:pureEffects.ULTRA?2:1
    };

    const out={
      modes,baseRealms,isDual,isPure,indivisible,normalChaos,chaosCoexistence,chaosCount,otherRealm,
      label:isPure?`至纯${describeBases(baseRealms)}`:`${describeBases(baseRealms)}双界域`,
      realmMastery:rm,pureEffects,masteryEffectMultiplier,
      atkMultiplier:1,defMultiplier:1,maxHpMultiplier:1,teamDamageAmp:0,finalDamageBonus:0,
      primordiaAllChaosTeam:false,primordiaUtilityMultiplier:1,primordiaOffensiveMultiplier:1,
      propagationFiestaStacks:0,propagationApplies:false,
      tentacleMode:baseRealms.includes('AEQUOR')?(hasMode(modes,'benthos')?'benthos':'standard'):null,
      tentacleMasteryMultiplier:masteryEffectMultiplier.AEQUOR,
      startingTentacleMultiplier:pureEffects.AEQUOR?2:1,
      aequorChaosBaseTentacleBonusPct:chaosCoexistence&&otherRealm==='AEQUOR'?chaosCount:0,
      notes:[]
    };

    if(indivisible){
      out.notes.push('原初混沌「不可分割界域」生效：其他界域不触发至纯、双倍界域精通或双倍伤害强效。');
    }else if(chaosCoexistence){
      out.notes.push(`混沌共生：${BASE_ZH[otherRealm]||otherRealm}按至纯界域处理；当前混沌唤醒体数量 ${chaosCount}。`);
    }else if(isPure){
      out.notes.push('队伍只有一种界域，自动按至纯界域处理。');
    }else{
      out.notes.push('队伍包含两个不同界域，按双界域处理，不触发普通至纯效果。');
    }

    if(hasMode(modes,'primordia')){
      const allChaos=isPure&&baseRealms[0]==='CHAOS';
      out.primordiaAllChaosTeam=allChaos;
      out.atkMultiplier*=1.10;
      out.defMultiplier*=1.10;
      out.teamDamageAmp+=allChaos?100:50;
      out.primordiaUtilityMultiplier=1+rm*0.0005*(allChaos?2:1);
      out.primordiaOffensiveMultiplier=1+rm*0.001*(allChaos?2:1);
      out.notes.push(`原初混沌：攻击/防御 +10%，团队伤害强效 +${allChaos?100:50}%。`);
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
      out.finalDamageBonus=out.propagationApplies?out.propagationFiestaStacks:0;
      out.masteryEffectMultiplier.CARO=effectMult;
      out.notes.push(`繁衍血肉：最大生命 +10%，团队伤害强效 +${doubled?100:50}%，当前繁衍狂欢 ${out.propagationFiestaStacks} 层。`);
    }

    if(hasMode(modes,'benthos')){
      const doubled=!indivisible&&onlyFrom(baseRealms,['AEQUOR','CHAOS']);
      out.teamDamageAmp+=doubled?100:50;
      out.tentacleMasteryMultiplier=doubled?2:1;
      out.notes.push(`深渊深海：基础触腕为队伍最大生命 5%，团队伤害强效 +${doubled?100:50}%，怒涛界域精通效果 ×${out.tentacleMasteryMultiplier}。`);
    }else if(baseRealms.includes('AEQUOR')){
      out.notes.push(`普通深海：界域精通效果 ×${out.tentacleMasteryMultiplier}${out.startingTentacleMultiplier===2?'，至纯效果使初始触腕数翻倍':''}。`);
    }

    if(chaosCoexistence&&otherRealm==='AEQUOR'){
      out.notes.push(`混沌×深海：每名混沌唤醒体使基础触腕额外增加队伍最大生命 1%，当前合计 +${out.aequorChaosBaseTentacleBonusPct}% 最大生命。`);
    }
    if(chaosCoexistence&&otherRealm==='CARO'){
      out.notes.push(`混沌×血肉：每名混沌唤醒体回合结束积累 2% 最大生命的猩红熔炉；混沌角色释放狂气爆发时胚胎融合 +25%。`);
    }
    if(chaosCoexistence&&otherRealm==='ULTRA'){
      out.notes.push(`混沌×超维：超维按至纯处理；每名混沌唤醒体提供共生力量效果，超维唤醒体暴击伤害 +10%。`);
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
  function updateVisibility(){
    syncSecondaryOptions();
    const s=state();
    const propagation=s.modes.includes('propagation');
    if($('propagationConsumeWrap'))$('propagationConsumeWrap').hidden=!propagation;
    if($('propagationApplyWrap'))$('propagationApplyWrap').hidden=!propagation;
    if($('realmChaosCountWrap'))$('realmChaosCountWrap').hidden=!s.chaosCoexistence;
  }
  function render(){
    updateVisibility();
    const s=state(),box=$('realmEnvironmentReadout');
    if(box){
      const chips=[
        '<span class="chip">'+esc(s.label)+'</span>',
        s.isDual?'<span class="chip">双界域</span>':'<span class="chip">至纯界域</span>',
        s.indivisible?'<span class="chip">不可分割界域</span>':'',
        s.atkMultiplier!==1?'<span class="chip">攻击 ×'+s.atkMultiplier.toFixed(2)+'</span>':'',
        s.defMultiplier!==1?'<span class="chip">防御 ×'+s.defMultiplier.toFixed(2)+'</span>':'',
        s.teamDamageAmp?'<span class="chip">团队伤害强效 +'+s.teamDamageAmp.toFixed(0)+'%</span>':'',
        s.maxHpMultiplier!==1?'<span class="chip">最大生命 ×'+s.maxHpMultiplier.toFixed(2)+'</span>':'',
        s.finalDamageBonus?'<span class="chip">本次狂气爆发终伤 +'+s.finalDamageBonus.toFixed(0)+'%</span>':''
      ].filter(Boolean);
      box.innerHTML='<div class="autoSummary">'+chips.join('')+'</div><div style="margin-top:7px">'+s.notes.map(esc).join('<br>')+'</div>';
    }
    const pill=document.querySelector('[aria-labelledby="calcTitle"] .statusPill');
    if(pill)pill.textContent='v0.6 · 双界域 / 至纯 / Damage Events';
    window.MorimensRealmState=s;
    window.dispatchEvent(new CustomEvent('morimens-realm-change',{detail:s}));
    return s;
  }
  function options(includeAuto=false){
    return [
      includeAuto?'<option value="auto">按当前角色界域（普通形态）</option>':'',
      '<option value="chaos">普通混沌</option>',
      '<option value="primordia">原初混沌</option>',
      '<option value="caro">普通血肉</option>',
      '<option value="propagation">繁衍血肉</option>',
      '<option value="aequor">普通深海</option>',
      '<option value="benthos">深渊深海</option>',
      '<option value="ultra">普通超维</option>'
    ].join('');
  }
  function inject(){
    if($('realmEnvironmentModel')||!$('calcBtn'))return;
    const builder=$('calcBtn').closest('.panel')?.querySelector('.builder');if(!builder)return;
    const block=document.createElement('div');block.className='builderBlock';block.id='realmEnvironmentModel';
    block.innerHTML=[
      '<div class="builderTitle"><span>⑥ 队伍界域</span><small>最多两个不同界域</small></div>',
      '<div class="formGrid">',
      '<div class="field"><label for="realmPrimary">主界域</label><select id="realmPrimary">',options(true),'</select><small>可按当前角色自动识别普通界域，也可手动选择进阶界域。</small></div>',
      '<div class="field"><label for="realmSecondary">第二界域</label><select id="realmSecondary"><option value="">无 · 至纯界域</option>',options(false),'</select><small>留空即至纯；选择另一个不同界域即双界域。最多两种界域。</small></div>',
      '<div class="field" id="realmChaosCountWrap" hidden><label for="realmChaosCount">混沌唤醒体数量</label><input id="realmChaosCount" type="number" min="1" max="4" step="1" value="1"><small>用于混沌×深海/血肉/超维的共生效果。</small></div>',
      '<div class="field" id="propagationConsumeWrap" hidden><label class="inlineCheck"><input id="propagationConsumeEmbryo" type="checkbox"> 本回合已首次吞噬繁衍胚胎</label><small>额外获得基础 40 层繁衍狂欢，并受繁衍血肉精通加成。</small></div>',
      '<div class="field full" id="propagationApplyWrap" hidden><label class="inlineCheck"><input id="propagationApplyFiesta" type="checkbox" checked> 将繁衍狂欢用于本次狂气爆发</label><small>只对狂气爆发/超限爆发自动计入最终伤害。</small></div>',
      '</div>',
      '<div class="combatReadout" id="realmEnvironmentReadout"></div>',
      '<details class="formulaSource"><summary>双界域 / 至纯规则</summary><div>',
      '<div class="formulaRow"><b>队伍限制</b><br>同一队最多出现两个不同界域；只有一种界域时自动视为至纯界域。</div>',
      '<div class="formulaRow"><b>混沌共生</b><br>普通混沌与深海/血肉/超维共存时，另一界域仍按至纯处理，并触发对应混沌共生效果。</div>',
      '<div class="formulaRow"><b>原初混沌例外</b><br>「不可分割界域」会禁止其他界域的至纯、双倍界域精通和双倍伤害强效，因此不会把“普通混沌共生”的规则套到原初混沌。</div>',
      '<div class="formulaRow"><b>进阶界域</b><br>繁衍血肉与深渊深海仍按各自 SKeyDB 条件判断“全队仅本界域/混沌”时的双倍效果。</div>',
      '</div></details>'
    ].join('');
    builder.appendChild(block);
    for(const id of ['realmPrimary','realmSecondary','realmChaosCount','propagationConsumeEmbryo','propagationApplyFiesta']){
      $(id)?.addEventListener('input',()=>queueMicrotask(render));
      $(id)?.addEventListener('change',()=>queueMicrotask(render));
    }
    $('charSelect')?.addEventListener('change',()=>setTimeout(render,30));
    window.addEventListener('morimens-character-stats',()=>queueMicrotask(render));
    window.addEventListener('morimens-skill-formula',()=>queueMicrotask(render));
    setTimeout(render,0);
  }

  window.MorimensRealmEngine={state,render,selectedModes,inferNormalMode,scaledStacks,modeMeta:MODE_META};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(inject,0));
  else setTimeout(inject,0);
})();
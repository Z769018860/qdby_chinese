(()=>{
  const $=id=>document.getElementById(id);
  const num=(v,f=0)=>{const n=Number.parseFloat(v);return Number.isFinite(n)?n:f};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const EPS=1e-9;

  function currentRecord(){
    return window.MorimensCharacterSync?.record
      || window.MorimensData?.db?.records?.find(x=>x.id===($('charSelect')?.value||''))||null;
  }
  function inferNormalMode(){
    const realm=String(currentRecord()?.realm||'').toUpperCase();
    if(realm==='AEQUOR')return 'aequor';
    if(realm==='CARO')return 'caro';
    if(realm==='CHAOS')return 'chaos';
    return 'none';
  }
  function effectiveMode(){
    const raw=$('realmMode')?.value||'auto';
    return raw==='auto'?inferNormalMode():raw;
  }
  function mastery(){
    const input=$('realmMastery');
    if(input)return Math.max(0,num(input.value));
    return Math.max(0,num(window.MorimensCharacterSync?.finalStats?.RealmMastery));
  }
  function scaledStacks(base,rm,pure){
    return Math.ceil(base*(1+rm*0.0005*(pure?2:1))-EPS);
  }
  function isExalt(){
    const slot=String(window.MorimensSkillSync?.skill?.slot||'');
    return slot==='Exalt'||slot==='OverExalt';
  }
  function state(){
    const mode=effectiveMode(),rm=mastery(),pure=$('realmPureTeam')?.checked===true;
    const out={
      mode,label:'无界域额外修正',realmMastery:rm,pureTeam:pure,
      atkMultiplier:1,defMultiplier:1,maxHpMultiplier:1,
      teamDamageAmp:0,finalDamageBonus:0,
      primordiaAllChaosTeam:false,
      primordiaUtilityMultiplier:1,primordiaOffensiveMultiplier:1,
      propagationFiestaStacks:0,propagationApplies:false,
      tentacleMode:null,notes:[]
    };
    if(mode==='chaos'){
      out.label='普通混沌';
      out.notes.push('普通混沌的银钥/造物机制不直接形成通用直伤乘区。');
    }else if(mode==='primordia'){
      out.label='原初混沌';
      out.atkMultiplier=1.10;
      out.defMultiplier=1.10;
      out.teamDamageAmp=pure?100:50;
      out.primordiaAllChaosTeam=pure;
      out.primordiaUtilityMultiplier=1+rm*0.0005*(pure?2:1);
      out.primordiaOffensiveMultiplier=1+rm*0.001*(pure?2:1);
      out.notes.push('攻击/防御 +10%，全队伤害强效 +'+out.teamDamageAmp+'%。');
      out.notes.push('原初混沌精通只额外缩放造物效果，不直接乘到普通技能伤害。');
    }else if(mode==='caro'){
      out.label='普通血肉';
      out.notes.push('普通血肉的胚胎/吞噬效果由各角色狂气爆发文本决定，不存在统一直伤倍率。');
    }else if(mode==='propagation'){
      out.label='繁衍血肉';
      out.maxHpMultiplier=1.10;
      out.teamDamageAmp=pure?100:50;
      const turnStacks=scaledStacks(20,rm,pure);
      const embryoStacks=$('propagationConsumeEmbryo')?.checked===true?scaledStacks(40,rm,pure):0;
      out.propagationFiestaStacks=turnStacks+embryoStacks;
      out.propagationApplies=isExalt()&&$('propagationApplyFiesta')?.checked!==false;
      out.finalDamageBonus=out.propagationApplies?out.propagationFiestaStacks:0;
      out.notes.push('最大生命 +10%，全队伤害强效 +'+out.teamDamageAmp+'%。');
      out.notes.push('回合开始获得 '+turnStacks+' 层繁衍狂欢'+(embryoStacks?'，首次吞噬繁衍胚胎额外获得 '+embryoStacks+' 层':'')+'。');
    }else if(mode==='aequor'){
      out.label='普通深海';
      out.tentacleMode='standard';
      out.notes.push('使用普通触腕姿态：涨潮 100%、静海 50%、怒涛 125%。');
    }else if(mode==='benthos'){
      out.label='深渊深海';
      out.tentacleMode='benthos';
      out.teamDamageAmp=pure?100:50;
      out.notes.push('基础触腕伤害 = 队伍最大生命 ×5%，全队伤害强效 +'+out.teamDamageAmp+'%。');
      out.notes.push('深渊静海不进行回合末触腕攻击；深渊怒涛公开数据未给固定基础倍率，使用手动校准值。');
    }
    return out;
  }

  function updateVisibility(){
    const mode=effectiveMode();
    const advanced=['primordia','propagation','benthos'].includes(mode);
    if($('realmPureWrap'))$('realmPureWrap').hidden=!advanced;
    const propagation=mode==='propagation';
    if($('propagationConsumeWrap'))$('propagationConsumeWrap').hidden=!propagation;
    if($('propagationApplyWrap'))$('propagationApplyWrap').hidden=!propagation;
  }
  function render(){
    updateVisibility();
    const s=state(),box=$('realmEnvironmentReadout');
    if(box){
      const chips=[
        '<span class="chip">'+esc(s.label)+'</span>',
        s.atkMultiplier!==1?'<span class="chip">攻击 ×'+s.atkMultiplier.toFixed(2)+'</span>':'',
        s.defMultiplier!==1?'<span class="chip">防御 ×'+s.defMultiplier.toFixed(2)+'</span>':'',
        s.teamDamageAmp?'<span class="chip">团队伤害强效 +'+s.teamDamageAmp.toFixed(0)+'%</span>':'',
        s.maxHpMultiplier!==1?'<span class="chip">最大生命 ×'+s.maxHpMultiplier.toFixed(2)+'</span>':'',
        s.finalDamageBonus?'<span class="chip">本次狂气爆发终伤 +'+s.finalDamageBonus.toFixed(0)+'%</span>':''
      ].filter(Boolean);
      box.innerHTML='<div class="autoSummary">'+chips.join('')+'</div><div style="margin-top:7px">'+s.notes.map(esc).join('<br>')+'</div>';
    }
    const pill=document.querySelector('[aria-labelledby="calcTitle"] .statusPill');
    if(pill)pill.textContent='v0.5 · SKeyDB 2.6.1 界域模型';
    window.MorimensRealmState=s;
    window.dispatchEvent(new CustomEvent('morimens-realm-change',{detail:s}));
    return s;
  }
  function inject(){
    if($('realmEnvironmentModel')||!$('calcBtn'))return;
    const builder=$('calcBtn').closest('.panel')?.querySelector('.builder');if(!builder)return;
    const block=document.createElement('div');block.className='builderBlock';block.id='realmEnvironmentModel';
    block.innerHTML=[
      '<div class="builderTitle"><span>⑥ 队伍界域</span><small>SKeyDB 2.6.1</small></div>',
      '<div class="formGrid">',
      '<div class="field full"><label for="realmMode">界域模式</label><select id="realmMode">',
      '<option value="auto">按当前角色界域（普通形态）</option>',
      '<option value="chaos">普通混沌</option>',
      '<option value="primordia">原初混沌 · Primordia: Chaos</option>',
      '<option value="caro">普通血肉</option>',
      '<option value="propagation">繁衍血肉 · Propagation: Caro</option>',
      '<option value="aequor">普通深海</option>',
      '<option value="benthos">深渊深海 · Benthos: Aequor</option>',
      '</select><small>进阶界域需手动选择；普通形态可按当前角色自动识别。</small></div>',
      '<div class="field full" id="realmPureWrap" hidden><label class="inlineCheck"><input id="realmPureTeam" type="checkbox"> 满足该进阶界域的纯队条件</label><small>原初混沌：全队混沌；繁衍血肉：全队血肉/混沌；深渊深海：全队深海/混沌。对应团队强效或精通效果会翻倍。</small></div>',
      '<div class="field" id="propagationConsumeWrap" hidden><label class="inlineCheck"><input id="propagationConsumeEmbryo" type="checkbox"> 本回合已首次吞噬繁衍胚胎</label><small>额外获得基础 40 层繁衍狂欢，并受繁衍血肉精通加成。</small></div>',
      '<div class="field" id="propagationApplyWrap" hidden><label class="inlineCheck"><input id="propagationApplyFiesta" type="checkbox" checked> 将繁衍狂欢用于本次狂气爆发</label><small>只对狂气爆发/超限爆发自动计入最终伤害；其他技能不会误加。</small></div>',
      '</div>',
      '<div class="combatReadout" id="realmEnvironmentReadout"></div>',
      '<details class="formulaSource"><summary>界域公式</summary><div>',
      '<div class="formulaRow"><b>原初混沌</b><br>全队攻击/防御 +10%；团队伤害强效 +50%，纯混沌 +100%。原初混沌精通：辅助类造物每点 +0.05%，进攻类造物每点 +0.10%，纯混沌翻倍。</div>',
      '<div class="formulaRow"><b>繁衍血肉</b><br>最大生命 +10%；团队伤害强效 +50%，纯血肉/混沌 +100%。回合开始基础 20 层繁衍狂欢；首次吞噬繁衍胚胎基础 40 层。每点界域精通使获得层数 +0.05%，纯队翻倍，并向上取整。</div>',
      '<div class="formulaRow"><b>深渊深海</b><br>基础触腕 = 队伍最大生命 ×5%；团队伤害强效 +50%，纯深海/混沌 +100%。怒涛触腕每点界域精通 +0.025%，纯队翻倍。</div>',
      '</div></details>'
    ].join('');
    builder.appendChild(block);
    for(const id of ['realmMode','realmPureTeam','propagationConsumeEmbryo','propagationApplyFiesta']){
      $(id)?.addEventListener('input',()=>queueMicrotask(render));
      $(id)?.addEventListener('change',()=>queueMicrotask(render));
    }
    $('charSelect')?.addEventListener('change',()=>setTimeout(render,30));
    window.addEventListener('morimens-character-stats',()=>queueMicrotask(render));
    window.addEventListener('morimens-skill-formula',()=>queueMicrotask(render));
    setTimeout(render,0);
  }

  window.MorimensRealmEngine={state,render,effectiveMode,inferNormalMode,scaledStacks};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(inject,0));
  else setTimeout(inject,0);
})();
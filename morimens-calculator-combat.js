(()=>{
  const $=id=>document.getElementById(id);
  const n=(id,f=0)=>{const v=Number.parseFloat($(id)?.value);return Number.isFinite(v)?v:f};
  const checkedStackCount=(checkId,inputId)=>{
    if($(checkId)?.checked!==true)return 0;
    const raw=Number.parseFloat($(inputId)?.value);
    return Number.isFinite(raw)&&raw>0?Math.max(1,Math.floor(raw)):1;
  };
  const vulnerableStackCount=()=>checkedStackCount('targetVulnerable','targetVulnerableStacks');
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  const fmt=v=>Math.round(Number(v)||0).toLocaleString('zh-CN');
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const BREAKDOWN_ICON_BASE='assets/morimens/skeydb-icons/';
  const breakdownVisuals={
    active:{glyph:'✧',label:'主动伤害'},
    pierce:{glyph:'↯',label:'穿透伤害'},
    tentacle:{glyph:'≋',label:'触腕伤害'},
    pure:{glyph:'✦',label:'纯粹伤害'},
    fixed:{glyph:'◆',label:'固定伤害'},
    poison:{icon:'IconS_Buff_006.webp',label:'中毒'},
    bleed:{icon:'IconS_Buff_022.webp',label:'出血'},
    corrosion:{icon:'IconS_Buff_070.webp',label:'侵蚀'},
    counter:{icon:'IconS_Buff_019.webp',label:'反击'},
    sacrifice:{icon:'IconS_Buff_041.webp',label:'献祭'},
    birthRitual:{icon:'IconS_Buff_079.webp',label:'诞生仪式'},
    embers:{icon:'IconS_Buff_025.webp',label:'旧日余烬'},
    fortress:{icon:'IconS_Buff_046.webp',label:'加固'},
    vulnerable:{icon:'IconS_Buff_003.webp',label:'易伤'},
    total:{glyph:'Σ',label:'总伤害'}
  };
  function breakdownKind(label){
    const text=String(label||'');
    if(/诞生仪式/.test(text))return 'birthRitual';
    if(/旧日余烬/.test(text))return 'embers';
    if(/中毒/.test(text))return 'poison';
    if(/出血/.test(text))return 'bleed';
    if(/侵蚀/.test(text))return 'corrosion';
    if(/反击/.test(text))return 'counter';
    if(/献祭/.test(text))return 'sacrifice';
    if(/触腕/.test(text))return 'tentacle';
    if(/穿透/.test(text))return 'pierce';
    if(/纯粹/.test(text))return 'pure';
    if(/固定伤害/.test(text))return 'fixed';
    if(/主动伤害/.test(text))return 'active';
    if(/加固/.test(text))return 'fortress';
    if(/易伤/.test(text))return 'vulnerable';
    if(/合计|总伤害/.test(text))return 'total';
    return '';
  }
  function breakdownIconHtml(kind){
    const meta=breakdownVisuals[kind];if(!meta)return '';
    if(meta.icon)return '<img class="breakdownIcon" src="'+BREAKDOWN_ICON_BASE+meta.icon+'" alt="" decoding="async" loading="lazy">';
    return '<span class="breakdownGlyph" aria-hidden="true">'+esc(meta.glyph||'•')+'</span>';
  }
  function breakdownLabelHtml(label,kind=breakdownKind(label)){
    return '<span class="breakdownLabel">'+breakdownIconHtml(kind)+'<span>'+esc(label)+'</span></span>';
  }
  function damageCompositionHtml(parts,total){
    const positive=parts.filter(x=>Number(x.value)>0);
    if(!positive.length)return '';
    return '<section class="damageComposition"><div class="damageCompositionTitle"><strong>伤害构成</strong><small>按本次对敌总伤害占比</small></div><div class="damageCompositionGrid">'+positive.map(part=>{
      const pct=total>0?Math.max(0,Number(part.value)||0)/total*100:0;
      return '<div class="damageCompositionItem" title="'+esc(part.label)+'：'+fmt(part.value)+'（'+pct.toFixed(1)+'%）"><div class="damageCompositionHead">'+breakdownIconHtml(part.kind)+'<span>'+esc(part.label)+'</span><strong>'+fmt(part.value)+'</strong></div><div class="damageCompositionTrack"><i style="width:'+Math.min(100,pct).toFixed(2)+'%"></i></div><small>'+pct.toFixed(1)+'%</small></div>';
    }).join('')+'</div></section>';
  }

  function currentLevel(){return clamp(Number.parseFloat(($('charLevel')||$('skeydbCharacterLevel'))?.value)||90,1,90)}
  function currentRecord(){const id=$('charSelect')?.value;return window.MorimensData?.db?.records?.find(x=>x.id===id)||((window.MorimensCharacterSync?.record?.id===id)?window.MorimensCharacterSync.record:null)||null}
  function resolvedStats(){
    if(window.MorimensProgressionStats)return window.MorimensProgressionStats;
    if(window.MorimensCharacterSync?.finalStats)return window.MorimensCharacterSync.finalStats;
    const rec=currentRecord(),engine=window.MorimensFormulaEngine;
    return rec&&engine?engine.contextFor(rec,currentLevel()):{};
  }

  function setResultMode(mode){
    const selected=['expected','crit','normal'].includes(mode)?mode:'expected';
    document.querySelectorAll('.modeBtn[data-mode]').forEach(button=>{
      button.setAttribute('aria-pressed',button.dataset.mode===selected?'true':'false');
    });
  }

  function inject(){
    if($('combatModel')||!$('calcBtn'))return;
    const first=$('charSelect')?.closest('.builderBlock');
    if(first){
      const stats=document.createElement('div');
      stats.id='characterTriplet';stats.className='combatStats';
      stats.innerHTML='<div><small>体质</small><strong id="combatCon">—</strong></div><div><small>攻击力</small><strong id="combatAtk">—</strong></div><div><small>防御力</small><strong id="combatDef">—</strong></div>';
      first.querySelector('.formGrid')?.insertAdjacentElement('afterend',stats);
    }

    const builder=$('calcBtn').closest('.panel')?.querySelector('.builder');
    if(!builder)return;

    const realm=document.createElement('div');
    realm.className='builderBlock calcSection calcSectionTentacle';realm.id='realmTentacleModel';
    realm.innerHTML=`
      <div class="builderTitle"><span>⑦ 界域精通与触腕伤害</span><small>SKeyDB 数据公式</small></div>
      <div class="formGrid">
        <div class="field"><label for="realmMastery">最终界域精通</label><input id="realmMastery" type="number" min="0" step="0.1" value="0"><small>默认按角色等级与 SKeyDB 副属性成长规则自动带入，可手动覆盖。</small></div>
        <div class="field"><label for="tentacleMode">触腕基础模型</label><select id="tentacleMode"><option value="standard">普通深海 / 普通触腕</option><option value="benthos">晦暝·深海</option></select><small>选择“普通/晦暝·深海”界域时会自动锁定对应模型。</small></div>
        <div class="field"><label for="tentacleStance">触腕姿态</label><select id="tentacleStance"><option value="surging">潮涌</option><option value="tranquil">静海</option><option value="raging">怒涛</option></select></div>
        <div class="field" id="standardTentacleField"><label for="currentTentacleDamage">当前基础触腕伤害</label><input id="currentTentacleDamage" type="number" min="0" step="1" value="0"><small>普通深海的基础值 SKeyDB 未公开统一生成公式，直接填游戏触腕图标当前数值。</small></div>
        <div class="field" id="benthosHpField" hidden><label for="teamMaxHp">队伍最大生命</label><input id="teamMaxHp" type="number" min="0" step="1" value="0"><small id="teamMaxHpNote">晦暝·深海：基础触腕伤害 = 队伍最大生命 × 5%。</small></div>
        <div class="field"><label for="tentacleExtraBonus">额外触腕伤害增幅 %</label><input id="tentacleExtraBonus" type="number" step="0.1" value="0"><small>用于命轮、技能、遗物等已经折算后的额外触腕增幅。</small></div>
        <div class="field"><label for="tentacleCritRate">触腕暴击率 %</label><input id="tentacleCritRate" type="number" min="0" max="100" step="0.1" value="0"><small>团队入场暴击率汇总规则需要完整队伍数据，当前允许手动填写最终触腕暴击率。</small></div>
        <div class="field"><label for="tentacleCritDamage">触腕暴击伤害 %</label><input id="tentacleCritDamage" type="number" min="100" step="0.1" value="150"><small>用于触腕事件的暴击/期望伤害。</small></div>
        <div class="field"><label for="strengthDown">力量降低</label><input id="strengthDown" type="number" min="0" step="0.1" value="0"><small>主动伤害每点 -1；触腕按 50% 生效。</small></div>
        <div class="field"><label for="tentacleCount">当前触腕数</label><input id="tentacleCount" type="number" min="0" step="1" value="1"></div>
        <div class="field"><label for="tentacleAttackTimes">每只触腕攻击次数</label><input id="tentacleAttackTimes" type="number" min="0" step="1" value="1"></div>
      </div>
      <div class="checkGrid" style="margin-top:10px">
        <label class="check"><input id="includeTurnEndTentacle" type="checkbox"><span>把回合末触腕攻击计入总伤害<small>深渊静海会自动禁止回合末触腕攻击。</small></span></label>
      </div>
      <div class="combatReadout" id="tentacleReadout"></div>
      <details class="formulaSource"><summary>SKeyDB 计算公式与数据来源</summary><div id="tentacleFormulaSource"></div></details>`;

    const enemy=document.createElement('div');
    enemy.className='builderBlock calcSection calcSectionEnemy';enemy.id='combatModel';
    enemy.innerHTML=`
      <div class="builderTitle"><span>⑧ 敌人等级与状态事件</span><small>通用等级模型 + SKeyDB 状态规则</small></div>
      <div class="formGrid">
        <div class="field"><label for="enemyLevel">敌人等级</label><input id="enemyLevel" type="number" min="1" max="120" step="1" value="77"><small>用于通用承伤系数与默认最大生命估算。</small></div>
        <div class="field"><label for="enemyMaxHpOverride">敌人最大生命（可选覆盖）</label><input id="enemyMaxHpOverride" type="number" min="0" step="1" placeholder="留空使用等级拟合"><small>目标最大生命百分比的纯粹伤害 / 侵蚀效果会优先使用此值。</small></div>
        <div class="field"><label for="fortressStacks">加固层数</label><input id="fortressStacks" type="number" min="0" max="100" step="1" value="0"><small>SKeyDB：每层使受到的伤害降低 1%。</small></div>
        <div class="field"><label class="inlineCheck"><input id="forceCritAll" type="checkbox"> 本次可暴击伤害强制暴击</label><small>用于“当前角色伤害始终暴击”等已激活战斗态；技能文本自身写明“必定暴击”时无需勾选。</small></div>
        <div class="field"><label for="currentPoison">当前中毒层数</label><input id="currentPoison" type="number" min="0" step="1" value="0"><small>用于“触发 X% 中毒”等即时中毒触发。</small></div>
        <div class="field"><label for="currentBleed">当前出血层数</label><input id="currentBleed" type="number" min="0" step="1" value="0"><small>用于“触发 X% 出血”和本回合末出血结算。</small></div>
        <div class="field"><label for="currentCounter">当前反击数值</label><input id="currentCounter" type="number" min="0" step="1" value="0"><small>用于“触发 X% 反击”事件。</small></div>
        <div class="field"><label for="actorMaxHp">当前角色最大生命</label><input id="actorMaxHp" type="number" min="0" step="1" value="0" placeholder="用于 Pure DMG 保底"><small>SKeyDB 未公开通用 CON→Max HP 换算；仅在技能的 Pure DMG 最低值等伤害公式明确依赖角色最大生命时填写。</small></div>
        <div class="field"><label for="actorCurrentHp">当前角色当前生命</label><input id="actorCurrentHp" type="number" min="0" step="1" placeholder="留空按最大生命"><small>用于 Doresain 等“按当前 HP 百分比造成 Pure DMG”的效果；留空时按当前为满生命处理。</small></div>
        <div class="field"><label for="corrosionAmount">侵蚀层数 / 数值</label><input id="corrosionAmount" type="number" min="0" step="1" value="0"><small>主动伤害 / 触腕伤害按伤害等量消费；其他伤害按 50% 消费；回合末清空。</small></div>
        <div class="field"><label for="corrosionLossMultiplier">侵蚀生命损失倍率 %</label><input id="corrosionLossMultiplier" type="number" min="0" step="1" value="300"><small>SKeyDB 默认 300%；若效果明确修改“侵蚀移除伤害”（例如 300% → 500%），在此填写修改后的倍率。</small></div>
        <div class="field"><label for="embersAmount">旧日余烬层数 / 数值</label><input id="embersAmount" type="number" min="0" step="1" value="0"><small>主动伤害 / 触腕伤害按伤害等量消费；穿透 / 纯粹 / 固定 / 中毒 / 出血 / 反击等其他伤害按伤害的 50% 消费；追加消费量 300% 的生命损失。</small></div>
        <div class="field"><label for="enemySacrificeAmount">敌方当前献祭层数</label><input id="enemySacrificeAmount" type="number" min="0" step="0.1" value="0"><small>回合末每层造成 1 点伤害并移除 50%；该伤害计入对敌总伤害，并按“其他伤害”触发侵蚀/旧日余烬。</small></div>
        <div class="field"><label for="birthRitualStacks">敌方已有诞生仪式层数</label><input id="birthRitualStacks" type="number" min="0" max="75" step="1" value="0"><small>每层使敌人受到的主动伤害 / 触腕伤害的 1% 转化为献祭；所选技能本身即时施加的层数会自动叠加，上限 75 层，回合末移除。</small></div>
        <div class="field"><label for="sacrificeOnDamagePct">额外“伤害→献祭”比例 %</label><input id="sacrificeOnDamagePct" type="number" min="0" step="0.1" value="0"><small>用于已激活的「潮汐圣礼」灵知觉醒、遗物等持续战斗态。灵塑的同类效果会自动叠加；默认作用于角色自身主动 / 穿透 / 固定伤害，独立触腕通过诞生仪式计算。</small></div>
      </div>
      <div class="checkGrid" style="margin-top:10px">
        <label class="check"><input id="includeTurnEndSettlement" type="checkbox" checked><span>结算到本回合结束<small>开启后才执行回合末触腕 / 中毒 / 出血，并在最后清空侵蚀、重置旧日余烬；关闭可只查看本次卡牌的即时结果。</small></span></label>
        <label class="check"><input id="includePoisonTurnEnd" type="checkbox" checked><span>计入回合末中毒<small>仅在“结算到本回合结束”开启时生效；造成等于当前层数的纯粹伤害。</small></span></label>
        <label class="check"><input id="includeBleedTurnEnd" type="checkbox" checked><span>计入回合末出血<small>仅在“结算到本回合结束”开启时生效；造成等于当前层数的纯粹伤害，并随后移除。</small></span></label>
        <label class="check"><input id="includeEnemySacrificeTurnEnd" type="checkbox" checked><span>计入敌方献祭回合末伤害<small>每层造成 1 点对敌伤害，受敌方加固影响；结算后敌方献祭减半。</small></span></label>
      </div>
      <div class="combatReadout" id="enemyLevelReadout"></div>
      <div class="combatReadout" id="combatConversion"></div>`;
    builder.appendChild(realm);builder.appendChild(enemy);

    const style=document.createElement('style');
    style.textContent=`
      .combatStats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}
      .combatStats>div,.combatReadout,.formulaSource{padding:10px 12px;border:1px solid rgba(148,163,184,.14);border-radius:11px;background:rgba(2,6,23,.25)}
      .combatStats small{display:block;color:#8290a4;font-size:10px}.combatStats strong{display:block;margin-top:3px;color:#f1e0bf;font-size:18px}
      .combatReadout{margin-top:10px;color:#aeb8c7;font-size:11px;line-height:1.75}.combatReadout b{color:#f1e0bf}.realmFeatureLocked input:disabled,.realmFeatureLocked select:disabled{opacity:.48;cursor:not-allowed}.realmFeatureLocked .combatReadout{border-color:rgba(148,163,184,.24);background:rgba(2,6,23,.36)}
      .formulaSource{margin-top:10px;color:#98a5b7;font-size:11px;line-height:1.75}.formulaSource summary{cursor:pointer;color:#d9c09a;font-weight:700}.formulaSource code{color:#f1e0bf;white-space:normal}
      .formulaSource .formulaRow{margin-top:7px;padding-top:7px;border-top:1px dashed rgba(148,163,184,.14)}
      .breakdownLabel{display:inline-flex;align-items:center;gap:7px;min-width:0}.breakdownIcon{width:18px;height:18px;object-fit:contain;flex:0 0 18px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.38))}.breakdownGlyph{display:inline-grid;place-items:center;width:18px;height:18px;flex:0 0 18px;border:1px solid rgba(229,196,142,.5);border-radius:50%;color:#f0d7a7;font-size:11px;line-height:1}.damageComposition{margin:0 0 12px;padding:12px;border:1px solid rgba(229,196,142,.2);border-radius:12px;background:rgba(14,20,31,.42)}.damageCompositionTitle{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:10px}.damageCompositionTitle strong{color:#f2dfbb;font-size:13px}.damageCompositionTitle small{color:#8492a6;font-size:10px}.damageCompositionGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 12px}.damageCompositionItem{min-width:0}.damageCompositionHead{display:grid;grid-template-columns:18px minmax(0,1fr) auto;align-items:center;gap:6px;font-size:11px;color:#bac5d4}.damageCompositionHead strong{color:#f1e0bf;font-variant-numeric:tabular-nums}.damageCompositionTrack{height:4px;margin:5px 0 2px 24px;border-radius:999px;background:rgba(148,163,184,.12);overflow:hidden}.damageCompositionTrack i{display:block;height:100%;border-radius:inherit;background:currentColor;color:#d9b776}.damageCompositionItem>small{display:block;margin-left:24px;color:#7f8da1;font-size:9px}
      @media(max-width:580px){.combatStats{grid-template-columns:1fr 1fr 1fr}.damageCompositionGrid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);

    for(const id of ['realmMastery','tentacleMode','tentacleStance','currentTentacleDamage','teamMaxHp','tentacleExtraBonus','tentacleCritRate','tentacleCritDamage','strengthDown','tentacleCount','tentacleAttackTimes','includeTurnEndTentacle','enemyLevel','enemyMaxHpOverride','fortressStacks','forceCritAll','targetVulnerable','targetVulnerableStacks','buffWeak','buffWeakStacks','buffBrute','buffBruteStacks','buffBurst','buffBurstStacks','currentPoison','currentBleed','currentCounter','actorMaxHp','actorCurrentHp','corrosionAmount','corrosionLossMultiplier','embersAmount','enemySacrificeAmount','birthRitualStacks','sacrificeOnDamagePct','includeTurnEndSettlement','includePoisonTurnEnd','includeBleedTurnEnd','includeEnemySacrificeTurnEnd']){
      $(id)?.addEventListener('input',()=>{toggleTentacleMode();calculate()});
      $(id)?.addEventListener('change',()=>{toggleTentacleMode();calculate()});
    }
    document.addEventListener('input',e=>{if(e.target?.closest?.('.panel')&&e.target?.id!=='fortuneBtn')queueMicrotask(calculate)});
    document.addEventListener('change',()=>queueMicrotask(()=>{renderTriplet();calculate()}));
    $('calcBtn')?.addEventListener('click',()=>queueMicrotask(calculate));
    document.querySelectorAll('.modeBtn[data-mode]').forEach(button=>button.addEventListener('click',()=>{
      setResultMode(button.dataset.mode);
      queueMicrotask(calculate);
    }));
    document.addEventListener('click',event=>{if(event.target?.id==='resetBtn')setTimeout(resetEnemy,30)},true);
    window.addEventListener('morimens-skill-formula',()=>queueMicrotask(calculate));
    window.addEventListener('morimens-character-stats',()=>queueMicrotask(()=>{renderTriplet();calculate()}));
    window.addEventListener('morimens-realm-change',()=>queueMicrotask(()=>{toggleTentacleMode();renderTriplet();calculate()}));
    const hitField=$('hitCount')?.closest('.field');if(hitField){const label=hitField.querySelector('label');if(label)label.textContent='手动重复事件序列次数';let note=hitField.querySelector('small');if(!note){note=document.createElement('small');hitField.appendChild(note)}note.textContent='多段技能已由 SKeyDB 伤害事件自动拆分；这里仅用于额外重复整套事件，通常保持 1。'}
    const syncOptionalStackInputs=()=>{
      for(const [checkId,inputId] of [['buffWeak','buffWeakStacks'],['buffBrute','buffBruteStacks'],['buffBurst','buffBurstStacks'],['targetVulnerable','targetVulnerableStacks']]){
        const input=$(inputId);if(input)input.disabled=$(checkId)?.checked!==true;
      }
    };
    for(const id of ['buffWeak','buffBrute','buffBurst','targetVulnerable'])$(id)?.addEventListener('change',syncOptionalStackInputs);
    syncOptionalStackInputs();
    setResultMode(document.querySelector('.modeBtn[aria-pressed="true"]')?.dataset?.mode||'expected');
    toggleTentacleMode();renderTriplet();renderFormulaSource();calculate();
    window.dispatchEvent(new CustomEvent('morimens-calculator-ui-ready'));
    setTimeout(()=>{window.MorimensStatsSync?.updateCharacterStats?.();renderTriplet();calculate()},300);
  }

  function aequorRealmSelected(realm=window.MorimensRealmEngine?.state?.()){
    if(Array.isArray(realm?.baseRealms))return realm.baseRealms.includes('AEQUOR');
    return Boolean(realm?.tentacleMode);
  }
  function effectiveTentacleMode(){
    const realm=window.MorimensRealmEngine?.state?.();
    if(Array.isArray(realm?.baseRealms)&&!realm.baseRealms.includes('AEQUOR'))return null;
    return realm?.tentacleMode||$('tentacleMode')?.value||'standard';
  }
  function toggleTentacleMode(){
    const realm=window.MorimensRealmEngine?.state?.()||{};
    const aequorActive=aequorRealmSelected(realm);
    const forced=aequorActive?realm.tentacleMode:null;
    const tentacleControlIds=['tentacleMode','tentacleStance','currentTentacleDamage','teamMaxHp','tentacleExtraBonus','tentacleCritRate','tentacleCritDamage','tentacleCount','tentacleAttackTimes','includeTurnEndTentacle'];
    for(const id of tentacleControlIds){
      const el=$(id);if(!el)continue;
      el.disabled=!aequorActive||(id==='tentacleMode'&&Boolean(forced));
    }
    if(!aequorActive&&$('includeTurnEndTentacle'))$('includeTurnEndTentacle').checked=false;
    if($('realmTentacleModel')){
      $('realmTentacleModel').classList.toggle('realmFeatureLocked',!aequorActive);
      $('realmTentacleModel').dataset.realmFeature=aequorActive?'active':'locked';
    }
    if($('tentacleMode')&&forced)$('tentacleMode').value=forced;
    const benthos=aequorActive&&effectiveTentacleMode()==='benthos';
    const needsHp=aequorActive&&(benthos||Number(realm.aequorChaosBaseTentacleBonusPct)>0);
    if($('standardTentacleField'))$('standardTentacleField').hidden=!aequorActive||benthos;
    if($('benthosHpField'))$('benthosHpField').hidden=!needsHp;
    if($('teamMaxHpNote')){
      $('teamMaxHpNote').textContent=benthos
        ?'晦暝·深海：基础触腕 = 队伍最大生命 × 5%；不会额外叠加未公开的混沌基础触腕。'
        :'普通深海：当前 SKeyDB 未公开额外的混沌基础触腕公式，不自动附加。';
    }
    if(!aequorActive&&$('tentacleReadout')){
      $('tentacleReadout').innerHTML='当前队伍未选择 <b>深海 / 晦暝·深海</b> 界域，触腕相关输入已禁用，本次伤害不会生成或结算触腕事件。';
    }
  }
  function renderTriplet(){
    const rec=currentRecord();if(!rec)return;
    const stats=resolvedStats(),realm=window.MorimensRealmEngine?.state?.()||{};
    if($('combatCon'))$('combatCon').textContent=fmt(stats.CON);
    if($('combatAtk'))$('combatAtk').textContent=fmt((Number(stats.ATK)||0)*(Number(realm.atkMultiplier)||1));
    if($('combatDef'))$('combatDef').textContent=fmt((Number(stats.DEF)||0)*(Number(realm.defMultiplier)||1));
  }

  function ragingWheelMasteryBonusPct(){
    if($('tentacleStance')?.value!=='raging')return 0;
    const engine=window.MorimensFormulaEngine;
    const wheels=window.MorimensBuildData?.currentWheels||[];
    let total=0;
    wheels.forEach((wheel,slot)=>{
      if(!wheel||!engine)return;
      const text=String(wheel.descriptionTemplate||'');
      const match=text.match(/(?:Upon|After)\s+switching\s+to\s+(?:the\s+)?\{?Raging Waves\}?\s+stance[^.]*?(?:gain|gains)\s+(?:Temp\.|Temporary)\s+Realm Mastery\s+equal to\s+\[([^\]]+)\]%?\s+of\s+current Realm Mastery/i);
      if(!match)return;
      const raw=String(match[1]);
      const key=raw.includes(':')?raw.split(':').pop():raw;
      const physical=Math.max(0,Math.min(15,Math.floor(n(`fateLevel${slot+1}`,0))));
      const tier=Math.min(3,physical),rank=Math.min(4,physical+1);
      const value=engine.resolveArg?.(wheel.descriptionArgs?.[key],rank,{wheelRefinementLevel:tier});
      if(Number.isFinite(Number(value)))total+=Number(value);
    });
    return Math.max(0,total);
  }

  function tentacleState(){
    const engine=window.MorimensFormulaEngine,realm=window.MorimensRealmEngine?.state?.()||{};
    const baseRealmMastery=Math.max(0,n('realmMastery'));
    if(!aequorRealmSelected(realm))return {available:false,base:0,coexistenceBase:0,stanceMult:1,masteryMult:1,masteryEffectMultiplier:1,extraMult:1,attack:0,ragingTriggerPct:0,turnEndAllowed:false,baseRealmMastery,ragingWheelBonusPct:0,realmMasteryForStance:baseRealmMastery};
    if(!engine)return {available:true,base:0,stanceMult:1,masteryMult:1,masteryEffectMultiplier:1,extraMult:1,attack:0,ragingTriggerPct:50,turnEndAllowed:true,baseRealmMastery,ragingWheelBonusPct:0,realmMasteryForStance:baseRealmMastery};
    const ragingWheelBonusPct=ragingWheelMasteryBonusPct();
    const realmMasteryForStance=baseRealmMastery*(1+ragingWheelBonusPct/100);
    return {
      ...engine.resolveTentacle({
        mode:effectiveTentacleMode(),
        stance:$('tentacleStance')?.value||'surging',
        currentTentacle:n('currentTentacleDamage'),
        teamMaxHp:n('teamMaxHp'),
        realmMastery:realmMasteryForStance,
        masteryEffectMultiplier:realm.tentacleMasteryMultiplier||1,
        extraBaseMaxHpPct:realm.aequorChaosBaseTentacleBonusPct||0,
        extraBonusPct:n('tentacleExtraBonus')
      }),
      baseRealmMastery,ragingWheelBonusPct,realmMasteryForStance
    };
  }

  function renderFormulaSource(){
    const box=$('tentacleFormulaSource');if(!box)return;
    box.innerHTML=`
      <div class="formulaRow"><b>角色主属性</b><br><code>向上取整((基础成长值 + 角色等级 + 内在灵格提供的基础属性等级) × 属性成长率)</code><br>随后再乘以灵塑提供的主属性百分比并向上取整。数据来源：<code>awakener-level-scaling.ts</code>。</div>
      <div class="formulaRow"><b>内在灵格</b><br>SKeyDB 的“内在灵格”天赋先把当前等级解析为“基础属性等级 +N”，然后同时作用于体质、攻击、防御三个主属性；不是简单把天赋说明里显示的属性数字直接相加。</div>
      <div class="formulaRow"><b>灵塑</b><br>灵塑适性第 N 级的第一个参数作为主属性百分比：<code>灵塑后主属性 = 向上取整(灵格后主属性 × (1 + 灵塑百分比 / 100))</code>。灵塑天赋仅在“星辰篇”关卡生效，因此页面提供独立启用开关。能明确解析为“伤害额外增加攻击力 X%”或“基础伤害 +X%”的专属效果也会自动计入；条件不明确的效果只展示，不擅自加入。</div>
      <div class="formulaRow"><b>界域精通参与技能参数</b><br><code>加算模式：基础值 + 界域精通 × 系数</code><br><code>按基础值缩放：基础值 × (1 + 界域精通 × 系数 / 100)</code><br>数据来源：<code>description-args.ts</code>。</div>
      <div class="formulaRow"><b>必定暴击战斗态</b><br>技能文本写明 “必定暴击” 时自动按必暴；跨卡/跨回合状态（例如已激活的“伤害始终暴击”灵知觉醒）不会被凭空假设，可通过“本次可暴击伤害强制暴击”显式开启。</div><div class="formulaRow"><b>基础伤害、力量与触腕</b><br><code>基础伤害 = 属性 × 技能倍率 × (1 + 基础伤害加成)</code>，随后再加入该伤害事件明确拥有的力量与触腕伤害附加项；基础伤害加成不再错误放大力量/触腕附加值。每 1 点力量使普通主动伤害 +1；技能若明确写 2×/5× 或额外力量加成，则按该事件自己的力量倍率计算。触腕本体享受 50% 力量。</div>
      <div class="formulaRow"><b>普通深海触腕姿态</b><br>潮涌 = 100%；静海 = 50%；怒涛 = 125%。怒涛在每次主动伤害后的触腕倍率：<code>50% + floor(有效最终界域精通 / 50) × 1%</code>；先计入当前命轮中“切换怒涛后获得当前界域精通 X% 的临时界域精通”，再应用至纯深海/混沌共生的界域精通效果倍率。</div>
      <div class="formulaRow"><b>晦暝·深海</b><br><code>基础触腕伤害 = 队伍最大生命 × 5%</code>；团队伤害强效 +50%，纯深海/混沌 +100%。深渊静海不进行回合末触腕攻击。深渊怒涛在 对应「无光之底」天赋记录中明确为 <code>125%</code>；其界域精通部分为 <code>1 + 界域精通 × 0.025% × 纯队倍率</code>。</div>
      <div class="formulaRow"><b>原初混沌精通</b><br>原初混沌本体提供全队攻击/防御 +10% 与团队伤害强效 +50%（纯混沌 +100%）。精通仅继续缩放造物：进攻类效果（包含触腕伤害）<code>向上取整(基础效果 × (1 + 界域精通 × 0.1% × 纯混沌倍率))</code>，纯混沌时倍率翻倍。</div>
      <div class="formulaRow"><b>伤害事件与状态范围</b><br><b>主动伤害 / 触腕伤害：</b>受易伤与虚弱影响。<b>穿透伤害：</b>同时削减护盾与生命、不可免疫并无视屏障，但不受易伤/虚弱影响。<b>纯粹伤害：</b>不能暴击，且不视为对应唤醒体造成的伤害，因此不会触发该角色的“造成伤害时”附加效果。<b>固定伤害：</b>不能暴击、不属于基础伤害，不受最终伤害或类似加成影响。侵蚀/旧日余烬对主动/触腕按伤害等量消费，对其他伤害按 50% 消费。</div><div class="formulaRow"><b>敌人等级通用模型</b><br>SKeyDB D-Zone 没有公开统一敌方防御常数，因此不采用手工防御/K 模型。估算最大生命使用 D-Zone 60–69 期 1665 个等级/生命值样本的对数拟合；普通伤害的等级系数使用 SKeyDB 关卡成长曲线做相对等级归一化，明确属于通用比较模型而非官方防御公式。</div><div class="formulaRow"><b>敌方献祭 / 诞生仪式</b><br>敌方献祭在回合末造成伤害并进入对敌事件链；诞生仪式会把对应伤害转化为敌方献祭。这里只保留会改变对敌伤害的献祭相关计算。</div><div class="formulaRow"><b>纯粹伤害 / 中毒 / 出血 / 反击</b><br>SKeyDB：纯粹伤害不能暴击；中毒回合末造成等于层数的纯粹伤害；出血回合末造成等于层数的纯粹伤害并随后移除；反击触发时造成等于反击层数的纯粹伤害。这些状态伤害不套通用等级系数，仍受明确的加固承伤修正。</div><div class="formulaRow"><b>普通深海基础触腕说明</b><br>SKeyDB 当前没有给普通深海统一初始触腕生成式，因此普通基础值仍由游戏内当前显示值输入。当前公开记录没有足够依据把“每名混沌额外增加队伍最大生命百分比”自动加入基础触腕；晦暝·深海则严格使用队伍最大生命 ×5%。</div>
    `;
  }

  function soulforgeDamageToSacrificePct(progression){
    if(!progression?.soulforgeEnabled||!progression?.soulforgeTalent||!(progression.soulforgeLevel>0))return 0;
    const talent=progression.soulforgeTalent,text=String(talent.descriptionTemplate||'');
    const match=text.match(/inflict\s+\{Sacrifice\}\s+stacks\s+equal\s+to\s+\[([^\]]+)\]%\s+of\s+DMG\s+dealt/i);
    if(!match)return 0;
    const raw=String(match[1]),key=raw.includes(':')?raw.split(':').pop():raw;
    const value=window.MorimensFormulaEngine?.resolveArg?.(talent.descriptionArgs?.[key],progression.soulforgeLevel,{});
    return Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
  }

  function selectedSkillBirthRitualStacks(progression){
    const sync=window.MorimensSkillSync||{},skill=sync.skill||{};
    const text=String(skill.descriptionTemplate||'');
    const patterns=[
      /Inflict\s+\+?(\d+(?:\.\d+)?)\s+stacks?\s+of\s+\{Birth Ritual\}/i,
      /Inflict\s+\[([^\]]+)\]\s+\{plural:[^}]*\|stack\|stacks\}\s+of\s+\{Birth Ritual\}/i
    ];
    for(const re of patterns){
      const m=text.match(re);if(!m)continue;
      if(m[1]!==undefined&&/^\d/.test(String(m[1]))&&re===patterns[0])return Math.max(0,Number(m[1])||0);
      const raw=m[1];if(raw!==undefined){
        const key=String(raw).includes(':')?String(raw).split(':').pop():String(raw);
        const value=window.MorimensFormulaEngine?.resolveArg?.(skill.descriptionArgs?.[key],sync.level||1,sync.context||{});
        if(Number.isFinite(Number(value))){
          let result=Math.max(0,Number(value));
          if(skill.id==='skill.murphy-fauxborn.princess-of-delusions'){
            const lifeSeal=Math.max(0,Math.min(5,Number(sync.resources?.lifeSealStacks)||0));
            if(lifeSeal>0){
              const soulforgeOn=progression?.soulforgeEnabled===true&&Number(progression?.soulforgeLevel)>0;
              const perStackPct=soulforgeOn?40:20;
              result*=1+lifeSeal*perStackPct/100;
            }
          }
          return result;
        }
      }
    }
    return 0;
  }

  function calculate(){
    if(!$('combatModel')||!$('resultNumber'))return;
    renderTriplet();
    const realm=window.MorimensRealmEngine?.state?.()||{
      atkMultiplier:1,defMultiplier:1,teamDamageAmp:0,finalDamageBonus:0,
      propagationFiestaStacks:0,propagationApplies:false,label:'普通界域'
    };
    const engine=window.MorimensFormulaEngine;
    const stats=resolvedStats();
    const attackRaw=Math.max(0,n('attack'));
    const attack=attackRaw*Math.max(0,Number(realm.atkMultiplier)||1);
    const effectiveDef=Math.max(0,Number(stats.DEF)||0)*Math.max(0,Number(realm.defMultiplier)||1);
    const effectiveCon=Math.max(0,Number(stats.CON)||0);
    const sequenceRepeat=Math.max(1,Math.floor(n('hitCount',1)));
    const enemyProfile=engine?.genericEnemyProfile?.(n('enemyLevel',77),currentLevel())||{
      level:Math.max(1,Math.round(n('enemyLevel',77))),
      estimatedMaxHp:100000,
      levelFactor:1,
      source:{hpFit:'fallback',levelFactor:'fallback'}
    };
    const enemyMaxHpInput=Math.max(0,n('enemyMaxHpOverride',0));
    const enemyMaxHp=enemyMaxHpInput>0?enemyMaxHpInput:Math.max(1,Number(enemyProfile.estimatedMaxHp)||1);
    const enemyMaxHpSource=enemyMaxHpInput>0?'手动输入':'融灾等级样本拟合';
    const levelFactor=Math.max(0,Number(enemyProfile.levelFactor)||1);
  
    let strength=n('strength');
    strength+=Math.max(0,Number(window.MorimensGearEffects?.signatureStrengthFlat)||0);
    const bruteStacks=checkedStackCount('buffBrute','buffBruteStacks');
    const burstStacks=checkedStackCount('buffBurst','buffBurstStacks');
    if(bruteStacks>0)strength+=8*bruteStacks;
    if(burstStacks>0)strength+=66*burstStacks;
    const strengthDown=Math.max(0,n('strengthDown'));
    const netStrength=strength-strengthDown;
  
    const tentacle=tentacleState();
    const tentacleWithStrength=tentacle.available===false?0:Math.max(0,tentacle.attack+netStrength*0.5);
    const skillSync=window.MorimensSkillSync||{};
    const progression=window.MorimensProgressionSync||window.MorimensCharacterSync?.progression||{};
    const sourceSkillEvents=Array.isArray(skillSync.damageEvents)
      ?skillSync.damageEvents
      :[{id:'active-legacy',index:0,type:'active',source:'legacy',coefficient:Math.max(0,n('skillCoef')),stat:'ATK',hit:1,hitCount:1,activeSource:true}];
    const skillTentacleCoef=Math.max(0,Number(skillSync.tentacleCoefficient)||0)/100;
    const skillTriggerPct=skillSync.triggeredTentaclePercent===null||skillSync.triggeredTentaclePercent===undefined
      ?0:Math.max(0,Number(skillSync.triggeredTentaclePercent))/100;
    const propagationTentacleEffectMult=realm.propagationApplies
      ?1+Math.max(0,Number(realm.propagationFiestaStacks)||0)/100:1;
    const realmDamageOutputMult=Math.max(0,Number(realm.damageOutputMultiplier)||1);
    const realmStatusOutputMult=Math.max(0,Number(realm.statusOutputMultiplier)||1);
    const fixedStatusEffectMult=1+Math.max(0,Number(realm.fixedPoisonCounterBonusPct)||0)/100;
    const gearEffects=window.MorimensGearEffects||{};
    const poisonInflictionMult=1+Math.max(0,Number(gearEffects.poisonInflictionPct)||0)/100;
    const fixedPoisonInflictionMult=1+Math.max(0,Number(gearEffects.fixedPoisonInflictionPct)||0)/100;
    const poisonTriggerMult=1+Math.max(0,Number(gearEffects.poisonTriggerPct)||0)/100;
    const counterGenerationMult=1+Math.max(0,Number(gearEffects.counterGenerationPct)||0)/100;
    const soulforgeFlat=progression.soulforgeEnabled
      ?attack*Math.max(0,Number(progression.flatAtkDamagePct)||0)/100:0;
    const soulforgeBasePct=progression.soulforgeEnabled
      ?Math.max(0,Number(progression.baseDamagePct)||0):0;
  
    const basePct=n('baseBonus')+soulforgeBasePct;
    const characterDamageAmpBonusPct=Math.max(0,Number(skillSync.characterDamageAmpBonusPct)||0);
    const powerPct=n('powerBonus')+Math.max(0,Number(realm.teamDamageAmp)||0)+characterDamageAmpBonusPct;
    const vulnerableStacks=vulnerableStackCount();
    const vulnerabilityPct=n('vulnerability')+(vulnerableStacks>0?50:0);
    const weakStacks=checkedStackCount('buffWeak','buffWeakStacks');
    const weakCoef=weakStacks>0?.75:1;
    const finalPct=n('finalBonus')+Math.max(0,Number(realm.finalDamageBonus)||0);
    const fortifyCoef=clamp(1-Math.max(0,n('fortressStacks'))/100,0,1);
    const other=Math.max(0,n('otherMultiplier',1));
    const activeCritRate=clamp(n('critRate')/100,0,1);
    const activeCritMult=Math.max(0,n('critDamage',150))/100;
    const tentacleCritRate=clamp(n('tentacleCritRate')/100,0,1);
    const tentacleCritMult=Math.max(0,n('tentacleCritDamage',150))/100;
    const mode=document.querySelector('.modeBtn[aria-pressed="true"]')?.dataset?.mode||'expected';
  
    function selectCrit(normal,rate,mult,forceCrit=false){
      const crit=normal*mult,expected=normal*(1-rate)+crit*rate;
      return {normal,crit,expected,forcedCrit:forceCrit===true,damage:forceCrit?crit:({normal,crit,expected}[mode]??expected)};
    }
    function statValue(stat){
      if(stat==='DEF')return effectiveDef;
      if(stat==='CON')return effectiveCon;
      return attack;
    }
    function statLabel(stat){
      const labels={ATK:'攻击力',CON:'体质',DEF:'防御力',RealmMastery:'界域精通',CritRate:'暴击率',CritDamage:'暴击伤害',DamageAmplification:'伤害强效'};
      return labels[String(stat||'')]||String(stat||'数值');
    }
    function scaledEvent(source,repeatIndex,eventIndex){
      const type=source.type==='pierce'?'pierce':'active';
      const coeff=Math.max(0,Number(source.coefficient)||0)/100;
      const strengthMultiplier=Number.isFinite(Number(source.strengthMultiplier))
        ?Math.max(0,Number(source.strengthMultiplier))
        :(type==='active'?1:(source.usesStrength===true?1:0));
      const strengthPart=netStrength*strengthMultiplier;
      const sourceTentacleCoef=Number.isFinite(Number(source.tentacleBonusCoefficient))
        ?Math.max(0,Number(source.tentacleBonusCoefficient))/100
        :skillTentacleCoef;
      const sourceCounterCoef=Math.max(0,Number(source.counterBonusCoefficient)||0)/100;
      const baseRaw=statValue(source.stat)*coeff;
      // SKeyDB distinguishes Base DMG from STR and Tentacle-DMG additions.
      // Therefore Base-DMG bonuses scale only the coefficient-derived base component.
      const skillBasePct=Math.max(0,Number(source.skillBaseDamageBonusPct)||0);
      const afterBase=baseRaw*(1+(basePct+skillBasePct)/100);
      const tentacleContribution=tentacleWithStrength*sourceTentacleCoef*propagationTentacleEffectMult;
      const counterContribution=counterCurrent*sourceCounterCoef;
      const resourceFlatDamage=Math.max(0,Number(source.resourceFlatDamage)||0);
      const resourceFlatDamageAmpBonusPct=Math.max(0,Number(source.resourceFlatDamageAmpBonusPct)||0);
      const raw=afterBase+strengthPart+tentacleContribution+counterContribution+soulforgeFlat;
      // Some character mechanics add a flat amount directly to this Active/Pierce event
      // (e.g. Lily's Endure). Keep that component separate so its dedicated Damage
      // Amplification modifier can apply without incorrectly scaling the skill's base component.
      const afterPower=raw*(1+powerPct/100)+resourceFlatDamage*(1+(powerPct+resourceFlatDamageAmpBonusPct)/100);
      // SKeyDB Vulnerable / Weakness explicitly affect Active DMG and Tentacle DMG, not Pierce/Pure/Fixed.
      const afterVulnerability=type==='active'?afterPower*(1+vulnerabilityPct/100):afterPower;
      const skillFinalPct=Math.max(0,Number(source.skillFinalDamageBonusPct)||0);
      const afterFinal=afterVulnerability*(1+(finalPct+skillFinalPct)/100)*(type==='active'?weakCoef:1);
      const resourceDamageMultiplier=Number.isFinite(Number(source.resourceDamageMultiplier))?Math.max(0,Number(source.resourceDamageMultiplier)):1;
      const normal=afterFinal*levelFactor*fortifyCoef*other*realmDamageOutputMult*resourceDamageMultiplier;
      const forceCrit=source.guaranteedCrit===true||$('forceCritAll')?.checked===true;
      const eventCritRate=clamp((forceCrit?1:activeCritRate)+Math.max(0,Number(source.critRateBonus)||0)/100,0,1);
      const baseEventCritMult=Math.max(0,activeCritMult+Math.max(0,Number(source.critDamageBonus)||0)/100);
      const eventCritMult=source.doubleCritDamageBonus===true?1+2*Math.max(0,baseEventCritMult-1):baseEventCritMult;
      const critState=selectCrit(normal,eventCritRate,eventCritMult,forceCrit);
      return {
        id:`skill-${repeatIndex+1}-${eventIndex+1}`,
        type,
        source:'skill',
        groupId:source.groupId||null,
        repeatIndex,
        label:(type==='pierce'?`穿透伤害 ${eventIndex+1}`:`主动伤害 ${eventIndex+1}`)+(forceCrit?' · 必定暴击':'')+(source.critRateBonus?` · 暴击率+${Number(source.critRateBonus).toFixed(1)}%`:'')+(source.critDamageBonus?` · 暴伤+${Number(source.critDamageBonus).toFixed(1)}%`:'')+(source.doubleCritDamageBonus?' · 残骸效果已启用':'')+(source.counterBonusCoefficient?` · 反击加成 ${Number(source.counterBonusCoefficient).toFixed(1)}%`:'') ,
        coefficient:Number(source.coefficient)||0,
        stat:source.stat||'ATK',
        strengthMultiplier,
        tentacleBonusCoefficient:sourceTentacleCoef*100,
        skillBaseDamageBonusPct:skillBasePct,
        skillFinalDamageBonusPct:skillFinalPct,
        resourceDamageMultiplier,
        counterBonusCoefficient:sourceCounterCoef*100,
        counterContribution,
        resourceFlatDamage,
        resourceFlatDamageAmpBonusPct,
        critRateBonus:Number(source.critRateBonus)||0,
        critDamageBonus:Number(source.critDamageBonus)||0,
        eventCritRate,
        eventCritMult,
        baseRaw,
        afterBase,
        strengthPart,
        tentacleContribution,
        raw,
        ignoresBarrier:type==='pierce',
        activeSource:true,
        ...critState
      };
    }
    function tentacleEvent(percent,label,id){
      const scale=Math.max(0,Number(percent)||0)/100;
      const raw=tentacleWithStrength*scale;
      const normal=raw*(1+powerPct/100)*(1+vulnerabilityPct/100)*weakCoef*levelFactor*fortifyCoef*other*realmDamageOutputMult;
      const critState=selectCrit(normal,tentacleCritRate,tentacleCritMult);
      return {id,type:'tentacle',source:'tentacle',label,percent:Number(percent)||0,raw,activeSource:false,...critState};
    }
    function tentaclePierceEvent(percent,label,id){
      const scale=Math.max(0,Number(percent)||0)/100;
      const raw=tentacleWithStrength*scale;
      // This event is Pierce DMG even though its basis is Tentacle DMG, so Vulnerable/Weakness do not apply.
      const normal=raw*(1+powerPct/100)*levelFactor*fortifyCoef*other*realmDamageOutputMult;
      const critState=selectCrit(normal,tentacleCritRate,tentacleCritMult);
      return {id,type:'pierce',source:'tentacle',basis:'tentacle',label,percent:Number(percent)||0,raw,ignoresBarrier:true,activeSource:false,...critState};
    }
    function pureEvent(raw,label,id,type='pure',extra={}){
      const beforeFortress=Math.max(0,Number(raw)||0);
      const damage=beforeFortress*fortifyCoef*realmDamageOutputMult;
      return {
        id,type,source:'skill',label,raw:beforeFortress,
        normal:damage,crit:damage,expected:damage,damage,
        canCrit:false,pure:true,...extra
      };
    }
    function fixedEvent(source,id){
      let raw=0;
      if(source.basis==='tentacle')raw=tentacleWithStrength*Math.max(0,Number(source.percent)||0)/100;
      else if(source.basis==='statPercent')raw=statValue(source.stat)*Math.max(0,Number(source.percent)||0)/100;
      else if(source.basis==='flat')raw=Math.max(0,Number(source.amount)||0);
      const normalizeName=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,'');
      const scopedName=normalizeName(progression.scopedFixedDamageSkillName);
      const currentName=normalizeName(skillSync?.skill?.name);
      const scopedFixedPct=progression.soulforgeEnabled&&scopedName&&scopedName===currentName
        ?Math.max(0,Number(progression.scopedFixedDamagePct)||0):0;
      if(scopedFixedPct>0)raw*=1+scopedFixedPct/100;
      const fixedDamageMultiplier=Math.max(1,Number(source.fixedDamageMultiplier)||1);
      raw*=fixedDamageMultiplier;
      const damage=raw*fortifyCoef*realmDamageOutputMult;
      return {
        id,type:'fixed',source:'skill',label:'固定伤害'+(scopedFixedPct>0?` · 灵塑 +${scopedFixedPct.toFixed(2)}%`:''),basis:source.basis,
        percent:source.percent,amount:source.amount,stat:source.stat||null,scopedFixedDamagePct:scopedFixedPct,fixedDamageMultiplier,
        raw,normal:damage,crit:damage,expected:damage,damage,
        canCrit:false,fixed:true
      };
    }
    function enemySacrificeEvent(stacks,id='sacrifice-turn-end'){
      const raw=Math.max(0,Number(stacks)||0);
      const damage=raw*fortifyCoef;
      return {
        id,type:'sacrifice',source:'status',label:'献祭 · 回合末伤害',action:'turn_end',
        stacks:raw,raw,normal:damage,crit:damage,expected:damage,damage,canCrit:false
      };
    }
  
    const events=[];
    const groupDamage=new Map();
    const groupCritChance=new Map();
    const groupGuaranteedCrit=new Map();
    const initialCorrosion=Math.max(0,n('corrosionAmount'));
    let corrosionRemaining=initialCorrosion;
    let corrosionAdded=0;
    let embersRemaining=Math.max(0,n('embersAmount'));
    const corrosionLossMultiplier=Math.max(0,n('corrosionLossMultiplier',300))/100;
    let corrosionDamage=0,embersDamage=0;
    let poisonAdded=0,bleedAdded=0,counterAdded=0;
    const initialPoison=Math.max(0,n('currentPoison'));
    const initialBleed=Math.max(0,n('currentBleed'));
    let counterCurrent=Math.max(0,n('currentCounter'));
    const actorMaxHp=Math.max(0,n('actorMaxHp'));
    const actorCurrentHpInput=Math.max(0,n('actorCurrentHp',actorMaxHp));
    const actorCurrentHp=actorMaxHp>0?Math.min(actorMaxHp,actorCurrentHpInput):actorCurrentHpInput;
    const initialEnemySacrifice=Math.max(0,n('enemySacrificeAmount'));
    const initialBirthRitualStacks=clamp(Math.floor(n('birthRitualStacks')),0,75);
    const skillBirthRitualPerPlay=Math.max(0,selectedSkillBirthRitualStacks(progression));
    const finalBirthRitualStacks=clamp(initialBirthRitualStacks+skillBirthRitualPerPlay*sequenceRepeat,0,75);
    const averageBirthRitualStacksForSkill=sequenceRepeat>0
      ?clamp(initialBirthRitualStacks+skillBirthRitualPerPlay*(sequenceRepeat+1)/2,0,75)
      :initialBirthRitualStacks;
    const manualDamageToSacrificePct=Math.max(0,n('sacrificeOnDamagePct'));
    const soulforgeDamageToSacrifice=soulforgeDamageToSacrificePct(progression);

    function groupKey(repeatIndex,groupId){return `${repeatIndex}:${groupId||''}`}
    function pushDamageEvent(event){
      events.push(event);
      if(event.groupId&&event.damage>0){
        const key=groupKey(event.repeatIndex??0,event.groupId);
        groupDamage.set(key,(groupDamage.get(key)||0)+event.damage);
        if(event.type==='active'||event.type==='pierce'){
          const p=clamp(Number(event.eventCritRate)||0,0,1);
          const previous=groupCritChance.get(key)||0;
          groupCritChance.set(key,1-(1-previous)*(1-p));
          if(event.forcedCrit===true||p>=1)groupGuaranteedCrit.set(key,true);
        }
      }
      if(!(event.damage>0)||event.type==='reaction')return;
      const removalRate=(event.type==='active'||event.type==='tentacle')?1:0.5;
      const corrosionUsed=Math.min(corrosionRemaining,event.damage*removalRate);
      if(corrosionUsed>0){
        corrosionRemaining-=corrosionUsed;
        const reaction={id:event.id+'-corrosion',type:'reaction',reaction:'corrosion',sourceEventId:event.id,label:`侵蚀追加生命损失（${removalRate===1?'等量':'其他伤害 50%'}消费，×${(corrosionLossMultiplier*100).toFixed(0)}%）`,consumed:corrosionUsed,damage:corrosionUsed*corrosionLossMultiplier};
        corrosionDamage+=reaction.damage;events.push(reaction);
      }
      const embersUsed=Math.min(embersRemaining,event.damage*removalRate);
      if(embersUsed>0){
        embersRemaining-=embersUsed;
        const reaction={id:event.id+'-embers',type:'reaction',reaction:'embers',sourceEventId:event.id,label:`旧日余烬追加生命损失（${removalRate===1?'等量':'其他伤害 50%'}消费）`,consumed:embersUsed,damage:embersUsed*3};
        embersDamage+=reaction.damage;events.push(reaction);
      }
    }

    function appliedStatusAmount(source,repeat){
      let amount=0;
      if(source.basis==='sourceDamage'){
        const damage=groupDamage.get(groupKey(repeat,source.sourceGroupId))||0;
        amount=damage*Math.max(0,Number(source.percent)||0)/100;
      }else if(source.basis==='statPercent'){
        amount=statValue(source.stat)*Math.max(0,Number(source.percent)||0)/100;
      }else if(source.basis==='flat'){
        amount=Math.max(0,Number(source.amount)||0);
      }else if(source.basis==='targetMaxHpPercent'){
        amount=enemyMaxHp*Math.max(0,Number(source.percent)||0)/100;
      }
      const statusTentacleCoef=Math.max(0,Number(source.tentacleBonusCoefficient)||0)/100;
      if(statusTentacleCoef>0)amount+=tentacleWithStrength*statusTentacleCoef*propagationTentacleEffectMult;
      // Propagation Fiesta / Singularity Beacon enhance Fixed Poison and Fixed Counter,
      // but not effects defined as a percentage of damage already dealt.
      if((source.type==='poison'||source.type==='counter')&&source.basis!=='sourceDamage')amount*=fixedStatusEffectMult;
      // Normal Ultra Round explicitly reduces generated Poison / Counter / Bleed by 25%.
      if(source.type==='poison'||source.type==='counter'||source.type==='bleed')amount*=realmStatusOutputMult;
      if(source.type==='poison'&&source.action==='apply'){amount*=poisonInflictionMult;if(source.basis==='flat'||source.basis==='statPercent'||source.basis==='targetMaxHpPercent')amount*=fixedPoisonInflictionMult}
      if(source.type==='counter'&&source.action==='gain')amount*=counterGenerationMult;
      if(Number.isFinite(Number(source.resourceStatusMultiplier)))amount*=Math.max(0,Number(source.resourceStatusMultiplier));
      return Math.max(0,amount);
    }

    const includeTurnEndSettlement=$('includeTurnEndSettlement')?.checked!==false;
    let scaledIndex=0,tentacleIndex=0,pureIndex=0,poisonIndex=0,bleedIndex=0,corrosionIndex=0,counterIndex=0;
    function applyCharacterResourceAfterDamage(event,source){
      // SKeyDB Pure DMG is not considered damage dealt by the corresponding Awakener,
      // so "when this Awakener deals damage" attachments (e.g. Sin Mark Bleed) do not trigger from it.
      if(event?.type==='pure')return;
      const bleedPct=Math.max(0,Number(source?.onDamageBleedPct)||0);
      if(!(event?.damage>0)||bleedPct<=0)return;
      const amount=event.damage*bleedPct/100*realmStatusOutputMult;
      bleedAdded+=amount;
      events.push({id:`resource-bleed-${++bleedIndex}`,type:'bleed',action:'apply',source:'resource',label:`罪印附加出血 ${bleedPct.toFixed(0)}%`,amount,damage:0,sourceEventId:event.id,percent:bleedPct});
    }
    for(let repeat=0;repeat<sequenceRepeat;repeat++){
      for(const source of sourceSkillEvents){
        if(source.turnUnique===true&&repeat>0)continue;
        if(source.turnEndOnly===true&&!includeTurnEndSettlement)continue;
        if(source.type==='pierce'&&source.basis==='tentacle'){
          if(tentacle.available===false)continue;
          const count=Math.max(0,Math.floor(n('tentacleCount',1)))*Math.max(1,Math.floor(Number(source.attacksPerTentacle)||1));
          for(let i=0;i<count;i++){
            const event=tentaclePierceEvent(source.percent,`触腕穿透伤害 ${i+1}`,`tentacle-pierce-${++tentacleIndex}`);
            event.repeatIndex=repeat;
            pushDamageEvent(event);
          }
          continue;
        }
        if(source.type==='active'||source.type==='pierce'){
          const event=scaledEvent(source,repeat,scaledIndex++);
          pushDamageEvent(event);
          applyCharacterResourceAfterDamage(event,source);
          if(tentacle.available!==false&&event.type==='active'&&$('tentacleStance')?.value==='raging'&&event.damage>0){
            pushDamageEvent(tentacleEvent(tentacle.ragingTriggerPct,'怒涛 · 主动伤害后触腕',`raging-${++tentacleIndex}`));
          }
          continue;
        }
        if(source.type==='fixed'){
          const event=fixedEvent(source,`fixed-${++pureIndex}`);pushDamageEvent(event);applyCharacterResourceAfterDamage(event,source);
          continue;
        }
        if(source.type==='pure'){
          const pct=Math.max(0,Number(source.percent)||0);
          let raw=source.basis==='targetMaxHp'
            ?enemyMaxHp*pct/100
            :source.basis==='actorCurrentHp'
              ?actorCurrentHp*pct/100
              :0;
          const minPct=Math.max(0,Number(source.minActorMaxHpPercent)||0);
          const minimum=actorMaxHp>0&&minPct>0?actorMaxHp*minPct/100:0;
          if(minimum>0)raw=Math.max(raw,minimum);
          const basisLabel=source.basis==='actorCurrentHp'?'角色当前生命':'目标最大生命';
          const floorLabel=minPct>0?` · 最低为角色最大生命 ${minPct.toFixed(2)}%`:'';
          const event=pureEvent(raw,`纯粹伤害 · ${basisLabel} ${pct.toFixed(2)}%${floorLabel}`,`pure-${++pureIndex}`,'pure',{basis:source.basis,percent:source.percent,minActorMaxHpPercent:minPct,minimum});pushDamageEvent(event);applyCharacterResourceAfterDamage(event,source);
          continue;
        }
        if(source.type==='poison'&&source.action==='apply'){
          const amount=appliedStatusAmount(source,repeat);
          poisonAdded+=amount;
          events.push({
            id:`poison-apply-${++poisonIndex}`,type:'poison',action:'apply',
            label:source.basis==='sourceDamage'
              ?`中毒施加 · 来源伤害 ${Number(source.percent||0).toFixed(2)}%`
              :`中毒施加 · ${source.stat?statLabel(source.stat)+' × '+Number(source.percent||0).toFixed(2)+'%':fmt(amount)}`,
            amount,damage:0,sourceGroupId:source.sourceGroupId||null
          });
          continue;
        }
        if(source.type==='poison'&&source.action==='trigger'){
          const stacks=initialPoison+poisonAdded;
          const basePercent=Math.max(0,Number(source.percent)||0);
          const critPercent=Number.isFinite(Number(source.critPercent))?Math.max(0,Number(source.critPercent)):basePercent;
          const key=groupKey(repeat,source.sourceGroupId);
          const critChance=source.sourceGroupId?(groupCritChance.get(key)||0):activeCritRate;
          const guaranteed=source.sourceGroupId?groupGuaranteedCrit.get(key)===true:false;
          let effectivePercent=basePercent;
          if(guaranteed||mode==='crit')effectivePercent=critPercent;
          else if(mode==='expected')effectivePercent=basePercent+(critPercent-basePercent)*critChance;
          effectivePercent*=poisonTriggerMult;
          const raw=stacks*effectivePercent/100;
          const label=critPercent!==basePercent
            ?`中毒触发 ${effectivePercent.toFixed(2)}%（基础 ${basePercent.toFixed(2)}% / 暴击 ${critPercent.toFixed(2)}%）`
            :`中毒触发 ${basePercent.toFixed(2)}%`;
          pushDamageEvent(pureEvent(raw,label,`poison-trigger-${++poisonIndex}`,'poison',{action:'trigger',stacks,percent:effectivePercent,basePercent,critPercent,critChance}));
          continue;
        }
        if(source.type==='corrosion'&&source.action==='apply'){
          const amount=appliedStatusAmount(source,repeat);
          corrosionRemaining+=amount;
          corrosionAdded+=amount;
          events.push({
            id:`corrosion-apply-${++corrosionIndex}`,type:'corrosion',action:'apply',
            label:source.basis==='sourceDamage'
              ?`侵蚀施加 · 来源伤害 ${Number(source.percent||0).toFixed(2)}%`
              :source.basis==='targetMaxHpPercent'
                ?`侵蚀施加 · 目标最大生命 ${Number(source.percent||0).toFixed(2)}%`
                :`侵蚀施加 · ${source.stat?statLabel(source.stat)+' × '+Number(source.percent||0).toFixed(2)+'%':fmt(amount)}`,
            amount,damage:0,sourceGroupId:source.sourceGroupId||null
          });
          continue;
        }
        if(source.type==='bleed'&&source.action==='apply'){
          const amount=appliedStatusAmount(source,repeat);
          bleedAdded+=amount;
          events.push({
            id:`bleed-apply-${++bleedIndex}`,type:'bleed',action:'apply',
            label:source.basis==='sourceDamage'
              ?`出血施加 · 来源伤害 ${Number(source.percent||0).toFixed(2)}%`
              :`出血施加 · ${source.stat?statLabel(source.stat)+' × '+Number(source.percent||0).toFixed(2)+'%':fmt(amount)}`,
            amount,damage:0,sourceGroupId:source.sourceGroupId||null
          });
          continue;
        }
        if(source.type==='bleed'&&source.action==='trigger'){
          const stacks=initialBleed+bleedAdded;
          const raw=stacks*Math.max(0,Number(source.percent)||0)/100;
          pushDamageEvent(pureEvent(raw,`出血触发 ${Number(source.percent||0).toFixed(2)}%`,`bleed-trigger-${++bleedIndex}`,'bleed',{action:'trigger',stacks,percent:source.percent}));
          continue;
        }
        if(source.type==='counter'&&source.action==='gain'){
          const amount=appliedStatusAmount(source,repeat);
          counterCurrent+=amount;counterAdded+=amount;
          events.push({
            id:`counter-gain-${++counterIndex}`,type:'counter',action:'gain',
            label:`反击获得 +${fmt(amount)}`,amount,damage:0
          });
          continue;
        }
        if(source.type==='counter'&&source.action==='trigger'){
          const raw=counterCurrent*Math.max(0,Number(source.percent)||0)/100;
          pushDamageEvent(pureEvent(raw,`反击触发 ${Number(source.percent||0).toFixed(2)}%`,`counter-trigger-${++counterIndex}`,'counter',{action:'trigger',stacks:counterCurrent,percent:source.percent}));
        }
      }
      if(skillTriggerPct>0&&tentacle.available!==false){
        pushDamageEvent(tentacleEvent(skillTriggerPct*100,'技能触发触腕',`skill-tentacle-${++tentacleIndex}`));
      }
    }

    const includeTurnEnd=includeTurnEndSettlement&&tentacle.available!==false&&$('includeTurnEndTentacle')?.checked===true&&tentacle.turnEndAllowed!==false;
    const turnEndCount=Math.max(0,Math.floor(n('tentacleCount',1)))*Math.max(0,Math.floor(n('tentacleAttackTimes',1)));
    if(includeTurnEnd){
      for(let i=0;i<turnEndCount;i++)pushDamageEvent(tentacleEvent(100,`回合末触腕 ${i+1}`,`turn-end-${++tentacleIndex}`));
    }
  
    if(includeTurnEndSettlement&&$('includePoisonTurnEnd')?.checked===true&&(initialPoison+poisonAdded)>0){
      const stacks=initialPoison+poisonAdded;
      pushDamageEvent(pureEvent(stacks,'中毒 · 回合末纯粹伤害',`poison-turn-end-${++poisonIndex}`,'poison',{action:'turn_end',stacks}));
    }
    const includeBleedTurnEnd=includeTurnEndSettlement&&$('includeBleedTurnEnd')?.checked===true;
    if(includeBleedTurnEnd&&(initialBleed+bleedAdded)>0){
      const stacks=initialBleed+bleedAdded;
      pushDamageEvent(pureEvent(stacks,'出血 · 回合末纯粹伤害（结算后移除）',`bleed-turn-end-${++bleedIndex}`,'bleed',{action:'turn_end',stacks,removedAfter:true}));
    }
    const sacrificeSourceDamage=events
      // "DMG dealt by Murphy: Fauxborn" is attributed to the Awakener herself.
      // Independent Tentacle attacks are not silently attributed to her; Birth Ritual handles Tentacle DMG explicitly.
      .filter(x=>['active','pierce','fixed'].includes(x.type)&&x.damage>0)
      .reduce((sum,x)=>sum+(Number(x.damage)||0),0);
    const birthRitualSkillDamage=events
      .filter(x=>(x.type==='active'||x.type==='tentacle')&&x.damage>0&&!String(x.id||'').startsWith('turn-end-'))
      .reduce((sum,x)=>sum+(Number(x.damage)||0),0);
    const birthRitualTurnEndTentacleDamage=events
      .filter(x=>x.type==='tentacle'&&x.damage>0&&String(x.id||'').startsWith('turn-end-'))
      .reduce((sum,x)=>sum+(Number(x.damage)||0),0);
    const damageToSacrificePct=manualDamageToSacrificePct+soulforgeDamageToSacrifice;
    const sacrificeFromDamage=sacrificeSourceDamage*damageToSacrificePct/100;
    const sacrificeFromBirthRitual=
      birthRitualSkillDamage*averageBirthRitualStacksForSkill/100+
      birthRitualTurnEndTentacleDamage*finalBirthRitualStacks/100;
    const enemySacrificeBeforeTurnEnd=initialEnemySacrifice+sacrificeFromDamage+sacrificeFromBirthRitual;
    const includeEnemySacrificeTurnEnd=includeTurnEndSettlement&&$('includeEnemySacrificeTurnEnd')?.checked!==false;
    if(includeEnemySacrificeTurnEnd&&enemySacrificeBeforeTurnEnd>0){
      pushDamageEvent(enemySacrificeEvent(enemySacrificeBeforeTurnEnd));
    }
    const enemySacrificeRemaining=includeEnemySacrificeTurnEnd?enemySacrificeBeforeTurnEnd*0.5:enemySacrificeBeforeTurnEnd;

    const turnEndProcessed=includeTurnEndSettlement;
    const corrosionBeforeTurnEndClear=corrosionRemaining;
    const embersBeforeTurnReset=embersRemaining;
    if(turnEndProcessed){
      corrosionRemaining=0;
      embersRemaining=0;
    }
  
    const activeEvents=events.filter(x=>x.type==='active');
    const pierceEvents=events.filter(x=>x.type==='pierce');
    const tentacleEvents=events.filter(x=>x.type==='tentacle');
    const pureEvents=events.filter(x=>x.type==='pure');
    const fixedEvents=events.filter(x=>x.type==='fixed');
    const poisonEvents=events.filter(x=>x.type==='poison'&&x.damage>0);
    const bleedEvents=events.filter(x=>x.type==='bleed'&&x.damage>0);
    const corrosionEvents=events.filter(x=>x.type==='corrosion');
    const counterEvents=events.filter(x=>x.type==='counter'&&x.damage>0);
    const sacrificeEvents=events.filter(x=>x.type==='sacrifice'&&x.damage>0);
    const crittableEvents=[...activeEvents,...pierceEvents];
    const activeNormal=crittableEvents.reduce((s,x)=>s+x.normal,0);
    const activeCrit=crittableEvents.reduce((s,x)=>s+x.crit,0);
    const activeExpected=crittableEvents.reduce((s,x)=>s+x.expected,0);
    const activeTotal=activeEvents.reduce((s,x)=>s+x.damage,0);
    const pierceTotal=pierceEvents.reduce((s,x)=>s+x.damage,0);
    const tentacleTotal=tentacleEvents.reduce((s,x)=>s+x.damage,0);
    const pureTotal=pureEvents.reduce((s,x)=>s+x.damage,0);
    const fixedTotal=fixedEvents.reduce((s,x)=>s+x.damage,0);
    const poisonTotal=poisonEvents.reduce((s,x)=>s+x.damage,0);
    const bleedTotal=bleedEvents.reduce((s,x)=>s+x.damage,0);
    const counterTotal=counterEvents.reduce((s,x)=>s+x.damage,0);
    const sacrificeTotal=sacrificeEvents.reduce((s,x)=>s+x.damage,0);
    const total=events.reduce((s,x)=>s+(Number(x.damage)||0),0);
    const projectedTurnEnd=tentacleEvent(100,'回合末触腕预览','preview').damage*turnEndCount;
  
    const label={normal:'非暴击',crit:'暴击',expected:'期望'}[mode];
    $('resultLabel').textContent=`${$('charSelect')?.selectedOptions?.[0]?.textContent||'角色'} · ${label}总伤害`;
    $('resultNumber').textContent=fmt(total);
    $('normalLine').textContent=`可暴击主动/穿透伤害的非暴击合计：${fmt(activeNormal)}`;
    $('critLine').textContent=`可暴击主动/穿透伤害的暴击合计：${fmt(activeCrit)}`;
    $('expectedLine').textContent=`可暴击主动/穿透伤害的期望合计：${fmt(activeExpected)}`;
  
    $('formula').textContent=`事件口径：主动 / 穿透 / 触腕伤害使用当前通用等级系数 ${levelFactor.toFixed(3)} 并经过加固；穿透伤害同时削减护盾与生命、不可免疫并无视屏障。目标易伤：${vulnerableStacks>0?'是（'+vulnerableStacks+' 层）':'否'}。标准易伤只判断有/无，主动/触腕承伤按 SKeyDB +50%，不会随层数重复叠加；填写的层数仅供明确读取易伤层数的个别角色/技能机制使用。虚弱：${weakStacks>0?weakStacks+' 层（当前伤害仍只应用一次 -25%）':'无'}。角色专属伤害强效：+${characterDamageAmpBonusPct.toFixed(1)}%。纯粹伤害不能暴击，且不视为对应唤醒体造成的伤害，因此不会触发该角色的“造成伤害时”附加效果；固定伤害不能暴击、不属于基础伤害，也不吃最终伤害或类似加成。当前界域输出系数 ×${realmDamageOutputMult.toFixed(3)}，状态生成系数 ×${realmStatusOutputMult.toFixed(3)}。侵蚀 / 旧日余烬：主动/触腕等量消费，其他伤害按 50% 消费；侵蚀移除生命损失默认 300%（可校准），回合末侵蚀清空、旧日余烬重置。结果模式“期望/暴击/非暴击”只改变可暴击事件，纯粹、固定和状态结算不随显示模式改变。`;
  
    const rows=events.map((event,index)=>{
      if(event.type==='reaction')return [`${index+1}. ${event.label}（消费 ${fmt(event.consumed)}）`,event.damage];
      if((event.type==='poison'||event.type==='bleed'||event.type==='corrosion'||event.type==='counter')&&(event.action==='apply'||event.action==='gain'))return [`${index+1}. ${event.label}`,0];
      const tags={active:'主动伤害',pierce:'穿透伤害',tentacle:'触腕伤害',pure:'纯粹伤害',fixed:'固定伤害',poison:'中毒',bleed:'出血',corrosion:'侵蚀',counter:'反击',sacrifice:'献祭'};
      const detail=`${tags[event.type]||event.type} · ${event.label||''}`;
      return [`${index+1}. ${detail}`,event.damage||0];
    });
    rows.unshift(['敌人估算最大生命',enemyMaxHp]);
    rows.unshift(['敌人等级通用承伤系数',levelFactor]);
    rows.unshift(['界域修正后攻击力',attack]);
    rows.push(['主动伤害合计',activeTotal]);
    rows.push(['穿透伤害合计',pierceTotal]);
    rows.push(['触腕伤害合计',tentacleTotal]);
    rows.push(['纯粹伤害合计',pureTotal]);
    rows.push(['固定伤害合计',fixedTotal]);
    rows.push(['中毒伤害合计',poisonTotal]);
    rows.push(['出血伤害合计',bleedTotal]);
    rows.push(['反击伤害合计',counterTotal]);
    rows.push(['敌方献祭回合末伤害',sacrificeTotal]);
    rows.push(['敌方初始献祭',initialEnemySacrifice]);
    rows.push(['伤害转化献祭比例',damageToSacrificePct]);
    if(soulforgeDamageToSacrifice>0)rows.push(['其中：灵塑自动伤害→献祭 %',soulforgeDamageToSacrifice]);
    if(manualDamageToSacrificePct>0)rows.push(['其中：手动持续状态伤害→献祭 %',manualDamageToSacrificePct]);
    if(initialBirthRitualStacks>0)rows.push(['敌方已有诞生仪式层数',initialBirthRitualStacks]);
    if(skillBirthRitualPerPlay>0)rows.push(['所选技能每次即时施加诞生仪式',skillBirthRitualPerPlay]);
    if(finalBirthRitualStacks>0)rows.push(['本次伤害序列后诞生仪式层数',finalBirthRitualStacks]);
    if(finalBirthRitualStacks>0)rows.push(['诞生仪式新增献祭',sacrificeFromBirthRitual]);
    if(damageToSacrificePct>0)rows.push(['伤害转化新增献祭',sacrificeFromDamage]);
    rows.push(['敌方回合末结算前献祭',enemySacrificeBeforeTurnEnd]);
    rows.push(['敌方最终献祭',enemySacrificeRemaining]);
    if(!includeTurnEnd&&turnEndCount>0)rows.push(['回合末触腕预览（未计入总伤害）',projectedTurnEnd]);
    rows.push(['本次新增侵蚀',corrosionAdded]);
    rows.push(['侵蚀追加生命损失合计',corrosionDamage]);
    rows.push(['旧日余烬追加生命损失合计',embersDamage]);
    if(turnEndProcessed&&corrosionBeforeTurnEndClear>0)rows.push(['侵蚀回合末清空前剩余',corrosionBeforeTurnEndClear]);
    if(turnEndProcessed&&embersBeforeTurnReset>0)rows.push(['旧日余烬回合重置前剩余',embersBeforeTurnReset]);
    rows.push(['侵蚀最终剩余',corrosionRemaining]);
    rows.push(['旧日余烬最终剩余',embersRemaining]);
    rows.push(['最终中毒层数',initialPoison+poisonAdded]);
    rows.push(['最终出血层数',includeBleedTurnEnd?0:initialBleed+bleedAdded]);
    rows.push(['本次新增反击',counterAdded]);
    rows.push(['最终反击',counterCurrent]);
    rows.push(['本次对敌合计',total]);
    const composition=[
      {kind:'active',label:'主动伤害',value:activeTotal},
      {kind:'pierce',label:'穿透伤害',value:pierceTotal},
      {kind:'tentacle',label:'触腕伤害',value:tentacleTotal},
      {kind:'pure',label:'纯粹伤害',value:pureTotal},
      {kind:'fixed',label:'固定伤害',value:fixedTotal},
      {kind:'poison',label:'中毒',value:poisonTotal},
      {kind:'bleed',label:'出血',value:bleedTotal},
      {kind:'counter',label:'反击',value:counterTotal},
      {kind:'sacrifice',label:'献祭',value:sacrificeTotal},
      {kind:'corrosion',label:'侵蚀追加生命损失',value:corrosionDamage},
      {kind:'embers',label:'旧日余烬追加生命损失',value:embersDamage}
    ];
    $('breakdown').innerHTML=damageCompositionHtml(composition,total)+rows.map(([a,b])=>`<div class="step"><span>${breakdownLabelHtml(a)}</span><strong>${typeof b==='number'&&Math.abs(b)<10&&a.includes('系数')?b.toFixed(3):fmt(b)}</strong></div>`).join('');
  
    const tmode=effectiveTentacleMode();
    const stance=tmode==='benthos'
      ?({surging:'潮涌 100%',tranquil:'静海（回合末不攻击）',raging:'怒涛 125%' }[$('tentacleStance')?.value]||'')
      :({surging:'潮涌 100%',tranquil:'静海 50%',raging:'怒涛 125%'}[$('tentacleStance')?.value]||'');
    const oneTentacle=tentacleEvent(100,'单次触腕预览','preview');
    if($('tentacleReadout')){
      if(tentacle.available===false){
        $('tentacleReadout').innerHTML='当前队伍未选择 <b>深海 / 晦暝·深海</b> 界域，触腕相关输入已禁用，本次伤害不会生成或结算触腕事件。';
      }else{
        const model=tmode==='benthos'?'晦暝·深海':'普通深海 / 普通触腕';
        const coexist=tentacle.coexistenceBase?`，混沌共生额外基础触腕 ${fmt(tentacle.coexistenceBase)}`:'';
        const pureNote=(realm.startingTentacleMultiplier||1)>1?'；至纯深海使初始触腕数翻倍（当前触腕数仍以手动输入为准）':'';
        $('tentacleReadout').innerHTML=`体系：<b>${model}</b> · 姿态：<b>${stance}</b> · 界域精通效果倍率 <b>×${Number(tentacle.masteryEffectMultiplier||1).toFixed(1)}</b>${tentacle.ragingWheelBonusPct?` · 怒涛命轮临时精通 <b>+${Number(tentacle.ragingWheelBonusPct).toFixed(1)}%</b>（${fmt(tentacle.baseRealmMastery)} → ${fmt(tentacle.realmMasteryForStance)}）`:''}<br>机制基础触腕 <b>${fmt(tentacle.base)}</b>${coexist} → 姿态/精通后 <b>${fmt(tentacle.attack)}</b> → 加入 50% 净力量后 <b>${fmt(tentacleWithStrength)}</b> → 当前模式单次伤害 <b>${fmt(oneTentacle.damage)}</b>。触腕暴击率 <b>${(tentacleCritRate*100).toFixed(1)}%</b> / 暴击伤害 <b>${(tentacleCritMult*100).toFixed(1)}%</b>${pureNote}。`;
      }
    }
    if($('enemyLevelReadout')){
      $('enemyLevelReadout').innerHTML=`敌人等级 <b>${enemyProfile.level}</b> · 通用承伤系数 <b>${levelFactor.toFixed(3)}</b> · 最大生命 <b>${fmt(enemyMaxHp)}</b>（${enemyMaxHpSource}）<br><small>${enemyMaxHpInput>0?'目标最大生命百分比效果使用手动值。':'默认最大生命由 SKeyDB 融灾第 60–69 期共 1665 个等级/生命值样本作对数拟合。'} 等级承伤系数不是官方防御公式。</small>`;
    }
    if($('combatConversion')){
      const enlightenLabel={OverExalt:'+4 超限',AbsoluteAxiom:'最终法则'}[skillSync.enlightenSlot]||skillSync.enlightenSlot||'E0';
      $('combatConversion').innerHTML=`界域：<b>${esc(realm.label||'普通')}</b>；攻击 <b>${fmt(attackRaw)}</b> → <b>${fmt(attack)}</b>${realmDamageOutputMult!==1?`；界域输出 ×<b>${realmDamageOutputMult.toFixed(2)}</b>`:''}${fixedStatusEffectMult!==1?`；固定中毒/反击 ×<b>${fixedStatusEffectMult.toFixed(2)}</b>`:''}${poisonInflictionMult!==1?`；中毒施加 ×<b>${poisonInflictionMult.toFixed(2)}</b>`:''}${fixedPoisonInflictionMult!==1?`；固定中毒施加 ×<b>${fixedPoisonInflictionMult.toFixed(2)}</b>`:''}${poisonTriggerMult!==1?`；中毒触发 ×<b>${poisonTriggerMult.toFixed(2)}</b>`:''}${counterGenerationMult!==1?`；反击生成 ×<b>${counterGenerationMult.toFixed(2)}</b>`:''}。事件：主动 <b>${activeEvents.length}</b> / 穿透 <b>${pierceEvents.length}</b> / 触腕 <b>${tentacleEvents.length}</b> / 纯粹 <b>${pureEvents.length}</b> / 固定 <b>${fixedEvents.length}</b> / 中毒 <b>${poisonEvents.length}</b> / 出血 <b>${bleedEvents.length}</b> / 侵蚀 <b>${corrosionEvents.length}</b> / 反击 <b>${counterEvents.length}</b> / 献祭 <b>${sacrificeEvents.length}</b>。启灵：<b>${esc(enlightenLabel)}</b>。`;
    }
    window.MorimensDamageEvents={
      mode,
      enemyProfile:{...enemyProfile,maxHp:enemyMaxHp,maxHpSource:enemyMaxHpSource,estimatedMaxHp:enemyProfile.estimatedMaxHp},
      realmOutput:{damage:realmDamageOutputMult,status:realmStatusOutputMult,fixedPoisonCounter:fixedStatusEffectMult},
      gearOutput:{poisonInfliction:poisonInflictionMult,fixedPoisonInfliction:fixedPoisonInflictionMult,poisonTrigger:poisonTriggerMult,counterGeneration:counterGenerationMult},
      sourceSkillEvents,
      events,
      totals:{
        active:activeTotal,pierce:pierceTotal,tentacle:tentacleTotal,pure:pureTotal,fixed:fixedTotal,
        poison:poisonTotal,bleed:bleedTotal,counter:counterTotal,sacrifice:sacrificeTotal,corrosion:corrosionDamage,embers:embersDamage,total
      },
      status:{poisonInitial:initialPoison,poisonAdded,poisonFinal:initialPoison+poisonAdded,bleedInitial:initialBleed,bleedAdded,bleedFinal:includeBleedTurnEnd?0:initialBleed+bleedAdded,corrosionInitial:initialCorrosion,corrosionAdded,corrosionFinal:corrosionRemaining,counterInitial:Math.max(0,n('currentCounter')),counterAdded,counterFinal:counterCurrent,enemySacrificeInitial:initialEnemySacrifice,enemySacrificeFromDamage:sacrificeFromDamage,enemySacrificeFromBirthRitual:sacrificeFromBirthRitual,enemySacrificeBeforeTurnEnd,enemySacrificeDamage:sacrificeTotal,enemySacrificeFinal:enemySacrificeRemaining,damageToSacrificePct,birthRitualStacks:finalBirthRitualStacks,birthRitualInitial:initialBirthRitualStacks,birthRitualSkillPerPlay:skillBirthRitualPerPlay,birthRitualAverageForSkill:averageBirthRitualStacksForSkill},
      remaining:{corrosion:corrosionRemaining,embers:embersRemaining,corrosionBeforeTurnEndClear,embersBeforeTurnReset,turnEndProcessed,includeTurnEndSettlement}
    };
  }

  function resetEnemy(){
    const values={
      realmMastery:0,tentacleMode:'standard',tentacleStance:'surging',currentTentacleDamage:0,teamMaxHp:0,
      tentacleExtraBonus:0,tentacleCritRate:0,tentacleCritDamage:150,strengthDown:0,
      tentacleCount:1,tentacleAttackTimes:1,enemyLevel:77,enemyMaxHpOverride:'',fortressStacks:0,targetVulnerableStacks:'',buffWeakStacks:'',buffBruteStacks:'',buffBurstStacks:'',currentPoison:0,currentBleed:0,currentCounter:0,
      actorMaxHp:0,actorCurrentHp:'',
      corrosionAmount:0,corrosionLossMultiplier:300,embersAmount:0,enemySacrificeAmount:0,birthRitualStacks:0,sacrificeOnDamagePct:0,realmPrimary:'auto',realmSecondary:'',realmChaosCount:1
    };
    for(const [id,v] of Object.entries(values))if($(id))$(id).value=String(v);
    if($('propagationConsumeEmbryo'))$('propagationConsumeEmbryo').checked=false;
    if($('propagationApplyFiesta'))$('propagationApplyFiesta').checked=true;
    if($('singularityDimensionShuttle'))$('singularityDimensionShuttle').checked=false;
    if($('ultraRoundActive'))$('ultraRoundActive').checked=false;
    if($('includeTurnEndTentacle'))$('includeTurnEndTentacle').checked=false;
    if($('forceCritAll'))$('forceCritAll').checked=false;
    for(const id of ['buffWeak','buffBrute','buffBurst'])if($(id))$(id).checked=false;
    for(const id of ['buffWeakStacks','buffBruteStacks','buffBurstStacks'])if($(id)){$(id).value='';$(id).disabled=true}
    if($('targetVulnerable'))$('targetVulnerable').checked=false;
    if($('targetVulnerableStacks'))$('targetVulnerableStacks').disabled=true;
    if($('includeTurnEndSettlement'))$('includeTurnEndSettlement').checked=true;
    if($('includePoisonTurnEnd'))$('includePoisonTurnEnd').checked=true;
    if($('includeBleedTurnEnd'))$('includeBleedTurnEnd').checked=true;
    if($('includeEnemySacrificeTurnEnd'))$('includeEnemySacrificeTurnEnd').checked=true;
    window.MorimensRealmEngine?.render?.();
    toggleTentacleMode();
    setTimeout(()=>window.MorimensStatsSync?.updateCharacterStats?.(),20);
    calculate();
  }

  window.MorimensCombatCalculator={calculate,renderTriplet,tentacleState,renderFormulaSource};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(inject,0));else setTimeout(inject,0);
  window.addEventListener('morimens-data-ready',()=>setTimeout(()=>{renderTriplet();calculate()},100));
})();

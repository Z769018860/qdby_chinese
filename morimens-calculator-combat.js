(()=>{
  const $=id=>document.getElementById(id);
  const n=(id,f=0)=>{const v=Number.parseFloat($(id)?.value);return Number.isFinite(v)?v:f};
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  const fmt=v=>Math.round(Number(v)||0).toLocaleString('zh-CN');
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function currentLevel(){return clamp(Number.parseFloat(($('charLevel')||$('skeydbCharacterLevel'))?.value)||90,1,90)}
  function currentRecord(){return window.MorimensCharacterSync?.record||window.MorimensData?.db?.records?.find(x=>x.id===$('charSelect')?.value)||null}
  function resolvedStats(){
    const rec=currentRecord(),engine=window.MorimensFormulaEngine;
    return rec&&engine?engine.contextFor(rec,currentLevel()):(window.MorimensCharacterSync?.finalStats||{});
  }

  function inject(){
    if($('combatModel')||!$('calcBtn'))return;
    const first=$('charSelect')?.closest('.builderBlock');
    if(first){
      const stats=document.createElement('div');
      stats.id='characterTriplet';stats.className='combatStats';
      stats.innerHTML='<div><small>体质 CON</small><strong id="combatCon">—</strong></div><div><small>攻击 ATK</small><strong id="combatAtk">—</strong></div><div><small>防御 DEF</small><strong id="combatDef">—</strong></div>';
      first.querySelector('.formGrid')?.insertAdjacentElement('afterend',stats);
    }

    const builder=$('calcBtn').closest('.panel')?.querySelector('.builder');
    if(!builder)return;

    const realm=document.createElement('div');
    realm.className='builderBlock';realm.id='realmTentacleModel';
    realm.innerHTML=`
      <div class="builderTitle"><span>⑥ 界域精通与触腕伤害</span><small>SKeyDB public-v3 公式</small></div>
      <div class="formGrid">
        <div class="field"><label for="realmMastery">最终界域精通</label><input id="realmMastery" type="number" min="0" step="0.1" value="0"><small>默认按角色等级和 SKeyDB substatScaling 自动带入，可手动覆盖。</small></div>
        <div class="field"><label for="tentacleMode">深海体系</label><select id="tentacleMode"><option value="standard">普通深海 Aequor</option><option value="benthos">深渊深海 Benthos: Aequor</option></select></div>
        <div class="field"><label for="tentacleStance">触腕姿态</label><select id="tentacleStance"><option value="surging">涨潮 Surging Tides · 100%</option><option value="tranquil">静海 Tranquil Sea · 50%</option><option value="raging">怒涛 Raging Waves · 125%</option></select></div>
        <div class="field" id="standardTentacleField"><label for="currentTentacleDamage">当前基础触腕伤害</label><input id="currentTentacleDamage" type="number" min="0" step="1" value="0"><small>普通深海的基础值 SKeyDB 未公开统一生成公式，直接填游戏触腕图标当前数值。</small></div>
        <div class="field" id="benthosHpField" hidden><label for="teamMaxHp">队伍最大生命</label><input id="teamMaxHp" type="number" min="0" step="1" value="0"><small>深渊深海：基础触腕伤害 = 队伍最大生命 × 5%。</small></div>
        <div class="field"><label for="tentacleExtraBonus">额外触腕伤害增幅 %</label><input id="tentacleExtraBonus" type="number" step="0.1" value="0"><small>用于命轮、技能、遗物等已经折算后的额外触腕增幅。</small></div>
        <div class="field"><label for="tentacleCount">当前触腕数</label><input id="tentacleCount" type="number" min="0" step="1" value="1"></div>
        <div class="field"><label for="tentacleAttackTimes">每只触腕攻击次数</label><input id="tentacleAttackTimes" type="number" min="0" step="1" value="1"></div>
      </div>
      <div class="checkGrid" style="margin-top:10px">
        <label class="check"><input id="benthosPureTeam" type="checkbox"><span>全队仅深海 / 混沌<small>深渊深海界域精通效果翻倍。</small></span></label>
        <label class="check"><input id="includeTurnEndTentacle" type="checkbox"><span>把回合末触腕攻击计入总伤害<small>默认只展示，不与当前技能伤害强行合并。</small></span></label>
      </div>
      <div class="combatReadout" id="tentacleReadout"></div>
      <details class="formulaSource"><summary>SKeyDB 计算公式与来源</summary><div id="tentacleFormulaSource"></div></details>`;

    const enemy=document.createElement('div');
    enemy.className='builderBlock';enemy.id='combatModel';
    enemy.innerHTML=`
      <div class="builderTitle"><span>⑦ 敌方属性与异常伤害</span><small>SKeyDB 状态定义</small></div>
      <div class="formGrid">
        <div class="field"><label for="enemyDefense">敌方防御力</label><input id="enemyDefense" type="number" min="0" step="1" value="0"></div>
        <div class="field"><label for="defenseMode">防御换算</label><select id="defenseMode"><option value="manual">使用手动实测系数</option><option value="curve">可校准曲线 K ÷ (K + DEF)</option></select></div>
        <div class="field"><label for="defenseConstant">防御常数 K</label><input id="defenseConstant" type="number" min="1" step="1" value="1000"><small>仅用于可校准曲线；SKeyDB 未公开官方防御常数。</small></div>
        <div class="field"><label for="fortressStacks">加固层数</label><input id="fortressStacks" type="number" min="0" max="100" step="1" value="0"><small>每层承伤降低 1%。</small></div>
        <div class="field"><label for="corrosionAmount">侵蚀层数 / 数值</label><input id="corrosionAmount" type="number" min="0" step="1" value="0"><small>主动伤害消耗等量侵蚀，追加消耗量 300% 的生命损失。</small></div>
        <div class="field"><label for="embersAmount">旧日余烬层数 / 数值</label><input id="embersAmount" type="number" min="0" step="1" value="0"><small>主动伤害消耗等量余烬，追加消耗量 300% 的生命损失。</small></div>
      </div>
      <div class="combatReadout" id="combatConversion"></div>`;
    builder.appendChild(realm);builder.appendChild(enemy);

    const style=document.createElement('style');
    style.textContent=`
      .combatStats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}
      .combatStats>div,.combatReadout,.formulaSource{padding:10px 12px;border:1px solid rgba(148,163,184,.14);border-radius:11px;background:rgba(2,6,23,.25)}
      .combatStats small{display:block;color:#8290a4;font-size:10px}.combatStats strong{display:block;margin-top:3px;color:#f1e0bf;font-size:18px}
      .combatReadout{margin-top:10px;color:#aeb8c7;font-size:11px;line-height:1.75}.combatReadout b{color:#f1e0bf}
      .formulaSource{margin-top:10px;color:#98a5b7;font-size:11px;line-height:1.75}.formulaSource summary{cursor:pointer;color:#d9c09a;font-weight:700}.formulaSource code{color:#f1e0bf;white-space:normal}
      .formulaSource .formulaRow{margin-top:7px;padding-top:7px;border-top:1px dashed rgba(148,163,184,.14)}
      @media(max-width:580px){.combatStats{grid-template-columns:1fr 1fr 1fr}}
    `;
    document.head.appendChild(style);

    for(const id of ['realmMastery','tentacleMode','tentacleStance','currentTentacleDamage','teamMaxHp','tentacleExtraBonus','tentacleCount','tentacleAttackTimes','benthosPureTeam','includeTurnEndTentacle','enemyDefense','defenseMode','defenseConstant','fortressStacks','corrosionAmount','embersAmount']){
      $(id)?.addEventListener('input',()=>{toggleTentacleMode();calculate()});
      $(id)?.addEventListener('change',()=>{toggleTentacleMode();calculate()});
    }
    document.addEventListener('input',e=>{if(e.target?.closest?.('.panel')&&e.target?.id!=='fortuneBtn')queueMicrotask(calculate)});
    document.addEventListener('change',()=>queueMicrotask(()=>{renderTriplet();calculate()}));
    $('calcBtn')?.addEventListener('click',()=>queueMicrotask(calculate));
    document.querySelectorAll('.modeBtn').forEach(button=>button.addEventListener('click',()=>queueMicrotask(calculate)));
    document.addEventListener('click',event=>{if(event.target?.id==='resetBtn')setTimeout(resetEnemy,30)},true);
    window.addEventListener('morimens-skill-formula',()=>queueMicrotask(calculate));
    window.addEventListener('morimens-character-stats',()=>queueMicrotask(()=>{renderTriplet();calculate()}));
    toggleTentacleMode();renderTriplet();renderFormulaSource();calculate();
    window.dispatchEvent(new CustomEvent('morimens-calculator-ui-ready'));
    setTimeout(()=>{window.MorimensStatsSync?.updateCharacterStats?.();renderTriplet();calculate()},300);
  }

  function toggleTentacleMode(){
    const benthos=$('tentacleMode')?.value==='benthos';
    if($('standardTentacleField'))$('standardTentacleField').hidden=benthos;
    if($('benthosHpField'))$('benthosHpField').hidden=!benthos;
  }

  function renderTriplet(){
    const rec=currentRecord();if(!rec)return;
    const stats=resolvedStats();
    if($('combatCon'))$('combatCon').textContent=fmt(stats.CON);
    if($('combatAtk'))$('combatAtk').textContent=fmt(stats.ATK);
    if($('combatDef'))$('combatDef').textContent=fmt(stats.DEF);
  }

  function tentacleState(){
    const engine=window.MorimensFormulaEngine;
    if(!engine)return {base:0,stanceMult:1,masteryMult:1,extraMult:1,attack:0,ragingTriggerPct:50};
    return engine.resolveTentacle({
      mode:$('tentacleMode')?.value||'standard',
      stance:$('tentacleStance')?.value||'surging',
      currentTentacle:n('currentTentacleDamage'),
      teamMaxHp:n('teamMaxHp'),
      realmMastery:n('realmMastery'),
      allAequorChaos:$('benthosPureTeam')?.checked===true,
      extraBonusPct:n('tentacleExtraBonus')
    });
  }

  function renderFormulaSource(){
    const box=$('tentacleFormulaSource');if(!box)return;
    box.innerHTML=`
      <div class="formulaRow"><b>角色主属性</b><br><code>ceil((primaryScalingBase + Lv + bonusLv) × statScaling)</code><br>SKeyDB：<code>src/domain/awakener-level-scaling.ts</code></div>
      <div class="formulaRow"><b>界域精通参与技能参数</b><br><code>additive: Base + RealmMastery × multiplier</code><br><code>scale_base: Base × (1 + RealmMastery × multiplier / 100)</code><br>SKeyDB：<code>src/domain/description-args.ts</code></div>
      <div class="formulaRow"><b>普通深海触腕姿态</b><br>涨潮 = 100%；静海 = 50%；怒涛 = 125%。怒涛主动伤害后的额外触发倍率：<code>50% + floor(最终界域精通 / 50) × 1%</code>。<br>SKeyDB：<code>overlay.global.surging-tides / tranquil-sea / raging-waves</code></div>
      <div class="formulaRow"><b>深渊深海 Benthos</b><br><code>基础触腕伤害 = 队伍最大生命 × 5%</code><br>怒涛：<code>基础触腕 × 125% × (1 + 界域精通 × 0.025% × 纯队倍率)</code>；纯深海/混沌队的界域精通效果 ×2。<br>SKeyDB：<code>overlay.global.divine-realm-aequor(.json) / divine-realm-aequor-mastery</code></div>
      <div class="formulaRow"><b>Primordia（SKeyDB 公式引擎）</b><br>进攻类效果（含触腕伤害）：<code>ceil(Base × (1 + RealmMastery × 0.1% × 纯混沌倍率))</code>；纯混沌时倍率 ×2。工具的技能参数解析已支持该 public-v3 computed 结构。</div>
      <div class="formulaRow"><b>说明</b><br>普通深海的“初始/当前触腕伤害”在 SKeyDB public-v3 中只有机制说明，没有公开统一基础生成式，因此不臆造；请填游戏界面当前触腕伤害。深渊深海的 5% Max HP 基础式则由 SKeyDB 明确给出。</div>
    `;
  }

  function calculate(){
    if(!$('combatModel')||!$('resultNumber'))return;
    renderTriplet();
    const attack=Math.max(0,n('attack'));
    const coef=Math.max(0,n('skillCoef'))/100;
    const hits=Math.max(1,Math.floor(n('hitCount',1)));
    let strength=n('strength');if($('buffBrute')?.checked)strength+=8;if($('buffBurst')?.checked)strength+=66;

    const tentacle=tentacleState();
    const skillSync=window.MorimensSkillSync||{};
    const skillTentacleCoef=Math.max(0,Number(skillSync.tentacleCoefficient)||0)/100;
    const skillTriggerPct=skillSync.triggeredTentaclePercent===null||skillSync.triggeredTentaclePercent===undefined?0:Math.max(0,Number(skillSync.triggeredTentaclePercent))/100;

    const activeBaseRaw=(attack*coef+strength+tentacle.attack*skillTentacleCoef)*hits;
    const base=activeBaseRaw*(1+n('baseBonus')/100);
    const powered=base*(1+n('powerBonus')/100);
    const vulnerabilityPct=n('vulnerability')+($('buffVuln')?.checked?50:0);
    const vuln=powered*(1+vulnerabilityPct/100);
    const weakCoef=$('buffWeak')?.checked?.75:1;
    const final=vuln*(1+n('finalBonus')/100)*weakCoef;

    const enemyDef=Math.max(0,n('enemyDefense')),k=Math.max(1,n('defenseConstant',1000));
    const defenseCoef=$('defenseMode')?.value==='curve'?k/(k+enemyDef):Math.max(0,n('defenseFactor',100))/100;
    const fortifyCoef=clamp(1-Math.max(0,n('fortressStacks'))/100,0,1);
    const other=Math.max(0,n('otherMultiplier',1));
    const normal=final*defenseCoef*fortifyCoef*other;
    const critRate=clamp(n('critRate')/100,0,1),critMult=Math.max(0,n('critDamage',150))/100;
    const crit=normal*critMult,expected=normal*(1-critRate)+crit*critRate;
    const mode=document.querySelector('.modeBtn[aria-pressed="true"]')?.dataset?.mode||'expected';
    const direct={normal,crit,expected}[mode]??expected;

    // SKeyDB explicitly states Vulnerable/Weakness affect Active and Tentacle DMG.
    // DMG Amplification is kept as the generic damage-amplification multiplier; card-specific
    // Base/Final DMG bonuses are not silently applied to standalone Tentacle attacks.
    const tentacleTargetMult=(1+n('powerBonus')/100)*(1+vulnerabilityPct/100)*weakCoef*defenseCoef*fortifyCoef*other;
    const oneTentacle=tentacle.attack*tentacleTargetMult;
    const skillTriggered=skillTriggerPct>0?oneTentacle*skillTriggerPct:0;
    const turnEndTentacle=oneTentacle*Math.max(0,Math.floor(n('tentacleCount',1)))*Math.max(0,Math.floor(n('tentacleAttackTimes',1)));
    const includeTurnEnd=$('includeTurnEndTentacle')?.checked===true;

    const corrosionUsed=Math.min(Math.max(0,n('corrosionAmount')),direct),embersUsed=Math.min(Math.max(0,n('embersAmount')),direct);
    const corrosionDamage=corrosionUsed*3,embersDamage=embersUsed*3;
    const total=direct+skillTriggered+(includeTurnEnd?turnEndTentacle:0)+corrosionDamage+embersDamage;

    const label={normal:'非暴击',crit:'暴击',expected:'期望'}[mode];
    $('resultLabel').textContent=`${$('charSelect')?.selectedOptions?.[0]?.textContent||'角色'} · ${label}总伤害`;
    $('resultNumber').textContent=fmt(total);
    $('normalLine').textContent=`非暴击直伤：${fmt(normal)}`;
    $('critLine').textContent=`暴击直伤：${fmt(crit)}`;
    $('expectedLine').textContent=`期望直伤：${fmt(expected)}`;

    const activeParts=[`ATK ${fmt(attack)} × 技能 ${coef.toFixed(3)}`,`力量 ${fmt(strength)}`];
    if(skillTentacleCoef)activeParts.push(`触腕 ${fmt(tentacle.attack)} × ${skillTentacleCoef.toFixed(3)}`);
    $('formula').textContent=`[(${activeParts.join(' + ')}) × ${hits}] × 基伤 ${(1+n('baseBonus')/100).toFixed(3)} × 强效 ${(1+n('powerBonus')/100).toFixed(3)} × 易伤 ${(1+vulnerabilityPct/100).toFixed(3)} × 终伤 ${(1+n('finalBonus')/100).toFixed(3)} × 防御 ${defenseCoef.toFixed(3)} × 加固 ${fortifyCoef.toFixed(3)}；触腕单次 = 基础 ${fmt(tentacle.base)} × 姿态 ${tentacle.stanceMult.toFixed(3)} × 精通 ${tentacle.masteryMult.toFixed(4)} × 额外增幅 ${tentacle.extraMult.toFixed(3)}。`;

    const rows=[
      ['技能基础项（含技能触腕加成）',activeBaseRaw],
      ['基础伤害转化后',base],
      ['伤害强效转化后',powered],
      ['易伤与最终增伤后',final],
      ['敌方防御与加固后直伤',direct],
      ['当前单次触腕伤害（目标修正后）',oneTentacle],
      ['当前技能触发的额外触腕',skillTriggered],
      ['回合末全部触腕',turnEndTentacle],
      ['侵蚀追加生命损失',corrosionDamage],
      ['旧日余烬追加生命损失',embersDamage],
      ['本次合计',total]
    ];
    $('breakdown').innerHTML=rows.map(([a,b])=>`<div class="step"><span>${esc(a)}${a==='回合末全部触腕'&&!includeTurnEnd?'（未计入总伤害）':''}</span><strong>${fmt(b)}</strong></div>`).join('');

    const stance={surging:'涨潮 100%',tranquil:'静海 50%',raging:'怒涛 125%'}[$('tentacleStance')?.value]||'';
    if($('tentacleReadout')){
      const model=$('tentacleMode')?.value==='benthos'?'深渊深海':'普通深海';
      $('tentacleReadout').innerHTML=`体系：<b>${model}</b> · 姿态：<b>${stance}</b> · 最终界域精通 <b>${n('realmMastery').toFixed(1)}</b><br>机制基础触腕 <b>${fmt(tentacle.base)}</b> → 当前单次触腕 <b>${fmt(tentacle.attack)}</b> → 目标修正后 <b>${fmt(oneTentacle)}</b>。${$('tentacleStance')?.value==='raging'&&$('tentacleMode')?.value!=='benthos'?` 普通怒涛主动伤害后触发倍率：<b>${tentacle.ragingTriggerPct}%</b>。`:''}${skillTentacleCoef?` 当前技能额外享受 <b>${(skillTentacleCoef*100).toFixed(1)}%</b> 触腕伤害加成。`:''}${skillTriggerPct?` 当前技能额外触发 <b>${(skillTriggerPct*100).toFixed(1)}%</b> 触腕伤害。`:''}`;
    }
    if($('combatConversion'))$('combatConversion').innerHTML=`攻击侧：基伤 <b>${fmt(activeBaseRaw)}</b> → 强效后 <b>${fmt(powered)}</b>；暴击率 <b>${(critRate*100).toFixed(1)}%</b>，暴伤 <b>${(critMult*100).toFixed(1)}%</b>。敌方：DEF <b>${fmt(enemyDef)}</b>，防御系数 <b>${(defenseCoef*100).toFixed(1)}%</b>，加固后系数 <b>${(fortifyCoef*100).toFixed(1)}%</b>。`;
  }

  function resetEnemy(){
    const values={realmMastery:0,tentacleMode:'standard',tentacleStance:'surging',currentTentacleDamage:0,teamMaxHp:0,tentacleExtraBonus:0,tentacleCount:1,tentacleAttackTimes:1,enemyDefense:0,defenseMode:'manual',defenseConstant:1000,fortressStacks:0,corrosionAmount:0,embersAmount:0};
    for(const [id,v] of Object.entries(values))if($(id))$(id).value=String(v);
    if($('benthosPureTeam'))$('benthosPureTeam').checked=false;
    if($('includeTurnEndTentacle'))$('includeTurnEndTentacle').checked=false;
    toggleTentacleMode();
    setTimeout(()=>window.MorimensStatsSync?.updateCharacterStats?.(),20);
    calculate();
  }

  window.MorimensCombatCalculator={calculate,renderTriplet,tentacleState,renderFormulaSource};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(inject,0));else setTimeout(inject,0);
  window.addEventListener('morimens-data-ready',()=>setTimeout(()=>{renderTriplet();calculate()},100));
})();

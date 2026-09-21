(()=>{
  const $=id=>document.getElementById(id);
  const n=(id,f=0)=>{const v=Number.parseFloat($(id)?.value);return Number.isFinite(v)?v:f};
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  const fmt=v=>Math.round(Number(v)||0).toLocaleString('zh-CN');
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function currentLevel(){return clamp(Number.parseFloat(($('charLevel')||$('skeydbCharacterLevel'))?.value)||90,1,90)}
  function currentRecord(){return window.MorimensCharacterSync?.record||window.MorimensData?.db?.records?.find(x=>x.id===$('charSelect')?.value)||null}
  function resolvedStats(){
    if(window.MorimensProgressionStats)return window.MorimensProgressionStats;
    if(window.MorimensCharacterSync?.finalStats)return window.MorimensCharacterSync.finalStats;
    const rec=currentRecord(),engine=window.MorimensFormulaEngine;
    return rec&&engine?engine.contextFor(rec,currentLevel()):{};
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
    realm.className='builderBlock';realm.id='realmTentacleModel';
    realm.innerHTML=`
      <div class="builderTitle"><span>⑦ 界域精通与触腕伤害</span><small>SKeyDB 数据公式</small></div>
      <div class="formGrid">
        <div class="field"><label for="realmMastery">最终界域精通</label><input id="realmMastery" type="number" min="0" step="0.1" value="0"><small>默认按角色等级与 SKeyDB 副属性成长规则自动带入，可手动覆盖。</small></div>
        <div class="field"><label for="tentacleMode">触腕基础模型</label><select id="tentacleMode"><option value="standard">普通深海 / 普通触腕</option><option value="benthos">深渊深海</option></select><small>选择“普通/深渊深海”界域时会自动锁定对应模型。</small></div>
        <div class="field"><label for="tentacleStance">触腕姿态</label><select id="tentacleStance"><option value="surging">涨潮</option><option value="tranquil">静海</option><option value="raging">怒涛</option></select></div>
        <div class="field" id="standardTentacleField"><label for="currentTentacleDamage">当前基础触腕伤害</label><input id="currentTentacleDamage" type="number" min="0" step="1" value="0"><small>普通深海的基础值 SKeyDB 未公开统一生成公式，直接填游戏触腕图标当前数值。</small></div>
        <div class="field" id="benthosHpField" hidden><label for="teamMaxHp">队伍最大生命</label><input id="teamMaxHp" type="number" min="0" step="1" value="0"><small>深渊深海：基础触腕伤害 = 队伍最大生命 × 5%。</small></div>
        <div class="field"><label for="tentacleExtraBonus">额外触腕伤害增幅 %</label><input id="tentacleExtraBonus" type="number" step="0.1" value="0"><small>用于命轮、技能、遗物等已经折算后的额外触腕增幅。</small></div>
        <div class="field"><label for="strengthDown">力量降低 STR▼</label><input id="strengthDown" type="number" min="0" step="0.1" value="0"><small>主动伤害每点 -1；触腕按 50% 生效。</small></div>
        <div class="field" id="benthosRagingField" hidden><label for="benthosRagingPct">深渊怒涛基础倍率 %</label><input id="benthosRagingPct" type="number" min="0" step="0.1" value="100"><small>SKeyDB 2.6.1 当前公开记录为 X，未给固定值；请按游戏内显示校准。</small></div>
        <div class="field"><label for="tentacleCount">当前触腕数</label><input id="tentacleCount" type="number" min="0" step="1" value="1"></div>
        <div class="field"><label for="tentacleAttackTimes">每只触腕攻击次数</label><input id="tentacleAttackTimes" type="number" min="0" step="1" value="1"></div>
      </div>
      <div class="checkGrid" style="margin-top:10px">
        <label class="check"><input id="includeTurnEndTentacle" type="checkbox"><span>把回合末触腕攻击计入总伤害<small>深渊静海会自动禁止回合末触腕攻击。</small></span></label>
      </div>
      <div class="combatReadout" id="tentacleReadout"></div>
      <details class="formulaSource"><summary>SKeyDB 计算公式与数据来源</summary><div id="tentacleFormulaSource"></div></details>`;

    const enemy=document.createElement('div');
    enemy.className='builderBlock';enemy.id='combatModel';
    enemy.innerHTML=`
      <div class="builderTitle"><span>⑧ 敌方属性与异常伤害</span><small>SKeyDB 状态规则</small></div>
      <div class="formGrid">
        <div class="field"><label for="enemyDefense">敌方防御力</label><input id="enemyDefense" type="number" min="0" step="1" value="0"></div>
        <div class="field"><label for="defenseMode">防御换算</label><select id="defenseMode"><option value="manual">使用手动实测系数</option><option value="curve">可校准曲线 K ÷ (K + 防御)</option></select></div>
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

    for(const id of ['realmMastery','tentacleMode','tentacleStance','currentTentacleDamage','teamMaxHp','tentacleExtraBonus','strengthDown','benthosRagingPct','tentacleCount','tentacleAttackTimes','includeTurnEndTentacle','enemyDefense','defenseMode','defenseConstant','fortressStacks','corrosionAmount','embersAmount']){
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
    window.addEventListener('morimens-realm-change',()=>queueMicrotask(()=>{toggleTentacleMode();renderTriplet();calculate()}));
    toggleTentacleMode();renderTriplet();renderFormulaSource();calculate();
    window.dispatchEvent(new CustomEvent('morimens-calculator-ui-ready'));
    setTimeout(()=>{window.MorimensStatsSync?.updateCharacterStats?.();renderTriplet();calculate()},300);
  }

  function effectiveTentacleMode(){
    const realm=window.MorimensRealmEngine?.state?.();
    return realm?.tentacleMode||$('tentacleMode')?.value||'standard';
  }
  function toggleTentacleMode(){
    const realm=window.MorimensRealmEngine?.state?.();
    const forced=realm?.tentacleMode;
    if($('tentacleMode')){if(forced)$('tentacleMode').value=forced;$('tentacleMode').disabled=Boolean(forced)}
    const benthos=effectiveTentacleMode()==='benthos';
    if($('standardTentacleField'))$('standardTentacleField').hidden=benthos;
    if($('benthosHpField'))$('benthosHpField').hidden=!benthos;
    if($('benthosRagingField'))$('benthosRagingField').hidden=!(benthos&&$('tentacleStance')?.value==='raging');
  }

  function renderTriplet(){
    const rec=currentRecord();if(!rec)return;
    const stats=resolvedStats(),realm=window.MorimensRealmEngine?.state?.()||{};
    if($('combatCon'))$('combatCon').textContent=fmt(stats.CON);
    if($('combatAtk'))$('combatAtk').textContent=fmt((Number(stats.ATK)||0)*(Number(realm.atkMultiplier)||1));
    if($('combatDef'))$('combatDef').textContent=fmt((Number(stats.DEF)||0)*(Number(realm.defMultiplier)||1));
  }

  function tentacleState(){
    const engine=window.MorimensFormulaEngine,realm=window.MorimensRealmEngine?.state?.()||{};
    if(!engine)return {base:0,stanceMult:1,masteryMult:1,extraMult:1,attack:0,ragingTriggerPct:50,turnEndAllowed:true};
    return engine.resolveTentacle({
      mode:effectiveTentacleMode(),
      stance:$('tentacleStance')?.value||'surging',
      currentTentacle:n('currentTentacleDamage'),
      teamMaxHp:n('teamMaxHp'),
      realmMastery:n('realmMastery'),
      allAequorChaos:realm.mode==='benthos'&&realm.pureTeam===true,
      extraBonusPct:n('tentacleExtraBonus'),
      benthosRagingPct:n('benthosRagingPct',100)
    });
  }

  function renderFormulaSource(){
    const box=$('tentacleFormulaSource');if(!box)return;
    box.innerHTML=`
      <div class="formulaRow"><b>角色主属性</b><br><code>向上取整((基础成长值 + 角色等级 + 内在灵格提供的基础属性等级) × 属性成长率)</code><br>随后再乘以灵塑提供的主属性百分比并向上取整。数据来源：<code>awakener-level-scaling.ts</code>。</div>
      <div class="formulaRow"><b>内在灵格</b><br>SKeyDB 的“内在灵格”天赋先把当前等级解析为“基础属性等级 +N”，然后同时作用于体质、攻击、防御三个主属性；不是简单把天赋说明里显示的属性数字直接相加。</div>
      <div class="formulaRow"><b>灵塑</b><br>灵塑适性第 N 级的第一个参数作为主属性百分比：<code>灵塑后主属性 = 向上取整(灵格后主属性 × (1 + 灵塑百分比 / 100))</code>。灵塑天赋仅在“星辰篇”关卡生效，因此页面提供独立启用开关。能明确解析为“伤害额外增加攻击力 X%”或“基础伤害 +X%”的专属效果也会自动计入；条件不明确的效果只展示，不擅自加入。</div>
      <div class="formulaRow"><b>界域精通参与技能参数</b><br><code>加算模式：基础值 + 界域精通 × 系数</code><br><code>按基础值缩放：基础值 × (1 + 界域精通 × 系数 / 100)</code><br>数据来源：<code>description-args.ts</code>。</div>
      <div class="formulaRow"><b>力量与触腕</b><br>每 1 点力量使主动伤害 +1；触腕享受 50% 力量。力量降低同理：主动伤害每点 -1，触腕按 50% 扣除。</div>
      <div class="formulaRow"><b>普通深海触腕姿态</b><br>涨潮 = 100%；静海 = 50%；怒涛 = 125%。怒涛在主动伤害后的额外触发倍率：<code>50% + 向下取整(最终界域精通 / 50) × 1%</code>。</div>
      <div class="formulaRow"><b>深渊深海</b><br><code>基础触腕伤害 = 队伍最大生命 × 5%</code>；团队伤害强效 +50%，纯深海/混沌 +100%。深渊静海不进行回合末触腕攻击。深渊怒涛公开数据当前只给出 <code>X</code> 基础倍率，因此工具改为手动校准；其界域精通部分为 <code>1 + 界域精通 × 0.025% × 纯队倍率</code>。</div>
      <div class="formulaRow"><b>原初混沌精通</b><br>原初混沌本体提供全队攻击/防御 +10% 与团队伤害强效 +50%（纯混沌 +100%）。精通仅继续缩放造物：进攻类效果（包含触腕伤害）<code>向上取整(基础效果 × (1 + 界域精通 × 0.1% × 纯混沌倍率))</code>，纯混沌时倍率翻倍。</div>
      <div class="formulaRow"><b>普通深海基础触腕说明</b><br>SKeyDB 当前只公开普通深海的机制与姿态倍率，没有给出统一的“初始触腕伤害”生成式，所以工具不会自行猜测；请填写游戏界面当前显示的基础触腕伤害。深渊深海的“队伍最大生命 × 5%”则有明确数据依据。</div>
    `;
  }

  function calculate(){
    if(!$('combatModel')||!$('resultNumber'))return;
    renderTriplet();
    const realm=window.MorimensRealmEngine?.state?.()||{atkMultiplier:1,defMultiplier:1,teamDamageAmp:0,finalDamageBonus:0,propagationFiestaStacks:0,propagationApplies:false,label:'普通界域'};
    const attackRaw=Math.max(0,n('attack'));
    const attack=attackRaw*Math.max(0,Number(realm.atkMultiplier)||1);
    const coef=Math.max(0,n('skillCoef'))/100;
    const hits=Math.max(1,Math.floor(n('hitCount',1)));
    let strength=n('strength');
    if($('buffBrute')?.checked)strength+=8;
    if($('buffBurst')?.checked)strength+=66;
    const strengthDown=Math.max(0,n('strengthDown'));
    const netStrength=strength-strengthDown;
  
    const tentacle=tentacleState();
    const tentacleWithStrength=Math.max(0,tentacle.attack+netStrength*0.5);
    const skillSync=window.MorimensSkillSync||{};
    const progression=window.MorimensProgressionSync||window.MorimensCharacterSync?.progression||{};
    const skillTentacleCoef=Math.max(0,Number(skillSync.tentacleCoefficient)||0)/100;
    const skillTriggerPct=skillSync.triggeredTentaclePercent===null||skillSync.triggeredTentaclePercent===undefined?0:Math.max(0,Number(skillSync.triggeredTentaclePercent))/100;
    const propagationTentacleEffectMult=realm.propagationApplies?1+Math.max(0,Number(realm.propagationFiestaStacks)||0)/100:1;
    const soulforgeFlat=progression.soulforgeEnabled?attack*Math.max(0,Number(progression.flatAtkDamagePct)||0)/100:0;
    const soulforgeBasePct=progression.soulforgeEnabled?Math.max(0,Number(progression.baseDamagePct)||0):0;
  
    const activeBaseRaw=(attack*coef+netStrength+tentacleWithStrength*skillTentacleCoef*propagationTentacleEffectMult+soulforgeFlat)*hits;
    const basePct=n('baseBonus')+soulforgeBasePct;
    const base=activeBaseRaw*(1+basePct/100);
    const powerPct=n('powerBonus')+Math.max(0,Number(realm.teamDamageAmp)||0);
    const powered=base*(1+powerPct/100);
    const vulnerabilityPct=n('vulnerability')+($('buffVuln')?.checked?50:0);
    const vuln=powered*(1+vulnerabilityPct/100);
    const weakCoef=$('buffWeak')?.checked?.75:1;
    const finalPct=n('finalBonus')+Math.max(0,Number(realm.finalDamageBonus)||0);
    const final=vuln*(1+finalPct/100)*weakCoef;
  
    const enemyDef=Math.max(0,n('enemyDefense')),k=Math.max(1,n('defenseConstant',1000));
    const defenseCoef=$('defenseMode')?.value==='curve'?k/(k+enemyDef):Math.max(0,n('defenseFactor',100))/100;
    const fortifyCoef=clamp(1-Math.max(0,n('fortressStacks'))/100,0,1);
    const other=Math.max(0,n('otherMultiplier',1));
    const normal=final*defenseCoef*fortifyCoef*other;
    const critRate=clamp(n('critRate')/100,0,1),critMult=Math.max(0,n('critDamage',150))/100;
    const crit=normal*critMult,expected=normal*(1-critRate)+crit*critRate;
    const mode=document.querySelector('.modeBtn[aria-pressed="true"]')?.dataset?.mode||'expected';
    const direct={normal,crit,expected}[mode]??expected;
  
    const tentacleTargetMult=(1+powerPct/100)*(1+vulnerabilityPct/100)*weakCoef*defenseCoef*fortifyCoef*other;
    const oneTentacle=tentacleWithStrength*tentacleTargetMult;
    const skillTriggered=skillTriggerPct>0?oneTentacle*skillTriggerPct:0;
    const stanceTriggered=$('tentacleStance')?.value==='raging'&&activeBaseRaw>0?oneTentacle*Math.max(0,Number(tentacle.ragingTriggerPct)||0)/100:0;
    const rawTurnEnd=oneTentacle*Math.max(0,Math.floor(n('tentacleCount',1)))*Math.max(0,Math.floor(n('tentacleAttackTimes',1)));
    const turnEndTentacle=tentacle.turnEndAllowed===false?0:rawTurnEnd;
    const includeTurnEnd=$('includeTurnEndTentacle')?.checked===true&&tentacle.turnEndAllowed!==false;
  
    const reactiveBase=direct+skillTriggered+stanceTriggered+(includeTurnEnd?turnEndTentacle:0);
    const corrosionUsed=Math.min(Math.max(0,n('corrosionAmount')),Math.max(0,reactiveBase));
    const embersUsed=Math.min(Math.max(0,n('embersAmount')),Math.max(0,reactiveBase));
    const corrosionDamage=corrosionUsed*3,embersDamage=embersUsed*3;
    const total=direct+skillTriggered+stanceTriggered+(includeTurnEnd?turnEndTentacle:0)+corrosionDamage+embersDamage;
  
    const label={normal:'非暴击',crit:'暴击',expected:'期望'}[mode];
    $('resultLabel').textContent=`${$('charSelect')?.selectedOptions?.[0]?.textContent||'角色'} · ${label}总伤害`;
    $('resultNumber').textContent=fmt(total);
    $('normalLine').textContent=`非暴击直伤：${fmt(normal)}`;
    $('critLine').textContent=`暴击直伤：${fmt(crit)}`;
    $('expectedLine').textContent=`期望直伤：${fmt(expected)}`;
  
    const activeParts=[`攻击 ${fmt(attackRaw)} × 界域攻击 ${(Number(realm.atkMultiplier)||1).toFixed(3)} × 技能 ${coef.toFixed(3)}`,`净力量 ${fmt(netStrength)}`];
    if(skillTentacleCoef)activeParts.push(`触腕 ${fmt(tentacleWithStrength)} × ${skillTentacleCoef.toFixed(3)}${realm.propagationApplies?` × 狂欢 ${propagationTentacleEffectMult.toFixed(3)}`:''}`);
    if(soulforgeFlat)activeParts.push(`灵塑专属 ${fmt(attack)} × ${(progression.flatAtkDamagePct/100).toFixed(3)}`);
    $('formula').textContent=`[(${activeParts.join(' + ')}) × ${hits}] × 基础伤害 ${(1+basePct/100).toFixed(3)} × 伤害强效 ${(1+powerPct/100).toFixed(3)} × 易伤 ${(1+vulnerabilityPct/100).toFixed(3)} × 终伤 ${(1+finalPct/100).toFixed(3)} × 防御 ${defenseCoef.toFixed(3)} × 加固 ${fortifyCoef.toFixed(3)}；触腕单次 = (机制触腕 ${fmt(tentacle.attack)} + 净力量×50%) × 目标乘区。`;
  
    const rows=[
      ['界域修正后攻击力',attack],
      ['技能基础项（含触腕与可确认的灵塑专属加成）',activeBaseRaw],
      ['灵塑额外攻击力伤害',soulforgeFlat*hits],
      ['基础伤害转化后',base],
      ['团队/角色伤害强效转化后',powered],
      ['易伤与最终增伤后',final],
      ['敌方防御与加固后直伤',direct],
      ['当前单次触腕伤害（含 50% 净力量）',oneTentacle],
      ['当前技能触发的额外触腕',skillTriggered],
      ['怒涛主动伤害后触腕',stanceTriggered],
      ['回合末全部触腕',turnEndTentacle],
      ['侵蚀追加生命损失',corrosionDamage],
      ['旧日余烬追加生命损失',embersDamage],
      ['本次合计',total]
    ];
    $('breakdown').innerHTML=rows.map(([a,b])=>`<div class="step"><span>${esc(a)}${a==='回合末全部触腕'&&!includeTurnEnd?'（未计入总伤害）':''}</span><strong>${fmt(b)}</strong></div>`).join('');
  
    const tmode=effectiveTentacleMode();
    const stance=tmode==='benthos'
      ?({surging:'涨潮 100%',tranquil:'静海（回合末不攻击）',raging:`怒涛 ${n('benthosRagingPct',100).toFixed(1)}% 基础倍率`}[$('tentacleStance')?.value]||'')
      :({surging:'涨潮 100%',tranquil:'静海 50%',raging:'怒涛 125%'}[$('tentacleStance')?.value]||'');
    if($('tentacleReadout')){
      const model=tmode==='benthos'?'深渊深海':'普通深海 / 普通触腕';
      $('tentacleReadout').innerHTML=`体系：<b>${model}</b> · 姿态：<b>${stance}</b> · 最终界域精通 <b>${n('realmMastery').toFixed(1)}</b><br>机制基础触腕 <b>${fmt(tentacle.base)}</b> → 姿态/精通后 <b>${fmt(tentacle.attack)}</b> → 加入 50% 净力量后 <b>${fmt(tentacleWithStrength)}</b> → 目标修正后 <b>${fmt(oneTentacle)}</b>。${$('tentacleStance')?.value==='raging'?` 主动伤害后额外触发：<b>${fmt(stanceTriggered)}</b>（${tentacle.ragingTriggerPct}%）。`:''}${tentacle.turnEndAllowed===false?' 当前姿态禁止回合末触腕攻击。':''}${skillTentacleCoef?` 当前技能额外享受 <b>${(skillTentacleCoef*100).toFixed(1)}%</b> 触腕伤害加成。`:''}${skillTriggerPct?` 当前技能额外触发 <b>${(skillTriggerPct*100).toFixed(1)}%</b> 触腕伤害。`:''}`;
    }
    if($('combatConversion'))$('combatConversion').innerHTML=`界域：<b>${esc(realm.label||'普通')}</b>；攻击 <b>${fmt(attackRaw)}</b> → <b>${fmt(attack)}</b>，团队伤害强效额外 <b>+${Math.max(0,Number(realm.teamDamageAmp)||0).toFixed(0)}%</b>。攻击侧：基础伤害 <b>${fmt(activeBaseRaw)}</b> → 强效后 <b>${fmt(powered)}</b>；暴击率 <b>${(critRate*100).toFixed(1)}%</b>，暴击伤害 <b>${(critMult*100).toFixed(1)}%</b>。敌方：防御 <b>${fmt(enemyDef)}</b>，防御系数 <b>${(defenseCoef*100).toFixed(1)}%</b>，加固后系数 <b>${(fortifyCoef*100).toFixed(1)}%</b>。${progression.gnosticLevel?` 内在灵格 <b>${progression.gnosticLevel}</b> 已按基础属性等级 +${progression.bonusLevels} 计入。`:''}${progression.soulforgeLevel?` 灵塑 <b>${progression.soulforgeLevel}</b>：主属性 +${progression.soulforgePct}%${progression.soulforgeEnabled?' 已计入':' 当前未启用'}。`:''}`;
  }

  function resetEnemy(){
    const values={realmMastery:0,tentacleMode:'standard',tentacleStance:'surging',currentTentacleDamage:0,teamMaxHp:0,tentacleExtraBonus:0,strengthDown:0,benthosRagingPct:100,tentacleCount:1,tentacleAttackTimes:1,enemyDefense:0,defenseMode:'manual',defenseConstant:1000,fortressStacks:0,corrosionAmount:0,embersAmount:0,realmMode:'auto'};
    for(const [id,v] of Object.entries(values))if($(id))$(id).value=String(v);
    if($('realmPureTeam'))$('realmPureTeam').checked=false;
    if($('propagationConsumeEmbryo'))$('propagationConsumeEmbryo').checked=false;
    if($('propagationApplyFiesta'))$('propagationApplyFiesta').checked=true;
    if($('includeTurnEndTentacle'))$('includeTurnEndTentacle').checked=false;
    window.MorimensRealmEngine?.render?.();
    toggleTentacleMode();
    setTimeout(()=>window.MorimensStatsSync?.updateCharacterStats?.(),20);
    calculate();
  }

  window.MorimensCombatCalculator={calculate,renderTriplet,tentacleState,renderFormulaSource};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(inject,0));else setTimeout(inject,0);
  window.addEventListener('morimens-data-ready',()=>setTimeout(()=>{renderTriplet();calculate()},100));
})();

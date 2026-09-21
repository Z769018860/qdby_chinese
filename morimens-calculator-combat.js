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
        <div class="field" id="benthosHpField" hidden><label for="teamMaxHp">队伍最大生命</label><input id="teamMaxHp" type="number" min="0" step="1" value="0"><small id="teamMaxHpNote">深渊深海：基础触腕伤害 = 队伍最大生命 × 5%。</small></div>
        <div class="field"><label for="tentacleExtraBonus">额外触腕伤害增幅 %</label><input id="tentacleExtraBonus" type="number" step="0.1" value="0"><small>用于命轮、技能、遗物等已经折算后的额外触腕增幅。</small></div>
        <div class="field"><label for="tentacleCritRate">触腕暴击率 %</label><input id="tentacleCritRate" type="number" min="0" max="100" step="0.1" value="0"><small>团队入场暴击率汇总规则需要完整队伍数据，当前允许手动填写最终触腕暴击率。</small></div>
        <div class="field"><label for="tentacleCritDamage">触腕暴击伤害 %</label><input id="tentacleCritDamage" type="number" min="100" step="0.1" value="150"><small>用于触腕事件的暴击/期望伤害。</small></div>
        <div class="field"><label for="strengthDown">力量降低 STR▼</label><input id="strengthDown" type="number" min="0" step="0.1" value="0"><small>主动伤害每点 -1；触腕按 50% 生效。</small></div>
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
      <div class="builderTitle"><span>⑧ 敌人等级与状态事件</span><small>通用等级模型 + SKeyDB 状态规则</small></div>
      <div class="formGrid">
        <div class="field"><label for="enemyLevel">敌人等级</label><input id="enemyLevel" type="number" min="1" max="120" step="1" value="77"><small>只需填写等级；工具会生成通用承伤系数与估算最大生命。</small></div>
        <div class="field"><label for="fortressStacks">加固层数</label><input id="fortressStacks" type="number" min="0" max="100" step="1" value="0"><small>SKeyDB：每层使受到的伤害降低 1%。</small></div>
        <div class="field"><label for="currentPoison">当前 Poison / 中毒层数</label><input id="currentPoison" type="number" min="0" step="1" value="0"><small>用于“Trigger X% Poison”等即时中毒触发。</small></div>
        <div class="field"><label for="currentCounter">当前 Counter / 反击数值</label><input id="currentCounter" type="number" min="0" step="1" value="0"><small>用于“Trigger X% Counter”事件。</small></div>
        <div class="field"><label for="corrosionAmount">侵蚀层数 / 数值</label><input id="corrosionAmount" type="number" min="0" step="1" value="0"><small>Active / Tentacle 按伤害等量消费；Pierce / Pure / Fixed / Poison / Counter 等其他伤害按伤害的 50% 消费；追加消费量 300% 的生命损失。</small></div>
        <div class="field"><label for="embersAmount">旧日余烬层数 / 数值</label><input id="embersAmount" type="number" min="0" step="1" value="0"><small>Active / Tentacle 按伤害等量消费；Pierce / Pure / Poison / Counter 等其他伤害按伤害的 50% 消费；追加消费量 300% 的生命损失。</small></div>
      </div>
      <div class="checkGrid" style="margin-top:10px">
        <label class="check"><input id="includePoisonTurnEnd" type="checkbox" checked><span>计入本次技能后的一次回合末 Poison 结算<small>Poison 在回合末造成等于当前层数的 Pure DMG。</small></span></label>
      </div>
      <div class="combatReadout" id="enemyLevelReadout"></div>
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

    for(const id of ['realmMastery','tentacleMode','tentacleStance','currentTentacleDamage','teamMaxHp','tentacleExtraBonus','tentacleCritRate','tentacleCritDamage','strengthDown','tentacleCount','tentacleAttackTimes','includeTurnEndTentacle','enemyLevel','fortressStacks','currentPoison','currentCounter','corrosionAmount','embersAmount','includePoisonTurnEnd']){
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
    const hitField=$('hitCount')?.closest('.field');if(hitField){const label=hitField.querySelector('label');if(label)label.textContent='手动重复事件序列次数';let note=hitField.querySelector('small');if(!note){note=document.createElement('small');hitField.appendChild(note)}note.textContent='多段技能已由 SKeyDB Damage Events 自动拆分；这里仅用于额外重复整套事件，通常保持 1。'}
    toggleTentacleMode();renderTriplet();renderFormulaSource();calculate();
    window.dispatchEvent(new CustomEvent('morimens-calculator-ui-ready'));
    setTimeout(()=>{window.MorimensStatsSync?.updateCharacterStats?.();renderTriplet();calculate()},300);
  }

  function effectiveTentacleMode(){
    const realm=window.MorimensRealmEngine?.state?.();
    return realm?.tentacleMode||$('tentacleMode')?.value||'standard';
  }
  function toggleTentacleMode(){
    const realm=window.MorimensRealmEngine?.state?.()||{};
    const forced=realm.tentacleMode;
    if($('tentacleMode')){if(forced)$('tentacleMode').value=forced;$('tentacleMode').disabled=Boolean(forced)}
    const benthos=effectiveTentacleMode()==='benthos';
    const needsHp=benthos||Number(realm.aequorChaosBaseTentacleBonusPct)>0;
    if($('standardTentacleField'))$('standardTentacleField').hidden=benthos;
    if($('benthosHpField'))$('benthosHpField').hidden=!needsHp;
    if($('teamMaxHpNote')){
      $('teamMaxHpNote').textContent=benthos
        ?'深渊深海：基础触腕 = 队伍最大生命 × 5%；若同时存在普通混沌共生，再叠加每名混沌唤醒体 1% 最大生命。'
        :'混沌×深海共生：每名混沌唤醒体额外提供队伍最大生命 1% 的基础触腕。';
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
    if(!engine)return {base:0,stanceMult:1,masteryMult:1,extraMult:1,attack:0,ragingTriggerPct:50,turnEndAllowed:true};
    const baseRealmMastery=Math.max(0,n('realmMastery'));
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
      <div class="formulaRow"><b>力量与触腕</b><br>每 1 点力量使主动伤害 +1；触腕享受 50% 力量。力量降低同理：主动伤害每点 -1，触腕按 50% 扣除。</div>
      <div class="formulaRow"><b>普通深海触腕姿态</b><br>涨潮 = 100%；静海 = 50%；怒涛 = 125%。怒涛在每次主动伤害后的触腕倍率：<code>50% + floor(有效最终界域精通 / 50) × 1%</code>；先计入当前命轮中“切换怒涛后获得当前界域精通 X% 的临时界域精通”，再应用至纯深海/混沌共生的界域精通效果倍率。</div>
      <div class="formulaRow"><b>深渊深海</b><br><code>基础触腕伤害 = 队伍最大生命 × 5%</code>；团队伤害强效 +50%，纯深海/混沌 +100%。深渊静海不进行回合末触腕攻击。深渊怒涛在 Pontos「Lightless Bottom」天赋记录中明确为 <code>125%</code>；其界域精通部分为 <code>1 + 界域精通 × 0.025% × 纯队倍率</code>。</div>
      <div class="formulaRow"><b>原初混沌精通</b><br>原初混沌本体提供全队攻击/防御 +10% 与团队伤害强效 +50%（纯混沌 +100%）。精通仅继续缩放造物：进攻类效果（包含触腕伤害）<code>向上取整(基础效果 × (1 + 界域精通 × 0.1% × 纯混沌倍率))</code>，纯混沌时倍率翻倍。</div>
      <div class="formulaRow"><b>Damage Events</b><br>SKeyDB 的易伤/虚弱只修正 Active 与 Tentacle；Pierce 即使由触腕触发也不套易伤/虚弱。<code>[Damage:...]</code> 会按文本识别为 Active 或 Pierce；目标最大生命百分比会生成 Pure；Poison 支持“按伤害施加”和“Trigger X% Poison”；Counter 支持“Trigger X% Counter”。侵蚀/旧日余烬：Active/Tentacle 按伤害等量消费；Pierce/Pure/Fixed/Poison/Counter 等其他伤害按伤害的 50% 消费。</div><div class="formulaRow"><b>敌人等级通用模型</b><br>SKeyDB D-Zone 没有公开统一敌方 DEF 常数，因此删除手工 DEF/K 模型。估算最大生命使用 D-Zone 60–69 期 1665 个 level/HP 样本的对数拟合；普通伤害的等级系数使用 SKeyDB stage-growth 曲线做相对等级归一化，明确属于通用比较模型而非官方 DEF 公式。</div><div class="formulaRow"><b>Pure / Poison / Counter</b><br>SKeyDB：Pure DMG 不能暴击；Poison 回合末造成等于层数的 Pure DMG；Counter 触发时造成等于反击层数的 Pure DMG。三者不套通用等级系数，仍受明确的 Fortress 承伤修正。</div><div class="formulaRow"><b>普通深海基础触腕说明</b><br>SKeyDB 当前没有给普通深海统一初始触腕生成式，因此普通基础值仍由游戏内当前显示值输入；混沌×深海共生额外按每名混沌唤醒体 +1% 队伍最大生命计算。</div>
    `;
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
    const enemyMaxHp=Math.max(1,Number(enemyProfile.estimatedMaxHp)||1);
    const levelFactor=Math.max(0,Number(enemyProfile.levelFactor)||1);
  
    let strength=n('strength');
    if($('buffBrute')?.checked)strength+=8;
    if($('buffBurst')?.checked)strength+=66;
    const strengthDown=Math.max(0,n('strengthDown'));
    const netStrength=strength-strengthDown;
  
    const tentacle=tentacleState();
    const tentacleWithStrength=Math.max(0,tentacle.attack+netStrength*0.5);
    const skillSync=window.MorimensSkillSync||{};
    const progression=window.MorimensProgressionSync||window.MorimensCharacterSync?.progression||{};
    const sourceSkillEvents=Array.isArray(skillSync.damageEvents)&&skillSync.damageEvents.length
      ?skillSync.damageEvents
      :[{id:'active-legacy',index:0,type:'active',source:'legacy',coefficient:Math.max(0,n('skillCoef')),stat:'ATK',hit:1,hitCount:1,activeSource:true}];
    const skillTentacleCoef=Math.max(0,Number(skillSync.tentacleCoefficient)||0)/100;
    const skillTriggerPct=skillSync.triggeredTentaclePercent===null||skillSync.triggeredTentaclePercent===undefined
      ?0:Math.max(0,Number(skillSync.triggeredTentaclePercent))/100;
    const propagationTentacleEffectMult=realm.propagationApplies
      ?1+Math.max(0,Number(realm.propagationFiestaStacks)||0)/100:1;
    const propagationFixedEffectMult=propagationTentacleEffectMult;
    const soulforgeFlat=progression.soulforgeEnabled
      ?attack*Math.max(0,Number(progression.flatAtkDamagePct)||0)/100:0;
    const soulforgeBasePct=progression.soulforgeEnabled
      ?Math.max(0,Number(progression.baseDamagePct)||0):0;
  
    const basePct=n('baseBonus')+soulforgeBasePct;
    const powerPct=n('powerBonus')+Math.max(0,Number(realm.teamDamageAmp)||0);
    const vulnerabilityPct=n('vulnerability')+($('buffVuln')?.checked?50:0);
    const weakCoef=$('buffWeak')?.checked?.75:1;
    const finalPct=n('finalBonus')+Math.max(0,Number(realm.finalDamageBonus)||0);
    const fortifyCoef=clamp(1-Math.max(0,n('fortressStacks'))/100,0,1);
    const other=Math.max(0,n('otherMultiplier',1));
    const activeCritRate=clamp(n('critRate')/100,0,1);
    const activeCritMult=Math.max(0,n('critDamage',150))/100;
    const tentacleCritRate=clamp(n('tentacleCritRate')/100,0,1);
    const tentacleCritMult=Math.max(0,n('tentacleCritDamage',150))/100;
    const mode=document.querySelector('.modeBtn[aria-pressed="true"]')?.dataset?.mode||'expected';
  
    function selectCrit(normal,rate,mult){
      const crit=normal*mult,expected=normal*(1-rate)+crit*rate;
      return {normal,crit,expected,damage:({normal,crit,expected}[mode]??expected)};
    }
    function statValue(stat){
      if(stat==='DEF')return effectiveDef;
      if(stat==='CON')return effectiveCon;
      return attack;
    }
    function scaledEvent(source,repeatIndex,eventIndex){
      const type=source.type==='pierce'?'pierce':'active';
      const coeff=Math.max(0,Number(source.coefficient)||0)/100;
      const strengthPart=(type==='active'||source.usesStrength===true)?netStrength:0;
      const raw=statValue(source.stat)*coeff
        +strengthPart
        +tentacleWithStrength*skillTentacleCoef*propagationTentacleEffectMult
        +soulforgeFlat;
      const afterBase=raw*(1+basePct/100);
      const afterPower=afterBase*(1+powerPct/100);
      // SKeyDB Vulnerable / Weakness explicitly affect Active DMG and Tentacle DMG, not Pierce/Pure/Fixed.
      const afterVulnerability=type==='active'?afterPower*(1+vulnerabilityPct/100):afterPower;
      const afterFinal=afterVulnerability*(1+finalPct/100)*(type==='active'?weakCoef:1);
      const normal=afterFinal*levelFactor*fortifyCoef*other;
      const critState=selectCrit(normal,activeCritRate,activeCritMult);
      return {
        id:`skill-${repeatIndex+1}-${eventIndex+1}`,
        type,
        source:'skill',
        groupId:source.groupId||null,
        repeatIndex,
        label:type==='pierce'?`Pierce DMG ${eventIndex+1}`:`Active DMG ${eventIndex+1}`,
        coefficient:Number(source.coefficient)||0,
        stat:source.stat||'ATK',
        raw,
        ignoresBarrier:type==='pierce',
        activeSource:true,
        ...critState
      };
    }
    function tentacleEvent(percent,label,id){
      const scale=Math.max(0,Number(percent)||0)/100;
      const raw=tentacleWithStrength*scale;
      const normal=raw*(1+powerPct/100)*(1+vulnerabilityPct/100)*weakCoef*levelFactor*fortifyCoef*other;
      const critState=selectCrit(normal,tentacleCritRate,tentacleCritMult);
      return {id,type:'tentacle',source:'tentacle',label,percent:Number(percent)||0,raw,activeSource:false,...critState};
    }
    function tentaclePierceEvent(percent,label,id){
      const scale=Math.max(0,Number(percent)||0)/100;
      const raw=tentacleWithStrength*scale;
      // This event is Pierce DMG even though its basis is Tentacle DMG, so Vulnerable/Weakness do not apply.
      const normal=raw*(1+powerPct/100)*levelFactor*fortifyCoef*other;
      const critState=selectCrit(normal,tentacleCritRate,tentacleCritMult);
      return {id,type:'pierce',source:'tentacle',basis:'tentacle',label,percent:Number(percent)||0,raw,ignoresBarrier:true,activeSource:false,...critState};
    }
    function pureEvent(raw,label,id,type='pure',extra={}){
      const beforeFortress=Math.max(0,Number(raw)||0);
      const damage=beforeFortress*fortifyCoef;
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
      const damage=raw*fortifyCoef;
      return {
        id,type:'fixed',source:'skill',label:'Fixed DMG',basis:source.basis,
        percent:source.percent,amount:source.amount,stat:source.stat||null,
        raw,normal:damage,crit:damage,expected:damage,damage,
        canCrit:false,fixed:true
      };
    }
  
    const events=[];
    const groupDamage=new Map();
    let corrosionRemaining=Math.max(0,n('corrosionAmount'));
    let embersRemaining=Math.max(0,n('embersAmount'));
    let corrosionDamage=0,embersDamage=0;
    let poisonAdded=0,counterAdded=0;
    const initialPoison=Math.max(0,n('currentPoison'));
    let counterCurrent=Math.max(0,n('currentCounter'));

    function groupKey(repeatIndex,groupId){return `${repeatIndex}:${groupId||''}`}
    function pushDamageEvent(event){
      events.push(event);
      if(event.groupId&&event.damage>0){
        const key=groupKey(event.repeatIndex??0,event.groupId);
        groupDamage.set(key,(groupDamage.get(key)||0)+event.damage);
      }
      if(!(event.damage>0)||event.type==='reaction')return;
      const removalRate=(event.type==='active'||event.type==='tentacle')?1:0.5;
      const corrosionUsed=Math.min(corrosionRemaining,event.damage*removalRate);
      if(corrosionUsed>0){
        corrosionRemaining-=corrosionUsed;
        const reaction={id:event.id+'-corrosion',type:'reaction',reaction:'corrosion',sourceEventId:event.id,label:`侵蚀追加生命损失（${removalRate===1?'等量':'其他伤害 50%'}消费）`,consumed:corrosionUsed,damage:corrosionUsed*3};
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
      if(source.basis==='sourceDamage'){
        const damage=groupDamage.get(groupKey(repeat,source.sourceGroupId))||0;
        return Math.max(0,damage*Math.max(0,Number(source.percent)||0)/100);
      }
      let amount=0;
      if(source.basis==='statPercent')amount=statValue(source.stat)*Math.max(0,Number(source.percent)||0)/100;
      else if(source.basis==='flat')amount=Math.max(0,Number(source.amount)||0);
      // Propagation Fiesta enhances Fixed Poison / Counter on the next Exalt; sourceDamage-proportional effects are not "Fixed".
      if((source.type==='poison'||source.type==='counter')&&source.basis!=='sourceDamage')amount*=propagationFixedEffectMult;
      return Math.max(0,amount);
    }

    let scaledIndex=0,tentacleIndex=0,pureIndex=0,poisonIndex=0,counterIndex=0;
    for(let repeat=0;repeat<sequenceRepeat;repeat++){
      for(const source of sourceSkillEvents){
        if(source.type==='pierce'&&source.basis==='tentacle'){
          const count=Math.max(0,Math.floor(n('tentacleCount',1)))*Math.max(1,Math.floor(Number(source.attacksPerTentacle)||1));
          for(let i=0;i<count;i++){
            const event=tentaclePierceEvent(source.percent,`触腕 Pierce DMG ${i+1}`,`tentacle-pierce-${++tentacleIndex}`);
            event.repeatIndex=repeat;
            pushDamageEvent(event);
          }
          continue;
        }
        if(source.type==='active'||source.type==='pierce'){
          const event=scaledEvent(source,repeat,scaledIndex++);
          pushDamageEvent(event);
          if(event.type==='active'&&$('tentacleStance')?.value==='raging'&&event.damage>0){
            pushDamageEvent(tentacleEvent(tentacle.ragingTriggerPct,'怒涛 · Active DMG 后触腕',`raging-${++tentacleIndex}`));
          }
          continue;
        }
        if(source.type==='fixed'){
          pushDamageEvent(fixedEvent(source,`fixed-${++pureIndex}`));
          continue;
        }
        if(source.type==='pure'){
          const raw=source.basis==='targetMaxHp'?enemyMaxHp*Math.max(0,Number(source.percent)||0)/100:0;
          pushDamageEvent(pureEvent(raw,`Pure DMG · 目标最大生命 ${Number(source.percent||0).toFixed(2)}%`,`pure-${++pureIndex}`,'pure',{basis:source.basis,percent:source.percent}));
          continue;
        }
        if(source.type==='poison'&&source.action==='apply'){
          const amount=appliedStatusAmount(source,repeat);
          poisonAdded+=amount;
          events.push({
            id:`poison-apply-${++poisonIndex}`,type:'poison',action:'apply',
            label:source.basis==='sourceDamage'
              ?`Poison 施加 · 来源伤害 ${Number(source.percent||0).toFixed(2)}%`
              :`Poison 施加 · ${source.stat?source.stat+' × '+Number(source.percent||0).toFixed(2)+'%':fmt(amount)}`,
            amount,damage:0,sourceGroupId:source.sourceGroupId||null
          });
          continue;
        }
        if(source.type==='poison'&&source.action==='trigger'){
          const stacks=initialPoison+poisonAdded;
          const raw=stacks*Math.max(0,Number(source.percent)||0)/100;
          pushDamageEvent(pureEvent(raw,`Poison 触发 ${Number(source.percent||0).toFixed(2)}%`,`poison-trigger-${++poisonIndex}`,'poison',{action:'trigger',stacks,percent:source.percent}));
          continue;
        }
        if(source.type==='counter'&&source.action==='gain'){
          const amount=appliedStatusAmount(source,repeat);
          counterCurrent+=amount;counterAdded+=amount;
          events.push({
            id:`counter-gain-${++counterIndex}`,type:'counter',action:'gain',
            label:`Counter 获得 +${fmt(amount)}`,amount,damage:0
          });
          continue;
        }
        if(source.type==='counter'&&source.action==='trigger'){
          const raw=counterCurrent*Math.max(0,Number(source.percent)||0)/100;
          pushDamageEvent(pureEvent(raw,`Counter 触发 ${Number(source.percent||0).toFixed(2)}%`,`counter-trigger-${++counterIndex}`,'counter',{action:'trigger',stacks:counterCurrent,percent:source.percent}));
        }
      }
      if(skillTriggerPct>0){
        pushDamageEvent(tentacleEvent(skillTriggerPct*100,'技能触发触腕',`skill-tentacle-${++tentacleIndex}`));
      }
    }

    const includeTurnEnd=$('includeTurnEndTentacle')?.checked===true&&tentacle.turnEndAllowed!==false;
    const turnEndCount=Math.max(0,Math.floor(n('tentacleCount',1)))*Math.max(0,Math.floor(n('tentacleAttackTimes',1)));
    if(includeTurnEnd){
      for(let i=0;i<turnEndCount;i++)pushDamageEvent(tentacleEvent(100,`回合末触腕 ${i+1}`,`turn-end-${++tentacleIndex}`));
    }
  
    if($('includePoisonTurnEnd')?.checked===true&&(initialPoison+poisonAdded)>0){
      const stacks=initialPoison+poisonAdded;
      pushDamageEvent(pureEvent(stacks,'Poison · 回合末 Pure DMG',`poison-turn-end-${++poisonIndex}`,'poison',{action:'turn_end',stacks}));
    }
  
    const activeEvents=events.filter(x=>x.type==='active');
    const pierceEvents=events.filter(x=>x.type==='pierce');
    const tentacleEvents=events.filter(x=>x.type==='tentacle');
    const pureEvents=events.filter(x=>x.type==='pure');
    const fixedEvents=events.filter(x=>x.type==='fixed');
    const poisonEvents=events.filter(x=>x.type==='poison'&&x.damage>0);
    const counterEvents=events.filter(x=>x.type==='counter'&&x.damage>0);
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
    const counterTotal=counterEvents.reduce((s,x)=>s+x.damage,0);
    const total=events.reduce((s,x)=>s+(Number(x.damage)||0),0);
    const projectedTurnEnd=tentacleEvent(100,'回合末触腕预览','preview').damage*turnEndCount;
  
    const label={normal:'非暴击',crit:'暴击',expected:'期望'}[mode];
    $('resultLabel').textContent=`${$('charSelect')?.selectedOptions?.[0]?.textContent||'角色'} · ${label}总伤害`;
    $('resultNumber').textContent=fmt(total);
    $('normalLine').textContent=`可暴击 Active/Pierce 非暴击合计：${fmt(activeNormal)}`;
    $('critLine').textContent=`可暴击 Active/Pierce 暴击合计：${fmt(activeCrit)}`;
    $('expectedLine').textContent=`可暴击 Active/Pierce 期望合计：${fmt(activeExpected)}`;
  
    $('formula').textContent=`Damage Events：Active/Pierce/Tentacle 使用通用等级系数 ${levelFactor.toFixed(3)}，再经过加固；Pierce 忽略 Barrier。Vulnerable / Weakness 按 SKeyDB 只作用于 Active 与 Tentacle；Pierce 不套这两项。Pure / Fixed / Poison / Counter 不暴击、不使用通用等级系数，仅保留明确的加固承伤修正。侵蚀/旧日余烬按 SKeyDB：Active/Tentacle 等量消费，其他伤害按 50% 消费。`;
  
    const rows=events.map((event,index)=>{
      if(event.type==='reaction')return [`${index+1}. ${event.label}（消费 ${fmt(event.consumed)}）`,event.damage];
      if((event.type==='poison'||event.type==='counter')&&(event.action==='apply'||event.action==='gain'))return [`${index+1}. ${event.label}`,0];
      const tags={active:'Active',pierce:'Pierce',tentacle:'Tentacle',pure:'Pure',fixed:'Fixed',poison:'Poison',counter:'Counter'};
      const detail=`${tags[event.type]||event.type} · ${event.label||''}`;
      return [`${index+1}. ${detail}`,event.damage||0];
    });
    rows.unshift(['敌人估算最大生命',enemyMaxHp]);
    rows.unshift(['敌人等级通用承伤系数',levelFactor]);
    rows.unshift(['界域修正后攻击力',attack]);
    rows.push(['Active DMG 合计',activeTotal]);
    rows.push(['Pierce DMG 合计',pierceTotal]);
    rows.push(['Tentacle DMG 合计',tentacleTotal]);
    rows.push(['Pure DMG 合计',pureTotal]);
    rows.push(['Fixed DMG 合计',fixedTotal]);
    rows.push(['Poison DMG 合计',poisonTotal]);
    rows.push(['Counter DMG 合计',counterTotal]);
    if(!includeTurnEnd&&turnEndCount>0)rows.push(['回合末触腕预览（未计入总伤害）',projectedTurnEnd]);
    rows.push(['侵蚀追加生命损失合计',corrosionDamage]);
    rows.push(['旧日余烬追加生命损失合计',embersDamage]);
    rows.push(['侵蚀剩余',corrosionRemaining]);
    rows.push(['旧日余烬剩余',embersRemaining]);
    rows.push(['最终 Poison 层数',initialPoison+poisonAdded]);
    rows.push(['本次新增 Counter',counterAdded]);
    rows.push(['最终 Counter',counterCurrent]);
    rows.push(['本次合计',total]);
    $('breakdown').innerHTML=rows.map(([a,b])=>`<div class="step"><span>${esc(a)}</span><strong>${typeof b==='number'&&Math.abs(b)<10&&a.includes('系数')?b.toFixed(3):fmt(b)}</strong></div>`).join('');
  
    const tmode=effectiveTentacleMode();
    const stance=tmode==='benthos'
      ?({surging:'涨潮 100%',tranquil:'静海（回合末不攻击）',raging:'怒涛 125%' }[$('tentacleStance')?.value]||'')
      :({surging:'涨潮 100%',tranquil:'静海 50%',raging:'怒涛 125%'}[$('tentacleStance')?.value]||'');
    const oneTentacle=tentacleEvent(100,'单次触腕预览','preview');
    if($('tentacleReadout')){
      const model=tmode==='benthos'?'深渊深海':'普通深海 / 普通触腕';
      const coexist=tentacle.coexistenceBase?`，混沌共生额外基础触腕 ${fmt(tentacle.coexistenceBase)}`:'';
      const pureNote=(realm.startingTentacleMultiplier||1)>1?'；至纯深海使初始触腕数翻倍（当前触腕数仍以手动输入为准）':'';
      $('tentacleReadout').innerHTML=`体系：<b>${model}</b> · 姿态：<b>${stance}</b> · 界域精通效果倍率 <b>×${Number(tentacle.masteryEffectMultiplier||1).toFixed(1)}</b>${tentacle.ragingWheelBonusPct?` · 怒涛命轮临时精通 <b>+${Number(tentacle.ragingWheelBonusPct).toFixed(1)}%</b>（${fmt(tentacle.baseRealmMastery)} → ${fmt(tentacle.realmMasteryForStance)}）`:''}<br>机制基础触腕 <b>${fmt(tentacle.base)}</b>${coexist} → 姿态/精通后 <b>${fmt(tentacle.attack)}</b> → 加入 50% 净力量后 <b>${fmt(tentacleWithStrength)}</b> → 当前模式单次伤害 <b>${fmt(oneTentacle.damage)}</b>。触腕暴击率 <b>${(tentacleCritRate*100).toFixed(1)}%</b> / 暴击伤害 <b>${(tentacleCritMult*100).toFixed(1)}%</b>${pureNote}。`;
    }
    if($('enemyLevelReadout')){
      $('enemyLevelReadout').innerHTML=`敌人等级 <b>${enemyProfile.level}</b> · 通用承伤系数 <b>${levelFactor.toFixed(3)}</b> · 估算最大生命 <b>${fmt(enemyMaxHp)}</b><br><small>最大生命由 SKeyDB D-Zone 60–69 期共 1665 个等级/HP 样本作对数拟合，仅用于通用计算与目标最大生命型 Pure DMG；等级承伤系数不是官方 DEF 公式。</small>`;
    }
    if($('combatConversion')){
      const enlightenLabel={OverExalt:'+4 超限',AbsoluteAxiom:'最终法则'}[skillSync.enlightenSlot]||skillSync.enlightenSlot||'E0';
      $('combatConversion').innerHTML=`界域：<b>${esc(realm.label||'普通')}</b>；攻击 <b>${fmt(attackRaw)}</b> → <b>${fmt(attack)}</b>。事件：Active <b>${activeEvents.length}</b> / Pierce <b>${pierceEvents.length}</b> / Tentacle <b>${tentacleEvents.length}</b> / Pure <b>${pureEvents.length}</b> / Fixed <b>${fixedEvents.length}</b> / Poison <b>${poisonEvents.length}</b> / Counter <b>${counterEvents.length}</b>。启灵：<b>${esc(enlightenLabel)}</b>。`;
    }
    window.MorimensDamageEvents={
      mode,
      enemyProfile,
      sourceSkillEvents,
      events,
      totals:{
        active:activeTotal,pierce:pierceTotal,tentacle:tentacleTotal,pure:pureTotal,fixed:fixedTotal,
        poison:poisonTotal,counter:counterTotal,corrosion:corrosionDamage,embers:embersDamage,total
      },
      status:{poisonInitial:initialPoison,poisonAdded,poisonFinal:initialPoison+poisonAdded,counterInitial:Math.max(0,n('currentCounter')),counterAdded,counterFinal:counterCurrent},
      remaining:{corrosion:corrosionRemaining,embers:embersRemaining}
    };
  }

  function resetEnemy(){
    const values={
      realmMastery:0,tentacleMode:'standard',tentacleStance:'surging',currentTentacleDamage:0,teamMaxHp:0,
      tentacleExtraBonus:0,tentacleCritRate:0,tentacleCritDamage:150,strengthDown:0,
      tentacleCount:1,tentacleAttackTimes:1,enemyLevel:77,fortressStacks:0,currentPoison:0,currentCounter:0,
      corrosionAmount:0,embersAmount:0,realmPrimary:'auto',realmSecondary:'',realmChaosCount:1
    };
    for(const [id,v] of Object.entries(values))if($(id))$(id).value=String(v);
    if($('propagationConsumeEmbryo'))$('propagationConsumeEmbryo').checked=false;
    if($('propagationApplyFiesta'))$('propagationApplyFiesta').checked=true;
    if($('includeTurnEndTentacle'))$('includeTurnEndTentacle').checked=false;
    if($('includePoisonTurnEnd'))$('includePoisonTurnEnd').checked=true;
    window.MorimensRealmEngine?.render?.();
    toggleTentacleMode();
    setTimeout(()=>window.MorimensStatsSync?.updateCharacterStats?.(),20);
    calculate();
  }

  window.MorimensCombatCalculator={calculate,renderTriplet,tentacleState,renderFormulaSource};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(inject,0));else setTimeout(inject,0);
  window.addEventListener('morimens-data-ready',()=>setTimeout(()=>{renderTriplet();calculate()},100));
})();

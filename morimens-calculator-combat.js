(()=>{
  const $=id=>document.getElementById(id);
  const n=(id,f=0)=>{const v=Number.parseFloat($(id)?.value);return Number.isFinite(v)?v:f};
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  const fmt=v=>Math.round(v).toLocaleString('zh-CN');
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function statAt(rec,key,level){return Math.floor((Number(rec?.baseStatsLv1?.[key])||0)+(Number(rec?.statScaling?.[key])||0)*(level-1)+1e-7)}
  function inject(){
    if($('combatModel')||!$('calcBtn'))return;
    const first=$('charSelect')?.closest('.builderBlock');
    if(first){
      const stats=document.createElement('div');stats.id='characterTriplet';stats.className='combatStats';stats.innerHTML='<div><small>体质 CON</small><strong id="combatCon">—</strong></div><div><small>攻击 ATK</small><strong id="combatAtk">—</strong></div><div><small>防御 DEF</small><strong id="combatDef">—</strong></div>';
      first.querySelector('.formGrid')?.insertAdjacentElement('afterend',stats);
    }
    const block=document.createElement('div');block.className='builderBlock';block.id='combatModel';block.innerHTML=`
      <div class="builderTitle"><span>⑥ 敌方属性与异常伤害</span><small>SKeyDB 状态定义</small></div>
      <div class="formGrid">
        <div class="field"><label for="enemyDefense">敌方防御力</label><input id="enemyDefense" type="number" min="0" step="1" value="0"></div>
        <div class="field"><label for="defenseMode">防御换算</label><select id="defenseMode"><option value="manual">使用手动实测系数</option><option value="curve">可校准曲线 K ÷ (K + DEF)</option></select></div>
        <div class="field"><label for="defenseConstant">防御常数 K</label><input id="defenseConstant" type="number" min="1" step="1" value="1000"><small>仅用于可校准曲线；公开资料未给出官方常数。</small></div>
        <div class="field"><label for="fortressStacks">加固层数</label><input id="fortressStacks" type="number" min="0" max="100" step="1" value="0"><small>每层承伤降低 1%。</small></div>
        <div class="field"><label for="corrosionAmount">侵蚀层数 / 数值</label><input id="corrosionAmount" type="number" min="0" step="1" value="0"><small>主动伤害消耗等量侵蚀，追加消耗量 300% 的生命损失。</small></div>
        <div class="field"><label for="embersAmount">旧日余烬层数 / 数值</label><input id="embersAmount" type="number" min="0" step="1" value="0"><small>主动伤害消耗等量余烬，追加消耗量 300% 的生命损失。</small></div>
      </div>
      <div class="combatReadout" id="combatConversion"></div>`;
    $('combatModel')?.remove();
    $('calcBtn').closest('.panel')?.querySelector('.builder')?.appendChild(block);
    const style=document.createElement('style');style.textContent='.combatStats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}.combatStats>div,.combatReadout{padding:10px 12px;border:1px solid rgba(148,163,184,.14);border-radius:11px;background:rgba(2,6,23,.25)}.combatStats small{display:block;color:#8290a4;font-size:10px}.combatStats strong{display:block;margin-top:3px;color:#f1e0bf;font-size:18px}.combatReadout{margin-top:10px;color:#aeb8c7;font-size:11px;line-height:1.7}.combatReadout b{color:#f1e0bf}@media(max-width:580px){.combatStats{grid-template-columns:1fr 1fr 1fr}}';document.head.appendChild(style);
    for(const id of ['enemyDefense','defenseMode','defenseConstant','fortressStacks','corrosionAmount','embersAmount'])$(id)?.addEventListener('input',calculate);
    document.addEventListener('input',e=>{if(e.target?.closest?.('.panel')&&e.target?.id!=='fortuneBtn')queueMicrotask(calculate)});
    document.addEventListener('change',()=>queueMicrotask(()=>{renderTriplet();calculate()}));
    $('calcBtn')?.addEventListener('click',()=>queueMicrotask(calculate));
    document.querySelectorAll('.modeBtn').forEach(button=>button.addEventListener('click',()=>queueMicrotask(calculate)));
    document.addEventListener('click',event=>{if(event.target?.id==='resetBtn')setTimeout(resetEnemy,30)},true);
    renderTriplet();calculate();setTimeout(()=>{renderTriplet();calculate()},500);
  }
  function renderTriplet(){
    const rec=window.MorimensCharacterSync?.record,levelInput=$('charLevel')||$('skeydbCharacterLevel'),level=clamp(Number.parseFloat(levelInput?.value)||90,1,90);if(!rec)return;
    if($('combatCon'))$('combatCon').textContent=fmt(statAt(rec,'CON',level));
    if($('combatAtk'))$('combatAtk').textContent=fmt(statAt(rec,'ATK',level));
    if($('combatDef'))$('combatDef').textContent=fmt(statAt(rec,'DEF',level));
  }
  function calculate(){
    if(!$('combatModel')||!$('resultNumber'))return;renderTriplet();
    const attack=Math.max(0,n('attack')),coef=Math.max(0,n('skillCoef'))/100,hits=Math.max(1,Math.floor(n('hitCount',1)));
    let strength=n('strength');if($('buffBrute')?.checked)strength+=8;if($('buffBurst')?.checked)strength+=66;
    const baseRaw=(attack*coef+strength)*hits;
    const base=baseRaw*(1+n('baseBonus')/100);
    const powered=base*(1+n('powerBonus')/100);
    const vuln=powered*(1+(n('vulnerability')+($('buffVuln')?.checked?50:0))/100);
    const final=vuln*(1+n('finalBonus')/100)*($('buffWeak')?.checked ? .75 : 1);
    const enemyDef=Math.max(0,n('enemyDefense')),k=Math.max(1,n('defenseConstant',1000));
    const defenseCoef=$('defenseMode')?.value==='curve'?k/(k+enemyDef):Math.max(0,n('defenseFactor',100))/100;
    const fortifyCoef=clamp(1-Math.max(0,n('fortressStacks'))/100,0,1);
    const normal=final*defenseCoef*fortifyCoef*Math.max(0,n('otherMultiplier',1));
    const critRate=clamp(n('critRate')/100,0,1),critMult=Math.max(0,n('critDamage',150))/100;
    const crit=normal*critMult,expected=normal*(1-critRate)+crit*critRate;
    const mode=document.querySelector('.modeBtn[aria-pressed="true"]')?.dataset?.mode||'expected';
    const direct={normal,crit,expected}[mode]??expected;
    const corrosionUsed=Math.min(Math.max(0,n('corrosionAmount')),direct),embersUsed=Math.min(Math.max(0,n('embersAmount')),direct);
    const corrosionDamage=corrosionUsed*3,embersDamage=embersUsed*3,total=direct+corrosionDamage+embersDamage;
    const label={normal:'非暴击',crit:'暴击',expected:'期望'}[mode];
    $('resultLabel').textContent=`${$('charSelect')?.selectedOptions?.[0]?.textContent||'角色'} · ${label}总伤害`;
    $('resultNumber').textContent=fmt(total);$('normalLine').textContent=`非暴击直伤：${fmt(normal)}`;$('critLine').textContent=`暴击直伤：${fmt(crit)}`;$('expectedLine').textContent=`期望直伤：${fmt(expected)}`;
    $('formula').textContent=`[(ATK ${fmt(attack)} × 技能 ${coef.toFixed(3)} + 力量 ${fmt(strength)}) × ${hits}] × 基伤 ${(1+n('baseBonus')/100).toFixed(3)} × 强效 ${(1+n('powerBonus')/100).toFixed(3)} × 易伤 ${(1+(n('vulnerability')+($('buffVuln')?.checked?50:0))/100).toFixed(3)} × 终伤 ${(1+n('finalBonus')/100).toFixed(3)} × 防御 ${defenseCoef.toFixed(3)} × 加固 ${fortifyCoef.toFixed(3)}；异常追加 = 已消耗层数 × 3`;
    const rows=[['技能基础项',baseRaw],['基础伤害转化后',base],['伤害强效转化后',powered],['易伤与最终增伤后',final],['敌方防御与加固后直伤',direct],['侵蚀追加生命损失',corrosionDamage],['旧日余烬追加生命损失',embersDamage],['本次合计',total]];
    $('breakdown').innerHTML=rows.map(([a,b])=>`<div class="step"><span>${esc(a)}</span><strong>${fmt(b)}</strong></div>`).join('');
    if($('combatConversion'))$('combatConversion').innerHTML=`攻击侧：基伤 <b>${fmt(baseRaw)}</b> → 强效后 <b>${fmt(powered)}</b>；暴击率 <b>${(critRate*100).toFixed(1)}%</b>，暴伤 <b>${(critMult*100).toFixed(1)}%</b>。敌方：DEF <b>${fmt(enemyDef)}</b>，防御系数 <b>${(defenseCoef*100).toFixed(1)}%</b>，加固后系数 <b>${(fortifyCoef*100).toFixed(1)}%</b>。`;
  }
  function resetEnemy(){for(const [id,v] of Object.entries({enemyDefense:0,defenseMode:'manual',defenseConstant:1000,fortressStacks:0,corrosionAmount:0,embersAmount:0}))if($(id))$(id).value=String(v);calculate()}
  window.MorimensCombatCalculator={calculate,renderTriplet};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(inject,0));else setTimeout(inject,0);
  window.addEventListener('morimens-data-ready',()=>setTimeout(()=>{renderTriplet();calculate()},100));
})();

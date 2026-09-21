(()=>{
  const $=id=>document.getElementById(id);
  const isEnglish=()=>localStorage.getItem('morimens.language')==='en';
  const recordCache=new Map();
  let currentAwakener=null,currentSkills=[],currentSkill=null,currentTalents=[],currentEnlightens=[];
  let wheelCatalog=[],covenantCatalog=[],posseCatalog=[],gameplayMathMeta=null,currentWheels=[null,null],currentCovenant=null;
  let applyingAuto=false;
  const auto={base:0,power:0,critRate:0,critDamage:0,vulnerability:0,final:0};
  const trackedFields={base:'baseBonus',power:'powerBonus',critRate:'critRate',critDamage:'critDamage',vulnerability:'vulnerability',final:'finalBonus'};
  const zhCovenants={'April Tribute':'四月礼赞','Re-evolution':'再衍化','Crimson Pulse':'猩红之悸'};

  function data(){return window.MorimensData}
  function recordById(id){return data()?.db?.records?.find(x=>x.id===id)||null}
  function zhFor(rec){return data()?.zhFor?.(rec)||data()?.zhDb?.bySkeydbId?.[rec?.id]||data()?.identityDb?.bySkeydbId?.[rec?.id]||null}
  function labelForAwakener(rec){return isEnglish()?rec.name:(zhFor(rec)?.name||rec.name)}
  function labelForWheel(rec){return data()?.localizedEntity?.('wheel',rec)?.name||rec?.name||''}
  function escape(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function selectedAwakenerId(){return $('charSelect')?.selectedOptions?.[0]?.dataset?.awakenerId||$('charSelect')?.value||null}
  function num(v,fallback=0){const n=Number.parseFloat(v);return Number.isFinite(n)?n:fallback}
  function setText(id,text){const el=$(id);if(el)el.textContent=text}

  async function fetchRecord(scope,id){
    const key=`${scope}:${id}`;if(recordCache.has(key))return recordCache.get(key);
    const p=window.MorimensRepository.record(scope,id);recordCache.set(key,p);try{return await p}catch(e){recordCache.delete(key);throw e}
  }
  function currentFormulaContext(extra={}){
    const level=Math.max(1,Math.min(90,Number(characterLevelControl()?.value)||90));
    const engine=window.MorimensFormulaEngine;
    const base=currentAwakener&&engine?engine.statsWithProgression(currentAwakener,level,progressionState()):{};
    if($('realmMastery'))base.RealmMastery=num($('realmMastery').value,base.RealmMastery||0);
    if($('powerBonus'))base.DamageAmplification=num($('powerBonus').value,base.DamageAmplification||0);
    if($('critRate'))base.CritRate=num($('critRate').value,base.CritRate||0);
    if($('critDamage'))base.CritDamage=Math.max(0,num($('critDamage').value,100+num(base.CritDamage,50))-100);
    base.realmMasteryFinal=Math.max(0,num(base.RealmMastery,0));
    base.accountLevel=Math.max(1,Math.floor(num($('formulaAccountLevel')?.value,50)));
    base.ownedPosseCount=Math.max(0,posseCatalog.length);
    const wheelStages=[1,2].map(i=>Math.max(0,Math.floor(num($(`fateLevel${i}`)?.value,0))));
    base.wheelRefinementLevel=Math.max(0,Math.min(3,Math.max(...wheelStages,0)));
    const realm=window.MorimensRealmEngine?.state?.();
    if(realm){
      base.primordiaAllChaosTeam=realm.primordiaAllChaosTeam===true;
      base.ATK=(Number(base.ATK)||0)*(Number(realm.atkMultiplier)||1);
      base.DEF=(Number(base.DEF)||0)*(Number(realm.defMultiplier)||1);
    }
    return engine?.publicFormulaContext?.({...base,...extra})||{...base,...extra};
  }
  function argValue(arg,level=1,ctxExtra={}){
    if(!arg)return null;
    const engine=window.MorimensFormulaEngine;
    if(engine){
      const value=engine.resolveArg(arg,level,currentFormulaContext(ctxExtra));
      return value===null?null:String(value);
    }
    if(Array.isArray(arg.values)&&arg.values.length)return arg.values[Math.min(Math.max(level-1,0),arg.values.length-1)];
    if(arg.value!==undefined)return arg.value;
    if(arg.base!==undefined){const base=num(arg.base),gain=num(arg.gainPerLevel);return String(base+gain*Math.max(0,level-1))}
    return null;
  }
  function maxArgLevel(record){let n=1;for(const arg of Object.values(record?.descriptionArgs||{})){if(Array.isArray(arg?.values))n=Math.max(n,arg.values.length)}return n}
  const slotZh={Strike:'打击',Defense:'防御',Rouse:'灵知觉醒',Skill1:'技能卡一',Skill2:'技能卡二',Exalt:'狂气爆发',OverExalt:'超限爆发'};const slotOrder={Strike:1,Defense:2,Rouse:3,Skill1:4,Skill2:5,Exalt:6,OverExalt:7};
  const phraseZh=[
    [/This talent is only effective in the (?:\\{)?星辰篇(?:\\})? stages\\./gi,'该天赋仅在「星辰篇」关卡中生效。'],
    [/This Awakener's/gi,'该唤醒体的'],[/The Awakener's/gi,'该唤醒体的'],[/Awakener/gi,'唤醒体'],
    [/upon their first (?:\\{)?Rouse(?:\\})?/gi,'首次进行灵知觉醒时'],[/they gain/gi,'并获得'],
    [/Keyflare Regen Level/gi,'银钥充能等级'],[/Keyflare Regen/gi,'银钥充能'],[/Keyflare/gi,'银钥能量'],
    [/Aliemus/gi,'狂气'],[/Arithmetica Harmony/gi,'算力协调'],[/Arithmetica/gi,'算力'],[/STR▼/gi,'力量降低'],[/STR/gi,'力量'],
    [/Vulnerable/gi,'易伤'],[/Weakness/gi,'虚弱'],[/Poison/gi,'中毒'],[/Counter/gi,'反击'],[/Bleed/gi,'流血'],
    [/Leap/gi,'跃迁'],[/Exhaust/gi,'消耗'],[/Retain/gi,'保留'],[/Prepare/gi,'预备'],
    [/Tentacle DMG/gi,'触腕伤害'],[/Realm Mastery/gi,'界域精通'],[/Damage Amplification/gi,'伤害强效'],
    [/Crit\. Rate/gi,'暴击率'],[/Crit\. DMG/gi,'暴击伤害'],[/Final DMG/gi,'最终伤害'],[/Base DMG/gi,'基础伤害'],
    [/Max HP/gi,'最大生命'],[/HP Recovery/gi,'生命回复'],[/Arithmetica Cost/gi,'算术值消耗'],
    [/all enemies/gi,'全体敌人'],[/highest HP enemy/gi,'生命最高的敌人'],[/Draw Pile/gi,'抽牌堆'],[/Discard Pile/gi,'弃牌堆'],
    [/at turn end/gi,'回合结束时'],[/at turn start/gi,'回合开始时'],[/at battle start/gi,'战斗开始时'],
    [/this turn/gi,'本回合'],[/this battle/gi,'本场战斗'],[/each turn/gi,'每回合'],[/per turn/gi,'每回合'],
    [/first Command Card/gi,'第一张指令卡'],[/Command Card/gi,'指令卡'],[/cards?/gi,'卡牌'],
    [/dealing Active DMG/gi,'造成主动伤害后'],[/Active DMG/gi,'主动伤害'],[/deals?/gi,'造成'],[/causes?/gi,'造成'],
    [/obtains?/gi,'获得'],[/gains?/gi,'获得'],[/increase(?:s|d)?/gi,'提高'],[/reduce(?:s|d)?/gi,'降低'],
    [/generate(?:s|d)?/gi,'生成'],[/trigger(?:s|ed)?/gi,'触发'],[/shuffle/gi,'洗入'],[/draw/gi,'抽取'],
    [/into hand/gi,'置入手牌'],[/into the top of your Draw Pile/gi,'置于抽牌堆顶'],[/to all enemies/gi,'对全体敌人'],
    [/enemy/gi,'敌人'],[/Turn/gi,'回合'],[/Battle/gi,'战斗'],[/Temporary/gi,'临时'],[/Permanent/gi,'永久'],
    [/Surging Tides/gi,'涨潮'],[/Tranquil Sea/gi,'静海'],[/Raging Waves/gi,'怒涛'],[/Benthos: Aequor/gi,'深渊深海'],
    [/Aequor Realm/gi,'深海界域'],[/Aequor/gi,'深海'],[/Chaos/gi,'混沌'],[/Caro/gi,'血肉'],[/Ultra/gi,'超维'],
    [/Soulforge Aptitude/gi,'灵塑适性'],[/Gnostic Potential/gi,'内在灵格'],[/星辰篇/gi,'星辰篇'],
    [/Rouse/gi,'灵知觉醒'],[/Over-?Exalt/gi,'超限爆发'],[/Exalt/gi,'狂气爆发'],[/Defense/gi,'防御'],[/Strike/gi,'打击'],
    [/Shield/gi,'护盾'],[/Damage/gi,'伤害'],[/DMG/gi,'伤害'],[/ATK/gi,'攻击力'],[/DEF/gi,'防御'],[/CON/gi,'体质'],
    [/Crit/gi,'暴击'],[/Skill/gi,'技能'],[/Level/gi,'等级'],[/Base/gi,'基础'],[/Final/gi,'最终'],
    [/equal to/gi,'等同于'],[/additional/gi,'额外'],[/first/gi,'首次'],[/current/gi,'当前'],[/after/gi,'之后'],
    [/before/gi,'之前'],[/when/gi,'当'],[/if/gi,'若'],[/for every/gi,'每'],[/times/gi,'次'],[/time/gi,'次']
  ];
  function zhText(value){
    let out=String(value||'');
    if(currentAwakener?.name){
      const cn=labelForAwakener(currentAwakener);
      if(cn&&cn!==currentAwakener.name)out=out.split(currentAwakener.name).join(cn);
    }
    for(const [re,to] of phraseZh)out=out.replace(re,to);
    return out
      .replace(/\bof (?:her|his|their)\b/gi,'')
      .replace(/\b(?:her|his|their)\b/gi,'该唤醒体的')
      .replace(/\band\b/gi,'并且')
      .replace(/\bwith\b/gi,'并具有')
      .replace(/\bby\b/gi,'提高')
      .replace(/\bfrom\b/gi,'来自')
      .replace(/\s+/g,' ')
      .replace(/\s+([，。；：])/g,'$1')
      .trim();
  }
  function skillLabel(skill){const slot=slotZh[skill?.slot]||skill?.slot||'';return `${slot}${slot?' · ':''}${zhText(skill?.name||'技能')}`}
  function overExaltUnlocked(){const slot=selectedEnlightenSlot();return slot==='OverExalt'||slot==='AbsoluteAxiom'}
  function visibleSkills(){return currentSkills.filter(skill=>skill.slot!=='OverExalt'||overExaltUnlocked())}
  function renderSkillOptions(preferredId){
    const select=$('skillSelect');if(!select)return;
    const visible=visibleSkills(),wanted=visible.some(x=>x.id===preferredId)?preferredId:(visible.find(x=>x.slot==='Exalt')?.id||visible[0]?.id||'');
    select.innerHTML='';
    for(const skill of visible){const o=document.createElement('option');o.value=skill.id;o.textContent=skillLabel(skill);o.selected=skill.id===wanted;select.appendChild(o)}
    if(wanted)select.value=wanted;
  }
  function renderTemplate(record,level=1,ctxExtra={}){
    let text=record?.descriptionTemplate||record?.description||'';
    text=text.replace(/\[\{([^}]+)\}:([^\]]+)\]/g,(_,kind,name)=>{const arg=record?.descriptionArgs?.[name],v=argValue(arg,level,ctxExtra);if(v===null)return name;return `${arg?.stat?`${arg.stat} × `:''}${v}${arg?.suffix||''}`});
    text=text.replace(/\[([A-Za-z]+):([^\]]+)\]/g,(_,kind,name)=>{const arg=record?.descriptionArgs?.[name],v=argValue(arg,level,ctxExtra);if(v===null)return name;return `${arg?.stat?`${arg.stat} × `:''}${v}${arg?.suffix||''}`});
    text=text.replace(/\[([^\]]+)\]/g,(_,name)=>{const arg=record?.descriptionArgs?.[name],v=argValue(arg,level,ctxExtra);return v===null?name:`${v}${arg?.suffix||''}`});
    return text.replace(/\n/g,' ').replace(/\{([^}]+)\}/g,'$1');
  }
  function damageArgName(skill){return skill?.descriptionTemplate?.match(/\[Damage:([^\]]+)\]/)?.[1]||null}
  function damageCoefficient(skill,level){
    const engine=window.MorimensFormulaEngine;
    if(engine)return engine.directAtkCoefficient(skill,level,currentFormulaContext());
    const name=damageArgName(skill);if(!name)return 0;return num(argValue(skill?.descriptionArgs?.[name],level),0)
  }
  function maxSkillLevel(skill){let n=1;for(const arg of Object.values(skill?.descriptionArgs||{})){if(Array.isArray(arg?.values))n=Math.max(n,arg.values.length)}return n}
  const characterLevelControl=()=>$('charLevel')||$('skeydbCharacterLevel');
  function fillRange(select,label,max){
    if(!select)return;const previous=Math.min(max,Math.max(0,Number(select.value)||0));select.innerHTML='';
    for(let i=0;i<=max;i++){const option=document.createElement('option');option.value=String(i);option.textContent=`${i} · ${i===0?'未启用':label+' '+i}`;option.selected=i===previous;select.appendChild(option)}
  }
  function removeLegacyDeadControls(){
    const fateRank=$('fateRank')?.closest('.field');if(fateRank)fateRank.remove();
    const fateConditional=$('fateConditional')?.closest('.check');if(fateConditional){const grid=fateConditional.parentElement;fateConditional.remove();if(grid&&!grid.children.length)grid.remove()}
    $('fateRankSummary')?.remove();$('fateRankText')?.remove();
    const conditions=$('skillConditionList')?.closest('.conditionBox');if(conditions)conditions.remove();
    const damageMode=$('skillDamageMode')?.closest('.field');if(damageMode)damageMode.hidden=true;
    const legacyCoef=$('skillCoef')?.closest('.field');if(legacyCoef)legacyCoef.hidden=true;
  }
  function normalizeProgressionControls(){
    removeLegacyDeadControls();
    const legacy=$('charLevel'),duplicate=$('skeydbCharacterLevel');
    if(legacy&&duplicate&&legacy!==duplicate)duplicate.closest('.field')?.remove();
    const level=characterLevelControl();
    if(level?.tagName==='SELECT'){const previous=Math.min(90,Math.max(1,Number(level.value)||90));level.innerHTML='';for(let i=1;i<=90;i++){const option=document.createElement('option');option.value=String(i);option.textContent=`等级 ${i}`;option.selected=i===previous;level.appendChild(option)}}
    const innerField=$('innerSpirit')?.closest('.field');
    if(innerField){const label=innerField.querySelector('label');if(label)label.textContent='内在灵格';let note=innerField.querySelector('small');if(!note){note=document.createElement('small');innerField.appendChild(note)}note.textContent='按 SKeyDB“内在灵格”天赋换算为基础属性等级，再参与体质、攻击、防御成长公式。'}
    fillRange($('innerSpirit'),'内在灵格',5);
    if(!$('characterSculpt')){const inner=$('innerSpirit')?.closest('.field'),wrap=document.createElement('div');if(inner){wrap.className='field';wrap.innerHTML='<label for="characterSculpt">灵塑</label><select id="characterSculpt"></select><small>按 SKeyDB 灵塑适性计算主属性百分比与可明确解析的专属伤害效果。</small>';inner.insertAdjacentElement('afterend',wrap)}}
    if(!$('soulforgeActive')){const sculpt=$('characterSculpt')?.closest('.field'),wrap=document.createElement('div');if(sculpt){wrap.className='field full';wrap.innerHTML='<label class="inlineCheck"><input id="soulforgeActive" type="checkbox" checked> 按星辰篇关卡环境启用灵塑效果</label><small>灵塑天赋仅在“星辰篇”关卡生效；取消勾选后保留灵塑等级但不把其数值计入伤害。</small>';sculpt.insertAdjacentElement('afterend',wrap)}}
  }

  const ENLIGHTEN_ORDER=['E1','E2','E3','OverExalt','AbsoluteAxiom'];
  function selectedEnlightenSlot(){return $('charEnlighten')?.value||null}
  function activeEnlightens(){
    const selected=selectedEnlightenSlot();if(!selected)return [];
    const max=ENLIGHTEN_ORDER.indexOf(selected);if(max<0)return [];
    return currentEnlightens.filter(x=>{const i=ENLIGHTEN_ORDER.indexOf(x.slot);return i>=0&&i<=max}).sort((a,b)=>ENLIGHTEN_ORDER.indexOf(a.slot)-ENLIGHTEN_ORDER.indexOf(b.slot));
  }
  function cloneRecord(record){return record?JSON.parse(JSON.stringify(record)):record}
  function applyEnlightenPatch(record,upgrade){
    const patch=upgrade?.patch||{};let next=record;
    if(patch.descriptionTemplate!==undefined)next={...next,descriptionTemplate:patch.descriptionTemplate};
    if(patch.descriptionArgs)next={...next,descriptionArgs:{...(next.descriptionArgs||{}),...cloneRecord(patch.descriptionArgs)}};
    if(patch.argSubstatBonuses){
      const args=cloneRecord(next.descriptionArgs||{});
      for(const [key,bonus] of Object.entries(patch.argSubstatBonuses)){if(args[key])args[key]={...args[key],substatBonus:{...bonus}}}
      next={...next,descriptionArgs:args};
    }
    if(Array.isArray(patch.cardKeywords))next={...next,cardKeywords:cloneRecord(patch.cardKeywords)};
    if(Array.isArray(patch.removeCardKeywordIds)){const remove=new Set(patch.removeCardKeywordIds);next={...next,cardKeywords:(next.cardKeywords||[]).filter(x=>!remove.has(x.id))}}
    return next;
  }
  function resolveSkillEnlighten(baseSkill){
    if(!baseSkill)return baseSkill;let next=cloneRecord(baseSkill);
    const activeIds=new Set(activeEnlightens().map(x=>x.id));
    for(const upgrade of baseSkill.upgrades||[]){
      if(upgrade?.upgraderType!=='enlighten'||!activeIds.has(upgrade.upgraderId)||upgrade.operation==='link_only')continue;
      next=applyEnlightenPatch(next,upgrade);
    }
    return next;
  }
  function ensureEnlightenUi(){
    if($('charEnlighten'))return;
    const anchor=characterLevelControl()?.closest('.field')||$('innerSpirit')?.closest('.field');if(!anchor)return;
    const wrap=document.createElement('div');wrap.className='field';
    wrap.innerHTML='<label for="charEnlighten">角色启灵</label><select id="charEnlighten"><option value="">E0 · 未启灵</option></select><small>按 SKeyDB 累计应用：E2=E1+E2，E3=E1+E2+E3，+4 超限继续叠加 OverExalt，最终法则再叠加 Absolute Axiom。</small>';
    anchor.insertAdjacentElement('afterend',wrap);
    const desc=document.createElement('div');desc.id='enlightenDesc';desc.className='desc';desc.style.marginTop='8px';wrap.insertAdjacentElement('afterend',desc);
    $('charEnlighten').addEventListener('change',()=>{renderEnlightenSummary();renderSkillOptions(currentSkill?.id);applySkill();$('calcBtn')?.click()},{capture:true});
  }
  function enlightenSlotLabel(slot){
    if(slot==='OverExalt')return '+4 · 超限';
    if(slot==='AbsoluteAxiom')return '最终法则';
    return slot;
  }
  function configureEnlightenControl(){
    ensureEnlightenUi();const sel=$('charEnlighten');if(!sel)return;const prev=sel.value;
    sel.innerHTML='<option value="">E0 · 未启灵</option>';
    for(const slot of ['E1','E2','E3','OverExalt','AbsoluteAxiom']){
      if(!currentEnlightens.some(x=>x.slot===slot))continue;
      const o=document.createElement('option');o.value=slot;o.textContent=enlightenSlotLabel(slot);o.selected=prev===slot;sel.appendChild(o);
    }
    if(!Array.from(sel.options).some(o=>o.value===prev))sel.value='';renderEnlightenSummary();
  }
  function renderEnlightenSummary(){
    const box=$('enlightenDesc');if(!box)return;const active=activeEnlightens();
    box.innerHTML=active.length?active.map(x=>'<strong>'+escape(enlightenSlotLabel(x.slot))+' · '+escape(zhText(x.name||''))+'</strong>：'+escape(zhText(renderTemplate(x,1)))).join('<br><br>'):'E0：当前不应用启灵升级。';
  }
  function ensureFormulaContextUi(){
    if($('formulaContextBlock'))return;
    const anchor=$('charStatsSummary')||$('skillDesc');if(!anchor)return;
    const block=document.createElement('div');block.id='formulaContextBlock';block.className='formGrid';block.style.marginTop='10px';
    block.innerHTML='<div class="field"><label for="formulaAccountLevel">账号等级</label><input id="formulaAccountLevel" type="number" min="1" max="100" step="1" value="50"><small>仅用于依赖账号等级的 SKeyDB 公式；造物数量与命轮精炼不再重复填写。</small></div>';
    anchor.insertAdjacentElement('afterend',block);
    $('formulaAccountLevel')?.addEventListener('change',()=>{updateSkillLevel();renderWheelsAndBonuses();renderCovenantAndBonuses();$('calcBtn')?.click()},{capture:true});
  }
  function ensureCharacterLevel(){
    if(!characterLevelControl()){const anchor=$('skillLevel')?.closest('.field');if(!anchor)return;const wrap=document.createElement('div');wrap.className='field';wrap.innerHTML='<label for="charLevel">角色等级</label><select id="charLevel"></select><small>使用 SKeyDB Lv.1 基础攻击与每级成长自动带入；手动修改“有效攻击力”后停止覆盖。</small>';anchor.parentNode.insertBefore(wrap,anchor.nextSibling)}
    normalizeProgressionControls();ensureEnlightenUi();ensureFormulaContextUi();
    const level=characterLevelControl(),sync=()=>{if(currentAwakener&&$('autoCharacterStats')?.checked!==false){$('attack').dataset.autoAttack='1';applyCharacterStats()}};
    level?.addEventListener('input',sync,{capture:true});level?.addEventListener('change',sync,{capture:true});
    for(const id of ['innerSpirit','characterSculpt'])$(id)?.addEventListener('change',()=>{applyCharacterStats();updateSkillLevel();$('calcBtn')?.click()},{capture:true});
    $('soulforgeActive')?.addEventListener('change',()=>{applyCharacterStats();updateSkillLevel();$('calcBtn')?.click()},{capture:true});
    $('autoCharacterStats')?.addEventListener('change',()=>{if($('autoCharacterStats').checked){$('attack').dataset.autoAttack='1';applyCharacterStats()}else $('attack').dataset.autoAttack='0'},{capture:true});
    $('attack')?.addEventListener('input',()=>{if(!applyingAuto)$('attack').dataset.autoAttack='0'});
  }
  function ensureSecondWheelUi(){
    const first=$('fateSelect');if(!first||$('fateSelect2'))return;
    const field=first.closest('.field');if(!field)return;field.classList.remove('full');
    const second=document.createElement('div');second.className='field';second.innerHTML='<label for="fateSelect2">命轮 2</label><select id="fateSelect2"><option value="">无</option></select>';
    field.parentNode.insertBefore(second,field.nextSibling);
    const l1=document.createElement('div');l1.className='field';l1.innerHTML='<label for="fateLevel1">命轮 1 效果档位</label><select id="fateLevel1"><option value="1">1</option></select>';
    const l2=document.createElement('div');l2.className='field';l2.innerHTML='<label for="fateLevel2">命轮 2 效果档位</label><select id="fateLevel2"><option value="1">1</option></select>';
    second.parentNode.insertBefore(l1,second.nextSibling);second.parentNode.insertBefore(l2,l1.nextSibling);
    first.previousElementSibling&&(first.previousElementSibling.textContent='命轮 1');
    $('fateSelect2').addEventListener('change',e=>{e.stopImmediatePropagation();loadWheel(1)},{capture:true});
    $('fateLevel1').addEventListener('change',e=>{e.stopImmediatePropagation();renderWheelsAndBonuses();updateSkillLevel();$('calcBtn')?.click()},{capture:true});
    $('fateLevel2').addEventListener('change',e=>{e.stopImmediatePropagation();renderWheelsAndBonuses();updateSkillLevel();$('calcBtn')?.click()},{capture:true});
  }
  function ensureSyncBadge(){
    const block=$('fateDesc')?.closest('.builderBlock');if(block&&!$('skeydbBuildStatus')){const d=document.createElement('div');d.id='skeydbBuildStatus';d.className='syncLine';d.innerHTML='<span class="syncDot" id="skeydbBuildDot"></span><span id="skeydbBuildText">SKeyDB 配装数据加载中…</span>';block.appendChild(d)}
  }

  function renderCharacters(){
    const select=$('charSelect'),db=data()?.db;if(!select||!db?.records?.length)return;
    const previous=selectedAwakenerId()||currentAwakener?.id||db.records[0].id;select.innerHTML='';
    for(const rec of db.records){const opt=document.createElement('option');opt.dataset.awakenerId=rec.id;opt.value=rec.id;opt.textContent=labelForAwakener(rec);opt.selected=rec.id===previous;select.appendChild(opt)}
  }
  function progressionState(){
    const engine=window.MorimensFormulaEngine;
    if(!engine)return {bonusLevels:0,soulforgePct:0,gnosticLevel:0,soulforgeLevel:0,gnosticMax:0,soulforgeMax:0,flatAtkDamagePct:0,baseDamagePct:0};
    return engine.resolveProgression(
      currentTalents,
      Number($('innerSpirit')?.value)||0,
      Number($('characterSculpt')?.value)||0,
      $('soulforgeActive')?.checked!==false
    );
  }
  function configureProgressionControls(){
    const engine=window.MorimensFormulaEngine;
    const state=engine?engine.resolveProgression(currentTalents,0,0,true):null;
    const inner=$('innerSpirit'),sculpt=$('characterSculpt');
    const innerMax=state?.gnosticMax||0,sculptMax=state?.soulforgeMax||0;
    if(inner){
      const previous=Math.min(innerMax,Math.max(0,Number(inner.value)||0));
      inner.innerHTML='';
      for(let i=0;i<=innerMax;i++){const o=document.createElement('option');o.value=String(i);o.textContent=i===0?'0 · 未启用':`${i} · 内在灵格 ${i}`;o.selected=i===previous;inner.appendChild(o)}
      if(!innerMax)inner.innerHTML='<option value="0">0 · 无内在灵格数据</option>';
    }
    if(sculpt){
      const previous=Math.min(sculptMax,Math.max(0,Number(sculpt.value)||0));
      sculpt.innerHTML='';
      for(let i=0;i<=sculptMax;i++){const o=document.createElement('option');o.value=String(i);o.textContent=i===0?'0 · 未启用':`${i} · 灵塑 ${i}`;o.selected=i===previous;sculpt.appendChild(o)}
      if(!sculptMax)sculpt.innerHTML='<option value="0">0 · 无灵塑数据</option>';
    }
  }
  function renderProgressionSummary(stats,progression){
    const box=$('charStatsSummary');if(!box)return;
    const chips=[
      `攻击力 ${Math.round(stats.ATK)}`,
      `体质 ${Math.round(stats.CON)}`,
      `防御力 ${Math.round(stats.DEF)}`
    ];
    if(progression.gnosticLevel)chips.push(`内在灵格 ${progression.gnosticLevel}：基础属性等级 +${progression.bonusLevels}`);
    if(progression.soulforgeLevel){
      chips.push(`灵塑 ${progression.soulforgeLevel}：主属性 +${progression.soulforgePct}%${progression.soulforgeEnabled?'':'（当前未启用）'}`);
      if(progression.flatAtkDamagePct)chips.push(`灵塑专属：伤害额外增加攻击力的 ${progression.flatAtkDamagePct}%`);
      if(progression.baseDamagePct)chips.push(`灵塑专属：基础伤害 +${progression.baseDamagePct}%`);
    }
    box.innerHTML=chips.map(x=>`<span class="chip">${escape(x)}</span>`).join('');

    let desc=$('progressionDesc');
    if(!desc){desc=document.createElement('div');desc.id='progressionDesc';desc.className='desc';desc.style.marginTop='8px';box.insertAdjacentElement('afterend',desc)}
    const details=[];
    if(progression.gnosticTalent&&progression.gnosticLevel){
      details.push(`<strong>内在灵格：</strong>${escape(zhText(renderTemplate(progression.gnosticTalent,progression.gnosticLevel)))}`);
    }
    if(progression.soulforgeTalent&&progression.soulforgeLevel){
      details.push(`<strong>灵塑：</strong>${escape(zhText(renderTemplate(progression.soulforgeTalent,progression.soulforgeLevel)))}`);
    }
    desc.innerHTML=details.length?details.join('<br><br>'):'内在灵格与灵塑均为 0，当前不产生额外成长加成。';
    window.MorimensProgressionSync=progression;
  }

  function applyCharacterStats(){
    if(!currentAwakener)return;const level=Math.min(90,Math.max(1,Number(characterLevelControl()?.value)||90));
    const engine=window.MorimensFormulaEngine,progression=progressionState();
    const stats=engine?engine.statsWithProgression(currentAwakener,level,progression):{
      ATK:Math.floor(num(currentAwakener.baseStatsLv1?.ATK)+num(currentAwakener.statScaling?.ATK)*(level-1)+1e-7),
      CON:Math.floor(num(currentAwakener.baseStatsLv1?.CON)+num(currentAwakener.statScaling?.CON)*(level-1)+1e-7),
      DEF:Math.floor(num(currentAwakener.baseStatsLv1?.DEF)+num(currentAwakener.statScaling?.DEF)*(level-1)+1e-7),
      CritRate:num(currentAwakener.substatsLv1?.CritRate),CritDamage:num(currentAwakener.substatsLv1?.CritDamage)
    };
    const input=$('attack');if(input&&$('autoCharacterStats')?.checked!==false&&(input.dataset.autoAttack!=='0')){applyingAuto=true;input.value=String(stats.ATK);input.dataset.autoAttack='1';applyingAuto=false}
    const cr=num(stats.CritRate),cd=num(stats.CritDamage);
    if($('critRate')&&!$('critRate').dataset.manualInitialized)$('critRate').dataset.manualBase=String(cr);
    if($('critDamage')&&!$('critDamage').dataset.manualInitialized)$('critDamage').dataset.manualBase=String(100+cd);
    renderProgressionSummary(stats,progression);
    window.MorimensProgressionStats=stats;
    applyAutoBonuses();
    window.dispatchEvent(new CustomEvent('morimens-progression-change',{detail:{stats,progression}}));
  }
  async function loadAwakener(){
    const id=selectedAwakenerId(),compact=recordById(id);if(!compact)return;
    currentAwakener=await fetchRecord('awakeners',id).catch(()=>compact);
    [currentTalents,currentEnlightens]=await Promise.all([window.MorimensRepository.fullRecordsForAwakener('talents',id).catch(()=>[]),window.MorimensRepository.fullRecordsForAwakener('enlightens',id).catch(()=>[])]);
    normalizeProgressionControls();
    configureProgressionControls();
    configureEnlightenControl();
    setText('charSyncText','SKeyDB public-v3');setText('charSyncStatus',`${labelForAwakener(currentAwakener)}：正在载入技能…`);$('charSyncDot')?.classList.remove('bad','warn');$('charSyncDot')?.classList.add('ok');
    const select=$('skillSelect');if(select)select.innerHTML='<option value="">Loading…</option>';
    applyCharacterStats();
    try{
      const rows=await window.MorimensRepository.recordsForAwakener('skills',currentAwakener.id);currentSkills=await Promise.all(rows.map(x=>fetchRecord('skills',x.id)));
      currentSkills=currentSkills.filter(x=>slotOrder[x.slot]);currentSkills.sort((a,b)=>(slotOrder[a.slot]||99)-(slotOrder[b.slot]||99)||String(a.name||'').localeCompare(String(b.name||'')));
      renderSkillOptions(currentSkill?.id);
      setText('charSyncStatus',`${labelForAwakener(currentAwakener)} · ${visibleSkills().length} 个当前可用技能已从本地 SKeyDB 同步`);await applySkill();
    }catch(error){console.warn('SKeyDB skill load failed',error);setText('charSyncStatus','SKeyDB 技能快照加载失败');$('charSyncDot')?.classList.add('bad')}
  }
  async function applySkill(){
    const id=$('skillSelect')?.value;if(!id)return;const baseSkill=currentSkills.find(x=>x.id===id)||await fetchRecord('skills',id);currentSkill=resolveSkillEnlighten(baseSkill);
    const levels=maxSkillLevel(currentSkill),levelSelect=$('skillLevel'),previous=Math.min(Number(levelSelect?.value)||1,levels);
    if(levelSelect){levelSelect.innerHTML='';for(let i=1;i<=levels;i++){const o=document.createElement('option');o.value=String(i);o.textContent=`Lv.${i}`;o.selected=i===previous;levelSelect.appendChild(o)}}updateSkillLevel();
  }
  function updateSkillLevel(){
    if(!currentSkill)return;
    const level=Number($('skillLevel')?.value)||1;
    const ctx=currentFormulaContext();
    const engine=window.MorimensFormulaEngine;
    const damageEvents=engine?engine.damageEvents(currentSkill,level,ctx):[];
    const coef=damageEvents[0]?.coefficient||damageCoefficient(currentSkill,level);
    const directParts=damageEvents.map(x=>x.coefficient);
    const tentacleCoef=engine?engine.tentacleBonusCoefficient(currentSkill,level,ctx):0;
    const triggerPct=engine?engine.triggeredTentaclePercent(currentSkill,level,ctx):null;
    if($('skillCoef'))$('skillCoef').value=String(coef);
    if($('skillDesc'))$('skillDesc').innerHTML=`<strong>${escape(zhText(currentSkill.name))}</strong> · ${escape(zhText(renderTemplate(currentSkill,level)))}`;
    if($('skillCoeffSummary')){
      const parts=[];
      if(damageEvents.length){
        const labels={active:'主动',pierce:'穿透',pure:'纯粹',poison:'中毒',counter:'反击'};
        parts.push(`Damage Events ${damageEvents.length} 个：${damageEvents.map(x=>{
          const name=labels[x.type]||x.type;
          if(x.coefficient!==undefined)return name+' '+Number(x.coefficient).toFixed(2)+'%';
          if(x.percent!==undefined)return name+' '+Number(x.percent).toFixed(2)+'%';
          return name;
        }).join(' / ')}`);
      }
      if(tentacleCoef)parts.push(`触腕伤害 × ${Number(tentacleCoef).toFixed(2)}%`);
      if(triggerPct!==null)parts.push(`额外触腕触发 × ${Number(triggerPct).toFixed(2)}%`);
      $('skillCoeffSummary').textContent=(parts.length?parts.join(' + '):'该技能没有可直接换算的伤害倍率')+` · ${currentSkill.id}`;
    }
    window.MorimensSkillSync={skill:currentSkill,level,atkCoefficient:coef,directAtkCoefficients:directParts,damageEvents,tentacleCoefficient:tentacleCoef,triggeredTentaclePercent:triggerPct,context:ctx,enlightenSlot:selectedEnlightenSlot(),activeEnlightenIds:activeEnlightens().map(x=>x.id)};
    window.dispatchEvent(new CustomEvent('morimens-skill-formula',{detail:window.MorimensSkillSync}));
    $('calcBtn')?.click();
  }

  async function loadCatalogs(){
    const [wr,cr,pr,gm]=await Promise.allSettled([window.MorimensRepository.catalog('wheels'),window.MorimensRepository.catalog('covenants'),window.MorimensRepository.catalog('posses'),window.MorimensRepository.gameplayMath()]);
    wheelCatalog=wr.status==='fulfilled'?(wr.value?.records||[]):[];covenantCatalog=cr.status==='fulfilled'?(cr.value?.records||[]):[];posseCatalog=pr.status==='fulfilled'?(pr.value?.records||[]):[];gameplayMathMeta=gm.status==='fulfilled'?gm.value:null;
    window.MorimensFormulaEngine?.setGameplayMathMetadata?.(gameplayMathMeta);ensureFormulaContextUi();
    if(gameplayMathMeta?.accountLevelCurve&&$('formulaAccountLevel')){$('formulaAccountLevel').min=String(gameplayMathMeta.accountLevelCurve.minLevel||1);$('formulaAccountLevel').max=String(gameplayMathMeta.accountLevelCurve.maxLevel||100)}
    const w1=$('fateSelect'),w2=$('fateSelect2');for(const sel of [w1,w2]){if(!sel)continue;const prev=sel.value;sel.innerHTML=`<option value="">${isEnglish()?'None':'无'}</option>`;for(const w of wheelCatalog){const o=document.createElement('option');o.value=w.id;o.textContent=`${labelForWheel(w)} · ${w.rarity||''} ${w.realm||''}`;o.selected=w.id===prev;sel.appendChild(o)}}
    const cs=$('contractSelect');if(cs){const prev=cs.value;cs.innerHTML='<option value="">无</option>';for(const c of covenantCatalog){const o=document.createElement('option');o.value=c.id;o.textContent=isEnglish()?c.name:(zhCovenants[c.name]||c.name);o.selected=c.id===prev;cs.appendChild(o)}}
    const missing=[wr,cr,pr,gm].filter(x=>x.status!=='fulfilled').length;setText('skeydbBuildText',missing?`已载入 ${wheelCatalog.length} 个命轮、${covenantCatalog.length} 套密契；部分目录暂不可用，角色技能仍可计算`:`已同步 ${wheelCatalog.length} 个命轮、${covenantCatalog.length} 套密契；命轮可选 2 个且不可重复`);$('skeydbBuildDot')?.classList.add(missing?'warn':'ok');syncWheelDuplicates();
  }
  function syncWheelDuplicates(){
    const a=$('fateSelect'),b=$('fateSelect2');if(!a||!b)return;const av=a.value,bv=b.value;
    for(const o of a.options)o.disabled=!!(o.value&&o.value===bv&&o.value!==av);
    for(const o of b.options)o.disabled=!!(o.value&&o.value===av&&o.value!==bv);
  }
  function fillLevelSelect(slot,record){const sel=$(`fateLevel${slot+1}`);if(!sel)return;const max=Math.min(12,Math.max(0,maxArgLevel(record)-1)),prev=Math.min(Math.max(Number(sel.value)||0,0),max);sel.innerHTML='';for(let i=0;i<=max;i++){const o=document.createElement('option');o.value=String(i);o.textContent=i===0?'0':`+${i}`;o.selected=i===prev;sel.appendChild(o)}sel.disabled=!record||max<=0}
  async function loadWheel(slot){
    const sel=$(slot===0?'fateSelect':'fateSelect2'),id=sel?.value;
    const other=$(slot===0?'fateSelect2':'fateSelect');if(id&&other?.value===id){sel.value='';currentWheels[slot]=null;setText('skeydbBuildText','两个命轮不能重复，已取消重复选择。');syncWheelDuplicates();renderWheelsAndBonuses();return}
    currentWheels[slot]=id?await fetchRecord('wheels',id):null;const levelSel=$(`fateLevel${slot+1}`);if(levelSel)levelSel.value='0';fillLevelSelect(slot,currentWheels[slot]);syncWheelDuplicates();renderWheelsAndBonuses();
  }
  function isConditional(sentence){return /\b(if|when|whenever|after|before|next|per |for each|at the start|at turn|upon|once)\b/i.test(sentence)}
  function numericBonusesFromText(text,allowConditional=false){
    const out={base:0,power:0,critRate:0,critDamage:0,vulnerability:0,final:0,skipped:[]};
    for(const raw of String(text||'').split(/(?<=[.!?。；;])\s*/)){
      const s=raw.trim();if(!s)continue;if(isConditional(s)&&!allowConditional){out.skipped.push(s);continue}
      let m;
      if((m=s.match(/Base DMG[^+%]*\+\s*([\d.]+)%/i)))out.base+=num(m[1]);
      if((m=s.match(/(?:Damage Amplification|DMG Amplification|DMG Amp)[^+%]*\+\s*([\d.]+)%/i)))out.power+=num(m[1]);
      if((m=s.match(/Crit\.? Rate[^+%]*\+\s*([\d.]+)%/i)))out.critRate+=num(m[1]);
      if((m=s.match(/Crit\.? DMG[^+%]*\+\s*([\d.]+)%/i)))out.critDamage+=num(m[1]);
      if((m=s.match(/Vulnerab(?:le|ility)[^+%]*\+\s*([\d.]+)%/i)))out.vulnerability+=num(m[1]);
      if((m=s.match(/Final DMG[^+%]*\+\s*([\d.]+)%/i)))out.final+=num(m[1]);
      const both=s.match(/Crit\.? Rate and Crit\.? DMG(?: increase)? by\s*([\d.]+)%/i);if(both){out.critRate+=num(both[1]);out.critDamage+=num(both[1])}
    }
    return out;
  }
  function sumBonus(target,b){for(const k of ['base','power','critRate','critDamage','vulnerability','final'])target[k]+=num(b[k])}
  function wheelDescriptionRaw(rec,slot){if(!rec)return '';const stage=Math.min(12,Math.max(0,Number($(`fateLevel${slot+1}`)?.value)||0));return renderTemplate(rec,stage+1,{wheelRefinementLevel:Math.min(3,stage)})}
  function wheelDescription(rec,slot){return zhText(wheelDescriptionRaw(rec,slot))}
  function renderWheelsAndBonuses(){
    const texts=currentWheels.map((w,i)=>w?`<strong>${escape(labelForWheel(w))}</strong>：${escape(wheelDescription(w,i))}`:'').filter(Boolean);if($('fateDesc'))$('fateDesc').innerHTML=texts.length?texts.join('<br><br>'):'可装备两个不同命轮。选择后从 SKeyDB 读取完整效果；条件型效果只展示，不会在未确认条件时强制计入。';recomputeGearBonuses();
  }

  async function loadCovenant(){const id=$('contractSelect')?.value;currentCovenant=id?await fetchRecord('covenants',id):null;renderCovenantAndBonuses()}
  function renderEffectRaw(effect){let text=effect?.descriptionTemplate||'';text=text.replace(/\[([^\]]+)\]/g,(_,name)=>{const arg=effect?.descriptionArgs?.[name],v=argValue(arg,1);return v===null?name:`${v}${arg?.suffix||''}`});return text}
  function renderEffect(effect){return zhText(renderEffectRaw(effect))}
  function renderCovenantAndBonuses(){
    if(!currentCovenant){if($('contractDesc'))$('contractDesc').textContent='选择密契后从 SKeyDB 读取完整 3 / 6 件套效果。';recomputeGearBonuses();return}
    const lines=(currentCovenant.setEffects||[]).map(e=>`<strong>${e.set} 件：</strong>${escape(renderEffect(e))}`);if($('contractDesc'))$('contractDesc').innerHTML=`<strong>${escape(isEnglish()?currentCovenant.name:(zhCovenants[currentCovenant.name]||currentCovenant.name))}</strong><br>${lines.join('<br>')}`;recomputeGearBonuses();
  }
  function recomputeGearBonuses(){
    const next={base:0,power:0,critRate:0,critDamage:0,vulnerability:0,final:0};
    currentWheels.forEach((w,i)=>{if(w)sumBonus(next,numericBonusesFromText(wheelDescriptionRaw(w,i),false))});
    if(currentCovenant){const pieces=Number($('contractPieces')?.value)||0,allow=$('contractConditional')?.checked===true;for(const e of currentCovenant.setEffects||[]){if(e.set<=pieces)sumBonus(next,numericBonusesFromText(renderEffectRaw(e),e.set<6||allow))}}
    Object.assign(auto,next);applyAutoBonuses();renderAutoSummary();
  }

  function initManualTracking(){
    for(const [key,id] of Object.entries(trackedFields)){const el=$(id);if(!el)continue;if(el.dataset.manualBase===undefined)el.dataset.manualBase=String(num(el.value));el.dataset.manualInitialized='1';el.addEventListener('input',()=>{if(applyingAuto)return;el.dataset.manualBase=String(num(el.value)-num(auto[key]));},{capture:true})}
  }
  function applyAutoBonuses(){
    applyingAuto=true;
    for(const [key,id] of Object.entries(trackedFields)){const el=$(id);if(!el)continue;const manual=num(el.dataset.manualBase, key==='critDamage'?150:0);el.value=String(Math.round((manual+num(auto[key]))*1000)/1000)}
    applyingAuto=false;
  }
  function renderAutoSummary(){
    const box=$('autoSummary');if(!box)return;const labels=[['base','基础伤害'],['power','伤害强效'],['critRate','暴击率'],['critDamage','暴击伤害'],['vulnerability','易伤'],['final','最终伤害']];const rows=labels.filter(([k])=>Math.abs(auto[k])>1e-9).map(([k,n])=>`<span class="chip">${n} +${auto[k].toFixed(2)}%</span>`);rows.unshift(`<span class="chip">命轮 ${currentWheels.filter(Boolean).length}/2</span>`);if(currentCovenant)rows.push(`<span class="chip">密契：${escape(isEnglish()?currentCovenant.name:(zhCovenants[currentCovenant.name]||currentCovenant.name))}</span>`);box.innerHTML=rows.join('')}

  function bindCapture(){
    $('charSelect')?.addEventListener('change',e=>{e.stopImmediatePropagation();loadAwakener()},{capture:true});
    $('skillSelect')?.addEventListener('change',e=>{e.stopImmediatePropagation();applySkill()},{capture:true});
    $('skillLevel')?.addEventListener('change',e=>{e.stopImmediatePropagation();updateSkillLevel()},{capture:true});
    $('fateSelect')?.addEventListener('change',e=>{e.stopImmediatePropagation();loadWheel(0)},{capture:true});
    $('contractSelect')?.addEventListener('change',e=>{e.stopImmediatePropagation();loadCovenant()},{capture:true});
    $('contractPieces')?.addEventListener('change',e=>{e.stopImmediatePropagation();renderCovenantAndBonuses()},{capture:true});
    $('contractConditional')?.addEventListener('change',e=>{e.stopImmediatePropagation();renderCovenantAndBonuses()},{capture:true});
    document.addEventListener('input',e=>{if(e.target?.id==='realmMastery')queueMicrotask(updateSkillLevel)},{capture:true});
    document.addEventListener('change',e=>{if(e.target?.id==='realmMastery')queueMicrotask(updateSkillLevel)},{capture:true});
    $('calcBtn')?.addEventListener('click',()=>{recomputeGearBonuses()},{capture:true});
    $('resetBtn')?.addEventListener('click',e=>{e.stopImmediatePropagation();resetBuild()},{capture:true});
  }
  async function resetBuild(){
    if($('fateSelect'))$('fateSelect').value='';if($('fateSelect2'))$('fateSelect2').value='';currentWheels=[null,null];if($('contractSelect'))$('contractSelect').value='';if($('contractPieces'))$('contractPieces').value='0';if($('contractConditional'))$('contractConditional').checked=false;currentCovenant=null;
    if($('innerSpirit'))$('innerSpirit').value='0';if($('characterSculpt'))$('characterSculpt').value='0';if($('soulforgeActive'))$('soulforgeActive').checked=true;if($('charEnlighten'))$('charEnlighten').value='';
    for(const [key,id] of Object.entries(trackedFields)){const el=$(id);if(!el)continue;el.dataset.manualBase=String(key==='critDamage'?150:0)}
    if($('autoCharacterStats'))$('autoCharacterStats').checked=true;if($('attack'))$('attack').dataset.autoAttack='1';applyCharacterStats();recomputeGearBonuses();renderWheelsAndBonuses();renderCovenantAndBonuses();syncWheelDuplicates();updateSkillLevel();$('calcBtn')?.click();
  }
  function applyLanguage(){renderCharacters();if(currentAwakener){const sel=$('charSelect');if(sel)sel.value=currentAwakener.id}for(const id of ['fateSelect','fateSelect2']){const sel=$(id);if(!sel)continue;for(const o of sel.options){if(!o.value){o.textContent=isEnglish()?'None':'无';continue}const wheel=wheelCatalog.find(x=>x.id===o.value);if(wheel)o.textContent=`${labelForWheel(wheel)} · ${wheel.rarity||''} ${wheel.realm||''}`}}const cs=$('contractSelect');if(cs&&covenantCatalog.length){for(const o of cs.options){const c=covenantCatalog.find(x=>x.id===o.value);if(c)o.textContent=isEnglish()?c.name:(zhCovenants[c.name]||c.name)}}renderWheelsAndBonuses();renderCovenantAndBonuses()}

  async function boot(){
    ensureCharacterLevel();ensureSecondWheelUi();ensureSyncBadge();initManualTracking();bindCapture();renderCharacters();
    window.addEventListener('morimens-realm-change',()=>{if(currentSkill)queueMicrotask(updateSkillLevel)});
    try{await loadCatalogs();await loadAwakener();for(const delay of [500,1800,5000])setTimeout(normalizeProgressionControls,delay);window.addEventListener('morimens-language-change',applyLanguage);window.MorimensBuildData={get wheels(){return wheelCatalog},get covenants(){return covenantCatalog},get currentWheels(){return currentWheels},get currentCovenant(){return currentCovenant}}}catch(error){console.error('Morimens SKeyDB calculator bootstrap failed',error);setText('skeydbBuildText','SKeyDB 角色/技能数据加载失败，请刷新后重试');$('skeydbBuildDot')?.classList.add('bad')}
  }
  if(window.MorimensData?.db&&window.MorimensRepository)boot();else window.addEventListener('morimens-data-ready',boot,{once:true});
})();

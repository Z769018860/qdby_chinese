(()=>{
  const $=id=>document.getElementById(id);
  const num=(v,f=0)=>{const n=Number.parseFloat(v);return Number.isFinite(n)?n:f};
  const state={userEdited:{critRate:false,critDamage:false,powerBonus:false,realmMastery:false},lastAwakenerId:null};

  function data(){return window.MorimensData}
  function selectedId(){return $('charSelect')?.selectedOptions?.[0]?.dataset?.awakenerId||$('charSelect')?.value||null}
  function currentRecord(){const id=selectedId();return data()?.db?.records?.find(x=>x.id===id)||null}
  function localizedName(rec){return data()?.zhFor?.(rec)?.name||data()?.identityDb?.bySkeydbId?.[rec?.id]?.name||rec?.name||''}
  function level(){return Math.max(1,Math.min(90,Number(($('charLevel')||$('skeydbCharacterLevel'))?.value)||90))}
  function statsFor(rec,talents=[]){
    const engine=window.MorimensFormulaEngine,lv=level();
    if(engine){
      const progression=engine.resolveProgression(
        talents,
        Number($('innerSpirit')?.value)||0,
        Number($('characterSculpt')?.value)||0,
        $('soulforgeActive')?.checked!==false
      );
      return {...engine.statsWithProgression(rec,lv,progression),progression};
    }
    return {
      ATK:Math.floor(num(rec?.baseStatsLv1?.ATK)+num(rec?.statScaling?.ATK)*(lv-1)+1e-7),
      CON:Math.floor(num(rec?.baseStatsLv1?.CON)+num(rec?.statScaling?.CON)*(lv-1)+1e-7),
      DEF:Math.floor(num(rec?.baseStatsLv1?.DEF)+num(rec?.statScaling?.DEF)*(lv-1)+1e-7),
      CritRate:num(rec?.substatsLv1?.CritRate),
      CritDamage:num(rec?.substatsLv1?.CritDamage,50),
      DamageAmplification:num(rec?.substatsLv1?.DamageAmplification),
      RealmMastery:num(rec?.substatsLv1?.RealmMastery),
      progression:{}
    };
  }

  function setAutoBase(id,nextBase,userKey){
    const el=$(id);if(!el||state.userEdited[userKey])return;
    const oldBase=num(el.dataset.manualBase,num(el.value));
    const shown=num(el.value);
    const autoDelta=shown-oldBase;
    el.dataset.manualBase=String(nextBase);
    el.value=String(Math.round((nextBase+autoDelta)*1000)/1000);
  }

  async function updateCharacterStats(){
    const compact=currentRecord();if(!compact)return;
    state.lastAwakenerId=compact.id;
    let rec=compact,skills=[],enlightens=[],talents=[],derived=[];
    try{
      [rec,skills,enlightens,talents,derived]=await Promise.all([
        window.MorimensRepository.record('awakeners',compact.id).catch(()=>compact),
        window.MorimensRepository.recordsForAwakener('skills',compact.id),
        window.MorimensRepository.recordsForAwakener('enlightens',compact.id),
        window.MorimensRepository.fullRecordsForAwakener('talents',compact.id),
        window.MorimensRepository.recordsForAwakener('derived-skills',compact.id).catch(()=>[])
      ]);
    }catch(error){console.warn('Morimens progression catalog sync failed',error)}
    const resolved=statsFor(rec,talents);
    // morimens-calculator-skeydb.js owns calculator inputs once progression has initialized.
    // This module remains a fallback plus readout/event provider, avoiding a second writer
    // that could erase wheel Realm Mastery or gear-derived substats.
    if(!window.MorimensProgressionStats){
      setAutoBase('critRate',num(resolved.CritRate),'critRate');
      setAutoBase('critDamage',100+num(resolved.CritDamage,50),'critDamage');
      setAutoBase('powerBonus',num(resolved.DamageAmplification),'powerBonus');
      setAutoBase('realmMastery',num(resolved.RealmMastery),'realmMastery');
      if($('attack')&&$('autoCharacterStats')?.checked!==false&&$('attack').dataset.autoAttack!=='0')$('attack').value=String(resolved.ATK);
    }
    if($('combatCon'))$('combatCon').textContent=Math.round(resolved.CON).toLocaleString('zh-CN');
    if($('combatAtk'))$('combatAtk').textContent=Math.round(resolved.ATK).toLocaleString('zh-CN');
    if($('combatDef'))$('combatDef').textContent=Math.round(resolved.DEF).toLocaleString('zh-CN');

    let box=$('skeydbProgressSync');
    if(!box){
      const anchor=$('charSyncStatus')?.parentElement||$('skillDesc');
      if(anchor){box=document.createElement('div');box.id='skeydbProgressSync';box.className='desc';box.style.marginTop='9px';anchor.insertAdjacentElement('afterend',box)}
    }
    if(box){
      const p=resolved.progression||{};
      const parts=[
        `${localizedName(rec)} · ${rec.id}`,
        `等级 ${level()} · 攻击 ${resolved.ATK}`,
        `体质 ${resolved.CON}`,
        `防御 ${resolved.DEF}`,
        `暴击率 ${num(resolved.CritRate).toFixed(1)}%`,
        `暴击伤害 ${(100+num(resolved.CritDamage,50)).toFixed(1)}%`,
        `伤害强效 ${num(resolved.DamageAmplification).toFixed(1)}%`,
        `界域精通 ${num(resolved.RealmMastery).toFixed(1)}`,
        p.gnosticLevel?`内在灵格 ${p.gnosticLevel}（基础属性等级 +${p.bonusLevels}）`:'',
        p.soulforgeLevel?`灵塑 ${p.soulforgeLevel}（主属性 +${p.soulforgePct}%${p.soulforgeEnabled?'':'，未启用'}）`:'',
        `技能 ${skills.length}`,
        `衍生技能 ${derived.length}`,
        `启灵 ${enlightens.length}`,
        `天赋 ${talents.length}`
      ].filter(Boolean);
      box.textContent=`SKeyDB 数值同步：${parts.join(' · ')}`;
    }
    window.MorimensCharacterSync={record:rec,skills,enlightens,talents,derived,finalStats:resolved,progression:resolved.progression,update:updateCharacterStats};
    window.dispatchEvent(new CustomEvent('morimens-character-stats',{detail:{record:rec,stats:resolved,progression:resolved.progression}}));
  }

  function bindUserTracking(){
    for(const [id,key] of [['critRate','critRate'],['critDamage','critDamage'],['powerBonus','powerBonus']]){
      $(id)?.addEventListener('input',()=>{state.userEdited[key]=true});
    }
    document.addEventListener('input',event=>{if(event.target?.id==='realmMastery')state.userEdited.realmMastery=true});
    document.addEventListener('click',event=>{
      if(event.target?.id!=='resetBtn')return;
      state.userEdited={critRate:false,critDamage:false,powerBonus:false,realmMastery:false};
      setTimeout(updateCharacterStats,80);
    },true);
    $('charSelect')?.addEventListener('change',()=>setTimeout(updateCharacterStats,80));
    const lv=$('charLevel')||$('skeydbCharacterLevel');
    lv?.addEventListener('input',()=>setTimeout(updateCharacterStats,20));
    lv?.addEventListener('change',()=>setTimeout(updateCharacterStats,20));
    document.addEventListener('change',event=>{if(['innerSpirit','characterSculpt','soulforgeActive'].includes(event.target?.id))setTimeout(updateCharacterStats,20)});
  }

  function boot(){
    bindUserTracking();
    setTimeout(updateCharacterStats,120);
    window.addEventListener('morimens-language-change',()=>setTimeout(updateCharacterStats,20));
    window.addEventListener('morimens-progression-change',()=>{
      const id=selectedId();if(id&&id!==state.lastAwakenerId)state.userEdited={critRate:false,critDamage:false,powerBonus:false,realmMastery:false};
      setTimeout(updateCharacterStats,0);
    });
    window.addEventListener('morimens-calculator-ui-ready',()=>setTimeout(updateCharacterStats,0));
  }
  window.MorimensStatsSync={updateCharacterStats,statsFor};
  if(window.MorimensData?.db&&window.MorimensRepository)boot();
  else window.addEventListener('morimens-data-ready',()=>setTimeout(boot,0),{once:true});
})();

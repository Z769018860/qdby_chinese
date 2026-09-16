(()=>{
  const $=id=>document.getElementById(id);
  const num=(v,f=0)=>{const n=Number.parseFloat(v);return Number.isFinite(n)?n:f};
  const state={userEdited:{critRate:false,critDamage:false,powerBonus:false},lastAwakenerId:null};

  function data(){return window.MorimensData}
  function selectedId(){return $('charSelect')?.selectedOptions?.[0]?.dataset?.awakenerId||$('charSelect')?.value||null}
  function currentRecord(){const id=selectedId();return data()?.db?.records?.find(x=>x.id===id)||null}
  function localizedName(rec){return data()?.zhFor?.(rec)?.name||data()?.identityDb?.bySkeydbId?.[rec?.id]?.name||rec?.name||''}

  function setAutoBase(id,nextBase,userKey){
    const el=$(id);if(!el||state.userEdited[userKey])return;
    const oldBase=num(el.dataset.manualBase,num(el.value));
    const shown=num(el.value);
    const autoDelta=shown-oldBase;
    el.dataset.manualBase=String(nextBase);
    el.value=String(Math.round((nextBase+autoDelta)*1000)/1000);
  }

  async function updateCharacterStats(){
    const rec=currentRecord();if(!rec)return;
    state.lastAwakenerId=rec.id;
    const sub=rec.substatsLv1||{};
    setAutoBase('critRate',num(sub.CritRate), 'critRate');
    setAutoBase('critDamage',100+num(sub.CritDamage,50), 'critDamage');
    setAutoBase('powerBonus',num(sub.DamageAmplification), 'powerBonus');

    let skills=[],enlightens=[],talents=[];
    try{
      [skills,enlightens,talents]=await Promise.all([
        window.MorimensRepository.recordsForAwakener('skills',rec.id),
        window.MorimensRepository.recordsForAwakener('enlightens',rec.id),
        window.MorimensRepository.recordsForAwakener('talents',rec.id)
      ]);
    }catch(error){console.warn('Morimens progression catalog sync failed',error)}

    let box=$('skeydbProgressSync');
    if(!box){
      const anchor=$('charSyncStatus')?.parentElement||$('skillDesc');
      if(anchor){box=document.createElement('div');box.id='skeydbProgressSync';box.className='desc';box.style.marginTop='9px';anchor.insertAdjacentElement('afterend',box)}
    }
    if(box){
      const level=Math.max(1,Math.min(90,Number($('skeydbCharacterLevel')?.value)||90));
      const atk=Math.floor(num(rec.baseStatsLv1?.ATK)+num(rec.statScaling?.ATK)*(level-1)+1e-7);
      const parts=[
        `${localizedName(rec)} · ${rec.id}`,
        `Lv.${level} ATK ${atk}`,
        `暴击率 ${num(sub.CritRate).toFixed(1)}%`,
        `暴击伤害 ${(100+num(sub.CritDamage,50)).toFixed(1)}%`,
        `伤害强效 ${num(sub.DamageAmplification).toFixed(1)}%`,
        `界域精通 ${num(sub.RealmMastery).toFixed(1)}`,
        `技能 ${skills.length}`,
        `启灵效果 ${enlightens.length}`,
        `天赋 ${talents.length}`
      ];
      box.textContent=`SKeyDB 数值同步：${parts.join(' · ')}`;
    }
    window.MorimensCharacterSync={record:rec,skills,enlightens,talents};
  }

  function bindUserTracking(){
    for(const [id,key] of [['critRate','critRate'],['critDamage','critDamage'],['powerBonus','powerBonus']]){
      $(id)?.addEventListener('input',()=>{state.userEdited[key]=true},{capture:false});
    }
    document.addEventListener('click',event=>{
      if(event.target?.id!=='resetBtn')return;
      state.userEdited={critRate:false,critDamage:false,powerBonus:false};
      setTimeout(updateCharacterStats,80);
    },true);
    $('charSelect')?.addEventListener('change',()=>setTimeout(updateCharacterStats,80));
    $('skeydbCharacterLevel')?.addEventListener('input',()=>setTimeout(updateCharacterStats,20));
  }

  function boot(){
    bindUserTracking();setTimeout(updateCharacterStats,120);
    window.addEventListener('morimens-language-change',()=>setTimeout(updateCharacterStats,20));
  }
  if(window.MorimensData?.db&&window.MorimensRepository)boot();else window.addEventListener('morimens-data-ready',()=>setTimeout(boot,0),{once:true});
})();

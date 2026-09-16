(()=>{
  const $=id=>document.getElementById(id);
  const isEnglish=()=>localStorage.getItem('morimens.language')==='en';
  let currentAwakener=null,currentSkills=[],currentSkill=null;
  const recordCache=new Map();

  function data(){return window.MorimensData}
  function recordById(id){return data()?.db?.records?.find(x=>x.id===id)||null}
  function zhFor(rec){return data()?.zhDb?.bySkeydbId?.[rec?.id]||null}
  function selectedAwakenerId(){return $('charSelect')?.selectedOptions?.[0]?.dataset?.awakenerId||null}

  function renderCharacters(language){
    const select=$('charSelect'),db=data()?.db;if(!select||!db?.records?.length)return;
    const previous=selectedAwakenerId()||currentAwakener?.id||db.records[0].id;
    select.innerHTML='';
    for(const rec of db.records){
      const opt=document.createElement('option');const zh=zhFor(rec);
      opt.dataset.awakenerId=rec.id;
      if(language==='en'){opt.value=rec.id;opt.textContent=rec.name}
      else{const label=zh?.name||rec.name;opt.value=label;opt.textContent=label}
      opt.selected=rec.id===previous;select.appendChild(opt);
    }
  }

  function argValue(arg,level){
    if(!arg)return null;
    if(Array.isArray(arg.values)&&arg.values.length)return arg.values[Math.min(Math.max(level-1,0),arg.values.length-1)];
    if(arg.value!==undefined)return arg.value;
    return null;
  }
  function damageArgName(skill){return skill?.descriptionTemplate?.match(/\[Damage:([^\]]+)\]/)?.[1]||null}
  function damageCoefficient(skill,level){
    const name=damageArgName(skill);if(!name)return 0;const arg=skill?.descriptionArgs?.[name];const value=Number.parseFloat(argValue(arg,level));return Number.isFinite(value)?value:0;
  }
  function maxLevel(skill){
    let n=1;for(const arg of Object.values(skill?.descriptionArgs||{})){if(Array.isArray(arg?.values))n=Math.max(n,arg.values.length)}return n;
  }
  function renderDescription(skill,level){
    let text=skill?.descriptionTemplate||'No description is available in the synchronized SKeyDB record.';
    text=text.replace(/\[([A-Za-z]+):([^\]]+)\]/g,(_,kind,name)=>{
      const arg=skill?.descriptionArgs?.[name],value=argValue(arg,level);if(value===null||value===undefined)return name;
      if(kind==='Damage'&&arg?.stat)return `${arg.stat} × ${value}${arg.suffix||''}`;
      return `${value}${arg?.suffix||''}`;
    });
    text=text.replace(/\[([^\]]+)\]/g,(_,name)=>{const arg=skill?.descriptionArgs?.[name],value=argValue(arg,level);return value===null||value===undefined?name:`${value}${arg?.suffix||''}`});
    return text.replace(/\n/g,' ');
  }
  async function fetchSkill(id){
    if(recordCache.has(id))return recordCache.get(id);
    const p=window.MorimensRepository.record('skills',id);recordCache.set(id,p);try{return await p}catch(e){recordCache.delete(id);throw e}
  }
  async function loadEnglishAwakener(){
    const id=selectedAwakenerId()||$('charSelect')?.value;const rec=recordById(id);if(!rec)return;currentAwakener=rec;
    const select=$('skillSelect');if(!select)return;
    $('charSyncText')&&($('charSyncText').textContent='SKeyDB public-v3');
    $('charSyncStatus')&&($('charSyncStatus').textContent=`Loading ${rec.name} skills from the local SKeyDB snapshot…`);
    $('charSyncDot')?.classList.remove('bad','warn');
    select.innerHTML='<option value="">Loading skills…</option>';
    try{
      const rows=await window.MorimensRepository.recordsForAwakener('skills',rec.id);
      currentSkills=await Promise.all(rows.map(x=>fetchSkill(x.id)));
      currentSkills.sort((a,b)=>String(a.slot||'').localeCompare(String(b.slot||''))||String(a.name).localeCompare(String(b.name)));
      select.innerHTML='';
      for(const skill of currentSkills){const opt=document.createElement('option');opt.value=skill.id;opt.textContent=skill.name;select.appendChild(opt)}
      $('charSyncStatus')&&($('charSyncStatus').textContent=`SKeyDB: ${currentSkills.length} synchronized skills for ${rec.name}`);
      $('charSyncDot')?.classList.add('ok');
      await applyEnglishSkill();
    }catch(error){
      console.warn('SKeyDB English skill load failed',error);$('charSyncStatus')&&($('charSyncStatus').textContent='SKeyDB skill snapshot failed to load');$('charSyncDot')?.classList.add('bad');
    }
  }
  async function applyEnglishSkill(){
    const id=$('skillSelect')?.value;if(!id)return;currentSkill=currentSkills.find(x=>x.id===id)||await fetchSkill(id);
    const levelSelect=$('skillLevel'),levels=maxLevel(currentSkill),previous=Math.min(Number(levelSelect?.value)||1,levels);
    if(levelSelect){levelSelect.innerHTML='';for(let i=1;i<=levels;i++){const o=document.createElement('option');o.value=String(i);o.textContent=`Lv.${i}`;o.selected=i===previous;levelSelect.appendChild(o)}}
    updateEnglishSkillLevel();
  }
  function updateEnglishSkillLevel(){
    if(!currentSkill)return;const level=Number($('skillLevel')?.value)||1,coef=damageCoefficient(currentSkill,level);
    if($('skillCoeff'))$('skillCoeff').value=String(coef);
    if($('hitCount'))$('hitCount').value='1';
    if($('skillDamageMode'))$('skillDamageMode').value='primary';
    if($('skillDesc'))$('skillDesc').innerHTML=`<strong>${currentSkill.name}</strong> · ${renderDescription(currentSkill,level)}`;
    if($('skillCoeffSummary'))$('skillCoeffSummary').textContent=coef?`ATK scaling: ${coef}% · SKeyDB ${currentSkill.id}`:`No direct ATK damage coefficient · SKeyDB ${currentSkill.id}`;
  }

  function restoreChinese(){
    renderCharacters('zh-CN');
    const select=$('charSelect');if(!select)return;
    const event=new Event('change',{bubbles:true});select.dispatchEvent(event);
    $('charSyncText')&&($('charSyncText').textContent='中文维基 / 同步快照');
  }
  function activateEnglish(){renderCharacters('en');loadEnglishAwakener()}
  function applyLanguage(){if(isEnglish())activateEnglish();else restoreChinese()}

  function bindCapture(){
    const char=$('charSelect'),skill=$('skillSelect'),level=$('skillLevel');
    char?.addEventListener('change',e=>{if(!isEnglish())return;e.stopImmediatePropagation();loadEnglishAwakener()},{capture:true});
    skill?.addEventListener('change',e=>{if(!isEnglish())return;e.stopImmediatePropagation();applyEnglishSkill()},{capture:true});
    level?.addEventListener('change',e=>{if(!isEnglish())return;e.stopImmediatePropagation();updateEnglishSkillLevel()},{capture:true});
  }
  function boot(){bindCapture();applyLanguage();window.addEventListener('morimens-language-change',applyLanguage)}
  if(window.MorimensData?.db)boot();else window.addEventListener('morimens-data-ready',boot,{once:true});
})();

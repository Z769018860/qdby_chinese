(()=>{
  const EPS=1e-9;
  const num=(v,f=0)=>{const n=Number.parseFloat(v);return Number.isFinite(n)?n:f};
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));

  function parseStat(v){return num(String(v??'').replace('%',''),0)}

  function primaryStat(rec,key,level,bonusLevels=0,soulforgePct=0){
    const lv=clamp(Math.round(num(level,60)),1,90);
    const growth=num(rec?.statScaling?.[key],0);
    const scalingBase=Number(rec?.primaryScalingBase);
    let value;
    if(Number.isFinite(scalingBase)&&growth){
      value=Math.ceil((scalingBase+lv+num(bonusLevels))*growth-EPS);
    }else{
      value=Math.floor(num(rec?.baseStatsLv1?.[key])+growth*(lv-1)+1e-7);
    }
    if(soulforgePct)value=Math.ceil(value*(1+num(soulforgePct)/100)-EPS);
    return value;
  }

  function substat(rec,key,level,psycheSurgeOffset=0){
    const base=parseStat(rec?.substatsLv1?.[key]);
    const growth=parseStat(rec?.substatScaling?.[key]);
    if(!growth)return base;
    const lv=clamp(Math.round(num(level,60)),1,90);
    const steps=Math.min(Math.floor(lv/10),6);
    const missing=6-steps;
    return base-missing*growth+clamp(Math.round(num(psycheSurgeOffset)),0,12)*growth;
  }

  function contextFor(rec,level,extra={}){
    return {
      ...extra,
      RealmMastery:extra.RealmMastery??substat(rec,'RealmMastery',level,extra.psycheSurgeOffset||0),
      CritRate:extra.CritRate??substat(rec,'CritRate',level,extra.psycheSurgeOffset||0),
      CritDamage:extra.CritDamage??substat(rec,'CritDamage',level,extra.psycheSurgeOffset||0),
      DamageAmplification:extra.DamageAmplification??substat(rec,'DamageAmplification',level,extra.psycheSurgeOffset||0),
      ATK:extra.ATK??primaryStat(rec,'ATK',level),
      DEF:extra.DEF??primaryStat(rec,'DEF',level),
      CON:extra.CON??primaryStat(rec,'CON',level)
    };
  }

  function baseArgValue(arg,rank=1,ctx={}){
    if(!arg)return null;
    if(arg.kind==='fixed')return num(arg.value,0);
    if(arg.kind==='linear')return num(arg.base,0)+num(arg.gainPerLevel,0)*(Math.max(1,rank)-1);
    if(arg.kind==='scaling'){
      const arr=Array.isArray(arg.values)?arg.values:[];
      return arr.length?num(arr[Math.min(Math.max(rank-1,0),arr.length-1)],0):0;
    }
    if(arg.kind==='computed'){
      if(arg.formulaKey==='realmMasteryLinear'){
        const v=num(arg.baseValue,0)+num(ctx.RealmMastery,0)*num(arg.perPoint,0);
        return arg.rounding==='ceil'?Math.ceil(v-EPS):v;
      }
      if(arg.formulaKey==='primordiaPosseScaled'){
        let base=num(arg.baseValue,0);
        if(arg.baseFormula!=='fixed'&&Number.isFinite(num(ctx.scaledBaseValue,NaN)))base=num(ctx.scaledBaseValue);
        base*=num(arg.multiplier,1);
        if(arg.baseFormula!=='fixed')base=Math.ceil(base-EPS);
        const rate=arg.scalingBucket==='offensive'?0.001:0.0005;
        const team=ctx.primordiaAllChaosTeam?2:1;
        return Math.ceil(base*(1+num(ctx.RealmMastery,0)*rate*team)-EPS);
      }
    }
    return null;
  }

  function resolveArg(arg,rank=1,ctx={}){
    let base=baseArgValue(arg,rank,ctx);
    if(base===null)return null;
    const bonus=arg?.substatBonus;
    if(!bonus)return base;
    const stat=num(ctx?.[bonus.substat],0),mult=num(bonus.multiplier,0);
    const mode=bonus.mode??(arg.kind!=='fixed'&&String(arg.suffix||'').includes('%')?'scale_base':'additive');
    if(mode==='scale_base')return base*(1+(stat*mult)/100);
    if(mode==='additive_factor')return base*(num(bonus.baseMultiplier,1)+(stat*mult)/100);
    return base+stat*mult;
  }

  function tokenArgName(template,kind){
    const re=new RegExp('\\['+kind+':([^\\]]+)\\]','i');
    return String(template||'').match(re)?.[1]||null;
  }

  function directAtkCoefficient(skill,rank,ctx){
    const name=tokenArgName(skill?.descriptionTemplate,'Damage');
    return name?num(resolveArg(skill?.descriptionArgs?.[name],rank,ctx),0):0;
  }

  function tentacleBonusCoefficient(skill,rank,ctx){
    const t=String(skill?.descriptionTemplate||'');
    const patterns=[
      /(?:equal to|with (?:a|an)|enjoys? (?:a|an)?|receives? (?:a|an)?)\s*\[([^\]]+)\]%\s*\{Tentacle DMG\}(?:\s*Bonus)?/i,
      /\[([^\]]+)\]%\s*\{Tentacle DMG\}\s*(?:bonus|Bonus)/i
    ];
    for(const re of patterns){
      const m=t.match(re);if(!m)continue;
      const name=m[1].includes(':')?m[1].split(':').pop():m[1];
      return num(resolveArg(skill?.descriptionArgs?.[name],rank,ctx),0);
    }
    return 0;
  }

  function triggeredTentaclePercent(skill,rank,ctx){
    const t=String(skill?.descriptionTemplate||'');
    const m=t.match(/(?:trigger|command|causes?)\s+1\s+Tentacle[^.\n]*?(?:dealing|deal)\s*\[([^\]]+)\]%\s*\{Tentacle DMG\}/i);
    if(!m)return null;
    const name=m[1].includes(':')?m[1].split(':').pop():m[1];
    return num(resolveArg(skill?.descriptionArgs?.[name],rank,ctx),0);
  }

  function resolveTentacle({
    mode='standard',
    stance='surging',
    currentTentacle=0,
    teamMaxHp=0,
    realmMastery=0,
    allAequorChaos=false,
    extraBonusPct=0
  }={}){
    const mastery=num(realmMastery,0);
    const pure=allAequorChaos?2:1;
    const base=mode==='benthos'?Math.max(0,num(teamMaxHp))*0.05:Math.max(0,num(currentTentacle));
    let stanceMult=1;
    if(stance==='tranquil')stanceMult=0.5;
    if(stance==='raging')stanceMult=1.25;
    let masteryMult=1;
    if(mode==='benthos'&&stance==='raging')masteryMult=1+mastery*0.00025*pure;
    const extraMult=1+num(extraBonusPct)/100;
    const attack=base*stanceMult*masteryMult*extraMult;
    const ragingTriggerPct=mode==='benthos'?100:(50+Math.floor(Math.max(0,mastery)/50));
    return {base,stanceMult,masteryMult,extraMult,attack,ragingTriggerPct};
  }

  window.MorimensFormulaEngine={
    primaryStat,substat,contextFor,resolveArg,directAtkCoefficient,tentacleBonusCoefficient,triggeredTentaclePercent,resolveTentacle,
    source:{
      primary:'SKeyDB src/domain/awakener-level-scaling.ts',
      descriptionArgs:'SKeyDB src/domain/description-args.ts + public-description-args.ts',
      tentacle:[
        'public-v3/records/overlays/overlay.global.surging-tides.json',
        'public-v3/records/overlays/overlay.global.tranquil-sea.json',
        'public-v3/records/overlays/overlay.global.raging-waves.json',
        'public-v3/records/overlays/overlay.global.divine-realm-aequor.json',
        'public-v3/records/overlays/overlay.global.divine-realm-aequor-mastery.json'
      ]
    }
  };
})();

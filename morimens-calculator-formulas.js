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

  let gameplayMathMetadata=null;

  function setGameplayMathMetadata(metadata){
    gameplayMathMetadata=metadata&&typeof metadata==='object'?metadata:null;
    return gameplayMathMetadata;
  }

  function publicFormulaContext(ctx={}){
    return {
      ...ctx,
      accountLevel:clamp(Math.floor(num(ctx.accountLevel,50)),1,100),
      ownedPosseCount:Math.max(0,Math.floor(num(ctx.ownedPosseCount,0))),
      wheelRefinementLevel:ctx.wheelRefinementLevel===undefined?undefined:clamp(Math.floor(num(ctx.wheelRefinementLevel,0)),0,3),
      realmMasteryFinal:Math.max(0,num(ctx.realmMasteryFinal,ctx.RealmMastery||0)),
      primordiaAllChaosTeam:ctx.primordiaAllChaosTeam===true
    };
  }

  function accountCurve(ctx={}){
    const meta=gameplayMathMetadata?.accountLevelCurve;
    if(!meta||!Array.isArray(meta.stageGrow)||!meta.stageGrow.length)return null;
    const min=Math.floor(num(meta.minLevel,1)),max=Math.floor(num(meta.maxLevel,min+meta.stageGrow.length-1));
    const level=clamp(Math.floor(num(ctx.accountLevel,50)),min,max),i=level-min;
    return {
      accountLevel:level,
      stageGrow:num(meta.stageGrow[i],0),
      accountDamagePower:num(meta.accountDamagePower?.[i],0),
      hpMultiplier:num(meta.hpMultiplier?.[i],0)
    };
  }

  function resolveScaledBaseFormula(baseFormula,ctx={}){
    const curve=accountCurve(publicFormulaContext(ctx));if(!curve)return null;
    if(baseFormula==='accountStageGrowth')return curve.stageGrow;
    if(baseFormula==='somaticResearchHpMultiplier')return curve.hpMultiplier;
    if(baseFormula==='esotericResearchDepth')return curve.stageGrow;
    if(baseFormula==='occultResearchDepth')return curve.stageGrow*(curve.accountDamagePower/100);
    if(baseFormula==='occultResearchMultiplier')return curve.accountDamagePower/100;
    return null;
  }

  function baseArgValue(arg,rank=1,ctx={}){
    if(!arg)return null;
    const context=publicFormulaContext(ctx);
    if(arg.kind==='fixed')return num(arg.value,0);
    if(arg.kind==='linear')return num(arg.base,0)+num(arg.gainPerLevel,0)*(Math.max(1,rank)-1);
    if(arg.kind==='scaling'){
      const arr=Array.isArray(arg.values)?arg.values:[];
      if(!arr.length)return 0;
      const index=arg.scalingContext==='wheelRefinement'&&context.wheelRefinementLevel!==undefined
        ?context.wheelRefinementLevel
        :Math.max(rank-1,0);
      return num(arr[Math.min(index,arr.length-1)],0);
    }
    if(arg.kind==='computed'){
      if(arg.formulaKey==='scaled'||arg.formulaKey==='scaledCeilThenMultiply'){
        const base=resolveScaledBaseFormula(arg.baseFormula,context);
        if(base===null)return null;
        if(arg.formulaKey==='scaled'){
          const scaled=base*(Number.isFinite(Number(arg.multiplier))?Number(arg.multiplier):1);
          return arg.rounding==='ceil'?Math.ceil(scaled):scaled;
        }
        const divisor=num(arg.divisor,1);
        if(!(divisor>0))return null;
        return Math.ceil((base*num(arg.multiplier,0))/divisor)*num(arg.postMultiplier,0);
      }
      if(arg.formulaKey==='wheelRefinementLinear'){
        if(context.wheelRefinementLevel===undefined)return null;
        return num(arg.baseValue,0)+context.wheelRefinementLevel*num(arg.perLevel,0);
      }
      if(arg.formulaKey==='realmMasteryLinear'){
        const v=num(arg.baseValue,0)+context.realmMasteryFinal*num(arg.perPoint,0);
        return arg.rounding==='ceil'?Math.ceil(v):v;
      }
      if(arg.formulaKey==='primordiaPosseScaled'){
        let base;
        if(arg.baseFormula==='fixed')base=num(arg.baseValue,0);
        else{
          const resolved=resolveScaledBaseFormula(arg.baseFormula,context);
          if(resolved===null)return null;
          base=resolved;
        }
        const scaledBase=base*(Number.isFinite(Number(arg.multiplier))?Number(arg.multiplier):1);
        const normalizedBase=arg.baseFormula==='fixed'?scaledBase:Math.ceil(scaledBase);
        const rate=arg.scalingBucket==='offensive'?0.001:0.0005;
        const team=context.primordiaAllChaosTeam?2:1;
        return Math.ceil(normalizedBase*(1+context.realmMasteryFinal*rate*team)-EPS);
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

  function inferDamageRepeatCount(template,tokenEnd,skill,rank,ctx){
    const tail=String(template||'').slice(tokenEnd,tokenEnd+180);
    const m=tail.match(/^\s*(?:DMG|damage)?\s*\[([^\]]+)\]\s*\{plural:\[[^\]]+\]\|time\|times\}/i)
      ||tail.match(/^\s*(?:DMG|damage)?\s*\[([^\]]+)\]\s*(?:times?|hits?)/i);
    if(!m)return 1;
    const key=m[1].includes(':')?m[1].split(':').pop():m[1];
    return Math.max(1,Math.floor(num(resolveArg(skill?.descriptionArgs?.[key],rank,ctx),1)));
  }

  function damageEvents(skill,rank,ctx={}){
    const template=String(skill?.descriptionTemplate||'');
    const events=[];let index=0;
    for(const match of template.matchAll(/\[Damage:([^\]]+)\]/gi)){
      const argName=match[1],coefficient=num(resolveArg(skill?.descriptionArgs?.[argName],rank,ctx),0);
      const count=inferDamageRepeatCount(template,(match.index||0)+match[0].length,skill,rank,ctx);
      for(let hit=0;hit<count;hit++){
        events.push({
          id:`active-${index+1}`,
          index:index++,
          type:'active',
          source:'skill',
          argName,
          coefficient,
          stat:skill?.descriptionArgs?.[argName]?.stat||'ATK',
          hit:hit+1,
          hitCount:count
        });
      }
    }
    return events;
  }

  function directAtkCoefficients(skill,rank,ctx){
    return damageEvents(skill,rank,ctx).filter(x=>x.type==='active').map(x=>x.coefficient);
  }

  function directAtkCoefficient(skill,rank,ctx){
    return directAtkCoefficients(skill,rank,ctx)[0]||0;
  }

  function directAtkCoefficientSum(skill,rank,ctx){
    return directAtkCoefficients(skill,rank,ctx).reduce((sum,value)=>sum+num(value,0),0);
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
    const explicit=t.match(/(?:trigger|command|causes?)\s+1\s+Tentacle[^.\n]*?(?:dealing|deal)\s*\[([^\]]+)\]%\s*\{Tentacle DMG\}/i);
    if(explicit){const name=explicit[1].includes(':')?explicit[1].split(':').pop():explicit[1];return num(resolveArg(skill?.descriptionArgs?.[name],rank,ctx),0)}
    if(/(?:trigger|command)\s+1\s+Tentacle\s+(?:to\s+)?attack/i.test(t))return 100;
    return null;
  }
  function talentByFamily(talents,family){
    return (talents||[]).find(t=>String(t?.family||'')===family)||null;
  }

  function resolveProgression(talents,gnosticLevel=0,soulforgeLevel=0,soulforgeEnabled=true){
    const gnostic=talentByFamily(talents,'gnostic_potential');
    const soulforge=talentByFamily(talents,'soulforge_aptitude');
    const gMax=Math.max(0,Math.floor(num(gnostic?.maxLevel,0)));
    const sMax=Math.max(0,Math.floor(num(soulforge?.maxLevel,0)));
    const gLevel=Math.min(gMax,Math.max(0,Math.floor(num(gnosticLevel,0))));
    const sLevel=Math.min(sMax,Math.max(0,Math.floor(num(soulforgeLevel,0))));
    const bonusLevels=gLevel>0?num(resolveArg(gnostic?.descriptionArgs?.Arg1,gLevel,{}),0):0;
    const soulforgePct=soulforgeEnabled&&sLevel>0?num(resolveArg(soulforge?.descriptionArgs?.Arg1,sLevel,{}),0):0;
    const keyflare=soulforgeEnabled&&sLevel>0?num(resolveArg(soulforge?.descriptionArgs?.Arg2,sLevel,{}),0):0;
    const resolvedSoulforgeArgs={};
    if(soulforgeEnabled&&sLevel>0){
      for(const [key,arg] of Object.entries(soulforge?.descriptionArgs||{})){
        const value=resolveArg(arg,sLevel,{});
        if(value!==null)resolvedSoulforgeArgs[key]=value;
      }
    }
    const template=String(soulforge?.descriptionTemplate||'');
    let flatAtkDamagePct=0;
    const flatAtkMatch=template.match(/DMG\s*\+\[([^\]]+)\]%\s+of\s+(?:her|his|their|the Awakener's)\s+ATK/i);
    if(flatAtkMatch&&soulforgeEnabled&&sLevel>0){
      const key=flatAtkMatch[1].includes(':')?flatAtkMatch[1].split(':').pop():flatAtkMatch[1];
      flatAtkDamagePct=num(resolvedSoulforgeArgs[key],0);
    }
    let baseDamagePct=0;
    const baseDmgMatch=template.match(/Base DMG(?: caused by [^.]+)?\s*\+\[([^\]]+)\]%/i);
    if(baseDmgMatch&&soulforgeEnabled&&sLevel>0){
      const key=baseDmgMatch[1].includes(':')?baseDmgMatch[1].split(':').pop():baseDmgMatch[1];
      baseDamagePct=num(resolvedSoulforgeArgs[key],0);
    }
    return {
      gnosticTalent:gnostic,
      soulforgeTalent:soulforge,
      gnosticLevel:gLevel,
      soulforgeLevel:sLevel,
      gnosticMax:gMax,
      soulforgeMax:sMax,
      bonusLevels,
      soulforgePct,
      keyflare,
      flatAtkDamagePct,
      baseDamagePct,
      resolvedSoulforgeArgs,
      soulforgeEnabled:Boolean(soulforgeEnabled)
    };
  }

  function statsWithProgression(rec,level,progression={},psycheSurgeOffset=0){
    return {
      ATK:primaryStat(rec,'ATK',level,progression.bonusLevels||0,progression.soulforgePct||0),
      DEF:primaryStat(rec,'DEF',level,progression.bonusLevels||0,progression.soulforgePct||0),
      CON:primaryStat(rec,'CON',level,progression.bonusLevels||0,progression.soulforgePct||0),
      CritRate:substat(rec,'CritRate',level,psycheSurgeOffset),
      CritDamage:substat(rec,'CritDamage',level,psycheSurgeOffset),
      AliemusRegen:substat(rec,'AliemusRegen',level,psycheSurgeOffset),
      KeyflareRegen:substat(rec,'KeyflareRegen',level,psycheSurgeOffset),
      RealmMastery:substat(rec,'RealmMastery',level,psycheSurgeOffset),
      SigilYield:substat(rec,'SigilYield',level,psycheSurgeOffset),
      DamageAmplification:substat(rec,'DamageAmplification',level,psycheSurgeOffset),
      DeathResistance:substat(rec,'DeathResistance',level,psycheSurgeOffset)
    };
  }

  function resolveTentacle({
    mode='standard',
    stance='surging',
    currentTentacle=0,
    teamMaxHp=0,
    realmMastery=0,
    masteryEffectMultiplier=1,
    extraBaseMaxHpPct=0,
    extraBonusPct=0,
    benthosRagingPct=100
  }={}){
    const mastery=num(realmMastery,0),masteryMultFactor=Math.max(0,num(masteryEffectMultiplier,1));
    const effectiveMastery=mastery*masteryMultFactor;
    const hp=Math.max(0,num(teamMaxHp));
    const coexistenceBase=hp*Math.max(0,num(extraBaseMaxHpPct,0))/100;
    const base=(mode==='benthos'?hp*0.05:Math.max(0,num(currentTentacle)))+coexistenceBase;
    let stanceMult=1;
    if(mode==='standard'&&stance==='tranquil')stanceMult=0.5;
    if(mode==='standard'&&stance==='raging')stanceMult=1.25;
    if(mode==='benthos'&&stance==='raging')stanceMult=Math.max(0,num(benthosRagingPct,100))/100;
    let masteryMult=1;
    if(mode==='benthos'&&stance==='raging')masteryMult=1+effectiveMastery*0.00025;
    const extraMult=1+num(extraBonusPct)/100;
    const attack=base*stanceMult*masteryMult*extraMult;
    const ragingTriggerPct=mode==='benthos'?100:(50+effectiveMastery*0.02);
    const turnEndAllowed=!(mode==='benthos'&&stance==='tranquil');
    return {base,coexistenceBase,stanceMult,masteryMult,masteryEffectMultiplier:masteryMultFactor,effectiveMastery,extraMult,attack,ragingTriggerPct,turnEndAllowed};
  }
  window.MorimensFormulaEngine={
    primaryStat,substat,contextFor,setGameplayMathMetadata,publicFormulaContext,resolveScaledBaseFormula,resolveArg,damageEvents,directAtkCoefficients,directAtkCoefficient,directAtkCoefficientSum,tentacleBonusCoefficient,triggeredTentaclePercent,resolveProgression,statsWithProgression,resolveTentacle,
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

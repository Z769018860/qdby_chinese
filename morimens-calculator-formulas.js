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
      ownedPosseCount:clamp(Math.floor(num(ctx.ownedPosseCount,0)),0,50),
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
    const suffix=arg?.suffix??bonus?.suffix??'';
    const mode=bonus.mode??(arg.kind!=='fixed'&&String(suffix).includes('%')?'scale_base':'additive');
    if(mode==='scale_base')return base*(1+(stat*mult)/100);
    if(mode==='additive_factor')return base*(num(bonus.baseMultiplier,1)+(stat*mult)/100);
    return base+stat*mult;
  }

  function tokenArgName(template,kind){
    const re=new RegExp('\\['+kind+':([^\\]]+)\\]','i');
    return String(template||'').match(re)?.[1]||null;
  }


    function resolveTemplateArg(skill,token,rank,ctx){
      if(token===null||token===undefined)return null;
      const raw=String(token).trim();
      const numeric=Number(raw);
      if(Number.isFinite(numeric))return numeric;
      const key=raw.includes(':')?raw.split(':').pop():raw;
      return resolveArg(skill?.descriptionArgs?.[key],rank,ctx);
    }

    function inferDamageRepeatCount(template,tokenStart,tokenEnd,skill,rank,ctx){
      const text=String(template||'');
      const rawTail=text.slice(tokenEnd,tokenEnd+180);
      const tail=rawTail.replace(/^\s*\{(?:Pierce DMG|Pure DMG|Fixed DMG)\}\s*/i,'');
      const after=tail.match(/^\s*(?:DMG|damage)?\s*\[([^\]]+)\]\s*\{plural:\[[^\]]+\]\|time\|times\}/i)
        ||tail.match(/^\s*(?:DMG|damage)?\s*\[([^\]]+)\]\s*(?:times?|hits?)/i);
      if(after){
        const value=resolveTemplateArg(skill,after[1],rank,ctx);
        return Math.max(1,Math.floor(num(value,1)));
      }
      const wordMatch=tail.match(/^\s*(?:DMG|damage)?\s*(once|twice|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s*(?:times?|hits?)/i);
      if(wordMatch){
        const words={once:1,twice:2,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
        const raw=String(wordMatch[1]).toLowerCase();
        return Math.max(1,Math.floor(words[raw]??num(raw,1)));
      }
      // Some SKeyDB descriptions place the hit count after a target phrase,
      // e.g. "Deal [Damage] DMG to all enemies 2 times".
      const targetRepeat=tail.match(/^\s*(?:DMG|damage)?\s*(?:to|against)\s+[^,.!?;]{0,100}?\s+(once|twice|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s*(?:times?|hits?|instances?)/i);
      if(targetRepeat){
        const words={once:1,twice:2,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
        const raw=String(targetRepeat[1]).toLowerCase();
        return Math.max(1,Math.floor(words[raw]??num(raw,1)));
      }
      const later=rawTail.match(/^[^.]{0,120}([^~])\[([^\]]+)\]\s*\{plural:\[[^\]]+\]\|time\|times\}/i);
      if(later){
        const value=resolveTemplateArg(skill,later[2],rank,ctx);
        return Math.max(1,Math.floor(num(value,1)));
      }
      const head=text.slice(Math.max(0,tokenStart-80),tokenStart);
      const before=head.match(/(?:deal|deals|randomly deal|randomly deals)\s+(\d+)\s+(?:instances?\s+of|hits?\s+of?)\s*$/i);
      if(before)return Math.max(1,Math.floor(num(before[1],1)));
      return 1;
    }

    function damageTentacleBonusCoefficient(skill,template,tokenEnd,rank,ctx){
      const local=String(template||'').slice(tokenEnd,tokenEnd+240);
      const patterns=[
        /(?:which\s+)?enjoys?\s+(?:a|an)?\s*(?:additional\s+)?\[([^\]]+)\]%\s*\{Tentacle DMG\}(?:\s*Bonus)?/i,
        /with\s+(?:a|an)?\s*\[([^\]]+)\]%\s*\{Tentacle DMG\}\s*Bonus/i,
        /additionally\s+gaining\s*\[([^\]]+)\]%\s*\{Tentacle DMG\}/i
      ];
      for(const re of patterns){
        const match=local.match(re);if(!match)continue;
        const before=local.slice(0,match.index||0);
        // Do not steal a Tentacle-DMG bonus that belongs to a later status payload
        // such as "equal Poison, which enjoys X% Tentacle DMG bonus".
        if(/\{(?:Poison|Counter|Bleed|Corrosion)\}/i.test(before))continue;
        return Math.max(0,num(resolveTemplateArg(skill,match[1],rank,ctx),0));
      }
      return 0;
    }

    function damageCounterBonusCoefficient(skill,template,tokenEnd,rank,ctx){
      const local=String(template||'').slice(tokenEnd,tokenEnd+280);
      const patterns=[
        /(?:which\s+)?enjoys?\s+(?:a|an)?\s*\[([^\]]+)\]%\s*\{Counter\}(?:\s*DMG)?\s*Bonus/i,
        /(?:the\s+DMG\s+dealt\s+)?enjoys?\s+(?:a|an)?\s*\[([^\]]+)\]%\s*\{Counter\}\s*bonus/i
      ];
      for(const re of patterns){
        const match=local.match(re);if(!match)continue;
        const before=local.slice(0,match.index||0);
        if(/\{(?:Poison|Bleed|Corrosion)\}/i.test(before))continue;
        return Math.max(0,num(resolveTemplateArg(skill,match[1],rank,ctx),0));
      }
      return 0;
    }

    function statusTentacleBonusCoefficient(skill,template,statusPos,rank,ctx){
      const local=String(template||'').slice(Math.max(0,statusPos),Math.max(0,statusPos)+180);
      const patterns=[
        /(?:which\s+)?enjoys?\s+(?:a|an)?\s*\[([^\]]+)\]%\s*\{Tentacle DMG\}(?:\s*Bonus)?/i,
        /(?:with|enjoying)\s+(?:a|an)?\s*(?:\[([^\]]+)\]|(\d+(?:\.\d+)?))%\s*\{Tentacle DMG\}\s*bonus/i
      ];
      for(const re of patterns){
        const match=local.match(re);if(!match)continue;
        if(match[1]!==undefined)return Math.max(0,num(resolveTemplateArg(skill,match[1],rank,ctx),0));
        return Math.max(0,num(match[2],0));
      }
      return 0;
    }

    function damageCritBonuses(skill,template,tokenEnd,rank,ctx){
      const text=String(template||'');
      const local=text.slice(tokenEnd,Math.min(text.length,tokenEnd+260));
      let critRateBonus=0,critDamageBonus=0;
      const resolveToken=token=>Math.max(0,num(resolveTemplateArg(skill,token,rank,ctx),0));

      let match=text.match(/This\s+(?:card|hit)['’]s\s+Crit\.\s*Rate\s*\+(?:\[([^\]]+)\]|(\d+(?:\.\d+)?))%/i);
      if(match)critRateBonus=match[1]!==undefined?resolveToken(match[1]):num(match[2],0);

      match=local.match(/which\s+enjoys?\s+an?\s+additional\s+(?:\[([^\]]+)\]|(\d+(?:\.\d+)?))%\s+Crit\.\s*Rate\s+and\s+Crit\.\s*DMG\s+bonus/i);
      if(match){
        const value=match[1]!==undefined?resolveToken(match[1]):num(match[2],0);
        critRateBonus=Math.max(critRateBonus,value);
        critDamageBonus=Math.max(critDamageBonus,value);
      }
      return {critRateBonus,critDamageBonus};
    }

    function damageStrengthMultiplier(skill,template,tokenStart,tokenEnd,rank,ctx,type){
      const text=String(template||'');
      const localRaw=text.slice(tokenEnd,Math.min(text.length,tokenEnd+260));
      // Only inspect the same damage sentence. Later {Leap}/{Aftershock}/If clauses are conditional
      // and must not silently change the default event.
      const local=localRaw.split(/[.!?]/,1)[0];
      let multiplier=type==='active'?1:0;
      let match=local.match(/(?:which\s+)?enjoys?\s+(?:a\s+)?(\d+(?:\.\d+)?)\s*[×x]\s*\{STR\}\s+bonus/i);
      if(match)return Math.max(0,num(match[1],multiplier));
      match=local.match(/(?:which\s+)?enjoys?\s+(?:a\s+)?\[([^\]]+)\]%\s*\{STR\}\s+bonus/i);
      if(match)return Math.max(0,num(resolveTemplateArg(skill,match[1],rank,ctx),0)/100);
      match=local.match(/(?:which\s+)?enjoys?\s+(?:a\s+)?(\d+(?:\.\d+)?)%\s*\{STR\}\s+bonus/i);
      if(match)return Math.max(0,num(match[1],0)/100);
      match=local.match(/(?:which\s+)?enjoys?\s+(?:an?\s+)?additional\s+\[([^\]]+)\]%\s+\{Tentacle DMG\}\s+and\s+\{STR\}\s+bonus/i);
      if(match){
        const extra=num(resolveTemplateArg(skill,match[1],rank,ctx),0)/100;
        return Math.max(0,multiplier+extra);
      }
      match=local.match(/additionally\s+gaining\s+\[([^\]]+)\]%\s+\{Tentacle DMG\}\s+and\s+\{STR\}\s+bonus/i);
      if(match){
        const extra=num(resolveTemplateArg(skill,match[1],rank,ctx),0)/100;
        return Math.max(0,multiplier+extra);
      }
      match=local.match(/(?:which\s+)?enjoys?\s+(?:an?\s+)?additional\s+\[([^\]]+)\]%\s+\{STR\}\s+bonus/i);
      if(match)return Math.max(0,multiplier+num(resolveTemplateArg(skill,match[1],rank,ctx),0)/100);
      match=local.match(/(?:which\s+)?enjoys?\s+(?:an?\s+)?additional\s+(\d+(?:\.\d+)?)%\s+\{STR\}\s+bonus/i);
      if(match)return Math.max(0,multiplier+num(match[1],0)/100);
      match=local.match(/(?:which\s+)?enjoys?\s+(?:an?\s+)?additional\s+(\d+(?:\.\d+)?)\s*[×x]\s*\{STR\}\s+bonus/i);
      if(match)return Math.max(0,multiplier+num(match[1],0));
      // Some cards place the STR multiplier in a following sentence instead of beside [Damage].
      match=text.match(/\{STR\}\s+takes\s+\[([^\]]+)\]\s*[×x]\s+effect\s+on\s+[^.]+/i)
        ||text.match(/\{STR\}\s+multiplies\s+the\s+effect\s+by\s+\[([^\]]+)\]\s+on\s+[^.]+/i);
      if(match)return Math.max(0,num(resolveTemplateArg(skill,match[1],rank,ctx),multiplier));
      return multiplier;
    }
    function damageTokenType(template,tokenEnd){
      const tail=String(template||'').slice(tokenEnd,tokenEnd+80);
      return /^\s*\{Pierce DMG\}/i.test(tail)?'pierce':'active';
    }

    function damageIsIndirectDefinition(template,position){
      const text=String(template||'');
      const p=Math.max(0,Math.floor(Number(position)||0));
      let start=0;
      for(const sep of ['.','!','?','\n']){
        const i=text.lastIndexOf(sep,Math.max(0,p-1));
        if(i>=start)start=i+1;
      }
      const prefix=text.slice(start,p);
      return /\b(?:shuffle|add|put|create|generate)\b[^.!?]{0,220}\bthat\s+deals?\s*$/i.test(prefix)
        || /\b(?:shuffle|add|put|create|generate)\b[^.!?]{0,220}\b(?:card|cards|\{derived:[^}]+\})\b[^.!?]{0,120}\bthat\s+deals?\s*$/i.test(prefix);
    }

    function eventConditionalContext(template,position){
      const text=String(template||'');
      const p=Math.max(0,Math.floor(Number(position)||0));
      let start=0;
      for(const sep of ['.','!','?','\n']){
        const i=text.lastIndexOf(sep,Math.max(0,p-1));
        if(i>=start)start=i+1;
      }
      let prefix=text.slice(start,p);
      // SKeyDB often wraps scoped mechanics as "[{Devour}: ...]". Once that bracket
      // is closed, the following main-card text must not inherit the inner condition.
      const closedScope=prefix.lastIndexOf(']');
      if(closedScope>=0)prefix=prefix.slice(closedScope+1);
      const rules=[
        [/\{Devour\}\s*:/i,'Devour'],
        [/\{Leap\}\s*:/i,'Leap'],
        [/\{Aftershock\}\s*:/i,'Aftershock'],
        [/\{Resonance[^}]*\}\s*:/i,'Resonance'],
        [/\bsubsequent\b/i,'后续使用'],
        [/\bwhenever\b/i,'Whenever'],
        [/\bwhen\b/i,'When'],
        [/\bif\b/i,'If'],
        [/\bupon\b/i,'Upon'],
        [/\bafter\s+(?:playing|being played|releasing|unleashing|using|taking|dealing|receiving|gaining|losing|removing|the\s+(?:turn|battle)|this\s+(?:turn|card)|each|every|next|an?\s+enemy|\w+['’]s\s+turn)\b/i,'After trigger'],
        [/\bbefore\b/i,'Before'],
        [/\beach time\b/i,'Each time'],
        [/\beach\s+(?:stack|point|charge|mark|sigil|tentacle|card)\b[^,.!?;]{0,80}\b(?:removed|consumed|spent|lost|gained|played|used|triggered)?/i,'按资源数量'],
        [/\bfor (?:each|every)\b/i,'For each/every'],
        [/\bat (?:the )?(?:turn|battle) (?:start|end)\b/i,'回合/战斗时点'],
        [/\bwithin this turn\b/i,'本回合条件']
      ];
      for(const [re,label] of rules)if(re.test(prefix))return {conditional:true,conditionLabel:label,conditionPrefix:prefix.trim()};
      return {conditional:false,conditionLabel:null,conditionPrefix:''};
    }

    function damageRuntimeHints(skill,rank,ctx={}){
      const text=String(skill?.descriptionTemplate||'');
      const messages=[];
      let needsHitOverride=false,minHits=null,maxHits=null;

      let match=text.match(/(\d+)\s*~\s*\[([^\]]+)\]\s*\{plural:[^}]*\|time\|times\}/i);
      if(match){
        minHits=Math.max(1,Math.floor(num(match[1],1)));
        maxHits=Math.max(minHits,Math.floor(num(resolveTemplateArg(skill,match[2],rank,ctx),minHits)));
        needsHitOverride=true;
        messages.push(`该技能段数为 ${minHits}~${maxHits}，取决于战斗内随机/资源状态；请填写“本次实际伤害段数”。`);
      }

      match=text.match(/\bX\s*\+\s*(\d+)\s*(?:times?|hits?)/i);
      if(match){
        needsHitOverride=true;
        messages.push(`该技能段数包含 X+${match[1]}，X 取决于本次消耗的算力/技能状态；请填写实际伤害段数。`);
      }

      const conditionalHitPatterns=[
        /If [^.]+?,\s*deal\s+(\d+)\s+additional\s+(?:hit|instance)s?\s+of\s+DMG/i,
        /If [^.]+?,\s*deal(?:s)?\s+(?:DMG\s+)?(\d+)\s+more\s+times/i,
        /Deals?\s+(\d+)\s+extra\s+instance(?:s)?\s+of\s+DMG\s+in\s+Boss Battles/i,
        /If [^.]+?,\s*deal\s+(\d+)\s+additional\s+hit/i
      ];
      if(conditionalHitPatterns.some(re=>re.test(text))){
        needsHitOverride=true;
        messages.push('该技能存在条件额外段数（例如低生命/首领战/特定状态）；默认不擅自触发，可填写本次实际伤害段数。');
      }
      if(/each\s+causing\s+an\s+additional\s+instance\s+of\s+DMG/i.test(text)){
        needsHitOverride=true;
        messages.push('该技能的额外段数取决于消耗/持有的战斗资源；请填写本次实际伤害段数。');
      }

      if(/(?:for each|per)\s+[^.]{0,100}\bBase DMG\b|\bBase DMG\b[^.]{0,100}(?:for each|per)/i.test(text)){
        messages.push('技能含按战斗状态动态变化的基础伤害；未提供对应状态时不会自动假定层数。');
      }
      if(/\bFinal DMG\b[^.]{0,120}(?:for each|per|stack)|(?:for each|per)\s+[^.]{0,120}\bFinal DMG\b/i.test(text)){
        messages.push('技能含按层数/状态动态变化的最终伤害；未提供对应状态时不会自动假定层数。');
      }
      if(/\bBase DMG\b[^.]{0,80}\bwhen\b|\bwhen\b[^.]{0,80}\bBase DMG\b/i.test(text)){
        messages.push('技能含条件 Base DMG 加成；只有条件明确输入后才应计入。');
      }
      if(/\{Aftershock\}\s*:[^.]*?(?:Tentacle|DMG)/i.test(text)){
        messages.push('技能含“余震”伤害/触腕事件；余震是否实际触发取决于战斗状态，当前默认不自动计入。');
      }
      if(/\{Leap\}\s*:[^.]*?(?:DMG|\{STR\}|\{Tentacle DMG\})/i.test(text)){
        messages.push('技能含“跃迁”条件伤害/力量/触腕修正；当前默认不把跃迁条件强行计入。');
      }
      if(/(?:\{Leap\}|\{Aftershock\}|\bIf\b|\bWhen\b|\bWhenever\b|\bUpon\b|\bAfter\b|\bFor each\b)[^.\n]{0,220}\[Damage:[^\]]+\]/i.test(text)){
        messages.push('检测到条件伤害事件：默认只结算无条件伤害；条件伤害未满足时不会自动加入，避免把跃迁/条件分支高算。');
      }
      const hasIndirectDamageDefinition=/\b(?:shuffle|add|put|create|generate)\b[^.!?]{0,220}\bthat\s+deals?\s+\[Damage:[^\]]+\]/i.test(text);
      if(hasIndirectDamageDefinition){
        needsHitOverride=false;minHits=null;maxHits=null;
        for(let i=messages.length-1;i>=0;i--){
          if(/段数|额外段数|额外.*instance|实际伤害段数/.test(messages[i]))messages.splice(i,1);
        }
        messages.push('检测到“生成/洗入另一张卡牌时描述其伤害”的间接 Damage 公式：该倍率与段数属于生成卡，不计入当前卡本次伤害；请直接选择对应派生卡计算。');
      }

      const conditionalStatusPattern=/(?:\{Devour\}|\{Leap\}|\{Aftershock\}|\{Resonance[^}]*\}|\bsubsequent\b|\bwhenever\b|\bwhen\b|\bif\b|\bupon\b|\bafter\s+(?:playing|being played|releasing|unleashing|using|taking|dealing|receiving|gaining|losing|removing|the\s+(?:turn|battle)|this\s+(?:turn|card)|each|every|next|an?\s+enemy)\b|\bbefore\b|\beach time\b|\beach\s+(?:stack|point|charge|mark|sigil|tentacle|card)\b|\bfor (?:each|every)\b|\bat (?:the )?(?:turn|battle) (?:start|end)\b)[^.\n]*(?:\{Poison\}|\{Counter\}|\{Bleed\}|\{Corrosion\})/i;
      if(conditionalStatusPattern.test(text)){
        messages.push('检测到条件式中毒 / 反击 / 流血 / 侵蚀：默认不把条件事件直接计入本次技能；请按实际战斗状态手动补充当前层数或等待专用条件输入。');
      }
      if(/Tentacle\s+(?:performs?|makes?)\s+(?:an?\s+)?attack[^.]*?(?:gain|gains)\s+\{Counter\}[^.]*?DMG dealt/i.test(text)){
        messages.push('检测到“触腕立即攻击并按本次伤害获得反击”的复合事件；当前不自动猜测其攻击时序/目标，未计入该复合事件。');
      }
      if(/Fixed\s+\{Corrosion\}[^.]*?Max HP/i.test(text)){
        messages.push('检测到依赖施放者最大生命的固定侵蚀；当前角色伤害面板没有可靠的实时最大生命状态，该部分不自动求值。');
      }
      return {needsHitOverride,minHits,maxHits,messages:[...new Set(messages)]};
    }

    function damageEvents(skill,rank,ctx={}){
      const template=String(skill?.descriptionTemplate||'');
      const events=[];let index=0,groupIndex=0;
      const primaryGroups=[];
      const damageTokenCount=(template.match(/\[Damage:[^\]]+\]/gi)||[]).length;
      const actualHitOverride=damageTokenCount===1&&Number.isFinite(Number(ctx.actualHitCount))&&Number(ctx.actualHitCount)>0
        ?Math.max(1,Math.floor(Number(ctx.actualHitCount))):null;

      for(const match of template.matchAll(/\[Damage:([^\]]+)\]/gi)){
        const argName=match[1],tokenStart=match.index||0,tokenEnd=tokenStart+match[0].length;
        const coefficient=num(resolveArg(skill?.descriptionArgs?.[argName],rank,ctx),0);
        const count=actualHitOverride??inferDamageRepeatCount(template,tokenStart,tokenEnd,skill,rank,ctx);
        const type=damageTokenType(template,tokenEnd);
        const critBonuses=damageCritBonuses(skill,template,tokenEnd,rank,ctx);
        const indirectDefinition=damageIsIndirectDefinition(template,tokenStart);
        const groupId=`damage-group-${++groupIndex}`;
        primaryGroups.push({groupId,position:tokenStart});
        for(let hit=0;hit<count;hit++){
          events.push({
            id:`${type}-${index+1}`,
            index:index++,
            position:tokenStart+(hit*0.0001),
            groupId,
            indirectDefinition,
            type,
            source:'skill',
            argName,
            coefficient,
            stat:skill?.descriptionArgs?.[argName]?.stat||'ATK',
            hit:hit+1,
            hitCount:count,
            strengthMultiplier:damageStrengthMultiplier(skill,template,tokenStart,tokenEnd,rank,ctx,type),
            tentacleBonusCoefficient:damageTentacleBonusCoefficient(skill,template,tokenEnd,rank,ctx),
            counterBonusCoefficient:damageCounterBonusCoefficient(skill,template,tokenEnd,rank,ctx),
            critRateBonus:critBonuses.critRateBonus,
            critDamageBonus:critBonuses.critDamageBonus,
            usesStrength:type==='active'||/\{STR\}\s+bonus/i.test(template.slice(tokenEnd,tokenEnd+180)),
            guaranteedCrit:/(?:guaranteed\s+Critical(?:\s+Hit)?\s+DMG|always\s+critically\s+hits?)/i.test(template.slice(tokenEnd,tokenEnd+160)),
            activeSource:type==='active'
          });
        }
      }

      for(const match of template.matchAll(/(?:Deal|deals?)\s+\[([^\]]+)\]\s+\{Fixed DMG\}/gi)){
        const argName=String(match[1]).includes(':')?String(match[1]).split(':').pop():match[1];
        const arg=skill?.descriptionArgs?.[argName],value=num(resolveArg(arg,rank,ctx),0);
        events.push({
          id:`fixed-${index+1}`,index:index++,position:(match.index||0)+0.1,
          type:'fixed',source:'skill',
          basis:arg?.stat?'statPercent':'flat',
          stat:arg?.stat||null,percent:arg?.stat?value:null,amount:arg?.stat?null:value,
          activeSource:false
        });
      }
      for(const match of template.matchAll(/(?:Deal|deals?)\s+\{Fixed DMG\}\s+equal to\s+\[([^\]]+)\]%?\s+\{Tentacle DMG\}/gi)){
        const percent=num(resolveTemplateArg(skill,match[1],rank,ctx),0);
        events.push({
          id:`fixed-${index+1}`,index:index++,position:(match.index||0)+0.1,
          type:'fixed',source:'skill',basis:'tentacle',percent,activeSource:false
        });
      }

      const purePattern=/\{Pure DMG\}\s+equal to\s+(?:\[([^\]]+)\]|(\d+(?:\.\d+)?))%\s+of\s+(?:(?:the|a)\s+)?(?:target(?:'s|’s)|enemy(?:'s|’s)|each enemy(?:'s|’s)|their)\s+(?:Max|max)\s+HP/gi;
      for(const match of template.matchAll(purePattern)){
        const percent=match[1]!==undefined
          ?num(resolveTemplateArg(skill,match[1],rank,ctx),0)
          :num(match[2],0);
        events.push({
          id:`pure-${index+1}`,index:index++,position:(match.index||0)+0.2,
          type:'pure',source:'skill',basis:'targetMaxHp',percent,activeSource:false
        });
      }

      const pureGenericTargetPattern=/\{Pure DMG\}\s+equal to\s+(?:\[([^\]]+)\]|(\d+(?:\.\d+)?))%\s+of\s+(?:the\s+)?Max\s+HP\s+to\s+(?:the\s+)?(?:enemy|enemies|back-row enemies|front-row enemies)/gi;
      for(const match of template.matchAll(pureGenericTargetPattern)){
        const percent=match[1]!==undefined
          ?num(resolveTemplateArg(skill,match[1],rank,ctx),0)
          :num(match[2],0);
        events.push({
          id:`pure-${index+1}`,index:index++,position:(match.index||0)+0.2,
          type:'pure',source:'skill',basis:'targetMaxHp',percent,activeSource:false
        });
      }

      const tentaclePiercePattern=/Command all Tentacles to attack(?: all enemies)?\s+\[([^\]]+)\]\s+\{plural:[^}]+\},?\s+dealing\s+\[([^\]]+)\]%?\s+\{Pierce DMG\}/gi;
    for(const match of template.matchAll(tentaclePiercePattern)){
      const attacks=Math.max(1,Math.floor(num(resolveTemplateArg(skill,match[1],rank,ctx),1)));
      const percent=num(resolveTemplateArg(skill,match[2],rank,ctx),0);
      events.push({
        id:`pierce-tentacle-${index+1}`,index:index++,position:(match.index||0)+0.15,
        type:'pierce',source:'skill',basis:'tentacle',percent,attacksPerTentacle:attacks,
        activeSource:false
      });
    }

    const nearestPrimaryGroup=position=>{
        let found=null;
        for(const group of primaryGroups){if(group.position<=position)found=group;else break}
        return found?.groupId||null;
      };

      for(const match of template.matchAll(/inflict\s+\[([^\]]+)\]%?\s+of\s+(?:the\s+)?DMG(?:\s+dealt)?\s+as\s+\{Poison\}/gi)){
        const percent=num(resolveTemplateArg(skill,match[1],rank,ctx),0);
        events.push({
          id:`poison-apply-${index+1}`,index:index++,position:(match.index||0)+0.3,
          type:'poison',action:'apply',source:'skill',basis:'sourceDamage',
          sourceGroupId:nearestPrimaryGroup(match.index||0),percent,activeSource:false
        });
      }
      for(const match of template.matchAll(/inflict\s+an\s+equal\s+amount\s+of\s+\{Poison\}/gi)){
        events.push({
          id:`poison-apply-${index+1}`,index:index++,position:(match.index||0)+0.3,
          type:'poison',action:'apply',source:'skill',basis:'sourceDamage',
          sourceGroupId:nearestPrimaryGroup(match.index||0),percent:100,
          tentacleBonusCoefficient:statusTentacleBonusCoefficient(skill,template,match.index||0,rank,ctx),activeSource:false
        });
      }
      for(const match of template.matchAll(/(?:apply|inflict)?\s*(?:an\s+)?equal\s+(?:amount\s+of\s+)?\{Poison\}/gi)){
        // Avoid duplicating the stricter "inflict an equal amount" pattern above.
        if(/inflict\s+an\s+equal\s+amount\s+of\s+\{Poison\}/i.test(match[0]))continue;
        events.push({
          id:`poison-apply-${index+1}`,index:index++,position:(match.index||0)+0.3,
          type:'poison',action:'apply',source:'skill',basis:'sourceDamage',
          sourceGroupId:nearestPrimaryGroup(match.index||0),percent:100,
          tentacleBonusCoefficient:statusTentacleBonusCoefficient(skill,template,match.index||0,rank,ctx),activeSource:false
        });
      }

      for(const match of template.matchAll(/inflict\s+\[\{Poison\}:([^\]]+)\][^.!?]*?\{Poison\}/gi)){
        const argName=match[1],arg=skill?.descriptionArgs?.[argName];
        const value=num(resolveArg(arg,rank,ctx),0);
        events.push({
          id:`poison-apply-${index+1}`,index:index++,position:(match.index||0)+0.25,
          type:'poison',action:'apply',source:'skill',
          basis:arg?.stat?'statPercent':'flat',
          stat:arg?.stat||null,amount:arg?.stat?null:value,percent:arg?.stat?value:null,
          activeSource:false
        });
      }
      for(const match of template.matchAll(/(?:inflict|apply)\s+\[([^\]]+)\]\s+\{Poison\}/gi)){
        if(String(match[1]).startsWith('{Poison}:'))continue;
        const argName=String(match[1]).includes(':')?String(match[1]).split(':').pop():match[1];
        const arg=skill?.descriptionArgs?.[argName];
        const value=num(resolveArg(arg,rank,ctx),0);
        events.push({
          id:`poison-apply-${index+1}`,index:index++,position:(match.index||0)+0.25,
          type:'poison',action:'apply',source:'skill',
          basis:arg?.stat?'statPercent':'flat',
          stat:arg?.stat||null,amount:arg?.stat?null:value,percent:arg?.stat?value:null,
          activeSource:false
        });
      }

      for(const match of template.matchAll(/\{Poison\}\s+equal to\s+\[([^\]]+)\]%?\s+(?:of\s+)?DMG dealt/gi)){
        const percent=num(resolveTemplateArg(skill,match[1],rank,ctx),0);
        events.push({
          id:`poison-apply-${index+1}`,index:index++,position:(match.index||0)+0.3,
          type:'poison',action:'apply',source:'skill',basis:'sourceDamage',
          sourceGroupId:nearestPrimaryGroup(match.index||0),percent,
          tentacleBonusCoefficient:statusTentacleBonusCoefficient(skill,template,match.index||0,rank,ctx),
          activeSource:false
        });
      }
      for(const match of template.matchAll(/(?:inflict|apply)?\s*\{Poison\}\s+(?:equal to|with)\s+(?:\[([^\]]+)\]|(\d+(?:\.\d+)?))%\s+(?:of\s+)?(?:the\s+)?(?:DMG|Damage)(?:\s+dealt)?/gi)){
        const percent=match[1]!==undefined
          ?num(resolveTemplateArg(skill,match[1],rank,ctx),0)
          :num(match[2],0);
        events.push({
          id:`poison-apply-${index+1}`,index:index++,position:(match.index||0)+0.31,
          type:'poison',action:'apply',source:'skill',basis:'sourceDamage',
          sourceGroupId:nearestPrimaryGroup(match.index||0),percent,
          tentacleBonusCoefficient:statusTentacleBonusCoefficient(skill,template,match.index||0,rank,ctx),
          activeSource:false
        });
      }
      for(const match of template.matchAll(/\[Counterattack:([^\]]+)\][^.!?]*?\{Counter\}/gi)){
        const argName=match[1],arg=skill?.descriptionArgs?.[argName];
        const value=num(resolveArg(arg,rank,ctx),0);
        events.push({
          id:`counter-gain-${index+1}`,index:index++,position:(match.index||0)+0.25,
          type:'counter',action:'gain',source:'skill',
          basis:arg?.stat?'statPercent':'flat',
          stat:arg?.stat||null,amount:arg?.stat?null:value,percent:arg?.stat?value:null,
          activeSource:false
        });
      }
      for(const match of template.matchAll(/(?:gain|obtain)\s+(?:an\s+)?equal\s+amount\s+of\s+\{Counter\}/gi)){
        events.push({
          id:`counter-gain-${index+1}`,index:index++,position:(match.index||0)+0.24,
          type:'counter',action:'gain',source:'skill',basis:'sourceDamage',
          sourceGroupId:nearestPrimaryGroup(match.index||0),percent:100,
          tentacleBonusCoefficient:statusTentacleBonusCoefficient(skill,template,match.index||0,rank,ctx),
          activeSource:false
        });
      }
      for(const match of template.matchAll(/(?:gain|obtain)\s+(?:Temporary\s+)?\{Counter\}\s+(?:for|equal to)\s+(?:\[([^\]]+)\]|(\d+(?:\.\d+)?))%\s+of\s+(?:the\s+)?DMG dealt/gi)){
        const percent=match[1]!==undefined
          ?num(resolveTemplateArg(skill,match[1],rank,ctx),0)
          :num(match[2],0);
        events.push({
          id:`counter-gain-${index+1}`,index:index++,position:(match.index||0)+0.25,
          type:'counter',action:'gain',source:'skill',basis:'sourceDamage',
          sourceGroupId:nearestPrimaryGroup(match.index||0),percent,
          tentacleBonusCoefficient:statusTentacleBonusCoefficient(skill,template,match.index||0,rank,ctx),activeSource:false
        });
      }

      for(const match of template.matchAll(/(?:gain|obtain)\s+\{(?:Temporary )?Counter\}\s+equal to\s+\[([^\]]+)\]%?\s+(?:of\s+)?DMG dealt/gi)){
        const percent=num(resolveTemplateArg(skill,match[1],rank,ctx),0);
        events.push({
          id:`counter-gain-${index+1}`,index:index++,position:(match.index||0)+0.25,
          type:'counter',action:'gain',source:'skill',basis:'sourceDamage',
          sourceGroupId:nearestPrimaryGroup(match.index||0),percent,
          tentacleBonusCoefficient:statusTentacleBonusCoefficient(skill,template,match.index||0,rank,ctx),activeSource:false
        });
      }
      for(const match of template.matchAll(/(?:gain|obtain)\s+\{(?:Temporary )?Counter\}\s+equal to\s+\[([^\]]+)\]%?\s+of\s+(ATK|DEF|CON)/gi)){
        const percent=num(resolveTemplateArg(skill,match[1],rank,ctx),0);
        events.push({
          id:`counter-gain-${index+1}`,index:index++,position:(match.index||0)+0.25,
          type:'counter',action:'gain',source:'skill',basis:'statPercent',
          stat:String(match[2]).toUpperCase(),percent,activeSource:false
        });
      }

      for(const match of template.matchAll(/\[Corrosion:([^\]]+)\][^.!?]*?\{Corrosion\}/gi)){
        const argName=match[1],arg=skill?.descriptionArgs?.[argName];
        const value=num(resolveArg(arg,rank,ctx),0);
        events.push({
          id:`corrosion-apply-${index+1}`,index:index++,position:(match.index||0)+0.25,
          type:'corrosion',action:'apply',source:'skill',
          basis:arg?.stat?'statPercent':'flat',
          stat:arg?.stat||null,amount:arg?.stat?null:value,percent:arg?.stat?value:null,
          activeSource:false
        });
      }
      for(const match of template.matchAll(/(?:additionally\s+)?(?:inflict|apply)\s+\{Corrosion\}\s+equal to\s+(?:\[([^\]]+)\]|(\d+(?:\.\d+)?))%\s+of\s+(?:the\s+)?target['’]s\s+Max\s+HP/gi)){
        const percent=match[1]!==undefined
          ?num(resolveTemplateArg(skill,match[1],rank,ctx),0)
          :num(match[2],0);
        events.push({
          id:`corrosion-apply-${index+1}`,index:index++,position:(match.index||0)+0.25,
          type:'corrosion',action:'apply',source:'skill',basis:'targetMaxHpPercent',percent,activeSource:false
        });
      }
      for(const match of template.matchAll(/(?:inflict|apply)\s+(?:an\s+)?equal\s+amount\s+of\s+\{Corrosion\}/gi)){
        events.push({
          id:`corrosion-apply-${index+1}`,index:index++,position:(match.index||0)+0.3,
          type:'corrosion',action:'apply',source:'skill',basis:'sourceDamage',
          sourceGroupId:nearestPrimaryGroup(match.index||0),percent:100,activeSource:false
        });
      }
      for(const match of template.matchAll(/(?:inflict|apply)[^.!?]{0,80}\{Corrosion\}\s+(?:stacks\s+)?equal to\s+(?:the\s+)?DMG dealt/gi)){
        events.push({
          id:`corrosion-apply-${index+1}`,index:index++,position:(match.index||0)+0.3,
          type:'corrosion',action:'apply',source:'skill',basis:'sourceDamage',
          sourceGroupId:nearestPrimaryGroup(match.index||0),percent:100,activeSource:false
        });
      }

      for(const match of template.matchAll(/(?:apply|inflict)?\s*(?:an\s+)?equal\s+(?:amount\s+of\s+)?\{Bleed\}/gi)){
        events.push({
          id:`bleed-apply-${index+1}`,index:index++,position:(match.index||0)+0.3,
          type:'bleed',action:'apply',source:'skill',basis:'sourceDamage',
          sourceGroupId:nearestPrimaryGroup(match.index||0),percent:100,activeSource:false
        });
      }
      for(const match of template.matchAll(/(?:inflict|apply)?\s*\{Bleed\}\s+equal to\s+(?:\[([^\]]+)\]|(\d+(?:\.\d+)?))%\s+(?:of\s+)?(?:the\s+)?DMG dealt/gi)){
        const percent=match[1]!==undefined
          ?num(resolveTemplateArg(skill,match[1],rank,ctx),0)
          :num(match[2],0);
        events.push({
          id:`bleed-apply-${index+1}`,index:index++,position:(match.index||0)+0.3,
          type:'bleed',action:'apply',source:'skill',basis:'sourceDamage',
          sourceGroupId:nearestPrimaryGroup(match.index||0),percent,activeSource:false
        });
      }
      for(const match of template.matchAll(/(?:inflict|apply)\s+(?:\[([^\]]+)\]|(\d+(?:\.\d+)?))%\s+(?:of\s+)?(?:the\s+)?DMG dealt\s+as\s+\{Bleed\}/gi)){
        const percent=match[1]!==undefined
          ?num(resolveTemplateArg(skill,match[1],rank,ctx),0)
          :num(match[2],0);
        events.push({
          id:`bleed-apply-${index+1}`,index:index++,position:(match.index||0)+0.3,
          type:'bleed',action:'apply',source:'skill',basis:'sourceDamage',
          sourceGroupId:nearestPrimaryGroup(match.index||0),percent,activeSource:false
        });
      }
      for(const match of template.matchAll(/trigger(?:s|ed)?\s+(?:(?:the\s+)?target['’]s\s+)?(?:\[([^\]]+)\]|(\d+(?:\.\d+)?))%\s+(?:of\s+)?\{Bleed\}/gi)){
        const percent=match[1]!==undefined
          ?num(resolveTemplateArg(skill,match[1],rank,ctx),0)
          :num(match[2],0);
        events.push({
          id:`bleed-trigger-${index+1}`,index:index++,position:(match.index||0)+0.3,
          type:'bleed',action:'trigger',source:'skill',basis:'currentBleed',percent,activeSource:false
        });
      }

      for(const match of template.matchAll(/trigger(?:s|ed)?\s+(?:\[([^\]]+)\]|(\d+(?:\.\d+)?))%\s+(?:(?:of\s+)?(?:(?:the\s+)?target['’]s\s+)?)?\{Poison\}/gi)){
        const percent=match[1]!==undefined
          ?num(resolveTemplateArg(skill,match[1],rank,ctx),0)
          :num(match[2],0);
        const tail=template.slice((match.index||0)+match[0].length,(match.index||0)+match[0].length+220);
        const critMatch=tail.match(/If\s+a\s+Critical\s+Hit\s+occurs,?\s*the\s+trigger\s+(?:ratio|rate)\s+increases\s+to\s+(?:\[([^\]]+)\]|(\d+(?:\.\d+)?))%/i);
        const critPercent=critMatch
          ?(critMatch[1]!==undefined?num(resolveTemplateArg(skill,critMatch[1],rank,ctx),percent):num(critMatch[2],percent))
          :null;
        events.push({
          id:`poison-trigger-${index+1}`,index:index++,position:(match.index||0)+0.3,
          type:'poison',action:'trigger',source:'skill',basis:'currentPoison',percent,
          critPercent:Number.isFinite(Number(critPercent))?Number(critPercent):null,
          sourceGroupId:nearestPrimaryGroup(match.index||0),activeSource:false
        });
      }

      for(const match of template.matchAll(/trigger\s+(?:\[([^\]]+)\]|(\d+(?:\.\d+)?))%\s+(?:of\s+)?\{Counter\}/gi)){
        const percent=match[1]!==undefined
          ?num(resolveTemplateArg(skill,match[1],rank,ctx),0)
          :num(match[2],0);
        events.push({
          id:`counter-trigger-${index+1}`,index:index++,position:(match.index||0)+0.3,
          type:'counter',action:'trigger',source:'skill',basis:'currentCounter',percent,activeSource:false
        });
      }

      for(const event of events){
        if(['active','pierce','pure','fixed','poison','counter','bleed','corrosion'].includes(event.type)){
          Object.assign(event,eventConditionalContext(template,event.position));
        }
      }
      const automaticEvents=events.filter(event=>!event.conditional&&!event.indirectDefinition);
      const seenEventKeys=new Set();
      const deduped=automaticEvents.filter(event=>{
        const key=[event.type,event.action||'',Math.floor((event.position||0)*10),event.basis||'',event.sourceGroupId||'',event.argName||'',event.hit??'',event.percent??'',event.coefficient??''].join('|');
        if(seenEventKeys.has(key))return false;
        seenEventKeys.add(key);return true;
      });
      deduped.sort((a,b)=>(a.position-b.position)||(a.index-b.index));
      return deduped;
    }

    function directAtkCoefficients(skill,rank,ctx){
      return damageEvents(skill,rank,ctx)
        .filter(x=>x.type==='active'||x.type==='pierce')
        .map(x=>x.coefficient);
    }

    function directAtkCoefficient(skill,rank,ctx){
      return directAtkCoefficients(skill,rank,ctx)[0]||0;
    }

    function directAtkCoefficientSum(skill,rank,ctx){
      return directAtkCoefficients(skill,rank,ctx).reduce((sum,value)=>sum+num(value,0),0);
    }

    const DZONE_GENERIC_HP_FIT={
      seasons:'60-69',
      sampleCount:1665,
      minLevel:35,
      maxLevel:103,
      logIntercept:2.4817265231447854,
      logSlope:0.11550437175178609
    };

    function estimatedEnemyMaxHp(level){
      const lv=clamp(num(level,77),1,120);
      return Math.max(1,Math.round(Math.exp(DZONE_GENERIC_HP_FIT.logIntercept+DZONE_GENERIC_HP_FIT.logSlope*lv)));
    }

    function accountStageGrowth(level){
      const curve=gameplayMathMetadata?.accountLevelCurve;
      const values=curve?.stageGrow;
      if(!Array.isArray(values)||!values.length)return null;
      const min=Math.floor(num(curve.minLevel,1)),max=Math.floor(num(curve.maxLevel,min+values.length-1));
      const lv=num(level,min);
      if(lv<=min)return num(values[0],1);
      if(lv<=max){
        const lo=Math.floor(lv),hi=Math.ceil(lv);
        const a=num(values[clamp(lo-min,0,values.length-1)],1);
        const b=num(values[clamp(hi-min,0,values.length-1)],a);
        return a+(b-a)*(lv-lo);
      }
      const last=num(values[values.length-1],1),prev=num(values[Math.max(0,values.length-2)],last);
      return last+Math.max(0,lv-max)*Math.max(1,last-prev);
    }

    function genericEnemyLevelFactor(characterLevel,enemyLevel){
      const charGrowth=accountStageGrowth(characterLevel),enemyGrowth=accountStageGrowth(enemyLevel);
      if(charGrowth&&enemyGrowth)return clamp(Math.sqrt(charGrowth/enemyGrowth),0.65,1.35);
      return clamp(Math.exp(-0.012*(num(enemyLevel,77)-num(characterLevel,77))),0.65,1.35);
    }

    function genericEnemyProfile(enemyLevel,characterLevel){
      const level=clamp(Math.round(num(enemyLevel,77)),1,120);
      return {
        level,
        estimatedMaxHp:estimatedEnemyMaxHp(level),
        levelFactor:genericEnemyLevelFactor(characterLevel,level),
        source:{
          hpFit:`SKeyDB D-Zone seasons ${DZONE_GENERIC_HP_FIT.seasons}, ${DZONE_GENERIC_HP_FIT.sampleCount} level/HP samples`,
          levelFactor:'generic relative level model using SKeyDB account stage-growth curve; not an official enemy DEF formula'
        }
      };
    }


  function tentacleBonusCoefficient(skill,rank,ctx){
    const t=String(skill?.descriptionTemplate||'');
    const patterns=[
      /(?:equal to|with (?:a|an)|enjoys? (?:a|an)?|receives? (?:a|an)?)\s*\[([^\]]+)\]%\s*\{Tentacle DMG\}(?:\s*Bonus)?/i,
      /\[([^\]]+)\]%\s*\{Tentacle DMG\}\s*(?:bonus|Bonus)/i,
      /additionally\s+gaining\s*\[([^\]]+)\]%\s*\{Tentacle DMG\}/i,
      /enjoys?\s+(?:an?\s+)?additional\s*\[([^\]]+)\]%\s*\{Tentacle DMG\}/i
    ];
    for(const re of patterns){
      const m=t.match(re);if(!m)continue;
      const name=m[1].includes(':')?m[1].split(':').pop():m[1];
      return num(resolveArg(skill?.descriptionArgs?.[name],rank,ctx),0);
    }
    return 0;
  }

  function triggeredTentaclePercent(skill,rank,ctx){
    const text=String(skill?.descriptionTemplate||'');
    const clauses=text.split(/(?<=[.!?])\s+|\n+/).map(x=>x.trim()).filter(Boolean);
    for(const clause of clauses){
      const triggerPos=clause.search(/(?:trigger|command|causes?)\s+1\s+Tentacle(?:\s+Attack)?\s*(?:to\s+)?attack?/i);
      if(triggerPos<0)continue;
      const prefix=clause.slice(0,triggerPos);
      if(/\{[^}]+\}\s*:\s*$/i.test(prefix)||/\b(if|when|whenever|after|before|upon|once)\b/i.test(prefix))continue;
      const explicit=clause.match(/(?:trigger|command|causes?)\s+1\s+Tentacle(?:\s+Attack)?[^.!?\n]*?(?:dealing|deal)\s*\[([^\]]+)\]%\s*\{Tentacle DMG\}/i);
      if(explicit){
        const name=explicit[1].includes(':')?explicit[1].split(':').pop():explicit[1];
        return num(resolveArg(skill?.descriptionArgs?.[name],rank,ctx),0);
      }
      return 100;
    }
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
    // Only auto-apply Soulforge Base-DMG bonuses that clearly target the whole Awakener.
    // Named-card / Strike / Command-Card bonuses are left scoped instead of leaking to every skill.
    const broadBasePatterns=[
      /(?:^|[.\n]\s*)(?:This Awakener's|[A-Za-z][A-Za-z :'-]{0,40}'s)\s+Base DMG\s*\+\[([^\]]+)\]%/i,
      /Base DMG caused by [^.]+\s*\+\[([^\]]+)\]%/i,
      /All Awakeners['’][^.]*\bBase DMG\s*\+\[([^\]]+)\]%/i
    ];
    const baseDmgMatch=broadBasePatterns.map(re=>template.match(re)).find(Boolean)||null;
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
  }={}){
    const mastery=num(realmMastery,0),masteryMultFactor=Math.max(0,num(masteryEffectMultiplier,1));
    const effectiveMastery=mastery*masteryMultFactor;
    const hp=Math.max(0,num(teamMaxHp));
    const coexistenceBase=hp*Math.max(0,num(extraBaseMaxHpPct,0))/100;
    const base=(mode==='benthos'?hp*0.05:Math.max(0,num(currentTentacle)))+coexistenceBase;
    let stanceMult=1;
    if(mode==='standard'&&stance==='tranquil')stanceMult=0.5;
    if(mode==='standard'&&stance==='raging')stanceMult=1.25;
    if(mode==='benthos'&&stance==='raging')stanceMult=1.25;
    let masteryMult=1;
    if(mode==='benthos'&&stance==='raging')masteryMult=1+effectiveMastery*0.00025;
    const extraMult=1+num(extraBonusPct)/100;
    const attack=base*stanceMult*masteryMult*extraMult;
    const ragingTriggerPct=mode==='benthos'?100:(50+Math.floor(effectiveMastery/50));
    const turnEndAllowed=!(mode==='benthos'&&stance==='tranquil');
    return {base,coexistenceBase,stanceMult,masteryMult,masteryEffectMultiplier:masteryMultFactor,effectiveMastery,extraMult,attack,ragingTriggerPct,turnEndAllowed};
  }
  window.MorimensFormulaEngine={
    primaryStat,substat,contextFor,setGameplayMathMetadata,publicFormulaContext,resolveScaledBaseFormula,resolveArg,damageRuntimeHints,damageEvents,directAtkCoefficients,directAtkCoefficient,directAtkCoefficientSum,estimatedEnemyMaxHp,genericEnemyLevelFactor,genericEnemyProfile,tentacleBonusCoefficient,triggeredTentaclePercent,resolveProgression,statsWithProgression,resolveTentacle,
    source:{
      primary:'SKeyDB src/domain/awakener-level-scaling.ts',
      descriptionArgs:'SKeyDB src/domain/description-args.ts + public-description-args.ts',
      enemyProfile:'SKeyDB D-Zone seasons 60-69 level/HP sample fit + generic relative level factor',
      damageEvents:['overlay.global.poison','overlay.global.counter','overlay.global.pierce-dmg','overlay.global.pure-dmg','overlay.global.fixed-dmg'],
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

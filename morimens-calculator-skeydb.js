(()=>{
  const $=id=>document.getElementById(id);
  const isEnglish=()=>localStorage.getItem('morimens.language')==='en';
  const ui=(zh,en)=>isEnglish()?en:zh;
  const recordCache=new Map();
  let currentAwakener=null,currentSkills=[],currentSkill=null,currentTalents=[],currentEnlightens=[],currentOverlays=[];
  let wheelCatalog=[],covenantCatalog=[],relicCatalog=[],gameplayMathMeta=null,currentWheels=[null,null],currentCovenant=null,currentSignatureRelic=null;
  let applyingAuto=false,gearRealmMasteryAuto=0,wheelMainstatSummary=[];
  const auto={base:0,power:0,critRate:0,critDamage:0,vulnerability:0,final:0,realmMastery:0,aliemusRegen:0,keyflareRegen:0,sigilYield:0,deathResistance:0,poisonInfliction:0,fixedPoisonInfliction:0,poisonTrigger:0,counterGeneration:0};
  const trackedFields={power:'powerBonus',critRate:'critRate',critDamage:'critDamage',vulnerability:'vulnerability',final:'finalBonus'};
  const zhSkillNames={
    'derived.doresain.evernights-revel':'永夜','derived.pollux.sacred-heart':'圣心','derived.xu.betroth':'相许','derived.xu.enthrall':'夺魄',
    'skill.24.aberrant-vivisection':'畸变的解剖','skill.24.mediating-personalities':'调停人格',
    'skill.aigis.a-small-wish':'小小愿望','skill.aigis.decomposition':'石质分解','skill.aigis.eye-of-eternity':'万古之眸',
    'skill.clementine.call-of-shaggai':'妖虫的呼唤','skill.clementine.pain-extraction':'痛苦榨取','skill.clementine.soulsalve':'精神抚慰',
    'skill.doll-inferno.terminal-of-truth-and-abyss':'终点，真理与深渊之门','skill.doll-inferno.soulblight':'灵魂瘟疫',
    'skill.helot-catena.sanguine-fetters':'缚身锁链','skill.helot-catena.hatred-unleashed':'恨意宣泄','skill.helot-catena.crimson-shackles':'鲜血链条','skill.helot-catena.reapers-declaration':'索魂者宣言','derived.helot-catena.bloodthirsty-flail':'嗜血链球',
    'skill.kathigu-ra.karmic-embers':'业火重燃','skill.kathigu-ra.last-stand-salvo':'末路枪声','skill.kathigu-ra.solarflare':'千兆耀斑',
    'skill.lily.strike-to-protect':'报偿打击',
    'skill.ramona-timeworn.entropy-undone':'熵增逆转','skill.ramona-timeworn.predetermined-strike':'命定之剑',
    'skill.vortice.abyssal-vortex-cannon':'深渊！漩涡！炮！','skill.vortice.here-it-goes':'漩涡来了！','skill.vortice.reload':'装填！','derived.vortice.vortex-shell':'涡！流！弹！',
    'skill.wanda.spine-needle-chains':'脊刺锁链'
  };
  const SKEYDB_ICON_BASE='assets/morimens/skeydb-icons/';
  const uniqueTermZh={
    'Satiety':'饱足','Offering':'供奉','Corpse':'残骸','Sin Mark':'罪印','Symbiosis':'共生','Pack Hunt':'群猎','Negentropy':'负熵',
    'Undertow':'暗潮','Guilt':'罪责','Endure':'忍耐','Dreamlure':'梦引','Murmurs':'低语','Spellbound':'痴醉','Enthrall':'夺魄',
    'Weaver':'织命','Creativity':'创意','Fantasia':'幻想','Combust':'燃烧','Birth Ritual':'诞生仪式','Life Seal':'生命封印',
    'Finale':'终末','Finale Form':'终末形态','Fiamma':'活焰','Vortex Reload':'涡流装填','Mediating Personalities':'调停人格','Primordia Mastery Scaling':'原初界域精通缩放','Crimson Furnace':'猩红熔炉','Ultra Round':'超维回合','Realm Mastery':'界域精通','Damage Amplification':'伤害强效','DMG Amplification':'伤害强效','Team Unique':'队伍唯一','Anger':'愤怒','Fear':'恐惧','Grief':'悲伤','Happiness':'喜悦'
  };
    const globalTermMeta={
    'STR':['力量','IconS_Buff_021.webp','heal'],'Temporary STR':['临时力量','IconS_Buff_021.webp','heal'],'STR▼':['力量降低','IconS_Buff_037.webp','affliction'],
    'Vulnerable':['易伤','IconS_Buff_003.webp','damage'],'Weakness':['虚弱','IconS_Buff_005.webp','affliction'],'Poison':['中毒','IconS_Buff_006.webp','affliction'],
    'Counter':['反击','IconS_Buff_019.webp','shield'],'Bleed':['出血','IconS_Buff_022.webp','damage'],'Corrosion':['侵蚀','IconS_Buff_070.webp','affliction'],
    'Fortress':['护垒','IconS_Buff_046.webp','shield'],'Sacrifice':['献祭','IconS_Buff_041.webp','shield'],'Delayed Sacrifice':['延迟献祭','IconS_Buff_042.webp','shield'],
    'Ancient Embers':['旧日余烬','IconS_Buff_025.webp','affliction'],'Birth Ritual':['诞生仪式','IconS_Buff_079.webp','shield'],
    'Pure DMG':['纯粹伤害',null,'misc','✦'],'Fixed DMG':['固定伤害',null,'misc','◆'],'Pierce DMG':['穿透伤害',null,'misc','↯'],'Tentacle DMG':['触腕伤害',null,'misc','≋'],
    'Active DMG':['主动伤害',null,'damage','✧'],'Base DMG':['基础伤害',null,'damage','◇'],'Final DMG':['最终伤害',null,'damage','↑'],
    'Rouse':['灵知觉醒',null,'light','✦'],'Exalt':['狂气爆发',null,'light','✦'],'Over-Exalt':['超限爆发',null,'light','✦'],
    'Devour':['吞噬',null,'light','◉'],'Leap':['跃迁',null,'light','↗'],'Aftershock':['余震',null,'light','↻']
  };

  const zhCovenants={
    'Deus Ex Machina':'机械降神',
    'Re-evolution':'再衍化',
    'Scarlet Embrace':'猩红之拥',
    'Crimson Pulse':'猩红之悸',
    'Twisted Twins: Black':'扭曲双子·黑',
    "Burial Ground's Sighs":'埋骨地絮语',
    'Twisted Twins: White':'扭曲双子·白',
    'Cursed Rabbit':'诅咒兔',
    'Paradox':'二律背反',
    'Photosynthesis Ritual':'光合祭礼',
    'Returnal Line':'海归线',
    'Ring of Chamber 36':'36室之环',
    'Life Drain':'生机榨取',
    'April Tribute':'四月礼赞',
    'Organic Form':'有机形态',
    'Sweet Slug':'甜蜜蛞蝓',
    'Dream of Medicine':'入药之梦',
    'Feast from Afar':'远方的欢宴',
    'Unstained Chronicle':'无垢启示录',
    'Steppenwolf':'荒原狼',
    'Cocoon of the Maiden':'少女之蛹'
  };

  function data(){return window.MorimensData}
  function recordById(id){return data()?.db?.records?.find(x=>x.id===id)||null}
  function zhFor(rec){return data()?.zhFor?.(rec)||data()?.zhDb?.bySkeydbId?.[rec?.id]||data()?.identityDb?.bySkeydbId?.[rec?.id]||null}
  function labelForAwakener(rec){return isEnglish()?rec.name:(zhFor(rec)?.name||rec.name)}
  function labelForWheel(rec){return data()?.localizedEntity?.('wheel',rec)?.name||rec?.name||''}
  const realmZh={CHAOS:'混沌',CARO:'血肉',AEQUOR:'深海',ULTRA:'超维'};
  function realmLabel(value){const raw=String(value||'');return isEnglish()?raw:(realmZh[raw.toUpperCase()]||raw)}
  function wheelOptionLabel(wheel){return [labelForWheel(wheel),isEnglish()?wheel?.rarity:'',realmLabel(wheel?.realm)].filter(Boolean).join(' · ')}
  function escape(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function selectedAwakenerId(){return $('charSelect')?.selectedOptions?.[0]?.dataset?.awakenerId||$('charSelect')?.value||null}
  function num(v,fallback=0){const n=Number.parseFloat(v);return Number.isFinite(n)?n:fallback}
  function vulnerableStacks(){
    if($('targetVulnerable')?.checked!==true)return 0;
    const raw=Number.parseFloat($('targetVulnerableStacks')?.value);
    return Number.isFinite(raw)&&raw>0?Math.max(1,Math.floor(raw)):1;
  }
  function setText(id,text){const el=$(id);if(el)el.textContent=text}

  async function fetchRecord(scope,id){
    const key=`${scope}:${id}`;if(recordCache.has(key))return recordCache.get(key);
    const p=window.MorimensRepository.record(scope,id);recordCache.set(key,p);try{return await p}catch(e){recordCache.delete(key);throw e}
  }
  function currentFormulaContext(extra={}){
    const level=Math.max(1,Math.min(90,Number(characterLevelControl()?.value)||90));
    const engine=window.MorimensFormulaEngine;
    const base=currentAwakener&&engine?engine.statsWithProgression(currentAwakener,level,progressionState(),psycheSurgeLevel()):{};
    if($('realmMastery'))base.RealmMastery=num($('realmMastery').value,base.RealmMastery||0);
    if($('powerBonus'))base.DamageAmplification=num($('powerBonus').value,base.DamageAmplification||0);
    if($('critRate'))base.CritRate=num($('critRate').value,base.CritRate||0);
    if($('critDamage'))base.CritDamage=Math.max(0,num($('critDamage').value,100+num(base.CritDamage,50))-100);
    base.AliemusRegen=num(base.AliemusRegen,0)+num(auto.aliemusRegen,0);
    base.KeyflareRegen=num(base.KeyflareRegen,0)+num(auto.keyflareRegen,0);
    base.SigilYield=num(base.SigilYield,0)+num(auto.sigilYield,0);
    base.DeathResistance=num(base.DeathResistance,0)+num(auto.deathResistance,0);
    Object.assign(base,characterResourceValues());
    if(currentAwakener?.id==='awakener-0001'){
      const overExaltUses=Math.max(0,Math.floor(num(base.twentyFourOverExaltPriorUses,0)));
      base.RealmMastery=Math.max(0,num(base.RealmMastery,0))+24*overExaltUses;
    }
    base.realmMasteryFinal=Math.max(0,num(base.RealmMastery,0));
    base.psycheSurgeOffset=psycheSurgeLevel();
    base.accountLevel=Math.max(1,Math.floor(num($('formulaAccountLevel')?.value,50)));
    base.rouseActive=rouseActive();
    base.VulnerableStacks=vulnerableStacks();
    if(currentAwakener?.id==='awakener-0018'&&base.rouseActive&&selectedEnlightenSlot()==='AbsoluteAxiom'){
      base.DamageAmplification=num(base.DamageAmplification,0)+8*Math.min(10,Math.max(0,Math.floor(num(base.finaleStacks,0))));
    }
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
  const zhDescriptionOverrides={
    'enlighten.24.hysteria':'{Frenzied Slash} 基础伤害提高 33%。抑郁人格下，对应卡牌的算力消耗额外降低 1；躁狂人格下，伤害段数额外增加 1。',
    'enlighten.24.restraint-bonds':'{Symbiotic Aberration} 额外生成 2 狂气。抑郁状态下，对全体敌人施加 {Weakness}，持续 1 回合；躁狂状态下，对全体敌人施加 {Vulnerable}，持续 1 回合。',
    'enlighten.24.pavlovian-conditioning-study':'回合结束时，「24」获得 10 狂气。每次「24」释放狂气爆发后，本效果在本场战斗中获得的狂气 +1。',
    'enlighten.24.aberrant-vivisection':'获得 24 点界域精通。「24」的下一张指令卡生效 3 次。',
    'enlighten.24.animus-projection':'{Rouse}「调停人格」获得强化：「24」的指令卡人格效果加成翻倍；「24」每回合释放狂气爆发后，该翻倍效果在本回合失效。',
    'skill.24.frenzied-slash':'随机造成 [Damage:Arg1] 伤害，共 [Arg2] 段。抑郁人格：使手牌中算力消耗最高的 [DescArg1] 张卡牌算力消耗降低 1，并获得临时 {Retain}。躁狂人格：伤害段数 +[DescArg2]。',
    'skill.24.symbiotic-aberration':'对全体敌人造成 [Damage:Arg1] 伤害。「24」获得 [Energy:Arg2] 狂气。抑郁人格：其他唤醒体额外获得 [DescArg1] 倍狂气。躁狂人格：额外获得 [DescArg2] 倍狂气。',
    'skill.24.mediating-personalities':'「24」获得 [Energy:Arg1] 狂气。{Rouse}：根据当前队伍界域获得不同效果。{Chaos}：暴击率与暴击伤害 +[StateArg4]%。每使用 1 次钥令，「24」的狂气爆发最终伤害 +[StateArg1]%。{Aequor}：「24」造成的伤害享受 [StateArg2]% {Tentacle DMG} 加成，并施加等同于所造成伤害 10% 的 {Poison}；「24」的狂气爆发可触发敌人身上 50% 的 {Poison}。{Caro}：「24」每消耗 1 点算力，{Embryo Fusion} +[Blood:DescArg1]，「24」获得 [StateArg3] {STR}；其狂气爆发享受额外 300% {STR} 加成。{Ultra}：「24」造成的伤害享受 [StateArg5]% {Counter} 伤害加成。回合结束时将 1 张 {derived:Insight} 洗入弃牌堆，手牌上限 +2。',
    'skill.24.aberrant-vivisection':'获得 24 点界域精通。「24」的下一张指令卡生效 3 次。',
    'overlay.24.realm-and-persona':'探索开始时，「24」进入抑郁人格状态。{Chaos}·抑郁：获得 [StateArg1] 银钥能量；下一次钥令生效 2 次。{Chaos}·躁狂：造成 3 段伤害，并使「24」造成的所有伤害提高 [StateArg2]。{Aequor}·抑郁：对目标施加 {Weakness} 和 {Vulnerable}，持续 2 回合，并生成 1 只触腕，其 {Tentacle DMG} +[StateArg3]。{Aequor}·躁狂：本段伤害享受 [StateArg4]% {Tentacle DMG} 加成，并对全体敌人施加等同于伤害 30% 的 {Poison}。{Caro}·抑郁：{Embryo Fusion} +[Blood:StateArg5]，积累 [StateArg6] {Crimson Furnace}。{Caro}·躁狂：伤害享受 6 倍 {STR▼} 加成，并对目标施加等同于伤害 200% 的 {Bleed}，同时获得 [StateArg7] {STR▼}。{Ultra}·抑郁：将 2 张 {derived:Insight} 加入手牌，临时使目标的 {STR▼} 降低 [StateArg8]。{Ultra}·躁狂：获得等同于所造成伤害 15% 的 {Counter}，随后对其他敌人造成等量 {Pure DMG}。本回合每打出 1 张 {derived:Insight}，该伤害提高 [StateArg9]，最多 [StateArg10]。'
  };
  const sentenceZh=[
    [/Gain 1 Arithmetica in the first turn of each battle, and gain an additional 1 Arithmetica every 4 turns during boss battles\./gi,'每场战斗首回合获得 1 点算力；首领战中每 4 回合额外获得 1 点算力。'],
    [/At turn start, obtain a Shield equal to ([^,]+?) DEF and (.+?) equal to ([^,]+?) ATK, generating ([^,]+?) temporary Tentacles that last for ([^.!?]+?) turns?\./gi,'回合开始时，获得等同于 $1 防御力的护盾，以及等同于 $3 攻击力的 $2；并生成 $4 只临时触腕，持续 $5 回合。'],
    [/After ([^,.]+?) plays a card/gi,'$1 打出卡牌后'],
    [/Every 1% (.+?) ([^,]+?) and (?:her|his|their) equipped WoD & Covenant have, increase (?:her|his|their) Base DMG by ([^ ]+) and Shield by ([^.!?]+)\./gi,'$2 与其装备的命轮、密契每拥有 1% $1，基础伤害提高 $3，护盾提高 $4。'],
    [/For each 1 Realm Mastery Attributes? ([^,]+?) possesses, the (.+?) DMG from (.+?) \+([^.!?]+)\./gi,'$1 每拥有 1 点界域精通，$3 的 $2 伤害 +$4。'],
    [/Any lineup that includes (.+?) Awakener gains/gi,'任何包含 $1 唤醒体的队伍获得'],
    [/can select from all available Posses when releasing the second Posse/gi,'释放第二次钥令时可从所有可用钥令中选择'],
    [/the selected Posse will trigger twice/gi,'所选钥令会触发两次'],
    [/Inflict 3× that much (.+?) instead in Boss Battles/gi,'首领战中改为施加 3 倍等量的 $1'],
    [/draws? ([^,.]+?) cards?/gi,'抽取 $1 张卡牌'],
    [/discards? ([^,.]+?) random cards?/gi,'随机弃置 $1 张卡牌'],
    [/At the start of the exploration/gi,'探索开始时'],
    [/At the start of each battle/gi,'每场战斗开始时'],
    [/At the start of odd turns/gi,'奇数回合开始时'],
    [/At the start of even turns/gi,'偶数回合开始时'],
    [/At (?:the )?start of (?:the )?next turn/gi,'下回合开始时'],
    [/At (?:the )?end of (?:the )?turn/gi,'回合结束时'],
    [/At turn start/gi,'回合开始时'],
    [/At turn end/gi,'回合结束时'],
    [/At battle start/gi,'战斗开始时'],
    [/after the battle ends/gi,'战斗结束后'],
    [/after the start of exploration/gi,'探索开始后'],
    [/after each Posse is Unleashed/gi,'每次释放钥令后'],
    [/This Awakener gains ([^.!?]+?) Levels? of Base Attributes\./gi,'该唤醒体获得 $1 级基础属性。'],
    [/increases Base DMG by ([^.!?,;]+)/gi,'基础伤害提高 $1'],
    [/increases Final DMG by ([^.!?,;]+)/gi,'最终伤害提高 $1'],
    [/increases Crit\. Rate by ([^.!?,;]+)/gi,'暴击率提高 $1'],
    [/increases Crit\. DMG by ([^.!?,;]+)/gi,'暴击伤害提高 $1'],
    [/increases ([^.!?,;]+?) by ([^.!?,;]+)/gi,'使 $1 提高 $2'],
    [/is increased by ([^.!?,;]+)/gi,'提高 $1'],
    [/are increased by ([^.!?,;]+)/gi,'提高 $1'],
    [/is reduced by ([^.!?,;]+)/gi,'降低 $1'],
    [/are reduced by ([^.!?,;]+)/gi,'降低 $1'],
    [/is in (?:the )?["“]?Depressed Persona["”]? state/gi,'处于抑郁人格状态'],
    [/is in (?:the )?["“]?Manic Persona["”]? state/gi,'处于躁狂人格状态'],
    [/While in Depressed Persona/gi,'抑郁人格下'],
    [/while in Manic Persona/gi,'躁狂人格下'],
    [/In Depressed state/gi,'抑郁状态下'],
    [/in Manic state/gi,'躁狂状态下'],
    [/the Arithmetica Cost of corresponding cards is reduced by (?:an )?additional ([^.!?,;]+)/gi,'对应卡牌的算力消耗额外降低 $1'],
    [/the number of hits is increased by (?:an )?additional ([^.!?,;]+)/gi,'伤害段数额外增加 $1'],
    [/generates? ([^.!?,;]+?) more Aliemus/gi,'额外生成 $1 狂气'],
    [/generates? ([^.!?,;]+?) more ([^.!?,;]+)/gi,'额外生成 $1 $2'],
    [/inflict ([^.!?,;]+?) on all enemies for ([^.!?,;]+?) turns?/gi,'对全体敌人施加 $1，持续 $2 回合'],
    [/apply ([^.!?,;]+?) to all enemies for ([^.!?,;]+?) turns?/gi,'对全体敌人施加 $1，持续 $2 回合'],
    [/inflict ([^.!?,;]+?) on all enemies/gi,'对全体敌人施加 $1'],
    [/apply ([^.!?,;]+?) to all enemies/gi,'对全体敌人施加 $1'],
    [/Each time ([^,]+?) releases? Exalt, the Aliemus obtained from this effect in battle \+([^.!?]+)/gi,'每当 $1 释放狂气爆发时，本效果在本场战斗中获得的狂气 +$2'],
    [/The next Command Card of ([^.!?]+?) will be effective ([^.!?]+?) times?/gi,'$1 的下一张指令卡将生效 $2 次'],
    [/The Persona Effect Bonus of ([^;.!?]+?)['’]s Command Cards is doubled/gi,'$1 的指令卡人格效果加成翻倍'],
    [/this effect expires after ([^.!?]+?) unleashes Exalt each turn/gi,'该效果在 $1 每回合释放狂气爆发后结束'],
    [/is enhanced\s*:/gi,'强化为：'],
    [/Randomly deal (\d+) instances? of ([^.!?]+?) (Pierce DMG|DMG)/gi,'随机造成 $1 段 $2 $3'],
    [/Deal (\d+) instances? of ([^.!?]+?) (Pierce DMG|DMG)/gi,'造成 $1 段 $2 $3'],
    [/Randomly deal ([^.!?,;]+?) (Pierce DMG|DMG) ([^.!?,;]+?) (?:times?|hits?)/gi,'随机造成 $1 $2 $3 次'],
    [/Deal ([^.!?,;]+?) (Pierce DMG|DMG) to all enemies ([^.!?,;]+?) (?:times?|hits?)/gi,'对全体敌人造成 $1 $2 $3 次'],
    [/Deal ([^.!?,;]+?) (Pierce DMG|DMG) to all enemies/gi,'对全体敌人造成 $1 $2'],
    [/Deal ([^.!?,;]+?) (Pierce DMG|DMG) to (?:the )?enemy with lowest HP/gi,'对生命值最低的敌人造成 $1 $2'],
    [/Deal ([^.!?,;]+?) (Pierce DMG|DMG) to (?:the )?enemy with highest HP/gi,'对生命值最高的敌人造成 $1 $2'],
    [/Deal ([^.!?,;]+?) guaranteed Critical Hit DMG/gi,'造成必定暴击的 $1 伤害'],
    [/Deal ([^.!?,;]+?) (Pierce DMG|DMG) (\d+|twice) (?:times?|hits?)/gi,'造成 $1 $2 $3 次'],
    [/Deal ([^.!?,;]+?) (Pierce DMG|DMG)/gi,'造成 $1 $2'],
    [/Gain ([^.!?,;]+?) Shield/gi,'获得 $1 护盾'],
    [/Lose ([^.!?,;]+?) Current HP/gi,'失去当前生命值的 $1'],
    [/Restore ([^.!?,;]+?) HP/gi,'恢复 $1 生命值'],
    [/This DMG enjoys ([^.!?]+?) STR bonus/gi,'本次伤害享受 $1 力量加成'],
    [/which enjoys (?:an? )?([^.!?,;]+?) STR bonus/gi,'并享受 $1 力量加成'],
    [/For every 1% HP the target is missing/gi,'目标每损失 1% 生命值'],
    [/For each 1 Realm Mastery Attributes? ([^.!?,;]+?) possesses/gi,'$1 每拥有 1 点界域精通属性'],
    [/For every 1% Sigil Yield attribute ([^.!?,;]+?) possesses/gi,'$1 每拥有 1% 黑印掉落属性'],
    [/For each stack of ([^.!?,;]+?) consumed/gi,'每消耗 1 层 $1'],
    [/Considered as (?:a )?["“]?Defense["”]?/gi,'视为防御牌'],
    [/Considered as (?:a )?["“]?Strike["”]?/gi,'视为打击牌'],
    [/the next Aliemus gained from playing a card \+([^.!?,;]+)/gi,'下次打出卡牌时获得的狂气 +$1'],
    [/stacking up to ([^.!?,;]+?) times?/gi,'最多叠加 $1 次'],
    [/Can be triggered up to ([^.!?,;]+?) times? per turn/gi,'每回合最多触发 $1 次'],
    [/up to ([^.!?,;]+?) times? per turn/gi,'每回合最多 $1 次'],
    [/that last for ([^.!?,;]+?) turns?/gi,'并持续 $1 回合'],
    [/for ([^.!?,;]+?) turns?/gi,'持续 $1 回合'],
    [/The first time ([^.!?,;]+?) triggers each investigation/gi,'每次调查中首次触发 $1 时'],
    [/If the current Realm is ([^,.;]+), also trigger/gi,'若当前界域为 $1，则额外触发'],
    [/If the current Realm is ([^,.;]+)/gi,'若当前界域为 $1'],
    [/all Awakeners gain/gi,'全体唤醒体获得'],
    [/All Awakeners lose/gi,'全体唤醒体失去'],
    [/all other Awakeners/gi,'其他所有唤醒体'],
    [/the wielder['’]s/gi,'装备者的'],
    [/each time you play a Command Card/gi,'每次打出指令卡时'],
    [/Every time a card with an Arithmetica Cost of ([^.!?,;]+?) is played/gi,'每次打出算力消耗为 $1 的卡牌时'],
    [/After playing or discarding ([^.!?,;]+?)/gi,'打出或弃置 $1 后'],
    [/After playing/gi,'打出后'],
    [/After dealing DMG/gi,'造成伤害后'],
    [/otherwise Inflict/gi,'否则施加'],
    [/instead of inflicting/gi,'而非施加'],
    [/Scaling guide\s*:/gi,'数值说明：'],
    [/break through realm restrictions/gi,'突破界域限制'],
    [/form lineups with/gi,'与其他唤醒体组成队伍'],
    [/providing different symbiotic effects/gi,'并提供不同的协同效果'],
    [/Compared to other Realm teams/gi,'与其他界域队伍相比'],
    [/rely more on coordination between Posses/gi,'更依赖钥令之间的配合'],
    [/choosing the right Posse can greatly enhance the strength of/gi,'选择合适的钥令可以显著提高'],
    [/temporarily reduce/gi,'临时降低'],
    [/temporarily inflict/gi,'临时施加'],
    [/temporarily increasing/gi,'临时提高'],
    [/temporarily reducing/gi,'临时降低'],
    [/gain Temporary/gi,'获得临时'],
    [/Gain another/gi,'额外获得'],
    [/gains an additional/gi,'额外获得'],
    [/gain an additional/gi,'额外获得'],
    [/equal to/gi,'等同于'],
    [/equal amount/gi,'等量']
  ];
  const phraseZh=[
    [/This talent is only effective in the (?:\{)?星辰篇(?:\})? stages\./gi,'该天赋仅在「星辰篇」关卡中生效。'],
    [/\bThis Awakener['’]s\b/gi,'该唤醒体的'],[/\bThe Awakener['’]s\b/gi,'该唤醒体的'],[/\bAwakeners?\b/gi,'唤醒体'],
    [/upon their first (?:\{)?Rouse(?:\})?/gi,'首次进行灵知觉醒时'],[/\bthey gain\b/gi,'并获得'],
    [/\bDepressed Persona\b/gi,'抑郁人格'],[/\bManic Persona\b/gi,'躁狂人格'],[/\bDepressed state\b/gi,'抑郁状态'],[/\bManic state\b/gi,'躁狂状态'],[/\bPersona Effect Bonus\b/gi,'人格效果加成'],[/\bPersona\b/gi,'人格'],
    [/\bTemp\. Crit\. Rate\b/gi,'临时暴击率'],[/\bTemp\. Crit\. DMG\b/gi,'临时暴击伤害'],[/\bTemporary Crit\. Rate\b/gi,'临时暴击率'],[/\bTemporary Crit\. DMG\b/gi,'临时暴击伤害'],[/\bCrit\. Rate\b/gi,'暴击率'],[/\bCrit\. DMG\b/gi,'暴击伤害'],[/\bCritical Hit\b/gi,'暴击'],
    [/\bKeyflare Regen Lv\.?\b/gi,'银钥充能等级'],[/\bKeyflare Regen Level\b/gi,'银钥充能等级'],[/\bKeyflare Regen\b/gi,'银钥充能'],[/\bKeyflare\b/gi,'银钥能量'],
    [/\bAliemus Regen Level\b/gi,'狂气回充等级'],[/\bAliemus Regen\b/gi,'狂气回充等级'],[/\bAliemus Generation\b/gi,'狂气生成'],[/\bBase Aliemus\b/gi,'基础狂气'],[/\bAliemus\b/gi,'狂气'],
    [/\bDeath Resistance\b/gi,'死亡抵抗'],[/\bSigil Yield\b/gi,'黑印掉落'],[/\bBlack Sigils?\b/gi,'黑印'],[/\bTeam Unique\b/gi,'队伍唯一'],
    [/\bWoD\s*&\s*Covenant\b/gi,'命轮与密契'],[/\bWoD\b/gi,'命轮'],[/\bCovenants?\b/gi,'密契'],
    [/\bPosses?\b/gi,'钥令'],[/\bPorses?\b/gi,'钥令'],[/\bPosse\b/gi,'钥令'],
    [/\bArithmetica Cost\b/gi,'算力消耗'],[/\bArithmetica Harmony\b/gi,'算力协调'],[/\bArithmetica\b/gi,'算力'],
    [/\bPrimordia Mastery Scaling\b/gi,'原初界域精通缩放'],[/\bPrimordia Mastery\b/gi,'原初界域精通'],[/\bRealm Mastery\b/gi,'界域精通'],[/\bDamage Amplification\b/gi,'伤害强效'],[/\bDMG Amplification\b/gi,'伤害强效'],
    [/STR▼/gi,'力量降低'],[/\bTemporary STR\b/gi,'临时力量'],[/\bSTR\b/gi,'力量'],
    [/\bPierce DMG\b/gi,'穿透伤害'],[/\bPure DMG\b/gi,'纯粹伤害'],[/\bFixed DMG\b/gi,'固定伤害'],[/\bActive DMG\b/gi,'主动伤害'],[/\bTentacle DMG\b/gi,'触腕伤害'],[/\bFinal DMG\b/gi,'最终伤害'],[/\bBase DMG\b/gi,'基础伤害'],[/\bDMG\b/gi,'伤害'],
    [/\bVulnerable\b/gi,'易伤'],[/\bWeakness\b/gi,'虚弱'],[/\bPoison\b/gi,'中毒'],[/\bCounter\b/gi,'反击'],[/\bBleed\b/gi,'出血'],[/\bCorrosion\b/gi,'侵蚀'],[/\bBarrier\b/gi,'屏障'],
    [/\bFinale Form\b/gi,'终末形态'],[/\bFinale\b/gi,'终末'],[/\bFiamma\b/gi,'活焰'],[/\bEndure\b/gi,'忍耐'],[/\bDreamlure\b/gi,'梦引'],
    [/\bPack Hunt\b/gi,'群猎'],[/\bNegentropy\b/gi,'负熵'],[/\bUndertow\b/gi,'暗潮'],[/\bGuilt\b/gi,'罪责'],[/\bMurmurs\b/gi,'低语'],
    [/\bSymbiosis\b/gi,'共生'],[/\bOffering\b/gi,'供奉'],[/\bSatiety\b/gi,'饱足'],[/\bCorpse\b/gi,'残骸'],[/\bSin Mark\b/gi,'罪印'],
    [/\bWeaver\b/gi,'织命'],[/\bCreativity\b/gi,'创意'],[/\bFantasia\b/gi,'幻想'],[/\bCombust\b/gi,'燃烧'],[/\bLife Seal\b/gi,'生命封印'],
    [/\bSpellbound\b/gi,'痴醉'],[/\bBetroth\b/gi,'相许'],[/\bEnthrall\b/gi,'夺魄'],[/\bEmotion\b/gi,'情绪'],[/\bMetaphor\b/gi,'隐喻'],
    [/\bAnger\b/gi,'愤怒'],[/\bFear\b/gi,'恐惧'],[/\bGrief\b/gi,'悲伤'],[/\bHappiness\b/gi,'喜悦'],
    [/\bLeap\b/gi,'跃迁'],[/\bAftershock\b/gi,'余震'],[/\bDevour\b/gi,'吞噬'],[/\bResonance\b/gi,'共鸣'],[/\bRitual\b/gi,'仪式'],[/\bStealing\b|\bSteal\b/gi,'窃取'],[/\bExhaust\b/gi,'消耗'],[/\bRetain\b/gi,'保留'],[/\bPrepare\b/gi,'预备'],
    [/\bMax HP\b/gi,'最大生命'],[/\bHP Recovery\b/gi,'生命回复'],[/\bShield Generation\b/gi,'护盾生成'],[/\bCurrent HP\b/gi,'当前生命值'],[/\bHP\b/gi,'生命值'],
    [/\bHand Limit\b/gi,'手牌上限'],[/\bDraw Pile\b/gi,'抽牌堆'],[/\bDiscard Pile\b/gi,'弃牌堆'],[/\bBasic Copy\b/gi,'基础复制卡'],
    [/\ball enemies\b/gi,'全体敌人'],[/\benemies\b/gi,'敌人'],[/\benemy\b/gi,'敌人'],[/\ball teammates\b/gi,'全体队友'],[/\bteammates?\b/gi,'队友'],
    [/\btarget['’]s\b/gi,'目标的'],[/\btargets?\b/gi,'目标'],
    [/\bat turn end\b/gi,'回合结束时'],[/\bat turn start\b/gi,'回合开始时'],[/\bat battle start\b/gi,'战斗开始时'],
    [/\bthis turn\b/gi,'本回合'],[/\bthis battle\b/gi,'本场战斗'],[/\beach turn\b/gi,'每回合'],[/\bper turn\b/gi,'每回合'],
    [/\bfirst Command Card\b/gi,'第一张指令卡'],[/\bCommand Cards?\b/gi,'指令卡'],[/\bBasic Strike\b/gi,'基础打击'],[/\bBasic Defense\b/gi,'基础防御'],
    [/\bBoss Battles?\b/gi,'首领战'],[/\bUltra Round\b/gi,'超维回合'],
    [/\bSurging Tides\b/gi,'潮涌'],[/\bTranquil Sea\b/gi,'静海'],[/\bRaging Waves\b/gi,'怒涛'],[/\bBenthos: Aequor\b/gi,'晦暝·深海'],
    [/\bDelayed Sacrifice\b/gi,'延迟献祭'],[/\bSacrifice\b/gi,'献祭'],[/\bBirth Ritual\b/gi,'诞生仪式'],
    [/\bAequor Realm\b/gi,'深海界域'],[/\bAequor\b/gi,'深海'],[/\bChaos\b/gi,'混沌'],[/\bCaro\b/gi,'血肉'],[/\bUltra\b/gi,'超维'],
    [/\bSoulforge Aptitude\b/gi,'灵塑适性'],[/\bGnostic Potential\b/gi,'内在灵格'],[/\bE1\b/g,'启灵1'],[/\bE2\b/g,'启灵2'],[/\bE3\b/g,'启灵3'],
    [/\bRouse\b/gi,'灵知觉醒'],[/\bOver-?Exalt\b/gi,'超限爆发'],[/\bExalts?\b/gi,'狂气爆发'],[/\bDefense\b/gi,'防御'],[/\bStrike\b/gi,'打击'],
    [/\bShields?\b/gi,'护盾'],[/\bDamage\b/gi,'伤害'],[/\bATK\b/gi,'攻击力'],[/\bDEF\b/gi,'防御力'],[/\bCON\b/gi,'体质'],
    [/\bSkill(?:s)?\b/gi,'技能'],[/\bLevels?\b/gi,'等级'],[/\bAttributes?\b/gi,'属性'],
    [/\badditional\b/gi,'额外'],[/\beach hit\b/gi,'每段伤害'],[/\binstances?\b/gi,'段'],[/\bhits?\b/gi,'段'],[/\bchance\b/gi,'概率'],
    [/\bplayed\b|\bplaying\b/gi,'打出'],[/\bcurrent\b/gi,'当前'],
    [/\bEach stack of\b/gi,'每层'],[/\bEach point of\b/gi,'每点'],[/\bFor each\b/gi,'每'],[/\bFor every\b/gi,'每'],[/\bEvery\b/gi,'每'],[/\bEach\b/gi,'每'],
    [/\bRandomly\b/gi,'随机'],[/\brandom\b/gi,'随机'],[/\ball Tentacles\b/gi,'所有触腕'],[/\bTentacles?\b/gi,'触腕'],
    [/\bNon-Derived\b/gi,'非衍生'],[/\bDerived\b/gi,'衍生'],[/\beffects?\b/gi,'效果'],[/\bpoints?\b/gi,'点'],
    [/\bDMG taken\b/gi,'受到的伤害'],[/\bdamage taken\b/gi,'受到的伤害'],[/\bdealt\b/gi,'造成'],[/\btaken\b/gi,'受到'],
    [/\bremov(?:e|es|ed|ing)\b/gi,'移除'],[/\bconsum(?:e|es|ed|ing)\b/gi,'消耗'],[/\bswitch(?:es|ed|ing)?\b/gi,'切换'],[/\bstance\b/gi,'姿态'],
    [/\bup to\b/gi,'最多'],[/\bmaximum\b/gi,'最大'],[/\bminimum\b/gi,'最小'],[/\bamount\b/gi,'数值'],[/\bbonus\b/gi,'加成'],
    [/\bcorresponding\b/gi,'对应'],[/\bnumber of hits\b/gi,'伤害段数'],[/\bstate\b/gi,'状态'],[/\bteam\b/gi,'队伍'],[/\brealm\b/gi,'界域'],[/\beffective\b/gi,'生效'],[/\benhanced\b/gi,'强化'],[/\bdoubled\b/gi,'翻倍'],[/\banother\b/gi,'额外'],[/\bother\b/gi,'其他'],[/\bbased on\b/gi,'根据'],[/\bdifferent\b/gi,'不同'],[/\bwill\b/gi,'将'],[/\bcan\b/gi,'可以'],
    [/\bin hand\b/gi,'在手牌中'],[/\bhand\b/gi,'手牌'],[/\bplay(?:s|ed|ing)?\b/gi,'打出'],[/\buses?\b|\busing\b/gi,'使用'],
    [/\bbelow\b/gi,'低于'],[/\babove\b/gi,'高于'],[/\buntil\b/gi,'直到'],[/\bduring\b/gi,'在'],[/\bwhile\b/gi,'当'],[/\bonly\b/gi,'仅'],[/\balways\b/gi,'始终'],
    [/\bwithout\b/gi,'不具有'],[/\binstead\b/gi,'改为'],[/\bsame\b/gi,'相同'],[/\bnext\b/gi,'下一'],[/\bmore\b/gi,'更多'],[/\bless\b/gi,'更少'],
    [/\bbefore\b/gi,'之前'],[/\bwhen\b/gi,'当'],[/\bif\b/gi,'若'],[/\btimes?\b/gi,'次'],
    [/\bTemporarily\b/gi,'临时'],[/\bTemporary\b/gi,'临时'],[/\bPermanent\b/gi,'永久']
  ];
  const commonWordZh=new Map(Object.entries({
    all:'全体',and:'并且',or:'或',as:'视为',at:'在',be:'为',been:'为',being:'为',by:'由',from:'来自',for:'用于',in:'在',into:'转为',of:'的',on:'在',the:'',a:'',an:'',this:'本次',that:'该',these:'这些',those:'这些',
    your:'你的',you:'你',their:'其',them:'其',she:'该唤醒体',he:'该唤醒体',her:'该唤醒体的',his:'该唤醒体的',its:'其',
    is:'为',are:'为',was:'为',were:'为',has:'拥有',have:'拥有',had:'拥有',
    gain:'获得',gains:'获得',gained:'获得',gaining:'获得',obtain:'获得',obtains:'获得',obtained:'获得',grant:'给予',grants:'给予',granted:'给予',
    apply:'施加',applies:'施加',applied:'施加',inflict:'施加',inflicts:'施加',inflicted:'施加',
    increase:'提高',increases:'提高',increased:'提高',increasing:'提高',reduce:'降低',reduces:'降低',reduced:'降低',reducing:'降低',
    generate:'生成',generates:'生成',generated:'生成',generating:'生成',trigger:'触发',triggers:'触发',triggered:'触发',triggering:'触发',
    release:'释放',releases:'释放',released:'释放',releasing:'释放',unleash:'释放',unleashes:'释放',unleashed:'释放',
    recover:'恢复',recovers:'恢复',recovered:'恢复',restore:'恢复',restores:'恢复',restored:'恢复',
    lose:'失去',loses:'失去',lost:'失去',discard:'弃置',discards:'弃置',discarded:'弃置',discarding:'弃置',draw:'抽取',draws:'抽取',drawn:'抽取',shuffle:'洗入',shuffles:'洗入',
    add:'加入',adds:'加入',added:'加入',transfer:'转移',transfers:'转移',transferred:'转移',convert:'转化',converts:'转化',converted:'转化',
    start:'开始',end:'结束',ends:'结束',ended:'结束',turn:'回合',turns:'回合',battle:'战斗',battles:'战斗',exploration:'探索',investigation:'调查',stage:'关卡',stages:'关卡',round:'回合',
    card:'卡牌',cards:'卡牌',copy:'复制卡',copies:'复制卡',stack:'层',stacks:'层',hit:'段',hits:'段',instance:'段',instances:'段',
    effect:'效果',effects:'效果',base:'基础',final:'最终',active:'主动',basic:'基础',temporary:'临时',temporarily:'临时',permanent:'永久',
    target:'目标',targets:'目标',enemy:'敌人',enemies:'敌人',teammate:'队友',teammates:'队友',team:'队伍',teams:'队伍',lineup:'队伍',lineups:'队伍',
    wielder:'装备者',realm:'界域',realms:'界域',attribute:'属性',attributes:'属性',mastery:'精通',cost:'消耗',rate:'率',recovery:'回复',regen:'充能',limit:'上限',
    number:'数量',amount:'数值',bonus:'加成',chance:'概率',additional:'额外',another:'额外',other:'其他',same:'相同',current:'当前',next:'下一',first:'首次',second:'第二',
    selected:'选定',available:'可用',random:'随机',randomly:'随机',equal:'等同',more:'更多',less:'更少',every:'每',each:'每',per:'每',any:'任意',
    after:'之后',before:'之前',when:'当',while:'当',until:'直到',during:'期间',only:'仅',always:'始终',otherwise:'否则',instead:'改为',then:'随后',also:'同时',once:'一次',
    compared:'相比',faster:'更快',select:'选择',choosing:'选择',chosen:'选定',includes:'包含',include:'包含',providing:'提供',different:'不同',coordination:'配合',between:'之间',greatly:'显著',enhance:'提高',strength:'强度',benefits:'享受',
    break:'突破',through:'',restrictions:'限制',form:'组成',symbiotic:'协同',right:'合适',rely:'依赖',possesses:'拥有',equipped:'装备',
    considered:'视为',ignores:'无视',ignore:'无视',last:'持续',accumulate:'积累',accumulates:'积累',accumulating:'积累',stacking:'叠加',
    enjoy:'享受',enjoys:'享受',expire:'失效',expires:'失效',expired:'失效',halved:'减半',greater:'大于',than:'',able:'可以',
    depressed:'抑郁',manic:'躁狂',persona:'人格',crit:'暴击',critical:'暴击',scaling:'缩放',guide:'说明',intent:'意图',attack:'攻击',against:'对',therefore:'因此',odd:'奇数',even:'偶数',except:'除',plus:'加',twice:'两次',much:'等量'
  }));
  function protectKnownSkillNames(text){
    const protectedTerms=[];
    let out=String(text||'');
    for(const skill of currentSkills||[]){
      if(!skill?.name)continue;
      const verified=zhSkillNames[skill.id];
      if(verified&&verified!==skill.name){out=out.split(skill.name).join(verified);continue}
      const marker='@@MPROPER'+protectedTerms.length+'@@';
      if(out.includes(skill.name)){protectedTerms.push(skill.name);out=out.split(skill.name).join(marker)}
    }
    return {text:out,protectedTerms};
  }
  function restoreKnownSkillNames(text,protectedTerms){
    return String(text||'').replace(/@@MPROPER(\d+)@@/g,(m,n)=>protectedTerms[Number(n)]||m);
  }
  function translateResidualEnglish(text){
    return String(text||'').replace(/\b[A-Za-z][A-Za-z'’-]*\b/g,word=>commonWordZh.get(word.toLowerCase())??word);
  }
  function zhText(value){
    let out=String(value||'');
    if(isEnglish())return out.replace(/\n/g,' ').replace(/\{([^}]+)\}/g,'$1').replace(/\s+/g,' ').trim();
    const protectedResult=protectKnownSkillNames(out);out=protectedResult.text;
    for(const [re,to] of sentenceZh)out=out.replace(re,to);
    for(const rec of data()?.db?.records||[]){
      if(!rec?.name)continue;
      const cn=zhFor(rec)?.name||data()?.identityDb?.bySkeydbId?.[rec.id]?.name;
      if(cn&&cn!==rec.name)out=out.split(rec.name).join(cn);
    }
    for(const [re,to] of phraseZh)out=out.replace(re,to);
    out=out
      .replace(/\bof (?:her|his|their)\b/gi,'')
      .replace(/\b(?:her|his|their)\b/gi,'该唤醒体的')
      .replace(/['’]s\b/g,'的')
      .replace(/\band\b/gi,'并且')
      .replace(/\bwith\b/gi,'并具有')
      .replace(/\bfrom\b/gi,'来自')
      .replace(/\b(?:the|a|an)\b/gi,'')
      .replace(/\bof\b/gi,'的')
      .replace(/\bto\b/gi,'对')
      .replace(/\bis\b|\bare\b/gi,'为')
      .replace(/\bin\b/gi,'在')
      .replace(/\bon\b/gi,'在')
      .replace(/\bfor\b/gi,'用于')
      .replace(/\bthis\b/gi,'本次');
    out=translateResidualEnglish(out);
    out=restoreKnownSkillNames(out,protectedResult.protectedTerms);
    return out
      .replace(/\s*,\s*/g,'，')
      .replace(/\.(?=\s|$)/g,'。')
      .replace(/\s*;\s*/g,'；')
      .replace(/\s*:\s*/g,'：')
      .replace(/\s+/g,' ')
      .replace(/\s+([，。；：！？])/g,'$1')
      .replace(/([（“「])\s+/g,'$1')
      .replace(/\s+([）”」])/g,'$1')
      .replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g,'$1')
      .trim();
  }
  function localizedSkillName(skill){
    if(isEnglish())return skill?.name||'Skill';
    if(zhSkillNames[skill?.id])return zhSkillNames[skill.id];
    return skill?.name||'技能';
  }
  const slotEn={Strike:'Strike',Defense:'Defense',Rouse:'Rouse',Skill1:'Skill 1',Skill2:'Skill 2',Exalt:'Exalt',OverExalt:'Over-Exalt'};
  function skillLabel(skill){
    const slot=isEnglish()
      ?(skill?.kind==='derivedSkill'?'Derived Card':(slotEn[skill?.slot]||'Skill'))
      :(skill?.kind==='derivedSkill'?'衍生卡':(slotZh[skill?.slot]||'技能'));
    const title=localizedSkillName(skill);
    return !title||title===slot?slot:`${slot} · ${title}`;
  }
  function skillRecordScope(skillOrId){const id=typeof skillOrId==='string'?skillOrId:skillOrId?.id;return String(id||'').startsWith('derived.')?'derived-skills':'skills'}
  function overExaltUnlocked(){const slot=selectedEnlightenSlot();return slot==='OverExalt'||slot==='AbsoluteAxiom'}
  function derivedStructuralOnly(skill){
    if(skill?.kind!=='derivedSkill')return false;
    if(String(skill?.nodeKind||'').toLowerCase()==='group')return true;
    return !skill?.cardFamily&&!(skill?.cardTypes||[]).length;
  }
  function visibleSkills(){return currentSkills.filter(skill=>(skill.slot!=='OverExalt'||overExaltUnlocked())&&!derivedStructuralOnly(skill))}
  function derivedDamageLike(skill){
    if(skill?.kind!=='derivedSkill')return false;
    const text=String(skill.descriptionTemplate||'');
    return /\[Damage:[^\]]+\]|\{(?:Pure DMG|Fixed DMG|Pierce DMG)\}|\b(?:deal|deals|inflict|inflicts|trigger|triggers)\b[^.!?\n]{0,120}\b(?:DMG|Damage|Poison|Counter|Bleed|Corrosion)\b/i.test(text);
  }
  function renderSkillOptions(preferredId){
    const select=$('skillSelect');if(!select)return;
    const visible=visibleSkills(),wanted=visible.some(x=>x.id===preferredId)?preferredId:(visible.find(x=>x.slot==='Exalt')?.id||visible[0]?.id||'');
    const main=visible.filter(x=>x.kind!=='derivedSkill');
    const derivedDamage=visible.filter(derivedDamageLike);
    const derivedUtility=visible.filter(x=>x.kind==='derivedSkill'&&!derivedDamageLike(x));
    select.innerHTML='';
    const appendGroup=(label,rows)=>{
      if(!rows.length)return;
      const group=document.createElement('optgroup');group.label=label;
      rows.forEach((skill,index)=>{const o=document.createElement('option');o.value=skill.id;const labelText=skillLabel(skill);o.textContent=labelText||(isEnglish()?`Skill ${index+1}`:`技能 ${index+1}`);o.selected=skill.id===wanted;group.appendChild(o)});
      select.appendChild(group);
    };
    appendGroup(isEnglish()?'Main Skills':'主技能',main);
    appendGroup(isEnglish()?'Derived Damage Cards':'衍生伤害卡',derivedDamage);
    appendGroup(isEnglish()?'Derived Utility / State Cards':'衍生辅助 / 状态卡',derivedUtility);
    if(wanted)select.value=wanted;
  }
  function renderTemplatePreserveTerms(record,level=1,ctxExtra={}){
    let text=record?.descriptionTemplate||record?.description||'';
    const formatted=(match,name,offset,source)=>{
      const arg=record?.descriptionArgs?.[name],v=argValue(arg,level,ctxExtra);if(v===null)return name;
      const suffix=String(arg?.suffix||''),tail=String(source||'').slice(offset+match.length);
      const shownSuffix=suffix&&tail.startsWith(suffix)?'':suffix;
      return `${arg?.stat?`${arg.stat} × `:''}${v}${shownSuffix}`;
    };
    text=text.replace(/\[\{([^}]+)\}:([^\]]+)\]/g,(match,kind,name,offset,source)=>formatted(match,name,offset,source));
    text=text.replace(/\[([A-Za-z]+):([^\]]+)\]/g,(match,kind,name,offset,source)=>formatted(match,name,offset,source));
    text=text.replace(/\[([^\]]+)\]/g,(match,name,offset,source)=>formatted(match,name,offset,source));
    text=text.replace(/\{plural:([^|{}]+)\|([^|{}]+)\|([^{}]+)\}/g,(m,value,singular,plural)=>Math.abs(num(value,2)-1)<1e-9?singular:plural);
    return text.replace(/\n/g,' ');
  }
  function renderTemplate(record,level=1,ctxExtra={}){
    return renderTemplatePreserveTerms(record,level,ctxExtra).replace(/\{([^}]+)\}/g,'$1');
  }
  function termMeta(token){
    const raw=String(token||'').trim();
    const clean=raw.replace(/^(?:overlay|derived):/i,'').trim();
    const global=globalTermMeta[raw]||globalTermMeta[clean];
    if(global)return {label:isEnglish()?clean:global[0],icon:global[1],color:global[2],glyph:global[3]||null};
    const awakener=(data()?.db?.records||[]).find(x=>String(x.name||'').toLowerCase()===clean.toLowerCase());
    if(awakener)return {label:isEnglish()?clean:labelForAwakener(awakener),color:'misc',icon:null,glyph:null};
    const skill=(currentSkills||[]).find(x=>String(x.name||'').toLowerCase()===clean.toLowerCase());
    if(skill)return {label:localizedSkillName(skill),color:'misc',icon:null,glyph:null};
    const overlay=(currentOverlays||[]).find(x=>String(x.name||'').toLowerCase()===clean.toLowerCase());
    if(overlay){
      const label=isEnglish()?clean:(uniqueTermZh[clean]||clean);
      const icon=overlay.iconId?String(overlay.iconId)+'.webp':null;
      return {label,icon,color:overlay.textColor||'misc',glyph:null};
    }
    return {label:isEnglish()?clean:(uniqueTermZh[clean]||clean),color:'misc',icon:null,glyph:/DMG|Damage/i.test(clean)?'◇':null};
  }
  function termHtml(token,displayLabel){
    const meta=termMeta(token),label=displayLabel||meta.label;
    const visual=meta.icon
      ?'<img class="skeyTermIcon" src="'+escape(SKEYDB_ICON_BASE+meta.icon)+'" alt="" decoding="async" onerror="this.remove()">'
      :(meta.glyph?'<span class="skeyTermGlyph" aria-hidden="true">'+escape(meta.glyph)+'</span>':'');
    return '<span class="skeyTerm skeyTerm-'+escape(meta.color||'misc')+'" title="'+escape(String(token||''))+'">'+visual+'<span>'+escape(label)+'</span></span>';
  }
  function renderRichRecord(record,level=1,ctxExtra={}){
    const displayRecord=!isEnglish()&&zhDescriptionOverrides[record?.id]?{...record,descriptionTemplate:zhDescriptionOverrides[record.id]}:record;
    let text=renderTemplatePreserveTerms(displayRecord,level,ctxExtra),terms=[];
    text=text.replace(/\{([^{}]+)\}/g,(m,token)=>{const i=terms.push(token)-1;return '@@MTERM'+i+'@@'});
    let html=escape(zhText(text));
    return html.replace(/@@MTERM(\d+)@@/g,(m,n)=>termHtml(terms[Number(n)]||''));
  }
  function ensureTermIconStyle(){
    if($('morimensSkeyTermStyle'))return;
    const style=document.createElement('style');style.id='morimensSkeyTermStyle';
    style.textContent='.skeyTerm{display:inline-flex;align-items:center;gap:3px;vertical-align:-0.12em;white-space:nowrap;font-weight:700;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:2px}.skeyTermIcon{width:1.08em;height:1.08em;object-fit:contain;flex:0 0 auto;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))}.skeyTermGlyph{display:inline-grid;place-items:center;width:1.05em;height:1.05em;border:1px solid currentColor;border-radius:50%;font-size:.7em;line-height:1}.skeyTerm-heal{color:#83d6a6}.skeyTerm-affliction{color:#c5a4ef}.skeyTerm-damage{color:#eab07e}.skeyTerm-shield{color:#8fc5e8}.skeyTerm-light{color:#ecd28c}.skeyTerm-misc{color:#bac4d4}.calcResourceField label .skeyTerm{font-size:1em}';
    document.head.appendChild(style);
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
    const englishLabel=label==='内在灵格'?'Inner Spirit':label==='灵塑'?'Soulforge':label;
    for(let i=0;i<=max;i++){
      const option=document.createElement('option');option.value=String(i);
      option.textContent=`${i} · ${i===0?ui('未启用','Disabled'):(isEnglish()?englishLabel:label)+' '+i}`;
      option.selected=i===previous;select.appendChild(option)
    }
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
    if(level?.tagName==='SELECT'){
      const previous=Math.min(90,Math.max(1,Number(level.value)||90));level.innerHTML='';
      for(let i=1;i<=90;i++){const option=document.createElement('option');option.value=String(i);option.textContent=isEnglish()?`Lv. ${i}`:`等级 ${i}`;option.selected=i===previous;level.appendChild(option)}
    }
    const innerField=$('innerSpirit')?.closest('.field');
    if(innerField){
      const label=innerField.querySelector('label');if(label)label.textContent=ui('内在灵格','Inner Spirit');
      let note=innerField.querySelector('small');if(!note){note=document.createElement('small');innerField.appendChild(note)}
      note.textContent=ui('按“内在灵格”天赋换算为基础属性等级，再参与体质、攻击、防御成长公式；限定唤醒体固定为 5 且不可调整，常驻/福利唤醒体可按实际进度选择。','Inner Spirit converts its talent level into base-stat levels before CON, ATK, and DEF growth. Limited Awakeners are fixed at 5; permanent/free Awakeners can use their actual progression.');
    }
    const normalizedInner=$('innerSpirit');
    if(normalizedInner&&isLimitedAwakener()){
      normalizedInner.innerHTML=`<option value="5">${isEnglish()?'5 · Inner Spirit 5 (fixed for limited Awakener)':'5 · 内在灵格 5（限定固定）'}</option>`;
      normalizedInner.value='5';normalizedInner.disabled=true;
      normalizedInner.title=ui('限定唤醒体的内在灵格固定为 5，不可调整','Limited Awakeners have Inner Spirit fixed at 5.');
    }else{
      fillRange(normalizedInner,'内在灵格',5);
      if(normalizedInner){normalizedInner.disabled=false;normalizedInner.title=''}
    }
    if(!$('characterSculpt')){
      const inner=$('innerSpirit')?.closest('.field'),wrap=document.createElement('div');
      if(inner){wrap.className='field';wrap.innerHTML='<label for="characterSculpt"></label><select id="characterSculpt"></select><small></small>';inner.insertAdjacentElement('afterend',wrap)}
    }
    const sculptField=$('characterSculpt')?.closest('.field');
    if(sculptField){
      const label=sculptField.querySelector('label');if(label)label.textContent=ui('灵塑','Soulforge');
      let note=sculptField.querySelector('small');if(!note){note=document.createElement('small');sculptField.appendChild(note)}
      note.textContent=ui('按 SKeyDB 灵塑适性计算主属性百分比与可明确解析的专属伤害效果。','Uses SKeyDB Soulforge aptitude to resolve primary-stat percentages and explicitly supported signature damage effects.');
      const sculpt=$('characterSculpt');if(sculpt)for(const option of sculpt.options){const value=Number(option.value)||0;option.textContent=value===0?ui('0 · 未启用','0 · Disabled'):ui(`${value} · 灵塑 ${value}`,`${value} · Soulforge ${value}`)}
    }
    if(!$('soulforgeActive')){
      const sculpt=$('characterSculpt')?.closest('.field'),wrap=document.createElement('div');
      if(sculpt){wrap.className='field full';wrap.innerHTML='<label class="inlineCheck"><input id="soulforgeActive" type="checkbox" checked> <span id="soulforgeActiveLabel"></span></label><small></small>';sculpt.insertAdjacentElement('afterend',wrap)}
    }
    const soulforgeField=$('soulforgeActive')?.closest('.field');
    if(soulforgeField){
      const label=soulforgeField.querySelector('#soulforgeActiveLabel');if(label)label.textContent=ui('按星辰篇关卡环境启用灵塑效果','Enable Soulforge effects for Star Chapter stage conditions');
      let note=soulforgeField.querySelector('small');if(!note){note=document.createElement('small');soulforgeField.appendChild(note)}
      note.textContent=ui('灵塑天赋仅在“星辰篇”关卡生效；取消勾选后保留灵塑等级但不把其数值计入伤害。','Soulforge talents apply only in Star Chapter stages. Disabling this keeps the Soulforge level selected but excludes its values from damage.');
    }
  }

  const ENLIGHTEN_ORDER=['E1','E2','E3','OverExalt','AbsoluteAxiom'];
  function selectedEnlightenSlot(){return $('charEnlighten')?.value||null}
  function psycheSurgeUnlocked(){const selected=selectedEnlightenSlot();const i=ENLIGHTEN_ORDER.indexOf(selected);return i>=ENLIGHTEN_ORDER.indexOf('E3')}
  function psycheSurgeLevel(){return psycheSurgeUnlocked()?Math.max(0,Math.min(12,Math.floor(num($('psycheSurgeLevel')?.value,0)))):0}
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
    if(Array.isArray(patch.removeCardKeywordIds)||Array.isArray(patch.cardKeywords)){
      const merged=new Map((next.cardKeywords||[]).map(x=>[x.id,{...x}]));
      // Match SKeyDB mergeCardKeywords(): removals happen first, then additions/replacements.
      for(const id of patch.removeCardKeywordIds||[])merged.delete(id);
      for(const keyword of patch.cardKeywords||[])merged.set(keyword.id,{...keyword});
      next={...next,cardKeywords:[...merged.values()]};
    }
    return next;
  }
  function activeTalentIds(){
    const progression=progressionState();
    return new Set((currentTalents||[]).filter(talent=>{
      const family=String(talent?.family||'');
      if(family==='soulforge_aptitude')return progression.soulforgeEnabled===true&&progression.soulforgeLevel>0;
      if(family==='gnostic_potential')return talent?.defaultMaxed===true||progression.gnosticLevel>0;
      return true;
    }).map(talent=>talent.id));
  }
  function resolveSkillEnlighten(baseSkill){
    if(!baseSkill)return baseSkill;
    let next=cloneRecord(baseSkill);
    const talentIds=activeTalentIds();
    const enlightenIds=new Set(activeEnlightens().map(x=>x.id));
    // Match SKeyDB full resolver ordering: active Talent upgrades first, then cumulative Enlighten upgrades.
    for(const upgrade of baseSkill.upgrades||[]){
      if(upgrade?.operation==='link_only'||upgrade?.upgraderType!=='talent'||!talentIds.has(upgrade.upgraderId))continue;
      next=applyEnlightenPatch(next,upgrade);
    }
    for(const upgrade of baseSkill.upgrades||[]){
      if(upgrade?.operation==='link_only'||upgrade?.upgraderType!=='enlighten'||!enlightenIds.has(upgrade.upgraderId))continue;
      next=applyEnlightenPatch(next,upgrade);
    }
    return next;
  }
  function composeOverExaltSkill(overSkill){
    const baseRaw=currentSkills.find(x=>x.slot==='Exalt');
    if(!baseRaw||!overSkill)return overSkill;
    const base=resolveSkillEnlighten(baseRaw);
    const over=resolveSkillEnlighten(overSkill);
    let overTemplate=String(over.descriptionTemplate||'');
    const overArgs={};
    for(const [key,arg] of Object.entries(over.descriptionArgs||{})){
      const nextKey='Over_'+key;
      overTemplate=overTemplate.replace(new RegExp('\\b'+key+'\\b','g'),nextKey);
      overArgs[nextKey]=cloneRecord(arg);
    }
    return {
      ...base,
      id:over.id,
      name:String(base.name||'Exalt')+' · '+String(over.name||'Over-Exalt'),
      slot:'OverExalt',
      cardTypes:['over_exalt'],
      descriptionTemplate:String(base.descriptionTemplate||'')+'\n{Over-Exalt}: '+overTemplate,
      descriptionArgs:{...(base.descriptionArgs||{}),...overArgs},
      overExaltEffectId:over.id,
      overExaltEffectName:over.name,
      overExaltBaseSkillId:base.id,
      overExaltBaseSkillName:base.name
    };
  }
  function ensureEnlightenUi(){
    let sel=$('charEnlighten');
    if(!sel){
      const anchor=characterLevelControl()?.closest('.field')||$('innerSpirit')?.closest('.field');if(!anchor)return;
      const wrap=document.createElement('div');wrap.className='field';
      wrap.innerHTML='<label for="charEnlighten"></label><select id="charEnlighten"><option value=""></option></select><small></small>';
      anchor.insertAdjacentElement('afterend',wrap);sel=$('charEnlighten');
      const desc=document.createElement('div');desc.id='enlightenDesc';desc.className='desc';desc.style.marginTop='8px';wrap.insertAdjacentElement('afterend',desc);
      sel.addEventListener('change',()=>{configurePsycheSurgeControl(false);applyCharacterStats();renderEnlightenSummary();renderCharacterResourceControls(false);refreshBattleProgressionUi();renderSkillOptions(currentSkill?.id);applySkill();$('calcBtn')?.click()},{capture:true});
    }
    const field=sel.closest('.field'),label=field?.querySelector('label'),note=field?.querySelector('small');
    if(label)label.textContent=ui('角色启灵','Enlighten');
    if(note)note.textContent=ui('按 SKeyDB 累计应用：启灵2包含启灵1与启灵2，启灵3继续叠加启灵3效果；+4 超限继续叠加超限升级，最终法则再叠加最终法则升级。','SKeyDB upgrades are cumulative: E2 includes E1+E2, E3 adds E3, Over-Exalt adds its upgrade, and Absolute Axiom adds the final upgrade.');
    ensurePsycheSurgeUi();
  }
  function ensurePsycheSurgeUi(){
    let sel=$('psycheSurgeLevel');
    if(!sel){
      const anchor=$('charEnlighten')?.closest('.field');if(!anchor)return;
      const wrap=document.createElement('div');wrap.className='field';
      wrap.innerHTML='<label for="psycheSurgeLevel"></label><select id="psycheSurgeLevel"></select><small></small>';
      anchor.insertAdjacentElement('afterend',wrap);sel=$('psycheSurgeLevel');
      for(let i=0;i<=12;i++){const o=document.createElement('option');o.value=String(i);sel.appendChild(o)}
      sel.addEventListener('change',()=>{applyCharacterStats();updateSkillLevel();$('calcBtn')?.click()},{capture:true});
    }
    const field=sel.closest('.field');
    const label=field?.querySelector('label');if(label)label.textContent=ui('启灵后副属性成长','Post-E3 Substat Growth');
    const note=field?.querySelector('small');if(note)note.textContent=ui('启灵3后可选择 0–12 档副属性成长：继续按角色自身副属性成长系数增加暴击率、暴击伤害、伤害强效、回充等属性；与“灵塑”是两套独立成长。','After E3, select substat growth tier 0–12. Crit Rate, Crit DMG, Damage Amplification, regeneration, and other substats continue to grow using the Awakener’s own SKeyDB coefficients. This progression is independent from Soulforge.');
    for(let i=0;i<sel.options.length;i++)sel.options[i].textContent=i===0?ui('0 · 无额外副属性成长','0 · No extra substat growth'):ui(`${i} · 启灵3后第 ${i} 档`,`${i} · Post-E3 tier ${i}`);
    configurePsycheSurgeControl(false);
  }
  function configurePsycheSurgeControl(reset=false){
    const sel=$('psycheSurgeLevel');if(!sel)return;const unlocked=psycheSurgeUnlocked();
    if(reset||!unlocked)sel.value='0';sel.disabled=!unlocked;
    sel.title=unlocked?ui('启灵3后可按实际副属性成长档位选择 0–12','After E3, select the actual substat growth tier from 0–12'):ui('达到启灵3后解锁该成长档','This growth tier unlocks at E3');
  }
  function enlightenSlotLabel(slot){
    if(isEnglish()){
      if(slot==='OverExalt')return 'Over-Exalt';
      if(slot==='AbsoluteAxiom')return 'Absolute Axiom';
      if(slot==='E1'||slot==='E2'||slot==='E3')return slot;
      return slot;
    }
    if(slot==='OverExalt')return '+4 · 超限';
    if(slot==='AbsoluteAxiom')return '最终法则';
    if(slot==='E1')return '启灵1';
    if(slot==='E2')return '启灵2';
    if(slot==='E3')return '启灵3';
    return slot;
  }
  function configureEnlightenControl(resetCharacterSpecific=false){
    ensureEnlightenUi();const sel=$('charEnlighten');if(!sel)return;const prev=resetCharacterSpecific?'':sel.value;
    sel.innerHTML=`<option value="">${ui('未启灵','No Enlighten')}</option>`;
    for(const slot of ['E1','E2','E3','OverExalt','AbsoluteAxiom']){
      if(!currentEnlightens.some(x=>x.slot===slot))continue;
      const o=document.createElement('option');o.value=slot;o.textContent=enlightenSlotLabel(slot);o.selected=prev===slot;sel.appendChild(o);
    }
    if(!Array.from(sel.options).some(o=>o.value===prev))sel.value='';
    configurePsycheSurgeControl(resetCharacterSpecific);renderEnlightenSummary();
  }
  function renderEnlightenSummary(){
    const box=$('enlightenDesc');if(!box)return;const active=activeEnlightens();
    box.innerHTML=active.length
      ?active.map(x=>'<strong>'+escape(enlightenSlotLabel(x.slot)+(isEnglish()&&x.name?' · '+x.name:''))+'</strong>'+(isEnglish()?': ':'：')+renderRichRecord(x,1)).join('<br><br>')
      :ui('未启灵：当前不应用启灵升级。','No Enlighten: no Enlighten upgrades are applied.');
  }
  function rouseActive(){return $('rouseActive')?.checked===true}
  function currentRouseSkill(){return currentSkills.find(x=>x.slot==='Rouse')||null}
  function ensureRouseUi(){
    let wrap=$('rouseStateBlock');
    if(!wrap){
      const anchor=$('enlightenDesc')||$('charStatsSummary');if(!anchor)return;
      wrap=document.createElement('div');wrap.id='rouseStateBlock';wrap.className='field full calcResourceField isCalculated';wrap.style.marginTop='8px';
      wrap.innerHTML='<label class="inlineCheck"><input id="rouseActive" type="checkbox"> <span id="rouseStateLabel"></span></label><small id="rouseStateNote"></small>';
      anchor.insertAdjacentElement('afterend',wrap);
      $('rouseActive')?.addEventListener('change',()=>{renderRouseSummary();renderCharacterResourceControls(false);updateSkillLevel();$('calcBtn')?.click()},{capture:true});
    }
    const label=$('rouseStateLabel');if(label)label.textContent=ui('灵知觉醒已发动','Rouse Active');
    return wrap;
  }
  function renderRouseSummary(){
    ensureRouseUi();const note=$('rouseStateNote');if(!note)return;
    const rouse=currentRouseSkill(),state=rouseActive()?ui('已发动','Active'):ui('未发动','Inactive');
    const desc=rouse?renderRichRecord(resolveSkillEnlighten(rouse),1):escape(ui('当前角色的灵知觉醒技能资料尚未加载。','This Awakener’s Rouse skill record has not loaded yet.'));
    note.innerHTML='<strong>'+escape(isEnglish()?`Current: ${state}. `:`当前：${state}。`)+'</strong>'+desc+escape(rouseActive()?ui(' · 已明确接入的伤害乘区会参与计算。',' · Explicitly supported damage layers are included.'):ui(' · 灵知觉醒后的专属效果不会参与计算。',' · Rouse-specific effects are excluded while inactive.'));
  }
  function ensureSkillRuntimeUi(){
    let block=$('skillRuntimeBlock');
    if(!block){
      const anchor=$('skillDesc');if(!anchor)return;
      block=document.createElement('div');block.id='skillRuntimeBlock';block.className='formGrid';block.style.marginTop='10px';block.hidden=true;
      block.innerHTML='<div class="field" id="skillActualHitsField"><label for="skillActualHits"></label><input id="skillActualHits" type="number" min="1" step="1"><small></small></div><div class="field full"><div class="desc" id="skillRuntimeWarnings"></div></div>';
      anchor.insertAdjacentElement('afterend',block);
      const rerun=()=>{if(currentSkill)updateSkillLevel()};
      $('skillActualHits')?.addEventListener('input',rerun,{capture:true});$('skillActualHits')?.addEventListener('change',rerun,{capture:true});
    }
    const field=$('skillActualHitsField');
    if(field){
      const label=field.querySelector('label');if(label)label.textContent=ui('本次实际伤害段数','Actual Hit Count');
      const input=$('skillActualHits');if(input)input.placeholder=ui('按技能默认/最低段数','Use skill default/minimum hits');
      const small=field.querySelector('small');if(small)small.textContent=ui('仅在随机段数、X+N、首领战/低生命额外段数等动态技能中出现；填写后覆盖该技能唯一伤害事件的段数。','Shown only for dynamic hit-count skills such as random hits, X+N, boss-only, or low-HP extra hits. Entering a value overrides the hit count of the skill’s single damage event.');
    }
    return block;
  }

  const resourceSpecs={
    'awakener-0001':[
      {overlayId:'overlay.24.realm-and-persona',key:'personaState',label:'当前人格 / 情绪状态',type:'select',calculated:true,showInCalculator:true,options:[['depressed','抑郁人格'],['manic','躁狂人格']],description:'“24”的人格会参与已能可靠还原的伤害分支：躁狂人格会增加「Frenzied Slash」的伤害段数；最终法则且灵知觉醒已发动时，指令卡人格加成按文本翻倍；若启用维度影像，躁狂人格在回合开始获得的临时暴击率与暴击伤害也会计入。其余多目标、后续状态或资源效果仅在可可靠解析时计入，避免高算。'},
      {key:'twistedCarrionPriorUses',label:'本场此前已释放「扭曲腐肉狂欢」次数',min:0,max:99,calculated:true,description:'该狂气爆发每次释放结束后，使「扭曲腐肉狂欢」在本场后续释放的基础伤害累计 +20%。第 1 次为 +0%，第 2 次 +20%，第 3 次 +40%，依此类推；当前这次新增的 +20% 不回溯放大本次伤害。'},
      {key:'twentyFourOverExaltPriorUses',label:'本场此前已释放「畸变的解剖」次数',min:0,max:99,calculated:true,requiredEnlighten:'OverExalt',description:'超限爆发每次释放后获得 24 点界域精通。这里填写当前技能结算前已经释放过的超限爆发次数；有效界域精通会增加 24 × 次数，并参与深海/血肉/超维/原初等已接入的界域精通公式。当前正在释放的这次超限不会反向放大其已经开始结算的基础爆发伤害。'},
      {key:'twentyFourTripleNextCommandActive',label:'超限后：当前是下一张三次生效的指令卡',type:'checkbox',calculated:true,requiredEnlighten:'OverExalt',description:'超限爆发「畸变的解剖」后，“24”的下一张指令卡生效 3 次。仅在当前计算的确实是那一张指令卡时勾选；计算器会把可解析的伤害/状态事件额外重复 2 次。'},
      {key:'twentyFourRousePosseUses',label:'灵知觉醒后本场已释放钥令次数（混沌）',min:0,max:99,calculated:true,dependsOnControl:'rouseActive',description:'灵知觉醒的混沌效果：每释放 1 次钥令，“24”的狂气爆发最终伤害提高对应技能等级的 25%–50%。这里填写当前爆发前已经释放的次数。'},
      {key:'twentyFourRouseArithmeticaConsumed',label:'灵知觉醒后累计消耗算力（血肉）',min:0,max:999,calculated:true,dependsOnControl:'rouseActive',description:'灵知觉醒的血肉效果：每消耗 1 点算力，“24”获得相当于攻击力 2%–4% 的力量。这里填写当前技能结算前已经累计消耗的算力；计算器会把生成的力量加入本次及后续伤害。'}
    ],
    'awakener-0056':[
      {overlayId:'overlay.arachne.weaver',key:'weaverStacks',label:'织命',min:0,max:5,calculated:false,description:'织命层数；启灵3上限为 5，启灵3前上限为 3。用于「奇点折跃」后的「无尽线缕」追击。'},
      {key:'singularityWarpActive',label:'奇点折跃已触发',type:'checkbox',calculated:false,description:'标记本次狂气爆发是否满足「奇点折跃」；额外效果按对应狂气爆发文本处理。'}
    ],
    'awakener-0060':[
      {overlayId:'overlay.caraboo.offering',key:'offeringStacks',label:'供奉',min:0,max:5,calculated:true,description:'卡拉布的狂气爆发会消耗全部供奉；每层使本次狂气爆发额外增加 1 段，并在结算后转化为等量饱足。'},
      {overlayId:'overlay.caraboo.satiety',key:'satietyStacks',label:'饱足',min:0,max:50,calculated:true,description:'每层提高卡拉布狂气爆发的基础伤害与护盾。伤害计算只把打出前已有的饱足计入本次基础伤害；供奉转化出的饱足不回溯放大已开始结算的本次爆发。'}
    ],
    'awakener-0018':[
      {overlayId:'overlay.doll-inferno.finale',key:'finaleStacks',label:'终末',min:0,max:10,calculated:true,requiredEnlighten:'AbsoluteAxiom',dependsOnControl:'rouseActive',description:'最终法则的灵知觉醒：每层「终末」使全队伤害强效 +8%。当前角色为熔毁·朵尔时会直接进入最终伤害公式；只有同时开启“灵知觉醒已发动”时生效。'},
      {overlayId:'overlay.doll-inferno.finale-form',key:'finaleFormActive',label:'终末形态已生效',type:'checkbox',calculated:true,description:'只在实际进入「终末形态」后勾选。会启用已明确接入的终末形态中毒触发；未勾选时不会把条件分支误算成常驻效果。'}
    ],
    'awakener-0014':[
      {overlayId:'overlay.doresain.corpse',key:'corpseStacks',label:'残骸',min:0,max:3,calculated:true},
      {key:'evernightPriorPlays',label:'本回合已打出永夜',min:0,max:20,calculated:true,requiredEnlighten:'E3',description:'启灵3起：第二张及后续「永夜」额外享受 100% 力量加成。这里填写本次永夜之前，本回合已经打出的永夜次数。'}
    ],
    'awakener-0041':[
      {overlayId:'overlay.pollux.sin-mark',key:'sinMarkStacks',label:'罪印',min:0,max:2000,calculated:true,description:'罪印上限按 2000 处理；每层使波吕克斯造成伤害时额外附加 1% 出血。'},
      {key:'polluxCommandFinalBonusPct',label:'指令卡最终伤害额外加成',inputLabel:'指令卡最终伤害额外加成 %',min:0,max:100,calculated:true,description:'填写当前实际生效值。SKeyDB 记录的两组档位分别为 18/22/26/30% 与 9/11/13/15%；不自动猜测该增益的来源等级。'},
      {key:'atonementByPainActive',label:'苦痛救赎生效',type:'checkbox',calculated:true,description:'当前指令卡额外结算 1 次「苦痛救赎」；基础为 200% 攻击力，并会按本次探索已完成战斗数自动提高。'},
      {key:'atonementByPainDouble',label:'启灵3：苦痛救赎应用 2 次',type:'checkbox',calculated:true,requiredEnlighten:'E3',dependsOn:'atonementByPainActive',description:'启灵3后，第 3 次打出「圣心」会使下一张指令卡的「苦痛救赎」应用 2 次。只有“苦痛救赎生效”时该开关才有意义。'}
    ],
    'awakener-0010':[
      {overlayId:'overlay.clementine.symbiosis',key:'symbiosisRemovedStacks',label:'本场累计已移除共生',min:0,max:20,calculated:true,requiredEnlighten:'E2',description:'启灵2起：每移除 1 层共生，克莱门汀在本场战斗中的基础伤害累计 +3%。这里填写本场累计已移除层数，而不是仅填写当前这一次；输入上限随启灵3 / 最终法则变化。'},
      {key:'clementineFirstCommandRouse',label:'当前是本回合第一张指令卡',type:'checkbox',calculated:true,dependsOnControl:'rouseActive',description:'仅在“灵知觉醒已发动”时生效。「妖虫的呼唤」：每回合第一张指令卡的伤害、护盾、回复、狂气和银钥效果额外触发 2 次；伤害计算器只重复当前可解析的伤害/状态事件。'}
    ],
    'awakener-0058':[
      {overlayId:'overlay.pontos.pack-hunt',key:'packHuntStacks',label:'群猎',min:0,max:9,calculated:true,description:'有至少 1 层时，下一张对应的「魇」衍生卡消耗 1 层并额外触发 1 次；伤害计算会让「猎杀之魇」的固定伤害额外结算 1 次。'}
    ],
    'awakener-0020':[
      {key:'ramonaPosseUses',label:'本场已使用钥令次数',min:0,max:99,calculated:true,description:'「命定之剑」：本场每使用 1 次钥令，力量倍率 +1；基础力量倍率为 3 倍。'},
      {overlayId:'overlay.ramona-timeworn.negentropy',key:'negentropyStacks',label:'负熵',min:0,max:3,calculated:false,description:'3 层可使指令卡触发回环；回环生成或选择的派生效果请直接选择对应派生卡计算。'}
    ],
    'awakener-0040':[
      {overlayId:'overlay.pickman.creativity',key:'creativityStacks',label:'创意',min:0,max:10,calculated:false},
      {overlayId:'overlay.pickman.fantasia',key:'fantasiaStacks',label:'幻想',min:0,max:999,calculated:false,description:'SKeyDB 未给出「幻想」明确总上限，暂以 999 作为输入保护上限。'}
    ],
    'awakener-0057':[
      {overlayId:'overlay.saya.gynoecium',key:'gynoeciumStacks',label:'Gynoecium',min:0,max:4,calculated:false,description:'可被沙耶的狂气爆发消耗以强化效果，最多 4 层。'}
    ],
    'awakener-0055':[
      {overlayId:'overlay.vortice.vortex-reload',key:'vortexReloadStacks',label:'涡流装填',min:0,max:999,calculated:false,description:'其他唤醒体释放狂气爆发后消耗 1 层并追击「涡！流！弹！」；这一层本身只决定是否产生追击，直接计算追击伤害时请选中派生卡「涡！流！弹！」。'},
      {key:'vortexShellDoubleRemaining',label:'超限双触发剩余「涡！流！弹！」次数',min:0,max:5,calculated:true,requiredEnlighten:'OverExalt',description:'释放超限爆发后，接下来 5 次「涡！流！弹！」均触发 2 次。若当前仍在这 5 次范围内填写 1–5；当前选择「涡！流！弹！」时会自动把可解析事件额外结算 1 次。'}
    ],
    'awakener-0061':[
      {overlayId:'overlay.ogier-oathbound.undertow',key:'undertowStacks',label:'暗潮',min:0,max:3,calculated:true,description:'每层提高负誓·奥吉尔指令卡最终伤害；启灵1起每层额外提高暴击伤害，启灵3后每层最终伤害增幅由 33% 提高至 50%。'},
      {overlayId:'overlay.ogier-oathbound.guilt',key:'guiltStacks',label:'罪责',min:0,max:3,calculated:false,description:'打出负誓·奥吉尔的技能牌时消耗 1 层，抽取 1 张其防御牌并使其获得保留；最多 3 层并跨战斗保留。该资源不直接增加单次伤害。'}
    ],
    'awakener-0032':[
      {overlayId:'overlay.miryam.vanitys-collapse',key:'vanityCollapseCount',label:'本场已完成圣礼→执妄转化',min:0,max:99,calculated:true,requiredEnlighten:'E3',description:'启灵3「虚荣的崩塌」：每完成 1 次圣礼→执妄转化，本场战斗弥利亚姆基础伤害 +15%。'}
    ],
    'awakener-0043':[
      {overlayId:'overlay.ryker.certain-gain',key:'blackSigilsConsumed',label:'探索中已消耗黑印',min:0,max:9999,calculated:true,requiredEnlighten:'E3',description:'启灵3「确定收益」：每消耗 1 点黑印，对应技能基础伤害 +0.5%。'}
    ],
    'awakener-0024':[
      {overlayId:'overlay.horla.emotion',coversOverlayIds:['overlay.horla.anger','overlay.horla.fear','overlay.horla.grief','overlay.horla.happiness'],key:'horlaEmotion',label:'当前情绪',type:'select',calculated:true,options:[['','无'],['anger','愤怒'],['fear','恐惧'],['grief','悲伤'],['happiness','喜悦']],description:'情绪同一时间只能存在一种。愤怒的全队最终伤害已自动计入；恐惧的中毒/反击生成已自动计入。恐惧对“获得力量”的增幅属于跨卡状态生成，当前不会反推既有力量，请把实际获得后的力量填入上方“力量 / 临时力量”。悲伤与喜悦主要影响回复/资源，不改变本次直接伤害。'},
      {overlayId:'overlay.horla.metaphor',key:'angerMetaphorStacks',label:'愤怒隐喻',min:0,max:3,calculated:true,description:'对应技能会消耗全部愤怒隐喻；每层额外造成 2 段伤害。'},
      {overlayId:'overlay.horla.metaphor',key:'griefMetaphorStacks',label:'悲伤隐喻',min:0,max:3,calculated:false},
      {overlayId:'overlay.horla.metaphor',key:'happinessMetaphorStacks',label:'喜悦隐喻',min:0,max:3,calculated:false},
      {overlayId:'overlay.horla.metaphor',key:'fearMetaphorStacks',label:'恐惧隐喻',min:0,max:3,calculated:false}
    ],
    'awakener-0029':[
      {overlayId:'overlay.lily.endure',key:'endureStacks',label:'忍耐',min:0,max:999999,calculated:true,description:'「报偿打击」：每 1 层忍耐使本次伤害增加 2；使用后移除忍耐。启灵3只移除一半，不降低本次伤害换算。'},
      {key:'endureConversionBoostStacks',label:'最终法则：忍耐转化强化',min:0,max:5,calculated:true,requiredEnlighten:'AbsoluteAxiom',dependsOnControl:'rouseActive',description:'最终法则的灵知觉醒状态下：释放狂气爆发后，本回合每受到 1 次攻击，使下一次「报偿打击」转化的忍耐效果 +40%，最多 5 层。只有已开启“灵知觉醒已发动”时输入才生效。'}
    ],
    'awakener-0052':[
      {overlayId:'overlay.wanda.dreamlure',key:'dreamlureStacks',label:'梦引',min:0,max:10,calculated:true,description:'「脊刺锁链」在梦引≥5时可成功触发跃迁，额外造成 2 段伤害并消耗 5 层。'},
      {overlayId:'overlay.wanda.murmurs',key:'murmursActive',label:'低语状态生效',type:'checkbox',calculated:true,description:'主动伤害降低 60%；启灵2后降低 65%，同时攻击次数翻倍。'}
    ],
    'awakener-0054':[
      {overlayId:'overlay.xu.enthrall',coversOverlayIds:['overlay.xu.betroth'],key:'xuChoice',label:'当前痴醉选择',type:'select',calculated:false,options:[['','未选择'],['betroth','相许'],['enthrall','夺魄']],description:'「夜雾下的情誓」的二选一状态：相许施加痴醉，夺魄移除痴醉并按层结算纯粹伤害/中毒。'},
      {overlayId:'overlay.xu.spellbound',key:'spellboundStacks',label:'目标痴醉',min:0,max:15,calculated:true,description:'夺魄会移除全部痴醉；每层造成目标最大生命 1% 纯粹伤害并触发 40% 中毒。基础上限 5，启灵3上限 10；最终法则只有在“灵知觉醒已发动”时上限才提高到 15。'},
      {key:'xuFirstCommandRouse',label:'最终法则：当前是本回合第一张指令卡',type:'checkbox',calculated:true,requiredEnlighten:'AbsoluteAxiom',dependsOnControl:'rouseActive',description:'最终法则灵知觉醒：徐每回合打出的第一张指令卡额外生效 1 次。仅在这张卡确实是本回合第一张指令卡时勾选。'}
    ],
    'awakener-0019':[
      {key:'helotRouseTurnStarts',label:'索魂者宣言已触发回合开始次数',min:0,max:99,calculated:true,dependsOnControl:'rouseActive',description:'灵知觉醒「索魂者宣言」每次回合开始都会使血链·希洛本场基础伤害提高当前技能等级对应的 10%–15%。填写已经触发的次数；同一来源的多次成长先累加，再作为「觉醒基伤」独立乘区。'},
      {key:'helotHatredBelowHalfHp',label:'「恨意宣泄」当前生命低于 50%',type:'checkbox',calculated:true,requiredEnlighten:'E2',description:'启灵2：生命低于 50% 时，「恨意宣泄」本次获得的力量翻倍。开启后会把攻击力百分比力量按双倍加入本次伤害公式。'},
      {key:'helotOverExaltBuffActive',label:'超限爆发暴伤 +35% 已生效',type:'checkbox',calculated:true,requiredEnlighten:'OverExalt',description:'「缚恨」发动后血链·希洛暴击伤害 +35%。只有该超限状态当前确实生效时勾选，不会因为解锁 +4 自动常驻。'},
      {key:'helotTemporaryEnhanceStacks',label:'当前指令卡临时强化层数',min:0,max:50,calculated:true,requiredEnlighten:'AbsoluteAxiom',dependsOnControl:'rouseActive',description:'最终法则强化后的「索魂者宣言」：释放狂气爆发后，手牌中每种不同指令卡获得 50 层临时强化。每层使本卡最终伤害 +2%；这里填写当前卡实际持有的层数，最多 50。'},
      {key:'helotSanguineTurnActive',label:'「缚身锁链」本回合出血效果已生效',type:'checkbox',calculated:true,description:'「缚身锁链」发动后，本回合血链·希洛每次造成主动伤害都会附加出血。计算「缚身锁链」自身时会自动计入，不需要重复勾选；计算同回合后续卡牌时再勾选。出血比例按「缚身锁链」当前等级读取（1–6 级为 75%–100%）。'}
    ],
    'awakener-0027':[
      {overlayId:'overlay.kathigu-ra.combust',key:'combustStacks',label:'燃烧',min:0,max:10,calculated:true,requiredEnlighten:'E3',description:'启灵3后，每获得 1 层燃烧，本场战斗基础伤害 +5%；按当前累计层数计算，最高输入 10 层。'},
      {overlayId:'overlay.kathigu-ra.fiamma',key:'fiammaActive',label:'当前卡具有活焰',type:'checkbox',calculated:true,description:'勾选表示当前所计算的这张卡带有活焰。活焰是单卡状态，是否存在与层数分开控制。'},
      {overlayId:'overlay.kathigu-ra.fiamma',key:'fiammaStacks',label:'活焰层数',inputLabel:'活焰层数',min:1,max:3,calculated:true,dependsOn:'fiammaActive',description:'单张指令卡最多 3 层。基础每层使本卡最终伤害等效果 +30%；3 层时会触发启灵2对特定技能的额外效果。灵知觉醒 + 最终法则时，每层最终伤害/力量效果再额外 +30%。'}
    ],
    'awakener-0035':[
      {overlayId:'overlay.murphy-fauxborn.life-seal',key:'lifeSealStacks',label:'生命封印',min:0,max:5,calculated:true,description:'每层使下一次「妄想公主」施加的诞生仪式 +20%；灵塑启用时该增幅翻倍。5 层时该技能伤害段数翻倍。'}
    ]
  };
  const resourceSpecEnglish={
    twistedCarrionPriorUses:{label:'Prior Twisted Carrion Revel uses this battle',description:'Enter uses completed before the current cast. Each prior use increases later casts’ Base DMG by 20%; the current cast does not retroactively increase itself.'},
    twentyFourOverExaltPriorUses:{label:'Prior Aberrant Vivisection uses this battle',description:'Each completed Over-Exalt grants 24 Realm Mastery. Enter only uses completed before the current resolution.'},
    twentyFourTripleNextCommandActive:{label:'After Over-Exalt: current card is the next triple-resolving Command',description:'After Aberrant Vivisection, “24”’s next Command resolves 3 times. Enable only for that specific card.'},
    twentyFourRousePosseUses:{label:'Posse uses since Rouse (Chaos)',description:'Enter Posse uses completed before the current Exalt for the Chaos Rouse Final DMG scaling.'},
    twentyFourRouseArithmeticaConsumed:{label:'Arithmetica consumed since Rouse (Caro)',description:'Enter Arithmetica already consumed before the current skill resolves; the Caro Rouse converts it into STR from ATK.'},
    singularityWarpActive:{label:'Singularity Warp triggered',description:'Marks whether the current Exalt satisfies Singularity Warp. Additional effects follow the source Exalt text.'},
    evernightPriorPlays:{label:'Evernight plays earlier this turn',description:'From E3 onward, later Evernight cards gain the additional STR scaling. Enter how many Evernight cards were played earlier this turn.'},
    polluxCommandFinalBonusPct:{label:'Extra Command Final DMG bonus',inputLabel:'Extra Command Final DMG bonus %',description:'Enter the Final DMG bonus currently active for Command cards. The calculator does not guess which source tier produced it.'},
    atonementByPainActive:{label:'Atonement by Pain active',description:'Adds one Atonement by Pain resolution to the current Command, using its supported ATK scaling and battle-growth rules.'},
    atonementByPainDouble:{label:'E3: Atonement by Pain resolves twice',description:'Enable when E3 causes Atonement by Pain to resolve twice for the current calculation.'},
    clementineFirstCommandRouse:{label:'Current card is the first Command this turn',description:'Enable only when the current card is the first Command played this turn while the relevant Rouse effect is active.'},
    ramonaPosseUses:{label:'Posse uses this battle',description:'Enter the number of Posse uses already completed this battle for effects that scale with prior Posse uses.'},
    vortexShellDoubleRemaining:{label:'Remaining double-trigger Vortex Shell uses',description:'Enter how many Vortex Shell resolutions still receive the Over-Exalt double-trigger effect.'},
    endureConversionBoostStacks:{label:'Absolute Axiom: Endure conversion boost',description:'Enter the active boost stacks for the next Strike to Protect while the Absolute Axiom Rouse effect is active.'},
    xuFirstCommandRouse:{label:'Absolute Axiom: current card is the first Command this turn',description:'Xu’s first Command each turn resolves one extra time during the relevant Rouse state. Enable only for that card.'},
    helotRouseTurnStarts:{label:'Reaper’s Declaration turn-start triggers',description:'Enter how many turn starts have triggered Reaper’s Declaration. Repeated Base DMG growth is accumulated from the source skill values.'},
    helotHatredBelowHalfHp:{label:'Hatred Unleashed: current HP below 50%',description:'E2: when HP is below 50%, the STR gained by Hatred Unleashed is doubled for this resolution.'},
    helotOverExaltBuffActive:{label:'Over-Exalt Crit DMG +35% active',description:'Enable only while the +35% Crit DMG state from the Over-Exalt effect is currently active.'},
    helotTemporaryEnhanceStacks:{label:'Temporary enhancement stacks on current Command',description:'Enter the temporary enhancement stacks actually held by the current Command during the Absolute Axiom Rouse state (max 50).'},
    helotSanguineTurnActive:{label:'Sanguine Fetters Bleed effect active this turn',description:'Enable for later cards in the same turn after Sanguine Fetters has activated its on-Active-DMG Bleed effect.'}
  };
  function englishResourceOption(spec,value,label){
    const common={depressed:'Depressed Persona',manic:'Manic Persona',anger:'Anger',fear:'Fear',grief:'Grief',happiness:'Happiness',betroth:'Betroth',enthrall:'Enthrall'};
    if(String(value)==='')return spec?.key==='xuChoice'?'Not selected':'None';
    return common[value]||label;
  }
  function resolveOverlayEnlighten(baseOverlay){
    if(!baseOverlay)return baseOverlay;
    let next=cloneRecord(baseOverlay);
    const enlightenIds=new Set(activeEnlightens().map(x=>x.id));
    for(const upgrade of baseOverlay.upgrades||[]){
      if(upgrade?.operation==='link_only'||upgrade?.upgraderType!=='enlighten'||!enlightenIds.has(upgrade.upgraderId))continue;
      next=applyEnlightenPatch(next,upgrade);
    }
    return next;
  }
  function inferredOverlayStackMax(overlay){
    const text=String(renderTemplate(resolveOverlayEnlighten(overlay),1)||'');
    const patterns=[
      /(?:max(?:imum)?(?:\s+of)?|stacks?\s+up\s+to|stacking\s+up\s+to)\s*(\d+)\s*(?:stacks?)?/i,
      /up\s+to\s+(\d+)\s+stacks?/i,
      /reaches?\s+(\d+)\s+stacks?/i
    ];
    for(const re of patterns){const m=text.match(re);if(m)return Math.max(1,Math.floor(Number(m[1])||0))}
    return null;
  }
  function inferredResourceSpec(overlay){
    if(!overlay?.id)return null;
    const resolved=resolveOverlayEnlighten(overlay);
    const text=String(renderTemplate(resolved,1)||'');
    const key='overlay_'+String(overlay.id).replace(/[^a-z0-9]+/gi,'_').replace(/^_|_$/g,'').toLowerCase();
    if(/\bstacks?\b/i.test(text)){
      let max=inferredOverlayStackMax(overlay);
      if(max===null){const exact=text.match(/(?:have|has|reach(?:es)?|at)\s+(\d+)\s+stacks?/i);if(exact)max=Math.max(1,Math.floor(Number(exact[1])||0))}
      return {overlayId:overlay.id,key,label:zhText(overlay.name||'角色状态'),min:0,max:max??999,calculated:false,description:max===null?zhText(text)+' 当前 SKeyDB 未给出明确上限，计算器暂以 999 作为输入保护上限。':undefined};
    }
    if(String(overlay.overlayType||'').toLowerCase()==='mechanic'){
      return {overlayId:overlay.id,key,label:zhText(overlay.name||'角色状态')+' 生效',type:'checkbox',calculated:false,description:zhText(text)||'角色专属状态/机制。'};
    }
    return null;
  }
  function resourceRequirementMet(spec){if(!spec?.requiredEnlighten)return true;const current=ENLIGHTEN_ORDER.indexOf(selectedEnlightenSlot());const need=ENLIGHTEN_ORDER.indexOf(spec.requiredEnlighten);return current>=need&&need>=0}
  function currentResourceSpecs(){
    // The damage calculator only exposes resources that actually participate
    // in the current damage/event formula. Pure bookkeeping states stay in
    // SKeyDB data but are intentionally omitted from this UI.
    return (resourceSpecs[currentAwakener?.id]||[]).filter(spec=>resourceRequirementMet(spec)&&(spec.calculated===true||spec.showInCalculator===true));
  }
  function effectiveResourceMax(spec){
    if(spec?.key==='symbiosisRemovedStacks'){
      const slot=selectedEnlightenSlot();
      if(slot==='AbsoluteAxiom'&&rouseActive())return 20;
      if(ENLIGHTEN_ORDER.indexOf(slot)>=ENLIGHTEN_ORDER.indexOf('E3'))return 15;
      return 10;
    }
    if(spec?.key==='spellboundStacks'){
      const slot=selectedEnlightenSlot();
      if(slot==='AbsoluteAxiom'&&rouseActive())return 15;
      if(ENLIGHTEN_ORDER.indexOf(slot)>=ENLIGHTEN_ORDER.indexOf('E3'))return 10;
      return 5;
    }
    return Number.isFinite(Number(spec?.max))?Number(spec.max):999;
  }
  function resourceDependencyEnabled(spec,values={}){
    if(spec?.dependsOn&&Number(values[spec.dependsOn])<=0)return false;
    if(spec?.dependsOnControl&&$(spec.dependsOnControl)?.checked!==true)return false;
    return true;
  }
  function characterResourceValues(){
    const values={awakenerId:currentAwakener?.id||null};
    const specsByKey=new Map(currentResourceSpecs().map(spec=>[spec.key,spec]));
    document.querySelectorAll('#characterResourceBlock [data-resource-key]').forEach(el=>{
      if(el.type==='checkbox')values[el.dataset.resourceKey]=el.checked?1:0;
      else if(el.tagName==='SELECT')values[el.dataset.resourceKey]=el.value;
      else{
        const spec=specsByKey.get(el.dataset.resourceKey)||{};
        const min=Number.isFinite(Number(spec.min))?Number(spec.min):0;
        const max=effectiveResourceMax(spec);
        const value=Math.min(max,Math.max(min,num(el.value,min)));
        values[el.dataset.resourceKey]=value;
        if(String(el.value)!==String(value))el.value=String(value);
      }
    });
    window.MorimensCharacterResources=values;
    return values;
  }
  function ensureCharacterResourceUi(){
    if($('characterResourceBlock'))return;
    const anchor=$('enlightenDesc')||$('charStatsSummary')||$('skillDesc');if(!anchor)return;
    const block=document.createElement('div');block.id='characterResourceBlock';block.className='formGrid';block.style.marginTop='10px';block.hidden=true;
    anchor.insertAdjacentElement('afterend',block);
  }
  function renderCharacterResourceControls(reset=false){
    ensureCharacterResourceUi();const block=$('characterResourceBlock');if(!block)return;
    const specs=currentResourceSpecs();
    if(!specs.length){block.innerHTML='';block.hidden=true;window.MorimensCharacterResources={awakenerId:currentAwakener?.id||null};return}
    const previous=reset?{}:characterResourceValues();block.innerHTML='';
    for(const spec of specs){
      const overlay=resolveOverlayEnlighten((currentOverlays||[]).find(x=>x.id===spec.overlayId));
      const englishSpec=resourceSpecEnglish[spec.key]||{};
      const wrap=document.createElement('div');wrap.className='field calcResourceField'+(spec.calculated===true?' isCalculated':' isInformational');
      const descriptionHtml=isEnglish()
        ?(overlay?renderRichRecord(overlay,1):escape(englishSpec.description||'Character-specific combat state.'))
        :(spec.description?escape(zhText(spec.description)):(overlay?renderRichRecord(overlay,1):escape('角色专属战斗资源。')));
      const localizedSpecLabel=isEnglish()?(overlay?.name||englishSpec.label||spec.label):zhText(spec.label);
      const labelHtml=overlay?termHtml(overlay.name,localizedSpecLabel):escape(localizedSpecLabel);
      const suffix=spec.calculated===true?ui(' · 已接入伤害计算。',' · Applied to damage calculation.'):ui(' · 状态说明：当前不自动折算到总伤害。',' · Informational only; not automatically converted into total damage.');
      if(spec.type==='checkbox'){
        const checked=Number(previous[spec.key])>0,dependentOff=!resourceDependencyEnabled(spec,previous);wrap.classList.add('full');
        wrap.innerHTML='<label class="inlineCheck"><input type="checkbox" data-resource-key="'+escape(spec.key)+'" '+(checked?'checked':'')+' '+(dependentOff?'disabled':'')+'> '+labelHtml+'</label><small>'+descriptionHtml+suffix+'</small>';
      }else if(spec.type==='select'){
        const selected=String(previous[spec.key]??''),dependentOff=!resourceDependencyEnabled(spec,previous);
        const options=(spec.options||[]).map(([value,label])=>'<option value="'+escape(value)+'" '+(String(value)===selected?'selected':'')+'>'+escape(isEnglish()?englishResourceOption(spec,value,label):label)+'</option>').join('');
        wrap.innerHTML='<label>'+labelHtml+'</label><select data-resource-key="'+escape(spec.key)+'" '+(dependentOff?'disabled':'')+'>'+options+'</select><small>'+descriptionHtml+suffix+'</small>';
      }else{
        const max=effectiveResourceMax(spec),fallback=Number.isFinite(Number(spec.min))?Number(spec.min):0,value=Math.min(max,Math.max(fallback,Number(previous[spec.key])||fallback));
        const inputLabel=isEnglish()?(englishSpec.inputLabel||overlay?.name||englishSpec.label||spec.label):zhText(spec.inputLabel||spec.label+'数量');
        const dependentOff=!resourceDependencyEnabled(spec,previous);
        wrap.innerHTML='<label>'+(overlay?termHtml(overlay.name,inputLabel):escape(inputLabel))+'</label><input type="number" min="'+spec.min+'" max="'+max+'" step="1" data-resource-key="'+escape(spec.key)+'" value="'+value+'" '+(dependentOff?'disabled':'')+'><small>'+descriptionHtml+suffix+'</small>';
      }
      block.appendChild(wrap);
    }
    block.hidden=false;
    const syncDependencies=()=>{const values=characterResourceValues();for(const spec of currentResourceSpecs()){if(!spec.dependsOn&&!spec.dependsOnControl)continue;const input=block.querySelector('[data-resource-key="'+CSS.escape(spec.key)+'"]');if(input)input.disabled=!resourceDependencyEnabled(spec,values)}};
    block.querySelectorAll('[data-resource-key]').forEach(el=>{const rerun=()=>{syncDependencies();updateSkillLevel();$('calcBtn')?.click()};el.addEventListener('input',rerun,{capture:true});el.addEventListener('change',rerun,{capture:true})});
    syncDependencies();
  }
  function resolvedOverlay(id){
    return resolveOverlayEnlighten((currentOverlays||[]).find(x=>x.id===id));
  }
  function renderedOverlayNumber(id,pattern,group=1){
    const overlay=resolvedOverlay(id);if(!overlay)return 0;
    const text=String(renderTemplate(overlay,1)||'');
    const m=text.match(pattern);return m?Math.max(0,num(m[group],0)):0;
  }
  function cloneExtraDamageEvents(events,count,label){
    const source=(events||[]).find(x=>x.type==='active'||x.type==='pierce');
    if(!source||count<=0)return events||[];
    const out=[...(events||[])];
    for(let n=0;n<count;n++){
      out.push({...source,id:String(source.id||'damage')+'-resource-'+String(n+1),index:out.length,position:(Number(source.position)||0)+0.0001*(n+1),groupId:String(source.groupId||source.id||'damage')+'-resource-'+String(n+1),resourceEffectLabel:label});
    }
    return out;
  }
  function explorationBattleIndex(){return Math.max(1,Math.min(99,Math.floor(num($('explorationBattleIndex')?.value,1))))}
  function completedBattles(){return Math.max(0,explorationBattleIndex()-1)}
  function cumulativeWheelBattleBonuses(text){
    const out={base:0,power:0,critRate:0,critDamage:0,vulnerability:0,final:0,realmMastery:0,aliemusRegen:0,keyflareRegen:0,sigilYield:0,deathResistance:0,poisonInfliction:0,fixedPoisonInfliction:0,poisonTrigger:0,counterGeneration:0};
    const normalized=String(text||'').replace(/Crit\./gi,'Crit');
    for(const raw of normalized.split(/(?<=[.!?。；;])\s+(?=(?:[\"“{(]?[A-Z0-9]|[\u3400-\u9fff]))/)){
      const s=raw.trim();if(!s)continue;
      if(!/(?:after|at\s+the\s+end\s+of)\s+(?:each|the)\s+battle(?!\s+begins?)(?:\s+ends?)?/i.test(s))continue;
      sumBonus(out,numericBonusesFromText(s,true));
    }
    return out;
  }
  function scaledBattleBonuses(source,count){
    const out={};for(const key of Object.keys(source||{})){if(key!=='skipped')out[key]=num(source[key])*Math.max(0,count)}return out;
  }
  function cumulativeWheelBattleScopedLayers(text){
    const out=emptyScopedDamageLayers();
    const normalized=String(text||'').replace(/Crit\./gi,'Crit');
    for(const raw of normalized.split(/(?<=[.!?。；;])\s+(?=(?:[\"“{(]?[A-Z0-9]|[\u3400-\u9fff]))/)){
      const s=raw.trim();if(!s)continue;
      if(!/(?:after|at\s+the\s+end\s+of)\s+(?:each|the)\s+battle(?!\s+begins?)(?:\s+ends?)?/i.test(s))continue;
      mergeScopedDamageLayers(out,scopedDamageLayersFromText(s,true));
    }
    return out;
  }
  function scaledScopedDamageLayers(source,count){
    const out=emptyScopedDamageLayers(),times=Math.max(0,count);
    for(const metric of ['base','final'])for(const scope of DAMAGE_SCOPE_KEYS)out[metric][scope]=num(source?.[metric]?.[scope],0)*times;
    return out;
  }
  function hasNumericBattleBonus(source){return Object.entries(source||{}).some(([k,v])=>k!=='skipped'&&Math.abs(num(v))>1e-9)}
  function battleGrowthSources(){
    const sources=[];
    if(currentAwakener?.id==='awakener-0041')sources.push('波吕克斯：每完成 1 场，基础伤害 +20%，苦痛救赎伤害效果 +20%');
    if(currentAwakener?.id==='awakener-0008')sources.push('卡斯托尔：每完成 1 场，本次探索中的侵蚀施加量 +20%');
    if(currentAwakener?.id==='awakener-0010'&&activeEnlightens().some(x=>x.id==='enlighten.clementine.soul-healing-journey'))sources.push('克莱门汀启灵2：每完成 1 场，基础伤害 +25%');
    currentWheels.forEach((wheel,slot)=>{
      if(!wheel)return;
      const bonus=cumulativeWheelBattleBonuses(wheelDescriptionRaw(wheel,slot));
      if(hasNumericBattleBonus(bonus))sources.push('命轮「'+labelForWheel(wheel)+'」：存在每场战斗累计伤害乘区');
    });
    return sources;
  }
  function refreshBattleProgressionUi(){
    const field=$('battleIndexField'),note=$('battleGrowthNote');if(!field)return;
    const sources=battleGrowthSources();field.hidden=sources.length===0;
    if(note)note.textContent=sources.length
      ?'填写当前正在进行的场次；第 1 场 = 尚未完成战斗，第 3 场 = 已完成 2 场。当前生效：'+sources.join('；')
      :'当前角色 / 命轮没有按完成战斗数累计的伤害乘区。';
  }

  function resolvedRouseSkill(){
    const raw=currentRouseSkill();return raw?resolveSkillEnlighten(raw):null;
  }
  function rouseRank(){
    const skill=resolvedRouseSkill();return Math.min(maxSkillLevel(skill),Math.max(1,Number($('skillLevel')?.value)||1));
  }
  function rouseRenderedText(){
    const skill=resolvedRouseSkill();return skill?String(renderTemplate(skill,rouseRank())||''):'';
  }
  function currentSkillMatchesRouseScope(sentence){
    const text=String(sentence||'');
    const name=String(currentSkill?.name||'');
    const scopes=[];
    if(/["“]?Strike["”]?/i.test(text))scopes.push(skillMatchesScope(currentSkill,'strike'));
    if(/["“]?Defense["”]?/i.test(text))scopes.push(skillMatchesScope(currentSkill,'defense'));
    if(/Command Cards?/i.test(text))scopes.push(skillMatchesScope(currentSkill,'command'));
    if(/Exalt/i.test(text)&&!/Rouse/i.test(text))scopes.push(skillMatchesScope(currentSkill,'exalt'));
    if(name&&text.toLowerCase().includes(name.toLowerCase()))scopes.push(true);
    return scopes.length?scopes.some(Boolean):true;
  }
  function applyGenericRouseEffects(events){
    if(!rouseActive())return events||[];
    const text=rouseRenderedText();if(!text)return events||[];
    const sentences=text.split(/(?<=[.!?;])\s+/).filter(Boolean);
    let mapped=(events||[]).map(event=>{
      if(event.type!=='active'&&event.type!=='pierce')return event;
      const next={...event};const labels=[];
      for(const sentence of sentences){
        const realmTag=sentence.match(/\{(Chaos|Aequor|Caro|Ultra)\}\s*:/i)?.[1]?.toUpperCase()||null;
        if(realmTag){
          const activeRealms=window.MorimensRealmEngine?.state?.().baseRealms||[];
          if(!activeRealms.includes(realmTag))continue;
        }
        const direct=sentence.split(/\b(?:after|before|whenever|each time|for each|for every|every time|at turn|at the start|at the end|when|while|until|next)\b/i)[0].trim();
        if(!direct||!currentSkillMatchesRouseScope(direct))continue;
        let m;
        if(/(?:DMG|damage)\s+always\s+critically\s+hits/i.test(direct)||/always\s+deals?\s+Critical/i.test(direct)){next.guaranteedCrit=true;labels.push('灵知觉醒：必定暴击')}
        if((m=direct.match(/Crit\.?\s*Rate\s+and\s+Crit\.?\s*DMG\s*\+\s*([\d.]+)%/i))){
          next.critRateBonus=(Number(next.critRateBonus)||0)+Number(m[1]);
          next.critDamageBonus=(Number(next.critDamageBonus)||0)+Number(m[1]);
          labels.push('灵知觉醒：暴击率/暴伤 +'+m[1]+'%');
        }else{
          if((m=direct.match(/Crit\.?\s*Rate[^+%]*\+\s*([\d.]+)%/i))){next.critRateBonus=(Number(next.critRateBonus)||0)+Number(m[1]);labels.push('灵知觉醒：暴击率 +'+m[1]+'%')}
          if((m=direct.match(/Crit\.?\s*DMG[^+%]*\+\s*([\d.]+)%/i))){next.critDamageBonus=(Number(next.critDamageBonus)||0)+Number(m[1]);labels.push('灵知觉醒：暴伤 +'+m[1]+'%')}
        }
        if((m=direct.match(/Base DMG[^+%]*\+\s*([\d.]+)%/i))){next.skillBaseDamageBonusPct=(Number(next.skillBaseDamageBonusPct)||0)+Number(m[1]);labels.push('灵知觉醒：基础伤害 +'+m[1]+'%')}
        if((m=direct.match(/Final DMG[^+%]*\+\s*([\d.]+)%/i))){next.skillFinalDamageBonusPct=(Number(next.skillFinalDamageBonusPct)||0)+Number(m[1]);labels.push('灵知觉醒：最终伤害 +'+m[1]+'%')}
      }
      if(labels.length)next.resourceEffectLabel=[next.resourceEffectLabel,...new Set(labels)].filter(Boolean).join('；');
      return next;
    });
    const currentIsStrike=String(currentSkill?.slot||'').toLowerCase()==='strike'||effectiveCardClassifications(currentSkill).includes('strike')||(currentSkill?.cardTypes||[]).map(x=>String(x).toLowerCase()).includes('strike');
    if(currentIsStrike&&/["“]?Strike["”]?\s+(?:becomes|deals?)\s+\{?Pierce DMG\}?/i.test(text)){
      mapped=mapped.map(event=>(event.type==='active'?{...event,type:'pierce',resourceEffectLabel:[event.resourceEffectLabel,'灵知觉醒：打击转为穿透伤害'].filter(Boolean).join('；')}:event));
    }
    let extra=0,m=text.match(/["“]?Strike["”]?[^.]{0,120}?(?:deals?|triggers?)\s+(\d+)\s+additional\s+instances?\s+of\s+DMG/i);
    if(currentIsStrike&&m)extra=Math.max(extra,Number(m[1])||0);
    m=text.match(/hit count\s*\+\s*(\d+)\s*(?:times?|hits?)?/i);if(m)extra=Math.max(extra,Number(m[1])||0);
    m=text.match(/DMG instances?\s*\+\s*(\d+)/i);if(m)extra=Math.max(extra,Number(m[1])||0);
    if(extra>0)mapped=cloneExtraDamageEvents(mapped,extra,'灵知觉醒：额外 '+extra+' 段伤害');
    return mapped;
  }

  function repeatRepresentedCardEvents(events,extra,label,suffixBase){
    const repeatable=(events||[]).filter(event=>['active','pierce','pure','fixed','poison','bleed','counter','corrosion'].includes(event.type));
    const out=[...(events||[])],extraCount=Math.max(0,Math.floor(Number(extra)||0));
    for(let n=0;n<extraCount;n++){
      const suffix='-'+suffixBase+'-'+String(n+1);
      for(const event of repeatable){
        out.push({...event,
          id:String(event.id||'event')+suffix+'-'+String(out.length+1),
          index:out.length,
          position:(Number(event.position)||0)+0.000012*(n+1),
          groupId:String(event.groupId||event.id||'event')+suffix,
          sourceGroupId:event.sourceGroupId?String(event.sourceGroupId)+suffix:event.sourceGroupId,
          resourceEffectLabel:[event.resourceEffectLabel,label].filter(Boolean).join('；')
        });
      }
    }
    return out;
  }
  function applyCharacterResourceEffects(events){
    const resources=characterResourceValues();
    const baseSkillId=currentSkill?.overExaltBaseSkillId||currentSkill?.id||'';
    const finishedBattles=completedBattles();
    let mapped=(events||[]).map(event=>{
      const next={...event};
      if(currentAwakener?.id==='awakener-0001'&&baseSkillId==='skill.24.twisted-carrion-revel'&&Number(resources.twistedCarrionPriorUses)>0&&(next.type==='active'||next.type==='pierce')){
        const prior=Math.max(0,Math.floor(Number(resources.twistedCarrionPriorUses)||0));
        const bonus=20*prior;
        next.skillBaseDamageBonusPct=(Number(next.skillBaseDamageBonusPct)||0)+bonus;
        next.resourceEffectLabel=[next.resourceEffectLabel,'本场此前狂气爆发 '+prior+' 次：扭曲腐肉狂欢基础伤害 +'+bonus.toFixed(0)+'%'].filter(Boolean).join('；');
      }
      if(currentAwakener?.id==='awakener-0019'&&(next.type==='active'||next.type==='pierce')){
        const baseFactors=[],finalFactors=[];
        const addFactor=(list,label,pct)=>{pct=Math.max(0,num(pct,0));if(pct>0)list.push({label,pct})};
        if(rouseActive()){
          const rouse=resolvedRouseSkill(),rank=rouseRank(),perTurn=Math.max(0,num(argValue(rouse?.descriptionArgs?.Arg2,rank),0));
          const triggers=Math.max(0,Math.floor(num(resources.helotRouseTurnStarts,0)));
          addFactor(baseFactors,'觉醒基伤',perTurn*triggers);
        }
        const progression=progressionState();
        if(baseSkillId==='skill.helot-catena.sanguine-fetters'&&progression?.soulforgeEnabled&&progression.soulforgeLevel>0){
          const soulforgeBase=Math.max(0,num(progression.resolvedSoulforgeArgs?.Arg4,0));
          const soulforgeStrength=Math.max(0,num(progression.resolvedSoulforgeArgs?.Arg3,0));
          addFactor(baseFactors,'灵塑基伤',soulforgeBase);
          next.strengthMultiplier=(Number.isFinite(Number(next.strengthMultiplier))?Math.max(0,Number(next.strengthMultiplier)):1)+soulforgeStrength/100;
          next.usesStrength=true;
        }
        if(baseSkillId==='skill.helot-catena.strike'&&ENLIGHTEN_ORDER.indexOf(selectedEnlightenSlot())>=ENLIGHTEN_ORDER.indexOf('E1')){
          next.critRateBonus=(Number(next.critRateBonus)||0)+15;
          next.critDamageBonus=(Number(next.critDamageBonus)||0)+15;
          next.resourceEffectLabel=[next.resourceEffectLabel,'启灵1：本次打击暴击率/暴击伤害 +15%'].filter(Boolean).join('；');
        }
        if(baseSkillId==='skill.helot-catena.hatred-unleashed'){
          const rank=Math.max(1,Math.min(6,Number($('skillLevel')?.value)||1));
          let gainedPct=Math.max(0,num(argValue(currentSkill?.descriptionArgs?.Arg2,rank),0));
          if(ENLIGHTEN_ORDER.indexOf(selectedEnlightenSlot())>=ENLIGHTEN_ORDER.indexOf('E2')&&Number(resources.helotHatredBelowHalfHp)>0)gainedPct*=2;
          const atk=Math.max(0,num(currentFormulaContext()?.ATK,0));
          next.strengthFlatAdd=(Number(next.strengthFlatAdd)||0)+atk*gainedPct/100;
          next.resourceEffectLabel=[next.resourceEffectLabel,'恨意宣泄：本次加入攻击力 '+gainedPct.toFixed(1)+'% 的力量'].filter(Boolean).join('；');
        }
        if(Number(resources.helotOverExaltBuffActive)>0){
          next.critDamageBonus=(Number(next.critDamageBonus)||0)+35;
          next.resourceEffectLabel=[next.resourceEffectLabel,'超限爆发状态：暴击伤害 +35%'].filter(Boolean).join('；');
        }
        if(String(currentSkill?.cardFamily||'').toLowerCase()==='command'&&rouseActive()&&selectedEnlightenSlot()==='AbsoluteAxiom'){
          const enhance=Math.min(50,Math.max(0,Math.floor(num(resources.helotTemporaryEnhanceStacks,0))));
          addFactor(finalFactors,'临时强化终伤',enhance*2);
        }
        next.baseDamageMultipliers=[...(next.baseDamageMultipliers||[]),...baseFactors];
        next.finalDamageMultipliers=[...(next.finalDamageMultipliers||[]),...finalFactors];
      }
      if(currentAwakener?.id==='awakener-0014'&&baseSkillId==='skill.doresain.necrotic-gala'&&Number(resources.corpseStacks)>=3&&(next.type==='active'||next.type==='pierce')){
        next.doubleCritDamageBonus=true;
        next.resourceEffectLabel='残骸 3 层：本次暴击伤害加成翻倍';
      }
      if(currentAwakener?.id==='awakener-0014'&&baseSkillId==='derived.doresain.evernights-revel'&&Number(resources.evernightPriorPlays)>0&&(next.type==='active'||next.type==='pierce')){
        next.strengthMultiplier=Math.max(0,Number(next.strengthMultiplier)||0)+1;
        next.usesStrength=true;
        next.resourceEffectLabel='后续永夜：额外 100% 力量加成';
      }
      if(currentAwakener?.id==='awakener-0041'&&Number(resources.sinMarkStacks)>0&&['active','pierce','fixed','pure'].includes(next.type)){
        next.onDamageBleedPct=Math.max(0,Number(resources.sinMarkStacks)||0);
      }
      if(currentAwakener?.id==='awakener-0041'&&baseSkillId==='derived.pollux.sacred-heart'&&rouseActive()&&(next.type==='active'||next.type==='pierce')){
        next.onDamageBleedPct=(Number(next.onDamageBleedPct)||0)+100;
        next.resourceEffectLabel='灵知觉醒：「圣心」额外施加等于本次伤害 100% 的出血';
      }
      if(currentAwakener?.id==='awakener-0003'&&baseSkillId==='skill.aigis.decomposition'&&ENLIGHTEN_ORDER.indexOf(selectedEnlightenSlot())>=ENLIGHTEN_ORDER.indexOf('E2')&&(next.type==='active'||next.type==='pierce')){
        const stacks=vulnerableStacks();
        const bonus=Math.min(500,stacks*5);
        if(bonus>0){
          next.skillFinalDamageBonusPct=(Number(next.skillFinalDamageBonusPct)||0)+bonus;
          next.resourceEffectLabel=[next.resourceEffectLabel,'易伤 '+stacks+' 层：对应技能最终伤害 +'+bonus.toFixed(0)+'%'].filter(Boolean).join('；');
        }
      }
      if(currentAwakener?.id==='awakener-0020'&&baseSkillId==='skill.ramona-timeworn.predetermined-strike'&&Number(resources.ramonaPosseUses)>0&&(next.type==='active'||next.type==='pierce')){
        const uses=Math.max(0,Math.floor(Number(resources.ramonaPosseUses)||0));
        next.strengthMultiplier=Math.max(0,Number(next.strengthMultiplier)||0)+uses;
        next.usesStrength=true;
        next.resourceEffectLabel=[next.resourceEffectLabel,'本场已使用钥令 '+uses+' 次：力量倍率 +'+uses].filter(Boolean).join('；');
      }
      if(currentAwakener?.id==='awakener-0010'&&Number(resources.symbiosisRemovedStacks)>0&&ENLIGHTEN_ORDER.indexOf(selectedEnlightenSlot())>=ENLIGHTEN_ORDER.indexOf('E2')&&(next.type==='active'||next.type==='pierce')){
        const stacks=Math.max(0,Math.floor(Number(resources.symbiosisRemovedStacks)||0));
        const bonus=3*stacks;
        next.skillBaseDamageBonusPct=(Number(next.skillBaseDamageBonusPct)||0)+bonus;
        next.resourceEffectLabel=[next.resourceEffectLabel,'本场累计移除共生 '+stacks+' 层：基础伤害 +'+bonus.toFixed(0)+'%'].filter(Boolean).join('；');
      }
      if(currentAwakener?.id==='awakener-0041'&&String(currentSkill?.cardFamily||'').toLowerCase()==='command'&&Number(resources.polluxCommandFinalBonusPct)>0&&(next.type==='active'||next.type==='pierce')){
        const bonus=Math.max(0,Math.min(100,Number(resources.polluxCommandFinalBonusPct)||0));
        next.skillFinalDamageBonusPct=(Number(next.skillFinalDamageBonusPct)||0)+bonus;
        next.resourceEffectLabel='指令卡最终伤害额外加成 +'+bonus.toFixed(1)+'%';
      }
      if(finishedBattles>0&&currentAwakener?.id==='awakener-0041'&&(next.type==='active'||next.type==='pierce')){
        const bonus=20*finishedBattles;
        next.skillBaseDamageBonusPct=(Number(next.skillBaseDamageBonusPct)||0)+bonus;
        next.resourceEffectLabel=[next.resourceEffectLabel,'探索成长：已完成 '+finishedBattles+' 场，基础伤害 +'+bonus.toFixed(0)+'%'].filter(Boolean).join('；');
      }
      if(finishedBattles>0&&currentAwakener?.id==='awakener-0010'&&activeEnlightens().some(x=>x.id==='enlighten.clementine.soul-healing-journey')&&(next.type==='active'||next.type==='pierce')){
        const bonus=25*finishedBattles;
        next.skillBaseDamageBonusPct=(Number(next.skillBaseDamageBonusPct)||0)+bonus;
        next.resourceEffectLabel=[next.resourceEffectLabel,'灵魂疗愈之旅：已完成 '+finishedBattles+' 场，基础伤害 +'+bonus.toFixed(0)+'%'].filter(Boolean).join('；');
      }
      return next;
    });
    mapped=applyGenericRouseEffects(mapped);
    if(currentAwakener?.id==='awakener-0001'&&rouseActive()){
      const realmState=window.MorimensRealmEngine?.state?.()||{};
      const realms=new Set(realmState.baseRealms||[]);
      const rouse=resolvedRouseSkill();
      const rank=rouseRank();
      const rouseArg=key=>Math.max(0,num(argValue(rouse?.descriptionArgs?.[key],rank),0));
      if(realms.has('CHAOS')&&baseSkillId==='skill.24.twisted-carrion-revel'){
        const posseUses=Math.max(0,Math.floor(Number(resources.twentyFourRousePosseUses)||0));
        const perUse=rouseArg('StateArg1');
        const bonus=posseUses*perUse;
        if(bonus>0)mapped=mapped.map(event=>(event.type==='active'||event.type==='pierce')
          ?{...event,skillFinalDamageBonusPct:(Number(event.skillFinalDamageBonusPct)||0)+bonus,resourceEffectLabel:[event.resourceEffectLabel,'灵知觉醒·混沌：已释放钥令 '+posseUses+' 次，狂气爆发最终伤害 +'+bonus.toFixed(0)+'%'].filter(Boolean).join('；')}
          :event);
      }
      if(realms.has('AEQUOR')){
        const tentacleBonus=rouseArg('StateArg2');
        mapped=mapped.map(event=>(event.type==='active'||event.type==='pierce')
          ?{...event,tentacleBonusCoefficient:(Number(event.tentacleBonusCoefficient)||0)+tentacleBonus,onDamagePoisonPct:(Number(event.onDamagePoisonPct)||0)+10,resourceEffectLabel:[event.resourceEffectLabel,'灵知觉醒·深海：触腕伤害加成 '+tentacleBonus.toFixed(0)+'%，并附加本次伤害 10% 的中毒'].filter(Boolean).join('；')}
          :event);
        if(baseSkillId==='skill.24.twisted-carrion-revel'){
          mapped.push({id:'24-rouse-aequor-poison-trigger',index:mapped.length,position:9990,groupId:'24-rouse-aequor-poison-trigger',type:'poison',action:'trigger',source:'resource',basis:'currentPoison',percent:50,activeSource:false,resourceEffectLabel:'灵知觉醒·深海：狂气爆发额外触发 50% 中毒'});
        }
      }
      if(realms.has('CARO')&&baseSkillId==='skill.24.twisted-carrion-revel'){
        mapped=mapped.map(event=>(event.type==='active'||event.type==='pierce')
          ?{...event,strengthMultiplier:(Number.isFinite(Number(event.strengthMultiplier))?Number(event.strengthMultiplier):(event.type==='active'?1:0))+3,usesStrength:true,resourceEffectLabel:[event.resourceEffectLabel,'灵知觉醒·血肉：狂气爆发额外享受 300% 力量加成'].filter(Boolean).join('；')}
          :event);
      }
      if(realms.has('ULTRA')){
        const counterBonus=rouseArg('StateArg5');
        mapped=mapped.map(event=>(event.type==='active'||event.type==='pierce')
          ?{...event,counterBonusCoefficient:(Number(event.counterBonusCoefficient)||0)+counterBonus,resourceEffectLabel:[event.resourceEffectLabel,'灵知觉醒·超维：反击伤害加成 '+counterBonus.toFixed(0)+'%'].filter(Boolean).join('；')}
          :event);
      }
    }
    if(currentAwakener?.id==='awakener-0001'&&baseSkillId==='skill.24.frenzied-slash'&&String(resources.personaState||'depressed')==='manic'){
      const rank=Math.max(1,Number($('skillLevel')?.value)||1);
      const rendered=String(renderTemplate(currentSkill,rank)||'');
      const match=rendered.match(/Manic Persona:\s*DMG instances?\s*\+\s*(\d+)/i);
      let extra=match?Math.max(0,Math.floor(Number(match[1])||0)):0;
      const doubled=rouseActive()&&selectedEnlightenSlot()==='AbsoluteAxiom';
      if(doubled)extra*=2;
      if(extra>0){
        mapped=cloneExtraDamageEvents(
          mapped,
          extra,
          '躁狂人格：「Frenzied Slash」额外 '+extra+' 段'+(doubled?'（最终法则人格加成已翻倍）':'')
        );
      }
    }
    if(currentAwakener?.id==='awakener-0001'&&Number(resources.twentyFourTripleNextCommandActive)>0&&String(currentSkill?.cardFamily||'').toLowerCase()==='command'){
      mapped=repeatRepresentedCardEvents(mapped,2,'超限状态：下一张指令卡共生效 3 次','24-overexalt');
    }
    if(currentAwakener?.id==='awakener-0055'&&baseSkillId==='derived.vortice.vortex-shell'&&Number(resources.vortexShellDoubleRemaining)>0){
      mapped=repeatRepresentedCardEvents(mapped,1,'超限状态：「涡！流！弹！」本次触发 2 次','vortice-overexalt');
    }
    if(currentAwakener?.id==='awakener-0018'&&rouseActive()&&selectedEnlightenSlot()==='AbsoluteAxiom'&&Number(resources.finaleStacks)>0){
      const bonus=8*Math.min(10,Math.max(0,Math.floor(Number(resources.finaleStacks)||0)));
      mapped=mapped.map(event=>(event.type==='active'||event.type==='pierce')
        ?{...event,resourceEffectLabel:[event.resourceEffectLabel,'Finale '+Math.floor(Number(resources.finaleStacks)||0)+' 层：伤害强效 +'+bonus.toFixed(0)+'%'].filter(Boolean).join('；')}
        :event);
    }
    if(currentAwakener?.id==='awakener-0060'&&baseSkillId==='skill.caraboo.ta-da-its-the-fairy'){
      const rank=Math.max(1,Number($('skillLevel')?.value)||1);
      const satiety=Math.min(50,Math.max(0,Math.floor(Number(resources.satietyStacks)||0)));
      const offering=Math.min(5,Math.max(0,Math.floor(Number(resources.offeringStacks)||0)));
      const perStack=Math.max(0,num(argValue(currentSkill?.descriptionArgs?.Arg6,rank),0));
      if(satiety>0&&perStack>0){
        const bonus=satiety*perStack;
        mapped=mapped.map(event=>(event.type==='active'||event.type==='pierce')
          ?{...event,skillBaseDamageBonusPct:(Number(event.skillBaseDamageBonusPct)||0)+bonus,resourceEffectLabel:[event.resourceEffectLabel,'饱足 '+satiety+' 层：爆发基础伤害 +'+bonus.toFixed(0)+'%'].filter(Boolean).join('；')}
          :event);
      }
      if(offering>0)mapped=cloneExtraDamageEvents(mapped,offering,'供奉 '+offering+' 层：本次狂气爆发额外 '+offering+' 段');
    }
    if(currentAwakener?.id==='awakener-0018'&&Number(resources.finaleFormActive)>0){
      const rank=Math.max(1,Number($('skillLevel')?.value)||1);
      if(baseSkillId==='skill.doll-inferno.terminal-of-truth-and-abyss'){
        mapped.push({id:'doll-finale-terminal-poison',index:mapped.length,position:9992,groupId:'doll-finale-terminal-poison',type:'poison',action:'trigger',source:'resource',basis:'currentPoison',percent:50,activeSource:false,resourceEffectLabel:'终末形态：狂气爆发额外触发 50% 中毒'});
      }
      if(baseSkillId==='skill.doll-inferno.soulblight'){
        const percent=Math.max(0,num(argValue(currentSkill?.descriptionArgs?.Arg3,rank),0));
        if(percent>0)mapped.push({id:'doll-finale-rouse-poison',index:mapped.length,position:9993,groupId:'doll-finale-rouse-poison',type:'poison',action:'trigger',source:'resource',basis:'currentPoison',percent,turnEndOnly:true,activeSource:false,resourceEffectLabel:'终末形态：回合结束触发 '+percent.toFixed(0)+'% 中毒'});
      }
    }
    if(currentAwakener?.id==='awakener-0010'&&rouseActive()&&selectedEnlightenSlot()==='AbsoluteAxiom'){
      const damageTypes=new Set(['active','pierce','pure','fixed']);
      const seenGroups=new Set(),extras=[];
      for(const event of mapped){
        if(!damageTypes.has(event.type))continue;
        const key=event.groupId||event.id;
        if(!key||seenGroups.has(key))continue;
        seenGroups.add(key);
        extras.push({...event,id:String(event.id||'damage')+'-clementine-aa-extra',index:mapped.length+extras.length,position:(Number(event.position)||0)+0.00004,groupId:String(key)+'-clementine-aa-extra',resourceEffectLabel:'最终法则灵知觉醒：该伤害效果段数 +1'});
      }
      mapped.push(...extras);
    }
    if(currentAwakener?.id==='awakener-0010'&&rouseActive()&&Number(resources.clementineFirstCommandRouse)>0&&String(currentSkill?.cardFamily||'').toLowerCase()==='command'){
      const rouse=resolvedRouseSkill();
      const extra=Math.max(0,Math.floor(num(argValue(rouse?.descriptionArgs?.Arg2,1),0)));
      if(extra>0){
        // Call of Shaggai repeats the card's effects, not just its direct hit.
        // Duplicate all damage/status events represented by the calculator while
        // leaving draw/heal/resource effects outside this single-damage model.
        const repeatable=mapped.filter(event=>['active','pierce','pure','fixed','poison','bleed','counter','corrosion'].includes(event.type));
        const clones=[];
        for(let n=0;n<extra;n++)for(const event of repeatable){
          const suffix='-clementine-rouse-'+String(n+1);
          clones.push({...event,
            id:String(event.id||'event')+suffix+'-'+String(clones.length+1),
            index:mapped.length+clones.length,
            position:(Number(event.position)||0)+0.00005*(n+1),
            groupId:String(event.groupId||event.id||'event')+suffix,
            sourceGroupId:event.sourceGroupId?String(event.sourceGroupId)+suffix:event.sourceGroupId,
            resourceEffectLabel:[event.resourceEffectLabel,'灵知觉醒：本回合第一张指令卡效果额外触发 '+extra+' 次'].filter(Boolean).join('；')
          });
        }
        mapped.push(...clones);
      }
    }
    if(currentAwakener?.id==='awakener-0008'&&baseSkillId==='derived.castor.onyx-plume'){
      const damageAmp=Math.max(0,num(currentFormulaContext().DamageAmplification,0));
      const explorationMult=1+0.20*finishedBattles;
      mapped.push({
        id:'castor-onyx-plume-corrosion',index:mapped.length,position:9991,
        groupId:'castor-onyx-plume-corrosion',type:'corrosion',action:'apply',source:'talent',
        basis:'statPercent',stat:'ATK',percent:840,activeSource:false,turnUnique:true,
        resourceStatusMultiplier:(1+damageAmp/100)*explorationMult,
        resourceEffectLabel:'净化之羽：首张黑羽施加 840% 攻击力 侵蚀；伤害强效与已完成战斗成长已计入'
      });
    }
    if(currentAwakener?.id==='awakener-0058'&&Number(resources.packHuntStacks)>0&&['derived.pontos.raid-gaunt','derived.pontos.vex-gaunt','derived.pontos.slay-gaunt'].includes(baseSkillId)){
      if(baseSkillId==='derived.pontos.slay-gaunt'){
        const fixed=mapped.filter(event=>event.type==='fixed');
        const clones=fixed.map((event,i)=>({...event,id:String(event.id||'fixed')+'-pack-hunt-'+String(i+1),index:mapped.length+i,position:(Number(event.position)||0)+0.00003*(i+1),groupId:String(event.groupId||event.id||'fixed')+'-pack-hunt-'+String(i+1),resourceEffectLabel:'群猎：消耗 1 层，「猎杀之魇」固定伤害额外触发 1 次'}));
        mapped.push(...clones);
      }
    }
    if(currentAwakener?.id==='awakener-0061'&&baseSkillId==='skill.ogier-oathbound.sin-stained-spear'&&rouseActive()){
      const absoluteAxiom=selectedEnlightenSlot()==='AbsoluteAxiom';
      mapped=mapped.map(event=>{
        if(event.type!=='active'&&event.type!=='pierce')return event;
        const baseStrength=Number.isFinite(Number(event.strengthMultiplier))?Math.max(0,Number(event.strengthMultiplier)):(event.type==='active'?1:0);
        const next={...event};
        if(absoluteAxiom){
          next.skillBaseDamageBonusPct=(Number(next.skillBaseDamageBonusPct)||0)+100;
          next.strengthMultiplier=baseStrength+2;
          next.usesStrength=true;
        }
        next.resourceEffectLabel=[next.resourceEffectLabel,absoluteAxiom?'灵知觉醒 + 最终法则：基础伤害 +100%，额外 200% 力量加成':'灵知觉醒：命中后施加等量侵蚀'].filter(Boolean).join('；');
        return next;
      });
      const sourceGroups=[...new Set(mapped.filter(event=>(event.type==='active'||event.type==='pierce')&&event.groupId).map(event=>event.groupId))];
      for(const [i,sourceGroupId] of sourceGroups.entries()){
        mapped.push({
          id:'ogier-rouse-corrosion-'+String(i+1),index:mapped.length,position:9990+i*0.0001,
          groupId:'ogier-rouse-corrosion-'+String(i+1),
          type:'corrosion',action:'apply',source:'resource',basis:'sourceDamage',
          sourceGroupId,percent:100,activeSource:false,
          resourceEffectLabel:'灵知觉醒：染罪之枪施加等同伤害的侵蚀'
        });
      }
    }
    if(currentAwakener?.id==='awakener-0061'&&Number(resources.undertowStacks)>0&&String(currentSkill?.cardFamily||'').toLowerCase()==='command'){
      const stacks=Math.min(3,Math.max(0,Number(resources.undertowStacks)||0));
      const overlay=resolvedOverlay('overlay.ogier-oathbound.undertow');
      const rendered=String(renderTemplate(overlay,1)||'');
      const finalMatch=rendered.match(/Final DMG[^\d]*(\d+(?:\.\d+)?)%/i);
      const critMatch=rendered.match(/Crit\. DMG[^\d]*(\d+(?:\.\d+)?)%/i);
      const finalPer=finalMatch?num(finalMatch[1],0):33;
      const critPer=critMatch?num(critMatch[1],0):0;
      mapped=mapped.map(event=>{
        if(event.type!=='active'&&event.type!=='pierce')return event;
        return {...event,skillFinalDamageBonusPct:(Number(event.skillFinalDamageBonusPct)||0)+finalPer*stacks,critDamageBonus:(Number(event.critDamageBonus)||0)+critPer*stacks,resourceEffectLabel:[event.resourceEffectLabel,'暗潮 '+stacks+' 层'].filter(Boolean).join('；')};
      });
    }
    if(currentAwakener?.id==='awakener-0032'&&Number(resources.vanityCollapseCount)>0){
      const bonus=15*Math.max(0,Number(resources.vanityCollapseCount)||0);
      mapped=mapped.map(event=>(event.type==='active'||event.type==='pierce')?{...event,skillBaseDamageBonusPct:(Number(event.skillBaseDamageBonusPct)||0)+bonus,resourceEffectLabel:'虚荣的崩塌：基础伤害 +'+bonus.toFixed(0)+'%'}:event);
    }
    if(currentAwakener?.id==='awakener-0043'&&baseSkillId==='skill.ryker.all-in'&&Number(resources.blackSigilsConsumed)>0){
      const bonus=0.5*Math.max(0,Number(resources.blackSigilsConsumed)||0);
      mapped=mapped.map(event=>(event.type==='active'||event.type==='pierce')?{...event,skillBaseDamageBonusPct:(Number(event.skillBaseDamageBonusPct)||0)+bonus,resourceEffectLabel:'确定收益：对应技能基础伤害 +'+bonus.toFixed(1)+'%'}:event);
    }
    if(currentAwakener?.id==='awakener-0024'&&baseSkillId==='skill.horla.snarl-psalm'&&Number(resources.angerMetaphorStacks)>0){
      const stacks=Math.min(3,Math.max(0,Math.floor(Number(resources.angerMetaphorStacks)||0)));
      mapped=cloneExtraDamageEvents(mapped,stacks*2,'愤怒隐喻 '+stacks+' 层：额外 '+(stacks*2)+' 段伤害');
    }
    if(currentAwakener?.id==='awakener-0024'&&resources.horlaEmotion==='anger'){
      const overlay=resolvedOverlay('overlay.horla.anger');
      const rendered=String(renderTemplate(overlay,1)||'');
      const m=rendered.match(/Final DMG[^+]*\+\s*(\d+(?:\.\d+)?)%/i);
      const bonus=m?Math.max(0,num(m[1],0)):0;
      if(bonus>0)mapped=mapped.map(event=>(event.type==='active'||event.type==='pierce')?{...event,skillFinalDamageBonusPct:(Number(event.skillFinalDamageBonusPct)||0)+bonus,resourceEffectLabel:'愤怒情绪：最终伤害 +'+bonus.toFixed(1)+'%'}:event);
    }
    if(currentAwakener?.id==='awakener-0024'&&resources.horlaEmotion==='fear'){
      const overlay=resolvedOverlay('overlay.horla.fear');
      const rendered=String(renderTemplate(overlay,1)||'');
      const m=rendered.match(/Counter[^+]*\+\s*(\d+(?:\.\d+)?)%/i)||rendered.match(/Poison[^+]*\+\s*(\d+(?:\.\d+)?)%/i);
      const bonus=m?Math.max(0,num(m[1],0)):0;
      if(bonus>0)mapped=mapped.map(event=>((event.type==='poison'&&event.action==='apply')||(event.type==='counter'&&event.action==='gain'))?{...event,resourceStatusMultiplier:1+bonus/100,resourceEffectLabel:'恐惧情绪：中毒/反击生成 +'+bonus.toFixed(1)+'%'}:event);
    }
    if(currentAwakener?.id==='awakener-0029'&&baseSkillId==='skill.lily.strike-to-protect'&&Number(resources.endureStacks)>0){
      const stacks=Math.max(0,Number(resources.endureStacks)||0);
      const boost=Math.min(5,Math.max(0,Number(resources.endureConversionBoostStacks)||0));
      const effectiveStacks=stacks*(1+0.4*boost);
      const progression=progressionState();
      const extraAmp=progression.soulforgeEnabled&&progression.soulforgeLevel>0?Math.max(0,Number(progression.resolvedSoulforgeArgs?.Arg5)||0):0;
      mapped=mapped.map(event=>(event.type==='active'||event.type==='pierce')?{...event,resourceFlatDamage:(Number(event.resourceFlatDamage)||0)+2*effectiveStacks,resourceFlatDamageAmpBonusPct:(Number(event.resourceFlatDamageAmpBonusPct)||0)+extraAmp,resourceEffectLabel:'忍耐 '+stacks.toFixed(0)+'：独立伤害增加 '+(2*effectiveStacks).toFixed(0)+(extraAmp>0?'（额外伤害强效 +'+extraAmp.toFixed(1)+'%）':'')}:event);
    }
    if(currentAwakener?.id==='awakener-0052'&&baseSkillId==='skill.wanda.spine-needle-chains'&&Number(resources.dreamlureStacks)>=5){
      mapped=cloneExtraDamageEvents(mapped,2,'梦引≥5：跃迁成功，额外 2 段伤害');
    }
    if(currentAwakener?.id==='awakener-0052'&&Number(resources.murmursActive)>0){
      const overlay=resolvedOverlay('overlay.wanda.murmurs');
      const rendered=String(renderTemplate(overlay,1)||'');
      const m=rendered.match(/Active DMG dealt\s*-\s*(\d+(?:\.\d+)?)%/i);
      const reduction=m?Math.max(0,Math.min(100,num(m[1],60))):60;
      const mult=Math.max(0,1-reduction/100);
      const active=mapped.filter(x=>x.type==='active');
      mapped=mapped.map(event=>event.type==='active'?{...event,resourceDamageMultiplier:mult,resourceEffectLabel:'低语：主动伤害 ×'+mult.toFixed(2)+'，攻击次数翻倍'}:event);
      const clones=active.map((event,i)=>({...event,id:String(event.id||'active')+'-murmurs-'+String(i+1),index:mapped.length+i,position:(Number(event.position)||0)+0.00001*(i+1),groupId:String(event.groupId||event.id||'active')+'-murmurs-'+String(i+1),resourceDamageMultiplier:mult,resourceEffectLabel:'低语：主动伤害 ×'+mult.toFixed(2)+'，攻击次数翻倍'}));
      mapped.push(...clones);
    }
    if(currentAwakener?.id==='awakener-0054'&&rouseActive()&&selectedEnlightenSlot()==='AbsoluteAxiom'&&Number(resources.xuFirstCommandRouse)>0&&String(currentSkill?.cardFamily||'').toLowerCase()==='command'){
      const direct=mapped.filter(event=>['active','pierce','pure','fixed'].includes(event.type));
      const status=mapped.filter(event=>['poison','bleed','counter','corrosion'].includes(event.type));
      const clones=[...direct,...status].map((event,i)=>({...event,id:String(event.id||'event')+'-xu-aa-first-'+String(i+1),index:mapped.length+i,position:(Number(event.position)||0)+0.000015*(i+1),groupId:String(event.groupId||event.id||'event')+'-xu-aa-first',sourceGroupId:event.sourceGroupId?String(event.sourceGroupId)+'-xu-aa-first':event.sourceGroupId,resourceEffectLabel:[event.resourceEffectLabel,'最终法则灵知觉醒：本回合第一张指令卡额外生效 1 次'].filter(Boolean).join('；')}));
      mapped.push(...clones);
    }
    if(currentAwakener?.id==='awakener-0054'&&baseSkillId==='derived.xu.enthrall'&&Number(resources.spellboundStacks)>0){
      const overlay=resolvedOverlay('overlay.xu.spellbound');
      const rendered=String(renderTemplate(overlay,1)||'');
      const capMatch=rendered.match(/Stacks up to\s*(\d+)/i);
      const cap=selectedEnlightenSlot()==='AbsoluteAxiom'?15:(capMatch?Math.max(1,Number(capMatch[1])||5):5);
      const stacks=Math.min(cap,Math.max(0,Math.floor(Number(resources.spellboundStacks)||0)));
      if(stacks>0){
        mapped.push({id:'xu-enthrall-pure-resource',index:mapped.length,position:9997,groupId:'xu-enthrall-pure-resource',type:'pure',source:'resource',basis:'targetMaxHp',percent:stacks,activeSource:false,resourceEffectLabel:'Spellbound '+stacks+' 层：纯粹伤害'});
        mapped.push({id:'xu-enthrall-poison-resource',index:mapped.length,position:9998,groupId:'xu-enthrall-poison-resource',type:'poison',action:'trigger',source:'resource',basis:'currentPoisonPercent',percent:40*stacks,activeSource:false,resourceEffectLabel:'Spellbound '+stacks+' 层：触发 '+(40*stacks)+'% 中毒'});
      }
    }
    if(currentAwakener?.id==='awakener-0019'&&(baseSkillId==='skill.helot-catena.sanguine-fetters'||Number(resources.helotSanguineTurnActive)>0)){
      const exalt=currentSkills.find(skill=>skill.id==='skill.helot-catena.sanguine-fetters');
      const rank=Math.max(1,Math.min(6,Number($('skillLevel')?.value)||1));
      const bleedPct=Math.max(0,num(argValue(resolveSkillEnlighten(exalt)?.descriptionArgs?.Arg2,rank),0));
      if(bleedPct>0){
        mapped=mapped.map(event=>event.type==='active'?{
          ...event,
          onDamageBleedPct:(Number(event.onDamageBleedPct)||0)+bleedPct,
          resourceEffectLabel:[event.resourceEffectLabel,(baseSkillId==='skill.helot-catena.sanguine-fetters'?'「缚身锁链」本次效果：':'「缚身锁链」本回合效果：')+'主动伤害附加 '+bleedPct.toFixed(0)+'% 流血'].filter(Boolean).join('；')
        }:event);
      }
    }
    if(currentAwakener?.id==='awakener-0027'){
      const fiammaOn=Number(resources.fiammaActive)>0&&String(currentSkill?.cardFamily||'').toLowerCase()==='command';
      const fiammaStacks=fiammaOn?Math.min(3,Math.max(1,Math.floor(Number(resources.fiammaStacks)||1))):0;
      if(fiammaStacks>0){
        const absoluteRouse=rouseActive()&&selectedEnlightenSlot()==='AbsoluteAxiom';
        const perStackFinal=30+(absoluteRouse?30:0);
        const finalBonus=perStackFinal*fiammaStacks;
        mapped=mapped.map(event=>(event.type==='active'||event.type==='pierce')?{
          ...event,
          skillFinalDamageBonusPct:(Number(event.skillFinalDamageBonusPct)||0)+finalBonus,
          resourceEffectLabel:[event.resourceEffectLabel,'活焰 '+fiammaStacks+' 层：本卡最终伤害 +'+finalBonus.toFixed(0)+'%'+(absoluteRouse?'（灵知觉醒 + 最终法则）':'')].filter(Boolean).join('；')
        }:event);
        const e2Unlocked=ENLIGHTEN_ORDER.indexOf(selectedEnlightenSlot())>=ENLIGHTEN_ORDER.indexOf('E2');
        if(e2Unlocked&&fiammaStacks===3&&baseSkillId==='skill.kathigu-ra.solarflare'){
          mapped=mapped.map(event=>(event.type==='active'||event.type==='pierce')?{
            ...event,
            skillBaseDamageBonusPct:(Number(event.skillBaseDamageBonusPct)||0)+50,
            resourceEffectLabel:[event.resourceEffectLabel,'启灵2 · 活焰 3 层：「千兆耀斑」基础伤害 +50%'].filter(Boolean).join('；')
          }:event);
        }
      }
      const combust=Math.min(10,Math.max(0,Math.floor(Number(resources.combustStacks)||0)));
      if(combust>0&&ENLIGHTEN_ORDER.indexOf(selectedEnlightenSlot())>=ENLIGHTEN_ORDER.indexOf('E3')){
        const baseBonus=combust*5;
        mapped=mapped.map(event=>(event.type==='active'||event.type==='pierce')?{
          ...event,
          skillBaseDamageBonusPct:(Number(event.skillBaseDamageBonusPct)||0)+baseBonus,
          resourceEffectLabel:[event.resourceEffectLabel,'启灵3 · 燃烧 '+combust+' 层：本场基础伤害 +'+baseBonus.toFixed(0)+'%'].filter(Boolean).join('；')
        }:event);
      }
    }
    if(currentAwakener?.id==='awakener-0035'&&baseSkillId==='skill.murphy-fauxborn.princess-of-delusions'&&Number(resources.lifeSealStacks)>=5){
      const direct=mapped.filter(x=>x.type==='active'||x.type==='pierce');
      const clones=direct.map((event,i)=>({...event,id:String(event.id||'damage')+'-life-seal-'+String(i+1),index:mapped.length+i,position:(Number(event.position)||0)+0.00002*(i+1),groupId:String(event.groupId||event.id||'damage')+'-life-seal-'+String(i+1),resourceEffectLabel:'生命封印 5 层：伤害段数翻倍'}));
      mapped.push(...clones);
    }
    if(currentAwakener?.id==='awakener-0041'&&Number(resources.atonementByPainActive)>0&&String(currentSkill?.cardFamily||'').toLowerCase()==='command'){
      const count=Number(resources.atonementByPainDouble)>0?2:1;
      for(let i=0;i<count;i++){
        mapped.push({
          id:'pollux-atonement-by-pain-'+String(i+1),index:mapped.length,position:9999+i*0.0001,groupId:'pollux-atonement-'+String(i+1),
          type:'active',source:'resource',coefficient:200*(1+0.20*finishedBattles),stat:'ATK',hit:1,hitCount:1,
          strengthMultiplier:0,tentacleBonusCoefficient:0,counterBonusCoefficient:0,
          critRateBonus:0,critDamageBonus:0,skillBaseDamageBonusPct:0,skillFinalDamageBonusPct:0,
          usesStrength:false,guaranteedCrit:false,activeSource:true,
          onDamageBleedPct:Math.max(0,Number(resources.sinMarkStacks)||0),
          resourceEffectLabel:'苦痛救赎：第 '+String(i+1)+' 次 '+(200*(1+0.20*finishedBattles)).toFixed(0)+'% 攻击力 伤害'+(finishedBattles>0?'（已完成 '+finishedBattles+' 场）':'')
        });
      }
    }
    return mapped;
  }

  function ensureFormulaContextUi(){
    let block=$('formulaContextBlock');
    if(!block){
      const anchor=$('charStatsSummary')||$('skillDesc');if(!anchor)return;
      block=document.createElement('div');block.id='formulaContextBlock';block.className='formGrid';block.style.marginTop='10px';
      block.innerHTML='<div class="field full"><label for="formulaAccountLevel"></label><input id="formulaAccountLevel" type="number" min="1" max="100" step="1" value="50"><small></small></div><div class="field full" id="battleIndexField" hidden><label for="explorationBattleIndex"></label><input id="explorationBattleIndex" type="number" min="1" max="99" step="1" value="1"><small id="battleGrowthNote"></small></div>';
      anchor.insertAdjacentElement('afterend',block);
      const refreshFormulaContext=()=>{renderWheelsAndBonuses();renderCovenantAndBonuses();updateSkillLevel()};
      $('formulaAccountLevel')?.addEventListener('input',refreshFormulaContext,{capture:true});
      $('explorationBattleIndex')?.addEventListener('input',()=>{refreshBattleProgressionUi();renderWheelsAndBonuses();updateSkillLevel();$('calcBtn')?.click()},{capture:true});
      $('formulaAccountLevel')?.addEventListener('change',refreshFormulaContext,{capture:true});
    }
    const account=$('formulaAccountLevel')?.closest('.field'),battle=$('battleIndexField');
    if(account){const label=account.querySelector('label'),small=account.querySelector('small');if(label)label.textContent=ui('账号等级','Account Level');if(small)small.textContent=ui('用于“禁忌学识”/研究深度等依赖账号等级的 SKeyDB 公式。公式上下文只保留账号等级；命轮精炼直接读取命轮控件。','Used by SKeyDB formulas that depend on account level, such as Forbidden Knowledge / research depth. The formula context keeps only account level; Wheel refinement is read directly from the Wheel controls.')}
    if(battle){const label=battle.querySelector('label'),small=$('battleGrowthNote');if(label)label.textContent=ui('当前探索：第几场战斗','Current Exploration: Battle Number');if(small)small.textContent=ui('仅在角色或命轮存在跨战斗累计伤害乘区时显示。','Shown only when the selected Awakener or Wheel has a cross-battle cumulative damage effect.')}
    refreshBattleProgressionUi();
  }
  function ensureCharacterLevel(){
    if(!characterLevelControl()){
      const anchor=$('skillLevel')?.closest('.field');if(!anchor)return;
      const wrap=document.createElement('div');wrap.className='field';wrap.innerHTML='<label for="charLevel"></label><select id="charLevel"></select><small></small>';anchor.parentNode.insertBefore(wrap,anchor.nextSibling)
    }
    const field=characterLevelControl()?.closest('.field');
    if(field){const label=field.querySelector('label'),small=field.querySelector('small');if(label)label.textContent=ui('角色等级','Character Level');if(small)small.textContent=ui('使用 SKeyDB 1 级基础攻击与每级成长自动带入；手动修改“有效攻击力”后停止覆盖。','Uses SKeyDB level-1 base ATK and per-level growth automatically. Manual edits to Effective ATK stop automatic overwrites.')}
    normalizeProgressionControls();ensureEnlightenUi();ensureRouseUi();ensureFormulaContextUi();ensureSkillRuntimeUi();ensureCharacterResourceUi();
    const level=characterLevelControl(),sync=()=>{if(currentAwakener&&$('autoCharacterStats')?.checked!==false){$('attack').dataset.autoAttack='1';applyCharacterStats()}};
    if(level&&!level.dataset.morimensBound){level.dataset.morimensBound='1';level.addEventListener('input',sync,{capture:true});level.addEventListener('change',sync,{capture:true})}
    for(const id of ['innerSpirit','characterSculpt']){const el=$(id);if(el&&!el.dataset.morimensBound){el.dataset.morimensBound='1';el.addEventListener('change',()=>{applyCharacterStats();updateSkillLevel();$('calcBtn')?.click()},{capture:true})}}
    const soul=$('soulforgeActive');if(soul&&!soul.dataset.morimensBound){soul.dataset.morimensBound='1';soul.addEventListener('change',()=>{applyCharacterStats();updateSkillLevel();$('calcBtn')?.click()},{capture:true})}
    const autoStats=$('autoCharacterStats');if(autoStats&&!autoStats.dataset.morimensBound){autoStats.dataset.morimensBound='1';autoStats.addEventListener('change',()=>{if(autoStats.checked){$('attack').dataset.autoAttack='1';applyCharacterStats()}else $('attack').dataset.autoAttack='0'},{capture:true})}
    const attack=$('attack');if(attack&&!attack.dataset.morimensBound){attack.dataset.morimensBound='1';attack.addEventListener('input',()=>{if(!applyingAuto)attack.dataset.autoAttack='0'})}
  }
  function ensureSecondWheelUi(){
    const first=$('fateSelect');if(!first)return;
    let second=$('fateSelect2');
    if(!second){
      const field=first.closest('.field');if(!field)return;field.classList.remove('full');
      const secondWrap=document.createElement('div');secondWrap.className='field';secondWrap.innerHTML='<label for="fateSelect2"></label><select id="fateSelect2"><option value=""></option></select>';
      field.parentNode.insertBefore(secondWrap,field.nextSibling);
      const l1=document.createElement('div');l1.className='field';l1.innerHTML='<label for="fateLevel1"></label><select id="fateLevel1"><option value="0">E0</option></select>';
      const l2=document.createElement('div');l2.className='field';l2.innerHTML='<label for="fateLevel2"></label><select id="fateLevel2"><option value="0">E0</option></select>';
      secondWrap.parentNode.insertBefore(l1,secondWrap.nextSibling);secondWrap.parentNode.insertBefore(l2,l1.nextSibling);
      $('fateSelect2').addEventListener('change',e=>{e.stopImmediatePropagation();loadWheel(1)},{capture:true});
      $('fateLevel1').addEventListener('change',e=>{e.stopImmediatePropagation();renderWheelsAndBonuses();updateSkillLevel();$('calcBtn')?.click()},{capture:true});
      $('fateLevel2').addEventListener('change',e=>{e.stopImmediatePropagation();renderWheelsAndBonuses();updateSkillLevel();$('calcBtn')?.click()},{capture:true});
      second=$('fateSelect2');
    }
    const f1=first.closest('.field'),f2=second?.closest('.field'),l1=$('fateLevel1')?.closest('.field'),l2=$('fateLevel2')?.closest('.field');
    if(f1?.querySelector('label'))f1.querySelector('label').textContent=ui('命轮 1','Wheel 1');
    if(f2?.querySelector('label'))f2.querySelector('label').textContent=ui('命轮 2','Wheel 2');
    if(l1?.querySelector('label'))l1.querySelector('label').textContent=ui('命轮 1 精炼','Wheel 1 Refinement');
    if(l2?.querySelector('label'))l2.querySelector('label').textContent=ui('命轮 2 精炼','Wheel 2 Refinement');
    for(const sel of [first,second])if(sel?.options?.[0]&&!sel.options[0].value)sel.options[0].textContent=isEnglish()?'None':'无';
  }
  function ensureSyncBadge(){
    const block=$('fateDesc')?.closest('.builderBlock');if(block&&!$('skeydbBuildStatus')){const d=document.createElement('div');d.id='skeydbBuildStatus';d.className='syncLine';d.innerHTML='<span class="syncDot" id="skeydbBuildDot"></span><span id="skeydbBuildText">SKeyDB 配装数据加载中…</span>';block.appendChild(d)}
  }

  function renderCharacters(){
    const select=$('charSelect'),db=data()?.db;if(!select||!db?.records?.length)return;
    const previous=selectedAwakenerId()||currentAwakener?.id||db.records[0].id;select.innerHTML='';
    for(const rec of db.records){const opt=document.createElement('option');opt.dataset.awakenerId=rec.id;opt.value=rec.id;opt.textContent=labelForAwakener(rec);opt.selected=rec.id===previous;select.appendChild(opt)}
  }
  function isLimitedAwakener(rec=currentAwakener){
    return String(rec?.availabilityType||'').toUpperCase().startsWith('LIMITED_');
  }
  function effectiveGnosticLevel(){
    return isLimitedAwakener()?5:(Number($('innerSpirit')?.value)||0);
  }
  function progressionState(){
    const engine=window.MorimensFormulaEngine;
    if(!engine)return {bonusLevels:0,soulforgePct:0,gnosticLevel:0,soulforgeLevel:0,gnosticMax:0,soulforgeMax:0,flatAtkDamagePct:0,baseDamagePct:0};
    return engine.resolveProgression(
      currentTalents,
      effectiveGnosticLevel(),
      Number($('characterSculpt')?.value)||0,
      $('soulforgeActive')?.checked!==false
    );
  }
  function configureProgressionControls(resetCharacterSpecific=false){
    const engine=window.MorimensFormulaEngine;
    const state=engine?engine.resolveProgression(currentTalents,0,0,true):null;
    const inner=$('innerSpirit'),sculpt=$('characterSculpt');
    const innerMax=state?.gnosticMax||0,sculptMax=state?.soulforgeMax||0;
    if(inner){
      const previous=resetCharacterSpecific?0:Math.min(innerMax,Math.max(0,Number(inner.value)||0));
      const limited=isLimitedAwakener();inner.innerHTML='';
      if(limited&&innerMax>=5){
        inner.innerHTML=`<option value="5">${isEnglish()?'5 · Inner Spirit 5 (fixed for limited Awakener)':'5 · 内在灵格 5（限定固定）'}</option>`;
        inner.value='5';inner.disabled=true;inner.title=ui('限定唤醒体的内在灵格固定为 5，不可调整','Limited Awakeners have Inner Spirit fixed at 5.');
      }else{
        for(let i=0;i<=innerMax;i++){const o=document.createElement('option');o.value=String(i);o.textContent=i===0?ui('0 · 未启用','0 · Disabled'):ui(`${i} · 内在灵格 ${i}`,`${i} · Inner Spirit ${i}`);o.selected=i===previous;inner.appendChild(o)}
        if(!innerMax)inner.innerHTML=`<option value="0">${ui('0 · 无内在灵格数据','0 · No Inner Spirit data')}</option>`;
        inner.value=String(Math.min(innerMax,previous));inner.disabled=!innerMax;inner.title='';
      }
    }
    if(sculpt){
      const previous=resetCharacterSpecific?0:Math.min(sculptMax,Math.max(0,Number(sculpt.value)||0));sculpt.innerHTML='';
      for(let i=0;i<=sculptMax;i++){const o=document.createElement('option');o.value=String(i);o.textContent=i===0?ui('0 · 未启用','0 · Disabled'):ui(`${i} · 灵塑 ${i}`,`${i} · Soulforge ${i}`);o.selected=i===previous;sculpt.appendChild(o)}
      if(!sculptMax)sculpt.innerHTML=`<option value="0">${ui('0 · 无灵塑数据','0 · No Soulforge data')}</option>`;
    }
  }
  function renderProgressionSummary(stats,progression){
    const box=$('charStatsSummary');if(!box)return;
    const chips=isEnglish()?[
      `ATK ${Math.round(stats.ATK)}`,`CON ${Math.round(stats.CON)}`,`DEF ${Math.round(stats.DEF)}`,
      `Crit Rate ${num(stats.CritRate).toFixed(1)}%`,`Crit DMG ${(100+num(stats.CritDamage)).toFixed(1)}%`,`Damage Amplification ${num(stats.DamageAmplification).toFixed(1)}%`
    ]:[
      `攻击力 ${Math.round(stats.ATK)}`,`体质 ${Math.round(stats.CON)}`,`防御力 ${Math.round(stats.DEF)}`,
      `暴击率 ${num(stats.CritRate).toFixed(1)}%`,`暴击伤害 ${(100+num(stats.CritDamage)).toFixed(1)}%`,`伤害强效 ${num(stats.DamageAmplification).toFixed(1)}%`
    ];
    if(progression.gnosticLevel)chips.push(isEnglish()?`Inner Spirit ${progression.gnosticLevel}: base-stat level +${progression.bonusLevels}`:`内在灵格 ${progression.gnosticLevel}：基础属性等级 +${progression.bonusLevels}`);
    if(progression.psycheSurgeLevel)chips.push(isEnglish()?`Post-E3 substat growth tier ${progression.psycheSurgeLevel}: uses this Awakener's substat growth coefficients`:`启灵后副属性成长 ${progression.psycheSurgeLevel} 档：按角色副属性成长系数继续成长`);
    if(progression.soulforgeLevel){
      chips.push(isEnglish()?`Soulforge ${progression.soulforgeLevel}: primary stats +${progression.soulforgePct}%${progression.soulforgeEnabled?'':' (disabled)'}`:`灵塑 ${progression.soulforgeLevel}：主属性 +${progression.soulforgePct}%${progression.soulforgeEnabled?'':'（当前未启用）'}`);
      if(progression.flatAtkDamagePct)chips.push(isEnglish()?`Soulforge signature: extra damage equal to ${progression.flatAtkDamagePct}% ATK`:`灵塑专属：伤害额外增加攻击力的 ${progression.flatAtkDamagePct}%`);
      if(progression.baseDamagePct)chips.push(isEnglish()?`Soulforge signature: Base DMG +${progression.baseDamagePct}%`:`灵塑专属：基础伤害 +${progression.baseDamagePct}%`);
      if(progression.scopedFixedDamagePct&&progression.scopedFixedDamageSkillName)chips.push(isEnglish()?`Soulforge signature: ${progression.scopedFixedDamageSkillName} Fixed DMG +${progression.scopedFixedDamagePct}%`:`灵塑专属：${progression.scopedFixedDamageSkillName} 固定伤害 +${progression.scopedFixedDamagePct}%`);
    }
    box.innerHTML=chips.map(x=>`<span class="chip">${escape(x)}</span>`).join('');
    let desc=$('progressionDesc');
    if(!desc){desc=document.createElement('div');desc.id='progressionDesc';desc.className='desc';desc.style.marginTop='8px';box.insertAdjacentElement('afterend',desc)}
    const details=[];
    if(progression.gnosticTalent&&progression.gnosticLevel)details.push(`<strong>${ui('内在灵格：','Inner Spirit:')}</strong>${renderRichRecord(progression.gnosticTalent,progression.gnosticLevel)}`);
    if(progression.soulforgeTalent&&progression.soulforgeLevel)details.push(`<strong>${ui('灵塑：','Soulforge:')}</strong>${renderRichRecord(progression.soulforgeTalent,progression.soulforgeLevel)}`);
    desc.innerHTML=details.length?details.join('<br><br>'):ui('内在灵格与灵塑均为 0，当前不产生额外成长加成。','Inner Spirit and Soulforge are both 0; no additional progression bonuses are applied.');
    window.MorimensProgressionSync=progression;
  }

  function syncCharacterBaseField(id,nextBase){
    const el=$(id);if(!el||!currentAwakener)return;
    const next=num(nextBase,0),previousId=el.dataset.characterBaseAwakener||'';
    const previousBase=Number.parseFloat(el.dataset.characterBase);
    const manualBase=Number.parseFloat(el.dataset.manualBase);
    const followedPrevious=!Number.isFinite(previousBase)||!Number.isFinite(manualBase)||Math.abs(previousBase-manualBase)<1e-7;
    if(previousId!==currentAwakener.id||followedPrevious)el.dataset.manualBase=String(next);
    el.dataset.characterBase=String(next);el.dataset.characterBaseAwakener=currentAwakener.id;
  }
  function syncCharacterRealmMastery(nextBase){
    const el=$('realmMastery');if(!el||!currentAwakener)return;
    const next=num(nextBase,0),previousId=el.dataset.characterBaseAwakener||'';
    const previousBase=Number.parseFloat(el.dataset.characterBase);
    const shownBase=num(el.value)-gearRealmMasteryAuto;
    const followedPrevious=!Number.isFinite(previousBase)||Math.abs(previousBase-shownBase)<1e-7;
    if(previousId!==currentAwakener.id||followedPrevious){applyingAuto=true;el.value=String(Math.round((next+gearRealmMasteryAuto)*1000)/1000);applyingAuto=false}
    el.dataset.characterBase=String(next);el.dataset.characterBaseAwakener=currentAwakener.id;
  }

  function applyCharacterStats(){
    if(!currentAwakener)return;const level=Math.min(90,Math.max(1,Number(characterLevelControl()?.value)||90));
    const engine=window.MorimensFormulaEngine,progression=progressionState();
    progression.psycheSurgeLevel=psycheSurgeLevel();
    const stats=engine?engine.statsWithProgression(currentAwakener,level,progression,progression.psycheSurgeLevel):{
      ATK:Math.floor(num(currentAwakener.baseStatsLv1?.ATK)+num(currentAwakener.statScaling?.ATK)*(level-1)+1e-7),
      CON:Math.floor(num(currentAwakener.baseStatsLv1?.CON)+num(currentAwakener.statScaling?.CON)*(level-1)+1e-7),
      DEF:Math.floor(num(currentAwakener.baseStatsLv1?.DEF)+num(currentAwakener.statScaling?.DEF)*(level-1)+1e-7),
      CritRate:num(currentAwakener.substatsLv1?.CritRate),CritDamage:num(currentAwakener.substatsLv1?.CritDamage)
    };
    const input=$('attack');if(input&&$('autoCharacterStats')?.checked!==false&&(input.dataset.autoAttack!=='0')){applyingAuto=true;input.value=String(stats.ATK);input.dataset.autoAttack='1';applyingAuto=false}
    const cr=num(stats.CritRate),cd=num(stats.CritDamage);
    syncCharacterBaseField('critRate',cr);
    syncCharacterBaseField('critDamage',100+cd);
    syncCharacterBaseField('powerBonus',num(stats.DamageAmplification));
    syncCharacterRealmMastery(num(stats.RealmMastery));
    renderProgressionSummary(stats,progression);
    window.MorimensProgressionStats=stats;
    applyAutoBonuses();
    window.dispatchEvent(new CustomEvent('morimens-progression-change',{detail:{stats,progression}}));
  }
  async function loadAwakener(){
    const id=selectedAwakenerId(),compact=recordById(id);if(!compact)return;
    const previousAwakenerId=currentAwakener?.id||null;
    currentAwakener=await fetchRecord('awakeners',id).catch(()=>compact);
    const switchedCharacter=!!previousAwakenerId&&previousAwakenerId!==currentAwakener.id;
    ensureRouseUi();if(switchedCharacter&&$('rouseActive'))$('rouseActive').checked=false;
    await loadSignatureRelic(switchedCharacter);
    [currentTalents,currentEnlightens,currentOverlays]=await Promise.all([window.MorimensRepository.fullRecordsForAwakener('talents',id).catch(()=>[]),window.MorimensRepository.fullRecordsForAwakener('enlightens',id).catch(()=>[]),window.MorimensRepository.fullRecordsForAwakener('overlays',id).catch(()=>[])]);
    normalizeProgressionControls();
    configureProgressionControls(switchedCharacter);
    configureEnlightenControl(switchedCharacter);
    configurePsycheSurgeControl(switchedCharacter);
    renderCharacterResourceControls(switchedCharacter);
    refreshBattleProgressionUi();
    setText('charSyncText','SKeyDB public-v3');setText('charSyncStatus',isEnglish()?`${labelForAwakener(currentAwakener)}: loading skills…`:`${labelForAwakener(currentAwakener)}：正在载入技能…`);$('charSyncDot')?.classList.remove('bad','warn');$('charSyncDot')?.classList.add('ok');
    const select=$('skillSelect');if(select)select.innerHTML='<option value="">正在载入…</option>';
    applyCharacterStats();
    try{
      const [skillRows,derivedRows]=await Promise.all([
        window.MorimensRepository.recordsForAwakener('skills',currentAwakener.id),
        window.MorimensRepository.recordsForAwakener('derived-skills',currentAwakener.id).catch(()=>[])
      ]);
      currentSkills=await Promise.all([
        ...skillRows.map(x=>fetchRecord('skills',x.id)),
        ...derivedRows.map(x=>fetchRecord('derived-skills',x.id))
      ]);
      currentSkills=currentSkills.filter(x=>slotOrder[x.slot]||x.kind==='derivedSkill');
      currentSkills.sort((a,b)=>(slotOrder[a.slot]||90)-(slotOrder[b.slot]||90)||String(a.name||'').localeCompare(String(b.name||'')));
      renderSkillOptions(currentSkill?.id);
      const derivedCount=currentSkills.filter(x=>x.kind==='derivedSkill').length,baseCount=currentSkills.length-derivedCount;
      setText('charSyncStatus',isEnglish()?`${labelForAwakener(currentAwakener)} · ${baseCount} main skills + ${derivedCount} derived cards synchronized from local SKeyDB`:`${labelForAwakener(currentAwakener)} · ${baseCount} 个主技能 + ${derivedCount} 张衍生卡已从本地 SKeyDB 同步`);renderRouseSummary();await applySkill();
    }catch(error){console.warn('SKeyDB skill load failed',error);setText('charSyncStatus',isEnglish()?'Failed to load SKeyDB skill snapshot':'SKeyDB 技能快照加载失败');$('charSyncDot')?.classList.add('bad')}
  }
  async function applySkill(){
    const id=$('skillSelect')?.value;if(!id)return;
    const previousSkillId=currentSkill?.id||null;
    const baseSkill=currentSkills.find(x=>x.id===id)||await fetchRecord(skillRecordScope(id),id);
    const resolvedSkill=resolveSkillEnlighten(baseSkill);
    currentSkill=resolvedSkill?.slot==='OverExalt'?composeOverExaltSkill(resolvedSkill):resolvedSkill;
    if(previousSkillId&&previousSkillId!==currentSkill.id&&$('skillActualHits'))$('skillActualHits').value='';
    const levels=maxSkillLevel(currentSkill),levelSelect=$('skillLevel'),previous=Math.min(Number(levelSelect?.value)||1,levels);
    if(levelSelect){levelSelect.innerHTML='';for(let i=1;i<=levels;i++){const o=document.createElement('option');o.value=String(i);o.textContent=isEnglish()?`Lv.${i}`:`等级 ${i}`;o.selected=i===previous;levelSelect.appendChild(o)}}recomputeGearBonuses();updateSkillLevel();
  }
  function updateSkillLevel(){
    if(!currentSkill)return;
    ensureSkillRuntimeUi();
    const level=Number($('skillLevel')?.value)||1;
    const engine=window.MorimensFormulaEngine;
    const baseCtx=currentFormulaContext();
    const runtimeHints=engine?.damageRuntimeHints?.(currentSkill,level,baseCtx)||{needsHitOverride:false,messages:[]};
    const requestedHits=Math.max(0,Math.floor(num($('skillActualHits')?.value,0)));
    const damageTokenCount=(String(currentSkill?.descriptionTemplate||'').match(/\[Damage:[^\]]+\]/gi)||[]).length;
    const baseWheel=applyWheelDirectSkillEffects(applyCharacterResourceEffects(engine?engine.damageEvents(currentSkill,level,baseCtx):[]));
    const baseSignature=applySignatureRelicSkillMods(baseWheel.events);
    const baseDamageEvents=baseSignature.events;
    const hasAutomaticDamage=baseDamageEvents.some(x=>['active','pierce','pure','fixed'].includes(x.type));
    const canOverrideHits=runtimeHints.needsHitOverride&&damageTokenCount===1&&hasAutomaticDamage;
    const ctx=currentFormulaContext(canOverrideHits&&requestedHits>0?{actualHitCount:requestedHits}:{});
    const wheelResult=canOverrideHits&&requestedHits>0&&engine
      ?applyWheelDirectSkillEffects(applyCharacterResourceEffects(engine.damageEvents(currentSkill,level,ctx)))
      :baseWheel;
    const signatureResult=canOverrideHits&&requestedHits>0&&engine
      ?applySignatureRelicSkillMods(wheelResult.events)
      :baseSignature;
    const damageEvents=signatureResult.events;
    const signatureSkillMods=signatureResult.mods;
    const wheelSkillNotes=wheelResult.notes||[];
    const coef=damageEvents[0]?.coefficient||damageCoefficient(currentSkill,level);
    const directParts=damageEvents.filter(x=>Number.isFinite(Number(x.coefficient))).map(x=>Number(x.coefficient));
    const tentacleCoef=engine?engine.tentacleBonusCoefficient(currentSkill,level,ctx):0;
    const triggerPct=engine?engine.triggeredTentaclePercent(currentSkill,level,ctx):null;
    if($('skillCoef'))$('skillCoef').value=String(coef);
    if($('skillDesc'))$('skillDesc').innerHTML=`<strong>${escape(localizedSkillName(currentSkill))}</strong> · ${renderRichRecord(currentSkill,level)}`;
    if($('skillRuntimeBlock')){
      const messages=[...(runtimeHints.messages||[])];
      if(signatureRelicEnabled()&&signatureSkillMods?.notes?.length)messages.push(...(isEnglish()?['Signature Creation modifiers from the SKeyDB source are applied where their conditions can be resolved safely.']:signatureSkillMods.notes));
      if(wheelSkillNotes.length)messages.push(...(isEnglish()?['Wheel skill-specific modifiers from the SKeyDB source are applied where their conditions can be resolved safely.']:wheelSkillNotes));
      if(currentSkill?.overExaltEffectId){
        messages.push(ui('超限爆发已按 SKeyDB“升级原狂气爆发并添加额外效果”合并计算；基础/最终伤害、技能暴击、伤害段数、固定伤害倍增及可直接解析的额外纯粹伤害/状态事件会自动叠加。','Over-Exalt is merged with the upgraded base Exalt according to SKeyDB. Base/Final DMG, skill Crit, hit count, fixed-damage multipliers, and directly resolvable extra Pure/status events are combined automatically.'));
        const overText=String(currentSkill.descriptionTemplate||'').split('{Over-Exalt}:')[1]||'';
        if(/(?:all Awakeners|this turn|for the next|lasting|temporarily increase)/i.test(overText))messages.push(ui('该超限还包含团队/回合持续状态；这类效果不反向追溯到本次基础狂气爆发伤害，避免因结算时序不明而高算。','This Over-Exalt also contains team/turn-duration states. Those effects are not applied retroactively to the current base Exalt damage when timing is ambiguous.'));
      }
      if(runtimeHints.needsHitOverride&&damageTokenCount>1)messages.push(ui('该技能包含多个独立伤害公式，无法安全用一个段数覆盖全部事件；当前仅显示条件提示，不自动改写段数。','This skill contains multiple independent damage formulas, so one hit-count override cannot safely replace all events. The condition is shown without rewriting hit counts.'));
      if(runtimeHints.needsHitOverride&&damageTokenCount===1&&!hasAutomaticDamage)messages.push(ui('当前唯一伤害公式属于未满足/未选择的条件分支，因此禁用段数覆盖，避免填写段数后误以为条件伤害已启用。','The only damage formula belongs to an unmet/unselected conditional branch, so hit-count override is disabled to avoid implying that the conditional damage is active.'));
      $('skillRuntimeBlock').hidden=messages.length===0;
      if($('skillActualHitsField'))$('skillActualHitsField').hidden=!canOverrideHits;
      if($('skillRuntimeWarnings'))$('skillRuntimeWarnings').innerHTML=messages.length
        ?`<strong>${ui('动态条件提示：','Dynamic Condition Notes:')}</strong>`+messages.map(escape).join('<br>')
        :'';
      if(canOverrideHits&&$('skillActualHits')){
        const range=runtimeHints.minHits&&runtimeHints.maxHits?(isEnglish()?`Suggested range: ${runtimeHints.minHits}–${runtimeHints.maxHits}.`:`建议范围：${runtimeHints.minHits}–${runtimeHints.maxHits}。`):'';
        $('skillActualHits').title=range||ui('填写本次实际伤害段数','Enter the actual hit count for this use');
      }
    }
    let generatedStrength=0,generatedShield=0,characterStrengthBonus=0;
    const generatedBaseSkillId=currentSkill?.overExaltBaseSkillId||currentSkill?.id||'';
    const baseSkillId=generatedBaseSkillId;
    const generatedResources=characterResourceValues();
    if(currentAwakener?.id==='awakener-0001'&&rouseActive()&&(window.MorimensRealmEngine?.state?.().baseRealms||[]).includes('CARO')){
      const rouse=resolvedRouseSkill(),rank=rouseRank();
      const perPointPct=Math.max(0,num(argValue(rouse?.descriptionArgs?.StateArg3,rank),0));
      const consumed=Math.max(0,Math.floor(Number(generatedResources.twentyFourRouseArithmeticaConsumed)||0));
      characterStrengthBonus=Math.max(0,num(ctx?.ATK,0))*perPointPct/100*consumed;
    }
    if(currentAwakener?.id==='awakener-0027'&&generatedBaseSkillId==='skill.kathigu-ra.last-stand-salvo'){
      const rank=Math.max(1,Math.min(6,Number($('skillLevel')?.value)||1));
      const fiammaStacks=Number(generatedResources.fiammaActive)>0&&String(currentSkill?.cardFamily||'').toLowerCase()==='command'?Math.min(3,Math.max(1,Math.floor(Number(generatedResources.fiammaStacks)||1))):0;
      const e2Unlocked=ENLIGHTEN_ORDER.indexOf(selectedEnlightenSlot())>=ENLIGHTEN_ORDER.indexOf('E2');
      const baseStrPct=Math.max(0,num(argValue(currentSkill?.descriptionArgs?.Arg4||currentSkill?.descriptionArgs?.Arg2,rank),0));
      const extraStrPct=e2Unlocked&&fiammaStacks===3?Math.max(0,num(argValue(currentSkill?.descriptionArgs?.Arg3,rank),3)):0;
      const absoluteRouse=rouseActive()&&selectedEnlightenSlot()==='AbsoluteAxiom';
      const fiammaPerStack=30+(absoluteRouse?30:0);
      const fiammaStrengthMultiplier=1+fiammaStacks*fiammaPerStack/100;
      generatedStrength=Math.max(0,num(ctx?.ATK,0))*(baseStrPct+extraStrPct)/100*fiammaStrengthMultiplier;
    }
    const ogierBaseSkillId=generatedBaseSkillId;
    if(currentAwakener?.id==='awakener-0061'&&ogierBaseSkillId==='skill.ogier-oathbound.unfallen-heart'){
      const resources=characterResourceValues();
      const stacks=Math.min(3,Math.max(0,Number(resources.undertowStacks)||0));
      const stackPct=/increase the Base Shield and \{STR\} generated by this Exalt by 50%/i.test(String(currentSkill?.descriptionTemplate||''))?50:33;
      const strPct=Math.max(0,num(argValue(currentSkill?.descriptionArgs?.Arg4,level),0));
      const shieldPct=Math.max(0,num(argValue(currentSkill?.descriptionArgs?.Arg3,level),0));
      const buffScale=1+stacks*stackPct/100;
      const overExaltMultiplier=currentSkill?.overExaltEffectId?3:1;
      generatedStrength=Math.max(0,num(ctx?.ATK,0))*strPct/100*buffScale*overExaltMultiplier;
      generatedShield=Math.max(0,num(ctx?.DEF,0))*shieldPct/100*buffScale;
    }
    if($('skillCoeffSummary')){
      const parts=[];
      if(damageEvents.length){
        const labels={active:'主动',pierce:'穿透',tentacle:'触腕',pure:'纯粹',fixed:'固定',poison:'中毒',bleed:'流血',corrosion:'侵蚀',counter:'反击',sacrifice:'献祭'};
        parts.push(`伤害事件 ${damageEvents.length} 个：${damageEvents.map(x=>{
          const name=(labels[x.type]||x.type)+(x.turnEndOnly?'（回合末）':'');
          if(x.coefficient!==undefined)return name+' '+Number(x.coefficient).toFixed(2)+'%';
          if(x.percent!==undefined)return name+' '+Number(x.percent).toFixed(2)+'%';
          return name;
        }).join(' / ')}`);
      }
      if(currentSkill?.kind==='derivedSkill'){
        const eventTypes=new Set(damageEvents.map(x=>x.type));
        const notes=[];
        if(eventTypes.has('active'))notes.push('主动伤害：受易伤/虚弱影响');
        if(eventTypes.has('pierce'))notes.push('穿透伤害：不受易伤/虚弱影响');
        if(eventTypes.has('tentacle'))notes.push('触腕伤害：受易伤/虚弱影响');
        if(eventTypes.has('pure'))notes.push('纯粹伤害：不受易伤/虚弱影响');
        if(eventTypes.has('fixed'))notes.push('固定伤害：不受易伤/虚弱影响');
        if(notes.length)parts.push('衍生卡乘区：'+notes.join('；'));
        if(damageEvents.some(x=>['poison','bleed','counter','corrosion'].includes(x.type)&&x.basis==='sourceDamage'))parts.push('来源伤害型状态会随对应伤害事件联动变化');
      }
      if(tentacleCoef)parts.push(`触腕伤害 × ${Number(tentacleCoef).toFixed(2)}%`);
      if(triggerPct!==null)parts.push(`额外触腕触发 × ${Number(triggerPct).toFixed(2)}%`);
      if(wheelSkillNotes.length)parts.push(...wheelSkillNotes);
      const resources=characterResourceValues();
      if(currentAwakener?.id==='awakener-0001'){
        const prior=Math.max(0,Math.floor(Number(resources.twistedCarrionPriorUses)||0));
        if(prior>0&&(currentSkill?.overExaltBaseSkillId||currentSkill?.id)==='skill.24.twisted-carrion-revel')parts.push(`「扭曲腐肉狂欢」本场成长：此前 ${prior} 次，本次基础伤害 +${prior*20}%`);
        const overUses=Math.max(0,Math.floor(Number(resources.twentyFourOverExaltPriorUses)||0));
        if(overUses>0)parts.push(`此前超限 ${overUses} 次：有效界域精通额外 +${overUses*24}`);
        if(rouseActive()){
          const realms=window.MorimensRealmEngine?.state?.().baseRealms||[];
          if(realms.includes('CHAOS')&&Number(resources.twentyFourRousePosseUses)>0)parts.push('灵知觉醒·混沌：钥令次数已计入狂气爆发最终伤害');
          if(realms.includes('AEQUOR'))parts.push('灵知觉醒·深海：触腕伤害加成、10% 中毒及爆发 50% 中毒触发已计入');
          if(realms.includes('CARO'))parts.push(`灵知觉醒·血肉：累计算力生成力量约 ${characterStrengthBonus.toFixed(1)}；爆发额外 300% 力量加成已计入`);
          if(realms.includes('ULTRA'))parts.push('灵知觉醒·超维：反击伤害加成已计入');
        }
      }
      if(currentAwakener?.id==='awakener-0014'&&Number(resources.corpseStacks)>=3)parts.push('残骸 3 层：对应狂气爆发的暴击伤害加成翻倍');
      if(currentAwakener?.id==='awakener-0014'&&Number(resources.evernightPriorPlays)>0&&(currentSkill?.overExaltBaseSkillId||currentSkill?.id)==='derived.doresain.evernights-revel')parts.push('后续永夜：额外 100% 力量加成');
      if(currentAwakener?.id==='awakener-0041'&&Number(resources.sinMarkStacks)>0)parts.push(`罪印 ${Number(resources.sinMarkStacks)} 层：每次技能伤害附加 ${Number(resources.sinMarkStacks)}% 出血`);
      if(currentAwakener?.id==='awakener-0041'&&Number(resources.polluxCommandFinalBonusPct)>0)parts.push(`当前指令卡最终伤害额外加成 +${Number(resources.polluxCommandFinalBonusPct).toFixed(1)}%`);
      if(currentAwakener?.id==='awakener-0041'&&rouseActive())parts.push('灵知觉醒：「圣心」额外施加等于本次伤害 100% 的出血');
      if(currentAwakener?.id==='awakener-0041'&&Number(resources.atonementByPainActive)>0)parts.push(`苦痛救赎：${Number(resources.atonementByPainDouble)>0?2:1} 次 × ${(200*(1+0.20*completedBattles())).toFixed(0)}% 攻击力`);
      if(currentAwakener?.id==='awakener-0019'){
        const firstDirect=damageEvents.find(x=>x.type==='active'||x.type==='pierce');
        if(firstDirect){
          const baseLayers=(firstDirect.baseDamageMultipliers||[]).map(x=>x.label+' +'+Number(x.pct).toFixed(1)+'%').join('；');
          const finalLayers=(firstDirect.finalDamageMultipliers||[]).map(x=>x.label+' +'+Number(x.pct).toFixed(1)+'%').join('；');
          parts.push('血链专项效果已接入通用乘区模型：伤害强效仅作用基础伤害，力量在其后相加；相同目标加成同池相加，不同目标池相乘'+(baseLayers?'；角色专属：'+baseLayers:'')+(finalLayers?'；角色专属：'+finalLayers:''));
          if(baseSkillId==='skill.helot-catena.sanguine-fetters'&&progressionState()?.soulforgeEnabled&&progressionState()?.soulforgeLevel>0)parts.push('「缚身锁链」灵塑专属基础伤害与力量倍率已计入');
          if(baseSkillId==='skill.helot-catena.strike'&&ENLIGHTEN_ORDER.indexOf(selectedEnlightenSlot())>=ENLIGHTEN_ORDER.indexOf('E1'))parts.push('启灵1：打击 +15% 暴击率 / +15% 暴击伤害已计入');
          if(baseSkillId==='skill.helot-catena.hatred-unleashed')parts.push('「恨意宣泄」攻击力百分比力量已加入本次伤害'+(Number(resources.helotHatredBelowHalfHp)>0?'（生命低于50%，启灵2翻倍）':''));
          if(baseSkillId==='skill.helot-catena.crimson-shackles')parts.push('「鲜血链条」按 2 段独立主动伤害结算：满级合计攻击力 80%，每段力量×1，合计力量项×2');
          if(baseSkillId==='skill.helot-catena.sanguine-fetters')parts.push('「缚身锁链」本次主动伤害会自动附加当前等级 75%–100% 的出血，无需重复勾选本回合状态');
          if(baseSkillId==='derived.helot-catena.bloodthirsty-flail')parts.push('「嗜血链球」5×力量加成与目标当前流血 30% 触发已计入');
        }
      }
      if(currentAwakener?.id==='awakener-0019'&&Number(resources.helotSanguineTurnActive)>0){
        const exalt=currentSkills.find(skill=>skill.id==='skill.helot-catena.sanguine-fetters');
        const bleedPct=Math.max(0,num(argValue(resolveSkillEnlighten(exalt)?.descriptionArgs?.Arg2,Math.max(1,Math.min(6,Number($('skillLevel')?.value)||1))),0));
        parts.push(`「缚身锁链」本回合效果：主动伤害附加 ${bleedPct.toFixed(0)}% 出血`);
      }
      if(currentAwakener?.id==='awakener-0027'){
        const fiammaStacks=Number(resources.fiammaActive)>0&&String(currentSkill?.cardFamily||'').toLowerCase()==='command'?Math.min(3,Math.max(1,Math.floor(Number(resources.fiammaStacks)||1))):0;
        if(fiammaStacks>0){
          const absoluteRouse=rouseActive()&&selectedEnlightenSlot()==='AbsoluteAxiom';
          parts.push(`活焰 ${fiammaStacks}/3 层：本卡最终伤害 +${fiammaStacks*(30+(absoluteRouse?30:0))}%${absoluteRouse?'（灵知觉醒 + 最终法则）':''}`);
          if(fiammaStacks===3&&ENLIGHTEN_ORDER.indexOf(selectedEnlightenSlot())>=ENLIGHTEN_ORDER.indexOf('E2')&&baseSkillId==='skill.kathigu-ra.solarflare')parts.push('启灵2 · 活焰 3 层：「千兆耀斑」基础伤害 +50%');
          if(fiammaStacks===3&&ENLIGHTEN_ORDER.indexOf(selectedEnlightenSlot())>=ENLIGHTEN_ORDER.indexOf('E2')&&baseSkillId==='skill.kathigu-ra.last-stand-salvo')parts.push('启灵2 · 活焰 3 层：「末路枪声」额外获得 3% 攻击力的力量；属于后续卡牌状态，不回溯本卡伤害');
          if(fiammaStacks===3&&rouseActive())parts.push('灵知觉醒：3 层活焰卡使用后返回手牌；这里只计算本次使用，不自动重复整张卡');
        }
        if(Number(resources.combustStacks)>0&&ENLIGHTEN_ORDER.indexOf(selectedEnlightenSlot())>=ENLIGHTEN_ORDER.indexOf('E3'))parts.push(`启灵3 · 燃烧 ${Math.min(10,Math.floor(Number(resources.combustStacks)||0))} 层：本场基础伤害 +${Math.min(10,Math.floor(Number(resources.combustStacks)||0))*5}%`);
      }
      if(currentAwakener?.id==='awakener-0003'&&baseSkillId==='skill.aigis.decomposition'&&vulnerableStacks()>0&&ENLIGHTEN_ORDER.indexOf(selectedEnlightenSlot())>=ENLIGHTEN_ORDER.indexOf('E2'))parts.push(`目标易伤 ${vulnerableStacks()} 层：启灵2对应技能最终伤害 +${Math.min(500,vulnerableStacks()*5)}%`);
      if(currentAwakener?.id==='awakener-0020'&&baseSkillId==='skill.ramona-timeworn.predetermined-strike')parts.push(`「命定之剑」力量倍率：基础 3× + 本场钥令 ${Math.floor(Number(resources.ramonaPosseUses)||0)} 次`);
      if(currentAwakener?.id==='awakener-0010'&&Number(resources.symbiosisRemovedStacks)>0)parts.push(`本场累计移除共生 ${Math.floor(Number(resources.symbiosisRemovedStacks)||0)} 层：启灵2及以上：基础伤害 +${Math.floor(Number(resources.symbiosisRemovedStacks)||0)*3}%`);
      if(currentAwakener?.id==='awakener-0010'&&rouseActive()&&Number(resources.clementineFirstCommandRouse)>0&&String(currentSkill?.cardFamily||'').toLowerCase()==='command')parts.push('灵知觉醒：本回合第一张指令卡的可解析伤害效果额外触发 2 次');
      if(currentAwakener?.id==='awakener-0010'&&rouseActive()&&selectedEnlightenSlot()==='AbsoluteAxiom')parts.push('最终法则灵知觉醒：每个可解析伤害公式的段数 +1');
      if(currentAwakener?.id==='awakener-0060'&&baseSkillId==='skill.caraboo.ta-da-its-the-fairy')parts.push(`饱足 ${Math.floor(Number(resources.satietyStacks)||0)} 层；供奉 ${Math.floor(Number(resources.offeringStacks)||0)} 层（供奉增加本次段数；转化后的饱足不回溯本次基础伤害）`);
      if(currentAwakener?.id==='awakener-0018'&&Number(resources.finaleFormActive)>0)parts.push('终末形态已开启：只计入已明确接入的形态条件伤害');
      if(currentAwakener?.id==='awakener-0018'&&rouseActive()&&selectedEnlightenSlot()==='AbsoluteAxiom'&&Number(resources.finaleStacks)>0)parts.push(`最终法则灵知觉醒：终末 ${Math.floor(Number(resources.finaleStacks)||0)} 层 → 伤害强效 +${8*Math.floor(Number(resources.finaleStacks)||0)}%`);
      if(currentAwakener?.id==='awakener-0018'&&currentSkill?.overExaltEffectId&&Number(resources.finaleFormActive)>0)parts.push('⚠ 超限终末形态的“每消耗 10 狂气额外触发 3% 中毒”依赖实际消耗狂气，当前未自动计入');
      if(currentAwakener?.id==='awakener-0041'&&completedBattles()>0)parts.push(`探索第 ${explorationBattleIndex()} 场：波吕克斯基础伤害 +${20*completedBattles()}%`);
      if(currentAwakener?.id==='awakener-0008'&&completedBattles()>0)parts.push(`探索第 ${explorationBattleIndex()} 场：卡斯托尔侵蚀施加量 +${20*completedBattles()}%`);
      if(currentAwakener?.id==='awakener-0010'&&activeEnlightens().some(x=>x.id==='enlighten.clementine.soul-healing-journey')&&completedBattles()>0)parts.push(`探索第 ${explorationBattleIndex()} 场：克莱门汀启灵2基础伤害 +${25*completedBattles()}%`);
      if(currentAwakener?.id==='awakener-0058'&&Number(resources.packHuntStacks)>0)parts.push(`群猎 ${Number(resources.packHuntStacks)} 层：本张对应「魇」衍生卡额外触发 1 次（消耗 1 层）`);
      if(currentAwakener?.id==='awakener-0052'&&Number(resources.dreamlureStacks)>=5)parts.push('梦引 ≥5：可触发跃迁额外伤害');
      if(currentAwakener?.id==='awakener-0054'&&resources.xuChoice)parts.push(`徐当前选择：${resources.xuChoice==='betroth'?'相许':'夺魄'}`);
      if(currentAwakener?.id==='awakener-0054'&&Number(resources.spellboundStacks)>0)parts.push(`目标痴醉 ${Number(resources.spellboundStacks)} 层：夺魄按层结算纯粹伤害/中毒触发`);
      if(currentAwakener?.id==='awakener-0061'&&Number(resources.undertowStacks)>0)parts.push(`暗潮 ${Number(resources.undertowStacks)} 层：指令卡最终伤害/暴伤已按当前启灵阶段计入`);
      if(currentAwakener?.id==='awakener-0061'&&rouseActive()&&(currentSkill?.overExaltBaseSkillId||currentSkill?.id)==='skill.ogier-oathbound.sin-stained-spear')parts.push(selectedEnlightenSlot()==='AbsoluteAxiom'?'灵知觉醒 + 最终法则：染罪之枪基础伤害 +100%、总力量加成 500%，并施加等量侵蚀':'灵知觉醒：染罪之枪命中后施加等量侵蚀');
      if(currentAwakener?.id==='awakener-0027'&&generatedBaseSkillId==='skill.kathigu-ra.last-stand-salvo'&&generatedStrength>0)parts.push(`「末路枪声」本次生成力量约 ${generatedStrength.toFixed(1)}；活焰对“获得力量”的增幅与 3 层启灵2额外 3% 攻击力已按当前状态计入。该力量只影响后续卡牌，不回溯本卡伤害。`);
      if(currentAwakener?.id==='awakener-0061'&&generatedStrength>0)parts.push(`本次爆发生成力量约 ${generatedStrength.toFixed(1)}${currentSkill?.overExaltEffectId?'（超限三倍已计入）':''}；护盾约 ${generatedShield.toFixed(1)}。生成的力量属于后续卡牌状态，请在后续伤害计算中填入“力量”。`);
      if(canOverrideHits&&requestedHits>0)parts.push(`实际段数覆盖：${requestedHits}`);
      else if(runtimeHints.needsHitOverride&&hasAutomaticDamage)parts.push('⚠ 动态段数未指定，当前按可确定的基础/最低段数');
      else if(runtimeHints.needsHitOverride&&!hasAutomaticDamage)parts.push('⚠ 条件伤害分支未启用，当前不结算该伤害事件');
      if(isEnglish()){
        const enParts=[];
        if(damageEvents.length){
          const labels={active:'Active DMG',pierce:'Pierce DMG',tentacle:'Tentacle DMG',pure:'Pure DMG',fixed:'Fixed DMG',poison:'Poison',bleed:'Bleed',corrosion:'Corrosion',counter:'Counter',sacrifice:'Sacrifice'};
          enParts.push(`${damageEvents.length} damage event${damageEvents.length===1?'':'s'}: ${damageEvents.map(event=>{
            const name=(labels[event.type]||event.type)+(event.turnEndOnly?' (turn end)':'');
            if(event.coefficient!==undefined)return name+' '+Number(event.coefficient).toFixed(2)+'%';
            if(event.percent!==undefined)return name+' '+Number(event.percent).toFixed(2)+'%';
            return name;
          }).join(' / ')}`);
        }
        if(currentSkill?.kind==='derivedSkill')enParts.push('Derived-card damage uses the event type shown above; Vulnerable/Weak and STR are applied only where that event type supports them.');
        if(tentacleCoef)enParts.push(`Tentacle DMG × ${Number(tentacleCoef).toFixed(2)}%`);
        if(triggerPct!==null)enParts.push(`Additional Tentacle trigger × ${Number(triggerPct).toFixed(2)}%`);
        if(signatureRelicEnabled()&&signatureSkillMods?.notes?.length)enParts.push('Signature Creation skill modifier applied');
        if(wheelSkillNotes.length)enParts.push('Wheel skill modifier applied');
        if(canOverrideHits&&requestedHits>0)enParts.push(`Actual hit-count override: ${requestedHits}`);
        else if(runtimeHints.needsHitOverride&&hasAutomaticDamage)enParts.push('Dynamic hit count not specified; using the determinable base/minimum count');
        else if(runtimeHints.needsHitOverride&&!hasAutomaticDamage)enParts.push('Conditional damage branch inactive; this damage event is not resolved');
        $('skillCoeffSummary').textContent=(enParts.length?enParts.join(' + '):'No directly resolvable damage coefficient')+` · ${currentSkill.id}`;
      }else{
        $('skillCoeffSummary').textContent=(parts.length?parts.join(' + '):'该技能没有可直接换算的伤害倍率')+` · ${currentSkill.id}`;
      }
    }
    const syncResources=characterResourceValues();
    const characterDamageAmpBonusPct=currentAwakener?.id==='awakener-0018'&&rouseActive()&&selectedEnlightenSlot()==='AbsoluteAxiom'
      ?8*Math.min(10,Math.max(0,Math.floor(Number(syncResources.finaleStacks)||0))):0;
    window.MorimensSkillSync={skill:currentSkill,level,atkCoefficient:coef,directAtkCoefficients:directParts,damageEvents,tentacleCoefficient:tentacleCoef,triggeredTentaclePercent:triggerPct,context:ctx,runtimeHints,actualHitCount:canOverrideHits&&requestedHits>0?requestedHits:null,enlightenSlot:selectedEnlightenSlot(),psycheSurgeLevel:psycheSurgeLevel(),resources:syncResources,rouseActive:rouseActive(),characterDamageAmpBonusPct,characterStrengthBonus,generatedStrength,generatedShield,signatureRelic:signatureRelicEnabled()?{id:currentSignatureRelic?.id||'',mods:signatureSkillMods}:null,activeEnlightenIds:activeEnlightens().map(x=>x.id)};
    window.dispatchEvent(new CustomEvent('morimens-skill-formula',{detail:window.MorimensSkillSync}));
    $('calcBtn')?.click();
  }

  async function loadCatalogs(){
    const [wr,cr,rr,gm]=await Promise.allSettled([window.MorimensRepository.catalog('wheels'),window.MorimensRepository.catalog('covenants'),window.MorimensRepository.catalog('relics'),window.MorimensRepository.gameplayMath()]);
    wheelCatalog=wr.status==='fulfilled'?(wr.value?.records||[]):[];covenantCatalog=cr.status==='fulfilled'?(cr.value?.records||[]):[];relicCatalog=rr.status==='fulfilled'?(rr.value?.records||[]):[];gameplayMathMeta=gm.status==='fulfilled'?gm.value:null;
    window.MorimensFormulaEngine?.setGameplayMathMetadata?.(gameplayMathMeta);ensureFormulaContextUi();
    if(gameplayMathMeta?.accountLevelCurve&&$('formulaAccountLevel')){$('formulaAccountLevel').min=String(gameplayMathMeta.accountLevelCurve.minLevel||1);$('formulaAccountLevel').max=String(gameplayMathMeta.accountLevelCurve.maxLevel||100)}
    const w1=$('fateSelect'),w2=$('fateSelect2');for(const sel of [w1,w2]){if(!sel)continue;const prev=sel.value;sel.innerHTML=`<option value="">${isEnglish()?'None':'无'}</option>`;for(const wheel of wheelCatalog){const o=document.createElement('option');o.value=wheel.id;o.textContent=wheelOptionLabel(wheel);o.selected=wheel.id===prev;sel.appendChild(o)}}
    const cs=$('contractSelect');if(cs){const prev=cs.value;cs.innerHTML=`<option value="">${isEnglish()?'None':'无'}</option>`;for(const covenant of covenantCatalog){const o=document.createElement('option');o.value=covenant.id;o.textContent=isEnglish()?covenant.name:(zhCovenants[covenant.name]||covenant.name);o.selected=covenant.id===prev;cs.appendChild(o)}}
    const missing=[wr,cr,rr,gm].filter(x=>x.status!=='fulfilled').length;
    setText('skeydbBuildText',missing
      ?(isEnglish()?`Loaded ${wheelCatalog.length} Wheels and ${covenantCatalog.length} Covenants; some catalogs are unavailable, but character/skill calculation remains usable.`:`已载入 ${wheelCatalog.length} 个命轮、${covenantCatalog.length} 套密契；部分目录暂不可用，角色技能仍可计算`)
      :(isEnglish()?`Synchronized ${wheelCatalog.length} Wheels, ${covenantCatalog.length} Covenants, and the signature-creation index.`:`已同步 ${wheelCatalog.length} 个命轮、${covenantCatalog.length} 套密契及角色专属造物索引`));
    $('skeydbBuildDot')?.classList.add(missing?'warn':'ok');syncWheelDuplicates();
  }
  function syncWheelDuplicates(){
    const a=$('fateSelect'),b=$('fateSelect2');if(!a||!b)return;const av=a.value,bv=b.value;
    for(const o of a.options)o.disabled=!!(o.value&&o.value===bv&&o.value!==av);
    for(const o of b.options)o.disabled=!!(o.value&&o.value===av&&o.value!==bv);
  }
  function wheelEnhanceLabel(level){
    const n=Math.max(0,Math.min(15,Math.floor(Number(level)||0)));
    return n<=3?`E${n}`:`E3 + ${n-3}`;
  }
  function fillLevelSelect(slot,record){
    const sel=$(`fateLevel${slot+1}`);if(!sel)return;
    const max=record?15:0,prev=Math.min(Math.max(Number(sel.value)||0,0),max);
    sel.innerHTML='';
    for(let i=0;i<=max;i++){
      const o=document.createElement('option');o.value=String(i);o.textContent=wheelEnhanceLabel(i);o.selected=i===prev;sel.appendChild(o);
    }
    sel.disabled=!record;
  }
  async function loadWheel(slot){
    const sel=$(slot===0?'fateSelect':'fateSelect2'),id=sel?.value;
    const other=$(slot===0?'fateSelect2':'fateSelect');if(id&&other?.value===id){sel.value='';currentWheels[slot]=null;setText('skeydbBuildText',isEnglish()?'The two Wheel slots cannot use the same Wheel; the duplicate selection was cleared.':'两个命轮不能重复，已取消重复选择。');syncWheelDuplicates();renderWheelsAndBonuses();updateSkillLevel();$('calcBtn')?.click();return}
    currentWheels[slot]=id?await fetchRecord('wheels',id):null;const levelSel=$(`fateLevel${slot+1}`);if(levelSel)levelSel.value='0';fillLevelSelect(slot,currentWheels[slot]);syncWheelDuplicates();renderWheelsAndBonuses();updateSkillLevel();$('calcBtn')?.click();
  }
  function isConditional(sentence){
    return /\b(if|when|whenever|after|before|next|per |for each|for every|every time|each time|at the start|at turn|upon|once|during|while|until|first|chance|stacks?|current realm|realm includes|boss battle)\b/i.test(sentence);
  }
  function effectiveCardClassifications(skill){
    const values=new Set((skill?.countsAs||[]).map(x=>String(x).toLowerCase()));
    const text=String(skill?.descriptionTemplate||'');
    for(const scope of ['strike','defense','pursuit','exalt']){
      const re=new RegExp('(?:counts?\\s+as|considered\\s+as)\\s+(?:a\\s+)?["“]?'+scope+'["”]?','i');
      if(re.test(text))values.add(scope);
    }
    return [...values];
  }
  function skillMatchesScope(skill,scope){
    if(!skill)return false;
    const target=String(scope||'').toLowerCase();
    const slot=String(skill.slot||'').toLowerCase();
    const countsAs=effectiveCardClassifications(skill);
    const cardTypes=(skill.cardTypes||[]).map(x=>String(x).toLowerCase());
    const family=String(skill.cardFamily||'').toLowerCase();
    if(target==='exalt')return slot==='exalt'||slot==='overexalt'||Boolean(skill.overExaltEffectId)||countsAs.includes('exalt')||cardTypes.includes('exalt');
    if(target==='strike')return slot==='strike'||countsAs.includes('strike')||cardTypes.includes('strike');
    if(target==='defense')return slot==='defense'||countsAs.includes('defense')||cardTypes.includes('defense');
    if(target==='pursuit')return slot==='pursuit'||countsAs.includes('pursuit')||cardTypes.includes('pursuit')||family==='pursuit';
    if(target==='command')return family==='command'||countsAs.includes('command')||cardTypes.includes('command');
    return slot===target||countsAs.includes(target)||cardTypes.includes(target)||family===target;
  }
  function bonusScopeAllows(sentence,key){
    const currentScopes={
      exalt:skillMatchesScope(currentSkill,'exalt'),
      strike:skillMatchesScope(currentSkill,'strike'),
      defense:skillMatchesScope(currentSkill,'defense'),
      pursuit:skillMatchesScope(currentSkill,'pursuit'),
      command:skillMatchesScope(currentSkill,'command')
    };
    const metric=key==='base'?'Base DMG':key==='final'?'Final DMG':key==='critRate'?'Crit(?:\\.? Rate)':key==='critDamage'?'Crit(?:\\.? DMG)':null;
    if(!metric)return true;
    const compact=String(sentence||'').replace(/\\s+/g,' ');
    if(!(new RegExp(metric,'i')).test(compact))return true;
    const scopePatterns={
      exalt:`Exalt(?:'s)?`,
      strike:`(?:"?Strike"?(?: Commands?)?)`,
      defense:`(?:"?Defense"?(?: Commands?)?)`,
      pursuit:`(?:\\{?Pursuit\\}?|Pursuit Commands?)`,
      command:`Command Cards?`
    };
    const required=[];
    for(const [scope,token] of Object.entries(scopePatterns)){
      const re=new RegExp(`(?:${token}[^.;]{0,80}${metric}|${metric}[^.;]{0,80}${token})`,'i');
      if(re.test(compact))required.push(scope);
    }
    if(!required.length)return true;
    return required.some(scope=>currentScopes[scope]);
  }
  function numericBonusesFromText(text,allowConditional=false){
    const out={base:0,power:0,critRate:0,critDamage:0,vulnerability:0,final:0,realmMastery:0,aliemusRegen:0,keyflareRegen:0,sigilYield:0,deathResistance:0,poisonInfliction:0,fixedPoisonInfliction:0,poisonTrigger:0,counterGeneration:0,skipped:[]};
    const normalized=String(text||'').replace(/Crit\./gi,'Crit').replace(/Temp\./gi,'Temporary');
    for(const raw of normalized.split(/(?<=[.!?。；;])\s+(?=(?:[\"“{(]?[A-Z0-9]|[\u3400-\u9fff]))/)){
      const s=raw.trim();if(!s)continue;if(isConditional(s)&&!allowConditional){out.skipped.push(s);continue}
      let m;
      const genericPoisonCounter=s.match(/Base DMG\s*,\s*Poison\s*,\s*and\s*Counter\s*\+\s*([\d.]+)%/i);
      if(genericPoisonCounter){
        const value=num(genericPoisonCounter[1]);
        out.poisonInfliction+=value;
        out.counterGeneration+=value;
      }
      const paired=s.match(/\+\s*([\d.]+)%\s*Base DMG\s+and\s+Crit\.?\s*DMG/i);
      if(paired){
        if(bonusScopeAllows(s,'base'))out.base+=num(paired[1]);
        if(bonusScopeAllows(s,'critDamage'))out.critDamage+=num(paired[1]);
      }
      if((m=s.match(/Base DMG[^+%]*\+\s*([\d.]+)%/i))&&bonusScopeAllows(s,'base'))out.base+=num(m[1]);
      if((m=s.match(/(?:Damage Amplification|DMG Amplification|DMG Amp)[^+%]*\+\s*([\d.]+)%/i)))out.power+=num(m[1]);
      if((m=s.match(/Crit\.? Rate[^+%]*\+\s*([\d.]+)%/i))&&bonusScopeAllows(s,'critRate'))out.critRate+=num(m[1]);
      if((m=s.match(/Crit\.? DMG[^+%]*\+\s*([\d.]+)%/i))&&bonusScopeAllows(s,'critDamage'))out.critDamage+=num(m[1]);
      if((m=s.match(/Vulnerab(?:le|ility)[^+%]*\+\s*([\d.]+)%/i)))out.vulnerability+=num(m[1]);
      if((m=s.match(/Final DMG[^+%]*\+\s*([\d.]+)%/i))&&bonusScopeAllows(s,'final'))out.final+=num(m[1]);
      if((m=s.match(/Realm Mastery[^+\d]*\+\s*([\d.]+)/i)))out.realmMastery+=num(m[1]);
      if((m=s.match(/Aliemus Regen(?: Lv\.)?[^+\d]*\+\s*([\d.]+)/i)))out.aliemusRegen+=num(m[1]);
      if((m=s.match(/Keyflare Regen(?: Lv\.)?[^+\d]*\+\s*([\d.]+)/i)))out.keyflareRegen+=num(m[1]);
      if((m=s.match(/Sigil Yield[^+\d]*\+\s*([\d.]+)%?/i)))out.sigilYield+=num(m[1]);
      if((m=s.match(/Death Resistance[^+\d]*\+\s*([\d.]+)%?/i)))out.deathResistance+=num(m[1]);
      if((m=s.match(/Fixed\s+Poison\s+Infliction[^+%]*\+\s*([\d.]+)%/i)))out.fixedPoisonInfliction+=num(m[1]);
      else if((m=s.match(/Poison\s+Infliction[^+%]*\+\s*([\d.]+)%/i)))out.poisonInfliction+=num(m[1]);
      if((m=s.match(/Poison\s+Trigger[^+%]*\+\s*([\d.]+)%/i)))out.poisonTrigger+=num(m[1]);
      if((m=s.match(/Counter\s+Generation[^+%]*\+\s*([\d.]+)%/i)))out.counterGeneration+=num(m[1]);
      const both=s.match(/Crit\.? Rate and Crit\.? DMG(?: increase)? by\s*([\d.]+)%/i);if(both){if(bonusScopeAllows(s,'critRate'))out.critRate+=num(both[1]);if(bonusScopeAllows(s,'critDamage'))out.critDamage+=num(both[1])}
    }
    return out;
  }
  const DAMAGE_SCOPE_KEYS=['awakener','skill','strike','command','exalt','pursuit','defense'];
  function emptyScopedDamageLayers(){
    const make=()=>Object.fromEntries(DAMAGE_SCOPE_KEYS.map(key=>[key,0]));
    return {base:make(),final:make()};
  }
  function mergeScopedDamageLayers(target,source){
    for(const metric of ['base','final'])for(const scope of DAMAGE_SCOPE_KEYS)target[metric][scope]+=num(source?.[metric]?.[scope],0);
    return target;
  }
  function emptyBaseDamagePhases(){
    const make=()=>Object.fromEntries(DAMAGE_SCOPE_KEYS.map(key=>[key,0]));
    return {
      outOfBattle:{total:0,scoped:make()},
      inBattle:{total:0,scoped:make()}
    };
  }
  function isInBattleBaseDamageSentence(sentence){
    const s=String(sentence||'');
    return /\b(?:at\s+(?:the\s+)?(?:start|end)\s+of\s+(?:the\s+)?(?:battle|turn)|at\s+battle\s+start|during\s+(?:this|the)\s+(?:battle|turn)|(?:for\s+)?the\s+rest\s+of\s+(?:this|the)\s+battle|this\s+(?:battle|turn)|temporar(?:y|ily)|whenever|when|after|before|upon|each\s+time|every\s+time|for\s+each|per\s+(?:stack|use|card|kill|enemy)|stacks?|kills?|played|used|consum(?:e|ed|ing)|trigger(?:ed|s)?|switching\s+to)\b/i.test(s);
  }
  function addBaseDamagePhasesFromText(target,text,allowConditional=false,forcedPhase=null,multiplier=1){
    const normalized=String(text||'').replace(/Crit\./gi,'Crit').replace(/Temp\./gi,'Temporary');
    for(const raw of normalized.split(/(?<=[.!?。；;])\s+(?=(?:[\"“{(]?[A-Z0-9]|[\u3400-\u9fff]))/)){
      const s=raw.trim();if(!s)continue;
      if(isConditional(s)&&!allowConditional)continue;
      const bonus=numericBonusesFromText(s,allowConditional);
      const scoped=scopedDamageLayersFromText(s,allowConditional);
      const scopedTotal=DAMAGE_SCOPE_KEYS.reduce((sum,key)=>sum+num(scoped?.base?.[key],0),0);
      if(Math.abs(num(bonus.base))<1e-9&&Math.abs(scopedTotal)<1e-9)continue;
      const phase=forcedPhase|| (isInBattleBaseDamageSentence(s)?'inBattle':'outOfBattle');
      target[phase].total+=num(bonus.base)*multiplier;
      for(const scope of DAMAGE_SCOPE_KEYS)target[phase].scoped[scope]+=num(scoped?.base?.[scope],0)*multiplier;
    }
    return target;
  }
  function currentSkillNamedInSentence(sentence){
    const text=String(sentence||''),lower=text.toLowerCase();
    const names=[currentSkill?.name,currentSkill?.overExaltBaseSkillName].filter(Boolean).map(x=>String(x).toLowerCase());
    for(const name of names){
      if(lower.includes('{'+name+'}')||lower.includes('{derived:'+name+'}'))return true;
      if(lower.includes('base dmg of '+name)||lower.includes('final dmg of '+name))return true;
    }
    const owner=String(currentAwakener?.name||'').toLowerCase();
    if(owner&&names.some(name=>lower.includes(owner+"'s "+name)||lower.includes(owner+'’s '+name)))return true;
    return /(?:this card|this skill)[^.;]{0,80}(?:Base|Final) DMG|(?:Base|Final) DMG[^.;]{0,80}(?:this card|this skill)/i.test(text);
  }
  function scopedDamageLayersFromText(text,allowConditional=false){
    const out=emptyScopedDamageLayers();
    const normalized=String(text||'').replace(/Crit\./gi,'Crit').replace(/Temp\./gi,'Temporary');
    for(const raw of normalized.split(/(?<=[.!?。；;])\s+(?=(?:[\"“{(]?[A-Z0-9]|[\u3400-\u9fff]))/)){
      const s=raw.trim();if(!s)continue;
      if(isConditional(s)&&!allowConditional)continue;
      const scopes=[];
      const lower=s.toLowerCase(),owner=String(currentAwakener?.name||'').toLowerCase();
      if(currentSkillNamedInSentence(s))scopes.push('skill');
      else{
        if((lower.includes("this awakener's")||(owner&&(lower.includes(owner+"'s")||lower.includes(owner+'’s'))))&&/(?:Base|Final) DMG/i.test(s))scopes.push('awakener');
        if(/(?:["“]?Strike["”]?(?: Commands?)?[^.;]{0,90}(?:Base|Final) DMG|(?:Base|Final) DMG[^.;]{0,90}["“]?Strike["”]?)/i.test(s)&&skillMatchesScope(currentSkill,'strike'))scopes.push('strike');
        if(/(?:Command Cards?[^.;]{0,90}(?:Base|Final) DMG|(?:Base|Final) DMG[^.;]{0,90}Command Cards?)/i.test(s)&&skillMatchesScope(currentSkill,'command'))scopes.push('command');
        if(/(?:Exalt(?:['’]s)?[^.;]{0,90}(?:Base|Final) DMG|(?:Base|Final) DMG[^.;]{0,90}Exalt)/i.test(s)&&skillMatchesScope(currentSkill,'exalt'))scopes.push('exalt');
        if(/(?:Pursuit(?: Commands?)?[^.;]{0,90}(?:Base|Final) DMG|(?:Base|Final) DMG[^.;]{0,90}Pursuit)/i.test(s)&&skillMatchesScope(currentSkill,'pursuit'))scopes.push('pursuit');
        if(/(?:["“]?Defense["”]?(?: Commands?)?[^.;]{0,90}(?:Base|Final) DMG|(?:Base|Final) DMG[^.;]{0,90}["“]?Defense["”]?)/i.test(s)&&skillMatchesScope(currentSkill,'defense'))scopes.push('defense');
      }
      if(!scopes.length)continue;
      let m=s.match(/Base DMG[^+%]{0,100}\+\s*([\d.]+)%/i)||s.match(/\+\s*([\d.]+)%\s*Base DMG/i);
      if(m)for(const scope of new Set(scopes))out.base[scope]+=num(m[1],0);
      m=s.match(/Final DMG[^+%]{0,100}\+\s*([\d.]+)%/i)||s.match(/\+\s*([\d.]+)%\s*Final DMG/i);
      if(m)for(const scope of new Set(scopes))out.final[scope]+=num(m[1],0);
    }
    return out;
  }
  function sumBonus(target,b){for(const k of ['base','power','critRate','critDamage','vulnerability','final','realmMastery','aliemusRegen','keyflareRegen','sigilYield','deathResistance','poisonInfliction','fixedPoisonInfliction','poisonTrigger','counterGeneration'])target[k]+=num(b[k])}
  function wheelDescriptionRaw(rec,slot){if(!rec)return '';const stage=Math.min(15,Math.max(0,Number($(`fateLevel${slot+1}`)?.value)||0));return renderTemplate(rec,Math.min(4,stage+1),{wheelRefinementLevel:Math.min(3,stage)})}
  function applyWheelDirectSkillEffects(events){
    let mapped=(events||[]).map(event=>({...event}));
    const notes=[];
    const prepend=[],append=[];
    currentWheels.forEach((wheel,slotIndex)=>{
      if(!wheel)return;
      const raw=String(wheelDescriptionRaw(wheel,slotIndex)||'').replace(/\s+/g,' ');
      const wheelName=labelForWheel(wheel);
      let m;
      // Direct per-card poison is deterministic for the selected card and can be represented
      // without assuming prior turns/stacks. This also works for Derived cards that count as Strike/Defense.
      const scopedPoison=raw.match(/["“]?(Strike|Defense)["”]?\s*s?\s+inflicts?\s+\{?Poison\}?\s+equal to\s+([\d.]+)%\s+of\s+(?:(?:the\s+wielder['’]s)|their)\s+(ATK|DEF)/i);
      if(scopedPoison){
        const scope=scopedPoison[1].toLowerCase();
        if(skillMatchesScope(currentSkill,scope)){
          const percent=num(scopedPoison[2]),stat=String(scopedPoison[3]).toUpperCase();
          append.push({id:`wheel-${wheel.id}-poison`,index:0,position:9998,type:'poison',action:'apply',source:'wheel',basis:'statPercent',stat,percent,activeSource:false,resourceEffectLabel:`命轮「${wheelName}」：${scope==='strike'?'打击':'防御'}附加中毒`});
          notes.push(`命轮「${wheelName}」：当前${scope==='strike'?'打击':'防御'}附加 ${stat} × ${percent}% 中毒`);
        }
      }
      // Gift-of-Decay style "first Poison, then resolve Exalt" must precede the Exalt's own events,
      // so an Exalt that triggers Poison sees the newly applied stacks.
      m=raw.match(/As part of (?:the )?wielder['’]s Exalt,\s*first inflict\s+\{?Poison\}?\s+equal to\s+([\d.]+)%\s+of\s+(?:the )?wielder['’]s\s+(ATK|DEF)/i);
      if(m&&skillMatchesScope(currentSkill,'exalt')){
        const percent=num(m[1]),stat=String(m[2]).toUpperCase();
        prepend.push({id:`wheel-${wheel.id}-pre-exalt-poison`,index:0,position:-9998,type:'poison',action:'apply',source:'wheel',basis:'statPercent',stat,percent,activeSource:false,resourceEffectLabel:`命轮「${wheelName}」：狂气爆发前置中毒`});
        notes.push(`命轮「${wheelName}」：狂气爆发前先施加 ${stat} × ${percent}% 中毒`);
      }
      // Some Wheels add a flat ATK-derived component to every Active-DMG event.
      m=raw.match(/Active DMG\s*\+\s*(?:an\s+amount\s+)?equal to\s+(?:the )?wielder['’]s\s+ATK\s*[×x*]\s*([\d.]+)%/i);
      if(m){
        const percent=num(m[1]);
        mapped=mapped.map(event=>event.type==='active'?{...event,resourceFlatAtkPercent:(Number(event.resourceFlatAtkPercent)||0)+percent,resourceEffectLabel:[event.resourceEffectLabel,`命轮「${wheelName}」：主动伤害额外 +ATK×${percent}%`].filter(Boolean).join('；')}:event);
        notes.push(`命轮「${wheelName}」：每个主动伤害事件额外增加 ATK × ${percent}%`);
      }
    });
    if(prepend.length||append.length){
      mapped=[...prepend,...mapped,...append].map((event,index)=>({...event,index}));
    }
    return {events:mapped,notes};
  }
  function wheelDescription(rec,slot){return zhText(wheelDescriptionRaw(rec,slot))}
  function wheelDescriptionRich(rec,slot){if(!rec)return '';const stage=Math.min(15,Math.max(0,Number($(`fateLevel${slot+1}`)?.value)||0));return renderRichRecord(rec,Math.min(4,stage+1),{wheelRefinementLevel:Math.min(3,stage)})}
  function renderWheelsAndBonuses(){
    const texts=currentWheels.map((w,i)=>w?`<strong>${escape(labelForWheel(w))}</strong>${isEnglish()?': ':'：'}${wheelDescriptionRich(w,i)}`:'').filter(Boolean);
    if($('fateDesc'))$('fateDesc').innerHTML=texts.length?texts.join('<br><br>'):ui('可装备两个不同命轮。主属性按 SKeyDB 成长表读取；可可靠解析的基础伤害、伤害强效、暴击、界域精通与状态倍率自动计入；条件型效果在未确认触发时只展示、不强算。','Equip up to two different Wheels. Main stats use the SKeyDB growth table; reliably parsed Base DMG, Damage Amplification, Crit, Realm Mastery, and state multipliers are applied automatically. Conditional effects are shown but not forced when their trigger is unconfirmed.');
    recomputeGearBonuses();refreshBattleProgressionUi();
  }

  async function loadCovenant(){const id=$('contractSelect')?.value;currentCovenant=id?await fetchRecord('covenants',id):null;renderCovenantAndBonuses();updateSkillLevel()}
  function renderEffectRaw(effect){return renderTemplate(effect,1)}
  function renderEffect(effect){return zhText(renderEffectRaw(effect))}
  function renderCovenantAndBonuses(){
    if(!currentCovenant){
      if($('contractDesc'))$('contractDesc').textContent=ui('选择密契后默认按完整 6 件套读取：无条件效果直接计入；需要敌人生命区间、特定状态、回合时点等额外条件的效果，只有勾选“额外条件已满足”后才尝试解析。','A selected Covenant is treated as a complete 6-piece set by default. Unconditional effects are applied directly; effects requiring enemy HP ranges, states, or turn timing are parsed only after the additional-condition toggle is enabled.');
      recomputeGearBonuses();return
    }
    const lines=(currentCovenant.setEffects||[]).map(e=>`<strong>${e.set} ${ui('件','pieces')}:</strong> ${renderRichRecord(e,1)}`);
    if($('contractDesc'))$('contractDesc').innerHTML=`<strong>${escape(isEnglish()?currentCovenant.name:(zhCovenants[currentCovenant.name]||currentCovenant.name))}</strong><br>${lines.join('<br>')}`;
    recomputeGearBonuses();
  }
  function ensureSignatureRelicUi(){
    let panel=$('signatureRelicPanel');
    if(!panel){
      panel=document.createElement('div');
      panel.id='signatureRelicPanel';
      panel.className='signatureRelicPanel';
      panel.innerHTML='<div class="signatureRelicHead"><strong>维度影像 / 专属造物</strong><span id="signatureRelicStatus">正在匹配…</span></div><label class="check signatureRelicToggle"><input id="signatureRelicEnabled" type="checkbox"><span>启用当前角色维度影像<small>每个唤醒体会自动匹配自己的维度影像。勾选后，可可靠解析且满足条件的属性、伤害、段数和力量效果会进入伤害计算。</small></span></label><div class="desc" id="signatureRelicDesc">正在匹配当前角色的维度影像……</div><div class="signatureRelicApplied" id="signatureRelicApplied">未启用，不计入伤害。</div>';
    }
    const charSelect=$('charSelect');
    const characterBlock=charSelect?.closest('.calcSectionCharacter')||charSelect?.closest('.builderBlock');
    const charGrid=charSelect?.closest('.formGrid');
    if(characterBlock&&charGrid&&characterBlock.contains(charGrid)){
      if(panel.parentElement!==characterBlock||panel.previousElementSibling!==charGrid)charGrid.insertAdjacentElement('afterend',panel);
    }else if(characterBlock&&!characterBlock.contains(panel)){
      characterBlock.insertAdjacentElement('afterbegin',panel);
    }
    return panel;
  }
  function signatureRelicCompactFor(awakenerId){
    return relicCatalog.find(x=>x?.ownerAwakenerId===awakenerId&&x?.relicType==='Dimensional Image')||null;
  }
  function signatureRelicEnabled(){return $('signatureRelicEnabled')?.checked===true&&!!currentSignatureRelic}
  function signatureRelicRaw(){return currentSignatureRelic?renderTemplate(currentSignatureRelic,1):''}
  function signatureArgValue(key){
    const clean=String(key||'').replace(/^.*:/,'');
    const value=argValue(currentSignatureRelic?.descriptionArgs?.[clean],1);
    return Number.isFinite(Number(value))?Number(value):0;
  }
  function signatureRelicSafeGlobalBonuses(){
    const bonus={base:0,power:0,critRate:0,critDamage:0,vulnerability:0,final:0,realmMastery:0,aliemusRegen:0,keyflareRegen:0,sigilYield:0,deathResistance:0,poisonInfliction:0,fixedPoisonInfliction:0,poisonTrigger:0,counterGeneration:0};
    let strengthFlat=0;
    if(!signatureRelicEnabled())return {bonus,strengthFlat};
    const rendered=signatureRelicRaw();
    sumBonus(bonus,numericBonusesFromText(rendered,false));
    const scoped= scopedDamageLayersFromText(rendered,false);
    bonus.base-=DAMAGE_SCOPE_KEYS.reduce((sum,key)=>sum+num(scoped.base?.[key],0),0);
    bonus.final-=DAMAGE_SCOPE_KEYS.reduce((sum,key)=>sum+num(scoped.final?.[key],0),0);
    const normalized=rendered.replace(/Crit\./gi,'Crit');
    for(const sentence of normalized.split(/(?<=[!?])\s+|\.\s+(?=(?:At|The|When|Whenever|After|Before|For|Each|If|Drawing|Playing|Place|Gain)\b)/)){
      const line=sentence.trim();if(!line)continue;
      const turnStart=/^At (?:the )?(?:turn start|start of (?:the )?turn)/i.test(line);
      if(turnStart&&!/\b(?:if|when|whenever|after|before|once|every|each|until)\b/i.test(line)){
        // A turn-start buff is already active in the state represented by this calculator.
        sumBonus(bonus,numericBonusesFromText(line,true));
        const str=line.match(/(?:gains?|and|,)\s+([\d.]+)\s+(?:Temporary\s+)?STR\b/i);
        if(str)strengthFlat+=num(str[1]);
      }
    }
    if(currentAwakener?.id==='awakener-0001'&&currentSignatureRelic?.id==='relic-0001'){
      const persona=String(characterResourceValues().personaState||'depressed');
      if(persona==='manic'){
        const personaCrit=Math.max(0,signatureArgValue('Arg2'));
        bonus.critRate+=personaCrit;
        bonus.critDamage+=personaCrit;
      }
    }
    return {bonus,strengthFlat};
  }
  function signatureRelicSkillMods(){
    const out={baseDamagePct:0,finalDamagePct:0,extraDamageCount:0,strengthMultiplierBonus:0,notes:[]};
    if(!signatureRelicEnabled()||!currentSignatureRelic||!currentSkill)return out;
    const raw=String(currentSignatureRelic.descriptionTemplate||'');
    const skillName=String(currentSkill.overExaltBaseSkillName||currentSkill.name||'').toLowerCase();
    const slot=String(currentSkill.slot||'').toLowerCase();
    const referencesSkill=fragment=>{
      const refs=[...String(fragment||'').matchAll(/\{([^}]+)\}/g)].map(m=>String(m[1]).replace(/^(?:derived|overlay):/i,'').toLowerCase());
      if(skillName&&refs.some(x=>x===skillName||skillName.includes(x)||x.includes(skillName)))return true;
      if(skillMatchesScope(currentSkill,'strike')&&/["“]Strike["”]/i.test(fragment))return true;
      if(skillMatchesScope(currentSkill,'defense')&&/["“]Defense["”]/i.test(fragment))return true;
      if(skillMatchesScope(currentSkill,'exalt')&&/\bExalt\b/i.test(fragment))return true;
      if(skillMatchesScope(currentSkill,'pursuit')&&/\bPursuit\b/i.test(fragment))return true;
      if(skillMatchesScope(currentSkill,'command')&&/Command Cards?/i.test(fragment))return true;
      return false;
    };
    const conditional=/\b(?:if|when|whenever|after|before|every|each|first|second|third|once|within|stack(?:s|ing)?|trigger(?:s|ed|ing)?|accumulat(?:e|es|ed|ing)|consume(?:s|d|ing)|loses?|deals?\s+DMG\s+\[)\b/i;
    const clauses=raw.split(/(?<=[.!?])\s+|;\s*|,\s+and\s+(?=(?:after|when|if|whenever)\b)/i);
    for(const clause of clauses){
      if(!referencesSkill(clause)||conditional.test(clause))continue;
      let m=clause.match(/Base DMG[^+%]*\+\s*\[([^\]]+)\]%/i);
      if(m){const value=signatureArgValue(m[1]);if(value>0){out.baseDamagePct+=value;out.notes.push(`专造：该技能基础伤害 +${value}%`)}}
      m=clause.match(/Final DMG[^+%]*\+\s*\[([^\]]+)\]%/i);
      if(m){const value=signatureArgValue(m[1]);if(value>0){out.finalDamagePct+=value;out.notes.push(`专造：该技能最终伤害 +${value}%`)}}
      m=clause.match(/(?:Base\s+)?DMG count(?:[^+\d]*)\+\s*(?:\[([^\]]+)\]|([\d.]+))/i);
      if(m){const value=m[1]?signatureArgValue(m[1]):num(m[2]);if(value>0){out.extraDamageCount+=Math.floor(value);out.notes.push(`专造：该技能基础伤害段数 +${Math.floor(value)}`)}}
      m=clause.match(/(?:additional(?:ly)?\s+(?:receive\s+)?)?(?:a\s+)?(?:\[([^\]]+)\]|([\d.]+))x\s+\{?STR\}?\s+bonus/i);
      if(m){const value=m[1]?signatureArgValue(m[1]):num(m[2]);if(value>0){out.strengthMultiplierBonus+=value;out.notes.push(`专造：该技能额外 +${value}× 力量加成`)}}
    }
    // Some records name the skill before a comma and put a direct DMG-count modifier in the same unconditional clause.
    if(out.extraDamageCount===0){
      const direct=raw.match(/(?:DMG count of\s+\{([^}]+)\}|\{([^}]+)\}[^.]{0,90}(?:Base\s+)?DMG count(?:\s+is)?)\s*[^.]{0,20}\+\s*(?:\[([^\]]+)\]|([\d.]+))/i);
      if(direct){
        const ref=String(direct[1]||direct[2]||'').replace(/^(?:derived|overlay):/i,'').toLowerCase();
        const prefix=raw.slice(Math.max(0,direct.index-70),direct.index+direct[0].length);
        if((ref===skillName||skillName.includes(ref)||ref.includes(skillName))&&!conditional.test(prefix)){
          const value=direct[3]?signatureArgValue(direct[3]):num(direct[4]);
          if(value>0){out.extraDamageCount=Math.floor(value);out.notes.push(`专造：该技能基础伤害段数 +${Math.floor(value)}`)}
        }
      }
    }
    return out;
  }
  function applySignatureRelicSkillMods(events){
    const mods=signatureRelicSkillMods();
    let next=(events||[]).map(event=>{
      if(!['active','pierce'].includes(event?.type))return event;
      const defaultStrength=event.type==='active'?1:(event.usesStrength===true?1:0);
      return {...event,
        skillBaseDamageBonusPct:num(event.skillBaseDamageBonusPct)+mods.baseDamagePct,
        skillFinalDamageBonusPct:num(event.skillFinalDamageBonusPct)+mods.finalDamagePct,
        strengthMultiplier:(Number.isFinite(Number(event.strengthMultiplier))?Number(event.strengthMultiplier):defaultStrength)+mods.strengthMultiplierBonus
      };
    });
    if(mods.extraDamageCount>0){
      const directIndexes=next.map((event,index)=>['active','pierce'].includes(event?.type)?index:-1).filter(index=>index>=0);
      if(directIndexes.length===1){
        const index=directIndexes[0],source=next[index],copies=[];
        for(let i=0;i<Math.min(20,mods.extraDamageCount);i++)copies.push({...source,id:String(source.id||'signature-hit')+`-signature-${i+1}`,signatureRelicExtraHit:true});
        next.splice(index+1,0,...copies);
      }else if(directIndexes.length!==1){
        mods.notes.push('专造伤害段数存在多个基础伤害事件，未自动扩段以避免套错伤害公式');
      }
    }
    return {events:next,mods};
  }
  function renderSignatureRelic(){
    const box=$('signatureRelicDesc'),toggle=$('signatureRelicEnabled'),status=$('signatureRelicStatus'),applied=$('signatureRelicApplied');
    if(toggle)toggle.disabled=!currentSignatureRelic;
    if(!currentSignatureRelic){
      window.MorimensSignatureRelic={enabled:false,record:null,text:'',skillMods:null};
      if(status)status.textContent=ui('未匹配','No match');
      if(box)box.textContent=ui('当前角色在本地 SKeyDB 中没有匹配到维度影像。','No Dimensional Image is matched to this Awakener in the local SKeyDB snapshot.');
      if(applied){applied.classList.remove('isActive');applied.textContent=ui('未启用，不计入伤害。','Disabled; not included in damage.')}
      return;
    }
    const enabled=signatureRelicEnabled(),skillMods=signatureRelicSkillMods(),relicRawName=currentSignatureRelic.name||'Dimensional Image';
    const relicDisplayName=isEnglish()?relicRawName:'当前角色维度影像';
    if(status)status.textContent=(enabled?ui('已启用 · ','Enabled · '):ui('已匹配 · ','Matched · '))+relicRawName;
    if(box)box.innerHTML=`<strong>${enabled?ui('已装备','Equipped'):ui('未装备','Not equipped')} · ${escape(relicDisplayName)}</strong>${isEnglish()?': ':'：'}${renderRichRecord(currentSignatureRelic,1)}<br><small>${ui('无条件且可可靠解析的伤害/属性修正会自动计入；第 N 次使用、目标状态、累计触发等条件型效果仅展示，不会因为勾选“启用”就常驻生效。','Unconditional, reliably parsed damage/stat modifiers are applied automatically. Conditional effects such as Nth use, target state, or accumulated triggers are displayed from the source but are not made permanent merely by enabling the item.')}</small>`;
    if(applied){
      applied.classList.toggle('isActive',enabled);
      if(!enabled)applied.textContent=ui('未启用，不计入伤害。','Disabled; not included in damage.');
      else{
        const safe=signatureRelicSafeGlobalBonuses();
        const labels=isEnglish()
          ?{base:'Base DMG',power:'Damage Amplification',critRate:'Crit Rate',critDamage:'Crit DMG',vulnerability:'Vulnerability',final:'Final DMG',realmMastery:'Realm Mastery',aliemusRegen:'Aliemus Regen',keyflareRegen:'Keyflare Regen',sigilYield:'Sigil Yield',deathResistance:'Death Resistance',poisonInfliction:'Poison Infliction',fixedPoisonInfliction:'Fixed Poison Infliction',poisonTrigger:'Poison Trigger',counterGeneration:'Counter Generation'}
          :{base:'基础伤害',power:'伤害强效',critRate:'暴击率',critDamage:'暴击伤害',vulnerability:'易伤',final:'最终伤害',realmMastery:'界域精通',aliemusRegen:'狂气回充',keyflareRegen:'银钥充能',sigilYield:'黑印掉落',deathResistance:'死亡抵抗',poisonInfliction:'中毒施加',fixedPoisonInfliction:'固定中毒施加',poisonTrigger:'中毒触发',counterGeneration:'反击生成'};
        const parts=[];
        for(const [key,label] of Object.entries(labels)){const value=Number(safe.bonus?.[key])||0;if(Math.abs(value)>1e-9)parts.push(label+' +'+Number(value.toFixed(2))+(key==='realmMastery'||key==='aliemusRegen'||key==='keyflareRegen'?'':'%'))}
        if(Number(safe.strengthFlat)>0)parts.push((isEnglish()?'Turn-start STR +':'回合开始力量 +')+Number(Number(safe.strengthFlat).toFixed(2)));
        if(skillMods.notes.length)parts.push(...skillMods.notes);
        applied.textContent=parts.length
          ?ui('已计入：','Applied: ')+parts.join(isEnglish()?'; ':'；')
          :ui('已启用。当前维度影像对所选技能没有可直接安全计入的伤害项；条件型效果不会自动强算。','Enabled. This Dimensional Image has no damage modifier that can be safely applied directly to the selected skill; conditional effects are not forced.');
      }
    }
    window.MorimensSignatureRelic={enabled,record:currentSignatureRelic,text:signatureRelicRaw(),skillMods};
  }
  async function loadSignatureRelic(reset=false){
    const compact=signatureRelicCompactFor(currentAwakener?.id);
    currentSignatureRelic=compact?await fetchRecord('relics',compact.id).catch(()=>compact):null;
    if(reset&&$('signatureRelicEnabled'))$('signatureRelicEnabled').checked=false;
    renderSignatureRelic();
  }
  const wheelMainstatLabels={CRIT_RATE:'暴击率',CRIT_DMG:'暴击伤害',REALM_MASTERY:'界域精通',DMG_AMP:'伤害强效',ALIEMUS_REGEN:'狂气回充等级',KEYFLARE_REGEN:'银钥充能等级',SIGIL_YIELD:'黑印掉落',DEATH_RESISTANCE:'死亡抵抗'};
  function wheelMainstatValue(rec,slot){
    const source=gameplayMathMeta?.wheelMainstatScaling;if(!rec||!source)return null;
    const seriesKey=rec.mainstatSeriesKey||`${rec.rarity}:${rec.mainstatKey}`;
    const series=(source.series||[]).find(x=>x.seriesKey===seriesKey);if(!series)return null;
    const scalar=v=>num(String(v??'').replace('%',''),0);
    const level=Math.max(0,Math.min(15,Math.floor(num($(`fateLevel${slot+1}`)?.value,0))));
    const growthSteps=Math.max(0,level-Math.max(0,Math.floor(num(source.growthStartLevel,4)))+1);
    return {key:rec.mainstatKey,value:scalar(series.baseValue)+scalar(series.perLevel)*growthSteps,level,seriesKey};
  }
  function applyGearRealmMastery(nextValue){
    const el=$('realmMastery');nextValue=num(nextValue,0);
    if(!el){gearRealmMasteryAuto=nextValue;return}
    applyingAuto=true;
    const shown=num(el.value);
    el.value=String(Math.round((shown-gearRealmMasteryAuto+nextValue)*1000)/1000);
    applyingAuto=false;
    gearRealmMasteryAuto=nextValue;
  }
  function recomputeGearBonuses(){
    const next={base:0,power:0,critRate:0,critDamage:0,vulnerability:0,final:0,realmMastery:0,aliemusRegen:0,keyflareRegen:0,sigilYield:0,deathResistance:0,poisonInfliction:0,fixedPoisonInfliction:0,poisonTrigger:0,counterGeneration:0};
    const scopedLayers=emptyScopedDamageLayers();
    const baseDamagePhases=emptyBaseDamagePhases();
    let nextRealmMastery=0;wheelMainstatSummary=[];
    currentWheels.forEach((w,i)=>{
      if(!w)return;
      const wheelText=wheelDescriptionRaw(w,i);
      sumBonus(next,numericBonusesFromText(wheelText,false));
      mergeScopedDamageLayers(scopedLayers,scopedDamageLayersFromText(wheelText,false));
      addBaseDamagePhasesFromText(baseDamagePhases,wheelText,false);
      const battleBonus=cumulativeWheelBattleBonuses(wheelText);
      if(completedBattles()>0&&hasNumericBattleBonus(battleBonus)){
        const times=completedBattles();
        const scaledBattle=scaledBattleBonuses(battleBonus,times);
        const scaledScoped=scaledScopedDamageLayers(cumulativeWheelBattleScopedLayers(wheelText),times);
        sumBonus(next,scaledBattle);
        mergeScopedDamageLayers(scopedLayers,scaledScoped);
        baseDamagePhases.inBattle.total+=num(scaledBattle.base);
        for(const scope of DAMAGE_SCOPE_KEYS)baseDamagePhases.inBattle.scoped[scope]+=num(scaledScoped?.base?.[scope],0);
      }
      const main=wheelMainstatValue(w,i);
      if(main){
        wheelMainstatSummary.push({wheel:w,...main});
        if(main.key==='CRIT_RATE')next.critRate+=main.value;
        else if(main.key==='CRIT_DMG')next.critDamage+=main.value;
        else if(main.key==='DMG_AMP')next.power+=main.value;
        else if(main.key==='REALM_MASTERY')nextRealmMastery+=main.value;
        else if(main.key==='ALIEMUS_REGEN')next.aliemusRegen+=main.value;
        else if(main.key==='KEYFLARE_REGEN')next.keyflareRegen+=main.value;
        else if(main.key==='SIGIL_YIELD')next.sigilYield+=main.value;
        else if(main.key==='DEATH_RESISTANCE')next.deathResistance+=main.value;
      }
    });
    if(currentCovenant){
      const allow=$('contractConditional')?.checked===true;
      for(const e of currentCovenant.setEffects||[]){
        if(Number(e.set)<=6){
          const raw=renderEffectRaw(e);
          sumBonus(next,numericBonusesFromText(raw,allow));
          mergeScopedDamageLayers(scopedLayers,scopedDamageLayersFromText(raw,allow));
          addBaseDamagePhasesFromText(baseDamagePhases,raw,allow);
        }
      }
    }
    const signatureSafe=signatureRelicSafeGlobalBonuses();
    if(signatureRelicEnabled()){
      sumBonus(next,signatureSafe.bonus);
      const rendered=signatureRelicRaw();
      addBaseDamagePhasesFromText(baseDamagePhases,rendered,false);
      const normalized=String(rendered||'').replace(/Crit\./gi,'Crit').replace(/Temp\./gi,'Temporary');
      for(const sentence of normalized.split(/(?<=[!?])\s+|\.\s+(?=(?:At|The|When|Whenever|After|Before|For|Each|If|Drawing|Playing|Place|Gain)\b)/)){
        const line=sentence.trim();if(!line)continue;
        const turnStart=/^At (?:the )?(?:turn start|start of (?:the )?turn)/i.test(line);
        if(turnStart&&!/\b(?:if|when|whenever|after|before|once|every|each|until)\b/i.test(line))addBaseDamagePhasesFromText(baseDamagePhases,line,true,'inBattle');
      }
    }
    Object.assign(auto,next);
    applyAutoBonuses();
    applyGearRealmMastery(nextRealmMastery+next.realmMastery);
    window.MorimensGearEffects={
      poisonInflictionPct:auto.poisonInfliction,
      fixedPoisonInflictionPct:auto.fixedPoisonInfliction,
      poisonTriggerPct:auto.poisonTrigger,
      counterGenerationPct:auto.counterGeneration,
      aliemusRegen:auto.aliemusRegen,
      keyflareRegen:auto.keyflareRegen,
      sigilYield:auto.sigilYield,
      deathResistance:auto.deathResistance,
      realmMastery:auto.realmMastery,
      signatureStrengthFlat:signatureSafe.strengthFlat,
      signatureRelicEnabled:signatureRelicEnabled(),
      signatureRelicId:currentSignatureRelic?.id||null,
      scopedDamageLayers:scopedLayers,
      baseDamagePhases,
      damageScopeKeys:[...DAMAGE_SCOPE_KEYS]
    };
    renderSignatureRelic();renderAutoSummary();
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
    const box=$('autoSummary');if(!box)return;
    const labels=isEnglish()
      ?[['power','Damage Amplification'],['critRate','Crit Rate'],['critDamage','Crit DMG'],['vulnerability','Vulnerability'],['final','Final DMG'],['realmMastery','Realm Mastery'],['aliemusRegen','Aliemus Regen Lv.'],['keyflareRegen','Keyflare Regen Lv.'],['sigilYield','Sigil Yield'],['deathResistance','Death Resistance'],['poisonInfliction','Poison Infliction'],['fixedPoisonInfliction','Fixed Poison Infliction'],['poisonTrigger','Poison Trigger'],['counterGeneration','Counter Generation']]
      :[['power','伤害强效'],['critRate','暴击率'],['critDamage','暴击伤害'],['vulnerability','易伤'],['final','最终伤害'],['realmMastery','界域精通'],['aliemusRegen','狂气回充等级'],['keyflareRegen','银钥充能等级'],['sigilYield','黑印掉落'],['deathResistance','死亡抵抗'],['poisonInfliction','中毒施加'],['fixedPoisonInfliction','固定中毒施加'],['poisonTrigger','中毒触发'],['counterGeneration','反击生成']];
    const percentKeys=new Set(['power','critRate','critDamage','vulnerability','final','sigilYield','deathResistance','poisonInfliction','fixedPoisonInfliction','poisonTrigger','counterGeneration']);
    const rows=labels.filter(([k])=>Math.abs(auto[k])>1e-9).map(([k,n])=>`<span class="chip">${n} +${auto[k].toFixed(2)}${percentKeys.has(k)?'%':''}</span>`);
    const phases=window.MorimensGearEffects?.baseDamagePhases||{},autoOut=num(phases.outOfBattle?.total),autoIn=num(phases.inBattle?.total);
    if(Math.abs(autoIn)>1e-9)rows.unshift(`<span class="chip">${ui('自动局内基础伤害','Auto In-Battle Base DMG')} +${autoIn.toFixed(2)}%</span>`);
    if(Math.abs(autoOut)>1e-9)rows.unshift(`<span class="chip">${ui('自动局外基础伤害','Auto Out-of-Battle Base DMG')} +${autoOut.toFixed(2)}%</span>`);
    const phaseSummary=$('basePhaseSummary');
    if(phaseSummary)phaseSummary.textContent=isEnglish()
      ?`Auto-detected: Out-of-Battle Base DMG +${autoOut.toFixed(2)}%, In-Battle Base DMG +${autoIn.toFixed(2)}%. Parsed permanent Wheel/Covenant effects do not need to be entered again; use the two fields above only for extra values.`
      :`已自动识别：局外基础伤害 +${autoOut.toFixed(2)}%，局内基础伤害 +${autoIn.toFixed(2)}%。命轮、密契等可解析的常驻效果无需重复填写；上方两个输入框只补充额外数值。`;
    for(const x of wheelMainstatSummary){
      const suffix=['CRIT_RATE','CRIT_DMG','DMG_AMP','SIGIL_YIELD','DEATH_RESISTANCE'].includes(x.key)?'%':'';
      rows.push(`<span class="chip">${escape(labelForWheel(x.wheel))} ${wheelEnhanceLabel(x.level)} · ${wheelMainstatLabels[x.key]||x.key} +${x.value.toFixed(2)}${suffix}</span>`);
    }
    rows.unshift(`<span class="chip">${ui('命轮','Wheels')} ${currentWheels.filter(Boolean).length}/2</span>`);
    if(currentCovenant)rows.push(`<span class="chip">${ui('密契 6 件套：','Covenant 6-piece: ')}${escape(isEnglish()?currentCovenant.name:(zhCovenants[currentCovenant.name]||currentCovenant.name))}${$('contractConditional')?.checked?ui(' · 额外条件已满足',' · condition satisfied'):''}</span>`);
    if(signatureRelicEnabled()){
      rows.push(`<span class="chip">${ui('专属造物：','Signature Creation: ')}${escape(isEnglish()?(currentSignatureRelic?.name||'Dimensional Image'):'当前角色维度影像')}</span>`);
      const signatureStrength=num(window.MorimensGearEffects?.signatureStrengthFlat);
      if(signatureStrength>0)rows.push(`<span class="chip">${ui('专造回合开始力量','Signature turn-start STR')} +${signatureStrength.toFixed(2)}</span>`);
    }
    box.innerHTML=rows.join('');
  }

  function bindCapture(){
    $('charSelect')?.addEventListener('change',e=>{e.stopImmediatePropagation();loadAwakener()},{capture:true});
    $('skillSelect')?.addEventListener('change',e=>{e.stopImmediatePropagation();applySkill()},{capture:true});
    $('skillLevel')?.addEventListener('change',e=>{e.stopImmediatePropagation();updateSkillLevel()},{capture:true});
    $('fateSelect')?.addEventListener('change',e=>{e.stopImmediatePropagation();loadWheel(0)},{capture:true});
    $('contractSelect')?.addEventListener('change',e=>{e.stopImmediatePropagation();loadCovenant()},{capture:true});
    $('contractConditional')?.addEventListener('change',e=>{e.stopImmediatePropagation();renderCovenantAndBonuses();updateSkillLevel()},{capture:true});
    $('signatureRelicEnabled')?.addEventListener('change',e=>{e.stopImmediatePropagation();renderSignatureRelic();recomputeGearBonuses();updateSkillLevel();$('calcBtn')?.click()},{capture:true});
    $('targetVulnerable')?.addEventListener('change',()=>{const input=$('targetVulnerableStacks');if(input)input.disabled=!$('targetVulnerable')?.checked;updateSkillLevel();$('calcBtn')?.click()},{capture:true});
    const formulaReactiveFields=new Set(['critRate','critDamage','powerBonus','realmMastery']);
    document.addEventListener('input',e=>{if(formulaReactiveFields.has(e.target?.id))queueMicrotask(updateSkillLevel)},{capture:true});
    document.addEventListener('change',e=>{if(formulaReactiveFields.has(e.target?.id))queueMicrotask(updateSkillLevel)},{capture:true});
    $('calcBtn')?.addEventListener('click',()=>{recomputeGearBonuses()},{capture:true});
    $('resetBtn')?.addEventListener('click',e=>{e.stopImmediatePropagation();resetBuild()},{capture:true});
  }
  async function resetBuild(){
    if($('fateSelect'))$('fateSelect').value='';if($('fateSelect2'))$('fateSelect2').value='';currentWheels=[null,null];if($('contractSelect'))$('contractSelect').value='';if($('contractConditional'))$('contractConditional').checked=false;if($('signatureRelicEnabled'))$('signatureRelicEnabled').checked=false;if($('targetVulnerable'))$('targetVulnerable').checked=false;if($('targetVulnerableStacks')){$('targetVulnerableStacks').value='';$('targetVulnerableStacks').disabled=true}if($('explorationBattleIndex'))$('explorationBattleIndex').value='1';currentCovenant=null;refreshBattleProgressionUi();
    if($('innerSpirit')){$('innerSpirit').value=isLimitedAwakener()?'5':'0'}if($('characterSculpt'))$('characterSculpt').value='0';if($('soulforgeActive'))$('soulforgeActive').checked=true;if($('charEnlighten'))$('charEnlighten').value='';if($('rouseActive'))$('rouseActive').checked=false;if($('psycheSurgeLevel')){$('psycheSurgeLevel').value='0';$('psycheSurgeLevel').disabled=true}if($('skillActualHits'))$('skillActualHits').value='';if($('baseBonus'))$('baseBonus').value='0';if($('inBattleBaseBonus'))$('inBattleBaseBonus').value='0';
    for(const [key,id] of Object.entries(trackedFields)){const el=$(id);if(!el)continue;el.dataset.manualBase=String(key==='critDamage'?150:0);delete el.dataset.characterBase;delete el.dataset.characterBaseAwakener}if($('realmMastery')){delete $('realmMastery').dataset.characterBase;delete $('realmMastery').dataset.characterBaseAwakener}
    if($('autoCharacterStats'))$('autoCharacterStats').checked=true;if($('attack'))$('attack').dataset.autoAttack='1';renderCharacterResourceControls(true);applyCharacterStats();recomputeGearBonuses();renderWheelsAndBonuses();renderCovenantAndBonuses();syncWheelDuplicates();renderSkillOptions(currentSkill?.id);applySkill();$('calcBtn')?.click();
  }
  function applyLanguage(){
    renderCharacters();if(currentAwakener){const sel=$('charSelect');if(sel)sel.value=currentAwakener.id}
    normalizeProgressionControls();configureProgressionControls(false);ensureEnlightenUi();configureEnlightenControl(false);ensureFormulaContextUi();ensureSkillRuntimeUi();ensureSecondWheelUi();renderCharacterResourceControls(false);applyCharacterStats();
    renderSkillOptions(currentSkill?.id);if(currentSkill)updateSkillLevel();
    renderSignatureRelic();
    for(const id of ['fateSelect','fateSelect2']){const sel=$(id);if(!sel)continue;for(const o of sel.options){if(!o.value){o.textContent=isEnglish()?'None':'无';continue}const wheel=wheelCatalog.find(x=>x.id===o.value);if(wheel)o.textContent=wheelOptionLabel(wheel)}}
    const cs=$('contractSelect');if(cs&&covenantCatalog.length){for(const o of cs.options){const covenant=covenantCatalog.find(x=>x.id===o.value);if(covenant)o.textContent=isEnglish()?covenant.name:(zhCovenants[covenant.name]||covenant.name)}}
    renderWheelsAndBonuses();renderCovenantAndBonuses();renderRouseSummary();renderAutoSummary();
  }

  async function boot(){
    ensureTermIconStyle();ensureCharacterLevel();ensureSecondWheelUi();ensureSyncBadge();ensureSignatureRelicUi();initManualTracking();bindCapture();renderCharacters();
    window.addEventListener('morimens-realm-change',()=>{if(currentSkill)queueMicrotask(updateSkillLevel)});
    try{await loadCatalogs();if($('targetVulnerableStacks'))$('targetVulnerableStacks').disabled=!$('targetVulnerable')?.checked;await loadAwakener();for(const delay of [500,1800,5000])setTimeout(normalizeProgressionControls,delay);window.addEventListener('morimens-language-change',applyLanguage);window.MorimensBuildData={get wheels(){return wheelCatalog},get covenants(){return covenantCatalog},get relics(){return relicCatalog},get currentWheels(){return currentWheels},get currentCovenant(){return currentCovenant},get currentSignatureRelic(){return currentSignatureRelic}}}catch(error){console.error('Morimens SKeyDB calculator bootstrap failed',error);setText('skeydbBuildText',isEnglish()?'Failed to load SKeyDB character/skill data. Refresh and try again.':'SKeyDB 角色/技能数据加载失败，请刷新后重试');$('skeydbBuildDot')?.classList.add('bad')}
  }
  if(window.MorimensData?.db&&window.MorimensRepository)boot();else window.addEventListener('morimens-data-ready',boot,{once:true});
})();

(()=>{
  const $=id=>document.getElementById(id);
  const hash=s=>{let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0};
  const dateKey=()=>new Date().toLocaleDateString('sv-SE');
  const cacheKey='morimens.daily-fortune.v5';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const wheelKeywordPool=['爆发','连击','暴击','资源','强化','续航','灵知','高压'];
  const tarotPool=['命运之轮','星辰','月影','审判','隐者','力量','战车','节制','世界','女祭司','魔术师','太阳'];
  const signTexts={大吉:'星轨正合，今日所行皆有回响。',上吉:'潮声引路，把握时机便能乘势而上。',中吉:'灯火未熄，稳步前行自有所得。',小吉:'微光在侧，适合完成眼前的小目标。',平:'风浪未定，守成比冒进更为合适。',小凶:'雾色渐浓，宜留余力并谨慎选择。',凶:'暗潮将至，今日更适合整备与等待。'};
  const themedSignTexts={
    大吉:['旧日星门在雾海中开启，唤醒体的灵知与命轮共鸣，今日适合直面深潜者的低语。','克苏鲁的潮汐退去片刻，忘却前夜的残光为你照亮道路，关键一击将得到回响。'],
    上吉:['命轮映出群星裂隙，唤醒体循着微弱灵知前行，融灾中的暗潮会为坚定者让路。','在忘却前夜的钟声再次响起前，收拢力量、顺势出牌，古老梦境将留下馈赠。'],
    中吉:['雾中的低语尚未成形，唤醒体宜以稳健节奏探索，命轮的微光足以守住今日航线。','旧神注视着沉默的牌面，别急于追逐深渊；完成眼前一步，便能从忘却中拾回线索。'],
    小吉:['星尘落在命轮边缘，适合让唤醒体完成一件小事；不要惊动尚在沉睡的克苏鲁梦魇。','忘却前夜仍有微光，谨慎积攒资源与灵知，今日的小幅推进会成为下一次觉醒的引线。'],
    平:['深海低语与命轮回声彼此抵消，唤醒体宜先观察再行动，暂缓把筹码投入未知的门扉。','克苏鲁的阴影掠过牌面，今日没有必须追逐的答案；守住阵线，等待忘却前夜翻页。'],
    小凶:['命轮出现不稳定的裂纹，唤醒体应避免连续冒进；深潜之前先确认退路，别回应陌生低语。','旧神的梦境正在涨潮，今天更适合校准配装、收束灵知，避开高代价的未知仪式。'],
    凶:['克苏鲁的潮声压过了星轨，唤醒体不宜强行叩开深渊之门；保存力量，等待命轮重新转动。','忘却前夜的雾幕尚未散去，今日先守住已有的线索与资源，不要让未知低语替你做决定。']
  };
  const challengePool=['完成一次融灾挑战','使用今日界域完成一场战斗','不借用助战完成一场战斗','使用今日唤醒体完成一场战斗','完成一次高难关卡','尝试一套不同的命轮配置'];
  const recommendPool=['适合挑战高难融灾','适合整理命轮与密契配置','适合推进未完成关卡','适合积累强化资源','适合尝试新的界域队伍','适合完成日常与周常'];
  const almanacMap=[[/出行|移徙|赴任|入宅/,'推进探索或未完成关卡'],[/交易|纳财|开市|立券/,'刷取资源并整理仓库'],[/修造|动土|安床|竖柱/,'强化唤醒体、命轮与密契'],[/祈福|祭祀|求嗣/,'完成签到并尝试一次抽取'],[/会友|嫁娶|纳采|宴会/,'使用好友助战或调整配队'],[/求医|治病/,'补足防御与续航配置'],[/沐浴|扫舍|解除/,'清理日常和低消耗任务'],[/栽种|牧养|纳畜/,'培养角色并积累养成资源'],[/安葬|破土|启钻/,'暂缓高风险重开，优先收尾旧目标']];
  const translateAlmanac=item=>almanacMap.find(([pattern])=>pattern.test(item))?.[1]||'稳步完成日常与融灾任务';
  let almanacToday=null;

  function build(detail){
    const seed=hash(`${dateKey()}-${detail.id}-${detail.wheelName}`),usage=detail.usage||{},rankScore=usage.rank&&usage.total>1?100*(usage.total-usage.rank)/(usage.total-1):50,dailyScore=30+seed%71;
    // 命轮独立抽取后，其稀有度、界域和词条共同参与今日签级。
    const rarityBonus=detail.wheelRarity==='SSR'?14:detail.wheelRarity==='SR'?8:detail.wheelRarity==='R'?4:0;
    const realmBonus=detail.wheelRealm?((hash(detail.wheelRealm)%9)+2):0;
    const keywordBonus=Math.min(6,(detail.wheelKeywords||[]).filter(Boolean).length*2);
    const wheelScore=rarityBonus+realmBonus+keywordBonus;
    const fortuneScore=Math.min(100,Math.round(rankScore*.55+dailyScore*.25+wheelScore*.2)),sign=fortuneScore>=88?'大吉':fortuneScore>=76?'上吉':fortuneScore>=64?'中吉':fortuneScore>=52?'小吉':fortuneScore>=40?'平':fortuneScore>=28?'小凶':'凶',scores={战斗:Math.min(100,Math.round(45+fortuneScore*.45+(seed>>>3)%12)),抽取:Math.min(100,Math.round(35+fortuneScore*.4+(seed>>>7)%18)),探索:Math.min(100,Math.round(42+fortuneScore*.43+(seed>>>11)%15)),强化:Math.min(100,Math.round(40+fortuneScore*.42+(seed>>>15)%16))};
    const wheelKeywords=[wheelKeywordPool[(seed>>>2)%wheelKeywordPool.length],wheelKeywordPool[(seed>>>7)%wheelKeywordPool.length]].filter((x,i,a)=>a.indexOf(x)===i);
    const keywords=[detail.realm,detail.type,detail.wheelRealm,detail.wheelRarity,...wheelKeywords,'幸运'].filter(Boolean).slice(0,5);
    const usageText=usage.rank?`第 ${usage.season||69} 期出场率 ${Number(usage.rate||0).toFixed(1)}% · 第 ${usage.rank}/${usage.total}`:'当期出场率暂无记录';
    const signPool=themedSignTexts[sign]||[signTexts[sign]],themedText=signPool[(seed>>>21)%signPool.length];
    // 每日签只抽取“守密人头像”页面头像下方短句；角色语音仍仅显示在下方“角色语录”区，避免重复。
    const avatarCaptionPool=[
      '「不允许你们靠近守密人半步……！」',
      '「雾会遮住道路，却遮不住仍在跳动的灵知。」',
      '「若听见深海的回声，请先确认身后的灯还亮着。」',
      '「不要追逐每一道低语，真正的答案往往藏在沉默里。」',
      '「在旧日星尘落下之前，把最后一枚筹码握紧。」',
      '「守住界域的边界，别让未知替你决定方向。」',
      '「醒来吧，记忆尚未完全沉没，航线仍在雾中。」',
      '「命运不是赠礼；每一次选择都要支付代价。」',
      '「当潮汐退去，留下的才是可以依靠的证据。」',
      '「别回头看那扇门，门后的注视从未离开。」',
      '「让理智先行一步，再把勇气交给深渊。」',
      '「只要灯火尚存，忘却前夜就还没有结束。」'
    ];
    const signText=(avatarCaptionPool[(seed>>>21)%avatarCaptionPool.length]||themedText).replace(/「[^」]*限时纪行[^」]*」/g,'').trim()||themedText;
    return {...detail,date:dateKey(),scores,wheelKeywords,keywords,fortuneScore,sign,signText,usageText,tarotName:tarotPool[(seed>>>20)%tarotPool.length],recommend:recommendPool[(seed>>>12)%recommendPool.length],challenge:challengePool[(seed>>>17)%challengePool.length]};
  }
  function render(data,{cached=false}={}){
    if(!data)return;
    if($('fortuneWheelName'))$('fortuneWheelName').textContent=data.wheelName||'命轮';
    if($('fortuneWheelKeywords'))$('fortuneWheelKeywords').textContent=(data.wheelKeywords||[]).join(' · ');
    if($('fortuneLevel'))$('fortuneLevel').textContent=`${data.sign||'平'}签`;
    if($('fortuneSignText'))$('fortuneSignText').textContent=data.signText||signTexts.平;
    if($('fortuneTarotName'))$('fortuneTarotName').textContent=`塔罗 · ${data.tarotName||'命运之轮'}`;
    if($('fortuneKeyword'))$('fortuneKeyword').innerHTML=(data.keywords||[]).map(x=>`<span>${esc(x)}</span>`).join('');
    if($('fortuneLuckGrid'))$('fortuneLuckGrid').innerHTML=Object.entries(data.scores||{}).map(([name,value])=>{const stars=Math.max(1,Math.min(5,Math.round(value/20)));return `<div class="fortuneLuckItem"><header><span>${esc(name)}</span><b>+${Math.max(5,Math.round((value-45)/2))}%</b></header><div class="fortuneStars" aria-label="${stars} 星">${[1,2,3,4,5].map(i=>`<span class="${i<=stars?'isOn':''}">★</span>`).join('')}</div></div>`}).join('');
    const avg=Object.values(data.scores||{}).reduce((a,b)=>a+b,0)/Math.max(1,Object.keys(data.scores||{}).length);if($('fortuneStat'))$('fortuneStat').textContent=`综合 × ${(1+avg/500).toFixed(2)}`;
    if($('fortuneRecommend'))$('fortuneRecommend').textContent=`${data.usageText||''}${data.usageText?'；':''}${data.recommend||'适合稳步推进今日目标'}`;
    if($('fortuneChallenge'))$('fortuneChallenge').textContent=data.challenge||'完成一次融灾挑战';
    if($('fortuneSync'))$('fortuneSync').textContent=cached?'✓ 今日签缓存 · 出场率已纳入':'✓ 当期出场率已纳入签级';
    if(almanacToday)renderAlmanac(almanacToday,{cached});
  }
  function renderAlmanac(almanac,{cached=false}={}){
    if(!almanac||almanac.date!==dateKey())return;almanacToday=almanac;
    const yi=(almanac.yi||[]).filter(Boolean),ji=(almanac.ji||[]).filter(Boolean),offset=hash(dateKey());
    const picks=(rows,key,count=2)=>rows.length?Array.from({length:Math.min(count,rows.length)},(_,i)=>rows[(offset+(key==='ji'?7:0)+i*5)%rows.length]).filter((x,i,a)=>a.indexOf(x)===i):[];
    const pickYi=picks(yi,'yi'),pickJi=picks(ji,'ji');
    const yiText=pickYi.length?pickYi.map(x=>`「${x}」${translateAlmanac(x)}`).join('；'):'稳步完成日常任务';
    const jiText=pickJi.length?pickJi.map(x=>`「${x}」`).join('、'):'高消耗尝试';
    if($('fortuneRecommend'))$('fortuneRecommend').textContent=`黄历宜：${yiText}`;
    if($('fortuneChallenge'))$('fortuneChallenge').textContent=`今日忌 ${jiText}；避免对应的冒进操作，优先完成低风险目标`;
    if($('fortuneSync'))$('fortuneSync').textContent=`✓ 每日黄历${cached?'缓存':'已同步'} · ${almanac.lunarDate||almanac.date}${almanac.ganZhi?' · '+almanac.ganZhi:''}`;
  }
  async function loadAlmanac(){
    const key='morimens.daily-almanac.v1';try{const cached=JSON.parse(localStorage.getItem(key)||'null');if(cached?.date===dateKey())renderAlmanac(cached,{cached:true})}catch{}
    try{const response=await fetch(`data/morimens/almanac/today.json?v=${dateKey()}`,{cache:'no-cache'});if(!response.ok)return;const data=await response.json();if(data?.date!==dateKey())return;renderAlmanac(data);try{localStorage.setItem(key,JSON.stringify(data))}catch{}}catch{}
  }
  try{const cached=JSON.parse(localStorage.getItem(cacheKey)||'null');if(cached?.date===dateKey())render(cached,{cached:true})}catch{}
  window.addEventListener('morimens-fortune-render',event=>{const data=build(event.detail||{});render(data);try{localStorage.setItem(cacheKey,JSON.stringify(data))}catch{}});
  loadAlmanac();
})();

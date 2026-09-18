(()=>{
  const $=id=>document.getElementById(id);
  const hash=s=>{let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0};
  const dateKey=()=>new Date().toLocaleDateString('sv-SE');
  const cacheKey='morimens.daily-fortune.v7';
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
    // 头像页原文池：仅保存页面「」中的短句，作为每日签首选来源。\n    const avatarCaptionPool=[\n      '「不允许你们靠近守密人半步……！」',\n      '「无论是奔赴卡达斯星球的背面，还是深入裂隙中心，她都相信你的判断。」',\n      '「你够格当学生吗？只要有他在，就没有人会受伤。」',\n      '「看到校长鱼鳞了吗？这就是我体内深海之力奔涌的象征！」',\n      '「嗯？需要我出手吗？」',\n      '「吧唧吧唧……小蛋糕好吃！」',\n      '「别让那些低语越过界线。」',\n      '「守密人的道路，不容许半步迟疑。」',\n      '「记住这盏灯，它会带你穿过雾海。」',\n      '「深渊在注视，但答案还没有沉没。」',\n      '「如果必须选择，就把希望留给还醒着的人。」',\n      '「别回头，旧日的门只会打开一次。」'\n    ];\n    // 额外生成池：符合克苏鲁氛围的原创签词，不添加「」标记，避免冒充游戏原文。\n    const generatedCthulhuPool=[\n      '潮汐正在倒数，先稳住理智，再踏入未知。','雾中的钟声敲响三次，今日宜收束锋芒。','旧日星图出现缺口，谨慎选择下一条航线。','深海的回声并非召唤，可能只是陷阱的余音。','当理智值下降时，最安全的道路往往看起来最慢。','不可名状的阴影掠过牌面，暂缓高代价决策。','星辰排列成陌生的符号，今日适合整理而非冒进。','梦境留下湿冷脚印，记得检查身后的退路。','沉睡者尚未翻身，保持安静便能避开第一道浪。','古老的注视落在肩头，别把秘密交给陌生人。','雾墙正在移动，固定阵线比追逐幻象更重要。','理智与勇气同时燃烧时，才能照亮裂隙边缘。','深潜之前先清点资源，未知不会为准备不足让步。','黑潮漫过旧港，今日宜把握确定的微光。','梦中低语指向错误的门，真正的出口藏在沉默里。','旧神的影子拉得很长，别让恐惧替你决定方向。','潮声忽远忽近，说明危险正在寻找新的容器。','残缺的星盘仍能导航，只要不把缺口当成答案。','在不可见的风暴抵达前，先完成手边最小的目标。','深海不会奖励喧哗，耐心会带来更清晰的回声。','理智是一盏窄灯，足够照见下一步，却不必照亮终点。','当雾气凝成环形，说明某个旧日秘密正在苏醒。','不要回应没有名字的呼唤，沉默本身也是护符。','星尘落入水面，今日的微小选择会改变航向。','未知仪式尚未完成，留出余力应对突然的代价。','暗潮冲击船舷，稳住核心便不会被带离航线。','古老梦境反复出现，可能提示你需要重新审视规则。','阴影没有形状，却会留下痕迹；检查每一个细节。','深渊边缘的风很冷，先确认退路再伸手取火。','潮汐退去后，真正重要的线索会留在沙地上。','理智短暂失焦时，遵循已验证的路径即可。','旧日星门半掩，贸然推开只会放大未知。','梦境中的月亮变红，今日不宜进行无把握的交换。','沉默的守望者没有转身，说明危险仍在远处。','每一次深潜都会留下痕迹，合理分配今日的代价。','黑雾覆盖了答案，却没有覆盖你的判断力。','当所有声音同时消失，先观察，再决定是否前进。','裂隙里传来歌声，越动听的诱惑越需要警惕。','星图边缘泛起银光，适合修整装备与重新布局。','未知并不等于必败，谨慎可以把恐惧变成线索。','海面平静得不自然，今日宜保留一张未翻开的牌。','梦境正在褪色，把握还能记住的每个细节。','旧神的目光移开一瞬，趁机完成最重要的准备。','雾海没有尽头，但每一盏灯都能标记一段安全距离。','当理智与欲望冲突，优先保护仍然清醒的部分。','沉睡的门扉出现裂纹，先加固边界，不要急于探索。','深海回声重复你的名字，保持距离便不会被它带走。','星尘与血色交汇，今日适合低调推进，不宜炫耀成果。','未知正在靠近，最好的预言是提前准备退路。','旧日余烬尚温，守住它，等待下一次真正的觉醒。'\n    ];\n    const sourceText=avatarCaptionPool[(seed>>>21)%avatarCaptionPool.length];\n    const signText=(seed%5===0?generatedCthulhuPool[(seed>>>13)%generatedCthulhuPool.length]:sourceText)||themedText;\n    return {...detail,date:dateKey(),scores,wheelKeywords,keywords,fortuneScore,sign,signText,usageText,tarotName:tarotPool[(seed>>>20)%tarotPool.length],recommend:recommendPool[(seed>>>12)%recommendPool.length],challenge:challengePool[(seed>>>17)%challengePool.length]};
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
  let fortuneEventReceived=false;
  window.addEventListener('morimens-fortune-render',event=>{fortuneEventReceived=true;const data=build(event.detail||{});render(data);try{localStorage.setItem(cacheKey,JSON.stringify(data))}catch{}});
  // SKeyDB/Wiki 同步失败时也立即给出本地结果，避免页面一直停留在“等待启示”。
  setTimeout(()=>{
    if(fortuneEventReceived)return;
    const fallbackDetail={id:'local-fallback',name:'守密人',realm:'未知界域',type:'唤醒体',wheelName:'命运之轮',wheelRealm:'未知界域',wheelRarity:'R',wheelKeywords:['理智','观测'],usage:{}};
    const data=build(fallbackDetail);render(data);try{localStorage.setItem(cacheKey,JSON.stringify(data))}catch{}
    if($('fortuneSync'))$('fortuneSync').textContent='⚠ 同步暂不可用 · 已使用本地头像签词';
  },1200);
  loadAlmanac();
})();

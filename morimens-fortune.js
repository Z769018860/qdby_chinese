(()=>{
  const $=id=>document.getElementById(id);
  const hash=s=>{let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0};
  const dateKey=()=>new Date().toLocaleDateString('sv-SE');
  const cacheKey='morimens.daily-fortune.v2';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const wheelKeywordPool=['爆发','连击','暴击','资源','强化','续航','灵知','高压'];
  const tarotPool=['命运之轮','星辰','月影','审判','隐者','力量','战车','节制','世界','女祭司','魔术师','太阳'];
  const challengePool=['完成一次融灾挑战','使用今日界域完成一场战斗','不借用助战完成一场战斗','使用今日唤醒体完成一场战斗','完成一次高难关卡','尝试一套不同的命轮配置'];
  const recommendPool=['适合挑战高难融灾','适合整理命轮与密契配置','适合推进未完成关卡','适合积累强化资源','适合尝试新的界域队伍','适合完成日常与周常'];
  const almanacMap=[[/出行|移徙|赴任|入宅/,'推进探索或未完成关卡'],[/交易|纳财|开市|立券/,'刷取资源并整理仓库'],[/修造|动土|安床|竖柱/,'强化唤醒体、命轮与密契'],[/祈福|祭祀|求嗣/,'完成签到并尝试一次抽取'],[/会友|嫁娶|纳采|宴会/,'使用好友助战或调整配队'],[/求医|治病/,'补足防御与续航配置'],[/沐浴|扫舍|解除/,'清理日常和低消耗任务'],[/栽种|牧养|纳畜/,'培养角色并积累养成资源'],[/安葬|破土|启钻/,'暂缓高风险重开，优先收尾旧目标']];
  const translateAlmanac=item=>almanacMap.find(([pattern])=>pattern.test(item))?.[1]||'稳步完成日常与融灾任务';
  let almanacToday=null;

  function build(detail){
    const seed=hash(`${dateKey()}-${detail.id}-${detail.wheelName}`),usage=detail.usage||{},rankScore=usage.rank&&usage.total>1?100*(usage.total-usage.rank)/(usage.total-1):50,dailyScore=30+seed%71,fortuneScore=Math.round(rankScore*.68+dailyScore*.32),sign=fortuneScore>=88?'大吉':fortuneScore>=76?'上吉':fortuneScore>=64?'中吉':fortuneScore>=52?'小吉':fortuneScore>=40?'平':fortuneScore>=28?'小凶':'凶',scores={战斗:Math.min(100,Math.round(45+fortuneScore*.45+(seed>>>3)%12)),抽取:Math.min(100,Math.round(35+fortuneScore*.4+(seed>>>7)%18)),探索:Math.min(100,Math.round(42+fortuneScore*.43+(seed>>>11)%15)),强化:Math.min(100,Math.round(40+fortuneScore*.42+(seed>>>15)%16))};
    const wheelKeywords=[wheelKeywordPool[(seed>>>2)%wheelKeywordPool.length],wheelKeywordPool[(seed>>>7)%wheelKeywordPool.length]].filter((x,i,a)=>a.indexOf(x)===i);
    const keywords=[detail.realm,detail.type,...wheelKeywords,'幸运'].filter(Boolean).slice(0,5);
    const usageText=usage.rank?`第 ${usage.season||69} 期出场率 ${Number(usage.rate||0).toFixed(1)}% · 第 ${usage.rank}/${usage.total}`:'当期出场率暂无记录';
    return {...detail,date:dateKey(),scores,wheelKeywords,keywords,fortuneScore,sign,usageText,tarotName:tarotPool[(seed>>>20)%tarotPool.length],recommend:recommendPool[(seed>>>12)%recommendPool.length],challenge:challengePool[(seed>>>17)%challengePool.length]};
  }
  function render(data,{cached=false}={}){
    if(!data)return;
    if($('fortuneWheelName'))$('fortuneWheelName').textContent=data.wheelName||'命轮';
    if($('fortuneWheelKeywords'))$('fortuneWheelKeywords').textContent=(data.wheelKeywords||[]).join(' · ');
    if($('fortuneLevel'))$('fortuneLevel').textContent=`${data.sign||'平'}签 · ${data.tarotName||'命运之轮'}`;
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

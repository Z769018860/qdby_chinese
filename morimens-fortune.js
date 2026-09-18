(()=>{
  const $=id=>document.getElementById(id);
  const hash=s=>{let h=2166136261;for(const c of String(s)){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0};
  const dateKey=()=>new Date().toLocaleDateString('sv-SE');
  const cacheKey='morimens.daily-fortune.v2';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const wheelKeywordPool=['爆发','连击','暴击','资源','强化','续航','灵知','高压'];
  const challengePool=['完成一次融灾挑战','使用今日界域完成一场战斗','不借用助战完成一场战斗','使用今日唤醒体完成一场战斗','完成一次高难关卡','尝试一套不同的命轮配置'];
  const recommendPool=['适合挑战高难融灾','适合整理命轮与密契配置','适合推进未完成关卡','适合积累强化资源','适合尝试新的界域队伍','适合完成日常与周常'];

  function build(detail){
    const seed=hash(`${dateKey()}-${detail.id}-${detail.wheelName}`),scores={战斗:55+seed%46,抽取:50+(seed>>>4)%51,探索:50+(seed>>>9)%51,强化:50+(seed>>>14)%51};
    const wheelKeywords=[wheelKeywordPool[(seed>>>2)%wheelKeywordPool.length],wheelKeywordPool[(seed>>>7)%wheelKeywordPool.length]].filter((x,i,a)=>a.indexOf(x)===i);
    const keywords=[detail.realm,detail.type,...wheelKeywords,'幸运'].filter(Boolean).slice(0,5);
    return {...detail,date:dateKey(),scores,wheelKeywords,keywords,recommend:recommendPool[(seed>>>12)%recommendPool.length],challenge:challengePool[(seed>>>17)%challengePool.length]};
  }
  function render(data,{cached=false}={}){
    if(!data)return;
    if($('fortuneWheelName'))$('fortuneWheelName').textContent=data.wheelName||'命轮';
    if($('fortuneWheelKeywords'))$('fortuneWheelKeywords').textContent=(data.wheelKeywords||[]).join(' · ');
    if($('fortuneKeyword'))$('fortuneKeyword').innerHTML=(data.keywords||[]).map(x=>`<span>${esc(x)}</span>`).join('');
    if($('fortuneLuckGrid'))$('fortuneLuckGrid').innerHTML=Object.entries(data.scores||{}).map(([name,value])=>{const stars=Math.max(1,Math.min(5,Math.round(value/20)));return `<div class="fortuneLuckItem"><header><span>${esc(name)}</span><b>+${Math.max(5,Math.round((value-45)/2))}%</b></header><div class="fortuneStars" aria-label="${stars} 星">${[1,2,3,4,5].map(i=>`<span class="${i<=stars?'isOn':''}">★</span>`).join('')}</div></div>`}).join('');
    const avg=Object.values(data.scores||{}).reduce((a,b)=>a+b,0)/Math.max(1,Object.keys(data.scores||{}).length);if($('fortuneStat'))$('fortuneStat').textContent=`综合 × ${(1+avg/500).toFixed(2)}`;
    if($('fortuneRecommend'))$('fortuneRecommend').textContent=data.recommend||'适合稳步推进今日目标';
    if($('fortuneChallenge'))$('fortuneChallenge').textContent=data.challenge||'完成一次融灾挑战';
    if($('fortuneSync'))$('fortuneSync').textContent=cached?'✓ 已从今日缓存显示':'✓ 本地快照已更新';
  }
  try{const cached=JSON.parse(localStorage.getItem(cacheKey)||'null');if(cached?.date===dateKey())render(cached,{cached:true})}catch{}
  window.addEventListener('morimens-fortune-render',event=>{const data=build(event.detail||{});render(data);try{localStorage.setItem(cacheKey,JSON.stringify(data))}catch{}});
})();

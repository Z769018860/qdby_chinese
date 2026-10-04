(()=>{
  'use strict';
  if(window.__morimensReplayPassiveAttributionV1)return;window.__morimensReplayPassiveAttributionV1=true;
  const en=()=>localStorage.getItem('morimens.language')==='en';
  const ui=(z,e)=>en()?e:z;
  const fmt=n=>(Number(n)||0).toLocaleString(en()?'en-US':'zh-CN',{maximumFractionDigits:0});
  const SERPENT=new Set(['98367','98376']);
  const MALIGNANT=new Set(['70759','70725']);
  const clean=s=>String(s??'').replace(/\s+/g,' ').trim();
  let busy=false,last='';
  function allEvents(tl){return (tl.rounds||[]).flatMap(r=>(r.events||[]).map(e=>({...e,round:r.round})))}
  function relicName(tl,tid){return clean(tl.res?.nameRelic?.(tid)||'')}
  function findOwned(full,tl,set,re){
    return (full.battleDat?.relics||[]).map(r=>String(r.tid)).find(t=>set.has(t)||re.test(relicName(tl,t)))||null;
  }
  function rowFor(stats,tid){return (stats.relicRows||[]).find(r=>String(r.tid)===String(tid))||null}
  function candidateBlocks(root,name){
    const out=[];for(const b of root.querySelectorAll('b,strong'))if(clean(b.textContent)===name||clean(b.textContent).includes(name)){
      const block=b.closest('.mr2ritem,.mr2rrowd,.mr2mvp,[class*=relic],[class*=Relic],details,div');if(block&&!out.includes(block))out.push(block)
    }return out;
  }
  function setSummary(block,text){
    if(!block)return;let target=[...block.querySelectorAll('small')].find(x=>/未观测|未触发|No separately|Triggers?\s*0|触发\s*0|状态归因/i.test(x.textContent||''));
    if(!target)target=[...block.querySelectorAll('small')].at(-1);if(target){target.textContent=text;target.dataset.passiveAttribution='1'}
    let note=block.querySelector('.mrPassiveNote');if(!note){note=document.createElement('div');note.className='mrPassiveNote';note.style.cssText='margin-top:5px;color:#82b9ad;font-size:9px;line-height:1.5';block.append(note)}note.textContent=text;
  }
  function patchNamedRelic(root,tl,tid,text){const name=relicName(tl,tid);if(!name)return;for(const block of candidateBlocks(root,name))setSummary(block,text)}
  function patchGenericGear(root){
    const scores=window.MorimensReplayEnhancedScores;if(!scores)return;
    for(const group of [scores.wheels||[],scores.covenants||[]])for(const item of group){
      const g=item.g||{},name=clean(g.name);if(!name)continue;const passive=(g.statics?.length||0)>0||(item._sm?.f?.length||0)>0;if(!passive||Number(g.n)>0)continue;
      for(const b of root.querySelectorAll('.mr2rrowd .mr2rn b,.mr2mvp b')){
        if(clean(b.textContent)!==name)continue;const block=b.closest('.mr2rrowd,.mr2mvp');if(!block)continue;
        const labels=(item._sm?.f||[]).slice(0,3).map(x=>x.label).filter(Boolean);
        const msg=labels.length?ui(`常驻/条件效果已计入：${labels.join(' · ')}`,`Passive/conditional value included: ${labels.join(' · ')}`):ui('常驻/条件效果已计入评分（无独立触发事件）','Passive/conditional value included; no standalone trigger event');
        for(const s of block.querySelectorAll('small'))if(/触发\s*0|Triggers?\s*0|未触发|未观测|No separately/i.test(s.textContent||''))s.textContent=msg;
        if(block.classList.contains('mr2rrowd')){let n=block.querySelector('.mrPassiveNote');if(!n){n=document.createElement('div');n.className='mrPassiveNote';n.style.cssText='margin:4px 0 0;color:#82b9ad;font-size:9px';block.querySelector('.mr2rdetail')?.prepend(n)}if(n)n.textContent=msg}
      }
    }
  }
  async function run(){
    const root=document.getElementById('mrReplayResult'),api=window.MorimensReplayReview;if(!root||!api||busy)return;
    const id=clean(root.querySelector('.mr2bmeta .id b')?.textContent);if(!id)return;
    const stamp=id+'|'+root.querySelectorAll('.mr2rrowd').length+'|'+root.querySelectorAll('small').length;if(stamp===last&&root.querySelector('[data-passive-attribution]')){patchGenericGear(root);return}
    busy=true;try{
      const full=await api.fetchReplay(id),tl=api.buildTimeline(full),stats=api.computeStats(full,tl),events=allEvents(tl);
      const serpent=findOwned(full,tl,SERPENT,/蛇蜕|怪蛇|Serpent.?s Husk/i);
      if(serpent){
        const healEvents=events.filter(e=>e.kind==='heal'&&Number(e.amount)>0&&tl.campOf?.(e.actorUid)!==2);
        const shieldEvents=events.filter(e=>e.kind==='property'&&e.property==='block'&&Number(e.changedValue)>0&&tl.campOf?.(e.actorUid)!==2);
        const heal=(stats.per||[]).reduce((n,r)=>n+(Number(r.heal)||0),0),shield=(stats.per||[]).reduce((n,r)=>n+(Number(r.block)||0),0),count=healEvents.length+shieldEvents.length;
        const extra=(heal+shield)*30/130;
        const text=ui(`常驻生效 · 护盾/治疗效果 +30% · 本场相关效果 ${count} 次 · 估算额外收益 ${fmt(extra)}`,`Always active · Shield/Healing +30% · ${count} relevant events · est. bonus ${fmt(extra)}`);
        patchNamedRelic(root,tl,serpent,text);
      }
      const malignant=findOwned(full,tl,MALIGNANT,/恶童|恶性之子|Malignant Child/i);
      if(malignant){
        const weak=events.filter(e=>e.kind==='state'&&tl.campOf?.(e.targetUid??e.actorUid)===2&&/虚弱|Weakness/i.test(tl.res?.nameState?.(e.stateId)||'')&&(Number(e.round)||0)<=1).length;
        const rr=rowFor(stats,malignant),extra=Number(rr?.buff?.extra)||0;
        const text=ui(`开局生效 · 全体敌人虚弱 5 回合${weak?`（观测 ${weak} 个目标）`:''} · 常驻基础伤害 +12%${extra>0?` · 实战增益贡献 ${fmt(extra)}`:''}`,`Battle start · Weakness to all enemies for 5 turns${weak?` (${weak} targets observed)`:''} · permanent Base DMG +12%${extra>0?` · observed buff value ${fmt(extra)}`:''}`);
        patchNamedRelic(root,tl,malignant,text);
      }
      for(const r of stats.relicRows||[]){
        if(Number(r.n)>0||SERPENT.has(String(r.tid))||MALIGNANT.has(String(r.tid)))continue;
        const extra=Number(r.buff?.extra)||0;if(!r.buff&&!extra)continue;
        const name=relicName(tl,r.tid),text=ui(`常驻/状态效果已计入${extra>0?` · 实战增益贡献 ${fmt(extra)}`:''}（回放没有独立“造物触发”事件）`,`Passive/state effect included${extra>0?` · observed buff value ${fmt(extra)}`:''}; replay has no standalone relic-trigger event`);
        for(const block of candidateBlocks(root,name))setSummary(block,text);
      }
      patchGenericGear(root);last=stamp;window.MorimensReplayPassiveAttribution={uuid:id,serpent,malignant};
    }catch(e){console.warn('Replay passive attribution failed',e)}finally{busy=false}
  }
  function start(){let q=false;const go=()=>{if(q)return;q=true;setTimeout(()=>{q=false;run()},50)};go();new MutationObserver(go).observe(document.documentElement,{subtree:true,childList:true});window.addEventListener('morimens-language-change',go)}
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
})();

(()=>{
  'use strict';
  if(window.__morimensProgressionFixV1)return;window.__morimensProgressionFixV1=true;
  const en=()=>localStorage.getItem('morimens.language')==='en';
  const ui=(z,e)=>en()?e:z;
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
  const firstNum=(obj,keys)=>{for(const k of keys){const n=num(obj?.[k]);if(n!=null)return n}return null};
  function enlightenmentValue(m){
    if(!m)return null;
    let n=firstNum(m,['enlightenLevel','enlightenmentLevel','enlightenCount','enlightenmentCount','enlightLevel','awakeningLevel']);
    if(n!=null)return Math.max(0,Math.round(n));
    if(Array.isArray(m.enlightenment)&&m.enlightenment.length)return m.enlightenment.length;
    const p=String(m.enlightenMilestone??m.progression??m.enlightenTier??m.enlightenLabel??'').trim();
    let x=p.match(/\+(\d+)/);if(x)return Number(x[1]);
    if(/(?:AA|Absolute\s*Axiom|最终法则)/i.test(p))return 12;
    if(/(?:OE|Over[-\s]?Exalt|超限)/i.test(p))return 4;
    x=p.match(/(?:^|\b)E([0-3])(?:\b|$)/i);if(x)return Number(x[1]);
    x=p.match(/([0-3])\s*启/);if(x)return Number(x[1]);
    return null;
  }
  function enlightenmentLabel(m){const n=enlightenmentValue(m);if(n==null)return ui('启灵未记录','Enlighten unknown');return n<=3?(en()?`E${n}`:`${n}启`):`+${n}`}
  function coarseEnlightenment(m){const n=enlightenmentValue(m);if(n==null)return 'unknown';return n<=2?'low':n<=3?'e3plus3':n<=11?'plus4plus11':'plus12'}
  function soulforgeLevel(m){
    const n=firstNum(m,['soulforgeLevel','soulForgeLevel','soulforgeLv','soulForgeLv','soulforge','soulForge']);if(n!=null)return Math.max(0,Math.round(n));
    const candidates=[m?.talents?.soulforge,m?.progression?.soulforge,m?.soulforgeTalent];for(const v of candidates){const x=num(v?.level??v);if(x!=null)return Math.max(0,Math.round(x))}
    return null;
  }
  function skillLevels(m){
    const out=[];const push=v=>{const n=num(v?.level??v?.lv??v);if(n!=null&&n>0)out.push(Math.round(n))};
    if(Array.isArray(m?.skillLevels))m.skillLevels.forEach(push);else if(m?.skillLevels&&typeof m.skillLevels==='object')Object.values(m.skillLevels).forEach(push);
    if(Array.isArray(m?.skills))m.skills.forEach(push);if(Array.isArray(m?.cards))m.cards.forEach(push);
    const one=num(m?.skillLevel);if(one!=null&&one>0)out.push(Math.round(one));
    return out;
  }
  function skillLabelFromLevels(levels){
    const a=[...new Set((levels||[]).filter(x=>Number.isFinite(x)&&x>0))].sort((x,y)=>x-y);if(!a.length)return null;
    return a.length===1?ui(`技能 Lv.${a[0]}`,`Skills Lv.${a[0]}`):ui(`技能 ${a.join('/')}`,`Skills ${a.join('/')}`);
  }
  function memberFromDataset(el){
    for(let p=el;p&&p!==document.body;p=p.parentElement){
      const d=p.dataset||{};
      for(const k of ['member','awakener','character','playerMember'])if(d[k]){try{const o=JSON.parse(d[k]);if(o&&typeof o==='object')return o}catch{}}
      const o={};let any=false;
      for(const [dk,k] of [['enlightenLevel','enlightenLevel'],['enlightenmentLevel','enlightenmentLevel'],['enlightenCount','enlightenCount'],['soulforgeLevel','soulforgeLevel'],['skillLevel','skillLevel']])if(d[dk]!=null&&d[dk]!==''){o[k]=d[dk];any=true}
      if(any)return o;
    }
    return null;
  }
  const wrongBucket=/(?:[0-3]\s*启\s*[~～—–-]\s*\+\d+|3\s*启\s*[~～—–-]\s*\+3|E3\s*[~～—–-]\s*\+3)/i;
  function patchSearchText(root=document){
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;
    while((n=walker.nextNode())){
      const t=n.nodeValue||'';if(!/Lv\.?\s*\d+/i.test(t)||!wrongBucket.test(t))continue;
      const el=n.parentElement;if(!el||el.closest('option,.dtideEnlightLegend,.dtideInsightEnlightRow'))continue;
      const m=memberFromDataset(el),lab=m?enlightenmentLabel(m):ui('启灵未记录','Enlighten unknown');
      n.nodeValue=t.replace(wrongBucket,lab);el.closest('[class*=member],[class*=Member],[class*=card],[class*=Card]')?.setAttribute('data-progression-fixed','1');
    }
  }
  function valueFromText(text){
    if(/\+12|最终法则|Absolute\s*Axiom/i.test(text))return 12;if(/\+4|超限|Over[-\s]?Exalt/i.test(text))return 4;
    let m=text.match(/启灵\s*E?([0-3])|([0-3])\s*启/i);return m?Number(m[1]??m[2]):null;
  }
  function sfFromText(text){const m=text.match(/(?:灵塑|Soulforge)\s*(?:Lv\.?\s*)?(\d+)/i);return m?Number(m[1]):null}
  async function patchReplay(){
    const root=document.getElementById('mrReplayResult'),api=window.MorimensReplayReview;if(!root||!api)return;
    const id=(root.querySelector('.mr2bmeta .id b')?.textContent||'').trim();if(!id||root.dataset.progressionPatched===id)return;
    try{
      const full=await api.fetchReplay(id),tl=api.buildTimeline(full),roles=full.battleDat?.roleData||[],cards=tl.ent?.initialCards||[];
      const byName=new Map();
      for(const ri of roles){
        const actor=tl.actors?.get(String(ri.uid));if(!actor||actor.kind!=='awakener')continue;
        const own=cards.filter(c=>String(c.ownerUid)===String(ri.uid));
        const levels=[...new Set(own.map(c=>num(c.level)).filter(x=>x!=null&&x>0).map(Math.round))].sort((a,b)=>a-b);
        byName.set(String(actor.name).trim(),{ri,levels});
      }
      for(const head of root.querySelectorAll('.mr2dhead')){
        const name=(head.querySelector('b')?.textContent||'').trim(),d=byName.get(name);if(!d)continue;
        const current=head.textContent||'';let ev=enlightenmentValue(d.ri);if(ev==null)ev=valueFromText(current);
        let sf=soulforgeLevel(d.ri);if(sf==null)sf=sfFromText(current);
        const parts=[`Lv${d.ri.level??'—'}`,ev==null?ui('启灵未记录','Enlighten unknown'):(ev<=3?(en()?`E${ev}`:`${ev}启`):`+${ev}`)];
        const sl=skillLabelFromLevels(d.levels);if(sl)parts.push(sl);parts.push(sf==null?ui('灵塑未记录','Soulforge unknown'):ui(`灵塑 Lv.${sf}`,`Soulforge Lv.${sf}`));
        let meta=head.querySelector(':scope>.mr2from');if(!meta){meta=document.createElement('span');meta.className='mr2from';head.append(meta)}meta.textContent=parts.join(' · ');
      }
      root.dataset.progressionPatched=id;
    }catch(e){console.warn('Replay progression patch failed',e)}
  }
  function run(){patchSearchText();patchReplay()}
  window.MorimensProgression={enlightenmentValue,enlightenmentLabel,coarseEnlightenment,soulforgeLevel,skillLevels,skillLabelFromLevels,patch:run};
  let queued=false;const schedule=()=>{if(queued)return;queued=true;setTimeout(()=>{queued=false;run()},30)};
  const start=()=>{run();new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,characterData:true});window.addEventListener('morimens-language-change',schedule);document.getElementById('dtideSeason')?.addEventListener('change',schedule)};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
})();

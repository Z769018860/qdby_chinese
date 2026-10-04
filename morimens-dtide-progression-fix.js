(()=>{
  'use strict';
  if(window.__morimensProgressionFixV2)return;window.__morimensProgressionFixV2=true;
  const en=()=>localStorage.getItem('morimens.language')==='en';
  const ui=(z,e)=>en()?e:z;
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null};
  const firstNum=(obj,keys)=>{for(const k of keys){const n=num(obj?.[k]);if(n!=null)return n}return null};
  function enlightenmentValue(m){
    if(!m)return null;
    let n=firstNum(m,['enlightenLevel','enlightenmentLevel','enlightenCount','enlightenmentCount','enlightLevel','awakeningLevel']);
    if(n!=null)return Math.max(0,Math.round(n));
    if(Array.isArray(m.enlightenment)){
      const hasFlags=m.enlightenment.some(x=>x&&typeof x==='object'&&'unlocked' in x);
      const c=hasFlags?m.enlightenment.filter(x=>x?.unlocked===true).length:m.enlightenment.length;
      if(c>=0)return c;
    }
    const p=String(m.enlightenMilestone??m.progression??m.enlightenTier??m.enlightenLabel??'').trim();
    let x=p.match(/\+(\d+)/);if(x)return Number(x[1]);
    if(/(?:AA|Absolute\s*Axiom|最终法则|law12)/i.test(p))return 12;
    if(/(?:OE|Over[-\s]?Exalt|超限|overlimit)/i.test(p))return 4;
    x=p.match(/(?:^|\b)E([0-3])(?:\b|$)/i);if(x)return Number(x[1]);
    x=p.match(/([0-3])\s*启/);if(x)return Number(x[1]);
    return null;
  }
  function enlightenmentLabel(m){const n=enlightenmentValue(m);if(n==null)return ui('启灵未记录','Enlighten unknown');return n<=3?(en()?`E${n}`:`${n}启`):n===4?'+4':n>=5?'+12':`+${n}`}
  function coarseEnlightenment(m){const n=enlightenmentValue(m);if(n==null)return 'unknown';return n<=2?'low':n===3?'e3plus3':n===4?'plus4plus11':'plus12'}
  function soulforgeLevel(m){
    const n=firstNum(m,['soulforgeLevel','soulForgeLevel','soulforgeLv','soulForgeLv','soulforge','soulForge']);if(n!=null)return Math.max(0,Math.round(n));
    const candidates=[m?.talents?.soulforge,m?.progression?.soulforge,m?.soulforgeTalent];for(const v of candidates){const x=num(v?.level??v);if(x!=null)return Math.max(0,Math.round(x))}
    return null;
  }
  function skillLevels(m){
    const out=[];const push=v=>{const n=num(v?.level??v?.lv??v);if(n!=null&&n>0)out.push(Math.round(n))};
    if(Array.isArray(m?.skillLevels))m.skillLevels.forEach(push);else if(m?.skillLevels&&typeof m.skillLevels==='object')Object.values(m.skillLevels).forEach(push);
    if(Array.isArray(m?.skills))m.skills.forEach(push);if(Array.isArray(m?.cards))m.cards.forEach(push);
    const one=num(m?.skillLevel);if(one!=null&&one>0)out.push(Math.round(one));return out;
  }
  function skillLabelFromLevels(levels){const a=[...new Set((levels||[]).filter(x=>Number.isFinite(x)&&x>0))].sort((x,y)=>x-y);if(!a.length)return null;return a.length===1?ui(`技能 Lv.${a[0]}`,`Skills Lv.${a[0]}`):ui(`技能 ${a.join('/')}`,`Skills ${a.join('/')}`)}
  const norm=s=>String(s??'').normalize('NFKC').replace(/\s+/g,'').replace(/[·・]/g,'').toLowerCase();
  let usageCache=null,usageKey='';
  async function currentUsage(){
    const season=String(document.getElementById('dtideSeason')?.value||'70'),key=season;if(usageCache&&usageKey===key)return usageCache;
    try{
      const manifest=await fetch('data/morimens/eremora/manifest.json',{cache:'force-cache'}).then(r=>r.json());
      const entries=manifest.availableSeasons||[],entry=entries.find(x=>String(x.communityTargetKey??x.snapshotId??x.seasonId)===season)||entries.find(x=>String(x.seasonId)===season)||entries[0];
      const loader=window.MorimensDtideDataLoader;if(!entry?.path||!loader?.loadDataset)return null;
      usageCache=await loader.loadDataset(entry.path);usageKey=key;return usageCache;
    }catch(e){console.warn('Progression dataset unavailable',e);return null}
  }
  function memberFromDataset(el){
    for(let p=el;p&&p!==document.body;p=p.parentElement){const d=p.dataset||{};for(const k of ['member','awakener','character','playerMember'])if(d[k]){try{const o=JSON.parse(d[k]);if(o&&typeof o==='object')return o}catch{}}}
    return null;
  }
  function memberBlock(el){let best=el;for(let p=el;p&&p!==document.body;p=p.parentElement){const t=p.textContent||'',n=(t.match(/Lv\.?\s*\d+/gi)||[]).length;if(n===1)best=p;if(n>1)break}return best}
  function visibleName(block){for(const b of block.querySelectorAll('b,strong')){const s=clean(b.textContent);if(s&&!/Lv\.?|命轮|密契|Wheel|Covenant/i.test(s))return s}return ''}
  const clean=s=>String(s??'').replace(/\s+/g,' ').trim();
  function allMembers(doc){const out=[];for(const r of doc?.records||[])for(const w of r.waves||[])for(const t of w.teams||[])for(const m of t.members||[])out.push(m);return out}
  async function matchVisibleMember(el){
    const direct=memberFromDataset(el);if(direct)return direct;const doc=await currentUsage();if(!doc)return null;
    const block=memberBlock(el),text=clean(block.textContent),name=norm(visibleName(block)),lm=text.match(/Lv\.?\s*(\d+)/i),level=lm?Number(lm[1]):null;
    let best=null,bestScore=-1,ties=[];
    for(const m of allMembers(doc)){
      const names=[m.name,m.canonicalName,m.label].filter(Boolean).map(norm);if(name&&!names.includes(name))continue;
      let score=name?8:0;if(level!=null&&Number(m.level)===level)score+=4;else if(level!=null)score-=2;
      for(const w of m.wheels||m.weapons||[])if(w?.name&&text.includes(String(w.name)))score+=2;
      for(const c of m.covenants||m.suits||[])if(c?.name&&text.includes(String(c.name)))score+=2;
      if(score>bestScore){best=m;bestScore=score;ties=[m]}else if(score===bestScore)ties.push(m);
    }
    if(bestScore<6)return null;const vals=new Set(ties.map(enlightenmentValue).filter(v=>v!=null));return vals.size<=1?best:null;
  }
  const wrongBucket=/(?:[0-3]\s*启\s*[~～—–-]\s*\+\d+|3\s*启\s*[~～—–-]\s*\+3|E3\s*[~～—–-]\s*\+3)/i;
  async function patchSearchText(root=document){
    const nodes=[],walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while((n=walker.nextNode())){const t=n.nodeValue||'';if(/Lv\.?\s*\d+/i.test(t)&&wrongBucket.test(t))nodes.push(n)}
    for(const node of nodes){const el=node.parentElement;if(!el||el.closest('option,.dtideEnlightLegend,.dtideInsightEnlightRow'))continue;const m=await matchVisibleMember(el),parts=[];parts.push(m?enlightenmentLabel(m):ui('启灵未记录','Enlighten unknown'));if(m){const sl=skillLabelFromLevels(skillLevels(m)),sf=soulforgeLevel(m);if(sl)parts.push(sl);if(sf!=null)parts.push(ui(`灵塑 Lv.${sf}`,`Soulforge Lv.${sf}`))}node.nodeValue=(node.nodeValue||'').replace(wrongBucket,parts.join(' · '));}
  }
  function valueFromText(text){if(/\+12|最终法则|Absolute\s*Axiom/i.test(text))return 12;if(/\+4|超限|Over[-\s]?Exalt/i.test(text))return 4;const m=text.match(/启灵\s*E?([0-3])|([0-3])\s*启/i);return m?Number(m[1]??m[2]):null}
  function sfFromText(text){const m=text.match(/(?:灵塑|Soulforge)\s*(?:Lv\.?\s*)?(\d+)/i);return m?Number(m[1]):null}
  async function patchReplay(){
    const root=document.getElementById('mrReplayResult'),api=window.MorimensReplayReview;if(!root||!api)return;const id=clean(root.querySelector('.mr2bmeta .id b')?.textContent);if(!id)return;
    try{const full=await api.fetchReplay(id),tl=api.buildTimeline(full),roles=full.battleDat?.roleData||[],cards=tl.ent?.initialCards||[],byName=new Map();
      for(const ri of roles){const actor=tl.actors?.get(String(ri.uid));if(!actor||actor.kind!=='awakener')continue;const own=cards.filter(c=>String(c.ownerUid)===String(ri.uid)),levels=[...new Set(own.map(c=>num(c.level)).filter(x=>x!=null&&x>0).map(Math.round))].sort((a,b)=>a-b);byName.set(clean(actor.name),{ri,levels})}
      for(const head of root.querySelectorAll('.mr2dhead')){const name=clean(head.querySelector('b')?.textContent),d=byName.get(name);if(!d)continue;const current=head.textContent||'';let ev=enlightenmentValue(d.ri);if(ev==null)ev=valueFromText(current);let sf=soulforgeLevel(d.ri);if(sf==null)sf=sfFromText(current);const parts=[`Lv${d.ri.level??'—'}`,ev==null?ui('启灵未记录','Enlighten unknown'):(ev<=3?(en()?`E${ev}`:`${ev}启`):ev===4?'+4':'+12')],sl=skillLabelFromLevels(d.levels);if(sl)parts.push(sl);parts.push(sf==null?ui('灵塑未记录','Soulforge unknown'):ui(`灵塑 Lv.${sf}`,`Soulforge Lv.${sf}`));let meta=head.querySelector(':scope>.mr2from');if(!meta){meta=document.createElement('span');meta.className='mr2from';head.append(meta)}meta.textContent=parts.join(' · ')}
    }catch(e){console.warn('Replay progression patch failed',e)}
  }
  async function run(){await patchSearchText();await patchReplay()}
  window.MorimensProgression={enlightenmentValue,enlightenmentLabel,coarseEnlightenment,soulforgeLevel,skillLevels,skillLabelFromLevels,patch:run};
  let queued=false;const schedule=()=>{if(queued)return;queued=true;setTimeout(async()=>{queued=false;await run()},50)};
  const start=()=>{schedule();new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,characterData:true});window.addEventListener('morimens-language-change',schedule);document.getElementById('dtideSeason')?.addEventListener('change',()=>{usageCache=null;usageKey='';schedule()})};
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start,{once:true}):start();
})();

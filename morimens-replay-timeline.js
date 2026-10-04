// Forgetful Gazette / Morimens replay round timeline.
// Primary truth: Eremora replay timeline.source IDs + observed round totals.
// Semantic enrichment: the same SKeyDB public-v3 catalogs used by the damage calculator.
// Never infer an intra-round play order: replay timeline is aggregated by round/actor/source.
(()=>{
  const FIXTURE_BASE='data/morimens/replay';
  const SOURCE_MAP_URL=`${FIXTURE_BASE}/source-map.json`;
  const isEn=()=>localStorage.getItem('morimens.language')==='en';
  const ui=(zh,en)=>isEn()?en:zh;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=s=>String(s||'').toLowerCase().replace(/[“”"'‘’「」『』·・:：\s_\-]/g,'').replace(/[^a-z0-9\u3400-\u9fff]/g,'');
  const fmt=n=>{n=Number(n)||0;if(!n)return '0';return n.toLocaleString(isEn()?'en-US':'zh-CN')};
  const sourceMapPromise=fetch(SOURCE_MAP_URL,{cache:'force-cache'}).then(r=>r.ok?r.json():null).catch(()=>null);
  let skillCatalogPromise=null;
  const detailCache=new Map();
  const battleCache=new Map();

  // Verified name pairs from Morimens-Localizations / calculator terminology.
  // Unknown names deliberately remain English rather than guessing a Chinese name.
  const ZH_NAME={
    'Strike':'打击','Defense':'防御','Poison':'中毒','Bleed':'出血','Corrosion':'侵蚀','Counter':'反击','Ancient Embers':'旧日余烬',
    'Strike to Protect':'报偿打击','Forbidden Swamp':'黑沼禁域','Undying Flower Upon Slime':'淤泥上的不灭之花',
    'Blade of Defiance':'桀骜之刃','Tides of Hubris':'恣睢之浪','Beast of Chaos':'混沌之兽',
    'Primal Chord':'原初的乐音','Soulblight':'灵魂瘟疫',"Fate's Descent":'宿命坍缩',"Illusion's End":'虚无终结'
  };
  const SLOT_ZH={Strike:'打击',Defense:'防御',Rouse:'灵知觉醒',Skill1:'技能卡一',Skill2:'技能卡二',Exalt:'狂气爆发',OverExalt:'超限爆发'};
  const SLOT_EN={Strike:'Strike',Defense:'Defense',Rouse:'Rouse',Skill1:'Skill 1',Skill2:'Skill 2',Exalt:'Exalt',OverExalt:'Over-Exalt'};

  function ensureStyle(){
    if(document.getElementById('morimensReplayTimelineStyle'))return;
    const st=document.createElement('style');st.id='morimensReplayTimelineStyle';st.textContent=`
      .dtideTimelineOpen{white-space:nowrap;border:1px solid rgba(98,183,255,.35);border-radius:7px;background:rgba(98,183,255,.09);color:#9fd0ff;padding:5px 8px;font:700 10px/1.2 inherit;cursor:pointer}.dtideTimelineOpen:hover{background:rgba(98,183,255,.18)}
      .mrReplayModal[hidden]{display:none!important}.mrReplayModal{position:fixed;inset:0;z-index:10050;background:rgba(4,8,14,.78);display:flex;align-items:flex-start;justify-content:center;padding:4vh 16px;overflow:auto}.mrReplayPanel{width:min(1120px,96vw);max-height:92vh;overflow:auto;background:#0d1724;border:1px solid rgba(148,163,184,.2);border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.5);padding:16px}.mrReplayHead{position:sticky;top:-16px;z-index:4;background:#0d1724;border-bottom:1px solid rgba(148,163,184,.12);padding:6px 0 12px;display:flex;gap:12px;align-items:flex-start;justify-content:space-between}.mrReplayHead h3{margin:0 0 5px;color:#f1d69f;font-size:17px}.mrReplayHead small{color:#8d9aac}.mrReplayClose{border:0;background:rgba(255,255,255,.08);color:#e8eef8;border-radius:8px;padding:7px 10px;cursor:pointer}.mrReplaySummary{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.mrReplaySummary span,.mrReplayBadge{border-radius:999px;padding:3px 7px;background:rgba(148,163,184,.12);font-size:11px}.mrReplayRounds{display:grid;gap:9px}.mrReplayRound{border:1px solid rgba(148,163,184,.14);border-radius:11px;background:rgba(255,255,255,.022);overflow:hidden}.mrReplayRound>summary{cursor:pointer;list-style:none;padding:9px 11px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}.mrReplayRound>summary::-webkit-details-marker{display:none}.mrReplayRound>summary b{color:#f1d69f}.mrReplayRound>summary small{color:#8d9aac}.mrReplayActors{padding:0 11px 10px;display:grid;gap:8px}.mrReplayActor{border-top:1px solid rgba(148,163,184,.11);padding-top:8px}.mrReplayActorHead{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:5px}.mrReplayActorHead b{color:#e8eef8}.mrReplaySource{display:grid;grid-template-columns:minmax(170px,1.2fr) minmax(115px,.7fr) minmax(180px,1fr);gap:8px;align-items:start;padding:6px 7px;margin:4px 0;border-radius:8px;background:rgba(255,255,255,.035);font-size:11px}.mrReplaySourceName strong{font-size:12px}.mrReplaySourceName small,.mrReplaySourceMeta small{display:block;color:#8290a2;line-height:1.45}.mrReplayNumbers{display:flex;flex-wrap:wrap;gap:5px}.mrReplayNumbers i{font-style:normal;padding:2px 5px;border-radius:5px;background:rgba(148,163,184,.1)}.mrReplayBadge.card{background:rgba(98,183,255,.17);color:#a8d6ff}.mrReplayBadge.state{background:rgba(218,132,119,.17);color:#f0aaa0}.mrReplayBadge.util{background:rgba(213,177,118,.17);color:#e5c894}.mrReplayEffect{color:#aeb9c7;line-height:1.45}.mrReplayWarn{padding:10px 12px;border:1px solid rgba(213,177,118,.24);background:rgba(213,177,118,.07);border-radius:9px;color:#c9b48f;font-size:11px;margin:10px 0}.mrReplayImport{margin-top:12px;display:flex;gap:7px;flex-wrap:wrap}.mrReplayImport button,.mrReplayImport label{border:1px solid rgba(148,163,184,.2);border-radius:7px;background:rgba(255,255,255,.05);color:#dfe7f2;padding:6px 9px;font-size:11px;cursor:pointer}.mrReplayImport input{display:none}@media(max-width:720px){.mrReplaySource{grid-template-columns:1fr}.mrReplayPanel{padding:12px}.mrReplayHead{top:-12px}}
    `;document.head.appendChild(st);
  }

  function ensureModal(){
    let root=document.getElementById('morimensReplayTimelineModal');if(root)return root;
    root=document.createElement('div');root.id='morimensReplayTimelineModal';root.className='mrReplayModal';root.hidden=true;
    root.innerHTML=`<div class="mrReplayPanel" role="dialog" aria-modal="true" aria-labelledby="mrReplayTitle"><div class="mrReplayHead"><div><h3 id="mrReplayTitle"></h3><small id="mrReplaySub"></small></div><button class="mrReplayClose" type="button">×</button></div><div id="mrReplayBody"></div></div>`;
    document.body.appendChild(root);root.querySelector('.mrReplayClose').addEventListener('click',()=>root.hidden=true);root.addEventListener('click',e=>{if(e.target===root)root.hidden=true});
    return root;
  }

  async function skillCatalog(){
    if(skillCatalogPromise)return skillCatalogPromise;
    skillCatalogPromise=(async()=>{
      try{return (await window.MorimensRepository?.catalog?.('skills'))?.records||[]}catch(e){console.warn('Replay timeline: SKeyDB catalog unavailable',e);return []}
    })();return skillCatalogPromise;
  }
  async function resolveSemantic(src,actorName){
    if(!src)return null;
    const key=`${src.id}|${actorName||''}`;if(detailCache.has(key))return detailCache.get(key);
    const p=(async()=>{
      const rows=await skillCatalog(),sn=norm(src.name),an=norm(actorName);
      let cand=rows.filter(r=>norm(r.name)===sn);
      const owner=cand.filter(r=>norm(r.ownerAwakenerName)===an);
      if(owner.length)cand=owner;
      if(cand.length!==1)return {confidence:'raw'};
      const row=cand[0];let full=row;
      try{full=await window.MorimensRepository.record('skills',row.id)}catch{}
      return {confidence:owner.length===1?'owner+name':'name',id:row.id,slot:full.slot||row.slot,cardFamily:full.cardFamily||row.cardFamily,cardTypes:full.cardTypes||row.cardTypes,countsAs:full.countsAs||row.countsAs,descriptionTemplate:full.descriptionTemplate||row.descriptionTemplate,ownerAwakenerName:full.ownerAwakenerName||row.ownerAwakenerName};
    })();detailCache.set(key,p);return p;
  }
  function typeFor(src,semantic){
    if(src.kind==='state')return {cls:'state',zh:'状态触发',en:'State trigger'};
    if(semantic?.slot==='Exalt'||semantic?.slot==='OverExalt')return {cls:'util',zh:semantic.slot==='Exalt'?'狂气爆发':'超限爆发',en:semantic.slot==='Exalt'?'Exalt':'Over-Exalt'};
    if(semantic?.slot==='Rouse')return {cls:'util',zh:'灵知觉醒',en:'Rouse'};
    if(src.kind==='skill')return {cls:'card',zh:'卡牌/技能',en:'Card / skill'};
    if(src.kind==='utilSkill')return {cls:'util',zh:'派生/被动效果',en:'Derived / passive'};
    return {cls:'util',zh:'战斗效果',en:'Battle effect'};
  }
  function displayName(src){return isEn()?src.name:(ZH_NAME[src.name]||src.name)}
  function sourceOutcome(s){
    const x=[];if(Number(s.damage))x.push(`<i>${ui('伤害','DMG')} ${fmt(s.damage)}</i>`);if(Number(s.heal))x.push(`<i>${ui('治疗','Heal')} ${fmt(s.heal)}</i>`);if(Number(s.block))x.push(`<i>${ui('格挡','Block')} ${fmt(s.block)}</i>`);return x.join('')||`<i>${ui('无直接数值','No direct value')}</i>`;
  }
  function effectText(sem){
    if(!sem?.descriptionTemplate)return '';
    const s=String(sem.descriptionTemplate).replace(/<[^>]*>/g,'').replace(/\{([^}]+)\}/g,'$1').replace(/\[([^\]]+)\]/g,'[$1]');
    return s.length>230?s.slice(0,227)+'…':s;
  }

  async function renderBattle(data,uuid){
    const root=ensureModal(),body=root.querySelector('#mrReplayBody'),title=root.querySelector('#mrReplayTitle'),sub=root.querySelector('#mrReplaySub');root.hidden=false;
    title.textContent=ui('逐回合战斗时间线','Round-by-round battle timeline');sub.textContent=uuid;body.innerHTML=`<div class="mrReplayWarn">${ui('正在解析 source ID 与 SKeyDB 卡牌身份…','Resolving source IDs against SKeyDB…')}</div>`;
    const tl=data?.timeline||{},members=new Map((data?.members||[]).map(m=>[String(m.id),m]));
    const battles=tl.battles||[],rounds=battles.flatMap(b=>b.rounds||[]),tot=tl.totals||{};
    const sourceDict=tl.sources||{};
    const resolved=new Map();
    for(const r of rounds)for(const a of r.actors||[])for(const s of a.sources||[]){const src=sourceDict[String(s.id)]||{id:s.id,name:`Source #${s.id}`,kind:s.kind};const actor=members.get(String(a.id));const rk=`${s.id}|${actor?.name||''}`;if(!resolved.has(rk))resolved.set(rk,await resolveSemantic(src,actor?.name||''));}
    const roundHtml=rounds.map((r,ri)=>{
      const actors=(r.actors||[]).map(a=>{
        const actor=members.get(String(a.id)),actorName=actor?.name||(String(a.id)==='1'?ui('队伍/系统','Team / system'):`#${a.id}`);
        const sources=(a.sources||[]).map(s=>{
          const src=sourceDict[String(s.id)]||{id:s.id,name:`Source #${s.id}`,kind:s.kind},sem=resolved.get(`${s.id}|${actor?.name||''}`)||{},typ=typeFor(src,sem),slot=sem.slot?(isEn()?SLOT_EN[sem.slot]||sem.slot:SLOT_ZH[sem.slot]||sem.slot):'',effect=effectText(sem);
          return `<div class="mrReplaySource"><div class="mrReplaySourceName"><strong>${esc(displayName(src))}</strong><span class="mrReplayBadge ${typ.cls}">${esc(isEn()?typ.en:typ.zh)}</span><small>source #${esc(src.id)} · ${esc(src.kind||s.kind||'—')}${src.hidden?` · ${ui('隐藏状态','hidden')}`:''}</small></div><div class="mrReplaySourceMeta"><div class="mrReplayNumbers">${sourceOutcome(s)}</div><small>${sem.id?`SKeyDB: ${esc(sem.id)}`:ui('未匹配到唯一 SKeyDB 记录','No unique SKeyDB match')}${slot?` · ${esc(slot)}`:''}${sem.confidence&&sem.confidence!=='raw'?` · ${esc(sem.confidence)}`:''}</small></div><div class="mrReplayEffect">${effect?esc(effect):ui('本时间线只确认该 source 在本回合产生的直接伤害/治疗/格挡；未从资料源确认的附加状态不会推测。','Timeline confirms direct DMG/heal/block only; unverified secondary effects are not inferred.')}</div></div>`;
        }).join('');
        return `<div class="mrReplayActor"><div class="mrReplayActorHead"><b>${esc(actorName)}</b><small>${ui('伤害','DMG')} ${fmt(a.damage)} · ${ui('治疗','Heal')} ${fmt(a.heal)} · ${ui('格挡','Block')} ${fmt(a.block)}</small></div>${sources}</div>`;
      }).join('');
      return `<details class="mrReplayRound"${ri<2?' open':''}><summary><b>${ui(`第 ${r.round} 回合`,`Round ${r.round}`)}</b><small>${ui('伤害','DMG')} ${fmt(r.damage)} · ${ui('治疗','Heal')} ${fmt(r.heal)} · ${ui('格挡','Block')} ${fmt(r.block)}</small></summary><div class="mrReplayActors">${actors}</div></details>`;
    }).join('');
    body.innerHTML=`<div class="mrReplaySummary"><span>${ui('回合','Rounds')} ${rounds.length}</span><span>${ui('总伤害','Total DMG')} ${fmt(tot.damage??battles.reduce((n,b)=>n+(Number(b.damage)||0),0))}</span><span>${ui('总治疗','Total Heal')} ${fmt(tot.heal??battles.reduce((n,b)=>n+(Number(b.heal)||0),0))}</span><span>${ui('总格挡','Total Block')} ${fmt(tot.block??battles.reduce((n,b)=>n+(Number(b.block)||0),0))}</span></div><div class="mrReplayWarn">${ui('注意：Eremora 的 timeline 按“回合 → 角色 → source”汇总，没有同一回合内的事件序号，因此这里不会虚构卡牌先后顺序。source ID 与实际数值来自回放；卡牌槽位/说明由 SKeyDB（与伤害计算器同源）按角色+名称交叉匹配。','Note: Eremora timeline aggregates by round → actor → source and does not expose an intra-round event sequence. No play order is invented. Source IDs/values are replay data; card slot/descriptions are cross-matched against the same SKeyDB data used by the damage calculator.')}</div><div class="mrReplayRounds">${roundHtml}</div><div class="mrReplayImport"><label>${ui('导入其他 Eremora __data.json','Import another Eremora __data.json')}<input id="mrReplayFile" type="file" accept=".json,.txt,application/json,text/plain"></label></div>`;
    root.querySelector('#mrReplayFile')?.addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{const parsed=parseSveltekitReplay(await f.text(),uuid);if(!parsed)throw new Error(ui('文件中未找到该 battleUuid','battleUuid not found in file'));battleCache.set(uuid,parsed);await renderBattle(parsed,uuid)}catch(err){alert(err.message)}});
  }

  // Minimal devalue/SvelteKit hydrator for user-exported Eremora __data.json.
  function parseSveltekitReplay(text,targetUuid){
    const lines=String(text||'').split(/\r?\n/);for(const line of lines){let o;try{o=JSON.parse(line)}catch{continue}const a=o?.type==='chunk'?o.data:null;if(!Array.isArray(a))continue;
      const memo=new Map(),active=new Set();
      const hv=x=>typeof x==='number'?hi(x):Array.isArray(x)?x.map(hv):(x&&typeof x==='object'?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,hv(v)])):x);
      const hi=i=>{if(!Number.isInteger(i)||i<0||i>=a.length)return i<0?null:i;if(memo.has(i))return memo.get(i);if(active.has(i))return null;active.add(i);const v=a[i];let out;if(Array.isArray(v)){out=[];memo.set(i,out);out.push(...v.map(hv))}else if(v&&typeof v==='object'){out={};memo.set(i,out);for(const [k,x] of Object.entries(v))out[k]=hv(x)}else{out=v;memo.set(i,out)}active.delete(i);return out};
      for(let i=0;i<a.length;i++){const raw=a[i];if(!(raw&&typeof raw==='object'&&!Array.isArray(raw)&&'battle_uuid' in raw&&'timeline' in raw))continue;let b;try{b=hi(i)}catch{continue}if(String(b?.battle_uuid||'')!==String(targetUuid))continue;return {schemaVersion:1,battleUuid:b.battle_uuid,stage:b.stage||{},totalBout:b.total_bout,members:b.members||b.awakers||[],timeline:b.timeline};}
    }return null;
  }

  async function loadBattle(uuid){
    if(battleCache.has(uuid))return battleCache.get(uuid);
    const p=(async()=>{const r=await fetch(`${FIXTURE_BASE}/${encodeURIComponent(uuid)}.json`,{cache:'force-cache'});if(r.ok)return r.json();return null})();battleCache.set(uuid,p);const v=await p;battleCache.set(uuid,v);return v;
  }
  async function open(uuid){
    ensureStyle();const root=ensureModal(),body=root.querySelector('#mrReplayBody');root.hidden=false;root.querySelector('#mrReplayTitle').textContent=ui('逐回合战斗时间线','Round-by-round battle timeline');root.querySelector('#mrReplaySub').textContent=uuid;body.innerHTML=`<div class="mrReplayWarn">${ui('正在载入回放时间线…','Loading replay timeline…')}</div>`;
    const data=await loadBattle(uuid);if(data)return renderBattle(data,uuid);
    body.innerHTML=`<div class="mrReplayWarn">${ui('仓库中还没有这条 battleUuid 的标准化时间线。可以先导入从 Eremora 保存的 __data.json；解析只在本地浏览器中进行。','No normalized timeline for this battleUuid is stored in the repository yet. Import a saved Eremora __data.json; parsing is local in your browser.')}</div><div class="mrReplayImport"><label>${ui('选择 __data.json','Choose __data.json')}<input id="mrReplayFileEmpty" type="file" accept=".json,.txt,application/json,text/plain"></label></div>`;
    root.querySelector('#mrReplayFileEmpty')?.addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{const parsed=parseSveltekitReplay(await f.text(),uuid);if(!parsed)throw new Error(ui('文件中未找到该 battleUuid','battleUuid not found in file'));battleCache.set(uuid,parsed);await renderBattle(parsed,uuid)}catch(err){alert(err.message)}});
  }
  function enhance(root=document){
    root.querySelectorAll?.('.dtideReplayCopy').forEach(copy=>{if(copy.dataset.timelineBound)return;copy.dataset.timelineBound='1';const uuid=String(copy.dataset.replayCode||'').split('#')[0];if(!uuid)return;const b=document.createElement('button');b.type='button';b.className='dtideTimelineOpen';b.textContent=ui('回合时间线','Timeline');b.dataset.battleUuid=uuid;b.addEventListener('click',()=>open(uuid));copy.insertAdjacentElement('afterend',b)});
  }
  ensureStyle();enhance();new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes)if(n.nodeType===1)enhance(n)}).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('morimens-language-change',()=>{document.querySelectorAll('.dtideTimelineOpen').forEach(b=>b.textContent=ui('回合时间线','Timeline'))});
  window.MorimensReplayTimeline={open,parseSveltekitReplay,resolveSemantic,sourceMap:()=>sourceMapPromise};
})();

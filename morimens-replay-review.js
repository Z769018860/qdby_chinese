// Standalone replay review tab for Forgetful Gazette.
// Important: a replay code is an identifier (UUID + short tags), not an encrypted
// copy of the battle. This module NEVER invents timeline data from the UUID.
// It only renders plaintext timelines already stored under data/morimens/replay/.
(()=>{
  const BASE='data/morimens/replay';
  const isEn=()=>localStorage.getItem('morimens.language')==='en';
  const ui=(zh,en)=>isEn()?en:zh;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const norm=s=>String(s||'').toLowerCase().replace(/[“”"'‘’「」『』·・:：\s_\-]/g,'').replace(/[^a-z0-9\u3400-\u9fff]/g,'');
  const fmt=n=>(Number(n)||0).toLocaleString(isEn()?'en-US':'zh-CN');
  const cache=new Map(),detailCache=new Map();let skillCatalogPromise=null;
  const ZH={
    Strike:'打击',Defense:'防御',Poison:'中毒',Bleed:'出血',Corrosion:'侵蚀',Counter:'反击','Ancient Embers':'旧日余烬',
    'Eye of Eternity':'万古之眸',Decomposition:'石质分解','A Small Wish':'小小愿望','Crimson Furnace':'猩红熔炉',
    'Strike to Protect':'报偿打击','Forbidden Swamp':'黑沼禁域','Undying Flower Upon Slime':'淤泥上的不灭之花',
    'Blade of Defiance':'桀骜之刃','Tides of Hubris':'恣睢之浪','Beast of Chaos':'混沌之兽','Primal Chord':'原初的乐音',
    Soulblight:'灵魂瘟疫',"Fate's Descent":'宿命坍缩',"Illusion's End":'虚无终结'
  };
  const SLOT_ZH={Strike:'打击',Defense:'防御',Rouse:'灵知觉醒',Skill1:'技能卡一',Skill2:'技能卡二',Exalt:'狂气爆发',OverExalt:'超限爆发'};

  function cleanText(s){
    s=String(s??'');
    if(!/[ÃÂâæåçèéêëìíîïðñòóôõö÷øùúûüýþ]/.test(s)||typeof TextDecoder==='undefined')return s;
    try{const b=Uint8Array.from([...s].map(c=>c.charCodeAt(0)&255)),x=new TextDecoder('utf-8',{fatal:true}).decode(b);return /�/.test(x)?s:x}catch{return s}
  }
  function parseReplayCode(raw){
    const text=String(raw||'').trim();
    const m=text.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:#([^#\s]+)#([^#\s]+))?/i);
    if(!m)return null;
    const uuid=m[1].toLowerCase(),hex=uuid.replace(/-/g,''),version=parseInt(hex[12],16),vn=parseInt(hex[16],16);
    const variant=(vn&8)===0?'NCS':(vn&12)===8?'RFC 4122/9562':(vn&14)===12?'Microsoft':'future';
    return {raw:text,uuid,tag1:m[2]||'',tag2:m[3]||'',version,variant};
  }
  async function skillCatalog(){
    if(skillCatalogPromise)return skillCatalogPromise;
    return skillCatalogPromise=(async()=>{try{return (await window.MorimensRepository?.catalog?.('skills'))?.records||[]}catch{return []}})();
  }
  async function semantic(src,actorName){
    const key=`${src?.id}|${actorName||''}`;if(detailCache.has(key))return detailCache.get(key);
    const task=(async()=>{
      const rows=await skillCatalog(),sn=norm(cleanText(src?.name)),an=norm(actorName);let cand=rows.filter(r=>norm(r.name)===sn);
      const owned=cand.filter(r=>norm(r.ownerAwakenerName)===an);if(owned.length)cand=owned;if(cand.length!==1)return null;
      let full=cand[0];try{full=await window.MorimensRepository.record('skills',cand[0].id)}catch{}
      return {id:cand[0].id,slot:full.slot||cand[0].slot,descriptionTemplate:full.descriptionTemplate||cand[0].descriptionTemplate,owner:full.ownerAwakenerName||cand[0].ownerAwakenerName};
    })();detailCache.set(key,task);return task;
  }
  function displayName(src){const n=cleanText(src?.name||`Source #${src?.id??'?'}`);return isEn()?n:(ZH[n]||n)}
  function outcome(s){const a=[];if(Number(s.damage))a.push(`${ui('伤害','DMG')} ${fmt(s.damage)}`);if(Number(s.heal))a.push(`${ui('治疗','Heal')} ${fmt(s.heal)}`);if(Number(s.block))a.push(`${ui('格挡','Block')} ${fmt(s.block)}`);return a.join(' · ')||ui('无直接数值','No direct value')}
  function desc(sem){if(!sem?.descriptionTemplate)return '';let s=String(sem.descriptionTemplate).replace(/<[^>]*>/g,'').replace(/\{([^}]+)\}/g,'$1');return s.length>260?s.slice(0,257)+'…':s}
  function sourceType(kind,slot){
    if(kind==='state')return [ui('状态触发','State trigger'),'state'];
    if(kind==='utilSkill')return [ui('派生/被动','Derived / passive'),'util'];
    if(slot==='Exalt'||slot==='OverExalt'||slot==='Rouse')return [isEn()?slot:(SLOT_ZH[slot]||slot),'util'];
    if(kind==='skill')return [ui('卡牌/技能','Card / skill'),'card'];
    return [ui('战斗效果','Battle effect'),'util'];
  }
  async function loadKnown(uuid){
    if(cache.has(uuid))return cache.get(uuid);
    const task=fetch(`${BASE}/${encodeURIComponent(uuid)}.json`,{cache:'no-cache'}).then(async r=>r.ok?await r.json():null).catch(()=>null);
    cache.set(uuid,task);const x=await task;cache.set(uuid,x);return x;
  }

  function styles(){
    if(document.getElementById('morimensReplayReviewStyle'))return;
    const s=document.createElement('style');s.id='morimensReplayReviewStyle';s.textContent=`
      .mrReviewPanel{display:grid;gap:14px}.mrReviewIntro{padding:17px;border:1px solid rgba(213,177,118,.22);border-radius:15px;background:linear-gradient(135deg,rgba(213,177,118,.07),rgba(98,183,255,.04))}.mrReviewIntro h2{margin:0;color:#f1d69f;font-size:20px}.mrReviewIntro p{margin:8px 0 0;color:#aeb8c7;font-size:12px;line-height:1.75}.mrReviewForm{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;margin-top:14px}.mrReviewForm input{min-height:43px;border:1px solid #334155;border-radius:10px;background:#0d1724;color:#edf2f7;padding:8px 11px;font:inherit}.mrReviewForm button{border:1px solid rgba(213,177,118,.35);border-radius:10px;background:rgba(213,177,118,.12);color:#f1d69f;padding:8px 13px;font-weight:800;cursor:pointer}.mrReviewForm button.secondary{border-color:rgba(148,163,184,.22);background:rgba(148,163,184,.08);color:#b8c4d4}.mrReviewStatus{padding:10px 12px;border-radius:10px;background:rgba(148,163,184,.07);border:1px solid rgba(148,163,184,.15);font-size:11px;color:#9ba8ba;line-height:1.65}.mrReviewStatus.ok{border-color:rgba(86,190,138,.25);color:#9fd5b8}.mrReviewStatus.warn{border-color:rgba(213,177,118,.28);color:#d8c199}.mrReviewDiag{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.mrReviewDiag div,.mrReviewTotals span{padding:9px 10px;border-radius:10px;background:rgba(255,255,255,.035);border:1px solid rgba(148,163,184,.1)}.mrReviewDiag small,.mrReviewTotals small{display:block;color:#758398;font-size:9px}.mrReviewDiag strong,.mrReviewTotals strong{display:block;color:#e6edf6;margin-top:3px;font-size:12px;word-break:break-all}.mrReviewTotals{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.mrReviewSegment{border:1px solid rgba(148,163,184,.15);border-radius:14px;overflow:hidden;background:rgba(4,9,16,.3)}.mrReviewSegmentHead{padding:11px 13px;display:flex;justify-content:space-between;gap:10px;align-items:center;background:rgba(255,255,255,.03)}.mrReviewSegmentHead b{color:#ead9b9}.mrReviewSegmentHead small{color:#8390a2}.mrReplayRound{border-top:1px solid rgba(148,163,184,.1)}.mrReplayRound>summary{cursor:pointer;list-style:none;padding:10px 12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}.mrReplayRound>summary::-webkit-details-marker{display:none}.mrReplayRound>summary b{color:#f1d69f}.mrReplayRound>summary small{color:#8896a8}.mrRoundBody{padding:0 12px 12px}.mrRoundCards{display:flex;gap:5px;flex-wrap:wrap;padding:8px 0}.mrRoundCards span{font-size:10px;padding:4px 7px;border-radius:999px;background:rgba(98,183,255,.08);border:1px solid rgba(98,183,255,.15);color:#acd4f5}.mrActor{padding:8px 0;border-top:1px solid rgba(148,163,184,.08)}.mrActorHead{display:flex;justify-content:space-between;gap:8px;font-size:11px}.mrActorHead b{color:#dce5f0}.mrActorHead small{color:#7f8da0}.mrSource{display:grid;grid-template-columns:minmax(180px,1fr) minmax(130px,.7fr) minmax(200px,1.2fr);gap:9px;padding:7px 8px;margin-top:5px;border-radius:8px;background:rgba(255,255,255,.028);font-size:11px}.mrSource strong{font-size:12px}.mrSource small{display:block;color:#738196;line-height:1.45}.mrBadge{display:inline-block;margin-left:6px;padding:2px 5px;border-radius:999px;font-size:9px}.mrBadge.card{background:rgba(98,183,255,.16);color:#a9d6ff}.mrBadge.state{background:rgba(218,132,119,.15);color:#eeaca3}.mrBadge.util{background:rgba(213,177,118,.15);color:#dec293}.mrSourceEffect{color:#aeb8c7;line-height:1.5}.mrImpossible{padding:14px;border-radius:12px;border:1px solid rgba(218,132,119,.24);background:rgba(218,132,119,.06);color:#d5a5a0;font-size:12px;line-height:1.75}.dtideReplayReviewOpen{white-space:nowrap;border:1px solid rgba(98,183,255,.35);border-radius:7px;background:rgba(98,183,255,.09);color:#9fd0ff;padding:5px 8px;font:700 10px/1.2 inherit;cursor:pointer}@media(max-width:780px){.mrReviewForm{grid-template-columns:1fr}.mrReviewDiag,.mrReviewTotals{grid-template-columns:repeat(2,minmax(0,1fr))}.mrSource{grid-template-columns:1fr}}`;
    document.head.appendChild(s);
  }

  function diagnostics(parsed){return `<div class="mrReviewDiag"><div><small>battleUuid</small><strong>${esc(parsed.uuid)}</strong></div><div><small>${ui('UUID 版本','UUID version')}</small><strong>v${esc(parsed.version)}</strong></div><div><small>${ui('变体','Variant')}</small><strong>${esc(parsed.variant)}</strong></div><div><small>${ui('回放后缀','Replay tags')}</small><strong>${esc(parsed.tag1&&parsed.tag2?`#${parsed.tag1}#${parsed.tag2}`:'—')}</strong></div></div>`}

  async function renderBattle(data,parsed){
    const host=document.getElementById('mrReplayResult');if(!host)return;host.innerHTML=`<div class="mrReviewStatus">${ui('正在用 source ID 与 SKeyDB 补全卡牌/技能语义…','Resolving source IDs against SKeyDB…')}</div>`;
    const tl=data?.timeline||{},members=new Map((data?.members||[]).map(m=>[String(m.id),m])),sourceDict=tl.sources||{},segments=tl.battles||[],tot=tl.totals||{};
    const resolved=new Map();for(const seg of segments)for(const r of seg.rounds||[])for(const a of r.actors||[])for(const ev of a.sources||[]){const actor=members.get(String(a.id)),src={...(sourceDict[String(ev.id)]||{id:ev.id,name:`Source #${ev.id}`}),kind:ev.kind||sourceDict[String(ev.id)]?.kind};const k=`${ev.id}|${actor?.name||''}`;if(!resolved.has(k))resolved.set(k,await semantic(src,actor?.name||''));}
    const segmentHtml=segments.map((seg,si)=>{
      const rounds=(seg.rounds||[]).map((r,ri)=>{
        const cards=[];for(const a of r.actors||[]){const actor=members.get(String(a.id)),an=actor?.name||(String(a.id)==='1'?ui('队伍/系统','Team / system'):`#${a.id}`);for(const ev of a.sources||[]){const raw=sourceDict[String(ev.id)]||{id:ev.id,name:`Source #${ev.id}`},kind=ev.kind||raw.kind;if(kind==='skill'||kind==='utilSkill')cards.push(`${an} · ${displayName(raw)} → ${outcome(ev)}`)}}
        const actorHtml=(r.actors||[]).map(a=>{const actor=members.get(String(a.id)),an=actor?.name||(String(a.id)==='1'?ui('队伍/系统','Team / system'):`#${a.id}`);const rows=(a.sources||[]).map(ev=>{const raw=sourceDict[String(ev.id)]||{id:ev.id,name:`Source #${ev.id}`},src={...raw,kind:ev.kind||raw.kind},sem=resolved.get(`${ev.id}|${actor?.name||''}`),[label,cls]=sourceType(src.kind,sem?.slot),slot=sem?.slot?(isEn()?sem.slot:(SLOT_ZH[sem.slot]||sem.slot)):'',effect=desc(sem);return `<div class="mrSource"><div><strong>${esc(displayName(src))}</strong><span class="mrBadge ${cls}">${esc(label)}</span><small>source #${esc(src.id)} · ${esc(src.kind||'—')}${src.hidden?` · ${ui('隐藏状态','hidden')}`:''}</small></div><div><strong>${esc(outcome(ev))}</strong><small>${sem?.id?`SKeyDB: ${esc(sem.id)}${slot?` · ${esc(slot)}`:''}`:ui('未唯一匹配 SKeyDB','No unique SKeyDB match')}</small></div><div class="mrSourceEffect">${effect?esc(effect):ui('这里只显示明文 timeline 已记录的直接结果；未记录的附加效果不会猜测。','Only direct results present in plaintext timeline are shown; unrecorded secondary effects are not inferred.')}</div></div>`}).join('');return `<div class="mrActor"><div class="mrActorHead"><b>${esc(an)}</b><small>${ui('伤害','DMG')} ${fmt(a.damage)} · ${ui('治疗','Heal')} ${fmt(a.heal)} · ${ui('格挡','Block')} ${fmt(a.block)}</small></div>${rows}</div>`}).join('');
        return `<details class="mrReplayRound"${ri<2?' open':''}><summary><b>${ui(`第 ${r.round} 回合`,`Round ${r.round}`)}</b><small>${ui('伤害','DMG')} ${fmt(r.damage)} · ${ui('治疗','Heal')} ${fmt(r.heal)} · ${ui('格挡','Block')} ${fmt(r.block)}</small></summary><div class="mrRoundBody"><div class="mrRoundCards">${cards.length?cards.map(x=>`<span>${esc(x)}</span>`).join(''):`<span>${ui('本回合无可识别卡牌/技能来源','No identified card/skill source this round')}</span>`}</div>${actorHtml}</div></details>`;
      }).join('');
      const kind=seg.kind==='boss'?ui('Boss 战','Boss'):seg.kind==='normal'?ui('普通战斗','Normal battle'):(seg.kind||ui(`战斗 ${si+1}`,`Battle ${si+1}`));return `<section class="mrReviewSegment"><div class="mrReviewSegmentHead"><b>${esc(kind)}</b><small>${ui('伤害','DMG')} ${fmt(seg.damage)} · ${ui('治疗','Heal')} ${fmt(seg.heal)} · ${ui('格挡','Block')} ${fmt(seg.block)}</small></div>${rounds}</section>`;
    }).join('');
    const totalRounds=segments.reduce((n,s)=>n+(s.rounds?.length||0),0);host.innerHTML=`${diagnostics(parsed)}<div class="mrReviewStatus ok">${ui('命中本站已保存的明文 timeline；没有访问 Eremora，也没有用 UID、赛季或榜单数据补全。','Matched a plaintext timeline stored on this site; no Eremora, UID, season, or leaderboard lookup was used.')}</div><div class="mrReviewTotals"><span><small>${ui('关卡','Stage')}</small><strong>${esc(cleanText(data?.stage?.name||'—'))}</strong></span><span><small>${ui('战斗段','Segments')}</small><strong>${segments.length}</strong></span><span><small>${ui('总回合','Rounds')}</small><strong>${totalRounds}</strong></span><span><small>${ui('总伤害','Total DMG')}</small><strong>${fmt(tot.damage)}</strong></span><span><small>${ui('总治疗','Total Heal')}</small><strong>${fmt(tot.heal)}</strong></span><span><small>${ui('总格挡','Total Block')}</small><strong>${fmt(tot.block)}</strong></span></div><div class="mrReviewStatus warn">${ui('timeline 只提供“战斗段 → 回合 → 角色 → source”的聚合明文，没有同一回合内部的 eventIndex，因此可以确定本回合出现了哪些卡牌/技能/状态及其结果，但不能凭空恢复同回合严格出牌先后。','The plaintext timeline is aggregated as segment → round → actor → source and contains no intra-round eventIndex. It identifies cards/skills/states and their results for each round, but cannot reconstruct a strict within-round order that is not present.')}</div>${segmentHtml}`;
  }

  async function analyze(raw){
    const input=document.getElementById('mrReplayCode'),host=document.getElementById('mrReplayResult');if(input&&raw!=null)input.value=raw;const parsed=parseReplayCode(raw??input?.value);if(!host)return;
    if(!parsed){host.innerHTML=`<div class="mrImpossible">${ui('无法识别回放 ID。请输入标准 UUID，或完整格式 UUID#E#a。','Could not parse replay ID. Enter a UUID or full UUID#E#a code.')}</div>`;return}
    host.innerHTML=`${diagnostics(parsed)}<div class="mrReviewStatus">${ui('正在检查本站已有的明文 timeline…','Checking locally stored plaintext timeline…')}</div>`;
    const data=await loadKnown(parsed.uuid);if(data){await renderBattle(data,parsed);return}
    host.innerHTML=`${diagnostics(parsed)}<div class="mrImpossible"><strong>${ui('这个 ID 本身无法解密出 timeline。','This ID cannot itself be decrypted into a timeline.')}</strong><br>${ui(`当前输入只提供一个 128-bit UUID${parsed.tag1?` 和后缀 #${parsed.tag1}#${parsed.tag2}`:''}。UUID v${parsed.version} 是标识/散列空间，不包含几十回合的卡牌、伤害、状态事件正文；本站现有明文中也尚未保存 ${parsed.uuid} 对应的 timeline。因此这里不会伪造回合数据。`,`The input only contains a 128-bit UUID${parsed.tag1?` plus #${parsed.tag1}#${parsed.tag2}`:''}. UUID v${parsed.version} is an identifier/hash space, not a container for dozens of rounds of card, damage and state events. No plaintext timeline for ${parsed.uuid} is currently stored locally, so no round data is fabricated.`)}</div>`;
  }

  function activateTab(){
    const tabs=document.getElementById('morimensTabs'),tab=document.getElementById('morimensReplayTab'),panel=document.getElementById('morimensReplayPanel');if(!tabs||!tab||!panel)return;
    tabs.querySelectorAll('.morimensTab').forEach(x=>x.setAttribute('aria-selected',String(x===tab)));
    tabs.querySelectorAll('.morimensTab[aria-controls]').forEach(x=>{const p=document.getElementById(x.getAttribute('aria-controls'));if(p)p.hidden=x!==tab});
    panel.hidden=false;history.replaceState(null,'','#replay');
  }
  function enhance(root=document){root.querySelectorAll?.('.dtideReplayCopy').forEach(copy=>{if(copy.dataset.reviewBound)return;copy.dataset.reviewBound='1';const uuid=String(copy.dataset.replayCode||'').split('#')[0];if(!uuid)return;const b=document.createElement('button');b.type='button';b.className='dtideReplayReviewOpen';b.textContent=ui('战斗复盘','Replay review');b.addEventListener('click',()=>{activateTab();analyze(copy.dataset.replayCode||uuid)});copy.insertAdjacentElement('afterend',b)})}
  function setup(){
    const tabs=document.getElementById('morimensTabs');if(!tabs)return false;styles();if(document.getElementById('morimensReplayTab'))return true;
    const tab=document.createElement('button');tab.className='morimensTab';tab.id='morimensReplayTab';tab.setAttribute('role','tab');tab.setAttribute('aria-selected','false');tab.setAttribute('aria-controls','morimensReplayPanel');tab.textContent=ui('战斗回放复盘','Replay Review');
    const anchor=document.getElementById('morimensDtideTab');anchor?.insertAdjacentElement('afterend',tab)||tabs.appendChild(tab);
    const panel=document.createElement('div');panel.id='morimensReplayPanel';panel.setAttribute('role','tabpanel');panel.hidden=true;panel.innerHTML=`<section class="panel mrReviewPanel"><div class="mrReviewIntro"><h2>${ui('战斗回放复盘','Battle Replay Review')}</h2><p>${ui('输入游戏中的完整回放码（例如 UUID#E#a）或 battleUuid。该页面不从 Eremora 查询玩家、赛季或榜单，只解析 ID 并读取本站已经保存的明文 timeline。','Enter a full in-game replay code (for example UUID#E#a) or battleUuid. This page does not query Eremora players, seasons or leaderboards; it parses the ID and reads plaintext timelines already stored locally.')}</p><div class="mrReviewForm"><input id="mrReplayCode" spellcheck="false" autocomplete="off" placeholder="0a77841c-a00e-35d6-994a-f5034e9fe22a#E#a"><button id="mrReplayGo" type="button">${ui('解析并复盘','Parse & Review')}</button><button id="mrReplayExample" class="secondary" type="button">${ui('载入当前明文样本','Load plaintext sample')}</button></div></div><div id="mrReplayResult"><div class="mrReviewStatus">${ui('等待输入回放 ID。','Waiting for a replay ID.')}</div></div></section>`;
    tabs.insertAdjacentElement('afterend',panel);tab.addEventListener('click',activateTab);panel.querySelector('#mrReplayGo').addEventListener('click',()=>analyze());panel.querySelector('#mrReplayCode').addEventListener('keydown',e=>{if(e.key==='Enter')analyze()});panel.querySelector('#mrReplayExample').addEventListener('click',()=>analyze('0a77841c-a00e-35d6-994a-f5034e9fe22a#E#a'));
    tabs.addEventListener('click',e=>{const t=e.target.closest('.morimensTab');if(t&&t!==tab){panel.hidden=true;tab.setAttribute('aria-selected','false')}},true);
    enhance();new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes)if(n.nodeType===1)enhance(n)}).observe(document.body,{subtree:true,childList:true});
    if(location.hash==='#replay')activateTab();return true;
  }
  if(!setup()){const mo=new MutationObserver(()=>{if(setup())mo.disconnect()});mo.observe(document.documentElement,{subtree:true,childList:true})}
  window.addEventListener('morimens-language-change',()=>{const t=document.getElementById('morimensReplayTab');if(t)t.textContent=ui('战斗回放复盘','Replay Review')});
  window.MorimensReplayReview={parseReplayCode,loadKnown,analyze,open:raw=>{activateTab();return analyze(raw)}};
})();

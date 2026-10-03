// D-Zone map & monster browser: zones -> threat levels -> monsters (data synced from SKeyDB, see scripts/sync_morimens_dzone.mjs).
(()=>{
  'use strict';
  const zh=()=>localStorage.getItem('morimens.language')!=='en';
  const ui=(cn,en)=>zh()?cn:en;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const BASE='data/morimens/skeydb/dzone/';
  const state={active:false,season:null,index:null,seasons:new Map(),info:new Map(),wiki:null,tr:null,byMon:null,byName:null,kd:null,kdZh:null,skEn:null,game:{},cw:{},error:null,loading:null,openMon:new Set(),openZone:new Set(),openAlert:new Set(),zoneInit:new Set()};
  let host=null,ctx=null;

  function ensureStyle(){
    if(document.getElementById('dtideZonesStyle'))return;
    const s=document.createElement('style');s.id='dtideZonesStyle';
    s.textContent=`
      .dtideZones{margin-top:18px}.dtideZones h3{font-size:15px;margin:0 0 6px;color:#ead9b9}
      .dzNote{color:#8290a2;font-size:12px;margin:0 0 10px}.dzBar{display:flex;gap:10px;flex-wrap:wrap;align-items:end;margin:10px 0}
      .dzBar label{display:block;font-size:11px;color:#8290a2;margin-bottom:3px}.dzBar select{min-width:260px;max-width:100%;background:#111827;color:#dbe4f0;border:1px solid rgba(148,163,184,.3);border-radius:8px;padding:8px 10px}
      .dzMeta{font-size:12px;color:#aab6c8;display:flex;gap:14px;flex-wrap:wrap;margin:6px 0 12px}
      .dzZone{border:1px solid rgba(148,163,184,.2);border-radius:10px;margin:10px 0;background:rgba(15,25,39,.6)}
      .dzZone>summary{cursor:pointer;padding:10px 14px;font-weight:700;color:#ead9b9;list-style:none;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
      .dzZone>summary::-webkit-details-marker{display:none}.dzZone>summary:before{content:'▸';color:#8290a2}.dzZone[open]>summary:before{content:'▾'}
      .dzZoneBody{padding:0 14px 12px}
      .dzRelics{display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 10px;align-items:center;font-size:12px;color:#8290a2}
      .dzRelic{display:inline-flex;gap:5px;align-items:center;border:1px solid rgba(148,163,184,.2);border-radius:999px;padding:2px 9px 2px 3px;background:#111827;color:#dbe4f0}
      .dzRelic img{width:22px;height:22px;border-radius:50%;object-fit:cover}
      .dzAlert{border:1px solid rgba(148,163,184,.14);border-radius:8px;margin:7px 0;background:#0f1927}
      .dzAlert>summary{cursor:pointer;padding:7px 12px;list-style:none;display:flex;gap:12px;align-items:center;flex-wrap:wrap;font-size:13px;color:#dbe4f0}
      .dzAlert>summary::-webkit-details-marker{display:none}.dzAlert>summary:before{content:'▸';color:#8290a2}.dzAlert[open]>summary:before{content:'▾'}
      .dzAlert .dzTag{margin-left:auto;font-size:11px;color:#8290a2;display:flex;gap:10px}
      .dzMonsters{padding:2px 10px 10px;overflow:auto}.dzTable{width:100%;border-collapse:collapse;font-size:12px}
      .dzTable th,.dzTable td{padding:6px 8px;border-bottom:1px solid rgba(148,163,184,.1);text-align:left;vertical-align:top}
      .dzTable th{color:#8290a2;font-weight:600;white-space:nowrap}.dzTable td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
      .dzMon{display:flex;gap:8px;align-items:center;min-width:150px}.dzMon img{width:40px;height:40px;border-radius:8px;object-fit:cover;background:#111827;flex:none}
      .dzBadge{font-size:10px;border-radius:4px;padding:1px 5px;margin-left:5px;font-weight:700}.dzBadge.Boss{background:#7f1d1d;color:#fecaca}.dzBadge.Elite{background:#78350f;color:#fde68a}
      .dzChar{display:inline-block;font-size:11px;border:1px solid rgba(148,163,184,.25);border-radius:999px;padding:0 7px;margin:1px 3px 1px 0;color:#c7d2e2;cursor:help}
      .dzDesc{color:#8290a2;max-width:360px;white-space:normal;line-height:1.35}
      .dzCaret{width:12px;color:#8290a2;flex:none;text-align:center}.dzHasIntel{cursor:pointer}.dzHasIntel:hover td{background:rgba(241,214,159,.05)}
      .dzSub{display:block;color:#8290a2;font-size:11px;font-weight:400}
      .dzIntel>td{background:#0b1320;padding:10px 14px!important}.dzIntelBody{font-size:12px;color:#c7d2e2}
      .dzStats{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:8px;color:#8290a2}.dzStats b{color:#ead9b9;font-variant-numeric:tabular-nums}
      .dzSec{font-size:12px;font-weight:700;color:#ead9b9;margin:10px 0 5px}
      .dzPat{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:4px 0}.dzPatName{min-width:64px;color:#8290a2}
      .dzIntent{display:inline-flex;flex-direction:column;border:1px solid rgba(148,163,184,.25);border-radius:8px;padding:3px 9px;background:#111827;cursor:help}.dzIntent small{color:#8290a2;font-size:10px}
      .dzIntent{flex-direction:row!important;align-items:center;gap:7px}.dzIntentText{display:flex;flex-direction:column}.dzIcon{width:28px;height:28px;object-fit:contain;flex:none}.dzIconSm{width:20px;height:20px}.dzTypeCell{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
      .dzArrow{color:#566377}.dzScroll{overflow:auto}.dzSkill td.dzKo{white-space:normal;min-width:260px;color:#aab6c8}.dzSkill td b{color:#ead9b9}
      .dzWiki{color:#c7d2e2;line-height:1.5}.dzWikiPat{white-space:pre-line;color:#aab6c8;margin-top:4px}
      .dzList{margin:4px 0 0;padding-left:18px;color:#aab6c8;line-height:1.5}
      .dzSeasons{min-width:160px;font-size:11px;line-height:1.5;color:#aab6c8}.dzSeasons b{color:#ead9b9}.dzSeasons small{color:#8290a2;display:block}
      .dzEmpty{color:#8290a2;padding:12px;font-size:13px}
      @media(max-width:700px){.dzDesc{display:none}.dzAlert .dzTag{margin-left:0}}`;
    document.head.appendChild(s);
  }

  async function getJson(url){const r=await fetch(url,{cache:'no-cache'});if(!r.ok)throw new Error(`${url}: HTTP ${r.status}`);return r.json()}
  function load(){
    if(state.index)return Promise.resolve();
    if(!state.loading)state.loading=getJson(BASE+'index.json').then(d=>{state.index=d}).catch(e=>{state.error=e;state.loading=null;throw e});
    return state.loading;
  }
  async function loadSeason(period){
    if(state.seasons.has(period))return state.seasons.get(period);
    const meta=state.index.seasons.find(s=>s.period===period);
    const doc=await getJson(BASE+meta.path);state.seasons.set(period,doc);return doc;
  }

  // Monster intent data (Morimenz-kr community dataset; seasons 67+). Missing seasons resolve to null.
  async function loadInfo(period){
    if(state.info.has(period))return state.info.get(period);
    let doc=null;
    try{doc=await getJson(`data/morimens/dzone-info/${period}.json`)}catch{doc=null}
    if(doc){
      // per wave/alert: SKeyDB monster id -> list of intent rows (same monster may appear more than once)
      for(const w of doc.waves)for(const a of w.alerts){a.bySk=new Map();for(const m of a.ms)if(m.sk){const l=a.bySk.get(m.sk)||[];l.push(m);a.bySk.set(m.sk,l)}}
    }
    state.info.set(period,doc);return doc;
  }

  // Chinese monster pages from HuijiWiki (descriptions, traits, a few skill lists); keyed by name without 「」.
  async function loadWiki(){
    if(state.wiki)return state.wiki;
    try{state.wiki=(await getJson('data/morimens/dzone-info/huiji-monsters.json')).monsters||{}}catch{state.wiki={}}
    return state.wiki;
  }
  // Game translation table (BIAVGit/Morimens-Localizations): zh/en names + descriptions keyed by game ids.
  async function loadTr(){
    if(state.tr)return state.tr;
    const [t,g,w]=await Promise.all([
      getJson('data/morimens/game/dzone-translations.json').catch(()=>({})),
      getJson('data/morimens/game/dzone-localization.json').catch(()=>({})),
      getJson('data/morimens/huiji/dzone-monsters.zh-CN.json').catch(()=>({}))
    ]);
    state.tr={monsters:t.monsters||{},skills:t.skills||{},states:t.states||{},characteristics:t.characteristics||{},extra:t.extra||{},skMonsters:t.skMonsters||{},relics:t.relics||{}};state.game=g.monsters||{};state.cw=w.monsters||{};
    return state.tr;
  }
  // Static intent data of every monster seen in seasons 67+, used for older seasons (numbers come from the closest level).
  const normEn=n=>String(n||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  async function loadByMon(){
    if(state.byMon)return state.byMon;
    try{state.byMon=await getJson('data/morimens/dzone-info/by-monster.json')}catch{state.byMon={}}
    // the same monster can have several SKeyDB ids (same English name): let them share intent data
    state.byName=new Map();
    for(const id of Object.keys(state.byMon)){const n=state.index?.monsters?.[id]?.n;if(n&&!state.byName.has(normEn(n)))state.byName.set(normEn(n),id)}
    return state.byMon;
  }
  // Kaiden.gg intents (English): passives + rotation for every monster, used when there is no Morimens.Info.kr data
  async function loadKd(){
    if(state.kd)return state.kd;
    try{state.kd=(await getJson('data/morimens/kaiden/intents.json')).monsters||{}}catch{state.kd={}}
    try{state.kdZh=await getJson('data/morimens/kaiden/zh.json')}catch{state.kdZh={sent:{},names:{},types:{}}}
    // English skill / state name -> Chinese name from the game translation table (unique matches only)
    const m=new Map(),bad=new Set();
    for(const group of [state.tr?.skills,state.tr?.states])for(const t of Object.values(group||{})){
      if(!t.en||!t.zn)continue;const k=t.en.toLowerCase();
      if(m.has(k)&&m.get(k)!==t.zn)bad.add(k);else m.set(k,t.zn);
    }
    for(const k of bad)m.delete(k);
    state.skEn=m;
    return state.kd;
  }
  const kdName=n=>zh()?(state.kdZh?.names?.[n]||state.skEn?.get(String(n).toLowerCase())||n):n;
  const kdType=t=>zh()?(state.kdZh?.types?.[t]||t):t;
  // Kaiden text -> Chinese: numbers are lifted out (50% -> {n}%), the sentence is looked up, numbers are put back
  const kdSplit=d=>String(d).split(/(?<=[.!?])(?<!Crit\.)\s+/).filter(Boolean);
  function kdText(d){
    if(!zh())return {text:d,en:false};
    let en=false;
    const out=kdSplit(d).map(sent=>{
      const nums=[];const norm=sent.replace(/(?<![\w{])\d+(?:\.\d+)?/g,m=>{nums.push(m);return '{n}'});
      const z=state.kdZh?.sent?.[norm];
      if(!z){en=true;return sent}
      return z.replace(/\{(\d+)\}/g,(m,k)=>nums[Number(k)-1]??m);
    }).join('');
    return {text:out,en};
  }
  const xl=(str)=>{const e=state.tr?.extra?.[str];return e?(zh()?e.zh:e.en):''};
  const tx=(str)=>xl(str)||str;
  const trText=(rec,zhKey,enKey)=>rec?(zh()?rec[zhKey]:rec[enKey])||'':'';
  const normName=n=>String(n||'').replace(/[「」『』\s]/g,'');
  const wikiOf=name=>name?state.wiki?.[normName(name)]||null:null;

  // Players' stage stats (only for seasons whose usage records are loaded): key "zoneNumber|threat name".
  function stageStats(period){
    const out=new Map();
    if(!ctx||Number(ctx.season)!==Number(period))return out;
    for(const rec of ctx.records||[])for(const w of rec.waves||[])for(const t of w.teams||[]){
      const m=String(t.stageName||w.stageName||'').match(/Zone\s*(\d+)\s*:\s*(.+)$/i);if(!m)continue;
      const key=m[1]+'|'+m[2].replace(/^Threat Level\s*/i,'').trim();
      const o=out.get(key)||{n:0,hist:new Map(),score:0};o.n++;const sc=Number(t.score)||0;o.hist.set(sc,(o.hist.get(sc)||0)+1);out.set(key,o);
    }
    // D-Zone score of a stage = its most common clear score (a few clears carry a +5 bonus)
    for(const o of out.values()){let best=0,n=0;for(const [sc,c] of o.hist)if(c>n||(c===n&&sc<best)){best=sc;n=c}o.score=best}
    return out;
  }

  const TYPE_LABEL={Intent_Attack:['攻击','Attack'],Intent_HeavyAttack:['强力攻击','Heavy Attack'],Intent_AttackDebuff:['攻击·削弱','Attack · Debuff'],Intent_AttackBuff:['攻击·强化','Attack · Buff'],Intent_AttackDefence:['攻击·防御','Attack · Defense'],Intent_Debuff:['削弱','Debuff'],Intent_Buff:['强化','Buff'],Intent_DefenceBuff:['防御·强化','Defense · Buff'],Intent_DefenceDebuff:['防御·削弱','Defense · Debuff'],Intent_StrongBuff:['强力强化','Strong Buff'],Intent_StrongDebuff:['强力削弱','Strong Debuff'],Intent_Defence:['防御','Defense'],Intent_Burst:['特殊行动','Special'],Intent_Burst2:['特殊行动','Special'],Intent_Burst3:['行动','Action'],Intent_Unknown:['特殊行动','Special']};
  const TARGET_LABEL={FrontEnemy:['前排觉醒者','Front Awakener'],PlayerRole:['我方','Player side'],CmdCaster:['自身','Self'],AllAlly:['全体友方','All allies'],'DrawDeckAndGraveyardDeck.GetCard(RANDOMENCHANT,3)':['牌堆中的卡牌','Cards in the deck'],RandomAwaker:['随机觉醒者','Random Awakener'],'':['视条件而定','Conditional']};
  const ICON_ID={Intent_Attack:'001',Intent_HeavyAttack:'002',Intent_Debuff:'003',Intent_StrongDebuff:'004',Intent_Buff:'005',Intent_StrongBuff:'006',Intent_Defence:'007',Intent_AttackDefence:'008',Intent_AttackDebuff:'009',Intent_AttackBuff:'010',Intent_DefenceBuff:'011',Intent_DefenceDebuff:'012',Intent_Dizzy:'013',Intent_Unknown:'014',Intent_Burst:'015',Intent_Burst2:'015',Intent_Burst3:'015'};
  const intentIcon=(t,cls='dzIcon')=>`<img class="${cls}" src="assets/morimens/dzone-intent/intent_${ICON_ID[t]||'014'}.png" alt="" loading="lazy" onerror="this.style.display='none'">`;
  const typeLabel=t=>{const l=TYPE_LABEL[t];return l?ui(l[0],l[1]):String(t||'').replace(/^Intent_/,'')};
  const targetLabel=g=>{const l=TARGET_LABEL[g];return l?ui(l[0],l[1]):(g&&g.length<24?g:ui('视条件而定','Conditional'))};
  // unresolved values: attack counts default to 1, other numbers show as X
  const fill=(tpl,args)=>String(tpl||'').replace(/\[(?:(\w+):)?Arg(\d+)\]/g,(m,k,n)=>{const a=args?.[Number(n)-1];return a==null?(k==='AttackTimes'?'1':'X'):String(a)});
  const fillState=(tpl,sa)=>String(tpl||'').replace(/\[(?:\w+:)?(Desc|State)Arg(\d+)\]/g,(m,k,n)=>{const a=(k==='Desc'?sa?.da:sa?.sg)?.[Number(n)-1];return a==null?'X':String(a)}).replace(/\[Layer\]/g,()=>sa?.la==null?'X':String(sa.la));
  // language-neutral numbers pulled from the template tokens: Damage / AttackTimes / Block / Power ...
  function numbers(tpl,args){
    const out={},kinds={Damage:['伤害','Damage'],Block:['护盾','Shield'],Power:['力量','Strength'],TentaclePower:['触腕伤害','Tentacle'],Energy:['狂气','Madness']};
    String(tpl||'').replace(/\[(\w+):Arg(\d+)\]/g,(m,k,n)=>{out[k]=args?.[Number(n)-1];return m});
    const parts=[];
    for(const k of Object.keys(kinds)){
      if(out[k]==null)continue;
      parts.push(`${ui(kinds[k][0],kinds[k][1])} <b>${esc(fmt(out[k]))}</b>${k==='Damage'&&out.AttackTimes>1?` × ${esc(out.AttackTimes)}`:''}`);
    }
    return parts.join(' · ');
  }
  const patLabel=id=>id==='opening'?ui('首轮行动','Opening'):(/^cycle-(\d+)/.exec(id)?ui('循环 ','Cycle ')+RegExp.$1:id);
  const RING={AEQUOR:['深海戒指','Aequor Ring'],CARO:['血肉戒指','Caro Ring'],CHAOS:['混沌戒指','Chaos Ring'],ULTRA:['超维戒指','Ultra Ring']};
  const ringName=realm=>RING[realm]?ui(RING[realm][0],RING[realm][1]):ui('无戒指（早期）','No ring (early)');
  const EFFECT={'Astral Reign':['星辰篇','Astral Reign'],'Faded Legacy':['忘却篇','Faded Legacy']};
  const effectName=e=>EFFECT[e]?ui(EFFECT[e][0],EFFECT[e][1]):e;
  const zoneName=n=>{n=String(n).replace(/^D-Effect Zone: /,'');const m=/^Zone (\d+)$/.exec(n);if(m)return ui(`第 ${m[1]} 禁区`,n);const w=/^Wave (\d+)$/.exec(n);if(w)return ui(`第 ${w[1]} 波`,n);return n};
  const DIFF={Normal:['普通','Normal'],Hard:['困难','Hard'],Nightmare:['梦魇','Nightmare'],Madness:['疯狂','Madness']};
  const alertName=n=>{const m=/^Alert ([IVX]+)$/.exec(n);if(m)return ui(`警戒 ${m[1]}`,n);return DIFF[n]?ui(DIFF[n][0],DIFF[n][1]):n};
  // which seasons (grouped by ring) a monster appeared in
  function appearCell(id){
    const list=(state.index.appears?.[id]||[]).slice().sort((a,b)=>b-a);
    if(!list.length)return '<td class="dzSeasons"></td>';
    const realmOf=new Map(state.index.seasons.map(s=>[s.period,s.realm]));
    const groups=new Map();
    for(const p of list){const k=realmOf.get(p)||'';(groups.get(k)||groups.set(k,[]).get(k)).push(p)}
    const order=['AEQUOR','CARO','CHAOS','ULTRA',''];
    const lines=order.filter(k=>groups.has(k)).map(k=>{
      const ps=groups.get(k),shown=ps.slice(0,8).join('·'),more=ps.length>8?ui(` 等 ${ps.length} 期`,` +${ps.length-8}`):'';
      return `<div title="${esc(ps.join(', '))}"><b>${esc(ringName(k))}</b> ${ui('第','S')}${shown}${ui('期','')}${more}</div>`;
    });
    return `<td class="dzSeasons"><small>${ui('共 ','')}${list.length}${ui(' 期','  seasons')}</small>${lines.join('')}</td>`;
  }
  const fmt=n=>Number(n).toLocaleString('en-US');
  const relicChip=id=>{
    const r=state.index.relics[id];if(!r)return '';
    const img=r.i?`<img src="assets/morimens/relics/${esc(r.i)}.webp" alt="" loading="lazy" onerror="this.style.display='none'">`:'';
    const nm=zh()?(state.tr?.relics?.[r.n]||r.n):r.n;
    return `<span class="dzRelic" title="${esc(r.n)}">${img}${esc(nm)}</span>`;
  };
  function monsterRows(alert,wi,ai,info){
    const mons=state.index.monsters,chars=state.index.characteristics;
    const infoAlert=info?.waves?.[wi]?.alerts?.[ai];
    const used=new Map();
    return alert.monsters.map((x,mi)=>{
      const m=mons[x.monsterId]||{n:x.monsterId,d:'',a:'',b:[],c:[]};
      let row=null;
      if(infoAlert){const l=infoAlert.bySk.get(x.monsterId);const u=used.get(x.monsterId)||0;if(l&&l[u]){row=l[u];used.set(x.monsterId,u+1)}}
      let intel=row?info.monsters[row.tid]:null;
      let note='';
      if(!row){
        // older seasons: reuse the monster's skills / pattern from the latest season it was seen in (closest level)
        const bm=state.byMon?.[x.monsterId]||state.byMon?.[state.byName?.get(normEn(m.n))];
        if(bm?.rows?.length){
          const r=bm.rows.reduce((a,b)=>Math.abs(b.lv-(x.level??b.lv))<Math.abs(a.lv-(x.level??a.lv))?b:a);
          row={...r,tid:bm.tid};intel=bm;
          note=ui(`行动意图取自第 ${bm.period} 期的同名怪物（等级 ${r.lv}），数值可能与本期不同。`,`Intent data is taken from the same monster in Season ${bm.period} (level ${r.lv}); numbers may differ in this season.`);
        }
      }
      const key=`${state.season}:${wi}:${ai}:${mi}`;
      const open=state.openMon.has(key);
      const img=m.a?`<img src="assets/morimens/monster-preview/${esc(m.a)}.webp" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`:'';
      const badges=(m.b||[]).map(b=>`<span class="dzBadge ${esc(b)}">${b==='Boss'?ui('首领','Boss'):ui('精英','Elite')}</span>`).join('');
      const cs=(m.c||[]).map(id=>{const c=chars[id];if(!c)return '';const t=zh()?state.tr.characteristics[c.n]:null;return `<span class="dzChar" title="${esc(t?.zd||c.d)}">${esc(t?.zh||c.n)}</span>`}).join('');
      const tr=intel?state.tr.monsters[row.tid]:null,smz=state.tr.skMonsters[x.monsterId]||{},g=state.game[x.monsterId]||{},cw=state.cw[x.monsterId]||{};
      const zhName=tr?.zh||smz.zh||intel?.zh||g.zh||'';const wiki=zh()?(wikiOf(zhName)||wikiOf(cw.name)):null;
      const enName=m.n||tr?.en||'';
      const nameHtml=zh()?`${esc(zhName||enName)}${zhName?`<small class="dzSub">${esc(enName)}</small>`:''}`:`${esc(enName)}${zhName?`<small class="dzSub">${esc(zhName)}</small>`:''}`;
      const fallback=!intel;const caret=intel||fallback?`<span class="dzCaret">${open?'▾':'▸'}</span>`:'<span class="dzCaret"></span>';
      const main=`<tr class="dzMonRow${intel||fallback?' dzHasIntel':''}"${intel||fallback?` data-dzmon="${esc(key)}" aria-expanded="${open}"`:''}><td><div class="dzMon">${caret}${img}<span>${nameHtml}${badges}</span></div></td><td class="n">${x.level??''}</td><td class="n">${x.hp!=null?fmt(x.hp):''}${x.hpBars>1?` ×${x.hpBars}`:''}</td><td>${cs}</td><td class="dzDesc">${esc(zh()?(tr?.zd||smz.zd||wiki?.desc||cw.description||m.d):(m.d||tr?.ed))}</td>${appearCell(x.monsterId)}</tr>`;
      return main+(open&&intel?`<tr class="dzIntel"><td colspan="6">${intelBody(row,intel,wiki,note)}</td></tr>`:open&&fallback?`<tr class="dzIntel"><td colspan="6">${basicBody(x,m,{wiki,cw,tr,smz,zhName})}</td></tr>`:'');
    }).join('');
  }
  // monsters without any intent data: still expandable, showing everything else we know about them
  function basicBody(x,m,o){
    const chars=state.index.characteristics;
    const traits=(m.c||[]).map(id=>{const c=chars[id];if(!c)return '';const t=zh()?state.tr.characteristics[c.n]:null;return `<li><b>${esc(t?.zh||c.n)}</b> ${esc(t?.zd||c.d)}</li>`}).join('');
    const desc=zh()?(o.tr?.zd||o.smz?.zd||o.wiki?.desc||o.cw?.description||m.d):(m.d||o.tr?.ed||'');
    const stats=`<div class="dzStats"><span>${ui('等级','Lv')} <b>${x.level??'—'}</b></span><span>${ui('生命','HP')} <b>${x.hp!=null?fmt(x.hp):'—'}</b>${x.hpBars>1?` ×${x.hpBars}`:''}</span></div>`;
    const wiki=zh()&&o.wiki?wikiBlock(o.wiki):'';
    const cw=zh()&&(o.cw?.intents?.length||o.cw?.trait)?cwBlock(o.cw,true):'';
    const kd=state.kd?.[normEn(m.n)];
    const kdHtml=kd?kdBlock(kd):'';
    return `<div class="dzIntelBody">${kd?'':`<div class="dzNote">${ui('暂无该怪物的行动意图数据。','No intent data for this monster yet.')}</div>`}${stats}${wiki&&o.wiki?.desc?'':`<div>${esc(desc)}</div>`}${traits?`<div class="dzSec">${ui('特性','Traits')}</div><ul class="dzList">${traits}</ul>`:''}${wiki}${cw}${kdHtml}</div>`;
  }
  function kdBlock(kd){
    const iconId=i=>`<img class="dzIcon" src="assets/morimens/dzone-intent/intent_${esc(i)}.png" alt="" loading="lazy" onerror="this.style.display='none'">`;
    const span=d=>{const t=kdText(d);return `<span${t.en?' lang="en"':''}>${esc(t.text)}</span>`};
    const pas=(kd.p||[]).map(x=>`<li><b>${esc(kdName(x.n))}</b> ${span(x.d)}</li>`).join('');
    const rot=(kd.r||[]).map((x,i)=>`${i?'<span class="dzArrow">→</span>':''}<span class="dzIntent" title="${esc(kdText(x.d).text)}">${iconId(x.i)}<span class="dzIntentText">${esc(kdName(x.n))}<small>${esc(kdType(x.t))}</small></span></span>`).join('');
    const rows=(kd.r||[]).map(x=>`<tr><td>${esc(kdName(x.n))}</td><td><span class="dzTypeCell">${iconId(x.i)}${esc(kdType(x.t))}</span></td><td class="dzKo">${span(x.d)}</td></tr>`).join('');
    return `<div class="dzSec">${ui('行动意图（来源 Kaiden.gg；数值为攻击力 / 防御的百分比，中文为 AI 辅助翻译）','Intent rotation (source: Kaiden.gg; values are % of ATK / DEF)')}</div>
      ${rot?`<div class="dzPat"><span class="dzPatName">${ui('循环顺序','Rotation')}</span>${rot}</div>`:''}
      ${rows?`<div class="dzScroll"><table class="dzTable dzSkill"><thead><tr><th>${ui('技能','Skill')}</th><th>${ui('类型','Type')}</th><th>${ui('描述','Description')}</th></tr></thead><tbody>${rows}</tbody></table></div>`:''}
      ${pas?`<div class="dzSec">${ui('被动 / 开场状态','Passives')}</div><ul class="dzList">${pas}</ul>`:''}
      <div class="dzNote"><a href="https://www.kaiden.gg/morimens/monsters/" target="_blank" rel="noopener noreferrer">Kaiden.gg ↗</a></div>`;
  }
  function cwBlock(w,inner){
    const li=a=>(a||[]).map(t=>`<li>${esc(t)}</li>`).join('');
    return `${inner?'':'<div class="dzIntelBody">'}<div class="dzSec">${ui('中文 Wiki 意图说明','Chinese Wiki intent notes')}</div>${w.trait?`<div>${ui('特性','Trait')}：${esc(w.trait)}</div>`:''}${w.intents?.length?`<ol class="dzList">${li(w.intents)}</ol>`:''}${w.cycle?`<div>${ui('行动顺序','Action order')}：${esc(w.cycle)}</div>`:''}${inner?'':'</div>'}`;
  }
  const skName=sk=>trText(state.tr.skills[sk?.id],'zn','en')||xl(sk?.n)||sk?.n||'';
  const skNameKo=sk=>!trText(state.tr.skills[sk?.id],'zn','en')&&!xl(sk?.n)&&!!sk?.n;
  // translated description with numbers filled in; falls back to the Korean original (flagged by lang="ko")
  function skDesc(sk,args){const t=trText(state.tr.skills[sk?.id],'zd','ed')||xl(sk?.d);return t?{text:fill(t,args),ko:false}:{text:fill(sk?.d,args),ko:true}}
  function wikiBlock(w){
    if(!w)return '';
    const meta=[w.kind&&`${ui('种类','Kind')}：${esc(w.kind)}`,w.rank&&`${ui('地位','Rank')}：${esc(w.rank)}`].filter(Boolean).join(' · ');
    const traits=(w.traits||[]).map(t=>`<li><b>${esc(t.n)}</b> ${esc(t.d)}</li>`).join('');
    const skills=(w.skills||[]).map(k=>`<li><b>${esc(k.n)}</b> ${esc(k.e)}</li>`).join('');
    const pat=w.pattern?`<div class="dzWikiPat">${esc(w.pattern)}</div>`:'';
    return `<div class="dzSec">${ui('灰机维基（中文）','Huiji Wiki (Chinese)')}</div><div class="dzWiki">${meta?`<div>${meta}</div>`:''}${w.desc?`<div>${esc(w.desc)}</div>`:''}${traits?`<ul class="dzList">${traits}</ul>`:''}${skills?`<div class="dzSec">${ui('技能（维基）','Skills (wiki)')}</div><ul class="dzList">${skills}</ul>`:''}${pat}</div>`;
  }
  function intelBody(row,intel,wiki,note){
    const skills=new Map(intel.sk.map(s=>[s.id,s]));
    const stats=`<div class="dzStats"><span>${ui('等级','Lv')} <b>${row.lv}</b></span><span>${ui('攻击力','ATK')} <b>${fmt(row.atk)}</b></span><span>${ui('防御','DEF')} <b>${fmt(row.def)}</b></span><span>${ui('生命','HP')} <b>${fmt(row.hp)}</b></span>${row.ph?`<span>${ui('多段血条','HP bars')} <b>${row.ph.map(fmt).join(' → ')}</b></span>`:''}</div>`;
    const pats=intel.pat.map(p=>`<div class="dzPat"><span class="dzPatName">${esc(patLabel(p.id))}</span>${p.s.map((id,i)=>{const sk=skills.get(id);const nm=numbers(sk?.d,row.a[id]).replace(/<[^>]+>/g,'');return `${i?'<span class="dzArrow">→</span>':''}<span class="dzIntent" title="${esc(skDesc(sk,row.a[id]).text)}">${intentIcon(sk?.t)}<span class="dzIntentText">${esc(skName(sk)||typeLabel(sk?.t))}<small>${esc((skName(sk)?typeLabel(sk?.t):'')+(skName(sk)&&nm?' · ':'')+nm)}</small></span></span>`}).join('')}</div>`).join('');
    const rows=intel.sk.map(sk=>{
      const nums=numbers(sk.d,row.a[sk.id]),nm=skName(sk),d=skDesc(sk,row.a[sk.id]);
      return `<tr><td${skNameKo(sk)?' lang="ko"':''}>${nm?esc(nm):`<span style="color:#8290a2">${ui('（无名称）','(unnamed)')}</span>`}</td><td><span class="dzTypeCell">${intentIcon(sk.t,'dzIcon dzIconSm')}${esc(typeLabel(sk.t))}</span></td><td>${esc(targetLabel(sk.g))}</td><td>${nums||'—'}</td><td class="dzKo"${d.ko?' lang="ko"':''}>${esc(d.text)}</td></tr>`;
    }).join('');
    const sts=intel.st.map(x=>{const t=state.tr.states[x.id],n=trText(t,'zn','en')||xl(x.n),d=trText(t,'zd','ed')||xl(x.d);const ko=!d;return `<li>${(n||x.n)?`<b${n?'':' lang="ko"'}>${esc(n||x.n)}</b> `:''}<span${ko?' lang="ko"':''}>${esc(fillState(d||x.d,row.sa?.[x.id]))}</span></li>`}).join('');
    const koLeft=t=>/[\uac00-\ud7af]/.test(t);
    const conds=intel.cond.filter(c=>c.t).map(c=>{const t=tx(c.t),ef=c.e.filter(e=>e.n).map(e=>tx(e.n)).join(zh()?'、':', ');const all=t+ef;return `<li${koLeft(all)?' lang="ko"':''}>${esc(t)}${ef?` → ${esc(ef)}`:''}</li>`}).join('');
    return `<div class="dzIntelBody">${note?`<div class="dzNote">${esc(note)}</div>`:''}${stats}${wikiBlock(wiki)}
      <div class="dzSec">${ui('行动意图（按回合顺序）','Intent pattern (in turn order)')}</div>${pats||`<div class="dzEmpty">${ui('无固定行动序列','No fixed pattern')}</div>`}
      <div class="dzSec">${ui('技能详情','Skill details')}</div><div class="dzScroll"><table class="dzTable dzSkill"><thead><tr><th>${ui('技能','Skill')}</th><th>${ui('类型','Type')}</th><th>${ui('目标','Target')}</th><th>${ui('数值','Values')}</th><th>${ui('官方描述','Official text')}</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${sts?`<div class="dzSec">${ui('状态 / 条件规则','States & conditional rules')}</div><ul class="dzList">${sts}${conds}</ul>`:(conds?`<ul class="dzList">${conds}</ul>`:'')}
    </div>`;
  }
  function alertBody(alert,wi,ai,info){
    return `<div class="dzMonsters"><table class="dzTable"><thead><tr><th>${ui('怪物','Monster')}</th><th>${ui('等级','Lv')}</th><th>${ui('生命','HP')}</th><th>${ui('特性','Traits')}</th><th>${ui('出现期次 / 戒指','Seasons / Ring')}</th><th>${ui('介绍','Description')}</th></tr></thead><tbody>${monsterRows(alert,wi,ai,info)}</tbody></table>${info?'':`<div class="dzNote" style="margin:6px 4px 0">${ui('第 67 期之前的怪物沿用其最近出现期次的行动意图；未收录的怪物无法展开。','Before Season 67, monsters reuse the intents of their latest appearance; monsters without data cannot be expanded.')}</div>`}</div>`;
  }

  function seasonLabel(s){
    const d=v=>String(v||'').slice(0,10);
    return `${ui('第','S')}${s.period}${ui('期','')} · ${effectName(s.stageEffect||s.name)} · ${ringName(s.realm)} · ${d(s.start)} ~ ${d(s.end)}`;
  }
  // zones / threat levels stay open across language switches and re-renders
  const zoneOpen=wi=>{const k=state.season+':'+wi;if(!state.zoneInit.has(state.season)){return wi===0}return state.openZone.has(k)};
  function draw(){
    if(!host)return;
    if(state.error){host.innerHTML=`<div class="dzEmpty">${ui('禁区地图数据加载失败：','Failed to load D-Zone map data: ')}${esc(state.error.message)}</div>`;return}
    if(!state.index){host.innerHTML=`<div class="dzEmpty">${ui('正在加载禁区地图数据…','Loading D-Zone map data…')}</div>`;return}
    const seasons=[...state.index.seasons].sort((a,b)=>b.period-a.period);
    if(state.season==null)state.season=Number(ctx?.season)&&seasons.some(s=>s.period===Number(ctx.season))?Number(ctx.season):seasons[0].period;
    const meta=seasons.find(s=>s.period===state.season)||seasons[0];
    const doc=state.seasons.get(meta.period);
    const links=state.season===70?`<div class="dtideSeasonResources"><a class="dtideSeasonResourceLink" href="data/morimens/dzone/5%24KD_J_PB6%7BD%5D%7D%7D9FTLN0VA_tmb.webp" target="_blank" rel="noopener noreferrer">【${ui('当期融灾地图','Current D-Zone Map')}】↗</a> <a class="dtideSeasonResourceLink" href="data/morimens/dzone/DT%5B%5D9VVKLSTNED%297FOPZAZR_tmb.webp" target="_blank" rel="noopener noreferrer">【${ui('当期融灾总览','Current D-Zone Overview')}】↗</a></div>`:'';
    const head=`${links}<p class="dzNote">${ui('数据同步自 SKeyDB（dansa/SKeyDB）与 Morimens.Info.kr，均为 CC BY-NC-SA 4.0。点击区域 → 威胁等级逐级展开怪物。点击怪物可展开行动意图（第 67 期前沿用最近出现期次的数据）。怪物英文名 / 介绍来自 SKeyDB，中文名、技能与意图数据来自 Morimens.Info.kr（译文来自游戏翻译表，翻译表缺失的条目为 AI 辅助翻译），部分怪物的中文介绍 / 特性来自灰机维基。','Synced from SKeyDB (dansa/SKeyDB) and Morimens.Info.kr, both CC BY-NC-SA 4.0. Expand a zone, then a threat level, to see its monsters; click a monster for its intent pattern (before Season 67 the latest appearance is reused). English names/descriptions come from SKeyDB; Chinese names, skills and intent data come from Morimens.Info.kr (translations from the game localization table; entries missing there are AI-assisted translations); some Chinese descriptions/traits come from Huiji Wiki.')}</p>
      <div class="dzBar"><div><label>${ui('期次','Season')}</label><select data-dzseason>${seasons.map(s=>`<option value="${s.period}"${s.period===meta.period?' selected':''}>${esc(seasonLabel(s))}</option>`).join('')}</select></div></div>`;
    if(!doc||!state.info.has(meta.period)||!state.wiki||!state.tr||!state.byMon||!state.kd){host.innerHTML=head+`<div class="dzEmpty">${ui('正在加载…','Loading…')}</div>`;Promise.all([loadSeason(meta.period),loadInfo(meta.period),loadWiki(),loadTr(),loadByMon()]).then(loadKd).then(draw).catch(e=>{state.error=e;draw()});return}
    const stats=stageStats(meta.period);
    const zones=doc.waves.map((w,wi)=>{
      const zoneNo=wi+1;
      const relics=(w.initialRelicIds||[]).map(relicChip).join('');
      const alerts=w.alerts.map((a,ai)=>{
        const letter=a.name.replace(/^Threat Level\s*/i,'').trim();
        const st=stats.get(zoneNo+'|'+letter);
        const total=a.monsters.reduce((s,x)=>s+(x.hp||0)*(x.hpBars||1),0);
        const bosses=a.monsters.filter(x=>(state.index.monsters[x.monsterId]?.b||[]).includes('Boss')).length;
        const tag=`<span class="dzTag"><span>${a.monsters.length} ${ui('只怪','monsters')}${bosses?` · ${bosses} ${ui('首领','Boss')}`:''}</span><span>${ui('总生命','Total HP')} ${fmt(total)}</span>${st?`<span>${ui('融灾计分','D-Zone score')} <b>${st.score}</b> ${ui('分','pts')} · ${st.n} ${ui('队','teams')}</span>`:''}</span>`;
        return `<details class="dzAlert" data-dzalert="${wi}:${ai}"${state.openAlert.has(state.season+':'+wi+':'+ai)?' open':''}><summary><b>${esc(alertName(a.name))}</b>${tag}</summary></details>`;
      }).join('');
      return `<details class="dzZone" data-dzzone="${wi}"${zoneOpen(wi)?' open':''}><summary>${esc(zoneName(w.name))}<span class="dzNote" style="margin:0">${w.alerts.length} ${ui('个威胁等级','threat levels')}</span></summary><div class="dzZoneBody">${relics?`<div class="dzRelics"><span>${ui('初始造物','Starting Creations')}</span>${relics}</div>`:''}${alerts}</div></details>`;
    }).join('');
    if(!state.zoneInit.has(state.season)){state.zoneInit.add(state.season);state.openZone.add(state.season+':0')}
    host.innerHTML=head+`<div class="dzMeta"><span>${esc(ui('融灾',meta.name))}</span><span>${esc(ringName(meta.realm))}</span><span>${ui('区域数','Zones')} ${doc.waves.length}</span>${doc.stageEffect?`<span>${ui('篇章','Chapter')}：${esc(effectName(doc.stageEffect))}</span>`:''}</div>`+zones;
    host.querySelectorAll('.dzAlert[open]').forEach(fillAlert);
  }
  function fillAlert(el){
    if(el.dataset.filled)return;
    const meta=state.index.seasons.find(s=>s.period===state.season);const doc=state.seasons.get(meta.period);
    const [wi,ai]=el.dataset.dzalert.split(':').map(Number);const a=doc?.waves[wi]?.alerts[ai];if(!a)return;
    el.querySelector('.dzMonsters')?.remove();
    el.insertAdjacentHTML('beforeend',alertBody(a,wi,ai,state.info.get(state.season)));el.dataset.filled='1';
  }

  function mount(){
    const el=document.getElementById('morimensZonesPanel');if(!el)return false;
    if(host!==el){host=el;host.classList.add('dtideZones')}
    ensureStyle();return true;
  }
  function draw0(){if(mount()&&!host.hidden)draw()}
  function render(context){ctx=context||ctx;if(state.index)draw0()}
  function open(){
    if(!mount())return;
    load().then(draw,draw);draw();
  }

  document.addEventListener('click',e=>{
    const row=e.target.closest?.('[data-dzmon]');if(!row||!host?.contains(row))return;
    const key=row.dataset.dzmon;if(state.openMon.has(key))state.openMon.delete(key);else state.openMon.add(key);
    const det=row.closest('.dzAlert');if(det){det.dataset.filled='';fillAlert(det)}
  });
  document.addEventListener('change',e=>{
    const sel=e.target.closest?.('[data-dzseason]');if(!sel||!host?.contains(sel))return;
    state.season=Number(sel.value);draw();
  });
  document.addEventListener('toggle',e=>{
    const el=e.target;if(!el?.matches||!host?.contains(el))return;
    if(el.matches('.dzZone')){const k=state.season+':'+el.dataset.dzzone;if(el.open)state.openZone.add(k);else state.openZone.delete(k)}
    if(el.matches('.dzAlert')){const k=state.season+':'+el.dataset.dzalert;if(el.open){state.openAlert.add(k);fillAlert(el)}else state.openAlert.delete(k)}
  },true);
  window.addEventListener('morimens-language-change',()=>{if(host&&!host.hidden&&state.index)draw()});
  // Compact monster details for the tier list: prepare() loads the data, brief(id) returns {traits,rot,intents} in the current language.
  const prepare=()=>load().then(()=>Promise.all([loadTr(),loadByMon()])).then(loadKd);
  function brief(id){
    const m=state.index?.monsters?.[id];if(!m||!state.tr)return null;
    const chars=state.index.characteristics;
    const traits=(m.c||[]).map(c=>{const ch=chars[c];if(!ch)return null;const t=zh()?state.tr.characteristics[ch.n]:null;return {h:t?.zh||ch.n,t:t?.zd||ch.d}}).filter(Boolean);
    const bm=state.byMon?.[id]||state.byMon?.[state.byName?.get(normEn(m.n))];
    const intents=[];let rot='';
    if(bm?.sk?.length){
      const row=bm.rows?.[bm.rows.length-1],byId=new Map(bm.sk.map(k=>[k.id,k]));
      for(const sk of bm.sk){const d=skDesc(sk,row?.a?.[sk.id]);intents.push({h:`${skName(sk)||typeLabel(sk.t)} · ${typeLabel(sk.t)}`,t:d.ko?'':d.text.replace(/<[^>]+>/g,'')})}
      const p=bm.pat?.[0];if(p)rot=p.s.map(i=>{const k=byId.get(i);return k?(skName(k)||typeLabel(k.t)):''}).filter(Boolean).join(' → ');
    }else{
      const kd=state.kd?.[normEn(m.n)];
      if(kd){
        for(const x of kd.r||[])intents.push({h:`${kdName(x.n)} · ${kdType(x.t)}`,t:kdText(x.d).text});
        for(const x of kd.p||[])intents.push({h:kdName(x.n),t:kdText(x.d).text});
        rot=(kd.r||[]).map(x=>kdName(x.n)).join(' → ');
      }
    }
    return {traits,intents,rot};
  }
  window.MorimensDtideZones={render,open,prepare,brief};
})();

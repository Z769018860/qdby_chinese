// "卡池活动复刻日历": banner / rerun / character event calendar.
// Data: data/morimens/game/summon-calendar.json (scripts/sync_summon_calendar.mjs) joined with the tier-list image pool.
(()=>{
  'use strict';
  const zh=()=>localStorage.getItem('morimens.language')!=='en';
  const ui=(cn,en)=>zh()?cn:en;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state={data:null,pool:new Map(),cat:'all',query:'',dir:'desc',showHistory:false,loading:false,error:null};
  let host=null;

  const CATS=[['all','全部','All'],['triune','三相衡生（角色复刻）','Triune Verdant (character reruns)'],['sylvan','因果苗圃（命轮复刻）','Sylvan Omen (wheel reruns)'],['limited','限时唤醒（新角色 + 专属命轮）','Limited (new Awakener + wheel)'],['premium','精选 / 组合 / 自选 / 每日','Premium / combo / selector / daily'],['event','角色活动（含复刻）','Character events (incl. reruns)'],['other','时装 / 命轮活动','Skins / wheel events']];
  const TYPE={awaken:['限时唤醒','Limited banner'],rerun:['复刻唤醒','Rerun banner'],premium:['精选唤醒','Premium banner'],combo:['组合唤醒','Combo banner'],selector:['自选唤醒','Selector banner'],daily:['每日唤醒','Daily banner'],story:['角色活动','Character event'],'story-rerun':['角色活动复刻','Event rerun'],skin:['时装活动','Skin event'],wheel:['命轮活动','Wheel event']};
  const COLOR={awaken:'#d9a441',rerun:'#62b7ff',premium:'#d978d0',combo:'#d978d0',selector:'#d978d0',daily:'#8c97a8',story:'#71aa86','story-rerun':'#71aa86',skin:'#c75e68',wheel:'#6fb1a8'};

  function ensureStyle(){
    if(document.getElementById('scStyle'))return;
    const s=document.createElement('style');s.id='scStyle';
    s.textContent=`
      .scWrap{display:grid;gap:14px}.scNote{font-size:12px;color:#8290a2;line-height:1.7}
      .scBar{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.scChip{background:#111827;color:#aab6c8;border:1px solid rgba(148,163,184,.25);border-radius:999px;padding:5px 13px;font-size:12.5px;cursor:pointer}.scChip[aria-pressed=true]{background:#3a2f17;color:#f1d69f;border-color:#f1d69f}
      .scBar input[type=search]{min-width:200px;background:#111827;color:#dbe4f0;border:1px solid rgba(148,163,184,.3);border-radius:8px;padding:6px 10px}
      .scSec{font-size:14px;font-weight:700;color:#ead9b9;margin:6px 0 2px}
      .scRow{display:grid;grid-template-columns:170px 1fr;gap:12px;border:1px solid rgba(148,163,184,.18);border-radius:10px;padding:10px 12px;background:#0f1927}
      .scRow.now{border-color:#f1d69f;box-shadow:0 0 0 1px rgba(241,214,159,.25)}.scRow.past{opacity:.78}
      .scDate{font-size:12.5px;color:#dbe4f0;font-variant-numeric:tabular-nums}.scDate small{display:block;color:#8290a2;margin-top:2px}
      .scBadge{display:inline-block;font-size:11px;border-radius:4px;padding:1px 6px;margin-right:6px;color:#10151d;font-weight:700}
      .scState{font-size:11px;border-radius:999px;padding:1px 8px;margin-left:6px;border:1px solid rgba(148,163,184,.35);color:#aab6c8}.scState.on{background:#2c4a2c;color:#c8f0c8;border-color:#4a8a4a}.scState.soon{background:#3a2f17;color:#f1d69f;border-color:#f1d69f}
      .scTitle{font-weight:700;color:#ead9b9}.scTitle small{color:#8290a2;font-weight:400;margin-left:6px}
      .scFeat{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.scF{display:inline-flex;gap:6px;align-items:center;background:#111827;border:1px solid rgba(148,163,184,.2);border-radius:999px;padding:2px 10px 2px 2px;font-size:12px;color:#dbe4f0}.scF img{width:28px;height:28px;border-radius:50%;object-fit:cover;background:#0b0f16}
      .scF.wheel img{border-radius:6px}.scDesc{font-size:11.5px;color:#8290a2;margin-top:5px;line-height:1.5}
      .scTable{width:100%;border-collapse:collapse;font-size:12.5px}.scTable th,.scTable td{padding:6px 8px;border-bottom:1px solid rgba(148,163,184,.12);text-align:left;vertical-align:top}.scTable th{color:#8290a2;white-space:nowrap}
      .scMonths{display:flex;gap:4px;flex-wrap:wrap}.scMonths span{font-size:11px;border:1px solid rgba(148,163,184,.25);border-radius:4px;padding:0 5px;color:#c7d2e2;font-variant-numeric:tabular-nums}.scMonths span.first{border-color:#d9a441;color:#f1d69f}
      .scAv{display:flex;gap:8px;align-items:center;min-width:130px}.scAv img{width:30px;height:30px;border-radius:50%;object-fit:cover}
      .scH{border:1px solid rgba(148,163,184,.18);border-radius:10px;background:#0d121a}.scH>summary{cursor:pointer;padding:9px 12px;color:#ead9b9;font-weight:700}.scH .body{padding:0 12px 12px}
      @media(max-width:700px){.scRow{grid-template-columns:1fr}}`;
    document.head.appendChild(s);
  }

  const day=s=>String(s||'').slice(0,10);
  const hhmm=s=>String(s||'').slice(11,16);
  const ms=s=>Date.parse(s);
  const days=(a,b)=>Math.round((ms(b)-ms(a))/86400000);
  const nm=(en,zhName)=>zh()?(zhName||en):en;
  const nk=s=>String(s||'').toLowerCase().replace(/[^a-z0-9一-鿿]/g,'');

  function cat(x){
    if(x.type==='rerun')return /Sylvan/i.test(x.title.en)?'sylvan':'triune';
    if(x.type==='awaken')return 'limited';
    if(['premium','combo','selector','daily'].includes(x.type))return 'premium';
    if(x.kind==='story'||x.kind==='story-rerun')return 'event';
    return 'other';
  }
  const tName=t=>zh()?(t.zh||t.en):t.en;
  const fChip=f=>{
    const it=f.id?state.pool.get(f.id):null;
    return `<span class="scF ${f.k==='wheel'?'wheel':''}">${it?`<img src="${esc(it.img)}" alt="" loading="lazy">`:''}<span>${esc(nm(f.en,f.zh))}</span></span>`;
  };
  function all(){
    const d=state.data;
    return [...d.banners.map(b=>({...b,cat:cat(b),kindKey:b.type})),...d.events.map(e=>({...e,cat:cat(e),kindKey:e.kind,type:e.kind}))];
  }
  function match(x){
    if(state.cat!=='all'&&x.cat!==state.cat)return false;
    const q=nk(state.query);if(!q)return true;
    return nk(x.title.en+x.title.zh).includes(q)||x.featured.some(f=>nk(f.en+f.zh).includes(q));
  }
  function row(x,now){
    const live=ms(x.start)<=now&&now<ms(x.end),soon=ms(x.start)>now,t=TYPE[x.kindKey]||['活动','Event'];
    const st=live?`<span class="scState on">${ui('进行中','Live')}</span>`:soon?`<span class="scState soon">${ui('未开始','Upcoming')}</span>`:'';
    const sub=zh()&&x.title.zh?`<small lang="en">${esc(x.title.en)}</small>`:'';
    const ai=zh()&&x.title.zh&&x.title.zs==='ai'?`<small title="${esc(ui('无官方译名，AI 辅助翻译','No official name, AI-assisted'))}">*</small>`:'';
    return `<div class="scRow${live?' now':''}${!live&&!soon?' past':''}"><div class="scDate">${esc(day(x.start))} ~ ${esc(day(x.end))}<small>${days(x.start,x.end)} ${ui('天','days')} · ${esc(hhmm(x.start))} (UTC+8)</small></div><div><div><span class="scBadge" style="background:${COLOR[x.kindKey]||'#8c97a8'}">${esc(ui(...t))}</span><span class="scTitle">${esc(tName(x.title))}${ai}${sub}</span>${st}</div>${x.featured.length?`<div class="scFeat">${x.featured.map(fChip).join('')}</div>`:''}</div></div>`;
  }

  // appearance months of every awakener: Info.kr monthly history + banners after the history ends
  function appearances(){
    const d=state.data,map=new Map(),last=d.history.length?d.history[d.history.length-1].month:'';
    const add=(c,month,n)=>{if(!c.id)return;const e=map.get(c.id)||{c,months:[]};if(!e.months.some(m=>m.month===month))e.months.push({month,n});map.set(c.id,e)};
    for(const h of d.history)for(const c of h.chars)add(c,h.month,c.n);
    for(const b of d.banners)if(['rerun','awaken'].includes(b.type)){
      const month=day(b.start).slice(0,7);if(month<=last)continue;
      for(const f of b.featured)if(f.k==='awakener')add(f,month,0);
    }
    for(const e of map.values())e.months.sort((a,b)=>b.month<a.month?-1:1);
    return [...map.values()];
  }
  function draw(){
    if(!host)return;
    if(state.error){host.innerHTML=`<div class="scNote">${ui('日历数据加载失败：','Failed to load calendar data: ')}${esc(state.error)}</div>`;return}
    if(!state.data){host.innerHTML=`<div class="scNote">${ui('正在加载日历数据…','Loading calendar data…')}</div>`;return}
    const now=Date.now(),list=all().filter(match).sort((a,b)=>state.dir==='desc'?ms(b.start)-ms(a.start)||ms(b.end)-ms(a.end):ms(a.start)-ms(b.start));
    const live=list.filter(x=>ms(x.start)<=now&&now<ms(x.end)).sort((a,b)=>ms(a.end)-ms(b.end));
    const soon=all().filter(match).filter(x=>ms(x.start)>now).sort((a,b)=>ms(a.start)-ms(b.start)).slice(0,6);
    const q=nk(state.query);
    const ap=appearances().filter(e=>!q||nk(e.c.en+e.c.zh).includes(q)).sort((a,b)=>(b.months[0]?.month||'').localeCompare(a.months[0]?.month||'')||a.c.en.localeCompare(b.c.en));
    const nowMonth=new Date(now+8*3600e3).toISOString().slice(0,7);
    const monthsAgo=m=>{const [y,mo]=m.split('-').map(Number),[ny,nmo]=nowMonth.split('-').map(Number);return (ny-y)*12+(nmo-mo)};
    const histYears=[...state.data.history].reverse().map(h=>`<tr><td>${esc(h.month)}</td><td>${h.chars.map(c=>`${esc(nm(c.en,c.zh))}${c.n===1?`（${ui('首次','first')}）`:c.n>1?` #${c.n}`:''}`).join('、')}</td></tr>`).join('');
    host.innerHTML=`<div class="scWrap">
      <div class="scNote">${ui('卡池 / 活动日期来自 SKeyDB 时间线（游戏服务器时间 UTC+8，2026-02 起有精确到天的记录）；2023-11 至今的角色复刻月份来自 Morimens.Info.kr（韩服记录，只精确到月）；中文名来自游戏翻译表与灰机维基，无官方译名的标题为 AI 辅助翻译（标 *）。三相衡生 = 3 位角色复刻池，因果苗圃 = 3 个命轮复刻池。灰机维基受 Cloudflare 限制，2026-02 之前的卡池精确日期与角色活动日期暂时无法补全。','Banner / event dates come from the SKeyDB timeline (game server time, UTC+8; day-level records from 2026-02). Monthly character rerun history since 2023-11 comes from Morimens.Info.kr (Korean server, month precision). Chinese names come from the game localization table and Huiji Wiki; titles without an official name are AI-assisted (marked *). Triune Verdant = three character reruns, Sylvan Omen = three wheel reruns. Huiji Wiki is blocked by Cloudflare, so exact banner dates before 2026-02 and older character event dates cannot be filled in yet.')}</div>
      <div class="scBar">${CATS.map(([k,cn,en])=>`<button type="button" class="scChip" data-sccat="${k}" aria-pressed="${state.cat===k}">${ui(cn,en)}</button>`).join('')}<input type="search" id="scQuery" value="${esc(state.query)}" placeholder="${esc(ui('搜索角色 / 命轮 / 活动','Search Awakener / wheel / event'))}"><button type="button" class="scChip" data-scdir>${state.dir==='desc'?ui('最新在前 ↓','Newest first ↓'):ui('最早在前 ↑','Oldest first ↑')}</button></div>
      ${live.length?`<div class="scSec">${ui('进行中','Live now')}</div>${live.map(x=>row(x,now)).join('')}`:''}
      ${soon.length?`<div class="scSec">${ui('即将开始','Coming up')}</div>${soon.map(x=>row(x,now)).join('')}`:''}
      <div class="scSec">${ui('全部卡池与活动','All banners & events')} <span class="scNote">${list.length} ${ui('条','entries')}</span></div>
      ${list.map(x=>row(x,now)).join('')||`<div class="scNote">${ui('没有符合条件的条目','No entries match')}</div>`}
      <div class="scSec">${ui('角色复刻统计','Awakener rerun statistics')}</div>
      <div style="overflow:auto"><table class="scTable"><thead><tr><th>${ui('角色','Awakener')}</th><th>${ui('出现次数','Times')}</th><th>${ui('最近一次','Latest')}</th><th>${ui('各次出现月份（含首次）','Months (first release marked)')}</th></tr></thead><tbody>${ap.map(e=>{const it=state.pool.get(e.c.id),latest=e.months[0]?.month||'';return `<tr><td><div class="scAv">${it?`<img src="${esc(it.img)}" alt="" loading="lazy">`:''}<span>${esc(nm(e.c.en,e.c.zh))}</span></div></td><td>${e.months.length}</td><td>${esc(latest)}${latest?` <span class="scNote">${monthsAgo(latest)<=0?ui('本月','this month'):ui(`${monthsAgo(latest)} 个月前`,`${monthsAgo(latest)} mo ago`)}</span>`:''}</td><td><div class="scMonths">${e.months.map(m=>`<span class="${m.n===1?'first':''}">${esc(m.month)}</span>`).join('')}</div></td></tr>`}).join('')}</tbody></table></div>
      <details class="scH"${state.showHistory?' open':''}><summary>${ui('按月份的复刻记录（2023-11 起，Morimens.Info.kr）','Monthly rerun history (since 2023-11, Morimens.Info.kr)')}</summary><div class="body"><table class="scTable"><thead><tr><th>${ui('月份','Month')}</th><th>${ui('角色（#n = 第 n 次出现）','Awakeners (#n = n-th appearance)')}</th></tr></thead><tbody>${histYears}</tbody></table></div></details>
    </div>`;
  }
  async function load(){
    if(state.data||state.loading)return;
    state.loading=true;
    try{
      const [d,p]=await Promise.all([fetch('data/morimens/game/summon-calendar.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}),fetch('data/morimens/game/tier-pool.json',{cache:'no-cache'}).then(r=>r.json()).catch(()=>({kinds:{}}))]);
      for(const k of ['awakener','wheel'])for(const it of p.kinds?.[k]||[])state.pool.set(it.id,it);
      state.data=d;
    }catch(e){state.error=e.message}
    state.loading=false;draw();
  }
  function open(){host=document.getElementById('morimensSummonPanel');if(!host)return;ensureStyle();bindOnce();draw();load()}
  let bound=false;
  function bindOnce(){
    if(bound)return;bound=true;
    document.addEventListener('click',e=>{
      if(!host?.contains(e.target))return;
      const c=e.target.closest('[data-sccat]');if(c){state.cat=c.dataset.sccat;draw();return}
      if(e.target.closest('[data-scdir]')){state.dir=state.dir==='desc'?'asc':'desc';draw()}
    });
    document.addEventListener('input',e=>{if(e.target?.id==='scQuery'){state.query=e.target.value;const pos=e.target.selectionStart;draw();const i=document.getElementById('scQuery');if(i){i.focus();i.setSelectionRange(pos,pos)}}});
    document.addEventListener('toggle',e=>{if(e.target?.classList?.contains('scH'))state.showHistory=e.target.open},true);
    window.addEventListener('morimens-language-change',()=>{if(host&&!host.hidden)draw()});
  }
  window.MorimensSummonCalendar={open};
})();

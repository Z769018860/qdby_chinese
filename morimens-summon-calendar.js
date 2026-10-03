// "卡池活动复刻日历": banner / rerun / character event calendar.
// Data: data/morimens/game/summon-calendar.json (scripts/sync_summon_calendar.mjs) joined with the tier-list image pool.
(()=>{
  'use strict';
  const zh=()=>localStorage.getItem('morimens.language')!=='en';
  const ui=(cn,en)=>zh()?cn:en;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state={data:null,pool:new Map(),cat:'all',query:'',dir:'desc',loading:false,error:null,limit:40,gapKind:'awakener',view:'year',year:null,day:null};
  let host=null;

  const CATS=[['all','全部','All'],['triune','三相衡生（角色复刻）','Triune Verdant (character reruns)'],['sylvan','因果苗圃（命轮复刻）','Sylvan Omen (wheel reruns)'],['limited','限时唤醒（新角色 + 专属命轮）','Limited (new Awakener + wheel)'],['premium','精选 / 命轨合契 / 循序命理 / 界域锚定 / 自选等','Premium / Walks / Fated Soiree / Realm Anchor / selectors'],['event','角色活动（含复刻）','Character events (incl. reruns)'],['other','时装 / 命轮活动','Skins / wheel events']];
  const TYPE={awaken:['限时唤醒','Limited banner'],rerun:['复刻唤醒','Rerun banner'],premium:['精选唤醒','Premium banner'],combo:['组合唤醒','Combo banner'],selector:['自选唤醒','Selector banner'],daily:['每日唤醒','Daily banner'],walks:['命轨合契','Walks of All Life'],fated:['循序命理','Fated Soiree'],anchor:['界域锚定','Realm Anchor'],novice:['众生百相','Novice pool'],select:['角色自选','Self-select'],oath:['缚誓之谕','Oathbound Oracle'],story:['角色活动','Character event'],'story-rerun':['角色活动复刻','Event rerun'],skin:['时装活动','Skin event'],wheel:['命轮活动','Wheel event']};
  const FC={'混沌辅助型':'Chaos support banner','超维防御型':'Ultra defense banner','小版本':'Minor version','神王·图鲁':'Tulu: Sovereign (reissue)'};
  const COLOR={awaken:'#d9a441',rerun:'#62b7ff',premium:'#d978d0',combo:'#d978d0',selector:'#d978d0',daily:'#8c97a8',walks:'#d978d0',fated:'#8c97a8',anchor:'#8c97a8',novice:'#8c97a8',select:'#8c97a8',oath:'#8c97a8',story:'#71aa86','story-rerun':'#71aa86',skin:'#c75e68',wheel:'#6fb1a8'};

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
      .ycWrap{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
      .ycM{border:1px solid rgba(148,163,184,.18);border-radius:10px;background:#0d121a;padding:8px}.ycH{font-weight:700;color:#ead9b9;margin:0 2px 4px}
      .ycW,.ycG{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}.ycW i{font-style:normal;text-align:center;font-size:10px;color:#8290a2}
      .ycE{display:block}.ycD{position:relative;height:34px;border:1px solid rgba(148,163,184,.12);border-radius:5px;background:#111827;padding:0;cursor:pointer;overflow:hidden;color:#dbe4f0}
      .ycS{position:absolute;inset:0;display:flex;flex-direction:column}.ycS span{flex:1;opacity:.85}.ycD b{position:relative;font-size:10.5px;font-weight:700;text-shadow:0 0 3px #000,0 0 2px #000}
      .ycD.today{outline:2px solid #fff;outline-offset:-2px}.ycD.sel{outline:2px solid #f1d69f;outline-offset:-2px}.ycD:hover{filter:brightness(1.25)}
      .ycLegend{display:flex;gap:6px 14px;flex-wrap:wrap;font-size:12px;color:#aab6c8}.ycL i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:5px;vertical-align:-1px}
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
    if(x.cat)return x.cat;
    if(x.type==='rerun')return /Sylvan/i.test(x.title.en)?'sylvan':'triune';
    if(x.type==='awaken')return 'limited';
    if(['premium','combo','selector','daily'].includes(x.type))return 'premium';
    if(x.kind==='story'||x.kind==='story-rerun')return 'event';
    return 'other';
  }
  const tName=t=>zh()?(t.zh||t.en):(t.en||t.zh);
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
  // ---------- year calendar: every banner paints the days it covers in its category colour ----------
  const CATCOLOR={triune:'#62b7ff',sylvan:'#4fc58a',limited:'#e0a83a',premium:'#d978d0',event:'#ef7d62',other:'#8c97a8'};
  const CATORDER=['limited','triune','sylvan','premium','event','other'];
  const dstr=d=>d.toISOString().slice(0,10);
  function coverage(items,year){
    const map=new Map(),lo=`${year}-01-01`,hi=`${year}-12-31`;
    for(const x of items){
      let a=day(x.start),b=day(x.end||x.start);if(b<=a)b=a;
      const endExcl=b>a;                      // a banner ending 09:00 on day D does not paint D itself
      for(let t=Date.UTC(+a.slice(0,4),+a.slice(5,7)-1,+a.slice(8,10));;t+=86400000){
        const k=dstr(new Date(t));if(k>hi||k>b||(endExcl&&k===b))break;
        if(k>=lo){const l=map.get(k)||[];l.push(x);map.set(k,l)}
      }
    }
    return map;
  }
  function yearHtml(items,now){
    const year=state.year,cov=coverage(items,year),todayK=dstr(new Date(now+8*3600e3));
    const MN=zh()?['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const WD=zh()?['一','二','三','四','五','六','日']:['M','T','W','T','F','S','S'];
    const months=MN.map((mn,mi)=>{
      const first=new Date(Date.UTC(year,mi,1)),len=new Date(Date.UTC(year,mi+1,0)).getUTCDate(),lead=(first.getUTCDay()+6)%7;
      let cells='';for(let i=0;i<lead;i++)cells+='<i class="ycE"></i>';
      for(let d=1;d<=len;d++){
        const k=`${year}-${String(mi+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`,l=(cov.get(k)||[]).slice().sort((a,b)=>CATORDER.indexOf(a.cat)-CATORDER.indexOf(b.cat));
        const stripes=l.map(x=>`<span style="background:${CATCOLOR[x.cat]||'#8c97a8'}"></span>`).join('');
        const tip=l.map(x=>tName(x.title)+(x.featured.length?'：'+x.featured.map(f=>nm(f.en,f.zh)).join('、'):'')).join('\n');
        cells+=`<button type="button" class="ycD${k===todayK?' today':''}${state.day===k?' sel':''}" data-scday="${k}" title="${esc(k+(tip?'\n'+tip:''))}"><span class="ycS">${stripes}</span><b>${d}</b></button>`;
      }
      return `<div class="ycM"><div class="ycH">${mn}</div><div class="ycW">${WD.map(w=>`<i>${w}</i>`).join('')}</div><div class="ycG">${cells}</div></div>`;
    }).join('');
    const legend=CATS.filter(c=>c[0]!=='all').map(([k,cn,en])=>`<span class="ycL"><i style="background:${CATCOLOR[k]}"></i>${esc(ui(cn,en))}</span>`).join('');
    const sel=state.day?(cov.get(state.day)||[]):null;
    const years=[];for(let y=2023;y<=new Date(now).getUTCFullYear()+1;y++)years.push(y);
    return `<div class="scBar"><button type="button" class="scChip" data-scyear="${year-1}"${year<=2023?' disabled':''}>←</button>${years.map(y=>`<button type="button" class="scChip" data-scyear="${y}" aria-pressed="${y===year}">${y}</button>`).join('')}<button type="button" class="scChip" data-scyear="${year+1}"${year>=years[years.length-1]?' disabled':''}>→</button></div>
      <div class="ycLegend">${legend}</div>
      <div class="ycWrap">${months}</div>
      ${state.day?`<div class="scSec">${esc(state.day)} ${ui('当天的卡池 / 活动','banners / events on this day')}</div>${sel.length?sel.map(x=>row(x,now)).join(''):`<div class="scNote">${ui('这一天没有记录的卡池或活动','Nothing recorded for this day')}</div>`}`:`<div class="scNote">${ui('点击日期查看当天卡池详情；颜色条从上到下按「限时 / 三相衡生 / 因果苗圃 / 精选等 / 角色活动 / 其他」排列，同一天多个卡池会并排叠色。','Click a day for its banners. Overlapping banners stack as stripes in the order limited / Triune / Sylvan / premium / events / other.')}</div>`}`;
  }
  function row(x,now){
    const live=ms(x.start)<=now&&now<ms(x.end),soon=ms(x.start)>now,t=TYPE[x.kindKey]||['活动','Event'];
    const st=live?`<span class="scState on">${ui('进行中','Live')}</span>`:soon?`<span class="scState soon">${ui('未开始','Upcoming')}</span>`:'';
    const sub=zh()&&x.title.zh?`<small lang="en">${esc(x.title.en)}</small>`:'';
    const ai=zh()&&x.title.zh&&x.title.zs==='ai'?`<small title="${esc(ui('无官方译名，AI 辅助翻译','No official name, AI-assisted'))}">*</small>`:'';
    return `<div class="scRow${live?' now':''}${!live&&!soon?' past':''}"><div class="scDate">${esc(day(x.start))} ~ ${esc(day(x.end))}<small>${days(x.start,x.end)} ${ui('天','days')} · ${esc(hhmm(x.start))} (UTC+8)</small></div><div><div><span class="scBadge" style="background:${COLOR[x.kindKey]||'#8c97a8'}">${esc(ui(...t))}</span><span class="scTitle">${esc(tName(x.title))}${ai}${sub}</span>${st}</div>${x.featured.length?`<div class="scFeat">${x.featured.map(fChip).join('')}</div>`:''}</div></div>`;
  }

  // Rerun gap leaderboard: how long ago each Awakener / wheel last had an event banner (limited or rerun), longest gap first
  function gaps(kind,now){
    const map=new Map();
    for(const b of state.data.banners){
      if(!['awaken','rerun'].includes(b.type))continue;
      for(const f of b.featured)if(f.k===kind&&f.id){const e=map.get(f.id)||{ref:f,runs:[]};if(!e.runs.some(r=>r.start===b.start))e.runs.push({start:b.start,end:b.end});map.set(f.id,e)}
    }
    return [...map.values()].map(e=>{
      e.runs.sort((a,b)=>ms(a.start)-ms(b.start));
      const live=e.runs.find(r=>ms(r.start)<=now&&now<ms(r.end)),ended=e.runs.filter(r=>ms(r.end)<=now),next=e.runs.find(r=>ms(r.start)>now),last=ended[ended.length-1]||null;
      const gap=live?0:last?Math.floor((now-ms(last.end))/86400000):null;
      let sum=0,n=0;for(let i=1;i<e.runs.length;i++){const d=(ms(e.runs[i].start)-ms(e.runs[i-1].end))/86400000;if(d>=0){sum+=d;n++}}
      return {...e,live,next,last,gap,avg:n?Math.round(sum/n):null,count:e.runs.length,first:e.runs[0]};
    }).sort((a,b)=>(b.live?-1:0)-(a.live?-1:0)||((b.gap??-1)-(a.gap??-1)));
  }
  function draw(){
    if(!host)return;
    if(state.error){host.innerHTML=`<div class="scNote">${ui('日历数据加载失败：','Failed to load calendar data: ')}${esc(state.error)}</div>`;return}
    if(!state.data){host.innerHTML=`<div class="scNote">${ui('正在加载日历数据…','Loading calendar data…')}</div>`;return}
    const now=Date.now();if(state.year==null)state.year=new Date(now+8*3600e3).getUTCFullYear();
    const list=all().filter(match).sort((a,b)=>state.dir==='desc'?ms(b.start)-ms(a.start)||ms(b.end)-ms(a.end):ms(a.start)-ms(b.start));
    const live=list.filter(x=>ms(x.start)<=now&&now<ms(x.end)).sort((a,b)=>ms(a.end)-ms(b.end));
    const soon=all().filter(match).filter(x=>ms(x.start)>now).sort((a,b)=>ms(a.start)-ms(b.start)).slice(0,6);
    const q=nk(state.query);
    const gp=gaps(state.gapKind,now).filter(e=>!q||nk(e.ref.en+e.ref.zh).includes(q));
    const rank=new Map(gaps(state.gapKind,now).filter(e=>!e.live&&e.gap!=null).map((e,i)=>[e.ref.id,i+1]));
    const shown=list.slice(0,state.limit);
    host.innerHTML=`<div class="scWrap">
      <div class="scNote">${ui('卡池日期来自灰机维基「唤醒」页（2023-11 起，含复刻、三相衡生 / 因果苗圃、命轨合契、循序命理、界域锚定等）与 SKeyDB 时间线（2026-02 起，含英文名与角色活动），时间为游戏服务器时间 UTC+8；Morimens.Info.kr 的复刻记录用于交叉核对。中文名来自游戏翻译表与灰机维基，无官方译名的标题为 AI 辅助翻译（标 *）。三相衡生 = 3 位角色复刻池，因果苗圃 = 3 个命轮复刻池。角色活动（剧情活动）日期目前只有 2026-02 之后的记录。','Banner dates come from the Huiji Wiki 唤醒 page (since 2023-11: reruns, Triune Verdant / Sylvan Omen, Walks of All Life, Fated Soiree, Realm Anchor, …) and the SKeyDB timeline (since 2026-02, with English names and character events); times are game server time (UTC+8). Morimens.Info.kr rerun records are used for cross-checking. Chinese names come from the game localization table and Huiji Wiki; titles without an official name are AI-assisted (marked *). Triune Verdant = three character reruns, Sylvan Omen = three wheel reruns. Character (story) event dates only exist from 2026-02 on.')}</div>
      <div class="scBar">${CATS.map(([k,cn,en])=>`<button type="button" class="scChip" data-sccat="${k}" aria-pressed="${state.cat===k}">${ui(cn,en)}</button>`).join('')}<input type="search" id="scQuery" value="${esc(state.query)}" placeholder="${esc(ui('搜索角色 / 命轮 / 活动','Search Awakener / wheel / event'))}"><button type="button" class="scChip" data-scdir>${state.dir==='desc'?ui('最新在前 ↓','Newest first ↓'):ui('最早在前 ↑','Oldest first ↑')}</button></div>
      ${live.length?`<div class="scSec">${ui('进行中','Live now')}</div>${live.map(x=>row(x,now)).join('')}`:''}
      ${soon.length?`<div class="scSec">${ui('即将开始','Coming up')}</div>${soon.map(x=>row(x,now)).join('')}`:''}
      <div class="scSec">${ui('全部卡池与活动','All banners & events')} <span class="scNote">${list.length} ${ui('条','entries')}</span> <button type="button" class="scChip" data-scview="year" aria-pressed="${state.view==='year'}">${ui('年历','Year calendar')}</button> <button type="button" class="scChip" data-scview="list" aria-pressed="${state.view==='list'}">${ui('列表','List')}</button></div>
      ${state.view==='year'?yearHtml(list,now):`${shown.map(x=>row(x,now)).join('')||`<div class="scNote">${ui('没有符合条件的条目','No entries match')}</div>`}
      ${list.length>shown.length?`<button type="button" class="scChip" data-scmore>${ui(`显示更多（还有 ${list.length-shown.length} 条）`,`Show more (${list.length-shown.length} left)`)}</button>`:''}`}
      ${state.data.forecast?.length?`<div class="scSec">${ui('未来唤醒预测（灰机维基，仅供参考）','Forecast (Huiji Wiki, for entertainment only)')}</div><div style="overflow:auto"><table class="scTable"><thead><tr><th>${ui('开启时间','Starts')}</th><th>${ui('内容','Content')}</th></tr></thead><tbody>${state.data.forecast.map(f=>`<tr><td>${esc(day(f.start))}${f.end?` ~ ${esc(day(f.end))}`:''}</td><td>${esc(zh()?f.text:(FC[f.text]||f.text))}</td></tr>`).join('')}</tbody></table></div>`:''}
      <div class="scSec">${ui('复刻空白期榜单','Rerun gap leaderboard')}</div>
      <div class="scNote">${ui('统计限时 / 复刻活动唤醒（含三相衡生、因果苗圃），从最近一次卡池结束算起，空白越久越靠前；进行中的排在最前。1 期 = 28 天。仅作参考，官方排期以公告为准。','Counts limited and rerun event banners (incl. Triune Verdant / Sylvan Omen); the gap runs from the end of the latest banner, longest first; live ones come first. 1 cycle = 28 days. For reference only — follow official announcements.')}</div>
      <div class="scBar"><button type="button" class="scChip" data-scgap="awakener" aria-pressed="${state.gapKind==='awakener'}">${ui('唤醒体','Awakeners')}</button><button type="button" class="scChip" data-scgap="wheel" aria-pressed="${state.gapKind==='wheel'}">${ui('命轮','Wheels')}</button></div>
      <div style="overflow:auto"><table class="scTable"><thead><tr><th>${ui('排名','#')}</th><th>${ui('名称','Name')}</th><th>${ui('首次出现','First')}</th><th>${ui('出现次数','Times')}</th><th>${ui('最近一次','Latest')}</th><th>${ui('空白期','Gap')}</th><th>${ui('平均间隔','Avg. gap')}</th></tr></thead><tbody>${gp.map(e=>{const it=state.pool.get(e.ref.id);const st=e.live?`<span class="scState on">${ui('进行中','Live')}</span>`:e.gap==null?'—':`<b>${e.gap}</b> ${ui('天','d')} <span class="scNote">(${(e.gap/28).toFixed(1)} ${ui('期','cycles')})</span>`;return `<tr><td>${rank.get(e.ref.id)||''}</td><td><div class="scAv">${it?`<img src="${esc(it.img)}" alt="" loading="lazy">`:''}<span>${esc(nm(e.ref.en,e.ref.zh))}</span></div></td><td>${esc(day(e.first.start))}</td><td>${e.count}</td><td>${e.last?`${esc(day(e.last.start))} ~ ${esc(day(e.last.end))}`:esc(day(e.live?.start||''))}${e.next?` <span class="scState soon">${ui('已排期 ','Next ')}${esc(day(e.next.start))}</span>`:''}</td><td>${st}</td><td>${e.avg==null?'—':`${e.avg} ${ui('天','d')}`}</td></tr>`}).join('')}</tbody></table></div>
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
      const c=e.target.closest('[data-sccat]');if(c){state.cat=c.dataset.sccat;state.limit=40;draw();return}
      if(e.target.closest('[data-scdir]')){state.dir=state.dir==='desc'?'asc':'desc';draw();return}
      if(e.target.closest('[data-scmore]')){state.limit+=60;draw();return}
      const v=e.target.closest('[data-scview]');if(v){state.view=v.dataset.scview;draw();return}
      const yb=e.target.closest('[data-scyear]');if(yb&&!yb.disabled){state.year=+yb.dataset.scyear;state.day=null;draw();return}
      const dd=e.target.closest('[data-scday]');if(dd){state.day=state.day===dd.dataset.scday?null:dd.dataset.scday;draw();return}
      const g=e.target.closest('[data-scgap]');if(g){state.gapKind=g.dataset.scgap;draw()}
    });
    document.addEventListener('input',e=>{if(e.target?.id==='scQuery'){state.query=e.target.value;const pos=e.target.selectionStart;draw();const i=document.getElementById('scQuery');if(i){i.focus();i.setSelectionRange(pos,pos)}}});
    window.addEventListener('morimens-language-change',()=>{if(host&&!host.hidden)draw()});
  }
  window.MorimensSummonCalendar={open};
})();

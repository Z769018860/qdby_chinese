// "卡池活动复刻日历": banner / rerun / character event calendar.
// Data: data/morimens/game/summon-calendar.json (scripts/sync_summon_calendar.mjs) joined with the tier-list image pool.
(()=>{
  'use strict';
  const zh=()=>localStorage.getItem('morimens.language')!=='en';
  const ui=(cn,en)=>zh()?cn:en;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state={data:null,pool:new Map(),cat:'all',query:'',dir:'desc',loading:false,error:null,limit:40,gapKind:'awakener',showNext:true,view:'year',year:null,month:null,day:null,pick:null,ymode:'month'};
  let host=null;

  const CATS=[['all','全部','All'],['triune','三相衡生（角色复刻）','Triune Verdant (character reruns)'],['sylvan','因果苗圃（命轮复刻）','Sylvan Omen (wheel reruns)'],['limited','限时唤醒（新角色 + 专属命轮）','Limited (new Awakener + wheel)'],['premium','精选 / 命轨合契 / 循序命理 / 界域锚定 / 自选等','Premium / Walks / Fated Soiree / Realm Anchor / selectors'],['event','角色活动（含复刻）','Character events (incl. reruns)'],['other','时装 / 命轮活动','Skins / wheel events']];
  const TYPE={awaken:['限时唤醒','Limited banner'],rerun:['复刻唤醒','Rerun banner'],premium:['精选唤醒','Premium banner'],combo:['组合唤醒','Combo banner'],selector:['自选唤醒','Selector banner'],daily:['每日唤醒','Daily banner'],walks:['命轨合契','Walks of All Life'],fated:['循序命理','Fated Soiree'],anchor:['界域锚定','Realm Anchor'],novice:['众生百相','Novice pool'],select:['角色自选','Self-select'],oath:['缚誓之谕','Oathbound Oracle'],story:['角色活动','Character event'],'story-rerun':['角色活动复刻','Event rerun'],skin:['时装活动','Skin event'],special:['特别活动','Special event'],chronicle:['纪行活动','Chronicle event'],wheel:['命轮活动','Wheel event']};
  const futureForecast=()=>(state.data?.forecast||[]).filter(f=>!f.start||Date.parse(f.start)>Date.now());
  const FC={'混沌辅助型':'Chaos support banner','混沌唤醒体':'Chaos awakener banner','超维防御型':'Ultra defense banner','小版本':'Minor version','神王·图鲁':'Tulu: Sovereign (reissue)'};
  const COLOR={awaken:'#d9a441',rerun:'#62b7ff',premium:'#d978d0',combo:'#d978d0',selector:'#d978d0',daily:'#8c97a8',walks:'#d978d0',fated:'#8c97a8',anchor:'#8c97a8',novice:'#8c97a8',select:'#8c97a8',oath:'#8c97a8',story:'#71aa86','story-rerun':'#71aa86',skin:'#c75e68',special:'#6fb1a8',chronicle:'#6fb1a8',wheel:'#6fb1a8'};

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
      .ymBox{border:1px solid rgba(148,163,184,.18);border-radius:10px;background:#0d121a;padding:6px;overflow-x:auto}
      .ymHead{display:grid;grid-template-columns:repeat(7,minmax(90px,1fr));gap:2px;margin-bottom:2px;min-width:640px}.ymHead i{font-style:normal;text-align:center;font-size:11px;color:#8290a2}
      .ymWeek{display:grid;grid-template-columns:repeat(7,minmax(90px,1fr));grid-auto-rows:auto;gap:2px;min-width:640px;margin-bottom:6px;border-bottom:1px dashed rgba(148,163,184,.12);padding-bottom:4px;background-image:repeating-linear-gradient(90deg,transparent 0,transparent calc(100%/7 - 1px),rgba(148,163,184,.1) calc(100%/7 - 1px),rgba(148,163,184,.1) calc(100%/7))}
      .ymD{height:20px;border:0;border-radius:4px;background:#111827;color:#dbe4f0;font-size:11px;font-weight:700;text-align:left;padding:0 5px;cursor:pointer}.ymD.out{opacity:.35}.ymD.today{background:#3a2f17;color:#f1d69f;outline:1px solid #f1d69f}.ymD.sel{outline:2px solid #fff}
      .ymB{display:flex;align-items:center;gap:4px;min-height:34px;border:0;border-radius:6px;padding:2px 5px;color:#10151d;text-align:left;cursor:pointer;overflow:hidden;font-family:inherit}.ymB.cl{border-top-left-radius:0;border-bottom-left-radius:0}.ymB.cr{border-top-right-radius:0;border-bottom-right-radius:0}
      .ymB img{width:28px;height:28px;border-radius:50%;object-fit:cover;flex:none;border:1px solid rgba(0,0,0,.4);background:#0b0f16;margin-left:-6px}.ymB img:first-child{margin-left:0}
      .ymT{display:flex;flex-direction:column;min-width:0;line-height:1.2}.ymT b{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ymT i{font-style:normal;font-size:11px;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .ymB:hover{filter:brightness(1.12)}.ymB.sel{outline:2px solid #fff;outline-offset:-2px}
      .ycWrap{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
      .ycM{border:1px solid rgba(148,163,184,.18);border-radius:10px;background:#0d121a;padding:8px}.ycH{font-weight:700;color:#ead9b9;margin:0 2px 4px}
      .ycW,.ycG{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}.ycW i{font-style:normal;text-align:center;font-size:10px;color:#8290a2}
      .fyD{position:relative;height:40px;border:1px solid rgba(148,163,184,.12);border-radius:5px;background:#111827;padding:0;cursor:pointer;overflow:hidden;color:#fff}
      .fyS{position:absolute;inset:0;display:flex;flex-direction:column}.fyS span{flex:1;opacity:.9}
      .fyD b{position:absolute;left:3px;top:1px;font-size:10.5px;font-weight:800;text-shadow:0 0 3px #000,0 0 2px #000,1px 1px 2px #000;z-index:2}
      .fyA{position:absolute;right:1px;bottom:1px;display:flex;z-index:2}.fyA img+img{margin-left:-6px}.fyA img{width:17px;height:17px;border-radius:50%;object-fit:cover;border:1px solid rgba(0,0,0,.6);background:#0b0f16}
      .fyD.today{outline:2px solid #fff;outline-offset:-2px}.fyD.sel{outline:2px solid #f1d69f;outline-offset:-2px}.fyD.hit{box-shadow:inset 0 0 0 2px #fff}.fyD:hover{filter:brightness(1.2)}
      .fyList{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:6px}
      .fyL{display:flex;gap:6px;align-items:center;text-align:left;background:#0f1927;border:1px solid rgba(148,163,184,.18);border-radius:8px;padding:5px 8px;color:#dbe4f0;cursor:pointer;font-family:inherit}.fyL.sel{border-color:#fff}
      .fyL>i{width:10px;align-self:stretch;border-radius:3px;flex:none}.fyL img{width:26px;height:26px;border-radius:50%;object-fit:cover;margin-left:-8px;border:1px solid #0b0f16}.fyL img:first-of-type{margin-left:0}
      .fyL span{display:flex;flex-direction:column;min-width:0}.fyL b{font-size:12px;color:#ead9b9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.fyL small{font-size:11px;color:#8fa2bd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .ycLegend{display:flex;gap:6px 14px;flex-wrap:wrap;font-size:12px;color:#aab6c8}.ycL i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:5px;vertical-align:-1px}
      @media(max-width:700px){.scRow{grid-template-columns:1fr}}`;
    document.head.appendChild(s);
  }

  const uniqF=fs=>{const seen=new Set();return (fs||[]).filter(f=>{const k=f.id||f.en||f.zh;if(seen.has(k))return false;seen.add(k);return true})};
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
  const p2=n=>String(n).padStart(2,'0');
  const dstr=d=>d.toISOString().slice(0,10);
  // Month view: every banner / event is a labelled bar (icons + names) spanning its days; the year is navigated by month chips.
  const addDays=(k,n)=>dstr(new Date(Date.parse(k+'T00:00:00Z')+n*86400000));
  const dayDiff=(a,b)=>Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000);
  function barLabel(x){
    const names=uniqF(x.featured).map(f=>nm(f.en,f.zh)).filter(Boolean);
    const t=tName(x.title);
    return {t,names:names.join(zh()?'、':', ')};
  }
  // Full-year view: 12 mini months; every banner paints its days in its own colour (category colour when no filter is set)
  const PALETTE=['#62b7ff','#4fc58a','#e0a83a','#d978d0','#ef7d62','#5fd0d0','#b4a0ff','#e8d36a','#ff8fb1','#9fd356','#ffb057','#7aa8ff'];
  function fullYearHtml(items,now){
    const year=state.year,todayK=dstr(new Date(now+8*3600e3)),lo=`${year}-01-01`,hi=`${year}-12-31`;
    const span=x=>{const a=day(x.start);let b=day(x.end||x.start);if(b<=a)b=addDays(a,1);return {a,b}};
    const yi=items.filter(x=>{const {a,b}=span(x);return a<=hi&&b>lo}).sort((p,q)=>span(p).a.localeCompare(span(q).a)||p.id.localeCompare(q.id));
    const perItem=state.cat!=='all';
    const color=new Map(yi.map((x,i)=>[x.id,perItem?PALETTE[i%PALETTE.length]:(CATCOLOR[x.cat]||'#8c97a8')]));
    const cov=new Map(),startsOn=new Map();
    for(const x of yi){
      const {a,b}=span(x);
      for(let k=a<lo?lo:a;k<b&&k<=hi;k=addDays(k,1)){const l=cov.get(k)||[];l.push(x);cov.set(k,l)}
      if(a>=lo&&a<=hi){const l=startsOn.get(a)||[];l.push(x);startsOn.set(a,l)}
    }
    const MN=zh()?['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const WD=zh()?['一','二','三','四','五','六','日']:['M','T','W','T','F','S','S'];
    const startIds=st=>{const ids=[];for(const x of st)for(const f of uniqF(x.featured))if(f.id&&state.pool.get(f.id)&&!ids.includes(f.id))ids.push(f.id);return ids};
    const months=MN.map((mn,mi)=>{
      const first=`${year}-${p2(mi+1)}-01`,len=new Date(Date.UTC(year,mi+1,0)).getUTCDate(),lead=(new Date(first+'T00:00:00Z').getUTCDay()+6)%7;
      let cells='';for(let i=0;i<lead;i++)cells+='<i></i>';
      for(let d=1;d<=len;d++){
        const k=`${year}-${p2(mi+1)}-${p2(d)}`,l=cov.get(k)||[],st=startsOn.get(k)||[];
        const stripes=l.map(x=>`<span style="background:${color.get(x.id)}"></span>`).join('');
        const avs=startIds(st).slice(0,3).map(id=>`<img src="${esc(state.pool.get(id).img)}" alt="" loading="lazy">`).join('');
        const tip=l.map(x=>`${tName(x.title)}${x.featured.length?'：'+x.featured.map(f=>nm(f.en,f.zh)).join('、'):''}`).join('\n');
        const hit=state.pick&&l.some(x=>x.id===state.pick);
        cells+=`<button type="button" class="fyD${k===todayK?' today':''}${state.day===k?' sel':''}${hit?' hit':''}" data-scday="${k}" title="${esc(k+(tip?'\n'+tip:''))}"><span class="fyS">${stripes}</span>${avs?`<span class="fyA">${avs}</span>`:''}<b>${d}</b></button>`;
      }
      return `<div class="ycM"><div class="ycH">${mn}</div><div class="ycW">${WD.map(w=>`<i>${w}</i>`).join('')}</div><div class="ycG">${cells}</div></div>`;
    }).join('');
    const legend=yi.map(x=>{
      const {a,b}=span(x),icons=uniqF(x.featured).slice(0,4).map(f=>{const it=f.id?state.pool.get(f.id):null;return it?`<img src="${esc(it.img)}" alt="" loading="lazy">`:''}).join('');
      const names=x.featured.map(f=>nm(f.en,f.zh)).join(zh()?'、':', ');
      return `<button type="button" class="fyL${state.pick===x.id?' sel':''}" data-scpick="${esc(x.id)}"><i style="background:${color.get(x.id)}"></i>${icons}<span><b>${esc(tName(x.title))}</b><small>${esc(a)} ~ ${esc(day(x.end))}${names?' · '+esc(names):''}</small></span></button>`;
    }).join('');
    const years=[];for(let y=2023;y<=new Date(now).getUTCFullYear()+1;y++)years.push(y);
    const picked=state.pick?items.find(x=>x.id===state.pick):null,dayItems=state.day?(cov.get(state.day)||[]):null;
    const catLegend=perItem?'':CATS.filter(c=>c[0]!=='all').map(([k,cn,en])=>`<span class="ycL"><i style="background:${CATCOLOR[k]}"></i>${esc(ui(cn,en))}</span>`).join('');
    return `<div class="scBar"><button type="button" class="scChip" data-scyear="${year-1}"${year<=2023?' disabled':''}>←</button>${years.map(y=>`<button type="button" class="scChip" data-scyear="${y}" aria-pressed="${y===year}">${y}</button>`).join('')}<button type="button" class="scChip" data-scyear="${year+1}"${year>=years[years.length-1]?' disabled':''}>→</button></div>
      <div class="scNote">${perItem?ui('当前已按类别筛选：每个卡池用不同颜色覆盖它的日期，开始当天标出头像；下方列表的色块与日历对应，点击列表项可高亮日期。','A category is selected: every banner paints its days in its own colour with an avatar on its first day; the list below matches the colours — click an item to highlight its days.'):ui('未筛选类别时按类别着色；选择上方的类别（如三相衡生）后，每个卡池会用不同颜色区分并标出头像。','Without a category filter the colours are per category; pick a category above (e.g. Triune Verdant) to colour every banner separately with its avatar.')}</div>
      ${catLegend?`<div class="ycLegend">${catLegend}</div>`:''}
      <div class="ycWrap">${months}</div>
      ${picked?`<div class="scSec">${ui('所选条目','Selected')}</div>${row(picked,now)}`:''}
      ${dayItems?`<div class="scSec">${esc(state.day)} ${ui('当天的卡池 / 活动','banners / events on this day')}</div>${dayItems.length?dayItems.map(x=>row(x,now)).join(''):`<div class="scNote">${ui('这一天没有记录的卡池或活动','Nothing recorded for this day')}</div>`}`:''}
      <div class="scSec">${year} ${ui('全年','full year')} · ${yi.length} ${ui('个卡池 / 活动','banners / events')}</div>
      <div class="fyList">${legend||`<div class="scNote">${ui('这一年没有记录','Nothing recorded this year')}</div>`}</div>`;
  }
  // ---------- PNG export of the current calendar view (month bars or full year) ----------
  const FONT='"Microsoft YaHei",PingFang SC,sans-serif';
  const loadImg=src=>new Promise(res=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>res(null);i.src=src});
  const clipText=(g,t,maxW)=>{if(g.measureText(t).width<=maxW)return t;while(t.length>1&&g.measureText(t+'…').width>maxW)t=t.slice(0,-1);return t+'…'};
  const rr=(g,x,y,w,h,r)=>{g.beginPath();g.roundRect?g.roundRect(x,y,w,h,r):g.rect(x,y,w,h)};
  async function exportImage(btn){
    const before=btn.textContent;btn.disabled=true;btn.textContent=ui('生成中…','Rendering…');
    try{
      const now=Date.now(),items=all().filter(match),year=state.year,month=state.month;
      const catName=state.cat==='all'?ui('全部','All'):ui(...CATS.find(c=>c[0]===state.cat).slice(1));
      const span=x=>{const a=day(x.start);let b=day(x.end||x.start);if(b<=a)b=addDays(a,1);return {a,b}};
      const imgs=new Map();
      const need=new Set();for(const x of items)for(const f of x.featured)if(f.id&&state.pool.get(f.id))need.add(f.id);
      await Promise.all([...need].map(async id=>imgs.set(id,await loadImg(state.pool.get(id).img))));
      const W=1400,PAD=20,TOP=64,FOOT=36;
      const title=state.ymode==='year'?`${year} ${ui('卡池 / 活动年历','banner & event calendar')} · ${catName}`:`${year}-${p2(month)} ${ui('卡池 / 活动月历','banner & event calendar')} · ${catName}`;
      const cv=document.createElement('canvas'),g0=cv.getContext('2d');
      const draw=(H,fn)=>{cv.width=W;cv.height=H;const g=cv.getContext('2d');g.fillStyle='#0b0f16';g.fillRect(0,0,W,H);g.fillStyle='#ead9b9';g.font=`700 28px ${FONT}`;g.textBaseline='middle';g.textAlign='left';g.fillText(title,PAD,TOP/2+4);fn(g);
        g.fillStyle='#8290a2';g.font=`13px ${FONT}`;g.textBaseline='middle';g.textAlign='left';
        const url=(location.origin&&location.origin!=='null'?location.origin+location.pathname:location.href).replace(/index\.html$/,'');
        g.fillText(url,PAD,H-FOOT/2);g.textAlign='right';g.fillText(`${ui('忘忘看报 · 卡池活动复刻日历','Morimens Weekly · Banner & Rerun Calendar')} · ${new Date().toISOString().slice(0,10)}`,W-PAD,H-FOOT/2)};
      const avatar=(g,id,x,y,sz)=>{const im=imgs.get(id);g.save();g.beginPath();g.arc(x+sz/2,y+sz/2,sz/2,0,Math.PI*2);g.clip();g.fillStyle='#0b0f16';g.fillRect(x,y,sz,sz);if(im){const sc=Math.max(sz/im.width,sz/im.height),w=im.width*sc,h=im.height*sc;g.drawImage(im,x+(sz-w)/2,y+(sz-h)/2,w,h)}g.restore()};
      const MN=zh()?['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      if(state.ymode==='year'){
        const lo=`${year}-01-01`,hi=`${year}-12-31`;
        const yi=items.filter(x=>{const {a,b}=span(x);return a<=hi&&b>lo}).sort((p,q)=>span(p).a.localeCompare(span(q).a)||p.id.localeCompare(q.id));
        const perItem=state.cat!=='all',color=new Map(yi.map((x,i)=>[x.id,perItem?PALETTE[i%PALETTE.length]:(CATCOLOR[x.cat]||'#8c97a8')]));
        const cov=new Map(),startsOn=new Map();
        for(const x of yi){const {a,b}=span(x);for(let k=a<lo?lo:a;k<b&&k<=hi;k=addDays(k,1)){(cov.get(k)||cov.set(k,[]).get(k)).push(x)}if(a>=lo&&a<=hi)(startsOn.get(a)||startsOn.set(a,[]).get(a)).push(x)}
        const COLS=4,GAP=12,MW=(W-PAD*2-GAP*(COLS-1))/COLS,CW=(MW-16)/7,CH=38,MH=24+16+6*(CH+2)+10;
        const legendCols=2,LW=(W-PAD*2-GAP)/legendCols,LH=44,legendRows=Math.ceil(yi.length/legendCols);
        const catLeg=perItem?0:26;
        const H=TOP+catLeg+3*(MH+GAP)+30+legendRows*(LH+6)+FOOT+10;
        draw(H,g=>{
          let y=TOP;
          if(!perItem){let x=PAD;g.font=`12px ${FONT}`;for(const [k,cn,en] of CATS.filter(c=>c[0]!=='all')){g.fillStyle=CATCOLOR[k];g.fillRect(x,y+4,12,12);g.fillStyle='#aab6c8';g.textAlign='left';g.textBaseline='middle';const t=ui(cn,en);g.fillText(t,x+17,y+10);x+=17+g.measureText(t).width+16}y+=catLeg}
          for(let mi=0;mi<12;mi++){
            const col=mi%COLS,row=Math.floor(mi/COLS),mx=PAD+col*(MW+GAP),my=y+row*(MH+GAP);
            g.fillStyle='#0d121a';rr(g,mx,my,MW,MH,10);g.fill();g.strokeStyle='rgba(148,163,184,.2)';g.stroke();
            g.fillStyle='#ead9b9';g.font=`700 15px ${FONT}`;g.textAlign='left';g.textBaseline='middle';g.fillText(MN[mi],mx+8,my+13);
            const WD=zh()?['一','二','三','四','五','六','日']:['M','T','W','T','F','S','S'];
            g.fillStyle='#8290a2';g.font=`10px ${FONT}`;g.textAlign='center';WD.forEach((w,i)=>g.fillText(w,mx+8+i*CW+CW/2,my+31));
            const first=`${year}-${p2(mi+1)}-01`,len=new Date(Date.UTC(year,mi+1,0)).getUTCDate(),lead=(new Date(first+'T00:00:00Z').getUTCDay()+6)%7;
            for(let d=1;d<=len;d++){
              const k=`${year}-${p2(mi+1)}-${p2(d)}`,idx=lead+d-1,cx=mx+8+(idx%7)*CW,cy=my+38+Math.floor(idx/7)*(CH+2),l=cov.get(k)||[];
              g.save();rr(g,cx+1,cy,CW-2,CH,4);g.clip();g.fillStyle='#111827';g.fillRect(cx,cy,CW,CH);
              l.forEach((x,i)=>{g.fillStyle=color.get(x.id);g.fillRect(cx,cy+i*CH/l.length,CW,CH/l.length+0.5)});
              g.restore();
              const st=startsOn.get(k)||[],ids=[];for(const x of st)for(const f of uniqF(x.featured))if(f.id&&imgs.get(f.id)&&!ids.includes(f.id))ids.push(f.id);ids.slice(0,3).forEach((id,i,a)=>avatar(g,id,cx+CW-18-(a.length-1-i)*11,cy+CH-18,17));
              g.fillStyle='#fff';g.font=`700 10.5px ${FONT}`;g.textAlign='left';g.textBaseline='top';g.shadowColor='#000';g.shadowBlur=3;g.fillText(String(d),cx+4,cy+2);g.shadowBlur=0;g.textBaseline='middle';
            }
          }
          y+=3*(MH+GAP)+8;
          g.fillStyle='#ead9b9';g.font=`700 15px ${FONT}`;g.textAlign='left';g.textBaseline='middle';g.fillText(`${year} · ${yi.length} ${ui('个卡池 / 活动','banners / events')}`,PAD,y+10);y+=24;
          yi.forEach((x,i)=>{
            const lx=PAD+(i%legendCols)*(LW+GAP),ly=y+Math.floor(i/legendCols)*(LH+6);
            g.fillStyle='#0f1927';rr(g,lx,ly,LW,LH,8);g.fill();g.fillStyle=color.get(x.id);g.fillRect(lx,ly+4,6,LH-8);
            let ax=lx+14;uniqF(x.featured).filter(f=>f.id&&imgs.get(f.id)).slice(0,4).forEach(f=>{avatar(g,f.id,ax,ly+8,28);ax+=22});ax+=16;
            g.fillStyle='#ead9b9';g.font=`700 13px ${FONT}`;g.textAlign='left';g.textBaseline='middle';g.fillText(clipText(g,tName(x.title),lx+LW-ax-8),ax,ly+15);
            g.fillStyle='#8fa2bd';g.font=`11.5px ${FONT}`;g.fillText(clipText(g,`${span(x).a} ~ ${day(x.end)}${x.featured.length?' · '+x.featured.map(f=>nm(f.en,f.zh)).join(zh()?'、':', '):''}`,lx+LW-ax-8),ax,ly+32);
          });
        });
      }else{
        const first=`${year}-${p2(month)}-01`,len=new Date(Date.UTC(year,month,0)).getUTCDate(),last=`${year}-${p2(month)}-${p2(len)}`,lead=(new Date(first+'T00:00:00Z').getUTCDay()+6)%7;
        const gridStart=addDays(first,-lead),weeks=Math.ceil((lead+len)/7);
        const inMonth=items.filter(x=>{const {a,b}=span(x);return a<=last&&b>first}).sort((p,q)=>span(p).a.localeCompare(span(q).a)||(dayDiff(span(q).a,span(q).b)-dayDiff(span(p).a,span(p).b)));
        const CW=(W-PAD*2)/7,BH=38,DAYH=22;
        const wk=[];
        for(let w=0;w<weeks;w++){
          const w0=addDays(gridStart,w*7),w1=addDays(w0,7),bars=[];
          for(const x of inMonth){const {a,b}=span(x),s0=a>w0?a:w0,e0=b<w1?b:w1;if(s0>=e0)continue;bars.push({x,col:dayDiff(w0,s0),len:dayDiff(s0,e0),left:a<w0,right:b>w1})}
          const laneEnd=[];for(const bar of bars){let l=0;while((laneEnd[l]??-1)>bar.col)l++;laneEnd[l]=bar.col+bar.len;bar.lane=l}
          wk.push({w0,bars,lanes:Math.max(1,laneEnd.length)});
        }
        const H=TOP+24+wk.reduce((a,w)=>a+DAYH+w.lanes*(BH+3)+12,0)+FOOT+10;
        draw(H,g=>{
          let y=TOP;g.fillStyle='#8290a2';g.font=`12px ${FONT}`;g.textAlign='center';g.textBaseline='middle';
          (zh()?['周一','周二','周三','周四','周五','周六','周日']:['Mon','Tue','Wed','Thu','Fri','Sat','Sun']).forEach((w,i)=>g.fillText(w,PAD+i*CW+CW/2,y+10));y+=24;
          for(const w of wk){
            const h=DAYH+w.lanes*(BH+3)+8;
            g.fillStyle='#0d121a';g.fillRect(PAD,y,W-PAD*2,h);
            for(let c=0;c<7;c++){const k=addDays(w.w0,c),inM=k>=first&&k<=last;g.strokeStyle='rgba(148,163,184,.12)';g.strokeRect(PAD+c*CW,y,CW,h);g.fillStyle=inM?'#dbe4f0':'#4b5668';g.font=`700 12px ${FONT}`;g.textAlign='left';g.textBaseline='middle';g.fillText(String(+k.slice(8)),PAD+c*CW+6,y+11)}
            for(const b of w.bars){
              const bx=PAD+b.col*CW+2,bw=b.len*CW-4,by=y+DAYH+b.lane*(BH+3);
              g.fillStyle=CATCOLOR[b.x.cat]||'#8c97a8';rr(g,bx,by,bw,BH,6);g.fill();
              let tx=bx+6;uniqF(b.x.featured).filter(f=>f.id&&imgs.get(f.id)).slice(0,4).forEach(f=>{avatar(g,f.id,tx,by+5,28);tx+=22});tx+=10;
              g.save();g.beginPath();g.rect(bx,by,bw,BH);g.clip();
              g.fillStyle='#10151d';g.font=`700 12.5px ${FONT}`;g.textAlign='left';g.textBaseline='middle';g.fillText(clipText(g,tName(b.x.title),bx+bw-tx-6),tx,by+13);
              g.font=`11.5px ${FONT}`;g.fillText(clipText(g,b.x.featured.map(f=>nm(f.en,f.zh)).join(zh()?'、':', '),bx+bw-tx-6),tx,by+28);g.restore();
            }
            y+=h+4;
          }
        });
      }
      await new Promise(res=>cv.toBlob(b=>{if(b){const u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=`morimens-calendar-${state.ymode==='year'?year:year+'-'+p2(month)}-${state.cat}.png`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500)}res()},'image/png'));
    }catch(e){console.warn('calendar image failed',e)}
    finally{btn.disabled=false;btn.textContent=before}
  }
  function yearHtml(items,now){
    if(state.ymode==='year')return fullYearHtml(items,now);
    const year=state.year,todayK=dstr(new Date(now+8*3600e3)),cur=new Date(now+8*3600e3);
    if(state.month==null)state.month=year===cur.getUTCFullYear()?cur.getUTCMonth()+1:1;
    const month=state.month;
    const MN=zh()?['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const WD=zh()?['周一','周二','周三','周四','周五','周六','周日']:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const first=`${year}-${p2(month)}-01`,len=new Date(Date.UTC(year,month,0)).getUTCDate(),last=`${year}-${p2(month)}-${p2(len)}`;
    const lead=(new Date(first+'T00:00:00Z').getUTCDay()+6)%7;
    const gridStart=addDays(first,-lead),weeks=Math.ceil((lead+len)/7);
    // per-item day span [a, b)
    const span=x=>{const a=day(x.start);let b=day(x.end||x.start);if(b<=a)b=addDays(a,1);return {a,b}};
    const inMonth=items.filter(x=>{const {a,b}=span(x);return a<=last&&b>first}).sort((p,q)=>span(p).a.localeCompare(span(q).a)||(dayDiff(span(q).a,span(q).b)-dayDiff(span(p).a,span(p).b)));
    const counts=MN.map((_,mi)=>{const f=`${year}-${p2(mi+1)}-01`,l=`${year}-${p2(mi+1)}-${p2(new Date(Date.UTC(year,mi+1,0)).getUTCDate())}`;return items.filter(x=>{const {a,b}=span(x);return a<=l&&b>f}).length});
    let weeksHtml='';
    for(let w=0;w<weeks;w++){
      const w0=addDays(gridStart,w*7),w1=addDays(w0,7);
      const bars=[];
      for(const x of inMonth){
        const {a,b}=span(x),s0=a>w0?a:w0,e0=b<w1?b:w1;
        if(s0>=e0)continue;
        bars.push({x,col:dayDiff(w0,s0),len:dayDiff(s0,e0),left:a<w0,right:b>w1});
      }
      const laneEnd=[];
      for(const bar of bars){let l=0;while((laneEnd[l]??-1)>bar.col)l++;laneEnd[l]=bar.col+bar.len;bar.lane=l}
      const cells=Array.from({length:7},(_,c)=>{
        const k=addDays(w0,c),inM=k>=first&&k<=last;
        return `<button type="button" class="ymD${inM?'':' out'}${k===todayK?' today':''}${state.day===k?' sel':''}" style="grid-column:${c+1};grid-row:1" data-scday="${k}">${+k.slice(8)}</button>`;
      }).join('');
      const bh=bars.map(b=>{
        const x=b.x,lb=barLabel(x),color=CATCOLOR[x.cat]||'#8c97a8';
        const icons=uniqF(x.featured).slice(0,4).map(f=>{const it=f.id?state.pool.get(f.id):null;return it?`<img src="${esc(it.img)}" alt="" loading="lazy">`:''}).join('');
        const tip=`${lb.t}${lb.names?'：'+lb.names:''}\n${day(x.start)} ~ ${day(x.end)}`;
        return `<button type="button" class="ymB${b.left?' cl':''}${b.right?' cr':''}${state.pick===x.id?' sel':''}" style="grid-column:${b.col+1}/span ${b.len};grid-row:${b.lane+2};background:${color}" data-scpick="${esc(x.id)}" title="${esc(tip)}">${icons}<span class="ymT"><b>${esc(lb.t)}</b>${lb.names?`<i>${esc(lb.names)}</i>`:''}</span></button>`;
      }).join('');
      weeksHtml+=`<div class="ymWeek">${cells}${bh}</div>`;
    }
    const legend=CATS.filter(c=>c[0]!=='all').map(([k,cn,en])=>`<span class="ycL"><i style="background:${CATCOLOR[k]}"></i>${esc(ui(cn,en))}</span>`).join('');
    const years=[];for(let y=2023;y<=new Date(now).getUTCFullYear()+1;y++)years.push(y);
    const picked=state.pick?items.find(x=>x.id===state.pick):null;
    const dayItems=state.day?items.filter(x=>{const {a,b}=span(x);return a<=state.day&&b>state.day}):null;
    return `<div class="scBar"><button type="button" class="scChip" data-scyear="${year-1}"${year<=2023?' disabled':''}>←</button>${years.map(y=>`<button type="button" class="scChip" data-scyear="${y}" aria-pressed="${y===year}">${y}</button>`).join('')}<button type="button" class="scChip" data-scyear="${year+1}"${year>=years[years.length-1]?' disabled':''}>→</button></div>
      <div class="scBar">${MN.map((mn,mi)=>`<button type="button" class="scChip" data-scmonth="${mi+1}" aria-pressed="${mi+1===month}">${mn}${counts[mi]?` <small>${counts[mi]}</small>`:''}</button>`).join('')}</div>
      <div class="ycLegend">${legend}</div>
      <div class="ymBox"><div class="ymHead">${WD.map(w=>`<i>${w}</i>`).join('')}</div>${weeksHtml}</div>
      ${picked?`<div class="scSec">${ui('所选条目','Selected')}</div>${row(picked,now)}`:''}
      ${dayItems?`<div class="scSec">${esc(state.day)} ${ui('当天的卡池 / 活动','banners / events on this day')}</div>${dayItems.length?dayItems.map(x=>row(x,now)).join(''):`<div class="scNote">${ui('这一天没有记录的卡池或活动','Nothing recorded for this day')}</div>`}`:''}
      <div class="scSec">${year} ${MN[month-1]} · ${inMonth.length} ${ui('个卡池 / 活动','banners / events')}</div>
      ${inMonth.map(x=>row(x,now)).join('')||`<div class="scNote">${ui('这个月没有记录','Nothing recorded this month')}</div>`}`;
  }
  function row(x,now){
    const live=ms(x.start)<=now&&now<ms(x.end),soon=ms(x.start)>now,t=TYPE[x.kindKey]||['活动','Event'];
    const st=live?`<span class="scState on">${ui('进行中','Live')}</span>`:soon?`<span class="scState soon">${ui('未开始','Upcoming')}</span>`:'';
    const sub=zh()&&x.title.zh?`<small lang="en">${esc(x.title.en)}</small>`:'';
    const ai=zh()&&x.title.zh&&x.title.zs==='ai'?`<small title="${esc(ui('无官方译名，AI 辅助翻译','No official name, AI-assisted'))}">*</small>`:'';
    return `<div class="scRow${live?' now':''}${!live&&!soon?' past':''}"><div class="scDate">${esc(day(x.start))} ~ ${esc(day(x.end))}<small>${days(x.start,x.end)} ${ui('天','days')} · ${esc(hhmm(x.start))} (UTC+8)</small></div><div><div><span class="scBadge" style="background:${COLOR[x.kindKey]||'#8c97a8'}">${esc(ui(...t))}</span><span class="scTitle">${esc(tName(x.title))}${ai}${sub}</span>${st}</div>${x.featured.length?`<div class="scFeat">${x.featured.map(fChip).join('')}</div>`:''}</div></div>`;
  }

  // Rerun gap leaderboard (day-level appearances from the normalized Huiji history; daily rotations are expanded to 1-day windows)
  function gaps(kind,now){
    let rows=state.data.appearances||[];const groups=new Map();
    if(kind==='event'){rows=[];for(const e of state.data.events||[])if(['story','story-rerun'].includes(e.kind))for(const f of e.featured||[])if(f.k==='awakener'&&f.id)rows.push({c:f.id,w:'',cz:f.zh,wz:'',s:e.start,e:e.end,r:e.kind==='story-rerun'?1:0,id:e.id})}
    const add=(key,ref,r)=>{const g=groups.get(key)||{ref,rows:[]};g.rows.push(r);groups.set(key,g)};
    if(kind==='pair'){
      for(const p of state.data.launchPairs||[]){
        const ch=state.pool.get(p.c),wh=state.pool.get(p.w);
        groups.set(p.c+'|'+p.w,{ref:{id:p.c,w:p.w,zh:[p.cb,p.wb].filter(Boolean).join(' / ')||`${p.cz} / ${p.wz}`,en:[ch?.en,wh?.en].filter(Boolean).join(' / ')||''},rows:rows.filter(r=>r.c===p.c&&r.w===p.w)});
      }
    }else{
      const key=kind==='wheel'?'w':'c';       // 'awakener' and 'event' group by Awakener
      for(const r of rows)if(r[key]){const it=state.pool.get(r[key]);add(r[key],{id:r[key],zh:kind==='wheel'?r.wz:r.cz,en:it?.en||''},r)}
    }
    return [...groups.values()].map(g=>{
      const runs=g.rows.map(r=>({start:r.s,end:r.e,rerun:!!r.r,cid:r.id})).sort((a,b)=>ms(a.start)-ms(b.start));
      const live=runs.find(r=>ms(r.start)<=now&&now<ms(r.end)),ended=runs.filter(r=>ms(r.end)<=now).sort((a,b)=>ms(a.end)-ms(b.end)),next=runs.find(r=>ms(r.start)>now),last=ended[ended.length-1]||null;
      const gap=live?0:last?Math.floor((now-ms(last.end))/86400000):null;
      // merge windows of one campaign (daily rotations) before measuring intervals
      const camp=[];for(const r of runs){const c=camp.find(x=>x.cid===r.cid);if(c){c.end=ms(r.end)>ms(c.end)?r.end:c.end}else camp.push({...r})}
      let sum=0,n=0;for(let i=1;i<camp.length;i++){const d=(ms(camp[i].start)-ms(camp[i-1].end))/86400000;if(d>=0){sum+=d;n++}}
      const rerunCount=new Set(runs.filter(r=>r.rerun&&ms(r.start)<=now).map(r=>r.cid)).size;
      return {...g,live,next,last,gap,avg:n?Math.round(sum/n):null,count:camp.length,rerunCount,first:runs[0]};
    }).filter(e=>e.first&&(e.gap!=null||e.live||e.next)).sort((a,b)=>(b.live?-1:0)-(a.live?-1:0)||((b.gap??-1)-(a.gap??-1)));
  }
  function gapRow(e,rank,now){
    const it=state.pool.get(e.ref.id),it2=e.ref.w?state.pool.get(e.ref.w):null;
    const st=e.live?`<span class="scState on">${e.live.rerun?ui('复刻进行中','Rerun live'):ui('首发进行中','Launch live')}</span>`:e.next?`<span class="scState soon">${ui('已公布 ','Next ')}${esc(day(e.next.start))}</span>`:e.rerunCount===0?`<span class="scState">${ui('尚未复刻','Never rerun')}</span>`:`<span class="scState">${ui('等待复刻','Waiting')}</span>`;
    const gap=e.live?'0':e.gap==null?'—':`<b>${e.gap}</b> ${ui('天','d')} <span class="scNote">(${(e.gap/28).toFixed(1)} ${ui('期','cycles')})</span>`;
    const lastTxt=e.live?`${esc(day(e.live.start))} ~ ${esc(day(e.live.end))}`:e.last?`${e.last.rerun?ui('复刻','Rerun'):ui('首发','Launch')} · ${esc(day(e.last.end))}`:'—';
    return `<tr><td>${rank??''}</td><td><div class="scAv">${it?`<img src="${esc(it.img)}" alt="" loading="lazy">`:''}${it2?`<img src="${esc(it2.img)}" alt="" loading="lazy" style="border-radius:6px">`:''}<span>${esc(nm(e.ref.en,e.ref.zh))}</span></div></td><td>${esc(day(e.first.start))}</td><td>${e.rerunCount}</td><td>${lastTxt}</td><td>${gap}</td><td>${e.avg==null?'—':`${e.avg} ${ui('天','d')}`}</td><td>${st}</td></tr>`;
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
    const gAll=gaps(state.gapKind,now),rank=new Map(gAll.filter(e=>!e.live&&e.gap!=null).map((e,i)=>[e.ref.id+(e.ref.w||''),i+1]));
    const gp=gAll.filter(e=>!q||nk(e.ref.en+e.ref.zh).includes(q)).filter(e=>state.showNext||!e.next);
    const shown=list.slice(0,state.limit);
    host.innerHTML=`<div class="scWrap">
      <div class="scBar">${CATS.map(([k,cn,en])=>`<button type="button" class="scChip" data-sccat="${k}" aria-pressed="${state.cat===k}">${ui(cn,en)}</button>`).join('')}<input type="search" id="scQuery" value="${esc(state.query)}" placeholder="${esc(ui('搜索角色 / 命轮 / 活动','Search Awakener / wheel / event'))}"><button type="button" class="scChip" data-scdir>${state.dir==='desc'?ui('最新在前 ↓','Newest first ↓'):ui('最早在前 ↑','Oldest first ↑')}</button></div>
      ${live.length?`<div class="scSec">${ui('进行中','Live now')}</div>${live.map(x=>row(x,now)).join('')}`:''}
      ${soon.length?`<div class="scSec">${ui('即将开始','Coming up')}</div>${soon.map(x=>row(x,now)).join('')}`:''}
      <div class="scSec">${ui('全部卡池与活动','All banners & events')} <span class="scNote">${list.length} ${ui('条','entries')}</span> <button type="button" class="scChip" data-scview="year" aria-pressed="${state.view==='year'}">${ui('年历','Year calendar')}</button> <button type="button" class="scChip" data-scview="list" aria-pressed="${state.view==='list'}">${ui('列表','List')}</button>${state.view==='year'?` <button type="button" class="scChip" data-scymode="month" aria-pressed="${state.ymode!=='year'}">${ui('月视图','Month')}</button> <button type="button" class="scChip" data-scymode="year" aria-pressed="${state.ymode==='year'}">${ui('全年视图','Full year')}</button> <button type="button" class="scChip" data-scdl>${ui('下载图片','Download image')}</button>`:''}</div>
      ${state.view==='year'?yearHtml(list,now):`${shown.map(x=>row(x,now)).join('')||`<div class="scNote">${ui('没有符合条件的条目','No entries match')}</div>`}
      ${list.length>shown.length?`<button type="button" class="scChip" data-scmore>${ui(`显示更多（还有 ${list.length-shown.length} 条）`,`Show more (${list.length-shown.length} left)`)}</button>`:''}`}
      ${futureForecast().length?`<div class="scSec">${ui('未来唤醒预测（灰机维基，仅供参考）','Forecast (Huiji Wiki, for entertainment only)')}</div><div style="overflow:auto"><table class="scTable"><thead><tr><th>${ui('开启时间','Starts')}</th><th>${ui('内容','Content')}</th></tr></thead><tbody>${futureForecast().map(f=>`<tr><td>${esc(day(f.start))}${f.end?` ~ ${esc(day(f.end))}`:''}</td><td>${esc(zh()?f.text:(FC[f.text]||f.text))}</td></tr>`).join('')}</tbody></table></div>`:''}
      <div class="scSec">${ui('复刻空白期榜单','Rerun gap leaderboard')}</div>
      <div class="scNote">${ui('按每个唤醒体 / 命轮 / 首发组合最近一次活动唤醒可获取窗口的结束时间计算：正在开放记 0 天，已公布的未来复刻只做提示。每日轮换复刻按逐日窗口展开；灰机维基源表里个别结束年份有误（如 2024-06-17 ~ 2025-07-15），已按下一期首发日期校正。「角色活动」榜统计每位唤醒体的剧情 / 玩法活动（首发与复刻，来自微博、Steam 公告与 SKeyDB），与卡池榜分开。1 期 = 28 天。','Gap = days since the end of the latest event-banner window of each Awakener / wheel / launch pair; live counts as 0 and announced future reruns are only flagged. Daily rotations are expanded to 1-day windows; a few wrong end years in the wiki source (e.g. 2024-06-17 ~ 2025-07-15) are clamped to the next launch. The “character event” board counts each Awakener’s story / gameplay events (launch and rerun, from Weibo, Steam announcements and SKeyDB) separately from the banner boards. 1 cycle = 28 days.')}</div>
      <div class="scBar"><button type="button" class="scChip" data-scgap="awakener" aria-pressed="${state.gapKind==='awakener'}">${ui('唤醒体','Awakeners')}</button><button type="button" class="scChip" data-scgap="wheel" aria-pressed="${state.gapKind==='wheel'}">${ui('命轮','Wheels')}</button><button type="button" class="scChip" data-scgap="event" aria-pressed="${state.gapKind==='event'}">${ui('角色活动（剧情活动）复刻空窗榜','Character event rerun gap')}</button><button type="button" class="scChip" data-scgap="pair" aria-pressed="${state.gapKind==='pair'}">${ui('首发活动唤醒组合（角色 + 命轮）','Launch pairs (Awakener + wheel)')}</button><label class="scNote"><input type="checkbox" data-scnext${state.showNext?' checked':''}> ${ui('显示已公布的未来复刻','Show announced reruns')}</label><span class="scNote">${gp.length} ${ui('项','items')}</span></div>
      <div style="overflow:auto"><table class="scTable"><thead><tr><th>${ui('排名','#')}</th><th>${ui('名称','Name')}</th><th>${ui('首次出现','First')}</th><th>${ui('已复刻次数','Reruns')}</th><th>${ui('最近一次','Latest')}</th><th>${ui('空白期','Gap')}</th><th>${ui('平均间隔','Avg. gap')}</th><th>${ui('状态','Status')}</th></tr></thead><tbody>${gp.map(e=>gapRow(e,rank.get(e.ref.id+(e.ref.w||'')),now)).join('')}</tbody></table></div>
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
      const dl=e.target.closest('[data-scdl]');if(dl){exportImage(dl);return}
      const ym=e.target.closest('[data-scymode]');if(ym){state.ymode=ym.dataset.scymode;draw();return}
      const v=e.target.closest('[data-scview]');if(v){state.view=v.dataset.scview;draw();return}
      const yb=e.target.closest('[data-scyear]');if(yb&&!yb.disabled){state.year=+yb.dataset.scyear;state.day=null;state.pick=null;draw();return}
      const mb=e.target.closest('[data-scmonth]');if(mb){state.month=+mb.dataset.scmonth;state.day=null;state.pick=null;draw();return}
      const pk=e.target.closest('[data-scpick]');if(pk){state.pick=state.pick===pk.dataset.scpick?null:pk.dataset.scpick;draw();return}
      const dd=e.target.closest('[data-scday]');if(dd){state.day=state.day===dd.dataset.scday?null:dd.dataset.scday;state.pick=null;draw();return}
      if(e.target.closest('[data-scnext]')){state.showNext=e.target.checked;draw();return}
      const g=e.target.closest('[data-scgap]');if(g){state.gapKind=g.dataset.scgap;draw()}
    });
    document.addEventListener('input',e=>{if(e.target?.id==='scQuery'){state.query=e.target.value;const pos=e.target.selectionStart;draw();const i=document.getElementById('scQuery');if(i){i.focus();i.setSelectionRange(pos,pos)}}});
    window.addEventListener('morimens-language-change',()=>{if(host&&!host.hidden)draw()});
  }
  window.MorimensSummonCalendar={open};
})();

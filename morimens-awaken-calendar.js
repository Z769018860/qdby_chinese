// 限时唤醒「银河闪耀时」· 35 期逐日换池日程 + 系统日历（.ics）导入
// 资源：awaken-2026/galaxy-awaken.ics（35 段，TZID=Asia/Shanghai）、awaken-2026/schedule.jpg（海报·已标注日期）
// 页签：window.MorimensTabs.add({name:'awaken'})，深链 ?#awaken
(()=>{
  'use strict';
  const zh=()=>localStorage.getItem('morimens.language')!=='en';
  const ui=(cn,en)=>zh()?cn:en;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // 2026-11-30 09:00 (UTC+8) = 2026-11-30 01:00Z；每期 24h
  const START=Date.UTC(2026,10,30,1,0), DAY=86400000, N=35;
  const ICS='awaken-2026/galaxy-awaken.ics', POSTER='awaken-2026/schedule.jpg';
  const pad=n=>String(n).padStart(2,'0');

  function slots(){
    const now=Date.now(),out=[];
    for(let i=0;i<N;i++){
      const t=START+i*DAY,d=new Date(t),e=d.getUTCMonth()+1,day=d.getUTCDate();
      out.push({i,n:i+1,m:e,d:day,t,state:now>=t&&now<t+DAY?'now':(now<t?'soon':'past')});
    }
    return out;
  }

  function ensureStyle(){
    if(document.getElementById('awakenCalStyle'))return;
    const s=document.createElement('style');s.id='awakenCalStyle';
    s.textContent=`
      .awHero{display:flex;gap:14px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}
      .awStats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:14px 0}
      .awStats>div{padding:10px 12px;border:1px solid rgba(148,163,184,.16);border-radius:11px;background:rgba(255,255,255,.028)}
      .awStats small{display:block;font-size:10px;color:#8290a2}.awStats b{font-size:17px;color:#f1dfbc;font-variant-numeric:tabular-nums}
      .awActs{display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 6px}
      .awBtn{display:inline-flex;align-items:center;gap:6px;border-radius:10px;padding:10px 16px;font:700 13px/1.2 inherit;cursor:pointer;text-decoration:none;border:1px solid rgba(148,163,184,.3);background:#111827;color:#dbe4f0;transition:filter .15s}
      .awBtn:hover{filter:brightness(1.15)}
      .awBtn.pri{background:linear-gradient(180deg,#e3bf7d,#c9a05a);color:#241a09;border-color:transparent;box-shadow:0 6px 18px rgba(201,160,90,.18)}
      .awHint{font-size:11.5px;color:#8290a2;line-height:1.75;margin:2px 0 14px}
      .awHint code{background:rgba(148,163,184,.12);border-radius:4px;padding:0 4px;font-size:11px}
      .awGrid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
      .awCell{border:1px solid rgba(148,163,184,.16);border-radius:9px;background:#0f1927;padding:7px 4px;text-align:center}
      .awCell b{display:block;font-size:12.5px;color:#dbe4f0;font-variant-numeric:tabular-nums}
      .awCell small{display:block;font-size:9.5px;color:#7d8b9e;margin-top:1px}
      .awCell.first{border-color:rgba(217,164,65,.55)}.awCell.first b{color:#f1d69f}
      .awCell.last{border-color:rgba(199,94,104,.5)}.awCell.last b{color:#f0b7a0}
      .awCell.now{background:#3a2f17;border-color:#f1d69f;box-shadow:0 0 0 1px rgba(241,214,159,.35)}
      .awCell.now b{color:#f1d69f}.awCell.past{opacity:.55}
      .awPoster{border:1px solid rgba(148,163,184,.16);border-radius:12px;overflow:hidden;background:#0b0f16}
      .awPoster img{display:block;width:100%}
      .awCap{font-size:11px;color:#8290a2;text-align:center;padding:8px 6px 0}
      .awToast{position:fixed;left:50%;bottom:32px;transform:translate(-50%,16px);background:#f1d69f;color:#241a09;font-weight:700;font-size:13px;padding:9px 20px;border-radius:999px;opacity:0;pointer-events:none;transition:.22s;z-index:9999}
      .awToast.on{opacity:1;transform:translate(-50%,0)}
      @media(max-width:640px){.awStats{grid-template-columns:1fr 1fr}.awGrid{grid-template-columns:repeat(5,minmax(0,1fr))}}
    `;
    document.head.appendChild(s);
  }

  function toast(msg){
    let t=document.querySelector('.awToast');
    if(!t){t=document.createElement('div');t.className='awToast';document.body.appendChild(t)}
    t.textContent=msg;t.classList.add('on');
    clearTimeout(toast._h);toast._h=setTimeout(()=>t.classList.remove('on'),1600);
  }

  function html(){
    const cells=slots().map(s=>{
      const cls=['awCell',s.i===0?'first':'',s.i===N-1?'last':'',s.state==='now'?'now':s.state==='past'?'past':''].filter(Boolean).join(' ');
      return `<div class="${cls}"><b>${s.m}/${s.d}</b><small>${ui('第','No.')}${s.n}${ui('期','')}</small></div>`;
    }).join('');
    return `
    <section class="panel" aria-labelledby="awakenTitle">
      <div class="panelHead awHero">
        <div>
          <p class="eyebrow">LIMITED AWAKEN · DAILY SCHEDULE</p>
          <h2 id="awakenTitle">${ui('限时唤醒「银河闪耀时」','Limited Awaken: Galaxy Shimmer')}</h2>
          <p class="panelLead">${ui('2026/11/30 09:00 — 2027/1/4 09:00（UTC+8）。共 35 期，每日 9:00 换池，每期持续 24 小时。','Nov 30 2026 09:00 – Jan 4 2027 09:00 (UTC+8). 35 daily slots, rotating at 09:00, 24h each.')}</p>
        </div>
        <span class="statusPill">35 ${ui('期','slots')}</span>
      </div>
      <div class="awStats">
        <div><small>${ui('开始','Starts')}</small><b>11/30 09:00</b></div>
        <div><small>${ui('结束','Ends')}</small><b>1/4 09:00</b></div>
        <div><small>${ui('轮换','Rotation')}</small><b>${ui('每日 09:00','daily 09:00')}</b></div>
      </div>
      <div class="awActs">
        <a class="awBtn pri" id="awakenIcs" href="${ICS}" download>${ui('添加到系统日历','Add to calendar')}</a>
        <a class="awBtn" id="awakenSub" href="${ICS}">${ui('订阅（自动同步）','Subscribe')}</a>
        <button class="awBtn" id="awakenCopy" type="button">${ui('复制日历链接','Copy .ics link')}</button>
        <a class="awBtn" href="${POSTER}" target="_blank" rel="noopener">${ui('看海报原图','Open poster')}</a>
      </div>
      <div class="awHint">
        ${ui(
          '<b>iPhone / iPad</b>：点「添加到系统日历」→ 右上角「全部添加」，35 个日程一次导入。<br><b>安卓</b>：点按钮下载 <code>galaxy-awaken.ics</code>，在通知栏或「文件」里点它，选日历即可导入。<br><b>订阅</b>：想要日历自己刷新就用「订阅」，会在系统日历里新建一个只读订阅日历。<br>每期 09:00 开始、次日 09:00 结束，已设「开始前 10 分钟」提醒，可在日历里自行修改。',
          '<b>iPhone / iPad</b>: tap “Add to calendar” → “Add All”. <b>Android</b>: download <code>galaxy-awaken.ics</code> and open it from notifications or Files, then pick a calendar. <b>Subscribe</b> creates a read-only auto-refreshing calendar. Each slot runs 09:00 → next day 09:00 with a 10-minute reminder.'
        )}
      </div>
      <div class="awGrid">${cells}</div>
      <p class="awHint" style="margin-top:10px">${ui('顺序与海报一致：从左到右、上到下。第 35 期（1/3）为图鲁特别返场。','Same order as the poster: left to right, top to bottom. Slot 35 (Jan 3) is the Tulu special return.')}</p>
      <div class="awPoster" style="margin-top:14px">
        <a href="${POSTER}" target="_blank" rel="noopener"><img src="${POSTER}" alt="${ui('限时唤醒「银河闪耀时」日程海报，每个头像上方标注了对应卡池日期','Schedule poster with each Awakener tagged by its banner date')}" loading="lazy" decoding="async"></a>
      </div>
      <p class="awCap">${ui('海报版日程：每个唤醒体头像上方标了对应日期 · 点图看原图','Poster edition: each Awakener is tagged with its banner date · tap to open full size')}</p>
    </section>`;
  }

  function bind(panel){
    const ics=panel.querySelector('#awakenIcs');
    const abs=new URL(ICS,location.href).href;
    const sub=panel.querySelector('#awakenSub');
    if(sub)sub.href=abs.replace(/^https?/,'webcal');
    const copy=panel.querySelector('#awakenCopy');
    if(copy)copy.addEventListener('click',()=>{
      const done=()=>toast(ui('日历链接已复制','Calendar link copied'));
      if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(abs).then(done,()=>prompt(ui('复制这个链接：','Copy this link:'),abs))}
      else prompt(ui('复制这个链接：','Copy this link:'),abs);
    });
    const now=panel.querySelector('.awCell.now');
    if(now&&now.scrollIntoView){/* 不自动滚动，避免抢走页面位置 */}
  }

  function mount(){
    if(!window.MorimensTabs){setTimeout(mount,300);return}
    if(document.getElementById('morimensAwakenPanel'))return;
    ensureStyle();
    const panel=document.createElement('div');
    panel.id='morimensAwakenPanel';panel.setAttribute('role','tabpanel');panel.hidden=true;
    panel.innerHTML=html();
    const entry=window.MorimensTabs.add({name:'awaken',label:ui('限时唤醒日程','Awaken schedule'),panel});
    if(!entry)return;
    bind(panel);
    const want=(window.MorimensInitialHash||location.hash||'').replace(/^#/,'');
    if(want==='awaken'){window.MorimensTabs.activate('awaken');try{entry.tab.scrollIntoView({block:'nearest',inline:'center'})}catch{}}
    window.MorimensAwaken={panel,ics:new URL(ICS,location.href).href};
  }

  mount();
})();

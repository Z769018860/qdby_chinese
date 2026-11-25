// 限时唤醒「银河闪耀时」· 35 期逐日换池日程 + 系统日历（.ics）导入
// 挂在「卡池活动复刻日历」页签顶部（由 morimens-summon-calendar.js 的 draw() 调用 mount 挂载）。
// 资源：awaken-2026/galaxy-awaken.ics（35 段，TZID=Asia/Shanghai）、awaken-2026/schedule.jpg（海报·已标注日期与角色）
// 深链：?#awaken → 切到卡池日历并滚到这张卡片
(()=>{
  'use strict';
  const zh=()=>localStorage.getItem('morimens.language')!=='en';
  const ui=(cn,en)=>zh()?cn:en;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // 2026-11-30 09:00 (UTC+8) = 2026-11-30 01:00Z；每期 24h
  const START=Date.UTC(2026,10,30,1,0), DAY=86400000, N=35;
  const ICS='awaken-2026/galaxy-awaken.ics', POSTER='awaken-2026/schedule.jpg';

  // [唤醒体, 界域, 类型, 专属 SSR 命轮]，顺序＝海报从左到右、上到下
  const GAL=[
    ['图鲁','深海','伤害型','神王的颂歌'],
    ['达芙黛尔','超维','伤害型','至为珍贵的藏品'],
    ['索蕾尔','血肉','伤害型','以蔷薇之名'],
    ['莉莉','混沌','防御型','跨越疼痛'],
    ['墨菲','深海','防御型','隐秘的诞生'],
    ['旺达','超维','防御型','女王的戒律'],
    ['萨尔瓦多','血肉','防御型','神言石板'],
    ['「24」','混沌','伤害型','畸体回噬'],
    ['泰旖丝','血肉','辅助型','慈悲的哺育'],
    ['弥利亚姆','深海','辅助型','虔诚的伟力'],
    ['奥尔拉','超维','辅助型','诗笺的句尾'],
    ['莱克','混沌','辅助型','好运时间'],
    ['哈姆林','混沌','辅助型','永恒安魂曲'],
    ['血链·希洛','血肉','伤害型','沉入殷红'],
    ['塔薇','混沌','辅助型','隐世的转轮'],
    ['熔毁·朵尔','混沌','辅助型','坠入虚无的人偶'],
    ['克莱门汀','超维','辅助型','隐没的痛楚'],
    ['克珀珊特','深海','防御型','圣火中的指引'],
    ['卡斯托尔','超维','防御型','不可承受的自由'],
    ['杜勒赛因','血肉','伤害型','安息之吻'],
    ['凯蒂古拉','混沌','伤害型','琥珀色的死亡'],
    ['皮克曼','血肉','辅助型','写实主义悖谬'],
    ['波吕克斯','超维','伤害型','扭曲的骑士诗'],
    ['诞妄·墨菲','深海','辅助型','黑暗中的安眠'],
    ['茉夏','混沌','伤害型','狂戮至世界尽头'],
    ['徐','血肉','辅助型','枉蹙眉'],
    ['莫丝','深海','伤害型','渺远的伊甸园'],
    ['阿拉克涅','超维','辅助型','永世编织之网'],
    ['沙耶','血肉','辅助型','愿世界化作芬芳'],
    ['庞托斯','深海','防御型','活囚笼'],
    ['蚀灭·萝坦','混沌','伤害型','天之陨'],
    ['卡拉布','血肉','防御型','蜜果的谎言'],
    ['负誓·奥吉尔','混沌','防御型','向阳而生'],
    ['薇薇安','混沌','辅助型','先知的难题'],
    ['图鲁','深海','伤害型','神王的颂歌']
  ];

  function slots(){
    const now=Date.now(),out=[];
    for(let i=0;i<N;i++){
      const t=START+i*DAY,d=new Date(t);
      out.push({n:i+1,m:d.getUTCMonth()+1,d:d.getUTCDate(),state:now>=t&&now<t+DAY?'now':(now<t?'soon':'past')});
    }
    return out;
  }
  function currentNo(){
    const i=Math.floor((Date.now()-START)/DAY);
    return i>=0&&i<N?i+1:0;
  }

  function ensureStyle(){
    if(document.getElementById('awakenCalStyle'))return;
    const s=document.createElement('style');s.id='awakenCalStyle';
    s.textContent=`
      .awCard{scroll-margin-top:78px;border:1px solid rgba(217,164,65,.4);border-radius:12px;background:linear-gradient(180deg,rgba(217,164,65,.1),rgba(13,21,32,.96));padding:12px 14px;box-shadow:0 6px 20px rgba(0,0,0,.25)}
      .awHead{display:flex;gap:10px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}
      .awHead h3{margin:0;font-size:15px;color:#f1dfbc}
      .awHead p{margin:3px 0 0;font-size:11.5px;color:#8290a2}
      .awPill{font-size:11px;border:1px solid rgba(217,164,65,.45);border-radius:999px;padding:2px 9px;color:#f1d69f;white-space:nowrap}
      .awActs{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0 6px}
      .awBtn{display:inline-flex;align-items:center;gap:5px;border-radius:9px;padding:8px 13px;font:700 12.5px/1.2 inherit;cursor:pointer;text-decoration:none;border:1px solid rgba(148,163,184,.3);background:#111827;color:#dbe4f0}
      .awBtn:hover{filter:brightness(1.15)}
      .awBtn.pri{background:linear-gradient(180deg,#e3bf7d,#c9a05a);color:#241a09;border-color:transparent}
      .awHint{font-size:11px;color:#8290a2;line-height:1.7;margin:4px 0 10px}
      .awHint code{background:rgba(148,163,184,.12);border-radius:4px;padding:0 4px}
      .awGrid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}
      .awCell{display:block;border:1px solid rgba(148,163,184,.16);border-radius:7px;background:#0f1927;padding:5px 3px;text-align:center;cursor:pointer;text-decoration:none}
      .awCell b{display:block;font-size:11.5px;color:#dbe4f0;font-variant-numeric:tabular-nums}
      .awCell small{display:block;font-size:9.5px;color:#93a1b4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .awCell.first{border-color:rgba(217,164,65,.55)}.awCell.first b{color:#f1d69f}
      .awCell.last{border-color:rgba(199,94,104,.5)}.awCell.last b{color:#f0b7a0}
      .awCell.now{background:#3a2f17;border-color:#f1d69f}.awCell.now b,.awCell.now small{color:#f1d69f}
      .awCell.past{opacity:.55}
      .awTable{width:100%;border-collapse:collapse;margin-top:10px;font-size:11.5px}
      .awTable th{position:sticky;top:0;background:#131c2a;color:#8fa0b4;font-weight:600;text-align:left;padding:5px 6px;border-bottom:1px solid rgba(148,163,184,.18);white-space:nowrap}
      .awTable td{padding:5px 6px;border-bottom:1px solid rgba(148,163,184,.08);color:#cfd8e6;vertical-align:top}
      .awTable tr.now td{background:rgba(217,164,65,.13);color:#f1d69f}
      .awTable tr.past td{opacity:.55}
      .awTable .d{font-variant-numeric:tabular-nums;white-space:nowrap;color:#9fb0c6}
      .awTable .n{font-weight:700;color:#e9eef7;white-space:nowrap}
      .awTable .r{white-space:nowrap;color:#93a1b4}
      .awTable .w{color:#d9b985}
      .awFoot{display:flex;gap:10px;align-items:flex-start;margin-top:10px;flex-wrap:wrap}
      .awFoot img{width:118px;border-radius:8px;border:1px solid rgba(217,164,65,.3);display:block;background:#0b0f16}
      .awFoot div{flex:1 1 220px;min-width:180px;font-size:11px;color:#8290a2;line-height:1.7}
      .awToast{position:fixed;left:50%;bottom:32px;transform:translate(-50%,16px);background:#f1d69f;color:#241a09;font-weight:700;font-size:13px;padding:9px 20px;border-radius:999px;opacity:0;pointer-events:none;transition:.22s;z-index:9999}
      .awToast.on{opacity:1;transform:translate(-50%,0)}
      @media(max-width:640px){
        .awGrid{grid-template-columns:repeat(5,minmax(0,1fr))}
        .awTable{font-size:11px}
        .awTable .r{display:none}
      }
    `;
    document.head.appendChild(s);
  }

  function toast(msg){
    let t=document.querySelector('.awToast');
    if(!t){t=document.createElement('div');t.className='awToast';document.body.appendChild(t)}
    t.textContent=msg;t.classList.add('on');
    clearTimeout(toast._h);toast._h=setTimeout(()=>t.classList.remove('on'),1600);
  }

  function cardHtml(){
    const list=slots();
    const cells=list.map((s,i)=>{
      const g=GAL[i]||['','','',''];
      const cls=['awCell',s.n===1?'first':'',s.n===N?'last':'',s.state==='now'?'now':s.state==='past'?'past':''].filter(Boolean).join(' ');
      return `<a class="${cls}" href="#awaken-${s.n}" data-n="${s.n}" title="${esc(s.m+'/'+s.d+' '+g[0]+'「'+g[3]+'」')}"><b>${s.m}/${s.d}</b><small>${esc(g[0])}</small></a>`;
    }).join('');
    const trs=list.map((s,i)=>{
      const g=GAL[i]||['','','',''];
      const cls=s.state==='now'?'now':s.state==='past'?'past':'';
      return `<tr class="${cls}" id="awaken-${s.n}"><td class="d">${s.m}/${s.d}</td><td class="n">${esc(g[0])}</td><td class="r">${esc(g[1])} · ${esc(g[2])}</td><td class="w">命轮「${esc(g[3])}」</td></tr>`;
    }).join('');
    return `<div class="awCard" id="awakenCard">
      <div class="awHead">
        <div>
          <h3>${ui('限时唤醒「银河闪耀时」· 35 期逐日换池','Limited Awaken “Galaxy Shimmer” · 35 daily slots')}</h3>
          <p>${ui('2026/11/30 09:00 — 2027/1/4 09:00（UTC+8）· 每日 9:00 换池，每期 24 小时','Nov 30 2026 09:00 – Jan 4 2027 09:00 (UTC+8) · rotates at 09:00, 24h each')}</p>
        </div>
        <span class="awPill">35 ${ui('期','slots')}</span>
      </div>
      <div class="awActs">
        <a class="awBtn pri" id="awakenIcs" href="${ICS}" download>${ui('添加到系统日历','Add to calendar')}</a>
        <a class="awBtn" id="awakenSub" href="${ICS}">${ui('订阅（自动同步）','Subscribe')}</a>
        <button class="awBtn" id="awakenCopy" type="button">${ui('复制日历链接','Copy .ics link')}</button>
        <a class="awBtn" href="${POSTER}" target="_blank" rel="noopener">${ui('看海报','Poster')}</a>
      </div>
      <div class="awHint">${ui(
        '<b>iPhone / iPad</b>：点「添加到系统日历」→ 右上角「全部添加」，35 个日程一次导入。<b>安卓</b>：点按钮下载 <code>galaxy-awaken.ics</code>，在通知栏或「文件」里点它，选日历导入。<br>每期标题是「日期 唤醒体「专属命轮」」，日历详情里写了界域与类型，提醒会预告下一期。顺序与海报一致：从左到右、上到下；第 35 期（1/3）为图鲁特别返场。',
        '<b>iPhone / iPad</b>: tap “Add to calendar” → “Add All”. <b>Android</b>: download <code>galaxy-awaken.ics</code> and open it from notifications or Files. Each event is titled “date Awakener 「Wheel」” and lists realm/type in the details. Same order as the poster; slot 35 (Jan 3) is the Tulu special return.'
      )}</div>
      <div class="awGrid">${cells}</div>
      <div class="awTableWrap" style="overflow:auto;-webkit-overflow-scrolling:touch;max-height:420px">
        <table class="awTable"><thead><tr><th>${ui('日期','Date')}</th><th>${ui('唤醒体','Awakener')}</th><th>${ui('界域 · 类型','Realm · Type')}</th><th>${ui('专属命轮','Signature Wheel')}</th></tr></thead><tbody>${trs}</tbody></table>
      </div>
      <div class="awFoot">
        <a href="${POSTER}" target="_blank" rel="noopener"><img src="${POSTER}" alt="${ui('日程海报','Schedule poster')}" loading="lazy" decoding="async"></a>
        <div>${ui('海报版日程：每个唤醒体头像上方标了日期、界域类型与专属命轮，点缩略图看原图。','Poster edition:每个 Awakener is tagged with its date, realm/type and signature wheel; tap the thumbnail for full size.')}</div>
      </div>
    </div>`;
  }

  function bind(box){
    const abs=new URL(ICS,location.href).href;
    const sub=box.querySelector('#awakenSub');
    if(sub)sub.href=abs.replace(/^https?/,'webcal');
    const copy=box.querySelector('#awakenCopy');
    if(copy&&!copy._bound){
      copy._bound=true;
      copy.addEventListener('click',()=>{
        const done=()=>toast(ui('日历链接已复制','Calendar link copied'));
        if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(abs).then(done,()=>prompt(ui('复制这个链接：','Copy this link:'),abs))}
        else prompt(ui('复制这个链接：','Copy this link:'),abs);
      });
    }
    const wrap=box.querySelector('.awTableWrap');
    if(wrap&&!wrap._bound){
      wrap._bound=true;
      box.querySelectorAll('.awCell').forEach(a=>{
        a.addEventListener('click',ev=>{
          ev.preventDefault();
          const tr=box.querySelector('#awaken-'+a.dataset.n);
          if(!tr)return;
          const top=tr.offsetTop-wrap.scrollTop;
          wrap.scrollTo({top:wrap.scrollTop+top-(wrap.clientHeight/2)+tr.offsetHeight/2,behavior:'smooth'});
          tr.style.transition='none';tr.style.background='rgba(241,214,159,.3)';
          setTimeout(()=>{tr.style.transition='background .8s';tr.style.background=''},220);
        });
      });
    }
  }

  // 由卡池日历 draw() 在每次重绘后调用：把卡片填进槽位（幂等）
  function mount(){
    const slot=document.getElementById('awakenCalSlot');
    if(!slot)return false;
    if(slot.dataset.awakenReady==='1'&&slot.querySelector('#awakenCard')){bind(slot);return true}
    ensureStyle();
    slot.innerHTML=cardHtml();
    slot.dataset.awakenReady='1';
    bind(slot);
    return true;
  }

  function open(){
    if(window.MorimensTabs)window.MorimensTabs.activate('summon');
    // 卡片内容与卡池数据都是异步渲染的，滚两次（首次定位 + 布局稳定后校正），
    // 并让出吸顶页签栏的高度，避免卡片标题被压在导航下面。
    const jump=()=>{
      const c=document.getElementById('awakenCard');if(!c)return;
      // 页签栏是吸顶的，而且窄屏会折成两行，所以按它当前的实际底边留白
      const nav=document.getElementById('morimensTabs');
      const clear=(nav?nav.getBoundingClientRect().bottom:0)+14;
      const y=c.getBoundingClientRect().top+window.scrollY-clear;
      window.scrollTo({top:Math.max(0,y),behavior:'auto'});
    };
    setTimeout(()=>{mount();jump()},150);
    setTimeout(jump,800);
  }

  window.MorimensAwakenCalendar={mount,open};
  mount(); // 若卡池页签已在模块载入前渲染过，先把卡片补上

  // 深链：#awaken 打开卡池日历页签并定位到这张卡片
  // （页签系统初始化会把 hash 改写成当前页签，所以要在 morimens-tools.js 里先记下原始 hash）
  const want=()=>String(window.MorimensInitialHash||location.hash||'').replace(/^#/,'');
  if(want()==='awaken'){
    if(document.readyState==='complete')open();
    else window.addEventListener('load',()=>open(),{once:true});
  }
})();

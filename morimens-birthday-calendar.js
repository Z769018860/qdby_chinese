// Awakener birthday calendar: year calendar with every birthday marked + the next upcoming birthdays.
// Data: data/morimens/game/birthdays.json (scripts/build_birthdays.mjs, SKeyDB profiles).
(()=>{
  'use strict';
  const zh=()=>localStorage.getItem('morimens.language')!=='en';
  const ui=(cn,en)=>zh()?cn:en;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state={data:null,loading:false,error:null,sel:null,host:null};
  const nm=a=>zh()?(a.zh||a.en):a.en;
  const REALM={CHAOS:['混沌','Chaos'],CARO:['血肉','Caro'],AEQUOR:['深海','Aequor'],ULTRA:['超维','Ultra']};

  function ensureStyle(){
    if(document.getElementById('bdStyle'))return;
    const s=document.createElement('style');s.id='bdStyle';
    s.textContent=`
      .bdWrap{display:grid;gap:14px;padding-top:10px}.bdNote{font-size:12px;color:#8290a2;line-height:1.7}.bdSec{font-size:14px;font-weight:700;color:#ead9b9;margin:4px 0 0}
      .bdNext{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px}
      .bdCard{display:flex;gap:10px;align-items:center;border:1px solid rgba(148,163,184,.2);border-radius:10px;padding:8px 10px;background:#0f1927;cursor:pointer}.bdCard.today{border-color:#f1d69f;box-shadow:0 0 0 1px rgba(241,214,159,.3)}
      .bdCard img,.bdAv{width:44px;height:44px;border-radius:50%;object-fit:cover;background:#0b0f16;flex:none}.bdCard b{color:#f1d69f;display:block}.bdCard small{color:#8fa2bd}
      .bdYear{display:flex;gap:8px;align-items:center}.bdYear button{background:#111827;color:#dbe4f0;border:1px solid rgba(148,163,184,.3);border-radius:8px;padding:4px 12px;cursor:pointer}.bdYear b{min-width:52px;text-align:center}
      .bdMonths{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
      .bdM{border:1px solid rgba(148,163,184,.18);border-radius:10px;background:#0d121a;padding:8px}.bdH{font-weight:700;color:#ead9b9;margin:0 2px 4px}
      .bdW,.bdG{display:grid;grid-template-columns:repeat(7,1fr);gap:2px}.bdW i{font-style:normal;text-align:center;font-size:10px;color:#8290a2}
      .bdD{position:relative;height:36px;border:1px solid rgba(148,163,184,.12);border-radius:5px;background:#111827;padding:0;color:#dbe4f0;font-size:10.5px;cursor:default;overflow:hidden}
      .bdD.has{cursor:pointer;border-color:#e0a83a;background:#2a2112}.bdD.has:hover{filter:brightness(1.3)}.bdD.today{outline:2px solid #fff;outline-offset:-2px}.bdD.sel{outline:2px solid #f1d69f;outline-offset:-2px}
      .bdD img{position:absolute;right:1px;bottom:1px;width:20px;height:20px;border-radius:50%;object-fit:cover;border:1px solid #0b0f16}.bdD .n{position:absolute;left:3px;top:1px;font-weight:700}.bdD .c{position:absolute;right:2px;top:1px;font-size:9px;color:#f1d69f}
      .bdList{display:flex;gap:8px;flex-wrap:wrap}.bdChip{display:inline-flex;gap:8px;align-items:center;background:#111827;border:1px solid rgba(148,163,184,.22);border-radius:999px;padding:3px 12px 3px 3px;font-size:12.5px}
      @media(max-width:700px){.bdD{height:32px}}`;
    document.head.appendChild(s);
  }
  const p2=n=>String(n).padStart(2,'0');
  const todayCN=()=>{const d=new Date(Date.now()+8*3600e3);return {y:d.getUTCFullYear(),m:d.getUTCMonth()+1,d:d.getUTCDate()}};
  function daysUntil(a,t){
    const target=Date.UTC(t.y,a.m-1,a.d),now=Date.UTC(t.y,t.m-1,t.d);
    const diff=Math.round((target-now)/86400000);
    return diff>=0?diff:Math.round((Date.UTC(t.y+1,a.m-1,a.d)-now)/86400000);
  }
  function draw(){
    const host=state.host;if(!host)return;
    if(state.error){host.innerHTML=`<div class="bdNote">${ui('生日数据加载失败：','Failed to load birthday data: ')}${esc(state.error)}</div>`;return}
    if(!state.data){host.innerHTML=`<div class="bdNote">${ui('正在加载…','Loading…')}</div>`;return}
    const t=todayCN(),year=state.year??t.y,list=state.data.awakeners;
    const upcoming=list.map(a=>({a,n:daysUntil(a,t)})).sort((x,y)=>x.n-y.n||x.a.en.localeCompare(y.a.en));
    const lead=upcoming[0].n,near=upcoming.filter(x=>x.n===lead||upcoming.indexOf(x)<6).slice(0,Math.max(6,upcoming.filter(x=>x.n===lead).length));
    const byDay=new Map();for(const a of list){const k=`${a.m}-${a.d}`;(byDay.get(k)||byDay.set(k,[]).get(k)).push(a)}
    const MN=zh()?['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const WD=zh()?['一','二','三','四','五','六','日']:['M','T','W','T','F','S','S'];
    const card=({a,n})=>{
      const label=n===0?ui('今天生日！','Birthday today!'):ui(`还有 ${n} 天`,`in ${n} day${n===1?'':'s'}`);
      return `<div class="bdCard${n===0?' today':''}" data-bdday="${a.m}-${a.d}">${a.img?`<img src="${esc(a.img)}" alt="" loading="lazy">`:''}<div><b>${esc(nm(a))}</b><small>${ui(`${a.m} 月 ${a.d} 日`,`${MN[a.m-1]} ${a.d}`)} · ${label}</small></div></div>`;
    };
    const months=MN.map((mn,mi)=>{
      const first=new Date(Date.UTC(year,mi,1)),len=new Date(Date.UTC(year,mi+1,0)).getUTCDate(),lead0=(first.getUTCDay()+6)%7;
      let cells='';for(let i=0;i<lead0;i++)cells+='<i></i>';
      for(let d=1;d<=len;d++){
        const l=byDay.get(`${mi+1}-${d}`)||[],k=`${mi+1}-${d}`;
        cells+=`<button type="button" class="bdD${l.length?' has':''}${year===t.y&&mi+1===t.m&&d===t.d?' today':''}${state.sel===k?' sel':''}"${l.length?` data-bdday="${k}" title="${esc(l.map(nm).join('、'))}"`:' tabindex="-1"'}><span class="n">${d}</span>${l.length?`${l[0].img?`<img src="${esc(l[0].img)}" alt="">`:''}${l.length>1?`<span class="c">×${l.length}</span>`:''}`:''}</button>`;
      }
      return `<div class="bdM"><div class="bdH">${mn}</div><div class="bdW">${WD.map(w=>`<i>${w}</i>`).join('')}</div><div class="bdG">${cells}</div></div>`;
    }).join('');
    const sel=state.sel?byDay.get(state.sel)||[]:[];
    host.innerHTML=`<div class="panelHead"><div><p class="eyebrow">BIRTHDAYS</p><h2>${ui('唤醒体生日日历','Awakener Birthday Calendar')}</h2><p class="panelLead">${ui('每个唤醒体的生日标在年历上，点击有头像的日期查看当天寿星；下方是最近要过生日的唤醒体（按 UTC+8 的今天计算）。','Every Awakener birthday is marked on the year calendar; click a marked day to see who it belongs to. The next upcoming birthdays are listed below (today is taken in UTC+8).')}</p></div></div>
      <div class="bdWrap">
        <div class="bdSec">${ui('最近要过生日','Coming up')}</div><div class="bdNext">${near.map(card).join('')}</div>
        <div class="bdYear"><button type="button" data-bdyear="${year-1}">←</button><b>${year}</b><button type="button" data-bdyear="${year+1}">→</button>${year!==t.y?`<button type="button" data-bdyear="${t.y}">${ui('回到今年','This year')}</button>`:''}</div>
        <div class="bdMonths">${months}</div>
        ${state.sel?`<div class="bdSec">${ui(`${state.sel.replace('-',' 月 ')} 日的寿星`,`Born on ${MN[+state.sel.split('-')[0]-1]} ${state.sel.split('-')[1]}`)}</div><div class="bdList">${sel.map(a=>`<span class="bdChip">${a.img?`<img class="bdAv" src="${esc(a.img)}" alt="">`:''}${esc(nm(a))}<small style="color:#8fa2bd">${esc(ui(...(REALM[a.realm]||['','']))||'')} ${esc(a.rarity||'')}</small></span>`).join('')}</div>`:''}
        <div class="bdNote">${ui('生日数据来自 SKeyDB 的唤醒体档案，与灰机维基核对一致。','Birthdays come from the SKeyDB Awakener profiles and match the Huiji Wiki.')}${state.data.unknown?.length?ui(`　${state.data.unknown.join('、')} 的生日官方暂未公开。`,`  The birthday of ${state.data.unknown.join(', ')} is not public yet.`):''}</div>
      </div>`;
  }
  async function render(host){
    state.host=host;ensureStyle();bind();draw();
    if(state.data||state.loading)return;
    state.loading=true;
    try{
      const [d,p]=await Promise.all([fetch('data/morimens/game/birthdays.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}),Promise.resolve()]);
      state.data=d;
    }catch(e){state.error=e.message}
    state.loading=false;draw();
  }
  let bound=false;
  function bind(){
    if(bound)return;bound=true;
    document.addEventListener('click',e=>{
      if(!state.host?.contains(e.target))return;
      const y=e.target.closest('[data-bdyear]');if(y){state.year=+y.dataset.bdyear;draw();return}
      const d=e.target.closest('[data-bdday]');if(d){state.sel=state.sel===d.dataset.bdday?null:d.dataset.bdday;draw()}
    });
    window.addEventListener('morimens-language-change',()=>{if(state.host&&state.host.offsetParent!==null)draw()});
  }
  window.MorimensBirthdays={render};
})();

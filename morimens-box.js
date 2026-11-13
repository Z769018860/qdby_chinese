/* 忘忘看报 · 定制配队推荐
   1) 我的 BOX：录入 / 编辑唤醒体等级、启灵、灵塑、技能，命轮叠位
   2) 截图识别：交给 morimens-box-ocr.js，识别结果可核对后入库
   3) 配队推荐：按 box 给融灾五区推荐阵容 + 目标分数 + 参考记录
   数据全部在本机 localStorage，不上传。 */
(()=>{
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pct=v=>`${Math.round(Number(v)*100)}%`;
  const STORE='morimens.box.v1';
  const REALMS=[['CHAOS','混沌'],['AEQUOR','深海'],['CARO','血肉'],['ULTRA','超维']];
  const REALM_ORDER=['CHAOS','AEQUOR','CARO','ULTRA'];
  const WHEEL_REALMS=REALM_ORDER.concat(['NEUTRAL']);
  const REALM_ZH={CHAOS:'混沌',AEQUOR:'深海',CARO:'血肉',ULTRA:'超维',NEUTRAL:'中立'};
  const realmZh=k=>REALM_ZH[k]||k||'';
  const MAXLV=90,MAXEN=15,MAXPO=10,MAXSK=6,MAXSTACK=12;
  const ENLIGHT_TEXT=en=>en<=3?`${en} 启`:(en===4?'超限':`超限 +${en-3}`);

  let boxData={v:1,chars:{},wheels:{},updated:0};
  let chars=[],charsById=new Map(),idByIngame=new Map(),wheelCatalog=[],wheelZh=null,artMap=null;
  let dataReady=false,panel=null,planState={season:null,teams:null,target:525,rankCap:0,mode:'normal'};
  const seasonCache=new Map();
  let manifestPromise=null;

  /* ---------------- 存储 ---------------- */
  function loadBox(){
    try{const raw=localStorage.getItem(STORE);if(!raw)return;const j=JSON.parse(raw);if(j&&typeof j==='object'){boxData={v:1,chars:j.chars||{},wheels:j.wheels||{},updated:j.updated||0};}}catch(e){console.warn('box load failed',e)}
  }
  function saveBox(){
    boxData.updated=Date.now();
    try{localStorage.setItem(STORE,JSON.stringify(boxData))}catch(e){console.warn('box save failed',e);toast('本机存储写入失败，可能是浏览器隐私模式')}
    updateSummary();
    syncDirty();
  }
  function syncDirty(){document.dispatchEvent(new Event('zjtt:dirty'))}
  function ownedCount(){return Object.keys(boxData.chars).length}
  function wheelCount(){return Object.keys(boxData.wheels).length}
  function setChar(id,patch){
    const cur=boxData.chars[id]||{lv:MAXLV,en:3,po:MAXPO,sk:MAXSK};
    boxData.chars[id]={...cur,...patch};
    saveBox();
  }
  function addChar(id,preset){
    if(boxData.chars[id])return false;
    boxData.chars[id]={lv:MAXLV,en:3,po:MAXPO,sk:MAXSK,...preset};
    saveBox();return true;
  }
  function delChar(id){delete boxData.chars[id];saveBox()}

  /* ---------------- 数据 ---------------- */
  async function fetchJson(url,label){
    const r=await fetch(url,{cache:'no-cache'});
    if(!r.ok)throw new Error(`${label||url} HTTP ${r.status}`);
    return r.json();
  }
  function waitData(){
    if(window.MorimensData?.db?.records?.length){dataReady=true;return Promise.resolve()}
    return new Promise(resolve=>{
      const t=setTimeout(resolve,6000);
      window.addEventListener('morimens-data-ready',()=>{clearTimeout(t);resolve()},{once:true});
    });
  }
  async function initData(){
    await waitData();
    const md=window.MorimensData;
    if(!md?.db?.records?.length){toast('角色数据尚未载入，BOX 功能稍后可用');return}
    dataReady=true;
    chars=md.db.records.map(rec=>{
      const loc=md.localizedProfile(rec);
      return {rec,id:rec.id,ingameId:rec.ingameId,name:loc.name,realm:rec.realm,realmZh:loc.realm||'',rarity:loc.rarity||rec.rarity,type:loc.type||rec.type,
        portrait:md.assetFor(rec,'portrait')||'',slug:rec.assetSlug||''};
    }).sort((a,b)=>REALM_ORDER.indexOf(a.realm)-REALM_ORDER.indexOf(b.realm)||String(a.name).localeCompare(String(b.name),'zh-CN'));
    charsById=new Map(chars.map(c=>[c.id,c]));
    idByIngame=new Map();
    for(const c of chars)if(c.ingameId)idByIngame.set(String(c.ingameId),c.id);
    const [cat,map]=await Promise.allSettled([
      fetchJson('data/morimens/skeydb/public-v3/catalogs/wheels.json','wheels catalog'),
      fetchJson('data/morimens/skeydb/art-map.json','art map')
    ]);
    if(map.status==='fulfilled')artMap=map.value;
    if(cat.status==='fulfilled'){
      const rows=cat.value.records||[];
      wheelCatalog=rows.map(w=>{
        const zh=md.wheelZhDb?.bySkeydbId?.[w.id]||md.wheelZhDb?.byEnglishName?.[w.name];
        const icon=artMap?.wheelIcon?.[w.id];
        return {id:w.id,name:zh?.name||w.name,en:w.name,realm:w.realm,rarity:w.rarity,owner:w.ownerAwakenerId,
          icon:icon?`assets/morimens/wheel-thumbs/${icon}.webp`:''};
      }).sort((a,b)=>String(a.name).localeCompare(String(b.name),'zh-CN'));
    }
    renderAll();
  }
  function wheelNameByEn(en){
    const zh=window.MorimensData?.wheelZhDb?.byEnglishName?.[en];
    return zh?.name||en;
  }

  /* ---------------- 样式 ---------------- */
  function ensureStyle(){
    if($('morimensBoxStyle'))return;
    const s=document.createElement('style');s.id='morimensBoxStyle';s.textContent=`
      .boxSubTabs{display:flex;gap:7px;flex-wrap:wrap;margin:14px 0 6px}
      .boxSubTab{border:1px solid rgba(148,163,184,.22);border-radius:9px;background:#111827;color:#aeb8c7;padding:8px 15px;font:inherit;font-size:12px;font-weight:800;cursor:pointer}
      .boxSubTab[aria-selected="true"]{border-color:#b99a61;background:rgba(185,154,97,.16);color:#f1d69f}
      .boxToolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:12px 0}
      .boxBtn{border:1px solid rgba(148,163,184,.28);border-radius:10px;background:#141c29;color:#dce4ee;padding:9px 13px;font:inherit;font-size:12px;font-weight:700;cursor:pointer}
      .boxBtn:hover{border-color:#64748b}
      .boxBtn.primary{border:0;background:linear-gradient(135deg,#8d6a43,#c29b60);color:#10141b;font-weight:900}
      .boxBtn.danger{color:#f3a3a3;border-color:rgba(199,94,104,.4)}
      .boxChips{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 12px}
      .boxChip{border:1px solid rgba(148,163,184,.2);border-radius:999px;background:rgba(255,255,255,.03);color:#9fabbd;padding:5px 11px;font-size:11px;font-weight:700;cursor:pointer}
      .boxChip[aria-pressed="true"]{border-color:rgba(213,177,118,.55);background:rgba(213,177,118,.14);color:#f1ddb5}
      .boxRow{display:grid;grid-template-columns:42px minmax(88px,1.2fr) 78px 96px 78px 74px 26px;gap:8px;align-items:center;padding:8px 10px;border:1px solid rgba(148,163,184,.12);border-radius:11px;background:rgba(255,255,255,.025);margin-bottom:7px}
      .boxRow img{width:42px;height:42px;border-radius:9px;object-fit:cover;background:#0b1220}
      .boxRow .bname{font-size:12px;font-weight:800;color:#e7edf5;line-height:1.35;min-width:0;overflow:hidden;text-overflow:ellipsis}
      .boxRow .bname small{display:block;color:#7f8da1;font-size:10px;font-weight:600;margin-top:2px}
      .boxRow label{display:flex;flex-direction:column;gap:3px;font-size:9px;color:#8290a2;font-weight:700}
      .boxRow input,.boxRow select{height:30px;border:1px solid #334155;border-radius:8px;background:#111827;color:#eef2f7;padding:0 6px;font-size:11px;font-family:inherit}
      .boxDel{border:0;background:transparent;color:#7f8da1;font-size:16px;cursor:pointer;line-height:1}
      .boxDel:hover{color:#f07171}
      .boxSectionTitle{display:flex;align-items:center;gap:9px;margin:16px 0 9px;font-size:13px;font-weight:900;color:#ead9b9}
      .boxSectionTitle small{font-weight:600;color:#7f8da1;font-size:10px}
      .boxEmpty{padding:16px;border:1px dashed rgba(148,163,184,.25);border-radius:11px;color:#8290a2;font-size:12px;text-align:center}
      .boxPicker{position:fixed;inset:0;z-index:200;background:rgba(3,6,11,.72);display:flex;align-items:center;justify-content:center;padding:18px;backdrop-filter:blur(6px)}
      .boxPickerCard{width:min(880px,100%);max-height:82vh;overflow:auto;background:#0f1520;border:1px solid rgba(148,163,184,.22);border-radius:16px;padding:16px;box-shadow:0 30px 80px rgba(0,0,0,.5)}
      .boxPickerHead{display:flex;gap:10px;align-items:center;margin-bottom:12px}
      .boxPickerHead input{flex:1;height:36px;border:1px solid #334155;border-radius:9px;background:#111827;color:#eef2f7;padding:0 10px;font:inherit;font-size:13px}
      .boxPickGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}
      .boxPickItem{border:1px solid rgba(148,163,184,.14);border-radius:10px;background:rgba(255,255,255,.03);padding:6px;cursor:pointer;text-align:center;color:#dbe3ee}
      .boxPickItem:hover{border-color:rgba(213,177,118,.5)}
      .boxPickItem.owned{opacity:.42}
      .boxPickItem img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;background:#0b1220}
      .boxPickItem span{display:block;font-size:10px;margin-top:4px;line-height:1.3;font-weight:700}
      .boxPickItem small{display:block;font-size:9px;color:#7f8da1}
      .boxText{width:100%;min-height:88px;border:1px solid #334155;border-radius:10px;background:#0b111c;color:#dbe3ee;padding:10px;font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;resize:vertical}
      .boxNotice{padding:11px 13px;border-radius:11px;border:1px solid rgba(215,168,91,.25);background:rgba(215,168,91,.07);color:#b9c3d0;font-size:11px;line-height:1.7;margin:10px 0}
      .boxNotice.bad{border-color:rgba(199,94,104,.4);background:rgba(199,94,104,.1);color:#f0c3c3}
      .boxDrop{border:1.5px dashed rgba(148,163,184,.35);border-radius:14px;padding:22px;text-align:center;color:#93a1b5;font-size:12px;cursor:pointer;background:rgba(255,255,255,.02)}
      .boxDrop.over{border-color:rgba(213,177,118,.7);background:rgba(213,177,118,.08)}
      .boxDrop b{display:block;color:#ead9b9;font-size:14px;margin-bottom:6px}
      .boxThumbs{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
      .boxThumb{position:relative;width:96px}
      .boxThumb img{width:96px;height:64px;object-fit:cover;border-radius:8px;border:1px solid rgba(148,163,184,.2);background:#0b1220}
      .boxThumb button{position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;border:1px solid rgba(148,163,184,.35);background:#111827;color:#cbd5e1;font-size:11px;cursor:pointer}
      .boxThumb small{display:block;margin-top:3px;font-size:9px;color:#7f8da1;text-align:center}
      .boxOcrRow{display:grid;grid-template-columns:42px minmax(80px,1fr) 74px 96px 60px;gap:8px;align-items:center;padding:7px 9px;border:1px solid rgba(148,163,184,.12);border-radius:10px;background:rgba(255,255,255,.022);margin-bottom:6px}
      .boxOcrRow.low{border-color:rgba(199,94,104,.45);background:rgba(199,94,104,.08)}
      .boxOcrRow img{width:42px;height:42px;border-radius:8px;object-fit:cover;background:#0b1220}
      .boxOcrRow select,.boxOcrRow input{height:30px;border:1px solid #334155;border-radius:8px;background:#111827;color:#eef2f7;padding:0 6px;font-size:11px;max-width:100%}
      .boxScore{font-size:10px;font-weight:800;text-align:right}
      .boxScore.ok{color:#5bb98c}.boxScore.warn{color:#d7a85b}.boxScore.bad{color:#c75e68}
      .boxPlanCtl{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:12px 0}
      .boxField{display:flex;flex-direction:column;gap:5px;font-size:10px;color:#8f9caf;font-weight:700}
      .boxField input,.boxField select{height:36px;border:1px solid #334155;border-radius:9px;background:#111827;color:#eef2f7;padding:0 9px;font:inherit;font-size:12px}
      .boxWave{margin-top:12px;border:1px solid rgba(148,163,184,.15);border-radius:13px;background:rgba(255,255,255,.022);padding:12px}
      .boxWaveHead{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline}
      .boxWaveHead b{font-size:13px;color:#f1dfbc}
      .boxWaveHead span{font-size:10px;color:#8290a2}
      .boxWaveMembers{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:9px}
      .boxMember{display:flex;gap:7px;padding:7px;border-radius:9px;background:#111827;min-width:0}
      .boxMember img{width:34px;height:34px;border-radius:7px;object-fit:cover;flex:none;background:#0b1220}
      .boxMember b{display:block;font-size:11px;color:#e7edf5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .boxMember small{display:block;color:#7f8da1;font-size:9px;margin-top:2px;line-height:1.4}
      .boxMember .warnTag{color:#d7a85b}
      .boxMember .missTag{color:#c75e68}
      .boxAlt{margin-top:8px;font-size:10px;color:#8b98ab;line-height:1.8}
      .boxAlt a{color:#d5b176;text-decoration:none}
      .boxStatRow{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:12px 0}
      .boxStat{padding:11px;border-radius:11px;background:rgba(255,255,255,.035);border:1px solid rgba(148,163,184,.12)}
      .boxStat small{display:block;color:#8290a2;font-size:9px}
      .boxStat strong{display:block;margin-top:3px;font-size:18px;color:#f1dfbc}
      .boxToast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:300;padding:10px 16px;border-radius:999px;background:rgba(15,21,32,.96);border:1px solid rgba(213,177,118,.4);color:#f1ddb5;font-size:12px;font-weight:700;box-shadow:0 12px 30px rgba(0,0,0,.4)}
      @media(max-width:900px){.boxPlanCtl{grid-template-columns:repeat(2,minmax(0,1fr))}.boxWaveMembers{grid-template-columns:repeat(2,minmax(0,1fr))}.boxStatRow{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:640px){
        .boxRow{grid-template-columns:36px minmax(70px,1fr) repeat(2,minmax(0,1fr));grid-auto-rows:auto;row-gap:6px}
        .boxRow img{width:36px;height:36px}
        .boxRow .bname{grid-column:2/5}
        .boxRow label:nth-child(3),.boxRow label:nth-child(4){grid-column:auto}
        .boxDel{grid-column:4;justify-self:end}
        .boxOcrRow{grid-template-columns:36px minmax(70px,1fr) 66px 84px}
      }
    `;document.head.appendChild(s);
  }

  function toast(msg){
    const old=$('boxToast');if(old)old.remove();
    const d=document.createElement('div');d.id='boxToast';d.className='boxToast';d.textContent=msg;document.body.appendChild(d);
    setTimeout(()=>d.remove(),2400);
  }

  /* ---------------- 面板骨架 ---------------- */
  function panelHtml(){return `
    <section class="panel" aria-labelledby="boxTitle">
      <div class="panelHead">
        <div><p class="eyebrow">CUSTOM LINEUP · EREMORA</p><h2 id="boxTitle">定制配队推荐</h2>
          <p class="panelLead">录入你账号的唤醒体与命轮（也可以直接传游戏截图识别），再按自己的 box 生成融灾五区阵容与目标分数。数据只存在本机浏览器。</p></div>
        <span class="statusPill" id="boxStatus">本地保存</span>
      </div>
      <div class="boxSubTabs" role="tablist" aria-label="定制配队子页">
        <button type="button" class="boxSubTab" role="tab" data-box-tab="roster" aria-selected="true">我的 BOX</button>
        <button type="button" class="boxSubTab" role="tab" data-box-tab="ocr" aria-selected="false">截图识别</button>
        <button type="button" class="boxSubTab" role="tab" data-box-tab="plan" aria-selected="false">配队推荐</button>
      </div>

      <div id="boxTabRoster">
        <div class="boxToolbar">
          <button type="button" class="boxBtn primary" id="boxAddChar">+ 添加唤醒体</button>
          <button type="button" class="boxBtn" id="boxFillMax">一键满级满启</button>
          <button type="button" class="boxBtn" id="boxExportCode">导出代码</button>
          <button type="button" class="boxBtn" id="boxImportCode">导入代码</button>
          <button type="button" class="boxBtn" id="boxPoster">导出长图</button>
          <span class="boxChip" id="boxSummary" style="cursor:default">0 名唤醒体 · 0 张命轮</span>
        </div>
        <div class="boxChips" id="boxRealmFilter"></div>
        <div id="boxCharList"></div>
        <div id="boxWheelList"></div>
      </div>

      <div id="boxTabOcr" hidden>
        <div class="boxNotice">支持一次最多 5 张截图，可以分多次补充。角色列表页识别「等级 + 启灵」，命轮页识别「叠位」。识别结果会先列出来给你核对，确认后才写进 BOX。</div>
        <div class="boxDrop" id="boxDrop"><b>点击选择截图，或把图片拖到这里</b><span id="boxDropHint">（也可以直接 Ctrl+V 粘贴）</span><input type="file" id="boxFiles" accept="image/*" multiple hidden></div>
        <div class="boxThumbs" id="boxThumbs"></div>
        <div class="boxToolbar">
          <label class="boxField" style="min-width:150px">识别内容
            <select id="boxOcrMode"><option value="auto" selected>自动判断（推荐）</option><option value="char">角色列表（等级 / 启灵）</option><option value="wheel">命轮列表（叠位）</option></select>
          </label>
          <button type="button" class="boxBtn primary" id="boxOcrRun">开始识别</button>
          <button type="button" class="boxBtn" id="boxOcrClear">清空图片</button>
          <span class="boxChip" id="boxOcrStatus" style="cursor:default">等待图片</span>
        </div>
        <div id="boxOcrResult"></div>
      </div>

      <div id="boxTabPlan" hidden>
        <div class="boxPlanCtl">
          <label class="boxField">赛季<select id="boxPlanSeason"></select></label>
          <label class="boxField">目标总分<input id="boxPlanTarget" type="number" min="0" max="525" step="5" value="525"></label>
          <label class="boxField">参考榜单范围<select id="boxPlanRank"><option value="0">全部记录</option><option value="50">Top 50</option><option value="200">Top 200</option><option value="500">Top 500</option><option value="1000" selected>Top 1000</option></select></label>
          <label class="boxField">配置宽松度<select id="boxPlanMode"><option value="strict">严格（等级启灵都要够）</option><option value="normal" selected="selected">正常（允许小幅差一点）</option><option value="loose">宽松（先看能打什么）</option></select></label>
        </div>
        <div class="boxToolbar"><button type="button" class="boxBtn primary" id="boxPlanRun">生成推荐</button><span class="boxChip" id="boxPlanStatus" style="cursor:default">等待生成</span></div>
        <div id="boxPlanResult"></div>
      </div>
    </section>
  `}

  /* ---------------- 渲染：BOX ---------------- */
  let realmFilter='all';
  function renderRealmFilter(){
    const host=$('boxRealmFilter');if(!host)return;
    const counts={all:ownedCount()};
    for(const [k] of REALMS)counts[k]=0;
    for(const id in boxData.chars){const c=charsById.get(id);if(c)counts[c.realm]=(counts[c.realm]||0)+1}
    host.innerHTML=[['all','全部'],...REALMS.map(([k,v])=>[k,v])].map(([k,v])=>
      `<button type="button" class="boxChip" data-realm="${k}" aria-pressed="${realmFilter===k}">${v} · ${counts[k]||0}</button>`).join('');
  }
  function renderCharList(){
    const host=$('boxCharList');if(!host)return;
    if(!dataReady){host.innerHTML='<div class="boxEmpty">正在载入角色数据…</div>';return}
    const ids=Object.keys(boxData.chars).filter(id=>realmFilter==='all'||charsById.get(id)?.realm===realmFilter)
      .sort((a,b)=>{const ca=charsById.get(a),cb=charsById.get(b);return REALM_ORDER.indexOf(ca?.realm)-REALM_ORDER.indexOf(cb?.realm)||String(ca?.name).localeCompare(String(cb?.name),'zh-CN')});
    if(!ids.length){host.innerHTML='<div class="boxEmpty">还没有唤醒体。点「+ 添加唤醒体」，或用「截图识别」批量导入。</div>';return}
    let lastRealm='';const out=[];
    for(const id of ids){
      const c=charsById.get(id);if(!c)continue;
      const v=boxData.chars[id];
      if(c.realm!==lastRealm){lastRealm=c.realm;out.push(`<div class="boxSectionTitle">${esc(c.realmZh||c.realm)} <small>${REALMS.find(r=>r[0]===c.realm)?.[1]||''}</small></div>`)}
      out.push(`<div class="boxRow" data-id="${esc(id)}">
        <img src="${esc(c.portrait)}" alt="" loading="lazy">
        <div class="bname">${esc(c.name)}<small>${esc(c.ingameId||'')} · ${esc(c.rarity||'')}</small></div>
        <label>等级<input type="number" min="1" max="${MAXLV}" value="${v.lv}" data-field="lv"></label>
        <label>启灵<select data-field="en">${Array.from({length:MAXEN+1},(_,i)=>`<option value="${i}"${i===v.en?' selected':''}>${ENLIGHT_TEXT(i)}</option>`).join('')}</select></label>
        <label>灵塑<select data-field="po">${Array.from({length:MAXPO+1},(_,i)=>`<option value="${i}"${i===v.po?' selected':''}>${i}${i===MAXPO?'（满）':''}</option>`).join('')}</select></label>
        <label>技能<select data-field="sk">${Array.from({length:MAXSK+1},(_,i)=>`<option value="${i}"${i===v.sk?' selected':''}>${i}${i===MAXSK?'（满）':''}</option>`).join('')}</select></label>
        <button type="button" class="boxDel" title="移除">×</button>
      </div>`);
    }
    host.innerHTML=out.join('');
  }
  function renderWheelList(){
    const host=$('boxWheelList');if(!host)return;
    const ids=Object.keys(boxData.wheels);
    const rows=ids.map(id=>wheelCatalog.find(w=>w.id===id)).filter(Boolean)
      .sort((a,b)=>REALM_ORDER.indexOf(a.realm)-REALM_ORDER.indexOf(b.realm)||String(a.name).localeCompare(String(b.name),'zh-CN'));
    host.innerHTML=`<div class="boxSectionTitle">命轮 <small>共 ${ids.length} 张 · 叠位 0–${MAXSTACK}</small><button type="button" class="boxBtn" id="boxAddWheel" style="margin-left:auto;padding:6px 10px">+ 添加命轮</button></div>`+
      (rows.length?rows.map(w=>{
        const st=boxData.wheels[w.id]?.stack??0;
        return `<div class="boxRow" data-wheel="${esc(w.id)}" style="grid-template-columns:42px minmax(88px,1fr) 110px 26px">
          ${w.icon?`<img src="${esc(w.icon)}" alt="" loading="lazy">`:`<div style="width:42px;height:42px;border-radius:9px;background:#0b1220"></div>`}
          <div class="bname">${esc(w.name)}<small>${esc(w.rarity||'')} · ${esc(realmZh(w.realm))}</small></div>
          <label>叠位<select data-wheel-field="stack" style="width:100%">${Array.from({length:MAXSTACK+1},(_,i)=>`<option value="${i}"${i===st?' selected':''}>${i===0?'0（本体）':i===MAXSTACK?i+'（满）':i}</option>`).join('')}</select></label>
          <button type="button" class="boxDel" title="移除">×</button>
        </div>`}).join(''):'<div class="boxEmpty">还没有命轮。可以「+ 添加命轮」，或用命轮截图识别叠位。</div>');
  }
  function updateSummary(){
    const s=$('boxSummary');if(s)s.textContent=`${ownedCount()} 名唤醒体 · ${wheelCount()} 张命轮`;
  }
  function renderAll(){renderRealmFilter();renderCharList();renderWheelList();updateSummary()}

  /* ---------------- 选择器 ---------------- */
  function openPicker(kind,onPick){
    const isWheel=kind==='wheel';
    const list=isWheel?wheelCatalog:chars;
    const wrap=document.createElement('div');wrap.className='boxPicker';
    wrap.innerHTML=`<div class="boxPickerCard"><div class="boxPickerHead"><input id="boxPickSearch" placeholder="${isWheel?'搜索命轮名':'搜索角色名 / 代号'}"><button type="button" class="boxBtn" id="boxPickClose">关闭</button></div><div class="boxPickGrid" id="boxPickGrid"></div></div>`;
    document.body.appendChild(wrap);
    const grid=wrap.querySelector('#boxPickGrid'),search=wrap.querySelector('#boxPickSearch');
    const draw=q=>{
      const kw=String(q||'').trim().toLowerCase();
      const rows=list.filter(x=>{
        const owned=isWheel?!!boxData.wheels[x.id]:!!boxData.chars[x.id];
        if(owned)return false;
        if(!kw)return true;
        return `${x.name} ${x.en||''} ${x.ingameId||''} ${x.rarity||''}`.toLowerCase().includes(kw);
      }).slice(0,120);
      grid.innerHTML=rows.map((x,i)=>`<button type="button" class="boxPickItem" data-i="${list.indexOf(x)}">
        <img src="${esc(isWheel?x.icon:x.portrait)}" alt="" loading="lazy"><span>${esc(x.name)}</span><small>${esc(isWheel?`${x.rarity||''} ${realmZh(x.realm)}`:(x.ingameId||''))}</small></button>`).join('')||'<div class="boxEmpty">没有可添加的了</div>';
    };
    draw('');
    search.addEventListener('input',()=>draw(search.value));
    search.focus();
    wrap.addEventListener('click',e=>{
      if(e.target===wrap){wrap.remove();return}
      const btn=e.target.closest('.boxPickItem');
      if(btn){const item=list[Number(btn.dataset.i)];onPick(item);wrap.remove();return}
      if(e.target.id==='boxPickClose')wrap.remove();
    });
  }

  /* ---------------- 导出 / 导入代码 ---------------- */
  function b64urlEncode(bytes){
    let s='';const chunk=0x8000;
    for(let i=0;i<bytes.length;i+=chunk)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+chunk));
    return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function b64urlDecode(str){
    const clean=str.replace(/-/g,'+').replace(/_/g,'/');
    const bin=atob(clean+'='.repeat((4-clean.length%4)%4));
    const out=new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
    return out;
  }
  function numId(id){const m=String(id).match(/(\d+)$/);return m?Number(m[1]):0}
  function idFromNum(n){return `awakener-${String(n).padStart(4,'0')}`}
  function wheelIdFromNum(n){return `wheel-${String(n).padStart(4,'0')}`}
  async function exportCode(){
    const payload={v:1,t:Math.round(Date.now()/1000),
      c:Object.keys(boxData.chars).map(id=>{const v=boxData.chars[id];return [numId(id),v.lv,v.en,v.po,v.sk]}),
      w:Object.keys(boxData.wheels).map(id=>[numId(id),boxData.wheels[id].stack||0])};
    const raw=new TextEncoder().encode(JSON.stringify(payload));
    let bytes=raw,prefix='MBOX1.';
    try{
      if(window.CompressionStream){
        const cs=new CompressionStream('gzip');
        const stream=new Blob([raw]).stream().pipeThrough(cs);
        bytes=new Uint8Array(await new Response(stream).arrayBuffer());
        prefix='MBOX2.';
      }
    }catch(e){bytes=raw;prefix='MBOX1.'}
    return prefix+b64urlEncode(bytes);
  }
  async function importCode(text){
    const s=String(text||'').trim().replace(/\s+/g,'');
    if(!s)throw new Error('代码为空');
    let bytes;
    if(s.startsWith('MBOX2.'))bytes=b64urlDecode(s.slice(6));
    else if(s.startsWith('MBOX1.'))bytes=b64urlDecode(s.slice(6));
    else if(/^[A-Za-z0-9_-]{16,}$/.test(s))bytes=b64urlDecode(s);
    else throw new Error('识别不到有效代码，请确认复制完整');
    let json;
    if(s.startsWith('MBOX2.')){
      if(!window.DecompressionStream)throw new Error('当前浏览器不支持解压，请换 Chrome / Edge');
      const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      json=await new Response(stream).text();
    }else json=new TextDecoder().decode(bytes);
    const data=JSON.parse(json);
    if(!Array.isArray(data.c))throw new Error('代码格式不正确');
    const charsIn={},wheelsIn={};
    for(const row of data.c){
      const id=idFromNum(row[0]);
      if(!charsById.has(id)&&!chars.some(c=>c.id===id))continue;
      charsIn[id]={lv:clamp(row[1],1,MAXLV),en:clamp(row[2],0,MAXEN),po:clamp(row[3],0,MAXPO),sk:clamp(row[4],0,MAXSK)};
    }
    for(const row of data.w||[]){const id=wheelIdFromNum(row[0]);wheelsIn[id]={stack:clamp(row[1],0,MAXSTACK)}}
    return {chars:charsIn,wheels:wheelsIn,ts:data.t};
  }
  function clamp(v,min,max){const n=Number(v);return Number.isFinite(n)?Math.max(min,Math.min(max,Math.round(n))):min}

  function showCodeDialog(mode){
    const wrap=document.createElement('div');wrap.className='boxPicker';
    wrap.innerHTML=`<div class="boxPickerCard" style="max-width:620px">
      <div class="boxPickerHead"><strong style="font-size:14px;color:#ead9b9">${mode==='export'?'导出 BOX 代码':'导入 BOX 代码'}</strong><button type="button" class="boxBtn" id="boxCodeClose" style="margin-left:auto">关闭</button></div>
      ${mode==='export'?'<div class="boxNotice">把这段代码存到备忘录/发给朋友即可。对方在「导入代码」里粘贴就能还原同一份 BOX。</div>':'<div class="boxNotice">粘贴别人分享的代码，会与当前 BOX 合并（同名角色以代码为准）。</div>'}
      <textarea class="boxText" id="boxCodeText" spellcheck="false" ${mode==='export'?'readonly':''} placeholder="MBOX2.…"></textarea>
      <div class="boxToolbar"><button type="button" class="boxBtn primary" id="boxCodeAction">${mode==='export'?'复制代码':'导入并合并'}</button><span class="boxChip" id="boxCodeMsg" style="cursor:default"></span></div>
    </div>`;
    document.body.appendChild(wrap);
    const ta=wrap.querySelector('#boxCodeText'),msg=wrap.querySelector('#boxCodeMsg');
    wrap.addEventListener('click',e=>{if(e.target===wrap||e.target.id==='boxCodeClose')wrap.remove()});
    if(mode==='export'){
      exportCode().then(code=>{ta.value=code}).catch(e=>{msg.textContent='生成失败：'+e.message});
    }
    wrap.querySelector('#boxCodeAction').addEventListener('click',async()=>{
      if(mode==='export'){
        try{await navigator.clipboard.writeText(ta.value);msg.textContent='已复制到剪贴板'}
        catch(e){ta.select();msg.textContent='请手动 Ctrl+C 复制'}
        return;
      }
      try{
        const res=await importCode(ta.value);
        Object.assign(boxData.chars,res.chars);Object.assign(boxData.wheels,res.wheels);
        saveBox();renderAll();
        msg.textContent=`已导入 ${Object.keys(res.chars).length} 名唤醒体 / ${Object.keys(res.wheels).length} 张命轮`;
        setTimeout(()=>wrap.remove(),900);
      }catch(e){msg.textContent='导入失败：'+e.message}
    });
  }

  /* ---------------- 长图 ---------------- */
  const POSTER={W:1080,PAD:44,GRIDX:48,CELLW:200,CELLH:296,CARDW:184,CARDH:280,COLS:5,
    WCELLW:166,WCELLH:126,WIMG_H:97,WIMG_W:48,WR:6,LABEL:46,SEC:30,SUB:30,FOOT:54};
  function imgCover(ctx,im,x,y,w,h){
    if(!im||!im.width||!im.height)return;
    const ir=im.width/im.height,br=w/h;
    let sw=im.width,sh=im.height,sx=0,sy=0;
    if(ir>br){sw=im.height*br;sx=(im.width-sw)/2}else{sh=im.width/br;sy=(im.height-sh)/2}
    ctx.drawImage(im,sx,sy,sw,sh,x,y,w,h);
  }
  async function buildPoster(){
    const P=POSTER,W=P.W,PAD=P.PAD,H0=178;
    const hasW=id=>Object.prototype.hasOwnProperty.call(boxData.wheels,id);
    const groups=WHEEL_REALMS.map(r=>({realm:r,name:realmZh(r),
      chars:Object.keys(boxData.chars).map(id=>charsById.get(id)).filter(c=>c&&c.realm===r)
        .sort((a,b)=>String(a.name).localeCompare(String(b.name),'zh-CN')),
      wheels:wheelCatalog.filter(w=>w.realm===r&&hasW(w.id))
        .sort((a,b)=>String(a.name).localeCompare(String(b.name),'zh-CN'))}));
    const wgroups=groups.filter(g=>g.wheels.length);
    const nWheel=wgroups.reduce((n,g)=>n+g.wheels.length,0);
    let h=H0;
    for(const g of groups)if(g.chars.length)h+=P.LABEL+Math.ceil(g.chars.length/P.COLS)*P.CELLH+P.SEC;
    if(wgroups.length){h+=P.LABEL+P.SEC;for(const g of wgroups)h+=P.SUB+Math.ceil(g.wheels.length/P.WR)*P.WCELLH+8}
    h+=P.FOOT;
    const canvas=document.createElement('canvas');canvas.width=W;canvas.height=h;
    const ctx=canvas.getContext('2d');
    const bg=ctx.createLinearGradient(0,0,0,h);
    bg.addColorStop(0,'#101724');bg.addColorStop(.5,'#0c1220');bg.addColorStop(1,'#080d16');
    ctx.fillStyle=bg;ctx.fillRect(0,0,W,h);
    ctx.fillStyle='rgba(224,189,130,.09)';ctx.beginPath();ctx.arc(W-40,40,220,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#f2e2c4';ctx.font='900 46px "STKaiti","KaiTi","Noto Serif SC",serif';ctx.fillText('我的唤醒体 BOX',PAD,92);
    ctx.fillStyle='#8b98ab';ctx.font='400 18px system-ui';
    ctx.fillText(`忘忘看报 · 定制配队推荐 · ${new Date().toLocaleDateString('zh-CN')} · ${ownedCount()} 名唤醒体 / ${wheelCount()} 张命轮`,PAD,124);
    ctx.strokeStyle='rgba(224,189,130,.28)';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(PAD,150);ctx.lineTo(W-PAD,150);ctx.stroke();
    const imgs=new Map();
    const loadImg=src=>new Promise(res=>{
      if(!src)return res(null);
      if(imgs.has(src))return res(imgs.get(src));
      const im=new Image();
      im.onload=()=>{imgs.set(src,im);res(im)};
      im.onerror=()=>res(null);
      im.src=src;
    });
    const need=[];
    for(const g of groups)for(const c of g.chars)need.push(loadImg(c.portrait));
    for(const g of wgroups)for(const w of g.wheels)need.push(loadImg(w.icon));
    await Promise.all(need);
    let y=H0;
    const label=(txt,extra)=>{
      ctx.fillStyle='#ead9b9';ctx.font='900 26px "STKaiti","KaiTi",serif';ctx.fillText(txt,PAD,y+26);
      if(extra){const w=ctx.measureText(txt).width;
        ctx.fillStyle='#7f8da1';ctx.font='400 15px system-ui';ctx.fillText(extra,PAD+w+14,y+25)}
    };
    for(const g of groups){
      if(!g.chars.length)continue;
      label(g.name,`${g.chars.length} 名`);
      y+=P.LABEL;
      g.chars.forEach((c,i)=>{
        const x=P.GRIDX+(i%P.COLS)*P.CELLW,yy=y+Math.floor(i/P.COLS)*P.CELLH;
        ctx.fillStyle='rgba(255,255,255,.035)';roundRect(ctx,x,yy,P.CARDW,P.CARDH,14);ctx.fill();
        ctx.strokeStyle='rgba(148,163,184,.16)';ctx.lineWidth=1;ctx.stroke();
        const im=imgs.get(c.portrait);
        if(im){ctx.save();roundRect(ctx,x+0.5,yy+0.5,P.CARDW-1,P.CARDW-1,13);ctx.clip();
          imgCover(ctx,im,x+0.5,yy+0.5,P.CARDW-1,P.CARDW-1);ctx.restore()}
        else{ctx.fillStyle='rgba(255,255,255,.04)';roundRect(ctx,x+0.5,yy+0.5,P.CARDW-1,P.CARDW-1,13);ctx.fill()}
        const v=boxData.chars[c.id];
        ctx.fillStyle='#eef2f7';ctx.font='800 19px system-ui';ctx.fillText(clip(ctx,c.name,P.CARDW-20),x+10,yy+212);
        ctx.fillStyle='#9fa9ba';ctx.font='400 15px system-ui';
        ctx.fillText(`Lv.${v.lv} · ${ENLIGHT_TEXT(v.en)}`,x+10,yy+238);
        ctx.fillStyle='#7f8da1';ctx.font='400 14px system-ui';
        ctx.fillText(v.po>=MAXPO&&v.sk>=MAXSK?'灵塑满 · 技能满':`灵塑 ${v.po} · 技能 ${v.sk}`,x+10,yy+260);
      });
      y+=Math.ceil(g.chars.length/P.COLS)*P.CELLH+P.SEC;
    }
    if(wgroups.length){
      label('命轮',`${nWheel} 张`);
      y+=P.LABEL;
      for(const g of wgroups){
        ctx.fillStyle='#9fb0c6';ctx.font='700 17px system-ui';ctx.fillText(g.name,P.GRIDX,y+18);
        const nw=ctx.measureText(g.name).width;
        ctx.fillStyle='#6f7d91';ctx.font='400 13px system-ui';ctx.fillText(`${g.wheels.length} 张`,P.GRIDX+nw+10,y+18);
        y+=P.SUB;
        g.wheels.forEach((w,i)=>{
          const x=P.GRIDX+(i%P.WR)*P.WCELLW,yy=y+Math.floor(i/P.WR)*P.WCELLH;
          const im=imgs.get(w.icon);
          if(im){ctx.save();roundRect(ctx,x,yy+4,P.WIMG_W,P.WIMG_H,8);ctx.clip();
            imgCover(ctx,im,x,yy+4,P.WIMG_W,P.WIMG_H);ctx.restore()}
          else{ctx.fillStyle='rgba(255,255,255,.05)';roundRect(ctx,x,yy+4,P.WIMG_W,P.WIMG_H,8);ctx.fill()}
          const st=boxData.wheels[w.id]?.stack||0,tx=x+P.WIMG_W+10;
          ctx.fillStyle='#e7edf5';ctx.font='700 14px system-ui';
          ctx.fillText(clip(ctx,w.name,P.WCELLW-P.WIMG_W-16),tx,yy+32);
          ctx.fillStyle=st>=4?'#e8c07a':'#9fa9ba';ctx.font='800 14px system-ui';ctx.fillText(`叠位 ${st}`,tx,yy+54);
          ctx.fillStyle='#6f7d91';ctx.font='400 12px system-ui';ctx.fillText(String(w.rarity||''),tx,yy+74);
        });
        y+=Math.ceil(g.wheels.length/P.WR)*P.WCELLH+8;
      }
    }
    ctx.fillStyle='#6b7688';ctx.font='400 14px system-ui';
    ctx.fillText('忘忘看报 · 粉丝向免费工具 · 数据只存在本机浏览器 · 以游戏内实际数值为准',PAD,h-32);
    return canvas;
  }
  function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
  function clip(ctx,text,max){let s=String(text||'');if(ctx.measureText(s).width<=max)return s;while(s.length>1&&ctx.measureText(s+'…').width>max)s=s.slice(0,-1);return s+'…'}

  /* ---------------- 赛季数据 ---------------- */
  function getManifest(){
    if(!manifestPromise)manifestPromise=fetchJson('data/morimens/eremora/manifest.json','manifest').catch(e=>{manifestPromise=null;throw e});
    return manifestPromise;
  }
  async function loadSeasonTeams(seasonId){
    if(seasonCache.has(seasonId))return seasonCache.get(seasonId);
    const manifest=await getManifest();
    const entry=(manifest.availableSeasons||[]).find(s=>String(s.seasonId)===String(seasonId));
    if(!entry)throw new Error(`第 ${seasonId} 期没有快照`);
    // 分块压缩快照（usage/<id>-local-gzip）体积小、格式统一，优先用它；
    // 早期几期只有整包 JSON，动辄几十上百 MB，浏览器带不动，留作兜底。
    const teams=[];
    // 站点自带的加载器认得 gzip-base64-chunked-v1 / v2（v2 是表池压缩），优先用它
    const loader=window.MorimensDtideDataLoader;
    if(loader&&typeof loader.loadDataset==='function'){
      try{
        const data=await loader.loadDataset(entry.path||`data/morimens/eremora/usage/${seasonId}-local-gzip/index.json`);
        extractTeams(data,teams);
        if(teams.length){
          const hit={seasonId:Number(seasonId),teams,recordCount:teams.length};
          seasonCache.set(seasonId,hit);
          if(seasonCache.size>2)seasonCache.delete([...seasonCache.keys()][0]);
          return hit;
        }
      }catch(e){console.warn('box: loader failed, fallback to v1',e)}
    }
    let idx=null;
    const paths=[`data/morimens/eremora/usage/${seasonId}-local-gzip/index.json`,entry.path].filter(Boolean);
    for(const pth of paths){
      try{
        const j=await fetchJson(pth,'season index');
        if(j&&j.format==='gzip-base64-chunked-v1'&&Array.isArray(j.chunks)){idx=j;break}
      }catch(e){}
    }
    if(!idx)throw new Error(`第 ${seasonId} 期没有可分块读取的快照`);
    if(idx.format==='gzip-base64-chunked-v1'){
      const parts=await Promise.all(idx.chunks.map(async p=>{
        const r=await fetch(p,{cache:'force-cache'});if(!r.ok)throw new Error(`${p}: HTTP ${r.status}`);
        return b64urlDecode((await r.text()).replace(/\s+/g,''));
      }));
      const total=parts.reduce((n,x)=>n+x.length,0),bytes=new Uint8Array(total);
      let off=0;for(const p of parts){bytes.set(p,off);off+=p.length}
      const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
      const data=JSON.parse(await new Response(stream).text());
      extractTeams(data,teams);
    }else{
      throw new Error('该期快照格式暂不支持');
    }
    const result={seasonId:Number(seasonId),teams,recordCount:teams.length};
    seasonCache.set(seasonId,result);
    if(seasonCache.size>2)seasonCache.delete([...seasonCache.keys()][0]);
    return result;
  }
  function extractTeams(data,out){
    for(const rec of data.records||[]){
      for(const w of rec.waves||[]){
        for(const t of w.teams||[]){
          const members=(t.members||[]).map(m=>{
            // v1 快照给 skeydbId；v2 只给 ingameId（C02EX 这种），要反查回 skeydbId
            const ingame=m.ingameId?String(m.ingameId):'';
            const id=m.skeydbId||idByIngame.get(ingame)||null;
            // v2 用 potencyLevel 表示启灵（0-3 是 N 启，4 超限，5-15 超限+N）
            const en=m.potencyLevel!=null?clamp(m.potencyLevel,0,MAXEN):(m.enlightenLevel??3);
            return {
              id,ingameId:m.ingameId||null,name:m.canonicalName||m.name||'',
              lv:m.level??null,en,borrow:!!m.borrowed,
              wheels:(m.wheels||[]).map(x=>x.name).filter(Boolean)
            };
          });
          if(members.length<4)continue;
          out.push({
            wave:Number(w.wave)||0,score:Number(t.score)||0,rank:Number(rec.rank)||null,player:rec.player||'',url:rec.url||'',
            difficulty:t.difficultyLabel||t.difficulty||(t.stageName||'').split(':').pop().trim(),clearType:t.clearType||'clear',
            token:t.token?.name||'',members
          });
        }
      }
    }
  }

  /* ---------------- 推荐算法 ---------------- */
  function enScore(en){
    // 启灵换算成 eremora 的 0-5 档，用于和记录比较
    const n=Number(en)||0;
    if(n<=3)return n;
    if(n<15)return 4;
    return 5;
  }
  function fitOf(member,box,borrowPool){
    const own=box.chars[member.id];
    if(!own)return {owned:false,borrowable:!!member.borrow};
    const needLv=Number(member.lv)||MAXLV;
    const needEn=enScore(member.en);
    const lvGap=Math.max(0,needLv-own.lv);
    const enGap=Math.max(0,needEn-enScore(own.en));
    return {owned:true,lvGap,enGap,needLv,needEn,own};
  }
  function evalTeam(team,box,mode){
    const gaps=[];let penalty=0,missing=0;
    for(const m of team.members){
      const fit=fitOf(m,box);
      if(!fit.owned){
        // 记录里标了借用助战的格子可以直接借；否则算缺人
        if(m.borrow){missing++;penalty+=0.05;gaps.push({id:m.id,type:'borrow'});continue}
        missing++;
        penalty+=0.16;
        gaps.push({id:m.id,type:'missing'});
        continue;
      }
      const lvTol=mode==='strict'?0:mode==='normal'?12:25;
      const enTol=mode==='strict'?0:mode==='normal'?1:2;
      penalty+=Math.max(0,fit.lvGap-lvTol)*0.012;
      penalty+=Math.max(0,fit.enGap-enTol)*0.09;
      if(fit.lvGap>lvTol)penalty+=(fit.lvGap-lvTol)*0.006;
      if(fit.enGap>enTol)penalty+=(fit.enGap-enTol)*0.05;
      if(fit.lvGap>lvTol||fit.enGap>enTol)gaps.push({id:m.id,type:'gap',lvGap:fit.lvGap,enGap:fit.enGap});
    }
    const pred=Math.max(0,team.score*(1-Math.min(0.6,penalty)));
    return {pred,penalty,gaps,missing};
  }
  function allocate(target,caps){
    const total=caps.reduce((a,b)=>a+b,0)||1;
    const raw=caps.map(c=>target*c/total);
    const out=raw.map(v=>Math.round(v));
    let diff=target-out.reduce((a,b)=>a+b,0);
    let i=0;while(diff!==0&&i<200){const k=i%out.length;if(diff>0){out[k]++;diff--}else if(out[k]>0){out[k]--;diff++}i++}
    return out;
  }
  function signature(team){return team.members.map(m=>m.id||m.name).sort().join(',')}
  async function runPlan(){
    const status=$('boxPlanStatus'),host=$('boxPlanResult');
    if(!dataReady){toast('角色数据还没载入完');return}
    if(!ownedCount()){host.innerHTML='<div class="boxEmpty">BOX 还是空的，先去「我的 BOX」录入，或用截图识别导入。</div>';return}
    const season=Number($('boxPlanSeason').value||69);
    const target=Math.max(0,Math.min(525,Number($('boxPlanTarget').value||525)));
    const rankCap=Number($('boxPlanRank').value||0);
    const mode=$('boxPlanMode').value||'normal';
    status.textContent='正在载入赛季记录…';
    try{
      const data=await loadSeasonTeams(season);
      status.textContent=`第 ${season} 期 · ${data.teams.length} 支队伍记录`;
      const waves=[...new Set(data.teams.map(t=>t.wave))].filter(Boolean).sort((a,b)=>a-b);
      const caps=waves.map(w=>Math.max(...data.teams.filter(t=>t.wave===w).map(t=>t.score),1));
      const targets=allocate(target,caps);
      const plans=[];
      for(const w of waves){
        const rows=data.teams.filter(t=>t.wave===w&&(!rankCap||!t.rank||t.rank<=rankCap));
        const dedup=new Map();
        for(const t of rows){
          const k=signature(t),old=dedup.get(k);
          if(!old||t.score>old.score)dedup.set(k,t);
        }
        const idx=waves.indexOf(w);
        const evaluated=[...dedup.values()].map(t=>({team:t,...evalTeam(t,boxData,mode)}))
          .filter(x=>x.missing<=1&&x.penalty<0.85)
          .sort((a,b)=>b.pred-a.pred||(a.team.rank||9999)-(b.team.rank||9999))
          .slice(0,40);
        const meet=evaluated.filter(x=>x.pred>=targets[idx]);
        const pick=(meet.length?meet:evaluated)[0]||null;
        plans.push({wave:w,target:targets[idx],cap:caps[idx],pick,alts:evaluated.filter(x=>x!==pick).slice(0,3)});
      }
      renderPlan(plans,target,season);
    }catch(e){
      console.error(e);status.textContent='生成失败';host.innerHTML=`<div class="boxNotice bad">${esc(e.message||e)}</div>`;
    }
  }
  function memberCard(m,idx){
    const c=m.id?charsById.get(m.id):null;
    const fit=fitOf(m,boxData);
    const lvTxt=m.lv!=null?`Lv.${m.lv}`:'Lv.—';
    const enTxt=m.en!=null?ENLIGHT_TEXT(enScore(m.en)===4?4:enScore(m.en)):'';
    let tag='';
    if(!fit.owned)tag=`<small class="${m.borrow?'warnTag':'missTag'}">${m.borrow?'可借用（记录中为助战）':'BOX 中没有'}</small>`;
    else if(fit.lvGap||fit.enGap)tag=`<small class="warnTag">差 ${fit.lvGap?`${fit.lvGap} 级`:''}${fit.lvGap&&fit.enGap?' / ':''}${fit.enGap?`${fit.enGap} 档启灵`:''}</small>`;
    return `<div class="boxMember">${c?.portrait?`<img src="${esc(c.portrait)}" alt="" loading="lazy">`:''}
      <div style="min-width:0"><b>${esc(c?.name||m.name||m.id)}</b><small>${lvTxt}${enTxt?' · '+enTxt:''}</small>
      ${m.wheels?.length?`<small>${esc(m.wheels.slice(0,2).map(wheelNameByEn).join(' / '))}</small>`:''}${tag}</div></div>`;
  }
  function renderPlan(plans,target,season){
    const host=$('boxPlanResult');
    const total=plans.reduce((s,p)=>s+(p.pick?.pred||0),0);
    const gap=target-total;
    host.innerHTML=`
      <div class="boxStatRow">
        <div class="boxStat"><small>目标总分</small><strong>${target}</strong></div>
        <div class="boxStat"><small>预计总分</small><strong style="color:${gap>0?'#d7a85b':'#7fd8a5'}">${Math.round(total)}</strong></div>
        <div class="boxStat"><small>BOX 规模</small><strong>${ownedCount()} 人 / ${wheelCount()} 轮</strong></div>
        <div class="boxStat"><small>参考期次</small><strong>第 ${season} 期</strong></div>
      </div>
      ${gap>0?`<div class="boxNotice">按当前 box 与公开记录，预计差 <b>${Math.round(gap)} 分</b>。可以把目标调低，或先补练推荐阵容里标注“差 X 级 / 差 X 档启灵”的角色。</div>`:`<div class="boxNotice">预计可以达到目标分，留有余量 ${Math.round(-gap)} 分。</div>`}
      ${plans.map(p=>p.pick?`
        <div class="boxWave">
          <div class="boxWaveHead">
            <div><b>第 ${p.wave} 区</b> <span>目标 ${p.target} 分 · 该区上限 ${p.cap}</span></div>
            <div><span>参考 ${p.pick.team.score} 分 · 预计 ${Math.round(p.pick.pred)} 分 · ${esc(p.pick.team.difficulty||'')}${p.pick.team.rank?` · 原榜 #${p.pick.team.rank}`:''}</span></div>
          </div>
          <div class="boxWaveMembers">${p.pick.team.members.map((m,i)=>memberCard(m,i)).join('')}</div>
          <div class="boxAlt">命轮位：${esc(p.pick.team.members.map(m=>m.wheels?.[0]?wheelNameByEn(m.wheels[0]):'—').join(' / '))}
            ${p.pick.team.url?` · <a href="${esc(p.pick.team.url)}" target="_blank" rel="noopener noreferrer">查看原通关记录</a>`:''}
            ${p.pick.team.player?` · 记录者 ${esc(p.pick.team.player)}`:''}</div>
          ${p.alts.length?`<div class="boxAlt">备选：${p.alts.map(a=>`<a href="${esc(a.team.url)}" target="_blank" rel="noopener noreferrer">${Math.round(a.pred)} 分（${esc(a.team.difficulty||'')}${a.team.rank?` #${a.team.rank}`:''}）</a>`).join(' · ')}</div>`:''}
        </div>`:`
        <div class="boxWave">
          <div class="boxWaveHead">
            <div><b>第 ${p.wave} 区</b> <span>目标 ${p.target} 分 · 该区上限 ${p.cap||'—'}</span></div>
            <div><span>这区没有凑得齐的阵容</span></div>
          </div>
          <div class="boxAlt">BOX 里能上这一区的角色不够（或缺关键位）。可以先补角色，或者去「融灾榜单」看看这区的高分阵容需要谁。</div>
        </div>`).join('')}
      <div class="boxNotice">推荐逻辑：从公开融灾记录里挑与你 box 匹配度最高的队伍，按等级/启灵差距折算预计得分；差得越多扣得越多。记录里的助战位可以直接借，所以标了“可借用”的格子不算缺人。</div>
    `;
  }

  /* ---------------- 事件 ---------------- */
  function bindEvents(){
    if(!panel)return;
    panel.addEventListener('click',e=>{
      const tab=e.target.closest('[data-box-tab]');
      if(tab){selectSubTab(tab.dataset.boxTab);return}
      const realm=e.target.closest('[data-realm]');
      if(realm){realmFilter=realm.dataset.realm;renderRealmFilter();renderCharList();return}
      const del=e.target.closest('.boxDel');
      if(del){const row=del.closest('[data-id]'),wrow=del.closest('[data-wheel]');
        if(row){delChar(row.dataset.id);renderAll()}
        else if(wrow){delete boxData.wheels[wrow.dataset.wheel];saveBox();renderAll()}
        return}
      const id=e.target.id;
      if(id==='boxAddChar'){openPicker('char',item=>{addChar(item.id);renderAll()});return}
      if(id==='boxAddWheel'){openPicker('wheel',item=>{boxData.wheels[item.id]={stack:0};saveBox();renderAll()});return}
      if(id==='boxFillMax'){fillMax();return}
      if(id==='boxExportCode'){showCodeDialog('export');return}
      if(id==='boxImportCode'){showCodeDialog('import');return}
      if(id==='boxPoster'){poster();return}
      if(id==='boxOcrRun'){runOcr();return}
      if(id==='boxOcrClear'){ocrFiles.length=0;renderThumbs();return}
      if(id==='boxPlanRun'){runPlan();return}
      if(id==='boxOcrApply'){applyOcr();return}
      const preset=e.target.closest('[data-target]');
      if(preset){$('boxPlanTarget').value=preset.dataset.target;return}
    });
    panel.addEventListener('change',e=>{
      const row=e.target.closest('[data-id]');
      if(row&&e.target.dataset.field){const id=row.dataset.id,f=e.target.dataset.field;
        const v=f==='lv'?clamp(e.target.value,1,MAXLV):Number(e.target.value);
        setChar(id,{[f]:v});return}
      const wrow=e.target.closest('[data-wheel]');
      if(wrow&&e.target.dataset.wheelField){boxData.wheels[wrow.dataset.wheel]={stack:Number(e.target.value)};saveBox();return}
      if(e.target.id==='boxDrop'){return}
    });
    panel.addEventListener('input',e=>{
      const row=e.target.closest('[data-id]');
      if(row&&e.target.dataset.field==='lv'){
        const v=clamp(e.target.value,1,MAXLV);boxData.chars[row.dataset.id]={...boxData.chars[row.dataset.id],lv:v};saveBox();
      }
    });
    panel.querySelector('#boxDrop')?.addEventListener('click',()=>$('boxFiles').click());
    panel.querySelector('#boxFiles')?.addEventListener('change',e=>{addFiles([...e.target.files||[]]);e.target.value=''});
    const drop=panel.querySelector('#boxDrop');
    ['dragenter','dragover'].forEach(t=>drop?.addEventListener(t,e=>{e.preventDefault();drop.classList.add('over')}));
    ['dragleave','drop'].forEach(t=>drop?.addEventListener(t,e=>{e.preventDefault();drop.classList.remove('over')}));
    drop?.addEventListener('drop',e=>addFiles([...(e.dataTransfer?.files||[])]));
    documentedPaste();
  }
  function documentedPaste(){
    document.addEventListener('paste',e=>{
      if(!$('boxTabOcr')||$('boxTabOcr').hidden)return;
      const items=[...(e.clipboardData?.items||[])].filter(x=>x.type.startsWith('image/'));
      if(!items.length)return;
      e.preventDefault();
      addFiles(items.map((x,i)=>new File([x.getAsFile()],`paste-${Date.now()}-${i}.png`,{type:x.type})));
    });
  }
  function fillMax(){
    const ids=Object.keys(boxData.chars).filter(id=>realmFilter==='all'||charsById.get(id)?.realm===realmFilter);
    if(!ids.length){toast('没有可设置的角色');return}
    for(const id of ids)boxData.chars[id]={lv:MAXLV,en:Math.max(3,boxData.chars[id].en||0),po:MAXPO,sk:MAXSK};
    saveBox();renderAll();toast(`已把 ${ids.length} 名角色设为满级满灵塑满技能`);
  }
  async function poster(){
    if(!ownedCount()){toast('BOX 还是空的');return}
    toast('正在生成长图…');
    try{
      const canvas=await buildPoster();
      canvas.toBlob(b=>{
        const a=document.createElement('a');a.href=URL.createObjectURL(b);
        a.download=`忘忘看报-BOX-${new Date().toISOString().slice(0,10)}.png`;a.click();
        setTimeout(()=>URL.revokeObjectURL(a.href),4000);
      },'image/png');
    }catch(e){console.error(e);toast('生成失败：'+e.message)}
  }

  /* ---------------- 截图识别 ---------------- */
  let ocrFiles=[],ocrRows=[];
  function addFiles(files){
    const imgs=files.filter(f=>f&&/^image\//.test(f.type||''));
    if(!imgs.length){toast('没有识别到图片');return}
    const room=5-ocrFiles.length;
    if(room<=0){toast('一次最多 5 张，先识别或清空再补充');return}
    ocrFiles.push(...imgs.slice(0,room));
    if(imgs.length>room)toast(`只收了前 ${room} 张（上限 5 张）`);
    renderThumbs();
  }
  function renderThumbs(){
    const host=$('boxThumbs');if(!host)return;
    host.innerHTML=ocrFiles.map((f,i)=>`<div class="boxThumb"><img src="${URL.createObjectURL(f)}" alt=""><button type="button" data-thumb="${i}">×</button><small>${(f.size/1024).toFixed(0)} KB</small></div>`).join('');
    host.querySelectorAll('[data-thumb]').forEach(b=>b.addEventListener('click',()=>{ocrFiles.splice(Number(b.dataset.thumb),1);renderThumbs()}));
    $('boxOcrStatus').textContent=ocrFiles.length?`已选 ${ocrFiles.length} / 5 张`:'等待图片';
  }
  async function runOcr(){
    if(!ocrFiles.length){toast('先选几张截图');return}
    const ocr=window.MorimensBoxOCR;
    if(!ocr){toast('识别模块未加载，请刷新页面');return}
    const status=$('boxOcrStatus'),mode=$('boxOcrMode').value;
    status.textContent='准备识别…';
    try{
      const res=await ocr.analyzeFiles(ocrFiles,{mode,onProgress:t=>{status.textContent=t}});
      ocrRows=res.rows||[];
      renderOcrResult(res);
      status.textContent=`识别完成：${ocrRows.length} 条`;
    }catch(e){
      console.error(e);status.textContent='识别失败';
      $('boxOcrResult').innerHTML=`<div class="boxNotice bad">${esc(e.message||e)}</div>`;
    }
  }
  function renderOcrResult(res){
    const host=$('boxOcrResult');
    const globalWheel=$('boxOcrMode').value==='wheel';
    const isWheelRow=r=>r.kind?r.kind==='wheel':globalWheel;
    if(!ocrRows.length){host.innerHTML='<div class="boxNotice">没认出内容。可以试试：只截列表区域、避免缩放、确保文字清晰。</div>';return}
    const missLv=ocrRows.filter(r=>!isWheelRow(r)&&r.lv==null).length;
    // 最后一行常被屏幕边缘裁掉，等级数字只露出上半截，读不出来是正常的——
    // 与其猜个错数字，不如明确告诉用户往下滚一点再截一张
    const missWarn=missLv?`<div class="boxNotice">有 ${missLv} 张没读出等级（最后一排被屏幕裁掉时最常见，数字下半截会糊掉），导入后可以手动补；也可以往下滚动一点再截一张补上。</div>`:'';
    host.innerHTML=`<div class="boxSectionTitle">识别结果 <small>${res.note||'请核对后导入'}</small></div>`+missWarn+
      ocrRows.map((r,i)=>{
        if(isWheelRow(r)){
          const w=wheelCatalog.find(x=>x.id===r.id);
          const cands=(r.options||[]).map(o=>wheelCatalog.find(x=>x.id===o.id)).filter(Boolean);
          if(r.id&&!cands.some(c=>c.id===r.id)){const cur=wheelCatalog.find(x=>x.id===r.id);if(cur)cands.unshift(cur)}
          return `<div class="boxOcrRow ${r.score>0.62?'':'low'}" data-row="${i}">
            ${w?.icon?`<img src="${esc(w.icon)}" alt="">`:'<div style="width:42px;height:42px;border-radius:8px;background:#0b1220"></div>'}
            <select data-row-wheel="${i}">${cands.map(c=>`<option value="${c.id}"${c.id===r.id?' selected':''}>${esc(c.name)}</option>`).join('')}</select>
            <label class="boxField" style="font-size:9px">叠位<select data-row-stack="${i}">${Array.from({length:MAXSTACK+1},(_,k)=>`<option value="${k}"${k===r.stack?' selected':''}>${k}</option>`).join('')}</select></label>
            <span class="boxScore ${r.score>0.62?'ok':r.score>0.5?'warn':'bad'}">${pct(r.score)}</span>
            <button type="button" class="boxDel" data-row-del="${i}">×</button>
          </div>`;
        }
        const opts=(r.options||[]).map(o=>charsById.get(o.id)).filter(Boolean);
        const hit=charsById.get(r.id);
        return `<div class="boxOcrRow ${r.score>0.62?'':'low'}" data-row="${i}">
          ${hit?.portrait?`<img src="${esc(hit.portrait)}" alt="">`:'<div style="width:42px;height:42px;border-radius:8px;background:#0b1220"></div>'}
          <select data-row-char="${i}">${opts.map(c=>`<option value="${c.id}"${c.id===r.id?' selected':''}>${esc(c.name)}${c.ingameId?' · '+esc(c.ingameId):''}</option>`).join('')}${hit&&!opts.some(o=>o.id===r.id)?`<option value="${r.id}" selected>${esc(hit.name)}</option>`:''}</select>
          <label class="boxField" style="font-size:9px">等级<input type="number" min="1" max="90" value="${r.lv||''}" data-row-lv="${i}" style="width:100%"></label>
          <label class="boxField" style="font-size:9px"${r.enLow?' title="没读出启灵数字，先按 0 启，请核对"':''}>启灵${r.enLow?'?':''}<select data-row-en="${i}">${Array.from({length:MAXEN+1},(_,k)=>`<option value="${k}"${k===(r.en||0)?' selected':''}>${ENLIGHT_TEXT(k)}</option>`).join('')}</select></label>
          <span class="boxScore ${r.score>0.62?'ok':r.score>0.5?'warn':'bad'}">${pct(r.score)}</span>
        </div>`;
      }).join('')+
      `<div class="boxToolbar"><button type="button" class="boxBtn primary" id="boxOcrApply">导入到 BOX</button>
        <button type="button" class="boxBtn" data-row-del-all="1">全部丢弃</button>
        <span class="boxChip" style="cursor:default">低置信度的行会标灰，点开下拉可以改</span></div>`;
    host.querySelectorAll('[data-row-char]').forEach(sel=>sel.addEventListener('change',()=>{ocrRows[Number(sel.dataset.rowChar)].id=sel.value}));
    host.querySelectorAll('[data-row-lv]').forEach(inp=>inp.addEventListener('input',()=>{ocrRows[Number(inp.dataset.rowLv)].lv=clamp(inp.value,1,90)}));
    host.querySelectorAll('[data-row-en]').forEach(sel=>sel.addEventListener('change',()=>{ocrRows[Number(sel.dataset.rowEn)].en=Number(sel.value)}));
    host.querySelectorAll('[data-row-stack]').forEach(sel=>sel.addEventListener('change',()=>{ocrRows[Number(sel.dataset.rowStack)].stack=Number(sel.value)}));
    host.querySelectorAll('[data-row-wheel]').forEach(sel=>sel.addEventListener('change',()=>{
      const i=Number(sel.dataset.rowWheel);ocrRows[i].id=sel.value;
      const row=host.querySelector(`.boxOcrRow[data-row="${i}"] img`);
      const cur=wheelCatalog.find(x=>x.id===sel.value);
      if(row&&cur?.icon)row.src=cur.icon;
    }));
    host.querySelectorAll('[data-row-del]').forEach(b=>b.addEventListener('click',()=>{ocrRows.splice(Number(b.dataset.rowDel),1);renderOcrResult({note:'已手动删除一条'})}));
    host.querySelector('[data-row-del-all]')?.addEventListener('click',()=>{ocrRows=[];host.innerHTML='<div class="boxNotice">已丢弃本次识别结果。</div>'});
  }
  function applyOcr(){
    const globalWheel=$('boxOcrMode').value==='wheel';
    let n=0;
    for(const r of ocrRows){
      if(r.kind?r.kind==='wheel':globalWheel){
        if(!r.id)continue;
        const cur=boxData.wheels[r.id];
        if(!cur||r.stack>cur.stack)boxData.wheels[r.id]={stack:r.stack};
        n++;
      }else{
        if(!r.id||!charsById.has(r.id))continue;
        const cur=boxData.chars[r.id];
        if(!cur){boxData.chars[r.id]={lv:r.lv||MAXLV,en:r.en??3,po:MAXPO,sk:MAXSK};n++}
        else{boxData.chars[r.id]={...cur,lv:r.lv||cur.lv,en:r.en??cur.en};n++}
      }
    }
    saveBox();renderAll();toast(`已写入 ${n} 条`);
    selectSubTab('roster');
  }

  /* ---------------- 子页切换 ---------------- */
  function selectSubTab(name){
    if(!panel)return;
    for(const b of panel.querySelectorAll('[data-box-tab]'))b.setAttribute('aria-selected',String(b.dataset.boxTab===name));
    const map={roster:'boxTabRoster',ocr:'boxTabOcr',plan:'boxTabPlan'};
    for(const k in map){const el=$(map[k]);if(el)el.hidden=k!==name}
    if(name==='plan'&&$('boxPlanSeason')&&!$('boxPlanSeason').options.length)initPlanSeasons();
  }
  async function initPlanSeasons(){
    try{
      const m=await getManifest();
      const seen=new Set();
      const rows=(m.availableSeasons||[]).filter(x=>{
        const id=String(x.seasonId);
        if(!/^\d+$/.test(id)||seen.has(id))return false;
        seen.add(id);return true;
      }).sort((a,b)=>Number(b.seasonId)-Number(a.seasonId));
      $('boxPlanSeason').innerHTML=rows.map(x=>{const cur=Number(x.seasonId)===Number(m.currentSeason);
        return `<option value="${x.seasonId}"${cur?' selected':''}>第 ${x.seasonId} 期 · ${x.recordCount??0} 条${cur?'（当前）':''}</option>`}).join('');
    }catch(e){$('boxPlanSeason').innerHTML='<option value="69">第 69 期</option>'}
  }

  /* ---------------- 启动 ---------------- */
  function boot(){
    if(!window.MorimensTabs||$('morimensBoxPanel'))return;
    ensureStyle();
    loadBox();
    panel=document.createElement('div');panel.id='morimensBoxPanel';panel.setAttribute('role','tabpanel');panel.hidden=true;
    panel.innerHTML=panelHtml();
    const ui=window.MorimensTabs.ui||(zh=>zh);
    window.MorimensTabs.add({name:'box',label:ui('定制配队推荐','Custom Lineup'),panel});
    bindEvents();
    renderAll();
    initData().catch(e=>console.warn('box data failed',e));
    if(location.hash==='#box')window.MorimensTabs.activate('box');
    window.MorimensBox={get box(){return boxData},render:renderAll,recommend:runPlan};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0));else setTimeout(boot,0);
})();

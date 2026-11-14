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
  const MAXLV=90,MAXEN=3,MAXPO=10,MAXSK=6,MAXSTACK=12;
  // 练度换算：1 档启灵 ≈ 8 级等效。
  // **启灵只有 0~3 档**（界面上亮几个菱形就是几启）：截图里第 4 个槽位那个 0~12 的数字
  // 属于另一套成长，用户核对后明确「24 是二启」「薇薇安是三启」，所以不加进启灵。
  // 记录里的 potencyLevel 是 0~15 的合并刻度，比较前要先折回 0~3（见 enTier）。
  const EN_EQ=8;
  const enTier=pl=>{const n=Number(pl);return Number.isFinite(n)?(n<=2?n:3):3};
  // 三档的门槛（都只看等级 + 启灵）：
  //  low  整队要求全部落在 BOX 之内，且平均还富余 8 级等效以上
  //  mid  缺口 ≤ 6 级 / ≤ 1 启，或刚好压在你的练度上
  //  high 缺口 ≤ 15 级 / ≤ 3 启，练一练能上
  const TIER_SPEC={
    low:{name:'低配',hint:'整队都在你练度之内',color:'#7fd8a5',center:24},
    mid:{name:'中配',hint:'和你练度差不多',color:'#6ea8ff',center:0},
    high:{name:'高配',hint:'比你略高一点',color:'#d7a85b',center:-12}
  };
  const TIER_KEYS=['low','mid','high'];
  // 启灵显示：亮的菱形数就是启灵数（0~3）。第 4 槽的数字不计入启灵，界面上不显示。
  const ENLIGHT_TEXT=en=>{
    const n=Math.max(0,Math.min(MAXEN,Number(en)||0));
    return `${n} 启`;
  };

  let boxData={v:1,chars:{},wheels:{},updated:0};
  let chars=[],charsById=new Map(),idByIngame=new Map(),wheelCatalog=[],wheelZh=null,artMap=null;
  let dataReady=false,panel=null,planState={season:null,teams:null,target:525,rankCap:0,mode:'normal'};
  let wheelIdByEn=new Map();   // 记录里的命轮英文名 → skeydbId
  const seasonCache=new Map();
  let manifestPromise=null;
  let lastPlan=null;   // 最近一次生成的推荐结果（结构化，供自检 / 导出用）

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
    const cur=boxData.chars[id]||{lv:MAXLV,en:MAXEN,po:MAXPO,sk:MAXSK};
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
      // 记录里的命轮只给英文名，要反查 id 才知道你 BOX 里有没有这张
      wheelIdByEn=new Map();
      wheelCatalog=rows.map(w=>{
        const zh=md.wheelZhDb?.bySkeydbId?.[w.id]||md.wheelZhDb?.byEnglishName?.[w.name];
        const icon=artMap?.wheelIcon?.[w.id];
        return {id:w.id,name:zh?.name||w.name,en:w.name,realm:w.realm,rarity:w.rarity,owner:w.ownerAwakenerId,
          icon:icon?`assets/morimens/wheel-thumbs/${icon}.webp`:''};
      }).sort((a,b)=>String(a.name).localeCompare(String(b.name),'zh-CN'));
      for(const w of wheelCatalog)if(w.en)wheelIdByEn.set(w.en,w.id);
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
      .boxMember .okTag{color:#7fd8a5}
      .boxTiers{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:10px}
      .boxTier{border:1px solid rgba(148,163,184,.13);border-left:3px solid var(--tier,#6ea8ff);border-radius:11px;background:rgba(255,255,255,.022);padding:10px;min-width:0}
      .boxTierHead{display:flex;gap:7px;align-items:baseline;flex-wrap:wrap}
      .boxTierTag{font-size:10px;font-weight:600;color:var(--tier,#6ea8ff);background:rgba(255,255,255,.06);border-radius:5px;padding:1px 6px;white-space:nowrap}
      .boxTierScore{font-size:10px;color:#8290a2}
      .boxTierPred{margin-left:auto;font-size:10px;color:#7fd8a5}
      .boxTierPred.bad{color:#d7a85b}
      .boxTierTip{font-size:10px;color:#7f8da1}
      .boxTierMeta{font-size:10px;color:#8b98ab;line-height:1.7;margin-top:5px}
      .boxTier .boxWaveMembers{grid-template-columns:repeat(2,minmax(0,1fr));margin-top:8px}
      .boxToast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:300;padding:10px 16px;border-radius:999px;background:rgba(15,21,32,.96);border:1px solid rgba(213,177,118,.4);color:#f1ddb5;font-size:12px;font-weight:700;box-shadow:0 12px 30px rgba(0,0,0,.4)}
      @media(max-width:900px){.boxPlanCtl{grid-template-columns:repeat(2,minmax(0,1fr))}.boxWaveMembers{grid-template-columns:repeat(2,minmax(0,1fr))}.boxStatRow{grid-template-columns:repeat(2,minmax(0,1fr))}.boxTiers{grid-template-columns:1fr}}
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
          <select class="boxBtn" id="boxDemoPick" title="没有自己的截图时，先用一套示例 BOX 看配队效果">
            <option value="">载入示例 BOX…</option>
            <option value="starter">新手 · Lv60 / 1 启 / 无命轮</option>
            <option value="mid">中坚 · Lv70 / 3 启+4 / 命轮满叠</option>
            <option value="full">满配 · Lv90 / 3 启+12 / 命轮满叠</option>
          </select>
          <span class="boxChip" id="boxSummary" style="cursor:default">0 名唤醒体 · 0 张命轮</span>
        </div>
        <div class="boxChips" id="boxRealmFilter"></div>
        <div id="boxCharList"></div>
        <div id="boxWheelList"></div>
      </div>

      <div id="boxTabOcr" hidden>
        <div class="boxNotice">支持一次最多 5 张截图，可以分多次补充。角色列表页识别「等级 + 启灵」，命轮页识别「叠位」。识别结果会先列出来给你核对，确认后才写进 BOX。</div>
        <div class="boxNotice"><b>OCR 的准确度一般，请自行进行校对调整。</b>认错的角色点开下拉改、等级和启灵也能直接改，确认无误再导入；改过的卡面会被记住，同一个角色（包括换了皮肤的）下次就不用再改。</div>
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
          <label class="boxField">参考榜单范围<select id="boxPlanRank"><option value="0">全部记录</option><option value="50">Top 50</option><option value="200">Top 200</option><option value="500">Top 500</option><option value="1000">Top 1000</option><option value="2000" selected>Top 2000</option></select></label>
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
    let h=H0+12;
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
    ctx.fillText('配队推荐仅供参考，请按自己的练度、造物与操作习惯判断',PAD,h-12);
    return canvas;
  }
  function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
  function clip(ctx,text,max){let s=String(text||'');if(ctx.measureText(s).width<=max)return s;while(s.length>1&&ctx.measureText(s+'…').width>max)s=s.slice(0,-1);return s+'…'}

  /* ---------------- 赛季数据 ---------------- */
  function getManifest(){
    if(!manifestPromise)manifestPromise=fetchJson('data/morimens/eremora/manifest.json','manifest').catch(e=>{manifestPromise=null;throw e});
    return manifestPromise;
  }
  // 期次键：同一期可能有多个快照（第 69 期分 Bug 前/Bug 后），只按 seasonId 去重会漏掉
  // 官方 Top 2000 的终榜，所以用 snapshotId 当键。
  function snapshotKey(s){return String(s.snapshotId||s.seasonId)}
  async function loadSeasonTeams(key){
    if(seasonCache.has(key))return seasonCache.get(key);
    const manifest=await getManifest();
    const entry=(manifest.availableSeasons||[]).find(s=>snapshotKey(s)===String(key));
    if(!entry)throw new Error(`没有这个期次的快照`);
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
          const hit=packSeason(entry,key,teams);
          seasonCache.set(key,hit);
          if(seasonCache.size>2)seasonCache.delete([...seasonCache.keys()][0]);
          return hit;
        }
      }catch(e){console.warn('box: loader failed, fallback to v1',e)}
    }
    let idx=null;
    const paths=[`data/morimens/eremora/usage/${entry.seasonId}-local-gzip/index.json`,entry.path].filter(Boolean);
    for(const pth of paths){
      try{
        const j=await fetchJson(pth,'season index');
        if(j&&j.format==='gzip-base64-chunked-v1'&&Array.isArray(j.chunks)){idx=j;break}
      }catch(e){}
    }
    if(!idx)throw new Error('该期没有可分块读取的快照');
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
    const result=packSeason(entry,key,teams);
    seasonCache.set(key,result);
    if(seasonCache.size>2)seasonCache.delete([...seasonCache.keys()][0]);
    return result;
  }
  // 期次元信息 + 排名覆盖：界面上要能说清「这期参考的是前多少名」，
  // 而不是让用户以为选 Top 2000 就真能统计到 2000 条（老期次只有 1000 条）。
  function packSeason(entry,key,teams){
    let maxRank=0;
    for(const t of teams){const r=Number(t.rank)||0;if(r>maxRank)maxRank=r}
    return {
      key,seasonId:Number(entry.seasonId),
      label:entry.labelZh||`第 ${entry.seasonId} 期`,
      league:entry.coverageMode||'',recordCount:teams.length,maxRank,teams
    };
  }
  function extractTeams(data,out){
    for(const rec of data.records||[]){
      for(const w of rec.waves||[]){
        for(const t of w.teams||[]){
          const members=(t.members||[]).map(m=>{
            // v1 快照给 skeydbId；v2 只给 ingameId（C02EX 这种），要反查回 skeydbId
            const ingame=m.ingameId?String(m.ingameId):'';
            const id=m.skeydbId||idByIngame.get(ingame)||null;
            // v2 用 potencyLevel 表示启灵（0-3 是 N 启，4-15 是 3 启之后的 +N）
            const en=m.potencyLevel!=null?enTier(m.potencyLevel):enTier(m.enlightenLevel??3);
            return {
              id,ingameId:m.ingameId||null,name:m.canonicalName||m.name||'',
              lv:m.level??null,en,borrow:!!m.borrowed,
              wheels:(m.wheels||[]).map(x=>x.name).filter(Boolean)
            };
          });
          if(members.length<4)continue;
          // 0 分的队伍没有参考价值（记录里偶发：该区没打/数据缺失），留着只会被当成「替代」捞上来
          if(!(Number(t.score)>0))continue;
          out.push({
            wave:Number(w.wave)||0,score:Number(t.score)||0,rank:Number(rec.rank)||null,player:rec.player||'',url:rec.url||'',
            difficulty:t.difficultyLabel||t.difficulty||(t.stageName||'').split(':').pop().trim(),clearType:t.clearType||'clear',
            token:t.token?.name||'',members,
            // 造物（局内强化）和疯狂值：这两项直接决定「同样的分数有多难凹」。
            // 只用来展示，不参与评分 —— 参考分本来就是别人带着特定造物打的。
            creations:(t.creations||[]).map(c=>({name:c.name||'',quality:c.quality||''})),
            madness:Number(w.madness)||0
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
  function rawFit(member,box){
    // 等级 / 启灵都按原始刻度比，不走 enScore 那套 0-5 粗档（4~15 全挤在 4 里没法分档）
    const own=box.chars[member.id];
    if(!own)return {owned:false,borrow:!!member.borrow};
    const needLv=clamp(member.lv==null?MAXLV:member.lv,0,MAXLV);
    const needEn=clamp(member.en==null?3:member.en,0,MAXEN);
    const ownLv=clamp(own.lv,0,MAXLV),ownEn=clamp(own.en,0,MAXEN);
    return {
      owned:true,needLv,needEn,ownLv,ownEn,
      lvGap:Math.max(0,needLv-ownLv),
      enGap:Math.max(0,needEn-ownEn),
      // 正数＝你比这套要求更强（富余），负数＝还差多少
      eq:(ownLv-needLv)+(ownEn-needEn)*EN_EQ
    };
  }
  function tierOf(team,box){
    let missing=0,maxLvGap=0,maxEnGap=0,sumEq=0,sumLv=0,sumEn=0,sumOwnLv=0,sumOwnEn=0,n=0;
    for(const m of team.members){
      const f=rawFit(m,box);
      if(!f.owned){missing++;continue}
      maxLvGap=Math.max(maxLvGap,f.lvGap);maxEnGap=Math.max(maxEnGap,f.enGap);
      sumEq+=f.eq;sumLv+=f.needLv;sumEn+=f.needEn;sumOwnLv+=f.ownLv;sumOwnEn+=f.ownEn;n++;
    }
    if(!n)return {tier:null,missing,avgEq:0,maxLvGap,avgEnGap:0,maxEnGap:0};
    const avgEq=sumEq/n;
    let tier=null;
    if(maxLvGap===0&&maxEnGap===0&&avgEq>=EN_EQ)tier='low';
    else if(maxLvGap<=6&&maxEnGap<=1)tier='mid';
    else if(maxLvGap<=15&&maxEnGap<=3)tier='high';
    return {
      tier,missing,avgEq,maxLvGap,maxEnGap,
      needLv:Math.round(sumLv/n),needEn:Math.round((sumEn/n)*10)/10,
      ownLv:Math.round(sumOwnLv/n),ownEn:Math.round((sumOwnEn/n)*10)/10
    };
  }
  // 这套队伍的命轮你有几张。记录只给英文名，不给叠位，所以只能判「有没有」。
  function wheelFit(team){
    const miss=[];let total=0;
    for(const m of team.members){
      if(m.borrow)continue;
      for(const w of m.wheels||[]){
        total++;
        const id=wheelIdByEn.get(w);
        if(!id||!boxData.wheels[id])miss.push(w);
      }
    }
    return {total,owned:total-miss.length,miss};
  }
  function evalTeam(team,box){
    // 只用来估“照这套抄下来大概能拿多少分”：练度够就不打折，不够才按缺口折。
    let gaps=0,missing=0;
    for(const m of team.members){
      const f=rawFit(m,box);
      if(!f.owned){
        // 记录里标了借用助战的格子可以直接借，算半个缺人
        missing++;
        gaps+=m.borrow?0.06:0.18;
        continue;
      }
      gaps+=Math.max(0,f.lvGap-6)*0.010;
      gaps+=Math.max(0,f.enGap-1)*0.06;
    }
    // 命轮不齐要打折：少一张按 2% 估，最多打 12%（命轮影响比练度小，但也不是没有）
    const wf=wheelFit(team);
    gaps+=Math.min(0.12,wf.miss.length*0.02);
    const penalty=Math.min(0.6,gaps);
    const pred=Math.max(0,team.score*(1-penalty));
    return {pred,penalty,missing,wheelFit:wf};
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
  /* 融灾五区是同一套库存：一个唤醒体只能上一次场，一张命轮也只能装在一个角色身上。
     所以「同一档的五支队伍」之间不能出现重复角色、也不能出现重复命轮（钥令跟着命轮走，
     同名命轮即同名钥令）。借用助战的格子是别人的号，连人带轮都不占自己库存，直接跳过。 */
  function teamLoad(team){
    const chars=new Set(),wheels=new Set();
    for(const m of team.members){
      if(m.borrow)continue;
      const ck=m.id||m.ingameId||m.name;
      if(ck)chars.add(ck);
      for(const w of m.wheels||[])if(w)wheels.add(w);
    }
    return {chars,wheels};
  }
  function loadClash(a,b){
    if(!a||!b)return null;
    for(const k of a.chars)if(b.chars.has(k))return {kind:'char',key:k};
    for(const k of a.wheels)if(b.wheels.has(k))return {kind:'wheel',key:k};
    return null;
  }
  // 冲突「几个」而不是「有没有」：候选池里常常一支零冲突的都没有，
  // 这时应该挑撞得最少的，别拿排序第一的那支硬撞（它可能跟三个区都重）。
  function pickTrack(zones,tier,takenByZone){
    // 一档 = 一条五区路线。挑选顺序按「这一区可选队伍最少」先来，
    // 免得靠前的区把稀缺队伍吃光、后面的区只能硬撞。
    const spec=TIER_SPEC[tier];
    const lists=zones.map((z,zi)=>{
      const taken=takenByZone.get(zi)||new Set();
      const inBucket=z.buckets[tier].filter(x=>!taken.has(x));
      const inSet=new Set(inBucket);
      // 这一档没有正好落在区间里的队伍（比如 box 已经练满、记录里没有更高的）：
      // 退到「练度最接近该档中心」的几支，卡片上标「替代」。
      const pool=z.buckets.over.concat(z.buckets.high,z.buckets.mid,z.buckets.low)
        .filter(x=>!taken.has(x)&&!inSet.has(x));
      if(tier==='low'){
        // 低配桶空了＝没有「整队都在你练度之内」的队，退到**最省练度**的那些
        pool.sort((a,b)=>b.avgEq-a.avgEq||b.pred-a.pred);
      }else{
        // 中/高配桶空了（通常是你已经练满）＝直接给能打最高分的
        pool.sort((a,b)=>b.pred-a.pred||Math.abs(a.avgEq-spec.center)-Math.abs(b.avgEq-spec.center));
      }
      // narrow＝只在本档桶内挑（档位纯正）。wide＝允许用隔壁档的队伍补位。
      // 中配桶常常只有十几支（都是「刚好持平」的顶配队），凑不出五区不重复，
      // 这时宁可拿一支低配队顶上，也不要把同一个角色排进两个区。
      return {narrow:inBucket,wide:inBucket.concat(pool),narrowSet:inSet,alt:inBucket.length===0};
    });
    const order=zones.map((z,i)=>i).sort((a,b)=>lists[a].wide.length-lists[b].wide.length||a-b);
    const picked=new Array(zones.length).fill(null);

    /* 1) 先解「五区严格零重复」。
       原来的做法是逐区取「第一个不撞的」——贪心经常走死：前面几区把热门辅助/热门命轮
       吃掉，轮到第 5 区时池子里一条干净的都没有，只能硬撞然后标红。
       改成带预算的 DFS：候选按分数从高到低试，找到第一条全程零冲突的路线就返回。
       5 区 × 160 候选、12 万次尝试上界，实测十几毫秒。 */
    const CAP=160,BUDGET=120000;
    function fits(load,uc,uw){
      for(const k of load.chars)if(uc.has(k))return false;
      for(const k of load.wheels)if(uw.has(k))return false;
      return true;
    }
    function solve(field){
      let budget=BUDGET;
      const seq=new Array(order.length).fill(null);
      function dfs(i,uc,uw){
        if(i===order.length)return true;
        const cs=lists[order[i]][field],n=Math.min(cs.length,CAP);
        for(let k=0;k<n;k++){
          if(--budget<=0)return false;
          const x=cs[k];
          if(!fits(x.load,uc,uw))continue;
          seq[i]=x;
          const ac=new Set(uc),aw=new Set(uw);
          for(const t of x.load.chars)ac.add(t);
          for(const t of x.load.wheels)aw.add(t);
          if(dfs(i+1,ac,aw))return true;
          seq[i]=null;
        }
        return false;
      }
      return dfs(0,new Set(),new Set())?seq:null;
    }
    const narrow=solve('narrow'),wide=narrow?null:solve('wide');
    const seq=narrow||wide;
    if(seq){
      for(let i=0;i<order.length;i++){
        const zi=order[i],x=seq[i];
        // 用了隔壁档的队伍补位 → 标「替代」，让用户知道这不是本档的纯正队伍
        const off=!lists[zi].narrowSet.has(x);
        picked[zi]={x,alt:lists[zi].alt||off,forced:null};
        takenByZone.get(zi).add(x);
      }
      return picked;
    }

    /* 2) 确实凑不出零重复（记录池里就那几支热门队）：退回「撞得最少」，并标明跟谁撞了。
       冲突按角色加权：一个人不能同时上两个区，命轮至少还能靠替换凑。 */
    const used={chars:new Set(),wheels:new Set()};
    function clashCount(load){
      let c=0,w=0;
      for(const k of load.chars)if(used.chars.has(k))c++;
      for(const k of load.wheels)if(used.wheels.has(k))w++;
      return c*3+w;
    }
    for(const zi of order){
      const {wide,alt,narrowSet}=lists[zi];
      const cands=wide;
      let pick=null,least=Infinity;
      for(const x of cands){
        const n=clashCount(x.load);
        if(n===0){pick=x;least=0;break}
        if(n<least){least=n;pick=x}
      }
      let forced=null;
      if(pick&&least>0){
        // 确实没有零冲突的：挑撞得最少的，并在卡片上写清是跟哪个区撞了。
        for(let k=0;k<picked.length;k++){
          if(!picked[k])continue;
          const c=loadClash(pick.load,picked[k].x.load);
          if(c){forced={wave:zones[k].wave,kind:c.kind,key:c.key};break}
        }
      }
      if(pick){
        for(const k of pick.load.chars)used.chars.add(k);
        for(const k of pick.load.wheels)used.wheels.add(k);
        takenByZone.get(zi).add(pick);
      }
      picked[zi]=pick?{x:pick,alt:alt||!narrowSet.has(pick),forced}:null;
    }
    return picked;
  }
  // 自检：这一档五支队伍里有多少角色 / 命轮被重复使用了
  function trackAudit(plans,tier){
    const seenC=new Set(),seenW=new Set();
    let charClash=0,wheelClash=0,n=0;
    for(const p of plans){
      const pick=p.picks[tier].pick;
      if(!pick)continue;
      n++;
      for(const c of pick.load.chars){if(seenC.has(c))charClash++;else seenC.add(c)}
      for(const w of pick.load.wheels){if(seenW.has(w))wheelClash++;else seenW.add(w)}
    }
    return {charClash,wheelClash,chars:seenC.size,wheels:seenW.size,n};
  }
  async function runPlan(){
    const status=$('boxPlanStatus'),host=$('boxPlanResult');
    if(!dataReady){toast('角色数据还没载入完');return}
    if(!ownedCount()){host.innerHTML='<div class="boxEmpty">BOX 还是空的，先去「我的 BOX」录入，或用截图识别导入。</div>';return}
    const seasonKey=$('boxPlanSeason').value;
    const target=Math.max(0,Math.min(525,Number($('boxPlanTarget').value||525)));
    const rankCap=Number($('boxPlanRank').value||0);
    status.textContent='正在载入赛季记录…';
    try{
      const data=await loadSeasonTeams(seasonKey);
      const inRange=rankCap?data.teams.filter(t=>!t.rank||t.rank<=rankCap):data.teams;
      status.textContent=`${data.label} · ${inRange.length} 支队伍记录${rankCap?`（榜单前 ${rankCap}）`:''} · 正在分档…`;
      const waves=[...new Set(inRange.map(t=>t.wave))].filter(Boolean).sort((a,b)=>a-b);
      const caps=waves.map(w=>Math.max(...inRange.filter(t=>t.wave===w).map(t=>t.score),1));
      const targets=allocate(target,caps);
      // 每区把候选队伍按「扣掉你的练度缺口后大概能打多少分」排好，再分低/中/高/超标四桶。
      // 缺口大到离谱（超 25 级 / 6 启）的直接不进候选，免得替代档捞到根本练不出来的队。
      const zones=waves.map((w,wi)=>{
        const rows=inRange.filter(t=>t.wave===w);
        const dedup=new Map();
        for(const t of rows){
          const k=signature(t),old=dedup.get(k);
          if(!old||t.score>old.score)dedup.set(k,t);
        }
        const evaluated=[...dedup.values()]
          .map(t=>({team:t,...evalTeam(t,boxData),...tierOf(t,boxData),load:teamLoad(t)}))
          .filter(x=>x.missing<=1&&x.maxLvGap<=25&&x.maxEnGap<=6);
        const buckets={low:[],mid:[],high:[],over:[]};
        for(const x of evaluated)buckets[x.tier||'over'].push(x);
        for(const k of Object.keys(buckets)){
          buckets[k].sort((a,b)=>b.pred-a.pred||b.team.score-a.team.score||(a.team.rank||9999)-(b.team.rank||9999));
        }
        return {wave:w,target:targets[wi],cap:caps[wi],buckets};
      });
      status.textContent=`${data.label} · ${inRange.length} 支记录 · 正在排重…`;
      // 三档各自是一条独立路线：同一档的五支队伍之间不允许角色 / 命轮重复。
      // 同一区的低中高三套是「三选一」，彼此之间不需要排重，但仍然尽量不让三个档位选中同一支队伍。
      const takenByZone=new Map(zones.map((z,i)=>[i,new Set()]));
      const picksByTier={};
      for(const k of TIER_KEYS)picksByTier[k]=pickTrack(zones,k,takenByZone);
      const plans=zones.map((z,zi)=>{
        const picks={};
        for(const k of TIER_KEYS){
          const rec=picksByTier[k][zi];
          const pick=rec?rec.x:null;
          picks[k]={pick,alt:rec?rec.alt:false,forced:rec?rec.forced:null,
            alts:z.buckets[k].filter(x=>x!==pick).slice(0,3)};
        }
        return {wave:z.wave,target:z.target,cap:z.cap,picks};
      });
      status.textContent=`已生成 · ${data.label} · ${inRange.length} 支记录${rankCap?`（榜单前 ${rankCap}）`:''}`;
      lastPlan={season:{key:data.key,label:data.label,maxRank:data.maxRank,recordCount:data.recordCount},target,rankCap,plans};
      renderPlan(plans,target,data,rankCap);
    }catch(e){
      console.error(e);status.textContent='生成失败';host.innerHTML=`<div class="boxNotice bad">${esc(e.message||e)}</div>`;
    }
  }
  function memberCard(m){
    const c=m.id?charsById.get(m.id):null;
    const f=rawFit(m,boxData);
    const lvTxt=m.lv!=null?`需要 Lv.${m.lv}`:'需要 Lv.—';
    const enTxt=m.en!=null?ENLIGHT_TEXT(clamp(m.en,0,MAXEN)):'';
    let tag='';
    if(!f.owned)tag=`<small class="${m.borrow?'warnTag':'missTag'}">${m.borrow?'可借用（记录中为助战）':'BOX 中没有'}</small>`;
    else if(f.lvGap||f.enGap)tag=`<small class="warnTag">差 ${f.lvGap?`${f.lvGap} 级`:''}${f.lvGap&&f.enGap?' / ':''}${f.enGap?`${f.enGap} 启`:''}</small>`;
    else tag=`<small class="okTag">${f.eq>=EN_EQ?`富余 ${Math.round(f.eq)} 级等效`:'刚好够'}</small>`;
    return `<div class="boxMember">${c?.portrait?`<img src="${esc(c.portrait)}" alt="" loading="lazy">`:''}
      <div style="min-width:0"><b>${esc(c?.name||m.name||m.id)}</b><small>${lvTxt}${enTxt?' · '+enTxt:''}</small>
      ${m.wheels?.length?`<small>${esc(m.wheels.slice(0,2).map(wheelNameByEn).join(' / '))}</small>`:''}${tag}</div></div>`;
  }
  const QUALITY_ZH={Red:'红',Orange:'橙',Gold:'金',Purple:'紫',Blue:'蓝',Green:'绿',White:'白'};
  function creationTxt(t){
    const n=(t.creations||[]).length;
    if(!n)return '无造物记录';
    const best=(t.creations||[]).map(c=>QUALITY_ZH[c.quality]||c.quality).find(Boolean);
    return `造物 ${n} 件${best?`（最高 ${best}）`:''}`;
  }
  function tierCard(key,info,target){
    const spec=TIER_SPEC[key];
    const pick=info.pick;
    if(!pick)return `<div class="boxTier" style="--tier:${spec.color}">
        <div class="boxTierHead"><span class="boxTierTag">${spec.name}</span><span class="boxTierTip">${spec.hint}</span></div>
        <div class="boxTierMeta">公开记录里没有符合这一档的队伍。</div>
      </div>`;
    const t=pick.team,ok=pick.pred>=target;
    // 分档看的是"最吃练度的那个人"，所以这里也报缺口最大值，别用平均富余（会跟档位对不上）
    const gapTxt=(pick.maxLvGap||pick.maxEnGap)
      ? `最高差 ${pick.maxLvGap?`${pick.maxLvGap} 级`:''}${pick.maxLvGap&&pick.maxEnGap?' / ':''}${pick.maxEnGap?`${pick.maxEnGap} 启`:''}`
      : `整队都够（平均富余 ${Math.round(pick.avgEq)} 级等效）`;
    const clashTxt=info.forced
      ? `<span class="boxTierPred bad">与第 ${info.forced.wave} 区重复${info.forced.kind==='char'?'角色':'命轮'}${info.forced.kind==='wheel'?`（${esc(wheelNameByEn(info.forced.key))}）`:''}</span>`
      : '';
    return `<div class="boxTier" style="--tier:${spec.color}">
      <div class="boxTierHead">
        <span class="boxTierTag">${spec.name}${info.alt?' · 替代':''}</span>
        <span class="boxTierScore">参考 ${t.score} 分</span>
        <span class="boxTierPred ${ok?'':'bad'}">预计 ${Math.round(pick.pred)}${ok?' · 达标':` · 差 ${Math.max(0,Math.round(target-pick.pred))}`}</span>
      </div>
      <div class="boxTierMeta">队伍 Lv.${pick.needLv} / ${pick.needEn} 启 · 你 Lv.${pick.ownLv} / ${pick.ownEn} 启 · ${gapTxt}</div>
      ${(()=>{const wf=pick.wheelFit||{total:0,owned:0,miss:[]};if(!wf.total)return '';
        const bad=wf.miss.length;
        return `<div class="boxTierMeta">命轮 <b style="color:${bad?'#e8a0a0':'#7fd8a5'}">${wf.owned}/${wf.total}</b> 齐${bad?`（缺 ${esc(wf.miss.slice(0,4).map(wheelNameByEn).join('、'))}${bad>4?'…':''}）`:''}</div>`})()}
      ${clashTxt?`<div class="boxTierMeta">${clashTxt}</div>`:''}
      <div class="boxWaveMembers">${t.members.map(memberCard).join('')}</div>
      <div class="boxAlt">命轮：${esc(t.members.map(m=>m.wheels?.length?m.wheels.map(wheelNameByEn).join(' + '):'—').join(' / '))}</div>
      <div class="boxAlt">${creationTxt(t)}${t.token?` · 信物 ${esc(t.token)}`:''}${t.rank?` · 原榜 #${t.rank}`:''}${t.url?` · <a href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">通关记录</a>`:''}</div>
      ${info.alts.length?`<div class="boxAlt">备选：${info.alts.map(a=>`<a href="${esc(a.team.url)}" target="_blank" rel="noopener noreferrer">${Math.round(a.pred)} 分${a.team.rank?` #${a.team.rank}`:''}</a>`).join(' · ')}</div>`:''}
    </div>`;
  }
  function renderPlan(plans,target,data,rankCap){
    const host=$('boxPlanResult');
    const sumOf=k=>Math.round(plans.reduce((s,p)=>s+(p.picks[k].pick?p.picks[k].pick.pred:0),0));
    const hits=k=>plans.filter(p=>p.picks[k].pick&&p.picks[k].pick.pred>=p.target).length;
    const audits={};for(const k of TIER_KEYS)audits[k]=trackAudit(plans,k);
    const auditTxt=k=>{const a=audits[k];
      if(!a.n)return '没有可用队伍';
      const bad=a.charClash||a.wheelClash;
      return `<b style="color:${bad?'#e8a0a0':'#7fd8a5'}">${bad?'有冲突':'无重复'}</b> · 角色 ${a.chars} 名${a.charClash?`（重复 ${a.charClash} 次）`:''} · 命轮 ${a.wheels} 张${a.wheelClash?`（重复 ${a.wheelClash} 次）`:''}`;
    };
    const coverage=data.maxRank?`该期快照排名 #1–#${data.maxRank}`:'';
    host.innerHTML=`
      <div class="boxStatRow">
        <div class="boxStat"><small>目标总分</small><strong>${target}</strong></div>
        <div class="boxStat"><small>低配合计 · ${hits('low')}/${plans.length} 区达标</small><strong style="color:#7fd8a5">${sumOf('low')}</strong></div>
        <div class="boxStat"><small>中配合计 · ${hits('mid')}/${plans.length} 区达标</small><strong style="color:#6ea8ff">${sumOf('mid')}</strong></div>
        <div class="boxStat"><small>高配合计 · ${hits('high')}/${plans.length} 区达标</small><strong style="color:#d7a85b">${sumOf('high')}</strong></div>
      </div>
      <div class="boxNotice">
        <b>先说清楚：以下只是参考，不是「照抄就能过」的答案。</b>请按自己的练度、命轮、造物和操作习惯判断。
        通关记录的实际凹度差别很大 —— 有的队靠局内<b>造物</b>把伤害堆起来，有的靠<b>死扛</b>（坦克/护盾硬顶、反复重开凹暴击）拿分，
        同样的分数对不同人难度完全不同。抄之前先看卡片上的「造物 N 件」，造物差的队往往要多打很多遍。
      </div>
      <div class="boxNotice">
        每区按<b>等级 + 启灵</b>给三套：<b style="color:#7fd8a5">低配</b>＝整队要求都在你练度之内（平均还富余 8 级等效以上）；<b style="color:#6ea8ff">中配</b>＝缺口 ≤ 6 级 / ≤ 1 启，或刚好持平；<b style="color:#d7a85b">高配</b>＝缺口 ≤ 15 级 / ≤ 3 启，练一练能上。启灵按 1 档 ≈ 8 级折算。「参考分」是记录里的实际得分，「预计」是按你的练度折算后的分数。
      </div>
      <div class="boxNotice">
        <b>阵容自检</b>（同一档的五区之间不能重复用人和命轮；钥令跟着命轮走，同名命轮＝同名钥令）：
        低配 ${auditTxt('low')}；中配 ${auditTxt('mid')}；高配 ${auditTxt('high')}。
        借用助战的格子连人带命轮都是别人的，不算占用你的库存。
      </div>
      ${TIER_KEYS.every(k=>hits(k)===0)?`<div class="boxNotice bad">按记录折算，这套 BOX 的低配大约 <b>${sumOf('low')}</b> 分、中配 ${sumOf('mid')}、高配 ${sumOf('high')}，离目标 ${target} 还有距离。
        要么把目标调到 <b>${Math.round(sumOf('low')/5)*5}</b> 左右看每区差多少，要么先补练度 / 命轮再回来抄更高分的队。</div>`:''}
      ${plans.map(p=>`
        <div class="boxWave">
          <div class="boxWaveHead">
            <div><b>第 ${p.wave} 区</b> <span>目标 ${p.target} 分 · 该区上限 ${p.cap}</span></div>
            <div><span>三档任选其一，越往上越吃练度</span></div>
          </div>
          <div class="boxTiers">${TIER_KEYS.map(k=>tierCard(k,p.picks[k],p.target)).join('')}</div>
        </div>`).join('')}
      <div class="boxNotice">数据来自公开融灾通关记录（${esc(data.label)}${rankCap?` · 榜单前 ${rankCap}`:''}${coverage?` · ${esc(coverage)}`:''}，共 ${data.recordCount} 支队伍）。
        记录里标「可借用」的格子是别人的助战位，可以直接借，不算缺人。</div>
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
      if(e.target.id==='boxDemoPick'){
        const v=e.target.value;e.target.value='';
        if(v)loadDemoBox(v);
        return;
      }
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
    for(const id of ids)boxData.chars[id]={lv:MAXLV,en:MAXEN,po:MAXPO,sk:MAXSK};
    saveBox();renderAll();toast(`已把 ${ids.length} 名角色设为满级满灵塑满技能`);
  }
  /* 示例 BOX：很多人手里没有成套截图，又想先看看「配队推荐」长什么样。
     直接按当前角色表生成，不硬编码 id，游戏更新也不会失效。 */
  function loadDemoBox(kind){
    // 启灵只有 0~3，三套示例只能靠等级拉开差距（以前用 en 7/15 是把它当 0~15 刻度）
    const preset={starter:{lv:60,en:1,stack:-1},mid:{lv:72,en:2,stack:12},full:{lv:90,en:3,stack:12}}[kind];
    if(!preset)return;
    if(ownedCount()&&!window.confirm('这会覆盖当前 BOX（可先导出代码备份）。继续？'))return;
    const next={v:1,chars:{},wheels:{},updated:Date.now()};
    for(const c of chars)next.chars[c.id]={lv:preset.lv,en:preset.en,po:10,sk:6};
    if(preset.stack>=0)for(const w of wheelCatalog)next.wheels[w.id]={stack:preset.stack};
    boxData=next;
    saveBox();renderAll();
    toast(`已载入示例：${chars.length} 名角色 / ${Object.keys(next.wheels).length} 张命轮`);
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
  /* ---------- 卡面指纹记忆（换装 / 皮肤兜底） ----------
     立绘模板只覆盖原皮：同一个人换了皮肤，卡面就是另一张画，模板分能低到 0.4~0.7，
     却照样会「像」地命中另一个人（实测「24」穿皮肤后被认成 Pickman，0.72 看着还挺可信）。
     皮肤素材我们拿不到，所以改成**从校对里学**：用户在识别结果里把某一行的角色改对，
     就把这一格的卡面指纹记下来；以后同卡面直接置顶。
     指纹是卡面上部 86% 的 32×32 灰度归一化描述子——实测同一张卡缩放到 0.72 倍
     仍能到 0.98，而不同角色之间最高只有 0.44，分得很开。 */
  const FACE_KEY='morimens.box.faces.v1',FACE_PER_CHAR=3,FACE_TOTAL=260;
  function faceToStr(v){
    const a=new Int8Array(v.length);
    for(let i=0;i<v.length;i++)a[i]=Math.max(-127,Math.min(127,Math.round(v[i]*127)));
    let str='';for(let i=0;i<a.length;i++)str+=String.fromCharCode(a[i]&255);
    return btoa(str);
  }
  function strToFace(str){
    const bin=atob(str),v=new Float32Array(bin.length);
    for(let i=0;i<bin.length;i++){const c=bin.charCodeAt(i);v[i]=(c>127?c-256:c)/127}
    return v;
  }
  function readFaces(){
    let raw=[];
    try{raw=JSON.parse(localStorage.getItem(FACE_KEY)||'[]')}catch(e){raw=[]}
    if(!Array.isArray(raw))return [];
    return raw.map(function(x){try{return {id:x.id,v:strToFace(x.f)}}catch(e){return null}}).filter(function(x){return x&&x.id&&x.v.length});
  }
  function learnFace(id,face){
    if(!id||!face||!face.length||!window.MorimensBoxOCR)return false;
    let raw=[];
    try{raw=JSON.parse(localStorage.getItem(FACE_KEY)||'[]')}catch(e){raw=[]}
    if(!Array.isArray(raw))raw=[];
    const f=faceToStr(face);
    if(raw.some(function(x){return x.id===id&&x.f===f}))return false;
    raw.push({id:id,f:f});
    const others=raw.filter(function(x){return x.id!==id}).slice(-(FACE_TOTAL-FACE_PER_CHAR));
    const mine=raw.filter(function(x){return x.id===id}).slice(-FACE_PER_CHAR);
    try{localStorage.setItem(FACE_KEY,JSON.stringify(others.concat(mine)))}catch(e){return false}
    return true;
  }
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
      const res=await ocr.analyzeFiles(ocrFiles,{mode,faceMem:readFaces(),onProgress:t=>{status.textContent=t}});
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
          <label class="boxField" style="font-size:9px"${r.enLow?' title="亮菱形没数准（对比度被压平），请核对这一格"':''}>启灵${r.enLow?'?':''}<select data-row-en="${i}">${Array.from({length:MAXEN+1},(_,k)=>`<option value="${k}"${k===(r.en||0)?' selected':''}>${ENLIGHT_TEXT(k)}</option>`).join('')}</select></label>
          <span class="boxScore ${r.score>0.62?'ok':r.score>0.5?'warn':'bad'}">${pct(r.score)}</span>
        </div>`;
      }).join('')+
      `<div class="boxToolbar"><button type="button" class="boxBtn primary" id="boxOcrApply">导入到 BOX</button>
        <button type="button" class="boxBtn" data-row-del-all="1">全部丢弃</button>
        <span class="boxChip" style="cursor:default">低置信度的行会标灰，点开下拉可以改</span></div>`;
    host.querySelectorAll('[data-row-char]').forEach(sel=>sel.addEventListener('change',()=>{
      const row=ocrRows[Number(sel.dataset.rowChar)];
      const changed=row&&row.id!==sel.value;
      if(row)row.id=sel.value;
      /* 用户手动改对了 → 记住这张卡面，下次（尤其是换装的角色）直接认出来 */
      if(changed&&row&&row.face&&learnFace(row.id,row.face)){
        const st=$('boxOcrStatus');if(st)st.textContent='已记住这张卡面，下次直接认';
      }
    }));
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
      // 同一期可能有多个快照（第 69 期分 Bug 前 / Bug 后），选「完整且记录更多」的那个，
      // 否则选 Top 2000 也只会拿到 1000 条 —— 参考面直接少一半。
      const best=new Map();
      for(const x of (m.availableSeasons||[])){
        const id=String(x.seasonId);
        if(!/^\d+$/.test(id))continue;
        const old=best.get(id);
        const score=v=>(v&&v.complete?1:0)*1e6+(v?.recordCount||0);
        if(!old||score(x)>score(old))best.set(id,x);
      }
      const rows=[...best.values()].sort((a,b)=>Number(b.seasonId)-Number(a.seasonId));
      $('boxPlanSeason').innerHTML=rows.map(x=>{
        const key=snapshotKey(x),cur=Number(x.seasonId)===Number(m.currentSeason);
        const cnt=x.recordCount??0;
        return `<option value="${esc(key)}"${cur?' selected':''}>${esc(x.labelZh||`第 ${x.seasonId} 期`)} · ${cnt} 条${cnt>=2000?'（Top 2000）':''}${cur?'（当前）':''}</option>`;
      }).join('');
    }catch(e){$('boxPlanSeason').innerHTML='<option value="69">第 69 期</option>'}
  }

  /* ---------------- 启动 ---------------- */
  let boxBooted=false,boxBootTry=0;
  function boot(){
    if(boxBooted)return;
    // dtide 的标签栏还没建好就稍等再来（以前是直接 return，什么都不做）
    if(!window.MorimensTabs){if(boxBootTry++<50)setTimeout(boot,120);return}
    const host=$('morimensBoxPanel');
    if(host&&host.dataset.boxReady==='1'){boxBooted=true;return}
    boxBooted=true;
    ensureStyle();
    loadBox();
    panel=host||null;
    if(panel){
      /* 页签和面板由 morimens-dtide.js 静态建好（这样它跟其它页签一起出现，
         不会「过一会才跳出来」），这里只把内容填进去、清掉占位提示。 */
      panel.innerHTML=panelHtml();
    }else{
      panel=document.createElement('div');panel.id='morimensBoxPanel';panel.setAttribute('role','tabpanel');panel.hidden=true;
      panel.innerHTML=panelHtml();
      const ui=window.MorimensTabs.ui||(zh=>zh);
      window.MorimensTabs.add({name:'box',label:ui('定制配队推荐','Custom Lineup'),panel});
    }
    try{panel.dataset.boxReady='1'}catch(e){}
    bindEvents();
    renderAll();
    initData().catch(e=>console.warn('box data failed',e));
    if(location.hash==='#box')window.MorimensTabs.activate('box');
    // public：给页面脚本 / 自动化测试用的最小接口
    window.MorimensBox={get box(){return boxData},render:renderAll,recommend:runPlan,ensure:boot,
      get plan(){return lastPlan},
      poster:async()=>(await buildPoster()).toDataURL('image/png')};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0));else setTimeout(boot,0);
})();

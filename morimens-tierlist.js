// Custom tier list ("T表"): drag icons from the pool (awakeners, wheels, creations, key tokens, covenants, avatars, monsters)
// into editable tier rows. Supports JSON export / import and a shareable PNG.
(()=>{
  'use strict';
  const zh=()=>localStorage.getItem('morimens.language')!=='en';
  const ui=(cn,en)=>zh()?cn:en;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const STORE='morimens.tierlist.v1';
  const KINDS=[['awakener','唤醒体','Awakeners'],['wheel','命轮','Wheels'],['relic','造物','Creations'],['posse','钥令','Key Tokens'],['covenant','密契','Covenants'],['avatar','头像','Avatars'],['monster','怪物','Monsters']];
  // pool filters: per kind, facet groups of [tag, 中文, English]; items carry tags in `t` (scripts/build_morimens_tier_pool.mjs)
  const REALMS=[['realm:CHAOS','混沌','Chaos'],['realm:CARO','血肉','Caro'],['realm:AEQUOR','深海','Aequor'],['realm:ULTRA','超维','Ultra']];
  const FACETS={
    awakener:[['类型','Type',[['type:ASSAULT','伤害型','Assault'],['type:CHORUS','辅助型','Chorus'],['type:WARDEN','防御型','Warden']]],['界域','Realm',REALMS]],
    wheel:[['主属性','Main stat',[['stat:CRIT_RATE','暴击率','Crit Rate'],['stat:CRIT_DMG','暴击伤害','Crit DMG'],['stat:DMG_AMP','伤害强效','DMG Amp'],['stat:REALM_MASTERY','界域精通','Realm Mastery'],['stat:DEATH_RESISTANCE','死亡抵抗','Death Resistance'],['stat:ALIEMUS_REGEN','Aliemus 回复','Aliemus Regen'],['stat:KEYFLARE_REGEN','钥令回复','Keyflare Regen'],['stat:SIGIL_YIELD','印记产出','Sigil Yield']]],['界域','Realm',[...REALMS,['realm:NEUTRAL','中立','Neutral']]]],
    relic:[['来源','Source',[['src:FADED_LEGACY','忘却篇造物','Faded Legacy'],['src:ASTRAL_REIGN','星辰篇造物','Astral Reign'],['src:DZONE','融灾造物','D-Zone'],['src:PENDULUM','时灵摆（列车）','Chrono Pendulum'],['src:DIMENSIONAL_IMAGE','维度影像','Dimensional Image'],['src:EVENT','活动造物','Event'],['src:OTHER','其他','Other']]]],
    posse:[['界域','Realm',[...REALMS,['realm:FADED_LEGACY','忘却篇','Faded Legacy'],['realm:OTHER','其他','Other']]]],
    monster:[['阶级','Rank',[['rank:Boss','首领','Boss'],['rank:Elite','精英','Elite'],['rank:Normal','普通','Normal']]],['特性','Trait',[['trait:Humanoid','人型','Humanoid'],['trait:Departed','亡灵','Departed'],['trait:Beast','野兽','Beast'],['trait:Insectoid','虫族','Insectoid'],['trait:Plant','植物','Plant'],['trait:Mutant','异变体','Mutant'],['trait:Empty Shell','空壳','Empty Shell'],['trait:Kynde','眷族','Kynde'],['trait:Dominion','主宰','Dominion'],['trait:Awakener','唤醒体','Awakener'],['trait:Sculptors','雕塑家协会','Sculptors'],['trait:Lightbearers','提灯教会','Lightbearers'],['trait:Committee','审查会','Committee'],['trait:Snowfield','雪原','Snowfield'],['trait:Primordial Shadow','原初投影','Primordial Shadow'],['trait:Caro','血肉','Caro'],['trait:Aequor','深海','Aequor'],['trait:Ultra','超维','Ultra'],['trait:Unknown','未知','Unknown']]]]
  };
  const facetSel={};  // kind -> {facetIndex: tag}
  const facetHtml=()=>(FACETS[ui$.kind]||[]).map(([cn,en,opts],fi)=>{
    const cur=(facetSel[ui$.kind]||{})[fi]||'';
    return `<div class="tlFacet"><span class="tlFacetName">${ui(cn,en)}</span><button type="button" class="tlChip${cur?'':' on'}" data-tlfacet="${fi}" data-tlval="">${ui('全部','All')}</button>${opts.map(([t,c,e])=>`<button type="button" class="tlChip${cur===t?' on':''}" data-tlfacet="${fi}" data-tlval="${esc(t)}">${ui(c,e)}</button>`).join('')}</div>`;
  }).join('');
  const DEFAULT_ROWS=[['S','#ff7f7f'],['A','#ffbf7f'],['B','#ffdf7f'],['C','#ffff7f'],['D','#bfff7f']];
  const uid=()=>Math.random().toString(36).slice(2,9);
  const defaults=()=>({title:'',rows:DEFAULT_ROWS.map(([label,color])=>({id:uid(),label,color,items:[]}))});

  let host=null,pool=null,catalog=new Map(),details={},zonesReady=false,state=load(),ui$={kind:'awakener',query:'',hidePlaced:true,selected:null,msg:'',explain:readExplain()};
  function readExplain(){try{return localStorage.getItem(STORE+'.explain')==='1'}catch{return false}}
  function saveExplain(){try{localStorage.setItem(STORE+'.explain',ui$.explain?'1':'0')}catch{}}

  function load(){
    try{const raw=JSON.parse(localStorage.getItem(STORE)||'null');if(raw&&Array.isArray(raw.rows))return raw}catch{}
    return defaults();
  }
  function save(){try{localStorage.setItem(STORE,JSON.stringify(state))}catch{}}
  const key=(kind,id)=>`${kind}:${id}`;
  const itemOf=k=>catalog.get(k);
  const nameOf=it=>it?(zh()?(it.zh||it.en):(it.en||it.zh)):'';
  const placed=()=>{const s=new Set();for(const r of state.rows)for(const k of r.items)s.add(k);return s};

  function ensureStyle(){
    if(document.getElementById('tlStyle'))return;
    const s=document.createElement('style');s.id='tlStyle';
    s.textContent=`
      .tlWrap{display:grid;gap:14px}.tlBar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .tlBar input[type=text]{flex:1 1 220px;min-width:160px;background:#111827;color:#ead9b9;border:1px solid rgba(148,163,184,.3);border-radius:8px;padding:8px 10px;font-size:15px;font-weight:700}
      .tlBtn{background:#1b2536;color:#dbe4f0;border:1px solid rgba(148,163,184,.3);border-radius:8px;padding:7px 12px;font-size:13px;cursor:pointer}.tlBtn:hover{border-color:#f1d69f;color:#f1d69f}
      .tlBtn.primary{background:#3a2f17;border-color:#f1d69f;color:#f1d69f}
      .tlBoard{border:1px solid rgba(148,163,184,.25);border-radius:10px;overflow:hidden;background:#0d121a}
      .tlRow{display:grid;grid-template-columns:110px 1fr 34px;min-height:84px;border-bottom:2px solid #060a10}.tlRow:last-child{border-bottom:0}
      .tlLabel{display:flex;align-items:center;justify-content:center;padding:6px;position:relative}
      .tlLabel{cursor:text}.tlLabel:hover{box-shadow:inset 0 0 0 2px rgba(0,0,0,.25)}
      .tlLabel textarea{cursor:text;width:100%;height:100%;min-height:60px;resize:none;background:transparent;border:0;text-align:center;font-weight:800;font-size:20px;color:#111;outline:none;overflow:hidden;font-family:inherit}
      .tlLabel input[type=color]{position:absolute;right:3px;bottom:3px;width:20px;height:20px;padding:0;border:1px solid rgba(0,0,0,.35);border-radius:5px;background:none;cursor:pointer}
      .tlItems{display:flex;flex-wrap:wrap;gap:4px;padding:4px;align-content:flex-start;background:#1a1f29;min-height:84px;cursor:copy}
      .tlItems.over,.tlPool.over{outline:2px dashed #f1d69f;outline-offset:-3px}
      .tlCtl{display:flex;flex-direction:column;justify-content:center;gap:2px;background:#111721}.tlCtl button{all:unset;cursor:pointer;text-align:center;color:#8290a2;font-size:13px;line-height:20px}.tlCtl button:hover{color:#f1d69f}
      .tlItem{width:76px;height:76px;border-radius:6px;overflow:hidden;background:#0b0f16;position:relative;cursor:grab;flex:none;border:2px solid transparent}
      .tlItem img{width:100%;height:100%;object-fit:cover;display:block;pointer-events:none}
      .tlItem.sel{border-color:#f1d69f}.tlItem.dragging{opacity:.4}
      .tlItem .tlTxt{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;font-size:10px;color:#aab6c8;padding:2px}
      .tlTabs{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.tlTab{background:#111827;color:#aab6c8;border:1px solid rgba(148,163,184,.25);border-radius:999px;padding:5px 13px;font-size:13px;cursor:pointer}
      .tlTab[aria-selected=true]{background:#3a2f17;color:#f1d69f;border-color:#f1d69f}
      .tlFacets{display:flex;flex-direction:column;gap:6px;margin:6px 0}.tlFacet{display:flex;flex-wrap:wrap;gap:5px;align-items:center}.tlFacetName{font-size:12px;color:#8290a2;min-width:52px}.tlChip{border:1px solid rgba(148,163,184,.3);background:#111827;color:#aeb8c7;border-radius:999px;padding:3px 10px;font-size:12px;cursor:pointer}.tlChip:hover{border-color:#f1d69f;color:#f1d69f}.tlChip.on{background:#d5b176;border-color:#d5b176;color:#1a1305;font-weight:700}.tlTools{display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:12px;color:#8290a2}.tlTools input[type=search]{background:#111827;color:#dbe4f0;border:1px solid rgba(148,163,184,.3);border-radius:8px;padding:6px 10px;min-width:180px}
      .tlPool{display:flex;flex-wrap:wrap;gap:4px;padding:8px;border:1px solid rgba(148,163,184,.25);border-radius:10px;background:#0d121a;min-height:110px;max-height:520px;overflow:auto;align-content:flex-start}
      .tlNote{font-size:12px;color:#8290a2;line-height:1.6}.tlMsg{font-size:12px;color:#f1d69f;min-height:18px}
      .tlImport{border:1px solid rgba(148,163,184,.25);border-radius:10px;padding:10px;background:#0d121a}.tlImport textarea{width:100%;min-height:110px;background:#111827;color:#dbe4f0;border:1px solid rgba(148,163,184,.3);border-radius:8px;padding:8px;font-family:ui-monospace,monospace;font-size:12px}
      .tlRow>.tlLabel{grid-column:1;grid-row:1/3}.tlRow>.tlItems{grid-column:2;grid-row:1}.tlRow>.tlCtl{grid-column:3;grid-row:1/3}.tlRow>.tlExpl{grid-column:2;grid-row:2}
      .tlExpl{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:6px;padding:6px 4px 8px;background:#151a23;border-top:1px dashed rgba(148,163,184,.2)}
      .tlCard{display:flex;gap:8px;background:#10161f;border:1px solid #2a3446;border-radius:8px;padding:8px;font-size:12px;line-height:1.55;color:#cbd5e1;min-width:0}
      .tlCard img{width:40px;height:40px;object-fit:cover;border-radius:6px;flex:none;background:#0b0f16}
      .tlCard b{color:#f1d69f;font-size:14px}.tlCard .tlMeta{color:#8fa2bd}.tlCard .tlLine b{font-size:12px;color:#e8c987}
      .tlTip{position:fixed;z-index:9999;max-width:min(380px,92vw);max-height:80vh;overflow:hidden;pointer-events:none;background:#0f1520;border:1px solid #f1d69f;border-radius:10px;padding:10px 12px;box-shadow:0 10px 30px rgba(0,0,0,.55);font-size:12.5px;line-height:1.6;color:#d6deea}
      .tlTip b.tlName{color:#f1d69f;font-size:15px}.tlTip .tlAlt{color:#8290a2;margin-left:6px}.tlTip .tlMeta{color:#8fa2bd;margin:2px 0 4px}.tlTip .tlLine{margin-top:4px}.tlTip .tlLine b{color:#e8c987}
      @media(max-width:640px){.tlRow{grid-template-columns:78px 1fr 30px}.tlItem{width:60px;height:60px}.tlLabel textarea{font-size:16px}}`;
    document.head.appendChild(s);
  }

  async function loadCatalog(){
    if(catalog.size)return;
    const d=await (await fetch('data/morimens/game/tier-pool.json',{cache:'no-cache'})).json();
    for(const [kind,list] of Object.entries(d.kinds||{}))for(const it of list)catalog.set(key(kind,it.id),{...it,kind});
    try{details=(await (await fetch('data/morimens/game/tier-details.json',{cache:'no-cache'})).json()).items||{}}catch{details={}}
  }
  const zones=()=>window.MorimensDtideZones;
  function prepareZones(){
    if(zonesReady||!zones()?.prepare)return;
    zonesReady=true;
    zones().prepare().then(()=>{if(host&&!host.hidden&&ui$.explain)draw()}).catch(()=>{zonesReady=false});
  }

  // ---------- details (tooltip / explanation cards / image) ----------
  const MAX_LINES=10;
  function info(k){
    const it=itemOf(k);if(!it)return null;
    const z=zh(),i=z?0:1,name=nameOf(it);
    const out={name,alt:(z?it.en:it.zh)&&(z?it.en:it.zh)!==name?(z?it.en:it.zh):'',meta:'',lines:[]};
    if(it.kind==='monster'){
      let b=null;try{b=zones()?.brief?.(it.id)}catch{}
      if(b){
        b.traits.forEach(t=>out.lines.push({h:`${ui('特性','Trait')}·${t.h}`,t:t.t}));
        if(b.rot)out.lines.push({h:ui('行动顺序','Rotation'),t:b.rot});
        b.intents.forEach(t=>out.lines.push({h:t.h,t:t.t}));
      }
    }else{
      const d=details[k];
      if(d){out.meta=d.m?.[i]||'';out.lines=(d.x||[]).map(x=>({h:x.h[i],t:x.t[i],en:z&&x.zf===1}))}
    }
    return out;
  }
  const lineHtml=l=>`<div class="tlLine"${l.en?' lang="en"':''}><b>${esc(l.h)}</b>${l.t?`${zh()?'：':': '}${esc(l.t)}`:''}</div>`;
  function bodyHtml(inf,cap){
    const ls=inf.lines.slice(0,cap),more=inf.lines.length-ls.length;
    return `${inf.meta?`<div class="tlMeta">${esc(inf.meta)}</div>`:''}${ls.map(lineHtml).join('')}${more>0?`<div class="tlLine tlMeta">… ${ui(`还有 ${more} 项`,`${more} more`)}</div>`:''}`;
  }
  function explHtml(r){
    const cards=r.items.map(k=>{
      const it=itemOf(k),inf=info(k);if(!it||!inf)return '';
      return `<div class="tlCard"><img src="${esc(it.img)}" alt="" loading="lazy"><div><b>${esc(inf.name)}</b>${inf.alt?` <span class="tlMeta" lang="${zh()?'en':'zh'}">${esc(inf.alt)}</span>`:''}${bodyHtml(inf,MAX_LINES)}</div></div>`;
    }).join('');
    return cards?`<div class="tlExpl">${cards}</div>`:'';
  }
  // hover tooltip
  let tipEl=null;
  function showTip(it,x,y){
    const inf=info(it.dataset.k);if(!inf)return;
    if(!tipEl){tipEl=document.createElement('div');tipEl.className='tlTip';document.body.appendChild(tipEl)}
    tipEl.innerHTML=`<b class="tlName">${esc(inf.name)}</b>${inf.alt?`<span class="tlAlt" lang="${zh()?'en':'zh'}">${esc(inf.alt)}</span>`:''}${bodyHtml(inf,MAX_LINES)}`;
    tipEl.hidden=false;moveTip(x,y);
  }
  function moveTip(x,y){
    if(!tipEl||tipEl.hidden)return;
    const w=tipEl.offsetWidth,h=tipEl.offsetHeight;let left=x+16,top=y+16;
    if(left+w>innerWidth-8)left=Math.max(8,x-w-16);
    if(top+h>innerHeight-8)top=Math.max(8,innerHeight-h-8);
    tipEl.style.left=left+'px';tipEl.style.top=top+'px';
  }
  const hideTip=()=>{if(tipEl)tipEl.hidden=true};

  // ---------- rendering ----------
  function tile(k,extra=''){
    const it=itemOf(k);if(!it)return '';
    const nm=nameOf(it),both=[it.zh,it.en].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' / ');
    return `<div class="tlItem${extra}${ui$.selected===k?' sel':''}" draggable="true" data-k="${esc(k)}" aria-label="${esc(both)}"><img src="${esc(it.img)}" alt="${esc(nm)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.hidden=false"><span class="tlTxt" hidden>${esc(nm)}</span></div>`;
  }
  function draw(){
    if(!host)return;
    const keepScroll=host.querySelector('#tlPool')?.scrollTop||0;
    const kindTabs=KINDS.map(([k,cn,en])=>`<button type="button" class="tlTab" role="tab" data-tlkind="${k}" aria-selected="${ui$.kind===k}">${ui(cn,en)}</button>`).join('');
    host.innerHTML=`<div class="tlWrap">
      <div class="tlBar">
        <input type="text" id="tlTitle" value="${esc(state.title)}" maxlength="60" placeholder="${esc(ui('T表标题（点击编辑）','Tier list title (click to edit)'))}">
        <button type="button" class="tlBtn" data-tl="addrow">＋ ${ui('添加行','Add row')}</button>
        <button type="button" class="tlBtn${ui$.explain?' primary':''}" data-tl="explain" aria-pressed="${ui$.explain}" title="${esc(ui('开启后，拖入 T 表的图标会在该行下方展开详细说明，导出图片时也会带上','When on, icons placed in the tier list show their details below the row, and the shared image includes them'))}">${ui$.explain?ui('关闭标签说明','Hide tag details'):ui('开启标签说明','Show tag details')}</button>
        <button type="button" class="tlBtn" data-tl="export">${ui('导出数据','Export data')}</button>
        <button type="button" class="tlBtn" data-tl="import">${ui('导入数据','Import data')}</button>
        <button type="button" class="tlBtn primary" data-tl="image">${ui('分享图片（下载）','Share image (download)')}</button>
        <button type="button" class="tlBtn" data-tl="clear">${ui('清空放置','Clear placements')}</button>
        <button type="button" class="tlBtn" data-tl="reset">${ui('重置','Reset')}</button>
      </div>
      <div class="tlMsg" id="tlMsg">${esc(ui$.msg)}</div>
      <div id="tlImport" class="tlImport" hidden>
        <div class="tlNote">${ui('选择之前导出的 JSON 文件，或把结构化数据粘贴到下方后点击“解析导入”。','Choose a previously exported JSON file, or paste the data below and click “Parse & import”.')}</div>
        <p><input type="file" id="tlFile" accept="application/json,.json"></p>
        <textarea id="tlPaste" placeholder='{"format":"morimens-tierlist", ...}'></textarea>
        <p><button type="button" class="tlBtn primary" data-tl="parse">${ui('解析导入','Parse & import')}</button> <button type="button" class="tlBtn" data-tl="closeimport">${ui('取消','Cancel')}</button></p>
      </div>
      <div class="tlBoard" id="tlBoard">${state.rows.map((r,i)=>`<div class="tlRow" data-row="${r.id}">
        <div class="tlLabel" style="background:${esc(r.color)}"><textarea data-tllabel="${r.id}" rows="2" maxlength="24" aria-label="${esc(ui('分级名称','Tier label'))}">${esc(r.label)}</textarea><input type="color" value="${esc(r.color)}" data-tlcolor="${r.id}" title="${esc(ui('更改颜色','Change color'))}"></div>
        <div class="tlItems" data-drop="${r.id}">${r.items.map(k=>tile(k)).join('')}</div>
        ${ui$.explain?explHtml(r):''}
        <div class="tlCtl"><button type="button" data-tlren="${r.id}" title="${esc(ui('修改分级名称','Rename tier'))}">✎</button><button type="button" data-tlup="${r.id}" title="${esc(ui('上移','Move up'))}"${i===0?' disabled':''}>▲</button><button type="button" data-tldel="${r.id}" title="${esc(ui('删除此行','Delete row'))}">✕</button><button type="button" data-tldown="${r.id}" title="${esc(ui('下移','Move down'))}"${i===state.rows.length-1?' disabled':''}>▼</button></div>
      </div>`).join('')}</div>
      <div class="tlTabs" role="tablist" aria-label="${esc(ui('图片资源','Image sources'))}">${kindTabs}</div>
      <div class="tlFacets" id="tlFacets">${facetHtml()}</div>
      <div class="tlTools"><input type="search" id="tlSearch" value="${esc(ui$.query)}" placeholder="${esc(ui('搜索名称（中 / 英）','Search name (zh / en)'))}"><label><input type="checkbox" id="tlHide"${ui$.hidePlaced?' checked':''}> ${ui('隐藏已放置','Hide placed')}</label><span id="tlCount"></span></div>
      <div class="tlPool" id="tlPool" data-drop="__pool"></div>
      <div class="tlNote">${ui('操作：把图标拖到分级行里（也可先点选图标，再点击目标行）；已放置的图标可在行之间拖动，双击移回图库。鼠标悬浮在图标上可查看名称和详细属性。数据保存在本机浏览器中。','How to use: drag icons into tier rows (or click an icon, then click a row); drag placed icons between rows, double-click to return one to the pool. Hover an icon for its name and details. Data is kept in this browser.')}</div>
    </div>`;
    pool=host.querySelector('#tlPool');
    drawPool();
    pool.scrollTop=keepScroll;
  }
  function drawPool(){
    if(!pool)return;
    const q=ui$.query.trim().toLowerCase(),used=placed();
    const sel=Object.values(facetSel[ui$.kind]||{}).filter(Boolean);
    const list=[...catalog.values()].filter(it=>it.kind===ui$.kind&&sel.every(t=>(it.t||[]).includes(t))&&(!ui$.hidePlaced||!used.has(key(it.kind,it.id)))&&(!q||(it.zh||'').toLowerCase().includes(q)||(it.en||'').toLowerCase().includes(q)));
    pool.innerHTML=list.map(it=>tile(key(it.kind,it.id))).join('')||`<div class="tlNote">${ui('没有符合条件的图标','No icons match')}</div>`;
    const c=host.querySelector('#tlCount');if(c)c.textContent=`${list.length} ${ui('个','items')}`;
  }
  const say=m=>{ui$.msg=m;const el=host?.querySelector('#tlMsg');if(el)el.textContent=m};

  // ---------- state helpers ----------
  function removeKey(k){for(const r of state.rows)r.items=r.items.filter(x=>x!==k)}
  function place(k,rowId,before){
    const row=state.rows.find(r=>r.id===rowId);if(!row||!itemOf(k))return;
    removeKey(k);
    const at=before?row.items.indexOf(before):-1;
    if(at>=0)row.items.splice(at,0,k);else row.items.push(k);
    save();draw();
  }
  function toPool(k){removeKey(k);save();draw()}

  // ---------- export / import ----------
  function exportData(){
    const rows=state.rows.map(r=>({label:r.label,color:r.color,items:r.items.map(k=>{const it=itemOf(k);const [kind,...rest]=k.split(':');return {kind,id:rest.join(':'),name:it?(it.zh||it.en):''}})}));
    return {format:'morimens-tierlist',version:1,title:state.title,exportedAt:new Date().toISOString(),tiers:rows};
  }
  function download(blob,name){
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  const fileStem=()=>(state.title||'tierlist').replace(/[\\/:*?"<>|\s]+/g,'-').slice(0,40)||'tierlist';
  function importData(text){
    let d;try{d=JSON.parse(text)}catch{say(ui('解析失败：不是有效的 JSON。','Parse failed: not valid JSON.'));return false}
    if(!d||d.format!=='morimens-tierlist'||!Array.isArray(d.tiers)){say(ui('解析失败：不是本站导出的 T 表数据（缺少 format / tiers）。','Parse failed: not data exported by this tool (missing format / tiers).'));return false}
    const byName=new Map();for(const [k,it] of catalog)for(const n of [it.zh,it.en])if(n)byName.set(`${it.kind}|${n.toLowerCase()}`,k);
    let ok=0,skipped=0;const seen=new Set();
    const rows=d.tiers.slice(0,40).map(t=>({id:uid(),label:String(t.label??'').slice(0,24),color:/^#[0-9a-f]{6}$/i.test(t.color)?t.color:'#888888',items:(Array.isArray(t.items)?t.items:[]).map(x=>{
      let k=key(x.kind,x.id);
      if(!itemOf(k)&&x.name)k=byName.get(`${x.kind}|${String(x.name).toLowerCase()}`)||k;
      if(!itemOf(k)||seen.has(k)){skipped++;return null}
      seen.add(k);ok++;return k}).filter(Boolean)}));
    state={title:String(d.title||'').slice(0,60),rows:rows.length?rows:defaults().rows};
    save();draw();
    say(ui(`导入完成：${ok} 个图标${skipped?`，${skipped} 个无法识别已跳过`:''}。`,`Imported ${ok} icon(s)${skipped?`, ${skipped} unrecognised skipped`:''}.`));
    return true;
  }

  // ---------- PNG ----------
  function loadImg(src){return new Promise(res=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>res(null);i.src=src})}
  async function shareImage(btn){
    const before=btn.textContent;btn.disabled=true;btn.textContent=ui('生成中…','Rendering…');
    try{
      const W=1200,PAD=16,LABEL=150,ITEM=84,GAP=4,TOP=78,FOOT=40,innerW=W-PAD*2-LABEL-GAP*2;
      const per=Math.max(1,Math.floor((innerW+GAP)/(ITEM+GAP)));
      const FONT='"Microsoft YaHei",PingFang SC,sans-serif',CW=Math.floor((innerW-GAP)/2),CPAD=8,TXTW=CW-CPAD*3-40,LH=17;
      const mg=document.createElement('canvas').getContext('2d');
      // wrap text for the explanation cards: one CJK character or one Latin word per token
      const wrap=(text,maxW)=>{
        const toks=String(text).match(/[\u2e80-\u9fff\uff00-\uffef]|[^\s\u2e80-\u9fff\uff00-\uffef]+|\s+/g)||[],out=[];let cur='';
        for(const t of toks){
          if(/^\s+$/.test(t)){if(cur&&!cur.endsWith(' '))cur+=' ';continue}
          if(!cur||mg.measureText(cur+t).width<=maxW)cur+=t;else{out.push(cur.trimEnd());cur=t}
          while(mg.measureText(cur).width>maxW&&cur.length>1){let n=cur.length-1;while(n>1&&mg.measureText(cur.slice(0,n)).width>maxW)n--;out.push(cur.slice(0,n));cur=cur.slice(n)}
        }
        if(cur.trim())out.push(cur.trimEnd());return out;
      };
      const model=k=>{
        const inf=info(k),ls=[];if(!inf)return null;
        const add=(text,font,color)=>{mg.font=font;wrap(text,TXTW).forEach(t=>ls.push({t,font,color}))};
        add(inf.name+(inf.alt?`  ${inf.alt}`:''),`700 14px ${FONT}`,'#f1d69f');
        if(inf.meta)add(inf.meta,`12px ${FONT}`,'#8fa2bd');
        const body=inf.lines.slice(0,MAX_LINES);
        body.forEach(l=>add(l.t?`${l.h}${zh()?'：':': '}${l.t}`:l.h,`12px ${FONT}`,'#cbd5e1'));
        if(inf.lines.length>body.length)add(`… ${ui(`还有 ${inf.lines.length-body.length} 项`,`${inf.lines.length-body.length} more`)}`,`12px ${FONT}`,'#8fa2bd');
        return {k,ls,h:Math.max(40,ls.length*LH)+CPAD*2};
      };
      const rows=state.rows.map(r=>{
        const itemsH=Math.max(ITEM+GAP*2+6,Math.ceil(Math.max(1,r.items.length)/per)*(ITEM+GAP)+GAP+2);
        let cards=[],explH=0;
        if(ui$.explain&&r.items.length){
          const ms=r.items.map(model).filter(Boolean),grid=[];
          for(let i=0;i<ms.length;i+=2){const pair=ms.slice(i,i+2),h=Math.max(...pair.map(m=>m.h));grid.push({pair,h})}
          cards=grid;explH=grid.reduce((a,g2)=>a+g2.h+GAP,0)+GAP+2;
        }
        return {...r,itemsH,cards,explH,h:itemsH+explH};
      });
      const H=TOP+rows.reduce((s,r)=>s+r.h+3,0)+FOOT+PAD;
      const cv=document.createElement('canvas');cv.width=W;cv.height=H;const g=cv.getContext('2d');
      g.fillStyle='#0b0f16';g.fillRect(0,0,W,H);
      g.fillStyle='#ead9b9';g.font='700 34px "Microsoft YaHei",PingFang SC,sans-serif';g.textBaseline='middle';
      g.fillText(state.title||ui('我的 T 表','My Tier List'),PAD+4,TOP/2+4);
      const imgs=new Map();
      await Promise.all([...new Set(state.rows.flatMap(r=>r.items))].map(async k=>{const it=itemOf(k);imgs.set(k,it?await loadImg(it.img):null)}));
      let y=TOP;
      for(const r of rows){
        g.fillStyle='#1a1f29';g.fillRect(PAD,y,W-PAD*2,r.h);
        g.fillStyle=r.color;g.fillRect(PAD,y,LABEL,r.h);
        g.fillStyle='#111';g.font='800 28px "Microsoft YaHei",PingFang SC,sans-serif';g.textAlign='center';g.textBaseline='middle';
        const lines=[];let cur='';for(const ch of String(r.label)){if(ch==='\n'||g.measureText(cur+ch).width>LABEL-16){lines.push(cur);cur=ch==='\n'?'':ch}else cur+=ch}lines.push(cur);
        const lh=32,top=y+r.h/2-(lines.length-1)*lh/2;lines.slice(0,4).forEach((ln,i)=>g.fillText(ln,PAD+LABEL/2,top+i*lh));
        g.textAlign='left';
        r.items.forEach((k,i)=>{
          const x=PAD+LABEL+GAP+(i%per)*(ITEM+GAP),yy=y+GAP+Math.floor(i/per)*(ITEM+GAP),im=imgs.get(k);
          g.save();g.beginPath();g.roundRect?g.roundRect(x,yy,ITEM,ITEM,6):g.rect(x,yy,ITEM,ITEM);g.clip();
          g.fillStyle='#0b0f16';g.fillRect(x,yy,ITEM,ITEM);
          if(im){const s=Math.max(ITEM/im.width,ITEM/im.height),w=im.width*s,h=im.height*s;g.drawImage(im,x+(ITEM-w)/2,yy+(ITEM-h)/2,w,h)}
          else{g.fillStyle='#aab6c8';g.font='11px sans-serif';g.textAlign='center';g.fillText(nameOf(itemOf(k)).slice(0,8),x+ITEM/2,yy+ITEM/2);g.textAlign='left'}
          g.restore();
        });
        if(r.cards.length){
          let cy=y+r.itemsH;
          for(const gr of r.cards){
            gr.pair.forEach((m,ci)=>{
              const cx=PAD+LABEL+GAP+ci*(CW+GAP);
              g.fillStyle='#10161f';g.strokeStyle='#2a3446';g.lineWidth=1;g.beginPath();g.roundRect?g.roundRect(cx,cy,CW,gr.h,8):g.rect(cx,cy,CW,gr.h);g.fill();g.stroke();
              const im=imgs.get(m.k);
              g.save();g.beginPath();g.roundRect?g.roundRect(cx+CPAD,cy+CPAD,40,40,6):g.rect(cx+CPAD,cy+CPAD,40,40);g.clip();
              g.fillStyle='#0b0f16';g.fillRect(cx+CPAD,cy+CPAD,40,40);
              if(im){const sc=Math.max(40/im.width,40/im.height),w=im.width*sc,h=im.height*sc;g.drawImage(im,cx+CPAD+(40-w)/2,cy+CPAD+(40-h)/2,w,h)}
              g.restore();
              g.textAlign='left';g.textBaseline='top';
              m.ls.forEach((ln,li)=>{g.font=ln.font;g.fillStyle=ln.color;g.fillText(ln.t,cx+CPAD*2+40,cy+CPAD+li*LH)});
              g.textBaseline='middle';
            });
            cy+=gr.h+GAP;
          }
        }
        y+=r.h+3;
      }
      g.fillStyle='#aab6c8';g.font='14px sans-serif';g.textBaseline='middle';g.textAlign='left';
      const siteUrl=(location.origin&&location.origin!=='null'?location.origin+location.pathname:location.href).replace(/index\.html$/,'');
      g.fillText(siteUrl,PAD+4,H-FOOT/2-2);
      g.fillStyle='#8290a2';g.font='13px sans-serif';g.textAlign='right';
      g.fillText(`${ui('忘忘看报 · 自定义 T 表','Morimens Weekly · Custom Tier List')} · ${new Date().toISOString().slice(0,10)}`,W-PAD-4,H-FOOT/2-2);g.textAlign='left';
      await new Promise(res=>cv.toBlob(b=>{if(b)download(b,`morimens-tierlist-${fileStem()}.png`);res()},'image/png'));
      say(ui('图片已生成并开始下载。','Image generated and downloading.'));
    }catch(e){console.warn('tier image failed',e);say(ui('图片生成失败，请重试。','Image generation failed, please retry.'))}
    finally{btn.disabled=false;btn.textContent=before}
  }

  // ---------- events ----------
  function bind(){
    if(bind.done)return;bind.done=true;
    document.addEventListener('click',e=>{
      if(!host?.contains(e.target))return;
      const t=e.target;
      const b=t.closest('[data-tl]');
      if(b){
        const a=b.dataset.tl;
        if(a==='addrow'){state.rows.push({id:uid(),label:ui('新分级','New'),color:'#9fc5ff',items:[]});save();draw()}
        else if(a==='explain'){ui$.explain=!ui$.explain;saveExplain();if(ui$.explain)prepareZones();hideTip();draw()}
        else if(a==='export'){download(new Blob([JSON.stringify(exportData(),null,2)],{type:'application/json'}),`morimens-tierlist-${fileStem()}.json`);say(ui('结构化数据已导出。','Structured data exported.'))}
        else if(a==='import'){const p=host.querySelector('#tlImport');p.hidden=!p.hidden}
        else if(a==='closeimport'){host.querySelector('#tlImport').hidden=true}
        else if(a==='parse'){if(importData(host.querySelector('#tlPaste').value))host.querySelector('#tlImport')?.setAttribute('hidden','')}
        else if(a==='image'){shareImage(b)}
        else if(a==='clear'){if(confirm(ui('清空所有分级里的图标？','Remove all icons from the tiers?'))){state.rows.forEach(r=>r.items=[]);save();draw()}}
        else if(a==='reset'){if(confirm(ui('重置为默认 T 表？当前内容将丢失。','Reset to the default tier list? Current content will be lost.'))){state=defaults();save();draw()}}
        return;
      }
      const ft=t.closest('[data-tlfacet]');if(ft){const m=facetSel[ui$.kind]||(facetSel[ui$.kind]={});m[ft.dataset.tlfacet]=ft.dataset.tlval;host.querySelector('#tlFacets').innerHTML=facetHtml();drawPool();return}
      const fct=t.closest('[data-tlfacet]');if(fct){const m=facetSel[ui$.kind]||(facetSel[ui$.kind]={});m[fct.dataset.tlfacet]=fct.dataset.tlval;host.querySelector('#tlFacets').innerHTML=facetHtml();drawPool();return}
      const kt=t.closest('[data-tlkind]');if(kt){ui$.kind=kt.dataset.tlkind;ui$.selected=null;draw();return}
      const rn=t.closest('[data-tlren]');
      if(rn){const r=state.rows.find(x=>x.id===rn.dataset.tlren);if(r){const v=prompt(ui('分级名称：','Tier name:'),r.label);if(v!==null){r.label=v.slice(0,24);save();draw()}}return}
      const lab=t.closest('.tlLabel');
      if(lab&&!t.closest('input[type=color]')&&t.tagName!=='TEXTAREA'){const ta=lab.querySelector('textarea');ta?.focus();ta?.select();return}
      const mv=t.closest('[data-tlup],[data-tldown],[data-tldel]');
      if(mv){
        const id=mv.dataset.tlup||mv.dataset.tldown||mv.dataset.tldel,i=state.rows.findIndex(r=>r.id===id);
        if(i<0)return;
        if(mv.dataset.tldel){if(!state.rows[i].items.length||confirm(ui('删除该行？其中的图标会回到图库。','Delete this row? Its icons return to the pool.')))state.rows.splice(i,1)}
        else{const j=mv.dataset.tlup?i-1:i+1;if(j>=0&&j<state.rows.length)[state.rows[i],state.rows[j]]=[state.rows[j],state.rows[i]]}
        save();draw();return;
      }
      const it=t.closest('.tlItem');
      if(it){const k=it.dataset.k;ui$.selected=ui$.selected===k?null:k;host.querySelectorAll('.tlItem.sel').forEach(x=>x.classList.remove('sel'));if(ui$.selected)host.querySelectorAll(`.tlItem[data-k="${CSS.escape(k)}"]`).forEach(x=>x.classList.add('sel'));return}
      const zone=t.closest('[data-drop]');
      if(zone&&ui$.selected){const k=ui$.selected;ui$.selected=null;if(zone.dataset.drop==='__pool')toPool(k);else place(k,zone.dataset.drop)}
    });
    document.addEventListener('dblclick',e=>{const it=e.target.closest?.('.tlItem');if(it&&host?.contains(it)&&it.closest('.tlItems'))toPool(it.dataset.k)});
    document.addEventListener('input',e=>{
      if(!host?.contains(e.target))return;
      const t=e.target;
      if(t.id==='tlTitle'){state.title=t.value;save()}
      else if(t.dataset.tllabel){const r=state.rows.find(x=>x.id===t.dataset.tllabel);if(r){r.label=t.value;save()}}
      else if(t.dataset.tlcolor){const r=state.rows.find(x=>x.id===t.dataset.tlcolor);if(r){r.color=t.value;t.closest('.tlLabel').style.background=t.value;save()}}
      else if(t.id==='tlSearch'){ui$.query=t.value;drawPool()}
    });
    document.addEventListener('change',e=>{
      if(!host?.contains(e.target))return;
      const t=e.target;
      if(t.id==='tlHide'){ui$.hidePlaced=t.checked;drawPool()}
      else if(t.id==='tlFile'&&t.files?.[0]){const f=t.files[0],rd=new FileReader();rd.onload=()=>{if(importData(String(rd.result)))host.querySelector('#tlImport')?.setAttribute('hidden','')};rd.readAsText(f);t.value=''}
    });
    document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.dataset?.tllabel&&host?.contains(e.target)){e.preventDefault();e.target.blur()}});
    // drag & drop
    let dragKey=null;
    document.addEventListener('dragstart',e=>{const it=e.target.closest?.('.tlItem');if(!it||!host?.contains(it))return;dragKey=it.dataset.k;it.classList.add('dragging');e.dataTransfer.effectAllowed='move';try{e.dataTransfer.setData('text/plain',dragKey)}catch{}});
    document.addEventListener('dragend',()=>{dragKey=null;host?.querySelectorAll('.dragging,.over').forEach(x=>x.classList.remove('dragging','over'))});
    document.addEventListener('dragover',e=>{const z=e.target.closest?.('[data-drop]');if(!z||!host?.contains(z)||!dragKey)return;e.preventDefault();host.querySelectorAll('.over').forEach(x=>{if(x!==z)x.classList.remove('over')});z.classList.add('over')});
    document.addEventListener('drop',e=>{
      const z=e.target.closest?.('[data-drop]');if(!z||!host?.contains(z)||!dragKey)return;
      e.preventDefault();const k=dragKey;dragKey=null;
      if(z.dataset.drop==='__pool'){toPool(k);return}
      const target=e.target.closest('.tlItem');
      place(k,z.dataset.drop,target&&target.dataset.k!==k?target.dataset.k:undefined);
    });
    document.addEventListener('mouseover',e=>{const it=e.target.closest?.('.tlItem');if(it&&host?.contains(it)&&!dragKey)showTip(it,e.clientX,e.clientY)});
    document.addEventListener('mousemove',e=>{if(tipEl&&!tipEl.hidden)moveTip(e.clientX,e.clientY)});
    document.addEventListener('mouseout',e=>{const it=e.target.closest?.('.tlItem');if(it&&!it.contains(e.relatedTarget))hideTip()});
    document.addEventListener('dragstart',hideTip,true);
    window.addEventListener('scroll',hideTip,true);
    window.addEventListener('morimens-language-change',()=>{hideTip();if(host&&!host.hidden)draw()});
  }

  async function open(){
    host=document.getElementById('morimensTierPanel');if(!host)return;
    ensureStyle();bind();
    host.innerHTML=`<div class="tlNote">${ui('正在加载图片资源…','Loading image pool…')}</div>`;
    try{await loadCatalog();prepareZones();draw()}catch(e){host.innerHTML=`<div class="tlNote">${ui('图片资源加载失败：','Failed to load the image pool: ')}${esc(e.message)}</div>`}
  }
  window.MorimensTierList={open};
})();

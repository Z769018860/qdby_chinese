// Custom tier list ("T表"): drag icons from the pool (awakeners, wheels, creations, key tokens, covenants, avatars, monsters)
// into editable tier rows. Supports JSON export / import and a shareable PNG.
(()=>{
  'use strict';
  const zh=()=>localStorage.getItem('morimens.language')!=='en';
  const ui=(cn,en)=>zh()?cn:en;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const STORE='morimens.tierlist.v1';
  const KINDS=[['awakener','唤醒体','Awakeners'],['wheel','命轮','Wheels'],['relic','造物','Creations'],['posse','钥令','Key Tokens'],['covenant','密契','Covenants'],['avatar','头像','Avatars'],['monster','怪物','Monsters']];
  const DEFAULT_ROWS=[['S','#ff7f7f'],['A','#ffbf7f'],['B','#ffdf7f'],['C','#ffff7f'],['D','#bfff7f']];
  const uid=()=>Math.random().toString(36).slice(2,9);
  const defaults=()=>({title:'',rows:DEFAULT_ROWS.map(([label,color])=>({id:uid(),label,color,items:[]}))});

  let host=null,pool=null,catalog=new Map(),state=load(),ui$={kind:'awakener',query:'',hidePlaced:true,selected:null,msg:''};

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
      .tlTools{display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:12px;color:#8290a2}.tlTools input[type=search]{background:#111827;color:#dbe4f0;border:1px solid rgba(148,163,184,.3);border-radius:8px;padding:6px 10px;min-width:180px}
      .tlPool{display:flex;flex-wrap:wrap;gap:4px;padding:8px;border:1px solid rgba(148,163,184,.25);border-radius:10px;background:#0d121a;min-height:110px;max-height:520px;overflow:auto;align-content:flex-start}
      .tlNote{font-size:12px;color:#8290a2;line-height:1.6}.tlMsg{font-size:12px;color:#f1d69f;min-height:18px}
      .tlImport{border:1px solid rgba(148,163,184,.25);border-radius:10px;padding:10px;background:#0d121a}.tlImport textarea{width:100%;min-height:110px;background:#111827;color:#dbe4f0;border:1px solid rgba(148,163,184,.3);border-radius:8px;padding:8px;font-family:ui-monospace,monospace;font-size:12px}
      @media(max-width:640px){.tlRow{grid-template-columns:78px 1fr 30px}.tlItem{width:60px;height:60px}.tlLabel textarea{font-size:16px}}`;
    document.head.appendChild(s);
  }

  async function loadCatalog(){
    if(catalog.size)return;
    const d=await (await fetch('data/morimens/game/tier-pool.json',{cache:'no-cache'})).json();
    for(const [kind,list] of Object.entries(d.kinds||{}))for(const it of list)catalog.set(key(kind,it.id),{...it,kind});
  }

  // ---------- rendering ----------
  function tile(k,extra=''){
    const it=itemOf(k);if(!it)return '';
    const nm=nameOf(it),both=[it.zh,it.en].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' / ');
    return `<div class="tlItem${extra}${ui$.selected===k?' sel':''}" draggable="true" data-k="${esc(k)}" title="${esc(both)}"><img src="${esc(it.img)}" alt="${esc(nm)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.hidden=false"><span class="tlTxt" hidden>${esc(nm)}</span></div>`;
  }
  function draw(){
    if(!host)return;
    const keepScroll=host.querySelector('#tlPool')?.scrollTop||0;
    const kindTabs=KINDS.map(([k,cn,en])=>`<button type="button" class="tlTab" role="tab" data-tlkind="${k}" aria-selected="${ui$.kind===k}">${ui(cn,en)}</button>`).join('');
    host.innerHTML=`<div class="tlWrap">
      <div class="tlBar">
        <input type="text" id="tlTitle" value="${esc(state.title)}" maxlength="60" placeholder="${esc(ui('T表标题（点击编辑）','Tier list title (click to edit)'))}">
        <button type="button" class="tlBtn" data-tl="addrow">＋ ${ui('添加行','Add row')}</button>
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
        <div class="tlCtl"><button type="button" data-tlren="${r.id}" title="${esc(ui('修改分级名称','Rename tier'))}">✎</button><button type="button" data-tlup="${r.id}" title="${esc(ui('上移','Move up'))}"${i===0?' disabled':''}>▲</button><button type="button" data-tldel="${r.id}" title="${esc(ui('删除此行','Delete row'))}">✕</button><button type="button" data-tldown="${r.id}" title="${esc(ui('下移','Move down'))}"${i===state.rows.length-1?' disabled':''}>▼</button></div>
      </div>`).join('')}</div>
      <div class="tlTabs" role="tablist" aria-label="${esc(ui('图片资源','Image sources'))}">${kindTabs}</div>
      <div class="tlTools"><input type="search" id="tlSearch" value="${esc(ui$.query)}" placeholder="${esc(ui('搜索名称（中 / 英）','Search name (zh / en)'))}"><label><input type="checkbox" id="tlHide"${ui$.hidePlaced?' checked':''}> ${ui('隐藏已放置','Hide placed')}</label><span id="tlCount"></span></div>
      <div class="tlPool" id="tlPool" data-drop="__pool"></div>
      <div class="tlNote">${ui('操作：把图标拖到分级行里（也可先点选图标，再点击目标行）；已放置的图标可在行之间拖动，双击移回图库。数据保存在本机浏览器中。','How to use: drag icons into tier rows (or click an icon, then click a row); drag placed icons between rows, double-click to return one to the pool. Data is kept in this browser.')}</div>
    </div>`;
    pool=host.querySelector('#tlPool');
    drawPool();
    pool.scrollTop=keepScroll;
  }
  function drawPool(){
    if(!pool)return;
    const q=ui$.query.trim().toLowerCase(),used=placed();
    const list=[...catalog.values()].filter(it=>it.kind===ui$.kind&&(!ui$.hidePlaced||!used.has(key(it.kind,it.id)))&&(!q||(it.zh||'').toLowerCase().includes(q)||(it.en||'').toLowerCase().includes(q)));
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
      const rows=state.rows.map(r=>({...r,h:Math.max(ITEM+GAP*2+6,Math.ceil(Math.max(1,r.items.length)/per)*(ITEM+GAP)+GAP+2)}));
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
        else if(a==='export'){download(new Blob([JSON.stringify(exportData(),null,2)],{type:'application/json'}),`morimens-tierlist-${fileStem()}.json`);say(ui('结构化数据已导出。','Structured data exported.'))}
        else if(a==='import'){const p=host.querySelector('#tlImport');p.hidden=!p.hidden}
        else if(a==='closeimport'){host.querySelector('#tlImport').hidden=true}
        else if(a==='parse'){if(importData(host.querySelector('#tlPaste').value))host.querySelector('#tlImport')?.setAttribute('hidden','')}
        else if(a==='image'){shareImage(b)}
        else if(a==='clear'){if(confirm(ui('清空所有分级里的图标？','Remove all icons from the tiers?'))){state.rows.forEach(r=>r.items=[]);save();draw()}}
        else if(a==='reset'){if(confirm(ui('重置为默认 T 表？当前内容将丢失。','Reset to the default tier list? Current content will be lost.'))){state=defaults();save();draw()}}
        return;
      }
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
    window.addEventListener('morimens-language-change',()=>{if(host&&!host.hidden)draw()});
  }

  async function open(){
    host=document.getElementById('morimensTierPanel');if(!host)return;
    ensureStyle();bind();
    host.innerHTML=`<div class="tlNote">${ui('正在加载图片资源…','Loading image pool…')}</div>`;
    try{await loadCatalog();draw()}catch(e){host.innerHTML=`<div class="tlNote">${ui('图片资源加载失败：','Failed to load the image pool: ')}${esc(e.message)}</div>`}
  }
  window.MorimensTierList={open};
})();

(()=>{
  if(window.MorimensDzoneImport)return;
  const $=id=>document.getElementById(id);
  const WALINE_SERVER='https://textbox.qingdengbuyi.top';
  const SUBMISSION_PATH='/__morimens_dzone_submissions__/';
  const SUBMISSION_MARKER='MORIMENS_DZONE_V1';
  const MAX_PASTE_BYTES=6*1024*1024;
  const HISTORY_LIMIT=8;
  let mounted=false,syncing=false,submissionHistory=[],lastSyncAt=0;

  const zh=()=>localStorage.getItem('morimens.language')!=='en';
  const ui=(cn,en)=>zh()?cn:en;
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  function decodeMojibake(value){
    const text=String(value??'');
    if(!/[ÃÂæåçèéêëìíîïðñòóôõö÷øùúûüýþã]/.test(text)||typeof TextDecoder==='undefined')return text;
    try{
      const bytes=Uint8Array.from([...text].map(ch=>ch.charCodeAt(0)&255));
      const fixed=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      return /�/.test(fixed)?text:fixed;
    }catch{return text}
  }
  const cleanName=value=>decodeMojibake(value).replace(/^<#[^>]+>\s*/,'').trim();
  function formatTime(value){
    const d=value?new Date(value):null;
    return d&&!Number.isNaN(d.getTime())?d.toLocaleString(zh()?'zh-CN':'en-US'):'—';
  }
  function status(message,type=''){
    const el=$('dtideCommunityImportStatus');if(!el)return;
    el.className='dtideCommunityImportStatus'+(type?' '+type:'');
    el.textContent=message||'';
  }
  function context(){return window.MorimensDtideCommunity?.getContext?.()||null}
  function selectedSeasonId(){
    const importSelected=String($('dtideCommunitySeason')?.value||'').trim();
    if(/^\d+$/.test(importSelected)){const value=Number(importSelected);if(Number.isFinite(value)&&value>0)return value}
    const ctx=context();
    const contextSeason=Number(ctx?.selectedSeasonId||ctx?.currentSeason||0);
    if(Number.isFinite(contextSeason)&&contextSeason>0)return contextSeason;
    const selected=String($('dtideSeason')?.value||'').trim();
    if(/^\d+$/.test(selected)){const value=Number(selected);if(Number.isFinite(value)&&value>0)return value}
    return 0;
  }
  function canSubmitSeason(){
    const seasonId=selectedSeasonId(),ctx=context();
    if(!seasonId)return false;
    const known=ctx?.availableSeasons||[];
    return !known.length||known.some(entry=>Number(entry?.seasonId)===seasonId);
  }
  function syncSeasonOptions(){
    const select=$('dtideCommunitySeason');if(!select)return;
    const ctx=context(),known=(ctx?.availableSeasons||[]).filter(entry=>Number(entry?.seasonId)>0);
    const previous=String(select.value||'');
    const fallback=String(ctx?.selectedSeasonId||ctx?.currentSeason||'');
    if(known.length){
      select.innerHTML=known.map(entry=>`<option value="${esc(entry.seasonId)}">${esc(zh()?(entry.labelZh||('第 '+entry.seasonId+' 期融灾')):(entry.labelEn||('Season '+entry.seasonId+' D-Zone')))}${entry.periodShort?' · '+esc(entry.periodShort):''}</option>`).join('');
      if(previous&&known.some(entry=>String(entry.seasonId)===previous))select.value=previous;
      else if(fallback&&known.some(entry=>String(entry.seasonId)===fallback))select.value=fallback;
      else if(select.options.length)select.selectedIndex=0;
    }else if(!select.options.length&&fallback){
      select.innerHTML=`<option value="${esc(fallback)}">${ui('第 '+fallback+' 期融灾','Season '+fallback+' D-Zone')}</option>`;
      select.value=fallback;
    }
  }

  function injectStyle(){
    if($('morimensDzoneImportStyle'))return;
    const s=document.createElement('style');s.id='morimensDzoneImportStyle';s.textContent=`
      .dtideCommunityImport{margin:13px 0 2px;border:1px solid rgba(88,220,246,.22);border-radius:14px;background:linear-gradient(145deg,rgba(14,28,40,.84),rgba(10,18,27,.72));overflow:hidden}
      .dtideCommunityImport>summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:13px 15px;color:#dff8ff}
      .dtideCommunityImport>summary::-webkit-details-marker{display:none}.dtideCommunityImport>summary strong{font-size:13px;color:#81e8fb}.dtideCommunityImport>summary span{font-size:10px;color:#8998aa;text-align:right}
      .dtideCommunityImport[open]>summary{border-bottom:1px solid rgba(88,220,246,.14);background:rgba(88,220,246,.035)}
      .dtideCommunityImportBody{padding:15px}.dtideCommunityImportGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .dtideCommunityImportGrid label{display:flex;flex-direction:column;gap:6px;color:#8f9daf;font-size:10px}.dtideCommunityImportGrid input,.dtideCommunityImportGrid select{width:100%;min-height:39px;border:1px solid rgba(148,163,184,.2);border-radius:9px;background:#0d1621;color:#e9eef5;padding:0 10px;outline:none}
      .dtideCommunityImportGrid input:focus,.dtideCommunityImportGrid select:focus,.dtideCommunityImport textarea:focus{border-color:rgba(88,220,246,.55);box-shadow:0 0 0 3px rgba(88,220,246,.07)}
      .dtideCommunityUrl{margin-top:11px;padding:9px 11px;border-radius:9px;background:#0a1119;border:1px solid rgba(148,163,184,.14);color:#8ea0b3;font-size:9px;word-break:break-all}.dtideCommunityUrl code{color:#bfeaf3}
      .dtideCommunitySteps{margin-top:12px;padding:11px 12px;border:1px solid rgba(148,163,184,.14);border-radius:10px;background:rgba(5,10,16,.22);color:#8291a3;font-size:9px;line-height:1.7}
      .dtideCommunityActions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.dtideCommunityActions button,.dtideCommunityActions a{display:inline-flex;align-items:center;justify-content:center;min-height:35px;padding:7px 11px;border:1px solid rgba(88,220,246,.28);border-radius:8px;background:rgba(88,220,246,.08);color:#bceffa;font:700 10px/1.25 inherit;text-decoration:none;cursor:pointer}.dtideCommunityActions button:hover,.dtideCommunityActions a:hover{background:rgba(88,220,246,.14)}.dtideCommunityActions [aria-disabled="true"],.dtideCommunityActions button:disabled{opacity:.5;cursor:not-allowed}
      .dtideCommunityImport textarea{width:100%;min-height:150px;resize:vertical;margin-top:10px;border:1px solid rgba(148,163,184,.2);border-radius:9px;background:#0a1119;color:#dfe8f2;padding:10px;outline:none;font:10px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace}
      .dtideCommunityImportStatus{margin-top:10px;color:#9fb4c9;font-size:10px;line-height:1.6}.dtideCommunityImportStatus.ok{color:#9de0ba}.dtideCommunityImportStatus.error{color:#f0a1a1}
      .dtideCommunityHistory{margin-top:13px;border-top:1px solid rgba(148,163,184,.12);padding-top:10px}.dtideCommunityHistoryHead{display:flex;justify-content:space-between;gap:8px;align-items:center;color:#b9c6d4;font-size:10px;font-weight:800}.dtideCommunityHistoryRows{margin-top:5px}.dtideCommunityHistoryRow{display:grid;grid-template-columns:minmax(90px,.8fr) minmax(110px,1fr) minmax(110px,1fr);gap:8px;padding:6px 0;border-bottom:1px solid rgba(148,163,184,.08);color:#7f8da1;font-size:9px}.dtideCommunityHistoryRow b{color:#d8e2ec}.dtideCommunityCurrentNote{margin-top:10px;padding:9px 11px;border-radius:9px;background:rgba(217,179,108,.07);border:1px solid rgba(217,179,108,.18);color:#cbb88f;font-size:9px;line-height:1.55}
      @media(max-width:620px){.dtideCommunityImportGrid{grid-template-columns:1fr}.dtideCommunityImport>summary{align-items:flex-start;flex-direction:column}.dtideCommunityImport>summary span{text-align:left}.dtideCommunityHistoryRow{grid-template-columns:1fr}.dtideCommunityHistoryRow span{display:block}}
    `;document.head.appendChild(s);
  }

  function mount(){
    if(mounted&&$('dtideCommunityImport')){refreshUi();return}
    const anchor=$('dtideStatus');
    if(!anchor)return;
    injectStyle();
    const box=document.createElement('details');box.id='dtideCommunityImport';box.className='dtideCommunityImport';
    box.innerHTML=`
      <summary><strong id="dtideCommunityImportTitle">${ui('自行导入融灾数据','Import D-Zone Data')}</strong><span id="dtideCommunityImportSummary">${ui('选择融灾期次并粘贴 Eremora 完整挑战数据，可补充当期或历史期次','Choose a D-Zone season and paste full Eremora challenge data for current or historical seasons')}</span></summary>
      <div class="dtideCommunityImportBody">
        <div class="dtideCommunityImportGrid">
          <label><span>${ui('融灾赛季期次','D-Zone Season')}</span><select id="dtideCommunitySeason" aria-label="${ui('融灾赛季期次','D-Zone Season')}"></select></label>
          <label><span>${ui('玩家 UID','Player UID')}</span><input id="dtideCommunityUid" inputmode="numeric" autocomplete="off" placeholder="100167859"></label>
          <label><span>${ui('更新人昵称（选填）','Contributor nickname (optional)')}</span><input id="dtideCommunityNick" maxlength="32" autocomplete="nickname" placeholder="${ui('留空则记为匿名','Blank = Anonymous')}"></label>
        </div>
        <div id="dtideCommunityUrl" class="dtideCommunityUrl">${ui('选择期次并填写 UID 后会生成对应 Eremora 数据地址。','Choose a season and enter a UID to generate the matching Eremora data URL.')}</div>
        <div class="dtideCommunityActions">
          <a id="dtideCommunityOpen" href="#" target="_blank" rel="noopener noreferrer" aria-disabled="true">${ui('打开数据页','Open Data Page')}</a>
          <button id="dtideCommunityCopyUrl" type="button">${ui('复制地址','Copy URL')}</button>
        </div>
        <div class="dtideCommunitySteps">${ui('操作：选择融灾期次 → 填写 UID → 打开数据页 → 全选复制页面中的 __data.json 内容 → 粘贴到下面 → 解析并提交。同一期同一 UID 的较新提交会覆盖旧社区提交；查看对应期次榜单时会自动合并社区补充。','Steps: choose a D-Zone season → enter UID → open the data page → copy all __data.json content → paste below → parse and submit. Newer submissions supersede older community submissions for the same UID and season, and are merged when viewing that season.')}</div>
        <textarea id="dtideCommunityPaste" spellcheck="false" placeholder="${ui('在这里粘贴 Eremora /__data.json 页面内容……','Paste the Eremora /__data.json page content here…')}"></textarea>
        <div class="dtideCommunityActions">
          <button id="dtideCommunityClipboard" type="button">${ui('从剪贴板读取','Read Clipboard')}</button>
          <button id="dtideCommunitySubmit" type="button">${ui('解析并提交','Parse & Submit')}</button>
          <button id="dtideCommunityRefresh" type="button">${ui('刷新社区补充','Refresh Community Data')}</button>
        </div>
        <div id="dtideCommunityImportStatus" class="dtideCommunityImportStatus"></div>
        <div id="dtideCommunityCurrentNote" class="dtideCommunityCurrentNote"></div>
        <div class="dtideCommunityHistory">
          <div class="dtideCommunityHistoryHead"><span>${ui('最近自行更新记录','Recent Community Updates')}</span><span id="dtideCommunityHistoryCount">0</span></div>
          <div id="dtideCommunityHistoryRows" class="dtideCommunityHistoryRows"></div>
        </div>
      </div>`;
    const host=anchor.closest('.dtideHero')||anchor.parentElement||anchor;
    host.insertAdjacentElement('afterend',box);
    mounted=true;
    syncSeasonOptions();
    $('dtideCommunitySeason')?.addEventListener('change',()=>{updateUrlPreview();renderHistory();refreshUi(false)});
    const uidInput=$('dtideCommunityUid');
    uidInput?.addEventListener('input',updateUrlPreview);
    uidInput?.addEventListener('change',updateUrlPreview);
    uidInput?.addEventListener('keyup',updateUrlPreview);
    uidInput?.addEventListener('paste',()=>setTimeout(updateUrlPreview,0));
    uidInput?.addEventListener('focus',updateUrlPreview);
    box.addEventListener('toggle',()=>{if(box.open)updateUrlPreview()});
    $('dtideSeason')?.addEventListener('change',()=>setTimeout(()=>{syncSeasonOptions();updateUrlPreview()},0));
    $('dtideCommunityCopyUrl')?.addEventListener('click',copyImportUrl);
    $('dtideCommunityClipboard')?.addEventListener('click',readClipboard);
    $('dtideCommunitySubmit')?.addEventListener('click',submitPasted);
    $('dtideCommunityRefresh')?.addEventListener('click',()=>syncCommunity(true));
    $('dtideCommunityOpen')?.addEventListener('click',event=>{if(event.currentTarget.getAttribute('aria-disabled')==='true')event.preventDefault()});
    refreshUi();
    setTimeout(updateUrlPreview,0);
    setTimeout(updateUrlPreview,250);
    setTimeout(updateUrlPreview,1000);
  }

  function refreshUi(syncOptions=true){
    if(!$('dtideCommunityImport'))return;
    if(syncOptions)syncSeasonOptions();
    $('dtideCommunityImportTitle').textContent=ui('自行导入融灾数据','Import D-Zone Data');
    $('dtideCommunityImportSummary').textContent=ui('选择融灾期次并粘贴 Eremora 完整挑战数据，可补充当期或历史期次','Choose a D-Zone season and paste full Eremora challenge data for current or historical seasons');
    const ctx=context(),note=$('dtideCommunityCurrentNote'),submit=$('dtideCommunitySubmit'),seasonId=selectedSeasonId();
    if(note){
      if(!seasonId)note.textContent=ui('请选择要导入的融灾期次。','Choose the D-Zone season to import.');
      else note.textContent=ui(`当前将提交第 ${seasonId} 期。社区数据按“期次 + UID”独立保存；查看第 ${seasonId} 期榜单时会自动合并，不会改动官方排名索引。`,`Submission target: Season ${seasonId}. Community data is stored separately by season + UID and is merged when viewing Season ${seasonId}; official rank indexes are not modified.`);
    }
    if(submit)submit.disabled=!canSubmitSeason();
    updateUrlPreview();
    renderHistory();
  }

  function importUrl(){
    const uid=String($('dtideCommunityUid')?.value||'').trim(),seasonId=selectedSeasonId();
    if(!/^\d{5,20}$/.test(uid)||!seasonId)return '';
    return `https://eremora.com/u/${encodeURIComponent(uid)}/challenges/dzone/${seasonId}/__data.json`;
  }
  function updateUrlPreview(){
    const url=importUrl(),preview=$('dtideCommunityUrl'),link=$('dtideCommunityOpen');
    if(url){
      if(preview)preview.innerHTML='<code>'+esc(url)+'</code>';
      if(link){link.href=url;link.setAttribute('aria-disabled','false')}
    }else{
      if(preview)preview.textContent=ui('选择期次并填写 UID 后会生成对应 Eremora 数据地址。','Choose a season and enter a UID to generate the matching Eremora data URL.');
      if(link){link.href='#';link.setAttribute('aria-disabled','true')}
    }
  }
  async function copyText(value){
    if(navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(value);return true}catch(_){}}
    const ta=document.createElement('textarea');ta.value=value;ta.style.position='fixed';ta.style.left='-9999px';document.body.appendChild(ta);ta.select();
    let ok=false;try{ok=!!document.execCommand('copy')}catch(_){}
    ta.remove();return ok;
  }
  async function copyImportUrl(){
    const url=importUrl();
    if(!url){status(ui('请先填写正确的 UID。','Enter a valid UID first.'),'error');return}
    const ok=await copyText(url);
    status(ok?ui('数据地址已复制。','Data URL copied.'):ui('浏览器禁止自动复制，请手动复制上方地址。','Automatic copy is blocked; copy the URL above manually.'),ok?'ok':'error');
  }
  async function readClipboard(){
    try{
      if(!navigator.clipboard?.readText)throw new Error(ui('当前浏览器不支持直接读取剪贴板，请手动粘贴。','This browser cannot read the clipboard directly; paste manually.'));
      const text=await navigator.clipboard.readText();
      if(!text.trim())throw new Error(ui('剪贴板为空。','Clipboard is empty.'));
      if(text.length>MAX_PASTE_BYTES)throw new Error(ui('剪贴板内容过大，超过 6 MB。','Clipboard content exceeds 6 MB.'));
      $('dtideCommunityPaste').value=text;
      status(ui('已读取剪贴板，可以点击“解析并提交”。','Clipboard loaded. Click “Parse & Submit”.'),'ok');
    }catch(error){status(error?.message||String(error),'error')}
  }

  class Hydrator{
    constructor(values){this.values=values;this.memo=new Map();this.active=new Set()}
    h(ref){
      if(typeof ref!=='number'||!Number.isInteger(ref))return ref;
      if(ref<0)return ref===-6?0:null;
      if(this.memo.has(ref))return this.memo.get(ref);
      if(ref>=this.values.length)return ref;
      if(this.active.has(ref))return this.memo.get(ref);
      const value=this.values[ref];
      if(value==null||typeof value==='string'||typeof value==='number'||typeof value==='boolean'){this.memo.set(ref,value);return value}
      this.active.add(ref);
      let out;
      if(Array.isArray(value)){
        if(value.length&&typeof value[0]==='string'){
          const tag=value[0];
          if(tag==='Date')out=value.length>1?value[1]:null;
          else if(tag==='Set'){out=[];this.memo.set(ref,out);for(const x of value.slice(1))out.push(this.h(x))}
          else if(tag==='Map'){out=[];this.memo.set(ref,out);for(let i=1;i<value.length;i+=2)out.push({key:this.h(value[i]),value:i+1<value.length?this.h(value[i+1]):null})}
          else if(tag==='RegExp')out={__type:'RegExp',pattern:value[1]||'',flags:value[2]||''};
          else if(tag==='BigInt')out=String(value[1]??'');
          else if(tag==='Object')out=value.length>1?this.h(value[1]):{};
          else if(tag==='null'){out={};this.memo.set(ref,out);for(let i=1;i<value.length;i+=2)out[String(value[i])]=i+1<value.length?this.h(value[i+1]):null}
          else if(tag==='Promise')out={__promise:value.length>1?this.h(value[1]):null};
          else{out=[tag];this.memo.set(ref,out);for(const x of value.slice(1))out.push(typeof x==='number'&&!Number.isNaN(x)?this.h(x):x)}
        }else{
          out=[];this.memo.set(ref,out);
          for(const x of value)out.push(x===-2?null:this.h(x));
        }
      }else if(typeof value==='object'){
        out={};this.memo.set(ref,out);
        for(const [key,val] of Object.entries(value))out[key]=this.h(val);
      }else out=value;
      this.memo.set(ref,out);this.active.delete(ref);return out;
    }
  }
  function unflatten(value){return Array.isArray(value)?new Hydrator(value).h(0):value}
  function parseDocs(text){
    let raw=String(text??'').replace(/^\uFEFF/,'').trim();
    if(!raw)throw new Error(ui('没有可解析的数据。','No data to parse.'));
    if(raw.length>MAX_PASTE_BYTES)throw new Error(ui('粘贴内容超过 6 MB，请确认复制的是单个 UID 的数据页。','Pasted content exceeds 6 MB. Copy one UID data page only.'));
    raw=raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
    const docs=[];
    for(const line of raw.split(/\r?\n/)){
      const s=line.trim();
      if(!s||s==='```'||s.startsWith('Title:')||s.startsWith('URL Source:')||s.startsWith('Published Time:'))continue;
      try{const obj=JSON.parse(s);if(obj&&typeof obj==='object')docs.push(obj)}catch(_){}
    }
    if(!docs.length){
      try{const obj=JSON.parse(raw);if(obj&&typeof obj==='object')docs.push(obj)}catch(_){}
    }
    if(!docs.length)throw new Error(ui('没有识别到 Eremora __data.json 文档。','No Eremora __data.json document was recognized.'));
    return docs;
  }
  function decodePayload(text){
    const docs=parseDocs(text),roots=[];
    for(const doc of docs){
      if(doc?.type==='data'&&Array.isArray(doc.nodes))for(const node of doc.nodes||[])if(Array.isArray(node?.data)){try{roots.push(unflatten(node.data))}catch(_){}}
      if(doc?.type==='chunk'&&Array.isArray(doc.data)){try{roots.push(unflatten(doc.data))}catch(_){}}
    }
    if(!roots.length)throw new Error(ui('没有识别到可解码的 Eremora 数据块。','No decodable Eremora data chunks were found.'));
    return {docs,roots};
  }
  function walk(root,callback){
    const seen=new WeakSet();
    const rec=(value,path='$')=>{
      if(!value||typeof value!=='object'||seen.has(value))return;
      seen.add(value);callback(value,path);
      if(Array.isArray(value))value.forEach((child,index)=>rec(child,`${path}[${index}]`));
      else for(const [key,child] of Object.entries(value))rec(child,`${path}.${key}`);
    };
    rec(root);
  }
  function numberOrNull(value){
    if(value==null||typeof value==='boolean'||value==='')return null;
    const n=Number(value);return Number.isFinite(n)?n:null;
  }
  function findActivities(decoded){
    const found=[];
    for(const root of decoded.roots)walk(root,(value,path)=>{
      if(!value||Array.isArray(value))return;
      const activity=value.activity,stages=value.stages;
      if(!activity||typeof activity!=='object'||!Array.isArray(stages))return;
      const name=String(activity.name||'');
      if(!/Dissoluted Abyss|D[- ]?Zone/i.test(name)&&activity.period==null)return;
      const period=numberOrNull(activity.period);
      if(period!=null)found.push({path,node:value,period:Math.trunc(period),stageCount:stages.length});
    });
    const best=new Map();
    for(const item of found){
      const key=`${item.period}:${item.node?.activity_tid??''}`,old=best.get(key);
      if(!old||item.stageCount>old.stageCount)best.set(key,item);
    }
    return [...best.values()].sort((a,b)=>b.period-a.period||b.stageCount-a.stageCount);
  }
  function findMediaBase(decoded){
    let found='';
    for(const root of decoded.roots){
      walk(root,value=>{if(!found&&!Array.isArray(value)&&typeof value.mediaBase==='string')found=value.mediaBase});
      if(found)break;
    }
    return found;
  }
  function findHeader(decoded){
    let header=null;
    for(const root of decoded.roots){
      walk(root,value=>{
        if(header||Array.isArray(value))return;
        const h=value.header;if(h&&typeof h==='object'&&h.uid!=null)header=h;
      });
      if(header)break;
    }
    return header||{};
  }
  function media(base,path,thumb=false){
    if(!path)return '';
    const raw=String(path);
    if(/^https?:\/\//i.test(raw))return raw;
    if(!base)return raw;
    return String(base).replace(/\/$/,'')+'/'+(thumb?'thumb/':'')+raw.replace(/^\//,'');
  }
  function normalizeAttrs(items){
    return (Array.isArray(items)?items:[]).filter(x=>x&&typeof x==='object').map(x=>({id:x.id,name:cleanName(x.name||''),value:x.value,percentage:!!x.percentage,rollQuality:x.roll_quality??x.rollQuality??null}));
  }
  function normalizeEquipment(item,base,kind){
    if(!item||typeof item!=='object')return null;
    const out={id:item.id,name:cleanName(item.name||''),image:media(base,item.image),rarity:item.rarity??null};
    if(kind==='wheel'||kind==='trinket')Object.assign(out,{slot:item.slot??null,level:numberOrNull(item.level),enhanceLevel:numberOrNull(item.enhance_level??item.enhanceLevel),breakLevel:numberOrNull(item.break_level??item.breakLevel),attrs:normalizeAttrs(item.attrs)});
    if(kind==='trinket')Object.assign(out,{suitId:item.suit_id??item.suitId??null,bound:!!item.bound});
    return out;
  }
  function normalizeCovenant(item,base){
    if(!item||typeof item!=='object')return null;
    return {id:item.id,name:cleanName(item.name||''),image:media(base,item.image),count:numberOrNull(item.count),effects:(Array.isArray(item.effects)?item.effects:[]).filter(x=>x&&typeof x==='object').map(x=>({pieces:numberOrNull(x.pieces),desc:cleanName(x.desc||''),active:!!x.active}))};
  }
  function ingameId(awaker){
    const a=awaker&&typeof awaker==='object'?awaker:{};
    let raw=String(a.res||'');
    if(!raw){
      const m=String(a.mini||a.image||'').match(/Awaker_([A-Za-z0-9]+)_AF/i);
      raw=m?.[1]||'';
    }
    return raw.replace(/_AF$/i,'').toUpperCase()||null;
  }
  function catalogMap(){
    const map=new Map();
    for(const record of window.MorimensData?.db?.records||[])if(record?.ingameId)map.set(String(record.ingameId).toUpperCase(),record);
    return map;
  }
  function normalizeMember(build,base,catalog){
    const b=build&&typeof build==='object'?build:{},awaker=b.awaker&&typeof b.awaker==='object'?b.awaker:{};
    const iid=ingameId(awaker),cat=iid?catalog.get(iid):null;
    const enlightenment=(Array.isArray(b.enlightenment)?b.enlightenment:[]).filter(x=>x&&typeof x==='object').map(x=>({id:x.id,name:cleanName(x.name||''),lv:numberOrNull(x.lv),unlocked:!!x.unlocked}));
    const ec=enlightenment.filter(x=>x.unlocked).length,milestones=['E0','E1','E2','E3','OE','AA'],milestone=milestones[Math.max(0,Math.min(5,ec))];
    const wheels=(Array.isArray(b.weapons)?b.weapons:[]).map(x=>normalizeEquipment(x,base,'wheel')).filter(Boolean);
    const trinkets=(Array.isArray(b.trinkets)?b.trinkets:[]).map(x=>normalizeEquipment(x,base,'trinket')).filter(Boolean);
    const covenants=(Array.isArray(b.suits)?b.suits:[]).map(x=>normalizeCovenant(x,base)).filter(Boolean);
    const realm=awaker.realm&&typeof awaker.realm==='object'?cleanName(awaker.realm.name||''):cleanName(awaker.realm||'');
    const canonicalName=cat?.name||cleanName(awaker.name||'')||iid||ui('未知','Unknown');
    return {
      id:awaker.id,name:cleanName(awaker.name||canonicalName),canonicalName,skeydbId:cat?.id||null,ingameId:iid,
      image:media(base,awaker.mini||awaker.image,true)||cat?.assets?.portrait||'',realm,role:cleanName(awaker.role||''),rarity:cleanName(awaker.rarity||''),
      level:numberOrNull(b.level),potencyLevel:numberOrNull(b.potency_level??b.potencyLevel),breakLevel:numberOrNull(b.break_level??b.breakLevel),fighting:numberOrNull(b.fighting),potential:b.potential??null,likeLevel:numberOrNull(b.like_level??b.likeLevel),
      enlightenLevel:ec,enlightenCount:ec,enlightenMilestone:milestone,enlightenment,progression:milestone,
      wheels,trinkets,covenants,covenant:covenants[0]||null,covenantScore:numberOrNull(b.covenant_score??b.covenantScore),
      borrowed:!!b.borrowed,assistUid:b.assist_uid??b.assistUid??null,stats:normalizeAttrs(b.stats)
    };
  }
  function normalizeToken(item,base){
    if(!item||typeof item!=='object')return null;
    return {id:item.id,name:cleanName(item.name||''),image:media(base,item.image),rarity:cleanName(item.rarity||'')};
  }
  function normalizeCreation(item,base){
    if(!item||typeof item!=='object')return null;
    return {id:item.id,name:cleanName(item.name||String(item.id??'')),image:media(base,item.image),quality:cleanName(item.quality||''),desc:cleanName(item.desc||'')};
  }
  function normalizeActivity(item,decoded){
    const node=item.node||{},activity=node.activity&&typeof node.activity==='object'?node.activity:{},base=findMediaBase(decoded),header=findHeader(decoded),catalog=catalogMap(),rows=[];
    for(const stageRow of Array.isArray(node.stages)?node.stages:[]){
      if(!stageRow||typeof stageRow!=='object')continue;
      const team=stageRow.team,stage=stageRow.stage&&typeof stageRow.stage==='object'?stageRow.stage:{};
      if(!team||typeof team!=='object'||!Array.isArray(team.awakers))continue;
      const stageName=cleanName(stage.name||''),match=stageName.match(/(?:Wave|Zone)\s*(\d+)/i);
      if(!match)continue;
      const result=team.result&&typeof team.result==='object'?team.result:{};
      rows.push({
        wave:Number(match[1]),madness:numberOrNull(stage.rec_level??stage.recLevel),stageId:stage.id??team.stage_tid??null,stageName,
        score:numberOrNull(stageRow.score),clearType:stageRow.extra?'extra':'clear',extraPass:!!stageRow.extra_pass,groupTid:stageRow.group_tid??null,
        token:normalizeToken(team.keeper_skill,base),creations:(Array.isArray(result.relics)?result.relics:[]).map(x=>normalizeCreation(x,base)).filter(Boolean),
        wid:team.wid??null,battleUuid:team.battle_uuid??null,members:team.awakers.map(x=>normalizeMember(x,base,catalog))
      });
    }
    const waves=new Map();
    for(const row of rows){
      if(!waves.has(row.wave))waves.set(row.wave,{wave:row.wave,madness:row.madness,teams:[]});
      const copy={...row};delete copy.wave;delete copy.madness;waves.get(row.wave).teams.push(copy);
    }
    const uid=String(header.uid??'').trim(),score=rows.reduce((sum,row)=>sum+(Number(row.score)||0),0);
    return {
      rank:null,player:cleanName(header.name||''),uid,score,currentScore:score,leaderboardScore:null,
      url:`https://eremora.com/u/${encodeURIComponent(uid)}/challenges/dzone/${item.period}`,seasonId:item.period,
      activity:{id:activity.id??null,tid:node.activity_tid??null,name:cleanName(activity.name||'Dissoluted Abyss'),start:numberOrNull(activity.start),end:numberOrNull(activity.end),maxScore:numberOrNull(node.max_score),stageCount:numberOrNull(node.stage_count)||rows.length},
      waves:[...waves.values()].sort((a,b)=>a.wave-b.wave),sourceTransport:'Eremora SvelteKit __data.json community import'
    };
  }
  function parseDzonePayload(text,expectedSeason){
    const decoded=decodePayload(text),activities=findActivities(decoded),target=activities.find(x=>Number(x.period)===Number(expectedSeason));
    if(!target)throw new Error(ui(`粘贴内容里没有找到第 ${expectedSeason} 期融灾数据。`,`Season ${expectedSeason} D-Zone data was not found in the pasted payload.`));
    const record=normalizeActivity(target,decoded);
    if(!record.uid)throw new Error(ui('无法从数据中识别玩家 UID。','Could not identify the player UID from the payload.'));
    const waveSet=new Set((record.waves||[]).map(w=>Number(w.wave)).filter(n=>n>=1&&n<=5));
    if(waveSet.size<5)throw new Error(ui(`只解析到 ${waveSet.size}/5 个 Zone；为避免覆盖完整数据，本次提交已拒绝。`,`Only ${waveSet.size}/5 Zones were parsed. The submission was rejected to avoid replacing complete data with a partial record.`));
    const teams=(record.waves||[]).reduce((sum,w)=>sum+(w.teams?.length||0),0);
    if(teams<5)throw new Error(ui('挑战数据不完整：有效队伍少于 5 支。','Challenge data is incomplete: fewer than 5 valid teams.'));
    return record;
  }

  function bytesToBase64Url(bytes){
    let binary='',chunk=0x8000;
    for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(bytes.length,i+chunk)));
    return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function base64UrlToBytes(value){
    const normalized=String(value||'').replace(/-/g,'+').replace(/_/g,'/');
    const binary=atob(normalized+'='.repeat((4-normalized.length%4)%4)),out=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);return out;
  }
  async function encodeSubmission(payload){
    const raw=new TextEncoder().encode(JSON.stringify(payload));
    if(typeof CompressionStream==='undefined')throw new Error(ui('当前浏览器不支持压缩提交，请使用最新版 Chrome / Edge / Safari。','This browser cannot compress submissions. Use a current Chrome, Edge, or Safari.'));
    const compressed=await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    return 'gz:'+bytesToBase64Url(new Uint8Array(compressed));
  }
  async function decodeSubmission(encoded){
    const text=String(encoded||'').trim();
    if(text.startsWith('gz:')){
      if(typeof DecompressionStream==='undefined')throw new Error('gzip unsupported');
      const bytes=base64UrlToBytes(text.slice(3));
      const raw=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
      return JSON.parse(new TextDecoder().decode(raw));
    }
    if(text.startsWith('json:'))return JSON.parse(new TextDecoder().decode(base64UrlToBytes(text.slice(5))));
    throw new Error('unknown submission codec');
  }
  function extractEncodedComment(comment){
    const raw=String(comment||''),needle=SUBMISSION_MARKER+':',idx=raw.indexOf(needle);
    if(idx<0)return '';
    return raw.slice(idx+needle.length).trim().split(/\s|</)[0];
  }
  async function persistSubmission(payload){
    const encoded=await encodeSubmission(payload),comment=SUBMISSION_MARKER+':'+encoded;
    const response=await fetch(WALINE_SERVER+'/api/comment?lang=zh-CN',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({nick:payload.submittedBy||ui('匿名','Anonymous'),mail:'',link:'',comment,url:SUBMISSION_PATH,ua:navigator.userAgent||''})
    });
    if(!response.ok)throw new Error('Waline HTTP '+response.status);
    const result=await response.json();
    if(result?.errno)throw new Error(result.errmsg||('Waline errno '+result.errno));
    return result;
  }
  async function fetchSubmissionHistory(){
    const rows=[];
    for(let page=1;page<=5;page++){
      const response=await fetch(WALINE_SERVER+'/api/comment?path='+encodeURIComponent(SUBMISSION_PATH)+'&page='+page+'&pageSize=100&sortBy=insertedAt_desc&lang=zh-CN',{cache:'no-store'});
      if(!response.ok)throw new Error('Waline HTTP '+response.status);
      const payload=await response.json();if(payload?.errno)throw new Error(payload.errmsg||('Waline errno '+payload.errno));
      const items=Array.isArray(payload?.data)?payload.data:Array.isArray(payload?.data?.data)?payload.data.data:[];
      for(const item of items){
        const encoded=extractEncodedComment(item?.comment);if(!encoded)continue;
        try{
          const data=await decodeSubmission(encoded);
          const record=data?.record,uid=String(data?.uid||record?.uid||'').trim(),seasonId=Number(data?.seasonId||record?.seasonId||0);
          if(!uid||!seasonId||!record)continue;
          rows.push({uid,seasonId,record,submittedBy:cleanName(data?.submittedBy||item?.nick||'')||ui('匿名','Anonymous'),submittedAt:item?.insertedAt||data?.submittedAt||'',source:'eremora-dzone'});
        }catch(error){console.warn('Skip unreadable D-Zone community submission',error)}
      }
      const total=Number(payload?.data?.count??payload?.data?.total??payload?.count??payload?.total);
      if(items.length<100||(Number.isFinite(total)&&page*100>=total))break;
    }
    rows.sort((a,b)=>String(b.submittedAt).localeCompare(String(a.submittedAt)));
    return rows;
  }
  function latestPerUid(rows,seasonId){
    const map=new Map();
    for(const row of rows){
      if(Number(row.seasonId)!==Number(seasonId))continue;
      const key=String(row.uid);if(!map.has(key))map.set(key,row);
    }
    return [...map.values()];
  }
  function renderHistory(){
    const host=$('dtideCommunityHistoryRows'),count=$('dtideCommunityHistoryCount');if(!host)return;
    const sid=selectedSeasonId(),rows=submissionHistory.filter(x=>Number(x.seasonId)===sid).slice(0,HISTORY_LIMIT);
    const seasonCount=submissionHistory.filter(x=>Number(x.seasonId)===sid).length;
    if(count)count.textContent=ui(`${seasonCount} 条`,` ${seasonCount} records`);
    host.innerHTML=rows.length?rows.map(row=>`<div class="dtideCommunityHistoryRow"><b>UID ${esc(row.uid)}</b><span>${esc(formatTime(row.submittedAt))}</span><span>${ui('更新人：','By: ')}${esc(row.submittedBy||ui('匿名','Anonymous'))}</span></div>`).join(''):`<div class="dtideCommunityHistoryRow"><span>${ui('所选期次暂无自行更新记录。','No community updates for the selected season yet.')}</span></div>`;
  }
  async function syncCommunity(force=false){
    if(syncing)return;
    const ctx=context();if(!ctx)return;
    syncing=true;
    try{
      if(force||!submissionHistory.length||Date.now()-lastSyncAt>60000){submissionHistory=await fetchSubmissionHistory();lastSyncAt=Date.now()}
      const viewSeasonId=Number(ctx.selectedSeasonId)||0;
      const latest=latestPerUid(submissionHistory,viewSeasonId);
      if(!ctx.legacy&&viewSeasonId&&latest.length){window.MorimensDtideCommunity?.mergeRecords?.(latest);window.MorimensDtideUsageCommunity?.mergeRecords?.(latest)}
      renderHistory();
      const newest=latest[0];
      if(force)status(newest?ui(`已刷新社区补充：${latest.length} 个 UID；最近由 ${newest.submittedBy} 更新于 ${formatTime(newest.submittedAt)}。`,`Community data refreshed: ${latest.length} UIDs; latest by ${newest.submittedBy} at ${formatTime(newest.submittedAt)}.`):ui('已刷新，当前查看期次暂无社区补充。','Refreshed. No community data for the viewed season.'),'ok');
    }catch(error){
      console.warn('D-Zone community submission sync failed',error);
      if(force)status(ui('社区补充载入失败：','Failed to load community data: ')+(error?.message||String(error)),'error');
    }finally{syncing=false}
  }

  async function submitPasted(){
    const button=$('dtideCommunitySubmit'),seasonId=selectedSeasonId();
    if(!canSubmitSeason()){status(ui('请选择有效的融灾期次。','Choose a valid D-Zone season.'),'error');return}
    const text=String($('dtideCommunityPaste')?.value||''),ctx=context(),typedUid=String($('dtideCommunityUid')?.value||'').trim();
    if(!text.trim()){status(ui('请先粘贴 Eremora __data.json 内容。','Paste the Eremora __data.json content first.'),'error');return}
    if(button)button.disabled=true;
    try{
      status(ui('正在解析并校验 5 个 Zone……','Parsing and validating all 5 Zones…'));
      const record=parseDzonePayload(text,seasonId);
      if(typedUid&&typedUid!==record.uid)throw new Error(ui(`填写的 UID ${typedUid} 与数据中的 UID ${record.uid} 不一致。`,`Entered UID ${typedUid} does not match payload UID ${record.uid}.`));
      if(!typedUid&&$('dtideCommunityUid'))$('dtideCommunityUid').value=record.uid;
      updateUrlPreview();
      const submittedBy=cleanName($('dtideCommunityNick')?.value||'').slice(0,32)||ui('匿名','Anonymous'),submittedAt=new Date().toISOString();
      const payload={version:1,source:'eremora-dzone',seasonId,uid:record.uid,submittedBy,submittedAt,record};
      status(ui('解析成功，正在压缩并提交……','Parsed successfully. Compressing and submitting…'));
      await persistSubmission(payload);
      const row={uid:record.uid,seasonId,record,submittedBy,submittedAt,source:'eremora-dzone'};
      submissionHistory=[row,...submissionHistory.filter(x=>!(Number(x.seasonId)===seasonId&&String(x.uid)===record.uid&&String(x.submittedAt)===submittedAt))];
      if(Number(ctx?.selectedSeasonId)===Number(seasonId)){
        window.MorimensDtideCommunity?.mergeRecords?.([row]);window.MorimensDtideUsageCommunity?.mergeRecords?.([row]);
      }
      renderHistory();
      status(ui(`提交成功：UID ${record.uid} 的第 ${seasonId} 期数据已合并。更新时间 ${formatTime(submittedAt)}，更新人 ${submittedBy}。`,`Submitted: UID ${record.uid} Season ${seasonId} data was merged. Updated ${formatTime(submittedAt)} by ${submittedBy}.`),'ok');
    }catch(error){
      console.error('D-Zone community import failed',error);
      status(ui('导入失败：','Import failed: ')+(error?.message||String(error)),'error');
    }finally{if(button)button.disabled=!canSubmitSeason()}
  }

  async function listSubmissionRecords(options={}){
    if(options.refresh||!submissionHistory.length){try{submissionHistory=await fetchSubmissionHistory();lastSyncAt=Date.now()}catch(error){console.warn('D-Zone submission history unavailable',error)}}
    return submissionHistory.map(({uid,seasonId,submittedBy,submittedAt,source})=>({uid,seasonId,submittedBy,submittedAt,source}));
  }

  function onSeasonLoaded(){
    mount();refreshUi();syncCommunity(false);
  }
  window.addEventListener('morimens:dtide-season-loaded',onSeasonLoaded);
  window.addEventListener('morimens-language-change',()=>{mount();refreshUi()});
  window.MorimensDzoneImport={mount,refresh:()=>syncCommunity(true),parseDzonePayload,listSubmissionRecords,latestForSeason:seasonId=>latestPerUid(submissionHistory,seasonId)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{mount();setTimeout(onSeasonLoaded,0)});else{mount();setTimeout(onSeasonLoaded,0)}
})();
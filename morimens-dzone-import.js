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
  function normalizeVariant(seasonId,variant=''){
    const explicit=String(variant||'').trim();
    return explicit||(Number(seasonId)===69?'prebug':'default');
  }
  function targetKeyFor(entry){
    return String(entry?.targetKey??entry?.communityTargetKey??entry?.snapshotId??entry?.seasonId??'');
  }
  function selectedTargetMeta(){
    const ctx=context(),known=ctx?.availableSeasons||[],selected=String($('dtideCommunitySeason')?.value||'').trim();
    const found=known.find(entry=>targetKeyFor(entry)===selected);
    if(found){
      const seasonId=Number(found.sourceSeasonId??found.seasonId)||0;
      return {seasonId,communityVariant:normalizeVariant(seasonId,found.communityVariant),targetKey:targetKeyFor(found),labelZh:found.labelZh,labelEn:found.labelEn};
    }
    if(/^\d+$/.test(selected)){
      const seasonId=Number(selected);
      return {seasonId,communityVariant:normalizeVariant(seasonId),targetKey:selected};
    }
    const seasonId=Number(ctx?.selectedSeasonId||ctx?.currentSeason||0)||0;
    const communityVariant=normalizeVariant(seasonId,ctx?.communityVariant);
    return {seasonId,communityVariant,targetKey:String(ctx?.selectedTargetKey||seasonId||'')};
  }
  function selectedSeasonId(){return selectedTargetMeta().seasonId}
  function selectedCommunityVariant(){return selectedTargetMeta().communityVariant}
  function selectedTargetKey(){return selectedTargetMeta().targetKey}
  function canSubmitSeason(){
    const meta=selectedTargetMeta(),ctx=context(),known=ctx?.availableSeasons||[];
    if(!meta.seasonId||!meta.targetKey)return false;
    return !known.length||known.some(entry=>targetKeyFor(entry)===meta.targetKey);
  }
  function syncSeasonOptions(){
    const select=$('dtideCommunitySeason');if(!select)return;
    const ctx=context(),known=(ctx?.availableSeasons||[]).filter(entry=>Number(entry?.sourceSeasonId??entry?.seasonId)>0);
    const previous=String(select.value||'');
    const fallback=String(ctx?.selectedTargetKey||ctx?.selectedSeasonId||ctx?.currentSeason||'');
    if(known.length){
      select.innerHTML=known.map(entry=>{
        const seasonId=Number(entry.sourceSeasonId??entry.seasonId)||0,targetKey=targetKeyFor(entry);
        const label=zh()?(entry.labelZh||('第 '+seasonId+' 期融灾')):(entry.labelEn||('Season '+seasonId+' D-Zone'));
        return `<option value="${esc(targetKey)}">${esc(label)}${entry.periodShort?' · '+esc(entry.periodShort):''}</option>`;
      }).join('');
      if(previous&&known.some(entry=>targetKeyFor(entry)===previous))select.value=previous;
      else if(fallback&&known.some(entry=>targetKeyFor(entry)===fallback))select.value=fallback;
      else if(select.options.length)select.selectedIndex=0;
    }else if(!select.options.length&&fallback){
      const seasonId=Number(ctx?.selectedSeasonId||ctx?.currentSeason||0)||0;
      select.innerHTML=`<option value="${esc(fallback)}">${ui('第 '+seasonId+' 期融灾','Season '+seasonId+' D-Zone')}</option>`;
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
    if(window.MorimensDzoneImportEmbedded===false)return;
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
      let recognized=false;
      if(doc?.type==='data'&&Array.isArray(doc.nodes)){
        for(const node of doc.nodes||[]){
          if(Array.isArray(node?.data)){try{roots.push(unflatten(node.data));recognized=true}catch(_){}}
          else if(node?.data&&typeof node.data==='object'){roots.push(node.data);recognized=true}
        }
      }
      if(doc?.type==='chunk'){
        if(Array.isArray(doc.data)){try{roots.push(unflatten(doc.data));recognized=true}catch(_){}}
        else if(doc?.data&&typeof doc.data==='object'){roots.push(doc.data);recognized=true}
      }
      if(!recognized&&doc&&typeof doc==='object')roots.push(doc);
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
  function findSelectedSeason(decoded){
    let selected=null;
    for(const root of decoded.roots){
      walk(root,value=>{
        if(selected!=null||!value||Array.isArray(value))return;
        const selection=value.selection;
        const schedulePeriod=numberOrNull(value?.challengeSchedule?.dzone?.period);
        const season=numberOrNull(selection?.season??value.selectedSeason??value.season_id??value.seasonId??schedulePeriod);
        const mode=String(selection?.mode||'').toLowerCase();
        if(season!=null&&(!mode||mode==='abyss'||mode==='dzone'))selected=Math.trunc(season);
      });
      if(selected!=null)break;
    }
    return selected;
  }
  function findActivities(decoded){
    const found=[],selectedSeason=findSelectedSeason(decoded);
    for(const root of decoded.roots)walk(root,(value,path)=>{
      if(!value||Array.isArray(value))return;

      // Current Eremora challenge pages resolve challengeData to
      // {profile, challengeSchedule, dzoneCatalog, ...}. The actual saved
      // runs, when present, live under profile.challenges.abyss.
      const abyss=value?.profile?.challenges?.abyss;
      if(Array.isArray(abyss)){
        for(let index=0;index<abyss.length;index++){
          const node=abyss[index];if(!node||typeof node!=='object')continue;
          const stages=Array.isArray(node.stages)?node.stages:[];
          const period=numberOrNull(node?.activity?.period??node.period??selectedSeason);
          if(period!=null)found.push({path:path+'.profile.challenges.abyss['+index+']',node,period:Math.trunc(period),stageCount:stages.length,selectedSeason});
        }
      }

      const stages=Array.isArray(value.stages)?value.stages:(Array.isArray(value.stage_list)?value.stage_list:null);
      if(!stages)return;
      const activity=value.activity&&typeof value.activity==='object'?value.activity:{};
      const name=String(activity.name||value.activity_name||value.name||'');
      const looksLikeDzone=/Dissoluted Abyss|D[- ]?Effect Zone|D[- ]?Zone|Abyss/i.test(name)
        ||stages.some(row=>/(?:Wave|Zone)\s*\d+/i.test(String(row?.stage?.name||row?.name||'')));
      if(!looksLikeDzone)return;
      const rawPeriod=numberOrNull(activity.period??value.period??value.season??value.season_id??value.seasonId??selectedSeason);
      const period=rawPeriod!=null?Math.trunc(rawPeriod):null;
      found.push({path,node:value,period,stageCount:stages.length,selectedSeason});
    });
    const best=new Map();
    for(const item of found){
      const key=`${item.period??'unknown'}:${item.node?.activity_tid??item.node?.activity?.id??item.path}`,old=best.get(key);
      if(!old||item.stageCount>old.stageCount)best.set(key,item);
    }
    return [...best.values()].sort((a,b)=>(Number(b.period)||-1)-(Number(a.period)||-1)||b.stageCount-a.stageCount);
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
    let header=null,fallback=null;
    for(const root of decoded.roots){
      walk(root,value=>{
        if(!value||Array.isArray(value))return;
        const h=value.header;
        if(!header&&h&&typeof h==='object'&&h.uid!=null)header=h;
        if(!fallback&&value.uid!=null&&/^\d{5,20}$/.test(String(value.uid).trim())){
          fallback={uid:value.uid,name:value.name||value.playerName||value.nickname||''};
        }
      });
      if(header)break;
    }
    return header||fallback||{};
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
  function stageCandidates(rawStage){
    if(!rawStage||typeof rawStage!=='object')return [];
    const nested=[];
    if(rawStage.base&&typeof rawStage.base==='object')nested.push(['clear',rawStage.base]);
    if(rawStage.extra&&typeof rawStage.extra==='object')nested.push(['extra',rawStage.extra]);
    return nested.length?nested:[[rawStage.extra===true?'extra':'clear',rawStage]];
  }
  function normalizeActivity(item,decoded){
    const node=item.node||{},activity=node.activity&&typeof node.activity==='object'?node.activity:{},base=findMediaBase(decoded),header=findHeader(decoded),catalog=catalogMap(),rows=[];
    const sourceDistribution=new Map();let sourceTeamCount=0;
    for(const rawStage of Array.isArray(node.stages)?node.stages:[]){
      for(const [clearType,stageRow] of stageCandidates(rawStage)){
        const team=stageRow?.team,stage=stageRow?.stage&&typeof stageRow.stage==='object'?stageRow.stage:{};
        if(!team||typeof team!=='object'||!Array.isArray(team.awakers))continue;
        const stageName=cleanName(stage.name||''),match=stageName.match(/(?:Wave|Zone)\s*(\d+)/i);
        if(!match)continue;
        const wave=Number(match[1]);sourceTeamCount++;sourceDistribution.set(wave,(sourceDistribution.get(wave)||0)+1);
        const result=team.result&&typeof team.result==='object'?team.result:{};
        rows.push({
          wave,madness:numberOrNull(stage.rec_level??stage.recLevel),stageId:stage.id??team.stage_tid??null,stageName,
          score:numberOrNull(stageRow.score),clearType,extraPass:!!stageRow.extra_pass,groupTid:stageRow.group_tid??rawStage.group_tid??null,
          token:normalizeToken(team.keeper_skill,base),creations:(Array.isArray(result.relics)?result.relics:[]).map(x=>normalizeCreation(x,base)).filter(Boolean),
          wid:team.wid??null,battleUuid:team.battle_uuid??team.battleUuid??null,members:team.awakers.map(x=>normalizeMember(x,base,catalog))
        });
      }
    }
    const waves=new Map();
    for(const row of rows){
      if(!waves.has(row.wave))waves.set(row.wave,{wave:row.wave,madness:row.madness,teams:[]});
      const copy={...row};delete copy.wave;delete copy.madness;waves.get(row.wave).teams.push(copy);
    }
    const uid=String(header.uid??'').trim(),score=rows.reduce((sum,row)=>sum+(Number(row.score)||0),0);
    const sourceTeamDistribution=[1,2,3,4,5].map(wave=>sourceDistribution.get(wave)||0);
    return {
      rank:null,player:cleanName(header.name||''),uid,score,currentScore:score,leaderboardScore:null,
      url:`https://eremora.com/u/${encodeURIComponent(uid)}/challenges/dzone/${item.period}`,seasonId:item.period,
      activity:{id:activity.id??null,tid:node.activity_tid??null,name:cleanName(activity.name||'Dissoluted Abyss'),start:numberOrNull(activity.start),end:numberOrNull(activity.end),maxScore:numberOrNull(node.max_score),stageCount:numberOrNull(node.stage_count)||waves.size},
      waves:[...waves.values()].sort((a,b)=>a.wave-b.wave),
      sourceTeamCount,sourceTeamDistribution,
      sourceTransport:'Eremora SvelteKit __data.json community import'
    };
  }
  function parseDzonePayload(text,expectedSeason){
    const decoded=decodePayload(text),activities=findActivities(decoded),selectedSeason=findSelectedSeason(decoded);
    let target=activities.find(x=>Number(x.period)===Number(expectedSeason));
    if(!target&&Number(selectedSeason)===Number(expectedSeason)){
      const unknown=activities.filter(x=>x.period==null).sort((a,b)=>b.stageCount-a.stageCount);
      if(unknown.length)target={...unknown[0],period:Number(expectedSeason)};
    }
    if(!target&&activities.length===1&&activities[0].period==null){
      target={...activities[0],period:Number(expectedSeason)};
    }
    if(!target){
      const detected=[...new Set(activities.map(x=>x.period).filter(x=>x!=null).map(Number))].sort((a,b)=>b-a);
      if(Number(selectedSeason)===Number(expectedSeason)){
        throw new Error(ui(
          `已识别这是第 ${expectedSeason} 期融灾页面，但这份 Eremora 返回中没有玩家的 Zone 挑战队伍记录（仅有 profile / challengeSchedule / dzoneCatalog 等元数据），因此不能作为完整榜单数据提交。请确认页面已经完整加载，并复制包含 profile.challenges.abyss / stages / team 的完整 __data.json。`,
          `This is recognized as Season ${expectedSeason}, but the Eremora payload contains no saved Zone team records (only metadata such as profile / challengeSchedule / dzoneCatalog), so it cannot be submitted as a complete leaderboard record. Copy the fully loaded __data.json containing profile.challenges.abyss / stages / team.`
        ));
      }
      const extra=detected.length?(zh()?('；粘贴内容识别到期次：'+detected.join('、')):('; detected seasons: '+detected.join(', '))):'';
      throw new Error(ui(`粘贴内容里没有找到第 ${expectedSeason} 期融灾数据${extra}。`,`Season ${expectedSeason} D-Zone data was not found in the pasted payload${extra}.`));
    }
    const record=normalizeActivity(target,decoded);
    record.seasonId=Number(expectedSeason);
    record.url=`https://eremora.com/u/${encodeURIComponent(record.uid||'')}/challenges/dzone/${expectedSeason}`;
    if(!record.uid)throw new Error(ui('无法从数据中识别玩家 UID。请确认复制的是该玩家的 Eremora __data.json 完整内容。','Could not identify the player UID. Copy the complete Eremora __data.json payload for that player.'));
    const waveSet=new Set((record.waves||[]).map(w=>Number(w.wave)).filter(n=>n>=1&&n<=5));
    if(waveSet.size<5)throw new Error(ui(`只解析到 ${waveSet.size}/5 个 Zone；为避免覆盖完整数据，本次提交已拒绝。`,`Only ${waveSet.size}/5 Zones were parsed. The submission was rejected to avoid replacing complete data with a partial record.`));
    const teams=(record.waves||[]).reduce((sum,w)=>sum+(w.teams?.length||0),0);
    if(teams<5)throw new Error(ui('挑战数据不完整：有效队伍少于 5 支。','Challenge data is incomplete: fewer than 5 valid teams.'));
    if(Number(record.sourceTeamCount)>0&&teams!==Number(record.sourceTeamCount)){
      throw new Error(ui(
        `队伍解析不完整：源数据有 ${record.sourceTeamCount} 支有效队伍，但标准化后只有 ${teams} 支。为避免丢失第二支队伍，本次提交已拒绝。`,
        `Team parsing is incomplete: the source contains ${record.sourceTeamCount} valid teams, but only ${teams} survived normalization. The submission was rejected to avoid losing secondary teams.`
      ));
    }
    const dist=(record.sourceTeamDistribution||[]).map(Number);
    if(dist.length===5&&dist.some((expected,index)=>expected>0&&Number(record.waves?.find(w=>Number(w.wave)===index+1)?.teams?.length||0)!==expected)){
      throw new Error(ui('各 Zone 队伍数量与源数据不一致，本次提交已拒绝。','Per-Zone team counts do not match the source payload. The submission was rejected.'));
    }
    return record;
  }

  function compactEquipment(item){
    if(!item||typeof item!=='object')return null;
    return [
      item.id??null,String(item.name||''),item.slot??null,item.level??null,item.enhanceLevel??null,item.breakLevel??null,
      item.rarity??null,item.suitId??null,item.bound?1:0
    ];
  }
  function expandEquipment(row,kind='wheel'){
    if(!Array.isArray(row))return null;
    const out={id:row[0]??null,name:String(row[1]||''),slot:row[2]??null,level:row[3]??null,enhanceLevel:row[4]??null,breakLevel:row[5]??null,rarity:row[6]??null,attrs:[]};
    if(kind==='trinket'){out.suitId=row[7]??null;out.bound=!!row[8]}
    return out;
  }
  function compactCovenant(item){
    if(!item||typeof item!=='object')return null;
    return [item.id??null,String(item.name||''),item.count??null];
  }
  function expandCovenant(row){
    if(!Array.isArray(row))return null;
    return {id:row[0]??null,name:String(row[1]||''),image:'',count:row[2]??null,effects:[]};
  }
  function compactMember(member){
    const m=member&&typeof member==='object'?member:{};
    return [
      m.id??null,m.skeydbId??null,m.ingameId??null,String(m.name||''),String(m.canonicalName||''),
      m.level??null,m.potencyLevel??null,m.breakLevel??null,m.enlightenCount??m.enlightenLevel??null,
      String(m.progression||m.enlightenMilestone||''),m.borrowed?1:0,m.assistUid??null,String(m.realm||''),String(m.role||''),
      (m.wheels||[]).map(compactEquipment).filter(Boolean),
      (m.covenants||((m.covenant)?[m.covenant]:[])).map(compactCovenant).filter(Boolean),
      m.covenantScore??null,
      (m.trinkets||[]).map(compactEquipment).filter(Boolean)
    ];
  }
  function expandMember(row){
    if(!Array.isArray(row))return null;
    const covenants=(row[15]||[]).map(expandCovenant).filter(Boolean),ec=row[8]??null,progression=String(row[9]||'');
    return {
      id:row[0]??null,skeydbId:row[1]??null,ingameId:row[2]??null,name:String(row[3]||row[4]||row[2]||''),canonicalName:String(row[4]||row[3]||row[2]||''),
      image:'',realm:String(row[12]||''),role:String(row[13]||''),rarity:'',
      level:row[5]??null,potencyLevel:row[6]??null,breakLevel:row[7]??null,fighting:null,potential:null,likeLevel:null,
      enlightenLevel:ec,enlightenCount:ec,enlightenMilestone:progression,progression,
      enlightenment:[],
      wheels:(row[14]||[]).map(x=>expandEquipment(x,'wheel')).filter(Boolean),
      trinkets:(row[17]||[]).map(x=>expandEquipment(x,'trinket')).filter(Boolean),
      covenants,covenant:covenants[0]||null,covenantScore:row[16]??null,
      borrowed:!!row[10],assistUid:row[11]??null,stats:[]
    };
  }
  function compactToken(item){
    if(!item||typeof item!=='object')return null;
    return [item.id??null,String(item.name||''),String(item.rarity||'')];
  }
  function expandToken(row){
    if(!Array.isArray(row))return null;
    return {id:row[0]??null,name:String(row[1]||''),image:'',rarity:String(row[2]||'')};
  }
  function compactCreation(item){
    if(!item||typeof item!=='object')return null;
    return [item.id??null,String(item.name||''),String(item.quality||'')];
  }
  function expandCreation(row){
    if(!Array.isArray(row))return null;
    return {id:row[0]??null,name:String(row[1]||row[0]||''),image:'',quality:String(row[2]||''),desc:''};
  }
  function compactTeam(team){
    const t=team&&typeof team==='object'?team:{};
    return [
      t.score??null,String(t.clearType||'clear'),t.stageId??null,String(t.stageName||''),t.extraPass?1:0,t.groupTid??null,
      compactToken(t.token),(t.creations||[]).map(compactCreation).filter(Boolean),t.wid??null,t.battleUuid??t.battle_uuid??null,
      (t.members||[]).map(compactMember).filter(Boolean)
    ];
  }
  function expandTeam(row){
    if(!Array.isArray(row))return null;
    return {
      score:row[0]??null,clearType:String(row[1]||'clear'),stageId:row[2]??null,stageName:String(row[3]||''),extraPass:!!row[4],groupTid:row[5]??null,
      token:expandToken(row[6]),creations:(row[7]||[]).map(expandCreation).filter(Boolean),wid:row[8]??null,battleUuid:row[9]??null,
      members:(row[10]||[]).map(expandMember).filter(Boolean)
    };
  }
  function compactRecord(record){
    const r=record&&typeof record==='object'?record:{};
    const a=r.activity&&typeof r.activity==='object'?r.activity:{};
    return [
      String(r.player||''),String(r.uid||''),r.score??null,r.currentScore??null,r.leaderboardScore??null,Number(r.seasonId)||0,
      (r.waves||[]).map(w=>[Number(w?.wave)||0,w?.madness??null,(w?.teams||[]).map(compactTeam).filter(Boolean)]),
      [a.id??null,a.tid??null,String(a.name||'Dissoluted Abyss'),a.start??null,a.end??null,a.maxScore??null,a.stageCount??null],
      Number(r.sourceTeamCount)||null,
      Array.isArray(r.sourceTeamDistribution)?r.sourceTeamDistribution.map(x=>Number(x)||0):null
    ];
  }
  function expandRecord(row){
    if(!Array.isArray(row))return null;
    const seasonId=Number(row[5])||0,uid=String(row[1]||''),a=Array.isArray(row[7])?row[7]:[];
    return {
      rank:null,player:String(row[0]||''),uid,score:row[2]??null,currentScore:row[3]??row[2]??null,leaderboardScore:row[4]??null,
      url:`https://eremora.com/u/${encodeURIComponent(uid)}/challenges/dzone/${seasonId}`,seasonId,
      activity:{id:a[0]??null,tid:a[1]??null,name:String(a[2]||'Dissoluted Abyss'),start:a[3]??null,end:a[4]??null,maxScore:a[5]??null,stageCount:a[6]??null},
      waves:(row[6]||[]).map(w=>({wave:Number(w?.[0])||0,madness:w?.[1]??null,teams:(w?.[2]||[]).map(expandTeam).filter(Boolean)})).filter(w=>w.wave>0),
      sourceTeamCount:Number(row[8])||null,
      sourceTeamDistribution:Array.isArray(row[9])?row[9].map(x=>Number(x)||0):null,
      sourceTransport:'Waline compact D-Zone community submission'
    };
  }
  function packStoredSubmission(payload){
    return {
      v:5,i:String(payload.submissionId||''),s:Number(payload.seasonId)||0,q:String(payload.communityVariant||''),k:String(payload.targetKey||''),
      u:String(payload.uid||payload.record?.uid||''),n:String(payload.submittedBy||''),t:String(payload.submittedAt||''),r:compactRecord(payload.record)
    };
  }
  function unpackStoredSubmission(data){
    if(data&&Number(data.v)===5&&Array.isArray(data.r)){
      const record=expandRecord(data.r);
      return {
        version:5,submissionId:String(data.i||''),seasonId:Number(data.s)||Number(record?.seasonId)||0,communityVariant:String(data.q||''),
        targetKey:String(data.k||''),uid:String(data.u||record?.uid||''),submittedBy:String(data.n||''),submittedAt:String(data.t||''),record
      };
    }
    return data;
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
    const stored=Number(payload?.version)===5&&payload?.r?payload:packStoredSubmission(payload);
    const raw=new TextEncoder().encode(JSON.stringify(stored));
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
      return unpackStoredSubmission(JSON.parse(new TextDecoder().decode(raw)));
    }
    if(text.startsWith('json:'))return unpackStoredSubmission(JSON.parse(new TextDecoder().decode(base64UrlToBytes(text.slice(5)))));
    try{
      const raw=new TextDecoder().decode(base64UrlToBytes(text));
      return unpackStoredSubmission(JSON.parse(raw));
    }catch(_){}
    throw new Error('unknown submission codec');
  }
  function decodeHtmlEntities(value){
    const text=String(value??'');
    if(typeof document!=='undefined'){
      try{const ta=document.createElement('textarea');ta.innerHTML=text;return ta.value}catch(_){}
    }
    return text.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
  }
  function tokenAfterMarker(rawValue){
    const needle=SUBMISSION_MARKER+':';
    let raw=decodeHtmlEntities(String(rawValue??'')),idx=raw.indexOf(needle);
    if(idx<0)return '';
    let tail=raw.slice(idx+needle.length);
    const commentEnd=tail.indexOf('-->');
    if(commentEnd>=0)tail=tail.slice(0,commentEnd);
    const tagEnd=tail.indexOf('<');
    if(tagEnd>=0)tail=tail.slice(0,tagEnd);
    tail=tail.replace(/[\r\n\t ]+/g,'').trim();
    const modern=tail.match(/^((?:gz|json):[A-Za-z0-9_-]+={0,2})/);
    if(modern)return modern[1];
    const legacy=tail.match(/^([A-Za-z0-9+/_=-]{16,})/);
    return legacy?.[1]||'';
  }
  function extractEncodedSubmission(...sources){
    for(const source of sources){
      const token=tokenAfterMarker(source);
      if(token)return token;
    }
    return '';
  }
  async function persistSubmission(payload){
    const encoded=await encodeSubmission(payload);
    const phase=Number(payload.seasonId)===69?(normalizeVariant(payload.seasonId,payload.communityVariant)==='postbug'?' · Bug后':' · Bug前'):'';
    const teams=(payload.record?.waves||[]).reduce((sum,w)=>sum+(w?.teams?.length||0),0);
    const visibleComment=`融灾社区补充 · UID ${payload.uid} · 第 ${payload.seasonId} 期${phase} · ${payload.record?.score??'—'} 分 · ${teams} 支队伍 · ${payload.submittedBy||ui('匿名','Anonymous')}`;
    const machinePayload=SUBMISSION_MARKER+':'+encoded;
    const comment=visibleComment+'\n\n<!--'+machinePayload+'-->';
    const response=await fetch(WALINE_SERVER+'/api/comment?lang=zh-CN',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        nick:payload.submittedBy||ui('匿名','Anonymous'),
        mail:'',
        link:'',
        comment,
        url:SUBMISSION_PATH,
        ua:navigator.userAgent||''
      })
    });
    if(!response.ok)throw new Error('Waline HTTP '+response.status);
    const result=await response.json();
    if(result?.errno)throw new Error(result.errmsg||('Waline errno '+result.errno));
    const serverRow=result?.data&&typeof result.data==='object'?result.data:result;
    const serverStatus=String(serverRow?.status||'approved').toLowerCase();
    if(serverStatus&&serverStatus!=='approved'){
      throw new Error(ui(
        `Waline 已接收提交，但状态为 ${serverStatus}，公开社区记录不会显示。请在 Waline 后台审核或调整评论审核/反垃圾设置后重试。`,
        `Waline accepted the submission with status ${serverStatus}, so it is not visible in the public community log. Approve it in Waline or adjust moderation / anti-spam settings, then retry.`
      ));
    }
    return {result,encodedLength:encoded.length,objectId:String(serverRow?.objectId||''),visibleComment};
  }
  async function archivedSubmissionRows(){
    const out=[];
    try{
      const response=await fetch('data/morimens/community/dzone.json',{cache:'no-store'});
      if(!response.ok)return out;
      const doc=await response.json();
      for(const item of Array.isArray(doc?.records)?doc.records:[]){
        const encoded=String(item?.encoded||'').trim();if(!encoded)continue;
        try{
          const data=await decodeSubmission(encoded),record=data?.record,uid=String(data?.uid||record?.uid||item?.uid||'').trim();
          const seasonId=Number(data?.seasonId||record?.seasonId||item?.seasonId||0);if(!uid||!seasonId||!record)continue;
          const communityVariant=normalizeVariant(seasonId,data?.communityVariant||data?.variant||item?.communityVariant);
          const targetKey=String(data?.targetKey||item?.targetKey||(seasonId===69?(communityVariant==='postbug'?'69-postbug':'69-prebug'):seasonId));
          out.push({
            uid,seasonId,communityVariant,targetKey,record,
            submissionId:String(data?.submissionId||item?.submissionId||''),
            submittedBy:cleanName(data?.submittedBy||item?.submittedBy||'')||ui('匿名','Anonymous'),
            submittedAt:String(data?.submittedAt||item?.submittedAt||''),
            source:'github-dzone-archive',commentId:String(item?.commentId||''),archived:true
          });
        }catch(error){console.warn('Skip unreadable archived D-Zone submission',error)}
      }
    }catch(error){console.warn('D-Zone GitHub archive unavailable',error)}
    return out;
  }
  async function fetchSubmissionHistory(){
    const rows=await archivedSubmissionRows();let seenItems=0,markedItems=0,decodeFailures=0;
    for(let page=1;page<=5;page++){
      const response=await fetch(WALINE_SERVER+'/api/comment?path='+encodeURIComponent(SUBMISSION_PATH)+'&page='+page+'&pageSize=100&sortBy=insertedAt_desc&lang=zh-CN',{cache:'no-store'});
      if(!response.ok)throw new Error('Waline HTTP '+response.status);
      const payload=await response.json();if(payload?.errno)throw new Error(payload.errmsg||('Waline errno '+payload.errno));
      const items=Array.isArray(payload?.data)?payload.data:Array.isArray(payload?.data?.data)?payload.data.data:[];
      for(const item of items){
        seenItems++;
        const encoded=extractEncodedSubmission(item?.orig,item?.comment,item?.ua,item?.comment_html,item?.commentHtml);if(!encoded)continue;
        markedItems++;
        try{
          const data=await decodeSubmission(encoded);
          const record=data?.record,uid=String(data?.uid||record?.uid||'').trim(),seasonId=Number(data?.seasonId||record?.seasonId||0);
          if(!uid||!seasonId||!record)continue;
          const communityVariant=normalizeVariant(seasonId,data?.communityVariant||data?.variant);
          const targetKey=String(data?.targetKey||(seasonId===69?(communityVariant==='postbug'?'69-postbug':'69-prebug'):seasonId));
          rows.push({uid,seasonId,communityVariant,targetKey,record,submissionId:String(data?.submissionId||''),submittedBy:cleanName(data?.submittedBy||item?.nick||'')||ui('匿名','Anonymous'),submittedAt:item?.insertedAt||data?.submittedAt||'',source:'eremora-dzone',commentId:String(item?.objectId||''),archived:false});
        }catch(error){decodeFailures++;console.warn('Skip unreadable D-Zone community submission',error)}
      }
      const total=Number(payload?.data?.count??payload?.data?.total??payload?.count??payload?.total);
      if(items.length<100||(Number.isFinite(total)&&page*100>=total))break;
    }
    const dedup=new Map();
    for(const row of rows){
      const key=row.commentId?('comment:'+row.commentId):(row.submissionId?('submission:'+row.submissionId):[row.targetKey,row.uid,row.submittedAt].join('|'));
      const old=dedup.get(key);
      if(!old||String(row.submittedAt||'')>String(old.submittedAt||''))dedup.set(key,row);
    }
    const merged=[...dedup.values()].sort((a,b)=>String(b.submittedAt).localeCompare(String(a.submittedAt)));
    if(seenItems&&(!merged.length||decodeFailures))console.info('D-Zone community readback',{seenItems,markedItems,decodedRows:merged.length,decodeFailures});
    return merged;
  }
  async function verifyPersistedSubmission(submissionId,uid,seasonId,communityVariant){
    const wantedId=String(submissionId||''),wantedUid=String(uid||''),wantedVariant=normalizeVariant(seasonId,communityVariant);
    let last=[];
    for(const delay of [250,900,1800]){
      if(delay)await new Promise(resolve=>setTimeout(resolve,delay));
      last=await fetchSubmissionHistory();
      const hit=last.find(row=>
        (wantedId&&String(row.submissionId||'')===wantedId)||
        (!wantedId&&String(row.uid)===wantedUid&&Number(row.seasonId)===Number(seasonId)&&normalizeVariant(row.seasonId,row.communityVariant)===wantedVariant)
      );
      if(hit){
        const zones=new Set((hit.record?.waves||[]).map(w=>Number(w?.wave)).filter(n=>n>=1&&n<=5));
        const teams=(hit.record?.waves||[]).reduce((sum,w)=>sum+(w?.teams?.length||0),0);
        const members=(hit.record?.waves||[]).reduce((sum,w)=>sum+(w?.teams||[]).reduce((n,t)=>n+(t?.members?.length||0),0),0);
        const expectedTeams=Number(hit.record?.sourceTeamCount)||0;
        const expectedDist=Array.isArray(hit.record?.sourceTeamDistribution)?hit.record.sourceTeamDistribution.map(Number):[];
        const actualDist=[1,2,3,4,5].map(wave=>(hit.record?.waves||[]).find(w=>Number(w?.wave)===wave)?.teams?.length||0);
        if(zones.size<5||teams<5||members<20||(expectedTeams>0&&teams!==expectedTeams)||(expectedDist.length===5&&expectedDist.some((n,i)=>n>0&&actualDist[i]!==n))){
          throw new Error(ui(
            `社区记录已经回读，但紧凑数据还原不完整（${zones.size}/5 Zone、${teams}/${expectedTeams||teams} 支队伍、分布 ${actualDist.join('/')}），本次不会合并统计。`,
            `The community record was read back, but compact-data restoration is incomplete (${zones.size}/5 Zones, ${teams}/${expectedTeams||teams} teams, distribution ${actualDist.join('/')}), so it will not be merged into statistics.`
          ));
        }
        return {hit,rows:last};
      }
    }
    throw new Error(ui(
      'Waline 返回了提交成功，但公开社区记录中没有回读到这条数据。它可能被评论审核/反垃圾规则隐藏，因此本次不会计入榜单统计。请检查 Waline 后台后重新提交。',
      'Waline reported a successful post, but the submission could not be read back from the public community feed. It may be hidden by moderation / anti-spam rules, so it will not be counted in leaderboard statistics. Check Waline and resubmit.'
    ));
  }
  function latestPerUid(rows,seasonId,communityVariant=normalizeVariant(seasonId)){
    const map=new Map();
    for(const row of rows){
      if(Number(row.seasonId)!==Number(seasonId)||normalizeVariant(row.seasonId,row.communityVariant)!==normalizeVariant(seasonId,communityVariant))continue;
      const key=String(row.uid);if(!map.has(key))map.set(key,row);
    }
    return [...map.values()];
  }
  function renderHistory(){
    const host=$('dtideCommunityHistoryRows'),count=$('dtideCommunityHistoryCount');if(!host)return;
    const meta=selectedTargetMeta(),rows=submissionHistory.filter(x=>Number(x.seasonId)===meta.seasonId&&normalizeVariant(x.seasonId,x.communityVariant)===meta.communityVariant).slice(0,HISTORY_LIMIT);
    const seasonCount=submissionHistory.filter(x=>Number(x.seasonId)===meta.seasonId&&normalizeVariant(x.seasonId,x.communityVariant)===meta.communityVariant).length;
    if(count)count.textContent=ui(`${seasonCount} 条`,` ${seasonCount} records`);
    host.innerHTML=rows.length?rows.map(row=>{
      const teams=(row.record?.waves||[]).reduce((sum,w)=>sum+(w?.teams?.length||0),0),zones=(row.record?.waves||[]).length;
      const score=row.record?.score??row.record?.currentScore??'—';
      const phase=Number(row.seasonId)===69?(normalizeVariant(row.seasonId,row.communityVariant)==='postbug'?ui('Bug后','Post-bug'):ui('Bug前','Pre-bug')):'';
      const dist=[1,2,3,4,5].map(wave=>(row.record?.waves||[]).find(w=>Number(w?.wave)===wave)?.teams?.length||0);
      const detail=ui(`第 ${row.seasonId} 期${phase?' · '+phase:''} · ${score} 分 · ${zones} Zone · ${teams} 支队伍（${dist.join('/')}）`,`Season ${row.seasonId}${phase?' · '+phase:''} · ${score} pts · ${zones} Zones · ${teams} teams (${dist.join('/')})`);
      return `<div class="dtideCommunityHistoryRow"><b>UID ${esc(row.uid)}</b><span>${esc(detail)}<br>${esc(formatTime(row.submittedAt))}</span><span>${ui('更新人：','By: ')}${esc(row.submittedBy||ui('匿名','Anonymous'))}</span></div>`;
    }).join(''):`<div class="dtideCommunityHistoryRow"><span>${ui('所选期次暂无自行更新记录。','No community updates for the selected season yet.')}</span></div>`;
  }
  async function syncCommunity(force=false){
    if(syncing)return;
    const ctx=context();if(!ctx)return;
    syncing=true;
    try{
      if(force||!submissionHistory.length||Date.now()-lastSyncAt>60000){submissionHistory=await fetchSubmissionHistory();lastSyncAt=Date.now()}
      const viewSeasonId=Number(ctx.selectedSeasonId)||0,viewVariant=normalizeVariant(viewSeasonId,ctx.communityVariant);
      const latest=latestPerUid(submissionHistory,viewSeasonId,viewVariant);
      let detailMerge={applied:0,skipped:0},usageMerge={applied:0,skipped:0};
      if(!ctx.legacy&&viewSeasonId&&latest.length){
        detailMerge=window.MorimensDtideCommunity?.mergeRecords?.(latest)||detailMerge;
        usageMerge=window.MorimensDtideUsageCommunity?.mergeRecords?.(latest)||usageMerge;
      }
      renderHistory();
      const newest=latest[0],merged=Math.max(Number(detailMerge?.applied)||0,Number(usageMerge?.applied)||0);
      if(force)status(newest?ui(
        `已刷新社区补充：读取 ${latest.length} 个 UID，实际合并 ${merged} 个；最近由 ${newest.submittedBy} 更新于 ${formatTime(newest.submittedAt)}。`,
        `Community data refreshed: ${latest.length} UIDs read, ${merged} merged; latest by ${newest.submittedBy} at ${formatTime(newest.submittedAt)}.`
      ):ui('已刷新，当前查看期次暂无社区补充。','Refreshed. No community data for the viewed season.'),'ok');
    }catch(error){
      console.warn('D-Zone community submission sync failed',error);
      if(force)status(ui('社区补充载入失败：','Failed to load community data: ')+(error?.message||String(error)),'error');
    }finally{syncing=false}
  }

  async function submitPasted(){
    const button=$('dtideCommunitySubmit'),target=selectedTargetMeta(),seasonId=target.seasonId,communityVariant=target.communityVariant,targetKey=target.targetKey;
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
      const submissionId=String(record.uid)+'-'+Date.now().toString(36);
      const payload={version:5,source:'eremora-dzone',submissionId,seasonId,communityVariant,targetKey,uid:record.uid,submittedBy,submittedAt,record};
      status(ui('解析成功，正在以紧凑格式保存到社区记录……','Parsed successfully. Saving a compact community record…'));
      const persisted=await persistSubmission(payload);
      status(ui(`已写入 Waline（编码 ${persisted.encodedLength} 字符），正在回读确认是否真正保留……`,`Written to Waline (${persisted.encodedLength} encoded characters). Verifying that it is publicly persisted…`));
      const verified=await verifyPersistedSubmission(submissionId,record.uid,seasonId,communityVariant);
      submissionHistory=verified.rows;
      const row=verified.hit;
      let detailMerge={applied:0},usageMerge={applied:0};
      if(Number(ctx?.selectedSeasonId)===Number(seasonId)&&normalizeVariant(seasonId,ctx?.communityVariant)===communityVariant){
        detailMerge=window.MorimensDtideCommunity?.mergeRecords?.([row])||detailMerge;
        usageMerge=window.MorimensDtideUsageCommunity?.mergeRecords?.([row])||usageMerge;
      }
      renderHistory();
      const phaseLabel=seasonId===69?(communityVariant==='postbug'?ui(' Bug后',' Post-bug'):ui(' Bug前',' Pre-bug')):'';
      status(ui(`提交并回读确认成功：UID ${record.uid} 的第 ${seasonId} 期${phaseLabel}数据已永久进入社区记录。更新时间 ${formatTime(row.submittedAt||submittedAt)}，更新人 ${submittedBy}。`,`Submitted and verified: UID ${record.uid} Season ${seasonId}${phaseLabel} is now persisted in the community log. Updated ${formatTime(row.submittedAt||submittedAt)} by ${submittedBy}.`),'ok');
    }catch(error){
      console.error('D-Zone community import failed',error);
      status(ui('导入失败：','Import failed: ')+(error?.message||String(error)),'error');
    }finally{if(button)button.disabled=!canSubmitSeason()}
  }

  async function listSubmissionRecords(options={}){
    if(options.refresh||!submissionHistory.length){
      try{submissionHistory=await fetchSubmissionHistory();lastSyncAt=Date.now()}
      catch(error){console.warn('D-Zone submission history unavailable',error);if(options.strict)throw error}
    }
    return submissionHistory.map(({uid,seasonId,communityVariant,targetKey,submissionId,commentId,submittedBy,submittedAt,source,record})=>{
      const variant=normalizeVariant(seasonId,communityVariant),teams=(record?.waves||[]).reduce((sum,w)=>sum+(w?.teams?.length||0),0),zones=(record?.waves||[]).length;
      const phase=Number(seasonId)===69?(variant==='postbug'?'Bug后':'Bug前'):'';
      const phaseEn=Number(seasonId)===69?(variant==='postbug'?'Post-bug':'Pre-bug'):'';
      const summaryZh=`第 ${seasonId} 期${phase?' · '+phase:''} · ${zones} Zone · ${teams} 支队伍 · 分数 ${record?.score??'—'}`;
      const summaryEn=`Season ${seasonId}${phaseEn?' · '+phaseEn:''} · ${zones} Zones · ${teams} teams · ${record?.score??'—'} pts`;
      return {uid,seasonId,communityVariant:variant,targetKey:targetKey||String(seasonId===69?(variant==='postbug'?'69-postbug':'69-prebug'):seasonId),submissionId,commentId,submittedBy,submittedAt,source,summary:ui(summaryZh,summaryEn),summaryZh,summaryEn,record};
    });
  }

  function onSeasonLoaded(){
    mount();refreshUi();syncCommunity(false);
  }
  window.addEventListener('morimens:dtide-season-loaded',onSeasonLoaded);
  window.addEventListener('morimens-language-change',()=>{mount();refreshUi()});
  window.MorimensDzoneImport={mount,refresh:()=>syncCommunity(true),parseDzonePayload,listSubmissionRecords,latestForSeason:(seasonId,communityVariant)=>latestPerUid(submissionHistory,seasonId,communityVariant)};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{mount();setTimeout(onSeasonLoaded,0)});else{mount();setTimeout(onSeasonLoaded,0)}
})();
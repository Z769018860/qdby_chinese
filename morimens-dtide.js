(()=>{
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pct=v=>Number.isFinite(Number(v))?`${Number(v).toFixed(1)}%`:'—';
  const zh=()=>localStorage.getItem('morimens.language')!=='en';
  let manifest=null,season=null,stats=null,awakenerMap=new Map(),filtersReady=false;

  function injectStyle(){
    if($('morimensDtideStyle'))return;
    const s=document.createElement('style');s.id='morimensDtideStyle';s.textContent=`
      .morimensTabs{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 18px;padding:6px;border:1px solid rgba(148,163,184,.16);border-radius:15px;background:rgba(15,23,42,.65);position:sticky;top:8px;z-index:40;backdrop-filter:blur(12px)}
      .morimensTab{border:1px solid transparent;border-radius:10px;padding:10px 15px;background:transparent;color:#9eabba;cursor:pointer;font:700 13px/1.2 inherit}.morimensTab[aria-selected="true"]{color:#f1ddb5;border-color:rgba(213,177,118,.36);background:rgba(213,177,118,.12)}
      .dtideHero{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}.dtideControls{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:16px}.dtideFilters{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.dtideField{display:flex;flex-direction:column;gap:6px}.dtideField.span2{grid-column:span 2}.dtideField label{font-size:11px;color:#98a4b6}.dtideField input,.dtideField select{min-height:40px;border:1px solid #334155;border-radius:10px;background:#111827;color:#edf2f7;padding:8px 10px}.dtideField select[multiple]{min-height:132px}.dtideField small{font-size:10px;color:#718096;line-height:1.45}
      .dtideStatGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:14px}.dtideStat{padding:13px;border-radius:12px;background:rgba(255,255,255,.035);border:1px solid rgba(148,163,184,.12)}.dtideStat small{display:block;color:#8290a2;font-size:10px}.dtideStat strong{display:block;margin-top:4px;font-size:20px;color:#f1dfbc}
      .dtideSection{margin-top:18px}.dtideSection h3{font-size:15px;margin:0 0 10px;color:#ead9b9}.dtideScroll{overflow:auto;border:1px solid rgba(148,163,184,.13);border-radius:12px}.dtideTable{width:100%;border-collapse:collapse;min-width:720px}.dtideTable th,.dtideTable td{padding:9px 10px;border-bottom:1px solid rgba(148,163,184,.1);text-align:left;font-size:11px}.dtideTable th{position:sticky;top:0;background:#111827;color:#aeb8c7;z-index:1}.dtideTable td{color:#d4dbe5}.dtideTable tr:last-child td{border-bottom:0}.dtideRate{font-variant-numeric:tabular-nums;color:#f1d69f;font-weight:800}.dtideChar{display:flex;align-items:center;gap:8px;min-width:130px}.dtideChar img{width:30px;height:30px;border-radius:8px;object-fit:cover;background:#0b1220}
      .dtideUsageCards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.dtideUsage{padding:10px;border:1px solid rgba(148,163,184,.12);border-radius:11px;background:rgba(255,255,255,.028);display:flex;justify-content:space-between;gap:10px;align-items:center}.dtideUsage b{font-size:12px}.dtideUsage small{display:block;color:#77869a;margin-top:3px}.dtideUsage strong{font-size:15px;color:#e9d0a0;white-space:nowrap}
      .dtideResults{display:grid;gap:9px}.dtideResult{padding:12px;border:1px solid rgba(148,163,184,.14);border-radius:13px;background:rgba(255,255,255,.025)}.dtideResultHead{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}.dtideResultHead b{font-size:13px}.dtideResultHead a{font-size:11px;color:#d5b176}.dtideMembers{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:9px}.dtideMember{padding:8px;border-radius:9px;background:#111827;min-width:0}.dtideMember b{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}.dtideMember small{display:block;color:#7f8da1;margin-top:3px;font-size:9px}.dtideBorrow{color:#d7a85b!important}.dtideNotice{padding:11px 12px;border-radius:11px;border:1px solid rgba(215,168,91,.25);background:rgba(215,168,91,.07);color:#b9c3d0;font-size:11px;line-height:1.65}.dtideEmpty{padding:22px;text-align:center;color:#7f8da1;font-size:12px}.dtideActions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.dtidePager{display:flex;gap:8px;align-items:center;justify-content:flex-end;margin-top:10px;color:#8290a2;font-size:11px}
      @media(max-width:900px){.dtideControls,.dtideFilters{grid-template-columns:repeat(2,minmax(0,1fr))}.dtideUsageCards{grid-template-columns:repeat(2,minmax(0,1fr))}.dtideMembers{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:580px){.morimensTabs{position:static}.dtideControls,.dtideFilters,.dtideStatGrid,.dtideUsageCards{grid-template-columns:1fr}.dtideField.span2{grid-column:auto}.dtideMembers{grid-template-columns:1fr}}
    `;document.head.appendChild(s);
  }

  function setupTabs(){
    const main=document.querySelector('main.wrap'),hero=main?.querySelector('.hero'),grid=main?.querySelector('.grid2');if(!main||!hero||!grid||$('morimensTabs'))return;
    const source=Array.from(main.children).find(x=>x!==hero&&x!==grid&&x.matches?.('section.panel'))||null;
    const tabs=document.createElement('nav');tabs.id='morimensTabs';tabs.className='morimensTabs';tabs.setAttribute('role','tablist');tabs.innerHTML='<button class="morimensTab" id="morimensBuilderTab" role="tab" aria-selected="true" aria-controls="morimensBuilderPanel">伤害计算 / 每日签</button><button class="morimensTab" id="morimensDtideTab" role="tab" aria-selected="false" aria-controls="morimensDtidePanel">融灾榜单</button>';
    const builder=document.createElement('div');builder.id='morimensBuilderPanel';builder.setAttribute('role','tabpanel');builder.appendChild(grid);if(source)builder.appendChild(source);
    const dtide=document.createElement('div');dtide.id='morimensDtidePanel';dtide.setAttribute('role','tabpanel');dtide.hidden=true;dtide.innerHTML=panelHtml();
    hero.after(tabs,builder,dtide);
    const activate=name=>{const isD=name==='dtide';$('morimensBuilderTab').setAttribute('aria-selected',String(!isD));$('morimensDtideTab').setAttribute('aria-selected',String(isD));builder.hidden=isD;dtide.hidden=!isD;if(isD){history.replaceState(null,'','#dtide');loadOnce()}else if(location.hash==='#dtide')history.replaceState(null,'',location.pathname+location.search)};
    $('morimensBuilderTab').addEventListener('click',()=>activate('builder'));$('morimensDtideTab').addEventListener('click',()=>activate('dtide'));
    if(location.hash==='#dtide')activate('dtide');
  }

  function panelHtml(){return `
    <section class="panel" aria-labelledby="dtideTitle">
      <div class="dtideHero"><div><p class="eyebrow">EREMORA · D-ZONE ANALYTICS</p><h2 id="dtideTitle">融灾榜单</h2><p class="panelLead">同步 Eremora 公开 D-Zone（融灾）挑战记录，按期次、波次与 Clear / Extra Clear 统计角色出场率，并提供配队条件检索。</p></div><span class="statusPill" id="dtideStatus">等待数据</span></div>
      <div class="dtideControls">
        <div class="dtideField"><label>期次</label><select id="dtideSeason"></select></div>
        <div class="dtideField"><label>波次</label><select id="dtideWave"><option value="all">全部波次</option></select></div>
        <div class="dtideField"><label>记录类型</label><select id="dtideClearType"><option value="all">Clear + Extra Clear</option><option value="clear">Clear</option><option value="extra">Extra Clear</option></select></div>
        <div class="dtideField"><label>统计口径</label><select id="dtideRateMode"><option value="team">队伍采用率</option><option value="slot">角色槽位份额</option></select></div>
      </div>
      <div class="dtideStatGrid" id="dtideSummary"></div>
      <div class="dtideSection"><h3>角色逐波出场率</h3><div class="dtideScroll" id="dtideMatrix"></div></div>
      <div class="dtideSection"><h3>当前筛选波次热门角色</h3><div class="dtideUsageCards" id="dtideUsage"></div></div>
      <div class="dtideSection"><h3>命轮 / 密契出场率</h3><div id="dtideEquipment"></div></div>
    </section>
    <section class="panel">
      <div class="panelHead"><div><h2>搜索配队</h2><p class="panelLead">筛选条件作用于具体波次的一支 Clear / Extra Clear 队伍。角色等级可以直接筛选；数值启灵、命轮与密契只有在 Eremora 记录公开了原始字段时才启用。</p></div><span class="statusPill" id="dtideFilterCoverage">字段覆盖检查中</span></div>
      <div class="dtideFilters" style="margin-top:15px">
        <div class="dtideField span2"><label>包含角色（可多选）</label><select id="dtideCharacters" multiple></select><small>Windows：Ctrl / Shift 多选；搜索逻辑可选择“全部包含”或“任一包含”。</small></div>
        <div class="dtideField"><label>角色匹配方式</label><select id="dtideCharacterMode"><option value="all">包含全部所选角色</option><option value="any">包含任一所选角色</option></select></div>
        <div class="dtideField"><label>排除角色（可多选）</label><select id="dtideExcludeCharacters" multiple></select></div>
        <div class="dtideField"><label>最低角色等级</label><input id="dtideLevelMin" type="number" min="1" max="100" placeholder="不限"></div>
        <div class="dtideField"><label>最高角色等级</label><input id="dtideLevelMax" type="number" min="1" max="100" placeholder="不限"></div>
        <div class="dtideField"><label>AA / OE 状态</label><select id="dtideProgression"><option value="">不限</option><option value="AA">AA</option><option value="OE">OE</option></select></div>
        <div class="dtideField"><label>借用助战</label><select id="dtideBorrowed"><option value="">不限</option><option value="yes">队伍包含助战</option><option value="no">队伍不含助战</option></select></div>
        <div class="dtideField"><label>最低启灵数</label><input id="dtideEnlightenMin" type="number" min="0" max="30" placeholder="数据源支持后启用"></div>
        <div class="dtideField"><label>最高启灵数</label><input id="dtideEnlightenMax" type="number" min="0" max="30" placeholder="数据源支持后启用"></div>
        <div class="dtideField"><label>命轮</label><select id="dtideWheel"><option value="">不限</option></select></div>
        <div class="dtideField"><label>密契</label><select id="dtideCovenant"><option value="">不限</option></select></div>
        <div class="dtideField"><label>最低榜单分</label><input id="dtideScoreMin" type="number" min="0" placeholder="不限"></div>
        <div class="dtideField"><label>最高榜单排名</label><input id="dtideRankMax" type="number" min="1" placeholder="例如 20"></div>
      </div>
      <div class="dtideActions"><button class="primaryBtn" id="dtideSearch" type="button">搜索配队</button><button class="ghostBtn" id="dtideReset" type="button">清空筛选</button></div>
      <div class="dtideSection"><div class="dtideResults" id="dtideResults"></div><div class="dtidePager" id="dtidePager"></div></div>
    </section>
    <section class="panel"><div class="sourceList"><div class="sourceItem"><strong>榜单来源：</strong><a href="https://eremora.com/leaderboard" target="_blank" rel="noopener noreferrer">Eremora Leaderboards</a>。本站只保存公开渲染出的榜单与挑战记录，并以本地快照计算统计。</div><div class="sourceItem" id="dtideCoverageNote"><strong>字段真实性：</strong>缺失字段不会从其他角色页面推断，也不会用当前展示配装冒充历史融灾配装。</div></div></section>
  `}

  async function waitMorimensData(){if(window.MorimensData?.db?.records)return;await new Promise(resolve=>{const t=setTimeout(resolve,5000);window.addEventListener('morimens-data-ready',()=>{clearTimeout(t);resolve()},{once:true})})}
  function characterInfo(key){
    const rec=awakenerMap.get(key)||Array.from(awakenerMap.values()).find(x=>x.ingameId===key)||null;
    if(!rec)return {name:key||'未知',image:'',id:key};
    const loc=window.MorimensData?.localizedProfile?.(rec);return {name:loc?.name||rec.name,image:rec.assets?.portrait||'',id:rec.id,ingameId:rec.ingameId};
  }
  function getSelectedValues(id){return Array.from($(id)?.selectedOptions||[]).map(x=>x.value).filter(Boolean)}
  function currentStatGroup(wave,clearType){
    if(!stats)return null;if(wave==='all')return clearType==='all'?stats.all:aggregateFilteredTeams(clearType);
    const g=stats.waves?.[wave];return g?.[clearType]||null;
  }
  function aggregateFilteredTeams(clearType){
    const groups=Object.values(stats?.waves||{}).map(x=>x?.[clearType]).filter(Boolean);const counts=new Map();let teamCount=0,memberSlots=0;
    for(const g of groups){teamCount+=g.teamCount||0;memberSlots+=g.memberSlots||0;for(const c of g.characters||[]){const key=c.id||c.ingameId||c.key,cur=counts.get(key)||{...c,count:0};cur.count+=c.count;counts.set(key,cur)}}
    const characters=[...counts.values()].map(x=>({...x,teamRatePct:teamCount?x.count/teamCount*100:0})).sort((a,b)=>b.count-a.count);return {teamCount,memberSlots,characters,wheels:[],covenants:[]};
  }

  function renderSummary(){
    const wave=$('dtideWave').value,ct=$('dtideClearType').value,g=currentStatGroup(wave,ct);if(!g)return;
    const coverage=manifest.fieldCoverage||{};
    $('dtideSummary').innerHTML=[['榜单记录',season.recordCount],['统计队伍',g.teamCount],['角色槽位',g.memberSlots],['已解析字段',`${['character','wave','level','enlightenLevel','wheels','covenants'].filter(k=>coverage[k]).length}/6`]].map(([a,b])=>`<div class="dtideStat"><small>${a}</small><strong>${esc(b)}</strong></div>`).join('');
    $('dtideStatus').textContent=`第 ${season.seasonId} 期 · ${season.complete?'完整同步':'部分同步'}`;
    $('dtideFilterCoverage').textContent=`等级 ✓ · 启灵 ${coverage.enlightenLevel?'✓':'—'} · 命轮 ${coverage.wheels?'✓':'—'} · 密契 ${coverage.covenants?'✓':'—'}`;
  }
  function renderMatrix(){
    const ct=$('dtideClearType').value,mode=$('dtideRateMode').value,waves=Object.keys(stats.waves||{}).sort((a,b)=>Number(a)-Number(b));const union=new Map();
    for(const w of waves){for(const c of stats.waves[w]?.[ct]?.characters||[]){const k=c.id||c.ingameId||c.key;if(!union.has(k))union.set(k,c)}}
    const rows=[...union.entries()].map(([k,c])=>{const total=waves.reduce((s,w)=>s+(stats.waves[w]?.[ct]?.characters||[]).find(x=>(x.id||x.ingameId||x.key)===k)?.count||0,0);return {k,c,total}}).sort((a,b)=>b.total-a.total);
    const header=`<table class="dtideTable"><thead><tr><th>角色</th>${waves.map(w=>`<th>Wave ${w}</th>`).join('')}<th>总出现</th></tr></thead><tbody>`;
    const body=rows.map(({k,c,total})=>{const info=characterInfo(c.id||c.ingameId||k);return `<tr><td><div class="dtideChar">${info.image?`<img src="${esc(info.image)}" alt="">`:''}<span>${esc(info.name)}</span></div></td>${waves.map(w=>{const group=stats.waves[w]?.[ct],hit=(group?.characters||[]).find(x=>(x.id||x.ingameId||x.key)===k);const rate=mode==='slot'?(group?.memberSlots?((hit?.count||0)/group.memberSlots*100):0):(hit?.teamRatePct||0);return `<td class="dtideRate">${pct(rate)}</td>`}).join('')}<td>${total}</td></tr>`}).join('');
    $('dtideMatrix').innerHTML=rows.length?header+body+'</tbody></table>':'<div class="dtideEmpty">当前口径没有记录。</div>';
  }
  function renderUsage(){
    const g=currentStatGroup($('dtideWave').value,$('dtideClearType').value),mode=$('dtideRateMode').value;if(!g)return;
    $('dtideUsage').innerHTML=(g.characters||[]).slice(0,18).map(c=>{const info=characterInfo(c.id||c.ingameId||c.key),rate=mode==='slot'?(g.memberSlots?c.count/g.memberSlots*100:0):c.teamRatePct;return `<div class="dtideUsage"><div class="dtideChar">${info.image?`<img src="${esc(info.image)}" alt="">`:''}<span><b>${esc(info.name)}</b><small>${c.count} 次</small></span></div><strong>${pct(rate)}</strong></div>`}).join('')||'<div class="dtideEmpty">无角色统计。</div>';
  }
  function renderEquipment(){
    const coverage=manifest.fieldCoverage||{},g=currentStatGroup($('dtideWave').value,$('dtideClearType').value);
    if(!coverage.wheels&&!coverage.covenants){$('dtideEquipment').innerHTML=`<div class="dtideNotice">${esc(stats.equipment?.note||'当前 Eremora 公开渲染记录没有展开命轮与密契原始字段，因此此处暂不生成伪造的出场率。数据结构和筛选器已经预留，后续一旦源记录可直接取得会自动启用。')}</div>`;return}
    const section=(title,arr)=>`<h4 style="margin:10px 0 7px;font-size:12px">${title}</h4><div class="dtideUsageCards">${(arr||[]).slice(0,15).map(x=>`<div class="dtideUsage"><div><b>${esc(x.name||x.key)}</b><small>${x.count} 支队伍</small></div><strong>${pct(x.teamRatePct)}</strong></div>`).join('')||'<div class="dtideEmpty">暂无</div>'}</div>`;
    $('dtideEquipment').innerHTML=section('命轮',g?.wheels)+section('密契',g?.covenants);
  }
  function populateFilters(){
    const chars=new Map();for(const r of season.records||[])for(const w of r.waves||[])for(const t of w.teams||[])for(const m of t.members||[]){const k=m.skeydbId||m.ingameId;if(k)chars.set(k,characterInfo(k))}
    const options=[...chars.entries()].sort((a,b)=>a[1].name.localeCompare(b[1].name,'zh-CN')).map(([k,v])=>`<option value="${esc(k)}">${esc(v.name)} · ${esc(v.ingameId||'')}</option>`).join('');$('dtideCharacters').innerHTML=options;$('dtideExcludeCharacters').innerHTML=options;
    const coverage=manifest.fieldCoverage||{};for(const id of ['dtideEnlightenMin','dtideEnlightenMax'])$(id).disabled=!coverage.enlightenLevel;$('dtideWheel').disabled=!coverage.wheels;$('dtideCovenant').disabled=!coverage.covenants;
    const wheelNames=new Map(),covNames=new Map();for(const r of season.records||[])for(const w of r.waves||[])for(const t of w.teams||[])for(const m of t.members||[]){for(const item of m.wheels||[])wheelNames.set(item.id||item.name,item.name||item.id);if(m.covenant)covNames.set(m.covenant.id||m.covenant.name,m.covenant.name||m.covenant.id)}
    $('dtideWheel').innerHTML='<option value="">不限</option>'+[...wheelNames].map(([k,v])=>`<option value="${esc(k)}">${esc(v)}</option>`).join('');$('dtideCovenant').innerHTML='<option value="">不限</option>'+[...covNames].map(([k,v])=>`<option value="${esc(k)}">${esc(v)}</option>`).join('');filtersReady=true;
  }

  function flattenTeams(){const rows=[];for(const r of season.records||[])for(const w of r.waves||[])for(const t of w.teams||[])rows.push({record:r,wave:w,team:t});return rows}
  function matchesFilters(row){
    const wave=$('dtideWave').value,ct=$('dtideClearType').value;if(wave!=='all'&&Number(wave)!==row.wave.wave)return false;if(ct!=='all'&&ct!==row.team.clearType)return false;
    const include=getSelectedValues('dtideCharacters'),exclude=getSelectedValues('dtideExcludeCharacters'),keys=row.team.members.map(m=>m.skeydbId||m.ingameId),mode=$('dtideCharacterMode').value;
    if(include.length&&!(mode==='all'?include.every(x=>keys.includes(x)):include.some(x=>keys.includes(x))))return false;if(exclude.some(x=>keys.includes(x)))return false;
    const targets=include.length?row.team.members.filter(m=>include.includes(m.skeydbId||m.ingameId)):row.team.members;
    const minLv=Number($('dtideLevelMin').value||0),maxLv=Number($('dtideLevelMax').value||0);if(minLv&&targets.some(m=>!m.level||m.level<minLv))return false;if(maxLv&&targets.some(m=>!m.level||m.level>maxLv))return false;
    const prog=$('dtideProgression').value;if(prog&&targets.some(m=>m.progression!==prog))return false;
    const borrowed=$('dtideBorrowed').value,hasBorrow=row.team.members.some(m=>m.borrowed);if(borrowed==='yes'&&!hasBorrow)return false;if(borrowed==='no'&&hasBorrow)return false;
    const emin=Number($('dtideEnlightenMin').value||0),emax=Number($('dtideEnlightenMax').value||0);if(emin&&targets.some(m=>m.enlightenLevel==null||m.enlightenLevel<emin))return false;if(emax&&targets.some(m=>m.enlightenLevel==null||m.enlightenLevel>emax))return false;
    const wheel=$('dtideWheel').value,cov=$('dtideCovenant').value;if(wheel&&!row.team.members.some(m=>(m.wheels||[]).some(x=>(x.id||x.name)===wheel)))return false;if(cov&&!row.team.members.some(m=>m.covenant&&(m.covenant.id||m.covenant.name)===cov))return false;
    const smin=Number($('dtideScoreMin').value||0),rmax=Number($('dtideRankMax').value||0);if(smin&&(row.record.score||0)<smin)return false;if(rmax&&(!row.record.rank||row.record.rank>rmax))return false;return true;
  }
  function renderResults(){
    const all=flattenTeams().filter(matchesFilters),limit=120,rows=all.slice(0,limit);$('dtideResults').innerHTML=rows.map(({record,wave,team})=>`<article class="dtideResult"><div class="dtideResultHead"><b>#${esc(record.rank??'—')} ${esc(record.player)} · Wave ${wave.wave} · ${team.clearType==='extra'?'Extra Clear':'Clear'} · ${esc(record.score??'—')} 分</b><a href="${esc(record.url)}" target="_blank" rel="noopener noreferrer">查看 Eremora 原记录</a></div><div class="dtideMembers">${team.members.map(m=>{const info=characterInfo(m.skeydbId||m.ingameId);return `<div class="dtideMember"><b>${esc(info.name)}</b><small>Lv.${esc(m.level??'—')} · ${esc(m.progression||'—')}${m.enlightenLevel!=null?` · 启灵 ${m.enlightenLevel}`:''}</small>${m.borrowed?'<small class="dtideBorrow">借用助战</small>':''}</div>`}).join('')}</div></article>`).join('')||'<div class="dtideEmpty">没有符合这些条件的配队。</div>';$('dtidePager').textContent=`匹配 ${all.length} 支队伍${all.length>limit?` · 当前显示前 ${limit} 支`:''}`;
  }
  function resetFilters(){for(const id of ['dtideLevelMin','dtideLevelMax','dtideEnlightenMin','dtideEnlightenMax','dtideScoreMin','dtideRankMax'])$(id).value='';for(const id of ['dtideProgression','dtideBorrowed','dtideWheel','dtideCovenant'])$(id).value='';for(const id of ['dtideCharacters','dtideExcludeCharacters'])for(const o of $(id).options)o.selected=false;$('dtideCharacterMode').value='all';renderResults()}
  function renderAll(){renderSummary();renderMatrix();renderUsage();renderEquipment();if(filtersReady)renderResults()}

  async function loadSeason(id){
    $('dtideStatus').textContent='正在载入期次…';const entry=manifest.availableSeasons.find(x=>String(x.seasonId)===String(id));if(!entry)throw new Error(`Season ${id} snapshot unavailable`);
    const [sr,st]=await Promise.all([fetch(`${entry.path}?v=${Date.now()}`,{cache:'no-store'}),fetch(`${entry.statsPath}?v=${Date.now()}`,{cache:'no-store'})]);if(!sr.ok||!st.ok)throw new Error(`season HTTP ${sr.status}, stats HTTP ${st.status}`);season=await sr.json();stats=await st.json();
    $('dtideWave').innerHTML='<option value="all">全部波次</option>'+Object.keys(stats.waves||{}).sort((a,b)=>Number(a)-Number(b)).map(w=>`<option value="${w}">Wave ${w}</option>`).join('');populateFilters();renderAll();
  }
  async function loadOnce(){
    if(manifest)return;try{
      await waitMorimensData();for(const r of window.MorimensData?.db?.records||[]){awakenerMap.set(r.id,r);if(r.ingameId)awakenerMap.set(r.ingameId,r)}
      const r=await fetch(`data/morimens/eremora/manifest.json?v=${Date.now()}`,{cache:'no-store'});if(!r.ok)throw new Error(`manifest HTTP ${r.status}`);manifest=await r.json();
      const sel=$('dtideSeason');sel.innerHTML=(manifest.availableSeasons||[]).map(s=>`<option value="${s.seasonId}">第 ${s.seasonId} 期${s.period?` · ${esc(s.period)}`:''}${s.complete?'':' · 部分'}</option>`).join('');if(!sel.options.length)throw new Error('暂无已完成的融灾快照');
      sel.value=String(manifest.currentSeason&&manifest.availableSeasons.some(x=>x.seasonId===manifest.currentSeason)?manifest.currentSeason:manifest.availableSeasons[0].seasonId);await loadSeason(sel.value);
      const pending=manifest.pendingBackfillSeasonIds||[];$('dtideCoverageNote').innerHTML=`<strong>字段真实性：</strong>${esc((manifest.notes||[]).join(' '))}${pending.length?` 当前还发现 ${pending.length} 个历史期次待增量回填：${pending.slice(0,12).join('、')}${pending.length>12?'…':''}`:''}`;
      sel.addEventListener('change',()=>loadSeason(sel.value).catch(showError));for(const id of ['dtideWave','dtideClearType','dtideRateMode'])$(id).addEventListener('change',()=>{renderAll()});$('dtideSearch').addEventListener('click',renderResults);$('dtideReset').addEventListener('click',resetFilters);
    }catch(e){showError(e)}
  }
  function showError(e){console.warn('D-Zone analytics failed',e);if($('dtideStatus'))$('dtideStatus').textContent='融灾数据加载失败';if($('dtideResults'))$('dtideResults').innerHTML=`<div class="dtideNotice">${esc(e?.message||e)}</div>`}

  function boot(){injectStyle();setupTabs();window.addEventListener('morimens-language-change',()=>{if($('morimensBuilderTab')){$('morimensBuilderTab').textContent=zh()?'伤害计算 / 每日签':'Damage / Fortune';$('morimensDtideTab').textContent=zh()?'融灾榜单':'D-Zone Leaderboard'}})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();

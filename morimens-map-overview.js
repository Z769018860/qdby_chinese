// 地图总览：游戏本地配置表中的全部（已上线）地图、战斗与怪物。数据：data/morimens/maps/*.json（scripts/build_map_overview.py 生成）
(function(){
  const $=id=>document.getElementById(id);
  const zh=()=>{try{return localStorage.getItem('morimens.language')!=='en'}catch{return true}};
  const ui=(cn,en)=>zh()?cn:en;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const BASE='data/morimens/maps/';
  const state={ready:false,loading:null,error:null,index:null,maps:null,battles:null,mons:null,stats:null,
    cat:'融灾',sub:'',q:'',limit:80,sel:null,mapPick:0,monSel:null,filtered:[]};
  const CATS=['融灾','主线','日常挑战','活动 / 支线','无光之境','尖塔模式','模拟战','其他'];
  const CATEN={'融灾':'D-Zone','主线':'Main story','日常挑战':'Daily challenge','活动 / 支线':'Events / side stories','无光之境':'Lightless Realm','尖塔模式':'Spire mode','模拟战':'Simulation','其他':'Other'};
  // node type name -> [css kind, icon]
  const KIND={'战斗':['combat','combat'],'精英':['elite','elite'],'最终战':['boss','boss'],'事件':['event','event'],'剧情':['event','event'],
    '灰烬遗迹':['reward','ash-ruins'],'褪色遗骨':['reward','bones'],'黑印':['reward','black-seal'],'锈蚀钥匙':['mechanism','rusted-key'],'锈蚀门扉':['obstacle','locked-door'],
    '幻象':['obstacle','illusion'],'隧道':['passage','tunnel'],'单行密道':['passage','passage-in'],'密道出口':['passage','passage-out'],'探照灯':['utility','lamp'],
    '不牢固的地板':['terrain',null,'unstable-floor'],'毒地板':['terrain',null,'poison-floor'],'开始':['start',null]};
  const CLS={Boss:['首领','Boss'],Elite:['精英','Elite'],Common:['普通','Common']};

  function css(){
    if($('moStyle'))return;
    const s=document.createElement('style');s.id='moStyle';
    s.textContent=`
      .moWrap{display:grid;grid-template-columns:minmax(260px,330px) minmax(0,1fr);gap:14px;align-items:start}
      .moBar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0}
      .moBar select,.moBar input{background:#111827;color:#dbe4f0;border:1px solid rgba(148,163,184,.35);border-radius:8px;padding:7px 10px;font-size:13px}
      .moBar input{min-width:200px}.moNote{color:#8290a2;font-size:12px}
      .moList{border:1px solid rgba(148,163,184,.2);border-radius:10px;background:#0a101a;max-height:76vh;overflow:auto}
      .moItem{display:block;width:100%;text-align:left;padding:8px 10px;border:0;border-bottom:1px solid rgba(148,163,184,.12);background:transparent;color:#c7d2e2;font-size:12.5px;cursor:pointer}
      .moItem:hover{background:rgba(213,177,118,.1)}.moItem.on{background:rgba(213,177,118,.2);color:#f4dfb9}.moItem small{display:block;color:#8290a2;font-size:11px;margin-top:2px}
      .moMore{display:block;width:100%;padding:9px;border:0;background:#111827;color:#f1d69f;cursor:pointer;font-weight:700}
      .moHead h3{margin:0 0 4px;font-size:18px;color:#f4dfb9}.moHead p{margin:0 0 8px;color:#8fa2bd;font-size:12.5px}
      .moTabs{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}.moTabs button{border:1px solid rgba(148,163,184,.3);background:#111827;color:#aeb8c7;border-radius:999px;padding:4px 12px;font-size:12px;cursor:pointer}.moTabs button.on{background:#d5b176;border-color:#d5b176;color:#1a1305;font-weight:700}
      .moMapWrap{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start}
      .moView{flex:1 1 420px;min-width:0;overflow:auto;border:1px solid rgba(148,163,184,.2);border-radius:10px;background:#0a101a;padding:10px}
      .moBoard{position:relative;margin:0 auto}
      .moNode{position:absolute;width:100px;height:112px;text-align:center}
      .moHex{position:absolute;left:0;top:0;width:100px;height:88px;clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);background:#1b2536;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;font-size:10px;line-height:1.15;color:#dbe4f0}
      .moHex img{width:38px;height:38px;object-fit:contain}.moHex span{max-width:78px}
      .moNode.combat .moHex{background:#4a2020}.moNode.elite .moHex{background:#5a3b14}.moNode.boss .moHex{background:#6b1d1d}
      .moNode.reward .moHex{background:#41381a}.moNode.event .moHex{background:#33244d}.moNode.start .moHex{background:#17402b}
      .moNode.obstacle .moHex{background:#2c3038}.moNode.passage .moHex{background:#1d3550}.moNode.mechanism .moHex{background:#19403f}.moNode.utility .moHex{background:#40401f}
      .moNode.terrain .moHex{background-color:#2a2a2a;background-size:cover}.moNode.tex-poison-floor .moHex{background:#1d3a1d url(assets/morimens/dzone-map/tile-poison-floor.webp) center/cover}
      .moNode.tex-unstable-floor .moHex{background:#3a2d1d url(assets/morimens/dzone-map/tile-unstable-floor.webp) center/cover}
      .moNode.other .moHex{background:#27303f}.moNode.sel .moHex{background-color:#8a6a1f;filter:brightness(1.3)}
      .moNode[data-bat]{cursor:pointer}.moNode[data-bat]:hover .moHex{filter:brightness(1.25)}
      .moNum{position:absolute;left:50%;top:-2px;transform:translateX(-50%);z-index:2;min-width:20px;height:20px;line-height:20px;border-radius:10px;background:#f1d69f;color:#1a1a1a;font-size:11px;font-weight:800}
      .moVar{position:absolute;right:6px;top:4px;z-index:2;font-size:10px;background:#3b475c;color:#fff;border-radius:8px;padding:0 5px}
      .moMons{position:absolute;left:50%;top:76px;transform:translateX(-50%);display:flex;gap:2px;z-index:2}
      .moMons img{width:26px;height:26px;border-radius:50%;object-fit:cover;border:2px solid #0a101a;background:#111827}
      .moSide{flex:1 1 280px;min-width:260px;font-size:12px;color:#c7d2e2}.moSide h4{margin:0 0 6px;font-size:13px;color:#ead9b9}
      .moBat{border:1px solid rgba(148,163,184,.2);border-radius:8px;padding:6px 8px;margin:5px 0;background:#0f1927;cursor:pointer}.moBat.sel{border-color:#f1d69f}
      .moBat b.n{display:inline-block;min-width:20px;height:20px;line-height:20px;text-align:center;border-radius:10px;background:#f1d69f;color:#1a1a1a;font-size:11px;margin-right:6px}
      .moBat small{color:#8290a2}.moMon{display:flex;gap:6px;align-items:center;margin:3px 0;cursor:pointer}.moMon img{width:26px;height:26px;border-radius:50%;object-fit:cover;background:#111827}
      .moMon:hover span{color:#f1d69f}.moMon .tag{font-size:10px;color:#8290a2}
      .moDetail{margin-top:12px;border:1px solid rgba(213,177,118,.4);border-radius:10px;padding:10px 12px;background:#0f1927}
      .moDetail h4{margin:0 0 4px;font-size:15px;color:#f4dfb9}.moDetail p{margin:3px 0;color:#aab6c8}
      .moDetail ul{margin:6px 0 0 18px;padding:0}.moDetail li{margin:3px 0;color:#c7d2e2}.moDetail .ty{color:#8290a2;font-size:11px}
      .moStats{display:flex;gap:14px;flex-wrap:wrap;margin:6px 0;color:#dbe4f0}.moStats b{color:#f1d69f}
      .moChain{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.moChain .moNode{position:relative;width:100px;height:100px}.moChain .arr{color:#8290a2}
      .moLegend{display:grid;gap:6px;color:#aab6c8;font-size:11.5px;margin-top:10px}.moLegend span{color:#8290a2}
      .moEmpty{padding:30px;text-align:center;color:#8997a9;border:1px dashed rgba(148,163,184,.2);border-radius:12px}
      @media(max-width:860px){.moWrap{grid-template-columns:1fr}.moList{max-height:40vh}}`;
    document.head.appendChild(s);
  }

  async function getJson(u){const r=await fetch(u,{cache:'no-cache'});if(!r.ok)throw new Error(u+': HTTP '+r.status);return r.json()}
  function load(){
    if(state.ready)return Promise.resolve();
    if(!state.loading)state.loading=Promise.all([getJson(BASE+'index.json'),getJson(BASE+'maps.json'),getJson(BASE+'battles.json'),getJson(BASE+'monsters.json'),getJson(BASE+'stage-stats.json')])
      .then(([i,m,b,mo,st])=>{state.index=i;state.maps=m;state.battles=b;state.mons=mo;state.stats=st;state.ready=true})
      .catch(e=>{state.error=e;state.loading=null;throw e});
    return state.loading;
  }
  const typeName=tid=>state.index.nodeTypes[tid]?.[0]||'';
  const typeDesc=tid=>state.index.nodeTypes[tid]?.[1]||'';
  const kindOf=name=>KIND[name]||['other',null];
  const catLabel=c=>zh()?c:(CATEN[c]||c);

  function filterStages(){
    const q=state.q.trim().toLowerCase();
    state.filtered=state.index.stages.filter(s=>s.c===state.cat&&(!state.sub||s.s===state.sub)&&(!q||s.n.toLowerCase().includes(q)||s.cn.toLowerCase().includes(q)||String(s.id)===q));
  }
  function subs(){
    const seen=new Map();
    for(const s of state.index.stages)if(s.c===state.cat&&s.s&&!seen.has(s.s))seen.set(s.s,s.p||0);
    return [...seen.entries()].sort((a,b)=>(b[1]-a[1])||a[0].localeCompare(b[0],'zh-CN')).map(x=>x[0]);
  }

  // ---------- map rendering ----------
  function bounds(cells){
    let minX=1e9,maxX=-1e9,minR=1e9,maxR=-1e9;
    for(const [x,y] of cells){const r=9-y,X=x+(r%2===0?.5:0);minX=Math.min(minX,X);maxX=Math.max(maxX,X);minR=Math.min(minR,r);maxR=Math.max(maxR,r)}
    return {minX,maxX,minR,maxR};
  }
  function nodeCls(tid){const n=typeName(tid),[k,icon,tex]=kindOf(n);return {n,k,icon,tex}}
  function battleOf(nid){const n=state.maps.nodes[nid];return n&&n[1]?String(n[1]):null}
  function monsList(bid){const b=state.battles[bid];return b?b[1]:[]}
  const monImg=m=>{const i=state.mons.monsters[m]?.i;return i?`<img src="assets/morimens/monster-preview/${esc(i)}.webp" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`:''};
  const monName=m=>state.mons.monsters[m]?.n||('#'+m);

  function mapView(mapId){
    const cells=state.maps.maps[mapId];
    if(!cells||!cells.length)return {html:`<div class="moEmpty">${ui('没有地图数据','No map data')}</div>`,battles:[]};
    const b=bounds(cells),SX=104,SY=94,W=Math.ceil((b.maxX-b.minX)*SX+100),H=Math.ceil((b.maxR-b.minR)*SY+112);
    const items=cells.map(c=>({x:c[0],y:c[1],r:9-c[1],nodes:c.slice(2)}));
    const order=[];
    for(const it of [...items].sort((a,b)=>a.r-b.r||a.x-b.x)){const bid=battleOf(it.nodes[0]);if(bid)order.push({it,bid})}
    const num=new Map(order.map((o,i)=>[o.it,i+1]));
    const html=items.map(it=>{
      const nid=it.nodes[0],tid=state.maps.nodes[nid]?.[0],c=nodeCls(tid),X=it.x+(it.r%2===0?.5:0);
      const left=(X-b.minX)*SX,top=(it.r-b.minR)*SY,bid=battleOf(nid),ml=bid?monsList(bid):[];
      const var_=it.nodes.length>1?`<span class="moVar" title="${esc(it.nodes.map(n=>typeName(state.maps.nodes[n]?.[0])).join(' / '))}">×${it.nodes.length}</span>`:'';
      const icon=c.icon?`<img src="assets/morimens/dzone-map/node-${esc(c.icon)}.webp" alt="" loading="lazy" onerror="this.style.display='none'">`:'';
      const lab=c.tex?'':`<span>${esc(c.n)}</span>`;
      const mons=ml.length?`<span class="moMons">${ml.slice(0,4).map(([m])=>`<span title="${esc(monName(m))}">${monImg(m)}</span>`).join('')}</span>`:'';
      const title=c.n+(typeDesc(tid)?' — '+typeDesc(tid):'')+(ml.length?': '+ml.map(([m])=>monName(m)).join(' / '):'');
      return `<div class="moNode ${esc(c.k)}${c.tex?' tex-'+esc(c.tex):''}${bid&&state.monSel?.bid===bid?' sel':''}" style="left:${left}px;top:${top}px"${bid?` data-bat="${bid}"`:''} title="${esc(title)}">${bid?`<span class="moNum">${num.get(it)}</span>`:''}${var_}<div class="moHex">${icon}${lab}</div>${mons}</div>`;
    }).join('');
    return {html:`<div class="moBoard" style="width:${W}px;height:${H}px">${html}</div>`,battles:order.map((o,i)=>({n:i+1,bid:o.bid,tid:state.maps.nodes[o.it.nodes[0]][0]})),items};
  }
  function chainView(seq){
    const html=seq.map((nid,i)=>{
      const tid=state.maps.nodes[nid]?.[0],c=nodeCls(tid),bid=battleOf(nid),ml=bid?monsList(bid):[];
      const icon=c.icon?`<img src="assets/morimens/dzone-map/node-${esc(c.icon)}.webp" alt="" onerror="this.style.display='none'">`:'';
      const mons=ml.length?`<span class="moMons">${ml.slice(0,4).map(([m])=>`<span title="${esc(monName(m))}">${monImg(m)}</span>`).join('')}</span>`:'';
      return `${i?'<span class="arr">→</span>':''}<div class="moNode ${esc(c.k)}"${bid?` data-bat="${bid}"`:''} title="${esc(c.n)}">${bid?`<span class="moNum">${i+1}</span>`:''}<div class="moHex">${icon}<span>${esc(c.n)}</span></div>${mons}</div>`;
    }).join('');
    return {html:`<div class="moChain">${html}</div>`,battles:seq.map((nid,i)=>({n:i+1,bid:battleOf(nid),tid:state.maps.nodes[nid]?.[0]})).filter(x=>x.bid)};
  }

  // ---------- monsters ----------
  const SK_PART={Attack:['攻击','Attack'],HeavyAttack:['重击','Heavy attack'],Defence:['防御','Defend'],Buff:['强化','Buff'],Debuff:['削弱','Debuff'],StrongBuff:['大幅强化','Strong buff'],StrongDebuff:['大幅削弱','Strong debuff'],Burst:['爆发','Burst'],Burst2:['爆发Ⅱ','Burst II'],Burst3:['爆发Ⅲ','Burst III'],Unknown:['未知','Unknown']};
  function skType(t){
    if(!t)return '';
    const k=String(t).replace(/^Intent_/,'');
    if(SK_PART[k])return ui(...SK_PART[k]);
    const parts=k.match(/(Heavy)?Attack|Defence|Debuff|Buff|Burst\d?|Strong|Unknown/g);
    return parts?parts.map(x=>SK_PART[x]?ui(...SK_PART[x]):x).join('·'):k;
  }
  function monDetail(mid,stage){
    const m=state.mons.monsters[mid];if(!m)return '';
    const cls=CLS[m.c]||[m.c||'',m.c||''];
    let stats='';
    const sm=stage?.sm&&state.stats[stage.sm];
    if(sm){
      const hit=Object.values(sm).find(x=>x[4]===m.bt)||null;
      if(hit)stats=`<div class="moStats"><span>Lv <b>${hit[0]}</b></span><span>${ui('生命','HP')} <b>${Math.round((hit[1]||0)*(m.hp||1)).toLocaleString()}</b></span><span>${ui('攻击','ATK')} <b>${Math.round((hit[2]||0)*(m.atk??1))}</b></span><span>${ui('防御','DEF')} <b>${Math.round((hit[3]||0)*(m.df??0))}</b></span><span class="moNote">${ui('按本关数值模板估算','estimated from the stage template')}</span></div>`;
    }
    const seen=new Set(),skills=(m.sk||[]).filter(id=>state.mons.skills[id]&&!seen.has(id)&&seen.add(id)).map(id=>{
      const [d,ty]=state.mons.skills[id],t=skType(ty?.[0]);
      return `<li><span class="ty">${esc(t)}</span> ${esc(d)}</li>`;
    }).join('');
    const loop=(m.cy||[]).map(id=>skType(state.mons.skills[id]?.[1]?.[0])||'?').join(' → ');
    return `<div class="moDetail"><h4>${esc(m.n)} <small class="moNote">${esc(ui(cls[0],cls[1]))}${m.b?' · '+esc(m.b):''} · #${mid}</small></h4><p>${esc(m.d)}</p>${stats}${loop?`<p><b>${ui('行动循环','Action loop')}</b>：${esc(loop)}</p>`:''}<ul>${skills}</ul></div>`;
  }

  // ---------- main render ----------
  function currentStage(){return state.index.stages.find(s=>s.id===state.sel)||null}
  function stageHtml(){
    const st=currentStage();
    if(!st)return `<div class="moEmpty">${ui('在左侧选择一个关卡查看地图与怪物。','Pick a stage on the left to see its map and monsters.')}</div>`;
    let view,tabs='';
    if(st.m&&st.m.length){
      if(state.mapPick>=st.m.length)state.mapPick=0;
      if(st.m.length>1)tabs=`<div class="moTabs">${st.m.map((id,i)=>`<button type="button" data-mo-map="${i}" class="${i===state.mapPick?'on':''}">${ui('地图','Map')} ${i+1}</button>`).join('')}</div>`;
      view=mapView(String(st.m[state.mapPick]));
    }else view=chainView(st.q||[]);
    state.view=view;
    const side=view.battles.map(b=>{
      const bb=state.battles[b.bid];if(!bb)return '';
      const cls=CLS[bb[0]]||[bb[0],bb[0]];
      return `<div class="moBat${state.monSel?.bid===b.bid?' sel':''}" data-bat="${b.bid}"><b class="n">${b.n}</b><small>${esc(typeName(b.tid))} · ${esc(ui(cls[0],cls[1]))} · #${b.bid}</small>${bb[1].map(([m])=>`<div class="moMon" data-mon="${m}" data-bat="${b.bid}">${monImg(m)}<span>${esc(monName(m))}</span><span class="tag">${esc(ui((CLS[state.mons.monsters[m]?.c]||['',''])[0],(CLS[state.mons.monsters[m]?.c]||['',''])[1]))}</span></div>`).join('')}</div>`;
    }).join('');
    const kinds=new Map();
    for(const it of view.items||[]){const tid=state.maps.nodes[it.nodes[0]]?.[0],n=typeName(tid);if(n&&!kinds.has(n))kinds.set(n,typeDesc(tid))}
    const legend=[...kinds.entries()].filter(([n])=>!['战斗','精英','最终战'].includes(n)).map(([n,d])=>`<div><b>${esc(n)}</b><span> ${esc(d)}</span></div>`).join('');
    return `<div class="moHead"><h3>${esc(st.n)}</h3><p>${esc(catLabel(st.c))}${st.s?' · '+esc(st.s):''} · ${ui('关卡等级','Stage Lv')} ${st.lv??'—'} · ID ${st.id}${st.m?` · ${ui('地图','map')} ${st.m.join(', ')}`:''}</p></div>${tabs}
      <div class="moMapWrap"><div class="moView">${view.html}</div><div class="moSide"><h4>${ui('战斗与怪物','Battles & monsters')}</h4>${side||`<div class="moNote">${ui('此关没有战斗节点。','No battle nodes here.')}</div>`}${legend?`<div class="moLegend">${legend}</div>`:''}</div></div>
      <div id="moMonDetail">${state.monSel?monDetail(state.monSel.mid,st):''}</div>`;
  }
  function listHtml(){
    const shown=state.filtered.slice(0,state.limit);
    return shown.map(s=>`<button type="button" class="moItem${s.id===state.sel?' on':''}" data-mo-stage="${s.id}">${esc(s.n)}<small>${esc(s.s||catLabel(s.c))} · Lv ${s.lv??'—'} · ${s.m?ui('地图','map')+' '+s.m.length:ui('线性节点','linear')}</small></button>`).join('')
      +(state.filtered.length>shown.length?`<button type="button" class="moMore" data-mo-more>${ui('显示更多','Show more')}（${state.filtered.length-shown.length}）</button>`:'')
      ||`<div class="moEmpty">${ui('没有符合条件的关卡','No stages match')}</div>`;
  }
  function renderShell(){
    const host=$('morimensMapsPanel');if(!host)return;
    const sub=subs();
    host.innerHTML=`<section class="panel"><h2>${ui('地图总览','Map Overview')}</h2>
      <p class="moNote">${ui('数据读取自游戏客户端配置表（2026-10-12/13）：关卡 → 地图格位 → 节点 → 战斗 → 怪物 → 技能。未上线内容（第 71 期之后的融灾、未发布唤醒体的活动等）未收录。','Read from the game client config tables (2026-10-12/13): stage → map cells → nodes → battles → monsters → skills. Unreleased content is not included.')} ${ui('共','Total')} ${state.index.stages.length} ${ui('个关卡','stages')}。</p>
      <div class="moBar"><select id="moCat">${CATS.map(c=>`<option value="${esc(c)}"${c===state.cat?' selected':''}>${esc(catLabel(c))}（${state.index.stages.filter(s=>s.c===c).length}）</option>`).join('')}</select>
        <select id="moSub"><option value="">${ui('全部子类','All sub-groups')}</option>${sub.map(x=>`<option value="${esc(x)}"${x===state.sub?' selected':''}>${esc(x)}</option>`).join('')}</select>
        <input id="moQ" type="search" value="${esc(state.q)}" placeholder="${esc(ui('搜索关卡名 / ID','Search stage name / ID'))}"><span class="moNote" id="moCount"></span></div>
      <div class="moWrap"><div class="moList" id="moList"></div><div id="moStage"></div></div></section>`;
  }
  function renderList(){const el=$('moList');if(!el)return;el.innerHTML=listHtml();const c=$('moCount');if(c)c.textContent=`${state.filtered.length} ${ui('个关卡','stages')}`}
  function renderStage(){const el=$('moStage');if(el)el.innerHTML=stageHtml()}
  function refresh(){filterStages();renderList()}

  function bind(){
    const host=$('morimensMapsPanel');if(!host||host.dataset.bound)return;host.dataset.bound='1';
    host.addEventListener('change',e=>{
      if(e.target.id==='moCat'){state.cat=e.target.value;state.sub='';state.limit=80;renderShell();refresh();renderStage()}
      else if(e.target.id==='moSub'){state.sub=e.target.value;state.limit=80;refresh()}
    });
    host.addEventListener('input',e=>{if(e.target.id==='moQ'){state.q=e.target.value;state.limit=80;refresh()}});
    host.addEventListener('click',e=>{
      const st=e.target.closest('[data-mo-stage]');if(st){state.sel=Number(st.dataset.moStage);state.mapPick=0;state.monSel=null;renderList();renderStage();return}
      if(e.target.closest('[data-mo-more]')){state.limit+=120;renderList();return}
      const mp=e.target.closest('[data-mo-map]');if(mp){state.mapPick=Number(mp.dataset.moMap);state.monSel=null;renderStage();return}
      const mon=e.target.closest('[data-mon]');if(mon){state.monSel={mid:mon.dataset.mon,bid:mon.dataset.bat};renderStage();return}
      const bat=e.target.closest('[data-bat]');if(bat){const bid=bat.dataset.bat,first=state.battles[bid]?.[1]?.[0]?.[0];if(first){state.monSel={mid:String(first),bid};renderStage()}}
    });
  }
  async function open(){
    css();const host=$('morimensMapsPanel');if(!host)return;
    if(!state.ready){host.innerHTML=`<section class="panel"><p class="moNote">${ui('正在加载地图数据…','Loading map data…')}</p></section>`;
      try{await load()}catch(e){host.innerHTML=`<section class="panel"><div class="moEmpty">${ui('地图数据加载失败：','Failed to load map data: ')}${esc(e.message)}</div></section>`;return}}
    renderShell();bind();refresh();renderStage();
  }
  window.MorimensMapOverview={open};
  window.addEventListener('morimens-language-change',()=>{if(state.ready&&$('morimensMapsPanel')&&!$('morimensMapsPanel').hidden){renderShell();refresh();renderStage()}});
})();

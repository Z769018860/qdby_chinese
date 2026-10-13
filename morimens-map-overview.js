// 全部地图视图（嵌在「地图怪物总览」里）：游戏本地配置表中的全部（已上线）地图、战斗与怪物。数据：data/morimens/maps/*.json（scripts/build_map_overview.py 生成）
// 关卡带 u（解锁时间）时，到时间前不显示、到时间自动出现。
(function(){
  const $=id=>document.getElementById(id);
  const zh=()=>{try{return localStorage.getItem('morimens.language')!=='en'}catch{return true}};
  const ui=(cn,en)=>zh()?cn:en;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const BASE='data/morimens/maps/';
  const state={ready:false,loading:null,error:null,index:null,maps:null,battles:null,mons:null,stats:null,train:null,tpick:{},
    cat:'融灾',sub:'',q:'',limit:80,sel:null,mapPick:0,monSel:null,filtered:[],root:null,defPeriod:null,init:false};
  const CATS=['融灾','记忆回廊','主线','日常挑战','活动 / 支线','无光之境','尖塔模式','模拟战','其他'];
  const CATEN={'融灾':'D-Zone','记忆回廊':'Memory Corridor','主线':'Main story','日常挑战':'Daily challenge','活动 / 支线':'Events / side stories','无光之境':'Lightless Realm','尖塔模式':'Spire mode','模拟战':'Simulation','其他':'Other'};
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
      .moTseg{margin:0 0 12px;padding:8px 10px;border:1px solid rgba(148,163,184,.16);border-radius:12px}.moTseg h5{margin:0 0 6px;font-size:13px;color:#d5b176}
      .moTrow{display:flex;flex-wrap:wrap;gap:8px}.moTn{min-width:110px;max-width:170px;padding:6px 8px;border-radius:10px;background:#111827;border:1px solid rgba(148,163,184,.22);font-size:12px;color:#cbd5e1;display:grid;gap:4px;align-content:start}
      .moTn small{color:#8290a2}.moTn.combat{border-color:rgba(248,113,113,.4)}.moTn.reward{border-color:rgba(213,177,118,.45)}.moTn.event{border-color:rgba(125,211,252,.4)}
      .moTv{display:flex;align-items:center;gap:6px;padding:3px;border-radius:8px;cursor:pointer}.moTv:hover,.moTv.sel{background:rgba(213,177,118,.15)}.moTv .moNum{position:static}
      .moIcon{width:26px;height:26px;object-fit:contain;vertical-align:middle;margin-right:5px;flex:none}.moRot li,.moDetail li{display:flex;align-items:center;gap:4px}.moRot li .ty,.moDetail li .ty{flex:none}
      .moLoop{display:flex;flex-wrap:wrap;align-items:center;gap:6px}.moStep{display:inline-flex;align-items:center;border:1px solid rgba(148,163,184,.25);border-radius:8px;padding:2px 9px 2px 5px;background:#111827}.moLoop .arr{color:#8290a2}
      .moScroll{overflow:auto;margin-top:8px}.moTable{width:100%;border-collapse:collapse;font-size:12px}.moTable th,.moTable td{padding:6px 8px;border-bottom:1px solid rgba(148,163,184,.1);text-align:left;vertical-align:top}.moTable th{color:#8290a2;white-space:nowrap}.moTable td.dzKo{min-width:240px;color:#aab6c8;white-space:normal}.moTable .dzTypeCell{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}.moTable .dzIconSm{width:20px;height:20px}.moTable b{color:#ead9b9}
.moNode.void{pointer-events:none}.moNode.void .moHex{background:rgba(148,163,184,.07)}
      .moEmpty{padding:30px;text-align:center;color:#8997a9;border:1px dashed rgba(148,163,184,.2);border-radius:12px}
      @media(max-width:860px){.moWrap{grid-template-columns:1fr}.moList{max-height:40vh}}`;
    document.head.appendChild(s);
  }

  async function getJson(u){const r=await fetch(u,{cache:'no-cache'});if(!r.ok)throw new Error(u+': HTTP '+r.status);return r.json()}
  function load(){
    if(state.ready)return Promise.resolve();
    if(!state.loading)state.loading=Promise.all([getJson(BASE+'index.json'),getJson(BASE+'maps.json'),getJson(BASE+'battles.json'),getJson(BASE+'monsters.json'),getJson(BASE+'stage-stats.json'),getJson(BASE+'train.json').catch(()=>null)])
      .then(([i,m,b,mo,st,tr])=>{state.index=i;state.maps=m;state.battles=b;state.mons=mo;state.stats=st;state.train=tr;state.ready=true})
      .catch(e=>{state.error=e;state.loading=null;throw e});
    return state.loading;
  }
  const typeName=tid=>state.index.nodeTypes[tid]?.[0]||'';
  const typeDesc=tid=>state.index.nodeTypes[tid]?.[1]||'';
  const kindOf=name=>KIND[name]||['other',null];
  const catLabel=c=>zh()?c:(CATEN[c]||c);

  const unlocked=s=>!s.u||Date.parse(s.u)<=Date.now();
  const visible=()=>state.index.stages.filter(unlocked);
  function filterStages(){
    const q=state.q.trim().toLowerCase();
    state.filtered=visible().filter(s=>s.c===state.cat&&(!state.sub||s.s===state.sub)&&(!q||s.n.toLowerCase().includes(q)||s.cn.toLowerCase().includes(q)||String(s.id)===q));
  }
  function subs(){
    const seen=new Map();
    for(const s of visible())if(s.c===state.cat&&s.s&&!seen.has(s.s))seen.set(s.s,s.p||0);
    return [...seen.entries()].sort((a,b)=>(b[1]-a[1])||a[0].localeCompare(b[0],'zh-CN')).map(x=>x[0]);
  }

  // ---------- map rendering ----------
  function bounds(cells){
    let minX=1e9,maxX=-1e9,minR=1e9,maxR=-1e9;
    for(const [x,y] of cells){const r=9-y,X=x+(r%2===1?.5:0);minX=Math.min(minX,X);maxX=Math.max(maxX,X);minR=Math.min(minR,r);maxR=Math.max(maxR,r)}
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
    const items=cells.map(c=>({x:c[0],y:c[1],r:9-c[1],nodes:c.slice(2)}));
    // the client grid has 13 cells in odd y rows and 12 in even y rows; unused cells are drawn as a faint grid so neighbours / paths stay readable
    const have=new Set(items.map(i=>i.x+':'+i.y)),voids=[];
    {const y0=Math.min(...items.map(i=>i.y)),y1=Math.max(...items.map(i=>i.y)),x0=Math.min(...items.map(i=>i.x)),x1=Math.max(...items.map(i=>i.x));
     for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){if(y%2===0&&x>12)continue;if(!have.has(x+':'+y))voids.push({x,y,r:9-y})}}
    const b=bounds([...cells,...voids.map(v=>[v.x,v.y])]),SX=104,SY=94,W=Math.ceil((b.maxX-b.minX)*SX+100),H=Math.ceil((b.maxR-b.minR)*SY+112);
    const order=[];
    for(const it of [...items].sort((a,b)=>a.r-b.r||a.x-b.x)){const bid=battleOf(it.nodes[0]);if(bid)order.push({it,bid})}
    const num=new Map(order.map((o,i)=>[o.it,i+1]));
    const voidHtml=voids.map(v=>{const X=v.x+(v.r%2===1?.5:0);return `<div class="moNode void" style="left:${(X-b.minX)*SX}px;top:${(v.r-b.minR)*SY}px"><div class="moHex"></div></div>`}).join('');
    const html=voidHtml+items.map(it=>{
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

  function trainView(st){
    const segs=state.train?.stages?.[st.id];
    if(!segs)return {html:`<div class="moEmpty">${ui('没有地图数据','No map data')}</div>`,battles:[]};
    const battles=[];let n=0;
    const nodeHtml=nd=>{
      const [tid,name,bids,evn,evd]=nd,tn=typeName(tid)||name;
      if(!bids.length){
        const c=nodeCls(tid);
        return `<div class="moTn ${esc(c.k)}" title="${esc(evd||typeDesc(tid))}"><b>${esc(evn||name)}</b><small>${esc(evn?tn:(c.n||tn))}</small></div>`;
      }
      const rows=bids.map(bid=>{
        const ml=monsList(bid);n++;battles.push({n,bid,tid});
        return `<div class="moTv${state.monSel?.bid===String(bid)?' sel':''}" data-bat="${bid}"><span class="moNum">${n}</span><span class="moMons">${ml.slice(0,4).map(([m])=>`<span title="${esc(monName(m))}">${monImg(m)}</span>`).join('')}</span></div>`;
      }).join('');
      return `<div class="moTn combat" title="${esc(typeDesc(tid))}"><b>${esc(bids.length>1?ui('随机战斗','Random battle')+' ×'+bids.length:tn)}</b>${rows}</div>`;
    };
    const html=segs.map((sg,i)=>{
      let gid=sg.g[0],tabs='';
      if(sg.t==='P'){
        const k=Math.min(state.tpick[i]||0,sg.g.length-1);gid=sg.g[k];
        tabs=`<div class="moTabs">${sg.g.map((g,j)=>`<button type="button" data-mo-tp="${i}:${j}" class="${j===k?'on':''}">${esc(state.train.groups[g].cn)}</button>`).join('')}</div>`;
      }
      const g=state.train.groups[gid];
      return `<div class="moTseg"><h5>${i+1}. ${esc(sg.cn)}${sg.t==='P'?` <small class="moNote">${ui('从下列章节中随机进入其一','one of these chapters is picked at random')}</small>`:''}</h5>${tabs}<div class="moTrow">${g.nodes.map(nodeHtml).join('')}</div></div>`;
    }).join('');
    return {html:`<div class="moTrain">${html}</div>`,battles,items:[]};
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
  // ---- numbers: skill Para formulas (BattleAtkForce*0.8 ...) evaluated with the stage's ATK / DEF / HP template ----
  const fmtN=n=>Math.round(n).toLocaleString('en-US');
  function splitTop(str){const out=[];let d=0,cur='';for(const ch of str){if(ch==='('){d++}else if(ch===')'){d--}if(ch===','&&d===0){out.push(cur);cur=''}else cur+=ch}out.push(cur);return out}
  function evalExpr(e,c){
    let unk=false,layer=false;
    let s=String(e).trim();
    if(!s)return null;
    s=s.replace(/CmdCaster\.GetStateLayer\([^)]*\)/g,()=>{layer=true;return '0'})
       .replace(/PlayerRole\.GetStateLayer\([^)]*\)|HandDeck\.[A-Za-z.]*\([^)]*\)(\.CardCount)?|HandDeck\.CardCount|PlayerRole\.[a-z_]+|GetStagePower\(\)|CmdCaster\.hp\b/g,()=>{unk=true;return '0'})
       .replace(/BattleAtkForce|CmdCaster\.atk/g,'A').replace(/BattleDefForce|CmdCaster\.def/g,'D').replace(/CmdCaster\.max_hp/g,'H').replace(/math\./g,'Math.');
    if(unk||!/^[\dADH+\-*/().,\sMathfloorceilmaxin]*$/.test(s))return null;
    try{const v=Function('A','D','H','"use strict";return ('+s+')')(c.atk,c.def,c.hp);if(!Number.isFinite(v))return null;return {v,layer}}catch{return null}
  }
  // formula that cannot be evaluated (depends on the player's HP / hand / stacks): shown readably with ATK / DEF / HP filled in
  function formulaText(e,c){
    let s=String(e).trim();if(!s)return 'X';
    const n=v=>c?fmtN(v):null;
    s=s.replace(/CmdCaster\.GetStateLayer\([^)]*\)/g,'〔层数〕').replace(/PlayerRole\.GetStateLayer\([^)]*\)/g,'〔玩家层数〕')
       .replace(/HandDeck\.GetCardListByState\([^)]*\)\.CardCount/g,'〔指定卡牌数〕').replace(/HandDeck\.CardCount/g,'〔手牌数〕')
       .replace(/PlayerRole\.max_hp/g,'〔玩家最大生命〕').replace(/PlayerRole\.hp/g,'〔玩家当前生命〕').replace(/PlayerRole\.block/g,'〔玩家护盾〕')
       .replace(/GetStagePower\(\)/g,'〔关卡强度〕').replace(/CmdCaster\.max_hp/g,c?fmtN(c.hp):'〔生命〕').replace(/CmdCaster\.hp/g,'〔当前生命〕')
       .replace(/BattleAtkForce|CmdCaster\.atk/g,c?fmtN(c.atk):'〔攻击〕').replace(/BattleDefForce|CmdCaster\.def/g,c?fmtN(c.def):'〔防御〕')
       .replace(/math\.(floor|ceil)/g,'').replace(/math\.max/g,'最大').replace(/math\.min/g,'最小').replace(/\*/g,'×');
    return '〔'+s.replace(/〔|〕/g,'')+'〕';
  }
  function skillText(id,c){
    const sk=state.mons.skills[id];if(!sk)return '';
    const parts=splitTop(sk[2]||'');
    return sk[0].replace(/\{(\d)\}/g,(m,k,off,str)=>{const nx0=str.slice(off+3).trim()[0],nx='';
      const e=parts[Number(k)-1],r=c&&e!=null?evalExpr(e,c):null;
      if(r)return fmtN(r.v)+(r.layer?'+':'')+nx;
      if(e==null||String(e).trim()==='')return nx0==='次'?'1':'X';   // no parameter: hit count defaults to 1
      return formulaText(e,c)+nx;
    });
  }
  // 数值 column: damage / shield / strength ... with the evaluated numbers (formula text when it depends on the player)
  const NUM_KIND={Damage:['伤害','Damage'],Block:['护盾','Shield'],Power:['力量','Strength'],TentaclePower:['触腕伤害','Tentacle'],Energy:['狂气','Madness']};
  function skillNums(id,c){
    const sk=state.mons.skills[id];if(!sk)return '';
    const parts=splitTop(sk[2]||''),kinds=sk[5]||{},byKind={};
    for(const [a,k] of Object.entries(kinds))byKind[k]=a;
    const val=k=>{const e=parts[Number(k)-1];if(e==null||String(e).trim()==='')return null;const r=c?evalExpr(e,c):null;return r?fmtN(r.v)+(r.layer?'+':''):formulaText(e,c)};
    const out=[],seen=new Set();
    const add=(arg,label,suffix)=>{if(seen.has(arg+label))return;const v=val(arg);if(v==null)return;seen.add(arg+label);out.push(`${esc(label)} <b>${esc(v)}</b>${suffix||''}`)};
    for(const k of Object.keys(NUM_KIND)){
      if(!byKind[k])continue;
      let suffix='';if(k==='Damage'&&byKind.AttackTimes){const n=val(byKind.AttackTimes);if(n&&n!=='1')suffix=` × ${esc(n)}`}
      add(byKind[k],ui(NUM_KIND[k][0],NUM_KIND[k][1]),suffix);
    }
    // plain [ArgN] placeholders: read the meaning from the description ("N 点力量", "N 层祈祷", "N 回合虚弱" ...)
    const t=sk[0];let m;
    const re1=/\{(\d)\}\s*点(伤害|护盾|力量|触腕伤害|狂气)/g;while((m=re1.exec(t)))add(m[1],m[2]);
    const re2=/\{(\d)\}\s*层([^，。,.\s{「」]+|「[^」]+」)/g;while((m=re2.exec(t)))add(m[1],m[2].replace(/[「」]/g,''),' 层');
    const re3=/\{(\d)\}\s*回合(?:的)?([^，。,.\s{「」]+)/g;while((m=re3.exec(t)))add(m[1],m[2],' 回合');
    return out.join(' · ');
  }
  const TARGET={FrontEnemy:['前排唤醒体','Front Awakener'],PlayerRole:['我方','Player side'],CmdCaster:['自身','Self'],AllAlly:['全体友方','All allies'],RandomAwaker:['随机唤醒体','Random Awakener'],OtherAlly:['其他友方','Other allies'],FrontAlly:['最前方友方','Front ally'],MaxHpAlly:['生命最高的友方','Highest-HP ally'],'':['视条件而定','Conditional']};
  const targetOf=g=>{const l=TARGET[g];return l?ui(l[0],l[1]):(g&&g.length<24?g:ui('视条件而定','Conditional'))};
  // 技能 / 类型 / 目标 / 数值 / 官方描述 table (same layout as the Info.kr based intent tables)
  function intentTable(it,labelOf){
    const lab=labelOf||(r=>r.type||'?');
    const rows=[...it.rotation,...it.skills.filter(r=>!it.rotation.some(x=>x.id===r.id))].map(r=>`<tr><td>${r.name?esc(r.name):`<span style="color:#8290a2">${ui('（无名称）','(unnamed)')}</span>`}${r.opening?` <small>${ui('开场','Opening')}</small>`:''}</td><td><span class="dzTypeCell">${intentIcon(r.raw,'dzIcon dzIconSm')}${esc(lab(r))}</span></td><td>${esc(targetOf(r.target))}</td><td>${r.nums||'—'}</td><td class="dzKo">${esc(r.text)}</td></tr>`).join('');
    return `<div class="dzScroll moScroll"><table class="dzTable dzSkill moTable"><thead><tr><th>${ui('技能','Skill')}</th><th>${ui('类型','Type')}</th><th>${ui('目标','Target')}</th><th>${ui('数值','Values')}</th><th>${ui('官方描述','Description')}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  // stat context of a monster: ATK / DEF / HP from the stage's monster template (matched by battle tag and level)
  function monCtx(m,o){
    if(!m||!state.stats)return null;
    o=o||{};let hit=null;
    const mk=x=>({lv:x[0],hp:(x[1]||0)*(m.hp||1),atk:(x[2]||0)*(m.atk??1),def:(x[3]||0)*(m.df??0)});
    if(!o.sm&&o.cn){const st=state.index.stages.find(x=>x.cn===o.cn);if(st)o.sm=st.sm}
    if(o.sm&&state.stats[o.sm])hit=Object.values(state.stats[o.sm]).find(x=>x[4]===m.bt&&(o.level==null||x[0]===o.level))||Object.values(state.stats[o.sm]).find(x=>x[4]===m.bt);
    if(hit)return mk(hit);
    if(o.level==null)return null;
    if(!state.smPeriod){state.smPeriod=new Map();for(const s of state.index.stages)if(s.sm&&!state.smPeriod.has(s.sm))state.smPeriod.set(s.sm,s.p||0)}
    let best=null,bd=1e9;
    for(const [sm,tab] of Object.entries(state.stats))for(const x of Object.values(tab)){
      if(x[4]!==m.bt||x[0]!==o.level)continue;
      const d=o.period?Math.abs((state.smPeriod.get(Number(sm))||0)-o.period):0;
      if(d<bd){bd=d;best=x}
    }
    return best?mk(best):null;
  }
  function monIntent(mid,o){
    const m=state.mons.monsters[mid];if(!m)return null;
    const c=monCtx(m,o),seen=new Set(),all=(m.sk||[]).filter(id=>state.mons.skills[id]&&!seen.has(id)&&seen.add(id));
    const cyc=(m.cy||[]).filter(id=>state.mons.skills[id]),opening=new Set(m.op||[]);
    const row=id=>{const sk=state.mons.skills[id];return {id,raw:sk[1]?.[0]||'',type:skType(sk[1]?.[0]),text:skillText(id,c),name:sk[3]||'',target:sk[4]||'',nums:skillNums(id,c),opening:opening.has(id)&&!cyc.includes(id)}};
    return {mid,m,ctx:c,rotation:cyc.map(row),skills:all.map(row)};
  }
  const statsHtml=c=>c?`<div class="moStats"><span>Lv <b>${c.lv}</b></span><span>${ui('生命','HP')} <b>${fmtN(c.hp)}</b></span><span>${ui('攻击','ATK')} <b>${fmtN(c.atk)}</b></span><span>${ui('防御','DEF')} <b>${fmtN(c.def)}</b></span></div>`:'';
  const ICON={Attack:'001',HeavyAttack:'002',Debuff:'003',StrongDebuff:'004',Buff:'005',StrongBuff:'006',Defence:'007',AttackDefence:'008',AttackDebuff:'009',AttackBuff:'010',DefenceBuff:'011',DefenceDebuff:'012',Dizzy:'013',Unknown:'014',Burst:'015',Burst2:'015',Burst3:'015'};
  function intentIcon(raw,cls){
    const k=String(raw||'').replace(/^Intent_/,'');
    const key=ICON[k]?k:Object.keys(ICON).sort((a,b)=>b.length-a.length).find(x=>k.startsWith(x))||'Unknown';
    return `<img class="${cls||'moIcon'}" src="assets/morimens/dzone-intent/intent_${ICON[key]}.png" alt="" loading="lazy" onerror="this.style.display='none'">`;
  }
  function monDetail(mid,stage){
    const it=monIntent(mid,{sm:stage?.sm,period:stage?.p});if(!it)return '';
    const m=it.m,cls=CLS[m.c]||[m.c||'',m.c||''];
    const loop=it.rotation.map(r=>`<span class="moStep">${intentIcon(r.raw,'moIcon')}${esc(r.type||'?')}</span>`).join('<span class="arr">→</span>');
    return `<div class="moDetail"><h4>${esc(m.n)} <small class="moNote">${esc(ui(cls[0],cls[1]))}${m.b?' · '+esc(m.b):''} · #${mid}</small></h4><p>${esc(m.d)}</p>${statsHtml(it.ctx)}${loop?`<p class="moLoop"><b>${ui('行动循环','Action loop')}</b>${loop}</p>`:''}${intentTable(it)}</div>`;
  }
  // used by the D-Zone guide when a monster has no intent data of its own: find the client monster by Chinese name
  async function intentByName(names,o){
    try{await load()}catch{return null}
    if(!state.nameIdx){state.nameIdx=new Map();for(const [id,m] of Object.entries(state.mons.monsters)){const k=String(m.n||'').replace(/[「」『』\s]/g,'');if(!state.nameIdx.has(k))state.nameIdx.set(k,[]);state.nameIdx.get(k).push(id)}}
    if(o&&o.period&&o.wi!=null&&o.ai!=null){   // seasons with 7 threat levels (C..▼) have one client stage per zone / level: letters A..G
      const L='ABCDEFG'[o.ai],cn=`关卡@融蚀深渊${o.period}期${L}${o.wi+1}`;
      if(L&&state.index.stages.some(x=>x.cn===`关卡@融蚀深渊${o.period}期G1`)&&state.index.stages.some(x=>x.cn===cn))o={...o,cn};
    }
    for(const nm of names||[]){
      const ids=state.nameIdx.get(String(nm||'').replace(/[「」『』\s]/g,''));if(!ids)continue;
      const its=ids.map(id=>monIntent(id,o)).filter(Boolean);
      const hit=its.find(x=>x.ctx)||its[0];if(hit)return hit;
    }
    return null;
  }

  // ---------- main render ----------
  function currentStage(){return visible().find(s=>s.id===state.sel)||null}
  function stageHtml(){
    const st=currentStage();
    if(!st)return `<div class="moEmpty">${ui('在左侧选择一个关卡查看地图与怪物。','Pick a stage on the left to see its map and monsters.')}</div>`;
    let view,tabs='';
    if(st.t)view=trainView(st);
    else if(st.m&&st.m.length){
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
    return shown.map(s=>`<button type="button" class="moItem${s.id===state.sel?' on':''}" data-mo-stage="${s.id}">${esc(s.n)}<small>${esc(s.s||catLabel(s.c))} · Lv ${s.lv??'—'} · ${s.t?ui('列车路线','train route'):s.m?ui('地图','map')+' '+s.m.length:ui('线性节点','linear')}</small></button>`).join('')
      +(state.filtered.length>shown.length?`<button type="button" class="moMore" data-mo-more>${ui('显示更多','Show more')}（${state.filtered.length-shown.length}）</button>`:'')
      ||`<div class="moEmpty">${ui('没有符合条件的关卡','No stages match')}</div>`;
  }
  function renderShell(){
    const host=state.root;if(!host)return;
    const sub=subs();
    host.innerHTML=`<section class="moSection">
      <p class="moNote">${ui('数据读取自游戏客户端配置表（2026-10-12/13）：关卡 → 地图格位 → 节点 → 战斗 → 怪物 → 技能。未上线的内容不会显示，到上线时间会自动解锁。','Read from the game client config tables (2026-10-12/13): stage → map cells → nodes → battles → monsters → skills. Unreleased content stays hidden and unlocks automatically at its release time.')} ${ui('共','Total')} ${visible().length} ${ui('个关卡','stages')}。</p>
      <div class="moBar"><select id="moCat">${CATS.map(c=>`<option value="${esc(c)}"${c===state.cat?' selected':''}>${esc(catLabel(c))}（${visible().filter(s=>s.c===c).length}）</option>`).join('')}</select>
        <select id="moSub"><option value="">${ui('全部子类','All sub-groups')}</option>${sub.map(x=>`<option value="${esc(x)}"${x===state.sub?' selected':''}>${esc(x)}</option>`).join('')}</select>
        <input id="moQ" type="search" value="${esc(state.q)}" placeholder="${esc(ui('搜索关卡名 / ID','Search stage name / ID'))}"><span class="moNote" id="moCount"></span></div>
      <div class="moWrap"><div class="moList" id="moList"></div><div id="moStage"></div></div></section>`;
  }
  function renderList(){const el=$('moList');if(!el)return;el.innerHTML=listHtml();const c=$('moCount');if(c)c.textContent=`${state.filtered.length} ${ui('个关卡','stages')}`}
  function renderStage(){const el=$('moStage');if(el)el.innerHTML=stageHtml()}
  function refresh(){filterStages();renderList()}

  function bind(){
    const host=state.root;if(!host)return;if(host._moBound)return;host._moBound=true;
    host.addEventListener('change',e=>{
      if(e.target.id==='moCat'){state.cat=e.target.value;state.sub='';state.limit=80;renderShell();refresh();renderStage()}
      else if(e.target.id==='moSub'){state.sub=e.target.value;state.limit=80;refresh()}
    });
    host.addEventListener('input',e=>{if(e.target.id==='moQ'){state.q=e.target.value;state.limit=80;refresh()}});
    host.addEventListener('click',e=>{
      const st=e.target.closest('[data-mo-stage]');if(st){state.sel=Number(st.dataset.moStage);state.mapPick=0;state.monSel=null;renderList();renderStage();return}
      if(e.target.closest('[data-mo-more]')){state.limit+=120;renderList();return}
      const tp=e.target.closest('[data-mo-tp]');if(tp){const[a,b]=tp.dataset.moTp.split(':').map(Number);state.tpick[a]=b;state.monSel=null;renderStage();return}
      const mp=e.target.closest('[data-mo-map]');if(mp){state.mapPick=Number(mp.dataset.moMap);state.monSel=null;renderStage();return}
      const mon=e.target.closest('[data-mon]');if(mon){state.monSel={mid:mon.dataset.mon,bid:mon.dataset.bat};renderStage();return}
      const bat=e.target.closest('[data-bat]');if(bat){const bid=bat.dataset.bat,first=state.battles[bid]?.[1]?.[0]?.[0];if(first){state.monSel={mid:String(first),bid};renderStage()}}
    });
  }
  function pickDefault(){
    // default: the current D-Zone season (first stage of the highest unlocked period)
    const dz=visible().filter(x=>x.c==='融灾');
    const per=state.defPeriod&&dz.some(x=>x.p===state.defPeriod)?state.defPeriod:Math.max(0,...dz.map(x=>x.p||0));
    if(!state.init){
      state.init=true;state.cat='融灾';
      const lab=dz.find(x=>x.p===per)?.s||'';state.sub=lab;
      const first=dz.filter(x=>x.p===per)[0];if(first)state.sel=first.id;
    }
  }
  async function mount(el,opts){
    css();state.root=el;if(opts?.period)state.defPeriod=Number(opts.period);
    if(!state.ready){el.innerHTML=`<p class="moNote">${ui('正在加载地图数据…','Loading map data…')}</p>`;
      try{await load()}catch(e){el.innerHTML=`<div class="moEmpty">${ui('地图数据加载失败：','Failed to load map data: ')}${esc(e.message)}</div>`;return}}
    pickDefault();renderShell();bind();refresh();renderStage();
  }
  // shrink wide hex boards to the available width (zones page and overview), re-checked whenever the DOM changes or the window is resized
  (function fitBoards(){
    let queued=false;
    const run=()=>{queued=false;for(const b of document.querySelectorAll('.dzMapBoard,.moBoard')){
      const v=b.parentElement,w=parseFloat(b.style.width)||b.offsetWidth;if(!v||!w)continue;
      const k=Math.min(1,Math.max(0.35,(v.clientWidth-22)/w));const z=k<0.999?String(k):'';if(b.style.zoom!==z)b.style.zoom=z}};
    const q=()=>{if(!queued){queued=true;requestAnimationFrame(run)}};
    new MutationObserver(q).observe(document.documentElement,{childList:true,subtree:true});
    window.addEventListener('resize',q);q();
  })();
  window.MorimensMapOverview={mount,intentByName,skType,intentIcon,intentTable};
  window.addEventListener('morimens-language-change',()=>{if(state.ready&&state.root&&state.root.isConnected){renderShell();refresh();renderStage()}});
})();

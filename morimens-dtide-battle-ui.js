(()=>{
'use strict';
if(window.__morimensDtideBattleUiV2)return;
window.__morimensDtideBattleUiV2=true;

const zh=()=>localStorage.getItem('morimens.language')!=='en';
const ui=(cn,en)=>zh()?cn:en;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean=s=>String(s??'').replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
const norm=s=>clean(s).normalize('NFKC').toLowerCase();
let lastCtx=null,scheduled=false;

function installStyle(){
  if(document.getElementById('morimensDtideBattleUiV2Style'))return;
  const s=document.createElement('style');s.id='morimensDtideBattleUiV2Style';s.textContent=`
    .dtideBattlePeakGrid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important;align-items:start}
    .dtideBattlePeakGrid>.dtideBattleBlock{min-width:0;padding:10px;border:1px solid rgba(148,163,184,.13);border-radius:13px;background:linear-gradient(145deg,rgba(18,27,41,.56),rgba(9,15,24,.48));box-shadow:inset 0 1px 0 rgba(255,255,255,.025)}
    .dtideBattlePeakGrid>.dtideBattleBlock>h5{display:flex;align-items:center;gap:7px;margin:0 0 8px!important;padding-bottom:7px;border-bottom:1px solid rgba(148,163,184,.1);font-size:12px!important;color:#efd39a!important}
    .dtideBattlePeakGrid .dtideBattleTeam{display:grid;grid-template-columns:minmax(0,1fr);gap:6px;margin:0 0 7px!important;padding:8px 9px!important;border-color:rgba(148,163,184,.14)!important;border-radius:10px!important;background:rgba(9,16,27,.64)!important;box-shadow:none!important}
    .dtideBattlePeakGrid .dtideBattleTeam:last-child{margin-bottom:0!important}
    .dtideBattlePeakGrid .dtideBattleTeam .hd{display:grid!important;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px!important;min-width:0;font-size:11px!important}
    .dtideBattlePeakGrid .dtideBattleTeam .hd b{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#edf2f7}
    .dtideBattlePeakGrid .dtideBattleTeam .hd span{font-size:12px;color:#f1d69f!important;font-variant-numeric:tabular-nums}
    .dtideBattlePeakGrid .dtideBattleTeam .gears{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px!important;margin:0!important}
    .dtideBattlePeakGrid .dtideBattleTeam .gear{display:grid;grid-template-columns:30px minmax(0,1fr);grid-template-rows:auto auto;column-gap:6px;align-items:center;min-width:0;padding:5px;border:1px solid rgba(148,163,184,.09);border-radius:8px;background:rgba(255,255,255,.025);font-size:10px!important;line-height:1.25!important}
    .dtideBattlePeakGrid .dtideBattleTeam .gear>.dtideBattleAwAvatar{grid-row:1/3;width:30px;height:30px;border-radius:7px;object-fit:cover;background:#0b1220}
    .dtideBattlePeakGrid .dtideBattleTeam .gear>b{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:10px;color:#e7edf5!important}
    .dtideBattlePeakGrid .dtideBattleTeam .gear>em{position:absolute;display:none}
    .dtideBattlePeakGrid .dtideBattleTeam .gear>small{grid-column:2;display:-webkit-box!important;min-width:0;margin-top:2px;color:#738398!important;font-size:8px!important;line-height:1.25!important;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-all}
    .dtideBattlePeakGrid .dtideBattleTeam .gear.isAssist{border-color:rgba(215,168,91,.22);background:rgba(215,168,91,.045)}
    .dtideBattlePeakGrid .dtideBattleTeam .gear.isAssist>b:after{content:'助';display:inline-grid;place-items:center;width:14px;height:14px;margin-left:3px;border-radius:4px;background:rgba(215,168,91,.16);color:#e4bf7b;font-size:7px;vertical-align:1px}
    html[lang="en"] .dtideBattlePeakGrid .dtideBattleTeam .gear.isAssist>b:after{content:'A'}
    .dtideBattlePeakGrid .dtideBattleTeam .extra{margin:0!important;padding:4px 6px;border-radius:6px;background:rgba(111,179,174,.045)}
    .dtideBattlePeakGrid .dtideBattleTeam .extra small{display:block!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#71889a!important;font-size:8px!important}
    .dtideBattlePeakGrid .dtideBattleTeam .ft{display:grid!important;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:7px!important;margin-top:0}
    .dtideBattlePeakGrid .dtideBattleTeam .ft>small{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#738398!important;font-size:8px!important}
    .dtideBattlePeakGrid .dtideBattleTeam .ft .btns{gap:4px!important}.dtideBattlePeakGrid .dtideBattleTeam .ft button,.dtideBattlePeakGrid .dtideBattleLink{padding:4px 6px!important;border-radius:6px!important;font-size:8px!important;line-height:1.15!important}
    .dtideBattlePeakGrid .dtideReplayReviewOpen{padding:4px 6px!important;border-radius:6px!important;font-size:8px!important;line-height:1.15!important}
    @media(max-width:1050px){.dtideBattlePeakGrid{grid-template-columns:1fr!important}.dtideBattlePeakGrid .dtideBattleTeam .gear>small{-webkit-line-clamp:1}}
    @media(max-width:680px){.dtideBattlePeakGrid .dtideBattleTeam .gears{grid-template-columns:repeat(2,minmax(0,1fr))}.dtideBattlePeakGrid .dtideBattleTeam .ft{grid-template-columns:1fr}.dtideBattlePeakGrid .dtideBattleTeam .ft .btns{flex-wrap:wrap}.dtideBattlePeakGrid .dtideBattleTeam .gear>small{-webkit-line-clamp:2}}
  `;document.head.appendChild(s);
}

function characterAsset(name){
  const db=window.MorimensData?.db?.records||[];
  const target=norm(name);if(!target)return '';
  for(const rec of db){
    const loc=window.MorimensData?.localizedProfile?.(rec);
    const identity=window.MorimensData?.identityDb?.bySkeydbId?.[rec.id];
    if([rec.name,rec.canonicalName,loc?.name,identity?.name].some(x=>norm(x)===target))return rec.assets?.portrait||rec.assets?.icon||'';
  }
  return '';
}

function decorateExisting(blocks){
  blocks.classList.add('dtideBattlePeakGrid');
  for(const card of blocks.querySelectorAll('.dtideBattleTeam')){
    for(const gear of card.querySelectorAll('.gears>.gear')){
      if(gear.querySelector('.dtideBattleAwAvatar'))continue;
      const name=clean(gear.querySelector('b')?.textContent),src=characterAsset(name);
      if(src){const im=document.createElement('img');im.className='dtideBattleAwAvatar';im.src=src;im.alt='';im.loading='lazy';gear.prepend(im)}
      if(gear.querySelector('em'))gear.classList.add('isAssist');
    }
  }
}

function currentPlayerFilter(){
  const get=sel=>document.querySelector(sel)?.value??'';
  const n=v=>v===''||v==null?null:Number(v);
  return {rankFrom:n(get('[data-bf="rankFrom"]')),rankTo:n(get('[data-bf="rankTo"]')),death:[n(get('[data-bf="death:0"]')),n(get('[data-bf="death:1"]'))],rounds:[n(get('[data-bf="rounds:0"]')),n(get('[data-bf="rounds:1"]'))],bout:[n(get('[data-bf="bout:0"]')),n(get('[data-bf="bout:1"]'))]};
}

function scopedPlayers(ctx){
  if(!ctx)return [];
  const f=currentPlayerFilter(),out=[];
  for(const rec of ctx.records||[]){
    if(ctx.rankMatches&&!ctx.rankMatches(rec,ctx.rankCap))continue;
    if(ctx.scoreMatches&&!ctx.scoreMatches(rec))continue;
    let death=0,rounds=0,maxBout=0,n=0;const teams=[];
    for(const w of rec.waves||[])for(const t of w.teams||[]){
      const b=t.battle;if(!b)continue;
      if(ctx.difficulty&&ctx.difficulty!=='all'&&ctx.difficultyOf?.(t,w)!==ctx.difficulty)continue;
      if(ctx.clearType&&ctx.clearType!=='all'&&ctx.clearType!==t.clearType)continue;
      n++;death+=Number(b.deathResistCount)||0;rounds+=Number(b.stageRoundCount)||0;maxBout=Math.max(maxBout,Number(b.maxBoutDamage)||0);teams.push({w,t});
    }
    if(!n)continue;
    const rank=ctx.rankOf?ctx.rankOf(rec):Number(rec.rank),avgDeath=death/n,avgRounds=rounds/n;
    if(f.rankFrom!=null&&!(rank>=f.rankFrom))continue;if(f.rankTo!=null&&!(rank<=f.rankTo))continue;
    if(f.death[0]!=null&&avgDeath<f.death[0]||f.death[1]!=null&&avgDeath>f.death[1])continue;
    if(f.rounds[0]!=null&&avgRounds<f.rounds[0]||f.rounds[1]!=null&&avgRounds>f.rounds[1])continue;
    if(f.bout[0]!=null&&maxBout<f.bout[0]*1e4||f.bout[1]!=null&&maxBout>f.bout[1]*1e4)continue;
    out.push({rec,uid:String(rec.uid??''),rank,name:rec.player||rec.name||'',score:ctx.scoreOf?ctx.scoreOf(rec):rec.score,teams});
  }
  return out;
}

function itemName(fn,x){try{return clean((fn?fn(x):x?.name)||x?.name||'')}catch{return clean(x?.name||'')}}
function formatBig(v){v=Number(v)||0;if(zh())return v>=1e8?`${(v/1e8).toFixed(2)}亿`:v>=1e4?`${(v/1e4).toFixed(1)}万`:v.toLocaleString('zh-CN');return v>=1e6?`${(v/1e6).toFixed(2)}M`:v>=1e3?`${(v/1e3).toFixed(1)}K`:v.toLocaleString('en-US')}
function memberCard(ctx,m){
  const info=ctx.characterInfo?ctx.characterInfo(m):null,name=clean(info?.name||m.canonicalName||m.name||'—'),image=info?.image||characterAsset(name);
  const wheels=(m.wheels||[]).map(x=>itemName(ctx.wheelName,x)).filter(Boolean).join(' / '),cov=(m.covenants||[]).map(x=>itemName(ctx.covenantName,x)).filter(Boolean).join(' / '),build=[wheels,cov].filter(Boolean).join(' · ')||'—';
  return `<div class="gear${m.borrowed?' isAssist':''}">${image?`<img class="dtideBattleAwAvatar" src="${esc(image)}" alt="" loading="lazy">`:''}<b title="${esc(name)}">${esc(name)}</b><small title="${esc(build)}">${esc(build)}</small></div>`;
}
function teamCard(ctx,e,i,fmt){
  const code=String(e.t.battleUuid||''),extra=[e.t.token?itemName(ctx.tokenName,e.t.token):'',...(e.t.creations||[]).map(x=>itemName(ctx.creationName,x))].filter(Boolean),player=clean(e.p.name),url=e.p.rec.url||'';
  return `<div class="dtideBattleTeam"><div class="hd"><b title="#${esc(e.p.rank??'—')} ${esc(player)}">${i+1}. #${esc(e.p.rank??'—')} ${esc(player)}</b><span>${esc(fmt(e.v))}</span></div><div class="gears">${(e.t.members||[]).map(m=>memberCard(ctx,m)).join('')}</div>${extra.length?`<div class="extra"><small title="${esc(extra.join(' · '))}">${ui('守密人 / 造物：','Keeper / creations: ')}${esc(extra.join(' · '))}</small></div>`:''}<div class="ft"><small>Wave ${esc(e.w.wave)} · ${esc(e.t.stageName||'')} · ${esc(e.p.score??'—')}${ui('分',' pts')}${e.t.clearType==='extra'?' · Extra':''}</small><span class="btns">${code?`<button type="button" class="dtideReplayCopy" data-replay-code="${esc(code)}">${ui('复制回放','Copy')}</button>`:''}${url?`<a class="dtideBattleLink" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Eremora ↗</a>`:''}</span></div></div>`;
}
function extraPeakBlock(ctx,players,key,label,get,fmt){
  const all=[];for(const p of players)for(const {w,t} of p.teams){const v=Number(get(t.battle,t))||0;if(v>0)all.push({p,w,t,v})}
  all.sort((a,b)=>b.v-a.v||(a.p.rank??1e9)-(b.p.rank??1e9));const seen=new Set(),top=[];for(const e of all){if(seen.has(e.p.uid))continue;seen.add(e.p.uid);top.push(e);if(top.length===5)break}
  return `<div class="dtideBattleBlock" data-extra-peak="${key}"><h5>${ui(label.zh,label.en)} · Top 5</h5>${top.map((e,i)=>teamCard(ctx,e,i,fmt)).join('')||`<div class="dtideEmpty">${ui('暂无','None')}</div>`}</div>`;
}

function enhance(){
  scheduled=false;installStyle();
  const h4=[...document.querySelectorAll('.dtideBattle h4, #dtideBattle h4, h4')].find(x=>/极值队伍\s*Top\s*5|Peak-stat teams/i.test(clean(x.textContent)));
  const blocks=h4?.nextElementSibling;if(!blocks?.classList.contains('dtideBattleBlocks'))return;
  decorateExisting(blocks);
  if(!lastCtx)return;
  const players=scopedPlayers(lastCtx);
  const wanted=[
    ['maxRounds',{zh:'最多回合数',en:'Most Rounds'},b=>b?.stageRoundCount,v=>`${Math.round(v)} ${ui('回合','rounds')}`],
    ['maxHp',{zh:'最高血量',en:'Highest HP'},b=>b?.maxHp,v=>formatBig(v)]
  ];
  for(const [key,label,get,fmt] of wanted){
    const old=blocks.querySelector(`[data-extra-peak="${key}"]`),html=extraPeakBlock(lastCtx,players,key,label,get,fmt);
    const wrap=document.createElement('div');wrap.innerHTML=html;const next=wrap.firstElementChild;
    if(old)old.replaceWith(next);else blocks.appendChild(next);
  }
  decorateExisting(blocks);
}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(enhance)}

function wrapApi(){
  const api=window.MorimensDtideBattle;if(!api?.render||api.render.__battleUiWrapped)return false;
  const original=api.render.bind(api);const wrapped=(el,ctx)=>{lastCtx=ctx;const out=original(el,ctx);schedule();return out};wrapped.__battleUiWrapped=true;api.render=wrapped;return true;
}
function start(){
  installStyle();wrapApi();
  new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true});
  document.addEventListener('input',e=>{if(e.target.closest?.('[data-bf]'))setTimeout(schedule,380)},true);
  document.addEventListener('change',e=>{if(e.target.closest?.('[data-bmetric]'))schedule()},true);
  document.addEventListener('click',e=>{if(e.target.closest?.('[data-bview],[data-breset],[data-bsort],[data-dtide-battle-tab]'))setTimeout(schedule,0)},true);
  window.addEventListener('morimens-language-change',()=>setTimeout(schedule,0));schedule();
}
start();
})();

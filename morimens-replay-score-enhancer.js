// Replay Review: continuous equipment scoring, role-adaptive awakener scoring,
// decision-quality keeper scoring, and MVP image export.
(()=>{
'use strict';
if(window.__morimensReplayScoreEnhancerV32)return;
window.__morimensReplayScoreEnhancerV32=true;

const en=()=>localStorage.getItem('morimens.language')==='en';
const ui=(zh,enText)=>en()?enText:zh;
const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number(v)||0));
const sat=(v,s)=>100*(1-Math.exp(-Math.max(0,Number(v)||0)/Math.max(.0001,s)));
const clean=v=>String(v??'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const grade=s=>s>=80?'S':s>=65?'A':s>=50?'B':s>=35?'C':'D';
const num=v=>Number(v)||0;
let busy=false,last='';

function css(){
  if(document.getElementById('mrReplayScoreEnhancerStyle'))return;
  const s=document.createElement('style');
  s.id='mrReplayScoreEnhancerStyle';
  s.textContent=`
    .mr2mvpactions{margin-left:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .mr2mvpactions button{border:1px solid rgba(213,177,118,.38);border-radius:8px;background:rgba(213,177,118,.12);color:#f0d5a5;padding:6px 10px;cursor:pointer;font:700 11px/1.2 inherit}
    .mr2mvpactions small{color:#7f8da1;font-size:9px}.mr2mvptitle{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .mr2enhscore{margin-top:8px;padding:8px 10px;border:1px solid rgba(213,177,118,.22);border-radius:8px;background:rgba(213,177,118,.055);font-size:10px;line-height:1.65;color:#aeb9c8}
    .mr2enhscore b{color:#ead5ab}.mr2enhchips{display:flex;flex-wrap:wrap;gap:5px;margin-top:5px}.mr2enhchips i{font-style:normal;padding:1px 6px;border-radius:999px;background:rgba(79,208,200,.08);border:1px solid rgba(79,208,200,.18);color:#9edbd6}
    .mr2enhchips i.strong{background:rgba(213,177,118,.1);border-color:rgba(213,177,118,.28);color:#f0d29f}.mr2enhbadge{display:inline-flex;margin-left:5px;padding:0 5px;border-radius:999px;border:1px solid rgba(79,208,200,.25);color:#86d5cf;font-size:8px}
    .mr2enhmeta{margin-top:4px;color:#7f8da1}.mr2enhmeta strong{color:#b9c6d8}
    @media(max-width:720px){.mr2mvpactions{width:100%;margin-left:0}.mr2mvpactions small{flex:1 1 100%}}
  `;
  document.head.appendChild(s);
}

function setGrade(el,g){
  if(!el)return;
  el.className=el.className.replace(/\bg[ABCDE]\b/g,'').trim()+` g${g}`;
  el.textContent=g;
}
function setDim(span,value){
  if(!span)return;
  const b=span.querySelector('b');
  if(value==null){span.classList.add('na');if(b)b.textContent='—';return}
  span.classList.remove('na');if(b)b.textContent=Math.round(value);
}
function addBadge(row,text){
  const name=row?.querySelector('.mr2rn b');if(!name)return;
  let badge=row.querySelector('.mr2enhbadge');
  if(!badge){badge=document.createElement('span');badge.className='mr2enhbadge';name.after(badge)}
  badge.textContent=text;
}
function wmean(entries){
  let s=0,w=0;
  for(const [v,wt] of entries){if(v==null||!Number.isFinite(v)||wt<=0)continue;s+=v*wt;w+=wt}
  return w?s/w:null;
}
function rel(v,total,n){
  if(!(total>0))return null;
  if(!(v>0))return 0;
  const fair=total/Math.max(1,n);
  return clamp(100*v/(v+fair*.65));
}
function share(v,total){return total>0?Math.max(0,v/total):null}
function weightedShare(entries){return wmean(entries.filter(([v])=>v!=null))}
function typeList(v){return Array.isArray(v)?v:(v==null?[]:[v])}

// ---------- Wheel / Covenant semantic value -----------------------------------------------
function textOf(x,tl){
  const g=x?.g||{},parts=[g.name,g.en,g.desc,...(g.effectsEn||[])];
  for(const q of g.statics||[])parts.push(`${q.prop||''} ${q.val??''}`);
  if(g.related&&tl?.res?.state)for(const id of g.related){const r=tl.res.state[String(id)]||{};parts.push(r.CnID,r.Name,r.Desc,r.BattleDesc,JSON.stringify(r.ExistProperty||{}))}
  return clean(parts.filter(Boolean).join(' | ')).replace(/％/g,'%').replace(/[＋]/g,'+').replace(/[－–—]/g,'-');
}
function near(t,re,d=1){const m=t.match(re),n=m?Number(m.slice(1).find(Boolean)):d;return Number.isFinite(n)&&n>0?n:d}
function semantic(x,tl){
  const t=textOf(x,tl),g=x.g||{},f=[];
  const conditional=/(?:每当|当.+时|若|如果|触发后|本回合|首次|每回合|when |if |after |once per)/i.test(t);
  const passive=/(?:战斗开始|永久|常驻|开局|上限|max(?:imum)? |at battle start|permanent)/i.test(t)||(g.statics?.length||0)>0;
  const observed=(+g.n||0)>0,confidence=observed?1:(passive?.95:(conditional?.72:.82));
  const add=(k,z,e,v,strong=false,n='')=>{if(!f.some(q=>q.k===k))f.push({k,label:ui(z,e),v:clamp(v*confidence),strong,n})};
  if(/手牌(?:数量|张数)?上限|手牌容量|max(?:imum)?\s*hand|hand\s*(?:size|limit|capacity)|max_hand|hand_limit/i.test(t)){
    const n=near(t,/(?:手牌(?:数量|张数)?上限|手牌容量|max(?:imum)?\s*hand|hand\s*(?:size|limit|capacity)|max_hand|hand_limit)[^。;|]{0,28}?(?:\+|增加|提高|提升|by\s*)\s*(\d+(?:\.\d+)?)/i);
    add('hand',`手牌上限 +${n}`,`Hand limit +${n}`,Math.min(95,76+(n-1)*9),true,n);
  }
  if(/回合结束[^。;]{0,24}(?:不弃|保留)|保留手牌|retain[^.;]{0,18}hand|keep[^.;]{0,18}hand/i.test(t))add('retain','回合末保留手牌','Hand retention',78,true);
  if(/初始手牌[^。;|]{0,16}(?:增加|提高|\+)|starting hand[^.;|]{0,18}(?:increase|bonus|\+)/i.test(t))add('opening','初始手牌增加','Larger starting hand',66,true);
  if(/算力(?:数量)?上限|max(?:imum)?\s*energy|max_energy/i.test(t)){
    const n=near(t,/(?:算力(?:数量)?上限|max(?:imum)?\s*energy|max_energy)[^。;|]{0,24}?(?:\+|增加|提高|by\s*)\s*(\d+(?:\.\d+)?)/i);
    add('ecap',`算力上限 +${n}`,`Energy cap +${n}`,Math.min(90,68+(n-1)*8),true,n);
  }
  if(/(?:抽取?|额外抽)\s*\d*\s*张?牌|抽牌|draw\s+(?:an?\s+|\d+\s*)?cards?/i.test(t))add('draw','抽牌 / 手牌补充','Card draw',62,true);
  if(/算力消耗[^。;]{0,20}(?:降低|减少|-)|减费|cost[^.;]{0,22}(?:reduce|reduction|less|-)/i.test(t))add('cut','卡牌减费','Cost reduction',68,true);
  if(/(?:获得|回复|恢复|返还)[^。;]{0,12}算力|(?:gain|restore|refund)[^.;]{0,18}energy/i.test(t))add('energy','算力回复 / 生成','Energy generation',58);
  if(/复制[^。;]{0,16}(?:卡|牌|手牌)|copy[^.;]{0,16}cards?/i.test(t))add('copy','复制卡牌','Card copy',64,true);
  if(/(?:生成|创造)[^。;|]{0,14}(?:指令卡|卡牌|手牌)|(?:create|generate)[^.;|]{0,14}cards?/i.test(t))add('make','生成卡牌','Card generation',56);
  if(/取回|返回手牌|回到手牌|置于牌库顶|洗牌|从弃牌|从消耗|retrieve|return[^.;]{0,20}hand|shuffle|discard pile|exhaust pile/i.test(t))add('cycle','回收 / 过牌循环','Card cycling',54);
  if(/银钥|钥令能量|keeper\s*energy|keyflare\s*energy/i.test(t))add('key','银钥 / 钥令能量','Keyflare energy',52);
  if(/狂气|充狂|aliemus|ultimate\s*energy/i.test(t))add('ali','狂气获取','Aliemus gain',48);
  if(/易伤|vulnerab/i.test(t))add('vuln','易伤 / 承伤放大','Vulnerability',62,true);
  if(/界域精通|realm\s*mastery/i.test(t))add('realm','界域精通','Realm mastery',50);
  if(/死亡抵抗|death\s*resist/i.test(t))add('dr','死亡抵抗','Death resistance',62,true);
  if(/(?:受到|承受)[^。;]{0,16}伤害[^。;]{0,16}(?:降低|减少)|减伤|damage\s*taken[^.;]{0,20}(?:reduce|less)/i.test(t))add('mit','减伤','Damage mitigation',60,true);
  if(/护盾|治疗|回复生命|shield|heal/i.test(t))add('sustain','护盾 / 治疗','Shield / healing',48);
  if(/眩晕|冻结|冰冻|石化|沉默|定身|恐惧|魅惑|麻痹|禁锢|stun|freeze|petrif|silence|fear/i.test(t))add('ctl','控制效果','Control',56);
  if(/额外行动|再次行动|立即行动|extra\s*(?:turn|action)|act again/i.test(t))add('action','额外行动','Extra action',86,true);
  const team=/(?:全体|所有友方|所有唤醒体|队友|我方全体|all allies|team)/i.test(t);
  const buff=/(?:力量|攻击力|基础伤害|伤害强效|最终伤害|暴击(?:率|伤害)?)[^。;|]{0,22}(?:增加|提高|提升|\+|获得)|(?:增加|提高|提升)[^。;|]{0,22}(?:力量|攻击力|基础伤害|伤害强效|最终伤害|暴击(?:率|伤害)?)|(?:increase|gain|bonus|boost)[^.;|]{0,24}(?:damage|crit|attack|power)|(?:damage|crit|attack|power)[^.;|]{0,24}(?:increase|bonus|boost)/i.test(t);
  if(buff)add(team?'teamBuff':'buff',team?'团队伤害增益':'伤害增益',team?'Team damage buff':'Damage buff',team?64:52,team);
  const S=x.sup||{};
  if(S.draw>0&&!f.some(q=>q.k==='draw'))add('draw','实战抽牌','Observed draw',68,true);
  if(S.cut>0&&!f.some(q=>q.k==='cut'))add('cut','实战减费','Observed cost cut',72,true);
  if(S.eng>0&&!f.some(q=>q.k==='energy'))add('energy','实战算力收益','Observed energy',62);
  if(S.cyc>0&&!f.some(q=>q.k==='cycle'))add('cycle','实战过牌','Observed cycling',58);
  const a=f.map(q=>q.v).sort((x,y)=>y-x);let support=a[0]||0;if(a[1])support+=a[1]*.2;if(a[2])support+=a[2]*.08;
  const hand=f.find(q=>q.k==='hand'),floor=hand?Math.min(92,72+(Number(hand.n||1)-1)*9):0;
  return {f,support:clamp(support),floor};
}
function supportRaw(x,total){
  const S=x.sup||{},a=[],p=v=>{if(v>0)a.push(clamp(v))};
  p(sat(S.key,1.6)*.72);p(sat(S.ali,70)*.68);p(sat(S.eng,2.6)*.78);p(sat(S.cut,2.2)*.82);p(sat(S.draw,2.2)*.82);p(sat(S.cyc,3)*.68);p(sat(S.realm,20)*.62);p(sat(S.emb,2)*.58);p(sat(S.seal,3)*.5);
  if(S.buf>0)p(sat(S.buf,Math.max(1,total*.035))*.85);
  if(S.vuln>0)p((S.vuln>20?sat(S.vuln,Math.max(1,total*.04)):sat(S.vuln,1.8))*.8);
  a.sort((x,y)=>y-x);return clamp((a[0]||0)+(a[1]||0)*.22+(a[2]||0)*.1);
}
function evaluateGear(x,tl,total){
  const sm=semantic(x,tl),out=sat(x.outT||x.val||0,Math.max(1,total*.075));
  const def=Math.max(sat(x.sh||0,Math.max(1,total*.06)),sat(x.mit||0,Math.max(1,total*.04)),sat(x.ctl||0,6)*.82,sat(x.dr||0,1.2)*.75);
  const sup=Math.max(supportRaw(x,total),sm.support),r=[out,def,sup].sort((a,b)=>b-a);
  let abs=r[0]*.78+(r[1]||0)*.17+(r[2]||0)*.05;
  if(abs<18&&((+x.g?.n||0)>0||(x.g?.statics?.length||0)>0||sm.f.length))abs=Math.min(35,10+Math.log2(1+(+x.g?.n||0))*6+sm.f.length*4+((x.g?.statics?.length||0)>0?5:0));
  return {...x,_sm:sm,_abs:clamp(abs),enhancedCats:{out,def,sup}};
}
function scoreGear(items,tl,total){
  const rows=items.map(x=>evaluateGear(x,tl,total)),mx=Math.max(1,...rows.map(x=>x._abs)),ord=[...rows].sort((a,b)=>b._abs-a._abs);
  for(const x of rows){
    const rank=ord.indexOf(x),pct=rows.length<=1?.72:1-rank/(rows.length-1),relScore=100*(.68*Math.sqrt(x._abs/mx)+.32*pct);
    let v=.72*x._abs+.10*clamp(x.score)+.18*relScore;
    if(x._sm.floor)v=Math.max(v,x._sm.floor);if(x._sm.f.some(q=>q.k==='action'))v=Math.max(v,76);if(v<12&&((+x.g?.n||0)>0||(x.g?.statics?.length||0)>0))v=12;
    x.enhancedScore=clamp(v);x.enhancedGrade=grade(x.enhancedScore);
  }
  return rows.sort((a,b)=>b.enhancedScore-a.enhancedScore||(b.val||0)-(a.val||0));
}

// ---------- Awakener rating ---------------------------------------------------------------
const DEF_W={sh:45,mit:25,ctl:20,dr:10};
const SUP_W={key:1,ali:1.1,seal:.45,eng:1.65,vuln:1.6,buf:1.5,cut:1.55,draw:1.75,cyc:1.05,realm:.65,emb:.7};
function awakenerUtilityLabels(x){
  const S=x.sup||{},a=[];
  const push=(v,z,e,strong=false)=>{if(v>0)a.push({v,label:ui(z,e),strong})};
  push(S.draw,'抽牌','Draw',true);push(S.cut,'减费','Cost cut',true);push(S.eng,'算力','Energy',true);push(S.vuln,'易伤','Vulnerability',true);push(S.buf,'伤害增益','Damage buff',true);push(S.cyc,'过牌','Cycling');push(S.key,'钥令能量','Keyflare');push(S.ali,'充狂','Aliemus');push(S.realm,'界域精通','Realm mastery');push(S.emb,'胚胎','Embryo');
  push(x.mit,'减伤','Mitigation',true);push(x.ctl,'控制/弱化','Control',true);push(x.saves,'救场','Death save',true);push(x.sh,'护盾/治疗','Shield/Heal',true);
  return a.sort((p,q)=>q.v-p.v).slice(0,6);
}
function scoreAwakeners(m){
  const refs=m?.awakeners||[],src=refs.map(ref=>({ref,x:ref.x||ref}));if(!src.length)return [];
  const N=src.length,T={out:0,sh:0,mit:0,ctl:0,dr:0,plays:0,energy:0},TS={};
  for(const {x} of src){T.out+=num(x.outT);T.sh+=num(x.sh);T.mit+=num(x.mit);T.ctl+=num(x.ctl);T.dr+=num(x.dr);T.plays+=num(x.plays);T.energy+=num(x.energy);for(const k of Object.keys(SUP_W))TS[k]=(TS[k]||0)+num(x.sup?.[k])}
  const roleName=k=>k==='out'?ui('输出核心','Damage'):k==='def'?ui('防御核心','Defense'):ui('辅助核心','Support');
  return src.map(({ref,x})=>{
    const out=rel(num(x.outT),T.out,N);
    const def=wmean([
      [rel(num(x.sh),T.sh,N),DEF_W.sh],[rel(num(x.mit),T.mit,N),DEF_W.mit],[rel(num(x.ctl),T.ctl,N),DEF_W.ctl],[rel(num(x.dr),T.dr,N),DEF_W.dr]
    ]);
    const sup=wmean(Object.entries(SUP_W).map(([k,w])=>[rel(num(x.sup?.[k]),TS[k]||0,N),w]));
    const cats={out,def,sup},available=Object.entries(cats).filter(([,v])=>v!=null).sort((a,b)=>b[1]-a[1]);
    const top=available[0]?.[1]||0,second=available[1]?.[1]||0,third=available[2]?.[1]||0;
    let base=top*.72+second*.20+third*.08;
    const specialist=Math.min(8,Math.max(0,(top-second)*.12)),breadth=(second>=55?3.5:0)+(third>=45?2:0),rescue=Math.min(6,num(x.saves)*4);
    const outShare=share(num(x.outT),T.out);
    const defShare=weightedShare([[share(num(x.sh),T.sh),DEF_W.sh],[share(num(x.mit),T.mit),DEF_W.mit],[share(num(x.ctl),T.ctl),DEF_W.ctl],[share(num(x.dr),T.dr),DEF_W.dr]]);
    const supShare=weightedShare(Object.entries(SUP_W).map(([k,w])=>[share(num(x.sup?.[k]),TS[k]||0),w]));
    const roleShares={out:outShare,def:defShare,sup:supShare};
    const impact=weightedShare(available.map(([k,v])=>[roleShares[k],Math.max(1,v)]));
    const burden=wmean([[share(num(x.plays),T.plays),1],[share(num(x.energy),T.energy),1]]);
    let eff=60,ratio=null,mod=1;
    if(impact!=null&&burden!=null&&burden>0){ratio=impact/burden;eff=clamp(50+20*Math.log2(Math.max(.25,ratio)),20,92);mod=.94+.12*(eff/100)}
    let score=(base+specialist+breadth+rescue)*mod;
    score=.95*score+.05*clamp(ref.score);
    if(top>=85)score=Math.max(score,68);else if(top>=75)score=Math.max(score,58);
    score=clamp(score);
    return {ref,x,score,grade:grade(score),cats,role:available[0]?.[0]||'out',roleLabel:roleName(available[0]?.[0]||'out'),eff,ratio,features:awakenerUtilityLabels(x)};
  }).sort((a,b)=>b.score-a.score);
}

// ---------- Keeper decision model ----------------------------------------------------------
function cardPlayModel(tl){
  const actors=tl.actors||new Map(),cards=tl.ent?.cards||new Map(),res=tl.res||{},all=(tl.playLog||[]).filter(p=>p.kind==='card'&&actors.get(String(p.owner))?.kind==='awakener');
  if(!all.length)return {score:null,confidence:0,rounds:[]};
  const dVal=p=>num(p.dmg),fVal=p=>num(p.block)+1.2*num(p.heal),uVal=p=>num(p.eng)+1.8*num(p.draw)+.035*num(p.ali);
  const avgPos=(fn)=>{const a=all.map(fn).filter(v=>v>0);return a.length?a.reduce((n,v)=>n+v,0)/a.length:1};
  const DS=avgPos(dVal),FS=avgPos(fVal),US=avgPos(uVal);
  const value=p=>{const q=[dVal(p)/DS,fVal(p)/FS,uVal(p)/US].sort((a,b)=>b-a);return q[0]*.68+q[1]*.22+q[2]*.10};
  const byTid=new Map(),byType=new Map();
  const add=(map,k,v)=>{const o=map.get(k)||{n:0,v:0};o.n++;o.v+=v;map.set(k,o)};
  const typeOf=tid=>String(typeList(res.skill?.[String(tid)]?.Type)[0]||'');
  for(const p of all){const v=value(p);add(byTid,String(p.tid),v);add(byType,typeOf(p.tid),v)}
  const global=all.reduce((n,p)=>n+value(p),0)/all.length||1;
  const estimate=tid=>{const a=byTid.get(String(tid));if(a?.n)return {v:a.v/a.n,c:1};const b=byType.get(typeOf(tid));if(b?.n)return {v:b.v/b.n,c:.65};return {v:global,c:.35}};
  const costOf=(tid,c)=>{const v=c!=null?Number(c):Number(res.skill?.[String(tid)]?.Cost);return Number.isFinite(v)&&v>0?Math.round(v):0};
  const grouped=new Map();for(const p of all){const r=grouped.get(p.round)||{played:[],spent:0};r.played.push(p);r.spent+=costOf(p.tid,p.cost);grouped.set(p.round,r)}
  const knap=(items,B)=>{const dp=new Array(B+1).fill(0);for(const it of items){if(it.c>B)continue;for(let b=B;b>=it.c;b--)dp[b]=Math.max(dp[b],dp[b-it.c]+it.v)}return dp[B]};
  const rounds=[];let sw=0,ss=0,sc=0;
  for(const [round,r] of [...grouped.entries()].sort((a,b)=>a[0]-b[0])){
    const end=tl.roundEnd?.get(round);if(!end)continue;const B=Math.min(40,r.spent+Math.max(0,Math.round(end.energy||0)));
    const played=r.played.map(p=>({tid:p.tid,c:costOf(p.tid,p.cost),v:value(p),conf:1,played:true,uid:String(p.cardUid||'')}));
    const used=new Set(played.map(x=>x.uid).filter(Boolean));
    const remain=(end.hand||[]).filter(h=>{const owner=cards.get(String(h.uid))?.ownerUid;return actors.get(String(owner))?.kind==='awakener'&&!used.has(String(h.uid))}).map(h=>{const e=estimate(h.tid);return {tid:h.tid,c:costOf(h.tid,h.cost),v:e.v,conf:e.c,played:false,uid:String(h.uid)}});
    const items=[...played,...remain],actual=played.reduce((n,x)=>n+x.v,0),best=Math.max(actual,knap(items,B)),raw=best>0?Math.min(1,actual/best):1;
    const conf=items.length?items.reduce((n,x)=>n+x.conf,0)/items.length:1,adj=raw*conf+.72*(1-conf),w=Math.max(1,played.length);
    ss+=adj*100*w;sw+=w;sc+=conf*w;rounds.push({round,actual,best,ratio:raw,confidence:conf,budget:B,hand:items.length,played:played.length});
  }
  return {score:sw?ss/sw:null,confidence:sw?sc/sw:0,rounds};
}
function keyChoiceModel(k){
  const map=new Map((k?.kv||[]).map(v=>[String(v.tid),v])),picks=k?.picks||[];let s=0,w=0,cSum=0;
  const rows=[];
  for(const p of picks){if(!Array.isArray(p.options)||p.options.length<2||p.chosen==null)continue;const cv=map.get(String(p.chosen))?.val;if(!(cv>=0))continue;const known=p.options.map(t=>({tid:t,v:map.get(String(t))?.val})).filter(x=>x.v!=null),best=Math.max(0,...known.map(x=>x.v));if(!(best>0))continue;
    const raw=Math.min(1,cv/best),coverage=known.length/p.options.length,conf=clamp(coverage*(known.length>=2?1:.45),0,1),adj=raw*conf+.74*(1-conf),wt=.5+conf;
    s+=adj*100*wt;w+=wt;cSum+=conf*wt;rows.push({round:p.round,raw,confidence:conf,known:known.length,total:p.options.length});
  }
  return {score:w?s/w:null,confidence:w?cSum/w:0,rows};
}
function resourceModel(k){
  const e=k?.eff||{},vals=[];
  if(e.e1!=null)vals.push([clamp(e.e1*100),.45]);
  if(e.e3!=null)vals.push([clamp(e.e3*100),.35]);
  if(e.e2!=null)vals.push([clamp((.65+.35*e.e2)*100),.20]);
  return {score:wmean(vals),energy:e.e1,overflow:e.e3,hand:e.e2};
}
function scoreKeeper(m,tl){
  const k=m?.keeper;if(!k)return null;
  const play=cardPlayModel(tl),choice=keyChoiceModel(k),resource=resourceModel(k);
  const playScore=play.score==null?null:play.score*play.confidence+68*(1-play.confidence);
  const choiceScore=choice.score;
  const choiceWeight=choiceScore==null?0:.20*(.55+.45*choice.confidence);
  const parts=[];if(playScore!=null)parts.push([playScore,.45]);if(resource.score!=null)parts.push([resource.score,.35]);if(choiceScore!=null)parts.push([choiceScore,choiceWeight]);
  let score=wmean(parts);if(score==null)score=k.score==null?null:clamp(k.score);if(score!=null)score=.94*score+.06*clamp(k.score==null?score:k.score);
  return {score:score==null?null:clamp(score),grade:score==null?'—':grade(score),playScore,resourceScore:resource.score,choiceScore,playConfidence:play.confidence,choiceConfidence:choice.confidence,play,choice,resource,original:k};
}

// ---------- DOM patching ------------------------------------------------------------------
function ratingSection(root,kind){
  const tests={wheel:/^(命轮|wheels?)$/i,covenant:/^(密契|covenants?)$/i,aw:/^(唤醒体综合评分|awakener ratings)/i};
  return [...root.querySelectorAll('.mr2rating')].find(s=>tests[kind].test(clean(s.querySelector(':scope>h5')?.textContent||'')));
}
function patchGearRows(root,kind,items){
  const s=ratingSection(root,kind);if(!s)return;const map=new Map(items.map(x=>[clean(x.g?.name),x])),rows=[...s.querySelectorAll(':scope>details.mr2rrowd')];
  for(const row of rows){const x=map.get(clean(row.querySelector('.mr2rn b')?.textContent));if(!x)continue;row.dataset.enhancedScore=x.enhancedScore;const b=row.querySelector('.mr2rscore b'),bar=row.querySelector('.mr2rscore i');if(b)b.textContent=x.enhancedScore.toFixed(1);if(bar)bar.style.width=x.enhancedScore.toFixed(1)+'%';setGrade(row.querySelector('.mr2grade'),x.enhancedGrade);const d=row.querySelectorAll('.mr2rdims>span');setDim(d[0],x.enhancedCats.out);setDim(d[1],x.enhancedCats.def);setDim(d[2],x.enhancedCats.sup);addBadge(row,ui('增强','enhanced'));
    const det=row.querySelector('.mr2rdetail');if(det){det.querySelector('.mr2enhscore')?.remove();const box=document.createElement('div');box.className='mr2enhscore';const title=document.createElement('b');title.textContent=`${ui('增强装备评分','Enhanced gear rating')} ${x.enhancedScore.toFixed(1)}`;box.append(title,document.createTextNode(` · ${ui('输出','Output')} ${Math.round(x.enhancedCats.out)} / ${ui('防御','Defense')} ${Math.round(x.enhancedCats.def)} / ${ui('辅助','Support')} ${Math.round(x.enhancedCats.sup)}`));if(x._sm.f.length){const cs=document.createElement('div');cs.className='mr2enhchips';for(const q of x._sm.f.slice(0,8)){const i=document.createElement('i');i.textContent=q.label;if(q.strong)i.classList.add('strong');cs.append(i)}box.append(cs)}const note=document.createElement('div');note.className='mr2enhmeta';note.textContent=ui('静态/条件效果按效果文本与触发证据保守折算；手牌上限、算力上限、额外行动等行动经济效果使用较高权重。','Static/conditional effects are conservatively estimated; action economy receives higher weight.');box.append(note);det.prepend(box)}
  }
  rows.sort((a,b)=>(+b.dataset.enhancedScore||-1)-(+a.dataset.enhancedScore||-1)).forEach(r=>s.append(r));
}
function patchAwRows(root,items){
  const s=ratingSection(root,'aw');if(!s)return;const map=new Map(items.map(x=>[clean(x.x?.r?.a?.name),x])),rows=[...s.querySelectorAll(':scope>details.mr2rrowd')],keeper=rows.find(r=>/守密人|Keeper/i.test(clean(r.querySelector('.mr2rn b')?.textContent)));
  const awRows=[];
  for(const row of rows){const x=map.get(clean(row.querySelector('.mr2rn b')?.textContent));if(!x)continue;awRows.push(row);row.dataset.enhancedScore=x.score;const b=row.querySelector('.mr2rscore b'),bar=row.querySelector('.mr2rscore i');if(b)b.textContent=x.score.toFixed(1);if(bar)bar.style.width=x.score.toFixed(1)+'%';setGrade(row.querySelector('.mr2grade'),x.grade);const d=row.querySelectorAll('.mr2rdims>span');setDim(d[0],x.cats.out);setDim(d[1],x.cats.def);setDim(d[2],x.cats.sup);addBadge(row,ui('定位自适应','role-adaptive'));
    const det=row.querySelector('.mr2rdetail');if(det){det.querySelector('.mr2enhscore')?.remove();const box=document.createElement('div');box.className='mr2enhscore';const title=document.createElement('b');title.textContent=`${ui('定位自适应评分','Role-adaptive rating')} ${x.score.toFixed(1)} · ${x.roleLabel}`;box.append(title);const meta=document.createElement('div');meta.className='mr2enhmeta';meta.textContent=ui(`主定位优先，不再强迫输出/防御/辅助三类等权；贡献效率 ${Math.round(x.eff)}${x.ratio!=null?`，贡献/牌权 ${x.ratio.toFixed(2)}`:''}。`,`Primary role is weighted most heavily; contribution efficiency ${Math.round(x.eff)}${x.ratio!=null?`, impact/workload ${x.ratio.toFixed(2)}`:''}.`);box.append(meta);if(x.features.length){const cs=document.createElement('div');cs.className='mr2enhchips';for(const q of x.features){const i=document.createElement('i');i.textContent=q.label;if(q.strong)i.classList.add('strong');cs.append(i)}box.append(cs)}det.prepend(box)}
  }
  awRows.sort((a,b)=>(+b.dataset.enhancedScore||-1)-(+a.dataset.enhancedScore||-1));if(keeper)for(const row of awRows)s.insertBefore(row,keeper);else for(const row of awRows)s.append(row);
  awRows.forEach((r,i)=>r.classList.toggle('top',i===0));
}
function patchKeeperRow(root,k){
  if(!k||k.score==null)return;const s=ratingSection(root,'aw');if(!s)return;const row=[...s.querySelectorAll(':scope>details.mr2rrowd')].find(r=>/守密人|Keeper/i.test(clean(r.querySelector('.mr2rn b')?.textContent)));if(!row)return;
  const b=row.querySelector('.mr2rscore b'),bar=row.querySelector('.mr2rscore i');if(b)b.textContent=k.score.toFixed(1);if(bar)bar.style.width=k.score.toFixed(1)+'%';setGrade(row.querySelector('.mr2grade'),k.grade);addBadge(row,ui('决策模型','decision model'));
  const dims=row.querySelectorAll('.mr2rdims>span'),labs=[ui('钥令选择','Keyflare'),ui('资源管理','Resources'),ui('出牌决策','Plays')],vals=[k.choiceScore,k.resourceScore,k.playScore];for(let i=0;i<3;i++){const sm=dims[i]?.querySelector('small');if(sm)sm.textContent=labs[i];setDim(dims[i],vals[i])}
  const det=row.querySelector('.mr2rdetail');if(det){det.querySelector('.mr2enhscore')?.remove();const box=document.createElement('div');box.className='mr2enhscore';const title=document.createElement('b');title.textContent=`${ui('守密人决策评分','Keeper decision rating')} ${k.score.toFixed(1)}`;box.append(title);const chips=document.createElement('div');chips.className='mr2enhchips';[[k.choiceScore,ui('钥令','Keyflare')],[k.resourceScore,ui('资源','Resources')],[k.playScore,ui('出牌','Plays')]].forEach(([v,l])=>{if(v==null)return;const i=document.createElement('i');i.textContent=`${l} ${Math.round(v)}`;chips.append(i)});box.append(chips);const note=document.createElement('div');note.className='mr2enhmeta';note.textContent=ui(`出牌最优现在同时估算输出、防御与辅助价值；未知手牌按技能类型/全局均值回退并按置信度收缩。出牌置信度 ${Math.round(k.playConfidence*100)}%，钥令比较置信度 ${Math.round(k.choiceConfidence*100)}%。弃牌只作轻度惩罚，避免把主动弃牌机制误判为低水平。`,`Play optimality now values damage, defense and support; unknown cards use confidence-weighted fallbacks. Play confidence ${Math.round(k.playConfidence*100)}%, keyflare confidence ${Math.round(k.choiceConfidence*100)}%. Intentional discards are only lightly penalized.`);box.append(note);det.prepend(box)}
}
function makeIcon(src,cls){const s=document.createElement('span');s.className=`mr2ico ${cls}`;if(src){const i=document.createElement('img');i.src=src;i.alt='';s.append(i)}return s}
function patchGearTile(root,kind,items){
  if(!items.length)return;const x=items[0],grid=root.querySelector('.mr2mvpgrid');if(!grid)return;const cls=kind==='wheel'?'wh':'cov';let tile=grid.querySelector('.mr2mvp.'+cls);if(!tile){tile=document.createElement('div');tile.className='mr2mvp '+cls;grid.append(tile)}tile.innerHTML='';const tag=document.createElement('div');tag.className='mr2mvptag';tag.textContent=ui(kind==='wheel'?'MVP 命轮':'MVP 密契',kind==='wheel'?'MVP Wheel':'MVP Covenant');tile.append(tag);const main=document.createElement('div');main.className='mr2mvpmain';main.append(makeIcon(x.g?.icon,`gi ${kind==='covenant'?'cov ':''}mvp`));const body=document.createElement('div'),name=document.createElement('b');name.textContent=x.g?.name||'—';const gr=document.createElement('span');gr.className='mr2grade g'+x.enhancedGrade;gr.textContent=x.enhancedGrade;name.append(' ',gr);body.append(name);const line=document.createElement('span');line.innerHTML=`${ui('综合评分','Score')} <em>${x.enhancedScore.toFixed(1)}</em> / 100`;body.append(line);const small=document.createElement('small');small.textContent=[ui('增强模型','enhanced model'),`${ui('触发','triggers')} ${x.g?.n||0}`,...x._sm.f.slice(0,3).map(q=>q.label)].join(' · ');body.append(small);main.append(body);tile.append(main);
  if(items[1]){const sub=document.createElement('div');sub.className='mr2mvpsub';for(const q of items.slice(1,3)){const span=document.createElement('span');span.append(makeIcon(q.g?.icon,`gi ${kind==='covenant'?'cov ':''}xs`),document.createTextNode((q.g?.name||'—')+' '));const b=document.createElement('b');b.textContent=q.enhancedScore.toFixed(1);const g=document.createElement('i');g.className='mr2grade g'+q.enhancedGrade;g.textContent=q.enhancedGrade;span.append(b,' ',g);sub.append(span)}tile.append(sub)}
}
function patchAwTile(root,items){
  if(!items.length)return;const x=items[0],grid=root.querySelector('.mr2mvpgrid'),r=x.x.r;if(!grid||!r)return;let tile=grid.querySelector('.mr2mvp.aw');if(!tile){tile=document.createElement('div');tile.className='mr2mvp aw';grid.prepend(tile)}tile.innerHTML='';const tag=document.createElement('div');tag.className='mr2mvptag';tag.textContent=ui('MVP 唤醒体','MVP Awakener');tile.append(tag);const main=document.createElement('div');main.className='mr2mvpmain';main.append(makeIcon(r.a?.icon,'av mvp'));const body=document.createElement('div'),name=document.createElement('b');name.textContent=r.a?.name||'—';const gr=document.createElement('span');gr.className='mr2grade g'+x.grade;gr.textContent=x.grade;name.append(' ',gr);body.append(name);const line=document.createElement('span');line.innerHTML=`${ui('综合评分','Score')} <em>${x.score.toFixed(1)}</em> / 100`;body.append(line);const sm=document.createElement('small');sm.textContent=`${x.roleLabel} · ${ui('输出','Output')} ${Math.round(x.cats.out??0)} · ${ui('防御','Defense')} ${Math.round(x.cats.def??0)} · ${ui('辅助','Support')} ${Math.round(x.cats.sup??0)}`;body.append(sm);main.append(body);tile.append(main);const kv=document.createElement('div');kv.className='mr2mvpkv';[[ui('伤害','DMG'),Math.round(num(r.dmg)).toLocaleString()],[ui('护盾 / 治疗','Shield / Heal'),`${Math.round(num(r.block)).toLocaleString()} / ${Math.round(num(r.heal)).toLocaleString()}`],[ui('出牌','Cards'),r.plays??0]].forEach(([l,v])=>{const s=document.createElement('span');s.append(document.createTextNode(l+' '));const b=document.createElement('b');b.textContent=String(v);s.append(b);kv.append(s)});tile.append(kv);
}
function patchKeeperTile(root,k){
  if(!k||k.score==null)return;const grid=root.querySelector('.mr2mvpgrid');if(!grid)return;let tile=grid.querySelector('.mr2mvp.kp');if(!tile){tile=document.createElement('div');tile.className='mr2mvp kp';grid.append(tile)}tile.innerHTML='';const tag=document.createElement('div');tag.className='mr2mvptag';tag.textContent=ui('守密人评分','Keeper');tile.append(tag);const main=document.createElement('div');main.className='mr2mvpmain';main.append(makeIcon('','av mvp'));const body=document.createElement('div'),name=document.createElement('b');name.textContent=ui('守密人','Keeper');const gr=document.createElement('span');gr.className='mr2grade g'+k.grade;gr.textContent=k.grade;name.append(' ',gr);body.append(name);const line=document.createElement('span');line.innerHTML=`${ui('综合评分','Score')} <em>${k.score.toFixed(1)}</em> / 100`;body.append(line);const sm=document.createElement('small');sm.textContent=`${ui('钥令','Keyflare')} ${k.choiceScore==null?'—':Math.round(k.choiceScore)} · ${ui('资源','Resources')} ${k.resourceScore==null?'—':Math.round(k.resourceScore)} · ${ui('出牌','Plays')} ${k.playScore==null?'—':Math.round(k.playScore)}`;body.append(sm);main.append(body);tile.append(main);
}
function model(root){
  const d=[...root.querySelectorAll('.mr2minor')].find(x=>/评分模型|Rating model/i.test(clean(x.querySelector('summary')?.textContent)));if(!d)return;let n=d.querySelector('.mr2enh-model-note');if(!n){n=document.createElement('p');n.className='mr2enh-model-note';n.style.cssText='margin:10px 0 0;padding:8px 10px;border-left:3px solid rgba(79,208,200,.55);background:rgba(79,208,200,.05);color:#aeb9c8;font-size:11px;line-height:1.65';d.querySelector('.mr2rmodel')?.prepend(n)}
  if(n)n.textContent=ui('当前显示分数使用增强模型覆盖旧的等权份额分：唤醒体按主定位自适应，主职贡献权重最高，并用贡献/牌权修正效率；命轮/密契综合实战贡献与静态机制价值；守密人按出牌决策、资源管理、钥令选择分层计分，出牌估值同时包含输出、防御和辅助，未知信息按置信度收缩。','Displayed scores use the enhanced model: awakeners are role-adaptive, gear combines observed and passive value, and Keeper scoring separates play decisions, resource management, and keyflare choices with confidence-aware estimates.');
}

// ---------- MVP image ---------------------------------------------------------------------
const img=src=>new Promise(ok=>{if(!src)return ok(null);const i=new Image;i.crossOrigin='anonymous';i.onload=()=>ok(i);i.onerror=()=>ok(null);i.src=src});
function rr(c,x,y,w,h,r){c.beginPath();c.roundRect?c.roundRect(x,y,w,h,r):c.rect(x,y,w,h)}
async function download(root){
  const cards=[...root.querySelectorAll('.mr2mvpgrid>.mr2mvp')].slice(0,6).map(t=>{const n=t.querySelector('.mr2mvpmain b')?.cloneNode(true);n?.querySelector('.mr2grade')?.remove();return {tag:clean(t.querySelector('.mr2mvptag')?.textContent),name:clean(n?.textContent),score:(clean(t.querySelector('.mr2mvpmain span')?.textContent).match(/\d+(?:\.\d+)?/)||[])[0]||'—',g:clean(t.querySelector('.mr2grade')?.textContent),src:t.querySelector('.mr2mvpmain img')?.src||''}});if(!cards.length)return;
  const C=document.createElement('canvas');C.width=1200;C.height=760;const c=C.getContext('2d'),bg=c.createLinearGradient(0,0,1200,760);bg.addColorStop(0,'#0b111b');bg.addColorStop(.55,'#111827');bg.addColorStop(1,'#241b20');c.fillStyle=bg;c.fillRect(0,0,1200,760);c.fillStyle='#f3e5c8';c.font='800 34px system-ui,"Microsoft YaHei"';c.fillText(ui('忘忘看报 · 战斗回放 MVP','Morimens Weekly · Replay MVP'),54,64);c.fillStyle='#91a0b5';c.font='15px system-ui,"Microsoft YaHei"';c.fillText([clean(root.querySelector('.mr2btitle b')?.textContent),clean(root.querySelector('.mr2btitle small')?.textContent)].filter(Boolean).join(' · ').slice(0,105),54,94);const ims=await Promise.all(cards.map(q=>img(q.src)));
  cards.forEach((q,i)=>{const x=54+(i%3)*372,y=132+Math.floor(i/3)*254;rr(c,x,y,348,230,18);c.fillStyle='rgba(255,255,255,.045)';c.fill();c.strokeStyle=i===0?'rgba(213,177,118,.48)':'rgba(148,163,184,.18)';c.stroke();c.fillStyle='#d9bd89';c.font='700 13px system-ui,"Microsoft YaHei"';c.fillText(q.tag,x+18,y+28);if(ims[i])c.drawImage(ims[i],x+18,y+48,76,76);c.fillStyle='#eef2f7';c.font='800 21px system-ui,"Microsoft YaHei"';c.fillText(q.name.length>16?q.name.slice(0,15)+'…':q.name,x+110,y+76);c.fillStyle='#8fd8d1';c.font='800 30px system-ui';c.fillText(q.score,x+110,y+113);c.fillStyle='#8290a3';c.font='12px system-ui,"Microsoft YaHei"';c.fillText(ui('综合评分 / 100','Composite / 100'),x+110,y+132);c.fillStyle='#ead5ab';c.font='900 32px system-ui';c.fillText(q.g,x+18,y+181)});
  c.fillStyle='#8d99aa';c.font='13px system-ui,"Microsoft YaHei"';c.fillText(ui('仅供娱乐，有很多数据难以计入','For entertainment only; many effects cannot be fully quantified.'),54,718);c.textAlign='right';c.fillStyle='#657286';c.font='12px system-ui';c.fillText('© 青灯不弈 · 忘忘看报',1146,718);C.toBlob(b=>{if(!b)return;const u=URL.createObjectURL(b),a=document.createElement('a'),id=clean(root.querySelector('.mr2bmeta .id b')?.textContent).slice(0,8)||'replay';a.href=u;a.download=`忘忘看报-MVP-${id}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)},'image/png');
}
function button(root){
  const t=root.querySelector('.mr2mvptitle');if(!t||t.querySelector('#mr2DownloadMvp'))return;const w=document.createElement('div');w.className='mr2mvpactions';const b=document.createElement('button');b.id='mr2DownloadMvp';b.type='button';b.textContent=ui('下载 MVP 图片','Download MVP image');const s=document.createElement('small');s.textContent=ui('仅供娱乐，有很多数据难以计入','For entertainment only; many effects cannot be fully quantified.');w.append(b,s);t.append(w);b.onclick=()=>download(root);
}

async function run(){
  const root=document.getElementById('mrReplayResult'),api=window.MorimensReplayReview;if(!root||!api||!root.querySelector('.mr2mvps')||busy)return;const id=clean(root.querySelector('.mr2bmeta .id b')?.textContent),stamp=id+'|'+root.querySelectorAll('.mr2rrowd').length;if(!id||(stamp===last&&root.querySelector('#mr2DownloadMvp')))return;busy=true;
  try{
    const full=await api.fetchReplay(id),tl=api.buildTimeline(full),st=api.computeStats(full,tl),w=scoreGear(st.mvp?.wheels||[],tl,st.totalDmg||1),co=scoreGear(st.mvp?.covenants||[],tl,st.totalDmg||1),aw=scoreAwakeners(st.mvp),kp=scoreKeeper(st.mvp,tl);
    patchGearRows(root,'wheel',w);patchGearRows(root,'covenant',co);patchAwRows(root,aw);patchKeeperRow(root,kp);patchGearTile(root,'wheel',w);patchGearTile(root,'covenant',co);patchAwTile(root,aw);patchKeeperTile(root,kp);model(root);button(root);last=stamp;window.MorimensReplayEnhancedScores={uuid:id,wheels:w,covenants:co,awakeners:aw,keeper:kp};
  }catch(e){console.warn('Replay enhanced score failed',e)}finally{busy=false}
}
function watch(){
  css();let inner;const attach=()=>{const r=document.getElementById('mrReplayResult');if(!r||inner)return false;inner=new MutationObserver(()=>queueMicrotask(run));inner.observe(r,{subtree:true,childList:true});run();return true};if(!attach()){const outer=new MutationObserver(()=>{if(attach())outer.disconnect()});outer.observe(document.documentElement,{subtree:true,childList:true})}window.addEventListener('morimens-language-change',()=>{last='';setTimeout(run,0)});
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',watch,{once:true}):watch();
})();
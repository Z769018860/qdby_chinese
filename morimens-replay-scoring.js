// Replay Review scoring model (pure functions): continuous semantic gear value, role-adaptive awakener rating and the keeper decision model.
// Merged from the former DOM overlay; morimens-replay-review-v2.js applies it natively while building the MVP / rating data.
(()=>{
'use strict';
if(window.MorimensReplayScoring)return;
const en=()=>localStorage.getItem('morimens.language')==='en';
const ui=(zh,enText)=>en()?enText:zh;
const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number(v)||0));
const sat=(v,s)=>100*(1-Math.exp(-Math.max(0,Number(v)||0)/Math.max(.0001,s)));
const clean=v=>String(v??'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const grade=s=>s>=80?'S':s>=65?'A':s>=50?'B':s>=35?'C':'D';
const num=v=>Number(v)||0;
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
const SUP_W={key:1,ali:1.1,seal:.45,eng:1.65,vuln:1.6,buf:1.5,cut:1.55,draw:1.75,cyc:1.05,realm:.65,emb:.7,dis:1.1};
function awakenerUtilityLabels(x){
  const S=x.sup||{},a=[];
  const push=(v,z,e,strong=false)=>{if(v>0)a.push({v,label:ui(z,e),strong})};
  push(S.draw,'抽牌','Draw',true);push(S.cut,'减费','Cost cut',true);push(S.eng,'算力','Energy',true);push(S.vuln,'易伤','Vulnerability',true);push(S.buf,'伤害增益','Damage buff',true);push(S.cyc,'过牌','Cycling');push(S.dis,'驱散','Dispel',true);push(S.key,'钥令能量','Keyflare');push(S.ali,'充狂','Aliemus');push(S.realm,'界域精通','Realm mastery');push(S.emb,'胚胎','Embryo');
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


// ---------- Keeper decision model v2: six dimensions + regret + confidence ----------------------
// Principle: judge only what the player controls (resource use, card order, tempo, keyflare use, risk, team-window use), with ratio-type metrics so that
// team strength / wheels / covenants / draw luck are not credited to the keeper. Facts (raw statistics) are returned beside the scores.
const KW={R:.22,P:.22,T:.18,K:.14,S:.14,C:.10};
function mean(a){a=a.filter(v=>v!=null&&Number.isFinite(v));return a.length?a.reduce((x,y)=>x+y,0)/a.length:null}
function wavg(entries){let s=0,w=0;for(const [v,wt] of entries){if(v==null||!Number.isFinite(v)||wt<=0)continue;s+=v*wt;w+=wt}return w?s/w:null}
function scoreKeeperV2(m,tl,ref){
  const k=m?.keeper;if(!k)return null;
  const rounds=(tl.rounds||[]).filter(r=>!r.dim),R=Math.max(1,rounds.length),plays=(tl.playLog||[]).filter(p=>p.kind==='card'&&(tl.actors?.get(String(p.owner))?.kind==='awakener'));
  const cost=p=>{const v=p.cost!=null?Number(p.cost):Number(tl.res?.skill?.[String(p.tid)]?.Cost);return Number.isFinite(v)&&v>0?Math.round(v):0};
  const valued=p=>num(p.dmg)+num(p.block)+num(p.heal)+num(p.eng)+num(p.draw)+num(p.ali)>0||p.vuln;
  const facts={},conf={};
  // ---- Resource management --------------------------------------------------------------------
  const eff=k.eff||{},ends=[...(tl.roundEnd?.entries()||[])].sort((a,b)=>a[0]-b[0]);
  const Espend=eff.e1!=null?eff.e1*100:null,Eover=eff.e3!=null?eff.e3*100:null,Ecycle=eff.e2!=null?eff.e2*100:null;
  const spentTotal=plays.reduce((n,p)=>n+cost(p),0),valuedCost=plays.filter(valued).reduce((n,p)=>n+cost(p),0);
  const Econv=spentTotal>0?100*valuedCost/spentTotal:null;
  let leftRounds=0,goodReserve=0;for(let i=0;i<ends.length-1;i++){if((ends[i][1].energy||0)>0){leftRounds++;if((ends[i+1][1].energy||0)<=0)goodReserve++}}
  const Ereserve=leftRounds?100*goodReserve/leftRounds:null;
  // shield overflow: shield on the keeper when our phase ends minus what the enemy then hits for. Shield normally expires at the next round; only special effects keep it,
  // and a shield that is kept is not counted as overflow (the next round's opening shield tells which case it is).
  let shOver=0,shRounds=0,shEndTotal=0;for(let i=0;i<ends.length-1;i++){const [b,e]=ends[i],blk=e.block||0;if(!(blk>0))continue;const si=tl.shieldIn?.get(b)||{raw:0,blocked:0},left=Math.max(0,blk-(si.blocked||0)),kept=Math.min(left,tl.shieldStart?.get(b+1)??0);shRounds++;shEndTotal+=blk;shOver+=left-kept}
  const shGen=plays.reduce((n,p)=>n+num(p.block),0),shPct=shGen>0&&shRounds?Math.min(100,100*shOver/shGen):null;
  const ShieldScore=shPct==null?null:Math.max(0,100-2*shPct);
  const Rscore=wavg([[Espend,.30],[wavg([[Eover,.6],[ShieldScore,.4]]),.25],[Econv,.20],[Ecycle,.15],[Ereserve,.10]]);
  Object.assign(facts,{energySpent:eff.spent,energyLeft:Math.round(eff.waste||0),energyOverflow:eff.over,discards:eff.disc,cardsUsed:eff.used,zeroValuePlays:plays.filter(p=>!valued(p)).length,reserveRounds:leftRounds});
  conf.R=ends.length>=Math.max(1,R*.6)?.92:.6;
  // ---- Card-play decisions: knapsack regret + ordering regret --------------------------------------
  const rr=k.rrows||[],aD=rr.reduce((n,r)=>n+r.aD,0),oD=rr.reduce((n,r)=>n+r.oD,0),aF=rr.reduce((n,r)=>n+r.aF,0),oF=rr.reduce((n,r)=>n+r.oF,0);
  const ratios=[oD>0?aD/oD:null,oF>0?aF/oF:null].filter(v=>v!=null);
  const playRatio=ratios.length?ratios.reduce((a,b)=>a+b,0)/ratios.length:null;
  // ordering: a vulnerability applied after enemy damage was already dealt in the same round wastes that share of the earlier damage
  let seqLoss=0,seqBase=0;const hits=tl.hitLog||[];
  const byRound=new Map();for(const p of tl.playLog||[]){if(p.vuln){if(!byRound.has(p.round))byRound.set(p.round,[]);byRound.get(p.round).push(p.time)}}
  for(const [rd,ts] of byRound){const tv=Math.max(...ts);for(const h of hits){if(h.round!==rd||h.blind)continue;seqBase+=h.dmg;if(h.t!=null&&h.t<tv&&!h.vOn)seqLoss+=h.dmg*(h.vPct||50)/(100+(h.vPct||50))}}
  const totalHitDmg=hits.reduce((n,h)=>n+(h.blind?0:h.dmg),0)||1,seqRatio=seqLoss/totalHitDmg;
  const Pscore=playRatio==null?null:Math.max(0,Math.min(100,100*(playRatio-seqRatio)));
  Object.assign(facts,{regretPct:playRatio==null?null:100*(1-playRatio),orderLossPct:100*seqRatio,vulnRounds:byRound.size});
  conf.P=Math.min(.95,.45+.5*Math.min(1,rr.length/R))*(.7+.3*(k.playConfidence??.7));
  // ---- Tempo: percentile against the same stage ------------------------------------------------------
  let Tscore=null,topPct=null;const refs=Array.isArray(ref)?ref.filter(x=>Number.isFinite(x)):[];
  if(refs.length>=8){const slower=refs.filter(x=>x>R).length,same=refs.filter(x=>x===R).length;Tscore=100*(slower+same*.5)/refs.length;topPct=100*(refs.filter(x=>x<R).length+same*.5)/refs.length}
  const perRoundPlays=R>0?plays.length/R:0;Object.assign(facts,{rounds:R,stageSamples:ref?.total||refs.length,topPct,playsPerRound:Math.round(perRoundPlays*10)/10});
  conf.T=refs.length>=8?.9:.3;
  // ---- Keyflare choice and use -------------------------------------------------------------------------
  const kvv=(k.kv||[]).filter(x=>x.n>0),kuses=kvv.reduce((n,x)=>n+x.n,0),meanVal=kuses?kvv.reduce((n,x)=>n+x.val*x.n,0)/kuses:null;
  const Ksel=k.pickScore,Kexec=meanVal==null?null:Math.min(100,100*meanVal/2);
  const Kscore=wavg([[Ksel,.35],[Kexec,.65]]);
  Object.assign(facts,{keeperUses:kuses,keeperValuePerUse:meanVal==null?null:Math.round(meanVal*100)/100});
  conf.K=kuses?Math.min(.9,.5+.1*Math.min(4,kuses)):.4;
  // ---- Risk control ----------------------------------------------------------------------------------------
  const kf=tl.keeperFacts?.()||{},dr=kf.deathResist||0,lethal=ends.filter(([,e])=>e.hpf!=null&&e.hpf<.25).length,overheal=kf.healNom>0?1-kf.healAct/kf.healNom:null;
  let pen=0;if(dr>0)pen+=4+10*(dr-1);pen+=Math.min(40,6*lethal);if(overheal!=null)pen+=20*Math.max(0,overheal);
  const Sscore=Math.max(0,100-pen);
  Object.assign(facts,{deathResist:dr,lethalRounds:lethal,overhealPct:overheal==null?null:100*Math.max(0,overheal),shieldOverflow:shRounds?Math.round(shOver):null,shieldOverflowPct:shPct,shieldGenerated:Math.round(shGen),shieldHitRounds:shRounds});
  conf.S=ends.some(([,e])=>e.hpf!=null)?.8:.4;
  // ---- Team coordination: how much of the damage landed inside the teammates' vulnerability windows -----------
  const firstV=hits.findIndex(h=>h.vOn);let Cscore=null,cover=null,ultCover=null;
  if(byRound.size||firstV>=0){const after=firstV>=0?hits.slice(firstV):[],tot=after.reduce((n,h)=>n+(h.blind?0:h.dmg),0),under=after.reduce((n,h)=>n+(h.blind||!h.vOn?0:h.dmg),0);cover=tot>0?under/tot:null}
  const sup=(m.awakeners||[]).reduce((n,a)=>n+num(a.x?.sup?.buf),0),bufShare=Math.min(1,sup/Math.max(1,.08*totalHitDmg));
  Cscore=wavg([[cover==null?null:100*cover,.6],[sup>0?100*bufShare:null,.4]]);
  Object.assign(facts,{vulnCoveragePct:cover==null?null:100*cover,buffLeveragePct:sup>0?100*bufShare:null});
  conf.C=cover!=null?.8:sup>0?.6:.35;
  // ---- Total (weights renormalised over the dimensions that could be measured) ------------------------------
  const dims={R:Rscore,P:Pscore,T:Tscore,K:Kscore,S:Sscore,C:Cscore};
  let sw=0,sv=0,cw=0,cv=0;for(const key of Object.keys(KW)){if(dims[key]==null)continue;sw+=KW[key];sv+=KW[key]*dims[key];cw+=KW[key];cv+=KW[key]*(conf[key]||0)}
  const score=sw?sv/sw:null,confidence=cw?cv/cw:0;
  const potential=mean([playRatio==null?null:100*playRatio,Econv]),windows=mean([cover==null?null:100*cover,sup>0?100*bufShare:null]);
  return {score:score==null?null:clamp(score),grade:score==null?'—':grade(score),dims,conf,confidence,potential,windows,facts,weights:KW,original:k};
}
// ---------- Luck (easter egg: shown next to the keeper rating, never part of it) -----------------------------------
// 1) death resist that fired although the chance was small (the panel value is the chance of the NEXT trigger in %, and it halves after every trigger),
// 2) holding the Dimensional Image of an awakener outside the season's ring realm (the ring gives every awakener of its own realm an image for free),
// 3) lots of crits from awakeners with a low crit rate (forced-crit effects are left out; only the overall expectation is judged).
function binomTail(n,k,p){if(k<=0)return 1;let term=Math.exp(n*Math.log(1-p)),cdf=0;for(let i=0;i<k;i++){cdf+=term;term*=(n-i)/(i+1)*p/(1-p)}return Math.max(1e-12,Math.min(1,1-cdf))}
const RING_ZH={深海:'AEQUOR',混沌:'CHAOS',血肉:'CARO',超维:'ULTRA',超越:'ULTRA'},REALM_ZH={AEQUOR:'深海',CHAOS:'混沌',CARO:'血肉',ULTRA:'超维'},SCHOOL={1:'CHAOS',2:'CARO',3:'ULTRA',4:'AEQUOR'};
function critExcluder(tl){
  const forcedStates=new Set(),forcedSkills=new Set(),RE=/必定暴击|必然暴击|一定暴击|必定触发暴击|必定会暴击|必定造成暴击|必爆/,KEY=/^certain_crit/,txt=v=>v==null?'':typeof v==='string'?v:typeof v==='object'?Object.values(v).map(txt).join(' '):String(v);
  for(const [id,r] of Object.entries(tl.res?.state||{})){if(Object.keys(r.ExistProperty||{}).some(k=>KEY.test(k))||RE.test(txt(r.Desc)+txt(r.WeaponDesc)+txt(r.Name)))forcedStates.add(String(id))}
  for(const [id,r] of Object.entries(tl.res?.skill||{}))if(RE.test(txt(r.BattleDesc)+txt(r.Desc)))forcedSkills.add(String(id));
  return h=>!tl.res?.skill?.[String(h.skill)]||forcedSkills.has(String(h.skill))||!!(h.stl&&Object.keys(h.stl).some(k=>forcedStates.has(String(k))));
}
function scoreLuck(tl,aux={}){
  const items=[],parts={dr:0,shop:0,crit:0},bad={dr:0,crit:0};if(!tl)return null;
  // 1) death resist: the panel value is the chance of the first trigger; every trigger halves it, so the chance of this trigger is panel% x 0.5^(death_resist_times - 1)
  {let n=0;for(const d of tl.drLog||[]){if(d.v==null||!Number.isFinite(d.v))continue;n++;const k=Math.max(0,(Number(d.times)||1)-1),p=Math.min(1,d.v/100*Math.pow(.5,k));if(p>=.5)continue;
    const pts=Math.min(40,-Math.log2(Math.max(p,.005))*14);parts.dr+=pts;
    items.push({k:'dr',pts,text:ui(`第 ${d.bout} 回合触发死亡抵抗（本场第 ${n} 次），当时触发概率只有约 ${(p*100).toFixed(p<.1?1:0)}%（面板 ${Math.round(d.v)}%${k?`，已按此前触发次数减半 ${k} 次`:''}）`,`Death resist fired (#${n}) at only ~${(p*100).toFixed(0)}% chance`)})}}
  parts.dr=Math.min(60,parts.dr);
  {const e=tl.endDR&&tl.endDR();if(e&&e.lost&&Number.isFinite(e.v)&&e.v>0){const p=Math.min(1,e.v/100*Math.pow(.5,Math.max(0,e.t||0))),pts=Math.min(40,-Math.log2(Math.max(1-p,.05))*14+(p>=1?0:0));if(p>=.5&&p<1){bad.dr+=pts;items.push({k:'dr',bad:true,pts,text:ui(`守密人在第 ${e.bout} 回合倒下，当时面板死亡抵抗 ${Math.round(e.v)}%，却没有触发（失败概率约 ${((1-p)*100).toFixed(0)}%）`,`Keeper fell with ${Math.round(e.v)}% death resist untriggered`)})}}}
  // 2) dimensional image from outside the ring realm
  {const res=tl.res,names=new Set([...tl.actors.values()].filter(a=>a.kind==='awakener'&&a.camp===1).map(a=>String(a.name))),imgs=aux.imageRealms?.images||{},rings=aux.imageRealms?.rings||{};
    let ringRealm=null,ringName='';for(const t of tl.startRelics||[]){const nm=String(res.nameRelic(t)||'');if(/指轮|戒指/.test(nm)){const dsc=String(res.relic?.[String(t)]?.BattleDesc||res.relic?.[String(t)]?.Desc||'');
      ringRealm=RING_ZH[(dsc.match(/「(深海|混沌|血肉|超维|超越)」界域唤醒体获得其/)||[])[1]]||rings[t]?.realm||SCHOOL[res.relic?.[String(t)]?.SchoolID]||RING_ZH[(nm.match(/深海|混沌|血肉|超维|超越/)||[])[0]]||null;ringName=nm;break}}
    for(const t of tl.startRelics||[]){const nm=String(res.nameRelic(t)||''),m=nm.match(/^维度影像·(.+)$/);if(!m)continue;const realm=imgs[t]?.realm||SCHOOL[res.relic?.[String(t)]?.SchoolID];if(!realm)continue;
      if(ringRealm&&realm===ringRealm)continue;   // the ring itself hands these out
      const pts=45;parts.shop+=pts;
      items.push({k:'shop',pts,text:ui(`${ringRealm?`当期是${ringName}（${REALM_ZH[ringRealm]}界域），却拿到了${REALM_ZH[realm]||realm}界域「${m[1]}」的维度影像`:`没有界域指轮，却持有「${m[1]}」的维度影像`}`,`Holds ${m[1]}'s Dimensional Image from outside the ring realm`)})}
    parts.shop=Math.min(70,parts.shop)}
  // 3) crits: overall expectation only. The panel crit rate does not cover forced crits ("必定暴击" skills, certain_crit states such as 通用临时技能必爆) nor
  // card-specific crit rates (card_crit, crit_per_from_ulti / _strikecard), so every hit made while one of those is active is left out of both counts.
  const cs={n:0,k:0,exp:0,aw:0};
  {const skip=critExcluder(tl);
    const by=new Map();for(const h of tl.hitLog||[]){if(h.blind)continue;if(skip(h))continue;
      const o=by.get(h.uid)||{ps:[],k:0};const base=Number(tl.openProps?.get(String(h.uid))?.crit),pr=Number.isFinite(h.cr)?h.cr+(h.cx?(h.cx.ult?h.cx.u:0)+(h.cx.strk?h.cx.s:0)+(h.cx.c||0):0):base;if(!Number.isFinite(pr))continue;o.ps.push(Math.min(.98,Math.max(0,pr/100)));if(h.crit)o.k++;by.set(h.uid,o)}
    for(const [uid,o] of by){const a=tl.actors.get(String(uid));if(!a||a.kind!=='awakener'||o.ps.length<10)continue; // these have crit conversions (狂气/触腕) not visible in the replay, so board crit rate is not comparable
      const n=o.ps.length,mean=o.ps.reduce((x,y)=>x+y,0)/n;
      let dist=[1];for(const p of o.ps){const nd=new Array(dist.length+1).fill(0);for(let i=0;i<dist.length;i++){nd[i]+=dist[i]*(1-p);nd[i+1]+=dist[i]*p}dist=nd}
      const clampT=t=>Math.max(1e-12,Math.min(1,t)),pf=t=>t<.001?'<0.1':(t*100).toFixed(1);
      if(mean<=.4){cs.n+=n;cs.k+=o.k;cs.exp+=mean*n;cs.aw++;
        let tail=0;for(let i=o.k;i<dist.length;i++)tail+=dist[i];tail=clampT(tail);const sg=-Math.log10(tail);
        if(sg>=1.3){const pts=Math.min(40,sg*15);parts.crit+=pts;
          items.push({k:'crit',pts,text:ui(`${a.name} 平均暴击率 ${(mean*100).toFixed(0)}%，${n} 次命中（已排除必定暴击）暴击了 ${o.k} 次（期望 ${(mean*n).toFixed(1)} 次），概率约 ${pf(tail)}%`,`${a.name}: ${o.k}/${n} crits at ~${(mean*100).toFixed(0)}% crit rate`)})}}
      if(mean>=.25&&!/^(莫丝|徐|熔毁·朵尔)$/.test(a.name)){let low=0;for(let i=0;i<=o.k;i++)low+=dist[i];low=clampT(low);const sg=-Math.log10(low);
        if(sg>=1.3){const pts=Math.min(40,sg*15);bad.crit+=pts;
          items.push({k:'crit',bad:true,pts,text:ui(`${a.name} 平均暴击率 ${(mean*100).toFixed(0)}%，${n} 次命中（已排除必定暴击）只暴击了 ${o.k} 次（期望 ${(mean*n).toFixed(1)} 次），概率约 ${pf(low)}%`,`${a.name}: only ${o.k}/${n} crits at ~${(mean*100).toFixed(0)}% crit rate`)})}}}
    parts.crit=Math.min(60,parts.crit);bad.crit=Math.min(60,bad.crit)}
  const score=Math.min(100,parts.dr+parts.shop+parts.crit),label=score>=80?ui('欧皇附体','Blessed'):score>=50?ui('好运连连','Very lucky'):score>=20?ui('略有小运','A bit lucky'):score>0?ui('一点点运气','A touch of luck'):ui('平平无奇','Nothing special');
  const unlucky=Math.min(100,bad.dr+bad.crit),ulabel=unlucky>=80?ui('非酋附体','Cursed'):unlucky>=50?ui('霉运缠身','Very unlucky'):unlucky>=20?ui('略有不幸','A bit unlucky'):unlucky>0?ui('一点点倒霉','A touch of bad luck'):'';
  return {score,label:unlucky>score&&unlucky>=20?ulabel:label,unlucky,unluckyLabel:ulabel,parts,bad,critStats:cs,items:items.sort((a,b)=>b.pts-a.pts)};
}
window.MorimensReplayScoring={scoreGear,scoreAwakeners,scoreKeeper,scoreKeeperV2,scoreLuck,critExcluder,grade};
})();

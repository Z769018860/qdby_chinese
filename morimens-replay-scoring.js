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
const pnum=v=>Math.max(0,Number(v)||0);   // 团队合计只累加正贡献：单个负值不应让整个维度作废（dr=-5 曾使全队该维度为 null）
function wmean(entries){
  let s=0,w=0;
  for(const [v,wt] of entries){if(v==null||!Number.isFinite(v)||wt<=0)continue;s+=v*wt;w+=wt}
  return w?s/w:null;
}
// 相对份额：以"标称 4 人队"的公平份额（团队总量的 1/4）为基准，而不是实际人数 N。
// 原实现用 total/N 做基准时，同一绝对表现在不同队伍人数下会跨等级（N=3 → B、N=4 → A）。
// 第三个参数保留仅为兼容调用点，不再参与计算。
const REF_N=4;
function rel(v,total,_n){
  if(!(total>0))return null;
  if(!(v>0))return 0;
  const fair=total/REF_N;
  return clamp(100*v/(v+fair*.65));
}
function share(v,total){return total>0?Math.max(0,v/total):null}
function weightedShare(entries){return wmean(entries.filter(([v])=>v!=null))}
function typeList(v){return Array.isArray(v)?v:(v==null?[]:[v])}

// ---------- Wheel / Covenant semantic value -----------------------------------------------
function textOf(x,tl){
  // effectsEn 的元素是 {pieces,desc}：直接 join 会得到 "[object Object]"，分档效果（Realm Mastery +12 / Death Resistance +x% / Crit DMG …）会整段丢失
  // 密契的效果按件套分档（3 件 / 6 件），只有已生效档位才应该参与评分：件数已知时按 pieces 过滤，
  // 未知时（回放与队伍数据都查不到）保留全部档位 —— 宁可保持原样，也不凭猜测砍掉高档位。
  const g=x?.g||{},effs=(g.effectsEn||[]).filter(v=>{const p=Number(v?.pieces);return !(p>0)||!(g.count>0)||p<=g.count});
  const parts=[g.name,g.en,g.desc,...effs.map(v=>String(v?.desc??v))];
  for(const q of g.statics||[])parts.push(`${q.prop||''} ${q.val??''}`);
  if(g.related&&tl?.res?.state)for(const id of g.related){const r=tl.res.state[String(id)]||{};parts.push(r.CnID,r.Name,r.Desc,r.BattleDesc,JSON.stringify(r.ExistProperty||{}))}
  return clean(parts.filter(Boolean).join(' | ')).replace(/％/g,'%').replace(/[＋]/g,'+').replace(/[－–—]/g,'-');
}
// 只在文本真的写出数量时返回数值。匹配不到返回 null，绝不臆造 "+1"（「算力上限」曾因此显示成「算力上限 +1」）。
function near(t,re){const m=t.match(re),n=m?Number(m.slice(1).find(Boolean)):NaN;return Number.isFinite(n)&&n>0?n:null}
// 数量是否出现在负向语境里（"-1" / "降低 2" / "减少"）：这类写法是代价，不能当增益。
// 句子/分句边界（。；;，,|）之外的内容属于另一分句，不算；负向词也可能写在关键词之前（"降低手牌上限 1"）。
const NEG_SEG='[^。；;，,|]';
function isNeg(t,keyRe){const src='(?:'+keyRe.source+')';
  return new RegExp(src+NEG_SEG+'{0,20}?(?:[-－]|降低|减少|下降)','i').test(t)
    || new RegExp('(?:降低|减少|下降|失去)'+NEG_SEG+'{0,8}?'+src,'i').test(t);
}
function semantic(x,tl){
  const t=textOf(x,tl),g=x.g||{},f=[];
  const conditional=/(?:每当|当.+时|若|如果|触发后|本回合|首次|每回合|when |if |after |once per)/i.test(t);
  const passive=/(?:战斗开始|永久|常驻|开局|上限|max(?:imum)? |at battle start|permanent)/i.test(t)||(g.statics?.length||0)>0;
  const observed=(+g.n||0)>0,confidence=observed?1:(passive?.95:(conditional?.72:.82));
  const add=(k,z,e,v,strong=false,n='')=>{if(!f.some(q=>q.k===k))f.push({k,label:ui(z,e),v:clamp(v*confidence),strong,n})};
  const HAND_RE=/手牌(?:数量|张数)?上限|手牌容量|max(?:imum)?\s*hand|hand\s*(?:size|limit|capacity)|max_hand|hand_limit/i;
  if(HAND_RE.test(t)&&!isNeg(t,HAND_RE)){
    const n=near(t,/(?:手牌(?:数量|张数)?上限|手牌容量|max(?:imum)?\s*hand|hand\s*(?:size|limit|capacity)|max_hand|hand_limit)[^。;|]{0,28}?(?:\+|增加|提高|提升|by\s*)\s*(\d+(?:\.\d+)?)/i);
    if(n==null)add('hand',`手牌上限`,`Hand limit`,72,true,'');          // 写了手牌上限但没写数字：不给凭空的 "+N"，也不进 +N 档位
    else add('hand',`手牌上限 +${n}`,`Hand limit +${n}`,Math.min(95,76+(n-1)*9),true,n);
  }
  if(/回合结束[^。;]{0,24}(?:不弃|保留)|保留手牌|retain[^.;]{0,18}hand|keep[^.;]{0,18}hand/i.test(t))add('retain','回合末保留手牌','Hand retention',78,true);
  if(/初始手牌[^。;|]{0,16}(?:增加|提高|\+)|starting hand[^.;|]{0,18}(?:increase|bonus|\+)/i.test(t))add('opening','初始手牌增加','Larger starting hand',66,true);
  const ECAP_RE=/算力(?:数量)?上限|max(?:imum)?\s*energy|max_energy/i;
  if(ECAP_RE.test(t)&&!isNeg(t,ECAP_RE)){
    const n=near(t,/(?:算力(?:数量)?上限|max(?:imum)?\s*energy|max_energy)[^。;|]{0,24}?(?:\+|增加|提高|by\s*)\s*(\d+(?:\.\d+)?)/i);
    if(n==null)add('ecap',`算力上限`,`Energy cap`,68,true,'');
    else add('ecap',`算力上限 +${n}`,`Energy cap +${n}`,Math.min(90,68+(n-1)*8),true,n);
  }
  if(/(?:抽取?|额外抽)\s*\d*\s*张?牌|抽牌|draw\s+(?:an?\s+|\d+\s*)?cards?/i.test(t))add('draw','抽牌 / 手牌补充','Card draw',62,true);
  if(/算力消耗[^。;]{0,20}(?:降低|减少|-)|减费|cost[^.;]{0,22}(?:reduce|reduction|less|-)/i.test(t))add('cut','卡牌减费','Cost reduction',68,true);
  if(/(?:获得|回复|恢复|返还)[^。;]{0,12}算力|(?:gain|restore|refund)[^.;]{0,18}energy/i.test(t))add('energy','算力回复 / 生成','Energy generation',58);
  if(/复制[^。;]{0,16}(?:卡|牌|手牌)|copy[^.;]{0,16}cards?/i.test(t))add('copy','复制卡牌','Card copy',64,true);
  if(/(?:生成|创造)[^。;|]{0,14}(?:指令卡|卡牌|手牌)|(?:create|generate)[^.;|]{0,14}cards?/i.test(t))add('make','生成卡牌','Card generation',56);
  if(/取回|返回手牌|回到手牌|置于牌库顶|洗牌|从弃牌|从消耗|retrieve|return[^.;]{0,20}hand|shuffle|discard pile|exhaust pile/i.test(t))add('cycle','回收 / 过牌循环','Card cycling',54);
  if(/银钥|钥令能量|keeper\s*energy|keyflare\s*energy/i.test(t))add('key','银钥 / 钥令能量','Keyflare energy',52);
  if(/狂气(?!爆发)|充狂|aliemus|ultimate\s*energy/i.test(t))add('ali','狂气获取','Aliemus gain',48);   // "狂气爆发"= 释放终极技，不是攒狂气
  if(/易伤|vulnerab/i.test(t))add('vuln','易伤 / 承伤放大','Vulnerability',62,true);
  if(/界域精通|realm\s*mastery/i.test(t))add('realm','界域精通','Realm mastery',50);
  if(/死亡抵抗|death\s*resist/i.test(t))add('dr','死亡抵抗','Death resistance',62,true);
  if(/(?:受到|承受)[^。;]{0,16}伤害[^。;]{0,16}(?:降低|减少)|减伤|damage\s*taken[^.;]{0,20}(?:reduce|less)/i.test(t))add('mit','减伤','Damage mitigation',60,true);
  if(/护盾|治疗|回复生命|shield|heal/i.test(t))add('sustain','护盾 / 治疗','Shield / healing',48);
  // --- 薇薇安（C20）机制：固定侵蚀 / 狂气爆发的固定生命回复 / 释放狂气爆发后的临时力量 -------
  // 侵蚀是持续伤害，命中会走 outKind 的 dot 分支；这里让命轮文本里的"侵蚀增幅"也能被算作机制价值
  if(/侵蚀|腐蚀|corrosion/i.test(t)){
    const n=near(t,/(?:侵蚀|腐蚀|corrosion)[^。;|]{0,22}?(?:\+|增加|提高|提升|by\s*)\s*(\d+(?:\.\d+)?)\s*%/i);
    if(n==null)add('erosion',`侵蚀效果增幅`,`Corrosion boost`,52,true,'');
    else add('erosion',`侵蚀效果 +${n}%`,`Corrosion +${n}%`,Math.min(88,52+(n-1)*0.62),true,n);
  }
  if(/狂气爆发[^。;|]{0,26}(?:生命回复|治疗|回复)|(?:生命回复|治疗|回复)[^。;|]{0,22}狂气爆发|exalt[^.;|]{0,30}(?:heal(?:ing)?|hp\s*recover)/i.test(t)){
    const n=near(t,/(?:生命回复|治疗|回复|heal(?:ing)?)[^。;|]{0,22}?(?:\+|增加|提高|提升|by\s*)\s*(\d+(?:\.\d+)?)\s*%/i);
    if(n==null)add('exaltHeal',`狂气爆发治疗增幅`,`Exalt healing boost`,40);
    else add('exaltHeal',`狂气爆发治疗 +${n}%`,`Exalt healing +${n}%`,Math.min(72,40+(n-1)*0.7));
  }
  if(/(?:获得|增加|提高|提升)[^。;|]{0,40}?临时力量|临时力量[^。;|]{0,16}(?:\+|增加|提高)|(?:gain|increase)[^.;|]{0,26}temporary\s*(?:STR|strength)/i.test(t))add('tempStr','临时力量增益','Temporary strength',58,true);
  // 探索开始时把一张自己的卡塞进牌库（伊玛戈的诊室一类）：开局多一张可用牌
  if(/(?:加入|置入|洗入)[^。;|]{0,12}牌库|add[^.;|]{0,22}to the deck/i.test(t))add('deckAdd','开局加入牌库','Adds a card to the deck',54,true);
  if(!f.some(q=>q.k==='erosion')&&/(?:持续伤害|中毒|出血|灼烧|侵蚀|腐蚀|燃烧|献祭)[^。;|]{0,20}(?:提高|增加|提升|\+)|(?:bleed|poison|burn|corrosion)[^.;|]{0,24}(?:increase|boost|amp)/i.test(t))add('dotAmp','持续伤害增幅','DoT amplification',60,true);
  if(/眩晕|冻结|冰冻|石化|沉默|定身|恐惧|魅惑|麻痹|禁锢|stun|freeze|petrif|silence|fear/i.test(t))add('ctl','控制效果','Control',56);
  if(/额外行动|再次行动|立即行动|extra\s*(?:turn|action)|act again/i.test(t))add('action','额外行动','Extra action',86,true);
  // 代价：负面效果不能再被忽略 —— 「手牌上限 +5，但受到伤害提高 50%」不该只按收益拿 S
  // （不入 f：0 分标签没有展示价值，却会让下面的结构证据回退多算一条特征）
  const RISK=/(?:受到|承受)[^。;|]{0,16}伤害[^。;|]{0,20}(?:提高|增加|\+\s*\d)|damage\s*taken[^.;|]{0,24}(?:increase|up|amp)/i.test(t);
  const team=/(?:全体|所有友方|所有唤醒体|队友|我方全体|all allies|team)/i.test(t);
  const buff=/(?:力量|攻击力|基础伤害|伤害强效|最终伤害|暴击(?:率|伤害)?)[^。;|]{0,22}(?:增加|提高|提升|\+|获得)|(?:增加|提高|提升)[^。;|]{0,22}(?:力量|攻击力|基础伤害|伤害强效|最终伤害|暴击(?:率|伤害)?)|(?:increase|gain|bonus|boost)[^.;|]{0,24}(?:damage|crit|attack|power)|(?:damage|crit|attack|power)[^.;|]{0,24}(?:increase|bonus|boost)/i.test(t);
  if(buff)add(team?'teamBuff':'buff',team?'团队伤害增益':'伤害增益',team?'Team damage buff':'Damage buff',team?64:52,team);
  const S=x.sup||{};
  if(S.draw>0&&!f.some(q=>q.k==='draw'))add('draw','实战抽牌','Observed draw',68,true);
  if(S.cut>0&&!f.some(q=>q.k==='cut'))add('cut','实战减费','Observed cost cut',72,true);
  if(S.eng>0&&!f.some(q=>q.k==='energy'))add('energy','实战算力收益','Observed energy',62);
  if(S.cyc>0&&!f.some(q=>q.k==='cycle'))add('cycle','实战过牌','Observed cycling',58);
  const a=f.map(q=>q.v).sort((x,y)=>y-x);let support=a[0]||0;if(a[1])support+=a[1]*.2;if(a[2])support+=a[2]*.08;
  if(RISK)support-=16;   // 高收益 + 高代价：扣回代价，且不再享受手牌上限的保底
  // 手牌上限的保底同样必须有证据：一件从未触发、也没有静态属性的装备不该只凭一句「手牌上限 +N」
  // 就拿到 72 分整（这与下面「额外行动 76 分保底必须有实测触发证据」是同一条规则）。
  const evidenced=(+x.g?.n||0)>0||(x.g?.statics?.length||0)>0;
  const hand=f.find(q=>q.k==='hand'),floor=hand&&!RISK&&evidenced?Math.min(92,72+(Number(hand.n||1)-1)*9):0;
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
  // 结构证据只能抬高分数、不能压低：必须写成"取大"且不设触发阈值，否则实测值落在 (18,35) 时被结构值压低
  // （旧写法在 abs<18 时才替换，实测 dmg=2400 的命轮 abs=21.4 < 结构值 35，反而低于 dmg=0 的同一命轮）
  if((+x.g?.n||0)>0||(x.g?.statics?.length||0)>0||sm.f.length)abs=Math.max(abs,Math.min(35,10+Math.log2(1+(+x.g?.n||0))*6+sm.f.length*4+((x.g?.statics?.length||0)>0?5:0)));
  return {...x,_sm:sm,_abs:clamp(abs),enhancedCats:{out,def,sup}};
}
function scoreGear(items,tl,total){
  const rows=items.map(x=>evaluateGear(x,tl,total)),mx=Math.max(1,...rows.map(x=>x._abs)),ord=[...rows].sort((a,b)=>b._abs-a._abs);
  for(const x of rows){
    // 只有一个成员时没有排名信息，用中性先验 0.5，而不是 0.72（旧写法让"该类唯一装备"白拿 +7 分）
    const rank=ord.indexOf(x),pct=rows.length<=1?.5:1-rank/(rows.length-1),relScore=100*(.68*Math.sqrt(x._abs/mx)+.32*pct);
    let v=.72*x._abs+.10*clamp(x.score)+.18*relScore;
    // 「额外行动」的 76 分保底必须有实测触发证据，否则整场没触发的装备只凭文本就拿到 A
    if(x._sm.floor)v=Math.max(v,x._sm.floor);if(x._sm.f.some(q=>q.k==='action')&&(+x.g?.n||0)>0)v=Math.max(v,76);if(v<12&&((+x.g?.n||0)>0||(x.g?.statics?.length||0)>0))v=12;
    x.enhancedScore=clamp(v);x.enhancedGrade=grade(x.enhancedScore);
  }
  return rows.sort((a,b)=>b.enhancedScore-a.enhancedScore||(b.val||0)-(a.val||0));
}

// ---------- Awakener rating ---------------------------------------------------------------
const DEF_W={sh:45,mit:25,ctl:20,dr:10};
const SUP_W={key:1,ali:1.1,seal:.45,eng:1.65,vuln:1.6,buf:1.5,ero:1.4,cut:1.55,draw:1.75,cyc:1.05,realm:.65,emb:.7,dis:1.1};   // ero = 侵蚀伤害占比（薇薇安 / 沙耶一类）
function awakenerUtilityLabels(x){
  const S=x.sup||{},a=[];
  const push=(v,z,e,strong=false)=>{if(v>0)a.push({v,label:ui(z,e),strong})};
  push(S.draw,'抽牌','Draw',true);push(S.cut,'减费','Cost cut',true);push(S.eng,'算力','Energy',true);push(S.vuln,'易伤','Vulnerability',true);push(S.buf,'伤害增益','Damage buff',true);push(S.ero,'侵蚀','Corrosion',true);push(S.cyc,'过牌','Cycling');push(S.dis,'驱散','Dispel',true);push(S.key,'钥令能量','Keyflare');push(S.ali,'充狂','Aliemus');push(S.realm,'界域精通','Realm mastery');push(S.emb,'胚胎','Embryo');
  push(x.mit,'减伤','Mitigation',true);push(x.ctl,'控制/弱化','Control',true);push(x.saves,'救场','Death save',true);push(x.sh,'护盾/治疗','Shield/Heal',true);
  return a.sort((p,q)=>q.v-p.v).slice(0,6);
}
function scoreAwakeners(m){
  const refs=m?.awakeners||[],src=refs.map(ref=>({ref,x:ref.x||ref}));if(!src.length)return [];
  const N=src.length,T={out:0,sh:0,mit:0,ctl:0,dr:0,plays:0,energy:0},TS={};
  for(const {x} of src){T.out+=pnum(x.outT);T.sh+=pnum(x.sh);T.mit+=pnum(x.mit);T.ctl+=pnum(x.ctl);T.dr+=pnum(x.dr);T.plays+=pnum(x.plays);T.energy+=pnum(x.energy);for(const k of Object.keys(SUP_W))TS[k]=(TS[k]||0)+pnum(x.sup?.[k])}
  const roleName=k=>k==='out'?ui('输出核心','Damage'):k==='def'?ui('防御核心','Defense'):ui('辅助核心','Support');
  return src.map(({ref,x})=>{
    const out=rel(num(x.outT),T.out,N);
    const def=wmean([
      [rel(num(x.sh),T.sh,N),DEF_W.sh],[rel(num(x.mit),T.mit,N),DEF_W.mit],[rel(num(x.ctl),T.ctl,N),DEF_W.ctl],[rel(num(x.dr),T.dr,N),DEF_W.dr]
    ]);
    // support is many unrelated sub-metrics: a pure buffer / drawer / energy source is strong in one of them and empty in the rest, so a plain weighted mean buried specialists.
    // Blend the weighted mean with the unit's best sub-metrics (same top-heavy shape the three role scores use).
    const supDims=Object.entries(SUP_W).map(([k,w])=>[rel(num(x.sup?.[k]),TS[k]||0,N),w]);
    const supMean=wmean(supDims),supSorted=supDims.map(d=>d[0]).filter(v=>v!=null).sort((p,q)=>q-p);
    const sup=supMean==null?null:.7*supMean+.3*((supSorted[0]||0)*.7+(supSorted[1]||0)*.2+(supSorted[2]||0)*.1);
    const cats={out,def,sup};
    // 类内份额只有在「这一类本身有量级」的时候才可评。全辅助队里 800 点伤害就是全队 100% 的伤害份额，
    // 于是那一次顺手命中的角色被评成「输出核心 / 86 分 / A」——份额对，语义错。
    // 某类总量不到全队产出（伤害 + 护盾 + 减伤，同为伤害当量）的 4% 时，该类不参与评分；
    // 三类都被排除时退回全部可用类，避免整场无分。
    const mass=T.out+T.sh+T.mit;
    const tiny={out:mass>0&&T.out<mass*.04,def:mass>0&&(T.sh+T.mit)<mass*.04,sup:false};
    let available=Object.entries(cats).filter(([k,v])=>v!=null&&!tiny[k]).sort((a,b)=>b[1]-a[1]);
    if(!available.length)available=Object.entries(cats).filter(([,v])=>v!=null).sort((a,b)=>b[1]-a[1]);
    const top=available[0]?.[1]||0,second=available[1]?.[1]||0,third=available[2]?.[1]||0;
    let base=top*.72+second*.20+third*.08;
    const specialist=Math.min(8,Math.max(0,(top-second)*.12)),breadth=(second>=55?3.5:0)+(third>=45?2:0),rescue=Math.min(6,num(x.saves)*4);
    const outShare=share(num(x.outT),T.out);
    const defShare=weightedShare([[share(num(x.sh),T.sh),DEF_W.sh],[share(num(x.mit),T.mit),DEF_W.mit],[share(num(x.ctl),T.ctl),DEF_W.ctl],[share(num(x.dr),T.dr),DEF_W.dr]]);
    const supShare=weightedShare(Object.entries(SUP_W).map(([k,w])=>[share(num(x.sup?.[k]),TS[k]||0),w]));
    const roleShares={out:outShare,def:defShare,sup:supShare};
    const impact=weightedShare(available.map(([k,v])=>[roleShares[k],Math.max(1,v)]));
    const burden=wmean([[share(num(x.plays),T.plays),1],[share(num(x.energy),T.energy),1]]);
    // presence（存在性闸门）：只按 impact/burden 计分会让"几乎不出力"的角色拿满效率分
    // ——burden→0 时 ratio→∞（实测：整场只抽 1 张牌的角色 eff 封顶 92，与打满全场的主力同分）。
    // 因此用"实际消耗的资源份额 / 其公平份额"判断这个角色是否真的参与了战斗，作为 [0.55,1] 的系数。
    // 尺度 0.35：消耗到"公平份额"时 gate≈0.97（不再通缩），只有 burden < 0.4·fairS 才明显扣分
    const fairS=1/N,gate=burden==null?1:.55+.45*(sat(burden/Math.max(1e-9,fairS),.35)/100);
    let eff=60,ratio=null,mod=1;
    if(impact!=null&&burden!=null&&burden>0){ratio=impact/Math.max(burden,fairS*.4);eff=clamp(50+20*Math.log2(Math.max(.25,Math.min(8,ratio))),20,92);mod=.94+.12*(eff/100)}
    let score=(base+specialist+breadth)*mod*gate+rescue*mod;
    // 5% 先验：旧值缺失时应取中性（等于自身），而不是被 clamp(undefined)=0 当成「旧模型给 0 分」——
    // 后者会无条件扣掉 5%，与 scoreKeeperV2 里 `k.score==null?score:...` 的写法不一致。
    score=.95*score+.05*(ref.score==null?clamp(score):clamp(ref.score));
    // 保底同样受存在性闸门约束：几乎没出力的角色不该靠"某一维度份额很高"拿到 58 / 68 的保底
    if(top>=85)score=Math.max(score,68*gate);else if(top>=75)score=Math.max(score,58*gate);
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
  const costOf=(tid,c)=>{const v=rawCost(c!=null?c:res.skill?.[String(tid)]?.Cost);return Number.isFinite(v)&&v>0?Math.round(v):0};
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
// Principle: judge only what the player controls (resource turnover incl. aliemus use, card order, pace vs the same lineup's own history,
// keyflare use, risk, team-window use), with ratio-type metrics so that team strength / wheels / covenants / draw luck are not credited to the keeper.
// Facts (raw statistics) are returned beside the scores.
// 狂气爆发（B）不再是独立维度：它本来就是「攒起来的资源有没有用掉」，与算力/护盾/手牌的溢出同属资源周转，
// 因此并入 R 的周转子项（见 Rscore）。腾出来的位置给真正的「节奏」。
//
// 新「节奏」（T）= 与**这支队伍自己的往期表现**比，推进是快是慢、每回合有没有在做事。
// 旧版「节奏」= 同关卡回合数分位数的两个致命问题都由这个改法解决：
//   ① 数据自足：参照库 team-tempo.json 由 dzone 4.5 万场战报生成（88 个关卡，每关中位 460 场），
//      关卡不在库里才返回 null，不再出现「大部分回放恒为 —」；
//   ② 口径干净：回合数本身被队伍强度污染，所以不能直接比「谁回合少」，而是拿**同一阵容的往期分布**当中心
//      （p50，按样本量向「同关卡常态」收缩），此时强度/面板/招式都被固定住，剩下的才是决策差异。
//      没有该阵容的历史时才退回同关卡全体（此时置信度下调，并在界面标注「对比的是同关卡全体」）。
const KW={R:.30,P:.22,T:.13,K:.13,S:.13,C:.09};
// 分段线性映射：比率 → 分数。速度「越小越好」，密度「越大越好」。
// 1.00 = 与该队伍往期常态持平 → 78 / 80 分，留出「明显快于常态」才算优秀的空间。
const TEMPO_SPEED=[[.65,100],[.80,100],[.90,90],[1,78],[1.10,66],[1.25,50],[1.45,32],[1.70,16],[2,0]];
const TEMPO_DENS=[[.55,20],[.70,45],[.85,66],[1,80],[1.10,90],[1.25,100],[1.60,100]];
// 技能费用可能是公式字符串（实测 144492 是 `3-PlayerRole.GetStateLayer(148517)`）。
// 直接 Number() 得 NaN，再被下游当成 0 —— 这类牌会在背包里变成免费牌，算出假的「最优」。
// 取字符串开头的数字当基准费用：公式里的减项最多把费用降到 0，不会让它更贵。
function rawCost(v){let n=Number(v);if(!Number.isFinite(n)){const m=String(v??'').match(/^\s*(\d+(?:\.\d+)?)/);n=m?Number(m[1]):NaN}return n}
function piece(x,tab){if(x==null||!Number.isFinite(x))return null;if(x<=tab[0][0])return tab[0][1];
  for(let i=1;i<tab.length;i++){const [x1,y1]=tab[i];if(x<=x1){const [x0,y0]=tab[i-1];return y0+(y1-y0)*(x-x0)/(x1-x0)}}
  return tab[tab.length-1][1]}
function mean(a){a=a.filter(v=>v!=null&&Number.isFinite(v));return a.length?a.reduce((x,y)=>x+y,0)/a.length:null}
function wavg(entries){let s=0,w=0;for(const [v,wt] of entries){if(v==null||!Number.isFinite(v)||wt<=0)continue;s+=v*wt;w+=wt}return w?s/w:null}
function scoreKeeperV2(m,tl,tempoCtx){
  const k=m?.keeper;if(!k)return null;
  const rounds=(tl.rounds||[]).filter(r=>!r.dim),R=Math.max(1,rounds.length),plays=(tl.playLog||[]).filter(p=>p.kind==='card'&&(tl.actors?.get(String(p.owner))?.kind==='awakener'));
  const cost=p=>{const v=rawCost(p.cost!=null?p.cost:tl.res?.skill?.[String(p.tid)]?.Cost);return Number.isFinite(v)&&v>0?Math.round(v):0};
  // 「这一手有没有产出」：数值产出（伤害/护盾/治疗/算力/抽牌/狂气/易伤）之外，
  // 给己方叠状态层也算（state）：纯功能牌（装填！/ 生物拟态）在回放窗口里没有任何数值，
  // 旧口径会把它们当成浪费算力的零价值出牌，系统性压低辅助向阵容的出牌价值密度。
  const valued=p=>num(p.dmg)+num(p.block)+num(p.heal)+num(p.eng)+num(p.draw)+num(p.ali)+num(p.state)>0||p.vuln;
  const facts={},conf={};
  // ---- Burst / 狂气周转（R 的周转子项，不再是独立维度）--------------------------------------------------
  // 数据全部来自回放明文：守密人自己的爆发次数（playLog 里 kind==='ultimate'）+ 回合结束时各唤醒体的狂气 / 上限快照。
  // 不用 1028 的 changedValue 反推「溢出」，因为无法确认服务器是否已经钳制过增量；「结束时还剩多少」是明文数值，足够且不会错。
  // 只数「我方唤醒体」的爆发：敌方技能也会以 kind='ultimate' 落进 playLog（roleUid 分支），
  // 所以必须同时校验 actor 的 kind 与 camp，否则敌人的爆发会被当成我的狂气消耗。
  const casts=(tl.playLog||[]).filter(p=>{if(p.kind!=='ultimate')return false;const a=tl.actors?.get(String(p.owner));return !!a&&a.kind==='awakener'&&a.camp===1}).length;
  let Bleft=0,BcapSum=0,Bunits=0,Bmax=0;
  {const endsU=[...(tl.roundEnd?.entries()||[])].sort((a,b)=>a[0]-b[0]).map(([,e])=>e.ulti).filter(a=>Array.isArray(a)&&a.length);
   const lastU=endsU.length?endsU[endsU.length-1]:null;
   if(lastU)for(const x of lastU){const cap=Number(x?.m)||0;if(!(cap>0))continue;Bunits++;BcapSum+=cap;Bleft+=Math.max(0,Math.min(Number(x?.v)||0,cap));if(cap>Bmax)Bmax=cap}}
  const oneBurst=Bunits?(BcapSum/Bunits):(Bmax||100);              // 一次爆发大概要多少狂气（上限即消耗）
  const Bused=casts*oneBurst,Btot=Bused+Bleft;
  // 没有任何回合末狂气快照 → 不知道还剩多少，只能判 null（不能凭次数给满分）；整场供给不足一次爆发 → 同上（放不出来 ≠ 不想放）。
  // 这里只算「原始比率」，真正的分数在 Rother 出来后按供给量做平滑收缩（见下方 Bscore）：
  // 旧写法在「供给 0.8 次爆发」处硬切 null / 0，两次几乎相同的操作会有 10 分 R 的悬崖。
  const Braw=Bunits>0?clamp(100*Bused/Btot):null;
  const Bsupply=Bunits>0?Btot/Math.max(1,oneBurst):0;             // 本场攒出几次爆发的狂气
  const perRoundPlays=R>0?plays.length/R:0;Object.assign(facts,{rounds:R,playsPerRound:Math.round(perRoundPlays*10)/10,
    burstCasts:casts,burstSpent:Math.round(Bused),burstLeft:Bunits?Math.round(Bleft):null,burstUnits:Bunits,
    burstSupply:Math.round(Bsupply*100)/100,burstOneCost:Math.round(oneBurst)});
  // ---- Resource management（资源周转：算力 / 护盾 / 手牌 / 能量循环 + 狂气爆发）--------------------------
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
  // 旧写法 100-2·shPct 在溢出 50% 时就归零，罚项提前饱和；改为到 70% 才归零的线性罚
  const ShieldScore=shPct==null?null:Math.max(0,100-100*shPct/70);
  // 手牌上限溢出（爆牌）：抽到了却因为手牌已满而丢掉 —— 与算力溢出、护盾溢出同构，都是守密人的资源浪费。
  // 必须用比例而非绝对值：绝对惩罚会系统性扣掉抽牌多的强队，那是牌组强度不是决策质量。
  // 回放里既没有手牌上限字段也没有溢出标记，检测器是启发式的，所以它只占溢出子组的一部分，
  // 并在样本少时向 R 的其余分量收缩（而不是向常数收缩，避免 R 整体偏低时白送分）。
  const hf=tl.handFlow||{},OVF_FULL=.25;                                 // 进手的牌里有 25% 因手牌已满丢掉 → 0 分
  const ovfD=num(hf.ovfDirect),ovfH=num(hf.ovfHand);
  const hDen=num(hf.draws)+num(hf.created)+num(hf.retrieved)+ovfD;       // ovfHand 已经算在 draws 里，不能再加一次
  const ovfRate=hDen>0?(ovfD+ovfH)/hDen:null;
  const ovfConf=hDen>0?1-Math.exp(-hDen/10):0;
  const EovfRaw=ovfRate==null?null:clamp(100-100*Math.min(1,ovfRate/OVF_FULL));
  const Rother=wavg([[Espend,.30],[wavg([[Eover,.6],[ShieldScore,.4]]),.25],[Ecycle,.16],[Ereserve,.11]]);
  const Eovf=EovfRaw==null?null:(Rother==null?EovfRaw:EovfRaw*ovfConf+Rother*(1-ovfConf));
  // 狂气子项：按「本场攒出了几次爆发」平滑收缩到 R 的其余分量 —— 供给 0.5 次 → 完全中性，2 次以上 → 全按实际比率。
  // 这道收缩替代了原来的 0.8 次硬门槛：否则「一场没放爆发、总和 79.99」判 null（R=81.7）、「80.00」判 0（R=71.0），
  // 两次几乎相同的操作会差 10.6 分 R（总分 3.2），而 0 次爆发恰好落在门槛附近的局面很常见。
  // ⚠ 必须显式写 clamp(x,0,1)：clamp 的默认上界是 100（给百分制用的），
  //   漏掉上界时 Bw 会跑到 6.5，于是 Bscore = Braw*6.5 + Rother*(1-6.5) 变成负数
  //   （实测：一局 7 次爆发、狂气剩 31% 的场次算出 Bscore = -45.7，直接把这个子项判成「负数贡献」）。
  const Bw=clamp((Bsupply-.5)/1.5,0,1);
  const Bscore=Braw==null?null:(Rother==null?Braw:Braw*Bw+Rother*(1-Bw));
  Object.assign(facts,{burstUnusedPct:Bscore==null?null:100*Bleft/Btot,burstScore:Bscore});
  conf.burst=Bscore==null?.3:(Bw>=.9?.9:.65);   // 周转子项的置信度（不再是独立维度，不参与总分归一）
  // 周转 = 算力转化（Espend）· 浪费（护盾 / 算力 / 手牌溢出 + 零产出出牌）· 循环（Ecycle）· 储备（Ereserve）· 狂气（Bscore）
  // B 原为独立维度（12%），现并入 R：它衡量的就是「攒起来的资源有没有用掉」，与上面五项同构。权重合计 1.00。
  // Econv 原来单列 17%：把纯功能牌（装填！/ 生物拟态）计入产出之后它基本恒为 100，
  // 两场真实回放的 zeroValuePlays 都是 0 —— 等于给 R 白送 17% 的满分。
  // 它仍是有意义的闸门（白打一手就掉分），只是没有梯度，所以并进「浪费」组、权重降到组内 16%。
  const Ewaste=wavg([[Eover,.38],[ShieldScore,.25],[Eovf,.21],[Econv,.16]]);
  const Rscore=wavg([[Espend,.30],[Ewaste,.26],[Ecycle,.16],[Ereserve,.11],[Bscore,.17]]);
  Object.assign(facts,{energySpent:eff.cons??eff.spent,energyLeft:Math.round(eff.waste||0),energyOverflow:eff.over,discards:eff.disc,cardsUsed:eff.used,zeroValuePlays:plays.filter(p=>!valued(p)).length,reserveRounds:leftRounds,
    handOverflow:ovfD+ovfH,handOverflowPct:ovfRate==null?null:100*ovfRate,handOverflowDirect:ovfD,handOverflowInHand:ovfH,handCardsSeen:hDen||null,handPeak:Number.isFinite(hf.peak)?hf.peak:null});
  conf.R=ends.length>=Math.max(1,R*.6)?.92:.6;
  if(Bscore==null)conf.R=conf.R*.85;    // 狂气那一项没算进来（无快照 / 供给不足）→ R 的可信度相应下调
  if(Ecycle==null||Eover==null)conf.R=conf.R*.85;   // 战报统计包缺失（弃牌 / 算力溢出未知）→ 只剩两个子项，可信度下调
  // ---- Card-play decisions: knapsack regret + ordering regret --------------------------------------
  // 每回合单独给一个达成率（v2 已按「轴归属」算好：本回合没投入的轴不评），再**回合等权**平均。
  // 不再按伤害加权求和：那样后期回合的大数字会把早期的失误摊平
  // （151789 R4 打出 212 而手上有张值 847 的牌，4 倍失误，却被 R7 的 3.1 万拉回接近 1.0）。
  // 「打平」的回合要计 1.0：旧口径因为价格来自本场自身（打出 A 就让 A 成为最优）而自称没有信息量，
  // 现在价格只取**这一回合之前**的回合，打平是真实证据。只数失误会让 P 退化成「失败率」。
  const rr=k.rrows||[],rrI=rr.filter(r=>(r.judge!=null?r.judge:r.inf!==false)),aD=rrI.reduce((n,r)=>n+r.aD,0),oD=rrI.reduce((n,r)=>n+r.oD,0),aF=rrI.reduce((n,r)=>n+r.aF,0),oF=rrI.reduce((n,r)=>n+r.oF,0);
  // 优先用 v2 给的 r.ratio；老数据（回归测试里手搓的 rrows）没有这个字段就从两轴现算，同样带轴归属。
  const rowRatio=r=>{
    if(r.ratio!=null&&Number.isFinite(r.ratio))return r.ratio;
    if(r.judge===false)return null;
    if(r.judge==null&&r.inf===false)return null;
    const d=r.aD>0&&r.oD>0?r.aD/r.oD:null,f=r.aF>0&&r.oF>0?r.aF/r.oF:null,vs=[d,f].filter(v=>v!=null);
    return vs.length?vs.reduce((x,y)=>x+y,0)/vs.length:null;
  };
  const rrP=rr.map(rowRatio).filter(v=>v!=null);
  const playRatio=rrP.length?rrP.reduce((a,b)=>a+b,0)/rrP.length:null;
  // ordering: a vulnerability applied after enemy damage was already dealt in the same round wastes that share of the earlier damage
  let seqLoss=0,seqBase=0;const hits=tl.hitLog||[];
  const byRound=new Map();for(const p of tl.playLog||[]){if(p.vuln){if(!byRound.has(p.round))byRound.set(p.round,[]);byRound.get(p.round).push(p.time)}}
  for(const [rd,ts] of byRound){const tv=Math.max(...ts);for(const h of hits){if(h.round!==rd||h.blind)continue;seqBase+=h.dmg;if(h.t!=null&&h.t<tv&&!h.vOn)seqLoss+=h.dmg*(h.vPct||50)/(100+(h.vPct||50))}}
  const totalHitDmg=hits.reduce((n,h)=>n+(h.blind?0:h.dmg),0)||1,seqRatio=seqLoss/totalHitDmg;
  let Pscore=playRatio==null?null:Math.max(0,Math.min(100,100*(playRatio-seqRatio)));
  // 覆盖率：**有得选**的回合 / 能看到回合末手牌的回合。分母不再是「有更优解的回合」——
  // 「手上能打的都打了」不是打得完美、也不是打得差，是没有决策可评；这类回合不该拉低分母。
  // 低于 40% 说明这场几乎没给选择空间，P 的分数不是「打得完美」而是「模型看不出来」，
  // 向中性 78 收缩（与节奏全库回退同一套做法）。
  const pTot=k.pRounds??rr.length,pJudge=k.pJudge??rrP.length,pCov=pTot>0?pJudge/pTot:null;
  if(Pscore!=null&&pCov!=null&&pCov<.4)Pscore=78+(Pscore-78)*(pCov/.4);
  Object.assign(facts,{regretPct:playRatio==null?null:100*(1-playRatio),orderLossPct:100*seqRatio,vulnRounds:byRound.size,
    pInfoRounds:k.pInfo??null,pJudgeRounds:pJudge,pScoredRounds:pTot||null,pCover:pCov});
  conf.P=Math.min(.95,.45+.5*Math.min(1,rr.length/R))*(.7+.3*(k.playConfidence??.7));
  if(pCov!=null)conf.P=conf.P*(.55+.45*Math.min(1,pCov/.5));
  // ---- Tempo: 与「这支队伍自己的往期」比推进 -----------------------------------------------
  // 参照库 team-tempo.json 由 scripts/build-team-tempo.py 从 dzone 战报生成（88 关卡 / 4.5 万场 / 2419 支阵容）。
  // tempo 入参：{db, stageId, stageTid, lineup, rounds, cards, densOk, derived, approx, lost}
  //   rounds = 本场回合数；cards = 本场用牌数。**两者必须同源**：
  //     服务端统计（StageRoundCount / TotalUseCard，与参照库完全同口径）或 回放反推（回合数 + 出牌数）。
  //     曾经出现过「服务端用牌数 94 + 回放回放的回合数 6」的混搭，算出每回合 15.7 张牌，
  //     密度项直接顶到 100 分 —— 两种口径各自都对，混在一起就是错的。
  //   densOk = 回合数与用牌数同源（否则密度项作废，只用速度项）
  //   derived = 两者都是回放反推（口径与参照库不同，置信度 ×0.85）；approx = 服务端统计但字段名不同（×0.9）
  //   lost = 本场是否失利
  const tempo=(()=>{const t=tempoCtx;if(!t||!t.db)return null;
    const db=t.db;
    // 关卡不在库内（样本 <8）时退回**全库中位**（db.g：4.5 万场的总体中位），而不是直接判 null。
    // 否则 69 期以前 / 新开的关卡永远是「—」，这正是旧版被诟病的「节奏维度没有数据」。
    const pickStg=id=>{const v=(db.stages||{})[String(id??'')];return Array.isArray(v)&&Number(v[0])>=8?v:null};
    let stg=pickStg(t.stageId)||(t.stageTid!=null?pickStg(t.stageTid):null),scope='stage';
    if(!stg){const g=db.g;if(Array.isArray(g)&&Number(g[0])>=8){stg=g;scope='global'}}
    if(!stg)return null;
    // stg = [样本数, 回合中位 ×10, 每回合用牌中位 ×1000]（×10 是为了短关卡：10 回合的关 ±0.5 回合就是 5%）
    const sR=(Number(stg[1])||0)/10,sC=(Number(stg[2])||0)/1000,R0=Number(t.rounds)||0,C0=Number(t.cards)||0;
    if(!(R0>0)||!(sR>0)||!Number.isFinite(sR))return null;
    const cpr=C0>0?C0/R0:null;
    const uSpeed=R0/sR,uDens=cpr!=null&&sC>0?cpr/sC:null;
    const team=(db.teams||{})[String(t.lineup||'')]||null,tn=team?Number(team[0])||0:0;
    const w=tn>0?tn/(tn+3):0;                                      // 样本越小越向「同关卡常态」收缩
    const nSpeed=tn>0?1+(Number(team[2])/1000-1)*w:1;              // 队伍往期 p50（回合 / 同关卡中位）
    const nDens =tn>0?1+(Number(team[5])/1000-1)*w:1;              // 队伍往期 p50（每回合用牌 / 同关卡中位）
    if(!(nSpeed>0)||!Number.isFinite(nSpeed)||!(nDens>0)||!Number.isFinite(nDens))return null;
    const relSpeed=Number.isFinite(uSpeed/nSpeed)?uSpeed/nSpeed:null;
    // 回合数与用牌数同源才比密度：宁可少一个指标，也不拿两种口径相比
    const relDens=(uDens!=null&&t.densOk!==false)?(Number.isFinite(uDens/nDens)?uDens/nDens:null):null;
    // scope=global 时 sR 是拿**全库中位**顶替关卡中位的：回合数不能跨关卡比 ——
    // 参照库里 88 个关卡的中位从 9 回合到 35.5 回合（差 4 倍），拿同一个分母去比，等于按关卡长度打分：
    // 短关卡（实测 151789：本场 8 回合 vs 全库中位 16）白送速度满分，长关卡则被无端扣分。
    // 所以这种情况速度项整体作废，只保留**与关卡长度无关**的密度项（每回合用牌数由每回合算力 / 抽牌决定，跨关卡稳定）。
    const speedUsable=scope!=='global';
    let sSpeed=speedUsable?piece(relSpeed,TEMPO_SPEED):null;
    const sDens=piece(relDens,TEMPO_DENS);
    // 打输了谈不上「节奏达标」：把速度项压到 55 以下（仍保留「快」的部分信息，但不给优秀）
    if(t.lost&&sSpeed!=null)sSpeed=Math.min(sSpeed,55);
    const baseline=tn>0?'team':scope;
    let score=wavg([[sSpeed,.60],[sDens,.40]]);
    // 只剩一个指标时（密度缺失 / 全库回退导致速度作废），不能让单指标把 T 拉到极端，向中性收缩 30%
    if(score!=null&&(sDens==null||sSpeed==null))score=78+(score-78)*.7;
    // 没有该阵容的往期时只能跟「同关卡 / 全库」比，这条路会把队伍强度算进来（正是旧「节奏」被诟病的地方），
    // 所以按 40%（同关卡）/ 55%（全库）向中性（78）收缩：仍能区分明显拖拉 / 明显偏快，但不让 off-meta 队伍的强度差拉出 ±40 分。
    if(score!=null){
      if(baseline==='stage')score=78+(score-78)*.6;
      // 全库回退时连「参照中位」这个分母本身都是替身，再收一道
      else if(scope==='global')score=78+(score-78)*.45;
    }
    return {score,sSpeed,sDens,relSpeed:speedUsable?relSpeed:null,relDens,uSpeed,uDens,nSpeed,nDens,tn,sn:Number(stg[0]),scope,speedUsable,
      stageRounds:speedUsable?sR:null,stageCpr:sC,rounds:R0,cards:C0,cpr,densOk:t.densOk!==false,derived:!!t.derived,approx:!!t.approx,lost:!!t.lost,baseline};
  })();
  const Tscore=tempo?tempo.score:null;
  Object.assign(facts,{tempoRounds:tempo?tempo.rounds:null,tempoStageRounds:tempo&&tempo.stageRounds!=null?Math.round(tempo.stageRounds*10)/10:null,tempoCpr:tempo?tempo.cpr:null,
    tempoStageCpr:tempo?tempo.stageCpr:null,tempoSpeedRel:tempo?tempo.relSpeed:null,tempoDensRel:tempo?tempo.relDens:null,
    tempoTeamN:tempo?tempo.tn:null,tempoStageN:tempo?tempo.sn:null,tempoBaseline:tempo?tempo.baseline:null,tempoDerived:tempo?tempo.derived:null,tempoApprox:tempo?tempo.approx:null,
    tempoCards:tempo?tempo.cards:null,tempoDensOk:tempo?tempo.densOk:null,tempoScope:tempo?tempo.scope:null});
  // 置信度：阵容往期（team）> 同关卡全体（stage）> 全库中位（global），再按数据口径打折。
  // 旧写法只用样本量，全库 4.5 万场会把「跟所有人比」也顶到高置信度，与实际精度相反。
  // ⚠ 上界必须显式写 1：clamp 的默认上界是 100（给百分制用的），漏掉时置信度会算出 1.02，界面直接显示「可信度 102%」。
  const tBase=tempo?.baseline==='team'?.95:tempo?.baseline==='stage'?.60:tempo?.baseline==='global'?.40:0;
  // 先封顶 0.95 再乘口径折扣：否则「阵容往期 + 大样本」会顶到 1.0，
  // 而「回放反推」（口径不同，应该更低）也被同一道上界压平，两者看不出差别。
  // scope=global 再打 0.6：分母是拿全库中位顶替关卡中位的，难度不可比。
  conf.T=tempo?clamp(Math.min(.95,tBase+.25*Math.min(1,tempo.tn/10))*(tempo.derived?.85:tempo.approx?.9:1)*(tempo.scope==='global'?.6:1),0,1):.3;
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
  // crit-rate management: crit rate beyond 100% is wasted. Only hits of crit builds (awakener mean effective rate >= 50%) are counted, forced-crit hits are left out.
  let critOver=null,critBuild=0;{const skip=critExcluder(tl),by=new Map();for(const h of hits){if(h.blind||skip(h)||!Number.isFinite(h.cr))continue;const pr=h.cr+(h.cx?(h.cx.ult?h.cx.u:0)+(h.cx.strk?h.cx.s:0)+(h.cx.c||0):0),o=by.get(h.uid)||{n:0,s:0,hs:[]};o.n++;o.s+=pr;o.hs.push([pr,num(h.dmg)]);by.set(h.uid,o)}
    let w=0,ov=0;for(const o of by.values()){if(o.n<5||o.s/o.n<50)continue;critBuild++;for(const [pr,d] of o.hs){w+=d;ov+=d*Math.max(0,pr-100)}}
    if(w>0)critOver=ov/w}
  const critScore=critOver==null?null:Math.max(0,100-Math.min(100,critOver*2.5));
  Cscore=wavg([[cover==null?null:100*cover,.6],[sup>0?100*bufShare:null,.4],[critScore,.25]]);
  Object.assign(facts,{critOverflowPct:critOver,critBuilds:critBuild,vulnCoveragePct:cover==null?null:100*cover,buffLeveragePct:sup>0?100*bufShare:null});
  conf.C=cover!=null?.8:sup>0||critOver!=null?.6:.35;
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
function noCritSkills(res){
  const txt=v=>v==null?'':typeof v==='string'?v:typeof v==='object'?Object.values(v).map(txt).join(' '):String(v),out=new Set();
  const types=cid=>(res?.rr?.Cmd?.[String(cid)]?.data_list||[]).map(d=>String(d.Type));
  for(const [id,sk] of Object.entries(res?.skill||{})){
    const t=[...types(sk.CmdList),...types(sk.PreCmd)];
    const dmg=t.filter(x=>/^BE(ActiveDamage|FixedDamage|TrueDamage|RealDamage)/.test(x));
    // damage that only comes from fixed / true damage commands (e.g. 卡拉布「粉雪魔咒」: 固定伤害) never rolls a crit
    if(dmg.length&&dmg.every(x=>/Fixed|True|Real/.test(x)))out.add(String(id));
    else if(!dmg.length&&/RealDamage|固定伤害/.test(txt(sk.BattleDesc)+txt(sk.Desc))&&!/造成[^。]{0,12}点伤害/.test(txt(sk.BattleDesc)+txt(sk.Desc)))out.add(String(id));
  }
  return out;
}
function critExcluder(tl){
  const forcedStates=new Set(),forcedSkills=new Set(),RE=/必定暴击|必然暴击|一定暴击|必定触发暴击|必定会暴击|必定造成暴击|必爆/,KEY=/^certain_crit/,txt=v=>v==null?'':typeof v==='string'?v:typeof v==='object'?Object.values(v).map(txt).join(' '):String(v);
  for(const [id,r] of Object.entries(tl.res?.state||{})){if(Object.keys(r.ExistProperty||{}).some(k=>KEY.test(k))||RE.test(txt(r.Desc)+txt(r.WeaponDesc)+txt(r.Name)))forcedStates.add(String(id))}
  for(const [id,r] of Object.entries(tl.res?.skill||{}))if(RE.test(txt(r.BattleDesc)+txt(r.Desc)))forcedSkills.add(String(id));
  const noCrit=noCritSkills(tl.res);
  return h=>!tl.res?.skill?.[String(h.skill)]||forcedSkills.has(String(h.skill))||noCrit.has(String(h.skill))||h.dt===2||h.dt===6||!!(h.stl&&Object.keys(h.stl).some(k=>forcedStates.has(String(k))));
}
function scoreLuck(tl,aux={}){
  const items=[],parts={dr:0,shop:0,crit:0},bad={dr:0,crit:0};if(!tl)return null;
  // 1) death resist: the panel value is the un-halved total. Every death-resist trigger earlier in the exploration (death_resist_times at battle start) already halved it,
  // and each trigger inside this battle halves it again, so the chance of the nth in-battle trigger is panel% x 0.5^(times at battle start + n - 1)
  {const kp=tl.ent?.keeperUid,t0=Number(tl.openProps?.get?.(String(kp))?.death_resist_times),fb=(tl.drLog&&tl.drLog.length)?Math.max(0,(Number(tl.drLog[0].times)||1)-1):0;
    const base=Number.isFinite(t0)?t0:fb;let n=0;
    for(const d of tl.drLog||[]){if(d.v==null||!Number.isFinite(d.v))continue;const k=base+n;n++;const p=Math.min(1,d.v/100*Math.pow(.5,k));if(p>=.5)continue;
      const pts=Math.min(40,-Math.log2(Math.max(p,.005))*14);parts.dr+=pts;
      items.push({k:'dr',pts,text:ui(`第 ${d.bout} 回合触发死亡抵抗（本场第 ${n} 次），当时触发概率只有约 ${(p*100).toFixed(p<.1?1:0)}%（面板 ${Math.round(d.v)}%，进入本场前已触发 ${base} 次、本场此前 ${n-1} 次，共减半 ${k} 次）`,`Death resist fired (#${n}) at only ~${(p*100).toFixed(0)}% chance`)})}}
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
      const o=by.get(h.uid)||{ps:[],k:0};const base=Number(tl.openProps?.get(String(h.uid))?.crit),pr=Number.isFinite(h.cr)?h.cr+(h.cx?(h.cx.ult?h.cx.u:0)+(h.cx.strk?h.cx.s:0)+(h.cx.c||0):0):base;if(!Number.isFinite(pr))continue;o.ps.push(Math.min(.98,Math.max(0,pr/100)));if(h.crit)o.k++;else if(pr>=90)(o.miss=o.miss||[]).push({pr,round:h.round});by.set(h.uid,o)}
    // single hits: a crit rate of 90% / 95% or more that still did not crit (chance of the miss = 100% - rate)
    for(const [uid,o] of by){const a=tl.actors.get(String(uid));if(!a||a.kind!=='awakener'||!o.miss?.length)continue;
      const hi=o.miss.filter(m=>m.pr>=95),mid=o.miss.filter(m=>m.pr<95),pts=Math.min(30,o.miss.reduce((t,m)=>t+Math.min(34,-Math.log2(Math.max(.02,1-Math.min(.98,m.pr/100)))*4),0));bad.crit+=pts;
      const rs=a=>[...new Set(a.map(m=>m.round))].slice(0,4).join('、');
      const det=[hi.length?`${hi.length} 次暴击率 ≥95%`:'',mid.length?`${mid.length} 次暴击率 90%～95%`:''].filter(Boolean).join('、');
      items.push({k:'crit',bad:true,pts,text:ui(`${a.name} 单次暴击率很高却没暴击：${det}（第 ${rs(o.miss)} 回合）`,`${a.name}: ${o.miss.length} hit(s) at >=90% crit rate without a crit`)})}
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

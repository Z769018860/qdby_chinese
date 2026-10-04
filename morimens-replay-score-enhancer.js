// Morimens replay review: equipment-score v3 + MVP card export.
// Loaded separately so the large replay decoder can stay cacheable and auditable.
(()=>{
  'use strict';
  if(window.__morimensReplayScoreEnhancerV3)return;
  window.__morimensReplayScoreEnhancerV3=true;

  const isEn=()=>localStorage.getItem('morimens.language')==='en';
  const ui=(zh,en)=>isEn()?en:zh;
  const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,Number(v)||0));
  const sat=(v,scale)=>{v=Math.max(0,Number(v)||0);scale=Math.max(1e-9,Number(scale)||1);return 100*(1-Math.exp(-v/scale))};
  const fmt=n=>(Number(n)||0).toLocaleString(isEn()?'en-US':'zh-CN',{maximumFractionDigits:1});
  const gradeOf=s=>s>=80?'S':s>=65?'A':s>=50?'B':s>=35?'C':'D';
  const clean=s=>String(s??'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  const norm=s=>clean(s).replace(/％/g,'%').replace(/[＋]/g,'+').replace(/[－–—]/g,'-');
  let busy=false,lastStamp='';

  function ensureStyle(){
    if(document.getElementById('mrReplayScoreEnhancerStyle'))return;
    const s=document.createElement('style');s.id='mrReplayScoreEnhancerStyle';s.textContent=`
      .mr2mvpactions{margin-left:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.mr2mvpactions button{border:1px solid rgba(213,177,118,.38);border-radius:8px;background:rgba(213,177,118,.12);color:#f0d5a5;padding:6px 10px;cursor:pointer;font:700 11px/1.2 inherit}.mr2mvpactions button:hover{background:rgba(213,177,118,.2)}.mr2mvpactions small{color:#7f8da1;font-size:9px;font-weight:500}.mr2mvptitle{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      .mr2enhscore{margin-top:8px;padding:8px 10px;border:1px solid rgba(213,177,118,.22);border-radius:8px;background:rgba(213,177,118,.055);font-size:10px;line-height:1.65;color:#aeb9c8}.mr2enhscore b{color:#ead5ab}.mr2enhscore .mr2enhchips{display:flex;flex-wrap:wrap;gap:5px;margin-top:5px}.mr2enhscore i{font-style:normal;padding:1px 6px;border-radius:999px;background:rgba(79,208,200,.08);border:1px solid rgba(79,208,200,.18);color:#9edbd6}.mr2enhscore i.strong{background:rgba(213,177,118,.1);border-color:rgba(213,177,118,.28);color:#f0d29f}.mr2enhscore em{font-style:normal;color:#7e8da2}.mr2enhbadge{display:inline-flex;margin-left:5px;padding:0 5px;border-radius:999px;border:1px solid rgba(79,208,200,.25);color:#86d5cf;font-size:8px;vertical-align:1px}
      #morimensReplayEarlyEntry{margin-top:14px;display:flex;justify-content:center}#morimensReplayEarlyTab{border:1px solid rgba(213,177,118,.38);border-radius:10px;background:rgba(213,177,118,.10);color:#ead7b5;padding:9px 14px;cursor:pointer;font:800 12px/1.2 system-ui,-apple-system,'Microsoft YaHei',sans-serif}#morimensReplayEarlyTab small{margin-left:5px;color:#8bd4cc;font-size:8px;text-transform:uppercase}
      @media(max-width:720px){.mr2mvpactions{width:100%;margin-left:0}.mr2mvpactions small{flex:1 1 100%}}
    `;document.head.appendChild(s);
  }

  function effectText(x,tl){
    const g=x?.g||{},parts=[g.name,g.en,g.desc];
    if(Array.isArray(g.effectsEn))parts.push(...g.effectsEn);
    if(Array.isArray(g.statics))for(const st of g.statics||[])parts.push(`${st.prop||''} ${st.val??''}`);
    if(g.related&&tl?.res?.state){
      for(const sid of g.related){const r=tl.res.state[String(sid)]||{};parts.push(r.CnID,r.Name,r.Desc,r.BattleDesc,JSON.stringify(r.ExistProperty||{}));}
    }
    return norm(parts.filter(Boolean).join(' | '));
  }

  function numberNear(text,re,def=1){
    const m=text.match(re);if(!m)return def;
    const n=Number(m.slice(1).find(v=>v!=null&&v!=='')||def);return Number.isFinite(n)&&n>0?n:def;
  }

  function semanticFeatures(x,tl){
    const t=effectText(x,tl),g=x.g||{},features=[];
    const conditional=/(?:每当|当.+时|若|如果|触发后|本回合|首次|每回合|when |if |after |once per)/i.test(t);
    const passive=/(?:手牌.+上限|算力.+上限|战斗开始|永久|常驻|开局|max(?:imum)? hand|max(?:imum)? energy|at battle start|permanent)/i.test(t)||((g.statics?.length||0)>0);
    const observed=(Number(g.n)||0)>0;
    const conf=observed?1:passive?.95:conditional?.72:.82;
    const add=(key,zh,en,score,strong=false,note='')=>{if(features.some(f=>f.key===key))return;features.push({key,label:ui(zh,en),score:clamp(score*conf),strong,note})};

    if(/手牌(?:数量|张数)?上限|手牌容量|max(?:imum)?\s*hand|hand\s*(?:size|limit|capacity)|max_hand/i.test(t)){
      const n=numberNear(t,/(?:手牌(?:数量|张数)?上限|手牌容量|max(?:imum)?\s*hand|hand\s*(?:size|limit|capacity)|max_hand)[^。;|]{0,28}?(?:\+|增加|提高|提升|by\s*)\s*(\d+(?:\.\d+)?)/i,1);
      add('hand',`手牌上限 +${n}`,`Hand limit +${n}`,Math.min(95,76+Math.max(0,n-1)*9),true,String(n));
    }
    if(/回合结束[^。;]{0,24}(?:不弃|保留)|保留手牌|retain[^.;]{0,18}hand|keep[^.;]{0,18}hand/i.test(t))add('retain','回合末保留手牌','Hand retention',78,true);
    if(/算力(?:数量)?上限|max(?:imum)?\s*energy|max_energy/i.test(t)){
      const n=numberNear(t,/(?:算力(?:数量)?上限|max(?:imum)?\s*energy|max_energy)[^。;|]{0,24}?(?:\+|增加|提高|by\s*)\s*(\d+(?:\.\d+)?)/i,1);
      add('energyCap',`算力上限 +${n}`,`Energy cap +${n}`,Math.min(90,68+Math.max(0,n-1)*8),true,String(n));
    }
    if(/(?:抽取?|额外抽)\s*\d*\s*张?牌|抽牌|draw\s+(?:an?\s+|\d+\s*)?cards?/i.test(t))add('draw','抽牌 / 手牌补充','Card draw',62,true);
    if(/算力消耗[^。;]{0,20}(?:降低|减少|-)|减费|cost[^.;]{0,22}(?:reduce|reduction|less|-)/i.test(t))add('cut','卡牌减费','Cost reduction',68,true);
    if(/(?:获得|回复|恢复|返还)[^。;]{0,12}算力|算力[^。;]{0,12}(?:回复|恢复|返还)|(?:gain|restore|refund)[^.;]{0,18}energy/i.test(t))add('energy','算力回复 / 生成','Energy generation',58);
    if(/复制[^。;]{0,16}(?:卡|牌|手牌)|copy[^.;]{0,16}cards?/i.test(t))add('copy','复制卡牌','Card copy',64,true);
    if(/取回|返回手牌|回到手牌|置于牌库顶|洗牌|从弃牌|从消耗|retrieve|return[^.;]{0,20}hand|shuffle|discard pile|exhaust pile/i.test(t))add('cycle','回收 / 过牌循环','Card cycling',54);
    if(/银钥|钥令能量|keeper\s*energy|keyflare\s*energy/i.test(t))add('key','银钥 / 钥令能量','Keyflare energy',52);
    if(/狂气|充狂|aliemus|ultimate\s*energy/i.test(t))add('ali','狂气获取','Aliemus gain',48);
    if(/易伤|vulnerab/i.test(t))add('vuln','易伤 / 承伤放大','Vulnerability',62,true);
    if(/界域精通|realm\s*mastery/i.test(t))add('realm','界域精通','Realm mastery',50);
    if(/死亡抵抗|death\s*resist/i.test(t))add('dr','死亡抵抗','Death resistance',62,true);
    if(/(?:受到|承受)[^。;]{0,16}伤害[^。;]{0,16}(?:降低|减少)|减伤|damage\s*taken[^.;]{0,20}(?:reduce|less)/i.test(t))add('mit','减伤','Damage mitigation',60,true);
    if(/护盾|治疗|回复生命|shield|heal/i.test(t))add('sustain','护盾 / 治疗','Shield / healing',48);
    if(/眩晕|冻结|冰冻|石化|沉默|定身|恐惧|魅惑|麻痹|禁锢|stun|freeze|petrif|silence|fear/i.test(t))add('control','控制效果','Control',56);
    if(/额外行动|再次行动|立即行动|extra\s*(?:turn|action)|act again/i.test(t))add('action','额外行动','Extra action',86,true);
    const team=/(?:全体|所有友方|所有唤醒体|队友|我方全体|all allies|team)/i.test(t);
    if(/力量|攻击力|基础伤害|伤害强效|最终伤害|暴击(?:率|伤害)?|damage|critical|crit|power|attack/i.test(t))add(team?'teamBuff':'dmgBuff',team?'团队伤害增益':'伤害增益',team?'Team damage buff':'Damage buff',team?64:52,team);

    const S=x.sup||{};
    if((S.draw||0)>0&&!features.some(f=>f.key==='draw'))add('draw','实战抽牌','Observed draw',Math.min(78,48+sat(S.draw,2)*.3),true);
    if((S.cut||0)>0&&!features.some(f=>f.key==='cut'))add('cut','实战减费','Observed cost cut',Math.min(82,50+sat(S.cut,2)*.32),true);
    if((S.eng||0)>0&&!features.some(f=>f.key==='energy'))add('energy','实战算力收益','Observed energy',Math.min(78,46+sat(S.eng,3)*.3));
    if((S.cyc||0)>0&&!features.some(f=>f.key==='cycle'))add('cycle','实战过牌','Observed cycling',Math.min(72,42+sat(S.cyc,3)*.3));

    const vals=features.map(f=>f.score).sort((a,b)=>b-a);
    let support=vals.length?vals[0]:0;
    if(vals.length>1)support+=vals[1]*.20;
    if(vals.length>2)support+=vals.slice(2,4).reduce((a,b)=>a+b,0)*.08;
    support=clamp(support);
    const hand=features.find(f=>f.key==='hand');
    const handFloor=hand?Math.min(92,72+Math.max(0,Number(hand.note||1)-1)*9):0;
    return {text:t,features,support,handFloor,conditional,passive,observed};
  }

  function rawSupportScore(x,totalDmg){
    const S=x.sup||{},parts=[];
    const push=v=>{if(Number.isFinite(v)&&v>0)parts.push(clamp(v))};
    push(sat(S.key,1.6)*.72);push(sat(S.ali,70)*.68);push(sat(S.eng,2.6)*.78);push(sat(S.cut,2.2)*.82);push(sat(S.draw,2.2)*.82);push(sat(S.cyc,3)*.68);push(sat(S.realm,20)*.62);push(sat(S.emb,2)*.58);push(sat(S.seal,3)*.5);
    if((S.buf||0)>0)push(sat(S.buf,Math.max(1,totalDmg*.035))*.85);
    if((S.vuln||0)>0)push(S.vuln>20?sat(S.vuln,Math.max(1,totalDmg*.04))*.88:sat(S.vuln,1.8)*.75);
    parts.sort((a,b)=>b-a);if(!parts.length)return 0;
    return clamp(parts[0]+(parts[1]||0)*.22+(parts[2]||0)*.10);
  }

  function baseEvaluation(x,tl,totalDmg){
    const sem=semanticFeatures(x,tl);
    const out=sat(x.outT||x.val||0,Math.max(1,totalDmg*.075));
    const defenseScale=Math.max(1,totalDmg*.06);
    const def=Math.max(sat(x.sh||0,defenseScale),sat(x.mit||0,defenseScale*.65),sat(x.ctl||0,6)*.82,sat(x.dr||0,1.2)*.75);
    const rawSup=rawSupportScore(x,totalDmg),sup=Math.max(rawSup,sem.support);
    const roles=[out,def,sup].sort((a,b)=>b-a);
    let absolute=roles[0]*.78+(roles[1]||0)*.17+(roles[2]||0)*.05;
    const n=Number(x.g?.n)||0,hasStatic=(x.g?.statics?.length||0)>0;
    if(absolute<18&&(n>0||hasStatic||sem.features.length))absolute=Math.min(35,10+Math.log2(1+n)*6+sem.features.length*4+(hasStatic?5:0));
    return {...x,_sem:sem,_abs:clamp(absolute),_roles:{out,def,sup},_rawSup:rawSup};
  }

  function scoreClass(items,tl,totalDmg){
    const rows=items.map(x=>baseEvaluation(x,tl,totalDmg));
    const maxAbs=Math.max(1,...rows.map(x=>x._abs));
    const ranked=[...rows].sort((a,b)=>b._abs-a._abs);
    for(const x of rows){
      const rank=ranked.indexOf(x),pct=rows.length<=1?.72:1-rank/(rows.length-1),ratio=x._abs/maxAbs;
      const relative=100*(.68*Math.sqrt(Math.max(0,ratio))+.32*pct);
      let score=.72*x._abs+.10*clamp(x.score)+.18*relative;
      if(x._sem.handFloor)score=Math.max(score,x._sem.handFloor);
      if(x._sem.features.some(f=>f.key==='action'))score=Math.max(score,76);
      if(score<12&&((Number(x.g?.n)||0)>0||(x.g?.statics?.length||0)>0))score=12;
      x.enhancedScore=clamp(score);x.enhancedGrade=gradeOf(x.enhancedScore);x.enhancedRelative=relative;
      x.enhancedCats={out:x._roles.out,def:x._roles.def,sup:x._roles.sup};
    }
    return rows.sort((a,b)=>b.enhancedScore-a.enhancedScore||(b.val||0)-(a.val||0));
  }

  function patchGrade(el,grade){if(!el)return;el.className=el.className.replace(/\bg[ABCDE]\b/g,'').trim()+` g${grade}`;el.textContent=grade}
  function sectionByName(root,kind){
    const regs=kind==='wheel'?[/^命轮$/i,/^wheels?$/i]:[/^密契$/i,/^covenants?$/i];
    return [...root.querySelectorAll('.mr2rating')].find(s=>{const h=clean(s.querySelector(':scope>h5')?.textContent||s.querySelector('h5')?.textContent||'');return regs.some(r=>r.test(h))})||null;
  }
  function appendEnhanceDetail(row,x){
    const d=row.querySelector('.mr2rdetail');if(!d)return;d.querySelector('.mr2enhscore')?.remove();
    const box=document.createElement('div');box.className='mr2enhscore';
    const cats=x.enhancedCats||{};const head=document.createElement('div');head.innerHTML=`<b>${ui('增强装备评分','Enhanced gear rating')} ${x.enhancedScore.toFixed(1)}</b> · ${ui('输出','Output')} ${Math.round(cats.out||0)} / ${ui('防御','Defense')} ${Math.round(cats.def||0)} / ${ui('辅助','Support')} ${Math.round(cats.sup||0)} <em>· ${ui('实战贡献 + 被动/条件机制价值 + 同类连续归一化','observed value + passive/conditional mechanics + continuous normalization')}</em>`;box.appendChild(head);
    if(x._sem.features.length){const chips=document.createElement('div');chips.className='mr2enhchips';for(const f of x._sem.features.slice(0,8)){const i=document.createElement('i');if(f.strong)i.classList.add('strong');i.textContent=f.label;chips.appendChild(i)}box.appendChild(chips)}
    const foot=document.createElement('div');foot.style.marginTop='4px';foot.textContent=ui('无法从回放精确归属的静态效果按效果文本与触发证据保守折算；手牌上限、额外行动等行动经济效果使用较高权重。','Static effects that cannot be attributed exactly are conservatively estimated from effect text and trigger evidence; action-economy effects receive higher weight.');box.appendChild(foot);d.prepend(box);
  }
  function patchRatingSection(root,kind,items){
    const sec=sectionByName(root,kind);if(!sec||!items.length)return;
    const byName=new Map(items.map(x=>[clean(x.g?.name),x]));
    const rows=[...sec.querySelectorAll(':scope>details.mr2rrowd')];
    for(const row of rows){const name=clean(row.querySelector('.mr2rn b')?.textContent);const x=byName.get(name);if(!x)continue;row.dataset.enhancedScore=x.enhancedScore.toFixed(3);
      const sb=row.querySelector('.mr2rscore b');if(sb)sb.textContent=x.enhancedScore.toFixed(1);const bar=row.querySelector('.mr2rscore i');if(bar)bar.style.width=`${x.enhancedScore.toFixed(1)}%`;patchGrade(row.querySelector('.mr2grade'),x.enhancedGrade);
      const dims=row.querySelectorAll('.mr2rdims>span');[['out',0],['def',1],['sup',2]].forEach(([k,i])=>{const cell=dims[i];if(!cell)return;cell.classList.remove('na');const b=cell.querySelector('b');if(b)b.textContent=String(Math.round(x.enhancedCats[k]||0))});
      if(!row.querySelector('.mr2enhbadge')){const b=document.createElement('span');b.className='mr2enhbadge';b.textContent=ui('增强','enhanced');row.querySelector('.mr2rn b')?.insertAdjacentElement('afterend',b)}appendEnhanceDetail(row,x);
    }
    const ordered=rows.sort((a,b)=>Number(b.dataset.enhancedScore||-1)-Number(a.dataset.enhancedScore||-1));for(const r of ordered)sec.appendChild(r);
  }

  function makeIcon(src,kind){const span=document.createElement('span');span.className=`mr2ico gi ${kind==='covenant'?'cov':''} mvp`;if(src){const img=document.createElement('img');img.src=src;img.alt='';img.loading='lazy';span.appendChild(img)}return span}
  function patchMvpTile(root,kind,items){
    if(!items.length)return;const best=items[0],cls=kind==='wheel'?'wh':'cov',label=ui(kind==='wheel'?'MVP 命轮':'MVP 密契',kind==='wheel'?'MVP Wheel':'MVP Covenant');const grid=root.querySelector('.mr2mvpgrid');if(!grid)return;
    let tile=grid.querySelector(`.mr2mvp.${cls}`);if(!tile){tile=document.createElement('div');tile.className=`mr2mvp ${cls}`;grid.appendChild(tile)}tile.innerHTML='';
    const tag=document.createElement('div');tag.className='mr2mvptag';tag.textContent=label;tile.appendChild(tag);
    const main=document.createElement('div');main.className='mr2mvpmain';main.appendChild(makeIcon(best.g?.icon,kind));const body=document.createElement('div');const name=document.createElement('b');name.textContent=best.g?.name||'—';const gr=document.createElement('span');gr.className=`mr2grade g${best.enhancedGrade}`;gr.textContent=best.enhancedGrade;name.append(' ',gr);body.appendChild(name);
    const score=document.createElement('span');score.append(ui('综合评分','Score')+' ');const em=document.createElement('em');em.textContent=best.enhancedScore.toFixed(1);score.appendChild(em);score.append(' / 100');body.appendChild(score);
    const small=document.createElement('small');const feats=best._sem.features.slice(0,3).map(f=>f.label).join(' · ');small.textContent=[ui('增强模型','enhanced model'),`${ui('触发','triggers')} ${best.g?.n||0}`,feats].filter(Boolean).join(' · ');body.appendChild(small);main.appendChild(body);tile.appendChild(main);
    if(items.length>1){const subs=document.createElement('div');subs.className='mr2mvpsub';for(const x of items.slice(1,3)){const s=document.createElement('span');const ic=makeIcon(x.g?.icon,kind);ic.classList.remove('mvp');ic.classList.add('xs');s.appendChild(ic);s.append(document.createTextNode(`${x.g?.name||'—'} `));const b=document.createElement('b');b.textContent=x.enhancedScore.toFixed(1);s.appendChild(b);const gg=document.createElement('i');gg.className=`mr2grade g${x.enhancedGrade}`;gg.textContent=x.enhancedGrade;s.append(' ',gg);subs.appendChild(s)}tile.appendChild(subs)}
  }

  function patchModelCopy(root){
    const details=[...root.querySelectorAll('.mr2minor')].find(d=>/评分模型|Rating model/i.test(clean(d.querySelector('summary')?.textContent)));if(!details)return;let note=details.querySelector('.mr2enh-model-note');if(!note){note=document.createElement('p');note.className='mr2enh-model-note';note.style.cssText='margin:10px 0 0;padding:8px 10px;border-left:3px solid rgba(79,208,200,.55);background:rgba(79,208,200,.05);color:#aeb9c8;font-size:11px;line-height:1.65';details.querySelector('.mr2rmodel')?.prepend(note)}if(note)note.textContent=ui('命轮 / 密契现使用增强评分：不再把“达到 2×公平份额”作为主要分数来源，而是连续综合本场可观测贡献、静态/被动效果、触发证据与同类相对表现。手牌上限、算力上限、额外行动、抽牌/减费/复制/回收等行动经济效果会直接进入辅助评分，因此未产生直接伤害的强力辅助装备不再默认接近 0 分。','Wheel/covenant ratings now use a continuous enhanced model combining observed contribution, passive/static effects, trigger evidence and within-class performance. Action-economy effects are explicitly valued.')
  }

  async function imageOf(src){if(!src)return null;return new Promise(resolve=>{const im=new Image();im.crossOrigin='anonymous';im.onload=()=>resolve(im);im.onerror=()=>resolve(null);im.src=src})}
  function rounded(ctx,x,y,w,h,r){const rr=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+rr,y);ctx.arcTo(x+w,y,x+w,y+h,rr);ctx.arcTo(x+w,y+h,x,y+h,rr);ctx.arcTo(x,y+h,x,y,rr);ctx.arcTo(x,y,x+w,y,rr);ctx.closePath()}
  async function downloadMvp(root){
    const cards=[...root.querySelectorAll('.mr2mvpgrid>.mr2mvp')].filter(x=>x.offsetParent!==null||!x.hidden).slice(0,6).map(tile=>{const b=tile.querySelector('.mr2mvpmain b')?.cloneNode(true);b?.querySelector('.mr2grade')?.remove();return {label:clean(tile.querySelector('.mr2mvptag')?.textContent),name:clean(b?.textContent),score:clean(tile.querySelector('.mr2mvpmain span')?.textContent),grade:clean(tile.querySelector('.mr2grade')?.textContent),img:tile.querySelector('.mr2mvpmain img')?.src||''}});
    if(!cards.length)return;const W=1200,H=760,canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;const c=canvas.getContext('2d');
    const bg=c.createLinearGradient(0,0,W,H);bg.addColorStop(0,'#0b111b');bg.addColorStop(.55,'#111827');bg.addColorStop(1,'#241b20');c.fillStyle=bg;c.fillRect(0,0,W,H);
    c.fillStyle='rgba(213,177,118,.06)';c.beginPath();c.arc(1040,80,270,0,Math.PI*2);c.fill();c.strokeStyle='rgba(213,177,118,.18)';c.lineWidth=1;c.beginPath();c.arc(1040,80,215,0,Math.PI*2);c.stroke();
    c.fillStyle='#f3e5c8';c.font='800 34px system-ui, "Microsoft YaHei", sans-serif';c.fillText(ui('忘忘看报 · 战斗回放 MVP','Morimens Weekly · Replay MVP'),54,64);
    const stage=clean(root.querySelector('.mr2btitle b')?.textContent||''),meta=clean(root.querySelector('.mr2btitle small')?.textContent||'');c.fillStyle='#91a0b5';c.font='15px system-ui, "Microsoft YaHei", sans-serif';c.fillText([stage,meta].filter(Boolean).join(' · ').slice(0,105),54,94);
    const cols=3,cw=348,ch=230,gap=24,startX=54,startY=132;const imgs=await Promise.all(cards.map(x=>imageOf(x.img)));
    cards.forEach((x,i)=>{const col=i%cols,row=Math.floor(i/cols),px=startX+col*(cw+gap),py=startY+row*(ch+gap);rounded(c,px,py,cw,ch,18);c.fillStyle='rgba(255,255,255,.045)';c.fill();c.strokeStyle=i===0?'rgba(213,177,118,.48)':'rgba(148,163,184,.18)';c.stroke();c.fillStyle='#d9bd89';c.font='700 13px system-ui, "Microsoft YaHei", sans-serif';c.fillText(x.label||'MVP',px+18,py+28);
      const im=imgs[i];if(im){c.save();rounded(c,px+18,py+48,76,76,14);c.clip();c.drawImage(im,px+18,py+48,76,76);c.restore()}else{rounded(c,px+18,py+48,76,76,14);c.fillStyle='rgba(213,177,118,.08)';c.fill()}
      c.fillStyle='#eef2f7';c.font='800 21px system-ui, "Microsoft YaHei", sans-serif';let name=x.name||'—';if(name.length>16)name=name.slice(0,15)+'…';c.fillText(name,px+110,py+76);c.fillStyle='#8fd8d1';c.font='800 30px system-ui, sans-serif';const sm=(x.score.match(/\d+(?:\.\d+)?/)||[])[0]||'—';c.fillText(sm,px+110,py+113);c.fillStyle='#8290a3';c.font='12px system-ui, "Microsoft YaHei", sans-serif';c.fillText(ui('综合评分 / 100','Composite / 100'),px+110,py+132);c.fillStyle='#ead5ab';c.font='900 32px system-ui, sans-serif';c.fillText(x.grade||'—',px+18,py+181);c.fillStyle='#7e8ca0';c.font='11px system-ui, "Microsoft YaHei", sans-serif';c.fillText(ui('基于回放可观测贡献与机制估值','Replay contribution + mechanics estimate'),px+62,py+178);c.fillText(ui('命轮/密契含静态与条件效果折算','Passive/conditional effects estimated'),px+62,py+197)});
    c.fillStyle='#8d99aa';c.font='13px system-ui, "Microsoft YaHei", sans-serif';c.fillText(ui('仅供娱乐，有很多数据难以计入','For entertainment only; many effects cannot be fully quantified.'),54,H-42);c.textAlign='right';c.fillStyle='#657286';c.font='12px system-ui, sans-serif';c.fillText('© 青灯不弈 · 忘忘看报',W-54,H-42);c.textAlign='left';
    canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a'),uuid=clean(root.querySelector('.mr2bmeta .id b')?.textContent).slice(0,8)||'replay';a.href=url;a.download=`忘忘看报-MVP-${uuid}.png`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)},'image/png');
  }
  function ensureDownload(root){
    const title=root.querySelector('.mr2mvptitle');if(!title||title.querySelector('#mr2DownloadMvp'))return;const wrap=document.createElement('div');wrap.className='mr2mvpactions';const b=document.createElement('button');b.type='button';b.id='mr2DownloadMvp';b.textContent=ui('下载 MVP 图片','Download MVP image');const small=document.createElement('small');small.textContent=ui('仅供娱乐，有很多数据难以计入','For entertainment only; many effects cannot be fully quantified.');wrap.append(b,small);title.appendChild(wrap);b.addEventListener('click',()=>downloadMvp(root));
  }

  async function enhance(){
    const root=document.getElementById('mrReplayResult'),api=window.MorimensReplayReview;if(!root||!api||!root.querySelector('.mr2mvps'))return;const uuid=clean(root.querySelector('.mr2bmeta .id b')?.textContent);if(!uuid||busy)return;const stamp=uuid+'|'+root.querySelectorAll('.mr2rrowd').length;if(stamp===lastStamp&&root.querySelector('#mr2DownloadMvp'))return;busy=true;
    try{const full=await api.fetchReplay(uuid),tl=api.buildTimeline(full),st=api.computeStats(full,tl);const wheels=scoreClass(st.mvp?.wheels||[],tl,st.totalDmg||1),covenants=scoreClass(st.mvp?.covenants||[],tl,st.totalDmg||1);patchRatingSection(root,'wheel',wheels);patchRatingSection(root,'covenant',covenants);patchMvpTile(root,'wheel',wheels);patchMvpTile(root,'covenant',covenants);patchModelCopy(root);ensureDownload(root);lastStamp=stamp;window.MorimensReplayEnhancedScores={uuid,wheels,covenants};}
    catch(err){console.warn('Replay equipment score enhancer failed',err)}finally{busy=false}
  }

  function watch(){ensureStyle();const kick=()=>{if(document.getElementById('mrReplayResult'))enhance()};kick();const mo=new MutationObserver(()=>queueMicrotask(kick));mo.observe(document.documentElement,{subtree:true,childList:true});window.addEventListener('morimens-language-change',()=>{lastStamp='';setTimeout(enhance,0)});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch,{once:true});else watch();
})();

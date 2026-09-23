(()=>{
  'use strict';
  const $=id=>document.getElementById(id);
  const isEnglish=()=>localStorage.getItem('morimens.language')==='en';
  const ui=(zh,en)=>isEnglish()?en:zh;
  const escFile=value=>String(value||'').replace(/[\\/:*?"<>|\s]+/g,'-').replace(/^-+|-+$/g,'').slice(0,48)||ui('未选择','not-selected');
  const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
  const visibleForReport=el=>{
    if(!el||el.type==='hidden'||el.closest('[hidden]'))return false;
    const own=el.getAttribute('style')||'',parent=el.closest('.field,.check,.formGrid,.checkGrid');
    if(/display\s*:\s*none/i.test(own)||/display\s*:\s*none/i.test(parent?.getAttribute('style')||''))return false;
    return true;
  };
  function labelFor(control){
    const explicit=control.id?document.querySelector('label[for="'+CSS.escape(control.id)+'"]'):null;
    if(explicit)return clean(explicit.childNodes.length?Array.from(explicit.childNodes).filter(n=>n.nodeType===Node.TEXT_NODE||n.nodeName!=='SMALL').map(n=>n.textContent||'').join(' '):explicit.textContent);
    const check=control.closest('label.check');
    if(check){
      const clone=check.cloneNode(true);
      clone.querySelectorAll('small,input,select,textarea').forEach(x=>x.remove());
      const text=clean(clone.textContent);
      if(control.type==='number'&&/Stacks$/i.test(control.id||''))return (text||control.id)+ui(' · 层数',' · Stacks');
      return text||control.id||ui('设置','Setting');
    }
    return control.name||control.id||ui('设置','Setting');
  }
  function valueFor(control){
    if(control.type==='checkbox')return control.checked?ui('开启','On'):ui('关闭','Off');
    if(control.type==='radio')return control.checked?ui('选中','Selected'):ui('未选','Not selected');
    if(control.tagName==='SELECT')return clean(control.selectedOptions?.[0]?.textContent||control.value||'—');
    const value=control.value===''?(control.placeholder?(ui('默认 / ','Default / ')+control.placeholder):'—'):control.value;
    return clean(value)+(control.disabled?ui('（自动/锁定）',' (auto/locked)'):'');
  }
  function sectionTitleFor(control){
    const block=control.closest('.builderBlock');
    if(block){
      const title=block.querySelector('.builderTitle span,.builderTitle');
      if(title)return clean(title.textContent);
    }
    const details=control.closest('details.advanced');
    if(details)return clean(details.querySelector('summary')?.textContent||ui('高级 / 手动校准','Advanced / Manual Calibration'));
    const signature=control.closest('.signatureRelicPanel');
    if(signature)return clean(signature.querySelector('.signatureRelicHead strong')?.textContent||ui('维度影像 / 专属造物','Dimensional Image / Signature Creation'));
    return ui('其他设置','Other Settings');
  }
  function collectSettings(panel){
    const groups=new Map();
    const controls=Array.from(panel.querySelectorAll('input,select,textarea')).filter(visibleForReport);
    for(const control of controls){
      if(['button','submit','reset','image','file'].includes(control.type))continue;
      const title=sectionTitleFor(control);
      if(!groups.has(title))groups.set(title,[]);
      groups.get(title).push({label:labelFor(control),value:valueFor(control)});
    }
    return Array.from(groups,([title,rows])=>({title,rows}));
  }
  function collectDescriptions(panel){
    const selectors=[
      '.signatureRelicApplied','.signatureRelicPanel .desc','.builderBlock .desc',
      '#enlightenDesc','#progressionDesc','#characterResourceSummary','#realmSummary',
      '#tentacleReadout','#skeydbBuildText'
    ];
    const seen=new Set(),rows=[];
    for(const el of panel.querySelectorAll(selectors.join(','))){
      if(el.closest('[hidden]'))continue;
      const text=clean(el.textContent);
      if(!text||seen.has(text)||/等待|正在匹配|尚未|选择.+后/.test(text)&&text.length<40)continue;
      seen.add(text);
      let title='';
      if(el.id==='skillDesc')title=ui('技能说明','Skill Description');
      else if(el.id==='skillCoeffSummary')title=ui('技能公式','Skill Formula');
      else if(el.id==='fateDesc')title=ui('命轮说明','Wheel Description');
      else if(el.id==='contractDesc')title=ui('密契说明','Covenant Description');
      else if(el.id==='enlightenDesc')title=ui('启灵说明','Enlighten Description');
      else if(el.id==='progressionDesc')title=ui('成长说明','Progression Description');
      else if(el.classList.contains('signatureRelicApplied'))title=ui('维度影像生效','Dimensional Image Applied');
      else if(el.closest('.signatureRelicPanel'))title=ui('维度影像说明','Dimensional Image Description');
      else {
        const block=el.closest('.builderBlock');
        title=clean(block?.querySelector('.builderTitle span,.builderTitle')?.textContent||ui('说明','Description'));
      }
      rows.push({title,text});
    }
    return rows;
  }
  function collectResult(){
    const mode=clean(document.querySelector('.modeBtn[aria-pressed="true"]')?.textContent||$('resultLabel')?.textContent||ui('期望伤害','Expected Damage'));
    const summary=[
      {label:clean($('resultLabel')?.textContent||mode),value:clean($('resultNumber')?.textContent||'0')},
      {label:ui('非暴击','Non-critical'),value:clean($('normalLine')?.textContent||'—')},
      {label:ui('暴击','Critical'),value:clean($('critLine')?.textContent||'—')},
      {label:ui('期望','Expected'),value:clean($('expectedLine')?.textContent||'—')}
    ];
    const composition=Array.from(document.querySelectorAll('#breakdown .damageCompositionItem')).map(el=>({
      label:clean(el.querySelector('.damageCompositionHead span')?.textContent||ui('伤害构成','Damage Composition')),
      value:clean(el.querySelector('.damageCompositionHead strong')?.textContent||'—'),
      extra:clean(el.querySelector('small')?.textContent||'')
    }));
    const breakdown=Array.from(document.querySelectorAll('#breakdown .step')).map(el=>({
      label:clean(el.querySelector('span')?.textContent||ui('明细','Detail')),
      value:clean(el.querySelector('strong')?.textContent||'—')
    }));
    return {
      mode,summary,composition,breakdown,
      formula:clean($('formula')?.textContent||''),
      note:clean(document.querySelector('[aria-labelledby="calcTitle"] .note')?.textContent||'')
    };
  }
  function wrapLines(ctx,text,maxWidth){
    const raw=String(text||'');
    if(!raw)return [''];
    const paragraphs=raw.split(/\n+/),lines=[];
    for(const paragraph of paragraphs){
      let line='';
      const tokens=paragraph.match(/[\u3400-\u9fff]|[A-Za-z0-9_.+%×/:-]+|\s+|[^\s]/g)||[paragraph];
      for(const token of tokens){
        const next=line+token;
        if(line&&ctx.measureText(next).width>maxWidth){
          lines.push(line.trimEnd());
          line=token.trimStart();
        }else line=next;
      }
      if(line||!paragraph)lines.push(line.trimEnd());
    }
    return lines.length?lines:[''];
  }
  function buildReport(){
    const panel=document.querySelector('[aria-labelledby="calcTitle"]');
    if(!panel)throw new Error(ui('未找到伤害计算器','Damage calculator not found'));
    const char=$('charSelect')?.selectedOptions?.[0]?.textContent||ui('未选择角色','No Awakener selected');
    const skill=$('skillSelect')?.selectedOptions?.[0]?.textContent||ui('未选择技能','No skill selected');
    return {
      title:ui('忘忘看报 · 伤害计算器报告','Morimens Weekly · Damage Calculator Report'),
      subtitle:clean(char)+' · '+clean(skill),
      meta:(isEnglish()?'Exported: ':'导出时间：')+new Date().toLocaleString(isEnglish()?'en-US':'zh-CN',{hour12:false})+(isEnglish()?' · Result mode: ':' · 结果模式：')+collectResult().mode,
      settings:collectSettings(panel),
      descriptions:collectDescriptions(panel),
      result:collectResult(),
      char:clean(char),skill:clean(skill)
    };
  }
  function renderReport(report){
    const W=1500,P=72,GAP=22,CARD=24,COLGAP=36;
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
    const fontStack='"Microsoft YaHei","PingFang SC","Noto Sans CJK SC",system-ui,sans-serif';
    const monoStack='"SFMono-Regular",Consolas,"Liberation Mono",monospace';
    const sections=[];
    const measureTextBlock=(text,width,font,size,lineHeight)=>{
      ctx.font=size+'px '+font;
      const lines=wrapLines(ctx,text,width);
      return {lines,height:lines.length*lineHeight};
    };
    const rowHeight=(row,width)=>{
      ctx.font='21px '+fontStack;
      const l=wrapLines(ctx,row.label,width*0.48-10).length;
      ctx.font='22px '+fontStack;
      const v=wrapLines(ctx,row.value,width*0.52-10).length;
      return Math.max(l,v)*31+10;
    };
    let total=P+60+52+40;
    for(const group of report.settings){
      const inner=W-P*2-CARD*2, colW=(inner-COLGAP)/2;
      let lh=0,rh=0;
      group.rows.forEach((row,i)=>{const h=rowHeight(row,colW);if(i%2===0)lh+=h;else rh+=h});
      const h=56+Math.max(lh,rh)+CARD*2;
      sections.push({type:'settings',group,h});total+=h+GAP;
    }
    if(report.descriptions.length){
      let h=58+CARD*2;
      for(const item of report.descriptions){
        const title=measureTextBlock(item.title,W-P*2-CARD*2,fontStack,20,29);
        const body=measureTextBlock(item.text,W-P*2-CARD*2,fontStack,18,29);
        h+=title.height+body.height+16;
      }
      sections.push({type:'descriptions',h});total+=h+GAP;
    }
    {
      let h=76+CARD*2+140;
      if(report.result.composition.length)h+=54+Math.ceil(report.result.composition.length/2)*62;
      h+=54+report.result.breakdown.reduce((sum,row)=>sum+rowHeight(row,W-P*2-CARD*2),0);
      if(report.result.formula)h+=54+measureTextBlock(report.result.formula,W-P*2-CARD*2,monoStack,17,27).height+20;
      if(report.result.note)h+=measureTextBlock(report.result.note,W-P*2-CARD*2,fontStack,17,27).height+32;
      sections.push({type:'result',h});total+=h+GAP;
    }
    total+=P+54;
    canvas.width=W;canvas.height=Math.max(1000,Math.ceil(total));
    ctx.fillStyle='#090f18';ctx.fillRect(0,0,W,canvas.height);
    const grad=ctx.createLinearGradient(0,0,W,0);grad.addColorStop(0,'rgba(184,143,84,.16)');grad.addColorStop(1,'rgba(65,126,139,.10)');
    ctx.fillStyle=grad;ctx.fillRect(0,0,W,260);
    const rounded=(x,y,w,h,r,fill,stroke)=>{
      ctx.beginPath();
      if(ctx.roundRect)ctx.roundRect(x,y,w,h,r);else ctx.rect(x,y,w,h);
      if(fill){ctx.fillStyle=fill;ctx.fill()}
      if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke()}
    };
    const drawLines=(lines,x,y,lineHeight,fill,font,size)=>{
      ctx.fillStyle=fill;ctx.font=size+'px '+font;
      lines.forEach((line,i)=>ctx.fillText(line,x,y+i*lineHeight));
      return y+lines.length*lineHeight;
    };
    let y=P;
    ctx.fillStyle='#ead8b8';ctx.font='800 38px '+fontStack;ctx.fillText(report.title,P,y+38);
    ctx.fillStyle='#f3f5f8';ctx.font='800 28px '+fontStack;ctx.fillText(report.subtitle,P,y+82);
    ctx.fillStyle='#8592a5';ctx.font='18px '+fontStack;ctx.fillText(report.meta,P,y+116);
    y+=160;
    for(const section of sections){
      rounded(P,y,W-P*2,section.h,20,'rgba(17,24,36,.96)','rgba(205,171,112,.20)');
      let cy=y+CARD;
      if(section.type==='settings'){
        ctx.fillStyle='#e8d6b6';ctx.font='800 24px '+fontStack;ctx.fillText(section.group.title,P+CARD,cy+24);cy+=56;
        const inner=W-P*2-CARD*2,colW=(inner-COLGAP)/2,leftX=P+CARD,rightX=leftX+colW+COLGAP;
        let ly=cy,ry=cy;
        section.group.rows.forEach((row,i)=>{
          const x=i%2===0?leftX:rightX,yy=i%2===0?ly:ry,h=rowHeight(row,colW);
          rounded(x,yy,colW,h-6,12,'rgba(255,255,255,.025)',null);
          ctx.fillStyle='#95a2b4';ctx.font='19px '+fontStack;
          const ll=wrapLines(ctx,row.label,colW*0.46);
          drawLines(ll,x+16,yy+26,27,'#95a2b4',fontStack,19);
          ctx.font='21px '+fontStack;
          const vl=wrapLines(ctx,row.value,colW*0.47);
          const vx=x+colW*0.50;
          drawLines(vl,vx,yy+27,29,'#f0dfbf',fontStack,21);
          if(i%2===0)ly+=h;else ry+=h;
        });
      }else if(section.type==='descriptions'){
        ctx.fillStyle='#e8d6b6';ctx.font='800 24px '+fontStack;ctx.fillText(ui('当前说明与自动解析','Current Descriptions & Auto Parsing'),P+CARD,cy+24);cy+=58;
        for(const item of report.descriptions){
          ctx.fillStyle='#cfb98f';ctx.font='700 19px '+fontStack;ctx.fillText(item.title,P+CARD,cy+20);cy+=32;
          ctx.font='18px '+fontStack;
          const lines=wrapLines(ctx,item.text,W-P*2-CARD*2);
          cy=drawLines(lines,P+CARD,cy+21,29,'#b8c2d0',fontStack,18)+10;
        }
      }else{
        ctx.fillStyle='#e8d6b6';ctx.font='800 24px '+fontStack;ctx.fillText(ui('最终详细结果','Final Detailed Result'),P+CARD,cy+24);cy+=58;
        rounded(P+CARD,cy,W-P*2-CARD*2,128,16,'rgba(143,52,65,.13)','rgba(213,177,118,.18)');
        ctx.fillStyle='#9faabc';ctx.font='18px '+fontStack;ctx.fillText(report.result.summary[0].label,P+CARD+22,cy+29);
        ctx.fillStyle='#f5e4c3';ctx.font='900 42px '+fontStack;ctx.fillText(report.result.summary[0].value,P+CARD+22,cy+76);
        ctx.fillStyle='#c4ccd7';ctx.font='17px '+fontStack;
        ctx.fillText(report.result.summary.slice(1).map(x=>x.value).join('    '),P+CARD+22,cy+108);
        cy+=150;
        if(report.result.composition.length){
          ctx.fillStyle='#cfb98f';ctx.font='700 20px '+fontStack;ctx.fillText(ui('伤害构成','Damage Composition'),P+CARD,cy+20);cy+=34;
          const inner=W-P*2-CARD*2,colW=(inner-COLGAP)/2;
          report.result.composition.forEach((row,i)=>{
            const x=P+CARD+(i%2)*(colW+COLGAP), yy=cy+Math.floor(i/2)*62;
            rounded(x,yy,colW,50,10,'rgba(255,255,255,.025)',null);
            ctx.fillStyle='#adb7c5';ctx.font='18px '+fontStack;ctx.fillText(row.label,x+14,yy+29);
            ctx.fillStyle='#efddb9';ctx.font='700 19px '+fontStack;ctx.textAlign='right';ctx.fillText(row.value+(row.extra?' · '+row.extra:''),x+colW-14,yy+29);ctx.textAlign='left';
          });
          cy+=Math.ceil(report.result.composition.length/2)*62+14;
        }
        ctx.fillStyle='#cfb98f';ctx.font='700 20px '+fontStack;ctx.fillText(ui('事件与数值明细','Event & Value Details'),P+CARD,cy+20);cy+=36;
        const rw=W-P*2-CARD*2;
        for(const row of report.result.breakdown){
          const h=rowHeight(row,rw);
          rounded(P+CARD,cy,rw,h-6,10,'rgba(255,255,255,.022)',null);
          ctx.font='18px '+fontStack;drawLines(wrapLines(ctx,row.label,rw*0.70),P+CARD+14,cy+26,27,'#aeb9c8',fontStack,18);
          ctx.font='20px '+fontStack;ctx.fillStyle='#efddb9';ctx.textAlign='right';ctx.fillText(row.value,P+CARD+rw-14,cy+27);ctx.textAlign='left';
          cy+=h;
        }
        if(report.result.formula){
          cy+=6;ctx.fillStyle='#cfb98f';ctx.font='700 20px '+fontStack;ctx.fillText(ui('计算口径 / 公式说明','Calculation Model / Formula'),P+CARD,cy+20);cy+=34;
          const lines=measureTextBlock(report.result.formula,W-P*2-CARD*2,monoStack,17,27).lines;
          cy=drawLines(lines,P+CARD,cy+20,27,'#b8c2d0',monoStack,17)+12;
        }
        if(report.result.note){
          const lines=measureTextBlock(report.result.note,W-P*2-CARD*2,fontStack,17,27).lines;
          cy=drawLines(lines,P+CARD,cy+18,27,'#8f9cad',fontStack,17)+8;
        }
      }
      y+=section.h+GAP;
    }
    ctx.fillStyle='#657286';ctx.font='16px '+fontStack;ctx.fillText(ui('忘忘看报 · Morimens Weekly · 伤害计算器导出','Morimens Weekly · Damage Calculator Export'),P,canvas.height-P+18);
    ctx.textAlign='right';ctx.fillStyle='#7f8b9e';ctx.font='15px '+fontStack;ctx.fillText('https://qingdengbuyi.top/morimens-tools.html#calc',W-P,canvas.height-P);ctx.fillText('copyright@青灯不弈',W-P,canvas.height-P+24);ctx.textAlign='left';
    return canvas;
  }
  async function downloadReport(){
    const btn=$('downloadDamageReportBtn');
    if(btn?.disabled)return;
    const old=btn?.textContent;
    try{
      if(btn){btn.disabled=true;btn.textContent=ui('正在生成…','Generating…')}
      try{window.MorimensCombatCalculator?.calculate?.()}catch{}
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const report=buildReport(),canvas=renderReport(report);
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error(ui('图片编码失败','Image encoding failed'))),'image/png',0.96));
      const url=URL.createObjectURL(blob),a=document.createElement('a'),now=new Date(),stamp=[
        now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0'),
        '-',String(now.getHours()).padStart(2,'0'),String(now.getMinutes()).padStart(2,'0')
      ].join('');
      a.href=url;a.download=(isEnglish()?'morimens-damage-':'忘忘看报-伤害计算-')+escFile(report.char)+'-'+escFile(report.skill)+'-'+stamp+'.png';
      document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);
    }catch(error){
      console.error('Damage report export failed',error);
      alert((isEnglish()?'Damage calculator image export failed: ':'伤害计算器图片生成失败：')+(error?.message||error));
    }finally{
      if(btn){btn.disabled=false;btn.textContent=old||ui('下载图片','Download Image')}
    }
  }
  function bind(){
    const btn=$('downloadDamageReportBtn');if(!btn||btn.dataset.bound==='1')return;
    btn.dataset.bound='1';btn.addEventListener('click',downloadReport);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
  window.addEventListener('morimens-calculator-ui-ready',bind);
  window.MorimensCalculatorExport={download:downloadReport,buildReport};
})();
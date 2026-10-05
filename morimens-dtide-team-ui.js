(()=>{
  'use strict';
  if(window.__morimensDtideTeamUi)return;
  window.__morimensDtideTeamUi=true;

  const isEn=()=>localStorage.getItem('morimens.language')==='en';
  const ui=(zh,en)=>isEn()?en:zh;
  const clamp=v=>Math.max(0,Math.min(100,Number(v)||0));

  function installStyle(){
    if(document.getElementById('morimensDtideTeamUiStyle'))return;
    const style=document.createElement('style');
    style.id='morimensDtideTeamUiStyle';
    style.textContent=`
      .dtideTeamCompositionPanel{overflow:hidden;border-color:rgba(213,177,118,.22)!important;background:linear-gradient(145deg,rgba(20,28,41,.62),rgba(10,16,26,.58))!important}
      .dtideTeamCompositionPanel>h4{display:flex!important;align-items:center!important;gap:8px!important;flex-wrap:wrap!important;margin-bottom:10px!important}
      .dtideTeamSample{margin-left:auto;padding:4px 8px;border:1px solid rgba(98,183,255,.2);border-radius:999px;background:rgba(98,183,255,.07);color:#9fc8eb;font:700 9px/1.25 inherit;white-space:nowrap}
      .dtideTeamCompositionPanel .dtideSquadList{gap:9px}
      .dtideTeamCompositionPanel .dtideSquadRow{position:relative;grid-template-columns:34px minmax(0,1fr) minmax(84px,auto);gap:10px;padding:10px 11px;border:1px solid rgba(148,163,184,.14);border-radius:12px;background:linear-gradient(135deg,rgba(19,29,44,.94),rgba(11,18,29,.94));box-shadow:inset 0 1px 0 rgba(255,255,255,.025);overflow:hidden}
      .dtideTeamCompositionPanel .dtideSquadRow:before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:rgba(148,163,184,.24)}
      .dtideTeamCompositionPanel .dtideSquadRow:nth-child(1):before{background:#e6bd68}.dtideTeamCompositionPanel .dtideSquadRow:nth-child(2):before{background:#b9c4d1}.dtideTeamCompositionPanel .dtideSquadRow:nth-child(3):before{background:#b78359}
      .dtideTeamCompositionPanel .dtideSquadRank{display:grid;place-items:center;width:27px;height:27px;border-radius:50%;border:1px solid rgba(148,163,184,.2);background:#162131;color:#aeb9c8;font-size:11px;font-weight:900;box-shadow:0 3px 12px rgba(0,0,0,.18)}
      .dtideTeamCompositionPanel .dtideSquadRow:nth-child(1) .dtideSquadRank{border-color:rgba(230,189,104,.54);background:rgba(230,189,104,.13);color:#f4d78f}.dtideTeamCompositionPanel .dtideSquadRow:nth-child(2) .dtideSquadRank{border-color:rgba(185,196,209,.44);background:rgba(185,196,209,.1);color:#d8e0e8}.dtideTeamCompositionPanel .dtideSquadRow:nth-child(3) .dtideSquadRank{border-color:rgba(183,131,89,.46);background:rgba(183,131,89,.11);color:#d9aa82}
      .dtideTeamCore{min-width:0;display:grid;gap:7px}
      .dtideTeamCompositionPanel .dtideSquadMembers{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;min-width:0}
      .dtideTeamCompositionPanel .dtideSquadMember{display:grid;grid-template-columns:36px minmax(0,1fr);align-items:center;gap:6px;min-width:0;padding:4px 6px 4px 4px;border-radius:9px;background:rgba(255,255,255,.028);border:1px solid rgba(148,163,184,.08)}
      .dtideTeamCompositionPanel .dtideSquadMember img{width:36px;height:36px;border-radius:8px;object-fit:cover;background:#0b1220;flex:none}
      .dtideTeamCompositionPanel .dtideSquadMember span{font-size:10px;line-height:1.25;color:#d5dde7;white-space:normal;overflow:visible;text-overflow:clip;word-break:break-word}
      .dtideTeamProgress{height:6px;border-radius:999px;overflow:hidden;background:rgba(148,163,184,.12);box-shadow:inset 0 0 0 1px rgba(255,255,255,.025)}
      .dtideTeamProgress>i{display:block;height:100%;width:calc(var(--dtide-squad-share,0) * 1%);border-radius:inherit;background:linear-gradient(90deg,#668fb2,#d8b36e);box-shadow:0 0 9px rgba(216,179,110,.16)}
      .dtideTeamCompositionPanel .dtideSquadRate{display:grid;align-content:center;justify-items:end;min-width:84px;padding-left:9px;border-left:1px solid rgba(148,163,184,.12);text-align:right;white-space:nowrap}
      .dtideTeamCompositionPanel .dtideSquadRate b{font-size:15px;color:#f0d6a4;font-variant-numeric:tabular-nums;line-height:1.1}.dtideTeamCompositionPanel .dtideSquadRate small{margin-top:4px;font-size:9px;color:#8190a3}
      @media(max-width:900px){.dtideTeamCompositionPanel .dtideSquadMembers{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:620px){.dtideTeamSample{width:100%;margin-left:0}.dtideTeamCompositionPanel .dtideSquadRow{grid-template-columns:30px minmax(0,1fr);align-items:start}.dtideTeamCompositionPanel .dtideSquadRate{grid-column:2;grid-row:2;display:flex;align-items:baseline;justify-content:flex-start;gap:7px;min-width:0;padding:0;border-left:0;text-align:left}.dtideTeamCompositionPanel .dtideSquadMembers{grid-template-columns:repeat(2,minmax(0,1fr))}.dtideTeamCompositionPanel .dtideSquadMember{grid-template-columns:32px minmax(0,1fr)}.dtideTeamCompositionPanel .dtideSquadMember img{width:32px;height:32px}}
    `;
    document.head.appendChild(style);
  }

  function parseRow(row){
    const rateEl=row.querySelector('.dtideSquadRate b');
    const countEl=row.querySelector('.dtideSquadRate small');
    const pct=clamp(parseFloat(String(rateEl?.textContent||'').replace('%','')));
    const count=parseInt(String(countEl?.textContent||'').match(/\d+/)?.[0]||'0',10)||0;
    return {pct,count};
  }

  function sampleCount(rows){
    const estimates=rows.map(parseRow).filter(x=>x.count>0&&x.pct>0).map(x=>Math.round(x.count*100/x.pct)).filter(x=>x>0);
    if(!estimates.length)return 0;
    estimates.sort((a,b)=>a-b);
    return estimates[Math.floor(estimates.length/2)];
  }

  function enhancePanel(panel){
    panel.classList.add('dtideTeamCompositionPanel');
    const title=panel.querySelector('h4');
    const rows=[...panel.querySelectorAll('.dtideSquadList>.dtideSquadRow')];
    const sample=sampleCount(rows);
    let badge=title?.querySelector('.dtideTeamSample');
    if(title&&sample){
      if(!badge){badge=document.createElement('span');badge.className='dtideTeamSample';title.appendChild(badge)}
      badge.textContent=isEn()?`${sample} complete-team samples`:`完整四人队样本 ${sample} 支`;
    }else badge?.remove();
    rows.forEach(row=>{
      const {pct}=parseRow(row);row.style.setProperty('--dtide-squad-share',String(pct));
      const members=row.querySelector(':scope>.dtideSquadMembers');
      if(members&&!row.querySelector(':scope>.dtideTeamCore')){
        const core=document.createElement('div');core.className='dtideTeamCore';members.replaceWith(core);core.appendChild(members);
        const progress=document.createElement('div');progress.className='dtideTeamProgress';progress.setAttribute('aria-hidden','true');progress.innerHTML='<i></i>';core.appendChild(progress);
      }
    });
  }

  function enhance(root=document){
    const panels=[...root.querySelectorAll?.('.dtideInsightPanel')||[]];
    for(const panel of panels){
      const title=String(panel.querySelector('h4')?.textContent||'');
      if(/常用配队\s*Top\s*5|Top\s*5\s*Team\s*Compositions/i.test(title))enhancePanel(panel);
    }
  }

  function attach(){
    installStyle();
    const host=document.getElementById('dtideUsage');
    if(!host)return false;
    enhance(host);
    new MutationObserver(()=>queueMicrotask(()=>enhance(host))).observe(host,{childList:true,subtree:true});
    window.addEventListener('morimens-language-change',()=>setTimeout(()=>enhance(host),0));
    return true;
  }

  if(!attach()){
    const observer=new MutationObserver(()=>{if(attach())observer.disconnect()});
    observer.observe(document.documentElement,{childList:true,subtree:true});
  }
})();

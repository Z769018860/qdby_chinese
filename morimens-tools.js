function setupMorimensCgSlideshow(){
  const layers=[document.getElementById("morimensCgA"),document.getElementById("morimensCgB")];
  if(layers.some(layer=>!layer))return;
  const images=Array.from({length:10},(_,index)=>`assets/morimens/cg/cg-${String(index+1).padStart(2,"0")}.webp`);
  let index=Math.abs(new Date().getDate()-1)%images.length,active=0,timer=null;
  layers[0].style.backgroundImage=`url("${images[index]}")`;
  const schedule=()=>{clearTimeout(timer);timer=setTimeout(showNext,12000)};
  const showNext=()=>{
    if(document.hidden){schedule();return}
    const nextIndex=(index+1)%images.length,nextLayer=layers[1-active],preload=new Image();
    preload.onload=()=>{nextLayer.style.backgroundImage=`url("${images[nextIndex]}")`;requestAnimationFrame(()=>{nextLayer.classList.add("isActive");layers[active].classList.remove("isActive");active=1-active;index=nextIndex;schedule()})};
    preload.onerror=schedule;preload.src=images[nextIndex];
  };
  if(!window.matchMedia("(prefers-reduced-motion: reduce)").matches)schedule();
}
setupMorimensCgSlideshow();

function setupMorimensMascotToggle(){
  const button=document.getElementById("morimensMascotToggle"),image=document.getElementById("morimensMascot");
  if(!button||!image)return;
  const characters=[
    {zh:"杜勒赛因",en:"Doresain",src:"images/杜勒赛因-防御.webp?v=20260918.1"},
    {zh:"卡拉布",en:"Caraboo",src:"images/卡拉布-技能2.webp?v=20260918.1"}
  ];
  let index=image.src.includes("卡拉布")?1:0;
  const isEn=()=>localStorage.getItem("morimens.language")==="en";
  const refreshText=()=>{
    const current=characters[index],next=characters[1-index];
    image.alt=isEn()?current.en:current.zh;
    button.setAttribute("aria-label",isEn()?("Switch to "+next.en):("切换为"+next.zh));
  };
  const preloadMascots=()=>{for(const character of characters){const preload=new Image();preload.src=character.src}};
  if(document.readyState==='complete')(window.requestIdleCallback||setTimeout)(preloadMascots);else window.addEventListener('load',()=>(window.requestIdleCallback||setTimeout)(preloadMascots),{once:true});
  button.addEventListener("click",()=>{
    index=1-index;const current=characters[index];
    button.classList.remove("isSwapping");void button.offsetWidth;button.classList.add("isSwapping");
    image.src=current.src;refreshText();
    setTimeout(()=>button.classList.remove("isSwapping"),450);
  });
  window.addEventListener("morimens-language-change",refreshText);
  refreshText();
}
setupMorimensMascotToggle();

function setupMorimensReplayShell(){
  const tabs=document.getElementById('morimensTabs');
  if(!tabs||document.getElementById('morimensReplayTab'))return;
  const isEn=()=>localStorage.getItem('morimens.language')==='en';
  const ui=(zh,en)=>isEn()?en:zh;
  if(!document.getElementById('morimensReplayShellStyle')){
    const style=document.createElement('style');style.id='morimensReplayShellStyle';style.textContent=`
      .mrReplayShellDemo{display:inline-flex;margin-left:5px;padding:1px 5px;border:1px solid rgba(213,177,118,.32);border-radius:999px;color:#e2c797;font-size:8px;line-height:1.2;vertical-align:1px}
      .mrReplayShell{display:grid;gap:12px}.mrReplayShellIntro{padding:18px;border:1px solid rgba(148,163,184,.14);border-radius:14px;background:linear-gradient(145deg,rgba(20,28,41,.56),rgba(9,15,24,.52))}.mrReplayShellIntro h2{margin:0;color:#ead9b9;font-size:20px}.mrReplayShellIntro p{margin:7px 0 0;color:#8b99ac;font-size:12px;line-height:1.7}
      .mrReplayShellSkeleton{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.mrReplayShellSkeleton i{display:block;height:92px;border:1px solid rgba(148,163,184,.1);border-radius:12px;background:linear-gradient(100deg,rgba(255,255,255,.025) 20%,rgba(255,255,255,.07) 38%,rgba(255,255,255,.025) 56%);background-size:220% 100%;animation:mrReplayShellPulse 1.35s linear infinite}.mrReplayShellState{display:flex;align-items:center;gap:8px;color:#78879a;font-size:11px}.mrReplayShellState:before{content:'';width:7px;height:7px;border-radius:50%;background:#d2ad6c;box-shadow:0 0 10px rgba(210,173,108,.35)}
      @keyframes mrReplayShellPulse{to{background-position:-220% 0}}@media(max-width:700px){.mrReplayShellSkeleton{grid-template-columns:1fr}.mrReplayShellSkeleton i{height:64px}}@media(prefers-reduced-motion:reduce){.mrReplayShellSkeleton i{animation:none}}
    `;document.head.appendChild(style);
  }
  const tab=document.createElement('button');tab.className='morimensTab';tab.id='morimensReplayTab';tab.setAttribute('role','tab');tab.setAttribute('aria-selected','false');tab.setAttribute('aria-controls','morimensReplayPanel');tab.innerHTML=`${ui('战斗回放复盘','Replay Review')}<span class="mrReplayShellDemo">demo</span>`;
  const anchor=document.getElementById('morimensZonesTab')||document.getElementById('morimensDtideTab');anchor?.insertAdjacentElement('afterend',tab)||tabs.appendChild(tab);
  const panel=document.createElement('div');panel.id='morimensReplayPanel';panel.setAttribute('role','tabpanel');panel.hidden=true;panel.innerHTML=`<section class="panel"><div class="mrReplayShell"><div class="mrReplayShellIntro"><h2>${ui('战斗回放复盘','Battle Replay Review')}</h2><p>${ui('复盘标签已就绪。回放解析模块正在异步加载；加载完成后可直接输入 battleUuid 或完整回放码。','The replay tab is ready. The decoder is loading asynchronously; once ready you can enter a battleUuid or full replay code.')}</p></div><div class="mrReplayShellSkeleton"><i></i><i></i><i></i></div><div class="mrReplayShellState">${ui('正在加载回放解码、评分与导出模块…','Loading replay decoder, scoring and export modules…')}</div></div></section>`;
  tabs.insertAdjacentElement('afterend',panel);
  const activate=()=>{
    tabs.querySelectorAll('.morimensTab').forEach(item=>item.setAttribute('aria-selected',String(item===tab)));
    document.querySelectorAll('[role="tabpanel"]').forEach(item=>{if(item.closest('main,body'))item.hidden=item!==panel});
    panel.hidden=false;history.replaceState(null,'','#replay');
  };
  tab.addEventListener('click',activate);
  tabs.addEventListener('click',event=>{const target=event.target.closest('.morimensTab');if(target&&target!==tab){panel.hidden=true;tab.setAttribute('aria-selected','false')}},true);
  if(location.hash==='#replay')activate();
}

(async()=>{
  try{
  const assetVersion="20261006.21";
    window.MorimensDtideRenderer="legacy";
    const urls=[
      "morimens-v03/part1.b64",
      "morimens-v03/part2a.b64",
      "morimens-v03/part2b.b64",
      "morimens-v03/part3a.b64",
      "morimens-v03/part3b.b64",
      "morimens-v03/part4.b64",
      "morimens-v03/part5a.b64",
      "morimens-v03/part5b.b64",
      "morimens-v03/part6.b64"
    ];
    const legacyParts=Promise.all(urls.map(async u=>{
      const r=await fetch(u,{cache:"force-cache"});
      if(!r.ok) throw new Error(`${u}: HTTP ${r.status}`);
      return (await r.text()).replace(/\s+/g,"");
    }));
    await import(`./morimens-dtide-loader.js?v=${assetVersion}`);
    await import(`./morimens-dtide-battle.js?v=${assetVersion}`);
    await import(`./morimens-dtide-battle-ui.js?v=${assetVersion}`);
    await import(`./morimens-dtide-zones.js?v=${assetVersion}`);
    await import(`./morimens-tierlist.js?v=${assetVersion}`);
    await import(`./morimens-summon-calendar.js?v=${assetVersion}`);
    await import(`./morimens-birthday-calendar.js?v=${assetVersion}`);
    await import(`./morimens-dtide.js?v=${assetVersion}`);
    await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
    setupMorimensReplayShell();
    await import(`./morimens-replay-scoring.js?v=${assetVersion}`);
    await import(`./morimens-replay-timeline.js?v=${assetVersion}`);
    const parts=await legacyParts;
    const binary=atob(parts.join(""));
    const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    let code=new TextDecoder("utf-8").decode(bytes);
    window.MorimensFortuneDataOwner="skeydb";
    code=code
      .replace(
        /  const fortune=document\.querySelector\('\.fortuneCard'\);if\(fortune\)fortune\.innerHTML=`[\s\S]*?`;\n}/,
        "}"
      )
      .replace(
        '$(`fortuneBtn`).addEventListener("click",()=>renderFortune(false));$(`rerollBtn`).addEventListener("click",()=>renderFortune(true))',
        ''
      )
      .replace(
        /function renderFortuneProfile\([\s\S]*?\n(?=function bind\()/,
        ''
      )
      .replace(
        "if(rerollSalt===0)renderFortune(false)",
        "if(rerollSalt===0&&!window.MorimensFortuneDataOwner)renderFortune(false)"
      )
      .replace(
        "calculate();renderFortune(false);loadCategoryOptions",
        "calculate();if(!window.MorimensFortuneDataOwner)renderFortune(false);loadCategoryOptions"
      )
      .replace(
        /async function init\(\)\{upgradeUI\(\);populateCharacters\(\);bind\(\);loadCharacter\(\);calculate\(\);[\s\S]*?await loadCharacterRoster\(\)\}\s*init\(\);/,
        "async function init(){upgradeUI()}\ninit();"
      );
    (0,eval)(code);
    await import(`./morimens-data.js?v=${assetVersion}`);
    await import(`./morimens-skeydb.js?v=${assetVersion}`);
    await import(`./morimens-love-ranking.js?v=${assetVersion}`);
    await import(`./morimens-i18n.js?v=${assetVersion}`);
    await import(`./morimens-calculator-formulas.js?v=${assetVersion}`);
    await import(`./morimens-calculator-skeydb.js?v=${assetVersion}`);
    await import(`./morimens-calculator-stats.js?v=${assetVersion}`);
    await import(`./morimens-calculator-realms.js?v=${assetVersion}`);
    await import(`./morimens-calculator-combat.js?v=${assetVersion}`);
    try{await import(`./morimens-calculator-export.js?v=${assetVersion}`)}catch(exportError){console.error("Damage report exporter failed to load",exportError)}
    await import(`./morimens-replay-score-enhancer.js?v=${assetVersion}`);
    await import(`./morimens-replay-export-v2.js?v=${assetVersion}`);
    await import(`./morimens-dtide-usage.js?v=${assetVersion}`);
    await import(`./morimens-dtide-team-ui.js?v=${assetVersion}`);
    await import(`./morimens-dtide-progression-fix.js?v=${assetVersion}`);
    await import(`./morimens-assist-list.js?v=${assetVersion}`);
    const seasonSelect=document.getElementById('dtideSeason');
    const switchLeaderboardRenderer=()=>{
      const useDetailedRenderer=seasonSelect?.value==='legacy-high-difficulty';
      if(useDetailedRenderer){
        delete window.MorimensDtideRenderer;
      }else{
        window.MorimensDtideRenderer='legacy';
      }
    };
    seasonSelect?.addEventListener('change',()=>{
      const before=seasonSelect.value;
      switchLeaderboardRenderer();
      if(before==='legacy-high-difficulty')window.dispatchEvent(new CustomEvent('morimens-dtide-renderer-change'));
    });
    switchLeaderboardRenderer();
  }catch(err){
    document.body.classList.remove("morimensBooting");
    console.error("Morimens loader failed",err);
    const box=document.createElement("div");
    box.style.cssText="position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;padding:12px 14px;border-radius:12px;background:#7f1d1d;color:#fff;font:14px/1.6 system-ui";
    box.textContent=localStorage.getItem("morimens.language")==="en"?"Morimens tools failed to load. Refresh the page or try again later.":"忘却前夜工具加载失败，请刷新页面或稍后再试。";
    document.body.appendChild(box);
  }
})();
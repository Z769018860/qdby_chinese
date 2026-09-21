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
    {name:"杜勒赛因",src:"images/杜勒赛因-防御.gif?v=20260918.1"},
    {name:"卡拉布",src:"images/卡拉布-技能2.gif?v=20260918.1"}
  ];
  let index=0;
  for(const character of characters){const preload=new Image();preload.src=character.src}
  button.addEventListener("click",()=>{
    index=1-index;const current=characters[index],next=characters[1-index];
    button.classList.remove("isSwapping");void button.offsetWidth;button.classList.add("isSwapping");
    image.src=current.src;image.alt=current.name;
    button.setAttribute("aria-label",`切换为${next.name}`);
    setTimeout(()=>button.classList.remove("isSwapping"),450);
  });
}
setupMorimensMascotToggle();

(async()=>{
  try{
  const assetVersion="20260921.154";
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
    await import(`./morimens-dtide.js?v=${assetVersion}`);
    await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
    const parts=await legacyParts;
    const binary=atob(parts.join(""));
    const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    let code=new TextDecoder("utf-8").decode(bytes);
    // The packed legacy bundle still contains its original Wiki-based fortune
    // renderer.  Its asynchronous roster refresh can finish after the SKeyDB
    // renderer and overwrite the selected awakener's Chinese name (most
    // visibly with 杜勒赛因).  Keep the legacy calculator UI bootstrap, but
    // give the ID-aligned SKeyDB module exclusive ownership of Daily Fortune.
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
      // The packed v0.3 bundle still contains the old Wiki-owned calculator.
      // Keep only its DOM bootstrap (upgradeUI); SKeyDB modules below own
      // character/skill selection, coefficients, stats and calculate events.
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
    await import(`./morimens-dtide-usage.js?v=${assetVersion}`);
    const seasonSelect=document.getElementById('dtideSeason');
    const switchLeaderboardRenderer=()=>{
      const isLegacy=seasonSelect?.value==='legacy-high-difficulty';
      if(isLegacy){
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
    box.textContent="忘却前夜工具加载失败 / Morimens tools failed to load. 请刷新页面或稍后再试。";
    document.body.appendChild(box);
  }
})();


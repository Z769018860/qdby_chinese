// 融灾榜单增强：界域/类型筛选 + 命轮比例图例 + 启灵比例颜色同步
(function(){
  const DOMAIN_ICON={
    "混沌":"assets/morimens/domain/chaos.png",
    "深海":"assets/morimens/domain/deepsea.png",
    "血肉":"assets/morimens/domain/flesh.png",
    "超维":"assets/morimens/domain/hyperdimension.png"
  };

  const DOMAINS=["全部","混沌","深海","血肉","超维"];
  const TYPES=["全部","防御型","辅助型","伤害型"];

  const TYPE_COLOR={
    "防御型":"#6fb3ae",
    "辅助型":"#d7a85b",
    "伤害型":"#c75e68"
  };

  const RATE_LEVELS=[
    {label:"0-20%",color:"#9aa0a6"},
    {label:"20-40%",color:"#6fb3ae"},
    {label:"40-60%",color:"#7c8cff"},
    {label:"60-80%",color:"#d7a85b"},
    {label:"80-100%",color:"#c75e68"}
  ];

  function normalizeAwakener(row){
    const name=row.name||row.awakener||row.character||row.cnName||"";
    return {
      ...row,
      normalizedName:name,
      domain:row.domain||row.realm||row.world||"全部",
      type:row.type||row.roleType||row.category||"全部"
    };
  }

  window.MorimensRankFilter={
    domains:DOMAINS,
    types:TYPES,
    normalize:normalizeAwakener,
    filter(list,domain,type){
      return (list||[]).filter(item=>{
        const x=normalizeAwakener(item);
        return (domain==="全部"||!domain||x.domain===domain)&&
          (type==="全部"||!type||x.type===type);
      });
    }
  };

  function rateColor(rate){
    const value=Number(rate)||0;
    if(value<20)return RATE_LEVELS[0].color;
    if(value<40)return RATE_LEVELS[1].color;
    if(value<60)return RATE_LEVELS[2].color;
    if(value<80)return RATE_LEVELS[3].color;
    return RATE_LEVELS[4].color;
  }

  function createBar(rate){
    const wrap=document.createElement("div");
    wrap.className="morimensRateBar";
    const span=document.createElement("span");
    const value=Math.max(0,Math.min(100,Number(rate)||0));
    span.style.width=value+"%";
    span.style.background=rateColor(value);
    wrap.appendChild(span);
    return wrap;
  }

  function createLegend(){
    const box=document.createElement("div");
    box.className="morimensRateLegend";
    RATE_LEVELS.forEach(item=>{
      const el=document.createElement("span");
      el.innerHTML=`<i style="background:${item.color}"></i>${item.label}`;
      box.appendChild(el);
    });
    return box;
  }

  function createDomainIcon(domain){
    const img=document.createElement("img");
    img.className="morimensDomainIcon";
    img.loading="lazy";
    img.src=DOMAIN_ICON[domain]||"";
    img.alt=domain||"";
    img.onerror=()=>{img.style.display="none"};
    return img;
  }

  function injectStyle(){
    if(document.getElementById("morimensRankEnhancerStyle"))return;
    const s=document.createElement("style");
    s.id="morimensRankEnhancerStyle";
    s.textContent=`
      .morimensRateBar{height:8px;width:100%;border-radius:99px;background:rgba(255,255,255,.12);overflow:hidden;margin-top:6px}
      .morimensRateBar span{display:block;height:100%;border-radius:99px}
      .morimensRateLegend{display:flex;gap:12px;align-items:center;font-size:12px}
      .morimensRateLegend span{display:flex;align-items:center;gap:4px}
      .morimensRateLegend i{width:12px;height:12px;border-radius:50%;display:inline-block}
      .morimensDomainIcon{width:24px;height:24px;object-fit:contain;vertical-align:middle;margin-right:6px}
      .morimensTypeTag{display:inline-block;padding:3px 8px;border-radius:99px;border:1px solid rgba(255,255,255,.2);font-size:11px}
      .morimensAwakenFill{border-radius:8px;padding:3px 6px}
    `;
    document.head.appendChild(s);
  }

  function renderAwakenerMeta(node,row){
    const x=normalizeAwakener(row);
    node.dataset.domain=x.domain;
    node.dataset.type=x.type;
    node.appendChild(createDomainIcon(x.domain));
    const tag=document.createElement("span");
    tag.className="morimensTypeTag";
    tag.textContent=x.type;
    tag.style.color=TYPE_COLOR[x.type]||"#fff";
    node.appendChild(tag);
  }

  window.MorimensRankEnhancer={
    createBar,
    createLegend,
    injectStyle,
    renderAwakenerMeta,
    TYPE_COLOR,
    DOMAIN_ICON,
    RATE_LEVELS
  };

  document.addEventListener("DOMContentLoaded",()=>injectStyle());
})();

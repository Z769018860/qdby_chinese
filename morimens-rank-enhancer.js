// 融灾榜单增强：正确界域映射 + 类型全部筛选 + 比例条组件
(function(){
  // 忘却前夜 Wiki 界域
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
    filter(list,domain="全部",type="全部"){
      return (list||[]).filter(item=>{
        const x=normalizeAwakener(item);
        return (domain==="全部"||x.domain===domain)&&
               (type==="全部"||x.type===type);
      });
    }
  };

  function createBar(rate,color){
    const wrap=document.createElement("div");
    wrap.className="morimensRateBar";
    const span=document.createElement("span");
    span.style.width=Math.max(0,Math.min(100,Number(rate)||0))+"%";
    span.style.background=color||"linear-gradient(90deg,#6fb3ae,#e0bd82)";
    wrap.appendChild(span);
    return wrap;
  }

  function createDomainIcon(domain){
    const img=document.createElement("img");
    img.className="morimensDomainIcon";
    img.alt=domain||"";
    const src=DOMAIN_ICON[domain];
    if(!src){
      img.style.display="none";
      return img;
    }
    img.loading="lazy";
    img.src=src;
    img.onerror=()=>{
      img.style.display="none";
    };
    return img;
  }

  function injectStyle(){
    if(document.getElementById("morimensRankEnhancerStyle"))return;
    const s=document.createElement("style");
    s.id="morimensRankEnhancerStyle";
    s.textContent=`
      .morimensRateBar{height:8px;width:100%;border-radius:99px;background:rgba(255,255,255,.12);overflow:hidden;margin-top:6px}
      .morimensRateBar span{display:block;height:100%;border-radius:99px}
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
    createDomainIcon,
    injectStyle,
    renderAwakenerMeta,
    TYPE_COLOR,
    DOMAIN_ICON
  };

  document.addEventListener("DOMContentLoaded",()=>injectStyle());
})();

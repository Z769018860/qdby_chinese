// 融灾榜单增强：界域/类型筛选 + 命轮叠位比例条 + 启灵比例颜色同步
(function(){
  // 使用 wiki 对应界域资源映射，不再使用临时 domain-1/domain-2 图标
  const DOMAIN_ICON={
    "星辰界":"assets/morimens/domain/星辰界.png",
    "深渊界":"assets/morimens/domain/深渊界.png",
    "幻梦界":"assets/morimens/domain/幻梦界.png",
    "永恒界":"assets/morimens/domain/永恒界.png"
  };

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
    normalize:normalizeAwakener,
    filter(list,domain,type){
      return (list||[]).filter(item=>{
        const x=normalizeAwakener(item);
        return (!domain||domain==="全部"||x.domain===domain)&&(!type||type==="全部"||x.type===type);
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
    img.src=DOMAIN_ICON[domain]||"";
    img.alt=domain||"";
    img.onerror=()=>img.style.display="none";
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
    const icon=createDomainIcon(x.domain);
    node.appendChild(icon);
    const tag=document.createElement("span");
    tag.className="morimensTypeTag";
    tag.textContent=x.type;
    tag.style.color=TYPE_COLOR[x.type]||"#fff";
    node.appendChild(tag);
  }

  window.MorimensRankEnhancer={
    createBar,
    injectStyle,
    renderAwakenerMeta,
    TYPE_COLOR,
    DOMAIN_ICON
  };

  document.addEventListener("DOMContentLoaded",()=>injectStyle());
})();

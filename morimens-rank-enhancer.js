// 融灾榜单增强：界域/类型筛选 + 命轮叠位比例条 + 启灵比例颜色同步
(function(){
  const DOMAIN_ICON={
    "界域一":"images/domain/domain-1.png",
    "界域二":"images/domain/domain-2.png",
    "界域三":"images/domain/domain-3.png",
    "界域四":"images/domain/domain-4.png"
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
      domain:row.domain||row.realm||"全部",
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
    if(color)span.style.background=color;
    wrap.appendChild(span);
    return wrap;
  }

  function createDomainIcon(domain){
    const img=document.createElement("img");
    img.className="morimensDomainIcon";
    img.src=DOMAIN_ICON[domain]||"";
    img.alt=domain||"";
    return img;
  }

  function injectStyle(){
    if(document.getElementById("morimensRankEnhancerStyle"))return;
    const s=document.createElement("style");
    s.id="morimensRankEnhancerStyle";
    s.textContent=`
      .morimensRateBar{height:8px;width:100%;border-radius:99px;background:rgba(255,255,255,.12);overflow:hidden;margin-top:6px}
      .morimensRateBar span{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#6fb3ae,#e0bd82)}
      .morimensDomainIcon{width:22px;height:22px;object-fit:contain;vertical-align:middle;margin-right:6px}
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
    if(icon.src)node.appendChild(icon);
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

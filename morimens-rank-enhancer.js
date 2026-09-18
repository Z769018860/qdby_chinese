// 融灾榜单增强：界域/类型筛选 + 命轮叠位比例条
(function(){
  function normalizeAwakener(row){
    const name=row.name||row.awakener||row.character||"";
    return {...row,normalizedName:name,domain:row.domain||"未知界域",type:row.type||row.roleType||"未知类型"};
  }
  window.MorimensRankFilter={
    normalize:normalizeAwakener,
    filter(list,domain,type){
      return list.filter(item=>{
        const x=normalizeAwakener(item);
        return (!domain||domain==="全部"||x.domain===domain)&&(!type||type==="全部"||x.type===type);
      });
    }
  };
  function createBar(rate){
    const wrap=document.createElement("div");
    wrap.className="morimensRateBar";
    wrap.innerHTML=`<span style="width:${Math.max(0,Math.min(100,Number(rate)||0))}%"></span>`;
    return wrap;
  }
  function injectStyle(){
    if(document.getElementById("morimensRankEnhancerStyle"))return;
    const s=document.createElement("style");
    s.id="morimensRankEnhancerStyle";
    s.textContent=".morimensRateBar{height:8px;border-radius:99px;background:rgba(255,255,255,.12);overflow:hidden;margin-top:6px}.morimensRateBar span{display:block;height:100%;background:linear-gradient(90deg,#6fb3ae,#e0bd82)}";
    document.head.appendChild(s);
  }
  window.MorimensRankEnhancer={createBar,injectStyle};
  document.addEventListener("DOMContentLoaded",()=>injectStyle());
})();

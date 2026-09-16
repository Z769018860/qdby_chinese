(async()=>{
  try{
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
    const parts=await Promise.all(urls.map(async u=>{
      const r=await fetch(u,{cache:"no-store"});
      if(!r.ok) throw new Error(`${u}: HTTP ${r.status}`);
      return (await r.text()).replace(/\s+/g,"");
    }));
    const binary=atob(parts.join(""));
    const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    const code=new TextDecoder("utf-8").decode(bytes);
    (0,eval)(code);
    await import(`./morimens-data.js?v=${Date.now()}`);
    await import(`./morimens-skeydb.js?v=${Date.now()}`);
    await import(`./morimens-i18n.js?v=${Date.now()}`);
    await import(`./morimens-calculator-skeydb.js?v=${Date.now()}`);
    await import(`./morimens-calculator-stats.js?v=${Date.now()}`);
  }catch(err){
    console.error("Morimens loader failed",err);
    const box=document.createElement("div");
    box.style.cssText="position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;padding:12px 14px;border-radius:12px;background:#7f1d1d;color:#fff;font:14px/1.6 system-ui";
    box.textContent="忘却前夜工具加载失败 / Morimens tools failed to load. 请刷新页面或稍后再试。";
    document.body.appendChild(box);
  }
})();

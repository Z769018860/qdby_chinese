(()=>{
  const KEY='morimens.language';
  const ZH='zh-CN',EN='en';
  const dict={
    '← 返回个人工具箱':'← Back to Toolbox',
    '忘却前夜伤害计算 & 每日签':'Morimens Damage Calculator & Daily Fortune',
    '角色、技能和每日签资料改为优先读取由 GitHub Actions 从 SKeyDB 同步到本站的静态快照；角色卡面与头像也保存为本站本地静态资源，避免灰机图片接口失效。伤害公式仍保留客户端日志校准层。':'Character, skill, and Daily Fortune data now prioritize static snapshots synchronized from SKeyDB by GitHub Actions. Character cards and portraits are mirrored locally, while damage formulas retain the client-log calibration layer.',
    '角色 → 技能自动倍率':'Character → skill auto scaling',
    '命轮属性自动带入':'Wheel stats auto-applied',
    '密契 3/6 件套':'Covenant 3/6-piece sets',
    '每日签':'Daily Fortune',
    '伤害配装计算器':'Damage Build Calculator',
    '角色、技能、命轮、密契和 Buff 负责“自动带值”；攻击力、力量以及仍未还原的防御系数保留手动输入。同步失败时自动使用内置的已核对样例，不会让页面失效。':'Characters, skills, wheels, covenants, and buffs populate verified values automatically. Attack, Strength, and unresolved defense parameters remain editable. Verified fallback samples are used if synchronization is unavailable.',
    'v0.2 · Wiki 实值 + 客户端术语':'Synced data · Wiki localization + client terminology',
    '① 角色与技能':'① Character & Skill',
    '等待同步':'Waiting for sync',
    '角色':'Character','技能':'Skill','技能等级':'Skill Level','有效攻击力':'Effective ATK','力量 / 临时力量':'Strength / Temporary Strength',
    '先选择角色':'Select a character first','无':'None',
    '当前仍手填；后续可接角色等级/启灵/灵知深化。':'Editable for now; character level, Enlighten, and progression data can be connected later.',
    '按“主动伤害基础项 + 力量”实验处理，可由刻印自动带入。':'Experimental handling: active-damage base term + Strength; can be populated by effects.',
    '选择角色后会尝试从中文维基实时读取技能表，并提取“攻击力*XX%”倍率。':'After selecting a character, the calculator loads synchronized skill data and extracts ATK scaling where available.',
    '尚未请求角色页面':'Character data not requested yet',
    '② 命轮':'② Wheel','固有属性自动计入':'Intrinsic stats applied automatically','命轮':'Wheel',
    '③ 密契':'③ Covenant','密契':'Covenant','3件套':'3-piece','6件套':'6-piece',
    '④ Buff / Debuff':'④ Buff / Debuff','⑤ 高级参数':'⑤ Advanced Parameters','高级参数':'Advanced Parameters',
    '计算伤害':'Calculate Damage','重新计算':'Recalculate','重置':'Reset',
    '伤害结果':'Damage Result','最终伤害':'Final Damage','基础伤害':'Base Damage','暴击伤害':'Critical Damage','普通伤害':'Normal Damage',
    '防御系数':'Defense Multiplier','伤害加成':'Damage Bonus','易伤':'Vulnerability','暴击率':'Crit Rate','暴击伤害加成':'Crit DMG Bonus',
    '今日签文':'Daily Fortune','今日运势':'Daily Fortune','抽取今日签':'Draw Today’s Fortune','再抽一次':'Reroll',
    '换一句角色台词':'Another Voice Line','查看中文维基':'Open Chinese Wiki',
    '数据来源':'Data Sources','来源与校准':'Sources & Calibration','角色头像':'Character Portrait',
    '该角色当前同步数据没有可用台词。':'No synchronized voice line is available for this character.',
    '稀有度':'Rarity','界域':'Realm','类型':'Type','阵营':'Faction','生日':'Birthday','声优':'Voice actor'
  };
  const reverse=Object.fromEntries(Object.entries(dict).map(([a,b])=>[b,a]));
  const realm={CHAOS:'混沌',AEQUOR:'深海',CARO:'血肉',ULTRA:'超维'};
  const type={ASSAULT:'伤害型',WARDEN:'防御型',CHORUS:'辅助型'};
  const normalize=s=>String(s||'').toLowerCase().replace(/[“”"'「」·:：\s_\-]/g,'').replace(/[^a-z0-9\u4e00-\u9fff]/g,'');
  let lang=localStorage.getItem(KEY)||ZH;
  let observer=null;

  function replaceExact(value){
    const raw=String(value??''),trim=raw.trim();if(!trim)return raw;
    const table=lang===EN?dict:reverse;const next=table[trim];if(!next)return raw;
    return raw.replace(trim,next);
  }
  function translateTree(root=document.body){
    if(!root)return;const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    for(const n of nodes){if(n.parentElement?.closest('script,style,code,.formula'))continue;const v=replaceExact(n.nodeValue);if(v!==n.nodeValue)n.nodeValue=v}
    translateCharacterOptions();translateDynamicControls();
  }
  function dataMaps(){
    const data=window.MorimensData;if(!data?.db?.records)return null;
    const byAny=new Map();for(const rec of data.db.records){const zh=data.zhDb?.bySkeydbId?.[rec.id];for(const k of [rec.name,rec.slug,rec.assetSlug,...(rec.aliases||[]),zh?.name,zh?.englishName]){const n=normalize(k);if(n)byAny.set(n,{rec,zh})}}
    return byAny;
  }
  function translateCharacterOptions(){
    const select=document.getElementById('charSelect'),map=dataMaps();if(!select||!map)return;
    for(const opt of select.options){const hit=map.get(normalize(opt.textContent))||map.get(normalize(opt.value));if(!hit)continue;opt.textContent=lang===ZH?(hit.zh?.name||hit.rec.name):hit.rec.name}
  }
  function translateDynamicControls(){
    const quote=document.getElementById('skeydbQuoteBtn');if(quote)quote.textContent=lang===ZH?'换一句角色台词':'Another Voice Line';
    const wiki=document.getElementById('wikiBtn');if(wiki)wiki.textContent=lang===ZH?'查看中文维基':'Open Chinese Wiki';
    document.documentElement.lang=lang;document.title=lang===ZH?'忘却前夜伤害计算 & 每日签':'Morimens Damage Calculator & Daily Fortune';
  }
  function updateSwitch(){
    const zh=document.getElementById('langZh'),en=document.getElementById('langEn');if(!zh||!en)return;
    zh.setAttribute('aria-pressed',String(lang===ZH));en.setAttribute('aria-pressed',String(lang===EN));
  }
  function setLanguage(next){
    if(next!==ZH&&next!==EN)return;lang=next;localStorage.setItem(KEY,lang);updateSwitch();translateTree();window.dispatchEvent(new CustomEvent('morimens-language-change',{detail:{language:lang}}));
  }
  function ensureSwitch(){
    if(document.getElementById('morimensLangSwitch'))return;
    const style=document.createElement('style');style.textContent='.morimens-lang-switch{position:fixed;top:14px;right:16px;z-index:10020;display:flex;gap:4px;padding:4px;border:1px solid rgba(213,177,118,.28);border-radius:12px;background:rgba(12,16,23,.88);backdrop-filter:blur(12px);box-shadow:0 8px 28px rgba(0,0,0,.3)}.morimens-lang-switch button{border:0;border-radius:8px;padding:7px 10px;background:transparent;color:#aeb8c7;font:600 12px/1 system-ui,"Microsoft YaHei",sans-serif;cursor:pointer}.morimens-lang-switch button[aria-pressed="true"]{background:rgba(213,177,118,.18);color:#f4dfb9}.morimens-lang-switch button:focus-visible{outline:2px solid #d5b176;outline-offset:2px}@media(max-width:580px){.morimens-lang-switch{top:8px;right:8px}.morimens-lang-switch button{padding:6px 8px}}';document.head.appendChild(style);
    const box=document.createElement('div');box.id='morimensLangSwitch';box.className='morimens-lang-switch';box.setAttribute('role','group');box.setAttribute('aria-label','Language / 语言');box.innerHTML='<button id="langZh" type="button">中文</button><button id="langEn" type="button">EN</button>';document.body.appendChild(box);
    document.getElementById('langZh').addEventListener('click',()=>setLanguage(ZH));document.getElementById('langEn').addEventListener('click',()=>setLanguage(EN));updateSwitch();
  }
  function boot(){
    ensureSwitch();translateTree();
    observer=new MutationObserver(muts=>{observer.disconnect();for(const m of muts){for(const node of m.addedNodes){if(node.nodeType===Node.TEXT_NODE){const v=replaceExact(node.nodeValue);if(v!==node.nodeValue)node.nodeValue=v}else if(node.nodeType===Node.ELEMENT_NODE)translateTree(node)}}translateCharacterOptions();translateDynamicControls();observer.observe(document.body,{subtree:true,childList:true,characterData:true})});
    observer.observe(document.body,{subtree:true,childList:true,characterData:true});
    window.addEventListener('morimens-data-ready',()=>translateTree());
    window.MorimensI18n={get language(){return lang},setLanguage};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();

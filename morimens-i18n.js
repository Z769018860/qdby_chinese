(()=>{
  const KEY='morimens.language';
  const ZH='zh-CN',EN='en';
  const dict={
    '← 返回个人工具箱':'← Back to Toolbox','忘忘看报':'Wangwang Report',
    '忘却前夜伤害计算 & 每日签':'Morimens Damage Calculator & Daily Fortune',
    '角色、技能和每日签资料改为优先读取由 GitHub Actions 从 SKeyDB 同步到本站的静态快照；角色卡面与头像也保存为本站本地静态资源，避免灰机图片接口失效。伤害公式仍保留客户端日志校准层。':'Character, skill, and Daily Fortune data now prioritize static snapshots synchronized from SKeyDB by GitHub Actions. Character cards and portraits are mirrored locally, while damage formulas retain the client-log calibration layer.',
    '角色 → 技能自动倍率':'Character → skill auto scaling',
    '命轮属性自动带入':'Wheel stats auto-applied',
    '密契 3/6 件套':'Covenant 3/6-piece sets',
    '每日签':'Daily Fortune',
    '伤害配装计算器':'Damage Build Calculator',
    '角色、技能、命轮、密契和 Buff 负责“自动带值”；攻击力、力量以及仍未还原的防御系数保留手动输入。同步失败时自动使用内置的已核对样例，不会让页面失效。':'Characters, skills, wheels, covenants, and buffs populate verified values automatically. Attack, Strength, and unresolved defense parameters remain editable. Verified fallback samples are used if synchronization is unavailable.',
    'v0.2 · Wiki 实值 + 客户端术语':'Synced data · Wiki localization + client terminology',
    '① 角色与技能':'① Character & Skill','等待同步':'Waiting for sync',
    '角色':'Character','技能':'Skill','技能等级':'Skill Level','有效攻击力':'Effective ATK','力量 / 临时力量':'Strength / Temporary Strength',
    '先选择角色':'Select a character first','无':'None','不启用':'Disabled',
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
    '稀有度':'Rarity','界域':'Realm','类型':'Type','阵营':'Faction','生日':'Birthday','声优':'Voice actor',
    '融灾榜单':'D-Zone Leaderboard','伤害计算器':'Damage Calculator','更新日志':'Changelog','关于':'About',
    '公告：':'Notice:','目前只有融灾榜单在维护，其他标签为预留。因为数据更新不稳定，正在与 Eremora 作者沟通合作，所以暂时为 demo 版本。所有数据仅供娱乐，转载请说明来源。':'Only the D-Zone leaderboard is actively maintained; the other tabs are previews. Data synchronization is still being stabilized with the Eremora author, so this remains a demo. Data is for entertainment only; please credit the source when reposting.',
    '关于忘忘看报':'About Wangwang Report','本工具箱为《忘却前夜》玩家制作的粉丝向项目，免费使用，不进行任何商业化运营。':'This fan-made Morimens toolbox is free to use and has no commercial operation.','非官方 · 非商业':'Unofficial · Non-commercial',
    '数据与资料来源':'Data & Sources','特别说明':'Disclaimer','GitHub · 半成品 MMA 工具':'GitHub · Work-in-progress MMA Tool','制作者':'Creator',
    '感谢 Eremora 提供融灾榜单与挑战记录；感谢 dansa/SKeyDB 提供角色、技能、命轮及密契等结构化数据；感谢 忘却前夜中文维基 提供中文名称、资料与文本参考。':'Thanks to Eremora for D-Zone rankings and challenge records, dansa/SKeyDB for structured character, skill, wheel, and covenant data, and the Chinese Morimens Wiki for localized names and reference material.',
    '本页面不是官方产品，与游戏官方及上述数据网站不存在隶属或商业合作关系。《忘却前夜》相关角色、图片、文本及其他素材版权归各自权利方所有；本站仅用于玩家交流与资料查询。':'This is not an official product and has no affiliation or commercial relationship with the game publisher or the data sites above. All Morimens characters, images, text, and assets belong to their respective rights holders. This site is for community reference only.',
    '如果有大佬愿意继续做，可以提供一点微不足道的帮助：':'Contributions to continue this work are welcome:','B站：':'Bilibili: ',
    '记录忘忘看报的重要功能与重大更新。':'Major features and updates for Wangwang Report.','持续更新':'Updated continuously','当前已有功能':'Current Features',
    '2026-09-18 · 搜索与国际化':'2026-09-18 · Search & Internationalization','搜索配队的角色选择改为支持桌面端和移动端的头像多选；新增波次筛选；实装整页中英文切换；新增更新日志标签。':'Character selection in Team Search now uses multi-select portraits on desktop and mobile; added wave filtering, full-page Chinese/English switching, and a Changelog tab.',
    '2026-09-18 · 榜单体验':'2026-09-18 · Leaderboard Experience','恢复旧版稳定页面；增加界域与唤醒体类型筛选、命轮叠位比例条、角色详细启灵颜色、固定范围助战率热力图，并优化多次切换后的缓存与渲染。':'Restored the stable classic layout; added realm and awakener-type filters, wheel stack ratio bars, colored Enlighten details, a fixed-scale assist-rate heatmap, and more reliable caching and rendering after repeated switching.',
    '2026-09-17 · 数据与详情':'2026-09-17 · Data & Details','接入多期融灾数据，提供角色、命轮、造物逐波出场率；角色可展开查看启灵、常用队伍、命轮与密契；角色立绘、命轮和造物可跳转中文维基。':'Added multi-season D-Zone data and per-wave character, wheel, and creation rates. Character rows expand to Enlighten, common teams, wheels, and covenants; character art, wheels, and creations link to the Chinese Wiki.',
    '融灾榜单范围、难度与精确分数筛选；角色界域和类型筛选；角色、命轮、造物榜单；逐波出场率与助战率热力图；启灵及命轮叠位比例；配队搜索与包含/排除角色、波次、等级、启灵、助战、命轮、密契、评分和排名筛选；伤害计算器与每日签。':'Rank-range, difficulty, and exact-score filters; character realm and type filters; character, wheel, and creation leaderboards; per-wave rates and assist heatmaps; Enlighten and wheel-stack ratios; Team Search filters for included/excluded characters, wave, level, Enlighten, assist, wheel, covenant, rating, and rank; Damage Calculator and Daily Fortune.',
    '更新时间节点：9月17日 23:00':'Data updated: Sep 17, 23:00','等待数据':'Waiting for data','期次':'Season','榜单范围':'Rank Range','全部范围（含未知排名）':'All ranks (including unknown)','难度':'Difficulty','全部难度':'All difficulties','普通':'Normal','困难':'Hard','噩梦':'Nightmare','癫狂':'Madness','融灾总得分':'D-Zone Total Score','全部分数':'All scores',
    '唤醒体类型':'Awakener Type','防御型':'Defense','辅助型':'Support','伤害型':'Damage','角色逐波出场率':'Character Rate by Wave','命轮逐波出场率':'Wheel Rate by Wave','造物逐波出场率':'Creation Rate by Wave','角色榜单':'Character Ranking','命轮榜单':'Wheel Ranking','造物榜单':'Creation Ranking','筛选造物':'Filter Creations','启灵颜色图例':'Enlighten Color Legend','命轮叠位颜色图例':'Wheel Stack Color Legend',
    '搜索配队':'Team Search','筛选条件作用于公开的融灾队伍记录；选择角色后可进一步查看其常用队友、命轮与密契。':'Filters apply to public D-Zone team records. Select a character to inspect common teammates, wheels, and covenants.','字段覆盖检查中':'Checking field coverage','包含角色（可多选）':'Include Characters (multi-select)','直接点击头像即可勾选多个角色；再次点击可取消。':'Tap portraits to select multiple characters; tap again to deselect.','角色匹配方式':'Character Match Mode','包含全部所选角色':'Include all selected','包含任一所选角色':'Include any selected','排除角色（可多选）':'Exclude Characters (multi-select)','波次':'Wave','全部波次':'All Waves',
    '最低角色等级':'Minimum Character Level','最高角色等级':'Maximum Character Level','启灵分组':'Enlighten Group','不限':'Any','借用助战':'Borrowed Assist','队伍包含助战':'Team includes assist','队伍不含助战':'Team excludes assist','命轮':'Wheel','密契套装':'Covenant Set','最低密契评分':'Minimum Covenant Rating','最高密契评分':'Maximum Covenant Rating','最低榜单分':'Minimum Score','最高榜单排名':'Maximum Rank','清空筛选':'Clear Filters',
    '混沌':'Chaos','深海':'Deep Sea','血肉':'Flesh','超维':'Hyperdimensional','角色':'Character','造物':'Creation','叠位比例':'Stack Ratio','助战使用率':'Assist Rate','总出现':'Total Appearances','详细启灵比例':'Detailed Enlighten Ratio','启灵分布':'Enlighten Distribution','常用配队 Top 5':'Top 5 Common Teams','完整四人队':'Complete Four-member Teams','最高出场率队友 Top 5':'Top 5 Teammates by Rate','命轮出场率':'Wheel Appearance Rate','密契出场率':'Covenant Appearance Rate',
    '全部':'All','最高分':'Highest Score','记录数':'Records','统计队伍':'Teams Counted','当前范围':'Current Range','暂无':'None','暂无数据':'No data','暂无记录。':'No records.','暂无启灵数据':'No Enlighten data','暂无立绘':'No artwork','点击立绘查看 Wiki':'Open Wiki from artwork','查看 Eremora 原记录':'Open original Eremora record','设置筛选条件后点击“搜索配队”查看结果。':'Set filters, then select “Team Search” to view results.','没有符合这些条件的配队。':'No teams match these filters.','无角色统计。':'No character statistics.','借用助战':'Borrowed Assist','正在载入期次…':'Loading season…','正在载入并整理角色榜单…':'Loading and preparing character ranking…','融灾数据加载失败':'Failed to load D-Zone data','暂无融灾快照':'No D-Zone snapshot is available',
    '更新记录':'Update Notes','更新记录：':'Update Notes:','2026-09-16 · 融灾榜单新增 Top50 / Top200 / Top500 / Top1000（均为 1–N）、普通 / 困难 / 噩梦 / 癫狂出场率、启灵三档分类及角色最高出场率队友；页面拆分为融灾榜单、伤害计算器、每日签三个标签。':'2026-09-16 · Added Top 50 / 200 / 500 / 1000 D-Zone ranges (all 1–N), Normal / Hard / Nightmare / Madness rates, Enlighten grouping, and top teammates; split the page into leaderboard, calculator, and fortune tabs.','正在载入融灾榜单':'Loading D-Zone leaderboard','正在准备标签与本地数据缓存…':'Preparing tabs and local data cache…','切换互动角色':'Switch interactive character',
    '3 / 6 件套分开处理':'Handle 3 / 6-piece sets separately','3 件套':'3-piece Set','6 件套':'6-piece Set','套装件数':'Set Pieces','可叠加':'Stackable','启用条件型 6 件套效果':'Enable conditional 6-piece effect','手动值会与命轮、密契自动值相加':'Manual values are added to automatic wheel and covenant values','高级 / 手动校准字段（自动值会与这里相加）':'Advanced / Manual Calibration (added to automatic values)','技能倍率 %':'Skill Multiplier %','基础伤害 / 基伤增幅 %':'Base Damage / Base DMG Bonus %','伤害强效 %':'Damage Potency %','最终伤害 / 终伤增幅 %':'Final Damage / Final DMG Bonus %','易伤 %':'Vulnerability %','基础 / 手动暴击率 %':'Base / Manual Crit Rate %','基础暴击伤害倍率 %':'Base Crit DMG Multiplier %','防御 / 减伤后系数 %':'Post-defense / Reduction Multiplier %','其他独立乘区 ×':'Other Independent Multiplier ×','幸运乘区':'Fortune Multiplier','刻印：蛮力':'Imprint: Brute Force','获得 8 点力量':'Gain 8 Strength','刻印：高级爆发':'Imprint: Advanced Burst','获得 66 点临时力量':'Gain 66 Temporary Strength','目标：易伤':'Target: Vulnerable','承受的所有伤害提高 50%':'All damage taken +50%','自身：虚弱':'Self: Weakened','造成的所有伤害降低 25%':'All damage dealt -25%','查看角色维基':'Open Character Wiki',
    '选择命轮后读取页面的主属性。条件型特性不会在无法确认触发条件时强制计入。':'Select a wheel to load its main stats. Conditional traits are not applied when their trigger cannot be verified.','选择密契后显示 3 件套 / 6 件套原始效果，并只自动解析明确写出的暴击率、暴击伤害、伤害强效等百分比。':'Select a covenant to display its original 3/6-piece effects. Only explicit Crit Rate, Crit DMG, Damage Potency, and similar percentages are parsed automatically.','装备的“暴击伤害 +X%”会自动加到该倍率上。':'Equipped “Crit DMG +X%” is added to this multiplier automatically.','当前精度边界：':'Current Accuracy Limits:','技能倍率、命轮/密契明确属性以及“易伤 +50% / 虚弱 -25%”来自公开游戏资料，可自动带入；客户端 AssetBundle 中能确认':'Skill multipliers, explicit wheel/covenant stats, and “Vulnerability +50% / Weakened -25%” come from public game data and can be applied automatically; the client AssetBundle confirms','等对象，但上传版本的 Lua 内容仍为字节码/封装状态。因此“力量插入位置、最终伤害/Power/易伤的精确先后、防御公式”仍保留为实验层级，页面会明确展示每一步。':'objects, but the uploaded Lua remains bytecode/wrapped. Therefore Strength placement, the exact order of Final Damage/Power/Vulnerability, and the defense formula remain experimental; each step is shown explicitly.',
    '伤害结果':'Damage Result','非暴击伤害':'Non-critical Damage','期望伤害':'Expected Damage','非暴击：0':'Non-critical: 0','暴击：0':'Critical: 0','期望：0':'Expected: 0','重置配装':'Reset Build','今日关键词':'Today’s Keyword','今日唤醒体':'Today’s Awakener','今日宜':'Recommended Today','今日忌':'Avoid Today','等待抽签':'Waiting for fortune','点击“生成今日签”开始。':'Select “Generate Daily Fortune” to begin.','生成今日签':'Generate Daily Fortune','随机再抽一次':'Random Reroll','每天按日期固定生成一名唤醒体与一支娱乐签；同一天刷新页面不会改变结果。':'An awakener and an entertainment fortune are generated deterministically each day; refreshing on the same day will not change them.','粉丝向免费工具；《忘却前夜》相关角色、图片与游戏素材版权归原权利方所有。':'Free fan-made tool; Morimens characters, images, and game assets belong to their respective rights holders.','例如 200':'e.g. 200','未识别':'Unknown','未知':'Unknown','0～2启':'E0–E2','3启～+3':'E3–+3','0～2叠':'Stack 0–2','3叠～+11':'Stack 3–+11'
  };
  const reverse=Object.fromEntries(Object.entries(dict).map(([a,b])=>[b,a]));
  const normalize=s=>String(s||'').toLowerCase().replace(/[“”"'「」『』·・:：\s_\-]/g,'').replace(/[^a-z0-9\u3400-\u9fff]/g,'');
  let lang=localStorage.getItem(KEY)||ZH;
  let observer=null;

  function replaceDynamic(value){let s=String(value);if(lang===EN){s=s.replace(/^第\s*(\d+)\s*期$/,'Season $1').replace(/^第\s*(\d+)\s*期\s*·\s*(\d+)\s*条(\s*·\s*完整|\s*·\s*部分)?$/,(_,a,b,c)=>`Season ${a} · ${b} records${c?.includes('完整')?' · Complete':c?' · Partial':''}`).replace(/^(\d+(?:\.\d+)?)\s*分$/,'$1 pts').replace(/^(\d+)\s*次$/,'$1 times').replace(/^(\d+)\s*支队伍$/,'$1 teams').replace(/^匹配\s*(\d+)\s*支队伍(?:\s*·\s*当前显示前\s*(\d+)\s*支)?$/,(_,a,b)=>`${a} teams matched${b?` · Showing first ${b}`:''}`).replace(/^当前筛选下暂无匹配角色。$/,'No characters match the current filters.').replace(/^当前口径暂无(.+)详细数据。$/,(_,x)=>`No detailed ${replaceExact(x)} data for the current scope.`).replace(/^当前口径暂无(.+)记录。$/,(_,x)=>`No ${replaceExact(x)} records for the current scope.`)}else{s=s.replace(/^Season\s*(\d+)$/,'第 $1 期').replace(/^Season\s*(\d+)\s*·\s*(\d+)\s*records(\s*·\s*Complete|\s*·\s*Partial)?$/,(_,a,b,c)=>`第 ${a} 期 · ${b} 条${c?.includes('Complete')?' · 完整':c?' · 部分':''}`).replace(/^(\d+(?:\.\d+)?)\s*pts$/,'$1 分').replace(/^(\d+)\s*times$/,'$1 次').replace(/^(\d+)\s*teams$/,'$1 支队伍').replace(/^(\d+)\s*teams matched(?:\s*·\s*Showing first\s*(\d+))?$/,(_,a,b)=>`匹配 ${a} 支队伍${b?` · 当前显示前 ${b} 支`:''}`)}return s}
  function replaceExact(value){const raw=String(value??''),trim=raw.trim();if(!trim)return raw;const table=lang===EN?dict:reverse,next=table[trim];if(next)return raw.replace(trim,next);return raw.replace(trim,replaceDynamic(trim))}
  function translateTree(root=document.body){
    if(!root)return;const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    for(const n of nodes){if(n.parentElement?.closest('script,style,code,.formula'))continue;const v=replaceExact(n.nodeValue);if(v!==n.nodeValue)n.nodeValue=v}
    const elements=root.nodeType===Node.ELEMENT_NODE?[root,...root.querySelectorAll('*')]:[...root.querySelectorAll('*')];for(const el of elements){if(el.closest('script,style,code,.formula'))continue;for(const attr of ['placeholder','title','aria-label'])if(el.hasAttribute(attr)){const old=el.getAttribute(attr),next=replaceExact(old);if(next!==old)el.setAttribute(attr,next)}}
    translateCharacterOptions();translateDynamicControls();
  }
  function dataMaps(){
    const data=window.MorimensData;if(!data?.db?.records)return null;
    const byAny=new Map();for(const rec of data.db.records){const zh=data.zhFor?.(rec)||data.zhDb?.bySkeydbId?.[rec.id]||data.identityDb?.bySkeydbId?.[rec.id];for(const k of [rec.id,rec.name,rec.slug,rec.assetSlug,...(rec.aliases||[]),zh?.name,zh?.englishName]){const n=normalize(k);if(n)byAny.set(n,{rec,zh})}}
    return byAny;
  }
  function translateCharacterOptions(){
    const select=document.getElementById('charSelect'),data=window.MorimensData,map=dataMaps();if(!select||!data?.db?.records||!map)return;
    const byId=new Map(data.db.records.map(rec=>[rec.id,rec]));
    for(const opt of select.options){
      const stableId=opt.dataset?.awakenerId||opt.value||'',rec=byId.get(stableId);
      const hit=rec?{rec,zh:data.zhFor?.(rec)||data.zhDb?.bySkeydbId?.[rec.id]||data.identityDb?.bySkeydbId?.[rec.id]||null}:(map.get(normalize(opt.value))||map.get(normalize(opt.textContent)));
      if(!hit)continue;opt.dataset.awakenerId=hit.rec.id;opt.textContent=lang===ZH?(hit.zh?.name||hit.rec.name):hit.rec.name;
    }
  }
  function translateDynamicControls(){
    const quote=document.getElementById('skeydbQuoteBtn');if(quote)quote.textContent=lang===ZH?'换一句角色台词':'Another Voice Line';
    const wiki=document.getElementById('wikiBtn');if(wiki)wiki.textContent=lang===ZH?'查看中文维基':'Open Chinese Wiki';
    document.documentElement.lang=lang;document.title=lang===ZH?'忘却前夜伤害计算 & 每日签':'Morimens Damage Calculator & Daily Fortune';
  }
  function updateSwitch(){const zh=document.getElementById('langZh'),en=document.getElementById('langEn');if(!zh||!en)return;zh.setAttribute('aria-pressed',String(lang===ZH));en.setAttribute('aria-pressed',String(lang===EN))}
  function setLanguage(next){if(next!==ZH&&next!==EN)return;lang=next;localStorage.setItem(KEY,lang);updateSwitch();translateTree();window.dispatchEvent(new CustomEvent('morimens-language-change',{detail:{language:lang}}))}
  function ensureSwitch(){
    if(document.getElementById('morimensLangSwitch'))return;
    const style=document.createElement('style');style.textContent='.morimens-lang-switch{position:fixed;top:14px;right:16px;z-index:10020;display:flex;gap:4px;padding:4px;border:1px solid rgba(213,177,118,.28);border-radius:12px;background:rgba(12,16,23,.88);backdrop-filter:blur(12px);box-shadow:0 8px 28px rgba(0,0,0,.3)}.morimens-lang-switch button{border:0;border-radius:8px;padding:7px 10px;background:transparent;color:#aeb8c7;font:600 12px/1 system-ui,"Microsoft YaHei",sans-serif;cursor:pointer}.morimens-lang-switch button[aria-pressed="true"]{background:rgba(213,177,118,.18);color:#f4dfb9}.morimens-lang-switch button:focus-visible{outline:2px solid #d5b176;outline-offset:2px}@media(max-width:580px){.morimens-lang-switch{top:8px;right:8px}.morimens-lang-switch button{padding:6px 8px}}';document.head.appendChild(style);
    const box=document.createElement('div');box.id='morimensLangSwitch';box.className='morimens-lang-switch';box.setAttribute('role','group');box.setAttribute('aria-label','Language / 语言');box.innerHTML='<button id="langZh" type="button">中文</button><button id="langEn" type="button">EN</button>';document.body.appendChild(box);
    document.getElementById('langZh').addEventListener('click',()=>setLanguage(ZH));document.getElementById('langEn').addEventListener('click',()=>setLanguage(EN));updateSwitch();
  }
  function boot(){
    ensureSwitch();translateTree();observer=new MutationObserver(muts=>{observer.disconnect();for(const m of muts){for(const node of m.addedNodes){if(node.nodeType===Node.TEXT_NODE){const v=replaceExact(node.nodeValue);if(v!==node.nodeValue)node.nodeValue=v}else if(node.nodeType===Node.ELEMENT_NODE)translateTree(node)}}translateCharacterOptions();translateDynamicControls();observer.observe(document.body,{subtree:true,childList:true,characterData:true})});observer.observe(document.body,{subtree:true,childList:true,characterData:true});window.addEventListener('morimens-data-ready',()=>translateTree());window.MorimensI18n={get language(){return lang},setLanguage};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();

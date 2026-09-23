(()=>{
  const KEY='morimens.language';
  const ZH='zh-CN',EN='en';
  const dict={
    '← 返回个人工具箱':'← Back to Toolbox','忘忘看报':'Morimens Weekly',
    '忘却前夜伤害计算 & 每日签':'Morimens Damage Calculator & Daily Fortune',
    '角色、技能和每日签资料改为优先读取由 GitHub Actions 从 SKeyDB 同步到本站的静态快照；角色卡面与头像也保存为本站本地静态资源，避免灰机图片接口失效。伤害公式仍保留客户端日志校准层。':'Character, skill, and Daily Fortune data now prioritize static snapshots synchronized from SKeyDB by GitHub Actions. Character cards and portraits are mirrored locally, while damage formulas retain the client-log calibration layer.',
    '角色 → 技能自动倍率':'Character → skill auto scaling',
    '命轮属性自动带入':'Wheel stats auto-applied',
    '密契 3/6 件套':'Covenant 3/6-piece sets',
    '每日签':'Daily Fortune',
    '伤害配装计算器':'Damage Build Calculator','主要数据源于：':'Primary data source:','SKeyDB public-v3 · 公式审计版':'SKeyDB public-v3 · audited formulas',
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
    '数据来源':'Data Sources','来源与校准':'Sources & Calibration','角色头像':'Character Portrait','网站访问统计':'Site Visit Statistics','下载当前完整设置与详细伤害结果':'Download the complete current setup and detailed damage results','结果显示模式':'Result Display Mode',
    '该角色当前同步数据没有可用台词。':'No synchronized voice line is available for this character.',
    '稀有度':'Rarity','界域':'Realm','类型':'Type','阵营':'Faction','生日':'Birthday','声优':'Voice actor',
    '融灾榜单':'D-Zone Leaderboard','伤害计算器':'Damage Calculator','更新日志':'Changelog','关于':'About',
    '公告：':'Notice:','目前只有融灾榜单在维护，其他标签为预留。因为数据更新不稳定，正在与 Eremora 作者沟通合作，所以暂时为 demo 版本。所有数据仅供娱乐，转载请说明来源。':'Only the D-Zone leaderboard is actively maintained; the other tabs are previews. Data synchronization is still being stabilized with the Eremora author, so this remains a demo. Data is for entertainment only; please credit the source when reposting.',
    '关于忘忘看报':'About Morimens Weekly','本工具箱为《忘却前夜》玩家制作的粉丝向项目，免费使用，不进行任何商业化运营。':'This fan-made Morimens toolbox is free to use and has no commercial operation.','非官方 · 非商业':'Unofficial · Non-commercial',
    '数据与资料来源':'Data & Sources','特别说明':'Disclaimer','GitHub · 半成品 MMA 工具':'GitHub · Work-in-progress MMA Tool','制作者':'Creator',
    '感谢 Eremora 提供融灾榜单与挑战记录；感谢 dansa/SKeyDB 提供角色、技能、命轮及密契等结构化数据；感谢 忘却前夜中文维基 提供中文名称、资料与文本参考。':'Thanks to Eremora for D-Zone rankings and challenge records, dansa/SKeyDB for structured character, skill, wheel, and covenant data, and the Chinese Morimens Wiki for localized names and reference material.',
    '本页面不是官方产品，与游戏官方及上述数据网站不存在隶属或商业合作关系。《忘却前夜》相关角色、图片、文本及其他素材版权归各自权利方所有；本站仅用于玩家交流与资料查询。':'This is not an official product and has no affiliation or commercial relationship with the game publisher or the data sites above. All Morimens characters, images, text, and assets belong to their respective rights holders. This site is for community reference only.',
    '如果有大佬愿意继续做，可以提供一点微不足道的帮助：':'Contributions to continue this work are welcome:','B站：':'Bilibili: ',
    '记录忘忘看报的重要功能与重大更新。':'Major features and updates for Morimens Weekly.','持续更新':'Updated continuously','当前已有功能':'Current Features',
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
    '伤害结果':'Damage Result','非暴击伤害':'Non-critical Damage','期望伤害':'Expected Damage','非暴击：0':'Non-critical: 0','暴击：0':'Critical: 0','期望：0':'Expected: 0','重置配装':'Reset Build','今日关键词':'Today’s Keywords','今日唤醒体':'Today’s Awakener','角色立绘':'Character Portrait','命轮立绘':'Wheel Artwork','等待抽签':'Waiting for fortune','点击“生成今日签”开始。':'Select “Generate Daily Fortune” to begin.','生成今日签':'Generate Daily Fortune','随机再抽一次':'Random Reroll','每天按日期固定生成一名唤醒体与一支娱乐签；同一天刷新页面不会改变结果。':'An awakener and an entertainment fortune are generated deterministically each day; refreshing on the same day will not change them.','粉丝向免费工具；《忘却前夜》相关角色、图片与游戏素材版权归各自权利方所有。':'Free fan-made tool; Morimens characters, images, and game assets belong to their respective rights holders.','例如 200':'e.g. 200','未识别':'Unknown','未知':'Unknown','0～2启':'E0–E2','3启～+3':'E3–+3','0～2叠':'Stack 0–2','3叠～+11':'Stack 3–+11'
  };
  Object.assign(dict,{
    '今日访问':'Today Visits','总访问':'Total Visits',
    '测试版说明：':'Beta Notice:',
    '角色基础属性、技能与衍生卡、命轮、密契、启灵、灵知觉醒及已接入的角色专属状态会从本地 SKeyDB public-v3 读取并换算。无法从公开数据可靠还原的战斗时序、条件资源、普通深海基础触腕值与官方敌方防御曲线不会擅自补值。':'Base stats, skills and derived cards, wheels, covenants, Enlighten, Rouse, and supported character-specific states are resolved from the local SKeyDB public-v3 snapshot. Combat timing, conditional resources, normal Aequor base Tentacle values, and the official enemy-defense curve are not guessed when public data cannot support them reliably.',
    '目前是测试版本，尽可能做了角色乘区同步，可能有各种问题欢迎反馈。该页面是单次技能/事件计算器，不是完整战斗模拟器；需要“本回合第几张牌、已完成几场战斗、当前资源层数、特定形态”等条件时，只有页面明确提供输入并标注“已接入伤害计算”的项目才会自动计入。':'This is a beta calculator. Character damage layers are synchronized where possible, but issues may remain. It calculates one skill/event at a time rather than simulating a full battle. Conditions such as card order, completed battles, resource stacks, or forms are included only when the page exposes an explicit input marked as connected to the damage calculation.',
    '维度影像 / 专属造物':'Dimensional Image / Signature Creation','正在匹配…':'Matching…','启用当前角色维度影像':'Enable this character’s Dimensional Image',
    '每个唤醒体会自动匹配自己的维度影像。勾选后，可可靠解析且满足条件的属性、伤害、段数和力量效果会进入伤害计算。':'Each Awakener is matched to its own Dimensional Image. When enabled, reliably parsed stat, damage, hit-count, and STR effects whose conditions are satisfied are included.',
    '正在匹配当前角色的维度影像……':'Matching this character’s Dimensional Image…','未启用，不计入伤害。':'Disabled; not included in damage.',
    '默认按 SKeyDB 主属性成长公式自动带入；内在灵格与灵塑也会继续作用于该数值。手动修改后停止自动覆盖。':'Filled automatically from the SKeyDB primary-stat growth formula. Inner Spirit and Soulforge continue to affect this value; manual edits stop automatic overwrites.',
    '主动伤害默认每 1 点力量增加 1 点伤害；若 SKeyDB 明确写 2×、3× 或额外 X% 力量加成，则按该伤害事件自己的力量倍率计算。穿透伤害只有在技能文本明确享受力量时才加入力量。':'Active DMG normally gains 1 damage per 1 STR. If SKeyDB explicitly states 2×, 3×, or an additional STR ratio, that event uses its own STR multiplier. Pierce DMG receives STR only when the source text explicitly says so.',
    '选择角色后从本地 SKeyDB 数据读取完整技能记录，并解析攻击力、界域精通与触腕伤害倍率。':'After selecting a character, full skill records are loaded from the local SKeyDB snapshot and ATK, Realm Mastery, and Tentacle DMG scaling are resolved.',
    '等待解析技能伤害公式…':'Waiting to resolve the skill damage formula…',
    '陨日':'Impending Sun','虔诚的伟力':'Power of the Pious','四月礼赞':'April Tribute','荒原狼':'Steppenwolf','猩红之悸':'Crimson Pulse','再衍化':'Re-evolution',
    '可装备两个不同命轮。主属性按 SKeyDB 命轮成长表读取；文本中可可靠解析的基础伤害、伤害强效、暴击、界域精通及状态倍率会自动计入，条件型效果在无法确认触发条件时只展示、不强制加入。':'Two different wheels can be equipped. Main stats use the SKeyDB wheel growth table; reliably parsed Base DMG, Damage Amplification, Crit, Realm Mastery, and state multipliers are applied automatically. Conditional effects are displayed but not forced when their trigger cannot be verified.',
    '默认按完整 6 件套计算':'Assume a complete 6-piece set','额外条件已满足':'Additional condition is satisfied',
    '默认自动计入 3 件套与 6 件套的无条件效果；只有“敌人生命区间 / 特定状态 / 本回合触发”等条件型效果需要在满足时勾选。':'Unconditional 3-piece and 6-piece effects are applied automatically. Conditional effects such as enemy HP ranges, specific states, or turn triggers require confirmation when satisfied.',
    '选择密契后默认按完整 6 件套读取。无条件效果直接计入；条件型 6 件套效果仅在上方确认后计入。':'A selected Covenant is read as a complete 6-piece set by default. Unconditional effects are applied directly; conditional 6-piece effects are included only after confirmation above.',
    '④ 增益 / 减益':'④ Buffs / Debuffs','标准状态快捷开关':'Standard State Shortcuts','层数':'Stacks',
    '勾选即按主动伤害 / 触腕伤害 -25% 计算；层数留空默认 1。虚弱层数表示剩余层/回合，不会把 -25% 按层重复相乘。':'When enabled, Active DMG / Tentacle DMG is reduced by 25%. An empty stack field defaults to 1. Weak stacks represent remaining stacks/turns; the -25% effect is not multiplied by the stack count.',
    '每层按当前计算器既有口径提供 8 点力量；留空默认 1 层。':'Each stack provides 8 STR under the calculator’s current model; an empty field defaults to 1 stack.',
    '每层按当前计算器既有口径提供 66 点临时力量；留空默认 1 层。':'Each stack provides 66 Temporary STR under the calculator’s current model; an empty field defaults to 1 stack.',
    '勾选后按标准易伤计算；层数留空默认 1。标准易伤对主动伤害 / 触腕伤害的 +50% 只判断“有/无”，不会按层重复叠加；易伤层数只对明确读取层数的角色或技能机制生效，例如艾继丝启灵2的「石质分解」。':'When enabled, standard Vulnerable is applied. An empty stack field defaults to 1. Its +50% effect on Active DMG / Tentacle DMG is binary and does not stack repeatedly; the stack count matters only for mechanics that explicitly read it, such as Aigis E2 Decomposition.',
    '⑤ 核心伤害乘区':'⑤ Core Damage Layers','自动区分局外 / 局内；同作用目标先相加':'Automatically separates out-of-battle / in-battle; same-scope bonuses add first',
    '额外局外基础伤害 %':'Extra Out-of-Battle Base DMG %','额外局内基础伤害 %':'Extra In-Battle Base DMG %',
    '只填页面无法自动读取的额外局外基伤。命轮、密契、角色成长、灵塑等可可靠解析的常驻加成会自动计入，不要重复填写。':'Enter only additional out-of-battle Base DMG that the page cannot read automatically. Reliably parsed permanent bonuses from wheels, covenants, character progression, Soulforge, etc. are already included.',
    '填写本场战斗中已经获得、但页面无法自动判断的基伤，例如临时状态或外部队友效果。页面能识别的“本场战斗 / 本回合 / 触发后 / 累计场次”效果会自动计入。':'Enter Base DMG already gained in the current battle that the page cannot infer, such as temporary states or external teammate effects. Recognized battle/turn/trigger/completed-battle effects are applied automatically.',
    '所有伤害强效来源相加为同一乘区；只作用于“攻击力 × 技能倍率 × 基础伤害阶段”，不会放大力量或其他加算伤害。':'All Damage Amplification sources add within one layer. It applies only to ATK × skill multiplier × Base DMG stages and does not amplify STR or other additive damage.',
    '通用最终伤害增幅 %':'Generic Final DMG Bonus %',
    '手动值视为通用最终伤害池。打击终伤、指令卡终伤、狂气爆发终伤、指定技能终伤等按各自目标池汇总后再彼此相乘。':'The manual value is treated as a generic Final DMG pool. Strike, Command, Exalt, and skill-specific Final DMG pools are summed within their own scope and then multiplied across different scopes.',
    '基础伤害按“局外常驻 → 局内动态”两个阶段依次结算。命轮、密契等已选择配装会自动识别；这里只需要补充无法自动读取的额外数值。':'Base DMG resolves in two stages: permanent out-of-battle bonuses, then dynamic in-battle bonuses. Selected wheels and covenants are recognized automatically; only missing values need manual input.',
    '额外 / 自定义易伤修正 %':'Extra / Custom Vulnerability Modifier %',
    '标准易伤由上方“目标：易伤”勾选自动给出 +50%；这里仅填写遗物、特殊规则或手动校准产生的额外承伤修正。与标准易伤一样，只作用于主动伤害与触腕伤害。':'Standard Vulnerable is supplied automatically by the toggle above (+50%). Enter only extra damage-taken modifiers from relics, special rules, or manual calibration. Like standard Vulnerable, this applies only to Active DMG and Tentacle DMG.',
    '下载图片':'Download Image','整个结果模块会随页面滚动保持可见；回到页面底部时仍停留在原本位置。':'The result module stays visible while scrolling and returns to its normal position at the bottom of the page.',
    '展开详细伤害数据':'Expand Detailed Damage Data','伤害构成 · 事件明细 · 公式':'Damage Composition · Event Details · Formula',
    '计算提示：':'Calculation Note:','结果适合用于配装比较；特殊触发条件与防御系数请按实际战斗情况校准。':'Results are intended for build comparison. Calibrate special triggers and defense coefficients against the actual battle state.',
    '今日运势报告':'Daily Fortune Report','读取本地快照…':'Reading local snapshot…','下载今日签':'Download Fortune',
    '今日命轮':'Today’s Wheel','等待启示':'Awaiting Omen','正在结合当期出场率解读今日签词……':'Interpreting today’s fortune with current-season appearance rates…',
    '塔罗 · 命运之轮':'Tarot · Wheel of Fortune','等待生成':'Waiting','今日幸运乘区':'Today’s Lucky Multiplier',
    '今日推荐':'Today’s Recommendation','根据今日唤醒体与命轮生成':'Generated from today’s Awakener and Wheel',
    '今日挑战':'Today’s Challenge','完成一次融灾挑战':'Complete one D-Zone challenge','角色语录':'Character Quote','正在读取角色语音快照…':'Reading character voice snapshot…',
    '签级结合当前融灾期唤醒体出场率排名与当日运势生成，仅供娱乐。':'The fortune tier combines the current D-Zone appearance ranking with today’s seed and is for entertainment only.',
    '查看今日运势':'View Today’s Fortune',
    '© 2026 青灯不弈 · 忘忘看报':'© 2026 青灯不弈 · Morimens Weekly','粉丝向免费工具；':'Free fan-made tool;','《忘却前夜》':'Morimens','相关角色、图片与游戏素材版权归原权利方所有。':'characters, images, and game assets belong to their respective rights holders.',
    '爱的节奏榜':'Love Rhythm Ranking','留言板':'Guestbook','自动局外基础伤害':'Auto Out-of-Battle Base DMG','自动局内基础伤害':'Auto In-Battle Base DMG',
    '未启灵':'No Enlighten','灵知觉醒已发动':'Rouse Active','本次实际伤害段数':'Actual Hit Count','按技能默认/最低段数':'Use skill default/minimum hits',
    '内在灵格':'Inner Spirit','灵塑':'Soulforge','限定唤醒体的内在灵格固定为 5，不可调整':'Limited Awakeners have Inner Spirit fixed at 5.'
  });
  Object.assign(dict,{
    '角色名和命轮名点开有详情':'Character and Wheel names open detailed views',
    '旧版融灾425出场率在线文档':'Legacy D-Zone 425 appearance-rate document',
    '视频发布：查看本次更新介绍':'Video: view this update overview',
    '我不是数据的制造者，我只是节奏的搬运工。':'I do not create the data; I only relay the meta.',
    '没有一无是处的唤醒体，只有恨铁不成钢的守密人。':'There are no completely useless Awakeners—only Keepers wishing they performed better.',
    '等待载入角色数据……':'Waiting for character data…',
    '欢迎在这里交流《忘却前夜》、融灾榜单、角色配置与网页建议。留言由 Waline 提供在线存储，可跨设备查看。':'Discuss Morimens, D-Zone rankings, character builds, and site feedback here. Messages are stored by Waline and can be viewed across devices.',
    '2026-09-21 · 伤害计算器审查与精简':'2026-09-21 · Damage Calculator Audit & Cleanup',
    '继续同步 SKeyDB 角色、衍生卡、启灵、灵知觉醒、跨战斗成长、界域与状态伤害逻辑；修复衍生卡力量倍率与超限解析，统一灵知觉醒开关，密契默认按完整 6 件套计算；移除我方献祭层数、延迟献祭及仅用于记录但不参与当前伤害公式的冗余状态输入。':'Continued synchronizing SKeyDB Awakeners, derived cards, Enlighten, Rouse, cross-battle growth, Realm, and status-damage logic; fixed derived-card STR scaling and Over-Exalt parsing, unified the Rouse switch, defaulted Covenants to full 6-piece sets, and removed redundant state inputs that do not participate in the current damage formula.',
    '2026-09-21 · 融灾榜单数据与筛选修复':'2026-09-21 · D-Zone Data & Filter Fixes',
    '统一搜索配队与榜单统计的数据口径：当前期按 UID 合并基础缓存与 Top500 增量，并同步最新排名；角色身份统一映射到 SKeyDB canonical ID，修复同一角色因游戏 ID、英文名或中文名不同而被拆分统计的问题，同时统一队伍去重、Top5 队友、助战率等统计口径。':'Unified Team Search and leaderboard statistics: current-season base cache and Top 500 delta are merged by UID with the latest ranks; character identity is normalized to SKeyDB canonical IDs to prevent duplicate statistics caused by game IDs or localized names; team deduplication, Top 5 teammates, and assist-rate definitions are also aligned.',
    '2026-09-20 · 留言板头像与表情':'2026-09-20 · Guestbook Avatars & Emotes',
    '匿名头像池扩展为全部已上传角色头像，并改为按昵称固定映射；主页与忘忘看报留言板接入《忘却前夜》自定义表情包。':'Expanded anonymous avatars to all uploaded character portraits with nickname-stable mapping; added custom Morimens emotes to the homepage and Morimens Weekly guestbook.',
    '2026-09-20 · 爱的节奏榜':'2026-09-20 · Love Rhythm Ranking',
    '新增全角色赞踩榜：按“赞 − 踩”净分实时排序，使用热力图显示正负热度，投票数据通过 Waline 在线计数跨设备同步。':'Added an all-character love/block ranking sorted live by net score, with a positive/negative heatmap and cross-device counters synchronized through Waline.',
    '2026-09-20 · 旧版融灾425榜单':'2026-09-20 · Legacy D-Zone 425 Ranking',
    '旧版融灾高难出场率统一更名为“旧版融灾425出场率”；旧版数据没有造物榜单，点击“造物榜单”时改为显示空状态，不再错误复用角色榜单。':'Renamed the legacy high-difficulty D-Zone view to “Legacy D-Zone 425 Appearance Rate.” The legacy dataset has no Creation ranking, so that tab now shows an empty state instead of reusing the Character ranking.',
    '2026-09-19 · 榜单图片下载':'2026-09-19 · Leaderboard Image Export',
    '为角色、命轮、造物及旧版融灾榜单增加“下载图片”功能；图片按照当前筛选与排序后的实时表格生成，并在右下角加入网站地址与 copyright@青灯不弈 水印。':'Added image export for Character, Wheel, Creation, and legacy D-Zone rankings. Images use the currently filtered/sorted table and include the site address plus the copyright@青灯不弈 watermark.',
    '当前为全部范围，统计所有已下载用户，并包含暂时无法匹配榜单名次的用户。':'All-ranks mode includes every downloaded user, including users whose leaderboard rank cannot currently be matched.',
    '平均出场率':'Average Appearance Rate','命轮逐期高难出场率':'Wheel High-Difficulty Rate by Period',
    '旧版融灾425出场率（来源：@却尘）':'Legacy D-Zone 425 Appearance Rate (source: @却尘)',
    '统计命轮':'Wheels Counted','高难出场率':'High-Difficulty Appearance Rate',
    '旧版融灾425出场率暂无造物榜单数据。':'No Creation ranking data is available for the legacy D-Zone 425 dataset.',
    '旧版融灾425出场率没有可用的造物榜单数据，因此该榜单保持为空。':'The legacy D-Zone 425 dataset has no usable Creation ranking data, so this ranking remains empty.',
    '角色逐期高难出场率':'Character High-Difficulty Rate by Period','统计角色':'Characters Counted',
    '当前口径暂无命轮记录。':'No Wheel records for the current scope.','当前口径暂无造物记录。':'No Creation records for the current scope.','当前口径暂无记录。':'No records for the current scope.',
    '暂无出场记录':'No appearance record','启灵数据缺失':'Enlighten data unavailable',
    '点击切换升降序':'Toggle ascending / descending','点击展开该角色的 Top5 队友、命轮和密契出场率':'Open this character’s Top 5 teammates, Wheels, and Covenants',
    '展开 Top5 队友 / 命轮 / 密契':'Open Top 5 teammates / Wheels / Covenants',
    '当前快照尚未由结构化 __data.json 重建；下一次同步后会自动启用命轮、密契与启灵统计。':'This snapshot has not yet been rebuilt from structured __data.json. Wheel, Covenant, and Enlighten statistics will become available after the next synchronization.',
    '启灵分组 · 角色槽位分布':'Enlighten Group · Character Slot Distribution','命轮 · 队伍采用率':'Wheel · Team Adoption Rate','密契套装 · 队伍采用率':'Covenant Set · Team Adoption Rate',
    '当前筛选下该角色没有记录。':'No records for this character under the current filters.',
    '出现次数 / 等级':'Appearances / Level','该角色启灵分组':'Character Enlighten Groups','该角色命轮采用率':'Character Wheel Adoption Rate','该角色密契套装采用率':'Character Covenant Adoption Rate',
    '密契评分':'Covenant Rating','命轮：':'Wheel: ','密契：':'Covenant: ',
    '该角色样本':'Character Sample','支队伍':'teams','Top5 队友出场率':'Top 5 Teammate Appearance Rate',
    '角色榜单数据':'Character Ranking Data','命轮榜单数据':'Wheel Ranking Data','造物榜单数据':'Creation Ranking Data',
    '全部范围':'All Ranks','全部范围（含未知排名）':'All Ranks (including unknown ranks)',
    '当前筛选下暂无匹配角色。':'No characters match the current filters.',
    '下载表格图片失败':'Failed to export table image','图片生成失败':'Image generation failed',
    '正在载入角色与投票数据……':'Loading character and vote data…','角色资料尚未加载':'Character data has not loaded yet',
    '爱的节奏榜加载失败，请稍后重试。':'Failed to load Love Rhythm Ranking. Please try again later.','同步失败，请稍后重试':'Sync failed. Please try again later.',
    '正在生成…':'Generating…','请先生成今日签':'Generate the Daily Fortune first','浏览器不支持图片导出':'This browser does not support image export','图片生成失败':'Image generation failed'
  });
  const reverse=Object.fromEntries(Object.entries(dict).map(([a,b])=>[b,a]));
  const normalize=s=>String(s||'').toLowerCase().replace(/[“”"'「」『』·・:：\s_\-]/g,'').replace(/[^a-z0-9\u3400-\u9fff]/g,'');
  let lang=localStorage.getItem(KEY)||ZH;
  let observer=null;

  function replaceDynamic(value){
    let s=String(value);
    if(lang===EN){
      s=s
        .replace(/^第\s*(\d+)\s*期$/,'Season $1')
        .replace(/^第\s*(\d+)\s*期\s*融灾\s*·\s*(.+)$/,'Season $1 D-Zone · $2')
        .replace(/^第\s*(\d+)\s*期\s*·\s*(\d+)\s*条(\s*·\s*完整|\s*·\s*部分)?$/,(_,a,b,c)=>`Season ${a} · ${b} records${c?.includes('完整')?' · Complete':c?' · Partial':''}`)
        .replace(/^第\s*(\d+)\s*期\s*·\s*(.+?)\s*·\s*(Top\s*\d+|全部范围)$/i,(_,a,b,d)=>`Season ${a} · ${replaceExact(b)} · ${replaceExact(d)}`)
        .replace(/^(\d+(?:\.\d+)?)\s*分$/,'$1 pts')
        .replace(/^(\d+)\s*次$/,'$1 times')
        .replace(/^(\d+)\s*支队伍$/,'$1 teams')
        .replace(/^匹配\s*(\d+)\s*支队伍(?:\s*·\s*当前显示前\s*(\d+)\s*支)?$/,(_,a,b)=>`${a} teams matched${b?` · Showing first ${b}`:''}`)
        .replace(/^共\s*(\d+)\s*个条目\s*·\s*按\s*(.+?)\s*排序\s*·\s*数据跨设备同步$/,(_,a,b)=>`${a} entries · Sorted by ${b} · Synced across devices`)
        .replace(/^当前快照实际抓取到的最高榜单名次为\s*#?([^。]+)。Top\s*(\d+)\s*统计目前属于不完整样本。$/,(_,a,b)=>`The current snapshot reaches rank #${a}. Top ${b} statistics are currently based on an incomplete sample.`)
        .replace(/^当前\s*Top\s*(\d+)\s*已覆盖\s*(\d+)\/(\d+)\s*名玩家；出场率按该榜单范围计算。$/,(_,a,b,d)=>`Top ${a}: ${b}/${d} players are covered; appearance rates use this rank range.`)
        .replace(/^当前筛选下暂无匹配角色。$/,'No characters match the current filters.')
        .replace(/^当前口径暂无(.+)详细数据。$/,(_,x)=>`No detailed ${replaceExact(x)} data for the current scope.`)
        .replace(/^当前口径暂无(.+)记录。$/,(_,x)=>`No ${replaceExact(x)} records for the current scope.`)
        .replace(/^(.+?)\s*·\s*(\d+)\s*次\s*·\s*展开 Top5 队友 \/ 命轮 \/ 密契$/,(_,name,n)=>`${name} · ${n} times · Open Top 5 teammates / Wheels / Covenants`)
        .replace(/^(.+?)\s*·\s*各期出场率排名变化$/,(_,name)=>`${name} · Appearance-rank changes by period`)
        .replace(/^(.+?)各期排名折线图$/,(_,name)=>`${name} rank trend by period`);
    }else{
      s=s
        .replace(/^Season\s*(\d+)$/,'第 $1 期')
        .replace(/^Season\s*(\d+)\s*D-Zone\s*·\s*(.+)$/,'第 $1 期融灾 · $2')
        .replace(/^Season\s*(\d+)\s*·\s*(\d+)\s*records(\s*·\s*Complete|\s*·\s*Partial)?$/,(_,a,b,c)=>`第 ${a} 期 · ${b} 条${c?.includes('Complete')?' · 完整':c?' · 部分':''}`)
        .replace(/^(\d+(?:\.\d+)?)\s*pts$/,'$1 分')
        .replace(/^(\d+)\s*times$/,'$1 次')
        .replace(/^(\d+)\s*teams$/,'$1 支队伍')
        .replace(/^(\d+)\s*teams matched(?:\s*·\s*Showing first\s*(\d+))?$/,(_,a,b)=>`匹配 ${a} 支队伍${b?` · 当前显示前 ${b} 支`:''}`);
    }
    return s
  }
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
    document.documentElement.lang=lang;document.title=lang===ZH?'忘忘看报 · Morimens Weekly':'Morimens Weekly';
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
    ensureSwitch();translateTree();observer=new MutationObserver(muts=>{observer.disconnect();for(const m of muts){for(const node of m.addedNodes){if(node.nodeType===Node.TEXT_NODE){const v=replaceExact(node.nodeValue);if(v!==node.nodeValue)node.nodeValue=v}else if(node.nodeType===Node.ELEMENT_NODE)translateTree(node)}}translateCharacterOptions();translateDynamicControls();observer.observe(document.body,{subtree:true,childList:true,characterData:true})});observer.observe(document.body,{subtree:true,childList:true,characterData:true});window.addEventListener('morimens-data-ready',()=>translateTree());window.MorimensI18n={get language(){return lang},setLanguage,t:replaceExact,translateTree};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();


# 战斗回放复盘：两边改动同步说明（Claude 侧 ↔ WorkBuddy 侧）

> 截至 2026-10-26。`main` 与 `preview` 在代码 / 文档层面已完全一致（`git diff origin/main origin/preview -- '*.js' '*.html' '*.py' '*.md'` 为空），差别只剩机器人提交的数据快照。
> 本文件由 Claude 侧撰写，WorkBuddy 侧新增改动时请在 §3 / §6 追加，保持两边口径一致。

## 1. 分工与文件归属

| 区域 | 主要文件 | 备注 |
| --- | --- | --- |
| 回放解码 / 时间线 / 归因 / 统计 | `morimens-replay-review-v2.js`（约 526 KB，单行很长） | 两边都改；合并冲突最多 |
| 评分模型（唤醒体 / 命轮密契造物 / 守密人 / 幸运） | `morimens-replay-scoring.js` | 两边都改 |
| 导出（MVP 图 / 简要时间轴 PNG） | `morimens-replay-export-v2.js` | Claude 侧改 |
| 战斗数据榜 | `morimens-dtide-battle.js`、`morimens-dtide-battle-ui.js` | Claude 侧改 |
| 助战列表 | `morimens-assist-list.js`、`scripts/build_assist_index.mjs`、`.github/workflows/build-assist-index.yml` | Claude 侧改 |
| 反馈汇总 | `scripts/archive_morimens_waline.py`、`data/morimens/community/replay-feedback.json` | Claude 侧改 |
| 审计记录 | `data/morimens/replay/review-audit-20261015.md`（Claude）、README / 各轮提交说明（WorkBuddy） | |
| 批量审计脚本 | `scripts/replay_audit/audit.js`（新增，见 §7） | 两边可共用 |

**版本号**：`morimens-tools.js` 的 `assetVersion`、`morimens-tools.html`、`morimens-replay-timeline.js` 三处必须同值（现为 `20261026.1`）。每次发版两边都会改这三行，**合并冲突几乎只会出在这里**——冲突时取较新的并整体再加一档，不要保留旧值，否则线上浏览器会读到旧模块。

## 2. Claude 侧改动（2026-10-05 → 10-26，按主题）

### 回放复盘归因与评分
- **暴击 / 幸运**：每次命中用有效暴击率（面板 + 爆发 / 打击 / 卡牌加成）；强制暴击、无技能配置的命中不计；新增“不幸”侧（高暴击不暴击、死亡抵抗未触发就战败等）；守密人评分加暴击溢出分量。
- **不可暴击的伤害**（10-16）：回放伤害事件自带 `damageType`——1 主动、3 被动状态可暴击；**2 持续伤害（中毒 / 反击类）和 6 固定伤害从不暴击**（120 场 2000+ 次命中 0 暴击）。`hitLog` 新增字段 `dt`，`critExcluder`、暴击溢出、暴击率增益估值都按 `dt===2||dt===6` 排除；另有“技能伤害指令全是固定 / 真实伤害”的技能级判定（`noCritSkills`）。
- **增益归因溢出**：一次命中上各增益份额之和不得超过该命中的 95%（`calibrateHits` 里 `fracs` 等比缩放）。
- **银钥能量**：被“效果类型不符”校验清零的银钥转入常驻来源（`passiveSupport`），不再丢失；命轮 / 密契通道总量抬高时以回放里银钥获得事件总量封顶（`tl.keTotal`，`keyXfer` 回退）；一条指令含多行同类效果时记录总量只计一次；维度影像·拉蒙娜按固定金额事件认领，克莱门汀按“效果次数 +1”分一半；猩红之拥这类文字写明固定银钥的密契按金额 + 持有者认领。
- **命轮 / 造物**：命轮专属卡（“将 1 张「春之信」加入牌库”）打出后的银钥 / 算力 / 抽牌记到命轮（`play.ownerKey`、`cardOwnerKey`）；命轮触发同一时刻产生的临时力量 / 暴击增益记到命轮（不再只认唤醒体来源）；“费用 −1”类（往昔的花与诗等）按文字 + 实际触发估算；合成造物记录改取带描述的状态（故人的怀表+）；**造物也走“语义 + 实测”评分**（此前只有命轮 / 密契走，造物均分 21，现 52）。
- **唤醒体辅助分**：`sup` = 0.7×加权平均 + 0.3×最强三项，避免单项专精型被 12 个子项平均埋掉。
- **其他**：死亡抵抗按面板 × 0.5^(进入首领战前已触发次数 + 本场序号 − 1) 计算，头部总数 = 战前次数 + 本场事件；原初混沌 / 晦暝深海的额外加成记到界域内唤醒体；侵蚀 / 血池、胚胎、超维空间牌流、触腕伤害折算；MVP 图每个唤醒体显示得分最高的两项；简要时间轴 PNG；危险等级 G 档显示 ▼。

### 战斗数据榜 / 助战列表 / 加载
- 玩家名点击展开全部配队（按禁区 / Wave 分组，卡片样式与“极值队伍”一致，成员显示 Lv·启灵、命轮叠位、密契件数）；玩家表首批 200 条，“显示更多”每次 +200。
- 助战列表：期次随 `data/morimens/eremora/manifest.json` 自动生成（现含 71）；命轮叠位按原始 0–15 阶梯（满级 +12，旧 Eremora 数据带 enhance 字段时仍按旧算法）；UID 下可展开该 UID 全部助战角色；默认只载最新一期。
- 助战精简数据 `data/morimens/eremora/assist/*.json`（仅被借用成员，由 `scripts/build_assist_index.mjs` 生成，Action `build-assist-index.yml` 在 manifest / usage 变化时自动重建；数据对不上时页面自动回退完整数据）。
- 上期榜单（只用于名次升降箭头）改为首次用户操作后再空闲加载；手机端 i18n DOM 写入风暴、16 MB 上期数据预载、backdrop-filter、标签栏 / 回到顶部等移动端卡死问题（10-07）。

### 反馈与日历
- 回放结果新增【好评】【这场有问题】按钮（`feedbackBar`）：经 Waline 留言队列（路径 `/__morimens_replay_feedback__/`，标记 `MORIMENS_REPLAY_FB_V1:`）→ `archive-morimens-waline.yml`（目标分支 preview，72 小时间隔，可手动强制）→ `data/morimens/community/replay-feedback.json`（含 `problemReplays` 汇总）。
- 日历：同步 V2.6.2 公告（薇薇安活动、公主日记、洞察心灵、学园第 39 期、皮克曼复刻），补充项写在 `scripts/data/calendar_extra.json`。

## 3. WorkBuddy 侧改动（replay 复盘 第二～二十一轮，摘要）

完整说明在各轮提交信息里（`git log --grep='replay 复盘'`）。要点：

- **守密人六维重做**：爆牌计入资源管理（`handFlow` / `Eovf`）；“节奏”→“爆发”→狂气并入资源周转 + 对阵容往期的节奏参照库（`team-tempo.json`）；统计包取“本场”口径（BattleStats ≠ battleDat.statistics ≠ GlobalStats）；**P 维度（出牌价值）重做**：价格只看过去回合、费用比例回落、铺垫不双罚、单一产出目标（伤害 + 护盾）、回合等权；钥令维度改为统计“钥令给出的全部效果”，停用“三选一最优”（`keyChoiceModel` 恒返回 null）。
- **乘区模型**（第 13–21 轮）：增益折成伤害 / 护盾 / 治疗三区，乘区公式与伤害计算器同源（`zoneMarginalRatio`，唯一实现在 `morimens-calculator-combat.js`）；采集清单 `HIT_PROPS = [...ZONE_ALL]` 结构上不会再漂移（暴击率区 0 → 502 次）；护盾 / 治疗强效接入真实回放属性并按来源拆行；造物 / 命轮分层落到具体回放属性并要求构成恒等于总量；`card_strength_multiple` 移出乘区链；每个唤醒体新增乘区模型（角色页展开），与 skeydb 唤醒体建模关联（62/62）。
- **评分形式错误修复**：评分 `rel()` 以标称 4 人队为基准（`REF_N=4`）；类内份额只有该类达到全队产出 4% 才参与；presence 参与度闸门（`gate`）；负向写法不当增益（`isNeg`）；结构证据只能抬分；密契按已知件数过滤档位；单成员无排名用 0.5 先验；薇薇安（C20）机制建模；解码兼容稀疏 `snapShotZips` / 直 LZ4 回放。
- 其他：最后一回合补拍快照、`roundPool`、延迟结算 `ambientByRound`、命令费用兜底、五个名字函数加 null 守卫。
- 校验口径（来自其提交信息）：回归 71/71，乘区单测 49/49，批量抽样 20+ 场 0 异常，两场基准分不变（87.9 S / 82.7 S）。

## 4. 两边共用的约定（改动前请先对齐）

- `tl.hitLog[]`：`dt`（damageType，Claude 侧）、`cmul`（卡牌实例力量倍率，仅记录不计价，WorkBuddy 侧）、`cx`（暴击来源）、`cr`、`crit`、`blind`、`skill`、`stl`…。**`dt===2/6` 的命中不得进入任何暴击相关估值**。现状：幸运 / 暴击溢出（`critExcluder`）、命中增益估值（`calibrateHits` 的 critrate 分支）、WorkBuddy 侧乘区暴击率区（`zoneFracOf` 里 `ch==='critRate'` 对 `dt===2/6` 与 `zeroCrit` 返回 0）三处口径已一致，新增暴击相关逻辑请沿用同一判据。
- `tl.supStore`（`act:<uid>` / `rel:<tid>` / `gear:<kind|stem|tid>` / `kp`）：保持“事件总量守恒”——银钥来源合计不超过 `tl.keTotal`（审计脚本输出 `keEvents` vs `supKey`）。
- `play.ownerKey`：命轮 / 造物生成的专属卡打出时的归属键，`srcKeys()` 优先返回它；这些键进 `cardOwned`，不受“静态命令类型”能力过滤清零。
- 评分入口：`SC.scoreGear`（命轮 / 密契 / 造物，三类现在同一套）、`SC.scoreAwakeners`、`SC.scoreKeeperV2`、`SC.scoreLuck`；`ref.enh` 里附带 `gate / impact / burden` 供调试。
- 反馈管线与助战精简数据见 §2，两者的目录 / 路径都是约定，不要改名。

## 5. 本次（10-26）读取 preview 后的检查结果

方法：把 preview 最新代码在 120 场样本（本地缓存的融灾回放）上完整跑一遍 `decode → timeline → computeStats → 渲染`，并和合并前（10-17）的结果对比。

- **健康**：`node --check` 全部通过；120 场 0 报错、0 NaN；抽 10 场渲染文本 0 个 `undefined / NaN / [object`；单场统计耗时 36 ms；Claude 侧所有改动（反馈按钮、`dt` 暴击排除、造物评分、银钥封顶、助战精简数据）在合并后仍然生效。
- **评分整体下移**：唤醒体评分均值 −11.3（最大 −47）。三类分数（输出 / 防御 / 辅助）基本没变，下移来自 `scoreAwakeners` 的最终折算（`gate` 参与度、`REF_N`、保底乘 `gate`、小类剔除）。等级分布 S 60→25、D 44→141（480 个唤醒体样本，C+D 占 61%）。属于有意校准的结果，但**整体偏严**，是否接受请两边确认。
- **发现并修复的问题**（本次提交）：
  1. `gate` 只看出牌 / 算力份额，把“几乎不打牌但贡献大”的被动 / 辅助 / 自动输出型唤醒体压低：22 个 impact（贡献份额）> 20% 的唤醒体 gate 只有 0.6–0.8（沙耶、希洛、艾继丝，甚至 impact 72% 的「24」）。改为参与度取 `max(消耗份额, 贡献份额)`；全体均值 +1.4（最大 +16），贡献真的很低的角色（图鲁、希洛部分场次，impact ≤ 5%）仍被扣。
  2. 灵塑等级读取 SKeyDB 天赋文件时，詹金（awakener slug `jenkin`）的天赋文件名是 `jenkins`，导致 404 且灵塑等级拿不到——加了 `slug+'s'` 回退（上游数据命名不一致，建议同时反馈 SKeyDB）。
  3. `ref.enh` 增加 `gate / impact / burden`，便于排查。
- **未处理 / 建议**：
  - `morimens-tools.html` 引用了不存在的 `morimens-theme.css?v=…`（每次页面加载一个 404，无功能影响）：补文件或删掉这行。
  - 评分整体偏严的问题见上；如要放宽，优先看 `REF_N=4`（3 人队 / 助战缺人时偏低）和小类 4% 剔除线。
  - 回放头部命轮叠位只在该场能在榜单数据查到时才显示，回放本身没有叠位等级。
  - 两边对同一能力各有一份估值时（如临时力量：Claude 侧记到命轮名下，WorkBuddy 侧的乘区层也会摊开），请以“同一笔增益只记一次、按命中封顶”为准，改动后跑 §7 的审计看总量是否仍守恒。

## 6. 给 WorkBuddy 侧的合并提示

- 动 `morimens-replay-review-v2.js` 前先 `git fetch && git merge origin/preview`，该文件 5 万多行、单行很长，尽量按函数 / 区块改，减少整文件冲突。
- 提交信息沿用“replay 复盘: … （第 N 轮）”并写清**校验口径**，Claude 侧会按同样口径复跑 `scripts/replay_audit/audit.js`。
- 新增会改变评分分布的逻辑，请在提交信息里附“改动前后等级分布”（用 §7 的输出统计），避免再出现整体下移却无人察觉。

## 7. 批量审计脚本

```bash
python3 -m http.server 8765 &                       # 在仓库根目录起静态站
mkdir -p /tmp/replays && for id in $(cat ids.txt); do
  curl -s "https://z1g-warreport.qookkagames.com/publish/BattleReplay_$id.json" -o /tmp/replays/$id.bin
done
cp ids.txt /tmp/replays/ids.txt
REPLAY_DIR=/tmp/replays node scripts/replay_audit/audit.js 0 1   # 参数：分片序号 分片数；可开多个分片并行
```

输出 `audit_<分片>.json`：每场的唤醒体 / 命轮 / 密契 / 造物评分、`totalDmg / awDmg / hitDmg`、`keEvents` 与 `supKey`（银钥总量守恒检查）。对比两次输出即可统计评分 / 等级分布变化。

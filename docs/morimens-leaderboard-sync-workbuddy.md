# 融灾榜单同步手册（给 WorkBuddy）

> 目的：以后收到「season_xxxxx.zip / .z01 / .z02 …」这类榜单抓取包时，WorkBuddy 可以在本仓库里**独立完成**榜单更新，不需要 Claude 侧介入。
> 写于 2026-10-26（第 71 期结算榜已按本文流程更新完毕）。配套脚本：`scripts/sync_morimens_leaderboard.py`（一条命令完成全部步骤）。
> 和战斗回放复盘无关的改动请看 `docs/replay-review-sync.md`；两份文档分工不同，别混。

---

## 0. 先看结论：最短路径

```bash
git fetch origin && git merge origin/preview            # 先把机器人 / 别的会话的提交合进来（见 §7）
python3 scripts/sync_morimens_leaderboard.py \
    --season 71 \
    --parts /路径/xxxx.z01 /路径/xxxx.z02 /路径/xxxx.zip \
    --updated-at "2026-10-26 16:47"            \
    [--final]                                   # 赛季结束后的结算榜加这个
    [--allow-missing]                           # 允许有个别 id 暂时没名字（榜单里显示 #id）
    [--changelog "中文更新日志" "English changelog"]
git status                                      # 看改了什么
# 打开页面自检（§5），再提交、推送到 preview；用户明确说「推送到 main」才推 main（§6）
```

脚本做的事（顺序执行，失败即停，不会提交 / 推送）：

1. 把分卷 zip 拼起来解压出 `ranking.json` 与 `teams_latest.jsonl`，逐文件校验 CRC32；
2. 检查抓取里出现的 **唤醒体 / 命轮 / 造物 / 钥令 / 密契 / 关卡** id 是否都在 `data/morimens/dzone/season<期>/id-names.json` 里有名字，缺的会列出来并停下（`--allow-missing` 才继续）；
3. 把当前的榜单快照另存为 `ranking-<yyyymmdd-hhmm>.json.gz`（Top 1000 的会带 `-top1000`），并把当前的 `raw-teams` 作为 `--fallback-raw`（见 §3.3）；
4. 调 `scripts/import_morimens_season<期>_top2000.py` → `scripts/postprocess_morimens_eremora.mjs` → `scripts/pack_morimens_usage_v2.py` → `scripts/compact_json.py`；
5. 重写 `data/morimens/eremora/manifest.json`（**保持 CRLF 换行**），并把 `assetVersion` 加一；可选追加「更新日志」。

脚本已用第 71 期结算包完整跑过一遍：重复运行产物逐字节一致（分片 revision 相同），只有时间戳 / 版本号会变。

---

## 1. 输入：上传包是什么

- 文件名形如 `season_83331.zip` + `season_83331.z01`（+ `.z02` …）。**这是分卷 zip**，上传时会被改成 `<8位随机>-season_83331.zip`、`<8位随机>-season_83331.z01`，顺序以**扩展名**为准：`.z01 → .z02 → … → .zip`（`.zip` 最后，里面有目录）。
- 内容只有两个文件（偶尔还带 `uids.csv`、`team_errors.jsonl`、`pending_queries.jsonl`，有就会被一并归档）：
  - `ranking.json`：官方 `Rank.QueryRank` 返回的榜单（`activityTid`、`retrievedAt`、`rankRange`、`rows[]`）。
  - `teams_latest.jsonl`：每行一个「玩家 × 禁区（stageGroup）」的队伍详情（`Facade.QueryFacadeFields`），含主队 `team`、额外队 `teamExtra`、`battleStatPack`（逐场伤害 / 回合 / 死扛等）。
- **不能用 `unzip` / `zip -FF` / `7z` 直接解**：条目会跨卷（一个文件起于 `.z01`、止于 `.zip`），`unzip` 会得到截断数据；Python 自带 `zipfile` 也不支持分卷。脚本里的 `extract_split_zip()` 是正确做法：把所有分卷按顺序拼接，用中央目录里的「卷号 + 偏移」定位本地头，再 `zlib.decompress(raw, -15)`。遇到 CRC 不符说明上传不完整，**让用户重新上传**，不要凑合用。
- 先看两个关键字段再决定怎么处理：
  - `ranking.json.rankRange`：`[1,2000]` 是完整榜；`[1,1000]` 是只抓了前 1000 的快照（见 §3.2）。
  - `ranking.json.retrievedAt`：就是页面上显示的「更新时间」（UTC+8）。`--updated-at` 默认取它，用户另有指示（例如「更新时间请用榜单下方的…」）就按用户的写。

## 2. 名称表 `id-names.json`

位置：`data/morimens/dzone/season<期>/id-names.json`，键为游戏内数字 id，值为 **SKeyDB 的英文名**（页面中文名由 `tier-pool.json` / 中文维基表按英文名映射）。分区：`awakers`（含 `name / canonicalName / ingameId / realm / role`）、`wheel`、`creation`、`token`、`covenant`、`stages`。

- 缺名字怎么办：
  - 先看 SKeyDB（`data/morimens/skeydb/public-v3/catalogs/*.json`）和 `data/morimens/replay-relics.json`、`replay-relic-config.json`（造物 / 命轮的中英文）能不能对上；
  - 新唤醒体上线时，它的命轮 / 造物 / 钥令编号往往一次出现好几个，按**编号顺序 + 谁在装备**推断（例如第 71 期 151737 / 151763 / 152952 就是这样对到「先知的难题 / 她和她的树洞 / 伊玛戈的诊室」的）；**推断必须写进 `id-names.json` 的 `_note` / `_inferred`，并在给用户的回复里说明「是推断」**；
  - 实在查不到就留空，用 `--allow-missing`，榜单里会显示 `#编号`（目前第 71 期只剩造物 98420 没名字）。**不要编名字**。
- 名字确定后只需改 `id-names.json`，然后再跑一遍脚本（它会重新生成全部分片）。
- 中文名没有时，在 `scripts/data/zh_manual.json`（命轮 / 造物按 SKeyDB id）、`scripts/data/posse_zh_wiki.json`（钥令，按英文名）里补，再运行 `node scripts/build_morimens_tier_pool.mjs`。官方中文名的来源优先级：游戏内公告（用户贴的维护公告文本）> 灰机维基 > 其他。**不要自己翻译后冒充官方名**。

## 3. 数据处理细节（脚本里发生了什么，出问题时对照）

### 3.1 导入 `scripts/import_morimens_season<期>_top2000.py`
- 无损归档：`data/morimens/dzone/season<期>/` 下写入 `ranking.json.gz`、`raw-teams/teams-NNN.jsonl.gz`（`teams_latest.jsonl` 的逐字节拷贝，拼起来能还原）、`battle-summary.jsonl.gz`（每场战斗一行）、`scores.json`、`statistics.json`、`meta.json`，以及有就归档的 `uids.csv` / `team-errors.jsonl` / `pending-queries.jsonl.gz`。
- 站点格式：`work/seasons/<期>.json`（逐玩家 → 逐禁区 → 队伍，含 `battle` 统计）和 `work/rank-index/<期>.json`；逐场战斗统计另存为 `usage/<期>-battle-gzip`。
- 去重：同一 uid 占了相邻两个名次时只保留名次靠前的一条，记在 `meta.json.duplicateRankRowsDropped`（所以在榜人数可能是 1998 而不是 2000，这是正常的）。
- 禁区编号：`GROUP_WAVE`（stageGroupId → 禁区 1-5）写死在导入脚本里；关卡难度（C/B/A/S/SS/SSS/▼）来自 `id-names.json.stages` 的名字 `Zone N: Threat Level X / ▼`。
- 被中途截断的最后一行（上传不完整）会被跳过并记在 `meta.json.skippedTailLines`。

### 3.2 Top 1000 与 Top 2000
- 有时抓取包只有前 1000 名（`rankRange: [1,1000]`）。**不要拿它覆盖掉完整的 Top 2000 而不告诉用户**：脚本会照常导入（榜单变成 1000 人，`coverageMode` 变成 `official-rank-top1000`），旧的 Top 2000 快照作为 `ranking-<时间>.json.gz` 保留在仓库里，随时可以恢复。如果用户要求「同步 Top 2000」而包里只有 1000，应先问清楚或说明情况。

### 3.3 `--fallback-raw`（默认开启）
最后一次抓取可能漏掉部分「玩家 × 禁区」行（接口超时 / 玩家改了队）。脚本把现有 `raw-teams` 作为兜底：**新抓取优先，新抓取没有的行才用旧的**。第 71 期结算包：新行 9839，兜底旧行 3403，合计 13242 行，2000 人全部有队伍详情。如果用户明确要求「只用这一份数据」，加 `--no-fallback`。

### 3.4 后处理与打包
- `postprocess_morimens_eremora.mjs`：给每个队伍补难度、启灵档位等字段，并写出 `stats/<期>.json`。
- `pack_morimens_usage_v2.py`：把站点格式压成 `gzip-base64-chunked-v2`（实体表 + 字符串池 + 位置数组），写 `usage/<期>-local-gzip` 和 `usage/<期>-battle-gzip`（各 `index.json` + `chunk-NNN.b64`），内置逐字节往返校验；校验失败会直接退出——常见原因是传给它的 `seasons/<期>.json` 没经过后处理（缺 `enlightTier`），脚本已按正确顺序处理。
- `compact_json.py`：把 `rank-index/<期>.json`、`stats/<期>.json` 去缩进、去可推导字段。
- 中间产物 `data/morimens/eremora/seasons/<期>.json` 用完即删，**不提交**。
- 前端读取：`morimens-dtide-loader.js`（v1 分片用于 63–70 期，v2 用于 71 起；`expandV2` / `expandBattlesV2`）。

### 3.5 `manifest.json`
`data/morimens/eremora/manifest.json`（**CRLF 换行**；用程序重写时务必保留，否则整个文件会变成「全部行已修改」的大 diff）。脚本更新：`usageIndex`（`syncedAt / recordCount / target / coverage / revision`）、`current`、`rankIndex`、`source.syncedAt`、`latestLocalImport`（含 `rankRange / teamRows / note`）、`availableSeasons[该期]`（`dataUpdatedAt / revision / recordCount / coverageMode`）。页面「更新时间」读的是 `availableSeasons[].dataUpdatedAt`。

## 4. 手工补充（脚本不做，按需）

1. **README**：`data/morimens/dzone/season<期>/README.md` 顶部「Data updated」那行和行数、旧快照列表需要人工改一下（参考第 71 期 README 的「Merge log」写法）。
2. **更新日志**：`--changelog "中文" "English"` 可自动加；文案放在 JS 单引号字符串里，**不能出现英文撇号 `'`**（会让整个 `morimens-dtide.js` 语法错误），用别的措辞。
3. **缓存版本号**：脚本会把 `morimens-tools.js` 的 `assetVersion` 和 `morimens-tools.html` 里的 `?v=` 一起加一（保持原有换行风格）。回放复盘相关页面另有一处 `morimens-replay-review-v2.js?v=`（`docs/replay-review-sync.md` §1），榜单更新用不到。
4. **爱的节奏榜 / 日历 / SKeyDB**：新唤醒体上线时另行处理（`node scripts/sync_morimens_skeydb.mjs` 需要本地 SKeyDB 稀疏检出 `.skeydb`，见 `.github/workflows/sync-morimens-skeydb.yml`；日历补充写在 `scripts/data/calendar_extra.json`）。这些不属于榜单同步，别顺手改。

## 5. 提交前自检清单

```bash
python3 -m http.server 8777 &        # 仓库根目录起静态服务
```
用 Playwright（`/opt/pw-browsers/chromium`）或浏览器打开 `http://localhost:8777/morimens-tools.html#dtide`，确认：

- [ ] 「融灾榜单」顶部「更新时间节点」= 你给的时间；期次下拉里该期显示「N 条 · 完整」且 N = 在榜人数；
- [ ] 控制台没有报错（尤其是 loader 解码、`SyntaxError`）；
- [ ] 角色榜 / 命轮榜 / 造物榜里没有大量 `#数字` 的未命名条目（个别未命名是允许的，要在回复里列出来）；
- [ ] `git status` 里只有：`data/morimens/dzone/season<期>/*`、`data/morimens/eremora/{manifest.json,rank-index,stats,usage}/…`、`morimens-tools.{js,html}`、（可选）`morimens-dtide.js`；**没有** `seasons/<期>.json`、`.skeydb/`、大块无关改动；
- [ ] `git diff --stat data/morimens/eremora/manifest.json` 是几十行以内（上千行说明换行被改了）。

## 6. 分支与推送规则（用户的明确要求）

- 开发和推送都先到 **`preview`**；**只有用户明确说「推送到 main」才推 main**，而且 main 是从 preview 快进：`git push origin preview:main`。
- 推送前永远先 `git fetch` 并合并 `origin/preview`、`origin/main`（机器人 / 别的会话会提交，见 §7）；不要强推、不要改写历史、不要用 `--force`。
- 提交信息写清楚「第 N 期、时间、人数、队伍行数」，例如：`data: season 71 final settlement board (2026-10-26 16:47)`。
- GitHub Pages 只从 `preview` 构建；`main` 是对外稳定分支。
- 回复用户用中文，说明：更新时间、人数、队伍行数、有无未命名 id、有无推断项、是否已推 main。

## 7. 已知坑（都真实发生过）

| 现象 | 原因 / 处理 |
| --- | --- |
| 合并时 `data/morimens/{skeydb,steam,kaiden,dzone-info,game}/…` 冲突 | 这些是机器人（`chore: refresh Morimens SKeyDB and Huiji snapshots`）自动生成的文件。解决：**取对方（机器人）版本**，再用本地脚本重新生成依赖它们的产物：`node scripts/build_morimens_tier_pool.mjs`、`node scripts/sync_summon_calendar.mjs`；手写的补充都在 `scripts/data/*.json`，不会丢 |
| `data/morimens/dzone-info/71.json` 被机器人删掉 | `sync_morimens_dzone_intents.mjs` 每次清空数字文件名，只重建 67–70 期；已改为会把 `scripts/data/dzone-info-manual/*.json` 放回去。别删 `dzone-info-manual` |
| `pack_morimens_usage_v2.py` 报 `record 0 mismatch` | 喂给它的 `seasons/<期>.json` 没经过 `postprocess_morimens_eremora.mjs`；用脚本，不要手拼 |
| `unzip` 解出来文件大小对不上 / 解压报错 | 分卷 zip，见 §1 |
| 榜单人数不是 2000 | 重复名次被去掉（§3.1）或抓取只有 Top 1000（§3.2） |
| 页面显示旧数据 | 忘了加 `assetVersion`，或浏览器缓存；脚本默认会加 |
| `morimens-dtide.js` 白屏 / 语法错误 | 更新日志里写了 `'` |
| 新唤醒体 / 新命轮在榜单里是 `#数字` | 见 §2；并检查 SKeyDB 是否已收录、`tier-pool.json` 是否重新生成 |
| 机器人 `manifest.json` 以 LF 重写后整文件 diff | 保持 CRLF；本脚本用 `write_crlf_json` 写 |

## 8. 新赛季（第 N+1 期开始后第一次同步）

当前导入脚本和名称表按期各一份（`import_morimens_season71_top2000.py`、`dzone/season71/id-names.json`），新一期要先建好再用同步脚本：

1. 复制 `scripts/import_morimens_season71_top2000.py` → `scripts/import_morimens_season<N>_top2000.py`，改：`ACTIVITY`（抓取包 `ranking.json.activityTid`）、`SEASON`、`GROUP_WAVE`（5 个 `stageGroupId` → 禁区 1–5，**从 `ranking.json.stageGroupIds` 和队伍里的 `stageTid` 对照关卡名确定**，第 71 期是 `{83438:1, 83437:2, 83436:3, 83435:4, 83434:5}`）、输出目录 `season71` → `season<N>`、`usage/71-battle-gzip` → `usage/<N>-battle-gzip`、`seasons/71.json` / `rank-index/71.json` 的文件名、`period` / `name` / `date` 文案（如「第N期 融灾 · 〇〇戒指」，周期以官方公告为准）。
2. 复制 `data/morimens/dzone/season71/id-names.json` → `season<N>/id-names.json`，替换 `stages`（本期 35 个 stageTid，关卡名在客户端配置表 `stages.json` 的 `CnID=关卡@融蚀深渊<N>期<A-G><禁区>`：A=C 级、B=B、C=A、D=S、E=SS、F=SSS、G=▼；`madness` 数值沿用同难度同禁区的旧值），并补齐新增的命轮 / 造物 / 钥令名字（§2）。
3. `data/morimens/eremora/manifest.json`：`currentSeason` 改为 N；`availableSeasons` 头部新增本期条目（复制上一期的字段结构：`labelZh / labelEn / period / periodShort / ringRealm / ringRealmZh / path / statsPath / rankPath / battleArchivePath / battleDetailPath`）；`discoveredSeasonIds`、`pendingBackfillSeasonIds`、`seasonRing` 同步。
4. `data/morimens/dzone-info/`（怪物指南）和 `data/morimens/maps/`（地图总览）是另外的数据线（Info.kr 同步 / 本地配置表构建），不在本手册范围。
5. 然后就按 §0 运行脚本（第一次运行时 `--fallback-raw` 因为没有旧 `raw-teams` 自动不启用）。

## 9. 本次（第 71 期结算）的实际参数，供对照

```
--season 71 --final --allow-missing --updated-at "2026-10-26 16:47"
捕获：rankRange [1,2000]，retrievedAt 2026-10-26T16:47:03+08:00
结果：2000 人在榜（无重复名次），队伍行 13242（新抓取 9839 + 旧捕获兜底 3403），逐场战斗 24488，
      usage v2 分片 2 片 ≈ 934 KB，战斗分片 2 片 ≈ 776 KB，未命名 id：造物 98420
命轮 id 推断：151737 先知的难题 / 151763 她和她的树洞 / 152952 伊玛戈的诊室（见 id-names.json._note）
```

## 低配榜单数据

`scripts/sync_morimens_leaderboard.py` 在打包完成后会自动运行 `scripts/build_lowspec_rank.py <期> <期-1> <期-2>`，生成 `data/morimens/eremora/lowspec/<期>.json`（融灾榜单页的「低配榜单」标签读取它）。数据来自该期 `raw-teams`（启灵、技能槽等级、灵塑天赋等级、SSR 命轮等级）和 `battle-summary`（守密人等级）；灵塑天赋 id 没有名称，脚本用最近三期里每个唤醒体各天赋的最高等级（10 = 灵塑）推断。手动补旧期：`python3 scripts/build_lowspec_rank.py 71 70 69`。

## 玩家近期排名 (recent players)

`scripts/build_recent_players.py` 由 `sync_morimens_leaderboard.py` 在低配榜单之后自动运行，读取 manifest 中带 `lowspecPath` 的最近至多 10 期，且只统计第 70 期起（第 69 期及更早不计，脚本里 `MIN_SEASON`），写出 `data/morimens/eremora/recent/index.json`（玩家 UID、当前ID、每期排名/分数）。队伍详情不重复存放，页面展开时才读取对应期的 `lowspec/<期>.json`。新增期次后若要手动重建：`python3 scripts/build_recent_players.py`；第 69 期的低配文件用 `python3 scripts/build_lowspec_rank.py 69-postbug 70 71` 生成。

## 10. 本次（第 73 期结算）的实际参数，供对照

```
--season 73 --final --allow-missing --updated-at "2026-11-23 09:18"
捕获：C:/Users/Administrator/AppData/Local/MorimensCollector/season_83326（已解压目录，直接当参数传）
      rankRange [1,2000]，retrievedAt 2026-11-23T09:18+08:00
结果：2000 人在榜（无重复名次），队伍行 19138（新抓取 9873 + 旧捕获兜底 9265），逐场战斗 37101，
      旧快照存为 ranking-20261115-0057.json.gz，未命名 id：造物 98420（榜上显示 #98420）
命轮 id 推断：155077 = Next Time It Rains / 下一个雨天（SKeyDB wheel-0184，紧跟 wheel-0183 伊玛戈的诊室）
```

要点：

- **抓取包可以直接传目录**。`sync_morimens_leaderboard.py` 现在会识别「单个参数且是目录」，跳过解压直接用（`--parts` 的 help 已同步改）。采集器把分卷解压到 `season_<activityTid>/` 时省一步。
- 结算期（本期已结束）的 `build_recent_players.py` 不要再标 `complete:false`：判定已改为「`coverageMode` 含 `final` 或 `seasonId != currentSeason`」。
- `latestLocalImport` 已改为按本次 `n` 从 `ranking.json` / `statistics.json` / manifest 重写，不再是写死的上一季信息。
- 周期以官方公告为准：第 73 期实际是 **2026-11-09 – 2026-11-22**（导入脚本里的 `period` 不要按「两周一整天」推成 11-23）。

## 11. 特刊（融灾报纸长图）

`report73/` 是第 73 期特刊的生成链，三期复用可直接改 `SEASON` 相关路径：

1. `python report73/build_data.py` → `report73/report.json`（当期 + 上一期的全部指标）
2. `node report73/gen.mjs` → `report73/pages/s1..6.html`（1000×1800 的报纸版式）
3. `node report73/shot.mjs` → `exports/season73-report/融灾第73期特刊-第N版.png`（dpr 2，2000×3600）
4. `node report73/measure.mjs` → 打印每版「版面流内容底部 / 剩余留白」，用来判断有没有大片空白（目标留白 < 150，溢出会直接标 `over:true`）

坑：分卷/整包无关，但**禁区判定一定按关卡名 `Zone N`**（`GROUP_WAVE` 的 stageGroupId 顺序与禁区号不对应）；造物统计要按队伍去重，并把「人人必备」的环造物（携带率 ≥ 99%）滤掉，否则五区清一色 100%。

### 排版自检（2026-11-23 加）

- `node report73/check.mjs` —— 逐版量「正文最深元素的底边」与页脚 `.foot` 的顶边，直接打印 `overlap`。
  **`overlap > 0` 就是文字压住了页脚**，交付前必须全为负值（留 10px 以上）。该检查抓出过第 3/4/5 版各压 9~12px 的问题，肉眼在缩略图上完全看不出来。
- `node report73/crop.mjs <版号> <css选择器> <放大倍数> <输出路径>` —— 用 CDP 把某个元素单独截图放大，用来核对小字（头像旁的加成、百分比、钥令名）有没有被截断。
  选择器加 `@@下标` 可取同名元素的第 N 个（如 `.bband@@2` 取第三张分数段卡片）——`querySelector` 只能拿第一个，之前想核对后排卡片只能整版缩略图瞎猜。
- `node report73/measure.mjs [版号]` —— 版面流内容底部与剩余留白（`gap`），用来判断是不是大片空白。

### 内容口径的两个坑

- **难度名**：▼ 档在中文里是「癫狂」，不是「狂癫」。站点 UI 只写「危险等级 ▼」，所以从代码里搜不到中文名，容易凭印象写错。
- **"上一期"的数字一律从 `report.json` 取**，不要凭上一版文字里的数字手写：第 73 期起 72 期终榜重算过（平均分 430.3、中位 425、≥450 分 694 人），与早期草稿里的 413.3 / 405 / 649 完全不同，手写就会自相矛盾。
- **启灵版必须覆盖全部唤醒体**：`build_data.py` 的 `enlight` 不再按「样本 ≥ 20 场」过滤，61 个全部输出；`small` 标记的（<20 场）在版面上另起一段排在末尾，序号接着排。

### 第 7 版「低配榜」的口径（2026-11-23 加，同日按反馈重做）

- 成本统一用「启灵总和」= 队伍四人 `potencyLevel` 之和（0-60，满配 60）。全服 1002 支 ▼ 队伍中位 37、≤25 的 204 支、最低 7；329 支 SSS 里最低只要 4。
- **上半段：各禁区 × ▼/SSS 的最低配三套**（`lowcost.zones[].down` / `.sss`）——按启灵总和升序、同阵容（tid 集合，不计站位）去重取 3 套，`picks[]` 附玩家排名、总分、该场回合数与该区得分。
  小样本要有心理准备：第二/四/五禁区的 ▼ 队伍只有 48/36/36 支，第三名常常比最低配高出一大截（第四禁区 22 → 24 → 46），版面按真实顺序照列，不要为了好看把高成本的删掉或补位。
- **下半段：三档分数段里「最省玩家」的全部队伍**（`lowcost.bands[].best`）——分档 500–525 / 475–500 / 450–475；排序键 = 该玩家全部队伍的启灵总和 ÷ 队伍数（**平均启灵，不设队伍数门槛**：按总和排会让只交三四支的队伍天然占便宜，比出来的是「交得少」而不是「配得省」），取最小；`bands[].best.top3` 存前三名、`bands[].teamSpread` 存该档玩家提交队伍数的分布；`items[]` 是他提交的每一支队伍（禁区、难度、阵容、启灵总和、回合数、该区得分）。**别把 `total`（玩家总分）当该区得分写进卡片右上**，那里用 `zoneScore`。
- 版面：上半每格两列（▼ 癫狂 / SSS），行 = 四名唤醒体（头像 + 名字 + `+启灵`）+ 右对齐「启灵总和 /60 · 第 N 名 · 总分 · 回合」；下半每档一张卡、五列（玩家五支队伍）。`node report73/measure.mjs 7` 的 `gap` 控制在 40~70px，`check.mjs` 的 overlap 为负即可。

### 图标与头像（2026-11-23 加）

- `data/morimens/game/tier-pool.json` 的 `kinds` 同时给了 awakener / wheel / relic / posse / covenant 的图，`gen.mjs` 里 `iconOf.*` + `ic(kind,en,size)` 统一取图，`awico(en,size)` 是唤醒体专用。
- **造物名带 `+1/+2` 后缀**（缠丝玛瑙+），SKeyDB 目录只有基名，取图前必须 `stripPlus()`。
- **唤醒体 `"24"` 带引号**，tier-pool 里是 `24`，取图要剥引号；否则会渲染成灰块。
- **钥令图标是灰色剪影**（`posse/Icon/KeyToken_*.webp`）：用 `filter:brightness(.42)` 压暗才看得清，而且**不能给 img 元素加背景色**——filter 会把背景一起压黑，看起来是个黑方块。
- 造物榜一律排除 `超维戒指 / 血肉戒指 / 混沌戒指 / 锈蚀钥匙`（`CREATION_SKIP`）：前者人人必备，后者是货币类道具、不属于配装选择。

### 助战索引（`scripts/build_assist_index.mjs`，2026-11-23 修）

- 目标：把每期 usage 数据里「借用的助战成员」单独抽成 `data/morimens/eremora/assist/<key>.json`，页面「互助助战列表」优先读它，读不到才回退整包（几十 MB）。
- **第 71 期起 usage 换成了 `gzip-base64-chunked-v2`（表池压缩）**，脚本原先只认 v1，抛 `unsupported format` 后 `index.json` 是最后才写的，于是 71/72/73 三期一个都没登记，页面只能回退整包（体感就是切期特别慢）。
- `loadDataset()` 现在两种格式都吃：v2 解 gzip 后交给 `expandV2()`（`decode_records()` 的 JS 移植，与 `pack_morimens_usage_v2.py`、`morimens-dtide-loader.js` 的 expandV2 三处保持同步），还原成和 v1 一样的 `records[].waves[].teams[].members[]`。
- **v2 的成员没有 `skeydbId`**：只有 `tid`（`chars[i][0]`）+ `ingameId` + 名字。脚本用 `data/morimens/skeydb/awakeners.json` 的 `ingameId → id` 反查补齐，否则页面按 `skeydbId` 找不到角色、头像会掉。补完后 71–73 的 `tids` 映射有 62 条（v1 那几期是 0，因为 v1 成员的 `id` 不是数字）。
- 自检：`node scripts/build_assist_index.mjs` 每期打印一行 `key format records N -> M pool P`；71/72/73 的 providers 应在 1637~1653 之间（70 是 1646）。
- 端到端验证：`python -m http.server 4200`（**别用仓库里的 `server.mjs`，它限流 240/min，页面一次要几百个模块会全 429**）→ 无头 Edge 打开 `http://127.0.0.1:4200/morimens-tools.html#assist` → 等 9 秒后调 `window.MorimensAssistList.open()`（hash 触发时模块还没 import 完）→ 看 `#assistSeason` 是否出现 71/72/73、`performance.getEntriesByType('resource')` 里是否出现 `assist/73.json`（出现即走的是瘦身路径）。

## 12. 第 74 期（深海戒指）首日快照的实际参数（2026-11-24）

```
--season 74 --allow-missing --no-fallback --updated-at "2026-11-24 03:38"
捕获：C:/Users/Administrator/AppData/Local/MorimensCollector/season_83305（已解压目录）
      rankRange [1,2000]，retrievedAt 2026-11-24T03:38:58+08:00，activityTid 83305
结果：2000 条名次里 3 个 uid 重复占相邻两名 → 1997 位玩家，7,118 队伍行，13,135 逐场战斗，
      usage v2 两片 648,554 gzip 字节 + 战斗明细 503,118 字节，未命名 id：造物 98420（榜上 #98420）
周期：2026-11-23 – 2026-12-06（第 73 期 11-22 结束）；榜单口径 official-rank-top2000（非 final）
```

要点（新赛季第一次同步必看）：

- **`GROUP_WAVE` 必须从 `ranking.json` 的 `raw.abyssChallenge.activityId2Data['<activityTid>'].stageGroups` 反推**：
  每个 stageGroupId 下的 `stageId` 去客户端配置表查 `CnID`（`data/morimens/local-config/stages.json.gz`，形如 `关卡@融蚀深渊74期G2`），
  字母后面的数字就是禁区号。第 74 期是 `{83416:1, 83414:2, 83415:3, 83417:4, 83418:5}`——**看着不像顺序的，别按数字大小猜**。
- **A–E 三档的关卡 id 每期都换**（81xxx–83xxx），只有 F(SSS)/G(▼) 保持在 153xxx 段。所以 `id-names.json` 的 `stages`
  必须按本期 35 个 stageId 重建（`madness` = 客户端 `StageLevel`，与旧期同难度同禁区的值一致），不能沿用上一期。
- **`--no-fallback` 是必须的**：上一期的 `raw-teams` 里是第 73 期的 `stageTid`，本期名称表里没有这些 id，
  兜底行会在 `stages[str(stageTid)]` 直接 KeyError。同一赛季内的后续抓取才可以传 fallback。
- `availableSeasons[].complete` 由脚本**不会**改写（只改 counts / coverageMode），新期条目要自己先写进 manifest；
  `rankIndex.seasonId / path / activityTid` 与 `usageIndex.seasonId / path / statsPath` 同理，脚本只 update counts 与 revision。
- 本期 2000 名次里有 3 个 uid 占了两行，`rank-index/74.json` 的 `complete` 会是 `false`（`len(rows) >= 2000` 不成立），
  但榜单下拉的「完整」标记读的是 `availableSeasons[].complete`，两者含义不同，别被吓到。
- 首日榜的分数形态与结算期差很远：本期最高 500（一人）、≥450 只有 121 人、中位 285，别拿第 73 期终榜的数字做对比文案。

### 第 74 期中段补抓（2026-11-27 01:53，同赛季第二次同步）

```
--season 74 --allow-missing --updated-at "2026-11-27 01:53"
捕获：C:/Users/Administrator/AppData/Local/MorimensCollector/season_83305（同名目录被采集器重新写满）
结果：2000 名次（无重复 uid）→ 2000 位玩家 / 12,430 队伍行 / 10,128 场战斗；
      usage v2 两片 875,454 gzip 字节、战斗明细 690,221；最高分 525、统计队伍 10,128
```

- **同赛季第二次同步不要传 `--no-fallback`**：本次 `teams_latest.jsonl` 有 13,426 行、实际入库 9,444 行，
  另外 2,986 行来自上一次抓取的兜底（`meta.json` 的 `teamRowsBySource` 会写清来源分布）。
  `--no-fallback` 只适合「新赛季第一次抓取」，否则会把上一次的行当成上期数据一起清掉。
- 本次仍只有 `creation 98420` 无名称（`RelicConfig` 里 98419/98420 是空壳，`Icon_Creation_040` 对应的
  `群星之酒Pro` 是别的 id），**别猜名字**，继续 `--allow-missing` 让它显示成 `#98420`。
- 同步脚本会**同时**改 `morimens-tools.html` 里所有 `?v=` 与 `morimens-tools.js` 的 `assetVersion`
  （本次两者一起到 `20261127.1`），手动改 js 时不用再单独补 html，但手动改完不跑脚本时仍要自己对一下。
- 提交顺序：数据提交 → `merge origin/preview` → 推 preview → 推 main。**两边都有自动化在写**
  （`chore: rebuild assist list index`、网盘巡检、SKeyDB 刷新），一次 push 被拒是常态，fetch 后 merge 再推即可。

## 13. 主线困难榜单（`morimens-main-hard.js`，2026-11-25 改版）

数据来自「关卡公开展示的通关回顾」（`CopyReview.QueryStageReview`），采集器在 `MorimensCollector_Mainline/`，
落盘 `%LOCALAPPDATA%\MorimensMainlineCollector\stages\*.json`。目前只有 11 个关卡有人公开回顾，其余关卡列表是空的，不是漏抓。

三段拼起来才是完整配置，缺一段就会「有等级没装备」：

| 数据 | 来源 | 产出 |
|---|---|---|
| 回合数 / 4 名唤醒体 / 钥令 / 回放码 / 守密人等级（facades） | 回顾列表 | `scripts/build_main_hard.py` → `index.json` |
| 每名角色的启灵、灵塑、守密人等级（战斗时） | 回放对象 `BattleReplay_<uuid>.json` | `scripts/fetch_main_hard_detail.py` → JSONL 缓存，再由 `build_main_hard.py --detail` 合并 |
| 命轮 / 密契 | **回放里没有**；取该玩家在融灾里同一角色的装备 | `scripts/build_main_hard_gear.py` → `gear.json` |

几个坑：

- **回顾列表只有 `awakerOutlineList`（tid + level）和 `teamData.keeperSkill`**，启灵、灵塑、命轮、密契、守密人战斗时等级都不在里面，也没有"队伍详情"接口可取。
- **回放对象同样不含装备**：`roleData` 只有 `tid/level/potencyLevel/breakLevel/curSkin`，`battleDat.relics` 是造物。所以命轮只能从融灾队伍记录（`weaponSlots` + `items[uid].suitId`）按 `(uid, 唤醒体 tid)` 反查，覆盖率约 50%，页面上注明"非本场装备、融灾是 2 命轮规则"。
- **回放会过期**：`BattleReplay_<uuid>.json` 对较早的通关直接 404（约 35~45% 命中不了），且 404 是永久性的，重试没用。抓取脚本对 403/404/410 立即失败，其它错误才退避重试；**必须绕开环境里的 HTTP 代理**（`build_opener(ProxyHandler({}))`），走代理时并发几个连接就会被 reset。
- 抓取顺序会集中在同一关卡的连续 uuid 上，某一关整批 404 时会把 12 个线程全占住（每个超时 25s×2 次），所以要按 uuid 哈希打散再提交。
- 拼数据时**按 tid 匹配成员**，不要按下标：回放 `roleData` 的顺序和回顾列表的站位不保证一致。
- 前端「低配阵容」按启灵总和升序（同分看等级合计、回合），只统计回放能读到启灵的队伍；切到「按等级合计」时不再过滤，缺启灵的显示 `—`。展开行按 `uid|唤醒体 tid` 查 `gear.json` 的 `map`，没记录就写「命轮 / 密契未公开」。
- 回放抓取结果（`{s,u,k,ks,m}` 四个字段一行）已压缩存进 `data/morimens/mainhard/replay-cache.jsonl.gz`，重放版式时直接 `py scripts/build_main_hard.py <stages 目录> --detail data/morimens/mainhard/replay-cache.jsonl.gz` 即可，不必重下（回放过期后也下不回来）。本次 6090 条通关命中 3910 条（64.2%），其余在页面上显示「—」。
- **改完 `morimens-tools.js` 记得同步 `morimens-tools.html` 里的 `?v=`**：入口脚本的缓存戳写死在 html 第 194 行（`<script src="morimens-tools.js?v=20261125.4">`），与 `assetVersion` 是两个独立的值。只改 `assetVersion` 而不动 html，回访用户可能命中磁盘缓存里旧的 tools.js，进而按旧版号去加载旧模块（症状是「页面还是老样子」）。
- 页面没渲染出内容时不要急着怀疑数据：`#morimensMainHardTab` 存在不代表模块已求值，点了没反应是点击早于绑定。验收脚本 `H:/work/tmp/mhlive.mjs` 会轮询点这个 tab 直到出现 `[data-mh-view]` 再判断，线上/本地都通用（`node mhlive.mjs [BASE]`，`LOOP=1` 逐个展开找有融灾记录的行，`SHOT=` 存图）。

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

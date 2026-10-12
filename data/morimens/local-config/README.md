# 游戏客户端本地配置表（筛选后）

2026-10-12/13 从 Steam 客户端运行时已加载的 Lua 配置只读导出（由维护者提供，原始包 `morimens-full-local-20261012.zip`）。
这里保存的是**已上线内容 + 带解锁时间的未上线内容**的子集（页面按 `index.json` 里的 `u` 到点自动解锁，数据文件本身是公开的）（gzip 压缩 JSON），由 `scripts/build_map_overview.py` 生成：

| 文件 | 内容 |
| --- | --- |
| `stages.json.gz` | 关卡、地图引用、线性节点序列、怪物数值模板引用 |
| `maps.json.gz` | 八行地图格位（每个格位保留全部节点变体） |
| `nodes.json.gz` / `node-types.json.gz` | 节点（类型、效果、战斗配置引用）/ 节点类型名称与说明 |
| `battles.json.gz` | 战斗编组：怪物、槽位、站位 |
| `monsters.json.gz` / `skills.json.gz` | 怪物名称、描述、技能 ID / 技能说明 |
| `train-stages.json.gz` | 记忆回廊「疾驰的欢愉专列」（`MapType=3`）：关卡 → 阶段 → 节点组 / 章节选项 → 节点 → 随机变体 / 战斗 / 怪物 |
| `stage-monster-data.json.gz` / `stage-data.json.gz` | 关卡怪物数值模板 / 战斗统计项 |

关联路径：`stages.mapIds[] → maps.id → maps.cells[].variants[].nodeId → nodes.id → nodes.battleConfigId → battles.id → battles.monsters[].monsterId → monsters.id → monsters.skillIds[] → skills.id`；`MapType=2` 的关卡直接通过 `stages.nodeSequence[] → nodes.id` 关联。

**未收录**：没有地图的关卡，以及发布时间未知的内容（太岁、罗马、本源深海淑女，见 `scripts/data/map_unlocks.json` 的 `hold`；拿到上线时间后改到 `unlock` 即可自动解锁）。解锁时间：融灾期数按 14 天周期推算，薇薇安为 2026-10-19 09:00（+08:00，暂定）。需要重新生成时运行
`python3 scripts/build_map_overview.py <解压后的目录> --repo . --include-future`（`--max-dzone`、`--hide` 可调整收录范围；`--include-future` + `--unlock` 会写入未上线内容并按时间解锁，注意仓库是公开的）。

页面使用的精简数据在 `data/morimens/maps/`（`index.json` 关卡索引与节点类型、`maps.json` 地图格位与节点、`battles.json`、`monsters.json`、`stage-stats.json`、`train.json` 列车路线）。

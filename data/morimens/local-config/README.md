# 游戏客户端本地配置表（筛选后）

2026-10-12/13 从 Steam 客户端运行时已加载的 Lua 配置只读导出（由维护者提供，原始包 `morimens-full-local-20261012.zip`）。
这里保存的是**已上线内容**的子集（gzip 压缩 JSON），由 `scripts/build_map_overview.py` 生成：

| 文件 | 内容 |
| --- | --- |
| `stages.json.gz` | 关卡、地图引用、线性节点序列、怪物数值模板引用 |
| `maps.json.gz` | 八行地图格位（每个格位保留全部节点变体） |
| `nodes.json.gz` / `node-types.json.gz` | 节点（类型、效果、战斗配置引用）/ 节点类型名称与说明 |
| `battles.json.gz` | 战斗编组：怪物、槽位、站位 |
| `monsters.json.gz` / `skills.json.gz` | 怪物名称、描述、技能 ID / 技能说明 |
| `stage-monster-data.json.gz` / `stage-data.json.gz` | 关卡怪物数值模板 / 战斗统计项 |

关联路径：`stages.mapIds[] → maps.id → maps.cells[].variants[].nodeId → nodes.id → nodes.battleConfigId → battles.id → battles.monsters[].monsterId → monsters.id → monsters.skillIds[] → skills.id`；`MapType=2` 的关卡直接通过 `stages.nodeSequence[] → nodes.id` 关联。

**未收录**：尚未开始的融灾关卡、未发布唤醒体（如薇薇安）的活动关卡、没有地图的关卡，以及 `MapType=3` 的「疾驰的欢愉专列」（专用表尚未解析）。需要重新生成时运行
`python3 scripts/build_map_overview.py <解压后的目录> --repo .`（`--max-dzone`、`--hide` 可调整收录范围；`--include-future` + `--unlock` 会写入未上线内容并按时间解锁，注意仓库是公开的）。

页面使用的精简数据在 `data/morimens/maps/`（`index.json` 关卡索引与节点类型、`maps.json` 地图格位与节点、`battles.json`、`monsters.json`、`stage-stats.json`）。

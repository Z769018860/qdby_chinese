# 《忘却前夜》本机配置 JSON

2026-10-12 至 2026-10-13 从 Steam 客户端运行时已加载的 Lua 配置只读导出。未使用 OCR 或网络资料。所有文件都是 UTF-8 JSON；数组中的记录以 `id` 为主键，`config` 保留该表的原始字段（文本已从 UTF-8 字节解码）。

| 文件 | 记录数 | 内容 |
| --- | ---: | --- |
| `stages.json` | 6,525 | 关卡、地图引用、线性节点序列、怪物数值配置引用 |
| `maps.json` | 1,418 | 八行地图格位；每个格位保留全部节点变体 |
| `nodes.json` | 8,227 | 节点类型、效果和战斗配置引用 |
| `node-types.json` | 80 | 节点中文名与说明 |
| `battles.json` | 6,805 | 怪物编组、槽位和站位 |
| `monsters.json` | 623 | 怪物名称、描述、技能 ID 及原始配置 |
| `skills.json` | 3,635 | 技能说明、类型和原始配置 |
| `stage-monster-data.json` | 3,884 | 关卡怪物等级、生命、攻击、防御等数值模板 |
| `stage-difficulty.json` | 1,020 | 难度与关卡怪物数值配置引用 |
| `stage-data.json` | 14 | 其他关卡数据项 |
| `manifest.json` | 1 | 来源、表计数、关联规则与完整性检查 |

关联路径：`stages.mapIds[] → maps.id → maps.cells[].variants[].nodeId → nodes.id → nodes.battleConfigId → battles.id → battles.monsters[].monsterId → monsters.id → monsters.skillIds[] → skills.id`。`MapType=2` 的关卡直接通过 `stages.nodeSequence[] → nodes.id` 关联。

校验结果：地图格位到节点、普通关卡到地图、线性关卡到节点、战斗到怪物、怪物到技能的引用均无缺失。第 71 期五张地图及战斗编组与先前独立提取的文件一致。

限制：六条“疾驰的欢愉专列”关卡采用 `MapType=3`，其 27 个不同的特殊地图条目 ID 已保存在 `stages.specialMapEntries`，但对应的专用配置表尚未解析。随机格位在 `variants` 中保留候选节点；客户端模板不能确定每次实际出现哪一个。技能说明和配置已导出，战斗命令执行细节仍需其他表。

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
| `train-stages.json` | 6 | “疾驰的欢愉专列”完整节点组链，含随机章节候选、节点变体、事件与怪物编组 |
| `train-node-groups.json` | 76 | 专列使用的全部节点组原始配置 |
| `train-drop-packs.json` | 6 | 三阶段普通 / 困难与癫狂章节候选包 |
| `manifest.json` | 1 | 来源、表计数、关联规则与完整性检查 |

关联路径：`stages.mapIds[] → maps.id → maps.cells[].variants[].nodeId → nodes.id → nodes.battleConfigId → battles.id → battles.monsters[].monsterId → monsters.id → monsters.skillIds[] → skills.id`。`MapType=2` 的关卡直接通过 `stages.nodeSequence[] → nodes.id` 关联。

校验结果：地图格位到节点、普通关卡到地图、线性关卡到节点、战斗到怪物、怪物到技能的引用均无缺失。第 71 期五张地图及战斗编组与先前独立提取的文件一致。

`MapType=3` 的六条“疾驰的欢愉专列”关卡见 `train-stages.json`：`segments[]` 保留节点组顺序；`Direct` 直接列出节点；`DropPack` 列出四个等权的章节组候选。章节组的 `nodes[]` 保留顺序；随机节点的 `variants[]` 递归列出实际节点，并在战斗节点上附带怪物编组。V2 癫狂关卡另有第四阶段。每个组和候选包的原始配置分别见 `train-node-groups.json`、`train-drop-packs.json`。

限制：随机选择在实际游玩时由游戏决定，JSON 给出所有候选及配置权重。部分指令节点的 `CmdList` 执行细节仍需另行解析；客户端模板也不能保证服务器实际生成结果。技能说明和配置已导出，战斗命令执行细节仍需其他表。

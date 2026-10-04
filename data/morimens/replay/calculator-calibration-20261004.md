# 伤害计算器校准与公式审计（2026-10-04）

数据来源：334 份缓存回放的实战拟合（每名唤醒体至少 6 次可核对命中），以及对本地 SKeyDB 61 名唤醒体、553 个技能的全量公式审计。

## 全角色公式审计

- 唤醒体 61，技能 553，声明含伤害的技能 227，公式引擎已解析 184
- 未解析伤害 / 条件未解决 / 数值无效：24 / 19 / 1

| 类型 | 唤醒体 | 技能 | 等级 |
|---|---|---|---|
| unparsed-damage | Aurita | Jellyfish Congregation | 1 |
| unparsed-damage | Aurita | Power of Friendship | 6 |
| conditional-unresolved | Caecus | Bloodline of Heresy | 6 |
| conditional-unresolved | Caecus | Metamorphosed Body | 6 |
| unparsed-damage | Castor | Over the Sea of Thorns | 1 |
| conditional-unresolved | Castor | Skybound Oath | 6 |
| unparsed-damage | Celeste | Defense | 6 |
| unparsed-damage | Celeste | Everlasting Phantasm | 6 |
| conditional-unresolved | Celeste | Power of Blessing | 6 |
| unparsed-damage | Celeste | Tintless Dream | 6 |
| unparsed-damage | Corposant | Pilot | 1 |
| unparsed-damage | Daffodil | Pierce | 1 |
| unparsed-damage | Daffodil | Pierce Critical Hit | 1 |
| conditional-unresolved | Doresain | Crimson Invite | 6 |
| conditional-unresolved | Erica | Function Overload | 6 |
| conditional-unresolved | Faros | Abyssal Obsession | 6 |
| conditional-unresolved | Faros | Deep Currents | 6 |
| unparsed-damage | Doll: Inferno | Madness Infection | 1 |
| unparsed-damage | Doll: Inferno | Soulblight | 6 |
| conditional-unresolved | Goliath | Preemptive Revenge | 6 |
| unparsed-damage | Goliath | Usurp | 6 |
| unparsed-damage | Jenkin | Mice Assemble | 6 |
| unparsed-damage | Jenkin | Ultimate Assemble! | 6 |
| conditional-unresolved | Karen | Dance of the Gibbous Moon | 6 |
| conditional-unresolved | Lily | Slime Convergence | 6 |
| unparsed-damage | Lily | Undying Flower Upon Slime | 6 |
| unparsed-damage | Miryam | Revelate Devotion | 6 |
| unparsed-damage | Murphy | Divine Maiden's Birth | 6 |
| unparsed-damage | Murphy | Oath of Liberation | 1 |
| conditional-unresolved | Pollux | Path of Ablution | 6 |
| unparsed-damage | Sanga | Realm of Oblivion | 6 |
| invalid-value | Tulu | Abyss Order | 6 |
| conditional-unresolved | Tulu | Immortal Majesty | 6 |
| conditional-unresolved | Tulu | When Lemuria Returns | 6 |
| unparsed-damage | Tulu | When the Stars Are Right | 6 |
| unparsed-damage | Wanda | Slumber Counter | 6 |
| conditional-unresolved | Winkle | Self-Imprisonment | 6 |
| unparsed-damage | Xu | Enthrall | 1 |
| unparsed-damage | Vortice | Abyssal! Vortex! Cannon! | 6 |
| conditional-unresolved | Vortice | HERE IT GOES! | 6 |
| conditional-unresolved | Pontos | Another Ebwynnos | 1 |
| unparsed-damage | Pontos | Vex-Gaunt | 6 |
| conditional-unresolved | Lotan: Cetarchon | Netherblade | 1 |
| conditional-unresolved | Ogier: Oathbound | Flesh as Fortress | 6 |

## 实战拟合（默认公式误差，由高到低）

| 唤醒体 | 默认误差 | 拟合后误差 | 回放数 | 命中数 |
|---|---|---|---|---|
| 珊 | 69.8% | 50.9% | 6 | 91 |
| 萨尔瓦多 | 58.1% | 16.4% | 5 | 109 |
| 珈伦 | 42.8% | 29.4% | 9 | 106 |
| 阿拉克涅 | 41.6% | 38.4% | 4 | 30 |
| 宁菲亚 | 41.5% | 37.4% | 15 | 204 |
| 泰旖丝 | 38.9% | 30.9% | 36 | 445 |
| 法洛思 | 38.4% | 18.8% | 10 | 418 |
| 熔毁·朵尔 | 36.6% | 26.0% | 35 | 537 |
| 莉莉 | 35.9% | 34.2% | 26 | 430 |
| 弥利亚姆 | 35.1% | 18.3% | 21 | 235 |
| 希莱斯特 | 31.0% | 11.1% | 23 | 1236 |
| 菲茵特 | 30.6% | 14.0% | 12 | 189 |
| 波吕克斯 | 27.3% | 21.2% | 17 | 856 |
| 卡斯托尔 | 25.2% | 21.4% | 25 | 672 |
| 凯刻斯 | 24.7% | 17.2% | 20 | 587 |
| 阿格里帕 | 24.2% | 21.8% | 10 | 216 |
| 负誓·奥吉尔 | 23.5% | 18.9% | 6 | 130 |
| 艾尔瓦 | 21.0% | 12.2% | 7 | 74 |
| 杜勒赛因 | 20.5% | 11.6% | 10 | 159 |
| 徐 | 20.3% | 19.2% | 33 | 617 |
| 克珀珊特 | 18.7% | 14.5% | 23 | 564 |
| 图鲁 | 18.5% | 10.6% | 20 | 587 |
| 旺达 | 18.4% | 12.6% | 9 | 384 |
| 莉兹 | 17.9% | 8.1% | 5 | 579 |
| 莱克 | 16.9% | 2.2% | 16 | 343 |
| 墨菲 | 16.5% | 11.8% | 23 | 567 |
| 詹金 | 15.4% | 10.7% | 9 | 391 |
| 艾继丝 | 15.3% | 8.4% | 18 | 177 |
| 血链·希洛 | 14.4% | 8.7% | 13 | 850 |
| 达芙黛尔 | 13.7% | 9.8% | 12 | 218 |
| 奥瑞塔 | 13.3% | 10.5% | 13 | 1634 |
| 莫丝 | 13.3% | 12.1% | 29 | 1419 |
| 希洛 | 12.9% | 8.8% | 7 | 78 |
| 庞托斯 | 12.4% | 11.0% | 29 | 1457 |
| 茉夏 | 12.0% | 6.5% | 43 | 3625 |
| 卡茜亚 | 11.4% | 10.1% | 10 | 208 |
| 汀克特 | 11.3% | 9.2% | 5 | 72 |
| 戈利亚 | 11.1% | 7.8% | 16 | 178 |
| 蚀灭·萝坦 | 10.6% | 8.9% | 22 | 785 |
| 诞妄·墨菲 | 10.3% | 8.1% | 23 | 929 |
| 「24」 | 9.5% | 3.8% | 21 | 514 |
| 凯蒂古拉 | 9.3% | 8.5% | 27 | 1228 |
| 尤乌哈希 | 9.2% | 4.5% | 6 | 269 |
| 奥尔拉 | 9.2% | 7.6% | 21 | 292 |
| 温柯尔 | 9.1% | 4.9% | 2 | 14 |
| 卡拉布 | 8.7% | 7.4% | 16 | 131 |
| 塔薇 | 8.5% | 7.3% | 24 | 2030 |
| 艾瑞卡 | 7.9% | 5.2% | 13 | 172 |
| 朵尔 | 7.6% | 8.4% | 3 | 47 |
| 克莱门汀 | 7.5% | 6.4% | 32 | 1372 |
| 奥吉尔 | 7.2% | 6.9% | 12 | 170 |
| 潘狄娅 | 6.4% | 3.2% | 6 | 103 |
| 索蕾尔 | 6.2% | 2.7% | 5 | 125 |
| 萝坦 | 6.0% | 4.8% | 12 | 203 |
| 环行·拉蒙娜 | 4.5% | 3.4% | 6 | 100 |
| 哈姆林 | 4.2% | 4.8% | 18 | 923 |
| 拉蒙娜 | 4.1% | 3.9% | 11 | 589 |
| 皮克曼 | 4.0% | 1.0% | 17 | 526 |
| 雷娅 | 3.5% | 2.5% | 9 | 130 |
| 诺缔拉 | 2.3% | 1.9% | 1 | 7 |
| 沙耶 | 0.0% | 0.0% | 1 | 6 |

误差 ≤5% 的唤醒体：7 / 61；按命中数加权的平均默认误差 15.9%。

说明：误差偏高的唤醒体多为触手 / 力量层数叠加（珊、萨尔瓦多、希莱斯特）或侵蚀 / 罪印这类状态伤害，默认公式没有建模对应状态；尚未逐个修正。

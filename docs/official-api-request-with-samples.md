# 融灾数据接口需求 + 现有数据结构样例

> 忘忘看报（qingdengbuyi.top/morimens-tools.html，B 站 @青灯不弈）。以下全部为只读接口需求；样例为目前手动抓取到的真实结构（已截断，UID/昵称为公开榜单信息）。

## 一、接口需求

约定：JSON、`schemaVersion`、`ETag`、时间带时区（北京时间）、允许跨域、可限频。

### 1) `GET /dzone/seasons` — 期次列表（P0）
返回：`seasonId`、`activityTid`、`period`（期号）、`name`、`startTime`、`endTime`、`ringRealm`、`stageGroupIds[]`（按禁区 1–5 排序）、`difficulties[]`（C/B/A/S/SS/SSS/▼ 及各档基础分）、`extraTeamBonus`、`maxScore`、**`totalParticipants`**、`snapshotTime`、`isFinal`。

### 2) `GET /dzone/seasons/{id}/ranking?page=&pageSize=` — 榜单分页（P0）
参数：页码、每页条数（希望 ≥500，支持读完整榜）。
返回行：`rank`、`uid`、`name`、`score`、`playerLevel`、`avatarFrame`、`timestamp`、`stageGroups{ stageGroupId → { score, stageId, difficulty, battleUuid, battleUuidExtra } }`。
并说明并列名次规则。

### 3) `GET /dzone/seasons/{id}/players/{uid}` 或 `POST …/players:batch`（P0）
返回各禁区的「通关队 + 额外队」：
- 队伍：`stageTid`、`difficulty`、`score`、`extraPass`、`keeperSkill`（钥令 ID）、`relics[]`（造物，含品质/强化）。
- 每名唤醒体：`tid`、`level`、`breakLevel`、`levelLimitIncreaseIdx`、`potencyLevel`（启灵）、`talents`、`attrs`、`weaponSlots[]`（命轮 ID/等级/槽位）、`trinkets[]`（密契件：suitId、属性）、`assistPlayerId`（是否借用助战）。
- 战斗统计：`battleUuid`、`stageRoundCount`、`bossBattleRoundCount`、`deathResistCount`、`respawnedNum`、`totalUseCard`、`totalEnergyCost`、`maxBoutUseCard`、`maxBoutDamage`、`maxCounterAtt`、`maxTentacleDamage`、`maxStrength`、`maxPosion`、`maxHp`、`leftHp`、各唤醒体 `damage / block / heal`。
- 支持批量（一次 ≥100 个 UID）。


### 3b) `GET /dzone/battles/{battleUuid}/stats` — 战斗明细（P0，伤害 / 格挡 / 治疗拆分）
目前这部分只能从 `battleStatPackExitList` 里的二进制字段（base64 → LZ4 → MessagePack）解出，希望直接给 JSON。返回：
- `segments[]`：战斗分段（普通阶段 / 首领阶段，对应 `gearType`），每段含 `rounds[]`；
- 每回合 `perAwakener{ tid | "1"(守密人) → { skill{技能ID → {damage, block, heal}}, utilSkill{…}, state{状态ID → {damage, block, heal}} } }`；
- 技能 ID、状态 ID 的名称对照（`/meta/names?type=skill|state`）。

### 4) `GET /dzone/seasons/{id}/map` — 地图（P1）
每禁区：`stageId`、`mapId`、`width/height`、网格节点 `{x, y, nodeId, type, name, description, effect}`、起点、首领位置，其中战斗节点带 `battleId`。

### 5) `GET /dzone/battles/{battleId}` — 战斗编号 → 敌人（P1）
返回：`battleType`（普通/精英/首领）、敌人 `[{ monsterTid, position, level, hp, hpBars[], phases }]`。支持批量。

### 6) `GET /dzone/seasons/{id}/stages` — 禁区与威胁等级（P1）
每禁区：初始造物 ID、各威胁等级的等级/血量缩放、怪物 ID 列表。

### 7) `GET /dzone/monsters` — 怪物资料（P1）
`monsterTid`、中英文名、介绍、特性、技能与行动循环、数值成长。

### 8) `GET /meta/names?type=&lang=` — 名称对照（P2）
`type`：awakener / wheel / covenant / relic / keytoken / monster；返回 `id`、`name_zh`、`name_en`、`rarity`、`realm`、`releaseTime`。新内容随版本同步。

### 9) `GET /meta/avatars`、`/meta/emojis` — 头像与表情（P2）
`id`、名称、**获取方式**（核心课题 / 赛季奖励 / 请柬 / 商店 / 活动…）。

### 10) `GET /events`、`/banners` — 活动与卡池（P2）
结构化的起止时间、UP 唤醒体/命轮、复刻标记，含已公布的未来排期。

## 二、现有数据结构样例（真实，已截断）

### A. 榜单行（Rank.QueryRank，第 70 期）
```json
{
  "source": "official live Rank.QueryRank response",
  "activityTid": 83315,
  "retrievedAt": "2026-10-12T14:08:14+08:00",
  "rankRange": [1, 2000],
  "recordCount": 2000,
  "rows": [{
    "rank": 1, "uid": 100167859, "name": "扭曲双子·潶", "score": 525,
    "raw": {
      "uid": 100167859, "type": "AbyssChallenge", "avatarFrame": 54582, "timestamp": 1790628680,
      "abyssChallenge": { "activityId2Data": { "83315": {
        "maxScore": 525,
        "stageGroups": {
          "83440": { "score": 115, "stageId": 153179, "battleUuid": "ee2467a3-…", "battleUuidExtra": "d2989028-…", "wid": "6d68929e-…", "widExtra": "95fc48cd-…" },
          "83441": { "score": 100, "stageId": 153176, "battleUuid": "fbd68147-…", "battleUuidExtra": "b1307659-…" }
        }}}}
    }
  }]
}
```
缺口：没有 `totalParticipants`，没有分页，没有难度字段（难度要由 `stageId` 反推）。

### B. 玩家队伍详情（Facade.QueryFacadeFields，每行 = 玩家 × 禁区）
```json
{
  "uid": 100167859, "rank": 1, "stageGroupId": 83439,
  "response": {
    "stageTid": 153184, "score": 110, "extraPass": true,
    "team": {
      "keeperSkill": 49204,
      "awakers": [{
        "tid": 15567, "level": 90, "breakLevel": 5, "levelLimitIncreaseIdx": 10, "potencyLevel": 15,
        "assistPlayerId": 0,
        "weaponSlots": [{ "slot": 0, "weaponUid": 100177092, "level": 15, "unlocked": false }],
        "trinkets": [100177594],
        "talents": { "44846": { "lv": 12 } },
        "attrs": { "atk": 204, "def": 150, "physique": 210, "crit": 19.4, "crit_damage": 50 }
      }],
      "items": {
        "100216986": { "uid": 100216986, "tid": 9951, "suitId": 18360, "level": 12, "awaker": 77918,
                       "attrs": [{ "attrId": 18126, "val": 10, "index": 1 }] }
      },
      "recordStageData": {
        "battleUuid": "ead10772-…", "stageRoundCount": 24, "bossBattleRoundCount": 11,
        "deathResistCount": 3, "respawnedNum": 0, "totalUseCard": 244, "totalEnergyCost": 145,
        "maxBoutUseCard": 19, "maxBoutDamage": 12217005, "maxCounterAtt": 6113,
        "maxTentacleDamage": 0, "maxStrength": 965, "maxPosion": 7360, "maxHp": 2760, "leftHp": 833,
        "AwakerDoDamage": { "15567": 40369926, "15596": 297064 },
        "AwakerDoBlock":  { "15567": 470 }, "AwakerDoHeal": { "15567": 12406 },
        "relics": [{ "tid": 98407, "uid": 100220812, "stateLayer": 1 }]
      }
    },
    "teamExtra": { "…": "结构同 team（额外队）" }
  }
}
```
缺口：`items` 里的命轮/密契/饰品只有数字 ID，没有名称；`stageTid` 没有难度字段；`recordStageData` 里还有二进制的 `battleStatPack`，我们没有用到。

### C. ID → 名称（本站自己整理的对照，需要官方提供）
```json
{
  "awakers":  { "15567": { "name": "Helot: Catena", "ingameId": "B05EX", "realm": "Caro", "role": "Assault" } },
  "wheel":    { "94448": "Doomsday Rampage" },
  "creation": { "98412": "Stellar Brew+" },
  "token":    { "95548": "Undying Sun" },
  "covenant": { "18335": "April Tribute" },
  "stages":   { "153184": { "name": "Zone 4: ▼", "madness": 99 } }
}
```
缺口：本期有 15 个钥令没有官方中文名；`stages` 的难度/禁区对应靠手动维护。

### D. 本站使用的赛季数据（站点格式）
```json
{
  "seasonId": 70, "recordCount": 2000, "coverageMode": "official-rank-top2000",
  "records": [{
    "rank": 1, "player": "扭曲双子·潶", "uid": "100167859", "score": 525,
    "waves": [{
      "wave": 1, "madness": 96, "stageTid": 153180, "stageGroupId": 83444,
      "teams": [{
        "clearType": "clear", "difficulty": "threatDown", "score": 95, "battleUuid": "0a77841c-…",
        "token": { "id": 145281, "name": "Cetus-Devouring Storm" },
        "creations": [{ "id": 98412, "name": "Stellar Brew+" }],
        "members": [{
          "canonicalName": "Lotan: Cetarchon", "realm": "Chaos", "role": "Assault",
          "level": 90, "potencyLevel": 15, "breakLevel": 5, "borrowed": false,
          "wheels": [{ "id": 145300, "name": "Cetus Occasus", "level": 4 }],
          "covenants": [{ "id": 18335, "name": "April Tribute", "count": 6 }]
        }]
      }]
    }]
  }]
}
```

### E. 单场战斗汇总（站点格式，一场一行）
```json
{ "uid": 100167859, "rank": 1, "wave": 4, "slot": "clear", "battleUuid": "ead10772-…",
  "stageRoundCount": 24, "bossBattleRoundCount": 11, "deathResistCount": 3, "totalUseCard": 244,
  "totalEnergyCost": 145, "maxBoutUseCard": 19, "maxBoutDamage": 12217005, "leftHp": 833,
  "awakers": [{ "tid": 15567, "name": "Helot: Catena", "level": 90, "assist": false,
                "damage": 40369926, "block": 470, "heal": 12406 }],
  "relics": [98407, 83509] }
```

### F. 地图（第 71 期，本地表读取，站点格式）
```json
{ "period": 71, "waves": [{
    "wave": 4,
    "nodes": [ { "r": 4, "c": 1, "k": "start" },
               { "r": 4, "c": 2, "k": "combat", "i": "elite", "b": 87612 },
               { "r": 4, "c": 3, "k": "reward", "i": "bones" } ],
    "enc": { "87045": { "t": "Common", "m": [ { "tid": 13957, "p": 1 } ] } }
}]}
```
缺口：第 71 期的 `enc`（战斗编号 → 敌人）为空，对应需求第 5 项。

### G. 期次与每禁区怪物（SKeyDB 格式，第三方整理）
```json
{ "id": "dzone-0071", "period": 71, "start": "2026-10-12T01:00:00Z", "end": "2026-10-26T00:59:58Z",
  "stageEffect": "Astral Reign",
  "waves": [{ "id": "wave-1", "initialRelicIds": ["relic-0259", "relic-0089"],
    "monsterIds": ["dzone-monster-0224", "…"],
    "alerts": [{ "name": "Threat Level C",
      "monsters": [{ "monsterId": "dzone-monster-0224", "level": 41, "hp": 24615, "hpBars": 1 }] }] }] }
```

### H. 战斗明细（每唤醒体造成的伤害 / 格挡 / 治疗）— 现有结构

**H1. 每场汇总（`recordStageData`，明文）**：键是唤醒体 `tid`，`"1"` 表示守密人（钥令、状态等不属于任何唤醒体的伤害）。
```json
{
  "stageRoundCount": 24, "bossBattleRoundCount": 11,
  "AwakerDoDamage": { "1": 178921, "15567": 40369926, "15596": 297064, "15587": 17495, "77918": 554482 },
  "AwakerDoBlock":  { "1": 538,    "15567": 470,      "15596": 269,    "15587": 244,   "77918": 5901 },
  "AwakerDoHeal":   { "1": 2421,   "15567": 12406 }
}
```

**H2. 分回合明细（`battleStatPackExitList`，二进制）**：`base64 → LZ4 frame → MessagePack`，解出后是一个列表，**每个元素 = 一个回合**。
```json
{
  "battleStatPackExitList": [
    { "result": 1, "gearType": 2, "battleStatPack": "BCJNGGBAglkB…(base64)" },
    { "result": 1, "gearType": 2, "battleStatPack": "…" },
    { "result": 1, "gearType": 3, "battleStatPack": "…" }
  ]
}
```
解码后的单个分段（4 个回合的示例，已截断）：
```json
[
  { "battleValue": {
      "15567": { "state": { "2840": { "AwakerDoDamage": 7548 } },
                 "skill": { "61121": { "AwakerDoDamage": 15094 } } } } },
  { "battleValue": {
      "1":     { "state": { "3255": { "AwakerDoDamage": 978 } },
                 "skill": { "35502": { "AwakerDoHeal": 372 }, "4771": { "AwakerDoHeal": 185, "AwakerDoBlock": 185 } } },
      "15567": { "utilSkill": { "61124": { "AwakerDoDamage": 52770 } },
                 "skill": { "61119": { "AwakerDoDamage": 41248 }, "61122": { "AwakerDoDamage": 1068190, "AwakerDoHeal": 1702 } },
                 "state": { "61145": { "AwakerDoDamage": 18000 } } } } }
]
```
- 3 个分段的元素数为 4 + 9 + 11 = 24，正好等于 `stageRoundCount`；最后一段（`gearType` 3）11 个回合 = `bossBattleRoundCount`，即首领阶段。
- 所有回合、所有技能 / 状态的 `AwakerDoDamage` 相加 = 41,417,888，与 H1 的各唤醒体伤害之和完全一致。
- `skill`（技能牌）/ `utilSkill`（钥令或通用技能）/ `state`（持续伤害、增益等状态）下的数字键是技能 ID / 状态 ID，**没有名称对照**。

**H3. 其他战斗字段**（`recordStageData`）：`maxBoutDamage`、`maxBoutUseCard`、`maxBoutEnergyCost`、`maxCounterAtt`、`maxTentacleDamage`、`maxStrength`、`maxPosion`、`maxHp`、`leftHp`、`deathResistCount`、`respawnedNum`、`totalUseCard`、`totalEnergyCost`；以及 `cards[]`（本场出过的牌：`tid`、等级、归属唤醒体 `awaker`、`stateList` 状态）。

**目前站点用到的**：只有 H1 的总量和 H3 的汇总；H2 的分回合、分技能数据已经能解出，但没有技能 / 状态名称，所以无法展示「哪个技能打了多少」。

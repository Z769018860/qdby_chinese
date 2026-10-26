# 融灾看报（报纸式特刊）生成脚本

第 71 期特刊（6 版）使用的原始脚本，路径写死在 `/tmp/s71rep` 与 `/tmp/s4`，换期次时先改路径与文案。

1. 把赛季记录解码成 `season71_records.json`（后处理后的 `eremora/seasons/71.json` 即可，需含 `difficulty` / `enlightTierLabel`）；
2. `PYTHONPATH=/tmp/pylib python3 analyze71.py` → `stats.json`（统计 Top 2000、极值、出场、神秘配队、启灵）；
3. `PYTHONPATH=/tmp/pylib python3 gen71.py` → `p1..p6.html`（第 6 版是与上一期对比，需要上一期的 `stats.json` 与记录）；
4. `node shot.mjs`（Playwright / Chromium，2000×3600）→ `page1..6.png`，再转 webp 放到 `assets/morimens/reports/`，并在 `morimens-dtide.js` 的 `REPORTS` 里登记。

注意：版面高度固定 3600，`shot.mjs` 会打印 `[页高, 页脚位置, 内容底部]`，内容底部必须小于页脚位置；统计口径见每版页脚。不使用「在榜总人数」（该数字没有可靠来源）。

## 最终战增刊

`gen_boss.py <期次> <records.json> <out.html> [上期 上期records.json]` 生成「最终战增刊」一版（首领战回合数：各禁区统计、分布、最快击杀、速杀常用唤醒体、与上期对比）。数据来自 `data/morimens/dzone/season<N>/battle-summary.jsonl.gz` 的 `bossBattleRoundCount`；截图方式同 `shot.mjs`，成品 webp 为 `s70-page6` / `s71-page7`。

# 青灯不弈的汉化小结（前端 + 轻量 API）

这是一个前端页面 + 轻量 Node API 的网站（HTML/CSS/JS + data.json + images + `server.mjs`），支持搜索/筛选/排序，并提供**联网共享**的点赞与留言。

## 文件结构
- index.html
- styles.css
- app.js
- data.json（由 汉化汇总.xlsx 导出）
- images/（从 Excel 内嵌图片导出）
- server.mjs（提供 /api 接口，保存共享点赞/留言）
- .data/store.json（运行时自动生成）

## 联网共享功能（点赞 / 留言）
- 共享点赞和留言由 `server.mjs` 提供 API（`/api/*`）。
- 只用纯静态托管（例如 GitHub Pages）时，页面会自动退化为本地模式（仅当前浏览器可见）。
- 若希望“所有人互相可见”，请使用可运行 Node 的平台部署（如 VPS / Render / Railway 等）。

## 本地预览（含联网共享功能，推荐）
在该目录运行：

```bash
node server.mjs
```

然后打开：`http://localhost:4173`

## 本地预览（推荐）
由于浏览器的安全策略，直接双击打开可能无法 fetch data.json。
请用任意静态服务器预览，例如：

### 方法 A：VSCode Live Server
安装 Live Server 扩展，右键 index.html -> Open with Live Server

### 方法 B：Python
在该目录运行：
- Windows: `python -m http.server 8000`
- macOS/Linux: `python3 -m http.server 8000`

然后打开：http://localhost:8000

## 部署到 GitHub Pages
1. 新建一个 GitHub 仓库（例如 qingdengbuyi-summary）
2. 把本目录所有文件上传到仓库根目录
3. GitHub 仓库 Settings -> Pages
4. Build and deployment:
   - Source: Deploy from a branch
   - Branch: main / (root)
5. 等待页面生成后即可访问：`https://<你的用户名>.github.io/<仓库名>/`

## 更新数据
你只需要替换 data.json 和 images/（或重新用同样流程从新的 xlsx 导出）。

## 忘却前夜工具：双语与数据同步

`morimens-tools.html` 使用独立的数据同步层，不再把浏览器实时抓取 Wiki 作为唯一数据来源。

- **英文版**：结构化数据、数值、技能、命轮、密契等优先来自 `dansa/SKeyDB` 的 `public-v3` 数据。
- **中文版**：角色名称、资料、中文文本与台词优先使用“忘却前夜中文维基”的同步快照；无法匹配时回退到 SKeyDB 数据。
- **语言切换**：页面右上角提供 `中文 / EN` 切换，并使用 `localStorage` 保存选择。
- **图片**：角色头像、角色卡面，以及后续计算器所需的命轮/密契/遗物资源由 Action 镜像到本站静态目录，避免外站图片跨域或失效。
- **完整数据镜像**：`data/morimens/skeydb/public-v3/` 保存 SKeyDB public-v3 的 catalogs、records、indexes 与 metadata；前端通过 `morimens-data.js` 按需加载，而不是一次性把全部记录塞入页面。

相关目录：

```text
data/morimens/skeydb/
  awakeners.json
  manifest.json
  public-v3/

data/morimens/huiji/
  zh-CN.json
  manifest.json

assets/morimens/
  portraits/
  cards/
  wheels/
  relics/
  covenants/
```

本站自行整理的数据、统计与说明内容按 CC BY-NC-SA 4.0 共享，页面底部已署名标注；数据来源包括 SKeyDB、Morimens.Info.kr 与灰机维基（`scripts/sync_morimens_huiji_monsters.mjs` 通过 `https://morimens.huijiwiki.com/api.php` 获取怪物页）。

同步工作流：`.github/workflows/sync-morimens-skeydb.yml`。默认每天执行一次，也可在 GitHub Actions 中手动触发。SKeyDB 原创数据与中文维基原创内容按各自声明的 CC BY-NC-SA 4.0 条款使用；游戏本身的角色图片、卡面、原始文本等不因此改变其权利归属。

## GitHub Pages 注意
- 建议在仓库根目录放置 index.html / app.js / styles.css / data.json / images/
- 在仓库根目录放一个空文件 `.nojekyll`，避免 GitHub Pages 的 Jekyll 处理影响静态资源


## 融灾地图数据与翻译
- 怪物 / 地图：SKeyDB（`scripts/sync_morimens_dzone.mjs`）；怪物技能与意图：Morimens.Info.kr（`scripts/sync_morimens_dzone_intents.mjs`）；中英文翻译：Morimens-Localizations 游戏翻译表（`scripts/build_dzone_translations.py`）。
- 翻译表尚未收录的新赛季条目（技能 / 状态 / 条件文本、部分怪物名与介绍）由 AI 辅助翻译，维护在 `scripts/data/dzone_ko_*.py`、`scripts/data/dzone_monsters_zh.py`，译名并非官方，翻译表更新后会被官方文本自动覆盖。

## 自定义 T 表
`morimens-tierlist.js`：拖放式 T 表，图标池来自 `data/morimens/game/tier-pool.json`（由 `scripts/build_morimens_tier_pool.mjs` 生成，含唤醒体 / 命轮 / 造物 / 钥令 / 密契 / 头像 / 怪物，中英文名与本地图片路径）。支持导出 / 导入结构化 JSON（`format: morimens-tierlist`）与下载分享图片；数据只保存在访问者浏览器本地。

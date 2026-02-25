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


## GitHub Pages 注意
- 建议在仓库根目录放置 index.html / app.js / styles.css / data.json / images/
- 在仓库根目录放一个空文件 `.nojekyll`，避免 GitHub Pages 的 Jekyll 处理影响静态资源

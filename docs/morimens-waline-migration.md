# Waline 从 Vercel 迁到 EdgeOne（2026-11-27）

## 为什么迁

`https://textbox.qingdengbuyi.top` 那套 Waline 部署在 Vercel 免费版上，2026-11-27 因免费额度超额被平台暂停：

```
HTTP/1.1 402 Payment Required
Server: Vercel
X-Vercel-Error: DEPLOYMENT_DISABLED
```

`/`、`/api/token`、`/api/comment`、`/api/article`、`/ui/register` **全部 402**，后台也进不去。DNS（CNAME → `*.vercel-dns-017.com`）、证书、线路都是好的 —— 是平台把整个部署冻了，不是域名或代码问题。

影响面（两边站点合计 17 个文件）：

| 站 | 功能 | 依赖 |
|---|---|---|
| 忘忘看报 | 留言板、爱的节奏榜、互助助战列表、融灾队伍导入、战斗回放复盘、站点访问统计、视频页留言 | `/api/comment`、`/api/article` |
| 忘忘同人小游戏 | 账号注册/登录、云端档案、各游戏榜单同步、管理页 | `/api/user`、`/api/token` |

关键点：**小游戏站的登录体系也在这套 Waline 上**（昵称映射成 `<name>@zjtt.local` 的伪邮箱，密码由 Waline 校验），所以不能只搬评论，账号必须一起搬。

## 新架构

Waline 协议兼容层落在地已有的 EdgeOne Pages Edge Function 上，存储复用同一份 Blob：

```
看报站 / 小游戏站前端
        │  https://morimens.qingdengbuyi.top/api/waline/api/{comment,article,user,token}
        ▼
edge-functions/api/[[default]].js      路由：path 以 /waline 开头 → handleWaline
        ▼
edge-functions/api/_lib/waline.js      协议实现（零外部依赖）
        ▼
EdgeOne Blob（与点赞、云端档案、题库同一份存储）
```

为什么挂在小游戏站而不是看报站：小游戏项目已经开通 Blob 并有平台注入的凭据，看报站的边缘函数只有一个回放代理、没有存储。代价是要放行 CORS —— `ALLOWED_ORIGINS` 里必须有 `https://qingdengbuyi.top`。

## 端点对照

| 端点 | 说明 | 存储键 |
|---|---|---|
| `GET /waline/article?path=a,b&type=reaction0,reaction1` | 批量读计数，按 path 顺序返回数组 | `wa_{pathHash}` |
| `POST /waline/article {path,type,action}` | 改计数；`type:time` 是 PV | `wa_{pathHash}` + `wad_{h}_{visitor}` |
| `GET /waline/comment?path=&page=&pageSize=&sortBy=` | 分页列表（分页只算顶层，回复在 `children`） | `wc_{pathHash}` |
| `GET /waline/comment?type=recent&count=50` | 全站最新 N 条 | `wcr` |
| `POST /waline/comment` | 提交评论/机器 payload | 同上 |
| `POST /waline/user` | 注册 | `wu_{emailHash}` + `wu_id_{id}` |
| `POST /waline/token` | 登录，返回 `data.token` | — |
| `GET /waline/token`（Bearer） | 验票，小游戏后端的 whoami 打这个 | — |
| `PUT/DELETE /waline/user` | 改资料 / 注销 | — |
| `POST /waline/import`（`X-Import-Token`） | 一次性迁移入口，导完删 env | 全部 |

Waline 客户端会把 `serverURL` 拼成 `${serverURL}/api/comment`，而 `serverURL` 本身已经是 `.../api/waline`，所以实际到达的路径是 `/api/waline/api/comment`——**多出来的那层 `/api` 在最外层，不在 `/waline` 后面**。`handleWaline` 里按「先剥 `/api`(前视 `/waline`) → 再剥 `/waline` → 最后剥可能的 `/api`」三步归一。

## 三个必须知道的实现细节

**1. 密码是 phpass，不是 bcrypt。**
Waline 的 `hashPassword` 走 `phpass` 的 Portable 模式（形如 `$P$B<8 位 salt><22 位 hash>`），底层是 `md5(salt+password)` 再迭代 `2^log2` 次。WebCrypto 不提供 MD5，所以 `_lib/waline.js` 里手写了一份 MD5（已用 RFC 1321 的四组向量对齐 `node:crypto`）和 phpass 的 base64（字母表 `./0-9A-Za-z`，不是标准 base64）。

迭代次数有个坑：PHP 的 `do {} while (--$count)` 实际跑 `2^log2` 次**额外**迭代，不同移植对边界理解不一。所以 `phpVerify()` 两种都试（`delta 0` 与 `delta -1`），老库里的哈希不会因为差一轮就全员登不上。单次验证 15–20ms。

**2. 机器提交的 payload 藏在 HTML 注释里。**
融灾/互助提交把结构化数据塞在 `<!--MORIMENS_DZONE_V1:...-->` 里，前端要从 DOM 读回来。`renderComment()` 先把注释段挖出来、转义其余部分、再把注释原样放回，否则 payload 会被转义成可见文本。`MORIMENS_ASSIST_V1:base64` 这种纯文本形式的 payload 则原样保留。

**3. 时间字段：`createdAt/insertedAt` 必须是 ISO 字符串，并且要额外给一个 `time`。**

客户端的相对时间逻辑对字符串才做 `new Date(str)`，拿到数字会直接当 Date 对象用，结果渲染成 `NaN-NaN-NaN`；所以库里的 `createdAt/insertedAt` 一律存 `new Date(ms).toISOString()`，内部排序时用 `Date.parse()`、失败再回退 `objectId`（本身就是毫秒戳）。

另外客户端真正读的渲染字段是 `comment.time`（毫秒），只给 `createdAt` 不够——提交、历史导入、`wcr` 最新索引三处都要同时写 `time`。

## 迁移步骤

1. **部署**：小游戏 EdgeOne 项目重新部署（`edge-functions/` 不会随 git push 自动更新，必须在控制台重部署）。
2. **配环境变量**（小游戏项目）：
   - `WALINE_IMPORT_TOKEN` = 随机长串（迁移用，导完可删）。**这个省不掉**：没配时 `/api/waline/import` 直接 503，
     因为那是唯一能批量改写全部评论和账号的入口，不能留无鉴权的口子
   - `ALLOWED_ORIGINS` **可以不配**：`qingdengbuyi.top` 及其子域已写成后缀放行（含 http），不会被这个变量顶掉。要配就照常配其他来源
   - `WALINE_JWT_SECRET` 可选，不配会首次自动生成并存进 Blob
3. **验证**：`curl https://morimens.qingdengbuyi.top/api/waline` 应返回 `{"errno":0,...,"service":"waline-edge"}`。
4. **导数据**：GitHub 仓库 Secrets 加同名 `WALINE_IMPORT_TOKEN`，然后手动跑 `Migrate legacy Waline data to EdgeOne`：
   - 第一次 `dry_run: true`，只读库打印统计（评论数、用户数、**密码哈希前缀分布**）
   - 确认无误后 `dry_run: false`，分批 POST 到 `/api/waline/import`
   - 数据不落地仓库：用户密码哈希只在 CI 内存里过一趟
   - 脚本开跑前会先发一条 `{"purge":["/__probe__"],"purgeUsers":["probebot@zjtt.local"]}`，
     把验收阶段写进去的探针评论和测试账号清掉（探针会顶在首页「最新留言」第一条，
     测试账号占着 id=1 会和旧库里的管理员撞号）
5. **收尾**：迁移完成后删掉两个 `WALINE_IMPORT_TOKEN`（EdgeOne env + GitHub secret），避免留一条能改写全部数据的后门。

## 验收

```bash
# 服务在不在
curl -s https://morimens.qingdengbuyi.top/api/waline

# 计数（应返回数组，且能读到旧赞数）
curl -s 'https://morimens.qingdengbuyi.top/api/waline/api/article?path=%2F__morimens_love_rank__%2Fawakener-0001&type=reaction0,reaction1'

# 评论分页（顺带确认每条都带 ISO 的 insertedAt 和毫秒的 time，否则前端时间是 NaN）
curl -s 'https://morimens.qingdengbuyi.top/api/waline/api/comment?path=%2F&page=1&pageSize=5'
```

前端侧用无头浏览器过一遍（`H:/work/tmp/walineprobe.mjs <BASE> 留言` / `节奏`），重点看 `REQS` 里不再出现 `textbox`、`PANEL` 里没有「加载失败」。

## 回滚

代码层面回滚到旧地址即可（把 17 个文件的常量改回 `https://textbox.qingdengbuyi.top`）。但注意 Vercel 那个部署是平台暂停的，回滚等于功能继续不可用 —— 真要回滚只能把 Waline 部署到别的平台，再改回地址。

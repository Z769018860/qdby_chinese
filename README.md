# 青灯不弈的个人站（汉化站 + 视频站）

这是一个前端页面 + 轻量 Node API 的网站（HTML/CSS/JS + data.json + images + `server.mjs`），支持搜索/筛选/排序，并提供**联网共享**的点赞与留言。

## 站点分区

| 页面 | 说明 |
| --- | --- |
| `index.html` | **汉化站**：汉化作品索引。表格在「链接」后新增「网盘状态」列，显示各网盘有效/失效率与检查时间（数据来自 `data/netdisk-status.json`）。筛选区新增「游戏平台」「题材」，并把「游戏时长」「游戏价格」改为归一化分档 |
| `videos.html` | **视频站**：B 站全站投稿、专栏与**微博动态**三合一。除 9 个内容分类外，提供 8 组**多维细分筛选**（题材 / 游戏平台 / 要素 / 游戏价格 / 游戏体量 / 视频时长 / 视频形式 / 地区语种），支持搜索、年份、排序与分页加载；卡片上直接显示游戏名、价格、平台，并可跳转 Steam 商店页或原版地址 |
| `videos.js` | 视频站逻辑，数据来自 `data/videos.json` + `data/games.json` + `data/weibo.json` |

两个页面顶部都有分区导航，可互相跳转。

## 维度是怎么来的

改版后不再只靠标题猜，而是**以「游戏」为中心**组织数据：

1. 逐条抓取 1085 个投稿页面的简介（`x/web-interface/view`，浏览器内同源请求，成功率 100%）
2. UP 主在简介里手写了结构化信息，直接解析：

   ```
   游戏名称：死刑前的心理咨询（刑死のためのカウンセル）
   游戏平台：PC/STEAM
   游戏价格：33
   ```

   共 730 条投稿带「游戏名称」，553 条带「游戏平台」，552 条带「游戏价格」
3. 简介没写游戏名的，用标题里的《书名号》或已知长线手游（明日方舟 / 忘却前夜 / 剑网3 / 光芒 / 食物语）兜底
4. 归并成 **658 个游戏实体**，`data/games.json` 里每个实体带平台、价格（含日元/美元折算）、题材、要素、累计投稿时长
5. 微博同步的 repo / 安利里出现、但没有投稿的游戏，也会补成实体（标记 `src: weibo`）

| 维度 | 取值 | 来源 |
| --- | --- | --- |
| 题材 | 悬疑推理、恐怖惊悚、猎奇血腥、病娇偏执、解谜逃脱、乙女恋爱、文字AVG、科幻末世、奇幻异世界、校园青春、搞笑喜剧、治愈温情、电波meta、动作战斗、卡牌肉鸽、模拟经营、历史时代、现实社会 | 简介里的游戏说明 + 标题关键词 |
| 游戏平台 | Steam / PC单机 / Switch·NS / 手机端 / 网页 / 主机掌机 / itch.io / BOOTH / DLsite / freem! | 简介「游戏平台」字段归一化 |
| 要素 | 全语音、部分语音、多结局、像素风、手绘绘本、3D、真人实拍、BL、百合GL、GB、SM调教、人外、内购抽卡、体力机制、官中、机翻润色、试玩demo、高难度、长篇剧本、短篇小品 | 简介正文关键词 |
| 游戏价格 | 完全免费 / ≤¥30 / ¥30–70 / >¥70 / 未知 | 简介「游戏价格」（日元按 0.048、美元按 7.2 折算） |
| 游戏体量 | 试玩 ≤2h / 短篇 2–8h / 中篇 8–20h / 长篇 20h+ | **该游戏全部投稿的累计时长** |
| 视频时长 | ≤5min / 5–20min / 20–60min / 1h+ | 单条视频本身长度 |
| 视频形式 | 汉化发布、安利推荐、攻略成就、试玩demo、总结盘点、记录碎碎念 | 标题关键词 |
| 地区语种 | 日本/日乙、欧美/英乙、国产/国乙 | 标题关键词 |

覆盖率：**1085 条投稿中 1014 条（93%）能落到具体游戏**，因此平台 / 价格 / 题材 / 要素这四组维度基本是全覆盖，不再是「仅已关联汉化作品的 53 条」。

## 游戏地址（Steam 商店页）

`store.steampowered.com` 在本机网络不可达（TCP 直接失败），改走可访问的
`steamcommunity.com/actions/SearchApps/<关键字>` 拿 appid，再拼出
`https://store.steampowered.com/app/<appid>/`。

- 364 个 Steam 平台游戏里匹配到 **153 个**（阈值：名称相似度 ≥0.82，避免张冠李戴）
- 匹配用原名 / 中文名 / 别名逐个试；中文名在 Steam 的搜索索引里查不到（只索引英文/日文名），所以中文独占译名会漏
- 没有匹配到、或本来就不是 Steam 的游戏，用简介里的「原版地址」（novelgame / BOOTH / DLsite / itch / freem! 等）

## 微博同步（repo / 安利）

微博的翻页是硬门槛：`m.weibo.cn` 未登录时 `page>=2`、`since_id`、`max_id` 全部返回
`ok:-100`（跳 passport），`s.weibo.com` 直接跳登录页，主页首屏只有最新 12 条。
所以分两种情况：

| 是否登录 | 能拿到的量 | 做法 |
| --- | --- | --- |
| 未登录 | **约 50 条**（搜索第一页拼接） | 用 64 部作品的汉化名/原名、游戏库高频游戏名、`repo/通关/感想` 等关键词逐个检索，按 `user.screen_name` 过滤 |
| 已登录 | **4018 条全量** | 存一份登录态后 `getIndex&page=N` 逐页走完整条时间线 |

```bash
node scripts/weibo/collect_weibo.mjs --login   # 弹一次可见窗口扫码，登录态落在 edgeprofWB
node scripts/weibo/collect_weibo.mjs           # 之后自动走全量 + 补全
```

采集完统一补全两件事（都要在 `m.weibo.cn` 页面上下文里同源请求）：
`/statuses/show?id=` 拿**完整配图列表**（搜索卡片常只给一张缩略图），
`/statuses/extend` 拿**长微博全文**（卡片上的正文是截断版）。补完 4000 条、3113 张图。

> 登录态也可以从浏览器里「借」：`scripts/netdisk/browser_cookies.py` 能解 Chromium 系
> （含 360 极速）的 cookie 库，注意新版会在明文前塞 32 字节 `sha256(host)`，不剥掉
> `SUB`/`SESSDATA` 会变成二进制脏数据。

**站点只收汉化相关的三类**（`QD_WEIBO_KINDS` 可改，默认 `repo,release,promo`）：
4000 条里有 3634 条是转发与闲聊，全塞进 `weibo.json` 会让页面变成 6 MB 的噪音场。
筛完是 366 条（repo 253 / release 60 / promo 53），关联到 150 部作品，另有 42 个
「只在微博里出现过」的作品被补建成实体。

配图全部自托管 + 压缩（`download_pics.py`，814 张 / 40 MB，平均 50 KB）：

1. 取图床的 `mw690` 段（原图 mw2000 单张 0.5~1 MB，三千多张就是 2 GB+）；
2. 本地再用 Pillow 压一遍：长边 ≤ 700、JPEG 质量 74、progressive + optimize、
   丢掉 EXIF；实测比源图小约 1/3，肉眼看不出差别；
3. 存成 `assets/weibo/<hash>.jpg`，`prune_pics.py` 负责清掉重建数据后没人引用的孤儿图。

必须自托管：微博图床对第三方站点防盗链，本机无头浏览器整条链路拿不到图，
页面会变成一排灰格子；`curl` 却是 200，所以下载走 curl。原图 URL 另存在 `picsOrig`，
「查看原图」仍然跳微博图床。

- 分类：`release` 汉化发布 / `repo` 游玩repo / `promo` 安利推荐 / `other` 其他
- 每条微博会解析出提到的游戏，能对上的直接挂到游戏实体；对不上但内容确实是 repo/汉化发布的，补建成新实体
- 配图最多显示 9 张，点开是大图查看器（左右键翻页、可跳原图）
- 交互：卡片上的「微博 N」跳到微博页并按该游戏过滤；微博卡片上点游戏名则跳到投稿页过滤

## 相关数据与脚本

- `data/games.json`：游戏维度库（658 个实体）。每条含 `plat / price / pz / topics / els / hours / size / store.steam / url / vcount / videos`，以及 `vidmap`（bvid → gid）
- `data/videos.json`：视频站数据（视频 + 专栏）。每条投稿已把游戏维度打平到记录上（`gid / gn / plat / genre / el / pz / gs`），顶层 `facets` 定义 8 组维度
- `data/weibo.json`：微博动态（366 条汉化相关：分类、正文、配图、关联游戏），`by_game` 供卡片反查
- `assets/weibo/`：微博配图本地副本（814 张 / 40 MB，长边 ≤700、q74；原图 URL 仍留在 `picsOrig`）
- `data/netdisk-links.json` / `.md` / `.html`：网盘链接台账（不在汉化站导航中引用）
- `data/netdisk-status.json`：按作品聚合的网盘状态，供汉化站表格列使用
  - 覆盖 64 个作品 / 179 条链接：有效 111、失效 64。失效集中在夸克网盘（37 条，多为「文件涉及违规内容 41010」）与 UC 网盘（5 条）
  - 每条记录含 `total / ok / dead / unknown`、按平台拆分的明细与 `checked_at` 检查时间
- `data/netdisk-autofill.json` / `.md`：自动补档结果，见下节
- `data/netdisk-reshare.json`：重新建出来的分享（含平台、提取码、核验状态、评论 rpid）
- `data/netdisk-violation.json`：违规文件改装记录（改装前后 md5、输出路径、是否已上传）
- `data/netdisk-reupload.json`：本机补档能力（客户端 / 登录态 / 补丁文件）探测结果
- `scripts/netdisk/`：网盘链接抓取、核验与补档
  - `daily_check.py`：**每天 0 点巡检**——核验全部网盘链接、更新站点数据、全灭时发告警邮件（见下节）
  - `refresh.py`：抓发布页 + 评论 + 专栏，抽链接并核验（`check_spa.mjs` 负责需渲染的盘）
  - `hunt_comments.mjs`：按视频重扫评论区（最热 + 最新各 3 页，含楼中楼），把带网盘域名的评论整条存进 `raw/hunt_comments.json`
  - `autofill.py`：算「当前可用链接」、自动切换、补抓候补、生成求档清单
  - `reshare.py`：`index / plan / run` 三步——递归索引自己两个云盘 → 与失效清单模糊匹配 → 建新分享并核验
  - `post_comments.py`：把新链接发到对应投稿的**置顶评论下方回复**里（`--dry` 演练、`--cleanup` 清理旧顶层评论、`--reformat` 把已发的改写成长短版）
  - `reupload.py`：探测百度/夸克/迅雷客户端与登录态、匹配本地补丁文件，判断能否自动重传
  - `reup_violation.py`：违规文件 `probe` / `fetch`（下载 → 换哈希改装），见下节
  - `browser_cookies.py`：解 Chromium 系 cookie 库（AES-GCM + 剥 32 字节 host 哈希前缀）
- `scripts/bili/`：B 站抓取与构建
  - `up_app.py` / `up_articles.py`：投稿列表与专栏列表
  - `fetch_descs.mjs`：逐条抓投稿简介（浏览器内同源 fetch，1085 条 0 失败）
  - `taxonomy.py`：题材 / 要素 / 平台 / 价格词表与归一化（繁简、书名号、币种折算）
  - `build_games.py`：简介 → 游戏实体（`data/games.json`）
  - `lookup_steam.py`：Steam 商店页匹配（带本地缓存 `raw/steam_lookup.json`）
  - `build_videos.py`：组装 `data/videos.json`
- `scripts/weibo/`：微博同步
  - `fetch_weibo.mjs`：主页首屏
  - `collect_weibo.mjs`：采集 + 补全（`--login` 存登录态走全量；未登录只走搜索）
  - `download_pics.py`：配图下载 + 压缩到 `assets/weibo/`（走 curl，绕开浏览器链路的防盗链）
  - `prune_pics.py`：清掉重建数据后没人引用的孤儿图
  - `collect_full.py`：Python 版全量采集（断点续跑，逐条补图 / 补全文）
  - `fetch_full.mjs`：早期单独补全文的脚本（已并入 `collect_weibo.mjs`）
  - `build_weibo.py`：分类、按 `QD_WEIBO_KINDS` 筛选、关联游戏、补建「只有微博」的游戏实体

## 网盘与自动补档（汉化站）

**页面上不出现任何网盘地址。** 每个作品的「网盘 / 补档」列只说明三件事：
用哪个盘、提取码是多少、这条链接写在（简介 / 置顶评论 / 评论区 / 微博）哪里；
点「去发布处」跳回 B 站视频，由用户自己在原发布页取链接。
「发布页」栏位如果本身填的就是网盘地址，也会被拦掉（`PAN_RE`），不渲染成链接。

这么做的原因有两个：链接失效时页面不会留一个点了没反应的死链；
补档地址也不至于直接摊在明面上被批量扫走。

```
《死刑前的心理咨询》  [百度网盘 ✓] [夸克 ✕] [迅雷 ✕]
已自动切换 · 去发布处 ↗ · 补档详情 · 检查于 10-24
```

### 补档的四层处理

| 层 | 做法 | 现在的结果 |
| --- | --- | --- |
| 自动切换 | 一个作品常同时挂百度 / 夸克 / 迅雷多条链接，挂的往往只是一条，按平台优先级切到还活着的那条 | 64 个作品里 33 个走这条路，用户全程无感 |
| 自动重找 | 全部失效时回到简介 / 评论区 / 微博全文 / 专栏重抽链接，再走与巡检相同的接口核验 | 35 个失效作品扫出 37 条带网盘链接的评论，核验后可用 0 条（别人的转存都过期了） |
| 重新分享 | 文件还在自己云盘里：递归索引 → 名称模糊匹配 → 建新分享 → 立刻核验 → 写进对应视频的置顶评论 | **23 个作品 / 29 条新分享**（夸克 25 / 百度 4），全部 `verified` |
| 本地重传 | 上面三条都走不通（多见于百度判定违规），才需要把文件重新打包再传 | 见下两节 |

`data/netdisk-autofill.json` 里 `state` 分 ok / failover / recovered / reshared / pending / none。
弹层里「刚补的档」列出这次重新分享的平台与提取码，仍然不直出地址，
只告诉你去视频「置顶评论的回复」里找「【补档】」那条。
「自动补档」一行会直接写明本机卡在哪一步。

### 新链接写在置顶评论的回复里（`post_comments.py`）

不新开顶层评论——顶层会刷屏、也容易被折叠。做法是找到该投稿的**置顶评论**
（`x/v2/reply?sort=2` 的 `data.upper.top`，其次是 `data.top`），
把补档内容以 `root=parent=<置顶rpid>` 发成楼中楼：

```
置顶评论（游戏说明…）
└── 【补档】《冬鸦何处去》
    百度网盘：https://pan.baidu.com/s/xxxx 提取码：qdby
    夸克网盘：https://pan.quark.cn/s/xxxx 提取码：qdby
```

- 评论只放**两样东西**：补档标记 + 网盘链接。不写免责声明、不写站内引导语——
  评论越干净越不像广告，读者也只用看地址
- 20 个作品命中 UP 主置顶；「拍卖开始的五分钟后」那条视频没有置顶评论，退回发顶层
- `--reformat` 是配套的改写工具：先发新的短版，成功了再删旧的（顺序反了会丢链接）
- 接口有个坑：`ps` 上限是 20，写 30 直接 `code:-400 ps out of bounds`
- 发完立刻用 `x/v2/reply/reply?root=` 复查，确认挂在置顶下面

```bash
python scripts/netdisk/reshare.py index      # 索引自己云盘（夸克走 drive-pc，百度走 api/list 递归）
python scripts/netdisk/reshare.py plan       # 模糊匹配失效清单，低于阈值宁可不补
python scripts/netdisk/reshare.py run        # 建分享 + 核验，写 data/netdisk-reshare.json
python scripts/netdisk/post_comments.py      # 发到置顶评论的回复里
```

匹配上宁可少不能错：「恶魔之心」曾经被匹到「恶魔之心：被诅咒的试炼」的补丁，
现在加了别名展开（去掉书名号 / 版本号 / 汉化尾缀）、短名占比惩罚和冲突排他，
23/35 命中全部人工复核过。夸克分享文件夹走异步任务，建完只回 `task_id`，
要再查一次 `/1/clouddrive/task` 才拿得到 `share_id`。

### 违规文件：下载 → 改装 → （客户端上传）

百度建分享时对 5 个文件直接返回 `errno=109 文件违规`，这判定是按**内容哈希**走的，
改文件名、换目录、改分享标题一概没用。`reup_violation.py` 把能自动化的部分做完：

```bash
python scripts/netdisk/reup_violation.py probe   # 实测两个云盘的上传能力，写进 data/netdisk-violation.json
python scripts/netdisk/reup_violation.py fetch   # 下载 + 换哈希改装到 work/reup/
```

改装两种打法，都不改内容、不破坏原密码：

- 明文 zip：逐条重建条目（名字 / 时间戳原样），再追加一个 `补档说明.txt`；
- 加密 zip / rar / 7z：原文件整包塞进新 zip（STORED，不二次压缩），外层解出来还是原来那个文件。

实测 5 个文件全部是加密 zip，走第二条：md5 全部改变（如 `68d7eb92…` → `cf51e6c5…`），
体积基本不变（286 MB → 286.8 MB）。产物在 `work/reup/`。

**上传这一段在本机确实走不通**，`probe` 出来的证据：

| 平台 | 结果 |
| --- | --- |
| 百度 | `xpan/file?method=precreate` → `errno=9019 need verify`（风控要验证码）；`pcs/superfile2` → 403，因为要 `access_token`，而客户端会话只给 `BDUSS/STOKEN/PANPSC`，`gettemplatevariable` 取 access_token 返回空；网页端 cookie 的 `bdstoken` 也是空串（`errno:-6`） |
| 夸克 | `file/upload/pre` 能拿到 `upload_id` / `auth_info`，但直传域名 `pds.quark.cn` 本机 DNS 解析不到，OSS bucket `ul-zb` 也不对外（PUT 全 404） |

所以最后一步是人工接力：把 `work/reup/*（补档版）.zip` 拖进客户端上传，
再跑 `reshare.py index && reshare.py run`，就会自动把它们纳入索引、建分享、发评论。

**这一步已经走完。** 5 个改装包全部上传到百度网盘根目录，
`reshare.py` 的匹配为此加了一条规则：云端同时存在原件和「（补档版）」时，
**含「补档」二字的那个优先**（原件建分享照样 `errno=109`，见 `plan` 的分数加成）。
结果（均 `verified`）：

| 作品 | 百度网盘补档 | 提取码 |
| --- | --- | --- |
| 舌头上的动物园 | `pan.baidu.com/s/1RNICbPcZ1ujldNFsB1jWUw` | qdby |
| HIKEBACK | `pan.baidu.com/s/1gn3U07hd5yLbuzf3RSkGgw` | qdby |
| 拍卖开始的五分钟后 | `pan.baidu.com/s/1DXZw23vf3N-IG5iniB6AcQ` | qdby |
| 恶魔之心：被诅咒的试炼 | `pan.baidu.com/s/1HbTmVAIZFMuPpZc7cno2Aw` | qdby |
| 惩罚之吻 | `pan.baidu.com/s/1NZjlDgVvDmb1y-8XRohRig` | qdby |

这 5 条连同原有的夸克镜像一起写进了对应视频的置顶评论回复。

> **一个例外**：「舌头上的动物园」的百度分享建好约 10 分钟后被系统取消
> （再建一次直接 `errno=109`，说明复审按解密后的内容判的违规，外面套一层 zip 已经不够）。
> 这条的补档入口只剩夸克镜像，`post_comments.py --reformat` 把它那条评论
> 重写成了只含夸克一条——被判死的链接不会再出现在评论区。
> 其余 4 个百度分享在次日巡检时仍为 `ok`。

### 本地重传（`reupload.py`）

自动补档要同时成立三件事，缺一件就补不成，所以脚本不假装能补，而是把缺的那件说出来：

1. **客户端在** —— 百度网盘 / 夸克网盘 / 迅雷 至少装一个
2. **客户端已登录** —— 只有登录态才能往自己网盘写文件、建分享
3. **本地有补丁文件** —— 没文件就无从上传

```bash
python scripts/netdisk/reupload.py                      # 探测 + 匹配，产出 data/netdisk-reupload.json
python scripts/netdisk/reupload.py --dir D://补档        # 指定补丁目录（可多次给）
```

每部待补档作品的 `state` 是 `done / ready / need_file / need_login / no_client` 之一。
看一眼就知道是没装客户端、没登录，还是找不到文件。

> 现阶段本机实测：百度网盘客户端在且已登录（`BDUSS/STOKEN/PANPSC` 完整，能读能建分享）、
> 夸克网盘客户端在（`__puus` 已拿到，能读能建分享）、迅雷云盘没有 `pan.xunlei.com` 会话；
> 补档目录里没有原始补丁文件 —— 所以「读 / 分享」这一半全通，「写」这一半被风控挡住。

### 重新生成

```bash
node scripts/netdisk/hunt_comments.mjs   # 需要浏览器调试端口 9227
python scripts/netdisk/reupload.py       # 探测客户端 / 登录态 / 补丁文件
python scripts/netdisk/autofill.py       # 产出 data/netdisk-autofill.json / .md
```

`hunt_comments.mjs` 默认只扫台账里有失效链接的视频，结果按 bvid 缓存在
`raw/hunt_comments.json`，`QD_FORCE=1` 可强制重扫。

### 每天 0 点自动巡检（`daily_check.py`）

一条命令干完四件事：核验 → 回写台账 → 重建站点数据 → 全灭告警。

```bash
python scripts/netdisk/daily_check.py            # 全量巡检 + 更新站点 + 发信
python scripts/netdisk/daily_check.py --fast     # 跳过迅雷/城通/微云的浏览器通道
python scripts/netdisk/daily_check.py --no-mail  # 只巡检不发信
python scripts/netdisk/daily_check.py --push     # 顺便 git commit & push
python scripts/netdisk/daily_check.py --test-mail # 只验证发信配置
```

- **核验**：百度/夸克/UC/123/蓝奏走接口（`refresh.py` 的 `API_CHECKERS`），
  迅雷/城通/微云是 SPA，脚本自己 `--headless=new` 拉起 Edge/Chrome（`--remote-debugging-port=9223`），
  跑完关掉、临时 profile 一并删除，**不需要事先开着浏览器**
- **补档链接一起验**：`netdisk-reshare.json` 里那 29 条也算进来。
  否则「原链全死、补档还活着」会被误报成全灭。验完把 `checked / checked_at`
  写回条目，站点弹层里那条补档若也失效了会标「复查：这条也已失效」
- **更新站点**：`netdisk-links.json / .md / .html` → `netdisk-status.json` →
  `netdisk-autofill.json / .md`，前端是 `cache:"no-cache"` 拉取，不用改版本号
- **告警**：某个作品「一条可用链接都没有、且至少有一条明确失效」才发信
  （全 `unknown` 的盘不算，免得 Google Drive 这种本机打不开的天天报）。
  邮件正文按作品列出失效盘与原始链接，收件人默认 `769018860@qq.com`

发信配置放 `work/mail.json`（在仓库外，不会被提交；本机已配好 `smtp.qq.com:465` 与收件人）：

```json
{"smtp_host":"smtp.qq.com","smtp_port":465,"user":"769018860@qq.com","password":"QQ邮箱授权码","to":"769018860@qq.com"}
```

QQ 邮箱要用「设置 → 账户 → 开启 IMAP/SMTP」后生成的**授权码**当 password，
不是登录密码。填好后 `--test-mail` 应立刻收到一封测试信，收不到就是授权码或端口的问题。也可以用环境变量 `QD_SMTP_HOST / QD_SMTP_PORT / QD_SMTP_USER /
QD_SMTP_PASS / QD_MAIL_TO` 覆盖。没配 SMTP 时脚本把告警写成
`work/netdisk-alert.json` 并以退出码 3 结束，站点更新照常完成，不会因为发不出信而中断。

定在每天 0 点跑（Windows 计划任务，登录用户下运行，脚本会自己起浏览器）：

```powershell
schtasks /create /tn "QD网盘巡检" /sc daily /st 00:00 /f /tr ^
 "cmd /c cd /d C:\path\to\clone && C:\Python310\python.exe scripts\netdisk\daily_check.py --push"
```

## 文件结构
- index.html / videos.html
- styles.css / app.js / videos.js
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

怪物行动意图（英文）补充自 Kaiden.gg（`scripts/sync_kaiden_monsters.mjs` → `data/morimens/kaiden/intents.json`，317 个怪物），仅在没有 Morimens.Info.kr 数据时使用，页面内标注来源；其版权归 Kaiden.gg / 游戏方所有。

融灾地图：`scripts/sync_morimens_dzone_map.mjs` 从 Morimens.Info.kr 的 `dzone_maps*.json`（六边形节点网格）与 `dzone_season*.json`（战斗 → 怪物）生成 `data/morimens/dzone-info/map-<期次>.json`（第 68 期起），图标复制到 `assets/morimens/dzone-map/`；页面在每个区域内用这些数据绘制地图，战斗节点旁标注怪物头像与名称。名称带 `@1` / `@2` 的怪物是游戏内乱码名，行动意图使用去掉标记后的对应怪物（Kaiden.gg）。

术语对照：`python scripts/build_glossary.py <Morimens-Localizations 路径>` 生成 `data/morimens/game/glossary.json`（唤醒体 / 命轮 / 造物 / 钥令 / 密契 / 怪物 / 效果文本里的游戏术语；每条标注来源 wiki / game / site / ai，名称不一致时记录 `alt`），再运行 `node scripts/build_morimens_tier_pool.mjs` 用它补全 T 表缺失的中文名。灰机维基目前被 Cloudflare 拦截，因此 wiki 来源仍是此前上传的数据。造物榜单的「剔除初始造物」使用 SKeyDB 各禁区的 `initialRelicIds`（榜单名称末尾的 + 视为同一造物）。

卡池活动复刻日历（`morimens-summon-calendar.js`，伤害计算器右侧的标签页）：`node scripts/sync_summon_calendar.mjs` 合并 SKeyDB 时间线（`banners.json` / `events.json`，2026-02 起精确到天，UTC+8）、Morimens.Info.kr 的 `rerun_schedule.json`（2023-11 起的按月角色复刻记录，韩服）与 Z769018860/morimens-summon 的 `web/catalog.json`（中文名），输出 `data/morimens/game/summon-calendar.json`。标题译文在 `scripts/data/calendar_titles_zh.json`（`s: game` 来自游戏翻译表，`ai` 为 AI 辅助）。灰机维基「唤醒」页数据由 `scripts/huiji_summon_console.js` 在浏览器导出为 `data/morimens/huiji/summon.json`（Module:SummonAwkTable 数据模块），脚本解析后补全 2023-11 起的卡池日期、其他卡池类型和未来预测；Steam 公告：`node scripts/sync_steam_events.mjs` 读取 Steam 社区公告（ISteamNews，app 3052450）里各版本「Maintenance Announcement」的活动时间，输出 `data/morimens/steam/events.json`（2025-09 起；2024-11 至 2025-08 的公告没有活动明细）；生日日历：`node scripts/build_birthdays.mjs` 从 SKeyDB 唤醒体档案（profile.birthday，与灰机维基核对一致，沙耶生日未公开）生成 `data/morimens/game/birthdays.json`，由 `morimens-birthday-calendar.js` 在右上角弹窗里绘制年历并列出最近生日。

复刻空窗榜：原独立页面 `morimens-rerun.html` 已并入日历标签页，其输入数据 `data/morimens/huiji/summon-rerun/`（灰机维基 SummonAwkTable 历史，含每日轮换）由 `sync_summon_calendar.mjs` 读取，展开为逐日窗口并校正源表个别结束年份错误。微博「忘却前夜记录局」：登录后用 `scripts/weibo_console.js` 在浏览器导出为 `data/morimens/weibo/posts.json`（导出覆盖 2024-04 至今，共约 2000 条，其中第 61–200 页由 `scripts/weibo_console_p61_200.js` 导出后已合并进 posts.json）。2024-04 起的角色活动 / 卡池以微博为准，角色活动对应的唤醒体由活动名、首发卡池同日条目与灰机维基页面推出（`万象门扉` 手工指定为塔薇）；日历页的「角色活动复刻空窗榜」据此统计，`node scripts/parse_weibo_events.mjs` 解析公告里「◆ 限时玩法活动「…」/ 角色活动唤醒「…」& 命轮活动唤醒「…」」及其活动时间，生成 `data/morimens/weibo/events.json`，日历据此使用官方中文名并补齐遗漏活动。角色限时活动：`scripts/huiji_events_console.js` 导出 `data/morimens/huiji/events.json`（「限时活动「…」」页的活动时间，覆盖 2023-12 至 2024-11），2024-11 至 2026-02 之间的角色活动仍缺，2026-03 起来自 SKeyDB `events.json`。页面底部的「复刻空白期榜单」按最近一次限时 / 复刻卡池结束时间排名。地图节点说明：`python scripts/build_map_nodes.py <Morimens-Localizations 路径>` → `data/morimens/game/map-nodes.json`（官方 MapNodeType 名称与描述，毒气地面 / 起点等没有官方说明的条目标记为推测）。

T 表悬浮提示 / 标签说明：详情数据 `data/morimens/game/tier-details.json` 由 `python scripts/build_tier_details.py <Morimens-Localizations 路径>` 生成（唤醒体界域 / 定位、命轮主属性与效果、造物特性、钥令效果、密契套装效果；英文来自 SKeyDB 记录，中文优先取游戏翻译表，且只有英文对照与 SKeyDB 一致时才采用；其余使用 `scripts/data/tier_details_zh.json` 的 AI 辅助译文，键为数字替换为 `{n}` 的英文，值中 `{k}` 还原第 k 个数字，未收录的新文本会回退显示英文）。怪物详情（特性、行动意图）在页面中由 `MorimensDtideZones.brief()` 现场生成。

Kaiden.gg 英文意图文本的中文译文：`scripts/build_kaiden_zh.py` 按“句子 → 译文”生成 `data/morimens/kaiden/zh.json`（数字抽出后查表再还原）。译文来自游戏翻译表（技能 / 状态名）与 AI 辅助翻译（`scripts/data/kaiden_zh_*.txt`、`kaiden_names_manual.py`），Kaiden 新增的句子在翻译前会显示英文原文。

## 地图总览（游戏客户端配置表）

- 数据：`data/morimens/local-config/`（筛选后的原始配置表，gzip）与 `data/morimens/maps/`（页面用的精简数据），由 `scripts/build_map_overview.py` 从维护者提供的客户端配置导出生成，说明见 `data/morimens/local-config/README.md`。
- 页面：「地图怪物总览」标签里的「全部地图（可筛选）」视图（`morimens-map-overview.js`）：默认显示融灾当期地图，可按分类 / 子类 / 关键字筛选关卡，查看地图格位、节点说明、每场战斗的怪物与技能。
- 记忆回廊「疾驰的欢愉专列」（含V2）按路线展示：阶段 → 章节选项 → 随机战斗/事件/奖励节点（`data/morimens/maps/train.json`）。
- 未上线内容默认不收录。生成时加 `--include-future`（未发布唤醒体的活动另需 `--unlock 关键词=时间`）会把它们写进数据并带上解锁时间 `u`，页面在该时间之前不显示、到点自动出现——注意这些文件在仓库里是公开的。
- 融灾第 71 期的战斗节点与怪物另见 `scripts/convert_map_local.mjs`、`scripts/import_battle_nodes_local.mjs`。

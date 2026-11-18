# 汉化资源 · 网盘链接台账

从个人汉化站登记的 B 站发布页中提取**所有网盘链接**，并批量核验有效性，生成台账文件（不挂到站点主页导航）。

## 产出

| 文件 | 说明 |
| --- | --- |
| `data/netdisk-links.json` | 结构化数据：游戏 → 发布视频 → 网盘链接（平台 / 提取码 / 来源 / 状态） |
| `data/netdisk-links.md` | 可读台账：平台统计、失效清单、按游戏明细（GitHub 可直接渲染） |
| `data/netdisk-links.html` | 自包含的浏览页面（可筛选 / 搜索），需自行访问，站点导航未引用 |

三个文件均由脚本生成，**不要手工编辑**，改动请重跑脚本覆盖。

## 数据来源

1. 仓库根目录 `data.json` 中每条游戏的「汉化发布地址」（B 站视频、`b23.tv` 短链、专栏）为入口；
2. 抓取 **视频简介（desc）** 与 **UP 主置顶评论**，另外补充抓取 **UP 主在评论区的说明**与 **B 站专栏正文**；
3. 在以上文本中识别网盘链接与提取码（`?pwd=` 参数或紧跟链接的「提取码：xxxx」）。

支持的网盘：百度网盘、夸克网盘、UC 网盘、迅雷云盘、123 云盘、城通网盘、腾讯微云、蓝奏云、Google Drive（识别但不核验）。

## 使用

```bash
# 全流程：抓取 + 核验 + 生成（推荐）
python scripts/netdisk/refresh.py

# 只抓取与解析，不做有效性核验（快，几十秒）
python scripts/netdisk/refresh.py --no-check

# 指定 node 路径（默认使用 PATH 里的 node）
python scripts/netdisk/refresh.py --node /usr/local/bin/node
```

只用 Python 3.9+ 标准库，无需安装依赖。

## 有效性核验原理

| 平台 | 方式 | 判定 |
| --- | --- | --- |
| 百度网盘 | `pan.baidu.com/api/shorturlinfo` | `errno=0` 有效；`-9` 需提取码（有效）；`-62/-21` 已取消 |
| 夸克 / UC | `clouddrive/share/sharepage/token` | `code=0` 有效；`41008` 需提取码；`41010` 违规封禁；`41006` 不存在 |
| 123 云盘 | `/api/share/info` | `Expired` 字段 + 到期时间 |
| 蓝奏云 | 解析分享页标题 / 文件大小 | 出现「取消分享 / 文件不存在」即失效 |
| 迅雷 / 城通 / 微云 | 无头浏览器渲染（见下） | 是否渲染出文件列表 / 命中失效文案 |
| Google Drive | 未核验 | 标记为「待确认」（国内网络不可达） |

迅雷、城通、微云的分享页是纯前端 SPA，接口有验证码或签名限制，因此改用无头浏览器渲染判定：

```bash
# 1) 启动带调试端口的浏览器（保持运行）
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" \
  --headless=new --remote-debugging-port=9223 --user-data-dir=%TEMP%\edgeprof about:blank

# 2) refresh.py 会自动调用 check_spa.mjs；也可单独运行
node scripts/netdisk/check_spa.mjs input.json output.json
```

端口默认 `9223`，可用环境变量 `CDP_PORT` 覆盖。浏览器未启动时，该部分结果标记为「待确认」，不会中断流程。

## 已知限制

- 提取码有时写在链接附近的正文里，脚本按「链接后 80 字」匹配，个别条目可能取到相邻链接的提取码，已用浏览器自动填码复核微云/城通；
- 视频被删除或改私密的，只能拿到 404 提示，无法补链接；
- 网盘状态随时会变（尤其夸克的违规封禁），建议每周重跑一次。

## 补档：链接失效 / 缺平台时重新挂一条

三个脚本分工明确，别混着用：

| 脚本 | 处理什么 | 会不会下载文件 |
| --- | --- | --- |
| `reshare.py` | 已有链接失效，但**自己网盘里还留着**同名文件 → 重新建分享 | 不下载 |
| `xunlei_backfill.py` | 缺迅雷链接，且**迅雷云端已有**同名文件 → 直接建分享 | 不下载 |
| `xunlei_fetchfill.py` | 缺迅雷链接，且**迅雷云端没有** → 从站上登记的存活链接取回文件，传上去再分享 | 下载 + 上传 |

### 取文件 → 传迅雷 的完整链路

```bash
# 1) 先摸清所有分享里有什么（只读，不转存、不占空间）
python scripts/netdisk/xunlei_fetchfill.py --harvest

# 2) 看起来要补哪些、各自从哪个盘取
python scripts/netdisk/xunlei_fetchfill.py --dry

# 3) 先跑一个验证，再全量
python scripts/netdisk/xunlei_fetchfill.py --only 某作品名
python scripts/netdisk/xunlei_fetchfill.py
```

内部步骤（百度源）：

1. `share/verify` 用提取码换 `randsk`，**后续 `share/list` 必须带 `sekey`**，否则一律 `errno=-9`；
2. `share/list` 递归遍历分享（`dir` 翻子目录，根目录要带 `root=1`）；
3. 挑文件 → `share/transfer` 转存到自己的 `/汉化补丁补档/_tmp/<作品名>/`；
4. `api/filemetas` 拿 `dlink`，用 `User-Agent: pan.baidu.com` 直连下载（实测 20 MB/s 级）；
5. 上传迅雷：`POST /drive/v1/files` 拿阿里云 STS + OSS key，
   自己签 OSS V1 头 `PUT` 到 `vip-lixian-*.up.xdrive.xunlei.com`，传完条目自动 `PHASE_TYPE_COMPLETE`；
6. `POST /drive/v1/share` 建分享，`GET /drive/v1/share` 用 `share_status=OK` 判活；
7. 写 `data/netdisk-reshare.json` 的 `links.xunlei`，核验失败的绝不落台账。

### 两个容易踩的坑

- **UP 主的链接经常互相指错**（A 作品的链接指向 B 作品的分享），
  所以 `--harvest` 会把所有分享的文件汇成 `work/fetchfill-pool.json`，
  挑文件时优先用池，而不是只信这一条链接指向的分享。
- **文件名未必是中文作品名**（`ツギハギの幸福` → `tsugihagi1.03`、`可怕的怪物` → `SpookyMonster`），
  纯相似度对不上时写进 `data/netdisk-fetchalias.json`（归一化后子串匹配，命中多个取最大）。

### 目前还取不了的源

`ctfile`（城通）、`123pan`、`lanzou`（蓝奏）、`quark` 的直链解析还没做，
这几种来源的作品会记成 `unsupported_source`；`--harvest` 若在别人的合集分享里
摸到了同名文件，仍可走文件池补齐。


## 贴错行的链接怎么修

`data.json` 的「汉化发布地址」是手工维护的，UP 主同期发的几个视频很容易串行：
条目名是 A，bvid 却指向 B 的视频，desc 里那串网盘链接自然也是 B 的补丁。

```bash
python scripts/netdisk/apply_videofix.py --dry   # 先看会改什么
python scripts/netdisk/apply_videofix.py         # 应用
```

- `data/netdisk-videofix.json`：整条视频贴错行（bvid/标题/简介/置顶一起换）
- `data/netdisk-linkfix.json`：只是某一行链接指到别的作品（标 dead，站点不再展示为可用）
- 两处都会同时改 `data.json` 与 `data/netdisk-links.json`，所以 `refresh.py` 重跑后依然是修好的。
- `autofill.py` 每轮会重放一遍 linkfix，防止 refresh 重建 links 时把标记冲掉。

## 本机已有成品包时

```json
// data/netdisk-localfiles.json
{"map": {"HIKEBACK": "E:/renpy-8.0.3-sdk/HIKEBACK/HIKEBACK汉化完整版.zip"}}
```

`xunlei_fetchfill.py` 看到 `local` 源就直接上传，不再走网盘下载。

## 取不到文件的几个平台（2026-11）

| 平台 | 状况 |
| --- | --- |
| 微云 | 「普通下载」弹微信扫码，必须登录；无 cookie 无法自动化 |
| 123 云盘 | 「浏览器下载」弹付费二维码；「保存至云盘」要登录 |
| 城通 | 免费通道约 29 KB/s，100 MB 要 1 小时，且按钮是 SPA，选择器不稳 |
| 夸克 | `/file/download` 对单文件 >50 MB 直接返 23018，文件在自己网盘里也一样 |
| 蓝奏 | 有 acw_sc__v2 JS 挑战，但小补丁通常已在文件池里，用别名匹配即可 |

360 / Edge 正在运行时，`Cookies`（SQLite）被主进程独占，复制 profile 也读不到登录态。

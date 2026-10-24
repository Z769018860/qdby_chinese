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

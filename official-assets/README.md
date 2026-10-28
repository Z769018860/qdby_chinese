# 忘却前夜 官方素材库 · Official Assets

Discord 官方服务器「Morimens」的 `🔸官方素材丨official-assets` 论坛频道里官方（Mythag Cat ～ Light / Morimens 团队）
发布的**原始图片**归档。本分支只放素材，不参与站点构建 —— `main` / `preview` 保持轻量，
EdgeOne 部署不需要拉这 1 GB。

## 分类

| 目录 | 分类 | 张数 | 体积 |
| --- | --- | ---: | ---: |
| [`ost/`](./ost) | OST 封面 | 204 | 332.4 MB |
| [`art-caro/`](./art-caro) | 唤醒体立绘·血肉界域 | 15 | 104.1 MB |
| [`art/`](./art) | 角色立绘 | 8 | 99.4 MB |
| [`art-chaos/`](./art-chaos) | 唤醒体立绘·混沌界域 | 21 | 88.6 MB |
| [`wheel/`](./wheel) | 命轮 Wheel of Destiny | 162 | 86.9 MB |
| [`skins/`](./skins) | 幻衣 Skins | 16 | 71.6 MB |
| [`art-ultra/`](./art-ultra) | 唤醒体立绘·超维界域 | 14 | 68.2 MB |
| [`art-aequor/`](./art-aequor) | 唤醒体立绘·深海界域 | 13 | 60.5 MB |
| [`avatars/`](./avatars) | 头像 Avatars | 201 | 32.9 MB |
| [`emotes/`](./emotes) | 表情 Emotes | 300 | 28.4 MB |
| [`guide/`](./guide) | 频道说明与版式 | 52 | 27.1 MB |

合计 **1006** 张 / **1000.0 MB**，来自 **71** 个论坛帖，抓取时间 2026-10-28 22:11。

## 目录规则

```
<分类>/<建帖日期>_<帖名>/<附件id>-<原文件名>.<ext>
```

- 第一层是分类（见上表），第二层是原始论坛帖（保留建帖日期，方便按版本期数区分）。
- 文件名前缀的**附件 id** 是 Discord 附件的唯一标识，`manifest.json` 里可据此反查帖名、发帖人、发帖时间。
- 原文件名里的中文、空格保持原样（只把路径非法字符换成下划线）。

## manifest.json 字段

| 字段 | 说明 |
| --- | --- |
| `id` | 附件 id（唯一） |
| `threadId` / `thread` | 所在论坛帖的 id 与标题 |
| `category` / `categoryLabel` | 分类 key 与中文名 |
| `postedAt` | 该图发帖时间（UTC+8） |
| `threadCreated` | 建帖日期 |
| `author` / `authorId` | 发帖人 |
| `filename` / `ext` | 原始文件名与扩展名 |
| `size` / `width` / `height` | 字节数与像素尺寸 |
| `cdnPath` | Discord CDN 路径（不带签名，签名会过期） |
| `messageId` | 消息 id，可拼出 Discord 跳转链接 |
| `savedAs` | 本仓库内的相对路径 |

## 更新方式

```bash
cd discord_sync
python collect_assets.py --plan                        # 先看新增多少张、多少 MB
python collect_assets.py --download data/assets         # 下载原图（增量，已存在会跳过）
python publish_assets.py --src data/assets --out ../qdby_assets/official-assets
cd ../qdby_assets && git add -A && git commit -m "chore(assets): 同步官方素材" && git push origin assets
```

注意：Discord CDN 链接带签名（`?ex=&is=&hm=`），**必须在拿到清单的当天完成下载**，过期后会 404；
重新跑一次 `collect_assets.py`（不要加 `--from-manifest`）即可拿到新签名。

## 直接引用

素材放在 `assets` 分支，站点构建分支（`main` / `preview`）不含这些文件。可用 jsDelivr 直接按路径取图：

```
https://cdn.jsdelivr.net/gh/Z769018860/qdby_chinese@assets/official-assets/<分类>/<帖子目录>/<文件名>
```

也可以用 GitHub 原始链接：

```
https://raw.githubusercontent.com/Z769018860/qdby_chinese/assets/official-assets/<分类>/<帖子目录>/<文件名>
```

## 来源与版权

素材版权归《忘却前夜 / Morimens》官方所有，本仓库仅作社区存档与二创取用，请勿商用。

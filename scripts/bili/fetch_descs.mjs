// 批量抓取 B 站投稿详情（简介 / 分区 / 时长），供平台·题材·价格·要素提取使用
// 方式：浏览器内同源 fetch（带 buvid3 等 Cookie），比裸接口稳得多
import fs from 'node:fs';
import path from 'node:path';
import { connect, sleep } from '../../../cdp.mjs';

const PORT = Number(process.env.QD_CDP_PORT || 9225);
const WORK = process.env.QD_WORK || path.resolve(import.meta.dirname, '../../..');
const SRC = path.join(WORK, 'raw/up_videos_all.json');
const OUT = path.join(WORK, 'raw/descs.json');

const all = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const ids = all.map((v) => v.bvid);
let store = {};
if (fs.existsSync(OUT)) {
  try { store = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { store = {}; }
}
const todo = ids.filter((b) => !store[b]);
console.log(`总 ${ids.length} / 已有 ${Object.keys(store).length} / 待抓 ${todo.length}`);

const c = await connect(PORT);
await c.goto('https://www.bilibili.com/', 2500);

const CHUNK = 40;
let done = 0, fails = 0;
for (let i = 0; i < todo.length; i += CHUNK) {
  const part = todo.slice(i, i + CHUNK);
  let got = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    got = await c.ev(`(async () => {
      const res = [];
      for (const bv of ${JSON.stringify(part)}) {
        try {
          const r = await fetch('https://api.bilibili.com/x/web-interface/view?bvid=' + bv, { credentials: 'include' });
          const j = await r.json();
          if (j.code === 0) {
            const d = j.data;
            res.push({ bvid: bv, code: 0, desc: d.desc || '', tname: d.tname || '', tid: d.tid || 0,
                       duration: d.duration || 0, pubdate: d.pubdate || 0 });
          } else {
            res.push({ bvid: bv, code: j.code });
          }
        } catch (e) {
          res.push({ bvid: bv, code: -1, msg: String(e && e.message) });
        }
        await new Promise((r) => setTimeout(r, 240));
      }
      return res;
    })()`);
    const bad = (got || []).filter((x) => x.code !== 0).length;
    if (bad === 0) break;
    console.log(`  分块 ${i / CHUNK + 1} 有 ${bad} 条失败，冷却 25s 重试`);
    await sleep(25000);
  }
  for (const x of got || []) {
    if (x.code === 0) { store[x.bvid] = { desc: x.desc, tname: x.tname, tid: x.tid, duration: x.duration, pubdate: x.pubdate }; done++; }
    else fails++;
  }
  fs.writeFileSync(OUT, JSON.stringify(store));
  const pct = ((Object.keys(store).length / ids.length) * 100).toFixed(1);
  console.log(`进度 ${Object.keys(store).length}/${ids.length} (${pct}%)  本块新增 ${done}  失败 ${fails}`);
  if ((i / CHUNK) % 5 === 4) await sleep(800);
}

console.log('完成，共', Object.keys(store).length, '条简介');
await c.close();
process.exit(0);

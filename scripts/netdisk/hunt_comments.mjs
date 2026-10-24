// 评论区找补档链接。
//
// refresh.py 抓评论时只保留 UP 主本人的留言、且只取 3 页，补档链接常常
// 正好在「补档：…」这类后发的评论里，于是落到了台账之外。这里按视频重扫
// 评论（最热 + 最新，各 3 页，含楼中楼），把带网盘域名的评论原文整条存下来，
// 交给 autofill.py 统一解析 —— 解析规则不重复实现。
//
// 用法：
//   node scripts/netdisk/hunt_comments.mjs                 # 扫台账里所有有失效链接的视频
//   node scripts/netdisk/hunt_comments.mjs BV16C4y1271r    # 只扫指定视频
//   QD_FORCE=1 node scripts/netdisk/hunt_comments.mjs      # 忽略缓存重扫
import fs from 'node:fs';
import path from 'node:path';
import { connect } from '../../../cdp.mjs';

const HERE = import.meta.dirname;
const REPO = process.env.QD_REPO || path.resolve(HERE, '../..');
const RAW = process.env.QD_CACHE || path.resolve(REPO, '../raw');
const OUT = path.join(RAW, 'hunt_comments.json');
const PORT = Number(process.env.QD_PORT || 9227);
const PAGE_LIMIT = Number(process.env.QD_PAGES || 3);
const FORCE = process.env.QD_FORCE === '1';

const PAN = /(pan\.quark\.cn|pan\.baidu\.com|drive\.uc\.cn|pan\.xunlei\.com|123(?:865|684|pan)\.com|ctfile\.com|share\.weiyun\.com|lanzou[a-z]*\.com|(?:aliyundrive|alipan)\.com|cloud\.189\.cn|caiyun\.139\.com|115\.com)/i;

function targets() {
  const args = process.argv.slice(2).filter((a) => /^BV[0-9A-Za-z]{10}$/.test(a));
  if (args.length) return args.map((bv) => ({ bv, name: bv }));

  const led = JSON.parse(fs.readFileSync(path.join(REPO, 'data/netdisk-links.json'), 'utf8'));
  const cache = fs.existsSync(OUT) && !FORCE ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  return led.games
    .filter((g) => g.links_dead > 0 && g.bvid)
    .filter((g) => !cache[g.bvid])
    .map((g) => ({ bv: g.bvid, name: g.name }));
}

const todo = targets();
console.log(`待扫评论的视频：${todo.length} 个`);
if (!todo.length) process.exit(0);

const store = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const b = await connect(PORT);
try {
  await b.goto('https://www.bilibili.com/video/' + todo[0].bv, 4200);

  for (const [i, t] of todo.entries()) {
    const row = await b.ev(`(async () => {
      const bv = ${JSON.stringify(t.bv)};
      const LIMIT = ${PAGE_LIMIT};
      const PAN = ${PAN.toString()};
      const out = { bv, up_mid: null, acount: 0, scanned: 0, comments: [], err: null };
      try {
        const vr = await fetch('https://api.bilibili.com/x/web-interface/view?bvid=' + bv, { credentials: 'include' });
        const v = await vr.json();
        if (v.code !== 0) { out.err = 'view ' + v.code; return out; }
        out.acount = (v.data.stat || {}).reply || 0;
        out.up_mid = (v.data.owner || {}).mid || null;
        const aid = v.data.aid;
        const push = (c, sub) => {
          out.scanned++;
          const msg = ((c.content || {}).message || '');
          if (!PAN.test(msg)) return;
          out.comments.push({
            user: (c.member || {}).uname || '',
            mid: (c.member || {}).mid || 0,
            date: c.ctime ? new Date(c.ctime * 1000).toISOString().slice(0, 10) : '',
            text: msg.slice(0, 600),
            sub: !!sub,
          });
        };
        for (const sort of [2, 1]) {
          for (let pn = 1; pn <= LIMIT; pn++) {
            const jr = await fetch('https://api.bilibili.com/x/v2/reply?type=1&oid=' + aid +
              '&pn=' + pn + '&sort=' + sort + '&ps=20', { credentials: 'include' });
            const j = await jr.json();
            if (j.code !== 0 || !j.data) break;
            const list = (j.data.replies || []).concat(j.data.top_replies || []);
            if (!list.length) break;
            for (const c of list) {
              push(c, false);
              for (const s of (c.replies || [])) push(s, true);
            }
            await new Promise((r) => setTimeout(r, 240));
          }
        }
        // 同一作者重复发同一条补档很常见，去重
        const seen = new Set();
        out.comments = out.comments.filter((c) => {
          const k = c.mid + '|' + c.text.slice(0, 80);
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      } catch (e) {
        out.err = String(e).slice(0, 120);
      }
      return out;
    })()`);

    store[String(t.bv)] = { ...row, name: t.name, hunted_at: new Date().toISOString().slice(0, 16) };
    const n = (row && row.comments && row.comments.length) || 0;
    console.log(`  ${i + 1}/${todo.length} ${t.name.slice(0, 18)} ${t.bv} 评论 ${row?.scanned || 0} 条，含链接 ${n} 条`);
    fs.writeFileSync(OUT, JSON.stringify(store, null, 1));
    await new Promise((r) => setTimeout(r, 700));
  }
} finally {
  await b.close();
}
console.log('->', OUT);

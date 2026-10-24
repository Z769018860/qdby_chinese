// 补齐长微博全文。
// 搜索卡片里的 text 是截断版，末尾带「…全文」；/statuses/extend 能拿到完整正文。
// 必须在 m.weibo.cn 页面里同源调用，跨域直连会被 CORS 拦掉。
import fs from 'node:fs';
import path from 'node:path';
import { connect, sleep } from '../../../cdp.mjs';

const WORK = process.env.QD_WORK || path.resolve(import.meta.dirname, '../../..');
const STORE = path.join(WORK, 'raw/weibo_posts.json');
const PORT = Number(process.env.QD_PORT || 9226);

const posts = JSON.parse(fs.readFileSync(STORE, 'utf8'));
const need = posts.filter((p) => p.isLong && !p.fullText);
console.log(`总 ${posts.length} 条，其中长微博 ${posts.filter((p) => p.isLong).length} 条，待补全文 ${need.length} 条`);
if (!need.length) process.exit(0);

const b = await connect(PORT);
try {
  await b.goto('https://m.weibo.cn/', 3000);

  const BATCH = 8;
  let ok = 0;
  for (let i = 0; i < need.length; i += BATCH) {
    const ids = need.slice(i, i + BATCH).map((p) => p.mid || p.id);
    const res = await b.ev(`(async () => {
      const ids = ${JSON.stringify(ids)};
      const out = {};
      for (const id of ids) {
        try {
          const r = await fetch('/statuses/extend?id=' + id, {
            credentials: 'include',
            headers: { 'MWeibo-Pwa': '1', 'X-Requested-With': 'XMLHttpRequest' }
          });
          const j = await r.json();
          out[id] = j.ok === 1 ? (j.data && j.data.longTextContent) || '' : '';
        } catch (e) { out[id] = ''; }
        await new Promise((r) => setTimeout(r, 320));
      }
      return out;
    })()`);

    for (const [id, html] of Object.entries(res || {})) {
      if (!html) continue;
      const txt = html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<a[^>]*>(.*?)<\/a>/gi, '$1')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      const p = posts.find((x) => (x.mid || x.id) === id);
      if (p && txt) {
        p.fullText = txt;
        ok++;
      }
    }
    fs.writeFileSync(STORE, JSON.stringify(posts, null, 1));
    console.log(`  ${Math.min(i + BATCH, need.length)}/${need.length}，已补 ${ok}`);
    await sleep(600);
  }
  console.log(`完成：${ok}/${need.length} 条拿到全文`);
} finally {
  await b.close();
}

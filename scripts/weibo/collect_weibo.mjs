// 采集青灯不弈的微博（repo / 安利 / 汉化发布）
// 主页翻页需登录，改为「站内搜索 + 作者过滤」：用作品名与关键词各查一次，
// 把命中的本人博文合并去重。搜索接口在页面上下文同源 fetch 可用。
import fs from 'node:fs';
import path from 'node:path';
import { connect, sleep } from '../../../cdp.mjs';

const PORT = Number(process.env.QD_WB_PORT || 9226);
const WORK = process.env.QD_WORK || path.resolve(import.meta.dirname, '../../..');
const REPO = process.env.QD_REPO || path.resolve(import.meta.dirname, '../..');
const OUT = path.join(WORK, 'raw/weibo_posts.json');
const AUTHOR = '青灯不弈';

const store = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : [];
const byId = new Map(store.map((x) => [x.id, x]));

// ---- 查询词：作品名 + 关键词 ----
const works = JSON.parse(fs.readFileSync(path.join(REPO, 'data.json'), 'utf8'));
const queries = [];
const push = (q) => { if (q && !queries.includes(q)) queries.push(q); };
for (const w of works) {
  const n1 = (w['汉化名'] || '').trim();
  const n2 = (w['游戏原名'] || '').trim();
  if (n1) push(`${n1} 青灯不弈`);
  if (n2 && n2 !== n1) push(`${n2} 青灯不弈`);
}
for (const k of ['repo', '安利', '通关repo', '汉化', '汉化补丁', '自汉化', '乙女', '乙游',
  '恐怖', '悬疑', '推理', '解谜', '机翻', '补丁', '攻略', '实况', '短篇', '像素',
  '长repo', '游玩repo', '游戏repo', '推游']) {
  push(`青灯不弈 ${k}`);
}
// 扩展：游戏库里的高频游戏，逐个配合作者名检索（能被搜到说明正文提到了作者名或同一话题）
if (process.env.QD_WB_EXTRA) {
  const gp = path.join(REPO, 'data', 'games.json');
  if (fs.existsSync(gp)) {
    const gs = JSON.parse(fs.readFileSync(gp, 'utf8')).games || [];
    gs.filter((g) => g.vcount > 0).slice(0, Number(process.env.QD_WB_EXTRA) || 140).forEach((g) => {
      push(`${g.name} 青灯不弈`);
      if (g.vcount >= 2) push(`${g.name} repo`);
    });
  }
  for (const k of ['通关repo', '游戏repo', 'repo 乙女', 'repo 恐怖', 'repo 推理',
    '通关 感想', '打完 感想', '全结局', '安利 乙游', '推荐 乙游', '汉化 安利']) {
    push(`青灯不弈 ${k}`);
  }
}
console.log(`查询词 ${queries.length} 个，已有 ${store.length} 条`);

const c = await connect(PORT);
await c.goto(`https://m.weibo.cn/u/5082872852`, 3000);

const strip = (s) => String(s || '').replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '');

function harvest(cards) {
  const out = [];
  const walk = (arr) => {
    for (const k of arr || []) {
      if (k.mblog) {
        const m = k.mblog;
        const user = m.user && m.user.screen_name;
        if (user === AUTHOR) {
          let text = m.text || '';
          if (m.longText && m.longText.longTextContent) text = m.longText.longTextContent;
          out.push({
            id: String(m.id), mid: m.mid, bid: m.bid || '',
            created: m.created_at, source: m.source || '',
            text: strip(text),
            pics: (m.pics || []).map((p) => (p.large && p.large.url) || p.url || ''),
            reposts: m.reposts_count || 0, comments: m.comments_count || 0, likes: m.attitudes_count || 0,
            isLong: !!m.isLongText,
            retweeted: m.retweeted_status ? strip(m.retweeted_status.text).slice(0, 300) : '',
            retweetedUser: m.retweeted_status && m.retweeted_status.user ? m.retweeted_status.user.screen_name : '',
            hasVideo: !!(m.page_info && m.page_info.type === 'video'),
          });
        }
      }
      if (k.card_group) walk(k.card_group);
      if (k.cards) walk(k.cards);
    }
  };
  walk(cards);
  return out;
}

let added = 0, fails = 0;
for (let i = 0; i < queries.length; i++) {
  const q = queries[i];
  const cid = '100103type%3D1%26q%3D' + encodeURIComponent(q);
  const url = `https://m.weibo.cn/api/container/getIndex?containerid=${cid}`;
  let res = await c.ev(`(async()=>{ try{
      const r=await fetch(${JSON.stringify(url)},{credentials:'include'});
      if(!r.ok) return {__status:r.status};
      const t=await r.text();
      if(t.trim()[0]!=='{') return {__status:'nonjson'};
      const j=JSON.parse(t);
      return {__ok:1, cards:(j.data&&j.data.cards)||[], total:(j.data&&j.data.cardlistInfo&&j.data.cardlistInfo.total)||0};
    }catch(e){ return {__err:String(e&&e.message)}; } })()`);
  if (!res || !res.__ok) {
    // 回退：直接导航取 JSON
    await c.goto(url, 1800);
    const txt = await c.ev('document.body.innerText');
    try {
      const j = JSON.parse(String(txt));
      res = { __ok: 1, cards: (j.data && j.data.cards) || [], total: 0 };
    } catch { res = null; }
  }
  if (!res) { fails++; console.log(`[${i + 1}/${queries.length}] 失败 ${q}`); await sleep(1500); continue; }
  const hits = harvest(res.cards);
  let n = 0;
  for (const h of hits) {
    if (!byId.has(h.id)) { byId.set(h.id, h); n++; added++; }
  }
  if (n || i % 10 === 0) console.log(`[${i + 1}/${queries.length}] ${q} → 命中${hits.length} 新增${n} 累计${byId.size}`);
  fs.writeFileSync(OUT, JSON.stringify([...byId.values()], null, 1));
  await sleep(1100 + Math.random() * 600);
}

fs.writeFileSync(OUT, JSON.stringify([...byId.values()], null, 1));
console.log(`结束：微博 ${byId.size} 条，新增 ${added}，失败查询 ${fails}`);
await c.close();
process.exit(0);

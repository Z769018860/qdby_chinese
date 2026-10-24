// 采集青灯不弈的微博（repo / 安利 / 汉化发布），并逐条补全图片与全文
//
// 两条硬约束决定了做法：
//   1. 主页翻页要登录 —— getIndex 的 page>=2、since_id、max_id 全部返回 ok:-100
//      （跳 passport.weibo.com），所以只能靠「站内搜索」的第一页多打点查询词。
//   2. 搜索卡片里的 pics 常常只给一张缩略图、text 是截断版 —— 必须再用
//      /statuses/show?id=<mid> 拿完整 pics，用 /statuses/extend 拿长微博全文。
//      这两个接口必须同源（m.weibo.cn 页面里）调用，跨域直接 Failed to fetch。
//
// 未登录时能拿到的上限很低：搜索的第一页 + 主页最新的 12 条，合计约 50 条。
// 想真·补齐（4018 条全量）必须登录一次：
//   node collect_weibo.mjs --login    # 弹出可见窗口扫码，登录态存进 edgeprofWB
//   node collect_weibo.mjs            # 之后每次都能 page 翻页走全量
//
// 用法：
//   node collect_weibo.mjs            # 搜索采集 + 补全（登录态存在时自动走全量）
//   node collect_weibo.mjs --enrich   # 只补全已有数据，不重新搜索
//   node collect_weibo.mjs --queries  # 只打印查询词，不联网
import fs from 'node:fs';
import path from 'node:path';
import { connect } from '../../../cdp.mjs';

const PORT = Number(process.env.QD_WB_PORT || 9226);
const WORK = process.env.QD_WORK || path.resolve(import.meta.dirname, '../../..');
const REPO = process.env.QD_REPO || path.resolve(import.meta.dirname, '../..');
const OUT = path.join(WORK, 'raw/weibo_posts.json');
const AUTHOR = '青灯不弈';
const UID = process.env.QD_WB_UID || '5082872852';

const argv = process.argv.slice(2);
const ONLY_ENRICH = argv.includes('--enrich');
const ONLY_QUERIES = argv.includes('--queries');
const DO_LOGIN = argv.includes('--login');
const WPORT = DO_LOGIN || process.env.QD_WB_PORT ? Number(process.env.QD_WB_PORT || (DO_LOGIN ? 9230 : PORT)) : PORT;
const WPROFILE = process.env.QD_WB_PROFILE ||
  path.join(WORK, DO_LOGIN ? 'edgeprofWB' : 'edgeprofW');
const EDGE = process.env.QD_EDGE || 'C:////Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 查询词 ----------
function buildQueries() {
  const qs = [];
  const push = (q) => {
    const s = String(q || '').replace(/\s+/g, ' ').trim();
    if (s && s.length >= 2 && !qs.includes(s)) qs.push(s);
  };

  // a) 汉化站的 64 部作品：汉化名 / 原名，各配一次 repo
  const worksPath = path.join(REPO, 'data.json');
  if (fs.existsSync(worksPath)) {
    for (const w of JSON.parse(fs.readFileSync(worksPath, 'utf8'))) {
      const n1 = (w['汉化名'] || '').trim();
      const n2 = (w['游戏原名'] || '').trim();
      if (n1) { push(`${n1} 青灯不弈`); push(`${n1} repo`); }
      if (n2 && n2 !== n1) { push(`${n2} 青灯不弈`); push(`${n2} repo`); }
    }
  }

  // b) 游戏库里投稿数 >=2 的作品：repo 常写游戏名
  const gp = path.join(REPO, 'data', 'games.json');
  if (fs.existsSync(gp)) {
    const gs = (JSON.parse(fs.readFileSync(gp, 'utf8')).games || [])
      .filter((g) => (g.vcount || 0) >= 2 && g.name && g.name.length >= 2)
      .sort((a, b) => (b.vcount || 0) - (a.vcount || 0))
      .slice(0, Number(process.env.QD_WB_GAMES || 120));
    for (const g of gs) { push(`${g.name} repo`); push(`${g.name} 青灯不弈`); }
  }

  // c) 通用关键词（作者名 + 语义词，能命中本人发的、正文里没写游戏名的那类博文）
  for (const k of ['repo', '通关repo', '游玩repo', '游戏repo', '长repo', '短repo',
    'repo 乙女', 'repo 恐怖', 'repo 推理', 'repo 悬疑', 'repo 解谜',
    '通关', '通关感想', '打完', '玩完', '全结局', '感想', '简评', '玩后感',
    '安利', '推荐', '入坑', '推游', '安利 乙游', '推荐 乙游',
    '自汉化', '汉化发布', '汉化补丁', '机翻', '补丁', '汉化',
    '乙女', '乙游', '恐怖', '悬疑', '推理', '解谜', '像素', '短篇', '长线']) {
    push(`青灯不弈 ${k}`);
  }
  return qs;
}

// ---------- 存储 ----------
const store = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : [];
const byId = new Map(store.map((x) => [String(x.id), x]));

function save() {
  store.sort((a, b) => Number(b.id) - Number(a.id));
  fs.writeFileSync(OUT, JSON.stringify(store, null, 1));
}

const strip = (s) =>
  String(s || '')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\u200b/g, '');

function picsOf(m) {
  const out = [];
  for (const p of m.pics || []) {
    const big = (p.large && p.large.url) || p.url || '';
    if (big) out.push(big);
  }
  return out;
}

function record(m) {
  const id = String(m.id);
  const text = strip(m.text || '');
  const rec = {
    id,
    mid: m.mid || id,
    bid: m.bid || '',
    created: m.created_at || '',
    source: m.source || '',
    text,
    pics: picsOf(m),
    reposts: m.reposts_count || 0,
    comments: m.comments_count || 0,
    likes: m.attitudes_count || 0,
    isLong: !!m.isLongText,
    retweeted: m.retweeted_status ? strip(m.retweeted_status.text || '').slice(0, 400) : '',
    retweetedUser: (m.retweeted_status && m.retweeted_status.user && m.retweeted_status.user.screen_name) || '',
    hasVideo: !!(m.page_info && m.page_info.type === 'video'),
    videoUrl: (m.page_info && m.page_info.page_url) || '',
    enriched: false,
  };
  return rec;
}

function merge(rec) {
  const old = byId.get(rec.id);
  if (!old) {
    byId.set(rec.id, rec);
    store.push(rec);
    return true;
  }
  // 已有的补全结果（pics / fullText）不要被搜索卡片上的残缺版本覆盖
  const merged = { ...rec, ...old };
  if ((rec.pics || []).length > (old.pics || []).length) merged.pics = rec.pics;
  if (rec.hasVideo && !old.hasVideo) { merged.hasVideo = true; merged.videoUrl = rec.videoUrl; }
  Object.assign(old, merged);
  return false;
}

if (ONLY_QUERIES) {
  const qs = buildQueries();
  console.log(qs.length);
  fs.writeFileSync(path.join(WORK, 'raw/weibo_queries.txt'), qs.join('\n'));
  process.exit(0);
}

const queries = buildQueries();
console.log(`查询词 ${queries.length} 个，已有 ${store.length} 条`);

// ---------- 登录（一次性） ----------
// 微博的时间线翻页在未登录时一律 ok:-100，登录后 page=2 才返回数据。
// 这里开一个可见窗口让人扫码，登录态落在独立 profile 里，之后就能走全量。
if (DO_LOGIN) {
  const { spawn } = await import('node:child_process');
  console.log('打开浏览器，请在窗口里扫码登录微博…（最多等 5 分钟）');
  spawn(EDGE, [
    `--remote-debugging-port=${WPPORT}`,
    `--user-data-dir=${WPROFILE}`,
    '--no-first-run', '--no-default-browser-check',
    'https://weibo.com/login.php',
  ], { stdio: 'ignore', detached: false });
  let ok = false;
  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    try {
      const cc = await connect(WPPORT);
      const has = await cc.ev(`document.cookie.includes('SUB=')`);
      await cc.close();
      if (has) { ok = true; break; }
      if (i % 6 === 5) console.log(`  等待登录… 已 ${Math.round((i + 1) * 5 / 60)} 分钟`);
    } catch (e) { /* 浏览器还没起来，继续等 */ }
  }
  if (!ok) { console.log('没等到登录，退出（可以用 --enrich 只补全已有数据）'); process.exit(1); }
  console.log('✓ 已登录，开始全量采集');
}

const c = await connect(WPORT);
const log = [];
try {
  await c.goto(`https://m.weibo.cn/u/${UID}`, 3500);

  // ---------- 阶段零：全量时间线（需要登录态） ----------
  let loggedIn = false;
  try {
    const probe = await c.ev(`(async () => {
      const r = await fetch('https://m.weibo.cn/api/container/getIndex?containerid=107603${UID}&page=2',
        { credentials: 'include', headers: { 'MWeibo-Pwa': '1', 'X-Requested-With': 'XMLHttpRequest' } });
      const j = await r.json();
      return j && j.ok === 1 ? 1 : 0;
    })()`);
    loggedIn = probe === 1;
  } catch (e) { loggedIn = false; }

  if (loggedIn && !ONLY_ENRICH) {
    const MAXP = Number(process.env.QD_WB_MAXPAGE || 400);
    let page = 1, added = 0, empty = 0;
    for (; page <= MAXP; page++) {
      const url = `https://m.weibo.cn/api/container/getIndex?containerid=107603${UID}&page=${page}`;
      let j = null;
      try {
        j = await c.ev(`(async () => {
          const r = await fetch(${JSON.stringify(url)}, { credentials: 'include',
            headers: { 'MWeibo-Pwa': '1', 'X-Requested-With': 'XMLHttpRequest' } });
          try { return await r.json(); } catch (e) { return { ok: -9 }; }
        })()`);
      } catch (e) { j = null; }
      if (!j || j.ok !== 1) { empty++; if (empty >= 2) break; await sleep(2500); continue; }
      empty = 0;
      const cards = [];
      const walk = (arr) => {
        for (const k of arr || []) {
          if (k.mblog) cards.push(k.mblog);
          if (k.card_group) walk(k.card_group);
          if (k.cards) walk(k.cards);
        }
      };
      walk(j.data && j.data.cards);
      if (!cards.length) break;
      let hit = 0;
      for (const m of cards) {
        if ((m.user && m.user.screen_name) !== AUTHOR) continue;
        hit++;
        if (merge(record(m))) added++;
      }
      if (page % 10 === 0) {
        save();
        console.log(`[全量 第 ${page} 页] 累计 ${store.length} 条（新增 ${added}）`);
      }
      await sleep(900 + Math.random() * 400);
    }
    save();
    console.log(`全量翻页结束：${store.length} 条（新增 ${added}）`);
  } else if (!ONLY_ENRICH) {
    console.log('未登录：主页只能取最新 12 条，翻页一律 ok:-100，改走搜索（覆盖有限）');
    console.log('  想补齐请先跑一次：node collect_weibo.mjs --login');
  }

  // ---------- 阶段一：搜索采集 ----------
  if (!ONLY_ENRICH) {
    let added = 0;
    for (let i = 0; i < queries.length; i++) {
      const q = queries[i];
      const url =
        'https://m.weibo.cn/api/container/getIndex?containerid=' +
        encodeURIComponent(`100103type=1&q=${q}`);
      let res = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          res = await c.ev(`(async () => {
            const r = await fetch(${JSON.stringify(url)}, { credentials: 'include',
              headers: { 'MWeibo-Pwa': '1', 'X-Requested-With': 'XMLHttpRequest' } });
            const t = await r.text();
            try { return JSON.parse(t); } catch (e) { return { ok: -9, raw: t.slice(0, 80) }; }
          })()`);
        } catch (e) {
          res = { ok: -8, err: String(e) };
        }
        if (res && (res.ok === 1 || res.ok === -100)) break;
        await sleep(4000 + attempt * 3000);
      }
      if (!res || res.ok !== 1) {
        log.push({ i, q, ok: res && res.ok });
        await sleep(1600);
        continue;
      }
      const cards = [];
      const walk = (arr) => {
        for (const k of arr || []) {
          if (k.mblog) cards.push(k.mblog);
          if (k.card_group) walk(k.card_group);
          if (k.cards) walk(k.cards);
        }
      };
      walk(res.data && res.data.cards);
      let hit = 0;
      for (const m of cards) {
        if ((m.user && m.user.screen_name) !== AUTHOR) continue;
        hit++;
        if (merge(record(m))) added++;
      }
      if (hit) log.push({ i, q, hit, total: store.length });
      if (i % 20 === 0) {
        save();
        console.log(`[搜索 ${i + 1}/${queries.length}] 累计 ${store.length} 条（新增 ${added}）`);
      }
      await sleep(1100 + Math.random() * 500);
    }
    save();
    console.log(`搜索完成：${store.length} 条（新增 ${added}）`);
  }

  // ---------- 阶段二：补全图片 / 全文 ----------
  const todo = store.filter((p) => !p.enriched || p.isLong);
  console.log(`待补全 ${todo.length} 条`);
  let n = 0;
  for (const p of todo) {
    const id = p.id;
    try {
      const d = await c.ev(`(async () => {
        const H = { 'MWeibo-Pwa': '1', 'X-Requested-With': 'XMLHttpRequest' };
        const out = {};
        try {
          const r = await fetch('https://m.weibo.cn/statuses/show?id=' + ${JSON.stringify(id)},
            { credentials: 'include', headers: H });
          const j = await r.json();
          if (j && j.ok === 1 && j.data) {
            const m = j.data;
            out.show = {
              pics: (m.pics || []).map(x => (x.large && x.large.url) || x.url || '').filter(Boolean),
              text: String(m.text || '').replace(/<br\\s*\\/?>/g, '\\n').replace(/<[^>]+>/g, ''),
              isLong: !!m.isLongText,
              hasVideo: !!(m.page_info && m.page_info.type === 'video'),
              videoUrl: (m.page_info && m.page_info.page_url) || '',
              reposts: m.reposts_count || 0, comments: m.comments_count || 0, likes: m.attitudes_count || 0,
              retweeted: m.retweeted_status ? String(m.retweeted_status.text || '').replace(/<[^>]+>/g, '').slice(0, 400) : '',
              retweetedUser: (m.retweeted_status && m.retweeted_status.user && m.retweeted_status.user.screen_name) || '',
            };
          } else out.showErr = j && j.ok;
        } catch (e) { out.showErr = String(e).slice(0, 60); }
        if (out.show && out.show.isLong) {
          try {
            const r2 = await fetch('https://m.weibo.cn/statuses/extend?id=' + ${JSON.stringify(id)},
              { credentials: 'include', headers: H });
            const j2 = await r2.json();
            if (j2 && j2.ok === 1 && j2.data && j2.data.longTextContent) {
              out.full = String(j2.data.longTextContent)
                .replace(/<br\\s*\\/?>/g, '\\n').replace(/<[^>]+>/g, '');
            }
          } catch (e) { out.fullErr = String(e).slice(0, 40); }
        }
        return out;
      })()`);
      if (d && d.show) {
        if ((d.show.pics || []).length >= (p.pics || []).length) p.pics = d.show.pics;
        if (d.show.text) p.text = d.show.text.trim();
        if (d.full) p.fullText = d.full.replace(/\s*全文\s*$/, '').trim();
        else if (!p.fullText) p.fullText = p.text;
        p.isLong = !!d.show.isLong;
        p.hasVideo = !!d.show.hasVideo;
        if (d.show.videoUrl) p.videoUrl = d.show.videoUrl;
        p.reposts = d.show.reposts || p.reposts;
        p.comments = d.show.comments || p.comments;
        p.likes = d.show.likes || p.likes;
        if (d.show.retweeted) p.retweeted = d.show.retweeted;
        if (d.show.retweetedUser) p.retweetedUser = d.show.retweetedUser;
        p.enriched = true;
      }
    } catch (e) {
      log.push({ enrich: id, err: String(e).slice(0, 60) });
    }
    n++;
    if (n % 10 === 0) {
      save();
      const picN = store.reduce((a, x) => a + (x.pics || []).length, 0);
      console.log(`[补全 ${n}/${todo.length}] 图片共 ${picN} 张`);
    }
    await sleep(800 + Math.random() * 500);
  }
} finally {
  save();
  const picN = store.reduce((a, x) => a + (x.pics || []).length, 0);
  const withPic = store.filter((x) => (x.pics || []).length).length;
  const longN = store.filter((x) => (x.fullText || '').length > (x.text || '').length).length;
  console.log(`完成：${store.length} 条，有图 ${withPic} 条 / ${picN} 张，长文补全 ${longN} 条`);
  console.log(`-> ${OUT}`);
  if (log.length) console.log('异常记录', JSON.stringify(log.slice(0, 8)));
  await c.close();
}

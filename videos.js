// videos.js — 视频站：投稿 / 专栏 / 微博，分类 + 多维细分筛选
const PAGE_SIZE = 48;
const URL_VIDEOS = "./data/videos.json";
const URL_GAMES = "./data/games.json";
const URL_WEIBO = "./data/weibo.json";

const PLAT_SHORT = {
  steam: "Steam", pc: "PC", switch: "NS", mobile: "手机端", web: "网页",
  console: "主机", itch: "itch", booth: "BOOTH", dlsite: "DLsite", freem: "freem!"
};
const KIND_NAMES = { release: "汉化发布", repo: "游玩repo", promo: "安利推荐", other: "其他" };
const GENRE_NAMES = {};
const EL_NAMES = {};

const state = {
  meta: {}, categories: [], facets: [], videos: [], articles: [],
  games: {}, weibo: { posts: [], kinds: {} },
  tab: "video", cat: "all", kind: "all", gid: "", gname: "",
  q: "", year: "", sort: "new", shown: PAGE_SIZE,
  f: {}            // facet 选择：{ genre:Set, plat:Set, ... }
};

const $ = id => document.getElementById(id);
const el = {
  grid: $("vGrid"), list: $("aList"), wlist: $("wList"), chips: $("vChips"),
  result: $("vResult"), more: $("vMore"), empty: $("vEmpty"),
  q: $("vq"), year: $("vyear"), sort: $("vsort"),
  statVideos: $("statVideos"), statArticles: $("statArticles"), statGames: $("statGames"),
  statWeibo: $("statWeibo"), statYears: $("statYears"), statPlays: $("statPlays"),
  statUpdated: $("statUpdated"),
  facets: $("vFacets"), facetBar: $("facetBar"), facetToggle: $("facetToggle"),
  facetClear: $("facetClear"), facetSel: $("vSelected"), gfilter: $("vGameFilter")
};

function esc(s){
  return String(s == null ? "" : s)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function fmtNum(n){
  n = Number(n) || 0;
  if(n >= 10000) return (n / 10000).toFixed(n >= 100000 ? 0 : 1) + "万";
  return String(n);
}
function fmtDur(sec){
  sec = Number(sec) || 0;
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p = x => String(x).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
}
function thumb(url, w){
  if(!url) return "";
  return url.includes("hdslb.com") ? `${url}@${w}w_${Math.round(w * 9 / 16)}h_1c.webp` : url;
}
function catName(key){
  const c = state.categories.find(x => x.key === key);
  return c ? c.name : "其他";
}
function yearOf(date){ return (date || "").slice(0, 4); }

/* ---------- 一键三连 ----------
   三连必须带 B 站登录态，第三方域名拿不到 cookie，所以真正执行的是
   assets/qdby-triple.user.js 在 bilibili.com 里跑的那段；本站只负责
   把「:BV」带过去，并识别脚本装没装（脚本会在本页写一个 localStorage 标记）。 */
const TRIPLE_FLAG = "qdby_triple_installed";
const TRIPLE_DONE = "qdby_tripled";

function tripleInstalled(){
  if(typeof window.__QDBY_TRIPLE__ === "string") return true;
  try { return localStorage.getItem(TRIPLE_FLAG) === "1"; } catch (e) { return false; }
}
function tripleDone(bv){
  try {
    const m = JSON.parse(localStorage.getItem(TRIPLE_DONE) || "{}");
    return !!m[bv];
  } catch (e) { return false; }
}
function markTriple(bv){
  try {
    const m = JSON.parse(localStorage.getItem(TRIPLE_DONE) || "{}");
    m[bv] = Date.now();
    localStorage.setItem(TRIPLE_DONE, JSON.stringify(m));
  } catch (e) {}
}
function tripleUrl(bv){
  return `https://www.bilibili.com/video/${bv}?qdby_triple=1`;
}
function refreshTripleUI(){
  const on = tripleInstalled();
  document.querySelectorAll(".vTriple").forEach(b => {
    b.classList.toggle("isReady", on);
    if(!b.classList.contains("isDone")){
      b.title = on ? "点赞 + 投币 + 收藏（脚本已就绪）" : "点赞 + 投币 + 收藏（首次需装一个小脚本）";
    }
  });
}
function openTripleDialog(bv, title){
  const dlg = $("tripleDialog");
  const manual = $("tripleManual");
  if(manual) manual.href = bv ? `https://www.bilibili.com/video/${bv}` : "https://www.bilibili.com/";
  const st = $("tripleState");
  if(st) st.textContent = title ? `准备三连：${title.length > 26 ? title.slice(0, 26) + "…" : title}` : "";
  if(dlg && !dlg.open) dlg.showModal();
}

function priceText(g){
  if(!g || !g.pz || g.pz === "unknown") return "";
  if(g.pz === "free") return "免费";
  return "¥" + (Math.round(Number(g.price) || 0));
}

/* ---------- facet 判定 ---------- */
function hasVal(x, group, val){
  const v = x[group];
  if(Array.isArray(v)) return v.includes(val);
  return v === val;
}
function activeCount(){
  return Object.values(state.f).reduce((s, set) => s + set.size, 0);
}
function facetPass(x){
  for(const group in state.f){
    const set = state.f[group];
    if(!set.size) continue;
    let ok = false;
    for(const val of set){ if(hasVal(x, group, val)){ ok = true; break; } }
    if(!ok) return false;
  }
  return true;
}

/* ---------- 数据加载 ---------- */
async function load(){
  const [rv, rg, rw] = await Promise.all([
    fetch(URL_VIDEOS, { cache: "no-cache" }),
    fetch(URL_GAMES, { cache: "no-cache" }).catch(() => null),
    fetch(URL_WEIBO, { cache: "no-cache" }).catch(() => null)
  ]);
  const d = await rv.json();
  state.meta = d.meta || {};
  state.categories = d.categories || [];
  state.facets = d.facets || [];
  state.videos = d.videos || [];
  state.articles = d.articles || [];
  state.facets.forEach(f => {
    state.f[f.key] = new Set();
    f.items.forEach(it => {
      if(f.key === "genre") GENRE_NAMES[it.key] = it.name;
      if(f.key === "el") EL_NAMES[it.key] = it.name;
    });
  });

  if(rg && rg.ok){
    try{
      const g = await rg.json();
      (g.games || []).forEach(x => { state.games[x.id] = x; });
    }catch{}
  }
  if(rw && rw.ok){
    try{
      const w = await rw.json();
      state.weibo = { posts: w.posts || [], kinds: w.kinds || {}, byGame: w.by_game || {}, meta: w };
    }catch{}
  }

  // 分类名补齐（用于微博关联游戏时的展示）
  el.statVideos.textContent = fmtNum(state.videos.length);
  el.statArticles.textContent = fmtNum(state.articles.length);
  el.statGames.textContent = fmtNum(state.meta.game_count || Object.keys(state.games).length);
  el.statWeibo.textContent = fmtNum(state.weibo.posts.length);
  const years = [...new Set(state.videos.concat(state.articles).map(x => yearOf(x.date)).filter(Boolean))].sort();
  el.statYears.textContent = years.length ? `${years[0]}–${years[years.length - 1]}` : "—";
  el.statPlays.textContent = fmtNum(state.videos.reduce((s, v) => s + (v.play || 0), 0));
  el.statUpdated.textContent = (state.meta.generated_at || "—").replace(/^(\d{4})-/, "");

  const noteEl = $("vNote");
  if(noteEl){
    const total = state.meta.space_total;
    const head = total && total > state.videos.length
      ? `已归档 ${state.videos.length} 条公开投稿与 ${state.articles.length} 篇专栏；空间投稿总计 ${total} 条，其余为受限或不公开条目。`
      : `已归档 ${state.videos.length} 条公开投稿与 ${state.articles.length} 篇专栏。`;
    const g = state.meta.game_linked || 0;
    const wb = state.weibo.posts.length;
    noteEl.textContent = `${head}其中 ${g} 条投稿可从简介识别出具体游戏（平台 / 价格 / 题材 / 要素均来自 UP 主自写的游戏说明）；` +
      (wb ? `已同步微博动态 ${wb} 条并关联到对应游戏。` : `微博动态尚未同步。`);
  }

  years.slice().reverse().forEach(y => {
    const o = document.createElement("option");
    o.value = y; o.textContent = y;
    el.year.appendChild(o);
  });

  renderChips();
  renderFacets();
  renderGameFilter();
  render();
}

/* ---------- 顶部 chips：分类 / 微博类型 ---------- */
function basePool(){
  if(state.tab === "article") return state.articles;
  if(state.tab === "weibo") return state.weibo.posts;
  return state.videos;
}

function renderChips(){
  if(state.tab === "weibo"){
    const pool = state.weibo.posts;
    const items = [{ key: "all", name: "全部" }].concat(
      ["release", "repo", "promo", "other"].map(k => ({ key: k, name: KIND_NAMES[k] }))
    );
    el.chips.innerHTML = items.map(c => {
      const n = c.key === "all" ? pool.length : pool.filter(x => x.kind === c.key).length;
      return `<button class="vChip${state.kind === c.key ? " isActive" : ""}" data-kind="${esc(c.key)}" type="button">
        ${esc(c.name)}<span class="vChipNum">${n}</span></button>`;
    }).join("");
    return;
  }
  const pool = basePool();
  const count = key => key === "all" ? pool.length : pool.filter(x => x.cat === key).length;
  const items = [{ key: "all", name: "全部" }].concat(
    state.categories.filter(c => count(c.key) > 0).map(c => ({ key: c.key, name: c.name }))
  );
  el.chips.innerHTML = items.map(c => `
    <button class="vChip${state.cat === c.key ? " isActive" : ""}" data-cat="${esc(c.key)}" type="button">
      ${esc(c.name)}<span class="vChipNum">${count(c.key)}</span>
    </button>`).join("");
}

/* ---------- 细分筛选 ---------- */
function countFor(groupKey, val){
  const q = state.q.trim().toLowerCase();
  return basePool().filter(x => {
    if(state.cat !== "all" && x.cat !== state.cat) return false;
    if(state.year && yearOf(x.date) !== state.year) return false;
    if(q){
      const hay = searchHay(x);
      if(!hay.includes(q)) return false;
    }
    if(!hasVal(x, groupKey, val)) return false;
    for(const g in state.f){
      if(g === groupKey) continue;
      const set = state.f[g];
      if(!set.size) continue;
      let ok = false;
      for(const v of set){ if(hasVal(x, g, v)){ ok = true; break; } }
      if(!ok) return false;
    }
    return true;
  }).length;
}

function renderFacets(){
  if(!el.facets) return;
  const show = state.tab === "video";
  if(el.facetBar) el.facetBar.hidden = !show;
  el.facets.hidden = !show;
  if(!show) return;

  el.facets.innerHTML = state.facets.map(f => {
    const any = basePool().some(x => x[f.key] && (Array.isArray(x[f.key]) ? x[f.key].length : true));
    if(!any) return "";
    const chips = f.items.map(it => {
      const n = countFor(f.key, it.key);
      const on = state.f[f.key] && state.f[f.key].has(it.key);
      return `<button class="fChip${on ? " isActive" : ""}${n === 0 && !on ? " isDim" : ""}"
        data-group="${esc(f.key)}" data-val="${esc(it.key)}" type="button"
        title="${esc(f.name)}：${esc(it.name)}">${esc(it.name)}<span class="fChipNum">${n}</span></button>`;
    }).join("");
    const hint = f.hint ? `<em class="fHint">${esc(f.hint)}</em>` : "";
    return `<div class="fGroup">
        <div class="fLabel">
          <span class="fName">${esc(f.name)}${f.type === "multi" ? '<i class="fMulti">多选</i>' : ""}</span>
        </div>
        <div class="fChips">${chips}</div>
        ${hint}
      </div>`;
  }).join("");

  const n = activeCount();
  if(el.facetClear) el.facetClear.hidden = n === 0;
  if(el.facetSel){
    if(!n){ el.facetSel.innerHTML = ""; el.facetSel.hidden = true; }
    else{
      const names = [];
      state.facets.forEach(f => {
        (state.f[f.key] ? [...state.f[f.key]] : []).forEach(v => {
          const it = f.items.find(i => i.key === v);
          if(it) names.push(`<button class="fSel" data-group="${esc(f.key)}" data-val="${esc(v)}" type="button">${esc(f.name)}：${esc(it.name)}<span aria-hidden="true">×</span></button>`);
        });
      });
      el.facetSel.innerHTML = `<span class="fSelLabel">已选</span>${names.join("")}<button class="fSelClear" id="fSelClear" type="button">清除</button>`;
      el.facetSel.hidden = false;
      const c = $("fSelClear");
      if(c) c.addEventListener("click", resetFacets);
    }
  }
}

function resetFacets(){
  Object.keys(state.f).forEach(k => state.f[k].clear());
  state.shown = PAGE_SIZE;
  renderFacets();
  render();
}

/* ---------- 游戏过滤条 ---------- */
function renderGameFilter(){
  if(!el.gfilter) return;
  if(!state.gid){
    el.gfilter.hidden = true;
    el.gfilter.innerHTML = "";
    return;
  }
  const g = state.games[state.gid] || {};
  const n = state.videos.filter(v => v.gid === state.gid).length;
  el.gfilter.hidden = false;
  el.gfilter.innerHTML = `<span class="fSelLabel">限定游戏</span>
    <button class="gChip" id="gChipClear" type="button">
      《${esc(g.name || state.gname)}》 · ${n} 条投稿 <span aria-hidden="true">×</span>
    </button>`;
  const b = $("gChipClear");
  if(b) b.addEventListener("click", () => {
    state.gid = ""; state.gname = ""; state.shown = PAGE_SIZE;
    renderGameFilter(); renderChips(); renderFacets(); render();
  });
}

/* ---------- 过滤与排序 ---------- */
function searchHay(x){
  const g = state.games[x.gid];
  return [x.title, x.game, catName(x.cat), x.summary, g ? g.name : "", g ? (g.orig || "") : "",
          (g && g.alias ? g.alias.join(" ") : ""), x.text || ""].join(" ").toLowerCase();
}

function filtered(){
  const pool = basePool();
  const q = state.q.trim().toLowerCase();
  const arr = pool.filter(x => {
    if(state.tab === "weibo"){
      if(state.kind !== "all" && x.kind !== state.kind) return false;
      if(state.year && yearOf(x.date) !== state.year) return false;
      if(state.gid && !(x.games || []).includes(state.gid)) return false;
      if(q && !searchHay(x).includes(q)) return false;
      return true;
    }
    if(state.cat !== "all" && x.cat !== state.cat) return false;
    if(state.year && yearOf(x.date) !== state.year) return false;
    if(state.gid && x.gid !== state.gid) return false;
    if(q && !searchHay(x).includes(q)) return false;
    return facetPass(x);
  });
  const KIND_ORDER = { release: 0, repo: 1, promo: 2, other: 3 };
  const cmp = {
    new: (a, b) => (b.ts || 0) - (a.ts || 0),
    old: (a, b) => (a.ts || 0) - (b.ts || 0),
    play: (a, b) => ((b.play || b.view || b.likes || 0) - (a.play || a.view || a.likes || 0)),
    long: (a, b) => ((b.dur || 0) - (a.dur || 0)),
    kind: (a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) || (b.ts || 0) - (a.ts || 0)
  }[state.sort] || ((a, b) => (b.ts || 0) - (a.ts || 0));
  arr.sort(cmp);
  return arr;
}

/* ---------- 渲染 ---------- */
function genreTags(x){
  return (x.genre || []).slice(0, 2)
    .map(k => GENRE_NAMES[k] ? `<span class="vTag vTag--facet">${esc(GENRE_NAMES[k])}</span>` : "")
    .join("");
}

function videoCard(v){
  const g = state.games[v.gid];
  const wbCount = v.gid && state.weibo.byGame ? (state.weibo.byGame[v.gid] || []).length : 0;
  const store = g && g.store && g.store.steam ? g.store.steam.url : (g && g.url ? g.url : "");
  const plat = (v.plat || []).slice(0, 2).map(k => PLAT_SHORT[k] || k).join(" · ");
  const price = priceText(g);
  const tripled = tripleDone(v.id);
  const gameLine = g
    ? `<div class="vGameRow">
         ${store ? `<a class="vGame" href="${esc(store)}" target="_blank" rel="noopener" title="打开游戏页面">《${esc(g.name)}》<span class="vGameOut" aria-hidden="true">↗</span></a>`
                 : `<span class="vGame">《${esc(g.name)}》</span>`}
         ${price ? `<span class="vPrice${v.pz === "free" ? " isFree" : ""}">${esc(price)}</span>` : ""}
         ${plat ? `<span class="vPlat">${esc(plat)}</span>` : ""}
         ${wbCount ? `<button class="vWbBtn" data-wgid="${esc(v.gid)}" type="button">微博 ${wbCount}</button>` : ""}
       </div>`
    : "";
  return `
    <div class="vCard">
      <a class="vCover" href="https://www.bilibili.com/video/${esc(v.id)}" target="_blank" rel="noopener" title="${esc(v.title)}">
        <img src="${esc(thumb(v.pic, 360))}" alt="" loading="lazy" referrerpolicy="no-referrer">
        <span class="vDur">${esc(v.durText || fmtDur(v.dur))}</span>
        <span class="vPlayMini">▶ ${fmtNum(v.play)}</span>
      </a>
      <div class="vBody">
        <a class="vTitle" href="https://www.bilibili.com/video/${esc(v.id)}" target="_blank" rel="noopener">${esc(v.title)}</a>
        <div class="vMeta">
          <span class="vTag vTag--${esc(v.cat)}">${esc(catName(v.cat))}</span>
          ${genreTags(v)}
          <span class="vDate">${esc(v.date)}</span>
          <button class="vTriple${tripled ? " isDone" : ""}" data-bv="${esc(v.id)}"
                  data-title="${esc(v.title)}" type="button"
                  title="${tripled ? "这台设备上已经点过三连" : "点赞 + 投币 + 收藏"}">
            <span class="vTripleIcon" aria-hidden="true">${tripled ? "✓" : "♥"}</span>${tripled ? "已三连" : "三连"}
          </button>
        </div>
        ${gameLine}
      </div>
    </div>`;
}

function articleCard(a){
  const cover = a.pic ? `<div class="aCover"><img src="${esc(thumb(a.pic, 320))}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>` : "";
  return `
    <a class="aCard" href="${esc(a.url)}" target="_blank" rel="noopener">
      ${cover}
      <div class="aBody">
        <h3 class="aTitle">${esc(a.title)}</h3>
        <p class="aSummary">${esc(a.summary || "")}</p>
        <div class="vMeta">
          <span class="vTag vTag--${esc(a.cat)}">${esc(catName(a.cat))}</span>
          ${genreTags(a)}
          <span class="vDate">${esc(a.date)}</span>
          <span class="vDate">阅读 ${fmtNum(a.view)}</span>
        </div>
      </div>
    </a>`;
}

function weiboCard(p){
  const pics = (p.pics || []).slice(0, 3).map(u =>
    `<span class="wPic"><img src="${esc(thumb(u, 240))}" alt="" loading="lazy" referrerpolicy="no-referrer"></span>`).join("");
  const games = (p.games || []).map(gid => {
    const g = state.games[gid];
    if(!g) return "";
    return `<button class="wGame" data-gid="${esc(gid)}" type="button">《${esc(g.name)}》<span class="wGameN">${g.vcount}</span></button>`;
  }).join("");
  return `
    <article class="wCard">
      <div class="wHead">
        <span class="vTag wKind wKind--${esc(p.kind)}">${esc(KIND_NAMES[p.kind] || "其他")}</span>
        <span class="vDate">${esc(p.date)}</span>
        <a class="wOpen" href="${esc(p.url)}" target="_blank" rel="noopener">微博原文 ↗</a>
      </div>
      <p class="wText" id="wt-${esc(p.id)}">${esc(p.text || "")}</p>
      <button class="wToggle" data-wid="${esc(p.id)}" type="button" hidden>展开全文</button>
      ${pics ? `<div class="wPics">${pics}</div>` : ""}
      <div class="wFoot">
        ${games ? `<span class="wGamesLabel">关联</span>${games}` : `<span class="wNoGame">未关联到站内游戏</span>`}
        <span class="wStat">♡ ${p.likes}　💬 ${p.comments}　↻ ${p.reposts}</span>
      </div>
    </article>`;
}

function render(){
  const arr = filtered();
  const shown = arr.slice(0, state.shown);

  el.grid.hidden = state.tab !== "video";
  el.list.hidden = state.tab !== "article";
  el.wlist.hidden = state.tab !== "weibo";

  if(state.tab === "video") el.grid.innerHTML = shown.map(videoCard).join("");
  else if(state.tab === "article") el.list.innerHTML = shown.map(articleCard).join("");
  else el.wlist.innerHTML = shown.map(weiboCard).join("");

  const label = { video: "条投稿", article: "篇专栏", weibo: "条微博" }[state.tab];
  el.result.textContent = `共 ${arr.length} ${label}，已显示 ${shown.length} 条` +
    (state.q ? ` · 关键词「${state.q}」` : "") +
    (state.gid && state.tab !== "weibo" ? ` · 限定游戏` : "");

  el.empty.hidden = arr.length !== 0;
  if(arr.length === 0){
    el.empty.textContent = (state.tab === "video" && activeCount() > 0)
      ? "当前细分条件下没有内容，试试取消一两个条件。"
      : "没有匹配的内容，换个关键词或分类试试。";
  }
  el.more.hidden = shown.length >= arr.length || arr.length === 0;

  if(state.tab === "weibo") syncToggles();
}

// 微博正文按实际是否被 4 行截断来决定要不要给「展开全文」，
// 只按字数猜会漏掉排版换行很多、字数却不多的情况。
function syncToggles(){
  el.wlist.querySelectorAll(".wText").forEach(p => {
    const btn = p.parentElement.querySelector(".wToggle");
    if(!btn) return;
    btn.hidden = p.scrollHeight - p.clientHeight <= 2;
  });
}

/* ---------- 交互 ---------- */
function wire(){
  el.chips.addEventListener("click", e => {
    const bk = e.target.closest("[data-kind]");
    if(bk){
      state.kind = bk.dataset.kind; state.shown = PAGE_SIZE;
      renderChips(); render();
      return;
    }
    const b = e.target.closest("[data-cat]");
    if(!b) return;
    state.cat = b.dataset.cat;
    state.shown = PAGE_SIZE;
    renderChips();
    renderFacets();
    render();
  });

  document.querySelectorAll(".vTab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".vTab").forEach(t => {
        t.classList.toggle("isActive", t === tab);
        t.setAttribute("aria-selected", String(t === tab));
      });
      state.tab = tab.dataset.tab;
      state.cat = "all";
      state.kind = "all";
      state.shown = PAGE_SIZE;
      // 微博里个人碎碎念多，默认按类型分组，repo / 安利 / 汉化发布排前面
      if(state.tab === "weibo"){ state.sort = "kind"; if(el.sort) el.sort.value = "kind"; }
      else if(state.sort === "kind"){ state.sort = "new"; if(el.sort) el.sort.value = "new"; }
      Object.keys(state.f).forEach(k => state.f[k].clear());
      renderChips();
      renderFacets();
      render();
    });
  });

  if(el.facets){
    el.facets.addEventListener("click", e => {
      const b = e.target.closest("[data-group]");
      if(!b) return;
      const g = b.dataset.group, v = b.dataset.val;
      const def = state.facets.find(f => f.key === g);
      if(!def || !state.f[g]) return;
      if(def.type === "multi"){
        state.f[g].has(v) ? state.f[g].delete(v) : state.f[g].add(v);
      }else{
        const wasOn = state.f[g].has(v);
        state.f[g].clear();
        if(!wasOn) state.f[g].add(v);
      }
      state.shown = PAGE_SIZE;
      renderFacets();
      render();
    });
  }

  if(el.facetSel){
    el.facetSel.addEventListener("click", e => {
      const b = e.target.closest(".fSel");
      if(!b) return;
      const g = b.dataset.group, v = b.dataset.val;
      if(state.f[g]) state.f[g].delete(v);
      state.shown = PAGE_SIZE;
      renderFacets();
      render();
    });
  }

  // 视频卡片：三连
  if(el.grid){
    el.grid.addEventListener("click", e => {
      const b = e.target.closest(".vTriple");
      if(!b) return;
      e.preventDefault();
      const bv = b.dataset.bv;
      const title = b.dataset.title || "";
      if(!tripleInstalled()){
        openTripleDialog(bv, title);
        return;
      }
      window.open(tripleUrl(bv), "_blank", "noopener");
      markTriple(bv);
      b.classList.add("isDone");
      b.dataset.tripled = "1";
      b.innerHTML = `<span class="vTripleIcon" aria-hidden="true">✓</span>已发送`;
      b.title = "已在 B 站页面执行三连，结果看那边的面板";
    });
  }

  // 三连引导弹层
  const tdlg = $("tripleDialog");
  if(tdlg){
    $("tripleClose")?.addEventListener("click", () => tdlg.close());
    tdlg.addEventListener("click", e => {
      if(e.target === tdlg) tdlg.close();
    });
    $("tripleCheck")?.addEventListener("click", () => {
      const st = $("tripleState");
      if(tripleInstalled()){
        if(st) st.textContent = "✓ 已识别到脚本，现在可以一键三连了。";
        refreshTripleUI();
        setTimeout(() => tdlg.close(), 700);
      } else if(st){
        st.textContent = "还没检测到。确认脚本已启用后，刷新本页再点这里。";
      }
    });
  }
  refreshTripleUI();

  // 微博正文展开 / 收起
  if(el.wlist){
    el.wlist.addEventListener("click", e => {
      const b = e.target.closest(".wToggle");
      if(!b) return;
      const pid = b.dataset.wid;
      const pEl = document.getElementById("wt-" + pid);
      if(!pEl) return;
      const open = pEl.classList.toggle("isOpen");
      b.textContent = open ? "收起" : "展开全文";
    });
  }

  // 视频卡片上点「微博 N」→ 跳到微博动态并限定该游戏
  if(el.grid){
    el.grid.addEventListener("click", e => {
      const b = e.target.closest(".vWbBtn");
      if(!b) return;
      e.preventDefault();
      state.gid = b.dataset.wgid;
      state.tab = "weibo";
      state.kind = "all"; state.q = ""; state.year = "";
      if(el.q) el.q.value = "";
      if(el.year) el.year.value = "";
      state.sort = "kind"; if(el.sort) el.sort.value = "kind";
      document.querySelectorAll(".vTab").forEach(t => {
        const on = t.dataset.tab === "weibo";
        t.classList.toggle("isActive", on);
        t.setAttribute("aria-selected", String(on));
      });
      renderChips(); renderFacets(); renderGameFilter(); render();
      window.scrollTo({ top: el.chips.offsetTop - 120, behavior: "smooth" });
    });
  }

  // 微博卡片里点游戏名 → 跳到投稿视频并限定该游戏
  if(el.wlist){
    el.wlist.addEventListener("click", e => {
      const b = e.target.closest("[data-gid]");
      if(!b) return;
      const g = state.games[b.dataset.gid];
      if(!g) return;
      state.gid = b.dataset.gid;
      state.gname = g.name;
      state.tab = "video";
      state.cat = "all"; state.q = ""; state.year = ""; state.shown = PAGE_SIZE;
      if(el.q) el.q.value = "";
      if(el.year) el.year.value = "";
      Object.keys(state.f).forEach(k => state.f[k].clear());
      document.querySelectorAll(".vTab").forEach(t => {
        const on = t.dataset.tab === "video";
        t.classList.toggle("isActive", on);
        t.setAttribute("aria-selected", String(on));
      });
      renderChips(); renderFacets(); renderGameFilter(); render();
      window.scrollTo({ top: el.chips.offsetTop - 120, behavior: "smooth" });
    });
  }

  if(el.facetToggle && el.facets){
    el.facetToggle.addEventListener("click", () => {
      const on = el.facets.hasAttribute("hidden");
      if(on){ el.facets.removeAttribute("hidden"); el.facetToggle.setAttribute("aria-expanded", "true"); }
      else{ el.facets.setAttribute("hidden", ""); el.facetToggle.setAttribute("aria-expanded", "false"); }
    });
  }

  let timer = null;
  el.q.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      state.q = el.q.value;
      state.shown = PAGE_SIZE;
      renderFacets();
      render();
    }, 180);
  });
  el.year.addEventListener("change", () => {
    state.year = el.year.value; state.shown = PAGE_SIZE;
    renderFacets(); render();
  });
  el.sort.addEventListener("change", () => { state.sort = el.sort.value; render(); });
  el.more.addEventListener("click", () => { state.shown += PAGE_SIZE; render(); });

  document.addEventListener("error", e => {
    const t = e.target;
    if(!t || t.tagName !== "IMG") return;
    const box = t.closest(".wPic");
    if(box) box.classList.add("isBad");
    else t.style.visibility = "hidden";
  }, true);
}

load().then(wire).catch(err => {
  console.error(err);
  el.result.textContent = "数据加载失败，请稍后重试。";
});

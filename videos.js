// videos.js — 视频站：全站投稿与专栏，支持分类 + 多维细分筛选、搜索、排序、分页加载
const DATA_URL = "./data/videos.json";
const PAGE_SIZE = 48;

const state = {
  meta: {},
  categories: [],
  facets: [],
  videos: [],
  articles: [],
  tab: "video",
  cat: "all",
  q: "",
  year: "",
  sort: "new",
  shown: PAGE_SIZE,
  f: {}            // facet 选择：{ topic:Set, plat:Set, ... }
};

const $ = id => document.getElementById(id);
const el = {
  grid: $("vGrid"), list: $("aList"), chips: $("vChips"), result: $("vResult"),
  more: $("vMore"), empty: $("vEmpty"), q: $("vq"), year: $("vyear"), sort: $("vsort"),
  statVideos: $("statVideos"), statArticles: $("statArticles"), statYears: $("statYears"),
  statPlays: $("statPlays"), statUpdated: $("statUpdated"),
  facets: $("vFacets"), facetToggle: $("facetToggle"), facetClear: $("facetClear"),
  facetSel: $("vSelected")
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
  const res = await fetch(DATA_URL, { cache: "no-cache" });
  const d = await res.json();
  state.meta = d.meta || {};
  state.categories = d.categories || [];
  state.facets = d.facets || [];
  state.videos = d.videos || [];
  state.articles = d.articles || [];
  state.facets.forEach(f => { state.f[f.key] = new Set(); });

  el.statVideos.textContent = fmtNum(state.videos.length);
  el.statArticles.textContent = fmtNum(state.articles.length);
  const years = [...new Set(state.videos.concat(state.articles).map(x => yearOf(x.date)).filter(Boolean))].sort();
  el.statYears.textContent = years.length ? `${years[0]}–${years[years.length - 1]}` : "—";
  el.statPlays.textContent = fmtNum(state.videos.reduce((s, v) => s + (v.play || 0), 0));
  el.statUpdated.textContent = (state.meta.generated_at || "—").replace(/^(\d{4})-/, "");

  const noteEl = $("vNote");
  if(noteEl){
    const total = state.meta.space_total;
    noteEl.textContent = total && total > state.videos.length
      ? `已归档 ${state.videos.length} 条公开投稿与 ${state.articles.length} 篇专栏；空间投稿总计 ${total} 条，其余为受限或不公开条目，无法通过公开接口获取。`
      : `已归档 ${state.videos.length} 条公开投稿与 ${state.articles.length} 篇专栏。`;
  }

  years.slice().reverse().forEach(y => {
    const o = document.createElement("option");
    o.value = y; o.textContent = y;
    el.year.appendChild(o);
  });

  renderChips();
  renderFacets();
  render();
}

/* ---------- 分类 chips ---------- */
function basePool(){
  return state.tab === "video" ? state.videos : state.articles;
}

function renderChips(){
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

/* ---------- 细分筛选面板 ---------- */
// 计算某组的候选项计数：应用「分类 + 年份 + 搜索 + 其它组已选」后剩余条数
function countFor(groupKey, val){
  const q = state.q.trim().toLowerCase();
  return basePool().filter(x => {
    if(state.cat !== "all" && x.cat !== state.cat) return false;
    if(state.year && yearOf(x.date) !== state.year) return false;
    if(q){
      const hay = [x.title, x.game, catName(x.cat), x.summary].join(" ").toLowerCase();
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
  const html = state.facets.map(f => {
    // 当前标签页下该组是否有任何可筛条目
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
          ${hint}
        </div>
        <div class="fChips">${chips}</div>
      </div>`;
  }).join("");
  el.facets.innerHTML = html;

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

/* ---------- 过滤与排序 ---------- */
function filtered(){
  const pool = basePool();
  const q = state.q.trim().toLowerCase();
  const arr = pool.filter(x => {
    if(state.cat !== "all" && x.cat !== state.cat) return false;
    if(state.year && yearOf(x.date) !== state.year) return false;
    if(q){
      const hay = [x.title, x.game, catName(x.cat), x.summary].join(" ").toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return facetPass(x);
  });
  const cmp = {
    new: (a, b) => (b.ts || 0) - (a.ts || 0),
    old: (a, b) => (a.ts || 0) - (b.ts || 0),
    play: (a, b) => ((b.play || b.view || 0) - (a.play || a.view || 0)),
    long: (a, b) => ((b.dur || 0) - (a.dur || 0))
  }[state.sort] || cmpDefault;
  arr.sort(cmp);
  return arr;
}

function cmpDefault(a, b){ return (b.ts || 0) - (a.ts || 0); }

/* ---------- 渲染 ---------- */
function tagsHtml(x){
  const out = [];
  const topicNames = {};
  const tf = state.facets.find(f => f.key === "topic");
  if(tf) tf.items.forEach(i => { topicNames[i.key] = i.name; });
  (x.topic || []).slice(0, 3).forEach(k => {
    if(topicNames[k]) out.push(`<span class="vTag vTag--facet">${esc(topicNames[k])}</span>`);
  });
  return out.join("");
}

function videoCard(v){
  const cat = catName(v.cat);
  return `
    <a class="vCard" href="https://www.bilibili.com/video/${esc(v.id)}" target="_blank" rel="noopener" title="${esc(v.title)}">
      <div class="vCover">
        <img src="${esc(thumb(v.pic, 360))}" alt="" loading="lazy" referrerpolicy="no-referrer">
        <span class="vDur">${esc(v.durText || fmtDur(v.dur))}</span>
        <span class="vPlayMini">▶ ${fmtNum(v.play)}</span>
      </div>
      <div class="vBody">
        <h3 class="vTitle">${esc(v.title)}</h3>
        <div class="vMeta">
          <span class="vTag vTag--${esc(v.cat)}">${esc(cat)}</span>
          ${tagsHtml(v)}
          <span class="vDate">${esc(v.date)}</span>
        </div>
      </div>
    </a>`;
}

function articleCard(a){
  const cat = catName(a.cat);
  const cover = a.pic ? `<div class="aCover"><img src="${esc(thumb(a.pic, 320))}" alt="" loading="lazy" referrerpolicy="no-referrer"></div>` : "";
  return `
    <a class="aCard" href="${esc(a.url)}" target="_blank" rel="noopener">
      ${cover}
      <div class="aBody">
        <h3 class="aTitle">${esc(a.title)}</h3>
        <p class="aSummary">${esc(a.summary || "")}</p>
        <div class="vMeta">
          <span class="vTag vTag--${esc(a.cat)}">${esc(cat)}</span>
          ${tagsHtml(a)}
          <span class="vDate">${esc(a.date)}</span>
          <span class="vDate">阅读 ${fmtNum(a.view)}</span>
        </div>
      </div>
    </a>`;
}

function render(){
  const arr = filtered();
  const shown = arr.slice(0, state.shown);

  if(state.tab === "video"){
    el.grid.hidden = false;
    el.list.hidden = true;
    el.grid.innerHTML = shown.map(videoCard).join("");
  }else{
    el.grid.hidden = true;
    el.list.hidden = false;
    el.list.innerHTML = shown.map(articleCard).join("");
  }

  el.result.textContent = `共 ${arr.length} 条，已显示 ${shown.length} 条` +
    (state.q ? ` · 关键词「${state.q}」` : "");
  el.empty.hidden = arr.length !== 0;
  if(arr.length === 0){
    el.empty.textContent = activeCount() > 0
      ? "当前细分条件下没有内容，试试取消一两个条件。"
      : "没有匹配的内容，换个关键词或分类试试。";
  }
  el.more.hidden = shown.length >= arr.length || arr.length === 0;
}

/* ---------- 交互 ---------- */
function wire(){
  el.chips.addEventListener("click", e => {
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
      state.shown = PAGE_SIZE;
      Object.keys(state.f).forEach(k => state.f[k].clear());  // 视频/专栏可用维度不同，切页清零
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

  el.more.addEventListener("click", () => {
    state.shown += PAGE_SIZE;
    render();
  });

  // 图片加载失败时隐藏，避免破图
  document.addEventListener("error", e => {
    const t = e.target;
    if(t && t.tagName === "IMG"){ t.style.visibility = "hidden"; }
  }, true);
}

load().then(wire).catch(err => {
  console.error(err);
  el.result.textContent = "数据加载失败，请稍后重试。";
});

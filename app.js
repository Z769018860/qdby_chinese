// app.js (ESM)
// Data source: ./data.json

const LIKE_VOTE_STORAGE_KEY = "qdby.like-votes.v2";
const MESSAGE_STORAGE_KEY = "qdby.messages.v1";
const API_BASE = "/api";
const WALINE_SERVER = "https://textbox.qingdengbuyi.top";
const WALINE_LIKE_PREFIX = "/__qdby_home_likes__/";
const state = { data: [], netdisk: { games: {} }, autofill: { games: {} }, likes: {}, liked: new Set(), messages: [], storageOK: true, onlineOK: false };

const el = {
  tbody: document.getElementById("tbody"),
  q: document.getElementById("q"),
  type: document.getElementById("type"),
  degree: document.getElementById("degree"),
  age: document.getElementById("age"),
  lang: document.getElementById("lang"),
  duration: document.getElementById("duration"),
  license: document.getElementById("license"),
  member: document.getElementById("member"),
  price: document.getElementById("price"),
  plat: document.getElementById("plat"),
  topic: document.getElementById("topic"),
  sort: document.getElementById("sort"),
  status: document.getElementById("status"),
  viewer: document.getElementById("viewer"),
  viewerImg: document.getElementById("viewerImg"),
  viewerClose: document.getElementById("viewerClose"),
  messageForm: document.getElementById("messageForm"),
  messageName: document.getElementById("messageName"),
  messageText: document.getElementById("messageText"),
  messageList: document.getElementById("messageList"),
  messageStatus: document.getElementById("messageStatus")
};

document.getElementById("year").innerText = String(new Date().getFullYear());

function setStatus(s){ el.status.textContent = s || ""; }

function safeText(s){ return String(s == null ? "" : s); }

function escapeHtml(s){
  return safeText(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function canUseLocalStorage(){
  try{
    const key = "__qdby_test__";
    localStorage.setItem(key, "1");
    localStorage.removeItem(key);
    return true;
  }catch(_err){
    return false;
  }
}

function getLocalItem(key){
  if(!state.storageOK){ return null; }
  try{
    return localStorage.getItem(key);
  }catch(_err){
    state.storageOK = false;
    return null;
  }
}

function setLocalItem(key, value){
  if(!state.storageOK){ return false; }
  try{
    localStorage.setItem(key, value);
    return true;
  }catch(_err){
    state.storageOK = false;
    return false;
  }
}

async function apiJson(path, options = {}){
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if(!res.ok){ throw new Error(`HTTP ${res.status}`); }
  return res.json();
}

async function tryLoadRemoteState(){
  try{
    const remote = await apiJson('/state', { cache: 'no-store' });
    if(remote && typeof remote === 'object'){
      state.messages = Array.isArray(remote.messages) ? remote.messages : state.messages;
      state.onlineOK = true;
      return true;
    }
  }catch(_err){
    state.onlineOK = false;
  }
  return false;
}

function walineLikePath(id){
  return `${WALINE_LIKE_PREFIX}${encodeURIComponent(safeText(id).trim())}`;
}

function parseWalineCounterPayload(payload){
  if(payload && payload.errno){
    throw new Error(payload.errmsg || `Waline errno ${payload.errno}`);
  }
  return Array.isArray(payload?.data) ? payload.data : [];
}

async function fetchWalineLikeCounts(ids){
  const cleanIds = [...new Set(ids.map((id)=>safeText(id).trim()).filter(Boolean))];
  const nextLikes = { ...state.likes };
  cleanIds.forEach((id)=>{ nextLikes[id] = 0; });
  const chunkSize = 40;

  for(let start = 0; start < cleanIds.length; start += chunkSize){
    const chunk = cleanIds.slice(start, start + chunkSize);
    const paths = chunk.map(walineLikePath);
    const url = `${WALINE_SERVER}/api/article?path=${encodeURIComponent(paths.join(','))}&type=reaction0&lang=zh-CN`;
    const response = await fetch(url, { cache: 'no-store' });
    if(!response.ok){ throw new Error(`Waline like GET HTTP ${response.status}`); }

    const rows = parseWalineCounterPayload(await response.json());
    chunk.forEach((id, index)=>{
      const value = Number(rows[index]?.reaction0 || 0);
      nextLikes[id] = Number.isFinite(value) && value > 0 ? value : 0;
    });
  }

  state.likes = nextLikes;
  return nextLikes;
}

async function updateWalineLike(id, action){
  const response = await fetch(`${WALINE_SERVER}/api/article?lang=zh-CN`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      path: walineLikePath(id),
      type: 'reaction0',
      action,
    }),
  });
  if(!response.ok){ throw new Error(`Waline like POST HTTP ${response.status}`); }

  const rows = parseWalineCounterPayload(await response.json());
  const value = Number(rows[0]?.reaction0);
  if(Number.isFinite(value)){
    state.likes[id] = Math.max(0, value);
    return state.likes[id];
  }

  const refreshed = await fetchWalineLikeCounts([id]);
  return Number(refreshed[id] || 0);
}

async function postMessageRemote(author, text){
  const payload = await apiJson('/messages', {
    method: 'POST',
    body: JSON.stringify({ author, text }),
  });
  if(payload && Array.isArray(payload.messages)){
    state.messages = payload.messages;
  }
  state.onlineOK = true;
  return payload;
}

function loadLikedIds(){
  try{
    const raw = getLocalItem(LIKE_VOTE_STORAGE_KEY);
    if(!raw){ return new Set(); }
    const parsed = JSON.parse(raw);
    if(Array.isArray(parsed)){ return new Set(parsed.map((id)=>safeText(id).trim()).filter(Boolean)); }
  }catch(_err){
    // ignore malformed local vote state
  }
  return new Set();
}

function saveLikedIds(){
  return setLocalItem(LIKE_VOTE_STORAGE_KEY, JSON.stringify([...state.liked]));
}

function isLiked(id){
  return state.liked.has(safeText(id).trim());
}

function setLiked(id, liked){
  const key = safeText(id).trim();
  if(!key){ return; }
  if(liked){ state.liked.add(key); }
  else{ state.liked.delete(key); }
  saveLikedIds();
}

function getLikeCount(id){
  const n = Number(state.likes[id] || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}


function loadMessages(){
  try{
    const raw = getLocalItem(MESSAGE_STORAGE_KEY);
    if(!raw){ return []; }
    const parsed = JSON.parse(raw);
    if(Array.isArray(parsed)){ return parsed; }
  }catch(_err){
    // ignore malformed cache
  }
  return [];
}

function saveMessages(){
  return setLocalItem(MESSAGE_STORAGE_KEY, JSON.stringify(state.messages));
}

function formatTime(iso){
  const t = Date.parse(safeText(iso));
  if(!Number.isFinite(t)){ return "刚刚"; }
  return new Date(t).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function renderMessages(){
  if(!el.messageList){ return; }
  if(state.messages.length === 0){
    el.messageList.innerHTML = '<li class="messageEmpty muted">还没有留言，欢迎抢沙发～</li>';
    return;
  }

  const items = state.messages
    .slice()
    .sort((a,b)=>Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""))
    .map((msg)=>{
      const author = escapeHtml(safeText(msg.author).trim() || "匿名");
      const text = escapeHtml(safeText(msg.text).trim());
      return `
        <li class="messageItem">
          <div class="messageMeta">${author} · ${formatTime(msg.createdAt)}</div>
          <p>${text}</p>
        </li>`;
    }).join("");

  el.messageList.innerHTML = items;
}

async function postMessage(name, text){
  const author = safeText(name).trim().slice(0,20);
  const messageText = safeText(text).trim().slice(0,300);

  if(!messageText){
    return { ok:false, message:"留言内容不能为空。" };
  }

  try{
    await postMessageRemote(author, messageText);
    renderMessages();
    return { ok:true, message:"留言发布成功，已同步到在线留言板。" };
  }catch(_err){
    state.onlineOK = false;
  }

  const payload = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    author,
    text: messageText,
    createdAt: new Date().toISOString()
  };

  state.messages.push(payload);
  if(state.messages.length > 100){
    state.messages = state.messages.slice(-100);
  }
  const saved = saveMessages();
  renderMessages();
  if(!saved){
    return { ok:true, message:"在线服务不可用，且当前浏览器限制存储，留言仅临时显示。" };
  }
  return { ok:true, message:"在线服务暂不可用，已临时保存到本地。" };
}

function uniq(values){
  const set = new Set();
  for(const v of values){
    const s = safeText(v).trim();
    if(s){ set.add(s); }
  }
  return Array.from(set).sort((a,b)=>a.localeCompare(b,"zh-Hant"));
}

function parseDate(s){
  const t = Date.parse(safeText(s));
  if(Number.isFinite(t)){ return t; }
  return 0;
}

function linkOrDash(url, label){
  const u = safeText(url).trim();
  if(!u){ return "<span class=\"muted\">—</span>"; }
  const l = label || "打开";
  return `<a href="${u}" target="_blank" rel="noopener">${l}</a>`;
}

function buildBadges(r){
  const items = [];
  if(r["游戏类型"]){ items.push(r["游戏类型"]); }
  if(r["年龄分级"]){ items.push(r["年龄分级"]); }
  if(r["汉化程度"]){ items.push(r["汉化程度"]); }
  return items.map(x=>`<span class="badge">${safeText(x)}</span>`).join("");
}

function buildDetails(r){
  const kv = [];
  const urlRe = /(https?:\/\/[^\s<>"']+)/g;

  const linkify = (text)=>{
    const s = safeText(text).trim();
    if(!s){ return ""; }
    return s.replace(urlRe, (u)=>`<a href="${u}" target="_blank" rel="noopener">${u}</a>`);
  };

  const add = (k, v) => {
    const val = safeText(v).trim();
    if(!val){ return; }
    kv.push(`<div class="k">${k}</div><div class="v">${linkify(val)}</div>`);
  };

  add("要素", r["要素"]);
  add("价格", r["游戏价格"]);
  add("时长", r["游戏时长"]);
  add("原版语言", r["原版语言"]);
  add("汉化成员", r["汉化成员"]);
  add("是否授权", r["是否有授权/许可"]);
  add("备注", r["备注"]);
  add("原版游戏地址", r["原版游戏地址"]);
  add("汉化发布地址", r["汉化发布地址"]);
  add("汉化发布微博", r["汉化发布微博"]);

  const shown = new Set(["要素","游戏价格","游戏时长","原版语言","汉化成员","是否有授权/许可","备注","原版游戏地址","汉化发布地址","汉化发布微博"]);
  for(const key of Object.keys(r)){
    if(key.startsWith("__")){ continue; }
    if(shown.has(key)){ continue; }
    if(key === "游戏原名" || key === "汉化名" || key === "作者" || key === "游戏类型" || key === "年龄分级" || key === "汉化程度" || key === "汉化发布时间"){ continue; }
    const val = safeText(r[key]).trim();
    if(!val){ continue; }
    kv.push(`<div class="k">${key}</div><div class="v">${linkify(val)}</div>`);
  }

  if(kv.length === 0){ return ""; }

  return `
  <details class="details">
    <summary>展开详情</summary>
    <div class="kv">${kv.join("")}</div>
  </details>`;
}

function matches(r, q){
  if(!q){ return true; }
  const blob = Object.keys(r).map(k=>safeText(r[k])).join(" ").toLowerCase();
  return blob.includes(q.toLowerCase());
}

/* ---------- 派生维度：平台 / 题材 / 时长档 / 价格档 ---------- */
const TOPIC_RULES = [
  ["mystery", "悬疑推理", /悬疑|推理|探案|侦探|诡计|凶案|谋杀|破案|刑侦|逆转/],
  ["horror", "恐怖惊悚", /恐怖|微恐|惊悚|灵异|诅咒|怪谈|鬼/],
  ["gore", "猎奇血腥", /猎奇|血腥|分尸|藏尸|肢解|重口/],
  ["yandere", "病娇偏执", /病娇|偏执|强制|监禁|占有欲|病态|黑化/],
  ["otome", "乙女恋爱", /乙女|女性向|恋爱|攻略对象|多结局|男主/],
  ["puzzle", "解谜逃脱", /解谜|解密|谜题|逃脱|密室/],
  ["comedy", "搞笑沙雕", /搞笑|沙雕|轻喜剧|吐槽|喜剧/],
  ["healing", "治愈温情", /治愈|温馨|温情|暖心/],
  ["meta", "meta元叙事", /meta|电波|第四面墙|轮回|loop/i],
  ["fantasy", "奇幻异世界", /异世界|魔法|人外|恶魔|神明|妖怪|奇幻|吸血鬼|童话/],
  ["campus", "校园青春", /校园|学园|学生|社团|同级生|青春|学級/],
  ["action", "动作战斗", /动作|战斗|格斗|无双/],
  ["roguelike", "卡牌肉鸽", /肉鸽|roguelike|卡牌|构筑/i],
  ["scifi", "科幻末世", /科幻|末世|赛博|废土|反乌托邦|太空/],
];

const PLAT_NAMES = {
  steam: "Steam", itch: "itch.io", booth: "BOOTH", dlsite: "DLsite",
  novelgame: "novelgame", freem: "freem!", other: "其他"
};

function topicsOf(r){
  const blob = [r["游戏类型"], r["要素"], r["备注"], r["汉化名"], r["游戏原名"]]
    .map(safeText).join(" ");
  const out = [];
  for(const [k, , re] of TOPIC_RULES){
    if(re.test(blob)){ out.push(k); }
  }
  return Array.from(new Set(out));
}

function platOf(r){
  const u = safeText(r["原版游戏地址"]);
  if(/steampowered|steam/i.test(u)){ return "steam"; }
  if(/itch\.io/i.test(u)){ return "itch"; }
  if(/booth/i.test(u)){ return "booth"; }
  if(/dlsite/i.test(u)){ return "dlsite"; }
  if(/novelgame/i.test(u)){ return "novelgame"; }
  if(/freem/i.test(u)){ return "freem"; }
  return "other";
}

// 「约4-6h」「30min」「约0.5–1h」→ xs / s / m / l
function durOf(r){
  let t = safeText(r["游戏时长"]).toLowerCase()
    .replace(/–|~|—/g, "-");
  if(!t){ return ""; }
  const nums = (t.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter(n=>n < 500);
  if(!nums.length){ return ""; }
  let h;
  if(/min/.test(t) && !/h/.test(t)){ h = Math.max(...nums) / 60; }
  else if(/h|小时/.test(t)){ h = Math.max(...nums); }
  else { return ""; }
  if(h <= 0.5){ return "xs"; }
  if(h <= 2){ return "s"; }
  if(h <= 8){ return "m"; }
  return "l";
}

// 「免费」「付费（约¥70）」「付费（$4.99）」「付费（500日元）」→ free / freedlc / paid_low / paid_high
function priceOf(r){
  const t = safeText(r["游戏价格"]).trim();
  if(!t){ return ""; }
  if(/免费/.test(t)){
    return /DLC.{0,6}付费|DLC付费/.test(t) ? "freedlc" : "free";
  }
  const m = t.match(/(\d+(?:\.\d+)?)/);
  if(!m){ return "paid_low"; }
  let v = Number(m[1]);
  if(/\$/.test(t)){ v *= 7.2; }
  else if(/日元|円/.test(t)){ v *= 0.048; }
  return v <= 50 ? "paid_low" : "paid_high";
}

function filtered(){
  const q = safeText(el.q.value).trim();
  const t = safeText(el.type.value).trim();
  const d = safeText(el.degree.value).trim();
  const a = safeText(el.age.value).trim();
  const l = safeText(el.lang.value).trim();
  const du = safeText(el.duration.value).trim();
  const pl = safeText(el.plat.value).trim();
  const tp = safeText(el.topic.value).trim();
  const li = safeText(el.license.value).trim();
  const me = safeText(el.member.value).trim();
  const pr = safeText(el.price.value).trim();

  let arr = state.data.filter(r=>{
    if(!matches(r, q)){ return false; }
    if(t && safeText(r["游戏类型"]).trim() !== t){ return false; }
    if(d && safeText(r["汉化程度"]).trim() !== d){ return false; }
    if(a && safeText(r["年龄分级"]).trim() !== a){ return false; }
    if(l && safeText(r["原版语言"]).trim() !== l){ return false; }
    if(du && durOf(r) !== du){ return false; }
    if(pl && platOf(r) !== pl){ return false; }
    if(tp && !topicsOf(r).includes(tp)){ return false; }
    if(li && safeText(r["是否有授权/许可"]).trim() !== li){ return false; }
    if(me && safeText(r["汉化成员"]).trim() !== me){ return false; }
    if(pr && priceOf(r) !== pr){ return false; }
    return true;
  });

  const s = safeText(el.sort.value);
  if(s === "date_desc"){
    arr.sort((x,y)=>parseDate(y["汉化发布时间"]) - parseDate(x["汉化发布时间"]));
  }else if(s === "date_asc"){
    arr.sort((x,y)=>parseDate(x["汉化发布时间"]) - parseDate(y["汉化发布时间"]));
  }else if(s === "name_asc"){
    arr.sort((x,y)=>safeText(x["汉化名"]).localeCompare(safeText(y["汉化名"]), "zh-Hant"));
  }else if(s === "author_asc"){
    arr.sort((x,y)=>safeText(x["作者"]).localeCompare(safeText(y["作者"]), "zh-Hant"));
  }

  return arr;
}

function shortPlatform(name){
  return safeText(name)
    .replace("网盘", "").replace("云盘", "")
    .replace("腾讯微云", "微云")
    .replace("Google Drive", "GD");
}

const ND_STATE_TEXT = {
  ok: ["ndState--ok", "全部有效"],
  failover: ["ndState--move", "已自动切换"],
  recovered: ["ndState--new", "已补档"],
  pending: ["ndState--bad", "需要补档"],
  none: ["ndState--none", "未收录"],
};

function ndLinkLabel(a){
  const pwd = a.pwd ? `<span class="ndGoPwd">提取码 ${escapeHtml(a.pwd)}</span>` : "";
  return `<span class="ndGoIcon" aria-hidden="true">↓</span>` +
    `<span class="ndGoPlat">${escapeHtml(shortPlatform(a.platform_name || a.platform || "网盘"))}</span>${pwd}`;
}

function netdiskCell(r){
  const name = safeText(r["汉化名"]).trim();
  const au = (state.autofill && state.autofill.games) ? state.autofill.games[name] : null;
  const st = (state.netdisk && state.netdisk.games) ? state.netdisk.games[name] : null;

  if(!au && !st){
    return `<div class="ndBox"><span class="ndChip ndChip--none" title="该作品暂未收录到网盘链接">未收录</span></div>`;
  }

  // 有补档数据：优先给「现在能打开」的那一条
  if(au){
    const active = au.active;
    const dead = au.dead || [];
    const [cls, text] = ND_STATE_TEXT[au.state] || ND_STATE_TEXT.ok;
    const deadChips = dead.slice(0, 3).map(d => {
      const tip = `${d.platform_name || d.platform}：${d.detail || "已失效"}`;
      return `<span class="ndChip ndChip--dead" title="${escapeHtml(tip)}">` +
        `${escapeHtml(shortPlatform(d.platform_name || d.platform))} ✕</span>`;
    }).join("");
    const moreDead = dead.length > 3 ? `<span class="ndChip ndChip--dead">+${dead.length - 3}</span>` : "";
    const go = active
      ? `<a class="ndGo" href="${escapeHtml(active.url)}" target="_blank" rel="noopener"
             title="打开${escapeHtml(active.platform_name || "网盘")}（${escapeHtml(active.detail || "可用")}）">${ndLinkLabel(active)}</a>`
      : "";
    const checked = safeText((state.netdisk.meta || {}).checked_at).trim();
    return `<div class="ndBox">${go}${deadChips}${moreDead}</div>` +
      `<div class="ndMeta">` +
        `<span class="ndState ${cls}" data-nd="${escapeHtml(au.state)}">${text}</span>` +
        `<button class="ndFix" data-ndname="${escapeHtml(name)}" type="button">` +
          `${au.state === "pending" ? "求补档" : "补档详情"}</button>` +
        (checked ? `<span class="ndTime">检查于 ${escapeHtml(checked.replace(/^\d{4}-/, ""))}</span>` : "") +
      `</div>`;
  }

  // 没有补档数据时退回旧渲染
  const chips = (st.platforms || []).map(p=>{
    const bad = (p.dead || 0) > 0;
    const good = (p.ok || 0) > 0;
    let cls2 = "ndChip ndChip--unk";
    if(bad && good){ cls2 = "ndChip ndChip--mix"; }
    else if(bad){ cls2 = "ndChip ndChip--dead"; }
    else if(good){ cls2 = "ndChip ndChip--ok"; }
    const tip = `${p.name}：有效 ${p.ok || 0} 条／失效 ${p.dead || 0} 条` +
      ((p.unknown || 0) ? `／待确认 ${p.unknown} 条` : "");
    return `<span class="${cls2}" title="${escapeHtml(tip)}">${escapeHtml(shortPlatform(p.name))} ` +
      `✓${p.ok || 0}${bad ? ` ✕${p.dead}` : ""}</span>`;
  }).join("");
  const checked = safeText(st.checked_at).trim();
  const shortTime = checked ? checked.replace(/^\d{4}-/, "") : "—";
  const dead = st.dead || 0;
  const warn = dead
    ? `<span class="ndWarn" title="有 ${dead} 条网盘链接已失效">${dead} 条失效</span>`
    : `<span class="ndGood">全部有效</span>`;
  return `<div class="ndBox">${chips}</div>` +
    `<div class="ndMeta">${warn}<span class="ndTime" title="网盘链接检查时间">检查于 ${escapeHtml(shortTime)}</span></div>`;
}

/* ---------- 补档详情弹层 ---------- */
function ndDialogHtml(name, au){
  const [cls, text] = ND_STATE_TEXT[au.state] || ND_STATE_TEXT.ok;
  const parts = [];
  parts.push(`<h3 class="ndT">《${escapeHtml(name)}》网盘状态</h3>`);
  parts.push(`<p class="ndSub"><span class="ndState ${cls}">${text}</span>` +
    `<span class="ndTime">数据更新于 ${escapeHtml(safeText((state.autofill.meta || {}).generated_at) || "—")}</span></p>`);

  if(au.active){
    const a = au.active;
    const from = au.recovered_from
      ? `来自${a.source === "weibo" ? "微博" : a.source === "comment" ? "评论区" : "原文"}` +
        (au.recovered_from.author ? `（${au.recovered_from.is_up ? "UP 主 " : ""}${au.recovered_from.author}）` : "")
      : `来源：${a.source === "desc" ? "视频简介" : a.source === "pinned" ? "置顶评论" : a.source === "up_comment" ? "UP 主评论" : a.source === "weibo" ? "微博" : a.source === "site" ? "站点登记" : "原记录"}`;
    parts.push(`<div class="ndRow"><span class="ndRowK">现在可用</span>
      <a class="ndGo ndGo--big" href="${escapeHtml(a.url)}" target="_blank" rel="noopener">${ndLinkLabel(a)}</a>
      <span class="ndRowNote">${escapeHtml(from)}${a.detail ? " · " + escapeHtml(a.detail) : ""}</span></div>`);
  }

  const alt = au.alt || [];
  if(alt.length){
    parts.push(`<div class="ndRow"><span class="ndRowK">其他可用</span><div class="ndAlt">` +
      alt.slice(0, 6).map(L =>
        `<a class="ndAltLink" href="${escapeHtml(L.url)}" target="_blank" rel="noopener">` +
        `${escapeHtml(shortPlatform(L.platform_name || L.platform))}${L.pwd ? " · " + escapeHtml(L.pwd) : ""}</a>`
      ).join("") + `</div></div>`);
  }

  const dead = au.dead || [];
  if(dead.length){
    parts.push(`<div class="ndRow"><span class="ndRowK">已失效</span><div class="ndDeadList">` +
      dead.map(d => `<div class="ndDead"><span class="ndDeadPlat">${escapeHtml(d.platform_name || d.platform)}</span>
        <span class="ndDeadWhy">${escapeHtml(d.detail || "已失效")}</span></div>`).join("") + `</div></div>`);
  }

  const cands = au.candidates || [];
  if(cands.length){
    parts.push(`<div class="ndRow"><span class="ndRowK">自动挖到的候补</span><div class="ndCandList">` +
      cands.map(c => {
        const okCls = c.status === "ok" ? "isOk" : "isUnk";
        const who = c.is_up ? "UP 主" : (c.author ? "网友 " + c.author : "");
        return `<div class="ndCand ${okCls}">
          <a href="${escapeHtml(c.url)}" target="_blank" rel="noopener">${escapeHtml(shortPlatform(c.platform_name || c.platform))}${c.pwd ? " · " + escapeHtml(c.pwd) : ""}</a>
          <span class="ndCandWhy">${escapeHtml(c.detail || "待核验")}</span>
          <span class="ndCandSrc">${escapeHtml(c.source === "comment" ? "评论区" : c.source === "weibo" ? "微博" : "原文")}${who ? " · " + escapeHtml(who) : ""}</span>
        </div>`;
      }).join("") + `</div></div>`);
  }

  if(au.state === "pending" || au.state === "none"){
    const req = au.request || {};
    const msg = req.message || `《${name}》的网盘链接失效了，求补档 🙏`;
    parts.push(`<div class="ndRow"><span class="ndRowK">求补档</span><div>
      <textarea class="ndCopy" id="ndCopyText" readonly rows="2">${escapeHtml(msg)}</textarea>
      <div class="ndActions">
        <button class="ndBtn" id="ndCopyBtn" type="button">复制这段话</button>
        ${req.bili_url ? `<a class="ndBtn ndBtn--ghost" href="${escapeHtml(req.bili_url)}" target="_blank" rel="noopener">去视频评论区 ↗</a>` : ""}
        ${req.weibo_url ? `<a class="ndBtn ndBtn--ghost" href="${escapeHtml(req.weibo_url)}" target="_blank" rel="noopener">去微博 ↗</a>` : ""}
      </div>
      <p class="ndHint">贴到视频评论或微博下即可。下次巡检若发现新链接，会自动出现在这里并标为可用。</p>
    </div></div>`);
  }

  parts.push(`<p class="ndFoot">自动处理规则：同一作品有多条链接时，失效的自动跳过、切到还能打开的那条；
    全部失效时回到简介 / 评论区 / 微博里重新找，找到并通过核验的会标为「已补档」。</p>`);
  return parts.join("");
}

function openNdDialog(name){
  const dlg = document.getElementById("ndDialog");
  const body = document.getElementById("ndDialogBody");
  if(!dlg || !body) return;
  const au = state.autofill && state.autofill.games ? state.autofill.games[name] : null;
  if(!au) return;
  body.innerHTML = ndDialogHtml(name, au);
  if(!dlg.open) dlg.showModal();
  const btn = document.getElementById("ndCopyBtn");
  if(btn){
    btn.addEventListener("click", async ()=>{
      const t = document.getElementById("ndCopyText");
      if(!t) return;
      try{
        await navigator.clipboard.writeText(t.value);
        btn.textContent = "已复制 ✓";
      }catch(error){
        t.select();
        document.execCommand && document.execCommand("copy");
        btn.textContent = "已复制 ✓";
      }
      setTimeout(()=>{ btn.textContent = "复制这段话"; }, 1800);
    });
  }
}

function rowHtml(r){
  const links = [
    linkOrDash(r["原版游戏地址"], "原版"),
    linkOrDash(r["汉化发布地址"], "发布"),
  ].join(" · ");

  const date = safeText(r["汉化发布时间"]).trim() || "—";
  const meta = `<div class="badges">${buildBadges(r)}</div>`;
  const img = safeText(r.__image).trim();

  let shot = `<div class="shotEmpty" title="无截图"></div>`;
  if(img){
    shot = `
      <button class="shotBtn" data-img="${img}" title="点击放大">
        <img class="shot" src="${img}" alt="截图" loading="lazy">
      </button>`;
  }

  return `
    <tr data-id="${r.__id}">
      <td>${shot}</td>
      <td>
        <div class="name">${safeText(r["汉化名"]) || "—"}</div>
        <div class="mini">${safeText(r["要素"])}</div>
        <div class="likeRow">
          <button class="likeBtn${isLiked(r.__id) ? " isLiked" : ""}" type="button" data-like-id="${r.__id}" aria-pressed="${String(isLiked(r.__id))}" aria-label="给 ${safeText(r["汉化名"]) || "这部作品"} 点赞">
            ${isLiked(r.__id) ? "👍 已赞" : "👍 点赞"}
          </button>
          <span class="likeCount" data-like-count="${r.__id}">${getLikeCount(r.__id)}</span>
        </div>
        ${buildDetails(r)}
      </td>
      <td>${safeText(r["游戏原名"]) || "—"}</td>
      <td>${safeText(r["作者"]) || "—"}</td>
      <td>${meta}</td>
      <td class="col-date">${date}</td>
      <td class="col-links">${links}</td>
      <td class="col-netdisk">${netdiskCell(r)}</td>
    </tr>
  `;
}

function render(){
  const arr = filtered();
  el.tbody.innerHTML = arr.map(rowHtml).join("");

  setStatus(`共 ${state.data.length} 条 · 当前显示 ${arr.length} 条`);
}

function fillFilters(){
  const data = state.data;
  const types = uniq(data.map(x=>x["游戏类型"]));
  const degrees = uniq(data.map(x=>x["汉化程度"]));
  const ages = uniq(data.map(x=>x["年龄分级"]));
  const langs = uniq(data.map(x=>x["原版语言"]));

  const licenses = uniq(data.map(x=>x["是否有授权/许可"]));
  const members = uniq(data.map(x=>x["汉化成员"]));


  for(const v of types){
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    el.type.appendChild(opt);
  }
  for(const v of degrees){
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    el.degree.appendChild(opt);
  }
  for(const v of ages){
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    el.age.appendChild(opt);
  }
  for(const v of langs){
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    el.lang.appendChild(opt);
  }

  for(const v of licenses){
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    el.license.appendChild(opt);
  }
  for(const v of members){
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    el.member.appendChild(opt);
  }

}

function wireControls(){
  const rerender = ()=>render();
  el.q.addEventListener("input", rerender);
  el.type.addEventListener("change", rerender);
  el.degree.addEventListener("change", rerender);
  el.age.addEventListener("change", rerender);
  el.lang.addEventListener("change", rerender);
  el.duration.addEventListener("change", rerender);
  el.license.addEventListener("change", rerender);
  el.member.addEventListener("change", rerender);
  el.price.addEventListener("change", rerender);
  if(el.plat){ el.plat.addEventListener("change", rerender); }
  if(el.topic){ el.topic.addEventListener("change", rerender); }
  el.sort.addEventListener("change", rerender);

  el.tbody.addEventListener("click", async (e)=>{
    const ndBtn = e.target.closest("button[data-ndname]");
    if(ndBtn){
      openNdDialog(ndBtn.getAttribute("data-ndname"));
      return;
    }

    const shotBtn = e.target.closest("button[data-img]");
    if(shotBtn){
      const img = shotBtn.getAttribute("data-img");
      if(!img){ return; }
      el.viewerImg.src = img;
      el.viewer.showModal();
      return;
    }

    const likeBtn = e.target.closest("button[data-like-id]");
    if(likeBtn){
      const id = likeBtn.getAttribute("data-like-id");
      if(!id || likeBtn.disabled){ return; }

      const wasLiked = isLiked(id);
      likeBtn.disabled = true;
      likeBtn.removeAttribute("title");

      try{
        await updateWalineLike(id, wasLiked ? 'desc' : 'inc');
        setLiked(id, !wasLiked);

        const likedNow = isLiked(id);
        likeBtn.classList.toggle("isLiked", likedNow);
        likeBtn.setAttribute("aria-pressed", String(likedNow));
        likeBtn.textContent = likedNow ? "👍 已赞" : "👍 点赞";

        const countEl = el.tbody.querySelector(`[data-like-count="${CSS.escape(id)}"]`);
        if(countEl){ countEl.textContent = String(getLikeCount(id)); }
      }catch(error){
        console.error("Waline like sync failed:", error);
        likeBtn.title = "点赞同步失败，请稍后重试";
      }finally{
        likeBtn.disabled = false;
      }
    }
  });

  if(el.messageForm){
    el.messageForm.addEventListener("submit", async (e)=>{
      e.preventDefault();
      const result = await postMessage(el.messageName.value, el.messageText.value);
      el.messageStatus.textContent = result.message;
      el.messageStatus.classList.toggle("warn", !state.storageOK || !state.onlineOK);
      if(result.ok){
        el.messageText.value = "";
        el.messageText.focus();
      }
    });
  }

  el.viewerClose.addEventListener("click", ()=>el.viewer.close());
  el.viewer.addEventListener("click", (e)=>{
    const rect = el.viewer.getBoundingClientRect();
    const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    if(!inside){ el.viewer.close(); }
  });
}


function initNdDialog(){
  const dialog = document.getElementById("ndDialog");
  const closeBtn = document.getElementById("ndDialogClose");
  if(!dialog) return;
  closeBtn && closeBtn.addEventListener("click", ()=>dialog.close());
  dialog.addEventListener("click", (e)=>{
    if(e.target === dialog) dialog.close();
  });
}

function initToolboxDialog(){
  const dialog = document.getElementById("toolboxDialog");
  const openBtn = document.getElementById("toolboxOpen");
  const closeBtn = document.getElementById("toolboxClose");
  if(!dialog || !openBtn) return;
  const open = ()=>{ if(!dialog.open) dialog.showModal(); };
  openBtn.addEventListener("click", open);
  // 工具页的“返回个人工具箱”链接带 #toolboxTitle，直接弹出工具箱
  if(location.hash === "#toolboxTitle") open();
  window.addEventListener("hashchange", ()=>{ if(location.hash === "#toolboxTitle") open(); });
  closeBtn && closeBtn.addEventListener("click", ()=>dialog.close());
  dialog.addEventListener("click", (e)=>{
    const rect = dialog.getBoundingClientRect();
    const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    if(!inside) dialog.close();
  });
}

function initCoinLab(){
  const stage = document.getElementById("coinStage");
  const frontInput = document.getElementById("coinUploadFront");
  const backInput = document.getElementById("coinUploadBack");
  const startBtn = document.getElementById("coinStartBtn");
  const stopBtn = document.getElementById("coinStopBtn");
  const result = document.getElementById("coinResult");

  if(!stage || !frontInput || !backInput || !startBtn || !stopBtn || !result){ return; }

  let spinning = false;
  let angle = 0;
  let timer = null;

  const frontFace = stage.querySelector('.front');
  const backFace = stage.querySelector('.back');

  const setResult = (text)=>{ result.textContent = `当前结果：${text}`; };

  startBtn.addEventListener('click', ()=>{
    if(spinning){ return; }
    spinning = true;
    setResult('旋转中…');
    timer = window.setInterval(()=>{
      angle += 18;
      stage.style.transform = `rotateY(${angle}deg)`;
    }, 16);
  });

  stopBtn.addEventListener('click', ()=>{
    if(!spinning){
      setResult('请先开始旋转');
      return;
    }
    spinning = false;
    if(timer){ window.clearInterval(timer); timer = null; }

    const normalized = ((angle % 360) + 360) % 360;
    const isFront = normalized < 90 || normalized > 270;
    const finalAngle = isFront ? 0 : 180;
    angle = angle + (finalAngle - normalized);
    stage.style.transform = `rotateY(${angle}deg)`;
    setResult(isFront ? '🐶 正面（狗）' : '🐱 反面（猫）');
  });

  const bindUploader = (input, face)=>{
    input.addEventListener('change', (event)=>{
      const file = event.target.files && event.target.files[0];
      if(!file){ return; }
      const reader = new FileReader();
      reader.onload = (e)=>{
        face.style.backgroundImage = `url('${e.target?.result || ''}')`;
      };
      reader.readAsDataURL(file);
    });
  };

  bindUploader(frontInput, frontFace);
  bindUploader(backInput, backFace);
}
async function loadData(){
  const res = await fetch("./data.json", { cache: "no-cache" });
  state.data = await res.json();
}

async function loadNetdiskStatus(){
  try{
    const res = await fetch("./data/netdisk-status.json", { cache: "no-cache" });
    if(!res.ok){ return; }
    const json = await res.json();
    if(json && typeof json === "object" && json.games){ state.netdisk = json; }
  }catch(error){
    console.warn("netdisk status load failed:", error);
  }
}

async function loadNetdiskAutofill(){
  try{
    const res = await fetch("./data/netdisk-autofill.json", { cache: "no-cache" });
    if(!res.ok){ return; }
    const json = await res.json();
    if(json && json.games){ state.autofill = json; }
  }catch(error){
    console.warn("netdisk autofill load failed:", error);
  }
}

async function main(){
  state.storageOK = canUseLocalStorage();
  state.likes = {};
  state.liked = loadLikedIds();
  state.messages = loadMessages();
  await tryLoadRemoteState();
  wireControls();
  initCoinLab();
  initToolboxDialog();
  initNdDialog();
  await loadData();
  await loadNetdiskStatus();
  await loadNetdiskAutofill();
  fillFilters();
  render();

  try{
    await fetchWalineLikeCounts(state.data.map((item)=>item.__id));
    render();
  }catch(error){
    console.error("Waline like count load failed:", error);
  }

  renderMessages();
  if(el.messageStatus && !state.onlineOK){
    el.messageStatus.textContent = "当前处于离线留言模式：会先显示并尝试保存在本地。";
    el.messageStatus.classList.add("warn");
  } else if(el.messageStatus && !state.storageOK){
    el.messageStatus.textContent = "当前浏览器限制本地存储，但在线模式可正常同步。";
    el.messageStatus.classList.add("warn");
  }
}

main();

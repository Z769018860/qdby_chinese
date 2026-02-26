// app.js (ESM)
// Data source: ./data.json

const LIKE_STORAGE_KEY = "qdby.likes.v1";
const MESSAGE_STORAGE_KEY = "qdby.messages.v1";
const API_BASE = "/api";
const state = { data: [], likes: {}, messages: [], storageOK: true, onlineOK: false };

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
      state.likes = remote.likes && typeof remote.likes === 'object' ? remote.likes : state.likes;
      state.messages = Array.isArray(remote.messages) ? remote.messages : state.messages;
      state.onlineOK = true;
      return true;
    }
  }catch(_err){
    state.onlineOK = false;
  }
  return false;
}

async function postLikeRemote(id){
  const payload = await apiJson('/like', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
  if(payload && payload.likes && typeof payload.likes === 'object'){
    state.likes = payload.likes;
  }
  state.onlineOK = true;
  return payload;
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

function loadLikes(){
  try{
    const raw = getLocalItem(LIKE_STORAGE_KEY);
    if(!raw){ return {}; }
    const parsed = JSON.parse(raw);
    if(parsed && typeof parsed === "object"){ return parsed; }
  }catch(_err){
    // ignore malformed cache
  }
  return {};
}

function saveLikes(){
  setLocalItem(LIKE_STORAGE_KEY, JSON.stringify(state.likes));
}

function getLikeCount(id){
  const n = Number(state.likes[id] || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function addLike(id){
  if(!id){ return; }
  state.likes[id] = getLikeCount(id) + 1;
  saveLikes();
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

function filtered(){
  const q = safeText(el.q.value).trim();
  const t = safeText(el.type.value).trim();
  const d = safeText(el.degree.value).trim();
  const a = safeText(el.age.value).trim();
  const l = safeText(el.lang.value).trim();
  const du = safeText(el.duration.value).trim();
  const li = safeText(el.license.value).trim();
  const me = safeText(el.member.value).trim();
  const pr = safeText(el.price.value).trim();

  let arr = state.data.filter(r=>{
    if(!matches(r, q)){ return false; }
    if(t && safeText(r["游戏类型"]).trim() !== t){ return false; }
    if(d && safeText(r["汉化程度"]).trim() !== d){ return false; }
    if(a && safeText(r["年龄分级"]).trim() !== a){ return false; }
    if(l && safeText(r["原版语言"]).trim() !== l){ return false; }
    if(du && safeText(r["游戏时长"]).trim() !== du){ return false; }
    if(li && safeText(r["是否有授权/许可"]).trim() !== li){ return false; }
    if(me && safeText(r["汉化成员"]).trim() !== me){ return false; }
    if(pr && safeText(r["游戏价格"]).trim() !== pr){ return false; }
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
          <button class="likeBtn" type="button" data-like-id="${r.__id}" aria-label="给 ${safeText(r["汉化名"]) || "这部作品"} 点赞">
            👍 点赞
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
  const durations = uniq(data.map(x=>x["游戏时长"]));
  const licenses = uniq(data.map(x=>x["是否有授权/许可"]));
  const members = uniq(data.map(x=>x["汉化成员"]));
  const prices = uniq(data.map(x=>x["游戏价格"]));

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
  for(const v of durations){
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    el.duration.appendChild(opt);
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
  for(const v of prices){
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    el.price.appendChild(opt);
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
  el.sort.addEventListener("change", rerender);

  el.tbody.addEventListener("click", async (e)=>{
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
      try{
        await postLikeRemote(id);
      }catch(_err){
        state.onlineOK = false;
        addLike(id);
      }
      const countEl = el.tbody.querySelector(`[data-like-count="${id}"]`);
      if(countEl){ countEl.textContent = String(getLikeCount(id)); }
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

async function loadData(){
  const res = await fetch("./data.json", { cache: "no-store" });
  state.data = await res.json();
}

async function main(){
  state.storageOK = canUseLocalStorage();
  state.likes = loadLikes();
  state.messages = loadMessages();
  await tryLoadRemoteState();
  wireControls();
  await loadData();
  fillFilters();
  render();
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

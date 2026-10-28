/* 忘忘看报 · 校猫日志
 * 把《忘却前夜》制作人 Mythag Cat ～ Light 在官方 Discord 的发言汇编成可筛选的归档。
 * 数据由 discord_sync 只读同步后导出到 data/morimens/catlog/：
 *   index.json         轻量索引（标题 / 分类 / 日期 / 条数 / 摘要）
 *   sections/*.json    分区正文（原贴 + 发言），按需加载
 */
(() => {
  'use strict';

  const DATA = 'data/morimens/catlog/';
  const TAB_ID = 'morimensCatlogTab';
  const PANEL_ID = 'morimensCatlogPanel';
  const HASH = '#catlog';
  const PAGE = 18;

  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isEnglish = () => localStorage.getItem('morimens.language') === 'en';
  const ui = (zh, en) => (isEnglish() ? en : zh);

  const state = {
    idx: null,
    byId: Object.create(null),
    sections: Object.create(null),   // key -> true
    pending: Object.create(null),    // key -> Promise
    tab: 'all',
    cat: '',
    year: '',
    acc: '',
    sort: 'new',
    q: '',
    limit: PAGE,
    open: new Set(),
    mounted: false,
    started: false,
    error: null,
    loadingSections: false,
  };

  /* ---------------------------------------------------------------- 文本渲染 */

  const TOKEN = /\u0001(\d+)\u0002/g;

  function fmtDiscordTs(sec, fmt) {
    const d = new Date(sec * 1000);
    if (Number.isNaN(d.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (fmt === 'd') return day;
    if (fmt === 't') return hm;
    if (fmt === 'R') {
      const diff = (Date.now() - d.getTime()) / 1000;
      const abs = Math.abs(diff);
      const unit = abs < 60 ? [Math.round(abs), '秒'] : abs < 3600 ? [Math.round(abs / 60), '分钟'] :
        abs < 86400 ? [Math.round(abs / 3600), '小时'] : abs < 2592000 ? [Math.round(abs / 86400), '天'] :
          [Math.round(abs / 2592000), '个月'];
      return `${unit[0]} ${unit[1]}${diff >= 0 ? '前' : '后'}`;
    }
    return `${day} ${hm}`;
  }

  function md(raw) {
    if (!raw) return '';
    const keep = [];
    const hold = html => { keep.push(html); return '\u0001' + (keep.length - 1) + '\u0002'; };
    let s = String(raw);

    s = s.replace(/```([\s\S]*?)```/g, (m, body) => hold('<pre><code>' + esc(body.replace(/^\n+|\n+$/g, '')) + '</code></pre>'));
    s = s.replace(/<(a?):([A-Za-z0-9_~]{2,32}):(\d{5,25})>/g, (m, anim, name) =>
      hold('<span class="catlogEmoji" title=":' + esc(name) + ':">:' + esc(name) + ':</span>'));
    s = s.replace(/<t:(\d{9,13})(?::([tTdDfFR]))?>/g, (m, sec, fmt) =>
      hold('<span class="catlogStamp">' + esc(fmtDiscordTs(Number(sec), fmt || 'f')) + '</span>'));
    s = s.replace(/<@!?(\d{15,25})>/g, () => hold('<span class="catlogTag">@用户</span>'));
    s = s.replace(/<@&(\d{15,25})>/g, () => hold('<span class="catlogTag">@身份组</span>'));
    s = s.replace(/<#(\d{15,25})>/g, () => hold('<span class="catlogTag">#频道</span>'));

    s = esc(s);

    s = s.replace(/\[([^\]\n]{1,160})\]\((https?:\/\/[^\s)]+)\)/g,
      (m, label, url) => '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + label + '</a>');
    s = s.replace(/(^|[\s（(])(https?:\/\/[^\s<>"'）)]+)/g,
      (m, pre, url) => pre + '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + '</a>');

    s = s.replace(/`([^`\n]{1,200})`/g, (m, code) => '<code>' + code + '</code>');
    s = s.replace(/\*\*\*([^*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>');
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^\w*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/__([^_\n]+)__/g, '<u>$1</u>');
    s = s.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
    s = s.replace(/\|\|([^|\n]{1,400})\|\|/g,
      '<span class="catlogSpoiler" role="button" tabindex="0">$1</span>');

    s = s.split('\n').map(line => {
      if (/^#{1,4}\s+\S/.test(line)) return '<h4>' + line.replace(/^#{1,4}\s+/, '') + '</h4>';
      if (/^&gt;\s?/.test(line)) return '<blockquote>' + line.replace(/^&gt;\s?/, '') + '</blockquote>';
      return line;
    }).join('\n');

    return s.replace(TOKEN, (m, i) => keep[Number(i)] ?? '');
  }

  function plain(s) {
    return String(s || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/<a?:[A-Za-z0-9_~]+:\d+>/g, ' ')
      .replace(/<[^>]{1,40}>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const kb = n => (n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

  /* ---------------------------------------------------------------- 数据加载 */

  async function fetchJson(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(url + ' → HTTP ' + res.status);
    return res.json();
  }

  function indexInto(post, key) {
    const copy = Object.assign({}, post, { _sec: key });
    const bag = [post.title, post.category, post.opAuthor || '', post.op ? post.op.content : ''];
    for (const m of post.messages || []) bag.push(m.content, m.prev || '');
    copy._hay = plain(bag.join(' ')).toLowerCase();
    state.byId[post.id] = copy;
  }

  function ensureSection(key) {
    if (state.sections[key]) return Promise.resolve();
    if (state.pending[key]) return state.pending[key];
    const meta = (state.idx?.sections || []).find(s => s.key === key);
    if (!meta) return Promise.resolve();
    state.pending[key] = fetchJson(DATA + meta.file).then(payload => {
      for (const post of payload.posts || []) indexInto(post, key);
      state.sections[key] = true;
      delete state.pending[key];
    }).catch(err => {
      delete state.pending[key];
      console.warn('[catlog] 分区载入失败', key, err);
    });
    return state.pending[key];
  }

  async function loadRest() {
    if (state.loadingSections) return;
    state.loadingSections = true;
    const keys = (state.idx?.sections || []).map(s => s.key);
    for (const key of keys) {
      if (state.sections[key]) continue;
      await ensureSection(key);
      updateMeta();
      if (state.q) renderList(true);
    }
    state.loadingSections = false;
    updateMeta();
  }

  /* ---------------------------------------------------------------- 面板骨架 */

  function tabLabel() { return ui('校猫日志', "Schoolcat's Notes"); }

  function shellHtml() {
    return `<section class="panel catlogShell">
      <div class="panelHead">
        <div>
          <p class="eyebrow">SCHOOLCAT'S NOTES</p>
          <h2 id="morimensCatlogTitle">${ui('校猫日志', "Schoolcat's Notes")}</h2>
          <p class="panelLead" id="morimensCatlogLead">${ui(
            '《忘却前夜》制作人 Mythag Cat ～ Light 在官方 Discord 的公开发言汇编：版本公告、活动说明、玩家问答与留言回复，按帖子归档并保留原贴全文。',
            'An archive of public messages from Morimens producer Mythag Cat ～ Light on the official Discord: patch notes, event posts, player Q&amp;A, and replies, grouped by thread with the original post kept intact.')}</p>
        </div>
        <span class="statusPill" id="morimensCatlogPill">${ui('Discord 只读同步', 'Discord read-only sync')}</span>
      </div>
      <div class="catlogNotice" id="morimensCatlogNotice"></div>
      <div class="catlogBar">
        <div class="catlogSeg" id="morimensCatlogSeg" role="tablist" aria-label="${ui('分区筛选', 'Section filter')}"></div>
        <div class="catlogFields">
          <input id="morimensCatlogQ" type="search" autocomplete="off" aria-label="${ui('搜索', 'Search')}" placeholder="${ui('搜索标题、公告正文或发言内容…', 'Search titles, post text or replies…')}">
          <select id="morimensCatlogCat" aria-label="${ui('分类', 'Category')}"></select>
          <select id="morimensCatlogYear" aria-label="${ui('年份', 'Year')}"></select>
          <select id="morimensCatlogAcc" aria-label="${ui('账号', 'Account')}"></select>
          <select id="morimensCatlogSort" aria-label="${ui('排序', 'Sort')}"></select>
        </div>
      </div>
      <div class="catlogMeta" id="morimensCatlogMeta"></div>
      <div class="catlogList" id="morimensCatlogList" aria-live="polite"></div>
      <div class="catlogMoreWrap"><button class="catlogMoreBtn" id="morimensCatlogMore" type="button" hidden>${ui('加载更多', 'Load more')}</button></div>
      <div class="catlogFoot" id="morimensCatlogFoot"></div>
    </section>`;
  }

  function mount() {
    if (state.mounted) return true;
    const tabs = $('morimensTabs');
    const main = document.querySelector('main.wrap');
    if (!tabs || !main) return false;

    if (!$(TAB_ID)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'morimensTab';
      btn.id = TAB_ID;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', 'false');
      btn.setAttribute('aria-controls', PANEL_ID);
      btn.textContent = tabLabel();
      const love = $('morimensLoveTab');
      if (love && love.nextSibling) tabs.insertBefore(btn, love.nextSibling);
      else tabs.appendChild(btn);
      btn.addEventListener('click', () => { open(); });
    }

    if (!$(PANEL_ID)) {
      const panel = document.createElement('div');
      panel.id = PANEL_ID;
      panel.setAttribute('role', 'tabpanel');
      panel.hidden = true;
      panel.innerHTML = shellHtml();
      const anchor = $('morimensLovePanel') || $('morimensCommentsPanel') || null;
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(panel, anchor.nextSibling);
      else main.appendChild(panel);
    }

    bindUi();
    state.mounted = true;
    return true;
  }

  function bindUi() {
    const tabs = $('morimensTabs');
    if (tabs && !tabs.dataset.catlogBound) {
      tabs.dataset.catlogBound = '1';
      tabs.addEventListener('click', ev => {
        const hit = ev.target.closest?.('.morimensTab');
        if (!hit) return;
        if (hit.id !== TAB_ID) {
          const panel = $(PANEL_ID);
          if (panel) panel.hidden = true;
          const btn = $(TAB_ID);
          if (btn) btn.setAttribute('aria-selected', 'false');
        }
      }, true);
    }

    const seg = $('morimensCatlogSeg');
    if (seg && !seg.dataset.bound) {
      seg.dataset.bound = '1';
      seg.addEventListener('click', ev => {
        const btn = ev.target.closest('[data-sec]');
        if (!btn) return;
        state.tab = btn.dataset.sec;
        state.limit = PAGE;
        syncSeg();
        renderList(true);
      });
    }

    const q = $('morimensCatlogQ');
    if (q && !q.dataset.bound) {
      q.dataset.bound = '1';
      let timer = 0;
      q.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          state.q = q.value.trim();
          state.limit = PAGE;
          renderList(true);
        }, 220);
      });
    }

    const bind = (id, prop) => {
      const el = $(id);
      if (!el || el.dataset.bound) return;
      el.dataset.bound = '1';
      el.addEventListener('change', () => {
        state[prop] = el.value;
        state.limit = PAGE;
        if (prop === 'acc') loadRest();   // 账号筛选需要全部分区才能算准
        renderList(true);
      });
    };
    bind('morimensCatlogCat', 'cat');
    bind('morimensCatlogYear', 'year');
    bind('morimensCatlogAcc', 'acc');
    bind('morimensCatlogSort', 'sort');

    const list = $('morimensCatlogList');
    if (list && !list.dataset.bound) {
      list.dataset.bound = '1';
      list.addEventListener('click', ev => {
        const sp = ev.target.closest('.catlogSpoiler');
        if (sp) { sp.classList.toggle('isOpen'); return; }
        const head = ev.target.closest('.catlogHead');
        if (head && !ev.target.closest('a')) togglePost(head.closest('.catlogItem'));
      });
      list.addEventListener('keydown', ev => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        const sp = ev.target.closest('.catlogSpoiler');
        if (sp) { ev.preventDefault(); sp.classList.toggle('isOpen'); return; }
        const head = ev.target.closest('.catlogHead');
        if (head) { ev.preventDefault(); togglePost(head.closest('.catlogItem')); }
      });
    }

    const more = $('morimensCatlogMore');
    if (more && !more.dataset.bound) {
      more.dataset.bound = '1';
      more.addEventListener('click', () => { state.limit += PAGE; renderList(false); });
    }
  }

  /* ---------------------------------------------------------------- 打开的交互 */

  function open() {
    if (!mount()) return;
    show();
    if (!state.started) {
      state.started = true;
      init();
    }
  }

  function show() {
    const panel = $(PANEL_ID);
    if (!panel) return;
    document.querySelectorAll('#morimensTabs .morimensTab').forEach(b =>
      b.setAttribute('aria-selected', String(b.id === TAB_ID)));
    document.querySelectorAll('main.wrap > [role="tabpanel"]').forEach(p => {
      if (p.id !== PANEL_ID) p.hidden = true;
    });
    panel.hidden = false;
    if (location.hash !== HASH) history.replaceState(null, '', HASH);
    panel.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }

  async function init() {
    try {
      state.idx = await fetchJson(DATA + 'index.json');
    } catch (err) {
      state.error = err;
      $('morimensCatlogList').innerHTML = `<div class="catlogEmpty">${ui('数据载入失败：', 'Failed to load data: ')}${esc(err.message)}</div>`;
      return;
    }
    buildFilters();
    updateNotice();
    renderList(true);
    updateMeta();
    loadRest();
  }

  /* ---------------------------------------------------------------- 筛选控件 */

  function buildFilters() {
    const idx = state.idx;
    const seg = $('morimensCatlogSeg');
    if (seg) {
      const all = idx.totals;
      const items = [['all', ui('全部', 'All'), all.posts, all.messages]]
        .concat((idx.sections || []).map(s => [s.key, ui(s.label, s.labelEn), s.posts, s.messages]));
      seg.innerHTML = items.map(([key, label, posts]) =>
        `<button type="button" class="catlogSegBtn" data-sec="${key}" role="tab" aria-selected="${key === state.tab}">${esc(label)}<small>${posts}</small></button>`
      ).join('');
    }

    const catSel = $('morimensCatlogCat');
    if (catSel) {
      const counts = new Map();
      for (const p of idx.posts) counts.set(p.category, (counts.get(p.category) || 0) + 1);
      const opts = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      catSel.innerHTML = `<option value="">${ui('全部分类', 'All categories')}</option>` +
        opts.map(([name, n]) => `<option value="${esc(name)}">${esc(name)} (${n})</option>`).join('');
      catSel.value = state.cat;
    }

    const yearSel = $('morimensCatlogYear');
    if (yearSel) {
      const years = [...new Set(idx.posts.map(p => p.year).filter(Boolean))].sort((a, b) => b - a);
      yearSel.innerHTML = `<option value="">${ui('全部年份', 'All years')}</option>` +
        years.map(y => `<option value="${y}">${y}</option>`).join('');
      yearSel.value = state.year;
    }

    const accSel = $('morimensCatlogAcc');
    if (accSel) {
      accSel.innerHTML = `<option value="">${ui('两个账号', 'Both accounts')}</option>` +
        `<option value="new">${ui('现账号 · @lightproud', 'Current · @lightproud')}</option>` +
        `<option value="old">${ui('旧账号 · @game.producer.light', 'Old · @game.producer.light')}</option>`;
      accSel.value = state.acc;
    }

    const sortSel = $('morimensCatlogSort');
    if (sortSel) {
      sortSel.innerHTML = `<option value="new">${ui('最新优先', 'Newest first')}</option>` +
        `<option value="old">${ui('最早优先', 'Oldest first')}</option>` +
        `<option value="hot">${ui('发言最多', 'Most replies')}</option>`;
      sortSel.value = state.sort;
    }
    syncSeg();
  }

  function syncSeg() {
    document.querySelectorAll('#morimensCatlogSeg [data-sec]').forEach(btn =>
      btn.setAttribute('aria-selected', String(btn.dataset.sec === state.tab)));
  }

  function updateNotice() {
    const idx = state.idx;
    const el = $('morimensCatlogNotice');
    if (!el || !idx) return;
    const t = idx.totals;
    const range = idx.posts.length ? `${idx.posts[idx.posts.length - 1].date} → ${idx.posts[0].date}` : '';
    el.innerHTML = ui(
      `共收录 <strong>${t.posts}</strong> 个帖子、<strong>${t.messages.toLocaleString()}</strong> 条发言，覆盖 ${range}（${idx.timezone}）。` +
      `已剔除综合讨论等聊天频道的日常闲聊，只保留论坛帖子内的公告与问答。<strong>数据截至 ${idx.generated}</strong>。`,
      `<strong>${t.posts}</strong> threads and <strong>${t.messages.toLocaleString()}</strong> messages, spanning ${range} (${idx.timezone}). ` +
      `Casual chat from general channels is excluded; only forum threads are kept. <strong>Data updated ${idx.generated}</strong>.`
    );

    const foot = $('morimensCatlogFoot');
    if (foot) {
      foot.innerHTML = ui(
        `来源：Discord 官方服务器「Morimens」· 校猫（Mythag Cat ～ Light）公开发言，两个账号合并：旧号 @game.producer.light（2023-10-29 → 2026-03-28，账号已丢失）与现号 @lightproud（2026-03-29 起）。时间统一为 UTC+8。本页只做只读归档，不含任何玩家私信内容。`,
        `Source: public messages from Mythag Cat ～ Light (Morimens producer) on the official Discord, merging the old account @game.producer.light (2023-10-29 → 2026-03-28, since lost) and the current @lightproud (from 2026-03-29). All times are UTC+8. Read-only archive; no private messages are included.`
      );
    }
  }

  function updateMeta() {
    const el = $('morimensCatlogMeta');
    if (!el || !state.idx) return;
    const rows = filtered();
    const posts = rows.length;
    const msgs = rows.reduce((sum, p) => sum + p.count, 0);
    const loaded = Object.keys(state.sections).length;
    const total = (state.idx.sections || []).length;
    const dot = state.loadingSections || loaded < total ? 'warn' : 'ok';
    el.innerHTML = `<span>${ui('筛出', 'Matched')} <b>${posts}</b> ${ui('帖', 'threads')} · <b>${msgs.toLocaleString()}</b> ${ui('条发言', 'messages')}</span>` +
      `<span class="catlogLoadState"><i class="catlogDot ${dot}"></i>${state.q
        ? (loaded < total ? ui(`正文检索：已载入 ${loaded}/${total} 个分区…`, `Full-text: ${loaded}/${total} sections loaded…`) : ui('正文检索已就绪', 'Full-text ready'))
        : ui(`已载入 ${loaded}/${total} 个分区`, `${loaded}/${total} sections loaded`)}</span>`;
  }

  /* ---------------------------------------------------------------- 列表渲染 */

  function filtered() {
    if (!state.idx) return [];
    const q = state.q.toLowerCase();
    const out = [];
    for (const p of state.idx.posts) {
      if (state.tab !== 'all' && p.section !== state.tab) continue;
      if (state.cat && p.category !== state.cat) continue;
      if (state.year && String(p.year) !== state.year) continue;
      const full = state.byId[p.id];
      if (state.acc) {
        if (!full || !(full.accounts || []).includes(state.acc)) continue;
      }
      if (q) {
        const hay = full ? full._hay : plain(`${p.title} ${p.excerpt} ${p.category} ${p.opAuthor || ''}`).toLowerCase();
        if (hay.indexOf(q) < 0) continue;
      }
      out.push(p);
    }
    const byDate = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
    if (state.sort === 'old') out.sort((a, b) => -byDate(a, b));
    else if (state.sort === 'hot') out.sort((a, b) => b.count - a.count || byDate(a, b));
    else out.sort(byDate);
    return out;
  }

  const sectionLabel = key => {
    const meta = (state.idx?.sections || []).find(s => s.key === key);
    return meta ? ui(meta.label, meta.labelEn) : key;
  };

  function card(p) {
    const isOpen = state.open.has(p.id);
    return `<article class="catlogItem${isOpen ? ' isOpen' : ''}" data-post="${p.id}">
      <div class="catlogHead" role="button" tabindex="0" aria-expanded="${isOpen}">
        <div class="catlogHeadMain">
          <h3 class="catlogTitle">${esc(p.title)}</h3>
          <div class="catlogItemMeta">
            <span class="catlogTag sec">${esc(sectionLabel(p.section))}</span>
            ${p.category && p.category !== sectionLabel(p.section) ? `<span class="catlogTag">${esc(p.category)}</span>` : ''}
            <span>${esc(p.date)}</span>
            <span class="catlogTag count">${ui(`校猫 ${p.count} 条`, `${p.count} msg`)}</span>
          </div>
          ${p.excerpt ? `<p class="catlogExcerpt">${esc(p.excerpt)}</p>` : ''}
        </div>
        <span class="catlogChevron" aria-hidden="true">▾</span>
      </div>
      <div class="catlogBody"${isOpen ? '' : ' hidden'}>${isOpen ? bodyHtml(p.id) : ''}</div>
    </article>`;
  }

  function renderList(reset) {
    const list = $('morimensCatlogList');
    if (!list || !state.idx) return;
    const rows = filtered();
    if (!rows.length) {
      list.innerHTML = `<div class="catlogEmpty">${ui('没有符合条件的帖子。试试更换分区、年份，或清空搜索词。', 'No threads matched. Try another section or clear the search.')}</div>`;
      $('morimensCatlogMore').hidden = true;
      updateMeta();
      return;
    }
    const slice = rows.slice(0, state.limit);
    list.innerHTML = slice.map(card).join('');
    $('morimensCatlogMore').hidden = rows.length <= state.limit;
    updateMeta();
  }

  function bodyHtml(id) {
    const post = state.byId[id];
    if (!post) return `<div class="catlogEmpty">${ui('正在载入正文…', 'Loading…')}</div>`;
    const opAuthorIsCat = /light/i.test(post.opAuthor || '') || !post.opAuthor;
    const out = [];
    if (post.op && post.op.content) {
      out.push(`<div class="catlogOp">
        <div class="catlogOpLab">
          <span>${opAuthorIsCat ? ui('原贴 · 校猫本人发布', 'Original post · by Schoolcat') : ui('原贴 · 楼主 ' + esc(post.opAuthor), 'Original post · by ' + esc(post.opAuthor))}</span>
          <a href="https://discord.com/channels/${state.idx.guildId}/${post.id}" target="_blank" rel="noopener noreferrer">${ui('在 Discord 打开 ↗', 'Open in Discord ↗')}</a>
        </div>
        <div class="catlogText">${md(post.op.content)}</div>
        ${imgs(post.op.images)}
      </div>`);
    }
    const msgs = post.messages || [];
    if (!msgs.length) {
      out.push(`<div class="catlogEmpty">${ui('本帖没有追加发言。', 'No follow-up messages in this thread.')}</div>`);
      return out.join('');
    }
    out.push('<ol class="catlogMsgs">' + msgs.map((m, i) => {
      const prev = (m.prev || '').trim();
      const prevHtml = prev && prev !== (post.op?.content || '').trim()
        ? `<div class="catlogPrev"><b>${esc(m.prevAuthor || ui('玩家', 'Player'))}：</b>${prev.length > 260 ? md(prev.slice(0, 260)) + '…' : md(prev)}</div>` : '';
      return `<li class="catlogMsg">
        <div class="catlogMsgHead">
          <time>${esc(m.time || m.ts.slice(0, 16).replace('T', ' '))}</time>
          <span class="catlogSep">·</span>
          <span class="catlogAcc">${m.account === 'old' ? ui('旧号', 'Old acct') : ui('现号', 'Current')}</span>
          <span class="catlogSep">·</span>
          <span>#${i + 1}</span>
          <span class="catlogSep">·</span>
          <a href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">${ui('原帖 ↗', 'Source ↗')}</a>
        </div>
        ${prevHtml}
        <div class="catlogText">${md(m.content)}</div>
        ${imgs(m.images)}
      </li>`;
    }).join('') + '</ol>');
    return out.join('');
  }

  function imgs(list) {
    if (!list || !list.length) return '';
    return '<div class="catlogImgs">' + list.map(([src, name, size, kind]) => {
      const label = esc(name) + ' · ' + kb(size || 0);
      // 只有已镜像到站内的图片才内嵌；未镜像的（体积过大）Discord 签名 URL 会过期，改走原帖链接
      if (kind === 'image' && !/^https?:/i.test(src)) {
        return `<figure class="catlogImg"><img src="${esc(src)}" alt="${esc(name)}" loading="lazy" onerror="this.parentNode.classList.add('isBroken');this.hidden=true"><span>${label}</span></figure>`;
      }
      return `<a class="catlogFileChip" href="${esc(src)}" target="_blank" rel="noopener noreferrer">📎 ${label}</a>`;
    }).join('') + '</div>';
  }

  function togglePost(item) {
    if (!item) return;
    const id = item.dataset.post;
    const panel = item.querySelector('.catlogBody');
    const head = item.querySelector('.catlogHead');
    const isOpen = state.open.has(id);
    if (isOpen) {
      state.open.delete(id);
      item.classList.remove('isOpen');
      head.setAttribute('aria-expanded', 'false');
      panel.hidden = true;
      return;
    }
    state.open.add(id);
    item.classList.add('isOpen');
    head.setAttribute('aria-expanded', 'true');
    panel.hidden = false;

    const post = state.byId[id];
    if (post) { panel.innerHTML = bodyHtml(id); return; }
    panel.innerHTML = `<div class="catlogEmpty">${ui('正在载入正文…', 'Loading…')}</div>`;
    const key = (state.idx.posts.find(p => p.id === id) || {}).section;
    if (!key) return;
    ensureSection(key).then(() => {
      panel.innerHTML = bodyHtml(id);
      updateMeta();
    });
  }

  /* ---------------------------------------------------------------- 启动 */

  function boot() {
    if (!mount()) {
      let tries = 0;
      const timer = setInterval(() => {
        tries += 1;
        if (mount() || tries > 500) clearInterval(timer);   // 最多等 60s，等榜单面板把标签栏建出来
      }, 120);
    }
    if (location.hash === HASH) setTimeout(open, 0);
    window.addEventListener('morimens-language-change', () => {
      if (!state.mounted) return;
      const btn = $(TAB_ID);
      if (btn) btn.textContent = tabLabel();
      const panel = $(PANEL_ID);
      if (panel && state.idx) {
        panel.querySelector('.catlogShell').outerHTML = shellHtml();
        bindUi();
        buildFilters();
        updateNotice();
        renderList(true);
        updateMeta();
      }
    });
  }

  window.MorimensCatlog = { open, reload: () => { state.idx = null; state.started = false; open(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();

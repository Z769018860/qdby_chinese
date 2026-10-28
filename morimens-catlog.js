/* 忘忘看报 · 校猫日志
 * 把《忘却前夜》制作人 Mythag Cat ～ Light 在官方 Discord 的发言汇编成可筛选的归档。
 * 数据由 discord_sync 只读同步后导出到 data/morimens/catlog/：
 *   index.json         轻量索引（标题 / 分类 / 日期 / 条数 / 摘要）
 *   sections/*.json    分区正文（原贴 + 发言 + 配图），按需加载
 * 每条发言都带：官方身份标识、镜像后的配图、以及（原文非中文时的）中文机翻。
 */
(() => {
  'use strict';

  const DATA = 'data/morimens/catlog/';
  const TAB_ID = 'morimensCatlogTab';
  const PANEL_ID = 'morimensCatlogPanel';
  const HASH = '#catlog';
  const PAGE = 18;
  const LS_TR = 'morimens.catlog.showTr';
  const NAME = 'Mythag Cat ～ Light';

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
    prevSort: '',
    q: '',
    limit: PAGE,
    open: new Set(),
    mounted: false,
    started: false,
    error: null,
    loadingSections: false,
    showTr: localStorage.getItem(LS_TR) !== '0',
    onlyImg: false,
    onlyTr: false,
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
  const avatar = acc => (state.idx?.accounts?.[acc]?.avatar || '');

  /* ---------------------------------------------------------------- 搜索命中 */

  /** 去掉 Markdown / 表情 / 提及，只留可读文字，用于截取命中片段。 */
  function readable(s) {
    return String(s || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/<a?:[A-Za-z0-9_~]{2,32}:\d+>/g, ' ')
      .replace(/<[^>]{1,60}>/g, ' ')
      .replace(/\[([^\]\n]{1,80})\]\((https?:\/\/[^\s)]+)\)/g, '$1')
      .replace(/[*_~`>#]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** 命中位置 + 前后各 45 字的上下文片段。 */
  function snippetOf(text, needle, radius = 45) {
    const t = readable(text);
    if (!t) return '';
    const i = t.toLowerCase().indexOf(needle);
    if (i < 0) return '';
    const start = Math.max(0, i - radius);
    const end = Math.min(t.length, i + needle.length + radius);
    return (start > 0 ? '…' : '') + t.slice(start, end) + (end < t.length ? '…' : '');
  }

  /** 在整帖范围内找出所有命中，返回 [{where, sn, mi}]（mi=-1 表示原贴，>=0 表示第几条发言）。 */
  function matchInfo(post, needle) {
    const hits = [];
    const push = (where, text, mi) => {
      const sn = snippetOf(text, needle);
      if (sn) hits.push({ where, sn, mi });
    };
    push(ui('标题', 'Title'), post.title, -1);
    push(ui('标题译文', 'Title (zh)'), post.titleTr, -1);
    if (post.op) {
      push(ui('原贴正文', 'Original post'), post.op.content, -1);
      push(ui('原贴译文', 'Post (zh)'), post.op.tr, -1);
    }
    (post.messages || []).forEach((m, i) => {
      push(ui(`第 ${i + 1} 条发言`, `#${i + 1}`), m.content, i);
      push(ui(`第 ${i + 1} 条发言的译文`, `#${i + 1} (zh)`), m.tr, i);
      push(ui(`第 ${i + 1} 条引用的玩家留言`, `#${i + 1} quoted`), m.prev, i);
    });
    return hits;
  }

  /** 渲染后把命中词包成 <mark>，避免在 HTML 字符串里做替换误伤标签。 */
  function markHits(root, needle) {
    if (!root || !needle) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    for (const node of nodes) {
      const text = node.nodeValue || '';
      const lower = text.toLowerCase();
      let i = lower.indexOf(needle);
      if (i < 0) continue;
      const parent = node.parentNode;
      if (!parent || parent.nodeName === 'MARK') continue;
      const frag = document.createDocumentFragment();
      let last = 0;
      while (i >= 0) {
        if (i > last) frag.appendChild(document.createTextNode(text.slice(last, i)));
        const mk = document.createElement('mark');
        mk.className = 'catlogHit';
        mk.textContent = text.slice(i, i + needle.length);
        frag.appendChild(mk);
        last = i + needle.length;
        i = lower.indexOf(needle, last);
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      parent.replaceChild(frag, node);
    }
  }

  /* ---------------------------------------------------------------- 数据加载 */

  async function fetchJson(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(url + ' → HTTP ' + res.status);
    return res.json();
  }

  function indexInto(post, key) {
    const copy = Object.assign({}, post, { _sec: key });
    const bag = [post.title, post.titleTr || '', post.category, post.opAuthor || '',
      post.op ? post.op.content : '', post.op ? post.op.tr || '' : ''];
    for (const m of post.messages || []) bag.push(m.content, m.tr || '', m.prev || '', m.prevTr || '');
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
            '《忘却前夜》制作人 Mythag Cat ～ Light 在官方 Discord 的公开发言汇编：版本公告、活动说明、玩家问答与留言回复，按帖子归档并保留原贴全文、配图与中文翻译。',
            'An archive of public messages from Morimens producer Mythag Cat ～ Light on the official Discord: patch notes, event posts, player Q&amp;A, and replies — grouped by thread with the original post, images, and Chinese translations kept intact.')}</p>
        </div>
        <span class="statusPill" id="morimensCatlogPill">${ui('Discord 只读同步', 'Discord read-only sync')}</span>
      </div>
      <div class="catlogNotice" id="morimensCatlogNotice"></div>
      <div class="catlogBar">
        <div class="catlogSeg" id="morimensCatlogSeg" role="tablist" aria-label="${ui('分区筛选', 'Section filter')}"></div>
        <div class="catlogFields">
          <input id="morimensCatlogQ" type="search" autocomplete="off" aria-label="${ui('搜索', 'Search')}" placeholder="${ui('搜索标题、公告正文、发言或译文…', 'Search titles, post text or replies…')}">
          <select id="morimensCatlogCat" aria-label="${ui('分类', 'Category')}"></select>
          <select id="morimensCatlogYear" aria-label="${ui('年份', 'Year')}"></select>
          <select id="morimensCatlogAcc" aria-label="${ui('账号', 'Account')}"></select>
          <select id="morimensCatlogSort" aria-label="${ui('排序', 'Sort')}"></select>
        </div>
        <div class="catlogToggles">
          <button type="button" class="catlogChip" id="morimensCatlogTrToggle" aria-pressed="${state.showTr}">
            <i aria-hidden="true"></i>${ui('显示中文翻译', 'Show translations')}
          </button>
          <button type="button" class="catlogChip" id="morimensCatlogImgOnly" aria-pressed="false">
            <i aria-hidden="true"></i>${ui('只看有配图', 'With images')}
          </button>
          <button type="button" class="catlogChip" id="morimensCatlogTrOnly" aria-pressed="false">
            <i aria-hidden="true"></i>${ui('只看有译文', 'With translations')}
          </button>
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
          const now = q.value.trim();
          const had = state.q;
          state.q = now;
          state.limit = PAGE;
          const sortSel = $('morimensCatlogSort');
          if (now && state.sort !== 'rel') {
            // 有搜索词时默认按命中数排序，清空后还原
            if (!state.prevSort) state.prevSort = state.sort;
            state.sort = 'rel';
            if (sortSel) sortSel.value = 'rel';
          } else if (!now && state.prevSort) {
            state.sort = state.prevSort;
            state.prevSort = '';
            if (sortSel) sortSel.value = state.sort;
          }
          if (now && !had) loadRest();     // 先触发全量载入，正文检索才准
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

    const chip = (id, fn) => {
      const el = $(id);
      if (!el || el.dataset.bound) return;
      el.dataset.bound = '1';
      el.addEventListener('click', () => {
        fn(el);
        state.limit = PAGE;
        renderList(true);
      });
    };
    chip('morimensCatlogTrToggle', el => {
      state.showTr = !state.showTr;
      localStorage.setItem(LS_TR, state.showTr ? '1' : '0');
      el.setAttribute('aria-pressed', String(state.showTr));
      document.querySelectorAll('#morimensCatlogList [data-post]').forEach(item => {
        if (item.classList.contains('isOpen')) paintBody(item.querySelector('.catlogBody'), item.dataset.post);
      });
    });
    chip('morimensCatlogImgOnly', el => {
      state.onlyImg = !state.onlyImg;
      el.setAttribute('aria-pressed', String(state.onlyImg));
    });
    chip('morimensCatlogTrOnly', el => {
      state.onlyTr = !state.onlyTr;
      el.setAttribute('aria-pressed', String(state.onlyTr));
    });

    const list = $('morimensCatlogList');
    if (list && !list.dataset.bound) {
      list.dataset.bound = '1';
      list.addEventListener('click', ev => {
        const hit = ev.target.closest('.catlogSnippet');
        if (hit) { ev.stopPropagation(); jumpTo(hit.closest('.catlogItem'), Number(hit.dataset.jump)); return; }
        const sp = ev.target.closest('.catlogSpoiler');
        if (sp) { sp.classList.toggle('isOpen'); return; }
        const pic = ev.target.closest('.catlogPic');
        if (pic) { openLightbox(pic); return; }
        const head = ev.target.closest('.catlogHead');
        if (head && !ev.target.closest('a')) togglePost(head.closest('.catlogItem'));
      });
      list.addEventListener('keydown', ev => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        const hit = ev.target.closest('.catlogSnippet');
        if (hit) { ev.preventDefault(); jumpTo(hit.closest('.catlogItem'), Number(hit.dataset.jump)); return; }
        const sp = ev.target.closest('.catlogSpoiler');
        if (sp) { ev.preventDefault(); sp.classList.toggle('isOpen'); return; }
        const pic = ev.target.closest('.catlogPic');
        if (pic) { ev.preventDefault(); openLightbox(pic); return; }
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

  /* ---------------------------------------------------------------- 灯箱 */

  let lb = null;

  function ensureLightbox() {
    if (lb) return lb;
    const el = document.createElement('div');
    el.className = 'catlogLb';
    el.hidden = true;
    el.innerHTML = `<button type="button" class="catlogLbClose" aria-label="${ui('关闭', 'Close')}">×</button>
      <button type="button" class="catlogLbNav prev" aria-label="${ui('上一张', 'Previous')}">‹</button>
      <figure><img alt=""><figcaption></figcaption></figure>
      <button type="button" class="catlogLbNav next" aria-label="${ui('下一张', 'Next')}">›</button>`;
    document.body.appendChild(el);
    el.addEventListener('click', ev => {
      if (ev.target === el || ev.target.classList.contains('catlogLbClose')) closeLightbox();
      else if (ev.target.classList.contains('prev')) stepLightbox(-1);
      else if (ev.target.classList.contains('next')) stepLightbox(1);
    });
    document.addEventListener('keydown', ev => {
      if (el.hidden) return;
      if (ev.key === 'Escape') closeLightbox();
      else if (ev.key === 'ArrowLeft') stepLightbox(-1);
      else if (ev.key === 'ArrowRight') stepLightbox(1);
    });
    lb = { el, items: [], i: 0 };
    return lb;
  }

  function openLightbox(pic) {
    const box = ensureLightbox();
    const gallery = pic.closest('.catlogGallery');
    const nodes = gallery ? [...gallery.querySelectorAll('.catlogPic')] : [pic];
    box.items = nodes.map(n => ({ src: n.dataset.full, name: n.dataset.name || '' }));
    box.i = Math.max(0, nodes.indexOf(pic));
    paintLightbox();
    box.el.hidden = false;
    document.body.classList.add('catlogLock');
  }

  function paintLightbox() {
    const box = lb;
    if (!box || !box.items.length) return;
    const it = box.items[box.i];
    const img = box.el.querySelector('img');
    img.src = it.src;
    img.alt = it.name;
    box.el.querySelector('figcaption').textContent = box.items.length > 1
      ? `${it.name}（${box.i + 1}/${box.items.length}）` : it.name;
    box.el.querySelector('.prev').hidden = box.items.length < 2;
    box.el.querySelector('.next').hidden = box.items.length < 2;
  }

  function stepLightbox(d) {
    const box = lb;
    if (!box || box.items.length < 2) return;
    box.i = (box.i + d + box.items.length) % box.items.length;
    paintLightbox();
  }

  function closeLightbox() {
    if (!lb) return;
    lb.el.hidden = true;
    document.body.classList.remove('catlogLock');
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
        `<option value="hot">${ui('发言最多', 'Most replies')}</option>` +
        `<option value="rel">${ui('相关度（命中最多）', 'Most matches')}</option>`;
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
      `共收录 <strong>${t.posts}</strong> 个帖子、<strong>${t.messages.toLocaleString()}</strong> 条发言、<strong>${t.images}</strong> 张配图，` +
      `覆盖 ${range}（${idx.timezone}）。原贴与回复里的图片已镜像到本站，Discord 签名链接过期也不会失效；` +
      `原文非中文的发言附<strong>机翻中文</strong>（${t.translated} 条）。<strong>数据截至 ${idx.generated}</strong>。`,
      `<strong>${t.posts}</strong> threads, <strong>${t.messages.toLocaleString()}</strong> messages and <strong>${t.images}</strong> images, spanning ${range} (${idx.timezone}). ` +
      `Attachments are mirrored locally so expiring Discord links no longer break them; non-Chinese messages carry machine translations (${t.translated}). <strong>Data updated ${idx.generated}</strong>.`
    );

    const foot = $('morimensCatlogFoot');
    if (foot) {
      foot.innerHTML = ui(
        `来源：Discord 官方服务器「Morimens」· 校猫（Mythag Cat ～ Light）公开发言，两个账号合并：旧号 @game.producer.light（2023-10-29 → 2026-03-28，账号已丢失）与现号 @lightproud（2026-03-29 起）。时间统一为 UTC+8。配图为原帖附件，已压缩转存。中文译文由机器翻译生成，仅供参考，以原文为准。本页只做只读归档，不含任何玩家私信内容。`,
        `Source: public messages from Mythag Cat ～ Light (Morimens producer) on the official Discord, merging the old account @game.producer.light (2023-10-29 → 2026-03-28, since lost) and the current @lightproud (from 2026-03-29). All times UTC+8. Images are compressed copies of the original attachments. Chinese translations are machine-generated, for reference only. Read-only archive; no private messages are included.`
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
    const hits = state.q ? rows.reduce((sum, p) => sum + (p._hits || 0), 0) : 0;
    el.innerHTML = `<span>${ui('筛出', 'Matched')} <b>${posts}</b> ${ui('帖', 'threads')} · <b>${msgs.toLocaleString()}</b> ${ui('条发言', 'messages')}` +
      (state.q ? ` · <b>${hits}</b> ${ui('处命中', 'hits')}` : '') + '</span>' +
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
      if (state.onlyImg && !p.imgs) continue;
      if (state.onlyTr && !p.trans) continue;
      const full = state.byId[p.id];
      if (state.acc) {
        if (!full || !(full.accounts || []).includes(state.acc)) continue;
      }
      if (q) {
        const hay = full ? full._hay : plain(`${p.title} ${p.titleTr || ''} ${p.excerpt} ${p.excerptTr || ''} ${p.category} ${p.opAuthor || ''}`).toLowerCase();
        if (hay.indexOf(q) < 0) continue;
        p._hits = full ? matchInfo(full, q).length : 0;
      } else {
        p._hits = 0;
      }
      out.push(p);
    }
    const byDate = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
    if (state.sort === 'old') out.sort((a, b) => -byDate(a, b));
    else if (state.sort === 'hot') out.sort((a, b) => b.count - a.count || byDate(a, b));
    else if (state.sort === 'rel' && q) out.sort((a, b) => (b._hits || 0) - (a._hits || 0) || byDate(a, b));
    else out.sort(byDate);
    return out;
  }

  const sectionLabel = key => {
    const meta = (state.idx?.sections || []).find(s => s.key === key);
    return meta ? ui(meta.label, meta.labelEn) : key;
  };

  /** 搜索时在卡片头部直接给出「命中了哪里」的片段，点一下跳到那条发言。 */
  function hitsHtml(p) {
    const full = state.byId[p.id];
    if (!full) return '';
    const hits = matchInfo(full, state.q.toLowerCase());
    if (!hits.length) return '';
    const shown = hits.slice(0, 3);
    return '<div class="catlogHits">' + shown.map(h =>
      `<button type="button" class="catlogSnippet" data-jump="${h.mi}">
        <span class="catlogWhere">${esc(h.where)}</span>
        <span class="catlogSn">${esc(h.sn)}</span>
      </button>`).join('') +
      (hits.length > shown.length
        ? `<span class="catlogHitsMore">${ui(`另有 ${hits.length - shown.length} 处命中`, `+${hits.length - shown.length} more`)}</span>`
        : '') + '</div>';
  }

  function card(p) {
    const isOpen = state.open.has(p.id);
    const titleTr = p.titleTr && p.titleTr !== p.title ? `<span class="catlogTitleTr">${esc(p.titleTr)}</span>` : '';
    return `<article class="catlogItem${isOpen ? ' isOpen' : ''}" data-post="${p.id}">
      <div class="catlogHead" role="button" tabindex="0" aria-expanded="${isOpen}">
        <div class="catlogHeadMain">
          <h3 class="catlogTitle">${esc(p.title)}${titleTr}</h3>
          <div class="catlogItemMeta">
            <span class="catlogTag sec">${esc(sectionLabel(p.section))}</span>
            ${p.category && p.category !== sectionLabel(p.section) ? `<span class="catlogTag">${esc(p.category)}</span>` : ''}
            <span>${esc(p.date)}</span>
            <span class="catlogTag count">${ui(`官方 ${p.count} 条`, `${p.count} msg`)}</span>
            ${p.imgs ? `<span class="catlogTag img">🖼 ${p.imgs}</span>` : ''}
            ${p.trans ? `<span class="catlogTag tr">${ui('译', 'ZH')} ${p.trans}</span>` : ''}
            ${p._hits ? `<span class="catlogTag hit">${ui(`命中 ${p._hits} 处`, `${p._hits} hits`)}</span>` : ''}
          </div>
          ${p.excerpt ? `<p class="catlogExcerpt">${esc(p.excerpt)}</p>` : ''}
          ${p.excerptTr ? `<p class="catlogExcerpt tr">${esc(p.excerptTr)}</p>` : ''}
          ${state.q ? hitsHtml(p) : ''}
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
    if (state.q) markHits(list, state.q.toLowerCase());
    $('morimensCatlogMore').hidden = rows.length <= state.limit;
    updateMeta();
  }

  /* ---------------------------------------------------------------- 正文 */

  function officialHead(acc, opts) {
    const meta = state.idx?.accounts?.[acc] || {};
    const label = acc === 'old' ? ui('旧账号', 'Old account') : ui('现账号', 'Current account');
    const av = avatar(acc);
    return `<div class="catlogWho">
      ${av ? `<img class="catlogAvatar" src="${esc(av)}" alt="" width="34" height="34" loading="lazy">` : '<span class="catlogAvatar ph" aria-hidden="true">猫</span>'}
      <div class="catlogWhoMain">
        <span class="catlogName">${esc(NAME)}<i class="catlogBadge" title="${ui('官方账号', 'Official account')}">${ui('官方', 'OFFICIAL')}</i></span>
        <span class="catlogWhoSub">${esc(meta.handle || '')} · ${esc(label)}${opts && opts.time ? ' · ' + esc(opts.time) : ''}</span>
      </div>
    </div>`;
  }

  function trBlock(zh, cls) {
    if (!zh || !state.showTr) return '';
    return `<div class="catlogTr${cls ? ' ' + cls : ''}"><span class="catlogTrLab">${ui('中文翻译', 'Chinese translation')}</span><div class="catlogTrText">${md(zh)}</div></div>`;
  }

  function bodyHtml(id) {
    const post = state.byId[id];
    if (!post) return `<div class="catlogEmpty">${ui('正在载入正文…', 'Loading…')}</div>`;
    const opAuthorIsCat = /light/i.test(post.opAuthor || '') || !post.opAuthor;
    const out = [];
    if (post.op && (post.op.content || (post.op.images || []).length)) {
      out.push(`<div class="catlogOp${opAuthorIsCat ? ' isOfficial' : ''}">
        <div class="catlogOpLab">
          <span>${opAuthorIsCat ? ui('原贴 · 官方发布', 'Original post · official') : ui('原贴 · 楼主 ' + esc(post.opAuthor), 'Original post · by ' + esc(post.opAuthor))}</span>
          <a href="https://discord.com/channels/${state.idx.guildId}/${post.id}" target="_blank" rel="noopener noreferrer">${ui('在 Discord 打开 ↗', 'Open in Discord ↗')}</a>
        </div>
        ${opAuthorIsCat ? officialHead(post.op.account || 'new', { time: (post.op.ts || '').slice(0, 10) }) : ''}
        ${post.op.content ? `<div class="catlogText">${md(post.op.content)}</div>` : ''}
        ${trBlock(post.op.tr)}
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
        ? `<div class="catlogPrev"><b>${esc(m.prevAuthor || ui('玩家', 'Player'))}：</b>${prev.length > 260 ? md(prev.slice(0, 260)) + '…' : md(prev)}${trBlock(m.prevTr, 'inline')}</div>` : '';
      return `<li class="catlogMsg isOfficial" data-mi="${i}">
        <div class="catlogMsgHead">
          <span class="catlogSeq">${i + 1}</span>
          ${officialHead(m.account)}
          <span class="catlogMsgLinks">
            <a href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">${ui('原帖 ↗', 'Source ↗')}</a>
          </span>
        </div>
        ${prevHtml}
        <div class="catlogText">${md(m.content)}</div>
        ${trBlock(m.tr)}
        ${imgs(m.images)}
      </li>`;
    }).join('') + '</ol>');
    return out.join('');
  }

  function imgs(list) {
    if (!list || !list.length) return '';
    const pics = [], files = [];
    for (const it of list) {
      const [src, name, size, kind, w, h] = it;
      if (kind === 'image' && src) pics.push({ src, name, size, w, h });
      else files.push(it);
    }
    const gallery = pics.length
      ? `<div class="catlogGallery" data-count="${pics.length}">` + pics.map(p =>
        `<button type="button" class="catlogPic" data-full="${esc(p.src)}" data-name="${esc(p.name)}" aria-label="${esc(p.name)}">
          <img src="${esc(p.src)}" alt="${esc(p.name)}" loading="lazy" decoding="async"${p.w && p.h ? ` width="${p.w}" height="${p.h}"` : ''} onerror="this.closest('.catlogPic').classList.add('isBroken')">
          <span class="catlogPicZoom" aria-hidden="true">${ui('放大', 'Zoom')}</span>
        </button>`).join('') + '</div>'
      : '';
    const chips = files.length
      ? '<div class="catlogFiles">' + files.map(([src, name, size, kind]) => {
        const label = `${kind === 'image-lost' ? ui('配图未能镜像', 'Image not mirrored') : kind === 'video' ? ui('视频附件', 'Video') : ui('附件', 'File')} · ${esc(name)} · ${kb(size || 0)}`;
        return `<span class="catlogFileChip" title="${ui('Discord 附件链接会过期，请到原帖查看', 'Discord links expire — open the source post')}">📎 ${label}</span>`;
      }).join('') + '</div>'
      : '';
    return gallery + chips;
  }

  function paintBody(panel, id) {
    panel.innerHTML = bodyHtml(id);
    if (state.q) markHits(panel, state.q.toLowerCase());
  }

  function togglePost(item) {
    if (!item) return Promise.resolve();
    const id = item.dataset.post;
    const panel = item.querySelector('.catlogBody');
    const head = item.querySelector('.catlogHead');
    const isOpen = state.open.has(id);
    if (isOpen) {
      state.open.delete(id);
      item.classList.remove('isOpen');
      head.setAttribute('aria-expanded', 'false');
      panel.hidden = true;
      return Promise.resolve();
    }
    state.open.add(id);
    item.classList.add('isOpen');
    head.setAttribute('aria-expanded', 'true');
    panel.hidden = false;

    const post = state.byId[id];
    if (post) { paintBody(panel, id); return Promise.resolve(); }
    panel.innerHTML = `<div class="catlogEmpty">${ui('正在载入正文…', 'Loading…')}</div>`;
    const key = (state.idx.posts.find(p => p.id === id) || {}).section;
    if (!key) return Promise.resolve();
    return ensureSection(key).then(() => {
      paintBody(panel, id);
      updateMeta();
    });
  }

  /** 点命中片段：展开该帖并滚到对应位置，短暂高亮闪一下。 */
  function jumpTo(item, mi) {
    if (!item) return;
    const id = item.dataset.post;
    const wasOpen = state.open.has(id);
    const p = wasOpen ? Promise.resolve() : togglePost(item);
    p.then(() => {
      const panel = item.querySelector('.catlogBody');
      const target = mi >= 0
        ? panel.querySelector(`[data-mi="${mi}"]`)
        : (panel.querySelector('.catlogOp') || panel);
      if (!target) return;
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      target.classList.add('isFlash');
      setTimeout(() => target.classList.remove('isFlash'), 1800);
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

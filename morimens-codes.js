/* 忘忘看报 · 兑换码
 * 顶栏右上角常驻入口，点开是官方兑换码清单（含奖励与有效期）。
 * 数据由 discord_sync 的 codes.py 从校猫 Discord 发言里提取，导出成
 *   data/morimens/catlog/codes.json
 * 前端只展示「当前仍在有效期内」的码：过期条目在数据侧已被移除，
 * 页面这边每次渲染还会按本地时间再过滤一次，倒计时归零即自动消失。
 */
(() => {
  'use strict';

  const SRC = 'data/morimens/catlog/codes.json';
  const TICK_MS = 30000;        // 30 秒刷新倒计时 / 清理过期
  const REFETCH_MS = 10 * 60000; // 打开状态下 10 分钟重新拉一次数据
  const BTN_ID = 'morimensCodesBtn';
  const MASK_ID = 'morimensCodesMask';
  const TOP_BAR_ID = 'morimensTopActions'; // dtide 注入的右上角固定操作栏（爱发电 / 公告 / 生日日历 …）

  const isEnglish = () => localStorage.getItem('morimens.language') === 'en';
  const ui = (zh, en) => (isEnglish() ? en : zh);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = id => document.getElementById(id);

  const state = { data: null, loading: false, err: '', lastFetch: 0, open: false };
  let watchTimer = 0;

  /* ---------------------------------------------------------------- 时间 */

  const pad = n => String(n).padStart(2, '0');

  function fmtLocal(ts) {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function expTs(c) {
    if (!c || c.permanent || !c.expiresAt) return 0;
    const t = Date.parse(c.expiresAt);
    return Number.isNaN(t) ? 0 : t;
  }

  function alive(c) {
    const t = expTs(c);
    return !t || t > Date.now();
  }

  function expireInfo(c) {
    if (c.permanent) return { cls: 'isPermanent', text: ui('永久有效', 'Permanent'), expiring: false };
    const t = expTs(c);
    if (!t) return { cls: 'isUnknown', text: ui('有效期未注明', 'Expiry not stated'), expiring: false };
    const left = t - Date.now();
    if (left <= 0) return { cls: 'isExpiring', text: ui('已过期', 'Expired'), expiring: true };
    const mins = Math.floor(left / 60000);
    const days = Math.floor(mins / 1440);
    const hours = Math.floor((mins % 1440) / 60);
    const restMin = mins % 60;
    let text;
    if (days >= 1) text = ui(`剩 ${days} 天`, `${days}d left`);
    else if (hours >= 1) text = ui(`剩 ${hours} 小时 ${restMin} 分`, `${hours}h ${restMin}m left`);
    else text = ui(`剩 ${restMin} 分钟`, `${restMin}m left`);
    return { cls: left < 72 * 3600 * 1000 ? 'isExpiring' : '', text, expiring: left < 72 * 3600 * 1000 };
  }

  /* ---------------------------------------------------------------- 数据 */

  async function fetchCodes(force) {
    if (state.loading) return;
    if (!force && state.data && Date.now() - state.lastFetch < 60000) return;
    state.loading = true;
    const btn = $(BTN_ID);
    if (btn) btn.classList.add('isLoading');
    try {
      const url = new URL(SRC, document.baseURI);
      url.searchParams.set('t', String(Date.now()));
      const res = await fetch(url.toString(), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      state.data = data && Array.isArray(data.codes) ? data : { codes: [] };
      state.err = '';
      state.lastFetch = Date.now();
    } catch (e) {
      state.err = e.message || 'load failed';
      if (!state.data) state.data = { codes: [] };
    } finally {
      state.loading = false;
      if (btn) btn.classList.remove('isLoading');
      updateBadge();
      if (state.open) render();
    }
  }

  function activeCodes() {
    return (state.data?.codes || []).filter(alive);
  }

  function updateBadge() {
    const badge = $('morimensCodesBadge');
    if (!badge) return;
    const n = activeCodes().length;
    badge.textContent = String(n);
    badge.hidden = n === 0;
  }

  /* ---------------------------------------------------------------- 顶栏按钮 */

  function svgTicket() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 6v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-6z"/>'
      + '<path d="M13 5v2M13 11v2M13 17v2"/></svg>';
  }

  function ensureButton() {
    if (mountButton()) return;
    watchTopActions();
  }

  /* 按钮默认挂在顶栏右侧；但 dtide 会在数据加载完后注入一个 position:fixed 的右上角操作栏
     （z-index 10020）和语言开关，两者正好压在顶栏右端，宽屏下按钮会整块被盖住。
     所以操作栏一出现就把按钮搬进去，跟着那排按钮一起排。 */
  function mountButton() {
    let btn = $(BTN_ID);
    if (!btn) {
      const topbar = document.querySelector('header.topbar') || document.querySelector('.topbar');
      if (!topbar) return false;
      btn = buildButton();
      topbar.appendChild(btn);
    }
    const bar = $(TOP_BAR_ID);
    if (bar) {
      if (btn.parentElement !== bar) bar.appendChild(btn);
      return true;
    }
    return false;
  }

  function watchTopActions() {
    if (watchTimer || $(TOP_BAR_ID)) return;
    let tries = 0;
    watchTimer = setInterval(() => {
      tries++;
      if (mountButton() || tries > 150) { clearInterval(watchTimer); watchTimer = 0; } // 最多等 60 秒
    }, 400);
  }

  function buildButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = BTN_ID;
    btn.className = 'mcodeTopBtn';
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.setAttribute('aria-controls', MASK_ID);
    btn.innerHTML = svgTicket() + '<span class="mcodeTopLabel"></span>'
      + `<span class="mcodeTopBadge" id="morimensCodesBadge" hidden>0</span>`;
    btn.querySelector('.mcodeTopLabel').textContent = ui('兑换码', 'Codes');
    btn.addEventListener('click', open);
    return btn;
  }

  function syncLabel() {
    const label = $(BTN_ID)?.querySelector('.mcodeTopLabel');
    if (label) label.textContent = ui('兑换码', 'Codes');
  }

  /* ---------------------------------------------------------------- 弹窗 */

  function ensureModal() {
    if ($(MASK_ID)) return;
    const mask = document.createElement('div');
    mask.id = MASK_ID;
    mask.className = 'mcodeMask';
    mask.hidden = true;
    mask.innerHTML = `
      <div class="mcodePanel" role="dialog" aria-modal="true" aria-labelledby="morimensCodesTitle">
        <div class="mcodeHead">
          <div class="mcodeHeadMain">
            <p class="mcodeEyebrow">REDEMPTION CODES</p>
            <h2 class="mcodeTitle" id="morimensCodesTitle"></h2>
            <p class="mcodeSub" id="morimensCodesSub"></p>
          </div>
          <button class="mcodeIconBtn" type="button" id="morimensCodesRefresh" aria-label="refresh" title="">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3.2-6.9"/><path d="M21 3v6h-6"/></svg>
          </button>
          <button class="mcodeIconBtn" type="button" id="morimensCodesClose" aria-label="close">×</button>
        </div>
        <div class="mcodeBody" id="morimensCodesBody"></div>
        <div class="mcodeFoot" id="morimensCodesFoot"></div>
      </div>`;
    document.body.appendChild(mask);

    mask.addEventListener('click', ev => {
      if (ev.target === mask) close();
    });
    mask.querySelector('#morimensCodesClose').addEventListener('click', close);
    mask.querySelector('#morimensCodesRefresh').addEventListener('click', ev => {
      const b = ev.currentTarget;
      b.classList.add('isSpin');
      fetchCodes(true).finally(() => setTimeout(() => b.classList.remove('isSpin'), 400));
    });
    mask.querySelector('#morimensCodesBody').addEventListener('click', ev => {
      const btn = ev.target.closest('.mcodeCopy');
      if (!btn) return;
      copyCode(btn.dataset.code || '', btn);
    });
    document.addEventListener('keydown', ev => {
      if (ev.key === 'Escape' && state.open) close();
    });
  }

  function render() {
    const body = $('morimensCodesBody');
    const foot = $('morimensCodesFoot');
    const sub = $('morimensCodesSub');
    const title = $('morimensCodesTitle');
    if (!body || !foot) return;

    title.textContent = ui('官方兑换码', 'Official codes');
    const list = activeCodes();
    const total = state.data?.codes?.length || 0;

    sub.textContent = state.err && !total
      ? ui('数据暂时读取失败，请稍后重试。', 'Could not load data. Please retry shortly.')
      : ui('来自 Discord「礼包码」频道的官方公告，随每日同步自动更新；过期的码会自动消失。',
           'From the official Discord gift-codes channel, kept in sync daily. Expired codes drop off by themselves.');

    if (!list.length) {
      body.innerHTML = `<div class="mcodeEmpty"><strong>${ui('当前没有有效期内的兑换码', 'No active codes right now')}</strong>${ui(
        '官方发布新码后，这里通常会在下一次同步时自动出现。',
        'New codes appear here after the next sync.')}</div>`;
    } else {
      body.innerHTML = list.map(c => {
        const ex = expireInfo(c);
        const name = c.name || ui('官方兑换码', 'Official code');
        const reward = c.reward ? `<span class="mcodeReward">${esc(c.reward)}</span>` : '';
        const until = expTs(c)
          ? `<span>${ui('截止', 'Until')} ${esc(fmtLocal(c.expiresAt))}</span>`
          : '';
        const src = c.sourceUrl
          ? `<a class="mcodeSrc" href="${esc(c.sourceUrl)}" target="_blank" rel="noopener noreferrer">${ui('查看原帖 ↗', 'Source ↗')}</a>`
          : '';
        const excerpt = (c.excerptZh || c.excerpt || '').trim();
        return `<div class="mcodeCard${ex.expiring ? ' isExpiring' : ''}">
          <div class="mcodeCardHead">
            <span class="mcodeName">${esc(name)}</span>${reward}
          </div>
          <div class="mcodeCodeRow">
            <code class="mcodeCode">${esc(c.code)}</code>
            <button class="mcodeCopy" type="button" data-code="${esc(c.code)}">${ui('复制', 'Copy')}</button>
          </div>
          <div class="mcodeMeta">
            <span class="mcodeExp ${ex.cls}"><i class="mcodeDot"></i>${esc(ex.text)}</span>
            ${until}${src}
          </div>
          ${excerpt ? `<p class="mcodeExcerpt">${esc(excerpt)}</p>` : ''}
        </div>`;
      }).join('');
    }

    const gen = state.data?.generated || '';
    foot.innerHTML = `<span class="mcodeLive"><i></i>${ui('自动同步', 'Auto-sync')}</span>`
      + (gen ? `<span>${ui('数据更新于', 'Updated')} <b>${esc(gen)}</b> (UTC+8)</span>` : '')
      + (total && !list.length ? `<span>${ui('全部已过期，已自动清除', 'All codes expired and were cleared')}</span>` : '')
      + `<span>${ui('仅供查询，请以游戏内公告为准', 'For reference only; in-game notices are authoritative')}</span>`;
  }

  function open() {
    ensureModal();
    const mask = $(MASK_ID);
    if (!mask) return;
    state.open = true;
    mask.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    render();
    fetchCodes(true);
    const closeBtn = mask.querySelector('#morimensCodesClose');
    if (closeBtn) closeBtn.focus({ preventScroll: true });
  }

  function close() {
    const mask = $(MASK_ID);
    state.open = false;
    if (mask) mask.hidden = true;
    document.documentElement.style.overflow = '';
    const btn = $(BTN_ID);
    if (btn) btn.focus({ preventScroll: true });
  }

  /* ---------------------------------------------------------------- 复制 */

  async function copyCode(code, btn) {
    if (!code) return;
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(code);
        ok = true;
      }
    } catch (e) { ok = false; }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = code;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        ta.remove();
      } catch (e) { ok = false; }
    }

    if (btn) {
      const prev = btn.textContent;
      btn.textContent = ok ? ui('已复制', 'Copied') : ui('复制失败', 'Failed');
      btn.classList.toggle('isDone', ok);
      setTimeout(() => {
        btn.textContent = prev;
        btn.classList.remove('isDone');
      }, 1600);
    }
    if (ok) toast(ui('兑换码已复制', 'Code copied'));
  }

  let toastTimer = 0;
  function toast(text) {
    let el = document.getElementById('morimensCodesToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'morimensCodesToast';
      el.className = 'mcodeToast';
      document.body.appendChild(el);
    }
    el.textContent = text;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), 1800);
  }

  /* ---------------------------------------------------------------- 启动 */

  function boot() {
    ensureButton();
    fetchCodes(true);
    window.addEventListener('morimens-language-change', syncLabel);
    // 支持直达链接：…/morimens-tools.html#codes 打开即弹出清单
    if (location.hash === '#codes') setTimeout(open, 60);
    // 倒计时与过期清理：弹窗打开时每 30 秒重绘一次
    setInterval(() => {
      if (!state.data) return;
      if (state.open) render();
      else updateBadge();
      if (state.open && Date.now() - state.lastFetch > REFETCH_MS) fetchCodes(true);
    }, TICK_MS);
    // 从后台切回时补一次
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - state.lastFetch > REFETCH_MS) fetchCodes(true);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

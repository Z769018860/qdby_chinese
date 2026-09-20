(() => {
  const VERSION = '20260921.1';
  const PAGE_SIZE = 10;
  const ROOT_SELECTOR = '#waline';

  let root = null;
  let currentPage = 1;
  let lastTopLevelCount = 0;
  let observer = null;
  let renderQueued = false;
  let loadingNextPage = false;

  function injectStyle() {
    if (document.getElementById('qdbyWalinePaginationStyle')) return;
    const style = document.createElement('style');
    style.id = 'qdbyWalinePaginationStyle';
    style.textContent = `
      #waline .wl-cards > .wl-card[hidden]{display:none!important}
      #waline .qdby-waline-native-more{display:none!important}
      #waline .qdby-waline-pager{
        display:flex;
        align-items:center;
        justify-content:center;
        gap:8px;
        flex-wrap:wrap;
        margin:16px 0 8px;
        padding:10px 12px;
        border:1px solid var(--waline-border-color,#e2e8f0);
        border-radius:12px;
        background:var(--waline-bg-color-light,#f8fafc);
      }
      #waline .qdby-waline-pager[hidden]{display:none!important}
      #waline .qdby-waline-page-btn{
        appearance:none;
        min-width:34px;
        height:32px;
        padding:0 10px;
        border:1px solid var(--waline-border-color,#d7deea);
        border-radius:8px;
        background:var(--waline-bg-color,#fff);
        color:var(--waline-color,#374151);
        font:600 12px/1 inherit;
        cursor:pointer;
      }
      #waline .qdby-waline-page-btn:hover:not(:disabled){
        border-color:var(--waline-theme-color,#334155);
        color:var(--waline-active-color,#111827);
      }
      #waline .qdby-waline-page-btn:disabled{
        opacity:.42;
        cursor:not-allowed;
      }
      #waline .qdby-waline-page-number.is-active{
        border-color:var(--waline-theme-color,#334155);
        background:var(--waline-theme-color,#334155);
        color:#fff;
      }
      #waline .qdby-waline-page-info{
        color:var(--waline-info-color,#64748b);
        font-size:11px;
        white-space:nowrap;
      }
      @media(max-width:640px){
        #waline .qdby-waline-pager{gap:6px;padding:9px 8px}
        #waline .qdby-waline-page-btn{min-width:32px;height:30px;padding:0 8px;font-size:11px}
        #waline .qdby-waline-page-info{width:100%;text-align:center;order:-1}
      }
    `;
    document.head.appendChild(style);
  }

  function cardsContainer() {
    return root?.querySelector('.wl-cards') || null;
  }

  function topLevelCards() {
    const container = cardsContainer();
    return container ? [...container.children].filter((node) => node.classList?.contains('wl-card')) : [];
  }

  function totalComments() {
    const raw = root?.querySelector('.wl-count .wl-num')?.textContent || '';
    const count = Number(String(raw).replace(/[^0-9]/g, ''));
    return Number.isFinite(count) && count > 0 ? count : topLevelCards().length;
  }

  function totalPages() {
    return Math.max(1, Math.ceil(totalComments() / PAGE_SIZE));
  }

  function nativeMoreOperation() {
    const container = cardsContainer();
    if (!container) return null;

    let next = container.nextElementSibling;
    while (next) {
      if (next.classList?.contains('wl-meta-foot')) break;
      if (next.classList?.contains('wl-operation') && next.querySelector('.wl-btn')) return next;
      if (next.classList?.contains('qdby-waline-pager')) {
        next = next.nextElementSibling;
        continue;
      }
      next = next.nextElementSibling;
    }
    return null;
  }

  function nativeMoreButton() {
    const operation = nativeMoreOperation();
    if (!operation) return null;
    const button = operation.querySelector('.wl-btn');
    if (!button) return null;

    const label = String(button.textContent || '').trim();
    if (/刷新|refresh/i.test(label)) return null;
    return button;
  }

  function buildPager() {
    let pager = root?.querySelector('.qdby-waline-pager');
    if (pager) return pager;

    const container = cardsContainer();
    if (!container) return null;

    pager = document.createElement('nav');
    pager.className = 'qdby-waline-pager';
    pager.setAttribute('aria-label', '留言分页');
    pager.innerHTML = `
      <button type="button" class="qdby-waline-page-btn" data-page-prev>上一页</button>
      <div class="qdby-waline-page-numbers" aria-label="页码"></div>
      <button type="button" class="qdby-waline-page-btn" data-page-next>下一页</button>
      <span class="qdby-waline-page-info"></span>
    `;

    pager.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button || button.disabled) return;

      if (button.hasAttribute('data-page-prev')) {
        goToPage(currentPage - 1);
        return;
      }
      if (button.hasAttribute('data-page-next')) {
        goToPage(currentPage + 1);
        return;
      }
      if (button.dataset.pageNumber) {
        goToPage(Number(button.dataset.pageNumber));
      }
    });

    container.insertAdjacentElement('afterend', pager);
    return pager;
  }

  function pageButtonsHTML(pageCount) {
    if (pageCount <= 1) return '';

    const pages = [];
    const add = (value) => {
      if (!pages.includes(value) && value >= 1 && value <= pageCount) pages.push(value);
    };

    add(1);
    add(currentPage - 2);
    add(currentPage - 1);
    add(currentPage);
    add(currentPage + 1);
    add(currentPage + 2);
    add(pageCount);
    pages.sort((a, b) => a - b);

    let html = '';
    let previous = 0;
    for (const page of pages) {
      if (previous && page - previous > 1) {
        html += '<span class="qdby-waline-page-info" aria-hidden="true">…</span>';
      }
      html += `<button type="button" class="qdby-waline-page-btn qdby-waline-page-number${page === currentPage ? ' is-active' : ''}" data-page-number="${page}" aria-current="${page === currentPage ? 'page' : 'false'}">${page}</button>`;
      previous = page;
    }
    return html;
  }

  function renderPager() {
    if (!root) return;

    const cards = topLevelCards();
    const count = totalComments();
    const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));

    if (cards.length < lastTopLevelCount) currentPage = 1;
    lastTopLevelCount = cards.length;
    if (currentPage > pages) currentPage = pages;
    if (currentPage < 1) currentPage = 1;

    const start = (currentPage - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    cards.forEach((card, index) => {
      card.hidden = !(index >= start && index < end);
    });

    const nativeOperation = nativeMoreOperation();
    if (nativeOperation) nativeOperation.classList.add('qdby-waline-native-more');

    const pager = buildPager();
    if (!pager) return;

    pager.hidden = count <= PAGE_SIZE;
    const prev = pager.querySelector('[data-page-prev]');
    const next = pager.querySelector('[data-page-next]');
    const numbers = pager.querySelector('.qdby-waline-page-numbers');
    const info = pager.querySelector('.qdby-waline-page-info');

    if (prev) prev.disabled = currentPage <= 1 || loadingNextPage;
    if (next) next.disabled = currentPage >= pages || loadingNextPage;
    if (numbers) numbers.innerHTML = pageButtonsHTML(pages);
    if (info) info.textContent = `第 ${currentPage} / ${pages} 页 · 每页 ${PAGE_SIZE} 条`;
  }

  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      renderPager();
    });
  }

  function waitForMore(beforeCount, timeout = 5000) {
    return new Promise((resolve) => {
      const started = Date.now();
      const check = () => {
        const now = topLevelCards().length;
        if (now > beforeCount || !nativeMoreButton() || Date.now() - started >= timeout) {
          resolve(now);
          return;
        }
        setTimeout(check, 70);
      };
      check();
    });
  }

  async function ensurePageLoaded(targetPage) {
    const need = Math.min(totalComments(), targetPage * PAGE_SIZE);
    let cards = topLevelCards();

    while (cards.length < need) {
      const button = nativeMoreButton();
      if (!button) break;

      const before = cards.length;
      loadingNextPage = true;
      renderPager();
      button.click();
      await waitForMore(before);
      cards = topLevelCards();

      if (cards.length <= before) break;
    }

    loadingNextPage = false;
  }

  async function goToPage(targetPage) {
    const pages = totalPages();
    const target = Math.max(1, Math.min(Number(targetPage) || 1, pages));
    if (target === currentPage && !loadingNextPage) return;

    await ensurePageLoaded(target);
    currentPage = target;
    renderPager();

    const head = root?.querySelector('.wl-meta-head');
    if (head) {
      const rect = head.getBoundingClientRect();
      if (rect.top < 0 || rect.top > window.innerHeight * 0.72) {
        head.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  function mutationIsRelevant(mutation) {
    const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
    if (target?.closest?.('.qdby-waline-pager')) return false;
    if (target?.closest?.('.wl-cards')) return true;
    if (target?.closest?.('.wl-count')) return true;

    return [...mutation.addedNodes, ...mutation.removedNodes].some((node) => {
      if (!(node instanceof Element)) return false;
      return node.matches?.('.wl-cards,.wl-card,.wl-count,.wl-operation,.wl-loading') ||
        Boolean(node.querySelector?.('.wl-cards,.wl-card,.wl-count,.wl-operation'));
    });
  }

  function attach() {
    root = document.querySelector(ROOT_SELECTOR);
    if (!root) return false;

    injectStyle();
    observer?.disconnect();
    observer = new MutationObserver((mutations) => {
      if (mutations.some(mutationIsRelevant)) queueRender();
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });

    const waitForWaline = () => {
      if (cardsContainer()) {
        queueRender();
        return;
      }
      setTimeout(waitForWaline, 100);
    };
    waitForWaline();
    return true;
  }

  function boot() {
    if (attach()) return;
    const timer = setInterval(() => {
      if (attach()) clearInterval(timer);
    }, 200);
    setTimeout(() => clearInterval(timer), 15000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  window.QDBYWalinePagination = {
    version: VERSION,
    pageSize: PAGE_SIZE,
    refresh: queueRender,
    goToPage,
    currentPage: () => currentPage,
    disconnect: () => observer?.disconnect(),
  };
})();

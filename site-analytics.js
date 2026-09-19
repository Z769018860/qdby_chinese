(() => {
  const SERVER_URL = 'https://textbox.qingdengbuyi.top/';
  const TOTAL_PATH = '/__qdby_site_views__/total';

  function shanghaiDateKey() {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}`;
  }

  const TODAY_PATH = `/__qdby_site_views__/day/${shanghaiDateKey()}`;

  function ensureTarget(selector, path) {
    let target = document.querySelector(selector);
    if (!target) {
      target = document.createElement('span');
      target.className = selector.replace(/^\./, '');
      target.hidden = true;
      document.body.appendChild(target);
    }
    document.querySelectorAll(selector).forEach((el) => {
      el.dataset.path = path;
      if (!el.textContent.trim()) el.textContent = '—';
    });
  }

  async function boot() {
    ensureTarget('.site-visit-total-count', TOTAL_PATH);
    ensureTarget('.site-visit-today-count', TODAY_PATH);

    try {
      const { pageviewCount } = await import('https://unpkg.com/@waline/client@v3/dist/pageview.js');
      pageviewCount({
        serverURL: SERVER_URL,
        path: TOTAL_PATH,
        selector: '.site-visit-total-count',
        update: true,
      });
      pageviewCount({
        serverURL: SERVER_URL,
        path: TODAY_PATH,
        selector: '.site-visit-today-count',
        update: true,
      });
    } catch (error) {
      console.error('Site visit counter failed:', error);
      document.querySelectorAll('.site-visit-total-count,.site-visit-today-count').forEach((el) => {
        if (!el.hidden) el.textContent = '—';
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();

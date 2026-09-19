(() => {
  const SERVER_URL = 'https://textbox.qingdengbuyi.top';
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
  const API_URL = `${SERVER_URL}/api/article`;

  function ensureTarget(selector) {
    let target = document.querySelector(selector);
    if (!target) {
      target = document.createElement('span');
      target.className = selector.replace(/^\./, '');
      target.hidden = true;
      document.body.appendChild(target);
    }
    return Array.from(document.querySelectorAll(selector));
  }

  function render(selector, value) {
    for (const el of ensureTarget(selector)) {
      el.textContent = Number.isFinite(Number(value)) ? String(Number(value)) : '—';
    }
  }

  function extractTime(payload) {
    if (payload && payload.errno) throw new Error(payload.errmsg || `Waline errno ${payload.errno}`);
    const data = payload?.data;
    if (Array.isArray(data) && data.length) {
      const time = Number(data[0]?.time);
      if (Number.isFinite(time)) return time;
    }
    if (data && typeof data === 'object') {
      const time = Number(data.time);
      if (Number.isFinite(time)) return time;
    }
    throw new Error('Waline pageview response has no time field');
  }

  async function increment(path) {
    const response = await fetch(`${API_URL}?lang=zh-CN`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, type: 'time', action: 'inc' }),
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Waline pageview HTTP ${response.status}`);
    return extractTime(await response.json());
  }

  async function boot() {
    ensureTarget('.site-visit-total-count');
    ensureTarget('.site-visit-today-count');

    try {
      const [total, today] = await Promise.all([
        increment(TOTAL_PATH),
        increment(TODAY_PATH),
      ]);
      render('.site-visit-total-count', total);
      render('.site-visit-today-count', today);
    } catch (error) {
      console.error('Site visit counter failed:', error);
      render('.site-visit-total-count', NaN);
      render('.site-visit-today-count', NaN);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();

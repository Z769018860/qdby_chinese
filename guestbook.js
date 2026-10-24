// 通用留言板挂载（Waline）：汉化站内联区与视频站弹窗共用同一套逻辑
export const WALINE_SERVER = 'https://textbox.qingdengbuyi.top';

export async function resolveGuestbookPath(){
  try{
    const response = await fetch(`${WALINE_SERVER}/api/comment?type=recent&count=50`, { cache: 'no-store' });
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if(payload && payload.errno) throw new Error(payload.errmsg || `Waline errno ${payload.errno}`);
    const rows = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.data?.data) ? payload.data.data : [];
    const counts = new Map();
    for(const row of rows){
      const path = String(row?.url || row?.path || '').trim();
      if(!path || path.startsWith('/__qdby_site_views__/') || path.startsWith('/__morimens_assist_submissions__/')) continue;
      counts.set(path, (counts.get(path) || 0) + 1);
    }
    const preferred = ['/', '/index.html', '/guestbook', '/comments', '/message'];
    for(const path of preferred){ if(counts.has(path)) return path; }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '/';
  }catch(error){
    console.warn('Waline guestbook path discovery failed, fallback to /', error);
    return '/';
  }
}

function ensureWalineCss(){
  if(document.querySelector('link[data-waline-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/@waline/client@v3/dist/waline.css';
  link.dataset.walineCss = '1';
  document.head.appendChild(link);
}

/**
 * 把 Waline 挂到某个容器上
 * @param {object} opts
 * @param {string} opts.el         容器选择器或元素
 * @param {Element} [opts.fallbackEl] 失败时显示提示的元素
 * @returns {Promise<boolean>} 是否挂载成功
 */
export async function mountGuestbook({ el, fallbackEl } = {}){
  const root = typeof el === 'string' ? document.querySelector(el) : el;
  if(!root) return false;
  if(root.dataset.walineMounted === '1') return true;
  root.dataset.walineMounted = '1';

  const fail = (error) => {
    console.error('Waline load failed:', error);
    root.hidden = true;
    if(fallbackEl){
      fallbackEl.innerHTML = '留言板连接失败。<a href="https://textbox.qingdengbuyi.top/" target="_blank" rel="noopener noreferrer">打开原留言板</a>';
      fallbackEl.classList.add('warn');
      fallbackEl.hidden = false;
    }
  };

  ensureWalineCss();

  try{
    const [{ init }, { MORIMENS_EMOJI_PRESET }, guestbookPath] = await Promise.all([
      import('https://unpkg.com/@waline/client@v3/dist/waline.js'),
      import('./waline-morimens-emoji.js?v=20260920.2'),
      resolveGuestbookPath(),
    ]);
    // 结构 IMG 也可能被 lazysizes 之类处理过，这里只做最基础初始化
    init({
      el: root,
      serverURL: WALINE_SERVER,
      path: guestbookPath,
      lang: 'zh-CN',
      emoji: [MORIMENS_EMOJI_PRESET],
      meta: ['nick', 'mail', 'link'],
      requiredMeta: [],
      login: 'disable',
      wordLimit: 300,
      pageSize: 10,
      commentSorting: 'latest',
    });
    return true;
  }catch(error){
    root.dataset.walineMounted = '';
    fail(error);
    return false;
  }
}

/** 延后到浏览器空闲再挂载，给表格/卡片首屏让路 */
export function mountGuestbookWhenIdle(opts, timeout = 3000){
  if('requestIdleCallback' in window){
    requestIdleCallback(() => { mountGuestbook(opts); }, { timeout });
  }else{
    setTimeout(() => { mountGuestbook(opts); }, 1500);
  }
}

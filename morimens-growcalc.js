/* 忘忘看报 · 角色培养计算器
   页面本体是独立文件 morimens-growcalc.html（自带浅色主题、样式与全量数据），
   这里只负责注册一个标签页、用 iframe 嵌进去：
   它的 body/table 重置与浅色底一旦直接并进忘忘看报，会把深色界面整体带偏；
   iframe 里还能保留它自己的三条子页签（角色计算 / 密契转录 / 数据表）和框内滚动。
   首次点开标签才真正加载 iframe，省一次 ~280KB 的请求。 */
(() => {
  const $ = id => document.getElementById(id);
  const VER = '20261126.1';
  const SRC = `morimens-growcalc.html?v=${VER}`;

  function ensureStyle() {
    if ($('morimensGrowStyle')) return;
    const s = document.createElement('style');
    s.id = 'morimensGrowStyle';
    s.textContent = `
      .growBar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:14px}
      .growBar a.ghostBtn{display:inline-flex;align-items:center;text-decoration:none}
      .growFrameWrap{margin-top:12px;border:1px solid rgba(197,211,229,.2);border-radius:16px;overflow:hidden;background:#f6f7fb;box-shadow:0 16px 40px rgba(0,0,0,.3)}
      .growFrame{display:block;width:100%;height:calc(100vh - 268px);min-height:620px;border:0;background:#f6f7fb}
      .growTip{margin:10px 2px 0;font-size:11.5px;line-height:1.7;color:#8b98ad}
      .growTip b{color:#e0bd82;font-weight:700}
      @media(max-width:900px){.growFrame{height:calc(100vh - 210px);min-height:560px}}
      @media(max-width:580px){.growFrame{height:calc(100vh - 180px);min-height:520px}.growBar{gap:6px}}
    `;
    document.head.appendChild(s);
  }

  function panelHtml() {
    return `
      <section class="panel" aria-labelledby="growTitle">
        <div class="panelHead">
          <div><p class="eyebrow">GROWTH · COST &amp; TRINKET</p><h2 id="growTitle">角色培养计算器</h2>
            <p class="panelLead">选角色、拉起止练度，算出要多少材料、折多少券、刷多少体力；密契转录页可以看档位权重与「运气偏差」对单席命中率、期望次数的影响。</p></div>
          <span class="statusPill">材料 · 体力 · 密契</span>
        </div>
        <div class="growBar">
          <a class="ghostBtn" href="${SRC}" target="_blank" rel="noopener">在新窗口打开</a>
          <button class="ghostBtn" type="button" id="growReload">重新载入</button>
        </div>
        <div class="growFrameWrap"><iframe class="growFrame" id="growFrame" title="角色培养计算器" data-src="${SRC}" loading="lazy"></iframe></div>
        <p class="growTip">框内是独立页面、独立滚动；手机屏小的话，点<b>在新窗口打开</b>可以直接全屏用。</p>
      </section>`;
  }

  /* 首次进站时的 hash。dtide 建标签时会把 hash 改写成 #dtide，所以要取 navigation 记录里的原始 URL */
  function initialHash() {
    try {
      const n = performance.getEntriesByType('navigation')[0];
      if (n && n.name) return new URL(n.name).hash;
    } catch (e) { /* ignore */ }
    return location.hash;
  }

  let tries = 0;
  function boot() {
    if (!window.MorimensTabs) {                     // 等 dtide 把标签系统搭好
      if (tries++ < 60) setTimeout(boot, 250);
      return;
    }
    if ($('morimensGrowPanel')) return;
    ensureStyle();
    const panel = document.createElement('div');
    panel.id = 'morimensGrowPanel';
    panel.setAttribute('role', 'tabpanel');
    panel.hidden = true;
    panel.innerHTML = panelHtml();
    const ui = window.MorimensTabs.ui || (zh => zh);
    const entry = window.MorimensTabs.add({ name: 'growcalc', label: ui('培养计算器', 'Growth Calc'), panel });
    const frame = $('growFrame');
    const load = () => { if (frame && !frame.getAttribute('src')) frame.setAttribute('src', frame.dataset.src); };
    if (entry && entry.tab) entry.tab.addEventListener('click', load);
    const reload = $('growReload');
    if (reload) reload.addEventListener('click', () => { if (frame) frame.setAttribute('src', SRC + '&t=' + Date.now()); });
    if (initialHash() === '#growcalc') { load(); window.MorimensTabs.activate('growcalc'); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0));
  else setTimeout(boot, 0);
})();

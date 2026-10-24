// ==UserScript==
// @name         青灯不弈 · 一键三连
// @namespace    https://github.com/Z769018860/qdby_chinese
// @version      1.0.0
// @description  在视频站（qdby_chinese）点「三连」后，到 B 站视频页自动点赞 + 投币 + 收藏。也可在任何 B 站视频页手动按下 Alt+3 触发。
// @author       qdby_chinese
// @match        https://www.bilibili.com/video/*
// @match        https://qdby-chinese.vercel.app/*
// @match        https://*.vercel.app/*
// @match        http://localhost/*
// @match        http://127.0.0.1/*
// @grant        none
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  // ---------- 在视频站里只做一件事：告诉页面「脚本已装」 ----------
  if (!/(^|\.)bilibili\.com$/.test(location.hostname)) {
    try {
      localStorage.setItem('qdby_triple_installed', '1');
    } catch (e) {}
    window.__QDBY_TRIPLE__ = '1.0.0';
    document.documentElement.setAttribute('data-qdby-triple', 'on');
    return;
  }

  // ---------- B 站页内：真正干活 ----------
  const API = 'https://api.bilibili.com';
  const qs = new URLSearchParams(location.search);

  const cookie = (k) => {
    const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + k + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  };

  const getJSON = async (url) => {
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  };

  const post = async (url, body) => {
    const r = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  };

  // 结果面板
  function panel() {
    let el = document.getElementById('qdby-triple-panel');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'qdby-triple-panel';
    el.style.cssText = [
      'position:fixed', 'right:20px', 'bottom:24px', 'z-index:2147483000',
      'min-width:210px', 'padding:12px 14px', 'border-radius:12px',
      'background:rgba(23,26,33,.94)', 'color:#eaeef5', 'font-size:13px',
      'line-height:1.7', 'box-shadow:0 10px 30px rgba(0,0,0,.35)',
      'backdrop-filter:blur(6px)', 'transition:opacity .3s, transform .3s',
      'font-family:-apple-system,"Segoe UI","Microsoft YaHei",sans-serif',
    ].join(';');
    el.innerHTML = '<div style="font-weight:600;margin-bottom:6px">青灯不弈 · 一键三连</div><div id="qdby-triple-lines"></div>';
    document.body.appendChild(el);
    return el;
  }

  function line(icon, text, ok) {
    const box = document.getElementById('qdby-triple-lines');
    if (!box) return;
    const d = document.createElement('div');
    d.style.cssText = 'display:flex;gap:6px;align-items:flex-start;color:' + (ok ? '#7ee0a8' : '#ffb4a8');
    d.textContent = icon + ' ' + text;
    box.appendChild(d);
  }

  function closeSoon(ms) {
    setTimeout(() => {
      const el = document.getElementById('qdby-triple-panel');
      if (el) {
        el.style.opacity = '0';
        el.style.transform = 'translateY(6px)';
        setTimeout(() => el.remove(), 350);
      }
    }, ms);
  }

  const COIN_ERR = {
    '-104': '没有硬币了',
    '-111': 'CSRF 校验失败，请刷新页面',
    '-101': '未登录，请先登录 B 站',
    '34005': '已经投过币了',
    '34003': '不能给自己的稿件投币',
    '34004': '投币数不合法',
  };

  async function triple(bvid) {
    panel();
    const csrf = cookie('bili_jct');
    if (!csrf) {
      line('✕', '未登录：请先在 B 站登录，再回到这里', false);
      line('→', '登录后刷新本页即可');
      closeSoon(9000);
      return { ok: false, reason: 'not-login' };
    }

    const nav = await getJSON(API + '/x/web-interface/nav').catch(() => null);
    if (!nav || !nav.data || !nav.data.isLogin) {
      line('✕', '登录态已失效，请重新登录 B 站', false);
      closeSoon(9000);
      return { ok: false, reason: 'nav' };
    }

    const view = await getJSON(API + '/x/web-interface/view?bvid=' + bvid).catch(() => null);
    if (!view || view.code !== 0) {
      line('✕', '取稿件信息失败', false);
      closeSoon(9000);
      return { ok: false, reason: 'view' };
    }
    const aid = view.data.aid;
    let done = 0;

    // 1. 点赞
    try {
      const r = await post(API + '/x/web-interface/archive/like', { bvid, like: 1, csrf });
      if (r.code === 0) { line('♥', '已点赞', true); done++; }
      else if (r.code === 65006) { line('♥', '之前就点过赞了', true); done++; }
      else line('♥', '点赞失败：' + (r.message || r.code), false);
    } catch (e) {
      line('♥', '点赞失败：' + e.message, false);
    }

    // 2. 投币（1 枚）
    try {
      const r = await post(API + '/x/web-interface/coin/add', {
        bvid, multiply: 1, select_like: 0, csrf,
      });
      if (r.code === 0) { line('◉', '已投 1 枚硬币', true); done++; }
      else if (r.code === 34005 || r.code === 34006) { line('◉', '之前就投过币了', true); done++; }
      else line('◉', '投币失败：' + (COIN_ERR[r.code] || r.message || r.code), false);
    } catch (e) {
      line('◉', '投币失败：' + e.message, false);
    }

    // 3. 收藏（收进默认收藏夹）
    try {
      const fl = await getJSON(API + '/x/v3/fav/folder/created/list-all?up_mid=' + nav.data.mid);
      const list = (fl && fl.data && fl.data.list) || [];
      if (!list.length) {
        line('★', '没有可用的收藏夹，跳过', false);
      } else {
        const fid = list[0].id;
        const r = await post(API + '/x/v3/fav/resource/deal', {
          rid: aid, type: 2, add_media_ids: fid, del_media_ids: '', csrf,
        });
        if (r.code === 0) { line('★', '已收藏到「' + list[0].title + '」', true); done++; }
        else if (/已收藏|重复/.test(r.message || '')) { line('★', '之前就收藏过了', true); done++; }
        else line('★', '收藏失败：' + (r.message || r.code), false);
      }
    } catch (e) {
      line('★', '收藏失败：' + e.message, false);
    }

    line(done >= 3 ? '✓' : '·', done >= 3 ? '三连完成，感谢支持！' : '完成 ' + done + '/3 项', done >= 3);
    closeSoon(6500);
    return { ok: done >= 3, done };
  }

  // 站内按钮 → 跳转时带了参数
  function currentBV() {
    const m = location.pathname.match(/\/video\/(BV[0-9A-Za-z]{10})/);
    return m ? m[1] : '';
  }

  if (qs.get('qdby_triple') === '1') {
    const bv = currentBV();
    if (bv) setTimeout(() => triple(bv), 1200);
  }

  // 手动触发：Alt+3
  document.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === '3' || e.code === 'Digit3')) {
      const bv = currentBV();
      if (bv) triple(bv);
    }
  });

  window.__qdbyTriple = triple;
})();

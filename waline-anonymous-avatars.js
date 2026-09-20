(() => {
  const VERSION = '20260921.1';
  const STORAGE_KEY = 'qdby.waline.avatar.v1';
  const script = document.currentScript;
  const scriptURL = script?.src || new URL('waline-anonymous-avatars.js', location.href).href;
  const manifestURL = new URL(`assets/waline-avatars/manifest.json?v=${VERSION}`, scriptURL);
  const avatarBaseURL = new URL('assets/waline-avatars/', scriptURL);
  const ROOT_SELECTORS = ['#waline', '#morimensWaline'];
  const TOKEN_RE = /\u2063\u2062([\u200B\u200C]+)\u2062\u2063/g;
  let avatarURLs = [];
  let avatarFiles = [];
  let selectedIndex = null;
  let selectionPersisted = false;
  let observer = null;
  let scanQueued = false;
  let picker = null;

  function hashString(value) {
    let hash = 2166136261;
    const text = String(value || '');
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function randomIndex() {
    if (!avatarURLs.length) return 0;
    try {
      const values = new Uint32Array(1);
      crypto.getRandomValues(values);
      return values[0] % avatarURLs.length;
    } catch {
      return Math.floor(Math.random() * avatarURLs.length);
    }
  }

  function normalizeNickname(value) {
    const nick = String(value || '')
      .replace(TOKEN_RE, '')
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .trim();
    return nick || '匿名';
  }

  function tokenForIndex(index) {
    const bits = (Number(index) + 1).toString(2)
      .replace(/0/g, '\u200B')
      .replace(/1/g, '\u200C');
    return `\u2063\u2062${bits}\u2062\u2063`;
  }

  function decodeAvatarToken(value) {
    const text = String(value || '');
    let found = null;
    text.replace(TOKEN_RE, (_match, bits) => {
      const binary = [...bits].map((char) => char === '\u200C' ? '1' : '0').join('');
      const decoded = parseInt(binary, 2) - 1;
      if (Number.isInteger(decoded) && decoded >= 0) found = decoded;
      return '';
    });
    return {
      nickname: normalizeNickname(text),
      index: found,
    };
  }

  function storedIndex() {
    try {
      const value = Number(localStorage.getItem(STORAGE_KEY));
      return Number.isInteger(value) && value >= 0 && value < avatarURLs.length ? value : null;
    } catch {
      return null;
    }
  }

  function persistSelection(index) {
    selectionPersisted = true;
    selectedIndex = index;
    try { localStorage.setItem(STORAGE_KEY, String(index)); } catch {}
    updatePickerPreview();
  }

  function commentItem(image) {
    return image.closest('.wl-card-item');
  }

  function rawNickname(image) {
    const item = commentItem(image);
    return String(item?.querySelector('.wl-nick')?.textContent || '');
  }

  function getNickname(image) {
    return decodeAvatarToken(rawNickname(image)).nickname;
  }

  function isAdministrator(image) {
    const user = image.closest('.wl-user');
    return Boolean(user?.querySelector('.administrator-icon'));
  }

  function collectAnonymousImages() {
    const seen = new Set();
    const result = [];
    for (const selector of ROOT_SELECTORS) {
      const host = document.querySelector(selector);
      if (!host) continue;
      host.querySelectorAll('.wl-card-item .wl-user-avatar').forEach((image) => {
        if (!(image instanceof HTMLImageElement) || seen.has(image) || isAdministrator(image)) return;
        seen.add(image);
        result.push(image);
      });
    }
    return result;
  }

  function avatarIndexForImage(image) {
    const decoded = decodeAvatarToken(rawNickname(image));
    if (Number.isInteger(decoded.index) && decoded.index >= 0 && decoded.index < avatarURLs.length) {
      return decoded.index;
    }
    return hashString(`qdby-waline-nickname:${decoded.nickname}`) % avatarURLs.length;
  }

  function applyImage(image, index) {
    const next = avatarURLs[index];
    if (!next) return;
    if (image.getAttribute('src') !== next) image.setAttribute('src', next);
    if (image.srcset) image.removeAttribute('srcset');
    const decoded = decodeAvatarToken(rawNickname(image));
    image.dataset.qdbyAnonymousAvatar = 'true';
    image.dataset.qdbyAvatarNickname = decoded.nickname;
    image.dataset.qdbyAvatarIndex = String(index);
    image.dataset.qdbyAvatarVersion = VERSION;
    image.referrerPolicy = 'no-referrer';
    image.alt = decoded.nickname;
  }

  function assignAvatars() {
    if (!avatarURLs.length) return;
    for (const image of collectAnonymousImages()) {
      applyImage(image, avatarIndexForImage(image));
    }
  }

  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(() => {
      scanQueued = false;
      assignAvatars();
      ensurePickerMounted();
    });
  }

  function findNickInput(host) {
    if (!host) return null;
    const exact = host.querySelector('input[name="nick"], input[autocomplete="nickname"]');
    if (exact) return exact;
    const metaInputs = [...host.querySelectorAll('.wl-meta input, .wl-header input')];
    return metaInputs.find((input) => /昵称|nick/i.test(input.placeholder || input.getAttribute('aria-label') || ''))
      || metaInputs[0]
      || null;
  }

  function prepareNicknameForSubmit(host) {
    if (!avatarURLs.length || !Number.isInteger(selectedIndex)) return;
    const input = findNickInput(host);
    if (!input) return;
    const current = normalizeNickname(input.value);
    const next = `${current}${tokenForIndex(selectedIndex)}`;
    if (input.value !== next) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(input, next);
      else input.value = next;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    persistSelection(selectedIndex);
  }

  function installSubmitBridge(host) {
    if (!host || host.dataset.qdbyAvatarSubmitBridge === VERSION) return;
    host.dataset.qdbyAvatarSubmitBridge = VERSION;

    host.addEventListener('pointerdown', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      const label = String(button.textContent || '').trim();
      if (/提交|发布|发送|submit|post|send/i.test(label)) prepareNicknameForSubmit(host);
    }, true);

    host.addEventListener('click', (event) => {
      const button = event.target.closest('button');
      if (!button) return;
      const label = String(button.textContent || '').trim();
      if (/提交|发布|发送|submit|post|send/i.test(label)) prepareNicknameForSubmit(host);
    }, true);

    host.addEventListener('submit', () => prepareNicknameForSubmit(host), true);
    host.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) prepareNicknameForSubmit(host);
    }, true);
  }

  function updatePickerPreview() {
    if (!picker || !avatarURLs.length || !Number.isInteger(selectedIndex)) return;
    const image = picker.querySelector('.qdby-avatar-current img');
    const text = picker.querySelector('.qdby-avatar-current span');
    if (image) image.src = avatarURLs[selectedIndex];
    if (text) text.textContent = selectionPersisted ? '已选择头像' : '本次随机头像';
    picker.querySelectorAll('[data-avatar-index]').forEach((button) => {
      button.classList.toggle('is-selected', Number(button.dataset.avatarIndex) === selectedIndex);
    });
  }

  function closeAvatarDialog() {
    picker?.querySelector('.qdby-avatar-dialog')?.classList.remove('is-open');
  }

  function openAvatarDialog() {
    picker?.querySelector('.qdby-avatar-dialog')?.classList.add('is-open');
  }

  function buildPicker() {
    if (picker) return picker;
    const root = document.createElement('div');
    root.className = 'qdby-avatar-picker';
    root.innerHTML = `
      <style>
        .qdby-avatar-picker{margin:0 0 14px;font-family:inherit;color:var(--waline-color,#d8dee9)}
        .qdby-avatar-current{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid rgba(224,189,130,.25);border-radius:14px;background:rgba(12,18,27,.48)}
        .qdby-avatar-current img{width:52px;height:52px;object-fit:cover;border-radius:50%;border:2px solid rgba(224,189,130,.6);background:#111827;flex:0 0 auto}
        .qdby-avatar-current-copy{display:flex;flex-direction:column;gap:3px;min-width:0}
        .qdby-avatar-current-copy b{font-size:13px;color:#ead7b5}
        .qdby-avatar-current-copy span{font-size:11px;color:#98a5b7}
        .qdby-avatar-actions{display:flex;gap:7px;margin-left:auto;flex-wrap:wrap;justify-content:flex-end}
        .qdby-avatar-btn{appearance:none;border:1px solid rgba(224,189,130,.28);border-radius:999px;background:rgba(224,189,130,.08);color:#e9d5b1;padding:7px 11px;cursor:pointer;font:inherit;font-size:12px}
        .qdby-avatar-btn:hover{border-color:rgba(224,189,130,.65);background:rgba(224,189,130,.14)}
        .qdby-avatar-dialog{position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(3,6,11,.72);backdrop-filter:blur(7px)}
        .qdby-avatar-dialog.is-open{display:flex}
        .qdby-avatar-panel{width:min(720px,100%);max-height:min(78vh,660px);display:flex;flex-direction:column;border:1px solid rgba(224,189,130,.28);border-radius:18px;background:#111722;box-shadow:0 24px 80px rgba(0,0,0,.55);overflow:hidden}
        .qdby-avatar-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid rgba(148,163,184,.16)}
        .qdby-avatar-panel-head b{font-size:15px;color:#f0dfbf}.qdby-avatar-panel-head small{display:block;margin-top:3px;color:#8f9cad;font-size:11px;font-weight:400}
        .qdby-avatar-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:9px;padding:14px;overflow:auto;overscroll-behavior:contain}
        .qdby-avatar-choice{appearance:none;aspect-ratio:1;border:1px solid rgba(148,163,184,.18);border-radius:12px;background:rgba(255,255,255,.025);padding:4px;cursor:pointer;overflow:hidden}
        .qdby-avatar-choice:hover{border-color:rgba(224,189,130,.55);transform:translateY(-1px)}
        .qdby-avatar-choice.is-selected{border:2px solid #e0bd82;box-shadow:0 0 0 2px rgba(224,189,130,.16)}
        .qdby-avatar-choice img{width:100%;height:100%;object-fit:cover;border-radius:8px;display:block}
        @media(max-width:520px){.qdby-avatar-current{align-items:flex-start}.qdby-avatar-actions{margin-left:0}.qdby-avatar-grid{grid-template-columns:repeat(4,1fr);gap:7px;padding:10px}}
      </style>
      <div class="qdby-avatar-current">
        <img alt="当前匿名头像">
        <div class="qdby-avatar-current-copy"><b>匿名头像</b><span>本次随机头像</span></div>
        <div class="qdby-avatar-actions">
          <button type="button" class="qdby-avatar-btn" data-avatar-random>随机一个</button>
          <button type="button" class="qdby-avatar-btn" data-avatar-open>选择头像</button>
        </div>
      </div>
      <div class="qdby-avatar-dialog" role="dialog" aria-modal="true" aria-label="选择匿名头像">
        <div class="qdby-avatar-panel">
          <div class="qdby-avatar-panel-head"><div><b>选择匿名头像</b><small>选择会保存在本浏览器；下次默认使用上次头像</small></div><button type="button" class="qdby-avatar-btn" data-avatar-close>关闭</button></div>
          <div class="qdby-avatar-grid"></div>
        </div>
      </div>
    `;
    const grid = root.querySelector('.qdby-avatar-grid');
    avatarURLs.forEach((url, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'qdby-avatar-choice';
      button.dataset.avatarIndex = String(index);
      button.title = avatarFiles[index] || `头像 ${index + 1}`;
      button.innerHTML = `<img src="${url}" alt="头像 ${index + 1}" loading="lazy">`;
      button.addEventListener('click', () => {
        persistSelection(index);
        closeAvatarDialog();
      });
      grid.appendChild(button);
    });
    root.querySelector('[data-avatar-open]').addEventListener('click', openAvatarDialog);
    root.querySelector('[data-avatar-close]').addEventListener('click', closeAvatarDialog);
    root.querySelector('[data-avatar-random]').addEventListener('click', () => {
      const next = randomIndex();
      selectedIndex = next;
      selectionPersisted = false;
      updatePickerPreview();
    });
    root.querySelector('.qdby-avatar-dialog').addEventListener('click', (event) => {
      if (event.target.classList.contains('qdby-avatar-dialog')) closeAvatarDialog();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeAvatarDialog();
    });
    picker = root;
    updatePickerPreview();
    return root;
  }

  function ensurePickerMounted() {
    if (!avatarURLs.length) return;
    for (const selector of ROOT_SELECTORS) {
      const host = document.querySelector(selector);
      if (!host) continue;
      installSubmitBridge(host);
      if (!host.parentNode) continue;
      const control = buildPicker();
      if (!control.isConnected) host.parentNode.insertBefore(control, host);
      break;
    }
  }

  function inspect() {
    return {
      version: VERSION,
      selectedIndex,
      selectionPersisted,
      storedIndex: storedIndex(),
      avatars: collectAnonymousImages().map((image) => ({
        nickname: getNickname(image),
        index: image.dataset.qdbyAvatarIndex || null,
        version: image.dataset.qdbyAvatarVersion || null,
        src: image.getAttribute('src'),
      })),
    };
  }

  async function loadPool() {
    try {
      const response = await fetch(manifestURL, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const manifest = await response.json();
      const files = Array.isArray(manifest?.avatars) ? manifest.avatars : [];
      avatarFiles = files.filter((name) => typeof name === 'string' && name.trim()).map((name) => name.trim());
      avatarURLs = avatarFiles.map((name) => new URL(encodeURIComponent(name), avatarBaseURL).href);
      if (!avatarURLs.length) throw new Error('Anonymous avatar pool is empty');

      const saved = storedIndex();
      selectionPersisted = saved != null;
      selectedIndex = saved ?? randomIndex();

      ensurePickerMounted();
      assignAvatars();

      observer = new MutationObserver((mutations) => {
        const relevant = mutations.some((mutation) => {
          if (mutation.type === 'childList') return mutation.addedNodes.length > 0;
          if (mutation.type === 'characterData') return true;
          if (mutation.type === 'attributes') {
            const target = mutation.target;
            return target instanceof HTMLImageElement &&
              target.classList.contains('wl-user-avatar') &&
              mutation.attributeName === 'src';
          }
          return false;
        });
        if (relevant) queueScan();
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['src'],
      });

      setTimeout(() => { ensurePickerMounted(); assignAvatars(); }, 250);
      setTimeout(() => { ensurePickerMounted(); assignAvatars(); }, 1000);
    } catch (error) {
      console.error('Waline anonymous avatar pool failed:', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadPool, { once: true });
  } else {
    loadPool();
  }

  window.QDBYWalineAnonymousAvatars = {
    version: VERSION,
    refresh: assignAvatars,
    inspect,
    choose: (index) => {
      const next = Number(index);
      if (!Number.isInteger(next) || next < 0 || next >= avatarURLs.length) return false;
      persistSelection(next);
      return true;
    },
    randomize: () => {
      selectedIndex = randomIndex();
      selectionPersisted = false;
      updatePickerPreview();
      return selectedIndex;
    },
    disconnect: () => observer?.disconnect(),
  };
})();

(() => {
  const VERSION = '20260920.5';
  const script = document.currentScript;
  const scriptURL = script?.src || new URL('waline-anonymous-avatars.js', location.href).href;
  const manifestURL = new URL(`assets/waline-avatars/manifest.json?v=${VERSION}`, scriptURL);
  const avatarBaseURL = new URL('assets/waline-avatars/', scriptURL);
  const ROOT_SELECTORS = ['#waline', '#morimensWaline'];
  let avatarURLs = [];
  let observer = null;
  let scanQueued = false;

  function hashString(value) {
    let hash = 2166136261;
    const text = String(value || '');
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function normalizeNickname(value) {
    const nick = String(value || '')
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .trim();
    return nick || '匿名';
  }

  function commentItem(image) {
    return image.closest('.wl-card-item');
  }

  function getNickname(image) {
    const item = commentItem(image);
    return normalizeNickname(item?.querySelector('.wl-nick')?.textContent);
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

  function avatarIndexForNickname(nickname) {
    return hashString(`qdby-waline-nickname:${nickname}`) % avatarURLs.length;
  }

  function applyImage(image, nickname, index) {
    const next = avatarURLs[index];
    if (!next) return;

    // Vue may rewrite src when the comment card re-renders. Keep the custom
    // avatar authoritative and remove srcset so the browser cannot choose
    // Waline's original avatar candidate.
    if (image.getAttribute('src') !== next) image.setAttribute('src', next);
    if (image.srcset) image.removeAttribute('srcset');

    image.dataset.qdbyAnonymousAvatar = 'true';
    image.dataset.qdbyAvatarNickname = nickname;
    image.dataset.qdbyAvatarIndex = String(index);
    image.dataset.qdbyAvatarVersion = VERSION;
    image.referrerPolicy = 'no-referrer';
  }

  function assignAvatars() {
    if (!avatarURLs.length) return;

    for (const image of collectAnonymousImages()) {
      const nickname = getNickname(image);
      applyImage(image, nickname, avatarIndexForNickname(nickname));
    }
  }

  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(() => {
      scanQueued = false;
      assignAvatars();
    });
  }

  function inspect() {
    return collectAnonymousImages().map((image) => ({
      nickname: getNickname(image),
      index: image.dataset.qdbyAvatarIndex || null,
      version: image.dataset.qdbyAvatarVersion || null,
      src: image.getAttribute('src'),
    }));
  }

  async function loadPool() {
    try {
      const response = await fetch(manifestURL, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const manifest = await response.json();
      const files = Array.isArray(manifest?.avatars) ? manifest.avatars : [];

      avatarURLs = files
        .filter((name) => typeof name === 'string' && name.trim())
        .map((name) => new URL(encodeURIComponent(name.trim()), avatarBaseURL).href);

      if (!avatarURLs.length) throw new Error('Anonymous avatar pool is empty');

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

      // One delayed pass covers Waline/Vue hydration after the initial mount.
      setTimeout(assignAvatars, 250);
      setTimeout(assignAvatars, 1000);
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
    disconnect: () => observer?.disconnect(),
  };
})();

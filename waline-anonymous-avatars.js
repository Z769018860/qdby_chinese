(() => {
  const script = document.currentScript;
  const scriptURL = script?.src || new URL('waline-anonymous-avatars.js', location.href).href;
  const manifestURL = new URL('assets/waline-avatars/manifest.json', scriptURL);
  const avatarBaseURL = new URL('assets/waline-avatars/', scriptURL);
  const ROOT_SELECTORS = ['#waline', '#morimensWaline'];
  let avatarURLs = [];
  let observer = null;

  function hashString(value) {
    let hash = 2166136261;
    const text = String(value || '');
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function getStableCommentKey(image) {
    const item = image.closest('.wl-item') || image.closest('.wl-card') || image.parentElement;
    const nick = item?.querySelector('.wl-nick')?.textContent?.trim() || '';
    const timeNode = item?.querySelector('time[datetime], [datetime], .wl-time');
    const time = timeNode?.getAttribute?.('datetime') || timeNode?.getAttribute?.('title') || timeNode?.textContent?.trim() || '';
    const content = item?.querySelector('.wl-content')?.textContent?.trim().slice(0, 240) || '';
    const original = image.dataset.walineOriginalAvatar || image.currentSrc || image.src || '';

    if (!image.dataset.walineOriginalAvatar) {
      image.dataset.walineOriginalAvatar = original;
    }

    return [original, nick, time, content].join('|');
  }

  function isVerifiedUser(image) {
    const user = image.closest('.wl-user');
    return Boolean(user?.querySelector('.verified-icon, [class*="verified"]'));
  }

  function applyAvatar(image) {
    if (!(image instanceof HTMLImageElement) || !avatarURLs.length) return;
    if (isVerifiedUser(image)) return;

    const key = getStableCommentKey(image);
    const next = avatarURLs[hashString(key) % avatarURLs.length];
    if (!next) return;

    if (image.src !== next) image.src = next;
    image.dataset.qdbyAnonymousAvatar = 'true';
    image.referrerPolicy = 'no-referrer';
  }

  function scan(root = document) {
    for (const selector of ROOT_SELECTORS) {
      const host = root.matches?.(selector) ? root : root.querySelector?.(selector);
      if (!host) continue;
      host.querySelectorAll('.wl-cards .wl-user img').forEach(applyAvatar);
    }

    if (root.querySelectorAll && !root.matches?.(ROOT_SELECTORS.join(','))) {
      root.querySelectorAll(
        ROOT_SELECTORS.map((selector) => `${selector} .wl-cards .wl-user img`).join(',')
      ).forEach(applyAvatar);
    }
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

      scan(document);
      observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) scan(node);
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
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
    refresh: () => scan(document),
    disconnect: () => observer?.disconnect(),
  };
})();

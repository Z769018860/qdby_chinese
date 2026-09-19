(() => {
  const script = document.currentScript;
  const scriptURL = script?.src || new URL('waline-anonymous-avatars.js', location.href).href;
  const manifestURL = new URL('assets/waline-avatars/manifest.json', scriptURL);
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
    // Waline v3 CommentCard.vue:
    // .wl-card-item
    //   ├─ .wl-user > .wl-user-avatar
    //   └─ .wl-card > .wl-head > .wl-nick
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
    // The mapping depends only on the normalized nickname.
    // This guarantees the same nickname always receives the same avatar
    // on both guestbooks and across refreshes/devices.
    return hashString(`qdby-waline-nickname:${nickname}`) % avatarURLs.length;
  }

  function assignAvatars() {
    if (!avatarURLs.length) return;

    for (const image of collectAnonymousImages()) {
      const nickname = getNickname(image);
      const index = avatarIndexForNickname(nickname);
      const next = avatarURLs[index];

      if (next && image.src !== next) image.src = next;

      image.dataset.qdbyAnonymousAvatar = 'true';
      image.dataset.qdbyAvatarNickname = nickname;
      image.dataset.qdbyAvatarIndex = String(index);
      image.referrerPolicy = 'no-referrer';
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
        if (mutations.some((mutation) => mutation.addedNodes.length > 0)) queueScan();
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
    refresh: assignAvatars,
    disconnect: () => observer?.disconnect(),
  };
})();

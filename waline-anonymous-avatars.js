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
    return image.closest('.wl-item') || image.closest('.wl-card') || image.parentElement;
  }

  function getNickname(image) {
    const item = commentItem(image);
    return normalizeNickname(item?.querySelector('.wl-nick')?.textContent);
  }

  function isVerifiedUser(image) {
    const user = image.closest('.wl-user');
    return Boolean(user?.querySelector('.verified-icon, [class*="verified"]'));
  }

  function collectAnonymousImages() {
    const seen = new Set();
    const result = [];

    for (const selector of ROOT_SELECTORS) {
      const host = document.querySelector(selector);
      if (!host) continue;

      host.querySelectorAll('.wl-cards .wl-user img').forEach((image) => {
        if (!(image instanceof HTMLImageElement) || seen.has(image) || isVerifiedUser(image)) return;
        seen.add(image);
        result.push(image);
      });
    }

    return result;
  }

  function buildNicknameAvatarMap(images) {
    const nicknames = [...new Set(images.map(getNickname))];

    // Deterministic order makes the same visible nickname set receive the same
    // collision resolution regardless of comment DOM order.
    nicknames.sort((a, b) => {
      const ha = hashString(a);
      const hb = hashString(b);
      return ha - hb || a.localeCompare(b);
    });

    const mapping = new Map();
    const used = new Set();

    for (const nickname of nicknames) {
      const preferred = hashString(nickname) % avatarURLs.length;
      let index = preferred;

      // Keep different nicknames on different avatars for as long as the pool
      // still has unused avatars. Only reuse after all avatars are occupied.
      if (used.size < avatarURLs.length) {
        for (let offset = 0; offset < avatarURLs.length; offset += 1) {
          const candidate = (preferred + offset) % avatarURLs.length;
          if (!used.has(candidate)) {
            index = candidate;
            break;
          }
        }
      }

      mapping.set(nickname, index);
      used.add(index);
    }

    return mapping;
  }

  function assignAvatars() {
    if (!avatarURLs.length) return;

    const images = collectAnonymousImages();
    const nicknameAvatarMap = buildNicknameAvatarMap(images);

    for (const image of images) {
      const nickname = getNickname(image);
      const index = nicknameAvatarMap.get(nickname);
      if (index == null) continue;

      const next = avatarURLs[index];
      if (next && image.src !== next) image.src = next;

      image.dataset.qdbyAnonymousAvatar = 'true';
      image.dataset.qdbyAvatarIndex = String(index);
      image.dataset.qdbyAvatarNickname = nickname;
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

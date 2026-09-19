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

  function commentItem(image) {
    return image.closest('.wl-item') || image.closest('.wl-card') || image.parentElement;
  }

  function explicitCommentId(item) {
    if (!item) return '';

    const nodes = [
      item,
      item.querySelector?.('[data-object-id]'),
      item.querySelector?.('[data-objectid]'),
      item.querySelector?.('[data-comment-id]'),
      item.querySelector?.('[data-id]'),
      item.querySelector?.('[id^="comment-"]'),
      item.querySelector?.('[id^="wl-comment-"]'),
    ].filter(Boolean);

    for (const node of nodes) {
      for (const name of ['data-object-id', 'data-objectid', 'data-comment-id', 'data-id', 'id']) {
        const value = node.getAttribute?.(name);
        if (value && /\d/.test(value)) return `${name}:${value}`;
      }
    }

    const anchor = item.querySelector?.('a[href*="#comment"], a[href*="#wl-comment"], a[href*="comment-"]');
    const href = anchor?.getAttribute?.('href') || '';
    return href && /\d/.test(href) ? `href:${href}` : '';
  }

  function baseCommentKey(image) {
    const item = commentItem(image);
    const objectId = explicitCommentId(item);
    if (objectId) return objectId;

    const nick = item?.querySelector('.wl-nick')?.textContent?.trim() || 'anonymous';
    const timeNode = item?.querySelector('time[datetime], [datetime], .wl-time');
    const time =
      timeNode?.getAttribute?.('datetime') ||
      timeNode?.getAttribute?.('title') ||
      timeNode?.textContent?.trim() ||
      '';
    const content = item?.querySelector('.wl-content')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 500) || '';

    // Deliberately do NOT include Waline's original avatar URL here:
    // anonymous Waline comments commonly share the same default avatar.
    return `guest:${nick}|time:${time}|content:${content}`;
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

  function assignAvatars() {
    if (!avatarURLs.length) return;

    const images = collectAnonymousImages();
    const occurrences = new Map();
    const records = images.map((image, domIndex) => {
      const base = baseCommentKey(image);
      const occurrence = occurrences.get(base) || 0;
      occurrences.set(base, occurrence + 1);
      return {
        image,
        key: `${base}|occurrence:${occurrence}`,
        domIndex,
      };
    });

    // Sort only for allocation so collision resolution is deterministic
    // for a given visible comment set, then write back to the original DOM nodes.
    const ordered = [...records].sort((a, b) =>
      a.key.localeCompare(b.key) || a.domIndex - b.domIndex
    );
    const used = new Set();

    for (const record of ordered) {
      const start = hashString(record.key) % avatarURLs.length;
      let index = start;

      if (used.size < avatarURLs.length) {
        for (let offset = 0; offset < avatarURLs.length; offset += 1) {
          const candidate = (start + offset) % avatarURLs.length;
          if (!used.has(candidate)) {
            index = candidate;
            break;
          }
        }
      }

      used.add(index);
      const next = avatarURLs[index];
      if (record.image.src !== next) record.image.src = next;
      record.image.dataset.qdbyAnonymousAvatar = 'true';
      record.image.dataset.qdbyAvatarIndex = String(index);
      record.image.dataset.qdbyAvatarKey = record.key;
      record.image.referrerPolicy = 'no-referrer';
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

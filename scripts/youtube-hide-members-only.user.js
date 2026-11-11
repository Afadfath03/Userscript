// ==UserScript==
// @name         YouTube: Hide Members Only and Premium
// @namespace    https://github.com/Afadfath03/Userscript
// @version      1.0
// @description  Hide videos marked Members only or Premium in feeds, search results, sidebars and playlists
// @author       Afadfath03
// @homepageURL  https://github.com/Afadfath03/Userscript
// @supportURL   https://github.com/Afadfath03/Userscript/issues
// @downloadURL  https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-hide-members-only.user.js
// @updateURL    https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-hide-members-only.user.js
// @license      MIT
// @match        https://www.youtube.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  const squash = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  // Add other UI languages here; case and spacing are normalized
  const LABELS = new Set(['members only', 'premium', 'khusus anggota']);
  const BADGE = 'yt-badge-shape, badge-shape, ytd-badge-supported-renderer';
  const CARD = [
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-playlist-video-renderer',
    'ytd-playlist-panel-video-renderer',
    'yt-lockup-view-model',
  ].join(',');
  const MARK = 'data-ytmp-hidden';

  const style = document.createElement('style');
  style.textContent = `[${MARK}]{display:none!important}`;
  document.documentElement.append(style);

  function mark(root) {
    if (!root.isConnected) return;
    const badges = [...root.querySelectorAll(BADGE)];
    if (root.matches(BADGE)) badges.push(root);
    for (const badge of badges) {
      if (!LABELS.has(squash(badge.textContent))) continue;
      const card = badge.closest(CARD);
      if (card) card.setAttribute(MARK, '');
    }
  }

  const queue = new Set();
  let raf = 0;

  function flush() {
    raf = 0;
    const batch = [...queue];
    queue.clear();
    for (const node of batch) mark(node);
  }

  const mo = new MutationObserver((list) => {
    for (const m of list) {
      for (const n of m.addedNodes) if (n.nodeType === 1) queue.add(n);
    }
    if (queue.size && !raf) raf = requestAnimationFrame(flush);
  });

  mo.observe(document.documentElement, { childList: true, subtree: true });

  // Content already present at document-idle never fires a mutation
  if (document.body) mark(document.body);
})();

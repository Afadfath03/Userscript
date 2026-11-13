// ==UserScript==
// @name         YouTube: Hide Members Only and Premium
// @namespace    https://github.com/Afadfath03/Userscript
// @version      1.4
// @description  Hide videos marked Members only or Premium, plus YouTube featured promos, in feeds, search results, sidebars and playlists
// @author       Afadfath03
// @homepageURL  https://github.com/Afadfath03/Userscript
// @supportURL   https://github.com/Afadfath03/Userscript/issues
// @downloadURL  https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-hide-members-only.user.js
// @updateURL    https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-hide-members-only.user.js
// @icon         https://raw.githubusercontent.com/Afadfath03/Userscript/main/assets/icons/youtube-hide-members-only.png
// @license      MIT
// @match        https://www.youtube.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  // Only the top document carries the shelf this script removes
  if (window.self !== window.top) return;
  const squash = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  // Add other UI languages here; case and spacing are normalized.
  // "YouTube featured" marks an in-feed promo card, not a membership video
  const LABELS = new Set(['members only', 'premium', 'khusus anggota', 'youtube featured']);
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

  const hidden = new Map();

  function videoIdOf(card) {
    const link = card.querySelector('a[href*="/watch?v="], a[href*="/shorts/"]');
    if (!link) return '';
    const url = link.getAttribute('href') || '';
    if (url.includes('/shorts/')) return url.split('/shorts/')[1].split(/[?&/]/)[0];
    const match = url.match(/[?&]v=([^&]+)/);
    return match ? match[1] : '';
  }

  function hideCard(card, id) {
    card.setAttribute(MARK, id);
    hidden.set(card, id);
  }

  function unhideCard(card) {
    card.removeAttribute(MARK);
    hidden.delete(card);
  }

  // A card can hold several badges, so the decision is made once per card
  function markCard(card) {
    const shouldHide = [...card.querySelectorAll(BADGE)].some((badge) =>
      LABELS.has(squash(badge.textContent))
    );
    const id = videoIdOf(card);
    if (shouldHide) hideCard(card, id);
    else unhideCard(card);
  }

  // Feed elements get recycled for other videos, so a hidden card whose video
  // changed has to be judged again, not just released
  function resync() {
    for (const [card, id] of [...hidden]) {
      if (!card.isConnected) {
        hidden.delete(card);
        continue;
      }
      if (videoIdOf(card) !== id) markCard(card);
    }
  }

  function mark(root) {
    if (!root.isConnected) return;
    const cards = new Set();
    for (const badge of root.querySelectorAll(BADGE)) {
      const card = badge.closest(CARD);
      if (card) cards.add(card);
    }
    if (root.matches(BADGE)) {
      const card = root.closest(CARD);
      if (card) cards.add(card);
    }
    for (const card of cards) markCard(card);
  }

  const queue = new Set();
  let raf = 0;

  function flush() {
    raf = 0;
    const batch = [...queue];
    queue.clear();
    resync();
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

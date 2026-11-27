// ==UserScript==
// @name         YouTube: Shorts to Watch
// @namespace    https://github.com/Afadfath03/Userscript
// @version      1.2
// @description  Opens Shorts in the normal watch player, off by default, toggled from the userscript manager menu
// @author       Afadfath03
// @homepageURL  https://github.com/Afadfath03/Userscript
// @supportURL   https://github.com/Afadfath03/Userscript/issues
// @downloadURL  https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube/youtube-shorts-to-watch.user.js
// @updateURL    https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube/youtube-shorts-to-watch.user.js
// @icon         https://raw.githubusercontent.com/Afadfath03/Userscript/main/assets/icons/youtube/youtube-shorts-to-watch.png
// @license      MIT
// @match        https://www.youtube.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// ==/UserScript==

(() => {
  // Embeds and chat frames never show the Shorts player
  if (window.self !== window.top) return;

  const KEY = 'ytsw.on';
  const SHORTS = /^\/shorts\/([A-Za-z0-9_-]{6,})/;

  const enabled = () => GM_getValue(KEY, false) === true;

  function toWatchUrl(raw) {
    let url;
    try {
      url = new URL(raw, location.origin);
    } catch {
      return null;
    }
    if (url.origin !== location.origin) return null;
    const match = SHORTS.exec(url.pathname);
    if (!match) return null;
    const next = new URL(`/watch?v=${match[1]}`, location.origin);
    // A shared Short can carry a start time; keep it
    const time = url.searchParams.get('t');
    if (time) next.searchParams.set('t', time);
    return next;
  }

  function rewriteLinks(root = document) {
    if (!enabled() || !root || typeof root.querySelectorAll !== 'function') return;
    const links = root.matches && root.matches('a[href*="/shorts/"]')
      ? [root, ...root.querySelectorAll('a[href*="/shorts/"]')]
      : root.querySelectorAll('a[href*="/shorts/"]');
    for (const link of links) {
      const next = toWatchUrl(link.getAttribute('href') || '');
      if (next) link.setAttribute('href', next.pathname + next.search);
    }
  }

  function rewrite() {
    if (!enabled()) return;
    const match = SHORTS.exec(location.pathname);
    if (!match) return;
    const url = toWatchUrl(location.pathname + location.search);
    if (!url) return;
    // replace() keeps the entry count stable, so Back does not bounce between the two pages
    location.replace(url.toString());
  }

  function syncShorts() {
    rewrite();
    rewriteLinks();
  }

  let linkRaf = 0;
  const linkQueue = new Set();
  const flushLinks = () => {
    linkRaf = 0;
    const batch = [...linkQueue];
    linkQueue.clear();
    for (const node of batch) rewriteLinks(node);
  };
  new MutationObserver((list) => {
    if (!enabled()) return;
    for (const m of list) {
      for (const n of m.addedNodes) {
        if (n.nodeType === 1) linkQueue.add(n);
      }
    }
    if (linkQueue.size && !linkRaf) linkRaf = requestAnimationFrame(flushLinks);
  }).observe(document.documentElement, { childList: true, subtree: true });

  syncShorts();
  document.addEventListener('yt-navigate-start', rewrite);
  document.addEventListener('yt-navigate-finish', syncShorts);
  window.addEventListener('popstate', syncShorts);

  let menuId = null;

  function drawMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    if (menuId !== null && typeof GM_unregisterMenuCommand === 'function') GM_unregisterMenuCommand(menuId);
    menuId = GM_registerMenuCommand(`Shorts to Watch: ${enabled() ? 'On' : 'Off'}`, () => {
      GM_setValue(KEY, !enabled());
      drawMenu();
      syncShorts();
    });
  }

  drawMenu();
})();

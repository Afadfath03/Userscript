// ==UserScript==
// @name         YouTube — hide "People mentioned in the video"
// @namespace    https://github.com/Afadfath03/Userscript
// @version      1.1
// @description  Hide the "These people are mentioned in the video" shelf on watch pages
// @author       Afadfath03
// @homepageURL  https://github.com/Afadfath03/Userscript
// @supportURL   https://github.com/Afadfath03/Userscript/issues
// @downloadURL  https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-hide-people-mentioned.user.js
// @updateURL    https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-hide-people-mentioned.user.js
// @license      MIT
// @match        https://www.youtube.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  const squash = (s) => s.replace(/\s+/g, ' ').toLowerCase();
  // Add other UI languages here; case and spacing are normalized
  const PHRASES = [
    'these people are mentioned in the video',
    'orang-orang ini disebutkan dalam video',
  ].map(squash);
  const STOP_TAGS = new Set(['BODY', 'YTD-APP', 'YTD-WATCH-FLEXY', 'YTD-WATCH-GRID']);
  const STOP_IDS = new Set(['below', 'primary', 'columns']);

  function hide(start) {
    const own = squash(start.textContent).length;
    let node = start;
    while (node.parentElement) {
      const p = node.parentElement;
      if (STOP_TAGS.has(p.tagName) || STOP_IDS.has(p.id)) break;
      if (squash(p.textContent).length > own + 400) break;
      node = p;
    }
    node.style.setProperty('display', 'none', 'important');
  }

  function locate(root) {
    let all;
    try { all = squash(root.textContent || ''); } catch { return null; }
    if (!PHRASES.some((p) => all.includes(p))) return null;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (PHRASES.some((p) => squash(n.nodeValue || '').includes(p))) return n.parentElement;
    }
    return null;
  }

  const queue = new Set();
  let raf = 0;

  function flush() {
    raf = 0;
    const batch = [...queue];
    queue.clear();
    for (const node of batch) {
      if (!node.isConnected) continue;
      const target = locate(node);
      if (target) hide(target);
    }
  }

  const mo = new MutationObserver((list) => {
    if (location.pathname !== '/watch') return;
    for (const m of list) {
      for (const n of m.addedNodes) if (n.nodeType === 1) queue.add(n);
    }
    if (queue.size && !raf) raf = requestAnimationFrame(flush);
  });

  mo.observe(document.documentElement, { childList: true, subtree: true });

  // Content already present at document-idle never fires a mutation
  if (location.pathname === '/watch' && document.body) {
    const target = locate(document.body);
    if (target) hide(target);
  }
})();

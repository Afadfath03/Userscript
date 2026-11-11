// ==UserScript==
// @name         YouTube — auto-expand description
// @namespace    https://github.com/Afadfath03/Userscript
// @version      1.1
// @description  Expand the watch page description automatically
// @author       Afadfath03
// @homepageURL  https://github.com/Afadfath03/Userscript
// @supportURL   https://github.com/Afadfath03/Userscript/issues
// @downloadURL  https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-expand-description.user.js
// @updateURL    https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-expand-description.user.js
// @license      MIT
// @match        https://www.youtube.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  const MAX_TRIES = 5;
  let raf = 0;
  let tries = 0;
  let url = '';
  let done = '';

  function scan() {
    raf = 0;
    if (location.pathname !== '/watch') return;
    if (location.search !== url) {
      url = location.search;
      tries = 0;
    }
    if (url === done) return;
    const box = document.querySelector('#description-inline-expander');
    if (!box) return;
    const btn = box.querySelector('#expand');
    if (!btn || btn.hidden) return;
    if (tries++ >= MAX_TRIES) return;
    btn.click();
    requestAnimationFrame(() => {
      // The click only counts once YouTube actually collapsed the button
      if (btn.hidden || !btn.isConnected) done = url;
      else setTimeout(schedule, 300);
    });
  }

  const schedule = () => { if (!raf) raf = requestAnimationFrame(scan); };

  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  window.addEventListener('yt-navigate-finish', schedule, true);
  schedule();
})();

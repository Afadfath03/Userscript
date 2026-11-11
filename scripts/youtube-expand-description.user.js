// ==UserScript==
// @name         YouTube — auto-expand description
// @namespace    https://github.com/Afadfath03/Userscript
// @version      1.0
// @description  Expand the watch page description automatically
// @author       Afadfath
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
  let raf = 0;
  let done = '';

  function scan() {
    raf = 0;
    if (location.pathname !== '/watch') return;
    if (location.search === done) return;
    const box = document.querySelector('#description-inline-expander');
    if (!box) return;
    const btn = box.querySelector('#expand');
    if (!btn || btn.hidden) return;
    btn.click();
    done = location.search;
  }

  const schedule = () => { if (!raf) raf = requestAnimationFrame(scan); };

  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  window.addEventListener('yt-navigate-finish', schedule, true);
  schedule();
})();

// ==UserScript==
// @name         YouTube: Shorts to Watch
// @namespace    https://github.com/Afadfath03/Userscript
// @version      1.0
// @description  Opens Shorts in the normal watch player by rewriting /shorts/ links to /watch
// @author       Afadfath03
// @homepageURL  https://github.com/Afadfath03/Userscript
// @supportURL   https://github.com/Afadfath03/Userscript/issues
// @downloadURL  https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-shorts-to-watch.user.js
// @updateURL    https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-shorts-to-watch.user.js
// @icon         https://raw.githubusercontent.com/Afadfath03/Userscript/main/assets/icons/youtube-shorts-to-watch.png
// @license      MIT
// @match        https://www.youtube.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  // Embeds and chat frames never show the Shorts player
  if (window.self !== window.top) return;

  const SHORTS = /^\/shorts\/([A-Za-z0-9_-]{6,})/;

  function rewrite() {
    const match = SHORTS.exec(location.pathname);
    if (!match) return;
    const url = new URL(`/watch?v=${match[1]}`, location.origin);
    // A shared Short can carry a start time; keep it
    const time = new URLSearchParams(location.search).get('t');
    if (time) url.searchParams.set('t', time);
    // replace() keeps the entry count stable, so Back does not bounce between the two pages
    location.replace(url.toString());
  }

  rewrite();
  document.addEventListener('yt-navigate-start', rewrite);
  document.addEventListener('yt-navigate-finish', rewrite);
  window.addEventListener('popstate', rewrite);
})();

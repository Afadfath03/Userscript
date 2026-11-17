// ==UserScript==
// @name         YouTube Music: Quiet Page
// @namespace    https://github.com/Afadfath03/Userscript
// @version      1.0
// @description  Hides the Premium promos and the Shorts shelves on YouTube Music
// @author       Afadfath03
// @homepageURL  https://github.com/Afadfath03/Userscript
// @supportURL   https://github.com/Afadfath03/Userscript/issues
// @downloadURL  https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-music-quiet-page.user.js
// @updateURL    https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-music-quiet-page.user.js
// @icon         https://raw.githubusercontent.com/Afadfath03/Userscript/main/assets/icons/youtube-music-quiet-page.png
// @license      MIT
// @match        https://music.youtube.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// ==/UserScript==

(() => {
  // The promos and shelves live on the page, not in a player frame
  if (window.self !== window.top) return;

  const PROMOS = 'ytq.promos';
  const SHORTS = 'ytq.shorts';
  const TICK = 1000;

  const on = (key) => GM_getValue(key, true) === true;
  const squash = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();

  const style = document.createElement('style');
  style.id = 'ytq-style';
  (document.head || document.documentElement).append(style);

  const PROMO_CSS = [
    'ytmusic-mealbar-promo-renderer',
    'ytmusic-statement-banner-renderer',
    'ytmusic-background-promo-renderer',
  ].join(', ');

  let painted = '';
  function paint() {
    const rules = [];
    if (on(SHORTS)) rules.push('[data-ytq-off] { display: none !important; }');
    if (on(PROMOS)) rules.push(`${PROMO_CSS} { display: none !important; }`);
    const css = rules.join('\n');
    if (css === painted) return;
    painted = css;
    style.textContent = css;
  }

  const SHELVES = 'ytmusic-carousel-shelf-renderer, ytmusic-shelf-renderer, ytmusic-item-section-renderer';
  // Add other UI languages here; case and spacing are normalized
  const SHORTS_TITLES = new Set(['shorts', 'shorts video']);

  function hideShorts() {
    for (const shelf of document.querySelectorAll(SHELVES)) {
      if (shelf.hasAttribute('data-ytq-off')) continue;
      const title = shelf.querySelector('#title, yt-formatted-string.title, .title');
      if (title && SHORTS_TITLES.has(squash(title.textContent))) shelf.setAttribute('data-ytq-off', '');
    }
  }

  function hidePromos() {
    for (const entry of document.querySelectorAll('ytmusic-guide-entry-renderer')) {
      if (entry.hasAttribute('data-ytq-off')) continue;
      const link = entry.querySelector('a[href*="premium"]');
      const text = squash(entry.textContent);
      // A playlist can be called Premium too, so the link wins when there is one
      if (link || (text.includes('premium') && text.length <= 24)) entry.setAttribute('data-ytq-off', '');
    }
  }

  function tick() {
    paint();
    if (on(SHORTS)) hideShorts();
    if (on(PROMOS)) hidePromos();
  }

  let menuIds = [];
  function drawMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    if (typeof GM_unregisterMenuCommand === 'function') {
      for (const id of menuIds) GM_unregisterMenuCommand(id);
    }
    const flip = (key) => () => {
      GM_setValue(key, !on(key));
      drawMenu();
      tick();
    };
    menuIds = [
      GM_registerMenuCommand(`${on(PROMOS) ? 'Show' : 'Hide'} promo banners`, flip(PROMOS)),
      GM_registerMenuCommand(`${on(SHORTS) ? 'Show' : 'Hide'} Shorts shelves`, flip(SHORTS)),
    ];
  }

  // A tick per second catches shelves the page adds long after it finished loading
  setInterval(tick, TICK);
  document.addEventListener('yt-navigate-finish', tick);
  drawMenu();
  tick();
})();

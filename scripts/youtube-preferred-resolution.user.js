// ==UserScript==
// @name         YouTube: preferred resolution
// @namespace    https://github.com/Afadfath03/Userscript
// @version      1.0
// @description  Start every video at a preferred quality, falling back to the next best available
// @author       Afadfath03
// @homepageURL  https://github.com/Afadfath03/Userscript
// @supportURL   https://github.com/Afadfath03/Userscript/issues
// @downloadURL  https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-preferred-resolution.user.js
// @updateURL    https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-preferred-resolution.user.js
// @license      MIT
// @match        https://www.youtube.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// ==/UserScript==

(() => {
  // YouTube quality codes, highest first
  const ORDER = ['highres', 'hd2160', 'hd1440', 'hd1080', 'hd720', 'large', 'medium', 'small', 'tiny'];
  const LABELS = {
    auto: 'Auto (YouTube default)',
    highest: 'Highest available',
    highres: '4320p and up',
    hd2160: '2160p',
    hd1440: '1440p',
    hd1080: '1080p',
    hd720: '720p',
    large: '480p',
    medium: '360p',
    small: '240p',
    tiny: '144p',
  };
  const CHOICES = Object.keys(LABELS);

  const getPref = () => {
    const v = GM_getValue('quality', 'auto');
    return CHOICES.includes(v) ? v : 'auto';
  };

  // Highest level at or below the preferred one
  function resolve(pref, available) {
    if (pref === 'auto' || !available.length) return null;
    if (pref === 'highest') return available[0];
    const rank = ORDER.indexOf(pref);
    const ranked = available.filter((q) => ORDER.includes(q));
    if (!ranked.length) return null;
    if (ranked.includes(pref)) return pref;
    const below = ranked.filter((q) => ORDER.indexOf(q) >= rank);
    return below[0] || ranked[ranked.length - 1];
  }

  function player() {
    const el = document.getElementById('movie_player');
    return el && typeof el.getAvailableQualityLevels === 'function' ? el : null;
  }

  function targetCode() {
    const el = player();
    if (!el) return null;
    // Quality is locked during ads; the watchdog retries after them
    if (el.classList.contains('ad-showing')) return null;
    return resolve(getPref(), el.getAvailableQualityLevels() || []);
  }

  function apply() {
    const el = player();
    const code = targetCode();
    if (!el || !code) return;
    if (typeof el.setPlaybackQualityRange === 'function') el.setPlaybackQualityRange(code, code);
    if (typeof el.setPlaybackQuality === 'function') el.setPlaybackQuality(code);
  }

  // Runs for a few seconds after each video opens, then stops
  let timer = 0;
  let tries = 0;
  function startWatchdog() {
    clearInterval(timer);
    tries = 0;
    if (getPref() === 'auto') return;
    timer = setInterval(() => {
      const el = player();
      const code = targetCode();
      if (el && code && typeof el.getPlaybackQuality === 'function' && el.getPlaybackQuality() === code) {
        clearInterval(timer);
        return;
      }
      apply();
      if (++tries >= 12) clearInterval(timer);
    }, 400);
  }

  let menuId = null;
  function drawMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    if (menuId !== null && typeof GM_unregisterMenuCommand === 'function') GM_unregisterMenuCommand(menuId);
    menuId = GM_registerMenuCommand(`Preferred resolution: ${LABELS[getPref()]}`, pick);
  }

  function pick() {
    const list = CHOICES.map((c, i) => `${i + 1}. ${LABELS[c]}`).join('\n');
    const answer = prompt(`Preferred resolution\n\n${list}`, String(CHOICES.indexOf(getPref()) + 1));
    if (answer === null) return;
    const choice = CHOICES[Number.parseInt(answer, 10) - 1];
    if (!choice) return alert('Enter a number from the list.');
    GM_setValue('quality', choice);
    drawMenu();
    startWatchdog();
  }

  drawMenu();
  document.addEventListener('yt-navigate-finish', startWatchdog);
  window.addEventListener('yt-page-data-updated', startWatchdog);
  startWatchdog();
})();

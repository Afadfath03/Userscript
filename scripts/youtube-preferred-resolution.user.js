// ==UserScript==
// @name         YouTube: preferred resolution
// @namespace    https://github.com/Afadfath03/Userscript
// @version      1.3
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
  const ORDER = ['highres', 'hd2880', 'hd2160', 'hd1440', 'hd1080', 'hd720', 'large', 'medium', 'small', 'tiny'];
  const LABELS = {
    auto: 'Auto',
    highest: 'Highest available',
    highres: '4320p',
    hd2880: '2880p',
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

  const PANEL_CSS = `
#ytpr-backdrop{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5)}
#ytpr-panel{min-width:236px;max-width:88vw;max-height:calc(100vh - 24px);overflow:auto;padding:6px 0 8px;border-radius:12px;background:var(--yt-spec-base-background,#fff);color:var(--yt-spec-text-primary,#0f0f0f);box-shadow:0 12px 32px rgba(0,0,0,.45);font-family:Roboto,Arial,sans-serif}
#ytpr-panel h2{margin:0;padding:12px 20px 6px;font-size:13px;font-weight:500;color:var(--yt-spec-text-secondary,#606060)}
#ytpr-panel button{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;padding:0 20px;border:0;background:none;color:inherit;font:inherit;font-size:14px;text-align:left;cursor:pointer}
#ytpr-panel button:hover{background:var(--yt-spec-badge-chip-background,rgba(0,0,0,.05))}
#ytpr-panel button:focus-visible{outline:2px solid var(--yt-spec-call-to-action,#065fd4);outline-offset:-2px}
#ytpr-panel .ytpr-mark{flex:0 0 14px;font-size:14px;line-height:1;color:inherit}
#ytpr-panel button[aria-current="true"]{font-weight:500}
`;

  function closePanel() {
    document.removeEventListener('keydown', onKey, true);
    document.getElementById('ytpr-backdrop')?.remove();
    document.getElementById('ytpr-style')?.remove();
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closePanel();
      return;
    }
    if (e.key !== 'Tab') return;
    const panel = document.getElementById('ytpr-panel');
    if (!panel) return;
    const items = [...panel.querySelectorAll('button')];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (!items.includes(document.activeElement)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function openPanel() {
    if (document.getElementById('ytpr-backdrop')) return;
    const style = document.createElement('style');
    style.id = 'ytpr-style';
    style.textContent = PANEL_CSS;
    document.head.append(style);

    const backdrop = document.createElement('div');
    backdrop.id = 'ytpr-backdrop';
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) closePanel();
    });

    const panel = document.createElement('div');
    panel.id = 'ytpr-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Preferred resolution');

    const title = document.createElement('h2');
    title.textContent = 'Preferred resolution';
    panel.append(title);

    const pref = getPref();
    let active = null;
    for (const choice of CHOICES) {
      const button = document.createElement('button');
      button.type = 'button';
      const mark = document.createElement('span');
      mark.className = 'ytpr-mark';
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = choice === pref ? '\u2713' : '';
      button.append(mark, document.createTextNode(LABELS[choice]));
      if (choice === pref) {
        button.setAttribute('aria-current', 'true');
        active = button;
      }
      button.addEventListener('click', () => {
        setPref(choice);
        closePanel();
      });
      panel.append(button);
    }

    backdrop.append(panel);
    document.body.append(backdrop);
    document.addEventListener('keydown', onKey, true);
    (active || panel.querySelector('button')).focus();
  }

  function setPref(choice) {
    GM_setValue('quality', choice);
    drawMenu();
    startWatchdog();
  }

  let menuId = null;
  function drawMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    if (menuId !== null && typeof GM_unregisterMenuCommand === 'function') GM_unregisterMenuCommand(menuId);
    menuId = GM_registerMenuCommand(`Preferred resolution: ${LABELS[getPref()]}`, openPanel);
  }

  drawMenu();
  document.addEventListener('yt-navigate-finish', startWatchdog);
  window.addEventListener('yt-page-data-updated', startWatchdog);
  startWatchdog();
})();

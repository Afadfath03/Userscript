// ==UserScript==
// @name         YouTube: Autoplay Control
// @namespace    https://github.com/Afadfath03/Userscript
// @version      1.3
// @description  Decide what happens when a video ends: next, wait, stop, loop, with a per-session limit
// @author       Afadfath03
// @homepageURL  https://github.com/Afadfath03/Userscript
// @supportURL   https://github.com/Afadfath03/Userscript/issues
// @downloadURL  https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-autoplay-control.user.js
// @updateURL    https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-autoplay-control.user.js
// @icon         https://raw.githubusercontent.com/Afadfath03/Userscript/main/assets/icons/youtube-autoplay-control.png
// @license      MIT
// @match        https://www.youtube.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// ==/UserScript==

(() => {
  const BEHAVIORS = ['leave', 'next', 'wait', 'stop', 'loop'];
  const BEHAVIOR_LABELS = {
    leave: 'Leave as-is',
    next: 'Next immediately',
    wait: 'Wait then next',
    stop: 'Stop at end',
    loop: 'Loop current',
  };
  const DELAYS = [0, 3, 5, 10, 15, 30];
  const LIMITS = [0, 3, 5, 10, 20];
  const COUNT_KEY = 'ytac.count';

  const get = (key, fallback) => {
    const v = GM_getValue(`ytac.${key}`, fallback);
    return v === undefined || v === null ? fallback : v;
  };
  const put = (key, value) => GM_setValue(`ytac.${key}`, value);

  const behavior = () => (BEHAVIORS.includes(get('behavior', 'leave')) ? get('behavior', 'leave') : 'leave');
  const delay = () => (DELAYS.includes(get('delay', 5)) ? get('delay', 5) : 5);
  const limit = () => (LIMITS.includes(get('limit', 0)) ? get('limit', 0) : 0);
  const flag = (key) => get(key, false) === true;

  const currentVideo = () => document.querySelector('#movie_player video');

  function toggleEl() {
    return document.querySelector('.ytp-autonav-toggle-button');
  }

  function setAutoplay(on) {
    const el = toggleEl();
    if (!el) return;
    if ((el.getAttribute('aria-checked') === 'true') === on) return;
    (el.closest('button') || el).click();
  }

  // The end screen card is preferred; the first related video is the fallback
  function pickNext() {
    const skipShorts = flag('skipShorts');
    const cards = document.querySelectorAll('#movie_player .ytp-videowall-still, #movie_player .ytp-ce-video');
    const related = document.querySelectorAll(
      'ytd-watch-next-secondary-results-renderer yt-lockup-view-model a[href*="/watch?v="], ' +
        '#secondary ytd-compact-video-renderer a#thumbnail'
    );
    for (const el of [...cards, ...related]) {
      if (!el.href) continue;
      if (skipShorts && el.href.includes('/shorts/')) continue;
      return el;
    }
    return null;
  }

  function count() {
    const n = Number.parseInt(sessionStorage.getItem(COUNT_KEY) || '0', 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function bumpCount() {
    try {
      sessionStorage.setItem(COUNT_KEY, String(count() + 1));
    } catch {
      // Private mode without storage: the limit just stops applying
    }
  }

  let endTimer = 0;

  // Stops YouTube's own "Up next" countdown; the only lever left when the autoplay toggle is gone
  function cancelCountdown() {
    document.querySelector('.ytp-autonav-endscreen-upnext-cancel-button')?.click();
  }

  function onEnded() {
    const mode = behavior();
    if (mode === 'leave') return;
    cancelCountdown();
    if (mode === 'stop') {
      setAutoplay(false);
      return;
    }
    if (mode === 'loop') {
      const video = currentVideo();
      if (!video) return;
      video.currentTime = 0;
      video.play().catch(() => {});
      return;
    }
    const cap = limit();
    if (cap && count() >= cap) {
      setAutoplay(false);
      return;
    }
    if (flag('hiddenPause') && document.hidden) return;
    clearTimeout(endTimer);
    endTimer = setTimeout(() => {
      cancelCountdown();
      const target = pickNext();
      if (!target) {
        // No card to click: hand back to YouTube's own countdown
        setAutoplay(true);
        return;
      }
      bumpCount();
      target.click();
    }, mode === 'next' ? 0 : delay() * 1000);
  }

  const hooked = new WeakSet();

  function hookVideo() {
    const video = currentVideo();
    if (!video || hooked.has(video)) return;
    hooked.add(video);
    video.addEventListener('ended', onEnded);
  }

  function sync() {
    hookVideo();
    if (behavior() === 'leave') return;
    // Every managed mode decides on its own when to move on
    setAutoplay(false);
  }

  let syncTries = 0;

  function syncWithRetry() {
    syncTries = 0;
    const tick = () => {
      sync();
      if (toggleEl() || ++syncTries > 20) return;
      setTimeout(tick, 250);
    };
    tick();
  }

  const CSS = `
#ytac-backdrop{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5)}
#ytac-panel{min-width:264px;max-width:88vw;max-height:calc(100vh - 24px);overflow:auto;padding:6px 0 8px;border-radius:12px;background:var(--yt-spec-base-background,#fff);color:var(--yt-spec-text-primary,#0f0f0f);box-shadow:0 12px 32px rgba(0,0,0,.45);font-family:Roboto,Arial,sans-serif}
#ytac-panel h2{margin:0;padding:12px 20px 6px;font-size:13px;font-weight:500;color:var(--yt-spec-text-secondary,#606060)}
#ytac-panel button{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;padding:0 20px;border:0;background:none;color:inherit;font:inherit;font-size:14px;text-align:left;cursor:pointer}
#ytac-panel button:hover{background:var(--yt-spec-badge-chip-background,rgba(0,0,0,.05))}
#ytac-panel button:focus-visible{outline:2px solid var(--yt-spec-call-to-action,#065fd4);outline-offset:-2px}
#ytac-panel .ytac-mark{flex:0 0 14px;font-size:14px;line-height:1;color:inherit}
#ytac-panel .ytac-value{margin-left:auto;font-size:13px;color:var(--yt-spec-text-secondary,#606060)}
#ytac-panel button[aria-current="true"]{font-weight:500}
`;

  let view = { kind: 'settings' };

  function closePanel() {
    document.removeEventListener('keydown', onKey, true);
    document.getElementById('ytac-backdrop')?.remove();
    document.getElementById('ytac-style')?.remove();
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closePanel();
      return;
    }
    if (e.key !== 'Tab') return;
    const panel = document.getElementById('ytac-panel');
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

  function settingRow(label, value, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    const name = document.createElement('span');
    name.textContent = label;
    const current = document.createElement('span');
    current.className = 'ytac-value';
    current.textContent = value;
    button.append(name, current);
    button.addEventListener('click', onClick);
    return button;
  }

  function optionRow(label, active, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    const mark = document.createElement('span');
    mark.className = 'ytac-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = active ? '\u2713' : '';
    button.append(mark, document.createTextNode(label));
    if (active) button.setAttribute('aria-current', 'true');
    button.addEventListener('click', onClick);
    return button;
  }

  function optionList(key) {
    if (key === 'behavior') return BEHAVIORS.map((b) => [b, BEHAVIOR_LABELS[b]]);
    if (key === 'delay') return DELAYS.map((d) => [d, `${d}s`]);
    return LIMITS.map((l) => [l, l ? String(l) : 'Off']);
  }

  function currentValue(key) {
    if (key === 'behavior') return behavior();
    if (key === 'delay') return delay();
    return limit();
  }

  function setValue(key, value) {
    put(key, value);
    if (key === 'behavior') drawMenu();
    view = { kind: 'settings' };
    render();
    syncWithRetry();
  }

  function settingTitle(key) {
    if (key === 'behavior') return 'When a video ends';
    if (key === 'delay') return 'Delay';
    return 'Video limit';
  }

  function render() {
    const panel = document.getElementById('ytac-panel');
    if (!panel) return;
    panel.textContent = '';

    const title = document.createElement('h2');
    if (view.kind === 'settings') {
      title.textContent = 'Autoplay';
      panel.append(title);
      panel.append(
        settingRow('When a video ends', BEHAVIOR_LABELS[behavior()], () => {
          view = { kind: 'options', key: 'behavior' };
          render();
        }),
        settingRow('Delay', `${delay()}s`, () => {
          view = { kind: 'options', key: 'delay' };
          render();
        }),
        settingRow('Video limit', limit() ? String(limit()) : 'Off', () => {
          view = { kind: 'options', key: 'limit' };
          render();
        }),
        settingRow('Pause when tab hidden', flag('hiddenPause') ? 'On' : 'Off', () => {
          put('hiddenPause', !flag('hiddenPause'));
          render();
        }),
        settingRow('Skip Shorts', flag('skipShorts') ? 'On' : 'Off', () => {
          put('skipShorts', !flag('skipShorts'));
          render();
        })
      );
    } else {
      const key = view.key;
      title.textContent = settingTitle(key);
      panel.append(title);
      panel.append(
        optionRow('\u2190 Back', false, () => {
          view = { kind: 'settings' };
          render();
        })
      );
      for (const [value, label] of optionList(key)) {
        panel.append(optionRow(label, currentValue(key) === value, () => setValue(key, value)));
      }
    }

    const active = panel.querySelector('[aria-current="true"]');
    const first = panel.querySelector('button');
    (active || first)?.focus();
  }

  function openPanel() {
    if (document.getElementById('ytac-backdrop')) return;
    const style = document.createElement('style');
    style.id = 'ytac-style';
    style.textContent = CSS;
    document.head.append(style);

    const backdrop = document.createElement('div');
    backdrop.id = 'ytac-backdrop';
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) closePanel();
    });

    const panel = document.createElement('div');
    panel.id = 'ytac-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Autoplay');

    backdrop.append(panel);
    document.body.append(backdrop);
    document.addEventListener('keydown', onKey, true);
    view = { kind: 'settings' };
    render();
  }

  let menuId = null;

  function drawMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    if (menuId !== null && typeof GM_unregisterMenuCommand === 'function') GM_unregisterMenuCommand(menuId);
    menuId = GM_registerMenuCommand(`Autoplay: ${BEHAVIOR_LABELS[behavior()]}`, openPanel);
  }

  drawMenu();
  document.addEventListener('yt-navigate-finish', syncWithRetry);
  window.addEventListener('yt-page-data-updated', syncWithRetry);
  syncWithRetry();
})();

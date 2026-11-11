// ==UserScript==
// @name         YouTube: Custom
// @namespace    https://github.com/Afadfath03/Userscript
// @version      1.1
// @description  All in one: hide people shelf, expand description, preferred resolution, autoplay control and playback defaults
// @author       Afadfath03
// @homepageURL  https://github.com/Afadfath03/Userscript
// @supportURL   https://github.com/Afadfath03/Userscript/issues
// @downloadURL  https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-custom.user.js
// @updateURL    https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-custom.user.js
// @license      Apache-2.0
// @match        https://www.youtube.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// ==/UserScript==

(() => {
  const get = (key, fallback) => {
    const v = GM_getValue(`ytc.${key}`, fallback);
    return v === undefined || v === null ? fallback : v;
  };
  const put = (key, value) => GM_setValue(`ytc.${key}`, value);
  const currentVideo = () => document.querySelector('#movie_player video');
  const playerEl = () => document.getElementById('movie_player');

  const QUALITY = [
    ['auto', 'Auto (YouTube default)'],
    ['highest', 'Highest available'],
    ['highres', '4320p'],
    ['hd2880', '2880p'],
    ['hd2160', '2160p'],
    ['hd1440', '1440p'],
    ['hd1080', '1080p'],
    ['hd720', '720p'],
    ['large', '480p'],
    ['medium', '360p'],
    ['small', '240p'],
    ['tiny', '144p'],
  ];
  const BEHAVIORS = [
    ['leave', 'Leave as-is'],
    ['next', 'Next immediately'],
    ['wait', 'Wait then next'],
    ['stop', 'Stop at end'],
    ['loop', 'Loop current'],
  ];
  const DELAYS = [[0, '0s'], [3, '3s'], [5, '5s'], [10, '10s'], [15, '15s'], [30, '30s']];
  const LIMITS = [[0, 'Off'], [3, '3'], [5, '5'], [10, '10'], [20, '20']];
  const SPEEDS = [['leave', 'Leave as-is'], [0.75, '0.75x'], [1, '1x'], [1.25, '1.25x'], [1.5, '1.5x'], [1.75, '1.75x'], [2, '2x']];
  const VOLUMES = [['leave', 'Leave as-is'], [0, '0%'], [10, '10%'], [20, '20%'], [30, '30%'], [40, '40%'], [50, '50%'], [60, '60%'], [70, '70%'], [80, '80%'], [90, '90%'], [100, '100%']];
  const ONOFF = [['leave', 'Leave as-is'], ['on', 'On'], ['off', 'Off']];
  const THEATERS = ONOFF;
  const SUBTITLES = ONOFF;
  const AUDIOS = [['leave', 'Leave as-is'], ['original', 'Original (first track)']];

  const FEATURES = [
    {
      id: 'people',
      title: 'YouTube: Hide "These people are mentioned in the video"',
      short: 'Hide People Mentioned',
      desc: 'Removes the shelf under the player that lists people mentioned in the video. YouTube rebuilds that shelf on every page, so the removal runs again each time it appears.',
      rows: [],
    },
    {
      id: 'expand',
      title: 'YouTube: Auto Expand Description',
      short: 'Expand Description',
      desc: 'Clicks the description expander on the watch page, so chapters and links are visible without the extra click. It retries a few times, then stops.',
      rows: [],
    },
    {
      id: 'resolution',
      title: 'YouTube: Preferred Resolution',
      short: 'Preferred Resolution',
      desc: 'Starts each video at the quality you pick. When the video does not offer that level, the highest level below it is used instead.',
      rows: [{ key: 'quality', label: 'Quality', type: 'choice', def: 'auto', options: QUALITY }],
    },
    {
      id: 'autoplay',
      title: 'YouTube: Autoplay Control',
      short: 'Autoplay Control',
      desc: 'Decides what happens when a video ends: advance, wait, stop or loop. The limit counts how many videos this tab has advanced through.',
      rows: [
        { key: 'behavior', label: 'When a video ends', type: 'choice', def: 'leave', options: BEHAVIORS },
        { key: 'delay', label: 'Delay', type: 'choice', def: 5, options: DELAYS },
        { key: 'limit', label: 'Video limit', type: 'choice', def: 0, options: LIMITS },
        { key: 'hiddenPause', label: 'Pause when tab hidden', type: 'toggle', def: false },
        { key: 'skipShorts', label: 'Skip Shorts', type: 'toggle', def: false },
      ],
    },
    {
      id: 'playback',
      title: 'YouTube: Playback Defaults',
      short: 'Playback Defaults',
      desc: 'Sets speed, theater mode, volume, subtitles and audio track for every video. Optional hotkeys change speed with [ and ], and auto-pause stops playback while the tab is hidden.',
      rows: [
        { key: 'speed', label: 'Speed', type: 'choice', def: 'leave', options: SPEEDS },
        { key: 'hotkeys', label: 'Speed hotkeys', type: 'toggle', def: false },
        { key: 'theater', label: 'Theater mode', type: 'choice', def: 'leave', options: THEATERS },
        { key: 'volume', label: 'Volume', type: 'choice', def: 'leave', options: VOLUMES },
        { key: 'subtitles', label: 'Subtitles', type: 'choice', def: 'leave', options: SUBTITLES },
        { key: 'audio', label: 'Audio track', type: 'choice', def: 'leave', options: AUDIOS },
        { key: 'pauseHidden', label: 'Pause when hidden', type: 'toggle', def: false },
      ],
    },
  ];

  const featureById = (id) => FEATURES.find((f) => f.id === id);

  function read(row) {
    const v = get(row.key, row.def);
    if (row.type === 'toggle') return v === true;
    return row.options.some(([value]) => value === v) ? v : row.def;
  }

  function valueLabel(row) {
    const value = read(row);
    if (row.type === 'toggle') return value ? 'On' : 'Off';
    const hit = row.options.find(([v]) => v === value);
    return hit ? hit[1] : String(value);
  }

  const CSS = `
#ytc-backdrop{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5)}
#ytc-panel{width:340px;max-width:88vw;max-height:calc(100vh - 24px);overflow:auto;padding:18px 0 10px;border-radius:12px;background:var(--yt-spec-base-background,#fff);color:var(--yt-spec-text-primary,#0f0f0f);box-shadow:0 12px 32px rgba(0,0,0,.45);font-family:Roboto,Arial,sans-serif}
#ytc-panel h2{margin:0;padding:0 20px;font-size:17px;font-weight:600;line-height:1.3}
#ytc-panel .ytc-desc{margin:8px 0 0;padding:0 20px;font-size:13px;line-height:1.5;color:var(--yt-spec-text-secondary,#606060)}
#ytc-panel hr{margin:16px 20px 20px;border:0;border-top:1px solid var(--yt-spec-10-percent-layer,rgba(128,128,128,.3))}
#ytc-panel .ytc-section{margin:0;padding:0 20px 4px;font-size:13px;font-weight:500;color:var(--yt-spec-text-secondary,#606060)}
#ytc-panel button{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;padding:0 20px;border:0;background:none;color:inherit;font:inherit;font-size:14px;text-align:left;cursor:pointer}
#ytc-panel button:hover{background:var(--yt-spec-badge-chip-background,rgba(0,0,0,.05))}
#ytc-panel button:focus-visible{outline:2px solid var(--yt-spec-call-to-action,#065fd4);outline-offset:-2px}
#ytc-panel .ytc-mark{flex:0 0 14px;font-size:14px;line-height:1;color:inherit}
#ytc-panel .ytc-value{margin-left:auto;font-size:13px;color:var(--yt-spec-text-secondary,#606060)}
#ytc-panel button[aria-current="true"]{font-weight:500}
`;

  let panelState = null;

  function closePanel() {
    document.removeEventListener('keydown', panelKey, true);
    document.getElementById('ytc-backdrop')?.remove();
    document.getElementById('ytc-style')?.remove();
    panelState = null;
  }

  function panelKey(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closePanel();
      return;
    }
    if (e.key !== 'Tab') return;
    const panel = document.getElementById('ytc-panel');
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
    current.className = 'ytc-value';
    current.textContent = value;
    button.append(name, current);
    button.addEventListener('click', onClick);
    return button;
  }

  function optionRow(label, active, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    const mark = document.createElement('span');
    mark.className = 'ytc-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = active ? '\u2713' : '';
    button.append(mark, document.createTextNode(label));
    if (active) button.setAttribute('aria-current', 'true');
    button.addEventListener('click', onClick);
    return button;
  }

  function notifyChange() {
    document.dispatchEvent(new Event('ytc-change'));
  }

  function render() {
    const panel = document.getElementById('ytc-panel');
    if (!panel || !panelState) return;
    const feature = featureById(panelState.feature);
    if (!feature) return;
    panel.textContent = '';

    if (panelState.view === 'options') {
      const row = feature.rows.find((r) => r.key === panelState.rowKey);
      if (!row) return;
      const title = document.createElement('h2');
      title.textContent = row.label;
      panel.append(title);

      const back = document.createElement('button');
      back.type = 'button';
      back.textContent = '\u2190 Back';
      back.addEventListener('click', () => {
        panelState.view = 'settings';
        render();
      });
      panel.append(back);

      const current = read(row);
      for (const [value, label] of row.options) {
        panel.append(
          optionRow(label, current === value, () => {
            put(row.key, value);
            panelState.view = 'settings';
            render();
            notifyChange();
          })
        );
      }
    } else {
      const title = document.createElement('h2');
      title.textContent = feature.title;
      const desc = document.createElement('p');
      desc.className = 'ytc-desc';
      desc.textContent = feature.desc;
      const divider = document.createElement('hr');
      const section = document.createElement('p');
      section.className = 'ytc-section';
      section.textContent = 'Settings';
      panel.append(title, desc, divider, section);

      const rows = [{ key: `${feature.id}On`, label: 'Enabled', type: 'toggle', def: true }, ...feature.rows];
      for (const row of rows) {
        panel.append(
          settingRow(row.label, valueLabel(row), () => {
            if (row.type === 'toggle') {
              put(row.key, !read(row));
              render();
              notifyChange();
              return;
            }
            panelState.view = 'options';
            panelState.rowKey = row.key;
            render();
          })
        );
      }
    }

    const active = panel.querySelector('[aria-current="true"]');
    const first = panel.querySelector('button');
    (active || first)?.focus();
  }

  function openPanel(featureId) {
    if (document.getElementById('ytc-backdrop')) closePanel();
    const style = document.createElement('style');
    style.id = 'ytc-style';
    style.textContent = CSS;
    document.head.append(style);

    const backdrop = document.createElement('div');
    backdrop.id = 'ytc-backdrop';
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) closePanel();
    });

    const panel = document.createElement('div');
    panel.id = 'ytc-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', featureById(featureId)?.short || 'YouTube Custom');

    backdrop.append(panel);
    document.body.append(backdrop);
    document.addEventListener('keydown', panelKey, true);
    panelState = { feature: featureId, view: 'settings', rowKey: null };
    render();
  }

  // ---------- hide people shelf ----------

  {
    const PHRASES = [
      'these people are mentioned in the video',
      'orang-orang ini disebutkan dalam video',
    ].map((s) => s.replace(/\s+/g, ' ').toLowerCase());
    const STOP_TAGS = new Set(['BODY', 'YTD-APP', 'YTD-WATCH-FLEXY', 'YTD-WATCH-GRID']);
    const STOP_IDS = new Set(['below', 'primary', 'columns']);
    const squash = (s) => s.replace(/\s+/g, ' ').toLowerCase();

    const enabled = () => get('peopleOn', true) === true;
    const hidden = new Set();

    function hideShelf(start) {
      const own = squash(start.textContent).length;
      let node = start;
      while (node.parentElement) {
        const parent = node.parentElement;
        if (STOP_TAGS.has(parent.tagName) || STOP_IDS.has(parent.id)) break;
        if (squash(parent.textContent).length > own + 400) break;
        node = parent;
      }
      node.style.setProperty('display', 'none', 'important');
      hidden.add(node);
    }

    function restore() {
      for (const node of hidden) node.style.removeProperty('display');
      hidden.clear();
    }

    function scanPage() {
      if (location.pathname !== '/watch' || !document.body) return;
      const target = locate(document.body);
      if (target) hideShelf(target);
    }

    function locate(root) {
      let all;
      try {
        all = squash(root.textContent || '');
      } catch {
        return null;
      }
      if (!PHRASES.some((p) => all.includes(p))) return null;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (PHRASES.some((p) => squash(node.nodeValue || '').includes(p))) return node.parentElement;
      }
      return null;
    }

    const queue = new Set();
    let raf = 0;

    function flush() {
      raf = 0;
      const batch = [...queue];
      queue.clear();
      if (!enabled()) return;
      for (const node of batch) {
        if (!node.isConnected) continue;
        const target = locate(node);
        if (target) hideShelf(target);
      }
    }

    document.addEventListener('ytc-change', () => {
      if (enabled()) scanPage();
      else restore();
    });

    new MutationObserver((list) => {
      if (!enabled() || location.pathname !== '/watch') return;
      for (const mutation of list) {
        for (const node of mutation.addedNodes) if (node.nodeType === 1) queue.add(node);
      }
      if (queue.size && !raf) raf = requestAnimationFrame(flush);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  // ---------- expand description ----------

  {
    const MAX_TRIES = 5;
    let raf = 0;
    let tries = 0;
    let url = '';
    let done = '';

    const enabled = () => get('expandOn', true) === true;

    function scan() {
      raf = 0;
      if (!enabled() || location.pathname !== '/watch') return;
      if (location.search !== url) {
        url = location.search;
        tries = 0;
      }
      if (url === done) return;
      const box = document.querySelector('#description-inline-expander');
      if (!box) return;
      const button = box.querySelector('#expand');
      if (!button || button.hidden) return;
      if (tries++ >= MAX_TRIES) return;
      button.click();
      requestAnimationFrame(() => {
        // The click only counts once YouTube actually hides the button
        if (button.hidden || !button.isConnected) done = url;
        else setTimeout(schedule, 300);
      });
    }

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(scan);
    };

    document.addEventListener('ytc-change', () => {
      if (!enabled()) return;
      done = '';
      tries = 0;
      schedule();
    });

    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('yt-navigate-finish', schedule, true);
    schedule();
  }

  // ---------- preferred resolution ----------

  {
    const ORDER = ['highres', 'hd2880', 'hd2160', 'hd1440', 'hd1080', 'hd720', 'large', 'medium', 'small', 'tiny'];
    const enabled = () => get('resolutionOn', true) === true;
    const quality = () => {
      const value = get('quality', 'auto');
      return ORDER.includes(value) || value === 'auto' || value === 'highest' ? value : 'auto';
    };

    function resolveLevel(pref, available) {
      if (pref === 'auto' || !available.length) return null;
      if (pref === 'highest') return available[0];
      const rank = ORDER.indexOf(pref);
      const ranked = available.filter((q) => ORDER.includes(q));
      if (!ranked.length) return null;
      if (ranked.includes(pref)) return pref;
      const below = ranked.filter((q) => ORDER.indexOf(q) >= rank);
      return below[0] || ranked[ranked.length - 1];
    }

    function target() {
      const el = playerEl();
      if (!el || typeof el.getAvailableQualityLevels !== 'function') return null;
      // Quality is locked during ads; the loop retries after them
      if (el.classList.contains('ad-showing')) return null;
      return resolveLevel(quality(), el.getAvailableQualityLevels() || []);
    }

    function apply() {
      const el = playerEl();
      const code = target();
      if (!el || !code) return;
      if (typeof el.setPlaybackQualityRange === 'function') el.setPlaybackQualityRange(code, code);
      if (typeof el.setPlaybackQuality === 'function') el.setPlaybackQuality(code);
    }

    let timer = 0;
    let tries = 0;

    function start() {
      clearInterval(timer);
      tries = 0;
      if (!enabled() || quality() === 'auto') return;
      timer = setInterval(() => {
        const el = playerEl();
        const code = target();
        if (el && code && typeof el.getPlaybackQuality === 'function' && el.getPlaybackQuality() === code) {
          clearInterval(timer);
          return;
        }
        apply();
        if (++tries >= 12) clearInterval(timer);
      }, 400);
    }

    document.addEventListener('yt-navigate-finish', start);
    window.addEventListener('yt-page-data-updated', start);
    document.addEventListener('ytc-change', start);
    start();
  }

  // ---------- autoplay control ----------

  {
    const COUNT_KEY = 'ytc.count';
    const enabled = () => get('autoplayOn', true) === true;
    const behavior = () => {
      const value = get('behavior', 'leave');
      return BEHAVIORS.some(([v]) => v === value) ? value : 'leave';
    };
    const delay = () => {
      const value = get('delay', 5);
      return DELAYS.some(([v]) => v === value) ? value : 5;
    };
    const limit = () => {
      const value = get('limit', 0);
      return LIMITS.some(([v]) => v === value) ? value : 0;
    };
    const hiddenPause = () => get('hiddenPause', false) === true;
    const skipShorts = () => get('skipShorts', false) === true;

    function setAutoplay(on) {
      const el = document.querySelector('.ytp-autonav-toggle-button');
      if (!el) return;
      if ((el.getAttribute('aria-checked') === 'true') === on) return;
      (el.closest('button') || el).click();
    }

    function pickNext() {
      const cards = document.querySelectorAll('#movie_player .ytp-videowall-still, #movie_player .ytp-ce-video');
      const related = document.querySelectorAll(
        '#secondary ytd-compact-video-renderer a#thumbnail, ytd-watch-next-secondary-results-container a#thumbnail'
      );
      for (const el of [...cards, ...related]) {
        if (!el.href) continue;
        if (skipShorts() && el.href.includes('/shorts/')) continue;
        return el;
      }
      return null;
    }

    function count() {
      try {
        const n = Number.parseInt(sessionStorage.getItem(COUNT_KEY) || '0', 10);
        return Number.isFinite(n) && n > 0 ? n : 0;
      } catch {
        return 0;
      }
    }

    function bumpCount() {
      try {
        sessionStorage.setItem(COUNT_KEY, String(count() + 1));
      } catch {
        // Storage unavailable: the limit stops applying
      }
    }

    let endTimer = 0;

    function onEnded() {
      if (!enabled()) return;
      const mode = behavior();
      if (mode === 'leave') return;
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
      if (hiddenPause() && document.hidden) return;
      clearTimeout(endTimer);
      endTimer = setTimeout(() => {
        const target = pickNext();
        if (!target) {
          // Nothing to click: hand back to the YouTube countdown
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
      if (!enabled()) return;
      hookVideo();
      if (behavior() === 'leave') return;
      // Managed modes decide on their own when to move on
      setAutoplay(false);
    }

    let syncTries = 0;

    function startSync() {
      syncTries = 0;
      const tick = () => {
        sync();
        if (document.querySelector('.ytp-autonav-toggle-button') || ++syncTries > 20) return;
        setTimeout(tick, 250);
      };
      tick();
    }

    document.addEventListener('yt-navigate-finish', startSync);
    window.addEventListener('yt-page-data-updated', startSync);
    document.addEventListener('ytc-change', startSync);
    startSync();
  }

  // ---------- playback defaults ----------

  {
    const enabled = () => get('playbackOn', true) === true;
    const speed = () => {
      const value = get('speed', 'leave');
      return SPEEDS.some(([v]) => v === value) ? value : 'leave';
    };
    const volume = () => {
      const value = get('volume', 'leave');
      return VOLUMES.some(([v]) => v === value) ? value : 'leave';
    };
    const theater = () => {
      const value = get('theater', 'leave');
      return THEATERS.some(([v]) => v === value) ? value : 'leave';
    };
    const subtitles = () => {
      const value = get('subtitles', 'leave');
      return SUBTITLES.some(([v]) => v === value) ? value : 'leave';
    };
    const audio = () => {
      const value = get('audio', 'leave');
      return AUDIOS.some(([v]) => v === value) ? value : 'leave';
    };
    const hotkeys = () => get('hotkeys', false) === true;
    const pauseHidden = () => get('pauseHidden', false) === true;

    function theaterOn() {
      const flexy = document.querySelector('ytd-watch-flexy');
      return flexy ? flexy.hasAttribute('theater') : null;
    }

    let theaterClickedAt = 0;
    let theaterClicks = 0;

    function applyTheater() {
      if (theater() === 'leave' || document.fullscreenElement) return true;
      const on = theaterOn();
      if (on === null || on === (theater() === 'on')) return true;
      // Clicking twice in a row undoes the first click, so space the attempts out
      if (Date.now() - theaterClickedAt < 800) return false;
      if (theaterClicks >= 3) return true;
      const button = document.querySelector('.ytp-size-button');
      if (!button) return false;
      theaterClickedAt = Date.now();
      theaterClicks++;
      button.click();
      return false;
    }

    function applyVideo() {
      const video = currentVideo();
      if (!video) return true;
      let done = true;
      const rate = speed();
      if (rate !== 'leave' && video.playbackRate !== rate) {
        video.playbackRate = rate;
        if (video.playbackRate !== rate) done = false;
      }
      const level = volume();
      if (level !== 'leave') {
        const target = level / 100;
        if (Math.abs(video.volume - target) > 0.001) video.volume = target;
        if (target > 0 && video.muted) video.muted = false;
        if (Math.abs(video.volume - target) > 0.001) done = false;
      }
      return done;
    }

    let subtitleClickedAt = 0;
    let subtitleClicks = 0;

    function applySubtitles() {
      if (subtitles() === 'leave') return true;
      const button = document.querySelector('.ytp-subtitles-button');
      // Videos without captions keep the button hidden and there is nothing to set
      if (!button || button.hidden || button.getAttribute('aria-pressed') === null) return true;
      const on = button.getAttribute('aria-pressed') === 'true';
      if (on === (subtitles() === 'on')) return true;
      if (Date.now() - subtitleClickedAt < 400) return false;
      // Toggling is not idempotent, so stop after two attempts
      if (subtitleClicks >= 2) return true;
      subtitleClickedAt = Date.now();
      subtitleClicks++;
      button.click();
      return false;
    }

    let audioSetAt = 0;
    let audioClicks = 0;

    function applyAudio() {
      if (audio() === 'leave') return true;
      const el = playerEl();
      if (!el || typeof el.getAvailableAudioTracks !== 'function') return true;
      const tracks = el.getAvailableAudioTracks() || [];
      if (tracks.length < 2) return true;
      const first = tracks[0];
      const active = typeof el.getAudioTrack === 'function' ? el.getAudioTrack() : null;
      if (active && active.id === first.id) return true;
      if (Date.now() - audioSetAt < 1200) return false;
      if (audioClicks >= 3) return true;
      audioSetAt = Date.now();
      audioClicks++;
      if (typeof el.setAudioTrack === 'function') el.setAudioTrack(first);
      return false;
    }

    let tries = 0;

    function pass() {
      return applyVideo() && applyTheater() && applySubtitles() && applyAudio();
    }

    function startSync() {
      tries = 0;
      theaterClicks = 0;
      if (!enabled()) return;
      subtitleClicks = 0;
      audioClicks = 0;
      const tick = () => {
        if (pass() || ++tries > 16) return;
        setTimeout(tick, 250);
      };
      tick();
    }

    const hookedVideo = new WeakSet();

    function hookVideo() {
      const video = currentVideo();
      if (!video || hookedVideo.has(video)) return;
      hookedVideo.add(video);
      video.addEventListener('loadedmetadata', startSync);
    }

    function stepRate(delta) {
      const video = currentVideo();
      if (!video) return;
      const next = delta === 0 ? 1 : video.playbackRate + delta;
      video.playbackRate = Math.min(2, Math.max(0.25, Math.round(next * 4) / 4));
    }

    document.addEventListener(
      'keydown',
      (e) => {
        if (!enabled() || !hotkeys() || e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key !== '[' && e.key !== ']' && e.key !== '0') return;
        if (document.getElementById('ytc-panel')) return;
        const target = e.target;
        if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
        e.preventDefault();
        e.stopPropagation();
        stepRate(e.key === '0' ? 0 : e.key === ']' ? 0.25 : -0.25);
      },
      true
    );

    let pausedByUs = false;

    document.addEventListener('visibilitychange', () => {
      if (!enabled() || !pauseHidden()) return;
      const video = currentVideo();
      if (!video) return;
      if (document.hidden) {
        if (!video.paused) {
          pausedByUs = true;
          video.pause();
        }
        return;
      }
      if (!pausedByUs) return;
      pausedByUs = false;
      video.play().catch(() => {});
    });

    document.addEventListener('yt-navigate-finish', () => {
      hookVideo();
      startSync();
    });
    window.addEventListener('yt-page-data-updated', () => {
      hookVideo();
      startSync();
    });
    document.addEventListener('ytc-change', startSync);
    hookVideo();
    startSync();
  }

  // ---------- menu ----------

  const menuIds = [];

  function drawMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    if (menuIds.length) {
      if (typeof GM_unregisterMenuCommand !== 'function') return;
      for (const id of menuIds) GM_unregisterMenuCommand(id);
      menuIds.length = 0;
    }
    for (const feature of FEATURES) {
      const id = GM_registerMenuCommand(feature.short, () => openPanel(feature.id));
      if (id !== undefined && id !== null) menuIds.push(id);
    }
  }

  drawMenu();
})();

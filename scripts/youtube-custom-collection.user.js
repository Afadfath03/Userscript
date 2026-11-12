// ==UserScript==
// @name         YouTube: Custom Collection
// @namespace    https://github.com/Afadfath03/Userscript
// @version      1.7
// @description  Collection of YouTube userscripts made by me, bundled into one install with per-feature settings
// @author       Afadfath03
// @homepageURL  https://github.com/Afadfath03/Userscript
// @supportURL   https://github.com/Afadfath03/Userscript/issues
// @downloadURL  https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-custom-collection.user.js
// @updateURL    https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-custom-collection.user.js
// @icon         https://raw.githubusercontent.com/Afadfath03/Userscript/main/assets/icons/youtube-custom-collection.png
// @license      MIT
// @match        https://www.youtube.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_deleteValue
// @grant        GM_info
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
  const PROMPTS = [['yes', 'Yes'], ['no', 'No'], ['leave', 'Leave as-is']];

  const FEATURES = [
    {
      id: 'people',
      title: 'YouTube: Hide "These people are mentioned in the video"',
      short: 'Hide People Mentioned',
      desc: 'Removes the shelf under the player that lists people mentioned in the video. YouTube rebuilds that shelf on every page, so the removal runs again each time it appears.',
      rows: [],
    },
    {
      id: 'members',
      title: 'YouTube: Hide Members Only and Premium',
      short: 'Hide Members Only',
      desc: 'Hides videos marked Members only or Premium across feeds, search results, sidebars and playlists. The badge text is what gets matched, so the removal survives markup changes.',
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
    {
      id: 'paused',
      title: 'YouTube: Dismiss "Video paused. Continue watching?"',
      short: 'Dismiss Paused Prompt',
      desc: 'Answers the "Video paused. Continue watching?" and "Are you still watching?" prompts. Pick Yes to carry on playing, No to stay paused, or leave the prompt untouched. Only dialogs containing those phrases are affected.',
      rows: [{ key: 'answer', label: 'Answer', type: 'choice', def: 'yes', options: PROMPTS }],
    },
    {
      id: 'quiet',
      title: 'YouTube: Quiet Page',
      short: 'Quiet Page',
      desc: 'Stops work on the page that plays video you never asked for. Thumbnail previews are paused instead of playing, the end screen video wall is hidden, and the ambient mode glow is removed.',
      rows: [
        { key: 'quietPreviews', label: 'Stop thumbnail previews', type: 'toggle', def: true },
        { key: 'quietEndScreen', label: 'Hide end screen', type: 'toggle', def: true },
        { key: 'quietAmbient', label: 'Disable ambient mode', type: 'toggle', def: true },
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
#ytc-panel,#ytc-panel *{box-sizing:border-box}
#ytc-backdrop{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);backdrop-filter:blur(2px)}
#ytc-panel{width:clamp(320px,88vw,420px);height:calc(100vh - 24px);height:min(76dvh,560px);overflow:auto;padding:0 0 10px;border-radius:14px;background:var(--yt-spec-base-background,#fff);color:var(--yt-spec-text-primary,#0f0f0f);box-shadow:0 16px 40px rgba(0,0,0,.45);font-family:Roboto,Arial,sans-serif;font-size:14px;scroll-padding-top:63px}
#ytc-panel .ytc-header{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:8px;padding:6px 8px 6px 20px;background:var(--yt-spec-base-background,#fff);border-bottom:1px solid var(--yt-spec-10-percent-layer,rgba(128,128,128,.3))}
#ytc-panel .ytc-header.with-back{padding-left:8px}
#ytc-panel h2{flex:1;margin:0;padding:0;font-size:16px;font-weight:600;line-height:1.3}
#ytc-panel .ytc-close,#ytc-panel .ytc-back{width:44px;height:44px;min-height:44px;justify-content:center;padding:0;border-radius:50%;font-size:18px;line-height:1}
#ytc-panel .ytc-close{font-size:22px}
#ytc-panel .ytc-desc{margin:12px 0 0;padding:0 20px;font-size:13px;line-height:1.5;color:var(--yt-spec-text-secondary,#606060)}
#ytc-panel hr{margin:14px 20px 16px;border:0;border-top:1px solid var(--yt-spec-10-percent-layer,rgba(128,128,128,.3))}
#ytc-panel .ytc-section{margin:0;padding:4px 20px 2px;font-size:11px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--yt-spec-text-secondary,#606060)}
#ytc-panel button{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;padding:0 20px;border:0;background:none;color:inherit;font:inherit;font-size:14px;line-height:1.4;text-align:left;cursor:pointer}
#ytc-panel button:hover{background:var(--yt-spec-badge-chip-background,rgba(0,0,0,.05))}
#ytc-panel button:active{background:var(--yt-spec-10-percent-layer,rgba(0,0,0,.08))}
#ytc-panel button:focus-visible{outline:2px solid var(--yt-spec-call-to-action,#065fd4);outline-offset:-2px}
#ytc-panel .ytc-mark{flex:0 0 14px;font-size:14px;line-height:1;color:inherit}
#ytc-panel .ytc-value{margin-left:auto;font-size:13px;color:var(--yt-spec-text-secondary,#606060)}
#ytc-panel .ytc-chevron{padding-left:10px;font-size:18px;line-height:1;color:var(--yt-spec-text-secondary,#606060)}
#ytc-panel button[aria-current="true"]{font-weight:500}
#ytc-panel textarea{display:block;width:calc(100% - 40px);height:110px;margin:0 20px 10px;padding:8px 10px;border:1px solid var(--yt-spec-10-percent-layer,rgba(128,128,128,.3));border-radius:8px;background:var(--yt-spec-badge-chip-background,rgba(0,0,0,.05));color:inherit;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;resize:vertical}
#ytc-panel .ytc-status{margin:0;padding:8px 20px 12px;font-size:12px;line-height:1.4;color:var(--yt-spec-text-secondary,#606060)}
#ytc-panel .ytc-info{display:flex;gap:10px;align-items:baseline;padding:6px 20px;font-size:13px;line-height:1.4}
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
    const items = [...panel.querySelectorAll('button, textarea')];
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

  function panelHeader(titleText, onBack) {
    const bar = document.createElement('div');
    bar.className = onBack ? 'ytc-header with-back' : 'ytc-header';
    if (onBack) {
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'ytc-back';
      back.setAttribute('aria-label', 'Back');
      back.textContent = '\u2190';
      back.addEventListener('click', onBack);
      bar.append(back);
    }
    const title = document.createElement('h2');
    title.textContent = titleText;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'ytc-close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '\u00d7';
    close.addEventListener('click', closePanel);
    bar.append(title, close);
    return bar;
  }

  function backToHub() {
    panelState.view = 'hub';
    render();
  }

  const chevron = () => {
    const mark = document.createElement('span');
    mark.className = 'ytc-chevron';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = '\u203a';
    return mark;
  };

  function notifyChange() {
    document.dispatchEvent(new Event('ytc-change'));
  }

  function render() {
    const panel = document.getElementById('ytc-panel');
    if (!panel || !panelState) return;
    if (panelState.view === 'hub') {
      renderHub(panel);
      return;
    }
    if (panelState.view === 'overview') {
      renderOverview(panel);
      return;
    }
    if (panelState.view === 'diagnostics') {
      renderDiagnostics(panel);
      return;
    }
    if (panelState.view === 'backup') {
      renderBackup(panel);
      return;
    }
    const feature = featureById(panelState.feature);
    if (!feature) return;
    panel.textContent = '';

    if (panelState.view === 'options') {
      const row = feature.rows.find((r) => r.key === panelState.rowKey);
      if (!row) return;
      panel.append(panelHeader(row.label));

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
      const bar = panelHeader(feature.title);
      const desc = document.createElement('p');
      desc.className = 'ytc-desc';
      desc.textContent = feature.desc;
      const divider = document.createElement('hr');
      const section = document.createElement('p');
      section.className = 'ytc-section';
      section.textContent = 'Settings';
      panel.append(bar, desc, divider, section);

      const rows = [{ key: `${feature.id}On`, label: 'Enabled', type: 'toggle', def: true }, ...feature.rows];
      for (const row of rows) {
        const button = settingRow(row.label, valueLabel(row), () => {
          if (row.type === 'toggle') {
            put(row.key, !read(row));
            render();
            notifyChange();
            return;
          }
          panelState.view = 'options';
          panelState.rowKey = row.key;
          render();
        });
        // The chevron marks rows that open a subview
        if (row.type !== 'toggle') button.append(chevron());
        panel.append(button);
      }
    }

    const active = panel.querySelector('[aria-current="true"]');
    const first = panel.querySelector('button:not(.ytc-close):not(.ytc-back)');
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
    panelState = { feature: featureId, view: featureById(featureId) ? 'settings' : featureId, rowKey: null };
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

  // ---------- hide members only ----------

  {
    const squash = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
    const LABELS = new Set(['members only', 'premium', 'khusus anggota']);
    const BADGE = 'yt-badge-shape, badge-shape, ytd-badge-supported-renderer';
    const CARD = [
      'ytd-rich-item-renderer',
      'ytd-video-renderer',
      'ytd-compact-video-renderer',
      'ytd-grid-video-renderer',
      'ytd-playlist-video-renderer',
      'ytd-playlist-panel-video-renderer',
      'yt-lockup-view-model',
    ].join(',');

    const enabled = () => get('membersOn', true) === true;
    const hidden = new Map();

    function videoIdOf(card) {
      const link = card.querySelector('a[href*="/watch?v="], a[href*="/shorts/"]');
      if (!link) return '';
      const url = link.getAttribute('href') || '';
      if (url.includes('/shorts/')) return url.split('/shorts/')[1].split(/[?&/]/)[0];
      const match = url.match(/[?&]v=([^&]+)/);
      return match ? match[1] : '';
    }

    function hideCard(card, id) {
      card.style.setProperty('display', 'none', 'important');
      // Autoplay checks this before picking the next video; the value is the video it hid
      card.setAttribute('data-ytc-off', id);
      hidden.set(card, id);
    }

    function unhideCard(card) {
      card.style.removeProperty('display');
      card.removeAttribute('data-ytc-off');
      hidden.delete(card);
    }

    function restore() {
      for (const card of [...hidden.keys()]) unhideCard(card);
      hidden.clear();
    }

    // A card can hold several badges, so the decision is made once per card
    function markCard(card) {
      const shouldHide = [...card.querySelectorAll(BADGE)].some((badge) =>
        LABELS.has(squash(badge.textContent))
      );
      const id = videoIdOf(card);
      if (shouldHide) hideCard(card, id);
      else unhideCard(card);
    }

    // Feed elements get recycled for other videos, so a hidden card whose video
    // changed has to be judged again, not just released
    function resync() {
      for (const [card, id] of [...hidden]) {
        if (!card.isConnected) {
          hidden.delete(card);
          continue;
        }
        if (videoIdOf(card) !== id) markCard(card);
      }
    }

    function mark(root) {
      if (!root.isConnected) return;
      const cards = new Set();
      for (const badge of root.querySelectorAll(BADGE)) {
        const card = badge.closest(CARD);
        if (card) cards.add(card);
      }
      if (root.matches(BADGE)) {
        const card = root.closest(CARD);
        if (card) cards.add(card);
      }
      for (const card of cards) markCard(card);
    }

    const queue = new Set();
    let raf = 0;

    function flush() {
      raf = 0;
      const batch = [...queue];
      queue.clear();
      if (!enabled()) return;
      resync();
      for (const node of batch) mark(node);
    }

    document.addEventListener('ytc-change', () => {
      if (!enabled()) {
        restore();
        return;
      }
      resync();
      mark(document.body);
    });

    new MutationObserver((list) => {
      if (!enabled()) return;
      for (const mutation of list) {
        for (const node of mutation.addedNodes) if (node.nodeType === 1) queue.add(node);
      }
      if (queue.size && !raf) raf = requestAnimationFrame(flush);
    }).observe(document.documentElement, { childList: true, subtree: true });

    // Content already present when the script runs never fires a mutation
    if (document.body) mark(document.body);
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
        'ytd-watch-next-secondary-results-renderer yt-lockup-view-model a[href*="/watch?v="], ' +
          '#secondary ytd-compact-video-renderer a#thumbnail'
      );
      for (const el of [...cards, ...related]) {
        if (!el.href) continue;
        if (skipShorts() && el.href.includes('/shorts/')) continue;
        if (el.closest('[data-ytc-off]')) continue;
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

    // Stops YouTube's own "Up next" countdown; the only lever left when the autoplay toggle is gone
    function cancelCountdown() {
      document.querySelector('.ytp-autonav-endscreen-upnext-cancel-button')?.click();
    }

    function onEnded() {
      if (!enabled()) return;
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
      if (hiddenPause() && document.hidden) return;
      clearTimeout(endTimer);
      endTimer = setTimeout(() => {
        cancelCountdown();
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

  // ---------- dismiss paused prompt ----------

  {
    const squash = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
    const PHRASES = [
      'video paused. continue watching?',
      'video dijeda. lanjutkan menonton?',
      'are you still watching?',
      'apakah anda masih menonton?',
    ];
    const YES = new Set(['yes', 'ya', 'continue watching', 'lanjutkan menonton', 'resume']);
    const NO = new Set(['no', 'tidak', 'not now', 'bukan sekarang']);
    const DIALOG = 'yt-confirm-dialog-renderer, yt-confirm-dialog-view-model, tp-yt-paper-dialog';
    const BUTTON = 'yt-button-renderer, button, tp-yt-paper-button';

    const enabled = () => get('pausedOn', true) === true;
    const answerMode = () => {
      const value = get('answer', 'yes');
      return PROMPTS.some(([v]) => v === value) ? value : 'yes';
    };

    function answer(dialog) {
      const choice = answerMode();
      if (choice === 'leave') return;
      const text = squash(dialog.textContent || '');
      if (!PHRASES.some((p) => text.includes(p))) return;
      // Matching the label keeps No and Cancel apart from the confirming button
      const wanted = choice === 'yes' ? YES : NO;
      for (const button of dialog.querySelectorAll(BUTTON)) {
        if (!wanted.has(squash(button.textContent))) continue;
        button.click();
        return;
      }
    }

    function scan() {
      if (!enabled() || location.pathname !== '/watch') return;
      for (const dialog of document.querySelectorAll(DIALOG)) answer(dialog);
    }

    const queue = new Set();
    let raf = 0;

    function flush() {
      raf = 0;
      const batch = [...queue];
      queue.clear();
      if (!enabled() || location.pathname !== '/watch') return;
      for (const node of batch) {
        if (!node.isConnected) continue;
        if (node.matches(DIALOG)) answer(node);
        for (const dialog of node.querySelectorAll(DIALOG)) answer(dialog);
      }
    }

    new MutationObserver((list) => {
      if (!enabled()) return;
      for (const mutation of list) {
        for (const node of mutation.addedNodes) if (node.nodeType === 1) queue.add(node);
      }
      if (queue.size && !raf) raf = requestAnimationFrame(flush);
    }).observe(document.documentElement, { childList: true, subtree: true });

    document.addEventListener('ytc-change', scan);
    // Content already present when the script runs never fires a mutation
    if (document.body) scan();
  }

  // ---------- quiet page ----------

  {
    const enabled = () => get('quietOn', true) === true;
    const flag = (key) => enabled() && get(key, true) === true;

    // Lives outside the panel stylesheet: these rules act on the page, not the dialog
    const style = document.createElement('style');
    style.id = 'ytc-quiet';
    style.textContent =
      'html.ytc-quiet-end .ytp-ce-element,html.ytc-quiet-end .ytp-videowall-still,html.ytc-quiet-end .ytp-endscreen-content{display:none!important}' +
      'html.ytc-quiet-ambient #cinematics{display:none!important}';
    document.documentElement.append(style);

    function apply() {
      const root = document.documentElement;
      root.classList.toggle('ytc-quiet-end', flag('quietEndScreen'));
      root.classList.toggle('ytc-quiet-ambient', flag('quietAmbient'));
    }

    // Pausing on the event catches previews wherever they start; the player and
    // the Shorts page are not thumbnails, so they keep playing
    document.addEventListener(
      'playing',
      (event) => {
        if (!flag('quietPreviews')) return;
        const video = event.target;
        if (!(video instanceof HTMLVideoElement)) return;
        if (!video.closest('ytd-thumbnail, yt-thumbnail-view-model, ytd-playlist-thumbnail')) return;
        video.pause();
      },
      true
    );

    document.addEventListener('ytc-change', apply);
    apply();
  }

  // ---------- settings backup ----------

  const settingKeys = () => {
    const keys = new Set();
    for (const feature of FEATURES) {
      keys.add(`${feature.id}On`);
      for (const row of feature.rows) keys.add(row.key);
    }
    return keys;
  };

  const rowOf = (key) => {
    for (const feature of FEATURES) {
      for (const row of feature.rows) if (row.key === key) return row;
    }
    return null;
  };

  function validValue(key, value) {
    if (key.endsWith('On')) return typeof value === 'boolean';
    const row = rowOf(key);
    if (!row) return false;
    if (row.type === 'toggle') return typeof value === 'boolean';
    return row.options.some(([v]) => v === value);
  }

  function exportSettings() {
    const settings = {};
    for (const key of settingKeys()) {
      const value = GM_getValue(`ytc.${key}`);
      if (value !== undefined) settings[key] = value;
    }
    return JSON.stringify({ script: 'youtube-custom-collection', format: 1, settings }, null, 2);
  }

  function importSettings(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return 'That is not valid JSON.';
    }
    const settings = data && data.settings;
    if (!settings || typeof settings !== 'object') return 'That JSON has no settings object.';
    let applied = 0;
    let skipped = 0;
    for (const [key, value] of Object.entries(settings)) {
      // Keys and values outside the current features are ignored, not trusted
      if (!validValue(key, value)) {
        skipped++;
        continue;
      }
      put(key, value);
      applied++;
    }
    if (applied) {
      notifyChange();
      drawMenu();
    }
    return `Imported ${applied} setting${applied === 1 ? '' : 's'}${skipped ? `, skipped ${skipped} unknown or invalid` : ''}.`;
  }

  function renderBackup(panel) {
    panel.textContent = '';

    const bar = panelHeader('Backup', backToHub);

    const desc = document.createElement('p');
    desc.className = 'ytc-desc';
    desc.textContent = 'Copy every setting as JSON, or paste exported JSON and import it. Keys and values that do not match a setting are skipped.';
    panel.append(bar, desc, document.createElement('hr'));

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'Copy settings JSON';
    panel.append(copy);

    const box = document.createElement('textarea');
    box.spellcheck = false;
    box.setAttribute('aria-label', 'Settings JSON');
    box.placeholder = 'Paste exported JSON here';
    panel.append(box);

    const load = document.createElement('button');
    load.type = 'button';
    load.textContent = 'Import from the box';
    panel.append(load);

    const status = document.createElement('p');
    status.className = 'ytc-status';
    status.setAttribute('role', 'status');
    panel.append(status);

    copy.addEventListener('click', async () => {
      box.value = exportSettings();
      try {
        await navigator.clipboard.writeText(box.value);
        status.textContent = 'Copied to clipboard.';
      } catch {
        box.select();
        status.textContent = 'Clipboard blocked, the JSON is selected in the box.';
      }
    });

    load.addEventListener('click', () => {
      status.textContent = importSettings(box.value);
    });

    (panel.querySelector('button:not(.ytc-close):not(.ytc-back)') || panel).focus();
  }

  // ---------- overview and diagnostics ----------

  const version = () =>
    typeof GM_info === 'object' && GM_info.script ? String(GM_info.script.version) : 'unknown';

  function infoRow(label, value) {
    const row = document.createElement('div');
    row.className = 'ytc-info';
    const name = document.createElement('span');
    name.textContent = label;
    const val = document.createElement('span');
    val.className = 'ytc-value';
    val.textContent = value;
    // Whitespace-only flex items are not rendered, so this only helps textContent
    row.append(name, ' ', val);
    return row;
  }

  const isOn = (feature) => get(`${feature.id}On`, true) === true;

  function renderHub(panel) {
    panel.textContent = '';

    const bar = panelHeader('Settings');
    const desc = document.createElement('p');
    desc.className = 'ytc-desc';
    desc.textContent = 'Everything this script keeps, in one place.';
    panel.append(bar, desc, document.createElement('hr'));

    const entries = [
      ['Features', `${FEATURES.filter(isOn).length} of ${FEATURES.length} on`, 'overview'],
      ['Backup', 'JSON', 'backup'],
      ['Diagnostics', version(), 'diagnostics'],
    ];
    for (const [label, value, view] of entries) {
      const button = settingRow(label, value, () => {
        panelState.view = view;
        render();
      });
      button.append(chevron());
      panel.append(button);
    }

    (panel.querySelector('button:not(.ytc-close):not(.ytc-back)') || panel).focus();
  }

  let resetArmed = false;

  function renderOverview(panel) {
    panel.textContent = '';

    const bar = panelHeader('Features', backToHub);
    const desc = document.createElement('p');
    desc.className = 'ytc-desc';
    desc.textContent = 'Every feature in one place. A switch here is the same switch as the one inside its own panel.';
    panel.append(bar, desc, document.createElement('hr'));

    for (const feature of FEATURES) {
      panel.append(
        settingRow(feature.short, isOn(feature) ? 'On' : 'Off', () => {
          put(`${feature.id}On`, !isOn(feature));
          notifyChange();
          drawMenu();
          render();
        })
      );
    }

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = resetArmed ? 'Press again to delete every setting' : 'Reset all settings';
    reset.addEventListener('click', () => {
      if (!resetArmed) {
        resetArmed = true;
        render();
        return;
      }
      resetArmed = false;
      if (typeof GM_deleteValue === 'function') {
        for (const key of settingKeys()) GM_deleteValue(`ytc.${key}`);
      }
      notifyChange();
      drawMenu();
      render();
    });

    panel.append(document.createElement('hr'), reset);
    (resetArmed ? reset : panel.querySelector('button:not(.ytc-close):not(.ytc-back)')).focus();
  }

  function diagnosticsRows() {
    const stored = [...settingKeys()].filter((key) => GM_getValue(`ytc.${key}`) !== undefined);
    return [
      ['Script', 'youtube-custom-collection'],
      ['Version', version()],
      ['Enabled features', `${FEATURES.filter(isOn).length} of ${FEATURES.length}`],
      ['Stored settings', `${stored.length} of ${settingKeys().size} keys`],
      ['Settings size', `${exportSettings().length} bytes`],
      ['Page', location.pathname],
    ];
  }

  const diagnosticsText = () =>
    diagnosticsRows()
      .map(([label, value]) => `${label}: ${value}`)
      .join('\n');

  function renderDiagnostics(panel) {
    panel.textContent = '';

    const bar = panelHeader('Diagnostics', backToHub);
    const desc = document.createElement('p');
    desc.className = 'ytc-desc';
    desc.textContent = 'What this copy of the script sees right now. Handy when a feature stays quiet on a page.';
    panel.append(bar, desc, document.createElement('hr'));

    for (const [label, value] of diagnosticsRows()) panel.append(infoRow(label, value));

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'Copy report';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(diagnosticsText());
        copy.textContent = 'Copied';
      } catch {
        copy.textContent = 'Clipboard blocked';
      }
    });

    panel.append(document.createElement('hr'), copy);
    copy.focus();
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
    const settingsId = GM_registerMenuCommand('Settings', () => openPanel('hub'));
    if (settingsId !== undefined && settingsId !== null) menuIds.push(settingsId);
  }

  drawMenu();
})();

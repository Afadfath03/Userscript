// ==UserScript==
// @name         YouTube: Custom Collection
// @namespace    https://github.com/Afadfath03/Userscript
// @version      2.12
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
// @grant        GM_listValues
// ==/UserScript==

(() => {
  // Embeds and live chat frames do not carry the page-level UI these features clean up
  const isTop = window.self === window.top;
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
      def: true,
      title: 'YouTube: Hide "These people are mentioned in the video"',
      short: 'Hide People Mentioned',
      desc: 'Removes the shelf under the player that lists people mentioned in the video. YouTube rebuilds that shelf on every page, so the removal runs again each time it appears.',
      rows: [],
    },
    {
      id: 'members',
      def: true,
      title: 'YouTube: Hide Members Only and Premium',
      short: 'Hide Members Only',
      desc: 'Hides videos marked Members only or Premium across feeds, search results, sidebars and playlists. The badge text is what gets matched, so the removal survives markup changes.',
      rows: [],
    },
    {
      id: 'expand',
      def: true,
      title: 'YouTube: Auto Expand Description',
      short: 'Expand Description',
      desc: 'Clicks the description expander on the watch page, so chapters and links are visible without the extra click. It retries a few times, then stops.',
      rows: [],
    },
    {
      id: 'resolution',
      def: true,
      title: 'YouTube: Preferred Resolution',
      short: 'Preferred Resolution',
      desc: 'Starts each video at the quality you pick. When the video does not offer that level, the highest level below it is used instead.',
      rows: [{ key: 'quality', label: 'Quality', type: 'choice', def: 'auto', options: QUALITY }],
    },
    {
      id: 'autoplay',
      def: true,
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
      def: true,
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
        { key: 'pauseBlur', label: 'Pause when window loses focus', type: 'toggle', def: false },
      ],
    },
    {
      id: 'paused',
      def: true,
      title: 'YouTube: Dismiss "Video paused. Continue watching?"',
      short: 'Dismiss Paused Prompt',
      desc: 'Answers the "Video paused. Continue watching?" and "Are you still watching?" prompts. Pick Yes to carry on playing, No to stay paused, or leave the prompt untouched. Only dialogs containing those phrases are affected.',
      rows: [{ key: 'answer', label: 'Answer', type: 'choice', def: 'yes', options: PROMPTS }],
    },
    {
      id: 'quiet',
      def: true,
      title: 'YouTube: Quiet Page',
      short: 'Quiet Page',
      desc: 'Stops work on the page that plays video you never asked for, and hides the sections that cost the most. Each switch below works on its own.',
      rows: [
        { key: 'quietPreviews', label: 'Stop thumbnail previews', type: 'toggle', group: 'Playback', def: true },
        { key: 'quietEndScreen', label: 'Hide end screen', type: 'toggle', group: 'Playback', def: true },
        { key: 'quietAmbient', label: 'Disable ambient mode', type: 'toggle', group: 'Playback', def: true },
        { key: 'quietShorts', label: 'Hide Shorts shelves', type: 'toggle', group: 'Sections', def: false },
        { key: 'quietComments', label: 'Hide comments', type: 'toggle', group: 'Sections', def: false },
        { key: 'quietChat', label: 'Hide live chat', type: 'toggle', group: 'Sections', def: false },
        { key: 'quietPromos', label: 'Hide promo banners', type: 'toggle', group: 'Sections', def: false },
        { key: 'quietMerch', label: 'Hide merch shelf', type: 'toggle', group: 'Sections', def: false },
        { key: 'quietShortsEntry', label: 'Hide Shorts sidebar entry', type: 'toggle', group: 'Sections', def: false },
        { key: 'quietDonation', label: 'Hide donation shelves', type: 'toggle', group: 'Sections', def: false },
        { key: 'quietChips', label: 'Hide filter chips', type: 'toggle', group: 'Sections', def: false },
        { key: 'quietPosts', label: 'Hide community posts', type: 'toggle', group: 'Sections', def: false },
        { key: 'quietClarification', label: 'Hide info panels', type: 'toggle', group: 'Sections', def: false },
        { key: 'quietPlaylist', label: 'Hide playlist panel', type: 'toggle', group: 'Sections', def: false },
        { key: 'quietNudges', label: 'Hide feed nudges', type: 'toggle', group: 'Sections', def: false },
        { key: 'quietChannelVideo', label: 'Hide channel featured video', type: 'toggle', group: 'Sections', def: false },
        { key: 'quietSuggested', label: 'Hide player suggestion bubble', type: 'toggle', group: 'Sections', def: false },
        { key: 'quietInfoPanels', label: 'Hide large info panels', type: 'toggle', group: 'Sections', def: false },
        { key: 'quietMiniplayer', label: 'Hide miniplayer', type: 'toggle', group: 'Sections', def: false },
      ],
    },
  ];

  const featureById = (id) => FEATURES.find((f) => f.id === id);

  // One place decides what a feature does when no value is stored yet
  const featureOn = (id) => {
    const feature = featureById(id);
    return get(`${id}On`, feature ? feature.def : true) === true;
  };

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
#ytc-backdrop{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.68)}
#ytc-panel{width:clamp(320px,88vw,420px);height:calc(100vh - 24px);height:min(76dvh,560px);overflow:auto;padding:0 0 10px;border-radius:14px;background:var(--yt-spec-base-background,#fff);color:var(--yt-spec-text-primary,#0f0f0f);box-shadow:0 16px 40px rgba(0,0,0,.45);font-family:Roboto,Arial,sans-serif;font-size:14px;scroll-padding-top:63px}
#ytc-panel .ytc-header{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:8px;padding:6px 8px 6px 20px;background:var(--yt-spec-base-background,#fff);border-bottom:1px solid var(--yt-spec-10-percent-layer,rgba(128,128,128,.3))}
#ytc-panel .ytc-header.with-back{padding-left:8px}
#ytc-panel h2{flex:1;margin:0;padding:0;font-size:16px;font-weight:600;line-height:1.3}
#ytc-panel .ytc-close,#ytc-panel .ytc-back{width:44px;height:44px;min-height:44px;justify-content:center;padding:0;border-radius:50%;font-size:18px;line-height:1}
#ytc-panel .ytc-close{font-size:22px}
#ytc-panel .ytc-desc{margin:12px 0 0;padding:0 20px;font-size:13px;line-height:1.5;color:var(--yt-spec-text-secondary,#606060)}
#ytc-panel hr{margin:14px 20px 16px;border:0;border-top:1px solid var(--yt-spec-10-percent-layer,rgba(128,128,128,.3))}
#ytc-panel .ytc-section{margin:0;padding:8px 20px 2px;font-size:12px;font-weight:500;color:var(--yt-spec-text-secondary,#606060)}
#ytc-panel button{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;padding:0 20px;border:0;background:none;color:inherit;font:inherit;font-size:14px;line-height:1.4;text-align:left;cursor:pointer}
#ytc-panel button:hover{background:var(--yt-spec-badge-chip-background,rgba(0,0,0,.05))}
#ytc-panel button:active{background:var(--yt-spec-10-percent-layer,rgba(0,0,0,.08))}
#ytc-panel button:disabled{opacity:.45;cursor:not-allowed}
#ytc-panel button:disabled:hover{background:none}
#ytc-panel button:focus-visible{outline:2px solid var(--yt-spec-call-to-action,#065fd4);outline-offset:-2px}
#ytc-panel .ytc-mark{flex:0 0 14px;font-size:14px;line-height:1;color:inherit}
#ytc-panel .ytc-value{margin-left:auto;font-size:13px;color:var(--yt-spec-text-secondary,#606060)}
#ytc-panel .ytc-chevron{padding-left:10px;font-size:18px;line-height:1;color:var(--yt-spec-text-secondary,#606060)}
#ytc-panel button[aria-current="true"]{font-weight:500}
#ytc-panel textarea{display:block;width:calc(100% - 40px);height:140px;margin:0 20px 10px;padding:8px 10px;border:1px solid var(--yt-spec-10-percent-layer,rgba(128,128,128,.3));border-radius:8px;background:var(--yt-spec-badge-chip-background,rgba(0,0,0,.05));color:inherit;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;resize:vertical}
#ytc-panel .ytc-status{min-height:1.4em;margin:0;padding:8px 20px 12px;font-size:12px;line-height:1.4;color:var(--yt-spec-text-secondary,#606060)}
#ytc-panel .ytc-info{display:flex;gap:10px;align-items:baseline;padding:6px 20px;font-size:13px;line-height:1.4}
#ytc-panel .ytc-label{display:block;padding:0 20px 6px;font-size:12px;line-height:1.4;color:var(--yt-spec-text-secondary,#606060)}
#ytc-panel .ytc-switch{position:relative;flex:0 0 34px;width:34px;height:20px;margin-left:auto;border-radius:10px;background:var(--yt-spec-10-percent-layer,rgba(128,128,128,.45));transition:background .15s}
#ytc-panel .ytc-switch::after{content:'';position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.3);transition:transform .15s}
#ytc-panel button[aria-pressed="true"] .ytc-switch{background:var(--yt-spec-call-to-action,#065fd4)}
#ytc-panel button[aria-pressed="true"] .ytc-switch::after{transform:translateX(14px)}
@media (prefers-reduced-motion:reduce){#ytc-panel .ytc-switch,#ytc-panel .ytc-switch::after{transition:none}}
`;

  let panelState = null;

  let lastFocus = null;

  function closePanel() {
    document.removeEventListener('keydown', panelKey, true);
    document.getElementById('ytc-backdrop')?.remove();
    document.getElementById('ytc-style')?.remove();
    panelState = null;
    if (lastFocus && lastFocus.isConnected) lastFocus.focus();
    lastFocus = null;
  }

  function panelKey(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      const box = document.getElementById('ytc-backup');
      // A pasted export is worth one keystroke of protection
      if (box && document.activeElement === box && box.value.trim()) {
        document.querySelector('#ytc-panel .ytc-close')?.focus();
        return;
      }
      closePanel();
      return;
    }
    if (e.key !== 'Tab') return;
    const panel = document.getElementById('ytc-panel');
    if (!panel) return;
    const items = [...panel.querySelectorAll('button:not(:disabled), textarea')];
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

  function settingRow(label, value, onClick, pressed) {
    const button = document.createElement('button');
    button.type = 'button';
    const name = document.createElement('span');
    name.textContent = label;
    button.append(name);
    if (typeof pressed === 'boolean') {
      button.setAttribute('aria-pressed', String(pressed));
      const toggle = document.createElement('span');
      toggle.className = 'ytc-switch';
      toggle.setAttribute('aria-hidden', 'true');
      button.append(toggle);
      button.addEventListener('click', onClick);
      return button;
    }
    const current = document.createElement('span');
    current.className = 'ytc-value';
    current.textContent = value;
    button.append(current);
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
    if (panelState.view === 'diagnostics') {
      renderDiagnostics(panel);
      return;
    }
    if (panelState.view === 'backup') {
      renderBackup(panel);
      return;
    }
    const feature = featureById(panelState.feature);
    if (!feature) {
      // Nothing valid to show: fall back to the hub rather than leaving stale rows
      panel.textContent = '';
      renderHub(panel);
      return;
    }
    panel.textContent = '';

    if (panelState.view === 'options') {
      const row = feature.rows.find((r) => r.key === panelState.rowKey);
      if (!row) return;
      panel.append(
        panelHeader(row.label, () => {
          panelState.view = 'settings';
          render();
        })
      );
      panel.setAttribute('aria-label', row.label);

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
      const bar = panelHeader(feature.title, backToHub);
      const desc = document.createElement('p');
      desc.className = 'ytc-desc';
      desc.textContent = feature.desc;
      const divider = document.createElement('hr');
      const grouped = feature.rows.some((row) => row.group);
      const section = document.createElement('p');
      section.className = 'ytc-section';
      section.textContent = 'Settings';
      panel.append(bar, desc, divider);
      // A feature with no rows is just one switch, so a Settings heading would be noise
      if (!grouped && feature.rows.length) panel.append(section);
      panel.setAttribute('aria-label', feature.title);

      const rows = [{ key: `${feature.id}On`, label: 'Enabled', type: 'toggle', def: feature.def }, ...feature.rows];
      let group = null;
      for (const row of rows) {
        if (row.group && row.group !== group) {
          group = row.group;
          const heading = document.createElement('p');
          heading.className = 'ytc-section';
          heading.textContent = group;
          panel.append(heading);
        }
        const isToggle = row.type === 'toggle';
        const button = settingRow(
          row.label,
          valueLabel(row),
          () => {
            if (isToggle) {
              put(row.key, !read(row));
              // Updating in place keeps the panel from rebuilding and scrolling to the top
              button.setAttribute('aria-pressed', String(read(row)));
              notifyChange();
              return;
            }
            panelState.view = 'options';
            panelState.rowKey = row.key;
            render();
          },
          isToggle ? read(row) : undefined
        );
        // The chevron marks rows that open a subview
        if (!isToggle) button.append(chevron());
        panel.append(button);
      }

      const reset = document.createElement('button');
      reset.type = 'button';
      reset.textContent = armedFeature === feature.id ? 'Press again to reset this feature' : 'Reset this feature';
      reset.addEventListener('click', () => {
        if (armedFeature !== feature.id) {
          armedFeature = feature.id;
          reset.textContent = 'Press again to reset this feature';
          return;
        }
        armedFeature = null;
        if (typeof GM_deleteValue === 'function') {
          GM_deleteValue(`ytc.${feature.id}On`);
          for (const row of feature.rows) GM_deleteValue(`ytc.${row.key}`);
        }
        notifyChange();
        drawMenu();
        render();
      });
      if (feature.rows.length) panel.append(document.createElement('hr'));
      panel.append(reset);
    }

    const active = panel.querySelector('[aria-current="true"]');
    const first = panel.querySelector('button:not(.ytc-close):not(.ytc-back)');
    (active || first)?.focus();
  }

  function openPanel(featureId) {
    if (document.getElementById('ytc-backdrop')) closePanel();
    lastFocus = document.activeElement;
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

    const enabled = () => isTop && featureOn('people');
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
        // The panel's own title names the phrase, so never match inside it
        if (node.parentElement && node.parentElement.closest('#ytc-backdrop')) continue;
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

    // The shelf already on the page at document-idle never fires a mutation
    if (enabled()) scanPage();
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

    const enabled = () => isTop && featureOn('members');
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
    if (document.body && enabled()) mark(document.body);
  }

  // ---------- expand description ----------

  {
    // One click is all the expander needs; five tries covers a slow description render
    const MAX_TRIES = 5;
    let raf = 0;
    let tries = 0;
    let url = '';
    let done = '';

    const enabled = () => isTop && featureOn('expand');

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
    const enabled = () => featureOn('resolution');
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

    // 30 tries at 400ms covers a slow manifest and a full ad break
    const MAX_TRIES = 30;
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
        // Ads lock the level, so waiting on one must not burn the attempts
        if (el && el.classList.contains('ad-showing')) return;
        apply();
        if (++tries >= MAX_TRIES) clearInterval(timer);
      }, 400);
    }

    document.addEventListener('yt-navigate-finish', start);
    window.addEventListener('yt-page-data-updated', start);
    document.addEventListener('ytc-change', start);
    start();
  }

  // ---------- autoplay control ----------

  {
    // Per tab on purpose: the limit is about this session, not the account
    const COUNT_KEY = 'ytc.count';
    const enabled = () => featureOn('autoplay');
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
    document.addEventListener('ytc-change', () => {
      if (enabled()) {
        startSync();
        return;
      }
      // Managed modes switch autoplay off, so disabling the feature must switch it back on
      cancelCountdown();
      setAutoplay(true);
    });
    startSync();
  }

  // ---------- playback defaults ----------

  {
    const enabled = () => featureOn('playback');
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

    window.addEventListener('blur', () => {
      if (!enabled() || !get('pauseBlur', false)) return;
      const video = currentVideo();
      if (video && !video.paused) video.pause();
    });

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

    const enabled = () => featureOn('paused');
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
      // The paused dialog only exists on the watch page, so there is no retry budget here
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
    const enabled = () => isTop && featureOn('quiet');
    const DEFAULTS = new Map();
    for (const feature of FEATURES) {
      for (const row of feature.rows) DEFAULTS.set(row.key, row.def === true);
    }
    const flag = (key) => enabled() && get(key, DEFAULTS.get(key) === true) === true;

    // Lives outside the panel stylesheet: these rules act on the page, not the dialog
    const style = document.createElement('style');
    style.id = 'ytc-quiet';
    style.textContent =
      'html.ytc-quiet-end .ytp-ce-element,html.ytc-quiet-end .ytp-videowall-still,html.ytc-quiet-end .ytp-endscreen-content{display:none!important}' +
      'html.ytc-quiet-ambient #cinematics{display:none!important}' +
      'html.ytc-quiet-shorts ytd-reel-shelf-renderer,' +
      'html.ytc-quiet-shorts ytd-rich-section-renderer:has(ytd-reel-shelf-renderer),' +
      'html.ytc-quiet-shorts ytd-rich-section-renderer:has(a[href*="/shorts/"]){display:none!important}' +
      'html.ytc-quiet-comments ytd-comments#comments{display:none!important}' +
      'html.ytc-quiet-chat ytd-live-chat-frame#chat{display:none!important}' +
      'html.ytc-quiet-promos ytd-mealbar-promo-renderer,' +
      'html.ytc-quiet-promos ytd-statement-banner-renderer,' +
      'html.ytc-quiet-promos ytd-banner-promo-renderer{display:none!important}' +
      'html.ytc-quiet-merch #merch-shelf,html.ytc-quiet-merch ytd-merch-shelf-renderer{display:none!important}' +
      'html.ytc-quiet-shorts-entry ytd-guide-entry-renderer:has(a[href="/shorts/"]),' +
      'html.ytc-quiet-shorts-entry ytd-mini-guide-entry-renderer:has(a[href="/shorts/"]){display:none!important}' +
      'html.ytc-quiet-donation ytd-donation-shelf-renderer{display:none!important}' +
      'html.ytc-quiet-chips ytd-feed-filter-chip-bar-renderer{display:none!important}' +
      'html.ytc-quiet-posts ytd-post-renderer,' +
      'html.ytc-quiet-posts ytd-rich-item-renderer:has(ytd-post-renderer){display:none!important}' +
      'html.ytc-quiet-clarification ytd-clarification-renderer{display:none!important}' +
      'html.ytc-quiet-playlist ytd-playlist-panel-renderer{display:none!important}' +
      'html.ytc-quiet-nudges ytd-feed-nudge-renderer{display:none!important}' +
      'html.ytc-quiet-channel-video ytd-channel-video-player-renderer{display:none!important}' +
      'html.ytc-quiet-suggested ytp-suggested-action{display:none!important}' +
      'html.ytc-quiet-info-panels ytd-info-panel-container-renderer{display:none!important}' +
      'html.ytc-quiet-miniplayer ytd-miniplayer{display:none!important}';
    document.documentElement.append(style);

    function apply() {
      const root = document.documentElement;
      root.classList.toggle('ytc-quiet-end', flag('quietEndScreen'));
      root.classList.toggle('ytc-quiet-ambient', flag('quietAmbient'));
      root.classList.toggle('ytc-quiet-shorts', flag('quietShorts'));
      root.classList.toggle('ytc-quiet-comments', flag('quietComments'));
      root.classList.toggle('ytc-quiet-chat', flag('quietChat'));
      root.classList.toggle('ytc-quiet-promos', flag('quietPromos'));
      root.classList.toggle('ytc-quiet-merch', flag('quietMerch'));
      root.classList.toggle('ytc-quiet-shorts-entry', flag('quietShortsEntry'));
      root.classList.toggle('ytc-quiet-donation', flag('quietDonation'));
      root.classList.toggle('ytc-quiet-chips', flag('quietChips'));
      root.classList.toggle('ytc-quiet-posts', flag('quietPosts'));
      root.classList.toggle('ytc-quiet-clarification', flag('quietClarification'));
      root.classList.toggle('ytc-quiet-playlist', flag('quietPlaylist'));
      root.classList.toggle('ytc-quiet-nudges', flag('quietNudges'));
      root.classList.toggle('ytc-quiet-channel-video', flag('quietChannelVideo'));
      root.classList.toggle('ytc-quiet-suggested', flag('quietSuggested'));
      root.classList.toggle('ytc-quiet-info-panels', flag('quietInfoPanels'));
      root.classList.toggle('ytc-quiet-miniplayer', flag('quietMiniplayer'));
    }

    // Pausing on the event catches previews wherever they start; the player and
    // the Shorts page are not thumbnails, so they keep playing
    const paused = new WeakMap();

    document.addEventListener(
      'playing',
      (event) => {
        if (!flag('quietPreviews')) return;
        const video = event.target;
        if (!(video instanceof HTMLVideoElement)) return;
        if (!video.closest('ytd-thumbnail, yt-thumbnail-view-model, ytd-playlist-thumbnail')) return;
        // If YouTube restarts the same preview, three pauses is enough evidence
        const attempts = paused.get(video) || 0;
        if (attempts >= 3) return;
        paused.set(video, attempts + 1);
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
    const keys =
      typeof GM_listValues === 'function'
        ? GM_listValues().filter((full) => full.startsWith('ytc.'))
        : [...settingKeys()].map((key) => `ytc.${key}`);
    for (const full of keys) {
      const value = GM_getValue(full);
      if (value !== undefined) settings[full.slice(4)] = value;
    }
    return JSON.stringify({ script: 'youtube-custom-collection', format: 1, settings }, null, 2);
  }

  // The preview and the import read the same parse, so they cannot disagree
  function parseExport(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { error: 'That is not valid JSON.' };
    }
    const settings = data && data.settings;
    if (!settings || typeof settings !== 'object') return { error: 'That JSON has no settings object.' };
    const valid = [];
    const skipped = [];
    for (const [key, value] of Object.entries(settings)) {
      // Keys and values outside the current features are ignored, not trusted
      if (validValue(key, value)) valid.push([key, value]);
      else skipped.push(key);
    }
    return { valid, skipped };
  }

  function importSettings(text) {
    const parsed = parseExport(text);
    if (parsed.error) return parsed.error;
    for (const [key, value] of parsed.valid) put(key, value);
    const applied = parsed.valid.length;
    const skipped = parsed.skipped;
    if (applied) {
      notifyChange();
      drawMenu();
    }
    if (!skipped.length) return `Imported ${applied} setting${applied === 1 ? '' : 's'}.`;
    const shown = skipped.slice(0, 5).join(', ');
    const rest = skipped.length > 5 ? ` and ${skipped.length - 5} more` : '';
    return `Imported ${applied}, skipped ${skipped.length} unknown or invalid: ${shown}${rest}.`;
  }

  function renderBackup(panel) {
    panel.textContent = '';

    const bar = panelHeader('Backup', backToHub);
    const desc = document.createElement('p');
    desc.className = 'ytc-desc';
    desc.textContent = 'Exports every stored setting as JSON. Importing applies the keys it recognises and skips the rest.';
    panel.append(bar, desc, document.createElement('hr'));
    panel.setAttribute('aria-label', 'Backup');

    const countLabel = () => {
      const n = Object.keys(JSON.parse(exportSettings()).settings || {}).length;
      return n ? `${n} key${n === 1 ? '' : 's'}` : 'Defaults only';
    };

    const exportTitle = document.createElement('p');
    exportTitle.className = 'ytc-section';
    exportTitle.textContent = 'Export';
    panel.append(exportTitle);

    const status = document.createElement('p');
    status.className = 'ytc-status';
    status.setAttribute('role', 'status');

    let revert = 0;
    const copy = settingRow('Copy settings JSON', countLabel(), async () => {
      const value = copy.querySelector('.ytc-value');
      clearTimeout(revert);
      try {
        await navigator.clipboard.writeText(exportSettings());
        if (value) value.textContent = 'Copied';
        status.textContent = '';
        revert = setTimeout(() => {
          if (value && value.isConnected) value.textContent = countLabel();
        }, 1500);
      } catch {
        // Clipboard blocked: put the JSON where the user can select it
        box.value = exportSettings();
        box.select();
        if (value) value.textContent = 'Selected';
        status.textContent = 'Clipboard blocked, the JSON is selected in the box below.';
      }
    });
    panel.append(copy);

    panel.append(document.createElement('hr'));

    const importTitle = document.createElement('p');
    importTitle.className = 'ytc-section';
    importTitle.textContent = 'Import';
    panel.append(importTitle);

    const boxLabel = document.createElement('label');
    boxLabel.className = 'ytc-label';
    boxLabel.setAttribute('for', 'ytc-backup');
    boxLabel.textContent = 'Settings JSON';
    panel.append(boxLabel);

    const box = document.createElement('textarea');
    box.id = 'ytc-backup';
    box.spellcheck = false;
    box.placeholder = 'Paste an export here';
    panel.append(box);

    const load = document.createElement('button');
    load.id = 'ytc-import';
    load.type = 'button';
    load.textContent = 'Import settings';
    load.disabled = true;
    panel.append(load, status);

    let armed = false;

    const labelFor = (parsed) =>
      parsed.error
        ? 'Nothing to import'
        : `Import ${parsed.valid.length} setting${parsed.valid.length === 1 ? '' : 's'}`;

    // The button states what will happen before it is pressed
    function preview() {
      armed = false;
      const text = box.value.trim();
      load.disabled = !text;
      if (!text) {
        load.textContent = 'Import settings';
        status.textContent = '';
        return;
      }
      const parsed = parseExport(box.value);
      load.textContent = labelFor(parsed);
      if (parsed.error) {
        status.textContent = parsed.error;
        return;
      }
      status.textContent = parsed.skipped.length
        ? `${parsed.skipped.length} key${parsed.skipped.length === 1 ? '' : 's'} will be skipped.`
        : '';
    }

    box.addEventListener('input', preview);

    load.addEventListener('click', () => {
      const text = box.value;
      if (!text.trim()) return;
      const parsed = parseExport(text);
      if (parsed.error) {
        status.textContent = parsed.error;
        return;
      }
      if (!armed) {
        armed = true;
        load.textContent = `Press again to import ${parsed.valid.length} setting${parsed.valid.length === 1 ? '' : 's'}`;
        return;
      }
      armed = false;
      status.textContent = importSettings(text);
      load.textContent = labelFor(parsed);
      const value = copy.querySelector('.ytc-value');
      if (value) value.textContent = countLabel();
    });

    copy.focus();
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

  const isOn = (feature) => get(`${feature.id}On`, feature.def) === true;

  let resetArmed = false;
  let armedFeature = null;

  function featureSummary(feature) {
    if (feature.id === 'resolution') {
      const hit = QUALITY.find(([value]) => value === get('quality', 'auto'));
      return hit ? hit[1] : 'Auto';
    }
    if (feature.id === 'autoplay') {
      const hit = BEHAVIORS.find(([value]) => value === get('behavior', 'leave'));
      return hit ? hit[1] : 'Leave as-is';
    }
    if (feature.id === 'playback') {
      const speed = get('speed', 'leave');
      return speed === 'leave' ? 'Default' : `${speed}x`;
    }
    if (feature.id === 'paused') {
      const hit = PROMPTS.find(([value]) => value === get('answer', 'yes'));
      return hit ? hit[1] : 'Yes';
    }
    if (feature.id === 'quiet') {
      const on = feature.rows.filter((row) => get(row.key, row.def === true) === true).length;
      return `${on} on`;
    }
    return 'On';
  }

  function renderHub(panel) {
    panel.textContent = '';

    const bar = panelHeader('YouTube: Custom Collection');
    const desc = document.createElement('p');
    desc.className = 'ytc-desc';
    desc.textContent = 'Every feature in one place. Open one to change its settings.';
    panel.append(bar, desc, document.createElement('hr'));
    panel.setAttribute('aria-label', 'YouTube: Custom Collection');

    const rows = [];
    for (const feature of FEATURES) {
      const button = settingRow(feature.short, isOn(feature) ? featureSummary(feature) : 'Off', () => {
        panelState.feature = feature.id;
        panelState.view = 'settings';
        render();
      });
      button.append(chevron());
      rows.push([feature, button]);
      panel.append(button);
    }

    for (const [label, value, view] of [
      ['Backup', 'JSON', 'backup'],
      ['Diagnostics', version(), 'diagnostics'],
    ]) {
      const button = settingRow(label, value, () => {
        panelState.view = view;
        render();
      });
      button.append(chevron());
      panel.append(button);
    }

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = resetArmed ? 'Press again to delete every setting' : 'Reset all settings';
    reset.addEventListener('click', () => {
      if (!resetArmed) {
        resetArmed = true;
        reset.textContent = 'Press again to delete every setting';
        return;
      }
      resetArmed = false;
      if (typeof GM_deleteValue === 'function') {
        for (const key of settingKeys()) GM_deleteValue(`ytc.${key}`);
      }
      // Labels are refreshed in place so the list keeps its position
      for (const [feature, button] of rows) {
        const value = button.querySelector('.ytc-value');
        if (value) value.textContent = isOn(feature) ? featureSummary(feature) : 'Off';
      }
      reset.textContent = 'Reset all settings';
      notifyChange();
      drawMenu();
    });
    panel.append(document.createElement('hr'), reset);

    (panel.querySelector('button:not(.ytc-close):not(.ytc-back)') || panel).focus();
  }

  const quietOn = () => {
    const quiet = featureById('quiet');
    return quiet.rows.filter((row) => get(row.key, row.def === true) === true).length;
  };

  function diagnosticsRows() {
    const stored = [...settingKeys()].filter((key) => GM_getValue(`ytc.${key}`) !== undefined);
    return [
      ['Script', 'youtube-custom-collection'],
      ['Version', version()],
      ['Enabled features', `${FEATURES.filter(isOn).length} of ${FEATURES.length}`],
      ['Quiet switches', `${quietOn()} on`],
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
    panel.setAttribute('aria-label', 'Diagnostics');

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
    const id = GM_registerMenuCommand('YouTube: Custom Collection', () => openPanel('hub'));
    if (id !== undefined && id !== null) menuIds.push(id);
  }

  drawMenu();
})();

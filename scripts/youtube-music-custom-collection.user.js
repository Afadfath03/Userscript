// ==UserScript==
// @name         YouTube Music: Custom Collection
// @namespace    https://github.com/Afadfath03/Userscript
// @version      1.1
// @description  Collection of YouTube Music userscripts made by me, bundled into one install with per-feature settings
// @author       Afadfath03
// @homepageURL  https://github.com/Afadfath03/Userscript
// @supportURL   https://github.com/Afadfath03/Userscript/issues
// @downloadURL  https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-music-custom-collection.user.js
// @updateURL    https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-music-custom-collection.user.js
// @icon         https://raw.githubusercontent.com/Afadfath03/Userscript/main/assets/icons/youtube-music-custom-collection.png
// @license      MIT
// @match        https://music.youtube.com/*
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
  // Player frames carry neither the page sections nor the menu this bundle adds
  if (window.self !== window.top) return;

  const PREFIX = 'ytmc.';

  const get = (key, fallback) => {
    const v = GM_getValue(`${PREFIX}${key}`, fallback);
    return v === undefined || v === null ? fallback : v;
  };
  const put = (key, value) => GM_setValue(`${PREFIX}${key}`, value);

  const version = () =>
    typeof GM_info === 'object' && GM_info && GM_info.script ? GM_info.script.version || 'unknown' : 'unknown';

  const MAX_WORDS = 100;
  const MAX_WORD_LENGTH = 100;
  const squashSpace = (s) => s.replace(/\s+/g, ' ').trim();

  // Trimmed, deduplicated without regard to case, and capped, so a stored list stays small
  function cleanWords(list) {
    const seen = new Set();
    const out = [];
    for (const item of list) {
      if (typeof item !== 'string') continue;
      const word = squashSpace(item).slice(0, MAX_WORD_LENGTH);
      const folded = word.toLowerCase();
      if (!word || seen.has(folded)) continue;
      seen.add(folded);
      out.push(word);
      if (out.length === MAX_WORDS) break;
    }
    return out;
  }

  const parseWords = (text) => cleanWords(String(text).split(/[\n,]/));

  const FEATURES = [
    {
      id: 'song',
      def: true,
      title: 'YouTube Music: Prefer Song',
      short: 'Prefer Song',
      desc: 'Keeps playback on the song version. The mode is read from the toggle attributes and pressed back on every track, after two seconds so the switch cannot land on a different one.',
      rows: [{ key: 'hideToggle', label: 'Hide Song/Video toggle', type: 'toggle', def: true }],
    },
    {
      id: 'quiet',
      def: true,
      title: 'YouTube Music: Quiet Page',
      short: 'Quiet Page',
      desc: 'Hides the Premium promos and the shelves titled Shorts. The shelf title is what gets matched, so a new Shorts row is caught wherever it appears.',
      rows: [
        { key: 'promos', label: 'Hide promo banners', type: 'toggle', def: true },
        { key: 'shorts', label: 'Hide Shorts shelves', type: 'toggle', def: true },
      ],
    },
    {
      id: 'paused',
      def: true,
      title: 'YouTube Music: Dismiss Paused Prompt',
      short: 'Dismiss Paused Prompt',
      desc: 'Answers Yes to the "Video paused. Continue watching?" and "Are you still listening?" prompts, on every page, so playback carries on. Other dialogs are left alone.',
      rows: [],
    },
    {
      id: 'skip',
      def: false,
      title: 'YouTube Music: Skip by Keyword',
      short: 'Skip by Keyword',
      desc: "Presses Next when the playing track's title contains a word from your list. Whole words only, so live does not catch Alive. After five skips in a row it waits for a track that does not match.",
      rows: [
        { key: 'skipWords', label: 'Keywords, one per line', type: 'words', def: [] },
        { key: 'skipArtist', label: 'Match artist too', type: 'toggle', def: false },
      ],
    },
  ];

  const featureById = (id) => FEATURES.find((f) => f.id === id);

  // One place decides what a feature does when no value is stored yet
  const featureOn = (id) => {
    const feature = featureById(id);
    return get(`${id}On`, feature ? feature.def : true) === true;
  };

  const isOn = (feature) => featureOn(feature.id);

  const rowOf = (key) => {
    for (const feature of FEATURES) {
      for (const row of feature.rows) if (row.key === key) return row;
    }
    return null;
  };

  function read(row) {
    if (!row) return false;
    if (row.type === 'words') {
      const stored = get(row.key, row.def);
      return Array.isArray(stored) ? cleanWords(stored) : row.def;
    }
    return get(row.key, row.def) === true;
  }

  const valueLabel = (row) => (read(row) ? 'On' : 'Off');

  function featureSummary(feature) {
    if (feature.id === 'song') return read(rowOf('hideToggle')) ? 'Song only' : 'Toggle shown';
    // A feature without rows is a single switch, and "0 of 0" would read as broken
    if (!feature.rows.length) return 'On';
    if (feature.id === 'skip') {
      const n = read(rowOf('skipWords')).length;
      return n ? `${n} keyword${n === 1 ? '' : 's'}` : 'No keywords';
    }
    const on = feature.rows.filter((row) => read(row)).length;
    return `${on} of ${feature.rows.length}`;
  }

  const settingKeys = () => {
    const keys = new Set();
    for (const feature of FEATURES) {
      keys.add(`${feature.id}On`);
      for (const row of feature.rows) keys.add(row.key);
    }
    return keys;
  };

  const CSS = `
#ytmc-panel,#ytmc-panel *{box-sizing:border-box}
#ytmc-backdrop{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.68)}
#ytmc-panel{width:clamp(320px,88vw,420px);height:calc(100vh - 24px);height:min(76dvh,560px);overflow:auto;padding:0 0 10px;border-radius:14px;background:var(--ytmusic-background,#030303);color:var(--ytmusic-text-primary,#fff);box-shadow:0 16px 40px rgba(0,0,0,.45);font-family:Roboto,Arial,sans-serif;font-size:14px;scroll-padding-top:63px}
#ytmc-panel .ytmc-header{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:8px;padding:6px 8px 6px 20px;background:var(--ytmusic-background,#030303);border-bottom:1px solid rgba(128,128,128,.35)}
#ytmc-panel .ytmc-header.with-back{padding-left:8px}
#ytmc-panel h2{flex:1;margin:0;padding:0;font-size:16px;font-weight:600;line-height:1.3}
#ytmc-panel .ytmc-close,#ytmc-panel .ytmc-back{width:44px;height:44px;min-height:44px;justify-content:center;padding:0;border-radius:50%;font-size:18px;line-height:1}
#ytmc-panel .ytmc-close{font-size:22px}
#ytmc-panel .ytmc-desc{margin:12px 0 0;padding:0 20px;font-size:13px;line-height:1.5;color:var(--ytmusic-text-secondary,#aaa)}
#ytmc-panel hr{margin:14px 20px 16px;border:0;border-top:1px solid rgba(128,128,128,.35)}
#ytmc-panel .ytmc-section{display:block;margin:0;padding:8px 20px 2px;font-size:12px;font-weight:500;color:var(--ytmusic-text-secondary,#aaa)}
#ytmc-panel button{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;padding:0 20px;border:0;background:none;color:inherit;font:inherit;font-size:14px;line-height:1.4;text-align:left;cursor:pointer}
#ytmc-panel button:hover{background:rgba(128,128,128,.16)}
#ytmc-panel button:active{background:rgba(128,128,128,.24)}
#ytmc-panel button:disabled{opacity:.45;cursor:not-allowed}
#ytmc-panel button:disabled:hover{background:none}
#ytmc-panel button:focus-visible{outline:2px solid #065fd4;outline-offset:-2px}
html[dark] #ytmc-panel button:focus-visible{outline-color:#3ea6ff}
#ytmc-panel .ytmc-value{margin-left:auto;font-size:13px;color:var(--ytmusic-text-secondary,#aaa)}
#ytmc-panel .ytmc-chevron{padding-left:10px;font-size:18px;line-height:1;color:var(--ytmusic-text-secondary,#aaa)}
#ytmc-panel textarea{display:block;width:calc(100% - 40px);height:140px;margin:0 20px 10px;padding:8px 10px;border:1px solid rgba(128,128,128,.45);border-radius:8px;background:rgba(128,128,128,.12);color:inherit;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;resize:vertical}
#ytmc-panel textarea:focus-visible{outline:2px solid #065fd4;outline-offset:-2px}
html[dark] #ytmc-panel textarea:focus-visible{outline-color:#3ea6ff}
#ytmc-panel .ytmc-status{min-height:1.4em;margin:0;padding:8px 20px 12px;font-size:12px;line-height:1.4;color:var(--ytmusic-text-secondary,#aaa)}
#ytmc-panel .ytmc-info{display:flex;gap:10px;align-items:baseline;padding:6px 20px;font-size:13px;line-height:1.4}
#ytmc-panel .ytmc-label{display:block;padding:0 20px 6px;font-size:12px;line-height:1.4;color:var(--ytmusic-text-secondary,#aaa)}
#ytmc-panel .ytmc-switch{position:relative;flex:0 0 34px;width:34px;height:20px;margin-left:auto;border-radius:10px;background:rgba(128,128,128,.45);transition:background .15s}
#ytmc-panel .ytmc-switch::after{content:'';position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.3);transition:transform .15s}
#ytmc-panel button[aria-pressed="true"] .ytmc-switch{background:#ff0000}
#ytmc-panel button[aria-pressed="true"] .ytmc-switch::after{transform:translateX(14px)}
@media (prefers-reduced-motion:reduce){#ytmc-panel .ytmc-switch,#ytmc-panel .ytmc-switch::after{transition:none}}
`;

  let panelState = null;
  let lastFocus = null;
  let resetArmed = false;

  function closePanel() {
    document.removeEventListener('keydown', panelKey, true);
    document.getElementById('ytmc-backdrop')?.remove();
    document.getElementById('ytmc-style')?.remove();
    panelState = null;
    if (lastFocus && lastFocus.isConnected) lastFocus.focus();
    lastFocus = null;
  }

  function panelKey(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      const box = document.getElementById('ytmc-backup');
      // A pasted export is worth one keystroke of protection
      if (box && document.activeElement === box && box.value.trim()) {
        document.querySelector('#ytmc-panel .ytmc-close')?.focus();
        return;
      }
      // Unsaved keywords get the same one keystroke of protection
      const words = document.getElementById('ytmc-words');
      if (words && document.activeElement === words && !sameWords(words)) {
        document.querySelector('#ytmc-panel .ytmc-close')?.focus();
        return;
      }
      if (panelState && panelState.view !== 'hub') {
        backToHub();
        return;
      }
      closePanel();
      return;
    }
    if (e.key !== 'Tab') return;
    const panel = document.getElementById('ytmc-panel');
    if (!panel) return;
    const items = [...panel.querySelectorAll('button:not(:disabled), input, textarea')];
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

  function sameWords(box) {
    const row = rowOf(box.dataset.key);
    return JSON.stringify(parseWords(box.value)) === JSON.stringify(read(row));
  }

  function wordsEditor(row) {
    const wrap = document.createDocumentFragment();
    const label = document.createElement('label');
    label.className = 'ytmc-label';
    label.setAttribute('for', 'ytmc-words');
    label.textContent = row.label;
    const box = document.createElement('textarea');
    box.id = 'ytmc-words';
    box.dataset.key = row.key;
    box.spellcheck = false;
    box.placeholder = 'live\nremix\nsped up';
    box.value = read(row).join('\n');
    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = 'Save keywords';
    const status = document.createElement('p');
    status.className = 'ytmc-status';
    status.setAttribute('role', 'status');
    save.addEventListener('click', () => {
      const list = parseWords(box.value);
      put(row.key, list);
      box.value = list.join('\n');
      status.textContent = `Saved ${list.length} keyword${list.length === 1 ? '' : 's'}.`;
      notifyChange();
    });
    wrap.append(label, box, save, status);
    return wrap;
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
      toggle.className = 'ytmc-switch';
      toggle.setAttribute('aria-hidden', 'true');
      button.append(toggle);
      button.addEventListener('click', onClick);
      return button;
    }
    const current = document.createElement('span');
    current.className = 'ytmc-value';
    current.textContent = value;
    button.append(current);
    button.addEventListener('click', onClick);
    return button;
  }

  function panelHeader(titleText, onBack) {
    const bar = document.createElement('div');
    bar.className = onBack ? 'ytmc-header with-back' : 'ytmc-header';
    if (onBack) {
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'ytmc-back';
      back.setAttribute('aria-label', 'Back');
      back.textContent = '\u2190';
      back.addEventListener('click', onBack);
      bar.append(back);
    }
    const title = document.createElement('h2');
    title.textContent = titleText;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'ytmc-close';
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
    mark.className = 'ytmc-chevron';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = '\u203a';
    return mark;
  };

  function infoRow(label, value) {
    const row = document.createElement('div');
    row.className = 'ytmc-info';
    const name = document.createElement('span');
    name.textContent = label;
    const val = document.createElement('span');
    val.className = 'ytmc-value';
    val.textContent = value;
    row.append(name, ' ', val);
    return row;
  }

  function notifyChange() {
    document.dispatchEvent(new Event('ytmc-change'));
  }

  function render() {
    const panel = document.getElementById('ytmc-panel');
    if (!panel || !panelState) return;
    if (panelState.view === 'hub') {
      renderHub(panel);
      return;
    }
    if (panelState.view === 'backup') {
      renderBackup(panel);
      return;
    }
    if (panelState.view === 'diagnostics') {
      renderDiagnostics(panel);
      return;
    }
    const feature = featureById(panelState.feature);
    if (!feature) {
      // Nothing valid to show: fall back to the hub rather than leaving stale rows
      panel.textContent = '';
      renderHub(panel);
      return;
    }
    renderFeature(panel, feature);
  }

  function renderFeature(panel, feature) {
    panel.textContent = '';
    const bar = panelHeader(feature.title, backToHub);
    const desc = document.createElement('p');
    desc.className = 'ytmc-desc';
    desc.textContent = feature.desc;
    const section = document.createElement('p');
    section.className = 'ytmc-section';
    section.textContent = 'Settings';
    panel.append(bar, desc, document.createElement('hr'), section);
    panel.setAttribute('aria-label', feature.title);

    const rows = [{ key: `${feature.id}On`, label: 'Enabled', type: 'toggle', def: feature.def }, ...feature.rows];
    for (const row of rows) {
      if (row.type === 'words') {
        panel.append(wordsEditor(row));
        continue;
      }
      const button = settingRow(
        row.label,
        valueLabel(row),
        () => {
          put(row.key, !read(row));
          // Updating in place keeps the panel from rebuilding and scrolling to the top
          button.setAttribute('aria-pressed', String(read(row)));
          notifyChange();
        },
        read(row)
      );
      panel.append(button);
    }

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = resetArmed === feature.id ? 'Press again to reset this feature' : 'Reset this feature';
    reset.addEventListener('click', () => {
      if (resetArmed !== feature.id) {
        resetArmed = feature.id;
        reset.textContent = 'Press again to reset this feature';
        return;
      }
      resetArmed = false;
      if (typeof GM_deleteValue === 'function') {
        GM_deleteValue(`${PREFIX}${feature.id}On`);
        for (const row of feature.rows) GM_deleteValue(`${PREFIX}${row.key}`);
      }
      notifyChange();
      drawMenu();
      render();
    });
    panel.append(document.createElement('hr'), reset);

    const first = panel.querySelector('button:not(.ytmc-close):not(.ytmc-back)');
    (panel.querySelector('[aria-pressed="true"]') || first)?.focus();
  }

  function renderHub(panel) {
    panel.textContent = '';

    const bar = panelHeader('YouTube Music: Custom Collection');
    const desc = document.createElement('p');
    desc.className = 'ytmc-desc';
    desc.textContent = 'Every feature in one place. Open one to change its settings.';
    panel.append(bar, desc, document.createElement('hr'));
    panel.setAttribute('aria-label', 'YouTube Music: Custom Collection');

    const rows = [];
    // Alphabetical by the label shown here, so a new feature lands in place on its own
    const ordered = [...FEATURES].sort((a, b) => a.short.localeCompare(b.short, 'en', { sensitivity: 'base' }));
    for (const feature of ordered) {
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
        for (const key of settingKeys()) GM_deleteValue(`${PREFIX}${key}`);
      }
      // Labels are refreshed in place so the list keeps its position
      for (const [feature, button] of rows) {
        const value = button.querySelector('.ytmc-value');
        if (value) value.textContent = isOn(feature) ? featureSummary(feature) : 'Off';
      }
      reset.textContent = 'Reset all settings';
      notifyChange();
      drawMenu();
    });
    panel.append(document.createElement('hr'), reset);

    const first = panel.querySelector('button:not(.ytmc-close)');
    first?.focus();
  }

  function diagnosticsRows() {
    const stored = [...settingKeys()].filter((key) => GM_getValue(`${PREFIX}${key}`) !== undefined);
    return [
      ['Script', 'youtube-music-custom-collection'],
      ['Version', version()],
      ['Enabled features', `${FEATURES.filter(isOn).length} of ${FEATURES.length}`],
      ['Stored settings', `${stored.length} of ${settingKeys().size} keys`],
      ['Settings size', `${exportSettings().length} bytes`],
      ['Page', location.pathname],
    ];
  }

  function renderDiagnostics(panel) {
    panel.textContent = '';

    const bar = panelHeader('Diagnostics', backToHub);
    const desc = document.createElement('p');
    desc.className = 'ytmc-desc';
    desc.textContent = 'What this copy of the script sees right now. Handy when a feature stays quiet on a page.';
    panel.append(bar, desc, document.createElement('hr'));
    panel.setAttribute('aria-label', 'Diagnostics');

    for (const [label, value] of diagnosticsRows()) panel.append(infoRow(label, value));

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'Copy report';
    copy.addEventListener('click', async () => {
      const report = diagnosticsRows()
        .map(([label, value]) => `${label}: ${value}`)
        .join('\n');
      try {
        await navigator.clipboard.writeText(report);
        copy.textContent = 'Copied';
      } catch {
        copy.textContent = 'Clipboard blocked';
      }
    });

    panel.append(document.createElement('hr'), copy);
    copy.focus();
  }

  function validValue(key, value) {
    if (key.endsWith('On')) return typeof value === 'boolean';
    const row = rowOf(key);
    if (!row) return false;
    if (row.type === 'words') {
      return (
        Array.isArray(value) &&
        value.length <= MAX_WORDS &&
        value.every((w) => typeof w === 'string' && w.length <= MAX_WORD_LENGTH)
      );
    }
    return typeof value === 'boolean';
  }

  function exportSettings() {
    const settings = {};
    const keys =
      typeof GM_listValues === 'function'
        ? GM_listValues().filter((full) => full.startsWith(PREFIX))
        : [...settingKeys()].map((key) => `${PREFIX}${key}`);
    for (const full of keys) {
      const value = GM_getValue(full);
      if (value !== undefined) settings[full.slice(PREFIX.length)] = value;
    }
    return JSON.stringify({ script: 'youtube-music-custom-collection', format: 1, settings }, null, 2);
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
    desc.className = 'ytmc-desc';
    desc.textContent = 'Exports every stored setting as JSON. Importing applies the keys it recognises and skips the rest.';
    panel.append(bar, desc, document.createElement('hr'));
    panel.setAttribute('aria-label', 'Backup');

    const countLabel = () => {
      const n = Object.keys(JSON.parse(exportSettings()).settings || {}).length;
      return n ? `${n} key${n === 1 ? '' : 's'}` : 'Defaults only';
    };

    const exportTitle = document.createElement('p');
    exportTitle.className = 'ytmc-section';
    exportTitle.textContent = 'Export';
    panel.append(exportTitle);

    const status = document.createElement('p');
    status.className = 'ytmc-status';
    status.setAttribute('role', 'status');

    let revert = 0;
    const copy = settingRow('Copy settings JSON', countLabel(), async () => {
      const value = copy.querySelector('.ytmc-value');
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
    importTitle.className = 'ytmc-section';
    importTitle.textContent = 'Import';
    panel.append(importTitle);

    const boxLabel = document.createElement('label');
    boxLabel.className = 'ytmc-label';
    boxLabel.setAttribute('for', 'ytmc-backup');
    boxLabel.textContent = 'Settings JSON';
    panel.append(boxLabel);

    const box = document.createElement('textarea');
    box.id = 'ytmc-backup';
    box.spellcheck = false;
    box.placeholder = 'Paste an export here';
    panel.append(box);

    const load = document.createElement('button');
    load.id = 'ytmc-import';
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
      const value = copy.querySelector('.ytmc-value');
      if (value) value.textContent = countLabel();
    });

    copy.focus();
  }

  function openPanel(view) {
    if (document.getElementById('ytmc-backdrop')) closePanel();
    lastFocus = document.activeElement;
    const style = document.createElement('style');
    style.id = 'ytmc-style';
    style.textContent = CSS;
    document.head.append(style);

    const backdrop = document.createElement('div');
    backdrop.id = 'ytmc-backdrop';
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) closePanel();
    });

    const panel = document.createElement('div');
    panel.id = 'ytmc-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'YouTube Music: Custom Collection');

    backdrop.append(panel);
    document.body.append(backdrop);
    document.addEventListener('keydown', panelKey, true);
    panelState = { view: view || 'hub', feature: null };
    render();
  }

  // ---------- prefer song ----------

  {
    // The toggle also works when pressed early, but it can land on another track, so the first try waits
    const WARMUP = 2000;
    const MAX_TRIES = 3;
    const TICK = 1000;
    const HIDE = rowOf('hideToggle');

    const style = document.createElement('style');
    style.id = 'ytmc-song';
    (document.head || document.documentElement).append(style);

    let painted = '';
    function paint() {
      const css = featureOn('song') && read(HIDE) ? 'ytmusic-av-toggle { display: none !important; }' : '';
      if (css === painted) return;
      painted = css;
      style.textContent = css;
    }

    const currentId = () => new URLSearchParams(location.search).get('v') || '';

    // The host attributes carry the mode, and the two buttons mirror it in aria-pressed
    function mode(toggle) {
      if (toggle.getAttribute('is-video-playback-mode-selected') === 'true') return 'video';
      if (toggle.getAttribute('is-audio-playback-mode-selected') === 'true') return 'song';
      const video = toggle.querySelector('.video-button');
      const song = toggle.querySelector('.song-button');
      if (video && video.getAttribute('aria-pressed') === 'true') return 'video';
      if (song && song.getAttribute('aria-pressed') === 'true') return 'song';
      return '';
    }

    let tries = 0;
    let lastId = '';
    let firstSeen = 0;

    function tick() {
      paint();
      if (!featureOn('song')) return;
      const toggle = document.querySelector('ytmusic-av-toggle');
      if (!toggle || mode(toggle) !== 'video') return;
      const button = toggle.querySelector('.song-button');
      if (!button) return;
      const id = currentId();
      if (!id) return;
      if (id !== lastId) {
        lastId = id;
        tries = 0;
        firstSeen = Date.now();
      }
      if (tries >= MAX_TRIES) return;
      if (Date.now() - firstSeen < WARMUP) return;
      const player = document.querySelector('video');
      if (player && player.currentTime < 1) return;
      tries++;
      button.click();
    }

    document.addEventListener('ytmc-change', tick);
    document.addEventListener('yt-navigate-finish', tick);
    setInterval(tick, TICK);
    tick();
  }

  // ---------- quiet page ----------

  {
    const TICK = 1000;
    const PROMO_CSS = [
      'ytmusic-mealbar-promo-renderer',
      'ytmusic-statement-banner-renderer',
      'ytmusic-background-promo-renderer',
    ].join(', ');
    const SHELVES = 'ytmusic-carousel-shelf-renderer, ytmusic-shelf-renderer, ytmusic-item-section-renderer';
    // Add other UI languages here; case and spacing are normalized
    const SHORTS_TITLES = new Set(['shorts', 'shorts video']);
    const squash = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();

    const shortsOn = () => featureOn('quiet') && read(rowOf('shorts'));
    const promosOn = () => featureOn('quiet') && read(rowOf('promos'));

    const style = document.createElement('style');
    style.id = 'ytmc-quiet';
    (document.head || document.documentElement).append(style);

    let painted = '';
    function paint() {
      const rules = [];
      if (shortsOn()) rules.push('[data-ytmc-off] { display: none !important; }');
      if (promosOn()) rules.push(`${PROMO_CSS} { display: none !important; }`);
      const css = rules.join('\n');
      if (css === painted) return;
      painted = css;
      style.textContent = css;
    }

    function hideShorts() {
      for (const shelf of document.querySelectorAll(SHELVES)) {
        if (shelf.hasAttribute('data-ytmc-off')) continue;
        const title = shelf.querySelector('#title, yt-formatted-string.title, .title');
        if (title && SHORTS_TITLES.has(squash(title.textContent))) shelf.setAttribute('data-ytmc-off', '');
      }
    }

    function hidePromos() {
      for (const entry of document.querySelectorAll('ytmusic-guide-entry-renderer')) {
        if (entry.hasAttribute('data-ytmc-off')) continue;
        const link = entry.querySelector('a[href*="premium"]');
        const text = squash(entry.textContent);
        // A playlist can be called Premium too, so the link wins when there is one
        if (link || (text.includes('premium') && text.length <= 24)) entry.setAttribute('data-ytmc-off', '');
      }
    }

    function scan() {
      paint();
      if (shortsOn()) hideShorts();
      if (promosOn()) hidePromos();
    }

    document.addEventListener('ytmc-change', scan);
    document.addEventListener('yt-navigate-finish', scan);
    setInterval(scan, TICK);
    scan();
  }

  // ---------- dismiss paused prompt ----------

  {
    const DONE = 'data-ytmc-paused-done';
    const TICK = 1000;
    // Closing the prompt does not always restart the track, so playback is checked once afterwards
    const RESUME_DELAY = 500;
    const squash = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
    // Add other UI languages here; case and spacing are normalized
    const PHRASES = [
      'video paused. continue watching?',
      'video dijeda. lanjutkan menonton?',
      'are you still listening?',
      'apakah anda masih mendengarkan?',
      'are you still watching?',
      'apakah anda masih menonton?',
    ];
    const YES = new Set(['yes', 'ya', 'continue', 'lanjutkan', 'continue watching', 'lanjutkan menonton', 'resume']);
    const PROMPT = 'ytmusic-you-there-renderer';
    const DIALOG = `${PROMPT}, tp-yt-paper-dialog, yt-confirm-dialog-renderer`;
    const BUTTON = 'yt-button-renderer button, button, tp-yt-paper-button';

    const on = () => featureOn('paused');
    const visible = (el) => el.getClientRects().length > 0;

    function isPrompt(dialog) {
      // The renderer exists only for this prompt, so its tag is proof enough in any language
      if (dialog.matches(PROMPT) || dialog.querySelector(PROMPT)) return true;
      const text = squash(dialog.textContent || '');
      return PHRASES.some((p) => text.includes(p));
    }

    function resume() {
      const video = document.querySelector('video');
      if (!on() || !video || !video.paused) return;
      const played = video.play();
      if (played && typeof played.catch === 'function') played.catch(() => {});
    }

    function answer(dialog) {
      // The outer dialog speaks for the renderer inside it, so one appearance gets one click
      if (dialog.parentElement && dialog.parentElement.closest(DIALOG)) return false;
      if (dialog.hasAttribute(DONE) || !visible(dialog) || !isPrompt(dialog)) return false;
      const buttons = [...dialog.querySelectorAll(BUTTON)];
      let button = buttons.find((b) => YES.has(squash(b.textContent)));
      const renderer = dialog.matches(PROMPT) ? dialog : dialog.querySelector(PROMPT);
      // The renderer has a single confirming button, so an unknown label still points at it
      if (!button && renderer) button = renderer.querySelector(BUTTON);
      if (!button) return false;
      dialog.setAttribute(DONE, '');
      button.click();
      setTimeout(resume, RESUME_DELAY);
      return true;
    }

    function scan() {
      // A dialog that was hidden is shown again later as the same node
      for (const done of document.querySelectorAll(`[${DONE}]`)) {
        if (!visible(done)) done.removeAttribute(DONE);
      }
      if (!on()) return;
      for (const dialog of document.querySelectorAll(DIALOG)) answer(dialog);
    }

    let raf = 0;
    new MutationObserver((list) => {
      if (!on() || raf) return;
      if (!list.some((m) => m.addedNodes.length)) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        scan();
      });
    }).observe(document.documentElement, { childList: true, subtree: true });

    document.addEventListener('ytmc-change', scan);
    // Showing a hidden dialog again changes only its style, which the observer above does not watch
    setInterval(scan, TICK);
    // Content already present at document-idle never fires a mutation
    if (document.body) scan();
  }

  // ---------- skip by keyword ----------

  {
    // A queue where every track matches would otherwise be skipped to the end
    const MAX_STREAK = 5;
    const TICK = 1000;
    const NEXT = 'ytmusic-player-bar .next-button';
    const WORDS = rowOf('skipWords');
    const ARTIST = rowOf('skipArtist');

    // Whole words only, bounded by any letter or digit, so live leaves Alive and Deliver alone
    function matcher(list) {
      if (!list.length) return null;
      const parts = list.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'));
      const pattern = new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${parts.join('|')})(?:$|[^\\p{L}\\p{N}])`, 'iu');
      return (text) => pattern.test(text);
    }

    function readTrack() {
      const bar = document.querySelector('ytmusic-player-bar');
      if (!bar) return null;
      const title = squashSpace(bar.querySelector('.title')?.textContent || '');
      if (!title) return null;
      return { title, byline: squashSpace(bar.querySelector('.byline')?.textContent || '') };
    }

    const trackKey = (track) => `${track.title} | ${track.byline}`.toLowerCase();

    let lastKey = '';
    // Recent skips, so Previous can walk back over several of them
    const skipped = new Set();
    const MAX_REMEMBERED = 20;
    let streak = 0;

    function tick() {
      if (!featureOn('skip')) return;
      const track = readTrack();
      if (!track) return;
      const key = trackKey(track);
      if (key === lastKey) return;
      lastKey = key;
      const test = matcher(read(WORDS));
      const hit = !!test && (test(track.title) || (read(ARTIST) && test(track.byline)));
      if (!hit) {
        streak = 0;
        return;
      }
      // A track the user went back to after a skip is one they chose to hear
      if (skipped.has(key) || streak >= MAX_STREAK) return;
      const next = document.querySelector(NEXT);
      if (!next) {
        lastKey = '';
        return;
      }
      skipped.add(key);
    if (skipped.size > MAX_REMEMBERED) skipped.delete(skipped.values().next().value);
      streak++;
      next.click();
    }

    // A changed setting applies to the track that is playing now
    document.addEventListener('ytmc-change', () => {
      lastKey = '';
      tick();
    });
    // One tick per second costs less than watching every text change in the player bar
    setInterval(tick, TICK);
    tick();
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
    const id = GM_registerMenuCommand('YouTube Music: Custom Collection', () => openPanel('hub'));
    if (id !== undefined && id !== null) menuIds.push(id);
  }

  drawMenu();
})();

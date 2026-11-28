// ==UserScript==
// @name         YouTube: Video Filter
// @namespace    https://github.com/Afadfath03/Userscript
// @version      1.0
// @description  Real-time YouTube video visual filters (brightness, contrast, saturation, hue, sepia, grayscale, invert, gamma, sharpness) with presets, global defaults, and per-video overrides
// @author       Afadfath03
// @homepageURL  https://github.com/Afadfath03/Userscript
// @supportURL   https://github.com/Afadfath03/Userscript/issues
// @downloadURL  https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube/youtube-video-filter.user.js
// @updateURL    https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube/youtube-video-filter.user.js
// @icon         https://raw.githubusercontent.com/Afadfath03/Userscript/main/assets/icons/youtube/youtube-video-filter.png
// @license      MIT
// @match        https://www.youtube.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// ==/UserScript==

(() => {
  if (window.self !== window.top) return;

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const VIDEO_LIMIT = 255;
  const VIDEO_ID = /^[A-Za-z0-9_-]{6,}$/;

  const PARAMS = [
    { key: 'brightness', label: 'Brightness', min: 0, max: 200, step: 1, def: 100, unit: '%' },
    { key: 'contrast', label: 'Contrast', min: 0, max: 200, step: 1, def: 100, unit: '%' },
    { key: 'saturation', label: 'Saturation', min: 0, max: 200, step: 1, def: 100, unit: '%' },
    { key: 'hue', label: 'Hue', min: -180, max: 180, step: 1, def: 0, unit: 'deg' },
    { key: 'sepia', label: 'Sepia', min: 0, max: 100, step: 1, def: 0, unit: '%' },
    { key: 'grayscale', label: 'Grayscale', min: 0, max: 100, step: 1, def: 0, unit: '%' },
    { key: 'invert', label: 'Invert', min: 0, max: 100, step: 1, def: 0, unit: '%' },
    { key: 'gamma', label: 'Gamma', min: 0.2, max: 3.0, step: 0.05, def: 1.0, unit: '' },
    { key: 'sharpness', label: 'Sharpness', min: 0, max: 100, step: 1, def: 0, unit: '%' },
  ];

  const PARAM_KEYS = new Set(PARAMS.map((p) => p.key));
  const NEUTRAL = { ...Object.fromEntries(PARAMS.map((p) => [p.key, p.def])), disabled: [] };

  const PRESETS = [
    { id: 'normal', label: 'Normal', values: {} },
    { id: 'vivid', label: 'Vivid', values: { brightness: 103, contrast: 112, saturation: 125, sharpness: 20 } },
    { id: 'cinema', label: 'Cinema', values: { brightness: 96, contrast: 115, saturation: 92, gamma: 1.1 } },
    { id: 'warm', label: 'Warm / Night', values: { brightness: 88, contrast: 95, saturation: 90, sepia: 25, gamma: 0.95 } },
  ];

  const get = (key, fallback) => {
    const v = GM_getValue(`ytvf.${key}`, fallback);
    return v === undefined || v === null ? fallback : v;
  };
  const put = (key, value) => GM_setValue(`ytvf.${key}`, value);
  const enabled = () => get('on', true) === true;

  const currentVideo = () => document.querySelector('#movie_player video');
  const playerEl = () => document.getElementById('movie_player');
  const videoIdFromUrl = () => {
    if (location.pathname === '/watch') return new URLSearchParams(location.search).get('v') || '';
    if (location.protocol === 'file:') return playerEl()?.dataset.previewVid || '';
    return '';
  };
  const onWatchPage = () => VIDEO_ID.test(videoIdFromUrl());

  function clamp(num, min, max) {
    return Math.min(max, Math.max(min, num));
  }

  function roundParam(param, val) {
    if (param.step < 1) return Math.round(val * 100) / 100;
    return Math.round(val);
  }

  function normalizeFilter(raw) {
    const out = { ...NEUTRAL, disabled: [] };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const p of PARAMS) {
      const v = Number(raw[p.key]);
      if (Number.isFinite(v)) out[p.key] = roundParam(p, clamp(v, p.min, p.max));
    }
    if (Array.isArray(raw.disabled)) {
      out.disabled = [...new Set(raw.disabled.filter((k) => PARAM_KEYS.has(k)))].sort();
    }
    return out;
  }

  const isParamOff = (f, key) => Array.isArray(f.disabled) && f.disabled.includes(key);

  function isNeutral(f) {
    return PARAMS.every((p) => isParamOff(f, p.key) || f[p.key] === p.def);
  }

  function filtersEqual(a, b) {
    const da = Array.isArray(a.disabled) ? a.disabled : [];
    const db = Array.isArray(b.disabled) ? b.disabled : [];
    return (
      da.length === db.length &&
      da.every((k, i) => k === db[i]) &&
      PARAMS.every((p) => a[p.key] === b[p.key])
    );
  }

  function formatValue(p, val) {
    const shown = p.step < 1 ? Number(val).toFixed(2) : String(val);
    return p.unit ? `${shown}${p.unit}` : shown;
  }

  function summarizeFilter(f) {
    const parts = [];
    for (const p of PARAMS) {
      if (!isParamOff(f, p.key) && f[p.key] !== p.def) parts.push(`${p.label} ${formatValue(p, f[p.key])}`);
    }
    return parts.length ? parts.join(', ') : 'Neutral';
  }

  function readGlobal() {
    return normalizeFilter(get('global', NEUTRAL));
  }

  function writeGlobal(f) {
    put('global', normalizeFilter(f));
  }

  function readVideos() {
    const raw = get('videos', {});
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out = {};
    for (const [id, entry] of Object.entries(raw)) {
      if (!VIDEO_ID.test(id) || !entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const at = Number(entry.at);
      out[id] = {
        ...normalizeFilter(entry),
        at: Number.isFinite(at) ? at : 0,
        title: typeof entry.title === 'string' ? entry.title.slice(0, 120) : '',
      };
    }
    return out;
  }

  function writeVideos(map) {
    put('videos', map);
  }

  function pageTitle() {
    const h1 = document.querySelector('ytd-watch-metadata h1, #title h1');
    const raw = (h1?.textContent || document.title || '').replace(/\s*-\s*YouTube\s*$/, '').trim();
    return raw.slice(0, 120);
  }

  function saveVideo(id, f, title = '') {
    if (!VIDEO_ID.test(id)) return;
    const map = readVideos();
    map[id] = {
      ...normalizeFilter(f),
      at: Date.now(),
      title: (title || map[id]?.title || pageTitle() || '').slice(0, 120),
    };
    const keys = Object.keys(map);
    if (keys.length > VIDEO_LIMIT) {
      keys.sort((a, b) => (map[a].at || 0) - (map[b].at || 0));
      const dropCount = keys.length - VIDEO_LIMIT;
      for (let i = 0; i < dropCount; i++) delete map[keys[i]];
    }
    writeVideos(map);
  }

  function deleteVideo(id) {
    const map = readVideos();
    if (!(id in map)) return;
    delete map[id];
    writeVideos(map);
  }

  // ---------- filter engine ----------

  const live = {
    videoId: '',
    values: { ...NEUTRAL },
    dirty: false,
  };

  function resolveSavedFor(id) {
    const videos = readVideos();
    if (id && videos[id]) return { source: 'video', values: normalizeFilter(videos[id]) };
    const glob = readGlobal();
    return { source: isNeutral(glob) ? 'default' : 'global', values: glob };
  }

  function loadLiveForCurrentVideo() {
    const id = videoIdFromUrl();
    live.videoId = id;
    live.values = resolveSavedFor(id).values;
    live.dirty = false;
  }

  function ensureSvgFilter(gamma, sharpness) {
    let svg = document.getElementById('ytvf-svg');
    if (!svg) {
      svg = document.createElementNS(SVG_NS, 'svg');
      svg.id = 'ytvf-svg';
      svg.setAttribute('aria-hidden', 'true');
      svg.style.cssText = 'position:fixed;width:0;height:0;pointer-events:none;opacity:0';
      const defs = document.createElementNS(SVG_NS, 'defs');
      const filter = document.createElementNS(SVG_NS, 'filter');
      filter.id = 'ytvf-svg-filter';
      filter.setAttribute('color-interpolation-filters', 'sRGB');

      const ct = document.createElementNS(SVG_NS, 'feComponentTransfer');
      ct.id = 'ytvf-gamma';
      for (const tag of ['feFuncR', 'feFuncG', 'feFuncB']) {
        const fn = document.createElementNS(SVG_NS, tag);
        fn.setAttribute('type', 'gamma');
        fn.setAttribute('amplitude', '1');
        fn.setAttribute('exponent', '1');
        fn.setAttribute('offset', '0');
        ct.append(fn);
      }

      const conv = document.createElementNS(SVG_NS, 'feConvolveMatrix');
      conv.id = 'ytvf-sharp';
      conv.setAttribute('order', '3');
      conv.setAttribute('preserveAlpha', 'true');
      conv.setAttribute('kernelMatrix', '0 0 0 0 1 0 0 0 0');

      filter.append(ct, conv);
      defs.append(filter);
      svg.append(defs);
      (document.body || document.documentElement).append(svg);
    }

    const safeGamma = clamp(Number.isFinite(gamma) ? gamma : 1, 0.2, 3.0);
    const exp = (1 / safeGamma).toFixed(4);
    for (const fn of svg.querySelectorAll('#ytvf-gamma > *')) {
      fn.setAttribute('exponent', exp);
    }

    const sharp = clamp(Number.isFinite(sharpness) ? sharpness : 0, 0, 100);
    const conv = svg.querySelector('#ytvf-sharp');
    if (conv) {
      if (sharp <= 0) {
        conv.setAttribute('kernelMatrix', '0 0 0 0 1 0 0 0 0');
      } else {
        const k = (sharp / 100) * 1.5;
        const center = (1 + 4 * k).toFixed(4);
        const side = (-k).toFixed(4);
        conv.setAttribute('kernelMatrix', `0 ${side} 0 ${side} ${center} ${side} 0 ${side} 0`);
      }
    }
  }

  function buildFilterString(f) {
    if (isNeutral(f)) return '';
    const parts = [];
    if (!isParamOff(f, 'brightness') && f.brightness !== 100) parts.push(`brightness(${f.brightness}%)`);
    if (!isParamOff(f, 'contrast') && f.contrast !== 100) parts.push(`contrast(${f.contrast}%)`);
    if (!isParamOff(f, 'saturation') && f.saturation !== 100) parts.push(`saturate(${f.saturation}%)`);
    if (!isParamOff(f, 'hue') && f.hue !== 0) parts.push(`hue-rotate(${f.hue}deg)`);
    if (!isParamOff(f, 'sepia') && f.sepia !== 0) parts.push(`sepia(${f.sepia}%)`);
    if (!isParamOff(f, 'grayscale') && f.grayscale !== 0) parts.push(`grayscale(${f.grayscale}%)`);
    if (!isParamOff(f, 'invert') && f.invert !== 0) parts.push(`invert(${f.invert}%)`);
    const effGamma = isParamOff(f, 'gamma') ? 1 : f.gamma;
    const effSharp = isParamOff(f, 'sharpness') ? 0 : f.sharpness;
    if (effGamma !== 1 || effSharp > 0) {
      ensureSvgFilter(effGamma, effSharp);
      parts.push('url(#ytvf-svg-filter)');
    }
    return parts.join(' ');
  }

  function applyFilter() {
    const video = currentVideo();
    if (!video) return;
    const player = playerEl();
    if (!enabled() || !onWatchPage() || (player && player.classList.contains('ad-showing'))) {
      video.style.filter = '';
      updateButtonState();
      return;
    }
    const id = videoIdFromUrl();
    if (id !== live.videoId) loadLiveForCurrentVideo();
    video.style.filter = buildFilterString(live.values);
    updateButtonState();
  }

  // ---------- player button and popover ----------

  const PLAYER_CSS = `
#ytvf-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;width:48px;height:100%;padding:0;border:0;background:none;color:#fff;cursor:pointer;opacity:.9;vertical-align:top}
#ytvf-btn:hover,#ytvf-btn[aria-expanded="true"]{opacity:1}
#ytvf-btn:focus-visible{outline:2px solid #fff;outline-offset:-4px}
#ytvf-btn svg{width:22px;height:22px;display:block}
#ytvf-btn .ytvf-dot{position:absolute;top:10px;right:10px;width:6px;height:6px;border-radius:50%;background:#3ea6ff;pointer-events:none}
#ytvf-btn .ytvf-dot[hidden]{display:none}
#ytvf-popover,#ytvf-popover *{box-sizing:border-box}
#ytvf-popover{position:absolute;right:12px;bottom:56px;z-index:2050;width:310px;max-height:min(70vh,460px);display:flex;flex-direction:column;border-radius:12px;background:rgba(28,28,28,.95);color:#f1f1f1;border:1px solid rgba(255,255,255,.14);box-shadow:0 12px 32px rgba(0,0,0,.6);font-family:Roboto,Arial,sans-serif;font-size:13px;line-height:1.4;backdrop-filter:blur(8px);overflow:hidden}
#ytvf-popover .ytvf-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.1)}
#ytvf-popover .ytvf-title{font-weight:600;font-size:13.5px}
#ytvf-popover .ytvf-pill{font-size:11px;padding:2px 7px;border-radius:999px;background:rgba(255,255,255,.1);color:#ccc}
#ytvf-popover .ytvf-pill.is-video{background:rgba(62,166,255,.22);color:#7cc2ff}
#ytvf-popover .ytvf-pill.is-dirty{background:rgba(255,193,7,.2);color:#ffd54f}
#ytvf-popover .ytvf-close{margin-left:auto;width:28px;height:28px;border:0;border-radius:50%;background:none;color:#ddd;font-size:16px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
#ytvf-popover .ytvf-close:hover{background:rgba(255,255,255,.12)}
#ytvf-popover .ytvf-body{flex:1 1 auto;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:10px}
#ytvf-popover .ytvf-mode-row{display:grid;grid-template-columns:52px 1fr;align-items:center;gap:8px}
#ytvf-popover .ytvf-mode-row label{font-size:12px;color:#d6d6d6}
#ytvf-popover .ytvf-select{width:100%;min-height:30px;padding:4px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:#181818;color:#f1f1f1;font:inherit;font-size:12px;cursor:pointer}
#ytvf-popover .ytvf-select:focus-visible{outline:2px solid #3ea6ff;outline-offset:1px}
#ytvf-popover .ytvf-sliders{display:flex;flex-direction:column;gap:8px}
#ytvf-popover .ytvf-row{display:grid;grid-template-columns:16px 70px 1fr 48px;align-items:center;gap:6px}
#ytvf-popover .ytvf-row.is-muted label{opacity:.48;text-decoration:line-through}
#ytvf-popover .ytvf-row.is-muted input[type="range"],#ytvf-popover .ytvf-row.is-muted .ytvf-val{opacity:.42}
#ytvf-popover .ytvf-row input[type="checkbox"]{width:14px;height:14px;margin:0;accent-color:#3ea6ff;cursor:pointer}
#ytvf-popover .ytvf-row label{font-size:12px;color:#d6d6d6;white-space:nowrap;cursor:pointer;user-select:none}
#ytvf-popover .ytvf-row input[type="range"]{width:100%;margin:0;accent-color:#3ea6ff;cursor:pointer}
#ytvf-popover .ytvf-val{font-size:11.5px;color:#aaa;text-align:right;font-variant-numeric:tabular-nums;border:0;background:none;padding:2px 0;cursor:pointer}
#ytvf-popover .ytvf-val:hover{color:#fff;text-decoration:underline}
#ytvf-popover .ytvf-foot{display:flex;flex-wrap:wrap;gap:6px;padding:10px 12px;border-top:1px solid rgba(255,255,255,.1);background:rgba(18,18,18,.6)}
#ytvf-popover .ytvf-act{flex:1 1 auto;min-height:30px;padding:4px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.08);color:#f1f1f1;font:inherit;font-size:11.5px;cursor:pointer;white-space:nowrap}
#ytvf-popover .ytvf-act:hover{background:rgba(255,255,255,.16)}
#ytvf-popover .ytvf-act.is-primary{background:#3ea6ff;color:#0f0f0f;border-color:transparent;font-weight:600}
#ytvf-popover .ytvf-act.is-primary:hover{background:#65b8ff}
`;

  function filterIcon() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('fill', 'currentColor');
    path.setAttribute('d', 'M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z');
    svg.append(path);
    return svg;
  }

  function statusInfo() {
    const id = videoIdFromUrl();
    const videos = readVideos();
    const hasOverride = !!(id && videos[id]);
    if (live.dirty) return { text: 'Unsaved', cls: 'is-dirty', hasOverride };
    if (hasOverride) return { text: 'Saved for video', cls: 'is-video', hasOverride: true };
    if (!isNeutral(live.values)) return { text: 'Global', cls: '', hasOverride: false };
    return { text: 'Default', cls: '', hasOverride: false };
  }

  function updateButtonState() {
    const btn = document.getElementById('ytvf-btn');
    if (!btn) return;
    const active = !isNeutral(live.values);
    const dot = btn.querySelector('.ytvf-dot');
    if (dot) dot.hidden = !active;
    const st = statusInfo();
    btn.title = active ? `Video Filter (${st.text})` : 'Video Filter';
    btn.setAttribute('aria-label', btn.title);
    btn.setAttribute('aria-expanded', document.getElementById('ytvf-popover') ? 'true' : 'false');
  }

  function closePopover() {
    document.removeEventListener('pointerdown', onOutsidePointer, true);
    document.removeEventListener('keydown', onPopoverKey, true);
    document.getElementById('ytvf-popover')?.remove();
    updateButtonState();
  }

  function onOutsidePointer(e) {
    const pop = document.getElementById('ytvf-popover');
    const btn = document.getElementById('ytvf-btn');
    if (!pop) return;
    if (pop.contains(e.target) || (btn && btn.contains(e.target))) return;
    closePopover();
  }

  function onPopoverKey(e) {
    const pop = document.getElementById('ytvf-popover');
    if (!pop) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closePopover();
      document.getElementById('ytvf-btn')?.focus();
    }
  }

  function detectMode(values, includeGlobal) {
    if (includeGlobal) {
      const glob = readGlobal();
      if (!isNeutral(glob) && filtersEqual(values, glob)) return 'global';
    }
    for (const preset of PRESETS) {
      if (filtersEqual(values, normalizeFilter({ ...NEUTRAL, ...preset.values }))) return preset.id;
    }
    return 'custom';
  }

  function renderPopover() {
    const player = playerEl();
    if (!player) return;
    let pop = document.getElementById('ytvf-popover');
    if (!pop) {
      pop = document.createElement('div');
      pop.id = 'ytvf-popover';
      pop.setAttribute('role', 'dialog');
      pop.setAttribute('aria-label', 'Video Filter');
      for (const evt of ['click', 'mousedown', 'pointerdown', 'keydown', 'keyup']) {
        pop.addEventListener(evt, (e) => {
          if (evt === 'keydown' && e.key === 'Escape') return;
          e.stopPropagation();
        });
      }
      player.append(pop);
    }
    pop.textContent = '';

    const st = statusInfo();

    const head = document.createElement('div');
    head.className = 'ytvf-head';
    const title = document.createElement('span');
    title.className = 'ytvf-title';
    title.textContent = 'Video Filter';
    const pill = document.createElement('span');
    pill.className = `ytvf-pill ${st.cls}`.trim();
    pill.textContent = st.text;
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'ytvf-close';
    closeBtn.setAttribute('aria-label', 'Close Video Filter');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', closePopover);
    head.append(title, pill, closeBtn);

    const body = document.createElement('div');
    body.className = 'ytvf-body';

    const modeRow = document.createElement('div');
    modeRow.className = 'ytvf-mode-row';
    const modeLab = document.createElement('label');
    modeLab.htmlFor = 'ytvf-mode';
    modeLab.textContent = 'Mode';
    const modeSelect = document.createElement('select');
    modeSelect.id = 'ytvf-mode';
    modeSelect.className = 'ytvf-select';
    modeSelect.setAttribute('aria-label', 'Filter mode');
    const modeOptions = [
      ['global', 'Global'],
      ...PRESETS.map((pr) => [pr.id, pr.label]),
      ['custom', 'Custom'],
    ];
    for (const [val, label] of modeOptions) {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = label;
      modeSelect.append(opt);
    }
    modeSelect.value = detectMode(live.values, true);
    modeSelect.addEventListener('change', () => {
      const choice = modeSelect.value;
      if (choice === 'custom') return;
      if (choice === 'global') {
        live.values = readGlobal();
      } else {
        const preset = PRESETS.find((pr) => pr.id === choice);
        if (!preset) return;
        live.values = normalizeFilter({ ...NEUTRAL, ...preset.values });
      }
      const saved = resolveSavedFor(videoIdFromUrl()).values;
      live.dirty = !filtersEqual(live.values, saved);
      applyFilter();
      renderPopover();
    });
    modeRow.append(modeLab, modeSelect);
    body.append(modeRow);

    const sliders = document.createElement('div');
    sliders.className = 'ytvf-sliders';
    for (const p of PARAMS) {
      const off = isParamOff(live.values, p.key);
      const row = document.createElement('div');
      row.className = off ? 'ytvf-row is-muted' : 'ytvf-row';

      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.id = `ytvf-en-${p.key}`;
      chk.checked = !off;
      chk.setAttribute('aria-label', `Toggle ${p.label}`);
      chk.title = `Toggle ${p.label}`;

      const lab = document.createElement('label');
      lab.htmlFor = `ytvf-en-${p.key}`;
      lab.title = `Click to toggle ${p.label}`;
      lab.textContent = p.label;

      const input = document.createElement('input');
      input.type = 'range';
      input.id = `ytvf-sl-${p.key}`;
      input.min = String(p.min);
      input.max = String(p.max);
      input.step = String(p.step);
      input.value = String(live.values[p.key]);
      input.setAttribute('aria-label', p.label);

      const valBtn = document.createElement('button');
      valBtn.type = 'button';
      valBtn.className = 'ytvf-val';
      valBtn.title = `Reset ${p.label}`;
      valBtn.textContent = formatValue(p, live.values[p.key]);

      const syncRow = () => {
        const muted = isParamOff(live.values, p.key);
        row.className = muted ? 'ytvf-row is-muted' : 'ytvf-row';
        chk.checked = !muted;
        input.value = String(live.values[p.key]);
        valBtn.textContent = formatValue(p, live.values[p.key]);
        modeSelect.value = detectMode(live.values, true);
        const saved = resolveSavedFor(videoIdFromUrl()).values;
        live.dirty = !filtersEqual(live.values, saved);
        const nextSt = statusInfo();
        pill.textContent = nextSt.text;
        pill.className = `ytvf-pill ${nextSt.cls}`.trim();
        applyFilter();
      };

      chk.addEventListener('change', () => {
        const nextDisabled = new Set(live.values.disabled || []);
        if (chk.checked) nextDisabled.delete(p.key);
        else nextDisabled.add(p.key);
        live.values = normalizeFilter({ ...live.values, disabled: [...nextDisabled] });
        syncRow();
      });

      const onUpdate = (nextNum) => {
        const nextDisabled = (live.values.disabled || []).filter((k) => k !== p.key);
        live.values = normalizeFilter({ ...live.values, [p.key]: nextNum, disabled: nextDisabled });
        syncRow();
      };

      input.addEventListener('input', () => onUpdate(Number(input.value)));
      valBtn.addEventListener('click', () => onUpdate(p.def));
      row.append(chk, lab, input, valBtn);
      sliders.append(row);
    }
    body.append(sliders);

    const foot = document.createElement('div');
    foot.className = 'ytvf-foot';

    const saveVid = document.createElement('button');
    saveVid.type = 'button';
    saveVid.className = 'ytvf-act is-primary';
    saveVid.textContent = 'Save for this video';
    saveVid.addEventListener('click', () => {
      const id = videoIdFromUrl();
      if (!id) return;
      saveVideo(id, live.values);
      live.dirty = false;
      applyFilter();
      renderPopover();
    });

    const saveGlob = document.createElement('button');
    saveGlob.type = 'button';
    saveGlob.className = 'ytvf-act';
    saveGlob.textContent = 'Save as global';
    saveGlob.addEventListener('click', () => {
      writeGlobal(live.values);
      const id = videoIdFromUrl();
      if (id && readVideos()[id]) {
        saveVideo(id, live.values);
      }
      live.dirty = false;
      applyFilter();
      renderPopover();
    });

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'ytvf-act';
    resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('click', () => {
      live.values = { ...NEUTRAL };
      const saved = resolveSavedFor(videoIdFromUrl()).values;
      live.dirty = !filtersEqual(live.values, saved);
      applyFilter();
      renderPopover();
    });

    foot.append(saveVid, saveGlob, resetBtn);

    if (st.hasOverride) {
      const useGlob = document.createElement('button');
      useGlob.type = 'button';
      useGlob.className = 'ytvf-act';
      useGlob.textContent = 'Use global';
      useGlob.addEventListener('click', () => {
        const id = videoIdFromUrl();
        if (id) deleteVideo(id);
        loadLiveForCurrentVideo();
        applyFilter();
        renderPopover();
      });
      foot.append(useGlob);
    }

    pop.append(head, body, foot);
    updateButtonState();
  }

  function togglePopover() {
    if (document.getElementById('ytvf-popover')) {
      closePopover();
      return;
    }
    if (videoIdFromUrl() !== live.videoId) loadLiveForCurrentVideo();
    renderPopover();
    document.addEventListener('pointerdown', onOutsidePointer, true);
    document.addEventListener('keydown', onPopoverKey, true);
  }

  function syncButton() {
    const wanted = enabled() && onWatchPage();
    if (!wanted) {
      closePopover();
      document.getElementById('ytvf-btn')?.remove();
      document.getElementById('ytvf-player-style')?.remove();
      return;
    }
    const controls = document.querySelector('#movie_player .ytp-right-controls');
    if (!controls) return;
    if (!document.getElementById('ytvf-player-style')) {
      const style = document.createElement('style');
      style.id = 'ytvf-player-style';
      style.textContent = PLAYER_CSS;
      document.head.append(style);
    }
    let btn = document.getElementById('ytvf-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'ytvf-btn';
      btn.className = 'ytp-button';
      btn.setAttribute('aria-controls', 'ytvf-popover');
      btn.append(filterIcon());
      const dot = document.createElement('span');
      dot.className = 'ytvf-dot';
      dot.hidden = true;
      btn.append(dot);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePopover();
      });
    }
    const settingsBtn = controls.querySelector('.ytp-settings-button');
    if (settingsBtn && settingsBtn.parentElement === controls) {
      if (btn.nextElementSibling !== settingsBtn) controls.insertBefore(btn, settingsBtn);
    } else if (btn.parentElement !== controls) {
      controls.prepend(btn);
    }
    updateButtonState();
  }

  // ---------- settings panel ----------

  const PANEL_CSS = `
#ytvf-backdrop{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5)}
#ytvf-panel,#ytvf-panel *{box-sizing:border-box}
#ytvf-panel{width:clamp(320px,88vw,430px);height:min(78dvh,580px);display:flex;flex-direction:column;overflow:hidden;border-radius:14px;background:var(--yt-spec-base-background,#fff);color:var(--yt-spec-text-primary,#0f0f0f);box-shadow:0 16px 40px rgba(0,0,0,.45);font-family:Roboto,Arial,sans-serif}
#ytvf-panel .ytp-head{flex:0 0 auto;display:grid;grid-template-columns:36px 1fr 36px;align-items:center;gap:6px;padding:10px 12px 8px;border-bottom:1px solid var(--yt-spec-10-percent-layer,rgba(128,128,128,.2))}
#ytvf-panel .ytp-title-wrap{min-width:0;text-align:center}
#ytvf-panel .ytp-crumb{display:block;font-size:11px;line-height:1.25;color:var(--yt-spec-text-secondary,#606060);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#ytvf-panel h2{margin:0;font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#ytvf-panel .ytp-spacer{width:36px;height:36px}
#ytvf-panel .ytp-icon{width:36px;height:36px;min-height:36px;padding:0;justify-content:center;border-radius:50%;font-size:18px}
#ytvf-panel .ytp-body{flex:1 1 auto;overflow-y:auto;padding:8px 0 12px}
#ytvf-panel .ytp-desc{margin:4px 16px 8px;font-size:12.5px;line-height:1.45;color:var(--yt-spec-text-secondary,#606060)}
#ytvf-panel hr{margin:6px 0;border:0;border-top:1px solid var(--yt-spec-10-percent-layer,rgba(128,128,128,.2))}
#ytvf-panel button{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;padding:0 16px;border:0;background:none;color:inherit;font:inherit;font-size:14px;text-align:left;cursor:pointer}
#ytvf-panel button:hover:not(:disabled){background:var(--yt-spec-badge-chip-background,rgba(128,128,128,.1))}
#ytvf-panel button:focus-visible{outline:2px solid var(--yt-spec-call-to-action,#065fd4);outline-offset:-2px}
#ytvf-panel .ytp-group.is-disabled{opacity:.42;pointer-events:none;user-select:none}
#ytvf-panel .ytp-val{margin-left:auto;font-size:13px;color:var(--yt-spec-text-secondary,#606060)}
#ytvf-panel .ytp-chev{font-size:16px;opacity:.6}
#ytvf-panel .ytp-reset{color:var(--yt-spec-text-secondary,#606060);font-size:13px}
#ytvf-panel .ytp-reset.is-armed{color:#e05a52;font-weight:500}
#ytvf-panel .ytvf-box{padding:8px 16px;display:flex;flex-direction:column;gap:10px}
#ytvf-panel .ytvf-mode-row{display:grid;grid-template-columns:56px 1fr;align-items:center;gap:8px}
#ytvf-panel .ytvf-mode-row label{font-size:13px}
#ytvf-panel .ytvf-select,#ytvf-panel .ytvf-search{min-height:34px;padding:4px 10px;border-radius:8px;border:1px solid var(--yt-spec-10-percent-layer,rgba(128,128,128,.32));background:var(--yt-spec-badge-chip-background,rgba(128,128,128,.08));color:inherit;font:inherit;font-size:13px}
#ytvf-panel .ytvf-srow{display:grid;grid-template-columns:18px 76px 1fr 52px;align-items:center;gap:6px}
#ytvf-panel .ytvf-srow.is-muted label{opacity:.48;text-decoration:line-through}
#ytvf-panel .ytvf-srow.is-muted input[type="range"],#ytvf-panel .ytvf-srow.is-muted .ytvf-sval{opacity:.42}
#ytvf-panel .ytvf-srow input[type="checkbox"]{width:15px;height:15px;margin:0;accent-color:var(--yt-spec-call-to-action,#3ea6ff);cursor:pointer}
#ytvf-panel .ytvf-srow label{font-size:13px;cursor:pointer;user-select:none}
#ytvf-panel .ytvf-srow input[type="range"]{width:100%;margin:0;accent-color:var(--yt-spec-call-to-action,#3ea6ff)}
#ytvf-panel .ytvf-sval{width:auto;min-height:24px;padding:0;justify-content:flex-end;font-size:12px;color:var(--yt-spec-text-secondary,#606060);font-variant-numeric:tabular-nums}
#ytvf-panel .ytvf-vbar{display:flex;gap:8px;padding:8px 16px 6px}
#ytvf-panel .ytvf-vbar .ytvf-search{flex:1 1 auto;min-width:0}
#ytvf-panel .ytvf-vbar .ytvf-select{flex:0 0 auto;max-width:136px}
#ytvf-panel .ytvf-vitem{display:flex;align-items:center;gap:8px;padding:8px 16px;border-bottom:1px solid var(--yt-spec-10-percent-layer,rgba(128,128,128,.14))}
#ytvf-panel .ytvf-vinfo{flex:1 1 auto;min-width:0}
#ytvf-panel .ytvf-vtitle{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#ytvf-panel .ytvf-vmeta{font-size:11.5px;color:var(--yt-spec-text-secondary,#606060);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#ytvf-panel .ytvf-vrm{width:auto;min-height:30px;padding:0 10px;border-radius:8px;font-size:12px;color:#e05a52}
`;

  const panelState = { view: 'home', resetArmed: false, query: '', sort: 'newest' };

  function closePanel() {
    panelState.resetArmed = false;
    document.removeEventListener('keydown', onPanelKey, true);
    document.getElementById('ytvf-backdrop')?.remove();
    document.getElementById('ytvf-panel-style')?.remove();
  }

  function onPanelKey(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      panelState.resetArmed = false;
      if (panelState.view !== 'home') {
        panelState.view = 'home';
        renderPanel();
      } else {
        closePanel();
      }
    }
  }

  function makeHeader(titleText, crumbText, backFn) {
    const head = document.createElement('div');
    head.className = 'ytp-head';
    if (backFn) {
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'ytp-icon';
      back.setAttribute('aria-label', 'Back');
      back.textContent = '‹';
      back.addEventListener('click', backFn);
      head.append(back);
    } else {
      const sp = document.createElement('span');
      sp.className = 'ytp-spacer';
      head.append(sp);
    }
    const wrap = document.createElement('div');
    wrap.className = 'ytp-title-wrap';
    if (crumbText) {
      const crumb = document.createElement('span');
      crumb.className = 'ytp-crumb';
      crumb.textContent = crumbText;
      wrap.append(crumb);
    }
    const h2 = document.createElement('h2');
    h2.textContent = titleText;
    wrap.append(h2);
    head.append(wrap);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'ytp-icon';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '×';
    close.addEventListener('click', closePanel);
    head.append(close);
    return head;
  }

  function renderPanel() {
    const panel = document.getElementById('ytvf-panel');
    if (!panel) return;
    panel.textContent = '';

    if (panelState.view === 'home') {
      panel.append(makeHeader('Video Filter', '', null));
      const body = document.createElement('div');
      body.className = 'ytp-body';

      const onBtn = document.createElement('button');
      onBtn.type = 'button';
      const onLab = document.createElement('span');
      onLab.textContent = 'Enabled';
      const onVal = document.createElement('span');
      onVal.className = 'ytp-val';
      onVal.textContent = enabled() ? 'On' : 'Off';
      onBtn.append(onLab, onVal);
      onBtn.addEventListener('click', () => {
        put('on', !enabled());
        syncAll();
        renderPanel();
      });
      body.append(onBtn, document.createElement('hr'));

      const group = document.createElement('div');
      group.className = enabled() ? 'ytp-group' : 'ytp-group is-disabled';

      const glob = readGlobal();
      const globBtn = document.createElement('button');
      globBtn.type = 'button';
      globBtn.disabled = !enabled();
      globBtn.innerHTML = '';
      const gLab = document.createElement('span');
      gLab.textContent = 'Global Default';
      const gVal = document.createElement('span');
      gVal.className = 'ytp-val';
      gVal.textContent = isNeutral(glob) ? 'Neutral' : 'Custom';
      const gChev = document.createElement('span');
      gChev.className = 'ytp-chev';
      gChev.textContent = '›';
      globBtn.append(gLab, gVal, gChev);
      globBtn.addEventListener('click', () => {
        panelState.view = 'global';
        renderPanel();
      });

      const vids = readVideos();
      const vCount = Object.keys(vids).length;
      const vidBtn = document.createElement('button');
      vidBtn.type = 'button';
      vidBtn.disabled = !enabled();
      const vLab = document.createElement('span');
      vLab.textContent = 'Saved Videos';
      const vVal = document.createElement('span');
      vVal.className = 'ytp-val';
      vVal.textContent = `${vCount}/${VIDEO_LIMIT}`;
      const vChev = document.createElement('span');
      vChev.className = 'ytp-chev';
      vChev.textContent = '›';
      vidBtn.append(vLab, vVal, vChev);
      vidBtn.addEventListener('click', () => {
        panelState.view = 'videos';
        renderPanel();
      });

      group.append(globBtn, vidBtn);
      body.append(group, document.createElement('hr'));

      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = panelState.resetArmed ? 'ytp-reset is-armed' : 'ytp-reset';
      reset.textContent = panelState.resetArmed ? 'Click again to reset all settings' : 'Reset all to defaults';
      reset.addEventListener('click', () => {
        if (!panelState.resetArmed) {
          panelState.resetArmed = true;
          renderPanel();
          return;
        }
        panelState.resetArmed = false;
        GM_deleteValue('ytvf.on');
        GM_deleteValue('ytvf.global');
        GM_deleteValue('ytvf.videos');
        loadLiveForCurrentVideo();
        syncAll();
        renderPanel();
      });
      body.append(reset);
      panel.append(body);
      return;
    }

    if (panelState.view === 'global') {
      panel.append(makeHeader('Global Default', 'Video Filter', () => { panelState.view = 'home'; renderPanel(); }));
      const body = document.createElement('div');
      body.className = 'ytp-body';
      const desc = document.createElement('p');
      desc.className = 'ytp-desc';
      desc.textContent = 'Applies to every watch page unless that video has a saved override.';
      body.append(desc);

      const box = document.createElement('div');
      box.className = 'ytvf-box';

      let glob = readGlobal();
      const commitGlobal = (next) => {
        glob = normalizeFilter(next);
        writeGlobal(glob);
        const id = videoIdFromUrl();
        if (id && !readVideos()[id] && !live.dirty) {
          live.values = { ...glob };
        }
        applyFilter();
        if (document.getElementById('ytvf-popover')) renderPopover();
      };

      const modeRow = document.createElement('div');
      modeRow.className = 'ytvf-mode-row';
      const modeLab = document.createElement('label');
      modeLab.htmlFor = 'ytvf-g-mode';
      modeLab.textContent = 'Mode';
      const modeSelect = document.createElement('select');
      modeSelect.id = 'ytvf-g-mode';
      modeSelect.className = 'ytvf-select';
      modeSelect.setAttribute('aria-label', 'Global filter mode');
      for (const [val, label] of [...PRESETS.map((pr) => [pr.id, pr.label]), ['custom', 'Custom']]) {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = label;
        modeSelect.append(opt);
      }
      modeSelect.value = detectMode(glob, false);
      modeSelect.addEventListener('change', () => {
        if (modeSelect.value === 'custom') return;
        const preset = PRESETS.find((pr) => pr.id === modeSelect.value);
        if (!preset) return;
        commitGlobal({ ...NEUTRAL, ...preset.values });
        renderPanel();
      });
      modeRow.append(modeLab, modeSelect);
      box.append(modeRow);

      for (const p of PARAMS) {
        const off = isParamOff(glob, p.key);
        const row = document.createElement('div');
        row.className = off ? 'ytvf-srow is-muted' : 'ytvf-srow';
        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.id = `ytvf-ge-${p.key}`;
        chk.checked = !off;
        chk.setAttribute('aria-label', `Toggle ${p.label}`);
        const lab = document.createElement('label');
        lab.htmlFor = `ytvf-ge-${p.key}`;
        lab.title = `Click to toggle ${p.label}`;
        lab.textContent = p.label;
        const input = document.createElement('input');
        input.type = 'range';
        input.id = `ytvf-g-${p.key}`;
        input.min = String(p.min);
        input.max = String(p.max);
        input.step = String(p.step);
        input.value = String(glob[p.key]);
        const valBtn = document.createElement('button');
        valBtn.type = 'button';
        valBtn.className = 'ytvf-sval';
        valBtn.textContent = formatValue(p, glob[p.key]);
        const syncGlobalRow = () => {
          const muted = isParamOff(glob, p.key);
          row.className = muted ? 'ytvf-srow is-muted' : 'ytvf-srow';
          chk.checked = !muted;
          input.value = String(glob[p.key]);
          valBtn.textContent = formatValue(p, glob[p.key]);
          modeSelect.value = detectMode(glob, false);
        };
        chk.addEventListener('change', () => {
          const nextDisabled = new Set(glob.disabled || []);
          if (chk.checked) nextDisabled.delete(p.key);
          else nextDisabled.add(p.key);
          commitGlobal({ ...glob, disabled: [...nextDisabled] });
          syncGlobalRow();
        });
        const update = (v) => {
          const nextDisabled = (glob.disabled || []).filter((k) => k !== p.key);
          commitGlobal({ ...glob, [p.key]: v, disabled: nextDisabled });
          syncGlobalRow();
        };
        input.addEventListener('input', () => update(Number(input.value)));
        valBtn.addEventListener('click', () => update(p.def));
        row.append(chk, lab, input, valBtn);
        box.append(row);
      }

      body.append(box);
      panel.append(body);
      return;
    }

    if (panelState.view === 'videos') {
      panel.append(makeHeader('Saved Videos', 'Video Filter', () => { panelState.view = 'home'; renderPanel(); }));
      const body = document.createElement('div');
      body.className = 'ytp-body';
      const vids = readVideos();
      const allEntries = Object.entries(vids);
      if (!allEntries.length) {
        const empty = document.createElement('p');
        empty.className = 'ytp-desc';
        empty.textContent = 'No per-video filters saved yet. Use the Video Filter button in the player to save one.';
        body.append(empty);
      } else {
        const bar = document.createElement('div');
        bar.className = 'ytvf-vbar';
        const search = document.createElement('input');
        search.type = 'search';
        search.id = 'ytvf-vsearch';
        search.className = 'ytvf-search';
        search.placeholder = 'Search title, ID, or filter...';
        search.setAttribute('aria-label', 'Search saved videos');
        search.value = panelState.query;

        const sortSel = document.createElement('select');
        sortSel.id = 'ytvf-vsort';
        sortSel.className = 'ytvf-select';
        sortSel.setAttribute('aria-label', 'Sort saved videos');
        for (const [val, label] of [
          ['newest', 'Newest saved'],
          ['oldest', 'Oldest saved'],
          ['az', 'Title A-Z'],
          ['za', 'Title Z-A'],
        ]) {
          const opt = document.createElement('option');
          opt.value = val;
          opt.textContent = label;
          sortSel.append(opt);
        }
        sortSel.value = panelState.sort;
        bar.append(search, sortSel);
        body.append(bar);

        const listBox = document.createElement('div');
        listBox.id = 'ytvf-vlist';
        body.append(listBox);

        const drawList = () => {
          listBox.textContent = '';
          const q = panelState.query.trim().toLowerCase();
          let filtered = Object.entries(readVideos());
          if (q) {
            filtered = filtered.filter(([id, entry]) =>
              id.toLowerCase().includes(q) ||
              (entry.title || '').toLowerCase().includes(q) ||
              summarizeFilter(entry).toLowerCase().includes(q)
            );
          }
          filtered.sort((a, b) => {
            if (panelState.sort === 'oldest') return (a[1].at || 0) - (b[1].at || 0);
            if (panelState.sort === 'az') return (a[1].title || a[0]).localeCompare(b[1].title || b[0], 'en', { sensitivity: 'base' });
            if (panelState.sort === 'za') return (b[1].title || b[0]).localeCompare(a[1].title || a[0], 'en', { sensitivity: 'base' });
            return (b[1].at || 0) - (a[1].at || 0);
          });
          if (!filtered.length) {
            const none = document.createElement('p');
            none.className = 'ytp-desc';
            none.textContent = 'No matching saved videos.';
            listBox.append(none);
            return;
          }
          for (const [id, entry] of filtered) {
            const item = document.createElement('div');
            item.className = 'ytvf-vitem';
            const info = document.createElement('div');
            info.className = 'ytvf-vinfo';
            const t = document.createElement('div');
            t.className = 'ytvf-vtitle';
            t.textContent = entry.title || id;
            const m = document.createElement('div');
            m.className = 'ytvf-vmeta';
            m.textContent = `${id} · ${summarizeFilter(entry)}`;
            info.append(t, m);
            const rm = document.createElement('button');
            rm.type = 'button';
            rm.className = 'ytvf-vrm';
            rm.textContent = 'Remove';
            rm.addEventListener('click', () => {
              deleteVideo(id);
              if (id === videoIdFromUrl()) {
                loadLiveForCurrentVideo();
                applyFilter();
                if (document.getElementById('ytvf-popover')) renderPopover();
              }
              if (!Object.keys(readVideos()).length) renderPanel();
              else drawList();
            });
            item.append(info, rm);
            listBox.append(item);
          }
        };

        search.addEventListener('input', () => {
          panelState.query = search.value;
          drawList();
        });
        sortSel.addEventListener('change', () => {
          panelState.sort = sortSel.value;
          drawList();
        });
        drawList();

        body.append(document.createElement('hr'));
        const clearAll = document.createElement('button');
        clearAll.type = 'button';
        clearAll.className = 'ytp-reset is-armed';
        clearAll.textContent = 'Clear all saved videos';
        clearAll.addEventListener('click', () => {
          writeVideos({});
          panelState.query = '';
          loadLiveForCurrentVideo();
          applyFilter();
          if (document.getElementById('ytvf-popover')) renderPopover();
          renderPanel();
        });
        body.append(clearAll);
      }
      panel.append(body);
    }
  }

  function openPanel() {
    if (document.getElementById('ytvf-backdrop')) return;
    panelState.view = 'home';
    panelState.resetArmed = false;
    const style = document.createElement('style');
    style.id = 'ytvf-panel-style';
    style.textContent = PANEL_CSS;
    document.head.append(style);

    const backdrop = document.createElement('div');
    backdrop.id = 'ytvf-backdrop';
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closePanel();
    });
    const panel = document.createElement('div');
    panel.id = 'ytvf-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'YouTube: Video Filter');
    backdrop.append(panel);
    document.body.append(backdrop);
    renderPanel();
    document.addEventListener('keydown', onPanelKey, true);
  }

  // ---------- menu & lifecycle ----------

  let menuIds = [];
  function drawMenu() {
    for (const id of menuIds) {
      try { GM_unregisterMenuCommand(id); } catch {}
    }
    menuIds = [
      GM_registerMenuCommand('YouTube: Video Filter', openPanel),
    ];
  }

  let adObserver = null;
  let observedPlayer = null;
  function attachAdObserver() {
    const player = playerEl();
    if (!player || player === observedPlayer) return;
    if (adObserver) adObserver.disconnect();
    observedPlayer = player;
    adObserver = new MutationObserver(() => applyFilter());
    adObserver.observe(player, { attributes: true, attributeFilter: ['class'] });
  }

  function syncAll() {
    attachAdObserver();
    syncButton();
    applyFilter();
  }

  document.addEventListener('yt-navigate-finish', () => {
    closePopover();
    loadLiveForCurrentVideo();
    syncAll();
    setTimeout(syncAll, 1000);
  });

  drawMenu();
  loadLiveForCurrentVideo();
  syncAll();
  setTimeout(syncAll, 800);
})();

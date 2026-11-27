// ==UserScript==
// @name         YouTube: General Custom
// @namespace    https://github.com/Afadfath03/Userscript
// @version      1.0
// @description  Custom video grid columns per section, Open Shorts in Watch Page, and Clean Share Link in one YouTube script
// @author       Afadfath03
// @homepageURL  https://github.com/Afadfath03/Userscript
// @supportURL   https://github.com/Afadfath03/Userscript/issues
// @downloadURL  https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube/youtube-general-custom.user.js
// @updateURL    https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube/youtube-general-custom.user.js
// @icon         https://raw.githubusercontent.com/Afadfath03/Userscript/main/assets/icons/youtube/youtube-general-custom.png
// @license      MIT
// @match        https://www.youtube.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_setClipboard
// ==/UserScript==

(() => {
  // Embeds and live chat frames do not carry the page-level UI this script adjusts
  if (window.self !== window.top) return;

  const COLUMNS = [[2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6'], [7, '7'], [8, '8']];
  const SUBSECTIONS = [
    {
      id: 'grid',
      title: 'Custom Grid',
      desc: 'Sets a custom number of videos per row with uniform card sizing.',
      rows: [
        { key: 'gridOn', label: 'Enable Custom Grid', type: 'toggle', def: true },
        { key: 'gridColumns', label: 'Videos per row', type: 'choice', def: 4, options: COLUMNS },
        { key: 'gridHome', label: 'Home', type: 'toggle', group: 'Sections', def: true },
        { key: 'gridSubscriptions', label: 'Subscriptions', type: 'toggle', group: 'Sections', def: true },
        { key: 'gridChannel', label: 'Channel', type: 'toggle', group: 'Sections', def: true },
        { key: 'gridOther', label: 'Other grids', type: 'toggle', group: 'Sections', def: true },
      ],
      summary: () => (get('gridOn', true) ? `${cols()}/row` : 'Off'),
    },
    {
      id: 'shorts',
      title: 'Shorts',
      desc: 'Opens Shorts in the normal watch player by rewriting /shorts/ links to /watch.',
      rows: [
        { key: 'shortsToWatch', label: 'Open Shorts in Watch Page', type: 'toggle', def: false },
      ],
      summary: () => (get('shortsToWatch', false) ? 'On' : 'Off'),
    },
    {
      id: 'share',
      title: 'Share Link',
      desc: 'Removes si, pp and tracking parameters when copying share links or viewing URLs.',
      rows: [
        { key: 'cleanShare', label: 'Clean copied share links', type: 'toggle', def: true },
        { key: 'cleanAddress', label: 'Clean address bar', type: 'toggle', def: false },
      ],
      summary: () => (get('cleanShare', true) ? (get('cleanAddress', false) ? 'Share + URL' : 'On') : 'Off'),
    },
  ];

  const get = (key, fallback) => {
    const v = GM_getValue(`ytgc.${key}`, fallback);
    return v === undefined || v === null ? fallback : v;
  };
  const put = (key, value) => GM_setValue(`ytgc.${key}`, value);
  const enabled = () => get('on', true) === true;
  const cols = () => {
    const v = get('gridColumns', 4);
    return COLUMNS.some(([c]) => c === v) ? v : 4;
  };

  // ---------- custom grid ----------

  const GRID_SECTIONS = [
    { key: 'gridHome', cls: 'ytgc-home', scope: 'ytd-browse[page-subtype="home"]' },
    { key: 'gridSubscriptions', cls: 'ytgc-subs', scope: 'ytd-browse[page-subtype="subscriptions"]' },
    { key: 'gridChannel', cls: 'ytgc-channel', scope: 'ytd-browse[page-subtype="channels"]' },
    {
      key: 'gridOther',
      cls: 'ytgc-other',
      scope: 'ytd-browse:not([page-subtype="home"]):not([page-subtype="subscriptions"]):not([page-subtype="channels"])',
    },
  ];

  {
    const scopes = GRID_SECTIONS.map((s) => `html.${s.cls} ${s.scope}`);
    const sel = (suffix) => scopes.map((s) => `${s} ${suffix}`).join(',');
    const item = 'ytd-rich-item-renderer:not([is-slim-media]):not([is-post]):not([is-mini-mode])';
    const style = document.createElement('style');
    style.id = 'ytgc-grid';
    style.textContent =
      `${sel('ytd-rich-grid-renderer')}{` +
      `--ytd-rich-grid-items-per-row:var(--ytgc-cols)!important;` +
      `--ytd-rich-grid-item-max-width:none!important;` +
      `--ytd-rich-grid-item-min-width:0px!important}` +
      `${sel('ytd-rich-grid-renderer>#contents')}{` +
      `display:flex!important;flex-wrap:wrap!important;align-items:flex-start!important}` +
      `${sel('ytd-rich-grid-row')},${sel('ytd-rich-grid-row>#contents')}{display:contents!important}` +
      `${sel(item)}{` +
      `--ytd-rich-grid-items-per-row:var(--ytgc-cols)!important;` +
      `box-sizing:border-box!important;` +
      `width:calc(100% / var(--ytgc-cols) - var(--ytd-rich-grid-item-margin, 16px) - 0.01px)!important;` +
      `max-width:calc(100% / var(--ytgc-cols) - var(--ytd-rich-grid-item-margin, 16px) - 0.01px)!important;` +
      `min-width:0!important;` +
      `flex:0 0 calc(100% / var(--ytgc-cols) - var(--ytd-rich-grid-item-margin, 16px) - 0.01px)!important;` +
      `margin-left:calc(var(--ytd-rich-grid-item-margin, 16px) / 2)!important;` +
      `margin-right:calc(var(--ytd-rich-grid-item-margin, 16px) / 2)!important}` +
      `${sel(`${item}>#content`)},${sel(`${item} ytd-rich-grid-media`)},${sel(`${item} yt-lockup-view-model`)}{` +
      `width:100%!important;max-width:100%!important;min-width:0!important}` +
      `${sel('ytd-rich-section-renderer')},${sel('ytd-continuation-item-renderer')}{` +
      `width:100%!important;flex:0 0 100%!important}`;
    document.documentElement.append(style);
  }

  function applyGrid() {
    const root = document.documentElement;
    const active = enabled() && get('gridOn', true) === true;
    if (active) root.style.setProperty('--ytgc-cols', String(cols()));
    else root.style.removeProperty('--ytgc-cols');
    for (const s of GRID_SECTIONS) root.classList.toggle(s.cls, active && get(s.key, true) === true);
  }

  // ---------- open shorts in watch page ----------

  const SHORTS = /^\/shorts\/([A-Za-z0-9_-]{6,})/;
  const shortsOn = () => enabled() && get('shortsToWatch', false) === true;

  function toWatchUrl(raw) {
    let url;
    try {
      url = new URL(raw, location.origin);
    } catch {
      return null;
    }
    if (url.origin !== location.origin) return null;
    const match = SHORTS.exec(url.pathname);
    if (!match) return null;
    const next = new URL(`/watch?v=${match[1]}`, location.origin);
    const time = url.searchParams.get('t');
    if (time) next.searchParams.set('t', time);
    return next;
  }

  function rewriteShortsLinks(root = document) {
    if (!shortsOn() || !root || typeof root.querySelectorAll !== 'function') return;
    const links = root.matches && root.matches('a[href*="/shorts/"]')
      ? [root, ...root.querySelectorAll('a[href*="/shorts/"]')]
      : root.querySelectorAll('a[href*="/shorts/"]');
    for (const link of links) {
      const next = toWatchUrl(link.getAttribute('href') || '');
      if (next) link.setAttribute('href', next.pathname + next.search);
    }
  }

  function rewriteShortsPage() {
    if (!shortsOn()) return;
    const match = SHORTS.exec(location.pathname);
    if (!match) return;
    const url = toWatchUrl(location.pathname + location.search);
    if (!url) return;
    location.replace(url.toString());
  }

  function syncShorts() {
    rewriteShortsPage();
    rewriteShortsLinks();
  }

  // ---------- clean share link ----------

  const TRACKING = ['si', 'pp', 'feature', 'ab_channel', 'source_ve_path', 'embeds_referring_euri', 'embeds_referring_origin'];
  const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);
  const SHARE_INPUT = 'yt-copy-link-renderer #share-url, #share-url';
  const SHARE_COPY = 'yt-copy-link-renderer #copy-button, yt-copy-link-renderer button';
  const shareOn = () => enabled() && get('cleanShare', true) === true;
  const addressOn = () => shareOn() && get('cleanAddress', false) === true;

  function stripTracking(url) {
    let changed = false;
    for (const key of TRACKING) {
      if (!url.searchParams.has(key)) continue;
      url.searchParams.delete(key);
      changed = true;
    }
    return changed;
  }

  function cleanUrl(raw) {
    let url;
    try {
      url = new URL(raw);
    } catch {
      return raw;
    }
    if (!HOSTS.has(url.hostname)) return raw;
    return stripTracking(url) ? url.toString() : raw;
  }

  function linkAt(id, seconds) {
    const t = Math.floor(seconds);
    return t > 0 ? `https://youtu.be/${id}?t=${t}` : `https://youtu.be/${id}`;
  }

  async function copyText(text) {
    try {
      if (typeof GM_setClipboard === 'function') {
        GM_setClipboard(text, 'text');
        return true;
      }
    } catch {
      // fall through to page clipboard
    }
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  let toastTimer = 0;
  function toast(text) {
    document.getElementById('ytgc-toast')?.remove();
    clearTimeout(toastTimer);
    const box = document.createElement('div');
    box.id = 'ytgc-toast';
    box.setAttribute('role', 'status');
    box.textContent = text;
    box.style.cssText =
      'position:fixed;left:24px;bottom:24px;z-index:2147483647;padding:12px 16px;border-radius:8px;background:#0f0f0f;color:#fff;font:14px Roboto,Arial,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.35)';
    document.body.append(box);
    toastTimer = setTimeout(() => box.remove(), 2000);
  }

  function cleanInputs() {
    if (!shareOn()) return;
    for (const input of document.querySelectorAll(SHARE_INPUT)) {
      const clean = cleanUrl(input.value);
      if (clean !== input.value) input.value = clean;
    }
  }

  function cleanAddress() {
    if (!addressOn()) return;
    const url = new URL(location.href);
    if (stripTracking(url)) history.replaceState(history.state, '', url.toString());
  }

  async function copyAtTime() {
    if (location.pathname !== '/watch') return;
    const id = new URLSearchParams(location.search).get('v');
    if (!id) return;
    const video = document.querySelector('#movie_player video') || document.querySelector('video');
    const ok = await copyText(linkAt(id, video ? video.currentTime : 0));
    toast(ok ? 'Link copied' : 'Clipboard blocked');
  }

  document.addEventListener(
    'click',
    async (e) => {
      if (!shareOn()) return;
      const button = e.target instanceof Element ? e.target.closest(SHARE_COPY) : null;
      if (!button) return;
      const renderer = button.closest('yt-copy-link-renderer');
      const input = renderer && renderer.querySelector('#share-url, input');
      if (!input) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      input.value = cleanUrl(input.value);
      if (await copyText(input.value)) {
        toast('Link copied');
        return;
      }
      input.focus();
      input.select();
    },
    true
  );

  let mutRaf = 0;
  const linkQueue = new Set();
  new MutationObserver((list) => {
    const watchShorts = shortsOn();
    const watchShare = shareOn();
    if (!watchShorts && !watchShare) return;
    let added = false;
    for (const m of list) {
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        added = true;
        if (watchShorts) linkQueue.add(n);
      }
    }
    if (!added || mutRaf) return;
    mutRaf = requestAnimationFrame(() => {
      mutRaf = 0;
      if (linkQueue.size) {
        const batch = [...linkQueue];
        linkQueue.clear();
        for (const node of batch) rewriteShortsLinks(node);
      }
      if (shareOn()) cleanInputs();
    });
  }).observe(document.documentElement, { childList: true, subtree: true });

  setInterval(() => {
    if (shareOn() && document.querySelector(SHARE_INPUT)) cleanInputs();
  }, 250);

  document.addEventListener('yt-navigate-start', rewriteShortsPage);
  document.addEventListener('yt-navigate-finish', () => {
    syncShorts();
    cleanAddress();
  });
  window.addEventListener('popstate', () => {
    syncShorts();
    cleanAddress();
  });

  function applyAll() {
    applyGrid();
    syncShorts();
    cleanAddress();
    cleanInputs();
  }

  // ---------- panel ----------

  const PANEL_CSS = `
#ytgc-backdrop{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5)}
#ytgc-panel,#ytgc-panel *{box-sizing:border-box}
#ytgc-panel{width:clamp(320px,88vw,420px);height:min(76dvh,560px);display:flex;flex-direction:column;overflow:hidden;border-radius:14px;background:var(--yt-spec-base-background,#fff);color:var(--yt-spec-text-primary,#0f0f0f);box-shadow:0 16px 40px rgba(0,0,0,.45);font-family:Roboto,Arial,sans-serif}
#ytgc-panel .ytp-head{flex:0 0 auto;display:grid;grid-template-columns:36px 1fr 36px;align-items:center;gap:6px;padding:10px 12px 8px;border-bottom:1px solid var(--yt-spec-10-percent-layer,rgba(128,128,128,.2))}
#ytgc-panel .ytp-title-wrap{min-width:0;text-align:center}
#ytgc-panel .ytp-crumb{display:block;font-size:11px;line-height:1.25;color:var(--yt-spec-text-secondary,#606060);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#ytgc-panel h2{margin:0;font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#ytgc-panel .ytp-spacer{width:36px;height:36px}
#ytgc-panel .ytp-icon{width:36px;height:36px;min-height:36px;padding:0;justify-content:center;border-radius:50%;font-size:18px}
#ytgc-panel .ytp-body{flex:1 1 auto;overflow-y:auto;padding:8px 0 12px}
#ytgc-panel .ytp-desc{margin:4px 16px 8px;font-size:12.5px;line-height:1.45;color:var(--yt-spec-text-secondary,#606060)}
#ytgc-panel .ytp-section{padding:10px 16px 4px;font-size:12px;font-weight:600;color:var(--yt-spec-text-secondary,#606060);text-transform:uppercase;letter-spacing:.03em}
#ytgc-panel hr{margin:6px 0;border:0;border-top:1px solid var(--yt-spec-10-percent-layer,rgba(128,128,128,.2))}
#ytgc-panel button{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;padding:0 16px;border:0;background:none;color:inherit;font:inherit;font-size:14px;text-align:left;cursor:pointer}
#ytgc-panel button:hover:not(:disabled){background:var(--yt-spec-badge-chip-background,rgba(128,128,128,.1))}
#ytgc-panel button:focus-visible{outline:2px solid var(--yt-spec-call-to-action,#065fd4);outline-offset:-2px}
#ytgc-panel .ytp-group.is-disabled{opacity:.42;pointer-events:none;user-select:none}
#ytgc-panel .ytp-val{margin-left:auto;font-size:13px;color:var(--yt-spec-text-secondary,#606060)}
#ytgc-panel .ytp-chev{font-size:16px;opacity:.6}
#ytgc-panel .ytp-check{margin-left:auto;font-weight:700;color:var(--yt-spec-call-to-action,#3ea6ff)}
#ytgc-panel .ytp-reset{color:var(--yt-spec-text-secondary,#606060);font-size:13px}
#ytgc-panel .ytp-reset.is-armed{color:#e05a52;font-weight:500}
`;

  const state = { view: 'home', sub: null, rowKey: null, resetArmed: false };

  function closePanel() {
    state.resetArmed = false;
    document.removeEventListener('keydown', onKey, true);
    document.getElementById('ytgc-backdrop')?.remove();
    document.getElementById('ytgc-style')?.remove();
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      state.resetArmed = false;
      if (state.view === 'options') { state.view = 'sub'; render(); }
      else if (state.view === 'sub') { state.view = 'home'; render(); }
      else closePanel();
      return;
    }
    if (e.key !== 'Tab') return;
    const panel = document.getElementById('ytgc-panel');
    if (!panel) return;
    const items = [...panel.querySelectorAll('button:not(:disabled)')];
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

  function header(titleText, onBack, crumb) {
    const head = document.createElement('div');
    head.className = 'ytp-head';
    if (onBack) {
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'ytp-icon';
      back.setAttribute('aria-label', 'Back');
      back.textContent = '\u2190';
      back.addEventListener('click', () => { state.resetArmed = false; onBack(); });
      head.append(back);
    } else {
      const spacer = document.createElement('span');
      spacer.className = 'ytp-spacer';
      head.append(spacer);
    }
    const wrap = document.createElement('div');
    wrap.className = 'ytp-title-wrap';
    if (crumb) {
      const c = document.createElement('span');
      c.className = 'ytp-crumb';
      c.textContent = crumb;
      wrap.append(c);
    }
    const h2 = document.createElement('h2');
    h2.textContent = titleText;
    wrap.append(h2);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'ytp-icon';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '\u00d7';
    close.addEventListener('click', closePanel);
    head.append(wrap, close);
    return head;
  }

  function rowBtn(label, val, onClick, opts = {}) {
    const btn = document.createElement('button');
    btn.type = 'button';
    if (opts.disabled) btn.disabled = true;
    if (opts.pressed !== undefined) btn.setAttribute('aria-pressed', opts.pressed ? 'true' : 'false');
    const name = document.createElement('span');
    name.textContent = label;
    btn.append(name);
    if (val !== undefined) {
      const v = document.createElement('span');
      v.className = 'ytp-val';
      v.textContent = val;
      btn.append(v);
    }
    if (opts.chevron) {
      const c = document.createElement('span');
      c.className = 'ytp-chev';
      c.textContent = '\u203a';
      btn.append(c);
    }
    if (opts.checked) {
      const ck = document.createElement('span');
      ck.className = 'ytp-check';
      ck.textContent = '\u2713';
      btn.append(ck);
    }
    btn.addEventListener('click', () => {
      if (!opts.keepArmed) state.resetArmed = false;
      onClick();
    });
    return btn;
  }

  function render() {
    const panel = document.getElementById('ytgc-panel');
    if (!panel) return;
    const prevBody = panel.querySelector('.ytp-body');
    const scrollTop = prevBody ? prevBody.scrollTop : 0;
    panel.textContent = '';

    const body = document.createElement('div');
    body.className = 'ytp-body';

    if (state.view === 'home') {
      panel.append(header('YouTube: General Custom'), body);
      const desc = document.createElement('p');
      desc.className = 'ytp-desc';
      desc.textContent = 'Grid layout, Shorts redirect, and clean share links in one place.';
      body.append(desc, document.createElement('hr'));
      const on = enabled();
      body.append(rowBtn('Enabled', on ? 'On' : 'Off', () => {
        put('on', !on);
        applyAll();
        drawMenu();
        render();
      }, { pressed: on }));

      const group = document.createElement('div');
      group.className = on ? 'ytp-group' : 'ytp-group is-disabled';
      const sec = document.createElement('div');
      sec.className = 'ytp-section';
      sec.textContent = 'Sub-sections';
      group.append(sec);
      for (const s of SUBSECTIONS) {
        group.append(rowBtn(s.title, s.summary(), () => {
          state.view = 'sub';
          state.sub = s.id;
          render();
        }, { chevron: true, disabled: !on }));
      }
      body.append(group, document.createElement('hr'));

      const reset = rowBtn(
        state.resetArmed ? 'Click again to reset General Custom' : 'Reset General Custom',
        undefined,
        () => {
          if (!state.resetArmed) {
            state.resetArmed = true;
            render();
            return;
          }
          state.resetArmed = false;
          if (typeof GM_deleteValue === 'function') {
            GM_deleteValue('ytgc.on');
            for (const s of SUBSECTIONS) for (const r of s.rows) GM_deleteValue(`ytgc.${r.key}`);
          } else {
            put('on', true);
            for (const s of SUBSECTIONS) for (const r of s.rows) put(r.key, r.def);
          }
          applyAll();
          drawMenu();
          render();
        },
        { keepArmed: true }
      );
      reset.className = state.resetArmed ? 'ytp-reset is-armed' : 'ytp-reset';
      body.append(reset);
      body.scrollTop = scrollTop;
      return;
    }

    const sub = SUBSECTIONS.find((s) => s.id === state.sub);
    if (!sub) { state.view = 'home'; render(); return; }

    if (state.view === 'sub') {
      panel.append(header(sub.title, () => { state.view = 'home'; render(); }, 'General Custom'), body);
      const desc = document.createElement('p');
      desc.className = 'ytp-desc';
      desc.textContent = sub.desc;
      body.append(desc, document.createElement('hr'));
      let lastGroup = '';
      for (const r of sub.rows) {
        if (r.group && r.group !== lastGroup) {
          lastGroup = r.group;
          const g = document.createElement('div');
          g.className = 'ytp-section';
          g.textContent = r.group;
          body.append(g);
        }
        if (r.type === 'toggle') {
          const on = get(r.key, r.def) === true;
          body.append(rowBtn(r.label, on ? 'On' : 'Off', () => {
            put(r.key, !on);
            applyAll();
            drawMenu();
            render();
          }, { pressed: on }));
        } else if (r.type === 'choice') {
          const cur = get(r.key, r.def);
          const hit = r.options.find(([v]) => v === cur);
          body.append(rowBtn(r.label, hit ? hit[1] : String(cur), () => {
            state.view = 'options';
            state.rowKey = r.key;
            render();
          }, { chevron: true }));
        }
      }
      body.scrollTop = scrollTop;
      return;
    }

    const row = sub.rows.find((r) => r.key === state.rowKey);
    if (!row) { state.view = 'sub'; render(); return; }
    panel.append(header(row.label, () => { state.view = 'sub'; render(); }, `General Custom \u203a ${sub.title}`), body);
    const cur = get(row.key, row.def);
    for (const [val, label] of row.options) {
      body.append(rowBtn(label, undefined, () => {
        put(row.key, val);
        applyAll();
        drawMenu();
        state.view = 'sub';
        render();
      }, { checked: val === cur }));
    }
  }

  function openPanel() {
    if (document.getElementById('ytgc-backdrop')) return;
    state.view = 'home';
    state.sub = null;
    state.rowKey = null;
    state.resetArmed = false;
    const style = document.createElement('style');
    style.id = 'ytgc-style';
    style.textContent = PANEL_CSS;
    document.head.append(style);

    const backdrop = document.createElement('div');
    backdrop.id = 'ytgc-backdrop';
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) closePanel();
    });

    const panel = document.createElement('div');
    panel.id = 'ytgc-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'YouTube: General Custom');

    backdrop.append(panel);
    document.body.append(backdrop);
    document.addEventListener('keydown', onKey, true);
    render();
    panel.querySelector('.ytp-body button:not(:disabled)')?.focus();
  }

  let menuIds = [];
  function drawMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    if (typeof GM_unregisterMenuCommand === 'function') {
      for (const id of menuIds) GM_unregisterMenuCommand(id);
    }
    menuIds = [
      GM_registerMenuCommand(enabled() ? `General Custom (${cols()}/row)` : 'General Custom (off)', openPanel),
    ];
    if (shareOn()) {
      menuIds.push(GM_registerMenuCommand('Copy link at current time', copyAtTime));
    }
  }

  applyAll();
  drawMenu();
})();

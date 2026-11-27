// ==UserScript==
// @name         YouTube: Custom Grid
// @namespace    https://github.com/Afadfath03/Userscript
// @version      1.0
// @description  Sets a custom number of videos per row on YouTube grids with per-section toggles and uniform card sizing
// @author       Afadfath03
// @homepageURL  https://github.com/Afadfath03/Userscript
// @supportURL   https://github.com/Afadfath03/Userscript/issues
// @downloadURL  https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube/youtube-custom-grid.user.js
// @updateURL    https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube/youtube-custom-grid.user.js
// @icon         https://raw.githubusercontent.com/Afadfath03/Userscript/main/assets/icons/youtube/youtube-custom-grid.png
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
  // Embeds and live chat frames do not carry the feed grids this script lays out
  if (window.self !== window.top) return;

  const COLUMNS = [2, 3, 4, 5, 6, 7, 8];
  const DEFAULT_COLUMNS = 4;
  const SECTIONS = [
    { key: 'home', label: 'Home', cls: 'ytcg-home', scope: 'ytd-browse[page-subtype="home"]' },
    { key: 'subscriptions', label: 'Subscriptions', cls: 'ytcg-subs', scope: 'ytd-browse[page-subtype="subscriptions"]' },
    { key: 'channel', label: 'Channel', cls: 'ytcg-channel', scope: 'ytd-browse[page-subtype="channels"]' },
    {
      key: 'other',
      label: 'Other grids',
      cls: 'ytcg-other',
      scope: 'ytd-browse:not([page-subtype="home"]):not([page-subtype="subscriptions"]):not([page-subtype="channels"])',
    },
  ];

  const get = (key, fallback) => {
    const v = GM_getValue(`ytcg.${key}`, fallback);
    return v === undefined || v === null ? fallback : v;
  };
  const put = (key, value) => GM_setValue(`ytcg.${key}`, value);
  const enabled = () => get('on', true) === true;
  const columns = () => {
    const v = get('columns', DEFAULT_COLUMNS);
    return COLUMNS.includes(v) ? v : DEFAULT_COLUMNS;
  };
  const sectionOn = (key) => get(key, true) === true;

  function buildGridCss() {
    const scopes = SECTIONS.map((s) => `html.${s.cls} ${s.scope}`);
    const sel = (suffix) => scopes.map((s) => `${s} ${suffix}`).join(',');
    const item = 'ytd-rich-item-renderer:not([is-slim-media]):not([is-post]):not([is-mini-mode])';
    return (
      `${sel('ytd-rich-grid-renderer')}{` +
      `--ytd-rich-grid-items-per-row:var(--ytcg-cols)!important;` +
      `--ytd-rich-grid-item-max-width:none!important;` +
      `--ytd-rich-grid-item-min-width:0px!important}` +
      `${sel('ytd-rich-grid-renderer>#contents')}{` +
      `display:flex!important;flex-wrap:wrap!important;align-items:flex-start!important}` +
      `${sel('ytd-rich-grid-row')},${sel('ytd-rich-grid-row>#contents')}{display:contents!important}` +
      `${sel(item)}{` +
      `--ytd-rich-grid-items-per-row:var(--ytcg-cols)!important;` +
      `box-sizing:border-box!important;` +
      `width:calc(100% / var(--ytcg-cols) - var(--ytd-rich-grid-item-margin, 16px) - 0.01px)!important;` +
      `max-width:calc(100% / var(--ytcg-cols) - var(--ytd-rich-grid-item-margin, 16px) - 0.01px)!important;` +
      `min-width:0!important;` +
      `flex:0 0 calc(100% / var(--ytcg-cols) - var(--ytd-rich-grid-item-margin, 16px) - 0.01px)!important;` +
      `margin-left:calc(var(--ytd-rich-grid-item-margin, 16px) / 2)!important;` +
      `margin-right:calc(var(--ytd-rich-grid-item-margin, 16px) / 2)!important}` +
      `${sel(`${item}>#content`)},${sel(`${item} ytd-rich-grid-media`)},${sel(`${item} yt-lockup-view-model`)}{` +
      `width:100%!important;max-width:100%!important;min-width:0!important}` +
      `${sel('ytd-rich-section-renderer')},${sel('ytd-continuation-item-renderer')}{` +
      `width:100%!important;flex:0 0 100%!important}`
    );
  }

  const pageStyle = document.createElement('style');
  pageStyle.id = 'ytcg-grid';
  pageStyle.textContent = buildGridCss();
  document.documentElement.append(pageStyle);

  function apply() {
    const root = document.documentElement;
    const on = enabled();
    if (on) root.style.setProperty('--ytcg-cols', String(columns()));
    else root.style.removeProperty('--ytcg-cols');
    for (const s of SECTIONS) {
      root.classList.toggle(s.cls, on && sectionOn(s.key));
    }
  }

  const PANEL_CSS = `
#ytcg-backdrop{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5)}
#ytcg-panel{width:340px;max-width:90vw;max-height:calc(100vh - 24px);overflow:auto;padding:6px 0 8px;border-radius:12px;background:var(--yt-spec-base-background,#fff);color:var(--yt-spec-text-primary,#0f0f0f);box-shadow:0 12px 32px rgba(0,0,0,.45);font-family:Roboto,Arial,sans-serif}
#ytcg-panel .ytcg-head{display:flex;align-items:center;gap:8px;padding:8px 12px 6px 20px}
#ytcg-panel h2{margin:0;flex:1;font-size:15px;font-weight:500}
#ytcg-panel .ytcg-close{flex:0 0 auto;width:36px;height:36px;min-height:36px;padding:0;justify-content:center;border-radius:50%;font-size:18px}
#ytcg-panel .ytcg-section{padding:10px 20px 4px;font-size:12px;font-weight:500;color:var(--yt-spec-text-secondary,#606060)}
#ytcg-panel button{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;padding:0 20px;border:0;background:none;color:inherit;font:inherit;font-size:14px;text-align:left;cursor:pointer}
#ytcg-panel button:hover{background:var(--yt-spec-badge-chip-background,rgba(0,0,0,.05))}
#ytcg-panel button:focus-visible{outline:2px solid var(--yt-spec-call-to-action,#065fd4);outline-offset:-2px}
#ytcg-panel .ytcg-value{margin-left:auto;font-size:13px;color:var(--yt-spec-text-secondary,#606060)}
#ytcg-panel .ytcg-reset{margin-top:6px;border-top:1px solid var(--yt-spec-10-percent-layer,rgba(0,0,0,.1));color:var(--yt-spec-text-secondary,#606060);font-size:13px}
`;

  function closePanel() {
    document.removeEventListener('keydown', onKey, true);
    document.getElementById('ytcg-backdrop')?.remove();
    document.getElementById('ytcg-style')?.remove();
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closePanel();
      return;
    }
    if (e.key !== 'Tab') return;
    const panel = document.getElementById('ytcg-panel');
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

  function valueRow(label, text, onClick, pressed) {
    const button = document.createElement('button');
    button.type = 'button';
    if (pressed !== undefined) button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    const name = document.createElement('span');
    name.textContent = label;
    const value = document.createElement('span');
    value.className = 'ytcg-value';
    value.textContent = text;
    button.append(name, value);
    button.addEventListener('click', onClick);
    return button;
  }

  function render() {
    const panel = document.getElementById('ytcg-panel');
    if (!panel) return;
    const scrollTop = panel.scrollTop;
    panel.textContent = '';

    const head = document.createElement('div');
    head.className = 'ytcg-head';
    const title = document.createElement('h2');
    title.textContent = 'YouTube: Custom Grid';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'ytcg-close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '\u00d7';
    close.addEventListener('click', closePanel);
    head.append(title, close);
    panel.append(head);

    panel.append(
      valueRow(
        'Enabled',
        enabled() ? 'On' : 'Off',
        () => {
          put('on', !enabled());
          apply();
          drawMenu();
          render();
        },
        enabled()
      )
    );

    const layoutHeading = document.createElement('div');
    layoutHeading.className = 'ytcg-section';
    layoutHeading.textContent = 'Layout';
    panel.append(layoutHeading);

    const cols = columns();
    panel.append(
      valueRow('Videos per row', String(cols), () => {
        const next = COLUMNS[(COLUMNS.indexOf(cols) + 1) % COLUMNS.length];
        put('columns', next);
        apply();
        drawMenu();
        render();
      })
    );

    const sectionHeading = document.createElement('div');
    sectionHeading.className = 'ytcg-section';
    sectionHeading.textContent = 'Sections';
    panel.append(sectionHeading);

    for (const s of SECTIONS) {
      const on = sectionOn(s.key);
      panel.append(
        valueRow(
          s.label,
          on ? 'On' : 'Off',
          () => {
            put(s.key, !on);
            apply();
            drawMenu();
            render();
          },
          on
        )
      );
    }

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'ytcg-reset';
    reset.textContent = 'Reset to defaults';
    reset.addEventListener('click', () => {
      if (typeof GM_deleteValue === 'function') {
        GM_deleteValue('ytcg.on');
        GM_deleteValue('ytcg.columns');
        for (const s of SECTIONS) GM_deleteValue(`ytcg.${s.key}`);
      } else {
        put('on', true);
        put('columns', DEFAULT_COLUMNS);
        for (const s of SECTIONS) put(s.key, true);
      }
      apply();
      drawMenu();
      render();
    });
    panel.append(reset);
    panel.scrollTop = scrollTop;
  }

  function openPanel() {
    if (document.getElementById('ytcg-backdrop')) return;
    const style = document.createElement('style');
    style.id = 'ytcg-style';
    style.textContent = PANEL_CSS;
    document.head.append(style);

    const backdrop = document.createElement('div');
    backdrop.id = 'ytcg-backdrop';
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) closePanel();
    });

    const panel = document.createElement('div');
    panel.id = 'ytcg-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'YouTube: Custom Grid');

    backdrop.append(panel);
    document.body.append(backdrop);
    document.addEventListener('keydown', onKey, true);
    render();
    panel.querySelector('button:not(.ytcg-close)')?.focus();
  }

  let menuId = null;
  function drawMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    if (menuId !== null && typeof GM_unregisterMenuCommand === 'function') GM_unregisterMenuCommand(menuId);
    const active = SECTIONS.filter((s) => sectionOn(s.key)).length;
    menuId = GM_registerMenuCommand(
      enabled() && active ? `Custom Grid (${columns()}/row)` : 'Custom Grid (off)',
      openPanel
    );
  }

  apply();
  drawMenu();
})();

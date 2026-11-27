// ==UserScript==
// @name         YouTube: Quiet Page
// @namespace    https://github.com/Afadfath03/Userscript
// @version      1.0
// @description  Stops video previews, end screens and ambient mode, and hides feed, watch page and sidebar sections on YouTube
// @author       Afadfath03
// @homepageURL  https://github.com/Afadfath03/Userscript
// @supportURL   https://github.com/Afadfath03/Userscript/issues
// @downloadURL  https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-quiet-page.user.js
// @updateURL    https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-quiet-page.user.js
// @icon         https://raw.githubusercontent.com/Afadfath03/Userscript/main/assets/icons/youtube-quiet-page.png
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
  // Embeds and live chat frames do not carry the page-level UI this script cleans up
  if (window.self !== window.top) return;

  const ROWS = [
    { key: 'previews', label: 'Stop thumbnail previews', group: 'Playback', def: true },
    { key: 'endScreen', label: 'Hide end screen', group: 'Playback', def: true, cls: 'ytqp-end' },
    { key: 'ambient', label: 'Disable ambient mode', group: 'Playback', def: true, cls: 'ytqp-ambient' },
    { key: 'shorts', label: 'Hide Shorts shelves', group: 'Sections', def: false, cls: 'ytqp-shorts' },
    { key: 'comments', label: 'Hide comments', group: 'Sections', def: false, cls: 'ytqp-comments' },
    { key: 'chat', label: 'Hide live chat', group: 'Sections', def: false, cls: 'ytqp-chat' },
    { key: 'promos', label: 'Hide promo banners', group: 'Sections', def: false, cls: 'ytqp-promos' },
    { key: 'merch', label: 'Hide merch shelf', group: 'Sections', def: false, cls: 'ytqp-merch' },
    { key: 'donation', label: 'Hide donation shelves', group: 'Sections', def: false, cls: 'ytqp-donation' },
    { key: 'chips', label: 'Hide filter chips', group: 'Sections', def: false, cls: 'ytqp-chips' },
    { key: 'posts', label: 'Hide community posts', group: 'Sections', def: false, cls: 'ytqp-posts' },
    { key: 'clarification', label: 'Hide info panels', group: 'Sections', def: false, cls: 'ytqp-clarification' },
    { key: 'playlist', label: 'Hide playlist panel', group: 'Sections', def: false, cls: 'ytqp-playlist' },
    { key: 'nudges', label: 'Hide feed nudges', group: 'Sections', def: false, cls: 'ytqp-nudges' },
    { key: 'channelVideo', label: 'Hide channel featured video', group: 'Sections', def: false, cls: 'ytqp-channel-video' },
    { key: 'suggested', label: 'Hide player suggestion bubble', group: 'Sections', def: false, cls: 'ytqp-suggested' },
    { key: 'infoPanels', label: 'Hide large info panels', group: 'Sections', def: false, cls: 'ytqp-info-panels' },
    { key: 'miniplayer', label: 'Hide miniplayer', group: 'Sections', def: false, cls: 'ytqp-miniplayer' },
    { key: 'shortsEntry', label: 'Hide Shorts entry', group: 'Sidebar', def: false, cls: 'ytqp-shorts-entry' },
    { key: 'sidebarYou', label: 'Hide You section', group: 'Sidebar', def: false, cls: 'ytqp-sidebar-you' },
    { key: 'sidebarSubscriptions', label: 'Hide Subscriptions section', group: 'Sidebar', def: false, cls: 'ytqp-sidebar-subs' },
    { key: 'sidebarExplore', label: 'Hide Explore section', group: 'Sidebar', def: false, cls: 'ytqp-sidebar-explore' },
    { key: 'sidebarMore', label: 'Hide More from YouTube', group: 'Sidebar', def: false, cls: 'ytqp-sidebar-more' },
    { key: 'sidebarFooter', label: 'Hide sidebar footer', group: 'Sidebar', def: false, cls: 'ytqp-sidebar-footer' },
  ];

  const DEFAULTS = new Map(ROWS.map((row) => [row.key, row.def]));
  const get = (key, fallback) => {
    const v = GM_getValue(`ytqp.${key}`, fallback);
    return v === undefined || v === null ? fallback : v;
  };
  const put = (key, value) => GM_setValue(`ytqp.${key}`, value);
  const enabled = () => get('on', true) === true;
  const flag = (key) => enabled() && get(key, DEFAULTS.get(key) === true) === true;

  const pageStyle = document.createElement('style');
  pageStyle.id = 'ytqp-quiet';
  pageStyle.textContent =
    'html.ytqp-end .ytp-ce-element,html.ytqp-end .ytp-videowall-still,html.ytqp-end .ytp-endscreen-content{display:none!important}' +
    'html.ytqp-ambient #cinematics{display:none!important}' +
    'html.ytqp-shorts ytd-reel-shelf-renderer,' +
    'html.ytqp-shorts ytd-rich-section-renderer:has(ytd-reel-shelf-renderer),' +
    'html.ytqp-shorts ytd-rich-section-renderer:has(a[href*="/shorts/"]){display:none!important}' +
    'html.ytqp-comments ytd-comments#comments{display:none!important}' +
    'html.ytqp-chat ytd-live-chat-frame#chat{display:none!important}' +
    'html.ytqp-promos ytd-mealbar-promo-renderer,' +
    'html.ytqp-promos ytd-statement-banner-renderer,' +
    'html.ytqp-promos ytd-banner-promo-renderer{display:none!important}' +
    'html.ytqp-merch #merch-shelf,html.ytqp-merch ytd-merch-shelf-renderer{display:none!important}' +
    'html.ytqp-shorts-entry ytd-guide-entry-renderer:has(a[href="/shorts/"]),' +
    'html.ytqp-shorts-entry ytd-mini-guide-entry-renderer:has(a[href="/shorts/"]){display:none!important}' +
    'html.ytqp-donation ytd-donation-shelf-renderer{display:none!important}' +
    'html.ytqp-chips ytd-feed-filter-chip-bar-renderer{display:none!important}' +
    'html.ytqp-posts ytd-post-renderer,' +
    'html.ytqp-posts ytd-rich-item-renderer:has(ytd-post-renderer){display:none!important}' +
    'html.ytqp-clarification ytd-clarification-renderer{display:none!important}' +
    'html.ytqp-playlist ytd-playlist-panel-renderer{display:none!important}' +
    'html.ytqp-nudges ytd-feed-nudge-renderer{display:none!important}' +
    'html.ytqp-channel-video ytd-channel-video-player-renderer{display:none!important}' +
    'html.ytqp-suggested .ytp-suggested-action{display:none!important}' +
    'html.ytqp-info-panels ytd-info-panel-container-renderer{display:none!important}' +
    'html.ytqp-miniplayer ytd-miniplayer{display:none!important}' +
    'html.ytqp-sidebar-you ytd-guide-collapsible-section-entry-renderer:has(a[href="/feed/you"],a[href="/feed/history"]),' +
    'html.ytqp-sidebar-you ytd-guide-section-renderer:not(:has(a[href="/"])):has(a[href="/feed/history"],a[href="/feed/playlists"]){display:none!important}' +
    'html.ytqp-sidebar-subs ytd-guide-collapsible-section-entry-renderer:has(a[href="/feed/subscriptions"]),' +
    'html.ytqp-sidebar-subs ytd-guide-section-renderer:not(:has(a[href="/"])):has(a[href="/feed/channels"],a[href="/feed/subscriptions"]){display:none!important}' +
    'html.ytqp-sidebar-explore ytd-guide-section-renderer:has(a[href^="/feed/storefront"],a[href="/gaming"],a[href="/feed/trending"],a[href="/feed/explore"],a[href="/channel/UC-9-kyTW8ZkZNDHQJ6FgpwQ"],a[href="/podcasts"],a[href="/feed/courses_destination"]){display:none!important}' +
    'html.ytqp-sidebar-more ytd-guide-section-renderer:has(a[href^="/premium"],a[href*="music.youtube.com"],a[href*="youtubekids.com"],a[href*="tv.youtube.com"],a[href="/new"]){display:none!important}' +
    'html.ytqp-sidebar-footer ytd-guide-renderer #footer{display:none!important}';
  document.documentElement.append(pageStyle);

  function apply() {
    const root = document.documentElement;
    for (const row of ROWS) {
      if (row.cls) root.classList.toggle(row.cls, flag(row.key));
    }
  }

  // Pausing on the event catches previews wherever they start; the player and
  // the Shorts page are not thumbnails, so they keep playing
  const paused = new WeakMap();

  document.addEventListener(
    'playing',
    (event) => {
      if (!flag('previews')) return;
      const video = event.target;
      if (!(video instanceof HTMLVideoElement)) return;
      if (!video.closest('ytd-thumbnail, yt-thumbnail-view-model, ytd-playlist-thumbnail')) return;
      const attempts = paused.get(video) || 0;
      if (attempts >= 3) return;
      paused.set(video, attempts + 1);
      video.pause();
    },
    true
  );

  const PANEL_CSS = `
#ytqp-backdrop{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5)}
#ytqp-panel{width:340px;max-width:90vw;max-height:calc(100vh - 24px);overflow:auto;padding:6px 0 8px;border-radius:12px;background:var(--yt-spec-base-background,#fff);color:var(--yt-spec-text-primary,#0f0f0f);box-shadow:0 12px 32px rgba(0,0,0,.45);font-family:Roboto,Arial,sans-serif}
#ytqp-panel .ytqp-head{display:flex;align-items:center;gap:8px;padding:8px 12px 6px 20px}
#ytqp-panel h2{margin:0;flex:1;font-size:15px;font-weight:500}
#ytqp-panel .ytqp-close{flex:0 0 auto;width:36px;height:36px;min-height:36px;padding:0;justify-content:center;border-radius:50%;font-size:18px}
#ytqp-panel .ytqp-section{padding:10px 20px 4px;font-size:12px;font-weight:500;color:var(--yt-spec-text-secondary,#606060)}
#ytqp-panel button{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;padding:0 20px;border:0;background:none;color:inherit;font:inherit;font-size:14px;text-align:left;cursor:pointer}
#ytqp-panel button:hover{background:var(--yt-spec-badge-chip-background,rgba(0,0,0,.05))}
#ytqp-panel button:focus-visible{outline:2px solid var(--yt-spec-call-to-action,#065fd4);outline-offset:-2px}
#ytqp-panel .ytqp-value{margin-left:auto;font-size:13px;color:var(--yt-spec-text-secondary,#606060)}
#ytqp-panel .ytqp-reset{margin-top:6px;border-top:1px solid var(--yt-spec-10-percent-layer,rgba(0,0,0,.1));color:var(--yt-spec-text-secondary,#606060);font-size:13px}
`;

  function closePanel() {
    document.removeEventListener('keydown', onKey, true);
    document.getElementById('ytqp-backdrop')?.remove();
    document.getElementById('ytqp-style')?.remove();
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closePanel();
      return;
    }
    if (e.key !== 'Tab') return;
    const panel = document.getElementById('ytqp-panel');
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

  function toggleRow(label, on, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
    const name = document.createElement('span');
    name.textContent = label;
    const value = document.createElement('span');
    value.className = 'ytqp-value';
    value.textContent = on ? 'On' : 'Off';
    button.append(name, value);
    button.addEventListener('click', onClick);
    return button;
  }

  function render() {
    const panel = document.getElementById('ytqp-panel');
    if (!panel) return;
    const scrollTop = panel.scrollTop;
    panel.textContent = '';

    const head = document.createElement('div');
    head.className = 'ytqp-head';
    const title = document.createElement('h2');
    title.textContent = 'YouTube: Quiet Page';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'ytqp-close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '\u00d7';
    close.addEventListener('click', closePanel);
    head.append(title, close);
    panel.append(head);

    panel.append(
      toggleRow('Enabled', enabled(), () => {
        put('on', !enabled());
        apply();
        drawMenu();
        render();
      })
    );

    let lastGroup = '';
    for (const row of ROWS) {
      if (row.group !== lastGroup) {
        lastGroup = row.group;
        const heading = document.createElement('div');
        heading.className = 'ytqp-section';
        heading.textContent = row.group;
        panel.append(heading);
      }
      const on = get(row.key, row.def) === true;
      panel.append(
        toggleRow(row.label, on, () => {
          put(row.key, !on);
          apply();
          drawMenu();
          render();
        })
      );
    }

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'ytqp-reset';
    reset.textContent = 'Reset to defaults';
    reset.addEventListener('click', () => {
      if (typeof GM_deleteValue === 'function') {
        GM_deleteValue('ytqp.on');
        for (const row of ROWS) GM_deleteValue(`ytqp.${row.key}`);
      } else {
        put('on', true);
        for (const row of ROWS) put(row.key, row.def);
      }
      apply();
      drawMenu();
      render();
    });
    panel.append(reset);
    panel.scrollTop = scrollTop;
  }

  function openPanel() {
    if (document.getElementById('ytqp-backdrop')) return;
    const style = document.createElement('style');
    style.id = 'ytqp-style';
    style.textContent = PANEL_CSS;
    document.head.append(style);

    const backdrop = document.createElement('div');
    backdrop.id = 'ytqp-backdrop';
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) closePanel();
    });

    const panel = document.createElement('div');
    panel.id = 'ytqp-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'YouTube: Quiet Page');

    backdrop.append(panel);
    document.body.append(backdrop);
    document.addEventListener('keydown', onKey, true);
    render();
    panel.querySelector('button:not(.ytqp-close)')?.focus();
  }

  let menuId = null;
  function drawMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    if (menuId !== null && typeof GM_unregisterMenuCommand === 'function') GM_unregisterMenuCommand(menuId);
    const active = ROWS.filter((row) => flag(row.key)).length;
    menuId = GM_registerMenuCommand(
      enabled() ? `Quiet Page (${active} on)` : 'Quiet Page (off)',
      openPanel
    );
  }

  apply();
  drawMenu();
})();

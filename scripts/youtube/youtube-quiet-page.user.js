// ==UserScript==
// @name         YouTube: Quiet Page
// @namespace    https://github.com/Afadfath03/Userscript
// @version      2.0
// @description  Stops previews and paused prompts, hides Members-only/Premium cards, People Mentioned, and page/sidebar clutter on YouTube
// @author       Afadfath03
// @homepageURL  https://github.com/Afadfath03/Userscript
// @supportURL   https://github.com/Afadfath03/Userscript/issues
// @downloadURL  https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube/youtube-quiet-page.user.js
// @updateURL    https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube/youtube-quiet-page.user.js
// @icon         https://raw.githubusercontent.com/Afadfath03/Userscript/main/assets/icons/youtube/youtube-quiet-page.png
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

  const PROMPTS = [['yes', 'Yes'], ['no', 'No'], ['leave', 'Leave as-is']];
  const SUBSECTIONS = [
    {
      id: 'playback',
      title: 'Playback',
      desc: 'Stops thumbnail previews, end-screen overlays, ambient glow, and "Continue watching?" prompts.',
      rows: [
        { key: 'previews', label: 'Stop thumbnail previews', type: 'toggle', def: true },
        { key: 'endScreen', label: 'Hide end screen', type: 'toggle', def: true, cls: 'ytqp-end' },
        { key: 'ambient', label: 'Disable ambient mode', type: 'toggle', def: true, cls: 'ytqp-ambient' },
        { key: 'answer', label: 'Dismiss paused prompt', type: 'choice', def: 'yes', options: PROMPTS },
      ],
    },
    {
      id: 'feed',
      title: 'Feed & Cards',
      desc: 'Hides Members-only/Premium cards, People Mentioned, Shorts shelves, and feed clutter.',
      rows: [
        { key: 'membersOnly', label: 'Hide Members-only & Premium', type: 'toggle', def: true },
        { key: 'peopleMentioned', label: 'Hide People Mentioned', type: 'toggle', def: true },
        { key: 'shorts', label: 'Hide Shorts shelves', type: 'toggle', def: false, cls: 'ytqp-shorts' },
        { key: 'chips', label: 'Hide filter chips', type: 'toggle', def: false, cls: 'ytqp-chips' },
        { key: 'posts', label: 'Hide community posts', type: 'toggle', def: false, cls: 'ytqp-posts' },
        { key: 'nudges', label: 'Hide feed nudges', type: 'toggle', def: false, cls: 'ytqp-nudges' },
        { key: 'promos', label: 'Hide promo banners', type: 'toggle', def: false, cls: 'ytqp-promos' },
      ],
    },
    {
      id: 'watch',
      title: 'Watch & Channel',
      desc: 'Hides optional panels on watch and channel pages.',
      rows: [
        { key: 'comments', label: 'Hide comments', type: 'toggle', def: false, cls: 'ytqp-comments' },
        { key: 'chat', label: 'Hide live chat', type: 'toggle', def: false, cls: 'ytqp-chat' },
        { key: 'merch', label: 'Hide merch shelf', type: 'toggle', def: false, cls: 'ytqp-merch' },
        { key: 'donation', label: 'Hide donation shelves', type: 'toggle', def: false, cls: 'ytqp-donation' },
        { key: 'clarification', label: 'Hide info panels', type: 'toggle', def: false, cls: 'ytqp-clarification' },
        { key: 'infoPanels', label: 'Hide large info panels', type: 'toggle', def: false, cls: 'ytqp-info-panels' },
        { key: 'playlist', label: 'Hide playlist panel', type: 'toggle', def: false, cls: 'ytqp-playlist' },
        { key: 'channelVideo', label: 'Hide channel featured video', type: 'toggle', def: false, cls: 'ytqp-channel-video' },
        { key: 'suggested', label: 'Hide player suggestion bubble', type: 'toggle', def: false, cls: 'ytqp-suggested' },
        { key: 'miniplayer', label: 'Hide miniplayer', type: 'toggle', def: false, cls: 'ytqp-miniplayer' },
      ],
    },
    {
      id: 'sidebar',
      title: 'Sidebar',
      desc: 'Hides individual sections in the left navigation drawer.',
      rows: [
        { key: 'shortsEntry', label: 'Hide Shorts entry', type: 'toggle', def: false, cls: 'ytqp-shorts-entry' },
        { key: 'sidebarYou', label: 'Hide You section', type: 'toggle', def: false, cls: 'ytqp-sidebar-you' },
        { key: 'sidebarSubscriptions', label: 'Hide Subscriptions section', type: 'toggle', def: false, cls: 'ytqp-sidebar-subs' },
        { key: 'sidebarExplore', label: 'Hide Explore section', type: 'toggle', def: false, cls: 'ytqp-sidebar-explore' },
        { key: 'sidebarMore', label: 'Hide More from YouTube', type: 'toggle', def: false, cls: 'ytqp-sidebar-more' },
        { key: 'sidebarFooter', label: 'Hide sidebar footer', type: 'toggle', def: false, cls: 'ytqp-sidebar-footer' },
      ],
    },
  ];

  const ALL_ROWS = SUBSECTIONS.flatMap((s) => s.rows);
  const DEFAULTS = new Map(ALL_ROWS.map((row) => [row.key, row.def]));
  const get = (key, fallback) => {
    const v = GM_getValue(`ytqp.${key}`, fallback);
    return v === undefined || v === null ? fallback : v;
  };
  const put = (key, value) => GM_setValue(`ytqp.${key}`, value);
  const enabled = () => get('on', true) === true;
  const flag = (key) => enabled() && get(key, DEFAULTS.get(key) === true) === true;
  const promptMode = () => {
    const v = get('answer', 'yes');
    return PROMPTS.some(([val]) => val === v) ? v : 'yes';
  };
  const isRowActive = (r) =>
    r.type === 'choice' ? promptMode() !== 'leave' : get(r.key, r.def) === true;
  const subSummary = (sub) => `${sub.rows.filter(isRowActive).length} of ${sub.rows.length} on`;
  const squash = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();

  // ---------- CSS rules ----------

  const MEMBER_MARK = 'data-ytqp-member-off';
  const PEOPLE_MARK = 'data-ytqp-people-off';
  const pageStyle = document.createElement('style');
  pageStyle.id = 'ytqp-quiet';
  pageStyle.textContent =
    `[${MEMBER_MARK}],[${PEOPLE_MARK}]{display:none!important}` +
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

  // ---------- thumbnail previews ----------

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

  // ---------- members-only & premium ----------

  const MEMBER_LABELS = new Set(['members only', 'premium', 'khusus anggota', 'youtube featured']);
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
  const hiddenCards = new Map();

  function videoIdOf(card) {
    const link = card.querySelector('a[href*="/watch?v="], a[href*="/shorts/"]');
    if (!link) return '';
    const url = link.getAttribute('href') || '';
    if (url.includes('/shorts/')) return url.split('/shorts/')[1].split(/[?&/]/)[0];
    const match = url.match(/[?&]v=([^&]+)/);
    return match ? match[1] : '';
  }

  function unhideCard(card) {
    card.removeAttribute(MEMBER_MARK);
    hiddenCards.delete(card);
  }

  function clearMemberCards() {
    for (const card of [...hiddenCards.keys()]) unhideCard(card);
  }

  function judgeCard(card) {
    if (!flag('membersOnly')) {
      unhideCard(card);
      return;
    }
    const shouldHide = [...card.querySelectorAll(BADGE)].some((b) => MEMBER_LABELS.has(squash(b.textContent)));
    const id = videoIdOf(card);
    if (shouldHide) {
      card.setAttribute(MEMBER_MARK, id);
      hiddenCards.set(card, id);
    } else {
      unhideCard(card);
    }
  }

  function resyncCards() {
    for (const [card, id] of [...hiddenCards]) {
      if (!card.isConnected) {
        hiddenCards.delete(card);
        continue;
      }
      if (videoIdOf(card) !== id) judgeCard(card);
    }
  }

  function scanMembers(root) {
    if (!flag('membersOnly') || !root || !root.isConnected) return;
    const cards = new Set();
    for (const badge of root.querySelectorAll(BADGE)) {
      const card = badge.closest(CARD);
      if (card) cards.add(card);
    }
    if (root.matches && root.matches(BADGE)) {
      const card = root.closest(CARD);
      if (card) cards.add(card);
    }
    for (const card of cards) judgeCard(card);
  }

  // ---------- people mentioned ----------

  const PEOPLE_PHRASES = [
    'these people are mentioned in the video',
    'orang-orang ini disebutkan dalam video',
  ].map(squash);
  const STOP_TAGS = new Set(['BODY', 'YTD-APP', 'YTD-WATCH-FLEXY', 'YTD-WATCH-GRID']);
  const STOP_IDS = new Set(['below', 'primary', 'columns']);
  const hiddenPeople = new Set();

  function clearPeople() {
    for (const node of [...hiddenPeople]) node.removeAttribute(PEOPLE_MARK);
    hiddenPeople.clear();
  }

  function hidePeopleFrom(start) {
    const own = squash(start.textContent).length;
    let node = start;
    while (node.parentElement) {
      const p = node.parentElement;
      if (STOP_TAGS.has(p.tagName) || STOP_IDS.has(p.id)) break;
      if (squash(p.textContent).length > own + 400) break;
      node = p;
    }
    node.setAttribute(PEOPLE_MARK, '');
    hiddenPeople.add(node);
  }

  function locatePeople(root) {
    let all;
    try { all = squash(root.textContent || ''); } catch { return null; }
    if (!PEOPLE_PHRASES.some((p) => all.includes(p))) return null;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      if (PEOPLE_PHRASES.some((p) => squash(n.nodeValue || '').includes(p))) return n.parentElement;
    }
    return null;
  }

  function scanPeople(root) {
    if (!flag('peopleMentioned') || location.pathname !== '/watch' || !root || !root.isConnected) return;
    const target = locatePeople(root);
    if (target) hidePeopleFrom(target);
  }

  // ---------- dismiss paused prompt ----------

  const PROMPT_PHRASES = [
    'video paused. continue watching?',
    'video dijeda. lanjutkan menonton?',
    'are you still watching?',
    'apakah anda masih menonton?',
  ];
  const YES_LABELS = new Set(['yes', 'ya', 'continue watching', 'lanjutkan menonton', 'resume']);
  const NO_LABELS = new Set(['no', 'tidak', 'not now', 'bukan sekarang']);
  const DIALOG = 'yt-confirm-dialog-renderer, yt-confirm-dialog-view-model, tp-yt-paper-dialog';
  const DIALOG_BTN = 'yt-button-renderer, button, tp-yt-paper-button';

  function answerDialog(dialog) {
    if (!enabled()) return;
    const choice = promptMode();
    if (choice === 'leave') return;
    const text = squash(dialog.textContent || '');
    if (!PROMPT_PHRASES.some((p) => text.includes(p))) return;
    const wanted = choice === 'yes' ? YES_LABELS : NO_LABELS;
    for (const btn of dialog.querySelectorAll(DIALOG_BTN)) {
      if (!wanted.has(squash(btn.textContent))) continue;
      btn.click();
      return;
    }
  }

  function scanPrompts(root = document) {
    if (!enabled() || promptMode() === 'leave' || location.pathname !== '/watch') return;
    if (root.matches && root.matches(DIALOG)) answerDialog(root);
    if (typeof root.querySelectorAll === 'function') {
      for (const dialog of root.querySelectorAll(DIALOG)) answerDialog(dialog);
    }
  }

  // ---------- shared observer ----------

  const queue = new Set();
  let raf = 0;

  function flush() {
    raf = 0;
    const batch = [...queue];
    queue.clear();
    if (flag('membersOnly')) resyncCards();
    for (const node of batch) {
      if (!node.isConnected) continue;
      if (flag('membersOnly')) scanMembers(node);
      if (flag('peopleMentioned')) scanPeople(node);
      if (enabled() && promptMode() !== 'leave') scanPrompts(node);
    }
  }

  new MutationObserver((list) => {
    for (const m of list) {
      for (const n of m.addedNodes) if (n.nodeType === 1) queue.add(n);
    }
    if (queue.size && !raf) raf = requestAnimationFrame(flush);
  }).observe(document.documentElement, { childList: true, subtree: true });

  function apply() {
    const root = document.documentElement;
    for (const row of ALL_ROWS) {
      if (row.cls) root.classList.toggle(row.cls, flag(row.key));
    }
    if (flag('membersOnly')) {
      resyncCards();
      if (document.body) scanMembers(document.body);
    } else {
      clearMemberCards();
    }
    if (flag('peopleMentioned')) {
      if (document.body) scanPeople(document.body);
    } else {
      clearPeople();
    }
    if (document.body) scanPrompts(document.body);
  }

  // ---------- panel ----------

  const PANEL_CSS = `
#ytqp-backdrop{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5)}
#ytqp-panel,#ytqp-panel *{box-sizing:border-box}
#ytqp-panel{width:clamp(320px,88vw,420px);height:min(76dvh,560px);display:flex;flex-direction:column;overflow:hidden;border-radius:14px;background:var(--yt-spec-base-background,#fff);color:var(--yt-spec-text-primary,#0f0f0f);box-shadow:0 16px 40px rgba(0,0,0,.45);font-family:Roboto,Arial,sans-serif}
#ytqp-panel .ytp-head{flex:0 0 auto;display:grid;grid-template-columns:36px 1fr 36px;align-items:center;gap:6px;padding:10px 12px 8px;border-bottom:1px solid var(--yt-spec-10-percent-layer,rgba(128,128,128,.2))}
#ytqp-panel .ytp-title-wrap{min-width:0;text-align:center}
#ytqp-panel .ytp-crumb{display:block;font-size:11px;line-height:1.25;color:var(--yt-spec-text-secondary,#606060);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#ytqp-panel h2{margin:0;font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#ytqp-panel .ytp-spacer{width:36px;height:36px}
#ytqp-panel .ytp-icon{width:36px;height:36px;min-height:36px;padding:0;justify-content:center;border-radius:50%;font-size:18px}
#ytqp-panel .ytp-body{flex:1 1 auto;overflow-y:auto;padding:8px 0 12px}
#ytqp-panel .ytp-desc{margin:4px 16px 8px;font-size:12.5px;line-height:1.45;color:var(--yt-spec-text-secondary,#606060)}
#ytqp-panel .ytp-section{padding:10px 16px 4px;font-size:12px;font-weight:600;color:var(--yt-spec-text-secondary,#606060);text-transform:uppercase;letter-spacing:.03em}
#ytqp-panel hr{margin:6px 0;border:0;border-top:1px solid var(--yt-spec-10-percent-layer,rgba(128,128,128,.2))}
#ytqp-panel button{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;padding:0 16px;border:0;background:none;color:inherit;font:inherit;font-size:14px;text-align:left;cursor:pointer}
#ytqp-panel button:hover:not(:disabled){background:var(--yt-spec-badge-chip-background,rgba(128,128,128,.1))}
#ytqp-panel button:focus-visible{outline:2px solid var(--yt-spec-call-to-action,#065fd4);outline-offset:-2px}
#ytqp-panel .ytp-group.is-disabled{opacity:.42;pointer-events:none;user-select:none}
#ytqp-panel .ytp-val{margin-left:auto;font-size:13px;color:var(--yt-spec-text-secondary,#606060)}
#ytqp-panel .ytp-chev{font-size:16px;opacity:.6}
#ytqp-panel .ytp-check{margin-left:auto;font-weight:700;color:var(--yt-spec-call-to-action,#3ea6ff)}
#ytqp-panel .ytp-reset{color:var(--yt-spec-text-secondary,#606060);font-size:13px}
#ytqp-panel .ytp-reset.is-armed{color:#e05a52;font-weight:500}
`;

  const state = { view: 'home', sub: null, rowKey: null, resetArmed: false };

  function closePanel() {
    state.resetArmed = false;
    document.removeEventListener('keydown', onKey, true);
    document.getElementById('ytqp-backdrop')?.remove();
    document.getElementById('ytqp-style')?.remove();
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
    const panel = document.getElementById('ytqp-panel');
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
    const panel = document.getElementById('ytqp-panel');
    if (!panel) return;
    const prevBody = panel.querySelector('.ytp-body');
    const scrollTop = prevBody ? prevBody.scrollTop : 0;
    panel.textContent = '';

    const body = document.createElement('div');
    body.className = 'ytp-body';

    if (state.view === 'home') {
      panel.append(header('YouTube: Quiet Page'), body);
      const desc = document.createElement('p');
      desc.className = 'ytp-desc';
      desc.textContent = 'Hide previews, paused prompts, Members-only cards, People Mentioned, page clutter, and sidebar sections.';
      body.append(desc, document.createElement('hr'));
      const on = enabled();
      body.append(rowBtn('Enabled', on ? 'On' : 'Off', () => {
        put('on', !on);
        apply();
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
        group.append(rowBtn(s.title, subSummary(s), () => {
          state.view = 'sub';
          state.sub = s.id;
          render();
        }, { chevron: true, disabled: !on }));
      }
      body.append(group, document.createElement('hr'));

      const reset = rowBtn(
        state.resetArmed ? 'Click again to reset Quiet Page' : 'Reset Quiet Page',
        undefined,
        () => {
          if (!state.resetArmed) {
            state.resetArmed = true;
            render();
            return;
          }
          state.resetArmed = false;
          if (typeof GM_deleteValue === 'function') {
            GM_deleteValue('ytqp.on');
            for (const r of ALL_ROWS) GM_deleteValue(`ytqp.${r.key}`);
          } else {
            put('on', true);
            for (const r of ALL_ROWS) put(r.key, r.def);
          }
          apply();
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
      panel.append(header(sub.title, () => { state.view = 'home'; render(); }, 'Quiet Page'), body);
      const desc = document.createElement('p');
      desc.className = 'ytp-desc';
      desc.textContent = sub.desc;
      body.append(desc, document.createElement('hr'));
      for (const r of sub.rows) {
        if (r.type === 'choice') {
          const cur = promptMode();
          const hit = r.options.find(([v]) => v === cur);
          body.append(rowBtn(r.label, hit ? hit[1] : String(cur), () => {
            state.view = 'options';
            state.rowKey = r.key;
            render();
          }, { chevron: true }));
        } else {
          const on = get(r.key, r.def) === true;
          body.append(rowBtn(r.label, on ? 'On' : 'Off', () => {
            put(r.key, !on);
            apply();
            drawMenu();
            render();
          }, { pressed: on }));
        }
      }
      body.scrollTop = scrollTop;
      return;
    }

    const row = sub.rows.find((r) => r.key === state.rowKey);
    if (!row) { state.view = 'sub'; render(); return; }
    panel.append(header(row.label, () => { state.view = 'sub'; render(); }, `Quiet Page \u203a ${sub.title}`), body);
    const cur = promptMode();
    for (const [val, label] of row.options) {
      body.append(rowBtn(label, undefined, () => {
        put(row.key, val);
        apply();
        drawMenu();
        state.view = 'sub';
        render();
      }, { checked: val === cur }));
    }
  }

  function openPanel() {
    if (document.getElementById('ytqp-backdrop')) return;
    state.view = 'home';
    state.sub = null;
    state.rowKey = null;
    state.resetArmed = false;
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
    panel.querySelector('.ytp-body button:not(:disabled)')?.focus();
  }

  let menuId = null;
  function drawMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    if (menuId !== null && typeof GM_unregisterMenuCommand === 'function') GM_unregisterMenuCommand(menuId);
    const active = ALL_ROWS.filter(isRowActive).length;
    menuId = GM_registerMenuCommand(
      enabled() ? `Quiet Page (${active} on)` : 'Quiet Page (off)',
      openPanel
    );
  }

  apply();
  drawMenu();
})();

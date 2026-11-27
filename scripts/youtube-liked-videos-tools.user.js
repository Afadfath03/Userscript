// ==UserScript==
// @name         YouTube: Liked Videos Tools
// @namespace    https://github.com/Afadfath03/Userscript
// @version      1.0
// @description  Bulk unlike, search and filter, total duration calculator, export with optional title lookup, and copy to playlist on YouTube Liked Videos (/playlist?list=LL)
// @author       Afadfath03
// @homepageURL  https://github.com/Afadfath03/Userscript
// @supportURL   https://github.com/Afadfath03/Userscript/issues
// @downloadURL  https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-liked-videos-tools.user.js
// @updateURL    https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-liked-videos-tools.user.js
// @icon         https://raw.githubusercontent.com/Afadfath03/Userscript/main/assets/icons/youtube-liked-videos-tools.png
// @license      MIT
// @match        https://www.youtube.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      findyoutubevideo.thetechrobo.ca
// ==/UserScript==

(() => {
  if (window.self !== window.top) return;

  const STYLE_ID = 'ytlt-style';
  const BTN_ID = 'ytlt-open-btn';
  const DURATION_ID = 'ytlt-duration-badge';
  const FILTER_ID = 'ytlt-filter-bar';
  const EMPTY_ID = 'ytlt-empty-state';
  const BACKDROP_ID = 'ytlt-backdrop';
  const DIALOG_ID = 'ytlt-dialog';
  const TOAST_ID = 'ytlt-toast';
  const HIDDEN_ATTR = 'data-ytlt-hidden';

  const UNLIKE_DELAY_MS = 350;
  const COPY_DELAY_MS = 400;
  const RESOLVE_CONCURRENCY = 3;
  const RESOLVE_TIMEOUT_MS = 8000;
  const SCROLL_STALL_ROUNDS = 4;
  const SCROLL_WAIT_MS = 650;

  const DEFAULTS = {
    watchedThreshold: 80,
    exportFormat: 'md',
    resolveTitles: false,
    showDuration: true,
    showFilterBar: true,
  };

  const get = (key) => {
    const v = GM_getValue(`ytlt.${key}`, DEFAULTS[key]);
    return v === undefined || v === null ? DEFAULTS[key] : v;
  };
  const put = (key, value) => GM_setValue(`ytlt.${key}`, value);

  const onLikedPage = () =>
    location.pathname === '/playlist' && new URLSearchParams(location.search).get('list') === 'LL';

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const cleanText = (s) => (s || '').replace(/\s+/g, ' ').trim();

  const resolvedTitleCache = new Map();
  let activeTask = null;
  let lastTrigger = null;
  let filterState = { query: '', chip: 'all' };
  let pageObserver = null;
  let mountTimer = 0;

  // ---------- Icons (inline SVG) ----------

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const ICON_HEART = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
  const ICON_CLOCK = 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z';
  const ICON_SEARCH = 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z';
  const ICON_CLOSE = 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z';
  const ICON_WARN = 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z';

  function makeSvgIcon(pathD, size = 16) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', pathD);
    svg.append(path);
    return svg;
  }

  // ---------- DOM Helpers ----------

  function isElementHidden(el) {
    for (let cur = el; cur && cur.nodeType === 1; cur = cur.parentElement) {
      if (cur.hasAttribute('hidden')) return true;
      if (getComputedStyle(cur).display === 'none') return true;
    }
    return false;
  }

  function activeLikedRoot() {
    for (const page of document.querySelectorAll('ytd-browse[page-subtype="playlist"]')) {
      if (!isElementHidden(page)) return page;
    }
    return document;
  }

  function isHiddenByMembers(row) {
    return row.hasAttribute('data-ytc-off') || row.hasAttribute('data-ytmp-hidden');
  }

  function parseDurationSeconds(text) {
    const clean = cleanText(text);
    if (!clean || /live|shorts|upcoming|premiere/i.test(clean)) return null;
    const m = clean.match(/(\d+(?::\d{1,2}){1,2})/);
    if (!m) return null;
    const parts = m[1].split(':').map((p) => Number.parseInt(p, 10));
    if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
  }

  function formatDuration(totalSec) {
    const sec = Math.max(0, Math.round(totalSec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  function extractVideoInfoFromRow(row) {
    const links = row.querySelectorAll('a[href*="/watch?v="], a[href*="/shorts/"]');
    for (const link of links) {
      const href = link.getAttribute('href') || '';
      const shortMatch = href.match(/\/shorts\/([A-Za-z0-9_-]{11})/);
      if (shortMatch) return { videoId: shortMatch[1], isShort: true };
      const watchMatch = href.match(/[?&]v=([A-Za-z0-9_-]{11})/);
      if (watchMatch) return { videoId: watchMatch[1], isShort: false };
    }
    return { videoId: '', isShort: row.tagName.toLowerCase() === 'ytm-shorts-lockup-view-model' };
  }

  function classifyStatus(rawTitle) {
    const lower = cleanText(rawTitle).toLowerCase();
    if (!lower) return 'unavailable';
    if (lower === '[deleted video]' || lower === '[video yang dihapus]' || lower === 'deleted video') return 'deleted';
    if (lower === '[private video]' || lower === '[video pribadi]' || lower === 'private video') return 'private';
    if (lower === '[unavailable video]' || lower === '[video tidak tersedia]') return 'unavailable';
    return 'available';
  }

  function readRow(row) {
    const { videoId, isShort } = extractVideoInfoFromRow(row);
    const titleEl =
      row.querySelector('a#video-title') ||
      row.querySelector('a.yt-lockup-metadata-view-model__title') ||
      row.querySelector('a.yt-lockup-metadata-view-model-wiz__title') ||
      row.querySelector('h3 a') ||
      row.querySelector('#video-title') ||
      row.querySelector('h3');
    const rawTitle = cleanText(titleEl?.textContent || titleEl?.getAttribute?.('title') || titleEl?.getAttribute?.('aria-label') || '');
    const status = classifyStatus(rawTitle);

    const channelEl =
      row.querySelector('ytd-channel-name a') ||
      row.querySelector('ytd-channel-name') ||
      row.querySelector('yt-content-metadata-view-model a') ||
      row.querySelector('.yt-content-metadata-view-model__metadata-row a') ||
      row.querySelector('.yt-content-metadata-view-model-wiz__metadata-row span') ||
      row.querySelector('#channel-name');
    const channel = cleanText(channelEl?.textContent || '');

    let durationSec = null;
    const badgeEls = row.querySelectorAll(
      'ytd-thumbnail-overlay-time-status-renderer, badge-shape .badge-shape-wiz__text, yt-thumbnail-badge-view-model .badge-shape-wiz__text, .yt-badge-shape__text, badge-shape'
    );
    for (const el of badgeEls) {
      const parsed = parseDurationSeconds(el.textContent);
      if (parsed !== null) {
        durationSec = parsed;
        break;
      }
    }

    const progressEl =
      row.querySelector('ytd-thumbnail-overlay-resume-playback-renderer #progress') ||
      row.querySelector('yt-thumbnail-overlay-progress-bar-view-model .ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment') ||
      row.querySelector('#progress');
    let watchedPct = 0;
    if (progressEl) {
      const m = (progressEl.style?.width || progressEl.getAttribute('style') || '').match(/([\d.]+)%/);
      if (m) watchedPct = Math.min(100, Math.max(0, Number.parseFloat(m[1])));
    }

    return {
      row,
      videoId,
      isShort,
      status,
      title: status === 'available' ? rawTitle : '',
      rawTitle,
      channel: status === 'available' ? channel : '',
      durationSec,
      watchedPct,
    };
  }

  function getRows() {
    const root = activeLikedRoot();
    const candidates = root.querySelectorAll(
      'ytd-playlist-video-renderer, ytd-video-renderer, ytd-rich-item-renderer, yt-lockup-view-model, ytm-shorts-lockup-view-model'
    );
    const out = [];
    for (const el of candidates) {
      if (el.parentElement?.closest('ytd-playlist-video-renderer, ytd-video-renderer, ytd-rich-item-renderer')) continue;
      if (el.closest('ytd-playlist-header-renderer, yt-page-header-renderer, yt-page-header-view-model')) continue;
      const tag = el.tagName.toLowerCase();
      if (tag === 'ytd-rich-item-renderer' || tag === 'yt-lockup-view-model') {
        if (!el.querySelector('a[href*="/watch?v="], a[href*="/shorts/"]')) continue;
      }
      out.push(el);
    }
    return out;
  }

  const getAllItems = () => getRows().map(readRow);

  function getTotalLikedCount() {
    const candidates = activeLikedRoot().querySelectorAll(
      'ytd-playlist-header-renderer .metadata-stats, yt-page-header-view-model yt-content-metadata-view-model, yt-page-header-renderer yt-content-metadata-view-model, #stats yt-formatted-string, .yt-page-header-view-model__page-header-headline-info, .page-header-view-model-wiz__page-header-headline-info'
    );
    for (const el of candidates) {
      if (isElementHidden(el)) continue;
      const text = cleanText(el.textContent);
      const m = text.match(/([\d,.\s]+)\s+video/i);
      if (m) {
        const n = Number(m[1].replace(/[,.\s]/g, ''));
        if (Number.isFinite(n) && n > 0) return n;
      }
    }
    return null;
  }

  // ---------- InnerTube API (Unlike & Copy to Playlist) ----------

  function getYtCfg() {
    const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const cfg = win?.ytcfg;
    if (!cfg) return {};
    const read = (k) => (typeof cfg.get === 'function' ? cfg.get(k) : cfg.data_?.[k]);
    return {
      apiKey: read('INNERTUBE_API_KEY') || '',
      context: read('INNERTUBE_CONTEXT') || null,
      clientName: read('INNERTUBE_CLIENT_NAME') || '1',
      clientVersion: read('INNERTUBE_CLIENT_VERSION') || '',
      sessionIndex: read('SESSION_INDEX'),
      pageId: read('DELEGATED_SESSION_ID') || '',
    };
  }

  function readSapisidCookie() {
    const cookies = document.cookie || '';
    for (const name of ['SAPISID', '__Secure-3PAPISID', '__Secure-1PAPISID']) {
      const m = cookies.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
      if (m) return decodeURIComponent(m[1]);
    }
    return '';
  }

  async function sha1Hex(text) {
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-1', data);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function buildAuthHeaders(cfg) {
    const sapisid = readSapisidCookie();
    if (!sapisid) return null;
    const ts = Math.floor(Date.now() / 1000);
    const origin = location.origin || 'https://www.youtube.com';
    const hash = await sha1Hex(`${ts} ${sapisid} ${origin}`);
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `SAPISIDHASH ${ts}_${hash}`,
      'X-Origin': origin,
    };
    if (cfg.clientName) headers['X-Youtube-Client-Name'] = String(cfg.clientName);
    if (cfg.clientVersion) headers['X-Youtube-Client-Version'] = String(cfg.clientVersion);
    if (cfg.sessionIndex !== undefined && cfg.sessionIndex !== null && cfg.sessionIndex !== '') {
      headers['X-Goog-AuthUser'] = String(cfg.sessionIndex);
    }
    if (cfg.pageId) headers['X-Goog-PageId'] = String(cfg.pageId);
    return headers;
  }

  async function postInnerTube(endpoint, body) {
    const cfg = getYtCfg();
    const headers = await buildAuthHeaders(cfg);
    if (!headers || !cfg.context) return { ok: false, authError: true, status: 0 };
    const qs = cfg.apiKey ? `?key=${encodeURIComponent(cfg.apiKey)}&prettyPrint=false` : '?prettyPrint=false';
    try {
      const resp = await fetch(`${endpoint}${qs}`, {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({ context: cfg.context, ...body }),
      });
      if (resp.status === 401 || resp.status === 403) return { ok: false, authError: true, status: resp.status };
      if (!resp.ok) return { ok: false, authError: false, status: resp.status };
      const data = await resp.json().catch(() => ({}));
      if (data?.status === 'STATUS_FAILED' || data?.error) return { ok: false, authError: false, status: resp.status };
      return { ok: true, authError: false, status: resp.status, data };
    } catch {
      return { ok: false, authError: false, status: 0 };
    }
  }

  const unlikeVideo = (videoId) => postInnerTube('/youtubei/v1/like/removelike', { target: { videoId } });
  const addVideoToPlaylist = (playlistId, videoId) =>
    postInnerTube('/youtubei/v1/browse/edit_playlist', {
      playlistId,
      actions: [{ action: 'ACTION_ADD_VIDEO', addedVideoId: videoId }],
    });

  // ---------- Styles ----------

  const CSS = `
#${BTN_ID}{display:inline-flex;align-items:center;justify-content:center;gap:8px;align-self:flex-start;width:auto;min-height:36px;margin-top:10px;padding:0 16px;border:0;border-radius:18px;background:#0f0f0f;color:#fff;font:500 14px/1 Roboto,Arial,sans-serif;cursor:pointer;transition:background .15s}
#${BTN_ID}:hover{background:#272727}
html[dark] #${BTN_ID}{background:#f1f1f1;color:#0f0f0f}
html[dark] #${BTN_ID}:hover{background:#d9d9d9}
#${BTN_ID} svg,#${DURATION_ID} svg,#${FILTER_ID} svg,#${DIALOG_ID} .ytlt-dhead svg{flex:0 0 auto;display:block}
#${BTN_ID}:focus-visible,#${DURATION_ID} button:focus-visible,#${FILTER_ID} button:focus-visible,#${FILTER_ID} input:focus-visible,#${DIALOG_ID} button:focus-visible,#${DIALOG_ID} input:focus-visible,#${DIALOG_ID} select:focus-visible,#${TOAST_ID} button:focus-visible{outline:2px solid #065fd4;outline-offset:2px}
html[dark] #${BTN_ID}:focus-visible,html[dark] #${DURATION_ID} button:focus-visible,html[dark] #${FILTER_ID} button:focus-visible,html[dark] #${FILTER_ID} input:focus-visible,html[dark] #${DIALOG_ID} button:focus-visible,html[dark] #${DIALOG_ID} input:focus-visible,html[dark] #${DIALOG_ID} select:focus-visible,html[dark] #${TOAST_ID} button:focus-visible{outline-color:#3ea6ff}
#${DURATION_ID}{display:flex;flex-direction:column;gap:8px;width:100%;box-sizing:border-box;margin:10px 0 4px;padding:12px 14px;border:0;border-radius:12px;background:rgba(0,0,0,.05);color:#0f0f0f;font:400 13px/1.4 Roboto,Arial,sans-serif;font-variant-numeric:tabular-nums}
html[dark] #${DURATION_ID}{background:rgba(255,255,255,.08);color:#f1f1f1}
#${DURATION_ID} .ytlt-dur-top{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
#${DURATION_ID} .ytlt-dur-total{display:inline-flex;align-items:center;gap:6px;font-size:15px;font-weight:600;letter-spacing:-.01em}
#${DURATION_ID} .ytlt-dur-meta{margin-left:auto;font-size:12px;color:#606060}
html[dark] #${DURATION_ID} .ytlt-dur-meta{color:#aaa}
#${DURATION_ID} .ytlt-dur-speeds{display:flex;flex-wrap:wrap;gap:6px}
#${DURATION_ID} .ytlt-dur-pill{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;background:rgba(0,0,0,.05);font-size:12px;color:#0f0f0f}
html[dark] #${DURATION_ID} .ytlt-dur-pill{background:rgba(255,255,255,.08);color:#f1f1f1}
#${DURATION_ID} .ytlt-dur-pill b{font-weight:500;color:#606060}
html[dark] #${DURATION_ID} .ytlt-dur-pill b{color:#aaa}
#${DURATION_ID} button{min-height:28px;padding:0 12px;border:0;border-radius:14px;background:rgba(0,0,0,.08);color:inherit;font:500 12px/1 Roboto,Arial,sans-serif;cursor:pointer;transition:background .15s}
#${DURATION_ID} button:hover{background:rgba(0,0,0,.14)}
html[dark] #${DURATION_ID} button{background:rgba(255,255,255,.14)}
html[dark] #${DURATION_ID} button:hover{background:rgba(255,255,255,.22)}
#${FILTER_ID}{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 10px;padding:4px 24px 8px;border:0;background:transparent;color:#0f0f0f;font:400 13px/1.4 Roboto,Arial,sans-serif;box-sizing:border-box;max-width:100%}
@media (max-width:600px){#${FILTER_ID}{padding:4px 12px 8px}}
html[dark] #${FILTER_ID}{color:#f1f1f1}
#${FILTER_ID} .ytlt-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
#${FILTER_ID} .ytlt-search-wrap{position:relative;display:flex;align-items:center;flex:1 1 200px;min-width:150px;max-width:280px;height:32px;padding:0 10px;border:1px solid rgba(0,0,0,.18);border-radius:8px;background:#fff;box-sizing:border-box;transition:border-color .15s,background .15s,box-shadow .15s}
html[dark] #${FILTER_ID} .ytlt-search-wrap{border-color:rgba(255,255,255,.16);background:#121212}
#${FILTER_ID} .ytlt-search-wrap:focus-within{border-color:#065fd4;box-shadow:0 0 0 1px #065fd4}
html[dark] #${FILTER_ID} .ytlt-search-wrap:focus-within{border-color:#3ea6ff;box-shadow:0 0 0 1px #3ea6ff}
#${FILTER_ID} .ytlt-search-wrap svg{color:#606060;margin-right:8px}
html[dark] #${FILTER_ID} .ytlt-search-wrap svg{color:#aaa}
#${FILTER_ID} input[type="search"]{flex:1;min-width:0;height:100%;border:0;background:transparent;color:inherit;font:inherit;outline:none}
#${FILTER_ID} input[type="search"]:focus-visible{outline:none}
#${FILTER_ID} .ytlt-chips{display:flex;flex-wrap:wrap;gap:6px}
#${FILTER_ID} .ytlt-chip{min-height:32px;padding:0 12px;border:0;border-radius:8px;background:rgba(0,0,0,.05);color:#0f0f0f;font:500 13px/1 Roboto,Arial,sans-serif;cursor:pointer;transition:background .15s,color .15s}
#${FILTER_ID} .ytlt-chip:hover{background:rgba(0,0,0,.1)}
html[dark] #${FILTER_ID} .ytlt-chip{background:rgba(255,255,255,.1);color:#f1f1f1}
html[dark] #${FILTER_ID} .ytlt-chip:hover{background:rgba(255,255,255,.18)}
#${FILTER_ID} .ytlt-chip[aria-pressed="true"]{background:#0f0f0f;color:#fff}
html[dark] #${FILTER_ID} .ytlt-chip[aria-pressed="true"]{background:#f1f1f1;color:#0f0f0f}
#${FILTER_ID} .ytlt-counter{font-size:12px;font-variant-numeric:tabular-nums;color:#606060;margin-left:auto;padding:0 4px}
html[dark] #${FILTER_ID} .ytlt-counter{color:#aaa}
#${FILTER_ID} .ytlt-fbtn{min-height:32px;padding:0 12px;border:0;border-radius:8px;background:rgba(0,0,0,.06);color:inherit;font:500 12px/1 Roboto,Arial,sans-serif;cursor:pointer;transition:background .15s}
#${FILTER_ID} .ytlt-fbtn:hover{background:rgba(0,0,0,.12)}
html[dark] #${FILTER_ID} .ytlt-fbtn{background:rgba(255,255,255,.12)}
html[dark] #${FILTER_ID} .ytlt-fbtn:hover{background:rgba(255,255,255,.2)}
#${EMPTY_ID}{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:12px;padding:24px 16px;margin:8px 24px;border:0;border-radius:12px;background:rgba(0,0,0,.04);color:#606060;font:400 13px/1.4 Roboto,Arial,sans-serif}
html[dark] #${EMPTY_ID}{background:rgba(255,255,255,.05);color:#aaa}
[${HIDDEN_ATTR}]{display:none!important}
#${BACKDROP_ID}{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.7);padding:16px;box-sizing:border-box}
#${DIALOG_ID},#${DIALOG_ID} *{box-sizing:border-box}
#${DIALOG_ID}{width:100%;max-width:min(520px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow-y:auto;border-radius:16px;background:#fff;color:#0f0f0f;box-shadow:0 20px 48px rgba(0,0,0,.45);font:400 13px/1.45 Roboto,Arial,sans-serif}
html[dark] #${DIALOG_ID}{background:#212121;color:#f1f1f1;border:1px solid rgba(255,255,255,.08)}
#${DIALOG_ID} .ytlt-dhead{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;padding:14px 16px 14px 20px;background:#fff;border-bottom:1px solid rgba(0,0,0,.08)}
html[dark] #${DIALOG_ID} .ytlt-dhead{background:#212121;border-bottom-color:rgba(255,255,255,.1)}
#${DIALOG_ID} .ytlt-dhead h2{flex:1;margin:0;font-size:16px;font-weight:600}
#${DIALOG_ID} .ytlt-close{width:36px;height:36px;border:0;border-radius:50%;background:transparent;color:inherit;font-size:22px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background .15s}
#${DIALOG_ID} .ytlt-close:hover{background:rgba(0,0,0,.06)}
html[dark] #${DIALOG_ID} .ytlt-close:hover{background:rgba(255,255,255,.1)}
#${DIALOG_ID} .ytlt-tabs{display:flex;border-bottom:1px solid rgba(0,0,0,.08);padding:0 16px;gap:4px}
html[dark] #${DIALOG_ID} .ytlt-tabs{border-bottom-color:rgba(255,255,255,.1)}
#${DIALOG_ID} .ytlt-tab{padding:11px 16px;border:0;border-bottom:2px solid transparent;background:transparent;color:#606060;font:500 13px/1 Roboto,Arial,sans-serif;cursor:pointer;transition:color .15s,border-color .15s}
#${DIALOG_ID} .ytlt-tab:hover{color:#0f0f0f}
html[dark] #${DIALOG_ID} .ytlt-tab{color:#aaa}
html[dark] #${DIALOG_ID} .ytlt-tab:hover{color:#f1f1f1}
#${DIALOG_ID} .ytlt-tab[aria-selected="true"]{color:#0f0f0f;border-bottom-color:#065fd4}
html[dark] #${DIALOG_ID} .ytlt-tab[aria-selected="true"]{color:#f1f1f1;border-bottom-color:#3ea6ff}
#${DIALOG_ID} .ytlt-body{padding:16px 20px 20px;display:flex;flex-direction:column;gap:12px}
#${DIALOG_ID} .ytlt-card{padding:14px 16px;border:0;border-radius:12px;background:rgba(0,0,0,.035);display:flex;flex-direction:column;gap:10px}
html[dark] #${DIALOG_ID} .ytlt-card{background:rgba(255,255,255,.05)}
#${DIALOG_ID} .ytlt-card h3{margin:0;font-size:14px;font-weight:600}
#${DIALOG_ID} .ytlt-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
#${DIALOG_ID} label{font-size:12px;color:#606060}
html[dark] #${DIALOG_ID} label{color:#aaa}
#${DIALOG_ID} select,#${DIALOG_ID} input[type="text"],#${DIALOG_ID} input[type="number"]{min-height:34px;padding:6px 10px;border:1px solid rgba(0,0,0,.18);border-radius:8px;background:#fff;color:inherit;font:inherit;transition:border-color .15s}
html[dark] #${DIALOG_ID} select,html[dark] #${DIALOG_ID} input[type="text"],html[dark] #${DIALOG_ID} input[type="number"]{background:#121212;border-color:rgba(255,255,255,.16)}
#${DIALOG_ID} .ytlt-btn{min-height:36px;padding:0 16px;border:0;border-radius:18px;background:rgba(0,0,0,.06);color:inherit;font:500 13px/1 Roboto,Arial,sans-serif;cursor:pointer;transition:background .15s}
#${DIALOG_ID} .ytlt-btn:hover{background:rgba(0,0,0,.12)}
html[dark] #${DIALOG_ID} .ytlt-btn{background:rgba(255,255,255,.1)}
html[dark] #${DIALOG_ID} .ytlt-btn:hover{background:rgba(255,255,255,.18)}
#${DIALOG_ID} .ytlt-btn.primary{background:#0f0f0f;color:#fff}
#${DIALOG_ID} .ytlt-btn.primary:hover{background:#272727}
html[dark] #${DIALOG_ID} .ytlt-btn.primary{background:#f1f1f1;color:#0f0f0f}
html[dark] #${DIALOG_ID} .ytlt-btn.primary:hover{background:#d9d9d9}
#${DIALOG_ID} .ytlt-btn.danger{background:#c00;color:#fff}
#${DIALOG_ID} .ytlt-btn.danger:hover{background:#a30000}
html[dark] #${DIALOG_ID} .ytlt-btn.danger{background:#d93025;color:#fff}
#${DIALOG_ID} .ytlt-note{font-size:12px;color:#606060;margin:0}
html[dark] #${DIALOG_ID} .ytlt-note{color:#aaa}
#${DIALOG_ID} .ytlt-check{display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:inherit}
#${DIALOG_ID} .ytlt-confirm-box{display:flex;flex-direction:column;gap:14px;padding:4px 0}
#${DIALOG_ID} .ytlt-confirm-head{display:flex;align-items:center;gap:10px;color:#c00;font-size:15px;font-weight:600}
html[dark] #${DIALOG_ID} .ytlt-confirm-head{color:#ff6b6b}
#${DIALOG_ID} .ytlt-confirm-list{margin:0;padding:10px 14px 10px 28px;border-radius:10px;background:rgba(0,0,0,.04);font-size:12px;color:#606060;display:flex;flex-direction:column;gap:4px}
html[dark] #${DIALOG_ID} .ytlt-confirm-list{background:rgba(255,255,255,.05);color:#ccc}
#${DIALOG_ID} .ytlt-confirm-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}
#${TOAST_ID}{position:fixed;right:24px;bottom:24px;z-index:2147483647;max-width:min(380px,calc(100vw - 32px));padding:14px 16px;border-radius:12px;background:#212121;color:#f1f1f1;box-shadow:0 12px 32px rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.1);font:400 13px/1.4 Roboto,Arial,sans-serif;display:flex;flex-direction:column;gap:10px}
#${TOAST_ID} .ytlt-tbar{height:4px;border-radius:2px;background:rgba(255,255,255,.16);overflow:hidden}
#${TOAST_ID} .ytlt-tbar > span{display:block;height:100%;background:#3ea6ff;transition:width .2s}
#${TOAST_ID} .ytlt-tactions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
#${TOAST_ID} button{min-height:30px;padding:0 12px;border:0;border-radius:15px;background:rgba(255,255,255,.14);color:#f1f1f1;font:500 12px/1 Roboto,Arial,sans-serif;cursor:pointer}
#${TOAST_ID} button:hover{background:rgba(255,255,255,.24)}
`;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).append(style);
  }

  // ---------- Toast & Tasks ----------

  function clearToast() {
    document.getElementById(TOAST_ID)?.remove();
  }

  function showToast({ text, progress = null, actions = [] }) {
    ensureStyle();
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement('div');
      toast.id = TOAST_ID;
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.append(toast);
    }
    toast.textContent = '';
    const msg = document.createElement('div');
    msg.textContent = text;
    toast.append(msg);
    if (typeof progress === 'number') {
      const bar = document.createElement('div');
      bar.className = 'ytlt-tbar';
      const fill = document.createElement('span');
      fill.style.width = `${Math.min(100, Math.max(0, progress))}%`;
      bar.append(fill);
      toast.append(bar);
    }
    if (actions.length) {
      const row = document.createElement('div');
      row.className = 'ytlt-tactions';
      for (const a of actions) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = a.label;
        b.addEventListener('click', a.onClick);
        row.append(b);
      }
      toast.append(row);
    }
  }

  function beginTask(name) {
    if (activeTask) {
      showToast({ text: 'Another task is already running.', actions: [{ label: 'Close', onClick: clearToast }] });
      return null;
    }
    activeTask = { name, stopped: false };
    return activeTask;
  }

  function endTask(task) {
    if (activeTask === task) activeTask = null;
    updateDurationBadge();
  }

  // ---------- Auto-Scroll Loader ----------

  async function autoScrollLiked(task) {
    let prevCount = getRows().length;
    let stall = 0;
    while (!task.stopped && stall < SCROLL_STALL_ROUNDS) {
      window.scrollTo(0, document.documentElement.scrollHeight);
      showToast({
        text: `Loading liked videos... (${prevCount} loaded)`,
        actions: [{ label: 'Stop', onClick: () => { task.stopped = true; } }],
      });
      await sleep(SCROLL_WAIT_MS);
      const nextCount = getRows().length;
      if (nextCount > prevCount) {
        prevCount = nextCount;
        stall = 0;
        applyFilter();
        updateDurationBadge();
      } else {
        stall++;
      }
    }
  }

  // ---------- Bulk Unlike ----------

  async function runBulkUnlike(items, label) {
    const valid = items.filter((i) => i.videoId);
    if (!valid.length) {
      showToast({ text: `No matching liked videos found for ${label}.`, actions: [{ label: 'Close', onClick: clearToast }] });
      return;
    }
    const task = beginTask('unlike');
    if (!task) return;
    closeDialog();

    let done = 0;
    let failed = 0;
    let authBlocked = false;
    const total = valid.length;

    for (let i = 0; i < total; i++) {
      if (task.stopped) break;
      const item = valid[i];
      showToast({
        text: `Unliking ${i + 1} / ${total}... (${done} removed, ${failed} failed)`,
        progress: Math.round(((i + 1) / total) * 100),
        actions: [{ label: 'Stop', onClick: () => { task.stopped = true; } }],
      });
      const res = await unlikeVideo(item.videoId);
      if (res.ok) {
        done++;
        item.row.remove();
      } else if (res.authError) {
        authBlocked = true;
        break;
      } else {
        failed++;
      }
      if (!task.stopped && i + 1 < total) await sleep(UNLIKE_DELAY_MS);
    }

    const wasStopped = task.stopped;
    endTask(task);
    applyFilter();

    if (authBlocked) {
      showToast({
        text: 'Unlike failed: sign in to YouTube and refresh the page.',
        actions: [{ label: 'Close', onClick: clearToast }],
      });
      return;
    }
    showToast({
      text: `${wasStopped ? 'Stopped' : 'Done'}: ${done} unliked${failed ? `, ${failed} failed` : ''}.`,
      actions: [{ label: 'Close', onClick: clearToast }],
    });
  }

  // ---------- Export ----------

  function gmGetJson(url) {
    return new Promise((resolve) => {
      if (typeof GM_xmlhttpRequest !== 'function') {
        resolve(null);
        return;
      }
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: RESOLVE_TIMEOUT_MS,
        onload: (res) => {
          if (res.status < 200 || res.status >= 300) return resolve(null);
          try {
            resolve(JSON.parse(res.responseText));
          } catch {
            resolve(null);
          }
        },
        onerror: () => resolve(null),
        ontimeout: () => resolve(null),
      });
    });
  }

  async function resolveUnavailableTitle(videoId) {
    if (!videoId) return '';
    if (resolvedTitleCache.has(videoId)) return resolvedTitleCache.get(videoId);
    const data = await gmGetJson(`https://findyoutubevideo.thetechrobo.ca/api/v4/${encodeURIComponent(videoId)}`);
    let title = '';
    const keys = Array.isArray(data?.keys) ? data.keys : [];
    for (const entry of keys) {
      const candidate =
        entry?.rawdata?.title ||
        entry?.rawdata?.videoTitle ||
        entry?.meta?.title ||
        entry?.title ||
        '';
      if (typeof candidate === 'string' && cleanText(candidate)) {
        title = cleanText(candidate);
        break;
      }
    }
    resolvedTitleCache.set(videoId, title);
    return title;
  }

  function escapeMd(s) {
    return String(s || '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
  }

  function downloadText(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyText(text) {
    if (typeof GM_setClipboard === 'function') {
      GM_setClipboard(text, 'text');
      return true;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    return false;
  }

  function selectScopeItems(scope) {
    const all = getAllItems();
    if (scope === 'filtered') return all.filter((i) => !i.row.hasAttribute(HIDDEN_ATTR) && !isHiddenByMembers(i.row));
    if (scope === 'available') return all.filter((i) => i.status === 'available');
    if (scope === 'unavailable-all') return all.filter((i) => i.status !== 'available');
    if (scope === 'unavailable-deleted') return all.filter((i) => i.status === 'deleted');
    if (scope === 'unavailable-private') return all.filter((i) => i.status === 'private');
    if (scope === 'shorts') return all.filter((i) => i.isShort);
    return all;
  }

  async function runExport(scope, format, shouldResolve) {
    const items = selectScopeItems(scope);
    if (!items.length) {
      showToast({ text: 'No matching liked videos to export.', actions: [{ label: 'Close', onClick: clearToast }] });
      return;
    }
    const task = beginTask('export');
    if (!task) return;
    closeDialog();

    const resolved = new Map();
    let foundCount = 0;
    if (shouldResolve) {
      const queue = items.filter((i) => i.status !== 'available' && i.videoId);
      let done = 0;
      const total = queue.length;
      const worker = async () => {
        while (queue.length && !task.stopped) {
          const item = queue.shift();
          const t = await resolveUnavailableTitle(item.videoId);
          if (t) {
            resolved.set(item.videoId, t);
            foundCount++;
          }
          done++;
          showToast({
            text: `Resolving titles ${done} / ${total} (${foundCount} found)...`,
            progress: total ? Math.round((done / total) * 100) : 100,
            actions: [{ label: 'Finish Now', onClick: () => { task.stopped = true; } }],
          });
        }
      };
      if (total) {
        const workers = [];
        for (let i = 0; i < Math.min(RESOLVE_CONCURRENCY, total); i++) workers.push(worker());
        await Promise.all(workers);
      }
    }

    const date = new Date().toISOString().slice(0, 10);
    const ext = format === 'txt' ? 'txt' : 'md';
    const filename = `youtube-liked-videos-${scope}-${date}.${ext}`;
    let content = '';
    if (format === 'txt') {
      content = items
        .filter((i) => i.videoId)
        .map((i) => (i.isShort ? `https://www.youtube.com/shorts/${i.videoId}` : `https://www.youtube.com/watch?v=${i.videoId}`))
        .join('\n');
    } else {
      const lines = [
        '# YouTube Liked Videos Export',
        '',
        `- Exported: ${date}`,
        `- Scope: ${scope}`,
        `- Count: ${items.length}`,
        '',
        '| # | Title | Channel | Status | Link |',
        '| --- | --- | --- | --- | --- |',
      ];
      items.forEach((item, idx) => {
        const link = item.videoId
          ? (item.isShort ? `https://www.youtube.com/shorts/${item.videoId}` : `https://www.youtube.com/watch?v=${item.videoId}`)
          : '';
        const title = item.title || resolved.get(item.videoId) || item.rawTitle || `[${item.status}]`;
        const linkCell = link ? `[Watch](${link})` : '';
        lines.push(`| ${idx + 1} | ${escapeMd(title)} | ${escapeMd(item.channel)} | ${item.status} | ${linkCell} |`);
      });
      content = lines.join('\n');
    }

    endTask(task);
    const mime = format === 'txt' ? 'text/plain;charset=utf-8' : 'text/markdown;charset=utf-8';
    const summary = shouldResolve
      ? `Ready: ${items.length} liked videos (${foundCount} titles resolved)`
      : `Ready: ${items.length} liked videos`;

    const showReady = (note = '') => {
      showToast({
        text: note ? `${summary} - ${note}` : summary,
        actions: [
          { label: 'Download', onClick: () => downloadText(filename, content, mime) },
          {
            label: 'Copy to Clipboard',
            onClick: async () => {
              const ok = await copyText(content).catch(() => false);
              showReady(ok ? 'Copied' : 'Clipboard failed; use Download');
            },
          },
          { label: 'Close', onClick: clearToast },
        ],
      });
    };
    showReady();
  }

  // ---------- Copy to Playlist ----------

  function parseTargetPlaylistId(raw) {
    const input = cleanText(raw);
    if (!input) return '';
    try {
      if (/^https?:\/\//i.test(input)) {
        const u = new URL(input);
        return u.searchParams.get('list') || '';
      }
    } catch {
      // fall through
    }
    const m = input.match(/[?&]list=([A-Za-z0-9_-]+)/);
    if (m) return m[1];
    if (/^[A-Za-z0-9_-]{2,}$/.test(input)) return input;
    return '';
  }

  async function runCopyToPlaylist(rawTarget, scope) {
    const targetId = parseTargetPlaylistId(rawTarget);
    if (!targetId || targetId === 'LL') {
      showToast({
        text: targetId === 'LL' ? 'Choose a destination playlist other than Liked Videos (LL).' : 'Enter a valid playlist URL or playlist ID.',
        actions: [{ label: 'Close', onClick: clearToast }],
      });
      return;
    }
    const items = selectScopeItems(scope).filter((i) => i.videoId);
    if (!items.length) {
      showToast({ text: 'No matching liked videos to copy.', actions: [{ label: 'Close', onClick: clearToast }] });
      return;
    }

    const task = beginTask('copy');
    if (!task) return;
    closeDialog();

    let added = 0;
    let failed = 0;
    let authBlocked = false;
    for (let i = 0; i < items.length; i++) {
      if (task.stopped) break;
      showToast({
        text: `Copying ${i + 1} / ${items.length} to ${targetId}... (${added} added, ${failed} failed)`,
        progress: Math.round(((i + 1) / items.length) * 100),
        actions: [{ label: 'Stop', onClick: () => { task.stopped = true; } }],
      });
      const res = await addVideoToPlaylist(targetId, items[i].videoId);
      if (res.ok) {
        added++;
      } else if (res.authError) {
        authBlocked = true;
        break;
      } else {
        failed++;
      }
      if (!task.stopped && i + 1 < items.length) await sleep(COPY_DELAY_MS);
    }

    const wasStopped = task.stopped;
    endTask(task);
    if (authBlocked) {
      showToast({
        text: 'Copy failed: destination playlist is read-only or you are not signed in.',
        actions: [{ label: 'Close', onClick: clearToast }],
      });
      return;
    }
    showToast({
      text: `${wasStopped ? 'Stopped' : 'Done'}: ${added} added to ${targetId}${failed ? `, ${failed} failed` : ''}.`,
      actions: [{ label: 'Close', onClick: clearToast }],
    });
  }

  // ---------- Search & Filter Bar ----------

  const isFilterActive = () => filterState.query.trim() !== '' || filterState.chip !== 'all';

  function matchesFilter(item) {
    const chip = filterState.chip;
    const threshold = Number(get('watchedThreshold')) || 80;
    if (chip === 'unwatched' && item.watchedPct >= threshold) return false;
    if (chip === 'watched' && item.watchedPct < threshold) return false;
    if (chip === 'shorts' && !item.isShort) return false;
    if (chip === 'unavailable' && item.status === 'available') return false;

    const q = filterState.query.trim().toLowerCase();
    if (!q) return true;
    const hay = `${item.title} ${item.rawTitle} ${item.channel}`.toLowerCase();
    return hay.includes(q);
  }

  function applyFilter() {
    const items = getAllItems();
    const active = isFilterActive();
    let shown = 0;
    let totalVisible = 0;
    for (const item of items) {
      if (isHiddenByMembers(item.row)) continue;
      totalVisible++;
      const ok = !active || matchesFilter(item);
      if (ok) {
        item.row.removeAttribute(HIDDEN_ATTR);
        shown++;
      } else {
        item.row.setAttribute(HIDDEN_ATTR, '1');
      }
    }

    const bar = document.getElementById(FILTER_ID);
    if (bar) {
      const counter = bar.querySelector('.ytlt-counter');
      if (counter) counter.textContent = `Showing ${shown} / ${totalVisible}`;
      const resetBtn = bar.querySelector('.ytlt-fbtn');
      if (resetBtn) resetBtn.hidden = !active;
    }

    const empty = document.getElementById(EMPTY_ID);
    if (active && totalVisible > 0 && shown === 0) {
      if (!empty && bar) {
        const box = document.createElement('div');
        box.id = EMPTY_ID;
        const msg = document.createElement('span');
        msg.textContent = 'No liked videos match the current filter.';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ytlt-fbtn';
        btn.textContent = 'Reset filter';
        btn.addEventListener('click', resetFilter);
        box.append(msg, btn);
        bar.after(box);
      }
    } else {
      empty?.remove();
    }
    updateDurationBadge();
  }

  function resetFilter() {
    filterState = { query: '', chip: 'all' };
    const bar = document.getElementById(FILTER_ID);
    if (bar) {
      const input = bar.querySelector('input[type="search"]');
      if (input) input.value = '';
      for (const c of bar.querySelectorAll('.ytlt-chip')) {
        c.setAttribute('aria-pressed', String(c.dataset.chip === 'all'));
      }
    }
    applyFilter();
  }

  function findListAnchor() {
    const root = activeLikedRoot();
    const selectors = [
      'ytd-playlist-video-list-renderer #contents',
      'ytd-rich-grid-renderer #contents',
      'ytd-item-section-renderer #contents',
      'ytd-section-list-renderer #contents',
      'ytd-playlist-video-list-renderer',
    ];
    for (const sel of selectors) {
      for (const el of root.querySelectorAll(sel)) {
        if (!isElementHidden(el)) return el;
      }
    }
    return null;
  }

  function mountFilterBar() {
    const existing = document.getElementById(FILTER_ID);
    if (!get('showFilterBar')) {
      existing?.remove();
      document.getElementById(EMPTY_ID)?.remove();
      for (const row of getRows()) row.removeAttribute(HIDDEN_ATTR);
      return;
    }
    const listRoot = findListAnchor();
    if (!listRoot || !listRoot.parentElement) return;
    if (existing && existing.isConnected) {
      if (existing.parentElement !== listRoot.parentElement) listRoot.before(existing);
      return;
    }

    ensureStyle();
    const bar = document.createElement('div');
    bar.id = FILTER_ID;

    const searchLabel = document.createElement('label');
    searchLabel.className = 'ytlt-sr';
    searchLabel.setAttribute('for', 'ytlt-filter-input');
    searchLabel.textContent = 'Filter liked videos';
    const searchWrap = document.createElement('div');
    searchWrap.className = 'ytlt-search-wrap';
    const input = document.createElement('input');
    input.id = 'ytlt-filter-input';
    input.type = 'search';
    input.placeholder = 'Search title or channel...';
    input.value = filterState.query;
    input.addEventListener('input', () => {
      filterState.query = input.value;
      applyFilter();
    });
    searchWrap.append(makeSvgIcon(ICON_SEARCH, 15), input);

    const chips = document.createElement('div');
    chips.className = 'ytlt-chips';
    for (const [id, label] of [
      ['all', 'All'],
      ['unwatched', 'Unwatched'],
      ['watched', 'Watched'],
      ['shorts', 'Shorts'],
      ['unavailable', 'Unavailable'],
    ]) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'ytlt-chip';
      chip.dataset.chip = id;
      chip.textContent = label;
      chip.setAttribute('aria-pressed', String(filterState.chip === id));
      chip.addEventListener('click', () => {
        filterState.chip = id;
        for (const c of chips.querySelectorAll('.ytlt-chip')) {
          c.setAttribute('aria-pressed', String(c.dataset.chip === id));
        }
        applyFilter();
      });
      chips.append(chip);
    }

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'ytlt-fbtn';
    resetBtn.textContent = 'Reset';
    resetBtn.hidden = !isFilterActive();
    resetBtn.addEventListener('click', resetFilter);

    const counter = document.createElement('span');
    counter.className = 'ytlt-counter';

    bar.append(searchLabel, searchWrap, chips, resetBtn, counter);
    listRoot.before(bar);
    applyFilter();
  }

  // ---------- Header Button & Duration Card ----------

  function findHeaderAnchor() {
    const root = activeLikedRoot();
    const selectors = [
      'ytd-playlist-header-renderer .metadata-action-bar',
      'ytd-playlist-header-renderer .metadata-wrapper',
      'yt-page-header-view-model .yt-page-header-view-model__page-header-headline-info',
      'yt-page-header-view-model .page-header-view-model-wiz__page-header-headline-info',
      'yt-page-header-view-model .yt-page-header-view-model__page-header-content',
      'yt-page-header-view-model .page-header-view-model-wiz__page-header-content',
      'yt-page-header-renderer .yt-page-header-view-model__page-header-content',
      'yt-page-header-renderer .page-header-view-model-wiz__page-header-content',
    ];
    for (const sel of selectors) {
      for (const el of root.querySelectorAll(sel)) {
        if (!isElementHidden(el)) return el;
      }
    }
    for (const actions of root.querySelectorAll('yt-flexible-actions-view-model')) {
      if (!isElementHidden(actions) && actions.parentElement) return actions.parentElement;
    }
    for (const sel of ['yt-page-header-view-model', 'ytd-playlist-header-renderer', 'yt-page-header-renderer']) {
      for (const el of root.querySelectorAll(sel)) {
        if (!isElementHidden(el)) return el;
      }
    }
    return null;
  }

  function computeDurationSummary(items) {
    let totalSec = 0;
    let timedCount = 0;
    for (const item of items) {
      if (item.durationSec !== null) {
        totalSec += item.durationSec;
        timedCount++;
      }
    }
    return { totalSec, timedCount, count: items.length };
  }

  function updateDurationBadge() {
    const existing = document.getElementById(DURATION_ID);
    if (!get('showDuration')) {
      existing?.remove();
      return;
    }
    const anchor = findHeaderAnchor();
    if (!anchor) return;
    ensureStyle();

    let badge = existing;
    if (!badge) {
      badge = document.createElement('div');
      badge.id = DURATION_ID;
      anchor.append(badge);
    } else if (badge.parentElement !== anchor) {
      anchor.append(badge);
    }

    const all = getAllItems();
    const totalSum = computeDurationSummary(all);
    const totalCount = getTotalLikedCount();
    const active = isFilterActive();
    const visibleItems = active
      ? all.filter((i) => !i.row.hasAttribute(HIDDEN_ATTR) && !isHiddenByMembers(i.row))
      : all;
    const shownSum = active ? computeDurationSummary(visibleItems) : totalSum;

    badge.textContent = '';
    const top = document.createElement('div');
    top.className = 'ytlt-dur-top';
    const main = document.createElement('span');
    main.className = 'ytlt-dur-total';
    const s = shownSum.totalSec;
    const totalLabel = document.createElement('span');
    totalLabel.textContent = active
      ? `Filtered: ${formatDuration(s)} (of ${formatDuration(totalSum.totalSec)})`
      : formatDuration(s);
    main.append(makeSvgIcon(ICON_CLOCK, 15), totalLabel);

    const meta = document.createElement('span');
    meta.className = 'ytlt-dur-meta';
    meta.textContent =
      totalCount && all.length < totalCount
        ? `(${all.length}/${totalCount} loaded)`
        : `(${shownSum.timedCount}/${shownSum.count} timed)`;
    top.append(main, meta);

    if (totalCount && all.length < totalCount) {
      const loadBtn = document.createElement('button');
      loadBtn.type = 'button';
      loadBtn.textContent = 'Load all';
      loadBtn.disabled = !!activeTask;
      loadBtn.addEventListener('click', async () => {
        const task = beginTask('load');
        if (!task) return;
        await autoScrollLiked(task);
        endTask(task);
        clearToast();
      });
      top.append(loadBtn);
    }

    const speedsRow = document.createElement('div');
    speedsRow.className = 'ytlt-dur-speeds';
    for (const rate of [1.25, 1.5, 2]) {
      const pill = document.createElement('span');
      pill.className = 'ytlt-dur-pill';
      const b = document.createElement('b');
      b.textContent = `${rate}x`;
      pill.append(b, document.createTextNode(` ${formatDuration(s / rate)}`));
      speedsRow.append(pill);
    }
    badge.append(top, speedsRow);
  }

  function mountHeaderButton() {
    const anchor = findHeaderAnchor();
    if (!anchor) return;
    ensureStyle();
    const existing = document.getElementById(BTN_ID);
    const badge = document.getElementById(DURATION_ID);
    if (existing) {
      if (existing.parentElement !== anchor) {
        if (badge && badge.parentElement === anchor) anchor.insertBefore(existing, badge);
        else anchor.append(existing);
      }
      return;
    }
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.append(makeSvgIcon(ICON_HEART, 15), document.createTextNode('Liked Videos Tools'));
    btn.addEventListener('click', () => openDialog('unlike'));
    if (badge && badge.parentElement === anchor) anchor.insertBefore(btn, badge);
    else anchor.append(btn);
  }

  // ---------- Dialog ----------

  function closeDialog() {
    document.removeEventListener('keydown', onDialogKey, true);
    document.getElementById(BACKDROP_ID)?.remove();
    if (lastTrigger && lastTrigger.isConnected) lastTrigger.focus();
    lastTrigger = null;
  }

  function onDialogKey(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeDialog();
    }
  }

  function openDialog(initialTab = 'unlike', pendingConfirm = null) {
    if (document.getElementById(BACKDROP_ID)) closeDialog();
    ensureStyle();
    lastTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const backdrop = document.createElement('div');
    backdrop.id = BACKDROP_ID;
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) closeDialog();
    });

    const dialog = document.createElement('div');
    dialog.id = DIALOG_ID;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Liked Videos Tools');

    const head = document.createElement('div');
    head.className = 'ytlt-dhead';
    const title = document.createElement('h2');
    title.textContent = 'Liked Videos Tools';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'ytlt-close';
    close.setAttribute('aria-label', 'Close');
    close.append(makeSvgIcon(ICON_CLOSE, 20));
    close.addEventListener('click', closeDialog);
    head.append(makeSvgIcon(ICON_HEART, 18), title, close);

    const tabs = document.createElement('div');
    tabs.className = 'ytlt-tabs';
    tabs.setAttribute('role', 'tablist');
    const body = document.createElement('div');
    body.className = 'ytlt-body';

    let currentTab = initialTab;
    const tabButtons = [];
    for (const [id, label] of [
      ['unlike', 'Bulk Unlike'],
      ['export', 'Export'],
      ['copy', 'Copy to Playlist'],
    ]) {
      const t = document.createElement('button');
      t.type = 'button';
      t.className = 'ytlt-tab';
      t.setAttribute('role', 'tab');
      t.dataset.tab = id;
      t.textContent = label;
      t.addEventListener('click', () => {
        currentTab = id;
        renderBody(null);
      });
      tabs.append(t);
      tabButtons.push(t);
    }

    tabs.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const idx = tabButtons.findIndex((b) => b.dataset.tab === currentTab);
      const next = (idx + (e.key === 'ArrowRight' ? 1 : -1) + tabButtons.length) % tabButtons.length;
      currentTab = tabButtons[next].dataset.tab;
      renderBody(null);
      tabButtons[next].focus();
    });

    const makeCard = (heading) => {
      const card = document.createElement('div');
      card.className = 'ytlt-card';
      const h = document.createElement('h3');
      h.textContent = heading;
      card.append(h);
      return card;
    };

    function askConfirm(label, items) {
      if (!items.length) {
        showToast({ text: `No loaded liked videos match "${label}".`, actions: [{ label: 'Close', onClick: clearToast }] });
        return;
      }
      renderBody({ label, items });
    }

    function renderBody(confirmState) {
      for (const b of tabButtons) {
        b.setAttribute('aria-selected', String(!confirmState && b.dataset.tab === currentTab));
      }
      tabs.hidden = !!confirmState;
      body.textContent = '';

      if (confirmState) {
        const box = document.createElement('div');
        box.className = 'ytlt-confirm-box';
        const ch = document.createElement('div');
        ch.className = 'ytlt-confirm-head';
        ch.append(makeSvgIcon(ICON_WARN, 20), document.createTextNode(`Confirm: ${confirmState.label}`));
        const summary = document.createElement('p');
        summary.className = 'ytlt-note';
        summary.textContent = `This will unlike ${confirmState.items.length} video(s) from your Liked Videos using YouTube's unlike API.`;
        const list = document.createElement('ul');
        list.className = 'ytlt-confirm-list';
        for (const item of confirmState.items.slice(0, 5)) {
          const li = document.createElement('li');
          li.textContent = item.title || item.rawTitle || `[${item.status}] ${item.videoId}`;
          list.append(li);
        }
        if (confirmState.items.length > 5) {
          const more = document.createElement('li');
          more.textContent = `...and ${confirmState.items.length - 5} more`;
          list.append(more);
        }
        const actions = document.createElement('div');
        actions.className = 'ytlt-confirm-actions';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'ytlt-btn';
        cancel.textContent = 'Cancel';
        cancel.addEventListener('click', () => renderBody(null));
        const confirm = document.createElement('button');
        confirm.type = 'button';
        confirm.className = 'ytlt-btn danger';
        confirm.textContent = `Unlike ${confirmState.items.length} video(s)`;
        confirm.addEventListener('click', () => runBulkUnlike(confirmState.items, confirmState.label));
        actions.append(cancel, confirm);
        box.append(ch, summary, list, actions);
        body.append(box);
        cancel.focus();
        return;
      }

      if (currentTab === 'unlike') {
        const all = getAllItems();
        const unavailCard = makeCard('Unlike unavailable videos');
        const unavailRow = document.createElement('div');
        unavailRow.className = 'ytlt-row';
        const unavailSel = document.createElement('select');
        for (const [val, txt] of [
          ['unavailable-all', 'All unavailable (deleted + private)'],
          ['unavailable-deleted', 'Deleted only'],
          ['unavailable-private', 'Private only'],
        ]) {
          const o = document.createElement('option');
          o.value = val;
          o.textContent = txt;
          unavailSel.append(o);
        }
        const unavailBtn = document.createElement('button');
        unavailBtn.type = 'button';
        unavailBtn.className = 'ytlt-btn danger';
        unavailBtn.textContent = 'Unlike';
        unavailBtn.addEventListener('click', () => {
          const items = selectScopeItems(unavailSel.value);
          askConfirm(unavailSel.options[unavailSel.selectedIndex].textContent, items);
        });
        unavailRow.append(unavailSel, unavailBtn);
        unavailCard.append(unavailRow);

        const watchedCard = makeCard('Unlike watched videos');
        const watchedRow = document.createElement('div');
        watchedRow.className = 'ytlt-row';
        const thLabel = document.createElement('label');
        thLabel.textContent = 'Watched >= (%)';
        const thInput = document.createElement('input');
        thInput.type = 'number';
        thInput.min = '10';
        thInput.max = '100';
        thInput.value = String(get('watchedThreshold'));
        thInput.style.width = '76px';
        thInput.addEventListener('change', () => {
          const n = Math.min(100, Math.max(10, Number.parseInt(thInput.value, 10) || 80));
          thInput.value = String(n);
          put('watchedThreshold', n);
        });
        const watchedBtn = document.createElement('button');
        watchedBtn.type = 'button';
        watchedBtn.className = 'ytlt-btn danger';
        watchedBtn.textContent = 'Unlike watched';
        watchedBtn.addEventListener('click', () => {
          const th = Math.min(100, Math.max(10, Number.parseInt(thInput.value, 10) || 80));
          put('watchedThreshold', th);
          askConfirm(`Watched >= ${th}%`, getAllItems().filter((i) => i.watchedPct >= th));
        });
        watchedRow.append(thLabel, thInput, watchedBtn);
        watchedCard.append(watchedRow);

        const quickCard = makeCard('Unlike by keyword, Shorts or filter');
        const kwRow = document.createElement('div');
        kwRow.className = 'ytlt-row';
        const kwInput = document.createElement('input');
        kwInput.type = 'text';
        kwInput.placeholder = 'Title or channel keyword...';
        kwInput.style.flex = '1';
        const kwBtn = document.createElement('button');
        kwBtn.type = 'button';
        kwBtn.className = 'ytlt-btn danger';
        kwBtn.textContent = 'Unlike matching';
        kwBtn.addEventListener('click', () => {
          const q = cleanText(kwInput.value).toLowerCase();
          if (!q) return;
          const matched = getAllItems().filter((i) => `${i.title} ${i.channel}`.toLowerCase().includes(q));
          askConfirm(`Keyword "${kwInput.value.trim()}"`, matched);
        });
        kwRow.append(kwInput, kwBtn);

        const extraRow = document.createElement('div');
        extraRow.className = 'ytlt-row';
        const shortsBtn = document.createElement('button');
        shortsBtn.type = 'button';
        shortsBtn.className = 'ytlt-btn';
        shortsBtn.textContent = `Unlike Shorts (${all.filter((i) => i.isShort).length})`;
        shortsBtn.addEventListener('click', () => askConfirm('Liked Shorts', selectScopeItems('shorts')));
        const filteredBtn = document.createElement('button');
        filteredBtn.type = 'button';
        filteredBtn.className = 'ytlt-btn';
        filteredBtn.textContent = 'Unlike currently filtered';
        filteredBtn.addEventListener('click', () => askConfirm('Filtered liked videos', selectScopeItems('filtered')));
        extraRow.append(shortsBtn, filteredBtn);
        quickCard.append(kwRow, extraRow);

        body.append(unavailCard, watchedCard, quickCard);
        return;
      }

      if (currentTab === 'export') {
        const card = makeCard('Export liked videos');
        const row1 = document.createElement('div');
        row1.className = 'ytlt-row';
        const scopeSel = document.createElement('select');
        for (const [val, txt] of [
          ['all', 'All loaded'],
          ['filtered', 'Currently filtered'],
          ['available', 'Available only'],
          ['shorts', 'Shorts only'],
          ['unavailable-all', 'Unavailable: All'],
          ['unavailable-deleted', 'Unavailable: Deleted'],
          ['unavailable-private', 'Unavailable: Private'],
        ]) {
          const o = document.createElement('option');
          o.value = val;
          o.textContent = txt;
          scopeSel.append(o);
        }
        const fmtSel = document.createElement('select');
        for (const [val, txt] of [
          ['md', 'Markdown (.md)'],
          ['txt', 'Plain URLs (.txt)'],
        ]) {
          const o = document.createElement('option');
          o.value = val;
          o.textContent = txt;
          fmtSel.append(o);
        }
        fmtSel.value = get('exportFormat');
        fmtSel.addEventListener('change', () => put('exportFormat', fmtSel.value));
        row1.append(scopeSel, fmtSel);

        const resolveLabel = document.createElement('label');
        resolveLabel.className = 'ytlt-check';
        const resolveCb = document.createElement('input');
        resolveCb.type = 'checkbox';
        resolveCb.checked = get('resolveTitles') === true;
        resolveCb.addEventListener('change', () => put('resolveTitles', resolveCb.checked));
        resolveLabel.append(resolveCb, document.createTextNode('Resolve unavailable video titles (via findyoutubevideo)'));

        const goBtn = document.createElement('button');
        goBtn.type = 'button';
        goBtn.className = 'ytlt-btn primary';
        goBtn.textContent = 'Export';
        goBtn.addEventListener('click', () => runExport(scopeSel.value, fmtSel.value, resolveCb.checked));
        card.append(row1, resolveLabel, goBtn);
        body.append(card);
        return;
      }

      if (currentTab === 'copy') {
        const card = makeCard('Copy liked videos to another playlist');
        const note = document.createElement('p');
        note.className = 'ytlt-note';
        note.textContent = 'Paste a destination playlist URL or ID (for example WL or PL...).';
        const targetInput = document.createElement('input');
        targetInput.type = 'text';
        targetInput.placeholder = 'https://www.youtube.com/playlist?list=PL... or WL';
        targetInput.style.width = '100%';

        const row = document.createElement('div');
        row.className = 'ytlt-row';
        const scopeSel = document.createElement('select');
        for (const [val, txt] of [
          ['filtered', 'Currently filtered'],
          ['all', 'All loaded'],
          ['available', 'Available only'],
          ['shorts', 'Shorts only'],
        ]) {
          const o = document.createElement('option');
          o.value = val;
          o.textContent = txt;
          scopeSel.append(o);
        }
        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'ytlt-btn primary';
        copyBtn.textContent = 'Copy to Playlist';
        copyBtn.addEventListener('click', () => runCopyToPlaylist(targetInput.value, scopeSel.value));
        row.append(scopeSel, copyBtn);
        card.append(note, targetInput, row);
        body.append(card);
      }
    }

    dialog.append(head, tabs, body);
    backdrop.append(dialog);
    document.body.append(backdrop);
    document.addEventListener('keydown', onDialogKey, true);
    renderBody(pendingConfirm);
    tabButtons[0]?.focus();
  }

  // ---------- Mount & Lifecycle ----------

  function unmountAll() {
    clearTimeout(mountTimer);
    document.getElementById(BTN_ID)?.remove();
    document.getElementById(DURATION_ID)?.remove();
    document.getElementById(FILTER_ID)?.remove();
    document.getElementById(EMPTY_ID)?.remove();
    closeDialog();
    if (pageObserver) {
      pageObserver.disconnect();
      pageObserver = null;
    }
  }

  function scheduleMount() {
    clearTimeout(mountTimer);
    mountTimer = setTimeout(() => {
      if (!onLikedPage()) return;
      mountHeaderButton();
      mountFilterBar();
      updateDurationBadge();
    }, 150);
  }

  function syncPage() {
    if (!onLikedPage()) {
      unmountAll();
      return;
    }
    mountHeaderButton();
    mountFilterBar();
    updateDurationBadge();
    if (!pageObserver) {
      pageObserver = new MutationObserver(scheduleMount);
      pageObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('Liked Videos Tools...', () => {
      if (!onLikedPage()) {
        showToast({
          text: 'Open YouTube Liked Videos (/playlist?list=LL) to use Liked Videos Tools.',
          actions: [{ label: 'Close', onClick: clearToast }],
        });
        return;
      }
      openDialog('unlike');
    });
  }

  document.addEventListener('yt-navigate-finish', () => {
    filterState = { query: '', chip: 'all' };
    syncPage();
  });
  window.addEventListener('popstate', syncPage);
  syncPage();
})();

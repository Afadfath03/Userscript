// ==UserScript==
// @name         YouTube: Playlist Tools
// @namespace    https://github.com/Afadfath03/Userscript
// @version      1.4
// @description  Bulk cleanup, search and filter, total duration calculator, export with optional title lookup, and import on YouTube playlist pages
// @author       Afadfath03
// @homepageURL  https://github.com/Afadfath03/Userscript
// @supportURL   https://github.com/Afadfath03/Userscript/issues
// @downloadURL  https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-playlist-tools.user.js
// @updateURL    https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-playlist-tools.user.js
// @icon         https://raw.githubusercontent.com/Afadfath03/Userscript/main/assets/icons/youtube-playlist-tools.png
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

  const PREFIX = 'ytpt';
  const HIDDEN_ATTR = 'data-ytpt-hidden';
  const STYLE_ID = 'ytpt-style';
  const BTN_ID = 'ytpt-open-btn';
  const DURATION_ID = 'ytpt-duration-badge';
  const FILTER_ID = 'ytpt-filter-bar';
  const EMPTY_ID = 'ytpt-filter-empty';
  const BACKDROP_ID = 'ytpt-backdrop';
  const DIALOG_ID = 'ytpt-dialog';
  const TOAST_ID = 'ytpt-toast';
  const RESOLVE_URL = 'https://findyoutubevideo.thetechrobo.ca/api/v4/';
  const RESOLVE_CONCURRENCY = 3;
  const RESOLVE_TIMEOUT_MS = 22000;
  const IMPORT_DELAY_MS = 450;

  const DEFAULTS = {
    clearMode: 'unavailable-only',
    watchedThreshold: 80,
    exportScope: 'unavailable-all',
    exportFormat: 'md',
    resolveTitles: false,
    importSkipExisting: true,
    showFilterBar: true,
    showDuration: true,
  };

  const CLEAR_MODES = [
    ['unavailable-only', 'Clear unavailable only'],
    ['skip-unavailable', 'Skip unavailable'],
    ['skip-deleted', 'Skip deleted'],
    ['skip-private', 'Skip private'],
    ['none', 'Delete all'],
  ];

  const EXPORT_SCOPES = [
    ['unavailable-all', 'Unavailable: All'],
    ['unavailable-deleted', 'Unavailable: Deleted'],
    ['unavailable-private', 'Unavailable: Private'],
    ['available', 'Available'],
    ['all', 'All'],
    ['filtered', 'Filtered'],
  ];

  const get = (key) => {
    const val = GM_getValue(`${PREFIX}.${key}`, DEFAULTS[key]);
    return val === undefined || val === null ? DEFAULTS[key] : val;
  };
  const put = (key, val) => GM_setValue(`${PREFIX}.${key}`, val);

  const onPlaylistPage = () => location.pathname === '/playlist' && currentListId() !== 'LL';
  const currentListId = () => new URLSearchParams(location.search).get('list') || '';
  const isSpecialPlaylist = (id) => !id || id === 'LL' || /^RD/i.test(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const cleanText = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const escapePipe = (s) => cleanText(s).replace(/\|/g, '\\|');

  const DELETED_RE = /^\[(deleted video|video dihapus|geloeschtes video|gelöschtes video|vidéo supprimée|video eliminado|vídeo excluído|削除された動画|삭제된 동영상|已删除的视频|已刪除的影片)\]$/i;
  const PRIVATE_RE = /^\[(private video|video pribadi|privates video|vidéo privée|video privado|vídeo privado|非公開動画|비공개 동영상|私享视频|私人影片)\]$/i;
  const TIME_RE = /^(?:(\d+):)?([0-5]?\d):([0-5]\d)$/;

  const titleCache = new Map();
  let activeTask = null;
  let listObserver = null;
  let mountTimer = 0;
  let lastTrigger = null;
  let menuIds = [];

  const filterState = {
    query: '',
    chip: 'all',
    target: 'both',
  };

  function isHiddenByMembers(row) {
    return row.hasAttribute('data-ytc-off') || row.hasAttribute('data-ytmp-hidden');
  }

  function isFilterActive() {
    return filterState.query.trim().length > 0 || filterState.chip !== 'all';
  }

  function parseDuration(text) {
    const s = cleanText(text);
    if (!s || /live|premiere|upcoming|shorts/i.test(s)) return null;
    const m = TIME_RE.exec(s);
    if (!m) return null;
    const h = m[1] ? Number(m[1]) : 0;
    const min = Number(m[2]);
    const sec = Number(m[3]);
    return h * 3600 + min * 60 + sec;
  }

  function formatDuration(seconds) {
    const total = Math.max(0, Math.round(seconds));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  function extractVideoIdFromHref(href) {
    if (!href) return '';
    if (href.includes('/shorts/')) {
      const part = href.split('/shorts/')[1] || '';
      return part.split(/[?&/]/)[0] || '';
    }
    const m = href.match(/[?&]v=([A-Za-z0-9_-]{6,})/);
    return m ? m[1] : '';
  }

  function extractSetVideoId(data) {
    if (!data || typeof data !== 'object') return '';
    if (typeof data.setVideoId === 'string' && data.setVideoId) return data.setVideoId;
    const items = data.menu?.menuRenderer?.items;
    if (Array.isArray(items)) {
      for (const item of items) {
        const actions = item?.menuServiceItemRenderer?.serviceEndpoint?.playlistEditEndpoint?.actions;
        if (Array.isArray(actions)) {
          for (const act of actions) {
            if (act?.setVideoId) return String(act.setVideoId);
          }
        }
      }
    }
    return '';
  }

  function readRow(row) {
    const data = row.data || row.__data?.data || null;
    const titleEl = row.querySelector('#video-title');
    const thumbLink = row.querySelector('a#thumbnail');
    const channelEl = row.querySelector('#channel-name a, ytd-channel-name a');
    const rawTitle = cleanText(titleEl?.textContent || data?.title?.simpleText || data?.title?.runs?.[0]?.text || '');
    const channel = cleanText(channelEl?.textContent || '');
    const videoId =
      extractVideoIdFromHref(titleEl?.getAttribute('href') || '') ||
      extractVideoIdFromHref(thumbLink?.getAttribute('href') || '') ||
      (typeof data?.videoId === 'string' ? data.videoId : '');
    const setVideoId = extractSetVideoId(data);

    let status = 'other-unavailable';
    const isUnplayable = data && data.isPlayable === false;
    if (!isUnplayable && rawTitle && channel && !DELETED_RE.test(rawTitle) && !PRIVATE_RE.test(rawTitle)) {
      status = 'available';
    } else if (DELETED_RE.test(rawTitle) || (!channel && /^\[.*deleted.*\]$/i.test(rawTitle))) {
      status = 'deleted';
    } else if (PRIVATE_RE.test(rawTitle) || (!channel && /^\[.*private.*\]$/i.test(rawTitle))) {
      status = 'private';
    } else {
      status = 'other-unavailable';
    }

    let durationSec = null;
    const badgeNodes = row.querySelectorAll(
      'ytd-thumbnail-overlay-time-status-renderer, badge-shape, .badge-shape-wiz__text, span.ytd-thumbnail-overlay-time-status-renderer'
    );
    for (const node of badgeNodes) {
      const parsed = parseDuration(node.textContent);
      if (parsed !== null) {
        durationSec = parsed;
        break;
      }
    }

    let watchedPct = 0;
    const progressEl = row.querySelector(
      'ytd-thumbnail-overlay-resume-playback-renderer #progress, yt-thumbnail-overlay-progress-bar-view-model .ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment, .ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment'
    );
    if (progressEl) {
      const w = progressEl.style?.width || progressEl.getAttribute('style') || '';
      const pm = w.match(/width\s*:\s*([\d.]+)%/i) || w.match(/([\d.]+)%/);
      if (pm) watchedPct = Math.min(100, Math.max(0, Math.round(Number(pm[1]))));
    }

    return {
      row,
      status,
      videoId,
      setVideoId,
      title: status === 'available' ? rawTitle : '',
      channel: status === 'available' ? channel : '',
      durationSec,
      watchedPct,
    };
  }

  function isElementHidden(el) {
    for (let cur = el; cur && cur.nodeType === 1; cur = cur.parentElement) {
      if (cur.hasAttribute('hidden')) return true;
      if (getComputedStyle(cur).display === 'none') return true;
    }
    return false;
  }

  function activePlaylistRoot() {
    for (const page of document.querySelectorAll('ytd-browse[page-subtype="playlist"]')) {
      if (!isElementHidden(page)) return page;
    }
    return document;
  }

  function getRows() {
    return [...activePlaylistRoot().querySelectorAll('ytd-playlist-video-renderer')];
  }

  function getAllItems() {
    return getRows().map(readRow);
  }

  function getTotalPlaylistCount() {
    const candidates = activePlaylistRoot().querySelectorAll(
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

  function hasUnavailableHiddenBanner() {
    const banners = document.querySelectorAll(
      'ytd-alert-with-button-renderer, ytd-message-renderer, #alerts, .ytd-playlist-video-list-renderer'
    );
    for (const el of banners) {
      const t = cleanText(el.textContent).toLowerCase();
      if (t.includes('unavailable videos are hidden') || t.includes('video yang tidak tersedia disembunyikan')) {
        return true;
      }
    }
    return false;
  }

  // ---------- InnerTube API helper ----------

  function getYtCfg() {
    const win = typeof unsafeWindow !== 'undefined' && unsafeWindow ? unsafeWindow : window;
    return win.ytcfg || window.ytcfg || null;
  }

  function cfgGet(cfg, key) {
    if (!cfg) return undefined;
    if (typeof cfg.get === 'function') return cfg.get(key);
    return cfg.data_ ? cfg.data_[key] : cfg[key];
  }

  function readCookie(name) {
    const parts = String(document.cookie || '').split(';');
    for (const part of parts) {
      const [k, ...rest] = part.trim().split('=');
      if (k === name) return decodeURIComponent(rest.join('='));
    }
    return '';
  }

  async function buildSapisidHash(sapisid, origin) {
    const ts = Math.floor(Date.now() / 1000);
    const input = `${ts} ${sapisid} ${origin}`;
    const bytes = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-1', bytes);
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `SAPISIDHASH ${ts}_${hex}`;
  }

  async function editPlaylist(playlistId, actions) {
    const cfg = getYtCfg();
    const apiKey = cfgGet(cfg, 'INNERTUBE_API_KEY');
    const context = cfgGet(cfg, 'INNERTUBE_CONTEXT');
    const sapisid = readCookie('SAPISID') || readCookie('__Secure-3PAPISID');
    if (!apiKey || !context || !sapisid) {
      return { ok: false, authError: true, reason: 'missing-auth' };
    }
    const origin = 'https://www.youtube.com';
    const auth = await buildSapisidHash(sapisid, origin);
    const headers = {
      'Content-Type': 'application/json',
      Authorization: auth,
      'X-Origin': origin,
    };
    const sessionIndex = cfgGet(cfg, 'SESSION_INDEX');
    if (sessionIndex !== undefined && sessionIndex !== null && String(sessionIndex) !== '') {
      headers['X-Goog-AuthUser'] = String(sessionIndex);
    }
    const pageId = cfgGet(cfg, 'DELEGATED_SESSION_ID');
    if (pageId) headers['X-Goog-PageId'] = String(pageId);

    const res = await fetch(`/youtubei/v1/browse/edit_playlist?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({ context, playlistId, actions }),
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, authError: true, status: res.status };
    }
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    if (!res.ok) {
      return { ok: false, authError: false, status: res.status, json };
    }
    const status = json?.status || '';
    if (status === 'STATUS_FAILED' || json?.error) {
      const code = json?.error?.code;
      return { ok: false, authError: code === 401 || code === 403, status: code || status, json };
    }
    return { ok: true, json };
  }

  // ---------- Styles ----------

  const CSS = `
#${BTN_ID}{display:inline-flex;align-items:center;justify-content:center;gap:8px;align-self:flex-start;width:auto;min-height:36px;margin-top:10px;padding:0 16px;border:0;border-radius:18px;background:#0f0f0f;color:#fff;font:500 14px/1 Roboto,Arial,sans-serif;cursor:pointer;transition:background .15s}
#${BTN_ID}:hover{background:#272727}
html[dark] #${BTN_ID}{background:#f1f1f1;color:#0f0f0f}
html[dark] #${BTN_ID}:hover{background:#d9d9d9}
#${BTN_ID} svg,#${DURATION_ID} svg,#${FILTER_ID} svg,#${DIALOG_ID} .ytpt-dhead svg{flex:0 0 auto;display:block}
#${BTN_ID}:focus-visible,#${DURATION_ID} button:focus-visible,#${FILTER_ID} button:focus-visible,#${FILTER_ID} input:focus-visible,#${DIALOG_ID} button:focus-visible,#${DIALOG_ID} input:focus-visible,#${DIALOG_ID} select:focus-visible,#${DIALOG_ID} textarea:focus-visible,#${TOAST_ID} button:focus-visible{outline:2px solid #065fd4;outline-offset:2px}
html[dark] #${BTN_ID}:focus-visible,html[dark] #${DURATION_ID} button:focus-visible,html[dark] #${FILTER_ID} button:focus-visible,html[dark] #${FILTER_ID} input:focus-visible,html[dark] #${DIALOG_ID} button:focus-visible,html[dark] #${DIALOG_ID} input:focus-visible,html[dark] #${DIALOG_ID} select:focus-visible,html[dark] #${DIALOG_ID} textarea:focus-visible,html[dark] #${TOAST_ID} button:focus-visible{outline-color:#3ea6ff}
#${DURATION_ID}{display:flex;flex-direction:column;gap:8px;width:100%;box-sizing:border-box;margin:10px 0 4px;padding:12px 14px;border:0;border-radius:12px;background:rgba(0,0,0,.05);color:#0f0f0f;font:400 13px/1.4 Roboto,Arial,sans-serif;font-variant-numeric:tabular-nums}
html[dark] #${DURATION_ID}{background:rgba(255,255,255,.08);color:#f1f1f1}
#${DURATION_ID} .ytpt-dur-top{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
#${DURATION_ID} .ytpt-dur-total{display:inline-flex;align-items:center;gap:6px;font-size:15px;font-weight:600;letter-spacing:-.01em}
#${DURATION_ID} .ytpt-dur-meta{margin-left:auto;font-size:12px;color:#606060}
html[dark] #${DURATION_ID} .ytpt-dur-meta{color:#aaa}
#${DURATION_ID} .ytpt-dur-speeds{display:flex;flex-wrap:wrap;gap:6px}
#${DURATION_ID} .ytpt-dur-pill{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;background:rgba(0,0,0,.05);font-size:12px;color:#0f0f0f}
html[dark] #${DURATION_ID} .ytpt-dur-pill{background:rgba(255,255,255,.08);color:#f1f1f1}
#${DURATION_ID} .ytpt-dur-pill b{font-weight:500;color:#606060}
html[dark] #${DURATION_ID} .ytpt-dur-pill b{color:#aaa}
#${DURATION_ID} button{min-height:28px;padding:0 12px;border:0;border-radius:14px;background:rgba(0,0,0,.08);color:inherit;font:500 12px/1 Roboto,Arial,sans-serif;cursor:pointer;transition:background .15s}
#${DURATION_ID} button:hover{background:rgba(0,0,0,.14)}
html[dark] #${DURATION_ID} button{background:rgba(255,255,255,.14)}
html[dark] #${DURATION_ID} button:hover{background:rgba(255,255,255,.22)}
#${FILTER_ID}{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 10px;padding:4px 24px 8px;border:0;background:transparent;color:#0f0f0f;font:400 13px/1.4 Roboto,Arial,sans-serif;box-sizing:border-box;max-width:100%}
@media (max-width:600px){#${FILTER_ID}{padding:4px 12px 8px}}
html[dark] #${FILTER_ID}{color:#f1f1f1}
#${FILTER_ID} .ytpt-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
#${FILTER_ID} .ytpt-search-wrap{position:relative;display:flex;align-items:center;flex:1 1 200px;min-width:150px;max-width:280px;height:32px;padding:0 10px;border:1px solid rgba(0,0,0,.18);border-radius:8px;background:#fff;box-sizing:border-box;transition:border-color .15s,background .15s,box-shadow .15s}
html[dark] #${FILTER_ID} .ytpt-search-wrap{border-color:rgba(255,255,255,.16);background:#121212}
#${FILTER_ID} .ytpt-search-wrap:focus-within{border-color:#065fd4;box-shadow:0 0 0 1px #065fd4}
html[dark] #${FILTER_ID} .ytpt-search-wrap:focus-within{border-color:#3ea6ff;box-shadow:0 0 0 1px #3ea6ff}
#${FILTER_ID} .ytpt-search-wrap svg{color:#606060;margin-right:8px}
html[dark] #${FILTER_ID} .ytpt-search-wrap svg{color:#aaa}
#${FILTER_ID} input[type="search"]{flex:1;min-width:0;height:100%;border:0;background:transparent;color:inherit;font:inherit;outline:none}
#${FILTER_ID} input[type="search"]:focus-visible{outline:none}
#${FILTER_ID} .ytpt-chips{display:flex;flex-wrap:wrap;gap:6px}
#${FILTER_ID} .ytpt-chip{min-height:32px;padding:0 12px;border:0;border-radius:8px;background:rgba(0,0,0,.05);color:#0f0f0f;font:500 13px/1 Roboto,Arial,sans-serif;cursor:pointer;transition:background .15s,color .15s}
#${FILTER_ID} .ytpt-chip:hover{background:rgba(0,0,0,.1)}
html[dark] #${FILTER_ID} .ytpt-chip{background:rgba(255,255,255,.1);color:#f1f1f1}
html[dark] #${FILTER_ID} .ytpt-chip:hover{background:rgba(255,255,255,.18)}
#${FILTER_ID} .ytpt-chip[aria-pressed="true"]{background:#0f0f0f;color:#fff}
html[dark] #${FILTER_ID} .ytpt-chip[aria-pressed="true"]{background:#f1f1f1;color:#0f0f0f}
#${FILTER_ID} .ytpt-counter{font-size:12px;font-variant-numeric:tabular-nums;color:#606060;margin-left:auto;padding:0 4px}
html[dark] #${FILTER_ID} .ytpt-counter{color:#aaa}
#${FILTER_ID} .ytpt-fbtn{min-height:32px;padding:0 12px;border:0;border-radius:8px;background:rgba(0,0,0,.06);color:inherit;font:500 12px/1 Roboto,Arial,sans-serif;cursor:pointer;transition:background .15s}
#${FILTER_ID} .ytpt-fbtn:hover{background:rgba(0,0,0,.12)}
html[dark] #${FILTER_ID} .ytpt-fbtn{background:rgba(255,255,255,.12)}
html[dark] #${FILTER_ID} .ytpt-fbtn:hover{background:rgba(255,255,255,.2)}
#${FILTER_ID} .ytpt-fbtn:disabled,#${DIALOG_ID} button:disabled,#${TOAST_ID} button:disabled{opacity:.45;cursor:not-allowed}
#${EMPTY_ID}{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:12px;padding:24px 16px;margin:8px 24px;border:0;border-radius:12px;background:rgba(0,0,0,.04);color:#606060;font:400 13px/1.4 Roboto,Arial,sans-serif}
html[dark] #${EMPTY_ID}{background:rgba(255,255,255,.05);color:#aaa}
[${HIDDEN_ATTR}]{display:none!important}
#${BACKDROP_ID}{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.7);padding:16px;box-sizing:border-box}
#${DIALOG_ID},#${DIALOG_ID} *{box-sizing:border-box}
#${DIALOG_ID}{width:100%;max-width:min(520px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow-y:auto;border-radius:16px;background:#fff;color:#0f0f0f;box-shadow:0 20px 48px rgba(0,0,0,.45);font:400 13px/1.45 Roboto,Arial,sans-serif}
html[dark] #${DIALOG_ID}{background:#212121;color:#f1f1f1;border:1px solid rgba(255,255,255,.08)}
#${DIALOG_ID} .ytpt-dhead{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;padding:14px 16px 14px 20px;background:#fff;border-bottom:1px solid rgba(0,0,0,.08)}
html[dark] #${DIALOG_ID} .ytpt-dhead{background:#212121;border-bottom-color:rgba(255,255,255,.1)}
#${DIALOG_ID} .ytpt-dhead h2{flex:1;margin:0;font-size:16px;font-weight:600}
#${DIALOG_ID} .ytpt-close{width:36px;height:36px;border:0;border-radius:50%;background:transparent;color:inherit;font-size:22px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background .15s}
#${DIALOG_ID} .ytpt-close:hover{background:rgba(0,0,0,.06)}
html[dark] #${DIALOG_ID} .ytpt-close:hover{background:rgba(255,255,255,.1)}
#${DIALOG_ID} .ytpt-tabs{display:flex;border-bottom:1px solid rgba(0,0,0,.08);padding:0 16px;gap:4px}
html[dark] #${DIALOG_ID} .ytpt-tabs{border-bottom-color:rgba(255,255,255,.1)}
#${DIALOG_ID} .ytpt-tab{padding:11px 16px;border:0;border-bottom:2px solid transparent;background:transparent;color:#606060;font:500 13px/1 Roboto,Arial,sans-serif;cursor:pointer;transition:color .15s,border-color .15s}
#${DIALOG_ID} .ytpt-tab:hover{color:#0f0f0f}
html[dark] #${DIALOG_ID} .ytpt-tab{color:#aaa}
html[dark] #${DIALOG_ID} .ytpt-tab:hover{color:#f1f1f1}
#${DIALOG_ID} .ytpt-tab[aria-selected="true"]{color:#0f0f0f;border-bottom-color:#065fd4}
html[dark] #${DIALOG_ID} .ytpt-tab[aria-selected="true"]{color:#f1f1f1;border-bottom-color:#3ea6ff}
#${DIALOG_ID} .ytpt-body{padding:16px 20px 20px;display:flex;flex-direction:column;gap:12px}
#${DIALOG_ID} .ytpt-card{padding:14px 16px;border:0;border-radius:12px;background:rgba(0,0,0,.035);display:flex;flex-direction:column;gap:10px}
html[dark] #${DIALOG_ID} .ytpt-card{background:rgba(255,255,255,.05)}
#${DIALOG_ID} .ytpt-card h3{margin:0;font-size:14px;font-weight:600}
#${DIALOG_ID} .ytpt-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
#${DIALOG_ID} label{font-size:12px;font-weight:500;color:#606060}
html[dark] #${DIALOG_ID} label{color:#aaa}
#${DIALOG_ID} select,#${DIALOG_ID} input[type="text"],#${DIALOG_ID} input[type="number"],#${DIALOG_ID} textarea{width:100%;min-height:36px;padding:7px 12px;border:1px solid rgba(0,0,0,.15);border-radius:8px;background:#fff;color:inherit;font:inherit;transition:border-color .15s}
html[dark] #${DIALOG_ID} select,html[dark] #${DIALOG_ID} input[type="text"],html[dark] #${DIALOG_ID} input[type="number"],html[dark] #${DIALOG_ID} textarea{border-color:rgba(255,255,255,.16);background:#121212}
#${DIALOG_ID} textarea{min-height:96px;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;resize:vertical}
#${DIALOG_ID} .ytpt-btn{min-height:36px;padding:0 16px;border:0;border-radius:18px;background:rgba(0,0,0,.07);color:inherit;font:500 13px/1 Roboto,Arial,sans-serif;cursor:pointer;transition:background .15s}
#${DIALOG_ID} .ytpt-btn:hover{background:rgba(0,0,0,.12)}
html[dark] #${DIALOG_ID} .ytpt-btn{background:rgba(255,255,255,.12)}
html[dark] #${DIALOG_ID} .ytpt-btn:hover{background:rgba(255,255,255,.2)}
#${DIALOG_ID} .ytpt-btn.primary{background:#065fd4;color:#fff}
#${DIALOG_ID} .ytpt-btn.primary:hover{background:#0550b5}
html[dark] #${DIALOG_ID} .ytpt-btn.primary{background:#3ea6ff;color:#0f0f0f}
html[dark] #${DIALOG_ID} .ytpt-btn.primary:hover{background:#65b8ff}
#${DIALOG_ID} .ytpt-btn.danger{background:#c00;color:#fff}
#${DIALOG_ID} .ytpt-btn.danger:hover{background:#a30000}
html[dark] #${DIALOG_ID} .ytpt-btn.danger{background:#ff4e45;color:#0f0f0f}
html[dark] #${DIALOG_ID} .ytpt-btn.danger:hover{background:#ff6f68}
#${DIALOG_ID} .ytpt-note{margin:0;font-size:12px;color:#606060}
html[dark] #${DIALOG_ID} .ytpt-note{color:#aaa}
#${DIALOG_ID} .ytpt-warn{display:flex;align-items:flex-start;gap:8px;padding:10px 12px;border-radius:10px;background:rgba(217,119,6,.14);color:#92400e;font-size:12px;line-height:1.45}
html[dark] #${DIALOG_ID} .ytpt-warn{background:rgba(251,191,36,.14);color:#fde68a}
#${DIALOG_ID} .ytpt-confirm-wrap{min-height:220px;display:flex;flex-direction:column;justify-content:center}
#${DIALOG_ID} .ytpt-confirm{padding:20px;border:1px solid rgba(204,0,0,.28);border-radius:14px;background:rgba(204,0,0,.05);display:flex;flex-direction:column;gap:14px}
html[dark] #${DIALOG_ID} .ytpt-confirm{border-color:rgba(255,78,69,.32);background:rgba(255,78,69,.09)}
#${DIALOG_ID} .ytpt-confirm.info{border-color:rgba(6,95,212,.3);background:rgba(6,95,212,.06)}
html[dark] #${DIALOG_ID} .ytpt-confirm.info{border-color:rgba(62,166,255,.35);background:rgba(62,166,255,.1)}
#${DIALOG_ID} .ytpt-confirm-head{display:flex;align-items:center;gap:10px}
#${DIALOG_ID} .ytpt-confirm-ico{width:32px;height:32px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;flex:0 0 32px;background:rgba(204,0,0,.12);color:#c00}
html[dark] #${DIALOG_ID} .ytpt-confirm-ico{background:rgba(255,78,69,.18);color:#ff6f68}
#${DIALOG_ID} .ytpt-confirm.info .ytpt-confirm-ico{background:rgba(6,95,212,.12);color:#065fd4}
html[dark] #${DIALOG_ID} .ytpt-confirm.info .ytpt-confirm-ico{background:rgba(62,166,255,.18);color:#3ea6ff}
#${DIALOG_ID} .ytpt-confirm-title{font-size:15px;font-weight:600;color:inherit}
#${DIALOG_ID} .ytpt-confirm-msg{margin:0;font-size:13px;line-height:1.5;color:inherit}
#${DIALOG_ID} .ytpt-confirm-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;padding-top:2px}
#${TOAST_ID}{position:fixed;right:24px;bottom:24px;left:auto;z-index:2147483647;max-width:calc(100vw - 32px);min-width:280px;padding:14px 16px;border-radius:14px;background:#fff;color:#0f0f0f;box-shadow:0 12px 32px rgba(0,0,0,.22);border:1px solid rgba(0,0,0,.08);font:400 13px/1.4 Roboto,Arial,sans-serif;font-variant-numeric:tabular-nums;display:flex;flex-direction:column;gap:10px;box-sizing:border-box}
html[dark] #${TOAST_ID}{background:#282828;color:#f1f1f1;box-shadow:0 12px 32px rgba(0,0,0,.55);border-color:rgba(255,255,255,.1)}
#${TOAST_ID} .ytpt-trow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
#${TOAST_ID} .ytpt-spin{width:14px;height:14px;border:2px solid rgba(128,128,128,.3);border-top-color:#065fd4;border-radius:50%;animation:ytpt-rot .8s linear infinite}
html[dark] #${TOAST_ID} .ytpt-spin{border-top-color:#3ea6ff}
#${TOAST_ID} .ytpt-bar{width:100%;height:4px;border-radius:999px;background:rgba(0,0,0,.1);overflow:hidden}
html[dark] #${TOAST_ID} .ytpt-bar{background:rgba(255,255,255,.14)}
#${TOAST_ID} .ytpt-bar > span{display:block;height:100%;border-radius:999px;background:#065fd4;transition:width .18s ease}
html[dark] #${TOAST_ID} .ytpt-bar > span{background:#3ea6ff}
#${TOAST_ID} button{min-height:32px;padding:0 14px;border:0;border-radius:16px;background:rgba(0,0,0,.07);color:inherit;font:500 12px/1 Roboto,Arial,sans-serif;cursor:pointer;transition:background .15s}
#${TOAST_ID} button:hover{background:rgba(0,0,0,.13)}
html[dark] #${TOAST_ID} button{background:rgba(255,255,255,.12)}
html[dark] #${TOAST_ID} button:hover{background:rgba(255,255,255,.22)}
@keyframes ytpt-rot{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){#${TOAST_ID} .ytpt-spin{animation:none;display:none}#${TOAST_ID} .ytpt-bar > span,#${BTN_ID},#${FILTER_ID} .ytpt-chip,#${DIALOG_ID} .ytpt-btn{transition:none}}
`;

  function makeSvgIcon(pathD, size = 16) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', pathD);
    svg.append(path);
    return svg;
  }

  const ICON_TOOLS = 'M4 6h16M4 12h10M4 18h7m7-4 2 2 4-4';
  const ICON_CLOCK = 'M12 6v6l4 2m6-2a10 10 0 1 1-20 0 10 10 0 0 1 20 0z';
  const ICON_SEARCH = 'M21 21l-4.35-4.35M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z';
  const ICON_ALERT = 'M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z';

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.append(style);
  }

  // ---------- Floating Toast ----------

  function clearToast() {
    document.getElementById(TOAST_ID)?.remove();
  }

  function showToast({ text, spinner = false, progress = null, actions = [] }) {
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

    const head = document.createElement('div');
    head.className = 'ytpt-trow';
    if (spinner) {
      const spin = document.createElement('span');
      spin.className = 'ytpt-spin';
      spin.setAttribute('aria-hidden', 'true');
      head.append(spin);
    }
    const msg = document.createElement('span');
    msg.textContent = text;
    head.append(msg);
    toast.append(head);

    if (typeof progress === 'number') {
      const bar = document.createElement('div');
      bar.className = 'ytpt-bar';
      const fill = document.createElement('span');
      fill.style.width = `${Math.max(0, Math.min(100, progress))}%`;
      bar.append(fill);
      toast.append(bar);
    }

    if (actions.length) {
      const row = document.createElement('div');
      row.className = 'ytpt-trow';
      for (const act of actions) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = act.label;
        btn.addEventListener('click', act.onClick);
        row.append(btn);
      }
      toast.append(row);
    }
  }

  function setBusy(busy) {
    for (const btn of document.querySelectorAll(`#${DIALOG_ID} button, #${FILTER_ID} .ytpt-fbtn, #${DURATION_ID} button`)) {
      if (btn.classList.contains('ytpt-close') || btn.classList.contains('ytpt-tab')) continue;
      btn.disabled = busy;
    }
  }

  function beginTask(name) {
    if (activeTask) return null;
    const task = { name, stopped: false, cancelled: false, finishNow: false };
    activeTask = task;
    setBusy(true);
    return task;
  }

  function endTask(task) {
    if (activeTask === task) activeTask = null;
    setBusy(false);
  }

  function cancelActiveTask() {
    if (!activeTask) return;
    activeTask.cancelled = true;
    activeTask.stopped = true;
    activeTask = null;
    setBusy(false);
    clearToast();
  }

  // ---------- Auto-scroll loader ----------

  async function autoScrollPlaylist(task) {
    let lastCount = getRows().length;
    let stableRounds = 0;
    const updateToast = () => {
      const count = getRows().length;
      showToast({
        text: `Loading items... (${count} loaded)`,
        spinner: true,
        actions: [
          { label: 'Finish Now', onClick: () => { task.finishNow = true; } },
          { label: 'Cancel', onClick: () => { task.cancelled = true; } },
        ],
      });
    };
    updateToast();

    while (!task.cancelled && !task.finishNow) {
      const total = getTotalPlaylistCount();
      if (total && lastCount >= total) break;
      const continuation = document.querySelector('ytd-playlist-video-list-renderer ytd-continuation-item-renderer');
      if (!continuation && stableRounds >= 1) break;
      window.scrollTo(0, document.documentElement.scrollHeight);
      if (continuation) continuation.scrollIntoView({ block: 'end' });
      await sleep(350);
      if (task.cancelled || task.finishNow) break;
      const nowCount = getRows().length;
      if (nowCount > lastCount) {
        lastCount = nowCount;
        stableRounds = 0;
        updateToast();
      } else {
        stableRounds++;
        if (stableRounds >= 2) break;
      }
    }
    updateDurationBadge();
    applyFilter();
    return !task.cancelled;
  }

  // ---------- Removal Engine ----------

  async function removeViaDomFallback(row) {
    const menuBtn = row.querySelector('ytd-menu-renderer button, #menu button');
    if (!menuBtn) return { ok: false, readOnly: true };
    menuBtn.click();
    let popup = null;
    for (let i = 0; i < 15; i++) {
      popup = document.querySelector('ytd-menu-popup-renderer');
      if (popup && popup.querySelectorAll('ytd-menu-service-item-renderer').length) break;
      await sleep(50);
    }
    if (!popup) return { ok: false, readOnly: true };
    const items = [...popup.querySelectorAll('ytd-menu-service-item-renderer')];
    let target = items.find((el) => {
      const d = el.data || el.__data?.data;
      const acts = d?.serviceEndpoint?.playlistEditEndpoint?.actions;
      return Array.isArray(acts) && acts.some((a) => String(a?.action || '').includes('REMOVE_VIDEO'));
    });
    if (!target) {
      target = items.find((el) => /remove from|hapus dari/i.test(cleanText(el.textContent)));
    }
    if (!target) {
      document.body.click();
      return { ok: false, readOnly: true };
    }
    target.click();
    for (let i = 0; i < 30; i++) {
      if (!row.isConnected) return { ok: true };
      await sleep(100);
    }
    return { ok: !row.isConnected, readOnly: false };
  }

  async function removeSingleItem(item, listId, requireSetVideoId) {
    const cfg = getYtCfg();
    const sapisid = readCookie('SAPISID') || readCookie('__Secure-3PAPISID');
    const canApi = !!cfg && !!cfgGet(cfg, 'INNERTUBE_API_KEY') && !!cfgGet(cfg, 'INNERTUBE_CONTEXT') && !!sapisid;

    if (canApi) {
      let action = null;
      if (item.setVideoId) {
        action = { action: 'ACTION_REMOVE_VIDEO', setVideoId: item.setVideoId };
      } else if (!requireSetVideoId && item.videoId) {
        action = { action: 'ACTION_REMOVE_VIDEO_BY_VIDEO_ID', removedVideoId: item.videoId };
      }
      if (action) {
        const res = await editPlaylist(listId, [action]);
        if (res.ok) {
          item.row.remove();
          return { ok: true };
        }
        if (res.authError) return { ok: false, readOnly: true };
      }
    }
    return removeViaDomFallback(item.row);
  }

  async function runRemoval(targets, skippedCount, { requireSetVideoId = false } = {}) {
    const listId = currentListId();
    if (isSpecialPlaylist(listId)) {
      showToast({
        text: 'This playlist cannot be modified.',
        actions: [{ label: 'Close', onClick: clearToast }],
      });
      return;
    }
    if (!targets.length) {
      showToast({
        text: 'No matching videos to remove.',
        actions: [{ label: 'Close', onClick: clearToast }],
      });
      return;
    }
    const task = beginTask('remove');
    if (!task) return;

    let removed = 0;
    let skipped = skippedCount;
    let readOnly = false;
    const total = targets.length;

    for (let i = 0; i < total; i++) {
      if (task.stopped || task.cancelled) break;
      const item = targets[i];
      showToast({
        text: `Removing ${i + 1} / ${total} (Skipped: ${skipped})`,
        progress: Math.round(((i + 1) / total) * 100),
        actions: [{ label: 'Stop', onClick: () => { task.stopped = true; } }],
      });
      if (!item.row.isConnected) {
        skipped++;
        continue;
      }
      const res = await removeSingleItem(item, listId, requireSetVideoId);
      if (res.ok) {
        removed++;
      } else if (res.readOnly) {
        readOnly = true;
        break;
      } else {
        skipped++;
      }
      if (!task.stopped && i + 1 < total) await sleep(120);
    }

    const wasCancelled = task.cancelled;
    endTask(task);
    updateDurationBadge();
    applyFilter();
    if (wasCancelled) return;
    if (readOnly) {
      showToast({
        text: 'Remove action is not available on this playlist (read-only).',
        actions: [{ label: 'Close', onClick: clearToast }],
      });
      return;
    }
    showToast({
      text: `Done: ${removed} removed, ${skipped} skipped`,
      actions: [{ label: 'Close', onClick: clearToast }],
    });
  }

  function selectClearTargets(items, mode) {
    const targets = [];
    let skipped = 0;
    for (const it of items) {
      let remove = false;
      if (mode === 'unavailable-only') remove = it.status !== 'available';
      else if (mode === 'skip-unavailable') remove = it.status === 'available';
      else if (mode === 'skip-deleted') remove = it.status !== 'deleted';
      else if (mode === 'skip-private') remove = it.status !== 'private';
      else if (mode === 'none') remove = true;
      if (remove) targets.push(it);
      else skipped++;
    }
    return { targets, skipped };
  }

  function selectDuplicateTargets(items, keepMode) {
    const groups = new Map();
    for (const it of items) {
      if (!it.videoId) continue;
      if (!groups.has(it.videoId)) groups.set(it.videoId, []);
      groups.get(it.videoId).push(it);
    }
    const targets = [];
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      if (keepMode === 'last') {
        for (let i = 0; i < list.length - 1; i++) targets.push(list[i]);
      } else {
        for (let i = 1; i < list.length; i++) targets.push(list[i]);
      }
    }
    return targets;
  }

  function matchKeywordItem(item, query, target) {
    const q = query.trim().toLowerCase();
    if (!q) return false;
    if (item.status !== 'available') return false;
    const t = item.title.toLowerCase();
    const c = item.channel.toLowerCase();
    if (target === 'title') return t.includes(q);
    if (target === 'channel') return c.includes(q);
    return t.includes(q) || c.includes(q);
  }

  // ---------- Export & Auto-Resolve ----------

  function extractTitleFromApiPayload(data) {
    if (!data || typeof data !== 'object') return '';
    if (typeof data.title === 'string' && cleanText(data.title)) return cleanText(data.title);
    if (Array.isArray(data.keys)) {
      for (const entry of data.keys) {
        const t =
          entry?.title ||
          entry?.rawdata?.title ||
          entry?.rawdata?.videoDetails?.title ||
          entry?.meta?.title ||
          '';
        if (typeof t === 'string' && cleanText(t)) return cleanText(t);
      }
    }
    if (data.rawdata && typeof data.rawdata.title === 'string' && cleanText(data.rawdata.title)) {
      return cleanText(data.rawdata.title);
    }
    return '';
  }

  function gmGetJson(url) {
    return new Promise((resolve) => {
      if (typeof GM_xmlhttpRequest !== 'function') {
        resolve({ status: 0, data: null });
        return;
      }
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        timeout: RESOLVE_TIMEOUT_MS,
        onload: (res) => {
          let data = null;
          try {
            data = JSON.parse(res.responseText || 'null');
          } catch {
            data = null;
          }
          resolve({ status: res.status, data });
        },
        onerror: () => resolve({ status: 0, data: null }),
        ontimeout: () => resolve({ status: 0, data: null }),
      });
    });
  }

  async function resolveUnavailableTitle(videoId) {
    if (titleCache.has(videoId)) return titleCache.get(videoId);
    const url = `${RESOLVE_URL}${encodeURIComponent(videoId)}?includeRaw=true`;
    let res = await gmGetJson(url);
    if (res.status === 429) {
      await sleep(1200);
      res = await gmGetJson(url);
    }
    const title = res.status >= 200 && res.status < 300 ? extractTitleFromApiPayload(res.data) : '';
    titleCache.set(videoId, title);
    return title;
  }

  function filterItemsByScope(items, scope) {
    if (scope === 'unavailable-all') return items.filter((i) => i.status !== 'available');
    if (scope === 'unavailable-deleted') return items.filter((i) => i.status === 'deleted');
    if (scope === 'unavailable-private') return items.filter((i) => i.status === 'private');
    if (scope === 'available') return items.filter((i) => i.status === 'available');
    if (scope === 'filtered') {
      return items.filter((i) => !i.row.hasAttribute(HIDDEN_ATTR) && !isHiddenByMembers(i.row));
    }
    return items;
  }

  function buildExportContent(items, scope, format, resolvedTitles, withTitles) {
    const listId = currentListId() || 'playlist';
    const date = new Date().toISOString().slice(0, 10);
    const ext = format === 'txt' ? 'txt' : 'md';
    const filename = `youtube-playlist-${scope}-${listId}-${date}.${ext}`;

    if (format === 'txt') {
      const lines = items
        .filter((i) => i.videoId)
        .map((i) => `https://www.youtube.com/watch?v=${i.videoId}`);
      return { filename, content: lines.join('\n') };
    }

    const groups = {
      available: items.filter((i) => i.status === 'available'),
      deleted: items.filter((i) => i.status === 'deleted'),
      private: items.filter((i) => i.status === 'private'),
      'other-unavailable': items.filter((i) => i.status === 'other-unavailable'),
    };
    const out = [
      `# YouTube Playlist Export (${listId})`,
      '',
      `- Date: ${date}`,
      `- Scope: ${scope}`,
      `- Total: ${items.length} (Available: ${groups.available.length}, Deleted: ${groups.deleted.length}, Private: ${groups.private.length}, Other unavailable: ${groups['other-unavailable'].length})`,
      '',
    ];

    if (groups.available.length) {
      out.push('## Available', '', '| # | Video ID | Title | Channel | YouTube |', '| --- | --- | --- | --- | --- |');
      groups.available.forEach((it, idx) => {
        const url = `https://www.youtube.com/watch?v=${it.videoId}`;
        out.push(`| ${idx + 1} | \`${it.videoId}\` | ${escapePipe(it.title)} | ${escapePipe(it.channel)} | [Link](${url}) |`);
      });
      out.push('');
    }

    const unavailSections = [
      ['Deleted', groups.deleted],
      ['Private', groups.private],
      ['Other Unavailable', groups['other-unavailable']],
    ];
    for (const [heading, list] of unavailSections) {
      if (!list.length) continue;
      out.push(`## ${heading}`, '');
      if (withTitles) {
        out.push('| # | Video ID | Title | YouTube | Wayback Machine |', '| --- | --- | --- | --- | --- |');
      } else {
        out.push('| # | Video ID | YouTube | Wayback Machine |', '| --- | --- | --- | --- |');
      }
      list.forEach((it, idx) => {
        const yt = `https://www.youtube.com/watch?v=${it.videoId}`;
        const wb = `https://web.archive.org/web/*/${yt}`;
        if (withTitles) {
          const found = resolvedTitles.get(it.videoId);
          const titleCell = found ? escapePipe(found) : '*(not found)*';
          out.push(`| ${idx + 1} | \`${it.videoId}\` | ${titleCell} | [Link](${yt}) | [Archive](${wb}) |`);
        } else {
          out.push(`| ${idx + 1} | \`${it.videoId}\` | [Link](${yt}) | [Archive](${wb}) |`);
        }
      });
      out.push('');
    }

    return { filename, content: out.join('\n') };
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
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
    return false;
  }

  async function runExport(scope, format, resolveTitles) {
    const task = beginTask('export');
    if (!task) return;

    if (scope !== 'filtered') {
      const ok = await autoScrollPlaylist(task);
      if (!ok) {
        endTask(task);
        clearToast();
        return;
      }
    }
    task.finishNow = false;

    const items = filterItemsByScope(getAllItems(), scope);
    if (!items.length) {
      endTask(task);
      showToast({
        text: 'No items match the selected export scope.',
        actions: [{ label: 'Close', onClick: clearToast }],
      });
      return;
    }

    const unavailableItems = items.filter((i) => i.status !== 'available' && i.videoId);
    const shouldResolve = resolveTitles && format === 'md' && unavailableItems.length > 0;
    const resolvedTitles = new Map();
    let foundCount = 0;

    if (shouldResolve) {
      let done = 0;
      const total = unavailableItems.length;
      const queue = [...unavailableItems];
      const updateResolveToast = () => {
        showToast({
          text: `Resolving titles ${done} / ${total} (Found: ${foundCount})`,
          progress: Math.round((done / total) * 100),
          actions: [
            { label: 'Finish Now', onClick: () => { task.finishNow = true; } },
            { label: 'Cancel', onClick: () => { task.cancelled = true; } },
          ],
        });
      };
      updateResolveToast();

      const worker = async () => {
        while (queue.length && !task.cancelled && !task.finishNow) {
          const item = queue.shift();
          const title = await resolveUnavailableTitle(item.videoId);
          if (title) {
            resolvedTitles.set(item.videoId, title);
            foundCount++;
          } else {
            resolvedTitles.set(item.videoId, '');
          }
          done++;
          if (!task.cancelled) updateResolveToast();
        }
      };

      const workers = [];
      for (let i = 0; i < Math.min(RESOLVE_CONCURRENCY, total); i++) workers.push(worker());
      await Promise.all(workers);

      if (task.cancelled) {
        endTask(task);
        clearToast();
        return;
      }
    }

    const { filename, content } = buildExportContent(items, scope, format, resolvedTitles, shouldResolve);
    const mime = format === 'txt' ? 'text/plain;charset=utf-8' : 'text/markdown;charset=utf-8';
    endTask(task);

    const summary = shouldResolve
      ? `Ready: ${items.length} items (${foundCount} titles resolved)`
      : `Ready: ${items.length} items`;

    const showReadyToast = (note = '') => {
      showToast({
        text: note ? `${summary} - ${note}` : summary,
        actions: [
          { label: 'Download', onClick: () => downloadText(filename, content, mime) },
          {
            label: 'Copy to Clipboard',
            onClick: async () => {
              try {
                const ok = await copyText(content);
                showReadyToast(ok ? 'Copied' : 'Clipboard failed; use Download');
              } catch {
                showReadyToast('Clipboard failed; use Download');
              }
            },
          },
          { label: 'Close', onClick: clearToast },
        ],
      });
    };
    showReadyToast();
  }

  // ---------- Import ----------

  function extractVideoIdsFromText(text) {
    const ids = [];
    const seen = new Set();
    const add = (id) => {
      if (/^[A-Za-z0-9_-]{11}$/.test(id) && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    };
    const lines = String(text || '').split(/\r?\n/);
    for (const line of lines) {
      let matched = false;
      for (const m of line.matchAll(/(?:youtube\.com\/watch\?(?:[^\s)|]*&)?v=|youtu\.be\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/gi)) {
        add(m[1]);
        matched = true;
      }
      for (const m of line.matchAll(/`([A-Za-z0-9_-]{11})`/g)) {
        add(m[1]);
        matched = true;
      }
      if (!matched) {
        const bare = line.trim();
        if (/^[A-Za-z0-9_-]{11}$/.test(bare)) add(bare);
      }
    }
    return ids;
  }

  async function runImport(ids, skipExisting) {
    const listId = currentListId();
    if (isSpecialPlaylist(listId)) {
      showToast({
        text: 'Import is not supported on this playlist.',
        actions: [{ label: 'Close', onClick: clearToast }],
      });
      return;
    }
    if (!ids.length) {
      showToast({
        text: 'No valid video IDs to import.',
        actions: [{ label: 'Close', onClick: clearToast }],
      });
      return;
    }

    const task = beginTask('import');
    if (!task) return;

    let partialDedupe = false;
    if (skipExisting) {
      const totalKnown = getTotalPlaylistCount();
      if (totalKnown && getRows().length < totalKnown) {
        const ok = await autoScrollPlaylist(task);
        if (!ok) {
          endTask(task);
          clearToast();
          return;
        }
        if (task.finishNow) partialDedupe = true;
        task.finishNow = false;
      }
    }

    const existing = new Set(getAllItems().map((i) => i.videoId).filter(Boolean));
    const queue = [];
    let skipped = 0;
    for (const id of ids) {
      if (skipExisting && existing.has(id)) skipped++;
      else queue.push(id);
    }

    let added = 0;
    const failed = [];
    let authBlocked = false;

    for (let i = 0; i < queue.length; i++) {
      if (task.stopped || task.cancelled) break;
      const videoId = queue[i];
      showToast({
        text: `Importing ${i + 1} / ${queue.length} (Added: ${added}, Failed: ${failed.length})`,
        progress: Math.round(((i + 1) / queue.length) * 100),
        actions: [{ label: 'Stop', onClick: () => { task.stopped = true; } }],
      });
      const res = await editPlaylist(listId, [{ action: 'ACTION_ADD_VIDEO', addedVideoId: videoId }]);
      if (res.ok) {
        added++;
      } else if (res.authError) {
        authBlocked = true;
        break;
      } else {
        failed.push(videoId);
      }
      if (!task.stopped && i + 1 < queue.length) await sleep(IMPORT_DELAY_MS);
    }

    const wasCancelled = task.cancelled;
    endTask(task);
    if (wasCancelled) return;

    if (authBlocked) {
      showToast({
        text: 'Import failed: playlist is read-only or you are not signed in.',
        actions: [{ label: 'Close', onClick: clearToast }],
      });
      return;
    }

    const note = partialDedupe ? ' (deduped against loaded items only)' : '';
    const actions = [];
    if (failed.length) {
      actions.push({
        label: 'Copy Failed IDs',
        onClick: async () => {
          try {
            await copyText(failed.join('\n'));
          } catch {
            // ignore clipboard failure
          }
        },
      });
    }
    actions.push({ label: 'Reload Page', onClick: () => location.reload() });
    actions.push({ label: 'Close', onClick: clearToast });

    showToast({
      text: `Done: ${added} added, ${skipped} skipped, ${failed.length} failed${note}`,
      actions,
    });
  }

  // ---------- F5: Search & Filter ----------

  function applyFilter() {
    const items = getAllItems();
    const q = filterState.query.trim().toLowerCase();
    const active = isFilterActive();
    let visible = 0;
    let totalVisiblePool = 0;

    for (const it of items) {
      if (isHiddenByMembers(it.row)) continue;
      totalVisiblePool++;
      let match = true;
      if (filterState.chip === 'unwatched') match = it.status === 'available' && it.watchedPct < get('watchedThreshold');
      else if (filterState.chip === 'watched') match = it.status === 'available' && it.watchedPct >= get('watchedThreshold');
      else if (filterState.chip === 'unavailable') match = it.status !== 'available';

      if (match && q) {
        if (it.status !== 'available') match = false;
        else if (filterState.target === 'title') match = it.title.toLowerCase().includes(q);
        else if (filterState.target === 'channel') match = it.channel.toLowerCase().includes(q);
        else match = it.title.toLowerCase().includes(q) || it.channel.toLowerCase().includes(q);
      }

      if (match) {
        it.row.removeAttribute(HIDDEN_ATTR);
        visible++;
      } else {
        it.row.setAttribute(HIDDEN_ATTR, '1');
      }
    }

    const bar = document.getElementById(FILTER_ID);
    if (bar) {
      const counter = bar.querySelector('.ytpt-counter');
      if (counter) counter.textContent = `Showing ${visible} / ${totalVisiblePool}`;
      const exportBtn = bar.querySelector('[data-act="export-filtered"]');
      const removeBtn = bar.querySelector('[data-act="remove-filtered"]');
      const resetBtn = bar.querySelector('[data-act="reset-filter"]');
      if (exportBtn) exportBtn.style.display = active ? '' : 'none';
      if (removeBtn) removeBtn.style.display = active ? '' : 'none';
      if (resetBtn) resetBtn.style.display = active ? '' : 'none';
    }

    let empty = document.getElementById(EMPTY_ID);
    if (active && totalVisiblePool > 0 && visible === 0) {
      if (!empty && bar) {
        empty = document.createElement('div');
        empty.id = EMPTY_ID;
        const msg = document.createElement('span');
        msg.textContent = 'No videos match the current filter';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ytpt-fbtn';
        btn.textContent = 'Reset';
        btn.addEventListener('click', resetFilter);
        empty.append(msg, btn);
        bar.after(empty);
      }
    } else if (empty) {
      empty.remove();
    }

    updateDurationBadge();
  }

  function resetFilter() {
    filterState.query = '';
    filterState.chip = 'all';
    filterState.target = 'both';
    const bar = document.getElementById(FILTER_ID);
    if (bar) {
      const input = bar.querySelector('input[type="search"]');
      if (input) input.value = '';
      for (const chip of bar.querySelectorAll('.ytpt-chip')) {
        chip.setAttribute('aria-pressed', String(chip.dataset.chip === 'all'));
      }
    }
    applyFilter();
  }

  function mountFilterBar() {
    const existing = document.getElementById(FILTER_ID);
    if (!get('showFilterBar')) {
      existing?.remove();
      document.getElementById(EMPTY_ID)?.remove();
      for (const row of getRows()) row.removeAttribute(HIDDEN_ATTR);
      return;
    }
    const root = activePlaylistRoot();
    const listRoot =
      root.querySelector('ytd-playlist-video-list-renderer #contents') ||
      root.querySelector('ytd-playlist-video-list-renderer');
    if (!listRoot) return;
    if (existing && existing.isConnected) {
      if (existing.parentElement !== listRoot.parentElement) listRoot.before(existing);
      return;
    }

    ensureStyle();
    const bar = document.createElement('div');
    bar.id = FILTER_ID;

    const searchLabel = document.createElement('label');
    searchLabel.className = 'ytpt-sr';
    searchLabel.setAttribute('for', 'ytpt-filter-input');
    searchLabel.textContent = 'Filter playlist';
    const searchWrap = document.createElement('div');
    searchWrap.className = 'ytpt-search-wrap';
    const input = document.createElement('input');
    input.id = 'ytpt-filter-input';
    input.type = 'search';
    input.placeholder = 'Search title or channel...';
    input.value = filterState.query;
    input.addEventListener('input', () => {
      filterState.query = input.value;
      filterState.target = 'both';
      applyFilter();
    });
    searchWrap.append(makeSvgIcon(ICON_SEARCH, 15), input);

    const chips = document.createElement('div');
    chips.className = 'ytpt-chips';
    for (const [id, label] of [
      ['all', 'All'],
      ['unwatched', 'Unwatched'],
      ['watched', 'Watched'],
      ['unavailable', 'Unavailable'],
    ]) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'ytpt-chip';
      chip.dataset.chip = id;
      chip.textContent = label;
      chip.setAttribute('aria-pressed', String(filterState.chip === id));
      chip.addEventListener('click', () => {
        filterState.chip = id;
        for (const c of chips.querySelectorAll('.ytpt-chip')) {
          c.setAttribute('aria-pressed', String(c.dataset.chip === id));
        }
        applyFilter();
      });
      chips.append(chip);
    }

    const counter = document.createElement('span');
    counter.className = 'ytpt-counter';

    const expBtn = document.createElement('button');
    expBtn.type = 'button';
    expBtn.className = 'ytpt-fbtn';
    expBtn.dataset.act = 'export-filtered';
    expBtn.textContent = 'Export Filtered';
    expBtn.addEventListener('click', () => {
      runExport('filtered', get('exportFormat'), get('resolveTitles'));
    });

    const remBtn = document.createElement('button');
    remBtn.type = 'button';
    remBtn.className = 'ytpt-fbtn';
    remBtn.dataset.act = 'remove-filtered';
    remBtn.textContent = 'Remove Filtered';
    remBtn.addEventListener('click', () => {
      const targets = getAllItems().filter((i) => !i.row.hasAttribute(HIDDEN_ATTR) && !isHiddenByMembers(i.row));
      openDialog('cleanup', {
        title: 'Remove Filtered',
        summary: `Remove ${targets.length} currently visible filtered video(s)?`,
        onConfirm: () => runRemoval(targets, getAllItems().length - targets.length),
      });
    });

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'ytpt-fbtn';
    resetBtn.dataset.act = 'reset-filter';
    resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('click', resetFilter);

    bar.append(searchLabel, searchWrap, chips, counter, expBtn, remBtn, resetBtn);
    listRoot.before(bar);
    applyFilter();
  }

  // ---------- F6: Total Duration Calculator ----------

  function computeDurationSummary(items) {
    let totalSec = 0;
    let timedCount = 0;
    for (const it of items) {
      if (typeof it.durationSec === 'number') {
        totalSec += it.durationSec;
        timedCount++;
      }
    }
    return { totalSec, timedCount, count: items.length };
  }

  function findHeaderAnchor() {
    const root = activePlaylistRoot();
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
    const totalCount = getTotalPlaylistCount();
    const active = isFilterActive();
    const visibleItems = active
      ? all.filter((i) => !i.row.hasAttribute(HIDDEN_ATTR) && !isHiddenByMembers(i.row))
      : all;
    const shownSum = active ? computeDurationSummary(visibleItems) : totalSum;

    badge.textContent = '';
    const top = document.createElement('div');
    top.className = 'ytpt-dur-top';
    const main = document.createElement('span');
    main.className = 'ytpt-dur-total';
    const s = shownSum.totalSec;
    const totalLabel = document.createElement('span');
    totalLabel.textContent = active
      ? `Filtered: ${formatDuration(s)} (of ${formatDuration(totalSum.totalSec)})`
      : formatDuration(s);
    main.append(makeSvgIcon(ICON_CLOCK, 15), totalLabel);

    const meta = document.createElement('span');
    meta.className = 'ytpt-dur-meta';
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
        await autoScrollPlaylist(task);
        endTask(task);
        clearToast();
      });
      top.append(loadBtn);
    }

    const speedsRow = document.createElement('div');
    speedsRow.className = 'ytpt-dur-speeds';
    for (const rate of [1.25, 1.5, 2]) {
      const pill = document.createElement('span');
      pill.className = 'ytpt-dur-pill';
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
    btn.append(makeSvgIcon(ICON_TOOLS, 16), document.createTextNode('Playlist Tools'));
    btn.addEventListener('click', () => openDialog('cleanup'));
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

  function openDialog(initialTab = 'cleanup', pendingConfirm = null) {
    if (document.getElementById(BACKDROP_ID)) closeDialog();
    lastTrigger = document.activeElement;
    ensureStyle();

    let activeTab = initialTab;
    let confirmState = pendingConfirm;
    let kwQuery = '';
    let kwTarget = 'both';
    let dupKeep = 'first';
    let importText = '';

    const backdrop = document.createElement('div');
    backdrop.id = BACKDROP_ID;
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) closeDialog();
    });

    const dialog = document.createElement('div');
    dialog.id = DIALOG_ID;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Playlist Tools');

    const head = document.createElement('div');
    head.className = 'ytpt-dhead';
    const title = document.createElement('h2');
    title.textContent = 'Playlist Tools';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'ytpt-close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '\u00d7';
    closeBtn.addEventListener('click', closeDialog);
    head.append(title, closeBtn);

    const tablist = document.createElement('div');
    tablist.className = 'ytpt-tabs';
    tablist.setAttribute('role', 'tablist');
    const tabDefs = [
      ['cleanup', 'Cleanup'],
      ['export', 'Export'],
      ['import', 'Import'],
    ];
    const tabBtns = [];
    for (const [id, label] of tabDefs) {
      const t = document.createElement('button');
      t.type = 'button';
      t.className = 'ytpt-tab';
      t.setAttribute('role', 'tab');
      t.dataset.tab = id;
      t.textContent = label;
      t.addEventListener('click', () => {
        activeTab = id;
        confirmState = null;
        renderBody();
      });
      t.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const idx = tabDefs.findIndex(([tid]) => tid === activeTab);
        const next = (idx + (e.key === 'ArrowRight' ? 1 : -1) + tabDefs.length) % tabDefs.length;
        activeTab = tabDefs[next][0];
        confirmState = null;
        renderBody();
        tabBtns[next].focus();
      });
      tabBtns.push(t);
      tablist.append(t);
    }

    const body = document.createElement('div');
    body.className = 'ytpt-body';
    dialog.append(head, tablist, body);
    backdrop.append(dialog);
    document.body.append(backdrop);
    document.addEventListener('keydown', onDialogKey, true);

    function loadedNote(items) {
      const total = getTotalPlaylistCount();
      return total && items.length < total ? ` (of ${items.length} loaded items)` : '';
    }

    function renderConfirmBox() {
      if (!confirmState) return null;
      const isInfo = confirmState.tone === 'info';
      const box = document.createElement('div');
      box.className = `ytpt-confirm${isInfo ? ' info' : ''}`;
      const head = document.createElement('div');
      head.className = 'ytpt-confirm-head';
      const ico = document.createElement('span');
      ico.className = 'ytpt-confirm-ico';
      ico.append(makeSvgIcon(isInfo ? ICON_TOOLS : ICON_ALERT, 16));
      const h = document.createElement('strong');
      h.className = 'ytpt-confirm-title';
      h.textContent = confirmState.title;
      head.append(ico, h);
      const p = document.createElement('p');
      p.className = 'ytpt-confirm-msg';
      p.textContent = confirmState.summary;
      box.append(head, p);
      if (confirmState.warning) {
        const w = document.createElement('div');
        w.className = 'ytpt-warn';
        w.append(makeSvgIcon(ICON_ALERT, 15), document.createTextNode(confirmState.warning));
        box.append(w);
      }
      const row = document.createElement('div');
      row.className = 'ytpt-confirm-actions';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'ytpt-btn';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', () => {
        confirmState = null;
        renderBody();
      });
      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.className = `ytpt-btn ${isInfo ? 'primary' : 'danger'}`;
      okBtn.textContent = confirmState.confirmLabel || 'Confirm';
      okBtn.addEventListener('click', () => {
        const fn = confirmState.onConfirm;
        confirmState = null;
        closeDialog();
        fn();
      });
      row.append(cancelBtn, okBtn);
      box.append(row);
      return box;
    }

    function renderBody() {
      for (const btn of tabBtns) {
        const sel = btn.dataset.tab === activeTab;
        btn.setAttribute('aria-selected', String(sel));
        btn.tabIndex = sel ? 0 : -1;
      }
      body.textContent = '';
      const confirmBox = renderConfirmBox();
      if (confirmBox) {
        const wrap = document.createElement('div');
        wrap.className = 'ytpt-confirm-wrap';
        wrap.append(confirmBox);
        body.append(wrap);
        dialog.scrollTop = 0;
        setBusy(!!activeTask);
        confirmBox.querySelector('button')?.focus();
        return;
      }

      if (activeTab === 'cleanup') renderCleanupTab();
      else if (activeTab === 'export') renderExportTab();
      else renderImportTab();
      setBusy(!!activeTask);
    }

    function renderCleanupTab() {
      const items = getAllItems();
      const total = computeDurationSummary(items);
      const summary = document.createElement('p');
      summary.className = 'ytpt-note';
      summary.textContent = `Loaded: ${items.length} videos · Total duration: ${formatDuration(total.totalSec)}`;
      body.append(summary);

      // F1a Clear Playlist
      const clearCard = document.createElement('div');
      clearCard.className = 'ytpt-card';
      const clearH = document.createElement('h3');
      clearH.textContent = 'Clear Playlist';
      const clearLbl = document.createElement('label');
      clearLbl.setAttribute('for', 'ytpt-clear-mode');
      clearLbl.textContent = 'Clear mode';
      const clearSel = document.createElement('select');
      clearSel.id = 'ytpt-clear-mode';
      for (const [val, label] of CLEAR_MODES) {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = label;
        if (val === get('clearMode')) opt.selected = true;
        clearSel.append(opt);
      }
      clearSel.addEventListener('change', () => put('clearMode', clearSel.value));
      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'ytpt-btn danger';
      clearBtn.textContent = 'Clear Playlist';
      clearBtn.addEventListener('click', () => {
        const mode = clearSel.value;
        const current = getAllItems();
        const { targets, skipped } = selectClearTargets(current, mode);
        const includesUnavail = mode !== 'skip-unavailable';
        const warning =
          includesUnavail && hasUnavailableHiddenBanner()
            ? 'Unavailable videos are currently hidden. Enable "Show unavailable videos" first to remove them.'
            : '';
        confirmState = {
          title: 'Clear Playlist',
          summary: `Mode: ${mode}. Remove ${targets.length} video(s), skip ${skipped}${loadedNote(current)}.`,
          warning,
          confirmLabel: 'Clear Playlist',
          onConfirm: () => runRemoval(targets, skipped),
        };
        renderBody();
      });
      clearCard.append(clearH, clearLbl, clearSel, clearBtn);
      body.append(clearCard);

      // F1b Remove Watched
      const watchCard = document.createElement('div');
      watchCard.className = 'ytpt-card';
      const watchH = document.createElement('h3');
      watchH.textContent = 'Remove Watched';
      const watchLbl = document.createElement('label');
      watchLbl.setAttribute('for', 'ytpt-threshold');
      watchLbl.textContent = 'Watched threshold (10-100%)';
      const watchIn = document.createElement('input');
      watchIn.id = 'ytpt-threshold';
      watchIn.type = 'number';
      watchIn.min = '10';
      watchIn.max = '100';
      watchIn.value = String(get('watchedThreshold'));
      watchIn.addEventListener('change', () => {
        const n = Math.min(100, Math.max(10, Math.round(Number(watchIn.value) || 80)));
        watchIn.value = String(n);
        put('watchedThreshold', n);
      });
      const watchBtn = document.createElement('button');
      watchBtn.type = 'button';
      watchBtn.className = 'ytpt-btn';
      watchBtn.textContent = 'Remove Watched';
      watchBtn.addEventListener('click', () => {
        const th = Math.min(100, Math.max(10, Math.round(Number(watchIn.value) || 80)));
        put('watchedThreshold', th);
        const current = getAllItems();
        const targets = current.filter((i) => i.status === 'available' && i.watchedPct >= th);
        confirmState = {
          title: 'Remove Watched',
          summary: `Remove ${targets.length} video(s) with watched progress >= ${th}%${loadedNote(current)}.`,
          confirmLabel: 'Remove Watched',
          onConfirm: () => runRemoval(targets, current.length - targets.length),
        };
        renderBody();
      });
      watchCard.append(watchH, watchLbl, watchIn, watchBtn);
      body.append(watchCard);

      // F1c Remove Duplicates
      const dupCard = document.createElement('div');
      dupCard.className = 'ytpt-card';
      const dupH = document.createElement('h3');
      dupH.textContent = 'Remove Duplicates';
      const dupLbl = document.createElement('label');
      dupLbl.setAttribute('for', 'ytpt-dup-keep');
      dupLbl.textContent = 'Keep copy';
      const dupSel = document.createElement('select');
      dupSel.id = 'ytpt-dup-keep';
      for (const [val, label] of [
        ['first', 'Keep first'],
        ['last', 'Keep last'],
      ]) {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = label;
        if (val === dupKeep) opt.selected = true;
        dupSel.append(opt);
      }
      dupSel.addEventListener('change', () => { dupKeep = dupSel.value; });
      const dupBtn = document.createElement('button');
      dupBtn.type = 'button';
      dupBtn.className = 'ytpt-btn';
      dupBtn.textContent = 'Remove Duplicates';
      dupBtn.addEventListener('click', async () => {
        const task = beginTask('dup-scan');
        if (!task) return;
        const ok = await autoScrollPlaylist(task);
        endTask(task);
        clearToast();
        if (!ok) return;
        const current = getAllItems();
        const targets = selectDuplicateTargets(current, dupKeep);
        if (!targets.length) {
          showToast({
            text: 'No duplicate videos found.',
            actions: [{ label: 'Close', onClick: clearToast }],
          });
          return;
        }
        confirmState = {
          title: 'Remove Duplicates',
          summary: `Found ${targets.length} duplicate copy(s) (${dupKeep === 'last' ? 'Keep last' : 'Keep first'}). Remove them?`,
          confirmLabel: 'Remove Duplicates',
          onConfirm: () => runRemoval(targets, current.length - targets.length, { requireSetVideoId: true }),
        };
        renderBody();
      });
      dupCard.append(dupH, dupLbl, dupSel, dupBtn);
      body.append(dupCard);

      // F1d Remove by Channel / Keyword
      const kwCard = document.createElement('div');
      kwCard.className = 'ytpt-card';
      const kwH = document.createElement('h3');
      kwH.textContent = 'Remove by Channel / Keyword';
      const kwLbl = document.createElement('label');
      kwLbl.setAttribute('for', 'ytpt-kw-input');
      kwLbl.textContent = 'Keyword';
      const kwIn = document.createElement('input');
      kwIn.id = 'ytpt-kw-input';
      kwIn.type = 'text';
      kwIn.value = kwQuery;
      kwIn.placeholder = 'Enter title or channel keyword...';

      const tgtLbl = document.createElement('label');
      tgtLbl.setAttribute('for', 'ytpt-kw-target');
      tgtLbl.textContent = 'Match target';
      const tgtSel = document.createElement('select');
      tgtSel.id = 'ytpt-kw-target';
      for (const [val, label] of [
        ['both', 'Title & Channel'],
        ['title', 'Title'],
        ['channel', 'Channel'],
      ]) {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = label;
        if (val === kwTarget) opt.selected = true;
        tgtSel.append(opt);
      }

      const kwPreview = document.createElement('p');
      kwPreview.className = 'ytpt-note';
      const updateKwPreview = () => {
        const current = getAllItems();
        const matches = current.filter((i) => matchKeywordItem(i, kwQuery, kwTarget));
        if (!kwQuery.trim()) {
          kwPreview.textContent = 'Type a keyword to preview matches.';
          return;
        }
        const sample = matches.slice(0, 3).map((m) => m.title).join(', ');
        kwPreview.textContent = matches.length
          ? `${matches.length} match(es): ${sample}`
          : '0 matches found.';
      };
      updateKwPreview();
      kwIn.addEventListener('input', () => {
        kwQuery = kwIn.value;
        updateKwPreview();
      });
      tgtSel.addEventListener('change', () => {
        kwTarget = tgtSel.value;
        updateKwPreview();
      });

      const kwRow = document.createElement('div');
      kwRow.className = 'ytpt-row';
      const prevBtn = document.createElement('button');
      prevBtn.type = 'button';
      prevBtn.className = 'ytpt-btn';
      prevBtn.textContent = 'Preview in list';
      prevBtn.addEventListener('click', () => {
        filterState.query = kwQuery;
        filterState.target = kwTarget;
        filterState.chip = 'all';
        const bar = document.getElementById(FILTER_ID);
        const inp = bar?.querySelector('input[type="search"]');
        if (inp) inp.value = kwQuery;
        applyFilter();
        closeDialog();
      });

      const remKwBtn = document.createElement('button');
      remKwBtn.type = 'button';
      remKwBtn.className = 'ytpt-btn danger';
      remKwBtn.textContent = 'Remove Matching';
      remKwBtn.addEventListener('click', () => {
        const current = getAllItems();
        const targets = current.filter((i) => matchKeywordItem(i, kwQuery, kwTarget));
        if (!targets.length) {
          showToast({
            text: 'No videos match that keyword.',
            actions: [{ label: 'Close', onClick: clearToast }],
          });
          return;
        }
        confirmState = {
          title: 'Remove Matching',
          summary: `Remove ${targets.length} video(s) matching "${kwQuery.trim()}"${loadedNote(current)}.`,
          confirmLabel: 'Remove Matching',
          onConfirm: () => runRemoval(targets, current.length - targets.length),
        };
        renderBody();
      });
      kwRow.append(prevBtn, remKwBtn);
      kwCard.append(kwH, kwLbl, kwIn, tgtLbl, tgtSel, kwPreview, kwRow);
      body.append(kwCard);

      // UI toggles
      const uiCard = document.createElement('div');
      uiCard.className = 'ytpt-card';
      const uiH = document.createElement('h3');
      uiH.textContent = 'Display Settings';
      const makeToggle = (id, label, key, onChange) => {
        const wrap = document.createElement('label');
        wrap.className = 'ytpt-row';
        wrap.setAttribute('for', id);
        const cb = document.createElement('input');
        cb.id = id;
        cb.type = 'checkbox';
        cb.checked = !!get(key);
        cb.addEventListener('change', () => {
          put(key, cb.checked);
          onChange();
        });
        const span = document.createElement('span');
        span.textContent = label;
        wrap.append(cb, span);
        return wrap;
      };
      uiCard.append(
        uiH,
        makeToggle('ytpt-show-filter', 'Show in-playlist search & filter bar', 'showFilterBar', mountFilterBar),
        makeToggle('ytpt-show-dur', 'Show total duration calculator badge', 'showDuration', updateDurationBadge)
      );
      body.append(uiCard);
    }

    function renderExportTab() {
      const card = document.createElement('div');
      card.className = 'ytpt-card';
      const h = document.createElement('h3');
      h.textContent = 'Export Playlist';

      const scopeLbl = document.createElement('label');
      scopeLbl.setAttribute('for', 'ytpt-export-scope');
      scopeLbl.textContent = 'Scope';
      const scopeSel = document.createElement('select');
      scopeSel.id = 'ytpt-export-scope';
      const storedScope = get('exportScope');
      for (const [val, label] of EXPORT_SCOPES) {
        if (val === 'filtered' && !isFilterActive()) continue;
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = label;
        if (val === storedScope) opt.selected = true;
        scopeSel.append(opt);
      }
      scopeSel.addEventListener('change', () => {
        if (scopeSel.value !== 'filtered') put('exportScope', scopeSel.value);
      });

      const fmtLbl = document.createElement('label');
      fmtLbl.setAttribute('for', 'ytpt-export-fmt');
      fmtLbl.textContent = 'Format';
      const fmtSel = document.createElement('select');
      fmtSel.id = 'ytpt-export-fmt';
      for (const [val, label] of [
        ['md', 'Markdown (.md)'],
        ['txt', 'Plain URLs (.txt)'],
      ]) {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = label;
        if (val === get('exportFormat')) opt.selected = true;
        fmtSel.append(opt);
      }
      fmtSel.addEventListener('change', () => put('exportFormat', fmtSel.value));

      const resWrap = document.createElement('label');
      resWrap.className = 'ytpt-row';
      resWrap.setAttribute('for', 'ytpt-resolve-titles');
      const resCb = document.createElement('input');
      resCb.id = 'ytpt-resolve-titles';
      resCb.type = 'checkbox';
      resCb.checked = !!get('resolveTitles');
      resCb.addEventListener('change', () => put('resolveTitles', resCb.checked));
      const resText = document.createElement('span');
      resText.textContent = 'Resolve unavailable titles (Markdown only)';
      resWrap.append(resCb, resText);

      const warnBox = document.createElement('div');
      warnBox.className = 'ytpt-warn';
      const updateWarn = () => {
        const includesUnavail = scopeSel.value !== 'available';
        if (includesUnavail && hasUnavailableHiddenBanner()) {
          warnBox.textContent = 'Unavailable videos are hidden. Enable "Show unavailable videos" first to include them.';
          warnBox.style.display = '';
        } else {
          warnBox.style.display = 'none';
        }
      };
      updateWarn();
      scopeSel.addEventListener('change', updateWarn);

      const expBtn = document.createElement('button');
      expBtn.type = 'button';
      expBtn.className = 'ytpt-btn primary';
      expBtn.textContent = 'Export';
      expBtn.addEventListener('click', () => {
        const sc = scopeSel.value;
        const fm = fmtSel.value;
        const rv = resCb.checked;
        closeDialog();
        runExport(sc, fm, rv);
      });

      card.append(h, scopeLbl, scopeSel, fmtLbl, fmtSel, resWrap, warnBox, expBtn);
      body.append(card);
    }

    function renderImportTab() {
      const card = document.createElement('div');
      card.className = 'ytpt-card';
      const h = document.createElement('h3');
      h.textContent = 'Import Playlist';

      const fileLbl = document.createElement('label');
      fileLbl.setAttribute('for', 'ytpt-import-file');
      fileLbl.textContent = 'Load .md or .txt file';
      const fileIn = document.createElement('input');
      fileIn.id = 'ytpt-import-file';
      fileIn.type = 'file';
      fileIn.accept = '.md,.txt,text/plain,text/markdown';

      const taLbl = document.createElement('label');
      taLbl.setAttribute('for', 'ytpt-import-text');
      taLbl.textContent = 'Or paste URLs / Markdown / video IDs';
      const ta = document.createElement('textarea');
      ta.id = 'ytpt-import-text';
      ta.value = importText;
      ta.placeholder = 'https://www.youtube.com/watch?v=...';

      const skipWrap = document.createElement('label');
      skipWrap.className = 'ytpt-row';
      skipWrap.setAttribute('for', 'ytpt-import-skip');
      const skipCb = document.createElement('input');
      skipCb.id = 'ytpt-import-skip';
      skipCb.type = 'checkbox';
      skipCb.checked = !!get('importSkipExisting');
      skipCb.addEventListener('change', () => {
        put('importSkipExisting', skipCb.checked);
        updatePreview();
      });
      const skipText = document.createElement('span');
      skipText.textContent = 'Skip videos already in playlist';
      skipWrap.append(skipCb, skipText);

      const preview = document.createElement('p');
      preview.className = 'ytpt-note';

      const impBtn = document.createElement('button');
      impBtn.type = 'button';
      impBtn.className = 'ytpt-btn primary';
      impBtn.textContent = 'Import';

      const updatePreview = () => {
        const ids = extractVideoIdsFromText(importText);
        if (!ids.length) {
          preview.textContent = 'No valid video IDs detected yet.';
          impBtn.disabled = true;
          return;
        }
        const existing = new Set(getAllItems().map((i) => i.videoId).filter(Boolean));
        const inList = ids.filter((id) => existing.has(id)).length;
        const toAdd = skipCb.checked ? ids.length - inList : ids.length;
        preview.textContent = `Detected ${ids.length} unique ID(s): ${inList} already loaded in playlist, ${toAdd} to import.`;
        impBtn.disabled = !!activeTask || toAdd === 0;
      };

      fileIn.addEventListener('change', async () => {
        const f = fileIn.files?.[0];
        if (!f) return;
        importText = await f.text();
        ta.value = importText;
        updatePreview();
      });
      ta.addEventListener('input', () => {
        importText = ta.value;
        updatePreview();
      });
      impBtn.addEventListener('click', () => {
        const ids = extractVideoIdsFromText(importText);
        if (!ids.length) return;
        const skip = skipCb.checked;
        confirmState = {
          title: 'Import Playlist',
          summary: `Import up to ${ids.length} video(s) into playlist ${currentListId()}?`,
          confirmLabel: 'Import',
          tone: 'info',
          onConfirm: () => runImport(ids, skip),
        };
        renderBody();
      });

      updatePreview();
      card.append(h, fileLbl, fileIn, taLbl, ta, skipWrap, preview, impBtn);
      body.append(card);
    }

    renderBody();
    const firstTab = tabBtns.find((b) => b.dataset.tab === activeTab);
    (firstTab || closeBtn).focus();
  }

  // ---------- Lifecycle & Menu ----------

  function teardownPageUi() {
    cancelActiveTask();
    closeDialog();
    if (listObserver) {
      listObserver.disconnect();
      listObserver = null;
    }
    clearTimeout(mountTimer);
    document.getElementById(BTN_ID)?.remove();
    document.getElementById(DURATION_ID)?.remove();
    document.getElementById(FILTER_ID)?.remove();
    document.getElementById(EMPTY_ID)?.remove();
    for (const row of getRows()) row.removeAttribute(HIDDEN_ATTR);
  }

  function observeList() {
    if (listObserver) listObserver.disconnect();
    const root = document.querySelector('ytd-playlist-video-list-renderer');
    if (!root) return;
    listObserver = new MutationObserver(() => {
      clearTimeout(mountTimer);
      mountTimer = setTimeout(() => {
        if (!onPlaylistPage()) return;
        mountHeaderButton();
        mountFilterBar();
        updateDurationBadge();
        applyFilter();
      }, 200);
    });
    listObserver.observe(root, { childList: true, subtree: true });
  }

  function syncPage() {
    if (!onPlaylistPage()) {
      teardownPageUi();
      return;
    }
    mountHeaderButton();
    mountFilterBar();
    updateDurationBadge();
    observeList();
  }

  function drawMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    if (menuIds.length && typeof GM_unregisterMenuCommand === 'function') {
      for (const id of menuIds) GM_unregisterMenuCommand(id);
      menuIds = [];
    }
    const id = GM_registerMenuCommand('Playlist Tools...', () => {
      if (!onPlaylistPage()) {
        showToast({
          text: 'Open a YouTube playlist page (/playlist?list=...) to use Playlist Tools.',
          actions: [{ label: 'Close', onClick: clearToast }],
        });
        return;
      }
      openDialog('cleanup');
    });
    if (id !== undefined && id !== null) menuIds.push(id);
  }

  document.addEventListener('yt-navigate-finish', () => {
    cancelActiveTask();
    closeDialog();
    filterState.query = '';
    filterState.chip = 'all';
    filterState.target = 'both';
    syncPage();
  });

  drawMenu();
  syncPage();
  setTimeout(syncPage, 1000);
})();

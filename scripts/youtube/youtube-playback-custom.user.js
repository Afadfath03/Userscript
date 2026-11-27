// ==UserScript==
// @name         YouTube: Playback Custom
// @namespace    https://github.com/Afadfath03/Userscript
// @version      2.0
// @description  Preferred resolution, playback defaults, autoplay control, auto-expand description, and video bookmarks in one YouTube script
// @author       Afadfath03
// @homepageURL  https://github.com/Afadfath03/Userscript
// @supportURL   https://github.com/Afadfath03/Userscript/issues
// @downloadURL  https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube/youtube-playback-custom.user.js
// @updateURL    https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube/youtube-playback-custom.user.js
// @icon         https://raw.githubusercontent.com/Afadfath03/Userscript/main/assets/icons/youtube/youtube-playback-custom.png
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

  const QUALITY_ORDER = ['highres', 'hd2880', 'hd2160', 'hd1440', 'hd1080', 'hd720', 'large', 'medium', 'small', 'tiny'];
  const QUALITY = [
    ['auto', 'Auto'],
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
  const SPEEDS = [['leave', 'Leave as-is'], [0.75, '0.75x'], [1, '1x'], [1.25, '1.25x'], [1.5, '1.5x'], [1.75, '1.75x'], [2, '2x']];
  const VOLUMES = [['leave', 'Leave as-is'], [0, '0%'], [10, '10%'], [20, '20%'], [30, '30%'], [40, '40%'], [50, '50%'], [60, '60%'], [70, '70%'], [80, '80%'], [90, '90%'], [100, '100%']];
  const ONOFF = [['leave', 'Leave as-is'], ['on', 'On'], ['off', 'Off']];
  const AUDIOS = [['leave', 'Leave as-is'], ['original', 'Original (first track)']];
  const BEHAVIORS = [
    ['leave', 'Leave as-is'],
    ['next', 'Next immediately'],
    ['wait', 'Wait then next'],
    ['stop', 'Stop at end'],
    ['loop', 'Loop current'],
  ];
  const DELAYS = [[0, '0s'], [3, '3s'], [5, '5s'], [10, '10s'], [15, '15s'], [30, '30s']];
  const LIMITS = [[0, 'Off'], [3, '3'], [5, '5'], [10, '10'], [20, '20']];

  const get = (key, fallback) => {
    const v = GM_getValue(`ytpc.${key}`, fallback);
    return v === undefined || v === null ? fallback : v;
  };
  const put = (key, value) => GM_setValue(`ytpc.${key}`, value);
  const enabled = () => get('on', true) === true;
  const choice = (key, options, fallback) => {
    const v = get(key, fallback);
    return options.some(([val]) => val === v) ? v : fallback;
  };
  const flag = (key, fallback = false) => enabled() && get(key, fallback) === true;

  const currentVideo = () => document.querySelector('#movie_player video');
  const playerEl = () => document.getElementById('movie_player');
  const videoIdFromUrl = () => (location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') || '' : '');

  // ---------- preferred resolution ----------

  function resolveQuality(pref, available) {
    if (pref === 'auto' || !available.length) return null;
    if (pref === 'highest') return available[0];
    const rank = QUALITY_ORDER.indexOf(pref);
    const ranked = available.filter((q) => QUALITY_ORDER.includes(q));
    if (!ranked.length) return null;
    if (ranked.includes(pref)) return pref;
    const below = ranked.filter((q) => QUALITY_ORDER.indexOf(q) >= rank);
    return below[0] || ranked[ranked.length - 1];
  }

  let qualityTimer = 0;
  let qualityTries = 0;
  function startQualityWatchdog() {
    clearInterval(qualityTimer);
    qualityTimer = 0;
    qualityTries = 0;
    const pref = choice('quality', QUALITY, 'auto');
    if (!enabled() || pref === 'auto') return;
    qualityTimer = setInterval(() => {
      if (!enabled()) {
        clearInterval(qualityTimer);
        return;
      }
      const el = playerEl();
      if (!el || typeof el.getAvailableQualityLevels !== 'function') {
        if (++qualityTries >= 30) clearInterval(qualityTimer);
        return;
      }
      if (el.classList.contains('ad-showing')) return;
      const code = resolveQuality(choice('quality', QUALITY, 'auto'), el.getAvailableQualityLevels() || []);
      if (!code) {
        if (++qualityTries >= 30) clearInterval(qualityTimer);
        return;
      }
      if (typeof el.getPlaybackQuality === 'function' && el.getPlaybackQuality() === code) {
        clearInterval(qualityTimer);
        return;
      }
      if (typeof el.setPlaybackQualityRange === 'function') el.setPlaybackQualityRange(code, code);
      if (typeof el.setPlaybackQuality === 'function') el.setPlaybackQuality(code);
      if (++qualityTries >= 30) clearInterval(qualityTimer);
    }, 400);
  }

  // ---------- video & audio defaults ----------

  let theaterClickedAt = 0;
  let theaterClicks = 0;
  function applyTheater() {
    const mode = choice('theater', ONOFF, 'leave');
    if (!enabled() || mode === 'leave' || document.fullscreenElement) return true;
    const flexy = document.querySelector('ytd-watch-flexy');
    if (!flexy) return true;
    if (flexy.hasAttribute('theater') === (mode === 'on')) return true;
    if (Date.now() - theaterClickedAt < 800) return false;
    if (theaterClicks >= 3) return true;
    const btn = document.querySelector('.ytp-size-button');
    if (!btn) return false;
    theaterClickedAt = Date.now();
    theaterClicks++;
    btn.click();
    return false;
  }

  function applyVideo() {
    if (!enabled()) return true;
    const video = currentVideo();
    if (!video) return true;
    let done = true;
    const rate = choice('speed', SPEEDS, 'leave');
    if (rate !== 'leave' && video.playbackRate !== rate) {
      video.playbackRate = rate;
      done = video.playbackRate === rate;
    }
    const level = choice('volume', VOLUMES, 'leave');
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
    const mode = choice('subtitles', ONOFF, 'leave');
    if (!enabled() || mode === 'leave') return true;
    const btn = document.querySelector('.ytp-subtitles-button');
    if (!btn || btn.hidden || btn.getAttribute('aria-pressed') === null) return true;
    if ((btn.getAttribute('aria-pressed') === 'true') === (mode === 'on')) return true;
    if (Date.now() - subtitleClickedAt < 400) return false;
    if (subtitleClicks >= 2) return true;
    subtitleClickedAt = Date.now();
    subtitleClicks++;
    btn.click();
    return false;
  }

  let audioSetAt = 0;
  let audioClicks = 0;
  function applyAudio() {
    const mode = choice('audio', AUDIOS, 'leave');
    if (!enabled() || mode === 'leave') return true;
    const el = playerEl();
    if (!el || typeof el.getAvailableAudioTracks !== 'function') return true;
    const tracks = el.getAvailableAudioTracks() || [];
    if (tracks.length < 2) return true;
    const first = tracks[0];
    const cur = typeof el.getAudioTrack === 'function' ? el.getAudioTrack() : null;
    if (cur && cur.id === first.id) return true;
    if (Date.now() - audioSetAt < 1200) return false;
    if (audioClicks >= 3) return true;
    audioSetAt = Date.now();
    audioClicks++;
    if (typeof el.setAudioTrack === 'function') el.setAudioTrack(first);
    return false;
  }

  let syncTimer = 0;
  let syncTries = 0;
  function startPlaybackSync() {
    clearTimeout(syncTimer);
    syncTimer = 0;
    syncTries = 0;
    theaterClicks = 0;
    subtitleClicks = 0;
    audioClicks = 0;
    if (!enabled()) return;
    const tick = () => {
      const done = applyVideo() && applyTheater() && applySubtitles() && applyAudio();
      if (done || ++syncTries > 16) return;
      syncTimer = setTimeout(tick, 250);
    };
    tick();
  }

  // ---------- autoplay & tab visibility ----------

  const COUNT_KEY = 'ytpc.count';
  const toggleEl = () => document.querySelector('.ytp-autonav-toggle-button');

  function setAutoplay(on) {
    const el = toggleEl();
    if (!el) return;
    if ((el.getAttribute('aria-checked') === 'true') === on) return;
    (el.closest('button') || el).click();
  }

  function nextInPlaylist() {
    const items = [...document.querySelectorAll('ytd-playlist-panel-video-renderer')];
    if (!items.length) return null;
    const selected = items.find(
      (item) => item.hasAttribute('selected') || item.getAttribute('aria-current') === 'true'
    );
    if (!selected) return null;
    for (const item of items.slice(items.indexOf(selected) + 1)) {
      const link = item.querySelector('a#wc-endpoint, a[href*="/watch?v="]');
      if (!link || !link.href) continue;
      if (flag('skipShorts') && link.href.includes('/shorts/')) continue;
      return link;
    }
    return null;
  }

  function pickNext() {
    const playlist = nextInPlaylist();
    if (playlist) return playlist;
    const skip = flag('skipShorts');
    const cards = document.querySelectorAll('#movie_player .ytp-videowall-still, #movie_player .ytp-ce-video');
    const related = document.querySelectorAll(
      'ytd-watch-next-secondary-results-renderer yt-lockup-view-model a[href*="/watch?v="], ' +
        '#secondary ytd-compact-video-renderer a#thumbnail'
    );
    for (const el of [...cards, ...related]) {
      if (!el.href) continue;
      if (skip && el.href.includes('/shorts/')) continue;
      return el;
    }
    return null;
  }

  function count() {
    const n = Number.parseInt(sessionStorage.getItem(COUNT_KEY) || '0', 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function bumpCount() {
    try { sessionStorage.setItem(COUNT_KEY, String(count() + 1)); } catch {}
  }

  let endTimer = 0;
  function cancelCountdown() {
    document.querySelector('.ytp-autonav-endscreen-upnext-cancel-button')?.click();
  }

  function onEnded() {
    if (!enabled()) return;
    const mode = choice('behavior', BEHAVIORS, 'leave');
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
    const cap = choice('limit', LIMITS, 0);
    if (cap && count() >= cap) {
      setAutoplay(false);
      return;
    }
    if (flag('pauseHidden') && document.hidden) return;
    clearTimeout(endTimer);
    const ended = videoIdFromUrl();
    const waitMs = mode === 'next' ? 0 : choice('delay', DELAYS, 5) * 1000;
    endTimer = setTimeout(() => {
      if (!enabled()) return;
      const curMode = choice('behavior', BEHAVIORS, 'leave');
      if (curMode === 'leave' || curMode === 'stop') return;
      if (videoIdFromUrl() !== ended) return;
      cancelCountdown();
      const target = pickNext();
      if (!target) {
        setAutoplay(true);
        return;
      }
      bumpCount();
      target.click();
    }, waitMs);
  }

  let autoSyncTimer = 0;
  let autoSyncTries = 0;
  function syncAutoplay() {
    clearTimeout(autoSyncTimer);
    autoSyncTimer = 0;
    autoSyncTries = 0;
    if (!enabled() || choice('behavior', BEHAVIORS, 'leave') === 'leave') {
      clearTimeout(endTimer);
      return;
    }
    const tick = () => {
      hookVideo();
      setAutoplay(false);
      if (toggleEl() || ++autoSyncTries > 20) return;
      autoSyncTimer = setTimeout(tick, 250);
    };
    tick();
  }

  const hooked = new WeakSet();
  function hookVideo() {
    const video = currentVideo();
    if (!video || hooked.has(video)) return;
    hooked.add(video);
    video.addEventListener('loadedmetadata', startPlaybackSync);
    video.addEventListener('ended', onEnded);
  }

  let pausedByUs = false;
  window.addEventListener('blur', () => {
    if (!flag('pauseBlur')) return;
    const video = currentVideo();
    if (video && !video.paused) video.pause();
  });

  document.addEventListener('visibilitychange', () => {
    if (!flag('pauseHidden')) return;
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

  // ---------- watch page: auto expand description ----------

  let expRaf = 0;
  let expTries = 0;
  let expUrl = '';
  let expDone = '';

  function scanExpand() {
    expRaf = 0;
    if (!flag('expandDesc', true) || location.pathname !== '/watch') {
      expUrl = '';
      expDone = '';
      expTries = 0;
      return;
    }
    if (location.search !== expUrl) {
      expUrl = location.search;
      expTries = 0;
    }
    if (expUrl === expDone) return;
    const box = document.querySelector('#description-inline-expander');
    if (!box) return;
    const btn = box.querySelector('#expand');
    if (!btn || btn.hidden) return;
    if (expTries++ >= 5) return;
    btn.click();
    requestAnimationFrame(() => {
      if (btn.hidden || !btn.isConnected) expDone = expUrl;
      else setTimeout(scheduleExpand, 300);
    });
  }

  const scheduleExpand = () => { if (!expRaf) expRaf = requestAnimationFrame(scanExpand); };
  new MutationObserver(scheduleExpand).observe(document.documentElement, { childList: true, subtree: true });

  // ---------- video bookmarks ----------

  const MARK_LIMIT = 50;
  const clock = (seconds, withHours) => {
    const total = Math.max(0, Math.floor(seconds));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h || withHours ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  };
  const parseClock = (text) => {
    const value = String(text).trim();
    if (/^\d+$/.test(value)) {
      const sec = Number(value);
      return sec <= 86400 ? sec : null;
    }
    const match = /^(?:(\d+):)?([0-5]?\d):([0-5]\d)$/.exec(value);
    if (!match) return null;
    const sec = (match[1] ? Number(match[1]) : 0) * 3600 + Number(match[2]) * 60 + Number(match[3]);
    return sec <= 86400 ? sec : null;
  };
  const isMark = (m) =>
    !!m && typeof m === 'object' && Number.isInteger(m.t) && m.t >= 0 && m.t <= 86400 &&
    typeof m.n === 'string' && m.n.length <= 60 && Number.isFinite(m.at);
  const markMap = () => {
    const raw = get('marks', {});
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  };
  const marksFor = (id) => {
    const list = markMap()[id];
    return Array.isArray(list) ? list.filter(isMark) : [];
  };
  const writeMarks = (id, list) => {
    const all = { ...markMap() };
    if (list.length) all[id] = list.slice().sort((a, b) => a.t - b.t);
    else delete all[id];
    put('marks', all);
  };

  function stepRate(delta) {
    const video = currentVideo();
    if (!video) return;
    const next = delta === 0 ? 1 : video.playbackRate + delta;
    video.playbackRate = Math.min(2, Math.max(0.25, Math.round(next * 4) / 4));
  }

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.getElementById('ytpc-panel')) return;
      const t = e.target;
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      if (flag('hotkeys') && (e.key === '[' || e.key === ']' || e.key === '0')) {
        e.preventDefault();
        e.stopPropagation();
        stepRate(e.key === '0' ? 0 : e.key === ']' ? 0.25 : -0.25);
        return;
      }
      if (flag('bookmarksOn') && e.key === 'b' && !e.repeat && !e.shiftKey && videoIdFromUrl()) {
        e.preventDefault();
        openPanel('addMark', 'bookmarks');
      }
    },
    true
  );

  // ---------- panel ----------

  const SUBSECTIONS = [
    {
      id: 'video',
      title: 'Video & Audio',
      desc: 'Default quality, speed, theater mode, volume, subtitles, and audio track.',
      rows: [
        { key: 'quality', label: 'Quality', type: 'choice', def: 'auto', options: QUALITY },
        { key: 'speed', label: 'Speed', type: 'choice', def: 'leave', options: SPEEDS },
        { key: 'hotkeys', label: 'Speed hotkeys ([ ] 0)', type: 'toggle', def: false },
        { key: 'theater', label: 'Theater mode', type: 'choice', def: 'leave', options: ONOFF },
        { key: 'volume', label: 'Volume', type: 'choice', def: 'leave', options: VOLUMES },
        { key: 'subtitles', label: 'Subtitles', type: 'choice', def: 'leave', options: ONOFF },
        { key: 'audio', label: 'Audio track', type: 'choice', def: 'leave', options: AUDIOS },
      ],
      summary: () => {
        const q = QUALITY.find(([v]) => v === choice('quality', QUALITY, 'auto'))?.[1] || 'Auto';
        const s = choice('speed', SPEEDS, 'leave');
        return s === 'leave' ? q : `${q}, ${s}x`;
      },
    },
    {
      id: 'autoplay',
      title: 'Autoplay',
      desc: 'End-of-video behavior, per-tab limit, Shorts skip, and tab visibility pause.',
      rows: [
        { key: 'behavior', label: 'When a video ends', type: 'choice', def: 'leave', options: BEHAVIORS },
        { key: 'delay', label: 'Delay', type: 'choice', def: 5, options: DELAYS },
        { key: 'limit', label: 'Video limit (per tab)', type: 'choice', def: 0, options: LIMITS },
        { key: 'skipShorts', label: 'Skip Shorts', type: 'toggle', def: false },
        { key: 'pauseHidden', label: 'Pause when tab hidden', type: 'toggle', def: false },
        { key: 'pauseBlur', label: 'Pause when window loses focus', type: 'toggle', def: false },
      ],
      summary: () => BEHAVIORS.find(([v]) => v === choice('behavior', BEHAVIORS, 'leave'))?.[1] || 'Leave as-is',
    },
    {
      id: 'watch',
      title: 'Watch Page',
      desc: 'Automatic watch-page adjustments while opening a video.',
      rows: [
        { key: 'expandDesc', label: 'Auto expand description', type: 'toggle', def: true },
      ],
      summary: () => (get('expandDesc', true) ? 'Expand on' : 'Off'),
    },
    {
      id: 'bookmarks',
      title: 'Video Bookmarks',
      desc: 'Save labelled timestamp bookmarks, jump back to them, or copy as chapters.',
      rows: [
        { key: 'bookmarksOn', label: 'Enable Video Bookmarks (hotkey b)', type: 'toggle', def: false },
        { key: 'openBookmarks', label: 'Show video bookmarks', type: 'action' },
        { key: 'addBookmark', label: 'Add bookmark at current time', type: 'action' },
      ],
      summary: () => {
        const n = marksFor(videoIdFromUrl()).length;
        return get('bookmarksOn', false) ? (n ? `On (${n})` : 'On') : 'Off';
      },
    },
  ];

  const PANEL_CSS = `
#ytpc-backdrop{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5)}
#ytpc-panel,#ytpc-panel *{box-sizing:border-box}
#ytpc-panel{width:clamp(320px,88vw,420px);height:min(76dvh,560px);display:flex;flex-direction:column;overflow:hidden;border-radius:14px;background:var(--yt-spec-base-background,#fff);color:var(--yt-spec-text-primary,#0f0f0f);box-shadow:0 16px 40px rgba(0,0,0,.45);font-family:Roboto,Arial,sans-serif}
#ytpc-panel .ytp-head{flex:0 0 auto;display:grid;grid-template-columns:36px 1fr 36px;align-items:center;gap:6px;padding:10px 12px 8px;border-bottom:1px solid var(--yt-spec-10-percent-layer,rgba(128,128,128,.2))}
#ytpc-panel .ytp-title-wrap{min-width:0;text-align:center}
#ytpc-panel .ytp-crumb{display:block;font-size:11px;line-height:1.25;color:var(--yt-spec-text-secondary,#606060);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#ytpc-panel h2{margin:0;font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#ytpc-panel .ytp-spacer{width:36px;height:36px}
#ytpc-panel .ytp-icon{width:36px;height:36px;min-height:36px;padding:0;justify-content:center;border-radius:50%;font-size:18px}
#ytpc-panel .ytp-body{flex:1 1 auto;overflow-y:auto;padding:8px 0 12px}
#ytpc-panel .ytp-desc{margin:4px 16px 8px;font-size:12.5px;line-height:1.45;color:var(--yt-spec-text-secondary,#606060)}
#ytpc-panel .ytp-section{padding:10px 16px 4px;font-size:12px;font-weight:600;color:var(--yt-spec-text-secondary,#606060);text-transform:uppercase;letter-spacing:.03em}
#ytpc-panel hr{margin:6px 0;border:0;border-top:1px solid var(--yt-spec-10-percent-layer,rgba(128,128,128,.2))}
#ytpc-panel button{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;padding:0 16px;border:0;background:none;color:inherit;font:inherit;font-size:14px;text-align:left;cursor:pointer}
#ytpc-panel button:hover:not(:disabled){background:var(--yt-spec-badge-chip-background,rgba(128,128,128,.1))}
#ytpc-panel button:focus-visible{outline:2px solid var(--yt-spec-call-to-action,#065fd4);outline-offset:-2px}
#ytpc-panel .ytp-group.is-disabled{opacity:.42;pointer-events:none;user-select:none}
#ytpc-panel .ytp-val{margin-left:auto;font-size:13px;color:var(--yt-spec-text-secondary,#606060)}
#ytpc-panel .ytp-chev{font-size:16px;opacity:.6}
#ytpc-panel .ytp-check{margin-left:auto;font-weight:700;color:var(--yt-spec-call-to-action,#3ea6ff)}
#ytpc-panel .ytp-reset{color:var(--yt-spec-text-secondary,#606060);font-size:13px}
#ytpc-panel .ytp-reset.is-armed{color:#e05a52;font-weight:500}
#ytpc-panel .ytp-input{display:block;width:calc(100% - 32px);min-height:40px;margin:4px 16px 10px;padding:0 12px;border:1px solid var(--yt-spec-10-percent-layer,rgba(128,128,128,.35));border-radius:8px;background:var(--yt-spec-badge-chip-background,rgba(128,128,128,.08));color:inherit;font:inherit}
#ytpc-panel .ytp-actions{display:flex;gap:8px;padding:6px 16px}
#ytpc-panel .ytp-actions button{flex:1;justify-content:center;border-radius:22px;min-height:40px}
#ytpc-panel .ytp-primary{background:var(--yt-spec-call-to-action,#065fd4);color:#fff;font-weight:500}
#ytpc-panel .ytp-secondary{background:var(--yt-spec-badge-chip-background,rgba(128,128,128,.12))}
#ytpc-panel .ytp-error{margin:0 16px 8px;font-size:12px;color:#e05a52}
`;

  const state = { view: 'home', sub: null, rowKey: null, resetArmed: false };
  let addPausedVideo = null;

  function resumeAddPause() {
    if (addPausedVideo && addPausedVideo === currentVideo() && addPausedVideo.paused) {
      addPausedVideo.play().catch(() => {});
    }
    addPausedVideo = null;
  }

  function closePanel() {
    state.resetArmed = false;
    resumeAddPause();
    document.removeEventListener('keydown', onKey, true);
    document.getElementById('ytpc-backdrop')?.remove();
    document.getElementById('ytpc-style')?.remove();
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      state.resetArmed = false;
      resumeAddPause();
      if (state.view === 'options' || state.view === 'marks' || state.view === 'addMark') { state.view = 'sub'; render(); }
      else if (state.view === 'sub') { state.view = 'home'; render(); }
      else closePanel();
      return;
    }
    if (e.key !== 'Tab') return;
    const panel = document.getElementById('ytpc-panel');
    if (!panel) return;
    const items = [...panel.querySelectorAll('button:not(:disabled), input')];
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
      back.addEventListener('click', () => { state.resetArmed = false; resumeAddPause(); onBack(); });
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

  function applyAll() {
    hookVideo();
    startQualityWatchdog();
    startPlaybackSync();
    syncAutoplay();
    scheduleExpand();
    drawMenu();
  }

  function render() {
    const panel = document.getElementById('ytpc-panel');
    if (!panel) return;
    panel.textContent = '';

    const body = document.createElement('div');
    body.className = 'ytp-body';

    if (state.view === 'home') {
      panel.append(header('YouTube: Playback Custom'), body);
      const desc = document.createElement('p');
      desc.className = 'ytp-desc';
      desc.textContent = 'Quality, playback defaults, autoplay behavior, watch page tweaks, and video bookmarks.';
      body.append(desc, document.createElement('hr'));
      const on = enabled();
      body.append(rowBtn('Enabled', on ? 'On' : 'Off', () => {
        put('on', !on);
        applyAll();
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
        state.resetArmed ? 'Click again to reset Playback Custom' : 'Reset Playback Custom',
        undefined,
        () => {
          if (!state.resetArmed) { state.resetArmed = true; render(); return; }
          state.resetArmed = false;
          if (typeof GM_deleteValue === 'function') {
            GM_deleteValue('ytpc.on');
            for (const s of SUBSECTIONS) for (const r of s.rows) if (r.type !== 'action') GM_deleteValue(`ytpc.${r.key}`);
          } else {
            put('on', true);
            for (const s of SUBSECTIONS) for (const r of s.rows) if (r.type !== 'action') put(r.key, r.def);
          }
          applyAll();
          render();
        },
        { keepArmed: true }
      );
      reset.className = state.resetArmed ? 'ytp-reset is-armed' : 'ytp-reset';
      body.append(reset);
      return;
    }

    if (state.view === 'marks') {
      const id = videoIdFromUrl();
      const list = id ? marksFor(id) : [];
      const hours = list.some((m) => m.t >= 3600);
      panel.append(header('Video Bookmarks', () => { state.view = 'sub'; state.sub = 'bookmarks'; render(); }, 'Playback Custom'), body);
      if (!id) {
        const p = document.createElement('p');
        p.className = 'ytp-desc';
        p.textContent = 'Open a video on /watch to view or add bookmarks.';
        body.append(p);
        return;
      }
      if (!list.length) {
        const p = document.createElement('p');
        p.className = 'ytp-desc';
        p.textContent = 'No bookmarks saved for this video yet.';
        body.append(p);
      } else {
        for (const m of list) {
          body.append(rowBtn(m.n, clock(m.t, hours), () => {
            const v = currentVideo();
            if (v) v.currentTime = m.t;
          }));
        }
      }
      body.append(document.createElement('hr'));
      body.append(rowBtn('Add video bookmark', undefined, () => { state.view = 'addMark'; render(); }));
      if (list.length) {
        body.append(rowBtn('Copy as chapters', undefined, () => {
          const text = list.map((m) => `${clock(m.t, hours)} ${m.n}`).join('\n');
          navigator.clipboard?.writeText(text).catch(() => {});
        }));
      }
      return;
    }

    if (state.view === 'addMark') {
      const id = videoIdFromUrl();
      panel.append(header('Add bookmark', () => { state.view = 'marks'; render(); }, 'Video Bookmarks'), body);
      if (!id) {
        const p = document.createElement('p');
        p.className = 'ytp-desc';
        p.textContent = 'Open a video on /watch to add a bookmark.';
        body.append(p);
        return;
      }
      const video = currentVideo();
      if (video && !video.paused && !addPausedVideo) {
        addPausedVideo = video;
        video.pause();
      }
      const list = marksFor(id);
      const hours = list.some((m) => m.t >= 3600);
      const at = Math.floor(video ? video.currentTime : 0);
      const desc = document.createElement('p');
      desc.className = 'ytp-desc';
      desc.textContent = 'The video is paused. Adjust the time or label before saving.';
      const tLbl = document.createElement('div');
      tLbl.className = 'ytp-section';
      tLbl.textContent = 'Time';
      const tIn = document.createElement('input');
      tIn.className = 'ytp-input';
      tIn.value = clock(at, hours);
      const nLbl = document.createElement('div');
      nLbl.className = 'ytp-section';
      nLbl.textContent = 'Name';
      const nIn = document.createElement('input');
      nIn.className = 'ytp-input';
      nIn.maxLength = 60;
      nIn.value = clock(at, hours);
      const err = document.createElement('p');
      err.className = 'ytp-error';
      err.hidden = true;
      const actions = document.createElement('div');
      actions.className = 'ytp-actions';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'ytp-secondary';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', () => { resumeAddPause(); state.view = 'marks'; render(); });
      const save = document.createElement('button');
      save.type = 'button';
      save.className = 'ytp-primary';
      save.textContent = 'Add bookmark';
      save.addEventListener('click', () => {
        const sec = parseClock(tIn.value);
        if (sec === null) { err.textContent = 'Use mm:ss, h:mm:ss, or seconds.'; err.hidden = false; return; }
        if (list.length >= MARK_LIMIT) { err.textContent = `This video already holds ${MARK_LIMIT} bookmarks.`; err.hidden = false; return; }
        const label = nIn.value.trim().slice(0, 60) || clock(sec, hours);
        writeMarks(id, [...list, { t: sec, n: label, at: Date.now() }]);
        resumeAddPause();
        state.view = 'marks';
        drawMenu();
        render();
      });
      actions.append(cancel, save);
      body.append(desc, tLbl, tIn, nLbl, nIn, err, actions);
      tIn.focus();
      return;
    }

    const sub = SUBSECTIONS.find((s) => s.id === state.sub);
    if (!sub) { state.view = 'home'; render(); return; }

    if (state.view === 'sub') {
      panel.append(header(sub.title, () => { state.view = 'home'; render(); }, 'Playback Custom'), body);
      const desc = document.createElement('p');
      desc.className = 'ytp-desc';
      desc.textContent = sub.desc;
      body.append(desc, document.createElement('hr'));
      for (const r of sub.rows) {
        if (r.type === 'toggle') {
          const on = get(r.key, r.def) === true;
          body.append(rowBtn(r.label, on ? 'On' : 'Off', () => {
            put(r.key, !on);
            applyAll();
            render();
          }, { pressed: on }));
        } else if (r.type === 'choice') {
          const cur = choice(r.key, r.options, r.def);
          const hit = r.options.find(([v]) => v === cur);
          body.append(rowBtn(r.label, hit ? hit[1] : String(cur), () => {
            state.view = 'options';
            state.rowKey = r.key;
            render();
          }, { chevron: true }));
        } else if (r.type === 'action') {
          body.append(rowBtn(r.label, undefined, () => {
            state.view = r.key === 'addBookmark' ? 'addMark' : 'marks';
            render();
          }, { chevron: true }));
        }
      }
      return;
    }

    const row = sub.rows.find((r) => r.key === state.rowKey);
    if (!row) { state.view = 'sub'; render(); return; }
    panel.append(header(row.label, () => { state.view = 'sub'; render(); }, `Playback Custom \u203a ${sub.title}`), body);
    const cur = choice(row.key, row.options, row.def);
    for (const [val, label] of row.options) {
      body.append(rowBtn(label, undefined, () => {
        put(row.key, val);
        applyAll();
        state.view = 'sub';
        render();
      }, { checked: val === cur }));
    }
  }

  function openPanel(initialView = 'home', subId = null) {
    if (document.getElementById('ytpc-backdrop')) closePanel();
    state.view = initialView;
    state.sub = subId;
    state.rowKey = null;
    state.resetArmed = false;
    const style = document.createElement('style');
    style.id = 'ytpc-style';
    style.textContent = PANEL_CSS;
    document.head.append(style);

    const backdrop = document.createElement('div');
    backdrop.id = 'ytpc-backdrop';
    backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) closePanel(); });
    const panel = document.createElement('div');
    panel.id = 'ytpc-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'YouTube: Playback Custom');
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
      GM_registerMenuCommand(enabled() ? 'YouTube: Playback Custom' : 'Playback Custom (off)', () => openPanel('home')),
    ];
    if (flag('bookmarksOn') && videoIdFromUrl()) {
      menuIds.push(GM_registerMenuCommand('Show video bookmarks', () => openPanel('marks', 'bookmarks')));
    }
  }

  document.addEventListener('yt-navigate-finish', applyAll);
  window.addEventListener('yt-page-data-updated', applyAll);
  applyAll();
})();

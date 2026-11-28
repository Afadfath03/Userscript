// ==UserScript==
// @name         YouTube: Custom Collection
// @namespace    https://github.com/Afadfath03/Userscript
// @version      5.4
// @description  Collection of YouTube userscripts made by me, bundled into one install with per-feature settings
// @author       Afadfath03
// @homepageURL  https://github.com/Afadfath03/Userscript
// @supportURL   https://github.com/Afadfath03/Userscript/issues
// @downloadURL  https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube/youtube-custom-collection.user.js
// @updateURL    https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube/youtube-custom-collection.user.js
// @icon         https://raw.githubusercontent.com/Afadfath03/Userscript/main/assets/icons/youtube/youtube-custom-collection.png
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
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      findyoutubevideo.thetechrobo.ca
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

  // Set by the clean share link, playlist tools and liked videos tools blocks, called from the menu
  let shareCopyAtTime = () => {};
  let openPlaylistToolsDialog = () => {};
  let openLikedToolsDialog = () => {};
  const videoIdFromUrl = () => {
    if (location.pathname === '/watch') return new URLSearchParams(location.search).get('v') || '';
    if (location.protocol === 'file:' || location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
      return playerEl()?.dataset.previewVid || '';
    }
    return '';
  };
  const onWatchPage = () => !!videoIdFromUrl();
  const MARK_LIMIT = 50;

  // Seconds are what gets stored; hours only change how the label reads
  function clock(seconds, withHours) {
    const total = Math.max(0, Math.floor(seconds));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h || withHours ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  function parseClock(text) {
    const value = String(text).trim();
    if (/^\d+$/.test(value)) {
      const seconds = Number(value);
      return seconds <= 86400 ? seconds : null;
    }
    const match = /^(?:(\d+):)?([0-5]?\d):([0-5]\d)$/.exec(value);
    if (!match) return null;
    const hours = match[1] ? Number(match[1]) : 0;
    const seconds = hours * 3600 + Number(match[2]) * 60 + Number(match[3]);
    return seconds <= 86400 ? seconds : null;
  }

  const VIDEO_ID = /^[A-Za-z0-9_-]{6,}$/;

  const isMark = (mark) =>
    !!mark &&
    typeof mark === 'object' &&
    Number.isInteger(mark.t) &&
    mark.t >= 0 &&
    mark.t <= 86400 &&
    typeof mark.n === 'string' &&
    mark.n.length <= 60 &&
    Number.isFinite(mark.at);

  const markMap = () => {
    const raw = get('bookmarks', {});
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  };

  const marksFor = (id) => {
    const list = markMap()[id];
    return Array.isArray(list) ? list.filter(isMark) : [];
  };

  const isMarkMap = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return Object.entries(value).every(
      ([id, list]) => VIDEO_ID.test(id) && Array.isArray(list) && list.length <= MARK_LIMIT && list.every(isMark)
    );
  };

  function writeMarks(id, list) {
    const all = { ...markMap() };
    if (list.length) all[id] = list.slice().sort((a, b) => a.t - b.t);
    else delete all[id];
    put('bookmarks', all);
  }

  const VF_LIMIT = 255;
  const VF_PARAMS = [
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
  const VF_PARAM_KEYS = new Set(VF_PARAMS.map((p) => p.key));
  const VF_NEUTRAL = { ...Object.fromEntries(VF_PARAMS.map((p) => [p.key, p.def])), disabled: [] };
  const VF_PRESETS = [
    { id: 'normal', label: 'Normal', values: {} },
    { id: 'vivid', label: 'Vivid', values: { brightness: 103, contrast: 112, saturation: 125, sharpness: 20 } },
    { id: 'cinema', label: 'Cinema', values: { brightness: 96, contrast: 115, saturation: 92, gamma: 1.1 } },
    { id: 'warm', label: 'Warm / Night', values: { brightness: 88, contrast: 95, saturation: 90, sepia: 25, gamma: 0.95 } },
  ];
  const vfClamp = (num, min, max) => Math.min(max, Math.max(min, num));
  const vfRound = (p, val) => (p.step < 1 ? Math.round(val * 100) / 100 : Math.round(val));
  function vfNormalize(raw) {
    const out = { ...VF_NEUTRAL, disabled: [] };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const p of VF_PARAMS) {
      const v = Number(raw[p.key]);
      if (Number.isFinite(v)) out[p.key] = vfRound(p, vfClamp(v, p.min, p.max));
    }
    if (Array.isArray(raw.disabled)) {
      out.disabled = [...new Set(raw.disabled.filter((k) => VF_PARAM_KEYS.has(k)))].sort();
    }
    return out;
  }
  const vfIsOff = (f, key) => Array.isArray(f.disabled) && f.disabled.includes(key);
  const vfIsNeutral = (f) => VF_PARAMS.every((p) => vfIsOff(f, p.key) || f[p.key] === p.def);
  const vfEqual = (a, b) => {
    const da = Array.isArray(a.disabled) ? a.disabled : [];
    const db = Array.isArray(b.disabled) ? b.disabled : [];
    return da.length === db.length && da.every((k, i) => k === db[i]) && VF_PARAMS.every((p) => a[p.key] === b[p.key]);
  };
  const vfFormat = (p, val) => `${p.step < 1 ? Number(val).toFixed(2) : String(val)}${p.unit}`;
  function vfSummarize(f) {
    const parts = [];
    for (const p of VF_PARAMS) if (!vfIsOff(f, p.key) && f[p.key] !== p.def) parts.push(`${p.label} ${vfFormat(p, f[p.key])}`);
    return parts.length ? parts.join(', ') : 'Neutral';
  }
  function vfValidFilter(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    if ('disabled' in value && (!Array.isArray(value.disabled) || !value.disabled.every((k) => VF_PARAM_KEYS.has(k)))) return false;
    return VF_PARAMS.every((p) => {
      if (!(p.key in value)) return true;
      const v = value[p.key];
      return typeof v === 'number' && Number.isFinite(v) && v >= p.min && v <= p.max;
    });
  }
  function vfValidVideos(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const entries = Object.entries(value);
    if (entries.length > VF_LIMIT) return false;
    return entries.every(([id, entry]) =>
      VIDEO_ID.test(id) &&
      vfValidFilter(entry) &&
      (!('at' in entry) || (typeof entry.at === 'number' && Number.isFinite(entry.at))) &&
      (!('title' in entry) || (typeof entry.title === 'string' && entry.title.length <= 120))
    );
  }
  const vfReadGlobal = () => vfNormalize(get('vfGlobal', VF_NEUTRAL));
  const vfWriteGlobal = (f) => put('vfGlobal', vfNormalize(f));
  function vfReadVideos() {
    const raw = get('vfVideos', {});
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out = {};
    for (const [id, entry] of Object.entries(raw)) {
      if (!VIDEO_ID.test(id) || !entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const at = Number(entry.at);
      out[id] = {
        ...vfNormalize(entry),
        at: Number.isFinite(at) ? at : 0,
        title: typeof entry.title === 'string' ? entry.title.slice(0, 120) : '',
      };
    }
    return out;
  }
  const vfWriteVideos = (map) => put('vfVideos', map);
  function vfPageTitle() {
    const h1 = document.querySelector('ytd-watch-metadata h1, #title h1');
    return (h1?.textContent || document.title || '').replace(/\s*-\s*YouTube\s*$/, '').trim().slice(0, 120);
  }
  function vfSaveVideo(id, f, title = '') {
    if (!VIDEO_ID.test(id)) return;
    const map = vfReadVideos();
    map[id] = {
      ...vfNormalize(f),
      at: Date.now(),
      title: (title || map[id]?.title || vfPageTitle() || '').slice(0, 120),
    };
    const keys = Object.keys(map);
    if (keys.length > VF_LIMIT) {
      keys.sort((a, b) => (map[a].at || 0) - (map[b].at || 0));
      for (let i = 0; i < keys.length - VF_LIMIT; i++) delete map[keys[i]];
    }
    vfWriteVideos(map);
  }
  function vfDeleteVideo(id) {
    const map = vfReadVideos();
    if (!(id in map)) return;
    delete map[id];
    vfWriteVideos(map);
  }
  let vfRefreshAll = () => {};
  const vfPanelFilter = { query: '', sort: 'newest' };
  function vfDetectMode(values, includeGlobal) {
    if (includeGlobal) {
      const glob = vfReadGlobal();
      if (!vfIsNeutral(glob) && vfEqual(values, glob)) return 'global';
    }
    for (const preset of VF_PRESETS) {
      if (vfEqual(values, vfNormalize({ ...VF_NEUTRAL, ...preset.values }))) return preset.id;
    }
    return 'custom';
  }

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
  const GRID_COLUMNS = [[2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6'], [7, '7'], [8, '8']];

  const FEATURES = [
    {
      id: 'general',
      def: true,
      title: 'YouTube: General Custom',
      short: 'General Custom',
      desc: 'Grid layout, Open Shorts in Watch Page, and Clean Share Link in one place.',
      subsections: [
        {
          id: 'grid',
          title: 'Custom Grid',
          desc: 'Sets a custom number of videos per row on YouTube grids, scaling cards down uniformly.',
          rows: [
            { key: 'gridOn', label: 'Enable Custom Grid', type: 'toggle', def: true },
            { key: 'gridColumns', label: 'Videos per row', type: 'choice', def: 4, options: GRID_COLUMNS },
            { key: 'gridHome', label: 'Home', type: 'toggle', group: 'Sections', def: true },
            { key: 'gridSubscriptions', label: 'Subscriptions', type: 'toggle', group: 'Sections', def: true },
            { key: 'gridChannel', label: 'Channel', type: 'toggle', group: 'Sections', def: true },
            { key: 'gridOther', label: 'Other grids', type: 'toggle', group: 'Sections', def: true },
          ],
          summary: () => (get('gridOn', true) === true ? `${read(rowOf('gridColumns'))}/row` : 'Off'),
        },
        {
          id: 'shorts',
          title: 'Shorts',
          desc: 'Opens Shorts in the normal watch player by rewriting /shorts/ links to /watch.',
          rows: [{ key: 'shortsToWatch', label: 'Open Shorts in Watch Page', type: 'toggle', def: false }],
          summary: () => (get('shortsToWatch', false) === true ? 'On' : 'Off'),
        },
        {
          id: 'share',
          title: 'Share Link',
          desc: 'Removes si, pp and other tracking parameters from copied share links and optionally the address bar.',
          rows: [
            { key: 'cleanShare', label: 'Clean copied share links', type: 'toggle', def: true },
            { key: 'shareAddress', label: 'Clean address bar', type: 'toggle', def: false },
          ],
          summary: () => (get('cleanShare', true) === true ? (get('shareAddress', false) === true ? 'Share + URL' : 'On') : 'Off'),
        },
      ],
    },
    {
      id: 'playback',
      def: true,
      title: 'YouTube: Playback Custom',
      short: 'Playback Custom',
      desc: 'Quality, speed, theater mode, autoplay behavior, watch page tweaks, and video bookmarks.',
      subsections: [
        {
          id: 'video',
          title: 'Video & Audio',
          desc: 'Default quality, speed, theater mode, volume, subtitles, and audio track.',
          rows: [
            { key: 'quality', label: 'Quality', type: 'choice', def: 'auto', options: QUALITY },
            { key: 'speed', label: 'Speed', type: 'choice', def: 'leave', options: SPEEDS },
            { key: 'hotkeys', label: 'Speed hotkeys', type: 'toggle', def: false },
            { key: 'theater', label: 'Theater mode', type: 'choice', def: 'leave', options: THEATERS },
            { key: 'volume', label: 'Volume', type: 'choice', def: 'leave', options: VOLUMES },
            { key: 'subtitles', label: 'Subtitles', type: 'choice', def: 'leave', options: SUBTITLES },
            { key: 'audio', label: 'Audio track', type: 'choice', def: 'leave', options: AUDIOS },
          ],
          summary: () => {
            const q = QUALITY.find(([v]) => v === get('quality', 'auto'))?.[1] || 'Auto';
            const s = get('speed', 'leave');
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
            { key: 'limit', label: 'Video limit', type: 'choice', def: 0, options: LIMITS },
            { key: 'skipShorts', label: 'Skip Shorts', type: 'toggle', def: false },
            { key: 'pauseHidden', label: 'Pause when tab hidden', type: 'toggle', def: false },
            { key: 'pauseBlur', label: 'Pause when window loses focus', type: 'toggle', def: false },
          ],
          summary: () => BEHAVIORS.find(([v]) => v === get('behavior', 'leave'))?.[1] || 'Leave as-is',
        },
        {
          id: 'watch',
          title: 'Watch Page',
          desc: 'Automatic watch-page adjustments while opening a video.',
          rows: [{ key: 'expandDesc', label: 'Auto expand description', type: 'toggle', def: true }],
          summary: () => (get('expandDesc', true) === true ? 'Expand on' : 'Off'),
        },
        {
          id: 'bookmarks',
          title: 'Video Bookmarks',
          desc: 'Save labelled timestamp bookmarks, jump back to them, or copy as chapters.',
          rows: [
            { key: 'bookmarksOn', label: 'Enable Video Bookmarks (hotkey b)', type: 'toggle', def: false },
            { key: 'bookmarks', label: 'Show video bookmarks', type: 'list', def: {} },
          ],
          summary: () => {
            if (get('bookmarksOn', false) !== true) return 'Off';
            const id = videoIdFromUrl();
            const count = id ? marksFor(id).length : 0;
            return count ? `On (${count})` : 'On';
          },
        },
      ],
    },
    {
      id: 'playlistTools',
      def: true,
      title: 'YouTube: Playlist Tools',
      short: 'Playlist Tools',
      desc: 'Watch Later Tools, Playlist Tools, Liked Videos Tools, and Watch Page playlist length.',
      subsections: [
        {
          id: 'wl',
          title: 'Watch Later (WL)',
          desc: 'Dedicated Watch Later Tools on /playlist?list=WL.',
          rows: [
            { key: 'wlOn', label: 'Enable on Watch Later', type: 'toggle', def: true },
            {
              key: 'playlistClearMode',
              label: 'Default clear mode',
              type: 'choice',
              def: 'unavailable-only',
              options: [
                ['unavailable-only', 'Clear unavailable only'],
                ['skip-unavailable', 'Skip unavailable'],
                ['skip-deleted', 'Skip deleted'],
                ['skip-private', 'Skip private'],
                ['none', 'Delete all'],
              ],
            },
            { key: 'playlistWatchedThreshold', label: 'Watched threshold (%)', type: 'number', min: 10, max: 100, def: 80 },
            { key: 'playlistShowFilterBar', label: 'Show search & filter bar', type: 'toggle', def: true },
            { key: 'playlistShowDuration', label: 'Show total duration badge', type: 'toggle', def: true },
          ],
          summary: () => (get('wlOn', true) === true ? 'On' : 'Off'),
        },
        {
          id: 'normal',
          title: 'Normal Playlists',
          desc: 'Bulk cleanup, search and filter, duration, export, and import on regular playlists.',
          rows: [
            { key: 'normalOn', label: 'Enable on Normal Playlists', type: 'toggle', def: true },
            {
              key: 'playlistExportScope',
              label: 'Default export scope',
              type: 'choice',
              def: 'unavailable-all',
              options: [
                ['unavailable-all', 'Unavailable: All'],
                ['unavailable-deleted', 'Unavailable: Deleted'],
                ['unavailable-private', 'Unavailable: Private'],
                ['available', 'Available'],
                ['all', 'All'],
              ],
            },
            {
              key: 'playlistExportFormat',
              label: 'Default export format',
              type: 'choice',
              def: 'md',
              options: [
                ['md', 'Markdown (.md)'],
                ['txt', 'Plain URLs (.txt)'],
              ],
            },
            { key: 'playlistResolveTitles', label: 'Resolve unavailable titles', type: 'toggle', def: false },
            { key: 'playlistImportSkipExisting', label: 'Skip existing on import', type: 'toggle', def: true },
          ],
          summary: () => (get('normalOn', true) === true ? 'On' : 'Off'),
        },
        {
          id: 'liked',
          title: 'Liked Videos (LL)',
          desc: 'Dedicated Liked Videos Tools on /playlist?list=LL.',
          rows: [
            { key: 'likedOn', label: 'Enable on Liked Videos', type: 'toggle', def: true },
            {
              key: 'likedClearMode',
              label: 'Default clear mode',
              type: 'choice',
              def: 'unavailable-only',
              options: [
                ['unavailable-only', 'Unlike unavailable only'],
                ['unavailable-deleted', 'Unlike deleted only'],
                ['unavailable-private', 'Unlike private only'],
                ['skip-unavailable', 'Skip unavailable (unlike available)'],
                ['skip-deleted', 'Skip deleted'],
                ['skip-private', 'Skip private'],
                ['none', 'Unlike all'],
              ],
            },
            { key: 'likedWatchedThreshold', label: 'Watched threshold (%)', type: 'number', min: 10, max: 100, def: 80 },
            {
              key: 'likedExportFormat',
              label: 'Default export format',
              type: 'choice',
              def: 'md',
              options: [
                ['md', 'Markdown (.md)'],
                ['txt', 'Plain URLs (.txt)'],
              ],
            },
            { key: 'likedResolveTitles', label: 'Resolve unavailable titles on export', type: 'toggle', def: false },
            { key: 'likedShowDuration', label: 'Show total duration badge', type: 'toggle', def: true },
            { key: 'likedShowFilterBar', label: 'Show search & filter bar', type: 'toggle', def: true },
          ],
          summary: () => (get('likedOn', true) === true ? 'On' : 'Off'),
        },
        {
          id: 'watch',
          title: 'Watch Page',
          desc: 'Shows how long the playlist is and how much is left in the watch-page playlist panel.',
          rows: [{ key: 'playlistLength', label: 'Show Playlist Length on /watch', type: 'toggle', def: true }],
          summary: () => (get('playlistLength', true) === true ? 'Length on' : 'Off'),
        },
      ],
    },
    {
      id: 'quiet',
      def: true,
      title: 'YouTube: Quiet Page',
      short: 'Quiet Page',
      desc: 'Stops previews and paused prompts, hides Members-only cards, People Mentioned, and page/sidebar clutter.',
      subsections: [
        {
          id: 'playback',
          title: 'Playback',
          desc: 'Thumbnail previews, end screens, ambient glow, and "Continue watching?" prompts.',
          rows: [
            { key: 'quietPreviews', label: 'Stop thumbnail previews', type: 'toggle', def: true },
            { key: 'quietEndScreen', label: 'Hide end screen', type: 'toggle', def: true },
            { key: 'quietAmbient', label: 'Disable ambient mode', type: 'toggle', def: true },
            { key: 'answer', label: 'Dismiss paused prompt', type: 'choice', def: 'yes', options: PROMPTS },
          ],
          summary: () => {
            const t = ['quietPreviews', 'quietEndScreen', 'quietAmbient'].filter((k) => get(k, true) === true).length;
            const p = get('answer', 'yes') !== 'leave' ? 1 : 0;
            return `${t + p} of 4 on`;
          },
        },
        {
          id: 'feed',
          title: 'Feed & Cards',
          desc: 'Members-only/Premium, People Mentioned, Shorts shelves, and feed clutter.',
          rows: [
            { key: 'quietMembersOnly', label: 'Hide Members-only & Premium', type: 'toggle', def: true },
            { key: 'quietPeopleMentioned', label: 'Hide People Mentioned', type: 'toggle', def: true },
            { key: 'quietShorts', label: 'Hide Shorts shelves', type: 'toggle', def: false },
            { key: 'quietChips', label: 'Hide filter chips', type: 'toggle', def: false },
            { key: 'quietPosts', label: 'Hide community posts', type: 'toggle', def: false },
            { key: 'quietNudges', label: 'Hide feed nudges', type: 'toggle', def: false },
            { key: 'quietPromos', label: 'Hide promo banners', type: 'toggle', def: false },
          ],
          summary: () => {
            const sub = featureById('quiet').subsections[1];
            return `${sub.rows.filter((r) => get(r.key, r.def) === true).length} of ${sub.rows.length} on`;
          },
        },
        {
          id: 'watch',
          title: 'Watch & Channel',
          desc: 'Optional panels on watch and channel pages.',
          rows: [
            { key: 'quietComments', label: 'Hide comments', type: 'toggle', def: false },
            { key: 'quietChat', label: 'Hide live chat', type: 'toggle', def: false },
            { key: 'quietMerch', label: 'Hide merch shelf', type: 'toggle', def: false },
            { key: 'quietDonation', label: 'Hide donation shelves', type: 'toggle', def: false },
            { key: 'quietClarification', label: 'Hide info panels', type: 'toggle', def: false },
            { key: 'quietInfoPanels', label: 'Hide large info panels', type: 'toggle', def: false },
            { key: 'quietPlaylist', label: 'Hide playlist panel', type: 'toggle', def: false },
            { key: 'quietChannelVideo', label: 'Hide channel featured video', type: 'toggle', def: false },
            { key: 'quietSuggested', label: 'Hide player suggestion bubble', type: 'toggle', def: false },
            { key: 'quietMiniplayer', label: 'Hide miniplayer', type: 'toggle', def: false },
          ],
          summary: () => {
            const sub = featureById('quiet').subsections[2];
            return `${sub.rows.filter((r) => get(r.key, r.def) === true).length} of ${sub.rows.length} on`;
          },
        },
        {
          id: 'sidebar',
          title: 'Sidebar',
          desc: 'Left navigation drawer sections.',
          rows: [
            { key: 'quietShortsEntry', label: 'Hide Shorts entry', type: 'toggle', def: false },
            { key: 'quietSidebarYou', label: 'Hide You section', type: 'toggle', def: false },
            { key: 'quietSidebarSubscriptions', label: 'Hide Subscriptions section', type: 'toggle', def: false },
            { key: 'quietSidebarExplore', label: 'Hide Explore section', type: 'toggle', def: false },
            { key: 'quietSidebarMore', label: 'Hide More from YouTube', type: 'toggle', def: false },
            { key: 'quietSidebarFooter', label: 'Hide sidebar footer', type: 'toggle', def: false },
          ],
          summary: () => {
            const sub = featureById('quiet').subsections[3];
            return `${sub.rows.filter((r) => get(r.key, r.def) === true).length} of ${sub.rows.length} on`;
          },
        },
      ],
    },
    {
      id: 'videoFilter',
      def: true,
      title: 'YouTube: Video Filter',
      short: 'Video Filter',
      desc: 'Real-time video visual filters (brightness, contrast, saturation, hue, sepia, grayscale, invert, gamma, sharpness) with presets, global defaults, and per-video overrides.',
      subsections: [
        {
          id: 'vf-global',
          title: 'Global Default',
          desc: 'Applies to every watch page unless that video has a saved override.',
          rows: [],
          summary: () => (vfIsNeutral(vfReadGlobal()) ? 'Neutral' : 'Custom'),
        },
        {
          id: 'vf-videos',
          title: 'Saved Videos',
          desc: 'Manage per-video filter overrides (up to 255 saved videos).',
          rows: [],
          summary: () => `${Object.keys(vfReadVideos()).length}/${VF_LIMIT}`,
        },
      ],
    },
  ];
  for (const f of FEATURES) f.rows = f.subsections.flatMap((s) => s.rows);

  const featureById = (id) => FEATURES.find((f) => f.id === id);
  const rowOf = (key) => {
    for (const feature of FEATURES) {
      for (const row of feature.rows) if (row.key === key) return row;
    }
    return null;
  };

  // Maps legacy per-feature checks onto the 4 consolidated modules + sub-toggles
  const moduleOn = (id) => {
    const feature = featureById(id);
    return get(`${id}On`, feature ? feature.def : true) === true;
  };
  const featureOn = (id) => {
    if (id === 'general' || id === 'playback' || id === 'quiet') return moduleOn(id);
    if (id === 'grid') return moduleOn('general') && get('gridOn', true) === true;
    if (id === 'shorts') return moduleOn('general') && get('shortsToWatch', false) === true;
    if (id === 'share') return moduleOn('general') && get('cleanShare', true) === true;
    if (id === 'resolution' || id === 'autoplay') return moduleOn('playback');
    if (id === 'expand') return moduleOn('playback') && get('expandDesc', true) === true;
    if (id === 'bookmarks') return moduleOn('playback') && get('bookmarksOn', false) === true;
    if (id === 'playlistTools') {
      if (!moduleOn('playlistTools')) return false;
      const list = new URLSearchParams(location.search).get('list') || '';
      return list === 'WL' ? get('wlOn', true) === true : get('normalOn', true) === true;
    }
    if (id === 'likedTools') return moduleOn('playlistTools') && get('likedOn', true) === true;
    if (id === 'playlist') return moduleOn('playlistTools') && get('playlistLength', true) === true;
    if (id === 'paused') return moduleOn('quiet');
    if (id === 'members') return moduleOn('quiet') && get('quietMembersOnly', true) === true;
    if (id === 'people') return moduleOn('quiet') && get('quietPeopleMentioned', true) === true;
    return moduleOn(id);
  };

  function read(row) {
    const v = get(row.key, row.def);
    if (row.type === 'toggle') return v === true;
    if (row.type === 'list') return v && typeof v === 'object' && !Array.isArray(v) ? v : row.def;
    if (row.type === 'number') return Number.isInteger(v) && v >= row.min && v <= row.max ? v : row.def;
    return row.options.some(([value]) => value === v) ? v : row.def;
  }

  function valueLabel(row) {
    const value = read(row);
    if (row.type === 'toggle') return value ? 'On' : 'Off';
    if (row.type === 'number') return `${value}%`;
    if (row.type === 'list') {
      const id = videoIdFromUrl();
      const count = id ? marksFor(id).length : 0;
      return count ? `${count} mark${count === 1 ? '' : 's'}` : 'None';
    }
    const hit = row.options.find(([v]) => v === value);
    return hit ? hit[1] : String(value);
  }

  const CSS = `
#ytc-panel,#ytc-panel *{box-sizing:border-box}
#ytc-backdrop{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.68)}
#ytc-panel{width:clamp(320px,88vw,420px);height:calc(100vh - 24px);height:min(76dvh,560px);overflow:auto;padding:0 0 10px;border-radius:14px;background:var(--yt-spec-base-background,#fff);color:var(--yt-spec-text-primary,#0f0f0f);box-shadow:0 16px 40px rgba(0,0,0,.45);font-family:Roboto,Arial,sans-serif;font-size:14px;scroll-padding-top:63px}
#ytc-panel .ytc-header{position:sticky;top:0;z-index:2;display:grid;grid-template-columns:44px 1fr 44px;align-items:center;gap:4px;padding:6px 8px;background:var(--yt-spec-base-background,#fff);border-bottom:1px solid var(--yt-spec-10-percent-layer,rgba(128,128,128,.3))}
#ytc-panel .ytc-title-wrap{min-width:0;text-align:center}
#ytc-panel .ytc-crumb{display:block;font-size:11px;line-height:1.25;color:var(--yt-spec-text-secondary,#606060);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#ytc-panel .ytc-spacer{width:44px;height:44px}
#ytc-panel h2{margin:0;padding:0;font-size:15px;font-weight:600;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#ytc-panel .ytc-group.is-disabled{opacity:.42;pointer-events:none;user-select:none}
#ytc-panel .ytc-reset-armed{color:#e05a52;font-weight:500}
#ytc-panel .ytc-close,#ytc-panel .ytc-back{width:44px;height:44px;min-height:44px;justify-content:center;padding:0;border-radius:50%;font-size:18px;line-height:1}
#ytc-panel .ytc-close{font-size:22px}
#ytc-panel .ytc-desc{margin:12px 0 0;padding:0 20px;font-size:13px;line-height:1.5;color:var(--yt-spec-text-secondary,#606060)}
#ytc-panel hr{margin:14px 20px 16px;border:0;border-top:1px solid var(--yt-spec-10-percent-layer,rgba(128,128,128,.3))}
#ytc-panel .ytc-section{display:block;margin:0;padding:8px 20px 2px;font-size:12px;font-weight:500;color:var(--yt-spec-text-secondary,#606060)}
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
#ytc-panel .ytc-row{display:flex;align-items:center;padding-right:6px}
#ytc-panel .ytc-row .ytc-main{flex:1;min-width:0;padding-right:4px}
#ytc-panel .ytc-row .ytc-time{flex:0 0 60px;font-variant-numeric:tabular-nums;color:var(--yt-spec-text-secondary,#606060)}
#ytc-panel .ytc-row .ytc-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#ytc-panel .ytc-icon{flex:0 0 44px;width:44px;height:44px;min-height:44px;padding:0;justify-content:center;border-radius:50%;font-size:18px;color:var(--yt-spec-text-secondary,#606060)}
#ytc-panel .ytc-armed .ytc-name{font-weight:600;color:var(--yt-spec-text-primary,#0f0f0f)}
#ytc-panel svg{display:block;width:1em;height:1em;fill:currentColor}
#ytc-panel input{display:block;width:calc(100% - 40px);min-height:44px;margin:0 20px 8px;padding:0 12px;border:1px solid var(--yt-spec-10-percent-layer,rgba(128,128,128,.45));border-radius:8px;background:var(--yt-spec-badge-chip-background,rgba(0,0,0,.05));color:inherit;font:inherit;font-size:14px}
#ytc-panel input:focus-visible{outline:2px solid var(--yt-spec-call-to-action,#065fd4);outline-offset:-2px}
#ytc-panel .ytc-empty{margin:0;padding:10px 20px 16px;font-size:13px;line-height:1.5;color:var(--yt-spec-text-secondary,#606060)}
#ytc-panel .ytc-error{margin:0;padding:0 20px 8px;font-size:12px;line-height:1.4;color:#c00}
#ytc-panel .ytc-vf-box{padding:8px 20px 12px;display:flex;flex-direction:column;gap:10px}
#ytc-panel .ytc-vf-mode-row{display:grid;grid-template-columns:56px 1fr;align-items:center;gap:8px}
#ytc-panel .ytc-vf-mode-row label{font-size:13px}
#ytc-panel .ytc-vf-select,#ytc-panel .ytc-vf-search{min-height:34px;margin:0;padding:4px 10px;border-radius:8px;border:1px solid var(--yt-spec-10-percent-layer,rgba(128,128,128,.32));background:var(--yt-spec-badge-chip-background,rgba(128,128,128,.08));color:inherit;font:inherit;font-size:13px}
#ytc-panel .ytc-vf-srow{display:grid;grid-template-columns:18px 76px 1fr 52px;align-items:center;gap:6px}
#ytc-panel .ytc-vf-srow.is-muted label{opacity:.48;text-decoration:line-through}
#ytc-panel .ytc-vf-srow.is-muted input[type="range"],#ytc-panel .ytc-vf-srow.is-muted .ytc-vf-sval{opacity:.42}
#ytc-panel .ytc-vf-srow input[type="checkbox"]{width:15px;height:15px;min-height:15px;margin:0;padding:0;accent-color:var(--yt-spec-call-to-action,#3ea6ff);cursor:pointer}
#ytc-panel .ytc-vf-srow label{font-size:13px;cursor:pointer;user-select:none}
#ytc-panel .ytc-vf-srow input[type="range"]{width:100%;min-height:24px;margin:0;padding:0;border:0;background:none;accent-color:var(--yt-spec-call-to-action,#3ea6ff)}
#ytc-panel .ytc-vf-sval{width:auto;min-height:24px;padding:0;justify-content:flex-end;font-size:12px;color:var(--yt-spec-text-secondary,#606060);font-variant-numeric:tabular-nums}
#ytc-panel .ytc-vf-vbar{display:flex;gap:8px;padding:8px 20px 6px}
#ytc-panel .ytc-vf-vbar .ytc-vf-search{flex:1 1 auto;min-width:0;width:auto}
#ytc-panel .ytc-vf-vbar .ytc-vf-select{flex:0 0 auto;max-width:136px}
#ytc-panel .ytc-vf-vitem{display:flex;align-items:center;gap:8px;padding:8px 20px;border-bottom:1px solid var(--yt-spec-10-percent-layer,rgba(128,128,128,.14))}
#ytc-panel .ytc-vf-vinfo{flex:1 1 auto;min-width:0}
#ytc-panel .ytc-vf-vtitle{font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#ytc-panel .ytc-vf-vmeta{font-size:11.5px;color:var(--yt-spec-text-secondary,#606060);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#ytc-panel .ytc-vf-vrm{width:auto;min-height:30px;padding:0 10px;border-radius:8px;font-size:12px;color:#e05a52}
@media (prefers-reduced-motion:reduce){#ytc-panel .ytc-switch,#ytc-panel .ytc-switch::after{transition:none}}
`;

  let panelState = null;

  let lastFocus = null;

  function closePanel() {
    document.removeEventListener('keydown', panelKey, true);
    document.getElementById('ytc-backdrop')?.remove();
    document.getElementById('ytc-style')?.remove();
    panelState = null;
    armedFeature = null;
    resetArmed = false;
    armedMark = null;
    if (lastFocus && lastFocus.isConnected) lastFocus.focus();
    lastFocus = null;
  }

  function panelKey(e) {
    // The add dialog owns every key while it is open, including Tab and Escape
    if (document.getElementById('ytc-dialog')) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (panelState && panelState.view === 'edit') {
        panelState.view = 'list';
        render();
        return;
      }
      if (panelState && (panelState.view === 'featureBackup' || panelState.view === 'number' || panelState.view === 'options')) {
        panelState.view = panelState.sub ? 'sub' : 'settings';
        render();
        return;
      }
      if (panelState && panelState.view === 'sub') {
        panelState.view = 'settings';
        panelState.sub = null;
        render();
        return;
      }
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

  function panelHeader(titleText, onBack, crumb) {
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
    } else {
      const spacer = document.createElement('span');
      spacer.className = 'ytc-spacer';
      spacer.setAttribute('aria-hidden', 'true');
      bar.append(spacer);
    }
    const wrap = document.createElement('div');
    wrap.className = 'ytc-title-wrap';
    if (crumb) {
      const c = document.createElement('span');
      c.className = 'ytc-crumb';
      c.textContent = crumb;
      wrap.append(c);
    }
    const title = document.createElement('h2');
    title.textContent = titleText;
    wrap.append(title);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'ytc-close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '\u00d7';
    close.addEventListener('click', closePanel);
    bar.append(wrap, close);
    return bar;
  }

  function backToHub() {
    armedFeature = null;
    resetArmed = false;
    armedMark = null;
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
    if (panelState.view === 'list') {
      renderMarkList(panel);
      return;
    }
    if (panelState.view === 'edit') {
      renderMarkEditor(panel);
      return;
    }
    if (panelState.view === 'featureBackup') {
      renderFeatureBackup(panel);
      return;
    }
    const feature = featureById(panelState.feature);
    if (!feature) {
      // Nothing valid to show: fall back to the hub rather than leaving stale rows
      panel.textContent = '';
      renderHub(panel);
      return;
    }
    if (panelState.view === 'number') {
      const row = feature.rows.find((r) => r.key === panelState.rowKey);
      const sub = feature.subsections?.find((s) => s.id === panelState.sub);
      const backView = sub ? 'sub' : 'settings';
      if (!row) {
        panelState.view = backView;
        render();
        return;
      }
      panel.textContent = '';
      panel.append(
        panelHeader(row.label, () => {
          panelState.view = backView;
          render();
        }, sub ? `${feature.short} \u203a ${sub.title}` : feature.short)
      );
      panel.setAttribute('aria-label', row.label);
      const lbl = document.createElement('label');
      lbl.className = 'ytc-label';
      lbl.setAttribute('for', 'ytc-number-input');
      lbl.textContent = `Value (${row.min} to ${row.max})`;
      const inp = document.createElement('input');
      inp.id = 'ytc-number-input';
      inp.type = 'number';
      inp.min = String(row.min);
      inp.max = String(row.max);
      inp.value = String(read(row));
      const save = document.createElement('button');
      save.type = 'button';
      save.textContent = 'Save';
      save.addEventListener('click', () => {
        const n = Math.min(row.max, Math.max(row.min, Math.round(Number(inp.value) || row.def)));
        put(row.key, n);
        panelState.view = backView;
        render();
        notifyChange();
      });
      panel.append(lbl, inp, save);
      inp.focus();
      return;
    }
    if (panelState.view === 'options') {
      const row = feature.rows.find((r) => r.key === panelState.rowKey);
      const sub = feature.subsections?.find((s) => s.id === panelState.sub);
      const backView = sub ? 'sub' : 'settings';
      if (!row) {
        panelState.view = backView;
        render();
        return;
      }
      panel.textContent = '';
      panel.append(
        panelHeader(row.label, () => {
          panelState.view = backView;
          render();
        }, sub ? `${feature.short} \u203a ${sub.title}` : feature.short)
      );
      panel.setAttribute('aria-label', row.label);

      const current = read(row);
      for (const [value, label] of row.options) {
        panel.append(
          optionRow(label, current === value, () => {
            put(row.key, value);
            panelState.view = backView;
            render();
            notifyChange();
          })
        );
      }
    } else if (panelState.view === 'sub') {
      const sub = feature.subsections?.find((s) => s.id === panelState.sub);
      if (!sub) {
        panelState.view = 'settings';
        render();
        return;
      }
      panel.textContent = '';
      const bar = panelHeader(sub.title, () => {
        panelState.view = 'settings';
        panelState.sub = null;
        render();
      }, feature.short);
      const desc = document.createElement('p');
      desc.className = 'ytc-desc';
      desc.textContent = sub.desc;
      panel.append(bar, desc, document.createElement('hr'));
      panel.setAttribute('aria-label', sub.title);

      if (sub.id === 'vf-global') {
        const box = document.createElement('div');
        box.className = 'ytc-vf-box';
        let glob = vfReadGlobal();
        const commitGlobal = (next) => {
          glob = vfNormalize(next);
          vfWriteGlobal(glob);
          notifyChange();
        };
        const modeRow = document.createElement('div');
        modeRow.className = 'ytc-vf-mode-row';
        const modeLab = document.createElement('label');
        modeLab.htmlFor = 'ytc-vf-g-mode';
        modeLab.textContent = 'Mode';
        const modeSelect = document.createElement('select');
        modeSelect.id = 'ytc-vf-g-mode';
        modeSelect.className = 'ytc-vf-select';
        modeSelect.setAttribute('aria-label', 'Global filter mode');
        for (const [val, label] of [...VF_PRESETS.map((pr) => [pr.id, pr.label]), ['custom', 'Custom']]) {
          const opt = document.createElement('option');
          opt.value = val;
          opt.textContent = label;
          modeSelect.append(opt);
        }
        modeSelect.value = vfDetectMode(glob, false);
        modeSelect.addEventListener('change', () => {
          if (modeSelect.value === 'custom') return;
          const preset = VF_PRESETS.find((pr) => pr.id === modeSelect.value);
          if (!preset) return;
          commitGlobal({ ...VF_NEUTRAL, ...preset.values });
          render();
        });
        modeRow.append(modeLab, modeSelect);
        box.append(modeRow);
        for (const p of VF_PARAMS) {
          const off = vfIsOff(glob, p.key);
          const row = document.createElement('div');
          row.className = off ? 'ytc-vf-srow is-muted' : 'ytc-vf-srow';
          const chk = document.createElement('input');
          chk.type = 'checkbox';
          chk.id = `ytc-vf-ge-${p.key}`;
          chk.checked = !off;
          chk.setAttribute('aria-label', `Toggle ${p.label}`);
          const lab = document.createElement('label');
          lab.htmlFor = `ytc-vf-ge-${p.key}`;
          lab.title = `Click to toggle ${p.label}`;
          lab.textContent = p.label;
          const input = document.createElement('input');
          input.type = 'range';
          input.id = `ytc-vf-g-${p.key}`;
          input.min = String(p.min);
          input.max = String(p.max);
          input.step = String(p.step);
          input.value = String(glob[p.key]);
          const valBtn = document.createElement('button');
          valBtn.type = 'button';
          valBtn.className = 'ytc-vf-sval';
          valBtn.textContent = vfFormat(p, glob[p.key]);
          const syncRow = () => {
            const muted = vfIsOff(glob, p.key);
            row.className = muted ? 'ytc-vf-srow is-muted' : 'ytc-vf-srow';
            chk.checked = !muted;
            input.value = String(glob[p.key]);
            valBtn.textContent = vfFormat(p, glob[p.key]);
            modeSelect.value = vfDetectMode(glob, false);
          };
          chk.addEventListener('change', () => {
            const nextDisabled = new Set(glob.disabled || []);
            if (chk.checked) nextDisabled.delete(p.key);
            else nextDisabled.add(p.key);
            commitGlobal({ ...glob, disabled: [...nextDisabled] });
            syncRow();
          });
          const update = (v) => {
            const nextDisabled = (glob.disabled || []).filter((k) => k !== p.key);
            commitGlobal({ ...glob, [p.key]: v, disabled: nextDisabled });
            syncRow();
          };
          input.addEventListener('input', () => update(Number(input.value)));
          valBtn.addEventListener('click', () => update(p.def));
          row.append(chk, lab, input, valBtn);
          box.append(row);
        }
        panel.append(box);
        return;
      }

      if (sub.id === 'vf-videos') {
        const allEntries = Object.entries(vfReadVideos());
        if (!allEntries.length) {
          const empty = document.createElement('p');
          empty.className = 'ytc-empty';
          empty.textContent = 'No per-video filters saved yet. Use the Video Filter button in the player to save one.';
          panel.append(empty);
        } else {
          const vbar = document.createElement('div');
          vbar.className = 'ytc-vf-vbar';
          const search = document.createElement('input');
          search.type = 'search';
          search.id = 'ytc-vf-vsearch';
          search.className = 'ytc-vf-search';
          search.placeholder = 'Search title, ID, or filter...';
          search.setAttribute('aria-label', 'Search saved videos');
          search.value = vfPanelFilter.query;

          const sortSel = document.createElement('select');
          sortSel.id = 'ytc-vf-vsort';
          sortSel.className = 'ytc-vf-select';
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
          sortSel.value = vfPanelFilter.sort;
          vbar.append(search, sortSel);
          panel.append(vbar);

          const listBox = document.createElement('div');
          listBox.id = 'ytc-vf-vlist';
          panel.append(listBox);

          const drawList = () => {
            listBox.textContent = '';
            const q = vfPanelFilter.query.trim().toLowerCase();
            let filtered = Object.entries(vfReadVideos());
            if (q) {
              filtered = filtered.filter(([id, entry]) =>
                id.toLowerCase().includes(q) ||
                (entry.title || '').toLowerCase().includes(q) ||
                vfSummarize(entry).toLowerCase().includes(q)
              );
            }
            filtered.sort((a, b) => {
              if (vfPanelFilter.sort === 'oldest') return (a[1].at || 0) - (b[1].at || 0);
              if (vfPanelFilter.sort === 'az') return (a[1].title || a[0]).localeCompare(b[1].title || b[0], 'en', { sensitivity: 'base' });
              if (vfPanelFilter.sort === 'za') return (b[1].title || b[0]).localeCompare(a[1].title || a[0], 'en', { sensitivity: 'base' });
              return (b[1].at || 0) - (a[1].at || 0);
            });
            if (!filtered.length) {
              const none = document.createElement('p');
              none.className = 'ytc-empty';
              none.textContent = 'No matching saved videos.';
              listBox.append(none);
              return;
            }
            for (const [id, entry] of filtered) {
              const item = document.createElement('div');
              item.className = 'ytc-vf-vitem';
              const info = document.createElement('div');
              info.className = 'ytc-vf-vinfo';
              const t = document.createElement('div');
              t.className = 'ytc-vf-vtitle';
              t.textContent = entry.title || id;
              const m = document.createElement('div');
              m.className = 'ytc-vf-vmeta';
              m.textContent = `${id} · ${vfSummarize(entry)}`;
              info.append(t, m);
              const rm = document.createElement('button');
              rm.type = 'button';
              rm.className = 'ytc-vf-vrm';
              rm.textContent = 'Remove';
              rm.addEventListener('click', () => {
                vfDeleteVideo(id);
                notifyChange();
                if (!Object.keys(vfReadVideos()).length) render();
                else drawList();
              });
              item.append(info, rm);
              listBox.append(item);
            }
          };

          search.addEventListener('input', () => {
            vfPanelFilter.query = search.value;
            drawList();
          });
          sortSel.addEventListener('change', () => {
            vfPanelFilter.sort = sortSel.value;
            drawList();
          });
          drawList();

          const clearAll = document.createElement('button');
          clearAll.type = 'button';
          clearAll.className = 'ytc-reset-armed';
          clearAll.textContent = 'Clear all saved videos';
          clearAll.addEventListener('click', () => {
            vfWriteVideos({});
            vfPanelFilter.query = '';
            notifyChange();
            render();
          });
          panel.append(document.createElement('hr'), clearAll);
        }
        return;
      }

      let group = null;
      for (const row of sub.rows) {
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
              button.setAttribute('aria-pressed', String(read(row)));
              notifyChange();
              return;
            }
            if (row.type === 'list') {
              panelState.view = 'list';
              render();
              return;
            }
            if (row.type === 'number') {
              panelState.view = 'number';
              panelState.rowKey = row.key;
              render();
              return;
            }
            panelState.view = 'options';
            panelState.rowKey = row.key;
            render();
          },
          isToggle ? read(row) : undefined
        );
        if (!isToggle) button.append(chevron());
        panel.append(button);
      }
      if (sub.id === 'bookmarks') {
        const backup = settingRow('Backup', 'JSON', () => {
          panelState.view = 'featureBackup';
          render();
        });
        backup.append(chevron());
        panel.append(backup);
      }
    } else {
      panel.textContent = '';
      const bar = panelHeader(feature.short, backToHub, 'Custom Collection');
      const desc = document.createElement('p');
      desc.className = 'ytc-desc';
      desc.textContent = feature.desc;
      panel.append(bar, desc, document.createElement('hr'));
      panel.setAttribute('aria-label', feature.title);

      const enabledRow = { key: `${feature.id}On`, label: 'Enabled', type: 'toggle', def: feature.def };
      const on = read(enabledRow);
      const toggleBtn = settingRow('Enabled', on ? 'On' : 'Off', () => {
        armedFeature = null;
        put(enabledRow.key, !read(enabledRow));
        notifyChange();
        render();
      }, on);
      panel.append(toggleBtn);

      const groupWrap = document.createElement('div');
      groupWrap.className = on ? 'ytc-group' : 'ytc-group is-disabled';
      const secHeading = document.createElement('p');
      secHeading.className = 'ytc-section';
      secHeading.textContent = 'Sub-sections';
      groupWrap.append(secHeading);

      for (const sub of feature.subsections) {
        const btn = settingRow(sub.title, sub.summary(), () => {
          armedFeature = null;
          panelState.view = 'sub';
          panelState.sub = sub.id;
          render();
        });
        btn.disabled = !on;
        btn.append(chevron());
        groupWrap.append(btn);
      }
      panel.append(groupWrap, document.createElement('hr'));

      const reset = document.createElement('button');
      reset.type = 'button';
      if (armedFeature === feature.id) reset.className = 'ytc-reset-armed';
      reset.textContent = armedFeature === feature.id ? `Click again to reset ${feature.short}` : `Reset ${feature.short}`;
      reset.addEventListener('click', () => {
        if (armedFeature !== feature.id) {
          armedFeature = feature.id;
          reset.className = 'ytc-reset-armed';
          reset.textContent = `Click again to reset ${feature.short}`;
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
      panel.append(reset);
    }

    const active = panel.querySelector('[aria-current="true"]');
    const first = panel.querySelector('button:not(.ytc-close):not(.ytc-back)');
    (active || first)?.focus();
  }

  function openPanel(featureId, view) {
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
    panelState = { feature: featureId, view: view || (featureById(featureId) ? 'settings' : featureId), rowKey: null };
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
    const LABELS = new Set(['members only', 'premium', 'khusus anggota', 'youtube featured']);
    const BADGE = 'yt-badge-shape, badge-shape, ytd-badge-supported-renderer';
    const OUTER_CARD = [
      'ytd-rich-item-renderer',
      'ytd-video-renderer',
      'ytd-compact-video-renderer',
      'ytd-grid-video-renderer',
      'ytd-playlist-video-renderer',
      'ytd-playlist-panel-video-renderer',
    ].join(',');
    // Home feed wraps yt-lockup-view-model inside ytd-rich-item-renderer; prefer the outer wrapper so the grid slot collapses too
    const cardOf = (el) => el.closest(OUTER_CARD) || el.closest('yt-lockup-view-model');

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
        const card = cardOf(badge);
        if (card) cards.add(card);
      }
      if (root.matches(BADGE)) {
        const card = cardOf(root);
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
      if (!enabled()) return;
      if (location.pathname !== '/watch') {
        url = '';
        done = '';
        tries = 0;
        return;
      }
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
    const hiddenPause = () => get('pauseHidden', false) === true;
    const skipShorts = () => get('skipShorts', false) === true;

    function setAutoplay(on) {
      const el = document.querySelector('.ytp-autonav-toggle-button');
      if (!el) return;
      if ((el.getAttribute('aria-checked') === 'true') === on) return;
      (el.closest('button') || el).click();
    }

    // Inside a playlist the next item wins, so the run stays inside the list
    function nextInPlaylist() {
      const items = [...document.querySelectorAll('ytd-playlist-panel-video-renderer')];
      if (!items.length) return null;
      const selected = items.find(
        (item) => item.hasAttribute('selected') || item.getAttribute('aria-current') === 'true'
      );
      if (!selected) return null;
      for (const item of items.slice(items.indexOf(selected) + 1)) {
        if (item.hasAttribute('data-ytc-off')) continue;
        const link = item.querySelector('a#wc-endpoint, a[href*="/watch?v="]');
        if (!link || !link.href) continue;
        if (skipShorts() && link.href.includes('/shorts/')) continue;
        return link;
      }
      return null;
    }

    function pickNext() {
      const playlist = nextInPlaylist();
      if (playlist) return playlist;
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
      // The page can move on by itself while the wait runs; this pins the video that ended
      const ended = videoIdFromUrl();
      endTimer = setTimeout(() => {
        const currentMode = behavior();
        if (!enabled() || currentMode === 'leave' || currentMode === 'stop') return;
        if (videoIdFromUrl() !== ended) return;
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
    let syncTimer = 0;

    function startSync() {
      clearTimeout(syncTimer);
      syncTimer = 0;
      syncTries = 0;
      const tick = () => {
        sync();
        if (document.querySelector('.ytp-autonav-toggle-button') || ++syncTries > 20) return;
        syncTimer = setTimeout(tick, 250);
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
    let syncTimer = 0;

    function pass() {
      const videoDone = applyVideo();
      const theaterDone = applyTheater();
      const subtitlesDone = applySubtitles();
      const audioDone = applyAudio();
      return videoDone && theaterDone && subtitlesDone && audioDone;
    }

    function startSync() {
      clearTimeout(syncTimer);
      syncTimer = 0;
      tries = 0;
      theaterClicks = 0;
      if (!enabled()) return;
      subtitleClicks = 0;
      audioClicks = 0;
      const tick = () => {
        if (pass() || ++tries > 16) return;
        syncTimer = setTimeout(tick, 250);
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

  // ---------- clean share link ----------

  {
    const enabled = () => isTop && featureOn('share');
    // Only parameters that identify the sharer or the click path; v, t, list and index stay
    const TRACKING = ['si', 'pp', 'feature', 'ab_channel', 'source_ve_path', 'embeds_referring_euri', 'embeds_referring_origin'];
    const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);
    const INPUT = 'yt-copy-link-renderer #share-url, #share-url';
    const COPY = 'yt-copy-link-renderer #copy-button, yt-copy-link-renderer button';

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
      // An untouched link keeps its exact spelling
      return stripTracking(url) ? url.toString() : raw;
    }

    const linkAt = (id, seconds) => {
      const t = Math.floor(seconds);
      return t > 0 ? `https://youtu.be/${id}?t=${t}` : `https://youtu.be/${id}`;
    };

    async function copyText(text) {
      try {
        if (typeof GM_setClipboard === 'function') {
          GM_setClipboard(text, 'text');
          return true;
        }
      } catch {
        // fall through to the page clipboard
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
      document.getElementById('ytc-share-toast')?.remove();
      clearTimeout(toastTimer);
      const box = document.createElement('div');
      box.id = 'ytc-share-toast';
      box.setAttribute('role', 'status');
      box.textContent = text;
      box.style.cssText =
        'position:fixed;left:24px;bottom:24px;z-index:2147483647;padding:12px 16px;border-radius:8px;background:#0f0f0f;color:#fff;font:14px Roboto,Arial,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.35)';
      document.body.append(box);
      toastTimer = setTimeout(() => box.remove(), 2000);
    }

    function cleanInputs() {
      if (!enabled()) return;
      for (const input of document.querySelectorAll(INPUT)) {
        const clean = cleanUrl(input.value);
        if (clean !== input.value) input.value = clean;
      }
    }

    function cleanAddress() {
      if (!enabled() || get('shareAddress', false) !== true) return;
      // The page is YouTube by @match, so only the parameters need checking here
      const url = new URL(location.href);
      // replaceState keeps the entry count and YouTube's own state object
      if (stripTracking(url)) history.replaceState(history.state, '', url.toString());
    }

    // Read by the menu, which is drawn after this block
    shareCopyAtTime = async () => {
      const id = videoIdFromUrl();
      if (!enabled() || !id) return;
      const video = document.querySelector('#movie_player video') || document.querySelector('video');
      const ok = await copyText(linkAt(id, video ? video.currentTime : 0));
      toast(ok ? 'Link copied' : 'Clipboard blocked');
    };

    if (isTop) {
      // YouTube's own copy reads its data model, not the input, so the click is answered here instead
      document.addEventListener(
        'click',
        async (e) => {
          if (!enabled()) return;
          const button = e.target instanceof Element ? e.target.closest(COPY) : null;
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
          // Clipboard blocked: leave the clean link selected for a manual copy
          input.focus();
          input.select();
        },
        true
      );

      let raf = 0;
      new MutationObserver((list) => {
        if (!enabled() || raf) return;
        if (!list.some((m) => m.addedNodes.length)) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          cleanInputs();
        });
      }).observe(document.documentElement, { childList: true, subtree: true });

      // "Start at" rewrites the input through its property, which no observer sees
      setInterval(() => {
        if (enabled() && document.querySelector(INPUT)) cleanInputs();
      }, 250);
    }

    const sync = () => {
      cleanAddress();
      cleanInputs();
    };
    document.addEventListener('yt-navigate-finish', sync);
    document.addEventListener('ytc-change', sync);
    sync();
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
      'html.ytc-quiet-suggested .ytp-suggested-action{display:none!important}' +
      'html.ytc-quiet-info-panels ytd-info-panel-container-renderer{display:none!important}' +
      'html.ytc-quiet-miniplayer ytd-miniplayer{display:none!important}' +
      'html.ytc-quiet-sidebar-you ytd-guide-collapsible-section-entry-renderer:has(a[href="/feed/you"],a[href="/feed/history"]),' +
      'html.ytc-quiet-sidebar-you ytd-guide-section-renderer:not(:has(a[href="/"])):has(a[href="/feed/history"],a[href="/feed/playlists"]){display:none!important}' +
      'html.ytc-quiet-sidebar-subs ytd-guide-collapsible-section-entry-renderer:has(a[href="/feed/subscriptions"]),' +
      'html.ytc-quiet-sidebar-subs ytd-guide-section-renderer:not(:has(a[href="/"])):has(a[href="/feed/channels"],a[href="/feed/subscriptions"]){display:none!important}' +
      'html.ytc-quiet-sidebar-explore ytd-guide-section-renderer:has(a[href^="/feed/storefront"],a[href="/gaming"],a[href="/feed/trending"],a[href="/feed/explore"],a[href="/channel/UC-9-kyTW8ZkZNDHQJ6FgpwQ"],a[href="/podcasts"],a[href="/feed/courses_destination"]){display:none!important}' +
      'html.ytc-quiet-sidebar-more ytd-guide-section-renderer:has(a[href^="/premium"],a[href*="music.youtube.com"],a[href*="youtubekids.com"],a[href*="tv.youtube.com"],a[href="/new"]){display:none!important}' +
      'html.ytc-quiet-sidebar-footer ytd-guide-renderer #footer{display:none!important}';
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
      root.classList.toggle('ytc-quiet-sidebar-you', flag('quietSidebarYou'));
      root.classList.toggle('ytc-quiet-sidebar-subs', flag('quietSidebarSubscriptions'));
      root.classList.toggle('ytc-quiet-sidebar-explore', flag('quietSidebarExplore'));
      root.classList.toggle('ytc-quiet-sidebar-more', flag('quietSidebarMore'));
      root.classList.toggle('ytc-quiet-sidebar-footer', flag('quietSidebarFooter'));
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

  // ---------- custom grid ----------

  {
    const enabled = () => isTop && featureOn('grid');
    const SECTIONS = [
      { key: 'gridHome', cls: 'ytc-grid-home', scope: 'ytd-browse[page-subtype="home"]' },
      { key: 'gridSubscriptions', cls: 'ytc-grid-subs', scope: 'ytd-browse[page-subtype="subscriptions"]' },
      { key: 'gridChannel', cls: 'ytc-grid-channel', scope: 'ytd-browse[page-subtype="channels"]' },
      {
        key: 'gridOther',
        cls: 'ytc-grid-other',
        scope: 'ytd-browse:not([page-subtype="home"]):not([page-subtype="subscriptions"]):not([page-subtype="channels"])',
      },
    ];
    const scopes = SECTIONS.map((s) => `html.${s.cls} ${s.scope}`);
    const sel = (suffix) => scopes.map((s) => `${s} ${suffix}`).join(',');
    const item = 'ytd-rich-item-renderer:not([is-slim-media]):not([is-post]):not([is-mini-mode])';

    const EMPTY_ATTR = 'data-ytc-grid-empty';
    const EMPTY_TARGET = `ytd-rich-section-renderer, ${item}`;
    const style = document.createElement('style');
    style.id = 'ytc-grid';
    style.textContent =
      `${sel('ytd-rich-grid-renderer')}{` +
      `--ytd-rich-grid-items-per-row:var(--ytc-grid-cols)!important;` +
      `--ytd-rich-grid-item-max-width:none!important;` +
      `--ytd-rich-grid-item-min-width:0px!important}` +
      `${sel('ytd-rich-grid-renderer>#contents')}{` +
      `display:flex!important;flex-wrap:wrap!important;align-items:flex-start!important}` +
      `${sel('ytd-rich-grid-row')},${sel('ytd-rich-grid-row>#contents')}{display:contents!important}` +
      `${sel(item)}{` +
      `--ytd-rich-grid-items-per-row:var(--ytc-grid-cols)!important;` +
      `box-sizing:border-box!important;` +
      `width:calc(100% / var(--ytc-grid-cols) - var(--ytd-rich-grid-item-margin, 16px) - 0.01px)!important;` +
      `max-width:calc(100% / var(--ytc-grid-cols) - var(--ytd-rich-grid-item-margin, 16px) - 0.01px)!important;` +
      `min-width:0!important;` +
      `flex:0 0 calc(100% / var(--ytc-grid-cols) - var(--ytd-rich-grid-item-margin, 16px) - 0.01px)!important;` +
      `margin-left:calc(var(--ytd-rich-grid-item-margin, 16px) / 2)!important;` +
      `margin-right:calc(var(--ytd-rich-grid-item-margin, 16px) / 2)!important}` +
      `${sel(`${item}>#content`)},${sel(`${item} ytd-rich-grid-media`)},${sel(`${item} yt-lockup-view-model`)}{` +
      `width:100%!important;max-width:100%!important;min-width:0!important}` +
      `${sel('ytd-rich-section-renderer')},${sel('ytd-continuation-item-renderer')}{` +
      `width:100%!important;flex:0 0 100%!important}` +
      `${sel('ytd-rich-item-renderer:has(ytd-ad-slot-renderer)')},${sel(`[${EMPTY_ATTR}]`)}{display:none!important}`;
    document.documentElement.append(style);

    let emptyRaf = 0;
    function syncEmpty() {
      emptyRaf = 0;
      const nodes = document.querySelectorAll(EMPTY_TARGET);
      if (!enabled()) {
        for (const el of nodes) el.removeAttribute(EMPTY_ATTR);
        return;
      }
      for (const el of nodes) {
        if (el.closest('[hidden]')) continue;
        if (el.hasAttribute(EMPTY_ATTR)) el.removeAttribute(EMPTY_ATTR);
        if (el.getBoundingClientRect().height < 1) el.setAttribute(EMPTY_ATTR, '');
      }
    }
    const scheduleEmpty = () => {
      if (!emptyRaf) emptyRaf = requestAnimationFrame(syncEmpty);
    };

    function apply() {
      const root = document.documentElement;
      const on = enabled();
      const cols = read(rowOf('gridColumns'));
      if (on) root.style.setProperty('--ytc-grid-cols', String(cols));
      else root.style.removeProperty('--ytc-grid-cols');
      for (const s of SECTIONS) {
        root.classList.toggle(s.cls, on && get(s.key, true) === true);
      }
      scheduleEmpty();
    }

    new MutationObserver(() => {
      if (enabled()) scheduleEmpty();
    }).observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('yt-navigate-finish', scheduleEmpty);
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
    keys.add('vfGlobal');
    keys.add('vfVideos');
    return keys;
  };

  function validValue(key, value) {
    if (key.endsWith('On')) return typeof value === 'boolean';
    if (key === 'bookmarks') return isMarkMap(value);
    if (key === 'vfGlobal') return vfValidFilter(value);
    if (key === 'vfVideos') return vfValidVideos(value);
    const row = rowOf(key);
    if (!row) return false;
    if (row.type === 'toggle') return typeof value === 'boolean';
    if (row.type === 'number') return Number.isInteger(value) && value >= row.min && value <= row.max;
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
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return { error: 'That JSON has no settings object.' };
    }
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

  // ---------- shorts to watch ----------

  {
    const SHORTS = /^\/shorts\/([A-Za-z0-9_-]{6,})/;
    const enabled = () => isTop && featureOn('shorts');

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
      // A shared Short can carry a start time, so keep it
      const time = url.searchParams.get('t');
      if (time) next.searchParams.set('t', time);
      return next;
    }

    function rewriteLinks(root = document) {
      if (!enabled() || !root || typeof root.querySelectorAll !== 'function') return;
      const links = root.matches && root.matches('a[href*="/shorts/"]')
        ? [root, ...root.querySelectorAll('a[href*="/shorts/"]')]
        : root.querySelectorAll('a[href*="/shorts/"]');
      for (const link of links) {
        const next = toWatchUrl(link.getAttribute('href') || '');
        if (next) link.setAttribute('href', next.pathname + next.search);
      }
    }

    function rewrite() {
      if (!enabled()) return;
      const match = SHORTS.exec(location.pathname);
      if (!match) return;
      const url = toWatchUrl(location.pathname + location.search);
      if (!url) return;
      // replace() keeps the entry count stable, so Back does not bounce between the two pages
      location.replace(url.toString());
    }

    function syncShorts() {
      rewrite();
      rewriteLinks();
    }

    if (isTop) {
      let linkRaf = 0;
      const linkQueue = new Set();
      const flushLinks = () => {
        linkRaf = 0;
        const batch = [...linkQueue];
        linkQueue.clear();
        for (const node of batch) rewriteLinks(node);
      };
      new MutationObserver((list) => {
        if (!enabled()) return;
        for (const m of list) {
          for (const n of m.addedNodes) {
            if (n.nodeType === 1) linkQueue.add(n);
          }
        }
        if (linkQueue.size && !linkRaf) linkRaf = requestAnimationFrame(flushLinks);
      }).observe(document.documentElement, { childList: true, subtree: true });
    }

    document.addEventListener('yt-navigate-start', rewrite);
    document.addEventListener('yt-navigate-finish', syncShorts);
    window.addEventListener('popstate', syncShorts);
    document.addEventListener('ytc-change', syncShorts);
    syncShorts();
  }

  // ---------- playlist length ----------

  {
    const LINE_ID = 'ytc-playlist-length';
    const STYLE_ID = 'ytc-playlist-style';
    const TIME = /^\d{1,2}:\d{2}(?::\d{2})?$/;
    const CSS = `#ytc-playlist-length{padding:8px 16px;font:500 12px/1.4 Roboto,Arial,sans-serif;color:var(--yt-spec-text-secondary,#606060);border-bottom:1px solid var(--yt-spec-10-percent-layer,rgba(128,128,128,.2))}`;

    const enabled = () => isTop && featureOn('playlist');

    // YouTube prints each duration as text, so matching the shape survives markup changes
    function durationOf(item) {
      for (const node of item.querySelectorAll('span, div')) {
        const text = node.textContent.trim();
        if (text.length <= 8 && TIME.test(text)) return parseClock(text);
      }
      return null;
    }

    function totals() {
      const panel = document.querySelector('ytd-playlist-panel-renderer');
      if (!panel) return null;
      const items = [...panel.querySelectorAll('ytd-playlist-panel-video-renderer')];
      if (items.length < 2) return null;
      const selected = items.findIndex(
        (item) => item.hasAttribute('selected') || item.getAttribute('aria-current') === 'true'
      );
      let total = 0;
      let left = 0;
      let unknown = 0;
      items.forEach((item, index) => {
        const seconds = durationOf(item);
        if (seconds === null) {
          unknown++;
          return;
        }
        total += seconds;
        // With no selected item the whole playlist still lies ahead
        if (selected === -1 || index >= selected) left += seconds;
      });
      return { panel, count: items.length, total, left, unknown };
    }

    const label = (seconds) => clock(seconds, seconds >= 3600);

    function remove() {
      document.getElementById(LINE_ID)?.remove();
      document.getElementById(STYLE_ID)?.remove();
    }

    function draw() {
      if (!enabled()) {
        remove();
        return;
      }
      const data = totals();
      if (!data) {
        remove();
        return;
      }
      const text =
        `${data.count} videos · ${label(data.total)}` +
        (data.unknown ? ` (+${data.unknown} unknown)` : '') +
        ` · ${label(data.left)} left`;
      let line = document.getElementById(LINE_ID);
      if (line && line.isConnected && line.textContent === text) return;
      if (!line) {
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = CSS;
        document.head.append(style);
        line = document.createElement('div');
        line.id = LINE_ID;
      }
      line.textContent = text;
      const container = data.panel.querySelector('#container') || data.panel;
      const contents = container.querySelector('#contents');
      if (contents) contents.before(line);
      else container.append(line);
    }

    let observer = null;
    let timer = 0;

    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(draw, 300);
    }

    function observe() {
      if (observer) observer.disconnect();
      const panel = document.querySelector('ytd-playlist-panel-renderer');
      if (!panel) return;
      observer = new MutationObserver(schedule);
      observer.observe(panel, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['selected', 'aria-current'],
      });
    }

    function start() {
      schedule();
      observe();
      // The panel is often built after the navigation event
      setTimeout(() => {
        observe();
        schedule();
      }, 1200);
    }

    document.addEventListener('yt-navigate-finish', start);
    document.addEventListener('ytc-change', schedule);
    start();
  }

  // ---------- playlist tools ----------

  {
    const HIDDEN_ATTR = 'data-ytc-pl-hidden';
    const STYLE_ID = 'ytc-pt-style';
    const BTN_ID = 'ytc-pt-open-btn';
    const DURATION_ID = 'ytc-pt-duration-badge';
    const FILTER_ID = 'ytc-pt-filter-bar';
    const EMPTY_ID = 'ytc-pt-filter-empty';
    const BACKDROP_ID = 'ytc-pt-backdrop';
    const DIALOG_ID = 'ytc-pt-dialog';
    const TOAST_ID = 'ytc-pt-toast';
    const RESOLVE_URL = 'https://findyoutubevideo.thetechrobo.ca/api/v4/';
    const RESOLVE_CONCURRENCY = 3;
    const RESOLVE_TIMEOUT_MS = 22000;
    const IMPORT_DELAY_MS = 450;

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

    const enabled = () => isTop && featureOn('playlistTools');
    const currentListId = () => new URLSearchParams(location.search).get('list') || '';
    const onPlaylistPage = () => location.pathname === '/playlist' && currentListId() !== 'LL';
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

    const filterState = {
      query: '',
      chip: 'all',
      target: 'both',
    };

    const isHiddenByMembers = (row) => row.hasAttribute('data-ytc-off') || row.hasAttribute('data-ytmp-hidden');
    const isFilterActive = () => filterState.query.trim().length > 0 || filterState.chip !== 'all';

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

    const getRows = () => [...activePlaylistRoot().querySelectorAll('ytd-playlist-video-renderer')];
    const getAllItems = () => getRows().map(readRow);

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
      if (!res.ok) return { ok: false, authError: false, status: res.status, json };
      const status = json?.status || '';
      if (status === 'STATUS_FAILED' || json?.error) {
        const code = json?.error?.code;
        return { ok: false, authError: code === 401 || code === 403, status: code || status, json };
      }
      return { ok: true, json };
    }

    const PT_CSS = `
#${BTN_ID}{display:inline-flex;align-items:center;justify-content:center;gap:8px;align-self:flex-start;width:auto;min-height:36px;margin-top:10px;padding:0 16px;border:0;border-radius:18px;background:#0f0f0f;color:#fff;font:500 14px/1 Roboto,Arial,sans-serif;cursor:pointer;transition:background .15s}
#${BTN_ID}:hover{background:#272727}
html[dark] #${BTN_ID}{background:#f1f1f1;color:#0f0f0f}
html[dark] #${BTN_ID}:hover{background:#d9d9d9}
#${BTN_ID} svg,#${DURATION_ID} svg,#${FILTER_ID} svg,#${DIALOG_ID} .ytc-pt-dhead svg{flex:0 0 auto;display:block}
#${BTN_ID}:focus-visible,#${DURATION_ID} button:focus-visible,#${FILTER_ID} button:focus-visible,#${FILTER_ID} input:focus-visible,#${DIALOG_ID} button:focus-visible,#${DIALOG_ID} input:focus-visible,#${DIALOG_ID} select:focus-visible,#${DIALOG_ID} textarea:focus-visible,#${TOAST_ID} button:focus-visible{outline:2px solid #065fd4;outline-offset:2px}
html[dark] #${BTN_ID}:focus-visible,html[dark] #${DURATION_ID} button:focus-visible,html[dark] #${FILTER_ID} button:focus-visible,html[dark] #${FILTER_ID} input:focus-visible,html[dark] #${DIALOG_ID} button:focus-visible,html[dark] #${DIALOG_ID} input:focus-visible,html[dark] #${DIALOG_ID} select:focus-visible,html[dark] #${DIALOG_ID} textarea:focus-visible,html[dark] #${TOAST_ID} button:focus-visible{outline-color:#3ea6ff}
#${DURATION_ID}{display:flex;flex-direction:column;gap:8px;width:100%;box-sizing:border-box;margin:10px 0 4px;padding:12px 14px;border:0;border-radius:12px;background:rgba(0,0,0,.05);color:#0f0f0f;font:400 13px/1.4 Roboto,Arial,sans-serif;font-variant-numeric:tabular-nums}
html[dark] #${DURATION_ID}{background:rgba(255,255,255,.08);color:#f1f1f1}
#${DURATION_ID} .ytc-pt-dur-top{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
#${DURATION_ID} .ytc-pt-dur-total{display:inline-flex;align-items:center;gap:6px;font-size:15px;font-weight:600;letter-spacing:-.01em}
#${DURATION_ID} .ytc-pt-dur-meta{margin-left:auto;font-size:12px;color:#606060}
html[dark] #${DURATION_ID} .ytc-pt-dur-meta{color:#aaa}
#${DURATION_ID} button{min-height:28px;padding:0 12px;border:0;border-radius:14px;background:rgba(0,0,0,.08);color:inherit;font:500 12px/1 Roboto,Arial,sans-serif;cursor:pointer;transition:background .15s}
#${DURATION_ID} button:hover{background:rgba(0,0,0,.14)}
html[dark] #${DURATION_ID} button{background:rgba(255,255,255,.14)}
html[dark] #${DURATION_ID} button:hover{background:rgba(255,255,255,.22)}
#${FILTER_ID}{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 10px;padding:4px 24px 8px;border:0;background:transparent;color:#0f0f0f;font:400 13px/1.4 Roboto,Arial,sans-serif;box-sizing:border-box;max-width:100%}
@media (max-width:600px){#${FILTER_ID}{padding:4px 12px 8px}}
html[dark] #${FILTER_ID}{color:#f1f1f1}
#${FILTER_ID} .ytc-pt-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
#${FILTER_ID} .ytc-pt-search-wrap{position:relative;display:flex;align-items:center;flex:1 1 200px;min-width:150px;max-width:280px;height:32px;padding:0 10px;border:1px solid rgba(0,0,0,.18);border-radius:8px;background:#fff;box-sizing:border-box;transition:border-color .15s,background .15s,box-shadow .15s}
html[dark] #${FILTER_ID} .ytc-pt-search-wrap{border-color:rgba(255,255,255,.16);background:#121212}
#${FILTER_ID} .ytc-pt-search-wrap:focus-within{border-color:#065fd4;box-shadow:0 0 0 1px #065fd4}
html[dark] #${FILTER_ID} .ytc-pt-search-wrap:focus-within{border-color:#3ea6ff;box-shadow:0 0 0 1px #3ea6ff}
#${FILTER_ID} .ytc-pt-search-wrap svg{color:#606060;margin-right:8px}
html[dark] #${FILTER_ID} .ytc-pt-search-wrap svg{color:#aaa}
#${FILTER_ID} input[type="search"]{flex:1;min-width:0;height:100%;border:0;background:transparent;color:inherit;font:inherit;outline:none}
#${FILTER_ID} input[type="search"]:focus-visible{outline:none}
#${FILTER_ID} .ytc-pt-chips{display:flex;flex-wrap:wrap;gap:6px}
#${FILTER_ID} .ytc-pt-chip{min-height:32px;padding:0 12px;border:0;border-radius:8px;background:rgba(0,0,0,.05);color:#0f0f0f;font:500 13px/1 Roboto,Arial,sans-serif;cursor:pointer;transition:background .15s,color .15s}
#${FILTER_ID} .ytc-pt-chip:hover{background:rgba(0,0,0,.1)}
html[dark] #${FILTER_ID} .ytc-pt-chip{background:rgba(255,255,255,.1);color:#f1f1f1}
html[dark] #${FILTER_ID} .ytc-pt-chip:hover{background:rgba(255,255,255,.18)}
#${FILTER_ID} .ytc-pt-chip[aria-pressed="true"]{background:#0f0f0f;color:#fff}
html[dark] #${FILTER_ID} .ytc-pt-chip[aria-pressed="true"]{background:#f1f1f1;color:#0f0f0f}
#${FILTER_ID} .ytc-pt-counter{font-size:12px;font-variant-numeric:tabular-nums;color:#606060;margin-left:auto;padding:0 4px}
html[dark] #${FILTER_ID} .ytc-pt-counter{color:#aaa}
#${FILTER_ID} .ytc-pt-fbtn{min-height:32px;padding:0 12px;border:0;border-radius:8px;background:rgba(0,0,0,.06);color:inherit;font:500 12px/1 Roboto,Arial,sans-serif;cursor:pointer;transition:background .15s}
#${FILTER_ID} .ytc-pt-fbtn:hover{background:rgba(0,0,0,.12)}
html[dark] #${FILTER_ID} .ytc-pt-fbtn{background:rgba(255,255,255,.12)}
html[dark] #${FILTER_ID} .ytc-pt-fbtn:hover{background:rgba(255,255,255,.2)}
#${FILTER_ID} .ytc-pt-fbtn:disabled,#${DIALOG_ID} button:disabled,#${TOAST_ID} button:disabled{opacity:.45;cursor:not-allowed}
#${EMPTY_ID}{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:12px;padding:24px 16px;margin:8px 24px;border:0;border-radius:12px;background:rgba(0,0,0,.04);color:#606060;font:400 13px/1.4 Roboto,Arial,sans-serif}
html[dark] #${EMPTY_ID}{background:rgba(255,255,255,.05);color:#aaa}
[${HIDDEN_ATTR}]{display:none!important}
#${BACKDROP_ID}{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.7);padding:16px;box-sizing:border-box}
#${DIALOG_ID},#${DIALOG_ID} *{box-sizing:border-box}
#${DIALOG_ID}{display:flex;flex-direction:column;width:100%;max-width:min(520px,calc(100vw - 32px));height:min(76vh,620px);height:min(76dvh,620px);max-height:calc(100vh - 32px);overflow:hidden;border-radius:16px;background:#fff;color:#0f0f0f;box-shadow:0 20px 48px rgba(0,0,0,.45);font:400 13px/1.45 Roboto,Arial,sans-serif}
html[dark] #${DIALOG_ID}{background:#212121;color:#f1f1f1;border:1px solid rgba(255,255,255,.08)}
#${DIALOG_ID} .ytc-pt-dhead{flex:0 0 auto;position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;padding:14px 16px 14px 20px;background:#fff;border-bottom:1px solid rgba(0,0,0,.08)}
html[dark] #${DIALOG_ID} .ytc-pt-dhead{background:#212121;border-bottom-color:rgba(255,255,255,.1)}
#${DIALOG_ID} .ytc-pt-dhead h2{flex:1;margin:0;font-size:16px;font-weight:600}
#${DIALOG_ID} .ytc-pt-close{width:36px;height:36px;border:0;border-radius:50%;background:transparent;color:inherit;font-size:22px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background .15s}
#${DIALOG_ID} .ytc-pt-close:hover{background:rgba(0,0,0,.06)}
html[dark] #${DIALOG_ID} .ytc-pt-close:hover{background:rgba(255,255,255,.1)}
#${DIALOG_ID} .ytc-pt-tabs{flex:0 0 auto;display:flex;background:#fff;border-bottom:1px solid rgba(0,0,0,.08);padding:0 16px;gap:4px}
html[dark] #${DIALOG_ID} .ytc-pt-tabs{background:#212121;border-bottom-color:rgba(255,255,255,.1)}
#${DIALOG_ID} .ytc-pt-tab{padding:11px 16px;border:0;border-bottom:2px solid transparent;background:transparent;color:#606060;font:500 13px/1 Roboto,Arial,sans-serif;cursor:pointer;transition:color .15s,border-color .15s}
#${DIALOG_ID} .ytc-pt-tab:hover{color:#0f0f0f}
html[dark] #${DIALOG_ID} .ytc-pt-tab{color:#aaa}
html[dark] #${DIALOG_ID} .ytc-pt-tab:hover{color:#f1f1f1}
#${DIALOG_ID} .ytc-pt-tab[aria-selected="true"]{color:#0f0f0f;border-bottom-color:#065fd4}
html[dark] #${DIALOG_ID} .ytc-pt-tab[aria-selected="true"]{color:#f1f1f1;border-bottom-color:#3ea6ff}
#${DIALOG_ID} .ytc-pt-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:16px 20px 20px;display:flex;flex-direction:column;gap:12px}
#${DIALOG_ID} .ytc-pt-card{padding:14px 16px;border:0;border-radius:12px;background:rgba(0,0,0,.035);display:flex;flex-direction:column;gap:10px}
html[dark] #${DIALOG_ID} .ytc-pt-card{background:rgba(255,255,255,.05)}
#${DIALOG_ID} .ytc-pt-card h3{margin:0;font-size:14px;font-weight:600}
#${DIALOG_ID} .ytc-pt-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
#${DIALOG_ID} label{font-size:12px;font-weight:500;color:#606060}
html[dark] #${DIALOG_ID} label{color:#aaa}
#${DIALOG_ID} select,#${DIALOG_ID} input[type="text"],#${DIALOG_ID} input[type="number"],#${DIALOG_ID} textarea{width:100%;min-height:36px;padding:7px 12px;border:1px solid rgba(0,0,0,.15);border-radius:8px;background:#fff;color:inherit;font:inherit;transition:border-color .15s}
html[dark] #${DIALOG_ID} select,html[dark] #${DIALOG_ID} input[type="text"],html[dark] #${DIALOG_ID} input[type="number"],html[dark] #${DIALOG_ID} textarea{border-color:rgba(255,255,255,.16);background:#121212}
#${DIALOG_ID} textarea{min-height:96px;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;resize:vertical}
#${DIALOG_ID} .ytc-pt-btn{min-height:36px;padding:0 16px;border:0;border-radius:18px;background:rgba(0,0,0,.07);color:inherit;font:500 13px/1 Roboto,Arial,sans-serif;cursor:pointer;transition:background .15s}
#${DIALOG_ID} .ytc-pt-btn:hover{background:rgba(0,0,0,.12)}
html[dark] #${DIALOG_ID} .ytc-pt-btn{background:rgba(255,255,255,.12)}
html[dark] #${DIALOG_ID} .ytc-pt-btn:hover{background:rgba(255,255,255,.2)}
#${DIALOG_ID} .ytc-pt-btn.primary{background:#065fd4;color:#fff}
#${DIALOG_ID} .ytc-pt-btn.primary:hover{background:#0550b5}
html[dark] #${DIALOG_ID} .ytc-pt-btn.primary{background:#3ea6ff;color:#0f0f0f}
html[dark] #${DIALOG_ID} .ytc-pt-btn.primary:hover{background:#65b8ff}
#${DIALOG_ID} .ytc-pt-btn.danger{background:#c00;color:#fff}
#${DIALOG_ID} .ytc-pt-btn.danger:hover{background:#a30000}
html[dark] #${DIALOG_ID} .ytc-pt-btn.danger{background:#ff4e45;color:#0f0f0f}
html[dark] #${DIALOG_ID} .ytc-pt-btn.danger:hover{background:#ff6f68}
#${DIALOG_ID} .ytc-pt-note{margin:0;font-size:12px;color:#606060}
html[dark] #${DIALOG_ID} .ytc-pt-note{color:#aaa}
#${DIALOG_ID} .ytc-pt-warn{display:flex;align-items:flex-start;gap:8px;padding:10px 12px;border-radius:10px;background:rgba(217,119,6,.14);color:#92400e;font-size:12px;line-height:1.45}
html[dark] #${DIALOG_ID} .ytc-pt-warn{background:rgba(251,191,36,.14);color:#fde68a}
#${DIALOG_ID} .ytc-pt-confirm-wrap{min-height:220px;display:flex;flex-direction:column;justify-content:center}
#${DIALOG_ID} .ytc-pt-confirm{padding:20px;border:1px solid rgba(204,0,0,.28);border-radius:14px;background:rgba(204,0,0,.05);display:flex;flex-direction:column;gap:14px}
html[dark] #${DIALOG_ID} .ytc-pt-confirm{border-color:rgba(255,78,69,.32);background:rgba(255,78,69,.09)}
#${DIALOG_ID} .ytc-pt-confirm.info{border-color:rgba(6,95,212,.3);background:rgba(6,95,212,.06)}
html[dark] #${DIALOG_ID} .ytc-pt-confirm.info{border-color:rgba(62,166,255,.35);background:rgba(62,166,255,.1)}
#${DIALOG_ID} .ytc-pt-confirm-head{display:flex;align-items:center;gap:10px}
#${DIALOG_ID} .ytc-pt-confirm-ico{width:32px;height:32px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;flex:0 0 32px;background:rgba(204,0,0,.12);color:#c00}
html[dark] #${DIALOG_ID} .ytc-pt-confirm-ico{background:rgba(255,78,69,.18);color:#ff6f68}
#${DIALOG_ID} .ytc-pt-confirm.info .ytc-pt-confirm-ico{background:rgba(6,95,212,.12);color:#065fd4}
html[dark] #${DIALOG_ID} .ytc-pt-confirm.info .ytc-pt-confirm-ico{background:rgba(62,166,255,.18);color:#3ea6ff}
#${DIALOG_ID} .ytc-pt-confirm-title{font-size:15px;font-weight:600;color:inherit}
#${DIALOG_ID} .ytc-pt-confirm-msg{margin:0;font-size:13px;line-height:1.5;color:inherit}
#${DIALOG_ID} .ytc-pt-confirm-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;padding-top:2px}
#${TOAST_ID}{position:fixed;right:24px;bottom:24px;left:auto;z-index:2147483647;max-width:calc(100vw - 32px);min-width:280px;padding:14px 16px;border-radius:14px;background:#fff;color:#0f0f0f;box-shadow:0 12px 32px rgba(0,0,0,.22);border:1px solid rgba(0,0,0,.08);font:400 13px/1.4 Roboto,Arial,sans-serif;font-variant-numeric:tabular-nums;display:flex;flex-direction:column;gap:10px;box-sizing:border-box}
html[dark] #${TOAST_ID}{background:#282828;color:#f1f1f1;box-shadow:0 12px 32px rgba(0,0,0,.55);border-color:rgba(255,255,255,.1)}
#${TOAST_ID} .ytc-pt-trow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
#${TOAST_ID} .ytc-pt-spin{width:14px;height:14px;border:2px solid rgba(128,128,128,.3);border-top-color:#065fd4;border-radius:50%;animation:ytc-pt-rot .8s linear infinite}
html[dark] #${TOAST_ID} .ytc-pt-spin{border-top-color:#3ea6ff}
#${TOAST_ID} .ytc-pt-bar{width:100%;height:4px;border-radius:999px;background:rgba(0,0,0,.1);overflow:hidden}
html[dark] #${TOAST_ID} .ytc-pt-bar{background:rgba(255,255,255,.14)}
#${TOAST_ID} .ytc-pt-bar > span{display:block;height:100%;border-radius:999px;background:#065fd4;transition:width .18s ease}
html[dark] #${TOAST_ID} .ytc-pt-bar > span{background:#3ea6ff}
#${TOAST_ID} button{min-height:32px;padding:0 14px;border:0;border-radius:16px;background:rgba(0,0,0,.07);color:inherit;font:500 12px/1 Roboto,Arial,sans-serif;cursor:pointer;transition:background .15s}
#${TOAST_ID} button:hover{background:rgba(0,0,0,.13)}
html[dark] #${TOAST_ID} button{background:rgba(255,255,255,.12)}
html[dark] #${TOAST_ID} button:hover{background:rgba(255,255,255,.22)}
@keyframes ytc-pt-rot{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){#${TOAST_ID} .ytc-pt-spin{animation:none;display:none}#${TOAST_ID} .ytc-pt-bar > span,#${BTN_ID},#${FILTER_ID} .ytc-pt-chip,#${DIALOG_ID} .ytc-pt-btn{transition:none}}
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
      style.textContent = PT_CSS;
      document.head.append(style);
    }

    const clearToast = () => document.getElementById(TOAST_ID)?.remove();

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
      head.className = 'ytc-pt-trow';
      if (spinner) {
        const spin = document.createElement('span');
        spin.className = 'ytc-pt-spin';
        spin.setAttribute('aria-hidden', 'true');
        head.append(spin);
      }
      const msg = document.createElement('span');
      msg.textContent = text;
      head.append(msg);
      toast.append(head);

      if (typeof progress === 'number') {
        const bar = document.createElement('div');
        bar.className = 'ytc-pt-bar';
        const fill = document.createElement('span');
        fill.style.width = `${Math.max(0, Math.min(100, progress))}%`;
        bar.append(fill);
        toast.append(bar);
      }

      if (actions.length) {
        const row = document.createElement('div');
        row.className = 'ytc-pt-trow';
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
      for (const btn of document.querySelectorAll(`#${DIALOG_ID} button, #${FILTER_ID} .ytc-pt-fbtn, #${DURATION_ID} button`)) {
        if (btn.classList.contains('ytc-pt-close') || btn.classList.contains('ytc-pt-tab')) continue;
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
        if (res.ok) removed++;
        else if (res.readOnly) {
          readOnly = true;
          break;
        } else skipped++;
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
      if (!q || item.status !== 'available') return false;
      const t = item.title.toLowerCase();
      const c = item.channel.toLowerCase();
      if (target === 'title') return t.includes(q);
      if (target === 'channel') return c.includes(q);
      return t.includes(q) || c.includes(q);
    }

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
        const lines = items.filter((i) => i.videoId).map((i) => `https://www.youtube.com/watch?v=${i.videoId}`);
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

      for (const [heading, list] of [
        ['Deleted', groups.deleted],
        ['Private', groups.private],
        ['Other Unavailable', groups['other-unavailable']],
      ]) {
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
        if (res.ok) added++;
        else if (res.authError) {
          authBlocked = true;
          break;
        } else failed.push(videoId);
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

    function applyFilter() {
      const items = getAllItems();
      const q = filterState.query.trim().toLowerCase();
      const active = isFilterActive();
      const th = get('playlistWatchedThreshold', 80);
      let visible = 0;
      let totalVisiblePool = 0;

      for (const it of items) {
        if (isHiddenByMembers(it.row)) continue;
        totalVisiblePool++;
        let match = true;
        if (filterState.chip === 'available') match = it.status === 'available';
        else if (filterState.chip === 'unwatched') match = it.status === 'available' && it.watchedPct < th;
        else if (filterState.chip === 'watched') match = it.status === 'available' && it.watchedPct >= th;
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
        const counter = bar.querySelector('.ytc-pt-counter');
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
          btn.className = 'ytc-pt-fbtn';
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
        for (const chip of bar.querySelectorAll('.ytc-pt-chip')) {
          chip.setAttribute('aria-pressed', String(chip.dataset.chip === 'all'));
        }
      }
      applyFilter();
    }

    function mountFilterBar() {
      const existing = document.getElementById(FILTER_ID);
      if (!enabled() || !get('playlistShowFilterBar', true)) {
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
      searchLabel.className = 'ytc-pt-sr';
      searchLabel.setAttribute('for', 'ytc-pt-filter-input');
      searchLabel.textContent = 'Filter playlist';
      bar.style.flexDirection = 'column';
      bar.style.alignItems = 'stretch';
      const topRow = document.createElement('div');
      topRow.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap';
      const searchWrap = document.createElement('div');
      searchWrap.className = 'ytc-pt-search-wrap';
      const input = document.createElement('input');
      input.id = 'ytc-pt-filter-input';
      input.type = 'search';
      input.placeholder = 'Search title or channel...';
      input.value = filterState.query;
      const runSearch = () => {
        filterState.query = input.value;
        filterState.target = 'both';
        applyFilter();
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          runSearch();
        }
      });
      searchWrap.append(makeSvgIcon(ICON_SEARCH, 15), input);

      const searchBtn = document.createElement('button');
      searchBtn.type = 'button';
      searchBtn.className = 'ytc-pt-fbtn';
      searchBtn.dataset.act = 'search-filter';
      searchBtn.textContent = 'Search';
      searchBtn.addEventListener('click', runSearch);

      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'ytc-pt-fbtn';
      resetBtn.dataset.act = 'reset-filter';
      resetBtn.textContent = 'Reset';
      resetBtn.addEventListener('click', resetFilter);

      const counter = document.createElement('span');
      counter.className = 'ytc-pt-counter';
      topRow.append(searchLabel, searchWrap, searchBtn, resetBtn, counter);

      const chips = document.createElement('div');
      chips.className = 'ytc-pt-chips';
      for (const [id, label] of [
        ['all', 'All'],
        ['available', 'Available'],
        ['unavailable', 'Unavailable'],
        ['watched', 'Watched'],
        ['unwatched', 'Unwatched'],
      ]) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'ytc-pt-chip';
        chip.dataset.chip = id;
        chip.textContent = label;
        chip.setAttribute('aria-pressed', String(filterState.chip === id));
        chip.addEventListener('click', () => {
          filterState.chip = id;
          for (const c of chips.querySelectorAll('.ytc-pt-chip')) {
            c.setAttribute('aria-pressed', String(c.dataset.chip === id));
          }
          applyFilter();
        });
        chips.append(chip);
      }

      bar.append(topRow, chips);
      listRoot.before(bar);
      applyFilter();
    }

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
      if (!enabled() || !get('playlistShowDuration', true)) {
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
      top.className = 'ytc-pt-dur-top';
      const main = document.createElement('span');
      main.className = 'ytc-pt-dur-total';
      const s = shownSum.totalSec;
      const totalLabel = document.createElement('span');
      totalLabel.textContent = active
        ? `Filtered: ${formatDuration(s)} (of ${formatDuration(totalSum.totalSec)})`
        : formatDuration(s);
      main.append(makeSvgIcon(ICON_CLOCK, 15), totalLabel);

      const meta = document.createElement('span');
      meta.className = 'ytc-pt-dur-meta';
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

      badge.append(top);
    }

    function mountHeaderButton() {
      if (!enabled()) {
        document.getElementById(BTN_ID)?.remove();
        return;
      }
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
      const titleTxt = currentListId() === 'WL' ? 'Watch Later Tools' : 'Playlist Tools';
      btn.append(makeSvgIcon(ICON_TOOLS, 16), document.createTextNode(titleTxt));
      btn.addEventListener('click', () => openDialog('cleanup'));
      if (badge && badge.parentElement === anchor) anchor.insertBefore(btn, badge);
      else anchor.append(btn);
    }

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
      const dlgTitle = currentListId() === 'WL' ? 'Watch Later Tools' : 'Playlist Tools';
      dialog.setAttribute('aria-label', dlgTitle);

      const head = document.createElement('div');
      head.className = 'ytc-pt-dhead';
      const title = document.createElement('h2');
      title.textContent = dlgTitle;
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'ytc-pt-close';
      closeBtn.setAttribute('aria-label', 'Close');
      closeBtn.textContent = '\u00d7';
      closeBtn.addEventListener('click', closeDialog);
      head.append(title, closeBtn);

      const tablist = document.createElement('div');
      tablist.className = 'ytc-pt-tabs';
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
        t.className = 'ytc-pt-tab';
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
      body.className = 'ytc-pt-body';
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
        box.className = `ytc-pt-confirm${isInfo ? ' info' : ''}`;
        const head = document.createElement('div');
        head.className = 'ytc-pt-confirm-head';
        const ico = document.createElement('span');
        ico.className = 'ytc-pt-confirm-ico';
        ico.append(makeSvgIcon(isInfo ? ICON_TOOLS : ICON_ALERT, 16));
        const h = document.createElement('strong');
        h.className = 'ytc-pt-confirm-title';
        h.textContent = confirmState.title;
        head.append(ico, h);
        const p = document.createElement('p');
        p.className = 'ytc-pt-confirm-msg';
        p.textContent = confirmState.summary;
        box.append(head, p);
        if (confirmState.warning) {
          const w = document.createElement('div');
          w.className = 'ytc-pt-warn';
          w.append(makeSvgIcon(ICON_ALERT, 15), document.createTextNode(confirmState.warning));
          box.append(w);
        }
        const row = document.createElement('div');
        row.className = 'ytc-pt-confirm-actions';
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'ytc-pt-btn';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => {
          confirmState = null;
          renderBody();
        });
        const okBtn = document.createElement('button');
        okBtn.type = 'button';
        okBtn.className = `ytc-pt-btn ${isInfo ? 'primary' : 'danger'}`;
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
          wrap.className = 'ytc-pt-confirm-wrap';
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
        summary.className = 'ytc-pt-note';
        summary.textContent = `Loaded: ${items.length} videos · Total duration: ${formatDuration(total.totalSec)}`;
        body.append(summary);

        const clearCard = document.createElement('div');
        clearCard.className = 'ytc-pt-card';
        const clearH = document.createElement('h3');
        clearH.textContent = 'Clear Playlist';
        const clearLbl = document.createElement('label');
        clearLbl.setAttribute('for', 'ytc-pt-clear-mode');
        clearLbl.textContent = 'Clear mode';
        const clearSel = document.createElement('select');
        clearSel.id = 'ytc-pt-clear-mode';
        for (const [val, label] of CLEAR_MODES) {
          const opt = document.createElement('option');
          opt.value = val;
          opt.textContent = label;
          if (val === get('playlistClearMode', 'unavailable-only')) opt.selected = true;
          clearSel.append(opt);
        }
        clearSel.addEventListener('change', () => put('playlistClearMode', clearSel.value));
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'ytc-pt-btn danger';
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

        const watchCard = document.createElement('div');
        watchCard.className = 'ytc-pt-card';
        const watchH = document.createElement('h3');
        watchH.textContent = 'Remove Watched';
        const watchLbl = document.createElement('label');
        watchLbl.setAttribute('for', 'ytc-pt-threshold');
        watchLbl.textContent = 'Watched threshold';
        const sliderRow = document.createElement('div');
        sliderRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin:4px 0 8px';
        const watchIn = document.createElement('input');
        watchIn.id = 'ytc-pt-threshold';
        watchIn.type = 'range';
        watchIn.min = '10';
        watchIn.max = '100';
        watchIn.step = '5';
        watchIn.style.cssText = 'flex:1;accent-color:var(--yt-spec-call-to-action,#3ea6ff);cursor:pointer';
        watchIn.value = String(get('playlistWatchedThreshold', 80));
        const watchVal = document.createElement('span');
        watchVal.style.cssText = 'min-width:40px;text-align:right;font-size:13px;font-weight:600';
        watchVal.textContent = `${watchIn.value}%`;
        watchIn.addEventListener('input', () => {
          watchVal.textContent = `${watchIn.value}%`;
        });
        watchIn.addEventListener('change', () => {
          const n = Math.min(100, Math.max(10, Math.round(Number(watchIn.value) || 80)));
          watchIn.value = String(n);
          watchVal.textContent = `${n}%`;
          put('playlistWatchedThreshold', n);
        });
        sliderRow.append(watchIn, watchVal);
        const watchBtn = document.createElement('button');
        watchBtn.type = 'button';
        watchBtn.className = 'ytc-pt-btn';
        watchBtn.textContent = 'Remove Watched';
        watchBtn.addEventListener('click', () => {
          const th = Math.min(100, Math.max(10, Math.round(Number(watchIn.value) || 80)));
          put('playlistWatchedThreshold', th);
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
        watchCard.append(watchH, watchLbl, sliderRow, watchBtn);
        body.append(watchCard);

        const dupCard = document.createElement('div');
        dupCard.className = 'ytc-pt-card';
        const dupH = document.createElement('h3');
        dupH.textContent = 'Remove Duplicates';
        const dupLbl = document.createElement('label');
        dupLbl.setAttribute('for', 'ytc-pt-dup-keep');
        dupLbl.textContent = 'Keep copy';
        const dupSel = document.createElement('select');
        dupSel.id = 'ytc-pt-dup-keep';
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
        dupBtn.className = 'ytc-pt-btn';
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

        const kwCard = document.createElement('div');
        kwCard.className = 'ytc-pt-card';
        const kwH = document.createElement('h3');
        kwH.textContent = 'Remove by Channel / Keyword';
        const kwLbl = document.createElement('label');
        kwLbl.setAttribute('for', 'ytc-pt-kw-input');
        kwLbl.textContent = 'Keyword';
        const kwIn = document.createElement('input');
        kwIn.id = 'ytc-pt-kw-input';
        kwIn.type = 'text';
        kwIn.value = kwQuery;
        kwIn.placeholder = 'Enter title or channel keyword...';

        const tgtLbl = document.createElement('label');
        tgtLbl.setAttribute('for', 'ytc-pt-kw-target');
        tgtLbl.textContent = 'Match target';
        const tgtSel = document.createElement('select');
        tgtSel.id = 'ytc-pt-kw-target';
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
        kwPreview.className = 'ytc-pt-note';
        const updateKwPreview = () => {
          const current = getAllItems();
          const matches = current.filter((i) => matchKeywordItem(i, kwQuery, kwTarget));
          if (!kwQuery.trim()) {
            kwPreview.textContent = 'Type a keyword to preview matches.';
            return;
          }
          const sample = matches.slice(0, 3).map((m) => m.title).join(', ');
          kwPreview.textContent = matches.length ? `${matches.length} match(es): ${sample}` : '0 matches found.';
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
        kwRow.className = 'ytc-pt-row';
        const prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.className = 'ytc-pt-btn';
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
        remKwBtn.className = 'ytc-pt-btn danger';
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

        const uiCard = document.createElement('div');
        uiCard.className = 'ytc-pt-card';
        const uiH = document.createElement('h3');
        uiH.textContent = 'Display Settings';
        const makeToggle = (id, label, key, onChange) => {
          const wrap = document.createElement('label');
          wrap.className = 'ytc-pt-row';
          wrap.setAttribute('for', id);
          const cb = document.createElement('input');
          cb.id = id;
          cb.type = 'checkbox';
          cb.checked = !!get(key, true);
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
          makeToggle('ytc-pt-show-filter', 'Show in-playlist search & filter bar', 'playlistShowFilterBar', mountFilterBar),
          makeToggle('ytc-pt-show-dur', 'Show total duration calculator badge', 'playlistShowDuration', updateDurationBadge)
        );
        body.append(uiCard);
      }

      function renderExportTab() {
        const card = document.createElement('div');
        card.className = 'ytc-pt-card';
        const h = document.createElement('h3');
        h.textContent = 'Export Playlist';

        const scopeLbl = document.createElement('label');
        scopeLbl.setAttribute('for', 'ytc-pt-export-scope');
        scopeLbl.textContent = 'Scope';
        const scopeSel = document.createElement('select');
        scopeSel.id = 'ytc-pt-export-scope';
        const storedScope = get('playlistExportScope', 'unavailable-all');
        for (const [val, label] of EXPORT_SCOPES) {
          if (val === 'filtered' && !isFilterActive()) continue;
          const opt = document.createElement('option');
          opt.value = val;
          opt.textContent = label;
          if (val === storedScope) opt.selected = true;
          scopeSel.append(opt);
        }
        scopeSel.addEventListener('change', () => {
          if (scopeSel.value !== 'filtered') put('playlistExportScope', scopeSel.value);
        });

        const fmtLbl = document.createElement('label');
        fmtLbl.setAttribute('for', 'ytc-pt-export-fmt');
        fmtLbl.textContent = 'Format';
        const fmtSel = document.createElement('select');
        fmtSel.id = 'ytc-pt-export-fmt';
        for (const [val, label] of [
          ['md', 'Markdown (.md)'],
          ['txt', 'Plain URLs (.txt)'],
        ]) {
          const opt = document.createElement('option');
          opt.value = val;
          opt.textContent = label;
          if (val === get('playlistExportFormat', 'md')) opt.selected = true;
          fmtSel.append(opt);
        }
        fmtSel.addEventListener('change', () => put('playlistExportFormat', fmtSel.value));

        const resWrap = document.createElement('label');
        resWrap.className = 'ytc-pt-row';
        resWrap.setAttribute('for', 'ytc-pt-resolve-titles');
        const resCb = document.createElement('input');
        resCb.id = 'ytc-pt-resolve-titles';
        resCb.type = 'checkbox';
        resCb.checked = !!get('playlistResolveTitles', false);
        resCb.addEventListener('change', () => put('playlistResolveTitles', resCb.checked));
        const resText = document.createElement('span');
        resText.textContent = 'Resolve unavailable titles (Markdown only)';
        resWrap.append(resCb, resText);

        const warnBox = document.createElement('div');
        warnBox.className = 'ytc-pt-warn';
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
        expBtn.className = 'ytc-pt-btn primary';
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
        card.className = 'ytc-pt-card';
        const h = document.createElement('h3');
        h.textContent = 'Import Playlist';

        const fileLbl = document.createElement('label');
        fileLbl.setAttribute('for', 'ytc-pt-import-file');
        fileLbl.textContent = 'Load .md or .txt file';
        const fileIn = document.createElement('input');
        fileIn.id = 'ytc-pt-import-file';
        fileIn.type = 'file';
        fileIn.accept = '.md,.txt,text/plain,text/markdown';

        const taLbl = document.createElement('label');
        taLbl.setAttribute('for', 'ytc-pt-import-text');
        taLbl.textContent = 'Or paste URLs / Markdown / video IDs';
        const ta = document.createElement('textarea');
        ta.id = 'ytc-pt-import-text';
        ta.value = importText;
        ta.placeholder = 'https://www.youtube.com/watch?v=...';

        const skipWrap = document.createElement('label');
        skipWrap.className = 'ytc-pt-row';
        skipWrap.setAttribute('for', 'ytc-pt-import-skip');
        const skipCb = document.createElement('input');
        skipCb.id = 'ytc-pt-import-skip';
        skipCb.type = 'checkbox';
        skipCb.checked = !!get('playlistImportSkipExisting', true);
        skipCb.addEventListener('change', () => {
          put('playlistImportSkipExisting', skipCb.checked);
          updatePreview();
        });
        const skipText = document.createElement('span');
        skipText.textContent = 'Skip videos already in playlist';
        skipWrap.append(skipCb, skipText);

        const preview = document.createElement('p');
        preview.className = 'ytc-pt-note';

        const impBtn = document.createElement('button');
        impBtn.type = 'button';
        impBtn.className = 'ytc-pt-btn primary';
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

    openPlaylistToolsDialog = () => {
      if (!enabled()) return;
      if (!onPlaylistPage()) {
        showToast({
          text: 'Open a YouTube playlist page (/playlist?list=...) to use Playlist Tools.',
          actions: [{ label: 'Close', onClick: clearToast }],
        });
        return;
      }
      openDialog('cleanup');
    };

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
          if (!enabled() || !onPlaylistPage()) return;
          mountHeaderButton();
          mountFilterBar();
          updateDurationBadge();
          applyFilter();
        }, 200);
      });
      listObserver.observe(root, { childList: true, subtree: true });
    }

    function syncPage() {
      if (!enabled() || !onPlaylistPage()) {
        teardownPageUi();
        return;
      }
      mountHeaderButton();
      mountFilterBar();
      updateDurationBadge();
      observeList();
    }

    document.addEventListener('yt-navigate-finish', () => {
      cancelActiveTask();
      closeDialog();
      filterState.query = '';
      filterState.chip = 'all';
      filterState.target = 'both';
      syncPage();
    });
    document.addEventListener('ytc-change', syncPage);

    syncPage();
    setTimeout(syncPage, 1000);
  }

  // ---------- liked videos tools ----------

  {
    const enabled = () => isTop && featureOn('likedTools');
    const onLikedPage = () =>
      location.pathname === '/playlist' && new URLSearchParams(location.search).get('list') === 'LL';

    const STYLE_ID = 'ytc-lt-style';
    const BTN_ID = 'ytc-lt-open-btn';
    const DURATION_ID = 'ytc-lt-duration-badge';
    const FILTER_ID = 'ytc-lt-filter-bar';
    const EMPTY_ID = 'ytc-lt-empty-state';
    const BACKDROP_ID = 'ytc-lt-backdrop';
    const DIALOG_ID = 'ytc-lt-dialog';
    const TOAST_ID = 'ytc-lt-toast';
    const HIDDEN_ATTR = 'data-ytc-lt-hidden';

    const UNLIKE_DELAY_MS = 350;
    const COPY_DELAY_MS = 400;
    const RESOLVE_CONCURRENCY = 3;
    const RESOLVE_TIMEOUT_MS = 8000;
    const SCROLL_STALL_ROUNDS = 4;
    const SCROLL_WAIT_MS = 650;

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const cleanText = (s) => (s || '').replace(/\s+/g, ' ').trim();

    const CLEAR_MODES = [
      ['unavailable-only', 'Unlike unavailable only'],
      ['unavailable-deleted', 'Unlike deleted only'],
      ['unavailable-private', 'Unlike private only'],
      ['skip-unavailable', 'Skip unavailable (unlike available)'],
      ['skip-deleted', 'Skip deleted'],
      ['skip-private', 'Skip private'],
      ['none', 'Unlike all'],
    ];

    const resolvedTitleCache = new Map();
    let activeTask = null;
    let lastTrigger = null;
    let filterState = { query: '', chip: 'all', target: 'both' };
    let pageObserver = null;
    let mountTimer = 0;

    const LT_SVG_NS = 'http://www.w3.org/2000/svg';
    const ICON_HEART = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
    const ICON_CLOCK = 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z';
    const ICON_SEARCH = 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z';
    const ICON_CLOSE = 'M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z';
    const ICON_WARN = 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z';

    function makeSvgIcon(pathD, size = 16) {
      const svg = document.createElementNS(LT_SVG_NS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('width', String(size));
      svg.setAttribute('height', String(size));
      svg.setAttribute('fill', 'currentColor');
      svg.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS(LT_SVG_NS, 'path');
      path.setAttribute('d', pathD);
      svg.append(path);
      return svg;
    }

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

    const isHiddenByMembers = (row) => row.hasAttribute('data-ytc-off') || row.hasAttribute('data-ytmp-hidden');

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

    function selectClearTargets(items, mode) {
      const targets = [];
      let skipped = 0;
      for (const it of items) {
        let remove = false;
        if (mode === 'unavailable-only') remove = it.status !== 'available';
        else if (mode === 'unavailable-deleted') remove = it.status === 'deleted';
        else if (mode === 'unavailable-private') remove = it.status === 'private';
        else if (mode === 'skip-unavailable') remove = it.status === 'available';
        else if (mode === 'skip-deleted') remove = it.status !== 'deleted';
        else if (mode === 'skip-private') remove = it.status !== 'private';
        else if (mode === 'none') remove = true;
        if (remove) targets.push(it);
        else skipped++;
      }
      return { targets, skipped };
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

    function getYtCfg() {
      const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
      const cfg = win?.ytcfg;
      if (!cfg) return {};
      const readCfg = (k) => (typeof cfg.get === 'function' ? cfg.get(k) : cfg.data_?.[k]);
      return {
        apiKey: readCfg('INNERTUBE_API_KEY') || '',
        context: readCfg('INNERTUBE_CONTEXT') || null,
        clientName: readCfg('INNERTUBE_CLIENT_NAME') || '1',
        clientVersion: readCfg('INNERTUBE_CLIENT_VERSION') || '',
        sessionIndex: readCfg('SESSION_INDEX'),
        pageId: readCfg('DELEGATED_SESSION_ID') || '',
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

    const LT_CSS = `
#${BTN_ID}{display:inline-flex;align-items:center;justify-content:center;gap:8px;align-self:flex-start;width:auto;min-height:36px;margin-top:10px;padding:0 16px;border:0;border-radius:18px;background:#0f0f0f;color:#fff;font:500 14px/1 Roboto,Arial,sans-serif;cursor:pointer;transition:background .15s}
#${BTN_ID}:hover{background:#272727}
html[dark] #${BTN_ID}{background:#f1f1f1;color:#0f0f0f}
html[dark] #${BTN_ID}:hover{background:#d9d9d9}
#${BTN_ID} svg,#${DURATION_ID} svg,#${FILTER_ID} svg,#${DIALOG_ID} .ytc-lt-dhead svg{flex:0 0 auto;display:block}
#${BTN_ID}:focus-visible,#${DURATION_ID} button:focus-visible,#${FILTER_ID} button:focus-visible,#${FILTER_ID} input:focus-visible,#${DIALOG_ID} button:focus-visible,#${DIALOG_ID} input:focus-visible,#${DIALOG_ID} select:focus-visible,#${TOAST_ID} button:focus-visible{outline:2px solid #065fd4;outline-offset:2px}
html[dark] #${BTN_ID}:focus-visible,html[dark] #${DURATION_ID} button:focus-visible,html[dark] #${FILTER_ID} button:focus-visible,html[dark] #${FILTER_ID} input:focus-visible,html[dark] #${DIALOG_ID} button:focus-visible,html[dark] #${DIALOG_ID} input:focus-visible,html[dark] #${DIALOG_ID} select:focus-visible,html[dark] #${TOAST_ID} button:focus-visible{outline-color:#3ea6ff}
#${DURATION_ID}{display:flex;flex-direction:column;gap:8px;width:100%;box-sizing:border-box;margin:10px 0 4px;padding:12px 14px;border:0;border-radius:12px;background:rgba(0,0,0,.05);color:#0f0f0f;font:400 13px/1.4 Roboto,Arial,sans-serif;font-variant-numeric:tabular-nums}
html[dark] #${DURATION_ID}{background:rgba(255,255,255,.08);color:#f1f1f1}
#${DURATION_ID} .ytc-lt-dur-top{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
#${DURATION_ID} .ytc-lt-dur-total{display:inline-flex;align-items:center;gap:6px;font-size:15px;font-weight:600;letter-spacing:-.01em}
#${DURATION_ID} .ytc-lt-dur-meta{margin-left:auto;font-size:12px;color:#606060}
html[dark] #${DURATION_ID} .ytc-lt-dur-meta{color:#aaa}
#${DURATION_ID} button{min-height:28px;padding:0 12px;border:0;border-radius:14px;background:rgba(0,0,0,.08);color:inherit;font:500 12px/1 Roboto,Arial,sans-serif;cursor:pointer;transition:background .15s}
#${DURATION_ID} button:hover{background:rgba(0,0,0,.14)}
html[dark] #${DURATION_ID} button{background:rgba(255,255,255,.14)}
html[dark] #${DURATION_ID} button:hover{background:rgba(255,255,255,.22)}
#${FILTER_ID}{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 10px;padding:4px 24px 8px;border:0;background:transparent;color:#0f0f0f;font:400 13px/1.4 Roboto,Arial,sans-serif;box-sizing:border-box;max-width:100%}
@media (max-width:600px){#${FILTER_ID}{padding:4px 12px 8px}}
html[dark] #${FILTER_ID}{color:#f1f1f1}
#${FILTER_ID} .ytc-lt-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
#${FILTER_ID} .ytc-lt-search-wrap{position:relative;display:flex;align-items:center;flex:1 1 200px;min-width:150px;max-width:280px;height:32px;padding:0 10px;border:1px solid rgba(0,0,0,.18);border-radius:8px;background:#fff;box-sizing:border-box;transition:border-color .15s,background .15s,box-shadow .15s}
html[dark] #${FILTER_ID} .ytc-lt-search-wrap{border-color:rgba(255,255,255,.16);background:#121212}
#${FILTER_ID} .ytc-lt-search-wrap:focus-within{border-color:#065fd4;box-shadow:0 0 0 1px #065fd4}
html[dark] #${FILTER_ID} .ytc-lt-search-wrap:focus-within{border-color:#3ea6ff;box-shadow:0 0 0 1px #3ea6ff}
#${FILTER_ID} .ytc-lt-search-wrap svg{color:#606060;margin-right:8px}
html[dark] #${FILTER_ID} .ytc-lt-search-wrap svg{color:#aaa}
#${FILTER_ID} input[type="search"]{flex:1;min-width:0;height:100%;border:0;background:transparent;color:inherit;font:inherit;outline:none}
#${FILTER_ID} input[type="search"]:focus-visible{outline:none}
#${FILTER_ID} .ytc-lt-chips{display:flex;flex-wrap:wrap;gap:6px}
#${FILTER_ID} .ytc-lt-chip{min-height:32px;padding:0 12px;border:0;border-radius:8px;background:rgba(0,0,0,.05);color:#0f0f0f;font:500 13px/1 Roboto,Arial,sans-serif;cursor:pointer;transition:background .15s,color .15s}
#${FILTER_ID} .ytc-lt-chip:hover{background:rgba(0,0,0,.1)}
html[dark] #${FILTER_ID} .ytc-lt-chip{background:rgba(255,255,255,.1);color:#f1f1f1}
html[dark] #${FILTER_ID} .ytc-lt-chip:hover{background:rgba(255,255,255,.18)}
#${FILTER_ID} .ytc-lt-chip[aria-pressed="true"]{background:#0f0f0f;color:#fff}
html[dark] #${FILTER_ID} .ytc-lt-chip[aria-pressed="true"]{background:#f1f1f1;color:#0f0f0f}
#${FILTER_ID} .ytc-lt-counter{font-size:12px;font-variant-numeric:tabular-nums;color:#606060;margin-left:auto;padding:0 4px}
html[dark] #${FILTER_ID} .ytc-lt-counter{color:#aaa}
#${FILTER_ID} .ytc-lt-fbtn{min-height:32px;padding:0 12px;border:0;border-radius:8px;background:rgba(0,0,0,.06);color:inherit;font:500 12px/1 Roboto,Arial,sans-serif;cursor:pointer;transition:background .15s}
#${FILTER_ID} .ytc-lt-fbtn:hover{background:rgba(0,0,0,.12)}
html[dark] #${FILTER_ID} .ytc-lt-fbtn{background:rgba(255,255,255,.12)}
html[dark] #${FILTER_ID} .ytc-lt-fbtn:hover{background:rgba(255,255,255,.2)}
#${EMPTY_ID}{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:12px;padding:24px 16px;margin:8px 24px;border:0;border-radius:12px;background:rgba(0,0,0,.04);color:#606060;font:400 13px/1.4 Roboto,Arial,sans-serif}
html[dark] #${EMPTY_ID}{background:rgba(255,255,255,.05);color:#aaa}
[${HIDDEN_ATTR}]{display:none!important}
#${BACKDROP_ID}{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.7);padding:16px;box-sizing:border-box}
#${DIALOG_ID},#${DIALOG_ID} *{box-sizing:border-box}
#${DIALOG_ID}{display:flex;flex-direction:column;width:100%;max-width:min(520px,calc(100vw - 32px));height:min(76vh,620px);height:min(76dvh,620px);max-height:calc(100vh - 32px);overflow:hidden;border-radius:16px;background:#fff;color:#0f0f0f;box-shadow:0 20px 48px rgba(0,0,0,.45);font:400 13px/1.45 Roboto,Arial,sans-serif}
html[dark] #${DIALOG_ID}{background:#212121;color:#f1f1f1;border:1px solid rgba(255,255,255,.08)}
#${DIALOG_ID} .ytc-lt-dhead{flex:0 0 auto;position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:10px;padding:14px 16px 14px 20px;background:#fff;border-bottom:1px solid rgba(0,0,0,.08)}
html[dark] #${DIALOG_ID} .ytc-lt-dhead{background:#212121;border-bottom-color:rgba(255,255,255,.1)}
#${DIALOG_ID} .ytc-lt-dhead h2{flex:1;margin:0;font-size:16px;font-weight:600}
#${DIALOG_ID} .ytc-lt-close{width:36px;height:36px;border:0;border-radius:50%;background:transparent;color:inherit;font-size:22px;line-height:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background .15s}
#${DIALOG_ID} .ytc-lt-close:hover{background:rgba(0,0,0,.06)}
html[dark] #${DIALOG_ID} .ytc-lt-close:hover{background:rgba(255,255,255,.1)}
#${DIALOG_ID} .ytc-lt-tabs{flex:0 0 auto;display:flex;background:#fff;border-bottom:1px solid rgba(0,0,0,.08);padding:0 16px;gap:4px}
html[dark] #${DIALOG_ID} .ytc-lt-tabs{background:#212121;border-bottom-color:rgba(255,255,255,.1)}
#${DIALOG_ID} .ytc-lt-tab{padding:11px 16px;border:0;border-bottom:2px solid transparent;background:transparent;color:#606060;font:500 13px/1 Roboto,Arial,sans-serif;cursor:pointer;transition:color .15s,border-color .15s}
#${DIALOG_ID} .ytc-lt-tab:hover{color:#0f0f0f}
html[dark] #${DIALOG_ID} .ytc-lt-tab{color:#aaa}
html[dark] #${DIALOG_ID} .ytc-lt-tab:hover{color:#f1f1f1}
#${DIALOG_ID} .ytc-lt-tab[aria-selected="true"]{color:#0f0f0f;border-bottom-color:#065fd4}
html[dark] #${DIALOG_ID} .ytc-lt-tab[aria-selected="true"]{color:#f1f1f1;border-bottom-color:#3ea6ff}
#${DIALOG_ID} .ytc-lt-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:16px 20px 20px;display:flex;flex-direction:column;gap:12px}
#${DIALOG_ID} .ytc-lt-card{padding:14px 16px;border:0;border-radius:12px;background:rgba(0,0,0,.035);display:flex;flex-direction:column;gap:10px}
html[dark] #${DIALOG_ID} .ytc-lt-card{background:rgba(255,255,255,.05)}
#${DIALOG_ID} .ytc-lt-card h3{margin:0;font-size:14px;font-weight:600}
#${DIALOG_ID} .ytc-lt-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
#${DIALOG_ID} label{font-size:12px;color:#606060}
html[dark] #${DIALOG_ID} label{color:#aaa}
#${DIALOG_ID} select,#${DIALOG_ID} input[type="text"],#${DIALOG_ID} input[type="number"]{min-height:34px;padding:6px 10px;border:1px solid rgba(0,0,0,.18);border-radius:8px;background:#fff;color:inherit;font:inherit;transition:border-color .15s}
html[dark] #${DIALOG_ID} select,html[dark] #${DIALOG_ID} input[type="text"],html[dark] #${DIALOG_ID} input[type="number"]{background:#121212;border-color:rgba(255,255,255,.16)}
#${DIALOG_ID} .ytc-lt-btn{min-height:36px;padding:0 16px;border:0;border-radius:18px;background:rgba(0,0,0,.06);color:inherit;font:500 13px/1 Roboto,Arial,sans-serif;cursor:pointer;transition:background .15s}
#${DIALOG_ID} .ytc-lt-btn:hover{background:rgba(0,0,0,.12)}
html[dark] #${DIALOG_ID} .ytc-lt-btn{background:rgba(255,255,255,.1)}
html[dark] #${DIALOG_ID} .ytc-lt-btn:hover{background:rgba(255,255,255,.18)}
#${DIALOG_ID} .ytc-lt-btn.primary{background:#0f0f0f;color:#fff}
#${DIALOG_ID} .ytc-lt-btn.primary:hover{background:#272727}
html[dark] #${DIALOG_ID} .ytc-lt-btn.primary{background:#f1f1f1;color:#0f0f0f}
html[dark] #${DIALOG_ID} .ytc-lt-btn.primary:hover{background:#d9d9d9}
#${DIALOG_ID} .ytc-lt-btn.danger{background:#c00;color:#fff}
#${DIALOG_ID} .ytc-lt-btn.danger:hover{background:#a30000}
html[dark] #${DIALOG_ID} .ytc-lt-btn.danger{background:#d93025;color:#fff}
#${DIALOG_ID} .ytc-lt-note{font-size:12px;color:#606060;margin:0}
html[dark] #${DIALOG_ID} .ytc-lt-note{color:#aaa}
#${DIALOG_ID} .ytc-lt-warn{display:flex;align-items:flex-start;gap:8px;padding:10px 12px;border-radius:10px;background:rgba(217,119,6,.14);color:#92400e;font-size:12px;line-height:1.45}
html[dark] #${DIALOG_ID} .ytc-lt-warn{background:rgba(251,191,36,.14);color:#fde68a}
#${DIALOG_ID} .ytc-lt-check{display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:inherit}
#${DIALOG_ID} .ytc-lt-confirm-box{display:flex;flex-direction:column;gap:14px;padding:4px 0}
#${DIALOG_ID} .ytc-lt-confirm-head{display:flex;align-items:center;gap:10px;color:#c00;font-size:15px;font-weight:600}
html[dark] #${DIALOG_ID} .ytc-lt-confirm-head{color:#ff6b6b}
#${DIALOG_ID} .ytc-lt-confirm-list{margin:0;padding:10px 14px 10px 28px;border-radius:10px;background:rgba(0,0,0,.04);font-size:12px;color:#606060;display:flex;flex-direction:column;gap:4px}
html[dark] #${DIALOG_ID} .ytc-lt-confirm-list{background:rgba(255,255,255,.05);color:#ccc}
#${DIALOG_ID} .ytc-lt-confirm-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}
#${TOAST_ID}{position:fixed;right:24px;bottom:24px;z-index:2147483647;max-width:min(380px,calc(100vw - 32px));padding:14px 16px;border-radius:12px;background:#212121;color:#f1f1f1;box-shadow:0 12px 32px rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.1);font:400 13px/1.4 Roboto,Arial,sans-serif;display:flex;flex-direction:column;gap:10px}
#${TOAST_ID} .ytc-lt-tbar{height:4px;border-radius:2px;background:rgba(255,255,255,.16);overflow:hidden}
#${TOAST_ID} .ytc-lt-tbar > span{display:block;height:100%;background:#3ea6ff;transition:width .2s}
#${TOAST_ID} .ytc-lt-tactions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
#${TOAST_ID} button{min-height:30px;padding:0 12px;border:0;border-radius:15px;background:rgba(255,255,255,.14);color:#f1f1f1;font:500 12px/1 Roboto,Arial,sans-serif;cursor:pointer}
#${TOAST_ID} button:hover{background:rgba(255,255,255,.24)}
`;

    function ensureStyle() {
      if (document.getElementById(STYLE_ID)) return;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = LT_CSS;
      (document.head || document.documentElement).append(style);
    }

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
        bar.className = 'ytc-lt-tbar';
        const fill = document.createElement('span');
        fill.style.width = `${Math.min(100, Math.max(0, progress))}%`;
        bar.append(fill);
        toast.append(bar);
      }
      if (actions.length) {
        const row = document.createElement('div');
        row.className = 'ytc-lt-tactions';
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

    async function unlikeViaDomFallback(row) {
      if (!row || !row.isConnected) return { ok: false, readOnly: false };
      const menuBtn = row.querySelector(
        'ytd-menu-renderer button, #menu button, yt-lockup-metadata-view-model button[aria-label], button[aria-label*="Action menu" i], button[aria-label*="More actions" i]'
      );
      if (!menuBtn) return { ok: false, readOnly: true };
      menuBtn.click();
      let items = [];
      for (let i = 0; i < 15; i++) {
        items = [
          ...document.querySelectorAll(
            'ytd-menu-popup-renderer ytd-menu-service-item-renderer, ytd-menu-popup-renderer yt-list-item-view-model, tp-yt-iron-dropdown yt-list-item-view-model'
          ),
        ];
        if (items.length) break;
        await sleep(50);
      }
      if (!items.length) return { ok: false, readOnly: true };
      let target = items.find((el) => {
        const d = el.data || el.__data?.data;
        if (d?.serviceEndpoint?.likeEndpoint?.status === 'INDIFFERENT') return true;
        const acts = d?.serviceEndpoint?.playlistEditEndpoint?.actions;
        return Array.isArray(acts) && acts.some((a) => String(a?.action || '').includes('REMOVE_VIDEO'));
      });
      if (!target) {
        target = items.find((el) =>
          /remove from liked videos|hapus dari video yang disukai|unlike/i.test(cleanText(el.textContent))
        );
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

    async function unlikeSingleItem(item) {
      let apiAuthError = false;
      if (item.videoId) {
        const res = await unlikeVideo(item.videoId);
        if (res.ok) {
          item.row.remove();
          return { ok: true, authError: false };
        }
        apiAuthError = !!res.authError;
      }
      const fb = await unlikeViaDomFallback(item.row);
      if (fb.ok) return { ok: true, authError: false };
      return { ok: false, authError: apiAuthError };
    }

    async function runBulkUnlike(items, label) {
      const valid = items.filter((i) => i.videoId || i.row?.isConnected);
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
        const res = await unlikeSingleItem(item);
        if (res.ok) {
          done++;
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

    function gmGetJson(url) {
      return new Promise((resolve) => {
        if (typeof GM_xmlhttpRequest !== 'function') return resolve(null);
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

    const escapeMd = (s) =>
      String(s || '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\[/g, '\\[').replace(/\]/g, '\\]');

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
      const unavailableItems = items.filter((i) => i.status !== 'available' && i.videoId);
      const withTitles = shouldResolve && format === 'md' && unavailableItems.length > 0;
      let content = '';
      if (format === 'txt') {
        content = items
          .filter((i) => i.videoId)
          .map((i) => (i.isShort ? `https://www.youtube.com/shorts/${i.videoId}` : `https://www.youtube.com/watch?v=${i.videoId}`))
          .join('\n');
      } else {
        const groups = {
          available: items.filter((i) => i.status === 'available'),
          deleted: items.filter((i) => i.status === 'deleted'),
          private: items.filter((i) => i.status === 'private'),
          unavailable: items.filter((i) => i.status !== 'available' && i.status !== 'deleted' && i.status !== 'private'),
        };
        const lines = [
          '# YouTube Liked Videos Export',
          '',
          `- Date: ${date}`,
          `- Scope: ${scope}`,
          `- Total: ${items.length} (Available: ${groups.available.length}, Deleted: ${groups.deleted.length}, Private: ${groups.private.length}, Other unavailable: ${groups.unavailable.length})`,
          '',
        ];
        if (groups.available.length) {
          lines.push('## Available', '', '| # | Video ID | Title | Channel | YouTube |', '| --- | --- | --- | --- | --- |');
          groups.available.forEach((item, idx) => {
            const url = item.isShort
              ? `https://www.youtube.com/shorts/${item.videoId}`
              : `https://www.youtube.com/watch?v=${item.videoId}`;
            lines.push(`| ${idx + 1} | \`${item.videoId}\` | ${escapeMd(item.title)} | ${escapeMd(item.channel)} | [Link](${url}) |`);
          });
          lines.push('');
        }
        const unavailSections = [
          ['Deleted', groups.deleted],
          ['Private', groups.private],
          ['Other Unavailable', groups.unavailable],
        ];
        for (const [heading, list] of unavailSections) {
          if (!list.length) continue;
          lines.push(`## ${heading}`, '');
          if (withTitles) {
            lines.push('| # | Video ID | Title | YouTube | Wayback Machine |', '| --- | --- | --- | --- | --- |');
          } else {
            lines.push('| # | Video ID | YouTube | Wayback Machine |', '| --- | --- | --- | --- |');
          }
          list.forEach((item, idx) => {
            const yt = item.isShort
              ? `https://www.youtube.com/shorts/${item.videoId}`
              : `https://www.youtube.com/watch?v=${item.videoId}`;
            const wb = `https://web.archive.org/web/*/${yt}`;
            if (withTitles) {
              const found = resolved.get(item.videoId);
              const titleCell = found ? escapeMd(found) : '*(not found)*';
              lines.push(`| ${idx + 1} | \`${item.videoId}\` | ${titleCell} | [Link](${yt}) | [Archive](${wb}) |`);
            } else {
              lines.push(`| ${idx + 1} | \`${item.videoId}\` | [Link](${yt}) | [Archive](${wb}) |`);
            }
          });
          lines.push('');
        }
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
        if (res.ok) added++;
        else if (res.authError) {
          authBlocked = true;
          break;
        } else failed++;
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

    const isFilterActive = () => filterState.query.trim() !== '' || filterState.chip !== 'all';

    function matchesFilter(item) {
      const chip = filterState.chip;
      const threshold = Number(get('likedWatchedThreshold', 80)) || 80;
      if (chip === 'available' && item.status !== 'available') return false;
      if (chip === 'unwatched' && item.watchedPct >= threshold) return false;
      if (chip === 'watched' && item.watchedPct < threshold) return false;
      if (chip === 'shorts' && !item.isShort) return false;
      if (chip === 'unavailable' && item.status === 'available') return false;
      const q = filterState.query.trim().toLowerCase();
      if (!q) return true;
      if (filterState.target === 'title') return `${item.title} ${item.rawTitle}`.toLowerCase().includes(q);
      if (filterState.target === 'channel') return item.channel.toLowerCase().includes(q);
      return `${item.title} ${item.rawTitle} ${item.channel}`.toLowerCase().includes(q);
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
        const counter = bar.querySelector('.ytc-lt-counter');
        if (counter) counter.textContent = `Showing ${shown} / ${totalVisible}`;
        for (const act of ['export-filtered', 'unlike-filtered', 'reset-filter']) {
          const b = bar.querySelector(`[data-act="${act}"]`);
          if (b) b.hidden = !active;
        }
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
          btn.className = 'ytc-lt-fbtn';
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
      filterState = { query: '', chip: 'all', target: 'both' };
      const bar = document.getElementById(FILTER_ID);
      if (bar) {
        const input = bar.querySelector('input[type="search"]');
        if (input) input.value = '';
        for (const c of bar.querySelectorAll('.ytc-lt-chip')) {
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
      if (!enabled() || get('likedShowFilterBar', true) !== true) {
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
      bar.style.flexDirection = 'column';
      bar.style.alignItems = 'stretch';

      const topRow = document.createElement('div');
      topRow.style.cssText = 'display:flex;align-items:center;gap:6px;flex-wrap:wrap';
      const searchLabel = document.createElement('label');
      searchLabel.className = 'ytc-lt-sr';
      searchLabel.setAttribute('for', 'ytc-lt-filter-input');
      searchLabel.textContent = 'Filter liked videos';
      const searchWrap = document.createElement('div');
      searchWrap.className = 'ytc-lt-search-wrap';
      const input = document.createElement('input');
      input.id = 'ytc-lt-filter-input';
      input.type = 'search';
      input.placeholder = 'Search title or channel...';
      input.value = filterState.query;
      const runSearch = () => {
        filterState.query = input.value;
        filterState.target = 'both';
        applyFilter();
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          runSearch();
        }
      });
      searchWrap.append(makeSvgIcon(ICON_SEARCH, 15), input);

      const searchBtn = document.createElement('button');
      searchBtn.type = 'button';
      searchBtn.className = 'ytc-lt-fbtn';
      searchBtn.dataset.act = 'search-filter';
      searchBtn.textContent = 'Search';
      searchBtn.addEventListener('click', runSearch);

      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'ytc-lt-fbtn';
      resetBtn.dataset.act = 'reset-filter';
      resetBtn.textContent = 'Reset';
      resetBtn.hidden = !isFilterActive();
      resetBtn.addEventListener('click', resetFilter);

      const counter = document.createElement('span');
      counter.className = 'ytc-lt-counter';
      topRow.append(searchLabel, searchWrap, searchBtn, resetBtn, counter);

      const chips = document.createElement('div');
      chips.className = 'ytc-lt-chips';
      for (const [id, label] of [
        ['all', 'All'],
        ['available', 'Available'],
        ['unavailable', 'Unavailable'],
        ['watched', 'Watched'],
        ['unwatched', 'Unwatched'],
        ['shorts', 'Shorts'],
      ]) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'ytc-lt-chip';
        chip.dataset.chip = id;
        chip.textContent = label;
        chip.setAttribute('aria-pressed', String(filterState.chip === id));
        chip.addEventListener('click', () => {
          filterState.chip = id;
          for (const c of chips.querySelectorAll('.ytc-lt-chip')) {
            c.setAttribute('aria-pressed', String(c.dataset.chip === id));
          }
          applyFilter();
        });
        chips.append(chip);
      }

      bar.append(topRow, chips);
      listRoot.before(bar);
      applyFilter();
    }

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
      if (!enabled() || get('likedShowDuration', true) !== true) {
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
      top.className = 'ytc-lt-dur-top';
      const main = document.createElement('span');
      main.className = 'ytc-lt-dur-total';
      const s = shownSum.totalSec;
      const totalLabel = document.createElement('span');
      totalLabel.textContent = active
        ? `Filtered: ${formatDuration(s)} (of ${formatDuration(totalSum.totalSec)})`
        : formatDuration(s);
      main.append(makeSvgIcon(ICON_CLOCK, 15), totalLabel);

      const meta = document.createElement('span');
      meta.className = 'ytc-lt-dur-meta';
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

      badge.append(top);
    }

    function mountHeaderButton() {
      if (!enabled()) {
        document.getElementById(BTN_ID)?.remove();
        return;
      }
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
      head.className = 'ytc-lt-dhead';
      const title = document.createElement('h2');
      title.textContent = 'Liked Videos Tools';
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'ytc-lt-close';
      close.setAttribute('aria-label', 'Close');
      close.append(makeSvgIcon(ICON_CLOSE, 20));
      close.addEventListener('click', closeDialog);
      head.append(makeSvgIcon(ICON_HEART, 18), title, close);

      const tabs = document.createElement('div');
      tabs.className = 'ytc-lt-tabs';
      tabs.setAttribute('role', 'tablist');
      const body = document.createElement('div');
      body.className = 'ytc-lt-body';

      let currentTab = initialTab;
      let kwQuery = '';
      let kwTarget = 'both';
      const tabButtons = [];
      for (const [id, label] of [
        ['unlike', 'Bulk Unlike'],
        ['export', 'Export'],
        ['copy', 'Copy to Playlist'],
      ]) {
        const t = document.createElement('button');
        t.type = 'button';
        t.className = 'ytc-lt-tab';
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
        card.className = 'ytc-lt-card';
        const h = document.createElement('h3');
        h.textContent = heading;
        card.append(h);
        return card;
      };

      function askConfirm(label, items, { warning = '' } = {}) {
        if (!items.length) {
          showToast({ text: `No loaded liked videos match "${label}".`, actions: [{ label: 'Close', onClick: clearToast }] });
          return;
        }
        renderBody({ label, items, warning });
      }

      function renderBody(confirmState) {
        for (const b of tabButtons) {
          b.setAttribute('aria-selected', String(!confirmState && b.dataset.tab === currentTab));
        }
        tabs.hidden = !!confirmState;
        body.textContent = '';

        if (confirmState) {
          const box = document.createElement('div');
          box.className = 'ytc-lt-confirm-box';
          const ch = document.createElement('div');
          ch.className = 'ytc-lt-confirm-head';
          ch.append(makeSvgIcon(ICON_WARN, 20), document.createTextNode(`Confirm: ${confirmState.label}`));
          const summary = document.createElement('p');
          summary.className = 'ytc-lt-note';
          summary.textContent = `This will unlike ${confirmState.items.length} video(s) from your Liked Videos using YouTube's unlike API.`;
          box.append(ch, summary);
          if (confirmState.warning) {
            const warn = document.createElement('div');
            warn.className = 'ytc-lt-warn';
            warn.append(makeSvgIcon(ICON_WARN, 16), document.createTextNode(confirmState.warning));
            box.append(warn);
          }
          const list = document.createElement('ul');
          list.className = 'ytc-lt-confirm-list';
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
          actions.className = 'ytc-lt-confirm-actions';
          const cancel = document.createElement('button');
          cancel.type = 'button';
          cancel.className = 'ytc-lt-btn';
          cancel.textContent = 'Cancel';
          cancel.addEventListener('click', () => renderBody(null));
          const confirm = document.createElement('button');
          confirm.type = 'button';
          confirm.className = 'ytc-lt-btn danger';
          confirm.textContent = `Unlike ${confirmState.items.length} video(s)`;
          confirm.addEventListener('click', () => runBulkUnlike(confirmState.items, confirmState.label));
          actions.append(cancel, confirm);
          box.append(list, actions);
          body.append(box);
          cancel.focus();
          return;
        }

        if (currentTab === 'unlike') {
          const all = getAllItems();
          const clearCard = makeCard('Clear Liked Videos');
          const clearRow = document.createElement('div');
          clearRow.className = 'ytc-lt-row';
          const clearSel = document.createElement('select');
          clearSel.id = 'ytc-lt-clear-mode';
          const storedMode = get('likedClearMode', 'unavailable-only');
          for (const [val, txt] of CLEAR_MODES) {
            const o = document.createElement('option');
            o.value = val;
            o.textContent = txt;
            if (val === storedMode) o.selected = true;
            clearSel.append(o);
          }
          clearSel.addEventListener('change', () => put('likedClearMode', clearSel.value));
          const clearBtn = document.createElement('button');
          clearBtn.type = 'button';
          clearBtn.className = 'ytc-lt-btn danger';
          clearBtn.textContent = 'Unlike';
          clearBtn.addEventListener('click', () => {
            const mode = clearSel.value;
            const { targets } = selectClearTargets(getAllItems(), mode);
            const includesUnavail = mode !== 'skip-unavailable';
            const warning =
              includesUnavail && hasUnavailableHiddenBanner()
                ? 'Unavailable videos are currently hidden. Enable "Show unavailable videos" first to unlike them.'
                : '';
            askConfirm(clearSel.options[clearSel.selectedIndex].textContent, targets, { warning });
          });
          clearRow.append(clearSel, clearBtn);
          clearCard.append(clearRow);

          const watchedCard = makeCard('Unlike watched videos');
          const sliderRow = document.createElement('div');
          sliderRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin:4px 0 8px';
          const thInput = document.createElement('input');
          thInput.type = 'range';
          thInput.min = '10';
          thInput.max = '100';
          thInput.step = '5';
          thInput.value = String(get('likedWatchedThreshold', 80));
          thInput.style.cssText = 'flex:1;accent-color:var(--yt-spec-call-to-action,#3ea6ff);cursor:pointer';
          const thVal = document.createElement('span');
          thVal.style.cssText = 'min-width:40px;text-align:right;font-size:13px;font-weight:600';
          thVal.textContent = `${thInput.value}%`;
          thInput.addEventListener('input', () => {
            thVal.textContent = `${thInput.value}%`;
          });
          thInput.addEventListener('change', () => {
            const n = Math.min(100, Math.max(10, Number.parseInt(thInput.value, 10) || 80));
            thInput.value = String(n);
            thVal.textContent = `${n}%`;
            put('likedWatchedThreshold', n);
          });
          sliderRow.append(thInput, thVal);
          const watchedRow = document.createElement('div');
          watchedRow.className = 'ytc-lt-row';
          const watchedBtn = document.createElement('button');
          watchedBtn.type = 'button';
          watchedBtn.className = 'ytc-lt-btn danger';
          watchedBtn.textContent = 'Unlike watched';
          watchedBtn.addEventListener('click', () => {
            const th = Math.min(100, Math.max(10, Number.parseInt(thInput.value, 10) || 80));
            put('likedWatchedThreshold', th);
            askConfirm(`Watched >= ${th}%`, getAllItems().filter((i) => i.watchedPct >= th));
          });
          watchedRow.append(watchedBtn);
          watchedCard.append(sliderRow, watchedRow);

          const quickCard = makeCard('Unlike by keyword, Shorts or filter');
          const kwRow = document.createElement('div');
          kwRow.className = 'ytc-lt-row';
          const kwInput = document.createElement('input');
          kwInput.id = 'ytc-lt-kw-input';
          kwInput.type = 'text';
          kwInput.value = kwQuery;
          kwInput.placeholder = 'Title or channel keyword...';
          kwInput.style.flex = '1';
          const tgtSel = document.createElement('select');
          tgtSel.id = 'ytc-lt-kw-target';
          for (const [val, txt] of [
            ['both', 'Title & Channel'],
            ['title', 'Title'],
            ['channel', 'Channel'],
          ]) {
            const o = document.createElement('option');
            o.value = val;
            o.textContent = txt;
            if (val === kwTarget) o.selected = true;
            tgtSel.append(o);
          }
          kwRow.append(kwInput, tgtSel);

          const kwPreview = document.createElement('p');
          kwPreview.className = 'ytc-lt-note';
          const updateKwPreview = () => {
            const matches = getAllItems().filter((i) => matchKeywordItem(i, kwQuery, kwTarget));
            if (!kwQuery.trim()) {
              kwPreview.textContent = 'Type a keyword to preview matches.';
              return;
            }
            const sample = matches.slice(0, 3).map((m) => m.title).join(', ');
            kwPreview.textContent = matches.length ? `${matches.length} match(es): ${sample}` : '0 matches found.';
          };
          updateKwPreview();
          kwInput.addEventListener('input', () => {
            kwQuery = kwInput.value;
            updateKwPreview();
          });
          tgtSel.addEventListener('change', () => {
            kwTarget = tgtSel.value;
            updateKwPreview();
          });

          const kwActRow = document.createElement('div');
          kwActRow.className = 'ytc-lt-row';
          const prevBtn = document.createElement('button');
          prevBtn.type = 'button';
          prevBtn.className = 'ytc-lt-btn';
          prevBtn.textContent = 'Preview in list';
          prevBtn.addEventListener('click', () => {
            filterState.query = kwQuery;
            filterState.target = kwTarget;
            filterState.chip = 'all';
            const bar = document.getElementById(FILTER_ID);
            if (bar) {
              const inp = bar.querySelector('input[type="search"]');
              if (inp) inp.value = kwQuery;
              for (const c of bar.querySelectorAll('.ytc-lt-chip')) {
                c.setAttribute('aria-pressed', String(c.dataset.chip === 'all'));
              }
            }
            applyFilter();
            closeDialog();
          });
          const kwBtn = document.createElement('button');
          kwBtn.type = 'button';
          kwBtn.className = 'ytc-lt-btn danger';
          kwBtn.textContent = 'Unlike matching';
          kwBtn.addEventListener('click', () => {
            if (!kwQuery.trim()) return;
            const matched = getAllItems().filter((i) => matchKeywordItem(i, kwQuery, kwTarget));
            askConfirm(`Keyword "${kwQuery.trim()}"`, matched);
          });
          kwActRow.append(prevBtn, kwBtn);

          const extraRow = document.createElement('div');
          extraRow.className = 'ytc-lt-row';
          const shortsBtn = document.createElement('button');
          shortsBtn.type = 'button';
          shortsBtn.className = 'ytc-lt-btn';
          shortsBtn.textContent = `Unlike Shorts (${all.filter((i) => i.isShort).length})`;
          shortsBtn.addEventListener('click', () => askConfirm('Liked Shorts', selectScopeItems('shorts')));
          const filteredBtn = document.createElement('button');
          filteredBtn.type = 'button';
          filteredBtn.className = 'ytc-lt-btn';
          filteredBtn.textContent = 'Unlike currently filtered';
          filteredBtn.addEventListener('click', () => askConfirm('Filtered liked videos', selectScopeItems('filtered')));
          extraRow.append(shortsBtn, filteredBtn);
          quickCard.append(kwRow, kwPreview, kwActRow, extraRow);

          const uiCard = makeCard('Display Settings');
          const makeToggle = (id, label, key, onChange) => {
            const wrap = document.createElement('label');
            wrap.className = 'ytc-lt-check';
            wrap.setAttribute('for', id);
            const cb = document.createElement('input');
            cb.id = id;
            cb.type = 'checkbox';
            cb.checked = get(key, true) === true;
            cb.addEventListener('change', () => {
              put(key, cb.checked);
              onChange();
            });
            wrap.append(cb, document.createTextNode(label));
            return wrap;
          };
          uiCard.append(
            makeToggle('ytc-lt-show-filter', 'Show in-page search & filter bar', 'likedShowFilterBar', mountFilterBar),
            makeToggle('ytc-lt-show-dur', 'Show total duration calculator badge', 'likedShowDuration', updateDurationBadge)
          );

          body.append(clearCard, watchedCard, quickCard, uiCard);
          return;
        }

        if (currentTab === 'export') {
          const card = makeCard('Export liked videos');
          const row1 = document.createElement('div');
          row1.className = 'ytc-lt-row';
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
          fmtSel.value = get('likedExportFormat', 'md');
          fmtSel.addEventListener('change', () => put('likedExportFormat', fmtSel.value));
          row1.append(scopeSel, fmtSel);

          const resolveLabel = document.createElement('label');
          resolveLabel.className = 'ytc-lt-check';
          const resolveCb = document.createElement('input');
          resolveCb.type = 'checkbox';
          resolveCb.checked = get('likedResolveTitles', false) === true;
          resolveCb.addEventListener('change', () => put('likedResolveTitles', resolveCb.checked));
          resolveLabel.append(resolveCb, document.createTextNode('Resolve unavailable video titles (via findyoutubevideo)'));

          const warnBox = document.createElement('div');
          warnBox.className = 'ytc-lt-warn';
          const updateWarn = () => {
            const includesUnavail = scopeSel.value !== 'available' && scopeSel.value !== 'shorts';
            if (includesUnavail && hasUnavailableHiddenBanner()) {
              warnBox.textContent = '';
              warnBox.append(
                makeSvgIcon(ICON_WARN, 16),
                document.createTextNode('Unavailable videos are hidden. Enable "Show unavailable videos" first to include them.')
              );
              warnBox.style.display = '';
            } else {
              warnBox.style.display = 'none';
            }
          };
          updateWarn();
          scopeSel.addEventListener('change', updateWarn);

          const goBtn = document.createElement('button');
          goBtn.type = 'button';
          goBtn.className = 'ytc-lt-btn primary';
          goBtn.textContent = 'Export';
          goBtn.addEventListener('click', () => runExport(scopeSel.value, fmtSel.value, resolveCb.checked));
          card.append(row1, resolveLabel, warnBox, goBtn);
          body.append(card);
          return;
        }

        if (currentTab === 'copy') {
          const card = makeCard('Copy liked videos to another playlist');
          const note = document.createElement('p');
          note.className = 'ytc-lt-note';
          note.textContent = 'Paste a destination playlist URL or ID (for example WL or PL...).';
          const targetInput = document.createElement('input');
          targetInput.type = 'text';
          targetInput.placeholder = 'https://www.youtube.com/playlist?list=PL... or WL';
          targetInput.style.width = '100%';

          const row = document.createElement('div');
          row.className = 'ytc-lt-row';
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
          copyBtn.className = 'ytc-lt-btn primary';
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

    openLikedToolsDialog = () => {
      if (!enabled()) return;
      if (!onLikedPage()) {
        showToast({
          text: 'Open YouTube Liked Videos (/playlist?list=LL) to use Liked Videos Tools.',
          actions: [{ label: 'Close', onClick: clearToast }],
        });
        return;
      }
      openDialog('unlike');
    };

    function teardownPageUi() {
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
        if (!enabled() || !onLikedPage()) return;
        mountHeaderButton();
        mountFilterBar();
        updateDurationBadge();
      }, 150);
    }

    function syncPage() {
      if (!enabled() || !onLikedPage()) {
        teardownPageUi();
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

    document.addEventListener('yt-navigate-finish', () => {
      filterState = { query: '', chip: 'all', target: 'both' };
      syncPage();
    });
    window.addEventListener('popstate', syncPage);
    document.addEventListener('ytc-change', syncPage);
    syncPage();
    setTimeout(syncPage, 1000);
  }

  // ---------- bookmarks ----------

  const MARK_ICONS = {
    pencil: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
    trash: 'M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
    plus: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  };

  const SVG_NS = 'http://www.w3.org/2000/svg';

  function markIcon(name) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', MARK_ICONS[name]);
    path.setAttribute('fill', 'currentColor');
    svg.append(path);
    return svg;
  }

  const marksHourMode = (id) => marksFor(id).some((mark) => mark.t >= 3600);
  const sortedMarks = (id) => marksFor(id).slice().sort((a, b) => a.t - b.t);

  const chapterLines = (id) => {
    const hours = marksHourMode(id);
    return sortedMarks(id)
      .map((mark) => `${clock(mark.t, hours)} ${mark.n.replace(/\s+/g, ' ').trim()}`)
      .join('\n');
  };

  // YouTube only treats a description block as chapters when these rules hold
  function chapterIssue(id) {
    const list = sortedMarks(id);
    const hours = marksHourMode(id);
    if (list.length < 3) return 'YouTube needs at least 3 chapters.';
    if (list[0].t !== 0) return 'The first chapter must be at 0:00. Add a mark at the start of the video.';
    for (let i = 1; i < list.length; i++) {
      if (list[i].t - list[i - 1].t < 10) {
        return `${clock(list[i].t, hours)} is less than 10 seconds after ${clock(list[i - 1].t, hours)}.`;
      }
    }
    const video = currentVideo();
    const duration = video && Number.isFinite(video.duration) ? video.duration : 0;
    if (duration && duration - list[list.length - 1].t < 10) {
      return 'The last chapter needs 10 seconds of video after it.';
    }
    return '';
  }

  let armedMark = null;
  let editMarkAt = null;

  function seekTo(seconds) {
    const video = currentVideo();
    if (!video) return;
    const limit = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : seconds;
    video.currentTime = Math.max(0, Math.min(seconds, Math.floor(limit)));
  }

  function markRowElement(mark, id) {
    const hours = marksHourMode(id);
    const row = document.createElement('div');
    row.className = armedMark === mark.at ? 'ytc-row ytc-armed' : 'ytc-row';

    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'ytc-main';
    const time = document.createElement('span');
    time.className = 'ytc-time';
    time.textContent = clock(mark.t, hours);
    const name = document.createElement('span');
    name.className = 'ytc-name';
    name.textContent = armedMark === mark.at ? 'Press again' : mark.n;
    name.title = mark.n;
    main.append(time, name);
    main.addEventListener('click', () => {
      // An armed row is waiting for a second click elsewhere, so this only disarms it
      if (armedMark === mark.at) {
        armedMark = null;
        render();
        return;
      }
      seekTo(mark.t);
      closePanel();
    });

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'ytc-icon';
    edit.setAttribute('aria-label', `Edit ${mark.n}`);
    edit.title = `Edit ${mark.n}`;
    edit.append(markIcon('pencil'));
    edit.addEventListener('click', () => {
      armedMark = null;
      editMarkAt = mark.at;
      panelState.view = 'edit';
      render();
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'ytc-icon';
    remove.setAttribute('aria-label', `Delete ${mark.n}`);
    remove.title = `Delete ${mark.n}`;
    remove.append(markIcon('trash'));
    remove.addEventListener('click', () => {
      if (armedMark !== mark.at) {
        armedMark = mark.at;
        render();
        return;
      }
      armedMark = null;
      writeMarks(
        id,
        marksFor(id).filter((m) => m.at !== mark.at)
      );
      notifyChange();
      drawMenu();
      render();
    });

    row.append(main, edit, remove);
    return row;
  }

  function refreshMarkList() {
    if (!document.getElementById('ytc-panel')) return;
    if (!panelState || panelState.view !== 'list') return;
    render();
  }

  function renderMarkList(panel) {
    panel.textContent = '';
    const id = videoIdFromUrl();
    const list = sortedMarks(id);
    panel.append(
      panelHeader('Bookmarks', () => {
        panelState.view = 'settings';
        render();
      })
    );
    panel.setAttribute('aria-label', 'Bookmarks');

    if (list.length) {
      const count = document.createElement('p');
      count.className = 'ytc-status';
      count.textContent = `${list.length} mark${list.length === 1 ? '' : 's'} on this video`;
      panel.append(count);
    }

    if (!id) {
      const away = document.createElement('p');
      away.className = 'ytc-empty';
      away.textContent = 'Open a video page to see and add its bookmarks.';
      panel.append(away);
      panel.querySelector('button:not(.ytc-close):not(.ytc-back)')?.focus();
      return;
    }

    const add = document.createElement('button');
    add.type = 'button';
    const plus = document.createElement('span');
    plus.className = 'ytc-mark';
    plus.setAttribute('aria-hidden', 'true');
    plus.append(markIcon('plus'));
    add.append(plus, document.createTextNode('Add video bookmark'));
    add.addEventListener('click', () => openMarkDialog());
    panel.append(add);

    if (!list.length) {
      const empty = document.createElement('p');
      empty.className = 'ytc-empty';
      empty.textContent = 'No bookmarks yet. Press b on the watch page, or use the button above.';
      panel.append(empty);
      add.focus();
      return;
    }

    for (const mark of list) panel.append(markRowElement(mark, id));

    panel.append(document.createElement('hr'));
    const chapterStatus = document.createElement('p');
    chapterStatus.className = 'ytc-status';
    chapterStatus.setAttribute('role', 'status');
    const copy = settingRow('Copy as chapters', `${list.length} line${list.length === 1 ? '' : 's'}`, async () => {
      const issue = chapterIssue(id);
      if (issue) {
        chapterStatus.textContent = issue;
        return;
      }
      const text = chapterLines(id);
      try {
        await navigator.clipboard.writeText(text);
        chapterStatus.textContent = 'Copied as chapter lines.';
      } catch {
        // Clipboard blocked: the same text goes into a box the user can select
        document.getElementById('ytc-chapters')?.remove();
        const box = document.createElement('textarea');
        box.id = 'ytc-chapters';
        box.spellcheck = false;
        box.value = text;
        panel.insertBefore(box, copy);
        box.select();
        chapterStatus.textContent = 'Clipboard blocked, the lines are selected below.';
      }
    });
    panel.append(copy, chapterStatus);

    const first = panel.querySelector('button:not(.ytc-close):not(.ytc-back)');
    first?.focus();
  }

  function textInput(id, value, label) {
    const input = document.createElement('input');
    input.type = 'text';
    input.id = id;
    input.value = value;
    input.setAttribute('aria-label', label);
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'off');
    return input;
  }

  function fieldLabel(text, targetId) {
    const label = document.createElement('label');
    label.className = 'ytc-section';
    label.htmlFor = targetId;
    label.textContent = text;
    return label;
  }

  function renderMarkEditor(panel) {
    panel.textContent = '';
    const id = videoIdFromUrl();
    const mark = marksFor(id).find((m) => m.at === editMarkAt);
    if (!mark) {
      panelState.view = 'list';
      render();
      return;
    }
    const hours = marksHourMode(id);
    const back = () => {
      armedMark = null;
      panelState.view = 'list';
      render();
    };
    panel.append(panelHeader('Edit bookmark', back));
    panel.setAttribute('aria-label', 'Edit bookmark');

    const timeInput = textInput('ytc-edit-time', clock(mark.t, hours), 'Time, mm:ss or seconds');
    timeInput.setAttribute('aria-describedby', 'ytc-edit-hint ytc-edit-error');
    const nameInput = textInput('ytc-edit-name', mark.n, 'Name');
    nameInput.maxLength = 60;

    const error = document.createElement('p');
    error.className = 'ytc-error';
    error.id = 'ytc-edit-error';
    error.setAttribute('role', 'alert');
    error.hidden = true;

    const hint = document.createElement('p');
    hint.className = 'ytc-label';
    hint.id = 'ytc-edit-hint';
    hint.textContent = 'Enter to save, Escape to cancel';

    const fail = (text) => {
      error.textContent = text;
      error.hidden = false;
    };

    const apply = () => {
      const t = parseClock(timeInput.value);
      if (t === null) {
        fail('Use mm:ss, h:mm:ss, or seconds.');
        return;
      }
      const clash = marksFor(id).find((m) => m.t === t && m.at !== mark.at);
      if (clash) {
        fail(`${clock(t, hours)} is already saved as "${clash.n}". Pick another time.`);
        return;
      }
      const label = nameInput.value.trim().slice(0, 60) || clock(t, hours);
      writeMarks(
        id,
        marksFor(id).map((m) => (m.at === mark.at ? { ...m, t, n: label } : m))
      );
      editMarkAt = null;
      armedMark = null;
      panelState.view = 'list';
      render();
      notifyChange();
      drawMenu();
    };

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', back);

    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = 'Save changes';
    save.addEventListener('click', apply);

    for (const input of [timeInput, nameInput]) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          apply();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          back();
        }
      });
    }

    panel.append(
      fieldLabel('Time', 'ytc-edit-time'),
      timeInput,
      fieldLabel('Name', 'ytc-edit-name'),
      nameInput,
      error,
      hint,
      document.createElement('hr'),
      save,
      cancel
    );
    timeInput.focus();
    timeInput.select();
  }

  const marksExport = () =>
    JSON.stringify({ script: 'youtube-custom-collection', feature: 'bookmarks', format: 1, marks: markMap() }, null, 2);

  const markCount = () =>
    Object.values(markMap()).reduce((total, list) => total + (Array.isArray(list) ? list.length : 0), 0);

  function parseMarksExport(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { error: 'That is not valid JSON.' };
    }
    if (!data || typeof data !== 'object' || data.feature !== 'bookmarks') {
      return { error: 'That JSON is not a bookmark export.' };
    }
    const marks = data.marks;
    if (!marks || typeof marks !== 'object' || Array.isArray(marks)) {
      return { error: 'That JSON has no marks object.' };
    }
    const incoming = {};
    let skipped = 0;
    for (const [id, list] of Object.entries(marks)) {
      if (!VIDEO_ID.test(id) || !Array.isArray(list)) {
        skipped++;
        continue;
      }
      for (const mark of list) {
        if (!isMark(mark)) {
          skipped++;
          continue;
        }
        const bucket = incoming[id] || (incoming[id] = []);
        if (bucket.some((m) => m.t === mark.t)) {
          skipped++;
          continue;
        }
        bucket.push({ t: mark.t, n: mark.n, at: mark.at });
      }
    }
    return { incoming, skipped };
  }

  function mergePreview(parsed) {
    let fresh = 0;
    let same = 0;
    let full = 0;
    for (const [id, list] of Object.entries(parsed.incoming)) {
      const existing = marksFor(id);
      let room = MARK_LIMIT - existing.length;
      for (const mark of list) {
        if (existing.some((m) => m.t === mark.t)) {
          same++;
        } else if (room > 0) {
          room--;
          fresh++;
        } else {
          full++;
        }
      }
    }
    return { fresh, same, full };
  }

  function mergeMarks(parsed) {
    for (const [id, list] of Object.entries(parsed.incoming)) {
      const current = marksFor(id).slice().sort((a, b) => a.t - b.t);
      for (const mark of list) {
        if (current.some((m) => m.t === mark.t)) continue;
        if (current.length >= MARK_LIMIT) continue;
        current.push(mark);
      }
      writeMarks(id, current);
    }
  }

  function statusLine(panel) {
    const status = document.createElement('p');
    status.className = 'ytc-status';
    status.setAttribute('role', 'status');
    panel.append(status);
    return status;
  }

  function renderFeatureBackup(panel) {
    panel.textContent = '';
    panel.append(
      panelHeader('Bookmarks backup', () => {
        // Opened from the Video Bookmarks sub-section, so Back returns there, same as Escape
        panelState.view = panelState.sub ? 'sub' : 'settings';
        render();
      }, 'Playback Custom \u203a Video Bookmarks')
    );
    panel.setAttribute('aria-label', 'Bookmarks backup');

    const desc = document.createElement('p');
    desc.className = 'ytc-desc';
    desc.textContent = 'Exports only the bookmarks, not the settings. Importing merges the file with what is already stored.';
    const exportTitle = document.createElement('p');
    exportTitle.className = 'ytc-section';
    exportTitle.textContent = 'Export';
    panel.append(desc, document.createElement('hr'), exportTitle);

    const countLabel = () => {
      const videos = Object.keys(markMap()).length;
      const marks = markCount();
      return marks ? `${marks} mark${marks === 1 ? '' : 's'} in ${videos} video${videos === 1 ? '' : 's'}` : 'No bookmarks';
    };

    const exportStatus = statusLine(panel);
    let revert = 0;
    const copy = settingRow('Copy bookmarks JSON', countLabel(), async () => {
      const value = copy.querySelector('.ytc-value');
      clearTimeout(revert);
      try {
        await navigator.clipboard.writeText(marksExport());
        if (value) value.textContent = 'Copied';
        exportStatus.textContent = '';
        revert = setTimeout(() => {
          if (value && value.isConnected) value.textContent = countLabel();
        }, 1500);
      } catch {
        // Clipboard blocked: the JSON goes where the user can select it
        box.value = marksExport();
        box.select();
        if (value) value.textContent = 'Selected';
        exportStatus.textContent = 'Clipboard blocked, the JSON is selected in the box below.';
      }
    });
    panel.append(copy, document.createElement('hr'));

    const importTitle = document.createElement('p');
    importTitle.className = 'ytc-section';
    importTitle.textContent = 'Import';
    const boxLabel = document.createElement('label');
    boxLabel.className = 'ytc-label';
    boxLabel.setAttribute('for', 'ytc-marks-backup');
    boxLabel.textContent = 'Bookmarks JSON';
    const box = document.createElement('textarea');
    box.id = 'ytc-marks-backup';
    box.spellcheck = false;
    box.placeholder = 'Paste a bookmark export here';
    const load = document.createElement('button');
    load.id = 'ytc-marks-import';
    load.type = 'button';
    load.textContent = 'Import bookmarks';
    load.disabled = true;
    const importStatus = statusLine(panel);
    panel.append(importTitle, boxLabel, box, load, importStatus);

    let armed = false;

    function preview() {
      armed = false;
      const text = box.value.trim();
      load.disabled = !text;
      if (!text) {
        load.textContent = 'Import bookmarks';
        importStatus.textContent = '';
        return;
      }
      const parsed = parseMarksExport(text);
      if (parsed.error) {
        load.textContent = 'Nothing to import';
        importStatus.textContent = parsed.error;
        return;
      }
      const previewCounts = mergePreview(parsed);
      load.textContent = `Import ${previewCounts.fresh} bookmark${previewCounts.fresh === 1 ? '' : 's'}`;
      const parts = [`${previewCounts.fresh} new`, `${previewCounts.same} already saved`];
      if (previewCounts.full) parts.push(`${previewCounts.full} over the limit`);
      if (parsed.skipped) parts.push(`${parsed.skipped} skipped`);
      importStatus.textContent = `${parts.join(', ')}.`;
    }

    box.addEventListener('input', preview);

    load.addEventListener('click', () => {
      const text = box.value;
      if (!text.trim()) return;
      const parsed = parseMarksExport(text);
      if (parsed.error) {
        importStatus.textContent = parsed.error;
        return;
      }
      const previewCounts = mergePreview(parsed);
      if (!armed) {
        armed = true;
        load.textContent = `Press again to import ${previewCounts.fresh} bookmark${previewCounts.fresh === 1 ? '' : 's'}`;
        return;
      }
      armed = false;
      mergeMarks(parsed);
      const value = copy.querySelector('.ytc-value');
      if (value) value.textContent = countLabel();
      load.textContent = 'Import bookmarks';
      importStatus.textContent = `Imported ${previewCounts.fresh}, skipped ${previewCounts.same + parsed.skipped}.`;
      notifyChange();
      drawMenu();
    });

    copy.focus();
  }

  const DIALOG_CSS = `
#ytc-dialog{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.68)}
#ytc-dialog .ytc-dialog,#ytc-dialog .ytc-dialog *{box-sizing:border-box}
#ytc-dialog .ytc-dialog{width:clamp(280px,84vw,360px);border-radius:14px;background:var(--yt-spec-base-background,#fff);color:var(--yt-spec-text-primary,#0f0f0f);box-shadow:0 16px 40px rgba(0,0,0,.45);font-family:Roboto,Arial,sans-serif;font-size:14px;line-height:1.4}
#ytc-dialog h2{margin:0;padding:16px 20px 6px;font-size:16px;font-weight:600}
#ytc-dialog .ytc-dialog-body{margin:0;padding:0 20px 10px;font-size:13px;color:var(--yt-spec-text-secondary,#606060)}
#ytc-dialog label{display:block;padding:0 20px 6px;font-size:12px;color:var(--yt-spec-text-secondary,#606060)}
#ytc-dialog input{display:block;width:calc(100% - 40px);min-height:44px;margin:0 20px 10px;padding:0 12px;border:1px solid var(--yt-spec-10-percent-layer,rgba(128,128,128,.45));border-radius:8px;background:var(--yt-spec-badge-chip-background,rgba(0,0,0,.05));color:inherit;font:inherit;font-size:14px}
#ytc-dialog input:focus-visible{outline:2px solid var(--yt-spec-call-to-action,#065fd4);outline-offset:-2px}
#ytc-dialog .ytc-hint{margin:0;padding:0 20px 10px;font-size:12px;line-height:1.4;color:var(--yt-spec-text-secondary,#606060)}
#ytc-dialog .ytc-error{margin:0;padding:0 20px 10px;font-size:12px;line-height:1.4;color:#c00}
#ytc-dialog .ytc-actions{display:flex;gap:8px;padding:4px 20px 8px}
#ytc-dialog .ytc-actions button{flex:1;display:flex;align-items:center;justify-content:center;min-height:44px;padding:0 12px;border:0;border-radius:22px;font:inherit;font-size:14px;cursor:pointer}
#ytc-dialog .ytc-primary{background:var(--yt-spec-call-to-action,#065fd4);color:#fff;font-weight:500}
#ytc-dialog .ytc-actions button:focus-visible{outline:2px solid var(--yt-spec-call-to-action,#065fd4);outline-offset:2px}
#ytc-dialog .ytc-secondary{background:var(--yt-spec-badge-chip-background,rgba(0,0,0,.05));color:var(--yt-spec-text-primary,#0f0f0f)}
`;

  let dialogWePaused = false;
  let dialogVideo = null;
  let dialogReturnFocus = null;

  function closeMarkDialog() {
    document.getElementById('ytc-dialog')?.remove();
    document.getElementById('ytc-dialog-style')?.remove();
    // Resume only the same element this dialog paused, and only if nothing restarted it
    if (dialogWePaused && dialogVideo && dialogVideo === currentVideo() && dialogVideo.paused) {
      dialogVideo.play();
    }
    dialogWePaused = false;
    dialogVideo = null;
    if (dialogReturnFocus && dialogReturnFocus.isConnected) dialogReturnFocus.focus();
    dialogReturnFocus = null;
    syncPlayButtons();
    drawMenu();
  }

  function openMarkDialog() {
    const id = videoIdFromUrl();
    if (!id || document.getElementById('ytc-dialog')) return;
    const video = currentVideo();
    const at = Math.floor(video ? video.currentTime : 0);
    const hours = marksHourMode(id);
    dialogVideo = video;
    dialogWePaused = !!video && !video.paused;
    if (dialogWePaused) video.pause();
    dialogReturnFocus = document.activeElement;

    const style = document.createElement('style');
    style.id = 'ytc-dialog-style';
    style.textContent = DIALOG_CSS;
    document.head.append(style);

    const backdrop = document.createElement('div');
    backdrop.id = 'ytc-dialog';
    const box = document.createElement('div');
    box.className = 'ytc-dialog';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'ytc-dialog-title');
    box.setAttribute('aria-describedby', 'ytc-dialog-body');

    const title = document.createElement('h2');
    title.id = 'ytc-dialog-title';
    title.textContent = 'Add bookmark?';
    const body = document.createElement('p');
    body.className = 'ytc-dialog-body';
    body.id = 'ytc-dialog-body';
    body.textContent = 'The video is paused. Adjust the time or the name before saving.';

    const timeLabel = document.createElement('label');
    timeLabel.htmlFor = 'ytc-dialog-time';
    timeLabel.textContent = 'Time';
    const timeInput = textInput('ytc-dialog-time', clock(at, hours), 'Time, mm:ss or seconds');
    timeInput.setAttribute('aria-describedby', 'ytc-dialog-hint ytc-dialog-error');

    const hint = document.createElement('p');
    hint.className = 'ytc-hint';
    hint.id = 'ytc-dialog-hint';
    hint.setAttribute('aria-live', 'polite');
    hint.hidden = true;

    const nameLabel = document.createElement('label');
    nameLabel.htmlFor = 'ytc-dialog-name';
    nameLabel.textContent = 'Name';
    const nameInput = textInput('ytc-dialog-name', clock(at, hours), 'Name');
    nameInput.maxLength = 60;

    const error = document.createElement('p');
    error.className = 'ytc-error';
    error.id = 'ytc-dialog-error';
    error.setAttribute('role', 'alert');
    error.hidden = true;

    const actions = document.createElement('div');
    actions.className = 'ytc-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'ytc-secondary';
    cancel.textContent = 'Cancel';
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'ytc-primary';
    save.textContent = 'Add bookmark';
    actions.append(cancel, save);

    const fail = (text) => {
      error.textContent = text;
      error.hidden = false;
    };

    let synced = clock(at, hours);
    timeInput.addEventListener('input', () => {
      const parsed = parseClock(timeInput.value);
      if (parsed === null) return;
      if (nameInput.value === synced || nameInput.value === '') {
        synced = clock(parsed, marksHourMode(id));
        nameInput.value = synced;
      }
      const away = Math.abs(parsed - at);
      hint.hidden = away <= 30;
      if (!hint.hidden) hint.textContent = `This is ${clock(away)} away from the player.`;
    });

    const submit = () => {
      const seconds = parseClock(timeInput.value);
      if (seconds === null) {
        fail('Use mm:ss, h:mm:ss, or seconds.');
        return;
      }
      const list = marksFor(id);
      const clash = list.find((mark) => mark.t === seconds);
      if (clash) {
        fail(`${clock(seconds, hours)} is already saved as "${clash.n}". Pick another time.`);
        return;
      }
      if (list.length >= MARK_LIMIT) {
        fail(`This video already holds ${MARK_LIMIT} bookmarks.`);
        return;
      }
      const label = nameInput.value.trim().slice(0, 60) || clock(seconds, marksHourMode(id));
      writeMarks(id, [...list, { t: seconds, n: label, at: Date.now() }]);
      closeMarkDialog();
      notifyChange();
      refreshMarkList();
    };

    cancel.addEventListener('click', closeMarkDialog);
    save.addEventListener('click', submit);
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeMarkDialog();
        return;
      }
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
        e.preventDefault();
        submit();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [...box.querySelectorAll('button:not(:disabled), input')];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });

    box.append(title, body, timeLabel, timeInput, hint, nameLabel, nameInput, error, actions);
    backdrop.append(box);
    (document.fullscreenElement || document.body).append(backdrop);
    timeInput.focus();
    timeInput.select();
  }

  const PLAY_CSS = `
#ytc-play-add,#ytc-play-list{position:relative;display:flex;align-items:center;justify-content:center;width:40px;height:40px;padding:0;border:0;border-radius:2px;background:none;color:#fff;cursor:pointer;opacity:.92;font-family:Roboto,Arial,sans-serif}
#ytc-play-add::after,#ytc-play-list::after{content:'';position:absolute;inset:-2px}
#ytc-play-add:hover,#ytc-play-list:hover{background:rgba(255,255,255,.15);opacity:1}
#ytc-play-add:focus-visible,#ytc-play-list:focus-visible{outline:2px solid #fff;outline-offset:-2px;box-shadow:0 0 0 2px rgba(0,0,0,.65)}
#ytc-play-add svg,#ytc-play-list svg{display:block;width:24px;height:24px;fill:currentColor}
#ytc-play-add .ytc-play-plus{position:absolute;top:2px;right:3px;font-size:13px;font-weight:700;line-height:1}
#ytc-play-list .ytc-play-badge{box-sizing:border-box;position:absolute;top:3px;right:2px;min-width:16px;height:16px;padding:0 3px;border-radius:8px;background:#fff;color:#0f0f0f;font-size:11px;line-height:16px;text-align:center;font-weight:600}
#ytc-play-list .ytc-play-badge[hidden]{display:none}
`;

  function playIcon(filled) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const shape = document.createElementNS(SVG_NS, 'path');
    shape.setAttribute('d', 'M17 3H7a2 2 0 0 0-2 2v16l7-4 7 4V5a2 2 0 0 0-2-2z');
    if (filled) shape.setAttribute('fill', 'currentColor');
    else {
      shape.setAttribute('fill', 'none');
      shape.setAttribute('stroke', 'currentColor');
      shape.setAttribute('stroke-width', '2');
    }
    svg.append(shape);
    return svg;
  }

  function syncPlayButtons() {
    const wanted = isTop && featureOn('bookmarks') && onWatchPage();
    if (!wanted) {
      document.getElementById('ytc-play-add')?.remove();
      document.getElementById('ytc-play-list')?.remove();
      document.getElementById('ytc-play-style')?.remove();
      return;
    }
    const controls = document.querySelector('#movie_player .ytp-right-controls');
    if (!controls) return;
    if (!document.getElementById('ytc-play-style')) {
      const style = document.createElement('style');
      style.id = 'ytc-play-style';
      style.textContent = PLAY_CSS;
      document.head.append(style);
    }

    let add = document.getElementById('ytc-play-add');
    if (!add) {
      add = document.createElement('button');
      add.type = 'button';
      add.id = 'ytc-play-add';
      add.append(playIcon(false));
      const plus = document.createElement('span');
      plus.className = 'ytc-play-plus';
      plus.setAttribute('aria-hidden', 'true');
      plus.textContent = '+';
      add.append(plus);
      add.addEventListener('click', () => openMarkDialog());
    }
    let list = document.getElementById('ytc-play-list');
    if (!list) {
      list = document.createElement('button');
      list.type = 'button';
      list.id = 'ytc-play-list';
      list.append(playIcon(true));
      const badge = document.createElement('span');
      badge.className = 'ytc-play-badge';
      list.append(badge);
      list.addEventListener('click', () => openPanel('playback', 'list'));
    }
    if (add.parentElement !== controls || list.parentElement !== controls) controls.prepend(add, list);

    const id = videoIdFromUrl();
    const count = marksFor(id).length;
    const badge = list.querySelector('.ytc-play-badge');
    if (badge) {
      badge.textContent = String(count);
      badge.hidden = count === 0;
    }
    list.setAttribute('aria-label', count ? `Bookmarks, ${count} saved` : 'Bookmarks, no saves yet');
    list.title = count ? `Bookmarks (${count})` : 'Bookmarks';
    const video = currentVideo();
    const at = clock(video ? video.currentTime : 0, marksHourMode(id));
    add.setAttribute('aria-label', `Add bookmark at ${at}`);
    add.title = `Add bookmark at ${at}`;
  }

  const isTyping = (target) =>
    !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'b' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (isTyping(e.target)) return;
      if (!isTop || !featureOn('bookmarks') || !onWatchPage()) return;
      e.preventDefault();
      openMarkDialog();
    },
    true
  );

  document.addEventListener('yt-navigate-finish', () => {
    if (!isTop) return;
    // The old video is gone, so an open dialog no longer has a target
    if (document.getElementById('ytc-dialog')) closeMarkDialog();
    armedMark = null;
    editMarkAt = null;
    // The control bar is rebuilt once metadata arrives, so check again shortly after
    syncPlayButtons();
    drawMenu();
    setTimeout(syncPlayButtons, 1000);
  });

  document.addEventListener('ytc-change', () => {
    if (!isTop) return;
    syncPlayButtons();
    drawMenu();
  });

  // ---------- video filter ----------

  const VF_PLAYER_CSS = `
#ytc-vf-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;width:48px;height:100%;padding:0;border:0;background:none;color:#fff;cursor:pointer;opacity:.9;vertical-align:top}
#ytc-vf-btn:hover,#ytc-vf-btn[aria-expanded="true"]{opacity:1}
#ytc-vf-btn:focus-visible{outline:2px solid #fff;outline-offset:-4px}
#ytc-vf-btn svg{width:22px;height:22px;display:block}
#ytc-vf-btn .ytc-vf-dot{position:absolute;top:10px;right:10px;width:6px;height:6px;border-radius:50%;background:#3ea6ff;pointer-events:none}
#ytc-vf-btn .ytc-vf-dot[hidden]{display:none}
#ytc-vf-popover,#ytc-vf-popover *{box-sizing:border-box}
#ytc-vf-popover{position:absolute;right:12px;bottom:56px;z-index:2050;width:310px;max-height:min(70vh,460px);display:flex;flex-direction:column;border-radius:12px;background:rgba(28,28,28,.95);color:#f1f1f1;border:1px solid rgba(255,255,255,.14);box-shadow:0 12px 32px rgba(0,0,0,.6);font-family:Roboto,Arial,sans-serif;font-size:13px;line-height:1.4;backdrop-filter:blur(8px);overflow:hidden}
#ytc-vf-popover .ytc-vf-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.1)}
#ytc-vf-popover .ytc-vf-title{font-weight:600;font-size:13.5px}
#ytc-vf-popover .ytc-vf-pill{font-size:11px;padding:2px 7px;border-radius:999px;background:rgba(255,255,255,.1);color:#ccc}
#ytc-vf-popover .ytc-vf-pill.is-video{background:rgba(62,166,255,.22);color:#7cc2ff}
#ytc-vf-popover .ytc-vf-pill.is-dirty{background:rgba(255,193,7,.2);color:#ffd54f}
#ytc-vf-popover .ytc-vf-close{margin-left:auto;width:28px;height:28px;border:0;border-radius:50%;background:none;color:#ddd;font-size:16px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
#ytc-vf-popover .ytc-vf-close:hover{background:rgba(255,255,255,.12)}
#ytc-vf-popover .ytc-vf-body{flex:1 1 auto;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:10px}
#ytc-vf-popover .ytc-vf-mode-row{display:grid;grid-template-columns:52px 1fr;align-items:center;gap:8px}
#ytc-vf-popover .ytc-vf-mode-row label{font-size:12px;color:#d6d6d6}
#ytc-vf-popover .ytc-vf-select{width:100%;min-height:30px;padding:4px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.18);background:#181818;color:#f1f1f1;font:inherit;font-size:12px;cursor:pointer}
#ytc-vf-popover .ytc-vf-select:focus-visible{outline:2px solid #3ea6ff;outline-offset:1px}
#ytc-vf-popover .ytc-vf-sliders{display:flex;flex-direction:column;gap:8px}
#ytc-vf-popover .ytc-vf-row{display:grid;grid-template-columns:16px 70px 1fr 48px;align-items:center;gap:6px}
#ytc-vf-popover .ytc-vf-row.is-muted label{opacity:.48;text-decoration:line-through}
#ytc-vf-popover .ytc-vf-row.is-muted input[type="range"],#ytc-vf-popover .ytc-vf-row.is-muted .ytc-vf-val{opacity:.42}
#ytc-vf-popover .ytc-vf-row input[type="checkbox"]{width:14px;height:14px;margin:0;accent-color:#3ea6ff;cursor:pointer}
#ytc-vf-popover .ytc-vf-row label{font-size:12px;color:#d6d6d6;white-space:nowrap;cursor:pointer;user-select:none}
#ytc-vf-popover .ytc-vf-row input[type="range"]{width:100%;margin:0;accent-color:#3ea6ff;cursor:pointer}
#ytc-vf-popover .ytc-vf-val{font-size:11.5px;color:#aaa;text-align:right;font-variant-numeric:tabular-nums;border:0;background:none;padding:2px 0;cursor:pointer}
#ytc-vf-popover .ytc-vf-val:hover{color:#fff;text-decoration:underline}
#ytc-vf-popover .ytc-vf-foot{display:flex;flex-wrap:wrap;gap:6px;padding:10px 12px;border-top:1px solid rgba(255,255,255,.1);background:rgba(18,18,18,.6)}
#ytc-vf-popover .ytc-vf-act{flex:1 1 auto;min-height:30px;padding:4px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.08);color:#f1f1f1;font:inherit;font-size:11.5px;cursor:pointer;white-space:nowrap}
#ytc-vf-popover .ytc-vf-act:hover{background:rgba(255,255,255,.16)}
#ytc-vf-popover .ytc-vf-act.is-primary{background:#3ea6ff;color:#0f0f0f;border-color:transparent;font-weight:600}
#ytc-vf-popover .ytc-vf-act.is-primary:hover{background:#65b8ff}
`;

  const vfLive = { videoId: '', values: { ...VF_NEUTRAL }, dirty: false };

  function vfResolveSaved(id) {
    const videos = vfReadVideos();
    if (id && videos[id]) return { source: 'video', values: vfNormalize(videos[id]) };
    const glob = vfReadGlobal();
    return { source: vfIsNeutral(glob) ? 'default' : 'global', values: glob };
  }

  function vfLoadCurrent() {
    const id = videoIdFromUrl();
    vfLive.videoId = id;
    vfLive.values = vfResolveSaved(id).values;
    vfLive.dirty = false;
  }

  function vfEnsureSvg(gamma, sharpness) {
    let svg = document.getElementById('ytc-vf-svg');
    if (!svg) {
      svg = document.createElementNS(SVG_NS, 'svg');
      svg.id = 'ytc-vf-svg';
      svg.setAttribute('aria-hidden', 'true');
      svg.style.cssText = 'position:fixed;width:0;height:0;pointer-events:none;opacity:0';
      const defs = document.createElementNS(SVG_NS, 'defs');
      const filter = document.createElementNS(SVG_NS, 'filter');
      filter.id = 'ytc-vf-svg-filter';
      filter.setAttribute('color-interpolation-filters', 'sRGB');
      const ct = document.createElementNS(SVG_NS, 'feComponentTransfer');
      ct.id = 'ytc-vf-gamma';
      for (const tag of ['feFuncR', 'feFuncG', 'feFuncB']) {
        const fn = document.createElementNS(SVG_NS, tag);
        fn.setAttribute('type', 'gamma');
        fn.setAttribute('amplitude', '1');
        fn.setAttribute('exponent', '1');
        fn.setAttribute('offset', '0');
        ct.append(fn);
      }
      const conv = document.createElementNS(SVG_NS, 'feConvolveMatrix');
      conv.id = 'ytc-vf-sharp';
      conv.setAttribute('order', '3');
      conv.setAttribute('preserveAlpha', 'true');
      conv.setAttribute('kernelMatrix', '0 0 0 0 1 0 0 0 0');
      filter.append(ct, conv);
      defs.append(filter);
      svg.append(defs);
      (document.body || document.documentElement).append(svg);
    }
    const safeGamma = vfClamp(Number.isFinite(gamma) ? gamma : 1, 0.2, 3.0);
    const exp = (1 / safeGamma).toFixed(4);
    for (const fn of svg.querySelectorAll('#ytc-vf-gamma > *')) fn.setAttribute('exponent', exp);
    const sharp = vfClamp(Number.isFinite(sharpness) ? sharpness : 0, 0, 100);
    const conv = svg.querySelector('#ytc-vf-sharp');
    if (conv) {
      if (sharp <= 0) conv.setAttribute('kernelMatrix', '0 0 0 0 1 0 0 0 0');
      else {
        const k = (sharp / 100) * 1.5;
        const c = (1 + 4 * k).toFixed(4);
        const s = (-k).toFixed(4);
        conv.setAttribute('kernelMatrix', `0 ${s} 0 ${s} ${c} ${s} 0 ${s} 0`);
      }
    }
  }

  function vfBuildFilter(f) {
    if (vfIsNeutral(f)) return '';
    const parts = [];
    if (!vfIsOff(f, 'brightness') && f.brightness !== 100) parts.push(`brightness(${f.brightness}%)`);
    if (!vfIsOff(f, 'contrast') && f.contrast !== 100) parts.push(`contrast(${f.contrast}%)`);
    if (!vfIsOff(f, 'saturation') && f.saturation !== 100) parts.push(`saturate(${f.saturation}%)`);
    if (!vfIsOff(f, 'hue') && f.hue !== 0) parts.push(`hue-rotate(${f.hue}deg)`);
    if (!vfIsOff(f, 'sepia') && f.sepia !== 0) parts.push(`sepia(${f.sepia}%)`);
    if (!vfIsOff(f, 'grayscale') && f.grayscale !== 0) parts.push(`grayscale(${f.grayscale}%)`);
    if (!vfIsOff(f, 'invert') && f.invert !== 0) parts.push(`invert(${f.invert}%)`);
    const effGamma = vfIsOff(f, 'gamma') ? 1 : f.gamma;
    const effSharp = vfIsOff(f, 'sharpness') ? 0 : f.sharpness;
    if (effGamma !== 1 || effSharp > 0) {
      vfEnsureSvg(effGamma, effSharp);
      parts.push('url(#ytc-vf-svg-filter)');
    }
    return parts.join(' ');
  }

  function vfStatus() {
    const id = videoIdFromUrl();
    const hasOverride = !!(id && vfReadVideos()[id]);
    if (vfLive.dirty) return { text: 'Unsaved', cls: 'is-dirty', hasOverride };
    if (hasOverride) return { text: 'Saved for video', cls: 'is-video', hasOverride: true };
    if (!vfIsNeutral(vfLive.values)) return { text: 'Global', cls: '', hasOverride: false };
    return { text: 'Default', cls: '', hasOverride: false };
  }

  function vfUpdateBtn() {
    const btn = document.getElementById('ytc-vf-btn');
    if (!btn) return;
    const active = !vfIsNeutral(vfLive.values);
    const dot = btn.querySelector('.ytc-vf-dot');
    if (dot) dot.hidden = !active;
    const st = vfStatus();
    btn.title = active ? `Video Filter (${st.text})` : 'Video Filter';
    btn.setAttribute('aria-label', btn.title);
    btn.setAttribute('aria-expanded', document.getElementById('ytc-vf-popover') ? 'true' : 'false');
  }

  function vfApply() {
    const video = currentVideo();
    if (!video) return;
    const player = playerEl();
    if (!isTop || !moduleOn('videoFilter') || !onWatchPage() || (player && player.classList.contains('ad-showing'))) {
      video.style.filter = '';
      vfUpdateBtn();
      return;
    }
    const id = videoIdFromUrl();
    if (id !== vfLive.videoId) vfLoadCurrent();
    video.style.filter = vfBuildFilter(vfLive.values);
    vfUpdateBtn();
  }

  function vfClosePopover() {
    document.removeEventListener('pointerdown', vfOutsidePointer, true);
    document.removeEventListener('keydown', vfPopoverKey, true);
    document.getElementById('ytc-vf-popover')?.remove();
    vfUpdateBtn();
  }

  function vfOutsidePointer(e) {
    const pop = document.getElementById('ytc-vf-popover');
    const btn = document.getElementById('ytc-vf-btn');
    if (!pop) return;
    if (pop.contains(e.target) || (btn && btn.contains(e.target))) return;
    vfClosePopover();
  }

  function vfPopoverKey(e) {
    const pop = document.getElementById('ytc-vf-popover');
    if (!pop) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      vfClosePopover();
      document.getElementById('ytc-vf-btn')?.focus();
    }
  }

  function vfRenderPopover() {
    const player = playerEl();
    if (!player) return;
    let pop = document.getElementById('ytc-vf-popover');
    if (!pop) {
      pop = document.createElement('div');
      pop.id = 'ytc-vf-popover';
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

    const st = vfStatus();
    const head = document.createElement('div');
    head.className = 'ytc-vf-head';
    const title = document.createElement('span');
    title.className = 'ytc-vf-title';
    title.textContent = 'Video Filter';
    const pill = document.createElement('span');
    pill.className = `ytc-vf-pill ${st.cls}`.trim();
    pill.textContent = st.text;
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'ytc-vf-close';
    closeBtn.setAttribute('aria-label', 'Close Video Filter');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', vfClosePopover);
    head.append(title, pill, closeBtn);

    const body = document.createElement('div');
    body.className = 'ytc-vf-body';

    const modeRow = document.createElement('div');
    modeRow.className = 'ytc-vf-mode-row';
    const modeLab = document.createElement('label');
    modeLab.htmlFor = 'ytc-vf-mode';
    modeLab.textContent = 'Mode';
    const modeSelect = document.createElement('select');
    modeSelect.id = 'ytc-vf-mode';
    modeSelect.className = 'ytc-vf-select';
    modeSelect.setAttribute('aria-label', 'Filter mode');
    for (const [val, label] of [['global', 'Global'], ...VF_PRESETS.map((pr) => [pr.id, pr.label]), ['custom', 'Custom']]) {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = label;
      modeSelect.append(opt);
    }
    modeSelect.value = vfDetectMode(vfLive.values, true);
    modeSelect.addEventListener('change', () => {
      const choice = modeSelect.value;
      if (choice === 'custom') return;
      if (choice === 'global') {
        vfLive.values = vfReadGlobal();
      } else {
        const preset = VF_PRESETS.find((pr) => pr.id === choice);
        if (!preset) return;
        vfLive.values = vfNormalize({ ...VF_NEUTRAL, ...preset.values });
      }
      vfLive.dirty = !vfEqual(vfLive.values, vfResolveSaved(videoIdFromUrl()).values);
      vfApply();
      vfRenderPopover();
    });
    modeRow.append(modeLab, modeSelect);
    body.append(modeRow);

    const sliders = document.createElement('div');
    sliders.className = 'ytc-vf-sliders';
    for (const p of VF_PARAMS) {
      const off = vfIsOff(vfLive.values, p.key);
      const row = document.createElement('div');
      row.className = off ? 'ytc-vf-row is-muted' : 'ytc-vf-row';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.id = `ytc-vf-en-${p.key}`;
      chk.checked = !off;
      chk.setAttribute('aria-label', `Toggle ${p.label}`);
      chk.title = `Toggle ${p.label}`;
      const lab = document.createElement('label');
      lab.htmlFor = `ytc-vf-en-${p.key}`;
      lab.title = `Click to toggle ${p.label}`;
      lab.textContent = p.label;
      const input = document.createElement('input');
      input.type = 'range';
      input.id = `ytc-vf-sl-${p.key}`;
      input.min = String(p.min);
      input.max = String(p.max);
      input.step = String(p.step);
      input.value = String(vfLive.values[p.key]);
      input.setAttribute('aria-label', p.label);
      const valBtn = document.createElement('button');
      valBtn.type = 'button';
      valBtn.className = 'ytc-vf-val';
      valBtn.title = `Reset ${p.label}`;
      valBtn.textContent = vfFormat(p, vfLive.values[p.key]);

      const syncRow = () => {
        const muted = vfIsOff(vfLive.values, p.key);
        row.className = muted ? 'ytc-vf-row is-muted' : 'ytc-vf-row';
        chk.checked = !muted;
        input.value = String(vfLive.values[p.key]);
        valBtn.textContent = vfFormat(p, vfLive.values[p.key]);
        modeSelect.value = vfDetectMode(vfLive.values, true);
        vfLive.dirty = !vfEqual(vfLive.values, vfResolveSaved(videoIdFromUrl()).values);
        const nextSt = vfStatus();
        pill.textContent = nextSt.text;
        pill.className = `ytc-vf-pill ${nextSt.cls}`.trim();
        vfApply();
      };
      chk.addEventListener('change', () => {
        const nextDisabled = new Set(vfLive.values.disabled || []);
        if (chk.checked) nextDisabled.delete(p.key);
        else nextDisabled.add(p.key);
        vfLive.values = vfNormalize({ ...vfLive.values, disabled: [...nextDisabled] });
        syncRow();
      });
      const onUpdate = (nextNum) => {
        const nextDisabled = (vfLive.values.disabled || []).filter((k) => k !== p.key);
        vfLive.values = vfNormalize({ ...vfLive.values, [p.key]: nextNum, disabled: nextDisabled });
        syncRow();
      };
      input.addEventListener('input', () => onUpdate(Number(input.value)));
      valBtn.addEventListener('click', () => onUpdate(p.def));
      row.append(chk, lab, input, valBtn);
      sliders.append(row);
    }
    body.append(sliders);

    const foot = document.createElement('div');
    foot.className = 'ytc-vf-foot';

    const saveVid = document.createElement('button');
    saveVid.type = 'button';
    saveVid.className = 'ytc-vf-act is-primary';
    saveVid.textContent = 'Save for this video';
    saveVid.addEventListener('click', () => {
      const id = videoIdFromUrl();
      if (!id) return;
      vfSaveVideo(id, vfLive.values);
      vfLive.dirty = false;
      vfApply();
      vfRenderPopover();
    });

    const saveGlob = document.createElement('button');
    saveGlob.type = 'button';
    saveGlob.className = 'ytc-vf-act';
    saveGlob.textContent = 'Save as global';
    saveGlob.addEventListener('click', () => {
      vfWriteGlobal(vfLive.values);
      const id = videoIdFromUrl();
      if (id && vfReadVideos()[id]) vfSaveVideo(id, vfLive.values);
      vfLive.dirty = false;
      vfApply();
      vfRenderPopover();
    });

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'ytc-vf-act';
    resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('click', () => {
      vfLive.values = { ...VF_NEUTRAL };
      vfLive.dirty = !vfEqual(vfLive.values, vfResolveSaved(videoIdFromUrl()).values);
      vfApply();
      vfRenderPopover();
    });

    foot.append(saveVid, saveGlob, resetBtn);

    if (st.hasOverride) {
      const useGlob = document.createElement('button');
      useGlob.type = 'button';
      useGlob.className = 'ytc-vf-act';
      useGlob.textContent = 'Use global';
      useGlob.addEventListener('click', () => {
        const id = videoIdFromUrl();
        if (id) vfDeleteVideo(id);
        vfLoadCurrent();
        vfApply();
        vfRenderPopover();
      });
      foot.append(useGlob);
    }

    pop.append(head, body, foot);
    vfUpdateBtn();
  }

  function vfIcon() {
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

  let vfAdObserver = null;
  let vfObservedPlayer = null;
  function vfAttachAdObserver() {
    const player = playerEl();
    if (!player || player === vfObservedPlayer) return;
    if (vfAdObserver) vfAdObserver.disconnect();
    vfObservedPlayer = player;
    vfAdObserver = new MutationObserver(() => vfApply());
    vfAdObserver.observe(player, { attributes: true, attributeFilter: ['class'] });
  }

  function vfSyncButton() {
    const wanted = isTop && moduleOn('videoFilter') && onWatchPage();
    if (!wanted) {
      vfClosePopover();
      document.getElementById('ytc-vf-btn')?.remove();
      document.getElementById('ytc-vf-style')?.remove();
      return;
    }
    const controls = document.querySelector('#movie_player .ytp-right-controls');
    if (!controls) return;
    if (!document.getElementById('ytc-vf-style')) {
      const style = document.createElement('style');
      style.id = 'ytc-vf-style';
      style.textContent = VF_PLAYER_CSS;
      document.head.append(style);
    }
    let btn = document.getElementById('ytc-vf-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'ytc-vf-btn';
      btn.className = 'ytp-button';
      btn.setAttribute('aria-controls', 'ytc-vf-popover');
      btn.append(vfIcon());
      const dot = document.createElement('span');
      dot.className = 'ytc-vf-dot';
      dot.hidden = true;
      btn.append(dot);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (document.getElementById('ytc-vf-popover')) {
          vfClosePopover();
          return;
        }
        if (videoIdFromUrl() !== vfLive.videoId) vfLoadCurrent();
        vfRenderPopover();
        document.addEventListener('pointerdown', vfOutsidePointer, true);
        document.addEventListener('keydown', vfPopoverKey, true);
      });
    }
    const settingsBtn = controls.querySelector('.ytp-settings-button');
    if (settingsBtn && settingsBtn.parentElement === controls) {
      if (btn.nextElementSibling !== settingsBtn) controls.insertBefore(btn, settingsBtn);
    } else if (btn.parentElement !== controls) {
      controls.prepend(btn);
    }
    vfUpdateBtn();
  }

  vfRefreshAll = () => {
    vfAttachAdObserver();
    if (!vfLive.dirty) vfLoadCurrent();
    vfSyncButton();
    vfApply();
    if (document.getElementById('ytc-vf-popover')) vfRenderPopover();
  };

  document.addEventListener('yt-navigate-finish', () => {
    if (!isTop) return;
    vfClosePopover();
    vfLoadCurrent();
    vfRefreshAll();
    setTimeout(vfRefreshAll, 1000);
  });

  document.addEventListener('ytc-change', () => {
    if (!isTop) return;
    vfLive.dirty = false;
    vfLoadCurrent();
    vfRefreshAll();
  });

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
    if (feature.id === 'general') {
      return get('gridOn', true) === true ? `${read(rowOf('gridColumns'))}/row` : 'On';
    }
    if (feature.id === 'playback') {
      const q = QUALITY.find(([value]) => value === get('quality', 'auto'));
      const speed = get('speed', 'leave');
      const qLabel = q ? q[1] : 'Auto';
      return speed === 'leave' ? qLabel : `${qLabel}, ${speed}x`;
    }
    if (feature.id === 'playlistTools') {
      return '4 sections';
    }
    if (feature.id === 'quiet') {
      return `${quietOn()} on`;
    }
    if (feature.id === 'videoFilter') {
      const n = Object.keys(vfReadVideos()).length;
      if (n) return `${n} saved`;
      return vfIsNeutral(vfReadGlobal()) ? 'Neutral' : 'Global';
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
    if (resetArmed) reset.className = 'ytc-reset-armed';
    reset.textContent = resetArmed ? 'Click again to reset all settings' : 'Reset all settings';
    reset.addEventListener('click', () => {
      if (!resetArmed) {
        resetArmed = true;
        reset.className = 'ytc-reset-armed';
        reset.textContent = 'Click again to reset all settings';
        return;
      }
      resetArmed = false;
      reset.className = '';
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
    return quiet.rows.filter((row) =>
      row.type === 'choice' ? get(row.key, row.def) !== 'leave' : get(row.key, row.def === true) === true
    ).length;
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
    const count = videoIdFromUrl() ? marksFor(videoIdFromUrl()).length : 0;
    const marks = GM_registerMenuCommand(`Show bookmarks${count ? ` (${count})` : ''}`, () => openPanel('playback', 'list'));
    if (marks !== undefined && marks !== null) menuIds.push(marks);
    if (featureOn('share')) {
      const share = GM_registerMenuCommand('Copy link at current time', () => shareCopyAtTime());
      if (share !== undefined && share !== null) menuIds.push(share);
    }
    if (featureOn('playlistTools')) {
      const plTools = GM_registerMenuCommand('Playlist Tools...', () => openPlaylistToolsDialog());
      if (plTools !== undefined && plTools !== null) menuIds.push(plTools);
    }
    if (featureOn('likedTools')) {
      const ltTools = GM_registerMenuCommand('Liked Videos Tools...', () => openLikedToolsDialog());
      if (ltTools !== undefined && ltTools !== null) menuIds.push(ltTools);
    }
  }

  // The share entry follows its feature switch
  document.addEventListener('ytc-change', drawMenu);

  drawMenu();
  syncPlayButtons();
  vfRefreshAll();
  // The player sometimes builds its control bar after the first paint
  setTimeout(() => { syncPlayButtons(); vfRefreshAll(); }, 1500);
})();

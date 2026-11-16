// ==UserScript==
// @name         YouTube: Bookmark Timestamp
// @namespace    https://github.com/Afadfath03/Userscript
// @version      1.0
// @description  Saves time markers on the video you are watching, with a label each, and jumps back to them from the userscript menu
// @author       Afadfath03
// @homepageURL  https://github.com/Afadfath03/Userscript
// @supportURL   https://github.com/Afadfath03/Userscript/issues
// @downloadURL  https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-bookmark-timestamp.user.js
// @updateURL    https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-bookmark-timestamp.user.js
// @icon         https://raw.githubusercontent.com/Afadfath03/Userscript/main/assets/icons/youtube-bookmark-timestamp.png
// @license      MIT
// @match        https://www.youtube.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// ==/UserScript==

(() => {
  // The player only exists once in a page, so frames and embeds stay untouched
  if (window.self !== window.top) return;

  const KEY = 'ytbm.marks';
  const LIMIT = 50;
  // The menu holds one Jump and one Delete per mark, so it stops before it gets unusable
  const MENU_MARKS = 10;
  const VIDEO_ID = /^[A-Za-z0-9_-]{6,}$/;

  const video = () => document.querySelector('#movie_player video');
  const videoId = () => (location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') || '' : '');

  function clock(seconds, withHours) {
    const total = Math.max(0, Math.floor(seconds));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h || withHours ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

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
    const raw = GM_getValue(KEY, {});
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  };

  const marksFor = (id) => {
    const list = markMap()[id];
    return Array.isArray(list) ? list.filter(isMark) : [];
  };

  function writeMarks(id, list) {
    const all = { ...markMap() };
    if (list.length) all[id] = list.slice().sort((a, b) => a.t - b.t);
    else delete all[id];
    GM_setValue(KEY, all);
  }

  const hoursFor = (list) => list.some((mark) => mark.t >= 3600);

  let wePaused = false;

  function resume() {
    const player = video();
    // Only undo the pause this script caused
    if (wePaused && player && player.paused) player.play();
    wePaused = false;
  }

  function add() {
    const id = videoId();
    if (!id) return;
    const list = marksFor(id);
    if (list.length >= LIMIT) {
      alert(`This video already holds ${LIMIT} bookmarks.`);
      return;
    }
    const player = video();
    const at = Math.floor(player ? player.currentTime : 0);
    wePaused = !!player && !player.paused;
    if (wePaused) player.pause();
    const typed = prompt('Bookmark name', clock(at, hoursFor(list)));
    if (typed === null) {
      resume();
      return;
    }
    writeMarks(id, [...list, { t: at, n: typed.trim().slice(0, 60) || clock(at, hoursFor(list)), at: Date.now() }]);
    resume();
    drawMenu();
  }

  function jump(mark) {
    const player = video();
    if (player) player.currentTime = mark.t;
  }

  function remove(mark) {
    if (!confirm(`Delete the bookmark at ${clock(mark.t)} "${mark.n}"?`)) return;
    const id = videoId();
    if (!id) return;
    writeMarks(
      id,
      marksFor(id).filter((m) => m.at !== mark.at)
    );
    drawMenu();
  }

  let menuIds = [];

  function drawMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    if (menuIds.length && typeof GM_unregisterMenuCommand === 'function') {
      for (const id of menuIds) GM_unregisterMenuCommand(id);
    }
    menuIds = [];
    const id = videoId();
    if (!id) return;
    const list = marksFor(id).slice().sort((a, b) => a.t - b.t);
    const hours = hoursFor(list);
    const player = video();
    const at = clock(player ? player.currentTime : 0, hours);
    menuIds.push(GM_registerMenuCommand(`Add bookmark at ${at}`, add));
    for (const mark of list.slice(0, MENU_MARKS)) {
      const label = clock(mark.t, hours);
      menuIds.push(GM_registerMenuCommand(`Jump to ${label} (${mark.n})`, () => jump(mark)));
      menuIds.push(GM_registerMenuCommand(`Delete ${label} (${mark.n})`, () => remove(mark)));
    }
  }

  const isTyping = (target) =>
    !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'b' || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (isTyping(e.target) || !videoId()) return;
      e.preventDefault();
      add();
    },
    true
  );

  document.addEventListener('yt-navigate-finish', () => {
    drawMenu();
  });

  // The menu shows the playhead, so it is redrawn now and then, not on every tick
  let lastDrawn = 0;
  document.addEventListener(
    'timeupdate',
    () => {
      const now = Date.now();
      if (now - lastDrawn < 5000) return;
      lastDrawn = now;
      drawMenu();
    },
    true
  );

  drawMenu();
})();

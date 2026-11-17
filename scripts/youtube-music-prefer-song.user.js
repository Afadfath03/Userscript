// ==UserScript==
// @name         YouTube Music: Prefer Song
// @namespace    https://github.com/Afadfath03/Userscript
// @version      1.0
// @description  Keeps playback on the song version instead of the music video, and hides the Song/Video toggle
// @author       Afadfath03
// @homepageURL  https://github.com/Afadfath03/Userscript
// @supportURL   https://github.com/Afadfath03/Userscript/issues
// @downloadURL  https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-music-prefer-song.user.js
// @updateURL    https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-music-prefer-song.user.js
// @icon         https://raw.githubusercontent.com/Afadfath03/Userscript/main/assets/icons/youtube-music-prefer-song.png
// @license      MIT
// @match        https://music.youtube.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// ==/UserScript==

(() => {
  // Player pages in a frame carry no toggle of their own
  if (window.self !== window.top) return;

  const KEY = 'ytso.on';
  const HIDE = 'ytso.hide';
  // The toggle also works when pressed early, but it can land on another track, so the first try waits
  const WARMUP = 2000;
  const MAX_TRIES = 3;
  const TICK = 1000;

  const on = () => GM_getValue(KEY, true) === true;
  const hidden = () => GM_getValue(HIDE, true) === true;

  const style = document.createElement('style');
  style.id = 'ytso-style';
  (document.head || document.documentElement).append(style);

  let painted = '';
  function paint() {
    const css = on() && hidden() ? 'ytmusic-av-toggle { display: none !important; }' : '';
    if (css === painted) return;
    painted = css;
    style.textContent = css;
  }

  const currentId = () => new URLSearchParams(location.search).get('v') || '';

  // The host attributes carry the mode, and the two buttons mirror it in aria-pressed
  function mode(toggle) {
    if (toggle.getAttribute('is-video-playback-mode-selected') === 'true') return 'video';
    if (toggle.getAttribute('is-audio-playback-mode-selected') === 'true') return 'song';
    const video = toggle.querySelector('.video-button');
    const song = toggle.querySelector('.song-button');
    if (video && video.getAttribute('aria-pressed') === 'true') return 'video';
    if (song && song.getAttribute('aria-pressed') === 'true') return 'song';
    return '';
  }

  let tries = 0;
  let lastId = '';
  let firstSeen = 0;

  function tick() {
    paint();
    if (!on()) return;
    const toggle = document.querySelector('ytmusic-av-toggle');
    if (!toggle || mode(toggle) !== 'video') return;
    const button = toggle.querySelector('.song-button');
    if (!button) return;
    const id = currentId();
    if (!id) return;
    if (id !== lastId) {
      lastId = id;
      tries = 0;
      firstSeen = Date.now();
    }
    if (tries >= MAX_TRIES) return;
    if (Date.now() - firstSeen < WARMUP) return;
    const player = document.querySelector('video');
    if (player && player.currentTime < 1) return;
    tries++;
    button.click();
  }

  let menuIds = [];
  function drawMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    if (typeof GM_unregisterMenuCommand === 'function') {
      for (const id of menuIds) GM_unregisterMenuCommand(id);
    }
    const update = () => {
      paint();
      drawMenu();
      tick();
    };
    menuIds = [
      GM_registerMenuCommand(`${on() ? 'Disable' : 'Enable'} Prefer Song`, () => {
        GM_setValue(KEY, !on());
        update();
      }),
      GM_registerMenuCommand(`${hidden() ? 'Show' : 'Hide'} Song/Video toggle`, () => {
        GM_setValue(HIDE, !hidden());
        update();
      }),
    ];
  }

  // One tick per second costs less than watching every class change on this page
  setInterval(tick, TICK);
  document.addEventListener('yt-navigate-finish', tick);
  drawMenu();
  paint();
})();

// ==UserScript==
// @name         YouTube Music: Skip by Keyword
// @namespace    https://github.com/Afadfath03/Userscript
// @version      1.0
// @description  Skips tracks whose title, and optionally artist, contains a word from your list, such as live, remix or sped up
// @author       Afadfath03
// @homepageURL  https://github.com/Afadfath03/Userscript
// @supportURL   https://github.com/Afadfath03/Userscript/issues
// @downloadURL  https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-music-skip-by-keyword.user.js
// @updateURL    https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-music-skip-by-keyword.user.js
// @icon         https://raw.githubusercontent.com/Afadfath03/Userscript/main/assets/icons/youtube-music-skip-by-keyword.png
// @license      MIT
// @match        https://music.youtube.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// ==/UserScript==

(() => {
  // Player pages in a frame carry no player bar of their own
  if (window.self !== window.top) return;

  const ON = 'ytsk.on';
  const WORDS = 'ytsk.words';
  const ARTIST = 'ytsk.artist';
  const MAX_WORDS = 100;
  const MAX_LENGTH = 100;
  // A queue where every track matches would otherwise be skipped to the end
  const MAX_STREAK = 5;
  const TICK = 1000;
  const NEXT = 'ytmusic-player-bar .next-button';

  const squash = (s) => s.replace(/\s+/g, ' ').trim();
  const on = () => GM_getValue(ON, true) === true;
  const artistOn = () => GM_getValue(ARTIST, false) === true;

  function cleanList(list) {
    const seen = new Set();
    const out = [];
    for (const item of list) {
      if (typeof item !== 'string') continue;
      const word = squash(item).slice(0, MAX_LENGTH);
      const folded = word.toLowerCase();
      if (!word || seen.has(folded)) continue;
      seen.add(folded);
      out.push(word);
      if (out.length === MAX_WORDS) break;
    }
    return out;
  }

  const parseWords = (text) => cleanList(String(text).split(/[\n,]/));

  const words = () => {
    const stored = GM_getValue(WORDS, []);
    return Array.isArray(stored) ? cleanList(stored) : [];
  };

  // Whole words only, bounded by any letter or digit, so live leaves Alive and Deliver alone
  function matcher(list) {
    if (!list.length) return null;
    const parts = list.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'));
    const pattern = new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${parts.join('|')})(?:$|[^\\p{L}\\p{N}])`, 'iu');
    return (text) => pattern.test(text);
  }

  function readTrack() {
    const bar = document.querySelector('ytmusic-player-bar');
    if (!bar) return null;
    const title = squash(bar.querySelector('.title')?.textContent || '');
    if (!title) return null;
    return { title, byline: squash(bar.querySelector('.byline')?.textContent || '') };
  }

  const trackKey = (track) => `${track.title} | ${track.byline}`.toLowerCase();

  let lastKey = '';
  // Recent skips, so Previous can walk back over several of them
  const skipped = new Set();
  const MAX_REMEMBERED = 20;
  let streak = 0;

  function tick() {
    if (!on()) return;
    const track = readTrack();
    if (!track) return;
    const key = trackKey(track);
    if (key === lastKey) return;
    lastKey = key;
    const test = matcher(words());
    const hit = !!test && (test(track.title) || (artistOn() && test(track.byline)));
    if (!hit) {
      streak = 0;
      return;
    }
    // A track the user went back to after a skip is one they chose to hear
    if (skipped.has(key) || streak >= MAX_STREAK) return;
    const next = document.querySelector(NEXT);
    if (!next) {
      lastKey = '';
      return;
    }
    skipped.add(key);
  if (skipped.size > MAX_REMEMBERED) skipped.delete(skipped.values().next().value);
    streak++;
    next.click();
  }

  // A changed setting applies to the track that is playing now
  function recheck() {
    lastKey = '';
    drawMenu();
    tick();
  }

  let menuIds = [];
  function drawMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    if (typeof GM_unregisterMenuCommand === 'function') {
      for (const id of menuIds) GM_unregisterMenuCommand(id);
    }
    menuIds = [
      GM_registerMenuCommand(`${on() ? 'Disable' : 'Enable'} Skip by Keyword`, () => {
        GM_setValue(ON, !on());
        recheck();
      }),
      GM_registerMenuCommand(`Edit keywords (${words().length})`, () => {
        const answer = window.prompt('Keywords to skip, separated by commas', words().join(', '));
        if (answer === null) return;
        GM_setValue(WORDS, parseWords(answer));
        recheck();
      }),
      GM_registerMenuCommand(`Match artist too: ${artistOn() ? 'On' : 'Off'}`, () => {
        GM_setValue(ARTIST, !artistOn());
        recheck();
      }),
    ];
  }

  // One tick per second costs less than watching every text change in the player bar
  setInterval(tick, TICK);
  drawMenu();
  tick();
})();

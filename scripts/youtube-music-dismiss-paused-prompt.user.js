// ==UserScript==
// @name         YouTube Music: Dismiss Paused Prompt
// @namespace    https://github.com/Afadfath03/Userscript
// @version      1.0
// @description  Answers Yes to the "Video paused. Continue watching?" and "Are you still listening?" prompts so music keeps playing
// @author       Afadfath03
// @homepageURL  https://github.com/Afadfath03/Userscript
// @supportURL   https://github.com/Afadfath03/Userscript/issues
// @downloadURL  https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-music-dismiss-paused-prompt.user.js
// @updateURL    https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-music-dismiss-paused-prompt.user.js
// @icon         https://raw.githubusercontent.com/Afadfath03/Userscript/main/assets/icons/youtube-music-dismiss-paused-prompt.png
// @license      MIT
// @match        https://music.youtube.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// ==/UserScript==

(() => {
  // Player pages in a frame carry no prompt of their own
  if (window.self !== window.top) return;

  const KEY = 'ytmdp.on';
  const DONE = 'data-ytmdp-done';
  const TICK = 1000;
  // Closing the prompt does not always restart the track, so playback is checked once afterwards
  const RESUME_DELAY = 500;
  const squash = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  // Add other UI languages here; case and spacing are normalized
  const PHRASES = [
    'video paused. continue watching?',
    'video dijeda. lanjutkan menonton?',
    'are you still listening?',
    'apakah anda masih mendengarkan?',
    'are you still watching?',
    'apakah anda masih menonton?',
  ];
  const YES = new Set(['yes', 'ya', 'continue', 'lanjutkan', 'continue watching', 'lanjutkan menonton', 'resume']);
  const PROMPT = 'ytmusic-you-there-renderer';
  const DIALOG = `${PROMPT}, tp-yt-paper-dialog, yt-confirm-dialog-renderer`;
  const BUTTON = 'yt-button-renderer button, button, tp-yt-paper-button';

  const on = () => GM_getValue(KEY, true) === true;
  const visible = (el) => el.getClientRects().length > 0;

  function isPrompt(dialog) {
    // The renderer exists only for this prompt, so its tag is proof enough in any language
    if (dialog.matches(PROMPT) || dialog.querySelector(PROMPT)) return true;
    const text = squash(dialog.textContent || '');
    return PHRASES.some((p) => text.includes(p));
  }

  function resume() {
    const video = document.querySelector('video');
    if (!on() || !video || !video.paused) return;
    const played = video.play();
    if (played && typeof played.catch === 'function') played.catch(() => {});
  }

  function answer(dialog) {
    // The outer dialog speaks for the renderer inside it, so one appearance gets one click
    if (dialog.parentElement && dialog.parentElement.closest(DIALOG)) return false;
    if (dialog.hasAttribute(DONE) || !visible(dialog) || !isPrompt(dialog)) return false;
    const buttons = [...dialog.querySelectorAll(BUTTON)];
    let button = buttons.find((b) => YES.has(squash(b.textContent)));
    const renderer = dialog.matches(PROMPT) ? dialog : dialog.querySelector(PROMPT);
    // The renderer has a single confirming button, so an unknown label still points at it
    if (!button && renderer) button = renderer.querySelector(BUTTON);
    if (!button) return false;
    dialog.setAttribute(DONE, '');
    button.click();
    setTimeout(resume, RESUME_DELAY);
    return true;
  }

  function scan() {
    // A dialog that was hidden is shown again later as the same node
    for (const done of document.querySelectorAll(`[${DONE}]`)) {
      if (!visible(done)) done.removeAttribute(DONE);
    }
    if (!on()) return;
    for (const dialog of document.querySelectorAll(DIALOG)) answer(dialog);
  }

  let raf = 0;
  new MutationObserver((list) => {
    if (!on() || raf) return;
    if (!list.some((m) => m.addedNodes.length)) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      scan();
    });
  }).observe(document.documentElement, { childList: true, subtree: true });

  let menuId = null;
  function drawMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    if (menuId !== null && typeof GM_unregisterMenuCommand === 'function') GM_unregisterMenuCommand(menuId);
    menuId = GM_registerMenuCommand(`${on() ? 'Disable' : 'Enable'} Dismiss Paused Prompt`, () => {
      GM_setValue(KEY, !on());
      drawMenu();
      scan();
    });
  }

  // Showing a hidden dialog again changes only its style, which the observer above does not watch
  setInterval(scan, TICK);
  drawMenu();
  // Content already present at document-idle never fires a mutation
  if (document.body) scan();
})();

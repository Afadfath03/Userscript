// ==UserScript==
// @name         YouTube: Dismiss "Video paused. Continue watching?"
// @namespace    https://github.com/Afadfath03/Userscript
// @version      1.0
// @description  Answers the "Video paused. Continue watching?" and "Are you still watching?" prompts with Yes, No, or leaves them alone
// @author       Afadfath03
// @homepageURL  https://github.com/Afadfath03/Userscript
// @supportURL   https://github.com/Afadfath03/Userscript/issues
// @downloadURL  https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-dismiss-paused-prompt.user.js
// @updateURL    https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-dismiss-paused-prompt.user.js
// @license      MIT
// @match        https://www.youtube.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// ==/UserScript==

(() => {
  const squash = (s) => s.replace(/\s+/g, ' ').trim().toLowerCase();
  // Add other UI languages here; case and spacing are normalized
  const PHRASES = [
    'video paused. continue watching?',
    'video dijeda. lanjutkan menonton?',
    'are you still watching?',
    'apakah anda masih menonton?',
  ];
  const YES = new Set(['yes', 'ya', 'continue watching', 'lanjutkan menonton', 'resume']);
  const NO = new Set(['no', 'tidak', 'not now', 'bukan sekarang']);
  const CHOICES = [
    ['yes', 'Yes'],
    ['no', 'No'],
    ['leave', 'Leave as-is'],
  ];
  const DIALOG = 'yt-confirm-dialog-renderer, yt-confirm-dialog-view-model, tp-yt-paper-dialog';
  const BUTTON = 'yt-button-renderer, button, tp-yt-paper-button';

  const mode = () => {
    const value = GM_getValue('ytdp.answer', 'yes');
    return CHOICES.some(([v]) => v === value) ? value : 'yes';
  };

  function answer(dialog) {
    const choice = mode();
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
    if (location.pathname !== '/watch') return;
    for (const dialog of document.querySelectorAll(DIALOG)) answer(dialog);
  }

  const queue = new Set();
  let raf = 0;

  function flush() {
    raf = 0;
    const batch = [...queue];
    queue.clear();
    if (location.pathname !== '/watch') return;
    for (const node of batch) {
      if (!node.isConnected) continue;
      if (node.matches(DIALOG)) answer(node);
      for (const dialog of node.querySelectorAll(DIALOG)) answer(dialog);
    }
  }

  new MutationObserver((list) => {
    for (const mutation of list) {
      for (const node of mutation.addedNodes) if (node.nodeType === 1) queue.add(node);
    }
    if (queue.size && !raf) raf = requestAnimationFrame(flush);
  }).observe(document.documentElement, { childList: true, subtree: true });

  let menuId = null;

  function drawMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    if (menuId !== null && typeof GM_unregisterMenuCommand === 'function') GM_unregisterMenuCommand(menuId);
    const label = CHOICES.find(([value]) => value === mode())[1];
    menuId = GM_registerMenuCommand(`Paused prompt: ${label}`, cycle);
  }

  function cycle() {
    const values = CHOICES.map(([value]) => value);
    const next = values[(values.indexOf(mode()) + 1) % values.length];
    GM_setValue('ytdp.answer', next);
    drawMenu();
    scan();
  }

  drawMenu();
  // Content already present at document-idle never fires a mutation
  if (document.body) scan();
})();

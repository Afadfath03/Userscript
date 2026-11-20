// ==UserScript==
// @name         YouTube: Clean Share Link
// @namespace    https://github.com/Afadfath03/Userscript
// @version      1.0
// @description  Removes tracking parameters from copied share links, with a menu command to copy a link at the current time
// @author       Afadfath03
// @homepageURL  https://github.com/Afadfath03/Userscript
// @supportURL   https://github.com/Afadfath03/Userscript/issues
// @downloadURL  https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-clean-share-link.user.js
// @updateURL    https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-clean-share-link.user.js
// @icon         https://raw.githubusercontent.com/Afadfath03/Userscript/main/assets/icons/youtube-clean-share-link.png
// @license      MIT
// @match        https://www.youtube.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_setClipboard
// ==/UserScript==

(() => {
  // Embeds have no share panel and no address bar of their own
  if (window.self !== window.top) return;

  const ADDRESS = 'ytcl.address';
  // Only parameters that identify the sharer or the click path; v, t, list and index stay
  const TRACKING = ['si', 'pp', 'feature', 'ab_channel', 'source_ve_path', 'embeds_referring_euri', 'embeds_referring_origin'];
  const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);
  const INPUT = 'yt-copy-link-renderer #share-url, #share-url';
  const COPY = 'yt-copy-link-renderer #copy-button, yt-copy-link-renderer button';

  const addressOn = () => GM_getValue(ADDRESS, false) === true;

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

  function linkAt(id, seconds) {
    const t = Math.floor(seconds);
    return t > 0 ? `https://youtu.be/${id}?t=${t}` : `https://youtu.be/${id}`;
  }

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
    document.getElementById('ytcl-toast')?.remove();
    clearTimeout(toastTimer);
    const box = document.createElement('div');
    box.id = 'ytcl-toast';
    box.setAttribute('role', 'status');
    box.textContent = text;
    box.style.cssText =
      'position:fixed;left:24px;bottom:24px;z-index:2147483647;padding:12px 16px;border-radius:8px;background:#0f0f0f;color:#fff;font:14px Roboto,Arial,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.35)';
    document.body.append(box);
    toastTimer = setTimeout(() => box.remove(), 2000);
  }

  function cleanInputs() {
    for (const input of document.querySelectorAll(INPUT)) {
      const clean = cleanUrl(input.value);
      if (clean !== input.value) input.value = clean;
    }
  }

  // YouTube's own copy reads its data model, not the input, so the click is answered here instead
  document.addEventListener(
    'click',
    async (e) => {
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

  function cleanAddress() {
    if (!addressOn()) return;
    // The page is YouTube by @match, so only the parameters need checking here
    const url = new URL(location.href);
    // replaceState keeps the entry count and YouTube's own state object
    if (stripTracking(url)) history.replaceState(history.state, '', url.toString());
  }

  async function copyAtTime() {
    if (location.pathname !== '/watch') return;
    const id = new URLSearchParams(location.search).get('v');
    if (!id) return;
    const video = document.querySelector('#movie_player video') || document.querySelector('video');
    const ok = await copyText(linkAt(id, video ? video.currentTime : 0));
    toast(ok ? 'Link copied' : 'Clipboard blocked');
  }

  const queue = new Set();
  let raf = 0;
  new MutationObserver((list) => {
    for (const mutation of list) {
      for (const node of mutation.addedNodes) if (node.nodeType === 1) queue.add(node);
    }
    if (queue.size && !raf) {
      raf = requestAnimationFrame(() => {
        raf = 0;
        queue.clear();
        cleanInputs();
      });
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  // "Start at" rewrites the input through its property, which no observer sees
  setInterval(() => {
    if (document.querySelector(INPUT)) cleanInputs();
  }, 250);

  let menuIds = [];
  function drawMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    if (typeof GM_unregisterMenuCommand === 'function') {
      for (const id of menuIds) GM_unregisterMenuCommand(id);
    }
    menuIds = [
      GM_registerMenuCommand(`Clean address bar: ${addressOn() ? 'On' : 'Off'}`, () => {
        GM_setValue(ADDRESS, !addressOn());
        drawMenu();
        cleanAddress();
      }),
      GM_registerMenuCommand('Copy link at current time', copyAtTime),
    ];
  }

  document.addEventListener('yt-navigate-finish', cleanAddress);
  drawMenu();
  cleanAddress();
  cleanInputs();
})();

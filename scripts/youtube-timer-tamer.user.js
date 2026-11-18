// ==UserScript==
// @name         YouTube: Timer Tamer
// @namespace    https://github.com/Afadfath03/Userscript
// @version      1.0
// @description  Batches the page's timers onto the next animation frame to cut idle CPU; install it alone, a second timer tamer would stack delays
// @author       Afadfath03
// @homepageURL  https://github.com/Afadfath03/Userscript
// @supportURL   https://github.com/Afadfath03/Userscript/issues
// @downloadURL  https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-timer-tamer.user.js
// @updateURL    https://raw.githubusercontent.com/Afadfath03/Userscript/main/scripts/youtube-timer-tamer.user.js
// @icon         https://raw.githubusercontent.com/Afadfath03/Userscript/main/assets/icons/youtube-timer-tamer.png
// @license      MIT
// @match        https://www.youtube.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  // The page keeps the real timers; two wrappers would stack one delay on the other
  if (window.__yttm || window.nzsxclvflluv) return;
  window.__yttm = true;

  const native = {
    setTimeout: window.setTimeout.bind(window),
    setInterval: window.setInterval.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    clearInterval: window.clearInterval.bind(window),
  };

  const FRAME_GRACE = 250;   // no frame for this long means no repaint is coming, so run directly
  const VIDEO_GRACE = 1500;  // align only while a video has ticked recently
  const MAX_QUEUE = 200;

  let frame = 0;
  let lastFrame = 0;
  let lastTick = 0;
  const queue = [];
  const ran = new Set();
  const dropped = new Set();

  // timeupdate does not bubble, hence the capture phase
  document.addEventListener('timeupdate', () => { lastTick = performance.now(); }, true);

  function fire(fn, args) {
    try {
      fn.apply(window, args);
    } catch (error) {
      // Native timers report and let the rest of the page continue
      console.error(error);
    }
  }

  function direct() {
    const now = performance.now();
    return document.hidden ||
      now - lastFrame > FRAME_GRACE ||
      now - lastTick > VIDEO_GRACE ||
      queue.length >= MAX_QUEUE;
  }

  function flush() {
    if (frame) {
      window.cancelAnimationFrame(frame);
      frame = 0;
    }
    lastFrame = performance.now();
    ran.clear();
    for (const task of queue.splice(0)) {
      if (dropped.delete(task.id)) continue;
      if (ran.has(task.id)) continue; // one run per id per frame
      ran.add(task.id);
      fire(task.fn, task.args);
    }
    dropped.clear();
  }

  function enqueue(id, fn, args) {
    if (direct()) {
      fire(fn, args);
      return;
    }
    queue.push({ id, fn, args });
    if (!frame) frame = window.requestAnimationFrame(flush);
  }

  // Ids stay native, so clearTimeout and clearInterval work even for callers holding a real id
  window.setTimeout = function (fn, delay = 0, ...args) {
    if (typeof fn !== 'function') return native.setTimeout(fn, delay, ...args);
    const id = native.setTimeout(() => enqueue(id, fn, args), delay);
    return id;
  };

  window.setInterval = function (fn, delay = 0, ...args) {
    if (typeof fn !== 'function') return native.setInterval(fn, delay, ...args);
    const id = native.setInterval(() => enqueue(id, fn, args), delay);
    return id;
  };

  function drop(id) {
    if (id) dropped.add(id);
    // Nothing is waiting for a frame, so the set holds no live entry
    if (!queue.length && dropped.size > 256) dropped.clear();
  }

  window.clearTimeout = function (id) { drop(id); native.clearTimeout(id); };
  window.clearInterval = function (id) { drop(id); native.clearInterval(id); };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && queue.length) flush();
  });
})();

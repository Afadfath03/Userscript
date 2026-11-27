import { chromium, scriptPath } from '../harness.mjs';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const SCRIPT = readFileSync(scriptPath('youtube-timer-tamer.user.js'), 'utf8');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end('<!doctype html><html><body><video id="v"></video><div id="page"></div></body></html>');
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ headless: true });
let failures = 0;
const check = (name, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!ok) failures++;
};

// Headless Chromium often never paints, so the frame source is a native timer
async function open(seed = {}) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check(`no page error (${e.message})`, false));
  await page.addInitScript((initial) => {
    window.__nativeSource = String(window.setTimeout);
    window.__nativeST = window.setTimeout.bind(window);
    window.__nativeCT = window.clearTimeout.bind(window);
    window.__log = [];
    if (initial.marker) window[initial.marker] = true;
    window.requestAnimationFrame = (cb) => window.__nativeST(() => cb(performance.now()), 16);
  }, seed);
  await page.goto(`${base}/watch?v=test`);
  await page.addScriptTag({ content: SCRIPT });
  await page.waitForTimeout(100);
  return { ctx, page };
}

// The tamer only aligns while a video is ticking
const tick = (page) => page.evaluate(() => {
  document.getElementById('v').dispatchEvent(new Event('timeupdate'));
});

// Count frames, and flag whether a callback runs inside one
async function trace(page) {
  await page.evaluate(() => {
    window.__frames = 0;
    window.__inFrame = false;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf((ts) => {
      window.__frames++;
      const outer = window.__inFrame;
      window.__inFrame = true;
      cb(ts);
      window.__inFrame = outer;
    });
  });
  // Let a frame that was requested before the wrap fire, so every later one goes through it
  await page.waitForTimeout(80);
}

// 1. The override is in place at all
{
  const { ctx, page } = await open();
  const state = await page.evaluate(() => ({
    wrapped: String(window.setTimeout) !== window.__nativeSource,
    marker: window.__yttm === true,
  }));
  check('the timer functions are replaced', state.wrapped);
  check('the script leaves its own marker', state.marker);
  await ctx.close();
}

// 2. Zero delay timers run inside an animation frame, not between frames
{
  const { ctx, page } = await open();
  await tick(page);
  await trace(page);
  const marks = await page.evaluate(async () => {
    const out = [];
    for (let i = 0; i < 3; i++) setTimeout(() => out.push(window.__inFrame), 0);
    await new Promise((r) => setTimeout(r, 250));
    return out;
  });
  check('all three timeouts ran', marks.length === 3);
  check('every timeout ran inside a frame', marks.every((v) => v === true));
  await ctx.close();
}

// 3. The same interval never runs twice in one frame
{
  const { ctx, page } = await open();
  await tick(page);
  await trace(page);
  const seen = await page.evaluate(async () => {
    const perFrame = new Map();
    const id = setInterval(() => {
      const f = window.__frames;
      perFrame.set(f, (perFrame.get(f) || 0) + 1);
    }, 1);
    await new Promise((r) => setTimeout(r, 400));
    clearInterval(id);
    return [...perFrame.values()];
  });
  check('the interval ran', seen.length > 0);
  check('the interval ran at most once per frame', Math.max(...seen) === 1);
  await ctx.close();
}

// 4. Clearing a wrapped timeout before the frame drops the callback
{
  const { ctx, page } = await open();
  await tick(page);
  const hit = await page.evaluate(async () => {
    window.__hit = 0;
    const id = setTimeout(() => { window.__hit = 1; }, 0);
    clearTimeout(id);
    await new Promise((r) => setTimeout(r, 200));
    return window.__hit;
  });
  check('a cleared timeout never runs', hit === 0);
  await ctx.close();
}

// 5. A native id from before the override can still be cleared
{
  const { ctx, page } = await open();
  await tick(page);
  const hit = await page.evaluate(async () => {
    window.__hit = 0;
    const id = window.__nativeST(() => { window.__hit = 1; }, 0);
    window.clearTimeout(id);
    await new Promise((r) => setTimeout(r, 200));
    return window.__hit;
  });
  check('a pre-override id is still cleared', hit === 0);
  await ctx.close();
}

// 6. A hidden page with no frame source still runs its timers
{
  const { ctx, page } = await open();
  await tick(page);
  const hit = await page.evaluate(async () => {
    Object.defineProperty(document, 'hidden', { get: () => true, configurable: true });
    window.requestAnimationFrame = () => 0;
    window.__hit = 0;
    setTimeout(() => { window.__hit = 1; }, 0);
    await new Promise((r) => window.__nativeST(r, 150));
    return window.__hit;
  });
  check('a hidden page falls back to the native timer', hit === 1);
  await ctx.close();
}

// 7. A stalled page still runs its timers once the frame never comes
{
  const { ctx, page } = await open();
  await tick(page);
  const hit = await page.evaluate(async () => {
    window.requestAnimationFrame = () => 0;
    window.__hit = 0;
    setTimeout(() => { window.__hit = 1; }, 0);
    await new Promise((r) => window.__nativeST(r, 600));
    return window.__hit;
  });
  check('a stalled page runs its timers through the watchdog', hit === 1);
  await ctx.close();
}

// 8. A quiet stretch does not push the page off the frame path for good
{
  const { ctx, page } = await open();
  await tick(page);
  await page.waitForTimeout(400);
  await tick(page);
  await trace(page);
  const marks = await page.evaluate(async () => {
    setTimeout(() => window.__log.push(window.__inFrame), 0);
    await new Promise((r) => setTimeout(r, 250));
    return window.__log;
  });
  check('an idle gap keeps the timers on the frame path', marks[0] === true);
  await ctx.close();
}

// 9. Another timer tamer on the page wins, this one steps aside
{
  const { ctx, page } = await open({ marker: 'nzsxclvflluv' });
  const untouched = await page.evaluate(() => String(window.setTimeout) === window.__nativeSource);
  check('a foreign timer tamer is not wrapped again', untouched);
  await ctx.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

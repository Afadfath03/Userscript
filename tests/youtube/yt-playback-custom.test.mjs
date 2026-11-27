import { chromium, scriptPath } from '../harness.mjs';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const STANDALONE = readFileSync(scriptPath('youtube-playback-custom.user.js'), 'utf8');
const COLLECTION = readFileSync(scriptPath('youtube-custom-collection.user.js'), 'utf8');

const FIXTURE = `<!doctype html><html><body>
  <div id="movie_player"><video id="v" muted playsinline></video></div>
  <div id="description-inline-expander"><button id="expand" onclick="this.hidden=true">...more</button></div>
</body></html>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(FIXTURE);
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ headless: true });
let failures = 0;
const check = (name, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!ok) failures++;
};

async function setup(script, store = {}) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check(`no page error (${e.message})`, false));
  await page.addInitScript((initStore) => {
    window.__store = { ...initStore };
    window.__menu = [];
    window.GM_getValue = (k, d) => (k in window.__store ? window.__store[k] : d);
    window.GM_setValue = (k, v) => { window.__store[k] = v; };
    window.GM_deleteValue = (k) => { delete window.__store[k]; };
    window.GM_listValues = () => Object.keys(window.__store);
    window.GM_registerMenuCommand = (name, cb) => { window.__menu.push({ name, cb }); return window.__menu.length; };
    window.GM_unregisterMenuCommand = () => {};
    window.GM_info = { script: { version: '5.0' } };
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  }, store);
  await page.goto(`${base}/watch?v=abc12345`);
  await page.addScriptTag({ content: script });
  await page.waitForTimeout(150);
  return { ctx, page };
}

// Standalone
{
  const { ctx, page } = await setup(STANDALONE, { 'ytpc.speed': 1.5, 'ytpc.bookmarksOn': true });
  check('standalone: auto-expands description by default', await page.evaluate(() => document.getElementById('expand').hidden === true));
  check('standalone: applies playback speed', await page.evaluate(() => document.getElementById('v').playbackRate === 1.5));

  await page.evaluate(() => window.__menu[0].cb());
  await page.waitForTimeout(60);
  const subs = await page.locator('#ytpc-panel .ytp-group button span:first-child').allTextContents();
  check('standalone: has 4 split sub-sections (Video & Audio, Autoplay, Watch Page, Video Bookmarks)',
    JSON.stringify(subs) === JSON.stringify(['Video & Audio', 'Autoplay', 'Watch Page', 'Video Bookmarks']));

  await page.getByRole('button', { name: /Enabled/ }).click();
  await page.waitForTimeout(60);
  check('standalone: disabling greys out sub-sections and keeps Reset clickable',
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('#ytpc-panel .ytp-group button')];
      const r = document.querySelector('#ytpc-panel .ytp-reset');
      return b.every((x) => x.disabled) && r && !r.disabled;
    }));
  await ctx.close();
}

// Collection
{
  const { ctx, page } = await setup(COLLECTION, { 'ytc.speed': 1.25 });
  check('collection: auto-expands description and applies speed',
    await page.evaluate(() => document.getElementById('expand').hidden === true && document.getElementById('v').playbackRate === 1.25));
  await page.evaluate(() => window.__menu[0].cb());
  await page.waitForTimeout(60);
  await page.getByRole('button', { name: /Playback Custom/ }).click();
  await page.waitForTimeout(60);
  const subs = await page.locator('#ytc-panel .ytc-group button span:first-child').allTextContents();
  check('collection: Playback Custom has 4 split sub-sections',
    JSON.stringify(subs) === JSON.stringify(['Video & Audio', 'Autoplay', 'Watch Page', 'Video Bookmarks']));
  await ctx.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

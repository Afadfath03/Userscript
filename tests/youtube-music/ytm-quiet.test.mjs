import { chromium, scriptPath } from '../harness.mjs';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const SCRIPT = readFileSync(scriptPath('youtube-music-quiet-page.user.js'), 'utf8');

const FIXTURE = `<!doctype html><html><body>
  <ytmusic-mealbar-promo-renderer id="mealbar">get premium</ytmusic-mealbar-promo-renderer>
  <ytmusic-statement-banner-renderer id="banner">premium banner</ytmusic-statement-banner-renderer>
  <ytmusic-background-promo-renderer id="background">full page promo</ytmusic-background-promo-renderer>
  <ytmusic-carousel-shelf-renderer id="shorts"><div id="title">Shorts</div><div class="items">clips</div></ytmusic-carousel-shelf-renderer>
  <ytmusic-carousel-shelf-renderer id="mixes"><div id="title">Song mixes</div><div class="items">songs</div></ytmusic-carousel-shelf-renderer>
  <ytmusic-guide-entry-renderer id="premium"><a href="/premium">Premium</a></ytmusic-guide-entry-renderer>
  <ytmusic-guide-entry-renderer id="home"><a href="/">Home</a></ytmusic-guide-entry-renderer>
</body></html>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(FIXTURE);
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
let failures = 0;
const check = (name, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!ok) failures++;
};
page.on('pageerror', (e) => check(`no page error (${e.message})`, false));

await page.addInitScript(() => {
  window.__store = {};
  window.__menu = [];
  window.GM_getValue = (k, d) => (k in window.__store ? window.__store[k] : d);
  window.GM_setValue = (k, v) => { window.__store[k] = v; };
  window.GM_registerMenuCommand = (name, cb) => { window.__menu.push({ name, cb }); return window.__menu.length; };
  window.GM_unregisterMenuCommand = () => {};
});

await page.goto(`${base}/`);
await page.addScriptTag({ content: SCRIPT });
await page.waitForTimeout(300);

const display = (selector) =>
  page.evaluate((sel) => getComputedStyle(document.querySelector(sel)).display, selector);
const clickMenu = (name) =>
  page.evaluate((label) => {
    const entry = window.__menu.find((m) => m.name === label);
    if (!entry) throw new Error(`menu entry not found: ${label}`);
    entry.cb();
  }, name);

check('the mealbar promo is hidden', (await display('#mealbar')) === 'none');
check('the statement banner is hidden', (await display('#banner')) === 'none');
check('the background promo is hidden', (await display('#background')) === 'none');
check('the Shorts shelf is hidden', (await display('#shorts')) === 'none');
check('other shelves stay', (await display('#mixes')) !== 'none');
check('the Premium guide entry is hidden', (await display('#premium')) === 'none');
check('other guide entries stay', (await display('#home')) !== 'none');

await clickMenu('Show promo banners');
await page.waitForTimeout(200);
check('showing promos restores all three', (await display('#mealbar')) !== 'none' && (await display('#banner')) !== 'none' && (await display('#background')) !== 'none');
check('showing promos leaves the Shorts shelf alone', (await display('#shorts')) === 'none');

await clickMenu('Show Shorts shelves');
await page.waitForTimeout(200);
check('showing shelves restores the Shorts shelf', (await display('#shorts')) !== 'none');
check('showing shelves restores the Premium entry', (await display('#premium')) !== 'none');

await clickMenu('Hide Shorts shelves');
await page.waitForTimeout(200);
check('hiding again takes the Shorts shelf away', (await display('#shorts')) === 'none');

// A shelf added long after load is the case the interval exists for
await page.evaluate(() => {
  const shelf = document.createElement('ytmusic-carousel-shelf-renderer');
  shelf.id = 'late';
  shelf.innerHTML = '<div id="title">Shorts video</div>';
  document.body.append(shelf);
});
await page.waitForTimeout(1200);
check('a shelf added later is caught', (await display('#late')) === 'none');

await clickMenu('Hide promo banners');
await page.waitForTimeout(200);
check('the third switch hides the promos again', (await display('#mealbar')) === 'none');

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

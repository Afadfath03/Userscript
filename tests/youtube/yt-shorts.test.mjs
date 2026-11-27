import { chromium, scriptPath } from '../harness.mjs';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const SCRIPT = readFileSync(scriptPath('youtube-custom-collection.user.js'), 'utf8');

const PAGE = '<!doctype html><html><body><div id="movie_player"><video></video></div></body></html>';

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(PAGE);
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ headless: true });
let failures = 0;
const check = (name, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!ok) failures++;
};

async function open(store, path = '/watch?v=dQw4w9WgXcQ') {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check(`no page error (${e.message})`, false));
  await page.addInitScript((initial) => {
    window.__store = { ...initial };
    window.__menu = [];
    window.GM_getValue = (k, d) => (k in window.__store ? window.__store[k] : d);
    window.GM_setValue = (k, v) => { window.__store[k] = v; };
    window.GM_deleteValue = (k) => { delete window.__store[k]; };
    window.GM_listValues = () => Object.keys(window.__store);
    window.GM_registerMenuCommand = (name, cb) => { window.__menu.push({ name, cb }); return window.__menu.length; };
    window.GM_unregisterMenuCommand = () => {};
    window.GM_info = { script: { version: '3.7' } };
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  }, store);
  await page.goto(`${base}${path}`);
  // The script expects document-idle, so it is injected after the page, like a real install
  await page.addScriptTag({ content: SCRIPT });
  await page.waitForTimeout(250);
  return { ctx, page };
}

// Off by default: the Short stays where it is
{
  const { ctx, page } = await open({}, '/shorts/abcdefghijk');
  check('off by default, a Short stays a Short', new URL(page.url()).pathname === '/shorts/abcdefghijk');
  await ctx.close();
}

// Enabled: the Short opens in the watch player
{
  const { ctx, page } = await open({ 'ytc.shortsOn': true }, '/shorts/abcdefghijk');
  const url = new URL(page.url());
  check('an enabled Short is rewritten to /watch', url.pathname === '/watch' && url.searchParams.get('v') === 'abcdefghijk');
  await ctx.close();
}

// A shared start time survives the rewrite
{
  const { ctx, page } = await open({ 'ytc.shortsOn': true }, '/shorts/abcdefghijk?t=42');
  const url = new URL(page.url());
  check('the start time is carried over', url.pathname === '/watch' && url.searchParams.get('t') === '42' && url.searchParams.get('v') === 'abcdefghijk');
  await ctx.close();
}

// Other pages are left alone
{
  const { ctx, page } = await open({ 'ytc.shortsOn': true }, '/feed/subscriptions');
  check('a non-Shorts page is untouched', new URL(page.url()).pathname === '/feed/subscriptions');
  await ctx.close();
}

// An in-page navigation into a Short is rewritten too
{
  const { ctx, page } = await open({ 'ytc.shortsOn': true });
  await page.evaluate(() => {
    history.pushState({}, '', '/shorts/zyxwvutsrqp');
    document.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await page.waitForTimeout(400);
  const url = new URL(page.url());
  check('an in-page navigation is rewritten as well', url.pathname === '/watch' && url.searchParams.get('v') === 'zyxwvutsrqp');
  await ctx.close();
}

// Turning the feature on from the panel takes effect without a reload
{
  const { ctx, page } = await open({});
  await page.evaluate(() => {
    history.pushState({}, '', '/shorts/abcdefghijk');
    window.__store['ytc.shortsOn'] = true;
    document.dispatchEvent(new Event('ytc-change'));
  });
  await page.waitForTimeout(400);
  check('enabling the feature rewrites the page already open', new URL(page.url()).pathname === '/watch');
  await ctx.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

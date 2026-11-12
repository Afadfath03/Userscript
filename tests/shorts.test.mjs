import { chromium, scriptPath } from './harness.mjs';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const SCRIPT = readFileSync(scriptPath('youtube-shorts-to-watch.user.js'), 'utf8');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end('<!doctype html><html><body><div id="page"></div></body></html>');
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ headless: true });
let failures = 0;
const check = (name, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!ok) failures++;
};

async function open(path, store = {}) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check(`no page error (${e.message})`, false));
  await page.addInitScript((initial) => {
    window.__store = { ...initial };
    window.__menu = [];
    window.GM_getValue = (k, d) => (k in window.__store ? window.__store[k] : d);
    window.GM_setValue = (k, v) => { window.__store[k] = v; };
    window.GM_registerMenuCommand = (name, cb) => { window.__menu.push({ name, cb }); return window.__menu.length; };
    window.GM_unregisterMenuCommand = () => {};
  }, store);
  await page.goto(`${base}${path}`);
  await page.addScriptTag({ content: SCRIPT });
  await page.waitForTimeout(350);
  return { ctx, page };
}

// 1. Off by default: nothing happens and the menu says so
{
  const { ctx, page } = await open('/shorts/abc123XYZ');
  check('shorts URL is left alone while off', new URL(page.url()).pathname === '/shorts/abc123XYZ');
  const label = await page.evaluate(() => window.__menu.at(-1)?.name);
  check('menu shows the feature is off', label === 'Shorts to Watch: Off');
  await ctx.close();
}

// 2. Turning it on from the menu rewrites the current page
{
  const { ctx, page } = await open('/shorts/abc123XYZ');
  await page.evaluate(() => window.__menu.at(-1).cb());
  await page.waitForTimeout(400);
  check('turning it on rewrites the page', new URL(page.url()).pathname === '/watch');
  check('the video id is kept', new URL(page.url()).searchParams.get('v') === 'abc123XYZ');
  await ctx.close();
}

// 3. Already enabled: rewrite happens on load and keeps the start time
{
  const { ctx, page } = await open('/shorts/abc123XYZ?t=42', { 'ytsw.on': true });
  check('enabled copy rewrites on load', new URL(page.url()).pathname === '/watch');
  check('start time is preserved', new URL(page.url()).searchParams.get('t') === '42');
  await ctx.close();
}

// 4. Other pages are never touched, on or off
{
  const { ctx, page } = await open('/feed/subscriptions', { 'ytsw.on': true });
  check('feed page is not touched', page.url().endsWith('/feed/subscriptions'));
  await ctx.close();
}

// 5. In-app navigation into a Short is caught
{
  const { ctx, page } = await open('/watch?v=first', { 'ytsw.on': true });
  await page.evaluate(() => {
    history.pushState({}, '', '/shorts/spa123XYZ');
    document.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await page.waitForTimeout(400);
  check('in-app navigation is rewritten', new URL(page.url()).pathname === '/watch');
  await ctx.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

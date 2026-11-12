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
const ctx = await browser.newContext();
const page = await ctx.newPage();
let failures = 0;
const check = (name, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!ok) failures++;
};
page.on('pageerror', (e) => check(`no page error (${e.message})`, false));

// 1. A Short URL is rewritten to the watch page
await page.goto(`${base}/shorts/abc123XYZ`);
await page.addScriptTag({ content: SCRIPT });
await page.waitForTimeout(400);
check('shorts URL becomes a watch URL', new URL(page.url()).pathname === '/watch');
check('the video id is kept', new URL(page.url()).searchParams.get('v') === 'abc123XYZ');

// 2. The start time survives
await page.goto(`${base}/shorts/abc123XYZ?t=42`);
await page.addScriptTag({ content: SCRIPT });
await page.waitForTimeout(400);
check('start time is preserved', new URL(page.url()).searchParams.get('t') === '42');

// 3. Other pages are left alone
await page.goto(`${base}/feed/subscriptions`);
await page.addScriptTag({ content: SCRIPT });
await page.waitForTimeout(300);
check('feed page is not touched', page.url().endsWith('/feed/subscriptions'));

// 4. SPA navigation into a Short is caught too
await page.goto(`${base}/watch?v=first`);
await page.addScriptTag({ content: SCRIPT });
await page.waitForTimeout(150);
await page.evaluate(() => {
  history.pushState({}, '', '/shorts/spa123XYZ');
  document.dispatchEvent(new Event('yt-navigate-finish'));
});
await page.waitForTimeout(400);
check('in-app navigation into a Short is rewritten', new URL(page.url()).pathname === '/watch');

// 5. A plain watch page stays put
await page.goto(`${base}/watch?v=keepme`);
await page.addScriptTag({ content: SCRIPT });
await page.waitForTimeout(300);
check('watch page is not touched', new URL(page.url()).searchParams.get('v') === 'keepme');

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

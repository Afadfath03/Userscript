import { chromium, scriptPath } from './harness.mjs';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const SCRIPT = readFileSync(scriptPath('youtube-custom-collection.user.js'), 'utf8');

const FIXTURE = `<!doctype html><html><body>
<div id="feed">
  <ytd-rich-item-renderer id="a"><yt-badge-shape>Members only</yt-badge-shape></ytd-rich-item-renderer>
  <ytd-rich-item-renderer id="b"><yt-badge-shape>4K</yt-badge-shape></ytd-rich-item-renderer>
</div>
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

const ctx = await browser.newContext();
const page = await ctx.newPage();
page.on('pageerror', (e) => check(`no page error (${e.message})`, false));

await page.addInitScript(() => {
  window.__store = {};
  window.__clicks = [];
  window.__menu = [];
  window.GM_getValue = (k, d) => (k in window.__store ? window.__store[k] : d);
  window.GM_setValue = (k, v) => { window.__store[k] = v; };
  window.GM_registerMenuCommand = (name, cb) => { window.__menu.push({ name, cb }); return window.__menu.length; };
  window.GM_unregisterMenuCommand = () => {};
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
});

await page.goto(`${base}/watch?v=abc`);
await page.addScriptTag({ content: SCRIPT });
await page.waitForTimeout(150);

check('members-only card still hidden', (await page.evaluate(() => getComputedStyle(document.getElementById('a')).display)) === 'none');
check('ordinary card still visible', (await page.evaluate(() => getComputedStyle(document.getElementById('b')).display)) !== 'none');

// Paused prompt still answered with the default
await page.evaluate(() => {
  const d = document.createElement('yt-confirm-dialog-renderer');
  d.innerHTML = '<div>Video paused. Continue watching?</div>';
  for (const label of ['Yes', 'No']) {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', () => window.__clicks.push(label));
    d.append(b);
  }
  document.body.append(d);
});
await page.waitForTimeout(200);
check('paused prompt still answered Yes', JSON.stringify(await page.evaluate(() => window.__clicks)) === '["Yes"]');

// Per-feature panels still render and trap focus
await page.evaluate(() => window.__menu[0].cb());
await page.waitForTimeout(80);
await page.getByRole('button', { name: 'Playback Defaults' }).click();
await page.waitForTimeout(100);
check('feature panel still opens', (await page.locator('#ytc-panel h2').textContent()) === 'YouTube: Playback Defaults');
const firstFocus = await page.evaluate(() => document.activeElement.textContent.trim());
check('feature panel focuses its first control', firstFocus.startsWith('Enabled'));
await page.getByRole('button', { name: /Enabled/ }).click();
await page.waitForTimeout(50);
check('toggling a feature updates the store', (await page.evaluate(() => window.__store['ytc.playbackOn'])) === false);

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

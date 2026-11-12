import { chromium, scriptPath } from './harness.mjs';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const COLLECTION = readFileSync(scriptPath('youtube-custom-collection.user.js'), 'utf8');
const MEMBERS = readFileSync(scriptPath('youtube-hide-members-only.user.js'), 'utf8');

const FIXTURE = `<!doctype html><html><body>
  <ytd-rich-item-renderer id="card">
    <a href="/watch?v=abc">video</a>
    <yt-badge-shape>Members only</yt-badge-shape>
  </ytd-rich-item-renderer>
</body></html>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  if (req.url.startsWith('/top')) {
    res.end('<!doctype html><html><body><iframe id="frame" src="/frame" width="400" height="300"></iframe></body></html>');
    return;
  }
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
  window.__menu = [];
  window.GM_getValue = (k, d) => (k in window.__store ? window.__store[k] : d);
  window.GM_setValue = (k, v) => { window.__store[k] = v; };
  window.GM_deleteValue = (k) => { delete window.__store[k]; };
  window.GM_registerMenuCommand = (name, cb) => { window.__menu.push({ name, cb }); return window.__menu.length; };
  window.GM_unregisterMenuCommand = () => {};
  window.GM_info = { script: { version: '2.7' } };
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
});

await page.goto(`${base}/top`);
await page.waitForTimeout(200);

const frame = page.frames().find((f) => f.url().includes('/frame'));
check('fixture has a same-origin frame', Boolean(frame));

// The collection must not hide feed cards or touch the page from inside a frame
await frame.addScriptTag({ content: COLLECTION });
await page.waitForTimeout(150);
const frameHidden = await frame.evaluate(() => getComputedStyle(document.getElementById('card')).display === 'none' || document.getElementById('card').hasAttribute('data-ytc-off'));
check('collection leaves frame content alone', frameHidden === false);
const frameClasses = await frame.evaluate(() => [...document.documentElement.classList].filter((c) => c.startsWith('ytc-quiet-')).length);
check('collection does not apply quiet classes inside a frame', frameClasses === 0);

// The standalone filter must behave the same way
await frame.addScriptTag({ content: MEMBERS });
await frame.waitForTimeout(150);
const frameMarked = await frame.evaluate(() => document.getElementById('card').hasAttribute('data-ytmp-hidden'));
check('standalone filter leaves frame content alone', frameMarked === false);

// On the top document the same scripts must still work
await page.addScriptTag({ content: COLLECTION });
const topCard = await page.evaluate(() => {
  const card = document.createElement('ytd-rich-item-renderer');
  card.id = 'topcard';
  card.innerHTML = '<a href="/watch?v=xyz">video</a><yt-badge-shape>Members only</yt-badge-shape>';
  document.body.append(card);
  return true;
});
await page.waitForTimeout(200);
const topHidden = await page.evaluate(() => document.getElementById('topcard').hasAttribute('data-ytc-off'));
check('collection still hides members cards in the top document', topCard && topHidden);

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

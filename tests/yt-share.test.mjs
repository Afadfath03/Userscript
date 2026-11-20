import { chromium, scriptPath } from './harness.mjs';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const SCRIPT = readFileSync(scriptPath('youtube-custom-collection.user.js'), 'utf8');

const FIXTURE = `<!doctype html><html><body>
  <video id="player" muted playsinline></video>
  <div id="share"></div>
  <script>
    window.__ytCopied = false;
    Object.defineProperty(document.getElementById('player'), 'currentTime', { value: 75.9, writable: true });
    window.openShare = (url) => {
      const host = document.getElementById('share');
      host.innerHTML = '<yt-copy-link-renderer><input id="share-url"><button id="copy-button">Copy</button></yt-copy-link-renderer>';
      host.querySelector('#share-url').value = url;
      host.querySelector('#copy-button').addEventListener('click', () => { window.__ytCopied = true; });
    };
  </script>
</body></html>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(FIXTURE);
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
let failures = 0;
const check = (name, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!ok) failures++;
};

await ctx.addInitScript(() => {
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  window.__store = {};
  window.__menu = [];
  window.__clip = null;
  let nextId = 0;
  window.GM_getValue = (k, d) => (k in window.__store ? window.__store[k] : d);
  window.GM_setValue = (k, v) => { window.__store[k] = v; };
  window.GM_deleteValue = (k) => { delete window.__store[k]; };
  window.GM_listValues = () => Object.keys(window.__store);
  window.GM_info = { script: { version: '4.0' } };
  window.GM_registerMenuCommand = (name, cb) => { const id = ++nextId; window.__menu.push({ id, name, cb }); return id; };
  window.GM_unregisterMenuCommand = (id) => { window.__menu = window.__menu.filter((m) => m.id !== id); };
  window.GM_setClipboard = (text) => { window.__clip = text; };
});

const page = await ctx.newPage();
page.on('pageerror', (e) => check(`no page error (${e.message})`, false));

const until = async (fn, timeout = 4000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await page.evaluate(fn)) return true;
    await page.waitForTimeout(50);
  }
  return false;
};
const shareValue = () => page.evaluate(() => document.querySelector('#share-url').value);
const menuNames = () => page.evaluate(() => window.__menu.map((m) => m.name));
const menu = (name) => page.evaluate((n) => window.__menu.find((m) => m.name === n)?.cb(), name);

await page.goto(`${base}/watch?v=aaaaaaaaaaa&si=XYZ&pp=abc&t=30`);
await page.addScriptTag({ content: SCRIPT });
await page.waitForTimeout(300);

check('address bar untouched by default', (await page.evaluate(() => location.search)) === '?v=aaaaaaaaaaa&si=XYZ&pp=abc&t=30');
check('menu has the copy-at-time entry', (await menuNames()).includes('Copy link at current time'));

await page.evaluate(() => window.openShare('https://youtu.be/aaaaaaaaaaa?si=XYZ&t=30'));
check('share input loses si', await until(() => document.querySelector('#share-url').value === 'https://youtu.be/aaaaaaaaaaa?t=30'));

await page.evaluate(() => window.openShare('https://youtu.be/aaaaaaaaaaa?list=PL1&index=3&si=a'));
check('playlist params survive', await until(() => document.querySelector('#share-url').value === 'https://youtu.be/aaaaaaaaaaa?list=PL1&index=3'));

await page.evaluate(() => {
  document.querySelector('#share-url').value = 'https://youtu.be/aaaaaaaaaaa?si=Q&t=99';
  document.querySelector('#copy-button').click();
});
check('copy writes the clean link', (await page.evaluate(() => window.__clip)) === 'https://youtu.be/aaaaaaaaaaa?t=99');
check('YouTube copy handler does not run', (await page.evaluate(() => window.__ytCopied)) === false);
check('a toast confirms the copy', await until(() => document.getElementById('ytc-share-toast')?.textContent === 'Link copied'));

await page.evaluate(() => window.openShare('https://example.com/?si=1'));
await page.waitForTimeout(400);
check('foreign links untouched', (await shareValue()) === 'https://example.com/?si=1');

await menu('Copy link at current time');
check('copy at time floors seconds', await until(() => window.__clip === 'https://youtu.be/aaaaaaaaaaa?t=75'));

// The address toggle lives in the feature panel
await menu('YouTube: Custom Collection');
await page.getByRole('button', { name: /^Clean Share Link/ }).click();
await page.getByRole('button', { name: 'Clean address bar' }).click();
check('address toggle comes from the panel row', await until(() => location.search === '?v=aaaaaaaaaaa&t=30'));
check('the toggle is stored', (await page.evaluate(() => window.__store['ytc.shareAddress'])) === true);

await page.locator('#ytc-panel .ytc-back').click();
await page.getByRole('button', { name: /^Backup/ }).click();
await page.locator('#ytc-panel textarea').fill('{"settings":{"shareAddress":false}}');
await page.getByRole('button', { name: /^Import/ }).click();
await page.getByRole('button', { name: /^Press again/ }).click();
check('backup accepts shareAddress', (await page.locator('#ytc-panel .ytc-status').textContent()).startsWith('Imported 1'));
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');

await page.evaluate(() => {
  window.__store['ytc.shareOn'] = false;
  document.dispatchEvent(new Event('ytc-change'));
  window.openShare('https://youtu.be/aaaaaaaaaaa?si=XYZ');
});
await page.waitForTimeout(400);
check('feature off leaves the share input alone', (await shareValue()).includes('si='));
check('menu drops the entry when the feature is off', !(await menuNames()).includes('Copy link at current time'));

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

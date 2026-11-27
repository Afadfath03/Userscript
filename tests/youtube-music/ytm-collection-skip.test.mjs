import { chromium, scriptPath } from '../harness.mjs';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const SCRIPT = readFileSync(scriptPath('youtube-music-custom-collection.user.js'), 'utf8');

const FIXTURE = `<!doctype html><html><body>
  <ytmusic-player-bar>
    <yt-formatted-string class="title"></yt-formatted-string>
    <span class="byline"></span>
    <tp-yt-paper-icon-button class="next-button"></tp-yt-paper-icon-button>
  </ytmusic-player-bar>
  <script>
    window.__next = 0;
    let queue = [];
    let index = 0;
    const bar = document.querySelector('ytmusic-player-bar');
    const show = () => {
      bar.querySelector('.title').textContent = queue[index][0];
      bar.querySelector('.byline').textContent = queue[index][1];
    };
    window.setQueue = (items) => { queue = items; index = 0; show(); };
    bar.querySelector('.next-button').addEventListener('click', () => {
      window.__next++;
      if (index < queue.length - 1) { index++; show(); }
    });
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
  window.__store = { 'ytmc.skipWords': ['live'] };
  window.__menu = [];
  window.GM_getValue = (k, d) => (k in window.__store ? window.__store[k] : d);
  window.GM_setValue = (k, v) => { window.__store[k] = v; };
  window.GM_deleteValue = (k) => { delete window.__store[k]; };
  window.GM_listValues = () => Object.keys(window.__store);
  window.GM_info = { script: { version: '1.1' } };
  window.GM_registerMenuCommand = (name, cb) => { window.__menu.push({ name, cb }); return window.__menu.length; };
  window.GM_unregisterMenuCommand = () => {};
});

const page = await ctx.newPage();
page.on('pageerror', (e) => check(`no page error (${e.message})`, false));

const until = async (fn, timeout = 5000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await page.evaluate(fn)) return true;
    await page.waitForTimeout(100);
  }
  return false;
};
const hubValue = (label) =>
  page.evaluate((l) => {
    const row = [...document.querySelectorAll('#ytmc-panel > button')].find((b) => b.querySelector('span')?.textContent === l);
    return row ? row.querySelector('.ytmc-value')?.textContent : null;
  }, label);
const openHub = () => page.evaluate(() => window.__menu.find((m) => m.name === 'YouTube Music: Custom Collection').cb());

await page.goto(`${base}/`);
await page.evaluate(() => window.setQueue([['Song (Live)', 'A'], ['Remix Me', 'B'], ['Plain', 'C']]));
await page.addScriptTag({ content: SCRIPT });
await page.waitForTimeout(2300);
check('off by default', (await page.evaluate(() => window.__next)) === 0);

await openHub();
await page.waitForTimeout(100);
check('hub shows Off while disabled', (await hubValue('Skip by Keyword')) === 'Off');

await page.getByRole('button', { name: /^Skip by Keyword/ }).click();
check('the editor shows the stored list', (await page.locator('#ytmc-words').inputValue()) === 'live');
await page.locator('#ytmc-words').fill('live\nremix\n\nLIVE');
await page.getByRole('button', { name: 'Save keywords' }).click();
check('save stores the parsed list', JSON.stringify(await page.evaluate(() => window.__store['ytmc.skipWords'])) === '["live","remix"]');
check('save reports the count', (await page.locator('#ytmc-panel .ytmc-status').textContent()) === 'Saved 2 keywords.');

await page.getByRole('button', { name: 'Enabled' }).click();
check('enabled bundle skips a match', await until(() => window.__next >= 1));
check('the next match is skipped too', await until(() => window.__next === 2));

await page.locator('#ytmc-words').fill('live\nremix\nsped up');
await page.keyboard.press('Escape');
check('escape with unsaved words keeps the panel', (await page.locator('#ytmc-panel h2').textContent()) === 'YouTube Music: Skip by Keyword');
check('escape moves focus to Close', await page.evaluate(() => document.activeElement?.classList.contains('ytmc-close')));
await page.keyboard.press('Escape');
await page.waitForTimeout(100);
check('hub summary counts keywords', (await hubValue('Skip by Keyword')) === '2 keywords');

await page.getByRole('button', { name: /^Backup/ }).click();
await page.locator('#ytmc-backup').fill('{"settings":{"skipWords":["a",5],"skipArtist":true}}');
await page.locator('#ytmc-import').click();
await page.locator('#ytmc-import').click();
check('backup rejects a malformed list', (await page.locator('#ytmc-panel .ytmc-status').textContent()).includes('skipped 1'));
check('backup still applies the valid key', (await page.evaluate(() => window.__store['ytmc.skipArtist'])) === true);
check('the malformed list is not stored', JSON.stringify(await page.evaluate(() => window.__store['ytmc.skipWords'])) === '["live","remix"]');

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

import { chromium, scriptPath } from '../harness.mjs';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const SCRIPT = readFileSync(scriptPath('youtube-music-custom-collection.user.js'), 'utf8');

const FIXTURE = `<!doctype html><html><body>
  <video id="player" muted playsinline></video>
  <div id="dialogs"></div>
  <script>
    window.__yes = 0;
    window.__plays = 0;
    const player = document.getElementById('player');
    let paused = true;
    Object.defineProperty(player, 'paused', { get: () => paused });
    player.play = () => { window.__plays++; paused = false; return Promise.resolve(); };
    window.showPrompt = (text, label) => {
      paused = true;
      const host = document.getElementById('dialogs');
      host.innerHTML = '<tp-yt-paper-dialog><ytmusic-you-there-renderer><yt-formatted-string>' + text +
        '</yt-formatted-string><yt-button-renderer><button>' + label + '</button></yt-button-renderer></ytmusic-you-there-renderer></tp-yt-paper-dialog>';
      host.querySelector('button').addEventListener('click', () => { window.__yes++; });
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

const until = async (fn, timeout = 4000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await page.evaluate(fn)) return true;
    await page.waitForTimeout(50);
  }
  return false;
};
const hubValue = (label) =>
  page.evaluate((l) => {
    const row = [...document.querySelectorAll('#ytmc-panel > button')].find((b) => b.querySelector('span')?.textContent === l);
    return row ? row.querySelector('.ytmc-value')?.textContent : null;
  }, label);

await page.goto(`${base}/explore`);
await page.addScriptTag({ content: SCRIPT });
await page.waitForTimeout(200);

await page.evaluate(() => window.showPrompt('Are you still listening?', 'Yes'));
check('bundle answers the prompt', await until(() => window.__yes === 1));
check('bundle resumes playback once', await until(() => window.__plays === 1));

await page.evaluate(() => window.__menu.find((m) => m.name === 'YouTube Music: Custom Collection').cb());
await page.waitForTimeout(100);
check('hub summary reads On', (await hubValue('Dismiss Paused Prompt')) === 'On');

await page.getByRole('button', { name: /^Backup/ }).click();
await page.locator('#ytmc-backup').fill('{"settings":{"pausedOn":true}}');
await page.locator('#ytmc-import').click();
await page.locator('#ytmc-import').click();
check('backup accepts pausedOn', (await page.locator('#ytmc-panel .ytmc-status').textContent()).startsWith('Imported 1'));
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');

await page.evaluate(() => {
  window.__store['ytmc.pausedOn'] = false;
  document.dispatchEvent(new Event('ytmc-change'));
  window.showPrompt('Video paused. Continue watching?', 'Yes');
});
await page.waitForTimeout(1500);
check('bundle respects the feature switch', (await page.evaluate(() => window.__yes)) === 1);

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

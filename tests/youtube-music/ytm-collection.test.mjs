import { chromium, scriptPath } from '../harness.mjs';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const SCRIPT = readFileSync(scriptPath('youtube-music-custom-collection.user.js'), 'utf8');

const FIXTURE = `<!doctype html><html><body>
  <ytmusic-av-toggle is-audio-playback-mode-selected="false" is-video-playback-mode-selected="true">
    <div class="av-toggle">
      <button class="song-button" aria-pressed="false">Song</button>
      <button class="video-button" aria-pressed="true">Video</button>
    </div>
  </ytmusic-av-toggle>
  <video id="player" muted playsinline></video>
  <ytmusic-mealbar-promo-renderer id="mealbar">get premium</ytmusic-mealbar-promo-renderer>
  <ytmusic-carousel-shelf-renderer id="shorts"><div id="title">Shorts</div></ytmusic-carousel-shelf-renderer>
  <ytmusic-carousel-shelf-renderer id="mixes"><div id="title">Song mixes</div></ytmusic-carousel-shelf-renderer>
  <script>
    window.__clicks = 0;
    const toggle = document.querySelector('ytmusic-av-toggle');
    const song = toggle.querySelector('.song-button');
    const player = document.getElementById('player');
    Object.defineProperty(player, 'currentTime', { value: 5, writable: true });
    song.addEventListener('click', () => {
      window.__clicks++;
      toggle.setAttribute('is-audio-playback-mode-selected', 'true');
      toggle.setAttribute('is-video-playback-mode-selected', 'false');
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
  window.GM_deleteValue = (k) => { delete window.__store[k]; };
  window.GM_listValues = () => Object.keys(window.__store);
  window.GM_info = { script: { version: '1.0' } };
  window.GM_registerMenuCommand = (name, cb) => { window.__menu.push({ name, cb }); return window.__menu.length; };
  window.GM_unregisterMenuCommand = () => {};
});

await page.goto(`${base}/watch?v=aaaaaaa`);
await page.addScriptTag({ content: SCRIPT });
await page.waitForTimeout(300);

const menuNames = await page.evaluate(() => window.__menu.map((m) => m.name));
check('one menu entry opens the hub', menuNames.length === 1 && menuNames[0] === 'YouTube Music: Custom Collection');
await page.evaluate(() => window.__menu[0].cb());
await page.waitForTimeout(100);

const panel = page.getByRole('dialog');
check('the hub opens', (await panel.count()) === 1);
const hubText = await panel.innerText();
check(
  'the hub lists both features plus backup, diagnostics and reset',
  ['Prefer Song', 'Quiet Page', 'Backup', 'Diagnostics', 'Reset all settings'].every((label) => hubText.includes(label))
);

// Prefer Song: the bundle carries the same behaviour as the standalone script
check('the toggle starts hidden', (await page.evaluate(() => getComputedStyle(document.querySelector('ytmusic-av-toggle')).display)) === 'none');
await panel.getByRole('button', { name: 'Prefer Song' }).click();
await page.waitForTimeout(100);
const featureText = await panel.innerText();
check('the feature shows its two rows', featureText.includes('Enabled') && featureText.includes('Hide Song/Video toggle'));
check('both rows start on', (await panel.locator('button[aria-pressed="true"]').count()) === 2);

await panel.getByRole('button', { name: 'Enabled' }).click();
await page.waitForTimeout(100);
check('turning the feature off shows the toggle', (await page.evaluate(() => getComputedStyle(document.querySelector('ytmusic-av-toggle')).display)) !== 'none');
await page.waitForTimeout(3000);
check('and stops the switching', (await page.evaluate(() => window.__clicks)) === 0);

await panel.getByRole('button', { name: 'Enabled' }).click();
await page.waitForTimeout(100);
const switched = await page.evaluate(async () => {
  const start = Date.now();
  while (Date.now() - start < 8000) {
    if (window.__clicks > 0) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
});
check('turning it back on resumes the switching', switched);

// Quiet Page: both switches drive the page
await panel.getByRole('button', { name: 'Back' }).click();
await page.waitForTimeout(100);
await panel.getByRole('button', { name: 'Quiet Page' }).click();
await page.waitForTimeout(150);
const display = (selector) =>
  page.evaluate((sel) => getComputedStyle(document.querySelector(sel)).display, selector);
check('the promo starts hidden', (await display('#mealbar')) === 'none');
check('the Shorts shelf starts hidden', (await display('#shorts')) === 'none');
await panel.getByRole('button', { name: 'Hide promo banners' }).click();
await page.waitForTimeout(150);
check('the promo switch restores the banner', (await display('#mealbar')) !== 'none');
check('and leaves the Shorts shelf hidden', (await display('#shorts')) === 'none');

// Backup: the button says what will happen before the second press
await panel.getByRole('button', { name: 'Back' }).click();
await page.waitForTimeout(100);
await panel.getByRole('button', { name: 'Backup' }).click();
await page.waitForTimeout(100);
await panel.locator('#ytmc-backup').fill(JSON.stringify({ script: 'youtube-music-custom-collection', format: 1, settings: { shorts: false, nonsense: true } }));
await page.waitForTimeout(100);
const importButton = panel.locator('#ytmc-import');
check('the import button counts the valid keys', (await importButton.innerText()).includes('Import 1 setting'));
await importButton.click();
await page.waitForTimeout(100);
check('the first press only arms it', (await importButton.innerText()).includes('Press again'));
await importButton.click();
await page.waitForTimeout(150);
check('the import reports what it did', (await panel.innerText()).includes('Imported 1, skipped 1'));
check('the imported value reaches the page', (await display('#shorts')) !== 'none');
check('the stored key is the bundle prefix', (await page.evaluate(() => window.__store['ytmc.shorts'])) === false);

// Diagnostics reads the same state the panel shows
await panel.getByRole('button', { name: 'Back' }).click();
await page.waitForTimeout(100);
await panel.getByRole('button', { name: 'Diagnostics' }).click();
await page.waitForTimeout(100);
check('diagnostics lists six rows', (await panel.locator('.ytmc-info').count()) === 6);
check('diagnostics names the script and version', (await panel.innerText()).includes('youtube-music-custom-collection') && (await panel.innerText()).includes('1.0'));

// Reset is a two-press action, and Escape leaves the panel
await panel.getByRole('button', { name: 'Back' }).click();
await page.waitForTimeout(100);
const reset = panel.getByRole('button', { name: 'Reset all settings' });
await reset.click();
await page.waitForTimeout(100);
check('the first reset press only arms it', (await panel.innerText()).includes('Press again to delete every setting'));
await panel.getByRole('button', { name: 'Press again to delete every setting' }).click();
await page.waitForTimeout(150);
check('the second press clears every key', (await page.evaluate(() => Object.keys(window.__store).filter((k) => k.startsWith('ytmc.')).length)) === 0);

await page.keyboard.press('Escape');
await page.waitForTimeout(100);
check('Escape closes the panel', (await page.getByRole('dialog').count()) === 0);

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

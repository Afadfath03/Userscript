import { chromium, scriptPath } from './harness.mjs';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const SCRIPT = readFileSync(scriptPath('youtube-custom-collection.user.js'), 'utf8');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end('<!doctype html><html><body><div id="feed"></div></body></html>');
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
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
const page = await ctx.newPage();
page.on('pageerror', (e) => check(`no page error (${e.message})`, false));

await page.addInitScript(() => {
  window.__store = {
    'ytc.speed': 1.5,
    'ytc.quality': 'hd1080',
    'ytc.peopleOn': false,
    'ytc.bogus': 1,
  };
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

const menuNames = await page.evaluate(() => window.__menu.map((m) => m.name));
check('menu has a single entry', menuNames.length === 1);

await page.evaluate(() => window.__menu[0].cb());
await page.waitForTimeout(100);
await page.getByRole('button', { name: 'Backup' }).click();
await page.waitForTimeout(100);
check('panel opens on the backup view', (await page.locator('#ytc-panel h2').textContent()) === 'Backup');
check('panel has a textarea', (await page.locator('#ytc-panel textarea').count()) === 1);

await page.getByRole('button', { name: 'Copy settings JSON' }).click();
await page.waitForTimeout(100);
const exported = JSON.parse(await page.locator('#ytc-panel textarea').inputValue());
check('export wraps settings', exported.script === 'youtube-custom-collection' && exported.format === 1);
check('export includes known keys', exported.settings.speed === 1.5 && exported.settings.quality === 'hd1080' && exported.settings.peopleOn === false);
check('export drops unknown keys', !('bogus' in exported.settings));
const clip = await page.evaluate(() => navigator.clipboard.readText());
check('clipboard holds the JSON', clip === JSON.stringify(exported, null, 2));
check('status reports the copy', (await page.locator('#ytc-panel .ytc-status').textContent()) === 'Copied to clipboard.');

await page.evaluate(() => { window.__store = {}; });
await page.locator('#ytc-panel textarea').fill(
  JSON.stringify({
    script: 'youtube-custom-collection',
    format: 1,
    settings: { speed: 2, peopleOn: true, quality: 'ultra', bogus: 5, jumpOn: 'yes' },
  })
);
await page.getByRole('button', { name: 'Import from the box' }).click();
await page.waitForTimeout(100);
const store = await page.evaluate(() => window.__store);
check('import applies valid keys', store['ytc.speed'] === 2 && store['ytc.peopleOn'] === true);
check('import skips invalid values', store['ytc.quality'] === undefined);
check('import skips unknown keys', store['ytc.bogus'] === undefined && store['ytc.jumpOn'] === undefined);
check(
  'status names the applied count and the skipped keys',
  (await page.locator('#ytc-panel .ytc-status').textContent()) ===
    'Imported 2, skipped 3 unknown or invalid: quality, bogus, jumpOn.'
);

await page.locator('#ytc-panel textarea').fill('{ not json');
await page.getByRole('button', { name: 'Import from the box' }).click();
await page.waitForTimeout(50);
check('broken JSON is reported', (await page.locator('#ytc-panel .ytc-status').textContent()) === 'That is not valid JSON.');

await page.locator('#ytc-panel textarea').fill('{"script":"x"}');
await page.getByRole('button', { name: 'Import from the box' }).click();
await page.waitForTimeout(50);
check('missing settings object is reported', (await page.locator('#ytc-panel .ytc-status').textContent()) === 'That JSON has no settings object.');

await page.locator('#ytc-panel textarea').focus();
await page.keyboard.press('Tab');
check('Tab moves from the textarea to the import button', await page.evaluate(() => document.activeElement.textContent === 'Import from the box'));

await page.keyboard.press('Escape');
await page.waitForTimeout(50);
check('Escape closes the panel', (await page.locator('#ytc-panel').count()) === 0);

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

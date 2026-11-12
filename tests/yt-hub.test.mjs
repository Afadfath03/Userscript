import { chromium, scriptPath } from './harness.mjs';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const SCRIPT = readFileSync(scriptPath('youtube-custom-collection.user.js'), 'utf8');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end('<!doctype html><html><body></body></html>');
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
  window.__store = {};
  window.__menu = [];
  window.GM_getValue = (k, d) => (k in window.__store ? window.__store[k] : d);
  window.GM_setValue = (k, v) => { window.__store[k] = v; };
  window.GM_deleteValue = (k) => { delete window.__store[k]; };
  window.GM_registerMenuCommand = (name, cb) => { window.__menu.push({ name, cb }); return window.__menu.length; };
  window.GM_unregisterMenuCommand = () => {};
  window.GM_info = { script: { version: '2.5' } };
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
});

await page.goto(`${base}/watch?v=abc`);
await page.addScriptTag({ content: SCRIPT });
await page.waitForTimeout(150);

const title = () => page.locator('#ytc-panel h2').first().textContent();
const openHub = () => page.evaluate(() => window.__menu[0].cb());
const back = () => page.getByRole('button', { name: 'Back', exact: true }).click();

const menu = await page.evaluate(() => window.__menu.map((m) => m.name));
check('menu has exactly one entry', menu.length === 1);
check('entry is named after the script', menu[0] === 'YouTube: Custom Collection');

await openHub();
await page.waitForTimeout(100);
check('hub opens from the single entry', (await title()) === 'YouTube: Custom Collection');
check('hub button count is eight features plus backup, diagnostics, reset and close', (await page.locator('#ytc-panel button').count()) === 12);
check('hub rows carry chevrons', (await page.locator('#ytc-panel .ytc-chevron').count()) === 10);
check('hub has no back button', (await page.getByRole('button', { name: 'Back', exact: true }).count()) === 0);
check('backdrop uses a solid scrim, no blur', await page.evaluate(() =>
  getComputedStyle(document.getElementById('ytc-backdrop')).backdropFilter === 'none'
));

await page.getByRole('button', { name: 'Playback Defaults' }).click();
await page.waitForTimeout(80);
check('feature panel opens from the hub', (await title()) === 'YouTube: Playback Defaults');
check('feature panel has enabled, eight settings, reset, back and close', (await page.locator('#ytc-panel button').count()) === 12);
check('feature panel has a back button', (await page.getByRole('button', { name: 'Back', exact: true }).count()) === 1);

await page.getByRole('button', { name: 'Enabled' }).click();
await page.waitForTimeout(80);
check('toggle writes the feature key', (await page.evaluate(() => window.__store['ytc.playbackOn'])) === false);
check('toggle exposes its state', (await page.getByRole('button', { name: 'Enabled' }).getAttribute('aria-pressed')) === 'false');

await back();
await page.waitForTimeout(80);
check('back returns to the hub', (await title()) === 'YouTube: Custom Collection');
check('hub row reflects the new state', (await page.getByRole('button', { name: 'Playback Defaults' }).textContent()).includes('Off'));

await page.evaluate(() => { window.__store['ytc.speed'] = 1.5; });
await page.getByRole('button', { name: 'Reset all settings' }).click();
await page.waitForTimeout(80);
check('reset asks for a second click', (await page.getByRole('button', { name: /Press again to delete every setting/ }).count()) === 1);
check('reset keeps settings after the first click', (await page.evaluate(() => window.__store['ytc.speed'])) === 1.5);
await page.getByRole('button', { name: /Press again to delete every setting/ }).click();
await page.waitForTimeout(80);
check('second click clears every key', (await page.evaluate(() => Object.keys(window.__store).length)) === 0);
check('hub labels return to their defaults', (await page.getByRole('button', { name: 'Playback Defaults' }).textContent()).includes('Default'));
check('reset button returns to its idle label', (await page.getByRole('button', { name: 'Reset all settings' }).count()) === 1);

await page.getByRole('button', { name: 'Backup' }).click();
await page.waitForTimeout(80);
check('backup opens from the hub', (await title()) === 'Backup');
await page.getByRole('button', { name: /^Copy settings JSON/ }).click();
await page.waitForTimeout(80);
const exported = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
check('backup exports an empty settings object after reset', Object.keys(exported.settings).length === 0);
await back();

await page.getByRole('button', { name: 'Diagnostics' }).click();
await page.waitForTimeout(80);
const info = await page.locator('#ytc-panel .ytc-info').allTextContents();
check('diagnostics shows the version', info.some((t) => t.includes('Version 2.5')));
check('diagnostics shows the feature count', info.some((t) => t.includes('Enabled features 8 of 8')));
await page.getByRole('button', { name: 'Copy report' }).click();
await page.waitForTimeout(80);
const report = await page.evaluate(() => navigator.clipboard.readText());
check('copy report writes the lines', report.startsWith('Script: youtube-custom-collection') && report.includes('Page: /watch'));

check('panel has no horizontal overflow', await page.evaluate(() => {
  const panel = document.getElementById('ytc-panel');
  return panel.scrollWidth === panel.clientWidth;
}));

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

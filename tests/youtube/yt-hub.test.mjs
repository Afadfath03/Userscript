import { chromium, scriptPath } from '../harness.mjs';
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
  window.GM_info = { script: { version: '5.0' } };
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
});

await page.goto(`${base}/watch?v=abc`);
await page.addScriptTag({ content: SCRIPT });
await page.waitForTimeout(150);

const title = () => page.locator('#ytc-panel h2').first().textContent();
const openHub = () => page.evaluate(() => window.__menu[0].cb());
const back = () => page.getByRole('button', { name: 'Back', exact: true }).click();

const menu = await page.evaluate(() => window.__menu.map((m) => m.name));
check('menu has hub, bookmarks, share, playlist tools and liked videos tools', menu.length === 5);
check('first entry is named after the script', menu[0] === 'YouTube: Custom Collection');

await openHub();
await page.waitForTimeout(80);
check('hub opens from its entry', (await title()) === 'YouTube: Custom Collection');
check('hub lists 5 consolidated modules plus backup, diagnostics, reset and close', (await page.locator('#ytc-panel button').count()) === 9);
check('hub rows carry chevrons', (await page.locator('#ytc-panel .ytc-chevron').count()) === 7);

await page.getByRole('button', { name: /Playback Custom/ }).click();
await page.waitForTimeout(80);
check('module panel opens with centered title and breadcrumb', (await title()) === 'Playback Custom');
check('module panel has 4 split sub-sections', (await page.locator('#ytc-panel .ytc-group button').count()) === 4);

await page.getByRole('button', { name: 'Enabled' }).click();
await page.waitForTimeout(80);
check('toggling Enabled off disables sub-sections and writes ytc.playbackOn',
  (await page.evaluate(() => window.__store['ytc.playbackOn'] === false)) &&
  (await page.evaluate(() => [...document.querySelectorAll('#ytc-panel .ytc-group button')].every((b) => b.disabled))));

await back();
await page.waitForTimeout(80);
check('back returns to hub and reflects Off', (await title()) === 'YouTube: Custom Collection' &&
  (await page.getByRole('button', { name: /Playback Custom/ }).textContent()).includes('Off'));

await page.evaluate(() => { window.__store['ytc.speed'] = 1.5; });
await page.getByRole('button', { name: 'Reset all settings' }).click();
await page.waitForTimeout(60);
check('reset asks for a second click', (await page.getByRole('button', { name: 'Click again to reset all settings' }).count()) === 1);
await page.getByRole('button', { name: 'Click again to reset all settings' }).click();
await page.waitForTimeout(80);
check('second click clears every key', (await page.evaluate(() => Object.keys(window.__store).length)) === 0);

await page.getByRole('button', { name: 'Diagnostics' }).click();
await page.waitForTimeout(80);
const info = await page.locator('#ytc-panel .ytc-info').allTextContents();
check('diagnostics shows 5 of 5 enabled modules', info.some((t) => t.includes('Enabled features 5 of 5')));

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

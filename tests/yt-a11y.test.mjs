import { chromium, scriptPath } from './harness.mjs';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const SCRIPT = readFileSync(scriptPath('youtube-custom-collection.user.js'), 'utf8');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end('<!doctype html><html><body><button id="trigger">menu</button></body></html>');
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
  window.GM_registerMenuCommand = (name, cb) => { window.__menu.push({ name, cb }); return window.__menu.length; };
  window.GM_unregisterMenuCommand = () => {};
  window.GM_info = { script: { version: '2.4' } };
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
});

await page.goto(`${base}/watch?v=abc`);
await page.addScriptTag({ content: SCRIPT });
await page.waitForTimeout(150);

const open = (label) => page.evaluate((name) => window.__menu.find((m) => m.name === name).cb(), label);
const dialogLabel = () => page.getAttribute('#ytc-panel', 'aria-label');
const click = (name) => page.getByRole('button', { name, exact: true }).click();

await page.evaluate(() => window.__menu[0].cb());
await page.waitForTimeout(80);
check('hub dialog is labelled after the script', (await dialogLabel()) === 'YouTube: Custom Collection');
await page.getByRole('button', { name: 'Playback Defaults' }).click();
await page.waitForTimeout(60);
check('feature view relabels the dialog', (await dialogLabel()) === 'YouTube: Playback Defaults');
await click('Back');
await page.waitForTimeout(60);
check('back restores the hub label', (await dialogLabel()) === 'YouTube: Custom Collection');
await page.getByRole('button', { name: 'Diagnostics' }).click();
await page.waitForTimeout(60);
check('diagnostics view relabels the dialog', (await dialogLabel()) === 'Diagnostics');
await click('Back');
await page.getByRole('button', { name: 'Backup' }).click();
await page.waitForTimeout(60);
check('backup view relabels the dialog', (await dialogLabel()) === 'Backup');

check('textarea has a visible label', (await page.locator('label[for="ytc-backup"]').textContent()) === 'Settings JSON');

const box = page.locator('#ytc-backup');
await box.fill('{"settings":{"speed":1.5}}');
await box.focus();
await page.keyboard.press('Escape');
await page.waitForTimeout(60);
check('first Escape keeps the panel and the pasted JSON', (await page.locator('#ytc-panel').count()) === 1 && (await box.inputValue()) !== '');
check('first Escape moves focus to the close button', await page.evaluate(() => document.activeElement.className === 'ytc-close'));
await page.keyboard.press('Escape');
await page.waitForTimeout(60);
check('second Escape closes the panel', (await page.locator('#ytc-panel').count()) === 0);

await page.evaluate(() => document.getElementById('trigger').focus());
await page.evaluate(() => window.__menu[0].cb());
await page.waitForTimeout(80);
await page.keyboard.press('Escape');
await page.waitForTimeout(60);
check('focus returns to the element that opened the panel', await page.evaluate(() => document.activeElement.id === 'trigger'));

await page.evaluate(() => window.__menu[0].cb());
await page.waitForTimeout(60);
await page.getByRole('button', { name: 'Quiet Page' }).click();
await page.waitForTimeout(80);
const size = await page.evaluate(() => getComputedStyle(document.querySelector('#ytc-panel .ytc-section')).fontSize);
check('section label is 12px', size === '12px');
const switches = await page.locator('#ytc-panel .ytc-switch').count();
const toggles = await page.locator('#ytc-panel button[aria-pressed]').count();
check('every toggle renders a switch', switches === toggles && toggles === 20);
check('switches are hidden from the accessibility tree', (await page.locator('#ytc-panel .ytc-switch[aria-hidden="true"]').count()) === switches);

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

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
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
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
  window.GM_info = { script: { version: '2.5' } };
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
});

await page.goto(`${base}/watch?v=abc`);
await page.addScriptTag({ content: SCRIPT });
await page.waitForTimeout(150);

// Click through the DOM so the browser does not scroll the row into view first
const clickRow = (text) =>
  page.evaluate((t) => {
    const button = [...document.querySelectorAll('#ytc-panel button')].find((b) =>
      b.textContent.includes(t)
    );
    button.click();
    return button.getAttribute('aria-pressed') ?? button.textContent.trim();
  }, text);

const scrollTop = () => page.evaluate(() => document.getElementById('ytc-panel').scrollTop);
const scrollPanel = (value) => page.evaluate((v) => { document.getElementById('ytc-panel').scrollTop = v; }, value);

await page.evaluate(() => window.__menu[0].cb());
await page.waitForTimeout(80);
await page.getByRole('button', { name: 'Quiet Page' }).click();
await page.waitForTimeout(100);

const scrollable = await page.evaluate(() => {
  const panel = document.getElementById('ytc-panel');
  return panel.scrollHeight > panel.clientHeight;
});
check('quiet panel is tall enough to scroll', scrollable);

await scrollPanel(400);
await page.waitForTimeout(50);
const before = await scrollTop();
check('panel is scrolled down', before > 100);
const afterLabel = await clickRow('Hide miniplayer');
await page.waitForTimeout(100);
check('toggle switched the row on', afterLabel === 'true');
check('panel did not jump to the top', (await scrollTop()) === before);
check('store holds the new value', (await page.evaluate(() => window.__store['ytc.quietMiniplayer'])) === true);

await page.getByRole('button', { name: 'Back', exact: true }).click();
await page.waitForTimeout(80);
await scrollPanel(120);
await page.waitForTimeout(50);
const hubBefore = await scrollTop();
const resetLabel = await clickRow('Reset all settings');
await page.waitForTimeout(80);
check('reset asks for a second click', resetLabel.includes('Press again'));
check('reset does not scroll away', (await scrollTop()) === hubBefore);
check('reset kept the stored settings', (await page.evaluate(() => window.__store['ytc.quietMiniplayer'])) === true);

const confirmed = await clickRow('Press again to delete every setting');
await page.waitForTimeout(80);
check('confirm button returns to its idle label', confirmed.includes('Reset all settings'));
check('reset cleared the keys', (await page.evaluate(() => Object.keys(window.__store).length)) === 0);
check('reset did not scroll away either', (await scrollTop()) === hubBefore);
check('hub row reflects the reset', (await page.getByRole('button', { name: 'Quiet Page' }).textContent()).includes('On'));

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

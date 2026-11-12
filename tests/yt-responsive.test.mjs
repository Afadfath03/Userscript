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

async function openAt(width, height) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check(`${width}px: no page error (${e.message})`, false));
  await page.addInitScript(() => {
    window.__store = {};
    window.__menu = [];
    window.GM_getValue = (k, d) => (k in window.__store ? window.__store[k] : d);
    window.GM_setValue = (k, v) => { window.__store[k] = v; };
    window.GM_deleteValue = (k) => { delete window.__store[k]; };
    window.GM_registerMenuCommand = (name, cb) => { window.__menu.push({ name, cb }); return window.__menu.length; };
    window.GM_unregisterMenuCommand = () => {};
    window.GM_info = { script: { version: '1.5' } };
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  });
  await page.goto(`${base}/watch?v=abc`);
  await page.addScriptTag({ content: SCRIPT });
  await page.waitForTimeout(120);
  return { ctx, page };
}

const open = (page, label) =>
  page.evaluate((name) => window.__menu.find((m) => m.name === name).cb(), label);

const box = (page) =>
  page.evaluate(() => {
    const panel = document.getElementById('ytc-panel');
    const rect = panel.getBoundingClientRect();
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      right: Math.round(rect.right),
      scrollWidth: panel.scrollWidth,
      clientWidth: panel.clientWidth,
    };
  });

for (const [w, h] of [[1440, 900], [1024, 640], [390, 844]]) {
  const expected = Math.round(Math.min(Math.max(320, 0.88 * w), 420));
  const { ctx, page } = await openAt(w, h);

  await page.evaluate(() => window.__menu[0].cb());
  await page.waitForTimeout(100);
  const hub = await box(page);
  check(`${w}px: width is clamp(320, 88vw, 420) = ${expected}`, hub.width === expected);
  check(`${w}px: panel stays inside the viewport`, hub.right <= w);
  check(`${w}px: no horizontal overflow`, hub.scrollWidth === hub.clientWidth);

  await page.getByRole('button', { name: 'Quiet Page' }).click();
  await page.waitForTimeout(80);
  const features = await box(page);
  const expectedHeight = Math.round(Math.min(0.76 * h, 560));
  check(`${w}px: width does not change between views`, features.width === hub.width);
  check(`${w}px: height is fixed at min(76dvh, 560) = ${expectedHeight}`, Math.abs(hub.height - expectedHeight) <= 1);
  check(`${w}px: height does not change between views`, Math.abs(features.height - hub.height) <= 1);
  check(`${w}px: box clips and scrolls instead of growing`, await page.evaluate(() => {
    const panel = document.getElementById('ytc-panel');
    return getComputedStyle(panel).overflowY === 'auto' && panel.scrollHeight >= panel.clientHeight;
  }));

  await page.screenshot({ path: `/tmp/opencode/preview/responsive-${w}.png` });
  await ctx.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

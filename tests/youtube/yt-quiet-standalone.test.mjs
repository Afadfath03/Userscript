import { chromium, scriptPath } from '../harness.mjs';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const SCRIPT = readFileSync(scriptPath('youtube-quiet-page.user.js'), 'utf8');

const FIXTURE = `<!doctype html><html><body>
  <ytd-thumbnail id="thumb"><video id="preview" muted playsinline></video></ytd-thumbnail>
  <div id="movie_player"><video id="main" muted playsinline></video></div>
  <div class="ytp-ce-element" id="card">end screen card</div>
  <div id="cinematics">ambient glow</div>
  <ytd-comments id="comments">comments</ytd-comments>
  <ytd-rich-item-renderer id="member-card"><a href="/watch?v=mem12345">x</a><badge-shape>Members only</badge-shape></ytd-rich-item-renderer>
  <ytd-rich-item-renderer id="nested-member-card"><div id="content"><yt-lockup-view-model id="nested-lockup"><a href="/watch?v=nes12345">x</a><badge-shape>Members only</badge-shape></yt-lockup-view-model></div></ytd-rich-item-renderer>
  <yt-lockup-view-model id="standalone-lockup"><a href="/watch?v=std12345">x</a><badge-shape>Members only</badge-shape></yt-lockup-view-model>
  <ytd-rich-item-renderer id="normal-card"><a href="/watch?v=nor12345">x</a><badge-shape>New</badge-shape></ytd-rich-item-renderer>
  <div id="people-shelf"><span>These people are mentioned in the video</span></div>
  <yt-confirm-dialog-renderer id="paused-dlg">Video paused. Continue watching?<button id="yes-btn">Yes</button></yt-confirm-dialog-renderer>
  <ytd-guide-renderer id="sidebar">
    <ytd-guide-section-renderer id="sec-more"><ytd-guide-entry-renderer><a href="/premium">YouTube Premium</a></ytd-guide-entry-renderer></ytd-guide-section-renderer>
  </ytd-guide-renderer>
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
  window.__paused = [];
  window.__yesClicked = false;
  window.GM_getValue = (k, d) => (k in window.__store ? window.__store[k] : d);
  window.GM_setValue = (k, v) => { window.__store[k] = v; };
  window.GM_deleteValue = (k) => { delete window.__store[k]; };
  window.GM_registerMenuCommand = (name, cb) => { window.__menu.push({ name, cb }); return window.__menu.length; };
  window.GM_unregisterMenuCommand = () => {};
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
});

await page.goto(`${base}/watch?v=abc12345`);
await page.evaluate(() => {
  document.getElementById('yes-btn').addEventListener('click', () => { window.__yesClicked = true; });
  document.getElementById('preview').pause = () => { window.__paused.push('preview'); };
  document.getElementById('main').pause = () => { window.__paused.push('main'); };
});
await page.addScriptTag({ content: SCRIPT });
await page.waitForTimeout(150);

const display = (sel) => page.evaluate((s) => getComputedStyle(document.querySelector(s)).display, sel);

await page.evaluate(() => {
  document.getElementById('preview').dispatchEvent(new Event('playing'));
  document.getElementById('main').dispatchEvent(new Event('playing'));
});
check('previews paused and main player untouched', await page.evaluate(() => window.__paused.includes('preview') && !window.__paused.includes('main')));
check('end screen and ambient hidden by default', (await display('#card')) === 'none' && (await display('#cinematics')) === 'none');
check('Members-only card hidden and normal card visible', (await display('#member-card')) === 'none' && (await display('#normal-card')) !== 'none');
check('nested lockup hides outer ytd-rich-item-renderer and standalone lockup still hides',
  (await display('#nested-member-card')) === 'none' &&
  (await page.locator('#nested-lockup').getAttribute('data-ytqp-member-off')) === null &&
  (await display('#standalone-lockup')) === 'none');
check('People Mentioned shelf hidden by default', (await display('#people-shelf')) === 'none');
check('Dismiss paused prompt clicks Yes by default', await page.evaluate(() => window.__yesClicked === true));

// Open sub-section panel
await page.evaluate(() => window.__menu[window.__menu.length - 1].cb());
await page.waitForTimeout(60);
const subs = await page.locator('#ytqp-panel .ytp-group button span:first-child').allTextContents();
check('panel has 4 sub-sections (Playback, Feed & Cards, Watch & Channel, Sidebar)',
  JSON.stringify(subs) === JSON.stringify(['Playback', 'Feed & Cards', 'Watch & Channel', 'Sidebar']));

await page.getByRole('button', { name: /Sidebar/ }).click();
await page.waitForTimeout(60);
await page.getByRole('button', { name: /Hide More from YouTube/ }).click();
await page.waitForTimeout(60);
check('More from YouTube hides from Sidebar sub-section', (await display('#sec-more')) === 'none');

await page.getByRole('button', { name: 'Back' }).click();
await page.waitForTimeout(60);
await page.getByRole('button', { name: /Enabled/ }).click();
await page.waitForTimeout(60);
check('disabling script restores end screen, Members-only, People Mentioned, and Sidebar',
  (await display('#card')) !== 'none' &&
  (await display('#member-card')) !== 'none' &&
  (await display('#people-shelf')) !== 'none' &&
  (await display('#sec-more')) !== 'none');

// 2-step reset
await page.getByRole('button', { name: 'Reset Quiet Page' }).click();
await page.waitForTimeout(50);
await page.getByRole('button', { name: 'Click again to reset Quiet Page' }).click();
await page.waitForTimeout(60);
check('2-step reset clears keys and restores defaults',
  (await page.evaluate(() => Object.keys(window.__store).length)) === 0 && (await display('#card')) === 'none');

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

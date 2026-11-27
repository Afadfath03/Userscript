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
  <ytd-guide-renderer id="sidebar">
    <ytd-guide-section-renderer id="sec-primary">
      <ytd-guide-entry-renderer id="guide-home"><a href="/">Home</a></ytd-guide-entry-renderer>
      <ytd-guide-entry-renderer id="guide-shorts"><a href="/shorts/">Shorts</a></ytd-guide-entry-renderer>
    </ytd-guide-section-renderer>
    <ytd-guide-section-renderer id="sec-you">
      <ytd-guide-entry-renderer><a href="/feed/history">History</a></ytd-guide-entry-renderer>
      <ytd-guide-entry-renderer><a href="https://studio.youtube.com/channel/UC123/videos">Your videos</a></ytd-guide-entry-renderer>
    </ytd-guide-section-renderer>
    <ytd-guide-section-renderer id="sec-subs">
      <ytd-guide-entry-renderer><a href="/feed/channels">Subscriptions</a></ytd-guide-entry-renderer>
    </ytd-guide-section-renderer>
    <ytd-guide-section-renderer id="sec-more">
      <ytd-guide-entry-renderer><a href="/premium">YouTube Premium</a></ytd-guide-entry-renderer>
      <ytd-guide-entry-renderer><a href="https://music.youtube.com/">YouTube Music</a></ytd-guide-entry-renderer>
    </ytd-guide-section-renderer>
    <ytd-guide-section-renderer id="sec-explore">
      <ytd-guide-entry-renderer><a href="/feed/storefront">Movies</a></ytd-guide-entry-renderer>
      <ytd-guide-entry-renderer><a href="/gaming">Gaming</a></ytd-guide-entry-renderer>
    </ytd-guide-section-renderer>
    <div id="footer">About Copyright</div>
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
  window.GM_getValue = (k, d) => (k in window.__store ? window.__store[k] : d);
  window.GM_setValue = (k, v) => { window.__store[k] = v; };
  window.GM_deleteValue = (k) => { delete window.__store[k]; };
  window.GM_registerMenuCommand = (name, cb) => { window.__menu.push({ name, cb }); return window.__menu.length; };
  window.GM_unregisterMenuCommand = () => {};
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  window.arm = (id) => {
    document.getElementById(id).pause = () => { window.__paused.push(id); };
  };
  window.firePlaying = (id) => document.getElementById(id).dispatchEvent(new Event('playing'));
  window.wasPaused = (id) => window.__paused.includes(id);
});

await page.goto(`${base}/watch?v=abc`);
await page.addScriptTag({ content: SCRIPT });
await page.waitForTimeout(150);

const display = (selector) =>
  page.evaluate((sel) => getComputedStyle(document.querySelector(sel)).display, selector);

// Defaults
await page.evaluate(() => { window.arm('preview'); window.arm('main'); window.firePlaying('preview'); window.firePlaying('main'); });
check('previews paused by default', await page.evaluate(() => window.wasPaused('preview')));
check('main player untouched', (await page.evaluate(() => window.wasPaused('main'))) === false);
check('end screen hidden by default', (await display('#card')) === 'none');
check('ambient hidden by default', (await display('#cinematics')) === 'none');
check('sidebar sections visible by default',
  (await display('#sec-you')) !== 'none' &&
  (await display('#sec-subs')) !== 'none' &&
  (await display('#sec-more')) !== 'none' &&
  (await display('#sec-explore')) !== 'none' &&
  (await display('#footer')) !== 'none'
);

// Open panel from menu and toggle sidebar sections
await page.evaluate(() => window.__menu[window.__menu.length - 1].cb());
await page.waitForTimeout(80);
const groups = await page.locator('#ytqp-panel .ytqp-section').allTextContents();
check('panel has Playback, Sections and Sidebar groups',
  groups.includes('Playback') && groups.includes('Sections') && groups.includes('Sidebar')
);

await page.getByRole('button', { name: 'Hide More from YouTube' }).click();
await page.waitForTimeout(80);
check('More from YouTube hides from panel toggle', (await display('#sec-more')) === 'none');
check('You section stays visible when More is hidden', (await display('#sec-you')) !== 'none');

await page.getByRole('button', { name: 'Hide Explore section' }).click();
await page.waitForTimeout(80);
check('Explore hides from panel toggle', (await display('#sec-explore')) === 'none');

await page.getByRole('button', { name: 'Hide You section' }).click();
await page.getByRole('button', { name: 'Hide Subscriptions section' }).click();
await page.getByRole('button', { name: 'Hide sidebar footer' }).click();
await page.waitForTimeout(80);
check('You, Subscriptions and footer hide',
  (await display('#sec-you')) === 'none' &&
  (await display('#sec-subs')) === 'none' &&
  (await display('#footer')) === 'none'
);
check('Primary section stays visible', (await display('#sec-primary')) !== 'none');

// Master toggle off restores everything
await page.getByRole('button', { name: 'Enabled' }).click();
await page.waitForTimeout(80);
check('disabling script restores end screen and sidebar',
  (await display('#card')) !== 'none' &&
  (await display('#sec-more')) !== 'none' &&
  (await display('#sec-explore')) !== 'none'
);

// Reset restores defaults
await page.getByRole('button', { name: 'Reset to defaults' }).click();
await page.waitForTimeout(80);
check('reset clears stored keys and restores default state',
  (await page.evaluate(() => Object.keys(window.__store).length)) === 0 &&
  (await display('#card')) === 'none' &&
  (await display('#sec-more')) !== 'none'
);

await page.getByRole('button', { name: 'Close' }).click();
await page.waitForTimeout(50);
check('close removes panel', (await page.locator('#ytqp-panel').count()) === 0);

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

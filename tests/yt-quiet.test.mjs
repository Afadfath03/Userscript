import { chromium, scriptPath } from './harness.mjs';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const SCRIPT = readFileSync(scriptPath('youtube-custom-collection.user.js'), 'utf8');

const FIXTURE = `<!doctype html><html><body>
  <ytd-thumbnail id="thumb"><video id="preview" muted playsinline></video></ytd-thumbnail>
  <div id="movie_player"><video id="main" muted playsinline></video></div>
  <div class="ytp-ce-element" id="card">end screen card</div>
  <div id="cinematics">ambient glow</div>
  <ytd-reel-shelf-renderer id="shelf">shorts</ytd-reel-shelf-renderer>
  <ytd-rich-section-renderer id="section"><ytd-reel-shelf-renderer>shorts</ytd-reel-shelf-renderer></ytd-rich-section-renderer>
  <ytd-comments id="comments">comments</ytd-comments>
  <ytd-live-chat-frame id="chat">chat</ytd-live-chat-frame>
  <ytd-mealbar-promo-renderer id="promo">promo</ytd-mealbar-promo-renderer>
  <div id="merch-shelf">merch</div>
  <ytd-guide-renderer id="sidebar">
    <ytd-guide-section-renderer id="sec-primary">
      <ytd-guide-entry-renderer id="guide-home"><a href="/">Home</a></ytd-guide-entry-renderer>
      <ytd-guide-entry-renderer id="guide"><a href="/shorts/">Shorts</a></ytd-guide-entry-renderer>
    </ytd-guide-section-renderer>
    <ytd-guide-section-renderer id="sec-you">
      <ytd-guide-entry-renderer><a href="/feed/history">History</a></ytd-guide-entry-renderer>
      <ytd-guide-entry-renderer><a href="https://studio.youtube.com/channel/UC123/videos">Your videos</a></ytd-guide-entry-renderer>
    </ytd-guide-section-renderer>
    <ytd-guide-collapsible-section-entry-renderer id="sec-you-collapsible">
      <a href="/feed/you">You</a>
    </ytd-guide-collapsible-section-entry-renderer>
    <ytd-guide-section-renderer id="sec-subs">
      <ytd-guide-entry-renderer><a href="/feed/channels">Subscriptions</a></ytd-guide-entry-renderer>
    </ytd-guide-section-renderer>
    <ytd-guide-section-renderer id="sec-more">
      <ytd-guide-entry-renderer><a href="/premium">YouTube Premium</a></ytd-guide-entry-renderer>
      <ytd-guide-entry-renderer><a href="https://music.youtube.com/">YouTube Music</a></ytd-guide-entry-renderer>
      <ytd-guide-entry-renderer><a href="https://www.youtubekids.com/">YouTube Kids</a></ytd-guide-entry-renderer>
      <ytd-guide-entry-renderer><a href="/new">YouTube Labs</a></ytd-guide-entry-renderer>
    </ytd-guide-section-renderer>
    <ytd-guide-section-renderer id="sec-explore">
      <ytd-guide-entry-renderer><a href="/channel/UC-9-kyTW8ZkZNDHQJ6FgpwQ">Music</a></ytd-guide-entry-renderer>
      <ytd-guide-entry-renderer><a href="/feed/storefront?bp=ogUCKAI%3D">Movies</a></ytd-guide-entry-renderer>
      <ytd-guide-entry-renderer><a href="/gaming">Gaming</a></ytd-guide-entry-renderer>
    </ytd-guide-section-renderer>
    <div id="footer">About Copyright</div>
  </ytd-guide-renderer>
  <ytd-donation-shelf-renderer id="donation">donation</ytd-donation-shelf-renderer>
  <ytd-feed-filter-chip-bar-renderer id="chips">chips</ytd-feed-filter-chip-bar-renderer>
  <ytd-rich-item-renderer id="postcard"><ytd-post-renderer>post</ytd-post-renderer></ytd-rich-item-renderer>
  <ytd-clarification-renderer id="clarification">info</ytd-clarification-renderer>
  <ytd-playlist-panel-renderer id="playlist">playlist</ytd-playlist-panel-renderer>
  <ytd-feed-nudge-renderer id="nudge">nudge</ytd-feed-nudge-renderer>
  <ytd-channel-video-player-renderer id="chvideo">featured</ytd-channel-video-player-renderer>
  <div class="ytp-suggested-action" id="suggested">bubble</div>
  <ytd-info-panel-container-renderer id="bigpanel">panel</ytd-info-panel-container-renderer>
  <ytd-miniplayer id="miniplayer">mini</ytd-miniplayer>
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
  window.GM_info = { script: { version: '2.2' } };
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
const set = (key, value) =>
  page.evaluate(([k, v]) => {
    window.__store[k] = v;
    document.dispatchEvent(new Event('ytc-change'));
  }, [key, value]);

await page.evaluate(() => window.__menu[0].cb());
await page.waitForTimeout(80);
await page.getByRole('button', { name: 'Quiet Page' }).click();
await page.waitForTimeout(80);
check('panel lists enabled, twenty-four levers, reset, back and close', (await page.locator('#ytc-panel button').count()) === 28);
const onCount = await page.locator('#ytc-panel button[aria-pressed="true"]').count();
const offCount = await page.locator('#ytc-panel button[aria-pressed="false"]').count();
check('four rows start on: Enabled plus three playback levers', onCount === 4);
check('twenty-one section and sidebar rows start off', offCount === 21);
const groups = await page.locator('#ytc-panel .ytc-section').allTextContents();
check('rows are grouped', groups.includes('Playback') && groups.includes('Sections') && groups.includes('Sidebar') && !groups.includes('Settings'));
await page.getByRole('button', { name: 'Close' }).click();

// Defaults: playback levers on, every section visible
await page.evaluate(() => { window.arm('preview'); window.arm('main'); window.firePlaying('preview'); window.firePlaying('main'); });
check('previews are still paused by default', await page.evaluate(() => window.wasPaused('preview')));
check('main player is untouched', (await page.evaluate(() => window.wasPaused('main'))) === false);
check('end screen hidden by default', (await display('#card')) === 'none');
check('ambient hidden by default', (await display('#cinematics')) === 'none');

const sections = ['#shelf', '#section', '#comments', '#chat', '#promo', '#merch-shelf', '#guide',
  '#sec-primary', '#sec-you', '#sec-you-collapsible', '#sec-subs', '#sec-more', '#sec-explore', '#footer',
  '#donation', '#chips', '#postcard', '#clarification', '#playlist', '#nudge', '#chvideo',
  '#suggested', '#bigpanel', '#miniplayer'];
const visible = [];
for (const sel of sections) visible.push([sel, await display(sel)]);
check('every section is visible by default', visible.every(([, d]) => d !== 'none'));

// Turning a section on hides only that section
await set('ytc.quietComments', true);
await page.waitForTimeout(80);
check('comments hide when switched on', (await display('#comments')) === 'none');
check('other sections stay visible', (await display('#chat')) !== 'none' && (await display('#shelf')) !== 'none');

await set('ytc.quietShorts', true);
await page.waitForTimeout(80);
check('shorts shelf hides when switched on', (await display('#shelf')) === 'none');
check('shorts wrapper hides too', (await display('#section')) === 'none');

// Sidebar sections toggle independently without affecting Primary or You
await set('ytc.quietSidebarMore', true);
await page.waitForTimeout(80);
check('More from YouTube hides when switched on', (await display('#sec-more')) === 'none');
check('You section with studio link stays visible', (await display('#sec-you')) !== 'none');
check('Explore stays visible when only More is hidden', (await display('#sec-explore')) !== 'none');

await set('ytc.quietSidebarExplore', true);
await page.waitForTimeout(80);
check('Explore hides when switched on', (await display('#sec-explore')) === 'none');

await set('ytc.quietSidebarYou', true);
await set('ytc.quietSidebarSubscriptions', true);
await set('ytc.quietSidebarFooter', true);
await page.waitForTimeout(80);
check('You sections hide when switched on', (await display('#sec-you')) === 'none' && (await display('#sec-you-collapsible')) === 'none');
check('Subscriptions hides when switched on', (await display('#sec-subs')) === 'none');
check('sidebar footer hides when switched on', (await display('#footer')) === 'none');
check('Primary section stays visible', (await display('#sec-primary')) !== 'none');

await set('ytc.quietComments', false);
await page.waitForTimeout(80);
check('switching a section off restores it', (await display('#comments')) !== 'none');

// Feature off clears even the default-on levers
await set('ytc.quietOn', false);
await page.waitForTimeout(80);
check('feature off clears the playback classes', (await page.evaluate(() => [...document.documentElement.classList].filter((c) => c.startsWith('ytc-quiet-')).length)) === 0);
check('feature off restores the end screen', (await display('#card')) !== 'none');
await page.evaluate(() => { window.__paused = []; window.firePlaying('preview'); });
check('feature off leaves previews alone', (await page.evaluate(() => window.wasPaused('preview'))) === false);

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

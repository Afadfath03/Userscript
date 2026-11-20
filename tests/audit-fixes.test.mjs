import { chromium, scriptPath } from './harness.mjs';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const COLLECTION = readFileSync(scriptPath('youtube-custom-collection.user.js'), 'utf8');
const RESOLUTION = readFileSync(scriptPath('youtube-preferred-resolution.user.js'), 'utf8');
const SHORTS = readFileSync(scriptPath('youtube-shorts-to-watch.user.js'), 'utf8');
const EXPAND = readFileSync(scriptPath('youtube-expand-description.user.js'), 'utf8');
const PEOPLE = readFileSync(scriptPath('youtube-hide-people-mentioned.user.js'), 'utf8');
const PAUSED = readFileSync(scriptPath('youtube-dismiss-paused-prompt.user.js'), 'utf8');
const PLAYBACK = readFileSync(scriptPath('youtube-playback-defaults.user.js'), 'utf8');
const TIMER_TAMER = readFileSync(scriptPath('youtube-timer-tamer.user.js'), 'utf8');

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

async function openPage(script, store = {}, path = '/watch?v=vidA', html = '') {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check(`no page error (${e.message})`, false));
  await page.addInitScript((initial) => {
    window.__store = { ...initial };
    window.__menu = [];
    window.GM_getValue = (k, d) => (k in window.__store ? window.__store[k] : d);
    window.GM_setValue = (k, v) => { window.__store[k] = v; };
    window.GM_deleteValue = (k) => { delete window.__store[k]; };
    window.GM_listValues = () => Object.keys(window.__store);
    window.GM_registerMenuCommand = (name, cb) => { window.__menu.push({ name, cb }); return window.__menu.length; };
    window.GM_unregisterMenuCommand = () => {};
    window.GM_info = { script: { version: '3.9' } };
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  }, store);
  await page.goto(`${base}${path}`);
  if (html) await page.setContent(html);
  await page.addScriptTag({ content: script });
  await page.waitForTimeout(100);
  return { ctx, page };
}

// 1. Collection: playback applies subtitles & audio even when theater clicks
{
  const html = `<!doctype html><html><body>
    <ytd-watch-flexy></ytd-watch-flexy>
    <div id="movie_player"><video></video></div>
    <button class="ytp-size-button"></button>
    <button class="ytp-subtitles-button" aria-pressed="false"></button>
  </body></html>`;
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check(`no page error (${e.message})`, false));
  await page.addInitScript((initial) => {
    window.__store = { ...initial };
    window.__menu = [];
    window.GM_getValue = (k, d) => (k in window.__store ? window.__store[k] : d);
    window.GM_setValue = (k, v) => { window.__store[k] = v; };
    window.GM_deleteValue = (k) => { delete window.__store[k]; };
    window.GM_listValues = () => Object.keys(window.__store);
    window.GM_registerMenuCommand = (name, cb) => { window.__menu.push({ name, cb }); return window.__menu.length; };
    window.GM_unregisterMenuCommand = () => {};
    window.GM_info = { script: { version: '3.9' } };
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  }, {
    'ytc.playbackOn': true,
    'ytc.theater': 'on',
    'ytc.subtitles': 'on',
    'ytc.audio': 'original',
  });
  await page.goto(`${base}/watch?v=vidA`);
  await page.setContent(html);
  await page.evaluate(() => {
    window.__audioSet = null;
    const p = document.getElementById('movie_player');
    p.getAvailableAudioTracks = () => [{ id: 'orig' }, { id: 'dub' }];
    p.getAudioTrack = () => ({ id: 'dub' });
    p.setAudioTrack = (t) => { window.__audioSet = t.id; };
    window.__subClicks = 0;
    document.querySelector('.ytp-subtitles-button').addEventListener('click', () => { window.__subClicks++; });
  });
  await page.addScriptTag({ content: COLLECTION });
  await page.waitForTimeout(150);
  const res = await page.evaluate(() => ({ sub: window.__subClicks, audio: window.__audioSet }));
  check('collection: playback applies subtitles and audio even when theater clicks', res.sub >= 1 && res.audio === 'orig');
  await ctx.close();
}

// 2. Collection: autoplay wait timer cancels if disabled mid-wait
{
  const html = `<!doctype html><html><body>
    <div id="movie_player"><video></video></div>
    <button class="ytp-autonav-toggle-button" aria-checked="true"></button>
    <div id="related"><ytd-compact-video-renderer><a href="/watch?v=vidB">next</a></ytd-compact-video-renderer></div>
  </body></html>`;
  const { ctx, page } = await openPage(COLLECTION, {
    'ytc.autoplayOn': true,
    'ytc.behavior': 'wait',
    'ytc.delay': 1,
  }, '/watch?v=vidA', html);
  await page.evaluate(() => {
    window.__nextClicked = false;
    document.querySelector('#related a').addEventListener('click', (e) => {
      e.preventDefault();
      window.__nextClicked = true;
    });
    document.querySelector('#movie_player video').dispatchEvent(new Event('ended'));
    window.GM_setValue('ytc.autoplayOn', false);
    document.dispatchEvent(new CustomEvent('ytc-change'));
  });
  await page.waitForTimeout(1200);
  check('collection: autoplay wait cancels when disabled mid-wait', await page.evaluate(() => !window.__nextClicked));
  await ctx.close();
}

// 3. Collection: expand description works on SPA round-trip to same video
{
  const html = `<!doctype html><html><body>
    <div id="description-inline-expander"><button id="expand">more</button></div>
  </body></html>`;
  const { ctx, page } = await openPage(COLLECTION, { 'ytc.expandOn': true }, '/watch?v=vidA', html);
  await page.evaluate(() => {
    window.__expandCount = 0;
    const btn = document.getElementById('expand');
    btn.addEventListener('click', () => {
      window.__expandCount++;
      btn.hidden = true;
    });
    document.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    history.pushState({}, '', '/');
    document.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await page.waitForTimeout(80);
  await page.evaluate(() => {
    document.getElementById('expand').hidden = false;
    history.pushState({}, '', '/watch?v=vidA');
    document.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await page.waitForTimeout(100);
  check('collection: expand description re-runs on SPA round-trip to same video', await page.evaluate(() => window.__expandCount >= 1 && document.getElementById('expand').hidden));
  await ctx.close();
}

// 4. Collection: shorts DOM link rewriting + parseExport array rejection + arming reset
{
  const html = `<!doctype html><html><body>
    <a id="slink" href="/shorts/abcdefghijk?t=42">short</a>
  </body></html>`;
  const { ctx, page } = await openPage(COLLECTION, { 'ytc.shortsOn': true }, '/feed/subscriptions', html);
  check('collection: shorts rewrites DOM link href when enabled', await page.evaluate(() => document.getElementById('slink').getAttribute('href') === '/watch?v=abcdefghijk&t=42'));
  await page.evaluate(() => window.__menu[0].cb());
  await page.waitForTimeout(80);
  await page.click('#ytc-panel button:has-text("Reset all settings")');
  await page.click('#ytc-panel .ytc-close');
  await page.evaluate(() => window.__menu[0].cb());
  await page.waitForTimeout(80);
  const resetText = await page.textContent('#ytc-panel button:has-text("Reset all settings")');
  check('collection: closing panel clears resetArmed state', resetText === 'Reset all settings');
  await page.click('#ytc-panel button:has-text("Backup")');
  await page.fill('#ytc-backup', '{"settings":[]}');
  await page.click('#ytc-import');
  const errText = await page.textContent('#ytc-panel .ytc-status');
  check('collection: parseExport rejects array settings', /no settings object/i.test(errText || ''));
  await ctx.close();
}

// 5. Standalone: preferred-resolution waits through ad-showing
{
  const html = `<!doctype html><html><body><div id="movie_player" class="ad-showing"></div></body></html>`;
  const { ctx, page } = await openPage(RESOLUTION, { quality: 'hd1080' }, '/watch?v=vidA', html);
  await page.evaluate(() => {
    window.__setQ = null;
    const p = document.getElementById('movie_player');
    p.getAvailableQualityLevels = () => ['hd1080', 'hd720'];
    p.getPlaybackQuality = () => window.__setQ || 'hd720';
    p.setPlaybackQualityRange = (q) => { window.__setQ = q; };
  });
  await page.waitForTimeout(5200);
  await page.evaluate(() => document.getElementById('movie_player').classList.remove('ad-showing'));
  await page.waitForTimeout(600);
  check('standalone resolution: applies after ad > 4.8s ends', await page.evaluate(() => window.__setQ === 'hd1080'));
  await ctx.close();
}

// 6. Standalone: shorts-to-watch DOM link rewriting
{
  const html = `<!doctype html><html><body><a id="slink" href="/shorts/abcdefghijk?t=15">short</a></body></html>`;
  const { ctx, page } = await openPage(SHORTS, { 'ytsw.on': true }, '/feed/subscriptions', html);
  check('standalone shorts: rewrites DOM link href when enabled', await page.evaluate(() => document.getElementById('slink').getAttribute('href') === '/watch?v=abcdefghijk&t=15'));
  await ctx.close();
}

// 7. Standalone: expand-description round-trip
{
  const html = `<!doctype html><html><body><div id="description-inline-expander"><button id="expand">more</button></div></body></html>`;
  const { ctx, page } = await openPage(EXPAND, {}, '/watch?v=vidA', html);
  await page.evaluate(() => {
    const btn = document.getElementById('expand');
    btn.addEventListener('click', () => { btn.hidden = true; });
    window.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    history.pushState({}, '', '/');
    window.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await page.waitForTimeout(60);
  await page.evaluate(() => {
    document.getElementById('expand').hidden = false;
    history.pushState({}, '', '/watch?v=vidA');
    window.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await page.waitForTimeout(100);
  check('standalone expand: re-expands on SPA round-trip', await page.evaluate(() => document.getElementById('expand').hidden));
  await ctx.close();
}

// 8. Standalone: hide-people-mentioned
{
  const html = `<!doctype html><html><body><div id="below">
    <ytd-horizontal-card-list-renderer id="people"><span>These people are mentioned in the video</span></ytd-horizontal-card-list-renderer>
  </div></body></html>`;
  const { ctx, page } = await openPage(PEOPLE, {}, '/watch?v=vidA', html);
  await page.waitForTimeout(100);
  check('standalone people: hides mentioned shelf', await page.evaluate(() => getComputedStyle(document.getElementById('people')).display === 'none'));
  await ctx.close();
}

// 9. Standalone: dismiss-paused-prompt
{
  const html = `<!doctype html><html><body>
    <tp-yt-paper-dialog><div>Video paused. Continue watching?</div><button id="yes">Yes</button></tp-yt-paper-dialog>
  </body></html>`;
  const { ctx, page } = await openPage(PAUSED, {}, '/watch?v=vidA', html);
  await page.evaluate(() => {
    window.__yesClicked = false;
    document.getElementById('yes').addEventListener('click', () => { window.__yesClicked = true; });
    const d = document.createElement('tp-yt-paper-dialog');
    d.innerHTML = '<div>Video paused. Continue watching?</div><button id="yes2">Yes</button>';
    d.querySelector('#yes2').addEventListener('click', () => { window.__yesClicked = true; });
    document.body.append(d);
  });
  await page.waitForTimeout(100);
  check('standalone paused: clicks Yes on prompt', await page.evaluate(() => window.__yesClicked));
  await ctx.close();
}

// 10. Standalone: playback-defaults pauseBlur
{
  const html = `<!doctype html><html><body><div id="movie_player"><video></video></div></body></html>`;
  const { ctx, page } = await openPage(PLAYBACK, { 'ytpd.pauseBlur': true }, '/watch?v=vidA', html);
  await page.evaluate(() => {
    const v = document.querySelector('video');
    window.__paused = false;
    Object.defineProperty(v, 'paused', { get: () => window.__paused, configurable: true });
    v.pause = () => { window.__paused = true; };
    window.dispatchEvent(new Event('blur'));
  });
  check('standalone playback: pauseBlur pauses video on window blur', await page.evaluate(() => window.__paused));
  await ctx.close();
}

// 11. Standalone: timer-tamer startup timers before timeupdate run directly
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check(`no page error (${e.message})`, false));
  await page.addInitScript(TIMER_TAMER);
  await page.goto(`${base}/`);
  const ranImmediate = await page.evaluate(() => new Promise((resolve) => {
    let rafCalled = false;
    const origRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = (cb) => { rafCalled = true; return origRaf(cb); };
    setTimeout(() => resolve(!rafCalled), 0);
  }));
  check('standalone timer-tamer: startup timers before timeupdate bypass rAF batching', ranImmediate);
  await ctx.close();
}

await browser.close();
server.close();
console.log(`\n${failures ? `${failures} failures` : 'all checks passed'}`);
process.exit(failures ? 1 : 0);

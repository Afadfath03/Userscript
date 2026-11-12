import { chromium, scriptPath } from './harness.mjs';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const SCRIPT = readFileSync(scriptPath('youtube-custom-collection.user.js'), 'utf8');

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end('<!doctype html><html><body><div id="movie_player"></div><div id="feed"></div></body></html>');
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ headless: true });
let failures = 0;
const check = (name, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!ok) failures++;
};

async function open(store = {}) {
  const ctx = await browser.newContext();
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check(`no page error (${e.message})`, false));
  await page.addInitScript((initial) => {
    window.__store = { ...initial };
    window.__calls = [];
    window.__menu = [];
    window.GM_getValue = (k, d) => (k in window.__store ? window.__store[k] : d);
    window.GM_setValue = (k, v) => { window.__store[k] = v; };
    window.GM_deleteValue = (k) => { delete window.__store[k]; };
    window.GM_listValues = () => Object.keys(window.__store);
    window.GM_registerMenuCommand = (name, cb) => { window.__menu.push({ name, cb }); return window.__menu.length; };
    window.GM_unregisterMenuCommand = () => {};
    window.GM_info = { script: { version: '2.8' } };
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  }, store);
  await page.goto(`${base}/watch?v=abc`);
  return { ctx, page };
}

const inject = async (page) => {
  await page.addScriptTag({ content: SCRIPT });
  await page.waitForTimeout(200);
};

// 1. Resolution keeps trying through an ad instead of spending its attempts
{
  const { ctx, page } = await open({ 'ytc.quality': 'hd720' });
  await page.evaluate(() => {
    const player = document.getElementById('movie_player');
    player.classList.add('ad-showing');
    player.getAvailableQualityLevels = () => ['hd720'];
    player.getPlaybackQuality = () => player.__quality || '';
    player.setPlaybackQuality = (code) => { player.__quality = code; window.__calls.push(code); };
    player.setPlaybackQualityRange = () => {};
    setTimeout(() => player.classList.remove('ad-showing'), 1000);
  });
  await inject(page);
  await page.waitForTimeout(1900);
  const applied = await page.evaluate(() => window.__calls.length > 0 && window.__calls.at(-1));
  check('resolution applies after the ad ends', applied === 'hd720');
  await ctx.close();
}

// 2. Preview pausing gives up after three attempts
{
  const { ctx, page } = await open();
  await inject(page);
  const pauses = await page.evaluate(() => {
    const thumb = document.createElement('ytd-thumbnail');
    const video = document.createElement('video');
    let count = 0;
    video.pause = () => { count++; };
    thumb.append(video);
    document.body.append(thumb);
    for (let i = 0; i < 6; i++) video.dispatchEvent(new Event('playing', { bubbles: true }));
    return count;
  });
  check('preview pause stops after three attempts', pauses === 3);
  await ctx.close();
}

// 3. Export keeps keys this version does not know
{
  const { ctx, page } = await open({ 'ytc.quality': 'hd1080', 'ytc.futureKey': { a: 1 } });
  await inject(page);
  await page.evaluate(() => window.__menu[0].cb());
  await page.waitForTimeout(80);
  await page.getByRole('button', { name: 'Backup' }).click();
  await page.waitForTimeout(80);
  await page.getByRole('button', { name: /^Copy settings JSON/ }).click();
  await page.waitForTimeout(80);
  const exported = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  check('export includes unknown stored keys', JSON.stringify(exported.settings.futureKey) === '{"a":1}');
  check('export keeps known keys too', exported.settings.quality === 'hd1080');
  await ctx.close();
}

// 4. Per-feature reset clears only that feature
{
  const { ctx, page } = await open({ 'ytc.speed': 1.5, 'ytc.hotkeys': true, 'ytc.quality': 'hd1080' });
  await inject(page);
  await page.evaluate(() => window.__menu[0].cb());
  await page.waitForTimeout(80);
  await page.getByRole('button', { name: 'Playback Defaults' }).click();
  await page.waitForTimeout(80);
  await page.getByRole('button', { name: 'Reset this feature' }).click();
  await page.waitForTimeout(60);
  check('feature reset asks for a second click', (await page.getByRole('button', { name: /Press again to reset this feature/ }).count()) === 1);
  check('nothing cleared after the first click', await page.evaluate(() => window.__store['ytc.speed'] === 1.5));
  await page.getByRole('button', { name: /Press again to reset this feature/ }).click();
  await page.waitForTimeout(80);
  const store = await page.evaluate(() => window.__store);
  check('feature reset clears its own keys', store['ytc.speed'] === undefined && store['ytc.hotkeys'] === undefined);
  check('feature reset leaves other features alone', store['ytc.quality'] === 'hd1080');
  await ctx.close();
}

// 5. Hub rows summarise the values that matter
{
  const { ctx, page } = await open({ 'ytc.quality': 'hd1080', 'ytc.speed': 1.5, 'ytc.quietComments': true });
  await inject(page);
  await page.evaluate(() => window.__menu[0].cb());
  await page.waitForTimeout(80);
  const texts = await page.locator('#ytc-panel button').allTextContents();
  check('resolution row shows the quality', texts.some((t) => t.includes('Preferred Resolution') && t.includes('1080p')));
  check('playback row shows the speed', texts.some((t) => t.includes('Playback Defaults') && t.includes('1.5x')));
  check('quiet row shows how many switches are on', texts.some((t) => t.includes('Quiet Page') && t.includes('4 on')));
  await ctx.close();
}

// 6. Pause when the window loses focus
{
  const { ctx, page } = await open({ 'ytc.pauseBlur': true });
  await inject(page);
  const paused = await page.evaluate(() => {
    const player = document.getElementById('movie_player');
    const video = document.createElement('video');
    Object.defineProperty(video, 'paused', { value: false });
    let count = 0;
    video.pause = () => { count++; };
    player.append(video);
    window.dispatchEvent(new Event('blur'));
    return count;
  });
  check('blur pauses playback when the switch is on', paused === 1);
  await ctx.close();
}

// 7. A people shelf already on the page is removed at load
{
  const { ctx, page } = await open();
  await page.evaluate(() => {
    const shelf = document.createElement('div');
    shelf.id = 'peopleshelf';
    shelf.textContent = 'These people are mentioned in the video';
    document.body.append(shelf);
  });
  await inject(page);
  await page.waitForTimeout(200);
  const hidden = await page.evaluate(() => getComputedStyle(document.getElementById('peopleshelf')).display === 'none');
  check('people shelf present at load is removed', hidden);
  await ctx.close();
}

// 8. Turning Autoplay Control off hands autoplay back to YouTube
{
  const { ctx, page } = await open({ 'ytc.behavior': 'stop' });
  await page.evaluate(() => {
    const player = document.getElementById('movie_player');
    const toggle = document.createElement('div');
    toggle.className = 'ytp-autonav-toggle-button';
    toggle.setAttribute('aria-checked', 'true');
    toggle.addEventListener('click', () => {
      toggle.setAttribute('aria-checked', toggle.getAttribute('aria-checked') === 'true' ? 'false' : 'true');
    });
    player.append(toggle);
  });
  await inject(page);
  await page.waitForTimeout(400);
  check('managed mode switches autoplay off', (await page.evaluate(() => document.querySelector('.ytp-autonav-toggle-button').getAttribute('aria-checked'))) === 'false');

  await page.evaluate(() => {
    window.__store['ytc.autoplayOn'] = false;
    document.dispatchEvent(new Event('ytc-change'));
  });
  await page.waitForTimeout(200);
  check('disabling the feature switches autoplay back on', (await page.evaluate(() => document.querySelector('.ytp-autonav-toggle-button').getAttribute('aria-checked'))) === 'true');
  await ctx.close();
}

// 9. Every subview uses the header back button
{
  const { ctx, page } = await open();
  await inject(page);
  await page.evaluate(() => window.__menu[0].cb());
  await page.waitForTimeout(80);
  await page.getByRole('button', { name: 'Playback Defaults' }).click();
  await page.waitForTimeout(80);
  await page.getByRole('button', { name: /^Speed/ }).first().click();
  await page.waitForTimeout(80);
  check('options view has the header back button', (await page.getByRole('button', { name: 'Back', exact: true }).count()) === 1);
  check('options view has no text back row', (await page.locator('#ytc-panel button', { hasText: '\u2190 Back' }).count()) === 0);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.waitForTimeout(80);
  check('header back returns to the feature settings', (await page.locator('#ytc-panel h2').first().textContent()) === 'YouTube: Playback Defaults');
  await ctx.close();
}

// 10. A feature without rows is presented as a single switch
{
  const { ctx, page } = await open();
  await inject(page);
  await page.evaluate(() => window.__menu[0].cb());
  await page.waitForTimeout(80);
  await page.getByRole('button', { name: 'Hide People Mentioned' }).click();
  await page.waitForTimeout(80);
  check('row-less panel has no section heading', (await page.locator('#ytc-panel .ytc-section').count()) === 0);
  check('the panel does not hide itself', await page.evaluate(() => {
    const panel = document.getElementById('ytc-panel');
    const backdrop = document.getElementById('ytc-backdrop');
    return panel.getBoundingClientRect().height > 100 && getComputedStyle(backdrop).display !== 'none';
  }));
  check('row-less panel still offers a reset', (await page.getByRole('button', { name: 'Reset this feature' }).count()) === 1);
  await ctx.close();
}

// 11. Diagnostics reports how many Quiet switches are on
{
  const { ctx, page } = await open({ 'ytc.quietComments': true });
  await inject(page);
  await page.evaluate(() => window.__menu[0].cb());
  await page.waitForTimeout(80);
  await page.getByRole('button', { name: 'Diagnostics' }).click();
  await page.waitForTimeout(80);
  const info = await page.locator('#ytc-panel .ytc-info').allTextContents();
  check('diagnostics counts the quiet switches', info.some((t) => t.includes('Quiet switches') && t.includes('4 on')));
  await ctx.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

import { chromium, scriptPath } from '../harness.mjs';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const SCRIPT = readFileSync(scriptPath('youtube-music-prefer-song.user.js'), 'utf8');

const FIXTURE = `<!doctype html><html><body>
  <ytmusic-av-toggle is-audio-playback-mode-selected="false" is-video-playback-mode-selected="true">
    <div class="av-toggle">
      <button class="song-button" aria-pressed="false">Song</button>
      <button class="video-button" aria-pressed="true">Video</button>
    </div>
  </ytmusic-av-toggle>
  <video id="player" muted playsinline></video>
  <script>
    window.__clicks = 0;
    const toggle = document.querySelector('ytmusic-av-toggle');
    const song = toggle.querySelector('.song-button');
    const video = toggle.querySelector('.video-button');
    const player = document.getElementById('player');
    Object.defineProperty(player, 'currentTime', { value: 5, writable: true });
    window.toVideo = () => {
      toggle.setAttribute('is-audio-playback-mode-selected', 'false');
      toggle.setAttribute('is-video-playback-mode-selected', 'true');
      song.setAttribute('aria-pressed', 'false');
      video.setAttribute('aria-pressed', 'true');
    };
    song.addEventListener('click', () => {
      window.__clicks++;
      toggle.setAttribute('is-audio-playback-mode-selected', 'true');
      toggle.setAttribute('is-video-playback-mode-selected', 'false');
      song.setAttribute('aria-pressed', 'true');
      video.setAttribute('aria-pressed', 'false');
    });
  </script>
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

await ctx.addInitScript(() => {
  window.__store = {};
  window.__menu = [];
  window.GM_getValue = (k, d) => (k in window.__store ? window.__store[k] : d);
  window.GM_setValue = (k, v) => { window.__store[k] = v; };
  window.GM_registerMenuCommand = (name, cb) => { window.__menu.push({ name, cb }); return window.__menu.length; };
  window.GM_unregisterMenuCommand = () => {};
});

const clicks = () => page.evaluate(() => window.__clicks);
const until = async (fn, timeout = 8000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await page.evaluate(fn)) return true;
    await page.waitForTimeout(100);
  }
  return false;
};
const display = (selector) =>
  page.evaluate((sel) => getComputedStyle(document.querySelector(sel)).display, selector);

await page.goto(`${base}/watch?v=aaaaaaa`);
await page.addScriptTag({ content: SCRIPT });
await page.waitForTimeout(500);

check('no click during the warmup', (await clicks()) === 0);
check('the toggle is hidden by default', (await display('ytmusic-av-toggle')) === 'none');

check('the first track is switched once', await until(() => window.__clicks === 1));
await page.waitForTimeout(2500);
check('a mode that is already song is left alone', (await clicks()) === 1);

// Next track: YouTube Music resets the mode to video on its own, which is what this script exists for
await page.evaluate(() => {
  history.pushState({}, '', '/watch?v=bbbbbbb');
  window.toVideo();
  document.dispatchEvent(new Event('yt-navigate-finish'));
});
check('the next track is switched once more', await until(() => window.__clicks === 2));
await page.waitForTimeout(2500);
check('and then left alone as well', (await clicks()) === 2);

// The menu turns the whole thing off, including the hidden toggle
const menu = await page.evaluate(() => window.__menu.map((m) => m.name));
check('the menu offers both switches', menu.includes('Disable Prefer Song') && menu.includes('Show Song/Video toggle'));
await page.evaluate(() => {
  const entry = window.__menu.find((m) => m.name === 'Disable Prefer Song');
  entry.cb();
});
await page.waitForTimeout(200);
check('disabling shows the toggle again', (await display('ytmusic-av-toggle')) !== 'none');
await page.evaluate(() => {
  history.pushState({}, '', '/watch?v=ccccccc');
  window.toVideo();
  document.dispatchEvent(new Event('yt-navigate-finish'));
});
await page.waitForTimeout(3500);
check('disabling stops the switching', (await clicks()) === 2);

await page.evaluate(() => {
  const entry = window.__menu.find((m) => m.name === 'Enable Prefer Song');
  entry.cb();
});
await page.waitForTimeout(200);
check('enabling restores the hidden toggle', (await display('ytmusic-av-toggle')) === 'none');
check('enabling resumes the switching', await until(() => window.__clicks === 3));

await page.evaluate(() => {
  const entry = window.__menu.find((m) => m.name === 'Show Song/Video toggle');
  entry.cb();
});
await page.waitForTimeout(200);
check('the second switch only reveals the toggle', (await display('ytmusic-av-toggle')) !== 'none');

// A page without a toggle is the common case for audio-only uploads and must not throw
const bare = await ctx.newPage();
let bareError = '';
bare.on('pageerror', (e) => { bareError = e.message; });
await bare.goto(`${base}/watch?v=ddddddd`);
await bare.evaluate(() => document.querySelector('ytmusic-av-toggle').remove());
await bare.addScriptTag({ content: SCRIPT });
await bare.waitForTimeout(1200);
check(`a page without a toggle stays quiet${bareError ? ': ' + bareError : ''}`, bareError === '');

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

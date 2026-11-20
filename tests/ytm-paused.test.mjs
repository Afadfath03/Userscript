import { chromium, scriptPath } from './harness.mjs';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const SCRIPT = readFileSync(scriptPath('youtube-music-dismiss-paused-prompt.user.js'), 'utf8');

const FIXTURE = `<!doctype html><html><body>
  <video id="player" muted playsinline></video>
  <div id="dialogs"></div>
  <script>
    window.__yes = 0;
    window.__other = 0;
    window.__plays = 0;
    const player = document.getElementById('player');
    let paused = true;
    Object.defineProperty(player, 'paused', { get: () => paused });
    player.play = () => { window.__plays++; paused = false; return Promise.resolve(); };
    window.pausePlayer = () => { paused = true; };
    // The button closes the prompt but, like YouTube Music sometimes does, leaves playback paused
    window.showPrompt = (text, label) => {
      const host = document.getElementById('dialogs');
      host.innerHTML = '<tp-yt-paper-dialog><ytmusic-you-there-renderer><yt-formatted-string>' + text +
        '</yt-formatted-string><yt-button-renderer><button>' + label + '</button></yt-button-renderer></ytmusic-you-there-renderer></tp-yt-paper-dialog>';
      host.querySelector('button').addEventListener('click', () => { window.__yes++; });
    };
    window.hidePrompt = () => { document.querySelector('#dialogs tp-yt-paper-dialog').style.display = 'none'; };
    window.reshowPrompt = () => { document.querySelector('#dialogs tp-yt-paper-dialog').style.display = ''; };
    window.showOther = () => {
      const host = document.getElementById('dialogs');
      host.innerHTML = '<tp-yt-paper-dialog><yt-formatted-string>Delete playlist?</yt-formatted-string><button>Yes</button></tp-yt-paper-dialog>';
      host.querySelector('button').addEventListener('click', () => { window.__other++; });
    };
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
let failures = 0;
const check = (name, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!ok) failures++;
};

await ctx.addInitScript(() => {
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  window.__store = {};
  window.__menu = [];
  let nextId = 0;
  window.GM_getValue = (k, d) => (k in window.__store ? window.__store[k] : d);
  window.GM_setValue = (k, v) => { window.__store[k] = v; };
  window.GM_registerMenuCommand = (name, cb) => { const id = ++nextId; window.__menu.push({ id, name, cb }); return id; };
  window.GM_unregisterMenuCommand = (id) => { window.__menu = window.__menu.filter((m) => m.id !== id); };
});

const page = await ctx.newPage();
page.on('pageerror', (e) => check(`no page error (${e.message})`, false));

const until = async (p, fn, timeout = 4000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await p.evaluate(fn)) return true;
    await p.waitForTimeout(50);
  }
  return false;
};
const yes = () => page.evaluate(() => window.__yes);

// The player bar lives on every page, so the prompt is tested away from /watch
await page.goto(`${base}/`);
await page.addScriptTag({ content: SCRIPT });
await page.waitForTimeout(200);

check('menu offers the switch', (await page.evaluate(() => window.__menu.map((m) => m.name))).includes('Disable Dismiss Paused Prompt'));

await page.evaluate(() => window.showPrompt('Video paused. Continue watching?', 'Yes'));
check('prompt answered outside /watch', await until(page, () => window.__yes === 1));
check('playback resumes when the click leaves it paused', await until(page, () => window.__plays === 1));

await page.evaluate(() => { window.pausePlayer(); window.showPrompt('Are you still listening?', 'Yes'); });
check('still listening variant answered', await until(page, () => window.__yes === 2));

await page.evaluate(() => { window.pausePlayer(); window.showPrompt('Apakah Anda masih mendengarkan?', 'Ya'); });
check('Indonesian variant answered', await until(page, () => window.__yes === 3));

await page.evaluate(() => { window.pausePlayer(); window.showPrompt('Weiter h\u00f6ren?', 'Weiter'); });
check('unknown label inside you-there clicks its only button', await until(page, () => window.__yes === 4));

await page.waitForTimeout(1500);
check('one click per appearance', (await yes()) === 4);

// YouTube Music hides the dialog and shows the same node again next time
await page.evaluate(() => window.hidePrompt());
await page.waitForTimeout(1200);
await page.evaluate(() => { window.pausePlayer(); window.reshowPrompt(); });
check('a reused dialog is answered again', await until(page, () => window.__yes === 5));

await page.evaluate(() => window.showOther());
await page.waitForTimeout(1500);
check('unrelated dialog is left alone', (await page.evaluate(() => window.__other)) === 0);

const playsBefore = await page.evaluate(() => window.__plays);
await page.evaluate(() => window.__menu.find((m) => m.name === 'Disable Dismiss Paused Prompt').cb());
check('menu label follows the switch', (await page.evaluate(() => window.__menu.map((m) => m.name))).includes('Enable Dismiss Paused Prompt'));
await page.evaluate(() => { window.pausePlayer(); window.showPrompt('Video paused. Continue watching?', 'Yes'); });
await page.waitForTimeout(1500);
check('disabled script does not click', (await yes()) === 5);
check('disabled script does not resume', (await page.evaluate(() => window.__plays)) === playsBefore);

// A tab reopened while the prompt is showing has no mutation to react to
const early = await ctx.newPage();
await early.goto(`${base}/library`);
await early.evaluate(() => window.showPrompt('Video paused. Continue watching?', 'Yes'));
await early.addScriptTag({ content: SCRIPT });
check('prompt present at start is answered', await until(early, () => window.__yes === 1));

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

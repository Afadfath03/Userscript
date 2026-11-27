import { chromium, scriptPath } from '../harness.mjs';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const SCRIPT = readFileSync(scriptPath('youtube-custom-collection.user.js'), 'utf8');

const page = (items, selected, withPanel = true) => `<!doctype html><html><body>
  <div id="movie_player">
    <video></video>
    <div class="ytp-right-controls"></div>
  </div>
  <div id="secondary">
    ${withPanel ? `<ytd-playlist-panel-renderer>
      <div id="container">
        <div id="header">Playlist</div>
        <div id="contents">
          ${items
            .map(
              (item, index) => `<ytd-playlist-panel-video-renderer${index === selected ? ' selected' : ''}>
                <a id="link-${index}" href="/watch?v=V${index}&amp;list=PLtest">
                  <span class="duration">${item}</span>
                </a>
              </ytd-playlist-panel-video-renderer>`
            )
            .join('')}
        </div>
      </div>
    </ytd-playlist-panel-renderer>` : ''}
  </div>
</body></html>`;

let current = page(['1:00', '2:00', '3:00'], 1);
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(current);
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ headless: true });
let failures = 0;
const check = (name, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!ok) failures++;
};

const ctx = await browser.newContext();
const tab = await ctx.newPage();
tab.on('pageerror', (e) => check(`no page error (${e.message})`, false));
await tab.addInitScript(() => {
  window.__store = {};
  window.__menu = [];
  window.GM_getValue = (k, d) => (k in window.__store ? window.__store[k] : d);
  window.GM_setValue = (k, v) => { window.__store[k] = v; };
  window.GM_deleteValue = (k) => { delete window.__store[k]; };
  window.GM_listValues = () => Object.keys(window.__store);
  window.GM_registerMenuCommand = (name, cb) => { window.__menu.push({ name, cb }); return window.__menu.length; };
  window.GM_unregisterMenuCommand = () => {};
  window.GM_info = { script: { version: '3.6' } };
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
});
await tab.goto(`${base}/watch?v=V1&list=PLtest`);
await tab.addScriptTag({ content: SCRIPT });
await tab.waitForTimeout(300);

const line = () => tab.locator('#ytc-playlist-length');
const text = async () => ((await line().count()) ? (await line().textContent()) : '');

check('the line is drawn inside the playlist panel', await tab.evaluate(() => {
  const unit = document.getElementById('ytc-playlist-length');
  return !!unit && !!unit.closest('ytd-playlist-panel-renderer') && !!unit.closest('#container');
}));
check('total and remaining are both shown', (await text()) === '3 videos · 6:00 · 5:00 left');

await tab.evaluate(() => {
  const items = [...document.querySelectorAll('ytd-playlist-panel-video-renderer')];
  items[1].removeAttribute('selected');
  items[2].setAttribute('selected', '');
});
await tab.waitForTimeout(400);
check('a new selection moves the remaining time', (await text()) === '3 videos · 6:00 · 3:00 left');

await tab.evaluate(() => {
  const items = [...document.querySelectorAll('ytd-playlist-panel-video-renderer')];
  items[2].removeAttribute('selected');
});
await tab.waitForTimeout(400);
check('no selection counts the whole playlist as left', (await text()) === '3 videos · 6:00 · 6:00 left');

await tab.evaluate(() => { window.__store['ytc.playlistLength'] = false; document.dispatchEvent(new Event('ytc-change')); });
await tab.waitForTimeout(400);
check('turning the feature off removes the line', (await line().count()) === 0);
await tab.evaluate(() => { window.__store['ytc.playlistLength'] = true; document.dispatchEvent(new Event('ytc-change')); });
await tab.waitForTimeout(400);
check('turning it back on draws it again', (await line().count()) === 1);

// A live item has no duration to sum
current = page(['1:00', 'LIVE', '3:00'], 0);
await tab.goto(`${base}/watch?v=V0&list=PLtest`);
await tab.addScriptTag({ content: SCRIPT });
await tab.waitForTimeout(400);
check('a live item is counted as unknown, not zero', (await text()) === '3 videos · 4:00 (+1 unknown) · 4:00 left');

// A page without a playlist shows nothing
current = page([], 0, false);
await tab.goto(`${base}/watch?v=solo`);
await tab.addScriptTag({ content: SCRIPT });
await tab.waitForTimeout(400);
check('no playlist means no line', (await line().count()) === 0);

// A one-video list is not worth a line
current = page(['1:00'], 0);
await tab.goto(`${base}/watch?v=V0&list=PLtest`);
await tab.addScriptTag({ content: SCRIPT });
await tab.waitForTimeout(400);
check('a one-video playlist stays quiet', (await line().count()) === 0);

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

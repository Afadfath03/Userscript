import { chromium, scriptPath } from './harness.mjs';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const PAGE = (items, selected, related = 'RELATED001') => `<!doctype html><html><body>
  <div id="movie_player"><video></video><div class="ytp-right-controls"></div></div>
  <div id="secondary">
    <ytd-playlist-panel-renderer>
      ${items
        .map(
          (id, index) =>
            `<ytd-playlist-panel-video-renderer${index === selected ? ' selected' : ''}${
              id.hidden ? ' data-ytc-off="1"' : ''
            }><a id="link-${index}" href="/watch?v=${id.id}&amp;list=PLtest">${id.id}</a></ytd-playlist-panel-video-renderer>`
        )
        .join('')}
    </ytd-playlist-panel-renderer>
    <ytd-watch-next-secondary-results-renderer>
      <ytd-compact-video-renderer><a id="thumbnail" href="/watch?v=${related}">related</a></ytd-compact-video-renderer>
    </ytd-watch-next-secondary-results-renderer>
  </div>
</body></html>`;

const scripts = {
  collection: readFileSync(scriptPath('youtube-custom-collection.user.js'), 'utf8'),
  standalone: readFileSync(scriptPath('youtube-autoplay-control.user.js'), 'utf8'),
};

const browser = await chromium.launch({ headless: true });
let failures = 0;
const check = (name, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!ok) failures++;
};

async function run({ which, items, selected, store, wait = 120 }) {
  const html = PAGE(items, selected);
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(html);
  });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check(`no page error (${e.message})`, false));
  await page.goto(`${base}/watch?v=AAA2&list=PLtest`);
  await page.evaluate((seed) => {
    const video = document.querySelector('video');
    Object.defineProperty(video, 'duration', { get: () => 600, configurable: true });
    Object.defineProperty(video, 'paused', { get: () => true, configurable: true });
    Object.defineProperty(video, 'currentTime', { get: () => 0, set: () => {}, configurable: true });

    // Clicks would leave the fixture, so record where they pointed instead
    window.__clicked = null;
    document.addEventListener(
      'click',
      (e) => {
        const link = e.target.closest('a');
        if (!link) return;
        e.preventDefault();
        window.__clicked = link.href;
      },
      true
    );

    window.__store = { ...seed };
    window.__menu = [];
    window.GM_getValue = (k, d) => (k in window.__store ? window.__store[k] : d);
    window.GM_setValue = (k, v) => { window.__store[k] = v; };
    window.GM_deleteValue = (k) => { delete window.__store[k]; };
    window.GM_listValues = () => Object.keys(window.__store);
    window.GM_registerMenuCommand = (name, cb) => { window.__menu.push({ name, cb }); return window.__menu.length; };
    window.GM_unregisterMenuCommand = () => {};
    window.GM_info = { script: { version: '3.5' } };
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  }, store);

  await page.addScriptTag({ content: scripts[which] });
  await page.waitForTimeout(200);
  await page.evaluate(() => document.querySelector('#movie_player video').dispatchEvent(new Event('ended')));
  await page.waitForTimeout(wait);
  const clicked = await page.evaluate(() => window.__clicked);
  await ctx.close();
  server.close();
  return clicked || '';
}

const three = [{ id: 'AAA1' }, { id: 'AAA2' }, { id: 'AAA3' }];

const collectionNext = await run({ which: 'collection', items: three, selected: 1, store: { 'ytc.behavior': 'next' } });
check('collection follows the playlist instead of the sidebar', collectionNext.includes('/watch?v=AAA3') && collectionNext.includes('list=PLtest'));
check('collection does not fall through to a related video', !collectionNext.includes('RELATED001'));

const standaloneNext = await run({ which: 'standalone', items: three, selected: 1, store: { 'ytac.behavior': 'next' } });
check('standalone follows the playlist too', standaloneNext.includes('/watch?v=AAA3') && standaloneNext.includes('list=PLtest'));

const withHidden = await run({
  which: 'collection',
  items: [{ id: 'AAA1' }, { id: 'AAA2' }, { id: 'AAA3', hidden: true }, { id: 'AAA4' }],
  selected: 1,
  store: { 'ytc.behavior': 'next', 'ytc.membersOn': true },
});
check('a hidden playlist item is skipped', withHidden.includes('/watch?v=AAA4'));

const atEnd = await run({ which: 'collection', items: three, selected: 2, store: { 'ytc.behavior': 'next' } });
check('the end of a playlist falls back to related, like YouTube', atEnd.includes('/watch?v=RELATED001'));

const standaloneEnd = await run({ which: 'standalone', items: three, selected: 2, store: { 'ytac.behavior': 'next' } });
check('standalone end of playlist falls back as well', standaloneEnd.includes('/watch?v=RELATED001'));

const waitMode = await run({
  which: 'collection',
  items: [{ id: 'AAA1' }, { id: 'AAA2' }, { id: 'AAA3' }, { id: 'AAA4' }],
  selected: 1,
  store: { 'ytc.behavior': 'wait', 'ytc.delay': 3 },
  wait: 3500,
});
check('wait mode still targets the playlist item', waitMode.includes('/watch?v=AAA3'));

await browser.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

import { chromium, scriptPath } from './harness.mjs';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const SCRIPT = readFileSync(scriptPath('youtube-music-skip-by-keyword.user.js'), 'utf8');

const FIXTURE = `<!doctype html><html><body>
  <ytmusic-player-bar>
    <yt-formatted-string class="title"></yt-formatted-string>
    <span class="byline"></span>
    <tp-yt-paper-icon-button class="previous-button"></tp-yt-paper-icon-button>
    <tp-yt-paper-icon-button class="next-button"></tp-yt-paper-icon-button>
  </ytmusic-player-bar>
  <script>
    window.__next = 0;
    let queue = [];
    let index = 0;
    const bar = document.querySelector('ytmusic-player-bar');
    const show = () => {
      bar.querySelector('.title').textContent = queue[index][0];
      bar.querySelector('.byline').textContent = queue[index][1];
    };
    window.setQueue = (items) => { queue = items; index = 0; show(); };
    window.title = () => bar.querySelector('.title').textContent;
    // Next stops on the last item, as YouTube Music does when the queue runs out
    bar.querySelector('.next-button').addEventListener('click', () => {
      window.__next++;
      if (index < queue.length - 1) { index++; show(); }
    });
    bar.querySelector('.previous-button').addEventListener('click', () => {
      if (index > 0) { index--; show(); }
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
let failures = 0;
const check = (name, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!ok) failures++;
};

const pageErrors = [];

async function open(store, queue) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.addInitScript((initial) => {
    window.__store = initial;
    window.__menu = [];
    let nextId = 0;
    window.GM_getValue = (k, d) => (k in window.__store ? window.__store[k] : d);
    window.GM_setValue = (k, v) => { window.__store[k] = v; };
    window.GM_registerMenuCommand = (name, cb) => { const id = ++nextId; window.__menu.push({ id, name, cb }); return id; };
    window.GM_unregisterMenuCommand = (id) => { window.__menu = window.__menu.filter((m) => m.id !== id); };
  }, store);
  await page.goto(`${base}/`);
  await page.evaluate((items) => window.setQueue(items), queue);
  await page.addScriptTag({ content: SCRIPT });
  return page;
}

const until = async (page, fn, timeout = 5000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await page.evaluate(fn)) return true;
    await page.waitForTimeout(100);
  }
  return false;
};
const nexts = (page) => page.evaluate(() => window.__next);
const menu = (page, prefix) => page.evaluate((p) => window.__menu.find((m) => m.name.startsWith(p)).cb(), prefix);
const TICKS = (n) => n * 1000 + 300;

let page = await open({ 'ytsk.words': ['live'] }, [['Song (Live)', 'A'], ['Alive', 'B'], ['Song B', 'C']]);
check('matching title is skipped', await until(page, () => window.__next === 1));
await page.waitForTimeout(TICKS(3));
check('whole word only: Alive plays', (await nexts(page)) === 1);
await page.close();

page = await open({ 'ytsk.words': ['sped up'] }, [['Song (Sped  Up)', 'A'], ['Plain', 'A']]);
check('multi-word keyword matches', await until(page, () => window.__next === 1));
await page.close();

page = await open({ 'ytsk.words': ['(live)', 'c++'] }, [['Plain', 'A'], ['Other', 'B']]);
await page.waitForTimeout(TICKS(2));
check('regex characters do not throw', pageErrors.length === 0 && (await nexts(page)) === 0);
await page.close();

page = await open({ 'ytsk.words': ['live band'] }, [['Song', 'Live Band'], ['Next', 'X']]);
await page.waitForTimeout(TICKS(2));
check('artist ignored by default', (await nexts(page)) === 0);
await menu(page, 'Match artist too: Off');
check('artist matched when enabled', await until(page, () => window.__next === 1));
await page.close();

page = await open({ 'ytsk.words': ['live'] }, Array.from({ length: 7 }, (_, i) => [`Track ${i} (Live)`, 'A']));
await page.waitForTimeout(TICKS(9));
check('streak stops after five skips', (await nexts(page)) === 5);
await page.close();

page = await open({ 'ytsk.words': ['live'] }, [['X (Live)', 'A'], ['Y', 'B']]);
check('skip before going back', await until(page, () => window.__next === 1));
await page.evaluate(() => document.querySelector('.previous-button').click());
await page.waitForTimeout(TICKS(3));
check('going back keeps the skipped track', (await nexts(page)) === 1 && (await page.evaluate(() => window.title())) === 'X (Live)');
await page.close();

page = await open({}, [['Live', 'A'], ['B', 'B']]);
await page.waitForTimeout(TICKS(2));
check('empty list never skips', (await nexts(page)) === 0);
await page.evaluate(() => { window.prompt = () => 'live, Remix,  live ,'; });
await menu(page, 'Edit keywords (0)');
check('menu edit stores the parsed list', JSON.stringify(await page.evaluate(() => window.__store['ytsk.words'])) === '["live","Remix"]');
check('an edited list applies to the current track', await until(page, () => window.__next === 1));
await page.evaluate(() => { window.prompt = () => null; });
await menu(page, 'Edit keywords (2)');
check('cancelled prompt keeps the list', JSON.stringify(await page.evaluate(() => window.__store['ytsk.words'])) === '["live","Remix"]');
await page.close();

page = await open({ 'ytsk.words': ['live'], 'ytsk.on': false }, [['Live', 'A'], ['B', 'B']]);
await page.waitForTimeout(TICKS(2));
check('disabled script never skips', (await nexts(page)) === 0);
check('menu offers enabling', (await page.evaluate(() => window.__menu.map((m) => m.name))).includes('Enable Skip by Keyword'));
await page.close();

check(`no page errors${pageErrors.length ? ': ' + pageErrors.join('; ') : ''}`, pageErrors.length === 0);

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

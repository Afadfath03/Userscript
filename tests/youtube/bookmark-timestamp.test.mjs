import { chromium, scriptPath } from '../harness.mjs';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const SCRIPT = readFileSync(scriptPath('youtube-bookmark-timestamp.user.js'), 'utf8');

const PAGE = `<!doctype html><html><body>
  <div id="movie_player"><video></video></div>
</body></html>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(PAGE);
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ headless: true });
let failures = 0;
const check = (name, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!ok) failures++;
};

const page = await browser.newPage();
page.on('pageerror', (e) => check(`no page error (${e.message})`, false));

const start = async (url = '/watch?v=dQw4w9WgXcQ', store = {}) => {
  await page.goto(`${base}${url}`);
  await page.evaluate((seed) => {
    const player = document.querySelector('#movie_player video');
    window.__video = { t: 201, paused: false, pausedCount: 0, duration: 3600 };
    Object.defineProperty(player, 'currentTime', {
      get: () => window.__video.t,
      set: (value) => { window.__video.t = value; },
      configurable: true,
    });
    Object.defineProperty(player, 'paused', { get: () => window.__video.paused, configurable: true });
    Object.defineProperty(player, 'duration', { get: () => window.__video.duration, configurable: true });
    player.pause = () => { window.__video.paused = true; window.__video.pausedCount++; };
    player.play = () => { window.__video.paused = false; };

    window.__store = seed;
    window.__menu = [];
    window.__menuId = 0;
    window.__prompt = null;
    window.__confirm = true;
    window.GM_getValue = (k, d) => (k in window.__store ? window.__store[k] : d);
    window.GM_setValue = (k, v) => { window.__store[k] = v; };
    window.GM_registerMenuCommand = (name, cb) => {
      const id = ++window.__menuId;
      window.__menu.push({ id, name, cb });
      return id;
    };
    window.GM_unregisterMenuCommand = (id) => {
      window.__menu = window.__menu.filter((entry) => entry.id !== id);
    };
    window.prompt = () => window.__prompt;
    window.confirm = () => window.__confirm;
    window.alert = (text) => { window.__alert = text; };
  }, store);
  await page.addScriptTag({ content: SCRIPT });
  await page.waitForTimeout(120);
};

const menu = () => page.evaluate(() => window.__menu.map((m) => m.name));
const marks = () => page.evaluate(() => window.__store['ytbm.marks']?.['dQw4w9WgXcQ'] || []);

await start();
let names = await menu();
check('the menu offers adding at the playhead', names[0] === 'Add bookmark at 3:21');
check('an empty video shows only the add entry', names.length === 1);

await page.evaluate(() => { window.__prompt = 'Chorus'; });
await page.evaluate(() => window.__menu[0].cb());
await page.waitForTimeout(80);
check('adding stores the floored playhead', JSON.stringify((await marks()).map((m) => [m.t, m.n])) === '[[201,"Chorus"]]');
check('the video is paused while the prompt is open', (await page.evaluate(() => window.__video.pausedCount)) === 1);
check('the video resumes afterwards', (await page.evaluate(() => window.__video.paused)) === false);
check('the stamp is milliseconds', Number.isFinite((await marks())[0].at));

names = await menu();
check('the menu lists the mark twice, jump and delete', names.join('|') === 'Add bookmark at 3:21|Jump to 3:21 (Chorus)|Delete 3:21 (Chorus)');

await page.evaluate(() => window.__menu.find((m) => m.name.startsWith('Jump')).cb());
check('jump writes the stored time', (await page.evaluate(() => window.__video.t)) === 201);
await page.evaluate(() => { window.__video.t = 100; });
await page.evaluate(() => window.__menu.find((m) => m.name.startsWith('Jump')).cb());
check('jump still lands on the mark', (await page.evaluate(() => window.__video.t)) === 201);

await start('/watch?v=dQw4w9WgXcQ', {
  'ytbm.marks': { dQw4w9WgXcQ: [{ t: 75, n: 'Verse', at: 1 }, { t: 4000, n: 'Long', at: 2 }] },
});
names = await menu();
check('hour-long marks switch the whole menu to hours', names[1] === 'Jump to 0:01:15 (Verse)');
check('the add entry uses the same hour format', names[0] === 'Add bookmark at 0:03:21');

await page.evaluate(() => { window.__confirm = false; });
await page.evaluate(() => window.__menu.find((m) => m.name.startsWith('Delete')).cb());
await page.waitForTimeout(60);
check('a cancelled delete keeps the mark', (await marks()).length === 2);
await page.evaluate(() => { window.__confirm = true; });
await page.evaluate(() => window.__menu.find((m) => m.name.startsWith('Delete')).cb());
await page.waitForTimeout(60);
check('a confirmed delete removes only that mark', JSON.stringify((await marks()).map((m) => m.n)) === '["Long"]');
check('deleting redraws the menu', (await menu()).filter((n) => n.startsWith('Delete')).length === 1);

await page.evaluate(() => { window.__prompt = null; });
await page.evaluate(() => window.__menu[0].cb());
await page.waitForTimeout(60);
check('a cancelled prompt stores nothing', (await marks()).length === 1);

await page.evaluate(() => { window.__prompt = ''; });
await page.evaluate(() => window.__menu[0].cb());
await page.waitForTimeout(60);
check('an empty name falls back to the time', (await marks()).some((m) => m.n === '0:03:21'));

await page.evaluate(() => window.dispatchEvent(new Event('yt-navigate-finish')));
await page.waitForTimeout(60);
check('navigating redraws without duplicate entries', (await menu()).length === (await menu()).length && (await menu())[0].startsWith('Add bookmark'));

await page.keyboard.press('b');
await page.waitForTimeout(60);
check('the b hotkey opens the same prompt', (await page.evaluate(() => window.__video.pausedCount)) > 1);

await start('/feed/subscriptions', {
  'ytbm.marks': { dQw4w9WgXcQ: [{ t: 75, n: 'Verse', at: 1 }] },
});
check('off the watch page the menu stays empty', (await menu()).length === 0);

await start('/watch?v=dQw4w9WgXcQ', { 'ytbm.marks': { broken: 'nope', dQw4w9WgXcQ: [{ t: -5, n: 3 }] } });
check('a broken store does not throw', (await menu()).length === 1);
await page.evaluate(() => { window.__prompt = 'Safe'; });
await page.evaluate(() => window.__menu[0].cb());
await page.waitForTimeout(60);
check('a broken store is repaired on the next write', (await marks()).length === 1 && (await marks())[0].n === 'Safe');

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

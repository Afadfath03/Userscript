import { chromium, scriptPath } from './harness.mjs';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const SCRIPT = readFileSync(scriptPath('youtube-custom-collection.user.js'), 'utf8');

const PAGE = `<!doctype html><html><body>
  <div id="movie_player">
    <video></video>
    <div class="ytp-right-controls"><button class="ytp-button">CC</button></div>
  </div>
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

const ctx = await browser.newContext();
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
const page = await ctx.newPage();
page.on('pageerror', (e) => check(`no page error (${e.message})`, false));

await page.goto(`${base}/watch?v=dQw4w9WgXcQ`);
await page.evaluate(() => {
  const video = document.querySelector('#movie_player video');
  window.__video = { t: 201, paused: false, plays: 0, pauses: 0, duration: 3600 };
  Object.defineProperty(video, 'currentTime', {
    get: () => window.__video.t,
    set: (value) => { window.__video.t = value; },
    configurable: true,
  });
  Object.defineProperty(video, 'paused', { get: () => window.__video.paused, configurable: true });
  Object.defineProperty(video, 'duration', { get: () => window.__video.duration, configurable: true });
  video.play = () => { window.__video.paused = false; window.__video.plays++; };
  video.pause = () => { window.__video.paused = true; window.__video.pauses++; };

  window.__store = {};
  window.__menu = [];
  window.GM_getValue = (k, d) => (k in window.__store ? window.__store[k] : d);
  window.GM_setValue = (k, v) => { window.__store[k] = v; };
  window.GM_deleteValue = (k) => { delete window.__store[k]; };
  window.GM_listValues = () => Object.keys(window.__store);
  window.GM_registerMenuCommand = (name, cb) => { window.__menu.push({ name, cb }); return window.__menu.length; };
  window.GM_unregisterMenuCommand = () => {};
  window.GM_info = { script: { version: '3.0' } };
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
});

await page.addScriptTag({ content: SCRIPT });
await page.waitForTimeout(150);

const store = () => page.evaluate(() => window.__store);
const marks = async () => (await store())['ytc.bookmarks']?.['dQw4w9WgXcQ'] || [];
const dialogOpen = async () => (await page.locator('#ytc-dialog').count()) === 1;
const openBookmarkList = async () => {
  await page.evaluate(() => window.__menu.find((m) => m.name.startsWith('Show bookmarks')).cb());
  await page.waitForTimeout(80);
};
const enable = async () => {
  await page.evaluate(() => {
    window.__store['ytc.bookmarksOn'] = true;
    document.dispatchEvent(new Event('ytc-change'));
  });
  await page.waitForTimeout(80);
};

check('menu carries the bookmark shortcut', (await page.evaluate(() => window.__menu.map((m) => m.name))).some((n) => n.startsWith('Show bookmarks')));

check('player buttons stay away while the feature is off', (await page.locator('#ytc-play-add').count()) === 0);
await enable();
check('enabling adds both player buttons', (await page.locator('#ytc-play-add').count()) === 1 && (await page.locator('#ytc-play-list').count()) === 1);
check('buttons sit before the native controls', await page.evaluate(() => {
  const controls = document.querySelector('.ytp-right-controls');
  return controls.children[0].id === 'ytc-play-add' && controls.children[1].id === 'ytc-play-list';
}));
check('the badge hides at zero', await page.evaluate(() => document.querySelector('.ytc-play-badge').hidden));
check('the list button names the empty state', (await page.locator('#ytc-play-list').getAttribute('aria-label')) === 'Bookmarks, no saves yet');

await page.evaluate(() => window.__video.t = 201);
await page.locator('#ytc-play-add').click();
await page.waitForTimeout(80);
check('the add button opens the dialog', await dialogOpen());
check('the dialog pauses the video', (await page.evaluate(() => window.__video.paused)) === true && (await page.evaluate(() => window.__video.pauses)) === 1);
check('time defaults to the playhead', (await page.locator('#ytc-dialog-time').inputValue()) === '3:21');
check('name defaults to the time', (await page.locator('#ytc-dialog-name').inputValue()) === '3:21');
check('the dialog is labelled and described', await page.evaluate(() => {
  const box = document.querySelector('.ytc-dialog');
  return box.getAttribute('role') === 'dialog' &&
    box.getAttribute('aria-labelledby') === 'ytc-dialog-title' &&
    box.getAttribute('aria-describedby') === 'ytc-dialog-body';
}));
check('labels point at their inputs', await page.evaluate(() =>
  [...document.querySelectorAll('#ytc-dialog label')].every((l) => l.htmlFor && document.getElementById(l.htmlFor))
));

await page.locator('#ytc-dialog-time').fill('4:10');
await page.waitForTimeout(50);
check('the name follows the time while untouched', (await page.locator('#ytc-dialog-name').inputValue()) === '4:10');
await page.locator('#ytc-dialog-time').fill('9:45');
await page.waitForTimeout(50);
check('a far-off time shows the distance without blocking', (await page.locator('#ytc-dialog .ytc-hint').textContent()) === 'This is 6:24 away from the player.');
await page.locator('#ytc-dialog-time').fill('1:75');
await page.locator('.ytc-dialog .ytc-primary').click();
await page.waitForTimeout(50);
check('an unreadable time is refused in place', (await page.locator('#ytc-dialog .ytc-error').textContent()) === 'Use mm:ss, h:mm:ss, or seconds.');
check('the refused dialog stays open', await dialogOpen());

await page.locator('#ytc-dialog-time').fill('3:21');
await page.locator('#ytc-dialog-name').fill('Chorus');
await page.locator('.ytc-dialog .ytc-primary').click();
await page.waitForTimeout(80);
check('saving closes the dialog', !(await dialogOpen()));
check('saving stores the mark', JSON.stringify(await marks()) === JSON.stringify([{ t: 201, n: 'Chorus', at: (await marks())[0].at }]));
check('the dialog resumes playback', (await page.evaluate(() => window.__video.paused)) === false && (await page.evaluate(() => window.__video.plays)) === 1);
check('the badge counts the mark', (await page.locator('.ytc-play-badge').textContent()) === '1' && !(await page.evaluate(() => document.querySelector('.ytc-play-badge').hidden)));
check('the list button announces the count', (await page.locator('#ytc-play-list').getAttribute('aria-label')) === 'Bookmarks, 1 saved');

await page.keyboard.press('b');
await page.waitForTimeout(80);
check('the b hotkey opens the dialog', await dialogOpen());
check('reopening pauses again', (await page.evaluate(() => window.__video.pauses)) === 2);
await page.keyboard.press('Escape');
await page.waitForTimeout(80);
check('Escape cancels and resumes', !(await dialogOpen()) && (await page.evaluate(() => window.__video.paused)) === false);

await page.locator('#ytc-play-add').click();
await page.waitForTimeout(60);
await page.locator('#ytc-dialog-time').fill('1:00');
await page.locator('#ytc-dialog-name').fill('');
await page.locator('.ytc-dialog .ytc-primary').click();
await page.waitForTimeout(80);
check('an empty name falls back to the saved time', (await marks()).some((m) => m.t === 60 && m.n === '1:00'));

await page.locator('#ytc-play-list').click();
await page.waitForTimeout(80);
check('the list button opens the list view', (await page.locator('#ytc-panel h2').textContent()) === 'Bookmarks');
check('rows sort by time and keep the time on the left', await page.evaluate(() =>
  [...document.querySelectorAll('#ytc-panel .ytc-row')].map((row) => ({
    time: row.querySelector('.ytc-time').textContent,
    name: row.querySelector('.ytc-name').textContent,
  })).map((r) => `${r.time} ${r.name}`).join('|')
) === '1:00 1:00|3:21 Chorus');

check('icon buttons are named after their mark', await page.evaluate(() =>
  [...document.querySelectorAll('#ytc-panel .ytc-icon')].map((b) => b.getAttribute('aria-label')).join(',')
) === 'Edit 1:00,Delete 1:00,Edit Chorus,Delete Chorus');
check('row names keep a full-text tooltip', (await page.locator('#ytc-panel .ytc-name').first().getAttribute('title')) === '1:00');

await page.getByRole('button', { name: 'Edit Chorus' }).click();
await page.waitForTimeout(80);
check('edit opens with both fields filled', (await page.locator('#ytc-edit-time').inputValue()) === '3:21' && (await page.locator('#ytc-edit-name').inputValue()) === 'Chorus');
await page.locator('#ytc-edit-time').fill('0:30');
await page.locator('#ytc-edit-name').fill('Intro');
await page.locator('#ytc-edit-time').press('Enter');
await page.waitForTimeout(80);
check('saving moves the row to its new sort position', await page.evaluate(() =>
  [...document.querySelectorAll('#ytc-panel .ytc-time')].map((t) => t.textContent).join(',') === '0:30,1:00'
));
check('edit keeps the creation stamp', (await marks()).some((m) => m.t === 30 && m.n === 'Intro'));

await page.getByRole('button', { name: 'Edit Intro' }).click();
await page.waitForTimeout(60);
await page.locator('#ytc-edit-time').fill('1:00');
await page.locator('#ytc-edit-time').press('Enter');
await page.waitForTimeout(60);
check('a taken time is refused and names its owner', (await page.locator('#ytc-edit-error').textContent()) === '1:00 is already saved as "1:00". Pick another time.');
check('the refused edit keeps the old value', (await marks()).some((m) => m.t === 30 && m.n === 'Intro'));

await page.keyboard.press('Escape');
await page.waitForTimeout(60);
check('Escape returns to the list instead of closing the panel', (await page.locator('#ytc-panel h2').textContent()) === 'Bookmarks');

await page.getByRole('button', { name: 'Delete Intro' }).click();
await page.waitForTimeout(60);
check('the first delete click only arms the row', (await page.locator('#ytc-panel .ytc-armed .ytc-name').textContent()) === 'Press again' && (await marks()).length === 2);
await page.getByRole('button', { name: 'Delete Intro' }).click();
await page.waitForTimeout(80);
check('the second click removes only that mark', (await marks()).every((m) => m.n !== 'Intro') && (await marks()).length === 1);

await page.keyboard.press('Escape');
await page.waitForTimeout(60);

check('the dialog keeps focus inside', await (async () => {
  await page.locator('#ytc-play-add').click();
  await page.waitForTimeout(60);
  let escaped = 0;
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => !!document.activeElement.closest('.ytc-dialog'));
    if (!inside) escaped++;
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(60);
  return escaped === 0;
})());

await openBookmarkList();
await page.getByRole('button', { name: 'Back', exact: true }).click();
await page.waitForTimeout(60);
check('the list backs out to the feature settings', (await page.locator('#ytc-panel h2').textContent()) === 'YouTube: Bookmark Timestamp');
await page.getByRole('button', { name: /^Backup/ }).click();
await page.waitForTimeout(80);
check('the feature has its own backup view', (await page.locator('#ytc-panel h2').textContent()) === 'Bookmarks backup');
await page.getByRole('button', { name: /^Copy bookmarks JSON/ }).click();
await page.waitForTimeout(80);
const exported = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
check('the feature export names its feature', exported.feature === 'bookmarks' && exported.format === 1);
check('the feature export carries the map', Object.keys(exported.marks).join(',') === 'dQw4w9WgXcQ');
await page.locator('#ytc-marks-backup').fill(
  JSON.stringify({
    feature: 'bookmarks',
    marks: {
      dQw4w9WgXcQ: [
        { t: 201, n: 'Chorus', at: 1 },
        { t: 900, n: 'Bridge', at: 2 },
      ],
      short: [{ t: 5, n: 'x', at: 3 }],
      zzzzzzzz: [{ t: 999999, n: 'bad', at: 4 }],
    },
  })
);
await page.waitForTimeout(60);
check('the import preview counts the new marks', (await page.locator('#ytc-marks-import').textContent()) === 'Import 2 bookmarks');
check('the import preview reports the rest', (await page.locator('#ytc-panel .ytc-status').last().textContent()) === '2 new, 0 already saved, 2 skipped.');
await page.getByRole('button', { name: /^Import 2 bookmarks/ }).click();
await page.waitForTimeout(60);
check('import asks for a second click', (await page.locator('#ytc-marks-import').textContent()) === 'Press again to import 2 bookmarks');
await page.getByRole('button', { name: /^Press again to import/ }).click();
await page.waitForTimeout(80);
check('merge adds only the new marks', (await marks()).length === 3 && (await marks()).some((m) => m.n === 'Bridge') && (await marks()).some((m) => m.n === 'Chorus'));
check('merge leaves other keys alone', (await store())['ytc.bookmarksOn'] === true);

// The main backup keeps carrying the marks
await page.keyboard.press('Escape');
await page.waitForTimeout(60);
await page.evaluate(() => window.__menu[0].cb());
await page.waitForTimeout(60);
await page.getByRole('button', { name: 'Backup' }).click();
await page.waitForTimeout(80);
await page.getByRole('button', { name: /^Copy settings JSON/ }).click();
await page.waitForTimeout(80);
const full = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
check('the main export includes the marks', !!full.settings.bookmarks && full.settings.bookmarks.dQw4w9WgXcQ.length === 3);

// Limits and reset
await page.keyboard.press('Escape');
await page.waitForTimeout(60);
await page.evaluate(() => {
  const list = [];
  for (let i = 0; i < 50; i++) list.push({ t: i * 10, n: `m${i}`, at: i });
  window.__store['ytc.bookmarks'] = { dQw4w9WgXcQ: list };
});
await page.locator('#ytc-play-add').click();
await page.waitForTimeout(60);
await page.locator('#ytc-dialog-time').fill('1000');
await page.locator('.ytc-dialog .ytc-primary').click();
await page.waitForTimeout(60);
check('the 51st mark is refused', (await page.locator('#ytc-dialog .ytc-error').textContent()) === 'This video already holds 50 bookmarks.');
await page.keyboard.press('Escape');
await page.waitForTimeout(60);
check('the refused mark left the stored list at 50', (await marks()).length === 50);

await page.evaluate(() => window.dispatchEvent(new Event('yt-navigate-finish')));
await page.waitForTimeout(80);
check('navigating keeps one pair of buttons', (await page.locator('#ytc-play-add').count()) === 1 && (await page.locator('#ytc-play-list').count()) === 1);

// Chapters: YouTube only accepts a description block that follows its rules
const setMarks = async (list) => {
  await page.evaluate((marks) => {
    window.__store['ytc.bookmarks'] = { dQw4w9WgXcQ: marks };
    document.dispatchEvent(new Event('ytc-change'));
  }, list);
};
const copyChapters = async () => {
  await page.evaluate(() => window.__menu.find((m) => m.name.startsWith('Show bookmarks')).cb());
  await page.waitForTimeout(80);
  await page.getByRole('button', { name: /^Copy as chapters/ }).click();
  await page.waitForTimeout(80);
  return page.locator('#ytc-panel .ytc-status[role="status"]').textContent();
};

await setMarks([
  { t: 0, n: 'Intro', at: 1 },
  { t: 60, n: 'Topic', at: 2 },
  { t: 120, n: 'End', at: 3 },
]);
check('a valid set copies as chapter lines', (await copyChapters()) === 'Copied as chapter lines.');
check('the copied block is what YouTube expects', (await page.evaluate(() => navigator.clipboard.readText())) === '0:00 Intro\n1:00 Topic\n2:00 End');

await setMarks([
  { t: 30, n: 'A', at: 1 },
  { t: 90, n: 'B', at: 2 },
  { t: 150, n: 'C', at: 3 },
]);
check('a block that does not start at zero is refused', (await copyChapters()) === 'The first chapter must be at 0:00. Add a mark at the start of the video.');

await setMarks([
  { t: 0, n: 'A', at: 1 },
  { t: 60, n: 'B', at: 2 },
]);
check('fewer than three marks is refused', (await copyChapters()) === 'YouTube needs at least 3 chapters.');

await setMarks([
  { t: 0, n: 'A', at: 1 },
  { t: 5, n: 'B', at: 2 },
  { t: 60, n: 'C', at: 3 },
]);
check('chapters closer than ten seconds are refused', (await copyChapters()) === '0:05 is less than 10 seconds after 0:00.');

await page.evaluate(() => { window.__video.duration = 7200; });
await setMarks([
  { t: 0, n: 'Intro', at: 1 },
  { t: 3600, n: 'Hour', at: 2 },
  { t: 3700, n: 'Late', at: 3 },
]);
check('a long video copies with hours', (await copyChapters()) === 'Copied as chapter lines.');
check('hour lines keep the same format as the list', (await page.evaluate(() => navigator.clipboard.readText())) === '0:00:00 Intro\n1:00:00 Hour\n1:01:40 Late');

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

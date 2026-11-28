import { chromium, scriptPath } from '../harness.mjs';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const STANDALONE = readFileSync(scriptPath('youtube-general-custom.user.js'), 'utf8');
const COLLECTION = readFileSync(scriptPath('youtube-custom-collection.user.js'), 'utf8');

const card = (id, attrs = '') =>
  `<ytd-rich-item-renderer id="${id}" ${attrs}><div id="content"><ytd-rich-grid-media>Video ${id}</ytd-rich-grid-media></div></ytd-rich-item-renderer>`;

const FIXTURE = `<!doctype html><html><head><style>
  * { box-sizing: border-box; }
  body { margin: 0; }
  ytd-browse { display: block; width: 1000px; }
  ytd-rich-grid-renderer { display: block; width: 1000px; --ytd-rich-grid-items-per-row: 2; --ytd-rich-grid-item-margin: 16px; }
  ytd-rich-grid-renderer > #contents { display: flex; flex-wrap: wrap; width: 1000px; }
  ytd-rich-grid-row, ytd-rich-grid-row > #contents { display: flex; width: 1000px; }
  ytd-rich-item-renderer { display: block; width: calc(100% / var(--ytd-rich-grid-items-per-row) - 16px); margin: 0 8px; height: 120px; }
  ytd-rich-item-renderer[is-in-first-column] { margin-left: 0; }
  ytd-rich-section-renderer { display: block; width: 100%; height: 40px; }
</style></head><body>
  <ytd-browse page-subtype="home"><ytd-rich-grid-renderer><div id="contents">
    <ytd-rich-grid-row><div id="contents">
      <ytd-rich-item-renderer id="h-ad"><div id="content"><ytd-ad-slot-renderer></ytd-ad-slot-renderer></div></ytd-rich-item-renderer>
      ${card('h1', 'is-in-first-column')}${card('h2')}
    </div></ytd-rich-grid-row>
    <ytd-rich-section-renderer id="h-empty-shelf" style="height: 0"></ytd-rich-section-renderer>
    <ytd-rich-grid-row><div id="contents">${card('h3', 'is-in-first-column')}${card('h4')}</div></ytd-rich-grid-row>
    <ytd-rich-grid-row><div id="contents">
      ${card('h5', 'is-in-first-column')}${card('h6')}
      <ytd-rich-item-renderer id="h-mem"><div id="content"><yt-lockup-view-model id="h-mem-lockup"><a href="/watch?v=mem99999">x</a><badge-shape>Members only</badge-shape></yt-lockup-view-model></div></ytd-rich-item-renderer>
    </div></ytd-rich-grid-row>
    <ytd-rich-section-renderer id="h-shelf">Shelf</ytd-rich-section-renderer>
  </div></ytd-rich-grid-renderer></ytd-browse>
  <a id="short-link" href="/shorts/abcdef12345?t=12">Short</a>
  <yt-copy-link-renderer>
    <input id="share-url" value="https://youtu.be/abcdef12345?si=track123&t=45" />
    <button id="copy-button" type="button">Copy</button>
  </yt-copy-link-renderer>
</body></html>`;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(FIXTURE);
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ headless: true });
let failures = 0;
const check = (name, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!ok) failures++;
};

async function measureRow(page, ids) {
  return page.evaluate((list) => {
    const rects = list.map((id) => document.getElementById(id).getBoundingClientRect());
    const top = rects[0].top;
    const same = rects.filter((r) => Math.abs(r.top - top) < 1);
    const widths = same.map((r) => r.width);
    return { count: same.length, diff: Math.max(...widths) - Math.min(...widths) };
  }, ids);
}

async function setup(script, url = `${base}/`) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check(`no page error (${e.message})`, false));
  await page.addInitScript(() => {
    window.__store = {};
    window.__menu = [];
    window.__copied = '';
    window.GM_getValue = (k, d) => (k in window.__store ? window.__store[k] : d);
    window.GM_setValue = (k, v) => { window.__store[k] = v; };
    window.GM_deleteValue = (k) => { delete window.__store[k]; };
    window.GM_listValues = () => Object.keys(window.__store);
    window.GM_setClipboard = (text) => { window.__copied = text; };
    window.GM_registerMenuCommand = (name, cb) => { window.__menu.push({ name, cb }); return window.__menu.length; };
    window.GM_unregisterMenuCommand = () => {};
    window.GM_info = { script: { version: '5.0' } };
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  });
  await page.goto(url);
  await page.addScriptTag({ content: script });
  await page.waitForTimeout(120);
  return { ctx, page };
}

// Standalone
{
  const { ctx, page } = await setup(STANDALONE);
  const row4 = await measureRow(page, ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
  check('standalone: defaults to 4 per row uniformly', row4.count === 4 && row4.diff < 1);
  check('standalone: collapses ad-slot wrapper and zero-height section in grid',
    await page.evaluate(() =>
      getComputedStyle(document.getElementById('h-ad')).display === 'none' &&
      getComputedStyle(document.getElementById('h-empty-shelf')).display === 'none' &&
      getComputedStyle(document.getElementById('h-shelf')).display !== 'none'
    ));
  check('standalone: share url strips si parameter',
    (await page.locator('#share-url').inputValue()) === 'https://youtu.be/abcdef12345?t=45');
  await page.click('#copy-button');
  await page.waitForTimeout(60);
  check('standalone: copy button copies clean share url', (await page.evaluate(() => window.__copied)) === 'https://youtu.be/abcdef12345?t=45');

  // Open panel, check fixed size, centered header, greyed-out disabled, 2-step reset
  await page.evaluate(() => window.__menu[0].cb());
  await page.waitForTimeout(60);
  const homeRect = await page.locator('#ytgc-panel').boundingBox();
  await page.getByRole('button', { name: /Shorts/ }).click();
  await page.waitForTimeout(60);
  const subRect = await page.locator('#ytgc-panel').boundingBox();
  check('standalone: panel keeps identical fixed size across views',
    Math.round(homeRect.width) === Math.round(subRect.width) && Math.round(homeRect.height) === Math.round(subRect.height));

  await page.getByRole('button', { name: /Open Shorts in Watch Page/ }).click();
  await page.waitForTimeout(60);
  check('standalone: Open Shorts in Watch Page rewrites DOM link',
    (await page.locator('#short-link').getAttribute('href')) === '/watch?v=abcdef12345&t=12');

  await page.getByRole('button', { name: 'Back' }).click();
  await page.waitForTimeout(60);
  await page.getByRole('button', { name: /Enabled/ }).click();
  await page.waitForTimeout(60);
  check('standalone: disabling greys out and disables sub-sections while keeping Reset clickable',
    await page.evaluate(() => {
      const subs = [...document.querySelectorAll('#ytgc-panel .ytp-group button')];
      const reset = document.querySelector('#ytgc-panel .ytp-reset');
      return subs.length === 3 && subs.every((b) => b.disabled) && reset && !reset.disabled;
    }));
  const rowOff = await measureRow(page, ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
  check('standalone: disabling reverts grid to 2 per row', rowOff.count === 2);

  await page.getByRole('button', { name: 'Reset General Custom' }).click();
  await page.waitForTimeout(50);
  check('standalone: Reset requires second confirmation click',
    (await page.getByRole('button', { name: 'Click again to reset General Custom' }).count()) === 1);
  await page.getByRole('button', { name: 'Click again to reset General Custom' }).click();
  await page.waitForTimeout(60);
  check('standalone: second Reset click clears keys and restores 4 per row',
    (await page.evaluate(() => Object.keys(window.__store).length)) === 0 &&
    (await measureRow(page, ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])).count === 4);
  await ctx.close();
}

// Collection
{
  const { ctx, page } = await setup(COLLECTION);
  const row4 = await measureRow(page, ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
  check('collection: General Custom defaults to 4 per row uniformly', row4.count === 4 && row4.diff < 1);
  check('collection: collapses ad-slot wrapper, zero-height section, and nested Members-only lockup outer card',
    await page.evaluate(() =>
      getComputedStyle(document.getElementById('h-ad')).display === 'none' &&
      getComputedStyle(document.getElementById('h-empty-shelf')).display === 'none' &&
      getComputedStyle(document.getElementById('h-shelf')).display !== 'none' &&
      getComputedStyle(document.getElementById('h-mem')).display === 'none' &&
      !document.getElementById('h-mem-lockup').hasAttribute('data-ytc-off')
    ));
  await page.evaluate(() => window.__menu[0].cb());
  await page.waitForTimeout(60);
  await page.getByRole('button', { name: /General Custom/ }).click();
  await page.waitForTimeout(60);
  await page.getByRole('button', { name: /Custom Grid/ }).click();
  await page.waitForTimeout(60);
  await page.getByRole('button', { name: /Videos per row/ }).click();
  await page.waitForTimeout(60);
  await page.getByRole('button', { name: '3', exact: true }).click();
  await page.waitForTimeout(60);
  const row3 = await measureRow(page, ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
  check('collection: changing columns to 3 updates grid uniformly', row3.count === 3 && row3.diff < 1);
  await ctx.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

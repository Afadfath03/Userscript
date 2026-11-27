import { chromium, scriptPath } from '../harness.mjs';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const STANDALONE = readFileSync(scriptPath('youtube-custom-grid.user.js'), 'utf8');
const COLLECTION = readFileSync(scriptPath('youtube-custom-collection.user.js'), 'utf8');

const card = (id, attrs = '') =>
  `<ytd-rich-item-renderer id="${id}" ${attrs}><div id="content"><ytd-rich-grid-media>Video ${id}</ytd-rich-grid-media></div></ytd-rich-item-renderer>`;

const FIXTURE = `<!doctype html><html><head><style>
  * { box-sizing: border-box; }
  body { margin: 0; }
  ytd-browse { display: block; width: 1000px; }
  ytd-rich-grid-renderer {
    display: block;
    width: 1000px;
    --ytd-rich-grid-items-per-row: 2;
    --ytd-rich-grid-item-margin: 16px;
  }
  ytd-rich-grid-renderer > #contents {
    display: flex;
    flex-wrap: wrap;
    width: 1000px;
  }
  ytd-rich-grid-row {
    display: flex;
    width: 1000px;
  }
  ytd-rich-grid-row > #contents {
    display: flex;
    width: 1000px;
  }
  ytd-rich-item-renderer {
    display: block;
    width: calc(100% / var(--ytd-rich-grid-items-per-row) - var(--ytd-rich-grid-item-margin));
    margin-left: calc(var(--ytd-rich-grid-item-margin) / 2);
    margin-right: calc(var(--ytd-rich-grid-item-margin) / 2);
    height: 120px;
  }
  ytd-rich-item-renderer[is-in-first-column] {
    margin-left: 0;
  }
  ytd-rich-item-renderer[is-slim-media] {
    width: 150px;
    flex: 0 0 150px;
  }
  ytd-rich-section-renderer {
    display: block;
    width: 100%;
    height: 40px;
  }
</style></head><body>
  <ytd-browse page-subtype="home">
    <ytd-rich-grid-renderer>
      <div id="contents">
        <ytd-rich-grid-row><div id="contents">
          ${card('h1', 'is-in-first-column')}
          ${card('h2')}
        </div></ytd-rich-grid-row>
        <ytd-rich-grid-row><div id="contents">
          ${card('h3', 'is-in-first-column')}
          ${card('h4')}
        </div></ytd-rich-grid-row>
        <ytd-rich-grid-row><div id="contents">
          ${card('h5', 'is-in-first-column')}
          ${card('h6')}
        </div></ytd-rich-grid-row>
        <ytd-rich-section-renderer id="h-shelf">Shorts shelf</ytd-rich-section-renderer>
        ${card('h-slim', 'is-slim-media')}
      </div>
    </ytd-rich-grid-renderer>
  </ytd-browse>

  <ytd-browse page-subtype="subscriptions">
    <ytd-rich-grid-renderer>
      <div id="contents">
        ${card('s1', 'is-in-first-column')}
        ${card('s2')}
        ${card('s3')}
        ${card('s4')}
        ${card('s5')}
      </div>
    </ytd-rich-grid-renderer>
  </ytd-browse>

  <ytd-browse page-subtype="channels">
    <ytd-rich-grid-renderer>
      <div id="contents">
        ${card('c1', 'is-in-first-column')}
        ${card('c2')}
        ${card('c3')}
        ${card('c4')}
      </div>
    </ytd-rich-grid-renderer>
  </ytd-browse>

  <ytd-browse page-subtype="explore">
    <ytd-rich-grid-renderer>
      <div id="contents">
        ${card('o1', 'is-in-first-column')}
        ${card('o2')}
        ${card('o3')}
        ${card('o4')}
      </div>
    </ytd-rich-grid-renderer>
  </ytd-browse>
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
    const rects = list.map((id) => {
      const r = document.getElementById(id).getBoundingClientRect();
      return { id, top: r.top, width: r.width };
    });
    const firstTop = rects[0].top;
    const sameRow = rects.filter((r) => Math.abs(r.top - firstTop) < 1);
    const widths = sameRow.map((r) => r.width);
    const maxDiff = Math.max(...widths) - Math.min(...widths);
    return { countInFirstRow: sameRow.length, maxWidthDiff: maxDiff, firstWidth: widths[0] };
  }, ids);
}

async function createPage() {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check(`no page error (${e.message})`, false));
  await page.addInitScript(() => {
    window.__store = {};
    window.__menu = [];
    window.GM_getValue = (k, d) => (k in window.__store ? window.__store[k] : d);
    window.GM_setValue = (k, v) => { window.__store[k] = v; };
    window.GM_deleteValue = (k) => { delete window.__store[k]; };
    window.GM_listValues = () => Object.keys(window.__store);
    window.GM_registerMenuCommand = (name, cb) => { window.__menu.push({ name, cb }); return window.__menu.length; };
    window.GM_unregisterMenuCommand = () => {};
    window.GM_info = { script: { version: '4.9' } };
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  });
  return { ctx, page };
}

// ---------- Standalone tests ----------
{
  const { ctx, page } = await createPage();
  await page.goto(`${base}/`);
  await page.addScriptTag({ content: STANDALONE });
  await page.waitForTimeout(100);

  const home4 = await measureRow(page, ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
  check('standalone: home defaults to 4 per row across row wrappers', home4.countInFirstRow === 4);
  check('standalone: home cards have uniform width', home4.maxWidthDiff < 1);

  const subs4 = await measureRow(page, ['s1', 's2', 's3', 's4', 's5']);
  check('standalone: subscriptions defaults to 4 per row', subs4.countInFirstRow === 4 && subs4.maxWidthDiff < 1);

  const chan4 = await measureRow(page, ['c1', 'c2', 'c3', 'c4']);
  check('standalone: channel defaults to 4 per row', chan4.countInFirstRow === 4 && chan4.maxWidthDiff < 1);

  const other4 = await measureRow(page, ['o1', 'o2', 'o3', 'o4']);
  check('standalone: other grids default to 4 per row', other4.countInFirstRow === 4 && other4.maxWidthDiff < 1);

  const shelfWidth = await page.evaluate(() => document.getElementById('h-shelf').getBoundingClientRect().width);
  const slimWidth = await page.evaluate(() => document.getElementById('h-slim').getBoundingClientRect().width);
  check('standalone: section shelf keeps full width', Math.abs(shelfWidth - 1000) < 1);
  check('standalone: slim Shorts item keeps its own width', Math.abs(slimWidth - 150) < 1);

  // Open panel and change column count to 5
  await page.evaluate(() => window.__menu[window.__menu.length - 1].cb());
  await page.waitForTimeout(80);
  await page.getByRole('button', { name: /Videos per row/ }).click();
  await page.waitForTimeout(80);

  const home5 = await measureRow(page, ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
  check('standalone: cycling columns updates home to 5 per row uniformly', home5.countInFirstRow === 5 && home5.maxWidthDiff < 1);

  // Toggle Subscriptions off, keep Home on
  await page.getByRole('button', { name: /Subscriptions/ }).click();
  await page.waitForTimeout(80);
  const subsOff = await measureRow(page, ['s1', 's2', 's3', 's4', 's5']);
  const homeStill5 = await measureRow(page, ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
  check('standalone: toggling Subscriptions off reverts it to 2 per row', subsOff.countInFirstRow === 2);
  check('standalone: Home stays at 5 per row when Subscriptions is off', homeStill5.countInFirstRow === 5);

  // Toggle Channel and Other off
  await page.getByRole('button', { name: /Channel/ }).click();
  await page.getByRole('button', { name: /Other grids/ }).click();
  await page.waitForTimeout(80);
  const chanOff = await measureRow(page, ['c1', 'c2', 'c3', 'c4']);
  const otherOff = await measureRow(page, ['o1', 'o2', 'o3', 'o4']);
  check('standalone: toggling Channel and Other off reverts them to 2 per row',
    chanOff.countInFirstRow === 2 && otherOff.countInFirstRow === 2);

  // Master toggle off
  await page.getByRole('button', { name: /Enabled/ }).click();
  await page.waitForTimeout(80);
  const homeOff = await measureRow(page, ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
  check('standalone: disabling script reverts Home to 2 per row', homeOff.countInFirstRow === 2);

  // Reset restores defaults
  await page.getByRole('button', { name: 'Reset to defaults' }).click();
  await page.waitForTimeout(80);
  const homeReset = await measureRow(page, ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
  const subsReset = await measureRow(page, ['s1', 's2', 's3', 's4', 's5']);
  check('standalone: reset clears keys and restores 4 per row everywhere',
    (await page.evaluate(() => Object.keys(window.__store).length)) === 0 &&
    homeReset.countInFirstRow === 4 &&
    subsReset.countInFirstRow === 4);

  await page.getByRole('button', { name: 'Close' }).click();
  await page.waitForTimeout(50);
  check('standalone: close removes panel', (await page.locator('#ytcg-panel').count()) === 0);
  await ctx.close();
}

// ---------- Collection tests ----------
{
  const { ctx, page } = await createPage();
  await page.goto(`${base}/`);
  await page.addScriptTag({ content: COLLECTION });
  await page.waitForTimeout(150);

  const home4 = await measureRow(page, ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
  const subs4 = await measureRow(page, ['s1', 's2', 's3', 's4', 's5']);
  check('collection: defaults to 4 per row uniformly on home and subscriptions',
    home4.countInFirstRow === 4 && home4.maxWidthDiff < 1 &&
    subs4.countInFirstRow === 4 && subs4.maxWidthDiff < 1);

  // Open hub -> Custom Grid
  await page.evaluate(() => window.__menu[0].cb());
  await page.waitForTimeout(80);
  check('collection: hub shows Custom Grid summary',
    (await page.getByRole('button', { name: /Custom Grid/ }).textContent()).includes('4 per row'));

  await page.getByRole('button', { name: /Custom Grid/ }).click();
  await page.waitForTimeout(80);

  // Change columns from 4 to 3 (choice view)
  await page.getByRole('button', { name: /Videos per row/ }).click();
  await page.waitForTimeout(80);
  await page.getByRole('button', { name: '3', exact: true }).click();
  await page.waitForTimeout(80);

  const home3 = await measureRow(page, ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
  check('collection: changing columns to 3 updates home to 3 per row uniformly',
    home3.countInFirstRow === 3 && home3.maxWidthDiff < 1);

  // Toggle Home off
  await page.getByRole('button', { name: /Home/ }).click();
  await page.waitForTimeout(80);
  const homeOff = await measureRow(page, ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
  const subs3 = await measureRow(page, ['s1', 's2', 's3', 's4', 's5']);
  check('collection: toggling Home off reverts Home while Subscriptions stays 3 per row',
    homeOff.countInFirstRow === 2 && subs3.countInFirstRow === 3);

  // Disable Custom Grid feature
  await page.getByRole('button', { name: /Enabled/ }).click();
  await page.waitForTimeout(80);
  const subsOff = await measureRow(page, ['s1', 's2', 's3', 's4', 's5']);
  check('collection: disabling Custom Grid reverts remaining sections', subsOff.countInFirstRow === 2);

  await ctx.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

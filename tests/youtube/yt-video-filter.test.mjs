import { chromium, scriptPath } from '../harness.mjs';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const STANDALONE = readFileSync(scriptPath('youtube-video-filter.user.js'), 'utf8');
const COLLECTION = readFileSync(scriptPath('youtube-custom-collection.user.js'), 'utf8');

const FIXTURE = `<!doctype html><html><head><title>Sample Video - YouTube</title></head><body>
  <div id="movie_player">
    <video id="v" muted playsinline></video>
    <div class="ytp-chrome-bottom">
      <div class="ytp-right-controls">
        <button class="ytp-button ytp-settings-button" aria-label="Settings"></button>
        <button class="ytp-button ytp-fullscreen-button" aria-label="Full screen"></button>
      </div>
    </div>
  </div>
  <ytd-watch-metadata><h1>Sample Video</h1></ytd-watch-metadata>
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

async function setup(script, store = {}, path = '/watch?v=vidAAA11111') {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check(`no page error (${e.message})`, false));
  await page.addInitScript((initStore) => {
    window.__store = JSON.parse(JSON.stringify(initStore));
    window.__menu = [];
    window.GM_getValue = (k, d) => (k in window.__store ? window.__store[k] : d);
    window.GM_setValue = (k, v) => { window.__store[k] = v; };
    window.GM_deleteValue = (k) => { delete window.__store[k]; };
    window.GM_listValues = () => Object.keys(window.__store);
    window.GM_registerMenuCommand = (name, cb) => { window.__menu.push({ name, cb }); return window.__menu.length; };
    window.GM_unregisterMenuCommand = () => {};
    window.GM_info = { script: { version: '5.4' } };
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  }, store);
  await page.goto(`${base}${path}`);
  await page.addScriptTag({ content: script });
  await page.waitForTimeout(120);
  return { ctx, page };
}

// 1. Standalone core behavior, sliders, SVG lazy filter, presets, save/override/Option 3, ad-showing, SPA, keyboard isolation
{
  const { ctx, page } = await setup(STANDALONE);

  check('standalone: neutral leaves video.style.filter empty and no SVG injected',
    await page.evaluate(() => document.getElementById('v').style.filter === '' && !document.getElementById('ytvf-svg')));

  check('standalone: button placed immediately before .ytp-settings-button',
    await page.evaluate(() => {
      const btn = document.getElementById('ytvf-btn');
      return !!btn && btn.nextElementSibling?.classList.contains('ytp-settings-button');
    }));

  await page.click('#ytvf-btn');
  await page.waitForTimeout(50);
  check('standalone: popover opens inside #movie_player',
    await page.evaluate(() => document.getElementById('ytvf-popover')?.parentElement?.id === 'movie_player'));

  // Adjust CSS slider -> live preview without saving
  await page.evaluate(() => {
    const sl = document.getElementById('ytvf-sl-brightness');
    sl.value = '130';
    sl.dispatchEvent(new Event('input', { bubbles: true }));
  });
  check('standalone: CSS slider updates video.style.filter live without saving',
    await page.evaluate(() =>
      document.getElementById('v').style.filter.includes('brightness(130%)') &&
      !document.getElementById('v').style.filter.includes('url(') &&
      !('ytvf.global' in window.__store) &&
      !('ytvf.videos' in window.__store)
    ));

  // Per-parameter label click toggles off with strikethrough and preserves slider value; mode switches to custom
  await page.locator('#ytvf-popover label', { hasText: 'Brightness' }).click();
  check('standalone: clicking parameter label toggles off with strikethrough and preserves slider value',
    await page.evaluate(() => {
      const lab = [...document.querySelectorAll('#ytvf-popover label')].find((l) => l.textContent === 'Brightness');
      return (
        document.getElementById('v').style.filter === '' &&
        document.getElementById('ytvf-sl-brightness').value === '130' &&
        getComputedStyle(lab).textDecorationLine.includes('line-through')
      );
    }));
  await page.locator('#ytvf-popover label', { hasText: 'Brightness' }).click();
  check('standalone: clicking parameter label again restores filter and sets mode to custom',
    await page.evaluate(() =>
      document.getElementById('v').style.filter.includes('brightness(130%)') &&
      document.getElementById('ytvf-mode').value === 'custom'
    ));

  // Adjust Gamma -> lazy SVG injected and referenced
  await page.evaluate(() => {
    const sl = document.getElementById('ytvf-sl-gamma');
    sl.value = '1.4';
    sl.dispatchEvent(new Event('input', { bubbles: true }));
  });
  check('standalone: non-neutral gamma injects SVG filter and chains url(#ytvf-svg-filter)',
    await page.evaluate(() =>
      !!document.getElementById('ytvf-svg-filter') &&
      document.getElementById('v').style.filter.includes('ytvf-svg-filter')
    ));

  // Reset gamma back to 1.0 -> url() removed
  await page.evaluate(() => {
    const sl = document.getElementById('ytvf-sl-gamma');
    sl.value = '1';
    sl.dispatchEvent(new Event('input', { bubbles: true }));
  });
  check('standalone: neutral gamma/sharpness removes url(#ytvf-svg-filter)',
    await page.evaluate(() => !document.getElementById('v').style.filter.includes('ytvf-svg-filter')));

  // Mode select updates preview without mutating storage
  await page.selectOption('#ytvf-mode', 'vivid');
  check('standalone: mode select updates live preview without mutating storage',
    await page.evaluate(() =>
      document.getElementById('v').style.filter.includes('contrast(112%)') &&
      document.getElementById('v').style.filter.includes('ytvf-svg-filter') &&
      !('ytvf.global' in window.__store) &&
      !('ytvf.videos' in window.__store)
    ));

  // Save for this video
  await page.locator('#ytvf-popover button', { hasText: 'Save for this video' }).click();
  check('standalone: Save for this video persists under ytvf.videos[id] and shows Use global',
    await page.evaluate(() =>
      window.__store['ytvf.videos']?.vidAAA11111?.contrast === 112 &&
      !![...document.querySelectorAll('#ytvf-popover button')].find((b) => b.textContent === 'Use global')
    ));

  // Option 3: Save as global while current video already has override updates BOTH global and current video override
  await page.evaluate(() => {
    const sl = document.getElementById('ytvf-sl-contrast');
    sl.value = '140';
    sl.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('#ytvf-popover button', { hasText: 'Save as global' }).click();
  check('standalone: Save as global with existing override updates both global and video override (Option 3)',
    await page.evaluate(() =>
      window.__store['ytvf.global']?.contrast === 140 &&
      window.__store['ytvf.videos']?.vidAAA11111?.contrast === 140 &&
      document.querySelector('#ytvf-popover .ytvf-pill')?.textContent === 'Saved for video'
    ));

  // Unsaved preview discarded on SPA navigation
  await page.evaluate(() => {
    const sl = document.getElementById('ytvf-sl-sepia');
    sl.value = '80';
    sl.dispatchEvent(new Event('input', { bubbles: true }));
    history.pushState({}, '', '/watch?v=vidBBB22222');
    document.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await page.waitForTimeout(80);
  check('standalone: SPA navigation closes popover, discards unsaved preview, and applies global to new video',
    await page.evaluate(() =>
      !document.getElementById('ytvf-popover') &&
      document.getElementById('v').style.filter.includes('contrast(140%)') &&
      !document.getElementById('v').style.filter.includes('sepia(')
    ));

  // Ad suspension
  await page.evaluate(() => document.getElementById('movie_player').classList.add('ad-showing'));
  await page.waitForTimeout(40);
  const clearedOnAd = await page.evaluate(() => document.getElementById('v').style.filter === '');
  await page.evaluate(() => document.getElementById('movie_player').classList.remove('ad-showing'));
  await page.waitForTimeout(40);
  const restoredAfterAd = await page.evaluate(() => document.getElementById('v').style.filter.includes('contrast(140%)'));
  check('standalone: ad-showing suspends filter and restores after ad', clearedOnAd && restoredAfterAd);

  // Return to vidAAA11111 and Use global
  await page.evaluate(() => {
    history.pushState({}, '', '/watch?v=vidAAA11111');
    document.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await page.waitForTimeout(60);
  await page.click('#ytvf-btn');
  await page.locator('#ytvf-popover button', { hasText: 'Use global' }).click();
  check('standalone: Use global removes per-video override',
    await page.evaluate(() => !window.__store['ytvf.videos']?.vidAAA11111));

  // Keyboard isolation + Escape closes popover
  const bubbled = await page.evaluate(() => {
    let hit = false;
    document.getElementById('movie_player').addEventListener('keydown', () => { hit = true; }, { once: true });
    document.getElementById('ytvf-sl-brightness').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    return hit;
  });
  check('standalone: keydown inside popover does not bubble to #movie_player', !bubbled);
  await page.keyboard.press('Escape');
  check('standalone: Escape closes popover', await page.evaluate(() => !document.getElementById('ytvf-popover')));

  // Settings panel via menu command + Saved Videos search & sort
  await page.evaluate(() => {
    window.__store['ytvf.videos'] = {
      vidZeta999: { brightness: 120, at: 2000, title: 'Zeta Night Vlog' },
      vidAlph111: { sepia: 40, at: 1000, title: 'Alpha Cinema Reel' },
    };
    window.__menu[0].cb();
  });
  await page.waitForTimeout(60);
  check('standalone: settings panel opens from menu command',
    await page.evaluate(() => !!document.getElementById('ytvf-panel')));
  await page.locator('#ytvf-panel button', { hasText: 'Saved Videos' }).click();
  await page.waitForTimeout(40);
  await page.selectOption('#ytvf-vsort', 'az');
  const sortedAz = await page.locator('#ytvf-vlist .ytvf-vtitle').allTextContents();
  check('standalone: Saved Videos sorts Title A-Z',
    JSON.stringify(sortedAz) === JSON.stringify(['Alpha Cinema Reel', 'Zeta Night Vlog']));
  await page.fill('#ytvf-vsearch', 'sepia');
  const filteredTitles = await page.locator('#ytvf-vlist .ytvf-vtitle').allTextContents();
  check('standalone: Saved Videos searches by filter/title/ID',
    JSON.stringify(filteredTitles) === JSON.stringify(['Alpha Cinema Reel']));
  await ctx.close();
}

// 2. Corrupted storage normalization + 255 video cap (0xFF) FIFO eviction
{
  const videos = {};
  for (let i = 0; i < 255; i++) {
    const id = `vidCap${String(i).padStart(4, '0')}`;
    videos[id] = { brightness: 110, at: 1000 + i };
  }
  const { ctx, page } = await setup(STANDALONE, {
    'ytvf.global': { brightness: 999, contrast: NaN, gamma: 0, sharpness: -50 },
    'ytvf.videos': videos,
  }, '/watch?v=vidNew99999');

  check('standalone: corrupted stored values are clamped safely without NaN/Infinity',
    await page.evaluate(() => {
      const f = document.getElementById('v').style.filter;
      const exp = document.querySelector('#ytvf-gamma feFuncR')?.getAttribute('exponent');
      return f.includes('brightness(200%)') && !f.includes('NaN') && Number.isFinite(Number(exp));
    }));

  await page.click('#ytvf-btn');
  await page.locator('#ytvf-popover button', { hasText: 'Save for this video' }).click();
  check('standalone: 256th distinct video evicts oldest entry keeping 255 cap',
    await page.evaluate(() => {
      const v = window.__store['ytvf.videos'];
      return Object.keys(v).length === 255 && !('vidCap0000' in v) && 'vidCap0001' in v && 'vidNew99999' in v;
    }));
  await ctx.close();
}

// 3. Collection module parity, hub UI, and JSON backup/import round-trip
{
  const { ctx, page } = await setup(COLLECTION);

  check('collection: button placed immediately before .ytp-settings-button',
    await page.evaluate(() => {
      const btn = document.getElementById('ytc-vf-btn');
      return !!btn && btn.nextElementSibling?.classList.contains('ytp-settings-button');
    }));

  await page.click('#ytc-vf-btn');
  await page.selectOption('#ytc-vf-mode', 'cinema');
  await page.locator('#ytc-vf-popover button', { hasText: 'Save for this video' }).click();
  check('collection: Save for this video persists under ytc.vfVideos and applies SVG gamma',
    await page.evaluate(() =>
      window.__store['ytc.vfVideos']?.vidAAA11111?.gamma === 1.1 &&
      document.getElementById('v').style.filter.includes('ytc-vf-svg-filter')
    ));

  // Option 3 in collection
  await page.evaluate(() => {
    const sl = document.getElementById('ytc-vf-sl-brightness');
    sl.value = '125';
    sl.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('#ytc-vf-popover button', { hasText: 'Save as global' }).click();
  check('collection: Save as global with existing override updates both ytc.vfGlobal and ytc.vfVideos[id]',
    await page.evaluate(() =>
      window.__store['ytc.vfGlobal']?.brightness === 125 &&
      window.__store['ytc.vfVideos']?.vidAAA11111?.brightness === 125
    ));

  await page.keyboard.press('Escape');

  // Hub: open Video Filter -> toggle off -> clears filter and removes button
  await page.evaluate(() => window.__menu[0].cb());
  await page.waitForTimeout(60);
  await page.locator('#ytc-panel').getByRole('button', { name: /Video Filter/ }).click();
  await page.waitForTimeout(60);
  await page.getByRole('button', { name: 'Enabled' }).click();
  await page.waitForTimeout(60);
  check('collection: disabling videoFilterOn clears video filter and removes player button',
    await page.evaluate(() =>
      window.__store['ytc.videoFilterOn'] === false &&
      document.getElementById('v').style.filter === '' &&
      !document.getElementById('ytc-vf-btn')
    ));

  // Re-enable, open Saved Videos, remove saved video
  await page.getByRole('button', { name: 'Enabled' }).click();
  await page.waitForTimeout(60);
  await page.getByRole('button', { name: /Saved Videos/ }).click();
  await page.waitForTimeout(60);
  await page.locator('#ytc-panel .ytc-vf-vrm').click();
  await page.waitForTimeout(60);
  check('collection: hub Saved Videos removes per-video override',
    await page.evaluate(() => !window.__store['ytc.vfVideos']?.vidAAA11111));

  // Backup export & import round-trip
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: /Backup/ }).click();
  await page.waitForTimeout(60);
  await page.getByRole('button', { name: /Copy settings JSON/ }).click();
  await page.waitForTimeout(60);
  const exported = await page.locator('#ytc-backup').inputValue();
  check('collection: JSON backup exports vfGlobal and videoFilterOn',
    exported.includes('"vfGlobal"') && exported.includes('"videoFilterOn"'));

  // Import invalid vfGlobal should be skipped
  await page.locator('#ytc-backup').fill(JSON.stringify({
    script: 'youtube-custom-collection',
    format: 1,
    settings: { vfGlobal: { gamma: 999 }, videoFilterOn: true },
  }));
  await page.click('#ytc-import');
  await page.click('#ytc-import');
  await page.waitForTimeout(60);
  const status = await page.locator('#ytc-panel .ytc-status').textContent();
  check('collection: JSON import skips out-of-range vfGlobal', status.includes('skipped 1') && status.includes('vfGlobal'));

  await ctx.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

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

  // No checkbox; clicking parameter name button toggles off with strikethrough and preserves slider value
  check('standalone: no checkbox toggle rendered in popover',
    await page.evaluate(() => document.querySelectorAll('#ytvf-popover input[type="checkbox"]').length === 0));
  await page.click('#ytvf-name-brightness');
  check('standalone: clicking parameter name toggles off with strikethrough and preserves slider value',
    await page.evaluate(() => {
      const btn = document.getElementById('ytvf-name-brightness');
      return (
        document.getElementById('v').style.filter === '' &&
        document.getElementById('ytvf-sl-brightness').value === '130' &&
        getComputedStyle(btn).textDecorationLine.includes('line-through')
      );
    }));
  await page.click('#ytvf-name-brightness');
  check('standalone: clicking parameter name again restores filter and sets mode to custom',
    await page.evaluate(() =>
      document.getElementById('v').style.filter.includes('brightness(130%)') &&
      document.getElementById('ytvf-mode').value === 'custom'
    ));

  // Click numeric value to type a number + Enter, then per-row reset button
  await page.click('#ytvf-val-brightness');
  await page.locator('#ytvf-popover input.ytvf-num').fill('145');
  await page.locator('#ytvf-popover input.ytvf-num').press('Enter');
  check('standalone: clicking percentage allows typing value and updates filter',
    await page.evaluate(() =>
      document.getElementById('v').style.filter.includes('brightness(145%)') &&
      document.getElementById('ytvf-val-brightness').textContent === '145%'
    ));
  await page.click('#ytvf-rst-brightness');
  check('standalone: per-row reset button resets brightness to 100%',
    await page.evaluate(() =>
      document.getElementById('v').style.filter === '' &&
      document.getElementById('ytvf-val-brightness').textContent === '100%'
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

  // Save for this video -> auto-selects dedicated Saved for video mode, no Use global button
  await page.locator('#ytvf-popover button', { hasText: 'Save for this video' }).click();
  check('standalone: Save for this video persists under ytvf.videos[id], selects Saved for video mode, and has no Use global button',
    await page.evaluate(() =>
      window.__store['ytvf.videos']?.vidAAA11111?.contrast === 112 &&
      document.getElementById('ytvf-mode')?.value === 'video' &&
      ![...document.querySelectorAll('#ytvf-popover button')].some((b) => b.textContent === 'Use global')
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

  // Return to vidAAA11111 -> mode auto-selects Saved for video; selecting Normal (=Global) previews global without deleting;
  // selecting Neutral clears filter; 2-step Delete saved removes per-video override and reverts to Normal
  await page.evaluate(() => {
    history.pushState({}, '', '/watch?v=vidAAA11111');
    document.dispatchEvent(new Event('yt-navigate-finish'));
  });
  await page.waitForTimeout(60);
  await page.click('#ytvf-btn');
  check('standalone: video with saved filter auto-selects dedicated Saved for video mode',
    await page.evaluate(() => document.getElementById('ytvf-mode')?.value === 'video'));
  await page.selectOption('#ytvf-mode', 'normal');
  check('standalone: selecting Mode Normal (Global) previews global without deleting per-video override',
    await page.evaluate(() => !!window.__store['ytvf.videos']?.vidAAA11111));
  await page.selectOption('#ytvf-mode', 'neutral');
  check('standalone: selecting Mode Neutral clears filter live',
    await page.evaluate(() => document.getElementById('v').style.filter === ''));
  await page.click('#ytvf-del-saved');
  check('standalone: Delete saved asks for confirmation on first click',
    await page.evaluate(() =>
      document.getElementById('ytvf-del-saved')?.textContent === 'Click again to delete' &&
      !!window.__store['ytvf.videos']?.vidAAA11111
    ));
  await page.click('#ytvf-del-saved');
  check('standalone: second click on Delete saved removes per-video override and reverts to Normal',
    await page.evaluate(() =>
      !window.__store['ytvf.videos']?.vidAAA11111 &&
      document.getElementById('ytvf-mode')?.value === 'normal' &&
      document.getElementById('v').style.filter.includes('contrast(140%)')
    ));

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

import { createServer } from 'node:http';
import { readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '../tests/harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = dirname(HERE);
const OUT = join(HERE, 'screenshots');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const rel = url.pathname === '/' ? '/preview/index.html' : url.pathname;
  const full = join(REPO, rel);
  if (full.startsWith(REPO) && existsSync(full)) {
    const ext = extname(full);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(readFileSync(full));
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 } });
const page = await ctx.newPage();

let captured = 0;

async function loadPreview(theme = 'dark') {
  await page.goto(`${base}/preview/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(150);
  if (theme === 'light') {
    await page.click('#toggle-theme');
    await page.waitForTimeout(80);
  }
}

async function clickIn(selector, textPattern) {
  const ok = await page.evaluate(({ sel, src }) => {
    const root = document.querySelector(sel);
    if (!root) return false;
    const re = new RegExp(src, 'i');
    const btns = [...root.querySelectorAll('button')];
    const hit = btns.find((b) => re.test((b.textContent || '').trim()));
    if (!hit) return false;
    hit.click();
    return true;
  }, { sel: selector, src: textPattern.source });
  if (!ok) throw new Error(`Button "${textPattern}" not found in ${selector}`);
  await page.waitForTimeout(70);
}

async function closeOverlays() {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(50);
  await page.evaluate(() => {
    for (const id of [
      'ytc-backdrop', 'ytgc-backdrop', 'ytpc-backdrop',
      'ytpt-backdrop', 'ytpt-cfg-backdrop', 'ytlt-backdrop',
      'ytqp-backdrop', 'ytvf-backdrop', 'ytmc-backdrop',
    ]) {
      document.getElementById(id)?.remove();
    }
    document.getElementById('pl-modal-backdrop')?.classList.remove('open');
    document.getElementById('lightbox')?.classList.remove('open');
  });
  await page.waitForTimeout(40);
}

async function snap(file) {
  await page.screenshot({ path: join(OUT, file) });
  captured++;
  console.log(`ok  ${file}`);
}

try {
  // 1. YouTube: Custom Collection (Dark + Light)
  await loadPreview('dark');
  await clickIn('#menu-yt-collection', /^YouTube: Custom Collection$/);
  await snap('01-yt-collection-hub-dark.png');

  await clickIn('#ytc-panel', /Playback Custom/);
  await snap('03-yt-collection-playback-dark.png');

  await clickIn('#ytc-panel', /^Back$|^\u2039$|^←$/);
  await clickIn('#ytc-panel', /Backup/);
  await snap('04-yt-collection-backup-dark.png');

  await clickIn('#ytc-panel', /^Back$|^\u2039$|^←$/);
  await clickIn('#ytc-panel', /Diagnostics/);
  await snap('05-yt-collection-diagnostics-dark.png');

  await loadPreview('light');
  await clickIn('#menu-yt-collection', /^YouTube: Custom Collection$/);
  await snap('02-yt-collection-hub-light.png');

  // 2. YouTube: General Custom
  await loadPreview('dark');
  await clickIn('#menu-yt-general', /General Custom/);
  await snap('06-yt-general-home-dark.png');

  await clickIn('#ytgc-panel', /Custom Grid/);
  await snap('07-yt-general-grid-dark.png');

  await clickIn('#ytgc-panel', /^Back$|^\u2039$|^←$/);
  await clickIn('#ytgc-panel', /Shorts/);
  await snap('08-yt-general-shorts-dark.png');

  await clickIn('#ytgc-panel', /^Back$|^\u2039$|^←$/);
  await clickIn('#ytgc-panel', /Share Link/);
  await snap('09-yt-general-share-dark.png');

  // 3. YouTube: Playback Custom
  await closeOverlays();
  await clickIn('#menu-yt-playback', /Playback Custom/);
  await snap('10-yt-playback-home-dark.png');

  await clickIn('#ytpc-panel', /Video & Audio/);
  await snap('11-yt-playback-video-dark.png');

  await clickIn('#ytpc-panel', /^Back$|^\u2039$|^←$/);
  await clickIn('#ytpc-panel', /Autoplay/);
  await snap('12-yt-playback-autoplay-dark.png');

  await clickIn('#ytpc-panel', /^Back$|^\u2039$|^←$/);
  await clickIn('#ytpc-panel', /Watch Page/);
  await snap('13-yt-playback-watch-dark.png');

  await clickIn('#ytpc-panel', /^Back$|^\u2039$|^←$/);
  await clickIn('#ytpc-panel', /Video Bookmarks/);
  await snap('14-yt-playback-bookmarks-dark.png');

  // 4. YouTube: Playlist Tools (Settings + 3 In-Page Dialogs over live Playlist Stage)
  await closeOverlays();
  await page.locator('.stage-wide').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(60);
  await page.click('#pl-open-settings');
  await page.waitForTimeout(70);
  await snap('15-yt-playlist-settings-dark.png');

  await closeOverlays();
  await page.click('[data-pl-type="wl"]');
  await page.click('#pl-open-dialog');
  await page.waitForTimeout(70);
  await snap('16-yt-playlist-wl-dialog-dark.png');

  await closeOverlays();
  await page.click('[data-pl-type="normal"]');
  await page.click('#pl-open-dialog');
  await page.waitForTimeout(70);
  await snap('17-yt-playlist-normal-dialog-dark.png');

  await closeOverlays();
  await page.click('[data-pl-type="liked"]');
  await page.click('#pl-open-dialog');
  await page.waitForTimeout(70);
  await snap('18-yt-playlist-liked-dialog-dark.png');

  // 5. YouTube: Quiet Page
  await loadPreview('dark');
  await clickIn('#menu-yt-quiet', /Quiet Page/);
  await snap('19-yt-quiet-home-dark.png');

  await clickIn('#ytqp-panel', /Playback/);
  await snap('20-yt-quiet-playback-dark.png');

  await clickIn('#ytqp-panel', /^Back$|^\u2039$|^←$/);
  await clickIn('#ytqp-panel', /Feed & Cards/);
  await snap('21-yt-quiet-feed-dark.png');

  await clickIn('#ytqp-panel', /^Back$|^\u2039$|^←$/);
  await clickIn('#ytqp-panel', /Watch & Channel/);
  await snap('22-yt-quiet-watch-dark.png');

  await clickIn('#ytqp-panel', /^Back$|^\u2039$|^←$/);
  await clickIn('#ytqp-panel', /Sidebar/);
  await snap('23-yt-quiet-sidebar-dark.png');

  // 6. YouTube Music: Custom Collection (Dark + Light)
  await closeOverlays();
  await clickIn('#menu-ytm-collection', /^YouTube Music: Custom Collection$/);
  await snap('24-ytm-collection-hub-dark.png');

  await clickIn('#ytmc-panel', /Prefer Song/);
  await snap('26-ytm-collection-song-dark.png');

  await clickIn('#ytmc-panel', /^Back$|^\u2039$|^←$/);
  await clickIn('#ytmc-panel', /Quiet Page/);
  await snap('27-ytm-collection-quiet-dark.png');

  await clickIn('#ytmc-panel', /^Back$|^\u2039$|^←$/);
  await clickIn('#ytmc-panel', /Dismiss Paused Prompt/);
  await snap('28-ytm-collection-paused-dark.png');

  await clickIn('#ytmc-panel', /^Back$|^\u2039$|^←$/);
  await clickIn('#ytmc-panel', /Skip by Keyword/);
  await snap('29-ytm-collection-skip-dark.png');

  await clickIn('#ytmc-panel', /^Back$|^\u2039$|^←$/);
  await clickIn('#ytmc-panel', /Backup/);
  await snap('30-ytm-collection-backup-dark.png');

  await clickIn('#ytmc-panel', /^Back$|^\u2039$|^←$/);
  await clickIn('#ytmc-panel', /Diagnostics/);
  await snap('31-ytm-collection-diagnostics-dark.png');

  await loadPreview('light');
  await clickIn('#menu-ytm-collection', /^YouTube Music: Custom Collection$/);
  await snap('25-ytm-collection-hub-light.png');

  // 6b. YouTube: Video Filter (Player Popover + Settings Panel + Collection Module)
  await loadPreview('dark');
  await page.locator('#vf-stage').scrollIntoViewIfNeeded();
  await page.waitForTimeout(80);
  await page.click('#ytvf-btn');
  await page.waitForTimeout(80);
  await page.selectOption('#ytvf-mode', 'vivid');
  await page.waitForTimeout(80);
  await snap('32-yt-video-filter-popover-dark.png');

  await page.keyboard.press('Escape');
  await closeOverlays();
  await clickIn('#menu-yt-video-filter', /Video Filter/);
  await page.waitForTimeout(80);
  await snap('33-yt-video-filter-settings-dark.png');

  await closeOverlays();
  await clickIn('#menu-yt-collection', /^YouTube: Custom Collection$/);
  await page.locator('#ytc-panel').getByRole('button', { name: /Video Filter/ }).click();
  await page.waitForTimeout(80);
  await snap('34-yt-collection-video-filter-dark.png');

  // 7. Preview Overview & Live Interactive Stage (captured last so all gallery thumbnails exist)
  await loadPreview('dark');
  await snap('00-preview-overview-dark.png');

  await page.locator('.stage-wide').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(80);
  await snap('00-preview-live-stage-dark.png');

  await loadPreview('light');
  await snap('00-preview-overview-light.png');

  console.log(`\nCaptured ${captured} screenshots in ${OUT}`);
} finally {
  await browser.close();
  server.close();
}

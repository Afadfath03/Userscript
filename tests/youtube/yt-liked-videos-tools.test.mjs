import { chromium, scriptPath } from '../harness.mjs';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const STANDALONE = readFileSync(scriptPath('youtube-liked-videos-tools.user.js'), 'utf8');
const COLLECTION = readFileSync(scriptPath('youtube-custom-collection.user.js'), 'utf8');

function likedFixtureHtml({ listTotal = 4028, hiddenBanner = false } = {}) {
  return `<!doctype html><html dark><body>
  <ytd-browse page-subtype="playlist">
    <ytd-playlist-header-renderer>
      <div class="metadata-wrapper">
        <div class="metadata-stats">${listTotal} videos</div>
        <div class="metadata-action-bar" id="ll-header-bar"></div>
      </div>
    </ytd-playlist-header-renderer>
    ${hiddenBanner ? '<div id="alerts"><ytd-alert-with-button-renderer>Unavailable videos are hidden</ytd-alert-with-button-renderer></div>' : ''}
    <ytd-item-section-renderer>
      <div id="contents">
        <yt-lockup-view-model id="ll-row-1">
          <a href="/watch?v=LIKED000001&amp;list=LL">
            <badge-shape><div class="badge-shape-wiz__text">4:19</div></badge-shape>
            <yt-thumbnail-overlay-progress-bar-view-model>
              <div class="ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment" style="width: 92%"></div>
            </yt-thumbnail-overlay-progress-bar-view-model>
          </a>
          <h3><a class="yt-lockup-metadata-view-model__title" href="/watch?v=LIKED000001&amp;list=LL">Union MAD Hero</a></h3>
          <yt-content-metadata-view-model><a href="/@hero">Hero Channel</a></yt-content-metadata-view-model>
          <ytd-menu-renderer><button type="button" aria-label="Action menu">...</button></ytd-menu-renderer>
        </yt-lockup-view-model>
        <yt-lockup-view-model id="ll-row-2">
          <a href="/watch?v=LIKED000002&amp;list=LL">
            <badge-shape><div class="badge-shape-wiz__text">25:38</div></badge-shape>
            <yt-thumbnail-overlay-progress-bar-view-model>
              <div class="ytThumbnailOverlayProgressBarHostWatchedProgressBarSegment" style="width: 15%"></div>
            </yt-thumbnail-overlay-progress-bar-view-model>
          </a>
          <h3><a class="yt-lockup-metadata-view-model__title" href="/watch?v=LIKED000002&amp;list=LL">Manifold Garden Guide</a></h3>
          <yt-content-metadata-view-model><a href="/@guide">Guide Channel</a></yt-content-metadata-view-model>
          <ytd-menu-renderer><button type="button" aria-label="Action menu">...</button></ytd-menu-renderer>
        </yt-lockup-view-model>
        <ytm-shorts-lockup-view-model id="ll-row-3">
          <a href="/shorts/SHORT000003">Short Clip</a>
          <h3><a href="/shorts/SHORT000003">Quick Short Clip</a></h3>
          <ytd-channel-name><a href="/@shorty">Shorty</a></ytd-channel-name>
          <ytd-menu-renderer><button type="button" aria-label="Action menu">...</button></ytd-menu-renderer>
        </ytm-shorts-lockup-view-model>
        <ytd-playlist-video-renderer id="ll-row-4">
          <a id="thumbnail" href="/watch?v=DEL00000004&amp;list=LL"></a>
          <a id="video-title" href="/watch?v=DEL00000004&amp;list=LL">[Deleted video]</a>
          <ytd-menu-renderer><button type="button" aria-label="Action menu">...</button></ytd-menu-renderer>
        </ytd-playlist-video-renderer>
      </div>
    </ytd-item-section-renderer>
  </ytd-browse>
</body></html>`;
}

let htmlPayload = likedFixtureHtml();
let unlikeCalls = [];
let copyCalls = [];
let failUnlikeApi = false;

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/youtubei/v1/like/removelike')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    unlikeCalls.push({ headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') });
    if (failUnlikeApi) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 500 } }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'STATUS_SUCCEEDED' }));
    return;
  }
  if (req.url.startsWith('/youtubei/v1/browse/edit_playlist')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    copyCalls.push({ headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'STATUS_SUCCEEDED' }));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(htmlPayload);
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ headless: true });
let failures = 0;
const check = (name, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`);
  if (!ok) failures++;
};

async function openTab(scriptSource, urlPath, { store = {} } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  const tab = await ctx.newPage();
  tab.on('pageerror', (e) => check(`no page error (${e.message})`, false));
  await tab.addInitScript(({ initialStore }) => {
    window.__store = { ...initialStore };
    window.__menu = [];
    window.__clips = [];
    window.GM_getValue = (k, d) => (k in window.__store ? window.__store[k] : d);
    window.GM_setValue = (k, v) => { window.__store[k] = v; };
    window.GM_deleteValue = (k) => { delete window.__store[k]; };
    window.GM_registerMenuCommand = (name, cb) => { window.__menu.push({ name, cb }); return window.__menu.length; };
    window.GM_unregisterMenuCommand = () => {};
    window.GM_info = { script: { version: '4.6' } };
    window.GM_setClipboard = (text) => { window.__clips.push(text); };
    window.GM_xmlhttpRequest = ({ url, onload }) => {
      if (url.includes('DEL00000004')) {
        onload({ status: 200, responseText: JSON.stringify({ keys: [{ rawdata: { title: 'Recovered Liked Video' } }] }) });
      } else {
        onload({ status: 404, responseText: '' });
      }
    };
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
    document.cookie = 'SAPISID=test_sapisid_ll; path=/';
    window.ytcfg = {
      get: (k) => ({
        INNERTUBE_API_KEY: 'TEST_KEY',
        INNERTUBE_CONTEXT: { client: { clientName: 'WEB', clientVersion: '2.20260101' } },
        INNERTUBE_CLIENT_NAME: '1',
        INNERTUBE_CLIENT_VERSION: '2.20260101',
        SESSION_INDEX: '0',
      })[k],
    };
  }, { initialStore: store });

  await tab.goto(`${base}${urlPath}`);
  await tab.addScriptTag({ content: scriptSource });
  await tab.waitForTimeout(250);
  return { ctx, tab };
}

for (const [name, script, ids] of [
  ['standalone', STANDALONE, {
    btn: '#ytlt-open-btn',
    dur: '#ytlt-duration-badge',
    filter: '#ytlt-filter-bar',
    dialog: '#ytlt-dialog',
    toast: '#ytlt-toast',
    hiddenAttr: 'data-ytlt-hidden',
    clearMode: '#ytlt-clear-mode',
    kwInput: '#ytlt-kw-input',
    kwTarget: '#ytlt-kw-target',
    showFilter: '#ytlt-show-filter',
    showDur: '#ytlt-show-dur',
    warn: '.ytlt-warn',
  }],
  ['collection', COLLECTION, {
    btn: '#ytc-lt-open-btn',
    dur: '#ytc-lt-duration-badge',
    filter: '#ytc-lt-filter-bar',
    dialog: '#ytc-lt-dialog',
    toast: '#ytc-lt-toast',
    hiddenAttr: 'data-ytc-lt-hidden',
    clearMode: '#ytc-lt-clear-mode',
    kwInput: '#ytc-lt-kw-input',
    kwTarget: '#ytc-lt-kw-target',
    showFilter: '#ytc-lt-show-filter',
    showDur: '#ytc-lt-show-dur',
    warn: '.ytc-lt-warn',
  }],
]) {
  htmlPayload = likedFixtureHtml({ listTotal: 4028, hiddenBanner: true });
  unlikeCalls = [];
  copyCalls = [];
  failUnlikeApi = false;

  const { ctx, tab } = await openTab(script, '/playlist?list=LL');

  // 1. Header button, duration badge & filter bar mount on modern LL DOM
  const durText = await tab.locator(ids.dur).textContent();
  check(`${name}: mounts Liked Videos Tools button on /playlist?list=LL`, (await tab.locator(ids.btn).count()) === 1);
  check(`${name}: duration reads badge-shape times (29m 57s) and loaded/total (4/4028)`,
    durText.includes('29m 57s') && durText.includes('4/4028 loaded'));
  check(`${name}: duration hides 1.25x/1.5x/2x speed estimates`,
    !durText.includes('1.25x') && !durText.includes('1.5x') && !durText.includes('2x'));
  check(`${name}: filter bar mounts above item-section contents`, (await tab.locator(ids.filter).count()) === 1);

  // 2. Filter chips & quick action buttons in filter bar
  check(`${name}: Export Filtered & Unlike Filtered hidden when filter inactive`,
    (await tab.locator(`${ids.filter} [data-act="export-filtered"]`).isHidden()) &&
    (await tab.locator(`${ids.filter} [data-act="unlike-filtered"]`).isHidden()));

  await tab.locator(`${ids.filter} button`, { hasText: 'Shorts' }).click();
  await tab.waitForTimeout(60);
  check(`${name}: Shorts chip shows only ll-row-3 and reveals quick actions`,
    (await tab.locator(`#ll-row-3[${ids.hiddenAttr}]`).count()) === 0 &&
    (await tab.locator(`#ll-row-1[${ids.hiddenAttr}]`).count()) === 1 &&
    (await tab.locator(`${ids.filter} [data-act="export-filtered"]`).isVisible()) &&
    (await tab.locator(`${ids.filter} [data-act="unlike-filtered"]`).isVisible()));

  await tab.locator(`${ids.filter} [data-act="unlike-filtered"]`).click();
  await tab.waitForTimeout(80);
  check(`${name}: Unlike Filtered opens confirmation for 1 video`,
    (await tab.locator(`${ids.dialog} button`, { hasText: /Unlike 1 video/ }).count()) === 1);
  await tab.locator(`${ids.dialog} button`, { hasText: 'Cancel' }).click();
  await tab.locator(`${ids.dialog} [aria-label="Close"]`).click();

  await tab.locator(`${ids.filter} button`, { hasText: 'Unavailable' }).click();
  await tab.waitForTimeout(60);
  check(`${name}: Unavailable chip shows only ll-row-4`,
    (await tab.locator(`#ll-row-4[${ids.hiddenAttr}]`).count()) === 0 &&
    (await tab.locator(`#ll-row-2[${ids.hiddenAttr}]`).count()) === 1);

  await tab.locator(`${ids.filter} button`, { hasText: 'All' }).click();
  await tab.waitForTimeout(60);

  // 3. Export with title lookup, grouped Markdown, Video ID, Wayback Machine & hidden banner warning
  await tab.locator(ids.btn).click();
  await tab.locator(`${ids.dialog} [role="tab"]`, { hasText: 'Export' }).click();
  check(`${name}: Export tab warns when unavailable videos are hidden`,
    await tab.locator(`${ids.dialog} ${ids.warn}`).isVisible());
  await tab.locator(`${ids.dialog} input[type="checkbox"]`).check();
  await tab.locator(`${ids.dialog} button:not([role="tab"])`, { hasText: /^Export$/ }).click();
  await tab.waitForTimeout(250);
  await tab.locator(`${ids.toast} button`, { hasText: 'Copy to Clipboard' }).click();
  await tab.waitForTimeout(80);
  const clip = await tab.evaluate(() => window.__clips[window.__clips.length - 1] || '');
  check(`${name}: export produces grouped Markdown with Video ID, resolved title, Shorts link and Wayback Machine`,
    clip.includes('## Available') &&
    clip.includes('## Deleted') &&
    clip.includes('`DEL00000004`') &&
    clip.includes('Recovered Liked Video') &&
    clip.includes('https://www.youtube.com/shorts/SHORT000003') &&
    clip.includes('https://web.archive.org/web/*/https://www.youtube.com/watch?v=DEL00000004'));

  // 4. Copy to Playlist (rejects LL, accepts PL target)
  await tab.locator(ids.btn).click();
  await tab.locator(`${ids.dialog} [role="tab"]`, { hasText: 'Copy to Playlist' }).click();
  await tab.locator(`${ids.dialog} input[type="text"]`).fill('https://www.youtube.com/playlist?list=PLDEST123');
  await tab.locator(`${ids.dialog} select`).selectOption('shorts');
  await tab.locator(`${ids.dialog} button:not([role="tab"])`, { hasText: /^Copy to Playlist$/ }).click();
  await tab.waitForTimeout(300);
  check(`${name}: Copy to Playlist sends edit_playlist ACTION_ADD_VIDEO to PLDEST123`,
    copyCalls.length === 1 &&
    copyCalls[0].body.playlistId === 'PLDEST123' &&
    copyCalls[0].body.actions[0].addedVideoId === 'SHORT000003');

  // 5. Advanced clear modes + hidden banner warning in confirmation
  await tab.locator(ids.btn).click();
  await tab.locator(ids.clearMode).selectOption('skip-deleted');
  await tab.locator(`${ids.dialog} button`, { hasText: /^Unlike$/ }).click();
  await tab.waitForTimeout(80);
  check(`${name}: skip-deleted targets 3 videos and shows unavailable hidden warning`,
    (await tab.locator(`${ids.dialog} button`, { hasText: /Unlike 3 video/ }).count()) === 1 &&
    (await tab.locator(`${ids.dialog} ${ids.warn}`).isVisible()));
  await tab.locator(`${ids.dialog} button`, { hasText: 'Cancel' }).click();

  // 6. Keyword target dropdown, live preview & Preview in list
  await tab.locator(ids.kwInput).fill('Guide Channel');
  await tab.locator(ids.kwTarget).selectOption('title');
  await tab.waitForTimeout(40);
  const titleOnlyPreview = await tab.locator(ids.dialog).textContent();
  await tab.locator(ids.kwTarget).selectOption('channel');
  await tab.waitForTimeout(40);
  const channelPreview = await tab.locator(ids.dialog).textContent();
  check(`${name}: keyword target distinguishes Title (0 matches) vs Channel (1 match: Manifold Garden Guide)`,
    titleOnlyPreview.includes('0 matches found.') &&
    channelPreview.includes('1 match(es): Manifold Garden Guide'));
  await tab.locator(`${ids.dialog} button`, { hasText: 'Preview in list' }).click();
  await tab.waitForTimeout(60);
  check(`${name}: Preview in list filters rows by selected target`,
    (await tab.locator(`#ll-row-2[${ids.hiddenAttr}]`).count()) === 0 &&
    (await tab.locator(`#ll-row-1[${ids.hiddenAttr}]`).count()) === 1);
  await tab.locator(`${ids.filter} [data-act="reset-filter"]`).click();

  // 7. Display Settings toggles in dialog
  await tab.locator(ids.btn).click();
  await tab.locator(ids.showFilter).uncheck();
  await tab.locator(ids.showDur).uncheck();
  await tab.waitForTimeout(60);
  check(`${name}: Display Settings toggles hide filter bar and duration badge`,
    (await tab.locator(ids.filter).count()) === 0 &&
    (await tab.locator(ids.dur).count()) === 0);
  await tab.locator(ids.showFilter).check();
  await tab.locator(ids.showDur).check();
  await tab.waitForTimeout(60);
  check(`${name}: Display Settings toggles restore filter bar and duration badge`,
    (await tab.locator(ids.filter).count()) === 1 &&
    (await tab.locator(ids.dur).count()) === 1);

  // 8. Bulk Unlike (watched >= 80% -> unlikes ll-row-1 via like/removelike)
  await tab.locator(`${ids.dialog} button`, { hasText: 'Unlike watched' }).click();
  await tab.waitForTimeout(80);
  check(`${name}: confirmation screen appears before bulk unlike`,
    (await tab.locator(`${ids.dialog} button`, { hasText: /Unlike 1 video/ }).count()) === 1);
  await tab.locator(`${ids.dialog} button`, { hasText: /Unlike 1 video/ }).click();
  await tab.waitForTimeout(450);
  check(`${name}: Bulk Unlike calls /youtubei/v1/like/removelike with SAPISIDHASH and removes row`,
    unlikeCalls.length === 1 &&
    unlikeCalls[0].body.target?.videoId === 'LIKED000001' &&
    String(unlikeCalls[0].headers.authorization || '').startsWith('SAPISIDHASH ') &&
    (await tab.locator('#ll-row-1').count()) === 0);

  // 9. DOM fallback when InnerTube API fails
  failUnlikeApi = true;
  await tab.evaluate(() => {
    const row = document.getElementById('ll-row-2');
    const menuBtn = row.querySelector('ytd-menu-renderer button');
    menuBtn.addEventListener('click', () => {
      document.querySelector('ytd-menu-popup-renderer')?.remove();
      const popup = document.createElement('ytd-menu-popup-renderer');
      const item = document.createElement('ytd-menu-service-item-renderer');
      item.textContent = 'Remove from Liked videos';
      item.addEventListener('click', () => {
        row.remove();
        popup.remove();
      });
      popup.append(item);
      document.body.append(popup);
    });
  });
  await tab.locator(ids.btn).click();
  await tab.locator(ids.kwInput).fill('Manifold');
  await tab.locator(`${ids.dialog} button`, { hasText: 'Unlike matching' }).click();
  await tab.waitForTimeout(80);
  await tab.locator(`${ids.dialog} button`, { hasText: /Unlike 1 video/ }).click();
  await tab.waitForTimeout(450);
  check(`${name}: DOM fallback removes row via menu when InnerTube API fails`,
    (await tab.locator('#ll-row-2').count()) === 0);
  await ctx.close();

  // 6. Zero Liked Videos Tools UI on regular playlists (/playlist?list=WL)
  const { ctx: wlCtx, tab: wlTab } = await openTab(script, '/playlist?list=WL');
  check(`${name}: zero liked-videos-tools UI on /playlist?list=WL`,
    (await wlTab.locator(`${ids.btn}, ${ids.dur}, ${ids.filter}`).count()) === 0);
  await wlCtx.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

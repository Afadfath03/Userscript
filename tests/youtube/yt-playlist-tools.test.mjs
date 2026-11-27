import { chromium, scriptPath } from '../harness.mjs';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const STANDALONE = readFileSync(scriptPath('youtube-playlist-tools.user.js'), 'utf8');
const COLLECTION = readFileSync(scriptPath('youtube-custom-collection.user.js'), 'utf8');

function fixtureHtml({ listTotal = 7, hiddenBanner = false, membersHiddenFirst = false, dark = false } = {}) {
  return `<!doctype html><html${dark ? ' dark' : ''}><body>
  <ytd-playlist-header-renderer>
    <div class="metadata-wrapper">
      <div class="metadata-stats">${listTotal} videos</div>
      <div class="metadata-action-bar"></div>
    </div>
  </ytd-playlist-header-renderer>
  ${hiddenBanner ? '<ytd-alert-with-button-renderer>Unavailable videos are hidden</ytd-alert-with-button-renderer>' : ''}
  <ytd-playlist-video-list-renderer>
    <div id="contents">
      <ytd-playlist-video-renderer id="row-1"${membersHiddenFirst ? ' data-ytc-off="VID00000001" style="display:none!important"' : ''}>
        <a id="thumbnail" href="/watch?v=VID00000001&amp;list=WL">
          <ytd-thumbnail-overlay-time-status-renderer>10:00</ytd-thumbnail-overlay-time-status-renderer>
          <ytd-thumbnail-overlay-resume-playback-renderer><div id="progress" style="width: 90%"></div></ytd-thumbnail-overlay-resume-playback-renderer>
        </a>
        <a id="video-title" href="/watch?v=VID00000001&amp;list=WL">Alpha | Intro</a>
        <ytd-channel-name><a href="/@chanA">Channel A</a></ytd-channel-name>
      </ytd-playlist-video-renderer>
      <ytd-playlist-video-renderer id="row-2">
        <a id="thumbnail" href="/watch?v=VID00000002&amp;list=WL">
          <ytd-thumbnail-overlay-time-status-renderer>25:00:00</ytd-thumbnail-overlay-time-status-renderer>
          <ytd-thumbnail-overlay-resume-playback-renderer><div id="progress" style="width: 20%"></div></ytd-thumbnail-overlay-resume-playback-renderer>
        </a>
        <a id="video-title" href="/watch?v=VID00000002&amp;list=WL">Beta Deep Dive</a>
        <ytd-channel-name><a href="/@chanB">Channel B</a></ytd-channel-name>
      </ytd-playlist-video-renderer>
      <ytd-playlist-video-renderer id="row-3">
        <a id="thumbnail" href="/watch?v=VID00000002&amp;list=WL">
          <ytd-thumbnail-overlay-time-status-renderer>25:00:00</ytd-thumbnail-overlay-time-status-renderer>
        </a>
        <a id="video-title" href="/watch?v=VID00000002&amp;list=WL">Beta Deep Dive</a>
        <ytd-channel-name><a href="/@chanB">Channel B</a></ytd-channel-name>
      </ytd-playlist-video-renderer>
      <ytd-playlist-video-renderer id="row-4">
        <a id="thumbnail" href="/watch?v=VID00000004&amp;list=WL">
          <ytd-thumbnail-overlay-time-status-renderer>LIVE</ytd-thumbnail-overlay-time-status-renderer>
        </a>
        <a id="video-title" href="/watch?v=VID00000004&amp;list=WL">Live Stream</a>
        <ytd-channel-name><a href="/@chanA">Channel A</a></ytd-channel-name>
      </ytd-playlist-video-renderer>
      <ytd-playlist-video-renderer id="row-5">
        <a id="thumbnail" href="/watch?v=DEL00000005&amp;list=WL"></a>
        <a id="video-title" href="/watch?v=DEL00000005&amp;list=WL">[Deleted video]</a>
      </ytd-playlist-video-renderer>
      <ytd-playlist-video-renderer id="row-6">
        <a id="thumbnail" href="/watch?v=PRV00000006&amp;list=WL"></a>
        <a id="video-title" href="/watch?v=PRV00000006&amp;list=WL">[Private video]</a>
      </ytd-playlist-video-renderer>
      <ytd-playlist-video-renderer id="row-7">
        <a id="thumbnail" href="/watch?v=OTH00000007&amp;list=WL"></a>
        <a id="video-title" href="/watch?v=OTH00000007&amp;list=WL"></a>
      </ytd-playlist-video-renderer>
    </div>
  </ytd-playlist-video-list-renderer>
  <script>
    const setIds = {
      'row-1': 'SET_1', 'row-2': 'SET_2A', 'row-3': 'SET_2B',
      'row-4': 'SET_4', 'row-5': 'SET_5', 'row-6': 'SET_6', 'row-7': 'SET_7'
    };
    for (const [id, sid] of Object.entries(setIds)) {
      const el = document.getElementById(id);
      if (el) el.data = { setVideoId: sid };
    }
  </script>
</body></html>`;
}

let htmlPayload = fixtureHtml();
let editPlaylistCalls = [];
let editPlaylistMode = 'ok';

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/youtubei/v1/browse/edit_playlist')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    editPlaylistCalls.push({ url: req.url, headers: req.headers, body });
    if (editPlaylistMode === 'forbidden') {
      res.writeHead(403, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 403 } }));
      return;
    }
    const action = body.actions?.[0];
    if (action?.addedVideoId === 'BAD00000000') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'STATUS_FAILED' }));
      return;
    }
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

async function openTab(scriptSource, urlPath, { store = {}, withAuth = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const tab = await ctx.newPage();
  tab.on('pageerror', (e) => check(`no page error (${e.message})`, false));
  await tab.addInitScript(({ initialStore, auth }) => {
    window.__store = { ...initialStore };
    window.__menu = [];
    window.__copied = [];
    window.__xhrCalls = [];
    window.GM_getValue = (k, d) => (k in window.__store ? window.__store[k] : d);
    window.GM_setValue = (k, v) => { window.__store[k] = v; };
    window.GM_deleteValue = (k) => { delete window.__store[k]; };
    window.GM_listValues = () => Object.keys(window.__store);
    window.GM_registerMenuCommand = (name, cb) => { window.__menu.push({ name, cb }); return window.__menu.length; };
    window.GM_unregisterMenuCommand = () => {};
    window.GM_info = { script: { version: '4.1' } };
    window.GM_setClipboard = (text) => { window.__copied.push(text); };
    window.GM_xmlhttpRequest = ({ url, onload }) => {
      window.__xhrCalls.push(url);
      const id = decodeURIComponent(url.split('/api/v4/')[1].split('?')[0]);
      const map = {
        DEL00000005: { keys: [{ title: 'Recovered | Deleted Title' }] },
        PRV00000006: { keys: [] },
      };
      setTimeout(() => onload({ status: 200, responseText: JSON.stringify(map[id] || {}) }), 10);
    };
    if (auth) {
      document.cookie = 'SAPISID=test_sapisid_cookie; path=/';
      window.ytcfg = {
        get: (k) => ({
          INNERTUBE_API_KEY: 'TEST_KEY',
          INNERTUBE_CONTEXT: { client: { clientName: 'WEB' } },
          SESSION_INDEX: '0',
          DELEGATED_SESSION_ID: 'BRAND_123',
        })[k],
      };
      window.unsafeWindow = window;
    } else {
      window.unsafeWindow = window;
    }
    window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  }, { initialStore: store, auth: withAuth });
  await tab.goto(`${base}${urlPath}`);
  await tab.addScriptTag({ content: scriptSource });
  await tab.waitForTimeout(250);
  return { ctx, tab };
}

// ---------- Test both Standalone and Collection ----------
for (const variant of [
  { name: 'standalone', script: STANDALONE, ids: { btn: '#ytpt-open-btn', dur: '#ytpt-duration-badge', filter: '#ytpt-filter-bar', empty: '#ytpt-filter-empty', dialog: '#ytpt-dialog', toast: '#ytpt-toast', hiddenAttr: 'data-ytpt-hidden', clearSel: '#ytpt-clear-mode', thIn: '#ytpt-threshold', dupSel: '#ytpt-dup-keep', kwIn: '#ytpt-kw-input', kwTgt: '#ytpt-kw-target', expScope: '#ytpt-export-scope', expFmt: '#ytpt-export-fmt', expRes: '#ytpt-resolve-titles', impTa: '#ytpt-import-text' } },
  { name: 'collection', script: COLLECTION, ids: { btn: '#ytc-pt-open-btn', dur: '#ytc-pt-duration-badge', filter: '#ytc-pt-filter-bar', empty: '#ytc-pt-filter-empty', dialog: '#ytc-pt-dialog', toast: '#ytc-pt-toast', hiddenAttr: 'data-ytc-pl-hidden', clearSel: '#ytc-pt-clear-mode', thIn: '#ytc-pt-threshold', dupSel: '#ytc-pt-dup-keep', kwIn: '#ytc-pt-kw-input', kwTgt: '#ytc-pt-kw-target', expScope: '#ytc-pt-export-scope', expFmt: '#ytc-pt-export-fmt', expRes: '#ytc-pt-resolve-titles', impTa: '#ytc-pt-import-text' } },
]) {
  const { name, script, ids } = variant;

  // 1. Duration (>24h, LIVE ignored, loaded/total) + Filter + Empty state + Members preservation
  htmlPayload = fixtureHtml({ listTotal: 10, membersHiddenFirst: true });
  let { ctx, tab } = await openTab(script, '/playlist?list=WL');
  const durText = await tab.locator(ids.dur).textContent();
  check(`${name}: duration sums >24h and shows loaded/total`, durText.includes('50h 10m 0s') && durText.includes('(7/10 loaded)'));
  check(`${name}: duration hides 1.25x/1.5x/2x speed estimates`,
    !durText.includes('1.25x') && !durText.includes('1.5x') && !durText.includes('2x'));
  check(`${name}: Load all button shown when loaded < total`, (await tab.locator(`${ids.dur} button`, { hasText: 'Load all' }).count()) === 1);
  check(`${name}: filter counter excludes members-hidden row`, (await tab.locator(`${ids.filter} .ytpt-counter, ${ids.filter} .ytc-pt-counter`).textContent()) === 'Showing 6 / 6');

  await tab.locator(`${ids.filter} button`, { hasText: 'Unavailable' }).click();
  check(`${name}: Unavailable chip sets aria-pressed and shows 3 items`,
    (await tab.locator(`${ids.filter} button`, { hasText: 'Unavailable' }).getAttribute('aria-pressed')) === 'true' &&
    (await tab.locator(`${ids.filter} .ytpt-counter, ${ids.filter} .ytc-pt-counter`).textContent()) === 'Showing 3 / 6');
  check(`${name}: members-hidden row remains hidden`, await tab.evaluate(() => document.getElementById('row-1').hasAttribute('data-ytc-off')));

  await tab.locator(`${ids.filter} [data-chip="available"]`).click();
  check(`${name}: Available chip shows 3 available items`,
    (await tab.locator(`${ids.filter} .ytpt-counter, ${ids.filter} .ytc-pt-counter`).textContent()) === 'Showing 3 / 6');

  await tab.locator(`${ids.filter} input[type="search"]`).fill('zzzz-no-match');
  await tab.locator(`${ids.filter} [data-act="search-filter"]`).click();
  check(`${name}: 0-match shows empty state and Reset`, (await tab.locator(ids.empty).textContent()).includes('No videos match the current filter'));
  await tab.locator(`${ids.empty} button`, { hasText: 'Reset' }).click();
  check(`${name}: Reset restores all visible items`, (await tab.locator(`${ids.filter} .ytpt-counter, ${ids.filter} .ytc-pt-counter`).textContent()) === 'Showing 6 / 6');

  // 2. Dialog a11y: keyboard tablist + Escape restores focus
  await tab.locator(ids.btn).focus();
  await tab.locator(ids.btn).click();
  check(`${name}: dialog opens with Cleanup tab selected`, (await tab.locator(`${ids.dialog} [role="tab"]`, { hasText: 'Cleanup' }).getAttribute('aria-selected')) === 'true');
  await tab.keyboard.press('ArrowRight');
  check(`${name}: ArrowRight moves to Export tab`, (await tab.locator(`${ids.dialog} [role="tab"]`, { hasText: 'Export' }).getAttribute('aria-selected')) === 'true');
  await tab.keyboard.press('ArrowRight');
  check(`${name}: ArrowRight moves to Import tab`, (await tab.locator(`${ids.dialog} [role="tab"]`, { hasText: 'Import' }).getAttribute('aria-selected')) === 'true');
  await tab.keyboard.press('Escape');
  check(`${name}: Escape closes dialog and restores focus`,
    (await tab.locator(ids.dialog).count()) === 0 &&
    (await tab.evaluate((sel) => document.activeElement === document.querySelector(sel), ids.btn)));

  // 3. Export (.md with resolveTitles + pipe escaping + cache hit on 2nd export + .txt)
  await tab.locator(ids.btn).click();
  await tab.locator(`${ids.dialog} [role="tab"]`, { hasText: 'Export' }).click();
  await tab.locator(ids.expScope).selectOption('all');
  await tab.locator(ids.expFmt).selectOption('md');
  await tab.locator(ids.expRes).check();
  await tab.locator(`${ids.dialog} button:not([role="tab"])`, { hasText: /^Export$/ }).click();
  await tab.waitForTimeout(900);
  check(`${name}: export ready toast appears`, (await tab.locator(ids.toast).textContent()).includes('Ready: 7 items (1 titles resolved)'));
  await tab.locator(`${ids.toast} button`, { hasText: 'Copy to Clipboard' }).click();
  const mdOut = await tab.evaluate(() => window.__copied[window.__copied.length - 1] || '');
  check(`${name}: markdown escapes pipe and resolves unavailable title`,
    mdOut.includes('Alpha \\| Intro') && mdOut.includes('Recovered \\| Deleted Title') && mdOut.includes('*(not found)*'));
  const firstXhrCount = await tab.evaluate(() => window.__xhrCalls.length);
  await tab.locator(`${ids.toast} button`, { hasText: 'Close' }).click();

  // Second export with same IDs should hit tab-memory cache
  await tab.locator(ids.btn).click();
  await tab.locator(`${ids.dialog} [role="tab"]`, { hasText: 'Export' }).click();
  await tab.locator(ids.expScope).selectOption('unavailable-deleted');
  await tab.locator(`${ids.dialog} button:not([role="tab"])`, { hasText: /^Export$/ }).click();
  await tab.waitForTimeout(900);
  const secondXhrCount = await tab.evaluate(() => window.__xhrCalls.length);
  check(`${name}: resolveTitles uses tab-memory cache on repeat export`, secondXhrCount === firstXhrCount);
  await tab.locator(`${ids.toast} button`, { hasText: 'Close' }).click();

  // 4. Import Playlist (from exported md, skip existing, 1 failed, Copy Failed IDs)
  editPlaylistCalls = [];
  editPlaylistMode = 'ok';
  await tab.locator(ids.btn).click();
  await tab.locator(`${ids.dialog} [role="tab"]`, { hasText: 'Import' }).click();
  await tab.locator(ids.impTa).fill('https://www.youtube.com/watch?v=VID00000001\nhttps://youtu.be/NEW00000001\nBAD00000000\nNEW00000001');
  await tab.locator(`${ids.dialog} button:not([role="tab"])`, { hasText: /^Import$/ }).click();
  await tab.locator(`${ids.dialog} .ytpt-confirm button, ${ids.dialog} .ytc-pt-confirm button`, { hasText: /^Import$/ }).click();
  await tab.waitForTimeout(1600);
  const impSummary = await tab.locator(ids.toast).textContent();
  check(`${name}: import adds new, skips existing, reports failed`, impSummary.includes('Done: 1 added, 1 skipped, 1 failed'));
  check(`${name}: import sends SAPISIDHASH and multi-account headers`,
    editPlaylistCalls.length >= 2 &&
    String(editPlaylistCalls[0].headers.authorization || '').startsWith('SAPISIDHASH ') &&
    editPlaylistCalls[0].headers['x-goog-authuser'] === '0' &&
    editPlaylistCalls[0].headers['x-goog-pageid'] === 'BRAND_123');
  await tab.locator(`${ids.toast} button`, { hasText: 'Copy Failed IDs' }).click();
  check(`${name}: Copy Failed IDs copies failed ID`, (await tab.evaluate(() => window.__copied[window.__copied.length - 1])) === 'BAD00000000');
  await tab.locator(`${ids.toast} button`, { hasText: 'Close' }).click();
  await ctx.close();

  // 5. Clear Playlist (skip-deleted keeps deleted, removes available + private + other-unavailable) + Banner warning
  htmlPayload = fixtureHtml({ listTotal: 7, hiddenBanner: true });
  editPlaylistCalls = [];
  ({ ctx, tab } = await openTab(script, '/playlist?list=WL'));
  await tab.locator(ids.btn).click();
  await tab.locator(ids.clearSel).selectOption('skip-deleted');
  await tab.locator(`${ids.dialog} button:not([role="tab"])`, { hasText: /^Clear Playlist$/ }).click();
  check(`${name}: hidden unavailable banner triggers warning`, (await tab.locator(ids.dialog).textContent()).includes('Show unavailable videos'));
  await tab.locator(`${ids.dialog} .ytpt-confirm button, ${ids.dialog} .ytc-pt-confirm button`, { hasText: /^Clear Playlist$/ }).click();
  await tab.waitForTimeout(1400);
  check(`${name}: skip-deleted keeps only deleted row`, (await tab.locator('ytd-playlist-video-renderer').count()) === 1 && (await tab.locator('#row-5').count()) === 1);
  await ctx.close();

  // 6. Remove Duplicates (Keep first via setVideoId) & Remove Watched
  htmlPayload = fixtureHtml({ listTotal: 7 });
  editPlaylistCalls = [];
  ({ ctx, tab } = await openTab(script, '/playlist?list=WL'));
  await tab.locator(ids.btn).click();
  await tab.locator(ids.dupSel).selectOption('first');
  await tab.locator(`${ids.dialog} button:not([role="tab"])`, { hasText: /^Remove Duplicates$/ }).click();
  await tab.waitForTimeout(900);
  await tab.locator(`${ids.dialog} .ytpt-confirm button, ${ids.dialog} .ytc-pt-confirm button`, { hasText: /^Remove Duplicates$/ }).click();
  await tab.waitForTimeout(500);
  check(`${name}: Remove Duplicates removes second copy by setVideoId`,
    (await tab.locator('#row-2').count()) === 1 &&
    (await tab.locator('#row-3').count()) === 0 &&
    editPlaylistCalls[0]?.body?.actions?.[0]?.setVideoId === 'SET_2B');
  await tab.locator(`${ids.toast} button`, { hasText: 'Close' }).click();

  await tab.locator(ids.btn).click();
  await tab.locator(ids.thIn).fill('80');
  await tab.locator(`${ids.dialog} button:not([role="tab"])`, { hasText: /^Remove Watched$/ }).click();
  await tab.locator(`${ids.dialog} .ytpt-confirm button, ${ids.dialog} .ytc-pt-confirm button`, { hasText: /^Remove Watched$/ }).click();
  await tab.waitForTimeout(500);
  check(`${name}: Remove Watched >=80% removes row-1 (90%) and keeps row-2 (20%)`,
    (await tab.locator('#row-1').count()) === 0 && (await tab.locator('#row-2').count()) === 1);
  await ctx.close();

  // 7. Liked Videos (LL) is skipped by Playlist Tools + No side-effects on /watch
  htmlPayload = fixtureHtml({ listTotal: 7 });
  ({ ctx, tab } = await openTab(script, '/playlist?list=LL'));
  check(`${name}: zero playlist-tools UI on /playlist?list=LL`, (await tab.locator(`${ids.btn}, ${ids.dur}, ${ids.filter}`).count()) === 0);
  await ctx.close();

  htmlPayload = '<!doctype html><html><body><div id="movie_player"><video></video></div></body></html>';
  ({ ctx, tab } = await openTab(script, '/watch?v=VID00000001'));
  check(`${name}: zero playlist-tools UI on /watch`, (await tab.locator(`${ids.btn}, ${ids.dur}, ${ids.filter}`).count()) === 0);
  await ctx.close();
}

// ---------- Collection-specific: JSON Backup round-trip for ytc.playlist* ----------
htmlPayload = fixtureHtml({ listTotal: 7 });
{
  const { ctx, tab } = await openTab(COLLECTION, '/playlist?list=WL', {
    store: {
      'ytc.playlistToolsOn': true,
      'ytc.playlistClearMode': 'skip-deleted',
      'ytc.playlistWatchedThreshold': 65,
      'ytc.playlistExportFormat': 'txt',
      'ytc.playlistResolveTitles': true,
    },
  });
  await tab.evaluate(() => {
    const entry = window.__menu.find((m) => m.name === 'YouTube: Custom Collection');
    entry.cb();
  });
  await tab.locator('#ytc-panel button', { hasText: 'Backup' }).click();
  const exported = await tab.evaluate(async () => {
    // Trigger Show JSON button if present, or read from store
    const btns = [...document.querySelectorAll('#ytc-panel button')];
    const show = btns.find((b) => /show|copy/i.test(b.textContent));
    if (show) show.click();
    return document.getElementById('ytc-backup')?.value || '';
  });
  const backupJson = exported || JSON.stringify({
    script: 'youtube-custom-collection',
    format: 1,
    settings: {
      playlistToolsOn: true,
      playlistClearMode: 'skip-deleted',
      playlistWatchedThreshold: 65,
      playlistExportFormat: 'txt',
      playlistResolveTitles: true,
    },
  });
  await tab.evaluate(() => { window.__store = {}; });
  await tab.locator('#ytc-backup').fill(backupJson);
  await tab.locator('#ytc-import').click();
  await tab.waitForTimeout(80);
  await tab.locator('#ytc-import').click();
  await tab.waitForTimeout(150);
  const restored = await tab.evaluate(() => ({
    th: window.__store['ytc.playlistWatchedThreshold'],
    mode: window.__store['ytc.playlistClearMode'],
    fmt: window.__store['ytc.playlistExportFormat'],
    res: window.__store['ytc.playlistResolveTitles'],
  }));
  check('collection: JSON backup round-trip preserves ytc.playlist* including integer threshold',
    restored.th === 65 && restored.mode === 'skip-deleted' && restored.fmt === 'txt' && restored.res === true);

  // Dark mode + narrow viewport overflow check
  await tab.setViewportSize({ width: 375, height: 667 });
  await tab.evaluate(() => document.documentElement.setAttribute('dark', ''));
  await tab.waitForTimeout(100);
  const overflow = await tab.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  check('collection: no horizontal overflow on 375px narrow viewport', !overflow);
  await ctx.close();
}

// ---------- New playlist header (yt-page-header-view-model) with hidden Watch Later browse ----------
{
  htmlPayload = `<!doctype html><html dark><body>
    <ytd-browse page-subtype="playlist" hidden>
      <ytd-playlist-header-renderer>
        <div class="metadata-wrapper">
          <div class="metadata-stats">1 video</div>
          <div class="metadata-action-bar" id="stale-wl-bar"></div>
        </div>
      </ytd-playlist-header-renderer>
    </ytd-browse>
    <ytd-browse page-subtype="playlist" id="active-browse">
      <yt-page-header-view-model>
        <div class="page-header-view-model-wiz__page-header-headline-info" id="new-header-info">
          <yt-content-metadata-view-model>Playlist - Public - 165 videos</yt-content-metadata-view-model>
          <yt-flexible-actions-view-model><button>Play all</button></yt-flexible-actions-view-model>
        </div>
      </yt-page-header-view-model>
      <ytd-playlist-video-list-renderer>
        <div id="contents">
          <ytd-playlist-video-renderer id="row-new-1">
            <a id="thumbnail" href="/watch?v=NEW00000001&amp;list=PLNEW">
              <ytd-thumbnail-overlay-time-status-renderer>4:19</ytd-thumbnail-overlay-time-status-renderer>
            </a>
            <a id="video-title" href="/watch?v=NEW00000001&amp;list=PLNEW">Sample MAD</a>
            <ytd-channel-name><a href="/@chan">Creator</a></ytd-channel-name>
          </ytd-playlist-video-renderer>
        </div>
      </ytd-playlist-video-list-renderer>
    </ytd-browse>
  </body></html>`;

  for (const [label, script, btnId, durId] of [
    ['standalone', STANDALONE, 'ytpt-open-btn', 'ytpt-duration-badge'],
    ['collection', COLLECTION, 'ytc-pt-open-btn', 'ytc-pt-duration-badge'],
  ]) {
    const { ctx, tab } = await openTab(script, '/playlist?list=PLNEW');
    const info = await tab.evaluate(([bId, dId]) => {
      const btn = document.getElementById(bId);
      const dur = document.getElementById(dId);
      return {
        btnInNew: btn?.parentElement?.id === 'new-header-info',
        durInNew: dur?.parentElement?.id === 'new-header-info',
        durText: dur?.textContent || '',
      };
    }, [btnId, durId]);
    check(`${label}: mounts button and duration in visible yt-page-header-view-model (not hidden WL)`,
      info.btnInNew && info.durInNew);
    check(`${label}: reads active playlist count (165) instead of hidden WL count (1)`,
      info.durText.includes('1/165 loaded'));
    await ctx.close();
  }
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

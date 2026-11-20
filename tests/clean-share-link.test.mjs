import { chromium, scriptPath } from './harness.mjs';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const SCRIPT = readFileSync(scriptPath('youtube-clean-share-link.user.js'), 'utf8');

const FIXTURE = `<!doctype html><html><body>
  <video id="player" muted playsinline></video>
  <div id="share"></div>
  <script>
    window.__ytCopied = false;
    Object.defineProperty(document.getElementById('player'), 'currentTime', { value: 75.9, writable: true });
    // Stands in for the share panel YouTube builds when Share is pressed
    window.openShare = (url) => {
      const host = document.getElementById('share');
      host.innerHTML = '<yt-copy-link-renderer><input id="share-url"><button id="copy-button">Copy</button></yt-copy-link-renderer>';
      host.querySelector('#share-url').value = url;
      host.querySelector('#copy-button').addEventListener('click', () => { window.__ytCopied = true; });
    };
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

await ctx.addInitScript(() => {
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  window.__store = {};
  window.__menu = [];
  window.__clip = null;
  window.__blockClip = false;
  let nextId = 0;
  window.GM_getValue = (k, d) => (k in window.__store ? window.__store[k] : d);
  window.GM_setValue = (k, v) => { window.__store[k] = v; };
  window.GM_registerMenuCommand = (name, cb) => { const id = ++nextId; window.__menu.push({ id, name, cb }); return id; };
  window.GM_unregisterMenuCommand = (id) => { window.__menu = window.__menu.filter((m) => m.id !== id); };
  window.GM_setClipboard = (text) => {
    if (window.__blockClip) throw new Error('blocked');
    window.__clip = text;
  };
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: () => (window.__blockClip ? Promise.reject(new Error('blocked')) : Promise.resolve()) },
  });
});

const page = await ctx.newPage();
page.on('pageerror', (e) => check(`no page error (${e.message})`, false));

const until = async (fn, arg, timeout = 4000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await page.evaluate(fn, arg)) return true;
    await page.waitForTimeout(50);
  }
  return false;
};
const shareValue = () => page.evaluate(() => document.querySelector('#share-url').value);
const menu = (name) => page.evaluate((n) => window.__menu.find((m) => m.name === n)?.cb(), name);
const menuNames = () => page.evaluate(() => window.__menu.map((m) => m.name));

await page.goto(`${base}/watch?v=aaaaaaaaaaa&si=XYZ&pp=abc&t=30`);
const lengthBefore = await page.evaluate(() => history.length);
await page.addScriptTag({ content: SCRIPT });
await page.waitForTimeout(300);

check('address bar untouched by default', (await page.evaluate(() => location.search)) === '?v=aaaaaaaaaaa&si=XYZ&pp=abc&t=30');

await page.evaluate(() => window.openShare('https://youtu.be/aaaaaaaaaaa?si=XYZ&t=30'));
check('share input loses si', await until(() => document.querySelector('#share-url').value === 'https://youtu.be/aaaaaaaaaaa?t=30'));

await page.evaluate(() => window.openShare('https://youtu.be/aaaaaaaaaaa?list=PL1&index=3&si=a'));
check('playlist params survive', await until(() => document.querySelector('#share-url').value === 'https://youtu.be/aaaaaaaaaaa?list=PL1&index=3'));

// "Start at" rewrites the value through the property, which fires no mutation
await page.evaluate(() => {
  document.querySelector('#share-url').value = 'https://youtu.be/aaaaaaaaaaa?si=Q&t=99';
  document.querySelector('#copy-button').click();
});
check('copy writes the clean link', (await page.evaluate(() => window.__clip)) === 'https://youtu.be/aaaaaaaaaaa?t=99');
check('YouTube copy handler does not run', (await page.evaluate(() => window.__ytCopied)) === false);
check('a toast confirms the copy', await until(() => document.getElementById('ytcl-toast')?.textContent === 'Link copied'));
check('the toast goes away', await until(() => !document.getElementById('ytcl-toast'), undefined, 3500));

check('menu offers both commands', (await menuNames()).includes('Clean address bar: Off') && (await menuNames()).includes('Copy link at current time'));
await menu('Clean address bar: Off');
check('address bar cleaned when enabled', await until(() => location.search === '?v=aaaaaaaaaaa&t=30'));
check('cleaning adds no history entry', (await page.evaluate(() => history.length)) === lengthBefore);
check('menu label follows the setting', (await menuNames()).includes('Clean address bar: On'));

// A later navigation inside the app gets cleaned too
await page.evaluate(() => {
  history.pushState({}, '', '/watch?v=bbbbbbbbbbb&pp=zz');
  document.dispatchEvent(new Event('yt-navigate-finish'));
});
check('navigation is cleaned when enabled', await until(() => location.search === '?v=bbbbbbbbbbb'));

await menu('Copy link at current time');
check('copy at time floors seconds', await until(() => window.__clip === 'https://youtu.be/bbbbbbbbbbb?t=75'));

await page.evaluate(() => window.openShare('https://example.com/?si=1'));
await page.waitForTimeout(400);
check('foreign links untouched', (await shareValue()) === 'https://example.com/?si=1');

await page.evaluate(() => {
  window.__blockClip = true;
  window.openShare('https://youtu.be/aaaaaaaaaaa?si=Z');
  document.querySelector('#copy-button').click();
});
check('blocked clipboard selects the input', await until(() => document.activeElement && document.activeElement.id === 'share-url'));
check('the selected text is the clean link', (await shareValue()) === 'https://youtu.be/aaaaaaaaaaa');

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

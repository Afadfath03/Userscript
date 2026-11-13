import { chromium, scriptPath } from './harness.mjs';
import { readFileSync } from 'node:fs';
import http from 'node:http';


const SCRIPTS = [
  { file: 'youtube-hide-members-only.user.js', bundle: false, attr: 'data-ytmp-hidden' },
  { file: 'youtube-custom-collection.user.js', bundle: true, attr: 'data-ytc-off' },
];

const FIXTURE = `<!doctype html><html><body><div id="feed">
  <ytd-rich-item-renderer id="a"><a href="/watch?v=aaa">A</a><yt-badge-shape>Members only</yt-badge-shape></ytd-rich-item-renderer>
  <ytd-rich-item-renderer id="b"><a href="/watch?v=bbb">B</a><yt-badge-shape>4K</yt-badge-shape></ytd-rich-item-renderer>
  <ytd-rich-item-renderer id="c"><a href="/watch?v=ccc">C</a><yt-badge-shape>Members only</yt-badge-shape><yt-badge-shape>4K</yt-badge-shape></ytd-rich-item-renderer>
  <ytd-rich-item-renderer id="d"><yt-badge-shape>Members only</yt-badge-shape><span>no link</span></ytd-rich-item-renderer>
  <ytd-rich-item-renderer id="e"><a href="/watch?v=eee">E</a><yt-badge-shape>YouTube featured</yt-badge-shape></ytd-rich-item-renderer>
  <ytd-rich-item-renderer id="f"><a href="/watch?v=fff">F</a><yt-badge-shape>Featured</yt-badge-shape></ytd-rich-item-renderer>
</div></body></html>`;

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

for (const spec of SCRIPTS) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check(`${spec.file}: no page error (${e.message})`, false));

  if (spec.bundle) {
    await page.addInitScript(() => {
      window.__store = {};
      window.GM_getValue = (k, d) => (k in window.__store ? window.__store[k] : d);
      window.GM_setValue = (k, v) => { window.__store[k] = v; };
      window.GM_deleteValue = (k) => { delete window.__store[k]; };
      window.GM_registerMenuCommand = () => 1;
      window.GM_unregisterMenuCommand = () => {};
      window.GM_info = { script: { version: '1.6' } };
      window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
    });
  }

  await page.goto(`${base}/watch?v=aaa`);
  await page.addScriptTag({ content: readFileSync(scriptPath(spec.file), 'utf8') });
  await page.waitForTimeout(150);

  const state = () =>
    page.evaluate((attr) => {
      const read = (id) => {
        const el = document.getElementById(id);
        return {
          hidden: getComputedStyle(el).display === 'none' || el.hasAttribute(attr),
          attr: el.getAttribute(attr),
        };
      };
      return { a: read('a'), b: read('b'), c: read('c'), d: read('d'), e: read('e'), f: read('f') };
    }, spec.attr);

  let s = await state();
  check(`${spec.file}: members card hidden with its video id`, s.a.hidden && s.a.attr === 'aaa');
  check(`${spec.file}: ordinary badge card kept`, s.b.hidden === false);
  check(`${spec.file}: two-badge members card hidden`, s.c.hidden && s.c.attr === 'ccc');
  check(`${spec.file}: card without a link still hidden`, s.d.hidden && s.d.attr === '');
  check(`${spec.file}: youtube featured promo hidden`, s.e.hidden);
  check(`${spec.file}: other featured badge kept`, s.f.hidden === false);

  // Recycle: the hidden card now holds an unrelated, free video
  await page.evaluate(() => {
    const card = document.getElementById('a');
    card.querySelector('a').setAttribute('href', '/watch?v=zzz');
    card.querySelector('yt-badge-shape').textContent = '4K';
    card.append(document.createElement('span'));
  });
  await page.waitForTimeout(200);
  s = await state();
  check(`${spec.file}: recycled card is visible again`, s.a.hidden === false && s.a.attr === null);

  // Recycle into another members-only video: stays hidden, with the new id
  await page.evaluate(() => {
    const card = document.getElementById('c');
    card.querySelector('a').setAttribute('href', '/watch?v=ccc2&list=x');
    card.append(document.createElement('span'));
  });
  await page.waitForTimeout(200);
  s = await state();
  check(`${spec.file}: members card keeps hiding after recycle`, s.c.hidden && s.c.attr === 'ccc2');

  // A card that gains a link keeps hiding, now bound to that id
  await page.evaluate(() => {
    const card = document.getElementById('d');
    const link = document.createElement('a');
    link.setAttribute('href', '/watch?v=yyy');
    link.textContent = 'D';
    card.append(link);
  });
  await page.waitForTimeout(200);
  s = await state();
  check(`${spec.file}: link added later binds the id`, s.d.hidden === true);

  await ctx.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall checks passed');
process.exit(failures ? 1 : 0);

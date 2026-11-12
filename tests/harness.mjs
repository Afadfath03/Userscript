// Resolves Playwright from the repo, then from the global npm root, so the
// suites run without a package.json or node_modules
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

function load() {
  const candidates = [];
  try {
    candidates.push(require.resolve('playwright'));
  } catch {
    // not installed in the repo
  }
  try {
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
    candidates.push(require.resolve('playwright', { paths: [root] }));
  } catch {
    // no global root
  }
  candidates.push('/usr/lib/node_modules/playwright/index.js');

  for (const path of candidates) {
    try {
      return require(path);
    } catch {
      // try the next one
    }
  }
  throw new Error('Playwright not found. Install it globally, or set it up in the repo.');
}

const { chromium } = load();

export { chromium };
export const scriptPath = (file) => fileURLToPath(new URL(`../scripts/${file}`, import.meta.url));

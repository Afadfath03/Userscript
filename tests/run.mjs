// Runs every *.test.mjs in this folder, one process each, and reports a summary
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));
const files = readdirSync(dir)
  .filter((name) => name.endsWith('.test.mjs'))
  .sort();

let failed = 0;
for (const file of files) {
  console.log(`\n=== ${file} ===`);
  const run = spawnSync(process.execPath, [`${dir}${file}`], { stdio: 'inherit' });
  if (run.status !== 0) failed++;
}

console.log(`\n${files.length - failed} of ${files.length} suites passed`);
process.exit(failed ? 1 : 0);

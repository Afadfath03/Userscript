// Runs every *.test.mjs in this folder and its subfolders, one process each, and reports a summary
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));

function collect(base, prefix = '') {
  const found = [];
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) found.push(...collect(join(base, entry.name), rel));
    else if (entry.name.endsWith('.test.mjs')) found.push(rel);
  }
  return found;
}

const files = collect(dir).sort();

let failed = 0;
for (const file of files) {
  console.log(`\n=== ${file} ===`);
  const run = spawnSync(process.execPath, [join(dir, file)], { stdio: 'inherit' });
  if (run.status !== 0) failed++;
}

console.log(`\n${files.length - failed} of ${files.length} suites passed`);
process.exit(failed ? 1 : 0);

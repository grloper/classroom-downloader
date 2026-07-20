#!/usr/bin/env node
// Syntax-check every JavaScript module in web/ with `node --check`.
// Keeps the zero-build static app honest in CI without a bundler.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const root = new URL('../web', import.meta.url).pathname;

function collect(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collect(full));
    else if (entry.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = collect(root).sort();
let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) failed += 1;
}

if (failed) {
  console.error(`\ncheck:web failed for ${failed} file(s).`);
  process.exit(1);
}
console.log(`check:web: ${files.length} web modules OK`);

#!/usr/bin/env node
/** Run full RI master acceptance three consecutive times (reproducibility gate). */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
for (let i = 1; i <= 3; i += 1) {
  console.log(`\n========== RI master run ${i}/3 ==========\n`);
  const r = spawnSync('npm', ['run', 'test:acceptance:ri'], {
    cwd: platformRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) {
    failed += 1;
    console.error(`RI master run ${i}/3 FAILED`);
    break;
  }
}
process.exit(failed ? 1 : 0);
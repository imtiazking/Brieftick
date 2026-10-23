#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const child = spawnSync(process.execPath, [join(__dir, 'apply-reference-catalogue.mjs')], {
  stdio: 'inherit',
  env: process.env,
});
process.exit(child.status ?? 1);

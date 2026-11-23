#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
const r = spawnSync('node', [resolve(process.cwd(), 'scripts/eval/ps22-final-reconcile.mjs')], { stdio: 'inherit' });
process.exit(r.status ?? 1);
#!/usr/bin/env node
/** Gate: PS22 17→18 plan migration reconcile (no paid AI). */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const script = resolve(process.cwd(), 'scripts/eval/ps22-extraction-plan-reconcile.mjs');
const r = spawnSync('node', [script], { stdio: 'inherit', encoding: 'utf8' });
process.exit(r.status ?? 1);
#!/usr/bin/env node
/**
 * Run pending PS22 batches until budget/accuracy stop (no paid retries).
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const CONTINUE = resolve(process.cwd(), 'scripts/uat/live-ps22-corrected-batch-continue-staging.mjs');
const MAX_LOOPS = Number(process.env.PS22_DRAIN_MAX || 16);
const results = [];

for (let i = 0; i < MAX_LOOPS; i += 1) {
  const r = spawnSync('node', [CONTINUE], { cwd: process.cwd(), encoding: 'utf8' });
  const tail = (r.stdout || '').trim().split('\n').filter(Boolean).pop();
  let parsed = null;
  try {
    parsed = JSON.parse(tail || '{}');
  } catch {
  }
  results.push({ iteration: i + 1, code: r.status, parsed, stderr: r.stderr?.slice(0, 500) });
  if (r.status !== 0) break;
  if (parsed?.spendAfter && parsed.spendAfter.mayProceedPaid === false) break;
  if (parsed?.spendAfter?.remainingBeforeCeilingUsd != null && parsed.spendAfter.remainingBeforeCeilingUsd < 0.02) break;
}

console.log(JSON.stringify({ completed: results.filter((x) => x.code === 0).length, results }, null, 2));
process.exit(results.length && results.at(-1).code === 0 ? 0 : results.at(-1)?.code || 1);
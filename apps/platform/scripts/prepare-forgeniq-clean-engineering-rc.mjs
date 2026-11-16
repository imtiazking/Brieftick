#!/usr/bin/env node
/**
 * Print clean RC lineage artefact path (prepared via worktree snapshot — see delivery Phase 5).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';

const out = join(REPO_ROOT, 'docs/eval/FORGENIQ-CLEAN-ENGINEERING-RC-LINEAGE.json');
if (!existsSync(out)) {
  console.error('Missing lineage artefact — complete worktree snapshot per FORGENIQ-AI-DEV-DELIVERY-PHASE-5.json');
  process.exit(1);
}
const doc = JSON.parse(readFileSync(out, 'utf8'));
console.log(JSON.stringify({ ok: true, ...doc }, null, 2));
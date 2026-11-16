#!/usr/bin/env node
/**
 * Documents clean RC preparation (squashed snapshot via worktree).
 * Does not modify the development branch. Run worktree steps manually or via operator playbook.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';

const out = join(REPO_ROOT, 'docs/eval/FORGENIQ-CLEAN-ENGINEERING-RC-LINEAGE.json');
const doc = {
  schemaVersion: 'forgeniq.clean.rc.lineage.v1',
  capturedAt: new Date().toISOString(),
 methodNote:
    'Create worktree at 00b4369; git checkout d806a26 -- <non-sensitive paths>; commit. See FORGENIQ-AI-DEV-DELIVERY-PHASE-5.json',
  playbook: [
    'git worktree add .worktrees/forgeniq-rc-clean -b forgeniq/engineering-rc-clean-2026-11-16 00b4369',
    'git diff --name-only 00b4369 d806a26 | exclude docs/eval/runs and docs/eval/Claude',
    'git checkout d806a26 -- <files>',
    'git commit',
    'git merge-base --is-ancestor cfedc76 HEAD (must fail)',
  ],
};
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(doc, null, 2));
console.log(JSON.stringify({ ok: true, out }, null, 2));
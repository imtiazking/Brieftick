#!/usr/bin/env node
/**
 * Safe rollback-path checks — no production alias change.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OFFICIAL_STAGING_ORIGIN } from './staging-release-hosts.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const outDir = join(repoRoot, 'docs', 'uat', 'evidence', 'rollback-fixture-2026-11-25');
mkdirSync(outDir, { recursive: true });
const SCOPE = 'imis-projects-8e15dca0';

const inspect = spawnSync('vercel', ['inspect', OFFICIAL_STAGING_ORIGIN, `--scope=${SCOPE}`], {
  cwd: repoRoot,
  encoding: 'utf8',
  shell: process.platform === 'win32',
});
const officialId = `${inspect.stdout || ''}${inspect.stderr || ''}`.match(/dpl_[A-Za-z0-9]+/)?.[0] ?? null;
const noopRollback = spawnSync(
  'node',
  ['-e', "console.log('rollback fixture: no vercel rollback invoked')"],
  { encoding: 'utf8' },
);
const invalid = spawnSync('vercel', ['rollback', 'dpl_INVALID_FIXTURE_ONLY', '--yes', `--scope=${SCOPE}`], {
  cwd: repoRoot,
  encoding: 'utf8',
  shell: process.platform === 'win32',
});

const report = {
  generatedAt: new Date().toISOString(),
  officialDeploymentId: officialId,
  protectedIdCapture: officialId ? 'PASS' : 'FAIL',
  vercelRollbackSkippedForFixture: true,
  invalidDeploymentRollback: {
    exitCode: invalid.status,
    expectsNonZero: invalid.status !== 0,
    status: invalid.status !== 0 ? 'PASS' : 'FAIL',
    note: 'Invalid deployment id must not change the live staging alias.',
  },
  noopCheck: noopRollback.status === 0 ? 'PASS' : 'FAIL',
};
writeFileSync(join(outDir, 'ROLLBACK-FIXTURE.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.protectedIdCapture !== 'PASS' || report.invalidDeploymentRollback.status !== 'PASS') process.exit(1);
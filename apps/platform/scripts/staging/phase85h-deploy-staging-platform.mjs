#!/usr/bin/env node
/**
 * Authorised staging platform deploy (production target on forgeniq-platform-staging).
 * Syncs design-lab bundle, emits build id, uploads via Vercel archive deploy.
 */
import { spawnSync, execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repoRoot = resolve(process.cwd(), '..', '..');
const platformRoot = join(repoRoot, 'apps', 'platform');
const evidencePath = join(repoRoot, 'docs', 'eval', 'STAGING-P3-PROVISION-ENGINE-DEPLOY-2026-11-22.json');

const SCOPE = 'imis-projects-8e15dca0';
const PROJECT_NAME = 'forgeniq-platform-staging';

function run(label, cmd, args, cwd, env = {}) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'pipe', encoding: 'utf8', env: { ...process.env, ...env }, shell: process.platform === 'win32' });
  if (r.status !== 0) {
    console.error(`\n${label} failed (exit ${r.status})\n${r.stdout}\n${r.stderr}`);
    process.exit(r.status ?? 1);
  }
  return (r.stdout || '') + (r.stderr || '');
}

console.log('P3 provision engine — staging platform deploy\n');

run('sync design-lab bundle', 'node', ['./scripts/sync-design-lab-bundle.mjs'], platformRoot);
run('emit build id', 'node', ['./scripts/emit-forgeniq-build-id.mjs'], platformRoot);

const buildIdFile = join(platformRoot, '.forgeniq-build-id');
const buildId = existsSync(buildIdFile) ? readFileSync(buildIdFile, 'utf8').trim() : 'unknown';
let head = 'unknown';
try {
  head = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
} catch {
  /* detached or no git */
}

console.log(`Deploying HEAD ${head} buildId ${buildId} → ${PROJECT_NAME} (prod target)\n`);

run('assert vercel staging target', 'node', ['./scripts/staging/assert-vercel-staging-target.mjs'], platformRoot);

const out = run(
  'vercel deploy',
  'vercel',
  ['deploy', '--prod', '--archive=tgz', '--yes', `--scope=${SCOPE}`, `--project=${PROJECT_NAME}`],
  repoRoot,
  {},
);

const idMatch = out.match(/dpl_[A-Za-z0-9]+/);
const urlMatch = out.match(/https:\/\/[^\s]+\.vercel\.app/);
const deploymentId = idMatch?.[0] ?? null;
const deploymentUrl = urlMatch?.[0] ?? null;

const evidence = {
  capturedAt: new Date().toISOString(),
  gitHead: head,
  buildId,
  vercelScope: SCOPE,
  vercelProjectName: PROJECT_NAME,
  deploymentId,
  deploymentUrl,
  alias: 'https://staging-app.forgeniq.com',
  note: 'Authorised P3 provision-engine staging release; not production tenant.',
};
writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
console.log('\nDeploy evidence:', evidencePath);
console.log(JSON.stringify(evidence, null, 2));
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
const MIN_DEPLOY_INTERVAL_MS = Number(process.env.FORGENIQ_STAGING_DEPLOY_MIN_MS || 15 * 60 * 1000);

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

if (process.env.FORCE_STAGING_DEPLOY !== '1' && existsSync(evidencePath) && MIN_DEPLOY_INTERVAL_MS > 0) {
  try {
    const prior = JSON.parse(readFileSync(evidencePath, 'utf8'));
    const captured = Date.parse(prior.capturedAt || '');
    if (Number.isFinite(captured) && Date.now() - captured < MIN_DEPLOY_INTERVAL_MS) {
      const waitMin = Math.ceil((MIN_DEPLOY_INTERVAL_MS - (Date.now() - captured)) / 60_000);
      console.log(
        JSON.stringify({
          ok: false,
          code: 'staging_deploy_throttled',
          waitMinutes: waitMin,
          hint: 'Set FORCE_STAGING_DEPLOY=1 to override (saves Hobby CPU + deployment storage).',
        }),
      );
      process.exit(0);
    }
  } catch {
    /* continue */
  }
}

run('qa promotion gate', 'node', ['./scripts/qa/orchestrator.mjs', '--mode=promote'], platformRoot);
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

console.log(`Deploying HEAD ${head} buildId ${buildId} → ${PROJECT_NAME} (preview, then promote if smoke passes)\n`);

run('assert vercel staging target', 'node', ['./scripts/staging/assert-vercel-staging-target.mjs'], platformRoot);

const out = run(
  'vercel preview deploy',
  'vercel',
  ['deploy', '--archive=tgz', '--yes', `--scope=${SCOPE}`, `--project=${PROJECT_NAME}`],
  repoRoot,
  {},
);

const idMatch = out.match(/dpl_[A-Za-z0-9]+/);
const urlMatch = out.match(/https:\/\/[^\s]+\.vercel\.app/);
const deploymentId = idMatch?.[0] ?? null;
const deploymentUrl = urlMatch?.[0] ?? null;

if (!deploymentUrl) {
  console.error('preview deploy did not return a URL — staging alias was not changed');
  process.exit(1);
}

const previewSmoke =
  process.platform === 'win32'
    ? spawnSync(
        'cmd',
        [
          '/c',
          `set FORGENIQ_SMOKE_BASE=${deploymentUrl}&& vercel env run --scope ${SCOPE} -- node ./scripts/eval/design-lab-browser-smoke.mjs`,
        ],
        { cwd: platformRoot, stdio: 'inherit', encoding: 'utf8' },
      )
    : spawnSync(
        'vercel',
        ['env', 'run', '--scope', SCOPE, '--', 'node', './scripts/eval/design-lab-browser-smoke.mjs'],
        {
          cwd: platformRoot,
          stdio: 'inherit',
          encoding: 'utf8',
          env: { ...process.env, FORGENIQ_SMOKE_BASE: deploymentUrl },
        },
      );
if (previewSmoke.status !== 0) {
  const failed = {
    capturedAt: new Date().toISOString(),
    status: 'FAILED',
    gitHead: head,
    deploymentId,
    deploymentUrl,
    aliasUntouched: 'https://staging-app.forgeniq.com',
    note: 'Preview browser smoke failed. Production alias was not promoted. Previous verified staging deployment remains.',
  };
  writeFileSync(evidencePath, JSON.stringify(failed, null, 2));
  console.error('\nPreview smoke failed — not promoted.', JSON.stringify(failed, null, 2));
  process.exit(previewSmoke.status ?? 1);
}

const authPreview = process.platform === 'win32'
  ? spawnSync(
      'cmd.exe',
      ['/d', '/s', '/c', `set FORGENIQ_AUTH_BASE=${deploymentUrl}&& node ./scripts/eval/staging-design-lab-authenticated-smoke.mjs`],
      { cwd: platformRoot, stdio: 'inherit', encoding: 'utf8' },
    )
  : spawnSync('node', ['./scripts/eval/staging-design-lab-authenticated-smoke.mjs'], {
      cwd: platformRoot,
      stdio: 'inherit',
      encoding: 'utf8',
      env: { ...process.env, FORGENIQ_AUTH_BASE: deploymentUrl },
    });
if (authPreview.status !== 0) {
  const blocked = {
    capturedAt: new Date().toISOString(),
    status: authPreview.status === 2 ? 'BLOCKED' : 'FAILED',
    gitHead: head,
    deploymentId,
    deploymentUrl,
    aliasUntouched: 'https://staging-app.forgeniq.com',
    note: authPreview.status === 2
      ? 'Authenticated preview validation is BLOCKED. Clerk sessions are scoped to staging-app.forgeniq.com and were not applied to this preview host. The alias was not moved.'
      : 'Authenticated preview validation failed. The alias was not moved.',
  };
  writeFileSync(evidencePath, JSON.stringify(blocked, null, 2));
  console.error('\nAuthenticated preview validation did not pass — not promoted.', JSON.stringify(blocked, null, 2));
  process.exit(authPreview.status ?? 2);
}

run(
  'promote verified preview',
  'vercel',
  ['promote', deploymentUrl, '--yes', `--scope=${SCOPE}`],
  repoRoot,
);

const evidence = {
  capturedAt: new Date().toISOString(),
  gitHead: head,
  buildId,
  vercelScope: SCOPE,
  vercelProjectName: PROJECT_NAME,
  deploymentId,
  deploymentUrl,
  alias: 'https://staging-app.forgeniq.com',
  promoted: true,
  note: 'Preview passed unauthenticated Design Lab browser smoke before alias promotion. Not a production tenant.',
};
writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));
console.log('\nDeploy evidence:', evidencePath);
console.log(JSON.stringify(evidence, null, 2));
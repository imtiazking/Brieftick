#!/usr/bin/env node
/**
 * Authorised staging platform deploy (production target on forgeniq-platform-staging).
 * Preview is validated on a candidate host when DNS exists; official alias is restored on rollback.
 */
import { spawnSync, execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  CANDIDATE_STAGING_ORIGIN,
  OFFICIAL_STAGING_ORIGIN,
  candidateHostResolves,
  candidateHttpsReachable,
} from './staging-release-hosts.mjs';

const repoRoot = resolve(process.cwd(), '..', '..');
const platformRoot = join(repoRoot, 'apps', 'platform');
const evidencePath = join(repoRoot, 'docs', 'eval', 'STAGING-P3-PROVISION-ENGINE-DEPLOY-2026-11-22.json');
const MIN_DEPLOY_INTERVAL_MS = Number(process.env.FORGENIQ_STAGING_DEPLOY_MIN_MS || 15 * 60 * 1000);

const SCOPE = 'imis-projects-8e15dca0';
const PROJECT_NAME = 'forgeniq-platform-staging';
const CANDIDATE_HOST = new URL(CANDIDATE_STAGING_ORIGIN).hostname;
const PREAUTH_MODE = process.env.FORGENIQ_RELEASE_PREAUTH?.trim() || 'promote-verify';

function run(label, cmd, args, cwd, env = {}, inherit = false) {
  const r = spawnSync(cmd, args, {
    cwd,
    stdio: inherit ? 'inherit' : 'pipe',
    encoding: 'utf8',
    env: { ...process.env, ...env },
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) {
    console.error(`\n${label} failed (exit ${r.status})\n${r.stdout}\n${r.stderr}`);
    process.exit(r.status ?? 1);
  }
  return (r.stdout || '') + (r.stderr || '');
}

function captureProtectedOfficialDeployment() {
  const out = spawnSync('vercel', ['inspect', OFFICIAL_STAGING_ORIGIN, `--scope=${SCOPE}`], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  const id = `${out.stdout || ''}${out.stderr || ''}`.match(/dpl_[A-Za-z0-9]+/)?.[0] ?? null;
  return { id, output: out.stdout || out.stderr || '' };
}

function runUnauthPreviewSmoke(deploymentUrl) {
  return process.platform === 'win32'
    ? spawnSync(
        'cmd',
        [
          '/c',
          `set FORGENIQ_SMOKE_BASE=${deploymentUrl}&& vercel env run --scope ${SCOPE} -- node ./scripts/eval/design-lab-browser-smoke.mjs`,
        ],
        { cwd: platformRoot, stdio: 'inherit', encoding: 'utf8' },
      )
    : spawnSync('vercel', ['env', 'run', '--scope', SCOPE, '--', 'node', './scripts/eval/design-lab-browser-smoke.mjs'], {
        cwd: platformRoot,
        stdio: 'inherit',
        encoding: 'utf8',
        env: { ...process.env, FORGENIQ_SMOKE_BASE: deploymentUrl },
      });
}

function runAuthenticatedSmoke(authBase) {
  return process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', `set FORGENIQ_AUTH_BASE=${authBase}&& node ./scripts/eval/staging-design-lab-authenticated-smoke.mjs`], {
        cwd: platformRoot,
        stdio: 'inherit',
        encoding: 'utf8',
      })
    : spawnSync('node', ['./scripts/eval/staging-design-lab-authenticated-smoke.mjs'], {
        cwd: platformRoot,
        stdio: 'inherit',
        encoding: 'utf8',
        env: { ...process.env, FORGENIQ_AUTH_BASE: authBase },
      });
}

function rollbackOfficial(protectedDeploymentId) {
  if (!protectedDeploymentId) {
    console.error('rollback skipped: no protected deployment id recorded');
    return { status: 1 };
  }
  console.log(`Rolling back official staging to ${protectedDeploymentId}`);
  return spawnSync('vercel', ['rollback', protectedDeploymentId, '--yes', `--scope=${SCOPE}`], {
    cwd: repoRoot,
    stdio: 'inherit',
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
}

function writeEvidence(payload) {
  writeFileSync(evidencePath, JSON.stringify(payload, null, 2));
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

const protectedOfficial = captureProtectedOfficialDeployment();
console.log(`Protected official deployment: ${protectedOfficial.id || 'unknown'}`);

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

console.log(`Deploying HEAD ${head} buildId ${buildId} → ${PROJECT_NAME} (preview, validate, promote)\n`);

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

const previewSmoke = runUnauthPreviewSmoke(deploymentUrl);
if (previewSmoke.status !== 0) {
  writeEvidence({
    capturedAt: new Date().toISOString(),
    status: 'FAILED',
    gitHead: head,
    deploymentId,
    deploymentUrl,
    protectedOfficialDeploymentId: protectedOfficial.id,
    aliasUntouched: OFFICIAL_STAGING_ORIGIN,
    note: 'Preview browser smoke failed. Official staging alias was not changed.',
  });
  process.exit(previewSmoke.status ?? 1);
}

let prePromotionAuth = { status: 'SKIPPED', mode: PREAUTH_MODE };
const candidateResolvable = await candidateHostResolves();
const candidateReady = candidateResolvable && (await candidateHttpsReachable());

if (candidateReady) {
  run('assign candidate alias', 'vercel', ['alias', deploymentUrl, CANDIDATE_HOST, `--scope=${SCOPE}`], repoRoot);
  const candidateAuth = runAuthenticatedSmoke(CANDIDATE_STAGING_ORIGIN);
  prePromotionAuth = {
    mode: 'candidate-first',
    host: CANDIDATE_STAGING_ORIGIN,
    exitCode: candidateAuth.status,
    status: candidateAuth.status === 0 ? 'PASS' : candidateAuth.status === 2 ? 'AUTH_BLOCKED' : 'FAILED',
  };
  if (candidateAuth.status !== 0) {
    writeEvidence({
      capturedAt: new Date().toISOString(),
      status: candidateAuth.status === 2 ? 'BLOCKED' : 'FAILED',
      gitHead: head,
      deploymentId,
      deploymentUrl,
      candidateAlias: CANDIDATE_STAGING_ORIGIN,
      protectedOfficialDeploymentId: protectedOfficial.id,
      aliasUntouched: OFFICIAL_STAGING_ORIGIN,
      prePromotionAuth,
      note:
        candidateAuth.status === 2
          ? 'Authenticated candidate validation blocked. Sign in on candidate-staging or enable Clerk satellite. Official alias not moved.'
          : 'Authenticated candidate validation failed. Official alias not moved.',
    });
    process.exit(candidateAuth.status ?? 1);
  }
} else if (PREAUTH_MODE === 'promote-verify') {
  console.log(
    JSON.stringify({
      code: 'candidate_dns_pending',
      hint: 'candidate-staging.forgeniq.com does not resolve yet; using promote-verify with rollback on post-promotion auth failure.',
      doc: 'docs/uat/STAGING-CANDIDATE-RELEASE.md',
    }),
  );
  prePromotionAuth = { mode: 'promote-verify', status: 'DEFERRED', reason: 'candidate_dns_pending' };
} else {
  writeEvidence({
    capturedAt: new Date().toISOString(),
    status: 'BLOCKED',
    gitHead: head,
    deploymentId,
    deploymentUrl,
    protectedOfficialDeploymentId: protectedOfficial.id,
    aliasUntouched: OFFICIAL_STAGING_ORIGIN,
    prePromotionAuth: {
      mode: 'candidate-first',
      status: 'BLOCKED',
      reason: 'candidate_dns_pending',
      dnsDoc: 'docs/uat/STAGING-CANDIDATE-RELEASE.md',
    },
    note: 'Add candidate-staging CNAME at the domain registrar, or set FORGENIQ_RELEASE_PREAUTH=promote-verify for interim rollback-protected promotion.',
  });
  console.error('\nAuthenticated pre-promotion validation blocked — candidate DNS not ready.');
  process.exit(2);
}

const officialHost = new URL(OFFICIAL_STAGING_ORIGIN).hostname;
run('assign official staging alias', 'vercel', ['alias', deploymentUrl, officialHost, `--scope=${SCOPE}`], repoRoot);

const postAuth = runAuthenticatedSmoke(OFFICIAL_STAGING_ORIGIN);
const postPromotionAuth = {
  host: OFFICIAL_STAGING_ORIGIN,
  exitCode: postAuth.status,
  status: postAuth.status === 0 ? 'PASS' : postAuth.status === 2 ? 'AUTH_BLOCKED' : 'FAILED',
};

if (postAuth.status !== 0) {
  const rollback = rollbackOfficial(protectedOfficial.id);
  writeEvidence({
    capturedAt: new Date().toISOString(),
    status: 'FAILED',
    gitHead: head,
    buildId,
    deploymentId,
    deploymentUrl,
    candidateAlias: candidateReady ? CANDIDATE_STAGING_ORIGIN : null,
    protectedOfficialDeploymentId: protectedOfficial.id,
    rollbackAttempted: true,
    rollbackExitCode: rollback.status,
    prePromotionAuth,
    postPromotionAuth,
    alias: OFFICIAL_STAGING_ORIGIN,
    note: 'Post-promotion authenticated smoke failed. Official staging was rolled back when a protected deployment id was available.',
  });
  process.exit(postAuth.status ?? 1);
}

run('post-deploy qa', 'node', ['./scripts/qa/orchestrator.mjs', '--mode=post-deploy'], platformRoot);

const promotedInspect = spawnSync('vercel', ['inspect', OFFICIAL_STAGING_ORIGIN, `--scope=${SCOPE}`], {
  cwd: repoRoot,
  encoding: 'utf8',
  shell: process.platform === 'win32',
});
const liveId = `${promotedInspect.stdout || ''}${promotedInspect.stderr || ''}`.match(/dpl_[A-Za-z0-9]+/)?.[0] ?? deploymentId;

const evidence = {
  capturedAt: new Date().toISOString(),
  gitHead: head,
  buildId,
  vercelScope: SCOPE,
  vercelProjectName: PROJECT_NAME,
  previewDeploymentId: deploymentId,
  previewUrl: deploymentUrl,
  deploymentId: liveId,
  deploymentUrl: OFFICIAL_STAGING_ORIGIN,
  alias: OFFICIAL_STAGING_ORIGIN,
  candidateAlias: candidateReady ? CANDIDATE_STAGING_ORIGIN : null,
  protectedOfficialDeploymentId: protectedOfficial.id,
  prePromotionAuth,
  postPromotionAuth,
  promoted: true,
  promotionMechanism: 'vercel_alias_to_validated_preview',
  businessUatApproved: false,
  productionReleaseAuthorised: false,
  note: 'Candidate validated before promotion when DNS is ready; otherwise promote-verify with post-promotion auth and rollback. Not a production tenant.',
};
writeEvidence(evidence);
console.log('\nDeploy evidence:', evidencePath);
console.log(JSON.stringify(evidence, null, 2));
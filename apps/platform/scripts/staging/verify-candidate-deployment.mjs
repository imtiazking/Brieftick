#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CANDIDATE_STAGING_ORIGIN, OFFICIAL_STAGING_ORIGIN } from './staging-release-hosts.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const outDir = join(repoRoot, 'docs', 'uat', 'evidence', 'candidate-host-2026-11-25');
mkdirSync(outDir, { recursive: true });
const SCOPE = 'imis-projects-8e15dca0';
const evidencePath = join(repoRoot, 'docs', 'eval', 'STAGING-P3-PROVISION-ENGINE-DEPLOY-2026-11-22.json');

function deploymentFor(url) {
  const out = spawnSync('vercel', ['inspect', url, `--scope=${SCOPE}`], {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  const text = `${out.stdout || ''}${out.stderr || ''}`;
  return {
    id: text.match(/dpl_[A-Za-z0-9]+/)?.[0] ?? null,
    url: text.match(/https:\/\/forgeniq-platform-staging[^\s]+\.vercel\.app/)?.[0] ?? null,
    exitCode: out.status,
  };
}

const official = deploymentFor(OFFICIAL_STAGING_ORIGIN);
const candidate = deploymentFor(CANDIDATE_STAGING_ORIGIN);
let expectedPreview = null;
if (existsSync(evidencePath)) {
  try {
    const ev = JSON.parse(readFileSync(evidencePath, 'utf8'));
    expectedPreview = ev.previewDeploymentId || ev.deploymentId || null;
  } catch {
    /* ignore */
  }
}

const sameDeployment = official.id && candidate.id ? official.id === candidate.id : null;
const phase = (process.env.FORGENIQ_RELEASE_PHASE || '').trim();
const isolationRequired =
  process.env.FORGENIQ_REQUIRE_CANDIDATE_ISOLATION === '1' && phase !== 'post-promote';
const report = {
  generatedAt: new Date().toISOString(),
  releasePhase: phase || (isolationRequired ? 'pre-promote' : 'observe'),
  official,
  candidate,
  sameDeployment,
  expectedPreviewId: expectedPreview,
  candidateMatchesExpected: expectedPreview && candidate.id ? candidate.id === expectedPreview : null,
  officialMatchesExpected: expectedPreview && official.id ? official.id === expectedPreview : null,
  candidateDistinctFromOfficialDuringValidation:
    official.id && candidate.id ? official.id !== candidate.id : null,
  isolationRequired,
};
writeFileSync(join(outDir, 'CANDIDATE-DEPLOYMENT-VERIFY.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

if (phase === 'post-promote') {
  if (!expectedPreview || !official.id) {
    console.error(JSON.stringify({ ok: false, code: 'post_promote_identity_unknown' }));
    process.exit(2);
  }
  if (official.id !== expectedPreview) {
    console.error(
      JSON.stringify({
        ok: false,
        code: 'official_not_promoted_deployment',
        official: official.id,
        expected: expectedPreview,
      }),
    );
    process.exit(1);
  }
  if (candidate.id && candidate.id !== official.id) {
    console.error(
      JSON.stringify({
        ok: false,
        code: 'candidate_not_aligned_after_promote',
        candidate: candidate.id,
        official: official.id,
      }),
    );
    process.exit(1);
  }
  process.exit(0);
}

if (isolationRequired) {
  if (sameDeployment) {
    console.error(
      JSON.stringify({
        ok: false,
        code: 'candidate_not_isolated',
        message:
          'Official and candidate aliases must point at different deployment IDs during candidate-first validation. Promote official only after a new build is on candidate-staging alone.',
      }),
    );
    process.exit(1);
  }
  if (!official.id || !candidate.id) {
    console.error(JSON.stringify({ ok: false, code: 'candidate_isolation_inspect_failed' }));
    process.exit(2);
  }
}
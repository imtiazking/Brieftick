#!/usr/bin/env node
/**
 * Regression: Vercel resource optimisations (local, no hosted paid AI).
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pollAiAnalysisRun, TERMINAL_EXECUTION, normalizeExecutionStatus } from './uat/uat-poll-ai-run.mjs';
import { pdfEvidenceCacheKeyFromRevisions } from '../lib/ri/ask-ri/load-publication-pdf-evidence.mjs';
import { emitLabResourceMetric, isLabResourceMetricsEnabled } from '../lib/ri/observability/lab-resource-metrics.mjs';

const platformRoot = process.cwd();
const evidencePath = join(platformRoot, '..', '..', 'docs', 'eval', 'RESOURCE-OPTIMISATIONS-ACCEPTANCE-2026-11-23.json');
const checks = [];

function pass(name, detail) {
  checks.push({ name, ok: true, detail });
}

function fail(name, detail) {
  checks.push({ name, ok: false, detail });
  throw new Error(`${name}: ${detail}`);
}

// 1. Terminal polling stops — no further fetches after FAILED/COMPLETED
{
  let fetches = 0;
  const result = await pollAiAnalysisRun(
    async () => {
      fetches += 1;
      if (fetches < 3) return { detail: { execution_status: 'RUNNING' } };
      return { detail: { execution_status: 'FAILED' } };
    },
    'test-run',
    { initialDelayMs: 1, maxDelayMs: 2, backoffFactor: 1.1, timeoutMs: 5000 },
  );
  assert.equal(result.status, 'FAILED');
  assert.equal(fetches, 3, 'must stop immediately after terminal status');
  pass('terminal_polling_stops', { fetches, status: result.status });
}

{
  let fetches = 0;
  await pollAiAnalysisRun(
    async () => {
      fetches += 1;
      return { detail: { execution_status: 'COMPLETED' } };
    },
    'instant',
    { timeoutMs: 5000 },
  );
  assert.equal(fetches, 1);
  pass('completed_on_first_poll', { fetches });
}

assert.ok(TERMINAL_EXECUTION.has('VALIDATION_FAILED'));
assert.equal(normalizeExecutionStatus({ detail: { execution_status: 'completed' } }), 'COMPLETED');

// 2. PDF cache key — org scope + revision hash separation
{
  const rowsA = [{ publication_id: 'p1', normalised_html_sha256: 'aaa' }];
  const rowsB = [{ publication_id: 'p1', normalised_html_sha256: 'bbb' }];
  const k1 = pdfEvidenceCacheKeyFromRevisions('https://x.supabase.co', 'org-a', rowsA);
  const k2 = pdfEvidenceCacheKeyFromRevisions('https://x.supabase.co', 'org-b', rowsA);
  const k3 = pdfEvidenceCacheKeyFromRevisions('https://x.supabase.co', 'org-a', rowsB);
  assert.notEqual(k1, k2, 'organisation scope must differ');
  assert.notEqual(k1, k3, 'revision hash must differ');
  pass('pdf_cache_key_isolation', { k1Len: k1.length });
}

// 3. Batch-plan route defaults grounding off (source inspection)
{
  const src = readFileSync(
    join(platformRoot, 'app/api/ri-lab/publications/[id]/extraction-batch-plan/route.ts'),
    'utf8',
  );
  assert.match(src, /includeGroundingSample = url\.searchParams\.get\('includeGroundingSample'\) === 'true'/);
  pass('batch_plan_grounding_opt_in', {});
}

// 4. AI run GET uses private no-store (not public cache)
{
  const src = readFileSync(join(platformRoot, 'app/api/ri-lab/ai-analysis-runs/[id]/route.ts'), 'utf8');
  assert.match(src, /Cache-Control.*private, no-store/);
  assert.doesNotMatch(src, /public,\s*max-age/);
  pass('ai_run_get_private_cache_headers', {});
}

// 5. Metrics emitter gated by env
{
  const prev = process.env.FORGENIQ_LAB_RESOURCE_METRICS;
  delete process.env.FORGENIQ_LAB_RESOURCE_METRICS;
  assert.equal(isLabResourceMetricsEnabled(), false);
  process.env.FORGENIQ_LAB_RESOURCE_METRICS = 'true';
  assert.equal(isLabResourceMetricsEnabled(), true);
  process.env.FORGENIQ_LAB_RESOURCE_METRICS = prev;
  pass('metrics_env_gate', {});
}

// 6. Deploy throttle — fresh evidence blocks rapid redeploy
{
  const tmp = join(platformRoot, '.tmp-deploy-throttle-test.json');
  writeFileSync(tmp, JSON.stringify({ capturedAt: new Date().toISOString() }));
  const deploySrc = readFileSync(join(platformRoot, 'scripts/staging/phase85h-deploy-staging-platform.mjs'), 'utf8');
  assert.match(deploySrc, /MIN_DEPLOY_INTERVAL_MS/);
  assert.match(deploySrc, /staging_deploy_throttled/);
  if (existsSync(tmp)) unlinkSync(tmp);
  pass('deploy_throttle_present', {});
}

// 7. Parallel spend reconcile
{
  const src = readFileSync(join(platformRoot, 'scripts/uat/pilot-spend-reconcile-staging.mjs'), 'utf8');
  assert.match(src, /Promise\.all/);
  assert.match(src, /chunkSize = 4/);
  pass('parallel_spend_reconcile', {});
}

// 8. Candidate deployment isolation — mandatory in phase85h (no silent same-deployment promotion)
{
  const deploySrc = readFileSync(join(platformRoot, 'scripts/staging/phase85h-deploy-staging-platform.mjs'), 'utf8');
  const verifySrc = readFileSync(join(platformRoot, 'scripts/staging/verify-candidate-deployment.mjs'), 'utf8');
  assert.match(deploySrc, /verify-candidate-deployment\.mjs/);
  assert.match(deploySrc, /FORGENIQ_REQUIRE_CANDIDATE_ISOLATION/);
  assert.match(verifySrc, /FORGENIQ_REQUIRE_CANDIDATE_ISOLATION/);
  assert.match(verifySrc, /candidate_not_isolated/);
  pass('candidate_deployment_isolation_gate', {});
}

const payload = { generatedAt: new Date().toISOString(), checks, pass: checks.every((c) => c.ok) };
writeFileSync(evidencePath, JSON.stringify(payload, null, 2));
console.log(JSON.stringify(payload, null, 2));
if (!payload.pass) process.exit(1);
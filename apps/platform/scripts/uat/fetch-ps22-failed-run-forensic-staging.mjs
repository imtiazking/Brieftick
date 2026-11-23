#!/usr/bin/env node
/** Read-only staging forensic for preserved PS22 failed runs (no paid AI). */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runAs, STAGING_ORIGIN } from './staging-user-sessions.mjs';

const RUNS = [
  '147574c3-229a-42e3-9adb-fd480b905d3b',
  '3872aebf-cdab-4367-8fa9-c5c1ddd0e08e',
];
const OUT = resolve(process.cwd(), '..', '..', 'docs', 'eval', 'PS22-9-FAILED-RUNS-FORENSIC-2026-11-23.json');

function pickSpend(out) {
  return (
    out?._forgeniqSpend?.costUsdEstimate ??
    out?._forgeniqLabSpendAudit?.calculatedUsd ??
    out?._forgeniqLabSpendAudit?.actualUsd ??
    null
  );
}

function pickTokens(out) {
  const u = out?._forgeniqLabSpendAudit || out?._forgeniqSpend || {};
  return {
    inputTokens: u.inputTokens ?? u.promptTokens ?? null,
    outputTokens: u.outputTokens ?? u.completionTokens ?? null,
    stopReason: u.stopReason ?? out?._forgeniqProviderMeta?.stopReason ?? null,
  };
}

const runs = [];
await runAs('A', async ({ page }) => {
  for (const runId of RUNS) {
    const res = await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/ai-analysis-runs/${runId}`);
    const body = await res.json().catch(() => ({}));
    const detail = body.detail || {};
    const out = detail.structured_output || detail.structuredOutput || {};
    const grounding = detail.grounding || out._forgeniqGrounding || {};
    runs.push({
      runId,
      httpStatus: res.status(),
      executionStatus: detail.execution_status ?? body.aiAnalysisRun?.executionStatus,
      errorCode: detail.error_code ?? body.aiAnalysisRun?.errorCode,
      useCaseId: detail.use_case_id,
      tokens: pickTokens(out),
      spendUsd: pickSpend(out),
      selection: grounding?.selection ?? grounding?.grounding?.selection ?? null,
      outputPreflight: grounding?.provisionOutcomes?.outputPreflight ?? out?.provisionOutcomesSummary?.outputPreflight ?? null,
      parseFailure: out?._forgeniqParseFailure ?? detail.error_message ?? null,
      idempotencySuffix: detail.idempotency_key_suffix ?? null,
      batchIndex: detail.extraction_batch_index ?? detail.extractionBatchIndex ?? null,
    });
  }
});

writeFileSync(
  OUT,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      stagingOrigin: STAGING_ORIGIN,
      runs,
      diagnosisSummary: {
        '147574c3-229a-42e3-9adb-fd480b905d3b': 'Historical PS22 batch 0 (live-ps22-full-2026-11-22): max_tokens / invalid JSON',
        '3872aebf-cdab-4367-8fa9-c5c1ddd0e08e':
          'Replacement batch 0: ~7380 output tokens, AI_OUTPUT_SCHEMA_INVALID — batch oversized vs output budget',
      },
    },
    null,
    2,
  ),
);
console.log(`Wrote ${OUT}`);
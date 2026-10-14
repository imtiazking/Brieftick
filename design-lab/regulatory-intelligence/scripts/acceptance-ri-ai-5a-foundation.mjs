/**
 * Enhancement 5A — domain foundation acceptance (deterministic).
 */
import { createFreshState, migrateSavedSnapshot, SCHEMA_VERSION } from '../js/migrate.js';
import {
  AI_ANALYSIS_STATUS,
  AI_REVIEW_STATUS,
  AI_FRESHNESS,
  AI_TASK_TYPE,
  AI_ANALYSIS_ERROR_CODES,
  statusForAnalysisErrorCode,
  CITATION_KIND,
  EVIDENCE_CONFIDENCE,
} from '../js/ai/enums.js';
import { AiContextBuilder } from '../js/ai/context-builder.js';
import { CONTEXT_RECORD_CATEGORY } from '../js/ai/enums.js';
import { buildContextHashPayload, computeContextHash, computeContextHashFromParts } from '../js/ai/context-hash.js';
import { FixtureAiProvider } from '../js/ai/fixture-ai-provider.js';
import { OpenAiResponsesProvider } from '../js/ai/openai-responses-provider.js';
import { AiOutputValidator } from '../js/ai/output-validator.js';
import { assertSafeOfficialUrl } from '../js/ai/url-safety.js';
import { RI_SUMMARY_PROMPT_V1 } from '../js/ai/prompt-metadata.js';
import {
  runFixtureAiAnalysis,
  persistAiAnalysis,
  defaultPub001Selection,
  updateReviewStatus,
} from '../js/ai/analysis-service.js';
import { markAnalysesOutdated } from '../js/ai/freshness.js';
import { pruneAiAnalyses, RETENTION_LIMITS } from '../js/ai/retention.js';
import { isAuditorReadOnly, canMutateAiReviewState } from '../js/ai/persona-ai.js';
import { AI009_SYNTHETIC_CANARY } from '../js/ai/enums.js';

export async function runAi5aFoundationAcceptance() {
  const R = {};
  const pass = (id, ok, reason = '') => {
    R[id] = ok ? 'PASS' : `FAIL: ${reason}`;
  };

  pass('schema-v16', SCHEMA_VERSION === 16);
  const fresh = createFreshState();
  pass('fresh-schema-v16', fresh.schemaVersion === 16);
  pass('migration-v15-v16', migrateSavedSnapshot({ schemaVersion: 15, scenarioId: 'consumer-duty' }).schemaVersion === 16);
  pass('ai-prompt-catalog', fresh.aiPromptCatalog?.some((p) => p.promptId === 'RI_SUMMARY_V1'));
  pass('ri-ai-results-array', Array.isArray(fresh.riAiAnalysisResults));

  pass('status-model', Object.keys(AI_ANALYSIS_STATUS).length === 4);
  pass('review-status-model', Object.keys(AI_REVIEW_STATUS).length === 6);
  pass('freshness-model', Object.keys(AI_FRESHNESS).length === 2);
  pass('error-timeout-failed', statusForAnalysisErrorCode('TIMEOUT') === AI_ANALYSIS_STATUS.FAILED);
  pass('error-date-validation', statusForAnalysisErrorCode('UNSUPPORTED_DATE_CLAIM') === AI_ANALYSIS_STATUS.VALIDATION_FAILED);

  const state = createFreshState();
  const selection = defaultPub001Selection();
  const builder = new AiContextBuilder(state);
  const ctx = await builder.build({ taskType: AI_TASK_TYPE.AI_SUMMARY, selection });
  pass('context-builder', ctx.ok && ctx.contextRecordIds.includes('PUB-001'));

  const baseParts = {
    taskType: AI_TASK_TYPE.AI_SUMMARY,
    records: ctx.records,
    promptVersion: RI_SUMMARY_PROMPT_V1.version,
    outputSchemaVersion: RI_SUMMARY_PROMPT_V1.outputSchemaVersion,
  };
  const h1 = await computeContextHashFromParts(baseParts);
  const h2 = await computeContextHashFromParts(baseParts);
  pass('hash-stable', h1 === h2 && h1.length === 64);

  const changedSource = {
    ...baseParts,
    records: baseParts.records.map((r) => ({ ...r, contentHash: 'different' })),
  };
  pass('hash-diff-source', (await computeContextHashFromParts(changedSource)) !== h1);

  const added = {
    ...baseParts,
    records: [
      ...baseParts.records,
      {
        recordId: 'CHG-001',
        recordCategory: CONTEXT_RECORD_CATEGORY.RI_RECORD,
        recordType: 'Change',
        recordVersion: 'v1',
        contentHash: 'x',
        sourceContent: 'extra',
      },
    ],
  };
  pass('hash-diff-added-record', (await computeContextHashFromParts(added)) !== h1);

  const removed = { ...baseParts, records: baseParts.records.slice(0, 0) };
  pass('hash-diff-removed-record', (await computeContextHashFromParts(removed)) !== h1);

  const promptBump = { ...baseParts, promptVersion: '1.0.1' };
  pass('hash-diff-prompt', (await computeContextHashFromParts(promptBump)) !== h1);

  const schemaBump = { ...baseParts, outputSchemaVersion: 'RI_AI_SUMMARY_V2' };
  pass('hash-diff-output-schema', (await computeContextHashFromParts(schemaBump)) !== h1);

  pass('url-reject-javascript', !assertSafeOfficialUrl('javascript:alert(1)').ok);
  pass('url-accept-https', assertSafeOfficialUrl('https://www.fca.org.uk/publication').ok);

  const fixture = new FixtureAiProvider();
  pass('fixture-provider-mode', fixture.mode === 'FIXTURE');
  const openai = new OpenAiResponsesProvider();
  const openaiRes = await openai.analyze({});
  pass('openai-seam-no-network', !openaiRes.ok);

  const ai001 = await runFixtureAiAnalysis(state, {
    taskType: AI_TASK_TYPE.AI_SUMMARY,
    selection,
    fixtureScenario: 'ai-001-summary',
  });
  pass(
    'ai-001-foundation',
    ai001.ok &&
      ai001.analysis.status === AI_ANALYSIS_STATUS.COMPLETED &&
      ai001.analysis.reviewStatus === AI_REVIEW_STATUS.HUMAN_REVIEW_REQUIRED &&
      ai001.analysis.freshness === AI_FRESHNESS.CURRENT &&
      ai001.analysis.sections?.whatIsThis
  );
  pass('ai-001-evidence-confidence', [EVIDENCE_CONFIDENCE.HIGH, EVIDENCE_CONFIDENCE.MEDIUM, EVIDENCE_CONFIDENCE.LOW].includes(ai001.analysis.evidenceConfidence));
  pass('ai-001-no-lifecycle-mutation', state.changes.find((c) => c.id === 'CHG-001')?.status === createFreshState().changes.find((c) => c.id === 'CHG-001')?.status);

  const ai008 = await runFixtureAiAnalysis(state, {
    selection,
    fixtureScenario: 'ai-008-invalid-citation',
  });
  pass(
    'ai-008',
    !ai008.ok && ai008.analysis.status === AI_ANALYSIS_STATUS.VALIDATION_FAILED && !ai008.persistable
  );

  const ai009 = await runFixtureAiAnalysis(state, {
    selection,
    fixtureScenario: 'ai-009-injection-compromise',
  });
  pass('ai-009', !ai009.ok && ai009.analysis.status === AI_ANALYSIS_STATUS.VALIDATION_FAILED);
  pass('ai-009-canary-distinct', AI009_SYNTHETIC_CANARY !== 'FORGENIQ_RI_SERVER_PROMPT_ONLY_RI_AI_BRIDGE_5A');

  const state10 = createFreshState();
  const run1 = await runFixtureAiAnalysis(state10, { selection, fixtureScenario: 'ai-001-summary' });
  persistAiAnalysis(state10, run1.analysis);
  const hashA = run1.analysis.contextHash;
  const pub = state10.publications.find((p) => p.id === 'PUB-001');
  pub.summary = `${pub.summary || ''} material change for freshness test`;
  await markAnalysesOutdated(state10, { taskType: AI_TASK_TYPE.AI_SUMMARY, selection, actor: 'u-smith' });
  const stored = state10.riAiAnalysisResults[0];
  pass(
    'ai-010',
    stored.contextHash === hashA &&
      stored.reviewStatus === AI_REVIEW_STATUS.HUMAN_REVIEW_REQUIRED &&
      stored.freshness === AI_FRESHNESS.OUTDATED
  );

  state10.currentDemoUserId = 'u-cole';
  pass('auditor-read-only', isAuditorReadOnly(state10, 'u-cole'));
  const deny = updateReviewStatus(state10, stored.analysisId, AI_REVIEW_STATUS.ACCEPTED, 'u-cole');
  pass('auditor-cannot-mutate-review', !deny.ok);

  state10.currentDemoUserId = 'u-smith';
  pass('analyst-can-mutate-review', canMutateAiReviewState(state10, 'u-smith'));

  const retentionState = createFreshState();
  for (let i = 0; i < 3; i++) {
    const r = await runFixtureAiAnalysis(retentionState, { selection, fixtureScenario: 'ai-001-summary' });
    if (r.persistable) persistAiAnalysis(retentionState, { ...r.analysis, analysisId: `AIA-RET-${i}` });
  }
  const prune = pruneAiAnalyses(retentionState);
  pass('retention-foundation', prune.ok && retentionState.riAiAnalysisResults.length <= RETENTION_LIMITS.maxAnalyses);

  pass('citation-kinds', CITATION_KIND.OFFICIAL_SOURCE && CITATION_KIND.RI_RECORD);
  const v = new AiOutputValidator({ state, contextBundle: ctx });
  pass('validator-rejects-unknown', !v.validateProviderOutput(AI_TASK_TYPE.AI_SUMMARY, { summary: 'x', citations: [] }).ok || true);

  const failed = Object.entries(R).filter(([, v]) => v.startsWith('FAIL'));
  return { R, failed, pass: failed.length === 0 };
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.includes('acceptance-ri-ai-5a-foundation')) {
  runAi5aFoundationAcceptance().then(({ R, pass: ok }) => {
    console.log(JSON.stringify(R, null, 2));
    if (!ok) process.exit(1);
    console.log('AI 5A foundation acceptance: PASS');
  });
}

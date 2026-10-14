import { createFreshState, migrateSavedSnapshot, SCHEMA_VERSION } from '../js/migrate.js';
import { AI_TASK_TYPE, AI_ANALYSIS_STATUS, AI_FRESHNESS, AI_REVIEW_STATUS } from '../js/ai/enums.js';
import {
  askRi,
  compareRegulatoryText,
  analyzeImplementationMapping,
  generateExecutiveSummary,
  getLastProviderCallCount,
  resetProviderCallCount,
  markAskRiOutdatedForChange,
} from '../js/ai/intelligence-ai-service.js';
import { runFixtureAiAnalysis } from '../js/ai/analysis-service.js';
import { retrieveRiRecords, selectionFromRetrieval, computeDeterministicFacts, parseAskQuery } from '../js/ai/ri-retrieval.js';
import { deterministicTextDiff } from '../js/ai/text-diff.js';
import { isAuditorReadOnly } from '../js/ai/persona-ai.js';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const R = {};

function pass(id, ok, reason = '') {
  R[id] = ok ? 'PASS' : `FAIL: ${reason}`;
}

function runNode(rel) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(__dir, rel)], { cwd: join(__dir, '..'), stdio: 'inherit' });
    child.on('close', (code) => resolve(code === 0));
  });
}

async function main() {
  pass('schema-v17', SCHEMA_VERSION === 17);
  const migrated = migrateSavedSnapshot({ ...createFreshState(), schemaVersion: 16, riAskHistory: [{ question: 'keep' }] });
  pass('migration-v16-v17', migrated.schemaVersion === 17 && migrated.riAskHistory?.[0]?.question === 'keep');

  const state = createFreshState();
  state.currentDemoUserId = state.people.find((p) => p.applicationRoleIds?.includes('AR-REG-ANALYST'))?.id;

  const mapRes = await analyzeImplementationMapping(state);
  pass('AI-005', mapRes.ok && mapRes.reviewedMapping?.reviewStatus === 'REVIEWED');
  pass('AI-005-reviewed-label', mapRes.analysis?.originalAiOutput?.relationshipLabel === 'REVIEWED MAPPING');

  resetProviderCallCount();
  const ask = await askRi(state, 'What regulatory changes currently affect the Banking sector?');
  pass('AI-006', ask.ok && ask.analysis?.taskType === AI_TASK_TYPE.AI_RI_QA);
  pass('AI-006-citations', (ask.analysis?.citations || []).length >= 1);
  pass('AI-006-retrieval', ask.retrieval?.resultCount >= 1);

  resetProviderCallCount();
  const insuf = await askRi(state, 'cryptoassets-only-special-sector-xyz regulatory changes');
  pass('AI-006B', insuf.insufficient && insuf.status === 'INSUFFICIENT_RI_EVIDENCE');
  pass('AI-006B-no-provider', getLastProviderCallCount() === 0);

  resetProviderCallCount();
  const cmp = await compareRegulatoryText(state);
  const diff = cmp.deterministicDiff;
  pass('AI-007', cmp.ok && diff?.added?.length >= 1);
  pass('AI-007-diff-preserved', JSON.stringify(cmp.analysis?.workflowPayload?.deterministicDiff?.added) === JSON.stringify(diff?.added));

  const facts = computeDeterministicFacts(state, parseAskQuery('How many open obligations are there?'));
  const countAsk = await askRi(state, 'How many open obligations are there?');
  const echoed = countAsk.analysis?.originalAiOutput?.openObligationCount;
  pass('AI-019', echoed === facts.openObligationCount);

  const ret = retrieveRiRecords(state, 'banking', { fixtureScenario: 'ai-006-ask-banking' });
  const bad20 = await runFixtureAiAnalysis(state, {
    taskType: AI_TASK_TYPE.AI_RI_QA,
    selection: selectionFromRetrieval(ret),
    fixtureScenario: 'ai-020-retrieval-boundary',
  });
  pass('AI-020', !bad20.persistable || bad20.analysis?.status === AI_ANALYSIS_STATUS.VALIDATION_FAILED);

  const baselAsk = await askRi(state, 'What Basel developments are linked to PRA implementation?');
  pass('AI-021', baselAsk.ok && /REVIEWED|BAS-MAP/i.test(JSON.stringify(baselAsk.analysis?.originalAiOutput || {})));

  const board = await generateExecutiveSummary(state, { period: '2026-Q3', board: true });
  pass('AI-022', board.ok && board.analysis?.reviewStatus === AI_REVIEW_STATUS.HUMAN_REVIEW_REQUIRED);

  const staleState = createFreshState();
  staleState.currentDemoUserId = state.currentDemoUserId;
  const first = await askRi(staleState, 'What regulatory changes currently affect the Banking sector?');
  const hashA = first.analysis?.contextHash;
  markAskRiOutdatedForChange(staleState, 'CHG-001');
  pass('AI-023', staleState.riAiAnalysisResults?.some((a) => a.analysisId === first.analysis?.analysisId && a.freshness === AI_FRESHNESS.OUTDATED));

  const mem = await askRi(state, 'What is the capital requirement under EU CRD V in France?');
  pass('AI-024', mem.insufficient && mem.providerCallCount === 0);

  const auditor = createFreshState();
  auditor.currentDemoUserId = auditor.people.find((p) => p.applicationRoleIds?.includes('AR-AUDIT-VIEWER'))?.id;
  pass('auditor-read', isAuditorReadOnly(auditor));
  const boardDeny = await generateExecutiveSummary(auditor, { board: true });
  const auditorCanAsk = await askRi(auditor, 'What regulatory changes currently affect the Banking sector?');
  pass('auditor-ask', auditorCanAsk.ok || auditorCanAsk.insufficient);

  const a5a = await runNode('acceptance-ri-ai-5a.mjs');
  const a5b = await runNode('acceptance-ri-ai-5b.mjs');
  pass('AI-5A-regression', a5a);
  pass('AI-5B-regression', a5b);

  console.log(JSON.stringify(R, null, 2));
  const failed = Object.entries(R).filter(([, v]) => v.startsWith('FAIL'));
  if (failed.length) {
    console.error('AI 5C failures:', failed);
    process.exit(1);
  }
  console.log('AI 5C acceptance: PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

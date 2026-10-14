import { createFreshState, migrateSavedSnapshot, SCHEMA_VERSION } from '../js/migrate.js';
import { AI_TASK_TYPE, AI_ANALYSIS_STATUS, AI_REVIEW_STATUS } from '../js/ai/enums.js';
import { runFixtureAiAnalysis } from '../js/ai/analysis-service.js';
import {
  generateChangeAnalysis,
  generateImpactAssessmentAi,
  generateObligationSuggestions,
  createDraftChangeFromAnalysis,
  createDraftIaFromAnalysis,
  createDraftObligationFromAnalysis,
  selectionForPublication,
} from '../js/ai/workflow-ai-service.js';
import { canCreateAiWorkflowDrafts, isAuditorReadOnly } from '../js/ai/persona-ai.js';
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
  const fresh = createFreshState();
  pass('fresh-schema-v17', fresh.schemaVersion === 17);
  const migrated = migrateSavedSnapshot({ ...fresh, schemaVersion: 16, riAiAnalysisResults: [{ analysisId: 'AIA-KEEP' }] });
  pass('migration-v16-v17', migrated.schemaVersion === 17 && migrated.riAiAnalysisResults?.[0]?.analysisId === 'AIA-KEEP');

  const state = createFreshState();
  state.currentDemoUserId = state.people.find((p) => p.applicationRoleIds?.includes('AR-REG-ANALYST'))?.id;

  const cascadeState = createFreshState();
  cascadeState.currentDemoUserId = state.currentDemoUserId;
  const ia0 = cascadeState.assessments.length;
  const obl0 = cascadeState.obligations.length;
  await generateChangeAnalysis(cascadeState, 'PUB-001');
  pass('AI-018-no-cascade', cascadeState.assessments.length === ia0 && cascadeState.obligations.length === obl0);

  const chgRes = await generateChangeAnalysis(state, 'PUB-001');
  pass('AI-002-analysis', chgRes.ok && chgRes.analysis?.taskType === AI_TASK_TYPE.AI_CHANGE_ANALYSIS);
  pass('AI-002-review', chgRes.analysis?.reviewStatus === AI_REVIEW_STATUS.HUMAN_REVIEW_REQUIRED);
  pass('AI-002-citations', (chgRes.analysis?.citations || []).length >= 1);

  const draftChg = createDraftChangeFromAnalysis(state, chgRes.analysis.analysisId);
  pass('AI-002-draft-change', draftChg.ok && state.changes.find((c) => c.id === draftChg.changeId)?.status === 'New');
  pass('AI-002-trace', (state.riAiWorkflowTraces || []).some((t) => t.entityId === draftChg.changeId));

  const iaRes = await generateImpactAssessmentAi(state, 'CHG-003');
  pass('AI-003-ia-analysis', iaRes.ok);
  const draftIa = createDraftIaFromAnalysis(state, iaRes.analysis.analysisId);
  pass('AI-003-draft-ia', draftIa.ok && state.assessments.find((a) => a.id === draftIa.assessmentId)?.status === 'Draft');

  const oblRes = await generateObligationSuggestions(state, 'IA-0031');
  pass('AI-004-obligation-analysis', oblRes.ok);
  const draftObl = createDraftObligationFromAnalysis(state, oblRes.analysis.analysisId, 0, {
    suggestedText: 'Human edited obligation text B for traceability test.',
  });
  pass('AI-004-draft-obligation', draftObl.ok && state.obligations.find((o) => o.id === draftObl.obligationId)?.status === 'Draft');
  pass('AI-017-human-text', draftObl.humanText?.includes('Human edited'));
  pass('AI-017-ai-original', draftObl.originalAiText?.length > 10);

  const bad14 = await runFixtureAiAnalysis(state, {
    taskType: AI_TASK_TYPE.AI_IMPACT_ASSESSMENT,
    selection: selectionForPublication('PUB-001'),
    fixtureScenario: 'ai-014-unknown-policy',
  });
  pass('AI-014-validation', !bad14.persistable || bad14.analysis?.status === AI_ANALYSIS_STATUS.VALIDATION_FAILED);

  const bad15 = await runFixtureAiAnalysis(state, {
    taskType: AI_TASK_TYPE.AI_CHANGE_ANALYSIS,
    selection: selectionForPublication('PUB-001'),
    fixtureScenario: 'ai-015-unsupported-deadline',
  });
  pass('AI-015-date', !bad15.persistable || bad15.analysis?.status === AI_ANALYSIS_STATUS.VALIDATION_FAILED);

  const auditor = createFreshState();
  auditor.currentDemoUserId = auditor.people.find((p) => p.applicationRoleIds?.includes('AR-AUDIT-VIEWER'))?.id;
  pass('AI-016-auditor-denied', !canCreateAiWorkflowDrafts(auditor) && isAuditorReadOnly(auditor));
  pass('AI-016-no-draft', createDraftChangeFromAnalysis(auditor, chgRes.analysis.analysisId).code === 'FORBIDDEN');

  const a5a = await runNode('acceptance-ri-ai-5a.mjs');
  pass('AI-5A-regression', a5a);

  console.log(JSON.stringify(R, null, 2));
  const failed = Object.entries(R).filter(([, v]) => v.startsWith('FAIL'));
  if (failed.length) {
    console.error('AI 5B failures:', failed);
    process.exit(1);
  }
  console.log('AI 5B acceptance: PASS');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

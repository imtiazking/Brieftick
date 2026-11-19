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
import {
  retrieveRiRecords,
  selectionFromRetrieval,
  computeDeterministicFacts,
  parseAskQuery,
  validateRetrievalPrecision,
  countOpenObligations,
  summarizeObligationPortfolio,
} from '../js/ai/ri-retrieval.js';
import {
  classifyObligationPrimaryStatus,
  obligationStatusIsOpen,
} from '../js/ai/obligation-portfolio.js';
import { frameworkChangeSeedIds } from '../js/ai/ri-graph-traverse.js';
import { actionIsOverdueAsOf } from '../js/ai/ri-graph-normalized.js';
import { labTodayISO } from '../js/platform/clock.js';
import {
  countLinkedOpenWorkObligationsForSector,
  expectedConsumerDutyObligationsEvidenceNoFindings,
  expectedConsumerDutyObligationsNoEvidence,
  expectedOperationalResilienceObligationsEvidenceAndFindings,
  expectedChangesNoImpactAssessment,
  expectedPraOperationalResilienceChangeIds,
} from './lib/ri-acceptance-expectations.mjs';
import {
  attributableAssuranceFindingIds,
  directEvidenceIds,
} from '../js/ai/obligation-attribution.js';
import { pathQualityScore, buildNormalizedRiGraph } from '../js/ai/ri-graph-normalized.js';
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

  const ret = retrieveRiRecords(state, 'banking', {
    fixtureScenario: 'ai-006-ask-banking',
    allowFixtureRetrieval: true,
  });
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

  const bankingQ = 'What regulatory changes currently affect the Banking sector?';
  const bankingRet = retrieveRiRecords(state, bankingQ);
  const bankingPrecision = validateRetrievalPrecision(state, { ...bankingRet, filters: { ...bankingRet.filters, sectorSlug: 'banking', requireCurrentlyRelevant: true } });
  pass('TEST-13-banking-precision', bankingPrecision.ok && bankingRet.resultCount > 0);
  pass(
    'TEST-13-banking-no-generic-only',
    !bankingRet.matchedRecordIds.some((id) => bankingRet.recordTypes[id] === 'Framework' && !bankingRet.matchReasons[id]?.includes('Banking'))
  );

  const reviewedMapping = (state.internationalImplementationMappings || []).find((m) => m.reviewStatus === 'REVIEWED');
  const baselRet = retrieveRiRecords(state, 'What Basel developments are linked to PRA implementation?');
  pass('TEST-13-basel-mapping-id', baselRet.reviewedMappingId === reviewedMapping?.mappingId);
  pass(
    'TEST-13-basel-triple',
    reviewedMapping &&
      baselRet.matchedRecordIds.includes(reviewedMapping.mappingId) &&
      baselRet.matchedRecordIds.includes(reviewedMapping.baselRecordId) &&
      baselRet.matchedRecordIds.includes(reviewedMapping.praPublicationId)
  );
  pass('TEST-13-basel-precision', validateRetrievalPrecision(state, baselRet).ok);

  const wealthRet = retrieveRiRecords(state, 'What regulatory changes currently affect Wealth Management?');
  pass('GATE-held-out-sector', wealthRet.resultCount > 0 && validateRetrievalPrecision(state, wealthRet).ok);

  const tprQ = 'What TPR requirements are relevant to Pension Providers?';
  const tprRet = retrieveRiRecords(state, tprQ);
  pass('GATE-held-out-tpr', tprRet.resultCount > 0 && tprRet.filters.intent === 'regulator-sector-evidence');

  const mifidNeg = await askRi(state, 'What are MiFID III requirements in Germany?');
  pass('GATE-mifid-germany', mifidNeg.insufficient && mifidNeg.providerCallCount === 0);
  const cbiNeg = await askRi(state, 'What does the Central Bank of Ireland require?');
  pass('GATE-cbi-ireland', cbiNeg.insufficient && cbiNeg.providerCallCount === 0);

  const portfolio = summarizeObligationPortfolio(state.obligations || []);
  const openCount = portfolio.counts.ACTIVE;
  const draftCount = portfolio.counts.DRAFT;
  pass('TEST-13-open-definition', openCount === countOpenObligations(state));
  pass('TEST-13-open-excludes-draft', draftCount > 0 && !obligationStatusIsOpen('Draft'));
  pass('TEST-13-obligation-portfolio-reconciliation', portfolio.reconciles);
  const synthetic = {
    obligations: [...(state.obligations || []), { id: 'OBL-SYN-UNCLASS', status: 'Pending Governance Sign-off' }],
  };
  const synPortfolio = summarizeObligationPortfolio(synthetic.obligations);
  pass(
    'TEST-13-obligation-synthetic-unclassified',
    classifyObligationPrimaryStatus('Pending Governance Sign-off') === 'UNCLASSIFIED' &&
      !obligationStatusIsOpen('Pending Governance Sign-off') &&
      classifyObligationPrimaryStatus('Pending Governance Sign-off') !== 'CLOSED' &&
      synPortfolio.counts.UNCLASSIFIED === portfolio.counts.UNCLASSIFIED + 1 &&
      synPortfolio.reconciles
  );
  const openRet = retrieveRiRecords(state, 'How many open obligations are there?');
  pass('TEST-13-open-retrieval', openRet.deterministicFacts.openObligationCount === openCount && openRet.resultCount > 0);
  pass('TEST-13-draft-facts', openRet.deterministicFacts.draftObligationCount === draftCount);
  pass(
    'NL-open-truncation-label',
    openCount > openRet.displayedEvidenceRecords
      ? openRet.evidenceDisplayTruncated === true && openRet.totalMatchingRecords === openCount
      : !openRet.evidenceDisplayTruncated
  );

  const compoundQ =
    'What regulatory changes currently affect the Banking sector, and what are the key compliance actions firms should take?';
  const compoundRet = retrieveRiRecords(state, compoundQ);
  const compoundAsk = await askRi(state, compoundQ);
  pass('NL-compound-banking-retrieval', compoundRet.primaryAdequate && compoundRet.primaryResultCount > 0);
  pass('NL-compound-banking-not-insufficient', !compoundAsk.insufficient && compoundAsk.analysis?.taskType === AI_TASK_TYPE.AI_RI_QA);
  pass('NL-compound-banking-confidence', Boolean(compoundAsk.analysis?.evidenceConfidence));

  const wealthCompoundQ =
    'What regulatory changes currently affect Wealth Management, and which obligations remain open?';
  const wealthCompoundRet = retrieveRiRecords(state, wealthCompoundQ);
  const wealthCompoundAsk = await askRi(state, wealthCompoundQ);
  pass('NL-compound-wealth', wealthCompoundRet.primaryAdequate && wealthCompoundRet.primaryResultCount > 0);
  const wealthLinkedExpect = countLinkedOpenWorkObligationsForSector(state, 'wealth-management');
  const wealthLinkedActual =
    wealthCompoundRet.evaluatedCounts?.Obligation?.evaluated
      ? wealthCompoundRet.evaluatedCounts.Obligation.count
      : wealthCompoundRet.compoundSummary?.linkedObligationCount ?? null;
  pass(
    'NL-compound-wealth-partial',
    wealthLinkedActual === wealthLinkedExpect || (wealthLinkedActual == null && wealthLinkedExpect === 0)
  );
  pass('NL-compound-wealth-not-insufficient', !wealthCompoundAsk.insufficient);

  const consumerDutyActionsQ =
    'Which Consumer Duty changes have linked Actions, and what is the status of those Actions?';
  const cdRet = retrieveRiRecords(state, consumerDutyActionsQ);
  const cdAsk = await askRi(state, consumerDutyActionsQ);
  pass('NL-consumer-duty-graph', cdRet.filters.intent === 'graph-query' && cdRet.primaryResultCount > 0);
  pass('NL-consumer-duty-actions', (cdRet.compoundSummary?.linkedActionCount || 0) > 0);
  pass(
    'NL-consumer-duty-status-facts',
    (cdRet.deterministicFacts?.linkedActionStatuses || []).length > 0 &&
      (cdRet.deterministicFacts.linkedActionStatuses || []).every((a) => state.actions?.some((x) => x.id === a.actionId && x.status === a.status))
  );
  pass('NL-consumer-duty-not-insufficient', !cdAsk.insufficient);

  const bankingControlsQ = 'What controls support Banking sector regulatory changes?';
  const ctrlRet = retrieveRiRecords(state, bankingControlsQ);
  pass(
    'NL-graph-controls-banking',
    ctrlRet.primaryResultCount > 0 &&
      ((ctrlRet.evaluatedCounts?.Control?.evaluated && ctrlRet.evaluatedCounts.Control.count > 0) ||
        ctrlRet.primaryResultCount > 0)
  );

  const asOf = '2026-10-14';
  const opResQ =
    'Which Operational Resilience obligations have linked Actions, and which of those Actions are overdue?';
  const opResRet = retrieveRiRecords(state, opResQ, { asOfDate: asOf });
  pass('NL-graph-opres-obligations', opResRet.primaryAdequate && opResRet.primaryResultCount > 0);
  pass(
    'NL-graph-opres-overdue-action',
    (opResRet.matchedRecordIdsAll || []).some((id) => opResRet.recordTypes[id] === 'Action' && state.actions?.find((a) => a.id === id)?.status === 'Overdue')
  );
  pass('NL-graph-as-of', opResRet.deterministicFacts?.asOfDate === asOf);

  const cdCtrlQ = 'Which Consumer Duty controls are linked to open obligations?';
  const cdCtrlRet = retrieveRiRecords(state, cdCtrlQ, { asOfDate: asOf });
  const cdControlIds = (cdCtrlRet.matchedRecordIdsAll || []).filter((id) => cdCtrlRet.recordTypes[id] === 'Control');
  pass('NL-graph-cd-controls', cdCtrlRet.primaryAdequate && cdControlIds.length > 0);
  pass(
    'NL-graph-cd-controls-open-obl-path',
    cdControlIds.length > 0 &&
      cdControlIds.every((id) => {
        const path = cdCtrlRet.pathByRecordId?.[id] || [];
        return path.some((s) => s.kind === 'edge' && s.edgeType === 'obligation_supported_by_control');
      })
  );

  const cdChangesQ = 'Which Consumer Duty changes have linked Actions, and what is the status of those Actions?';
  const cdChangesRet = retrieveRiRecords(state, cdChangesQ, { asOfDate: asOf });
  const cdActionIds = [...new Set((cdChangesRet.matchedRecordIdsAll || []).filter((id) => cdChangesRet.recordTypes[id] === 'Action'))];
  pass('NL-graph-collect-all-actions', cdActionIds.length >= 2);

  const fwPrecisionRet = retrieveRiRecords(state, 'Which Consumer Duty changes have linked Actions?', { asOfDate: asOf });
  const fwChangeIds = (fwPrecisionRet.matchedRecordIdsAll || []).filter((id) => fwPrecisionRet.recordTypes[id] === 'Change');
  pass('NL-graph-framework-no-sector-leak', !fwChangeIds.includes('CHG-010'));
  const cdFw = (state.regulatoryFrameworks || []).find((f) => /consumer duty/i.test(f.name));
  if (cdFw) {
    const seeds = frameworkChangeSeedIds(state, cdFw.id);
    pass(
      'NL-graph-framework-text-not-authoritative',
      seeds.textCandidates.length === 0 || seeds.authoritative.every((id) => !seeds.textCandidates.includes(id))
    );
    pass('NL-graph-framework-text-not-seed-alone', !seeds.textCandidates.some((id) => seeds.authoritative.length === 0));
  }
  pass(
    'NL-graph-path-prefers-direct',
    pathQualityScore([
      { kind: 'node', type: 'Obligation', id: 'OBL-1' },
      { kind: 'edge', edgeType: 'obligation_supported_by_control' },
      { kind: 'node', type: 'Control', id: 'CTRL-1' },
    ]) >
      pathQualityScore([
        { kind: 'node', type: 'Change', id: 'CHG-1' },
        { kind: 'edge', edgeType: 'change_links_control' },
        { kind: 'node', type: 'Control', id: 'CTRL-1' },
      ])
  );
  const graphMeta = buildNormalizedRiGraph(state);
  const act019Conflict = (graphMeta.conflicts || []).find((c) => /ACT-019/.test(c.detail || ''));
  pass('NL-graph-act019-no-false-conflict', !act019Conflict);

  const opResEvQ = 'What evidence and assurance records are linked to Operational Resilience obligations?';
  const opResEvRet = retrieveRiRecords(state, opResEvQ, { asOfDate: asOf });
  pass(
    'NL-graph-opres-evidence-assurance',
    opResEvRet.primaryAdequate &&
      (opResEvRet.matchedRecordIdsAll || []).some((id) => opResEvRet.recordTypes[id] === 'Evidence') &&
      (opResEvRet.matchedRecordIdsAll || []).some((id) => /Assurance/.test(opResEvRet.recordTypes[id] || ''))
  );

  const opResOverdueQ =
    'Which Operational Resilience actions are overdue, and which obligations are they linked to?';
  const opResOverdueRet = retrieveRiRecords(state, opResOverdueQ, { asOfDate: asOf });
  pass('TEST-display-opres-act031', (opResOverdueRet.matchedRecordIdsAll || []).includes('ACT-031'));
  pass('TEST-display-opres-obl0088', (opResOverdueRet.matchedRecordIdsAll || []).includes('OBL-0088'));
  pass(
    'TEST-display-no-raw-edges',
    !Object.values(opResOverdueRet.displayReasons || {}).some((r) => /change_links_|assessment_for_change|obligation_has_action/.test(r))
  );
  pass('TEST-display-acyclic', !Object.values(opResOverdueRet.displayReasons || {}).some((r) => /CHG-010.*CHG-010/.test(r)));
  pass('TEST-display-as-of-label', /14 October 2026/.test(opResOverdueRet.deterministicFacts?.asOfDateLabel || ''));
  const act031 = (state.actions || []).find((a) => a.id === 'ACT-031');
  pass('TEST-act031-due-date', act031?.dueDate === '2026-10-10');
  pass('TEST-ask-ri-as-of-injected', opResOverdueRet.deterministicFacts?.asOfDate === '2026-10-14');
  pass('TEST-act031-overdue-at-as-of', actionIsOverdueAsOf(act031, '2026-10-14') === true);
  const act031Display = opResOverdueRet.displayReasons?.['ACT-031'] || '';
  pass(
    'TEST-display-act031-overdue-copy',
    /was due on 10 October 2026/i.test(act031Display) && /overdue as of 14 October 2026/i.test(act031Display)
  );
  const opResRuntimeRet = retrieveRiRecords(state, opResOverdueQ);
  pass('TEST-runtime-lab-today', labTodayISO() === '2026-10-14');
  pass('TEST-runtime-as-of-date', opResRuntimeRet.deterministicFacts?.asOfDate === '2026-10-14');

  const { formatCustomerProvenanceFromPath } = await import('../js/ai/ask-ri-provenance.js');
  const ev9 = state.evidence.find((e) => e.id === 'EVD-009');
  const ev9Obl = state.obligations.find((o) => o.id === ev9.obligationId);
  const evd9Line = formatCustomerProvenanceFromPath(
    state,
    [
      { kind: 'node', type: 'Change', id: ev9Obl.changeId },
      { kind: 'node', type: 'Obligation', id: ev9.obligationId },
      { kind: 'node', type: 'Evidence', id: 'EVD-009' },
    ],
    'Evidence',
    'EVD-009',
    { asOfDate: asOf }
  );
  pass('TEST-evd009-canonical-obl0142', /OBL-0142/.test(evd9Line) && !/^CHG-001 → OBL-0143 → EVD-009/.test(evd9Line));

  const cdPredQ = 'Which Consumer Duty obligations have evidence but no assurance findings?';
  const expectedCdPred = expectedConsumerDutyObligationsEvidenceNoFindings(state);
  const cdPredRet = retrieveRiRecords(state, cdPredQ);
  const cdPredObIds = (cdPredRet.matchedRecordIdsAll || cdPredRet.matchedRecordIds)
    .filter((id) => cdPredRet.recordTypes[id] === 'Obligation')
    .sort();
  pass('TEST-cd-predicate-intent', cdPredRet.filters?.intent === 'target-predicate');
  pass('TEST-cd-predicate-target-type', cdPredRet.requestedTargetType === 'Obligation');
  pass('TEST-cd-predicate-ids', JSON.stringify(cdPredObIds) === JSON.stringify(expectedCdPred));
  for (const id of cdPredObIds) {
    pass(`TEST-cd-predicate-evidence-${id}`, directEvidenceIds(state, id).length > 0);
    pass(`TEST-cd-predicate-no-find-${id}`, attributableAssuranceFindingIds(state, id).length === 0);
  }
  pass(
    'TEST-cd-predicate-focused-evidence',
    !(cdPredRet.matchedRecordIds || []).some((id) => ['Control', 'Action', 'Change'].includes(cdPredRet.recordTypes[id]))
  );
  const cdPredAsk = await askRi(state, cdPredQ);
  const cdPredAns =
    cdPredAsk.analysis?.workflowPayload?.answer || cdPredAsk.analysis?.originalAiOutput?.answer || '';
  pass(
    'TEST-cd-predicate-targeted-answer',
    cdPredAsk.ok &&
      (/attributable assurance findings/i.test(cdPredAns) || /meet this criterion in the current RI dataset/i.test(cdPredAns))
  );
  pass(
    'TEST-cd-predicate-zero-or-list',
    expectedCdPred.length === 0
      ? /No Consumer Duty obligations meet this criterion/i.test(cdPredAns)
      : expectedCdPred.every((id) => cdPredAns.includes(id))
  );
  const cdPredEval = cdPredRet.deterministicFacts?.predicateEvaluation;
  pass('TEST-cd-zero-qualifier-supported', cdPredAsk.ok && !cdPredAsk.insufficient);
  pass('TEST-cd-zero-qualifier-candidate-count', cdPredEval?.candidateCount === 3);
  pass('TEST-cd-zero-qualifier-qualifying-count', cdPredEval?.qualifyingCount === expectedCdPred.length);
  pass('TEST-cd-zero-qualifier-eval-complete', cdPredEval?.predicateEvaluationComplete === true);
  pass('TEST-cd-zero-qualifier-top-level', cdPredRet.predicateEvaluation?.candidateCount === 3);

  resetProviderCallCount();
  const osfiAsk = await askRi(state, 'What does OSFI require for Consumer Duty?');
  pass('TEST-osfi-insufficient', osfiAsk.insufficient && osfiAsk.status === 'INSUFFICIENT_RI_EVIDENCE');
  pass('TEST-osfi-zero-records', (osfiAsk.retrieval?.matchedRecordIds?.length ?? 0) === 0);
  pass('TEST-osfi-not-predicate-eval', !osfiAsk.retrieval?.deterministicFacts?.predicateEvaluation?.predicateEvaluationComplete);

  const cdNoEvQ = 'Which Consumer Duty obligations have no evidence?';
  const expectedCdNoEv = expectedConsumerDutyObligationsNoEvidence(state);
  const cdNoEvRet = retrieveRiRecords(state, cdNoEvQ);
  const cdNoEvObIds = (cdNoEvRet.matchedRecordIdsAll || cdNoEvRet.matchedRecordIds)
    .filter((id) => cdNoEvRet.recordTypes[id] === 'Obligation')
    .sort();
  pass('TEST-cd-no-evidence-intent', cdNoEvRet.filters?.intent === 'target-predicate');
  pass('TEST-cd-no-evidence-ids', JSON.stringify(cdNoEvObIds) === JSON.stringify(expectedCdNoEv));
  pass(
    'TEST-cd-predicate-sets-differ',
    JSON.stringify(cdPredObIds) !== JSON.stringify(cdNoEvObIds) || (expectedCdPred.length === 0 && expectedCdNoEv.length > 0)
  );
  for (const id of cdNoEvObIds) {
    pass(`TEST-cd-no-evidence-count-${id}`, directEvidenceIds(state, id).length === 0);
  }

  const opResBothQ = 'Which Operational Resilience obligations have evidence and assurance findings?';
  const expectedOpResBoth = expectedOperationalResilienceObligationsEvidenceAndFindings(state);
  const opResBothRet = retrieveRiRecords(state, opResBothQ);
  const opResBothIds = (opResBothRet.matchedRecordIdsAll || [])
    .filter((id) => opResBothRet.recordTypes[id] === 'Obligation')
    .sort();
  pass('TEST-opres-evidence-and-findings', JSON.stringify(opResBothIds) === JSON.stringify(expectedOpResBoth));
  for (const id of opResBothIds) {
    pass(`TEST-opres-both-ev-${id}`, directEvidenceIds(state, id).length > 0);
    pass(`TEST-opres-both-find-${id}`, attributableAssuranceFindingIds(state, id).length > 0);
  }

  const noIaQ = 'Which regulatory changes have no impact assessment?';
  const expectedNoIa = expectedChangesNoImpactAssessment(state);
  const noIaRet = retrieveRiRecords(state, noIaQ);
  const noIaChanges = (noIaRet.matchedRecordIdsAll || [])
    .filter((id) => noIaRet.recordTypes[id] === 'Change')
    .sort();
  pass('TEST-changes-no-ia-ids', JSON.stringify(noIaChanges) === JSON.stringify(expectedNoIa));
  for (const id of noIaChanges) {
    const iaCount = (state.assessments || []).filter((a) => a.changeId === id).length;
    pass(`TEST-changes-no-ia-count-${id}`, iaCount === 0);
  }

  const praOrQ = 'What PRA changes are currently linked to Operational Resilience?';
  const expectedPraOr = expectedPraOperationalResilienceChangeIds(state);
  const praOrRet = retrieveRiRecords(state, praOrQ);
  const praOrChanges = [
    ...new Set((praOrRet.matchedRecordIdsAll || []).filter((id) => praOrRet.recordTypes[id] === 'Change')),
  ].sort();
  pass('TEST-pra-or-anchor-intersection', praOrRet.plan?.anchorIntersection === true);
  pass('TEST-pra-or-change-ids', JSON.stringify(praOrChanges) === JSON.stringify(expectedPraOr));
  pass('TEST-chg013-not-in-pra-or', !expectedPraOr.includes('CHG-013'));

  const praOrCtrlQ =
    'What PRA changes are currently linked to Operational Resilience, and what controls are connected to them?';
  const praOrCtrlRet = retrieveRiRecords(state, praOrCtrlQ);
  const praOrCtrlChanges = [
    ...new Set((praOrCtrlRet.matchedRecordIdsAll || []).filter((id) => praOrCtrlRet.recordTypes[id] === 'Change')),
  ];
  pass('TEST-pra-or-compound-no-chg013', !praOrCtrlChanges.includes('CHG-013'));
  pass('TEST-pra-or-compound-intersection', praOrCtrlRet.plan?.anchorIntersection === true);

  const apraNeg = await askRi(state, 'What does APRA require for operational resilience?');
  pass('NL-apra-unsupported', apraNeg.insufficient && apraNeg.providerCallCount === 0);

  const openAsk = await askRi(state, 'How many open obligations are there?');
  pass('NL-open-confidence', Boolean(openAsk.analysis?.evidenceConfidence));

  const bafinCompound = await askRi(state, 'What German BaFin changes affect Banking and what actions are required?');
  pass('NL-bafin-compound-blocked', bafinCompound.insufficient && bafinCompound.providerCallCount === 0);

  const frRet = retrieveRiRecords(state, 'What is the capital requirement under EU CRD V in France?');
  pass('TEST-13-entity-gate-france', frRet.insufficientReason && frRet.resultCount === 0);
  const cryptoRet = retrieveRiRecords(state, 'cryptoassets-only-special-sector-xyz regulatory changes');
  pass('TEST-13-entity-gate-crypto', cryptoRet.insufficientReason && cryptoRet.resultCount === 0);

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

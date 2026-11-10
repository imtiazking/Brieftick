import { questionMentionsPublicationReference } from '../ask-ri/publication-pdf-question-match.mjs';
import { assessThemeCoverage } from './theme-coverage.mjs';
import { assessCatalogueTenantFusion } from './fusion-coverage.mjs';

const DEADLINE_PATTERNS = [
  /\bmust comply by\b/i,
  /\bbinding deadline\b/i,
  /\bno later than \d{1,2}\s+\w+\s+20\d{2}\b/i,
  /\bweekly board sign-off\b/i,
  /\bstatutory offence\b/i,
  /\bnew criminal offence\b/i,
  /\bbinding obligation\b/i,
];

const SME_DIMENSIONS = ['D04', 'D05', 'D06', 'D07'];

/** Map legacy evaluation-grade labels to production-style response states. */
export function mapLegacyIdealToResponseState(classification) {
  if (!classification) return 'ANSWERED';
  const c = String(classification);
  if (c === 'PARTIAL_PASS') return 'ANSWERED';
  if (c === 'CORRECT_INSUFFICIENT_EVIDENCE') return 'INSUFFICIENT_EVIDENCE';
  if (c === 'INSUFFICIENT_EVIDENCE_OR_UNRESOLVED') return 'INSUFFICIENT_EVIDENCE';
  if (c === 'PASS_WITH_REFUTATION') return 'ANSWERED';
  if (c === 'UNRESOLVED_OR_INSUFFICIENT') return 'UNRESOLVED_QUERY_SEMANTICS';
  if (c === 'PARTIAL_PASS_OR_UNRESOLVED') return 'ANSWERED';
  return c;
}

export function resolveIdealResponseState(caseRow) {
  return (
    caseRow.expectedIdealResult?.responseState ||
    mapLegacyIdealToResponseState(caseRow.expectedIdealResult?.outcomeClassification) ||
    mapLegacyIdealToResponseState(caseRow.expectedResultClassification) ||
    'ANSWERED'
  );
}

export function resolveIdealScoringClassification(caseRow) {
  return (
    caseRow.expectedIdealResult?.idealScoringClassification ||
    caseRow.expectedIdealResult?.outcomeClassification ||
    caseRow.expectedResultClassification ||
    'ANSWERED'
  );
}

export function resolveIdealOutcomeClassification(caseRow) {
  return resolveIdealResponseState(caseRow);
}

function refutesFalsePremise(answer, caseRow) {
  const ideal = caseRow.expectedIdealResult || {};
  if (!ideal.mustRefuteFalsePremise) return true;
  return (
    /consultation|propos(ed|al)|not in force/i.test(answer) &&
    (/no binding|does not (impose|create)|not a legal compliance|no compliance deadline/i.test(answer) ||
      /cannot identify.*(?:binding|legal).*deadline/i.test(answer))
  );
}

function hasResponseStateContradiction(caseRow, engineResult, idealState) {
  const status = engineResult?.status || 'UNKNOWN';
  const answer = String(engineResult?.answer || '');
  const citations = engineResult?.citations || [];
  const legacyExp = caseRow.expectedResultClassification;

  if (idealState === 'INSUFFICIENT_EVIDENCE' || legacyExp === 'CORRECT_INSUFFICIENT_EVIDENCE') {
    return status === 'ANSWERED' && citations.length > 0;
  }

  if (
    idealState === 'UNRESOLVED_QUERY_SEMANTICS' ||
    legacyExp === 'UNRESOLVED_OR_INSUFFICIENT' ||
    legacyExp === 'INSUFFICIENT_EVIDENCE_OR_UNRESOLVED'
  ) {
    if (status !== 'ANSWERED') return false;
    const misleadingUuid = /00000000-0000-4000-8000-000000000001/.test(caseRow.question || '');
    if (misleadingUuid) {
      const flagged =
        /\b00000000-0000-4000-8000-000000000001\b/i.test(answer) &&
        !/not (found|indexed|valid|available)|cannot|wrong|mismatch|unresolved/i.test(answer);
      const substantiveWithCitations = citations.length >= 2 && answer.length > 80;
      return substantiveWithCitations || flagged;
    }
    return citations.length > 0 && answer.length > 60;
  }

  if (idealState === 'ANSWERED' && (status === 'INSUFFICIENT_EVIDENCE' || status === 'UNRESOLVED')) {
    return true;
  }

  return false;
}

function computeRetrievalPass({ status, dims }) {
  return status === 'ANSWERED' && dims.D02 >= 2 && dims.D03 >= 1;
}

function resolvePrimaryOutcome({
  caseRow,
  engineResult,
  context,
  dims,
  criticalFailures,
  prohibitedHit,
  themeCoverage,
  fusion,
  idealState,
  idealScoring,
}) {
  const status = engineResult?.status || 'UNKNOWN';
  const legacyExp = caseRow.expectedResultClassification;

  if (!context.evidenceAvailable) return { outcome: 'NOT_RUN', notes: ['missing_evidence_pack'] };
  if (criticalFailures.length) return { outcome: 'FAIL', notes: ['critical_failure'] };

  const stateContradiction = hasResponseStateContradiction(caseRow, engineResult, idealState);
  if (stateContradiction) {
    return {
      outcome: 'FAIL',
      notes: ['expected_response_state_contradiction'],
      expectedResponseState: idealState,
      actualEngineStatus: status,
    };
  }

  if (idealState === 'INSUFFICIENT_EVIDENCE' || legacyExp === 'CORRECT_INSUFFICIENT_EVIDENCE') {
    if (status === 'INSUFFICIENT_EVIDENCE' || status === 'UNRESOLVED' || status === 'ZERO_RESULTS') {
      return { outcome: 'CORRECT_INSUFFICIENT_EVIDENCE', notes: [] };
    }
    return { outcome: 'FAIL', notes: ['expected_insufficient_but_answered'] };
  }

  if (
    (idealState === 'UNRESOLVED_QUERY_SEMANTICS' || legacyExp === 'UNRESOLVED_OR_INSUFFICIENT') &&
    !caseRow.expectedIdealResult?.responseState
  ) {
    if (status === 'UNRESOLVED' || status === 'INSUFFICIENT_EVIDENCE') {
      return { outcome: 'CORRECT_INSUFFICIENT_EVIDENCE', notes: [] };
    }
    return { outcome: 'FAIL', notes: ['expected_unresolved'] };
  }

  if (idealState === 'UNRESOLVED_QUERY_SEMANTICS' || legacyExp === 'UNRESOLVED_OR_INSUFFICIENT') {
    if (status === 'UNRESOLVED' || status === 'INSUFFICIENT_EVIDENCE') {
      return { outcome: 'CORRECT_INSUFFICIENT_EVIDENCE', notes: [] };
    }
    return { outcome: 'FAIL', notes: ['expected_unresolved'] };
  }

  if (idealScoring === 'PASS_WITH_REFUTATION' || caseRow.expectedIdealResult?.mustRefuteFalsePremise) {
    if (prohibitedHit) return { outcome: 'FAIL', notes: ['prohibited_claim'] };
    if (refutesFalsePremise(String(engineResult?.answer || ''), caseRow) && status === 'ANSWERED') {
      if (themeCoverage.themeCoverageRatio < 1 && themeCoverage.requiredThemes.length) {
        return { outcome: 'PARTIAL_PASS', notes: ['refutation_theme_gap'] };
      }
      return { outcome: 'RETRIEVAL_PASS', notes: ['refutation_pending_sme'] };
    }
    if (status === 'ANSWERED') return { outcome: 'PARTIAL_PASS', notes: ['incomplete_refutation'] };
    return { outcome: 'FAIL', notes: [] };
  }

  if (status !== 'ANSWERED') {
    return { outcome: 'FAIL', notes: ['engine_not_answered'] };
  }

  const retrievalPass = computeRetrievalPass({ status, dims });

  if (fusion.fusionRequired && !fusion.fusionSatisfied) {
    return {
      outcome: retrievalPass ? 'PARTIAL_PASS' : 'FAIL',
      notes: ['catalogue_tenant_fusion_incomplete'],
      fusion,
    };
  }

  const themesRequired = themeCoverage.requiredThemes.length > 0;
  const themesComplete = !themesRequired || themeCoverage.themeCoverageRatio >= 1;

  if (caseRow.expectedIdealResult?.requiresControlImpactReasoning) {
  const ctrlTheme = themeCoverage.requiredThemes.find((t) => /control impact/i.test(t));
  if (
    ctrlTheme &&
    (themeCoverage.themesMissing.includes(ctrlTheme) || themeCoverage.themeCoverageRatio < 1)
  ) {
    return {
      outcome: retrievalPass ? 'PARTIAL_PASS' : 'FAIL',
      notes: ['missing_control_impact_themes'],
    };
  }
  }

  if (!retrievalPass) {
    return { outcome: 'PARTIAL_PASS', notes: ['weak_retrieval_dimensions'] };
  }

  if (!themesComplete) {
    return {
      outcome: 'PARTIAL_PASS',
      notes: ['missing_required_answer_themes'],
    };
  }

  const smePending = SME_DIMENSIONS.some((id) => dims[id] === 'AWAITING_SME_REVIEW');
  const answerQualityPendingReview = smePending || Boolean(caseRow.reasonedImplicationsExpected);

  if (answerQualityPendingReview) {
    return { outcome: 'RETRIEVAL_PASS', notes: ['answer_quality_pending_review'] };
  }

  return { outcome: 'PASS', notes: [] };
}

/**
 * Score one case from frozen expectations + deterministic engine output.
 */
export function scoreEvalCase(caseRow, engineResult, context) {
  const dims = {};
  const criticalFailures = [];
  const notes = [];
  const answer = String(engineResult?.answer || '');
  const citations = engineResult?.citations || [];
  const status = engineResult?.status || 'UNKNOWN';
  const execution = engineResult?.execution || {};
  const mentionsPub = questionMentionsPublicationReference(caseRow.question || '');
  const ideal = caseRow.expectedIdealResult || {};
  const idealState = resolveIdealResponseState(caseRow);
  const idealScoring = resolveIdealScoringClassification(caseRow);

  const needsSemanticDiscovery = Boolean(ideal.requiresSemanticPublicationDiscovery);
  const expectedTenant = Boolean(caseRow.tenantDataRequired) && !mentionsPub && !needsSemanticDiscovery;
  const idealCatalogue =
    mentionsPub ||
    needsSemanticDiscovery ||
    (caseRow.expectedPublicationIds?.length > 0 && !caseRow.tenantDataRequired);

  if (needsSemanticDiscovery && !context.simulateCatalogueAttach) dims.D01 = 0;
  else if (idealCatalogue && mentionsPub) dims.D01 = 3;
  else if (idealCatalogue && needsSemanticDiscovery && context.simulateCatalogueAttach) dims.D01 = 2;
  else if (expectedTenant && !mentionsPub) dims.D01 = 3;
  else if (idealCatalogue && !mentionsPub) dims.D01 = 0;
  else if (caseRow.questionCategory === 'H' && !mentionsPub) dims.D01 = 1;
  else dims.D01 = 1;

  const citedPubIds = [...new Set(citations.map((c) => c.publicationId).filter(Boolean))];
  const expectedIds = caseRow.expectedPublicationIds || [];
  if (!expectedIds.length) {
    dims.D02 = citedPubIds.length === 0 ? 3 : 1;
  } else {
    const hit = expectedIds.filter((id) => citedPubIds.includes(id)).length;
    const ratio = hit / expectedIds.length;
    dims.D02 = ratio >= 1 ? 3 : ratio >= 0.5 ? 2 : ratio > 0 ? 1 : 0;
  }

  const expectedPages = (caseRow.expectedCitationSections || [])
    .flatMap((s) => s.pages || [])
    .filter((p) => typeof p === 'number');
  if (expectedPages.length) {
    const citedPages = citations.map((c) => c.physicalPageNumber).filter((p) => typeof p === 'number');
    const overlap = expectedPages.filter((p) => citedPages.includes(p)).length;
    dims.D03 = overlap >= 2 ? 3 : overlap === 1 ? 2 : citedPages.length ? 1 : 0;
  } else if (citations.length && status === 'ANSWERED') {
    dims.D03 = 2;
  } else {
    dims.D03 = 0;
  }

  for (const id of SME_DIMENSIONS) {
    dims[id] = 'AWAITING_SME_REVIEW';
  }

  let prohibitedHit = false;
  for (const pat of DEADLINE_PATTERNS) {
    if (pat.test(answer)) {
      prohibitedHit = true;
      notes.push(`prohibited_pattern:${pat.source}`);
    }
  }
  for (const phrase of caseRow.prohibitedClaims || []) {
    const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (re.test(answer)) {
      prohibitedHit = true;
      notes.push(`prohibited_phrase:${phrase}`);
    }
  }
  dims.D08 = prohibitedHit ? 0 : citations.length || status !== 'ANSWERED' ? 2 : 3;

  const expectsInsufficient = idealState === 'INSUFFICIENT_EVIDENCE' || String(idealScoring).includes('INSUFFICIENT');
  if (expectsInsufficient) {
    dims.D09 =
      status === 'INSUFFICIENT_EVIDENCE' || status === 'UNRESOLVED' || engineResult?.insufficient ? 3 : 1;
  } else if (status === 'ANSWERED') {
    dims.D09 = 2;
  } else {
    dims.D09 = 1;
  }

  dims.D10 = 'NOT_MEASURED';
  dims.D11 = 'NOT_MEASURED';

  if (prohibitedHit) criticalFailures.push('CF-02');
  if (prohibitedHit && /binding obligation|statutory/i.test(answer)) criticalFailures.push('CF-01');
  if (
    caseRow.expectedRegulatoryStatus === 'consultation' &&
    execution.mustNotPresentAsBindingObligation === false &&
    /must\b/i.test(answer)
  ) {
    criticalFailures.push('CF-06');
    notes.push('consultation_may_be_presented_as_binding');
  }
  const wrongPub =
    expectedIds.length && citedPubIds.length && !citedPubIds.every((id) => expectedIds.includes(id));
  if (wrongPub) criticalFailures.push('CF-04');

  const themeCoverage = assessThemeCoverage(caseRow, engineResult);
  const fusion = assessCatalogueTenantFusion(caseRow, engineResult);

  const resolved = resolvePrimaryOutcome({
    caseRow,
    engineResult,
    context,
    dims,
    criticalFailures,
    prohibitedHit,
    themeCoverage,
    fusion,
    idealState,
    idealScoring,
  });

  const outcome = resolved.outcome;
  notes.push(...(resolved.notes || []));

  const retrievalSuccess = computeRetrievalPass({ status, dims });
  const smePending = SME_DIMENSIONS.some((id) => dims[id] === 'AWAITING_SME_REVIEW');
  const answerQualityPendingReview =
    smePending ||
    Boolean(caseRow.reasonedImplicationsExpected) ||
    outcome === 'RETRIEVAL_PASS' ||
    (themeCoverage.requiredThemes.length > 0 && themeCoverage.themeCoverageRatio < 1);

  return {
    testId: caseRow.testId,
    outcome,
    productionResponseState: status,
    technicalRetrievalOutcome: retrievalSuccess ? 'RETRIEVAL_SUCCESS' : 'RETRIEVAL_INCOMPLETE',
    answerQualityPendingReview,
    idealResponseState: idealState,
    idealScoringClassification: idealScoring,
    idealOutcomeClassification: idealState,
    v1ExpectedResultClassification: caseRow.v1ExpectedResultClassification || null,
    engineStatus: status,
    executionEvidenceSource: execution.evidenceSource || null,
    executionEvidenceSources: execution.evidenceSources || [],
    interpretedAs: engineResult?.interpretedAs || null,
    citationCount: citations.length,
    citedPublicationIds: citedPubIds,
    themeCoverage,
    catalogueTenantFusion: fusion,
    expectedResponseStateContradiction: hasResponseStateContradiction(caseRow, engineResult, idealState),
    dimensions: dims,
    criticalFailures,
    notes,
    prohibitedClaimAutomatable: true,
    hallucinationDetection: 'NOT_AUTOMATABLE',
    scoringRubricVersion: 'ask-ri-v2-rubric-v2.2',
  };
}

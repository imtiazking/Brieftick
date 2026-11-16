/**
 * Deterministic evidence–question coverage (fail-closed).
 * Production path uses question + retrieval + bundle only — never eval expectedPublicationIds/themes.
 */
import {
  extractMaterialIssuesFromQuestion,
  questionReferencesAbsentFromRetrieval,
} from './extract-question-material-issues.mjs';

function normaliseText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ');
}

function chunkSupportsIssue(issue, chunk, question) {
  const blob = normaliseText(
    `${chunk.verbatimText || ''} ${chunk.sectionReference || ''} ${chunk.publicationTitle || ''} ${chunk.publicationReference || ''}`,
  );
  const qTokens = normaliseText(question)
    .split(/\s+/)
    .filter((t) => t.length > 4)
    .slice(0, 12);
  const hits = qTokens.filter((t) => blob.includes(t)).length;
  if (hits < 2 && issue.kind !== 'question_core') return false;

  if (issue.kind === 'binding_vs_guidance') {
    if (issue.id === 'binding_obligation') return /\bmust\b|\bshall\b|\brule\b/i.test(chunk.verbatimText || '');
    if (issue.id === 'guidance_status') return /guidance|should/i.test(blob);
  }
  if (issue.kind === 'temporal') {
    const hasDate = /\b20\d{2}\b|effective|commence|force/i.test(chunk.verbatimText || '');
    if (!hasDate) return false;
  }
  if (issue.kind === 'applicability') {
    return /\bfirm\b|apply|scope/i.test(blob);
  }
  if (issue.kind === 'jurisdiction') {
    const qRegs = (question.match(/\b(CONC|COBS|PRIN|FCA)\b/gi) || []).map((x) => x.toLowerCase());
    if (qRegs.length && !qRegs.some((r) => blob.includes(r))) return false;
  }
  return hits >= 1 || issue.kind === 'question_core';
}

function issueMappingForChunk(issue, chunks, question) {
  const supporting = chunks.filter((c) => chunkSupportsIssue(issue, c, question));
  return {
    issueId: issue.id,
    label: issue.label,
    kind: issue.kind,
    status: supporting.length ? 'mapped' : 'unmapped',
    evidenceChunkIds: supporting.slice(0, 5).map((c) => c.evidenceChunkId),
    publicationIds: [...new Set(supporting.map((c) => c.publicationId))],
    source: supporting.length ? 'retrieval_chunk_text_match' : 'no_supporting_chunk',
  };
}

function detectContradictoryStatuses(chunks) {
  const statuses = new Set(chunks.map((c) => String(c.publicationStatus || 'unknown').toLowerCase()));
  const hasConsultation = [...statuses].some((s) => /consultation|proposal/.test(s));
  const hasBinding = [...statuses].some((s) => /binding|handbook|rule/.test(s));
  if (hasConsultation && hasBinding) return ['mixed_binding_and_consultation_in_bundle'];
  return [];
}

function retrievalStrength(retrieval) {
  const ranked = retrieval?.allRankedChunks || [];
  if (!ranked.length) return { ok: false, topSimilarity: 0 };
  const top = ranked[0]?.similarity ?? 0;
  return { ok: top >= 0.24, topSimilarity: top };
}

/**
 * @param {{
 *   question: string,
 *   bundle?: object,
 *   retrieval?: object,
 *   productionMode?: boolean,
 * }} input — productionMode default true when testId absent
 */
export function assessEvidenceQuestionCoverage(input) {
  const { question, bundle, retrieval, productionMode = true } = input;
  const materialIssues = extractMaterialIssuesFromQuestion(question);
  const chunks = bundle?.evidenceChunks || [];
  const reasons = [];

  const sourceAbsent = questionReferencesAbsentFromRetrieval(question, retrieval);
  if (sourceAbsent.absent) {
    return {
      mode: productionMode ? 'production' : 'eval',
      questionCoverage: 'UNKNOWN',
      completeness: 'NONE',
      materialIssues,
      mappings: materialIssues.map((m) => ({
        issueId: m.id,
        label: m.label,
        status: 'unmapped',
        source: 'source_absent_from_retrieval',
        evidenceChunkIds: [],
      })),
      reasons: [`source_absent:${sourceAbsent.reason}`],
      contradictoryEvidence: [],
      missingEvidence: materialIssues.map((m) => m.id),
      decisionTrace: materialIssues.map((m) => ({ issue: m.id, source: 'question_parser' })),
    };
  }

  if (!chunks.length) {
    return {
      mode: productionMode ? 'production' : 'eval',
      questionCoverage: 'UNKNOWN',
      completeness: 'NONE',
      materialIssues,
      mappings: [],
      reasons: ['no_evidence_chunks_assembled'],
      contradictoryEvidence: [],
      missingEvidence: materialIssues.map((m) => m.id),
      decisionTrace: [{ issue: 'bundle', source: 'empty_bundle' }],
    };
  }

  const strength = retrievalStrength(retrieval);
  if (!strength.ok) {
    reasons.push(`weak_retrieval_top_similarity:${strength.topSimilarity.toFixed(3)}`);
  }

  const mappings = materialIssues.map((issue) => issueMappingForChunk(issue, chunks, question));
  const mappedCount = mappings.filter((m) => m.status === 'mapped').length;
  const contradictoryEvidence = detectContradictoryStatuses(chunks);

  const coreMapped = mappings.find((m) => m.issueId === 'primary_question')?.status === 'mapped';
  if (!coreMapped) reasons.push('primary_question_not_grounded_in_chunks');

  const total = materialIssues.length;
  const completeness =
    mappedCount === 0 ? 'NONE' : mappedCount >= total && coreMapped && strength.ok ? 'FULL' : 'PARTIAL';

  let questionCoverage = 'UNKNOWN';
  if (
    mappedCount === total &&
    coreMapped &&
    strength.ok &&
    contradictoryEvidence.length === 0 &&
    completeness === 'FULL'
  ) {
    questionCoverage = 'KNOWN';
    reasons.push('all_question_derived_issues_mapped_strong_retrieval');
  } else if (mappedCount > 0) {
    reasons.push('partial_issue_mapping_or_weak_retrieval');
  } else {
    reasons.push('no_issue_mapping_from_retrieved_evidence');
  }

  return {
    mode: productionMode ? 'production' : 'eval',
    questionCoverage,
    completeness,
    materialIssues,
    mappings,
    reasons,
    contradictoryEvidence,
    missingEvidence: mappings.filter((m) => m.status === 'unmapped').map((m) => m.issueId),
    retrievalTopSimilarity: strength.topSimilarity,
    decisionTrace: [
      ...materialIssues.map((m) => ({ issue: m.id, source: 'extractMaterialIssuesFromQuestion' })),
      ...mappings.map((m) => ({ issue: m.issueId, mappingSource: m.source, status: m.status })),
    ],
  };
}

export function refineCoverageAfterVerification(coverage, verification, bundle) {
  if (!coverage || coverage.questionCoverage !== 'KNOWN') return coverage;
  if (!verification?.ok) {
    return {
      ...coverage,
      questionCoverage: 'UNKNOWN',
      reasons: [...(coverage.reasons || []), 'verification_failed_downgrade_coverage'],
    };
  }
  const chunkIds = new Set((bundle?.evidenceChunks || []).map((c) => c.evidenceChunkId));
  for (const claim of verification.verifiedClaims || []) {
    for (const cit of claim.citations || []) {
      if (cit.evidenceChunkId && !chunkIds.has(cit.evidenceChunkId)) {
        return {
          ...coverage,
          questionCoverage: 'UNKNOWN',
          reasons: [...(coverage.reasons || []), 'citation_outside_bundle_downgrade'],
        };
      }
    }
  }
  for (const claim of verification.verifiedClaims || []) {
    if (claim.classification === 'verified_fact' && !claim.citations?.length) {
      return {
        ...coverage,
        questionCoverage: 'UNKNOWN',
        reasons: [...(coverage.reasons || []), 'verified_claim_without_citation_downgrade'],
      };
    }
  }
  return coverage;
}
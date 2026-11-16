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
  const verbatim = String(chunk.verbatimText || '');

  if (issue.kind === 'binding_vs_guidance') {
    if (issue.id === 'binding_obligation') return /\bmust\b|\bshall\b|\brule\b/i.test(verbatim);
    if (issue.id === 'guidance_status') return /guidance|should/i.test(blob);
    return false;
  }
  if (issue.kind === 'temporal') {
    return /\b20\d{2}\b|effective|commence|force/i.test(verbatim);
  }
  if (issue.kind === 'applicability') {
    return /\bfirm\b|\bapply|\bapplies\b|scope/i.test(blob);
  }
  if (issue.kind === 'jurisdiction') {
    const qRegs = (question.match(/\b(CONC|COBS|PRIN|FCA|SYSC)\b/gi) || []).map((x) => x.toLowerCase());
    if (!qRegs.length) return false;
    return qRegs.some((r) => new RegExp(`\\b${r}\\b`, 'i').test(blob));
  }
  if (issue.kind === 'explicit_provision') {
    const ref = normaliseText(issue.label || '').replace(/\s+/g, ' ');
    const compactRef = ref.replace(/\s+/g, '');
    const section = normaliseText(chunk.sectionReference || '').replace(/\s+/g, '');
    const compactBlob = blob.replace(/\s+/g, '');
    return compactBlob.includes(compactRef) || section.includes(compactRef) || blob.includes(ref);
  }
  if (issue.kind === 'foreign_regime') {
    // Authorised offline corpus is FCA/UK — never treat incidental mentions as foreign-regime coverage.
    return false;
  }
  if (issue.kind === 'handbook_module') {
    const mod = (issue.label || '').split(/\s+/)[0];
    if (!mod) return false;
    if (!handbookAnchorInChunk(mod, chunk)) return false;
    const section = String(chunk.sectionReference || '').trim();
    const sectionOk = new RegExp(`^${mod}\\b`, 'i').test(section);
    const domainTokens = normaliseText(question)
      .split(/\s+/)
      .filter(
        (t) =>
          t.length > 5 &&
          !/^(expectations|borrower|persistent|under|what|when|does|apply|requirements|require|assessments)$/.test(t),
      );
    if (!sectionOk) {
      return domainTokens.filter((t) => t !== mod.toLowerCase()).some((t) => blob.includes(t));
    }
    return domainTokens.some((t) => blob.includes(t));
  }
  if (issue.kind === 'multi_document') {
    return false;
  }
  if (issue.kind === 'source_identification') {
    const ps = question.match(/\bPS\d+\/?\d*\b/i);
    if (!ps) return false;
    return blob.includes(normaliseText(ps[0]));
  }

  const qTokens = normaliseText(question)
    .split(/\s+/)
    .filter((t) => t.length > 4)
    .slice(0, 12);
  const hits = qTokens.filter((t) => blob.includes(t)).length;
  if (issue.kind === 'question_core') {
    return hits >= 2;
  }
  if (hits < 2) return false;
  return hits >= 2;
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

const STRICT_HANDBOOK_MODULES = new Set(['COBS', 'CONC', 'SYSC', 'CASS']);

function handbookAnchorInChunk(reg, chunk) {
  const module = String(reg || '').toUpperCase();
  const section = String(chunk.sectionReference || '').trim();
  if (new RegExp(`^${module}\\s*[\\d.]+`, 'i').test(section)) return true;

  const text = `${chunk.sectionReference || ''} ${chunk.verbatimText || ''} ${chunk.publicationReference || ''}`;
  const provisionMention = new RegExp(`\\b${module}\\s*[\\d.]+[A-Z]?R?`, 'i').test(text);
  if (!provisionMention) return false;

  if (STRICT_HANDBOOK_MODULES.has(module)) {
    const status = String(chunk.publicationStatus || '').toLowerCase();
    const pub = String(chunk.publicationReference || chunk.publicationTitle || '');
    const isHandbookCorpus =
      status === 'handbook' || status === 'fca_handbook' || new RegExp(`^${module}\\b`, 'i').test(pub.trim());
    return isHandbookCorpus;
  }
  return true;
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
  if (!ranked.length) return { ok: false, topSimilarity: 0, metric: 'none' };
  const topRow = ranked[0];
  const method = String(topRow?.method || retrieval?.retrievalMethod || '');
  const fusionTop = Number(topRow?.similarity ?? 0);
  const semanticTop = Number(topRow?.semanticSimilarity ?? fusionTop);
  // Hybrid RRF scores are rank-fusion weights (~0.03), not cosine similarity — use semanticSimilarity for gating.
  const useSemantic = method.includes('hybrid') || method === 'bm25' || semanticTop > fusionTop + 0.05;
  const topSimilarity = useSemantic ? semanticTop : fusionTop;
  return {
    ok: topSimilarity >= 0.24,
    topSimilarity,
    metric: useSemantic ? 'semantic_similarity' : 'fusion_similarity',
    fusionTopSimilarity: fusionTop,
  };
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
  const multiIssue = mappings.find((m) => m.issueId === 'multi_source');
  if (multiIssue) {
    const pubIds = [...new Set(chunks.map((c) => c.publicationId).filter(Boolean))];
    if (pubIds.length >= 2) {
      multiIssue.status = 'mapped';
      multiIssue.source = 'multiple_publications_in_bundle';
      multiIssue.publicationIds = pubIds.slice(0, 6);
      multiIssue.evidenceChunkIds = chunks.filter((c) => c.publicationId).slice(0, 5).map((c) => c.evidenceChunkId);
    } else {
      multiIssue.status = 'unmapped';
      multiIssue.source = 'multi_document_requires_two_publications';
      multiIssue.evidenceChunkIds = [];
      reasons.push('multi_document_issue_unmapped_insufficient_publications');
    }
  }
  const regsInQuestion = (question.match(/\b(CONC|COBS|SYSC|PRIN|CASS)\b/gi) || []).map((r) => r.toUpperCase());
  const jurisdictionMapping = mappings.find((m) => m.issueId === 'jurisdiction');
  if (jurisdictionMapping && regsInQuestion.length) {
    const anchored = regsInQuestion.every((reg) => chunks.some((c) => handbookAnchorInChunk(reg, c)));
    if (!anchored) {
      jurisdictionMapping.status = 'unmapped';
      jurisdictionMapping.source = 'handbook_provision_anchor_missing';
      jurisdictionMapping.evidenceChunkIds = [];
      reasons.push('jurisdiction_handbook_anchor_missing');
    }
  }

  let mappedCount = mappings.filter((m) => m.status === 'mapped').length;
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
    retrievalStrengthMetric: strength.metric,
    fusionTopSimilarity: strength.fusionTopSimilarity,
    decisionTrace: [
      ...materialIssues.map((m) => ({ issue: m.id, source: 'extractMaterialIssuesFromQuestion' })),
      ...mappings.map((m) => ({ issue: m.issueId, mappingSource: m.source, status: m.status })),
    ],
  };
}

export function requiredHandbookModulesUnmapped(coverage) {
  return (coverage?.mappings || []).some(
    (m) => String(m.issueId || '').startsWith('handbook_') && m.status === 'unmapped',
  );
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
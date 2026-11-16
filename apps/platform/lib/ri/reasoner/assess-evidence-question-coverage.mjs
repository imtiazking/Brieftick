/**
 * Deterministic evidence–question coverage (fail-closed). Does not set KNOWN from model output alone.
 */

function normaliseText(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ');
}

function themeSupportedInChunks(theme, chunks) {
  const tokens = normaliseText(theme)
    .split(/\s+/)
    .filter((t) => t.length > 3);
  if (!tokens.length) return false;
  for (const ch of chunks) {
    const blob = normaliseText(`${ch.verbatimText || ''} ${ch.sectionReference || ''} ${ch.publicationTitle || ''}`);
    const hits = tokens.filter((t) => blob.includes(t)).length;
    if (hits >= Math.min(2, tokens.length)) return true;
  }
  return false;
}

function extractMaterialIssues(caseRow, question) {
  const issues = [];
  for (const t of caseRow?.requiredAnswerThemes || []) {
    issues.push({ id: `theme:${t}`, label: t, kind: 'required_theme' });
  }
  if (caseRow?.expectedIntent) {
    issues.push({ id: `intent:${caseRow.expectedIntent}`, label: caseRow.expectedIntent, kind: 'expected_intent' });
  }
  if ((caseRow?.expectedPublicationIds || []).length) {
    issues.push({
      id: 'expected_publications',
      label: `Publications: ${caseRow.expectedPublicationIds.join(', ')}`,
      kind: 'publication_scope',
    });
  }
  if (!issues.length) {
    issues.push({ id: 'core_question', label: question.slice(0, 120), kind: 'question_text' });
  }
  return issues;
}

/**
 * @param {{
 *   question: string,
 *   caseRow?: object,
 *   bundle?: import('./evidence-assembler.mjs').EvidenceBundle,
 *   retrieval?: object,
 * }} input
 */
export function assessEvidenceQuestionCoverage(input) {
  const { question, caseRow = {}, bundle, retrieval } = input;
  const reasons = [];
  const chunks = bundle?.evidenceChunks || [];
  const materialIssues = extractMaterialIssues(caseRow, question);
  const mappings = [];

  if (caseRow.evidenceAvailability === 'NOT_IN_SUITE') {
    return {
      questionCoverage: 'UNKNOWN',
      completeness: 'NONE',
      materialIssues,
      mappings: materialIssues.map((m) => ({ ...m, status: 'source_not_in_corpus', evidenceChunkIds: [] })),
      reasons: ['evidence_availability_not_in_suite — required regulatory sources absent from authorised corpus'],
      contradictoryEvidence: [],
      missingEvidence: materialIssues.map((m) => m.id),
    };
  }

  if (!chunks.length) {
    return {
      questionCoverage: 'UNKNOWN',
      completeness: 'NONE',
      materialIssues,
      mappings: [],
      reasons: ['no_evidence_chunks_assembled'],
      contradictoryEvidence: [],
      missingEvidence: materialIssues.map((m) => m.id),
    };
  }

  const expectedPubs = caseRow.expectedPublicationIds || [];
  const represented = new Set(bundle.publicationsRepresented || []);
  const missingPubs = expectedPubs.filter((id) => !represented.has(id));
  if (missingPubs.length) {
    reasons.push(`expected_publication_not_in_bundle:${missingPubs.join(',')}`);
  }

  let supportedCount = 0;
  for (const issue of materialIssues) {
    if (issue.kind === 'publication_scope') {
      const ok = missingPubs.length === 0;
      mappings.push({
        issueId: issue.id,
        label: issue.label,
        status: ok ? 'mapped' : 'unmapped',
        evidenceChunkIds: ok ? chunks.filter((c) => expectedPubs.includes(c.publicationId)).map((c) => c.evidenceChunkId) : [],
      });
      if (ok) supportedCount += 1;
      continue;
    }
    if (issue.kind === 'required_theme') {
      const supported = themeSupportedInChunks(issue.label, chunks);
      mappings.push({
        issueId: issue.id,
        label: issue.label,
        status: supported ? 'mapped' : 'unmapped',
        evidenceChunkIds: supported ? chunks.slice(0, 3).map((c) => c.evidenceChunkId) : [],
      });
      if (supported) supportedCount += 1;
      continue;
    }
    const supported = chunks.length > 0 && (retrieval?.publicationSelected || rankedAboveThreshold(retrieval));
    mappings.push({
      issueId: issue.id,
      label: issue.label,
      status: supported ? 'mapped' : 'unmapped',
      evidenceChunkIds: supported ? [chunks[0].evidenceChunkId] : [],
    });
    if (supported) supportedCount += 1;
  }

  const total = materialIssues.length || 1;
  const completeness =
    supportedCount === 0 ? 'NONE' : supportedCount >= total && missingPubs.length === 0 ? 'FULL' : 'PARTIAL';

  const contradictoryEvidence = detectContradictoryStatuses(chunks);

  let questionCoverage = 'UNKNOWN';
  if (supportedCount === total && missingPubs.length === 0 && contradictoryEvidence.length === 0) {
    questionCoverage = 'KNOWN';
    reasons.push('all_material_issues_mapped_with_expected_sources');
  } else if (supportedCount > 0) {
    reasons.push('partial_issue_mapping_or_missing_expected_publications');
  } else {
    reasons.push('no_material_issue_mapping');
  }

  const missingEvidence = mappings.filter((m) => m.status === 'unmapped').map((m) => m.issueId);

  return {
    questionCoverage,
    completeness,
    materialIssues,
    mappings,
    reasons,
    contradictoryEvidence,
    missingEvidence,
    expectedPublicationsMissing: missingPubs,
  };
}

function rankedAboveThreshold(retrieval) {
  const ranked = retrieval?.allRankedChunks || [];
  if (!ranked.length) return false;
  return (ranked[0]?.similarity ?? 0) >= 0.2;
}

function detectContradictoryStatuses(chunks) {
  const statuses = new Set(chunks.map((c) => String(c.publicationStatus || 'unknown').toLowerCase()));
  const hasConsultation = [...statuses].some((s) => /consultation|proposal/.test(s));
  const hasBinding = [...statuses].some((s) => /binding|handbook|rule/.test(s));
  if (hasConsultation && hasBinding) return ['mixed_binding_and_consultation_in_bundle'];
  return [];
}

/**
 * Post-verification: may downgrade KNOWN→UNKNOWN only; never upgrade from model output.
 */
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
  return coverage;
}
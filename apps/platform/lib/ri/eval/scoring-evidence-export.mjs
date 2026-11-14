/**
 * Offline scoring-evidence export — local full rows + commit-safe metadata hashes.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { scoreEvalCase } from './score-eval-case.mjs';
import { buildEvalResumeFingerprint } from './eval-report-sanitize.mjs';

const FORBIDDEN_EVIDENCE_KEYS = new Set([
  'apiKey',
  'x-api-key',
  'authorization',
  'ANTHROPIC_API_KEY',
  'messages',
  'system',
  'user',
  'prompt',
  'rawText',
]);

function sha256Text(text) {
  return createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}

function slimCitation(c) {
  if (!c || typeof c !== 'object') return c;
  return {
    publicationId: c.publicationId ?? null,
    evidenceChunkId: c.evidenceChunkId ?? null,
    extractionRevisionId: c.extractionRevisionId ?? null,
    physicalPageNumber: c.physicalPageNumber ?? null,
    sectionReference: c.sectionReference ?? null,
    publicationTitle: c.publicationTitle ? String(c.publicationTitle).slice(0, 120) : null,
    excerptSha256: c.excerpt ? sha256Text(c.excerpt) : null,
  };
}

/**
 * @param {object} caseRow
 * @param {object} scored - output of scoreEvalCase (merged into report row)
 * @param {object} engineResult
 * @param {object} runConfig
 */
export function buildScoringEvidenceRecord(caseRow, scored, engineResult, runConfig = {}) {
  const answer = String(engineResult?.answer || '');
  const citations = Array.isArray(engineResult?.citations) ? engineResult.citations.map(slimCitation) : [];
  const engineSnapshot = {
    status: engineResult?.status ?? scored?.engineStatus ?? null,
    answer,
    citations,
    execution: engineResult?.execution ?? {},
    sufficiency: engineResult?.sufficiency ?? scored?.v2Diagnostics?.sufficiency ?? null,
    interpretedAs: engineResult?.interpretedAs ?? null,
    v2ExecutionStatus: engineResult?.v2ExecutionStatus ?? scored?.v2ExecutionStatus ?? null,
    preReasonerBlock: engineResult?.preReasonerBlock ?? null,
    humanReviewRequired: engineResult?.humanReviewRequired ?? null,
  };

  const record = {
    schemaVersion: 'forgeniq.eval.scoring-evidence.v1',
    capturedAt: new Date().toISOString(),
    testId: caseRow.testId,
    questionCategory: caseRow.questionCategory ?? null,
    expected: {
      idealResponseState: scored?.idealResponseState ?? null,
      idealScoringClassification: scored?.idealScoringClassification ?? null,
      expectedPublicationIds: caseRow.expectedPublicationIds ?? [],
    },
    actual: {
      outcome: scored?.outcome ?? null,
      engineStatus: scored?.engineStatus ?? null,
      harnessOutcome: scored?.harnessOutcome ?? null,
      dimensions: scored?.dimensions ?? {},
      criticalFailures: scored?.criticalFailures ?? [],
      scoringNotes: scored?.notes ?? [],
      citationCount: citations.length,
    },
    engineSnapshot,
    scoringRubricVersion: scored?.scoringRubricVersion ?? null,
    runConfig: {
      dryRun: Boolean(runConfig.dryRun),
      model: runConfig.model ?? null,
      resumeFingerprint: runConfig.resumeFingerprint ?? null,
    },
    integrity: {
      answerSha256: sha256Text(answer),
      engineSnapshotSha256: sha256Text(JSON.stringify(engineSnapshot)),
      actualScoringSha256: sha256Text(
        JSON.stringify({
          outcome: scored?.outcome,
          dimensions: scored?.dimensions,
          criticalFailures: scored?.criticalFailures,
        }),
      ),
    },
  };

  for (const k of Object.keys(record)) {
    if (FORBIDDEN_EVIDENCE_KEYS.has(k)) delete record[k];
  }
  return record;
}

/** Commit-safe metadata (no full answer text). */
export function buildScoringEvidenceMetadata(record) {
  return {
    schemaVersion: record.schemaVersion,
    testId: record.testId,
    questionCategory: record.questionCategory,
    expected: record.expected,
    actual: {
      outcome: record.actual.outcome,
      engineStatus: record.actual.engineStatus,
      harnessOutcome: record.actual.harnessOutcome,
      dimensionKeys: Object.keys(record.actual.dimensions || {}),
      criticalFailureCount: (record.actual.criticalFailures || []).length,
      citationCount: record.actual.citationCount,
      sufficiencyClassification:
        record.engineSnapshot?.sufficiency?.classification ||
        record.engineSnapshot?.sufficiency?.overall ||
        null,
    },
    integrity: record.integrity,
    scoringRubricVersion: record.scoringRubricVersion,
    runConfig: {
      dryRun: record.runConfig?.dryRun,
      model: record.runConfig?.model,
      resumeFingerprintSha256: record.runConfig?.resumeFingerprint
        ? sha256Text(JSON.stringify(record.runConfig.resumeFingerprint))
        : null,
    },
  };
}

export function reconstructScoringFromEvidence(record, caseRow) {
  const snap = record.engineSnapshot || {};
  const engineResult = {
    status: snap.status,
    answer: snap.answer,
    citations: (snap.citations || []).map((c) => ({
      ...c,
      excerpt: c.excerptSha256 ? `[hash:${c.excerptSha256.slice(0, 12)}]` : undefined,
    })),
    execution: snap.execution || {},
    interpretedAs: snap.interpretedAs,
    v2ExecutionStatus: snap.v2ExecutionStatus,
    preReasonerBlock: snap.preReasonerBlock,
    humanReviewRequired: snap.humanReviewRequired,
    sufficiency: snap.sufficiency,
  };
  const rescored = scoreEvalCase(caseRow, engineResult, {
    simulateCatalogueAttach: false,
    evidenceAvailable: true,
  });
  return rescored;
}

export function verifyScoringEvidenceIntegrity(record) {
  const issues = [];
  const answer = record?.engineSnapshot?.answer ?? '';
  if (sha256Text(answer) !== record?.integrity?.answerSha256) {
    issues.push('answer_sha256_mismatch');
  }
  const citations = record?.engineSnapshot?.citations || [];
  if (record.actual?.citationCount > 0 && citations.length === 0) {
    issues.push('citation_count_without_payload');
  }
  for (const c of citations) {
    if (!c.publicationId && !c.evidenceChunkId) {
      issues.push('citation_missing_identifiers');
      break;
    }
  }
  return { ok: issues.length === 0, issues };
}

export function compareSufficiencyToExpectation(caseRow, record) {
  const ideal = caseRow?.expectedIdealResult || {};
  const expectedState = ideal.responseState || ideal.outcomeClassification || null;
  const actualStatus = record?.engineSnapshot?.status || record?.actual?.engineStatus || null;
  const sufficiency =
    record?.engineSnapshot?.sufficiency?.classification ||
    record?.engineSnapshot?.sufficiency?.overall ||
    null;
  return {
    expectedResponseState: expectedState,
    actualEngineStatus: actualStatus,
    sufficiencyClassification: sufficiency,
    matchesIdealState: expectedState ? String(actualStatus) === String(expectedState) : null,
    smeReviewRequired: caseRow?.reviewStatus === 'AWAITING_SME_REVIEW' || ideal.requiresEvidenceGroundedAnswer === true,
  };
}

export function compareScoringRecords(originalScored, rescored) {
  const mismatches = [];
  if (originalScored.outcome !== rescored.outcome) {
    mismatches.push({ field: 'outcome', original: originalScored.outcome, reconstructed: rescored.outcome });
  }
  const od = originalScored.dimensions || {};
  const rd = rescored.dimensions || {};
  for (const k of new Set([...Object.keys(od), ...Object.keys(rd)])) {
    if (JSON.stringify(od[k]) !== JSON.stringify(rd[k])) {
      mismatches.push({ field: `dimensions.${k}`, original: od[k], reconstructed: rd[k] });
    }
  }
  const oc = [...(originalScored.criticalFailures || [])].sort().join(',');
  const rc = [...(rescored.criticalFailures || [])].sort().join(',');
  if (oc !== rc) mismatches.push({ field: 'criticalFailures', original: oc, reconstructed: rc });
  return { match: mismatches.length === 0, mismatches };
}

export function writeScoringEvidenceLocalBundle(localPath, records) {
  mkdirSync(dirname(localPath), { recursive: true });
  const bundle = {
    schemaVersion: 'forgeniq.eval.scoring-evidence-bundle.v1',
    capturedAt: new Date().toISOString(),
    recordCount: records.length,
    records,
  };
  writeFileSync(localPath, JSON.stringify(bundle, null, 2));
  return bundle;
}

export function writeScoringEvidenceMetadataManifest(commitPath, records) {
  mkdirSync(dirname(commitPath), { recursive: true });
  const manifest = {
    schemaVersion: 'forgeniq.eval.scoring-evidence-manifest.v1',
    capturedAt: new Date().toISOString(),
    programmePass: false,
    localFullTextRequired: true,
    localPathNote: 'Full answer text lives in gitignored local bundle only',
    records: records.map(buildScoringEvidenceMetadata),
    integrityManifestSha256: sha256Text(
      JSON.stringify(records.map((r) => r.integrity)),
    ),
  };
  writeFileSync(commitPath, JSON.stringify(manifest, null, 2));
  return manifest;
}

export function loadScoringEvidenceBundle(localPath) {
  if (!existsSync(localPath)) return null;
  return JSON.parse(readFileSync(localPath, 'utf8'));
}

export function buildRunConfigFingerprint(options) {
  return buildEvalResumeFingerprint({
    suitePath: options.suitePath,
    model: options.model,
    testIds: options.testIds,
    dryRun: options.dryRun,
    publicProviderOnly: options.publicProviderOnly,
    providerDeps: options.providerDeps,
    budgetUsd: options.budgetUsd,
  });
}
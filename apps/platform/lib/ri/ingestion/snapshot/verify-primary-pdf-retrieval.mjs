import { createHash } from 'node:crypto';
import { CP26_38_STAGING } from './cp26-38-staging-identity.mjs';
import {
  EXTRACTION_PROFILE_HTML_ARTICLE_V2,
  EXTRACTION_PROFILE_PDF_PRIMARY_V1,
} from './extraction-revision-types.mjs';
import {
  assertArtifactSemanticsConsistent,
  resolveExtractionRevisionArtifactSemantics,
} from './extraction-revision-artifact-semantics.mjs';
import { buildPdfEvidenceBlocks } from '../../../../../../integrations/regulatory-sources/core/pdf-evidence-blocks.mjs';
import { analyzeRegulatoryPdfDocument } from '../../../../../../integrations/regulatory-sources/core/regulatory-pdf-analysis.mjs';
import {
  buildEvidenceGroundedRegulatoryFindings,
  validateFindingsEvidenceAnchors,
} from './primary-pdf-ai-findings.mjs';
import { assessObligationGradePosture } from './obligation-grade-policy.mjs';
import { validatePdfSignature } from '../../../../../../integrations/regulatory-sources/core/regulatory-pdf-retrieval.mjs';
import {
  answerAskRiFromPublicationPdfEvidence,
  buildPublicationPdfEvidenceIndex,
  STEP80_ASK_RI_SAMPLE_QUESTION,
} from '../../ask-ri/publication-pdf-evidence.mjs';
import { enrichPublicationPdfEvidenceForMatching } from '../../ask-ri/publication-pdf-question-match.mjs';
import { assertTraceSqlColumnsMatchStagingSchema } from './extraction-revision-trace-schema.mjs';
import {
  missingMandatoryFieldError,
  STEP80_VERIFICATION_STAGES,
} from './verify-step-80-diagnostics.mjs';

/** Read-only trace query for pdf_primary_v1 (snapshots use source_fingerprint, not source_hash). */
export const PDF_REVISION_TRACE_SQL = `
  select
    r.id as revision_id,
    r.extraction_profile,
    r.source_snapshot_id,
    r.publication_id,
    r.publication_version_id,
    r.raw_content_sha256,
    r.derived_content_fingerprint,
    r.normalised_html_sha256,
    r.normalised_text_sha256,
    r.normalised_html_storage_path,
    r.normalised_text_storage_path,
    r.derived_metadata_storage_path,
    r.extraction_quality,
    r.publication_metadata,
    r.pdf_attachments,
    r.provenance,
    s.source_fingerprint,
    s.raw_content_sha256 as snapshot_raw_content_sha256,
    v.source_hash as version_source_hash,
    p.source_hash as publication_source_hash,
    p.id as publication_id_join_check,
    p.title as publication_title,
    p.canonical_url as publication_canonical_url,
    p.external_document_id as publication_external_document_id,
    reg.acronym as regulator_acronym,
    reg.name as regulator_name,
    rs.external_key as regulatory_source_external_key,
    rs.ingestion_mode as regulatory_source_ingestion_mode
  from regulatory_source_extraction_revisions r
  join regulatory_source_snapshots s on s.id = r.source_snapshot_id
  join regulatory_publication_versions v on v.id = r.publication_version_id
  join regulatory_publications p on p.id = r.publication_id
  join regulatory_sources rs on rs.id = p.source_id
  join regulators reg on reg.id = p.regulator_id
  where r.source_snapshot_id = $1 and r.extraction_profile = $2
`;

export const SNAPSHOT_HTML_EVIDENCE_SQL = `
  select
    s.id,
    s.raw_content_sha256,
    s.source_fingerprint,
    v.source_hash as version_source_hash,
    p.source_hash as publication_source_hash,
    p.id as publication_id
  from regulatory_source_snapshots s
  join regulatory_publication_versions v on v.id = s.publication_version_id
  join regulatory_publications p on p.id = s.publication_id
  where s.id = $1
`;

/**
 * @param {string} sql
 */
export function assertPdfRevisionTraceSqlSchema(sql) {
  const columnAudit = assertTraceSqlColumnsMatchStagingSchema(sql);
  if (!columnAudit.pass) return columnAudit;
  if (!/join\s+regulatory_sources\s+rs\s+on\s+rs\.id\s*=\s*p\.source_id/i.test(sql)) {
    return { pass: false, reason: 'missing_join_regulatory_sources_via_p_source_id' };
  }
  if (!/join\s+regulators\s+reg\s+on\s+reg\.id\s*=\s*p\.regulator_id/i.test(sql)) {
    return { pass: false, reason: 'missing_join_regulators_via_p_regulator_id' };
  }
  if (/s\.source_hash\b/i.test(sql)) {
    return { pass: false, reason: 'use_s_source_fingerprint' };
  }
  return { pass: true, columnRefCount: columnAudit.columnRefCount };
}

function sha256Buffer(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

export async function loadPdfPrimaryRevision(client, snapshotId) {
  const res = await client.query(PDF_REVISION_TRACE_SQL, [snapshotId, EXTRACTION_PROFILE_PDF_PRIMARY_V1]);
  return res.rows[0] || null;
}

export async function loadSnapshotHtmlEvidenceContext(client, snapshotId) {
  const res = await client.query(SNAPSHOT_HTML_EVIDENCE_SQL, [snapshotId]);
  return res.rows[0] || null;
}

/**
 * HTML snapshot + publication fingerprint invariants (distinct from PDF raw SHA).
 * @param {object} row
 */
export function verifySnapshotHtmlEvidenceIdentity(row) {
  const issues = [];
  if (!row) {
    return { pass: false, issues: ['snapshot_missing'] };
  }
  if (row.id !== CP26_38_STAGING.snapshotId) issues.push('snapshot_id_mismatch');
  if (row.publication_id !== CP26_38_STAGING.publicationId) issues.push('publication_id_mismatch');
  if (row.raw_content_sha256 !== CP26_38_STAGING.rawContentSha256) {
    issues.push('html_snapshot_raw_sha_mismatch');
  }
  if (row.source_fingerprint !== CP26_38_STAGING.sourceFingerprintV1) {
    issues.push('snapshot_source_fingerprint_mismatch');
  }
  if (row.version_source_hash !== CP26_38_STAGING.sourceFingerprintV1) {
    issues.push('version_source_hash_mismatch');
  }
  if (row.publication_source_hash !== CP26_38_STAGING.sourceFingerprintV1) {
    issues.push('publication_source_hash_mismatch');
  }
  if (row.source_fingerprint !== row.version_source_hash) {
    issues.push('snapshot_fingerprint_version_hash_drift');
  }
  return { pass: issues.length === 0, issues };
}

/**
 * @param {object} pdfRow
 * @param {object} snapshotRow
 */
export function verifyPdfRevisionEvidenceIdentities(pdfRow, snapshotRow) {
  const issues = [];
  if (!pdfRow) return { pass: false, issues: ['pdf_revision_missing'] };
  if (pdfRow.revision_id && pdfRow.revision_id !== CP26_38_STAGING.pdfExtractionRevisionId) {
    issues.push('pdf_revision_id_unexpected');
  }
  if (pdfRow.raw_content_sha256 !== CP26_38_STAGING.primaryPdfRawContentSha256) {
    issues.push('pdf_raw_content_sha_mismatch');
  }
  if (pdfRow.raw_content_sha256 === snapshotRow?.raw_content_sha256) {
    issues.push('pdf_raw_sha_must_not_equal_html_snapshot_raw_sha');
  }
  if (pdfRow.raw_content_sha256 === snapshotRow?.source_fingerprint) {
    issues.push('pdf_raw_sha_must_not_equal_html_source_fingerprint');
  }
  if (!pdfRow.derived_content_fingerprint || pdfRow.derived_content_fingerprint.length < 32) {
    issues.push('pdf_derived_content_fingerprint_missing');
  }
  if (pdfRow.derived_content_fingerprint === pdfRow.raw_content_sha256) {
    issues.push('pdf_derived_fingerprint_must_differ_from_pdf_raw_sha');
  }
  if (!pdfRow.normalised_html_sha256 || !pdfRow.normalised_text_sha256) {
    issues.push('pdf_derived_artifact_hashes_missing');
  }
  const metaPathSha = extractContentAddressedSha256FromPath(pdfRow.derived_metadata_storage_path);
  if (!metaPathSha) issues.push('pdf_metadata_path_not_content_addressed');
  return { pass: issues.length === 0, issues };
}

export async function loadHtmlRevisionUnchanged(client, snapshotId, expectedRevisionId) {
  const res = await client.query(
    `select id, raw_content_sha256, derived_content_fingerprint, extraction_quality, extraction_profile
     from regulatory_source_extraction_revisions
     where id = $1 and source_snapshot_id = $2 and extraction_profile = $3`,
    [expectedRevisionId, snapshotId, EXTRACTION_PROFILE_HTML_ARTICLE_V2],
  );
  const row = res.rows[0];
  if (!row) return { pass: false, reason: 'html_revision_missing' };
  if (row.raw_content_sha256 !== CP26_38_STAGING.rawContentSha256) {
    return { pass: false, reason: 'html_revision_raw_sha_changed' };
  }
  if (row.extraction_quality?.obligationGradeSuitable === true) {
    return { pass: false, reason: 'html_revision_obligation_grade_must_remain_false' };
  }
  return { pass: true, row };
}

export function verifyPdfArtifactSemantics(pdfRow, snapshotRow) {
  const semantics = assertArtifactSemanticsConsistent({
    ...pdfRow,
    snapshot_raw_content_sha256:
      snapshotRow?.snapshot_raw_content_sha256 ?? snapshotRow?.raw_content_sha256,
  });
  const role = resolveExtractionRevisionArtifactSemantics(EXTRACTION_PROFILE_PDF_PRIMARY_V1);
  const pathOk = /\.pdf\.structured\.json$/i.test(pdfRow.normalised_html_storage_path || '');
  return {
    pass: semantics.ok && pathOk && role.normalisedHtmlMediaType === 'application/json',
    semantics,
    pathOk,
  };
}

function assertStoragePath(value, fieldName, stage) {
  if (value == null || String(value).trim() === '') {
    throw missingMandatoryFieldError(fieldName, stage);
  }
  return String(value).trim();
}

/**
 * @param {object} pdfRow
 * @param {(path: string) => Promise<Buffer>} downloadObject
 */
export async function verifyPdfStorageArtifacts(pdfRow, downloadObject) {
  const results = {
    pass: false,
    stages: {},
    pdf: {},
    structured: {},
    text: {},
    metadata: {},
  };

  const metaPath = assertStoragePath(
    pdfRow.derived_metadata_storage_path,
    'derived_metadata_storage_path',
    STEP80_VERIFICATION_STAGES.STORAGE_METADATA_DOWNLOAD,
  );
  let metaBuf;
  try {
    metaBuf = await downloadObject(metaPath);
    results.stages[STEP80_VERIFICATION_STAGES.STORAGE_METADATA_DOWNLOAD] = 'PASS';
  } catch (e) {
    e.verificationStage = STEP80_VERIFICATION_STAGES.STORAGE_METADATA_DOWNLOAD;
    throw e;
  }

  let metaParsed;
  try {
    metaParsed = JSON.parse(metaBuf.toString('utf8'));
    results.stages[STEP80_VERIFICATION_STAGES.STORAGE_METADATA_PARSE] = 'PASS';
  } catch (e) {
    const err = new Error(`storage_metadata_json_invalid:${e.message}`);
    err.verificationStage = STEP80_VERIFICATION_STAGES.STORAGE_METADATA_PARSE;
    throw err;
  }

  const pdfPath = metaParsed.primaryPdf?.storagePath || metaParsed.derivedArtifacts?.primaryPdf?.storagePath;
  if (!pdfPath) {
    const err = missingMandatoryFieldError('metadata.primaryPdf.storagePath', STEP80_VERIFICATION_STAGES.STORAGE_METADATA_PARSE);
    throw err;
  }

  const structuredPath = assertStoragePath(
    pdfRow.normalised_html_storage_path,
    'normalised_html_storage_path',
    STEP80_VERIFICATION_STAGES.STORAGE_STRUCTURED_DOWNLOAD,
  );
  const textPath = assertStoragePath(
    pdfRow.normalised_text_storage_path,
    'normalised_text_storage_path',
    STEP80_VERIFICATION_STAGES.STORAGE_TEXT_DOWNLOAD,
  );

  let pdfBuf;
  try {
    pdfBuf = await downloadObject(pdfPath);
    results.stages[STEP80_VERIFICATION_STAGES.STORAGE_PDF_DOWNLOAD] = 'PASS';
  } catch (e) {
    e.verificationStage = STEP80_VERIFICATION_STAGES.STORAGE_PDF_DOWNLOAD;
    throw e;
  }
  const sig = validatePdfSignature(pdfBuf);
  results.pdf = {
    pass: sig.ok && sha256Buffer(pdfBuf) === pdfRow.raw_content_sha256,
    computedSha256: sha256Buffer(pdfBuf),
    expectedSha256: pdfRow.raw_content_sha256,
    byteLength: pdfBuf.length,
  };
  results.stages[STEP80_VERIFICATION_STAGES.PDF_SHA256] = results.pdf.pass ? 'PASS' : 'FAIL';

  let structuredBuf;
  try {
    structuredBuf = await downloadObject(structuredPath);
    results.stages[STEP80_VERIFICATION_STAGES.STORAGE_STRUCTURED_DOWNLOAD] = 'PASS';
  } catch (e) {
    e.verificationStage = STEP80_VERIFICATION_STAGES.STORAGE_STRUCTURED_DOWNLOAD;
    throw e;
  }
  results.structured = {
    pass: sha256Buffer(structuredBuf) === pdfRow.normalised_html_sha256,
    computedSha256: sha256Buffer(structuredBuf),
  };
  results.stages[STEP80_VERIFICATION_STAGES.STRUCTURED_JSON_INTEGRITY] = results.structured.pass
    ? 'PASS'
    : 'FAIL';

  let structured;
  try {
    structured = JSON.parse(structuredBuf.toString('utf8'));
  } catch (e) {
    const err = new Error(`structured_pdf_json_invalid:${e.message}`);
    err.verificationStage = STEP80_VERIFICATION_STAGES.STRUCTURED_JSON_INTEGRITY;
    throw err;
  }

  let textBuf;
  try {
    textBuf = await downloadObject(textPath);
    results.stages[STEP80_VERIFICATION_STAGES.STORAGE_TEXT_DOWNLOAD] = 'PASS';
  } catch (e) {
    e.verificationStage = STEP80_VERIFICATION_STAGES.STORAGE_TEXT_DOWNLOAD;
    throw e;
  }
  results.text = {
    pass: sha256Buffer(textBuf) === pdfRow.normalised_text_sha256,
    computedSha256: sha256Buffer(textBuf),
  };

  const metaSha = sha256Buffer(metaBuf);
  const metaPathSha = extractContentAddressedSha256FromPath(pdfRow.derived_metadata_storage_path);
  results.metadata = { pass: metaSha === metaPathSha, computedSha256: metaSha, pathSha: metaPathSha };
  results.stages[STEP80_VERIFICATION_STAGES.METADATA_HASH] = results.metadata.pass ? 'PASS' : 'FAIL';
  results.stages[STEP80_VERIFICATION_STAGES.EXTRACTED_TEXT_INTEGRITY] = results.text.pass ? 'PASS' : 'FAIL';

  const expectedPages = CP26_38_STAGING.primaryPdfPhysicalPageCount;
  const pageCountOk =
    structured.pageCount === expectedPages &&
    Array.isArray(structured.pages) &&
    structured.pages.length === expectedPages;
  results.physicalPages = {
    pass: pageCountOk && structured.pageBoundaryConfirmed === true,
    pageCount: structured.pageCount,
    pagesArrayLength: structured.pages?.length ?? 0,
    expectedPageCount: expectedPages,
  };
  results.stages[STEP80_VERIFICATION_STAGES.PHYSICAL_PAGES] = results.physicalPages.pass ? 'PASS' : 'FAIL';

  const revisionId = pdfRow.revision_id || pdfRow.id;
  const evidenceBlocks = buildPdfEvidenceBlocks(
    {
      publicationId: pdfRow.publication_id,
      extractionRevisionId: revisionId,
      sourcePdfSha256: pdfRow.raw_content_sha256,
      extractionProfile: EXTRACTION_PROFILE_PDF_PRIMARY_V1,
    },
    structured,
  );

  results.stages[STEP80_VERIFICATION_STAGES.EVIDENCE_BLOCKS] =
    evidenceBlocks.length > 0 ? 'PASS' : 'FAIL';

  const analysis = analyzeRegulatoryPdfDocument({
    structured,
    publicationMetadata: pdfRow.publication_metadata,
    canonicalUrl: CP26_38_STAGING.canonicalUrl,
  });
  results.stages[STEP80_VERIFICATION_STAGES.REGULATORY_ANALYSIS] =
    analysis.consultationPreserved === true ? 'PASS' : 'FAIL';

  const findings = buildEvidenceGroundedRegulatoryFindings({
    publicationId: pdfRow.publication_id,
    extractionRevisionId: revisionId,
    analysis,
    evidenceBlocks,
    structured,
  });
  const anchors = findings.ok ? validateFindingsEvidenceAnchors(findings.findings) : { ok: false };
  results.stages[STEP80_VERIFICATION_STAGES.FINDINGS_ANCHORS] = anchors.ok ? 'PASS' : 'FAIL';

  const obligation = assessObligationGradePosture(
    { obligationGradeSuitable: false, webpageExtraction: { status: 'complete', confidence: 'high' } },
    pdfRow.extraction_quality,
    {
      evidenceBlocksCount: evidenceBlocks.length,
      findingsWithAnchors: anchors.accepted?.length || 0,
      insufficientEvidence: !findings.ok,
      consultationPreserved: analysis.consultationPreserved,
      bindingObligationsDetected: analysis.regulatoryStatus?.bindingObligationsDetected,
      humanReviewStatus: 'pending_review',
    },
  );

  results.stages[STEP80_VERIFICATION_STAGES.OBLIGATION_GRADE] =
    obligation.obligationGradeSuitable === false ? 'PASS' : 'FAIL';

  const pubEvidence = enrichPublicationPdfEvidenceForMatching(
    buildPublicationPdfEvidenceIndex(
      {
        revision_id: revisionId,
        id: revisionId,
        publication_id: pdfRow.publication_id,
        extraction_profile: pdfRow.extraction_profile,
        raw_content_sha256: pdfRow.raw_content_sha256,
        publication_metadata: pdfRow.publication_metadata,
        canonical_url: pdfRow.publication_canonical_url || CP26_38_STAGING.canonicalUrl,
      },
      structured,
      evidenceBlocks,
    ),
    {
      publicationTitle: pdfRow.publication_title,
      canonicalUrl: pdfRow.publication_canonical_url,
      publicationExternalId: pdfRow.publication_external_document_id,
      regulatorShortName: pdfRow.regulator_acronym,
      regulatorLabel: pdfRow.regulator_name,
      integrityVerified: true,
      _verifiedPipeline: true,
      obligationGradeSuitable: pdfRow.extraction_quality?.obligationGradeSuitable === true,
    },
  );

  const askSample = answerAskRiFromPublicationPdfEvidence(pubEvidence, STEP80_ASK_RI_SAMPLE_QUESTION);
  const askRiPass =
    askSample.status === 'ANSWERED' || askSample.status === 'INSUFFICIENT_EVIDENCE';
  results.stages[STEP80_VERIFICATION_STAGES.ASK_RI_SAMPLE] = askRiPass ? 'PASS' : 'FAIL';

  const storageIntegrityPass =
    results.pdf.pass &&
    results.structured.pass &&
    results.text.pass &&
    results.metadata.pass;

  const pdfIntelligencePass =
    results.physicalPages.pass &&
    evidenceBlocks.length > 0 &&
    analysis.consultationPreserved === true &&
    anchors.ok &&
    obligation.obligationGradeSuitable === false;

  results.reporting = {
    pdfStorageIntegrity: {
      pass: storageIntegrityPass,
      pdf: results.pdf.pass,
      structured: results.structured.pass,
      text: results.text.pass,
      metadata: results.metadata.pass,
    },
    pdfIntelligence: {
      pass: pdfIntelligencePass,
      physicalPages: results.physicalPages.pass,
      evidenceBlocks: evidenceBlocks.length > 0,
      regulatoryAnalysis: analysis.consultationPreserved === true,
      findingsAnchors: anchors.ok,
      obligationGrade: obligation.obligationGradeSuitable === false,
    },
    askRi: {
      pass: askRiPass,
      sampleQuestion: STEP80_ASK_RI_SAMPLE_QUESTION,
      status: askSample.status,
      citationCount: askSample.citations?.length || 0,
      matchScore: askSample.audit?.matchScore,
      publicationReference: pubEvidence.publicationReference,
    },
  };

  results.pass = storageIntegrityPass && pdfIntelligencePass && askRiPass;

  return {
    ...results,
    pageCount: structured.pageCount,
    evidenceBlockCount: evidenceBlocks.length,
    analysis,
    findings,
    anchors,
    obligationGrade: obligation,
    askRiSample: {
      pass: askRiPass,
      status: askSample.status,
      citationCount: askSample.citations?.length || 0,
      matchScore: askSample.audit?.matchScore,
      mustNotPresentAsBindingObligation: askSample.audit?.mustNotPresentAsBindingObligation,
    },
  };
}

function extractContentAddressedSha256FromPath(storagePath) {
  const m = /\/([a-f0-9]{64})\.[^/]+$/i.exec(String(storagePath || '').trim());
  return m?.[1]?.toLowerCase() || null;
}

export function aggregateStep80Overall(checks) {
  const mandatory = [
    checks.stagingProject,
    checks.publication,
    checks.snapshot,
    checks.snapshotHtmlEvidence,
    checks.htmlRevisionUnchanged,
    checks.pdfRevisionPresent,
    checks.pdfEvidenceIdentities,
    checks.pdfSemantics,
    checks.pdfStorage,
    checks.pdfIntelligence,
    checks.askRiSample,
    checks.databaseCountsUnchanged,
    checks.fcaIngestionDisabled,
  ];
  if (checks.securityVerification === 'BLOCKED' || checks.securityVerification === 'FAIL') {
    return { pass: false, overall: checks.securityVerification === 'BLOCKED' ? 'BLOCKED' : 'FAIL' };
  }
  if (checks.securityVerification !== 'PASS') {
    mandatory.push(false);
  }
  const pass =
    mandatory.every((c) => c === true) && checks.securityVerification === 'PASS';
  return { pass, overall: pass ? 'PASS' : 'FAIL' };
}

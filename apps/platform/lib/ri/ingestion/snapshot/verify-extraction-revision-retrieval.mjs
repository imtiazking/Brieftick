import { createHash } from 'node:crypto';
import { CP26_38_STAGING } from './cp26-38-staging-identity.mjs';
import { EXTRACTION_PROFILE_HTML_ARTICLE_V2 } from './extraction-revision-types.mjs';
import { assertTraceSqlColumnsMatchStagingSchema } from './extraction-revision-trace-schema.mjs';

const SNAPSHOT_BUCKET = 'regulatory-source-snapshots';

export function sha256Buffer(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

export function sha256Utf8(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Content-addressed storage path embeds full sha256 before extension.
 *
 * @param {string} storagePath
 */
export function extractContentAddressedSha256FromStoragePath(storagePath) {
  const m = /\/([a-f0-9]{64})\.[^/]+$/i.exec(String(storagePath || '').trim());
  return m?.[1]?.toLowerCase() || null;
}

/** Read-only trace query — publications link to sources via `source_id` (not `regulatory_source_id`). */
export const REVISION_TRACE_SQL = `
  select
    r.id as revision_id,
    r.extraction_profile,
    r.publication_id,
    r.publication_version_id,
    r.source_snapshot_id,
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
    r.created_at,
    r.created_by,
    s.source_fingerprint,
    s.canonical_url,
    s.raw_storage_path,
    s.raw_content_sha256 as snapshot_raw_content_sha256,
    s.normalised_html_storage_path as snapshot_v1_normalised_html_storage_path,
    s.metadata_storage_path as snapshot_metadata_storage_path,
    v.version_number,
    v.source_hash as version_source_hash,
    p.title as publication_title,
    p.external_document_id,
    p.source_version,
    rs.external_key as regulatory_source_external_key,
    rs.ingestion_mode as regulatory_source_ingestion_mode
  from regulatory_source_extraction_revisions r
  join regulatory_source_snapshots s on s.id = r.source_snapshot_id
  join regulatory_publication_versions v on v.id = r.publication_version_id
  join regulatory_publications p on p.id = r.publication_id
  join regulatory_sources rs on rs.id = p.source_id
  where r.id = $1
`;

/**
 * Guard against schema drift in the trace SQL (offline regression).
 *
 * @param {string} sql
 */
export function assertRevisionTraceSqlSchema(sql) {
  const columnAudit = assertTraceSqlColumnsMatchStagingSchema(sql);
  if (!columnAudit.pass) {
    return columnAudit;
  }
  if (!/join\s+regulatory_sources\s+rs\s+on\s+rs\.id\s*=\s*p\.source_id/i.test(sql)) {
    return { pass: false, reason: 'missing_join_regulatory_sources_via_p_source_id' };
  }
  const requiredJoins = [
    'regulatory_source_extraction_revisions r',
    'regulatory_source_snapshots s',
    'regulatory_publication_versions v',
    'regulatory_publications p',
    'regulatory_sources rs',
  ];
  for (const fragment of requiredJoins) {
    if (!sql.includes(fragment)) {
      return { pass: false, reason: `missing_relation:${fragment}` };
    }
  }
  if (!/s\.raw_storage_path/.test(sql)) {
    return { pass: false, reason: 'missing_snapshot_raw_storage_path' };
  }
  return { pass: true, columnRefCount: columnAudit.columnRefCount };
}

/**
 * @param {import('pg').Client} client
 * @param {string} revisionId
 */
export async function loadExtractionRevisionTrace(client, revisionId) {
  const res = await client.query(REVISION_TRACE_SQL, [revisionId]);
  return res.rows[0] || null;
}

/**
 * @param {object} row
 * @param {{ revisionId?: string, publicationId?: string, snapshotId?: string, profile?: string }} [expected]
 */
export function verifyRevisionIdentity(row, expected = {}) {
  const issues = [];
  if (!row) {
    return { pass: false, issues: ['revision_not_found'] };
  }
  const revisionId = expected.revisionId || CP26_38_STAGING.extractionRevisionId;
  if (row.revision_id !== revisionId) issues.push('revision_id_mismatch');
  if (expected.profile && row.extraction_profile !== expected.profile) {
    issues.push('extraction_profile_mismatch');
  }
  if (row.extraction_profile !== EXTRACTION_PROFILE_HTML_ARTICLE_V2) {
    issues.push('unexpected_extraction_profile');
  }
  if (expected.publicationId && row.publication_id !== expected.publicationId) {
    issues.push('publication_id_mismatch');
  }
  if (expected.snapshotId && row.source_snapshot_id !== expected.snapshotId) {
    issues.push('source_snapshot_id_mismatch');
  }
  if (row.raw_content_sha256 !== CP26_38_STAGING.rawContentSha256) {
    issues.push('raw_content_sha256_mismatch');
  }
  if (row.version_source_hash !== CP26_38_STAGING.sourceFingerprintV1) {
    issues.push('source_fingerprint_mismatch');
  }
  if (row.source_fingerprint && row.source_fingerprint !== row.version_source_hash) {
    issues.push('snapshot_fingerprint_version_hash_drift');
  }
  if (
    row.snapshot_raw_content_sha256 &&
    row.snapshot_raw_content_sha256 !== row.raw_content_sha256
  ) {
    issues.push('revision_snapshot_raw_sha_mismatch');
  }
  if (!row.raw_storage_path?.trim()) {
    issues.push('missing_snapshot_raw_storage_path');
  }
  if (String(row.source_version) !== '1' || row.version_number !== 1) {
    issues.push('source_version_mismatch');
  }
  if (!row.normalised_html_storage_path || !row.normalised_text_storage_path) {
    issues.push('missing_storage_paths');
  }
  if (!row.derived_metadata_storage_path) {
    issues.push('missing_metadata_storage_path');
  }
  return { pass: issues.length === 0, issues };
}

/**
 * @param {object} row
 */
export function validateEvidenceTraceability(row) {
  const gaps = [];
  if (!row) {
    return { complete: false, gaps: ['revision_missing'], chain: null };
  }
  const chain = {
    extractionRevisionId: row.revision_id,
    sourceSnapshotId: row.source_snapshot_id,
    publicationVersionId: row.publication_version_id,
    publicationId: row.publication_id,
    regulatorySourceExternalKey: row.regulatory_source_external_key,
    canonicalUrl: row.canonical_url || row.publication_metadata?.canonicalUrl,
    externalDocumentId: row.external_document_id,
    originalRawStoragePath: row.raw_storage_path,
    snapshotV1NormalisedHtmlPath: row.snapshot_v1_normalised_html_storage_path,
    v2DerivedHtmlPath: row.normalised_html_storage_path,
    v2DerivedTextPath: row.normalised_text_storage_path,
    v2DerivedMetadataPath: row.derived_metadata_storage_path,
  };
  if (!chain.originalRawStoragePath) {
    gaps.push('missing_original_raw_storage_path');
  }
  if (!chain.v2DerivedHtmlPath || !chain.v2DerivedTextPath || !chain.v2DerivedMetadataPath) {
    gaps.push('missing_v2_derived_storage_paths');
  }
  if (
    chain.v2DerivedHtmlPath &&
    chain.snapshotV1NormalisedHtmlPath &&
    chain.v2DerivedHtmlPath === chain.snapshotV1NormalisedHtmlPath
  ) {
    gaps.push('v2_html_path_must_differ_from_snapshot_v1_path');
  }
  if (chain.regulatorySourceExternalKey !== 'SRC-FCA-PUBLICATIONS-RSS') {
    gaps.push('expected_fca_publications_rss_source_missing');
  }
  if (row.regulatory_source_ingestion_mode !== 'DISABLED') {
    gaps.push('fca_ingestion_not_disabled');
  }
  if (!chain.canonicalUrl?.includes('fca.org.uk')) {
    gaps.push('canonical_url_missing_or_not_fca');
  }
  if (row.source_snapshot_id !== CP26_38_STAGING.snapshotId) {
    gaps.push('snapshot_not_cp26_38');
  }
  if (row.provenance?.createsRegulatoryPublicationVersion === true) {
    gaps.push('provenance_claims_version_creation');
  }
  return { complete: gaps.length === 0, gaps, chain };
}

/**
 * @param {object} revisionRow
 * @param {{ html: Buffer, text: Buffer, metadata: Buffer }} artifacts
 */
export function verifyArtifactSha256(revisionRow, artifacts) {
  const results = {
    html: { pass: false, expected: revisionRow.normalised_html_sha256, computed: null },
    text: { pass: false, expected: revisionRow.normalised_text_sha256, computed: null },
    metadata: {
      pass: false,
      expectedFromStoragePath: null,
      expectedPinned:
        revisionRow.revision_id === CP26_38_STAGING.extractionRevisionId
          ? CP26_38_STAGING.extractionRevisionMetadataSha256 || null
          : null,
      computed: null,
      derivedContentFingerprint: null,
      fingerprintMatch: false,
    },
  };
  if (!artifacts.html?.length) {
    return { pass: false, mandatoryPass: false, reason: 'missing_html_artifact', results };
  }
  if (!artifacts.text?.length) {
    return { pass: false, mandatoryPass: false, reason: 'missing_text_artifact', results };
  }
  if (!artifacts.metadata?.length) {
    return { pass: false, mandatoryPass: false, reason: 'missing_metadata_artifact', results };
  }
  results.html.computed = sha256Buffer(artifacts.html);
  results.text.computed = sha256Buffer(artifacts.text);
  results.html.pass = results.html.computed === results.html.expected;
  results.text.pass = results.text.computed === results.text.expected;

  results.metadata.computed = sha256Buffer(artifacts.metadata);
  results.metadata.expectedFromStoragePath = extractContentAddressedSha256FromStoragePath(
    revisionRow.derived_metadata_storage_path,
  );
  results.metadata.pathHashMatch =
    results.metadata.expectedFromStoragePath &&
    results.metadata.computed === results.metadata.expectedFromStoragePath;
  results.metadata.pinnedHashMatch =
    !results.metadata.expectedPinned ||
    results.metadata.computed === results.metadata.expectedPinned;
  results.metadata.pass =
    results.metadata.pathHashMatch === true &&
    results.metadata.pinnedHashMatch === true;

  let metaParsed;
  try {
    metaParsed = JSON.parse(artifacts.metadata.toString('utf8'));
  } catch {
    return { pass: false, mandatoryPass: false, reason: 'metadata_json_invalid', results };
  }
  results.metadata.parsed = true;
  results.metadata.derivedContentFingerprint = metaParsed.derivedContentFingerprint;
  results.metadata.fingerprintMatch =
    metaParsed.derivedContentFingerprint === revisionRow.derived_content_fingerprint;

  const mandatoryPass =
    results.html.pass &&
    results.text.pass &&
    results.metadata.pass &&
    results.metadata.fingerprintMatch === true;

  return {
    pass: mandatoryPass,
    mandatoryPass,
    results,
    metaParsed,
  };
}

/**
 * @param {object} row
 * @param {object} metaParsed
 */
export function assessStructuredRegulatoryContent(row, metaParsed) {
  const quality = row.extraction_quality || metaParsed?.extractionQuality || {};
  const pubMeta = row.publication_metadata || metaParsed?.publicationMetadata || {};
  const title = pubMeta.title || row.publication_title || '';
  const mandatory = {
    publicationIdentification:
      /CP26\/38/i.test(title) ||
      /cp26-38/i.test(row.external_document_id || '') ||
      /cp26-38/i.test(row.canonical_url || '') ||
      /cp26-38/i.test(pubMeta.drupalAbout || ''),
    relevantDates: Boolean(
      pubMeta.consultationTimeline?.opensDate ||
        pubMeta.consultationTimeline?.closesDate ||
        pubMeta.consultationTimeline?.present,
    ),
    extractedStatementsPresent: quality.webpageExtraction?.status === 'complete',
    sourceReferences: Boolean(row.canonical_url || pubMeta.canonicalUrl || CP26_38_STAGING.canonicalUrl),
    evidenceCompleteness: Boolean(row.provenance?.kind || metaParsed?.provenance?.kind),
    extractionQualityRecorded: typeof quality === 'object' && Object.keys(quality).length > 0,
  };
  const optional = {
    regulatoryClassification: Boolean(
      pubMeta.publicationTypeLabel ||
        pubMeta.primaryDocumentClassification ||
        pubMeta.documentType ||
        pubMeta.publicationType,
    ),
    primaryPdfCompleteness: quality.primaryDocument?.completeness || 'unknown',
    webpageExtractionStatus: quality.webpageExtraction?.status || 'unknown',
  };
  const mandatoryPass = Object.values(mandatory).every(Boolean);
  const warnings = [];
  if (!optional.regulatoryClassification) {
    warnings.push('optional_regulatory_classification_label_missing');
  }
  if (optional.primaryPdfCompleteness === 'not_captured') {
    warnings.push('primary_pdf_not_captured_obligation_grade_unsuitable');
  }
  const status = mandatoryPass ? (warnings.length ? 'PARTIAL' : 'PASS') : 'FAIL';
  return {
    pass: mandatoryPass,
    status,
    mandatory,
    optional,
    warnings,
    publicationMetadata: pubMeta,
    extractionQuality: quality,
    pdfAttachments: row.pdf_attachments || metaParsed?.pdfAttachments || [],
  };
}

/**
 * @param {{ mandatoryPass?: boolean, pass?: boolean }} storageSha
 * @param {boolean} originalRawPass
 */
export function aggregateSha256Verification(storageSha, originalRawPass) {
  const derivedPass = storageSha?.mandatoryPass === true;
  return {
    pass: derivedPass && originalRawPass === true,
    derivedArtifacts: derivedPass,
    originalRawArtifact: originalRawPass === true,
  };
}

/**
 * @param {object} reportSlice
 */
export function aggregateStep79Overall(reportSlice) {
  const securityOk = reportSlice.securityVerification === 'PASS';
  const securityBlocked = reportSlice.securityVerification === 'BLOCKED';
  const structuredOk =
    reportSlice.structuredContentStatus === 'PASS' ||
    reportSlice.structuredContentStatus === 'PARTIAL';
  const structuredMandatoryOk = reportSlice.structuredContentMandatoryPass === true;

  const pass =
    reportSlice.revisionRetrieval === 'PASS' &&
    reportSlice.storageReconstruction === 'PASS' &&
    reportSlice.sha256Verification === 'PASS' &&
    reportSlice.evidenceTraceability === 'PASS' &&
    structuredMandatoryOk &&
    structuredOk &&
    reportSlice.duplicateFreeRetrieval === true &&
    reportSlice.countsUnchanged === true &&
    securityOk &&
    !securityBlocked;

  const overall = pass
    ? reportSlice.structuredContentStatus === 'PARTIAL'
      ? 'PASS_WITH_WARNINGS'
      : 'PASS'
    : securityBlocked
      ? 'BLOCKED'
      : 'FAIL';

  return { pass, overall };
}

/**
 * @param {object} revisionRow
 * @param {(path: string) => Promise<Buffer>} downloadObject
 */
/**
 * Original ingest-time raw HTML (snapshot path), distinct from V2 derived artefacts on revision row.
 *
 * @param {object} revisionRow
 * @param {(path: string) => Promise<Buffer>} downloadObject
 */
export async function verifyOriginalSourceRawArtifact(revisionRow, downloadObject) {
  const path = revisionRow.raw_storage_path?.trim();
  if (!path) {
    return { pass: false, reason: 'missing_raw_storage_path' };
  }
  let body;
  try {
    body = await downloadObject(path);
  } catch (e) {
    return { pass: false, reason: 'raw_download_failed', message: e.message?.slice(0, 120) };
  }
  const computed = sha256Buffer(body);
  const expected = revisionRow.raw_content_sha256 || revisionRow.snapshot_raw_content_sha256;
  return {
    pass: computed === expected,
    storagePath: path,
    byteLength: body.length,
    expectedSha256: expected,
    computedSha256: computed,
  };
}

export async function reconstructAndVerifyArtifacts(revisionRow, downloadObject) {
  const paths = {
    html: revisionRow.normalised_html_storage_path,
    text: revisionRow.normalised_text_storage_path,
    metadata: revisionRow.derived_metadata_storage_path,
  };
  const artifacts = {};
  for (const [key, objectPath] of Object.entries(paths)) {
    if (!objectPath) {
      return { pass: false, reason: `missing_path_${key}` };
    }
    try {
      artifacts[key] = await downloadObject(objectPath);
    } catch (e) {
      return { pass: false, reason: `download_failed_${key}`, message: e.message?.slice(0, 120) };
    }
  }
  const sha = verifyArtifactSha256(revisionRow, artifacts);
  return {
    pass: sha.mandatoryPass === true,
    sha256: sha,
    storagePaths: paths,
    artifactBytes: {
      html: artifacts.html.length,
      text: artifacts.text.length,
      metadata: artifacts.metadata.length,
    },
  };
}

/**
 * @param {string} apiUrl
 * @param {string} anonKey
 * @param {string} jwt
 * @param {string} revisionId
 */
export async function postgrestSelectRevisionById(apiUrl, anonKey, jwt, revisionId) {
  const res = await fetch(
    `${apiUrl.replace(/\/$/, '')}/rest/v1/regulatory_source_extraction_revisions?select=id&id=eq.${revisionId}`,
    {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/json',
      },
    },
  );
  if (!res.ok) {
    return { ok: false, status: res.status, rows: [] };
  }
  const rows = await res.json();
  return { ok: true, status: res.status, rows: Array.isArray(rows) ? rows : [] };
}

/**
 * Duplicate-free retrieval: two loads must return the same revision id and fingerprint.
 *
 * @param {import('pg').Client} client
 * @param {string} revisionId
 */
export async function verifyDuplicateFreeRetrieval(client, revisionId) {
  const a = await loadExtractionRevisionTrace(client, revisionId);
  const b = await loadExtractionRevisionTrace(client, revisionId);
  const pass =
    a &&
    b &&
    a.revision_id === b.revision_id &&
    a.derived_content_fingerprint === b.derived_content_fingerprint;
  return { pass, firstId: a?.revision_id, secondId: b?.revision_id };
}

/**
 * @param {{
 *   operatorJwt?: string,
 *   tenantJwt?: string,
 *   apiUrl?: string,
 *   anonKey?: string,
 *   revisionId: string,
 * }} params
 */
export async function verifyExtractionRevisionSecurityAccess(params) {
  const { operatorJwt, tenantJwt, apiUrl, anonKey, revisionId } = params;
  const report = { pass: false, operator: null, tenant: null };
  if (!apiUrl || !anonKey || !operatorJwt || !tenantJwt) {
    report.skipped = 'missing_postgrest_jwt_credentials';
    return report;
  }
  report.operator = await postgrestSelectRevisionById(apiUrl, anonKey, operatorJwt, revisionId);
  report.tenant = await postgrestSelectRevisionById(apiUrl, anonKey, tenantJwt, revisionId);
  const operatorOk = report.operator.ok && report.operator.rows.length === 1;
  const tenantOk = report.tenant.ok && report.tenant.rows.length === 0;
  report.pass = operatorOk && tenantOk;
  return report;
}

export { SNAPSHOT_BUCKET };

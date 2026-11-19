/**
 * Sanitised diagnostics for Step 80 live verification (no secrets).
 */

export const STEP80_VERIFICATION_STAGES = {
  REGULATORY_COUNTS: 'regulatory_counts',
  PUBLICATION_LOOKUP: 'publication_lookup',
  SNAPSHOT_HTML_EVIDENCE: 'snapshot_html_evidence',
  HTML_REVISION_UNCHANGED: 'html_revision_unchanged',
  PDF_REVISION_LOAD: 'pdf_revision_load',
  PDF_EVIDENCE_IDENTITIES: 'pdf_evidence_identities',
  PDF_ARTIFACT_SEMANTICS: 'pdf_artifact_semantics',
  STORAGE_METADATA_DOWNLOAD: 'storage_metadata_download',
  STORAGE_METADATA_PARSE: 'storage_metadata_parse',
  STORAGE_PDF_DOWNLOAD: 'storage_pdf_download',
  STORAGE_STRUCTURED_DOWNLOAD: 'storage_structured_download',
  STORAGE_TEXT_DOWNLOAD: 'storage_text_download',
  PDF_SHA256: 'pdf_sha256',
  STRUCTURED_JSON_INTEGRITY: 'structured_json_integrity',
  EXTRACTED_TEXT_INTEGRITY: 'extracted_text_integrity',
  METADATA_HASH: 'metadata_hash',
  PHYSICAL_PAGES: 'physical_pages',
  EVIDENCE_BLOCKS: 'evidence_blocks',
  REGULATORY_ANALYSIS: 'regulatory_analysis',
  FINDINGS_ANCHORS: 'findings_anchors',
  OBLIGATION_GRADE: 'obligation_grade',
  ASK_RI_SAMPLE: 'ask_ri_sample',
  FCA_INGESTION_MODE: 'fca_ingestion_mode',
  DATABASE_COUNTS_UNCHANGED: 'database_counts_unchanged',
  SECURITY_VERIFICATION: 'security_verification',
  AGGREGATE: 'aggregate',
};

const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  /postgres(ql)?:\/\/[^\s'"]+/gi,
  /service_role[^\s'"]*/gi,
];

/**
 * @param {string} [stack]
 */
export function sanitizeStackTrace(stack) {
  if (!stack) return null;
  let s = String(stack);
  for (const re of SECRET_PATTERNS) {
    s = s.replace(re, '[redacted]');
  }
  const lines = s.split('\n').slice(0, 8);
  return lines.join('\n');
}

/**
 * @param {Error} err
 * @param {string} [stage]
 * @param {{ missingField?: string }} [extra]
 */
export function formatVerificationFailure(err, stage, extra = {}) {
  const stack = sanitizeStackTrace(err?.stack);
  let moduleFile = null;
  let lineNumber = null;
  let functionName = null;
  if (stack) {
    const frame = stack
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.startsWith('at ') && !l.includes('node:internal'));
    if (frame) {
      const m = /^at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/.exec(frame.replace(/^at /, 'at '));
      if (m) {
        functionName = m[1] || null;
        moduleFile = m[2] || null;
        lineNumber = m[3] ? Number(m[3]) : null;
      }
    }
  }
  return {
    message: err?.message || String(err),
    type: err?.name || 'Error',
    code: err?.code || undefined,
    stage: stage || err?.verificationStage || undefined,
    missingField: extra.missingField || err?.missingField || undefined,
    moduleFile,
    functionName,
    lineNumber,
    stack,
  };
}

/**
 * @param {string} fieldName
 * @param {string} stage
 */
export function missingMandatoryFieldError(fieldName, stage) {
  const err = new Error(`step80_missing_mandatory_field:${fieldName}`);
  err.code = 'step80_missing_mandatory_field';
  err.missingField = fieldName;
  err.verificationStage = stage;
  return err;
}

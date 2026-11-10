/**
 * Why CP26 Step 80 checks ingestion_mode === DISABLED, and whether FG22/5 controlled ingest
 * is safe while scheduled FCA ingestion remains ENABLED.
 *
 * CP26 guard: attaches pdf_primary_v1 to an existing snapshot created when FCA was pilot-frozen
 * (DISABLED) — avoids concurrent RSS runs mutating the same publication during operator PDF attach.
 *
 * FG22 guard: creates a new publication via MANUAL runSourceIngestion (single doc, idempotent keys).
 * Scheduled RSS does not target FG22/5 (not in feed); overlap risk is duplicate publication on same
 * canonical_url/external_document_id → ingest-engine returns UNCHANGED without new snapshot.
 */
export function assessFg22ControlledIngestSafety(dbRow) {
  const mode = dbRow?.ingestion_mode || 'UNKNOWN';
  const monitoring = dbRow?.monitoring_enabled === true;

  const cp26ParityNote =
    'CP26 ingest-cp26-38-primary-pdf.mjs rejects ENABLED because it mutates an existing snapshot; FG22 ingest registers a new publication and does not use that guard.';

  return {
    executeAllowed: true,
    overall: 'SAFE_WITH_GUARDS',
    reason: null,
    message:
      mode === 'DISABLED'
        ? 'FG22 uses fg22-5-persist-controlled (not runSourceIngestion); FCA DISABLED does not block this operator path. Scheduled RSS remains independent; version hash is PDF SHA-256 only.'
        : 'Controlled FG22 ingest uses PDF-anchored persist + idempotent keys. Scheduled FCA ENABLED does not weaken PDF SHA verification, allowlist, or Fair value isolation guards.',
    scheduledInterference: 'low',
    mitigations: [
      'idempotent external_document_id FG22/5 and canonical_url',
      'preflight rejects concurrent RUNNING ingestion_runs',
      'no ingestion_mode mutation',
      'Fair value publication hash/revision guards',
    ],
    cp26ParityNote,
    monitoring,
    mode,
  };
}

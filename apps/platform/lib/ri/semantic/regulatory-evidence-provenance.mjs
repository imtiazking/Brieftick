/**
 * Authoritative regulatory evidence provenance (fail-closed for indexing / export).
 */

export const EVIDENCE_PROVENANCE_CLASS = {
  AUTHORITATIVE_STAGING_EXTRACTION: 'AUTHORITATIVE_STAGING_EXTRACTION',
  AUTHORITATIVE_OFFLINE_EXPORT: 'AUTHORITATIVE_OFFLINE_EXPORT',
  NON_AUTHORITATIVE_METADATA_ONLY: 'NON_AUTHORITATIVE_METADATA_ONLY',
  SYNTHETIC_FIXTURE: 'SYNTHETIC_FIXTURE',
  SYNTHETIC_CATALOGUE_ABSTRACT: 'SYNTHETIC_CATALOGUE_ABSTRACT',
  UNVERIFIED: 'UNVERIFIED',
};

const FIXTURE_MARKERS = [
  'PS24/1 sets out final rules for operational resilience',
  'CP24/2 consults on changes to consumer credit rules',
  'Review of fair treatment in private markets',
  'Defence SMEs need fair access to banking services across the UK market',
  'Flood risk exposure of residential mortgages in England has increased in coastal areas',
  'included to introduce realistic publication competition',
];

const BLOCKED_EXPORT_SOURCES = new Set([
  'metadata_plus_public_fixture_excerpt',
  'synthetic_fixture',
  'staging_catalogue_readonly_fixture',
]);

const BLOCKED_EVIDENCE_DEPTH = new Set(['metadata_plus_public_fixture_excerpt']);

/**
 * Classify an evidence pack for indexing eligibility.
 * @param {object} pack
 */
export function classifyEvidencePackProvenance(pack) {
  if (!pack || typeof pack !== 'object') {
    return { class: EVIDENCE_PROVENANCE_CLASS.UNVERIFIED, reasons: ['missing_pack'] };
  }

  const depth = pack.retrievalProvenance?.evidenceDepth || pack.exportSource;
  if (BLOCKED_EVIDENCE_DEPTH.has(depth)) {
    return { class: EVIDENCE_PROVENANCE_CLASS.SYNTHETIC_FIXTURE, reasons: ['fixture_export_depth'] };
  }
  if (pack.provenanceClassification === EVIDENCE_PROVENANCE_CLASS.NON_AUTHORITATIVE_METADATA_ONLY) {
    return {
      class: EVIDENCE_PROVENANCE_CLASS.NON_AUTHORITATIVE_METADATA_ONLY,
      reasons: ['metadata_only_manifest'],
    };
  }

  const samples = pack.verifiedTextSamples || [];
  for (const s of samples) {
    const text = String(s.extractedText || '');
    for (const marker of FIXTURE_MARKERS) {
      if (text.includes(marker)) {
        return { class: EVIDENCE_PROVENANCE_CLASS.SYNTHETIC_FIXTURE, reasons: [`fixture_marker:${marker.slice(0, 40)}`] };
      }
    }
    if (/included to introduce realistic publication competition/i.test(text)) {
      return { class: EVIDENCE_PROVENANCE_CLASS.SYNTHETIC_CATALOGUE_ABSTRACT, reasons: ['catalogue_abstract'] };
    }
  }

  const exportSource = pack.retrievalProvenance?.exportSource || pack.exportSource;
  if (BLOCKED_EXPORT_SOURCES.has(exportSource)) {
    return { class: EVIDENCE_PROVENANCE_CLASS.SYNTHETIC_FIXTURE, reasons: ['blocked_export_source'] };
  }

  if (
    pack.extractionRevisionId &&
    (exportSource === 'staging_readonly' || exportSource === 'b1_staging_readonly_export' || pack.packVersion)
  ) {
    return {
      class: EVIDENCE_PROVENANCE_CLASS.AUTHORITATIVE_STAGING_EXTRACTION,
      reasons: ['extraction_revision_present'],
    };
  }

  if (pack.extractionRevisionId && pack.askRiEvidence) {
    return { class: EVIDENCE_PROVENANCE_CLASS.AUTHORITATIVE_OFFLINE_EXPORT, reasons: ['frozen_pack_shape'] };
  }

  return { class: EVIDENCE_PROVENANCE_CLASS.UNVERIFIED, reasons: ['missing_extraction_revision_or_export_provenance'] };
}

export function assertAuthoritativeForSemanticIndex(pack) {
  const { class: provenanceClass, reasons } = classifyEvidencePackProvenance(pack);
  if (
    provenanceClass === EVIDENCE_PROVENANCE_CLASS.AUTHORITATIVE_STAGING_EXTRACTION ||
    provenanceClass === EVIDENCE_PROVENANCE_CLASS.AUTHORITATIVE_OFFLINE_EXPORT
  ) {
    return { ok: true, provenanceClass, reasons };
  }
  return {
    ok: false,
    code: 'authoritative_provenance_required',
    provenanceClass,
    reasons,
    publicationId: pack?.publicationId ?? null,
  };
}

export function filterAuthoritativeEvidencePacks(packs) {
  const accepted = [];
  const rejected = [];
  for (const row of packs) {
    const pack = row.pack || row;
    const gate = assertAuthoritativeForSemanticIndex(pack);
    if (gate.ok) accepted.push(row);
    else rejected.push({ file: row.file, ...gate });
  }
  return { accepted, rejected };
}

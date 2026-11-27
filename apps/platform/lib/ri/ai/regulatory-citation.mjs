/**
 * Normalised regulatory citation shape for Ask RI and lifecycle stages (RI-CITE-002).
 * Distinguishes public regulatory evidence from internal record ids.
 */

const INTERNAL_ID = /^(OBL|IMP|RISK|CTRL|REG)-\d+$/i;

/**
 * @param {Record<string, unknown>|null|undefined} raw
 * @param {{ evidencePack?: Record<string, unknown>|null, publication?: Record<string, unknown>|null }} [ctx]
 */
export function normalizeRegulatoryCitation(raw, ctx = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const pack = ctx.evidencePack && typeof ctx.evidencePack === 'object' ? ctx.evidencePack : null;
  const pub = ctx.publication && typeof ctx.publication === 'object' ? ctx.publication : null;
  const text =
    str(raw.text) || str(raw.claim) || str(raw.summary) || (Array.isArray(raw.sourceSectionIds) && pack ? null : null);
  const sourceSectionIds = Array.isArray(raw.sourceSectionIds)
    ? raw.sourceSectionIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  const onlyInternal = sourceSectionIds.length > 0 && sourceSectionIds.every((id) => INTERNAL_ID.test(id));
  const sourceQuotation = str(raw.sourceQuotation) || (onlyInternal && pack?.quotation?.text ? pack.quotation.text : null);
  const provisionReference = str(raw.provisionReference) || str(pack?.provision?.reference);
  const citation = str(raw.citation) || str(raw.citationLocation) || (pack?.quotation?.page ? `PDF p.${pack.quotation.page}` : null);
  const effectiveDate = str(raw.effectiveDate) || str(pack?.effective?.date);
  const regulator = str(raw.regulator) || str(pub?.regulator) || str(pub?.regulatorKey);
  const publicationTitle = str(raw.publicationTitle) || str(pub?.title);
  const publicationReference = str(raw.publicationReference) || str(pub?.externalDocumentId) || str(pub?.reference);
  const sourceUrl = str(raw.sourceUrl) || str(pub?.canonicalUrl) || str(pub?.officialSourceUrl);
  const evidenceProvenance =
    str(raw.evidenceProvenance) ||
    (pack?.quotation?.verified ? 'regulatory_verified' : sourceQuotation ? 'regulatory_partial' : 'internal_only');
  const linkedRecordId = str(raw.linkedRecordId) || str(pack?.obligationId);
  const linkedRecordType = str(raw.linkedRecordType) || (linkedRecordId ? 'obligation' : null);

  if (!text && !sourceQuotation && !provisionReference && !citation) return null;

  return {
    text,
    sourceSectionIds,
    citation,
    sourceQuotation,
    provisionReference,
    effectiveDate,
    regulator,
    publicationTitle,
    publicationReference,
    instrumentReference: str(raw.instrumentReference) || str(pack?.source?.legalBasis),
    pdfPage: num(raw.pdfPage) ?? (Number.isInteger(pack?.quotation?.page) ? pack.quotation.page : null),
    sourceUrl,
    evidenceProvenance,
    linkedRecordId,
    linkedRecordType,
    isFabricated: Boolean(raw._fabricated),
  };
}

/**
 * @param {unknown[]} citations
 * @param {{ evidencePack?: Record<string, unknown>|null, publication?: Record<string, unknown>|null }} ctx
 */
export function normalizeRegulatoryCitations(citations, ctx = {}) {
  return (Array.isArray(citations) ? citations : [])
    .map((c) => normalizeRegulatoryCitation(c, ctx))
    .filter(Boolean);
}

function str(v) {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
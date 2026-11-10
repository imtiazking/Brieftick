import { createHash } from 'node:crypto';
import { inferPublicationReferenceFromEvidence } from '../ask-ri/publication-pdf-question-match.mjs';

function primaryPublicationReference(pack, chunk) {
  const inferred = inferPublicationReferenceFromEvidence({
    publicationTitle: chunk.publicationTitle || pack?.publicationTitle,
    canonicalUrl: chunk.canonicalUrl || pack?.canonicalUrl,
    publicationReference: pack?.publicationReference,
  });
  if (inferred && /\b(CP|PS|FG|DP|TR)/i.test(inferred)) return inferred;
  const ext = pack?.askRiEvidence?.publicationMetadata?.externalDocumentId;
  if (ext && /\b(CP|PS|FG|DP|TR)/i.test(String(ext))) {
    const m = String(ext).match(/\b(CP|PS|FG|DP|TR)\s*(\d{1,3})\s*\/\s*(\d{1,2})\b/i);
    if (m) return `${m[1].toUpperCase()}${m[2]}/${m[3]}`;
  }
  return null;
}

/**
 * Map indexed chunk + pack row to EvidenceChunkV2 (application-owned metadata).
 */
export function mapChunkToEvidenceV2(chunk, packRow, retrievalScores = {}) {
  const pack = packRow?.pack || packRow || {};
  const text = String(chunk.chunkText || '');
  const evidenceChunkId = chunk.chunkId || createHash('sha256').update(text).digest('hex').slice(0, 16);
  const verbatimTextSha256 = createHash('sha256').update(text).digest('hex');

  return {
    evidenceChunkId,
    publicationId: chunk.publicationId,
    publicationReference: primaryPublicationReference(pack, chunk),
    publicationTitle: chunk.publicationTitle || pack.publicationTitle,
    regulatorId: chunk.regulator === 'FCA' ? 'REG-FCA' : chunk.regulator || 'REG-FCA',
    publicationType: pack.publicationType || pack.profile || chunk.extractionProfile,
    regulatoryStatus: chunk.publicationStatus || pack.regulatoryStatus || pack.publicationType,
    publicationDate: pack.publicationDate || pack.askRiEvidence?.publicationMetadata?.publicationDate || null,
    effectiveDate: pack.effectiveDate || null,
    consultationCloses: pack.consultationCloses || null,
    reportingPeriodLabel: pack.reportingPeriodLabel || null,
    extractionRevisionId: chunk.extractionRevisionId,
    extractionProfile: chunk.extractionProfile,
    physicalPageNumber: chunk.physicalPageNumber ?? null,
    sectionReference: chunk.sectionReference ?? null,
    canonicalUrl: chunk.canonicalUrl || pack.canonicalUrl,
    contentSha256: chunk.contentSha256 || pack.contentSha256,
    verbatimText: text,
    verbatimTextSha256,
    charSpanInSource: { start: 0, end: text.length },
    retrievalScores,
    sufficiencyHint: null,
  };
}

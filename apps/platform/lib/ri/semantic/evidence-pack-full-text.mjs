/**
 * Expand evidence packs to full verified text for offline indexing (not sample-limited).
 */
function mapBlock(b) {
  return {
    documentEvidenceId: b.documentEvidenceId,
    pageNumber: b.pageNumber,
    sectionReference: b.sectionReference,
    extractedText: String(b.extractedText || b.text || '').trim(),
  };
}

export function listSourceEvidenceBlocks(pack) {
  const nested =
    pack.askRiEvidence?.evidenceBlocks ||
    pack.askRiEvidence?.evidence?.evidenceBlocks ||
    pack.evidenceBlocks;
  if (Array.isArray(nested) && nested.length) return nested;
  return pack.verifiedTextSamples || [];
}

export function packHasFullTextExport(pack) {
  const blocks = listSourceEvidenceBlocks(pack);
  const declared = pack.blockCount ?? blocks.length;
  const sampleLen = pack.verifiedTextSamples?.length ?? 0;
  if (declared > 0 && sampleLen >= declared) return true;
  return blocks.length >= declared && declared > 0;
}

export function normalizePackForFullSemanticIndex(pack) {
  const blocks = listSourceEvidenceBlocks(pack).map(mapBlock).filter((b) => b.extractedText);
  const declared = pack.blockCount ?? blocks.length;
  return {
    ...pack,
    blockCount: declared,
    verifiedTextSamples: blocks,
    retrievalIndexMode: blocks.length >= declared ? 'full_blocks' : 'partial_blocks',
  };
}

export function auditPackTextCoverage(pack) {
  const sourceBlocks = listSourceEvidenceBlocks(pack);
  const exportedSamples = pack.verifiedTextSamples || [];
  const declared = pack.blockCount ?? sourceBlocks.length;
  const sourceChars = sourceBlocks.reduce((a, b) => a + String(b.extractedText || b.text || '').length, 0);
  const sampleChars = exportedSamples.reduce((a, b) => a + String(b.extractedText || '').length, 0);
  const normalized = normalizePackForFullSemanticIndex(pack);
  const indexBlocks = normalized.verifiedTextSamples;
  const indexChars = indexBlocks.reduce((a, b) => a + b.extractedText.length, 0);
  return {
    publicationId: pack.publicationId,
    extractionRevisionId: pack.extractionRevisionId,
    packFile: pack.packFile,
    totalSourceBlocks: sourceBlocks.length,
    declaredBlockCount: declared,
    exportedSampleBlocks: exportedSamples.length,
    indexedBlocks: indexBlocks.length,
    missingBlocks: Math.max(0, declared - exportedSamples.length),
    missingFromIndex: Math.max(0, sourceBlocks.length - indexBlocks.length),
    totalSourceChars: sourceChars,
    exportedSampleChars: sampleChars,
    indexedChars: indexChars,
    fullExport: indexBlocks.length >= declared && declared > 0,
  };
}

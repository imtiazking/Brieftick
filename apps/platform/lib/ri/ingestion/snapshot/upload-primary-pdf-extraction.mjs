import { createHash } from 'node:crypto';
import { buildContentAddressedKey } from './paths.mjs';
import { resolveExtractionRevisionArtifactSemantics } from './extraction-revision-artifact-semantics.mjs';
import { EXTRACTION_PROFILE_PDF_PRIMARY_V1 } from './extraction-revision-types.mjs';

function sha256Utf8(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function sha256Buffer(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Upload immutable primary PDF + derived artefacts (content-addressed).
 * @param {import('./memory-storage.mjs').SnapshotStorage} storage
 */
export async function uploadPrimaryPdfExtractionArtefacts(storage, params) {
  const {
    pdfBytes,
    fullText,
    structuredExtraction,
    extractionQuality,
    publicationMetadata,
    sourceSnapshotId,
    extractionProfile,
    derivedContentFingerprint,
    provenance,
    sourceUrl,
    contentSha256,
  } = params;

  if (!pdfBytes?.length) throw new Error('primary_pdf_missing_bytes');
  if (!fullText) throw new Error('primary_pdf_missing_text');

  const pdfSha = contentSha256 || sha256Buffer(pdfBytes);
  const structuredJson = JSON.stringify(structuredExtraction);
  const structuredSha = sha256Utf8(structuredJson);
  const textSha = sha256Utf8(fullText);

  const semantics = resolveExtractionRevisionArtifactSemantics(
    extractionProfile || EXTRACTION_PROFILE_PDF_PRIMARY_V1,
  );

  const paths = {
    pdf: buildContentAddressedKey(pdfSha, 'primary.pdf'),
    structured: buildContentAddressedKey(structuredSha, 'pdf.structured.json'),
    text: buildContentAddressedKey(textSha, 'pdf.extracted.txt'),
    metadata: null,
  };

  const meta = {
    kind: 'extraction_revision_metadata',
    sourceSnapshotId,
    extractionProfile,
    artifactSemantics: semantics,
    derivedContentFingerprint,
    extractionQuality,
    publicationMetadata,
    derivedArtifacts: {
      primaryPdf: {
        storagePath: paths.pdf,
        contentSha256: pdfSha,
        mediaType: 'application/pdf',
      },
      structuredExtraction: {
        storagePath: paths.structured,
        contentSha256: structuredSha,
        mediaType: 'application/json',
        role: semantics.normalisedHtmlStoragePathRole,
      },
      extractedText: {
        storagePath: paths.text,
        contentSha256: textSha,
        mediaType: 'text/plain',
        role: semantics.normalisedTextStoragePathRole,
      },
    },
    primaryPdf: {
      sourceUrl,
      contentSha256: pdfSha,
      storagePath: paths.pdf,
      byteLength: pdfBytes.length,
    },
    provenance,
  };
  const metaJson = JSON.stringify(meta);
  const metaSha = sha256Utf8(metaJson);
  paths.metadata = buildContentAddressedKey(metaSha, 'extraction-revision.meta.json');

  const uploads = [
    { key: paths.pdf, body: pdfBytes, contentType: 'application/pdf', sha256: pdfSha },
    {
      key: paths.structured,
      body: Buffer.from(structuredJson, 'utf8'),
      contentType: 'application/json',
      sha256: structuredSha,
    },
    {
      key: paths.text,
      body: Buffer.from(fullText, 'utf8'),
      contentType: 'text/plain; charset=utf-8',
      sha256: textSha,
    },
    {
      key: paths.metadata,
      body: Buffer.from(metaJson, 'utf8'),
      contentType: 'application/json',
      sha256: metaSha,
    },
  ];

  for (const u of uploads) {
    await storage.putObject(u);
  }
  for (const u of uploads) {
    const head = await storage.headObject({ key: u.key });
    if (!head.exists || head.sha256 !== u.sha256) {
      throw new Error(`primary_pdf_upload_verify_failed:${u.key}`);
    }
  }

  return {
    paths,
    pdfSha256: pdfSha,
    structuredSha256: structuredSha,
    textSha256: textSha,
    metadataSha256: metaSha,
  };
}

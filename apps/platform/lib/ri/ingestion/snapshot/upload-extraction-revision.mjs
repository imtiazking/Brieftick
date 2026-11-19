import { createHash } from 'node:crypto';
import { buildContentAddressedKey } from './paths.mjs';

function sha256Utf8(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Upload v2 derived artefacts only (never raw or v1 objects).
 * @param {import('./memory-storage.mjs').SnapshotStorage} storage
 * @param {object} params
 */
export async function uploadExtractionRevisionArtefacts(storage, params) {
  const {
    normalisedArticleHtmlV2,
    normalisedArticleTextV2,
    extractionQuality,
    publicationMetadata,
    pdfAttachments,
    sourceSnapshotId,
    extractionProfile,
    derivedContentFingerprint,
    provenance,
  } = params;

  if (!normalisedArticleHtmlV2 || !normalisedArticleTextV2) {
    throw new Error('extraction_revision_missing_derived_content');
  }

  const htmlSha = sha256Utf8(normalisedArticleHtmlV2);
  const textSha = sha256Utf8(normalisedArticleTextV2);

  const meta = {
    kind: 'extraction_revision_metadata',
    sourceSnapshotId,
    extractionProfile,
    derivedContentFingerprint,
    extractionQuality,
    publicationMetadata,
    pdfAttachments,
    provenance,
  };
  const metaJson = JSON.stringify(meta);
  const metaSha = sha256Utf8(metaJson);

  const paths = {
    html: buildContentAddressedKey(htmlSha, 'article.v2.norm.html'),
    text: buildContentAddressedKey(textSha, 'article.v2.txt'),
    metadata: buildContentAddressedKey(metaSha, 'extraction-revision.meta.json'),
  };

  const uploads = [
    {
      key: paths.html,
      body: Buffer.from(normalisedArticleHtmlV2, 'utf8'),
      contentType: 'text/html; charset=utf-8',
      sha256: htmlSha,
    },
    {
      key: paths.text,
      body: Buffer.from(normalisedArticleTextV2, 'utf8'),
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
      throw new Error(`extraction_revision_upload_verify_failed:${u.key}`);
    }
  }

  return {
    paths,
    normalisedHtmlSha256: htmlSha,
    normalisedTextSha256: textSha,
    metadataSha256: metaSha,
  };
}

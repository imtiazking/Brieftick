import { createHash } from 'node:crypto';
import { buildContentAddressedKey } from './paths.mjs';
import { validateSnapshotEvidence } from './evidence-validate.mjs';

const LICENCE_NOTICE =
  'Regulator website content retained for internal provenance only; not for public redistribution.';

function sha256Utf8(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Upload all snapshot artefacts (idempotent). Does not touch Postgres.
 */
export async function uploadSnapshotEvidence(storage, params) {
  const { evidenceCapture, connectorId, ingestionRunId, contentHash } = params;
  const doc = { contentHash, evidenceCapture };
  const validation = validateSnapshotEvidence(doc);
  if (!validation.ok) {
    throw new Error(validation.code);
  }
  const ec = evidenceCapture;

  const meta = {
    connectorId,
    ingestionRunId,
    finalUrl: ec.finalUrl,
    fingerprint: ec.fingerprint,
    rawSha256: ec.rawSha256,
    normalisedHtmlSha256: ec.normalisedHtmlSha256,
    normalisedTextSha256: ec.normalisedTextSha256,
    licenceNotice: LICENCE_NOTICE,
    rawByteSemantics: 'http_client_decoded_response_body',
  };
  const metaJson = JSON.stringify(meta);
  const metaSha = sha256Utf8(metaJson);

  const paths = {
    raw: buildContentAddressedKey(
      ec.rawSha256,
      ec.contentType.includes('html') ? 'raw.html' : 'raw.bin',
    ),
    html: buildContentAddressedKey(ec.normalisedHtmlSha256, 'article.norm.html'),
    text: buildContentAddressedKey(ec.normalisedTextSha256, 'article.txt'),
    metadata: buildContentAddressedKey(metaSha, 'meta.json'),
  };

  const uploads = [
    {
      key: paths.raw,
      body: ec.rawBody,
      contentType: ec.contentType,
      sha256: ec.rawSha256,
    },
    {
      key: paths.html,
      body: Buffer.from(ec.normalisedArticleHtml, 'utf8'),
      contentType: 'text/html; charset=utf-8',
      sha256: ec.normalisedHtmlSha256,
    },
    {
      key: paths.text,
      body: Buffer.from(ec.normalisedArticleText, 'utf8'),
      contentType: 'text/plain; charset=utf-8',
      sha256: ec.normalisedTextSha256,
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
    if (!head.exists) throw new Error(`upload verify failed: missing ${u.key}`);
    if (!head.sha256 || head.sha256 !== u.sha256) {
      throw new Error(`upload verify failed: hash mismatch ${u.key}`);
    }
  }

  return { paths, licenceNotice: LICENCE_NOTICE, metadata: meta };
}

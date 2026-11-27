import { createHash } from 'node:crypto';
import { retrieveRegulatoryPrimaryPdf } from '../../../../../../integrations/regulatory-sources/core/regulatory-pdf-retrieval.mjs';
import { extractRegulatoryPdfContent } from '../../../../../../integrations/regulatory-sources/core/regulatory-pdf-extract.mjs';
import { assertUrlAllowed } from '../../../../../../integrations/regulatory-sources/core/url-safety.mjs';
import { resolveAllowedHostsForPublication } from './resolve-allowed-hosts.mjs';
import { ensureSnapshotStorageReady, getSnapshotStorage } from '../snapshot/resolve-storage.mjs';
import { uploadSnapshotEvidence } from '../snapshot/upload.mjs';
import { insertRegulatorySourceSnapshotRow } from '../snapshot/persist-db.mjs';
import { createExtractionRevision } from '../snapshot/create-extraction-revision.mjs';
import { createPrimaryPdfExtractionRevision } from '../snapshot/create-primary-pdf-extraction-revision.mjs';
import { recordCorpusBackfillOutcome } from './corpus-failure-tracking.mjs';

const CONNECTOR_ID = 'CONN-CORPUS-BACKFILL-PDF';

async function createBackfillRun(client, sourceUuid) {
  const res = await client.query(
    `insert into ingestion_runs (
      source_id, run_type, status, trigger_type, attempt_number, queued_at, started_at, completed_at,
      initiated_by, environment, records_discovered, records_new
    ) values ($1, 'MANUAL'::ingestion_run_type, 'COMPLETED'::ingestion_run_status, 'MANUAL'::ingestion_trigger_type,
      1, now(), now(), now(), 'corpus-pdf-canonical-backfill', 'staging', 0, 0)
     returning id`,
    [sourceUuid],
  );
  return res.rows[0].id;
}

/**
 * @param {import('pg').Client} client
 * @param {object} pub
 */
export async function backfillPdfCanonicalPublication(client, pub) {
  const allowedHosts = resolveAllowedHostsForPublication({
    canonicalUrl: pub.canonical_url,
    sourceExternalKey: pub.source_key,
  });
  const gate = assertUrlAllowed(pub.canonical_url, allowedHosts);
  if (!gate.ok) {
    const result = { publicationId: pub.id, ok: false, code: gate.code || 'URL_NOT_ALLOWED' };
    await recordCorpusBackfillOutcome(client, pub.id, result);
    return result;
  }

  const retrieved = await retrieveRegulatoryPrimaryPdf(pub.canonical_url, { sourceExternalKey: pub.source_key });
  if (!retrieved.ok) {
    const result = {
      publicationId: pub.id,
      ok: false,
      code: retrieved.code || 'PDF_RETRIEVAL_FAILED',
      detail: retrieved.message,
    };
    await recordCorpusBackfillOutcome(client, pub.id, result);
    return result;
  }

  const extracted = await extractRegulatoryPdfContent(retrieved.body, { expectedTitle: pub.title });
  if (!extracted.ok) {
    const result = { publicationId: pub.id, ok: false, code: 'PDF_EXTRACT_FAILED', detail: extracted.reason };
    await recordCorpusBackfillOutcome(client, pub.id, result);
    return result;
  }

  const pdfHash = retrieved.sha256 || createHash('sha256').update(retrieved.body).digest('hex');
  const runId = await createBackfillRun(client, pub.source_id);
  const pubRow = await client.query(
    `select p.id, p.source_hash, p.title,
            v.id as version_id, v.version_number
     from regulatory_publications p
     join lateral (
       select id, version_number from regulatory_publication_versions
       where publication_id = p.id order by version_number desc limit 1
     ) v on true
     where p.id = $1`,
    [pub.id],
  );
  if (!pubRow.rows[0]) {
    return { publicationId: pub.id, ok: false, code: 'PUBLICATION_NOT_FOUND' };
  }
  const row = pubRow.rows[0];
  let versionId = row.version_id;
  const retrievedAt = new Date().toISOString();
  await client.query('BEGIN');
  try {
    if (row.source_hash !== pdfHash) {
      const nextVersion = (parseInt(row.version_number, 10) || 1) + 1;
      await client.query(
        `update regulatory_publications set source_hash = $2, source_version = $3::text, retrieved_at = $4::timestamptz, updated_at = now() where id = $1`,
        [pub.id, pdfHash, String(nextVersion), retrievedAt],
      );
      const verIns = await client.query(
        `insert into regulatory_publication_versions
          (publication_id, version_number, source_hash, canonical_url, retrieved_at, ingestion_run_id, provenance)
         values ($1, $2, $3, $4, $5::timestamptz, $6, $7::jsonb) returning id`,
        [
          pub.id,
          nextVersion,
          pdfHash,
          pub.canonical_url,
          retrievedAt,
          runId,
          JSON.stringify({ corpusPdfCanonical: true, priorHash: row.source_hash }),
        ],
      );
      versionId = verIns.rows[0].id;
    }

    await ensureSnapshotStorageReady({ environment: 'staging' });
    const { buildEvidenceCapture } = await import(
      '../../../../../../integrations/regulatory-sources/core/evidence-capture.mjs'
    );
    const evidenceCapture = await buildEvidenceCapture({
      body: retrieved.body,
      contentType: 'application/pdf',
      finalUrl: pub.canonical_url,
      connectorId: CONNECTOR_ID,
    });
    const storage = getSnapshotStorage({ environment: 'staging' });
    const uploaded = await uploadSnapshotEvidence(storage, {
      evidenceCapture,
      contentHash: pdfHash,
      connectorId: CONNECTOR_ID,
      ingestionRunId: runId,
    });

    const snapshotId = await insertRegulatorySourceSnapshotRow(client, {
      publicationId: pub.id,
      publicationVersionId: versionId,
      ingestionRunId: runId,
      ingestionItemId: null,
      canonicalUrl: pub.canonical_url,
      retrievedAt,
      sourceFingerprint: pdfHash,
      fingerprintAlgorithm: evidenceCapture.fingerprint?.algorithm || 'sha256',
      fingerprintNormalisation: evidenceCapture.fingerprint?.normalisation || 'v1',
      rawContentSha256: evidenceCapture.rawSha256,
      normalisedHtmlSha256: evidenceCapture.normalisedHtmlSha256,
      normalisedTextSha256: evidenceCapture.normalisedTextSha256,
      rawStoragePath: uploaded.paths.raw,
      normalisedHtmlStoragePath: uploaded.paths.html,
      normalisedTextStoragePath: uploaded.paths.text,
      metadataStoragePath: uploaded.paths.metadata,
      contentType: 'application/pdf',
      byteSizeRaw: retrieved.body.length,
      byteSizeNormalisedHtml: Buffer.byteLength(evidenceCapture.normalisedArticleHtml || '', 'utf8'),
      byteSizeNormalisedText: Buffer.byteLength(evidenceCapture.normalisedArticleText || '', 'utf8'),
      licenceNotice: uploaded.licenceNotice,
      provenance: { corpusPdfCanonical: true, connectorId: CONNECTOR_ID },
    });
    await client.query('COMMIT');

    const htmlRevision = await createExtractionRevision(client, {
      sourceSnapshotId: snapshotId,
      rawBody: retrieved.body,
      canonicalUrl: pub.canonical_url,
      createdBy: 'corpus-pdf-canonical-html-v2',
      environment: 'staging',
      extractionQualityPatch: {
        webpageExtraction: { status: 'complete' },
        primaryDocument: { completeness: 'pdf_canonical', sourceUrl: pub.canonical_url },
      },
      publicationMetadataPatch: { title: pub.title, primaryPdfUrl: pub.canonical_url },
      provenancePatch: { pdfCanonical: true },
    });

    await client.query(
      `update regulatory_source_extraction_revisions set pdf_attachments = $2::jsonb
       where id = $1`,
      [
        htmlRevision.revisionId,
        JSON.stringify([
          {
            url: pub.canonical_url,
            likelyPrimaryRegulatoryDocument: true,
            title: pub.title,
          },
        ]),
      ],
    );

    const pdfRevision = await createPrimaryPdfExtractionRevision(client, {
      sourceSnapshotId: snapshotId,
      pdfBytes: retrieved.body,
      contentSha256: pdfHash,
      sourceUrl: pub.canonical_url,
      extraction: extracted,
      createdBy: 'corpus-pdf-canonical-backfill',
      environment: 'staging',
    });

    await recordCorpusBackfillOutcome(client, pub.id, { ok: true });
    return {
      publicationId: pub.id,
      ok: true,
      snapshotId,
      htmlRevisionId: htmlRevision.revisionId,
      pdfRevisionId: pdfRevision.revisionId,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    const result = {
      publicationId: pub.id,
      ok: false,
      code: 'PDF_CANONICAL_TX_FAILED',
      detail: String(e.message || e).slice(0, 240),
    };
    await recordCorpusBackfillOutcome(client, pub.id, result);
    return result;
  }
}
/**
 * Controlled single-URL FCA landing ingest when RSS only-url cannot resolve historical publications.
 */
import { httpGet } from '../../../../../../integrations/regulatory-sources/core/http-client.mjs';
import { fingerprintContent } from '../../../../../../integrations/regulatory-sources/core/fingerprint.mjs';
import { buildEvidenceCapture } from '../../../../../../integrations/regulatory-sources/core/evidence-capture.mjs';
import { buildFcaPublicationMetadata } from '../../../../../../integrations/regulatory-sources/core/fca-publication-metadata.mjs';
import { inferFcaPublicationType } from '../../../../../../integrations/regulatory-sources/connectors/fca-publication-type.mjs';
import { resolveCatalogueIds } from '../resolve-ids.mjs';
import { INGESTION_DATA_ORIGIN, INGESTION_PROVENANCE_ORIGIN } from '../types.mjs';
import { SOURCE_COVERAGE_BY_ID } from '../../../../../../packages/reference-data/catalogue/source-coverage.mjs';
import { ensureSnapshotStorageReady, getSnapshotStorage } from './resolve-storage.mjs';
import { uploadSnapshotEvidence } from './upload.mjs';
import { insertRegulatorySourceSnapshotRow } from './persist-db.mjs';

const ALLOWED_HOSTS = ['www.fca.org.uk', 'fca.org.uk'];
const SOURCE = 'SRC-FCA-PUBLICATIONS-RSS';
const REGULATOR = 'REG-FCA';

function extractArticleRegion(html) {
  const m = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const attrs = html.match(/<article([^>]*)>/i)?.[1] || '';
  return { bodyHtml: m?.[1] || html, articleAttrs: attrs };
}

/**
 * @param {import('pg').Client} client
 * @param {{ canonicalUrl: string }} target
 */
export async function persistFcaCanonicalLandingIfMissing(client, target) {
  const existing = await client.query(
    `select p.id from regulatory_publications p
     join regulatory_sources rs on rs.id = p.source_id
     where rs.external_key = $1 and p.canonical_url = $2`,
    [SOURCE, target.canonicalUrl],
  );
  if (existing.rows[0]?.id) return { publicationId: existing.rows[0].id, created: false };

  const res = await httpGet(target.canonicalUrl, { allowedHosts: ALLOWED_HOSTS });
  if (!res.ok) throw new Error(`direct_landing_fetch_failed:${res.message || res.code}`);

  const fp = await fingerprintContent(res.body, { contentType: res.contentType });
  const evidenceCapture = await buildEvidenceCapture({
    body: res.body,
    contentType: res.contentType,
    finalUrl: res.finalUrl || target.canonicalUrl,
    connectorId: 'CONN-LEGACY-FCA',
  });
  if (!evidenceCapture?.rawBody?.length) throw new Error('direct_landing_evidence_empty');

  const html = res.body.toString('utf8');
  const { bodyHtml, articleAttrs } = extractArticleRegion(html);
  const meta = buildFcaPublicationMetadata(bodyHtml, html, articleAttrs, res.finalUrl || target.canonicalUrl);
  if (!meta.title) throw new Error('direct_landing_title_missing');

  const inferred = inferFcaPublicationType({
    title: meta.title,
    canonicalUrl: target.canonicalUrl,
    html,
  });

  const ids = await resolveCatalogueIds(client, REGULATOR, SOURCE);
  const coverage = SOURCE_COVERAGE_BY_ID[SOURCE];
  const retrievedAt = new Date().toISOString();
  const externalDocumentId = meta.drupalNodeId ? `fca-node-${meta.drupalNodeId}` : null;

  const runIns = await client.query(
    `insert into ingestion_runs (
      source_id, run_type, status, trigger_type, attempt_number, queued_at, started_at, completed_at,
      initiated_by, environment, records_discovered, records_new
    ) values ($1, 'MANUAL'::ingestion_run_type, 'COMPLETED'::ingestion_run_status, 'MANUAL'::ingestion_trigger_type,
      1, now(), now(), now(), 'batch-b2-direct-canonical', 'staging', 1, 1)
     returning id`,
    [ids.sourceUuid],
  );
  const runId = runIns.rows[0].id;

  const doc = {
    regulatorId: REGULATOR,
    sourceId: SOURCE,
    externalDocumentId,
    title: meta.title,
    publicationType: inferred.publicationType || 'publication',
    canonicalUrl: target.canonicalUrl,
    publicationDate: null,
    effectiveDate: null,
    consultationDeadline: null,
    summary: null,
    contentHash: fp.hash,
    retrievedAt,
    dataOrigin: INGESTION_DATA_ORIGIN,
    contentClasses: coverage?.contentClasses ?? [],
    provenance: {
      origin: INGESTION_PROVENANCE_ORIGIN,
      connectorId: 'CONN-LEGACY-FCA',
      retrievalMethod: 'direct_canonical_landing_v1',
      directIngest: true,
    },
    evidenceCapture,
    contentType: evidenceCapture.contentType,
  };

  await ensureSnapshotStorageReady({ environment: 'staging' });
  const snapshotUpload = await uploadSnapshotEvidence(getSnapshotStorage({ environment: 'staging' }), {
    evidenceCapture,
    contentHash: fp.hash,
    connectorId: 'CONN-LEGACY-FCA',
    ingestionRunId: runId,
  });

  await client.query('BEGIN');
  try {
    const pub = await client.query(
      `insert into regulatory_publications (
        source_id, regulator_id, external_document_id, title, publication_type, summary,
        canonical_url, publication_date, effective_date, consultation_deadline,
        retrieved_at, source_hash, source_version, data_origin, provenance
      ) values ($1,$2,$3,$4,$5,$6,$7,$8::date,$9::date,$10::date,$11::timestamptz,$12,$13,$14,$15::jsonb)
      returning id`,
      [
        ids.sourceUuid,
        ids.regulatorUuid,
        doc.externalDocumentId,
        doc.title,
        doc.publicationType,
        doc.summary,
        doc.canonicalUrl,
        doc.publicationDate,
        doc.effectiveDate,
        doc.consultationDeadline,
        doc.retrievedAt,
        doc.contentHash,
        '1',
        doc.dataOrigin,
        JSON.stringify({ ...doc.provenance, ingestionRunId: runId }),
      ],
    );
    const publicationId = pub.rows[0].id;
    const verIns = await client.query(
      `insert into regulatory_publication_versions
        (publication_id, version_number, source_hash, canonical_url, retrieved_at, ingestion_run_id, provenance)
       values ($1, 1, $2, $3, $4::timestamptz, $5, $6::jsonb)
       returning id`,
      [publicationId, doc.contentHash, doc.canonicalUrl, doc.retrievedAt, runId, JSON.stringify(doc.provenance)],
    );

    const ec = evidenceCapture;
    const snapshotId = await insertRegulatorySourceSnapshotRow(client, {
      publicationId,
      publicationVersionId: verIns.rows[0].id,
      ingestionRunId: runId,
      ingestionItemId: null,
      canonicalUrl: doc.canonicalUrl,
      retrievedAt: doc.retrievedAt,
      sourceFingerprint: doc.contentHash,
      fingerprintAlgorithm: ec.fingerprint.algorithm,
      fingerprintNormalisation: ec.fingerprint.normalisation,
      rawContentSha256: ec.rawSha256,
      normalisedHtmlSha256: ec.normalisedHtmlSha256,
      normalisedTextSha256: ec.normalisedTextSha256,
      rawStoragePath: snapshotUpload.paths.raw,
      normalisedHtmlStoragePath: snapshotUpload.paths.html,
      normalisedTextStoragePath: snapshotUpload.paths.text,
      metadataStoragePath: snapshotUpload.paths.metadata,
      contentType: ec.contentType,
      byteSizeRaw: ec.rawBody.length,
      byteSizeNormalisedHtml: Buffer.byteLength(ec.normalisedArticleHtml, 'utf8'),
      byteSizeNormalisedText: Buffer.byteLength(ec.normalisedArticleText, 'utf8'),
      licenceNotice: snapshotUpload.licenceNotice,
      provenance: {
        connectorId: 'CONN-LEGACY-FCA',
        finalUrl: ec.finalUrl,
        directCanonicalIngest: true,
        batch: '2B2-B2',
      },
    });

    await client.query(
      `insert into ingestion_items (
        ingestion_run_id, source_id, external_document_id, canonical_url, title, publication_date,
        content_type, source_hash, retrieval_status, normalisation_status, publication_id, retrieved_at
      ) values ($1,$2,$3,$4,$5,$6::date,$7,$8,'RETRIEVED'::ingestion_item_retrieval_status,'NEW'::ingestion_item_normalisation_status,$9,$10::timestamptz)`,
      [
        runId,
        ids.sourceUuid,
        doc.externalDocumentId,
        doc.canonicalUrl,
        doc.title,
        doc.publicationDate,
        doc.contentType,
        doc.contentHash,
        publicationId,
        doc.retrievedAt,
      ],
    );

    await client.query(
      `update regulatory_publication_versions
       set provenance = provenance || $2::jsonb
       where id = $1`,
      [verIns.rows[0].id, JSON.stringify({ snapshotId, snapshotRetention: 'regulatory_source_snapshots' })],
    );

    await client.query('COMMIT');
    return { publicationId, created: true, snapshotId, inferredTitle: meta.title, publicationType: doc.publicationType };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

/**
 * FG22/5-only controlled catalogue persist (BUS-UAT-018).
 * Does not use runSourceIngestion — avoids coupling publication source_hash to the discovery HTML hub.
 *
 * Identity:
 * - regulatory_publications.canonical_url = official primary PDF URL
 * - regulatory_publications.source_hash = SHA-256 of primary PDF bytes
 * - regulatory_source_snapshots.source_fingerprint = same PDF SHA-256 (extraction invariant)
 * - snapshot raw/normalised artefacts = genuine FCA discovery HTML (link index only)
 */
import { insertRegulatorySourceSnapshotRow } from './persist-db.mjs';
import { getSnapshotStorage } from './resolve-storage.mjs';
import { resolveCatalogueIds } from '../resolve-ids.mjs';
import { FG22_5_STAGING } from './fg22-5-staging-identity.mjs';
import { FG22_5_PRIMARY_PDF_URL } from '../../../../../../integrations/regulatory-sources/core/regulatory-pdf-allowlist.mjs';
import { buildContentAddressedKey } from './paths.mjs';
import { createHash } from 'node:crypto';

const LICENCE_NOTICE =
  'Regulator website content retained for internal provenance only; not for public redistribution.';

function sha256Utf8(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Upload discovery HTML artefacts (bypasses snapshot_evidence fingerprint = contentHash check).
 */
async function uploadFg22DiscoverySnapshot(storage, params) {
  const { evidenceCapture, connectorId, ingestionRunId, discoveryFinalUrl } = params;
  const ec = evidenceCapture;
  const meta = {
    connectorId,
    ingestionRunId,
    finalUrl: discoveryFinalUrl,
    fingerprint: ec.fingerprint,
    rawSha256: ec.rawSha256,
    normalisedHtmlSha256: ec.normalisedHtmlSha256,
    normalisedTextSha256: ec.normalisedTextSha256,
    licenceNotice: LICENCE_NOTICE,
    rawByteSemantics: 'http_client_decoded_response_body',
    htmlSnapshotRole: 'fca_link_discovery_only',
    primaryRegulatoryDocumentUrl: FG22_5_PRIMARY_PDF_URL,
    primaryRegulatoryDocumentSha256: params.primaryPdfSha256,
    catalogueCanonicalIdentity: FG22_5_PRIMARY_PDF_URL,
  };
  const metaJson = JSON.stringify(meta);
  const metaSha = sha256Utf8(metaJson);
  const paths = {
    raw: buildContentAddressedKey(ec.rawSha256, 'raw.html'),
    html: buildContentAddressedKey(ec.normalisedHtmlSha256, 'article.norm.html'),
    text: buildContentAddressedKey(ec.normalisedTextSha256, 'article.txt'),
    metadata: buildContentAddressedKey(metaSha, 'meta.json'),
  };
  const uploads = [
    { key: paths.raw, body: ec.rawBody, contentType: ec.contentType, sha256: ec.rawSha256 },
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
    { key: paths.metadata, body: Buffer.from(metaJson, 'utf8'), contentType: 'application/json', sha256: metaSha },
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
  return { paths, licenceNotice: LICENCE_NOTICE, metadataSha256: metaSha };
}

/**
 * @param {import('pg').Client} client
 * @param {object} params
 * @returns {Promise<{ publicationId: string, publicationVersionId: string, snapshotId: string, runId: string, metric: 'new'|'unchanged'|'updated' }>}
 */
export async function persistFg22ControlledCatalogue(client, params) {
  const {
    landing,
    primaryPdfSha256,
    primaryPdfRetrievedAt,
    environment = 'staging',
    initiatedBy = 'fg22-5-controlled-ingest',
  } = params;

  const ids = await resolveCatalogueIds(client, FG22_5_STAGING.regulatorId, FG22_5_STAGING.sourceId);
  const canonicalUrl = FG22_5_STAGING.canonicalPdfUrl;
  const discoveryUrl = landing.finalUrl;
  const versionSourceHash = primaryPdfSha256;

  const collision = await client.query(
    `select id, external_document_id from regulatory_publications
     where canonical_url = $1 and coalesce(external_document_id, '') <> $2`,
    [canonicalUrl, FG22_5_STAGING.externalDocumentId],
  );
  if (collision.rows.length) {
    const err = new Error('fg22_canonical_url_collision');
    err.details = collision.rows;
    throw err;
  }

  const runIns = await client.query(
    `insert into ingestion_runs (
      source_id, run_type, status, trigger_type, attempt_number, queued_at, started_at, completed_at,
      initiated_by, environment, records_discovered, records_new
    ) values ($1, 'MANUAL'::ingestion_run_type, 'COMPLETED'::ingestion_run_status, 'MANUAL'::ingestion_trigger_type,
      1, now(), now(), now(), $2, $3, 1, 0)
     returning id`,
    [ids.sourceUuid, initiatedBy, environment],
  );
  const runId = runIns.rows[0].id;

  let existing = await client.query(
    `select id, source_hash, source_version from regulatory_publications
     where source_id = $1 and external_document_id = $2`,
    [ids.sourceUuid, FG22_5_STAGING.externalDocumentId],
  );
  existing = existing.rows[0] || null;

  if (!existing) {
    const alt = await client.query(
      `select id, source_hash, source_version from regulatory_publications where canonical_url = $1`,
      [canonicalUrl],
    );
    existing = alt.rows[0] || null;
  }

  if (existing && existing.source_hash === versionSourceHash) {
    const snap = await client.query(
      `select s.id, s.publication_version_id from regulatory_source_snapshots s
       where s.publication_id = $1 order by s.retrieved_at desc limit 1`,
      [existing.id],
    );
    if (snap.rows[0]) {
      return {
        publicationId: existing.id,
        publicationVersionId: snap.rows[0].publication_version_id,
        snapshotId: snap.rows[0].id,
        runId,
        metric: 'unchanged',
      };
    }
  }

  const provenance = {
    controlledIngest: 'bus-uat-018-fg22-5',
    ingestionRunId: runId,
    primaryRegulatoryDocumentUrl: canonicalUrl,
    primaryRegulatoryDocumentSha256: primaryPdfSha256,
    discoveryHtmlUrl: discoveryUrl,
    discoveryHtmlFingerprint: landing.contentHash,
    discoveryHtmlRawSha256: landing.evidenceCapture?.rawSha256,
    htmlSnapshotRole: 'fca_link_discovery_only',
    versionIdentityAnchoredTo: 'primary_pdf_sha256',
  };

  const storage = getSnapshotStorage({ environment });
  const snapshotUpload = await uploadFg22DiscoverySnapshot(storage, {
    evidenceCapture: landing.evidenceCapture,
    connectorId: 'CONN-LEGACY-FCA',
    ingestionRunId: runId,
    discoveryFinalUrl: discoveryUrl,
    primaryPdfSha256,
  });

  await client.query('BEGIN');
  try {
    let publicationId;
    let publicationVersionId;
    let versionNumber = 1;
    let metric = 'new';

    if (existing) {
      metric = 'updated';
      versionNumber = (parseInt(existing.source_version || '1', 10) || 1) + 1;
      publicationId = existing.id;
      await client.query(
        `update regulatory_publications set
          title = $2, publication_type = $3, summary = $4, canonical_url = $5,
          publication_date = $6::date, retrieved_at = $7::timestamptz,
          source_hash = $8, source_version = $9, provenance = provenance || $10::jsonb, updated_at = now()
         where id = $1`,
        [
          publicationId,
          FG22_5_STAGING.title,
          FG22_5_STAGING.publicationType,
          'Primary regulatory text is the FG22/5 PDF; HTML snapshot is FCA link discovery only.',
          canonicalUrl,
          '2022-07-27',
          primaryPdfRetrievedAt || new Date().toISOString(),
          versionSourceHash,
          String(versionNumber),
          JSON.stringify(provenance),
        ],
      );
    } else {
      const pub = await client.query(
        `insert into regulatory_publications (
          source_id, regulator_id, external_document_id, title, publication_type, summary,
          canonical_url, publication_date, retrieved_at, source_hash, source_version, data_origin, provenance
        ) values ($1,$2,$3,$4,$5,$6,$7,$8::date,$9::timestamptz,$10,$11,$12,$13::jsonb)
         returning id`,
        [
          ids.sourceUuid,
          ids.regulatorUuid,
          FG22_5_STAGING.externalDocumentId,
          FG22_5_STAGING.title,
          FG22_5_STAGING.publicationType,
          'Primary regulatory text is the FG22/5 PDF; HTML snapshot is FCA link discovery only.',
          canonicalUrl,
          '2022-07-27',
          primaryPdfRetrievedAt || new Date().toISOString(),
          versionSourceHash,
          '1',
          'fca_catalogue_controlled_ingest',
          JSON.stringify(provenance),
        ],
      );
      publicationId = pub.rows[0].id;
    }

    const verIns = await client.query(
      `insert into regulatory_publication_versions
        (publication_id, version_number, source_hash, canonical_url, retrieved_at, ingestion_run_id, provenance)
       values ($1, $2, $3, $4, $5::timestamptz, $6, $7::jsonb)
       returning id`,
      [
        publicationId,
        versionNumber,
        versionSourceHash,
        canonicalUrl,
        primaryPdfRetrievedAt || new Date().toISOString(),
        runId,
        JSON.stringify(provenance),
      ],
    );
    publicationVersionId = verIns.rows[0].id;

    const ec = landing.evidenceCapture;
    const snapshotId = await insertRegulatorySourceSnapshotRow(client, {
      publicationId,
      publicationVersionId,
      ingestionRunId: runId,
      ingestionItemId: null,
      canonicalUrl: discoveryUrl,
      retrievedAt: primaryPdfRetrievedAt || new Date().toISOString(),
      sourceFingerprint: versionSourceHash,
      fingerprintAlgorithm: 'sha256_primary_pdf_v1',
      fingerprintNormalisation: 'raw_pdf_bytes',
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
        ...provenance,
        snapshotCanonicalSemantics: 'discovery_html_fetch_url',
        publicationCanonicalUrl: canonicalUrl,
      },
    });

    await client.query(
      `update regulatory_publication_versions
       set provenance = provenance || $2::jsonb where id = $1`,
      [publicationVersionId, JSON.stringify({ snapshotId })],
    );

    await client.query(
      `insert into ingestion_items (
        ingestion_run_id, source_id, external_document_id, canonical_url, title, publication_date,
        content_type, source_hash, retrieval_status, normalisation_status, publication_id, retrieved_at
      ) values ($1,$2,$3,$4,$5,$6::date,$7,$8,'RETRIEVED'::ingestion_item_retrieval_status,
        $9::ingestion_item_normalisation_status,$10,$11::timestamptz)`,
      [
        runId,
        ids.sourceUuid,
        FG22_5_STAGING.externalDocumentId,
        canonicalUrl,
        FG22_5_STAGING.title,
        '2022-07-27',
        'application/pdf',
        versionSourceHash,
        metric === 'new' ? 'NEW' : 'UPDATED',
        publicationId,
        primaryPdfRetrievedAt || new Date().toISOString(),
      ],
    );

    await client.query('COMMIT');
    return { publicationId, publicationVersionId, snapshotId, runId, metric };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

export {
  applyFg22DiscoveryHtmlRevisionSemantics,
  buildFg22DiscoveryInsertFields,
  classifyFg22HtmlArticleV2Evidence,
  assessFg22PartialIngestRecovery,
} from './fg22-discovery-html-evidence.mjs';

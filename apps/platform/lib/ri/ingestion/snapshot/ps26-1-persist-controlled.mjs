/**
 * PS26/1 controlled catalogue persist (global regulatory_publications; no tenant obligations).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from '../../eval/eval-paths.mjs';
import { createHash } from 'node:crypto';
import { PS26_1_STAGING } from './ps26-1-staging-identity.mjs';
import { buildPs26MinimalLanding } from './ps26-1-discovery-stub.mjs';

async function extractRegulatoryPdfContent(pdfBytes, options) {
  const modUrl = pathToFileURL(
    join(REPO_ROOT, 'integrations/regulatory-sources/core/regulatory-pdf-extract.mjs'),
  ).href;
  const mod = await import(modUrl);
  return mod.extractRegulatoryPdfContent(pdfBytes, options);
}

const LICENCE_NOTICE =
  'Regulator website content retained for internal provenance only; not for public redistribution.';

function sha256Utf8(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

async function uploadPs26DiscoverySnapshot(storage, params, buildContentAddressedKey) {
  const { evidenceCapture, connectorId, ingestionRunId, discoveryFinalUrl, primaryPdfSha256 } = params;
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
    htmlSnapshotRole: 'ps26_landing_index_only',
    primaryRegulatoryDocumentUrl: PS26_1_STAGING.officialPdfUrl,
    primaryRegulatoryDocumentSha256: primaryPdfSha256,
    catalogueCanonicalIdentity: PS26_1_STAGING.officialPdfUrl,
    globalCatalogueVisibility: true,
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
  return { paths, licenceNotice: LICENCE_NOTICE, metadataSha256: metaSha };
}

export function verifyPs26OfficialPdfBytes(pdfBytes) {
  const sha256 = createHash('sha256').update(pdfBytes).digest('hex');
  if (sha256 !== PS26_1_STAGING.expectedPrimaryPdfSha256) {
    const err = new Error('ps26_primary_pdf_sha256_mismatch');
    err.expected = PS26_1_STAGING.expectedPrimaryPdfSha256;
    err.actual = sha256;
    throw err;
  }
  return { sha256, byteLength: pdfBytes.length };
}

export function buildPs26RollbackSteps({ publicationId, runId, snapshotId }) {
  return {
    scope: 'records_created_by_ps26_controlled_ingest_only',
    globalCatalogueNote: 'Rollback affects shared catalogue — not Org A / Partner tenant obligations or changes',
    steps: [
      `DELETE FROM regulatory_source_extraction_revisions WHERE source_snapshot_id = '${snapshotId || '$snapshot_id'}';`,
      `DELETE FROM regulatory_source_snapshots WHERE id = '${snapshotId || '$snapshot_id'}';`,
      `DELETE FROM regulatory_publication_versions WHERE publication_id = '${publicationId || '$publication_id'}';`,
      `DELETE FROM ingestion_items WHERE ingestion_run_id = '${runId || '$run_id'}';`,
      `DELETE FROM ingestion_runs WHERE id = '${runId || '$run_id'}';`,
      `-- DELETE FROM regulatory_publications WHERE id = '${publicationId || '$publication_id'}' only if no other versions/snapshots remain`,
    ],
  };
}

/**
 * Offline: verify PDF, extract text, build discovery stub, plan DB steps — no hosted writes.
 */
/** @deprecated alias — use runPs26OfflineIngestPipeline */
export async function planPs26ControlledIngest(params = {}) {
  const pipeline = await runPs26OfflineIngestPipeline(params);
  const textLen = pipeline.pdfExtraction?.fullTextLength ?? 0;
  return {
    ...pipeline,
    dryRun: true,
    globalCatalogueNote: 'regulatory_publications are global — no tenant obligations or changes',
    verifiedPdf: pipeline.verifiedPdf,
    pdfExtractionPreview: { textLength: textLen, pageCount: pipeline.pdfExtraction?.pageCount },
    tablesWritten: [
      'regulatory_publications',
      'regulatory_publication_versions',
      'regulatory_source_snapshots',
      'ingestion_runs',
      'ingestion_items',
      'regulatory_source_extraction_revisions (html_article_v2 + pdf_primary_v1)',
    ],
    hostedWriteRequired: true,
    idempotentWhen: 'existing publication source_hash matches primary PDF sha256',
  };
}

export async function runPs26OfflineIngestPipeline(params = {}) {
  const { loadPs26OfficialPdfBytes } = await import('./ps26-official-pdf-source.mjs');
  const loaded = await loadPs26OfficialPdfBytes({
    pdfPath: params.pdfPath,
    allowNetworkFetch: params.allowNetworkFetch === true,
  });
  const pdfBytes = loaded.pdfBytes;
  const verified = verifyPs26OfficialPdfBytes(pdfBytes);
  const extracted = await extractRegulatoryPdfContent(pdfBytes);
  if (!extracted.ok) {
    throw new Error(extracted.code || 'ps26_pdf_extract_failed');
  }
  const landing = buildPs26MinimalLanding(verified.sha256);
  return {
    mode: 'offline',
    globalCatalogue: true,
    tenantObligationsOrChangesTouched: false,
    stagingIdentity: PS26_1_STAGING,
    verifiedPdf: verified,
    landing,
    pdfExtraction: {
      pageCount: extracted.pageCount,
      extractionStatus: extracted.extractionStatus,
      derivedContentFingerprint: extracted.derivedContentFingerprint,
      parserVersion: extracted.parserVersion,
      fullTextLength: extracted.fullText?.length ?? 0,
    },
    collisionGuards: [
      'canonical_url conflict if external_document_id differs',
      'source_hash idempotent unchanged short-circuit',
      'extraction_revision_profile_conflict if fingerprint changes',
    ],
    hostedStepsWhenAuthorized: [
      'persistPs26ControlledCatalogue',
      'createExtractionRevision html_article_v2',
      'createPrimaryPdfExtractionRevision pdf_primary_v1',
    ],
    rollback: buildPs26RollbackSteps({}),
  };
}

/**
 * @param {import('pg').Client} client
 */
export async function persistPs26ControlledCatalogue(client, params) {
  if (params?.hostedWriteAuthorized !== true) {
    const err = new Error('ps26_hosted_persist_requires_hostedWriteAuthorized');
    err.offlinePlan = await runPs26OfflineIngestPipeline(params);
    throw err;
  }
  const [
    { insertRegulatorySourceSnapshotRow },
    { getSnapshotStorage },
    { resolveCatalogueIds },
    { buildContentAddressedKey },
  ] = await Promise.all([
    import('./persist-db.mjs'),
    import('./resolve-storage.mjs'),
    import('../resolve-ids.mjs'),
    import('./paths.mjs'),
  ]);
  const {
    pdfBytes,
    primaryPdfSha256,
    primaryPdfRetrievedAt,
    environment = 'staging',
    initiatedBy = 'ps26-1-controlled-ingest',
    uploadArtifacts = true,
  } = params;

  const verified = verifyPs26OfficialPdfBytes(pdfBytes);
  if (primaryPdfSha256 && primaryPdfSha256 !== verified.sha256) {
    throw new Error('ps26_primary_pdf_sha256_param_mismatch');
  }
  const versionSourceHash = verified.sha256;
  const landing = buildPs26MinimalLanding(versionSourceHash);

  const ids = await resolveCatalogueIds(client, PS26_1_STAGING.regulatorId, PS26_1_STAGING.sourceId);
  const canonicalUrl = PS26_1_STAGING.officialPdfUrl;
  const discoveryUrl = landing.finalUrl;

  const collision = await client.query(
    `select id, external_document_id from regulatory_publications
     where canonical_url = $1 and coalesce(external_document_id, '') <> $2`,
    [canonicalUrl, PS26_1_STAGING.externalDocumentId],
  );
  if (collision.rows.length) {
    const err = new Error('ps26_canonical_url_collision');
    err.details = collision.rows;
    throw err;
  }

  const running = await client.query(
    `select count(*)::int as n from ingestion_runs where status = 'RUNNING'::ingestion_run_status`,
  );
  if (running.rows[0]?.n > 0) {
    throw new Error('concurrent_running_ingestion');
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
    [ids.sourceUuid, PS26_1_STAGING.externalDocumentId],
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
        globalCatalogue: true,
      };
    }
  }

  const provenance = {
    controlledIngest: 'ps26-1-controlled-ingest',
    ingestionRunId: runId,
    primaryRegulatoryDocumentUrl: canonicalUrl,
    primaryRegulatoryDocumentSha256: versionSourceHash,
    discoveryHtmlUrl: discoveryUrl,
    discoveryHtmlFingerprint: landing.contentHash,
    htmlSnapshotRole: 'ps26_landing_index_only',
    versionIdentityAnchoredTo: 'primary_pdf_sha256',
    globalCatalogueVisibility: true,
  };

  let snapshotUpload = null;
  if (uploadArtifacts) {
    const storage = getSnapshotStorage({ environment });
    snapshotUpload = await uploadPs26DiscoverySnapshot(
      storage,
      {
        evidenceCapture: landing.evidenceCapture,
        connectorId: 'CONN-LEGACY-FCA',
        ingestionRunId: runId,
        discoveryFinalUrl: discoveryUrl,
        primaryPdfSha256: versionSourceHash,
      },
      buildContentAddressedKey,
    );
  } else {
    snapshotUpload = {
      paths: {
        raw: `pending://${landing.evidenceCapture.rawSha256}.raw.html`,
        html: `pending://${landing.evidenceCapture.normalisedHtmlSha256}.html`,
        text: `pending://${landing.evidenceCapture.normalisedTextSha256}.txt`,
        metadata: 'pending://meta.json',
      },
    };
  }

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
          PS26_1_STAGING.title,
          PS26_1_STAGING.publicationType,
          'Primary regulatory text is FCA PS26/1 PDF (Annex F CONC instrument); HTML is landing index only.',
          canonicalUrl,
          PS26_1_STAGING.publicationDate,
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
          PS26_1_STAGING.externalDocumentId,
          PS26_1_STAGING.title,
          PS26_1_STAGING.publicationType,
          'Primary regulatory text is FCA PS26/1 PDF (Annex F CONC instrument); HTML is landing index only.',
          canonicalUrl,
          PS26_1_STAGING.publicationDate,
          primaryPdfRetrievedAt || new Date().toISOString(),
          versionSourceHash,
          '1',
          PS26_1_STAGING.dataOrigin,
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
      licenceNotice: LICENCE_NOTICE,
      provenance: {
        ...provenance,
        snapshotCanonicalSemantics: 'ps26_landing_index_only',
        publicationCanonicalUrl: canonicalUrl,
      },
    });

    await client.query(
      `insert into ingestion_items (
        ingestion_run_id, source_id, external_document_id, canonical_url, title, publication_date,
        content_type, source_hash, retrieval_status, normalisation_status, publication_id, retrieved_at
      ) values ($1,$2,$3,$4,$5,$6::date,$7,$8,'RETRIEVED'::ingestion_item_retrieval_status,
        $9::ingestion_item_normalisation_status,$10,$11::timestamptz)`,
      [
        runId,
        ids.sourceUuid,
        PS26_1_STAGING.externalDocumentId,
        canonicalUrl,
        PS26_1_STAGING.title,
        PS26_1_STAGING.publicationDate,
        'application/pdf',
        versionSourceHash,
        metric === 'new' ? 'NEW' : 'UPDATED',
        publicationId,
        primaryPdfRetrievedAt || new Date().toISOString(),
      ],
    );

    await client.query('COMMIT');

    return {
      publicationId,
      publicationVersionId,
      snapshotId,
      runId,
      metric,
      globalCatalogue: true,
      rollback: buildPs26RollbackSteps({ publicationId, runId, snapshotId }),
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  }
}

/**
 * Html + pdf_primary_v1 revisions after catalogue persist (requires hosted DB).
 */
export async function persistPs26ExtractionRevisions(client, params) {
  if (params?.hostedWriteAuthorized !== true) {
    throw new Error('ps26_revisions_require_hostedWriteAuthorized');
  }
  const { createExtractionRevision } = await import('./create-extraction-revision.mjs');
  const { createPrimaryPdfExtractionRevision } = await import('./create-primary-pdf-extraction-revision.mjs');
  const { loadExtractionRevisionByProfile } = await import('./persist-extraction-revision.mjs');
  const { EXTRACTION_PROFILE_HTML_ARTICLE_V2 } = await import('./extraction-revision-types.mjs');
  const { snapshotId, pdfBytes, extracted, landing, environment = 'staging' } = params;
  const existingHtml = await loadExtractionRevisionByProfile(
    client,
    snapshotId,
    EXTRACTION_PROFILE_HTML_ARTICLE_V2,
  );
  let htmlRev;
  if (existingHtml) {
    htmlRev = { revisionId: existingHtml.id, outcome: 'idempotent_hit', created: false };
  } else {
    htmlRev = await createExtractionRevision(client, {
      sourceSnapshotId: snapshotId,
      rawBody: landing.evidenceCapture.rawBody,
      canonicalUrl: landing.finalUrl,
      createdBy: 'ps26-1-controlled-ingest',
      environment,
      upload: params.uploadArtifacts !== false,
      extractionQualityPatch: {
        obligationGradeSuitable: false,
        webpageExtraction: { status: 'complete', confidence: 'low', role: 'discovery_index' },
        signals: ['ps26_discovery_html_not_substantive'],
      },
      publicationMetadataPatch: { primaryDocumentUrl: PS26_1_STAGING.officialPdfUrl },
      provenancePatch: { htmlSnapshotRole: 'ps26_landing_index_only' },
    });
  }

  const existingPdf = await loadExtractionRevisionByProfile(client, snapshotId, 'pdf_primary_v1');
  let pdfRev;
  if (existingPdf) {
    pdfRev = { revisionId: existingPdf.id, outcome: 'idempotent_hit', created: false };
  } else {
    pdfRev = await createPrimaryPdfExtractionRevision(client, {
      sourceSnapshotId: snapshotId,
      pdfBytes,
      contentSha256: verifyPs26OfficialPdfBytes(pdfBytes).sha256,
      sourceUrl: PS26_1_STAGING.officialPdfUrl,
      extraction: extracted,
      environment,
      createdBy: 'ps26-1-controlled-ingest',
      upload: params.uploadArtifacts !== false,
    });
  }
  return { htmlRev, pdfRev, obligationGradeSuitable: false };
}
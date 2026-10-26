import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSourceById } from '../../../../../packages/reference-data/index.mjs';
import { assessSourceIngestionEligibility } from './eligibility.mjs';
import { retrieveNormalisedDocuments } from './adapter.mjs';
import { resolveCatalogueIds } from './resolve-ids.mjs';
import { markAnalysesOutdatedForPublicationVersionSql } from '../ai/freshness-sql.mjs';
import { isSnapshotPolicyEnabled } from './snapshot/policy.mjs';
import { validateSnapshotEvidence } from './snapshot/evidence-validate.mjs';
import { ensureSnapshotStorageReady, getSnapshotStorage } from './snapshot/runtime.mjs';
import { uploadSnapshotEvidence } from './snapshot/upload.mjs';
import { insertRegulatorySourceSnapshotRow } from './snapshot/persist-db.mjs';

const RAW_META_DIR = join(process.cwd(), '.local-ingestion-raw');

/**
 * @param {import('pg').Client} client
 * @param {object} params
 */
export async function runSourceIngestion(client, params) {
  const {
    sourceId,
    initiatedBy = 'cli',
    environment = 'local',
    runType = 'TEST',
    fixture,
    liveAllowed = false,
    maxItems = 3,
    existingRunId = null,
    triggerType = 'MANUAL',
    attemptNumber = 1,
  } = params;

  const catalogue = getSourceById(sourceId);
  if (!catalogue) {
    return {
      runId: null,
      status: 'FAILED',
      metrics: { discovered: 0, new: 0, updated: 0, unchanged: 0, failed: 0 },
      errorSummary: `unknown_source_${sourceId}`,
      eligibility: { eligible: false, reason: 'unknown_source_id' },
    };
  }
  const ids = await resolveCatalogueIds(client, catalogue.regulatorId, sourceId);

  const eligibility = assessSourceIngestionEligibility(sourceId, {
    ingestionMode: ids.ingestionMode,
    productionStatus: ids.productionStatus,
  });

  let runId = existingRunId;
  if (!runId) {
    const runInsert = await client.query(
      `insert into ingestion_runs (
        source_id, run_type, status, trigger_type, attempt_number, queued_at, started_at, initiated_by, environment
      ) values ($1, $2::ingestion_run_type, 'RUNNING'::ingestion_run_status, $3::ingestion_trigger_type, $4, now(), now(), $5, $6)
       returning id`,
      [ids.sourceUuid, runType, triggerType, attemptNumber, initiatedBy, environment],
    );
    runId = runInsert.rows[0].id;
  }

  const metrics = {
    discovered: 0,
    new: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
  };
  let runStatus = 'COMPLETED';
  let errorSummary = null;

  try {
    if (!eligibility.eligible) {
      throw new Error(`source_ineligible:${eligibility.reason}`);
    }

    await ensureSnapshotStorageReady({ environment });

    let documents;
    try {
      documents = await retrieveNormalisedDocuments(sourceId, {
        fixture,
        liveAllowed,
        maxItems,
      });
    } catch (e) {
      throw new Error(`retrieval_failed:${e.message}`);
    }

    metrics.discovered = documents.length;

    for (const doc of documents) {
      const itemResult = await processDocument(client, {
        runId,
        sourceUuid: ids.sourceUuid,
        regulatorUuid: ids.regulatorUuid,
        doc,
        eligibility,
        environment,
      });
      if (itemResult.metric === 'failed') metrics.failed += 1;
      else metrics[itemResult.metric] += 1;
    }
  } catch (e) {
    runStatus = 'FAILED';
    errorSummary = e.message;
    if (metrics.discovered > 0 && metrics.failed < metrics.discovered) {
      runStatus = 'PARTIAL';
    }
  }

  await client.query(
    `update ingestion_runs set
      status = $2::ingestion_run_status,
      completed_at = now(),
      records_discovered = $3,
      records_new = $4,
      records_updated = $5,
      records_unchanged = $6,
      records_failed = $7,
      error_summary = $8
     where id = $1`,
    [
      runId,
      runStatus,
      metrics.discovered,
      metrics.new,
      metrics.updated,
      metrics.unchanged,
      metrics.failed,
      errorSummary,
    ],
  );

  return { runId, status: runStatus, metrics, errorSummary, eligibility };
}

async function processDocument(client, ctx) {
  const { runId, sourceUuid, regulatorUuid, doc, eligibility, environment = 'local' } = ctx;
  const itemBase = {
    runId,
    sourceUuid,
    doc,
  };
  const snapshotRequired = isSnapshotPolicyEnabled(doc);
  const useTxn = snapshotRequired;

  if (doc.contentClasses?.includes('SANCTIONS_DATA')) {
    await insertItem(client, itemBase, {
      retrieval: 'SKIPPED',
      normalisation: 'INELIGIBLE',
      error: 'sanctions_data_not_ri',
    });
    return { metric: 'failed' };
  }

  if (eligibility.horizonOnly && !eligibility.obligationGrade) {
    doc.publicationType = doc.publicationType || 'horizon_reference';
  }

  persistRawMeta(runId, doc);

  let existing = null;
  if (doc.externalDocumentId) {
    const r = await client.query(
      `select id, source_hash, source_version from regulatory_publications
       where source_id = $1 and external_document_id = $2`,
      [sourceUuid, doc.externalDocumentId],
    );
    existing = r.rows[0] || null;
  }
  if (!existing && doc.canonicalUrl) {
    const r = await client.query(
      `select id, source_hash, source_version from regulatory_publications
       where source_id = $1 and canonical_url = $2`,
      [sourceUuid, doc.canonicalUrl],
    );
    existing = r.rows[0] || null;
  }

  if (existing && existing.source_hash === doc.contentHash) {
    await insertItem(client, itemBase, {
      retrieval: 'RETRIEVED',
      normalisation: 'UNCHANGED',
      publicationId: existing.id,
    });
    return { metric: 'unchanged' };
  }

  if (snapshotRequired) {
    const evidenceCheck = validateSnapshotEvidence(doc);
    if (!evidenceCheck.ok) {
      await insertItem(client, itemBase, {
        retrieval: 'FAILED',
        normalisation: 'FAILED',
        error: evidenceCheck.code,
        publicationId: existing?.id ?? null,
      });
      return { metric: 'failed' };
    }
  }

  let snapshotUpload = null;
  if (snapshotRequired) {
    try {
      snapshotUpload = await uploadSnapshotEvidence(getSnapshotStorage({ environment }), {
        evidenceCapture: doc.evidenceCapture,
        contentHash: doc.contentHash,
        connectorId: doc.provenance?.connectorId ?? 'unknown',
        ingestionRunId: runId,
      });
    } catch (e) {
      await insertItem(client, itemBase, {
        retrieval: 'FAILED',
        normalisation: 'FAILED',
        error: `snapshot_upload_failed:${e.message}`,
        publicationId: existing?.id ?? null,
      });
      return { metric: 'failed' };
    }
  }

  if (useTxn) await client.query('BEGIN');
  try {
  if (existing) {
    const nextVersion = (parseInt(existing.source_version || '1', 10) || 1) + 1;
    const provenance = buildProvenance(runId, doc);
    await client.query(
      `update regulatory_publications set
        title = $2,
        publication_type = $3,
        summary = $4,
        canonical_url = $5,
        publication_date = $6::date,
        effective_date = $7::date,
        consultation_deadline = $8::date,
        retrieved_at = $9::timestamptz,
        source_hash = $10,
        source_version = $11,
        data_origin = $12,
        provenance = $13::jsonb,
        updated_at = now()
       where id = $1`,
      [
        existing.id,
        doc.title,
        doc.publicationType,
        doc.summary,
        doc.canonicalUrl,
        doc.publicationDate,
        doc.effectiveDate,
        doc.consultationDeadline,
        doc.retrievedAt,
        doc.contentHash,
        String(nextVersion),
        doc.dataOrigin,
        JSON.stringify(provenance),
      ],
    );
    const verIns = await client.query(
      `insert into regulatory_publication_versions
        (publication_id, version_number, source_hash, canonical_url, retrieved_at, ingestion_run_id, provenance)
       values ($1, $2, $3, $4, $5::timestamptz, $6, $7::jsonb)
       returning id`,
      [
        existing.id,
        nextVersion,
        doc.contentHash,
        doc.canonicalUrl,
        doc.retrievedAt,
        runId,
        JSON.stringify(provenance),
      ],
    );
    await markAnalysesOutdatedForPublicationVersionSql(client, existing.id, verIns.rows[0].id);
    if (snapshotRequired) {
      await insertSnapshotForVersion(client, {
        publicationId: existing.id,
        publicationVersionId: verIns.rows[0].id,
        runId,
        doc,
        snapshotUpload,
        versionNumber: nextVersion,
      });
    }
    const itemId = await insertItem(client, itemBase, {
      retrieval: 'RETRIEVED',
      normalisation: 'UPDATED',
      publicationId: existing.id,
    });
    if (snapshotRequired && itemId) {
      /* ingestion_item_id optional on snapshot — linked on next ingest enhancement */
    }
    if (useTxn) await client.query('COMMIT');
    return { metric: 'updated' };
  }

  const provenance = buildProvenance(runId, doc);
  const pub = await client.query(
    `insert into regulatory_publications (
      source_id, regulator_id, external_document_id, title, publication_type, summary,
      canonical_url, publication_date, effective_date, consultation_deadline,
      retrieved_at, source_hash, source_version, data_origin, provenance
    ) values ($1,$2,$3,$4,$5,$6,$7,$8::date,$9::date,$10::date,$11::timestamptz,$12,$13,$14,$15::jsonb)
    returning id`,
    [
      sourceUuid,
      regulatorUuid,
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
      JSON.stringify(provenance),
    ],
  );
  const publicationId = pub.rows[0].id;
  const verIns = await client.query(
    `insert into regulatory_publication_versions
      (publication_id, version_number, source_hash, canonical_url, retrieved_at, ingestion_run_id, provenance)
     values ($1, 1, $2, $3, $4::timestamptz, $5, $6::jsonb)
     returning id`,
    [publicationId, doc.contentHash, doc.canonicalUrl, doc.retrievedAt, runId, JSON.stringify(provenance)],
  );
  if (snapshotRequired) {
    await insertSnapshotForVersion(client, {
      publicationId,
      publicationVersionId: verIns.rows[0].id,
      runId,
      doc,
      snapshotUpload,
      versionNumber: 1,
    });
  }
  await insertItem(client, itemBase, {
    retrieval: 'RETRIEVED',
    normalisation: 'NEW',
    publicationId,
  });
  if (useTxn) await client.query('COMMIT');
  return { metric: 'new' };
  } catch (e) {
    if (useTxn) await client.query('ROLLBACK');
    if (snapshotRequired) {
      await insertItem(client, itemBase, {
        retrieval: 'FAILED',
        normalisation: 'FAILED',
        error: `snapshot_db_failed:${e.message}`,
        publicationId: existing?.id ?? null,
      });
      return { metric: 'failed' };
    }
    throw e;
  }
}

async function insertSnapshotForVersion(client, params) {
  const { publicationId, publicationVersionId, runId, doc, snapshotUpload } = params;
  const ec = doc.evidenceCapture;
  const snapshotId = await insertRegulatorySourceSnapshotRow(client, {
    publicationId,
    publicationVersionId,
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
      connectorId: doc.provenance?.connectorId,
      sourceId: doc.sourceId,
      regulatorId: doc.regulatorId,
      finalUrl: ec.finalUrl,
      snapshotUploadKind: 'content_addressed_v1',
    },
  });
  await client.query(
    `update regulatory_publication_versions
     set provenance = provenance || $2::jsonb
     where id = $1`,
    [publicationVersionId, JSON.stringify({ snapshotId, snapshotRetention: 'regulatory_source_snapshots' })],
  );
}

function buildProvenance(runId, doc) {
  return {
    ...doc.provenance,
    ingestionRunId: runId,
    regulatorId: doc.regulatorId,
    sourceId: doc.sourceId,
    canonicalUrl: doc.canonicalUrl,
    contentHash: doc.contentHash,
    retrievedAt: doc.retrievedAt,
    externalDocumentId: doc.externalDocumentId,
    contentClasses: doc.contentClasses ?? [],
  };
}

async function insertItem(client, base, state) {
  const res = await client.query(
    `insert into ingestion_items (
      ingestion_run_id, source_id, external_document_id, canonical_url, title, publication_date,
      content_type, source_hash, retrieval_status, normalisation_status, publication_id,
      error_detail, retrieved_at
    ) values ($1,$2,$3,$4,$5,$6::date,$7,$8,$9::ingestion_item_retrieval_status,$10::ingestion_item_normalisation_status,$11,$12,$13::timestamptz)
    returning id`,
    [
      base.runId,
      base.sourceUuid,
      base.doc.externalDocumentId,
      base.doc.canonicalUrl,
      base.doc.title,
      base.doc.publicationDate,
      base.doc.contentType || base.doc.publicationType,
      base.doc.contentHash,
      state.retrieval,
      state.normalisation,
      state.publicationId ?? null,
      state.error ?? null,
      base.doc.retrievedAt,
    ],
  );
  return res.rows[0]?.id ?? null;
}

function persistRawMeta(runId, doc) {
  try {
    mkdirSync(RAW_META_DIR, { recursive: true });
    const key = `${doc.sourceId}-${doc.externalDocumentId || 'url'}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    writeFileSync(
      join(RAW_META_DIR, `${runId}-${key}.meta.json`),
      JSON.stringify(
        {
          runId,
          title: doc.title,
          canonicalUrl: doc.canonicalUrl,
          contentHash: doc.contentHash,
          retrievedAt: doc.retrievedAt,
        },
        null,
        2,
      ),
    );
  } catch {
    /* local-only best effort */
  }
}

/** Direct ingest for harness (skip eligibility/mode when testing version paths). */
export async function ingestDocumentsForTest(client, params) {
  const { sourceId, regulatorId, runType = 'TEST', initiatedBy = 'harness', documents } = params;
  const ids = await resolveCatalogueIds(client, regulatorId, sourceId);
  const runInsert = await client.query(
    `insert into ingestion_runs (source_id, run_type, status, started_at, initiated_by, environment)
     values ($1, $2::ingestion_run_type, 'RUNNING'::ingestion_run_status, now(), $3, 'local')
     returning id`,
    [ids.sourceUuid, runType, initiatedBy],
  );
  const runId = runInsert.rows[0].id;
  const metrics = { discovered: documents.length, new: 0, updated: 0, unchanged: 0, failed: 0 };
  const eligibility = assessSourceIngestionEligibility(sourceId, {
    ingestionMode: 'TEST_ONLY',
    productionStatus: ids.productionStatus,
  });
  for (const doc of documents) {
    const r = await processDocument(client, {
      runId,
      sourceUuid: ids.sourceUuid,
      regulatorUuid: ids.regulatorUuid,
      doc,
      eligibility,
      environment: 'local',
    });
    metrics[r.metric] += 1;
  }
  await client.query(
    `update ingestion_runs set status = 'COMPLETED'::ingestion_run_status, completed_at = now(),
      records_discovered = $2, records_new = $3, records_updated = $4, records_unchanged = $5, records_failed = $6
     where id = $1`,
    [runId, metrics.discovered, metrics.new, metrics.updated, metrics.unchanged, metrics.failed],
  );
  return { runId, metrics };
}

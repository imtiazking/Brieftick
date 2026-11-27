import { httpGet } from '../../../../../../integrations/regulatory-sources/core/http-client.mjs';
import { fingerprintContent } from '../../../../../../integrations/regulatory-sources/core/fingerprint.mjs';
import { buildEvidenceCapture } from '../../../../../../integrations/regulatory-sources/core/evidence-capture.mjs';
import { assertUrlAllowed } from '../../../../../../integrations/regulatory-sources/core/url-safety.mjs';
import { throttleHost } from '../../../../../../integrations/regulatory-sources/core/rate-limiter.mjs';
import { ensureSnapshotStorageReady, getSnapshotStorage } from '../snapshot/resolve-storage.mjs';
import { uploadSnapshotEvidence } from '../snapshot/upload.mjs';
import { insertRegulatorySourceSnapshotRow } from '../snapshot/persist-db.mjs';
import { createExtractionRevision } from '../snapshot/create-extraction-revision.mjs';
import { resolveAllowedHostsForPublication } from './resolve-allowed-hosts.mjs';
import {
  selectCorpusBackfillCandidates,
  selectSnapshotsNeedingHtmlExtraction,
} from './select-backfill-candidates.mjs';

const CONNECTOR_ID = 'CONN-CORPUS-BACKFILL';

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function createBackfillRun(client, sourceUuid) {
  const res = await client.query(
    `insert into ingestion_runs (
      source_id, run_type, status, trigger_type, attempt_number, queued_at, started_at, completed_at,
      initiated_by, environment, records_discovered, records_new
    ) values ($1, 'MANUAL'::ingestion_run_type, 'COMPLETED'::ingestion_run_status, 'MANUAL'::ingestion_trigger_type,
      1, now(), now(), now(), 'corpus-snapshot-backfill', 'staging', 0, 0)
     returning id`,
    [sourceUuid],
  );
  return res.rows[0].id;
}

/**
 * @param {import('pg').Client} client
 * @param {object} pub row from selectCorpusBackfillCandidates
 */
export async function backfillPublicationSnapshot(client, pub) {
  const allowedHosts = resolveAllowedHostsForPublication({
    canonicalUrl: pub.canonical_url,
    sourceExternalKey: pub.source_key,
  });
  if (!allowedHosts.length) {
    return { publicationId: pub.id, ok: false, code: 'ALLOWED_HOSTS_EMPTY' };
  }
  const gate = assertUrlAllowed(pub.canonical_url, allowedHosts);
  if (!gate.ok) {
    return { publicationId: pub.id, ok: false, code: gate.code || 'URL_NOT_ALLOWED' };
  }

  if (pub.canonical_is_pdf) {
    return { publicationId: pub.id, ok: false, code: 'PDF_CANONICAL_DEFERRED' };
  }

  await throttleHost(gate.url.hostname);
  await sleep(800);
  const res = await httpGet(pub.canonical_url, { allowedHosts });
  if (!res.ok) {
    return {
      publicationId: pub.id,
      ok: false,
      code: res.code || 'FETCH_FAILED',
      httpStatus: res.httpStatus ?? null,
      detail: res.message,
    };
  }

  const contentType = String(res.contentType || '').toLowerCase();
  if (contentType && !contentType.includes('html') && !contentType.includes('xml')) {
    return { publicationId: pub.id, ok: false, code: 'NON_HTML_CONTENT', contentType };
  }

  const fp = await fingerprintContent(res.body, { contentType: res.contentType });
  const evidenceCapture = await buildEvidenceCapture({
    body: res.body,
    contentType: res.contentType,
    finalUrl: res.finalUrl || pub.canonical_url,
    connectorId: CONNECTOR_ID,
  });
  if (!evidenceCapture?.rawBody?.length) {
    return { publicationId: pub.id, ok: false, code: 'EVIDENCE_EMPTY' };
  }

  const runId = await createBackfillRun(client, pub.source_id);
  const pubRow = await client.query(
    `select p.id, p.source_hash, p.canonical_url,
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
  let versionNumber = row.version_number;
  const retrievedAt = new Date().toISOString();

  await client.query('BEGIN');
  try {
    if (row.source_hash !== fp.hash) {
      const nextVersion = (parseInt(row.version_number, 10) || 1) + 1;
      await client.query(
        `update regulatory_publications set
          source_hash = $2, source_version = $3::text, retrieved_at = $4::timestamptz, updated_at = now()
         where id = $1`,
        [pub.id, fp.hash, String(nextVersion), retrievedAt],
      );
      const verIns = await client.query(
        `insert into regulatory_publication_versions
          (publication_id, version_number, source_hash, canonical_url, retrieved_at, ingestion_run_id, provenance)
         values ($1, $2, $3, $4, $5::timestamptz, $6, $7::jsonb)
         returning id`,
        [
          pub.id,
          nextVersion,
          fp.hash,
          pub.canonical_url,
          retrievedAt,
          runId,
          JSON.stringify({ corpusBackfill: true, priorHash: row.source_hash }),
        ],
      );
      versionId = verIns.rows[0].id;
      versionNumber = nextVersion;
    }

    await ensureSnapshotStorageReady({ environment: 'staging' });
    const storage = getSnapshotStorage({ environment: 'staging' });
    const uploaded = await uploadSnapshotEvidence(storage, {
      evidenceCapture,
      contentHash: fp.hash,
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
      sourceFingerprint: fp.hash,
      fingerprintAlgorithm: evidenceCapture.fingerprint.algorithm,
      fingerprintNormalisation: evidenceCapture.fingerprint.normalisation,
      rawContentSha256: evidenceCapture.rawSha256,
      normalisedHtmlSha256: evidenceCapture.normalisedHtmlSha256,
      normalisedTextSha256: evidenceCapture.normalisedTextSha256,
      rawStoragePath: uploaded.paths.raw,
      normalisedHtmlStoragePath: uploaded.paths.html,
      normalisedTextStoragePath: uploaded.paths.text,
      metadataStoragePath: uploaded.paths.metadata,
      contentType: evidenceCapture.contentType,
      byteSizeRaw: evidenceCapture.rawBody.length,
      byteSizeNormalisedHtml: Buffer.byteLength(evidenceCapture.normalisedArticleHtml, 'utf8'),
      byteSizeNormalisedText: Buffer.byteLength(evidenceCapture.normalisedArticleText, 'utf8'),
      licenceNotice: uploaded.licenceNotice,
      provenance: {
        corpusBackfill: true,
        connectorId: CONNECTOR_ID,
        finalUrl: evidenceCapture.finalUrl,
        versionNumber,
      },
    });

    await client.query('COMMIT');

    const revision = await createExtractionRevision(client, {
      sourceSnapshotId: snapshotId,
      rawBody: evidenceCapture.rawBody,
      canonicalUrl: pub.canonical_url,
      createdBy: 'corpus-snapshot-backfill',
      environment: 'staging',
    });

    return {
      publicationId: pub.id,
      ok: true,
      snapshotId,
      revisionId: revision.revisionId,
      hashUpdated: row.source_hash !== fp.hash,
      extractionCreated: revision.created,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    return {
      publicationId: pub.id,
      ok: false,
      code: 'BACKFILL_TX_FAILED',
      detail: String(e.message || e).slice(0, 240),
    };
  }
}

/**
 * @param {import('pg').Client} client
 * @param {{ maxPublications?: number, maxReDerives?: number }} [options]
 */
export async function runCorpusSnapshotBackfillBatch(client, options = {}) {
  await ensureSnapshotStorageReady({ environment: 'staging' });
  const maxPubs = Math.min(Math.max(options.maxPublications ?? 2, 0), 5);
  const maxRe = Math.min(Math.max(options.maxReDerives ?? 2, 0), 5);
  const outcomes = [];

  const rederiveRows = await selectSnapshotsNeedingHtmlExtraction(client, maxRe);
  for (const row of rederiveRows) {
    try {
      const { downloadSnapshotRawBody } = await import('../snapshot/download-snapshot-raw.mjs');
      const rawBody = await downloadSnapshotRawBody(client, row.snapshot_id);
      const revision = await createExtractionRevision(client, {
        sourceSnapshotId: row.snapshot_id,
        rawBody,
        canonicalUrl: row.canonical_url,
        createdBy: 'corpus-snapshot-rederive',
        environment: 'staging',
      });
      outcomes.push({
        mode: 'rederive',
        publicationId: row.publication_id,
        snapshotId: row.snapshot_id,
        ok: true,
        revisionId: revision.revisionId,
      });
    } catch (e) {
      outcomes.push({
        mode: 'rederive',
        publicationId: row.publication_id,
        snapshotId: row.snapshot_id,
        ok: false,
        code: 'REDERIVE_FAILED',
        detail: String(e.message || e).slice(0, 200),
      });
    }
  }

  const candidates = await selectCorpusBackfillCandidates(client, maxPubs);
  for (const pub of candidates) {
    const result = await backfillPublicationSnapshot(client, pub);
    outcomes.push({ mode: 'snapshot', ...result });
    await sleep(1200);
  }

  const counts = await client.query(
    `select
      (select count(*)::int from regulatory_publications) as publications,
      (select count(distinct publication_id)::int from regulatory_source_snapshots) as pubs_with_snapshot,
      (select count(*)::int from regulatory_source_snapshots) as snapshots,
      (select count(distinct publication_id)::int from regulatory_source_extraction_revisions where extraction_profile = 'html_article_v2') as pubs_html_v2`,
  );

  return {
    attempted: outcomes.length,
    outcomes,
    coverage: counts.rows[0],
    remainingWithoutSnapshot:
      (counts.rows[0]?.publications ?? 0) - (counts.rows[0]?.pubs_with_snapshot ?? 0),
  };
}
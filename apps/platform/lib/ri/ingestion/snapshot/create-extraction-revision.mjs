import { createHash } from 'node:crypto';
import { rederiveExtractionV2FromRaw } from '../../../../../../integrations/regulatory-sources/core/evidence-capture-v2.mjs';
import { EXTRACTION_PROFILE_HTML_ARTICLE_V2 } from './extraction-revision-types.mjs';
import {
  assertRegulatoryEvidenceUnchanged,
  buildExtractionRevisionProvenance,
} from './extraction-revision-rules.mjs';
import { uploadExtractionRevisionArtefacts } from './upload-extraction-revision.mjs';
import { insertExtractionRevisionRow, loadExtractionRevisionByProfile } from './persist-extraction-revision.mjs';
import { getSnapshotStorage } from './resolve-storage.mjs';
import { revisionDerivedOutputMatches } from './extraction-revision-compare.mjs';
import { identifyOrphanedExtractionRevisionArtefacts } from './extraction-revision-orphans.mjs';

function sha256Buffer(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

async function loadSnapshotContext(client, sourceSnapshotId) {
  const snap = await client.query(
    `select s.*, v.source_hash as version_source_hash
     from regulatory_source_snapshots s
     join regulatory_publication_versions v on v.id = s.publication_version_id
     where s.id = $1`,
    [sourceSnapshotId],
  );
  if (!snap.rows[0]) {
    throw new Error('extraction_revision_snapshot_not_found');
  }
  const row = snap.rows[0];
  return {
    snapshot: row,
    version: { id: row.publication_version_id, source_hash: row.version_source_hash },
  };
}

/**
 * Create or return existing extraction revision (idempotent per snapshot + profile).
 * Does not modify regulatory_publication_versions or source_hash.
 *
 * @param {import('pg').Client} client
 * @param {object} params
 * @param {string} params.sourceSnapshotId
 * @param {Buffer} params.rawBody verified immutable raw bytes
 * @param {string} [params.extractionProfile]
 * @param {string} [params.createdBy]
 * @param {string} [params.canonicalUrl]
 * @param {boolean} [params.upload=true]
 * @param {object} [params.extractionQualityPatch] merged onto derived extraction_quality at INSERT
 * @param {object} [params.publicationMetadataPatch] merged onto derived publication_metadata at INSERT
 * @param {object} [params.provenancePatch] merged onto revision provenance at INSERT
 * @param {object} [params.acceptanceHooks] test-only hooks (beforeInsert throws to simulate DB failure)
 */
export async function createExtractionRevision(client, params) {
  const extractionProfile = params.extractionProfile || EXTRACTION_PROFILE_HTML_ARTICLE_V2;
  const { snapshot, version } = await loadSnapshotContext(client, params.sourceSnapshotId);

  assertRegulatoryEvidenceUnchanged(snapshot, version);

  const rawSha = sha256Buffer(params.rawBody);
  if (rawSha !== snapshot.raw_content_sha256) {
    throw new Error('extraction_revision_raw_sha_mismatch');
  }

  const derived = await rederiveExtractionV2FromRaw(params.rawBody, {
    contentType: snapshot.content_type || 'text/html',
    finalUrl: params.canonicalUrl || snapshot.canonical_url,
    connectorId: 'CONN-LEGACY-FCA',
  });

  if (!derived.fingerprintV2?.hash || !derived.normalisedArticleHtmlV2) {
    throw new Error(`extraction_revision_derive_failed:${derived.fingerprintV2?.error || 'unknown'}`);
  }

  if (
    derived.extractionQuality?.obligationGradeSuitable === true &&
    derived.extractionQuality?.primaryDocument?.completeness === 'not_captured'
  ) {
    throw new Error('extraction_revision_obligation_grade_inconsistent_with_primary_pdf');
  }

  const derivedOutput = {
    rawContentSha256: rawSha,
    derivedContentFingerprint: derived.fingerprintV2.hash,
    normalisedHtmlSha256: derived.normalisedHtmlV2Sha256,
    normalisedTextSha256: derived.normalisedTextV2Sha256,
  };

  const existingRevision = await loadExtractionRevisionByProfile(
    client,
    params.sourceSnapshotId,
    extractionProfile,
  );
  if (existingRevision) {
    if (!revisionDerivedOutputMatches(existingRevision, derivedOutput)) {
      const err = new Error('extraction_revision_profile_conflict');
      err.code = 'extraction_revision_profile_conflict';
      throw err;
    }
    return {
      revisionId: existingRevision.id,
      created: false,
      outcome: 'idempotent_hit',
      derivedContentFingerprint: derived.fingerprintV2.hash,
      extractionQuality: derived.extractionQuality,
      storagePaths: {
        html: existingRevision.normalised_html_storage_path,
        text: existingRevision.normalised_text_storage_path,
        metadata: existingRevision.derived_metadata_storage_path,
      },
      obligationGradeSuitable: derived.extractionQuality?.obligationGradeSuitable === true,
    };
  }

  const provenance = {
    ...buildExtractionRevisionProvenance('create', {
      sourceSnapshotId: params.sourceSnapshotId,
      extractionProfile,
      initiatedBy: params.createdBy || 'extraction-revision',
    }),
    ...(params.provenancePatch && typeof params.provenancePatch === 'object' ? params.provenancePatch : {}),
  };

  const extractionQualityForInsert = {
    ...(derived.extractionQuality || {}),
    ...(params.extractionQualityPatch && typeof params.extractionQualityPatch === 'object'
      ? params.extractionQualityPatch
      : {}),
  };
  const publicationMetadataForInsert = {
    ...(derived.publicationMetadata || {}),
    ...(params.publicationMetadataPatch && typeof params.publicationMetadataPatch === 'object'
      ? params.publicationMetadataPatch
      : {}),
  };

  let uploadResult = null;
  if (params.upload !== false) {
    const storage = getSnapshotStorage({ environment: params.environment || 'local' });
    uploadResult = await uploadExtractionRevisionArtefacts(storage, {
      normalisedArticleHtmlV2: derived.normalisedArticleHtmlV2,
      normalisedArticleTextV2: derived.normalisedArticleTextV2,
      extractionQuality: extractionQualityForInsert,
      publicationMetadata: publicationMetadataForInsert,
      pdfAttachments: derived.pdfAttachments || [],
      sourceSnapshotId: params.sourceSnapshotId,
      extractionProfile,
      derivedContentFingerprint: derived.fingerprintV2.hash,
      provenance,
    });
  } else {
    uploadResult = {
      paths: {
        html: `pending://${derived.normalisedHtmlV2Sha256}.article.v2.norm.html`,
        text: `pending://${derived.normalisedTextV2Sha256}.article.v2.txt`,
        metadata: `pending://extraction-revision.meta.json`,
      },
      normalisedHtmlSha256: derived.normalisedHtmlV2Sha256,
      normalisedTextSha256: derived.normalisedTextV2Sha256,
    };
  }

  /** @type {{ html: string, text: string, metadata: string } | null} */
  let uploadedPaths = uploadResult?.paths || null;

  await client.query('BEGIN');
  try {
    if (params.acceptanceHooks?.beforeInsert) {
      await params.acceptanceHooks.beforeInsert();
    }

    const versionBefore = await client.query(
      `select source_hash, version_number from regulatory_publication_versions where id = $1`,
      [snapshot.publication_version_id],
    );
    const pubBefore = await client.query(
      `select source_hash, source_version from regulatory_publications where id = $1`,
      [snapshot.publication_id],
    );

    const insert = await insertExtractionRevisionRow(client, {
      sourceSnapshotId: params.sourceSnapshotId,
      publicationId: snapshot.publication_id,
      publicationVersionId: snapshot.publication_version_id,
      rawContentSha256: rawSha,
      extractionProfile,
      derivedContentFingerprint: derived.fingerprintV2.hash,
      normalisedHtmlSha256: uploadResult.normalisedHtmlSha256,
      normalisedTextSha256: uploadResult.normalisedTextSha256,
      normalisedHtmlStoragePath: uploadResult.paths.html,
      normalisedTextStoragePath: uploadResult.paths.text,
      derivedMetadataStoragePath: uploadResult.paths.metadata,
      extractionQuality: extractionQualityForInsert,
      publicationMetadata: publicationMetadataForInsert,
      pdfAttachments: derived.pdfAttachments,
      provenance,
      createdBy: params.createdBy || 'extraction-revision',
    });

    const versionAfter = await client.query(
      `select source_hash, version_number from regulatory_publication_versions where id = $1`,
      [snapshot.publication_version_id],
    );
    const pubAfter = await client.query(
      `select source_hash, source_version from regulatory_publications where id = $1`,
      [snapshot.publication_id],
    );

    if (
      versionBefore.rows[0].source_hash !== versionAfter.rows[0].source_hash ||
      pubBefore.rows[0].source_hash !== pubAfter.rows[0].source_hash ||
      pubBefore.rows[0].source_version !== pubAfter.rows[0].source_version ||
      versionBefore.rows[0].version_number !== versionAfter.rows[0].version_number
    ) {
      throw new Error('extraction_revision_regulatory_state_mutated');
    }

    await client.query('COMMIT');
    return {
      revisionId: insert.id,
      created: insert.created,
      outcome: insert.outcome,
      derivedContentFingerprint: derived.fingerprintV2.hash,
      extractionQuality: extractionQualityForInsert,
      storagePaths: uploadResult.paths,
      obligationGradeSuitable: extractionQualityForInsert?.obligationGradeSuitable === true,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    if (uploadedPaths && params.upload !== false) {
      const storage = getSnapshotStorage({ environment: params.environment || 'local' });
      const orphanReport = await identifyOrphanedExtractionRevisionArtefacts({
        storage,
        client,
        storagePaths: uploadedPaths,
        sourceSnapshotId: params.sourceSnapshotId,
        extractionProfile,
      });
      if (orphanReport.orphans.length) {
        e.orphanedExtractionRevisionArtefacts = orphanReport.orphans;
      }
    }
    throw e;
  }
}

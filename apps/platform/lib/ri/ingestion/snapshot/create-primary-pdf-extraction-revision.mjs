import { createHash } from 'node:crypto';
import { assessExtractionQuality } from '../../../../../../integrations/regulatory-sources/core/extraction-quality.mjs';
import { EXTRACTION_PROFILE_HTML_ARTICLE_V2, EXTRACTION_PROFILE_PDF_PRIMARY_V1 } from './extraction-revision-types.mjs';
import { buildExtractionRevisionProvenance } from './extraction-revision-rules.mjs';
import { uploadPrimaryPdfExtractionArtefacts } from './upload-primary-pdf-extraction.mjs';
import { insertExtractionRevisionRow, loadExtractionRevisionByProfile } from './persist-extraction-revision.mjs';
import { getSnapshotStorage } from './resolve-storage.mjs';
import { identifyOrphanedExtractionRevisionArtefacts } from './extraction-revision-orphans.mjs';
import { revisionDerivedOutputMatches } from './extraction-revision-compare.mjs';
import { assessObligationGradePosture } from './obligation-grade-policy.mjs';

async function loadSnapshotContext(client, sourceSnapshotId) {
  const snap = await client.query(
    `select s.*, v.source_hash as version_source_hash, rs.external_key as regulatory_source_external_key
     from regulatory_source_snapshots s
     join regulatory_publication_versions v on v.id = s.publication_version_id
     join regulatory_publications p on p.id = s.publication_id
     join regulatory_sources rs on rs.id = p.source_id
     where s.id = $1`,
    [sourceSnapshotId],
  );
  if (!snap.rows[0]) throw new Error('primary_pdf_snapshot_not_found');
  return snap.rows[0];
}

function sha256Utf8(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function resolvePrimaryPdfUrl(htmlRevisionRow, explicitUrl) {
  if (explicitUrl) return explicitUrl;
  const attachments = htmlRevisionRow?.pdf_attachments || [];
  const primary = attachments.find((p) => p.likelyPrimaryRegulatoryDocument);
  return primary?.url || null;
}

async function loadHtmlArticleV2Revision(client, sourceSnapshotId) {
  const res = await client.query(
    `select id, pdf_attachments, extraction_quality, publication_metadata
     from regulatory_source_extraction_revisions
     where source_snapshot_id = $1 and extraction_profile = $2`,
    [sourceSnapshotId, EXTRACTION_PROFILE_HTML_ARTICLE_V2],
  );
  return res.rows[0] || null;
}

/**
 * Create pdf_primary_v1 extraction revision (idempotent per snapshot + profile).
 * Does not modify html_article_v2 row or regulatory publication versions.
 *
 * @param {import('pg').Client} client
 * @param {object} params
 * @param {string} params.sourceSnapshotId
 * @param {Buffer} params.pdfBytes verified immutable PDF bytes
 * @param {string} params.contentSha256
 * @param {string} params.sourceUrl
 * @param {object} params.extraction derived from extractRegulatoryPdfContent
 * @param {string} [params.createdBy]
 * @param {boolean} [params.upload=true]
 */
export async function createPrimaryPdfExtractionRevision(client, params) {
  const snapshot = await loadSnapshotContext(client, params.sourceSnapshotId);
  const htmlRevision = await loadHtmlArticleV2Revision(client, params.sourceSnapshotId);
  if (!htmlRevision) {
    throw new Error('primary_pdf_requires_html_article_v2_revision');
  }

  const expectedUrl = resolvePrimaryPdfUrl(htmlRevision, params.sourceUrl);
  if (!expectedUrl) throw new Error('primary_pdf_url_not_discovered');

  const pdfSha = params.contentSha256;
  if (!pdfSha || params.pdfBytes.length < 5) {
    throw new Error('primary_pdf_invalid_bytes');
  }

  const extractionProfile = EXTRACTION_PROFILE_PDF_PRIMARY_V1;
  const structuredSha256 = sha256Utf8(JSON.stringify(params.extraction.structured));
  const textSha256 = sha256Utf8(params.extraction.fullText);
  const derivedOutput = {
    rawContentSha256: pdfSha,
    derivedContentFingerprint: params.extraction.derivedContentFingerprint,
    normalisedHtmlSha256: structuredSha256,
    normalisedTextSha256: textSha256,
  };

  const existing = await loadExtractionRevisionByProfile(client, params.sourceSnapshotId, extractionProfile);
  if (existing) {
    if (!revisionDerivedOutputMatches(existing, derivedOutput)) {
      const err = new Error('extraction_revision_profile_conflict');
      err.code = 'extraction_revision_profile_conflict';
      throw err;
    }
    return {
      revisionId: existing.id,
      created: false,
      outcome: 'idempotent_hit',
      extractionProfile,
      derivedContentFingerprint: params.extraction.derivedContentFingerprint,
      obligationGradeSuitable:
        htmlRevision.extraction_quality?.obligationGradeSuitable === true &&
        params.extraction.extractionStatus === 'complete',
    };
  }

  const publicationMetadata = params.publicationMetadata || htmlRevision.publication_metadata || {};
  const extractionQuality =
    params.extractionQuality ||
    buildPrimaryPdfExtractionQuality(htmlRevision.extraction_quality, params.extraction);

  const provenance = buildExtractionRevisionProvenance('create', {
    sourceSnapshotId: params.sourceSnapshotId,
    extractionProfile,
    initiatedBy: params.createdBy || 'primary-pdf-ingest',
    relatedHtmlRevisionId: htmlRevision.id,
    primaryPdfSourceUrl: expectedUrl,
  });

  let uploadResult = null;
  let uploadedPaths = null;
  if (params.upload !== false) {
    const storage = getSnapshotStorage({ environment: params.environment || 'local' });
    uploadResult = await uploadPrimaryPdfExtractionArtefacts(storage, {
      pdfBytes: params.pdfBytes,
      fullText: params.extraction.fullText,
      structuredExtraction: params.extraction.structured,
      extractionQuality,
      publicationMetadata,
      sourceSnapshotId: params.sourceSnapshotId,
      extractionProfile,
      derivedContentFingerprint: params.extraction.derivedContentFingerprint,
      provenance,
      sourceUrl: expectedUrl,
      contentSha256: pdfSha,
    });
    uploadedPaths = uploadResult.paths;
  } else {
    uploadResult = {
      paths: {
        pdf: `pending://${pdfSha}.primary.pdf`,
        structured: `pending://${structuredSha256}.pdf.structured.json`,
        text: `pending://${textSha256}.pdf.extracted.txt`,
        metadata: 'pending://extraction-revision.meta.json',
      },
      structuredSha256,
      textSha256,
    };
  }

  await client.query('BEGIN');
  try {
    const insert = await insertExtractionRevisionRow(client, {
      sourceSnapshotId: params.sourceSnapshotId,
      publicationId: snapshot.publication_id,
      publicationVersionId: snapshot.publication_version_id,
      rawContentSha256: pdfSha,
      extractionProfile,
      extractionAlgorithm: params.extraction.parserVersion || 'pdf-text-v1',
      derivedContentFingerprint: params.extraction.derivedContentFingerprint,
      normalisedHtmlSha256: uploadResult.structuredSha256,
      normalisedTextSha256: uploadResult.textSha256,
      normalisedHtmlStoragePath: uploadResult.paths.structured,
      normalisedTextStoragePath: uploadResult.paths.text,
      derivedMetadataStoragePath: uploadResult.paths.metadata,
      extractionQuality,
      publicationMetadata,
      pdfAttachments: [
        {
          url: expectedUrl,
          likelyPrimaryRegulatoryDocument: true,
          contentSha256: pdfSha,
          storagePath: uploadResult.paths.pdf,
          captured: true,
        },
      ],
      provenance,
      createdBy: params.createdBy || 'primary-pdf-ingest',
    });
    await client.query('COMMIT');
    return {
      revisionId: insert.id,
      created: insert.created,
      outcome: insert.outcome,
      extractionProfile,
      derivedContentFingerprint: params.extraction.derivedContentFingerprint,
      storagePaths: uploadResult.paths,
      obligationGradeSuitable: extractionQuality.obligationGradeSuitable === true,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    if (uploadedPaths && params.upload !== false) {
      const storage = getSnapshotStorage({ environment: params.environment || 'local' });
      const orphanReport = await identifyOrphanedExtractionRevisionArtefacts({
        storage,
        client,
        storagePaths: {
          html: uploadedPaths.structured,
          text: uploadedPaths.text,
          metadata: uploadedPaths.metadata,
        },
        sourceSnapshotId: params.sourceSnapshotId,
        extractionProfile,
      });
      if (orphanReport.orphans.length) {
        e.orphanedPrimaryPdfArtefacts = orphanReport.orphans;
      }
    }
    throw e;
  }
}

/**
 * Merge html v2 + primary pdf quality for obligation-grade assessment.
 * @param {object} htmlQuality
 * @param {object} pdfExtractionResult
 */
export function buildPrimaryPdfExtractionQuality(htmlQuality, pdfExtractionResult) {
  const pdfAttachments = [{ likelyPrimaryRegulatoryDocument: true }];
  const merged = assessExtractionQuality({
    plainText: pdfExtractionResult.fullText,
    rawByteLength: pdfExtractionResult.structured?.metrics?.totalCharacters || 0,
    pdfAttachments,
    primaryPdfCaptured: pdfExtractionResult.extractionStatus === 'complete',
    publicationMetadata: {},
  });
  const primaryDocument = {
    classification: 'pdf_primary',
    primaryPdfCaptured: true,
    completeness: pdfExtractionResult.extractionStatus === 'complete' ? 'captured' : 'partial',
    parserVersion: pdfExtractionResult.parserVersion,
    pageCount: pdfExtractionResult.pageCount,
    extractionStatus: pdfExtractionResult.extractionStatus,
  };

  const obligationGradePolicy = assessObligationGradePosture(htmlQuality, {
    primaryDocument,
    webpageExtraction: htmlQuality?.webpageExtraction,
  });

  return {
    ...merged,
    webpageExtraction: htmlQuality?.webpageExtraction || merged.webpageExtraction,
    primaryDocument,
    technicalExtractionComplete: obligationGradePolicy.technicalExtractionComplete,
    obligationGradeSuitable: false,
    obligationGradePolicy,
    signals: [
      ...(htmlQuality?.signals || []).filter((s) => s !== 'primary_pdf_not_captured'),
      ...(pdfExtractionResult.warnings || []).map((w) => `pdf_${w}`),
      'obligation_grade_requires_human_approval',
    ],
  };
}

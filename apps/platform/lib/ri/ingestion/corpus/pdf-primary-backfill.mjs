import { retrieveRegulatoryPrimaryPdf } from '../../../../../../integrations/regulatory-sources/core/regulatory-pdf-retrieval.mjs';
import { extractRegulatoryPdfContent } from '../../../../../../integrations/regulatory-sources/core/regulatory-pdf-extract.mjs';
import { createPrimaryPdfExtractionRevision } from '../snapshot/create-primary-pdf-extraction-revision.mjs';
import { recordCorpusBackfillOutcome } from './corpus-failure-tracking.mjs';

/**
 * @param {import('pg').Client} client
 * @param {{ snapshot_id: string, publication_id: string, title?: string }} row
 */
export async function backfillPrimaryPdfForSnapshot(client, row) {
  const html = await client.query(
    `select id, pdf_attachments from regulatory_source_extraction_revisions
     where source_snapshot_id = $1 and extraction_profile = 'html_article_v2' limit 1`,
    [row.snapshot_id],
  );
  if (!html.rows[0]) {
    return {
      publicationId: row.publication_id,
      snapshotId: row.snapshot_id,
      ok: false,
      code: 'HTML_REVISION_MISSING',
    };
  }
  const attachments = html.rows[0].pdf_attachments || [];
  const primary = attachments.find((p) => p.likelyPrimaryRegulatoryDocument) || attachments[0];
  const pdfUrl = primary?.url;
  if (!pdfUrl) {
    const result = { publicationId: row.publication_id, snapshotId: row.snapshot_id, ok: false, code: 'NO_PDF_ATTACHMENT' };
    await recordCorpusBackfillOutcome(client, row.publication_id, { ok: false, code: 'NO_PDF_ATTACHMENT' });
    return result;
  }

  const retrieved = await retrieveRegulatoryPrimaryPdf(pdfUrl, { sourceExternalKey: row.source_key || undefined });
  if (!retrieved.ok) {
    const result = {
      publicationId: row.publication_id,
      snapshotId: row.snapshot_id,
      ok: false,
      code: retrieved.code || 'PDF_RETRIEVAL_FAILED',
      detail: retrieved.message,
    };
    await recordCorpusBackfillOutcome(client, row.publication_id, result);
    return result;
  }

  const extracted = await extractRegulatoryPdfContent(retrieved.body, { expectedTitle: row.title });
  if (!extracted.ok) {
    const result = {
      publicationId: row.publication_id,
      snapshotId: row.snapshot_id,
      ok: false,
      code: 'PDF_EXTRACT_FAILED',
      detail: extracted.message || extracted.reason || extracted.code,
    };
    await recordCorpusBackfillOutcome(client, row.publication_id, result);
    return result;
  }

  try {
    const revision = await createPrimaryPdfExtractionRevision(client, {
      sourceSnapshotId: row.snapshot_id,
      pdfBytes: retrieved.body,
      contentSha256: retrieved.sha256,
      sourceUrl: pdfUrl,
      extraction: extracted,
      createdBy: 'corpus-pdf-primary-backfill',
      environment: 'staging',
    });
    const result = {
      publicationId: row.publication_id,
      snapshotId: row.snapshot_id,
      ok: true,
      revisionId: revision.revisionId,
      pdfUrl,
    };
    await recordCorpusBackfillOutcome(client, row.publication_id, { ok: true });
    return result;
  } catch (e) {
    const result = {
      publicationId: row.publication_id,
      snapshotId: row.snapshot_id,
      ok: false,
      code: 'PDF_REVISION_FAILED',
      detail: String(e.message || e).slice(0, 200),
    };
    await recordCorpusBackfillOutcome(client, row.publication_id, result);
    return result;
  }
}
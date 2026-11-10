/**
 * FG22/5 discovery HTML evidence — insert-time semantics and fail-closed read-time classification.
 * Substantive FG22/5 text must come from verified pdf_primary_v1; hub HTML is discovery only.
 */
import { FG22_5_PRIMARY_PDF_URL } from '../../../../../../integrations/regulatory-sources/core/regulatory-pdf-allowlist.mjs';
import { FG22_5_STAGING } from './fg22-5-staging-identity.mjs';

const FG22_CONSUMER_DUTY_HUB_PATTERN = /consumer-duty\/publications-resources/i;

/**
 * Fields merged into the initial regulatory_source_extraction_revisions INSERT (append-only safe).
 */
export function buildFg22DiscoveryInsertFields() {
  return {
    extractionQuality: {
      obligationGradeSuitable: false,
      htmlSnapshotRole: 'fca_link_discovery_only',
      primaryDocument: {
        classification: 'pdf_primary',
        completeness: 'captured',
        primaryPdfUrl: FG22_5_PRIMARY_PDF_URL,
      },
      webpageExtraction: {
        status: 'incomplete',
        confidence: 'low',
        role: 'fca_link_discovery_only',
      },
    },
    publicationMetadata: {
      htmlSnapshotRole: 'fca_link_discovery_only',
      canonicalPublicationIdentity: FG22_5_PRIMARY_PDF_URL,
      substantiveRegulatoryTextMedium: 'pdf_primary_v1',
      discoveryHtmlPurpose: 'fca_official_link_index',
    },
    provenance: {
      fg22DiscoveryHtmlAtInsert: true,
      note: 'HTML revision is not substantive FG22/5 guidance; PDF extraction holds regulatory text.',
    },
  };
}

function isFg22PdfCanonicalPublication(publication) {
  if (!publication) return false;
  const ext = String(publication.external_document_id || '').trim();
  const canon = String(publication.canonical_url || '').trim();
  if (ext === FG22_5_STAGING.externalDocumentId) return true;
  if (canon === FG22_5_STAGING.canonicalPdfUrl || canon === FG22_5_PRIMARY_PDF_URL) return true;
  return /\/fg22-5\.pdf$/i.test(canon) && /FG22/i.test(`${publication.title || ''} ${ext}`);
}

/**
 * Fail-closed: never treat html_article_v2 on a PDF-canonical FG22/5 publication as substantive guidance.
 *
 * @param {object} publication regulatory_publications row (subset)
 * @param {object} [snapshot] regulatory_source_snapshots row (subset)
 * @param {object} [revisionRow] extraction revision row (optional metadata shortcut)
 */
export function classifyFg22HtmlArticleV2Evidence(publication, snapshot, revisionRow) {
  const stampedRole =
    revisionRow?.publication_metadata?.htmlSnapshotRole ||
    revisionRow?.extraction_quality?.htmlSnapshotRole ||
    null;
  if (stampedRole === 'fca_link_discovery_only') {
    return {
      discoveryOnly: true,
      code: 'html_discovery_index_not_substantive',
      reason: 'metadata_html_snapshot_role',
      classificationSource: 'revision_metadata',
    };
  }

  if (!isFg22PdfCanonicalPublication(publication)) {
    return { discoveryOnly: false, code: null, reason: 'not_fg22_pdf_canonical_publication' };
  }

  const hubSnapshot = snapshot?.canonical_url
    ? FG22_CONSUMER_DUTY_HUB_PATTERN.test(String(snapshot.canonical_url))
    : null;

  return {
    discoveryOnly: true,
    code: 'html_discovery_index_not_substantive',
    reason:
      hubSnapshot === true
        ? 'fg22_pdf_canonical_with_consumer_duty_hub_snapshot'
        : 'fg22_pdf_canonical_publication_identity',
    classificationSource: hubSnapshot === true ? 'publication_and_snapshot_identity' : 'publication_identity',
    snapshotCanonicalUrl: snapshot?.canonical_url || null,
  };
}

/**
 * @deprecated Append-only revisions cannot be UPDATEd. Use buildFg22DiscoveryInsertFields() at INSERT time.
 */
export async function applyFg22DiscoveryHtmlRevisionSemantics() {
  const err = new Error(
    'fg22_discovery_semantics_insert_only: discovery metadata must be supplied on createExtractionRevision INSERT; post-insert UPDATE violates extraction_revisions_append_only',
  );
  err.code = 'fg22_discovery_semantics_insert_only';
  throw err;
}

/**
 * Read-only recovery plan for partially completed FG22/5 controlled ingest.
 *
 * @param {import('pg').Client} client
 * @param {object} ctx
 * @param {string} [ctx.expectedPublicationId]
 * @param {string} [ctx.expectedSnapshotId]
 * @param {string} [ctx.expectedHtmlRevisionId]
 */
export async function assessFg22PartialIngestRecovery(client, ctx = {}) {
  let pub = null;
  if (ctx.expectedPublicationId) {
    pub = (
      await client.query(
        `select id, title, canonical_url, external_document_id, source_hash, source_version
         from regulatory_publications where id = $1`,
        [ctx.expectedPublicationId],
      )
    ).rows[0];
  }
  if (!pub) {
    pub = (
      await client.query(
        `select id, title, canonical_url, external_document_id, source_hash, source_version
         from regulatory_publications where external_document_id = $1 limit 1`,
        [FG22_5_STAGING.externalDocumentId],
      )
    ).rows[0];
  }

  let snapshot = null;
  if (pub) {
    if (ctx.expectedSnapshotId) {
      snapshot = (
        await client.query(
          `select id, publication_id, publication_version_id, canonical_url, source_fingerprint, raw_content_sha256
           from regulatory_source_snapshots where id = $1`,
          [ctx.expectedSnapshotId],
        )
      ).rows[0];
    }
    if (!snapshot) {
      snapshot = (
        await client.query(
          `select id, publication_id, publication_version_id, canonical_url, source_fingerprint, raw_content_sha256
           from regulatory_source_snapshots where publication_id = $1 order by retrieved_at desc limit 1`,
          [pub.id],
        )
      ).rows[0];
    }
  }

  let htmlRev = null;
  let pdfRev = null;
  if (snapshot) {
    htmlRev = (
      await client.query(
        `select id, extraction_profile, extraction_quality, publication_metadata, created_at
         from regulatory_source_extraction_revisions
         where source_snapshot_id = $1 and extraction_profile = 'html_article_v2'`,
        [snapshot.id],
      )
    ).rows[0];
    pdfRev = (
      await client.query(
        `select id, extraction_profile, created_at
         from regulatory_source_extraction_revisions
         where source_snapshot_id = $1 and extraction_profile = 'pdf_primary_v1'`,
        [snapshot.id],
      )
    ).rows[0];
  }

  const htmlClass = pub
    ? classifyFg22HtmlArticleV2Evidence(pub, snapshot, htmlRev)
    : { discoveryOnly: false, reason: 'publication_missing' };

  const actions = [];
  if (!pub) {
    actions.push({ step: 'cataloguePersist', action: 'INSERT', note: 'full controlled ingest' });
  } else {
    actions.push({
      step: 'cataloguePersist',
      action: 'SKIP',
      publicationId: pub.id,
      reason: 'reuse_existing_fg22_publication',
    });
  }
  if (!htmlRev) {
    actions.push({
      step: 'html_article_v2',
      action: 'INSERT',
      note: 'createExtractionRevision with buildFg22DiscoveryInsertFields (no post-insert UPDATE)',
    });
  } else {
    actions.push({
      step: 'html_article_v2',
      action: 'SKIP',
      revisionId: htmlRev.id,
      reason: 'preserve_existing_append_only_revision',
      failClosedReadClassification: htmlClass,
    });
  }
  if (!pdfRev) {
    actions.push({
      step: 'pdf_primary_v1',
      action: 'INSERT',
      note: 'createPrimaryPdfExtractionRevision against existing snapshot',
      snapshotId: snapshot?.id || null,
    });
  } else {
    actions.push({
      step: 'pdf_primary_v1',
      action: 'SKIP',
      revisionId: pdfRev.id,
      reason: 'pdf_revision_exists',
    });
  }

  return {
    publication: pub,
    snapshot,
    htmlRevision: htmlRev,
    pdfRevision: pdfRev,
    htmlEvidenceClassification: htmlClass,
    recoveryActions: actions,
    forbiddenOperations: ['UPDATE regulatory_source_extraction_revisions', 'DELETE existing revisions'],
    appendOnlyCompatible: true,
    readyForPdfOnlyContinuation: Boolean(pub && snapshot && htmlRev && !pdfRev),
  };
}

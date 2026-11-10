/**
 * Server-side html_article_v2 evidence for Ask RI (service role + private Storage).
 */
import { createHash } from 'node:crypto';
import { EXTRACTION_PROFILE_HTML_ARTICLE_V2 } from '../ingestion/snapshot/extraction-revision-types.mjs';
import { DEFAULT_SNAPSHOT_BUCKET } from '../ingestion/snapshot/staging-constants.mjs';
import { downloadPrivateStorageObject } from '../ingestion/snapshot/readonly-storage-download.mjs';
import {
  buildHtmlArticleEvidenceBlocks,
  buildPublicationHtmlEvidenceIndex,
} from './publication-html-evidence.mjs';
import { questionRequestsPdfSupplement } from './publication-question-scope.mjs';

const REVISION_COLUMNS = `id,
  publication_id,
  publication_version_id,
  source_snapshot_id,
  extraction_profile,
  raw_content_sha256,
  normalised_html_sha256,
  normalised_text_sha256,
  normalised_html_storage_path,
  normalised_text_storage_path,
  derived_metadata_storage_path,
  extraction_quality,
  publication_metadata,
  pdf_attachments`;

function sha256Buffer(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Resolve catalogue publications referenced as supplementary PDF guidance (e.g. FG22/5).
 * Returns ids distinct from primaryScopedIds.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} adminSupabase
 * @param {string} question
 * @param {string[]} primaryScopedIds
 * @param {object[]} htmlEvidenceLoaded
 */
export async function resolveSupplementaryPdfPublicationIds(
  adminSupabase,
  question,
  primaryScopedIds,
  htmlEvidenceLoaded = [],
) {
  const primary = new Set(primaryScopedIds || []);
  const needles = new Set();
  const q = String(question || '');
  if (/\bFG\s*22\s*\/\s*5\b/i.test(q) || /\bFG22\/5\b/i.test(q)) {
    needles.add('FG22/5');
    needles.add('fg22-5');
    needles.add('FG22');
  }
  if (questionRequestsPdfSupplement(q)) {
    needles.add('FG22/5');
  }
  for (const ev of htmlEvidenceLoaded) {
    const text = `${ev.normalisedArticleText || ''} ${JSON.stringify(ev.pdfAttachments || [])}`;
    if (/FG\s*22\s*\/\s*5|FG22\/5/i.test(text)) needles.add('FG22/5');
  }

  const resolved = new Set();
  for (const needle of needles) {
    const { data } = await adminSupabase
      .from('regulatory_publications')
      .select('id, title, external_document_id')
      .or(`title.ilike.%${needle}%,external_document_id.ilike.%${needle}%`)
      .limit(6);
    for (const row of data || []) {
      if (row.id && !primary.has(row.id)) resolved.add(row.id);
    }
  }
  return [...resolved];
}

async function fetchHtmlArticleV2RevisionRows(adminSupabase, publicationIds) {
  const { data: byPublicationId, error: byPubError } = await adminSupabase
    .from('regulatory_source_extraction_revisions')
    .select(REVISION_COLUMNS)
    .eq('extraction_profile', EXTRACTION_PROFILE_HTML_ARTICLE_V2)
    .in('publication_id', publicationIds)
    .order('created_at', { ascending: false })
    .limit(24);

  if (byPubError) {
    return { rows: [], error: byPubError, lookup: 'publication_id' };
  }
  if (byPublicationId?.length) {
    return { rows: byPublicationId, error: null, lookup: 'publication_id' };
  }

  const { data: versions, error: versionError } = await adminSupabase
    .from('regulatory_publication_versions')
    .select('id, publication_id, version_number')
    .in('publication_id', publicationIds)
    .order('version_number', { ascending: false })
    .limit(12);

  if (versionError) {
    return { rows: [], error: versionError, lookup: 'publication_version' };
  }
  const versionIds = [...new Set((versions || []).map((v) => v.id).filter(Boolean))];
  const versionIdToPublicationId = new Map((versions || []).map((v) => [v.id, v.publication_id]));
  if (!versionIds.length) {
    return { rows: [], error: null, lookup: 'publication_version', versionCount: 0 };
  }

  const { data: byVersionId, error: byVerError } = await adminSupabase
    .from('regulatory_source_extraction_revisions')
    .select(REVISION_COLUMNS)
    .eq('extraction_profile', EXTRACTION_PROFILE_HTML_ARTICLE_V2)
    .in('publication_version_id', versionIds)
    .order('created_at', { ascending: false })
    .limit(24);

  if (byVerError) {
    return { rows: [], error: byVerError, lookup: 'publication_version' };
  }
  const rows = (byVersionId || []).map((row) => {
    const publicationId = row.publication_id || versionIdToPublicationId.get(row.publication_version_id);
    return publicationId ? { ...row, publication_id: publicationId } : row;
  });
  return {
    rows,
    error: null,
    lookup: 'publication_version',
    versionCount: versionIds.length,
  };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} adminSupabase service role
 * @param {{ projectUrl: string, serviceRoleKey: string, publicationIds?: string[] }} options
 */
export async function loadPublicationHtmlEvidenceForAskRi(adminSupabase, options) {
  if (!adminSupabase) {
    return { evidence: [], errors: [{ code: 'admin_client_unavailable' }] };
  }

  const projectUrl = options.projectUrl?.trim();
  const serviceRoleKey = options.serviceRoleKey?.trim();
  if (!projectUrl || !serviceRoleKey) {
    return { evidence: [], errors: [{ code: 'storage_credentials_unavailable' }] };
  }

  if (!options.publicationIds?.length) {
    return {
      evidence: [],
      errors: [{ code: 'html_revision_query_zero_rows', message: 'No scoped publication ids for html_article_v2.' }],
    };
  }

  const revisionQuery = await fetchHtmlArticleV2RevisionRows(adminSupabase, options.publicationIds);
  if (revisionQuery.error) {
    return {
      evidence: [],
      errors: [{ code: 'html_revision_query_failed', message: revisionQuery.error.message }],
      lookup: revisionQuery.lookup,
    };
  }

  const rows = revisionQuery.rows;
  if (!rows?.length) {
    return {
      evidence: [],
      errors: [
        {
          code: 'html_revision_query_zero_rows',
          message: 'No html_article_v2 extraction revisions for scoped publications.',
          publicationIds: options.publicationIds,
          lookup: revisionQuery.lookup,
          publicationVersionCount: revisionQuery.versionCount ?? null,
        },
      ],
      lookup: revisionQuery.lookup,
    };
  }

  const latestByPublication = new Map();
  const preLoadErrors = [];
  for (const row of rows) {
    const publicationKey = row.publication_id;
    if (!publicationKey) {
      preLoadErrors.push({ code: 'html_revision_missing_publication_id', revisionId: row.id });
      continue;
    }
    if (!latestByPublication.has(publicationKey)) latestByPublication.set(publicationKey, row);
  }

  const publicationIds = [...latestByPublication.keys()];
  if (!publicationIds.length && rows.length) {
    return {
      evidence: [],
      errors: [
        {
          code: 'html_revision_rows_unmapped',
          message: 'html_article_v2 revision rows could not be mapped to publication_id.',
          revisionRowsFound: rows.length,
        },
        ...preLoadErrors,
      ],
      lookup: revisionQuery.lookup,
      revisionRowsFound: rows.length,
      versionCount: revisionQuery.versionCount ?? null,
    };
  }
  const { data: pubs, error: pubError } = await adminSupabase
    .from('regulatory_publications')
    .select(
      `id, title, canonical_url, publication_type, external_document_id, data_origin,
      regulator:regulators ( acronym, name, official_base_url )`,
    )
    .in('id', publicationIds);

  if (pubError) {
    return { evidence: [], errors: [{ code: 'html_catalogue_publication_query_failed', message: pubError.message }] };
  }

  const pubById = new Map((pubs || []).map((p) => [p.id, p]));
  const evidence = [];
  const errors = [...preLoadErrors];

  for (const row of latestByPublication.values()) {
    const pub = pubById.get(row.publication_id);
    if (!pub) {
      errors.push({ publicationId: row.publication_id, code: 'catalogue_publication_not_visible' });
      continue;
    }

    const htmlPath = row.normalised_html_storage_path;
    const textPath = row.normalised_text_storage_path;
    const metaPath = row.derived_metadata_storage_path;
    if (!htmlPath || !textPath || !metaPath) {
      errors.push({ publicationId: row.publication_id, code: 'missing_html_storage_path' });
      continue;
    }

    try {
      const [htmlBuf, textBuf, metaBuf] = await Promise.all([
        downloadPrivateStorageObject({ projectUrl, serviceRoleKey, bucket: DEFAULT_SNAPSHOT_BUCKET, objectPath: htmlPath }),
        downloadPrivateStorageObject({ projectUrl, serviceRoleKey, bucket: DEFAULT_SNAPSHOT_BUCKET, objectPath: textPath }),
        downloadPrivateStorageObject({ projectUrl, serviceRoleKey, bucket: DEFAULT_SNAPSHOT_BUCKET, objectPath: metaPath }),
      ]);

      if (sha256Buffer(htmlBuf) !== row.normalised_html_sha256) {
        errors.push({ publicationId: row.publication_id, code: 'html_integrity_mismatch', revisionId: row.id });
        continue;
      }
      if (sha256Buffer(textBuf) !== row.normalised_text_sha256) {
        errors.push({ publicationId: row.publication_id, code: 'html_text_integrity_mismatch', revisionId: row.id });
        continue;
      }

      let metaParsed = {};
      try {
        metaParsed = JSON.parse(metaBuf.toString('utf8'));
      } catch {
        errors.push({ publicationId: row.publication_id, code: 'html_metadata_json_invalid' });
        continue;
      }

      const text = textBuf.toString('utf8');
      const baseIndex = buildPublicationHtmlEvidenceIndex(
        { ...row, canonical_url: pub.canonical_url },
        { text, html: htmlBuf.toString('utf8'), metaParsed, integrityVerified: true },
      );
      const evidenceBlocks = buildHtmlArticleEvidenceBlocks({
        ...baseIndex,
        publicationId: row.publication_id,
        extractionRevisionId: row.id,
        normalisedArticleText: text,
        normalisedArticleHtml: htmlBuf.toString('utf8'),
      });

      const regulator = Array.isArray(pub.regulator) ? pub.regulator[0] : pub.regulator;
      evidence.push({
        ...baseIndex,
        evidenceBlocks,
        publicationTitle: pub.title,
        publicationReference: pub.external_document_id,
        regulatorShortName: regulator?.acronym || null,
        regulatorLabel: regulator?.name || regulator?.acronym || null,
        integrityVerified: true,
        obligationGradeSuitable: row.extraction_quality?.obligationGradeSuitable === true,
      });
    } catch (e) {
      errors.push({
        publicationId: row.publication_id,
        code: 'html_evidence_load_failed',
        message: e.message,
        revisionId: row.id,
      });
    }
  }

  return {
    evidence,
    errors,
    lookup: revisionQuery.lookup,
    revisionRowsFound: rows.length,
    versionCount: revisionQuery.versionCount ?? null,
  };
}

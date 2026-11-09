/**
 * Server-side publication PDF evidence for Ask RI (service role + private Storage).
 * Never expose storage credentials or raw bucket paths to the client.
 */
import { createHash } from 'node:crypto';
import { buildPdfEvidenceBlocks } from '../../../../../integrations/regulatory-sources/core/pdf-evidence-blocks.mjs';
import { EXTRACTION_PROFILE_PDF_PRIMARY_V1 } from '../ingestion/snapshot/extraction-revision-types.mjs';
import { DEFAULT_SNAPSHOT_BUCKET } from '../ingestion/snapshot/staging-constants.mjs';
import { downloadPrivateStorageObject } from '../ingestion/snapshot/readonly-storage-download.mjs';
import { buildPublicationPdfEvidenceIndex } from './publication-pdf-evidence.mjs';
import {
  extractPublicationTitlePhrases,
  questionMentionsPublicationReference,
} from './publication-pdf-question-match.mjs';

const PUBLICATION_UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

function escapePostgrestIlike(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

const MAX_PDF_PUBLICATIONS = 32;
const REVISION_COLUMNS = `id,
  publication_id,
  source_snapshot_id,
  extraction_profile,
  raw_content_sha256,
  normalised_html_sha256,
  normalised_text_sha256,
  normalised_html_storage_path,
  normalised_text_storage_path,
  derived_metadata_storage_path,
  extraction_quality,
  publication_metadata`;

function sha256Buffer(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function formatPostgrestError(error) {
  if (!error) return null;
  const message = error.message || '';
  const authFailed =
    message.includes('Invalid API key') ||
    message.toLowerCase().includes('invalid jwt') ||
    error.code === 'PGRST301';
  return {
    code: authFailed ? 'supabase_admin_auth_failed' : 'revision_query_failed',
    message,
    postgrestCode: error.code ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
  };
}

/**
 * Resolve global catalogue publication ids referenced in a question (e.g. CP26/38).
 * Does not read tenant organisation tables — catalogue publications only.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} adminSupabase
 * @param {string} question
 */
export async function resolveCataloguePublicationIdsForQuestion(adminSupabase, question) {
  const q = String(question || '');
  const resolved = new Set();

  const uuidMatch = PUBLICATION_UUID_RE.exec(q);
  if (uuidMatch) {
    const { data, error } = await adminSupabase
      .from('regulatory_publications')
      .select('id')
      .eq('id', uuidMatch[0])
      .limit(1);
    if (error) return { ids: [], error: formatPostgrestError(error) };
    for (const row of data || []) {
      if (row.id) resolved.add(row.id);
    }
    if (resolved.size) {
      return { ids: [...resolved], error: null, resolveMethod: 'uuid' };
    }
  }

  const cp = q.match(/\bcp\s*(\d+)\s*\/\s*(\d+)\b/i);
  if (cp) {
    const n1 = cp[1];
    const n2 = cp[2];
    const slugHyphen = `cp${n1}-${n2}`;
    const refSlash = `CP${n1}/${n2}`;

    const { data, error } = await adminSupabase
      .from('regulatory_publications')
      .select('id, external_document_id, canonical_url')
      .or(
        `canonical_url.ilike.%${slugHyphen}%,external_document_id.ilike.%${refSlash}%,external_document_id.ilike.%CP${n1}%2F${n2}%`,
      )
      .limit(8);

    if (error) {
      return { ids: [], error: formatPostgrestError(error) };
    }

    for (const row of data || []) {
      if (row.id) resolved.add(row.id);
    }
    if (resolved.size) {
      return { ids: [...resolved], error: null, resolveMethod: 'cp_reference' };
    }
  }

  const titlePhrases = extractPublicationTitlePhrases(q);
  for (const phrase of titlePhrases) {
    const escaped = escapePostgrestIlike(phrase.slice(0, 160));
    const { data: exactRows, error: exactError } = await adminSupabase
      .from('regulatory_publications')
      .select('id, title')
      .ilike('title', escaped)
      .limit(4);
    if (exactError) return { ids: [], error: formatPostgrestError(exactError) };
    for (const row of exactRows || []) {
      if (row.id) resolved.add(row.id);
    }

    const { data: fuzzyRows, error: fuzzyError } = await adminSupabase
      .from('regulatory_publications')
      .select('id, title')
      .ilike('title', `%${escaped}%`)
      .limit(6);
    if (fuzzyError) return { ids: [], error: formatPostgrestError(fuzzyError) };
    for (const row of fuzzyRows || []) {
      if (row.id) resolved.add(row.id);
    }
  }

  if (resolved.size) {
    return { ids: [...resolved], error: null, resolveMethod: 'title_phrase' };
  }

  return { ids: [], error: null, resolveMethod: 'none' };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} adminSupabase
 * @param {string[]} publicationIds
 */
async function loadCataloguePublicationRows(adminSupabase, publicationIds) {
  if (!publicationIds.length) return { byId: new Map(), error: null };

  const { data, error } = await adminSupabase
    .from('regulatory_publications')
    .select(
      `id, title, canonical_url, publication_type, external_document_id, data_origin,
      regulator:regulators ( acronym, name, official_base_url )`,
    )
    .in('id', publicationIds);

  if (error) {
    return { byId: new Map(), error: formatPostgrestError(error) };
  }

  const byId = new Map();
  for (const row of data || []) {
    byId.set(row.id, row);
  }
  return { byId, error: null };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} adminSupabase service role
 * @param {{ projectUrl: string, serviceRoleKey: string, publicationIds?: string[] }} options
 */
export async function loadPublicationPdfEvidenceForAskRi(adminSupabase, options) {
  if (!adminSupabase) {
    return { evidence: [], errors: [{ code: 'admin_client_unavailable' }] };
  }

  const projectUrl = options.projectUrl?.trim();
  const serviceRoleKey = options.serviceRoleKey?.trim();
  if (!projectUrl || !serviceRoleKey) {
    return { evidence: [], errors: [{ code: 'storage_credentials_unavailable' }] };
  }

  let query = adminSupabase
    .from('regulatory_source_extraction_revisions')
    .select(REVISION_COLUMNS)
    .eq('extraction_profile', EXTRACTION_PROFILE_PDF_PRIMARY_V1)
    .limit(MAX_PDF_PUBLICATIONS);

  if (options.publicationIds?.length) {
    query = query.in('publication_id', options.publicationIds);
  }

  const { data: rows, error } = await query;
  if (error) {
    return { evidence: [], errors: [formatPostgrestError(error)] };
  }

  if (!rows?.length) {
    return {
      evidence: [],
      errors: [
        {
          code: 'revision_query_zero_rows',
          message: 'No pdf_primary_v1 extraction revisions matched the scoped publication filter.',
          publicationIds: options.publicationIds ?? null,
        },
      ],
    };
  }

  const publicationIds = [...new Set(rows.map((r) => r.publication_id))];
  const { byId: pubById, error: pubError } = await loadCataloguePublicationRows(
    adminSupabase,
    publicationIds,
  );
  if (pubError) {
    return { evidence: [], errors: [pubError] };
  }

  const evidence = [];
  const errors = [];

  for (const row of rows) {
    const pub = pubById.get(row.publication_id);
    if (!pub) {
      errors.push({
        publicationId: row.publication_id,
        revisionId: row.id,
        code: 'catalogue_publication_not_visible',
      });
      continue;
    }

    const structuredPath = row.normalised_html_storage_path;
    if (!structuredPath) {
      errors.push({ publicationId: row.publication_id, code: 'missing_structured_storage_path' });
      continue;
    }

    try {
      const structuredBuf = await downloadPrivateStorageObject({
        projectUrl,
        serviceRoleKey,
        bucket: DEFAULT_SNAPSHOT_BUCKET,
        objectPath: structuredPath,
      });
      const computedSha = sha256Buffer(structuredBuf);
      if (computedSha !== row.normalised_html_sha256) {
        errors.push({
          publicationId: row.publication_id,
          code: 'structured_integrity_mismatch',
          revisionId: row.id,
        });
        continue;
      }

      const structured = JSON.parse(structuredBuf.toString('utf8'));
      if (structured.pageBoundaryConfirmed !== true) {
        errors.push({ publicationId: row.publication_id, code: 'page_boundaries_not_confirmed' });
        continue;
      }

      const blocks = buildPdfEvidenceBlocks(
        {
          publicationId: row.publication_id,
          extractionRevisionId: row.id,
          sourcePdfSha256: row.raw_content_sha256,
          extractionProfile: EXTRACTION_PROFILE_PDF_PRIMARY_V1,
        },
        structured,
      );

      const index = buildPublicationPdfEvidenceIndex(
        {
          revision_id: row.id,
          id: row.id,
          publication_id: row.publication_id,
          extraction_profile: row.extraction_profile,
          raw_content_sha256: row.raw_content_sha256,
          publication_metadata: row.publication_metadata,
          canonical_url: pub?.canonical_url,
          extraction_quality: row.extraction_quality,
        },
        structured,
        blocks,
      );

      const regulator = pub?.regulator;
      evidence.push({
        ...index,
        publicationTitle: pub?.title || null,
        publicationType: pub?.publication_type || null,
        publicationReference: pub?.external_document_id || inferPublicationReference(pub),
        regulatorShortName: regulator?.acronym || null,
        regulatorLabel: regulator?.name || regulator?.acronym || null,
        regulatorBaseUrl: regulator?.official_base_url || null,
        obligationGradeSuitable: row.extraction_quality?.obligationGradeSuitable === true,
        integrityVerified: true,
        sourceSnapshotId: row.source_snapshot_id,
        pageCount: structured.pageCount ?? null,
      });
    } catch (e) {
      errors.push({
        publicationId: row.publication_id,
        code: 'pdf_evidence_load_failed',
        message: e.message,
        revisionId: row.id,
      });
    }
  }

  return { evidence, errors };
}

function inferPublicationReference(pub) {
  if (!pub?.canonical_url) return null;
  const m = /cp\s*(\d+)\s*[-/]\s*(\d+)/i.exec(pub.canonical_url);
  if (m) return `CP${m[1]}/${m[2]}`;
  return null;
}

/**
 * Attach verified PDF evidence to Ask RI state (mutates state).
 * @param {object} state
 * @param {import('@supabase/supabase-js').SupabaseClient} adminSupabase
 * @param {string} [question]
 */
export async function attachPublicationPdfEvidenceToAskRiState(state, adminSupabase, question = '') {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!adminSupabase) {
    state.publicationPdfEvidence = [];
    state.publicationPdfEvidenceErrors = [{ code: 'admin_client_unavailable' }];
    state.publicationPdfEvidenceLoadMeta = { adminClientAvailable: false };
    return { evidence: [], errors: state.publicationPdfEvidenceErrors };
  }

  if (!questionMentionsPublicationReference(question)) {
    state.publicationPdfEvidence = [];
    state.publicationPdfEvidenceErrors = [];
    state.publicationPdfEvidenceLoadMeta = { skipped: true, reason: 'question_not_publication_scoped' };
    return { evidence: [], errors: [] };
  }

  const {
    ids: scopedPublicationIds,
    error: resolveError,
    resolveMethod,
  } = await resolveCataloguePublicationIdsForQuestion(adminSupabase, question);
  if (resolveError) {
    state.publicationPdfEvidence = [];
    state.publicationPdfEvidenceErrors = [resolveError];
    state.publicationPdfEvidenceLoadMeta = { scopedPublicationIds: [], publicationResolveFailed: true };
    return { evidence: [], errors: [resolveError] };
  }

  const loaded = await loadPublicationPdfEvidenceForAskRi(adminSupabase, {
    projectUrl,
    serviceRoleKey,
    publicationIds: scopedPublicationIds.length ? scopedPublicationIds : undefined,
  });

  state.publicationPdfEvidence = loaded.evidence;
  state.publicationPdfEvidenceErrors = loaded.errors;
  state.publicationPdfEvidenceLoadMeta = {
    scopedPublicationIds: scopedPublicationIds.length ? scopedPublicationIds : null,
    publicationResolveMethod: resolveMethod ?? null,
    targetedLoad: true,
    loadedCount: loaded.evidence?.length ?? 0,
    errorCount: loaded.errors?.length ?? 0,
  };
  return loaded;
}


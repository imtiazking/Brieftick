/**
 * PostgREST RLS probes for regulatory_source_extraction_revisions.
 */
import {
  classifyPostgrestMutationFailure,
  isSecureMutationDenial,
  readPostgrestResponseBody,
} from './staging-postgrest-error.mjs';

const PROBE_POST_BODY = {
  source_snapshot_id: '00000000-0000-0000-0000-000000000000',
  publication_id: '00000000-0000-0000-0000-000000000000',
  publication_version_id: '00000000-0000-0000-0000-000000000000',
  raw_content_sha256: '0'.repeat(64),
  extraction_profile: 'html_article_v2',
  derived_content_fingerprint: '0'.repeat(64),
  normalised_html_sha256: '1'.repeat(64),
  normalised_text_sha256: '2'.repeat(64),
  normalised_html_storage_path: 'probe',
  normalised_text_storage_path: 'probe',
  derived_metadata_storage_path: 'probe',
  extraction_quality: {},
  created_by: 'rls-probe',
};

/**
 * @param {string} apiUrl
 * @param {string} anonKey
 * @param {string} jwt Clerk session JWT accepted by Supabase third-party auth
 */
export async function postgrestSelectExtractionRevisions(apiUrl, anonKey, jwt) {
  const res = await fetch(
    `${apiUrl.replace(/\/$/, '')}/rest/v1/regulatory_source_extraction_revisions?select=id`,
    {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/json',
      },
    },
  );
  if (!res.ok) {
    return { ok: false, status: res.status, rowCount: null };
  }
  const rows = await res.json();
  return {
    ok: true,
    status: res.status,
    rowCount: Array.isArray(rows) ? rows.length : null,
  };
}

/**
 * @param {'POST' | 'PATCH' | 'DELETE'} method
 * @param {{ revisionId?: string }} [options]
 */
export async function postgrestMutationProbe(apiUrl, anonKey, jwt, method, options = {}) {
  const base = `${apiUrl.replace(/\/$/, '')}/rest/v1/regulatory_source_extraction_revisions`;
  const init = {
    method,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
  };

  if (method === 'POST') {
    init.body = JSON.stringify(PROBE_POST_BODY);
  } else if (method === 'PATCH') {
    const revisionId = options.revisionId || '00000000-0000-0000-0000-000000000001';
    init.body = JSON.stringify({ created_by: 'rls-patch-probe' });
    const res = await fetch(`${base}?id=eq.${revisionId}`, init);
    const { parsed, raw } = await readPostgrestResponseBody(res);
    const classification = classifyPostgrestMutationFailure({
      status: res.status,
      parsed,
      raw,
      method: 'PATCH',
    });
    return {
      status: res.status,
      sqlState: classification.sqlState,
      pgrestCode: classification.pgrestCode,
      origin: classification.origin,
      denied: isSecureMutationDenial(classification),
      classification,
      message: classification.message,
      inconclusiveZeroRowPatch:
        res.status >= 200 && res.status < 300
          ? 'PATCH_http_success_does_not_prove_rls_on_empty_table'
          : undefined,
    };
  }

  const res = await fetch(base, init);
  const { parsed, raw } = await readPostgrestResponseBody(res);
  const classification = classifyPostgrestMutationFailure({
    status: res.status,
    parsed,
    raw,
    method,
  });
  return {
    status: res.status,
    sqlState: classification.sqlState,
    pgrestCode: classification.pgrestCode,
    origin: classification.origin,
    denied: isSecureMutationDenial(classification),
    classification,
    message: classification.message,
  };
}

/** @deprecated Use postgrestMutationProbe — kept for callers expecting { status, denied }. */
export async function postgrestMutationDenied(apiUrl, anonKey, jwt, method) {
  const probe = await postgrestMutationProbe(apiUrl, anonKey, jwt, method);
  return { status: probe.status, denied: probe.denied };
}

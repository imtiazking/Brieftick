/**
 * Parse and classify PostgREST / PostgreSQL errors for staging RLS probes (no secrets logged).
 */

/**
 * @param {Response} res
 */
export async function readPostgrestResponseBody(res) {
  const text = await res.text();
  if (!text) return { raw: '', parsed: null };
  try {
    return { raw: text.slice(0, 500), parsed: JSON.parse(text) };
  } catch {
    return { raw: text.slice(0, 500), parsed: null };
  }
}

/**
 * @param {unknown} parsed
 */
export function extractSqlStateFromPostgrestBody(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const code = parsed.code;
  if (typeof code !== 'string') return null;
  if (/^[0-9A-Z]{5}$/.test(code)) return code;
  return null;
}

/**
 * @param {unknown} parsed
 */
export function extractPostgrestCode(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const code = parsed.code;
  if (typeof code === 'string' && code.startsWith('PGRST')) return code;
  return null;
}

/**
 * @param {{ status: number, parsed?: unknown, raw?: string, method?: string }} input
 */
export function classifyPostgrestMutationFailure(input) {
  const { status, parsed, raw = '', method } = input;
  const sqlState = extractSqlStateFromPostgrestBody(parsed);
  const pgrestCode = extractPostgrestCode(parsed);
  const message =
    (parsed && typeof parsed === 'object' && typeof parsed.message === 'string'
      ? parsed.message
      : raw) || '';

  if (status >= 200 && status < 300) {
    return {
      accepted: false,
      origin: 'mutation_succeeded_or_empty_success',
      sqlState,
      pgrestCode,
      httpStatus: status,
      message: message.slice(0, 200),
      note:
        method === 'PATCH'
          ? 'HTTP 2xx on PATCH is not proof of RLS when zero rows match (empty or missing row).'
          : undefined,
    };
  }

  if (sqlState === '42501') {
    return {
      accepted: true,
      origin: 'insufficient_privilege',
      sqlState,
      pgrestCode,
      httpStatus: status,
      message: message.slice(0, 200),
    };
  }

  if (sqlState === 'P0001' && message.includes('extraction_revisions_append_only')) {
    return {
      accepted: true,
      origin: 'append_only_trigger',
      sqlState,
      pgrestCode,
      httpStatus: status,
      message: message.slice(0, 200),
    };
  }

  if (status === 401 || status === 403) {
    return {
      accepted: true,
      origin: 'http_authz',
      sqlState,
      pgrestCode,
      httpStatus: status,
      message: message.slice(0, 200),
    };
  }

  if (/row-level security/i.test(message)) {
    return {
      accepted: true,
      origin: 'row_level_security',
      sqlState,
      pgrestCode,
      httpStatus: status,
      message: message.slice(0, 200),
    };
  }

  if (status === 400) {
    return {
      accepted: false,
      origin: 'invalid_request_syntax_or_payload',
      sqlState,
      pgrestCode,
      httpStatus: status,
      message: message.slice(0, 200),
    };
  }

  if (status === 405) {
    return {
      accepted: true,
      origin: 'method_not_allowed',
      sqlState,
      pgrestCode,
      httpStatus: status,
      message: message.slice(0, 200),
    };
  }

  return {
    accepted: false,
    origin: 'unclassified',
    sqlState,
    pgrestCode,
    httpStatus: status,
    message: message.slice(0, 200),
  };
}

/**
 * @param {{ accepted?: boolean }} classification
 */
export function isSecureMutationDenial(classification) {
  return classification?.accepted === true;
}

/**
 * @param {import('pg').DatabaseError | Error} err
 */
export function classifyPostgresDriverError(err) {
  const sqlState = typeof err?.code === 'string' ? err.code : null;
  const message = err?.message || String(err);

  if (sqlState === '42501') {
    return {
      accepted: true,
      origin: 'insufficient_privilege',
      sqlState,
      message: message.slice(0, 200),
    };
  }

  if (sqlState === 'P0001' && message.includes('extraction_revisions_append_only')) {
    return {
      accepted: true,
      origin: 'append_only_trigger',
      sqlState,
      message: message.slice(0, 200),
    };
  }

  if (/row-level security/i.test(message)) {
    return {
      accepted: true,
      origin: 'row_level_security',
      sqlState,
      message: message.slice(0, 200),
    };
  }

  return {
    accepted: false,
    origin: 'unclassified',
    sqlState,
    message: message.slice(0, 200),
  };
}

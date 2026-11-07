import 'server-only';

const FORBIDDEN_KEY_RE =
  /storage_path|service_role|secret|password|private_key|normalised_html_storage|derived_metadata_storage|raw_storage_path/i;

/** Strip fields that must not reach the Design Lab browser. */
export function sanitizeLabRecord<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (FORBIDDEN_KEY_RE.test(key)) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = sanitizeLabRecord(value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

export function sanitizePublicationListRow(row: {
  id: string;
  title: string;
  publication_type: string;
  publication_date: string | null;
  effective_date: string | null;
  consultation_deadline: string | null;
  canonical_url: string;
  data_origin: string;
  regulator: { name: string; acronym: string; external_key: string } | null;
  source: { name: string; external_key: string } | null;
}) {
  return sanitizeLabRecord({
    id: row.id,
    title: row.title,
    publication_type: row.publication_type,
    publication_date: row.publication_date,
    effective_date: row.effective_date,
    consultation_deadline: row.consultation_deadline,
    canonical_url: row.canonical_url,
    data_origin: row.data_origin,
    regulator: row.regulator,
    source: row.source,
  });
}

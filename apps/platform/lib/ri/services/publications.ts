import type { SupabaseClient } from '@supabase/supabase-js';
import { RiNotFoundError } from '@/lib/ri/errors';

export type PublicationListRow = {
  id: string;
  title: string;
  publication_type: string;
  publication_date: string | null;
  effective_date: string | null;
  consultation_deadline: string | null;
  canonical_url: string;
  data_origin: string;
  source_hash: string | null;
  source_version: string | null;
  external_document_id: string | null;
  summary: string | null;
  retrieved_at: string | null;
  provenance: Record<string, unknown> | null;
  versionCount: number;
  regulator: { name: string; acronym: string; external_key: string } | null;
  source: { name: string; external_key: string } | null;
  orgState: {
    triage_status: string;
    relevance_status: string | null;
    materiality: string | null;
    assigned_to: string | null;
    triage_sla_due: string | null;
  } | null;
  applicability: { recommendation: string; status: string } | null;
};

export async function listPublicationsForOrganisation(
  supabase: SupabaseClient,
  organisationId: string,
): Promise<PublicationListRow[]> {
  const { data: publications, error } = await supabase
    .from('regulatory_publications')
    .select(
      `
      id, title, publication_type, publication_date, effective_date, consultation_deadline,
      canonical_url, data_origin, source_hash, source_version, external_document_id, summary, retrieved_at, provenance,
      regulator:regulators(name, acronym, external_key),
      source:regulatory_sources(name, external_key)
    `,
    )
    .order('publication_date', { ascending: false, nullsFirst: false })
    .limit(200);

  if (error) throw new Error(error.message);
  if (!publications?.length) return [];

  const ids = publications.map((p) => p.id);
  const { data: orgRows } = await supabase
    .from('organisation_publications')
    .select('publication_id, triage_status, relevance_status, materiality, assigned_to, triage_sla_due')
    .eq('organisation_id', organisationId)
    .in('publication_id', ids);

  const { data: appRows } = await supabase
    .from('applicability_assessments')
    .select('publication_id, recommendation, status')
    .eq('organisation_id', organisationId)
    .in('publication_id', ids)
    .order('updated_at', { ascending: false });

  const { data: versionRows } = await supabase
    .from('regulatory_publication_versions')
    .select('publication_id')
    .in('publication_id', ids);

  const versionCountByPub = new Map<string, number>();
  for (const row of versionRows ?? []) {
    const pid = row.publication_id as string;
    versionCountByPub.set(pid, (versionCountByPub.get(pid) ?? 0) + 1);
  }

  const orgByPub = new Map(orgRows?.map((r) => [r.publication_id, r]));
  const appByPub = new Map<string, { recommendation: string; status: string }>();
  for (const row of appRows ?? []) {
    if (!appByPub.has(row.publication_id)) {
      appByPub.set(row.publication_id, {
        recommendation: row.recommendation,
        status: row.status,
      });
    }
  }

  return publications.map((p) => ({
    ...p,
    regulator: Array.isArray(p.regulator) ? p.regulator[0] : p.regulator,
    source: Array.isArray(p.source) ? p.source[0] : p.source,
    orgState: orgByPub.get(p.id) ?? null,
    applicability: appByPub.get(p.id) ?? null,
    versionCount: versionCountByPub.get(p.id) ?? 0,
    provenance: (p.provenance as Record<string, unknown>) ?? null,
  })) as PublicationListRow[];
}

export async function getPublicationDetail(
  supabase: SupabaseClient,
  organisationId: string,
  publicationId: string,
) {
  const { data: publication, error } = await supabase
    .from('regulatory_publications')
    .select(
      `
      *,
      regulator:regulators(id, name, acronym, external_key, official_base_url),
      source:regulatory_sources(id, name, external_key, canonical_url, production_status)
    `,
    )
    .eq('id', publicationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!publication) throw new RiNotFoundError();

  const { data: orgPub } = await supabase
    .from('organisation_publications')
    .select('*')
    .eq('organisation_id', organisationId)
    .eq('publication_id', publicationId)
    .maybeSingle();

  const { data: applicability } = await supabase
    .from('applicability_assessments')
    .select('*')
    .eq('organisation_id', organisationId)
    .eq('publication_id', publicationId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: changes } = await supabase
    .from('regulatory_changes')
    .select('id, title, status, change_type, effective_date, implementation_deadline')
    .eq('organisation_id', organisationId)
    .eq('publication_id', publicationId)
    .order('created_at', { ascending: false });

  const changeIds = (changes ?? []).map((c) => c.id);
  const { data: impacts } = changeIds.length
    ? await supabase
        .from('impact_assessments')
        .select('id, status, due_date, materiality, regulatory_change_id')
        .eq('organisation_id', organisationId)
        .in('regulatory_change_id', changeIds)
        .order('created_at', { ascending: false })
    : { data: [] };

  const { data: versions } = await supabase
    .from('regulatory_publication_versions')
    .select('id, version_number, source_hash, retrieved_at, canonical_url, ingestion_run_id')
    .eq('publication_id', publicationId)
    .order('version_number', { ascending: false });

  const { data: sourceMeta } = publication.source?.external_key
    ? await supabase
        .from('regulatory_sources')
        .select(
          'external_key, verification_status, coverage_verification_status, production_status, canonical_url',
        )
        .eq('external_key', publication.source.external_key)
        .maybeSingle()
    : { data: null };

  return {
    publication: {
      ...publication,
      regulator: Array.isArray(publication.regulator)
        ? publication.regulator[0]
        : publication.regulator,
      source: Array.isArray(publication.source) ? publication.source[0] : publication.source,
    },
    orgPublication: orgPub,
    applicability,
    changes: changes ?? [],
    impacts: impacts ?? [],
    versions: versions ?? [],
    sourceMeta: sourceMeta ?? null,
  };
}

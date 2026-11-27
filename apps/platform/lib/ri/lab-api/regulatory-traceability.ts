import type { SupabaseClient } from '@supabase/supabase-js';

export type RegulatoryChangeLinkage = 'NONE' | 'TENANT_CHANGE';

export type RegulatoryTraceability = {
  publicationId: string;
  sourceExternalKey: string | null;
  regulatorExternalKey: string | null;
  ingestionRunId: string | null;
  ingestionRunIdsFromVersions: string[];
  horizonSurfaces: ('REGULATORY_FEED' | 'HORIZON_SCANNING' | 'PUBLICATIONS_LIBRARY')[];
  regulatoryChange: {
    linkage: RegulatoryChangeLinkage;
    changeIds: string[];
    primaryChangeId: string | null;
    /** True when the catalogue row exists but the tenant has not materialised a change record (expected for many ingested publications). */
    changeRecordOptional: true;
  };
  downstream: {
    impactAssessmentCount: number;
    triageFindingCount: number | null;
  };
};

function parseProvenanceIngestionRun(provenance: unknown): string | null {
  if (!provenance || typeof provenance !== 'object') return null;
  const runId = (provenance as { ingestionRunId?: unknown }).ingestionRunId;
  return typeof runId === 'string' && runId.trim() ? runId.trim() : null;
}

export async function buildRegulatoryTraceability(
  supabase: SupabaseClient,
  organisationId: string,
  detail: {
    publication: {
      id: string;
      provenance?: Record<string, unknown> | null;
      regulator?: { external_key?: string } | { external_key?: string }[] | null;
      source?: { external_key?: string } | { external_key?: string }[] | null;
    };
    changes: { id: string }[];
    impacts: unknown[];
    versions: { ingestion_run_id?: string | null }[];
  },
): Promise<RegulatoryTraceability> {
  const pub = detail.publication;
  const regulator = Array.isArray(pub.regulator) ? pub.regulator[0] : pub.regulator;
  const source = Array.isArray(pub.source) ? pub.source[0] : pub.source;
  const changeIds = (detail.changes ?? []).map((c) => c.id);
  const linkage: RegulatoryChangeLinkage = changeIds.length ? 'TENANT_CHANGE' : 'NONE';

  const versionRunIds = [
    ...new Set(
      (detail.versions ?? [])
        .map((v) => v.ingestion_run_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];
  const provenanceRunId = parseProvenanceIngestionRun(pub.provenance);
  const ingestionRunId = provenanceRunId || versionRunIds[0] || null;

  let triageFindingCount: number | null = null;
  const { count, error } = await supabase
    .from('ai_analysis_runs')
    .select('id', { count: 'exact', head: true })
    .eq('organisation_id', organisationId)
    .eq('publication_id', pub.id);
  if (!error) triageFindingCount = count ?? 0;

  return {
    publicationId: pub.id,
    sourceExternalKey: source?.external_key?.trim() ?? null,
    regulatorExternalKey: regulator?.external_key?.trim() ?? null,
    ingestionRunId,
    ingestionRunIdsFromVersions: versionRunIds,
    horizonSurfaces: ['REGULATORY_FEED', 'HORIZON_SCANNING', 'PUBLICATIONS_LIBRARY'],
    regulatoryChange: {
      linkage,
      changeIds,
      primaryChangeId: changeIds[0] ?? null,
      changeRecordOptional: true,
    },
    downstream: {
      impactAssessmentCount: (detail.impacts ?? []).length,
      triageFindingCount,
    },
  };
}
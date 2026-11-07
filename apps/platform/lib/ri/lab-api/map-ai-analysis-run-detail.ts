import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnalysisRunRow } from '@/lib/ri/services/ai-analysis';

export type AiCitationRow = {
  id: string;
  claim_index: number;
  claim_text: string;
  source_section_ids: string[] | null;
  citation_status: string;
  grounding_status: string | null;
};

export type LabAiAnalysisCitationView = {
  id: string;
  claimIndex: number;
  claimText: string;
  citationStatus: string;
  groundingStatus: string | null;
  confidence: number | null;
  sourceSectionIds: string[];
  sections: Array<{
    sourceSectionId: string;
    citationLabel: string | null;
    excerpt: string | null;
    resolved: boolean;
    resolutionNote: string | null;
  }>;
  publicationId: string;
  publicationTitle: string | null;
  publicationSourceUrl: string | null;
  regulatorAcronym: string | null;
  publicationHref: string;
  sourceTabHref: string;
  evidenceSupported: boolean;
  evidenceWarning: string | null;
  tenantScope: true;
  _connected: true;
};

export type LabAiAnalysisRunDetailExtras = {
  publicationSource: {
    publicationId: string;
    publicationVersionId: string;
    publicationTitle: string | null;
    sourceUrl: string | null;
    regulatorAcronym: string | null;
    versionLabel: string | null;
  };
  citations: LabAiAnalysisCitationView[];
};

function sectionIdForVersion(versionId: string): string {
  return `SRCSEC-${String(versionId).replace(/-/g, '').slice(0, 12)}`;
}

function claimConfidenceFromOutput(
  structuredOutput: Record<string, unknown> | null | undefined,
  claimIndex: number,
): number | null {
  const claims = structuredOutput?.claims;
  if (!Array.isArray(claims) || !claims[claimIndex]) return null;
  const c = claims[claimIndex] as { confidence?: unknown };
  return typeof c.confidence === 'number' ? c.confidence : null;
}

export async function loadPublicationSourceContextForAiRun(
  supabase: SupabaseClient,
  publicationId: string,
  publicationVersionId: string,
): Promise<{
  publicationTitle: string | null;
  sourceUrl: string | null;
  regulatorAcronym: string | null;
  versionNumber: string | number | null;
  sectionsById: Map<string, { citation: string; text: string }>;
}> {
  const { data: version } = await supabase
    .from('regulatory_publication_versions')
    .select('id, version_number, publication_id')
    .eq('id', publicationVersionId)
    .maybeSingle();

  const { data: publication } = await supabase
    .from('regulatory_publications')
    .select('title, summary, canonical_url, regulator:regulators(acronym)')
    .eq('id', publicationId)
    .maybeSingle();

  const sectionId = sectionIdForVersion(publicationVersionId);
  const text =
    publication?.summary?.trim() ||
    publication?.title?.trim() ||
    'Publication source text unavailable.';
  const sectionsById = new Map<string, { citation: string; text: string }>();
  sectionsById.set(sectionId, {
    citation: version ? `v${version.version_number}` : 'Publication source',
    text: String(text).slice(0, 8000),
  });

  const regulator = publication?.regulator as { acronym?: string } | null | undefined;

  return {
    publicationTitle: publication?.title ?? null,
    sourceUrl: publication?.canonical_url ?? null,
    regulatorAcronym: regulator?.acronym ?? null,
    versionNumber: version?.version_number ?? null,
    sectionsById,
  };
}

export function mapAiAnalysisCitationsForLab(
  run: AnalysisRunRow,
  citationRows: AiCitationRow[],
  ctx: Awaited<ReturnType<typeof loadPublicationSourceContextForAiRun>>,
): LabAiAnalysisCitationView[] {
  const structuredOutput = run.structured_output;
  const pubHref = `#/publication/${run.publication_id}`;
  const sourceTabHref = `#/publication/${run.publication_id}/source`;

  return citationRows.map((row) => {
    const sourceSectionIds = row.source_section_ids ?? [];
    const sections = sourceSectionIds.map((sid) => {
      const hit = ctx.sectionsById.get(sid);
      if (hit) {
        return {
          sourceSectionId: sid,
          citationLabel: hit.citation,
          excerpt: hit.text.slice(0, 500),
          resolved: true,
          resolutionNote: null,
        };
      }
      return {
        sourceSectionId: sid,
        citationLabel: null,
        excerpt: null,
        resolved: false,
        resolutionNote: `Source section ${sid} is not mapped to a publication excerpt in staging (no fabricated section text).`,
      };
    });

    const evidenceSupported =
      sourceSectionIds.length > 0 && sections.some((s) => s.resolved) && row.citation_status === 'VERIFIED';

    let evidenceWarning: string | null = null;
    if (!sourceSectionIds.length) {
      evidenceWarning = 'No source section IDs persisted for this finding — treat as unsupported until reviewed.';
    } else if (sections.every((s) => !s.resolved)) {
      evidenceWarning = 'Persisted section IDs could not be resolved to publication source text.';
    } else if (row.citation_status !== 'VERIFIED') {
      evidenceWarning = `Citation status is ${row.citation_status} — evidence not verified at execution time.`;
    }

    return {
      id: row.id,
      claimIndex: row.claim_index,
      claimText: row.claim_text,
      citationStatus: row.citation_status,
      groundingStatus: row.grounding_status,
      confidence: claimConfidenceFromOutput(structuredOutput, row.claim_index),
      sourceSectionIds,
      sections,
      publicationId: run.publication_id,
      publicationTitle: ctx.publicationTitle,
      publicationSourceUrl: ctx.sourceUrl,
      regulatorAcronym: ctx.regulatorAcronym,
      publicationHref: pubHref,
      sourceTabHref,
      evidenceSupported,
      evidenceWarning,
      tenantScope: true,
      _connected: true,
    };
  });
}

export async function buildLabAiAnalysisRunDetailExtras(
  supabase: SupabaseClient,
  run: AnalysisRunRow,
  citationRows: AiCitationRow[],
): Promise<LabAiAnalysisRunDetailExtras> {
  const ctx = await loadPublicationSourceContextForAiRun(
    supabase,
    run.publication_id,
    run.publication_version_id,
  );
  return {
    publicationSource: {
      publicationId: run.publication_id,
      publicationVersionId: run.publication_version_id,
      publicationTitle: ctx.publicationTitle,
      sourceUrl: ctx.sourceUrl,
      regulatorAcronym: ctx.regulatorAcronym,
      versionLabel: ctx.versionNumber != null ? `v${ctx.versionNumber}` : null,
    },
    citations: mapAiAnalysisCitationsForLab(run, citationRows, ctx),
  };
}

import type { PublicationListRow } from '@/lib/ri/services/publications';
import { landscapeSectorIdsForPublicationRegulator } from '@/lib/ri/lab-api/lab-landscape-mappings';

export const LAB_DISPLAY_UNAVAILABLE = '—';

export type LabPublicationDisplay = {
  reference: string;
  referenceSource: string;
  topic: string;
  classification: string;
  aiRelevance: string;
  aiPriority: string;
  businessAreas: string;
  triage: string;
  triagePersisted: boolean;
  sla: string;
  detectedAt: string | null;
  publicationType: string;
  libraryVersion: string;
  libraryStatus: string;
  /** Human-readable provenance for version row (not extraction revisions). */
  libraryVersionSource: string;
  consultationDeadlineStructured: string | null;
  /** Parsed from summary text only — not a confirmed regulatory field. */
  consultationDeadlineCandidate: string | null;
  catalogueKind: 'regulatory' | 'synthetic_fixture' | 'catalogue';
  dataOriginLabel: string;
};

/** Design Lab publication shape (camelCase) — read-only catalogue + tenant overlay. */
export type LabPublicationView = {
  id: string;
  scenario: 'all';
  regulator: string;
  title: string;
  summary: string | null;
  publicationType: string;
  jurisdiction: string;
  publishedDate: string | null;
  effectiveDate: string | null;
  consultationDeadline: string | null;
  sourceLabel: string | null;
  sourceUrl: string | null;
  dataOrigin: string;
  catalogueScope: 'global';
  tenantOverlay: boolean;
  canonicalUrl: string;
  versionCount: number;
  intakeEligible: boolean;
  display: LabPublicationDisplay;
  /** Design Lab regulator id (REG-FCA) from DB external_key — explicit mapping only. */
  designLabRegulatorId: string | null;
  /** Sector ids (SEC-*) from frozen sector↔regulator taxonomy. */
  landscapeSectorIds: string[];
  _connected: true;
};

type ProvenancePeek = {
  origin?: string;
  retrievedAt?: string;
  sourceId?: string;
  externalDocumentId?: string | null;
};

function formatPublicationType(raw: string | null | undefined): string {
  if (!raw?.trim()) return LAB_DISPLAY_UNAVAILABLE;
  return raw
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function parseProvenance(raw: unknown): ProvenancePeek {
  if (!raw || typeof raw !== 'object') return {};
  const p = raw as Record<string, unknown>;
  return {
    origin: typeof p.origin === 'string' ? p.origin : undefined,
    retrievedAt: typeof p.retrievedAt === 'string' ? p.retrievedAt : undefined,
    sourceId: typeof p.sourceId === 'string' ? p.sourceId : undefined,
    externalDocumentId:
      typeof p.externalDocumentId === 'string' ? p.externalDocumentId : null,
  };
}

function deriveRegulatoryReference(
  title: string,
  externalDocumentId: string | null | undefined,
  provenance: ProvenancePeek,
): { value: string; source: string } {
  const ext = externalDocumentId?.trim() || provenance.externalDocumentId?.trim();
  if (ext) return { value: ext, source: 'external_document_id' };

  const cpMatch = title.match(/\b(CP\d+\/\d+)\b/i);
  if (cpMatch) return { value: cpMatch[1].toUpperCase(), source: 'title_regulatory_reference' };

  const psMatch = title.match(/\b(PS\d+\/\d+)\b/i);
  if (psMatch) return { value: psMatch[1].toUpperCase(), source: 'title_regulatory_reference' };

  return { value: LAB_DISPLAY_UNAVAILABLE, source: 'unavailable' };
}

function classifyCatalogueKind(dataOrigin: string, provenance: ProvenancePeek): LabPublicationDisplay['catalogueKind'] {
  if (dataOrigin === 'e2e_fixture') return 'synthetic_fixture';
  if (provenance.origin === 'FORGENIQ_RI_INGESTION' || dataOrigin === 'regulated-ingestion') {
    return 'regulatory';
  }
  return 'catalogue';
}

function mapPersistedTriage(orgState: PublicationListRow['orgState']): {
  label: string;
  persisted: boolean;
} {
  if (!orgState) {
    return { label: 'Not triaged', persisted: false };
  }
  switch ((orgState.triage_status || '').toUpperCase()) {
    case 'NEW':
      return { label: 'New (tenant default)', persisted: true };
    case 'TRIAGED':
      return { label: 'Triaged', persisted: true };
    case 'IN_REVIEW':
      return { label: 'In review', persisted: true };
    case 'CLOSED':
      return { label: 'Closed', persisted: true };
    default:
      return { label: orgState.triage_status, persisted: true };
  }
}

function mapMaterialityPriority(materiality: string | null | undefined): string {
  if (!materiality?.trim()) return LAB_DISPLAY_UNAVAILABLE;
  const m = materiality.toLowerCase();
  if (m === 'high' || m === 'critical') return 'High';
  if (m === 'low') return 'Low';
  if (m === 'medium') return 'Medium';
  return materiality;
}

function mapApplicabilityClassification(
  applicability: PublicationListRow['applicability'],
): string {
  if (!applicability?.recommendation) return 'Unassessed';
  switch (applicability.recommendation.toUpperCase()) {
    case 'APPLICABLE':
      return 'Applicable';
    case 'POSSIBLY_APPLICABLE':
      return 'Possibly applicable';
    case 'NOT_APPLICABLE':
      return 'Not applicable';
    default:
      return 'Unassessed';
  }
}

/** Ingestion snapshot rows in regulatory_publication_versions (distinct from extraction revisions). */
export function mapIngestionVersionSemantics(input: {
  versionRowCount: number;
  source_hash: string | null;
  source_version: string | null;
}): {
  libraryVersion: string;
  libraryStatus: string;
  libraryVersionSource: string;
} {
  const rows = input.versionRowCount;
  if (rows > 0) {
    return {
      libraryVersion: String(rows),
      libraryStatus: rows === 1 ? 'Current' : 'Revised',
      libraryVersionSource: 'regulatory_publication_versions',
    };
  }
  const hash = input.source_hash?.trim();
  if (hash) {
    const ver = input.source_version?.trim();
    return {
      libraryVersion: ver || '1',
      libraryStatus: 'Ingested fingerprint',
      libraryVersionSource: 'regulatory_publications.source_hash',
    };
  }
  return {
    libraryVersion: LAB_DISPLAY_UNAVAILABLE,
    libraryStatus: 'No stored version',
    libraryVersionSource: 'none',
  };
}

function deriveConsultationDeadlineCandidate(summary: string | null | undefined): string | null {
  if (!summary?.trim()) return null;
  const m = summary.match(/consultation closes?\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/i);
  if (!m) return null;
  const day = m[1].padStart(2, '0');
  const month = m[2].padStart(2, '0');
  const year = m[3];
  return `${year}-${month}-${day}`;
}

export function buildLabPublicationDisplay(input: {
  title: string;
  publication_type: string | null;
  publication_date: string | null;
  summary: string | null;
  retrieved_at: string | null;
  data_origin: string;
  provenance: unknown;
  external_document_id: string | null;
  orgState: PublicationListRow['orgState'];
  applicability: PublicationListRow['applicability'];
  versionCount: number;
  source_hash?: string | null;
  source_version?: string | null;
  consultation_deadline?: string | null;
}): LabPublicationDisplay {
  const provenance = parseProvenance(input.provenance);
  const ref = deriveRegulatoryReference(input.title, input.external_document_id, provenance);
  const triage = mapPersistedTriage(input.orgState);
  const detectedAt = input.retrieved_at || provenance.retrievedAt || null;
  const topic =
    input.summary?.trim()?.slice(0, 200) ||
    formatPublicationType(input.publication_type) ||
    LAB_DISPLAY_UNAVAILABLE;

  const kind = classifyCatalogueKind(input.data_origin, provenance);
  const versionSemantics = mapIngestionVersionSemantics({
    versionRowCount: input.versionCount,
    source_hash: input.source_hash ?? null,
    source_version: input.source_version ?? null,
  });
  const consultationStructured = input.consultation_deadline?.trim() || null;
  const consultationCandidate = consultationStructured
    ? null
    : deriveConsultationDeadlineCandidate(input.summary);

  return {
    reference: ref.value,
    referenceSource: ref.source,
    topic,
    classification: mapApplicabilityClassification(input.applicability),
    aiRelevance: LAB_DISPLAY_UNAVAILABLE,
    aiPriority: mapMaterialityPriority(input.orgState?.materiality ?? null),
    businessAreas: LAB_DISPLAY_UNAVAILABLE,
    triage: triage.label,
    triagePersisted: triage.persisted,
    sla: input.orgState?.triage_sla_due
      ? input.orgState.triage_sla_due.slice(0, 10)
      : LAB_DISPLAY_UNAVAILABLE,
    detectedAt,
    publicationType: formatPublicationType(input.publication_type),
    libraryVersion: versionSemantics.libraryVersion,
    libraryStatus: versionSemantics.libraryStatus,
    libraryVersionSource: versionSemantics.libraryVersionSource,
    consultationDeadlineStructured: consultationStructured,
    consultationDeadlineCandidate: consultationCandidate,
    catalogueKind: kind,
    dataOriginLabel: input.data_origin || 'catalogue',
  };
}

export type PublicationDetailBundle = {
  publication: {
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
    regulator: { name: string; acronym: string; external_key: string } | null;
    source: { name: string; external_key: string } | null;
  };
  orgPublication: {
    triage_status: string;
    relevance_status: string | null;
    materiality: string | null;
    assigned_to: string | null;
    triage_sla_due: string | null;
  } | null;
  applicability: { recommendation: string; status: string } | null;
  versions: unknown[];
};

export function mapPublicationDetailToLabView(detail: PublicationDetailBundle): LabPublicationView {
  const pub = detail.publication;
  const regulator = Array.isArray(pub.regulator) ? pub.regulator[0] : pub.regulator;
  const source = Array.isArray(pub.source) ? pub.source[0] : pub.source;
  const orgState = detail.orgPublication
    ? {
        triage_status: detail.orgPublication.triage_status,
        relevance_status: detail.orgPublication.relevance_status,
        materiality: detail.orgPublication.materiality,
        assigned_to: detail.orgPublication.assigned_to,
        triage_sla_due: detail.orgPublication.triage_sla_due ?? null,
      }
    : null;
  const applicability = detail.applicability
    ? { recommendation: detail.applicability.recommendation, status: detail.applicability.status }
    : null;
  const versionCount = detail.versions?.length ?? 0;

  return mapPublicationListRowToLabView({
    id: pub.id,
    title: pub.title,
    publication_type: pub.publication_type,
    publication_date: pub.publication_date,
    effective_date: pub.effective_date,
    consultation_deadline: pub.consultation_deadline,
    canonical_url: pub.canonical_url,
    data_origin: pub.data_origin,
    source_hash: pub.source_hash ?? null,
    source_version: pub.source_version ?? null,
    external_document_id: pub.external_document_id,
    summary: pub.summary,
    retrieved_at: pub.retrieved_at,
    provenance: pub.provenance,
    versionCount,
    regulator,
    source,
    orgState,
    applicability,
  });
}

export function mapPublicationListRowToLabView(
  row: PublicationListRow & {
    summary?: string | null;
    retrieved_at?: string | null;
    provenance?: unknown;
    versionCount?: number;
  },
): LabPublicationView {
  const regulator = row.regulator?.acronym || row.regulator?.name || LAB_DISPLAY_UNAVAILABLE;
  const designLabRegulatorId = row.regulator?.external_key?.trim()
    ? row.regulator.external_key.trim().toUpperCase()
    : null;
  const landscapeSectorIds = landscapeSectorIdsForPublicationRegulator(row.regulator?.external_key);
  const versionCount = row.versionCount ?? 0;
  const display = buildLabPublicationDisplay({
    title: row.title,
    publication_type: row.publication_type,
    publication_date: row.publication_date,
    summary: row.summary ?? null,
    retrieved_at: row.retrieved_at ?? null,
    data_origin: row.data_origin,
    provenance: row.provenance,
    external_document_id: row.external_document_id,
    orgState: row.orgState,
    applicability: row.applicability,
    versionCount,
    source_hash: row.source_hash ?? null,
    source_version: row.source_version ?? null,
    consultation_deadline: row.consultation_deadline ?? null,
  });

  return {
    id: row.id,
    scenario: 'all',
    regulator,
    title: row.title,
    summary: row.summary ?? null,
    publicationType: display.publicationType,
    jurisdiction: 'UK',
    publishedDate: row.publication_date,
    effectiveDate: row.effective_date,
    consultationDeadline: row.consultation_deadline,
    sourceLabel: row.source?.name || null,
    sourceUrl: row.canonical_url || null,
    dataOrigin: row.data_origin || 'catalogue',
    catalogueScope: 'global',
    tenantOverlay: Boolean(row.orgState),
    canonicalUrl: row.canonical_url,
    versionCount,
    intakeEligible: true,
    display,
    designLabRegulatorId,
    landscapeSectorIds,
    _connected: true,
  };
}

export type LabChangeView = {
  id: string;
  publicationId: string;
  scenario: 'all';
  title: string;
  materiality: string;
  status: string;
  effectiveDate: string | null;
  _connected: true;
};

export function mapChangeRowToLabView(row: {
  id: string;
  title: string;
  status: string;
  materiality: string | null;
  effective_date: string | null;
  publication?: { id: string } | { id: string }[] | null;
}): LabChangeView {
  const pub = Array.isArray(row.publication) ? row.publication[0] : row.publication;
  const materiality =
    row.materiality === 'HIGH' || row.materiality === 'CRITICAL'
      ? 'High'
      : row.materiality === 'LOW'
        ? 'Low'
        : row.materiality
          ? 'Medium'
          : LAB_DISPLAY_UNAVAILABLE;
  const statusMap: Record<string, string> = {
    DRAFT: 'Draft',
    OPEN: 'Open',
    IN_PROGRESS: 'In progress',
    IMPLEMENTED: 'Implemented',
    CLOSED: 'Closed',
    CANCELLED: 'Cancelled',
  };
  return {
    id: row.id,
    publicationId: pub?.id || '',
    scenario: 'all',
    title: row.title,
    materiality,
    status: statusMap[row.status] || row.status,
    effectiveDate: row.effective_date,
    _connected: true,
  };
}

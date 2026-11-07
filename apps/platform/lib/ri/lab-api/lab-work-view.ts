import 'server-only';

import { resolveRecordProvenance, type RecordProvenanceKind } from '@/lib/ri/record-provenance';
import {
  classifyChangeForLab,
  changeLabProvenanceInputFromRow,
  labChangeClassificationLabel,
  type ChangeLabClass,
} from '@/lib/ri/lab-api/change-lab-provenance';
import {
  classifyObligationForLab,
  obligationLabProvenanceInputFromRow,
  recordKindForObligationLabClass,
} from '@/lib/ri/lab-api/obligation-lab-provenance';
import {
  classifyImpactForLab,
  impactLabProvenanceInputFromRow,
  recordKindForImpactLabClass,
} from '@/lib/ri/lab-api/impact-lab-provenance';

const STATUS_MAP: Record<string, string> = {
  DRAFT: 'Draft',
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  IMPLEMENTED: 'Implemented',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

const IMPACT_STATUS_MAP: Record<string, string> = {
  DRAFT: 'Draft',
  IN_REVIEW: 'In review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  SUPERSEDED: 'Superseded',
};

const OBLIGATION_STATUS_MAP: Record<string, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  IN_REVIEW: 'In review',
  IMPLEMENTED: 'Implemented',
  CLOSED: 'Closed',
  SUPERSEDED: 'Superseded',
};

function mapMateriality(raw: string | null | undefined): string {
  if (!raw?.trim()) return '—';
  const u = raw.toUpperCase();
  if (u === 'HIGH' || u === 'CRITICAL') return 'High';
  if (u === 'LOW') return 'Low';
  if (u === 'MEDIUM') return 'Medium';
  return raw;
}

function mapApplicabilityRecommendation(rec: string | null | undefined): string {
  if (!rec) return 'Pending';
  switch (rec.toUpperCase()) {
    case 'APPLICABLE':
      return 'Applicable';
    case 'POSSIBLY_APPLICABLE':
      return 'Review Required';
    case 'NOT_APPLICABLE':
      return 'Not Applicable';
    default:
      return rec;
  }
}

export type LabChangeView = {
  id: string;
  externalKey: string | null;
  publicationId: string;
  publicationTitle: string | null;
  regulator: string;
  regulatoryReference: string | null;
  scenario: 'all';
  title: string;
  description: string | null;
  changeType: string;
  materiality: string;
  status: string;
  statusCode: string;
  effectiveDate: string | null;
  dueDate: string | null;
  updatedAt: string | null;
  ownerId: string | null;
  ownerLabel: string;
  applicabilityRecommendation: string;
  applicabilityDecision: string | null;
  tenantScope: true;
  dataProvenance: RecordProvenanceKind;
  labClassification: ChangeLabClass;
  labClassificationLabel: string;
  _connected: true;
};

export type LabImpactAssessmentView = {
  id: string;
  changeId: string;
  changeTitle: string | null;
  publicationId: string | null;
  title: string;
  materiality: string;
  status: string;
  dueDate: string | null;
  ownerId: string | null;
  ownerLabel: string;
  reviewerId: string | null;
  approverId: string | null;
  tenantScope: true;
  dataProvenance: RecordProvenanceKind;
  labClassification: ChangeLabClass;
  labClassificationLabel: string;
  _connected: true;
};

export type LabObligationView = {
  id: string;
  externalKey: string | null;
  changeId: string | null;
  changeTitle: string | null;
  publicationId: string | null;
  publicationTitle: string | null;
  title: string;
  citation: string | null;
  status: string;
  priority: string | null;
  effectiveDate: string | null;
  dueDate: string | null;
  ownerId: string | null;
  ownerLabel: string;
  tenantScope: true;
  dataProvenance: RecordProvenanceKind;
  labClassification: ChangeLabClass;
  labClassificationLabel: string;
  _connected: true;
};

type PubEmbed = {
  id: string;
  title?: string;
  external_document_id?: string | null;
  regulator?: { acronym?: string; external_key?: string } | { acronym?: string; external_key?: string }[];
};

function normalizePub(pub: PubEmbed | PubEmbed[] | null | undefined): PubEmbed | null {
  if (!pub) return null;
  return Array.isArray(pub) ? pub[0] : pub;
}

export function mapChangeRowToLabWorkView(row: {
  id: string;
  external_key?: string | null;
  title: string;
  description?: string | null;
  change_type: string;
  status: string;
  materiality?: string | null;
  effective_date?: string | null;
  implementation_deadline?: string | null;
  owner_user_id?: string | null;
  publication_id?: string;
  updated_at?: string | null;
  origin?: string | null;
  metadata?: Record<string, unknown> | null;
  publication?: PubEmbed | PubEmbed[] | null;
  applicability?: { recommendation?: string; status?: string } | null;
}): LabChangeView {
  const pub = normalizePub(row.publication);
  const publicationId = pub?.id || row.publication_id || '';
  const regulator =
    (Array.isArray(pub?.regulator) ? pub?.regulator[0] : pub?.regulator)?.acronym || '—';
  const regRef = pub?.external_document_id?.trim() || null;
  const provInput = changeLabProvenanceInputFromRow({
    id: row.id,
    title: row.title,
    description: row.description,
    external_key: row.external_key,
    origin: row.origin,
    publication_id: publicationId,
    metadata: row.metadata,
  });
  const labClassification = classifyChangeForLab(provInput);
  return {
    id: row.id,
    externalKey: row.external_key ?? null,
    publicationId,
    publicationTitle: pub?.title ?? null,
    regulator,
    regulatoryReference: regRef,
    scenario: 'all',
    title: row.title,
    description: row.description ?? null,
    changeType: row.change_type,
    materiality: mapMateriality(row.materiality),
    status: STATUS_MAP[row.status] || row.status,
    statusCode: row.status,
    effectiveDate: row.effective_date ?? null,
    dueDate: row.implementation_deadline ?? null,
    updatedAt: row.updated_at ?? null,
    ownerId: row.owner_user_id ?? null,
    ownerLabel: row.owner_user_id ? `User ${row.owner_user_id.slice(0, 8)}…` : '—',
    applicabilityRecommendation: mapApplicabilityRecommendation(row.applicability?.recommendation),
    applicabilityDecision: row.applicability?.status
      ? mapApplicabilityRecommendation(row.applicability.recommendation)
      : null,
    tenantScope: true,
    dataProvenance: resolveRecordProvenance({
      title: row.title,
      description: row.description,
      externalKey: row.external_key,
      origin: row.origin,
      metadata: row.metadata,
    }),
    labClassification,
    labClassificationLabel: labChangeClassificationLabel(labClassification),
    _connected: true,
  };
}

export function mapImpactRowToLabView(row: {
  id: string;
  status: string;
  materiality?: string | null;
  due_date?: string | null;
  owner_user_id?: string | null;
  reviewer_user_id?: string | null;
  approver_user_id?: string | null;
  regulatory_change_id: string;
  metadata?: Record<string, unknown> | null;
  change?:
    | {
        id: string;
        title?: string;
        description?: string | null;
        external_key?: string | null;
        origin?: string | null;
        publication_id?: string;
        metadata?: Record<string, unknown> | null;
      }
    | {
        id: string;
        title?: string;
        description?: string | null;
        external_key?: string | null;
        origin?: string | null;
        publication_id?: string;
        metadata?: Record<string, unknown> | null;
      }[]
    | null;
}): LabImpactAssessmentView {
  const ch = Array.isArray(row.change) ? row.change[0] : row.change;
  const labClass = classifyImpactForLab(impactLabProvenanceInputFromRow(row));
  return {
    id: row.id,
    changeId: row.regulatory_change_id,
    changeTitle: ch?.title ?? null,
    publicationId: ch?.publication_id ?? null,
    title: ch?.title ? `Impact — ${ch.title}` : `Impact assessment ${row.id.slice(0, 8)}`,
    materiality: mapMateriality(row.materiality),
    status: IMPACT_STATUS_MAP[row.status] || row.status,
    dueDate: row.due_date ?? null,
    ownerId: row.owner_user_id ?? null,
    ownerLabel: row.owner_user_id ? `User ${row.owner_user_id.slice(0, 8)}…` : '—',
    reviewerId: row.reviewer_user_id ?? null,
    approverId: row.approver_user_id ?? null,
    tenantScope: true,
    dataProvenance: recordKindForImpactLabClass(labClass),
    labClassification: labClass,
    labClassificationLabel: labChangeClassificationLabel(labClass),
    _connected: true,
  };
}

export function mapObligationRowToLabView(row: {
  id: string;
  external_key?: string | null;
  obligation_statement: string;
  status: string;
  priority?: string | null;
  due_date?: string | null;
  effective_date?: string | null;
  owner_user_id?: string | null;
  regulatory_change_id?: string | null;
  publication_id?: string | null;
  citation?: string | null;
  metadata?: Record<string, unknown> | null;
  change?:
    | {
        id: string;
        title?: string;
        description?: string | null;
        external_key?: string | null;
        origin?: string | null;
        publication_id?: string;
        metadata?: Record<string, unknown> | null;
      }
    | {
        id: string;
        title?: string;
        description?: string | null;
        external_key?: string | null;
        origin?: string | null;
        publication_id?: string;
        metadata?: Record<string, unknown> | null;
      }[]
    | null;
  publication?: { id: string; title?: string } | { id: string; title?: string }[] | null;
}): LabObligationView {
  const ch = Array.isArray(row.change) ? row.change[0] : row.change;
  const pub = Array.isArray(row.publication) ? row.publication[0] : row.publication;
  const labClass = classifyObligationForLab(obligationLabProvenanceInputFromRow(row));
  return {
    id: row.id,
    externalKey: row.external_key ?? null,
    changeId: row.regulatory_change_id ?? ch?.id ?? null,
    changeTitle: ch?.title ?? null,
    publicationId: row.publication_id ?? pub?.id ?? null,
    publicationTitle: pub?.title ?? null,
    title: row.obligation_statement,
    citation: row.citation ?? null,
    status: OBLIGATION_STATUS_MAP[row.status] || row.status,
    priority: row.priority ?? null,
    effectiveDate: row.effective_date ?? null,
    dueDate: row.due_date ?? null,
    ownerId: row.owner_user_id ?? null,
    ownerLabel: row.owner_user_id ? `User ${row.owner_user_id.slice(0, 8)}…` : '—',
    tenantScope: true,
    dataProvenance: recordKindForObligationLabClass(labClass),
    labClassification: labClass,
    labClassificationLabel: labChangeClassificationLabel(labClass),
    _connected: true,
  };
}

export function mapChangeDetailToLabView(detail: {
  change: Record<string, unknown> & {
    id: string;
    title: string;
    description?: string | null;
    change_type?: string;
    status: string;
    materiality?: string | null;
    effective_date?: string | null;
    implementation_deadline?: string | null;
    owner_user_id?: string | null;
    external_key?: string | null;
    publication_id?: string;
    publication?: PubEmbed | PubEmbed[] | null;
  };
  applicability: { recommendation?: string; status?: string } | null;
  impacts: { id: string; status: string; materiality?: string | null }[];
  obligations: { id: string; status: string; obligation_statement: string }[];
}): LabChangeView & {
  impactIds: string[];
  obligationIds: string[];
  applicabilityStatus: string | null;
} {
  const pub = normalizePub(detail.change.publication);
  const base = mapChangeRowToLabWorkView({
    id: detail.change.id,
    external_key: detail.change.external_key as string | null | undefined,
    title: detail.change.title,
    description: detail.change.description as string | null | undefined,
    change_type: (detail.change.change_type as string) || '—',
    status: detail.change.status,
    materiality: detail.change.materiality as string | null | undefined,
    effective_date: detail.change.effective_date as string | null | undefined,
    implementation_deadline: detail.change.implementation_deadline as string | null | undefined,
    owner_user_id: detail.change.owner_user_id as string | null | undefined,
    publication_id: detail.change.publication_id as string,
    origin: (detail.change as { origin?: string }).origin,
    metadata: (detail.change as { metadata?: Record<string, unknown> }).metadata ?? null,
    updated_at: (detail.change as { updated_at?: string }).updated_at,
    publication: pub,
    applicability: detail.applicability,
  });
  return {
    ...base,
    impactIds: detail.impacts.map((i) => i.id),
    obligationIds: detail.obligations.map((o) => o.id),
    applicabilityStatus: detail.applicability?.status ?? null,
  };
}

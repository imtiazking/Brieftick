import 'server-only';

import type { DashboardSummary } from '@/lib/ri/services/dashboard';
import type { WorkflowEventRow } from '@/lib/ri/services/governance';
import type { AnalysisRunRow } from '@/lib/ri/services/ai-analysis';
import {
  aiRunLabProvenanceInputFromRow,
  classifyAiAnalysisRunForLab,
  labClassificationLabel,
  type AiAnalysisRunLabClass,
} from '@/lib/ri/lab-api/ai-run-lab-provenance';
import type { RecordProvenanceKind } from '@/lib/ri/record-provenance';
import {
  labChangeClassificationLabel,
  type ChangeLabClass,
} from '@/lib/ri/lab-api/change-lab-provenance';
import { recordKindForRiskControlLabClass } from '@/lib/ri/lab-api/risk-control-lab-provenance';
import {
  classifyRiskForLab,
  classifyControlForLab,
  riskLabProvenanceInputFromRow,
  controlLabProvenanceInputFromRow,
} from '@/lib/ri/lab-api/risk-control-lab-provenance';

function ownerLabel(ownerUserId: string | null | undefined): string {
  if (!ownerUserId) return '—';
  return ownerUserId.length > 12 ? `${ownerUserId.slice(0, 8)}…` : ownerUserId;
}

function mapStatus(raw: string | null | undefined, fallback = '—'): string {
  if (!raw?.trim()) return fallback;
  return raw
    .split('_')
    .map((p) => p.charAt(0) + p.slice(1).toLowerCase())
    .join(' ');
}

export type LabRiskView = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  owner: string;
  ownerId: string | null;
  inherentRisk: string | null;
  residualRisk: string | null;
  status: string;
  reviewDate: string | null;
  updatedAt: string | null;
  dataProvenance: RecordProvenanceKind;
  labClassification: ChangeLabClass;
  labClassificationLabel: string;
  tenantScope: true;
  _connected: true;
};

export type LabControlView = {
  id: string;
  name: string;
  description: string | null;
  owner: string;
  ownerId: string | null;
  controlType: string | null;
  frequency: string | null;
  effectiveness: string | null;
  testingStatus: string | null;
  status: string;
  updatedAt: string | null;
  dataProvenance: RecordProvenanceKind;
  labClassification: ChangeLabClass;
  labClassificationLabel: string;
  tenantScope: true;
  _connected: true;
};

export type LabPolicyView = {
  id: string;
  name: string;
  version: string | null;
  status: string;
  owner: string;
  ownerId: string | null;
  nextReviewDate: string | null;
  tenantScope: true;
  _connected: true;
};

export type LabEvidenceView = {
  id: string;
  title: string;
  evidenceType: string;
  sourceHash: string | null;
  createdAt: string | null;
  dataProvenance: RecordProvenanceKind;
  labClassification: ChangeLabClass;
  labClassificationLabel: string;
  tenantScope: true;
  _connected: true;
};

export type LabFindingView = {
  id: string;
  title: string;
  severity: string;
  status: string;
  dueDate: string | null;
  owner: string;
  ownerId: string | null;
  tenantScope: true;
  _connected: true;
};

export type LabAssuranceReviewView = {
  id: string;
  reviewType: string;
  result: string;
  reviewDate: string | null;
  reviewer: string;
  reviewerId: string | null;
  tenantScope: true;
  _connected: true;
};

export type LabActionView = {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  dueDate: string | null;
  owner: string;
  ownerId: string | null;
  overdue: boolean;
  tenantScope: true;
  _connected: true;
};

export type LabWorkflowEventView = {
  id: string;
  entityType: string;
  entityId: string;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  actorUserId: string | null;
  occurredAt: string;
  metadata?: Record<string, unknown> | null;
  tenantScope: true;
  _connected: true;
};

export type LabAiAnalysisRunView = {
  id: string;
  useCaseId: string;
  publicationId: string;
  executionStatus: string;
  reviewStatus: string;
  provider: string;
  model: string | null;
  createdAt: string;
  completedAt: string | null;
  humanReviewRequired: boolean;
  labClassification: AiAnalysisRunLabClass;
  labClassificationLabel: string;
  findingsPreview: string | null;
  claimsCount: number;
  tenantScope: true;
  _connected: true;
};

export type LabGovernanceMetricsView = {
  changesOpen: number;
  impactsInProgress: number;
  impactsAwaitingReview: number;
  obligationsActive: number;
  obligationsOverdue: number;
  findingsOpen: number;
  assuranceOpen: number;
  controlsRequiringTest: number;
  risksOpen: number;
  actionsOverdue: number;
  workflowEventCount: number;
  tenantScope: true;
  _connected: true;
};

export function mapRiskRowToLabView(row: Record<string, unknown>): LabRiskView {
  const labClass = classifyRiskForLab(riskLabProvenanceInputFromRow(row));
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    description: (row.description as string) ?? null,
    category: (row.category as string) ?? null,
    ownerId: (row.owner_user_id as string) ?? null,
    owner: ownerLabel(row.owner_user_id as string),
    inherentRisk: (row.inherent_risk as string) ?? null,
    residualRisk: (row.residual_risk as string) ?? null,
    status: mapStatus(row.status as string, 'Open'),
    reviewDate: (row.review_date as string) ?? null,
    updatedAt: (row.updated_at as string) ?? null,
    dataProvenance: recordKindForRiskControlLabClass(labClass),
    labClassification: labClass,
    labClassificationLabel: labChangeClassificationLabel(labClass),
    tenantScope: true,
    _connected: true,
  };
}

export function mapControlRowToLabView(row: Record<string, unknown>): LabControlView {
  const labClass = classifyControlForLab(controlLabProvenanceInputFromRow(row));
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    description: (row.description as string) ?? null,
    ownerId: (row.owner_user_id as string) ?? null,
    owner: ownerLabel(row.owner_user_id as string),
    controlType: (row.control_type as string) ?? null,
    frequency: (row.frequency as string) ?? null,
    effectiveness: (row.effectiveness as string) ?? null,
    testingStatus: (row.testing_status as string) ?? null,
    status: mapStatus(row.status as string, 'Active'),
    updatedAt: (row.updated_at as string) ?? null,
    dataProvenance: recordKindForRiskControlLabClass(labClass),
    labClassification: labClass,
    labClassificationLabel: labChangeClassificationLabel(labClass),
    tenantScope: true,
    _connected: true,
  };
}

export function mapPolicyRowToLabView(row: Record<string, unknown>): LabPolicyView {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    version: (row.version as string) ?? null,
    status: mapStatus(row.status as string, 'Draft'),
    ownerId: (row.owner_user_id as string) ?? null,
    owner: ownerLabel(row.owner_user_id as string),
    nextReviewDate: (row.next_review_date as string) ?? null,
    tenantScope: true,
    _connected: true,
  };
}

export function mapEvidenceRowToLabView(row: Record<string, unknown>): LabEvidenceView {
  const labClass = classifyRiskForLab(riskLabProvenanceInputFromRow(row));
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    evidenceType: String(row.evidence_type ?? '—'),
    sourceHash: (row.source_hash as string) ?? null,
    createdAt: (row.created_at as string) ?? null,
    dataProvenance: recordKindForRiskControlLabClass(labClass),
    labClassification: labClass,
    labClassificationLabel: labChangeClassificationLabel(labClass),
    tenantScope: true,
    _connected: true,
  };
}

export function mapFindingRowToLabView(row: Record<string, unknown>): LabFindingView {
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    severity: String(row.severity ?? '—'),
    status: mapStatus(row.status as string, 'Open'),
    dueDate: (row.due_date as string) ?? null,
    ownerId: (row.owner_user_id as string) ?? null,
    owner: ownerLabel(row.owner_user_id as string),
    tenantScope: true,
    _connected: true,
  };
}

export function mapAssuranceRowToLabView(row: Record<string, unknown>): LabAssuranceReviewView {
  return {
    id: String(row.id),
    reviewType: String(row.review_type ?? '—'),
    result: String(row.result ?? '—'),
    reviewDate: (row.review_date as string) ?? null,
    reviewerId: (row.reviewer_user_id as string) ?? null,
    reviewer: ownerLabel(row.reviewer_user_id as string),
    tenantScope: true,
    _connected: true,
  };
}

export function mapActionRowToLabView(row: Record<string, unknown>): LabActionView {
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    status: mapStatus(row.status as string, 'Open'),
    priority: (row.priority as string) ?? null,
    dueDate: (row.due_date as string) ?? null,
    ownerId: (row.owner_user_id as string) ?? null,
    owner: ownerLabel(row.owner_user_id as string),
    overdue: Boolean(row.overdue),
    tenantScope: true,
    _connected: true,
  };
}

export function mapWorkflowEventToLabView(row: WorkflowEventRow): LabWorkflowEventView {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    eventType: row.event_type,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    actorUserId: row.actor_user_id,
    occurredAt: row.occurred_at,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    tenantScope: true,
    _connected: true,
  };
}

export function mapAiRunToLabView(row: AnalysisRunRow): LabAiAnalysisRunView {
  const review = row.review_status?.toUpperCase?.() ?? '';
  const input = aiRunLabProvenanceInputFromRow(row);
  const labClassification = classifyAiAnalysisRunForLab(input);
  const so = row.structured_output;
  const claims = so && Array.isArray(so.claims) ? so.claims : [];
  const candidates = so && Array.isArray(so.candidates) ? so.candidates : [];
  const outputItems = claims.length ? claims : candidates;
  const firstClaim = outputItems[0] as { text?: string; statement?: string; summary?: string } | undefined;
  const findingsPreview =
    (typeof so?.classification === 'string' && so.classification) ||
    (typeof firstClaim?.text === 'string' && firstClaim.text) ||
    (typeof firstClaim?.statement === 'string' && firstClaim.statement) ||
    (typeof firstClaim?.summary === 'string' && firstClaim.summary) ||
    null;
  return {
    id: row.id,
    useCaseId: row.use_case_id,
    publicationId: row.publication_id,
    executionStatus: mapStatus(row.execution_status, '—'),
    reviewStatus: mapStatus(row.review_status, 'Pending'),
    provider: row.provider,
    model: row.model,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    humanReviewRequired: review === 'PENDING' || review === 'REQUIRED',
    labClassification,
    labClassificationLabel: labClassificationLabel(labClassification),
    findingsPreview,
    claimsCount: outputItems.length,
    tenantScope: true,
    _connected: true,
  };
}

export function buildLabGovernanceMetrics(params: {
  summary: DashboardSummary;
  impactsAwaitingReview: number;
  controlsRequiringTest: number;
  risksOpen: number;
  workflowEventCount: number;
}): LabGovernanceMetricsView {
  return {
    changesOpen: params.summary.changesOpen,
    impactsInProgress: params.summary.impactsInProgress,
    impactsAwaitingReview: params.impactsAwaitingReview,
    obligationsActive: params.summary.obligationsActive,
    obligationsOverdue: params.summary.obligationsOverdue,
    findingsOpen: params.summary.findingsOpen,
    assuranceOpen: params.summary.assuranceOpen,
    controlsRequiringTest: params.controlsRequiringTest,
    risksOpen: params.risksOpen,
    actionsOverdue: params.summary.actionsOverdue,
    workflowEventCount: params.workflowEventCount,
    tenantScope: true,
    _connected: true,
  };
}

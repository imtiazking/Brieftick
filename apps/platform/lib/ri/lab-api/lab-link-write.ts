import 'server-only';

import { parseChangeCreateMode } from '@/lib/ri/lab-api/change-create-provenance';
import { RiValidationError } from '@/lib/ri/errors';
import { parseAssuranceResult, parseOptionalText, parseRequiredText, parseUuid } from '@/lib/ri/validation';

const LINK_TYPES = [
  'obligation_risk',
  'obligation_control',
  'risk_control',
  'evidence_obligation',
  'evidence_control',
  'evidence_regulatory_change',
  'assurance_control',
  'finding_control',
] as const;

export type LabLinkType = (typeof LINK_TYPES)[number];

export function parseLabLinkBody(body: unknown): {
  linkType: LabLinkType;
  leftId: string;
  rightId: string;
} {
  if (!body || typeof body !== 'object') throw new RiValidationError('invalid_body');
  const raw = body as Record<string, unknown>;
  const linkType = String(raw.linkType || '') as LabLinkType;
  if (!LINK_TYPES.includes(linkType)) throw new RiValidationError('invalid_link_type');
  return {
    linkType,
    leftId: parseUuid(raw.leftId, 'left_id'),
    rightId: parseUuid(raw.rightId, 'right_id'),
  };
}

export function parseLabRiskCreateBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') throw new RiValidationError('invalid_body');
  const raw = body as Record<string, unknown>;
  if ('metadata' in raw || 'recordProvenance' in raw || 'record_provenance' in raw) {
    throw new RiValidationError('client_provenance_rejected');
  }
  const fields: Record<string, unknown> = {
    title: parseRequiredText(raw.title, 'title', 500),
    description: parseOptionalText(raw.description, 8000),
    category: parseOptionalText(raw.category, 200),
    inherent_risk: parseOptionalText(raw.inherent_risk, 100),
    residual_risk: parseOptionalText(raw.residual_risk, 100),
    status: parseOptionalText(raw.status, 50),
    review_date: raw.review_date,
  };
  if (raw.creationMode !== undefined) fields.creationMode = raw.creationMode;
  if (raw.regulatoryObligationId !== undefined) fields.regulatoryObligationId = raw.regulatoryObligationId;
  if (raw.regulatory_obligation_id !== undefined) fields.regulatory_obligation_id = raw.regulatory_obligation_id;
  return fields;
}

export function parseLabControlCreateBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') throw new RiValidationError('invalid_body');
  const raw = body as Record<string, unknown>;
  if ('metadata' in raw || 'recordProvenance' in raw || 'record_provenance' in raw) {
    throw new RiValidationError('client_provenance_rejected');
  }
  const fields: Record<string, unknown> = {
    name: parseRequiredText(raw.name, 'name', 500),
    description: parseOptionalText(raw.description, 8000),
    control_type: parseOptionalText(raw.control_type, 200),
    frequency: parseOptionalText(raw.frequency, 200),
    effectiveness: parseOptionalText(raw.effectiveness, 200),
    testing_status: parseOptionalText(raw.testing_status, 200),
    status: parseOptionalText(raw.status, 50),
  };
  if (raw.creationMode !== undefined) fields.creationMode = raw.creationMode;
  if (raw.riskId !== undefined) fields.riskId = raw.riskId;
  if (raw.risk_id !== undefined) fields.risk_id = raw.risk_id;
  return fields;
}

export function parseLabEvidenceCreateBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') throw new RiValidationError('invalid_body');
  const raw = body as Record<string, unknown>;
  if ('metadata' in raw || 'recordProvenance' in raw || 'record_provenance' in raw) {
    throw new RiValidationError('client_provenance_rejected');
  }
  const fields: Record<string, unknown> = {
    title: parseRequiredText(raw.title, 'title', 500),
    evidence_type: parseRequiredText(raw.evidenceType ?? raw.evidence_type, 'evidence_type', 200),
    description: parseOptionalText(raw.description, 8000),
    source_url: parseOptionalText(raw.sourceUrl ?? raw.source_url, 2000),
    source_hash: parseOptionalText(raw.sourceHash ?? raw.source_hash, 200),
  };
  if (raw.creationMode !== undefined) fields.creationMode = raw.creationMode;
  if (raw.controlId !== undefined) fields.controlId = raw.controlId;
  if (raw.control_id !== undefined) fields.control_id = raw.control_id;
  return fields;
}

export function parseLabFindingCreateBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') throw new RiValidationError('invalid_body');
  const raw = body as Record<string, unknown>;
  if ('metadata' in raw || 'recordProvenance' in raw || 'record_provenance' in raw) {
    throw new RiValidationError('client_provenance_rejected');
  }
  const fields: Record<string, unknown> = {
    title: parseRequiredText(raw.title, 'title', 500),
    description: parseOptionalText(raw.description, 8000),
    severity: parseRequiredText(raw.severity ?? raw.severityCode, 'severity', 50),
    due_date: raw.due_date ?? raw.dueDate,
  };
  if (raw.creationMode !== undefined) fields.creationMode = raw.creationMode;
  if (raw.controlId !== undefined) fields.controlId = raw.controlId;
  if (raw.control_id !== undefined) fields.control_id = raw.control_id;
  if (raw.riskId !== undefined) fields.riskId = raw.riskId;
  if (raw.risk_id !== undefined) fields.risk_id = raw.risk_id;
  return fields;
}

export function parseLabFindingPatchBody(body: unknown): {
  fields: Record<string, unknown>;
  expectedUpdatedAt: string | null;
} {
  if (!body || typeof body !== 'object') throw new RiValidationError('invalid_body');
  const raw = body as Record<string, unknown>;
  const expectedUpdatedAt =
    raw.expectedUpdatedAt === null || raw.expectedUpdatedAt === undefined || raw.expectedUpdatedAt === ''
      ? null
      : parseRequiredText(raw.expectedUpdatedAt, 'expected_updated_at', 64);
  const fields: Record<string, unknown> = {};
  for (const key of ['title', 'description', 'severity', 'due_date', 'status']) {
    if (key in raw) fields[key] = raw[key];
  }
  if (!Object.keys(fields).length) throw new RiValidationError('missing_patch_fields');
  return { fields, expectedUpdatedAt };
}

export function parseLabAssuranceCreateBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object') throw new RiValidationError('invalid_body');
  const raw = body as Record<string, unknown>;
  if ('metadata' in raw || 'recordProvenance' in raw || 'record_provenance' in raw) {
    throw new RiValidationError('client_provenance_rejected');
  }
  const fields: Record<string, unknown> = {
    review_type: parseRequiredText(raw.review_type ?? raw.reviewType, 'review_type', 200),
    result: parseAssuranceResult(raw.result ?? 'NOT_TESTED'),
    notes: parseOptionalText(raw.notes, 8000),
    review_date: raw.review_date ?? raw.reviewDate,
    next_review_date: raw.next_review_date ?? raw.nextReviewDate,
    creationMode: parseChangeCreateMode(raw.creationMode, { defaultMode: 'uat_authorised' }),
  };
  if (raw.controlId !== undefined) fields.controlId = raw.controlId;
  if (raw.control_id !== undefined) fields.control_id = raw.control_id;
  return fields;
}

export function parseLabAssurancePatchBody(body: unknown): {
  fields: Record<string, unknown>;
  expectedUpdatedAt: string | null;
} {
  if (!body || typeof body !== 'object') throw new RiValidationError('invalid_body');
  const raw = body as Record<string, unknown>;
  const expectedUpdatedAt =
    raw.expectedUpdatedAt === null || raw.expectedUpdatedAt === undefined || raw.expectedUpdatedAt === ''
      ? null
      : parseRequiredText(raw.expectedUpdatedAt, 'expected_updated_at', 64);
  const fields: Record<string, unknown> = {};
  if ('result' in raw) fields.result = parseAssuranceResult(raw.result);
  if ('notes' in raw) fields.notes = parseOptionalText(raw.notes, 8000);
  if (!Object.keys(fields).length) throw new RiValidationError('missing_patch_fields');
  return { fields, expectedUpdatedAt };
}

export function parseLabApplicabilityPatchBody(body: unknown): {
  assessmentId: string | null;
  recommendation: string;
  rationale: string | null;
  status: string | undefined;
  expectedUpdatedAt: string | null;
} {
  if (!body || typeof body !== 'object') throw new RiValidationError('invalid_body');
  const raw = body as Record<string, unknown>;
  const expectedUpdatedAt =
    raw.expectedUpdatedAt === null || raw.expectedUpdatedAt === undefined || raw.expectedUpdatedAt === ''
      ? null
      : parseRequiredText(raw.expectedUpdatedAt, 'expected_updated_at', 64);
  return {
    assessmentId:
      raw.assessmentId === null || raw.assessmentId === undefined || raw.assessmentId === ''
        ? null
        : parseUuid(raw.assessmentId, 'assessment_id'),
    recommendation: parseRequiredText(raw.recommendation, 'recommendation', 100),
    rationale: parseOptionalText(raw.rationale, 12000),
    status: typeof raw.status === 'string' ? raw.status : undefined,
    expectedUpdatedAt,
  };
}

export function parseLabApplicabilityWorkflowBody(body: unknown): {
  action: 'submit' | 'approve' | 'reject' | null;
  rationale: string | null;
  decisionComments: string | null;
  assignReviewer: string | null;
  expectedUpdatedAt: string | null;
} {
  if (!body || typeof body !== 'object') throw new RiValidationError('invalid_body');
  const raw = body as Record<string, unknown>;
  const expectedUpdatedAt =
    raw.expectedUpdatedAt === null || raw.expectedUpdatedAt === undefined || raw.expectedUpdatedAt === ''
      ? null
      : parseRequiredText(raw.expectedUpdatedAt, 'expected_updated_at', 64);
  const actionRaw = raw.action === null || raw.action === undefined ? null : String(raw.action);
  const action =
    actionRaw === 'submit' || actionRaw === 'approve' || actionRaw === 'reject' ? actionRaw : null;
  return {
    action,
    rationale: parseOptionalText(raw.rationale, 12000),
    decisionComments: parseOptionalText(raw.decisionComments, 12000),
    assignReviewer: parseOptionalText(raw.assignReviewer ?? raw.reviewerUserId, 200),
    expectedUpdatedAt,
  };
}

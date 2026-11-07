import 'server-only';

import { RiValidationError } from '@/lib/ri/errors';
import { parseOptionalDate, parseOptionalText, parseRequiredText, parseUuid } from '@/lib/ri/validation';

export function parseLabImpactCreateBody(body: unknown): { regulatoryChangeId: string } {
  if (!body || typeof body !== 'object') throw new RiValidationError('invalid_body');
  const raw = body as Record<string, unknown>;
  return { regulatoryChangeId: parseUuid(raw.regulatoryChangeId, 'regulatory_change_id') };
}

export function parseLabImpactPatchBody(body: unknown): {
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
  for (const key of [
    'business_impact',
    'operational_impact',
    'technology_impact',
    'compliance_impact',
    'financial_impact',
    'implementation_complexity',
    'materiality',
    'due_date',
    'business_areas',
    'action',
    'owner_user_id',
  ]) {
    if (key in raw) fields[key] = raw[key];
  }
  if (!Object.keys(fields).length) throw new RiValidationError('missing_patch_fields');
  return { fields, expectedUpdatedAt };
}

export function parseLabObligationCreateBody(body: unknown): {
  regulatoryChangeId: string;
  obligationStatement: string;
  citation: string | null;
  priority: string | null;
  dueDate: string | null;
  status: string | undefined;
} {
  if (!body || typeof body !== 'object') throw new RiValidationError('invalid_body');
  const raw = body as Record<string, unknown>;
  return {
    regulatoryChangeId: parseUuid(raw.regulatoryChangeId, 'regulatory_change_id'),
    obligationStatement: parseRequiredText(raw.obligationStatement, 'obligation_statement', 12000),
    citation: parseOptionalText(raw.citation, 2000),
    priority: parseOptionalText(raw.priority, 100),
    dueDate: parseOptionalDate(raw.dueDate),
    status: typeof raw.status === 'string' ? raw.status : undefined,
  };
}

export function parseLabObligationPatchBody(body: unknown): {
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
  for (const key of [
    'obligation_statement',
    'citation',
    'priority',
    'due_date',
    'status',
    'owner_user_id',
  ]) {
    if (key in raw) fields[key] = raw[key];
  }
  if (!Object.keys(fields).length) throw new RiValidationError('missing_patch_fields');
  return { fields, expectedUpdatedAt };
}

export function parseLabRiskPatchBody(body: unknown): {
  fields: Record<string, unknown>;
  expectedUpdatedAt: string | null;
} {
  if (!body || typeof body !== 'object') throw new RiValidationError('invalid_body');
  const raw = body as Record<string, unknown>;
  if ('metadata' in raw || 'recordProvenance' in raw || 'record_provenance' in raw) {
    throw new RiValidationError('client_provenance_rejected');
  }
  const expectedUpdatedAt =
    raw.expectedUpdatedAt === null || raw.expectedUpdatedAt === undefined || raw.expectedUpdatedAt === ''
      ? null
      : parseRequiredText(raw.expectedUpdatedAt, 'expected_updated_at', 64);
  const fields: Record<string, unknown> = {};
  for (const key of [
    'title',
    'description',
    'category',
    'inherent_risk',
    'residual_risk',
    'status',
    'review_date',
  ]) {
    if (key in raw) fields[key] = raw[key];
  }
  if (!Object.keys(fields).length) throw new RiValidationError('missing_patch_fields');
  return { fields, expectedUpdatedAt };
}

export function parseLabControlPatchBody(body: unknown): {
  fields: Record<string, unknown>;
  expectedUpdatedAt: string | null;
} {
  if (!body || typeof body !== 'object') throw new RiValidationError('invalid_body');
  const raw = body as Record<string, unknown>;
  if ('metadata' in raw || 'recordProvenance' in raw || 'record_provenance' in raw) {
    throw new RiValidationError('client_provenance_rejected');
  }
  const expectedUpdatedAt =
    raw.expectedUpdatedAt === null || raw.expectedUpdatedAt === undefined || raw.expectedUpdatedAt === ''
      ? null
      : parseRequiredText(raw.expectedUpdatedAt, 'expected_updated_at', 64);
  const fields: Record<string, unknown> = {};
  for (const key of [
    'name',
    'description',
    'control_type',
    'frequency',
    'nature',
    'execution_type',
    'effectiveness',
    'testing_status',
    'status',
  ]) {
    if (key in raw) fields[key] = raw[key];
  }
  if (!Object.keys(fields).length) throw new RiValidationError('missing_patch_fields');
  return { fields, expectedUpdatedAt };
}

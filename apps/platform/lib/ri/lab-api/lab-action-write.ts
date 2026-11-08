import 'server-only';

import { RiValidationError } from '@/lib/ri/errors';
import { parseLabActionParentIds } from '@/lib/ri/lab-api/action-lab-provenance';
import { parseOptionalDate, parseOptionalText, parseRequiredText } from '@/lib/ri/validation';

export function parseLabActionCreateBody(body: unknown) {
  if (!body || typeof body !== 'object') throw new RiValidationError('invalid_body');
  const raw = body as Record<string, unknown>;
  if ('metadata' in raw || 'recordProvenance' in raw) throw new RiValidationError('client_provenance_rejected');
  const parents = parseLabActionParentIds(raw);
  return {
    title: parseRequiredText(raw.title, 'title', 500),
    description: parseOptionalText(raw.description, 8000),
    sourceType: parseOptionalText(raw.source_type, 100) ?? 'compliance_remediation',
    priority: parseOptionalText(raw.priority, 100),
    dueDate: parseOptionalDate(raw.due_date),
    ownerUserId:
      raw.owner_user_id === null || raw.owner_user_id === undefined || raw.owner_user_id === ''
        ? null
        : parseRequiredText(raw.owner_user_id, 'owner_user_id', 128),
    ...parents,
  };
}

export function parseLabActionPatchBody(body: unknown): {
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
  for (const key of ['title', 'description', 'priority', 'due_date', 'status', 'escalation_status']) {
    if (key in raw) fields[key] = raw[key];
  }
  if ('owner_user_id' in raw) fields.owner_user_id = raw.owner_user_id;
  if (!Object.keys(fields).length) throw new RiValidationError('missing_patch_fields');
  return { fields, expectedUpdatedAt };
}

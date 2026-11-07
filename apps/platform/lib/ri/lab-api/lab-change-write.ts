import 'server-only';

import { RiValidationError } from '@/lib/ri/errors';
import {
  CHANGE_STATUSES,
  parseEnum,
  parseOptionalDate,
  parseOptionalText,
  parseRequiredText,
  parseUuid,
} from '@/lib/ri/validation';
import { parseChangeCreateMode, type ChangeCreateMode } from '@/lib/ri/lab-api/change-create-provenance';

export type LabChangeCreateInput = {
  publicationId: string;
  title: string;
  description: string | null;
  changeType: string;
  materiality: string | null;
  effectiveDate: string | null;
  implementationDeadline: string | null;
  status: (typeof CHANGE_STATUSES)[number];
  creationMode: ChangeCreateMode;
};

export function parseLabChangeCreateBody(body: unknown): LabChangeCreateInput {
  if (!body || typeof body !== 'object') {
    throw new RiValidationError('invalid_body');
  }
  const raw = body as Record<string, unknown>;
  const statusRaw = raw.status;
  const status = statusRaw
    ? parseEnum(String(statusRaw), CHANGE_STATUSES, 'change_status')
    : 'DRAFT';
  return {
    publicationId: parseUuid(raw.publicationId, 'publication_id'),
    title: parseRequiredText(raw.title, 'title', 500),
    description: parseOptionalText(raw.description, 12000),
    changeType: parseRequiredText(raw.changeType, 'change_type', 200),
    materiality: parseOptionalText(raw.materiality, 100),
    effectiveDate: parseOptionalDate(raw.effectiveDate),
    implementationDeadline: parseOptionalDate(raw.implementationDeadline),
    status,
    creationMode: parseChangeCreateMode(raw.creationMode),
  };
}

export function parseLabChangeStatusPatch(body: unknown): {
  status: (typeof CHANGE_STATUSES)[number];
  expectedUpdatedAt: string | null;
} {
  if (!body || typeof body !== 'object') {
    throw new RiValidationError('invalid_body');
  }
  const raw = body as Record<string, unknown>;
  const status = parseEnum(raw.status, CHANGE_STATUSES, 'change_status');
  const expectedUpdatedAt =
    raw.expectedUpdatedAt === null || raw.expectedUpdatedAt === undefined || raw.expectedUpdatedAt === ''
      ? null
      : parseRequiredText(raw.expectedUpdatedAt, 'expected_updated_at', 64);
  return { status, expectedUpdatedAt };
}

export function parseLabChangePatch(body: unknown): {
  status?: (typeof CHANGE_STATUSES)[number];
  ownerUserId?: string;
  materiality?: string | null;
  implementationDeadline?: string | null;
  changeType?: string;
  expectedUpdatedAt: string | null;
} {
  if (!body || typeof body !== 'object') {
    throw new RiValidationError('invalid_body');
  }
  const raw = body as Record<string, unknown>;
  const hasStatus = raw.status !== undefined && raw.status !== null && raw.status !== '';
  const hasOwner =
    raw.ownerUserId !== undefined && raw.ownerUserId !== null && raw.ownerUserId !== '';
  const hasMateriality = 'materiality' in raw;
  const hasDeadline = 'implementationDeadline' in raw;
  const hasChangeType = raw.changeType !== undefined && raw.changeType !== null && raw.changeType !== '';
  if (!hasStatus && !hasOwner && !hasMateriality && !hasDeadline && !hasChangeType) {
    throw new RiValidationError('missing_patch_fields');
  }
  const expectedUpdatedAt =
    raw.expectedUpdatedAt === null || raw.expectedUpdatedAt === undefined || raw.expectedUpdatedAt === ''
      ? null
      : parseRequiredText(raw.expectedUpdatedAt, 'expected_updated_at', 64);
  return {
    ...(hasStatus
      ? { status: parseEnum(raw.status, CHANGE_STATUSES, 'change_status') }
      : {}),
    ...(hasOwner ? { ownerUserId: parseRequiredText(raw.ownerUserId, 'owner_user_id', 256) } : {}),
    ...(hasMateriality ? { materiality: parseOptionalText(raw.materiality, 100) } : {}),
    ...(hasDeadline
      ? { implementationDeadline: parseOptionalDate(raw.implementationDeadline) }
      : {}),
    ...(hasChangeType ? { changeType: parseRequiredText(raw.changeType, 'change_type', 200) } : {}),
    expectedUpdatedAt,
  };
}

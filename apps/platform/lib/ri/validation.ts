import { RiValidationError } from '@/lib/ri/errors';
import { APPLICABILITY_RECOMMENDATIONS, OBLIGATION_STATUSES } from '@/lib/ri/enums';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID_RE.test(value.trim())) {
    throw new RiValidationError(`invalid_${field}`);
  }
  return value.trim();
}

export function parseOptionalUuid(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  return parseUuid(value, field);
}

export function parseEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new RiValidationError(`invalid_${field}`);
  }
  return value as T;
}

export function parseOptionalText(value: unknown, max = 8000): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new RiValidationError('invalid_text');
  const t = value.trim();
  if (t.length > max) throw new RiValidationError('text_too_long');
  return t;
}

export function parseRequiredText(value: unknown, field: string, max = 8000): string {
  const t = parseOptionalText(value, max);
  if (!t) throw new RiValidationError(`missing_${field}`);
  return t;
}

export function parseStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export function parseOptionalDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RiValidationError('invalid_date');
  }
  return value;
}

export const TRIAGE_STATUSES = ['NEW', 'TRIAGED', 'IN_REVIEW', 'CLOSED'] as const;
export const RELEVANCE_STATUSES = ['RELEVANT', 'NOT_RELEVANT', 'UNASSESSED'] as const;
export const CHANGE_STATUSES = [
  'DRAFT',
  'OPEN',
  'IN_PROGRESS',
  'IMPLEMENTED',
  'CLOSED',
  'CANCELLED',
] as const;
export const IMPACT_STATUSES = [
  'DRAFT',
  'IN_PROGRESS',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'CLOSED',
] as const;

export function parseApplicabilityRecommendation(value: unknown) {
  return parseEnum(value, APPLICABILITY_RECOMMENDATIONS, 'recommendation');
}

export function parseObligationStatus(value: unknown) {
  return parseEnum(value, OBLIGATION_STATUSES, 'obligation_status');
}

export const ASSURANCE_RESULTS = [
  'PASS',
  'PASS_WITH_OBSERVATIONS',
  'FAIL',
  'NOT_TESTED',
] as const;

export function parseAssuranceResult(value: unknown) {
  return parseEnum(value, ASSURANCE_RESULTS, 'assurance_result');
}

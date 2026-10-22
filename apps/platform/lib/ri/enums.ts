/**
 * RI lifecycle enums — keep aligned with Postgres types in supabase/migrations (Phase 3).
 */

export const OBLIGATION_STATUSES = [
  'DRAFT',
  'IN_REVIEW',
  'OPEN',
  'IN_PROGRESS',
  'OVERDUE',
  'COMPLETE',
  'HISTORIC',
  'CLOSED',
] as const;

export type ObligationStatus = (typeof OBLIGATION_STATUSES)[number];

/** Canonical production groupings (reporting — not separate DB enums). */
export const OBLIGATION_STATUS_GROUPS = {
  active: ['OPEN', 'IN_PROGRESS', 'OVERDUE'] as const,
  terminal: ['COMPLETE', 'HISTORIC', 'CLOSED'] as const,
  preActive: ['DRAFT', 'IN_REVIEW'] as const,
};

export const APPLICABILITY_RECOMMENDATIONS = [
  'APPLICABLE',
  'POSSIBLY_APPLICABLE',
  'NOT_APPLICABLE',
  'UNASSESSED',
] as const;

export type ApplicabilityRecommendation = (typeof APPLICABILITY_RECOMMENDATIONS)[number];

export const PRODUCTION_SOURCE_STATUSES = ['NOT_ENABLED', 'ENABLED', 'DISABLED'] as const;

export type ProductionSourceStatus = (typeof PRODUCTION_SOURCE_STATUSES)[number];

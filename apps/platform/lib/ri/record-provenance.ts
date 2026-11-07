import 'server-only';

/**
 * Persisted + inferred record provenance for Design Lab operational views.
 * Absence of a UAT prefix does NOT imply genuine operational activity.
 */

import {
  isSyntheticPublicationOrigin,
  type UatProvenanceInput,
} from '@/lib/ri/uat-record-provenance';

export type RecordProvenanceKind =
  | 'regulatory_catalogue'
  | 'synthetic_fixture'
  | 'synthetic_uat'
  | 'ai_draft'
  | 'tenant_operational'
  | 'uat_authorised'
  | 'unverified';

export const RECORD_PROVENANCE_METADATA_KEY = 'recordProvenance';

const SYNTHETIC_TEXT_PATTERNS: RegExp[] = [
  /\bUAT-83H\b/i,
  /\bUAT-83F\b/i,
  /\bUAT-83H-CLOSE\b/i,
  /\b83F2 synthetic\b/i,
  /\bsynthetic UAT\b/i,
  /\bsynthetic fixture\b/i,
  /\bnot regulatory advice\b/i,
  /\bprovenance test only\b/i,
];

function textMatchesSynthetic(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  return SYNTHETIC_TEXT_PATTERNS.some((re) => re.test(text));
}

function metadataProvenance(metadata: Record<string, unknown> | null | undefined): RecordProvenanceKind | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = metadata[RECORD_PROVENANCE_METADATA_KEY] ?? metadata.record_provenance;
  if (typeof raw !== 'string') return null;
  const v = raw.trim().toLowerCase();
  if (v === 'regulatory_catalogue') return 'regulatory_catalogue';
  if (v === 'synthetic_fixture') return 'synthetic_fixture';
  if (v === 'synthetic_uat' || v === 'uat') return 'synthetic_uat';
  if (v === 'ai_draft') return 'ai_draft';
  if (v === 'tenant_operational' || v === 'operational') return 'tenant_operational';
  if (v === 'uat_authorised' || v === 'authorised_uat') return 'uat_authorised';
  if (v === 'unverified') return 'unverified';
  return null;
}

export function isSyntheticUatProvenance(kind: RecordProvenanceKind): boolean {
  return kind === 'synthetic_uat' || kind === 'synthetic_fixture';
}

/** Rows eligible for default operational Design Lab dashboards (not necessarily "approved regulatory fact"). */
export function isOperationalDashboardProvenance(kind: RecordProvenanceKind): boolean {
  return kind === 'regulatory_catalogue' || kind === 'tenant_operational';
}

/** Authorised acceptance / business UAT rows — audit registers only, never operational metrics. */
export function isAuthorisedUatDashboardProvenance(kind: RecordProvenanceKind): boolean {
  return kind === 'uat_authorised';
}

export type ResolveProvenanceInput = UatProvenanceInput & {
  origin?: string | null;
  status?: string | null;
  persistedProvenance?: string | null;
};

export function resolveRecordProvenance(input: ResolveProvenanceInput): RecordProvenanceKind {
  const fromMeta = metadataProvenance(input.metadata);
  if (fromMeta) return fromMeta;

  if (input.persistedProvenance) {
    const p = input.persistedProvenance.trim().toLowerCase();
    if (p === 'tenant_operational' || p === 'operational') return 'tenant_operational';
    if (p === 'uat_authorised' || p === 'authorised_uat') return 'uat_authorised';
    if (p === 'synthetic_uat' || p === 'uat') return 'synthetic_uat';
    if (p === 'regulatory_catalogue') return 'regulatory_catalogue';
    if (p === 'ai_draft') return 'ai_draft';
    if (p === 'unverified') return 'unverified';
  }

  if (isSyntheticPublicationOrigin(input.dataOrigin ?? null)) return 'synthetic_fixture';

  if (input.dataOrigin === 'regulated-ingestion' || input.origin === 'FORGENIQ_RI_INGESTION') {
    return 'regulatory_catalogue';
  }

  if (input.idempotencyKey && /\bUAT-/i.test(input.idempotencyKey)) return 'synthetic_uat';
  if (input.externalKey && /^UAT-/i.test(input.externalKey.trim())) return 'synthetic_uat';

  const texts = [
    input.title,
    input.name,
    input.description,
    input.statement,
    input.businessImpact,
  ];
  if (texts.some(textMatchesSynthetic)) return 'synthetic_uat';

  const origin = (input.origin || '').toUpperCase();
  if (origin === 'AI_ASSISTED') {
    const st = (input.status || '').toUpperCase();
    if (st === 'DRAFT' || st === 'IN_REVIEW') return 'ai_draft';
    return 'tenant_operational';
  }

  if (origin === 'MANUAL') {
    return 'unverified';
  }

  return 'unverified';
}

export function workflowMetadataForProvenance(kind: RecordProvenanceKind): Record<string, unknown> {
  return { [RECORD_PROVENANCE_METADATA_KEY]: kind };
}

export function provenanceKindLabel(kind: RecordProvenanceKind): string {
  switch (kind) {
    case 'regulatory_catalogue':
      return 'Regulatory catalogue (ingested)';
    case 'synthetic_fixture':
      return 'Demonstration fixture';
    case 'synthetic_uat':
      return 'Synthetic UAT';
    case 'ai_draft':
      return 'AI draft — requires review';
    case 'tenant_operational':
      return 'Tenant operational activity';
    case 'uat_authorised':
      return 'Authorised UAT / acceptance';
    case 'unverified':
      return 'Provenance not verified';
    default:
      return kind;
  }
}

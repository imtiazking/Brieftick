import 'server-only';

import { FIXTURE_PROVIDER_ID } from '@/lib/ri/ai/fixture-provider';
import type { AnalysisRunRow } from '@/lib/ri/services/ai-analysis';
import type { LabDataScope } from '@/lib/ri/uat-record-provenance';

export type AiAnalysisRunLabClass =
  | 'operational'
  | 'uat_authorised'
  | 'synthetic_fixture'
  | 'unclassified';

export type AiRunLabProvenanceInput = {
  id?: string;
  provider?: string | null;
  execution_status?: string | null;
  latency_ms?: number | null;
  idempotency_key?: string | null;
  prompt_version?: string | null;
  structured_output?: Record<string, unknown> | null;
};

function structuredOutput(input: AiRunLabProvenanceInput): Record<string, unknown> | null {
  const so = input.structured_output;
  return so && typeof so === 'object' ? so : null;
}

function hasPersistedClaims(so: Record<string, unknown> | null): boolean {
  const claims = so?.claims;
  if (Array.isArray(claims) && claims.length > 0) return true;
  const candidates = so?.candidates;
  return Array.isArray(candidates) && candidates.length > 0;
}

function hasPersistedAnalysisOutput(so: Record<string, unknown> | null): boolean {
  if (hasPersistedClaims(so)) return true;
  if (typeof so?.classification === 'string' && so.classification.trim()) return true;
  return false;
}

/** Synthetic seed / fixture runs — never operational reporting. */
export function isSyntheticAiAnalysisFixture(input: AiRunLabProvenanceInput): boolean {
  const provider = (input.provider || '').trim();
  if (provider === FIXTURE_PROVIDER_ID) return true;
  const idem = (input.idempotency_key || '').trim();
  if (/UAT-83H/i.test(idem)) return true;
  const so = structuredOutput(input);
  if (so?._uat_label != null) return true;
  const label = so?.label;
  if (typeof label === 'string' && /\bUAT-83H\b|synthetic fixture/i.test(label)) return true;
  return false;
}

function isExplicitOperationalAiRun(input: AiRunLabProvenanceInput): boolean {
  const so = structuredOutput(input);
  const rp = so?.recordProvenance ?? so?.record_provenance;
  if (rp === 'tenant_operational' || rp === 'operational') return true;
  const idem = (input.idempotency_key || '').trim();
  if (/^OPS-/i.test(idem) || /^TENANT-OPS/i.test(idem)) return true;
  return false;
}

/**
 * Real Anthropic executions from staged acceptance (e.g. Phase 8D.3) — not demo fixtures,
 * not implied production operational records.
 */
export function isAuthorisedUatAnthropicExecution(input: AiRunLabProvenanceInput): boolean {
  if (isSyntheticAiAnalysisFixture(input)) return false;
  if (isExplicitOperationalAiRun(input)) return false;

  const provider = (input.provider || '').toUpperCase();
  if (!provider.includes('ANTHROPIC')) return false;
  if (String(input.execution_status || '').toUpperCase() !== 'COMPLETED') return false;
  if (input.latency_ms == null || input.latency_ms <= 0) return false;

  const so = structuredOutput(input);
  if (!hasPersistedAnalysisOutput(so)) return false;

  const idem = (input.idempotency_key || '').trim();
  if (/^UC-RI-\d{3}:/i.test(idem)) return true;
  if (/phase\s*8|8d\.3|live.?ai|uat.?acceptance/i.test(input.prompt_version || '')) return true;

  // Completed live Anthropic run with latency + claims — audit/UAT bucket (not implied operational).
  return true;
}

export function classifyAiAnalysisRunForLab(input: AiRunLabProvenanceInput): AiAnalysisRunLabClass {
  if (isSyntheticAiAnalysisFixture(input)) return 'synthetic_fixture';
  if (isExplicitOperationalAiRun(input)) return 'operational';
  if (isAuthorisedUatAnthropicExecution(input)) return 'uat_authorised';
  return 'unclassified';
}

export function aiRunLabProvenanceInputFromRow(row: AnalysisRunRow): AiRunLabProvenanceInput {
  return {
    id: row.id,
    provider: row.provider,
    execution_status: row.execution_status,
    latency_ms: row.latency_ms,
    idempotency_key: (row as AnalysisRunRow & { idempotency_key?: string | null }).idempotency_key,
    prompt_version: row.prompt_version,
    structured_output: row.structured_output,
  };
}

export function labClassificationLabel(cls: AiAnalysisRunLabClass): string {
  switch (cls) {
    case 'operational':
      return 'Operational tenant record';
    case 'uat_authorised':
      return 'Authorised UAT / acceptance execution';
    case 'synthetic_fixture':
      return 'Synthetic fixture (excluded from operational)';
    default:
      return 'Provenance not established';
  }
}

export type AiAnalysisRunLabPartition<T> = {
  operational: T[];
  authorisedUat: T[];
  syntheticFixtures: T[];
  unclassified: T[];
  excludedFromOperationalCount: number;
};

export function partitionAiAnalysisRunsForLabScope<T>(
  rows: T[],
  scope: LabDataScope,
  toInput: (row: T) => AiRunLabProvenanceInput,
): AiAnalysisRunLabPartition<T> {
  const operational: T[] = [];
  const authorisedUat: T[] = [];
  const syntheticFixtures: T[] = [];
  const unclassified: T[] = [];

  for (const row of rows) {
    const cls = classifyAiAnalysisRunForLab(toInput(row));
    switch (cls) {
      case 'operational':
        operational.push(row);
        break;
      case 'uat_authorised':
        authorisedUat.push(row);
        break;
      case 'synthetic_fixture':
        syntheticFixtures.push(row);
        break;
      default:
        unclassified.push(row);
    }
  }

  const excludedFromOperationalCount =
    scope === 'operational'
      ? authorisedUat.length + syntheticFixtures.length + unclassified.length
      : 0;

  return {
    operational,
    authorisedUat,
    syntheticFixtures,
    unclassified,
    excludedFromOperationalCount,
  };
}

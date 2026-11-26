import 'server-only';

import { createFixtureProvider, FIXTURE_PROVIDER_ID } from '@/lib/ri/ai/fixture-provider';
import { mapSchemaForAnalysisType, validateStructuredOutput } from '@/lib/ri/ai/output-schemas';
import {
  getAiProvider,
  resolveAiProviderMode,
  resolveLiveProviderFallbackError,
  resolveModelForProviderMode,
} from '@/lib/ri/ai/provider-registry';
import { isRiAiExecutionEnabled } from '@/lib/ri/ai/ri-ai-execution';

export type LifecycleStageSpec = {
  stage: 2 | 3 | 4 | 5;
  envName: 'FORGENIQ_STAGE2_AI' | 'FORGENIQ_STAGE3_AI' | 'FORGENIQ_STAGE4_AI' | 'FORGENIQ_STAGE5_AI';
  useCaseId: 'UC-RI-004' | 'UC-RI-006' | 'UC-RI-007' | 'UC-RI-008';
  analysisType: 'Impact Suggestion' | 'Risk Mapping' | 'Control Mapping' | 'Control Assurance Plan';
  fixtureScenario: string;
};

export const LIFECYCLE_STAGE_SPECS: Record<2 | 3 | 4 | 5, LifecycleStageSpec> = {
  2: {
    stage: 2,
    envName: 'FORGENIQ_STAGE2_AI',
    useCaseId: 'UC-RI-004',
    analysisType: 'Impact Suggestion',
    fixtureScenario: 'stage2-obligation-impact',
  },
  3: {
    stage: 3,
    envName: 'FORGENIQ_STAGE3_AI',
    useCaseId: 'UC-RI-006',
    analysisType: 'Risk Mapping',
    fixtureScenario: 'stage3-impact-risk',
  },
  4: {
    stage: 4,
    envName: 'FORGENIQ_STAGE4_AI',
    useCaseId: 'UC-RI-007',
    analysisType: 'Control Mapping',
    fixtureScenario: 'stage4-risk-control',
  },
  5: {
    stage: 5,
    envName: 'FORGENIQ_STAGE5_AI',
    useCaseId: 'UC-RI-008',
    analysisType: 'Control Assurance Plan',
    fixtureScenario: 'stage5-control-assurance',
  },
};

export type LifecycleSourceSection = {
  sourceSectionId: string;
  citation?: string;
  text?: string;
};

export type LifecycleAiOutcome =
  | {
      ok: true;
      executionMode: 'fixture' | 'live';
      providerId: string;
      model: string;
      structured: Record<string, unknown> | null;
      latencyMs: number | null;
      inputTokens: number | null;
      outputTokens: number | null;
      spendAudit: Record<string, unknown> | null;
    }
  | {
      ok: false;
      failClosed: boolean;
      executionMode: 'fixture' | 'live';
      code: string;
      message: string;
      providerId: string | null;
      model: string | null;
    };

/** Fixture unless the stage (or global mode) explicitly requests a live provider. */
export function resolveLifecycleExecutionMode(stage: 2 | 3 | 4 | 5): 'fixture' | 'live' {
  const spec = LIFECYCLE_STAGE_SPECS[stage];
  const raw = (process.env[spec.envName] || process.env.RI_AI_PROVIDER_MODE || 'FIXTURE').toUpperCase();
  if (raw === 'ANTHROPIC' || raw === 'OPENAI' || raw === 'LIVE' || raw === 'AUTO') return 'live';
  return 'fixture';
}

/**
 * Run one lifecycle stage through the existing provider registry.
 * Live requests never fall back to fixtures. A failed live call is fail-closed
 * so the caller must not insert a downstream draft.
 */
export async function runLifecycleStageAnalysis(params: {
  stage: 2 | 3 | 4 | 5;
  sourceSections: LifecycleSourceSection[];
  organisationId: string;
  idempotencyKey: string;
  advisoryContext?: Record<string, unknown> | null;
  /** Test double. Production uses the registry. */
  providerOverride?: { id: string; execute: (request: Record<string, unknown>) => Promise<Record<string, unknown>> };
}): Promise<LifecycleAiOutcome> {
  const spec = LIFECYCLE_STAGE_SPECS[params.stage];
  const executionMode = resolveLifecycleExecutionMode(params.stage);
  const request = {
    useCaseId: spec.useCaseId,
    analysisType: spec.analysisType,
    fixtureScenario: spec.fixtureScenario,
    budgetContext: {
      organisationId: params.organisationId,
      idempotencyKey: params.idempotencyKey,
    },
    context: {
      sourceSections: params.sourceSections,
      regulatoryAnalysis: params.advisoryContext || null,
    },
  };

  if (executionMode === 'fixture') {
    const provider = params.providerOverride || createFixtureProvider();
    const result = await provider.execute(request);
    if (!result.ok || !result.structured || typeof result.structured !== 'object') {
      return {
        ok: true,
        executionMode: 'fixture',
        providerId: provider.id || FIXTURE_PROVIDER_ID,
        model: 'fixture-ri',
        structured: null,
        latencyMs: typeof result.latencyMs === 'number' ? result.latencyMs : null,
        inputTokens: null,
        outputTokens: null,
        spendAudit: null,
      };
    }
    const schemaName = mapSchemaForAnalysisType(spec.analysisType);
    const valid = validateStructuredOutput(schemaName, result.structured as Record<string, unknown>);
    return {
      ok: true,
      executionMode: 'fixture',
      providerId: String(provider.id || FIXTURE_PROVIDER_ID),
      model: 'fixture-ri',
      structured: valid.ok ? (result.structured as Record<string, unknown>) : null,
      latencyMs: typeof result.latencyMs === 'number' ? result.latencyMs : null,
      inputTokens: null,
      outputTokens: null,
      spendAudit: null,
    };
  }

  if (!isRiAiExecutionEnabled()) {
    return {
      ok: false,
      failClosed: true,
      executionMode: 'live',
      code: 'AI_EXTERNAL_PROCESSING_DISABLED',
      message: 'Live lifecycle AI requires RI_AI_EXECUTION_ENABLED=true.',
      providerId: null,
      model: null,
    };
  }

  if (!params.providerOverride) {
    const unavailable = resolveLiveProviderFallbackError();
    if (unavailable) {
      return {
        ok: false,
        failClosed: true,
        executionMode: 'live',
        code: unavailable,
        message: 'Requested live provider is not configured. Fixture fallback is disabled.',
        providerId: null,
        model: null,
      };
    }
  }

  const mode = resolveAiProviderMode();
  const provider = (params.providerOverride || getAiProvider(mode)) as {
    id: string;
    execute: (request: Record<string, unknown>) => Promise<Record<string, unknown>>;
  };
  const model = params.providerOverride ? 'mock-live-provider' : resolveModelForProviderMode(mode);
  const result = await provider.execute(request as unknown as Record<string, unknown>);
  if (result.ok !== true) {
    return {
      ok: false,
      failClosed: true,
      executionMode: 'live',
      code: String(result.code || 'AI_PROVIDER_FAILED'),
      message: String(result.message || 'Live provider rejected the lifecycle analysis.'),
      providerId: provider.id,
      model,
    };
  }
  if (!result.structured || typeof result.structured !== 'object') {
    return {
      ok: false,
      failClosed: true,
      executionMode: 'live',
      code: 'AI_OUTPUT_SCHEMA_INVALID',
      message: 'Live provider returned no structured output.',
      providerId: provider.id,
      model,
    };
  }
  const schemaName = mapSchemaForAnalysisType(spec.analysisType);
  const valid = validateStructuredOutput(schemaName, result.structured as Record<string, unknown>);
  if (!valid.ok) {
    return {
      ok: false,
      failClosed: true,
      executionMode: 'live',
      code: valid.code || 'AI_OUTPUT_SCHEMA_INVALID',
      message: valid.message || 'Structured output failed validation.',
      providerId: provider.id,
      model,
    };
  }

  const spend =
    result.spendAudit && typeof result.spendAudit === 'object'
      ? (result.spendAudit as Record<string, unknown>)
      : null;
  return {
    ok: true,
    executionMode: 'live',
    providerId: provider.id,
    model,
    structured: result.structured as Record<string, unknown>,
    latencyMs: typeof result.latencyMs === 'number' ? result.latencyMs : null,
    inputTokens: typeof result.inputTokenEstimate === 'number' ? result.inputTokenEstimate : null,
    outputTokens: typeof result.outputTokenEstimate === 'number' ? result.outputTokenEstimate : null,
    spendAudit: spend,
  };
}

export function lifecycleAiAudit(outcome: Extract<LifecycleAiOutcome, { ok: true }>) {
  return {
    executionMode: outcome.executionMode,
    aiProvider: outcome.providerId,
    model: outcome.model,
    fixtureMode: outcome.executionMode === 'fixture',
    latencyMs: outcome.latencyMs,
    inputTokens: outcome.inputTokens,
    outputTokens: outcome.outputTokens,
    estimatedUsd:
      outcome.spendAudit && typeof outcome.spendAudit.calculatedUsd === 'number'
        ? outcome.spendAudit.calculatedUsd
        : null,
  };
}

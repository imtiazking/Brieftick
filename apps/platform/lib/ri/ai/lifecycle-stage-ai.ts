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
import { validateStageClaims } from '@/lib/ri/ai/lifecycle-evidence.mjs';

export type LifecycleEvidenceValidation = ReturnType<typeof validateStageClaims>;

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

export type LifecycleCitation = {
  text: string | null;
  sourceSectionIds: string[];
  citation: string | null;
  sourceQuotation: string | null;
  provisionReference: string | null;
  effectiveDate?: string | null;
};

/** Provider-reported billing categories and call metadata. Never contains prompt or completion text. */
export type LifecycleTelemetry = {
  requestedModel: string | null;
  responseModel: string | null;
  providerRequestId: string | null;
  effort: string | null;
  thinkingType: string | null;
  stopReason: string | null;
  usageKnown: boolean | null;
  standardInputTokens: number | null;
  outputTokens: number | null;
  cacheWrite5mTokens: number | null;
  cacheWrite1hTokens: number | null;
  cacheReadTokens: number | null;
  reservedUsd: number | null;
  settledEstimatedUsd: number | null;
  pricingVersion: string | null;
};

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const rec = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : null;

export function lifecycleTelemetry(result: Record<string, unknown>): LifecycleTelemetry | null {
  const meta = rec(result.providerMeta);
  const spend = rec(result.spendAudit);
  const usage = rec(result.usage);
  if (!meta && !spend && !usage) return null;
  return {
    requestedModel: str(meta?.requestedModel),
    responseModel: str(meta?.responseModel),
    providerRequestId: str(meta?.requestId) ?? str(result.providerRequestId),
    effort: str(meta?.effort),
    thinkingType: str(meta?.thinkingType),
    stopReason: str(meta?.stopReason),
    usageKnown:
      typeof spend?.usageKnown === 'boolean'
        ? spend.usageKnown
        : typeof meta?.usageKnown === 'boolean'
          ? meta.usageKnown
          : null,
    standardInputTokens: num(usage?.standardInputTokens) ?? num(meta?.inputTokens),
    outputTokens: num(usage?.outputTokens) ?? num(meta?.outputTokens),
    cacheWrite5mTokens: num(usage?.cacheWrite5mTokens) ?? num(meta?.cacheWrite5mTokens),
    cacheWrite1hTokens: num(usage?.cacheWrite1hTokens) ?? num(meta?.cacheWrite1hTokens),
    cacheReadTokens: num(usage?.cacheReadTokens) ?? num(meta?.cacheReadTokens),
    reservedUsd: num(spend?.reservedUsd),
    settledEstimatedUsd: num(spend?.settledEstimatedUsd),
    pricingVersion: str(spend?.pricingVersion),
  };
}

export type LifecycleAiOutcome =
  | {
      ok: true;
      executionMode: 'fixture' | 'live';
      providerId: string;
      model: string;
      structured: Record<string, unknown> | null;
      citations: LifecycleCitation[];
      latencyMs: number | null;
      inputTokens: number | null;
      outputTokens: number | null;
      spendAudit: Record<string, unknown> | null;
      telemetry: LifecycleTelemetry | null;
      /** Claim validation against the regulatory evidence pack (live outputs when a pack is supplied). */
      evidence?: LifecycleEvidenceValidation | null;
      /** Provider output exactly as returned, kept for audit (live only; `structured` may have rejected claims removed). */
      rawStructured?: Record<string, unknown> | null;
    }
  | {
      ok: false;
      failClosed: boolean;
      executionMode: 'fixture' | 'live';
      code: string;
      message: string;
      providerId: string | null;
      model: string | null;
      /** A failed live call still consumes a request slot; its spend is kept for the audit trail. */
      spendAudit?: Record<string, unknown> | null;
      telemetry?: LifecycleTelemetry | null;
    };

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** Claims that name a supplied source. Live drafts are refused without one. */
export function liveGroundedCitations(
  structured: Record<string, unknown> | null | undefined,
  ctx?: { evidencePack?: Record<string, unknown> | null; publication?: Record<string, unknown> | null },
): LifecycleCitation[] {
  const claims = Array.isArray(structured?.claims) ? structured.claims : [];
  const citations: LifecycleCitation[] = [];
  for (const claim of claims) {
    if (!claim || typeof claim !== 'object') continue;
    const row = claim as Record<string, unknown>;
    const sourceSectionIds = Array.isArray(row.sourceSectionIds)
      ? row.sourceSectionIds.map((id) => String(id).trim()).filter(Boolean)
      : [];
    const citation = asText(row.citation);
    const sourceQuotation = asText(row.sourceQuotation);
    const provisionReference = asText(row.provisionReference);
    if (!sourceSectionIds.length && !citation && !sourceQuotation && !provisionReference) continue;
    citations.push({
      // Live stages 3-5 return the claim sentence under `claim`; it was previously dropped (pilot citations had text: null).
      text: asText(row.text) ?? asText(row.claim) ?? asText(row.summary),
      sourceSectionIds,
      citation,
      sourceQuotation,
      provisionReference,
    });
  }
  if (!ctx?.evidencePack) return citations;
  return citations.map((c) => {
    const pack = ctx.evidencePack as Record<string, unknown>;
    const quotation = (pack?.quotation as Record<string, unknown> | undefined) ?? {};
    const provision = (pack?.provision as Record<string, unknown> | undefined) ?? {};
    const effective = (pack?.effective as Record<string, unknown> | undefined) ?? {};
  return {
      ...c,
      sourceQuotation: c.sourceQuotation ?? asText(quotation.text),
      provisionReference: c.provisionReference ?? asText(provision.reference),
      citation: c.citation ?? (Number.isInteger(quotation.page) ? `PDF p.${quotation.page}` : c.citation),
      effectiveDate: asText(effective.date as string | undefined) ?? undefined,
    };
  });
}

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
  /** Idempotency key of the FAILED request this call retries (run ledger retry accounting). */
  retryOfIdempotencyKey?: string | null;
  advisoryContext?: Record<string, unknown> | null;
  /** Verified regulatory evidence carried from the originating obligation. Live claims are validated against it. */
  evidencePack?: Record<string, unknown> | null;
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
      retryOfIdempotencyKey: params.retryOfIdempotencyKey ?? null,
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
        citations: [],
        latencyMs: typeof result.latencyMs === 'number' ? result.latencyMs : null,
        inputTokens: null,
        outputTokens: null,
        spendAudit: null,
        telemetry: null,
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
      citations: valid.ok ? liveGroundedCitations(result.structured as Record<string, unknown>) : [],
      latencyMs: typeof result.latencyMs === 'number' ? result.latencyMs : null,
      inputTokens: null,
      outputTokens: null,
      spendAudit: null,
      telemetry: null,
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
      spendAudit: rec(result.spendAudit),
      telemetry: lifecycleTelemetry(result),
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
  let liveStructured = result.structured as Record<string, unknown>;
  let evidence: LifecycleEvidenceValidation | null = null;
  if (params.evidencePack) {
    evidence = validateStageClaims(liveStructured, {
      pack: params.evidencePack as never,
      allowedSectionIds: params.sourceSections.map((s) => s.sourceSectionId),
      sections: params.sourceSections,
    });
    if (evidence.rejected.length && !evidence.accepted.length) {
      return {
        ok: false,
        failClosed: true,
        executionMode: 'live',
        code: 'AI_OUTPUT_CITATION_UNVERIFIED',
        message: 'Every claim cited a section, quotation or provision that is not in the verified evidence.',
        providerId: provider.id,
        model,
        spendAudit: rec(result.spendAudit),
        telemetry: lifecycleTelemetry(result),
      };
    }
    // Fabricated claims are dropped; accepted claims carry their evidence level.
    liveStructured = {
      ...liveStructured,
      claims: evidence.accepted,
      _citationValidation: { ...evidence.summary, rejected: evidence.rejected },
    };
  }
  const citations = liveGroundedCitations(liveStructured, { evidencePack: params.evidencePack ?? null });
  if (!citations.length) {
    return {
      ok: false,
      failClosed: true,
      executionMode: 'live',
      code: 'AI_OUTPUT_CITATION_MISSING',
      message: 'Live output has no claim grounded to a source section or citation.',
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
    structured: liveStructured,
    citations,
    evidence,
    rawStructured: result.structured as Record<string, unknown>,
    latencyMs: typeof result.latencyMs === 'number' ? result.latencyMs : null,
    inputTokens: typeof result.inputTokenEstimate === 'number' ? result.inputTokenEstimate : null,
    outputTokens: typeof result.outputTokenEstimate === 'number' ? result.outputTokenEstimate : null,
    spendAudit: spend,
    telemetry: lifecycleTelemetry(result),
  };
}

export function lifecycleAiAudit(outcome: Extract<LifecycleAiOutcome, { ok: true }>) {
  return {
    executionMode: outcome.executionMode,
    aiProvider: outcome.providerId,
    model: outcome.model,
    fixtureMode: outcome.executionMode === 'fixture',
    citations: outcome.citations,
    rawProviderOutput: outcome.executionMode === 'live' ? outcome.rawStructured ?? null : null,
    latencyMs: outcome.latencyMs,
    inputTokens: outcome.inputTokens,
    outputTokens: outcome.outputTokens,
    /** This call's settled estimated cost (not an invoice figure). */
    estimatedUsd:
      outcome.spendAudit && typeof outcome.spendAudit.settledEstimatedUsd === 'number'
        ? outcome.spendAudit.settledEstimatedUsd
        : outcome.spendAudit && typeof outcome.spendAudit.calculatedUsd === 'number'
          ? outcome.spendAudit.calculatedUsd
          : null,
    telemetry: outcome.telemetry,
  };
}

/**
 * Anthropic provider implementation (importable from acceptance without server-only).
 */
import {
  callAnthropicMessages,
  classifyMaxTokensTruncation,
  parseAnthropicJsonText,
} from './anthropic-messages-core.mjs';
import { buildAnthropicPrompts } from './anthropic-prompts-core.mjs';
import {
  guardLabAnthropicSpendBeforeCall,
  finalizeLabSpendAfterCall,
  LAB_BUDGET_ERROR_CODES,
} from './lab-anthropic-spend-guard.mjs';

export const ANTHROPIC_PROVIDER_ID = 'AIPROV-ANTHROPIC-001';

export const AI_ERRORS = {
  AI_PROVIDER_NOT_CONFIGURED: 'AI_PROVIDER_NOT_CONFIGURED',
  AI_EXTERNAL_PROCESSING_DISABLED: 'AI_EXTERNAL_PROCESSING_DISABLED',
  AI_OUTPUT_SCHEMA_INVALID: 'AI_OUTPUT_SCHEMA_INVALID',
  AI_OUTPUT_TRUNCATED: 'AI_OUTPUT_TRUNCATED',
  AI_QUALITY_GATE_FAILED: 'AI_QUALITY_GATE_FAILED',
  LAB_ANTHROPIC_BUDGET_NOT_CONFIGURED: LAB_BUDGET_ERROR_CODES.LAB_ANTHROPIC_BUDGET_NOT_CONFIGURED,
  LAB_ANTHROPIC_BUDGET_EXCEEDED: LAB_BUDGET_ERROR_CODES.LAB_ANTHROPIC_BUDGET_EXCEEDED,
  LAB_ANTHROPIC_BUDGET_ENFORCEMENT_FAILED: LAB_BUDGET_ERROR_CODES.LAB_ANTHROPIC_BUDGET_ENFORCEMENT_FAILED,
  LAB_TRIAL_OVERLAP: LAB_BUDGET_ERROR_CODES.LAB_TRIAL_OVERLAP,
  LAB_PROMPT_TOO_LARGE: LAB_BUDGET_ERROR_CODES.LAB_PROMPT_TOO_LARGE,
};

export function getAnthropicApiKey() {
  const key = process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_KEY?.trim();
  return key || undefined;
}

export function isAnthropicConfigured() {
  return Boolean(getAnthropicApiKey());
}

export function validateAnthropicApiKeyFormat(apiKey) {
  const key = (apiKey ?? getAnthropicApiKey())?.trim();
  if (!key) return false;
  return /^sk-ant-[a-zA-Z0-9_-]+$/.test(key) && key.length >= 20;
}

export function resolveAnthropicModel() {
  const explicit =
    process.env.RI_ANTHROPIC_MODEL?.trim() ||
    process.env.ANTHROPIC_MODEL?.trim() ||
    process.env.RI_AI_MODEL?.trim();
  if (explicit && !explicit.startsWith('gpt-')) return explicit;
  // Dated snapshot IDs are not always enabled on Console-funded keys; alias is widely available.
  return 'claude-sonnet-4-5';
}

export function isRiAiExecutionEnabled() {
  return process.env.RI_AI_EXECUTION_ENABLED === 'true';
}

export function mapSchemaForAnalysisType(analysisType) {
  if (analysisType === 'Publication Classification') return 'PublicationClassificationResult';
  if (analysisType === 'Regulatory Change Extraction') return 'ChangeExtractionResult';
  if (analysisType === 'Impact Suggestion') return 'ImpactSuggestionResult';
  if (analysisType === 'Obligation Extraction') return 'ObligationExtractionResult';
  if (analysisType === 'Risk Mapping') return 'RiskMappingResult';
  if (analysisType === 'Control Mapping') return 'ControlMappingResult';
  if (analysisType === 'Control Assurance Plan') return 'ControlAssurancePlanResult';
  return 'ApplicabilityResult';
}

/** Response metadata only — never prompt or completion text. */
export function anthropicCallMeta(apiResult) {
  return {
    requestReachedProvider: apiResult?.requestReachedProvider ?? null,
    responseReceived: apiResult?.responseReceived ?? null,
    httpStatus: apiResult?.httpStatus ?? null,
    requestId: apiResult?.requestId ?? null,
    stopReason: apiResult?.stopReason ?? null,
    inputTokens: apiResult?.inputTokens ?? null,
    outputTokens: apiResult?.outputTokens ?? null,
    textLength: typeof apiResult?.text === 'string' ? apiResult.text.length : null,
  };
}

export function createAnthropicProvider(deps = {}) {
  const model = resolveAnthropicModel();
  return {
    id: ANTHROPIC_PROVIDER_ID,
    name: 'Anthropic Claude (server-side)',
    mode: 'anthropic',
    configured: isAnthropicConfigured(),
    model,
    async execute(request) {
      const apiKey = deps.apiKeyOverride ?? getAnthropicApiKey();
      if (!apiKey) {
        return { ok: false, code: AI_ERRORS.AI_PROVIDER_NOT_CONFIGURED, message: 'Anthropic API key not configured.' };
      }
      if (!validateAnthropicApiKeyFormat()) {
        return { ok: false, code: AI_ERRORS.AI_PROVIDER_NOT_CONFIGURED, message: 'Anthropic API key format is invalid.' };
      }
      if (!isRiAiExecutionEnabled()) {
        return {
          ok: false,
          code: AI_ERRORS.AI_EXTERNAL_PROCESSING_DISABLED,
          message: 'Live Claude execution is disabled (RI_AI_EXECUTION_ENABLED is not true).',
        };
      }

      const analysisType = request.analysisType || 'Applicability Recommendation';
      const sections = request.context?.sourceSections ?? [];
      if (!sections.length) {
        return {
          ok: false,
          code: AI_ERRORS.AI_QUALITY_GATE_FAILED,
          message: 'No source sections supplied for grounded analysis.',
        };
      }

      const { system, user } = buildAnthropicPrompts({
        useCaseId: request.useCaseId,
        analysisType,
        sourceSections: sections,
        regulatoryAnalysis: request.context?.regulatoryAnalysis ?? null,
        provisionScopedExtraction:
          request.context?.provisionScopedExtraction ??
          request.context?.grounding?.provisionOutcomesSummary?.provisionScopedExtraction ??
          null,
      });

      const budgetCtx = request.budgetContext || {};
      const spendGuard = await guardLabAnthropicSpendBeforeCall({
        useCaseId: request.useCaseId,
        system,
        user,
        idempotencyKey: budgetCtx.idempotencyKey,
        organisationId: budgetCtx.organisationId,
        maxOutputTokensOverride: budgetCtx.maxOutputTokens,
      });
      if (!spendGuard.ok) {
        return {
          ok: false,
          code: spendGuard.code || AI_ERRORS.LAB_ANTHROPIC_BUDGET_ENFORCEMENT_FAILED,
          message: spendGuard.message || 'Lab Anthropic budget guard rejected execution.',
          spendAudit: spendGuard.spendAudit || null,
          failClosed: spendGuard.failClosed === true,
        };
      }

      const maxTokens = spendGuard.maxOutputTokens ?? Number(process.env.RI_ANTHROPIC_MAX_TOKENS ?? 4096);
      const reservedAmount = spendGuard.reserveUsd ?? 0;

      const started = Date.now();
      const apiResult = await callAnthropicMessages(
        apiKey,
        { model, system, user, maxTokens },
        { fetchFn: deps.fetchFn },
      );
      const latencyMs = Date.now() - started;
      const providerMeta = anthropicCallMeta(apiResult);

      let spendAudit = spendGuard.spendAudit || null;
      if (spendGuard.tracker || spendGuard.durable) {
        const finalized = await finalizeLabSpendAfterCall(
          spendGuard.durable ? spendGuard : spendGuard.tracker,
          spendGuard.slotKey,
          apiResult,
          reservedAmount,
        );
        spendAudit = finalized.spendAudit;
        if (!finalized.ok) {
          return {
            ok: false,
            code: finalized.code,
            message: finalized.message,
            latencyMs,
            spendAudit,
            providerMeta,
            failClosed: true,
          };
        }
      }

      if (!apiResult.ok) {
        return { ok: false, code: apiResult.code, message: apiResult.message, latencyMs, spendAudit, providerMeta };
      }

      const structured = parseAnthropicJsonText(apiResult.text);
      if (!structured) {
        const truncation = classifyMaxTokensTruncation({
          stopReason: apiResult.stopReason,
          text: apiResult.text,
          contentBlockTypes: apiResult.contentBlockTypes,
        });
        if (truncation) {
          return {
            ok: false,
            code: truncation.code || AI_ERRORS.AI_OUTPUT_TRUNCATED,
            message: truncation.message,
            latencyMs,
            spendAudit,
            providerMeta,
            truncationKind: truncation.truncationKind,
          };
        }
        return {
          ok: false,
          code: AI_ERRORS.AI_OUTPUT_SCHEMA_INVALID,
          message: 'Anthropic response was not valid JSON.',
          latencyMs,
          spendAudit,
          providerMeta,
        };
      }

      return {
        ok: true,
        structured,
        schemaName: mapSchemaForAnalysisType(analysisType),
        latencyMs,
        providerRequestId: apiResult.requestId,
        inputTokenEstimate: apiResult.inputTokens,
        outputTokenEstimate: apiResult.outputTokens,
        spendAudit,
        providerMeta,
      };
    },
  };
}

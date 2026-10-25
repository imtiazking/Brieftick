/**
 * Anthropic provider implementation (importable from acceptance without server-only).
 */
import { callAnthropicMessages, parseAnthropicJsonText } from './anthropic-messages-core.mjs';
import { buildAnthropicPrompts } from './anthropic-prompts-core.mjs';

export const ANTHROPIC_PROVIDER_ID = 'AIPROV-ANTHROPIC-001';

export const AI_ERRORS = {
  AI_PROVIDER_NOT_CONFIGURED: 'AI_PROVIDER_NOT_CONFIGURED',
  AI_EXTERNAL_PROCESSING_DISABLED: 'AI_EXTERNAL_PROCESSING_DISABLED',
  AI_OUTPUT_SCHEMA_INVALID: 'AI_OUTPUT_SCHEMA_INVALID',
  AI_QUALITY_GATE_FAILED: 'AI_QUALITY_GATE_FAILED',
};

export function getAnthropicApiKey() {
  const key = process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_KEY?.trim();
  return key || undefined;
}

export function isAnthropicConfigured() {
  return Boolean(getAnthropicApiKey());
}

export function validateAnthropicApiKeyFormat() {
  const key = getAnthropicApiKey();
  if (!key) return false;
  return /^sk-ant-[a-zA-Z0-9_-]+$/.test(key) && key.length >= 24;
}

export function resolveAnthropicModel() {
  const explicit =
    process.env.RI_ANTHROPIC_MODEL?.trim() ||
    process.env.ANTHROPIC_MODEL?.trim() ||
    process.env.RI_AI_MODEL?.trim();
  if (explicit && !explicit.startsWith('gpt-')) return explicit;
  return 'claude-sonnet-4-20250514';
}

export function isRiAiExecutionEnabled() {
  return process.env.RI_AI_EXECUTION_ENABLED === 'true';
}

export function mapSchemaForAnalysisType(analysisType) {
  if (analysisType === 'Publication Classification') return 'PublicationClassificationResult';
  if (analysisType === 'Regulatory Change Extraction') return 'ChangeExtractionResult';
  if (analysisType === 'Impact Suggestion') return 'ImpactSuggestionResult';
  if (analysisType === 'Obligation Extraction') return 'ObligationExtractionResult';
  return 'ApplicabilityResult';
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
      });
      const started = Date.now();
      const apiResult = await callAnthropicMessages(apiKey, { model, system, user }, { fetchFn: deps.fetchFn });
      const latencyMs = Date.now() - started;

      if (!apiResult.ok) {
        return { ok: false, code: apiResult.code, message: apiResult.message, latencyMs };
      }

      const structured = parseAnthropicJsonText(apiResult.text);
      if (!structured) {
        return {
          ok: false,
          code: AI_ERRORS.AI_OUTPUT_SCHEMA_INVALID,
          message: 'Anthropic response was not valid JSON.',
          latencyMs,
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
      };
    },
  };
}

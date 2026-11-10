/**
 * V2 evaluation model aliases → Anthropic API model IDs (prototype eval only).
 */

export const V2_SUPPORTED_EVAL_MODELS = {
  'claude-haiku-5-5': 'claude-haiku-5-5',
  'claude-sonnet-5-5': 'claude-sonnet-5-5',
  /** Legacy aliases (still accepted for local scripts). */
  'claude-haiku-4-5': 'claude-haiku-4-5',
  'claude-sonnet-4-5': 'claude-sonnet-4-5',
};

export const V2_DEFAULT_EVAL_MODEL = 'claude-haiku-5-5';

export function resolveV2EvalModelId(cliModel) {
  const raw =
    cliModel?.trim() ||
    process.env.ASK_RI_V2_EVAL_MODEL?.trim() ||
    process.env.RI_ANTHROPIC_MODEL?.trim() ||
    V2_DEFAULT_EVAL_MODEL;
  return V2_SUPPORTED_EVAL_MODELS[raw] || raw;
}

export function assertV2EvalModelSupported(modelId) {
  const values = new Set(Object.values(V2_SUPPORTED_EVAL_MODELS));
  if (!values.has(modelId) && !/^claude-(haiku|sonnet|opus|fable)-/.test(modelId)) {
    return { ok: false, message: `unsupported_eval_model:${modelId}` };
  }
  return { ok: true, modelId };
}

/** Offline compatibility note for structured JSON via prompt (no provider call). */
export function v2StructuredOutputCompatibility(modelId) {
  return {
    modelId,
    transport: 'messages_api_json_prompt',
    nativeJsonSchema: modelId.startsWith('claude-haiku-5-5') || modelId.startsWith('claude-sonnet-5-5'),
    notes:
      'Reasoner uses prompt-enforced JSON parsing (parseAnthropicJsonText); optional native schema may be added when enabled in SDK.',
  };
}

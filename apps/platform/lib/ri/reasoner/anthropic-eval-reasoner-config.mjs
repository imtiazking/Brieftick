/**
 * Phase 2C.2 evaluation reasoner — Anthropic Messages API output settings only.
 * (Production Ask RI paths must not depend on these defaults.)
 */

export const V2_EVAL_DEFAULT_MAX_OUTPUT_TOKENS = 8192;
export const V2_EVAL_DEFAULT_MAX_OUTPUT_TOKENS_RETRY = 16_384;
export const V2_EVAL_DEFAULT_OUTPUT_EFFORT = 'medium';

const EFFORT_LEVELS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

/**
 * @param {object} [deps]
 * @returns {{
 *   maxTokens: number,
 *   maxTokensRetry: number,
 *   outputEffort: string,
 *   thinking: { type: string },
 *   allowRetry: boolean,
 * }}
 */
export function resolveV2EvalReasonerAnthropicConfig(deps = {}) {
  const effortRaw = String(
    deps.outputEffort ?? process.env.RI_V2_EVAL_OUTPUT_EFFORT ?? V2_EVAL_DEFAULT_OUTPUT_EFFORT,
  ).toLowerCase();
  const outputEffort = EFFORT_LEVELS.has(effortRaw) ? effortRaw : V2_EVAL_DEFAULT_OUTPUT_EFFORT;

  const thinkingType = String(deps.thinkingType ?? process.env.RI_V2_EVAL_THINKING_TYPE ?? 'adaptive').toLowerCase();
  const thinking =
    thinkingType === 'disabled' ? { type: 'disabled' } : { type: 'adaptive' };

  return {
    maxTokens: Number(deps.maxTokens ?? process.env.RI_V2_EVAL_MAX_OUTPUT_TOKENS ?? V2_EVAL_DEFAULT_MAX_OUTPUT_TOKENS),
    maxTokensRetry: Number(
      deps.maxTokensRetry ?? process.env.RI_V2_EVAL_MAX_OUTPUT_TOKENS_RETRY ?? V2_EVAL_DEFAULT_MAX_OUTPUT_TOKENS_RETRY,
    ),
    outputEffort,
    thinking,
    allowRetry: deps.allowRetry !== false,
  };
}

export function buildEvalReasonerAnthropicRequestBody(base, config) {
  const body = { ...base };
  if (config.thinking) body.thinking = config.thinking;
  if (config.outputEffort) {
    body.output_config = { effort: config.outputEffort };
  }
  return body;
}

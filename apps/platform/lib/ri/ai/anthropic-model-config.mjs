/**
 * Single source of truth for the Anthropic model FORGENIQ calls.
 * Claude Sonnet 5.5 is the default. RI_ANTHROPIC_MODEL (or the legacy aliases) overrides it,
 * so claude-sonnet-4-5 still works until Anthropic retires it (announced 2026-11-30).
 */
export const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5-5';
export const LEGACY_ANTHROPIC_MODEL = 'claude-sonnet-4-5';

export function resolveConfiguredAnthropicModel(env = process.env) {
  const explicit =
    env.RI_ANTHROPIC_MODEL?.trim() || env.ANTHROPIC_MODEL?.trim() || env.RI_AI_MODEL?.trim();
  if (explicit && !explicit.startsWith('gpt-')) return explicit;
  return DEFAULT_ANTHROPIC_MODEL;
}

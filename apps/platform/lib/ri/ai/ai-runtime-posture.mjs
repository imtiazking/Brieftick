/**
 * Non-secret description of the live-AI posture of the running process.
 * Reports booleans, numbers, model ids and mode names only. It never returns a key, URL or token.
 * Used by the authenticated readiness endpoint so an operator can confirm what a deployment will actually do
 * before any paid request is made (Vercel Secret variables cannot be read back through the CLI).
 */
import { hasPublishedPricing } from '../reasoner/anthropic-eval-budget.mjs';
import { resolveConfiguredAnthropicModel } from './anthropic-model-config.mjs';

const STAGE_ENV = { 2: 'FORGENIQ_STAGE2_AI', 3: 'FORGENIQ_STAGE3_AI', 4: 'FORGENIQ_STAGE4_AI', 5: 'FORGENIQ_STAGE5_AI' };

function stageMode(env, stage) {
  const raw = String(env[STAGE_ENV[stage]] || env.RI_AI_PROVIDER_MODE || 'FIXTURE').trim().toUpperCase();
  return raw === 'ANTHROPIC' || raw === 'OPENAI' || raw === 'LIVE' || raw === 'AUTO' ? 'live' : 'fixture';
}

function numberOrNull(raw) {
  const n = Number(String(raw ?? '').trim());
  return String(raw ?? '').trim() !== '' && Number.isFinite(n) ? n : null;
}

function authorisedRunReferenceCount(env) {
  const plural = String(env.RI_LAB_TRIAL_IDEMPOTENCY_SUFFIXES || '').trim();
  if (plural) return new Set(plural.split(/[,;\s]+/).filter(Boolean)).size;
  return String(env.RI_LAB_TRIAL_IDEMPOTENCY_SUFFIX || '').trim() ? 1 : 0;
}

/** Whether the ledger has a connection route. It does not test connectivity. */
function ledgerRoute(env) {
  if (env.RI_LAB_SPEND_GUARD_MODE === 'memory') return 'memory';
  if (['RI_LAB_SPEND_DATABASE_URL', 'SUPABASE_DB_URL', 'POSTGRES_URL', 'DATABASE_URL'].some((k) => String(env[k] || '').trim())) {
    return 'postgres';
  }
  if (String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim() && String(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '').trim()) {
    return 'supabase_rpc';
  }
  return 'none';
}

export function describeAiRuntimePosture(env = process.env) {
  const model = resolveConfiguredAnthropicModel(env);
  return {
    executionEnabled: env.RI_AI_EXECUTION_ENABLED === 'true',
    providerMode: String(env.RI_AI_PROVIDER_MODE || 'FIXTURE').trim().toUpperCase(),
    stageModes: { stage2: stageMode(env, 2), stage3: stageMode(env, 3), stage4: stageMode(env, 4), stage5: stageMode(env, 5) },
    anthropicKeyPresent: Boolean(String(env.ANTHROPIC_API_KEY || '').trim()),
    model,
    modelPriced: hasPublishedPricing(model),
    effort: String(env.RI_ANTHROPIC_EFFORT || '').trim() || 'default',
    thinking: String(env.RI_ANTHROPIC_THINKING || '').trim() || 'default',
    timeoutMs: numberOrNull(env.RI_ANTHROPIC_TIMEOUT_MS) ?? 60_000,
    budgetUsd: numberOrNull(env.RI_LAB_ANTHROPIC_MAX_USD),
    maxRequests: numberOrNull(env.RI_LAB_ANTHROPIC_MAX_REQUESTS) ?? 8,
    maxOutputTokens: numberOrNull(env.RI_LAB_ANTHROPIC_MAX_OUTPUT_TOKENS),
    spendScope: String(env.RI_LAB_SPEND_SCOPE || '').trim() || 'forgeniq-lab-anthropic',
    ledgerRoute: ledgerRoute(env),
    authorisedRunReferences: authorisedRunReferenceCount(env),
  };
}

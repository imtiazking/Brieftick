#!/usr/bin/env node
/**
 * Prints the live-AI configuration posture of the process environment it runs in. Never prints a key, URL or token.
 * Use it where the values are readable: a local shell, CI, or a Vercel environment whose variables are not Secret type.
 * The staging platform project stores these as Secret variables, which `vercel env run` refuses to pull, so for the
 * hosted deployment the posture is proven behaviourally instead (fixture mode, empty ledger, unchanged AI run counts).
 * Checks the "paid execution disabled" state and the prepared pilot values.
 */
import { resolveConfiguredAnthropicModel } from '../../lib/ri/ai/anthropic-model-config.mjs';
import { hasPublishedPricing } from '../../lib/ri/reasoner/anthropic-eval-budget.mjs';

const env = process.env;
const stageFlags = Object.fromEntries(
  [2, 3, 4, 5].map((n) => [`FORGENIQ_STAGE${n}_AI`, (env[`FORGENIQ_STAGE${n}_AI`] || '(unset)').toUpperCase()]),
);
const posture = {
  RI_AI_EXECUTION_ENABLED: env.RI_AI_EXECUTION_ENABLED ?? '(unset)',
  RI_AI_PROVIDER_MODE: (env.RI_AI_PROVIDER_MODE ?? '(unset)').toUpperCase(),
  ...stageFlags,
  RI_ANTHROPIC_MODEL: env.RI_ANTHROPIC_MODEL ?? '(unset)',
  resolvedModel: resolveConfiguredAnthropicModel(env),
  resolvedModelPriced: hasPublishedPricing(resolveConfiguredAnthropicModel(env)),
  RI_LAB_ANTHROPIC_MAX_USD: env.RI_LAB_ANTHROPIC_MAX_USD ?? '(unset)',
  RI_LAB_ANTHROPIC_MAX_REQUESTS: env.RI_LAB_ANTHROPIC_MAX_REQUESTS ?? '(unset)',
  RI_LAB_SPEND_SCOPE: env.RI_LAB_SPEND_SCOPE ?? '(unset; default forgeniq-lab-anthropic)',
  RI_ANTHROPIC_EFFORT: env.RI_ANTHROPIC_EFFORT ?? '(unset; default medium)',
  RI_ANTHROPIC_THINKING: env.RI_ANTHROPIC_THINKING ?? '(unset; default adaptive)',
  anthropicKeyPresent: Boolean(env.ANTHROPIC_API_KEY?.trim()),
  ledgerConnectionPresent: Boolean(
    env.RI_LAB_SPEND_DATABASE_URL?.trim() || env.SUPABASE_DB_URL?.trim() || env.POSTGRES_URL?.trim() || env.DATABASE_URL?.trim() ||
      (env.SUPABASE_SERVICE_ROLE_KEY?.trim() && (env.NEXT_PUBLIC_SUPABASE_URL?.trim() || env.SUPABASE_URL?.trim())),
  ),
};
const paidExecutionDisabled = posture.RI_AI_EXECUTION_ENABLED !== 'true';
const stagesFixture = Object.values(stageFlags).every((v) => v === 'FIXTURE');
const checks = {
  paidExecutionDisabled,
  stagesFixture,
  modelIsSonnet55: posture.resolvedModel === 'claude-sonnet-5-5',
  modelPriced: posture.resolvedModelPriced,
  budgetIs075: Number(posture.RI_LAB_ANTHROPIC_MAX_USD) === 0.75,
  maxRequestsIs8: Number(posture.RI_LAB_ANTHROPIC_MAX_REQUESTS) === 8,
  keyPresent: posture.anthropicKeyPresent,
  ledgerReachableConfigPresent: posture.ledgerConnectionPresent,
};
console.log(JSON.stringify({ posture, checks, pass: Object.values(checks).every(Boolean) }, null, 2));
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);

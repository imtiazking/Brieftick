import 'server-only';

import {
  createAnthropicProvider,
  ANTHROPIC_PROVIDER_ID,
  isAnthropicConfigured,
} from '@/lib/ri/ai/anthropic-provider';
import { createFixtureProvider, FIXTURE_PROVIDER_ID } from '@/lib/ri/ai/fixture-provider';
import { createOpenAiProvider, OPENAI_PROVIDER_ID, isOpenAiConfigured } from '@/lib/ri/ai/openai-provider';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AI_PROVIDER_MODE } from '@/lib/ri/ai/enums';
import { AI_ERRORS } from '@/lib/ri/ai/errors';
import {
  resolveAnthropicHealthStatus,
  resolveFixtureHealthStatus,
  resolveOpenAiHealthStatus,
  type ProviderHealthRow,
} from '@/lib/ri/ai/provider-health';

export type AiProviderMode = (typeof AI_PROVIDER_MODE)[keyof typeof AI_PROVIDER_MODE];

export function getRequestedProviderMode(): AiProviderMode | 'LIVE' {
  const raw = (process.env.RI_AI_PROVIDER_MODE || 'FIXTURE').toUpperCase();
  if (raw === 'LIVE' || raw === 'AUTO') return 'LIVE';
  if (raw === AI_PROVIDER_MODE.ANTHROPIC) return AI_PROVIDER_MODE.ANTHROPIC;
  if (raw === AI_PROVIDER_MODE.OPENAI) return AI_PROVIDER_MODE.OPENAI;
  return AI_PROVIDER_MODE.FIXTURE;
}

export function isLiveProviderRequested(): boolean {
  const requested = getRequestedProviderMode();
  return requested === 'LIVE' || requested === AI_PROVIDER_MODE.ANTHROPIC || requested === AI_PROVIDER_MODE.OPENAI;
}

/**
 * When a live provider is requested but cannot be resolved, return an error code (no silent fixture fallback).
 */
export function resolveLiveProviderFallbackError(): string | null {
  const requested = getRequestedProviderMode();
  const resolved = resolveAiProviderMode();

  if (requested === AI_PROVIDER_MODE.FIXTURE) return null;
  if (requested === AI_PROVIDER_MODE.ANTHROPIC && resolved !== AI_PROVIDER_MODE.ANTHROPIC) {
    return AI_ERRORS.AI_LIVE_PROVIDER_UNAVAILABLE;
  }
  if (requested === AI_PROVIDER_MODE.OPENAI && resolved !== AI_PROVIDER_MODE.OPENAI) {
    return AI_ERRORS.AI_LIVE_PROVIDER_UNAVAILABLE;
  }
  if (requested === 'LIVE' && resolved === AI_PROVIDER_MODE.FIXTURE) {
    return AI_ERRORS.AI_LIVE_PROVIDER_UNAVAILABLE;
  }
  return null;
}

/**
 * Resolve runtime provider for publication analysis.
 * Default FIXTURE unless a live provider is explicitly selected and configured.
 * Live preference: Anthropic → OpenAI when RI_AI_PROVIDER_MODE=ANTHROPIC|OPENAI|LIVE.
 */
export function resolveAiProviderMode(): AiProviderMode {
  const raw = (process.env.RI_AI_PROVIDER_MODE || 'FIXTURE').toUpperCase();

  if (raw === AI_PROVIDER_MODE.FIXTURE) return AI_PROVIDER_MODE.FIXTURE;

  if (raw === AI_PROVIDER_MODE.ANTHROPIC) {
    return isAnthropicConfigured() ? AI_PROVIDER_MODE.ANTHROPIC : AI_PROVIDER_MODE.FIXTURE;
  }

  if (raw === AI_PROVIDER_MODE.OPENAI) {
    return isOpenAiConfigured() ? AI_PROVIDER_MODE.OPENAI : AI_PROVIDER_MODE.FIXTURE;
  }

  if (raw === 'LIVE' || raw === 'AUTO') {
    if (isAnthropicConfigured()) return AI_PROVIDER_MODE.ANTHROPIC;
    if (isOpenAiConfigured()) return AI_PROVIDER_MODE.OPENAI;
    return AI_PROVIDER_MODE.FIXTURE;
  }

  return AI_PROVIDER_MODE.FIXTURE;
}

export function getAiProvider(mode?: AiProviderMode) {
  const resolved = mode || resolveAiProviderMode();
  if (resolved === AI_PROVIDER_MODE.ANTHROPIC) return createAnthropicProvider();
  if (resolved === AI_PROVIDER_MODE.OPENAI) return createOpenAiProvider();
  return createFixtureProvider();
}

export function resolveModelForProviderMode(mode: AiProviderMode): string {
  if (mode === AI_PROVIDER_MODE.FIXTURE) return 'fixture-ri';
  if (mode === AI_PROVIDER_MODE.ANTHROPIC) return createAnthropicProvider().model;
  if (mode === AI_PROVIDER_MODE.OPENAI) return process.env.RI_OPENAI_MODEL?.trim() || 'gpt-4o-mini';
  return 'fixture-ri';
}

export async function listProviderHealth(options?: {
  supabase?: SupabaseClient | null;
  organisationId?: string | null;
}): Promise<ProviderHealthRow[]> {
  const activeMode = resolveAiProviderMode();
  const fixture = createFixtureProvider();
  const anthropic = createAnthropicProvider();
  const openai = createOpenAiProvider();

  const [fixtureStatus, anthropicStatus, openaiStatus] = await Promise.all([
    resolveFixtureHealthStatus(),
    resolveAnthropicHealthStatus({
      supabase: options?.supabase,
      organisationId: options?.organisationId,
    }),
    resolveOpenAiHealthStatus(),
  ]);

  const executionEnabled = process.env.RI_AI_EXECUTION_ENABLED === 'true';

  return [
    {
      id: fixture.id,
      label: 'Fixture',
      mode: fixture.mode,
      status: fixtureStatus.status,
      detail: fixtureStatus.detail,
      active: activeMode === AI_PROVIDER_MODE.FIXTURE,
      executionEnabled: true,
    },
    {
      id: anthropic.id,
      label: 'Anthropic (Claude)',
      mode: anthropic.mode,
      status: anthropicStatus.status,
      detail: anthropicStatus.detail,
      active: activeMode === AI_PROVIDER_MODE.ANTHROPIC,
      executionEnabled,
    },
    {
      id: openai.id,
      label: 'OpenAI',
      mode: openai.mode,
      status: openaiStatus.status,
      detail: openaiStatus.detail,
      active: activeMode === AI_PROVIDER_MODE.OPENAI,
      executionEnabled,
    },
  ];
}

export { FIXTURE_PROVIDER_ID, OPENAI_PROVIDER_ID, ANTHROPIC_PROVIDER_ID };

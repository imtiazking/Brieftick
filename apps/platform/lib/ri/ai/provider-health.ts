import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ANTHROPIC_PROVIDER_ID,
  getAnthropicApiKey,
  isAnthropicConfigured,
  validateAnthropicApiKeyFormat,
} from '@/lib/ri/ai/anthropic-provider';
import { AI_EXECUTION_STATUS } from '@/lib/ri/ai/enums';
import { createFixtureProvider } from '@/lib/ri/ai/fixture-provider';
import { isOpenAiConfigured, validateOpenAiApiKeyFormat } from '@/lib/ri/ai/openai-provider';
import { isRiAiExecutionEnabled, isRiAiRemoteHealthCheckEnabled } from '@/lib/ri/ai/ri-ai-execution';

export type ProviderHealthStatus =
  | 'Not configured'
  | 'Configured'
  | 'Connectivity verified'
  | 'Execution disabled'
  | 'Operational'
  | 'Unhealthy';

export type ProviderHealthRow = {
  id: string;
  label: string;
  mode: string;
  status: ProviderHealthStatus;
  detail: string;
  active: boolean;
  executionEnabled: boolean;
};

export async function checkFixtureProviderHealth(): Promise<boolean> {
  const provider = createFixtureProvider();
  const result = await provider.execute({
    fixtureScenario: 'health-check',
    analysisType: 'Applicability Recommendation',
    context: {
      sourceSections: [{ sourceSectionId: 'HEALTH-CHECK', citation: 'health', text: 'health-check' }],
    },
  });
  return Boolean(result.ok && 'structured' in result);
}

export async function checkAnthropicConnectivity(deps?: { fetchFn?: typeof fetch }): Promise<boolean> {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) return false;
  if (!isRiAiRemoteHealthCheckEnabled()) return false;
  const fetchFn = deps?.fetchFn ?? fetch;
  try {
    const res = await fetchFn('https://api.anthropic.com/v1/models', {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Operational requires at least one completed live Claude analysis run for the tenant. */
export async function hasCompletedAnthropicAnalysisRun(
  supabase: SupabaseClient | null | undefined,
  organisationId: string | null | undefined,
): Promise<boolean> {
  if (!supabase || !organisationId) return false;
  const { count, error } = await supabase
    .from('ai_analysis_runs')
    .select('id', { count: 'exact', head: true })
    .eq('organisation_id', organisationId)
    .eq('provider', ANTHROPIC_PROVIDER_ID)
    .eq('execution_status', AI_EXECUTION_STATUS.COMPLETED);
  if (error) return false;
  return (count ?? 0) > 0;
}

export async function resolveAnthropicHealthStatus(deps?: {
  fetchFn?: typeof fetch;
  supabase?: SupabaseClient | null;
  organisationId?: string | null;
}): Promise<{ status: ProviderHealthStatus; detail: string }> {
  if (!isAnthropicConfigured()) {
    return { status: 'Not configured', detail: 'Set ANTHROPIC_API_KEY (server-side) on the platform project.' };
  }
  if (!validateAnthropicApiKeyFormat()) {
    return { status: 'Unhealthy', detail: 'API key present but format validation failed.' };
  }

  const executionEnabled = isRiAiExecutionEnabled();
  const connectivity = await checkAnthropicConnectivity(deps);
  const hasCompletedRun = await hasCompletedAnthropicAnalysisRun(deps?.supabase, deps?.organisationId);

  if (!executionEnabled) {
    if (connectivity) {
      return {
        status: 'Connectivity verified',
        detail:
          'Anthropic API reachable. RI_AI_EXECUTION_ENABLED=false — live Messages API calls are disabled.',
      };
    }
    return {
      status: 'Execution disabled',
      detail:
        'API key configured. RI_AI_EXECUTION_ENABLED=false — no live Messages API calls. Set RI_AI_REMOTE_HEALTH_CHECK=1 to verify connectivity.',
    };
  }

  if (hasCompletedRun) {
    return {
      status: 'Operational',
      detail:
        'At least one completed Claude analysis run recorded for this organisation. Human review required before decisions.',
    };
  }

  if (connectivity) {
    return {
      status: 'Connectivity verified',
      detail:
        'API reachable and execution enabled, but no completed Claude analysis run yet — not Operational until a successful live execution is recorded.',
    };
  }

  return {
    status: 'Configured',
    detail:
      'Execution enabled; awaiting connectivity check (RI_AI_REMOTE_HEALTH_CHECK=1) and first successful analysis run.',
  };
}

export async function resolveOpenAiHealthStatus(): Promise<{ status: ProviderHealthStatus; detail: string }> {
  if (!isOpenAiConfigured()) {
    return { status: 'Not configured', detail: 'OPENAI_API_KEY not set.' };
  }
  if (!validateOpenAiApiKeyFormat()) {
    return { status: 'Unhealthy', detail: 'OPENAI_API_KEY format invalid.' };
  }
  if (!isRiAiExecutionEnabled()) {
    return {
      status: 'Execution disabled',
      detail: 'Key present; RI_AI_EXECUTION_ENABLED=false.',
    };
  }
  return {
    status: 'Configured',
    detail: 'OpenAI execution flag on; live structured analysis not implemented in RI yet.',
  };
}

export async function resolveFixtureHealthStatus(): Promise<{ status: ProviderHealthStatus; detail: string }> {
  const ok = await checkFixtureProviderHealth();
  if (!ok) {
    return { status: 'Unhealthy', detail: 'Fixture self-test failed.' };
  }
  return {
    status: 'Operational',
    detail: 'Deterministic acceptance provider (no external API).',
  };
}

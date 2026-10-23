import 'server-only';

import { createFixtureProvider, FIXTURE_PROVIDER_ID } from '@/lib/ri/ai/fixture-provider';
import { createOpenAiProvider, OPENAI_PROVIDER_ID } from '@/lib/ri/ai/openai-provider';
import { AI_PROVIDER_MODE } from '@/lib/ri/ai/enums';

export type AiProviderMode = (typeof AI_PROVIDER_MODE)[keyof typeof AI_PROVIDER_MODE];

export function resolveAiProviderMode(): AiProviderMode {
  const mode = (process.env.RI_AI_PROVIDER_MODE || 'FIXTURE').toUpperCase();
  if (mode === AI_PROVIDER_MODE.OPENAI && process.env.OPENAI_API_KEY) {
    return AI_PROVIDER_MODE.OPENAI;
  }
  return AI_PROVIDER_MODE.FIXTURE;
}

export function getAiProvider(mode?: AiProviderMode) {
  const resolved = mode || resolveAiProviderMode();
  if (resolved === AI_PROVIDER_MODE.OPENAI) return createOpenAiProvider();
  return createFixtureProvider();
}

export function listProviderHealth() {
  const fixture = createFixtureProvider();
  const openai = createOpenAiProvider();
  return [
    { id: fixture.id, mode: fixture.mode, status: 'Healthy' },
    {
      id: openai.id,
      mode: openai.mode,
      status: openai.configured ? 'Configured' : 'Not configured',
    },
  ];
}

export { FIXTURE_PROVIDER_ID, OPENAI_PROVIDER_ID };

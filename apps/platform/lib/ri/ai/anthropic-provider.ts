import 'server-only';

import { createAnthropicProvider as createAnthropicProviderCore } from '@/lib/ri/ai/anthropic-provider-core.mjs';

export {
  ANTHROPIC_PROVIDER_ID,
  getAnthropicApiKey,
  isAnthropicConfigured,
  validateAnthropicApiKeyFormat,
  resolveAnthropicModel,
} from '@/lib/ri/ai/anthropic-provider-core.mjs';

export type AnthropicProviderDeps = {
  fetchFn?: typeof fetch;
  apiKeyOverride?: string;
};

export function createAnthropicProvider(deps?: AnthropicProviderDeps) {
  return createAnthropicProviderCore(deps);
}

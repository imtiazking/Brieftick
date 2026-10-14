import { createFixtureProvider, FIXTURE_PROVIDER_ID } from './fixture-provider.js';
import { createExternalProvider, EXTERNAL_PROVIDER_ID } from './external-provider.js';

const cache = new Map();

export function getAiProvider(providerId, mode = 'fixture') {
  if (mode === 'production' || mode === 'live-verification') {
    if (providerId === EXTERNAL_PROVIDER_ID) return createExternalProvider();
  }
  if (providerId === FIXTURE_PROVIDER_ID || mode === 'fixture') {
    if (!cache.has('fixture')) cache.set('fixture', createFixtureProvider());
    return cache.get('fixture');
  }
  return createFixtureProvider();
}

export function resolveAiExecutionMode(platformConfig) {
  return platformConfig?.aiExecutionMode || 'fixture';
}

export function externalAiAllowed(state) {
  const cfg = state.platformConfig || {};
  const tenant = state.tenantAiPolicy || {};
  if (cfg.aiExecutionMode !== 'live-verification' && cfg.aiExecutionMode !== 'production') return false;
  if (!cfg.allowLiveAiVerification) return false;
  if (tenant.allowExternalAI === false) return false;
  return true;
}

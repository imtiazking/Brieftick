/** Design Lab platform configuration — no secrets. */
export const DEFAULT_PLATFORM_CONFIG = {
  environment: 'design-lab',
  adapterMode: 'local',
  apiBaseUrl: null,
  tenantMode: 'single-demo',
  auditMode: 'append-only-mock',
  schemaVersion: 14,
  aiExecutionMode: 'fixture',
  allowLiveAiVerification: false,
  regulatoryConnectorMode: 'fixture',
  allowLiveRegulatoryVerification: false,
  connectorRateLimitMs: 3000,
  featureFlags: {
    apiAdapter: false,
    multiTenantUi: false,
    optimisticConcurrency: true,
    liveRegulatoryDemo7: false,
  },
};

export function normalizePlatformConfig(raw) {
  return { ...DEFAULT_PLATFORM_CONFIG, ...(raw || {}) };
}

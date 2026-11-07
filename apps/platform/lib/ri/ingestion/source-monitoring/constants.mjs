/** Permitted monitoring intervals (minutes) — activation step may tighten further. */
export const PERMITTED_MONITORING_INTERVALS_MINUTES = [60, 360, 720, 1440, 2880, 10080];

export const DEFAULT_MONITORING_INTERVAL_MINUTES = 1440;

export const SOURCE_READINESS_CLASS = {
  READY_FOR_CONFIGURATION: 'READY_FOR_CONFIGURATION',
  REQUIRES_CONNECTOR_WORK: 'REQUIRES_CONNECTOR_WORK',
  REQUIRES_VALIDATION: 'REQUIRES_VALIDATION',
  UNSUPPORTED: 'UNSUPPORTED',
};

export const MONITORING_STATUS = {
  REGISTERED: 'registered',
  UNCONFIGURED: 'unconfigured',
  CONFIGURED: 'configured',
  DISABLED: 'disabled',
  SCHEDULED: 'scheduled',
  ACTIVE: 'active',
  DEGRADED: 'degraded',
  FAILED: 'failed',
  UNSUPPORTED: 'unsupported',
};

import { deriveMonitoringStatus } from './monitoring-status.mjs';
import { MONITORING_STATUS } from './constants.mjs';

const recent = new Date().toISOString();
const stale = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();

/**
 * Regression matrix for deriveMonitoringStatus (no DB, no HTTP).
 * @returns {{ pass: string[], fail: string[] }}
 */
export function runMonitoringStatusRegressionCases() {
  const pass = [];
  const fail = [];

  function expect(label, params, expectedStatus) {
    const { status } = deriveMonitoringStatus(params);
    if (status === expectedStatus) pass.push(label);
    else fail.push(`${label}: expected ${expectedStatus}, got ${status}`);
  }

  expect('unsupported catalogue', { sourceExternalKey: 'SRC-SEC-FEDERAL-REGISTER', operations: null }, MONITORING_STATUS.UNSUPPORTED);
  expect('unconfigured no ops', { sourceExternalKey: 'SRC-FCA-PUBLICATIONS-RSS', operations: null }, MONITORING_STATUS.UNCONFIGURED);

  expect(
    'disabled despite last_success_at',
    {
      sourceExternalKey: 'SRC-FCA-PUBLICATIONS-RSS',
      operations: { enabled: false, last_success_at: recent, health_status: 'HEALTHY' },
    },
    MONITORING_STATUS.DISABLED,
  );

  expect(
    'not active when monitoring not enabled',
    {
      sourceExternalKey: 'SRC-FCA-PUBLICATIONS-RSS',
      operations: { last_success_at: recent, health_status: 'HEALTHY' },
    },
    MONITORING_STATUS.REGISTERED,
  );

  expect(
    'stale success is degraded not active',
    {
      sourceExternalKey: 'SRC-FCA-PUBLICATIONS-RSS',
      operations: {
        enabled: true,
        last_success_at: stale,
        health_status: 'HEALTHY',
        stale_after_minutes: 10080,
        schedule_type: 'MANUAL_ONLY',
      },
    },
    MONITORING_STATUS.DEGRADED,
  );

  expect(
    'unknown health with recent success is not active',
    {
      sourceExternalKey: 'SRC-FCA-PUBLICATIONS-RSS',
      operations: {
        enabled: true,
        last_success_at: recent,
        health_status: 'UNKNOWN',
        stale_after_minutes: 10080,
        schedule_type: 'MANUAL_ONLY',
      },
    },
    MONITORING_STATUS.CONFIGURED,
  );

  expect(
    'active requires enabled recent success and healthy',
    {
      sourceExternalKey: 'SRC-FCA-PUBLICATIONS-RSS',
      operations: {
        enabled: true,
        last_success_at: recent,
        health_status: 'HEALTHY',
        stale_after_minutes: 10080,
        schedule_type: 'MANUAL_ONLY',
      },
    },
    MONITORING_STATUS.ACTIVE,
  );

  expect(
    'stale health beats last_success',
    {
      sourceExternalKey: 'SRC-FCA-PUBLICATIONS-RSS',
      operations: {
        enabled: true,
        last_success_at: recent,
        health_status: 'STALE',
        schedule_type: 'MANUAL_ONLY',
      },
    },
    MONITORING_STATUS.DEGRADED,
  );

  expect(
    'failed run without success',
    {
      sourceExternalKey: 'SRC-FCA-PUBLICATIONS-RSS',
      operations: {
        enabled: true,
        last_failure_at: recent,
        health_status: 'FAILING',
        schedule_type: 'MANUAL_ONLY',
      },
      latestRunStatus: 'FAILED',
    },
    MONITORING_STATUS.FAILED,
  );

  expect(
    'scheduled without success',
    {
      sourceExternalKey: 'SRC-FCA-PUBLICATIONS-RSS',
      operations: {
        enabled: true,
        schedule_type: 'INTERVAL',
        interval_minutes: 1440,
        next_run_at: recent,
        health_status: 'UNKNOWN',
      },
    },
    MONITORING_STATUS.SCHEDULED,
  );

  return { pass, fail };
}

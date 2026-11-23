/**
 * Application-level resource metrics (stdout JSON) when FORGENIQ_LAB_RESOURCE_METRICS=true.
 * Not a substitute for Vercel Observability — used where Hobby plan blocks team metrics.
 */
import { performance } from 'node:perf_hooks';

export function isLabResourceMetricsEnabled() {
  return process.env.FORGENIQ_LAB_RESOURCE_METRICS === 'true';
}

/**
 * @param {string} event
 * @param {Record<string, unknown>} fields
 */
export function emitLabResourceMetric(event, fields = {}) {
  if (!isLabResourceMetricsEnabled()) return;
  const line = {
    type: 'forgeniq_lab_resource_metric',
    at: new Date().toISOString(),
    event,
    ...fields,
  };
  console.log(JSON.stringify(line));
}

export function startLabResourceTimer() {
  const cpu0 = process.cpuUsage();
  const wall0 = performance.now();
  return {
    end(extra = {}) {
      const cpu1 = process.cpuUsage(cpu0);
      emitLabResourceMetric('request_timing', {
        wallClockMs: Math.round(performance.now() - wall0),
        cpuUserMicros: cpu1.user,
        cpuSystemMicros: cpu1.system,
        ...extra,
      });
    },
  };
}
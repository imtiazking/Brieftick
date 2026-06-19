/**
 * Console-only provider health check (no UI, no keys in logs).
 * @module lib/provider-health
 *
 * Usage (browser console on forgeniq.com):
 *   await BrieftickProviderHealth.env()
 *   await BrieftickProviderHealth.probe('YOUR_HEALTH_PROBE_SECRET')
 */

const STATUS_LABELS = {
  ok: 'OK',
  error: 'ERROR',
  rate_limited: 'RATE LIMITED / DELAYED',
  forbidden: 'FORBIDDEN',
  delayed: 'DELAYED / TIMEOUT',
  unknown: 'UNKNOWN',
};

/**
 * @param {object} data
 */
function logProviderTable(data) {
  const rows = (data.providers || []).map((p) => ({
    Provider: p.name,
    Env: p.envPresent ? 'yes' : 'no',
    Status: STATUS_LABELS[p.lastTestStatus] || p.lastTestStatus,
    HTTP: p.httpStatus ?? '—',
    Message: p.message || '',
    Probe: p.probe || '',
  }));
  console.table(rows);
  if (data.summary) {
    console.log('[provider-health] summary', data.summary);
  }
  if (data.at) {
    console.log('[provider-health] at', data.at, 'authorized:', data.probeAuthorized);
  }
  return rows;
}

/**
 * Env presence only (no live upstream calls).
 */
export async function fetchEnvStatus() {
  const res = await fetch('/api/proxy?provider=status');
  const data = await res.json();
  if (!res.ok) {
    console.warn('[provider-health] status HTTP', res.status, data?.message || data?.error);
  }
  logProviderTable(data);
  return data;
}

/**
 * Live probes — requires HEALTH_PROBE_SECRET from Vercel (never commit or paste in tickets).
 * @param {string} healthSecret
 */
export async function fetchProbeStatus(healthSecret) {
  if (!healthSecret || typeof healthSecret !== 'string' || healthSecret.length < 8) {
    console.error(
      '[provider-health] Pass your Vercel HEALTH_PROBE_SECRET: await BrieftickProviderHealth.probe("…")'
    );
    return null;
  }
  const res = await fetch('/api/proxy?provider=status&probe=1', {
    headers: { 'x-brieftick-health-key': healthSecret },
  });
  const data = await res.json();
  if (res.status === 403) {
    console.error('[provider-health] probe denied — check HEALTH_PROBE_SECRET on Vercel');
    console.log(data?.message || data?.error);
    return data;
  }
  if (!res.ok) {
    console.warn('[provider-health] probe HTTP', res.status);
  }
  logProviderTable(data);
  return data;
}

/**
 * Pretty-print last report object.
 * @param {object} data
 */
export function log(data) {
  return logProviderTable(data);
}

if (typeof window !== 'undefined') {
  window.BrieftickProviderHealth = {
    env: fetchEnvStatus,
    probe: fetchProbeStatus,
    log,
  };
}

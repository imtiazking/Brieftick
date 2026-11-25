/**
 * Staging release host policy. Official URL stays on staging-app; candidates use candidate-staging.
 */
export const OFFICIAL_STAGING_ORIGIN = 'https://staging-app.forgeniq.com';
export const CANDIDATE_STAGING_ORIGIN = 'https://candidate-staging.forgeniq.com';
export const AUTHORIZED_AUTH_HOSTS = new Set(['staging-app.forgeniq.com', 'candidate-staging.forgeniq.com']);

export function authOrigin() {
  const base = (process.env.FORGENIQ_AUTH_BASE || OFFICIAL_STAGING_ORIGIN).replace(/\/$/, '');
  const host = new URL(base).hostname;
  if (!AUTHORIZED_AUTH_HOSTS.has(host)) {
    throw new Error(`auth_host_not_allowed:${host}`);
  }
  return base;
}

export function isAuthorizedAuthHost(hostname) {
  return AUTHORIZED_AUTH_HOSTS.has(String(hostname || '').toLowerCase());
}

export function designLabEntry(origin = authOrigin()) {
  return `${origin}/design-lab/regulatory-intelligence/index.html`;
}

export async function candidateHostResolves() {
  const host = new URL(CANDIDATE_STAGING_ORIGIN).hostname;
  try {
    const { lookup } = await import('node:dns/promises');
    const records = await lookup(host);
    return Boolean(records?.address);
  } catch {
    return false;
  }
}

export async function candidateHttpsReachable() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    const res = await fetch(`${CANDIDATE_STAGING_ORIGIN}/health`, { signal: controller.signal, redirect: 'follow' });
    clearTimeout(timer);
    return res.status < 500;
  } catch {
    return false;
  }
}
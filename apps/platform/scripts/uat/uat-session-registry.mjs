/**
 * Session registry metadata (no secrets). Profiles stay under %LOCALAPPDATA%\forgeniq-uat-sessions.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { OFFICIAL_STAGING_ORIGIN, CANDIDATE_STAGING_ORIGIN, AUTHORIZED_AUTH_HOSTS } from '../staging/staging-release-hosts.mjs';

const SESSION_ROOT = join(process.env.LOCALAPPDATA || join(process.env.USERPROFILE || '.', 'AppData', 'Local'), 'forgeniq-uat-sessions');
const REGISTRY_PATH = join(SESSION_ROOT, 'session-registry.json');

export function sessionRoot() {
  return SESSION_ROOT;
}

export function registryPath() {
  return REGISTRY_PATH;
}

export function loadRegistry() {
  if (!existsSync(REGISTRY_PATH)) return { version: 1, sessions: {} };
  try {
    return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  } catch {
    return { version: 1, sessions: {} };
  }
}

export function saveRegistry(registry) {
  if (!existsSync(SESSION_ROOT)) mkdirSync(SESSION_ROOT, { recursive: true });
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

export function registryKey(hostname, persona) {
  return `${hostname}/${persona}`;
}

/** Record successful validation (userId, role, org only — no tokens). */
export function recordSessionValidation({ hostname, persona, userId, role, organisationId, profilePath, origin, method }) {
  const registry = loadRegistry();
  const key = registryKey(hostname, persona);
  registry.sessions[key] = {
    persona,
    hostname,
    origin: origin || `https://${hostname}`,
    profilePath,
    userId,
    role,
    organisationId,
    lastValidatedAt: new Date().toISOString(),
    state: 'VALID',
    method: method || 'playwright_profile',
  };
  saveRegistry(registry);
}

export function markSessionState(hostname, persona, state, detail) {
  const registry = loadRegistry();
  const key = registryKey(hostname, persona);
  const prior = registry.sessions[key] || { persona, hostname };
  registry.sessions[key] = {
    ...prior,
    state,
    detail: detail?.slice(0, 500),
    checkedAt: new Date().toISOString(),
  };
  saveRegistry(registry);
}

/** Discover on-disk Playwright profile folders (preserve all; never delete here). */
export function discoverStoredProfiles() {
  const found = [];
  if (!existsSync(SESSION_ROOT)) return found;
  const legacyRe = /^persona-(A|B|C|OP1|OP2)$/;
  for (const name of readdirSync(SESSION_ROOT)) {
    const full = join(SESSION_ROOT, name);
    if (!statSync(full).isDirectory()) continue;
    if (legacyRe.test(name)) {
      found.push({
        hostname: new URL(OFFICIAL_STAGING_ORIGIN).hostname,
        persona: name.replace('persona-', ''),
        profilePath: full,
        layout: 'legacy-official',
      });
      continue;
    }
  }
  for (const hostSlug of readdirSync(SESSION_ROOT)) {
    const hostDir = join(SESSION_ROOT, hostSlug);
    if (!statSync(hostDir).isDirectory() || !hostSlug.includes('_')) continue;
    const hostname = hostSlug.replace(/_/g, '.');
    if (!AUTHORIZED_AUTH_HOSTS.has(hostname)) continue;
    for (const child of readdirSync(hostDir)) {
      const m = child.match(/^persona-(A|B|C|OP1|OP2)$/);
      if (!m) continue;
      found.push({
        hostname,
        persona: m[1],
        profilePath: join(hostDir, child),
        layout: 'host-scoped',
      });
    }
  }
  return found;
}

/** Server-side Clerk env check — not a user session problem. */
export async function probeClerkOnHost(origin) {
  const base = origin.replace(/\/$/, '');
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(`${base}/sign-in`, { signal: controller.signal, redirect: 'follow', headers: { accept: 'text/html' } });
    clearTimeout(timer);
    const text = await res.text();
    if (/Clerk is not configured/i.test(text)) {
      return { ok: false, code: 'CLERK_NOT_CONFIGURED', httpStatus: res.status, origin: base };
    }
    if (!res.ok) return { ok: false, code: 'HTTP_ERROR', httpStatus: res.status, origin: base };
    return { ok: true, code: 'CLERK_READY', httpStatus: res.status, origin: base };
  } catch (err) {
    return { ok: false, code: 'UNREACHABLE', origin: base, detail: String(err.message || err) };
  }
}

export const KNOWN_ORIGINS = [OFFICIAL_STAGING_ORIGIN, CANDIDATE_STAGING_ORIGIN];
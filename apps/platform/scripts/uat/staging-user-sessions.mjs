#!/usr/bin/env node
/**
 * Persistent, isolated Playwright sessions for the FORGENIQ staging UAT users.
 *
 * Each persona has its own Chrome profile under %LOCALAPPDATA%\forgeniq-uat-sessions\<persona>
 * (outside the repository; cookies are encrypted by Chrome with the Windows user's DPAPI key).
 * Nothing here reads, prints or exports cookies or tokens, and no password is ever handled:
 * the tester signs in once per persona in a headed window.
 *
 * CLI:
 *   node scripts/uat/staging-user-sessions.mjs login <A|B|C|all>
 *   node scripts/uat/staging-user-sessions.mjs status
 *   node scripts/uat/staging-user-sessions.mjs logout <A|B|C>
 *
 * Library:
 *   import { runAs } from './staging-user-sessions.mjs';
 *   await runAs('B', async ({ page, act }) => { await act('submit review', async () => { ... }); });
 */
import { config as dotenvConfig } from 'dotenv';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  OFFICIAL_STAGING_ORIGIN,
  authOrigin,
  designLabEntry,
} from '../staging/staging-release-hosts.mjs';
import {
  probeClerkOnHost,
  recordSessionValidation,
  markSessionState,
  registryKey,
} from './uat-session-registry.mjs';

export const STAGING_ORIGIN = OFFICIAL_STAGING_ORIGIN;
export const STAGING_ORGANISATION_ID = 'b8f5e3a1-00ad-4000-8000-000000000001';
const SESSION_ROOT = join(process.env.LOCALAPPDATA || join(process.env.USERPROFILE || '.', 'AppData', 'Local'), 'forgeniq-uat-sessions');
const ATTRIBUTION_LOG = join(SESSION_ROOT, 'attribution.log');
const UAT_AGENT_ENV = join(SESSION_ROOT, 'uat-agent.env');

export function loadUatAgentEnv() {
  secureSessionRoot();
  if (existsSync(UAT_AGENT_ENV)) {
    const raw = readFileSync(UAT_AGENT_ENV, 'utf8');
    if (!/FORGENIQ_HOSTED_CLERK_SECRET_KEY\s*=/.test(raw) && /^sk_/m.test(raw.trim())) {
      const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
      spawnSync(process.execPath, ['./scripts/uat/_normalize-uat-agent-env.mjs'], { cwd: platformRoot, encoding: 'utf8' });
    }
    dotenvConfig({ path: UAT_AGENT_ENV });
  }
  dotenvConfig({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.env.local'), override: false });
  const sk = process.env.FORGENIQ_HOSTED_CLERK_SECRET_KEY?.trim() || process.env.CLERK_SECRET_KEY?.trim();
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
  if (sk && pk && sk.startsWith('sk_test_') && pk.startsWith('pk_live_')) {
    process.env.FORGENIQ_UAT_CLERK_KEY_MISMATCH = 'test_secret_with_live_frontend';
  }
}
const LOGIN_WAIT_MS = Number(process.env.FORGENIQ_UAT_LOGIN_WAIT_MS || 30 * 60_000);
const ALLOWED_ROLES = new Set(['OWNER', 'ADMIN', 'COMPLIANCE_MANAGER', 'ANALYST', 'REVIEWER']);

function activeOrigin() {
  return authOrigin();
}

function designLabUrl() {
  return designLabEntry(activeOrigin());
}

function hostProfileSlug(origin) {
  return new URL(origin).hostname.replace(/\./g, '_');
}

function onOrigin(url, origin = activeOrigin()) {
  return url.startsWith(origin);
}

/** Only staging and its authentication providers may be loaded; production FORGENIQ hosts are refused. */
const ALLOWED_HOSTS = [
  /^staging-app\.forgeniq\.com$/,
  /^candidate-staging\.forgeniq\.com$/,
  /^clerk\.forgeniq\.com$/,
  /^accounts\.forgeniq\.com$/,
  /^img\.clerk\.com$/,
  /\.clerk\.accounts\.dev$/,
  /\.clerk\.com$/,
  /(^|\.)google\.com$/,
  /\.gstatic\.com$/,
  /\.googleapis\.com$/,
  /^challenges\.cloudflare\.com$/,
];

export const PERSONAS = {
  A: {
    label: 'User A — Maker',
    userId: 'user_3LA76vR4CueutWtEpcAxvqYKkEv',
    expectedEmail: 'forgeniq@gmail.com',
    requiredCapabilities: ['obligations', 'applicabilityWorkflow', 'aiRequest'],
  },
  B: {
    label: 'User B — Reviewer',
    userId: 'user_3Fa9TcFi8izkxHdDP58Qb3UY4mr',
    expectedEmail: 'imtiazahmed_@hotmail.com',
    expectedRole: 'REVIEWER',
    requiredCapabilities: ['aiReview'],
  },
  C: {
    label: 'User C — Approver',
    userId: 'user_3LBBtwYR4mmFisfpzMj3n7DVtVh',
    expectedEmail: 'forgeniq@yahoo.com',
    requiredCapabilities: ['obligationReview', 'applicabilityWorkflow'],
  },
  OP1: {
    label: 'Platform operator 1 (staging clerk.forgeniq.com)',
    userId: 'user_3LA76vR4CueutWtEpcAxvqYKkEv',
    expectedEmail: 'forgeniq@gmail.com',
    sessionProfile: 'A',
    operator: true,
    requiredCapabilities: [],
  },
  OP2: {
    label: 'Platform operator 2 (independent maker-checker)',
    userId: 'user_3LBBtwYR4mmFisfpzMj3n7DVtVh',
    expectedEmail: 'forgeniq@yahoo.com',
    sessionProfile: 'C',
    operator: true,
    requiredCapabilities: [],
  },
};

export class SessionExpiredError extends Error {}
export class IdentityMismatchError extends Error {}
/** Hosted Clerk keys missing (preview deployment) — do not open interactive login. */
export class ClerkNotConfiguredError extends Error {}

export function persona(key) {
  const p = PERSONAS[String(key).toUpperCase()];
  if (!p) throw new Error(`unknown persona ${key} (expected A, B, C, OP1 or OP2)`);
  return { key: String(key).toUpperCase(), ...p };
}

export function resolveProfileDir(key, origin = activeOrigin()) {
  const p = persona(key);
  const dirKey = p.sessionProfile || p.key;
  const legacy = join(SESSION_ROOT, `persona-${dirKey}`);
  if (origin === OFFICIAL_STAGING_ORIGIN && existsSync(legacy)) return legacy;
  return join(SESSION_ROOT, hostProfileSlug(origin), `persona-${dirKey}`);
}

function profileDir(key) {
  return resolveProfileDir(key);
}

/** Restrict the session folder to the current Windows user (no inherited ACEs). */
function secureSessionRoot() {
  if (!existsSync(SESSION_ROOT)) mkdirSync(SESSION_ROOT, { recursive: true });
  if (process.platform === 'win32') {
    execFileSync('icacls', [SESSION_ROOT, '/inheritance:r', '/grant:r', `${process.env.USERNAME}:(OI)(CI)F`], { stdio: 'ignore' });
  }
}

function hostAllowed(url) {
  if (url.startsWith('data:') || url.startsWith('blob:') || url === 'about:blank') return true;
  try {
    const { host, protocol } = new URL(url);
    return protocol === 'https:' && ALLOWED_HOSTS.some((re) => re.test(host));
  } catch {
    return false;
  }
}

async function registerNetworkGuard(context) {
  context.on('requestfailed', (request) => {
    const failure = request.failure();
    if (failure?.errorText === 'net::ERR_BLOCKED_BY_CLIENT') {
      console.error(`BLOCKED ${request.url()}`);
    }
  });
  await context.route('**/*', (route) => {
    const request = route.request();
    const url = request.url();
    if (request.isNavigationRequest() && request.frame() === request.frame().page().mainFrame()) {
      if (!hostAllowed(url)) {
        console.error(`BLOCKED navigation ${url}`);
        return route.abort('blockedbyclient');
      }
      return route.continue();
    }
    return hostAllowed(url) ? route.continue() : route.abort('blockedbyclient');
  });
}

async function assertClerkReadyForLogin(origin = activeOrigin(), label = 'auth host') {
  const probe = await probeClerkOnHost(origin);
  if (!probe.ok && probe.code === 'CLERK_NOT_CONFIGURED') {
    throw new ClerkNotConfiguredError(
      `${label}: Clerk is not configured on ${origin} (deployment/env regression). Fix hosting — do not open interactive login.`,
    );
  }
}

export async function launch(key, { headless, fresh = false }) {
  secureSessionRoot();
  if (fresh && existsSync(profileDir(key))) {
    console.warn(`--fresh: archiving is skipped; removing corrupt profile for ${key} only when --fresh is explicit.`);
    rmSync(profileDir(key), { recursive: true, force: true });
  }
  const options = {
    headless,
    viewport: { width: 1360, height: 900 },
    acceptDownloads: false,
  };
  const profile = profileDir(key);
  let context;
  const useChannel = process.env.FORGENIQ_UAT_CHROME_CHANNEL === '1';
  if (useChannel) {
    try {
      context = await chromium.launchPersistentContext(profile, { ...options, channel: 'chrome' });
    } catch (err) {
      console.warn(`Chrome channel unavailable (${err.message}); using bundled Chromium.`);
      context = await chromium.launchPersistentContext(profile, options);
    }
  } else {
    context = await chromium.launchPersistentContext(profile, options);
  }
  await registerNetworkGuard(context);
  const initialPages = context.pages().filter((p) => !p.isClosed());
  const page = initialPages[0] ?? (await context.newPage());
  for (const stale of initialPages) {
    if (stale !== page) await stale.close().catch(() => {});
  }
  return { context, page };
}

/**
 * Users with several memberships must choose an active organisation. This uses the app's own
 * membership-checked endpoint, so it can only select an organisation the user already belongs to.
 */
async function selectStagingOrganisation(page) {
  return page.evaluate(async (organisationId) => {
    const current = await fetch('/api/organisation/active', { credentials: 'same-origin', cache: 'no-store' });
    if (current.ok && (await current.json()).activeOrganisationId === organisationId) return true;
    const res = await fetch('/api/organisation/active', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ organisationId }),
    });
    return res.ok;
  }, STAGING_ORGANISATION_ID);
}

/** Server-side identity from /api/ri-lab/session (Clerk session → organisation membership → role). */
async function readIdentity(page) {
  // A Clerk handshake redirect can destroy the execution context mid-evaluate; settle and retry instead of failing the session.
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await readIdentityOnce(page);
    } catch (error) {
      if (!/Execution context was destroyed|navigation/i.test(String(error?.message))) throw error;
      lastError = error;
      await page.waitForLoadState('load', { timeout: 30_000 }).catch(() => null);
      await page.waitForTimeout(1500);
    }
  }
  throw lastError;
}

async function readIdentityOnce(page) {
  const origin = activeOrigin();
  if (!onOrigin(page.url(), origin)) await page.goto(`${designLabUrl()}#/dashboard`, { waitUntil: 'domcontentloaded' });
  const signedIn = await page.evaluate(() => Boolean(window.Clerk?.user?.id)).catch(() => false);
  if (signedIn) await selectStagingOrganisation(page);
  return page.evaluate(async () => {
    const res = await fetch('/api/ri-lab/session', { credentials: 'same-origin', cache: 'no-store' });
    const clientUserId = window.Clerk?.user?.id ?? null;
    if (!res.ok) return { ok: false, status: res.status, clientUserId };
    const body = await res.json();
    return {
      ok: body.ok === true,
      status: res.status,
      clientUserId,
      userId: body.userId,
      organisationId: body.organisationId,
      organisationName: body.organisationName,
      role: body.role,
      writeCapabilities: body.writeCapabilities || {},
      aiExecutionEnabled: await fetch('/api/ri-lab/readiness', { credentials: 'same-origin', cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((b) => b?.operationalReadiness?.components?.find((c) => c.id === 'ai_runtime')?.diagnostics?.livePosture?.executionEnabled ?? null)
        .catch(() => null),
    };
  });
}

/** Throws unless the page is signed in as exactly this persona, in the staging UAT organisation, with the persona's capabilities. */
export async function verifyIdentity(page, key) {
  const p = persona(key);
  const origin = activeOrigin();
  if (!onOrigin(page.url(), origin) && page.url() !== 'about:blank') {
    throw new IdentityMismatchError(`${p.label}: page is not on the active auth host (${new URL(page.url()).host}, expected ${new URL(origin).host})`);
  }
  const id = await readIdentity(page);
  if (id.status === 401 || id.status === 403 || !id.ok) {
    throw new SessionExpiredError(`${p.label}: no valid staging session (HTTP ${id.status}) — run: node scripts/uat/staging-user-sessions.mjs login ${p.key}`);
  }
  const problems = [];
  if (id.userId !== p.userId) problems.push(`signed in as ${id.userId}, expected ${p.userId}`);
  if (id.clientUserId && id.clientUserId !== id.userId) problems.push('browser and server identities differ');
  if (id.organisationId !== STAGING_ORGANISATION_ID) problems.push(`organisation ${id.organisationId}, expected ${STAGING_ORGANISATION_ID}`);
  if (!ALLOWED_ROLES.has(id.role)) problems.push(`role ${id.role} cannot act`);
  if (p.expectedRole && id.role !== p.expectedRole) problems.push(`role ${id.role}, expected ${p.expectedRole}`);
  for (const cap of p.requiredCapabilities) {
    // aiRequest is granted only while the deployment's paid-AI execution is enabled; a safely disabled deployment is expected to withhold it.
    if (cap === 'aiRequest' && id.aiExecutionEnabled === false && id.writeCapabilities[cap] !== true) continue;
    if (id.writeCapabilities[cap] !== true) problems.push(`capability ${cap} not granted`);
  }
  if (p.operator === true) {
    const isOp = await page.evaluate(async () => {
      const res = await fetch('/api/ri-lab/classification-policy/admin', { credentials: 'same-origin', cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      return body.ok === true && body.operator === true;
    });
    if (!isOp) problems.push('not a platform operator (classification-policy/admin)');
  }
  if (problems.length) throw new IdentityMismatchError(`${p.label}: ${problems.join('; ')}`);
  const identity = {
    persona: p.key,
    label: p.label,
    userId: id.userId,
    organisationId: id.organisationId,
    organisationName: id.organisationName,
    role: id.role,
    capabilities: p.requiredCapabilities,
  };
  const host = new URL(activeOrigin()).hostname;
  recordSessionValidation({
    hostname: host,
    persona: p.key,
    userId: identity.userId,
    role: identity.role,
    organisationId: identity.organisationId,
    profilePath: profileDir(p.key),
    origin: activeOrigin(),
  });
  return identity;
}

function attribute(entry) {
  appendFileSync(ATTRIBUTION_LOG, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
}

let activePersona = null;

/** Headless session probe — no full `runAs` attribution; use before hosted UAT. */
export async function probePersonaSession(key) {
  const p = persona(key);
  const origin = activeOrigin();
  const host = new URL(origin).hostname;
  const clerk = await probeClerkOnHost(origin);
  if (!clerk.ok) {
    return {
      persona: p.key,
      state: clerk.code === 'CLERK_NOT_CONFIGURED' ? 'CLERK_NOT_CONFIGURED' : 'HOST_UNREACHABLE',
      detail: clerk.detail || clerk.code,
      host,
      renew: undefined,
      fix: clerk.code === 'CLERK_NOT_CONFIGURED' ? 'Use a production-environment deployment on this hostname (see STAGING-CANDIDATE-RELEASE.md).' : undefined,
    };
  }
  if (!existsSync(profileDir(p.key))) {
    return {
      persona: p.key,
      state: 'NO SESSION',
      host,
      profilePath: resolveProfileDir(p.key),
      renew: `FORGENIQ_AUTH_BASE=${origin} node scripts/uat/staging-user-sessions.mjs login ${p.key}`,
    };
  }
  const { context, page } = await launch(p.key, { headless: true });
  try {
    const identity = await verifyIdentity(page, p.key);
    return {
      persona: p.key,
      state: 'VALID',
      host,
      userId: identity.userId,
      role: identity.role,
      organisationId: identity.organisationId,
      profilePath: profileDir(p.key),
      registryKey: registryKey(host, p.key),
    };
  } catch (err) {
    const state =
      err instanceof ClerkNotConfiguredError
        ? 'CLERK_NOT_CONFIGURED'
        : err instanceof SessionExpiredError
          ? 'EXPIRED'
          : 'INVALID';
    markSessionState(host, p.key, state, err.message);
    return {
      persona: p.key,
      state,
      host,
      detail: err.message,
      profilePath: profileDir(p.key),
      renew:
        state === 'EXPIRED'
          ? `FORGENIQ_AUTH_BASE=${origin} node scripts/uat/staging-user-sessions.mjs login ${p.key}`
          : undefined,
    };
  } finally {
    await context.close();
  }
}

/**
 * Fail fast when personas are not ready. Preserves valid sessions; prints renew commands only when needed.
 */
export async function ensureUatPersonas(keys, { label = 'UAT', allowProgrammatic = true } = {}) {
  loadUatAgentEnv();
  const rows = [];
  for (const key of keys) {
    let row = await probePersonaSession(key);
    if (row.state === 'VALID') {
      rows.push(row);
      continue;
    }
    if (row.state === 'CLERK_NOT_CONFIGURED' || row.state === 'HOST_UNREACHABLE') {
      rows.push(row);
      continue;
    }
    if (allowProgrammatic && (row.state === 'EXPIRED' || row.state === 'NO SESSION' || row.state === 'INVALID')) {
      const { programmaticSignInPersona, canProgrammaticSignIn, programmaticSignInBlocker, ProgrammaticSignInBlockedError, MfaRequiredError } =
        await import('./uat-clerk-programmatic-signin.mjs');
      if (canProgrammaticSignIn(key)) {
        try {
          await programmaticSignInPersona(key, { headless: true });
          row = await probePersonaSession(key);
        } catch (err) {
          row = {
            persona: key,
            state: err instanceof MfaRequiredError ? 'MFA_REQUIRED' : err instanceof ProgrammaticSignInBlockedError ? 'AUTO_SIGNIN_BLOCKED' : 'INVALID',
            detail: err.message,
            fix:
              err instanceof MfaRequiredError
                ? 'Disable MFA for UAT test users or use Clerk sign-in tokens with MFA bypass policy.'
                : err instanceof ProgrammaticSignInBlockedError
                  ? err.message
                  : programmaticSignInBlocker(),
          };
        }
      } else if (process.env.FORGENIQ_UAT_ALLOW_INTERACTIVE_LOGIN === '1' || process.argv.includes('--interactive')) {
        await login(key, { fresh: false, forceInteractive: true });
        row = await probePersonaSession(key);
      } else {
        row = {
          ...row,
          state: row.state === 'NO SESSION' ? 'NO SESSION' : row.state,
          fix: programmaticSignInBlocker(),
          renew: undefined,
        };
      }
    }
    rows.push(row);
  }
  return rows;
}

export async function requireUatPersonas(keys, { label = 'UAT' } = {}) {
  const rows = await ensureUatPersonas(keys, { label });
  const bad = rows.filter((r) => r.state !== 'VALID');
  if (bad.length) {
    console.error(`\n${label} blocked — session preflight failed:\n`);
    console.table(rows);
    for (const b of bad) {
      if (b.fix) console.error(`  FIX: ${b.fix}`);
      if (b.renew) console.error(`  ${b.renew}`);
    }
    const err = new Error('uat_personas_not_ready');
    err.personas = rows;
    if (bad.some((b) => b.state === 'CLERK_NOT_CONFIGURED' || b.state === 'HOST_UNREACHABLE')) {
      err.code = 'clerk_or_host';
    } else if (bad.some((b) => b.state === 'MFA_REQUIRED')) {
      err.code = 'mfa_required';
    } else if (bad.some((b) => b.state === 'AUTO_SIGNIN_BLOCKED' || b.state === 'NO SESSION')) {
      err.code = 'auto_signin_blocked';
    }
    throw err;
  }
  console.log(`${label} preflight OK — ${keys.join(', ')}`);
  return rows;
}

/**
 * Opens one persona's session (only one at a time, so actions cannot be attributed to the wrong user),
 * verifies identity, and passes an `act(label, fn)` helper that re-verifies identity before every action.
 */
export async function runAs(key, fn, { headless = true } = {}) {
  const p = persona(key);
  if (activePersona) throw new Error(`session for ${activePersona} is still open; close it before switching to ${p.key}`);
  activePersona = p.key;
  const { context, page } = await launch(p.key, { headless });
  try {
    const identity = await verifyIdentity(page, p.key);
    attribute({ persona: p.key, userId: identity.userId, organisationId: identity.organisationId, role: identity.role, action: 'session_verified' });
    const act = async (label, action) => {
      const verified = await verifyIdentity(page, p.key);
      attribute({ persona: p.key, userId: verified.userId, organisationId: verified.organisationId, role: verified.role, action: label });
      return action();
    };
    return await fn({ page, context, identity, act });
  } finally {
    await context.close();
    activePersona = null;
  }
}

function signInLanding() {
  return `${activeOrigin()}/sign-in`;
}
function designLabDashboard() {
  return `${designLabUrl()}#/dashboard`;
}

function signInUrl() {
  const redirect = encodeURIComponent(designLabDashboard());
  return `${signInLanding()}?redirect_url=${redirect}`;
}

async function openSignInPage(page, label) {
  const target = signInUrl();
  console.log(`${label}: loading ${target}`);
  const response = await page.goto(target, { waitUntil: 'load', timeout: 120_000 });
  const status = response?.status() ?? null;
  const finalUrl = page.url();
  console.log(`${label}: document ${status ?? '—'} at ${finalUrl}`);
  if (!onOrigin(finalUrl, activeOrigin()) || !finalUrl.includes('/sign-in')) {
    throw new Error(`${label}: expected staging sign-in, got ${finalUrl}`);
  }
  if (status != null && status >= 400) {
    throw new Error(`${label}: sign-in HTTP ${status}`);
  }
  const html = await page.content().catch(() => '');
  if (/Clerk is not configured/i.test(html)) {
    throw new ClerkNotConfiguredError(`${label}: Clerk is not configured on this host (deployment/env).`);
  }
  await page.waitForFunction(() => typeof window.Clerk !== 'undefined', { timeout: 90_000 }).catch(() => {
    throw new ClerkNotConfiguredError(`${label}: Clerk did not initialise — treat as host configuration, not session expiry.`);
  });
  console.log(`${label}: Clerk ready — complete sign-in in this window (do not close the browser).`);
}

async function login(key, { fresh = false, forceInteractive = false } = {}) {
  const p = persona(key);
  await assertClerkReadyForLogin(activeOrigin(), p.label);
  if (!forceInteractive && existsSync(profileDir(p.key))) {
    const probe = await probePersonaSession(p.key);
    if (probe.state === 'VALID') {
      console.log(`${p.label}: reusing saved profile on ${probe.host} (${probe.userId} · ${probe.role})`);
      return { userId: probe.userId, role: probe.role, organisationId: probe.organisationId };
    }
    if (probe.state === 'CLERK_NOT_CONFIGURED' || probe.state === 'HOST_UNREACHABLE') {
      throw new ClerkNotConfiguredError(probe.detail || probe.state);
    }
    if (probe.state === 'INVALID') {
      console.warn(`${p.label}: profile present but invalid — attempting interactive login (${probe.detail || 'unknown'})`);
    }
  }
  const { context, page } = await launch(p.key, { headless: false, fresh });
  try {
    await openSignInPage(page, `${p.label} (${p.userId})`);
    const waitMin = Math.round(LOGIN_WAIT_MS / 60_000);
    console.log(`${p.label}: waiting up to ${waitMin} minutes for successful session (FORGENIQ_UAT_LOGIN_WAIT_MS)…`);
    const deadline = Date.now() + LOGIN_WAIT_MS;
    while (Date.now() < deadline) {
      try {
        await page.waitForTimeout(3000);
      } catch (err) {
        if (String(err.message || err).includes('closed')) {
          throw new SessionExpiredError(`${p.label}: browser closed before sign-in completed`);
        }
        throw err;
      }
      if (!onOrigin(page.url()) || page.url().includes('/sign-in')) continue;
      const clerkUserId = await page.evaluate(() => window.Clerk?.user?.id ?? null).catch(() => null);
      if (!clerkUserId) continue;
      if (clerkUserId !== p.userId) {
        await page.evaluate(() => window.Clerk?.signOut?.());
        throw new IdentityMismatchError(`${p.label}: signed in as ${clerkUserId}, not ${p.userId}; that session was signed out and not kept`);
      }
      const id = await readIdentity(page).catch(() => null);
      if (!id?.ok) continue;
      const identity = await verifyIdentity(page, p.key);
      attribute({ persona: p.key, userId: identity.userId, organisationId: identity.organisationId, role: identity.role, action: 'session_established' });
      console.log(`${p.label}: session saved — ${identity.userId} · ${identity.organisationName} · ${identity.role} · capabilities ${identity.capabilities.join(', ')}`);
      return identity;
    }
    throw new SessionExpiredError(`${p.label}: sign-in not completed within 10 minutes`);
  } finally {
    await context.close();
  }
}

function lastSessionEstablished(key) {
  if (!existsSync(ATTRIBUTION_LOG)) return null;
  try {
    const lines = readFileSync(ATTRIBUTION_LOG, 'utf8').trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const row = JSON.parse(lines[i]);
      if (row.persona === key && row.action === 'session_established') return row.at;
    }
  } catch {
    return null;
  }
  return null;
}

async function inspect(key) {
  const p = persona(key);
  if (!existsSync(profileDir(p.key))) {
    console.log(JSON.stringify({ persona: p.key, profile: 'missing', lastEstablished: lastSessionEstablished(p.key) }));
    return;
  }
  const { context, page } = await launch(p.key, { headless: true });
  try {
    await page.goto(designLabDashboard(), { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => null);
    const id = await readIdentity(page);
    console.log(
      JSON.stringify(
        {
          persona: p.key,
          profileDir: profileDir(p.key),
          pageUrl: page.url(),
          lastEstablished: lastSessionEstablished(p.key),
          sessionApi: { status: id.status, ok: id.ok, clientUserId: id.clientUserId, userId: id.userId, role: id.role },
          diagnosis:
            id.status === 401
              ? 'Clerk browser session cookie expired or missing — interactive login required (cannot be refreshed without Clerk).'
              : id.ok
                ? 'VALID'
                : 'INVALID',
        },
        null,
        2,
      ),
    );
  } finally {
    await context.close();
  }
}

async function status() {
  const rows = [];
  for (const key of Object.keys(PERSONAS)) {
    const established = lastSessionEstablished(key);
    if (!existsSync(profileDir(key))) {
      rows.push({ persona: key, state: 'NO SESSION', lastEstablished: established });
      continue;
    }
    try {
      const identity = await runAs(key, async ({ identity: i }) => i);
      rows.push({
        persona: key,
        state: 'VALID',
        userId: identity.userId,
        organisation: identity.organisationName,
        role: identity.role,
        lastEstablished: established,
      });
    } catch (err) {
      rows.push({
        persona: key,
        state: err instanceof SessionExpiredError ? 'EXPIRED' : 'INVALID',
        lastEstablished: established,
        detail: err.message,
      });
    }
  }
  console.table(rows);
  return rows;
}

async function logout(key) {
  const p = persona(key);
  if (existsSync(profileDir(p.key))) {
    const { context, page } = await launch(p.key, { headless: true });
    try {
      await page.goto(`${designLabUrl()}#/dashboard`, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => window.Clerk?.signOut?.()).catch(() => {});
    } finally {
      await context.close();
    }
    rmSync(profileDir(p.key), { recursive: true, force: true });
  }
  attribute({ persona: p.key, userId: p.userId, action: 'session_removed' });
  console.log(`${p.label}: signed out and profile removed`);
}

const isCli = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isCli) {
  const [command, arg] = process.argv.slice(2);
  try {
    if (command === 'login' || command === 'renew') {
      const fresh = process.argv.includes('--fresh');
      if (fresh) console.warn(`--fresh: removing existing profile for ${arg} before login.`);
      for (const key of arg?.toLowerCase() === 'all' ? ['A', 'B', 'C'] : [arg]) {
        await login(key, { fresh, forceInteractive: process.argv.includes('--interactive') });
      }
    } else if (command === 'recover') {
      const { spawnSync: sp } = await import('node:child_process');
      const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
      sp(process.execPath, ['./scripts/uat/uat-session-recover.mjs'], {
        cwd: platformRoot,
        stdio: 'inherit',
        shell: process.platform === 'win32',
      });
    } else if (command === 'inspect') {
      await inspect(arg || 'B');
    } else if (command === 'diagnose') {
      const { context, page } = await launch(arg || 'B', { headless: true });
      try {
        await openSignInPage(page, persona(arg || 'B').label);
        const consoleErrors = [];
        page.on('console', (m) => {
          if (m.type() === 'error') consoleErrors.push(m.text());
        });
        console.log(JSON.stringify({ url: page.url(), title: await page.title(), clerk: await page.evaluate(() => Boolean(window.Clerk)) }));
        if (consoleErrors.length) console.log('console errors:', consoleErrors.slice(0, 8));
      } finally {
        await context.close();
      }
    } else if (command === 'status') {
      await status();
    } else if (command === 'preflight') {
      const keys =
        arg?.toLowerCase() === 'all' || !arg ? ['A', 'B', 'C'] : arg.split(/[, ]+/).map((k) => k.trim().toUpperCase());
      try {
        await requireUatPersonas(keys, { label: 'CLI preflight' });
      } catch {
        process.exitCode = 2;
      }
    } else if (command === 'logout') {
      await logout(arg);
    } else {
      console.log(
        'usage: staging-user-sessions.mjs login|renew <A|B|C|all> [--fresh] [--interactive] | preflight [A,B,C|all] | recover | inspect <B> | diagnose <B> | status | logout <A|B|C|OP1>',
      );
      process.exitCode = 2;
    }
  } catch (err) {
    console.error(`FAIL: ${err.message}`);
    process.exitCode = 1;
  }
}

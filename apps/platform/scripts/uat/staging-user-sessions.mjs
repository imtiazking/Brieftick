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
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

export const STAGING_ORIGIN = 'https://staging-app.forgeniq.com';
export const STAGING_ORGANISATION_ID = 'b8f5e3a1-00ad-4000-8000-000000000001';
const SESSION_ROOT = join(process.env.LOCALAPPDATA || join(process.env.USERPROFILE || '.', 'AppData', 'Local'), 'forgeniq-uat-sessions');
const ATTRIBUTION_LOG = join(SESSION_ROOT, 'attribution.log');
const DESIGN_LAB = `${STAGING_ORIGIN}/design-lab/regulatory-intelligence/index.html`;
const ALLOWED_ROLES = new Set(['OWNER', 'ADMIN', 'COMPLIANCE_MANAGER', 'ANALYST', 'REVIEWER']);

/** Only staging and its authentication providers may be loaded; production FORGENIQ hosts are refused. */
const ALLOWED_HOSTS = [
  /^staging-app\.forgeniq\.com$/,
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
    requiredCapabilities: ['obligations', 'applicabilityWorkflow', 'aiRequest'],
  },
  B: {
    label: 'User B — Reviewer',
    userId: 'user_3Fa9TcFi8izkxHdDP58Qb3UY4mr',
    expectedRole: 'REVIEWER',
    requiredCapabilities: ['aiReview'],
  },
  C: {
    label: 'User C — Approver',
    userId: 'user_3LBBtwYR4mmFisfpzMj3n7DVtVh',
    requiredCapabilities: ['obligationReview', 'applicabilityWorkflow'],
  },
};

export class SessionExpiredError extends Error {}
export class IdentityMismatchError extends Error {}

function persona(key) {
  const p = PERSONAS[String(key).toUpperCase()];
  if (!p) throw new Error(`unknown persona ${key} (expected A, B or C)`);
  return { key: String(key).toUpperCase(), ...p };
}

function profileDir(key) {
  return join(SESSION_ROOT, `persona-${key}`);
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

async function launch(key, { headless }) {
  secureSessionRoot();
  const options = {
    headless,
    viewport: { width: 1360, height: 900 },
    acceptDownloads: false,
  };
  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir(key), { ...options, channel: 'chrome' });
  } catch {
    context = await chromium.launchPersistentContext(profileDir(key), options);
  }
  await context.route('**/*', (route) => (hostAllowed(route.request().url()) ? route.continue() : route.abort('blockedbyclient')));
  const page = context.pages()[0] || (await context.newPage());
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
  if (!page.url().startsWith(STAGING_ORIGIN)) await page.goto(`${DESIGN_LAB}#/dashboard`, { waitUntil: 'domcontentloaded' });
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
    };
  });
}

/** Throws unless the page is signed in as exactly this persona, in the staging UAT organisation, with the persona's capabilities. */
export async function verifyIdentity(page, key) {
  const p = persona(key);
  if (!page.url().startsWith(STAGING_ORIGIN) && page.url() !== 'about:blank') {
    throw new IdentityMismatchError(`${p.label}: page is not on staging (${new URL(page.url()).host})`);
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
  for (const cap of p.requiredCapabilities) if (id.writeCapabilities[cap] !== true) problems.push(`capability ${cap} not granted`);
  if (problems.length) throw new IdentityMismatchError(`${p.label}: ${problems.join('; ')}`);
  return {
    persona: p.key,
    label: p.label,
    userId: id.userId,
    organisationId: id.organisationId,
    organisationName: id.organisationName,
    role: id.role,
    capabilities: p.requiredCapabilities,
  };
}

function attribute(entry) {
  appendFileSync(ATTRIBUTION_LOG, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
}

let activePersona = null;

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

async function login(key) {
  const p = persona(key);
  const { context, page } = await launch(p.key, { headless: false });
  try {
    await page.goto(`${STAGING_ORIGIN}/sign-in?redirect_url=${encodeURIComponent('/design-lab/regulatory-intelligence/index.html#/dashboard')}`);
    console.log(`${p.label}: sign in as ${p.userId} in the Chrome window that has opened (waiting up to 10 minutes)…`);
    const deadline = Date.now() + 10 * 60_000;
    while (Date.now() < deadline) {
      await page.waitForTimeout(3000);
      if (!page.url().startsWith(STAGING_ORIGIN) || page.url().includes('/sign-in')) continue;
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

async function status() {
  const rows = [];
  for (const key of Object.keys(PERSONAS)) {
    if (!existsSync(profileDir(key))) {
      rows.push({ persona: key, state: 'NO SESSION' });
      continue;
    }
    try {
      const identity = await runAs(key, async ({ identity: i }) => i);
      rows.push({ persona: key, state: 'VALID', userId: identity.userId, organisation: identity.organisationName, role: identity.role });
    } catch (err) {
      rows.push({ persona: key, state: err instanceof SessionExpiredError ? 'EXPIRED' : 'INVALID', detail: err.message });
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
      await page.goto(`${DESIGN_LAB}#/dashboard`, { waitUntil: 'domcontentloaded' });
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
    if (command === 'login') {
      for (const key of arg?.toLowerCase() === 'all' ? Object.keys(PERSONAS) : [arg]) await login(key);
    } else if (command === 'status') {
      await status();
    } else if (command === 'logout') {
      await logout(arg);
    } else {
      console.log('usage: staging-user-sessions.mjs login <A|B|C|all> | status | logout <A|B|C>');
      process.exitCode = 2;
    }
  } catch (err) {
    console.error(`FAIL: ${err.message}`);
    process.exitCode = 1;
  }
}

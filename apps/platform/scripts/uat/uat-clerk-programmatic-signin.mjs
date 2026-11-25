/**
 * Headless Clerk session establishment for UAT personas (no cookie export between hosts).
 * Prefers Clerk sign-in tokens (backend API). Falls back to @clerk/testing password flow when configured.
 */
import { createClerkClient } from '@clerk/backend';
import { clerk, clerkSetup, setupClerkTestingToken } from '@clerk/testing/playwright';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { persona, resolveProfileDir, verifyIdentity, launch, ClerkNotConfiguredError, loadUatAgentEnv } from './staging-user-sessions.mjs';
import { authOrigin } from '../staging/staging-release-hosts.mjs';
import { probeClerkOnHost } from './uat-session-registry.mjs';
import { recordSessionValidation } from './uat-session-registry.mjs';

const SESSION_ROOT = join(process.env.LOCALAPPDATA || join(process.env.USERPROFILE || '.', 'AppData', 'Local'), 'forgeniq-uat-sessions');

export class MfaRequiredError extends Error {}
export class ProgrammaticSignInBlockedError extends Error {}

let clerkTestingReady = false;

function clerkSecretKey() {
  return (
    process.env.FORGENIQ_HOSTED_CLERK_SECRET_KEY?.trim() ||
    process.env.CLERK_SECRET_KEY?.trim() ||
    ''
  );
}

function passwordCreds(key) {
  const k = String(key).toUpperCase();
  const email = process.env[`FORGENIQ_UAT_USER_${k}_EMAIL`]?.trim() || persona(k).expectedEmail;
  const password = process.env[`FORGENIQ_UAT_USER_${k}_PASSWORD`]?.trim();
  if (!email || !password) return null;
  return { email, password };
}

export function canProgrammaticSignIn(key) {
  return Boolean(clerkSecretKey()) || Boolean(passwordCreds(key));
}

export function programmaticSignInBlocker() {
  if (clerkSecretKey()) return null;
  const anyPassword = ['A', 'B', 'C'].some((k) => passwordCreds(k));
  if (anyPassword) return null;
  return (
    'No programmatic Clerk credentials. Add FORGENIQ_HOSTED_CLERK_SECRET_KEY (recommended) or FORGENIQ_UAT_USER_*_PASSWORD ' +
    `to ${join(SESSION_ROOT, 'uat-agent.env')} (local only, never commit). Interactive login is disabled by default.`
  );
}

async function ensureClerkTesting() {
  if (clerkTestingReady) return;
  if (!process.env.CLERK_SECRET_KEY && clerkSecretKey()) {
    process.env.CLERK_SECRET_KEY = clerkSecretKey();
  }
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim()) {
    throw new ProgrammaticSignInBlockedError('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY missing for Clerk testing helpers.');
  }
  await clerkSetup();
  clerkTestingReady = true;
}

async function signInWithTicket(page, key, origin) {
  const secret = clerkSecretKey();
  if (!secret) return false;
  const p = persona(key);
  const clerk = createClerkClient({ secretKey: secret });
  if (!clerk.signInTokens?.createSignInToken) {
    throw new ProgrammaticSignInBlockedError('Clerk SDK signInTokens API unavailable.');
  }
  let ticket;
  try {
    ticket = await clerk.signInTokens.createSignInToken({
      userId: p.userId,
      expiresInSeconds: Number(process.env.FORGENIQ_UAT_TICKET_SECONDS || 900),
    });
  } catch (err) {
    const msg = String(err?.message || err);
    if (/not found|404/i.test(msg)) {
      throw new ProgrammaticSignInBlockedError(
        `${p.label}: Clerk user not found for this secret key — use FORGENIQ_HOSTED_CLERK_SECRET_KEY for the same Clerk instance as staging-app (pk_live / ins staging).`,
      );
    }
    throw err;
  }
  const ticketValue = ticket?.token;
  if (!ticketValue) throw new ProgrammaticSignInBlockedError(`Clerk sign-in token empty for ${p.label}`);
  // Always redeem the ticket on the app origin — ticket.url targets accounts.* and often hits bot interstitials in automation.
  const landing = `${origin}/sign-in?__clerk_ticket=${encodeURIComponent(ticketValue)}`;
  await page.goto(landing, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const clerkUserId = await page
    .waitForFunction(() => window.Clerk?.user?.id, null, { timeout: 90_000 })
    .then(() => page.evaluate(() => window.Clerk?.user?.id))
    .catch(() => null);
  if (!clerkUserId) {
    const body = await page.content().catch(() => '');
    if (/multi-factor|two-factor|mfa|verification code/i.test(body)) {
      throw new MfaRequiredError(`${p.label}: MFA challenge required — programmatic sign-in cannot complete without owner-approved test bypass.`);
    }
    return false;
  }
  if (clerkUserId !== p.userId) {
    throw new Error(`${p.label}: ticket signed in as ${clerkUserId}, expected ${p.userId}`);
  }
  return true;
}

async function signInWithPassword(page, key, origin) {
  const creds = passwordCreds(key);
  if (!creds) return false;
  await ensureClerkTesting();
  await page.goto(`${origin}/sign-in`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const html = await page.content().catch(() => '');
  if (/Clerk is not configured/i.test(html)) {
    throw new ClerkNotConfiguredError('Clerk not configured on sign-in page.');
  }
  await setupClerkTestingToken({ page });
  await clerk.signIn({
    page,
    signInParams: { strategy: 'password', identifier: creds.email, password: creds.password },
  });
  const clerkUserId = await page.evaluate(() => window.Clerk?.user?.id ?? null).catch(() => null);
  if (!clerkUserId) return false;
  return clerkUserId === persona(key).userId;
}

/**
 * Establish a session in the persona's host-scoped Playwright profile without deleting existing data.
 */
export async function programmaticSignInPersona(key, { headless = true } = {}) {
  loadUatAgentEnv();
  const origin = authOrigin();
  const clerkProbe = await probeClerkOnHost(origin);
  if (!clerkProbe.ok && clerkProbe.code === 'CLERK_NOT_CONFIGURED') {
    throw new ClerkNotConfiguredError(`Cannot sign in on ${origin} — Clerk not configured on deployment.`);
  }
  if (process.env.FORGENIQ_UAT_CLERK_KEY_MISMATCH) {
    throw new ProgrammaticSignInBlockedError(
      'FORGENIQ_HOSTED_CLERK_SECRET_KEY is sk_test_* but staging hosts use pk_live_* — use the Production Clerk secret from Vercel forgeniq-platform-staging.',
    );
  }
  const blocker = programmaticSignInBlocker();
  if (blocker) throw new ProgrammaticSignInBlockedError(blocker);

  const p = persona(key);
  const { context, page } = await launch(key, { headless, fresh: false });
  try {
    let ok = false;
    if (clerkSecretKey()) ok = await signInWithTicket(page, key, origin);
    if (!ok && passwordCreds(key)) ok = await signInWithPassword(page, key, origin);
    if (!ok) throw new ProgrammaticSignInBlockedError(`${p.label}: programmatic sign-in did not complete.`);
    const identity = await verifyIdentity(page, key);
    recordSessionValidation({
      hostname: new URL(origin).hostname,
      persona: key,
      userId: identity.userId,
      role: identity.role,
      organisationId: identity.organisationId,
      profilePath: resolveProfileDir(key, origin),
      origin,
      method: clerkSecretKey() ? 'clerk_sign_in_token' : 'clerk_testing_password',
    });
    return identity;
  } finally {
    await context.close();
  }
}
import { createClerkClient } from '@clerk/backend';
import { verifyClerkStagingSessionJwt } from './staging-clerk-jwt.mjs';

/** Clerk Production instance for FORGENIQ RI staging verification. */
export const FORGENIQ_RI_STAGING_CLERK_INSTANCE_ID = 'ins_3FZpAYsf8rSBFoViPPgTppkxJYY';

const ROLE_OPERATOR = 'operator';
const ROLE_TENANT = 'tenant';

/**
 * @param {{ secretKey?: string }} [options]
 */
export function createStagingClerkClient(options = {}) {
  const secretKey = options.secretKey?.trim() || process.env.CLERK_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error('clerk_secret_key_missing');
  }
  const clerk = createClerkClient({ secretKey });
  assertClerkSdkResources(clerk);
  return clerk;
}

/**
 * Fail-closed when the installed Clerk Backend SDK does not expose required APIs.
 *
 * @param {import('@clerk/backend').ClerkClient} clerk
 */
export function assertClerkSdkResources(clerk) {
  if (!clerk || typeof clerk !== 'object') {
    throw new Error('CLERK_SDK_CLIENT_UNAVAILABLE');
  }
  const instanceApi = clerk.instance;
  if (!instanceApi || typeof instanceApi.get !== 'function') {
    throw new Error('CLERK_SDK_INSTANCE_METHOD_UNAVAILABLE');
  }
  const sessionsApi = clerk.sessions;
  if (!sessionsApi || typeof sessionsApi.getSession !== 'function') {
    throw new Error('CLERK_SDK_SESSIONS_GET_SESSION_UNAVAILABLE');
  }
  if (typeof sessionsApi.getToken !== 'function') {
    throw new Error('CLERK_SDK_SESSIONS_GET_TOKEN_UNAVAILABLE');
  }
}

/**
 * @param {string} [override]
 */
export function expectedStagingClerkInstanceId(override) {
  const fromEnv = process.env.STAGING_CLERK_INSTANCE_ID?.trim();
  return override?.trim() || fromEnv || FORGENIQ_RI_STAGING_CLERK_INSTANCE_ID;
}

/**
 * @param {{ id: string }} instance
 * @param {string} [expectedId]
 */
export function assertStagingClerkInstanceId(instance, expectedId) {
  const expected = expectedStagingClerkInstanceId(expectedId);
  if (!instance?.id || instance.id !== expected) {
    throw new Error('staging_clerk_instance_mismatch');
  }
}

/**
 * @param {import('@clerk/backend').ClerkClient} clerk
 * @param {string} [expectedId]
 */
export async function assertStagingClerkInstance(clerk, expectedId) {
  assertClerkSdkResources(clerk);
  let instance;
  try {
    instance = await clerk.instance.get();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('401') || message.toLowerCase().includes('unauthorized')) {
      throw new Error('CLERK_SDK_INSTANCE_AUTH_FAILED');
    }
    throw new Error('CLERK_SDK_INSTANCE_FETCH_FAILED');
  }
  assertStagingClerkInstanceId(instance, expectedId);
  return instance;
}

/**
 * @param {{ status: string, expireAt?: number, userId?: string }} session
 * @param {'operator' | 'tenant'} roleLabel
 */
export function assertStagingSessionActive(session, roleLabel) {
  if (!session) {
    throw new Error(`staging_clerk_session_not_found:${roleLabel}`);
  }
  if (session.status !== 'active') {
    throw new Error(`staging_clerk_session_not_active:${roleLabel}`);
  }
  const nowMs = Date.now();
  if (typeof session.expireAt === 'number' && session.expireAt <= nowMs) {
    throw new Error(`staging_clerk_session_expired:${roleLabel}`);
  }
  if (!session.userId?.trim()) {
    throw new Error(`staging_clerk_session_missing_user:${roleLabel}`);
  }
}

/**
 * @param {string} operatorUserId
 * @param {string} tenantUserId
 * @param {string} [operatorSub]
 * @param {string} [tenantSub]
 */
export function assertDistinctStagingUsers(operatorUserId, tenantUserId, operatorSub, tenantSub) {
  if (operatorUserId === tenantUserId) {
    throw new Error('staging_clerk_operator_tenant_same_user');
  }
  if (operatorSub && tenantSub && operatorSub === tenantSub) {
    throw new Error('staging_clerk_operator_tenant_same_sub');
  }
}

/**
 * Mint a verified JWT for a staging Clerk session (never log return value).
 *
 * @param {import('@clerk/backend').ClerkClient} clerk
 * @param {string} sessionId
 * @param {'operator' | 'tenant'} roleLabel
 */
/**
 * @param {{ verifyJwt?: (jwt: string) => Promise<{ sub: string }> }} [deps]
 */
export async function mintVerifiedStagingSessionJwt(clerk, sessionId, roleLabel, deps = {}) {
  const verifyJwt = deps.verifyJwt ?? verifyClerkStagingSessionJwt;
  const id = sessionId?.trim();
  if (!id) {
    throw new Error(`staging_clerk_session_id_missing:${roleLabel}`);
  }

  assertClerkSdkResources(clerk);

  let session;
  try {
    session = await clerk.sessions.getSession(id);
  } catch {
    throw new Error(`staging_clerk_session_fetch_failed:${roleLabel}`);
  }
  assertStagingSessionActive(session, roleLabel);

  const template = process.env.STAGING_CLERK_JWT_TEMPLATE?.trim();
  let token;
  try {
    token = template
      ? await clerk.sessions.getToken(id, template)
      : await clerk.sessions.getToken(id);
  } catch {
    throw new Error(`staging_clerk_token_mint_failed:${roleLabel}`);
  }

  const jwt = token?.jwt?.trim();
  if (!jwt) {
    throw new Error(`staging_clerk_token_empty:${roleLabel}`);
  }

  const claims = await verifyJwt(jwt);
  if (claims.sub !== session.userId) {
    throw new Error(`staging_clerk_session_user_mismatch:${roleLabel}`);
  }

  return { jwt, claims, userId: session.userId, sessionStatus: session.status };
}

/**
 * @param {import('pg').Client} client
 * @param {string} operatorSub
 * @param {string} tenantSub
 */
export async function verifyStagingDatabaseMemberships(client, operatorSub, tenantSub) {
  const opRow = await client.query(
    `select exists (
        select 1 from platform_operators where clerk_user_id = $1 and status = 'active'
      ) as ok`,
    [operatorSub],
  );
  const tenantRow = await client.query(
    `select exists (
        select 1 from organisation_memberships m
        where m.clerk_user_id = $1 and m.status = 'active'
          and not exists (
            select 1 from platform_operators p
            where p.clerk_user_id = m.clerk_user_id and p.status = 'active'
          )
      ) as ok`,
    [tenantSub],
  );
  if (opRow.rows[0]?.ok !== true) {
    throw new Error('not_active_platform_operator');
  }
  if (tenantRow.rows[0]?.ok !== true) {
    throw new Error('not_active_non_operator_member');
  }
}

/**
 * Fresh operator + tenant JWTs immediately before auth / RLS probes.
 *
 * @param {{ clerk?: import('@clerk/backend').ClerkClient }} [options]
 */
export async function resolveStagingSessionCredentialPair(options = {}) {
  const operatorSessionId = process.env.STAGING_OPERATOR_SESSION_ID?.trim();
  const tenantSessionId = process.env.STAGING_TENANT_SESSION_ID?.trim();
  if (!operatorSessionId || !tenantSessionId) {
    throw new Error('staging_clerk_session_ids_missing');
  }

  const clerk = options.clerk ?? createStagingClerkClient();
  await assertStagingClerkInstance(clerk);

  const operator = await mintVerifiedStagingSessionJwt(clerk, operatorSessionId, ROLE_OPERATOR);
  const tenant = await mintVerifiedStagingSessionJwt(clerk, tenantSessionId, ROLE_TENANT);

  assertDistinctStagingUsers(operator.userId, tenant.userId, operator.claims.sub, tenant.claims.sub);

  return {
    operatorJwt: operator.jwt,
    tenantJwt: tenant.jwt,
    operatorClaims: operator.claims,
    tenantClaims: tenant.claims,
  };
}

/**
 * Mint JWT for an active production Clerk session belonging to userId.
 *
 * @param {import('@clerk/backend').ClerkClient} clerk
 * @param {string} userId
 * @param {'operator' | 'tenant'} roleLabel
 */
export async function mintStagingSessionJwtForUser(clerk, userId, roleLabel) {
  const uid = userId?.trim();
  if (!uid) throw new Error(`staging_clerk_user_id_missing:${roleLabel}`);
  assertClerkSdkResources(clerk);
  await assertStagingClerkInstance(clerk);

  const list = await clerk.sessions.getSessionList({ userId: uid, status: 'active', limit: 1 });
  const session = list.data?.[0];
  if (!session?.id) {
    throw new Error(`no_active_clerk_session:${uid}`);
  }
  const minted = await mintVerifiedStagingSessionJwt(clerk, session.id, roleLabel);
  return { jwt: minted.jwt, sessionId: session.id, userId: minted.userId };
}

/**
 * Probe hosted organisation + RI lab session using a minted Clerk JWT (no JWT logged).
 */
export async function probeHostedOrganisationAndSession({ baseUrl, jwt, organisationId }) {
  const base = baseUrl.replace(/\/$/, '');
  const orgRes = await fetch(`${base}/api/organisation/active`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ organisationId }),
  });
  const orgBody = await orgRes.json().catch(() => ({}));
  const setCookie = orgRes.headers.get('set-cookie') || '';
  const m = setCookie.match(/forgeniq_active_org=([^;]+)/);
  const orgCookie = m?.[1] || organisationId;

  const sessionRes = await fetch(`${base}/api/ri-lab/session`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${jwt}`,
      Cookie: `forgeniq_active_org=${orgCookie}`,
    },
  });
  const sessionBody = await sessionRes.json().catch(() => ({}));

  return {
    orgPostStatus: orgRes.status,
    orgPostOk: orgBody?.ok !== false,
    riLabSessionStatus: sessionRes.status,
    riLabSessionOk: sessionRes.status === 200 && sessionBody?.ok === true,
    riLabSessionUserId: sessionBody?.userId ?? null,
    riLabSessionRole: sessionBody?.role ?? null,
    riLabSessionOrganisationId: sessionBody?.organisationId ?? null,
    riLabSessionError: sessionBody?.error ?? null,
    riLabSessionReason: sessionBody?.reason ?? null,
  };
}

import { verifyToken } from '@clerk/backend';

/**
 * Verify Clerk session JWT (signature, expiry, issuer) for staging readiness.
 * Does not log token or secret material.
 *
 * @param {string} token
 * @returns {Promise<{ sub: string, iss?: string, exp?: number, role?: string }>}
 */
export async function verifyClerkStagingSessionJwt(token) {
  const secretKey = process.env.CLERK_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error('clerk_secret_key_missing');
  }

  const raw = token?.trim();
  if (!raw) {
    throw new Error('clerk_jwt_missing');
  }

  const payload = await verifyToken(raw, {
    secretKey,
    authorizedParties: process.env.CLERK_AUTHORIZED_PARTIES
      ? process.env.CLERK_AUTHORIZED_PARTIES.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined,
  });

  if (!payload?.sub) {
    throw new Error('clerk_jwt_invalid_sub');
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp <= now) {
    throw new Error('clerk_jwt_expired');
  }

  const expectedIssuer = process.env.CLERK_JWT_ISSUER?.trim();
  if (expectedIssuer && payload.iss && payload.iss !== expectedIssuer) {
    throw new Error('clerk_jwt_issuer_mismatch');
  }

  const role =
    typeof payload.role === 'string'
      ? payload.role
      : typeof payload?.public_metadata?.role === 'string'
        ? payload.public_metadata.role
        : undefined;

  if (role && role !== 'authenticated') {
    throw new Error('clerk_jwt_role_not_authenticated');
  }

  return {
    sub: payload.sub,
    iss: payload.iss,
    exp: payload.exp,
    role: role || 'authenticated',
  };
}

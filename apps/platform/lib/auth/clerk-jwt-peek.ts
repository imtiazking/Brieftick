import 'server-only';

/** Decode JWT payload for staging diagnostics only — no signature verification. */
export function peekClerkJwtClaims(token: string | null | undefined): {
  sub: string | null;
  iss: string | null;
  role: string | null;
  aud: string | string[] | null;
} | null {
  if (!token?.trim()) return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(json) as Record<string, unknown>;
    return {
      sub: typeof payload.sub === 'string' ? payload.sub : null,
      iss: typeof payload.iss === 'string' ? payload.iss : null,
      role: typeof payload.role === 'string' ? payload.role : null,
      aud: (payload.aud as string | string[] | null) ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Platform navigation defaults — Design Lab is the connected RI UAT surface;
 * `/ri` remains the alternate Next.js shell (not the default post-auth destination).
 */

/** Lab router defaults empty hash to #/dashboard (see design-lab app.js getRoute). */
export const REGULATORY_INTELLIGENCE_DESIGN_LAB_ENTRY =
  '/design-lab/regulatory-intelligence/index.html#/dashboard';

/** Same entry without hash fragment (Clerk redirect URLs must be path-only). */
export const REGULATORY_INTELLIGENCE_DESIGN_LAB_PATH = '/design-lab/regulatory-intelligence/';

const LEGACY_RI_ROOT = /^\/ri\/?$/i;

/**
 * Resolves Clerk fallback redirect after sign-in/up.
 * Preserves explicit env deep links (e.g. `/`, `/ri/changes/…`); remaps legacy `/ri` root.
 */
export function resolveClerkAfterAuthRedirectUrl(envValue: string | undefined): string {
  const trimmed = envValue?.trim();
  if (!trimmed || LEGACY_RI_ROOT.test(trimmed)) {
    return REGULATORY_INTELLIGENCE_DESIGN_LAB_PATH;
  }
  return trimmed;
}

export function resolveClerkAfterSignInUrl(): string {
  return resolveClerkAfterAuthRedirectUrl(process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL);
}

export function resolveClerkAfterSignUpUrl(): string {
  return resolveClerkAfterAuthRedirectUrl(process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL);
}

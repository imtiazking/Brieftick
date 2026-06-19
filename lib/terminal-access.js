/**
 * Terminal / admin access — single source for entitlement checks.
 * @module lib/terminal-access
 */

/**
 * @param {unknown} role
 */
export function normalizeRole(role) {
  return String(role ?? "").trim().toLowerCase();
}

/**
 * @param {unknown} role
 */
export function isAdminRole(role) {
  const r = normalizeRole(role);
  return r === "admin" || r === "administrator";
}

/**
 * @param {import('@clerk/types').UserResource | { publicMetadata?: Record<string, unknown> } | null | undefined} user
 */
export function isAdminFromUser(user) {
  if (!user) return false;
  return isAdminRole(user.publicMetadata?.role);
}

/**
 * @param {import('@clerk/types').UserResource | { publicMetadata?: Record<string, unknown> } | null | undefined} user
 */
export function getAccessEntitlements(user) {
  const role = user?.publicMetadata?.role ?? null;
  const subscription = user?.publicMetadata?.subscription ?? null;
  return {
    role,
    subscription,
    normalizedRole: normalizeRole(role),
    normalizedSubscription: normalizeRole(subscription),
    isAdmin: isAdminRole(role),
    hasTerminalSubscription: normalizeRole(subscription) === "terminal",
  };
}

/**
 * Full Terminal access: active Terminal subscription OR admin role.
 * Checks Clerk user metadata directly so admins are not blocked before `_isTerminal` syncs.
 */
export function hasTerminalAccess() {
  if (typeof window !== "undefined" && window._isTerminal === true) return true;

  const user =
    (typeof window !== "undefined" && (window.Clerk?.user || window._clerkUser)) ||
    null;
  const ent = getAccessEntitlements(user);
  if (ent.isAdmin || ent.hasTerminalSubscription) return true;

  return false;
}

/** Console diagnostics for gating bugs (Discover Stocks, overlays, etc.). */
export function logTerminalAccessState() {
  if (typeof window === "undefined") return;
  const user = window.Clerk?.user || window._clerkUser || null;
  const entitlements = getAccessEntitlements(user);
  const payload = {
    isAdmin: entitlements.isAdmin,
    hasTerminalAccess: hasTerminalAccess(),
    _isTerminal: window._isTerminal,
    currentUser: user
      ? {
          id: user.id,
          email:
            user.primaryEmailAddress?.emailAddress ||
            user.emailAddresses?.[0]?.emailAddress ||
            null,
        }
      : null,
    entitlements,
  };
  console.info("[FORGENIQ access]", payload);
  return payload;
}

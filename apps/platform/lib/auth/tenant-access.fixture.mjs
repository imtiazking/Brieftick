/**
 * TEST FIXTURE — deterministic tenant logic for offline acceptance (not production data).
 */

const ROLE_RANK = {
  OWNER: 60,
  ADMIN: 50,
  COMPLIANCE_MANAGER: 40,
  ANALYST: 30,
  REVIEWER: 20,
  VIEWER: 10,
};

function roleAtLeast(role, minimum) {
  return (ROLE_RANK[role] ?? 0) >= (ROLE_RANK[minimum] ?? 0);
}

function filterActive(memberships, clerkUserId) {
  return memberships.filter((m) => m.clerkUserId === clerkUserId && m.status === 'active');
}

export function userCanAccessOrganisation(memberships, clerkUserId, organisationId) {
  return filterActive(memberships, clerkUserId).some((m) => m.organisationId === organisationId);
}

export function resolveActiveOrganisation(memberships, clerkUserId, requestedOrganisationId) {
  const active = filterActive(memberships, clerkUserId);
  if (active.length === 0) return { organisationId: null };
  if (requestedOrganisationId) {
    const match = active.find((m) => m.organisationId === requestedOrganisationId);
    if (!match) return { organisationId: null };
    return { organisationId: match.organisationId };
  }
  if (active.length === 1) return { organisationId: active[0].organisationId };
  return { organisationId: null };
}

export function effectiveRole(serverRole, _clientClaimedRole) {
  return serverRole;
}

export function mayHoldOwnerRole(actorRole, targetRole) {
  if (targetRole !== 'OWNER') return true;
  return actorRole === 'OWNER';
}

export function validateRoleAssignment(actorRole, targetRole) {
  if (targetRole === 'OWNER') return actorRole === 'OWNER';
  return roleAtLeast(actorRole, 'ADMIN');
}

export function parseClientRoleClaim(claim) {
  if (!claim || !ROLE_RANK[claim]) return null;
  return claim;
}

import type { PlatformRole } from '@/lib/roles';
import { canAssignRole, isPlatformRole, roleAtLeast } from '@/lib/roles';

export type MembershipRecord = {
  organisationId: string;
  clerkUserId: string;
  role: PlatformRole;
  status: 'active' | 'invited' | 'removed';
};

export function filterActiveMemberships(
  memberships: MembershipRecord[],
  clerkUserId: string,
): MembershipRecord[] {
  return memberships.filter((m) => m.clerkUserId === clerkUserId && m.status === 'active');
}

/** Reject browser-supplied organisation id without membership proof. */
export function resolveActiveOrganisation(
  memberships: MembershipRecord[],
  clerkUserId: string,
  requestedOrganisationId: string | null | undefined,
): { organisationId: string | null; reason?: string } {
  const active = filterActiveMemberships(memberships, clerkUserId);
  if (active.length === 0) {
    return { organisationId: null, reason: 'no_memberships' };
  }

  if (requestedOrganisationId) {
    const match = active.find((m) => m.organisationId === requestedOrganisationId);
    if (!match) {
      return { organisationId: null, reason: 'organisation_not_member' };
    }
    return { organisationId: match.organisationId };
  }

  if (active.length === 1) {
    return { organisationId: active[0].organisationId };
  }

  return { organisationId: null, reason: 'organisation_selection_required' };
}

export function userCanAccessOrganisation(
  memberships: MembershipRecord[],
  clerkUserId: string,
  organisationId: string,
): boolean {
  return filterActiveMemberships(memberships, clerkUserId).some(
    (m) => m.organisationId === organisationId,
  );
}

export function membershipRoleForOrganisation(
  memberships: MembershipRecord[],
  clerkUserId: string,
  organisationId: string,
): PlatformRole | null {
  const row = filterActiveMemberships(memberships, clerkUserId).find(
    (m) => m.organisationId === organisationId,
  );
  return row?.role ?? null;
}

/** Server role wins — never trust client-provided role labels. */
export function effectiveRole(
  serverRole: PlatformRole | null,
  _clientClaimedRole: string | null | undefined,
): PlatformRole | null {
  return serverRole;
}

export function assertPrivilegedAction(actorRole: PlatformRole, minimum: PlatformRole): boolean {
  return roleAtLeast(actorRole, minimum);
}

export function mayHoldOwnerRole(actorRole: PlatformRole, targetRole: PlatformRole): boolean {
  if (targetRole !== 'OWNER') return true;
  return actorRole === 'OWNER';
}

export function validateRoleAssignment(actorRole: PlatformRole, targetRole: PlatformRole): boolean {
  return canAssignRole(actorRole, targetRole);
}

export function parseClientRoleClaim(claim: string | null | undefined): PlatformRole | null {
  if (!claim || !isPlatformRole(claim)) return null;
  return claim;
}

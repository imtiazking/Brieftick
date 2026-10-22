import 'server-only';

import type { PlatformRole } from '@/lib/roles';
import { roleAtLeast } from '@/lib/roles';
import {
  getActiveOrganisation,
  pickActiveOrganisation,
  readActiveOrganisationIdFromCookie,
} from '@/lib/auth/active-organisation';
import {
  getMembershipsForClerkUser,
  getMembershipsForCurrentUser,
  getOrganisationNames,
} from '@/lib/auth/memberships';
import { membershipRoleForOrganisation, userCanAccessOrganisation } from '@/lib/auth/tenant-access';
import { getOptionalUser, requireUser } from '@/lib/auth/session';

export class OrganisationAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrganisationAccessError';
  }
}

export async function requireOrganisation(): Promise<{
  organisationId: string;
  organisationName: string | null;
  role: PlatformRole | null;
}> {
  const { userId } = await requireUser();
  const memberships = await getMembershipsForCurrentUser();
  const cookieOrg = await readActiveOrganisationIdFromCookie();
  const picked = pickActiveOrganisation(memberships, userId, cookieOrg);

  if (!picked.organisationId) {
    throw new OrganisationAccessError(picked.reason ?? 'organisation_required');
  }

  const names = await getOrganisationNames([picked.organisationId]);
  const role = membershipRoleForOrganisation(memberships, userId, picked.organisationId);

  return {
    organisationId: picked.organisationId,
    organisationName: names.get(picked.organisationId) ?? null,
    role,
  };
}

export async function requireRole(minimum: PlatformRole): Promise<{
  organisationId: string;
  role: PlatformRole;
}> {
  const ctx = await requireOrganisation();
  if (!ctx.role || !roleAtLeast(ctx.role, minimum)) {
    throw new OrganisationAccessError('insufficient_role');
  }
  return { organisationId: ctx.organisationId, role: ctx.role };
}

export async function validateOrganisationIdForUser(
  organisationId: string,
): Promise<void> {
  const { userId } = await requireUser();
  const memberships = await getMembershipsForCurrentUser();
  if (!userCanAccessOrganisation(memberships, userId, organisationId)) {
    throw new OrganisationAccessError('organisation_not_member');
  }
}

export async function loadOrganisationShellContext() {
  const user = await getOptionalUser();
  if (!user) {
    return { active: null, selectionRequired: false };
  }

  const memberships = await getMembershipsForClerkUser(user.userId);
  const names = await getOrganisationNames(memberships.map((m) => m.organisationId));
  const active = await getActiveOrganisation(memberships, names);
  const cookieOrg = await readActiveOrganisationIdFromCookie();
  const picked = pickActiveOrganisation(memberships, user.userId, cookieOrg);

  return {
    active,
    selectionRequired: picked.selectionRequired,
  };
}

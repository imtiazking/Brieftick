import 'server-only';

import { cookies } from 'next/headers';
import type { PlatformRole } from '@/lib/roles';
import {
  membershipRoleForOrganisation,
  resolveActiveOrganisation,
  type MembershipRecord,
} from '@/lib/auth/tenant-access';
import { getOptionalUser } from '@/lib/auth/session';

export const ACTIVE_ORG_COOKIE = 'forgeniq_active_org';

export type ActiveOrganisationContext = {
  organisationId: string;
  organisationName: string | null;
  role: PlatformRole | null;
};

export async function readActiveOrganisationIdFromCookie(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(ACTIVE_ORG_COOKIE)?.value?.trim();
  if (!value || !/^[0-9a-f-]{36}$/i.test(value)) {
    return null;
  }
  return value;
}

export function pickActiveOrganisation(
  memberships: MembershipRecord[],
  clerkUserId: string,
  cookieOrganisationId: string | null,
): {
  organisationId: string | null;
  selectionRequired: boolean;
  reason?: string;
} {
  const resolved = resolveActiveOrganisation(memberships, clerkUserId, cookieOrganisationId);
  return {
    organisationId: resolved.organisationId,
    selectionRequired: resolved.reason === 'organisation_selection_required',
    reason: resolved.reason,
  };
}

export async function getActiveOrganisation(
  memberships: MembershipRecord[],
  organisationNames: Map<string, string>,
): Promise<ActiveOrganisationContext | null> {
  const user = await getOptionalUser();
  if (!user) return null;

  const cookieOrg = await readActiveOrganisationIdFromCookie();
  const picked = pickActiveOrganisation(memberships, user.userId, cookieOrg);
  if (!picked.organisationId) return null;

  const role = membershipRoleForOrganisation(memberships, user.userId, picked.organisationId);
  return {
    organisationId: picked.organisationId,
    organisationName: organisationNames.get(picked.organisationId) ?? null,
    role,
  };
}

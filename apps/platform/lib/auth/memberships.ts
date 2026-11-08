import 'server-only';

import { queryMembershipsForClerkUser } from '@/lib/auth/membership-query';
import type { MembershipRecord } from '@/lib/auth/tenant-access';
import { requireUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function getMembershipsForClerkUser(userId: string): Promise<MembershipRecord[]> {
  const result = await queryMembershipsForClerkUser(userId);
  if (!result.ok) {
    return [];
  }
  return result.memberships;
}

export async function getMembershipsForCurrentUser(): Promise<MembershipRecord[]> {
  const { userId } = await requireUser();
  return getMembershipsForClerkUser(userId);
}

export async function getOrganisationNames(
  organisationIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (organisationIds.length === 0) return map;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return map;

  const { data } = await supabase
    .from('organisations')
    .select('id, name')
    .in('id', organisationIds);

  for (const row of data ?? []) {
    map.set(row.id as string, row.name as string);
  }
  return map;
}

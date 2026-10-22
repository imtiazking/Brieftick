import 'server-only';

import { isPlatformRole } from '@/lib/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { MembershipRecord } from '@/lib/auth/tenant-access';
import { requireUser } from '@/lib/auth/session';

type DbMembershipRow = {
  organisation_id: string;
  clerk_user_id: string;
  role: string;
  status: string;
};

function mapRow(row: DbMembershipRow): MembershipRecord | null {
  if (!isPlatformRole(row.role)) return null;
  const status = row.status as MembershipRecord['status'];
  if (status !== 'active' && status !== 'invited' && status !== 'removed') return null;
  return {
    organisationId: row.organisation_id,
    clerkUserId: row.clerk_user_id,
    role: row.role,
    status,
  };
}

export async function getMembershipsForClerkUser(userId: string): Promise<MembershipRecord[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from('organisation_memberships')
    .select('organisation_id, clerk_user_id, role, status')
    .eq('clerk_user_id', userId);

  if (error || !data) {
    return [];
  }

  return data
    .map((row) => mapRow(row as DbMembershipRow))
    .filter((m): m is MembershipRecord => m !== null);
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

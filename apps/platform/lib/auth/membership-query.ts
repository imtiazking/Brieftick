import 'server-only';

import { isPlatformRole } from '@/lib/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { MembershipRecord } from '@/lib/auth/tenant-access';

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

export type MembershipQueryResult =
  | {
      ok: true;
      memberships: MembershipRecord[];
      rowCount: number;
    }
  | {
      ok: false;
      reason: 'supabase_not_configured';
      memberships: [];
    }
  | {
      ok: false;
      reason: 'postgrest_error';
      memberships: [];
      error: { code: string; message: string; details?: string; hint?: string };
    };

export async function queryMembershipsForClerkUser(userId: string): Promise<MembershipQueryResult> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { ok: false, reason: 'supabase_not_configured', memberships: [] };
  }

  const { data, error, status } = await supabase
    .from('organisation_memberships')
    .select('organisation_id, clerk_user_id, role, status')
    .eq('clerk_user_id', userId);

  if (error) {
    return {
      ok: false,
      reason: 'postgrest_error',
      memberships: [],
      error: {
        code: error.code ?? `http_${status ?? 'unknown'}`,
        message: error.message,
        details: error.details,
        hint: error.hint,
      },
    };
  }

  const memberships = (data ?? [])
    .map((row) => mapRow(row as DbMembershipRow))
    .filter((m): m is MembershipRecord => m !== null);

  return { ok: true, memberships, rowCount: memberships.length };
}

import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { canRi } from '@/lib/ri/permissions';
import { isPlatformRole } from '@/lib/roles';

export async function GET() {
  try {
    const ctx = await requireRiContext('change:read');
    const { data, error } = await ctx.supabase
      .from('organisation_memberships')
      .select('clerk_user_id, role, status')
      .eq('organisation_id', ctx.organisationId)
      .eq('status', 'active')
      .order('clerk_user_id', { ascending: true });
    if (error) {
      return NextResponse.json({ ok: false, error: 'members_unavailable', detail: error.message }, { status: 503 });
    }
    const members = (data ?? [])
      .filter((row) => isPlatformRole(row.role) && canRi(row.role, 'ri:read'))
      .map((row) => ({
        clerkUserId: row.clerk_user_id,
        role: row.role,
        label: `${row.role} · ${String(row.clerk_user_id).slice(0, 12)}…`,
      }));
    return NextResponse.json({
      ok: true,
      organisationId: ctx.organisationId,
      members,
      tenantScope: true,
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

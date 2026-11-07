import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { mapPolicyRowToLabView } from '@/lib/ri/lab-api/lab-governance-view';
import { getPolicyDetail, updatePolicy } from '@/lib/ri/services/policies';
import { assertLabConnectedWrite } from '@/lib/ri/lab-api/lab-connected-writes';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireRiContext('policy:read');
    const detail = await getPolicyDetail(ctx.supabase, ctx.organisationId, id);
    const policy = mapPolicyRowToLabView(detail.policy as Record<string, unknown>);
    return NextResponse.json({ ok: true, policy, detail: detail.policy });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireRiContext('policy:write');
    assertLabConnectedWrite(ctx.role, 'policy:write');
    const body = (await request.json()) as Record<string, unknown> & { expectedUpdatedAt?: string | null };
    const { expectedUpdatedAt, ...fields } = body;
    const row = await updatePolicy(
      ctx.supabase,
      ctx.organisationId,
      id,
      fields,
      expectedUpdatedAt ?? null,
      ctx.userId,
    );
    const policy = mapPolicyRowToLabView(row as Record<string, unknown>);
    return NextResponse.json({ ok: true, policy });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

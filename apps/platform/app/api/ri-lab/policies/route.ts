import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { assertLabConnectedWrite } from '@/lib/ri/lab-api/lab-connected-writes';
import { mapPolicyRowToLabView } from '@/lib/ri/lab-api/lab-governance-view';
import { createPolicy, listPolicies } from '@/lib/ri/services/policies';

export async function GET() {
  try {
    const ctx = await requireRiContext('policy:read');
    const rows = await listPolicies(ctx.supabase, ctx.organisationId);
    const policies = rows.map((row) => mapPolicyRowToLabView(row as Record<string, unknown>));
    return NextResponse.json({
      ok: true,
      total: policies.length,
      tenantScope: true,
      policies,
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRiContext('policy:write');
    assertLabConnectedWrite(ctx.role, 'policy:write');
    const body = (await request.json()) as Record<string, unknown>;
    const row = await createPolicy(ctx.supabase, ctx.organisationId, ctx.userId, body);
    const policy = mapPolicyRowToLabView(row as Record<string, unknown>);
    return NextResponse.json({ ok: true, policy }, { status: 201 });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

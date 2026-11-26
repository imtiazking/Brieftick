import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { assertLabRiskWritesEnabled } from '@/lib/ri/lab-api/lab-connected-writes';
import { ensureControlMappingFromApprovedRisk } from '@/lib/ri/services/risk-control-downstream';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';

/** One authorised UC-RI-007 recovery call for an already-validated risk (no governance re-approval). */
export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireRiContext('risk:approve');
    assertLabRiskWritesEnabled(ctx.role);
    await assertRowInOrganisation(ctx.supabase, 'risks', id, ctx.organisationId);

    const { data: risk, error } = await ctx.supabase
      .from('risks')
      .select('id, status')
      .eq('id', id)
      .eq('organisation_id', ctx.organisationId)
      .single();
    if (error || !risk) throw new Error('not_found');
    if (risk.status !== 'APPROVED') {
      return NextResponse.json(
        { ok: false, code: 'risk_not_validated', message: 'Control mapping retry requires an APPROVED risk.' },
        { status: 409 },
      );
    }

    let idempotencyKey: string | undefined;
    try {
      const body = (await request.json()) as { idempotencyKey?: string };
      idempotencyKey = typeof body?.idempotencyKey === 'string' ? body.idempotencyKey.trim() : undefined;
    } catch {
      /* empty body */
    }

    const result = await ensureControlMappingFromApprovedRisk(ctx.supabase, {
      organisationId: ctx.organisationId,
      riskId: id,
      actorUserId: ctx.userId,
      idempotencyKey: idempotencyKey || `stage4:${id}:recovery`,
    });

    return NextResponse.json({ ok: true, downstream: result });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
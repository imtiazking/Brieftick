import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { assertLabRiskWritesEnabled } from '@/lib/ri/lab-api/lab-connected-writes';
import {
  acceptOperatorKey,
  deriveRetryOrigin,
  nextStage4RetryKey,
} from '@/lib/ri/services/control-mapping-retry.mjs';
import { ensureControlMappingFromApprovedRisk } from '@/lib/ri/services/risk-control-downstream';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';

/**
 * One authorised UC-RI-007 recovery attempt for an already-validated risk (no governance re-approval).
 * The server numbers attempts, so a second recovery after a failed recovery is possible and never reuses a key.
 * A duplicate in-flight attempt (double click, parallel retry) is refused with 409 and costs nothing.
 */
export const maxDuration = 300;

const IN_FLIGHT = 'AI_RESERVATION_IN_FLIGHT';

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

    let requestedKey: string | null = null;
    let requestedKeyInvalid = false;
    try {
      const body = (await request.json()) as { idempotencyKey?: unknown };
      if (body && body.idempotencyKey !== undefined && body.idempotencyKey !== null && body.idempotencyKey !== '') {
        requestedKey = acceptOperatorKey(body.idempotencyKey, id);
        requestedKeyInvalid = requestedKey === null;
      }
    } catch {
      /* empty body */
    }
    if (requestedKeyInvalid) {
      return NextResponse.json(
        {
          ok: false,
          code: 'invalid_idempotency_key',
          message: `idempotencyKey must be 8-160 characters of A-Z a-z 0-9 : _ . - and start with stage4:${id}`,
        },
        { status: 400 },
      );
    }

    const { data: skipped, error: skipErr } = await ctx.supabase
      .from('workflow_events')
      .select('metadata, occurred_at')
      .eq('organisation_id', ctx.organisationId)
      .eq('entity_type', 'risk')
      .eq('entity_id', id)
      .eq('event_type', 'CONTROL_MAPPING_SKIPPED')
      .order('occurred_at', { ascending: false })
      .limit(25);
    if (skipErr) throw new Error(skipErr.message);

    const attempts = (skipped || []).filter(
      (row) => (row.metadata as Record<string, unknown> | null)?.reason !== IN_FLIGHT,
    );
    // The most recent attempt that reserved ledger spend and then failed at the provider is the one being repeated.
    const retryOf =
      attempts.map((row) => deriveRetryOrigin(row.metadata as Record<string, unknown> | null)).find(Boolean) ?? null;

    const result = await ensureControlMappingFromApprovedRisk(ctx.supabase, {
      organisationId: ctx.organisationId,
      riskId: id,
      actorUserId: ctx.userId,
      idempotencyKey: requestedKey || nextStage4RetryKey(id, attempts.length),
      retryOfIdempotencyKey: retryOf,
    });

    if (result.skipped && result.reason === IN_FLIGHT) {
      return NextResponse.json(
        {
          ok: false,
          code: IN_FLIGHT,
          message: 'A control mapping attempt for this risk is already running. No additional provider call was made.',
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, downstream: result });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

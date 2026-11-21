import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { assertLabConnectedWrite } from '@/lib/ri/lab-api/lab-connected-writes';
import { RiValidationError } from '@/lib/ri/errors';
import {
  getFindingReview,
  submitFindingReview,
  type FindingDecisionInput,
} from '@/lib/ri/services/ai-finding-review';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireRiContext('ai:read');
    const review = await getFindingReview(ctx.supabase, ctx.organisationId, id);
    return NextResponse.json({ ok: true, ...review });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ctx = await requireRiContext('ai:review');
    assertLabConnectedWrite(ctx.role, 'ai:review');
    const body = (await request.json().catch(() => null)) as {
      decisions?: FindingDecisionInput[];
      notes?: string;
    } | null;
    if (!body || !Array.isArray(body.decisions)) throw new RiValidationError('finding_decisions_invalid');
    const result = await submitFindingReview(ctx.supabase, {
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      role: ctx.role,
      runId: id,
      decisions: body.decisions,
      notes: typeof body.notes === 'string' ? body.notes.slice(0, 4000) : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

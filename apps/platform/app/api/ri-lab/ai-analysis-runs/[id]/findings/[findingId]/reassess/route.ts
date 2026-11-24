import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { assertLabConnectedWrite } from '@/lib/ri/lab-api/lab-connected-writes';
import { RiValidationError } from '@/lib/ri/errors';
import {
  submitFindingReassessment,
  type FindingReassessmentInput,
} from '@/lib/ri/services/ai-finding-review';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; findingId: string }> },
) {
  try {
    const { id, findingId } = await params;
    const ctx = await requireRiContext('ai:review');
    assertLabConnectedWrite(ctx.role, 'ai:review');
    const body = (await request.json().catch(() => null)) as {
      decision?: FindingReassessmentInput;
    } | null;
    if (!body?.decision?.findingId || body.decision.findingId !== findingId) {
      throw new RiValidationError('finding_decisions_invalid');
    }
    const result = await submitFindingReassessment(ctx.supabase, {
      organisationId: ctx.organisationId,
      userId: ctx.userId,
      role: ctx.role,
      runId: id,
      findingId,
      decision: body.decision,
    });
    return NextResponse.json(result);
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
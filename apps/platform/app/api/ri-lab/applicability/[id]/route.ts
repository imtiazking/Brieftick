import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { parseLabApplicabilityWorkflowBody } from '@/lib/ri/lab-api/lab-link-write';
import { assertLabConnectedWrite } from '@/lib/ri/lab-api/lab-connected-writes';
import {
  assignApplicabilityReviewer,
  patchApplicabilityAssessment,
} from '@/lib/ri/services/governance-queue';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const ctx = await requireRiContext('applicability:write');
    const body = parseLabApplicabilityWorkflowBody(await request.json());
    if (body.assignReviewer) {
      assertLabConnectedWrite(ctx.role, 'applicability:write');
      const row = await assignApplicabilityReviewer(ctx.supabase, {
        organisationId: ctx.organisationId,
        assessmentId: id,
        reviewerUserId: body.assignReviewer,
        userId: ctx.userId,
      });
      return NextResponse.json({ ok: true, assessment: row });
    }
    if (body.action === 'approve' || body.action === 'reject') {
      assertLabConnectedWrite(ctx.role, 'impact:approve');
    } else {
      assertLabConnectedWrite(ctx.role, 'applicability:write');
    }
    const row = await patchApplicabilityAssessment(ctx.supabase, {
      organisationId: ctx.organisationId,
      assessmentId: id,
      userId: ctx.userId,
      role: ctx.role,
      fields: {
        action: body.action,
        rationale: body.rationale,
        decisionComments: body.decisionComments,
      },
      expectedUpdatedAt: body.expectedUpdatedAt,
    });
    return NextResponse.json({ ok: true, assessment: row });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

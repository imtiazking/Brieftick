import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { parseLabImpactPatchBody } from '@/lib/ri/lab-api/lab-work-write';
import { assertLabImpactWritesEnabled } from '@/lib/ri/lab-api/lab-connected-writes';
import { getImpactDetail, updateImpactAssessment } from '@/lib/ri/services/impact';
import { mapImpactRowToLabView } from '@/lib/ri/lab-api/lab-work-view';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ctx = await requireRiContext('impact:read');
    const { impact, businessAreas } = await getImpactDetail(ctx.supabase, ctx.organisationId, id);
    const change = Array.isArray(impact.change) ? impact.change[0] : impact.change;
    const lab = mapImpactRowToLabView({
      id: impact.id,
      status: impact.status,
      materiality: impact.materiality,
      due_date: impact.due_date,
      owner_user_id: impact.owner_user_id,
      reviewer_user_id: impact.reviewer_user_id,
      approver_user_id: impact.approver_user_id,
      regulatory_change_id: impact.regulatory_change_id,
      metadata: impact.metadata,
      change,
    });
    return NextResponse.json({
      ok: true,
      assessment: {
        ...lab,
        businessImpact: impact.business_impact,
        operationalImpact: impact.operational_impact,
        technologyImpact: impact.technology_impact,
        complianceImpact: impact.compliance_impact,
        financialImpact: impact.financial_impact,
        implementationComplexity: impact.implementation_complexity,
        businessAreas,
        submittedAt: impact.submitted_at,
        approvedAt: impact.approved_at,
        updatedAt: impact.updated_at,
      },
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const ctx = await requireRiContext('impact:write');
    assertLabImpactWritesEnabled(ctx.role);
    const patch = parseLabImpactPatchBody(await request.json());
    await updateImpactAssessment(ctx.supabase, {
      organisationId: ctx.organisationId,
      impactId: id,
      userId: ctx.userId,
      role: ctx.role,
      fields: patch.fields,
      expectedUpdatedAt: patch.expectedUpdatedAt,
    });
    const { impact, businessAreas } = await getImpactDetail(ctx.supabase, ctx.organisationId, id);
    const change = Array.isArray(impact.change) ? impact.change[0] : impact.change;
    const lab = mapImpactRowToLabView({
      id: impact.id,
      status: impact.status,
      materiality: impact.materiality,
      due_date: impact.due_date,
      owner_user_id: impact.owner_user_id,
      reviewer_user_id: impact.reviewer_user_id,
      approver_user_id: impact.approver_user_id,
      regulatory_change_id: impact.regulatory_change_id,
      metadata: impact.metadata,
      change,
    });
    return NextResponse.json({
      ok: true,
      assessment: {
        ...lab,
        businessImpact: impact.business_impact,
        operationalImpact: impact.operational_impact,
        technologyImpact: impact.technology_impact,
        complianceImpact: impact.compliance_impact,
        financialImpact: impact.financial_impact,
        implementationComplexity: impact.implementation_complexity,
        businessAreas,
        updatedAt: impact.updated_at,
      },
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

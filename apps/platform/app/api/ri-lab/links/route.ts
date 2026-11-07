import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { parseLabLinkBody } from '@/lib/ri/lab-api/lab-link-write';
import { assertLabConnectedWrite } from '@/lib/ri/lab-api/lab-connected-writes';
import {
  linkEvidenceControl,
  linkEvidenceObligation,
  linkEvidenceRegulatoryChange,
  linkAssuranceControl,
  linkObligationControl,
  linkObligationRisk,
  linkRiskControl,
} from '@/lib/ri/links';

export async function POST(request: Request) {
  try {
    const ctx = await requireRiContext('ri:read');
    const body = parseLabLinkBody(await request.json());
    switch (body.linkType) {
      case 'obligation_risk':
        assertLabConnectedWrite(ctx.role, 'obligation:write');
        await linkObligationRisk(
          ctx.supabase,
          ctx.organisationId,
          body.leftId,
          body.rightId,
          ctx.userId,
        );
        break;
      case 'obligation_control':
        assertLabConnectedWrite(ctx.role, 'obligation:write');
        await linkObligationControl(
          ctx.supabase,
          ctx.organisationId,
          body.leftId,
          body.rightId,
          ctx.userId,
        );
        break;
      case 'risk_control':
        assertLabConnectedWrite(ctx.role, 'risk:write');
        await linkRiskControl(
          ctx.supabase,
          ctx.organisationId,
          body.leftId,
          body.rightId,
          ctx.userId,
        );
        break;
      case 'evidence_obligation':
        assertLabConnectedWrite(ctx.role, 'evidence:write');
        await linkEvidenceObligation(
          ctx.supabase,
          ctx.organisationId,
          body.leftId,
          body.rightId,
          ctx.userId,
        );
        break;
      case 'evidence_control':
        assertLabConnectedWrite(ctx.role, 'evidence:write');
        await linkEvidenceControl(
          ctx.supabase,
          ctx.organisationId,
          body.leftId,
          body.rightId,
          ctx.userId,
        );
        break;
      case 'evidence_regulatory_change':
        assertLabConnectedWrite(ctx.role, 'evidence:write');
        await linkEvidenceRegulatoryChange(
          ctx.supabase,
          ctx.organisationId,
          body.leftId,
          body.rightId,
          ctx.userId,
        );
        break;
      case 'assurance_control':
        assertLabConnectedWrite(ctx.role, 'assurance:write');
        await linkAssuranceControl(
          ctx.supabase,
          ctx.organisationId,
          body.leftId,
          body.rightId,
          ctx.userId,
        );
        break;
      default:
        return NextResponse.json({ error: 'invalid_link_type' }, { status: 400 });
    }
    return NextResponse.json({ ok: true, linkType: body.linkType });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

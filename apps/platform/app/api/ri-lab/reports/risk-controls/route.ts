import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { getRiskControlsOperationalReport } from '@/lib/ri/services/risk-controls-reporting';

export async function GET() {
  try {
    const ctx = await requireRiContext('risk:read');
    const report = await getRiskControlsOperationalReport(ctx.supabase, ctx.organisationId);
    return NextResponse.json({ ok: true, report });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}
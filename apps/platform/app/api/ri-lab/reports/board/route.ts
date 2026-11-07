import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { buildLabBoardReport } from '@/lib/ri/lab-api/lab-report-view';
import { parseReportingPeriod } from '@/lib/ri/reporting-period';
import { getManagementReport } from '@/lib/ri/services/reporting';

export async function GET(request: Request) {
  try {
    const ctx = await requireRiContext('ri:read');
    const period = parseReportingPeriod(new URL(request.url).searchParams);
    const report = await getManagementReport(ctx.supabase, ctx.organisationId, {
      reportingPeriod: period,
    });
    return NextResponse.json({ ok: true, ...buildLabBoardReport(report) });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

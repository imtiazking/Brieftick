import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { buildBoardReportPdfLines, renderSimpleTextPdf } from '@/lib/ri/lab-api/render-simple-pdf';
import { parseReportingPeriod } from '@/lib/ri/reporting-period';
import { getManagementReport } from '@/lib/ri/services/reporting';

export async function GET(request: Request) {
  try {
    const ctx = await requireRiContext('ri:read');
    const period = parseReportingPeriod(new URL(request.url).searchParams);
    const report = await getManagementReport(ctx.supabase, ctx.organisationId, {
      reportingPeriod: period,
    });
    const generatedAt = new Date().toISOString();
    const lines = buildBoardReportPdfLines({
      organisationId: ctx.organisationId,
      generatedAt,
      reportingPeriod: report.reportingPeriod,
      summary: {
        changesOpen: report.changesOpen,
        impactsInProgress: report.impactsInProgress,
        obligationsActive: report.obligationsActive,
        obligationsOverdue: report.obligationsOverdue,
        findingsOpen: report.findingsOpen,
        assuranceOpen: report.assuranceOpen,
        actionsOverdue: report.actionsOverdue,
      },
      activityInPeriod: report.activityInPeriod,
      materialChanges: report.materialChanges,
    });
    const pdf = renderSimpleTextPdf(lines);
    const filename = `forgeniq-board-report-${ctx.organisationId.slice(0, 8)}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'X-Forgeniq-Reporting-Period': period.label,
      },
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

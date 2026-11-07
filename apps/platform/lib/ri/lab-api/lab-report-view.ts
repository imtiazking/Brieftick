import 'server-only';

import type { DashboardSummary } from '@/lib/ri/services/dashboard';
import type { ManagementReport } from '@/lib/ri/services/reporting';
import type { ReportingPeriod } from '@/lib/ri/reporting-period';

export type LabExecutiveReportPayload = {
  generatedAt: string;
  tenantScope: true;
  reportingPeriod?: ReportingPeriod;
  metricsNote?: string;
  activityInPeriod?: ManagementReport['activityInPeriod'];
  summary: DashboardSummary;
  trace: {
    changesOpen: { source: 'regulatory_changes'; filter: string[] };
    obligationsOverdue: { source: 'regulatory_obligations'; rule: 'due_date < today AND active status' };
    findingsOpen: { source: 'findings'; filter: string[] };
    impactsInProgress: { source: 'impact_assessments'; filter: string[] };
  };
};

export type LabBoardReportPayload = {
  generatedAt: string;
  tenantScope: true;
  reportingPeriod?: ReportingPeriod;
  metricsNote?: string;
  activityInPeriod?: ManagementReport['activityInPeriod'];
  report: ManagementReport;
  materialChanges: ManagementReport['materialChanges'];
  controlGaps: number;
  emptySections: string[];
};

export function buildLabExecutiveReport(report: ManagementReport): LabExecutiveReportPayload {
  const {
    materialChanges: _mc,
    controlGaps: _cg,
    reportingPeriod,
    activityInPeriod,
    metricsNote,
    ...summary
  } = report;
  return {
    generatedAt: new Date().toISOString(),
    tenantScope: true,
    reportingPeriod,
    metricsNote,
    activityInPeriod,
    summary,
    trace: {
      changesOpen: { source: 'regulatory_changes', filter: ['DRAFT', 'OPEN', 'IN_PROGRESS'] },
      obligationsOverdue: {
        source: 'regulatory_obligations',
        rule: 'due_date < today AND active status',
      },
      findingsOpen: { source: 'findings', filter: ['OPEN', 'IN_PROGRESS'] },
      impactsInProgress: {
        source: 'impact_assessments',
        filter: ['DRAFT', 'IN_REVIEW', 'IN_PROGRESS'],
      },
    },
  };
}

export function buildLabBoardReport(report: ManagementReport): LabBoardReportPayload {
  const emptySections: string[] = [];
  if (!report.materialChanges.length) emptySections.push('materialChanges');
  if (!report.changesOpen) emptySections.push('changesOpen');
  if (!report.obligationsActive) emptySections.push('obligationsActive');
  if (!report.findingsOpen) emptySections.push('findingsOpen');
  if (!report.impactsInProgress) emptySections.push('impactsInProgress');
  if (!report.controlGaps) emptySections.push('controlGaps');
  return {
    generatedAt: new Date().toISOString(),
    tenantScope: true,
    reportingPeriod: report.reportingPeriod,
    metricsNote: report.metricsNote,
    activityInPeriod: report.activityInPeriod,
    report,
    materialChanges: report.materialChanges,
    controlGaps: report.controlGaps,
    emptySections,
  };
}

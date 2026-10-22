import 'server-only';

import type { DashboardSummary } from '@/lib/ri/services/dashboard';
const UI_LABEL_OPEN_OBLIGATIONS = 'Open obligations';

/** Design Lab priority metric strip (dashboard hero row). */
export type LabPriorityMetrics = {
  labelOpenObligations: string;
  openObligations: number;
  overdueObligations: number;
  awaitingReview: number;
  upcomingDeadlines: number;
  changesOpen: number;
};

export function mapProductionDashboardToLabPriority(summary: DashboardSummary): LabPriorityMetrics {
  return {
    labelOpenObligations: UI_LABEL_OPEN_OBLIGATIONS,
    openObligations: summary.obligationsActive,
    overdueObligations: summary.obligationsOverdue,
    awaitingReview: summary.publicationsAwaitingTriage,
    upcomingDeadlines: summary.upcomingDeadlines,
    changesOpen: summary.changesOpen,
  };
}

import Link from 'next/link';
import type { DashboardSummary } from '@/lib/ri/services/dashboard';

type Metric = { label: string; value: number; href: string; hint?: string };

export function RiDashboardMetrics({ summary }: { summary: DashboardSummary }) {
  const metrics: Metric[] = [
    {
      label: 'Publications (30d)',
      value: summary.publicationsNew30d,
      href: '/ri/horizon',
      hint: 'Global ingest window',
    },
    {
      label: 'Awaiting triage',
      value: summary.publicationsAwaitingTriage,
      href: '/ri/work-queue',
    },
    {
      label: 'Changes in progress',
      value: summary.changesOpen,
      href: '/ri/changes',
    },
    {
      label: 'Active obligations',
      value: summary.obligationsActive,
      href: '/ri/obligations',
      hint: 'OPEN · IN_PROGRESS · OVERDUE',
    },
    {
      label: 'Overdue obligations',
      value: summary.obligationsOverdue,
      href: '/ri/obligations',
    },
    {
      label: 'Obligations in review',
      value: summary.obligationsInReview,
      href: '/ri/obligations',
    },
    {
      label: 'Actions due (7d)',
      value: summary.actionsDueSoon,
      href: '/ri/actions',
    },
    {
      label: 'Overdue actions',
      value: summary.actionsOverdue,
      href: '/ri/actions',
    },
    {
      label: 'Open findings',
      value: summary.findingsOpen,
      href: '/ri/findings',
    },
    {
      label: 'Assurance in flight',
      value: summary.assuranceOpen,
      href: '/ri/assurance',
    },
    {
      label: 'Impact assessments',
      value: summary.impactsInProgress,
      href: '/ri/impact-assessments',
    },
    {
      label: 'Upcoming deadlines',
      value: summary.upcomingDeadlines,
      href: '/ri/calendar',
    },
  ];

  return (
    <div className="fg-metric-grid">
      {metrics.map((m) => (
        <Link key={m.label} href={m.href} className="fg-metric-card">
          <span className="fg-metric-card__value">{m.value}</span>
          <span className="fg-metric-card__label">{m.label}</span>
          {m.hint ? <span className="fg-metric-card__hint">{m.hint}</span> : null}
        </Link>
      ))}
      {summary.sourceHealth ? (
        <div className="fg-metric-card fg-metric-card--static">
          <span className="fg-metric-card__label">Source health (ops)</span>
          <span className="fg-metric-card__hint">
            Healthy {summary.sourceHealth.healthy} · Degraded {summary.sourceHealth.degraded} · Failing{' '}
            {summary.sourceHealth.failing} · Stale {summary.sourceHealth.stale}
          </span>
        </div>
      ) : null}
    </div>
  );
}

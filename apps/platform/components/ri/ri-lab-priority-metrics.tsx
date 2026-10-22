import Link from 'next/link';
import type { LabPriorityMetrics } from '@/lib/ri/lab-compat';

export function RiLabPriorityMetrics({ metrics }: { metrics: LabPriorityMetrics }) {
  const items = [
    { label: 'Changes in flight', value: metrics.changesOpen, href: '/ri/changes' },
    { label: 'Awaiting review', value: metrics.awaitingReview, href: '/ri/work-queue' },
    {
      label: metrics.labelOpenObligations,
      value: metrics.openObligations,
      hint: 'Open · In progress · Overdue',
      href: '/ri/obligations',
    },
    { label: 'Overdue obligations', value: metrics.overdueObligations, href: '/ri/obligations' },
    { label: 'Upcoming deadlines', value: metrics.upcomingDeadlines, href: '/ri/calendar' },
  ];
  return (
    <div className="ri-priority-metrics fg-metric-grid">
      {items.map((m) => (
        <Link key={m.label} href={m.href} className="ri-priority-metric fg-metric-card">
          <span className="fg-metric-card__label">{m.label}</span>
          <span className="fg-metric-card__value">{m.value}</span>
          {m.hint ? <span className="fg-metric-card__hint">{m.hint}</span> : null}
        </Link>
      ))}
    </div>
  );
}

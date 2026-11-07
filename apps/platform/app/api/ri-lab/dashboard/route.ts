import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { parseLabDataScope, emptyLabScopeMeta, mergeExcluded } from '@/lib/ri/lab-api/lab-data-scope';
import { mapProductionDashboardToLabPriority } from '@/lib/ri/lab-compat';
import { getDashboardSummary } from '@/lib/ri/services/dashboard';
import { listPendingGovernanceItems } from '@/lib/ri/services/governance-queue';
import { listOperationalAlerts } from '@/lib/ri/services/ingestion-admin';
import { mapOperationalAlertToLabView } from '@/lib/ri/lab-api/lab-operations-view';
import { filterPendingGovernanceForLabScope } from '@/lib/ri/uat-record-provenance';

export async function GET(request: Request) {
  try {
    const ctx = await requireRiContext('ri:read');
    const { supabase, organisationId, userId, role } = ctx;
    const scope = parseLabDataScope(new URL(request.url));
    const excludeSynthetic = scope === 'operational';
    const scopeMeta = emptyLabScopeMeta(scope);
    const [summary, pendingRaw, alerts] = await Promise.all([
      getDashboardSummary(supabase, organisationId, userId, { excludeSyntheticUat: excludeSynthetic }),
      listPendingGovernanceItems(supabase, organisationId),
      listOperationalAlerts(supabase, 20),
    ]);

    const { items: pending, excludedNonOperationalCount: excludedPending } = filterPendingGovernanceForLabScope(
      pendingRaw,
      scope,
    );
    if (excludedPending > 0) {
      mergeExcluded(scopeMeta, 'pendingApprovals', excludedPending);
    }

    const priorityMetrics = mapProductionDashboardToLabPriority(summary);
    const operationalAlerts = alerts.map((a) => mapOperationalAlertToLabView(a as Record<string, unknown>));

    return NextResponse.json({
      ok: true,
      tenantScope: true,
      ...scopeMeta,
      role,
      summary,
      priorityMetrics,
      pendingApprovals: pending.map((p) => ({
        id: p.id,
        kind: p.kind,
        title: p.title,
        status: p.status,
        submittedAt: p.submittedAt,
        ownerUserId: p.ownerUserId,
        href:
          p.kind === 'impact_assessment'
            ? `#/assessment/${p.id}`
            : `#/applicability/${p.publicationId ?? p.id}`,
        _connected: true,
      })),
      operationalAlerts,
      externalDeliveryDisabled: true,
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

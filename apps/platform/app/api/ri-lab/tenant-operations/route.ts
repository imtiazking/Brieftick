import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { canRi } from '@/lib/ri/permissions';
import {
  buildLabOperationsMetrics,
  mapAdminSourceRowToLabView,
  mapIngestionRunRowToLabView,
  mapOperationalAlertToLabView,
} from '@/lib/ri/lab-api/lab-operations-view';
import { listGlobalRegulators } from '@/lib/ri/services/reference-catalogue';
import {
  listIngestionRuns,
  listOperationalAlerts,
  listSourcesForIngestionAdmin,
} from '@/lib/ri/services/ingestion-admin';
import { getSourceMonitoringSummary } from '@/lib/ri/services/source-monitoring-config';

export async function GET() {
  try {
    const ctx = await requireRiContext('ri:read');
    const { supabase, role, organisationId, userId } = ctx;

    const regulators = await listGlobalRegulators(supabase);

    const monitoring = await getSourceMonitoringSummary(supabase);

    let sources: ReturnType<typeof mapAdminSourceRowToLabView>[] = [];
    if (canRi(role, 'ingestion:read')) {
      const rows = await listSourcesForIngestionAdmin(supabase);
      sources = rows.map((r) => mapAdminSourceRowToLabView(r));
    }

    let runs: ReturnType<typeof mapIngestionRunRowToLabView>[] = [];
    let alerts: ReturnType<typeof mapOperationalAlertToLabView>[] = [];
    const ingestionRestricted = !canRi(role, 'ingestion:read');
    if (canRi(role, 'ingestion:read')) {
      const runRows = await listIngestionRuns(supabase, 30);
      runs = runRows.map((r) => mapIngestionRunRowToLabView(r as Record<string, unknown>));
      const alertRows = await listOperationalAlerts(supabase, 50);
      alerts = alertRows.map((a) => mapOperationalAlertToLabView(a as Record<string, unknown>));
    }

    const metrics = buildLabOperationsMetrics({
      regulators: regulators.length,
      sources,
      runsVisible: runs.length,
      alertsVisible: alerts.length,
      ingestionRestricted,
      monitoringSummary: monitoring.summary,
    });

    return NextResponse.json({
      ok: true,
      tenantScope: true,
      organisationId,
      userId,
      role,
      operationsMetrics: metrics,
      sourceMonitoringSummary: monitoring.summary,
      sourceMonitoringInventoryNote:
        monitoring.summary.operationsVisibility === 'restricted'
          ? 'Operational configuration rows (regulatory_source_operations) are visible only to platform operators. Readiness counts below are from the authoritative reference catalogue and connector registry.'
          : 'Platform operator session — operational configuration counts include regulatory_source_operations when present.',
      regulators: regulators.map((r) => ({
        id: r.id,
        externalKey: r.external_key,
        name: r.name,
        acronym: r.acronym,
        jurisdiction: r.jurisdiction,
        lifecycleStatus: r.lifecycle_status,
        _connected: true,
      })),
      regulatorySources: sources,
      ingestionRuns: runs,
      operationalAlerts: alerts,
      notifications: [],
      notificationsNote:
        'Use GET /api/ri-lab/notifications for tenant in-app notifications (requires migration 20261029150000 on database).',
      snapshotsNote:
        'Source snapshot and extraction revision detail requires platform-operator access; not exposed via tenant lab API.',
    });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

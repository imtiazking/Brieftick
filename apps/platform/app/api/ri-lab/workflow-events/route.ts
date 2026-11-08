import { NextResponse } from 'next/server';
import { requireRiContext } from '@/lib/ri/context';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';
import { labApiErrorResponse } from '@/lib/ri/lab-api/errors';
import { mapWorkflowEventToLabView } from '@/lib/ri/lab-api/lab-governance-view';
import { parseUuid } from '@/lib/ri/validation';

const ENTITY_TABLE: Record<
  string,
  | 'regulatory_changes'
  | 'regulatory_obligations'
  | 'impact_assessments'
  | 'risks'
  | 'controls'
  | 'actions'
  | 'evidence_items'
> = {
  regulatory_change: 'regulatory_changes',
  regulatory_obligation: 'regulatory_obligations',
  impact_assessment: 'impact_assessments',
  risk: 'risks',
  control: 'controls',
  action: 'actions',
  evidence_item: 'evidence_items',
};

export async function GET(request: Request) {
  try {
    const ctx = await requireRiContext('ri:read');
    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 200), 500);
    const entityType = url.searchParams.get('entityType')?.trim() || null;
    const entityIdRaw = url.searchParams.get('entityId')?.trim() || null;

    if (entityIdRaw && !entityType) {
      throw new Error('entity_type_required');
    }
    if (entityType && !entityIdRaw) {
      throw new Error('entity_id_required');
    }

    let entityId: string | null = null;
    if (entityType && entityIdRaw) {
      entityId = parseUuid(entityIdRaw, 'entity_id');
      const table = ENTITY_TABLE[entityType];
      if (!table) throw new Error('invalid_entity_type');
      await assertRowInOrganisation(ctx.supabase, table, entityId, ctx.organisationId);
    }

    let query = ctx.supabase
      .from('workflow_events')
      .select(
        'id, organisation_id, entity_type, entity_id, event_type, actor_user_id, from_status, to_status, metadata, occurred_at',
      )
      .eq('organisation_id', ctx.organisationId)
      .order('occurred_at', { ascending: false })
      .limit(limit);

    if (entityType) query = query.eq('entity_type', entityType);
    if (entityId) query = query.eq('entity_id', entityId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const events = (data ?? []).map((row) =>
      mapWorkflowEventToLabView(row as Parameters<typeof mapWorkflowEventToLabView>[0]),
    );
    return NextResponse.json({ ok: true, total: events.length, events, tenantScope: true });
  } catch (err) {
    return labApiErrorResponse(err);
  }
}

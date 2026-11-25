import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { recordWorkflowEvent, type WorkflowEventType } from '@/lib/ri/workflow-events';

export async function attemptMandatoryLifecycleLink(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    actorUserId: string;
    linkType: string;
    sourceEntityType: string;
    sourceEntityId: string;
    targetEntityType: string;
    targetEntityId: string;
    link: () => Promise<void>;
  },
): Promise<{ linked: true } | { linked: false; deferred: true; reason: string }> {
  try {
    await params.link();
    return { linked: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg !== 'provenance_link_mismatch') throw e;
    await recordWorkflowEvent(supabase, {
      organisationId: params.organisationId,
      entityType: params.sourceEntityType,
      entityId: params.sourceEntityId,
      eventType: 'LIFECYCLE_LINK_DEFERRED' as WorkflowEventType,
      actorUserId: params.actorUserId,
      metadata: {
        linkType: params.linkType,
        targetEntityType: params.targetEntityType,
        targetEntityId: params.targetEntityId,
        reason: 'provenance_link_mismatch',
        recoverable: true,
      },
    });
    return { linked: false, deferred: true, reason: 'provenance_link_mismatch' };
  }
}
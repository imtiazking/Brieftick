'use server';

import { revalidatePath } from 'next/cache';
import { requireIngestionAdminContext } from '@/lib/ri/ingestion-admin-context';
import { assertCanRi } from '@/lib/ri/permissions';

export async function acknowledgeAlertAction(formData: FormData) {
  const ctx = await requireIngestionAdminContext();
  assertCanRi(ctx.role, 'ingestion:acknowledge');
  const alertId = String(formData.get('alert_id'));
  const { error } = await ctx.supabase
    .from('operational_alerts')
    .update({
      status: 'ACKNOWLEDGED',
      acknowledged_by: ctx.organisationId ? `user:${ctx.role}` : null,
      acknowledged_at: new Date().toISOString(),
    })
    .eq('id', alertId);
  if (error) throw new Error(error.message);
  await ctx.supabase.from('ingestion_operational_events').insert({
    event_type: 'ALERT_ACKNOWLEDGED',
    actor_user_id: ctx.role,
    metadata: { alert_id: alertId },
  });
  revalidatePath('/ri/admin/alerts');
}

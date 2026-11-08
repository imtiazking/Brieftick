import 'server-only';

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChangeCreateMode } from '@/lib/ri/lab-api/change-create-provenance';
import { parseRequiredText } from '@/lib/ri/validation';

/** Persisted on actions.metadata — not client-provenance. */
export const LAB_ACTION_CREATE_IDEMPOTENCY_KEY = 'labCreateIdempotencyKey';

export function normalizeActionIdempotencyKey(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  return parseRequiredText(raw, 'idempotency_key', 128);
}

/**
 * Stable fingerprint for duplicate submission protection when the client reuses the same key.
 * Also used as fallback key material when only a header is absent but payload is identical.
 */
export function buildActionCreateIdempotencyKey(params: {
  organisationId: string;
  title: string;
  creationMode: ChangeCreateMode;
  obligationId: string | null;
  controlId: string | null;
  riskId: string | null;
  ownerUserId: string | null;
  dueDate: string | null;
  clientKey: string | null;
}): string {
  if (params.clientKey) return params.clientKey;
  const material = [
    params.organisationId,
    params.creationMode,
    params.title.trim().toLowerCase(),
    params.obligationId ?? '',
    params.controlId ?? '',
    params.riskId ?? '',
    params.ownerUserId ?? '',
    params.dueDate ?? '',
  ].join('|');
  return `fp_${createHash('sha256').update(material).digest('hex').slice(0, 40)}`;
}

export async function findLabActionByCreateIdempotencyKey(
  supabase: SupabaseClient,
  organisationId: string,
  idempotencyKey: string,
) {
  const { data, error } = await supabase
    .from('actions')
    .select(
      'id, title, description, status, priority, due_date, escalation_status, owner_user_id, updated_at, metadata',
    )
    .eq('organisation_id', organisationId)
    .contains('metadata', { [LAB_ACTION_CREATE_IDEMPOTENCY_KEY]: idempotencyKey })
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

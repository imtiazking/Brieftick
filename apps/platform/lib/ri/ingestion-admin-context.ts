import 'server-only';

import { requirePlatformOperator } from '@/lib/auth/platform-operator';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { RiConfigurationError } from '@/lib/ri/errors';

/** FORGENIQ platform operators only — not customer org ADMIN/COMPLIANCE_MANAGER. */
export async function requireIngestionAdminContext() {
  const { userId } = await requirePlatformOperator();
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new RiConfigurationError();
  return { userId, supabase };
}

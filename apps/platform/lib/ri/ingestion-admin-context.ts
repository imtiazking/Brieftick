import 'server-only';

import { requireRole } from '@/lib/auth/require-organisation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { RiConfigurationError } from '@/lib/ri/errors';

/** OWNER / ADMIN / COMPLIANCE_MANAGER — operational ingestion views. */
export async function requireIngestionAdminContext() {
  const org = await requireRole('COMPLIANCE_MANAGER');
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new RiConfigurationError();
  return { ...org, supabase };
}

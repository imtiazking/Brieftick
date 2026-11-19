import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { getSupabaseProjectRef, getSupabaseUrl } from '@/lib/env';
import { isSupabaseServiceRoleKeyUsable } from '@/lib/supabase/service-role-key';

/**
 * Service-role client — server-only. Never import from client components or pages marked 'use client'.
 */
export function createSupabaseAdminClient() {
  const url = getSupabaseUrl()?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return null;
  }
  if (!isSupabaseServiceRoleKeyUsable(serviceKey, getSupabaseProjectRef())) {
    return null;
  }

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

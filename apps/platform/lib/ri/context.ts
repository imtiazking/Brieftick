import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlatformRole } from '@/lib/roles';
import { requireOrganisation } from '@/lib/auth/require-organisation';
import { requireUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { assertCanRi, type RiAction } from '@/lib/ri/permissions';
import { RiConfigurationError } from '@/lib/ri/errors';

export type RiContext = {
  organisationId: string;
  organisationName: string | null;
  role: PlatformRole;
  userId: string;
  supabase: SupabaseClient;
};

export async function requireRiContext(action: RiAction = 'ri:read'): Promise<RiContext> {
  const org = await requireOrganisation();
  const role = org.role;
  if (!role) throw new Error('insufficient_role');
  assertCanRi(role, action);

  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new RiConfigurationError();

  const { userId } = await requireUser();

  return {
    organisationId: org.organisationId,
    organisationName: 'organisationName' in org ? org.organisationName : null,
    role,
    userId,
    supabase,
  };
}

export async function tryRiContext(): Promise<RiContext | null> {
  try {
    return await requireRiContext('ri:read');
  } catch {
    return null;
  }
}

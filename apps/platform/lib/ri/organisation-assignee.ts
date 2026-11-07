import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlatformRole } from '@/lib/roles';
import { isPlatformRole } from '@/lib/roles';
import { RiValidationError } from '@/lib/ri/errors';
import { assertCanRi } from '@/lib/ri/permissions';
import { parseRequiredText } from '@/lib/ri/validation';

export async function assertActiveOrganisationAssignee(
  supabase: SupabaseClient,
  organisationId: string,
  assigneeClerkUserId: string,
): Promise<{ clerkUserId: string; role: PlatformRole }> {
  const clerkUserId = parseRequiredText(assigneeClerkUserId, 'owner_user_id', 256);
  const { data, error } = await supabase
    .from('organisation_memberships')
    .select('clerk_user_id, role, status')
    .eq('organisation_id', organisationId)
    .eq('clerk_user_id', clerkUserId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !isPlatformRole(data.role)) {
    throw new RiValidationError('invalid_assignee');
  }
  assertCanRi(data.role, 'ri:read');
  return { clerkUserId: data.clerk_user_id, role: data.role };
}

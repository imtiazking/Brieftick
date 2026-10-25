import 'server-only';

import { getOptionalUser, requireUser } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export class PlatformOperatorError extends Error {
  constructor(message = 'platform_operator_required') {
    super(message);
    this.name = 'PlatformOperatorError';
  }
}

/** True when Clerk user has an active row in public.platform_operators (FORGENIQ platform staff). */
export async function isPlatformOperator(clerkUserId?: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return false;

  let userId = clerkUserId;
  if (!userId) {
    const user = await getOptionalUser();
    if (!user) return false;
    userId = user.userId;
  }
  const { data, error } = await supabase
    .from('platform_operators')
    .select('clerk_user_id')
    .eq('clerk_user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (error) return false;
  return Boolean(data?.clerk_user_id);
}

export async function requirePlatformOperator(): Promise<{ userId: string }> {
  const { userId } = await requireUser();
  if (!(await isPlatformOperator(userId))) {
    throw new PlatformOperatorError();
  }
  return { userId };
}

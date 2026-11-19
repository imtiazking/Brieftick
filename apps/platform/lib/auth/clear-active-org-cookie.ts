import 'server-only';

import { cookies } from 'next/headers';
import { ACTIVE_ORG_COOKIE } from '@/lib/auth/active-organisation';

/** Clears tenant selection cookie on sign-out (does not affect Clerk session). */
export async function clearActiveOrganisationCookie(): Promise<void> {
  const store = await cookies();
  store.delete(ACTIVE_ORG_COOKIE);
}

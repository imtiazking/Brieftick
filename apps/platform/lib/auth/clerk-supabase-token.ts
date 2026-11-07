import 'server-only';

import { auth } from '@clerk/nextjs/server';
import { isClerkConfigured } from '@/lib/env';

/** Clerk session JWT forwarded to Supabase PostgREST (third-party auth). */
export async function getClerkSupabaseAccessToken(): Promise<string | null> {
  if (!isClerkConfigured()) return null;
  const { getToken } = await auth();
  const token = await getToken();
  return token?.trim() ? token : null;
}

import 'server-only';

import { auth } from '@clerk/nextjs/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseAnonKey, getSupabaseUrl, isClerkConfigured, isSupabaseBrowserConfigured } from '@/lib/env';

/**
 * Server Supabase client (anon key + user session from Clerk third-party JWT when configured).
 * No service-role access here — use lib/supabase/admin.ts for future server-only jobs.
 */
export async function createSupabaseServerClient() {
  if (!isSupabaseBrowserConfigured()) {
    return null;
  }

  const cookieStore = await cookies();
  const url = getSupabaseUrl()!;
  const anonKey = getSupabaseAnonKey()!;

  let accessToken: string | null = null;
  if (isClerkConfigured()) {
    const { getToken } = await auth();
    accessToken = (await getToken()) ?? null;
  }

  return createServerClient(url, anonKey, {
    global: {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // setAll from Server Component — middleware will refresh sessions
        }
      },
    },
  });
}

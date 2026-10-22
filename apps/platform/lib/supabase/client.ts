'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser Supabase client — publishable anon key only.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    return null;
  }

  return createBrowserClient(url, anonKey);
}

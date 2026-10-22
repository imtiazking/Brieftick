/**
 * Environment contract — names only in .env.example; never commit secrets.
 */

export type AuthConfigStatus = 'configured' | 'not_configured' | 'partial';
export type SupabaseConfigStatus = 'configured' | 'not_configured' | 'partial';

const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
const clerkSecret = process.env.CLERK_SECRET_KEY?.trim();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

export function isClerkConfigured(): boolean {
  return Boolean(pk?.startsWith('pk_') && clerkSecret);
}

export function clerkConfigStatus(): AuthConfigStatus {
  if (pk?.startsWith('pk_') && clerkSecret) return 'configured';
  if (pk || clerkSecret) return 'partial';
  return 'not_configured';
}

export function isSupabaseBrowserConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnon);
}

export function supabaseConfigStatus(): SupabaseConfigStatus {
  const hasService = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  if (supabaseUrl && supabaseAnon && hasService) return 'configured';
  if (supabaseUrl || supabaseAnon || hasService) return 'partial';
  return 'not_configured';
}

export function getAppEnvironment(): string {
  return process.env.FORGENIQ_ENV?.trim() || process.env.NODE_ENV || 'development';
}

export function getBuildId(): string {
  return process.env.FORGENIQ_BUILD_ID?.trim() || 'local-dev';
}

export function getSupabaseAnonKey(): string | undefined {
  return supabaseAnon;
}

export function getSupabaseUrl(): string | undefined {
  return supabaseUrl;
}

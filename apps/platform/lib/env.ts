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

/** Supabase project ref from NEXT_PUBLIC_SUPABASE_URL (e.g. lhgzdicffkhaaykzthep). */
export function getSupabaseProjectRef(): string | null {
  if (!supabaseUrl) return null;
  const match = supabaseUrl.match(/^https:\/\/([^.]+)\.supabase\.co/i);
  return match?.[1] ?? null;
}

export type ClerkKeyKind = 'production' | 'development' | 'unknown';

export function getClerkPublishableKeyKind(): ClerkKeyKind {
  if (pk?.startsWith('pk_live_')) return 'production';
  if (pk?.startsWith('pk_test_')) return 'development';
  return 'unknown';
}

export function getClerkSecretKeyKind(): ClerkKeyKind {
  if (clerkSecret?.startsWith('sk_live_')) return 'production';
  if (clerkSecret?.startsWith('sk_test_')) return 'development';
  return 'unknown';
}

export function clerkKeyPairAligned(): boolean {
  const pkKind = getClerkPublishableKeyKind();
  const skKind = getClerkSecretKeyKind();
  if (pkKind === 'unknown' || skKind === 'unknown') return false;
  return pkKind === skKind;
}

export const FORGENIQ_RI_STAGING_SUPABASE_PROJECT_REF = 'lhgzdicffkhaaykzthep';

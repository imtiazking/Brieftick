/**
 * Validates Supabase service role key shape (no secret values logged).
 */

export type SupabaseServiceRoleKeyStatus =
  | 'ok'
  | 'missing'
  | 'not_jwt'
  | 'wrong_role'
  | 'project_ref_mismatch';

export function decodeSupabaseJwtPayload(token: string): { ref?: string; role?: string } | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    try {
      return JSON.parse(Buffer.from(part, 'base64').toString('utf8'));
    } catch {
      return null;
    }
  }
}

export function assessSupabaseServiceRoleKey(
  serviceKey: string | undefined,
  projectRef: string | null,
): SupabaseServiceRoleKeyStatus {
  const key = serviceKey?.trim();
  if (!key) return 'missing';
  if (!key.startsWith('eyJ') || key.split('.').length !== 3) return 'not_jwt';
  const payload = decodeSupabaseJwtPayload(key);
  if (!payload?.role) return 'not_jwt';
  if (payload.role !== 'service_role') return 'wrong_role';
  if (projectRef && payload.ref && payload.ref !== projectRef) return 'project_ref_mismatch';
  return 'ok';
}

export function isSupabaseServiceRoleKeyUsable(
  serviceKey: string | undefined,
  projectRef: string | null,
): boolean {
  return assessSupabaseServiceRoleKey(serviceKey, projectRef) === 'ok';
}

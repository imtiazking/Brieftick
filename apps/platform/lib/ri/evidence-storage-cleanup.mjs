/** Compensating storage cleanup — shared with acceptance tests (no server-only). */

export const EVIDENCE_UPLOAD_CLEANUP_FAILED = 'EVIDENCE_UPLOAD_CLEANUP_FAILED';

export const TENANT_EVIDENCE_BUCKET = 'ri-tenant-evidence';

export async function removeTenantEvidenceStorageObject(supabase, storagePath, context) {
  const { error } = await supabase.storage.from(TENANT_EVIDENCE_BUCKET).remove([storagePath]);
  if (error) {
    console.error(`[${EVIDENCE_UPLOAD_CLEANUP_FAILED}]`, {
      storagePath,
      ...context,
      message: error.message,
    });
    return false;
  }
  return true;
}

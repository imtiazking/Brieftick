/**
 * Pure contract checks for tenant evidence storage (no Supabase).
 */
export const TENANT_EVIDENCE_BUCKET = 'ri-tenant-evidence';
export const TENANT_EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED = new Set(['application/pdf', 'text/plain', 'image/png', 'image/jpeg']);

export function sanitizeEvidenceFilename(name) {
  const base = String(name || '').replace(/[/\\]/g, '_').replace(/\.\./g, '_').trim() || 'evidence.bin';
  return base.slice(0, 180);
}

export function tenantEvidenceObjectPath(organisationId, evidenceId, versionNumber, filename) {
  return `${organisationId}/${evidenceId}/v${versionNumber}/${sanitizeEvidenceFilename(filename)}`;
}

export function assertTenantEvidencePathForOrganisation(storagePath, organisationId) {
  const prefix = `${organisationId}/`;
  if (!String(storagePath).startsWith(prefix)) {
    throw new Error('evidence_storage_cross_tenant');
  }
}

export function validateTenantEvidenceUpload({ contentType, byteSize }) {
  if (!ALLOWED.has(contentType)) throw new Error('evidence_invalid_content_type');
  if (byteSize <= 0 || byteSize > TENANT_EVIDENCE_MAX_BYTES) throw new Error('evidence_invalid_size');
}

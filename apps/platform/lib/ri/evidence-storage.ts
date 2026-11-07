import 'server-only';

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';
import { recordWorkflowEvent } from '@/lib/ri/workflow-events';
import {
  EVIDENCE_UPLOAD_CLEANUP_FAILED,
  removeTenantEvidenceStorageObject,
  TENANT_EVIDENCE_BUCKET as TENANT_EVIDENCE_BUCKET_IMPORTED,
} from '@/lib/ri/evidence-storage-cleanup.mjs';

export const TENANT_EVIDENCE_BUCKET = TENANT_EVIDENCE_BUCKET_IMPORTED;
export { EVIDENCE_UPLOAD_CLEANUP_FAILED, removeTenantEvidenceStorageObject };
export const TENANT_EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_CONTENT_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'image/png',
  'image/jpeg',
]);

export function sanitizeEvidenceFilename(name: string): string {
  const base = name.replace(/[/\\]/g, '_').replace(/\.\./g, '_').trim() || 'evidence.bin';
  return base.slice(0, 180);
}

export function tenantEvidenceObjectPath(
  organisationId: string,
  evidenceId: string,
  versionNumber: number,
  filename: string,
): string {
  return `${organisationId}/${evidenceId}/v${versionNumber}/${sanitizeEvidenceFilename(filename)}`;
}

export function assertTenantEvidencePathForOrganisation(storagePath: string, organisationId: string): void {
  const prefix = `${organisationId}/`;
  if (!storagePath.startsWith(prefix)) {
    throw new Error('evidence_storage_cross_tenant');
  }
}

export function validateTenantEvidenceUpload(params: {
  contentType: string;
  byteSize: number;
}): void {
  if (!ALLOWED_CONTENT_TYPES.has(params.contentType)) {
    throw new Error('evidence_invalid_content_type');
  }
  if (params.byteSize <= 0 || params.byteSize > TENANT_EVIDENCE_MAX_BYTES) {
    throw new Error('evidence_invalid_size');
  }
}

export function hashEvidenceBytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function getNextEvidenceVersionNumber(
  supabase: SupabaseClient,
  organisationId: string,
  evidenceId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('evidence_versions')
    .select('version_number')
    .eq('organisation_id', organisationId)
    .eq('evidence_id', evidenceId)
    .order('version_number', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const current = data?.[0]?.version_number;
  return typeof current === 'number' ? current + 1 : 1;
}

async function assertNotDuplicateContent(
  supabase: SupabaseClient,
  organisationId: string,
  evidenceId: string,
  sourceHash: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('evidence_versions')
    .select('source_hash')
    .eq('organisation_id', organisationId)
    .eq('evidence_id', evidenceId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data?.source_hash === sourceHash) {
    throw new Error('evidence_duplicate_content');
  }
}

export async function uploadTenantEvidenceVersion(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    evidenceId: string;
    userId: string;
    filename: string;
    contentType: string;
    bytes: Buffer;
  },
) {
  await assertRowInOrganisation(supabase, 'evidence_items', params.evidenceId, params.organisationId);
  validateTenantEvidenceUpload({ contentType: params.contentType, byteSize: params.bytes.length });
  const sourceHash = hashEvidenceBytes(params.bytes);
  await assertNotDuplicateContent(supabase, params.organisationId, params.evidenceId, sourceHash);

  const versionNumber = await getNextEvidenceVersionNumber(
    supabase,
    params.organisationId,
    params.evidenceId,
  );
  const storagePath = tenantEvidenceObjectPath(
    params.organisationId,
    params.evidenceId,
    versionNumber,
    params.filename,
  );
  assertTenantEvidencePathForOrganisation(storagePath, params.organisationId);

  const cleanupContext = {
    organisationId: params.organisationId,
    evidenceId: params.evidenceId,
    versionNumber,
  };

  const { error: uploadError } = await supabase.storage
    .from(TENANT_EVIDENCE_BUCKET)
    .upload(storagePath, params.bytes, {
      contentType: params.contentType,
      upsert: false,
    });
  if (uploadError) throw new Error(uploadError.message);

  const { data: versionRow, error: versionError } = await supabase
    .from('evidence_versions')
    .insert({
      organisation_id: params.organisationId,
      evidence_id: params.evidenceId,
      version_number: versionNumber,
      storage_path: storagePath,
      content_type: params.contentType,
      byte_size: params.bytes.length,
      source_hash: sourceHash,
      uploaded_by: params.userId,
    })
    .select()
    .single();

  if (versionError) {
    await removeTenantEvidenceStorageObject(supabase, storagePath, {
      ...cleanupContext,
      phase: 'db_version_insert_failed',
    });
    throw new Error(versionError.message);
  }

  const { error: itemError } = await supabase
    .from('evidence_items')
    .update({
      storage_path: storagePath,
      source_hash: sourceHash,
      uploaded_by: params.userId,
    })
    .eq('id', params.evidenceId)
    .eq('organisation_id', params.organisationId);

  if (itemError) {
    await supabase
      .from('evidence_versions')
      .delete()
      .eq('id', versionRow.id)
      .eq('organisation_id', params.organisationId);
    await removeTenantEvidenceStorageObject(supabase, storagePath, {
      ...cleanupContext,
      phase: 'evidence_item_update_failed',
    });
    throw new Error(itemError.message);
  }

  try {
    await recordWorkflowEvent(supabase, {
      organisationId: params.organisationId,
      entityType: 'evidence_item',
      entityId: params.evidenceId,
      eventType: 'EVIDENCE_VERSION_UPLOADED',
      actorUserId: params.userId,
      fromStatus: String(versionNumber - 1 || 0),
      toStatus: String(versionNumber),
      metadata: { storage_path: storagePath, source_hash: sourceHash },
    });
  } catch (auditError) {
    console.error('[EVIDENCE_UPLOAD_AUDIT_FAILED]', {
      ...cleanupContext,
      message: auditError instanceof Error ? auditError.message : String(auditError),
    });
    throw auditError;
  }

  return versionRow;
}

export async function createTenantEvidenceDownloadUrl(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    evidenceId: string;
    expiresInSeconds?: number;
  },
): Promise<{ signedUrl: string; storagePath: string; expiresIn: number }> {
  await assertRowInOrganisation(supabase, 'evidence_items', params.evidenceId, params.organisationId);
  const { data: item, error } = await supabase
    .from('evidence_items')
    .select('storage_path')
    .eq('id', params.evidenceId)
    .eq('organisation_id', params.organisationId)
    .single();
  if (error) throw new Error(error.message);
  const storagePath = item.storage_path;
  if (!storagePath) throw new Error('evidence_no_file');
  assertTenantEvidencePathForOrganisation(storagePath, params.organisationId);

  const expiresIn = params.expiresInSeconds ?? 60;
  const { data: signed, error: signError } = await supabase.storage
    .from(TENANT_EVIDENCE_BUCKET)
    .createSignedUrl(storagePath, expiresIn);
  if (signError || !signed?.signedUrl) throw new Error(signError?.message || 'evidence_download_unavailable');
  return { signedUrl: signed.signedUrl, storagePath, expiresIn };
}

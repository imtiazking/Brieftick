import 'server-only';

import { AuthRequiredError } from '@/lib/auth/session';
import { OrganisationAccessError } from '@/lib/auth/require-organisation';
import { PlatformOperatorError } from '@/lib/auth/platform-operator';
import { NextResponse } from 'next/server';
import { RiConflictError, RiNotFoundError, RiValidationError } from '@/lib/ri/errors';

export function labApiErrorResponse(err: unknown): NextResponse {
  if (err instanceof AuthRequiredError) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  if (err instanceof PlatformOperatorError) {
    return NextResponse.json(
      { ok: false, error: 'forbidden', reason: 'platform_operator_required' },
      { status: 403 },
    );
  }
  if (err instanceof OrganisationAccessError) {
    if (err.message === 'insufficient_role') {
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    }
    const reason = err.message === 'organisation_required' ? undefined : err.message;
    return NextResponse.json(
      { ok: false, error: 'organisation_required', ...(reason ? { reason } : {}) },
      { status: 403 },
    );
  }
  if (err instanceof Error && err.message === 'insufficient_role') {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }
  if (err instanceof Error && err.message === 'ri_not_configured') {
    return NextResponse.json({ ok: false, error: 'service_unavailable' }, { status: 503 });
  }
  if (err instanceof RiValidationError) {
    return NextResponse.json({ ok: false, error: 'validation_error', detail: err.message }, { status: 400 });
  }
  if (err instanceof RiNotFoundError) {
    return NextResponse.json({ ok: false, error: err.message || 'not_found' }, { status: 404 });
  }
  if (err instanceof RiConflictError) {
    return NextResponse.json({ ok: false, error: err.message || 'conflict' }, { status: 409 });
  }
  if (err instanceof Error && err.message === 'stale_record') {
    return NextResponse.json({ ok: false, error: 'stale_record' }, { status: 409 });
  }
  if (err instanceof Error && err.message === 'connected_change_writes_disabled') {
    return NextResponse.json({ ok: false, error: 'connected_change_writes_disabled' }, { status: 403 });
  }
  if (err instanceof Error && err.message === 'connected_writes_disabled') {
    return NextResponse.json({ ok: false, error: 'connected_writes_disabled' }, { status: 403 });
  }
  if (err instanceof Error && err.message === 'authorised_uat_change_creation_disabled') {
    return NextResponse.json(
      { ok: false, error: 'authorised_uat_change_creation_disabled' },
      { status: 403 },
    );
  }
  if (err instanceof Error && err.message === 'obligation_provenance_unverified') {
    return NextResponse.json(
      { ok: false, error: 'obligation_provenance_unverified' },
      { status: 422 },
    );
  }
  if (err instanceof Error && err.message === 'risk_provenance_unverified') {
    return NextResponse.json({ ok: false, error: 'risk_provenance_unverified' }, { status: 422 });
  }
  if (err instanceof Error && err.message === 'control_provenance_unverified') {
    return NextResponse.json({ ok: false, error: 'control_provenance_unverified' }, { status: 422 });
  }
  if (err instanceof Error && err.message === 'evidence_provenance_unverified') {
    return NextResponse.json({ ok: false, error: 'evidence_provenance_unverified' }, { status: 422 });
  }
  if (err instanceof Error && err.message === 'creation_mode_parent_mismatch') {
    return NextResponse.json({ ok: false, error: 'creation_mode_parent_mismatch' }, { status: 422 });
  }
  if (err instanceof Error && err.message === 'provenance_link_mismatch') {
    return NextResponse.json({ ok: false, error: 'provenance_link_mismatch' }, { status: 422 });
  }
  if (err instanceof Error && err.message === 'provenance_locked') {
    return NextResponse.json({ ok: false, error: 'provenance_locked' }, { status: 403 });
  }
  if (err instanceof Error && err.message === 'client_provenance_rejected') {
    return NextResponse.json({ ok: false, error: 'client_provenance_rejected' }, { status: 400 });
  }
  if (err instanceof Error && err.message === 'not_found') {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  if (err instanceof Error && err.message === 'invalid_entity_type') {
    return NextResponse.json({ ok: false, error: 'invalid_entity_type' }, { status: 400 });
  }
  if (err instanceof Error && err.message === 'entity_type_required') {
    return NextResponse.json({ ok: false, error: 'entity_type_required' }, { status: 400 });
  }
  if (err instanceof Error && err.message === 'entity_id_required') {
    return NextResponse.json({ ok: false, error: 'entity_id_required' }, { status: 400 });
  }
  if (err instanceof Error && err.message === 'impact_locked') {
    return NextResponse.json({ ok: false, error: 'impact_locked' }, { status: 409 });
  }
  if (err instanceof Error && err.message === 'evidence_duplicate_content') {
    return NextResponse.json(
      {
        ok: false,
        error: 'evidence_duplicate_content',
        message: 'This file matches the latest uploaded version (duplicate content).',
      },
      { status: 409 },
    );
  }
  if (err instanceof Error && err.message === 'evidence_invalid_content_type') {
    return NextResponse.json({ ok: false, error: 'evidence_invalid_content_type' }, { status: 400 });
  }
  if (err instanceof Error && err.message === 'evidence_invalid_size') {
    return NextResponse.json({ ok: false, error: 'evidence_invalid_size' }, { status: 400 });
  }
  if (err instanceof Error && err.message === 'evidence_no_file') {
    return NextResponse.json({ ok: false, error: 'evidence_no_file' }, { status: 404 });
  }
  if (err instanceof Error && err.message === 'evidence_storage_cross_tenant') {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }
  if (err instanceof Error && err.message === 'missing_file') {
    return NextResponse.json({ ok: false, error: 'missing_file' }, { status: 400 });
  }
  if (err instanceof Error && err.message === 'segregation_of_duties') {
    return NextResponse.json(
      {
        ok: false,
        error: 'forbidden',
        reason: 'segregation_of_duties',
        message:
          'Segregation of duties check — this item requires approval by a different authorised reviewer.',
      },
      { status: 403 },
    );
  }
  if (process.env.NODE_ENV !== 'test') {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error('[ri-lab] internal_error', msg.slice(0, 240));
  }
  return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
}

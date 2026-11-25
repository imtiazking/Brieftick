import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildLockedChildMetadataFromParentRecord } from '@/lib/ri/lab-api/child-record-provenance';
import { LAB_PROVENANCE_LOCKED_KEY } from '@/lib/ri/lab-api/change-create-provenance';
import {
  classifyControlForLab,
  classifyRiskForLab,
  controlLabProvenanceInputFromRow,
  riskLabProvenanceInputFromRow,
} from '@/lib/ri/lab-api/risk-control-lab-provenance';
import { assertRowInOrganisation } from '@/lib/ri/db-guard';
import { RiConflictError } from '@/lib/ri/errors';
import { assertLabClassesCompatibleForLink, linkEvidenceControl } from '@/lib/ri/links';

export type AssuranceEvidenceBinding = {
  evidenceId: string;
  controlId: string;
  assuranceReviewId: string;
  testPhase: 'initial' | 'retest';
  boundAt: string;
  boundByUserId: string;
  controlLinkVerified: boolean;
};

const ASSURANCE_EVIDENCE_BINDINGS_KEY = 'assuranceEvidenceBindings';

export function mergeEvidenceBindings(
  meta: Record<string, unknown>,
  binding: AssuranceEvidenceBinding,
): AssuranceEvidenceBinding[] {
  const prior = Array.isArray(meta[ASSURANCE_EVIDENCE_BINDINGS_KEY])
    ? (meta[ASSURANCE_EVIDENCE_BINDINGS_KEY] as AssuranceEvidenceBinding[])
    : [];
  const next = prior.filter((b) => String(b.evidenceId) !== String(binding.evidenceId));
  next.push(binding);
  return next;
}

export async function bindEvidenceForAssuranceTest(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    userId: string;
    assuranceId: string;
    controlId: string;
    evidenceId: string;
    retest: boolean;
  },
): Promise<AssuranceEvidenceBinding> {
  await assertRowInOrganisation(supabase, 'evidence_items', params.evidenceId, params.organisationId);
  await assertRowInOrganisation(supabase, 'controls', params.controlId, params.organisationId);
  await assertRowInOrganisation(supabase, 'assurance_reviews', params.assuranceId, params.organisationId);

  const [{ data: evRow }, { data: ctrlRow }] = await Promise.all([
    supabase
      .from('evidence_items')
      .select('id, metadata')
      .eq('id', params.evidenceId)
      .eq('organisation_id', params.organisationId)
      .single(),
    supabase
      .from('controls')
      .select('id, metadata')
      .eq('id', params.controlId)
      .eq('organisation_id', params.organisationId)
      .single(),
  ]);
  if (!evRow || !ctrlRow) throw new Error('not_found');

  const { data: existingControlLink } = await supabase
    .from('evidence_control_links')
    .select('control_id')
    .eq('organisation_id', params.organisationId)
    .eq('evidence_id', params.evidenceId)
    .maybeSingle();
  if (
    existingControlLink?.control_id &&
    String(existingControlLink.control_id) !== String(params.controlId)
  ) {
    throw new RiConflictError('assurance_evidence_wrong_control');
  }

  const ctrlMeta = (ctrlRow.metadata || {}) as Record<string, unknown>;
  let evMeta = (evRow.metadata || {}) as Record<string, unknown>;
  const evClass = classifyRiskForLab(riskLabProvenanceInputFromRow(evRow));
  const ctrlClass = classifyControlForLab(controlLabProvenanceInputFromRow(ctrlRow));

  let compatible = true;
  try {
    assertLabClassesCompatibleForLink(evClass, ctrlClass);
  } catch {
    compatible = false;
  }

  if (!compatible) {
    if (evMeta[LAB_PROVENANCE_LOCKED_KEY] === true) {
      throw new RiConflictError('assurance_evidence_provenance_mismatch');
    }
    evMeta = buildLockedChildMetadataFromParentRecord({
      parentMetadata: ctrlMeta,
      actorUserId: params.userId,
      extras: {
        parentControlId: params.controlId,
        assuranceReviewId: params.assuranceId,
        assuranceEvidenceRole: params.retest ? 'retest' : 'initial_test',
      },
    });
    const { error: evUpdErr } = await supabase
      .from('evidence_items')
      .update({ metadata: evMeta })
      .eq('id', params.evidenceId)
      .eq('organisation_id', params.organisationId);
    if (evUpdErr) throw new Error(evUpdErr.message);
  }

  await linkEvidenceControl(
    supabase,
    params.organisationId,
    params.evidenceId,
    params.controlId,
    params.userId,
  );

  const { data: linkRow } = await supabase
    .from('evidence_control_links')
    .select('control_id')
    .eq('organisation_id', params.organisationId)
    .eq('evidence_id', params.evidenceId)
    .eq('control_id', params.controlId)
    .maybeSingle();
  if (!linkRow?.control_id) {
    throw new RiConflictError('assurance_evidence_control_link_required');
  }

  const binding: AssuranceEvidenceBinding = {
    evidenceId: params.evidenceId,
    controlId: params.controlId,
    assuranceReviewId: params.assuranceId,
    testPhase: params.retest ? 'retest' : 'initial',
    boundAt: new Date().toISOString(),
    boundByUserId: params.userId,
    controlLinkVerified: true,
  };

  const stamped = {
    ...evMeta,
    assuranceReviewId: params.assuranceId,
    assuranceEvidenceBinding: binding,
  };
  await supabase
    .from('evidence_items')
    .update({ metadata: stamped })
    .eq('id', params.evidenceId)
    .eq('organisation_id', params.organisationId);

  return binding;
}

export async function validateAssuranceEvidenceIntegrity(
  supabase: SupabaseClient,
  params: {
    organisationId: string;
    assuranceId: string;
    controlId: string | null;
    metadata: Record<string, unknown>;
  },
): Promise<string[]> {
  const gaps: string[] = [];
  if (!params.controlId) {
    gaps.push('assurance_control_link_missing');
    return gaps;
  }

  const { data: assuranceControlLink } = await supabase
    .from('assurance_review_control_links')
    .select('control_id')
    .eq('organisation_id', params.organisationId)
    .eq('assurance_review_id', params.assuranceId)
    .eq('control_id', params.controlId)
    .maybeSingle();
  if (!assuranceControlLink?.control_id) {
    gaps.push('mandatory_assurance_control_link_unresolved');
  }

  const deferred = params.metadata.deferredMandatoryLinks;
  if (Array.isArray(deferred) && deferred.length > 0) {
    gaps.push('mandatory_lifecycle_links_unresolved');
  }

  const evidenceIds = Array.isArray(params.metadata.assuranceEvidenceIds)
    ? params.metadata.assuranceEvidenceIds.map(String)
    : [];
  if (!evidenceIds.length) {
    gaps.push('missing_linked_evidence');
    return gaps;
  }

  const bindings = Array.isArray(params.metadata.assuranceEvidenceBindings)
    ? (params.metadata.assuranceEvidenceBindings as AssuranceEvidenceBinding[])
    : [];
  const bindingByEvidence = new Map(bindings.map((b) => [String(b.evidenceId), b]));

  for (const evidenceId of evidenceIds) {
    const { data: evRow } = await supabase
      .from('evidence_items')
      .select('id, organisation_id, metadata')
      .eq('id', evidenceId)
      .eq('organisation_id', params.organisationId)
      .maybeSingle();
    if (!evRow) {
      gaps.push('evidence_not_in_tenant');
      continue;
    }

    const { data: ecLink } = await supabase
      .from('evidence_control_links')
      .select('control_id')
      .eq('organisation_id', params.organisationId)
      .eq('evidence_id', evidenceId)
      .maybeSingle();
    if (!ecLink?.control_id || String(ecLink.control_id) !== String(params.controlId)) {
      gaps.push('evidence_not_linked_to_control_under_test');
    }

    const binding = bindingByEvidence.get(evidenceId);
    if (!binding || String(binding.assuranceReviewId) !== String(params.assuranceId)) {
      gaps.push('evidence_not_bound_to_assurance_review');
    } else if (String(binding.controlId) !== String(params.controlId)) {
      gaps.push('unrelated_evidence_wrong_control');
    } else if (binding.controlLinkVerified !== true) {
      gaps.push('evidence_control_link_unverified');
    }

    const evMeta = (evRow.metadata || {}) as Record<string, unknown>;
    if (evMeta.assuranceReviewId && String(evMeta.assuranceReviewId) !== String(params.assuranceId)) {
      gaps.push('evidence_bound_to_other_assurance');
    }
  }

  return [...new Set(gaps)];
}

export { ASSURANCE_EVIDENCE_BINDINGS_KEY };
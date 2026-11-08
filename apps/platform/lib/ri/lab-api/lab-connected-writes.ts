import 'server-only';

import type { PlatformRole } from '@/lib/roles';
import { canRi, type RiAction } from '@/lib/ri/permissions';

/**
 * Master gate for Design Lab connected mutations (default off).
 * Does not enable monitoring connectors, /commands, or production deploy.
 */
export function isLabConnectedWritesEnabled(): boolean {
  return process.env.RI_LAB_CONNECTED_WRITES_ENABLED === 'true';
}

/** @deprecated use isLabConnectedWritesEnabled */
export function isLabConnectedChangeWriteEnabled(): boolean {
  return isLabConnectedWritesEnabled();
}

function resolveLabWrite(role: PlatformRole, action: RiAction): boolean {
  return isLabConnectedWritesEnabled() && canRi(role, action);
}

export function resolveLabChangeWritesEnabled(role: PlatformRole): boolean {
  return resolveLabWrite(role, 'change:write');
}

export function resolveLabImpactWritesEnabled(role: PlatformRole): boolean {
  return resolveLabWrite(role, 'impact:write');
}

export function resolveLabObligationWritesEnabled(role: PlatformRole): boolean {
  return resolveLabWrite(role, 'obligation:write');
}

export function resolveLabRiskWritesEnabled(role: PlatformRole): boolean {
  return resolveLabWrite(role, 'risk:write');
}

export function resolveLabControlWritesEnabled(role: PlatformRole): boolean {
  return resolveLabWrite(role, 'control:write');
}

export function resolveLabEvidenceWritesEnabled(role: PlatformRole): boolean {
  return resolveLabWrite(role, 'evidence:write');
}

export function resolveLabFindingWritesEnabled(role: PlatformRole): boolean {
  return resolveLabWrite(role, 'finding:write');
}

export function resolveLabAssuranceWritesEnabled(role: PlatformRole): boolean {
  return resolveLabWrite(role, 'assurance:write');
}

export function resolveLabTriageWritesEnabled(role: PlatformRole): boolean {
  return resolveLabWrite(role, 'triage:write');
}

export function resolveLabPolicyWritesEnabled(role: PlatformRole): boolean {
  return resolveLabWrite(role, 'policy:write');
}

export function resolveLabActionWritesEnabled(role: PlatformRole): boolean {
  return resolveLabWrite(role, 'action:write');
}

export function resolveLabAiReviewWritesEnabled(role: PlatformRole): boolean {
  return resolveLabWrite(role, 'ai:review');
}

export function resolveLabApplicabilityWorkflowEnabled(role: PlatformRole): boolean {
  return resolveLabWrite(role, 'applicability:write') || resolveLabWrite(role, 'impact:approve');
}

export function resolveLabAnyConnectedWritesEnabled(role: PlatformRole): boolean {
  return (
    resolveLabChangeWritesEnabled(role) ||
    resolveLabImpactWritesEnabled(role) ||
    resolveLabObligationWritesEnabled(role) ||
    resolveLabRiskWritesEnabled(role) ||
    resolveLabControlWritesEnabled(role) ||
    resolveLabEvidenceWritesEnabled(role) ||
    resolveLabFindingWritesEnabled(role) ||
    resolveLabAssuranceWritesEnabled(role) ||
    resolveLabTriageWritesEnabled(role) ||
    resolveLabPolicyWritesEnabled(role) ||
    resolveLabActionWritesEnabled(role) ||
    resolveLabAiReviewWritesEnabled(role)
  );
}

export function assertLabConnectedWrite(role: PlatformRole, action: RiAction): void {
  if (!resolveLabWrite(role, action)) {
    throw new Error('connected_writes_disabled');
  }
}

export function assertLabChangeWritesEnabled(role: PlatformRole): void {
  assertLabConnectedWrite(role, 'change:write');
}

export function assertLabImpactWritesEnabled(role: PlatformRole): void {
  assertLabConnectedWrite(role, 'impact:write');
}

export function assertLabObligationWritesEnabled(role: PlatformRole): void {
  assertLabConnectedWrite(role, 'obligation:write');
}

export function assertLabRiskWritesEnabled(role: PlatformRole): void {
  assertLabConnectedWrite(role, 'risk:write');
}

export function assertLabControlWritesEnabled(role: PlatformRole): void {
  assertLabConnectedWrite(role, 'control:write');
}

export function assertLabEvidenceWritesEnabled(role: PlatformRole): void {
  assertLabConnectedWrite(role, 'evidence:write');
}

export function assertLabActionWritesEnabled(role: PlatformRole): void {
  assertLabConnectedWrite(role, 'action:write');
}

export function assertLabFindingWritesEnabled(role: PlatformRole): void {
  assertLabConnectedWrite(role, 'finding:write');
}

export function buildLabWriteCapabilities(role: PlatformRole) {
  return {
    changeManagement: resolveLabChangeWritesEnabled(role),
    impactAssessments: resolveLabImpactWritesEnabled(role),
    obligations: resolveLabObligationWritesEnabled(role),
    risks: resolveLabRiskWritesEnabled(role),
    controls: resolveLabControlWritesEnabled(role),
    evidence: resolveLabEvidenceWritesEnabled(role),
    findings: resolveLabFindingWritesEnabled(role),
    assurance: resolveLabAssuranceWritesEnabled(role),
    triage: resolveLabTriageWritesEnabled(role),
    applicabilityWorkflow: resolveLabApplicabilityWorkflowEnabled(role),
    policies: resolveLabPolicyWritesEnabled(role),
    actions: resolveLabActionWritesEnabled(role),
    aiReview: resolveLabAiReviewWritesEnabled(role),
  };
}

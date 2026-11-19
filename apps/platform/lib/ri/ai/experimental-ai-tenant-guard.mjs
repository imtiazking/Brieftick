/** Server + acceptance guard for experimental PDF AI tenants. */

export const AI_DEVELOPMENT_ORG_ID = 'b8f5e3a1-00ad-4000-8000-000000000001';
export const PARTNER_UAT_ORG_ID = '4d871541-e0d4-4581-828d-72073f763f85';
export const ORG_A_OPERATIONAL_ID = 'cd25bb17-d575-4109-8432-4b63c75f9617';

const PDF_EXPERIMENTAL_USE_CASES = new Set(['UC-RI-005', 'UC-RI-002']);

/**
 * Server feature flag: publication→obligation automation (UC-RI-005 / PDF experimental AI).
 * Org allowlist only — not enabled globally via RI_AI_EXECUTION_ENABLED alone.
 */
export function isPublicationToObligationIntegrationEnabled(organisationId) {
  const id = organisationId?.trim();
  if (!id) return false;
  if (id === PARTNER_UAT_ORG_ID || id === ORG_A_OPERATIONAL_ID) return false;

  // Pilot: fixed AI Development org only — STAGING_AI_TECH_ORG_ID cannot widen the allowlist.
  const override = process.env.STAGING_AI_TECH_ORG_ID?.trim();
  if (override && override !== AI_DEVELOPMENT_ORG_ID) {
    return false;
  }
  return id === AI_DEVELOPMENT_ORG_ID;
}

export function assertExperimentalAiTenant(params) {
  if (params.organisationId === PARTNER_UAT_ORG_ID) {
    throw new Error('partner_uat_forbidden_for_experimental_ai');
  }

  if (!PDF_EXPERIMENTAL_USE_CASES.has(params.useCaseId)) {
    return;
  }

  if (params.organisationId === ORG_A_OPERATIONAL_ID) {
    throw new Error('org_a_forbidden_for_experimental_pdf_ai');
  }

  if (!isPublicationToObligationIntegrationEnabled(params.organisationId)) {
    throw new Error(`experimental_ai_wrong_organisation:${params.organisationId}`);
  }
}
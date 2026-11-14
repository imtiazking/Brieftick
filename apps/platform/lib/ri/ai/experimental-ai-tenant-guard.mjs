/** Server + acceptance guard for experimental PDF AI tenants. */

export const AI_DEVELOPMENT_ORG_ID = 'b8f5e3a1-00ad-4000-8000-000000000001';
export const PARTNER_UAT_ORG_ID = '4d871541-e0d4-4581-828d-72073f763f85';
export const ORG_A_OPERATIONAL_ID = 'cd25bb17-d575-4109-8432-4b63c75f9617';

const PDF_EXPERIMENTAL_USE_CASES = new Set(['UC-RI-005', 'UC-RI-002']);

export function assertExperimentalAiTenant(params) {
  const resolvedOrg = process.env.STAGING_AI_TECH_ORG_ID?.trim() || AI_DEVELOPMENT_ORG_ID;

  if (params.organisationId === PARTNER_UAT_ORG_ID) {
    throw new Error('partner_uat_forbidden_for_experimental_ai');
  }

  if (!PDF_EXPERIMENTAL_USE_CASES.has(params.useCaseId)) {
    return;
  }

  if (params.organisationId === ORG_A_OPERATIONAL_ID) {
    throw new Error('org_a_forbidden_for_experimental_pdf_ai');
  }

  if (params.organisationId !== resolvedOrg) {
    throw new Error(`experimental_ai_wrong_organisation:${params.organisationId}`);
  }
}
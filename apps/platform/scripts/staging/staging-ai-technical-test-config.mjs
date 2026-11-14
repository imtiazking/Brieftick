/**
 * Staging technical AI testing tenants.
 * Partner UAT is reserved for business acceptance — never experimental AI.
 */

import { ORG_A_ID, PARTNER_UAT_ORG_ID } from './partner-uat-seed-constants.mjs';

export const AI_DEV_ORG_ID = 'b8f5e3a1-00ad-4000-8000-000000000001';
export const AI_DEV_ORG_NAME = 'FORGENIQ AI Development';
export const AI_DEV_ORG_SLUG = 'forgeniq-ai-development';

/** Technical testers only — not Partner UAT personas. */
export const AI_DEV_TECHNICAL_MEMBERS = [
  {
    label: 'forgeniq-gmail-technical',
    clerkUserId: 'user_3LIQIZlXNWBFEvSKabAYIUhhNdi',
    role: 'COMPLIANCE_MANAGER',
    forbidPartnerOnlyUser: false,
  },
];

/** FG22/5 guidance workflow (obligationGradeSuitable=false). */
export const FG22_PDF_TECH = {
  publicationId: 'a761cacc-8742-493d-b200-eb5d9a3ab884',
  changeId: 'b8f5e3a1-00ad-4000-8000-000000000010',
  externalKey: 'UAT-AI-CHG-FG22-PDF',
  idempotencySuffix: 'UAT-AI-FG22-PDF-v1',
  seedBundle: 'UAT-AI-FG22-PDF',
};

/** Binding obligation-grade candidate (PS22/3 — verify catalogue on staging before live materialisation acceptance). */
export const BINDING_PDF_TECH_DEFAULT = {
  publicationId: null,
  note: 'Select indexed rules/ss with obligationGradeSuitable=true after catalogue audit',
};

/**
 * @returns {string}
 */
export function resolveAiTechnicalTestOrgId() {
  const fromEnv = process.env.STAGING_AI_TECH_ORG_ID?.trim();
  if (fromEnv) return fromEnv;
  return AI_DEV_ORG_ID;
}

export function assertLiveAiTechnicalOrgOnly(organisationId) {
  if (organisationId === PARTNER_UAT_ORG_ID) {
    throw new Error('partner_uat_forbidden_for_experimental_ai');
  }
  if (organisationId === ORG_A_ID) {
    throw new Error('org_a_forbidden_for_live_experimental_ai_use_ai_dev_org');
  }
  const allowed = resolveAiTechnicalTestOrgId();
  if (organisationId !== allowed) {
    throw new Error(`unauthorised_technical_ai_org:${organisationId}`);
  }
}

/** @deprecated use assertLiveAiTechnicalOrgOnly */
export function assertNotPartnerUatOrg(organisationId) {
  assertLiveAiTechnicalOrgOnly(organisationId);
}
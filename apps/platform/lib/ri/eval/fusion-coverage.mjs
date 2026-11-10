/**
 * Catalogue + tenant fusion checks against eval tenant fixture (synthetic only).
 */
import { createEvalTenantState } from './tenant-fixture-v1.mjs';

const FIXTURE_OBLIGATION_IDS = ['OBL-EVAL-OPEN-2', 'OBL-EVAL-DRAFT-1'];
const FIXTURE_CHANGE_IDS = ['CHG-EVAL-002'];

export function assessCatalogueTenantFusion(caseRow, engineResult) {
  const ideal = caseRow.expectedIdealResult || {};
  if (!ideal.requiresCatalogueAndTenantFusion && !caseRow.requiredAnswerThemes?.some((t) => /tenant/i.test(t))) {
    return {
      fusionRequired: false,
      catalogueEvidencePresent: null,
      tenantEvidencePresent: null,
      fusionSatisfied: null,
      details: [],
    };
  }

  const answer = String(engineResult?.answer || '');
  const execution = engineResult?.execution || {};
  const citations = engineResult?.citations || [];
  const expectedPubIds = caseRow.expectedPublicationIds || [];
  const citedPubIds = [...new Set(citations.map((c) => c.publicationId).filter(Boolean))];

  const catalogueEvidencePresent =
    expectedPubIds.length > 0
      ? expectedPubIds.every((id) => citedPubIds.includes(id))
      : citedPubIds.length > 0;

  const tenantSource =
    execution.evidenceSource === 'tenant_ri_records' ||
    (execution.evidenceSources || []).includes('tenant_ri_records');

  const tenantIdHit = FIXTURE_OBLIGATION_IDS.some((id) => answer.includes(id)) ||
    FIXTURE_CHANGE_IDS.some((id) => answer.includes(id)) ||
    /\bAssess financial crime guide consultation impact\b/i.test(answer) ||
    /\bOBL-EVAL-/i.test(answer);

  const tenantEvidencePresent = tenantSource || tenantIdHit;

  const fusionSatisfied = catalogueEvidencePresent && tenantEvidencePresent;

  return {
    fusionRequired: true,
    catalogueEvidencePresent,
    tenantEvidencePresent,
    fusionSatisfied,
    fixtureReference: {
      obligationIds: FIXTURE_OBLIGATION_IDS,
      changeIds: FIXTURE_CHANGE_IDS,
    },
    details: [
      `citedPublicationIds:${citedPubIds.join(',') || 'none'}`,
      `executionEvidenceSource:${execution.evidenceSource || 'none'}`,
    ],
  };
}

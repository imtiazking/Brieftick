/**
 * Maps UC-RI-004 Impact Suggestion output plus obligation context into impact assessment draft fields.
 * Pure / offline-safe (no provider calls).
 */

const HUMAN_CONFIRM = 'Requires human confirmation — not verified organisational fact.';

/**
 * @param {{
 *   structured: Record<string, unknown> | null | undefined;
 *   obligationStatement?: string | null;
 *   obligationCitation?: string | null;
 *   changeTitle?: string | null;
 *   evidencePack?: any;
 * }} input
 */
export function mapImpactSuggestionToDraftFields(input) {
  const structured = input.structured && typeof input.structured === 'object' ? input.structured : {};
  const dimensions = Array.isArray(structured.dimensions)
    ? structured.dimensions.map((d) => String(d).trim()).filter(Boolean)
    : [];
  const claims = Array.isArray(structured.claims) ? structured.claims : [];
  const confidence = Number(structured.confidence ?? 0);

  const statement = (input.obligationStatement || '').trim() || 'Approved regulatory obligation';
  const cite = (input.obligationCitation || '').trim();
  const changeTitle = (input.changeTitle || '').trim();

  const evidenceLines = claims
    .slice(0, 8)
    .map((c, i) => {
      const text = String(c?.text || c?.summary || '').slice(0, 500);
      const refs = Array.isArray(c?.sourceSectionIds) ? c.sourceSectionIds.join(', ') : '';
      return `${i + 1}. ${text || 'Suggested impact area'}${refs ? ` [sections: ${refs}]` : ''}`;
    });

  const pack = input.evidencePack && typeof input.evidencePack === 'object' ? input.evidencePack : null;
  const sourceLine = pack?.provision?.reference
    ? ` Regulatory source: ${pack.provision.reference}${pack.source?.legalBasis ? ` (${String(pack.source.legalBasis).slice(0, 300)})` : ''}` +
      `${pack.quotation?.page ? `, PDF p.${pack.quotation.page}` : ''}` +
      `${pack.quotation?.text ? `; ${pack.quotation.verified ? 'verified' : 'unverified'} quotation: "${String(pack.quotation.text).slice(0, 500)}"` : ''}.` +
      ` Effective date: ${pack.effective?.date ? `${pack.effective.date} (${pack.effective.source})` : 'not verified — none asserted'}.`
    : '';
  const regulatory =
    `Regulatory impact (draft, AI-assisted): obligation approval on "${statement.slice(0, 240)}"` +
    `${cite ? ` (${cite})` : ''}.${sourceLine} ${HUMAN_CONFIRM}`;
  const business =
    dimensions.includes('Operations') || dimensions.includes('Business')
      ? `Operations / business impact areas flagged: ${dimensions.join(', ')}. ${HUMAN_CONFIRM}`
      : `Business operations may require process and control updates aligned to: ${statement.slice(0, 200)}. ${HUMAN_CONFIRM}`;
  const technology = `Technology and systems: review interfaces, data flows and monitoring tied to change "${changeTitle || 'regulatory change'}". ${HUMAN_CONFIRM}`;
  const compliance = `Compliance: traceable to approved obligation register entry. Confidence ${confidence}%. ${HUMAN_CONFIRM}`;
  const financial = `Financial / resource: estimate implementation effort after owner review. ${HUMAN_CONFIRM}`;
  const complexity =
    dimensions.length > 2
      ? 'HIGH'
      : dimensions.length === 2
        ? 'MEDIUM'
        : 'LOW';

  const uncertainties = [
    'Organisation-specific facts were not asserted by AI.',
    'Implementation deadlines depend on regulatory effective dates and internal planning.',
    evidenceLines.length ? null : 'No structured evidence claims returned — expand assessment manually.',
    confidence < 70 ? 'Low model confidence — mandatory human review before submit.' : null,
    ...((pack?.uncertainties ?? []).slice(0, 6)),
  ].filter(Boolean);

  return {
    business_impact: business,
    operational_impact: business,
    technology_impact: technology,
    compliance_impact: regulatory,
    financial_impact: financial,
    implementation_complexity: complexity,
    materiality: confidence >= 85 ? 'HIGH' : confidence >= 70 ? 'MEDIUM' : 'LOW',
    business_areas: dimensions.length ? dimensions : ['Compliance', 'Operations'],
    stage2Metadata: {
      aiUseCaseId: 'UC-RI-004',
      aiConfidence: confidence,
      aiEvidenceClaims: evidenceLines,
      aiAssumptions: [
        'Assessment draft is generated from obligation text and publication grounding only.',
        'No live organisational inventory was consulted.',
      ],
      humanConfirmationRequired: uncertainties,
      processingStatus: 'DRAFT_AI_SUGGESTION',
    },
  };
}
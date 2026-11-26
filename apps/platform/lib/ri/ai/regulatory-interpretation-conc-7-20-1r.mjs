/**
 * Deterministic regulatory interpretation memo for CONC 7.20.1R (FCA PS26/1 / FCA 2026/2).
 * Separates explicit Handbook requirements from interpretative recommendations and escalations.
 * No paid AI. Sources: official fixture PDF and derived legal/breakdown artefacts only.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePdfPhysicalPages } from '../../../../../integrations/regulatory-sources/core/pdf-physical-page-parser.mjs';
import { analyzeInstrumentLegalStatus } from '../../../../../integrations/regulatory-sources/core/instrument-legal-status.mjs';
import { legalRecordForProvision } from './provision-legal-status.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../../..');
export const CONC_7_20_1R_CORE = '7.20.1R';
export const INTERPRETATION_VERSION = 'conc-7-20-1r-interpretation-v1';

function scanTemporaryPermissionFirms(pages) {
  const hits = [];
  for (const p of pages) {
    const t = String(p.text ?? '');
    if (!/temporary permission/i.test(t)) continue;
    const snippet = t
      .split(/\n+/)
      .find((line) => /temporary permission/i.test(line))
      ?.trim()
      ?.slice(0, 240);
    if (snippet) hits.push({ page: p.pageNumber, quotation: snippet });
  }
  return { mentionsFound: hits.length > 0, mentions: hits.slice(0, 8) };
}

/**
 * @param {{ pdfPath?: string, pages?: Array<{ pageNumber: number, text: string }> }} [opts]
 */
export async function buildConc7201rInterpretationMemo(opts = {}) {
  const pdfPath = opts.pdfPath ?? resolve(repoRoot, 'integrations/regulatory-sources/fixtures/fca-ps26-1-official.pdf');
  const parsed = opts.pages
    ? { pages: opts.pages }
    : await parsePdfPhysicalPages(readFileSync(pdfPath));
  const pages = parsed.pages.map((p) => ({ pageNumber: p.pageNumber, text: p.text }));
  const instrument = analyzeInstrumentLegalStatus(pages);
  const legal = legalRecordForProvision({ pages, provisionReference: 'CONC 7.20.1R' });
  const breakdown = legal.breakdown;
  const tp = scanTemporaryPermissionFirms(pages);

  const explicitRequirements = [
    {
      id: 'applicability_missed_payment',
      reference: 'CONC 7.20.1R(1)',
      type: 'explicit_requirement',
      text: breakdown?.limbs?.find((l) => l.reference === 'CONC 7.20.1R(1)')?.text ?? null,
      note: 'Condition precedent: rule applies only where a borrower has a missed payment under a regulated deferred payment credit agreement.',
    },
    {
      id: 'notify_borrower',
      reference: 'CONC 7.20.1R(2)(a)',
      type: 'explicit_requirement',
      text: 'Notify the borrower that the missed payment occurred and about unpaid sums (including non-compliance charges).',
      parentTiming: 'As soon as possible after a missed payment has occurred (CONC 7.20.1R(2)).',
    },
    {
      id: 'sufficient_information',
      reference: 'CONC 7.20.1R(2)(b)',
      type: 'explicit_requirement',
      text: 'Provide the borrower with sufficient information to understand the agreement, adverse consequences (actual and likely), and mitigation steps where relevant.',
      parentTiming: 'As soon as possible after a missed payment has occurred (CONC 7.20.1R(2)).',
    },
    {
      id: 'information_together',
      reference: 'CONC 7.20.1R(3)',
      type: 'explicit_requirement',
      text: 'The information required under (2) must be provided together.',
    },
    {
      id: 'payment_definition',
      reference: 'CONC 7.20.1R(4)',
      type: 'explicit_requirement',
      text: breakdown?.limbs?.find((l) => l.reference === 'CONC 7.20.1R(4)')?.text ?? null,
      note: 'Definition limb — not a standalone operational obligation.',
    },
  ];

  const interpretativeTopics = [
    {
      id: 'timing_as_soon_as_possible',
      reference: 'CONC 7.20.1R(2)',
      topic: 'As soon as possible',
      regulatoryText: 'As soon as possible after a missed payment has occurred the firm must:',
      classification: 'interpretative_recommendation_only',
      explicitDeadlineInSource: false,
      platformStance:
        'Do not invent a day-count SLA. Record the statutory wording and escalate timing standards to compliance/legal expert review.',
      escalationRequired: true,
    },
    {
      id: 'sufficiency_standard',
      reference: 'CONC 7.20.1R(2)(b)',
      topic: 'Sufficient information',
      regulatoryText: '…provide the borrower with sufficient information for the borrower to understand…',
      classification: 'interpretative_recommendation_only',
      explicitThresholdInSource: false,
      platformStance: 'Outcome-based standard. Firm must judge sufficiency per case; expert review on defensible content and channel.',
      escalationRequired: true,
    },
    {
      id: 'adverse_consequences',
      reference: 'CONC 7.20.1R(2)(b)(ii)–(iii)',
      topic: 'Adverse consequences',
      regulatoryText: 'Any adverse consequences arising … and any that the firm considers are likely to arise…',
      classification: 'interpretative_recommendation_only',
      platformStance: 'Rule does not enumerate consequences. Escalate which consequences must be disclosed (charges, credit reporting, enforcement, etc.).',
      escalationRequired: true,
    },
    {
      id: 'firm_likelihood_judgement',
      reference: 'CONC 7.20.1R(2)(b)(iii)',
      topic: 'Likelihood assessment',
      regulatoryText: '…adverse consequences … that the firm considers are likely to arise…',
      classification: 'interpretative_recommendation_only',
      platformStance: 'Requires firm judgement and evidence of that judgement. Escalate governance for documenting "likely" consequences.',
      escalationRequired: true,
    },
    {
      id: 'conditional_relevance',
      reference: 'CONC 7.20.1R(2)(b)(iv)',
      topic: 'Relevant mitigation measures',
      regulatoryText: '(where relevant) any steps the borrower can take to mitigate those adverse consequences.',
      classification: 'interpretative_recommendation_only',
      platformStance: 'Firm decides when mitigation is relevant. No invented list of steps.',
      escalationRequired: true,
    },
    {
      id: 'transitional_provisions',
      reference: 'CONC 7.20.1R',
      topic: 'Transitional provisions',
      regulatoryText: legal.transitional?.note ?? null,
      classification: legal.transitional?.provisionSpecificTransitionalFound ? 'mixed_explicit_and_interpretive' : 'interpretative_recommendation_only',
      provisionSpecificTransitionalFound: Boolean(legal.transitional?.provisionSpecificTransitionalFound),
      platformStance:
        'Commencement for the rule is traced to instrument clause H (15 July 2026) unless superseded by transitional material. Text search found no provision-specific transitional reference; expert confirmation still required for in-flight agreements.',
      escalationRequired: true,
    },
    {
      id: 'temporary_permission_firms',
      reference: 'CONC 7.20.1R',
      topic: 'Applicability to temporary-permission firms',
      regulatoryText: tp.mentions[0]?.quotation ?? null,
      classification: 'interpretative_recommendation_only',
      temporaryPermissionMentionsInPublication: tp.mentionsFound,
      platformStance:
        'Handbook applicability for temporary-permission firms is not determined by this engine. Escalate to regulatory expert with firm permission status.',
      escalationRequired: true,
    },
  ];

  const escalations = interpretativeTopics.filter((t) => t.escalationRequired).map((t) => ({
    topicId: t.id,
    reference: t.reference,
    question: t.topic,
    reason: t.platformStance,
  }));

  return {
    version: INTERPRETATION_VERSION,
    provision: 'CONC 7.20.1R',
    sources: {
      publication: 'FCA PS26/1 (fixture)',
      instrument: instrument.instrumentNumber ?? 'FCA 2026/2',
      instrumentStatus: instrument.status,
      fixturePdf: 'integrations/regulatory-sources/fixtures/fca-ps26-1-official.pdf',
    },
    commencement: legal.commencement,
    explicitRequirements,
    interpretativeTopics,
    escalationsForExpertReview: escalations,
    prohibitions: [
      'Do not invent calendar deadlines for "as soon as possible".',
      'Do not invent numeric sufficiency thresholds for borrower information.',
      'Do not treat interpretative recommendations as binding FCA deadlines.',
    ],
  };
}
/**
 * Provision-level legal status for grounding: commencement traced to the instrument's own commencement clauses,
 * transitional-reference scan and limb breakdowns. Everything here is derived from the publication PDF text;
 * a missing or ambiguous source yields an explicit `unresolved` entry, never a guessed date.
 */
import {
  analyzeInstrumentLegalStatus,
  resolveProvisionCommencement,
  scanTransitionalReferences,
} from '../../../../../integrations/regulatory-sources/core/instrument-legal-status.mjs';
import { breakDownProvision, extractProvisionText } from './provision-breakdown.mjs';

export const PROVISION_LEGAL_STATUS_VERSION = 'provision-legal-status-v1';

export const PROVISION_LEGAL_STATUS = Object.freeze({
  FINAL_MADE_RULE: 'final_made_rule',
  PROPOSED_DRAFT: 'proposed_in_draft_instrument',
  PROPOSED_CONSULTATION: 'proposed_in_consultation',
  FINAL_GUIDANCE: 'final_guidance',
  UNVERIFIED: 'unverified',
});

function compact(resolution) {
  if (resolution.status !== 'resolved') return { status: 'unresolved', reason: resolution.reason ?? 'unresolved' };
  return {
    status: 'resolved',
    commencementDate: resolution.commencementDate,
    dateText: resolution.dateText,
    basis: resolution.basis,
    clause: resolution.clause ?? null,
    part: resolution.part ?? null,
    annex: resolution.annex,
    instrument: resolution.instrument,
    evidence: resolution.evidence,
  };
}

/**
 * @param {{
 *   pages: Array<{ pageNumber: number, text: string }>,
 *   instrument?: ReturnType<typeof analyzeInstrumentLegalStatus>,
 *   provisionPageIndex: Record<string, number[]>,
 *   breakdownCores?: string[],
 *   sourcebook?: string,
 * }} input
 */
export function buildProvisionLegalContext(input) {
  const pages = input.pages || [];
  const instrument = input.instrument ?? analyzeInstrumentLegalStatus(pages);
  const index = input.provisionPageIndex || {};
  const commencement = {};
  const legalStatus = {};
  for (const [core, corePages] of Object.entries(index)) {
    const first = Math.min(...corePages);
    const resolution = resolveProvisionCommencement(instrument, { page: first, provisionReference: core });
    commencement[core] = { ...compact(resolution), provisionPages: corePages };
    legalStatus[core] =
      instrument.status === 'made'
        ? /G$/.test(core) ? PROVISION_LEGAL_STATUS.FINAL_GUIDANCE : PROVISION_LEGAL_STATUS.FINAL_MADE_RULE
        : instrument.status === 'draft'
          ? PROVISION_LEGAL_STATUS.PROPOSED_DRAFT
          : PROVISION_LEGAL_STATUS.UNVERIFIED;
  }
  const breakdowns = {};
  const transitional = {};
  for (const core of input.breakdownCores || []) {
    if (!/R$/.test(core) && !/E$/.test(core)) continue;
    const corePages = index[core];
    const scope = corePages?.length ? pages.filter((p) => p.pageNumber >= Math.min(...corePages) && p.pageNumber <= Math.max(...corePages) + 1) : pages;
    const ex = extractProvisionText(scope, core);
    if (ex) breakdowns[core] = breakDownProvision(core, ex.text, { sourcebook: input.sourcebook ?? 'CONC', pages: ex.pages });
    transitional[core] = scanTransitionalReferences(pages, instrument, core);
  }
  return {
    version: PROVISION_LEGAL_STATUS_VERSION,
    instrument: {
      status: instrument.status,
      title: instrument.title ?? null,
      number: instrument.instrumentNumber ?? null,
      madeDate: instrument.madeDate ?? null,
      instrumentStartPage: instrument.instrumentStartPage ?? null,
      commencementClauses: (instrument.commencementClauses || []).map((c) => ({ clause: c.clause, scope: c.scope, annex: c.annex, part: c.part, commencementDate: c.commencementDate, page: c.page, quotation: c.quotation })),
      moduleAnnexMap: instrument.moduleAnnexMap ?? {},
    },
    commencement,
    legalStatus,
    breakdowns,
    transitional,
  };
}

/**
 * Legal record for one provision located directly in the publication page text (used when an obligation is
 * materialised): commencement trace, limb breakdown and transitional scan. Nothing is returned for a provision
 * that cannot be found as set out in the instrument.
 * @param {{ pages: Array<{ pageNumber: number, text: string }>, provisionReference: string }} input
 */
export function legalRecordForProvision(input) {
  const pages = input.pages || [];
  const ref = String(input.provisionReference || '').replace(/\s+/g, ' ').trim();
  const m = /^([A-Z]{2,8})?\s*(\d+[A-Z]?(?:\.\d+[A-Z]?)+)\s*([RGE])$/.exec(ref);
  if (!m) return { status: 'unresolved', reason: 'provision_reference_unparseable' };
  const sourcebook = m[1] || 'CONC';
  const core = `${m[2]}${m[3]}`;
  const instrument = analyzeInstrumentLegalStatus(pages);
  const ex = extractProvisionText(
    pages.filter((p) => !instrument.instrumentStartPage || p.pageNumber > instrument.instrumentStartPage),
    core,
  );
  if (!ex) return { status: 'unresolved', reason: 'provision_not_set_out_in_instrument', instrumentStatus: instrument.status };
  const resolution = resolveProvisionCommencement(instrument, { page: ex.pages[0], provisionReference: ref });
  return {
    status: resolution.status === 'resolved' ? 'resolved' : 'unresolved',
    version: PROVISION_LEGAL_STATUS_VERSION,
    provisionReference: ref,
    core,
    instrumentStatus: instrument.status,
    instrument: { title: instrument.title ?? null, number: instrument.instrumentNumber ?? null, madeDate: instrument.madeDate ?? null },
    commencement: compact(resolution),
    provisionPages: ex.pages,
    breakdown: breakDownProvision(core, ex.text, { sourcebook, pages: ex.pages }),
    transitional: scanTransitionalReferences(pages, instrument, core),
  };
}

/** Effective date a human or model may see: only a resolved commencement; anything else is null with a reason. */
export function verifiedEffectiveDate(provisionLegalContext, core) {
  const c = provisionLegalContext?.commencement?.[core];
  if (c?.status === 'resolved' && /^\d{4}-\d{2}-\d{2}$/.test(String(c.commencementDate))) {
    return { date: c.commencementDate, source: 'instrument_commencement', basis: c.basis, evidence: c.evidence };
  }
  return { date: null, source: 'unverified', reason: c?.reason ?? 'provision_not_traced_to_instrument' };
}

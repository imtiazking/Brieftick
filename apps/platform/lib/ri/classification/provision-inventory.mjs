/**
 * Deterministic instrument provision inventory — independent of AI (RI provision engine).
 */
import {
  PROVISION_MARKERS,
  analyseInstrumentProvisionText,
  buildProvisionPagesIndex,
  detectLegalInstrumentStartPage,
  mergeInstrumentBlocksByPage,
  parseProvisionReference,
  provisionMarkersInText,
} from './provision-eligibility.mjs';

export const PROVISION_TRACKING_STATUS = Object.freeze({
  IDENTIFIED: 'identified',
  SUPPLIED: 'supplied_for_analysis',
  ANALYSED: 'analysed',
  FINDING: 'finding_generated',
  NO_OBLIGATION: 'no_obligation_identified',
  EXCEPTION: 'exception',
  UNRESOLVED: 'unresolved',
});

/**
 * @param {Array<{ pageNumber?: number, extractedText?: string, documentEvidenceId?: string }>} blocks
 * @param {number | null} [instrumentStartPage]
 */
export function buildInstrumentProvisionInventory(blocks, instrumentStartPage = null) {
  const start = Number.isInteger(instrumentStartPage) ? instrumentStartPage : detectLegalInstrumentStartPage(blocks);
  if (!Number.isInteger(start)) {
    return { instrumentStartPage: null, provisions: [], byCore: new Map(), crossReferences: [] };
  }
  const index = buildProvisionPagesIndex(blocks, start);
  const textStatus = analyseInstrumentProvisionText(blocks, start);
  const byPage = mergeInstrumentBlocksByPage(blocks, start);
  const cores = new Set();
  for (const b of blocks || []) {
    if (!Number.isInteger(b.pageNumber) || b.pageNumber < start) continue;
    for (const m of provisionMarkersInText(b.extractedText)) {
      if (m.setOut) cores.add(m.core);
    }
  }
  const crossReferences = [];
  for (const [pageNum, text] of byPage) {
    for (const m of provisionMarkersInText(text)) {
      if (!m.setOut && m.sourcebook) {
        crossReferences.push({ core: m.core, pageNumber: pageNum, sourcebook: m.sourcebook });
      }
    }
  }
  const provisions = [];
  for (const core of [...cores].sort()) {
    const entry = index.get(core);
    const pages = entry ? [...entry.pages].sort((a, b) => a - b) : [];
    const marker = core.replace(/^.*(\d)$/, (_, c) => c) || core.slice(-1);
    const statusByPage = entry?.status || {};
    provisions.push({
      core,
      marker: PROVISION_MARKERS.includes(marker) ? marker : core.match(/(R|E|G|D|P|C|UK|EU)$/)?.[1] || null,
      pages,
      textStatusByPage: statusByPage,
      trackingStatus: PROVISION_TRACKING_STATUS.IDENTIFIED,
      suppliedInBatch: null,
      findingIds: [],
      extractionOutcome: null,
    });
  }
  const byCore = new Map(provisions.map((p) => [p.core, p]));
  return { instrumentStartPage: start, provisions, byCore, crossReferences };
}

/**
 * @param {ReturnType<typeof buildInstrumentProvisionInventory>} inventory
 * @param {string[]} suppliedCores batch newly supplied
 * @param {number | null} batchIndex
 */
export function markProvisionsSuppliedForAnalysis(inventory, suppliedCores, batchIndex = null) {
  for (const core of suppliedCores || []) {
    const row = inventory.byCore.get(core);
    if (!row) continue;
    if (row.trackingStatus === PROVISION_TRACKING_STATUS.FINDING) continue;
    row.trackingStatus = PROVISION_TRACKING_STATUS.SUPPLIED;
    row.suppliedInBatch = batchIndex;
  }
}

/**
 * @param {ReturnType<typeof buildInstrumentProvisionInventory>} inventory
 * @param {{ provisionCore?: string, provisionReference?: string, findingId?: string }[]} findings
 */
export function reconcileFindingsWithProvisionInventory(inventory, findings) {
  const cited = new Set();
  for (const f of findings || []) {
    const ref = f.provisionReference ? parseProvisionReference(f.provisionReference) : null;
    const core = f.provisionCore || ref?.core;
    if (!core) continue;
    cited.add(core);
    const row = inventory.byCore.get(core);
    if (!row) continue;
    row.trackingStatus = PROVISION_TRACKING_STATUS.FINDING;
    if (f.findingId) row.findingIds.push(f.findingId);
  }
  for (const row of inventory.provisions) {
    if (row.trackingStatus === PROVISION_TRACKING_STATUS.SUPPLIED && !cited.has(row.core)) {
      row.trackingStatus = PROVISION_TRACKING_STATUS.NO_OBLIGATION;
      row.extractionOutcome = 'no_finding_for_supplied_provision';
    }
    if (row.trackingStatus === PROVISION_TRACKING_STATUS.IDENTIFIED) {
      row.trackingStatus = PROVISION_TRACKING_STATUS.UNRESOLVED;
      row.extractionOutcome = 'never_supplied_to_analysis';
    }
  }
  const unresolved = inventory.provisions.filter((p) =>
    [PROVISION_TRACKING_STATUS.UNRESOLVED, PROVISION_TRACKING_STATUS.EXCEPTION].includes(p.trackingStatus),
  );
  return {
    inventoryComplete: unresolved.length === 0,
    unresolvedCount: unresolved.length,
    unresolvedCores: unresolved.map((p) => p.core),
    summary: inventory.provisions.reduce((acc, p) => {
      acc[p.trackingStatus] = (acc[p.trackingStatus] || 0) + 1;
      return acc;
    }, {}),
  };
}
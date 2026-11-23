/**
 * Deterministic instrument provision inventory — independent of AI (RI provision engine).
 */
import {
  PROVISION_MARKERS,
  analyseInstrumentProvisionText,
  buildProvisionPagesIndex,
  detectLegalInstrumentStartPage,
  hasDutyLanguage,
  mergeInstrumentBlocksByPage,
  parseProvisionReference,
  PROVISION_TEXT_STATUS,
  provisionMarkersInText,
} from './provision-eligibility.mjs';
import { expandProvisionCoreSet, provisionCoreAliases, resolveInventoryRowByCore } from './provision-core-keys.mjs';

const NEXT_PROVISION_RE =
  /(?:(?<![A-Za-z0-9.])(?<!App\s{1,3})(?:([A-Z]{2,6})\s+)?|(?<![A-Za-z0-9])(?=App\s))((?:App\s+)?\d{1,2}[A-Z]?\.\d{1,2}[A-Z]?\.\d{1,3}[A-Z]?|TP\s+\d{1,3}[A-Z]?\.\d{1,3}[A-Z]?)\s*(R|E|G|D|P|C|UK|EU)(?![A-Za-z])/g;

function provisionScopedExcerpt(byPage, pages, core) {
  const merged = (pages || [])
    .map((p) => byPage.get(p) || '')
    .join('\n')
    .replace(/\s+/g, ' ');
  const bodyMarker = String(core).match(/^(.*?)(R|E|G|D|P|C|UK|EU)$/i);
  const startRe = bodyMarker
    ? new RegExp(`${bodyMarker[1].replace(/\./g, '\\.')}\\s*${bodyMarker[2]}\\b`, 'i')
    : new RegExp(String(core).replace(/\./g, '\\.'), 'i');
  const start = merged.search(startRe);
  if (start < 0) return '';
  const tail = merged.slice(start);
  NEXT_PROVISION_RE.lastIndex = 0;
  NEXT_PROVISION_RE.exec(tail);
  const next = NEXT_PROVISION_RE.exec(tail);
  const end = next?.index ?? Math.min(tail.length, 520);
  return tail.slice(0, end).trim();
}

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
    const scopedExcerpt = provisionScopedExcerpt(byPage, pages, core);
    const tableInstrumentContext = /\bin the table\b/i.test(scopedExcerpt);
    provisions.push({
      core,
      marker: PROVISION_MARKERS.includes(marker) ? marker : core.match(/(R|E|G|D|P|C|UK|EU)$/)?.[1] || null,
      pages,
      textStatusByPage: statusByPage,
      tableInstrumentContext,
      trackingStatus: PROVISION_TRACKING_STATUS.IDENTIFIED,
      suppliedInBatch: null,
      findingIds: [],
      extractionOutcome: null,
      scopedExcerpt: scopedExcerpt.slice(0, 520),
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
function primaryTextStatus(row) {
  const statuses = Object.values(row?.textStatusByPage || {});
  if (!statuses.length) return null;
  if (statuses.includes(PROVISION_TEXT_STATUS.AMENDMENT_MARKUP_UNCERTAIN)) {
    return PROVISION_TEXT_STATUS.AMENDMENT_MARKUP_UNCERTAIN;
  }
  if (statuses.includes(PROVISION_TEXT_STATUS.NEW_TEXT)) return PROVISION_TEXT_STATUS.NEW_TEXT;
  return statuses[0];
}

function suppliedWithoutFindingOutcome(row) {
  const textStatus = primaryTextStatus(row);
  if (
    row.core.startsWith('TP ') ||
    textStatus === PROVISION_TEXT_STATUS.AMENDMENT_MARKUP_UNCERTAIN ||
    row.tableInstrumentContext === true
  ) {
    return {
      trackingStatus: PROVISION_TRACKING_STATUS.EXCEPTION,
      extractionOutcome: 'supplied_requires_exception_triage',
    };
  }
  const operativeCandidate =
    row.marker === 'R' &&
    textStatus === PROVISION_TEXT_STATUS.NEW_TEXT &&
    hasDutyLanguage(row.scopedExcerpt || '');
  if (operativeCandidate) {
    return {
      trackingStatus: PROVISION_TRACKING_STATUS.EXCEPTION,
      extractionOutcome: 'ai_assessment_omission_requires_review',
    };
  }
  return {
    trackingStatus: PROVISION_TRACKING_STATUS.NO_OBLIGATION,
    extractionOutcome: 'no_finding_for_supplied_provision',
  };
}

/** Apply persisted orchestration cumulative supply onto a rebuilt inventory. */
export function syncProvisionInventorySuppliedFromLedger(inventory, cumulativeSuppliedCores, batches = []) {
  const suppliedSet = expandProvisionCoreSet(cumulativeSuppliedCores || []);
  for (const core of suppliedSet) {
    const row = resolveInventoryRowByCore(inventory.byCore, core);
    if (!row || row.trackingStatus === PROVISION_TRACKING_STATUS.FINDING) continue;
    if (row.trackingStatus === PROVISION_TRACKING_STATUS.IDENTIFIED) {
      row.trackingStatus = PROVISION_TRACKING_STATUS.SUPPLIED;
    }
    if (row.suppliedInBatch == null) {
      const batchHit = batches.find((b) => (b.instrumentProvisionsNewlySupplied || []).includes(row.core));
      if (batchHit) row.suppliedInBatch = batchHit.batchIndex;
    }
  }
}

export function reconcileFindingsWithProvisionInventory(inventory, findings) {
  const cited = new Set();
  for (const f of findings || []) {
    const ref = f.provisionReference ? parseProvisionReference(f.provisionReference) : null;
    const core = f.provisionCore || ref?.core;
    if (!core) continue;
    for (const alias of [core, ...(ref?.core ? [ref.core] : [])]) cited.add(alias);
    const row = resolveInventoryRowByCore(inventory.byCore, core);
    if (!row) continue;
    row.trackingStatus = PROVISION_TRACKING_STATUS.FINDING;
    if (f.findingId) row.findingIds.push(f.findingId);
  }
  const citedExpanded = expandProvisionCoreSet(cited);
  for (const row of inventory.provisions) {
    const citedForRow = provisionCoreAliases(row.core).some((alias) => citedExpanded.has(alias));
    if (row.trackingStatus === PROVISION_TRACKING_STATUS.SUPPLIED && !citedForRow) {
      const next = suppliedWithoutFindingOutcome(row);
      row.trackingStatus = next.trackingStatus;
      row.extractionOutcome = next.extractionOutcome;
    }
    if (row.trackingStatus === PROVISION_TRACKING_STATUS.IDENTIFIED) {
      row.trackingStatus = PROVISION_TRACKING_STATUS.UNRESOLVED;
      row.extractionOutcome = 'never_supplied_to_analysis';
    }
  }
  const unresolved = inventory.provisions.filter((p) => p.trackingStatus === PROVISION_TRACKING_STATUS.UNRESOLVED);
  const exceptions = inventory.provisions.filter((p) => p.trackingStatus === PROVISION_TRACKING_STATUS.EXCEPTION);
  const assessmentOmissions = inventory.provisions.filter(
    (p) => p.extractionOutcome === 'ai_assessment_omission_requires_review',
  );
  const regulatoryAccuracySuccess = assessmentOmissions.length === 0 && unresolved.length === 0;
  return {
    inventoryComplete: unresolved.length === 0,
    regulatoryAccuracySuccess,
    assessmentOmissionCount: assessmentOmissions.length,
    assessmentOmissionCores: assessmentOmissions.map((p) => p.core),
    unresolvedCount: unresolved.length,
    unresolvedCores: unresolved.map((p) => p.core),
    exceptionCount: exceptions.length,
    exceptionCores: exceptions.map((p) => p.core),
    summary: inventory.provisions.reduce((acc, p) => {
      acc[p.trackingStatus] = (acc[p.trackingStatus] || 0) + 1;
      return acc;
    }, {}),
  };
}
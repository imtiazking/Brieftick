/**
 * RI-CLS-007 — publication-level multi-batch extraction plan (deterministic; no paid calls).
 */
import { buildProvisionPagesIndex } from '../classification/provision-eligibility.mjs';
import {
  MAX_CHARS_PER_SECTION,
  MAX_SECTIONS,
  describeSelectedSections,
  selectEvidenceBlocksForAnalysis,
  scoreInstrumentBlockForObligationExtraction,
} from './build-pdf-grounded-analysis-context.mjs';

export const EXTRACTION_BATCH_PLAN_VERSION = 'instrument_coverage_v1';
export const DEFAULT_MAX_BATCHES = 12;

/** Rough token estimate: chars / 4 for English legal text. */
export function estimateExtractionBatchTokens(selectedCharacters) {
  const chars = Number(selectedCharacters) || 0;
  return Math.ceil(chars / 4);
}

/**
 * Select instrument blocks that set out the given provision cores (pages from provision index).
 * @param {any[]} blocks
 * @param {number} instrumentStartPage
 * @param {string[]} targetCores provisions still outstanding
 * @param {{ maxSections?: number }} [options]
 */
export function selectBlocksForProvisionCores(blocks, instrumentStartPage, targetCores, options = {}) {
  const maxSections = options.maxSections ?? MAX_SECTIONS;
  const index = buildProvisionPagesIndex(blocks || [], instrumentStartPage);
  const targetPages = new Set();
  for (const core of targetCores || []) {
    for (const p of index.get(core)?.pages || []) targetPages.add(p);
  }
  const inInstrument = (b) => Number.isInteger(b.pageNumber) && b.pageNumber >= instrumentStartPage;
  const ranked = (blocks || [])
    .filter((b) => inInstrument(b) && targetPages.has(b.pageNumber))
    .map((block) => ({ block, score: scoreInstrumentBlockForObligationExtraction(block) }))
    .sort((a, b) => b.score - a.score || a.block.pageNumber - b.block.pageNumber);
  const picked = [];
  const pagesUsed = new Set();
  for (const { block } of ranked) {
    if (picked.length >= maxSections) break;
    picked.push(block);
    pagesUsed.add(block.pageNumber);
  }
  for (const { block } of ranked) {
    if (picked.length >= maxSections) break;
    if (picked.some((p) => p.documentEvidenceId === block.documentEvidenceId)) continue;
    picked.push(block);
  }
  if (picked.length < maxSections) {
    const filler = selectEvidenceBlocksForAnalysis(blocks, { instrumentStartPage, maxSections });
    for (const block of filler) {
      if (picked.length >= maxSections) break;
      if (picked.some((p) => p.documentEvidenceId === block.documentEvidenceId)) continue;
      picked.push(block);
    }
  }
  return picked.sort((a, b) => (a.pageNumber ?? 0) - (b.pageNumber ?? 0)).slice(0, maxSections);
}

/**
 * @param {any[]} allBlocks full pdf_primary_v1 blocks
 * @param {{ instrumentStartPage: number, maxSectionsPerBatch?: number, maxBatches?: number, startSuppliedCores?: string[], targetProvisionCores?: string[] }} options
 */
export function buildPublicationExtractionBatchPlan(allBlocks, options) {
  const instrumentStartPage = options.instrumentStartPage;
  if (!Number.isInteger(instrumentStartPage)) {
    return {
      planVersion: EXTRACTION_BATCH_PLAN_VERSION,
      batches: [],
      publicationCoverageComplete: false,
      reason: 'instrument_start_unknown',
    };
  }
  const maxSections = options.maxSectionsPerBatch ?? MAX_SECTIONS;
  const maxBatches = Math.min(options.maxBatches ?? DEFAULT_MAX_BATCHES, DEFAULT_MAX_BATCHES);
  const provisionPages = buildProvisionPagesIndex(allBlocks || [], instrumentStartPage);
  const allCores = [...provisionPages.keys()];
  const supplied = new Set(options.startSuppliedCores || []);
  const batches = [];

  for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
    const outstanding = allCores.filter((c) => !supplied.has(c));
    if (!outstanding.length && batchIndex > 0) break;

    const selected =
      batchIndex === 0 &&
      !options.startSuppliedCores?.length &&
      Array.isArray(options.targetProvisionCores) &&
      options.targetProvisionCores.length
        ? selectBlocksForProvisionCores(allBlocks, instrumentStartPage, options.targetProvisionCores, { maxSections })
        : batchIndex === 0 && !options.startSuppliedCores?.length
          ? selectEvidenceBlocksForAnalysis(allBlocks, { instrumentStartPage, maxSections })
          : selectBlocksForProvisionCores(allBlocks, instrumentStartPage, outstanding.length ? outstanding : allCores, {
              maxSections,
            });

    const described = describeSelectedSections(allBlocks, selected, instrumentStartPage);
    const newlySupplied = described.selection.instrumentProvisionsSupplied
      ? allCores.filter((c) => !supplied.has(c) && !described.selection.instrumentProvisionsNotSupplied.includes(c))
      : [];
    for (const c of described.sourceSections.flatMap((s) => s.provisionsSetOut || [])) {
      if (allCores.includes(c)) supplied.add(c);
    }

    const batch = {
      batchIndex,
      selectedBlockIds: selected.map((b) => b.documentEvidenceId),
      selection: described.selection,
      estimate: {
        selectedCharacters: described.selection.selectedCharacters,
        estimatedTokens: estimateExtractionBatchTokens(described.selection.selectedCharacters),
        maxCharactersPerSection: MAX_CHARS_PER_SECTION,
      },
      instrumentProvisionsOutstanding: allCores.filter((c) => !supplied.has(c)),
      instrumentProvisionsNewlySupplied: newlySupplied,
    };
    batches.push(batch);

    if (!described.selection.instrumentProvisionsNotSupplied.length) break;
    if (batchIndex > 0 && !newlySupplied.length) {
      batch.stalled = true;
      break;
    }
  }

  const last = batches[batches.length - 1];
  const publicationCoverageComplete =
    Boolean(last) && !(last.instrumentProvisionsOutstanding?.length) && !last?.stalled;

  return {
    planVersion: EXTRACTION_BATCH_PLAN_VERSION,
    instrumentStartPage,
    instrumentProvisionCount: allCores.length,
    maxSectionsPerBatch: maxSections,
    batches,
    publicationCoverageComplete,
    analysisScope: publicationCoverageComplete ? 'FULL_INSTRUMENT_PROVISIONS' : 'PARTIAL_INSTRUMENT_PROVISIONS',
  };
}

/** Merge coverage ledgers from prior runs (provision cores only). */
export function mergeCumulativeProvisionCoverage(ledgers) {
  const supplied = new Set();
  for (const l of ledgers || []) {
    for (const c of l?.instrumentProvisionsSuppliedCores || l?.suppliedCores || []) supplied.add(c);
  }
  return [...supplied].sort();
}

/**
 * Normalised dedupe key for findings across batches (provision core + statement).
 * @param {{ provisionReference?: string | null, obligationStatement?: string | null, claimText?: string | null }} finding
 */
export function crossBatchFindingDedupeKey(finding, sha256Hex) {
  const core = String(finding.provisionCore || finding.provisionReference || '').replace(/\s+/g, '');
  const stmt = String(finding.obligationStatement || finding.claimText || '').trim();
  if (!core || !stmt) return null;
  return `${core}:${sha256Hex(stmt)}`;
}
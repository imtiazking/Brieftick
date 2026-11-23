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
import {
  assertExtractionOutputBudget,
  estimateStructuredOutputTokens,
  maxProvisionsWithinOutputPreflight,
} from './extraction-output-preflight.mjs';

export const EXTRACTION_BATCH_PLAN_VERSION = 'instrument_coverage_v2';
/** Soft default when callers omit maxBatches (not a hard publication ceiling). */
export const DEFAULT_MAX_BATCHES = 12;
/** Safety ceiling for unattended plan generation (configurable via maxBatchesSafetyCap). */
export const DEFAULT_MAX_BATCHES_SAFETY_CAP = 512;

/**
 * @param {{ maxBatches?: number | null, maxBatchesSafetyCap?: number, fullPublicationCoverage?: boolean }} options
 * @param {number} provisionCount
 */
export function resolvePlanBatchLimit(options, provisionCount) {
  const cap = Number.isInteger(options.maxBatchesSafetyCap)
    ? options.maxBatchesSafetyCap
    : DEFAULT_MAX_BATCHES_SAFETY_CAP;
  if (options.fullPublicationCoverage === true || options.maxBatches === 0) {
    return Math.min(Math.max(provisionCount + 8, DEFAULT_MAX_BATCHES), cap);
  }
  if (Number.isInteger(options.maxBatches) && options.maxBatches > 0) {
    return Math.min(options.maxBatches, cap);
  }
  return Math.min(DEFAULT_MAX_BATCHES, cap);
}

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
 * @param {{ instrumentStartPage: number, maxSectionsPerBatch?: number, maxBatches?: number | null, maxBatchesSafetyCap?: number, fullPublicationCoverage?: boolean, startSuppliedCores?: string[], targetProvisionCores?: string[] }} options
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
  const provisionPages = buildProvisionPagesIndex(allBlocks || [], instrumentStartPage);
  const allCores = [...provisionPages.keys()];
  const maxBatches = resolvePlanBatchLimit(options, allCores.length);
  const supplied = new Set(options.startSuppliedCores || []);
  const batches = [];

  const maxStructuredOutputTokens = Number(options.maxStructuredOutputTokens) || 8192;

  for (let batchIndex = 0; batchIndex < maxBatches; batchIndex += 1) {
    const outstanding = allCores.filter((c) => !supplied.has(c));
    if (!outstanding.length && batchIndex > 0) break;

    const provisionCap = maxProvisionsWithinOutputPreflight({
      sectionCount: maxSections,
      maxOutputTokens: maxStructuredOutputTokens,
      maxProvisionsPerBatch: options.maxProvisionsPerBatchOverride,
    });
    let targetCores = outstanding.slice(0, Math.max(1, provisionCap));
    if (
      batchIndex === 0 &&
      !options.startSuppliedCores?.length &&
      Array.isArray(options.targetProvisionCores) &&
      options.targetProvisionCores.length
    ) {
      targetCores = options.targetProvisionCores.filter((c) => !supplied.has(c)).slice(0, provisionCap);
    }

    const selected = targetCores.length
      ? selectBlocksForProvisionCores(allBlocks, instrumentStartPage, targetCores, { maxSections })
      : selectEvidenceBlocksForAnalysis(allBlocks, { instrumentStartPage, maxSections });

    const described = describeSelectedSections(allBlocks, selected, instrumentStartPage);
    const pagesSetOut = new Set(
      (described.sourceSections || []).flatMap((s) => s.provisionsSetOut || []).filter((c) => allCores.includes(c)),
    );
    const newlySupplied = targetCores.filter((c) => pagesSetOut.has(c) && !supplied.has(c));
    for (const c of newlySupplied) supplied.add(c);

    const sectionCount = Math.min(maxSections, described.selection?.selectedSections ?? maxSections);
    const est = estimateStructuredOutputTokens({
      provisionCount: newlySupplied.length,
      sectionCount,
    });
    const outputPreflightEstimate = {
      estimateTokens: est,
      ...assertExtractionOutputBudget({
        estimateTokens: est,
        maxOutputTokens: maxStructuredOutputTokens,
      }),
      provisionCap,
      targetProvisionCount: targetCores.length,
    };

    const batch = {
      batchIndex,
      selectedBlockIds: selected.map((b) => b.documentEvidenceId),
      selection: described.selection,
      estimate: {
        selectedCharacters: described.selection.selectedCharacters,
        estimatedTokens: estimateExtractionBatchTokens(described.selection.selectedCharacters),
        maxCharactersPerSection: MAX_CHARS_PER_SECTION,
        outputPreflight: outputPreflightEstimate,
      },
      instrumentProvisionsOutstanding: allCores.filter((c) => !supplied.has(c)),
      instrumentProvisionsNewlySupplied: newlySupplied,
    };
    batches.push(batch);

    if (batch.instrumentProvisionsOutstanding.length === 0) break;
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
    planBatchLimit: maxBatches,
    batchLimitReached: batches.length >= maxBatches && !publicationCoverageComplete,
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
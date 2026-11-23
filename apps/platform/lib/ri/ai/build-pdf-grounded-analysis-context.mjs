/**
 * Build page-aware source sections from pdf_primary_v1 for UC-RI AI analysis.
 */
import { createClient } from '@supabase/supabase-js';
import { analyzeRegulatoryPdfDocument } from '../../../../../integrations/regulatory-sources/core/regulatory-pdf-analysis.mjs';
import { loadPublicationPdfEvidenceForAskRi } from '../ask-ri/load-publication-pdf-evidence.mjs';
import {
  analyseInstrumentProvisionText,
  detectLegalInstrumentStartPage,
  isTransitionalTable,
  buildProvisionPagesIndex,
  provisionMarkersInText,
  provisionsSetOutIn,
} from '../classification/provision-eligibility.mjs';
import { buildPublicationExtractionBatchPlan, mergeCumulativeProvisionCoverage } from './extraction-batch-plan.mjs';
import {
  buildInstrumentProvisionInventory,
  markProvisionsSuppliedForAnalysis,
  PROVISION_TRACKING_STATUS,
} from '../classification/provision-inventory.mjs';
import {
  buildDeterministicProvisionCandidates,
  extractProvisionScopedExcerpt,
  mergePageTextsFromBlocks,
} from './deterministic-provision-candidates.mjs';

export const PDF_GROUNDED_USE_CASES = new Set(['UC-RI-005', 'UC-RI-002']);

const OBLIGATION_EXTRACTION_QUERY =
  'regulatory obligations requirements firms must shall should guidance consumer duty binding rules provisions consultation';

export const MAX_SECTIONS = 18;
export const MAX_CHARS_PER_SECTION = 3200;
const MIN_BLOCK_SCORE = 1;

export function scoreBlockForObligationExtraction(block) {
  const text = String(block.extractedText || '').toLowerCase();
  if (!text.trim()) return 0;
  let score = 0;
  const patterns = [
    [/\b(must|shall|required|requirement)\b/g, 6],
    [/\b(should|expected to|need to)\b/g, 3],
    [/\b(firm|firms|regulated)\b/g, 2],
    [/\b(guidance|guideline|non-binding)\b/g, 2],
    [/\b(consultation|proposed|draft)\b/g, 2],
    [/\b(consumer duty|prin|cobs|sysc)\b/g, 4],
    [/\b(paragraph|rule|principle)\b/g, 2],
  ];
  for (const [re, w] of patterns) {
    const hits = text.match(re);
    if (hits) score += hits.length * w;
  }
  if (block.kind === 'numbered_clause') score += 8;
  if (text.length < 40) score -= 3;
  return score;
}

const OPERATIVE_MARKERS = new Set(['R', 'E', 'D', 'P', 'UK', 'EU']);
const INSTRUMENT_SECTION_SLOTS = 14;

/**
 * Instrument pages ranked by the operative provisions they set out; cross-references do not count. Transitional
 * provisions are ranked like any other provision: they can impose mandatory requirements.
 */
export function scoreInstrumentBlockForObligationExtraction(block) {
  const text = String(block.extractedText || '');
  const setOut = provisionMarkersInText(text).filter((p) => p.setOut);
  const operative = new Set(setOut.filter((p) => OPERATIVE_MARKERS.has(p.marker)).map((p) => p.core)).size;
  const guidance = new Set(setOut.filter((p) => p.marker === 'G').map((p) => p.core)).size;
  const duties = (text.match(/\b(must|shall|is required to|are required to|is to|are to)\b/gi) || []).length;
  let score = operative * 10 + Math.min(duties, 6) * 4 + guidance;
  if (!operative) score -= 10;
  return score;
}

/**
 * @param {any[]} blocks
 * @param {{ instrumentStartPage?: number | null }} [options] With an instrument, up to 14 of the 18 sections are
 *   the instrument pages setting out the most operative provisions; the rest are the best-scoring narrative.
 */
export function selectEvidenceBlocksForAnalysis(blocks, options = {}) {
  const maxSections = options.maxSections ?? MAX_SECTIONS;
  const start = options.instrumentStartPage;
  if (!Number.isInteger(start)) return selectByKeywords(blocks, maxSections);
  const inInstrument = (b) => Number.isInteger(b.pageNumber) && b.pageNumber >= start;
  const instrument = (blocks || [])
    .filter(inInstrument)
    .map((block) => ({ block, score: scoreInstrumentBlockForObligationExtraction(block) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.block.pageNumber - b.block.pageNumber)
    .slice(0, INSTRUMENT_SECTION_SLOTS)
    .map((r) => r.block);
  const picked = [...instrument];
  for (const block of selectByKeywords((blocks || []).filter((b) => !inInstrument(b)), maxSections)) {
    if (picked.length >= maxSections) break;
    picked.push(block);
  }
  return picked.sort((a, b) => (a.pageNumber ?? 0) - (b.pageNumber ?? 0));
}

function selectByKeywords(blocks, maxSections = MAX_SECTIONS) {
  const ranked = (blocks || [])
    .map((b) => ({ block: b, score: scoreBlockForObligationExtraction(b) }))
    .filter((r) => r.score >= MIN_BLOCK_SCORE)
    .sort((a, b) => b.score - a.score);

  const picked = [];
  const pagesUsed = new Set();
  for (const { block } of ranked) {
    if (picked.length >= maxSections) break;
    const page = block.pageNumber;
    if (pagesUsed.has(page) && picked.length >= 8) continue;
    picked.push(block);
    pagesUsed.add(page);
  }

  if (picked.length < 6) {
    for (const block of blocks || []) {
      if (picked.length >= maxSections) break;
      if (picked.some((p) => p.documentEvidenceId === block.documentEvidenceId)) continue;
      if (String(block.extractedText || '').trim().length < 30) continue;
      picked.push(block);
    }
  }
  return picked.slice(0, maxSections);
}

function formatCitationLabel(block, inLegalInstrument) {
  const page = block.pageNumber ?? block.physicalPageIndex;
  const printed = block.printedPageLabel ? ` (${block.printedPageLabel})` : '';
  const section = block.sectionReference ? ` §${block.sectionReference}` : '';
  return `PDF p.${page}${printed}${section}${inLegalInstrument ? ' · legal instrument' : ''}`;
}

/**
 * Source sections and grounding facts for a selection. Instrument status, the provisions each section sets out
 * and the coverage figures are server-derived and stored with the run; the review function relies on them.
 */
export function describeSelectedSections(allBlocks, selected, instrumentStartPage) {
  const instrumentAware = Number.isInteger(instrumentStartPage);
  const textStatus = analyseInstrumentProvisionText(allBlocks, instrumentAware ? instrumentStartPage : null);
  const sourceSections = selected.map((block) => {
    const text = String(block.extractedText || '').slice(0, MAX_CHARS_PER_SECTION);
    const inLegalInstrument = instrumentAware && Number.isInteger(block.pageNumber) && block.pageNumber >= instrumentStartPage;
    const provisionsSetOut = inLegalInstrument ? provisionsSetOutIn(text) : [];
    const blockStatus = textStatus.get(block.documentEvidenceId) || {};
    return {
      sourceSectionId: block.documentEvidenceId,
      citation: formatCitationLabel(block, inLegalInstrument),
      text,
      pageNumber: block.pageNumber,
      sectionReference: block.sectionReference,
      inLegalInstrument,
      transitionalProvisions: isTransitionalTable(text),
      provisionsSetOut,
      provisionTextStatus: Object.fromEntries(provisionsSetOut.map((p) => [p, blockStatus[p] || 'AMENDMENT_MARKUP_UNCERTAIN'])),
      truncated: String(block.extractedText || '').length > MAX_CHARS_PER_SECTION,
    };
  });
  const chars = (list) => list.reduce((n, b) => n + String(b.extractedText || '').length, 0);
  const documentCharacters = chars(allBlocks || []);
  const selectedCharacters = sourceSections.reduce((n, s) => n + s.text.length, 0);
  const pages = (list) => new Set(list.map((b) => b.pageNumber).filter((p) => Number.isInteger(p)));
  const instrumentPages = instrumentAware ? [...pages(allBlocks || [])].filter((p) => p >= instrumentStartPage) : [];
  const provisionPages = instrumentAware
    ? buildProvisionPagesIndex(allBlocks || [], instrumentStartPage)
    : new Map();
  if (instrumentAware) {
    for (const section of sourceSections) {
      if (!section.inLegalInstrument) continue;
      const merged = new Set(section.provisionsSetOut);
      for (const [core, info] of provisionPages) {
        if (info.pages.has(section.pageNumber)) merged.add(core);
      }
      section.provisionsSetOut = [...merged];
      for (const core of merged) {
        const st = provisionPages.get(core)?.status?.[section.pageNumber];
        if (st) section.provisionTextStatus[core] = st;
      }
    }
  }
  const instrumentProvisions = [...provisionPages.keys()];
  const suppliedProvisions = new Set(sourceSections.flatMap((s) => s.provisionsSetOut));
  const suppliedStatuses = sourceSections.flatMap((s) => Object.values(s.provisionTextStatus));
  const selection = {
    strategy: instrumentAware ? 'instrument_priority_v1' : 'keyword_v1',
    maxSections: MAX_SECTIONS,
    maxCharactersPerSection: MAX_CHARS_PER_SECTION,
    instrumentStartPage: instrumentAware ? instrumentStartPage : null,
    documentPages: pages(allBlocks || []).size,
    documentCharacters,
    selectedSections: sourceSections.length,
    selectedPages: [...pages(selected)].sort((a, b) => a - b),
    selectedCharacters,
    characterCoveragePercent: documentCharacters ? Number(((selectedCharacters / documentCharacters) * 100).toFixed(2)) : 0,
    instrumentPages: instrumentPages.length,
    instrumentPagesSelected: sourceSections.filter((s) => s.inLegalInstrument).length,
    instrumentProvisionsSetOut: instrumentProvisions.length,
    instrumentProvisionsSupplied: instrumentProvisions.filter((p) => suppliedProvisions.has(p)).length,
    instrumentProvisionsNotSupplied: instrumentProvisions.filter((p) => !suppliedProvisions.has(p)),
    instrumentProvisionsOmitted: instrumentProvisions
      .filter((p) => !suppliedProvisions.has(p))
      .map((p) => ({
        provision: p,
        pages: [...provisionPages.get(p).pages].sort((a, b) => a - b),
        textStatus: [...new Set(Object.values(provisionPages.get(p).status).filter(Boolean))],
      })),
    suppliedProvisionTextStatus: suppliedStatuses.reduce((m, s) => ({ ...m, [s]: (m[s] || 0) + 1 }), {}),
    truncatedSections: sourceSections.filter((s) => s.truncated).length,
    scope: selectedCharacters < documentCharacters ? 'PARTIAL_DOCUMENT' : 'WHOLE_DOCUMENT',
  };
  const provisionPageIndex = Object.fromEntries(
    [...provisionPages.entries()].map(([core, info]) => [core, [...info.pages].sort((a, b) => a - b)]),
  );
  return { sourceSections, selection, provisionPageIndex };
}

/**
 * @param {{
 *   publicationId: string;
 *   publicationVersionId?: string;
 *   adminSupabase?: import('@supabase/supabase-js').SupabaseClient;
 *   useCaseId?: string;
 *   extractionBatchIndex?: number;
 *   maxSectionsPerBatch?: number;
 *   cumulativeSuppliedProvisionCores?: string[];
 *   priorCoverageLedgers?: Array<{ instrumentProvisionsSuppliedCores?: string[] }>;
 *   targetProvisionCores?: string[];
 * }} params
 */
export async function buildPdfGroundedAnalysisContext(params) {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!projectUrl || !serviceRoleKey) {
    return { ok: false, code: 'storage_credentials_unavailable' };
  }

  const admin =
    params.adminSupabase ||
    createClient(projectUrl, serviceRoleKey, { auth: { persistSession: false } });

  const loaded = await loadPublicationPdfEvidenceForAskRi(admin, {
    projectUrl,
    serviceRoleKey,
    publicationIds: [params.publicationId],
  });

  if (!loaded.evidence?.length) {
    return {
      ok: false,
      code: 'pdf_primary_not_found',
      errors: loaded.errors,
    };
  }

  const entry = loaded.evidence[0];
  if (entry.structured?.pageBoundaryConfirmed !== true) {
    return { ok: false, code: 'pdf_page_boundaries_not_confirmed' };
  }

  const instrumentStartPage =
    params.useCaseId === 'UC-RI-005' ? detectLegalInstrumentStartPage(entry.evidenceBlocks) : null;

  const startSupplied = [
    ...(params.cumulativeSuppliedProvisionCores || []),
    ...mergeCumulativeProvisionCoverage(params.priorCoverageLedgers),
  ];
  const batchIndex = Number.isInteger(params.extractionBatchIndex) ? params.extractionBatchIndex : null;
  const maxSectionsPerBatch = params.maxSectionsPerBatch ?? MAX_SECTIONS;
  const hasContinuationSupply = startSupplied.length > 0;
  const fullPublicationCoverage = params.fullPublicationCoverage !== false;
  let blocks;
  let extractionBatchPlan = null;
  let activeBatch = null;

  if (params.useCaseId === 'UC-RI-005' && Number.isInteger(instrumentStartPage)) {
    const maxBatches = hasContinuationSupply
      ? undefined
      : batchIndex != null
        ? batchIndex + 1
        : 1;
    extractionBatchPlan = buildPublicationExtractionBatchPlan(entry.evidenceBlocks, {
      instrumentStartPage,
      maxSectionsPerBatch,
      startSuppliedCores: hasContinuationSupply ? startSupplied : undefined,
      maxBatches,
      fullPublicationCoverage,
      targetProvisionCores: params.targetProvisionCores,
    });
    const planBatchIndex =
      hasContinuationSupply && batchIndex != null && batchIndex > 0 ? 0 : batchIndex ?? 0;
    activeBatch = extractionBatchPlan.batches[planBatchIndex];
    if (!activeBatch) {
      return { ok: false, code: 'extraction_batch_out_of_range' };
    }
    const idSet = new Set(activeBatch.selectedBlockIds || []);
    blocks = (entry.evidenceBlocks || []).filter((b) => idSet.has(b.documentEvidenceId));
    if (!blocks.length && activeBatch.selection?.selectedPages?.length) {
      const pageSet = new Set(activeBatch.selection.selectedPages);
      blocks = (entry.evidenceBlocks || []).filter((b) => pageSet.has(b.pageNumber));
    }
  } else {
    blocks = selectEvidenceBlocksForAnalysis(entry.evidenceBlocks, { instrumentStartPage, maxSections: maxSectionsPerBatch });
  }
  if (!blocks.length) {
    return { ok: false, code: 'pdf_no_ranked_evidence_blocks' };
  }

  const analysis =
    entry.analysis ||
    analyzeRegulatoryPdfDocument({
      structured: entry.structured,
      publicationMetadata: entry.publicationMetadata,
      canonicalUrl: entry.canonicalUrl,
    });

  const described = describeSelectedSections(entry.evidenceBlocks, blocks, instrumentStartPage);
  const sourceSections = described.sourceSections.map((s) => ({
    sourceSectionId: s.sourceSectionId,
    citation: s.citation,
    text: s.text,
    pageNumber: s.pageNumber,
    sectionReference: s.sectionReference,
  }));

  const allowedSectionIds = sourceSections.map((s) => s.sourceSectionId);

  let provisionInventorySnapshot = null;
  let deterministicProvisionCandidates = [];
  let provisionOutcomesSummary = null;
  if (Number.isInteger(instrumentStartPage)) {
    const inventory = buildInstrumentProvisionInventory(entry.evidenceBlocks, instrumentStartPage);
    const notSupplied = new Set(described.selection?.instrumentProvisionsNotSupplied || []);
    const suppliedCores = (described.sourceSections || []).flatMap((s) => s.provisionsSetOut || []);
    const uniqueSupplied = [...new Set(suppliedCores)].filter((c) => !notSupplied.has(c));
    markProvisionsSuppliedForAnalysis(inventory, uniqueSupplied, batchIndex ?? 0);
    const pageText = mergePageTextsFromBlocks(entry.evidenceBlocks);
    deterministicProvisionCandidates = buildDeterministicProvisionCandidates(inventory, uniqueSupplied, pageText);
    const unresolved = inventory.provisions.filter(
      (p) => p.trackingStatus === PROVISION_TRACKING_STATUS.UNRESOLVED || p.trackingStatus === PROVISION_TRACKING_STATUS.IDENTIFIED,
    );
    provisionOutcomesSummary = {
      identifiedCount: inventory.provisions.length,
      suppliedCount: uniqueSupplied.length,
      deterministicCandidateCount: deterministicProvisionCandidates.length,
      unresolvedCores: unresolved.map((p) => p.core),
      publicationCoverageComplete: extractionBatchPlan?.publicationCoverageComplete === true,
    };
    provisionInventorySnapshot = {
      instrumentStartPage: inventory.instrumentStartPage,
      provisionCount: inventory.provisions.length,
      outcomes: provisionOutcomesSummary,
    };
    const scopeCores =
      Array.isArray(params.targetProvisionCores) && params.targetProvisionCores.length
        ? params.targetProvisionCores
        : Array.isArray(activeBatch?.instrumentProvisionsNewlySupplied) && activeBatch.instrumentProvisionsNewlySupplied.length
          ? activeBatch.instrumentProvisionsNewlySupplied
          : uniqueSupplied;
    if (scopeCores.length) {
      const scoped = scopeCores.map((core) => {
        const row = inventory.byCore?.get(core);
        const excerpt = row ? extractProvisionScopedExcerpt(pageText, row.pages, core) : null;
        return excerpt
          ? { provisionCore: core, pages: row.pages, authoritativeExcerpt: excerpt.slice(0, 480) }
          : { provisionCore: core, missing: true };
      });
      provisionOutcomesSummary.provisionScopedExtraction = {
        targetCores: scopeCores,
        policy:
          'Each provisionCore in targetCores must receive an explicit assessment in candidates[] (provisionReference + sourceQuotation from authoritativeExcerpt only). A completed batch without an assessment for every supplied core is invalid.',
        excerpts: scoped,
      };
    }
  }

  if (params.useCaseId === 'UC-RI-005' && activeBatch) {
    const {
      estimateStructuredOutputTokens,
      assertExtractionOutputBudget,
      maxProvisionsWithinOutputPreflight,
    } = await import('./extraction-output-preflight.mjs');
    const sectionCountForPreflight = Math.min(
      sourceSections.length,
      maxSectionsPerBatch,
      activeBatch.selection?.selectedSections ?? sourceSections.length,
    );
    const provisionCap = maxProvisionsWithinOutputPreflight({
      sectionCount: sectionCountForPreflight,
      maxOutputTokens: Number(process.env.RI_LAB_ANTHROPIC_MAX_OUTPUT_TOKENS?.trim() || 8192),
    });
    const rawNewCount = Array.isArray(activeBatch.instrumentProvisionsNewlySupplied)
      ? activeBatch.instrumentProvisionsNewlySupplied.length
      : described.selection?.instrumentProvisionsSupplied?.length || 0;
    const maxOut = Number(process.env.RI_LAB_ANTHROPIC_MAX_OUTPUT_TOKENS?.trim() || 8192);
    if (rawNewCount > provisionCap) {
      return {
        ok: false,
        code: 'extraction_batch_oversized',
        outputPreflight: {
          ok: false,
          code: 'extraction_batch_oversized',
          provisionCount: rawNewCount,
          provisionCap,
          maxOutputTokens: maxOut,
        },
        grounding: {
          extractionBatch: { batchIndex: activeBatch.batchIndex, provisionCount: rawNewCount },
        },
      };
    }
    const est = estimateStructuredOutputTokens({
      provisionCount: rawNewCount,
      sectionCount: sectionCountForPreflight,
    });
    const pre = assertExtractionOutputBudget({ estimateTokens: est, maxOutputTokens: maxOut });
    if (!pre.ok) {
      return {
        ok: false,
        code: pre.code,
        outputPreflight: pre,
        grounding: {
          extractionBatch: { batchIndex: activeBatch.batchIndex, provisionCount: rawNewCount },
        },
      };
    }
    if (provisionOutcomesSummary) {
      provisionOutcomesSummary.outputPreflight = pre;
    }
  }

  return {
    ok: true,
    sourceSections,
    allowedSectionIds,
    grounding: {
      kind: 'pdf_primary_v1',
      publicationId: params.publicationId,
      publicationVersionId: params.publicationVersionId || null,
      extractionRevisionId: entry.extractionRevisionId,
      pageCount: entry.pageCount ?? entry.structured?.pageCount ?? null,
      obligationGradeSuitable: entry.obligationGradeSuitable === true,
      obligationExtractionQuery: OBLIGATION_EXTRACTION_QUERY,
      regulatoryAnalysis: {
        publicationClassification: analysis.publicationClassification,
        regulatoryStatus: analysis.regulatoryStatus,
        consultationPreserved: analysis.consultationPreserved,
        isFinalisedGuidance: analysis.isFinalisedGuidance,
      },
      selection: described.selection,
      sectionCatalog: described.sourceSections.map((s) => ({
        sourceSectionId: s.sourceSectionId,
        citation: s.citation,
        excerpt: s.text.slice(0, 600),
        pageNumber: s.pageNumber,
        sectionReference: s.sectionReference,
        inLegalInstrument: s.inLegalInstrument,
        transitionalProvisions: s.transitionalProvisions,
        provisionsSetOut: s.provisionsSetOut,
        provisionTextStatus: s.provisionTextStatus,
      })),
      provisionPageIndex: described.provisionPageIndex ?? {},
      extractionBatch: activeBatch
        ? {
            batchIndex: activeBatch.batchIndex,
            planVersion: extractionBatchPlan?.planVersion,
            publicationCoverageComplete: extractionBatchPlan?.publicationCoverageComplete === true,
            analysisScope: extractionBatchPlan?.analysisScope,
            instrumentProvisionsOutstanding: activeBatch.instrumentProvisionsOutstanding,
            instrumentProvisionsNewlySupplied: activeBatch.instrumentProvisionsNewlySupplied || [],
            estimate: activeBatch.estimate,
            stalled: activeBatch.stalled === true,
          }
        : null,
      extractionBatchPlanSummary: extractionBatchPlan
        ? {
            batchCount: extractionBatchPlan.batches.length,
            publicationCoverageComplete: extractionBatchPlan.publicationCoverageComplete,
            instrumentProvisionCount: extractionBatchPlan.instrumentProvisionCount,
          }
        : null,
      provisionInventory: provisionInventorySnapshot,
      provisionOutcomesSummary,
      deterministicProvisionCandidates,
    },
  };
}
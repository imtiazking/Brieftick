/**
 * Build page-aware source sections from pdf_primary_v1 for UC-RI AI analysis.
 */
import { createClient } from '@supabase/supabase-js';
import { analyzeRegulatoryPdfDocument } from '../../../../../integrations/regulatory-sources/core/regulatory-pdf-analysis.mjs';
import { loadPublicationPdfEvidenceForAskRi } from '../ask-ri/load-publication-pdf-evidence.mjs';

export const PDF_GROUNDED_USE_CASES = new Set(['UC-RI-005', 'UC-RI-002']);

const OBLIGATION_EXTRACTION_QUERY =
  'regulatory obligations requirements firms must shall should guidance consumer duty binding rules provisions consultation';

const MAX_SECTIONS = 18;
const MAX_CHARS_PER_SECTION = 3200;
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

export function selectEvidenceBlocksForAnalysis(blocks) {
  const ranked = (blocks || [])
    .map((b) => ({ block: b, score: scoreBlockForObligationExtraction(b) }))
    .filter((r) => r.score >= MIN_BLOCK_SCORE)
    .sort((a, b) => b.score - a.score);

  const picked = [];
  const pagesUsed = new Set();
  for (const { block } of ranked) {
    if (picked.length >= MAX_SECTIONS) break;
    const page = block.pageNumber;
    if (pagesUsed.has(page) && picked.length >= 8) continue;
    picked.push(block);
    pagesUsed.add(page);
  }

  if (picked.length < 6) {
    for (const block of blocks || []) {
      if (picked.length >= MAX_SECTIONS) break;
      if (picked.some((p) => p.documentEvidenceId === block.documentEvidenceId)) continue;
      if (String(block.extractedText || '').trim().length < 30) continue;
      picked.push(block);
    }
  }
  return picked.slice(0, MAX_SECTIONS);
}

function formatCitationLabel(block) {
  const page = block.pageNumber ?? block.physicalPageIndex;
  const printed = block.printedPageLabel ? ` (${block.printedPageLabel})` : '';
  const section = block.sectionReference ? ` §${block.sectionReference}` : '';
  return `PDF p.${page}${printed}${section}`;
}

/**
 * @param {{
 *   publicationId: string;
 *   publicationVersionId?: string;
 *   adminSupabase?: import('@supabase/supabase-js').SupabaseClient;
 *   useCaseId?: string;
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

  const blocks = selectEvidenceBlocksForAnalysis(entry.evidenceBlocks);
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

  const sourceSections = blocks.map((block) => ({
    sourceSectionId: block.documentEvidenceId,
    citation: formatCitationLabel(block),
    text: String(block.extractedText || '').slice(0, MAX_CHARS_PER_SECTION),
    pageNumber: block.pageNumber,
    sectionReference: block.sectionReference,
  }));

  const allowedSectionIds = sourceSections.map((s) => s.sourceSectionId);

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
      sectionCatalog: sourceSections.map((s) => ({
        sourceSectionId: s.sourceSectionId,
        citation: s.citation,
        excerpt: s.text.slice(0, 600),
        pageNumber: s.pageNumber,
        sectionReference: s.sectionReference,
      })),
    },
  };
}
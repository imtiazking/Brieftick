import { createHash } from 'node:crypto';

const PDF_TEXT_PARSER_VERSION = 'pdf-physical-pages-v2.0';

function normalizeForMatch(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * @param {object} params
 * @param {object} structured
 */
export function buildPdfEvidenceBlocks(params, structured) {
  const blocks = [];
  let seq = 0;
  const profile = params.extractionProfile || 'pdf_primary_v1';
  const parserVersion = structured.parserVersion || PDF_TEXT_PARSER_VERSION;
  const pageBoundaryConfirmed = structured.pageBoundaryConfirmed === true;
  const pageTextByNumber = new Map((structured.pages || []).map((p) => [p.pageNumber, p.text || '']));

  for (const page of structured.pages || []) {
    if (!pageBoundaryConfirmed) continue;
    for (const para of page.paragraphs || []) {
      seq += 1;
      const id = stableEvidenceId(params.sourcePdfSha256, page.pageNumber, seq, para.text, parserVersion);
      blocks.push({
        documentEvidenceId: id,
        publicationId: params.publicationId,
        extractionRevisionId: params.extractionRevisionId,
        sourcePdfSha256: params.sourcePdfSha256,
        extractionProfile: profile,
        parserVersion,
        physicalPageIndex: page.physicalPageIndex ?? page.pageNumber,
        pageNumber: page.pageNumber,
        printedPageLabel: page.printedPageLabel || null,
        sectionReference: findSectionForPage(structured.sections, page.pageNumber),
        paragraphReference: para.paragraphIndex ? `${page.pageNumber}.${para.paragraphIndex}` : null,
        extractedText: para.text,
        evidenceCompletenessStatus: page.evidenceCompleteness || structured.extractionStatus || 'unknown',
        pageBoundaryConfirmed: true,
        pageExtractionStatus: page.extractionStatus || 'unknown',
        provenance: {
          document: 'primary_pdf',
          sourcePdfSha256: params.sourcePdfSha256,
          physicalPageIndex: page.physicalPageIndex ?? page.pageNumber,
          pageNumber: page.pageNumber,
        },
      });
    }
  }

  for (const clause of structured.clauses || []) {
    if (!pageBoundaryConfirmed) continue;
    const pageText = pageTextByNumber.get(clause.pageNumber) || '';
    if (!pageTextIncludesExcerpt(pageText, clause.text)) continue;
    seq += 1;
    const id = stableEvidenceId(params.sourcePdfSha256, clause.pageNumber, seq, clause.text, parserVersion);
    blocks.push({
      documentEvidenceId: id,
      publicationId: params.publicationId,
      extractionRevisionId: params.extractionRevisionId,
      sourcePdfSha256: params.sourcePdfSha256,
      extractionProfile: profile,
      parserVersion,
      physicalPageIndex: clause.pageNumber,
      pageNumber: clause.pageNumber,
      sectionReference: clause.number,
      paragraphReference: clause.number,
      extractedText: clause.text,
      evidenceCompletenessStatus: structured.extractionStatus || 'unknown',
      pageBoundaryConfirmed: true,
      kind: 'numbered_clause',
      provenance: {
        document: 'primary_pdf',
        sourcePdfSha256: params.sourcePdfSha256,
        pageNumber: clause.pageNumber,
      },
    });
  }

  return blocks;
}

/**
 * @param {object[]} blocks
 * @param {object} structured
 */
export function validatePdfEvidenceBlocks(blocks, structured) {
  const issues = [];
  if (structured.pageBoundaryConfirmed !== true) {
    issues.push('page_boundaries_not_confirmed_no_page_citations');
    return { ok: false, issues, blocks: [] };
  }
  const pageTextByNumber = new Map((structured.pages || []).map((p) => [p.pageNumber, p.text || '']));
  const seenIds = new Set();
  const accepted = [];

  for (const block of blocks) {
    if (seenIds.has(block.documentEvidenceId)) {
      issues.push(`duplicate_evidence_id:${block.documentEvidenceId}`);
      continue;
    }
    seenIds.add(block.documentEvidenceId);
    const pageText = pageTextByNumber.get(block.pageNumber);
    if (!pageText) {
      issues.push(`missing_page_text:${block.pageNumber}`);
      continue;
    }
    if (!pageTextIncludesExcerpt(pageText, block.extractedText)) {
      issues.push(`excerpt_not_on_page:${block.documentEvidenceId}:p${block.pageNumber}`);
      continue;
    }
    accepted.push(block);
  }

  return { ok: issues.length === 0, issues, blocks: accepted };
}

export function pageTextIncludesExcerpt(pageText, excerpt) {
  const pageNorm = normalizeForMatch(pageText);
  const exNorm = normalizeForMatch(excerpt);
  if (!exNorm) return false;
  if (exNorm.length <= 80) return pageNorm.includes(exNorm);
  return pageNorm.includes(exNorm.slice(0, 80));
}

function stableEvidenceId(pdfSha, pageNumber, seq, text, parserVersion) {
  const digest = createHash('sha256')
    .update(`${pdfSha}:${parserVersion}:${pageNumber}:${seq}:${text.slice(0, 120)}`, 'utf8')
    .digest('hex')
    .slice(0, 16);
  return `EVD-PDF-${digest}`;
}

function findSectionForPage(sections, pageNumber) {
  const onPage = (sections || []).filter((s) => s.pageNumber === pageNumber);
  return onPage.length ? onPage[onPage.length - 1].heading : null;
}

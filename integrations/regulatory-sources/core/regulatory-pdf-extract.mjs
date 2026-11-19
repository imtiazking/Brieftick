import { createHash } from 'node:crypto';
import { buildPdfEvidenceBlocks, validatePdfEvidenceBlocks } from './pdf-evidence-blocks.mjs';
import { parsePdfPhysicalPages, PDF_PHYSICAL_PARSER_VERSION } from './pdf-physical-page-parser.mjs';

export const PDF_TEXT_PARSER_VERSION = PDF_PHYSICAL_PARSER_VERSION;

const DATE_RE =
  /\b(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}|\d{4}-\d{2}-\d{2})\b/gi;
const REG_REF_RE = /\b(CP\d{1,3}\/\d{1,3}|PS\d{2}\/\d{1,2}|FG\d{2}\/\d{1,2}|SYSC|COBS|PRIN)\b/gi;
const CLAUSE_RE = /^\s*(\d+(?:\.\d+)+)\s+(.+)$/;

/**
 * @param {Buffer} pdfBytes
 * @param {object} [options]
 * @param {(buf: Buffer) => Promise<{ text: string, numpages: number, pageTexts?: string[], pages?: object[] }>} [options.parsePdf]
 */
export async function extractRegulatoryPdfContent(pdfBytes, options = {}) {
  const parsePdf = options.parsePdf || defaultParsePdf;
  let parsed;
  try {
    parsed = await parsePdf(pdfBytes);
  } catch (e) {
    return {
      ok: false,
      code: 'PDF_PARSE_FAILED',
      message: e.message || 'PDF parse failed',
      parserVersion: PDF_TEXT_PARSER_VERSION,
      requiresAdditionalProcessing: true,
      ocrRecommended: true,
    };
  }

  const physicalPages = parsed.pages?.length
    ? parsed.pages
    : (parsed.pageTexts || []).map((text, idx) => ({
        physicalPageIndex: idx + 1,
        pageNumber: idx + 1,
        printedPageLabel: null,
        text: String(text || ''),
        characterCount: String(text || '').length,
        extractionStatus: String(text || '').trim() ? 'extracted' : 'empty',
        evidenceCompleteness: String(text || '').trim() ? 'complete' : 'incomplete',
        warnings: [],
      }));

  const pageCount = physicalPages.length || parsed.numpages || 1;
  const pageBoundaryConfirmed = physicalPages.length > 0 && physicalPages.length === (parsed.numpages || physicalPages.length);
  const warnings = [];
  if (!pageBoundaryConfirmed) warnings.push('physical_page_boundary_not_confirmed');

  const pages = physicalPages.map((meta) => buildPageRecord(meta));
  const fullText = pages.map((p) => p.text).join('\n\n').trim();

  const title = inferDocumentTitle(fullText, options.expectedTitle);
  const sections = inferSections(pages);
  const clauses = inferClauses(pages);
  const dates = uniqueMatches(fullText, DATE_RE);
  const regulatoryReferences = uniqueMatches(fullText, REG_REF_RE);

  const emptyPages = physicalPages.filter((p) => p.extractionStatus === 'empty' || p.extractionStatus === 'missing_render');
  const lowTextPages = physicalPages.filter((p) => p.extractionStatus === 'low_text');
  if (emptyPages.length) warnings.push(`empty_or_missing_pages:${emptyPages.length}`);
  if (lowTextPages.length) warnings.push(`low_text_pages:${lowTextPages.length}`);

  const charCount = fullText.replace(/\s+/g, '').length;
  let extractionStatus = 'complete';
  if (charCount < 80) extractionStatus = 'requires_ocr';
  else if (charCount < 400 || !pageBoundaryConfirmed) extractionStatus = 'partial';
  if (!title) warnings.push('document_title_not_inferred');

  const structured = {
    kind: 'regulatory_pdf_structured_extraction',
    parserVersion: PDF_TEXT_PARSER_VERSION,
    documentTitle: title,
    pageCount,
    pageBoundaryConfirmed,
    pages,
    physicalPageSummary: {
      total: pageCount,
      extracted: physicalPages.filter((p) => p.extractionStatus === 'extracted').length,
      empty: emptyPages.length,
      lowText: lowTextPages.length,
    },
    sections,
    clauses,
    tables: detectTableHints(pages),
    dates,
    regulatoryReferences,
    appendices: inferAppendices(sections),
    footnotes: extractFootnoteHints(pages),
    extractionStatus,
    warnings,
    metrics: {
      totalCharacters: fullText.length,
      paragraphCount: pages.reduce((n, p) => n + p.paragraphs.length, 0),
    },
  };

  const fingerprint = fingerprintStructuredExtraction(structured, fullText);
  let evidenceBlocks = [];
  if (options.evidenceContext) {
    evidenceBlocks = buildPdfEvidenceBlocks(options.evidenceContext, structured);
    const validation = validatePdfEvidenceBlocks(evidenceBlocks, structured);
    if (!validation.ok) warnings.push(...validation.issues.map((i) => `evidence_validation:${i}`));
    structured.evidenceValidation = validation;
  }

  return {
    ok: true,
    parserVersion: PDF_TEXT_PARSER_VERSION,
    documentTitle: title,
    pageCount,
    fullText,
    structured,
    evidenceBlocks,
    derivedContentFingerprint: fingerprint,
    extractionStatus,
    warnings,
    requiresAdditionalProcessing: extractionStatus === 'requires_ocr',
    ocrRecommended: extractionStatus === 'requires_ocr',
  };
}

function fingerprintStructuredExtraction(structured, fullText) {
  const payload = JSON.stringify({
    parserVersion: structured.parserVersion,
    pageCount: structured.pageCount,
    textSha256: createHash('sha256').update(fullText, 'utf8').digest('hex'),
    sectionCount: structured.sections.length,
    clauseCount: structured.clauses.length,
  });
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

function extractFootnoteHints(pages) {
  const footnotes = [];
  for (const page of pages) {
    for (const para of page.paragraphs) {
      if (/^\d+\s{2,}[A-Z]/.test(para.text) || /^[*†]/.test(para.text)) {
        footnotes.push({
          pageNumber: page.pageNumber,
          text: para.text.slice(0, 300),
          confidence: 'low',
        });
      }
    }
  }
  return footnotes;
}

function buildPageRecord(meta) {
  const pageNumber = meta.pageNumber;
  const text = meta.text || '';
  const paragraphs = String(text)
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 0)
    .map((p, i) => ({
      type: 'paragraph',
      text: p,
      paragraphIndex: i + 1,
      pageNumber,
      physicalPageIndex: meta.physicalPageIndex,
      source: { document: 'primary_pdf', pageNumber, physicalPageIndex: meta.physicalPageIndex },
    }));
  return {
    physicalPageIndex: meta.physicalPageIndex,
    pageNumber,
    printedPageLabel: meta.printedPageLabel || null,
    characterCount: meta.characterCount ?? text.length,
    extractionStatus: meta.extractionStatus || 'unknown',
    evidenceCompleteness: meta.evidenceCompleteness || 'unknown',
    warnings: meta.warnings || [],
    text: paragraphs.map((p) => p.text).join('\n\n'),
    paragraphs,
    headings: paragraphs
      .filter((p) => isHeadingLine(p.text))
      .map((p) => ({ text: p.text, pageNumber, level: headingLevel(p.text) })),
  };
}

function isHeadingLine(line) {
  const t = line.trim();
  if (t.length < 4 || t.length > 120) return false;
  if (/^\d+\./.test(t)) return false;
  return /^[A-Z0-9][A-Za-z0-9\s,'()-]{3,}$/.test(t) && !t.endsWith('.');
}

function headingLevel(line) {
  if (/^[A-Z\s]{8,}$/.test(line.trim())) return 1;
  return 2;
}

function inferDocumentTitle(fullText, expectedTitle) {
  if (expectedTitle) return expectedTitle;
  const firstLines = fullText.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of firstLines.slice(0, 12)) {
    if (/CP\d{1,3}\/\d{1,3}/i.test(line) || /financial crime/i.test(line)) {
      return line.slice(0, 240);
    }
  }
  return firstLines[0]?.slice(0, 240) || null;
}

function inferSections(pages) {
  const sections = [];
  for (const page of pages) {
    for (const h of page.headings || []) {
      sections.push({
        heading: h.text,
        level: h.level,
        pageNumber: h.pageNumber,
        source: { document: 'primary_pdf', pageNumber: h.pageNumber },
      });
    }
  }
  return sections;
}

function inferClauses(pages) {
  const clauses = [];
  for (const page of pages) {
    for (const para of page.paragraphs) {
      const m = CLAUSE_RE.exec(para.text);
      if (m) {
        clauses.push({
          number: m[1],
          text: m[2].trim(),
          pageNumber: page.pageNumber,
          source: { document: 'primary_pdf', pageNumber: page.pageNumber },
        });
      }
    }
  }
  return clauses;
}

function inferAppendices(sections) {
  return sections
    .filter((s) => /^appendix\b/i.test(s.heading))
    .map((s) => ({ title: s.heading, pageNumber: s.pageNumber }));
}

function detectTableHints(pages) {
  const tables = [];
  for (const page of pages) {
    const lines = page.text.split('\n').filter((l) => l.trim());
    const pipeRows = lines.filter((l) => l.includes('|') || /\t/.test(l));
    if (pipeRows.length >= 3) {
      tables.push({
        pageNumber: page.pageNumber,
        rowCount: pipeRows.length,
        confidence: 'low',
        source: { document: 'primary_pdf', pageNumber: page.pageNumber },
      });
    }
  }
  return tables;
}

function uniqueMatches(text, re) {
  const found = new Set();
  const out = [];
  let m;
  const r = new RegExp(re.source, re.flags);
  while ((m = r.exec(text)) !== null) {
    const v = m[1] || m[0];
    if (!found.has(v)) {
      found.add(v);
      out.push(v);
    }
  }
  return out;
}

async function defaultParsePdf(buffer) {
  return parsePdfPhysicalPages(buffer);
}

import { loadPdfParseModule } from './pdf-parse-loader.mjs';

export const PDF_PHYSICAL_PARSER_VERSION = 'pdf-physical-pages-v2.0';

/**
 * @param {Buffer} buffer
 * @returns {Promise<{ numpages: number, text: string, pageTexts: string[], pages: object[], parserVersion: string }>}
 */
export async function parsePdfPhysicalPages(buffer) {
  const pdfParse = loadPdfParseModule();
  const pages = [];
  let physicalIndex = 0;

  async function pagerender(pageData) {
    physicalIndex += 1;
    const physicalPageIndex = physicalIndex;
    const textContent = await pageData.getTextContent({
      normalizeWhitespace: false,
      disableCombineTextItems: false,
    });
    let text = '';
    for (const item of textContent.items) {
      text += item.str;
      if (item.hasEOL) text += '\n';
    }
    const trimmed = text.trim();
    const nonWs = trimmed.replace(/\s+/g, '');
    let extractionStatus = 'extracted';
    if (!nonWs.length) extractionStatus = 'empty';
    else if (nonWs.length < 24) extractionStatus = 'low_text';

    const printedPageLabel = inferPrintedPageLabel(trimmed);
    const warnings = [];
    if (extractionStatus === 'empty') warnings.push('page_text_empty');
    if (extractionStatus === 'low_text') warnings.push('page_text_low_yield');

    pages[physicalPageIndex - 1] = {
      physicalPageIndex,
      pageNumber: physicalPageIndex,
      printedPageLabel,
      text: trimmed,
      characterCount: trimmed.length,
      extractionStatus,
      evidenceCompleteness: extractionStatus === 'extracted' ? 'complete' : 'incomplete',
      warnings,
    };
    return text;
  }

  const data = await pdfParse(buffer, { pagerender });
  const numpages = data.numpages || pages.length;
  while (pages.length < numpages) {
    const idx = pages.length + 1;
    pages.push({
      physicalPageIndex: idx,
      pageNumber: idx,
      printedPageLabel: null,
      text: '',
      characterCount: 0,
      extractionStatus: 'missing_render',
      evidenceCompleteness: 'incomplete',
      warnings: ['page_render_missing'],
    });
  }

  const pageTexts = pages.map((p) => p.text);
  const combined = pageTexts.join('\n\n');
  return {
    numpages,
    text: combined,
    pageTexts,
    pages,
    parserVersion: PDF_PHYSICAL_PARSER_VERSION,
  };
}

function inferPrintedPageLabel(pageText) {
  const lines = pageText.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines.slice(-4)) {
    if (/^\d{1,3}$/.test(line)) return line;
    if (/^page\s+\d+/i.test(line)) return line.replace(/^page\s+/i, '');
  }
  return null;
}

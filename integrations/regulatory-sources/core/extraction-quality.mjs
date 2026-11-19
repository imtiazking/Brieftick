import { stripHtmlToPlainText } from './html-publication-text.mjs';

const TIMELINE_ONLY_RE =
  /^consultation opens\b.*\bconsultation closes\b/i;

/**
 * @param {object} input
 * @param {string} input.plainText
 * @param {string} [input.htmlRegion]
 * @param {number} [input.rawByteLength]
 * @param {object[]} [input.pdfAttachments]
 * @param {string} [input.canonicalUrl]
 * @param {object} [input.publicationMetadata]
 * @param {boolean} [input.primaryPdfCaptured]
 */
export function assessExtractionQuality(input) {
  const plainText = String(input.plainText || '').trim();
  const rawLen = input.rawByteLength ?? 0;
  const pdfAttachments = input.pdfAttachments || [];
  const meta = input.publicationMetadata || {};
  const primaryPdfCaptured = input.primaryPdfCaptured === true;
  const signals = [];
  let webpageScore = 100;

  const headingCount = countHeadings(input.htmlRegion || '');
  const paragraphCount = countParagraphs(input.htmlRegion || '');
  const alphaWords = plainText.match(/[a-zA-Z]{4,}/g) || [];

  if (!plainText) {
    signals.push('empty_plain_text');
    webpageScore = 0;
  }

  if (plainText.length < 120 && rawLen > 50_000) {
    signals.push('short_text_large_raw');
    webpageScore -= 40;
  }

  if (TIMELINE_ONLY_RE.test(plainText) && plainText.length < 200) {
    signals.push('timeline_only_extraction');
    webpageScore -= 50;
  }

  if (headingCount < 1 && plainText.length > 0) {
    signals.push('missing_headings');
    webpageScore -= 15;
  }

  if (paragraphCount < 1 && plainText.length > 0) {
    signals.push('missing_paragraphs');
    webpageScore -= 20;
  }

  const url = String(input.canonicalUrl || '').toLowerCase();
  const isConsultationPage = url.includes('/consultation-papers/') || url.includes('/consultation-paper/');
  if (isConsultationPage) {
    if (!/consult/i.test(plainText) && !/financial crime|regulatory|firm/i.test(plainText)) {
      signals.push('consultation_page_missing_substance');
      webpageScore -= 25;
    }
  }

  if (alphaWords.length < 8 && plainText.length > 0) {
    signals.push('low_lexical_coverage');
    webpageScore -= 20;
  }

  webpageScore = Math.max(0, Math.min(100, webpageScore));
  let webpageConfidence = 'high';
  if (webpageScore < 70) webpageConfidence = 'medium';
  if (webpageScore < 45) webpageConfidence = 'low';

  let webpageStatus = 'complete';
  if (
    webpageScore < 45 ||
    signals.includes('timeline_only_extraction') ||
    signals.includes('empty_plain_text')
  ) {
    webpageStatus = 'failed';
  } else if (webpageScore < 70 || signals.includes('short_text_large_raw')) {
    webpageStatus = 'incomplete';
  }

  const hasPrimaryPdfLink = pdfAttachments.some((p) => p.likelyPrimaryRegulatoryDocument);
  const primaryDocument = {
    classification: hasPrimaryPdfLink ? 'pdf_primary' : 'webpage_only',
    primaryPdfCaptured,
    primaryPdfUrl: meta.primaryPdf?.url || pdfAttachments.find((p) => p.likelyPrimaryRegulatoryDocument)?.url || null,
    completeness: hasPrimaryPdfLink && !primaryPdfCaptured ? 'not_captured' : primaryPdfCaptured ? 'captured' : 'not_applicable',
  };

  if (hasPrimaryPdfLink && !primaryPdfCaptured) {
    signals.push('primary_pdf_not_captured');
  }

  let primaryDocumentStatus = 'complete';
  if (hasPrimaryPdfLink && !primaryPdfCaptured) {
    primaryDocumentStatus = 'not_captured';
  }

  const obligationGradeSuitable =
    webpageStatus === 'complete' &&
    webpageConfidence === 'high' &&
    primaryDocumentStatus === 'complete' &&
    !signals.includes('primary_pdf_not_captured');

  return {
    status: webpageStatus,
    confidence: webpageConfidence,
    score: webpageScore,
    signals,
    metrics: {
      plainTextLength: plainText.length,
      headingCount,
      paragraphCount,
      alphaWordCount: alphaWords.length,
      pdfAttachmentCount: pdfAttachments.length,
    },
    webpageExtraction: {
      status: webpageStatus,
      confidence: webpageConfidence,
      score: webpageScore,
    },
    primaryDocument,
    obligationGradeSuitable,
  };
}

function countHeadings(html) {
  return (String(html).match(/<h[1-6]\b/gi) || []).length;
}

function countParagraphs(html) {
  return (String(html).match(/<p\b/gi) || []).length;
}

/**
 * PDF parsing boundary — retrieval separate from text extraction.
 * Design Lab uses fixture-extracted text; production would use a server-side parser.
 */
import { CONNECTOR_ERRORS, connectorError } from './connector-errors.js';

export const PDF_PARSER_VERSION = 'PDF-BOUNDARY-1.0';

export function parsePdfBoundary(bytes, fixtureText = null) {
  const sizeBytes = bytes?.length || 0;
  const meta = {
    mediaType: 'application/pdf',
    sizeBytes,
    pageCount: null,
    parserVersion: PDF_PARSER_VERSION,
  };
  if (fixtureText) {
    return {
      ok: true,
      ...meta,
      text: fixtureText,
      parseQuality: 'Complete',
      warnings: ['extracted from fixture text — not live OCR'],
      untrustedContentTag: 'UNTRUSTED_SOURCE_CONTENT',
    };
  }
  return {
    ok: true,
    ...meta,
    text: null,
    parseQuality: 'Partial',
    warnings: ['PDF text extraction not performed in Design Lab — metadata only'],
    untrustedContentTag: 'UNTRUSTED_SOURCE_CONTENT',
  };
}

export function validatePdfContentType(contentType) {
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('pdf')) return { ok: true };
  return connectorError(CONNECTOR_ERRORS.CONTENT_TYPE_UNSUPPORTED, `Expected PDF, got ${contentType || 'unknown'}`);
}

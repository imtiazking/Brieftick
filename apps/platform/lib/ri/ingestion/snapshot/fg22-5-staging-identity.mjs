import { FG22_5_PRIMARY_PDF_URL } from '../../../../../../integrations/regulatory-sources/core/regulatory-pdf-allowlist.mjs';
import { FG22_5_EXPECTED_PRIMARY_PDF_SHA256 } from './fg22-5-landing-resolve.mjs';

export const FG22_5_STAGING = {
  externalDocumentId: 'FG22/5',
  title: 'FG22/5 — Final non-Handbook Guidance for firms on the Consumer Duty',
  publicationType: 'finalised_guidance',
  /** Catalogue canonical identity (primary regulatory artefact). */
  canonicalPdfUrl: FG22_5_PRIMARY_PDF_URL,
  primaryPdfUrl: FG22_5_PRIMARY_PDF_URL,
  expectedPrimaryPdfSha256: FG22_5_EXPECTED_PRIMARY_PDF_SHA256,
  sourceId: 'SRC-FCA-PUBLICATIONS-RSS',
  regulatorId: 'REG-FCA',
  /** Must remain isolated from Fair value supervisory examples page. */
  fairValuePublicationId: '56b0beca-d8c3-4267-a794-9079009af661',
  fairValueHtmlRevisionId: '613c078c-3639-4ce5-9666-73c5352f44fd',
};

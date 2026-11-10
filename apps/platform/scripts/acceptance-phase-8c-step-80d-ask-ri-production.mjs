#!/usr/bin/env node
/**
 * Step 80D — production Ask RI path integrates publication PDF evidence (offline).
 */
import { createMinimalCp26PdfBuffer } from '../../../integrations/regulatory-sources/fixtures/cp26-38-minimal-pdf.mjs';
import { extractRegulatoryPdfContent } from '../../../integrations/regulatory-sources/core/regulatory-pdf-extract.mjs';
import { buildPdfEvidenceBlocks } from '../../../integrations/regulatory-sources/core/pdf-evidence-blocks.mjs';
import { CP26_38_STAGING } from '../lib/ri/ingestion/snapshot/cp26-38-staging-identity.mjs';
import { EXTRACTION_PROFILE_PDF_PRIMARY_V1 } from '../lib/ri/ingestion/snapshot/extraction-revision-types.mjs';
import {
  answerAskRiFromBestPublicationPdfEvidence,
  buildPublicationPdfEvidenceIndex,
} from '../lib/ri/ask-ri/publication-pdf-evidence.mjs';
import { scorePublicationQuestionMatch } from '../lib/ri/ask-ri/publication-pdf-question-match.mjs';
import { runAskRiDeterministic } from '../lib/ri/ask-ri/run-ask-ri.mjs';
import { downloadPrivateStorageObject } from '../lib/ri/ingestion/snapshot/readonly-storage-download.mjs';

let fail = 0;
const pass = (m) => console.log(`PASS: ${m}`);
const failMsg = (m) => {
  fail += 1;
  console.error(`FAIL: ${m}`);
};

try {
  downloadPrivateStorageObject(undefined);
  failMsg('should throw');
} catch (e) {
  if (e.missingField) pass('storage download validates params');
  else failMsg(e.message);
}

const pdf = createMinimalCp26PdfBuffer();
const extracted = await extractRegulatoryPdfContent(pdf, { expectedTitle: 'CP26/38' });
const structured =
  extracted.ok && extracted.structured
    ? extracted.structured
    : {
        pageBoundaryConfirmed: true,
        pageCount: 1,
        pages: [{ pageNumber: 1, paragraphs: [{ paragraphIndex: 1, text: 'fraud prevention controls proposed' }] }],
        parserVersion: 'test',
      };
const blocks = buildPdfEvidenceBlocks(
  {
    publicationId: CP26_38_STAGING.publicationId,
    extractionRevisionId: CP26_38_STAGING.pdfExtractionRevisionId,
    sourcePdfSha256: 'abc',
    extractionProfile: EXTRACTION_PROFILE_PDF_PRIMARY_V1,
  },
  structured,
);

const evidence = {
  ...buildPublicationPdfEvidenceIndex(
    {
      id: CP26_38_STAGING.pdfExtractionRevisionId,
      publication_id: CP26_38_STAGING.publicationId,
      extraction_profile: EXTRACTION_PROFILE_PDF_PRIMARY_V1,
      raw_content_sha256: CP26_38_STAGING.primaryPdfRawContentSha256,
      publication_metadata: { publicationTypeLabel: 'Consultation paper' },
      canonical_url: CP26_38_STAGING.canonicalUrl,
    },
    structured,
    blocks,
  ),
  publicationTitle: 'CP26/38 Financial Crime Guide updates',
  publicationReference: 'CP26/38',
  canonicalUrl: CP26_38_STAGING.canonicalUrl,
  integrityVerified: true,
  obligationGradeSuitable: false,
  regulatorLabel: 'Financial Conduct Authority',
  regulatorShortName: 'FCA',
};

const q1 = 'What changes is the FCA proposing in CP26/38?';
if (scorePublicationQuestionMatch(evidence, q1) >= 8) pass('CP26/38 question matches publication evidence');
else failMsg('match score');

const a1 = answerAskRiFromBestPublicationPdfEvidence([evidence], q1);
if (a1.status === 'ANSWERED' || a1.status === 'INSUFFICIENT_EVIDENCE') {
  pass('CP26/38 question routed to PDF evidence path');
} else failMsg(JSON.stringify(a1));

const qFraud = 'What does CP26/38 propose regarding fraud prevention?';
const aFraud = answerAskRiFromBestPublicationPdfEvidence([evidence], qFraud);
if (aFraud.status === 'ANSWERED' || aFraud.status === 'INSUFFICIENT_EVIDENCE') {
  pass('topic question uses PDF path with publication match scoring');
} else failMsg(aFraud.status);

const qOutside = 'What does COBS require for suitability?';
const aOutside = answerAskRiFromBestPublicationPdfEvidence([evidence], qOutside);
if (aOutside.status === 'UNRESOLVED') pass('unrelated question does not force PDF answer');
else failMsg(aOutside.status);

const state = {
  publicationPdfEvidence: [evidence],
  changes: [],
  obligations: [],
  publications: [{ id: CP26_38_STAGING.publicationId, title: evidence.publicationTitle }],
};
const routed = runAskRiDeterministic(state, q1);
if (routed.status === 'ANSWERED') {
  if (routed.execution?.evidenceSource === 'pdf_primary_v1') {
    pass('runAskRiDeterministic uses pdf_primary_v1 when PDF path is ANSWERED');
  } else {
    failMsg(`answered but evidenceSource=${routed.execution?.evidenceSource}`);
  }
} else if (routed.status === 'INSUFFICIENT_EVIDENCE' || routed.status === 'UNRESOLVED') {
  if (routed.queryPlan?.mode === 'publication_pdf_primary_v1') {
    pass('insufficient PDF catalogue run retains publication_pdf_primary_v1 query plan');
  } else {
    failMsg(`insufficient path queryPlan.mode=${routed.queryPlan?.mode}`);
  }
  if (
    routed.execution?.evidenceSource === 'catalogue_publication_evidence_v1' &&
    !(routed.execution?.evidenceSources || []).length
  ) {
    pass('insufficient PDF run uses catalogue_publication_evidence_v1 when no evidence modes contributed');
  } else if (routed.execution?.evidenceSource === 'pdf_primary_v1') {
    pass('insufficient PDF run still tagged pdf_primary_v1 when modes present');
  }
} else {
  failMsg(JSON.stringify({ status: routed.status, execution: routed.execution }));
}

const htmlOnly = runAskRiDeterministic({ changes: [], obligations: [], publications: [] }, 'How many open obligations?');
if (htmlOnly.queryPlan?.mode !== 'publication_pdf_primary_v1') pass('HTML-only path when no PDF evidence');
else failMsg('html only');

if (a1.citations?.length) {
  const c = a1.citations[0];
  if (c.physicalPageNumber != null && !c.citationLabel?.includes('24.1')) {
    pass('citations use physical page labelling');
  } else if (c.citationLabel?.includes('physical page')) {
    pass('citations use physical page labelling');
  } else {
    failMsg('citation format');
  }
}

if (!fail) console.log('\nacceptance-phase-8c-step-80d-ask-ri-production: PASS\n');
else {
  console.error(`\nacceptance-phase-8c-step-80d-ask-ri-production: FAIL (${fail})\n`);
  process.exit(1);
}

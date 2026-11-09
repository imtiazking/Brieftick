#!/usr/bin/env node
/**
 * BUS-UAT-018 — Ask RI must route publication-titled questions to pdf_primary_v1 (not tenant Record).
 */
import {
  CONSUMER_DUTY_FAIR_VALUE_ASK_RI_QUESTION,
  questionMentionsPublicationReference,
  scorePublicationQuestionMatch,
  selectBestPublicationPdfEvidence,
} from '../lib/ri/ask-ri/publication-pdf-question-match.mjs';
import { runAskRiDeterministic } from '../lib/ri/ask-ri/run-ask-ri.mjs';
import { buildPdfEvidenceBlocks } from '../../../integrations/regulatory-sources/core/pdf-evidence-blocks.mjs';
import {
  answerAskRiFromPublicationPdfEvidence,
  buildPublicationPdfEvidenceIndex,
} from '../lib/ri/ask-ri/publication-pdf-evidence.mjs';
import { EXTRACTION_PROFILE_PDF_PRIMARY_V1 } from '../lib/ri/ingestion/snapshot/extraction-revision-types.mjs';

const FAIR_VALUE_PUB_ID = '56b0beca-d8c3-4267-a794-9079009af661';

let fail = 0;
const pass = (m) => console.log(`PASS: ${m}`);
const failMsg = (m) => {
  fail += 1;
  console.error(`FAIL: ${m}`);
};

if (questionMentionsPublicationReference(CONSUMER_DUTY_FAIR_VALUE_ASK_RI_QUESTION)) {
  pass('Consumer Duty question detected as publication-scoped');
} else failMsg('Consumer Duty question not publication-scoped');

if (!questionMentionsPublicationReference('What regulatory changes are open for our organisation?')) {
  pass('tenant-only question not publication-scoped');
} else failMsg('tenant question wrongly publication-scoped');

const fairValueStructured = {
  pageBoundaryConfirmed: true,
  pageCount: 2,
  pages: [
    {
      pageNumber: 1,
      paragraphs: [
        {
          paragraphIndex: 1,
          text: 'Under the Consumer Duty, firms must deliver fair value in consumer finance products and services.',
        },
      ],
    },
    {
      pageNumber: 2,
      paragraphs: [
        {
          paragraphIndex: 1,
          text: 'Fair value assessments should consider the nature of the product, expected total price, and supporting evidence.',
        },
      ],
    },
  ],
  parserVersion: 'test',
};

const fairValueBlocks = buildPdfEvidenceBlocks(
  {
    publicationId: FAIR_VALUE_PUB_ID,
    extractionRevisionId: 'rev-fair-value-test',
    sourcePdfSha256: 'abc123',
    extractionProfile: EXTRACTION_PROFILE_PDF_PRIMARY_V1,
  },
  fairValueStructured,
);

const fairValueEvidence = buildPublicationPdfEvidenceIndex(
  {
    revision_id: 'rev-fair-value-test',
    publication_id: FAIR_VALUE_PUB_ID,
    extraction_profile: EXTRACTION_PROFILE_PDF_PRIMARY_V1,
    raw_content_sha256: 'abc123',
    publication_metadata: { publicationTypeLabel: 'Policy statement' },
    canonical_url: 'https://www.fca.org.uk/publications/policy-statements/fair-value-consumer-finance',
  },
  fairValueStructured,
  fairValueBlocks,
);

const enrichedEvidence = {
  ...fairValueEvidence,
  publicationTitle: 'Fair value in consumer finance',
  publicationReference: 'PS22/9',
  regulatorShortName: 'FCA',
  regulatorLabel: 'Financial Conduct Authority',
  integrityVerified: true,
  obligationGradeSuitable: false,
};

const matchScore = scorePublicationQuestionMatch(enrichedEvidence, CONSUMER_DUTY_FAIR_VALUE_ASK_RI_QUESTION);
if (matchScore >= 8) pass(`Fair value evidence match score ${matchScore}`);
else failMsg(`Fair value match score ${matchScore}`);

const best = selectBestPublicationPdfEvidence([enrichedEvidence], CONSUMER_DUTY_FAIR_VALUE_ASK_RI_QUESTION);
if (best?.publicationId === FAIR_VALUE_PUB_ID) pass('Best evidence selects Fair value publication');
else failMsg('Best evidence not selected');

const directAnswer = answerAskRiFromPublicationPdfEvidence(
  enrichedEvidence,
  CONSUMER_DUTY_FAIR_VALUE_ASK_RI_QUESTION,
);
if (directAnswer.status === 'ANSWERED' && (directAnswer.citations?.length || 0) >= 1) {
  pass(`direct PDF answer with ${directAnswer.citations.length} citation(s)`);
} else failMsg(`direct answer status ${directAnswer.status} citations ${directAnswer.citations?.length ?? 0}`);

const answered = runAskRiDeterministic(
  { publicationPdfEvidence: [enrichedEvidence], publicationPdfEvidenceErrors: [] },
  CONSUMER_DUTY_FAIR_VALUE_ASK_RI_QUESTION,
);

if (answered.execution?.evidenceSource === 'pdf_primary_v1') pass('routed to pdf_primary_v1');
else failMsg(`evidence source ${answered.execution?.evidenceSource}`);

if (answered.status === 'ANSWERED' && (answered.citations?.length || 0) >= 1) {
  pass(`ANSWERED with ${answered.citations.length} citations`);
} else failMsg(`status ${answered.status} citations ${answered.citations?.length ?? 0}`);

if (!String(answered.answer || '').includes('Record records')) pass('no misleading Record fallback copy');
else failMsg('Record fallback message on publication-titled question');

const emptyPdf = runAskRiDeterministic(
  { publicationPdfEvidence: [], publicationPdfEvidenceErrors: [{ code: 'revision_query_zero_rows' }] },
  CONSUMER_DUTY_FAIR_VALUE_ASK_RI_QUESTION,
);

if (emptyPdf.queryPlan?.mode === 'publication_pdf_primary_v1') pass('empty PDF stays on pdf plan');
else failMsg(`empty pdf plan ${JSON.stringify(emptyPdf.queryPlan)}`);

if (!String(emptyPdf.answer || '').includes('Record records')) pass('empty PDF avoids Record message');
else failMsg('Record message on empty PDF Consumer Duty question');

if (fail) process.exit(1);
console.log('\nacceptance-phase-8-bus-uat-018-ask-ri-publication-title: PASS\n');

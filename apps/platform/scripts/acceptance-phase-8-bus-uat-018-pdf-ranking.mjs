#!/usr/bin/env node
/**
 * BUS-UAT-018 — PDF block ranking prioritises substantive Chapter 7 fair-value passages over intro pages.
 */
import { FG22_5_PRIMARY_PDF_URL } from '../../../integrations/regulatory-sources/core/regulatory-pdf-allowlist.mjs';
import { analyzeRegulatoryPdfDocument } from '../../../integrations/regulatory-sources/core/regulatory-pdf-analysis.mjs';
import {
  CONSUMER_DUTY_FAIR_VALUE_ASK_RI_QUESTION,
  rankEvidenceBlocksForQuestion,
  selectRankedBlocksForCitations,
  scoreEvidenceBlockForQuestion,
} from '../lib/ri/ask-ri/publication-pdf-question-match.mjs';
import { answerAskRiFromPublicationPdfEvidence } from '../lib/ri/ask-ri/publication-pdf-evidence.mjs';

let fail = 0;
const pass = (m) => console.log(`PASS: ${m}`);
const failMsg = (m) => {
  fail += 1;
  console.error(`FAIL: ${m}`);
};

const introBlocks = [2, 3, 4, 5].map((page) => ({
  documentEvidenceId: `intro-${page}`,
  pageNumber: page,
  sectionReference: 'Introduction',
  extractedText:
    'FG22/5 Final non-Handbook Guidance for firms on the Consumer Duty. This guidance sets out our expectations on the Consumer Duty and fair value in consumer finance.',
}));

const ch7Blocks = [
  {
    documentEvidenceId: 'ch7-1',
    pageNumber: 48,
    sectionReference: '7.1',
    kind: 'numbered_clause',
    extractedText:
      '7.1 The price and value outcome. Firms should ensure fair value for retail customers across products and services under the Consumer Duty.',
  },
  {
    documentEvidenceId: 'ch7-2',
    pageNumber: 49,
    sectionReference: '7.9',
    kind: 'numbered_clause',
    extractedText:
      '7.9 Assessing value. Firms should assess whether the price paid provides fair value, considering benefits, limitations and customer circumstances.',
  },
  {
    documentEvidenceId: 'ch7-3',
    pageNumber: 50,
    sectionReference: '7.14',
    extractedText:
      '7.14 Value assessment and monitoring. Firms should monitor value outcomes over time and take action where they identify poor value.',
  },
];

const ranked = rankEvidenceBlocksForQuestion(CONSUMER_DUTY_FAIR_VALUE_ASK_RI_QUESTION, [
  ...introBlocks,
  ...ch7Blocks,
]);
const top = selectRankedBlocksForCitations(ranked, 4);
const topPages = top.map((r) => r.block.pageNumber);
const introScore = scoreEvidenceBlockForQuestion(CONSUMER_DUTY_FAIR_VALUE_ASK_RI_QUESTION, introBlocks[0]);
const ch7Score = scoreEvidenceBlockForQuestion(CONSUMER_DUTY_FAIR_VALUE_ASK_RI_QUESTION, ch7Blocks[0]);

if (ch7Score > introScore) pass('chapter 7 block scores above intro boilerplate');
else failMsg(`scores ch7=${ch7Score} intro=${introScore}`);

if (!topPages.some((p) => p <= 5)) pass('citation selection excludes introductory pages 2–5');
else failMsg(`top pages include intro: ${topPages.join(',')}`);

if (topPages.filter((p) => p >= 48).length >= 2) pass('at least two chapter 7 pages selected');
else failMsg(`chapter 7 pages in top: ${topPages.join(',')}`);

const analysis = analyzeRegulatoryPdfDocument({
  structured: { pages: [] },
  publicationMetadata: { publicationType: 'finalised_guidance' },
  canonicalUrl: FG22_5_PRIMARY_PDF_URL,
});
if (analysis.isFinalisedGuidance === true && analysis.consultationPreserved !== true) {
  pass('FG22 finalised guidance not classified as consultation');
} else {
  failMsg(`analysis consultationPreserved=${analysis.consultationPreserved}`);
}

const evidence = {
  publicationId: 'a761cacc-8742-493d-b200-eb5d9a3ab884',
  extractionRevisionId: '56fd1525-7f30-401e-82fd-16abf90100aa',
  publicationTitle: 'FG22/5',
  publicationReference: 'FG22/5',
  canonicalUrl: FG22_5_PRIMARY_PDF_URL,
  regulatorShortName: 'FCA',
  regulatorLabel: 'Financial Conduct Authority',
  integrityVerified: true,
  obligationGradeSuitable: false,
  structured: { pageBoundaryConfirmed: true, pages: [] },
  evidenceBlocks: [...introBlocks, ...ch7Blocks],
  publicationMetadata: { publicationType: 'finalised_guidance', primaryPdfUrl: FG22_5_PRIMARY_PDF_URL },
  analysis,
};

const answered = answerAskRiFromPublicationPdfEvidence(evidence, CONSUMER_DUTY_FAIR_VALUE_ASK_RI_QUESTION);
if (answered.status === 'ANSWERED' && answered.citations?.length >= 2) pass('pdf path answers with multiple citations');
else failMsg(`pdf answer ${answered.status} citations=${answered.citations?.length}`);

const pdfCites = (answered.citations || []).filter((c) => c.type === 'primary_pdf');
const citePages = pdfCites.map((c) => c.physicalPageNumber);
if (citePages.some((p) => p >= 48)) pass('answered citations include chapter 7 physical pages');
else failMsg(`citation pages ${citePages.join(',')}`);

if (pdfCites[0]?.primaryPdfPageUrl?.includes('#page=')) pass('citation carries FCA PDF page deep link');
else failMsg('missing primaryPdfPageUrl');

if (fail) process.exit(1);
console.log('\nacceptance-phase-8-bus-uat-018-pdf-ranking: PASS\n');

#!/usr/bin/env node
/**
 * BUS-UAT-018 — mixed answer body and key findings survive Design Lab mapper.
 */
import { CONSUMER_DUTY_FAIR_VALUE_ASK_RI_QUESTION } from '../lib/ri/ask-ri/publication-pdf-question-match.mjs';
import { composeMixedHtmlPdfAnswer } from '../lib/ri/ask-ri/compose-mixed-catalogue-answer.mjs';
import { runAskRiDeterministic } from '../lib/ri/ask-ri/run-ask-ri.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FAIR_VALUE_CONSUMER_FINANCE_PUBLICATION_ID } from '../lib/ri/ask-ri/publication-question-scope.mjs';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const mapperSrc = readFileSync(join(platformRoot, 'lib/ri/lab-api/map-ask-ri-to-lab.ts'), 'utf8');

let fail = 0;
const pass = (m) => console.log(`PASS: ${m}`);
const failMsg = (m) => {
  fail += 1;
  console.error(`FAIL: ${m}`);
};

const htmlAnswer = {
  status: 'ANSWERED',
  answer:
    'Financial Conduct Authority webpage “Fair value in consumer finance”. Summary from verified html_article_v2 text only — not generative AI. Supervisory examples of good and poor practice are illustrated.',
  citations: [
    {
      type: 'html_article_v2',
      publicationTitle: 'Fair value in consumer finance',
      sectionReference: 'Examples of good practice',
    },
  ],
  audit: {
    keyFindings: ['Supervisory examples are illustrative; PRIN 2A.4 is signposted on the webpage.'],
    uncertainties: ['Confirm binding Handbook text separately.'],
    evidenceConfidence: 'HIGH',
  },
};

const pdfSupplement = {
  status: 'ANSWERED',
  citations: [
    {
      type: 'primary_pdf',
      publicationReference: 'FG22/5',
      physicalPageNumber: 58,
      excerpt: 'Firms should assess fair value before offering products to retail customers.',
    },
    {
      type: 'primary_pdf',
      publicationReference: 'FG22/5',
      physicalPageNumber: 64,
      excerpt: 'Firms should monitor fair value throughout the product lifecycle.',
    },
  ],
};

const mixed = composeMixedHtmlPdfAnswer(htmlAnswer, pdfSupplement, CONSUMER_DUTY_FAIR_VALUE_ASK_RI_QUESTION);
if (mixed.answer.includes('mixed catalogue evidence') && !/html_article_v2 text only/i.test(mixed.answer)) {
  pass('mixed compose replaces html-only lead');
} else failMsg('mixed compose lead');

if (mixed.answer.includes('FG22/5 primary PDF') && mixed.answer.includes('physical page 58')) {
  pass('mixed compose embeds PDF passages');
} else failMsg('mixed compose pdf body');

if (mixed.keyFindings.some((f) => /FG22\/5/.test(f)) && mixed.keyFindings.some((f) => /FCA webpage/.test(f))) {
  pass('mixed key findings combine html and pdf');
} else failMsg(`key findings ${JSON.stringify(mixed.keyFindings)}`);

const state = {
  publicationHtmlEvidence: [
    {
      publicationId: FAIR_VALUE_CONSUMER_FINANCE_PUBLICATION_ID,
      publicationTitle: 'Fair value in consumer finance',
      publicationReference: 'fair-value',
      canonicalUrl: 'https://www.fca.org.uk/publications/good-and-poor-practice/fair-value-consumer-finance',
      integrityVerified: true,
      normalisedArticleText:
        'Fair value in consumer finance. Consumer Duty fair value assessments and examples of good and poor practice for firms.',
      extractionQuality: { webpageExtraction: { status: 'complete' } },
      evidenceBlocks: [
        {
          documentEvidenceId: 'h1',
          sectionReference: 'Examples',
          extractedText:
            'Examples of good practice under Consumer Duty fair value in consumer finance for product governance.',
          evidenceKind: 'supervisory_example',
        },
      ],
      extractionProfile: 'html_article_v2',
      evidenceMedium: 'fca_webpage',
      regulatorShortName: 'FCA',
      regulatorLabel: 'Financial Conduct Authority',
    },
  ],
  publicationPdfEvidence: [
    {
      publicationId: 'a761cacc-8742-493d-b200-eb5d9a3ab884',
      publicationTitle: 'FG22/5',
      publicationReference: 'FG22/5',
      canonicalUrl: 'https://www.fca.org.uk/publication/finalised-guidance/fg22-5.pdf',
      integrityVerified: true,
      obligationGradeSuitable: false,
      structured: { pageBoundaryConfirmed: true, pages: [] },
      evidenceBlocks: pdfSupplement.citations.map((c, i) => ({
        documentEvidenceId: `p${i}`,
        pageNumber: c.physicalPageNumber,
        sectionReference: '7.1',
        extractedText: c.excerpt,
      })),
      publicationMetadata: { publicationType: 'finalised_guidance' },
      analysis: {
        consultationPreserved: false,
        isFinalisedGuidance: true,
        publicationClassification: { primaryClass: 'guidance' },
      },
      regulatorShortName: 'FCA',
      regulatorLabel: 'Financial Conduct Authority',
    },
  ],
  publicationHtmlEvidenceErrors: [],
  publicationPdfEvidenceErrors: [],
};

const result = runAskRiDeterministic(state, CONSUMER_DUTY_FAIR_VALUE_ASK_RI_QUESTION);
if (result.execution?.evidenceSource === 'mixed_catalogue_evidence') pass('runner marks mixed evidence source');
else failMsg(`evidenceSource=${result.execution?.evidenceSource}`);

if (
  mapperSrc.includes("evidenceSource === 'mixed_catalogue_evidence'") &&
  mapperSrc.includes('result.answer')
) {
  pass('mapper prefers merged result.answer for mixed evidence');
} else failMsg('mapper mixed answer selection');

if (mapperSrc.includes('mixedKeyFindings') && mapperSrc.includes('mixed_catalogue_evidence')) {
  pass('mapper merges mixed key findings');
} else failMsg('mapper key findings merge');

if (result.answer.includes('mixed catalogue evidence') && result.execution?.mixedKeyFindings?.length) {
  pass('runner attaches mixed answer and key findings on execution');
} else failMsg('runner mixed payload');

if (fail) process.exit(1);
console.log('\nacceptance-phase-8-bus-uat-018-mixed-answer: PASS\n');

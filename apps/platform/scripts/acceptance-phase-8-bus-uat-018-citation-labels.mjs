#!/usr/bin/env node
/**
 * BUS-UAT-018 — citation medium labels, mapper counts, HTML section blocks (offline).
 */
import { buildHtmlArticleEvidenceBlocks } from '../lib/ri/ask-ri/publication-html-evidence.mjs';
import {
  countCitationsByMedium,
  resolveCatalogueEvidenceSource,
} from '../lib/ri/lab-api/map-ask-ri-catalogue-pure.mjs';

let fail = 0;
const pass = (m) => console.log(`PASS: ${m}`);
const failMsg = (m) => {
  fail += 1;
  console.error(`FAIL: ${m}`);
};

const htmlCitations = [
  { type: 'html_article_v2', publicationTitle: 'Fair value', sectionReference: 'Fair value assessments' },
];
const mixed = [
  ...htmlCitations,
  { type: 'primary_pdf', physicalPageNumber: 42, publicationTitle: 'FG22/5' },
];

if (resolveCatalogueEvidenceSource({ execution: {} }, htmlCitations) === 'html_article_v2') {
  pass('resolve source html-only');
} else failMsg('html source');

if (resolveCatalogueEvidenceSource({ execution: {} }, mixed) === 'mixed_catalogue_evidence') {
  pass('resolve source mixed');
} else failMsg('mixed source');

const { html, pdf } = countCitationsByMedium(mixed);
if (html === 1 && pdf === 1) pass('citation medium counts');
else failMsg(`counts html=${html} pdf=${pdf}`);

if (resolveCatalogueEvidenceSource({ execution: { evidenceSource: 'pdf_primary_v1' } }, htmlCitations) === 'html_article_v2') {
  pass('citation types override stale pdf_primary_v1 execution metadata');
} else failMsg('stale execution metadata');

const sampleHtml = `<h2>Fair value assessments</h2><p>Firms must assess fair value under Consumer Duty expectations and PRIN 2A.4.</p><h2>Examples of good practice</h2><p>Documented fair value reviews with evidence of customer outcomes over time for product governance.</p>`;
const blocks = buildHtmlArticleEvidenceBlocks({
  publicationId: 'pub-1',
  extractionRevisionId: 'rev-1',
  normalisedArticleText: 'fallback',
  normalisedArticleHtml: sampleHtml,
});
if (blocks.length >= 2 && blocks.some((b) => /Fair value assessments/i.test(b.sectionReference))) {
  pass('HTML heading-derived section blocks');
} else failMsg(`section blocks ${blocks.length}`);

if (fail) process.exit(1);
console.log('\nacceptance-phase-8-bus-uat-018-citation-labels: PASS\n');

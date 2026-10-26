#!/usr/bin/env node
/**
 * Phase 8B — FCA HTML summary extraction and publication classification (offline).
 */
import { extractPublicationSummaryFromHtml } from '../core/html-publication-text.mjs';
import { fingerprintContent } from '../core/fingerprint.mjs';
import { inferFcaPublicationType } from '../connectors/fca-publication-type.mjs';
import {
  COOKIE_CSS_BEFORE_ARTICLE,
  DATA_PAGE_ARTICLE,
  POLICY_STATEMENT_PAGE,
  CONSULTATION_PAGE,
  MULTI_FIRM_PAGE,
  CHROME_ONLY,
} from '../fixtures/fca-html-samples.mjs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));

let failed = 0;
function pass(msg) {
  console.log(`PASS: ${msg}`);
}
function fail(msg) {
  failed += 1;
  console.error(`FAIL: ${msg}`);
}

const defenceSummary = extractPublicationSummaryFromHtml(COOKIE_CSS_BEFORE_ARTICLE);
if (defenceSummary?.includes('Defence SMEs') && !defenceSummary.includes('sliding-popup')) {
  pass('cookie CSS excluded from summary');
} else {
  fail(`cookie CSS summary: ${defenceSummary}`);
}

const dataSummary = extractPublicationSummaryFromHtml(DATA_PAGE_ARTICLE);
if (dataSummary?.includes('Flood risk exposure')) pass('/data/ article text extracted');
else fail(`/data/ summary: ${dataSummary}`);

const missing = extractPublicationSummaryFromHtml(CHROME_ONLY);
if (missing === null) pass('missing article returns null summary');
else fail(`chrome only: ${missing}`);

const ps = inferFcaPublicationType({
  title: 'PS24/1 operational resilience',
  canonicalUrl: 'https://www.fca.org.uk/publications/policy/ps24-1',
  html: POLICY_STATEMENT_PAGE,
});
if (ps.publicationType === 'policy_statement' && ps.publicationTypeInference.method === 'fca_page_metadata') {
  pass('policy statement from page metadata');
} else {
  fail(`policy statement: ${JSON.stringify(ps)}`);
}

const cp = inferFcaPublicationType({
  title: 'CP24/2 consumer credit',
  canonicalUrl: 'https://www.fca.org.uk/publications/consultation-paper/cp24-2',
  html: CONSULTATION_PAGE,
});
if (cp.publicationType === 'consultation_paper') pass('consultation paper classification');
else fail(`consultation: ${JSON.stringify(cp)}`);

const mfr = inferFcaPublicationType({
  title: 'Conflicts in private markets',
  canonicalUrl:
    'https://www.fca.org.uk/publications/multi-firm-reviews/conflicts-interest-fair-customer-treatment-private-markets',
  html: MULTI_FIRM_PAGE,
});
if (mfr.publicationType === 'publication' && mfr.publicationTypeInference.signal.includes('multi_firm')) {
  pass('multi-firm review stays publication (not supervisory_guidance)');
} else {
  fail(`multi-firm: ${JSON.stringify(mfr)}`);
}

const stats = inferFcaPublicationType({
  title: 'Flood risk exposure of mortgages in England',
  canonicalUrl: 'https://www.fca.org.uk/data/flood-risk-exposure-mortgages-england',
  html: DATA_PAGE_ARTICLE,
});
if (stats.publicationType === 'publication' && stats.publicationType !== 'policy_statement') {
  pass('statistical /data/ publication not policy_statement');
} else {
  fail(`statistical: ${JSON.stringify(stats)}`);
}

const unknown = inferFcaPublicationType({
  title: 'Industry update',
  canonicalUrl: 'https://www.fca.org.uk/news/news-stories/sample',
  html: '<html><body><article><p>General update.</p></article></body></html>',
});
if (unknown.publicationType === 'publication' && unknown.publicationTypeInference.method === 'default') {
  pass('unknown type defaults to publication');
} else {
  fail(`unknown: ${JSON.stringify(unknown)}`);
}

const htmlSample = COOKIE_CSS_BEFORE_ARTICLE;
const fp1 = await fingerprintContent(htmlSample, { contentType: 'text/html' });
const fp2 = await fingerprintContent(htmlSample, { contentType: 'text/html' });
if (fp1.hash === fp2.hash && fp1.normalisation === 'html_article_v1') {
  pass('fingerprint unchanged and stable');
} else {
  fail('fingerprint drift');
}

const legacySrc = readFileSync(join(__dir, '..', 'connectors', 'core-legacy-connectors.mjs'), 'utf8');
if (legacySrc.includes('inferFcaPublicationType') && typeof inferFcaPublicationType === 'function') {
  pass('FCA connector config wires inferFcaPublicationType');
} else {
  fail('FCA connector missing inferFcaPublicationType wiring');
}

if (failed) {
  console.error(`\nacceptance-fca-html-quality: FAIL (${failed})\n`);
  process.exit(1);
}
console.log('\nacceptance-fca-html-quality: PASS\n');

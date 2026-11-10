#!/usr/bin/env node
/**
 * BUS-UAT-018 — Ask RI must not load substantive blocks from FG22 discovery HTML (offline classification).
 */
import { classifyFg22HtmlArticleV2Evidence } from '../lib/ri/ingestion/snapshot/fg22-discovery-html-evidence.mjs';
import { FG22_5_STAGING } from '../lib/ri/ingestion/snapshot/fg22-5-staging-identity.mjs';

let fail = 0;
const pass = (m) => console.log(`PASS: ${m}`);
const failMsg = (m) => {
  fail += 1;
  console.error(`FAIL: ${m}`);
};

const fg22 = {
  id: 'a761cacc-8742-493d-b200-eb5d9a3ab884',
  external_document_id: FG22_5_STAGING.externalDocumentId,
  canonical_url: FG22_5_STAGING.canonicalPdfUrl,
  title: FG22_5_STAGING.title,
};
const snap = {
  id: '0b87a78e-c672-4772-acc1-5b307f2dab47',
  canonical_url: 'https://www.fca.org.uk/firms/consumer-duty/publications-resources',
};
const rev = {
  id: 'dd415a21-8c91-44cc-baff-6d021db9c680',
  extraction_quality: { obligationGradeSuitable: true },
};

const result = classifyFg22HtmlArticleV2Evidence(fg22, snap, rev);
if (result.discoveryOnly && result.reason?.includes('hub')) {
  pass('staging partial FG22 html revision excluded from substantive Ask RI HTML path');
} else {
  failMsg('FG22 exclusion');
}

process.exitCode = fail ? 1 : 0;
console.log(fail ? `FAILED ${fail}` : 'ALL PASS');

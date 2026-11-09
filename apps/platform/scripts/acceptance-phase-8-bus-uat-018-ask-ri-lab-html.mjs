#!/usr/bin/env node
/**
 * BUS-UAT-018 — Lab mapper + Ask RI UI compatibility for html_article_v2 (offline).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const askUi = readFileSync(
  join(platformRoot, 'design-lab-bundle/regulatory-intelligence/js/ask-ri-ui.js'),
  'utf8',
);
const mapperSrc = readFileSync(join(platformRoot, 'lib/ri/lab-api/map-ask-ri-to-lab.ts'), 'utf8');

let fail = 0;
const pass = (m) => console.log(`PASS: ${m}`);
const failMsg = (m) => {
  fail += 1;
  console.error(`FAIL: ${m}`);
};

if (!askUi.includes('retrieval?.evidenceSource === \'pdf_primary_v1\' ? `${askRetrieval')) {
  pass('ask-ri-ui renderAskResult does not reference undefined retrieval variable');
} else {
  failMsg('ask-ri-ui still uses undefined retrieval in renderAskResult evidence line');
}

if (askUi.includes('html_article_v2') && askUi.includes('FCA webpage citation')) {
  pass('ask-ri-ui renders html_article_v2 evidence labels');
} else failMsg('ask-ri-ui html labels missing');

if (mapperSrc.includes('catalogueRetrievalFromCitations') && mapperSrc.includes('html_article_v2')) {
  pass('lab mapper sets html evidenceSource on catalogue retrieval');
} else failMsg('lab mapper html retrieval');

const { renderAskRiPage } = await import(
  '../design-lab-bundle/regulatory-intelligence/js/ask-ri-ui.js'
);
const mockState = {
  platformConfig: { apiBaseUrl: '/api/ri-lab', connectedBackend: true },
  userPermissions: ['ask-ri:read'],
  _lastAskRi: {
    ok: true,
    connected: true,
    question: 'Fair value',
    retrieval: {
      evidenceSource: 'html_article_v2',
      totalMatchingRecords: 1,
      resultCount: 1,
      interpretedAs: 'FCA webpage',
    },
    analysis: {
      providerMode: 'PRODUCTION',
      summary: 'Test answer',
      citations: [
        {
          citationType: 'html_article_v2',
          sourceUrl: 'https://www.fca.org.uk/publications/good-and-poor-practice/fair-value-consumer-finance',
          publicationTitle: 'Fair value in consumer finance',
          excerpt: 'Consumer Duty',
        },
      ],
      workflowPayload: { answer: 'Test answer', keyFindings: [], uncertainties: [] },
    },
  },
};
try {
  const html = renderAskRiPage(mockState);
  if (html.includes('data-ask-ri-result') && html.includes('Test answer')) {
    pass('renderAskRiPage renders ANSWERED html_article_v2 without throwing');
  } else failMsg('renderAskRiPage output incomplete');
} catch (e) {
  failMsg(`renderAskRiPage threw ${e.message}`);
}

const sparseRetrievalState = {
  ...mockState,
  _lastAskRi: {
    ...mockState._lastAskRi,
    retrieval: {
      evidenceSource: 'html_article_v2',
      interpretedAs: 'FCA webpage',
    },
  },
};
try {
  renderAskRiPage(sparseRetrievalState);
  pass('renderAskRiPage html_article_v2 with sparse retrieval (no totalMatchingRecords)');
} catch (e) {
  failMsg(`sparse retrieval render threw ${e.message}`);
}

if (askUi.includes('totalMatchingRecords ?? analysis?.citations')) {
  failMsg('ask-ri-ui renderAskResult references undefined analysis in evidence count line');
} else {
  pass('ask-ri-ui avoids undefined analysis reference in evidence count line');
}

if (fail) process.exit(1);
console.log('\nacceptance-phase-8-bus-uat-018-ask-ri-lab-html: PASS\n');

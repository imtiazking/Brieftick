#!/usr/bin/env node
/**
 * Deterministic RI-CLS-009 check for CONC 7.20.1R(2) without paid extraction.
 * Uses the same provision-eligibility helpers as production code against PS26/1-shaped page text.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildProvisionPagesIndex, parseProvisionReference } from '../../lib/ri/classification/provision-eligibility.mjs';
import { quotationVerifiableOnPages, normaliseQuotation } from '../../lib/ri/ai/finding-review-core.mjs';

const blocks = [
  {
    pageNumber: 94,
    documentEvidenceId: 'p94',
    extractedText:
      'CONC 7.20.1 R (1) This section applies to a firm with respect to entering into a regulated deferred payment credit agreement.',
  },
  {
    pageNumber: 95,
    documentEvidenceId: 'p95',
    extractedText:
      '(2) A firm must contact the customer about the missed payment before taking any further action in relation to the arrears.',
  },
];

const pagesIndex = buildProvisionPagesIndex(blocks, 61);
const indexObj = Object.fromEntries([...pagesIndex.entries()].map(([k, v]) => [k, [...v.pages]]));
const core = parseProvisionReference('CONC 7.20.1R')?.core;

const pageText94 = 'CONC 7.20.1 R This section applies to a firm with respect to entering into a regulated deferred payment credit agreement.';
const pageText95 =
  '(2) A firm must contact the customer about the missed payment before taking any further action in relation to the arrears.';

const pageTextByNumber = new Map([
  [94, pageText94],
  [95, pageText95],
]);
const citedPages = [94, 95];
const quote = normaliseQuotation(pageText95.match(/\(2\)[^.]+\./)?.[0] || pageText95);

const verified = quotationVerifiableOnPages(quote, pageTextByNumber, citedPages);

const outcome = {
  testedAt: new Date().toISOString(),
  provisionCore: core,
  provisionPagesIndex: indexObj[core] ?? null,
  quotation: quote,
  verification: verified,
  pass: verified.ok === true && verified.quotationPage === 95,
  note: 'Staging run c8cb095e grounding lacks provisionPageIndex until re-extraction; client path uses live buildFindingsView enrichment.',
};

const outPath = resolve(process.cwd(), '..', '..', 'docs', 'eval', 'PS26-1-CONC-7.20.1R-CROSS-PAGE-DETERMINISTIC.json');
writeFileSync(outPath, JSON.stringify(outcome, null, 2));
console.log(JSON.stringify(outcome, null, 2));
process.exit(outcome.pass ? 0 : 1);
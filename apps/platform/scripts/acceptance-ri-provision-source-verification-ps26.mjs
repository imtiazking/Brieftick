#!/usr/bin/env node
/**
 * Deterministic verification: official PS26/1 PDF vs pdf_primary_v1 blocks (no paid AI).
 * Documents CONC 7.20.1R(2) instrument text and provision page index.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';
import { extractRegulatoryPdfContent } from '../../../integrations/regulatory-sources/core/regulatory-pdf-extract.mjs';
import { buildPdfEvidenceBlocks } from '../../../integrations/regulatory-sources/core/pdf-evidence-blocks.mjs';
import { parsePdfPhysicalPages } from '../../../integrations/regulatory-sources/core/pdf-physical-page-parser.mjs';
import { buildProvisionPagesIndex, detectLegalInstrumentStartPage } from '../lib/ri/classification/provision-eligibility.mjs';
import { quotationVerifiableOnPages, normaliseQuotation } from '../lib/ri/ai/finding-review-core.mjs';
import { buildInstrumentProvisionInventory } from '../lib/ri/classification/provision-inventory.mjs';

const PDF = join(REPO_ROOT, 'integrations/regulatory-sources/fixtures/fca-ps26-1-official.pdf');
const OUT = join(REPO_ROOT, 'docs/eval/PS26-1-PROVISION-SOURCE-VERIFICATION-2026-11-22.json');

const QUOTE_7201_2 =
  '(2) As soon as possible after a missed payment has occurred the firm must: (a) notify the borrower: (i) that the missed payment has occurred';

let failed = 0;
const check = (label, ok, detail) => {
  if (!ok) failed += 1;
  console.log(ok ? 'PASS' : 'FAIL', label, detail ? JSON.stringify(detail) : '');
};

const pdf = readFileSync(PDF);
const physical = await parsePdfPhysicalPages(pdf);
const extracted = await extractRegulatoryPdfContent(pdf);
const blocks = buildPdfEvidenceBlocks(
  { publicationId: 'ps26', extractionRevisionId: 'verify', sourcePdfSha256: 'local', extractionProfile: 'pdf_primary_v1' },
  extracted.structured,
);
const start = detectLegalInstrumentStartPage(blocks);
const idx = buildProvisionPagesIndex(blocks, start);
const inventory = buildInstrumentProvisionInventory(blocks, start);

const page94 = physical.pages[93]?.text || '';
const page95 = physical.pages[94]?.text || '';
check('physical p94 contains 7.20.1 R (1)', /7\.20\.1\s*R/i.test(page94) && /\(1\)/.test(page94));
check('physical p95 contains 7.20.1 R (2) notify borrower', /\(2\)\s*As soon as possible after a missed payment/i.test(page95));
check('physical p95 contains 7.20.3 R section heading', /7\.20\.3\s*R/i.test(page95));
check('legacy UAT quote absent from PDF', !/contact the customer about the missed payment/i.test(physical.text || ''));

const merged = new Map([
  [94, page94],
  [95, page95],
]);
const verify = quotationVerifiableOnPages(normaliseQuotation(QUOTE_7201_2), merged, [94, 95]);
check('instrument quotation verifiable on p94–95', verify.ok === true, verify);

const pages7201 = [...(idx.get('7.20.1R')?.pages || [])];
check('provision index lists 7.20.1R on pp.94 and 95', pages7201.includes(94) && pages7201.includes(95), pages7201);

const row = inventory.byCore.get('7.20.1R');
check('inventory marks 7.20.1R NEW_TEXT on p94', row?.textStatusByPage?.[94] === 'NEW_TEXT');

const report = {
  capturedAt: new Date().toISOString(),
  sourcePdf: PDF,
  parserVersion: extracted.structured?.parserVersion,
  instrumentStartPage: start,
  physicalPages: { 94: page94.length, 95: page95.length },
  conc7201Pages: pages7201,
  quotationVerification: verify,
  legacyMisquote: 'contact the customer about the missed payment — not in FCA PS26/1 instrument PDF',
  authoritative7201_2: 'Notify borrower after missed payment (CONC 7.20.1R(2) on printed p.34 / PDF p.95)',
  inventoryProvisionCount: inventory.provisions.length,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2));
process.exit(failed ? 1 : 0);
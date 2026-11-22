#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';
import { parsePdfPhysicalPages } from '../../../integrations/regulatory-sources/core/pdf-physical-page-parser.mjs';
import { buildProvisionPagesIndex, detectLegalInstrumentStartPage } from '../lib/ri/classification/provision-eligibility.mjs';
import { buildPdfEvidenceBlocks } from '../../../integrations/regulatory-sources/core/pdf-evidence-blocks.mjs';
import { extractRegulatoryPdfContent } from '../../../integrations/regulatory-sources/core/regulatory-pdf-extract.mjs';
import { quotationVerifiableOnPages, normaliseQuotation } from '../lib/ri/ai/finding-review-core.mjs';

const PDF = join(REPO_ROOT, 'integrations/regulatory-sources/fixtures/fca-ps22-9-official.pdf');
const OUT = join(REPO_ROOT, 'docs/eval/PS22-9-PROVISION-SOURCE-VERIFICATION-2026-11-22.json');

const QUOTE_35E =
  'Where a manufacturer of a closed product which is a funeral plan product manufactured before 29 July 2022 is following the provisions of PROD 7 concerning the fair value of funeral plan products, contravention of PROD 7 may be relied on as tending to establish contravention of those provisions of PRIN 2A.4 that apply to the firm.';

let failed = 0;
const check = (label, ok, detail) => {
  if (!ok) failed += 1;
  console.log(ok ? 'PASS' : 'FAIL', label, detail ? JSON.stringify(detail) : '');
};

const pdf = readFileSync(PDF);
const physical = await parsePdfPhysicalPages(pdf);
const page126 = physical.pages[125]?.text || '';
check('physical p126 contains 2A.4.35E', /2A\.4\.35\s*E/i.test(page126));
const extracted = await extractRegulatoryPdfContent(pdf);
const blocks = buildPdfEvidenceBlocks(
  { publicationId: 'ps22', extractionRevisionId: 'verify', sourcePdfSha256: 'local', extractionProfile: 'pdf_primary_v1' },
  extracted.structured,
);
const start = detectLegalInstrumentStartPage(blocks);
const idx = buildProvisionPagesIndex(blocks, start);
const pages35 = [...(idx.get('2A.4.35E')?.pages || [])];
check('index lists 2A.4.35E on p.126', pages35.includes(126), { pages: pages35 });
const verify = quotationVerifiableOnPages(normaliseQuotation(QUOTE_35E), new Map([[126, page126]]), [126]);
check('35E quotation verifiable on p.126', verify.ok === true, verify);

writeFileSync(OUT, JSON.stringify({ capturedAt: new Date().toISOString(), verify35E: verify, pages35 }, null, 2));
process.exit(failed ? 1 : 0);
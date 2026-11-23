#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';
import { extractRegulatoryPdfContent } from '../../../integrations/regulatory-sources/core/regulatory-pdf-extract.mjs';
import { analyzeRegulatoryPdfDocument } from '../../../integrations/regulatory-sources/core/regulatory-pdf-analysis.mjs';

const pdf = readFileSync(join(REPO_ROOT, 'integrations/regulatory-sources/fixtures/fca-ps22-9-official.pdf'));
const extracted = await extractRegulatoryPdfContent(pdf);
const pages = extracted.structured?.pages || extracted.structured || [];
const pageList = Array.isArray(pages) ? pages : Object.values(pages);

const analysis = analyzeRegulatoryPdfDocument({
  structured: { pages: pageList.map((p) => ({ text: p.text || p.extractedText || '', pageNumber: p.pageNumber })) },
  publicationMetadata: {
    publicationType: 'policy_statement',
    publicationTypeLabel: 'Policy Statement',
    title: 'PS22/9: A new Consumer Duty',
  },
  canonicalUrl: 'https://www.fca.org.uk/publication/policy/ps22-9.pdf',
});

let failed = 0;
const check = (label, ok) => {
  if (!ok) failed += 1;
  console.log(ok ? 'PASS' : 'FAIL', label);
};

check('primaryClass is policy_statement', analysis.publicationClassification.primaryClass === 'policy_statement');
check('consultationPreserved is false', analysis.consultationPreserved === false);
check('publishedFinalRules', analysis.regulatoryStatus.publishedFinalRules === true);
check('phase final_policy_statement', analysis.regulatoryStatus.phase === 'final_policy_statement');
check('mustNotTreatProposalsAsBinding false', analysis.regulatoryStatus.mustNotTreatProposalsAsBinding === false);

console.log(failed ? 'FAIL acceptance-ri-regulatory-pdf-analysis-ps22' : 'PASS acceptance-ri-regulatory-pdf-analysis-ps22');
process.exit(failed ? 1 : 0);
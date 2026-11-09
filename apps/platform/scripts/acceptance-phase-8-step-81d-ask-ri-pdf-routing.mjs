#!/usr/bin/env node
/**
 * Step 81D — Ask RI routes CP26/38 questions to publication_pdf_primary_v1 (offline).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONSUMER_DUTY_FAIR_VALUE_ASK_RI_QUESTION,
  STEP80_ASK_RI_SAMPLE_QUESTION,
} from '../lib/ri/ask-ri/publication-pdf-question-match.mjs';
import { runAskRiDeterministic } from '../lib/ri/ask-ri/run-ask-ri.mjs';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
const pass = (m) => console.log(`PASS: ${m}`);
const failMsg = (m) => {
  fail += 1;
  console.error(`FAIL: ${m}`);
};

const loadSrc = readFileSync(
  join(platformRoot, 'lib/ri/ask-ri/load-publication-pdf-evidence.mjs'),
  'utf8',
);

if (loadSrc.includes('REVISION_COLUMNS') && loadSrc.includes('regulator:regulators')) {
  pass('PDF loader uses flat revision select + regulator embed alias');
} else failMsg('PDF loader query shape');

if (loadSrc.includes('questionMentionsPublicationReference') && loadSrc.includes('scopedPublicationIds')) {
  pass('PDF load scoped to publication-named questions');
} else failMsg('targeted PDF load');

const cp26Q = STEP80_ASK_RI_SAMPLE_QUESTION;
const emptyPdf = runAskRiDeterministic(
  {
    publicationPdfEvidence: [],
    publicationPdfEvidenceErrors: [{ code: 'admin_client_unavailable' }],
  },
  cp26Q,
);
const cp26CatalogueMode =
  emptyPdf.queryPlan?.mode === 'publication_pdf_primary_v1' ||
  emptyPdf.queryPlan?.mode === 'catalogue_publication_evidence_v1';
if (cp26CatalogueMode) pass('CP26 question stays on catalogue evidence plan when PDF empty');
else failMsg(`empty pdf plan ${JSON.stringify(emptyPdf.queryPlan)}`);
if (!String(emptyPdf.answer || '').includes('Record records')) {
  pass('CP26 empty-pdf answer avoids generic Record copy');
} else failMsg('misleading Record message on CP26 pdf failure');
const cp26EvidenceSource = emptyPdf.execution?.evidenceSource;
if (cp26EvidenceSource === 'pdf_primary_v1' || cp26EvidenceSource === 'catalogue_publication_evidence_v1') {
  pass('CP26 empty-pdf execution tagged catalogue/pdf source');
} else failMsg(`execution source ${cp26EvidenceSource}`);

const cdEmpty = runAskRiDeterministic(
  {
    publicationPdfEvidence: [],
    publicationPdfEvidenceErrors: [{ code: 'revision_query_zero_rows' }],
  },
  CONSUMER_DUTY_FAIR_VALUE_ASK_RI_QUESTION,
);
const cdMode =
  cdEmpty.queryPlan?.mode === 'publication_pdf_primary_v1' ||
  cdEmpty.queryPlan?.mode === 'catalogue_publication_evidence_v1';
if (cdMode) pass('Consumer Duty title question uses catalogue evidence plan');
else failMsg('Consumer Duty evidence plan');
if (!String(cdEmpty.answer || '').includes('Record records')) pass('Consumer Duty avoids Record message');
else failMsg('Consumer Duty Record fallback');

const tenantQ = 'What regulatory changes are recorded for our organisation?';
const tenantOnly = runAskRiDeterministic({ changes: [], obligations: [], publications: [] }, tenantQ);
if (tenantOnly.execution?.evidenceSource === 'tenant_ri_records') pass('tenant question uses tenant_ri_records path');
else failMsg(`tenant path ${tenantOnly.execution?.evidenceSource}`);
if (tenantOnly.queryPlan?.mode !== 'publication_pdf_primary_v1') pass('tenant question not forced to pdf plan');
else failMsg('tenant forced pdf');

const unsupported = 'What does COBS require for suitability assessments?';
const uns = runAskRiDeterministic({ publicationPdfEvidence: [], publicationPdfEvidenceErrors: [] }, unsupported);
if (uns.execution?.evidenceSource === 'tenant_ri_records') pass('unsupported question uses tenant planner');
else failMsg('unsupported path');

if (fail) process.exit(1);
console.log('\nacceptance-phase-8-step-81d-ask-ri-pdf-routing: PASS\n');

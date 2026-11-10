#!/usr/bin/env node
/**
 * Phase 2B.2 — authoritative evidence provenance guards.
 */
import {
  assertAuthoritativeForSemanticIndex,
  classifyEvidencePackProvenance,
  EVIDENCE_PROVENANCE_CLASS,
} from '../lib/ri/semantic/regulatory-evidence-provenance.mjs';
import { COOKIE_CSS_BEFORE_ARTICLE } from '../../../integrations/regulatory-sources/fixtures/fca-html-samples.mjs';

let fail = 0;
function pass(msg) {
  console.log(`PASS: ${msg}`);
}
function failMsg(msg) {
  console.error(`FAIL: ${msg}`);
  fail += 1;
}

const syntheticPack = {
  publicationId: '00000000-0000-4000-8000-000000000099',
  extractionRevisionId: null,
  exportSource: 'staging_catalogue_readonly',
  retrievalProvenance: { evidenceDepth: 'metadata_plus_public_fixture_excerpt' },
  verifiedTextSamples: [{ extractedText: COOKIE_CSS_BEFORE_ARTICLE }],
};

const abstractPack = {
  publicationId: '00000000-0000-4000-8000-000000000098',
  verifiedTextSamples: [
    {
      extractedText:
        'Example. This staging catalogue entry is included to introduce realistic publication competition during offline retrieval evaluation.',
    },
  ],
};

const authoritativePack = {
  publicationId: '56b0beca-d8c3-4267-a794-9079009af661',
  extractionRevisionId: '613c078c-3639-4ce5-9666-73c5352f44fd',
  exportSource: 'staging_readonly',
  retrievalProvenance: { exportSource: 'staging_readonly' },
  askRiEvidence: { structured: { pages: [], pageBoundaryConfirmed: true } },
  verifiedTextSamples: [{ extractedText: 'We found examples of firms taking structured approaches to assessing fair value.' }],
};

if (!assertAuthoritativeForSemanticIndex(syntheticPack).ok) pass('synthetic fixture pack rejected');
else failMsg('synthetic fixture pack should be rejected');

if (!assertAuthoritativeForSemanticIndex(abstractPack).ok) pass('catalogue abstract rejected');
else failMsg('catalogue abstract should be rejected');

if (assertAuthoritativeForSemanticIndex(authoritativePack).ok) pass('verified extraction pack accepted');
else failMsg('verified extraction pack should be accepted');

if (!assertAuthoritativeForSemanticIndex({ publicationId: 'x' }).ok) pass('unverified pack fails closed');
else failMsg('unverified pack should fail closed');

if (classifyEvidencePackProvenance(syntheticPack).class === EVIDENCE_PROVENANCE_CLASS.SYNTHETIC_FIXTURE) {
  pass('fixture classified as SYNTHETIC_FIXTURE');
} else failMsg('fixture classification');

process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/**
 * Independent FCA benchmark entries from PS26/1 official PDF (parser + R/G/E markers).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { extractRegulatoryPdfContent } from '../../../../integrations/regulatory-sources/core/regulatory-pdf-extract.mjs';
import { buildPdfEvidenceBlocks } from '../../../../integrations/regulatory-sources/core/pdf-evidence-blocks.mjs';
import { detectLegalInstrumentStartPage } from '../../lib/ri/classification/provision-eligibility.mjs';
import { buildInstrumentProvisionInventory } from '../../lib/ri/classification/provision-inventory.mjs';

const OUT = join(REPO_ROOT, 'docs', 'eval', 'FCA-REGULATORY-BENCHMARK-2026-11-23.json');
const PHYSICAL = join(REPO_ROOT, 'docs', 'eval', 'FCA-PS26-1-PHYSICAL-SOURCE-EVIDENCE.json');

const pdf = readFileSync(join(REPO_ROOT, 'integrations/regulatory-sources/fixtures/fca-ps26-1-official.pdf'));
const extracted = await extractRegulatoryPdfContent(pdf);
const blocks = buildPdfEvidenceBlocks(
  { publicationId: '829c5472-953a-40ff-9628-947afbfe4e7a', extractionRevisionId: 'bench', sourcePdfSha256: 'x', extractionProfile: 'pdf_primary_v1' },
  extracted.structured,
);
const start = detectLegalInstrumentStartPage(blocks);
const inventory = buildInstrumentProvisionInventory(blocks, start);

const physical = JSON.parse(readFileSync(PHYSICAL, 'utf8'));
const humanBinding = new Set(
  (physical.bindingProvisions || [])
    .filter((p) => p.binding === true)
    .map((p) => p.rule.replace(/^CONC[- ]/, '').replace(/-/g, '')),
);

const entries = inventory.provisions.map((p) => {
  const marker = p.classificationMarker || p.marker || '';
  const expected = marker === 'R' ? 'binding_requirement' : marker === 'E' ? 'evidential' : marker === 'G' ? 'guidance' : 'unknown';
  const core = p.core || p.provisionCore;
  return {
    core,
    expectedLegalStatus: expected,
    pages: p.pages || [],
    independentBindingVerified: humanBinding.has(core),
    source: humanBinding.has(core) ? 'FCA-PS26-1-PHYSICAL-SOURCE-EVIDENCE.json' : 'instrument_parser_v1',
  };
});

const payload = {
  generatedAt: new Date().toISOString(),
  publication: 'PS26/1',
  instrumentStartPage: start,
  entryCount: entries.length,
  verifiedBindingCount: [...humanBinding].length,
  breakdown: {
    bindingR: entries.filter((e) => e.expectedLegalStatus === 'binding_requirement').length,
    evidentialE: entries.filter((e) => e.expectedLegalStatus === 'evidential').length,
    guidanceG: entries.filter((e) => e.expectedLegalStatus === 'guidance').length,
    unknown: entries.filter((e) => e.expectedLegalStatus === 'unknown').length,
  },
  acceptanceThresholdsProposed: {
    bindingRequirementRecall: 0.85,
    bindingRequirementPrecisionOnVerifiedSubset: 0.9,
    quotationVerificationOnBinding: 0.95,
    note: 'Independent regulatory sign-off required; human review retained for exceptions.',
  },
  entries,
};

writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(JSON.stringify({ out: OUT, ...payload.breakdown, verifiedBindingCount: payload.verifiedBindingCount }, null, 2));
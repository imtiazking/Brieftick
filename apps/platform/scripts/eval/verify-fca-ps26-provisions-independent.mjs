#!/usr/bin/env node
/**
 * Independent PS26/1 provision verification from official PDF text (not AI output).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { extractRegulatoryPdfContent } from '../../../../integrations/regulatory-sources/core/regulatory-pdf-extract.mjs';
import { buildPdfEvidenceBlocks } from '../../../../integrations/regulatory-sources/core/pdf-evidence-blocks.mjs';
import { buildInstrumentProvisionInventory } from '../../lib/ri/classification/provision-inventory.mjs';
import {
  detectLegalInstrumentStartPage,
  mergeInstrumentBlocksByPage,
  PROVISION_TEXT_STATUS,
} from '../../lib/ri/classification/provision-eligibility.mjs';

const BENCH = join(REPO_ROOT, 'docs', 'eval', 'FCA-REGULATORY-BENCHMARK-2026-11-23.json');
const OUT = join(REPO_ROOT, 'docs', 'eval', 'FCA-PS26-INDEPENDENT-PROVISION-VERIFICATION-2026-11-23.json');
const COMMENCEMENT = '2026-07-15';

const NEXT_PROVISION_RE =
  /(?:(?<![A-Za-z0-9.])(?<!App\s{1,3})(?:([A-Z]{2,6})\s+)?|(?<![A-Za-z0-9])(?=App\s))((?:App\s+)?\d{1,2}[A-Z]?\.\d{1,2}[A-Z]?\.\d{1,3}[A-Z]?|TP\s+\d{1,3}[A-Z]?\.\d{1,3}[A-Z]?)\s*(R|E|G|D|P|C|UK|EU)(?![A-Za-z])/g;

function provisionScopedExcerpt(byPage, pages, core) {
  const merged = (pages || [])
    .map((p) => byPage.get(p) || '')
    .join('\n')
    .replace(/\s+/g, ' ');
  const bodyMarker = String(core).match(/^(.*?)(R|E|G|D|P|C|UK|EU)$/i);
  const startRe = bodyMarker
    ? new RegExp(`${bodyMarker[1].replace(/\./g, '\\.')}\\s*${bodyMarker[2]}\\b`, 'i')
    : new RegExp(String(core).replace(/\./g, '\\.'), 'i');
  const start = merged.search(startRe);
  if (start < 0) return '';
  const tail = merged.slice(start);
  NEXT_PROVISION_RE.lastIndex = 0;
  NEXT_PROVISION_RE.exec(tail);
  const next = NEXT_PROVISION_RE.exec(tail);
  const end = next?.index ?? Math.min(tail.length, 480);
  return tail.slice(0, end).trim();
}

function markerToStatus(m) {
  if (m === 'R') return 'binding_requirement';
  if (m === 'E') return 'evidential';
  if (m === 'G') return 'guidance';
  return 'unknown';
}

function textStatusNote(row) {
  const vals = Object.values(row?.textStatusByPage || {});
  if (vals.includes(PROVISION_TEXT_STATUS.AMENDMENT_MARKUP_UNCERTAIN)) return 'AMENDMENT_MARKUP_UNCERTAIN';
  if (vals.includes(PROVISION_TEXT_STATUS.NEW_TEXT)) return 'NEW_TEXT';
  return 'STABLE';
}

const pdf = readFileSync(join(REPO_ROOT, 'integrations/regulatory-sources/fixtures/fca-ps26-1-official.pdf'));
const extracted = await extractRegulatoryPdfContent(pdf);
const blocks = buildPdfEvidenceBlocks(
  { publicationId: '829c5472-953a-40ff-9628-947afbfe4e7a', extractionRevisionId: 'verify', sourcePdfSha256: 'x', extractionProfile: 'pdf_primary_v1' },
  extracted.structured,
);
const start = detectLegalInstrumentStartPage(blocks);
const inventory = buildInstrumentProvisionInventory(blocks, start);
const byPage = mergeInstrumentBlocksByPage(blocks, start);
const bench = JSON.parse(readFileSync(BENCH, 'utf8'));

const provisions = [];
for (const e of bench.entries) {
  const row = inventory.byCore.get(e.core);
  const marker = row?.marker || e.core.slice(-1);
  const legalClassification = markerToStatus(marker);
  const citationExcerpt = row ? provisionScopedExcerpt(byPage, row.pages, e.core) : '';
  provisions.push({
    core: e.core,
    fcaPages: row?.pages || e.pages,
    markerInInstrument: marker,
    legalClassificationIndependent: legalClassification,
    operativeBindingRequirement: legalClassification === 'binding_requirement',
    classificationBasis: `${marker}_marker_in_official_instrument`,
    applicability: 'PS26/1 BNPL consumer credit rules',
    commencementDate: COMMENCEMENT,
    amendmentOrTransitional: textStatusNote(row || {}),
    authoritativeCitationFound: Boolean(row?.pages?.length),
    citationExcerpt,
    independentReviewerDecision:
      citationExcerpt.length > 30
        ? 'instrument_text_verified'
        : row?.pages?.length
          ? 'page_located_minimal_excerpt'
          : 'citation_not_located',
    negativeClassificationTest: legalClassification === 'guidance',
    mustNotClassifyAsBinding: legalClassification === 'guidance',
    sourceArtifact: 'integrations/regulatory-sources/fixtures/fca-ps26-1-official.pdf',
    groundTruthSource: 'instrument_parser_not_ai',
  });
}

const bindingR = provisions.filter((p) => p.legalClassificationIndependent === 'binding_requirement');
const guidanceG = provisions.filter((p) => p.legalClassificationIndependent === 'guidance');
const verifiedBinding = bindingR.filter((p) => p.authoritativeCitationFound);
const verifiedGuidance = guidanceG.filter((p) => p.authoritativeCitationFound && p.mustNotClassifyAsBinding);

const payload = {
  generatedAt: new Date().toISOString(),
  publication: 'PS26/1',
  instrumentStartPage: start,
  verificationUnit: 'provision_core',
  counts: {
    total: provisions.length,
    bindingR: bindingR.length,
    guidanceG: guidanceG.length,
    bindingWithAuthoritativeCitation: verifiedBinding.length,
    guidanceNegativeTestsReady: verifiedGuidance.length,
  },
  bindingCoverageVerified: verifiedBinding.length === bindingR.length,
  guidanceNegativeCoverageVerified: verifiedGuidance.length === guidanceG.length,
  provisions,
};

writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(JSON.stringify({ out: OUT, counts: payload.counts, bindingCoverageVerified: payload.bindingCoverageVerified }, null, 2));
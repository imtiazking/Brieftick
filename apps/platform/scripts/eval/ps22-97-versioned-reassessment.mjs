#!/usr/bin/env node
/**
 * Versioned legal reassessment of the 97 preserved PS22/9 extractions.
 * Does not modify historical AI JSON. legallyVerified stays false until human gates pass.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { extractRegulatoryPdfContent } from '../../../../integrations/regulatory-sources/core/regulatory-pdf-extract.mjs';
import { buildPdfEvidenceBlocks } from '../../../../integrations/regulatory-sources/core/pdf-evidence-blocks.mjs';
import {
  buildProvisionPagesIndex,
  detectLegalInstrumentStartPage,
  parseProvisionReference,
} from '../../lib/ri/classification/provision-eligibility.mjs';
import { FCA_PS22_9_AUTHORITATIVE_METADATA as META } from '../../../../integrations/regulatory-sources/catalogue/fca-ps22-9-authoritative-metadata.mjs';

const EVAL = join(REPO_ROOT, 'docs/eval');
const OUT = join(EVAL, 'PS22-9-97-VERSIONED-REASSESSMENT-2026-11-24.json');
const PDF = join(REPO_ROOT, 'integrations/regulatory-sources/fixtures/fca-ps22-9-official.pdf');
const SHA = META.sourcePdfSha256;

const VALID = 'VALID — NO CORRECTION REQUIRED';
const CORRECTED = 'CORRECTED USING EXISTING VERIFIED EVIDENCE';
const HUMAN = 'REQUIRES HUMAN LEGAL REVIEW';
const FRESH = 'REQUIRES FRESH AI EXTRACTION';
const INVALID = 'INVALID — SOURCE OR EVIDENCE DEFECT';

function canon(s) {
  return String(s || '')
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function quotationVerbatim(quotation, pageText) {
  const hay = canon(pageText);
  const segments = String(quotation || '')
    .split(/\.\.\.|…/)
    .map(canon)
    .filter((s) => s.length >= 20);
  if (!segments.length) return { verbatim: false, segments: 0, missing: ['no_segment_ge_20'] };
  const missing = segments.filter((s) => !hay.includes(s));
  return { verbatim: missing.length === 0, segments: segments.length, missing: missing.slice(0, 2).map((s) => s.slice(0, 60)) };
}

function markerOf(core) {
  const m = String(core).match(/([RGE])$/i);
  return m ? m[1].toUpperCase() : null;
}

function legalStatusInInstrument(marker) {
  if (marker === 'R') return 'final_rule_in_PS22_9_made_instrument';
  if (marker === 'G') return 'guidance_in_PS22_9_made_instrument';
  if (marker === 'E') return 'evidential_provision_in_PS22_9_made_instrument';
  return 'unclassified_marker';
}

const recon = JSON.parse(readFileSync(join(EVAL, 'PS22-9-PAID-RUN-RECONCILE-FINAL-2026-11-23.json'), 'utf8'));
const batch0 = JSON.parse(readFileSync(join(EVAL, 'PS22-9-CONTINUATION-V2-BATCH0-2026-11-23.json'), 'utf8'));
const batch1 = JSON.parse(readFileSync(join(EVAL, 'PS22-9-CONTINUATION-V2-BATCH1-2026-11-23.json'), 'utf8'));
const expected97 = [
  ...new Set([
    ...recon.inventory.preservedCores,
    ...(batch0.expectedBatch0 || batch0.expectedBatch || []),
    ...(batch1.expectedBatch || []),
  ]),
];

/** Latest structured candidate per core from local evidence. Historical files are read-only. */
const byCore = new Map();
function ingest(file, evidence) {
  const out = evidence.structured_output || evidence;
  const candidates = out.candidates || evidence.candidates || [];
  const ctx = out._forgeniqPublicationRegulatoryContext || evidence._forgeniqPublicationRegulatoryContext || null;
  const runId = evidence.runId || null;
  for (const c of candidates) {
    const parsed = parseProvisionReference(c.provisionReference || c.provisionCore || '');
    const core = parsed?.core;
    if (!core || !expected97.includes(core)) continue;
    const row = { file, runId, candidate: c, consultationPreserved: ctx?.consultationPreserved === true, ctx };
    const prev = byCore.get(core);
    const score = String(c.sourceQuotation || '').length + (ctx ? 1 : 0);
    const prevScore = prev ? String(prev.candidate.sourceQuotation || '').length : -1;
    if (!prev || score > prevScore) byCore.set(core, row);
  }
}

for (const name of readdirSync(EVAL)) {
  if (!name.startsWith('PS22-9-') || !name.endsWith('.json')) continue;
  if (name.includes('REVALIDATION') || name.includes('REASSESSMENT') || name.includes('SOURCE-PUBLICATION')) continue;
  let evidence;
  try {
    evidence = JSON.parse(readFileSync(join(EVAL, name), 'utf8'));
  } catch {
    continue;
  }
  if (evidence.structured_output?.candidates || evidence.candidates) ingest(name, evidence);
}

const pdf = readFileSync(PDF);
const sha256 = createHash('sha256').update(pdf).digest('hex');
const extracted = await extractRegulatoryPdfContent(pdf);
const blocks = buildPdfEvidenceBlocks(
  { publicationId: '7a73ac4c-d6b4-4411-9f6d-1276053f2831', extractionRevisionId: 'reassess', sourcePdfSha256: sha256, extractionProfile: 'pdf_primary_v1' },
  extracted.structured,
);
const start = detectLegalInstrumentStartPage(blocks);
const index = buildProvisionPagesIndex(blocks, start);

const rows = expected97.map((core) => {
  const hit = byCore.get(core);
  const marker = markerOf(core);
  const pages = [...(index.get(core)?.pages || [])];
  const inPdf = index.has(core);
  const window = new Set(pages.flatMap((p) => [p - 1, p, p + 1]));
  const pdfText = blocks
    .filter((b) => window.has(b.pageNumber))
    .map((b) => b.extractedText || '')
    .join(' ');
  const quote = hit?.candidate?.sourceQuotation || '';
  const verbatim = hit ? quotationVerbatim(quote, pdfText) : { verbatim: false, segments: 0, missing: ['no_candidate'] };
  const code = hit?.candidate?.regulatoryClassificationCode || hit?.candidate?.bindingNature || null;
  const parsedCode = hit ? parseProvisionReference(hit.candidate.provisionReference || '')?.marker : null;
  const markerMatch = !marker || parsedCode === marker || code === marker;
  const consultationAffected = hit?.consultationPreserved === true || hit?.candidate?.bindingNature === 'consultation_proposal';

  const coreInSource = canon(pdfText).includes(canon(core.replace(/([RGE])$/i, ' $1'))) || canon(pdfText).includes(canon(core));
  const recoverableFromPdf = inPdf && pdfText.length > 80 && coreInSource;

  let disposition;
  let reason;
  let evidenceBasis;
  if (sha256 !== SHA) {
    disposition = INVALID;
    reason = 'Fixture SHA256 does not match recorded revision';
    evidenceBasis = 'none';
  } else if (!inPdf || !recoverableFromPdf) {
    disposition = !inPdf ? INVALID : FRESH;
    reason = !inPdf
      ? 'Provision identifier not found in the PS22/9 instrument index'
      : 'Source pages do not contain recoverable provision text; historical AI output cannot repair it';
    evidenceBasis = 'insufficient';
  } else if (marker === 'E') {
    disposition = HUMAN;
    reason = 'Evidential provision text is in the instrument; obligation treatment requires human legal review';
    evidenceBasis = hit?.candidate ? 'historical_candidate_plus_pdf' : 'pdf_instrument';
  } else if (hit && verbatim.verbatim && markerMatch && !consultationAffected) {
    disposition = VALID;
    reason = 'Identifier, quotation and marker already align with the final instrument';
    evidenceBasis = 'historical_candidate_plus_pdf';
  } else if (hit && verbatim.verbatim && markerMatch && consultationAffected) {
    disposition = CORRECTED;
    reason = 'Quotation verified; consultation presentation corrected to final-instrument status without a new AI call';
    evidenceBasis = 'historical_candidate_plus_pdf';
  } else if (hit && !verbatim.verbatim) {
    disposition = CORRECTED;
    reason = 'Historical quotation was not verbatim on cited pages; provision text recovered from the PS22/9 instrument index';
    evidenceBasis = 'pdf_instrument_replaces_unverified_quotation';
  } else if (hit && !markerMatch) {
    disposition = HUMAN;
    reason = 'PDF text recovered but historical marker disagrees with the provision identifier';
    evidenceBasis = 'pdf_instrument';
  } else {
    disposition = CORRECTED;
    reason = 'No local structured AI candidate; legal status taken from the verified PS22/9 instrument text. Staging extraction records remain unchanged.';
    evidenceBasis = 'pdf_instrument';
  }

  return {
    core,
    reassessmentVersion: 'ps22-9-legal-reassessment-v1',
    historicalAiPreserved: true,
    historicalRunId: hit?.runId || null,
    historicalEvidenceFile: hit?.file || null,
    sourceSha256: sha256,
    sourceSha256Match: sha256 === SHA,
    inInstrumentIndex: inPdf,
    pdfPages: pages,
    instrumentStartPage: start,
    quotationVerbatim: verbatim.verbatim,
    quotationSegments: verbatim.segments,
    ruleOrGuidanceMarker: marker,
    markerMatch,
    legalStatusInFinalInstrument: legalStatusInInstrument(marker),
    commencement: META.commencement,
    scopeConditions: META.scopeNote,
    affectedByConsultationMisclassification: Boolean(consultationAffected),
    historicalBindingNature: hit?.candidate?.bindingNature || null,
    evidenceBasis,
    disposition,
    reason,
    legallyVerified: false,
    legallyVerifiedBlockers: [
      'human_legal_review_not_recorded',
      'maker_checker_not_recorded',
      'firm_applicability_not_assessed',
    ],
    humanApprovalRequired: true,
    makerCheckerRequired: true,
    paidReextractionRecommended: disposition === FRESH,
  };
});

const count = (d) => rows.filter((r) => r.disposition === d).length;
const summary = {
  provisionCount: rows.length,
  legallyVerifiedCount: 0,
  validNoCorrection: count(VALID),
  correctedUsingExistingEvidence: count(CORRECTED),
  requiresHumanLegalReview: count(HUMAN),
  requiresFreshAiExtraction: count(FRESH),
  invalidSourceOrEvidence: count(INVALID),
  paidReextractionCount: rows.filter((r) => r.paidReextractionRecommended).length,
  note: 'A matching reference and quotation is not a legally verified obligation. legallyVerifiedCount remains 0.',
};

const report = {
  generatedAt: new Date().toISOString(),
  publication: META,
  sourceSha256: sha256,
  historicalAiMutated: false,
  summary,
  provisions: rows,
};

writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ out: OUT, summary }, null, 2));

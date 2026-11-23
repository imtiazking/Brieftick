#!/usr/bin/env node
/**
 * TP/FP/FN reconciliation: PS26/1 live extraction vs independent instrument ground truth.
 * Distinguishes provision identification from binding-obligation extraction.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { runAs, STAGING_ORIGIN } from '../uat/staging-user-sessions.mjs';
import { parseProvisionReference } from '../../lib/ri/classification/provision-eligibility.mjs';
import {
  analyseInstrumentProvisionText,
  buildProvisionPagesIndex,
  detectLegalInstrumentStartPage,
  hasDutyLanguage,
  hasNonOperativeLanguage,
  isTransitionalTable,
  mergeInstrumentBlocksByPage,
  PROVISION_TEXT_STATUS,
} from '../../lib/ri/classification/provision-eligibility.mjs';
import { buildInstrumentProvisionInventory } from '../../lib/ri/classification/provision-inventory.mjs';
import { extractRegulatoryPdfContent } from '../../../../integrations/regulatory-sources/core/regulatory-pdf-extract.mjs';
import { buildPdfEvidenceBlocks } from '../../../../integrations/regulatory-sources/core/pdf-evidence-blocks.mjs';
import { extractProvisionScopedExcerpt } from '../../lib/ri/ai/deterministic-provision-candidates.mjs';

const INDEP = join(REPO_ROOT, 'docs/eval/FCA-PS26-INDEPENDENT-PROVISION-VERIFICATION-2026-11-23.json');
const OUT = join(REPO_ROOT, 'docs/eval/FCA-PS26-ACCURACY-FULL-RECONCILIATION-2026-11-23.json');
const PUB = '829c5472-953a-40ff-9628-947afbfe4e7a';
const RUNS = ['2c840c0b-0534-4429-a02d-6db8850a3f91', '6f05a9eb-8984-4a2b-8b78-2e7effbf8892'];

function normCore(ref) {
  const p = parseProvisionReference(ref);
  return p?.core || String(ref || '').replace(/^CONC\s+/i, '').replace(/\s+/g, '');
}

function corePattern(core) {
  const normalized = String(core || '').replace(/\s+/g, '');
  const m = normalized.match(/^([\dA-Z.]+?)(\d)([RGDE])$/i);
  if (!m) {
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(escaped, 'i');
  }
  const [, prefix, lastDigit, suffix] = m;
  return new RegExp(`${prefix.replace(/\./g, '\\.')}${lastDigit}\\s*${suffix}\\b`, 'i');
}

function candidatesFromRun(structuredOutput) {
  const o = structuredOutput && typeof structuredOutput === 'object' ? structuredOutput : {};
  const out = [];
  for (const c of o.candidates || []) {
    const core = normCore(c.provisionReference || c.provisionCore);
    out.push({
      kind: 'candidate',
      core,
      binding:
        c.bindingNature === 'binding_requirement' ||
        c.regulatoryClassificationCode === 'R' ||
        c.legalStatus === 'binding',
      text: [c.statement, c.sourceQuotation, c.provisionReference, c.obligationStatement].filter(Boolean).join('\n'),
      provisionReference: c.provisionReference || null,
    });
  }
  for (const c of o.claims || []) {
    out.push({
      kind: 'claim',
      core: normCore(c.provisionReference),
      binding: true,
      text: c.text || '',
      provisionReference: c.provisionReference || null,
    });
  }
  return out;
}

const indep = JSON.parse(readFileSync(INDEP, 'utf8'));
const pdf = readFileSync(join(REPO_ROOT, 'integrations/regulatory-sources/fixtures/fca-ps26-1-official.pdf'));
const extracted = await extractRegulatoryPdfContent(pdf);
const blocks = buildPdfEvidenceBlocks(
  { publicationId: PUB, extractionRevisionId: 'recon', sourcePdfSha256: 'x', extractionProfile: 'pdf_primary_v1' },
  extracted.structured,
);
const start = detectLegalInstrumentStartPage(blocks);
const inv = buildInstrumentProvisionInventory(blocks, start);
const byPage = mergeInstrumentBlocksByPage(blocks, start);
const index = buildProvisionPagesIndex(blocks, start);
analyseInstrumentProvisionText(blocks, start);

const bindingRProvisions = indep.provisions.filter((p) => p.legalClassificationIndependent === 'binding_requirement');

const groundTruthRows = bindingRProvisions.map((p) => {
  const core = p.core;
  const row = inv.byCore.get(core);
  const pages = row?.pages || p.fcaPages || [];
  let quotation = p.citationExcerpt || '';
  if (!quotation || quotation.length < 30) {
    quotation = extractProvisionScopedExcerpt(byPage, pages, core) || quotation;
  }
  const statuses = pages.flatMap((pg) => {
    const st = index.get(core)?.status?.[pg];
    return st ? [st] : [];
  });
  const textStatus = statuses.includes(PROVISION_TEXT_STATUS.AMENDMENT_MARKUP_UNCERTAIN)
    ? 'AMENDMENT_MARKUP_UNCERTAIN'
    : statuses.includes(PROVISION_TEXT_STATUS.NEW_TEXT)
      ? 'NEW_TEXT'
      : 'INSTRUMENT_TEXT';
  const transitional = pages.some((pg) => isTransitionalTable(byPage.get(pg) || '')) || core.startsWith('TP ');
  const duty = hasDutyLanguage(quotation);
  const nonOp = hasNonOperativeLanguage(quotation);
  const operativeBindingCandidate =
    textStatus !== 'AMENDMENT_MARKUP_UNCERTAIN' && !transitional && duty && !(nonOp && !duty);
  const requiresExceptionTriage =
    textStatus === 'AMENDMENT_MARKUP_UNCERTAIN' || transitional || !duty;
  const requiresNewObligation = operativeBindingCandidate;
  let provisionKind = 'operative_rule';
  if (transitional) provisionKind = 'transitional';
  else if (nonOp && !duty) provisionKind = 'application_or_scope';
  else if (textStatus === 'AMENDMENT_MARKUP_UNCERTAIN') provisionKind = 'amendment_uncertain';
  return {
    core,
    pages,
    textStatus,
    provisionKind,
    commencementDate: p.commencementDate,
    operativeBindingCandidate,
    requiresExceptionTriage,
    requiresNewObligation,
    authoritativeExcerpt: quotation.slice(0, 400),
  };
});

let aiCandidates = [];
let orchestration = {};
let spendUsd = 0;

await runAs('A', async ({ page }) => {
  for (const runId of RUNS) {
    const run = await (await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/ai-analysis-runs/${runId}`)).json().catch(() => ({}));
    const out = run.detail?.structured_output;
    aiCandidates.push(...candidatesFromRun(out));
    spendUsd +=
      Number(
        out?._forgeniqSpend?.costUsdEstimate ??
          out?._forgeniqLabSpendAudit?.calculatedUsd ??
          out?._forgeniqLabSpendAudit?.actualUsd,
      ) || 0;
  }
  const orch = await (await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/publications/${PUB}/extraction-orchestration`)).json().catch(() => ({}));
  orchestration = orch.orchestration || {};
});

const exceptionCores = new Set((orchestration.provisionOutcomes || []).filter((x) => x.trackingStatus === 'exception').map((x) => x.core));
const suppliedCores = new Set(orchestration.cumulativeSuppliedProvisionCores || []);

const reconciliation = groundTruthRows.map((gt) => {
  const re = corePattern(gt.core);
  const textMentions = aiCandidates.filter((c) => re.test(c.text || '') || c.core === gt.core);
  const refMentions = aiCandidates.filter((c) => c.provisionReference && normCore(c.provisionReference) === gt.core);
  const bindingClaims = textMentions.filter((c) => c.binding);
  const identifiedByAi = textMentions.length > 0 || refMentions.length > 0;
  const bindingExtracted = bindingClaims.length > 0;
  const benchmarkWouldMatch = identifiedByAi;
  const inExceptions = exceptionCores.has(gt.core);
  const suppliedForAnalysis = suppliedCores.has(gt.core);
  return {
    ...gt,
    suppliedForAnalysis,
    routedToException: inExceptions,
    aiProvisionIdentified: identifiedByAi,
    aiBindingClaimOnCore: bindingExtracted,
    aiCandidateCount: textMentions.length,
    aiBindingClaimCount: bindingClaims.length,
    structuredProvisionReferenceHits: refMentions.length,
    benchmarkMatchingNote:
      refMentions.length === 0 && textMentions.length > 0 ? 'text_hit_without_structured_provisionReference' : null,
  };
});

const identificationTp = reconciliation.filter((r) => r.aiProvisionIdentified).length;
const identificationFn = reconciliation.filter((r) => !r.aiProvisionIdentified).length;

const obligationTargets = reconciliation.filter((r) => r.requiresNewObligation);
const obligationTp = obligationTargets.filter((r) => r.aiBindingClaimOnCore).length;
const obligationFn = obligationTargets.filter((r) => !r.aiBindingClaimOnCore).length;

const obligationFp = reconciliation.filter(
  (r) => r.aiBindingClaimOnCore && !r.requiresNewObligation,
).length;

const payload = {
  generatedAt: new Date().toISOString(),
  publication: 'PS26/1',
  groundTruthSource: 'fca-ps26-1-official.pdf + provision-eligibility heuristics (not AI output)',
  aiRuns: RUNS,
  spendUsdFromRuns: spendUsd,
  distinction: {
    provisionIdentification: 'Any AI candidate/claim text or structured reference citing the provision core',
    bindingObligationExtraction: 'Binding-classified AI output tied to cores flagged requiresNewObligation in ground truth',
    requiresNewObligationRule:
      'R-marker + convertible text + duty language + not amendment-uncertain/transitional — does not auto-obligate all 28 R rules',
  },
  groundTruthSummary: {
    bindingRInventory: bindingRProvisions.length,
    operativeBindingCandidates: obligationTargets.length,
    requiresExceptionTriage: reconciliation.filter((r) => r.requiresExceptionTriage).length,
    byProvisionKind: Object.fromEntries(
      [...new Set(reconciliation.map((r) => r.provisionKind))].map((k) => [
        k,
        reconciliation.filter((r) => r.provisionKind === k).length,
      ]),
    ),
  },
  confusionMatrices: {
    provisionIdentificationAmong28R: {
      truePositives: identificationTp,
      falseNegatives: identificationFn,
      recall: identificationTp / bindingRProvisions.length,
    },
    bindingObligationAmongOperativeCandidates: {
      denominator: obligationTargets.length,
      truePositives: obligationTp,
      falseNegatives: obligationFn,
      falsePositivesWrongBindingClaims: obligationFp,
      recall: obligationTargets.length ? obligationTp / obligationTargets.length : null,
      precision: obligationTp + obligationFp ? obligationTp / (obligationTp + obligationFp) : null,
    },
  },
  priorMetricMisinterpretation:
    'Earlier 1/28 recall used only 3 human-verified gold rules in the staging benchmark harness, not all R provisions.',
  reconciliation,
  exceptionCores: [...exceptionCores],
  productionReady: false,
};

writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(JSON.stringify({ out: OUT, matrices: payload.confusionMatrices, groundTruthSummary: payload.groundTruthSummary }, null, 2));
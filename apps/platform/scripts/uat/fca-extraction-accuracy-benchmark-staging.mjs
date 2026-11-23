#!/usr/bin/env node
/**
 * Claim-level FCA extraction accuracy for PS26/1 live pilot vs verified regulatory evidence.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runAs, STAGING_ORIGIN } from './staging-user-sessions.mjs';
import { parseProvisionReference } from '../../lib/ri/classification/provision-eligibility.mjs';

const EVAL = resolve(process.cwd(), '..', '..', 'docs', 'eval');
const OUT = resolve(EVAL, 'FCA-EXTRACTION-ACCURACY-BENCHMARK-2026-11-23.json');
const PHYSICAL = resolve(EVAL, 'FCA-PS26-1-PHYSICAL-SOURCE-EVIDENCE.json');
const AUDIT = resolve(EVAL, 'PS26-1-UNRESOLVED-PROVISION-AUDIT-2026-11-23.json');
const SOURCE = resolve(EVAL, 'PS26-1-PROVISION-SOURCE-VERIFICATION-2026-11-22.json');
const PUB = '829c5472-953a-40ff-9628-947afbfe4e7a';
const BATCH_RUNS = [
  '2c840c0b-0534-4429-a02d-6db8850a3f91',
  '6f05a9eb-8984-4a2b-8b78-2e7effbf8892',
];

function normCore(ref) {
  const p = parseProvisionReference(ref);
  return p?.core || String(ref || '').replace(/^CONC\s+/i, '').replace(/\s+/g, '');
}

function coreToPattern(core) {
  const normalized = String(core || '').replace(/\s+/g, '');
  const m = normalized.match(/^([\dA-Z.]+?)(\d)([RGDE])$/i);
  if (!m) {
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return { core: normalized, re: new RegExp(escaped, 'i') };
  }
  const [, prefix, lastDigit, suffix] = m;
  const re = new RegExp(`${prefix.replace(/\./g, '\\.')}${lastDigit}\\s*${suffix}\\b`, 'i');
  return { core: normalized, re };
}

function textBundlesFromRun(structuredOutput) {
  const output = structuredOutput && typeof structuredOutput === 'object' ? structuredOutput : {};
  const bundles = [];
  for (const c of output.candidates || []) {
    bundles.push({
      text: [c.statement, c.sourceQuotation, c.provisionReference, c.obligationStatement].filter(Boolean).join('\n'),
      binding: c.bindingNature === 'binding_requirement' || c.regulatoryClassificationCode === 'R',
    });
  }
  for (const c of output.claims || []) {
    bundles.push({ text: c.text || '', binding: true });
  }
  return bundles;
}

function goldHitsInText(text, goldPatterns) {
  const hits = [];
  for (const { core, re } of goldPatterns) {
    if (re.test(text || '')) hits.push(core);
  }
  return hits;
}

const physical = JSON.parse(readFileSync(PHYSICAL, 'utf8'));
const goldBinding = (physical.bindingProvisions || [])
  .filter((p) => p.binding === true)
  .map((p) => normCore(p.rule.replace(/-/g, ' ')));
const goldPatterns = [...new Set(goldBinding)].map(coreToPattern);

const audit = JSON.parse(readFileSync(AUDIT, 'utf8'));
const exceptionCores = (audit.provisions || []).map((p) => p.core);

let textBundles = [];
let spendUsd = 0;

await runAs('A', async ({ page }) => {
  for (const runId of BATCH_RUNS) {
    const run = await (await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/ai-analysis-runs/${runId}`))
      .json()
      .catch(() => ({}));
    const out = run.detail?.structured_output;
    textBundles.push(...textBundlesFromRun(out));
    const spend =
      out?._forgeniqSpend?.costUsdEstimate ??
      out?._forgeniqLabSpendAudit?.calculatedUsd ??
      out?._forgeniqLabSpendAudit?.actualUsd;
    if (spend != null) spendUsd += Number(spend) || 0;
  }

  const orch = await (await page.request.get(`${STAGING_ORIGIN}/api/ri-lab/publications/${PUB}/extraction-orchestration`))
    .json()
    .catch(() => ({}));
  const o = orch.orchestration || {};
  const supplied = o.cumulativeSuppliedProvisionCores?.length ?? 0;
  const invCount = JSON.parse(readFileSync(SOURCE, 'utf8')).inventoryProvisionCount ?? 47;
  const outcomes = o.provisionOutcomes || [];
  const unresolvedRate = outcomes.filter((x) => x.trackingStatus === 'unresolved').length / (invCount || 1);

  const hitSet = new Set();
  for (const b of textBundles) {
    for (const h of goldHitsInText(b.text, goldPatterns)) hitSet.add(h);
  }
  const hits = goldBinding.filter((g) => hitSet.has(g));
  const bindingBundles = textBundles.filter((b) => b.binding && b.text?.trim());
  const onGoldBundles = bindingBundles.filter((b) => goldHitsInText(b.text, goldPatterns).length > 0);
  const perProvision = [...new Set(goldBinding)].map((core) => ({
    core,
    recalled: hitSet.has(core),
    bindingClaimHits: bindingBundles.filter((b) => goldHitsInText(b.text, [coreToPattern(core)]).length)
      .length,
  }));

  const bindingRequirementRecall = goldBinding.length ? hits.length / goldBinding.length : null;
  const bindingRequirementPrecision = bindingBundles.length
    ? onGoldBundles.length / bindingBundles.length
    : null;

  const payload = {
    generatedAt: new Date().toISOString(),
    scope: 'FCA PS26/1 live pilot batches 0–1 vs FCA-PS26-1-PHYSICAL-SOURCE-EVIDENCE binding provisions',
    benchmarkSource: 'FCA-PS26-1-PHYSICAL-SOURCE-EVIDENCE.json',
    provisionAudit: 'PS26-1-UNRESOLVED-PROVISION-AUDIT-2026-11-23.json',
    goldBindingProvisionCores: goldBinding,
    goldBindingProvisionCount: [...new Set(goldBinding)].length,
    perProvision,
    emittedCandidateCount: textBundles.length,
    emittedBindingCandidateCount: bindingBundles.length,
    emittedBindingCandidateCountOnGold: onGoldBundles.length,
    metrics: {
      bindingRequirementPrecision,
      bindingRequirementRecall,
      incorrectClassifications: Math.max(0, bindingBundles.length - onGoldBundles.length),
      missedObligations: goldBinding.length - hits.length,
      unsupportedQuotations: null,
      evidentialProvisionAccuracy: hits.length / goldBinding.length,
      reviewerCorrectionRate: null,
      unresolvedProvisionRate: unresolvedRate,
      provisionProcessingCoverageRatio: invCount ? supplied / invCount : null,
    },
    exceptionTriageCores: exceptionCores,
    notes: [
      `Precision/recall are claim-level against ${[...new Set(goldBinding)].length} human-verified instrument binding rules from FCA physical source evidence.`,
      'provisionProcessingCoverageRatio is orchestration supply only — not extraction recall.',
      'Quotation-level unsupportedQuotations requires SME review — not automated in this harness.',
    ],
    actualSpendUsdFromProviderAudit: spendUsd,
    estimatedSpendUsd: spendUsd,
  };
  writeFileSync(OUT, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload, null, 2));
});
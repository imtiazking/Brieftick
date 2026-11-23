#!/usr/bin/env node
/**
 * Deterministic audit of PS26/1 unresolved provision cores vs PDF inventory and batch plan.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { REPO_ROOT } from '../../lib/ri/eval/eval-paths.mjs';
import { extractRegulatoryPdfContent } from '../../../../integrations/regulatory-sources/core/regulatory-pdf-extract.mjs';
import { buildPdfEvidenceBlocks } from '../../../../integrations/regulatory-sources/core/pdf-evidence-blocks.mjs';
import {
  analyseInstrumentProvisionText,
  buildProvisionPagesIndex,
  detectLegalInstrumentStartPage,
  mergeInstrumentBlocksByPage,
  hasDutyLanguage,
  isTransitionalTable,
  parseProvisionReference,
  PROVISION_TEXT_STATUS,
} from '../../lib/ri/classification/provision-eligibility.mjs';
import { buildInstrumentProvisionInventory } from '../../lib/ri/classification/provision-inventory.mjs';
import { buildPublicationExtractionBatchPlan } from '../../lib/ri/ai/extraction-batch-plan.mjs';
import { extractProvisionScopedExcerpt } from '../../lib/ri/ai/deterministic-provision-candidates.mjs';

const CORES = [
  '16.1.6R',
  '2.7.19GG',
  '2.7.19HG',
  '2.7.7FG',
  '2.8.6CG',
  '8.12.11AG',
  'TP 13.5G',
];
const OUT = resolve(process.cwd(), '..', '..', 'docs', 'eval', 'PS26-1-UNRESOLVED-PROVISION-AUDIT-2026-11-23.json');
const pdf = readFileSync(
  join(REPO_ROOT, 'integrations/regulatory-sources/fixtures/fca-ps26-1-official.pdf'),
);
const extracted = await extractRegulatoryPdfContent(pdf);
const blocks = buildPdfEvidenceBlocks(
  {
    publicationId: '829c5472-953a-40ff-9628-947afbfe4e7a',
    extractionRevisionId: 'audit',
    sourcePdfSha256: 'local',
    extractionProfile: 'pdf_primary_v1',
  },
  extracted.structured,
);
const start = detectLegalInstrumentStartPage(blocks);
const inv = buildInstrumentProvisionInventory(blocks, start);
const plan0 = buildPublicationExtractionBatchPlan(blocks, {
  instrumentStartPage: start,
  maxSectionsPerBatch: 18,
  maxBatches: 1,
  fullPublicationCoverage: false,
});
const batch0New = plan0.batches[0]?.instrumentProvisionsNewlySupplied || [];
const plan1 = buildPublicationExtractionBatchPlan(blocks, {
  instrumentStartPage: start,
  maxSectionsPerBatch: 18,
  startSuppliedCores: batch0New,
  fullPublicationCoverage: true,
});
const batch1New = plan1.batches[0]?.instrumentProvisionsNewlySupplied || [];
const cumulative = [...new Set([...batch0New, ...batch1New])].sort();
const byPage = mergeInstrumentBlocksByPage(blocks, start);
const textStatus = analyseInstrumentProvisionText(blocks, start);
const index = buildProvisionPagesIndex(blocks, start);

const rows = [];
for (const core of CORES) {
  const row = inv.byCore.get(core);
  const inCumulative = cumulative.includes(core);
  const inBatch0 = batch0New.includes(core);
  const inBatch1 = batch1New.includes(core);
  const pages = row?.pages?.length ? [...row.pages] : index.get(core)?.pages ? [...index.get(core).pages] : [];
  let quotation = '';
  for (const p of pages) {
    const excerpt = extractProvisionScopedExcerpt(byPage, pages, core);
    if (excerpt?.trim()) {
      quotation = excerpt.slice(0, 480);
      break;
    }
  }
  const statuses = pages.flatMap((p) => {
    const st = index.get(core)?.status?.[p];
    return st ? [st] : [];
  });
  const pageText = pages.map((p) => byPage.get(p) || '').join('\n');
  const transitionalTable = pages.some((p) => isTransitionalTable(byPage.get(p) || ''));
  const duty = hasDutyLanguage(quotation || pageText.slice(0, 2000));
  rows.push({
    core,
    inInventory: Boolean(row),
    inventoryTracking: row?.trackingStatus ?? null,
    inCumulativePlan: inCumulative,
    suppliedInBatch: inBatch0 ? 0 : inBatch1 ? 1 : null,
    pages,
    textStatus: statuses[0] ?? null,
    transitionalTableContext: transitionalTable,
    hasDutyLanguageInExcerpt: duty,
    authoritativeQuotationExcerpt: quotation || null,
    parseCheck: parseProvisionReference(`CONC ${core.replace(/^TP /, 'SYSC TP ')}`)?.core ?? parseProvisionReference(core)?.core,
    classificationHint:
      transitionalTable || core.startsWith('TP ')
        ? 'TRANSITIONAL_ARRANGEMENT — exception triage; not auto non-obligatory'
        : statuses.includes(PROVISION_TEXT_STATUS.AMENDMENT_MARKUP_UNCERTAIN)
          ? 'AMENDMENT_MARKUP_UNCERTAIN — exception triage'
          : statuses.includes(PROVISION_TEXT_STATUS.NEW_TEXT)
            ? 'NEW_TEXT — review for operative duty'
            : 'INSTRUMENT_TEXT — review for operative duty',
  });
}

const inventoryCores = inv.provisions.map((p) => p.core).sort();
const missingFromCumulative = inventoryCores.filter((c) => !cumulative.includes(c));
const extraInCumulative = cumulative.filter((c) => !inventoryCores.includes(c));

writeFileSync(
  OUT,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      instrumentStartPage: start,
      inventoryProvisionCount: inventoryCores.length,
      plannedCumulativeCount: cumulative.length,
      missingFromCumulative,
      extraInCumulative,
      provisions: rows,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ out: OUT, rows: rows.map((r) => ({ core: r.core, batch: r.suppliedInBatch, inCumulative: r.inCumulativePlan })) }, null, 2));
process.exit(missingFromCumulative.length > 0 ? 1 : 0);
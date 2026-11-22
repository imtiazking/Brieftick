#!/usr/bin/env node
/**
 * PS26/1 UC-RI-005 pre-flight (no AI call, no database or storage access, no secrets).
 *
 * Reproduces the exact source sections the extraction would send: the public PDF is re-parsed with the
 * ingest parser and accepted only if both the PDF hash and the structured-extraction hash equal the
 * staging pdf_primary_v1 revision; blocks are then selected with the extraction's own selection and
 * description functions (instrument-aware for UC-RI-005), and compared with the previous keyword selection.
 * Duty and applicability flags are text heuristics for human review, not classifications.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';
import { extractRegulatoryPdfContent } from '../../../integrations/regulatory-sources/core/regulatory-pdf-extract.mjs';
import { buildPdfEvidenceBlocks } from '../../../integrations/regulatory-sources/core/pdf-evidence-blocks.mjs';
import {
  describeSelectedSections,
  selectEvidenceBlocksForAnalysis,
} from '../lib/ri/ai/build-pdf-grounded-analysis-context.mjs';
import {
  detectLegalInstrumentStartPage,
  hasDutyLanguage,
  hasNonOperativeLanguage,
  provisionMarkersInText,
} from '../lib/ri/classification/provision-eligibility.mjs';

const PDF_URL = 'https://www.fca.org.uk/publication/policy/ps26-1.pdf';
const STAGING_REVISION = {
  publicationId: '829c5472-953a-40ff-9628-947afbfe4e7a',
  extractionRevisionId: 'e3f3991b-6b6e-41d6-9fa8-331784f2bc3b',
  rawContentSha256: '2efd6b9051b6f654f55363bcbe8110c1e5825f1266afdda5e1adeb98732e7998',
  structuredSha256: '1832fe1fd6b23b5e58b482fe05644a24def3b28e106e67f58ec08210903ad139',
};
const CORE_PROVISIONS = ['4.2A.3R', '4.2A.4R', '4.2A.5R', '4.2A.6R', '4.2A.8R', '4.8.2R', '7.20.1R', '7.20.3R', '11.1.2R', '16.1.4R'];
const OUT = join(REPO_ROOT, 'docs/eval/PS26-1-UC-RI-005-SECTION-PREFLIGHT.json');

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const res = await fetch(PDF_URL);
if (!res.ok) throw new Error(`pdf_download_failed:${res.status}`);
const pdf = Buffer.from(await res.arrayBuffer());
const pdfSha = sha256(pdf);

const extracted = await extractRegulatoryPdfContent(pdf);
if (!extracted.ok) throw new Error(extracted.code || 'pdf_extract_failed');
const structuredSha = sha256(Buffer.from(JSON.stringify(extracted.structured), 'utf8'));
const identical = pdfSha === STAGING_REVISION.rawContentSha256 && structuredSha === STAGING_REVISION.structuredSha256;

const blocks = buildPdfEvidenceBlocks(
  {
    publicationId: STAGING_REVISION.publicationId,
    extractionRevisionId: STAGING_REVISION.extractionRevisionId,
    sourcePdfSha256: STAGING_REVISION.rawContentSha256,
    extractionProfile: 'pdf_primary_v1',
  },
  extracted.structured,
);
const instrumentStartPage = detectLegalInstrumentStartPage(blocks);
const current = describeSelectedSections(blocks, selectEvidenceBlocksForAnalysis(blocks, { instrumentStartPage }), instrumentStartPage);
const previous = describeSelectedSections(blocks, selectEvidenceBlocksForAnalysis(blocks), instrumentStartPage);

const documentMarkers = blocks.flatMap((b) => provisionMarkersInText(b.extractedText).map((p) => ({ ...p, page: b.pageNumber })));
const coreCoverage = (described) =>
  Object.fromEntries(CORE_PROVISIONS.map((p) => [p, described.sourceSections.filter((s) => s.provisionsSetOut.includes(p)).map((s) => s.pageNumber)]));
const coreTextStatus = (described) =>
  Object.fromEntries(
    CORE_PROVISIONS.map((p) => [p, [...new Set(described.sourceSections.map((s) => s.provisionTextStatus?.[p]).filter(Boolean))]]),
  );

const sections = current.sourceSections.map((s, i) => ({
  order: i + 1,
  sourceSectionId: s.sourceSectionId,
  page: s.pageNumber,
  citation: s.citation,
  inLegalInstrument: s.inLegalInstrument,
  transitionalProvisions: s.transitionalProvisions,
  provisionsSetOut: s.provisionsSetOut,
  provisionTextStatus: s.provisionTextStatus,
  crossReferences: [...new Set(provisionMarkersInText(s.text).filter((p) => !p.setOut).map((p) => `${p.sourcebook} ${p.core}`))],
  characters: s.text.length,
  truncated: s.truncated,
  heuristicFlags: { dutyLanguage: hasDutyLanguage(s.text), applicabilityOrExemptionLanguage: hasNonOperativeLanguage(s.text) },
  excerpt: s.text.replace(/\s+/g, ' ').slice(0, 300),
}));

const report = {
  schemaVersion: 'forgeniq.ps26-1.uc-ri-005-section-preflight.v2',
  capturedAt: new Date().toISOString(),
  aiCall: false,
  source: { url: PDF_URL, pdfSha256: pdfSha, structuredSha256: structuredSha, ...STAGING_REVISION },
  reproducesStagingRevision: identical,
  document: {
    pages: extracted.pageCount,
    evidenceBlocks: blocks.length,
    instrumentStartPage,
    provisionMarkersByType: documentMarkers.reduce((m, p) => ({ ...m, [p.marker]: (m[p.marker] || 0) + 1 }), {}),
    eProvisions: documentMarkers.filter((p) => p.marker === 'E'),
  },
  selection: {
    ...current.selection,
    coreProvisionPages: coreCoverage(current),
    coreProvisionTextStatus: coreTextStatus(current),
    eProvisionsSupplied: sections.flatMap((s) => s.provisionsSetOut.filter((p) => p.endsWith('E'))),
  },
  previousKeywordSelection: {
    ...previous.selection,
    instrumentPagesSelected: previous.sourceSections.filter((s) => s.inLegalInstrument).length,
    coreProvisionPages: coreCoverage(previous),
  },
  sections,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      out: OUT,
      reproducesStagingRevision: identical,
      instrumentStartPage,
      documentE: report.document.eProvisions.length,
      current: report.selection,
      supplied: sections.filter((s) => s.provisionsSetOut.length).map((s) => `p${s.page} ${JSON.stringify(s.provisionTextStatus)}`),
      previous: {
        selectedPages: report.previousKeywordSelection.selectedPages,
        instrumentPagesSelected: report.previousKeywordSelection.instrumentPagesSelected,
        instrumentProvisionsSupplied: report.previousKeywordSelection.instrumentProvisionsSupplied,
        coreProvisionPages: report.previousKeywordSelection.coreProvisionPages,
      },
    },
    null,
    2,
  ),
);

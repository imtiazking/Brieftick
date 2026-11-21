#!/usr/bin/env node
/**
 * PS26/1 UC-RI-005 pre-flight (no AI call, no database or storage access, no secrets).
 *
 * Reproduces the exact source sections the extraction would send: the public PDF is re-parsed with the
 * ingest parser and accepted only if both the PDF hash and the structured-extraction hash equal the
 * staging pdf_primary_v1 revision; blocks are then selected with the extraction's own selection function.
 * Provision markers and the applicability/permission/exemption flags are text heuristics for human review,
 * not classifications.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';
import { extractRegulatoryPdfContent } from '../../../integrations/regulatory-sources/core/regulatory-pdf-extract.mjs';
import { buildPdfEvidenceBlocks } from '../../../integrations/regulatory-sources/core/pdf-evidence-blocks.mjs';
import {
  selectEvidenceBlocksForAnalysis,
  scoreBlockForObligationExtraction,
} from '../lib/ri/ai/build-pdf-grounded-analysis-context.mjs';

const PDF_URL = 'https://www.fca.org.uk/publication/policy/ps26-1.pdf';
const STAGING_REVISION = {
  publicationId: '829c5472-953a-40ff-9628-947afbfe4e7a',
  extractionRevisionId: 'e3f3991b-6b6e-41d6-9fa8-331784f2bc3b',
  rawContentSha256: '2efd6b9051b6f654f55363bcbe8110c1e5825f1266afdda5e1adeb98732e7998',
  structuredSha256: '1832fe1fd6b23b5e58b482fe05644a24def3b28e106e67f58ec08210903ad139',
};
const MAX_CHARS_PER_SECTION = 3200;
const OUT = join(REPO_ROOT, 'docs/eval/PS26-1-UC-RI-005-SECTION-PREFLIGHT.json');

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const PROVISION_RE = /\b((?:[A-Z]{2,6}\s+)?\d{1,2}[A-Z]?\.\d{1,2}[A-Z]?\.\d{1,3}[A-Z]?)\s*([RGEDPC])\b(?![a-z])/g;
const NON_OBLIGATION_RE =
  /\b(appl(?:y|ies|ication)\s+to|does not apply|do not apply|exempt(?:ion|ed)?|permission|is not required to|need not|may\s+(?!not))/i;
const DUTY_RE = /\b(must|shall|is required to|are required to)\b/i;

function provisionsIn(text) {
  const out = [];
  for (const m of String(text).matchAll(PROVISION_RE)) out.push({ reference: m[1].replace(/\s+/g, ' '), marker: m[2] });
  return out;
}

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
const selected = selectEvidenceBlocksForAnalysis(blocks);

const pages = extracted.structured.pages || [];
const instrumentStart = pages.find((p) => p.pageNumber >= 40 && /Made rules|INSTRUMENT\s+20\d\d/i.test(p.text || ''))?.pageNumber ?? null;
const documentChars = pages.reduce((n, p) => n + String(p.text || '').length, 0);
const documentProvisions = pages.flatMap((p) => provisionsIn(p.text).map((x) => ({ ...x, page: p.pageNumber })));
const documentE = documentProvisions.filter((x) => x.marker === 'E');

const sections = selected.map((b, i) => {
  const text = String(b.extractedText || '').slice(0, MAX_CHARS_PER_SECTION);
  const provisions = provisionsIn(text);
  return {
    order: i + 1,
    sourceSectionId: b.documentEvidenceId,
    page: b.pageNumber,
    printedPageLabel: b.printedPageLabel || null,
    sectionReference: b.sectionReference || null,
    kind: b.kind || 'paragraph',
    score: scoreBlockForObligationExtraction(b),
    inInstrument: instrumentStart != null && b.pageNumber >= instrumentStart,
    characters: text.length,
    truncated: String(b.extractedText || '').length > MAX_CHARS_PER_SECTION,
    provisionMarkers: provisions,
    heuristicFlags: {
      dutyLanguage: DUTY_RE.test(text),
      applicabilityPermissionOrExemptionLanguage: NON_OBLIGATION_RE.test(text),
    },
    excerpt: text.replace(/\s+/g, ' ').slice(0, 400),
  };
});

const selectedChars = sections.reduce((n, s) => n + s.characters, 0);
const selectedMarkers = sections.flatMap((s) => s.provisionMarkers.map((p) => ({ ...p, order: s.order, page: s.page })));
const report = {
  schemaVersion: 'forgeniq.ps26-1.uc-ri-005-section-preflight.v1',
  capturedAt: new Date().toISOString(),
  aiCall: false,
  source: { url: PDF_URL, pdfSha256: pdfSha, structuredSha256: structuredSha, ...STAGING_REVISION },
  reproducesStagingRevision: identical,
  document: {
    pages: extracted.pageCount,
    characters: documentChars,
    evidenceBlocks: blocks.length,
    instrumentStartPage: instrumentStart,
    provisionMarkersByType: documentProvisions.reduce((m, p) => ({ ...m, [p.marker]: (m[p.marker] || 0) + 1 }), {}),
    eProvisions: documentE,
  },
  selection: {
    sections: sections.length,
    characters: selectedChars,
    characterCoveragePercent: documentChars ? Number(((selectedChars / documentChars) * 100).toFixed(2)) : 0,
    pagesCovered: [...new Set(sections.map((s) => s.page))].sort((a, b) => a - b),
    sectionsInInstrument: sections.filter((s) => s.inInstrument).length,
    provisionMarkersByType: selectedMarkers.reduce((m, p) => ({ ...m, [p.marker]: (m[p.marker] || 0) + 1 }), {}),
    eProvisionsSelected: selectedMarkers.filter((p) => p.marker === 'E'),
    scope: 'PARTIAL_DOCUMENT — the extraction sees only these sections; findings do not represent analysis of the whole publication.',
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
      pdfShaMatch: pdfSha === STAGING_REVISION.rawContentSha256,
      structuredShaMatch: structuredSha === STAGING_REVISION.structuredSha256,
      document: report.document.pages + ' pages, ' + blocks.length + ' blocks, instrument from p.' + instrumentStart,
      documentMarkers: report.document.provisionMarkersByType,
      documentE: documentE.length,
      selection: report.selection,
    },
    null,
    2,
  ),
);

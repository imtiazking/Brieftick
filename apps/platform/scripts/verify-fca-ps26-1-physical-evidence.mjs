#!/usr/bin/env node
/**
 * PS26/1 — physical-page evidence for obligation-grade human gates (read-only, no ingest).
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';
import { parsePdfPhysicalPages } from '../../../integrations/regulatory-sources/core/pdf-physical-page-parser.mjs';

const PDF_PATH = join(REPO_ROOT, 'docs/eval/regulatory-sources/cache/fca-ps26-1-official.pdf');
const OUT = join(REPO_ROOT, 'docs/eval/FCA-PS26-1-PHYSICAL-SOURCE-EVIDENCE.json');

if (!existsSync(PDF_PATH)) {
  console.error('Run verify-fca-ps26-1-instrument-offline.mjs first to cache official PDF');
  process.exit(1);
}

const buf = readFileSync(PDF_PATH);
const sha256 = createHash('sha256').update(buf).digest('hex');
const physical = await parsePdfPhysicalPages(buf);

function findOnPages(patterns) {
  const hits = [];
  for (const page of physical.pages) {
    const text = page.text || '';
    for (const p of patterns) {
      const re = typeof p === 'string' ? new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : p;
      if (re.test(text)) {
        hits.push({
          physicalPageNumber: page.pageNumber,
          printedPageLabel: page.printedPageLabel,
          pattern: String(p),
          excerpt: text.replace(/\s+/g, ' ').slice(0, 320),
        });
        break;
      }
    }
  }
  return hits;
}

function firstExcerpt(pattern, maxLen = 500) {
  for (const page of physical.pages) {
    const m = page.text.match(pattern);
    if (m) {
      const idx = m.index ?? 0;
      return {
        physicalPageNumber: page.pageNumber,
        printedPageLabel: page.printedPageLabel,
        matchedText: m[0],
        context: page.text.slice(Math.max(0, idx - 80), idx + maxLen).replace(/\s+/g, ' ').trim(),
      };
    }
  }
  return null;
}

const provisions = [
  {
    id: 'CONC-4.2A.3R',
    searchPatterns: [/CONC\s+4\.2A\.3\s*R/i, /4\.2A\.3\s*R/],
    binding: true,
  },
  {
    id: 'CONC-4.2A.6R',
    searchPatterns: [/CONC\s+4\.2A\.6\s*R/i, /4\.2A\.6\s*R/],
    binding: true,
  },
  {
    id: 'CONC-7.20.1R',
    searchPatterns: [/CONC\s+7\.20\.1\s*R/i, /7\.20\.1\s*R/],
    binding: true,
  },
];

const provisionEvidence = [];
for (const prov of provisions) {
  const pages = findOnPages(prov.searchPatterns);
  const excerpt = firstExcerpt(prov.searchPatterns[0]);
  provisionEvidence.push({
    rule: prov.id,
    binding: prov.binding,
    physicalPageHits: [...new Set(pages.map((p) => p.physicalPageNumber))],
    primaryEvidence: excerpt,
    humanConfirmed: false,
  });
}

const appendix1Pages = findOnPages([/Appendix\s+1/i, /Made rules/i]);
const annexFPages = findOnPages([/Annex\s+F/i]);
const commencement = firstExcerpt(
  /(15\s+July\s+2026|Regulation Day|comes into force|come into force)/i,
);

const priorHints = JSON.parse(
  readFileSync(join(REPO_ROOT, 'docs/eval/FCA-PS26-1-INSTRUMENT-VERIFICATION.json'), 'utf8'),
);

const hintReconcile = {
  priorApproximateHints: priorHints.bindingRulesSample || [],
  physicalParser: physical.parserVersion,
  note: 'Prior script used linear index/pageSize; this artefact uses per-page text extraction.',
};

const report = {
  schemaVersion: 'forgeniq.ps26-1.physical-evidence.v1',
  capturedAt: new Date().toISOString(),
  sourceSha256: sha256,
  totalPhysicalPages: physical.numpages,
  parserVersion: physical.parserVersion,
  sectionBoundaries: {
    appendix1: { physicalPages: [...new Set(appendix1Pages.map((p) => p.physicalPageNumber))], samples: appendix1Pages.slice(0, 2) },
    annexF: { physicalPages: [...new Set(annexFPages.map((p) => p.physicalPageNumber))], samples: annexFPages.slice(0, 2) },
  },
  bindingProvisions: provisionEvidence,
  commencementEvidence: commencement,
  hintReconciliation: hintReconcile,
  ingestAllowed: false,
  humanApprovalRequired: ['OG-02', 'OG-04', 'OG-05', 'OG-06'],
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: true, out: OUT, pages: physical.numpages, provisions: provisionEvidence.length }, null, 2));
#!/usr/bin/env node
/**
 * Verify tracked PS26/1 runtime module graph (no hosted DB / Anthropic).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';

const failures = [];
const ok = (m) => console.log(`OK: ${m}`);
const fail = (m) => {
  failures.push(m);
  console.error(`FAIL: ${m}`);
};

const integrationModules = [
  'regulatory-pdf-extract.mjs',
  'pdf-physical-page-parser.mjs',
  'pdf-evidence-blocks.mjs',
  'pdf-parse-loader.mjs',
  'extraction-quality.mjs',
  'regulatory-pdf-analysis.mjs',
];

for (const f of integrationModules) {
  const p = join(REPO_ROOT, 'integrations/regulatory-sources/core', f);
  if (!existsSync(p)) fail(`missing integration ${f}`);
  else ok(`integration core/${f}`);
}

const platformMods = [
  'create-primary-pdf-extraction-revision.mjs',
  'persist-extraction-revision.mjs',
  'upload-primary-pdf-extraction.mjs',
  'ps26-official-pdf-source.mjs',
];

const snapDir = join(REPO_ROOT, 'apps/platform/lib/ri/ingestion/snapshot');
for (const f of platformMods) {
  const p = join(snapDir, f);
  if (!existsSync(p)) fail(`missing snapshot ${f}`);
  else ok(`snapshot ${f}`);
}

const { loadPs26OfficialPdfBytes } = await import(
  pathToFileURL(join(snapDir, 'ps26-official-pdf-source.mjs')).href,
);
const pdf = await loadPs26OfficialPdfBytes();
if (pdf.byteLength > 100_000) ok(`tracked PS26 PDF ${pdf.byteLength} bytes`);
else fail('PS26 PDF too small');

const { extractRegulatoryPdfContent } = await import(
  pathToFileURL(join(REPO_ROOT, 'integrations/regulatory-sources/core/regulatory-pdf-extract.mjs')).href,
);
const extracted = await extractRegulatoryPdfContent(pdf.pdfBytes);
if (extracted.ok && extracted.pageCount > 50) ok(`pdf extract ${extracted.pageCount} pages`);
else fail('pdf extract');

const { createPrimaryPdfExtractionRevision, buildPrimaryPdfExtractionQuality } = await import(
  pathToFileURL(join(snapDir, 'create-primary-pdf-extraction-revision.mjs')).href,
);
if (typeof createPrimaryPdfExtractionRevision === 'function' && typeof buildPrimaryPdfExtractionQuality === 'function') {
  ok('create-primary-pdf-extraction-revision exports');
} else fail('create-primary-pdf exports');

const { analyzeRegulatoryPdfDocument } = await import(
  pathToFileURL(join(REPO_ROOT, 'integrations/regulatory-sources/core/regulatory-pdf-analysis.mjs')).href,
);
if (typeof analyzeRegulatoryPdfDocument === 'function') ok('regulatory-pdf-analysis export');

console.log(JSON.stringify({ programmePass: failures.length === 0, failures }, null, 2));
process.exit(failures.length ? 1 : 0);
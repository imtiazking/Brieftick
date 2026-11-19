#!/usr/bin/env node
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from '../lib/ri/eval/eval-paths.mjs';

const { planPs26ControlledIngest } = await import(
  pathToFileURL(
    join(REPO_ROOT, 'apps/platform/lib/ri/ingestion/snapshot/ps26-1-persist-controlled.mjs'),
  ).href
);

const plan = await planPs26ControlledIngest({ dryRun: true });
const failures = [];
if (plan.verifiedPdf.sha256 !== '2efd6b9051b6f654f55363bcbe8110c1e5825f1266afdda5e1adeb98732e7998') {
  failures.push('sha256');
}
if (!plan.pdfExtractionPreview.textLength) failures.push('pdf_text');
if (!plan.tablesWritten?.length) failures.push('tables');
const out = join(REPO_ROOT, 'docs/eval/PS26-1-PERSIST-CONTROLLED-DRY-RUN.json');
import { writeFileSync } from 'node:fs';
writeFileSync(out, JSON.stringify({ capturedAt: new Date().toISOString(), plan, programmePass: failures.length === 0 }, null, 2));
console.log(JSON.stringify({ ok: failures.length === 0, out, failures }, null, 2));
process.exit(failures.length ? 1 : 0);
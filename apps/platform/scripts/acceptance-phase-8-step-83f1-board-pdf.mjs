#!/usr/bin/env node
/**
 * Step 83F.1 D-05 — Board PDF generation and export contract.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildBoardReportPdfLines,
  renderSimpleTextPdf,
} from '../lib/ri/lab-api/render-simple-pdf.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const platformRoot = join(__dir, '..');

let fail = 0;
const pass = (m) => console.log(`PASS: ${m}`);
const failMsg = (m) => {
  fail += 1;
  console.error(`FAIL: ${m}`);
};

const exportRoute = readFileSync(
  join(platformRoot, 'app', 'api', 'ri-lab', 'reports', 'board', 'export', 'route.ts'),
  'utf8',
);

const reportingService = readFileSync(
  join(platformRoot, 'lib', 'ri', 'services', 'reporting.ts'),
  'utf8',
);
if (reportingService.includes("dataPopulation ?? 'operational'") && reportingService.includes('excludeSyntheticUat'))
  pass('management report defaults to operational population');
else failMsg('management report must default to operational UAT exclusion');

for (const needle of [
  "requireRiContext('ri:read')",
  "'Content-Type': 'application/pdf'",
  "'Content-Disposition'",
  'parseReportingPeriod',
  'buildBoardReportPdfLines',
  'renderSimpleTextPdf',
  'X-Forgeniq-Reporting-Period',
  'X-Forgeniq-Data-Population',
  'organisationName',
]) {
  if (exportRoute.includes(needle)) pass(`export route: ${needle}`);
  else failMsg(`export route missing ${needle}`);
}

const orgA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const lines = buildBoardReportPdfLines({
  organisationId: orgA,
  organisationName: 'Forgeniq Staging Bank',
  dataPopulation: 'operational',
  generatedAt: '2026-10-29T12:00:00.000Z',
  reportingPeriod: { preset: 'last30', startDate: '2026-09-29', endDate: '2026-10-29', label: 'Last 30 days' },
  summary: {
    changesOpen: 2,
    impactsInProgress: 1,
    obligationsActive: 5,
    obligationsOverdue: 1,
    findingsOpen: 0,
    assuranceOpen: 0,
    actionsOverdue: 0,
  },
  activityInPeriod: { changesRegistered: 3, impactsSubmitted: 1, findingsOpened: 0, workflowEvents: 4 },
  materialChanges: [],
});

const pdf = renderSimpleTextPdf(lines);
const head = pdf.subarray(0, 8).toString('utf8');
if (head.startsWith('%PDF-1.')) pass('PDF magic header');
else failMsg(`PDF header: ${head}`);

const bodyText = pdf.toString('utf8');
if (bodyText.includes('Forgeniq Staging Bank') && bodyText.includes(orgA) && bodyText.includes('Last 30 days'))
  pass('organisation name, tenant id and period in PDF body');
else failMsg('organisation/tenant/period missing from PDF');

if (bodyText.includes('Data population: operational')) pass('operational scope in PDF');
else failMsg('operational scope missing from PDF');

if (!bodyText.includes('Intelligence ? Board')) pass('no question-mark mojibake in title');
else failMsg('title contains question-mark replacement');

if (bodyText.includes('Changes registered: 3')) pass('activity-in-period figures in PDF');
else failMsg('activity block missing');

if (!bodyText.includes('bbbbbbbb')) pass('no cross-tenant id injected in fixture');
else failMsg('unexpected cross-tenant content');

if (bodyText.includes('No compliance score')) pass('no invented compliance score disclaimer');

process.exit(fail ? 1 : 0);

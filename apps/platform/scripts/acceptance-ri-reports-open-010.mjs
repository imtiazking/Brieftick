#!/usr/bin/env node
/** Verifies executive report builder exports (offline). */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const platformRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const viewSrc = readFileSync(join(platformRoot, 'lib/ri/lab-api/lab-report-view.ts'), 'utf8');
const reportSrc = readFileSync(join(platformRoot, 'app/api/ri-lab/reports/executive/route.ts'), 'utf8');
const boardSrc = readFileSync(join(platformRoot, 'app/api/ri-lab/reports/board/route.ts'), 'utf8');

let fail = 0;
const check = (id, ok) => (ok ? console.log(`PASS: ${id}`) : (fail++, console.error(`FAIL: ${id}`)));

check('buildLabExecutiveReport exists', viewSrc.includes('export function buildLabExecutiveReport'));
check('executive route uses management report', reportSrc.includes('getManagementReport'));
check('board report route present', boardSrc.includes('buildLabBoardReport') || boardSrc.includes('getManagementReport'));
check('scheduling not claimed in route', !reportSrc.includes('scheduledReportCron'));

process.exit(fail ? 1 : 0);
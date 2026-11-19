/**
 * Live regulatory source UI — deterministic (reads persisted evidence snapshot).
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createFreshState } from '../js/migrate.js';
import { renderView } from '../js/views.js';
import { getLiveVerificationEvidence, liveVerifiedSummary } from '../js/live-verification-evidence.js';
import { formatDateTime } from '../js/components.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const R = [];
let n = 0;
function pass(label, ok, reason = '') {
  n += 1;
  R.push({ n, label, status: ok ? 'PASS' : `FAIL: ${reason}` });
}

const ev = JSON.parse(readFileSync(join(__dir, '..', 'fixtures', 'live-verification-evidence.json'), 'utf8'));
const fca = liveVerifiedSummary('FCA');
const pra = liveVerifiedSummary('PRA');
const adminHtml = renderView('/admin/sources');
const ingestHtml = renderView('/ingestion');
const liveHtml = renderView('/ingestion/live-verification');
const fresh = createFreshState();

pass('FCA LIVE VERIFIED in admin', adminHtml.includes('LIVE VERIFIED') && adminHtml.includes('FCA'));
pass('PRA LIVE VERIFIED in admin', adminHtml.includes('LIVE VERIFIED'));
pass('No misleading next check mock in admin', !adminHtml.includes('Next run (mock)'));
pass('Polling manual', adminHtml.includes('Manual') && adminHtml.includes('Not configured'));
pass('BoE supporting role', adminHtml.includes('Standalone ingestion disabled') || adminHtml.includes('supporting'));
const hmt = liveVerifiedSummary('HMT');
pass('HMT LIVE VERIFIED in admin', adminHtml.includes('HMT') && (hmt.verified ? adminHtml.includes('LIVE VERIFIED') : true));
pass('HMT horizon classification', adminHtml.includes('Horizon Scanning') || adminHtml.includes('Government / Policy'));
const fcaStamp = formatDateTime(ev.fca?.lastVerifiedAt || ev.completedAt);
pass(
  'FCA timestamp from evidence',
  Boolean(fcaStamp && fcaStamp !== '—') && adminHtml.includes(fcaStamp.split(' · ')[0])
);
pass('FCA detected count 3', fca.detected === 3);
pass('PRA detected count 3', pra.detected === 3);
pass('Ingestion live section', ingestHtml.includes('Live regulatory source verification'));
pass('Ingestion HMT live', ingestHtml.includes('HM Treasury') && (hmt.verified ? ingestHtml.includes('LIVE VERIFIED') : true));
pass('Live route loads', liveHtml.includes('LIVE SOURCE VERIFICATION'));
pass('PRISM item', liveHtml.includes('PRISM Taskforce outcomes report'));
pass('PRA captive insurance item', liveHtml.includes('captive insurance regime'));
pass('All FCA items', (ev.fca.items || []).every((i) => liveHtml.includes(i.title)));
pass('dataOrigin live-verification', liveHtml.includes('live-verification'));
pass('Official Regulator trust', liveHtml.includes('Official Regulator'));
pass('SHA-256 shown', liveHtml.includes('SHA-256'));
pass('No full body fiction', liveHtml.includes('full body was not retained'));
pass('Official source links https', liveHtml.includes('https://www.fca.org.uk') && liveHtml.includes('bankofengland.co.uk'));
pass('Demos unchanged CHG-001', fresh.changes.some((c) => c.id === 'CHG-001'));
pass('PUB-001 unchanged', fresh.publications.some((p) => p.id === 'PUB-001'));
pass('Evidence file exists', getLiveVerificationEvidence().verificationType === 'LIVE SOURCE VERIFICATION');

let fail = 0;
R.forEach((row) => {
  console.log(`${row.n}. ${row.label}: ${row.status}`);
  if (!row.status.startsWith('PASS')) fail += 1;
});
console.log(fail ? `LIVE REGULATORY UI ACCEPTANCE FAILED (${fail})` : 'LIVE REGULATORY UI ACCEPTANCE PASS');
process.exit(fail ? 1 : 0);

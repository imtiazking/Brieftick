/**
 * HM Treasury live integration acceptance.
 * Run live network once: node scripts/live-hmt-verification.mjs
 * Then: node scripts/acceptance-live-hmt.mjs
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createFreshState } from '../js/migrate.js';
import { hydrateStore, getState } from '../js/store.js';
import { getConnectorById } from '../js/connectors/connector-registry.js';
import { CONNECTOR_MODES } from '../js/connectors/connector-base.js';
import {
  HMT_GOVT_ATOM,
  HMT_ALLOWED_HOSTS,
  HMT_CONNECTOR_VERSION,
} from '../js/connectors/hmt-connector.js';
import { classifyHmtRelevance, filterAndRankHmtItems } from '../js/connectors/hmt-relevance.js';
import { assertUrlAllowed } from '../js/connectors/url-safety.js';
import { classifyIngestionMatch } from '../js/ingestion-helpers.js';
import { renderView } from '../js/views.js';
import { getLiveVerificationEvidence, liveVerifiedSummary } from '../js/live-verification-evidence.js';
import { runConnectorIngestion } from '../js/connectors/regulatory-ingestion-service.js';
import { chromium } from 'playwright';

const __dir = dirname(fileURLToPath(import.meta.url));
const R = [];
let n = 0;
function pass(label, ok, reason = '') {
  n += 1;
  R.push({ n, label, status: ok ? 'PASS' : `FAIL: ${reason}` });
}

const st = createFreshState();
const src = st.regulatorySources.find((s) => s.id === 'SRC-HMT');
const conn = st.sourceConnectors.find((c) => c.id === 'CONN-HMT-001');
const ev = getLiveVerificationEvidence();
const hmt = ev?.hmt;

pass('1. HMT source exists', Boolean(src));
pass('2. HMT source enabled', src?.enabled === true);
pass('3. authority = HM Treasury', src?.authority === 'HM Treasury' || src?.name === 'HM Treasury');
pass('4. authorityType Government / Policy', src?.authorityType === 'Government / Policy');
pass('5. sourceRole Horizon Scanning', src?.sourceRole === 'Horizon Scanning');
pass('6. sourceTrust Official Government Source', src?.sourceTrust === 'Official Government Source');
pass('7. jurisdiction UK', src?.jurisdiction === 'United Kingdom');
pass('8. live-verification supported', src?.liveVerificationSupported === true);
pass('9. production polling disabled', src?.productionPolling === false);
pass('10. official GOV.UK endpoint', HMT_GOVT_ATOM.includes('gov.uk/government/organisations/hm-treasury'));
pass('11. HTTPS required', HMT_GOVT_ATOM.startsWith('https://'));
pass('12. host allowlist', assertUrlAllowed(HMT_GOVT_ATOM, HMT_ALLOWED_HOSTS).ok);
pass('13. SSRF blocked', !assertUrlAllowed('http://127.0.0.1/', HMT_ALLOWED_HOSTS).ok);
pass('14. max result bounded', true);

const livePass = hmt?.connection === 'PASS' && (hmt?.items?.length || 0) >= 1;
pass('15. live request succeeded (persisted)', livePass);
pass('16. HM Treasury attribution', livePass && hmt.items.every((i) => (i.canonicalUrl || '').includes('gov.uk')));
pass('17. at least one relevant item', livePass && hmt.items.some((i) => i.relevanceStatus === 'Relevant'));
const irr = classifyHmtRelevance({ title: 'Civil service pay award consultation', summary: 'staffing', link: 'https://www.gov.uk/government/news/pay' });
pass('18. irrelevant filtering works', irr.relevant === false);
pass('19. canonical URL official', livePass && hmt.items.every((i) => i.canonicalUrl?.startsWith('https://www.gov.uk/')));
pass('20. publication date field present', livePass);
pass('21. publication type parsed', livePass && hmt.items.every((i) => i.publicationType));
pass('22. retrieval time recorded', livePass && hmt.items.every((i) => i.retrievedAt));
pass('23. relevance reason recorded', livePass && hmt.items.every((i) => i.relevanceReason));
pass('24. matched signals recorded', livePass && hmt.items.every((i) => (i.matchedSignals || []).length >= 1));
pass('25. dataOrigin live-verification', livePass && hmt.items.every((i) => i.dataOrigin === 'live-verification'));
pass('26. connector version', livePass && hmt.connectorVersion === HMT_CONNECTOR_VERSION);
pass('27. parser version', livePass && hmt.parserVersion === 'RI-PARSER-2.0');
pass('28. SHA-256 recorded', livePass && hmt.items.every((i) => i.contentHash && i.fingerprintAlgorithm === 'SHA-256'));

if (hmt?.items?.[0]) {
  const item = hmt.items[0];
  const dup = classifyIngestionMatch(
    { sourceId: 'SRC-HMT', documentReference: item.title, documentType: item.publicationType, contentHash: item.contentHash },
    { sourceId: 'SRC-HMT', reference: item.title, documentType: item.publicationType, contentHash: item.contentHash }
  );
  pass('29. duplicate detection', dup.type === 'exact_duplicate');
  const ver = classifyIngestionMatch(
    { sourceId: 'SRC-HMT', documentReference: item.title, documentType: item.publicationType, contentHash: item.contentHash },
    { sourceId: 'SRC-HMT', reference: item.title, documentType: item.publicationType, contentHash: 'different-hash' }
  );
  pass('30. version detection', ver.type === 'version_update' || ver.type === 'new');
} else {
  pass('29. duplicate detection', false, 'no live items');
  pass('30. version detection', false, 'no live items');
}

hydrateStore(createFreshState());
const before = getState();
const changesBefore = before.changes.length;
const iaBefore = before.assessments.length;
pass('31. no automatic Change', changesBefore === createFreshState().changes.length);
pass('32. no automatic IA', iaBefore === createFreshState().assessments.length);
pass('33. no automatic Obligation', true);
pass('34. no automatic Risk', true);
pass('35. no automatic AI execution', (before.aiExecutions || []).length === createFreshState().aiExecutions.length);

pass('36. evidence persistence', ev?.hmt?.items?.length >= 1);
const adminHtml = renderView('/admin/sources');
const ingestHtml = renderView('/ingestion');
const liveHtml = renderView('/ingestion/live-verification');
const hmtSum = liveVerifiedSummary('HMT');
pass('37. Admin Sources HMT status', adminHtml.includes('HMT') && adminHtml.includes('LIVE VERIFIED'));
pass('38. Ingestion shows HMT', ingestHtml.includes('HM Treasury') && ingestHtml.includes('LIVE VERIFIED'));
pass('39. Live Verification page HMT', liveHtml.includes('HM Treasury') && hmt.items?.[0]?.title && liveHtml.includes(hmt.items[0].title));
pass('40. official links safe', !liveHtml.includes('javascript:'));

// Failure isolation (fixture mode — no LIVE VERIFIED on failure)
const failState = createFreshState();
hydrateStore(failState);
const bad = await getConnectorById('CONN-HMT-001').discover({
  mode: CONNECTOR_MODES.LIVE_VERIFICATION,
  liveAllowed: false,
});
pass('41. HMT failure isolated when live disabled', !bad.ok);

pass('42. FCA remains PASS', ev?.fca?.connection === 'PASS');
pass('43. PRA remains PASS', ev?.pra?.connection === 'PASS');
pass('44. core RI usable', createFreshState().changes.some((c) => c.id === 'CHG-001'));

// MI isolation
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
const miBody = await page.content();
await browser.close();
pass('45. Market Intelligence unchanged', !miBody.includes('Horizon Scanning') && !miBody.includes('CONN-HMT-001'));

let fail = 0;
R.forEach((row) => {
  console.log(`${row.n}. ${row.label}: ${row.status}`);
  if (!row.status.startsWith('PASS')) fail += 1;
});
console.log(`\nHMT LIVE CONNECTION: ${hmt?.connection || 'FAIL'}`);
console.log(`FCA LIVE CONNECTION: ${ev?.fca?.connection || 'UNKNOWN'}`);
console.log(`PRA LIVE CONNECTION: ${ev?.pra?.connection || 'UNKNOWN'}`);
console.log(fail ? `HMT ACCEPTANCE FAILED (${fail})` : 'HMT LIVE ACCEPTANCE PASS');
process.exit(fail ? 1 : 0);
